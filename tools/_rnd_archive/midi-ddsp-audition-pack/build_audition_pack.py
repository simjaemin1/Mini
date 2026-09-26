#!/usr/bin/env python3
"""Make a monitoring-only, constant-gain A/B audition pack for MIDI-DDSP R&D.

The input is one successful ``mini.midi-ddsp-official-flute-rnd.v1`` report
directory containing its original A automatic-expression WAV and B
authorial-bridge WAV.  This utility never changes that directory or either
source file.  It writes fresh PCM16 copies elsewhere, applying exactly one
constant gain to every sample in each whole file.

The two gains are selected to match RMS over only the shared authored-active
interval ``[0.00, 6.48)`` seconds to a fixed monitoring target of ``-24.0
dBFS``.  A whole-file peak ceiling of ``-3.0 dBFS`` is checked after PCM16
quantization and fails closed before anything is written.  The fixed target
can therefore amplify quiet source files, but it never invokes a limiter or
any other hidden dynamics process.  It performs no compression, normalization
envelope, fade, EQ, resampling, trim, timing shift, or source audio/model
modification.  In particular, B's existing ``[6.48, 6.72)`` release receives
the same one whole-file gain as every other B sample; it is not separately
faded, reshaped, or extended.

This is a listening aid only.  Equal active-interval RMS is not physical
loudness calibration, expression calibration, a MIDI-DDSP model output, a
Daegeum performance claim, or a game asset approval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import sys
from typing import Any, Mapping, Sequence
import wave

import numpy as np


SCHEMA = "mini.midi-ddsp-audition-pack.v1"
INPUT_REPORT_FILENAME = "official_flute_rnd_report.json"
MANIFEST_FILENAME = "monitoring_audition_manifest.json"
A_KEY = "A_automatic_flute_expression"
B_KEY = "B_authorial_bridge6_controls"
A_OUTPUT_FILENAME = "A_automatic_flute_expression_active_rms_matched.wav"
B_OUTPUT_FILENAME = "B_authorial_bridge6_active_rms_matched.wav"
ACTIVE_START_SECONDS = 0.0
ACTIVE_END_SECONDS = 6.48
B_RELEASE_START_SECONDS = 6.48
B_RELEASE_END_SECONDS = 6.72
TARGET_ACTIVE_RMS_DBFS = -24.0
PEAK_CEILING_DBFS = -3.0


class MidiDdspAuditionPackError(RuntimeError):
    """The fixed audition operation cannot safely be applied."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_load(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise MidiDdspAuditionPackError(f"missing report: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise MidiDdspAuditionPackError(f"report is not valid JSON: {path.name}") from exc
    if not isinstance(value, Mapping):
        raise MidiDdspAuditionPackError("report must be a JSON object")
    return dict(value)


