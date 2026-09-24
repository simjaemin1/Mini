#!/usr/bin/env python3
"""Validate one explicit National Gugak Center source-download receipt.

The validator is deliberately a *provenance and credit* gate.  It does not
download files, infer a license from a filename, promote an asset to runtime,
or decide whether a source can be used for ML training.  Its only output is a
path-free R&D report after an already obtained, normal official-UI download is
matched to its SHA-256/native WAV descriptor and a stated KOGL attribution.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import sys
from typing import Any, Mapping, Sequence
from urllib.parse import urlparse


HERE = Path(__file__).resolve().parent
NATIVE_WAV_DIR = HERE.parent / "daegeum-transitions"
if str(NATIVE_WAV_DIR) not in sys.path:
    sys.path.insert(0, str(NATIVE_WAV_DIR))

from native_wav import NativeWavError, inspect_wav  # noqa: E402


RECEIPT_SCHEMA = "mini.ngc-source-receipt.v1"
REPORT_SCHEMA = "mini.ngc-source-receipt-report.v1"
REPORT_FILENAME = "ngc_source_receipt_report.json"
_SHA256 = re.compile(r"[0-9a-f]{64}")
_ALLOWED_HOSTS = frozenset(("api.gugak.go.kr", "apis.gugak.go.kr"))


class NGCReceiptError(RuntimeError):
    """An explicit official-source receipt cannot prove the narrow R&D facts."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load(path: Path) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise NGCReceiptError("receipt file does not exist") from exc
    except json.JSONDecodeError as exc:
        raise NGCReceiptError("receipt file is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise NGCReceiptError("receipt must be a JSON object")
    return value


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise NGCReceiptError(f"{label} must be an object")
    return value


def _true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise NGCReceiptError(f"{label}.{key} must explicitly be true")


def _string(value: Any, *, label: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise NGCReceiptError(f"{label} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise NGCReceiptError(f"{label} has an invalid format")
    return value


def _positive_int(value: Any, *, label: str) -> int:
    if type(value) is not int or value < 1:
        raise NGCReceiptError(f"{label} must be a positive integer")
    return int(value)


def _safe_relative(value: Any, *, label: str) -> PurePosixPath:
    raw = _string(value, label=label)
    if "\\" in raw:
        raise NGCReceiptError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise NGCReceiptError(f"{label} is not a safe relative path")
    return parsed


def _inside(root: Path, relative: PurePosixPath) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise NGCReceiptError("receipt source path escapes its explicit source root") from exc
    return candidate


def _https_ngc_url(value: Any, *, label: str) -> str:
    url = _string(value, label=label)
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_HOSTS or not parsed.path:
        raise NGCReceiptError(f"{label} must be an HTTPS official NGC digital-eum URL")
    return url


def _native_summary(native: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sample_rate_hz": int(native["sample_rate_hz"]),
        "channels": int(native["channels"]),
        "frame_count": int(native["frame_count"]),
        "encoding": str(native["encoding"]),
    }


def _expected_native(value: Any, *, label: str) -> dict[str, Any]:
    native = _mapping(value, label=label)
    rate = _positive_int(native.get("sample_rate_hz"), label=f"{label}.sample_rate_hz")
    channels = _positive_int(native.get("channels"), label=f"{label}.channels")
    frames = _positive_int(native.get("frame_count"), label=f"{label}.frame_count")
    encoding = _string(native.get("encoding"), label=f"{label}.encoding")
    return {"sample_rate_hz": rate, "channels": channels, "frame_count": frames, "encoding": encoding}


def validate_receipt(path: str | Path) -> dict[str, Any]:
    """Validate a receipt and return only safe, path-free report values."""

    receipt_path = Path(path).expanduser().resolve()
    receipt = _load(receipt_path)
    if receipt.get("schema") != RECEIPT_SCHEMA:
        raise NGCReceiptError(f"receipt.schema must be {RECEIPT_SCHEMA}")
    scope = _mapping(receipt.get("r_and_d_scope"), label="receipt.r_and_d_scope")
    for key in ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release"):
        _true(scope, key, label="receipt.r_and_d_scope")
    limits = _mapping(receipt.get("scope_limits"), label="receipt.scope_limits")
    for key in ("not_a_game_asset", "not_a_training_item", "requires_new_scope_review"):
        _true(limits, key, label="receipt.scope_limits")

    official = _mapping(receipt.get("official_record"), label="receipt.official_record")
    if official.get("provider") != "National Gugak Center":
        raise NGCReceiptError("receipt.official_record.provider must be National Gugak Center")
    collection = _string(official.get("collection"), label="receipt.official_record.collection", pattern=re.compile(r"[a-z0-9_-]{1,64}"))
    record_id = _positive_int(official.get("record_id"), label="receipt.official_record.record_id")
    catalog_url = _https_ngc_url(official.get("catalog_url"), label="receipt.official_record.catalog_url")
    license_block = _mapping(official.get("kogl"), label="receipt.official_record.kogl")
    if license_block.get("type") != "1":
        raise NGCReceiptError("receipt.official_record.kogl.type must explicitly be KOGL Type 1")
    _true(license_block, "attribution_required", label="receipt.official_record.kogl")
    credit = _mapping(official.get("credit"), label="receipt.official_record.credit")
    if credit.get("organization") != "국립국악원":
        raise NGCReceiptError("receipt.official_record.credit.organization must be 국립국악원")
    title = _string(credit.get("title"), label="receipt.official_record.credit.title")
    if credit.get("catalog_url") != catalog_url:
        raise NGCReceiptError("receipt credit.catalog_url must equal the verified catalog_url")
    creator_displayed = _string(credit.get("creator_displayed"), label="receipt.official_record.credit.creator_displayed")

    download = _mapping(receipt.get("download_attestation"), label="receipt.download_attestation")
    _true(download, "normal_official_ui_download", label="receipt.download_attestation")
    root_id = _string(download.get("source_root_id"), label="receipt.download_attestation.source_root_id", pattern=re.compile(r"[A-Za-z0-9_-]{1,64}"))
    raw_root = _string(download.get("source_root"), label="receipt.download_attestation.source_root")
    root = Path(raw_root)
    if not root.is_absolute() or not root.resolve().is_dir():
        raise NGCReceiptError("receipt download source_root must be an existing explicit absolute directory")
    root = root.resolve()
    relative = _safe_relative(download.get("relative_path"), label="receipt.download_attestation.relative_path")
    source = _inside(root, relative)
    if not source.is_file() or source.suffix.lower() != ".wav":
        raise NGCReceiptError("receipt source must be an existing direct WAV")
    expected_sha = _string(download.get("sha256"), label="receipt.download_attestation.sha256", pattern=_SHA256)
    expected_native = _expected_native(download.get("native_audio"), label="receipt.download_attestation.native_audio")
    try:
        descriptor = inspect_wav(source)
    except NativeWavError as exc:
        raise NGCReceiptError("receipt source cannot be inspected as a native WAV") from exc
    actual_sha = str(descriptor["sha256"])
    actual_native = _native_summary(_mapping(descriptor.get("native_audio"), label="actual native descriptor"))
    if actual_sha != expected_sha:
        raise NGCReceiptError("receipt source SHA-256 does not match its explicit download attestation")
    if actual_native != expected_native:
        raise NGCReceiptError("receipt source native WAV descriptor does not match its explicit attestation")
    return {
        "receipt_basename": receipt_path.name,
        "receipt_sha256": _sha256(receipt_path),
        "r_and_d_scope": {key: True for key in ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release")},
        "official_record": {
            "provider": "National Gugak Center",
            "collection": collection,
            "record_id": record_id,
            "catalog_url": catalog_url,
            "kogl": {"type": "1", "attribution_required": True},
            "credit": {"organization": "국립국악원", "title": title, "creator_displayed": creator_displayed, "catalog_url": catalog_url},
        },
        "downloaded_source": {
            "source_root_id": root_id,
            "relative_path": relative.as_posix(),
            "sha256": actual_sha,
            "native_audio": actual_native,
            "normal_official_ui_download_attested": True,
        },
        "scope_limits": {"not_a_game_asset": True, "not_a_training_item": True, "requires_new_scope_review": True},
    }


def write_report(*, receipt: str | Path, output_dir: str | Path) -> dict[str, Any]:
    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise NGCReceiptError("--output-dir must be fresh; refusing to overwrite an R&D report")
    result = validate_receipt(receipt)
    output.mkdir(parents=True, exist_ok=False)
    report = {
        "schema": REPORT_SCHEMA,
        "artifact_kind": "rnd_only_official_ngc_source_receipt_report",
        **result,
        "interpretation_limits": {
            "catalog_license_and_local_wav_identity_are_only_the_verified_facts": True,
            "receipt_does_not_automatically_make_the_audio_a_game_asset_or_training_item": True,
            "no_audio_was_copied_rendered_or_modified": True,
            "no_default_runtime_or_public_asset_was_read_or_written": True,
        },
    }
    (output / REPORT_FILENAME).write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--receipt", required=True, help="one explicit official-UI download receipt JSON")
    parser.add_argument("--output-dir", required=True, help="fresh R&D report directory")
    parser.add_argument("--confirm-rnd-only", action="store_true", help="required acknowledgement: report is not asset promotion")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("validate_receipt: pass --confirm-rnd-only", file=sys.stderr)
        return 2
    try:
        report = write_report(receipt=args.receipt, output_dir=args.output_dir)
    except NGCReceiptError as exc:
        print(f"validate_receipt: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
