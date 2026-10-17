"""Bounded local WORLD parameter-copy diagnostic, not a new composition.

Primary: Harvest70..1800Hz/5ms -> CheapTrick -> D4C(.85) -> synthesis.
No extractor fallback, F0 interpolation, weights, training, denoising or EQ.
"""
import argparse
import hashlib
from importlib.metadata import version
import io
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
import ace_limits
import prepare_inputs

SR, PERIOD_MS, OUTPUT_BUDGET = 24000, 5., 80_000_000
CASES = (("sus04", "sanjo_deageum_scale_sus_04.wv", 0.),
         ("vib39", "sanjo_deageum_scale_vib_39.wv", 2.),
         ("arirang002", "w3-914-002__아리랑 02.flac", 0.))


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def array_digest(value):
    array = np.ascontiguousarray(value)
    prefix = json.dumps([array.dtype.str, list(array.shape)], separators=(",", ":")).encode()
    return hashlib.sha256(prefix + array.tobytes()).hexdigest()


def analyze_and_synthesize(audio, *, sample_rate=SR, pitch_shift=0, world=None):
    """Public array helper, including existing1s controls; imports WORLD lazily.

    Returns (right-trimmed float64 mono, control arrays, JSON-safe facts).
    Controls: original/synthesis F0, times, source SP/AP; no phase preservation.
    """
    x = np.ascontiguousarray(audio, dtype=np.float64).copy()
    if (sample_rate != SR or pitch_shift not in (0, 1) or x.ndim != 1
            or not 2400 <= len(x) <= 115200 or len(x) % 120
            or not np.isfinite(x).all() or np.sqrt(np.mean(x*x)) <= 1e-8):
        raise ValueError("finite_audible_24k_mono_0p1_to4p8s_5ms_grid_required")
    if world is None:
        import pyworld as world
    input_sha = array_digest(x)
    f0, times = world.harvest(x, sample_rate, f0_floor=70., f0_ceil=1800., frame_period=PERIOD_MS)
    f0, times = (np.ascontiguousarray(value, dtype=np.float64) for value in (f0, times))
    frames = len(x) // 120 + 1
    if (f0.shape != (frames,) or times.shape != (frames,) or not np.isfinite(f0).all()
            or not np.isfinite(times).all() or not np.allclose(times, np.arange(frames)*.005, atol=1e-9, rtol=0)
            or np.any((f0 < 0) | ((f0 > 0) & ((f0 < 70) | (f0 > 1800)))) or not np.any(f0 > 0)):
        raise ValueError("analysis_pitch_failed_no_fallback_or_interpolation")
    sp = np.ascontiguousarray(world.cheaptrick(x, f0, times, sample_rate, f0_floor=70.), dtype=np.float64)
    if sp.ndim != 2 or sp.shape[0] != frames or sp.shape[1] < 2:
        raise ValueError("spectral_envelope_shape_failed")
    fft_size = 2 * (sp.shape[1] - 1)
    ap = np.ascontiguousarray(world.d4c(x, f0, times, sample_rate, threshold=.85, fft_size=fft_size), dtype=np.float64)
    if (ap.shape != sp.shape or not np.isfinite(sp).all() or not np.isfinite(ap).all()
            or np.any(sp < 0) or not np.any(sp > 0) or np.any((ap < 0) | (ap > 1))):
        raise ValueError("spectral_or_aperiodicity_analysis_failed")
    original = f0.copy()
    used = f0.copy()
    used[used > 0] *= 2**(pitch_shift / 12)
    controls = {"f0_hz": original, "synthesis_f0_hz": used, "time_seconds": times,
                "spectral_envelope": sp, "aperiodicity": ap}
    hashes = {key: array_digest(value) for key, value in controls.items()}
    output = np.asarray(world.synthesize(used, sp, ap, sample_rate, frame_period=PERIOD_MS), dtype=np.float64)
    if hashes != {key: array_digest(value) for key, value in controls.items()} or array_digest(x) != input_sha:
        raise ValueError("WORLD_mutated_input_or_fixed_control_arrays")
    if output.shape != (frames * 120,) or not np.isfinite(output).all():
        raise ValueError("unexpected_synthesis_length_or_nonfinite_output")
    y = output[:len(x)].copy()
    if np.sqrt(np.mean(y*y)) <= 1e-8:
        raise ValueError("silent_resynthesis")
    voiced = original > 0
    facts = {"algorithm": "Harvest->CheapTrick->D4C.85->WORLD_synthesis", "f0_floor": 70.,
        "f0_ceil": 1800., "frame_period_ms": PERIOD_MS, "fft_size": fft_size,
        "control_sha256": hashes, "sp_shape": list(sp.shape), "ap_shape": list(ap.shape),
        "sp_min_max": [float(sp.min()), float(sp.max())], "ap_min_max": [float(ap.min()), float(ap.max())],
        "voiced_frames": int(voiced.sum()), "control_frames": frames,
        "voiced_fraction": float(voiced.mean()), "voiced_f0_min_max": [float(original[voiced].min()), float(original[voiced].max())],
        "voiced_ap_all_approximately_one_fraction": float(np.all(ap[voiced] >= 1 - 1e-6, axis=1).mean()),
        "pitch_shift_semitones": pitch_shift, "f0_zero_mask_unchanged": bool(np.array_equal(original == 0, used == 0)),
        "sp_ap_unchanged": True, "input_samples": len(x), "raw_output_samples": len(output),
        "right_trimmed_samples": len(output) - len(x), "output_samples": len(y),
        "source_rms": float(np.sqrt(np.mean(x*x))), "output_rms": float(np.sqrt(np.mean(y*y))),
        "output_peak": float(np.max(np.abs(y))), "original_phase_or_noise_waveform_preserved": False,
        "new_music": False, "original_pcm_copy": False, "naturalness_approved": False}
    return y, controls, facts


