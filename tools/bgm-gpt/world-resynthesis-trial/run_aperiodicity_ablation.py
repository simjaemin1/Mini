"""Fixed D4C threshold-zero diagnostic from bound, saved WORLD controls.

Threshold zero disables D4C's extra voiced/unvoiced rejection gate; it does
not set spectral aperiodicity to zero or remove all noise. No F0 re-extraction,
fallback, pitch edit, training or new composition. Naturalness is unapproved.
"""
import argparse
from importlib.metadata import version
import io
import json
import os
from pathlib import Path
import stat
import time

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

import run_world_copy as parent

SR, OUTPUT_BUDGET = parent.SR, 40_000_000
KEYS = ("f0_hz", "synthesis_f0_hz", "time_seconds", "spectral_envelope", "aperiodicity")


def regular(path, limit):
    path = Path(path)
    if not path.is_absolute() or not stat.S_ISREG(path.lstat().st_mode) or path.stat().st_size > limit:
        raise ValueError("bounded_absolute_regular_file_required")
    return path


def bound_file(folder, row, limit=20_000_000):
    name = row["file"]
    if Path(name).name != name or name in ("", ".", ".."):
        raise ValueError("unsafe_bound_filename")
    path = regular(folder / name, limit)
    if path.stat().st_size != row["bytes"] or parent.digest(path) != row["sha256"]:
        raise ValueError("bound_file_sha_or_size_mismatch")
    return path


def validate_controls(controls, source, expected):
    if set(controls) != set(KEYS) or source.shape != (115200,) or source.dtype != np.float64:
        raise ValueError("fixed_4p8s_float64_source_and_control_keys_required")
    if any(a.dtype != np.float64 or not np.isfinite(a).all() for a in [source, *controls.values()]):
        raise ValueError("finite_float64_controls_required")
    f0, times, sp, ap = (controls[k] for k in ("f0_hz", "time_seconds", "spectral_envelope", "aperiodicity"))
    if (f0.shape != (961,) or times.shape != (961,) or sp.ndim != 2 or sp.shape[0] != 961
            or sp.shape[1] < 2 or ap.shape != sp.shape
            or not np.array_equal(f0, controls["synthesis_f0_hz"])
            or not np.allclose(times, np.arange(961)*.005, atol=1e-9, rtol=0)
            or np.any((f0 < 0) | ((f0 > 0) & ((f0 < 70) | (f0 > 1800))))
            or not np.any(f0 > 0) or np.any(sp < 0) or not np.any(sp > 0)
            or np.any((ap < 0) | (ap > 1)) or np.sqrt(np.mean(source*source)) <= 1e-8):
        raise ValueError("fixed_unshifted_WORLD_controls_invalid")
    if {k: parent.array_digest(controls[k]) for k in KEYS} != expected:
        raise ValueError("saved_control_array_sha_mismatch")


