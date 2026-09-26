#!/usr/bin/env python3
"""Render an R&D-only, source-led 48 kHz stereo stem-mix preview.

The input lead is an already verified ``A_raw_lead_stem.wav`` from the
phrase-span audition contract.  This helper reads that file but never writes,
rewraps, pitches, time-stretches, resamples, trims, fades, or otherwise alters
it.  A separate float32 WAV is rendered only in a fresh R&D output directory.

Optional support hits are accepted only through a deliberately narrow manifest
that pins each hit's exact WAV bytes, native descriptor, contiguous source-span
attestation, placement, gain, pan, and R&D/rights gates.  The mixed preview is
therefore explicitly *not* source-faithful even when its lead input is.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import struct
import sys
from typing import Any, Mapping, Sequence

import numpy


HERE = Path(__file__).resolve().parent
NATIVE_WAV_DIR = HERE.parents[1] / "daegeum-transitions"
if str(NATIVE_WAV_DIR) not in sys.path:
    sys.path.insert(0, str(NATIVE_WAV_DIR))

from native_wav import NativeWavError, inspect_wav, read_native_wav, sha256_file  # noqa: E402


LEAD_MANIFEST_SCHEMA = "durango.daegeum.transition-bank.v1.phrase-span-audition.v1"
RAW_LEAD_STEM_SCHEMA = "durango.daegeum.transition-bank.v1.source-faithful-native-span.v1"
SUPPORT_HIT_MANIFEST_SCHEMA = "durango.source-led-stem-mixer.rnd-support-hit-manifest.v1"
MIX_MANIFEST_SCHEMA = "durango.source-led-stem-mixer.rnd-mixed-preview.v1"
MIX_FILENAME = "M_source_led_mixed_preview_48k_stereo.wav"
MIX_MANIFEST_FILENAME = "source_led_mix_manifest.json"
SAMPLE_RATE_HZ = 48_000
CHANNELS = 2
_SHA256 = re.compile(r"[0-9a-f]{64}")


class SourceLedStemMixerError(RuntimeError):
    """An input does not meet the source-led R&D-only mixer contract."""


def _json_load(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SourceLedStemMixerError(f"missing {label}") from exc
    except json.JSONDecodeError as exc:
        raise SourceLedStemMixerError(f"{label} is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise SourceLedStemMixerError(f"{label} must be a JSON object")
    return value


def _json_dump(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _sha256_bytes(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _require_mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise SourceLedStemMixerError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise SourceLedStemMixerError(f"{label}.{key} must explicitly be true")


def _require_string(value: Any, *, label: str, pattern: re.Pattern[str] | None = None) -> str:
    if not isinstance(value, str) or not value:
        raise SourceLedStemMixerError(f"{label} must be a non-empty string")
    if pattern is not None and pattern.fullmatch(value) is None:
        raise SourceLedStemMixerError(f"{label} has an invalid format")
    return value


def _require_sha256(value: Any, *, label: str) -> str:
    return _require_string(value, label=label, pattern=_SHA256)


def _require_int(value: Any, *, label: str, minimum: int | None = None) -> int:
    if type(value) is not int:
        raise SourceLedStemMixerError(f"{label} must be an integer")
    if minimum is not None and value < minimum:
        raise SourceLedStemMixerError(f"{label} is below its allowed range")
    return value


def _require_finite(value: Any, *, label: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool):
        raise SourceLedStemMixerError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SourceLedStemMixerError(f"{label} must be a finite number") from exc
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise SourceLedStemMixerError(f"{label} is outside its allowed range")
    return number


def _safe_relative_path(value: Any, *, label: str) -> PurePosixPath:
    raw = _require_string(value, label=label)
    if "\\" in raw:
        raise SourceLedStemMixerError(f"{label} must be a POSIX relative path")
    parsed = PurePosixPath(raw)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise SourceLedStemMixerError(f"{label} is not a safe relative path")
    return parsed


def _inside(root: Path, relative: PurePosixPath, *, label: str) -> Path:
    candidate = (root / relative).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise SourceLedStemMixerError(f"{label} escapes its declared root") from exc
    return candidate


def _source_roots(value: Any) -> dict[str, Path]:
    """Resolve only explicitly named source directories, never a glob/crawl."""

    roots = _require_mapping(value, label="support-hit manifest.source_roots")
    if not roots or len(roots) > 32:
        raise SourceLedStemMixerError("support-hit manifest.source_roots must contain 1 to 32 explicit roots")
    result: dict[str, Path] = {}
    for root_id, raw_path in roots.items():
        _require_string(root_id, label="support-hit manifest.source_roots key", pattern=re.compile(r"[A-Za-z0-9_-]{1,64}"))
        if not isinstance(raw_path, str) or not raw_path:
            raise SourceLedStemMixerError(f"support source root {root_id!r} must be an explicit absolute directory path")
        candidate = Path(raw_path)
        if not candidate.is_absolute():
            raise SourceLedStemMixerError(f"support source root {root_id!r} must be absolute, never manifest-relative")
        resolved = candidate.resolve()
        if not resolved.is_dir():
            raise SourceLedStemMixerError(f"support source root {root_id!r} is not an existing directory")
        if resolved in result.values():
            raise SourceLedStemMixerError("support source roots must not alias the same directory")
        result[root_id] = resolved
    return result


def _native_summary(native: Mapping[str, Any]) -> dict[str, Any]:
    return {
        "sample_rate_hz": int(native["sample_rate_hz"]),
        "channels": int(native["channels"]),
        "frame_count": int(native["frame_count"]),
        "encoding": str(native["encoding"]),
    }


def _require_expected_native(
    actual: Mapping[str, Any], expected: Mapping[str, Any], *, label: str, require_stereo: bool
) -> dict[str, Any]:
    expected_rate = _require_int(expected.get("sample_rate_hz"), label=f"{label}.sample_rate_hz", minimum=1)
    expected_channels = _require_int(expected.get("channels"), label=f"{label}.channels", minimum=1)
    expected_frames = _require_int(expected.get("frame_count"), label=f"{label}.frame_count", minimum=1)
    expected_encoding = _require_string(expected.get("encoding"), label=f"{label}.encoding")
    if require_stereo and (expected_rate != SAMPLE_RATE_HZ or expected_channels != CHANNELS):
        raise SourceLedStemMixerError(
            f"{label} must explicitly declare native 48 kHz stereo; lead conversion is forbidden"
        )
    summary = _native_summary(actual)
    expected_summary = {
        "sample_rate_hz": expected_rate,
        "channels": expected_channels,
        "frame_count": expected_frames,
        "encoding": expected_encoding,
    }
    if summary != expected_summary:
        raise SourceLedStemMixerError(f"actual WAV native descriptor does not match {label}")
    if require_stereo and summary["sample_rate_hz"] != SAMPLE_RATE_HZ:
        raise SourceLedStemMixerError("lead sample-rate conversion is forbidden; only native 48 kHz lead is accepted")
    if require_stereo and summary["channels"] != CHANNELS:
        raise SourceLedStemMixerError("lead channel conversion is forbidden; only native stereo lead is accepted")
    return summary


def _payload_sha256(path: Path, native: Mapping[str, Any]) -> str:
    try:
        offset = int(native["data_offset_bytes"])
        length = int(native["data_byte_length"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceLedStemMixerError("WAV native descriptor lacks sample-byte coordinates") from exc
    if offset < 0 or length < 1:
        raise SourceLedStemMixerError("WAV sample-byte coordinates are invalid")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        stream.seek(offset)
        remaining = length
        while remaining:
            block = stream.read(min(1024 * 1024, remaining))
            if not block:
                raise SourceLedStemMixerError("WAV ended before its declared sample payload")
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def _frame_payload_sha256(path: Path, native: Mapping[str, Any], start_frame: int, end_frame: int) -> str:
    """Hash one native WAV frame crop without decoding or rewriting it."""

    try:
        offset = int(native["data_offset_bytes"])
        block_align = int(native["block_align_bytes"])
        frame_count = int(native["frame_count"])
    except (KeyError, TypeError, ValueError) as exc:
        raise SourceLedStemMixerError("WAV native descriptor lacks frame-byte coordinates") from exc
    if not (0 <= start_frame < end_frame <= frame_count) or block_align < 1:
        raise SourceLedStemMixerError("native source frame crop is outside the SHA-verified WAV")
    digest = hashlib.sha256()
    remaining = (end_frame - start_frame) * block_align
    with path.open("rb") as stream:
        stream.seek(offset + start_frame * block_align)
        while remaining:
            block = stream.read(min(1024 * 1024, remaining))
            if not block:
                raise SourceLedStemMixerError("WAV ended inside the declared native source crop")
            digest.update(block)
            remaining -= len(block)
    return digest.hexdigest()


def _require_rnd_scope(value: Mapping[str, Any], *, label: str) -> dict[str, bool]:
    for key in (
        "r_and_d_only",
        "no_default_assets",
        "no_runtime_bgm",
        "no_game_output",
        "no_public_release",
    ):
        _require_true(value, key, label=label)
    return {
        "r_and_d_only": True,
        "no_default_assets": True,
        "no_runtime_bgm": True,
        "no_game_output": True,
        "no_public_release": True,
    }


def _require_rights_gate(value: Mapping[str, Any], *, label: str) -> dict[str, bool]:
    for key in (
        "r_and_d_mixing_authorized_for_this_manifest",
        "no_default_asset_or_runtime_use",
        "no_game_or_public_distribution_clearance",
        "requires_new_rights_review_for_scope_expansion",
    ):
        _require_true(value, key, label=label)
    return {
        "r_and_d_mixing_authorized_for_this_manifest": True,
        "no_default_asset_or_runtime_use": True,
        "no_game_or_public_distribution_clearance": True,
        "requires_new_rights_review_for_scope_expansion": True,
    }


def _validate_lead_manifest(path: Path) -> dict[str, Any]:
    manifest = _json_load(path, label="lead manifest")
    if manifest.get("schema") != LEAD_MANIFEST_SCHEMA:
        raise SourceLedStemMixerError("lead manifest is not the verified phrase-span audition schema")
    if manifest.get("artifact_kind") != "unreviewed_source_led_raw_lead_stem_audition":
        raise SourceLedStemMixerError("lead manifest does not describe a raw source-led A stem")
    raw = _require_mapping(manifest.get("A_raw_lead_stem"), label="lead manifest.A_raw_lead_stem")
    if raw.get("schema") != RAW_LEAD_STEM_SCHEMA:
        raise SourceLedStemMixerError("lead A is not the source-faithful native-span schema")
    if raw.get("artifact_role") != "unreviewed_source_led_raw_lead_stem_rnd_only":
        raise SourceLedStemMixerError("lead A artifact role is not the raw R&D-only lead-stem role")
    for key in (
        "raw_audio_is_source_faithful",
        "source_audio_frames_byte_for_byte_copied",
        "no_candidate_clip_stitching_or_crossfade",
        "not_a_game_asset",
        "not_a_training_item",
        "no_backing_mix_or_runtime_asset",
        "not_a_verified_phrase_or_gesture_boundary",
        "not_an_approved_transition_or_phrase",
    ):
        _require_true(raw, key, label="lead manifest.A_raw_lead_stem")
    raw_range = raw.get("single_contiguous_source_frame_range")
    if not isinstance(raw_range, list) or len(raw_range) != 2:
        raise SourceLedStemMixerError("lead A must retain one contiguous native source frame range")
    raw_start = _require_int(raw_range[0], label="lead A raw source frame start", minimum=0)
    raw_end = _require_int(raw_range[1], label="lead A raw source frame end", minimum=1)
    if raw_start >= raw_end:
        raise SourceLedStemMixerError("lead A raw source frame range must be increasing")
    processing = _require_mapping(raw.get("processing"), label="lead manifest.A_raw_lead_stem.processing")
    for key in ("gain", "pitch_shift", "time_stretch", "resample", "channel_change", "fade"):
        if processing.get(key) != "none":
            raise SourceLedStemMixerError(f"lead A has disallowed pre-mix processing: {key}")
    limits = _require_mapping(manifest.get("interpretation_limits"), label="lead manifest.interpretation_limits")
    for key in (
        "not_a_game_asset",
        "not_a_training_item",
        "no_runtime_BGM_or_public_asset_was_read_or_written",
        "all_events_remain_unreviewed_automatic_candidates",
        "boundary_triage_A_is_raw_lead_stem_only_with_no_backing_mix",
    ):
        _require_true(limits, key, label="lead manifest.interpretation_limits")
    input_block = _require_mapping(manifest.get("input"), label="lead manifest.input")
    selected_input = _require_mapping(input_block.get("selected_path"), label="lead manifest.input.selected_path")
    if selected_input.get("kind") != "phrase_boundary_triage_report":
        raise SourceLedStemMixerError("only the phrase-boundary raw lead-stem branch is accepted")
    triage_gate = _require_mapping(input_block.get("phrase_boundary_triage_gate"), label="lead manifest.input.phrase_boundary_triage_gate")
    for key in (
        "raw_source_sha256_verified_via_candidate_catalog_and_actual_direct_wav",
        "source_catalog_sha256_link_verified",
        "triage_candidate_and_report_trajectory_provenance_agree",
        "triage_direct_trajectory_catalog_link_and_sha256_attestation_preserved_not_rehashed",
        "triage_raw_source_attestation_matches_catalog_and_actual_native_descriptor",
        "triage_report_schema_and_sha256_identity_recorded",
        "triage_unreviewed_not_phrase_not_approved_not_training_not_game_limits_verified",
    ):
        _require_true(triage_gate, key, label="lead manifest.input.phrase_boundary_triage_gate")
    selected = _require_mapping(manifest.get("selected_path"), label="lead manifest.selected_path")
    source = _require_mapping(selected.get("source"), label="lead manifest.selected_path.source")
    source_id = _require_string(source.get("source_id"), label="lead source.source_id")
    source_sha256 = _require_sha256(source.get("sha256"), label="lead source.sha256")
    source_range = _require_mapping(selected.get("span"), label="lead manifest.selected_path.span").get("frame_range")
    if not isinstance(source_range, list) or len(source_range) != 2:
        raise SourceLedStemMixerError("lead manifest.selected_path.span.frame_range must be [start, end)")
    source_start = _require_int(source_range[0], label="lead source frame start", minimum=0)
    source_end = _require_int(source_range[1], label="lead source frame end", minimum=1)
    if source_start >= source_end:
        raise SourceLedStemMixerError("lead source frame range must be increasing")
    if [raw_start, raw_end] != [source_start, source_end]:
        raise SourceLedStemMixerError("lead A raw source range does not match the selected source-led span")
    artifact = _safe_relative_path(raw.get("artifact"), label="lead manifest.A_raw_lead_stem.artifact")
    if artifact.as_posix() != "A_raw_lead_stem.wav":
        raise SourceLedStemMixerError("lead manifest must resolve only its sibling A_raw_lead_stem.wav artifact")
    lead_path = _inside(path.parent.resolve(), artifact, label="lead A artifact")
    if not lead_path.is_file() or lead_path.suffix.lower() != ".wav":
        raise SourceLedStemMixerError("lead A artifact must be an existing direct WAV beside its manifest")
    expected_native = _require_mapping(raw.get("output_native_audio"), label="lead manifest.A_raw_lead_stem.output_native_audio")
    expected_payload = _require_sha256(raw.get("source_sample_bytes_sha256"), label="lead A source_sample_bytes_sha256")
    expected_bytes = _require_int(raw.get("source_sample_bytes"), label="lead A source_sample_bytes", minimum=1)
    try:
        descriptor = inspect_wav(lead_path)
    except NativeWavError as exc:
        raise SourceLedStemMixerError("lead A artifact cannot be inspected as a native WAV") from exc
    native = _require_mapping(descriptor.get("native_audio"), label="actual lead native descriptor")
    native_summary = _require_expected_native(native, expected_native, label="lead A output_native_audio", require_stereo=True)
    if int(native["data_byte_length"]) != expected_bytes:
        raise SourceLedStemMixerError("lead A sample-byte length differs from its verified manifest")
    if native_summary["frame_count"] != raw_end - raw_start:
        raise SourceLedStemMixerError("lead A frame count differs from its verified contiguous source range")
    if _payload_sha256(lead_path, native) != expected_payload:
        raise SourceLedStemMixerError("lead A sample payload differs from its verified manifest")
    try:
        decoded = read_native_wav(lead_path)
    except NativeWavError as exc:
        raise SourceLedStemMixerError("lead A cannot be decoded without conversion") from exc
    if decoded.samples.shape != (native_summary["frame_count"], CHANNELS):
        raise SourceLedStemMixerError("lead A decoded shape does not match its verified native descriptor")
    return {
        "manifest_basename": path.name,
        "manifest_sha256": _sha256_bytes(path),
        "path": lead_path,
        "file_sha256_before_mix": str(descriptor["sha256"]),
        "payload_sha256": expected_payload,
        "native_audio": native_summary,
        "samples": decoded.samples,
        "source_provenance": {
            "source_id": source_id,
            "source_sha256": source_sha256,
            "native_frame_range": [source_start, source_end],
        },
    }


def _validate_support_hit(
    value: Any,
    *,
    index: int,
    source_roots: Mapping[str, Path],
    lead_path: Path,
) -> dict[str, Any]:
    hit = _require_mapping(value, label=f"support_hits[{index}]")
    hit_id = _require_string(hit.get("hit_id"), label=f"support_hits[{index}].hit_id", pattern=re.compile(r"[A-Za-z0-9_-]{1,128}"))
    gate = _require_mapping(hit.get("hit_gate"), label=f"support_hits[{index}].hit_gate")
    for key in (
        "r_and_d_only",
        "not_default_asset",
        "not_runtime_bgm",
        "not_game_asset",
        "not_public_distribution",
        "not_a_training_item",
        "source_audio_is_direct_native_wav",
    ):
        _require_true(gate, key, label=f"support_hits[{index}].hit_gate")
    source = _require_mapping(hit.get("source"), label=f"support_hits[{index}].source")
    source_id = _require_string(source.get("source_id"), label=f"support_hits[{index}].source.source_id")
    root_id = _require_string(source.get("root_id"), label=f"support_hits[{index}].source.root_id", pattern=re.compile(r"[A-Za-z0-9_-]{1,64}"))
    if root_id not in source_roots:
        raise SourceLedStemMixerError(f"support_hits[{index}] names an undeclared source root")
    relative = _safe_relative_path(source.get("relative_path"), label=f"support_hits[{index}].source.relative_path")
    expected_sha = _require_sha256(source.get("sha256"), label=f"support_hits[{index}].source.sha256")
    expected_native = _require_mapping(source.get("native_audio"), label=f"support_hits[{index}].source.native_audio")
    provenance = _require_mapping(hit.get("native_source_span"), label=f"support_hits[{index}].native_source_span")
    frame_range = provenance.get("frame_range")
    if not isinstance(frame_range, list) or len(frame_range) != 2:
        raise SourceLedStemMixerError(f"support_hits[{index}].native_source_span.frame_range must be [start, end)")
    source_start = _require_int(frame_range[0], label=f"support_hits[{index}] source frame start", minimum=0)
    source_end = _require_int(frame_range[1], label=f"support_hits[{index}] source frame end", minimum=1)
    if source_start >= source_end:
        raise SourceLedStemMixerError(f"support_hits[{index}] source frame range must be increasing")
    _require_true(provenance, "single_contiguous_source_frame_range", label=f"support_hits[{index}].native_source_span")
    placement = _require_mapping(hit.get("placement"), label=f"support_hits[{index}].placement")
    start_frame = _require_int(placement.get("start_frame_48k"), label=f"support_hits[{index}].placement.start_frame_48k", minimum=0)
    start_seconds = _require_finite(placement.get("start_seconds"), label=f"support_hits[{index}].placement.start_seconds", minimum=0.0, maximum=86_400.0)
    if abs(start_seconds * SAMPLE_RATE_HZ - start_frame) > 1.0e-6:
        raise SourceLedStemMixerError(
            f"support_hits[{index}] start_seconds and start_frame_48k do not describe the same timestamp"
        )
    gain_db = _require_finite(placement.get("gain_db"), label=f"support_hits[{index}].placement.gain_db", minimum=-96.0, maximum=24.0)
    pan = _require_finite(placement.get("pan"), label=f"support_hits[{index}].placement.pan", minimum=-1.0, maximum=1.0)
    path = _inside(source_roots[root_id], relative, label=f"support_hits[{index}] source")
    if not path.is_file() or path.suffix.lower() != ".wav":
        raise SourceLedStemMixerError(f"support_hits[{index}] source must be an existing direct WAV")
    if path.resolve() == lead_path.resolve():
        raise SourceLedStemMixerError("a support hit cannot alias the raw lead A artifact")
    try:
        descriptor = inspect_wav(path)
    except NativeWavError as exc:
        raise SourceLedStemMixerError(f"support_hits[{index}] source cannot be inspected") from exc
    if descriptor.get("sha256") != expected_sha:
        raise SourceLedStemMixerError(f"support_hits[{index}] source SHA-256 does not match its manifest")
    native = _require_mapping(descriptor.get("native_audio"), label=f"support_hits[{index}] actual native descriptor")
    native_summary = _require_expected_native(
        native,
        expected_native,
        label=f"support_hits[{index}].source.native_audio",
        require_stereo=False,
    )
    if native_summary["channels"] not in {1, 2}:
        raise SourceLedStemMixerError("support hit must be native mono or stereo; arbitrary channel conversion is unavailable")
    if source_end > native_summary["frame_count"]:
        raise SourceLedStemMixerError("support hit frame crop lies outside its exact native source")
    try:
        decoded = read_native_wav(path)
    except NativeWavError as exc:
        raise SourceLedStemMixerError(f"support_hits[{index}] cannot be decoded at its native rate") from exc
    samples = decoded.samples[source_start:source_end]
    if samples.shape[0] != source_end - source_start:
        raise SourceLedStemMixerError(f"support_hits[{index}] decoded crop differs from its native frame range")
    return {
        "hit_id": hit_id,
        "source_root_id": root_id,
        "source_relative_path": relative.as_posix(),
        "source_sha256": expected_sha,
        "native_audio": native_summary,
        "source_provenance": {
            "source_id": source_id,
            "source_sha256": expected_sha,
            "native_frame_range": [source_start, source_end],
            "single_contiguous_source_frame_range": True,
            "selected_native_frame_payload_sha256": _frame_payload_sha256(path, native, source_start, source_end),
        },
        "placement": {"start_frame_48k": start_frame, "start_seconds": start_seconds, "gain_db": gain_db, "pan": pan},
        "path": path,
        "samples": samples,
    }


def _validate_support_manifest(path: Path, *, lead_path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = _json_load(path, label="support-hit manifest")
    if manifest.get("schema") != SUPPORT_HIT_MANIFEST_SCHEMA:
        raise SourceLedStemMixerError("support-hit manifest schema is not accepted by this R&D mixer")
    scope = _require_rnd_scope(_require_mapping(manifest.get("r_and_d_scope"), label="support-hit manifest.r_and_d_scope"), label="support-hit manifest.r_and_d_scope")
    rights = _require_rights_gate(_require_mapping(manifest.get("rights_gate"), label="support-hit manifest.rights_gate"), label="support-hit manifest.rights_gate")
    source_roots = _source_roots(manifest.get("source_roots"))
    hits = manifest.get("support_hits")
    if not isinstance(hits, list) or not hits:
        raise SourceLedStemMixerError("support-hit manifest must contain a non-empty explicit support_hits list")
    if len(hits) > 256:
        raise SourceLedStemMixerError("support-hit manifest exceeds the R&D-only explicit hit limit")
    validated = [
        _validate_support_hit(
            item,
            index=index,
            source_roots=source_roots,
            lead_path=lead_path,
        )
        for index, item in enumerate(hits, 1)
    ]
    identifiers = [item["hit_id"] for item in validated]
    if len(set(identifiers)) != len(identifiers):
        raise SourceLedStemMixerError("support-hit manifest repeats a hit_id")
    return {
        "provided": True,
        "manifest_basename": path.name,
        "manifest_sha256": _sha256_bytes(path),
        "r_and_d_scope": scope,
        "rights_gate": rights,
        "source_root_ids": sorted(source_roots),
    }, validated


def _linear_gain(gain_db: float) -> float:
    return float(10.0 ** (gain_db / 20.0))


def _pan_to_stereo(samples: numpy.ndarray, pan: float) -> tuple[numpy.ndarray, str]:
    """Apply only a mix-bus gain/balance, never a pitch/time/rate operation."""

    if samples.ndim != 2 or samples.shape[1] not in {1, 2}:
        raise SourceLedStemMixerError("only native mono or stereo stems may enter the mix bus")
    if samples.shape[1] == 1:
        left = math.sqrt((1.0 - pan) / 2.0)
        right = math.sqrt((1.0 + pan) / 2.0)
        return numpy.column_stack((samples[:, 0] * left, samples[:, 0] * right)).astype(numpy.float32), "mono_constant_power"
    result = samples.astype(numpy.float32, copy=True)
    # Stereo balance preserves both input channels exactly at center pan.
    result[:, 0] *= math.sqrt(1.0 - max(0.0, pan))
    result[:, 1] *= math.sqrt(1.0 + min(0.0, pan))
    return result, "stereo_balance"


def _resample_support_to_48k(samples: numpy.ndarray, source_rate_hz: int) -> tuple[numpy.ndarray, dict[str, Any]]:
    """Resample a support-only crop with a visible deterministic NumPy policy.

    This function is intentionally never called for A_raw_lead_stem.  Linear
    interpolation is a small, dependency-free R&D preview policy, not a claim
    of production-quality sample-rate conversion or performance preservation.
    """

    if samples.ndim != 2 or samples.shape[0] < 1:
        raise SourceLedStemMixerError("support source crop must contain at least one native frame")
    if source_rate_hz == SAMPLE_RATE_HZ:
        return samples.astype(numpy.float32, copy=True), {
            "applied": False,
            "method": "none_native_48k",
            "source_sample_rate_hz": source_rate_hz,
            "output_sample_rate_hz": SAMPLE_RATE_HZ,
            "source_frame_count": int(samples.shape[0]),
            "output_frame_count": int(samples.shape[0]),
        }
    output_frames = max(1, int(round(samples.shape[0] * SAMPLE_RATE_HZ / source_rate_hz)))
    positions = numpy.arange(output_frames, dtype=numpy.float64) * source_rate_hz / SAMPLE_RATE_HZ
    lower = numpy.floor(positions).astype(numpy.int64)
    lower = numpy.minimum(lower, samples.shape[0] - 1)
    upper = numpy.minimum(lower + 1, samples.shape[0] - 1)
    fraction = (positions - lower).astype(numpy.float32)[:, None]
    output = samples[lower] * (1.0 - fraction) + samples[upper] * fraction
    return output.astype(numpy.float32), {
        "applied": True,
        "method": "numpy_linear_interpolation_v1_support_only",
        "source_sample_rate_hz": source_rate_hz,
        "output_sample_rate_hz": SAMPLE_RATE_HZ,
        "source_frame_count": int(samples.shape[0]),
        "output_frame_count": output_frames,
    }


def _write_float32_stereo_wav(path: Path, samples: numpy.ndarray) -> None:
    if path.exists():
        raise SourceLedStemMixerError("refusing to overwrite a mixed-preview WAV")
    if samples.ndim != 2 or samples.shape[1] != CHANNELS or samples.shape[0] < 1:
        raise SourceLedStemMixerError("mixed preview must have at least one stereo frame")
    if not numpy.all(numpy.isfinite(samples)):
        raise SourceLedStemMixerError("mixed preview contains non-finite values")
    payload = numpy.ascontiguousarray(samples, dtype="<f4").tobytes()
    if len(payload) > 0xFFFFFFFF - 36:
        raise SourceLedStemMixerError("mixed preview is too large for canonical RIFF WAV")
    block_align = CHANNELS * 4
    byte_rate = SAMPLE_RATE_HZ * block_align
    fmt = struct.pack("<HHIIHH", 3, CHANNELS, SAMPLE_RATE_HZ, byte_rate, block_align, 32)
    header = b"RIFF" + (36 + len(payload)).to_bytes(4, "little") + b"WAVE"
    header += b"fmt " + len(fmt).to_bytes(4, "little") + fmt
    header += b"data" + len(payload).to_bytes(4, "little")
    with path.open("xb") as stream:
        stream.write(header)
        stream.write(payload)


def _round(value: float) -> float:
    return round(float(value), 9)


def build_source_led_mixed_preview(
    *,
    lead_manifest: str | Path,
    output_dir: str | Path,
    support_hit_manifest: str | Path | None = None,
    lead_gain_db: float = 0.0,
    lead_pan: float = 0.0,
) -> dict[str, Any]:
    """Render one separate mixed preview without mutating the raw lead A.

    The output directory must not exist.  All input validation and decoding
    happen before the directory is created, so rejected provenance cannot leave
    an apparent mix artifact behind.
    """

    lead_gain_db = _require_finite(lead_gain_db, label="lead_gain_db", minimum=-96.0, maximum=24.0)
    lead_pan = _require_finite(lead_pan, label="lead_pan", minimum=-1.0, maximum=1.0)
    lead_manifest_path = Path(lead_manifest).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise SourceLedStemMixerError("--output-dir must be fresh; refusing to overwrite an R&D artifact")
    lead = _validate_lead_manifest(lead_manifest_path)
    support_info: dict[str, Any] | None = None
    support_hits: list[dict[str, Any]] = []
    if support_hit_manifest is not None:
        support_path = Path(support_hit_manifest).expanduser().resolve()
        support_info, support_hits = _validate_support_manifest(
            support_path,
            lead_path=lead["path"],
        )
    lead_stereo, lead_panning_law = _pan_to_stereo(lead["samples"], lead_pan)
    lead_stereo *= _linear_gain(lead_gain_db)
    output_frames = int(lead_stereo.shape[0])
    rendered_hits: list[dict[str, Any]] = []
    prepared_hits: list[tuple[dict[str, Any], numpy.ndarray]] = []
    for hit in support_hits:
        start_frame = hit["placement"]["start_frame_48k"]
        resampled, resample = _resample_support_to_48k(hit["samples"], hit["native_audio"]["sample_rate_hz"])
        panned, panning_law = _pan_to_stereo(resampled, hit["placement"]["pan"])
        panned *= _linear_gain(hit["placement"]["gain_db"])
        end_frame = start_frame + int(panned.shape[0])
        output_frames = max(output_frames, end_frame)
        prepared_hits.append((hit, panned))
        rendered_hits.append(
            {
                "hit_id": hit["hit_id"],
                "support_source_root_id": hit["source_root_id"],
                "support_source_relative_path": hit["source_relative_path"],
                "support_source_sha256": hit["source_sha256"],
                "native_audio_verified": hit["native_audio"],
                "source_provenance": hit["source_provenance"],
                "mix_placement": {
                    "start_frame": start_frame,
                    "start_seconds": _round(hit["placement"]["start_seconds"]),
                    "end_frame": end_frame,
                    "end_seconds": _round(end_frame / SAMPLE_RATE_HZ),
                    "gain_db": _round(hit["placement"]["gain_db"]),
                    "linear_gain": _round(_linear_gain(hit["placement"]["gain_db"])),
                    "pan": _round(hit["placement"]["pan"]),
                    "panning_law": panning_law,
                    "support_resample": resample,
                    "pitch_shift": "none",
                    "time_stretch": "none",
                    "resample": "support_only_as_recorded_above",
                },
            }
        )
    mixed = numpy.zeros((output_frames, CHANNELS), dtype=numpy.float32)
    mixed[: lead_stereo.shape[0]] += lead_stereo
    for hit, panned in prepared_hits:
        start_frame = hit["placement"]["start_frame_48k"]
        mixed[start_frame : start_frame + panned.shape[0]] += panned
    if not numpy.all(numpy.isfinite(mixed)):
        raise SourceLedStemMixerError("mix-bus result is non-finite")
    output.mkdir(parents=True, exist_ok=False)
    temporary = output / f".{MIX_FILENAME}.tmp"
    rendered = output / MIX_FILENAME
    _write_float32_stereo_wav(temporary, mixed)
    # Confirm the input lead remained byte-identical before making the render
    # visible as an artifact.  The mixer only ever opened it for reading.
    lead_sha_after = sha256_file(lead["path"])
    if lead_sha_after != lead["file_sha256_before_mix"]:
        temporary.unlink(missing_ok=True)
        raise SourceLedStemMixerError("raw lead A changed during rendering; refusing to publish the mixed preview")
    temporary.replace(rendered)
    try:
        rendered_descriptor = inspect_wav(rendered)
    except NativeWavError as exc:
        raise SourceLedStemMixerError("rendered mixed preview cannot be inspected as a WAV") from exc
    rendered_native = _require_mapping(rendered_descriptor.get("native_audio"), label="rendered mixed preview native descriptor")
    rendered_summary = _native_summary(rendered_native)
    if (
        rendered_summary["sample_rate_hz"] != SAMPLE_RATE_HZ
        or rendered_summary["channels"] != CHANNELS
        or rendered_summary["frame_count"] != output_frames
        or rendered_summary["encoding"] != "IEEE_FLOAT"
    ):
        raise SourceLedStemMixerError("rendered mixed preview does not satisfy the 48 kHz stereo float contract")
    peak = float(numpy.max(numpy.abs(mixed)))
    result: dict[str, Any] = {
        "schema": MIX_MANIFEST_SCHEMA,
        "artifact_kind": "rnd_only_non_source_faithful_source_led_mixed_preview",
        "r_and_d_scope": {
            "r_and_d_only": True,
            "no_default_assets": True,
            "no_runtime_bgm": True,
            "no_game_output": True,
            "no_public_release": True,
        },
        "input": {
            "absolute_paths_omitted": True,
            "lead_manifest_basename": lead["manifest_basename"],
            "lead_manifest_sha256": lead["manifest_sha256"],
            "support_hit_manifest": (
                {**support_info, "support_hit_count": len(support_hits)}
                if support_info is not None else {
                    "provided": False,
                    "support_hit_count": 0,
                    "reason": "optional_support_hit_manifest_not_provided",
                }
            ),
        },
        "A_raw_lead_stem": {
            "source_faithful": True,
            "retained_untouched": True,
            "input_file_sha256_before_mix": lead["file_sha256_before_mix"],
            "input_file_sha256_after_mix": lead_sha_after,
            "input_file_sha256_unchanged": True,
            "source_sample_payload_sha256": lead["payload_sha256"],
            "native_audio_verified": lead["native_audio"],
            "source_provenance": lead["source_provenance"],
            "mix_placement": {
                "start_frame": 0,
                "start_seconds": 0.0,
                "end_frame": lead["native_audio"]["frame_count"],
                "end_seconds": _round(lead["native_audio"]["frame_count"] / SAMPLE_RATE_HZ),
                "gain_db": _round(lead_gain_db),
                "linear_gain": _round(_linear_gain(lead_gain_db)),
                "pan": _round(lead_pan),
                "panning_law": lead_panning_law,
                "pitch_shift": "forbidden_and_not_applied",
                "time_stretch": "forbidden_and_not_applied",
                "resample": "forbidden_and_not_applied",
                "trim": "forbidden_and_not_applied",
                "fade": "forbidden_and_not_applied",
                "channel_conversion": "forbidden_and_not_applied",
            },
        },
        "support_hits": rendered_hits,
        "M_mixed_preview": {
            "artifact": MIX_FILENAME,
            "sha256": str(rendered_descriptor["sha256"]),
            "native_audio": rendered_summary,
            "not_source_faithful": True,
            "separate_from_raw_lead_A": True,
            "rendering": {
                "sample_rate_hz": SAMPLE_RATE_HZ,
                "channels": CHANNELS,
                "encoding": "IEEE_FLOAT",
                "normalization": "none",
                "limiter": "none",
                "pitch_shift_of_lead": "forbidden_and_not_applied",
                "time_stretch_of_lead": "forbidden_and_not_applied",
                "resample_of_lead": "forbidden_and_not_applied",
                "lead_source_file_written": False,
                "peak_absolute_sample_before_float32_write": _round(peak),
                "peak_exceeds_unity_without_hidden_normalization": peak > 1.0,
            },
        },
        "interpretation_limits": {
            "raw_lead_A_remains_the_only_source_faithful_lead_artifact": True,
            "mixed_preview_is_not_source_faithful_and_not_a_replacement_for_A": True,
            "mix_is_not_evidence_of_same_breath_slur_natural_legato_or_expert_arrangement": True,
            "not_an_approved_transition_training_item_or_game_asset": True,
            "no_default_assets_runtime_bgm_or_public_assets_were_read_or_written": True,
            "support_sources_were_only_explicitly_supplied_not_selected_by_this_helper": True,
        },
    }
    _json_dump(output / MIX_MANIFEST_FILENAME, result)
    return result


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lead-manifest", required=True, help="verified span_audition.json containing A_raw_lead_stem")
    parser.add_argument("--support-hit-manifest", help="optional explicit R&D-only support-hit manifest")
    parser.add_argument("--output-dir", required=True, help="fresh R&D-only directory for M preview + manifest")
    parser.add_argument("--lead-gain-db", type=float, default=0.0, help="mix-bus lead gain only; raw A is never changed")
    parser.add_argument("--lead-pan", type=float, default=0.0, help="mix-bus lead pan in [-1, 1]; raw A is never changed")
    parser.add_argument("--confirm-rnd-only", action="store_true", help="required acknowledgement: M is not a default/runtime/game/public asset")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("source_led_stem_mixer: pass --confirm-rnd-only for this R&D-only render", file=sys.stderr)
        return 2
    try:
        result = build_source_led_mixed_preview(
            lead_manifest=args.lead_manifest,
            support_hit_manifest=args.support_hit_manifest,
            output_dir=args.output_dir,
            lead_gain_db=args.lead_gain_db,
            lead_pan=args.lead_pan,
        )
    except SourceLedStemMixerError as exc:
        print(f"source_led_stem_mixer: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
