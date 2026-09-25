#!/usr/bin/env python3
"""Fail-closed rights evidence audit for an exact NGC extended-audio manifest.

This is deliberately an evidence collector and policy gate, not legal advice
or a downloader.  It reads a pre-existing NGC manifest, requests only the
official HTML/JSON metadata endpoints needed to re-bind its source records,
and writes a path-safe R&D report.  It never requests the WAV download URL,
copies audio, trains a model, or changes game assets.

The current KOGL site distinguishes a general Type-1 mark from its newer AI
type.  Therefore the gate treats commercial use and transformation under an
observed Type-1 mark separately from ML training: absent an AI-type mark (or
an equivalent written, collection-specific confirmation), ML remains blocked.
"""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import http.cookiejar
import json
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
from typing import Any, Mapping, Sequence
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import HTTPRedirectHandler, HTTPCookieProcessor, Request, build_opener, urlopen


SCHEMA = "durango.ngc-rights-audit.v1"
MANIFEST_SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"
REPORT_FILENAME = "ngc_rights_audit.json"

NGC_ORIGIN = "https://www.gugak.go.kr"
NGC_HOST = "www.gugak.go.kr"
CATALOG_PAGE = "/digitaleum/front/extend/list.do"
INSTRUMENT_LIST = "/digitaleum/front/extend/getInstrumentList.do"
FILE_LIST = "/digitaleum/front/extend/getFileList.do"
FILE_INFO = "/digitaleum/front/extend/getFileInfo.do"
DOWNLOAD = "/digitaleum/cmmn/file/extend/download.do"
KOGL_LICENSE = "https://www.kogl.or.kr/info/license.do"
NGC_SERVICE_NOTICE = (
    "https://www.gugak.go.kr/site/program/board/basicboard/view?"
    "boardid=42216&boardtypeid=60&lang=ko&menuid=001005006002&pagesize=10"
)

DAEGEUM_CODE = "EXTEND0001"
DAEGEUM_NAME = "대금"
SANJO_DIVISION = "대금산조"
TYPE1_NOTICE = "공공누리 제1유형(출처표시)"
MAX_RESPONSE_BYTES = 16 * 1024 * 1024
_SHA256 = re.compile(r"[0-9a-f]{64}")


class RightsAuditError(RuntimeError):
    """The narrow rights evidence could not be verified safely."""