def selected_sources(manifest_path):
    path = Path(manifest_path).resolve(strict=True)
    if not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > 1_000_000:
        raise ValueError("small_regular_manifest_required")
    manifest = json.loads(path.read_text())
    if (manifest.get("schema") != "mini.nsf-public-ngc-data.v1" or manifest.get("status") != "complete"
            or manifest.get("AIHub_files_used") != 0):
        raise ValueError("fixed_public_NGC_manifest_required")
    root = Path(manifest["source_root"]).resolve(strict=True)
    rows = []
    for name, filename, start in CASES:
        found = [row for row in manifest["files"] if Path(row["source_path"]).name == filename]
        if len(found) != 1:
            raise ValueError("fixed_source_missing_or_ambiguous")
        item = found[0]
        source = Path(item["source_path"])
        if (not source.is_absolute() or not stat.S_ISREG(source.lstat().st_mode)
                or not source.resolve().is_relative_to(root) or digest(source) != item["source_sha256"]):
            raise ValueError("original_source_binding_failed")
        rows.append({"case": name, "source_path": str(source), "source_sha256": item["source_sha256"],
                     "start_seconds": start, "end_seconds": start + 4.8})
    return manifest, rows


def decode_case(row):
    result = subprocess.run(["ffmpeg", "-v", "error", "-nostdin", "-i", row["source_path"],
        "-ss", str(row["start_seconds"]), "-t", "4.8", "-vn", "-ac", "1", "-ar", str(SR),
        "-f", "f64le", "pipe:1"], capture_output=True, check=True, timeout=30)
    wave = np.frombuffer(result.stdout, dtype="<f8").copy()
    if wave.shape != (115200,):
        raise ValueError("fixed_case_decode_length_failed")
    return wave


def save_payload(output, name, payload):
    path = output / name
    if path.exists():
        raise ValueError("fresh_output_required")
    if sum(p.stat().st_size for p in output.iterdir() if p.is_file()) + len(payload) > OUTPUT_BUDGET:
        raise ValueError("80MB_total_output_budget_exceeded")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return {"file": name, "sha256": digest(path), "bytes": path.stat().st_size}


