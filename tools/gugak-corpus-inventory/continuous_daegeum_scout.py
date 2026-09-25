#!/usr/bin/env python3
"""Read-only discovery of possible continuous Daegeum source recordings.

This is deliberately a *source scout*, not an importer or an audio labeller.
It walks one explicitly supplied root, hashes only filenames that lexically
identify as Daegeum, and structurally inspects direct WAV containers.  It does
not decode audio samples, copy recordings, infer a performance gesture, or
make a licence / training / game-use decision.

The emitted report avoids both absolute paths and raw source-relative paths.
A reviewer can resolve an item later by re-running this tool over the same
explicit root and comparing its root id, relative-path SHA-256, and byte
SHA-256.  That lets the report record a useful review locator without turning
an R&D artifact into an inventory of unrelated Downloads filenames.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
from typing import Any, Iterable, Mapping
from urllib.parse import urlparse


SCHEMA = "durango.daegeum.continuous-source-scout.v1"
TOOL_ID = "continuous-daegeum-source-scout"
COPY_BUFFER_BYTES = 1024 * 1024
AUDIO_SUFFIXES = frozenset({".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aif", ".aiff"})
DAEGEUM_FILENAME_RE = re.compile(r"(?:daegeum|daegum|deageum|taegeum|taegum|대금)", re.IGNORECASE)
TECHNIQUE_RE = re.compile(
    r"(?:scale|stac+ato|vib(?:rato)?|sustain|sus|nonghy[eo]n|glissando|"
    r"nina|nira|음계|스타카토|농음|농현|시김새|추성|퇴성|나니르|니라|니레|노니로|더름|시루)",
    re.IGNORECASE,
)
MIN_LONG_RECORDING_SECONDS = 60.0


class ScoutError(ValueError):
    """The explicit source root or report destination is unsafe."""


def _load_native_wav() -> Any:
    module_path = Path(__file__).resolve().parents[1] / "daegeum-transitions" / "native_wav.py"
    spec = importlib.util.spec_from_file_location("continuous_daegeum_scout_native_wav", module_path)
    if spec is None or spec.loader is None:
        raise ScoutError("the native WAV inspector is unavailable")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _safe_root_id(value: str) -> str:
    value = value.strip()
    if not value or value in {".", ".."} or len(value) > 96:
        raise ScoutError("--root-id must be a short, non-empty identifier")
    if any(character in value for character in "/\\:\x00"):
        raise ScoutError("--root-id must not be a path")
    return value


def _digest_text(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _safe_native_descriptor(metadata: Mapping[str, Any]) -> dict[str, Any]:
    native = metadata["native_audio"]
    return {
        "container_id": metadata["container"]["id"],
        "encoding": native["encoding"],
        "sample_rate_hz": native["sample_rate_hz"],
        "channels": native["channels"],
        "bits_per_sample": native["bits_per_sample"],
        "frame_count": native["frame_count"],
        "duration_seconds": native["duration_seconds"],
        "resampled": native["resampled"],
        "bwf_bext_present": "bext" in metadata.get("riff_metadata", {}),
    }


def _walk_audio_files(root: Path) -> tuple[list[Path], dict[str, int]]:
    files: list[Path] = []
    stats = Counter()

    def on_error(_error: OSError) -> None:
        stats["walk_error_count"] += 1

    for directory_text, directory_names, filenames in os.walk(root, followlinks=False, onerror=on_error):
        directory = Path(directory_text)
        retained_directories: list[str] = []
        for name in sorted(directory_names):
            candidate = directory / name
            if candidate.is_symlink():
                stats["skipped_symlink_directory_count"] += 1
            else:
                retained_directories.append(name)
        directory_names[:] = retained_directories
        for name in sorted(filenames):
            candidate = directory / name
            if candidate.suffix.casefold() not in AUDIO_SUFFIXES:
                continue
            if candidate.is_symlink():
                stats["skipped_symlink_audio_file_count"] += 1
                continue
            if candidate.is_file():
                files.append(candidate)
    return sorted(files, key=lambda value: value.relative_to(root).as_posix()), dict(stats)


def _technique_keywords(filename: str) -> list[str]:
    """Preserve a small safe vocabulary without exposing the raw filename."""

    text = filename.casefold()
    found: list[str] = []
    for label, expression in (
        ("scale", r"scale|음계"),
        ("staccato", r"stac+ato|스타카토"),
        ("vibrato", r"vib(?:rato)?|농음|농현"),
        ("sustain", r"sustain|sus"),
        ("sigimsae_or_ornament", r"nina|nira|시김새|추성|퇴성|나니르|니라|니레|노니로|더름|시루"),
        ("glissando", r"glissando"),
    ):
        if re.search(expression, text, re.IGNORECASE):
            found.append(label)
    return found


def _filename_evidence(filename: str) -> dict[str, Any]:
    techniques = _technique_keywords(filename)
    return {
        "daegeum_filename_alias_present": bool(DAEGEUM_FILENAME_RE.search(filename)),
        "technique_keyword_codes": techniques,
        "raw_filename_recorded": False,
    }


def _recording_class(
    *, suffix: str, native_descriptor: Mapping[str, Any] | None, technique_codes: Iterable[str]
) -> tuple[str, str]:
    """Classify only transparent lexical/container evidence, never audio content."""

    techniques = tuple(technique_codes)
    if techniques:
        return (
            "named_technique_or_exercise_not_continuity_candidate",
            "filename contains a technique/exercise keyword; continuity was not inferred",
        )
    if suffix != ".wav" or native_descriptor is None:
        return (
            "non_native_wav_or_uninspected_duration",
            "no direct native-WAV duration supports a continuous-recording inference",
        )
    duration = float(native_descriptor["duration_seconds"])
    if duration >= MIN_LONG_RECORDING_SECONDS:
        return (
            "long_native_wav_continuous_recording_candidate",
            "native duration is at least 60 seconds and the filename has no technique keyword; review required",
        )
    return (
        "short_native_wav_unclassified",
        "duration is below 60 seconds and no waveform/content continuity judgement was made",
    )


def _list_xattrs(path: Path) -> set[str]:
    """Read extended-attribute names without requiring a platform-specific Python build."""

    listxattr = getattr(os, "listxattr", None)
    if callable(listxattr):
        try:
            return set(listxattr(path))
        except OSError:
            return set()
    # The desktop host's framework Python may omit os.listxattr even though
    # macOS's read-only xattr utility exists.  Never echo the filename or raw
    # attributes; this fallback only returns their names.
    try:
        result = subprocess.run(
            ["xattr", str(path)],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except (OSError, ValueError):
        return set()
    if result.returncode != 0:
        return set()
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def _read_xattr(path: Path, name: str) -> bytes | None:
    getxattr = getattr(os, "getxattr", None)
    if callable(getxattr):
        try:
            return getxattr(path, name)
        except OSError:
            return None
    try:
        result = subprocess.run(
            ["xattr", "-p", name, str(path)],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except (OSError, ValueError):
        return None
    return result.stdout if result.returncode == 0 else None


def _xattr_provenance(path: Path) -> dict[str, Any]:
    """Return only a browser-trace indicator and URL hostname, never a raw URL."""

    attributes = _list_xattrs(path)
    where_from_hosts: set[str] = set()
    where_from_key = "com.apple.metadata:kMDItemWhereFroms"
    if where_from_key in attributes:
        try:
            value = _read_xattr(path, where_from_key)
            if value is None:
                raise OSError("Where From xattr is unreadable")
            decoded = plistlib.loads(value)
            if isinstance(decoded, list):
                for item in decoded:
                    if isinstance(item, str):
                        parsed = urlparse(item)
                        if parsed.scheme in {"http", "https"} and parsed.hostname:
                            where_from_hosts.add(parsed.hostname.casefold())
        except (OSError, ValueError, plistlib.InvalidFileException):
            pass
    return {
        "browser_quarantine_marker_present": "com.apple.quarantine" in attributes,
        "where_from_hostname_hints": sorted(where_from_hosts),
        "raw_url_recorded": False,
    }


def _load_ngc_sha256s(path: Path | None) -> tuple[set[str], dict[str, Any] | None]:
    if path is None:
        return set(), None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        entries = payload["entries"]
        if not isinstance(entries, list):
            raise TypeError("entries is not a list")
        digests = {
            entry["download"]["native_wav"]["sha256"]
            for entry in entries
            if isinstance(entry, Mapping)
            and isinstance(entry.get("download"), Mapping)
            and isinstance(entry["download"].get("native_wav"), Mapping)
            and isinstance(entry["download"]["native_wav"].get("sha256"), str)
        }
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise ScoutError("--known-ngc-manifest is not a readable NGC controlled-source manifest") from exc
    return digests, {
        "entry_count": len(entries),
        "local_byte_sha256_count": len(digests),
        "candidate_matches_are_local_byte_matches_only": True,
        "official_source_supplied_cryptographic_receipt": False,
        "note": "The manifest traces controlled local downloads; it is not an official NGC byte-hash receipt.",
    }


def _load_reference_catalogs(paths: Iterable[tuple[str, Path]]) -> dict[str, list[dict[str, Any]]]:
    matches: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for label, path in paths:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            files = payload["files"]
            if not isinstance(files, list):
                raise TypeError("files is not a list")
        except (OSError, KeyError, TypeError, ValueError) as exc:
            raise ScoutError(f"reference catalog {label!r} is unreadable") from exc
        for item in files:
            if not isinstance(item, Mapping) or not isinstance(item.get("sha256"), str):
                continue
            matches[item["sha256"]].append(
                {
                    "catalog_label": label,
                    "source_id": item.get("source_id"),
                    "source_role": item.get("source_role"),
                    "raw_path_recorded": False,
                }
            )
    return dict(matches)


def _parse_reference_catalog(value: str) -> tuple[str, Path]:
    if "=" not in value:
        raise argparse.ArgumentTypeError("--reference-catalog must be LABEL=/absolute/or/relative/path.json")
    label, raw_path = value.split("=", 1)
    label = _safe_root_id(label)
    if not raw_path:
        raise argparse.ArgumentTypeError("--reference-catalog needs a JSON path after =")
    return label, Path(raw_path)


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def build_report(
    root: str | Path,
    *,
    root_id: str,
    known_ngc_manifest: str | Path | None = None,
    reference_catalogs: Iterable[tuple[str, str | Path]] = (),
    created_at_utc: str | None = None,
) -> dict[str, Any]:
    """Return a privacy-safe, read-only Daegeum source discovery report."""

    source_root = Path(root).expanduser()
    try:
        source_root = source_root.resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise ScoutError("explicit audio root is unavailable") from exc
    if not source_root.is_dir():
        raise ScoutError("explicit audio root is not a directory")
    root_id = _safe_root_id(root_id)
    ngc_sha256s, ngc_summary = _load_ngc_sha256s(
        Path(known_ngc_manifest).expanduser() if known_ngc_manifest else None
    )
    resolved_catalogs: list[tuple[str, Path]] = []
    for label, raw_path in reference_catalogs:
        resolved_catalogs.append((_safe_root_id(label), Path(raw_path).expanduser()))
    catalog_matches = _load_reference_catalogs(resolved_catalogs)
    native_wav = _load_native_wav()
    audio_files, walk_stats = _walk_audio_files(source_root)
    candidates = [path for path in audio_files if DAEGEUM_FILENAME_RE.search(path.name)]
    records: list[dict[str, Any]] = []
    for path in candidates:
        relative_path = path.relative_to(source_root).as_posix()
        suffix = path.suffix.casefold()
        try:
            byte_length = path.stat().st_size
            digest = _hash_file(path)
        except OSError as exc:
            records.append(
                {
                    "manual_review_locator": {
                        "source_root_id": root_id,
                        "relative_path_sha256": _digest_text(relative_path),
                        "byte_sha256": None,
                    },
                    "file_extension": suffix[1:],
                    "byte_length": None,
                    "inspection_status": "unreadable",
                    "error_kind": type(exc).__name__,
                    "raw_path_recorded": False,
                }
            )
            continue

        descriptor: dict[str, Any] | None = None
        inspection_status = "hashed_non_wav_container"
        error_kind: str | None = None
        if suffix == ".wav":
            try:
                descriptor = _safe_native_descriptor(native_wav.inspect_wav(path))
                inspection_status = "native_wav_inspected"
            except Exception as exc:  # Keep the original byte digest even if container metadata is malformed.
                inspection_status = "native_wav_inspection_failed"
                error_kind = type(exc).__name__
        filename_evidence = _filename_evidence(path.name)
        recording_class, rationale = _recording_class(
            suffix=suffix,
            native_descriptor=descriptor,
            technique_codes=filename_evidence["technique_keyword_codes"],
        )
        trace = _xattr_provenance(path)
        trace.update(
            {
                "matches_known_controlled_ngc_manifest_by_local_byte_sha256": digest in ngc_sha256s,
                "local_reference_catalog_matches": catalog_matches.get(digest, []),
                "ngc_origin_proven": False,
                "training_or_game_rights_proven": False,
            }
        )
        records.append(
            {
                "manual_review_locator": {
                    "source_root_id": root_id,
                    "relative_path_sha256": _digest_text(relative_path),
                    "byte_sha256": digest,
                },
                "file_extension": suffix[1:],
                "byte_length": byte_length,
                "inspection_status": inspection_status,
                "error_kind": error_kind,
                "native_wav_descriptor": descriptor,
                "filename_evidence": filename_evidence,
                "recording_candidate_class": recording_class,
                "classification_rationale": rationale,
                "provenance_evidence": trace,
                "raw_path_recorded": False,
            }
        )

    records.sort(key=lambda item: (item["manual_review_locator"]["byte_sha256"] or "", item["manual_review_locator"]["relative_path_sha256"]))
    class_counts = Counter(item.get("recording_candidate_class", "unreadable") for item in records)
    source_hashes = {item["manual_review_locator"]["byte_sha256"] for item in records if item["manual_review_locator"]["byte_sha256"]}
    long_candidates = [
        item
        for item in records
        if item.get("recording_candidate_class") == "long_native_wav_continuous_recording_candidate"
    ]
    browser_traced = [
        item for item in records if item.get("provenance_evidence", {}).get("browser_quarantine_marker_present")
    ]
    ngc_matches = [
        item
        for item in records
        if item.get("provenance_evidence", {}).get("matches_known_controlled_ngc_manifest_by_local_byte_sha256")
    ]
    baseline_candidates = [
        {
            "manual_review_locator": item["manual_review_locator"],
            "file_extension": item["file_extension"],
            "byte_length": item["byte_length"],
            "native_wav_descriptor": item["native_wav_descriptor"],
            "recording_candidate_class": item["recording_candidate_class"],
            "provenance_evidence": item["provenance_evidence"],
        }
        for item in long_candidates
    ]
    created_at_utc = created_at_utc or datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    return {
        "schema": SCHEMA,
        "tool": TOOL_ID,
        "created_at_utc": created_at_utc,
        "policy": {
            "read_only_source_scan": True,
            "source_audio_copied": False,
            "source_audio_modified": False,
            "audio_samples_decoded": False,
            "absolute_or_raw_relative_paths_recorded": False,
            "no_phrase_boundary_or_score_fit_judgement": True,
            "not_a_training_or_game_approval": True,
            "local_byte_hash_is_not_official_ngc_cryptographic_attestation": True,
        },
        "source_root": {"id": root_id, "absolute_path_recorded": False},
        "known_ngc_controlled_manifest": ngc_summary,
        "summary": {
            "all_audio_files_seen": len(audio_files),
            "daegeum_filename_candidate_files": len(records),
            "unique_daegeum_candidate_byte_sha256_count": len(source_hashes),
            "candidate_class_counts": dict(sorted(class_counts.items())),
            "long_native_wav_continuous_recording_candidate_count": len(long_candidates),
            "browser_quarantine_trace_candidate_count": len(browser_traced),
            "matches_known_controlled_ngc_manifest_count": len(ngc_matches),
            "reference_catalog_match_count": sum(
                len(item.get("provenance_evidence", {}).get("local_reference_catalog_matches", []))
                for item in records
            ),
            "walk_stats": {
                "skipped_symlink_audio_file_count": walk_stats.get("skipped_symlink_audio_file_count", 0),
                "skipped_symlink_directory_count": walk_stats.get("skipped_symlink_directory_count", 0),
                "walk_error_count": walk_stats.get("walk_error_count", 0),
            },
        },
        "unapproved_rnd_source_baseline_manifest": {
            "schema": "durango.daegeum.unapproved-rnd-source-baseline.v1",
            "status": "unreviewed_local_source_candidates_no_rights_approval",
            "candidate_count": len(baseline_candidates),
            "candidates": baseline_candidates,
            "metadata_baseline_only": True,
            "does_not_authorize": [
                "claiming_an_ngc_origin",
                "claiming_phrase_or_legato_quality",
                "audio_transform_or_rendering",
                "model_training",
                "game_asset_inclusion",
                "public_distribution",
            ],
            "next_gate": "manual source-and-rights review, then a separately scoped audio-analysis decision",
        },
        "continuous_recording_review_candidates": long_candidates,
        "records": records,
    }


def write_report(report: Mapping[str, Any], output: str | Path, *, root: str | Path, overwrite: bool) -> None:
    output_path = Path(output).expanduser()
    source_root = Path(root).expanduser().resolve(strict=True)
    try:
        resolved_output = output_path.resolve(strict=False)
    except (OSError, RuntimeError) as exc:
        raise ScoutError("output destination cannot be resolved") from exc
    if _is_within(resolved_output, source_root):
        raise ScoutError("report output must be outside the explicit audio root")
    if resolved_output.exists() and not overwrite:
        raise ScoutError("report output already exists; pass --overwrite to replace it")
    resolved_output.parent.mkdir(parents=True, exist_ok=True)
    resolved_output.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="explicit audio root to read")
    parser.add_argument("--root-id", required=True, help="safe non-path identifier stored in the report")
    parser.add_argument("--output", required=True, type=Path, help="new JSON report outside --root")
    parser.add_argument(
        "--known-ngc-manifest",
        type=Path,
        help="optional controlled NGC manifest for local byte-SHA comparison only",
    )
    parser.add_argument(
        "--reference-catalog",
        action="append",
        type=_parse_reference_catalog,
        default=[],
        metavar="LABEL=PATH",
        help="optional local R&D source catalog; it never proves external origin",
    )
    parser.add_argument("--overwrite", action="store_true", help="replace an existing report")
    parser.add_argument(
        "--confirm-read-only",
        action="store_true",
        help="required acknowledgement that this only inventories explicit sources",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_read_only:
        print("continuous_daegeum_scout: pass --confirm-read-only", file=sys.stderr)
        return 2
    try:
        report = build_report(
            args.root,
            root_id=args.root_id,
            known_ngc_manifest=args.known_ngc_manifest,
            reference_catalogs=args.reference_catalog,
        )
        write_report(report, args.output, root=args.root, overwrite=args.overwrite)
    except ScoutError as exc:
        print(f"continuous_daegeum_scout: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({"output": str(args.output), "summary": report["summary"]}, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