def load_bound_cases(report_path):
    path = regular(report_path, 1_000_000)
    report = json.loads(path.read_text())
    if (report.get("schema") != "mini.world-source-copy.v1" or report.get("status") != "complete"
            or report.get("pitch_shift_semitones") != 0 or not report.get("immutable_bindings_unchanged")
            or [r["case"] for r in report["cases"]] != [c[0] for c in parent.CASES]):
        raise ValueError("completed_fixed_unshifted_parent_report_required")
    bindings = dict(report["binding_sha256"])
    if bindings.get(str(Path(parent.__file__).resolve())) != parent.digest(parent.__file__):
        raise ValueError("frozen_parent_code_binding_missing")
    bindings[str(path)] = parent.digest(path)
    rows = []
    for row, (name, filename, start) in zip(report["cases"], parent.CASES):
        original = regular(row["source_path"], 2_000_000_000)
        if (original.name != filename or row["start_seconds"] != start or row["end_seconds"] != start+4.8
                or bindings.get(str(original)) != row["source_sha256"]
                or row["facts"]["algorithm"] != "Harvest->CheapTrick->D4C.85->WORLD_synthesis"
                or row["facts"]["pitch_shift_semitones"] != 0):
            raise ValueError("fixed_original_source_or_protocol_binding_failed")
        archive = bound_file(path.parent, row["controls_archive"])
        with np.load(archive, allow_pickle=False) as saved:
            if set(saved.files) != set(KEYS) | {"source_waveform_24k"}:
                raise ValueError("unexpected_archive_members")
            controls = {k: saved[k].copy() for k in KEYS}
            source = saved["source_waveform_24k"].copy()
        validate_controls(controls, source, row["facts"]["control_sha256"])
        base = [r for r in row["audio"] if r["role"] == "WORLD_parameter_resynthesis"]
        if len(base) != 1:
            raise ValueError("one_bound_default_24k_audio_required")
        baseline_path = bound_file(path.parent, base[0])
        baseline, rate = sf.read(baseline_path, dtype="float64")
        if rate != SR or baseline.shape != source.shape or not np.isfinite(baseline).all():
            raise ValueError("bound_baseline_audio_invalid")
        bindings.update({str(archive): parent.digest(archive), str(baseline_path): parent.digest(baseline_path)})
        rows.append((row, controls, source, baseline))
    verify_bindings(bindings)
    return report, rows, bindings


def verify_bindings(bindings):
    if any(parent.digest(regular(path, 2_000_000_000)) != sha for path, sha in bindings.items()):
        raise ValueError("immutable_source_report_archive_or_code_changed")


def ablate_aperiodicity(controls, source, *, world=None):
    """Return (trimmed mono float64, new AP only, facts), without reanalysis."""
    hashes = {k: parent.array_digest(controls[k]) for k in KEYS}
    validate_controls(controls, source, hashes)
    source_sha = parent.array_digest(source)
    if world is None:
        import pyworld as world
    f0, times, sp, old_ap = (controls[k] for k in ("f0_hz", "time_seconds", "spectral_envelope", "aperiodicity"))
    fft_size = 2 * (sp.shape[1] - 1)
    ap = np.ascontiguousarray(world.d4c(source, f0, times, SR, threshold=0., fft_size=fft_size), dtype=np.float64)
    if ap.shape != sp.shape or not np.isfinite(ap).all() or np.any((ap < 0) | (ap > 1)):
        raise ValueError("ablation_aperiodicity_invalid")
    ap_sha = parent.array_digest(ap)
    raw = np.asarray(world.synthesize(f0, sp, ap, SR, frame_period=5.), dtype=np.float64)
    if (hashes != {k: parent.array_digest(controls[k]) for k in KEYS}
            or source_sha != parent.array_digest(source) or ap_sha != parent.array_digest(ap)):
        raise ValueError("WORLD_mutated_fixed_input_or_control")
    if raw.shape != (961*120,) or not np.isfinite(raw).all():
        raise ValueError("unexpected_synthesis_length_or_nonfinite_output")
    y = raw[:len(source)].copy()
    if np.sqrt(np.mean(y*y)) <= 1e-8:
        raise ValueError("silent_resynthesis")
    voiced = f0 > 0
    return y, ap, {"control_sha256_before": hashes, "source_array_sha256": source_sha,
        "new_aperiodicity_sha256": ap_sha, "f0_time_sp_and_old_ap_unchanged": True,
        "f0_zero_mask_unchanged": True, "fft_size": fft_size, "d4c_threshold": 0.,
        "voiced_frames": int(voiced.sum()), "f0_zero_frames": int((~voiced).sum()),
        "voiced_ap_all_approximately_one_fraction_before": float(np.all(old_ap[voiced] >= 1-1e-6, axis=1).mean()),
        "voiced_ap_all_approximately_one_fraction_after": float(np.all(ap[voiced] >= 1-1e-6, axis=1).mean()),
        "new_ap_shape": list(ap.shape), "new_ap_min_max": [float(ap.min()), float(ap.max())],
        "raw_output_samples": len(raw), "right_trimmed_samples": len(raw)-len(source),
        "output_samples": len(y), "output_rms": float(np.sqrt(np.mean(y*y))),
        "output_peak": float(np.abs(y).max()), "original_phase_or_noise_waveform_preserved": False}


