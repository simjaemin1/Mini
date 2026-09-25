#!/usr/bin/env python3
"""Fail-closed CPU renderer for the published DDSP-Gugak Daegeum checkpoint.

This is a narrow R&D renderer, not a trainer or a game-asset exporter.  It
never opens source audio or invokes CREPE.  It converts one explicit score
plan into 250 Hz F0/loudness controls, then invokes the untouched published
decoder plus harmonic and filtered-noise components on CPU.
"""

from __future__ import annotations

import argparse
import array
import contextlib
import csv
import hashlib
import importlib
import json
import math
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import subprocess
import sys
import types
from typing import Any, Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple
import wave


TOOL_SCHEMA = "mini.ddsp-gugak-public-daegeum-runtime.v1"
PLAN_SCHEMA = "mini.score-expression.plan.v1"
EXPECTED_GUGAK_REVISION = "523012c340170841ed6499670e9dcef19783817d"
EXPECTED_DDSP_PYTORCH_REVISION = "ea5f25318dd4cd22c601dd405ebc2bac8e3f4cb6"
EXPECTED_CHECKPOINT_SHA256 = "cc73b645a9c4de934ec463246527fe5f1b16c783688ef3f2face53e67f547f28"
EXPECTED_CHECKPOINT_BYTES = 17_400_893
EXPECTED_CONFIG_SHA256 = "0804084e8b74bf50329126d99f32fd0134dfaaae3c07bc9a173e468cef05e77f"
EXPECTED_CONFIG_BYTES = 1_477
EXPECTED_GUGAK_FILES = {
    "LICENSE": "6b3a4d6a8b376f38fc38516dd05f1d85ffb047a749b36f3888783f68b4cd234c",
    "README.md": "e34aefae4dae054c1877425812894fff4fda3ab6e86fce6b27730f76e663d8db",
}
EXPECTED_DDSP_PYTORCH_FILES = {
    "LICENSE": "b215a2671dcbe7fb02c2cd5d9cf5f6c4d002795fe9c5836c80ce5f58ec263b11",
    "train/network/autoencoder/decoder.py": "2be9c6b5eb8e5bf5f3e4e308de98ecede789c252c10b01f184df57e424458904",
    "components/harmonic_oscillator.py": "7481b999f841334d5759eef9d95308c812920048c153136c785a30e41d49592d",
    "components/filtered_noise.py": "e14593e920f4d7c0d8e0eb3fee1470aa94a845193f277b8d56dfa00d4c492679",
}
FRAME_RATE_HZ = 250
FRAME_RESOLUTION = 1.0 / FRAME_RATE_HZ
SAMPLE_RATE_HZ = 16_000
HOP_LENGTH = 64
REST_ENTRY_FADE_SECONDS = 0.016
ARTICULATIONS = ("rest", "breath_start", "rearticulate", "slur", "release")
VOICED_ARTICULATIONS = frozenset({"breath_start", "rearticulate", "slur"})
OUTPUT_NAME = re.compile(r"ddsp-gugak-public-daegeum-runtime-r1-[0-9]{8}-[0-9]{6}(?:-[a-z0-9-]+)?$")


