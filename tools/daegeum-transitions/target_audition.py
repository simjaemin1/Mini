#!/usr/bin/env python3
"""Make a bounded, truth-labelled priority queue for Daegeum candidates.

R&D-06 deliberately leaves every automatically detected candidate
``unreviewed``.  That is correct for a transition bank, but it makes a large
review queue awkward: a score may need 77->74 before it needs an arbitrary
F0 step at a different pitch.  This helper is the bridge *to review*, not a
renderer or a new bank.

For every score target in an existing R&D-06 bundle it computes one least
squares **global** pitch shift for each candidate:

    shift = ((target_pre - candidate_pre) + (target_post - candidate_post)) / 2

The remaining endpoint disagreement is the candidate's interval error.  No
per-note retuning is used in the ranking.  The resulting HTML/JSON/TSV puts
the most interval-compatible unreviewed candidates first and emits two raw
auditions for each shortlisted candidate:

* A: a source-faithful, wider context crop;
* B: a source-faithful, boundary-focus crop.

Both raw auditions copy the exact native source sample bytes into a small
canonical RIFF wrapper.  They do not use the calculated shift.  Optionally,
``--render-gesture-warps`` also makes a *separately labelled* offline preview
using Rubber Band's pitch map: one bounded global shift plus a small linear
endpoint correction across the proposed boundary.  That P preview is
explicitly synthetic processing, is never source-faithful, and must not be
called native legato, a natural transition, an approved item, or a game asset.

No file beneath public/assets, no game manifest, and no default BGM is read or
written by this tool.

Example:

    python tools/daegeum-transitions/target_audition.py \
      --bundle _bgm_rnd/daegeum-transition-bank-final-YYYYMMDD \
      --raw-daegeum-dir /path/to/direct-wavs \
      --output-dir _bgm_rnd/daegeum-target-audition-YYYYMMDD \
      --render-gesture-warps
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path, PurePosixPath
from typing import Any, Iterable, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import NativeWavError, inspect_wav, sha256_file  # noqa: E402


SCHEMA = "durango.daegeum.transition-bank.v1"
TARGET_REVIEW_SCHEMA = f"{SCHEMA}.target-priority-review.v1"
RAW_AUDITION_SCHEMA = f"{SCHEMA}.source-faithful-audition.v1"
GESTURE_WARP_SCHEMA = f"{SCHEMA}.gesture-warp-preview.v1"

DEFAULT_TOP_PER_TARGET = 6
DEFAULT_FOCUS_PADDING_S = 0.225
DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES = 2.0
DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES = 0.50
CONTINUOUS_DETECTOR = "f0_change_candidate"
REARTICULATION_DETECTOR = "same_pitch_onset_candidate"


class TargetAuditionError(RuntimeError):
    """An input cannot support a truthful target-priority review artifact."""


def _json_dump(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _jsonl_dump(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def _json_load(path: Path, *, label: str) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise TargetAuditionError(f"bundle has no {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise TargetAuditionError(f"bundle {label} is not JSON") from exc


def _jsonl_load(path: Path, *, label: str) -> list[dict[str, Any]]:
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError as exc:
        raise TargetAuditionError(f"bundle has no {label}: {path.name}") from exc
    rows: list[dict[str, Any]] = []
    for line_number, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            item = json.loads(line)
        except json.JSONDecodeError as exc:
            raise TargetAuditionError(f"{label}:{line_number} is not JSON") from exc
        if not isinstance(item, dict):
            raise TargetAuditionError(f"{label}:{line_number} is not an object")
        rows.append(item)
    return rows


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _inside(root: Path, child: Path) -> Path:
    resolved = child.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise TargetAuditionError("raw source path escapes an explicit --raw-daegeum-dir") from exc
    return resolved


def _normalise_roots(values: str | Path | Sequence[str | Path]) -> list[Path]:
    if isinstance(values, (str, Path)):
        values = [values]
    if not values:
        raise TargetAuditionError("at least one --raw-daegeum-dir is required for raw auditions")
    roots: list[Path] = []
    seen: set[Path] = set()
    for value in values:
        root = Path(value).expanduser().resolve()
        if not root.is_dir():
            raise TargetAuditionError("each --raw-daegeum-dir must be a readable directory")
        if root in seen:
            raise TargetAuditionError("the same --raw-daegeum-dir was supplied more than once")
        seen.add(root)
        roots.append(root)
    return roots


def _safe_relative_path(value: Any) -> PurePosixPath:
    if not isinstance(value, str) or not value or "\\" in value:
        raise TargetAuditionError("catalog source relative_path must be a non-empty POSIX relative path")
    relative = PurePosixPath(value)
    if relative.is_absolute() or ".." in relative.parts or "." in relative.parts:
        raise TargetAuditionError("catalog source relative_path is not a safe relative path")
    return relative


def _source_catalog(bundle: Path) -> dict[str, dict[str, Any]]:
    data = _json_load(bundle / "source_catalog.json", label="source_catalog.json")
    if not isinstance(data, Mapping) or data.get("schema") != f"{SCHEMA}.source-catalog.v1":
        raise TargetAuditionError("source_catalog.json does not have the R&D-06 source-catalog schema")
    files = data.get("files")
    if not isinstance(files, list) or not files:
        raise TargetAuditionError("source_catalog.json has no source files")
    output: dict[str, dict[str, Any]] = {}
    for index, item in enumerate(files, 1):
        if not isinstance(item, dict):
            raise TargetAuditionError(f"source_catalog.json.files[{index}] is not an object")
        source_id, digest = item.get("source_id"), item.get("sha256")
        if not isinstance(source_id, str) or not isinstance(digest, str) or len(digest) != 64:
            raise TargetAuditionError(f"source_catalog.json.files[{index}] has no valid source identity")
        _safe_relative_path(item.get("relative_path"))
        if source_id in output:
            raise TargetAuditionError("source_catalog.json repeats a source_id")
        output[source_id] = item
    return output


def _coverage_targets(bundle: Path, selected: Sequence[str] | None) -> list[dict[str, Any]]:
    data = _json_load(bundle / "coverage.json", label="coverage.json")
    if not isinstance(data, Mapping) or data.get("schema") != f"{SCHEMA}.coverage.v1":
        raise TargetAuditionError("coverage.json does not have the R&D-06 coverage schema")
    rows = data.get("targets")
    if not isinstance(rows, list) or not rows:
        raise TargetAuditionError("coverage.json has no score targets")
    targets: list[dict[str, Any]] = []
    wanted = set(selected or [])
    found: set[str] = set()
    for index, item in enumerate(rows, 1):
        if not isinstance(item, dict):
            raise TargetAuditionError(f"coverage.json.targets[{index}] is not an object")
        target_id = item.get("target_id")
        try:
            before = float(item.get("from_midi"))
            after = float(item.get("to_midi"))
        except (TypeError, ValueError) as exc:
            raise TargetAuditionError(f"coverage target {target_id!r} lacks finite MIDI endpoints") from exc
        if not isinstance(target_id, str) or not target_id or not math.isfinite(before) or not math.isfinite(after):
            raise TargetAuditionError(f"coverage.json.targets[{index}] has invalid target identity/endpoints")
        if wanted and target_id not in wanted:
            continue
        found.add(target_id)
        targets.append({
            "target_id": target_id,
            "from_midi": before,
            "to_midi": after,
            "required_capability": item.get("required_capability"),
            "gesture_classes": list(item.get("gesture_classes", [])),
            "coverage_status_at_input": item.get("status"),
        })
    missing = wanted - found
    if missing:
        raise TargetAuditionError("requested --target is absent from coverage.json: " + ", ".join(sorted(missing)))
    return targets


def _unreviewed_candidates(bundle: Path, sources: Mapping[str, Mapping[str, Any]]) -> list[dict[str, Any]]:
    rows = _jsonl_load(bundle / "candidates.jsonl", label="candidates.jsonl")
    candidates: list[dict[str, Any]] = []
    seen: set[str] = set()
    for number, item in enumerate(rows, 1):
        candidate_id = item.get("candidate_id")
        source = item.get("source")
        evidence = item.get("auto_evidence")
        region = item.get("region_frames")
        if not isinstance(candidate_id, str) or not candidate_id or candidate_id in seen:
            raise TargetAuditionError(f"candidates.jsonl:{number} has an invalid or duplicate candidate_id")
        seen.add(candidate_id)
        if item.get("status") != "unreviewed" or item.get("automatic_detection_is_not_a_musical_gesture_label") is not True:
            raise TargetAuditionError(
                f"candidates.jsonl:{number} is not an explicit unreviewed automatic candidate"
            )
        if not isinstance(source, Mapping) or not isinstance(evidence, Mapping) or not isinstance(region, Mapping):
            raise TargetAuditionError(f"candidates.jsonl:{number} is structurally incomplete")
        source_id = source.get("source_id")
        catalog = sources.get(source_id) if isinstance(source_id, str) else None
        if catalog is None or source.get("sha256") != catalog.get("sha256") or source.get("relative_path") != catalog.get("relative_path"):
            raise TargetAuditionError(f"candidates.jsonl:{number} does not preserve catalog source provenance")
        detector = evidence.get("detector_class")
        if detector not in {CONTINUOUS_DETECTOR, REARTICULATION_DETECTOR}:
            raise TargetAuditionError(f"candidates.jsonl:{number} has an unknown detector class")
        try:
            pre = float(evidence.get("pre_midi_proxy"))
            post = float(evidence.get("post_midi_proxy"))
            confidence = float(evidence.get("voicing_confidence"))
            rms_valley = float(evidence.get("rms_valley_db_relative_to_stable_anchors"))
            onset_flux = float(evidence.get("onset_flux"))
            start = int(region.get("context_start"))
            boundary = int(region.get("boundary_center"))
            end = int(region.get("context_end"))
            proposed = region.get("proposed_boundary_window")
            if not isinstance(proposed, list) or len(proposed) != 2:
                raise ValueError("proposed boundary range")
            proposed_start, proposed_end = int(proposed[0]), int(proposed[1])
        except (TypeError, ValueError) as exc:
            raise TargetAuditionError(f"candidates.jsonl:{number} has invalid candidate proxy/frame values") from exc
        native = catalog.get("native")
        if not isinstance(native, Mapping):
            raise TargetAuditionError(f"candidates.jsonl:{number} source lacks native metadata")
        frame_count = native.get("frame_count")
        if type(frame_count) is not int or not (0 <= start < proposed_start < proposed_end <= end <= frame_count):
            raise TargetAuditionError(f"candidates.jsonl:{number} leaves its native source bounds")
        if not (proposed_start <= boundary < proposed_end):
            raise TargetAuditionError(f"candidates.jsonl:{number} boundary does not lie in its proposed window")
        if not all(math.isfinite(value) for value in (pre, post, confidence, rms_valley, onset_flux)):
            raise TargetAuditionError(f"candidates.jsonl:{number} has non-finite automatic evidence")
        candidates.append(item)
    if not candidates:
        raise TargetAuditionError("candidates.jsonl has no unreviewed candidates to rank")
    return candidates


def _target_detector_compatible(target: Mapping[str, Any], detector_class: str) -> bool:
    """Only use the detector class appropriate to the score capability.

    This does not validate a gesture.  It merely prevents a same-pitch onset
    detector from being quietly promoted as a candidate for a changing-pitch
    target, and vice versa.
    """

    capability = target.get("required_capability")
    if capability == "transition_retrieval":
        return detector_class == CONTINUOUS_DETECTOR
    if capability == "expression_articulation":
        return detector_class == REARTICULATION_DETECTOR
    return False


def _round(value: float) -> float:
    return round(float(value), 6)


def rank_candidate(candidate: Mapping[str, Any], target: Mapping[str, Any], *,
                   max_global_shift_semitones: float = DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES,
                   max_endpoint_correction_semitones: float = DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES) -> dict[str, Any]:
    """Return one auditable score-target comparison for an unreviewed candidate.

    ``global_pitch_shift`` is one least-squares offset applied to *both*
    endpoints.  It is a ranking measurement, not an authorization to render
    or pitch-shift a candidate.  The residual endpoint disagreement after
    that single shift is entirely determined by the interval mismatch.
    """

    evidence = candidate["auto_evidence"]
    region = candidate["region_frames"]
    pre = float(evidence["pre_midi_proxy"])
    post = float(evidence["post_midi_proxy"])
    target_pre = float(target["from_midi"])
    target_post = float(target["to_midi"])
    desired_pre_shift = target_pre - pre
    desired_post_shift = target_post - post
    global_shift = (desired_pre_shift + desired_post_shift) / 2.0
    candidate_interval = post - pre
    target_interval = target_post - target_pre
    interval_error = candidate_interval - target_interval
    residual_pre = target_pre - (pre + global_shift)
    residual_post = target_post - (post + global_shift)
    endpoint_correction = max(abs(residual_pre), abs(residual_post))
    detector = str(evidence["detector_class"])
    # These are deliberately only measured boundary *proxies*: a small RMS
    # change and low spectral/onset flux make a candidate easier to inspect
    # for the user's specific "volume jumps" failure mode, but neither proves
    # a slur, a single breath, nor a musical-quality judgement.
    rms_valley = float(evidence["rms_valley_db_relative_to_stable_anchors"])
    onset_flux = float(evidence["onset_flux"])
    compatible = _target_detector_compatible(target, detector)
    within_global = abs(global_shift) <= max_global_shift_semitones
    within_endpoint = endpoint_correction <= max_endpoint_correction_semitones
    source = candidate["source"]
    return {
        "candidate_id": candidate["candidate_id"],
        "source": {
            "source_id": source["source_id"],
            "sha256": source["sha256"],
            "relative_path": source["relative_path"],
        },
        "native_region_frames": {
            "context_start": int(region["context_start"]),
            "boundary_center": int(region["boundary_center"]),
            "proposed_boundary_window": [
                int(region["proposed_boundary_window"][0]),
                int(region["proposed_boundary_window"][1]),
            ],
            "context_end": int(region["context_end"]),
        },
        "automatic_candidate": {
            "status": "unreviewed",
            "automatic_detection_is_not_a_musical_gesture_label": True,
            "detector_class": detector,
            "voicing_confidence": _round(float(evidence["voicing_confidence"])),
        },
        "proxy_pitch": {
            "pre_midi": _round(pre),
            "post_midi": _round(post),
            "candidate_interval_semitones": _round(candidate_interval),
        },
        "score_target": {
            "target_id": target["target_id"],
            "from_midi": _round(target_pre),
            "to_midi": _round(target_post),
            "target_interval_semitones": _round(target_interval),
            "required_capability": target.get("required_capability"),
        },
        "single_global_pitch_shift": {
            "method": "least_squares_one_offset_for_both_proxy_endpoints",
            "semitones": _round(global_shift),
            "cents": _round(global_shift * 100.0),
            "pre_endpoint_requested_shift_semitones": _round(desired_pre_shift),
            "post_endpoint_requested_shift_semitones": _round(desired_post_shift),
            "not_applied_to_source_faithful_A_or_B": True,
        },
        "interval_error": {
            "candidate_minus_target_semitones": _round(interval_error),
            "candidate_minus_target_cents": _round(interval_error * 100.0),
            "absolute_cents": _round(abs(interval_error) * 100.0),
        },
        "endpoint_residual_after_single_global_shift": {
            "pre_semitones": _round(residual_pre),
            "post_semitones": _round(residual_post),
            "maximum_absolute_semitones": _round(endpoint_correction),
            "maximum_absolute_cents": _round(endpoint_correction * 100.0),
        },
        "boundary_continuity_proxies": {
            "rms_valley_db_relative_to_stable_anchors": _round(rms_valley),
            "absolute_rms_valley_db": _round(abs(rms_valley)),
            "onset_flux": _round(onset_flux),
            "not_a_slur_breath_or_quality_label": True,
        },
        "priority_gate": {
            "detector_class_matches_target_capability": compatible,
            "within_max_global_shift": within_global,
            "within_max_endpoint_correction": within_endpoint,
            "eligible_for_optional_gesture_warp_preview": compatible and within_global and within_endpoint,
            "not_eligible_for_transition_bank_or_coverage": True,
        },
    }


def rank_for_target(candidates: Sequence[Mapping[str, Any]], target: Mapping[str, Any], *,
                    max_global_shift_semitones: float = DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES,
                    max_endpoint_correction_semitones: float = DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES) -> list[dict[str, Any]]:
    """Rank all candidates with a fixed, visible lexicographic ordering."""

    rows = [rank_candidate(
        candidate,
        target,
        max_global_shift_semitones=max_global_shift_semitones,
        max_endpoint_correction_semitones=max_endpoint_correction_semitones,
    ) for candidate in candidates]

    # Interval fit comes first *within a practical bounded donor set* because
    # a global shift cannot change an interval.  Required detector
    # compatibility and the bounded P-preview gate outrank both quantities:
    # asking a reviewer to hear a candidate that already requires an unsafe
    # shift ahead of a bounded candidate is not actionable.  This is still a
    # priority queue only; it is deliberately not a quality/approval score.
    def key(row: Mapping[str, Any]) -> tuple[Any, ...]:
        gate = row["priority_gate"]
        interval = row["interval_error"]
        shift = row["single_global_pitch_shift"]
        continuity = row["boundary_continuity_proxies"]
        return (
            0 if gate["detector_class_matches_target_capability"] else 1,
            0 if gate["eligible_for_optional_gesture_warp_preview"] else 1,
            float(interval["absolute_cents"]),
            float(continuity["absolute_rms_valley_db"]),
            float(continuity["onset_flux"]),
            abs(float(shift["cents"])),
            -float(row["automatic_candidate"]["voicing_confidence"]),
            str(row["candidate_id"]),
        )

    rows.sort(key=key)
    for rank, row in enumerate(rows, 1):
        row["priority_rank"] = rank
        row["ranking_rule"] = (
            "compatible detector class, then bounded optional-P gate, then smallest absolute interval error, then boundary RMS/onset proxies, "
            "then smallest absolute one global shift, then higher automatic voicing confidence; never an approval/legato score"
        )
    return rows


def _resolve_source(source: Mapping[str, Any], roots: Sequence[Path]) -> Path:
    relative = _safe_relative_path(source.get("relative_path"))
    expected = source.get("sha256")
    if not isinstance(expected, str) or len(expected) != 64:
        raise TargetAuditionError("candidate source has no expected SHA-256")
    matches: list[Path] = []
    for root in roots:
        candidate = _inside(root, root.joinpath(*relative.parts))
        if candidate.is_file() and candidate.suffix.lower() == ".wav":
            try:
                if sha256_file(candidate) == expected:
                    matches.append(candidate)
            except NativeWavError as exc:
                raise TargetAuditionError("could not inspect a direct source WAV") from exc
    if not matches:
        raise TargetAuditionError(
            "no explicitly supplied raw root contains the exact SHA-256 source for " + str(relative)
        )
    if len(matches) > 1:
        raise TargetAuditionError("the same catalog source appears in more than one supplied raw root")
    return matches[0]


def _copy_exact(source: Path, offset: int, byte_count: int, destination: Path, *, prefix: bytes = b"") -> str:
    digest = hashlib.sha256()
    remaining = byte_count
    destination.parent.mkdir(parents=True, exist_ok=True)
    with source.open("rb") as input_stream, destination.open("wb") as output_stream:
        output_stream.write(prefix)
        input_stream.seek(offset)
        while remaining:
            block = input_stream.read(min(1024 * 1024, remaining))
            if not block:
                raise TargetAuditionError("raw source ended while extracting an audition crop")
            output_stream.write(block)
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def write_source_faithful_wav_slice(source_path: str | Path, start_frame: int, end_frame: int,
                                    output_path: str | Path) -> dict[str, Any]:
    """Copy exact native sample frames into a canonical WAV wrapper.

    The generated RIFF header intentionally excludes BWF/INFO metadata, but
    the sample-frame bytes between ``start_frame`` and ``end_frame`` are copied
    byte-for-byte.  Thus the crop is source-faithful audio, not a normalized,
    resampled, pitch-shifted, downmixed, faded, or decoded/re-encoded signal.
    """

    source = Path(source_path)
    output = Path(output_path)
    try:
        descriptor = inspect_wav(source)
    except NativeWavError as exc:
        raise TargetAuditionError("cannot inspect raw source for a source-faithful audition") from exc
    native = descriptor.get("native_audio")
    if not isinstance(native, Mapping):
        raise TargetAuditionError("native source has no audio descriptor")
    try:
        frame_count = int(native["frame_count"])
        channels = int(native["channels"])
        rate = int(native["sample_rate_hz"])
        block_align = int(native["block_align_bytes"])
        bits = int(native["bits_per_sample"])
        audio_format = int(native["effective_format_code"])
        data_offset = int(native["data_offset_bytes"])
        byte_rate = int(native["byte_rate"])
    except (KeyError, TypeError, ValueError) as exc:
        raise TargetAuditionError("native source descriptor is incomplete") from exc
    if audio_format not in {1, 3}:
        raise TargetAuditionError("source-faithful crop currently supports PCM or IEEE float WAV only")
    if not (0 <= start_frame < end_frame <= frame_count):
        raise TargetAuditionError("audition frame range lies outside the native source")
    sample_bytes = (end_frame - start_frame) * block_align
    if sample_bytes > 0xFFFFFFFF - 36:
        raise TargetAuditionError("source-faithful audition crop is too large for canonical RIFF WAV")
    if byte_rate != rate * block_align or block_align != channels * (bits // 8):
        raise TargetAuditionError("native WAV format layout is inconsistent")
    fmt = struct.pack("<HHIIHH", audio_format, channels, rate, byte_rate, block_align, bits)
    header = b"RIFF" + (36 + sample_bytes).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + len(fmt).to_bytes(4, "little") + fmt
    header += b"data" + sample_bytes.to_bytes(4, "little")
    payload_digest = _copy_exact(
        source,
        data_offset + start_frame * block_align,
        sample_bytes,
        output,
        prefix=header,
    )
    try:
        output_descriptor = inspect_wav(output)
    except NativeWavError as exc:
        raise TargetAuditionError("new source-faithful audition did not parse as WAV") from exc
    output_native = output_descriptor["native_audio"]
    if int(output_native["frame_count"]) != end_frame - start_frame:
        raise TargetAuditionError("source-faithful audition crop changed its frame count")
    return {
        "schema": RAW_AUDITION_SCHEMA,
        "raw_audio_is_source_faithful": True,
        "source_audio_frames_byte_for_byte_copied": True,
        "source_frame_range": [start_frame, end_frame],
        "source_sample_bytes_sha256": payload_digest,
        "source_sample_bytes": sample_bytes,
        "canonical_riff_wrapper_replaces_source_metadata": True,
        "processing": {
            "gain": "none",
            "pitch_shift": "none",
            "time_stretch": "none",
            "resample": "none",
            "channel_change": "none",
            "fade": "none",
        },
    }


def _source_faithful_auditions(row: Mapping[str, Any], source_path: Path, output: Path,
                               *, focus_padding_s: float) -> dict[str, Any]:
    region = row["native_region_frames"]
    try:
        descriptor = inspect_wav(source_path)
        rate = int(descriptor["native_audio"]["sample_rate_hz"])
    except (NativeWavError, KeyError, TypeError, ValueError) as exc:
        raise TargetAuditionError("could not determine source rate for raw audition crops") from exc
    context_start = int(region["context_start"])
    context_end = int(region["context_end"])
    boundary_start, boundary_end = (int(value) for value in region["proposed_boundary_window"])
    padding = max(0, int(round(focus_padding_s * rate)))
    focus_start = max(context_start, boundary_start - padding)
    focus_end = min(context_end, boundary_end + padding)
    if not (focus_start < focus_end):
        raise TargetAuditionError("cannot make a non-empty source-faithful boundary focus")
    candidate_id = str(row["candidate_id"])
    directory = output / "raw" / candidate_id
    context_path = directory / "A_raw_context.wav"
    focus_path = directory / "B_raw_boundary_focus.wav"
    context = write_source_faithful_wav_slice(source_path, context_start, context_end, context_path)
    focus = write_source_faithful_wav_slice(source_path, focus_start, focus_end, focus_path)
    return {
        "candidate_id": candidate_id,
        "source": dict(row["source"]),
        "A_raw_context": {
            **context,
            "artifact": context_path.relative_to(output).as_posix(),
        },
        "B_raw_boundary_focus": {
            **focus,
            "artifact": focus_path.relative_to(output).as_posix(),
        },
    }


def _pitchmap_text(row: Mapping[str, Any]) -> str:
    """Make a bounded, linear residual correction map for Rubber Band.

    Rubber Band uses frame positions relative to its input crop.  The map is
    constant in both stable areas and changes only across the proposed
    candidate boundary.  It is a preview method, never a claim about what the
    performer actually played.
    """

    region = row["native_region_frames"]
    context_start = int(region["context_start"])
    context_end = int(region["context_end"])
    boundary_start, boundary_end = (int(value) for value in region["proposed_boundary_window"])
    frame_count = context_end - context_start
    if frame_count < 2:
        raise TargetAuditionError("gesture-warp input needs at least two frames")
    residual = row["endpoint_residual_after_single_global_shift"]
    pre = float(residual["pre_semitones"])
    post = float(residual["post_semitones"])
    anchors = [
        (0, pre),
        (max(0, boundary_start - context_start), pre),
        (min(frame_count - 1, boundary_end - context_start), post),
        (frame_count - 1, post),
    ]
    deduplicated: list[tuple[int, float]] = []
    for frame, offset in anchors:
        if deduplicated and frame == deduplicated[-1][0]:
            deduplicated[-1] = (frame, offset)
        else:
            deduplicated.append((frame, offset))
    return "".join(f"{frame} {offset:.9f}\n" for frame, offset in deduplicated)


def _rubberband_version(executable: str) -> str | None:
    try:
        result = subprocess.run(
            [executable, "--version"], text=True, capture_output=True, check=False, timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return None
    text = (result.stdout or result.stderr).strip()
    return text.splitlines()[0] if text else None


def _gesture_warp_preview(row: Mapping[str, Any], raw_context: Path, output: Path, *,
                          executable: str, max_global_shift_semitones: float,
                          max_endpoint_correction_semitones: float) -> dict[str, Any]:
    """Render an explicitly non-source-faithful offline gesture-donor preview."""

    gate = row["priority_gate"]
    if not gate["eligible_for_optional_gesture_warp_preview"]:
        return {
            "schema": GESTURE_WARP_SCHEMA,
            "status": "not_rendered_outside_bounded_preview_gate",
            "not_source_faithful": True,
            "not_native_legato": True,
            "not_approved_transition": True,
            "not_game_asset": True,
        }
    candidate_id = str(row["candidate_id"])
    target_id = str(row["score_target"]["target_id"])
    directory = output / "gesture-warp" / target_id
    directory.mkdir(parents=True, exist_ok=True)
    pitchmap = directory / f"{candidate_id}.pitchmap.txt"
    rendered = directory / f"{candidate_id}.P_gesture_warp_preview.wav"
    pitchmap.write_text(_pitchmap_text(row), encoding="utf-8")
    global_shift = float(row["single_global_pitch_shift"]["semitones"])
    command = [
        executable,
        "-q",
        "-3",
        "-F",
        "--centre-focus",
        "--pitchmap",
        str(pitchmap),
        "--pitch",
        f"{global_shift:.9f}",
        str(raw_context),
        str(rendered),
    ]
    try:
        result = subprocess.run(command, text=True, capture_output=True, check=False, timeout=120)
    except (OSError, subprocess.SubprocessError) as exc:
        return {
            "schema": GESTURE_WARP_SCHEMA,
            "status": "render_failed",
            "failure": type(exc).__name__,
            "not_source_faithful": True,
            "not_native_legato": True,
            "not_approved_transition": True,
            "not_game_asset": True,
        }
    if result.returncode != 0 or not rendered.is_file():
        return {
            "schema": GESTURE_WARP_SCHEMA,
            "status": "render_failed",
            "return_code": result.returncode,
            "not_source_faithful": True,
            "not_native_legato": True,
            "not_approved_transition": True,
            "not_game_asset": True,
        }
    # Parsing confirms the output is a real audio file but it must never be
    # confused with the direct WAV or source-faithful A/B files.
    try:
        rendered_native = inspect_wav(rendered)["native_audio"]
    except NativeWavError as exc:
        raise TargetAuditionError("Rubber Band preview output did not parse as WAV") from exc
    return {
        "schema": GESTURE_WARP_SCHEMA,
        "status": "rendered",
        "artifact": rendered.relative_to(output).as_posix(),
        "pitchmap_artifact": pitchmap.relative_to(output).as_posix(),
        "method": "rubberband_R3_formant_pitchmap",
        "global_pitch_shift_semitones": _round(global_shift),
        "maximum_global_shift_semitones": _round(max_global_shift_semitones),
        "maximum_endpoint_correction_semitones": _round(max_endpoint_correction_semitones),
        "input_is_source_faithful_raw_A": True,
        "not_source_faithful": True,
        "not_native_legato": True,
        "not_natural_transition_claim": True,
        "not_approved_transition": True,
        "not_transition_bank_item": True,
        "not_game_asset": True,
        "output_native_audio": {
            "sample_rate_hz": int(rendered_native["sample_rate_hz"]),
            "channels": int(rendered_native["channels"]),
            "frame_count": int(rendered_native["frame_count"]),
            "encoding": str(rendered_native["encoding"]),
        },
    }


def _url(value: str) -> str:
    # Output paths are generated solely from safe candidate/target IDs.  This
    # modest escape still keeps the HTML robust if an input bundle is malformed.
    return value.replace("&", "%26").replace(" ", "%20").replace('"', "%22")


def _write_html(path: Path, target_rows: Sequence[Mapping[str, Any]], *, output: Path,
                render_warps: bool) -> None:
    blocks: list[str] = []
    for target in target_rows:
        target_id = html.escape(str(target["target"]["target_id"]))
        rows: list[str] = []
        for row in target["shortlist"]:
            raw = row.get("raw_auditions", {})
            context = raw.get("A_raw_context", {}).get("artifact")
            focus = raw.get("B_raw_boundary_focus", {}).get("artifact")
            preview = row.get("gesture_warp_preview", {})
            processed = preview.get("artifact") if isinstance(preview, Mapping) else None
            links = []
            if isinstance(context, str):
                links.append(f'<a href="{_url(context)}">A raw context</a>')
            if isinstance(focus, str):
                links.append(f'<a href="{_url(focus)}">B raw boundary focus</a>')
            if isinstance(processed, str):
                links.append(f'<a href="{_url(processed)}">P processed gesture-warp</a>')
            gate = row["priority_gate"]
            interval = row["interval_error"]["candidate_minus_target_cents"]
            shift = row["single_global_pitch_shift"]["cents"]
            rows.append(
                "<tr>"
                f"<td>{row['priority_rank']}</td>"
                f"<td><code>{html.escape(str(row['candidate_id']))}</code></td>"
                f"<td>{html.escape(str(row['automatic_candidate']['detector_class']))}</td>"
                f"<td>{row['proxy_pitch']['pre_midi']:.2f} → {row['proxy_pitch']['post_midi']:.2f}</td>"
                f"<td>{shift:+.1f}¢</td><td>{interval:+.1f}¢</td>"
                f"<td>{'bounded preview possible' if gate['eligible_for_optional_gesture_warp_preview'] else 'raw review only'}</td>"
                f"<td>{' · '.join(links) if links else 'no raw source found'}</td>"
                "</tr>"
            )
        blocks.append(
            f"<section><h2>{target_id}: {target['target']['from_midi']:.0f} → {target['target']['to_midi']:.0f}</h2>"
            f"<p>Input coverage status: <code>{html.escape(str(target['target'].get('coverage_status_at_input')))}</code>. "
            "Every row remains an unreviewed automatic candidate.</p>"
            "<table><thead><tr><th>rank</th><th>candidate</th><th>detector</th><th>proxy MIDI</th>"
            "<th>one global shift</th><th>interval error</th><th>gate</th><th>auditions</th>"
            "</tr></thead><tbody>" + "\n".join(rows) + "</tbody></table></section>"
        )
    processed_note = (
        "P files are deliberately labelled processed gesture-warp previews. They are not source-faithful, "
        "not native legato, not natural-transition evidence, not approved, not transition-bank items, and not game assets."
        if render_warps else
        "No processed P preview was requested; only source-faithful raw A/B review crops were emitted."
    )
    page = """<!doctype html><html lang="en"><meta charset="utf-8"><title>Daegeum target-priority review</title>
