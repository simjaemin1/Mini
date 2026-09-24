#!/usr/bin/env python3
"""Render one explicit score-expression artifact as an untrained synthetic preview.

This is deliberately a small, deterministic monitor for the R&D control
layer.  It consumes the controls written by ``tools/score-expression`` and
generates a generic harmonic-plus-noise waveform.  It does **not** load a
model, read or copy source audio, or claim to render a real Daegeum.

The emitted WAV is always labelled ``untrained_synthetic_preview`` in its
filename and sidecar manifest.  It is an isolated R&D listening aid only --
never a default asset, runtime BGM, game output, training result, or public
release.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Mapping, Sequence
import wave

import numpy


SCORE_MANIFEST_SCHEMA = "mini.score-expression.render-manifest.v1"
SCORE_CONTROLS_SCHEMA = "mini.score-expression.controls.v1"
SCORE_MANIFEST_FILENAME = "score_expression_manifest.json"
SCORE_CONTROLS_FILENAME = "score_expression_controls.npz"
PREVIEW_MANIFEST_SCHEMA = "mini.expressive-synthesis.untrained-synthetic-preview.v1"
PREVIEW_WAV_FILENAME = "untrained_synthetic_preview.wav"
PREVIEW_MANIFEST_FILENAME = "untrained_synthetic_preview_manifest.json"
EXPECTED_SAMPLE_RATE_HZ = 48_000
EXPECTED_SCORE_FEATURE_DIM = 9
DEFAULT_SEED = 20_260_925
SCOPE_KEYS = (
    "r_and_d_only",
    "no_default_assets",
    "no_runtime_bgm",
    "no_game_output",
    "no_public_release",
)


class SyntheticPreviewError(RuntimeError):
    """An R&D control artifact or preview destination is unsafe or invalid."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _load_json(path: Path) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise SyntheticPreviewError(f"required controls manifest is missing: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise SyntheticPreviewError("controls manifest is not valid JSON") from exc
    if not isinstance(value, Mapping):
        raise SyntheticPreviewError("controls manifest must be a JSON object")
    return value


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise SyntheticPreviewError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise SyntheticPreviewError(f"{label}.{key} must explicitly be true")