def save_audio(output, name, audio, rate, role):
    if not np.isfinite(audio).all():
        raise ValueError("finite_audio_required")
    buffer = io.BytesIO()
    sf.write(buffer, audio, rate, format="WAV", subtype="FLOAT")
    return {**save_payload(output, name, buffer.getvalue()), "role": role,
            "sample_rate": rate, "samples": len(audio), "format": "WAV_FLOAT"}


def save_controls(output, name, controls, source_waveform):
    buffer = io.BytesIO()
    np.savez_compressed(buffer, **controls, source_waveform_24k=np.asarray(source_waveform, dtype=np.float64))
    return {**save_payload(output, name, buffer.getvalue()), "role": "unmodified_float64_source_and_WORLD_controls",
            "archive_format": "compressed_npz_no_pickle", "control_dtype": "float64"}


def run(args):
    os.umask(0o077)
    output = prepare_inputs.fresh_private_dir(args.output)
    report_path = output / "report.json"
    started = time.monotonic()
    report = {"schema": "mini.world-source-copy.v1", "status": "started", "cases": [],
        "pitch_shift_semitones": args.pitch_shift, "new_weights": 0, "new_training": 0,
        "AIHub_used": False, "new_music": False, "max_seconds": 300, "all_output_budget_bytes": OUTPUT_BUDGET}
    def write():
        report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    write()
    try:
        with ace_limits.ResourceGuard(output, ace_limits.ResourceCaps(max_seconds=300)) as guard:
            manifest, rows = selected_sources(args.manifest)
            binding = {str(args.manifest.resolve()): digest(args.manifest), str(Path(__file__)): digest(__file__),
                       str(Path(ace_limits.__file__)): digest(ace_limits.__file__),
                       str(Path(prepare_inputs.__file__)): digest(prepare_inputs.__file__)}
            binding.update({row["source_path"]: row["source_sha256"] for row in rows})
            import pyworld
            if version("pyworld") != "0.3.5":
                raise ValueError("pinned_pyworld_0p3p5_required")
            report.update(binding_sha256=binding, resource_initial=guard.initial, versions={name: version(name) for name in
                          ("pyworld", "numpy", "scipy", "soundfile")}, source_credit=manifest["source_credit"],
                          software_licenses=["PyWORLD MIT", "WORLD modified-BSD"],
                          input_recordings_reused=True, source_originals_read_only=True,
                          license_scope=manifest.get("license_scope"), network_used=False)
            for row in rows:
                entry = {**row, "status": "started"}
                report["cases"].append(entry)
                write()
                try:
                    wave = decode_case(row)
                    generated, controls, facts = analyze_and_synthesize(wave, pitch_shift=args.pitch_shift, world=pyworld)
                    archive = save_controls(output, row["case"] + "_controls.npz", controls, wave)
                    source_high = np.repeat(resample_poly(wave, 2, 1)[:, None], 2, axis=1)
                    high = np.repeat(resample_poly(generated, 2, 1)[:, None], 2, axis=1)
                    files = [save_audio(output, row["case"] + "_source_24k_mono.wav", wave, SR, "source_excerpt"),
                             save_audio(output, row["case"] + "_source_48k_stereo.wav", source_high, 48000, "source_excerpt_SRC"),
                             save_audio(output, row["case"] + "_world_24k_mono.wav", generated, SR, "WORLD_parameter_resynthesis"),
                             save_audio(output, row["case"] + "_world_48k_stereo.wav", high, 48000, "WORLD_parameter_resynthesis_SRC")]
                    entry.update(status="resynthesized_not_listening_approved", facts=facts, audio=files,
                                 controls_archive=archive)
                except Exception as exc:
                    entry.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:500])
                write()
            if any(digest(path) != expected for path, expected in binding.items()):
                raise ValueError("immutable_source_manifest_or_code_changed")
            report.update(status="complete" if all(row["status"].startswith("resynthesized") for row in report["cases"])
                          else "complete_with_failed_cases", immutable_bindings_unchanged=True)
        report["resource_final"] = guard.final
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:1000])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        write()
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--pitch-shift", choices=(0, 1), type=int, default=0)
    run(parser.parse_args())
