#!/usr/bin/env python3
"""Fetch a *small, explicit* NGC extended-Daegeum Sanjo R&D batch safely.

This tool is intentionally not a scraper and has no ``--all`` switch.  The
National Gugak Center's ``확장 다운로드`` catalog currently exposes 375 Daegeum
records, of which an exact server-side metadata filter finds 192 rows whose
instrument code/name and division are ``EXTEND0001`` / ``대금`` / ``대금산조``.
Those 192 records are a discovery result, not an authorization to download
them all.

Each invocation must name exact ``--extend-seq`` values.  The default is a
read-only plan: it asks the official catalog for current metadata and writes
an auditable manifest, but downloads no audio.  ``--download`` must be given
separately, and more than one item additionally needs ``--allow-batch``.

The only purpose fields submitted by default are the truthful local-R&D
values ``비상업용`` / ``연구용``.  No account, API key, cookie file, fabricated
organization, or hidden identifier is used.  The official browser UI displays
an organization field; the server accepted an empty value in a 2026-09-24
one-item protocol probe.  This tool therefore sends an empty ``companyName``
unless the caller explicitly supplies ``--organization``.  The value of a
non-empty organization is deliberately *not* persisted in the manifest.

The output is R&D evidence only.  It does not label audio as legato, does not
approve a transition, does not train a model, and never changes game assets.

Examples (the first command downloads nothing):

    python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
      --output-dir _bgm_rnd/ngc-extended-daegeum-plan --extend-seq 1520

    python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
      --output-dir _bgm_rnd/ngc-extended-daegeum-plan --extend-seq 1520 \
      --download

    python3 tools/daegeum-transitions/fetch_ngc_extended_daegeum.py \
      --output-dir _bgm_rnd/ngc-extended-daegeum-plan --verify-only
"""

from __future__ import annotations

import argparse
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path, PurePosixPath, PureWindowsPath
import re
import sys
import tempfile
import time
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, unquote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import NativeWavError, inspect_wav  # noqa: E402


SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"
TOOL_ID = "ngc-extended-daegeum-sanjo-fetch"
OFFICIAL_ORIGIN = "https://www.gugak.go.kr"
OFFICIAL_HOST = "www.gugak.go.kr"
CATALOG_PAGE_PATH = "/digitaleum/front/extend/list.do"
INSTRUMENT_LIST_PATH = "/digitaleum/front/extend/getInstrumentList.do"
FILE_LIST_PATH = "/digitaleum/front/extend/getFileList.do"
FILE_INFO_PATH = "/digitaleum/front/extend/getFileInfo.do"
DOWNLOAD_PATH = "/digitaleum/cmmn/file/extend/download.do"
KOGL_NOTICE = "공공누리 제1유형(출처표시)"
KOGL_NOTICE_URL = "http://www.kogl.or.kr/open/info/license_info/by.do"

DAEGEUM_INSTRUMENT_CODE = "EXTEND0001"
DAEGEUM_INSTRUMENT_NAME = "대금"
SANJO_DIVISION = "대금산조"
MAX_EXPLICIT_ITEMS = 30  # The official UI's documented selection ceiling.
MAX_RESPONSE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 2 * 1024 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 45.0
MANIFEST_NAME = "ngc-extended-daegeum-sanjo.manifest.json"
RELATIVE_AUDIO_DIRECTORY = "audio"


class FetchError(RuntimeError):
    """Stop before a source can be mistaken for a verified R&D input."""


class SameOriginRedirectHandler(HTTPRedirectHandler):
    """Permit only HTTPS redirects that remain on the official NGC host."""

    def redirect_request(self, req: Request, fp: Any, code: int, msg: str,
                         headers: Mapping[str, str], newurl: str) -> Optional[Request]:
        parsed = urlparse(newurl)
        if parsed.scheme != "https" or parsed.hostname != OFFICIAL_HOST:
            raise FetchError("NGC request attempted a redirect outside the official HTTPS origin")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _utc_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _canonical_url(path: str) -> str:
    """Create one canonical, non-session-bearing official endpoint URL."""

    if not path.startswith("/digitaleum/") or ";" in path or "?" in path or "#" in path:
        raise FetchError("unexpected NGC endpoint path")
    return OFFICIAL_ORIGIN + path


