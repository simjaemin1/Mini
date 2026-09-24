#!/usr/bin/env python3
"""Build a read-only, conservative inventory for explicit audio source roots.

This is deliberately an R&D cataloguer, not an audio importer.  It never
copies, decodes, converts, trims, labels, or otherwise changes a source audio
file.  Callers must supply every root explicitly; the report contains only a
generic root id and source-relative paths, never an absolute user path.

Only RIFF/RF64 WAVE files are structurally inspected, through the sibling
``native_wav.py`` reader.  Other common audio extensions are still hashed and
listed, but their container, duration, and audio parameters remain unknown.
That distinction is intentional: a filename extension is not a decoder.

The filename classifier preserves a small set of unambiguous instrument and
title keywords as *hints*.  It does not infer legal clearance, performer,
articulation, phrase continuity, transition quality, or game eligibility.
"""

from __future__ import annotations

import argparse
from collections import defaultdict
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import sys
from typing import Any, Iterable, Mapping, Sequence
import unicodedata


SCHEMA = "durango.gugak.corpus-inventory.v1"
TOOL_ID = "gugak-corpus-inventory"
COPY_BUFFER_BYTES = 1024 * 1024
AUDIO_SUFFIXES = frozenset({".wav", ".flac", ".mp3", ".ogg", ".m4a", ".aif", ".aiff"})


class InventoryError(ValueError):
    """An explicit input is unsafe or insufficient for a source inventory."""


# Values are deliberately restricted to names that are explicit in the local
# source filenames.  Short/generic terms such as "so" and "ji" are omitted:
# producing an unknown is safer than guessing an instrument family.
FAMILY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("daepiri", ("daepiri", "대피리")),
    ("dangpiri", ("dangpiri", "당피리")),
    ("sepiri", ("sepiri", "세피리")),
    ("hyangpiri", ("hyangpiri", "향피리")),
    ("piri", ("piri", "피리")),
    ("daegeum", ("daegeum", "deageum", "taegeum", "taegum", "대금")),
    ("danso", ("danso", "단소")),
    ("sogeum", ("sogeum", "소금")),
    ("taepyeongso", ("taepyeongso", "태평소")),
    ("tungso", ("tungso", "tongso", "퉁소")),
    ("nabal", ("nabal", "나발")),
    ("nagak", ("nagak", "나각")),
    ("gayageum", ("gayageum", "kayageum", "kayagum", "가야금")),
    ("geomungo", ("geomungo", "gumungo", "komungo", "kumungo", "거문고")),
    ("ajaeng", ("ajaeng", "아쟁")),
    ("haegeum", ("haegeum", "해금")),
    ("yanggeum", ("yanggeum", "양금")),
    ("geum", ("geum", "금")),
    ("seul", ("seul", "슬")),
    ("kkwaenggwari", ("kkwaenggwari", "꽹과리")),
    ("janggu", ("janggu", "changgo", "장구")),
    ("jing", ("jing", "징")),
    ("jingo", ("jingo", "진고")),
    ("geongo", ("geongo", "건고")),
    ("gyobanggo", ("gyobanggo", "교방고")),
    ("nogo", ("nogo", "노고")),
    ("nodo", ("nodo", "노도")),
    ("bara", ("bara", "바라")),
    ("bak", ("bak", "박")),
    ("banghyang", ("banghyang", "방향")),
    ("saggo", ("saggo", "삭고")),
    ("eo", ("eo", "어")),
    ("yeonggo", ("yeonggo", "영고")),
    ("yeongdo", ("yeongdo", "영도")),
    ("yonggo", ("yonggo", "용고")),
    ("eunggo", ("eunggo", "응고")),
    ("jeolgo", ("jeolgo", "절고")),
    ("jwago", ("jwago", "좌고")),
    ("chuk", ("chuk", "축")),
    ("teukgyeong", ("teukgyeong", "teuggyeong", "특경")),
    ("teukjong", ("teukjong", "teugjong", "특종")),
    ("pyeongyeong", ("pyeongyeong", "pyeongyeoing", "편경")),
    ("pyeonjong", ("pyeonjong", "편종")),
)

# A generic ``piri`` title must not turn an explicitly named subtype into an
# ambiguity.  Other co-occurring named families remain ambiguous on purpose.
PIRI_SUBTYPES = frozenset({"daepiri", "dangpiri", "sepiri", "hyangpiri"})