def _require_false(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not False:
        raise SyntheticPreviewError(f"{label}.{key} must explicitly be false")


def _strict_scalar(archive: Any, key: str) -> Any:
    if key not in archive.files:
        raise SyntheticPreviewError(f"controls archive is missing {key}")
    value = archive[key]
    if value.shape != ():
        raise SyntheticPreviewError(f"controls.{key} must be a scalar")
    return value.item()


def _integer(value: Any, *, label: str, minimum: int, maximum: int) -> int:
    if isinstance(value, bool):
        raise SyntheticPreviewError(f"{label} must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError) as exc:
        raise SyntheticPreviewError(f"{label} must be an integer") from exc
    if result != value or not minimum <= result <= maximum:
        raise SyntheticPreviewError(f"{label} is outside its allowed range")
    return result


def _sha256_text(value: Any, *, label: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise SyntheticPreviewError(f"{label} must be a lowercase SHA-256 digest")
    if any(character not in "0123456789abcdef" for character in value):
        raise SyntheticPreviewError(f"{label} must be a lowercase SHA-256 digest")
    return value


def _plan_basename(value: Any) -> str:
    if not isinstance(value, str) or not value or value in {".", ".."}:
        raise SyntheticPreviewError("controls manifest.input.plan_basename must be a plan filename")
    if "/" in value or "\\" in value:
        raise SyntheticPreviewError("controls manifest.input.plan_basename must not contain a path")
    return value


def _array(archive: Any, key: str, *, frames: int, finite: bool = True) -> numpy.ndarray:
    if key not in archive.files:
        raise SyntheticPreviewError(f"controls archive is missing {key}")
    value = numpy.asarray(archive[key])
    if value.ndim != 1 or value.shape[0] != frames:
        raise SyntheticPreviewError(f"controls.{key} must have shape [{frames}]")
    if finite and not numpy.all(numpy.isfinite(value)):
        raise SyntheticPreviewError(f"controls.{key} must be finite")
    return value.copy()


def _is_within(path: Path, parent: Path) -> bool:
    try:
        path.relative_to(parent)
    except ValueError:
        return False
    return True


def _default_bgm_root() -> Path:
    return Path(__file__).resolve().parents[2] / "public" / "assets" / "audio" / "bgm"


def _reject_default_bgm_path(path: Path, *, label: str) -> None:
    if _is_within(path, _default_bgm_root().resolve()):
        raise SyntheticPreviewError(f"{label} must not be inside default BGM assets")


def _validate_score_manifest(manifest: Mapping[str, Any], *, controls_path: Path) -> dict[str, Any]:
    if manifest.get("schema") != SCORE_MANIFEST_SCHEMA:
        raise SyntheticPreviewError(f"controls manifest.schema must be {SCORE_MANIFEST_SCHEMA}")
    if manifest.get("artifact_kind") != "rnd_only_score_to_expression_controls":
        raise SyntheticPreviewError("controls manifest is not an explicit R&D score-expression artifact")

    scope = _mapping(manifest.get("r_and_d_scope"), label="controls manifest.r_and_d_scope")
    for key in SCOPE_KEYS:
        _require_true(scope, key, label="controls manifest.r_and_d_scope")

    source_input = _mapping(manifest.get("input"), label="controls manifest.input")
    for key in ("source_audio_read", "model_training_run", "game_or_runtime_asset_read_or_written"):
        _require_false(source_input, key, label="controls manifest.input")
    plan_basename = _plan_basename(source_input.get("plan_basename"))
    plan_sha256 = _sha256_text(
        source_input.get("plan_sha256"),
        label="controls manifest.input.plan_sha256",
    )

    limits = _mapping(manifest.get("interpretation_limits"), label="controls manifest.interpretation_limits")
    for key in (
        "articulations_are_authorial_score_controls_not_inferred_performance_labels",
        "controls_are_not_recording_derived_training_targets",
        "no_audio_is_rendered_or_modified",
        "not_a_default_asset_runtime_bgm_game_output_or_public_release",
    ):
        _require_true(limits, key, label="controls manifest.interpretation_limits")

    controls = _mapping(manifest.get("controls"), label="controls manifest.controls")
    if controls.get("artifact") != SCORE_CONTROLS_FILENAME:
        raise SyntheticPreviewError("controls manifest must name only score_expression_controls.npz")
    if controls.get("schema") != SCORE_CONTROLS_SCHEMA:
        raise SyntheticPreviewError(f"controls manifest.controls.schema must be {SCORE_CONTROLS_SCHEMA}")
    if controls.get("sha256") != _sha256(controls_path):
        raise SyntheticPreviewError("controls manifest SHA-256 does not match the supplied NPZ")
    sample_rate_hz = _integer(
        controls.get("sample_rate_hz"),
        label="controls manifest.controls.sample_rate_hz",
        minimum=2,
        maximum=384_000,
    )
    if sample_rate_hz != EXPECTED_SAMPLE_RATE_HZ:
        raise SyntheticPreviewError("v1 preview accepts only the explicit 48 kHz score-expression timeline")
    control_hz = _integer(
        controls.get("control_hz"),
        label="controls manifest.controls.control_hz",
        minimum=25,
        maximum=1_000,
    )
    frame_count = _integer(
        controls.get("frame_count"),
        label="controls manifest.controls.frame_count",
        minimum=2,
        maximum=10_000_000,
    )
    score_feature_dim = _integer(
        controls.get("score_feature_dim"),
        label="controls manifest.controls.score_feature_dim",
        minimum=1,
        maximum=1_024,
    )
    if score_feature_dim != EXPECTED_SCORE_FEATURE_DIM:
        raise SyntheticPreviewError("v1 preview accepts only the explicit nine-column score feature layout")
    return {
        "scope": {key: True for key in SCOPE_KEYS},
        "controls_sha256": str(controls["sha256"]),
        "manifest_sha256": None,
        "plan_basename": plan_basename,
        "plan_sha256": plan_sha256,
        "sample_rate_hz": sample_rate_hz,
        "control_hz": control_hz,
        "frame_count": frame_count,
        "score_feature_dim": score_feature_dim,
        "event_count": len(manifest.get("events", [])) if isinstance(manifest.get("events"), list) else 0,
    }


def load_rnd_score_controls(controls_dir: str | Path) -> dict[str, Any]:
    """Load and strictly validate one compiler-written R&D control artifact.

    Only the JSON manifest and its SHA-verified NPZ control archive are read.
    No recording, model, game asset, or directory-discovered input is touched.
    """

    directory = Path(controls_dir).expanduser().resolve()
    if not directory.is_dir():
        raise SyntheticPreviewError("--controls-dir must name one score-expression artifact directory")
    _reject_default_bgm_path(directory, label="controls artifact")
    controls_path = directory / SCORE_CONTROLS_FILENAME
    manifest_path = directory / SCORE_MANIFEST_FILENAME
    if not controls_path.is_file():
        raise SyntheticPreviewError(f"required controls archive is missing: {SCORE_CONTROLS_FILENAME}")
    manifest = _load_json(manifest_path)
    validated = _validate_score_manifest(manifest, controls_path=controls_path)
    validated["manifest_sha256"] = _sha256(manifest_path)

    try:
        with numpy.load(controls_path, allow_pickle=False) as archive:
            schema = _strict_scalar(archive, "schema")
            if schema != SCORE_CONTROLS_SCHEMA:
                raise SyntheticPreviewError(f"controls.schema must be {SCORE_CONTROLS_SCHEMA}")
            sample_rate_hz = _integer(
                _strict_scalar(archive, "sample_rate_hz"),
                label="controls.sample_rate_hz",
                minimum=2,
                maximum=384_000,
            )
            control_hz = _integer(
                _strict_scalar(archive, "control_hz"),
                label="controls.control_hz",
                minimum=25,
                maximum=1_000,
            )
            if sample_rate_hz != validated["sample_rate_hz"] or control_hz != validated["control_hz"]:
                raise SyntheticPreviewError("controls archive disagrees with its manifest timeline")
            frames = int(validated["frame_count"])
            frame_times = _array(archive, "frame_times_seconds", frames=frames)
            centers = _array(archive, "frame_centers_48k", frames=frames)
            f0_hz = _array(archive, "f0_hz", frames=frames)
            target_f0_hz = _array(archive, "target_f0_hz", frames=frames)
            loudness_db = _array(archive, "loudness_db", frames=frames)
            target_loudness_db = _array(archive, "target_loudness_db", frames=frames)
            air_noise_ratio = _array(archive, "air_noise_ratio", frames=frames)
            voicing = _array(archive, "voicing", frames=frames)
            gesture_state = _array(archive, "gesture_state", frames=frames)
            score_features = numpy.asarray(archive["score_features"]).copy() if "score_features" in archive.files else None
    except (OSError, ValueError, EOFError) as exc:
        raise SyntheticPreviewError("controls archive could not be read as a safe NumPy artifact") from exc

    if score_features is None or score_features.shape != (frames, validated["score_feature_dim"]):
        raise SyntheticPreviewError("controls.score_features does not have the manifest's explicit shape")
    if not numpy.all(numpy.isfinite(score_features)):
        raise SyntheticPreviewError("controls.score_features must be finite")
    if not numpy.issubdtype(centers.dtype, numpy.integer):
        raise SyntheticPreviewError("controls.frame_centers_48k must be integer sample positions")
    if not numpy.issubdtype(gesture_state.dtype, numpy.integer):
        raise SyntheticPreviewError("controls.gesture_state must be integer state codes")
    if float(frame_times[0]) != 0.0 or numpy.any(numpy.diff(frame_times) <= 0.0):
        raise SyntheticPreviewError("controls.frame_times_seconds must start at zero and strictly increase")
    expected_step = 1.0 / float(control_hz)
    if not numpy.allclose(numpy.diff(frame_times), expected_step, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.frame_times_seconds is not aligned to its explicit control rate")
    expected_centers = numpy.rint(frame_times * sample_rate_hz).astype(centers.dtype)
    if not numpy.array_equal(centers, expected_centers):
        raise SyntheticPreviewError("controls.frame_centers_48k is not aligned to the explicit 48 kHz timeline")
    if int(centers[-1]) < 2:
        raise SyntheticPreviewError("controls duration is too short to render")
    if numpy.any(f0_hz < 0.0) or numpy.any(f0_hz >= sample_rate_hz / 2.0):
        raise SyntheticPreviewError("controls.f0_hz is outside the safe synthetic-render range")
    if not numpy.allclose(f0_hz, target_f0_hz, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.target_f0_hz must equal the explicit f0_hz prescription")
    if numpy.any(loudness_db < -80.0) or numpy.any(loudness_db > 0.0):
        raise SyntheticPreviewError("controls.loudness_db is outside the score-expression range")
    if not numpy.allclose(loudness_db, target_loudness_db, rtol=0.0, atol=1.0e-6):
        raise SyntheticPreviewError("controls.target_loudness_db must equal the explicit loudness prescription")
    if numpy.any(air_noise_ratio < 0.0) or numpy.any(air_noise_ratio > 1.0):
        raise SyntheticPreviewError("controls.air_noise_ratio must be within [0, 1]")
    if numpy.any(voicing < 0.0) or numpy.any(voicing > 1.0):
        raise SyntheticPreviewError("controls.voicing must be within [0, 1]")
    if numpy.any(gesture_state < 0) or numpy.any(gesture_state > 4):
        raise SyntheticPreviewError("controls.gesture_state contains an unknown articulation code")

    return {
        **validated,
        "controls_dir": directory,
        "frame_times_seconds": frame_times.astype(numpy.float64),
        "frame_centers": centers.astype(numpy.int64),
        "f0_hz": f0_hz.astype(numpy.float64),
        "loudness_db": loudness_db.astype(numpy.float64),
        "air_noise_ratio": air_noise_ratio.astype(numpy.float64),
        "voicing": voicing.astype(numpy.float64),
        "gesture_state": gesture_state.astype(numpy.int16),
    }


def synthesize_untrained_preview(controls: Mapping[str, Any], *, seed: int) -> tuple[numpy.ndarray, dict[str, Any]]:
    """Render generic harmonic/noise audio directly from explicit curves.

    Gesture state is validated but never used to invent an articulation: F0,
    loudness, air/noise ratio, and voicing are the complete audible controls.
    This is intentionally not a learned, sampled, or physical instrument.
    """

    sample_rate_hz = int(controls["sample_rate_hz"])
    frame_times = numpy.asarray(controls["frame_times_seconds"], dtype=numpy.float64)
    sample_count = int(numpy.asarray(controls["frame_centers"], dtype=numpy.int64)[-1])
    sample_times = numpy.arange(sample_count, dtype=numpy.float64) / float(sample_rate_hz)

    def resample(key: str) -> numpy.ndarray:
        values = numpy.asarray(controls[key], dtype=numpy.float64)
        return numpy.interp(sample_times, frame_times, values).astype(numpy.float64)

    f0_hz = resample("f0_hz")
    loudness_db = resample("loudness_db")
    air_noise_ratio = resample("air_noise_ratio")
    voicing = resample("voicing")

    phase = numpy.cumsum((2.0 * numpy.pi * f0_hz) / float(sample_rate_hz))
    harmonic = (
        0.68 * numpy.sin(phase)
        + 0.22 * numpy.sin(2.0 * phase + 0.31)
        + 0.10 * numpy.sin(3.0 * phase + 1.17)
    )
    # A fixed seed and a tiny three-tap filter keep this preview reproducible
    # without loading a learned noise source or any recording.
    rng = numpy.random.default_rng(seed)
    white = rng.standard_normal(sample_count)
    air = numpy.convolve(white, numpy.asarray((0.25, 0.50, 0.25)), mode="same")
    amplitude = numpy.power(10.0, loudness_db / 20.0)
    waveform = amplitude * (
        voicing * (1.0 - air_noise_ratio) * harmonic
        + air_noise_ratio * 0.38 * air
    )
    peak_before_monitoring = float(numpy.max(numpy.abs(waveform))) if waveform.size else 0.0
    if not math.isfinite(peak_before_monitoring) or peak_before_monitoring <= 0.0:
        raise SyntheticPreviewError("explicit curves produced silence; refusing to write a misleading preview")
    # This is one global listening gain, not loudness mastering or a physical
    # interpretation.  It preserves every relative loudness curve value.
    monitor_gain = 0.80 / peak_before_monitoring
    monitored = numpy.clip(waveform * monitor_gain, -0.98, 0.98)
    pcm16 = numpy.rint(monitored * 32767.0).astype("<i2")
    if not numpy.any(pcm16):
        raise SyntheticPreviewError("synthetic preview rounded to silence")
    return pcm16, {
        "sample_rate_hz": sample_rate_hz,
        "sample_count": sample_count,
        "duration_seconds": sample_count / float(sample_rate_hz),
        "seed": int(seed),
        "peak_before_monitoring": peak_before_monitoring,
        "global_monitor_gain": monitor_gain,
        "peak_after_monitoring": float(numpy.max(numpy.abs(monitored))),
    }


def _write_pcm16_wav(path: Path, pcm16: numpy.ndarray, *, sample_rate_hz: int) -> None:
    with wave.open(str(path), "wb") as destination:
        destination.setnchannels(1)
        destination.setsampwidth(2)
        destination.setframerate(sample_rate_hz)
        destination.writeframes(pcm16.astype("<i2", copy=False).tobytes())


def render_synthetic_preview(
    *,
    controls_dir: str | Path,
    output_dir: str | Path,
    seed: int = DEFAULT_SEED,
) -> dict[str, Any]:
    """Write a fresh, labelled generic preview from one verified control artifact."""

    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 2**32 - 1:
        raise SyntheticPreviewError("seed must be an integer in [0, 4294967295]")
    controls = load_rnd_score_controls(controls_dir)
    output = Path(output_dir).expanduser().resolve()
    _reject_default_bgm_path(output, label="preview output")
    if _is_within(output, Path(controls["controls_dir"])):
        raise SyntheticPreviewError("preview output must be isolated from its input controls artifact")
    if output.exists():
        raise SyntheticPreviewError("--output-dir must be fresh; refusing to overwrite an R&D preview")
    pcm16, render_summary = synthesize_untrained_preview(controls, seed=seed)

    output.mkdir(parents=True, exist_ok=False)
    wav_path = output / PREVIEW_WAV_FILENAME
    _write_pcm16_wav(wav_path, pcm16, sample_rate_hz=render_summary["sample_rate_hz"])
    manifest = {
        "schema": PREVIEW_MANIFEST_SCHEMA,
        "artifact_kind": "rnd_only_untrained_synthetic_expression_preview",
        "r_and_d_scope": controls["scope"],
        "input_controls": {
            "artifact": SCORE_CONTROLS_FILENAME,
            "sha256": controls["controls_sha256"],
            "score_expression_manifest_sha256": controls["manifest_sha256"],
            "score_expression_plan": {
                "basename": controls["plan_basename"],
                "sha256": controls["plan_sha256"],
            },
            "schema": SCORE_CONTROLS_SCHEMA,
            "frame_count": controls["frame_count"],
            "event_count": controls["event_count"],
            "source_audio_read": False,
            "model_training_run": False,
            "game_or_runtime_asset_read_or_written": False,
        },
        "renderer": {
            "id": "deterministic_generic_harmonic_noise_control_renderer",
            "trained_model_loaded": False,
            "source_audio_loaded": False,
            "source_audio_copied_or_transformed": False,
            "instrument_claim": "none: this is not a real or trained Daegeum renderer",
            "articulation_policy": "uses supplied continuous F0/loudness/air-noise/voicing curves; does not infer gestures",
            "monitoring_gain_is_not_physical_loudness_calibration": True,
        },
        "output": {
            "artifact": PREVIEW_WAV_FILENAME,
            "sha256": _sha256(wav_path),
            "format": "mono PCM16 WAV",
            "label": "UNTRAINED SYNTHETIC R&D PREVIEW — NOT A GAME ASSET",
            **render_summary,
        },
        "interpretation_limits": {
            "not_a_real_or_trained_daegeum_render": True,
            "not_a_training_result_or_model_export": True,
            "not_a_default_asset_runtime_bgm_game_output_or_public_release": True,
            "no_source_audio_was_read_copied_or_modified": True,
        },
    }
    (output / PREVIEW_MANIFEST_FILENAME).write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return manifest


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--controls-dir", required=True, help="one compiler-written score-expression controls directory")
    parser.add_argument("--output-dir", required=True, help="fresh isolated R&D output directory")
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED, help="deterministic synthetic-noise seed")
    parser.add_argument(
        "--confirm-rnd-only",
        action="store_true",
        help="required acknowledgement: output is an untrained synthetic R&D preview, not a game asset",
    )
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    if not args.confirm_rnd_only:
        print("render_synthetic_preview: pass --confirm-rnd-only", file=sys.stderr)
        return 2
    try:
        result = render_synthetic_preview(
            controls_dir=args.controls_dir,
            output_dir=args.output_dir,
            seed=args.seed,
        )
    except SyntheticPreviewError as exc:
        print(f"render_synthetic_preview: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