<style>body{margin:2rem auto;max-width:1180px;background:#10151c;color:#dce8f3;font:15px system-ui;line-height:1.5}section{border:1px solid #40505e;padding:1rem;margin:1rem 0}h1,h2{color:#f4c95d}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:.45rem;border-bottom:1px solid #33404b;text-align:left;vertical-align:top}code{font-size:11px}a{color:#7bdff2}p{color:#c4d0da}.warning{border-left:4px solid #f4a261;padding-left:1rem}</style>
<h1>Daegeum target-priority review</h1>
<p class="warning"><strong>This is a review queue, not a transition bank.</strong> Rank uses automatic F0 proxies and one least-squares global pitch shift plus interval error. It does not identify slur, breath, tongue, fingering, natural legato, or approval.</p>
<p>A and B are source-faithful audio sample-frame crops: no gain, pitch shift, time stretch, resample, channel change, or fade. They use a new minimal RIFF wrapper only. """ + html.escape(processed_note) + "</p>\n" + "\n".join(blocks) + "\n</html>"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")


def _write_tsv(path: Path, target_rows: Sequence[Mapping[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.writer(stream, delimiter="\t")
        writer.writerow([
            "target_id", "priority_rank", "candidate_id", "source", "detector_class", "proxy_pre_midi",
            "proxy_post_midi", "global_shift_cents", "interval_error_cents", "compatible_detector",
            "bounded_gesture_warp_gate", "A_raw_context", "B_raw_boundary_focus", "P_gesture_warp",
        ])
        for target in target_rows:
            target_id = target["target"]["target_id"]
            for row in target["shortlist"]:
                raw = row.get("raw_auditions", {})
                preview = row.get("gesture_warp_preview", {})
                writer.writerow([
                    target_id, row["priority_rank"], row["candidate_id"], row["source"]["relative_path"],
                    row["automatic_candidate"]["detector_class"], row["proxy_pitch"]["pre_midi"],
                    row["proxy_pitch"]["post_midi"], row["single_global_pitch_shift"]["cents"],
                    row["interval_error"]["candidate_minus_target_cents"],
                    row["priority_gate"]["detector_class_matches_target_capability"],
                    row["priority_gate"]["eligible_for_optional_gesture_warp_preview"],
                    raw.get("A_raw_context", {}).get("artifact", ""),
                    raw.get("B_raw_boundary_focus", {}).get("artifact", ""),
                    preview.get("artifact", "") if isinstance(preview, Mapping) else "",
                ])


def _ensure_no_root_leak(stage: Path, roots: Sequence[Path]) -> None:
    root_texts = {str(root) for root in roots}
    for artifact in stage.rglob("*"):
        if not artifact.is_file() or artifact.suffix.lower() not in {".json", ".jsonl", ".html", ".tsv", ".txt"}:
            continue
        text = artifact.read_text(encoding="utf-8")
        if any(root in text for root in root_texts):
            raise TargetAuditionError("an absolute raw-root path leaked into a review artifact")


def build_target_priority(
    bundle_dir: str | Path,
    raw_daegeum_roots: str | Path | Sequence[str | Path],
    output_dir: str | Path,
    *,
    targets: Sequence[str] | None = None,
    top_per_target: int = DEFAULT_TOP_PER_TARGET,
    focus_padding_s: float = DEFAULT_FOCUS_PADDING_S,
    render_gesture_warps: bool = False,
    max_global_shift_semitones: float = DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES,
    max_endpoint_correction_semitones: float = DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES,
    rubberband_executable: str | None = None,
) -> dict[str, Any]:
    """Build a fresh non-default target review artifact and return provenance."""

    bundle = Path(bundle_dir).expanduser().resolve()
    if not bundle.is_dir():
        raise TargetAuditionError("--bundle must be an existing R&D-06 bundle directory")
    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise TargetAuditionError("--output-dir must be fresh so earlier review artifacts stay intact")
    if not output.parent.is_dir():
        raise TargetAuditionError("--output-dir parent directory does not exist")
    if top_per_target < 1:
        raise TargetAuditionError("--top-per-target must be at least one")
    if focus_padding_s < 0.0 or not math.isfinite(focus_padding_s):
        raise TargetAuditionError("--focus-padding-s must be a finite non-negative number")
    if (
        not math.isfinite(max_global_shift_semitones)
        or not math.isfinite(max_endpoint_correction_semitones)
        or max_global_shift_semitones <= 0.0
        or max_endpoint_correction_semitones <= 0.0
    ):
        raise TargetAuditionError("gesture-warp bounds must be finite positive numbers")
    roots = _normalise_roots(raw_daegeum_roots)
    catalog = _source_catalog(bundle)
    coverage = _coverage_targets(bundle, targets)
    candidates = _unreviewed_candidates(bundle, catalog)
    executable = None
    if render_gesture_warps:
        executable = rubberband_executable or shutil.which("rubberband")
        if executable is None:
            raise TargetAuditionError("--render-gesture-warps needs a Rubber Band CLI named 'rubberband'")
    source_cache: dict[str, Path] = {}
    raw_cache: dict[str, dict[str, Any]] = {}
    with tempfile.TemporaryDirectory(prefix=f".{output.name}.stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        target_rows: list[dict[str, Any]] = []
        audition_manifest: list[dict[str, Any]] = []
        for target in coverage:
            ranked = rank_for_target(
                candidates,
                target,
                max_global_shift_semitones=max_global_shift_semitones,
                max_endpoint_correction_semitones=max_endpoint_correction_semitones,
            )
            shortlist: list[dict[str, Any]] = []
            for ranked_row in ranked[:top_per_target]:
                row = dict(ranked_row)
                candidate_id = str(row["candidate_id"])
                source_id = str(row["source"]["source_id"])
                source_path = source_cache.get(source_id)
                if source_path is None:
                    source_path = _resolve_source(row["source"], roots)
                    source_cache[source_id] = source_path
                raw = raw_cache.get(candidate_id)
                if raw is None:
                    raw = _source_faithful_auditions(
                        row, source_path, stage, focus_padding_s=focus_padding_s
                    )
                    raw_cache[candidate_id] = raw
                row["raw_auditions"] = raw
                preview: dict[str, Any] | None = None
                if executable is not None:
                    context_relative = raw["A_raw_context"]["artifact"]
                    preview = _gesture_warp_preview(
                        row,
                        stage / context_relative,
                        stage,
                        executable=executable,
                        max_global_shift_semitones=max_global_shift_semitones,
                        max_endpoint_correction_semitones=max_endpoint_correction_semitones,
                    )
                    row["gesture_warp_preview"] = preview
                audition_manifest.append({
                    "schema": TARGET_REVIEW_SCHEMA + ".audition-row.v1",
                    "target_id": target["target_id"],
                    "candidate_id": candidate_id,
                    "priority_rank": row["priority_rank"],
                    "automatic_candidate_remains_unreviewed": True,
                    "raw_auditions": raw,
                    "gesture_warp_preview": preview,
                })
                shortlist.append(row)
            target_rows.append({
                "target": target,
                "ranking_count": len(ranked),
                "shortlist": shortlist,
                "all_ranked_candidates": ranked,
            })
        rankings = {
            "schema": TARGET_REVIEW_SCHEMA,
            "purpose": "target-priority human listening queue; not a transition bank or approval artifact",
            "automatic_candidates_remain_unreviewed": True,
            "single_global_shift_ranking_only": True,
            "source_faithful_A_and_B_have_no_pitch_time_gain_or_channel_processing": True,
            "gesture_warp_P_is_opt_in_processed_offline_preview_only": render_gesture_warps,
            "targets": target_rows,
        }
        _json_dump(stage / "target_priority.json", rankings)
        _jsonl_dump(stage / "audition_manifest.jsonl", audition_manifest)
        _write_tsv(stage / "target_priority.tsv", target_rows)
        _write_html(stage / "index.html", target_rows, output=stage, render_warps=render_gesture_warps)
        provenance = {
            "schema": TARGET_REVIEW_SCHEMA + ".provenance.v1",
            "input_bundle_name": bundle.name,
            "input_bundle_artifact_hashes": {
                "source_catalog.json": _sha256(bundle / "source_catalog.json"),
                "candidates.jsonl": _sha256(bundle / "candidates.jsonl"),
                "coverage.json": _sha256(bundle / "coverage.json"),
            },
            "raw_source_modified": False,
            "absolute_raw_source_roots_not_embedded": True,
            "ranking": {
                "method": "one least-squares global shift plus interval error; no per-note retuning",
                "top_per_target": top_per_target,
                "focus_padding_s": focus_padding_s,
                "max_global_shift_semitones_for_processed_P_only": max_global_shift_semitones,
                "max_endpoint_correction_semitones_for_processed_P_only": max_endpoint_correction_semitones,
            },
            "raw_A_B": {
                "source_faithful": True,
                "sample_frames_copied_byte_for_byte": True,
                "canonical_riff_wrapper_only": True,
                "no_gain_pitch_time_resample_channel_or_fade_processing": True,
            },
            "gesture_warp_P": {
                "requested": render_gesture_warps,
                "rubberband_version": _rubberband_version(executable) if executable else None,
                "not_source_faithful": True,
                "not_native_legato": True,
                "not_natural_transition_claim": True,
                "not_approved_transition": True,
                "not_transition_bank_item": True,
                "not_game_asset": True,
            },
            "counts": {
                "input_unreviewed_candidate_count": len(candidates),
                "target_count": len(target_rows),
                "shortlist_rows": len(audition_manifest),
                "unique_source_faithful_A_B_candidate_pairs": len(raw_cache),
                "rendered_processed_P_previews": sum(
                    1 for row in audition_manifest
                    if isinstance(row.get("gesture_warp_preview"), Mapping)
                    and row["gesture_warp_preview"].get("status") == "rendered"
                ),
            },
        }
        _json_dump(stage / "provenance.json", provenance)
        _ensure_no_root_leak(stage, roots)
        # Re-check every direct source actually used after local crop/render
        # work.  The raw-source SHA travels in the input candidate/source row.
        for source_id, path in source_cache.items():
            if sha256_file(path) != catalog[source_id]["sha256"]:
                raise TargetAuditionError("a direct source changed while target auditions were built")
        stage.rename(output)
    return provenance


def dry_run_document() -> dict[str, Any]:
    return {
        "schema": TARGET_REVIEW_SCHEMA + ".dry-run.v1",
        "default_top_per_target": DEFAULT_TOP_PER_TARGET,
        "ranking": {
            "one_global_pitch_shift": "least-squares shift for both automatic proxy endpoints",
            "interval_error": "candidate proxy interval minus score target interval",
            "ordering": [
                "target-compatible detector class",
                "within the bounded optional P-preview gate",
                "smallest absolute interval error",
                "smallest boundary RMS/onset discontinuity proxies",
                "smallest absolute one global shift",
                "higher automatic voicing confidence",
            ],
            "not_a_gesture_or_approval_score": True,
            "boundary_proxies_do_not_identify_slur_breath_or_quality": True,
        },
        "A_B_raw_auditions": {
            "source_faithful": True,
            "sample_frame_bytes_copied": True,
            "processing": "none; canonical RIFF wrapper only",
        },
        "P_gesture_warp_preview": {
            "opt_in": True,
            "tool": "Rubber Band R3 formant pitchmap",
            "bounded_global_shift_semitones": DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES,
            "bounded_endpoint_correction_semitones": DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES,
            "not_source_faithful": True,
            "not_native_legato": True,
            "not_approved": True,
            "not_game_asset": True,
        },
        "never_touches": ["public/assets", "game BGM manifests", "default BGM"],
    }


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", type=Path, help="existing R&D-06 transition-bank bundle")
    parser.add_argument("--raw-daegeum-dir", type=Path, action="append",
                        help="explicit direct WAV root; repeat for separate source sets")
    parser.add_argument("--output-dir", type=Path, default=Path("out_daegeum_target_audition"),
                        help="fresh target-priority review directory")
    parser.add_argument("--target", action="append",
                        help="optional coverage target_id to review; repeat to select several")
    parser.add_argument("--top-per-target", type=int, default=DEFAULT_TOP_PER_TARGET)
    parser.add_argument("--focus-padding-s", type=float, default=DEFAULT_FOCUS_PADDING_S)
    parser.add_argument("--render-gesture-warps", action="store_true",
                        help="also render explicitly non-source-faithful offline P previews via Rubber Band")
    parser.add_argument("--max-global-shift-semitones", type=float, default=DEFAULT_MAX_GLOBAL_SHIFT_SEMITONES)
    parser.add_argument("--max-endpoint-correction-semitones", type=float,
                        default=DEFAULT_MAX_ENDPOINT_CORRECTION_SEMITONES)
    parser.add_argument("--rubberband", type=str,
                        help="optional explicit Rubber Band CLI path/name when --render-gesture-warps is used")
    parser.add_argument("--dry-run", action="store_true", help="print the no-audio target-audition contract")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.dry_run:
            print(json.dumps(dry_run_document(), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.bundle is None or args.raw_daegeum_dir is None:
            raise TargetAuditionError("--bundle and at least one --raw-daegeum-dir are required; use --dry-run otherwise")
        result = build_target_priority(
            args.bundle,
            args.raw_daegeum_dir,
            args.output_dir,
            targets=args.target,
            top_per_target=args.top_per_target,
            focus_padding_s=args.focus_padding_s,
            render_gesture_warps=args.render_gesture_warps,
            max_global_shift_semitones=args.max_global_shift_semitones,
            max_endpoint_correction_semitones=args.max_endpoint_correction_semitones,
            rubberband_executable=args.rubberband,
        )
    except (TargetAuditionError, NativeWavError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "output": str(args.output_dir),
        "shortlist_rows": result["counts"]["shortlist_rows"],
        "rendered_processed_P_previews": result["counts"]["rendered_processed_P_previews"],
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