class RuntimeContractError(RuntimeError):
    """Inputs, provenance, scope, or an isolated output target are unsafe."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _file_record(path: Path) -> Dict[str, Any]:
    return {"basename": path.name, "byte_length": path.stat().st_size, "sha256": _sha256(path)}


def _load_json(path: Path, *, label: str) -> Mapping[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise RuntimeContractError(f"{label} does not exist") from exc
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeContractError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, Mapping):
        raise RuntimeContractError(f"{label} must be a JSON object")
    return value


def _finite_number(value: Any, *, label: str, minimum: Optional[float] = None, maximum: Optional[float] = None) -> float:
    if isinstance(value, bool):
        raise RuntimeContractError(f"{label} must be a finite number")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise RuntimeContractError(f"{label} must be a finite number") from exc
    if not math.isfinite(number):
        raise RuntimeContractError(f"{label} must be a finite number")
    if minimum is not None and number < minimum:
        raise RuntimeContractError(f"{label} is below its permitted range")
    if maximum is not None and number > maximum:
        raise RuntimeContractError(f"{label} is above its permitted range")
    return number


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise RuntimeContractError(f"{label} must be an object")
    return value


def _require_true(value: Mapping[str, Any], key: str, *, label: str) -> None:
    if value.get(key) is not True:
        raise RuntimeContractError(f"{label}.{key} must explicitly be true")


def _safe_relative(value: str, *, label: str) -> str:
    parsed = PurePosixPath(value)
    if not value or parsed.is_absolute() or ".." in parsed.parts or "." in parsed.parts or "\\" in value:
        raise RuntimeContractError(f"{label} is not a safe relative path")
    return parsed.as_posix()


def _git_text(root: Path, *args: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(root), *args], capture_output=True, text=True, timeout=20, check=False
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RuntimeContractError(f"could not inspect supplied source checkout: {type(exc).__name__}") from exc
    if result.returncode != 0:
        raise RuntimeContractError("supplied source checkout is not a readable Git checkout")
    return result.stdout.strip()


def _validate_git_checkout(root: Path, *, expected_revision: str, expected_files: Mapping[str, str], label: str) -> Dict[str, Any]:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise RuntimeContractError(f"{label} source root must be an explicit directory")
    revision = _git_text(root, "rev-parse", "HEAD")
    if revision != expected_revision:
        raise RuntimeContractError(f"{label} source revision does not equal the pinned public commit")
    if _git_text(root, "status", "--porcelain"):
        raise RuntimeContractError(f"{label} source checkout is dirty; an untouched checkout is required")
    files: Dict[str, Dict[str, Any]] = {}
    for relative, expected_hash in expected_files.items():
        relative = _safe_relative(relative, label=f"{label} expected source path")
        source_file = (root / relative).resolve()
        try:
            source_file.relative_to(root)
        except ValueError as exc:
            raise RuntimeContractError(f"{label} source file escapes checkout") from exc
        if not source_file.is_file() or _sha256(source_file) != expected_hash:
            raise RuntimeContractError(f"{label} imported/source evidence bytes do not match the pinned public source")
        files[relative] = {"sha256": expected_hash, "byte_length": source_file.stat().st_size}
    return {"revision": revision, "source_files": files, "license_file_verified": "LICENSE" in files}


def validate_public_sources(gugak_root: Path, ddsp_pytorch_root: Path) -> Dict[str, Any]:
    """Verify public code repos by pinned commit, cleanliness, and exact source bytes."""

    return {
        "ddsp_gugak": _validate_git_checkout(
            gugak_root,
            expected_revision=EXPECTED_GUGAK_REVISION,
            expected_files=EXPECTED_GUGAK_FILES,
            label="DDSP-Gugak",
        ),
        "ddsp_pytorch": _validate_git_checkout(
            ddsp_pytorch_root,
            expected_revision=EXPECTED_DDSP_PYTORCH_REVISION,
            expected_files=EXPECTED_DDSP_PYTORCH_FILES,
            label="ddsp-pytorch",
        ),
    }


def validate_checkpoint(checkpoint: Path, checkpoint_config: Path) -> Dict[str, Any]:
    checkpoint = checkpoint.expanduser().resolve()
    checkpoint_config = checkpoint_config.expanduser().resolve()
    if not checkpoint.is_file() or checkpoint.stat().st_size != EXPECTED_CHECKPOINT_BYTES or _sha256(checkpoint) != EXPECTED_CHECKPOINT_SHA256:
        raise RuntimeContractError("Daegeum checkpoint does not match the pinned public byte identity")
    if not checkpoint_config.is_file() or checkpoint_config.stat().st_size != EXPECTED_CONFIG_BYTES or _sha256(checkpoint_config) != EXPECTED_CONFIG_SHA256:
        raise RuntimeContractError("Daegeum checkpoint config does not match the pinned public byte identity")
    config = _load_json(checkpoint_config, label="Daegeum checkpoint config")
    required = {
        "config_frame_resolution": FRAME_RESOLUTION,
        "config_sample_rate": SAMPLE_RATE_HZ,
        "config_n_harmonics": 101,
        "config_n_freq": 65,
        "config_use_z": False,
        "config_mlp_units": 512,
        "config_mlp_layers": 3,
        "config_gru_units": 512,
        "config_bidirectional": False,
    }
    for key, expected in required.items():
        actual = config.get(key)
        if isinstance(expected, float):
            if not isinstance(actual, (int, float)) or abs(float(actual) - expected) > 1.0e-12:
                raise RuntimeContractError(f"Daegeum checkpoint config.{key} is not the pinned architecture value")
        elif actual != expected:
            raise RuntimeContractError(f"Daegeum checkpoint config.{key} is not the pinned architecture value")
    return {
        "checkpoint": _file_record(checkpoint),
        "checkpoint_config": _file_record(checkpoint_config),
        "architecture": {
            "frame_resolution_seconds": FRAME_RESOLUTION,
            "frame_rate_hz": FRAME_RATE_HZ,
            "sample_rate_hz": SAMPLE_RATE_HZ,
            "n_harmonics": 101,
            "n_freq": 65,
            "use_z": False,
            "checkpoint_reverb_state_present_but_not_used_for_dry_render": bool(config.get("config_use_reverb")),
        },
    }


def _validate_plan(path: Path) -> Tuple[Mapping[str, Any], List[Dict[str, Any]], float]:
    plan = _load_json(path, label="explicit score-expression plan")
    if plan.get("schema") != PLAN_SCHEMA:
        raise RuntimeContractError(f"plan.schema must equal {PLAN_SCHEMA}")
    scope = _mapping(plan.get("r_and_d_scope"), label="plan.r_and_d_scope")
    for key in ("r_and_d_only", "no_default_assets", "no_runtime_bgm", "no_game_output", "no_public_release"):
        _require_true(scope, key, label="plan.r_and_d_scope")
    instrument = _mapping(plan.get("instrument"), label="plan.instrument")
    if instrument.get("id") != "daegeum" or instrument.get("sustained") is not True:
        raise RuntimeContractError("plan must explicitly be sustained Daegeum")
    if plan.get("control_hz") != 100:
        raise RuntimeContractError("the accepted authorial plan must retain its explicit 100 Hz source declaration")
    raw_events = plan.get("events")
    if not isinstance(raw_events, list) or not raw_events:
        raise RuntimeContractError("plan.events must be a non-empty list")
    prior_end = 0.0
    prior_event: Optional[Dict[str, Any]] = None
    normalized: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw in enumerate(raw_events):
        event = _mapping(raw, label=f"plan.events[{index}]")
        event_id = event.get("id")
        if not isinstance(event_id, str) or not event_id or event_id in seen_ids:
            raise RuntimeContractError("plan events require unique non-empty IDs")
        seen_ids.add(event_id)
        start = _finite_number(event.get("start_seconds"), label=f"plan.events[{index}].start_seconds", minimum=0.0)
        end = _finite_number(event.get("end_seconds"), label=f"plan.events[{index}].end_seconds", minimum=0.0)
        if end <= start or start < prior_end - 1.0e-9:
            raise RuntimeContractError("plan must be monophonic with strictly positive event duration")
        articulation = event.get("articulation")
        if articulation not in ARTICULATIONS[1:]:
            raise RuntimeContractError("plan must explicitly name breath_start, rearticulate, slur, or release")
        item: Dict[str, Any] = {"id": event_id, "start_seconds": start, "end_seconds": end, "articulation": articulation}
        if articulation == "release":
            if prior_event is None or "pitch_hz" in event:
                raise RuntimeContractError("a release must follow a voiced event and cannot declare a new pitch")
            item["steady_loudness_db"] = float(prior_event["steady_loudness_db"])
        else:
            pitch = _finite_number(event.get("pitch_hz"), label=f"plan.events[{index}].pitch_hz", minimum=20.0, maximum=4_000.0)
            steady = _finite_number(event.get("steady_loudness_db"), label=f"plan.events[{index}].steady_loudness_db", minimum=-70.0, maximum=-3.0)
            item["pitch_hz"] = pitch
            item["steady_loudness_db"] = steady
            if articulation == "slur":
                if prior_event is None or event.get("slur_from_previous") is not True or abs(start - prior_end) > 1.0e-9:
                    raise RuntimeContractError("a slur must explicitly touch and link to its previous voiced event")
            elif event.get("slur_from_previous"):
                raise RuntimeContractError("slur_from_previous is valid only for an explicit slur")
        vibrato = event.get("vibrato")
        if vibrato is not None:
            vibrato_map = _mapping(vibrato, label=f"plan.events[{index}].vibrato")
            if vibrato_map.get("enabled") is True:
                item["vibrato"] = {
                    "enabled": True,
                    "rate_hz": _finite_number(vibrato_map.get("rate_hz"), label="vibrato.rate_hz", minimum=3.3, maximum=3.8),
                    "depth_cents": _finite_number(vibrato_map.get("depth_cents"), label="vibrato.depth_cents", minimum=12.0, maximum=45.0),
                    "onset_seconds": _finite_number(vibrato_map.get("onset_seconds", 0.0), label="vibrato.onset_seconds", minimum=0.0),
                    "ramp_seconds": _finite_number(vibrato_map.get("ramp_seconds", 0.08), label="vibrato.ramp_seconds", minimum=0.005),
                }
            elif set(vibrato_map) != {"enabled"}:
                raise RuntimeContractError("disabled vibrato may not hide nonzero parameters")
        item.setdefault("vibrato", {"enabled": False})
        normalized.append(item)
        prior_event = item
        prior_end = end
    return plan, normalized, prior_end


def validate_plan(path: Path) -> Dict[str, Any]:
    path = path.expanduser().resolve()
    plan, events, duration = _validate_plan(path)
    return {
        "plan": _file_record(path),
        "authorial_plan_control_hz": plan["control_hz"],
        "runtime_control_hz": FRAME_RATE_HZ,
        "duration_seconds": duration,
        "events": events,
    }


def _vibrato_cents(event: Mapping[str, Any], local_seconds: float) -> float:
    vibrato = _mapping(event["vibrato"], label="normalized vibrato")
    if vibrato.get("enabled") is not True:
        return 0.0
    onset = float(vibrato["onset_seconds"])
    if local_seconds < onset:
        return 0.0
    ramp = float(vibrato["ramp_seconds"])
    envelope = min(1.0, (local_seconds - onset) / ramp)
    return float(vibrato["depth_cents"]) * envelope * math.sin(2.0 * math.pi * float(vibrato["rate_hz"]) * (local_seconds - onset))


def build_score_controls(plan_path: Path, *, max_seconds: Optional[float] = None) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Create deterministic 250 Hz F0/loudness controls without opening any audio."""

    plan, events, duration = _validate_plan(plan_path.expanduser().resolve())
    render_duration = duration if max_seconds is None else _finite_number(max_seconds, label="max_seconds", minimum=FRAME_RESOLUTION, maximum=duration)
    frame_count = int(round(render_duration * FRAME_RATE_HZ))
    if abs(frame_count / FRAME_RATE_HZ - render_duration) > 1.0e-9:
        raise RuntimeContractError("max_seconds must align exactly to the 250 Hz renderer frame grid")
    frames: List[Dict[str, Any]] = []
    event_cursor = 0
    prior_f0 = 0.0
    prior_loudness = 0.0
    for frame_index in range(frame_count):
        moment = frame_index / FRAME_RATE_HZ
        while event_cursor < len(events) and moment >= float(events[event_cursor]["end_seconds"]) - 1.0e-12:
            event_cursor += 1
        if event_cursor >= len(events) or moment < float(events[event_cursor]["start_seconds"]):
            frames.append({"frame_index": frame_index, "time_seconds": moment, "f0_hz": 0.0, "loudness_linear": 0.0, "voicing": 0.0, "articulation": "rest", "event_id": "", "vibrato_cents": 0.0})
            continue
        event = events[event_cursor]
        local = moment - float(event["start_seconds"])
        event_duration = float(event["end_seconds"]) - float(event["start_seconds"])
        articulation = str(event["articulation"])
        target_loudness = math.pow(10.0, float(event["steady_loudness_db"]) / 20.0)
        vibrato_cents = 0.0
        if articulation == "release":
            release = max(0.0, 1.0 - local / event_duration)
            # A release does not declare a new score pitch, but a sustained
            # wind-instrument tail must retain its immediately prior voiced
            # F0 while the authored loudness/voicing curves decay.
            f0_hz = prior_f0
            loudness = prior_loudness * math.pow(release, 1.35)
            voicing = release
        else:
            vibrato_cents = _vibrato_cents(event, local)
            target_f0 = float(event["pitch_hz"]) * math.pow(2.0, vibrato_cents / 1200.0)
            if articulation == "breath_start":
                onset = min(1.0, local / 0.065)
                loudness = target_loudness * (0.04 + 0.96 * onset)
                f0_hz = target_f0
                voicing = min(1.0, local / 0.022)
            elif articulation == "rearticulate":
                onset = min(1.0, local / 0.022)
                loudness = target_loudness * (0.35 + 0.65 * onset)
                f0_hz = target_f0
                voicing = 1.0
            elif articulation == "slur":
                transition = min(0.090, max(0.012, event_duration * 0.35))
                blend = min(1.0, local / transition)
                f0_hz = prior_f0 + (target_f0 - prior_f0) * blend
                loudness = prior_loudness + (target_loudness - prior_loudness) * blend
                voicing = 1.0
            else:  # pragma: no cover - normalized validation makes this unreachable.
                raise RuntimeContractError("unsupported articulation after plan validation")
        frames.append({
            "frame_index": frame_index,
            "time_seconds": moment,
            "f0_hz": f0_hz,
            "loudness_linear": loudness,
            "voicing": voicing,
            "articulation": articulation,
            "event_id": str(event["id"]),
            "vibrato_cents": vibrato_cents,
        })
        prior_f0 = f0_hz
        prior_loudness = loudness
    summary = {
        "source_plan": _file_record(plan_path.expanduser().resolve()),
        "source_plan_control_hz": plan["control_hz"],
        "renderer_control_hz": FRAME_RATE_HZ,
        "frame_count": frame_count,
        "duration_seconds": frame_count / FRAME_RATE_HZ,
        "truncated_for_smoke": max_seconds is not None and render_duration < duration,
        "full_plan_duration_seconds": duration,
        "articulation_frame_counts": {name: sum(1 for frame in frames if frame["articulation"] == name) for name in ARTICULATIONS},
        "explicit_release_decoder_mapping": "release declares no new score pitch but carries the immediately prior rendered F0, allowing both published harmonic and learned-noise branches to decay through the explicit decoder loudness curve (release ** 1.35) and compiled release voicing gate",
        "decoder_inputs": "F0 and linear loudness only; raw score dB is never passed to the decoder. breath/rearticulate/slur/release remain authorial curves, not inferred categorical model labels",
        "loudness_mapping": {
            "formula": "linear_loudness = 10 ** (steady_loudness_db / 20)",
            "authored_steady_db_range": [-30.0, -28.0],
            "mapped_linear_range": [math.pow(10.0, -30.0 / 20.0), math.pow(10.0, -28.0 / 20.0)],
            "separate_public_sample_audit_context": "reported active median linear loudness: published DDSP-Gugak Daegeum sample 0.0369, flute sample 0.0347; this runtime does not read either audio file",
        },
        "air_noise_ratio": "not supplied to this published decoder; no arbitrary air/noise multiplier is applied",
        "renderer_gate": {
            "audio_rate_upsampling": "linear interpolation from the compiled 250 Hz voicing curve",
            "written_rest_entry_fades": rest_entry_fade_regions(frames),
            "written_rest_entry_fade_seconds": REST_ENTRY_FADE_SECONDS,
            "hard_zero_rest_ranges": rest_sample_ranges(frames),
        },
    }
    return frames, summary