PERFORMANCE_KEYWORDS = (
    "phrase",
    "performance",
    "reference",
    "연주곡",
    "참고연주",
    "악구",
)
TECHNIQUE_KEYWORDS = (
    "scale",
    "staccato",
    "vib",
    "vibrato",
    "sustain",
    "sus",
    "nonghyun",
    "nonghyon",
    "glissando",
    "음계",
    "스타카토",
    "농음",
    "농현",
    "시김새",
    "추성",
    "퇴성",
    "나니르",
    "니라",
    "니레",
    "노니로",
    "더름",
    "시루",
)

_NATIVE_WAV_MODULE: Any | None = None


def _safe_path_name(path: Path) -> str:
    """Return only a basename for an error; reports never expose full paths."""

    return path.name or "audio root"


def _load_native_wav() -> Any:
    """Load the no-dependency RIFF/RF64 inspector shipped in this repository."""

    global _NATIVE_WAV_MODULE
    if _NATIVE_WAV_MODULE is not None:
        return _NATIVE_WAV_MODULE

    module_path = Path(__file__).resolve().parents[1] / "daegeum-transitions" / "native_wav.py"
    if not module_path.is_file():
        raise InventoryError("the sibling native WAV inspector is unavailable")
    spec = importlib.util.spec_from_file_location("gugak_corpus_inventory_native_wav", module_path)
    if spec is None or spec.loader is None:
        raise InventoryError("the sibling native WAV inspector could not be loaded")
    module = importlib.util.module_from_spec(spec)
    # Dataclasses in the sibling module expect their module to be registered.
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    _NATIVE_WAV_MODULE = module
    return module