def rms_trace(audio):
    return np.sqrt(np.mean(audio.reshape(-1, 240)**2, axis=1)).tolist()


def save_payload(output, name, payload):
    if sum(p.stat().st_size for p in output.iterdir()) + len(payload) > OUTPUT_BUDGET:
        raise ValueError("40MB_all_output_budget_exceeded")
    path = output / name
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return {"file": name, "sha256": parent.digest(path), "bytes": len(payload)}


def run(args):
    os.umask(0o077)
    output = parent.prepare_inputs.fresh_private_dir(args.output)
    started = time.monotonic()
    report = {"schema": "mini.world-d4c-threshold-ablation.v1", "status": "started", "cases": [],
        "source_report": str(args.source_report), "d4c_threshold": 0., "parent_threshold": .85,
        "max_seconds": 300, "all_output_budget_bytes": OUTPUT_BUDGET, "new_weights": 0, "new_training": 0,
        "new_music": False, "naturalness_approved": False, "network_used": False,
        "meaning": "D4C extra VUV gate disabled; measured spectral aperiodicity retained, not all noise removed"}
    def write():
        data = (json.dumps(report, indent=2, ensure_ascii=False, allow_nan=False)+"\n").encode()
        other = sum(p.stat().st_size for p in output.iterdir() if p.name != "report.json")
        if other + len(data) > OUTPUT_BUDGET:
            raise ValueError("40MB_all_output_budget_exceeded")
        (output / "report.json").write_bytes(data)
    write()
    try:
        with parent.ace_limits.ResourceGuard(output, parent.ace_limits.ResourceCaps(max_seconds=300)) as guard:
            source_report, rows, bindings = load_bound_cases(args.source_report)
            bindings[str(Path(__file__).resolve())] = parent.digest(__file__)
            import pyworld
            if version("pyworld") != "0.3.5":
                raise ValueError("pinned_pyworld_0p3p5_required")
            report.update(binding_sha256=bindings, source_credit=source_report["source_credit"],
                resource_initial=guard.initial, source_originals_read_only=True, AIHub_used=False,
                versions={name: version(name) for name in ("pyworld", "numpy", "scipy", "soundfile")})
            for row, controls, source, baseline in rows:
                y, ap, facts = ablate_aperiodicity(controls, source, world=pyworld)
                buffer = io.BytesIO()
                np.savez_compressed(buffer, aperiodicity=ap)
                archive = save_payload(output, row["case"]+"_threshold0_ap_only.npz", buffer.getvalue())
                audio = []
                for suffix, wave, rate, role in (("24k_mono", y, SR, "D4C_threshold0_parameter_resynthesis"),
                        ("48k_stereo", np.repeat(resample_poly(y, 2, 1)[:, None], 2, axis=1), 48000,
                         "D4C_threshold0_parameter_resynthesis_SRC")):
                    buffer = io.BytesIO()
                    sf.write(buffer, wave, rate, format="WAV", subtype="FLOAT")
                    audio.append({**save_payload(output, row["case"]+"_threshold0_"+suffix+".wav", buffer.getvalue()),
                                  "role": role, "sample_rate": rate, "samples": len(wave)})
                report["cases"].append({"case": row["case"], "source_path": row["source_path"],
                    "source_sha256": row["source_sha256"], "parent_control_archive": row["controls_archive"],
                    "status": "resynthesized_quality_unapproved", "facts": facts, "new_ap_archive": archive,
                    "audio": audio, "raw_rms_trace_10ms": {"source": rms_trace(source),
                    "default_threshold_0p85": rms_trace(baseline), "threshold_0": rms_trace(y)}})
                write()
            verify_bindings(bindings)
            report.update(status="complete_quality_unapproved", immutable_bindings_unchanged=True)
        report["resource_final"] = guard.final
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:1000])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic()-started
        write()
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    run(parser.parse_args())