def _safe_relative_path(value: str) -> str:
    """Allow only a portable path rooted inside the explicit output directory."""

    if not isinstance(value, str) or not value or value.startswith(("/", "~")):
        raise FetchError("manifest contains an unsafe relative path")
    if "\\" in value or "//" in value:
        raise FetchError("manifest contains a non-portable relative path")
    parts = PurePosixPath(value).parts
    if any(part in ("", ".", "..") for part in parts):
        raise FetchError("manifest contains a traversal path")
    return value


def _resolve_under(root: Path, relative: str) -> Path:
    safe = _safe_relative_path(relative)
    candidate = (root / safe).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise FetchError("manifest audio path escapes the explicit output directory") from exc
    return candidate


def _safe_filename(value: str) -> str:
    """Reject a server filename if it could influence the output directory."""

    if not value or len(value) > 240:
        raise FetchError("NGC returned an unsafe empty or overlong filename")
    posix_name = PurePosixPath(value).name
    windows_name = PureWindowsPath(value).name
    if posix_name != value or windows_name != value or value in (".", ".."):
        raise FetchError("NGC returned a path-like filename")
    if not value.lower().endswith(".wav"):
        raise FetchError("NGC returned a file that is not a WAV")
    return value


def _filename_from_header(content_disposition: str) -> str:
    """Parse an RFC 5987-ish download filename without trusting its path."""

    if not content_disposition:
        raise FetchError("NGC download did not include Content-Disposition filename evidence")
    extended = re.search(r"filename\*\s*=\s*([^']*)''([^;]+)", content_disposition, re.I)
    if extended:
        charset = extended.group(1).strip().lower()
        if charset not in ("utf-8", "utf8"):
            raise FetchError("NGC download filename used an unsupported charset")
        return _safe_filename(unquote(extended.group(2).strip().strip('"')))
    plain = re.search(r"filename\s*=\s*(?:\"([^\"]+)\"|([^;\s]+))", content_disposition, re.I)
    if plain:
        return _safe_filename((plain.group(1) or plain.group(2)).strip())
    raise FetchError("NGC download did not include a parseable filename")


def _content_type_is_audio(value: str) -> bool:
    media_type = (value or "").split(";", 1)[0].strip().lower()
    return media_type in {"audio/x-wav", "audio/wav", "audio/wave", "application/octet-stream"}


def _compact_headers(headers: Mapping[str, str]) -> Dict[str, str]:
    """Persist only stable, non-secret response evidence; never cookies."""

    allowed = {"content-type", "content-length", "content-disposition", "etag", "last-modified"}
    compact: Dict[str, str] = {}
    for key, value in headers.items():
        normalized = key.lower()
        if normalized in allowed and value:
            compact[normalized] = str(value)
    return compact


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n"


def _write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=str(path.parent), prefix=".manifest-", suffix=".json", delete=False
    ) as stream:
        temporary = Path(stream.name)
        stream.write(_json_dumps(value))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(str(temporary), str(path))


def _read_json_object(path: Path) -> Dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise FetchError("existing manifest is not readable JSON") from exc
    if not isinstance(payload, dict):
        raise FetchError("existing manifest must be a JSON object")
    return payload