def write_controls_csv(path: Path, frames: Iterable[Mapping[str, Any]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["frame_index", "time_seconds", "f0_hz", "loudness_linear", "voicing", "articulation", "event_id", "vibrato_cents"])
        writer.writeheader()
        for frame in frames:
            writer.writerow(dict(frame))


def rest_entry_fade_regions(frames: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Return only deterministic anti-click fades at explicit voiced→rest edges."""

    fade_frames = int(round(REST_ENTRY_FADE_SECONDS * FRAME_RATE_HZ))
    regions: List[Dict[str, Any]] = []
    for index in range(1, len(frames)):
        if str(frames[index]["articulation"]) == "rest" and str(frames[index - 1]["articulation"]) in VOICED_ARTICULATIONS:
            regions.append({
                "rest_start_frame": index,
                "rest_start_seconds": index / FRAME_RATE_HZ,
                "fade_start_frame": max(0, index - fade_frames),
                "fade_start_seconds": max(0, index - fade_frames) / FRAME_RATE_HZ,
                "fade_duration_seconds": REST_ENTRY_FADE_SECONDS,
            })
    return regions


def rest_sample_ranges(frames: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Return contiguous authored-rest ranges that must be exactly silent."""

    ranges: List[Dict[str, Any]] = []
    start: Optional[int] = None
    for index, frame in enumerate(frames):
        is_rest = str(frame["articulation"]) == "rest"
        if is_rest and start is None:
            start = index
        if start is not None and (not is_rest or index == len(frames) - 1):
            end = index if not is_rest else index + 1
            ranges.append({
                "start_frame": start,
                "end_frame_exclusive": end,
                "start_seconds": start / FRAME_RATE_HZ,
                "end_seconds": end / FRAME_RATE_HZ,
                "start_sample": start * HOP_LENGTH,
                "end_sample_exclusive": end * HOP_LENGTH,
            })
            start = None
    return ranges


@contextlib.contextmanager
def legacy_fft_compat(torch: Any) -> Iterator[None]:
    """Temporarily emulate torch.rfft/irfft with torch.fft in this process only."""

    if not hasattr(torch, "fft"):
        raise RuntimeContractError("modern PyTorch torch.fft is required for the legacy compatibility shim")
    original_rfft = getattr(torch, "rfft", None)
    original_irfft = getattr(torch, "irfft", None)

    def rfft(value: Any, signal_ndim: int, normalized: bool = False, onesided: bool = True) -> Any:
        if signal_ndim != 1:
            raise RuntimeContractError("legacy rfft shim intentionally supports the published 1D component calls only")
        norm = "ortho" if normalized else "backward"
        transformed = torch.fft.rfft(value, norm=norm) if onesided else torch.fft.fft(value, norm=norm)
        return torch.view_as_real(transformed)

    def irfft(value: Any, signal_ndim: int, normalized: bool = False, onesided: bool = True, signal_sizes: Optional[Sequence[int]] = None) -> Any:
        if signal_ndim != 1:
            raise RuntimeContractError("legacy irfft shim intentionally supports the published 1D component calls only")
        norm = "ortho" if normalized else "backward"
        length = None if signal_sizes is None else int(signal_sizes[-1])
        complex_value = torch.view_as_complex(value.contiguous())
        if onesided:
            return torch.fft.irfft(complex_value, n=length, norm=norm)
        return torch.fft.ifft(complex_value, n=length, norm=norm).real

    torch.rfft = rfft
    torch.irfft = irfft
    try:
        yield
    finally:
        if original_rfft is None:
            delattr(torch, "rfft")
        else:
            torch.rfft = original_rfft
        if original_irfft is None:
            delattr(torch, "irfft")
        else:
            torch.irfft = original_irfft


def _import_published_components(torch: Any, root: Path) -> Tuple[Any, Any, Any]:
    root = root.expanduser().resolve()
    for entry in (root / "train", root):
        entry_string = str(entry)
        if entry_string not in sys.path:
            sys.path.insert(0, entry_string)
    try:
        decoder_module = importlib.import_module("network.autoencoder.decoder")
        harmonic_module = importlib.import_module("components.harmonic_oscillator")
        noise_module = importlib.import_module("components.filtered_noise")
    except Exception as exc:
        raise RuntimeContractError(f"could not import unchanged published DDSP components: {type(exc).__name__}: {exc}") from exc
    expected = {
        decoder_module: root / "train/network/autoencoder/decoder.py",
        harmonic_module: root / "components/harmonic_oscillator.py",
        noise_module: root / "components/filtered_noise.py",
    }
    for module, file_path in expected.items():
        if Path(str(module.__file__)).resolve() != file_path.resolve():
            raise RuntimeContractError("a pre-existing module shadowed the explicitly supplied published source checkout")
    return decoder_module.Decoder, harmonic_module.HarmonicOscillator, noise_module.FilteredNoise


def _decoder_config() -> types.SimpleNamespace:
    return types.SimpleNamespace(
        mlp_units=512,
        mlp_layers=3,
        use_z=False,
        z_units=16,
        n_harmonics=101,
        n_freq=65,
        gru_units=512,
        bidirectional=False,
        sample_rate=SAMPLE_RATE_HZ,
        frame_resolution=FRAME_RESOLUTION,
    )


def render_dry_cpu(frames: Sequence[Mapping[str, Any]], *, ddsp_pytorch_root: Path, checkpoint: Path, seed: int) -> Tuple[List[float], Dict[str, Any]]:
    """Load only published decoder weights and synthesize CPU dry audio from controls."""

    try:
        torch = importlib.import_module("torch")
    except ModuleNotFoundError as exc:
        raise RuntimeContractError("the named isolated Python must provide modern CPU PyTorch") from exc
    if not hasattr(torch, "fft"):
        raise RuntimeContractError("modern PyTorch with torch.fft is required")
    if torch.cuda.is_available():
        # Do not opportunistically choose it: reproducibility contract is CPU.
        device = "cpu"
    else:
        device = "cpu"
    Decoder, HarmonicOscillator, FilteredNoise = _import_published_components(torch, ddsp_pytorch_root)
    try:
        state = torch.load(str(checkpoint), map_location="cpu", weights_only=True)
    except TypeError as exc:
        raise RuntimeContractError("PyTorch is too old for safe weights_only checkpoint loading") from exc
    if not isinstance(state, Mapping) or any(not isinstance(value, torch.Tensor) for value in state.values()):
        raise RuntimeContractError("public checkpoint must be a tensor-only state dictionary")
    decoder_state = {str(key)[len("decoder."):]: value for key, value in state.items() if str(key).startswith("decoder.")}
    reverb_keys = sorted(str(key) for key in state if str(key).startswith("reverb."))
    if len(decoder_state) != 44 or reverb_keys != ["reverb.decay", "reverb.drywet", "reverb.fir"]:
        raise RuntimeContractError("checkpoint tensor layout differs from the audited Daegeum decoder/reverb layout")
    decoder = Decoder(_decoder_config()).to(device).eval()
    try:
        decoder.load_state_dict(decoder_state, strict=True)
    except RuntimeError as exc:
        raise RuntimeContractError(f"pinned decoder state could not load strictly: {exc}") from exc
    harmonic = HarmonicOscillator(sr=SAMPLE_RATE_HZ, frame_length=HOP_LENGTH, device=device).to(device).eval()
    filtered_noise = FilteredNoise(frame_length=HOP_LENGTH, device=device).to(device).eval()
    f0_values = [float(frame["f0_hz"]) for frame in frames]
    loudness_values = [float(frame["loudness_linear"]) for frame in frames]
    gate_values = [float(frame["voicing"]) for frame in frames]
    rest_fades = rest_entry_fade_regions(frames)
    hard_zero_rests = rest_sample_ranges(frames)
    torch.manual_seed(int(seed))
    with torch.inference_mode(), legacy_fft_compat(torch):
        latent = decoder({"f0": torch.tensor([f0_values], dtype=torch.float32, device=device), "loudness": torch.tensor([loudness_values], dtype=torch.float32, device=device)})
        harmonic_audio = harmonic(latent)
        noise_audio = filtered_noise(latent)
        if noise_audio.shape[-1] < harmonic_audio.shape[-1]:
            raise RuntimeContractError("published filtered-noise output was unexpectedly shorter than harmonic output")
        dry = harmonic_audio + noise_audio[:, : harmonic_audio.shape[-1]]
        frame_gate = torch.tensor(gate_values, dtype=torch.float32, device=device).view(1, 1, -1)
        gate = torch.nn.functional.interpolate(frame_gate, scale_factor=HOP_LENGTH, mode="linear", align_corners=False).squeeze(1)
        if gate.shape[-1] != dry.shape[-1]:
            raise RuntimeContractError("score gate and published synthesis length disagree")
        for region in rest_fades:
            end = int(region["rest_start_frame"]) * HOP_LENGTH
            start = max(0, end - int(round(REST_ENTRY_FADE_SECONDS * SAMPLE_RATE_HZ)))
            fade = torch.linspace(1.0, 0.0, end - start, dtype=torch.float32, device=device)
            gate[:, start:end] *= fade
        # Linear interpolation is correct for voiced envelopes, but its edge
        # kernel can otherwise bleed a few samples into a written rest. The
        # authored rest contract wins: each full rest range is hard-zero.
        for region in hard_zero_rests:
            gate[:, int(region["start_sample"]):int(region["end_sample_exclusive"])] = 0.0
        # This is an authorial time-domain gate, not learned conditioning: it
        # hard-zeros the written rest and applies the already compiled 0→1
        # breath / 1→0 release envelope to both published branches.
        dry = dry * gate
        audio = dry.squeeze(0).detach().cpu().tolist()
        latent_shapes = {key: list(value.shape) for key, value in latent.items()}
        amplitude_range = [float(latent["a"].min().cpu()), float(latent["a"].max().cpu())]
        noise_range = [float(latent["H"].min().cpu()), float(latent["H"].max().cpu())]
    if hasattr(torch, "rfft") or hasattr(torch, "irfft"):
        raise RuntimeContractError("legacy FFT compatibility shim leaked outside its process-local context")
    return audio, {
        "runtime": {"python": sys.version.split()[0], "torch": str(torch.__version__), "device": device, "cuda_selected": False, "seed": int(seed)},
        "checkpoint_tensors": {"decoder_tensor_count": len(decoder_state), "unloaded_reverb_tensor_keys": reverb_keys},
        "published_component_outputs": {"latent_shapes": latent_shapes, "harmonic_samples": int(harmonic_audio.shape[-1]), "noise_samples_before_dry_trim": int(noise_audio.shape[-1]), "decoder_amplitude_range": amplitude_range, "decoder_noise_filter_range": noise_range},
        "release_boundary_qa": release_boundary_qa(audio, frames),
        "compatibility": {"legacy_torch_rfft_irfft": "temporary process-local torch.fft adapter; restored before return", "hardcoded_cuda": "published harmonic/noise constructors received device='cpu'; no source file was edited", "encoder_crepe_or_audio_input": "not imported or called", "authored_rest_gate": {"written_rest_is_hard_zeroed_after_published_dry_synthesis": True, "hard_zero_rest_sample_ranges": hard_zero_rests, "voicing_upsampling": "linear 250 Hz to 16 kHz", "pre_rest_anti_click_fades": rest_fades, "pre_rest_fade_seconds": REST_ENTRY_FADE_SECONDS, "release": "no new score pitch; prior voiced F0, decoder-loudness, and voicing decay keep harmonic/noise continuous"}},
    }


def _audio_stats(samples: Sequence[float]) -> Dict[str, float]:
    if not samples:
        raise RuntimeContractError("renderer produced no audio samples")
    peak = max(abs(float(value)) for value in samples)
    rms = math.sqrt(sum(float(value) * float(value) for value in samples) / len(samples))
    return {"peak": peak, "rms": rms, "rms_dbfs": -math.inf if rms == 0.0 else 20.0 * math.log10(rms)}


def release_boundary_qa(samples: Sequence[float], frames: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    """Fail closed if a release begins with a large artificial energy cliff."""

    starts = [index for index, frame in enumerate(frames) if str(frame["articulation"]) == "release" and (index == 0 or str(frames[index - 1]["articulation"]) != "release")]
    if len(starts) != 1:
        raise RuntimeContractError("the explicit plan must have exactly one release onset for this R&D boundary QA")
    boundary = starts[0] * HOP_LENGTH
    window = int(round(0.020 * SAMPLE_RATE_HZ))
    if boundary < window or boundary + window > len(samples):
        raise RuntimeContractError("release boundary cannot support the required 20 ms QA windows")
    pre = _audio_stats(samples[boundary - window:boundary])["rms"]
    post = _audio_stats(samples[boundary:boundary + window])["rms"]
    if pre <= 0.0 or post <= 0.0:
        raise RuntimeContractError("release boundary contains an unexpected silent 20 ms QA window")
    delta_db = 20.0 * math.log10(post / pre)
    if delta_db < -6.0:
        raise RuntimeContractError("release begins with an artificial >6 dB 20 ms energy cliff")
    return {
        "release_start_frame": starts[0],
        "release_start_seconds": starts[0] / FRAME_RATE_HZ,
        "window_seconds": 0.020,
        "pre_window_rms": pre,
        "post_window_rms": post,
        "post_minus_pre_db": delta_db,
        "minimum_permitted_post_minus_pre_db": -6.0,
        "passed": True,
    }


def write_pcm16_wav(path: Path, samples: Sequence[float], *, sample_rate: int = SAMPLE_RATE_HZ) -> Dict[str, Any]:
    stats = _audio_stats(samples)
    if not math.isfinite(stats["peak"]) or stats["peak"] > 0.999:
        raise RuntimeContractError("dry render would clip; refusing to silently normalize a published-model output")
    pcm = array.array("h", (max(-32767, min(32767, int(round(float(value) * 32767.0)))) for value in samples))
    if sys.byteorder != "little":
        pcm.byteswap()
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(sample_rate)
        output.writeframes(pcm.tobytes())
    return {**_file_record(path), "sample_rate_hz": sample_rate, "sample_count": len(samples), "duration_seconds": len(samples) / sample_rate, "unscaled_audio": stats}


def _read_safe_flute_reference(path: Path) -> Tuple[List[float], Dict[str, Any]]:
    path = path.expanduser().resolve()
    report_path = path.parent.parent / "official_flute_rnd_report.json"
    report = _load_json(report_path, label="official western-flute R&D report")
    if report.get("status") != "succeeded" or _mapping(report.get("scope"), label="flute report.scope").get("no_ngc_or_user_audio_read") is not True:
        raise RuntimeContractError("listening reference is not a verified prior synthetic western-flute R&D output")
    variants = _mapping(report.get("variants"), label="flute report.variants")
    bridge = _mapping(variants.get("B_authorial_bridge6_controls"), label="flute report variant B")
    reference_record = _mapping(bridge.get("audio"), label="flute report variant B.audio")
    if path.name != "authorial_score_bridge6.wav" or _sha256(path) != reference_record.get("sha256"):
        raise RuntimeContractError("reference WAV does not match the recorded official western-flute B artifact")
    with wave.open(str(path), "rb") as input_wave:
        if input_wave.getnchannels() != 1 or input_wave.getsampwidth() != 2 or input_wave.getframerate() != SAMPLE_RATE_HZ or input_wave.getcomptype() != "NONE":
            raise RuntimeContractError("reference WAV must be the expected mono 16-bit 16 kHz synthetic artifact")
        raw = input_wave.readframes(input_wave.getnframes())
    pcm = array.array("h")
    pcm.frombytes(raw)
    if sys.byteorder != "little":
        pcm.byteswap()
    return [sample / 32767.0 for sample in pcm], {"audio": _file_record(path), "report": _file_record(report_path), "verified_synthetic_reference_only": True}


def _active_rms(samples: Sequence[float], frames: Sequence[Mapping[str, Any]]) -> float:
    mask: List[bool] = []
    for frame in frames:
        active = str(frame["articulation"]) in VOICED_ARTICULATIONS
        mask.extend([active] * HOP_LENGTH)
    if len(mask) != len(samples):
        raise RuntimeContractError("listening-level mask does not align to rendered sample count")
    chosen = [float(sample) for sample, active in zip(samples, mask) if active]
    if not chosen:
        raise RuntimeContractError("score contains no voiced frames for active-RMS matching")
    return math.sqrt(sum(sample * sample for sample in chosen) / len(chosen))


def _level_match(samples: Sequence[float], *, active_rms: float, target_rms: float = 0.06309573444801933) -> Tuple[List[float], Dict[str, float]]:
    if active_rms <= 0.0:
        raise RuntimeContractError("cannot level-match an all-silent listening artifact")
    requested_gain = target_rms / active_rms
    peak = _audio_stats(samples)["peak"]
    if peak and requested_gain * peak > 0.98:
        raise RuntimeContractError("-24 dBFS listening-pair level match would clip; refusing an unequal or silently limited comparison")
    scaled = [float(sample) * requested_gain for sample in samples]
    return scaled, {"requested_target_active_rms": target_rms, "source_active_rms": active_rms, "gain": requested_gain, "clipping_limited": False}


def _require_fresh_output(root: Path, output_dir: Path) -> Path:
    root = root.expanduser().resolve()
    output_dir = output_dir.expanduser().resolve()
    allowed_parent = (root / "_bgm_rnd").resolve()
    if output_dir.parent != allowed_parent or OUTPUT_NAME.fullmatch(output_dir.name) is None:
        raise RuntimeContractError("output must be a fresh direct child named ddsp-gugak-public-daegeum-runtime-r1-YYYYMMDD-HHMMSS under ignored _bgm_rnd/")
    if output_dir.exists():
        raise RuntimeContractError("output directory already exists; choose a fresh R&D directory")
    return output_dir


def build_check_report(*, plan: Path, gugak_root: Path, ddsp_pytorch_root: Path, checkpoint: Path, checkpoint_config: Path) -> Dict[str, Any]:
    return {
        "schema": TOOL_SCHEMA,
        "status": "checked_not_rendered",
        "public_sources": validate_public_sources(gugak_root, ddsp_pytorch_root),
        "checkpoint": validate_checkpoint(checkpoint, checkpoint_config),
        "score_plan": validate_plan(plan),
        "scope": {
            "r_and_d_only": True,
            "no_training": True,
            "no_ngc_or_user_audio_read": True,
            "no_audio_input_or_crepe": True,
            "no_default_bgm_changed": True,
            "not_a_game_asset": True,
            "no_learned_reverb_in_dry_render": True,
        },
        "license_limits": {
            "ddsp_gugak_repository_code": "MIT license file verified",
            "ddsp_pytorch_repository_code": "MIT license file verified",
            "checkpoint": "publicly downloadable checkpoint bytes verified, but no explicit separate checkpoint/game/distribution license is established by this tool",
            "render": "R&D-only; no game/public distribution clearance",
        },
    }


def execute(args: argparse.Namespace) -> Dict[str, Any]:
    if args.confirm_rnd_only is not True:
        raise RuntimeContractError("--execute requires --confirm-rnd-only")
    repository_root = args.repository_root.expanduser().resolve()
    output_dir = _require_fresh_output(repository_root, args.output_dir)
    if args.supersedes_output is not None and OUTPUT_NAME.fullmatch(args.supersedes_output) is None:
        raise RuntimeContractError("--supersedes-output must name one prior DDSP-Gugak R&D output directory")
    check = build_check_report(plan=args.plan, gugak_root=args.gugak_source_root, ddsp_pytorch_root=args.ddsp_pytorch_root, checkpoint=args.checkpoint, checkpoint_config=args.checkpoint_config)
    frames, controls = build_score_controls(args.plan, max_seconds=args.max_seconds)
    if args.reference_flute_wav is not None and controls["truncated_for_smoke"]:
        raise RuntimeContractError("the 6.72-second western-flute reference is allowed only for a full-plan listening pair")
    output_dir.mkdir(parents=False)
    controls_path = output_dir / "score_controls_250hz.csv"
    write_controls_csv(controls_path, frames)
    try:
        audio, render = render_dry_cpu(frames, ddsp_pytorch_root=args.ddsp_pytorch_root, checkpoint=args.checkpoint, seed=args.seed)
        dry_path = output_dir / "published_daegeum_decoder_dry_authorial_gate.wav"
        outputs: Dict[str, Any] = {"controls_csv": _file_record(controls_path), "dry_wav": write_pcm16_wav(dry_path, audio)}
        listening_pair: Optional[Dict[str, Any]] = None
        if args.reference_flute_wav is not None:
            reference_audio, reference_provenance = _read_safe_flute_reference(args.reference_flute_wav)
            if len(reference_audio) != len(audio):
                raise RuntimeContractError("verified western-flute reference duration does not match the full score render")
            daegeum_scaled, daegeum_gain = _level_match(audio, active_rms=_active_rms(audio, frames))
            flute_scaled, flute_gain = _level_match(reference_audio, active_rms=_active_rms(reference_audio, frames))
            daegeum_pair_path = output_dir / "A_published_daegeum_dry_active_rms_matched.wav"
            flute_pair_path = output_dir / "B_official_midi_ddsp_flute_bridge_active_rms_matched.wav"
            listening_pair = {
                "purpose": "post-render listening comparison only; the western-flute WAV is never decoder conditioning or a training input",
                "target_active_rms": 0.06309573444801933,
                "target_active_rms_dbfs": -24.0,
                "published_daegeum": {"audio": write_pcm16_wav(daegeum_pair_path, daegeum_scaled), "gain": daegeum_gain},
                "official_western_flute_B": {"audio": write_pcm16_wav(flute_pair_path, flute_scaled), "gain": flute_gain, "provenance": reference_provenance},
            }
        report = {
            **check,
            "status": "succeeded",
            "supersedes_rnd_output_directory": args.supersedes_output,
            "score_controls": controls,
            "render": render,
            "outputs": outputs,
            "listening_pair": listening_pair,
            "actions_performed": {
                "training": False,
                "ngc_or_user_audio_read": False,
                "crepe_or_audio_input_used": False,
                "learned_reverb_called": False,
                "default_bgm_changed": False,
                "source_files_modified": False,
            },
        }
        report_path = output_dir / "runtime_report.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        return {"output_directory": output_dir.name, "report": _file_record(report_path), "dry_wav": outputs["dry_wav"], "listening_pair_created": listening_pair is not None}
    except BaseException:
        # A half-populated fresh output must not be presented as a successful render.
        shutil.rmtree(output_dir)
        raise


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="validate only; do not import Torch or render")
    mode.add_argument("--execute", action="store_true", help="perform one explicit R&D-only CPU render")
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--gugak-source-root", type=Path, required=True, help="untouched DDSP-Gugak checkout at the pinned commit")
    parser.add_argument("--ddsp-pytorch-root", type=Path, required=True, help="untouched ddsp-pytorch checkout at the pinned commit")
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--checkpoint-config", type=Path, required=True)
    parser.add_argument("--repository-root", type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument("--output-dir", type=Path, help="fresh ignored _bgm_rnd output directory, required with --execute")
    parser.add_argument("--reference-flute-wav", type=Path, help="optional verified prior synthetic MIDI-DDSP flute-B listening reference")
    parser.add_argument("--supersedes-output", help="optional prior DDSP-Gugak R&D output directory basename recorded as superseded")
    parser.add_argument("--max-seconds", type=float, help="250 Hz-aligned score prefix for an actual decoder smoke render")
    parser.add_argument("--seed", type=int, default=20260925)
    parser.add_argument("--confirm-rnd-only", action="store_true")
    args = parser.parse_args(argv)
    if args.execute and args.output_dir is None:
        parser.error("--execute requires --output-dir")
    if args.check and (args.output_dir is not None or args.reference_flute_wav is not None or args.supersedes_output is not None or args.confirm_rnd_only):
        parser.error("--check does not accept output, reference, supersession, or execution confirmation flags")
    return args


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    try:
        if args.check:
            report = build_check_report(plan=args.plan, gugak_root=args.gugak_source_root, ddsp_pytorch_root=args.ddsp_pytorch_root, checkpoint=args.checkpoint, checkpoint_config=args.checkpoint_config)
        else:
            report = execute(args)
    except RuntimeContractError as exc:
        print(f"ddsp-gugak-public-runtime: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