class _SameNGCRedirect(HTTPRedirectHandler):
    """Keep NGC catalogue requests on the single expected HTTPS host."""

    def redirect_request(self, req: Request, fp: Any, code: int, msg: str,
                         headers: Mapping[str, str], newurl: str) -> Request | None:
        parsed = urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname != NGC_HOST:
            raise RightsAuditError("NGC metadata request redirected outside the official HTTPS host")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _hash(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _canonical_json(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise RightsAuditError(f"{label} must be an object")
    return value


def _string(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or not value:
        raise RightsAuditError(f"{label} must be non-empty text")
    return value


def _integer(value: Any, *, label: str) -> int:
    if isinstance(value, bool):
        raise RightsAuditError(f"{label} must be an integer")
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise RightsAuditError(f"{label} must be an integer") from exc
    if parsed < 1:
        raise RightsAuditError(f"{label} must be positive")
    return parsed


def _ngc_url(path: str) -> str:
    if not path.startswith("/digitaleum/") or "?" in path or "#" in path or ";" in path:
        raise RightsAuditError("unexpected NGC route")
    return NGC_ORIGIN + path


def _safe_server_wav_path(value: Any, *, label: str) -> str:
    path = _string(value, label=label)
    parsed = PurePosixPath(path)
    if not parsed.is_absolute() or ".." in parsed.parts or "\\" in path or parsed.suffix.lower() != ".wav":
        raise RightsAuditError(f"{label} is not a safe NGC WAV server path")
    return path


def _read_json(path: Path) -> Mapping[str, Any]:
    try:
        result = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RightsAuditError("manifest does not exist") from exc
    except json.JSONDecodeError as exc:
        raise RightsAuditError("manifest is not valid JSON") from exc
    return _mapping(result, label="manifest")


def _manifest_sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _license_receipt(value: Any) -> dict[str, Any]:
    receipt = _mapping(value, label="manifest.license_evidence")
    if receipt.get("notice") != TYPE1_NOTICE:
        raise RightsAuditError("manifest does not carry the expected KOGL Type-1 notice")
    if receipt.get("status") != "catalog_page_declares_kogl_type_1_attribution":
        raise RightsAuditError("manifest license receipt is not an NGC Type-1 catalogue receipt")
    catalog_url = _string(receipt.get("catalog_page_url"), label="manifest.license_evidence.catalog_page_url")
    if catalog_url != _ngc_url(CATALOG_PAGE):
        raise RightsAuditError("manifest license receipt points to another catalogue")
    sha = _string(receipt.get("catalog_page_sha256"), label="manifest.license_evidence.catalog_page_sha256")
    if _SHA256.fullmatch(sha) is None:
        raise RightsAuditError("manifest license receipt SHA-256 is malformed")
    return {
        "catalog_page_url": catalog_url,
        "catalog_page_sha256": sha,
        "observed_at_utc": _string(receipt.get("observed_at_utc"), label="manifest.license_evidence.observed_at_utc"),
        "notice": TYPE1_NOTICE,
        "not_a_model_training_or_game_distribution_clearance": bool(
            receipt.get("not_a_model_training_or_game_distribution_clearance")
        ),
    }


def _submitted_purpose(value: Any) -> dict[str, Any]:
    purpose = _mapping(value, label="manifest.submitted_purpose")
    return {
        "usePurposeGb": _string(purpose.get("usePurposeGb"), label="manifest.submitted_purpose.usePurposeGb"),
        "usePurpose": _string(purpose.get("usePurpose"), label="manifest.submitted_purpose.usePurpose"),
        "usePurposeDtl_is_blank": purpose.get("usePurposeDtl") == "",
        "companyName_value_persisted": bool(_mapping(purpose.get("companyName"), label="manifest.submitted_purpose.companyName").get("value_persisted")),
        "no_credentials_or_cookie_file_used": purpose.get("no_credentials_or_cookie_file_used") is True,
    }


def inspect_controlled_manifest(path: str | Path, *, expected_count: int = 192) -> dict[str, Any]:
    """Verify exactly the path-safe facts binding a controlled NGC batch."""

    manifest_path = Path(path).expanduser().resolve()
    manifest = _read_json(manifest_path)
    if manifest.get("schema") != MANIFEST_SCHEMA:
        raise RightsAuditError(f"manifest.schema must be {MANIFEST_SCHEMA}")
    entries = manifest.get("entries")
    if not isinstance(entries, list) or len(entries) != expected_count:
        raise RightsAuditError(f"manifest must contain exactly {expected_count} entries")

    sequence_rows: list[dict[str, Any]] = []
    downloaded = 0
    for index, raw_entry in enumerate(entries):
        entry = _mapping(raw_entry, label=f"manifest.entries[{index}]")
        sequence = _integer(entry.get("extend_seq"), label=f"manifest.entries[{index}].extend_seq")
        selection = _mapping(entry.get("selection"), label=f"manifest.entries[{index}].selection")
        if (
            selection.get("instrument_code") != DAEGEUM_CODE
            or selection.get("instrument_name") != DAEGEUM_NAME
            or selection.get("division_exact") != SANJO_DIVISION
            or selection.get("selection_is_exact_metadata_filter_not_title_match") is not True
        ):
            raise RightsAuditError("manifest has an entry outside the exact Daegeum Sanjo scope")
        source = _mapping(entry.get("source"), label=f"manifest.entries[{index}].source")
        expected_routes = {
            "catalog_url": _ngc_url(FILE_LIST),
            "file_info_url": _ngc_url(FILE_INFO),
            "download_url": _ngc_url(DOWNLOAD),
        }
        if any(source.get(key) != expected for key, expected in expected_routes.items()):
            raise RightsAuditError("manifest source endpoint does not match the audited NGC extended route")
        if _integer(source.get("source_sequence"), label="manifest source_sequence") != sequence:
            raise RightsAuditError("manifest source sequence does not match its entry")
        catalog = _mapping(entry.get("catalog_record"), label="manifest catalog_record")
        detail = _mapping(entry.get("file_info_record"), label="manifest file_info_record")
        if _integer(catalog.get("extendSeq"), label="manifest catalog extendSeq") != sequence:
            raise RightsAuditError("manifest catalogue record sequence mismatch")
        if _integer(detail.get("extend_seq"), label="manifest detail extend_seq") != sequence:
            raise RightsAuditError("manifest detail record sequence mismatch")
        if (
            catalog.get("instrCd") != DAEGEUM_CODE
            or catalog.get("instrDivCd") != "INDV0001"
            or catalog.get("division") != SANJO_DIVISION
            or detail.get("instr_cd") != DAEGEUM_CODE
            or detail.get("instr_name") != DAEGEUM_NAME
            or detail.get("division") != SANJO_DIVISION
        ):
            raise RightsAuditError("manifest catalogue/detail identity is not exact Daegeum Sanjo")
        wav_path = _safe_server_wav_path(catalog.get("wavFilePath"), label="manifest catalog wavFilePath")
        if _safe_server_wav_path(detail.get("wav_file_path"), label="manifest detail wav_file_path") != wav_path:
            raise RightsAuditError("manifest catalogue/detail WAV source path mismatch")
        if source.get("original_wav_server_path") != wav_path or source.get("original_wav_filename") != PurePosixPath(wav_path).name:
            raise RightsAuditError("manifest source receipt does not bind to its catalogue WAV path")
        download = _mapping(entry.get("download"), label="manifest download")
        if download.get("state") == "downloaded":
            sha = _string(download.get("sha256"), label="manifest download sha256")
            if _SHA256.fullmatch(sha) is None:
                raise RightsAuditError("manifest download SHA-256 is malformed")
            downloaded += 1
        sequence_rows.append({
            "extendSeq": sequence,
            "wavFilePath": wav_path,
            "mp3FilePath": _string(catalog.get("mp3FilePath"), label="manifest catalog mp3FilePath"),
        })

    sequence_rows.sort(key=lambda row: row["extendSeq"])
    sequences = [row["extendSeq"] for row in sequence_rows]
    if len(set(sequences)) != expected_count or sequences != list(range(sequences[0], sequences[-1] + 1)):
        raise RightsAuditError("controlled manifest must be one contiguous, duplicate-free sequence range")
    if downloaded != expected_count:
        raise RightsAuditError("controlled manifest must attest all selected items as downloaded")

    return {
        "manifest_basename": manifest_path.name,
        "manifest_sha256": _manifest_sha(manifest_path),
        "absolute_manifest_path_recorded": False,
        "schema": MANIFEST_SCHEMA,
        "selected_count": expected_count,
        "all_entries_attest_downloaded": True,
        "extend_sequence": {"first": sequences[0], "last": sequences[-1], "contiguous": True},
        "official_routes": {
            "catalog_page": _ngc_url(CATALOG_PAGE),
            "instrument_list": _ngc_url(INSTRUMENT_LIST),
            "file_list": _ngc_url(FILE_LIST),
            "file_info": _ngc_url(FILE_INFO),
            "download": _ngc_url(DOWNLOAD),
        },
        "selected_catalog_row_sha256": _hash(_canonical_json(sequence_rows)),
        "selected_catalog_rows": sequence_rows,
        "historical_catalog_type1_receipt": _license_receipt(manifest.get("license_evidence")),
        "historical_submitted_purpose": _submitted_purpose(manifest.get("submitted_purpose")),
    }


class OfficialClient:
    """Ephemeral-cookie, metadata-only client for documented official pages."""

    def __init__(self, timeout_seconds: float = 45.0) -> None:
        if timeout_seconds <= 0:
            raise RightsAuditError("timeout must be positive")
        self.timeout_seconds = timeout_seconds
        self._opener = build_opener(
            _SameNGCRedirect(), HTTPCookieProcessor(http.cookiejar.CookieJar())
        )

    @staticmethod
    def _headers() -> dict[str, str]:
        return {
            "Accept": "application/json, text/html;q=0.9, */*;q=0.1",
            "User-Agent": "Durango-NGC-rights-audit/1.0 (metadata-only local R&D; no credentials)",
        }

    def _ngc_request(self, path: str, *, form: Mapping[str, str] | None = None) -> tuple[bytes, dict[str, str], int, str]:
        url = _ngc_url(path)
        data = urlencode(form).encode("utf-8") if form is not None else None
        headers = self._headers()
        if form is not None:
            headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            headers["X-Requested-With"] = "XMLHttpRequest"
        request = Request(url, data=data, headers=headers, method="POST" if form is not None else "GET")
        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise RightsAuditError("official NGC metadata response exceeded size limit")
                final_url = response.geturl()
                parsed = urlparse(final_url)
                if parsed.scheme != "https" or parsed.hostname != NGC_HOST:
                    raise RightsAuditError("official NGC metadata response escaped the expected host")
                return body, {str(key): str(value) for key, value in response.headers.items()}, int(response.status), final_url
        except HTTPError as exc:
            raise RightsAuditError(f"official NGC metadata endpoint returned HTTP {exc.code}") from exc
        except URLError as exc:
            raise RightsAuditError("official NGC metadata request failed") from exc

    def ngc_html(self, path: str) -> tuple[bytes, dict[str, str], int, str]:
        return self._ngc_request(path)

    def ngc_json(self, path: str, form: Mapping[str, str]) -> tuple[Mapping[str, Any], dict[str, Any]]:
        body, headers, status, final_url = self._ngc_request(path, form=form)
        if status != 200:
            raise RightsAuditError("official NGC JSON endpoint did not return HTTP 200")
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RightsAuditError("official NGC metadata endpoint did not return JSON") from exc
        return _mapping(decoded, label="official NGC JSON response"), _snapshot(body, headers, status, final_url, form=form)

    def public_html(self, url: str) -> tuple[bytes, dict[str, str], int, str]:
        parsed = urlparse(url)
        if parsed.scheme != "https" or parsed.hostname not in {"www.kogl.or.kr", NGC_HOST}:
            raise RightsAuditError("unexpected official public evidence URL")
        request = Request(url, headers=self._headers(), method="GET")
        try:
            with urlopen(request, timeout=self.timeout_seconds) as response:
                body = response.read(MAX_RESPONSE_BYTES + 1)
                if len(body) > MAX_RESPONSE_BYTES:
                    raise RightsAuditError("official evidence response exceeded size limit")
                final_url = response.geturl()
                final = urlparse(final_url)
                if final.scheme != "https" or final.hostname not in {"www.kogl.or.kr", NGC_HOST}:
                    raise RightsAuditError("official evidence response redirected outside approved hosts")
                return body, {str(key): str(value) for key, value in response.headers.items()}, int(response.status), final_url
        except HTTPError as exc:
            raise RightsAuditError(f"official evidence endpoint returned HTTP {exc.code}") from exc
        except URLError as exc:
            raise RightsAuditError("official evidence request failed") from exc


def _snapshot(body: bytes, headers: Mapping[str, str], status: int, url: str,
              *, form: Mapping[str, str] | None = None) -> dict[str, Any]:
    """Persist hash and safe request metadata, never full page bodies/cookies."""

    compact_headers = {
        key.lower(): value for key, value in headers.items()
        if key.lower() in {"content-type", "content-length", "etag", "last-modified"}
    }
    result: dict[str, Any] = {
        "url": url,
        "observed_at_utc": _utc_now(),
        "http_status": status,
        "byte_length": len(body),
        "sha256": _hash(body),
        "response_headers": compact_headers,
        "body_not_persisted": True,
    }
    if form is not None:
        result["submitted_form"] = {key: form[key] for key in sorted(form)}
    return result


def _catalog_snapshot_and_binding(client: OfficialClient, controlled: Mapping[str, Any]) -> dict[str, Any]:
    page, headers, status, final_url = client.ngc_html(CATALOG_PAGE)
    text = page.decode("utf-8", errors="replace")
    if status != 200:
        raise RightsAuditError("NGC extended catalogue did not return HTTP 200")
    catalog_snapshot = _snapshot(page, headers, status, final_url)
    catalog_snapshot["markers"] = {
        "type1_mark_image": "img_opentype01" in text,
        "type1_notice_text": TYPE1_NOTICE in text,
        "ai_type_mark_or_ai_training_text": (
            "mark-ai" in text or "인공지능 학습용" in text or "AI유형" in text
        ),
    }

    instruments, instrument_snapshot = client.ngc_json(INSTRUMENT_LIST, {})
    raw_instruments = instruments.get("list")
    if not isinstance(raw_instruments, list):
        raise RightsAuditError("NGC instrument-list response lacks list")
    matching_instruments = [
        row for row in raw_instruments if isinstance(row, Mapping)
        and row.get("instrCd") == DAEGEUM_CODE and row.get("instrName") == DAEGEUM_NAME
    ]
    if len(matching_instruments) != 1:
        raise RightsAuditError("NGC instrument-list does not currently identify EXTEND0001 as Daegeum")

    listed, list_snapshot = client.ngc_json(FILE_LIST, {"instrCd": DAEGEUM_CODE})
    raw_rows = listed.get("list")
    if not isinstance(raw_rows, list) or not all(isinstance(row, Mapping) for row in raw_rows):
        raise RightsAuditError("NGC file-list response lacks an all-object list")
    exact_rows = {
        _integer(row.get("extendSeq"), label="live extendSeq"): row
        for row in raw_rows
        if row.get("instrCd") == DAEGEUM_CODE
        and row.get("instrDivCd") == "INDV0001"
        and row.get("division") == SANJO_DIVISION
    }
    expected_rows = _mapping(controlled, label="controlled").get("selected_catalog_rows")
    if not isinstance(expected_rows, list):
        raise RightsAuditError("controlled report does not carry selected catalogue rows")
    mismatch: list[int] = []
    for expected in expected_rows:
        expected_map = _mapping(expected, label="controlled selected catalogue row")
        sequence = _integer(expected_map.get("extendSeq"), label="controlled extendSeq")
        live = exact_rows.get(sequence)
        if live is None or live.get("wavFilePath") != expected_map.get("wavFilePath") or live.get("mp3FilePath") != expected_map.get("mp3FilePath"):
            mismatch.append(sequence)
    if len(exact_rows) != len(expected_rows) or mismatch:
        raise RightsAuditError("live NGC exact Daegeum-Sanjo catalogue no longer matches controlled 192-file binding")

    # Detail calls cover both range boundaries and the center while the one
    # file-list response binds the full exact sequence/current server paths.
    sequences = [int(row["extendSeq"]) for row in expected_rows]
    probe_sequences = sorted({min(sequences), sequences[len(sequences) // 2], max(sequences)})
    detail_probes: list[dict[str, Any]] = []
    expected_by_sequence = {int(row["extendSeq"]): row for row in expected_rows}
    for sequence in probe_sequences:
        detail, snapshot = client.ngc_json(FILE_INFO, {"extendSeq": str(sequence)})
        expected = _mapping(expected_by_sequence[sequence], label="expected selected row")
        valid = (
            _integer(detail.get("extend_seq"), label="live detail extend_seq") == sequence
            and detail.get("instr_cd") == DAEGEUM_CODE
            and detail.get("instr_name") == DAEGEUM_NAME
            and detail.get("division") == SANJO_DIVISION
            and detail.get("wav_file_path") == expected.get("wavFilePath")
        )
        if not valid:
            raise RightsAuditError("live NGC detail endpoint no longer matches its exact controlled catalogue row")
        detail_probes.append({"extendSeq": sequence, "metadata_matches_controlled_catalog": True, "snapshot": snapshot})

    return {
        "catalog_page": catalog_snapshot,
        "instrument_list": instrument_snapshot,
        "file_list": list_snapshot,
        "live_instrument_identity": {"instrCd": DAEGEUM_CODE, "instrName": DAEGEUM_NAME, "matches": True},
        "live_file_list": {
            "returned_row_count": len(raw_rows),
            "exact_daegeum_sanjo_row_count": len(exact_rows),
            "all_controlled_192_rows_and_server_paths_match": True,
            "controlled_selected_catalog_row_sha256": controlled["selected_catalog_row_sha256"],
        },
        "representative_file_info_probes": detail_probes,
    }


def _official_terms(client: OfficialClient) -> dict[str, Any]:
    kogl_body, kogl_headers, kogl_status, kogl_url = client.public_html(KOGL_LICENSE)
    if kogl_status != 200:
        raise RightsAuditError("KOGL licence page did not return HTTP 200")
    kogl_text = kogl_body.decode("utf-8", errors="replace")
    terms = _snapshot(kogl_body, kogl_headers, kogl_status, kogl_url)
    terms["observed_statements"] = {
        "type1_commercial_use": "상업적, 비상업적 이용가능" in kogl_text,
        "type1_derivative_work": "변형 등 2차적 저작물 작성 가능" in kogl_text,
        "type1_attribution": "출처표시" in kogl_text,
        "ai_type_exists": "AI유형 : 인공지능 학습용" in kogl_text,
        "ai_type_must_be_shown_with_existing_type": (
            "AI유형 선택 시 기존 공공누리 유형과 함께 표시" in kogl_text
        ),
        "ai_type_is_specific_to_training_data": "인공지능 학습용 데이터" in kogl_text,
        "ai_model_commercial_use_statement": "공공저작물을 학습한 인공지능 모델의 상업적 이용은 가능" in kogl_text,
        "additional_ip_rights_may_need_separate_permission": "별도의 이용허락" in kogl_text,
    }
    service_body, service_headers, service_status, service_url = client.public_html(NGC_SERVICE_NOTICE)
    if service_status != 200:
        raise RightsAuditError("NGC digital-audio service notice did not return HTTP 200")
    service_text = service_body.decode("utf-8", errors="replace")
    service = _snapshot(service_body, service_headers, service_status, service_url)
    service["observed_statements"] = {
        "describes_digital_instrument_audio_service": "국악기 디지털 음원" in service_text,
        "states_wave_files_and_attribution_based_use": ("wave 파일" in service_text and "출처표시" in service_text),
        "states_type1_attribution_free_use": "공공누리 제1유형에 따라 이용자는 출처표시 후 자유롭게 이용 가능" in service_text,
        "mentions_rights_holder_disclosure_consent_for_phrase_audio": ("저작권 공개를 동의" in service_text),
    }
    return {"kogl_type_and_ai_terms": terms, "ngc_service_notice": service}


def fail_closed_decision(*, catalog_markers: Mapping[str, Any], terms: Mapping[str, Any],
                         historical_purpose: Mapping[str, Any]) -> dict[str, Any]:
    """State a narrow policy result without treating it as legal advice."""

    type1 = bool(catalog_markers.get("type1_mark_image")) and bool(catalog_markers.get("type1_notice_text"))
    statements = _mapping(terms.get("observed_statements"), label="KOGL observed statements")
    type1_terms = (
        statements.get("type1_commercial_use") is True
        and statements.get("type1_derivative_work") is True
        and statements.get("type1_attribution") is True
    )
    ai_criteria = (
        statements.get("ai_type_exists") is True
        and statements.get("ai_type_must_be_shown_with_existing_type") is True
        and statements.get("ai_type_is_specific_to_training_data") is True
    )
    submitted_as_noncommercial_research = (
        historical_purpose.get("usePurposeGb") == "비상업용"
        and historical_purpose.get("usePurpose") == "연구용"
    )
    if not type1 or not type1_terms or not ai_criteria:
        raise RightsAuditError("official licence evidence is incomplete; all downstream uses remain fail-closed")

    ai_mark_present = catalog_markers.get("ai_type_mark_or_ai_training_text") is True
    return {
        "policy_basis": "observed_current_NGC_Type1_mark_plus_current_KOGL_terms; not legal advice",
        "historical_download_submission": {
            "submitted_as_noncommercial_internal_research": submitted_as_noncommercial_research,
            "does_not_rewrite_the_recorded_submission_purpose": True,
        },
        "download": {
            "status": "EXPLICITLY_OFFERED_BY_NGC_EXTENDED_CATALOG",
            "conditions": ["use the official endpoint/UI flow", "retain source attribution"],
        },
        "sample_transformation_or_non_ml_derivative_synthesis": {
            "status": "CONDITIONALLY_PERMITTED_BY_OBSERVED_TYPE1",
            "conditions": [
                "source attribution", "respect moral rights", "do not imply NGC endorsement",
                "review any rights beyond the public-institution copyright",
            ],
        },
        "commercial_game_inclusion_of_non_ml_type1_derivative": {
            "status": "CONDITIONALLY_PERMITTED_BY_OBSERVED_TYPE1",
            "conditions": [
                "source attribution in a practical game credit/notice surface",
                "respect moral rights and no-endorsement condition",
                "this conclusion does not cover an ML-trained model or its outputs",
            ],
        },
        "ml_training_or_ml_derived_game_audio": {
            "status": "BLOCKED_FAIL_CLOSED",
            "reason": (
                "KOGL currently says AI-type works are the works that may be used as AI training data, "
                "and that an institution shows the AI type together with its existing type. "
                "The exact NGC extended catalog currently presents Type 1 but no AI-type/training mark."
            ),
            "required_before_unblocking": [
                "an explicit, collection-specific written NGC/rightsholder confirmation covering ML training and intended commercial game outputs, or",
                "a refreshed exact catalog/item display that visibly carries the applicable AI type plus review of all its conditions",
            ],
        },
        "no_training_or_shipping_authorized_by_this_report": True,
        "additional_rights_caveat": (
            "KOGL notes that rights beyond the public institution's copyright may require separate permission; "
            "this metadata-only audit does not resolve such rights."
        ),
    }


def write_report(*, manifest: str | Path, output_dir: str | Path,
                 expected_count: int = 192, timeout_seconds: float = 45.0) -> dict[str, Any]:
    """Collect fresh official evidence and write one new ignored R&D report."""

    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise RightsAuditError("--output-dir must be fresh; refusing to overwrite an R&D report")
    controlled = inspect_controlled_manifest(manifest, expected_count=expected_count)
    client = OfficialClient(timeout_seconds=timeout_seconds)
    current = _catalog_snapshot_and_binding(client, controlled)
    terms = _official_terms(client)
    decision = fail_closed_decision(
        catalog_markers=_mapping(current["catalog_page"], label="current catalog page")["markers"],
        terms=_mapping(terms["kogl_type_and_ai_terms"], label="KOGL terms"),
        historical_purpose=_mapping(controlled["historical_submitted_purpose"], label="historical purpose"),
    )
    report = {
        "schema": SCHEMA,
        "artifact_kind": "metadata_only_ngc_extended_daegeum_rights_audit",
        "created_at_utc": _utc_now(),
        "controlled_manifest_binding": {
            key: value for key, value in controlled.items() if key != "selected_catalog_rows"
        },
        "current_official_ngc_metadata": current,
        "official_terms": terms,
        "fail_closed_rights_decision": decision,
        "scope_guards": {
            "no_audio_download_requested": True,
            "no_audio_copied_or_modified": True,
            "no_model_training_or_inference": True,
            "no_default_bgm_or_runtime_asset_touched": True,
            "no_absolute_local_path_persisted": True,
        },
    }
    output.mkdir(parents=True, exist_ok=False)
    destination = output / REPORT_FILENAME
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=output, prefix=".rights-", suffix=".json", delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        stream.flush()
    temporary.replace(destination)
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="existing exact NGC extended-Daegeum manifest")
    parser.add_argument("--output-dir", required=True, help="fresh ignored R&D report directory")
    parser.add_argument("--expected-count", type=int, default=192)
    parser.add_argument("--timeout-seconds", type=float, default=45.0)
    parser.add_argument("--confirm-rnd-only", action="store_true", help="required acknowledgement: this is not a permission to train or ship")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("ngc_rights_audit: pass --confirm-rnd-only", file=sys.stderr)
        return 2
    try:
        report = write_report(
            manifest=args.manifest,
            output_dir=args.output_dir,
            expected_count=args.expected_count,
            timeout_seconds=args.timeout_seconds,
        )
    except RightsAuditError as exc:
        print(f"ngc_rights_audit: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "report": REPORT_FILENAME,
        "selected_count": report["controlled_manifest_binding"]["selected_count"],
        "ml_status": report["fail_closed_rights_decision"]["ml_training_or_ml_derived_game_audio"]["status"],
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