def _as_int(value: Any, label: str) -> int:
    if isinstance(value, bool):
        raise FetchError(f"NGC {label} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise FetchError(f"NGC {label} must be an integer") from exc
    if result < 1:
        raise FetchError(f"NGC {label} must be positive")
    return result


def _require_str(record: Mapping[str, Any], key: str, label: str) -> str:
    value = record.get(key)
    if not isinstance(value, str) or not value:
        raise FetchError(f"NGC {label} is missing or not text")
    return value


def _canonical_server_path(value: str) -> str:
    """Preserve a catalog's original server path only when it is harmless text."""

    if not isinstance(value, str) or not value.startswith("/") or "\\" in value or ".." in PurePosixPath(value).parts:
        raise FetchError("NGC returned an unsafe original WAV path")
    if not value.lower().endswith(".wav"):
        raise FetchError("NGC catalog original path is not a WAV")
    return value


def _license_evidence(page_bytes: bytes) -> Dict[str, Any]:
    """Capture the live catalog-page notice without turning it into legal advice."""

    text = page_bytes.decode("utf-8", errors="replace")
    if "공공누리 제1유형" not in text or "img_opentype01" not in text:
        raise FetchError("official extended catalog no longer shows the expected KOGL Type 1 notice")
    return {
        "catalog_page_url": _canonical_url(CATALOG_PAGE_PATH),
        "catalog_page_sha256": _sha256_bytes(page_bytes),
        "observed_at_utc": _utc_now(),
        "notice": KOGL_NOTICE,
        "notice_url_as_linked_by_catalog": KOGL_NOTICE_URL,
        "status": "catalog_page_declares_kogl_type_1_attribution",
        "not_a_model_training_or_game_distribution_clearance": True,
    }


class NGCClient:
    """An ephemeral-cookie, same-origin client for the documented NGC flow."""

    def __init__(self, timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS) -> None:
        if timeout_seconds <= 0:
            raise FetchError("timeout must be positive")
        self.timeout_seconds = float(timeout_seconds)
        self._cookies = http.cookiejar.CookieJar()
        self._opener = build_opener(
            SameOriginRedirectHandler(),
            # CookieJar remains in memory and is never serialized to the manifest.
            __import__("urllib.request", fromlist=["HTTPCookieProcessor"]).HTTPCookieProcessor(self._cookies),
        )

    def _request(self, path: str, *, form: Optional[Mapping[str, str]] = None) -> Tuple[bytes, Dict[str, str], int]:
        url = _canonical_url(path)
        data = None
        headers = {
            "Accept": "application/json, text/html, audio/*;q=0.9, */*;q=0.1",
            "User-Agent": "Durango-BGM-RND-NGC-fetcher/1.0 (local research; no credentials)",
        }
        if form is not None:
            data = urlencode(form).encode("utf-8")
            headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8"
            headers["X-Requested-With"] = "XMLHttpRequest"
        request = Request(url, data=data, headers=headers, method="POST" if form is not None else "GET")
        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as response:
                raw = response.read(MAX_RESPONSE_BYTES + 1)
                if len(raw) > MAX_RESPONSE_BYTES:
                    raise FetchError("NGC metadata response exceeds the safe size limit")
                status = int(getattr(response, "status", response.getcode()))
                return raw, {key: value for key, value in response.headers.items()}, status
        except HTTPError as exc:
            raise FetchError(f"NGC HTTP error {exc.code} for official endpoint") from exc
        except URLError as exc:
            raise FetchError("NGC network request failed") from exc

    def begin_catalog_session(self) -> Dict[str, Any]:
        page, _headers, status = self._request(CATALOG_PAGE_PATH)
        if status != 200:
            raise FetchError("NGC catalog page did not return HTTP 200")
        return _license_evidence(page)

    def json_post(self, path: str, form: Optional[Mapping[str, str]] = None) -> Dict[str, Any]:
        body, _headers, status = self._request(path, form=form or {})
        if status != 200:
            raise FetchError("NGC JSON endpoint did not return HTTP 200")
        try:
            decoded = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise FetchError("NGC endpoint did not return valid UTF-8 JSON") from exc
        if not isinstance(decoded, dict):
            raise FetchError("NGC endpoint JSON root is not an object")
        return decoded

    def catalog(self) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        instruments = self.json_post(INSTRUMENT_LIST_PATH)
        raw_instruments = instruments.get("list")
        if not isinstance(raw_instruments, list):
            raise FetchError("NGC extended instrument list is missing")
        found = [
            item for item in raw_instruments
            if isinstance(item, dict)
            and item.get("instrCd") == DAEGEUM_INSTRUMENT_CODE
            and item.get("instrName") == DAEGEUM_INSTRUMENT_NAME
        ]
        if len(found) != 1:
            raise FetchError("NGC extended instrument identity no longer matches Daegeum")
        records = self.json_post(FILE_LIST_PATH, {"instrCd": DAEGEUM_INSTRUMENT_CODE})
        raw_list = records.get("list")
        if not isinstance(raw_list, list):
            raise FetchError("NGC extended file list is missing")
        parsed = [dict(item) for item in raw_list if isinstance(item, dict)]
        if len(parsed) != len(raw_list):
            raise FetchError("NGC extended file list contains a non-object record")
        return parsed, dict(found[0])

    def file_info(self, extend_seq: int) -> Dict[str, Any]:
        return self.json_post(FILE_INFO_PATH, {"extendSeq": str(extend_seq)})

    def download_to(self, extend_seq: int, submitted_fields: Mapping[str, str], destination: Path) -> Dict[str, Any]:
        """Stream a one-item download to a private temp file, never a final path."""

        form = {"id": str(extend_seq)}
        form.update(submitted_fields)
        url = _canonical_url(DOWNLOAD_PATH)
        request = Request(
            url,
            data=urlencode(form).encode("utf-8"),
            headers={
                "Accept": "audio/x-wav, audio/wav, application/octet-stream;q=0.8, */*;q=0.1",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "User-Agent": "Durango-BGM-RND-NGC-fetcher/1.0 (local research; no credentials)",
            },
            method="POST",
        )
        try:
            with self._opener.open(request, timeout=self.timeout_seconds) as response:
                status = int(getattr(response, "status", response.getcode()))
                headers = {key: value for key, value in response.headers.items()}
                if status != 200:
                    raise FetchError("NGC audio download did not return HTTP 200")
                if not _content_type_is_audio(headers.get("Content-Type", "")):
                    raise FetchError("NGC download content type is not an allowed audio type")
                declared_length = headers.get("Content-Length")
                if declared_length:
                    try:
                        declared_size = int(declared_length)
                    except ValueError as exc:
                        raise FetchError("NGC download Content-Length is invalid") from exc
                    if declared_size < 44 or declared_size > MAX_AUDIO_BYTES:
                        raise FetchError("NGC download Content-Length is outside the safe WAV range")
                digest = hashlib.sha256()
                total = 0
                with destination.open("wb") as stream:
                    while True:
                        block = response.read(1024 * 1024)
                        if not block:
                            break
                        total += len(block)
                        if total > MAX_AUDIO_BYTES:
                            raise FetchError("NGC audio download exceeded the safe size limit")
                        digest.update(block)
                        stream.write(block)
                if total < 44:
                    raise FetchError("NGC audio download is too short to be a WAV")
                if declared_length and total != int(declared_length):
                    raise FetchError("NGC audio download length disagrees with Content-Length")
                return {
                    "sha256": digest.hexdigest(),
                    "byte_length": total,
                    "http_status": status,
                    "response_headers": _compact_headers(headers),
                    "returned_filename": _filename_from_header(headers.get("Content-Disposition", "")),
                }
        except HTTPError as exc:
            raise FetchError(f"NGC HTTP error {exc.code} during audio download") from exc
        except URLError as exc:
            raise FetchError("NGC audio download network request failed") from exc


def select_exact_sanjo_records(records: Iterable[Mapping[str, Any]], extend_seqs: Sequence[int]) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Pick exact requested rows; broad title matching is deliberately forbidden."""

    materialized = [dict(item) for item in records]
    exact = [
        item for item in materialized
        if item.get("instrCd") == DAEGEUM_INSTRUMENT_CODE
        and item.get("instrDivCd") == "INDV0001"
        and item.get("division") == SANJO_DIVISION
    ]
    by_sequence: Dict[int, Dict[str, Any]] = {}
    for item in exact:
        sequence = _as_int(item.get("extendSeq"), "extendSeq")
        if sequence in by_sequence:
            raise FetchError("NGC catalog has duplicate exact Sanjo extendSeq values")
        _canonical_server_path(_require_str(item, "wavFilePath", "catalog wavFilePath"))
        by_sequence[sequence] = item
    if len(extend_seqs) != len(set(extend_seqs)):
        raise FetchError("each --extend-seq must appear only once")
    selected: List[Dict[str, Any]] = []
    for sequence in extend_seqs:
        record = by_sequence.get(sequence)
        if record is None:
            raise FetchError(
                f"extendSeq {sequence} is not an exact NGC Daegeum Sanjo record; broad title matches are refused"
            )
        selected.append(record)
    return selected, {
        "catalog_returned_count": len(materialized),
        "exact_daegeum_sanjo_count": len(exact),
        "excluded_by_exact_scope_count": len(materialized) - len(exact),
    }


def _detail_matches_catalog(catalog: Mapping[str, Any], detail: Mapping[str, Any]) -> None:
    catalog_seq = _as_int(catalog.get("extendSeq"), "catalog extendSeq")
    detail_seq = _as_int(detail.get("extend_seq"), "detail extend_seq")
    if catalog_seq != detail_seq:
        raise FetchError("NGC file-info extendSeq disagrees with its catalog row")
    if detail.get("instr_cd") != DAEGEUM_INSTRUMENT_CODE or detail.get("instr_name") != DAEGEUM_INSTRUMENT_NAME:
        raise FetchError("NGC file-info is not Daegeum")
    if detail.get("division") != SANJO_DIVISION:
        raise FetchError("NGC file-info is not in exact Daegeum Sanjo division")
    catalog_path = _canonical_server_path(_require_str(catalog, "wavFilePath", "catalog wavFilePath"))
    detail_path = _canonical_server_path(_require_str(detail, "wav_file_path", "detail wav_file_path"))
    if catalog_path != detail_path:
        raise FetchError("NGC file-info original WAV path disagrees with its catalog row")


def _entry_from_server(catalog: Mapping[str, Any], detail: Mapping[str, Any]) -> Dict[str, Any]:
    _detail_matches_catalog(catalog, detail)
    sequence = _as_int(catalog.get("extendSeq"), "catalog extendSeq")
    original_path = _canonical_server_path(_require_str(catalog, "wavFilePath", "catalog wavFilePath"))
    original_filename = _safe_filename(PurePosixPath(original_path).name)
    return {
        "extend_seq": sequence,
        "selection": {
            "instrument_code": DAEGEUM_INSTRUMENT_CODE,
            "instrument_name": DAEGEUM_INSTRUMENT_NAME,
            "division_exact": SANJO_DIVISION,
            "selection_is_exact_metadata_filter_not_title_match": True,
        },
        # Keep the server's metadata in both shapes.  The two endpoints are
        # independently checked above, so a later catalog drift is visible.
        "catalog_record": dict(catalog),
        "file_info_record": dict(detail),
        "source": {
            "catalog_url": _canonical_url(FILE_LIST_PATH),
            "file_info_url": _canonical_url(FILE_INFO_PATH),
            "download_url": _canonical_url(DOWNLOAD_PATH),
            "original_wav_server_path": original_path,
            "original_wav_filename": original_filename,
            "source_sequence": sequence,
        },
        "download": {"state": "planned"},
        "musical_status": {
            "automatic_filename_or_catalog_metadata_is_not_a_legato_or_transition_label": True,
            "approved_transition": False,
            "eligible_for_model_training_or_game_asset": False,
        },
    }


def _submitted_purpose(use_purpose_gb: str, use_purpose: str, use_purpose_detail: str,
                       organization: str) -> Tuple[Dict[str, str], Dict[str, Any]]:
    if not use_purpose_gb or not use_purpose:
        raise FetchError("purpose category and purpose must be explicit non-empty text")
    if use_purpose == "기타" and not use_purpose_detail:
        raise FetchError("NGC requires a purpose detail when usePurpose is 기타")
    form = {
        "usePurposeGb": use_purpose_gb,
        "usePurpose": use_purpose,
        "usePurposeDtl": use_purpose_detail,
        "companyName": organization,
    }
    # Do not persist a caller's potentially identifying organization string.
    audit = {
        "usePurposeGb": use_purpose_gb,
        "usePurpose": use_purpose,
        "usePurposeDtl": use_purpose_detail,
        "companyName": {
            "submission_state": "provided_not_persisted" if organization else "blank",
            "value_persisted": False,
        },
        "no_credentials_or_cookie_file_used": True,
    }
    return form, audit


def _new_manifest(license_evidence: Mapping[str, Any], scope_counts: Mapping[str, int],
                  purpose_audit: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "schema": SCHEMA,
        "tool": TOOL_ID,
        "created_at_utc": _utc_now(),
        "updated_at_utc": _utc_now(),
        "scope": {
            "service": "National Gugak Center digital-eum extended download catalog",
            "catalog_url": _canonical_url(CATALOG_PAGE_PATH),
            "instrument_code": DAEGEUM_INSTRUMENT_CODE,
            "instrument_name": DAEGEUM_INSTRUMENT_NAME,
            "division_exact": SANJO_DIVISION,
            "selection_requires_explicit_extend_seq": True,
            "no_all_or_broad_title_selection_mode": True,
            **dict(scope_counts),
        },
        "license_evidence": dict(license_evidence),
        "submitted_purpose": dict(purpose_audit),
        "entries": [],
        "r_and_d_only": {
            "no_game_default_or_runtime_changes": True,
            "no_musical_gesture_or_legato_claim_from_download": True,
            "human_review_and_rights_review_required_before_training_or_shipping": True,
        },
    }


def _validate_manifest(manifest: Mapping[str, Any]) -> None:
    if manifest.get("schema") != SCHEMA or manifest.get("tool") != TOOL_ID:
        raise FetchError("existing manifest belongs to a different tool or schema")
    if not isinstance(manifest.get("entries"), list):
        raise FetchError("existing manifest entries must be a list")
    for entry in manifest["entries"]:
        if not isinstance(entry, dict):
            raise FetchError("existing manifest entry is not an object")
        sequence = _as_int(entry.get("extend_seq"), "manifest extend_seq")
        selection = entry.get("selection")
        source = entry.get("source")
        if not isinstance(selection, dict) or not isinstance(source, dict):
            raise FetchError("existing manifest entry is missing selection/source evidence")
        if selection.get("instrument_code") != DAEGEUM_INSTRUMENT_CODE or selection.get("division_exact") != SANJO_DIVISION:
            raise FetchError("existing manifest entry is outside the exact Daegeum Sanjo scope")
        if _as_int(source.get("source_sequence"), "manifest source_sequence") != sequence:
            raise FetchError("existing manifest source sequence disagrees with entry")


def _merge_entry(manifest: Dict[str, Any], new_entry: Dict[str, Any]) -> Dict[str, Any]:
    """Keep downloaded provenance immutable; a live catalog drift is a stop signal."""

    sequence = _as_int(new_entry.get("extend_seq"), "new extend_seq")
    existing_entries = manifest["entries"]
    for index, existing in enumerate(existing_entries):
        if _as_int(existing.get("extend_seq"), "existing extend_seq") != sequence:
            continue
        old_source = existing.get("source", {})
        new_source = new_entry.get("source", {})
        if not isinstance(old_source, dict) or old_source.get("original_wav_server_path") != new_source.get("original_wav_server_path"):
            raise FetchError("NGC catalog source path drifted for an existing manifest entry")
        # Preserve the first received record and any local hash.  Fresh server
        # metadata can be checked from a newly created output directory rather
        # than rewriting historical provenance in place.
        return existing
    existing_entries.append(new_entry)
    return new_entry


def _native_descriptor_for(path: Path, expected_sha256: str) -> Dict[str, Any]:
    with path.open("rb") as stream:
        raw = stream.read(12)
    if len(raw) < 12 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
        raise FetchError("download payload does not have RIFF/WAVE magic")
    try:
        descriptor = inspect_wav(path)
    except NativeWavError as exc:
        raise FetchError("download payload is not a safe native WAV") from exc
    if descriptor.get("sha256") != expected_sha256:
        raise FetchError("WAV reader SHA-256 disagrees with streamed payload hash")
    native = descriptor.get("native_audio")
    if not isinstance(native, dict) or not native.get("supported_for_decode"):
        raise FetchError("downloaded WAV is not a supported direct analysis source")
    return descriptor


def _audio_relative_path(sequence: int) -> str:
    return f"{RELATIVE_AUDIO_DIRECTORY}/extend-{sequence:06d}.wav"


def _verify_downloaded_entry(output_root: Path, entry: Mapping[str, Any]) -> Dict[str, Any]:
    download = entry.get("download")
    if not isinstance(download, dict) or download.get("state") != "downloaded":
        raise FetchError("manifest entry has not been downloaded")
    relative_path = download.get("relative_path")
    expected_sha = download.get("sha256")
    if not isinstance(relative_path, str) or not isinstance(expected_sha, str) or not re.fullmatch(r"[0-9a-f]{64}", expected_sha):
        raise FetchError("manifest downloaded entry is missing path/hash provenance")
    path = _resolve_under(output_root, relative_path)
    if not path.is_file():
        raise FetchError("manifest says a downloaded WAV exists but the file is missing")
    actual_sha = _sha256_file(path)
    if actual_sha != expected_sha:
        raise FetchError("downloaded WAV SHA-256 does not match its manifest")
    descriptor = _native_descriptor_for(path, actual_sha)
    recorded_descriptor = download.get("native_wav")
    if isinstance(recorded_descriptor, dict) and recorded_descriptor.get("native_audio") != descriptor.get("native_audio"):
        raise FetchError("downloaded WAV native format disagrees with manifest provenance")
    return descriptor


def _download_entry(client: NGCClient, output_root: Path, entry: Dict[str, Any],
                    submitted_fields: Mapping[str, str]) -> None:
    sequence = _as_int(entry.get("extend_seq"), "entry extend_seq")
    destination_relative = _audio_relative_path(sequence)
    destination = _resolve_under(output_root, destination_relative)
    destination.parent.mkdir(parents=True, exist_ok=True)
    old_download = entry.get("download")
    if isinstance(old_download, dict) and old_download.get("state") == "downloaded":
        _verify_downloaded_entry(output_root, entry)
        return
    if destination.exists():
        raise FetchError("refusing to overwrite an existing audio file without matching manifest provenance")
    temporary: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "wb", dir=str(destination.parent), prefix=".incoming-", suffix=".wav", delete=False
        ) as stream:
            temporary = Path(stream.name)
        result = client.download_to(sequence, submitted_fields, temporary)
        expected_filename = entry["source"]["original_wav_filename"]
        if result["returned_filename"] != expected_filename:
            raise FetchError("NGC returned filename does not match the catalog's original WAV filename")
        descriptor = _native_descriptor_for(temporary, result["sha256"])
        if _sha256_file(temporary) != result["sha256"]:
            raise FetchError("temporary WAV changed during validation")
        os.replace(str(temporary), str(destination))
        temporary = None
        entry["download"] = {
            "state": "downloaded",
            "relative_path": destination_relative,
            "sha256": result["sha256"],
            "byte_length": result["byte_length"],
            "http_status": result["http_status"],
            "response_headers": result["response_headers"],
            "returned_filename": result["returned_filename"],
            "downloaded_at_utc": _utc_now(),
            "native_wav": descriptor,
        }
    finally:
        if temporary is not None and temporary.exists():
            temporary.unlink()


def verify_manifest(output_root: Path, requested_sequences: Optional[Sequence[int]] = None) -> Dict[str, int]:
    manifest_path = output_root / MANIFEST_NAME
    manifest = _read_json_object(manifest_path)
    _validate_manifest(manifest)
    wanted = set(requested_sequences or [])
    verified = 0
    planned = 0
    seen = set()
    for entry in manifest["entries"]:
        sequence = _as_int(entry["extend_seq"], "manifest extend_seq")
        if wanted and sequence not in wanted:
            continue
        seen.add(sequence)
        if entry.get("download", {}).get("state") == "downloaded":
            _verify_downloaded_entry(output_root, entry)
            verified += 1
        else:
            planned += 1
    missing = wanted - seen
    if missing:
        raise FetchError("requested extendSeq is not present in this manifest")
    if verified == 0:
        raise FetchError("verify-only found no downloaded WAV entry to verify")
    return {"verified_downloaded": verified, "planned_not_downloaded": planned}


def plan_or_download(
    output_root: Path,
    extend_seqs: Sequence[int],
    *,
    download: bool,
    allow_batch: bool,
    use_purpose_gb: str,
    use_purpose: str,
    use_purpose_detail: str,
    organization: str,
    timeout_seconds: float,
) -> Dict[str, Any]:
    if not extend_seqs:
        raise FetchError("at least one exact --extend-seq is required unless --verify-only is used")
    if len(extend_seqs) > MAX_EXPLICIT_ITEMS:
        raise FetchError(f"at most {MAX_EXPLICIT_ITEMS} exact items are allowed per invocation")
    if download and len(extend_seqs) > 1 and not allow_batch:
        raise FetchError("multiple downloads require --allow-batch after reviewing the plan")
    output_root.mkdir(parents=True, exist_ok=True)
    if not output_root.is_dir():
        raise FetchError("--output-dir is not a directory")
    purpose_form, purpose_audit = _submitted_purpose(
        use_purpose_gb, use_purpose, use_purpose_detail, organization
    )
    client = NGCClient(timeout_seconds=timeout_seconds)
    license_evidence = client.begin_catalog_session()
    records, instrument = client.catalog()
    selected, scope_counts = select_exact_sanjo_records(records, extend_seqs)
    if instrument.get("instrCd") != DAEGEUM_INSTRUMENT_CODE or instrument.get("instrName") != DAEGEUM_INSTRUMENT_NAME:
        raise FetchError("NGC catalog instrument verification failed")
    manifest_path = output_root / MANIFEST_NAME
    if manifest_path.exists():
        manifest = _read_json_object(manifest_path)
        _validate_manifest(manifest)
    else:
        manifest = _new_manifest(license_evidence, scope_counts, purpose_audit)
    merged: List[Dict[str, Any]] = []
    for catalog in selected:
        sequence = _as_int(catalog.get("extendSeq"), "catalog extendSeq")
        detail = client.file_info(sequence)
        entry = _entry_from_server(catalog, detail)
        merged.append(_merge_entry(manifest, entry))
    manifest["updated_at_utc"] = _utc_now()
    # The first write records exact source selection before any audio request.
    _write_json_atomic(manifest_path, manifest)
    downloaded = 0
    if download:
        for entry in merged:
            before = entry.get("download", {}).get("state")
            _download_entry(client, output_root, entry, purpose_form)
            if before != "downloaded":
                downloaded += 1
            manifest["updated_at_utc"] = _utc_now()
            # A process interruption leaves every completed WAV with its hash.
            _write_json_atomic(manifest_path, manifest)
    return {
        "mode": "download" if download else "plan",
        "selected_exact_sanjo": len(merged),
        "newly_downloaded": downloaded,
        "scope_counts": scope_counts,
        "manifest_relative_name": MANIFEST_NAME,
    }


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", type=Path, required=True,
                        help="Explicit R&D output directory; no game directory is implied.")
    parser.add_argument("--extend-seq", type=int, action="append", default=[],
                        help="Exact NGC extendSeq in the Daegeum/Sanjo catalog; repeat for a reviewed batch.")
    parser.add_argument("--download", action="store_true",
                        help="Actually fetch the explicit selection; absent means metadata plan only.")
    parser.add_argument("--allow-batch", action="store_true",
                        help="Required with --download and more than one exact selection.")
    parser.add_argument("--verify-only", action="store_true",
                        help="Do no network I/O; verify hashes/native WAV provenance already in output-dir.")
    parser.add_argument("--use-purpose-gb", default="비상업용",
                        help="Submitted NGC commerciality category (default: 비상업용).")
    parser.add_argument("--use-purpose", default="연구용",
                        help="Submitted NGC purpose (default: 연구용).")
    parser.add_argument("--use-purpose-detail", default="",
                        help="Submitted detail; required by NGC when --use-purpose 기타.")
    parser.add_argument("--organization", default="",
                        help="Optional truthful organization submitted to NGC; never persisted by this tool.")
    parser.add_argument("--timeout-seconds", type=float, default=DEFAULT_TIMEOUT_SECONDS)
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        output_root = args.output_dir.expanduser().resolve()
        if args.verify_only:
            if args.download or args.allow_batch:
                raise FetchError("--verify-only cannot be combined with --download or --allow-batch")
            result = verify_manifest(output_root, args.extend_seq or None)
            result["mode"] = "verify-only"
        else:
            result = plan_or_download(
                output_root,
                args.extend_seq,
                download=bool(args.download),
                allow_batch=bool(args.allow_batch),
                use_purpose_gb=args.use_purpose_gb,
                use_purpose=args.use_purpose,
                use_purpose_detail=args.use_purpose_detail,
                organization=args.organization,
                timeout_seconds=args.timeout_seconds,
            )
        # The machine-readable result intentionally contains no cookies, no
        # organization value, and no absolute source path.
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    except FetchError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