def _json_dump(path: Path, value: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _round(value: float) -> float:
    return round(float(value), 9)


def _safe_report_child(report_dir: Path, relative: Any, *, label: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise MidiDdspAuditionPackError(f"{label} must be a non-empty safe POSIX relative path")
    parsed = PurePosixPath(relative)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise MidiDdspAuditionPackError(f"{label} escapes the report directory")
    candidate = (report_dir / parsed).resolve()
    try:
        candidate.relative_to(report_dir)
    except ValueError as exc:
        raise MidiDdspAuditionPackError(f"{label} escapes the report directory") from exc
    return candidate


def _required_variant_audio(
    report: Mapping[str, Any],
    *,
    report_dir: Path,
    variant_key: str,
) -> tuple[Path, str, str]:
    variants = report.get("variants")
    if not isinstance(variants, Mapping):
        raise MidiDdspAuditionPackError("report has no variants object")
    variant = variants.get(variant_key)
    if not isinstance(variant, Mapping):
        raise MidiDdspAuditionPackError(f"report is missing {variant_key}")
    audio = variant.get("audio")
    if not isinstance(audio, Mapping):
        raise MidiDdspAuditionPackError(f"{variant_key} has no audio record")
    relative = audio.get("relative_path")
    expected_sha256 = audio.get("sha256")
    if not isinstance(expected_sha256, str) or len(expected_sha256) != 64:
        raise MidiDdspAuditionPackError(f"{variant_key} lacks a source SHA-256")
    source = _safe_report_child(report_dir, relative, label=f"{variant_key}.audio.relative_path")
    if not source.is_file():
        raise MidiDdspAuditionPackError(f"{variant_key} source WAV is missing")
    actual_sha256 = _sha256(source)
    if actual_sha256 != expected_sha256:
        raise MidiDdspAuditionPackError(f"{variant_key} source WAV SHA-256 does not match its R&D report")
    return source, str(relative), actual_sha256


def _read_pcm16_mono(path: Path) -> tuple[np.ndarray, dict[str, Any]]:
    """Read the exact source samples; this function never writes the source."""

    try:
        with wave.open(str(path), "rb") as source:
            channels = source.getnchannels()
            width = source.getsampwidth()
            rate = source.getframerate()
            frames = source.getnframes()
            compression = source.getcomptype()
            raw = source.readframes(frames)
    except (wave.Error, OSError) as exc:
        raise MidiDdspAuditionPackError(f"cannot read {path.name} as PCM WAVE") from exc
    if channels != 1 or width != 2 or rate < 1 or compression != "NONE":
        raise MidiDdspAuditionPackError(
            f"{path.name} must be uncompressed PCM16 mono; got channels={channels}, width={width}, compression={compression}"
        )
    expected = frames * channels * width
    if len(raw) != expected:
        raise MidiDdspAuditionPackError(f"{path.name} has a truncated PCM payload")
    samples = np.frombuffer(raw, dtype="<i2").copy()
    return samples, {
        "channels": channels,
        "bits_per_sample": width * 8,
        "sample_rate_hz": rate,
        "frame_count": frames,
        "duration_seconds": _round(frames / rate),
        "encoding": "PCM16_LE",
    }


def _write_pcm16_mono(path: Path, samples: np.ndarray, *, sample_rate_hz: int) -> None:
    if samples.dtype != np.dtype("int16") or samples.ndim != 1:
        raise MidiDdspAuditionPackError("output samples must be a one-dimensional int16 vector")
    with wave.open(str(path), "wb") as destination:
        destination.setnchannels(1)
        destination.setsampwidth(2)
        destination.setframerate(sample_rate_hz)
        destination.setcomptype("NONE", "not compressed")
        destination.writeframes(samples.astype("<i2", copy=False).tobytes())


def _frame_at(seconds: float, *, sample_rate_hz: int, label: str) -> int:
    raw = seconds * sample_rate_hz
    frame = int(round(raw))
    if abs(raw - frame) > 1.0e-9:
        raise MidiDdspAuditionPackError(f"{label} is not exactly representable at the source sample rate")
    return frame


def _rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        raise MidiDdspAuditionPackError("cannot measure RMS of an empty interval")
    return float(np.sqrt(np.mean(np.square(samples.astype(np.float64, copy=False)))))


def _dbfs(amplitude: float) -> float:
    if not math.isfinite(amplitude) or amplitude < 0.0:
        raise MidiDdspAuditionPackError("amplitude must be finite and non-negative")
    if amplitude == 0.0:
        return float("-inf")
    return 20.0 * math.log10(amplitude / 32768.0)


def _gain_db(gain: float) -> float:
    if not math.isfinite(gain) or gain <= 0.0:
        raise MidiDdspAuditionPackError("gain must be finite and positive")
    return 20.0 * math.log10(gain)


def _constant_gain_pcm16(samples: np.ndarray, *, gain: float) -> np.ndarray:
    """Apply one gain in integer PCM amplitude units, refusing any clipping."""

    if not math.isfinite(gain) or gain <= 0.0:
        raise MidiDdspAuditionPackError("monitoring gain must be finite and positive")
    scaled = np.rint(samples.astype(np.float64, copy=False) * gain)
    if np.any(scaled < -32768.0) or np.any(scaled > 32767.0):
        raise MidiDdspAuditionPackError("constant monitoring gain would clip; refusing hidden clipping")
    return scaled.astype(np.int16)


def _variant_measurement(
    *,
    label: str,
    source_relative_path: str,
    source_sha256: str,
    samples: np.ndarray,
    audio: Mapping[str, Any],
    active_start: int,
    active_end: int,
    target_rms: float,
    peak_ceiling_pcm16_units: float,
    output_filename: str,
) -> tuple[np.ndarray, dict[str, Any]]:
    active = samples[active_start:active_end]
    input_active_rms = _rms(active)
    gain = target_rms / input_active_rms
    output = _constant_gain_pcm16(samples, gain=gain)
    output_active_rms = _rms(output[active_start:active_end])
    input_peak = float(np.max(np.abs(samples.astype(np.int32, copy=False))))
    output_peak = float(np.max(np.abs(output.astype(np.int32, copy=False))))
    if output_peak > peak_ceiling_pcm16_units:
        raise MidiDdspAuditionPackError(
            f"{label} whole-file output peak {_dbfs(output_peak):.6f} dBFS exceeds "
            f"the {PEAK_CEILING_DBFS:.1f} dBFS monitoring ceiling"
        )
    return output, {
        "variant": label,
        "source": {
            "relative_path": source_relative_path,
            "sha256_before_and_after_read_only_operation": source_sha256,
            "audio": dict(audio),
        },
        "output": {
            "filename": output_filename,
            "audio": dict(audio),
        },
        "active_interval_measurement": {
            "start_frame": active_start,
            "end_frame_exclusive": active_end,
            "source_rms_pcm16_units": _round(input_active_rms),
            "source_rms_dbfs": _round(_dbfs(input_active_rms)),
            "shared_target_rms_pcm16_units_before_output_quantization": _round(target_rms),
            "output_rms_pcm16_units_after_output_quantization": _round(output_active_rms),
            "output_rms_dbfs_after_output_quantization": _round(_dbfs(output_active_rms)),
        },
        "one_whole_file_monitoring_gain": {
            "linear": _round(gain),
            "db": _round(_gain_db(gain)),
            "applied_to_every_sample_including_silence_and_tail": True,
            "no_clipping": True,
            "whole_file_peak_ceiling_dbfs": PEAK_CEILING_DBFS,
            "whole_file_peak_is_at_or_below_ceiling": True,
            "source_whole_file_peak_pcm16_units": _round(input_peak),
            "output_whole_file_peak_pcm16_units": _round(output_peak),
            "output_peak_dbfs": _round(_dbfs(output_peak)),
        },
    }


def build_audition_pack(
    report_dir: str | Path,
    output_dir: str | Path,
) -> dict[str, Any]:
    """Build a fresh constant-gain monitoring pack without modifying inputs."""

    report_root = Path(report_dir).expanduser().resolve()
    output = Path(output_dir).expanduser().resolve()
    if not report_root.is_dir():
        raise MidiDdspAuditionPackError("--report-dir must name an existing successful runtime report directory")
    if output.exists():
        raise MidiDdspAuditionPackError("--output-dir must be fresh; refusing to overwrite an audition pack")
    if report_root == output or report_root in output.parents:
        raise MidiDdspAuditionPackError("--output-dir must be outside --report-dir so original report artifacts stay untouched")
    report_path = report_root / INPUT_REPORT_FILENAME
    report = _json_load(report_path)
    if report.get("schema") != "mini.midi-ddsp-official-flute-rnd.v1" or report.get("status") != "succeeded":
        raise MidiDdspAuditionPackError("report is not a successful official MIDI-DDSP flute R&D report")
    a_path, a_relative, a_sha = _required_variant_audio(report, report_dir=report_root, variant_key=A_KEY)
    b_path, b_relative, b_sha = _required_variant_audio(report, report_dir=report_root, variant_key=B_KEY)
    a_samples, a_audio = _read_pcm16_mono(a_path)
    b_samples, b_audio = _read_pcm16_mono(b_path)
    if a_audio["sample_rate_hz"] != b_audio["sample_rate_hz"]:
        raise MidiDdspAuditionPackError("A and B sample rates differ; refusing hidden resampling")
    sample_rate = int(a_audio["sample_rate_hz"])
    active_start = _frame_at(ACTIVE_START_SECONDS, sample_rate_hz=sample_rate, label="active start")
    active_end = _frame_at(ACTIVE_END_SECONDS, sample_rate_hz=sample_rate, label="active end")
    if active_start != 0 or active_end > len(a_samples) or active_end > len(b_samples):
        raise MidiDdspAuditionPackError("A/B do not both cover the fixed shared authored-active interval")
    b_release_start = _frame_at(B_RELEASE_START_SECONDS, sample_rate_hz=sample_rate, label="B release start")
    b_release_end = _frame_at(B_RELEASE_END_SECONDS, sample_rate_hz=sample_rate, label="B release end")
    if b_release_start != active_end or len(b_samples) != b_release_end:
        raise MidiDdspAuditionPackError(
            "B must end exactly at 6.72s with its existing 6.48--6.72s release for this fixed audition pack"
        )
    a_active_rms = _rms(a_samples[active_start:active_end])
    b_active_rms = _rms(b_samples[active_start:active_end])
    if a_active_rms == 0.0 or b_active_rms == 0.0:
        raise MidiDdspAuditionPackError("A/B active interval must both have nonzero RMS")
    target_rms = 32768.0 * (10.0 ** (TARGET_ACTIVE_RMS_DBFS / 20.0))
    peak_ceiling_pcm16_units = 32768.0 * (10.0 ** (PEAK_CEILING_DBFS / 20.0))
    a_output, a_record = _variant_measurement(
        label=A_KEY,
        source_relative_path=a_relative,
        source_sha256=a_sha,
        samples=a_samples,
        audio=a_audio,
        active_start=active_start,
        active_end=active_end,
        target_rms=target_rms,
        peak_ceiling_pcm16_units=peak_ceiling_pcm16_units,
        output_filename=A_OUTPUT_FILENAME,
    )
    b_output, b_record = _variant_measurement(
        label=B_KEY,
        source_relative_path=b_relative,
        source_sha256=b_sha,
        samples=b_samples,
        audio=b_audio,
        active_start=active_start,
        active_end=active_end,
        target_rms=target_rms,
        peak_ceiling_pcm16_units=peak_ceiling_pcm16_units,
        output_filename=B_OUTPUT_FILENAME,
    )
    # Exact discrete operation invariant: the release is treated no differently
    # from any other B sample. No second envelope, per-region gain, fade, or
    # tail manipulation is allowed.
    b_gain = target_rms / b_active_rms
    expected_release = _constant_gain_pcm16(b_samples[b_release_start:b_release_end], gain=b_gain)
    if not np.array_equal(expected_release, b_output[b_release_start:b_release_end]):
        raise MidiDdspAuditionPackError("B release was not scaled by the same whole-file gain")
    # Rehash after all source reads and before any output directory is created,
    # making source preservation auditable instead of merely an intention.
    if _sha256(a_path) != a_sha or _sha256(b_path) != b_sha:
        raise MidiDdspAuditionPackError("an input source changed during the audition operation; refusing output")

    output.mkdir(parents=True, exist_ok=False)
    _write_pcm16_mono(output / A_OUTPUT_FILENAME, a_output, sample_rate_hz=sample_rate)
    _write_pcm16_mono(output / B_OUTPUT_FILENAME, b_output, sample_rate_hz=sample_rate)
    a_record["output"]["sha256"] = _sha256(output / A_OUTPUT_FILENAME)
    b_record["output"]["sha256"] = _sha256(output / B_OUTPUT_FILENAME)
    b_record["release_shape_integrity"] = {
        "source_frame_range": [b_release_start, b_release_end],
        "seconds_range": [B_RELEASE_START_SECONDS, B_RELEASE_END_SECONDS],
        "same_one_whole_file_gain_applied": True,
        "separate_release_gain_or_envelope_not_applied": True,
        "output_samples_equal_to_pcm16_round(source_samples_times_same_gain)": True,
        "release_is_not_used_for_active_interval_rms_measurement": True,
    }
    manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "artifact_kind": "constant_gain_monitoring_only_midi_ddsp_a_b_audition_pack",
        "input": {
            "report_directory_basename": report_root.name,
            "report_filename": INPUT_REPORT_FILENAME,
            "report_sha256": _sha256(report_path),
            "source_report_scope_preserved": report.get("scope"),
        },
        "shared_authored_active_interval": {
            "start_seconds": ACTIVE_START_SECONDS,
            "end_seconds_exclusive": ACTIVE_END_SECONDS,
            "measurement_is_pcm_sample_rms_only": True,
            "B_release_6_48_to_6_72_excluded_from_matching_measurement": True,
        },
        "level_matching_operation": {
            "shared_target_policy": "fixed shared authored-active RMS target",
            "shared_target_rms_dbfs_before_output_quantization": TARGET_ACTIVE_RMS_DBFS,
            "shared_target_rms_pcm16_units_before_output_quantization": _round(target_rms),
            "whole_file_peak_ceiling_dbfs_after_output_quantization": PEAK_CEILING_DBFS,
            "peak_ceiling_checked_before_any_output_is_written": True,
            "one_constant_gain_per_entire_file_only": True,
            "amplification_is_monitoring_only_and_not_dynamic_processing": True,
            "limiter_not_applied": True,
            "compression_not_applied": True,
            "normalization_envelope_not_applied": True,
            "fade_not_applied": True,
            "eq_not_applied": True,
            "resampling_not_applied": True,
            "trim_or_timing_change_not_applied": True,
            "output_pcm16_quantization_after_constant_gain_only": True,
        },
        "variants": {
            A_KEY: a_record,
            B_KEY: b_record,
        },
        "interpretation_limits": {
            "listening_only_monitoring_aid": True,
            "not_physical_loudness_calibration": True,
            "not_expression_calibration": True,
            "not_a_midi_ddsp_model_output_or_rerender": True,
            "not_a_daegeum_performance_or_quality_claim": True,
            "not_a_game_asset_or_default_bgm_change": True,
            "amplification_is_listening_only_not_model_output": True,
            "original_A_and_B_are_preserved_unmodified": True,
        },
    }
    _json_dump(output / MANIFEST_FILENAME, manifest)
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--report-dir", help="successful official MIDI-DDSP flute R&D report directory")
    parser.add_argument("--output-dir", help="fresh ignored monitoring audition-pack directory outside report-dir")
    parser.add_argument("--dry-run", action="store_true", help="print the fixed constant-gain/no-transform contract")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if args.dry_run:
        print(
            "midi-ddsp-audition-pack: would make fresh A/B monitoring copies with one whole-file gain each, matched "
            "only by RMS over [0.00, 6.48) to -24.0 dBFS, with a -3.0 dBFS whole-file fail-closed peak ceiling; it "
            "will not change originals, timing, release shape, source/model audio, or runtime BGM."
        )
        return 0
    missing = [name for name in ("report_dir", "output_dir") if not getattr(args, name)]
    if missing:
        _parser().error("required unless --dry-run: " + ", ".join("--" + name.replace("_", "-") for name in missing))
    try:
        manifest = build_audition_pack(args.report_dir, args.output_dir)
    except MidiDdspAuditionPackError as exc:
        print(f"midi-ddsp-audition-pack: error: {exc}", file=sys.stderr)
        return 2
    a = manifest["variants"][A_KEY]["one_whole_file_monitoring_gain"]
    b = manifest["variants"][B_KEY]["one_whole_file_monitoring_gain"]
    print(
        "midi-ddsp-audition-pack: wrote monitoring-only A/B copies; "
        f"A gain={a['db']:.6f} dB, B gain={b['db']:.6f} dB, sidecar={MANIFEST_FILENAME}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