def _hash_file(path: Path) -> str:
    """Hash source bytes without making a copy or decoding audio."""

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(COPY_BUFFER_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _normalise_stem(stem: str) -> tuple[set[str], str]:
    """Return conservative filename tokens and a normalized title string."""

    text = unicodedata.normalize("NFKC", stem)
    # Preserve useful English camel-case boundaries before lowercasing.
    text = re.sub(r"(?<=[a-z])(?=[A-Z])", " ", text)
    normalized = text.casefold()
    tokens = set(re.findall(r"[a-z0-9]+|[가-힣]+", normalized))
    return tokens, normalized


def _keyword_matches(
    tokens: set[str], normalized: str, keywords: Iterable[str]
) -> list[str]:
    """Return literal title keywords; Korean compounds may contain a keyword."""

    result: list[str] = []
    for keyword in keywords:
        if keyword.isascii():
            if keyword in tokens:
                result.append(keyword)
        # A one-character Korean word is too broad for a compound title.  It
        # may still be an exact filename token (for example ``박_Bak_1``), but
        # never becomes a substring match inside an unrelated Korean word.
        elif keyword in tokens or (len(keyword) >= 2 and keyword in normalized):
            result.append(keyword)
    return sorted(set(result))


def classify_filename(filename: str) -> dict[str, dict[str, Any]]:
    """Return lexical family/role hints without claiming audio content.

    This function deliberately looks only at the supplied filename.  A match
    means a title contains a known token, not that the recording has been
    heard, segmented, legally cleared, or judged usable.
    """

    stem = Path(filename).stem
    tokens, normalized = _normalise_stem(stem)
    family_aliases: dict[str, list[str]] = {}
    for family, aliases in FAMILY_RULES:
        matches = _keyword_matches(tokens, normalized, aliases)
        if matches:
            family_aliases[family] = matches

    if "piri" in family_aliases and PIRI_SUBTYPES.intersection(family_aliases):
        del family_aliases["piri"]

    if not family_aliases:
        family_hint = {
            "status": "unknown",
            "value": None,
            "matched_filename_keywords": [],
        }
    elif len(family_aliases) == 1:
        family, aliases = next(iter(family_aliases.items()))
        family_hint = {
            "status": "filename_hint",
            "value": family,
            "matched_filename_keywords": aliases,
        }
    else:
        family_hint = {
            "status": "ambiguous_filename_hints",
            "value": None,
            "matched_filename_keywords": {
                family: family_aliases[family] for family in sorted(family_aliases)
            },
        }

    performance = _keyword_matches(tokens, normalized, PERFORMANCE_KEYWORDS)
    technique = _keyword_matches(tokens, normalized, TECHNIQUE_KEYWORDS)
    if performance and technique:
        role_hint = {
            "status": "multiple_filename_role_hints",
            "value": None,
            "matched_filename_keywords": {
                "performance_or_phrase": performance,
                "technique_or_exercise": technique,
            },
        }
    elif performance:
        role_hint = {
            "status": "filename_hint",
            "value": "named_phrase_or_performance_candidate",
            "matched_filename_keywords": performance,
        }
    elif technique:
        role_hint = {
            "status": "filename_hint",
            "value": "named_technique_or_exercise_candidate",
            "matched_filename_keywords": technique,
        }
    else:
        role_hint = {
            "status": "unknown",
            "value": None,
            "matched_filename_keywords": [],
        }
    return {"instrument_family_hint": family_hint, "source_role_hint": role_hint}


def _safe_native_descriptor(metadata: Mapping[str, Any]) -> dict[str, Any]:
    """Keep native numeric/container facts but not producer text metadata."""

    container = metadata["container"]
    native = metadata["native_audio"]
    return {
        "container": {
            "id": container["id"],
            "byte_order": container["byte_order"],
        },
        "native_audio": {
            "encoding": native["encoding"],
            "audio_format_code": native["audio_format_code"],
            "effective_format_code": native["effective_format_code"],
            "supported_for_decode": native["supported_for_decode"],
            "sample_rate_hz": native["sample_rate_hz"],
            "channels": native["channels"],
            "bits_per_sample": native["bits_per_sample"],
            "valid_bits_per_sample": native["valid_bits_per_sample"],
            "frame_count": native["frame_count"],
            "duration_seconds": native["duration_seconds"],
            "resampled": native["resampled"],
        },
    }


def _inspect_audio(path: Path, suffix: str, native_wav: Any) -> dict[str, Any]:
    """Hash a source and structurally inspect only safely supported WAV files."""

    try:
        byte_length = path.stat().st_size
    except OSError as exc:
        return {
            "sha256": None,
            "byte_length": None,
            "inspection": {
                "status": "unreadable",
                "error_kind": type(exc).__name__,
                "native_descriptor": None,
                "duration_seconds": None,
            },
        }

    if suffix == ".wav":
        try:
            metadata = native_wav.inspect_wav(path)
        except Exception as exc:  # The catalog must preserve a malformed source as unknown.
            try:
                digest = _hash_file(path)
            except OSError as hash_exc:
                return {
                    "sha256": None,
                    "byte_length": byte_length,
                    "inspection": {
                        "status": "unreadable",
                        "error_kind": type(hash_exc).__name__,
                        "native_descriptor": None,
                        "duration_seconds": None,
                    },
                }
            return {
                "sha256": digest,
                "byte_length": byte_length,
                "inspection": {
                    "status": "wav_inspection_failed",
                    "error_kind": type(exc).__name__,
                    "native_descriptor": None,
                    "duration_seconds": None,
                },
            }

        descriptor = _safe_native_descriptor(metadata)
        return {
            "sha256": metadata["sha256"],
            "byte_length": metadata["byte_length"],
            "inspection": {
                "status": "native_wav_inspected",
                "error_kind": None,
                "native_descriptor": descriptor,
                "duration_seconds": descriptor["native_audio"]["duration_seconds"],
            },
        }

    try:
        digest = _hash_file(path)
    except OSError as exc:
        return {
            "sha256": None,
            "byte_length": byte_length,
            "inspection": {
                "status": "unreadable",
                "error_kind": type(exc).__name__,
                "native_descriptor": None,
                "duration_seconds": None,
            },
        }
    return {
        "sha256": digest,
        "byte_length": byte_length,
        "inspection": {
            "status": "uninspected_non_wav_container",
            "error_kind": None,
            "native_descriptor": None,
            "duration_seconds": None,
        },
    }


def _safe_label(label: str) -> str:
    label = label.strip()
    if not label or label in {".", ".."} or any(character in label for character in "/\\:\x00"):
        raise InventoryError("each root label must be a short non-path identifier")
    if len(label) > 96:
        raise InventoryError("each root label must be at most 96 characters")
    return label


def _normalise_roots(
    roots: Sequence[str | Path], root_labels: Sequence[str] | None
) -> list[tuple[str, str, Path]]:
    if not roots:
        raise InventoryError("at least one explicit --root is required")
    if root_labels is not None and len(root_labels) != len(roots):
        raise InventoryError("--root-label must appear exactly once for each --root")

    result: list[tuple[str, str, Path]] = []
    seen: set[Path] = set()
    for index, raw_root in enumerate(roots, start=1):
        path = Path(raw_root).expanduser()
        try:
            resolved = path.resolve(strict=True)
        except (OSError, RuntimeError) as exc:
            raise InventoryError(f"audio root is unavailable: {_safe_path_name(path)!r}") from exc
        if not resolved.is_dir():
            raise InventoryError(f"audio root is not a directory: {_safe_path_name(path)!r}")
        if resolved in seen:
            raise InventoryError("the same explicit audio root was supplied more than once")
        seen.add(resolved)
        root_id = f"root_{index:03d}"
        label = _safe_label(root_labels[index - 1]) if root_labels is not None else root_id
        result.append((root_id, label, resolved))
    return result


def _walk_audio_files(root: Path) -> tuple[list[Path], dict[str, int]]:
    """Return in-root audio files without following symlink paths."""

    files: list[Path] = []
    stats = {
        "skipped_symlink_audio_file_count": 0,
        "skipped_symlink_directory_count": 0,
        "walk_error_count": 0,
    }

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
            suffix = candidate.suffix.casefold()
            if suffix not in AUDIO_SUFFIXES:
                continue
            if candidate.is_symlink():
                stats["skipped_symlink_audio_file_count"] += 1
                continue
            if candidate.is_file():
                files.append(candidate)
    return sorted(files, key=lambda item: item.relative_to(root).as_posix()), stats


def _merged_hint(occurrences: Sequence[Mapping[str, Any]], key: str) -> dict[str, Any]:
    """Merge duplicate filename hints only when every occurrence agrees."""

    values = [occurrence[key] for occurrence in occurrences]
    signatures = {(value["status"], json.dumps(value["value"], ensure_ascii=False, sort_keys=True)) for value in values}
    if len(signatures) == 1:
        # A Korean and a romanized filename can truthfully point at the same
        # family/role value even though their literal matched title tokens
        # differ.  Preserve both lexical facts without fabricating a conflict.
        matched_values = [value["matched_filename_keywords"] for value in values]
        if all(isinstance(matched, list) for matched in matched_values):
            merged_matches: Any = sorted({match for matched in matched_values for match in matched})
        elif len(
            {
                json.dumps(matched, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
                for matched in matched_values
            }
        ) == 1:
            merged_matches = matched_values[0]
        else:
            return {
                "status": "conflicting_or_partial_occurrence_hints",
                "value": None,
                "matched_filename_keywords": [],
            }
        return {
            "status": values[0]["status"],
            "value": values[0]["value"],
            "matched_filename_keywords": merged_matches,
        }
    return {
        "status": "conflicting_or_partial_occurrence_hints",
        "value": None,
        "matched_filename_keywords": [],
    }


def _policy() -> dict[str, Any]:
    return {
        "r_and_d_only": True,
        "explicit_audio_roots_required": True,
        "default_personal_path": None,
        "source_audio_copied": False,
        "source_audio_modified": False,
        "deduplication": "sha256_of_original_file_bytes",
        "native_descriptor_scope": "RIFF/RF64 WAVE only; other extensions remain uninspected",
        "filename_hints_are_not_identification_or_content_labels": True,
        "legal_clearance": "unknown_not_inferred",
        "articulation": "unknown_not_inferred",
        "phrase_continuity_or_quality": "unknown_not_inferred",
        "game_or_model_eligibility": "unknown_not_inferred",
    }


def build_inventory(
    roots: Sequence[str | Path], *, root_labels: Sequence[str] | None = None
) -> dict[str, Any]:
    """Inventory explicit audio roots and return a deterministic JSON-safe report."""

    root_specs = _normalise_roots(roots, root_labels)
    native_wav = _load_native_wav()
    occurrences: list[dict[str, Any]] = []
    root_reports: list[dict[str, Any]] = []

    for root_id, label, root in root_specs:
        audio_files, walk_stats = _walk_audio_files(root)
        inspected_statuses: defaultdict[str, int] = defaultdict(int)
        for path in audio_files:
            relative_path = path.relative_to(root).as_posix()
            suffix = path.suffix.casefold()
            hints = classify_filename(path.name)
            inspected = _inspect_audio(path, suffix, native_wav)
            status = inspected["inspection"]["status"]
            inspected_statuses[status] += 1
            occurrences.append(
                {
                    "root_id": root_id,
                    "relative_path": relative_path,
                    "file_extension": suffix[1:],
                    "sha256": inspected["sha256"],
                    "byte_length": inspected["byte_length"],
                    "inspection": inspected["inspection"],
                    **hints,
                }
            )
        root_reports.append(
            {
                "id": root_id,
                "label": label,
                "audio_file_count": len(audio_files),
                **walk_stats,
                "inspection_status_counts": dict(sorted(inspected_statuses.items())),
            }
        )

    grouped: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
    unhashed: list[dict[str, Any]] = []
    for occurrence in occurrences:
        if occurrence["sha256"] is None:
            unhashed.append(occurrence)
        else:
            grouped[occurrence["sha256"]].append(occurrence)

    items: list[dict[str, Any]] = []
    for digest in sorted(grouped):
        group = sorted(grouped[digest], key=lambda item: (item["root_id"], item["relative_path"]))
        canonical = group[0]
        items.append(
            {
                "id": f"sha256:{digest}",
                "sha256": digest,
                "byte_length": canonical["byte_length"],
                "occurrence_count": len(group),
                "instrument_family_hint": _merged_hint(group, "instrument_family_hint"),
                "source_role_hint": _merged_hint(group, "source_role_hint"),
                "canonical_inspection": canonical["inspection"],
                "occurrences": group,
            }
        )
    for index, occurrence in enumerate(
        sorted(unhashed, key=lambda item: (item["root_id"], item["relative_path"])), start=1
    ):
        items.append(
            {
                "id": f"unhashed:{index:06d}",
                "sha256": None,
                "byte_length": occurrence["byte_length"],
                "occurrence_count": 1,
                "instrument_family_hint": occurrence["instrument_family_hint"],
                "source_role_hint": occurrence["source_role_hint"],
                "canonical_inspection": occurrence["inspection"],
                "occurrences": [occurrence],
            }
        )

    status_counts: defaultdict[str, int] = defaultdict(int)
    for occurrence in occurrences:
        status_counts[occurrence["inspection"]["status"]] += 1
    root_stat_totals = {
        key: sum(root_report[key] for root_report in root_reports)
        for key in (
            "skipped_symlink_audio_file_count",
            "skipped_symlink_directory_count",
            "walk_error_count",
        )
    }
    return {
        "schema": SCHEMA,
        "tool": TOOL_ID,
        "policy": _policy(),
        "roots": root_reports,
        "summary": {
            "audio_files_discovered": len(occurrences),
            "unique_sha256_source_count": len(grouped),
            "unhashed_audio_file_count": len(unhashed),
            "duplicate_audio_file_count": len(occurrences) - len(grouped) - len(unhashed),
            **root_stat_totals,
            "inspection_status_counts": dict(sorted(status_counts.items())),
        },
        "items": items,
    }


def _is_within(candidate: Path, root: Path) -> bool:
    try:
        candidate.relative_to(root)
    except ValueError:
        return False
    return True


def write_report(
    report: Mapping[str, Any], output: str | Path, *, roots: Sequence[str | Path], overwrite: bool
) -> None:
    """Write only an explicitly requested report, never inside an audio root."""

    output_path = Path(output).expanduser().resolve()
    root_paths = [Path(root).expanduser().resolve() for root in roots]
    if any(_is_within(output_path, root) for root in root_paths):
        raise InventoryError("--output must be outside every explicit audio root")
    if not output_path.parent.is_dir():
        raise InventoryError("the --output parent directory does not exist")
    if output_path.exists() and not overwrite:
        raise InventoryError("--output already exists; pass --overwrite to replace that report")
    output_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        action="append",
        required=True,
        metavar="DIR",
        help="explicit audio source root; repeat to inventory multiple roots",
    )
    parser.add_argument(
        "--root-label",
        action="append",
        metavar="LABEL",
        help="optional non-path report label; supply once for every --root",
    )
    parser.add_argument(
        "--output",
        default="-",
        metavar="REPORT.json",
        help="write report to this new/explicitly overwritten file; default: stdout",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="allow replacing an existing explicit --output report",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = _parser()
    args = parser.parse_args(argv)
    try:
        report = build_inventory(args.root, root_labels=args.root_label)
        if args.output == "-":
            sys.stdout.write(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n")
        else:
            write_report(report, args.output, roots=args.root, overwrite=args.overwrite)
    except InventoryError as exc:
        parser.error(str(exc))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
