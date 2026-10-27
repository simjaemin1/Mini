#!/usr/bin/env python3
"""Bounded full/compact WORLD round-trip diagnostic, not new music or ML.

Reanalyse each ENTIRE native recording in its original corpus context, require
byte-exact saved conditioning, then synthesize the fixed first 960 frames.
No generator/checkpoint is loaded, and no pitch correction is introduced.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import threading
import time

import numpy as np
import export_corpus_audition as saved
import prepare_corpus
import build_level_conditioned_trial as level_trial
import level_metrics
import pilot_metrics

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard

RATE, HOP, FRAMES, SAMPLES, FFT = 24000, 120, 960, 115200, 2048
MAX_BYTES, MAX_CPU_SECONDS = 50_000_000, 300
BRANCHES = ("full_sp_full_ap", "compact_sp_full_ap", "full_sp_compact_ap", "compact_sp_compact_ap")


def array_hash(value):
    return hashlib.sha256(np.ascontiguousarray(value).tobytes()).hexdigest()


def analyse_full(wave, world=None, sptk=None):
    """Same full-source WORLD/SPTK calls and sub5ms tail trim as corpus v1."""
    if world is None:
        import pyworld as world
    if sptk is None:
        import pysptk as sptk
    wave = np.asarray(wave)
    if wave.ndim != 1 or wave.dtype != np.float64 or len(wave) < SAMPLES or not np.isfinite(wave).all():
        raise ValueError("finite_full_native_float64_waveform_required")
    original_samples, frames = len(wave), len(wave) // HOP
    analysed = np.ascontiguousarray(wave[:frames * HOP], dtype=np.float64)
    f0, times = world.harvest(analysed, RATE, f0_floor=70., f0_ceil=1800., frame_period=5.)
    sp = world.cheaptrick(analysed, f0, times, RATE, fft_size=FFT)
    ap = world.d4c(analysed, f0, times, RATE, threshold=.85, fft_size=FFT)
    mcep = sptk.sp2mc(sp, order=39, alpha=.466)
    bap = world.code_aperiodicity(ap, RATE)
    cf0 = prepare_corpus.continuous_f0(f0)
    if (min(len(f0), len(cf0), len(times), len(sp), len(ap), len(mcep), len(bap)) < frames
            or sp.shape[1:] != (1025,) or ap.shape[1:] != (1025,)
            or mcep.shape[1:] != (40,) or bap.shape[1:] != (3,)):
        raise ValueError("aligned_full_source_WORLD_dimensions_required")
    if any(not np.isfinite(value).all() for value in (f0, cf0, times, sp, ap, mcep, bap)):
        raise ValueError("nonfinite_full_source_WORLD_analysis")
    if (np.any(f0 < 0) or np.any(f0 > 1800) or np.any(sp < 0)
            or np.any(ap < 0) or np.any(ap > 1)):
        raise ValueError("invalid_raw_WORLD_F0_power_or_aperiodicity")
    controls = dict(raw_harvest_f0=np.ascontiguousarray(f0[:FRAMES], dtype=np.float64),
        analysed_cf0=cf0[:FRAMES].astype(np.float32),
        full_sp=np.ascontiguousarray(sp[:FRAMES], dtype=np.float64),
        full_ap=np.ascontiguousarray(ap[:FRAMES], dtype=np.float64),
        analysed_features=np.concatenate((mcep[:FRAMES], bap[:FRAMES]), axis=1).astype(np.float32),
        analysed_waveform_prefix=analysed[:SAMPLES].astype(np.float32))
    facts = dict(decoded_samples=original_samples, analysed_full_source_samples=len(analysed),
        analysed_full_source_frames=frames, trimmed_tail_samples=original_samples - len(analysed),
        endpoint_frames_trimmed=len(times) - frames, synthesis_frames=FRAMES,
        synthesis_samples=SAMPLES, synthesis_seconds=4.8,
        full_source_analysis=True, conditioning_prefix_compared_after_full_source_analysis=True,
        analysis_versions=dict(numpy=np.__version__, pyworld=getattr(world, "__version__", "unknown"),
            pysptk=getattr(sptk, "__version__", "unknown")))
    return controls, facts


def verify_conditioning(controls, corpus_f0, corpus_cf0, corpus_features, corpus_waveform, reference):
    """Bit equality includes signed zero; no tolerance, thresholding or repair."""
    expected = (("f0", corpus_f0, (FRAMES,)), ("cf0", corpus_cf0, (FRAMES,)),
                ("features", corpus_features, (FRAMES, 43)))
    for name, value, shape in expected:
        if (value.dtype != np.float32 or value.ndim != len(shape)
                or value.shape[0] < FRAMES or value.shape[1:] != shape[1:]
                or not np.isfinite(value[:FRAMES]).all()):
            raise ValueError("finite_saved_float32_conditioning_required:" + name)
    if (corpus_waveform.dtype != np.float32 or corpus_waveform.ndim != 1
            or len(corpus_waveform) < SAMPLES or reference.dtype != np.float32
            or reference.shape != (SAMPLES,)):
        raise ValueError("saved_float32_corpus_and_reference_required")
    pairs = ((controls["raw_harvest_f0"].astype(np.float32), corpus_f0[:FRAMES], "f0"),
             (controls["analysed_cf0"], corpus_cf0[:FRAMES], "cf0"),
             (controls["analysed_features"], corpus_features[:FRAMES], "features"),
             (controls["analysed_waveform_prefix"], corpus_waveform[:SAMPLES], "decoded_PCM"),
             (reference, corpus_waveform[:SAMPLES], "reference_PCM"))
    for actual, target, name in pairs:
        if not np.isfinite(actual).all() or not np.isfinite(target).all() or actual.tobytes() != target.tobytes():
            raise ValueError("full_context_byte_exact_corpus_mismatch:" + name)
    return {name: True for _, _, name in pairs}


def invert_compact(features, world=None, sptk=None):
    """SPTK mc2sp returns POWER; WORLD owns the BAP-to-AP codec semantics."""
    if world is None:
        import pyworld as world
    if sptk is None:
        import pysptk as sptk
    if features.dtype != np.float32 or features.shape != (FRAMES, 43) or not np.isfinite(features).all():
        raise ValueError("exact_saved960x43_float32_features_required")
    sp = np.ascontiguousarray(sptk.mc2sp(features[:, :40].astype(np.float64), alpha=.466, fftlen=FFT),
                              dtype=np.float64)
    ap = np.ascontiguousarray(world.decode_aperiodicity(features[:, 40:].astype(np.float64), RATE, FFT),
                              dtype=np.float64)
    if (sp.shape != (FRAMES, 1025) or ap.shape != (FRAMES, 1025)
            or not np.isfinite(sp).all() or not np.isfinite(ap).all()
            or np.any(sp < 0) or np.any(ap < 0) or np.any(ap > 1)):
        raise ValueError("finite_nonnegative_power_and_unit_interval_decoded_AP_required")
    return sp, ap


def synthesize_branches(f0, full_sp, full_ap, compact_sp, compact_ap, world=None):
    """Four branches use the same *raw Harvest* F0 array, never continuous F0."""
    if world is None:
        import pyworld as world
    if (f0.dtype != np.float64 or f0.shape != (FRAMES,) or not np.isfinite(f0).all()
            or np.any(f0 < 0) or np.any(f0 > 1800)):
        raise ValueError("exact960_finite_raw_Harvest_float64_frames_required")
    arrays = (f0, full_sp, full_ap, compact_sp, compact_ap)
    hashes_before = [array_hash(value) for value in arrays]
    outputs = {}
    for branch, sp, ap in ((BRANCHES[0], full_sp, full_ap), (BRANCHES[1], compact_sp, full_ap),
                           (BRANCHES[2], full_sp, compact_ap), (BRANCHES[3], compact_sp, compact_ap)):
        for value in (sp, ap):
            if value.dtype != np.float64 or value.shape != (FRAMES, 1025) or not np.isfinite(value).all():
                raise ValueError("exact_finite_float64_WORLD_spectrum_dimensions_required")
        if np.any(sp < 0) or np.any(ap < 0) or np.any(ap > 1):
            raise ValueError("nonnegative_power_and_unit_interval_AP_required")
        wave = np.asarray(world.synthesize(f0, sp, ap, RATE, frame_period=5.))
        if wave.shape != (SAMPLES,) or not np.isfinite(wave).all():
            raise ValueError("WORLD_must_return_exact115200_finite_samples_without_trim_or_pad")
        result = wave.astype(np.float32)
        if not np.isfinite(result).all():
            raise ValueError("WORLD_float32_conversion_overflow")
        outputs[branch] = result
        if [array_hash(value) for value in arrays] != hashes_before:
            raise ValueError("WORLD_synthesis_mutated_original_control_arrays")
    return outputs


def directory_bytes(output):
    return sum(path.stat().st_size for path in output.rglob("*") if path.is_file())


def write_npz(path, **arrays):
    buffer = io.BytesIO()
    np.savez_compressed(buffer, **arrays)
    payload = buffer.getvalue()
    if directory_bytes(path.parent) + len(payload) + 1_000_000 > MAX_BYTES:
        raise ValueError("50MB_roundtrip_output_cap_with1MB_report_reserve")
    with os.fdopen(os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
        handle.write(payload)
    return dict(file=path.name, sha256=saved.sha256(path), bytes=path.stat().st_size)


def _cpu_watch(started, stop):
    while not stop.wait(.2):
        elapsed = time.process_time() - started
        if elapsed > MAX_CPU_SECONDS:
            print(json.dumps(dict(status="resource_aborted", reason="process_CPU_time_cap",
                cpu_seconds=elapsed, cpu_cap_seconds=MAX_CPU_SECONDS)), file=sys.stderr, flush=True)
            os._exit(124)


def build(parent_report, output, timbre_summary=None):
    output = Path(output)
    if not output.is_absolute() or output.is_symlink() or output.exists():
        raise ValueError("fresh_absolute_private_output_required")
    root = saved.PRIVATE_ROOT.resolve(strict=True)
    if output.resolve() == root or not output.resolve().is_relative_to(root):
        raise ValueError("private_gpt_output_required")
    if "torch" in sys.modules:
        raise ValueError("fresh_noTorch_CPU_process_required")
    started, cpu_started, previous_umask = time.monotonic(), time.process_time(), os.umask(0o077)
    output.mkdir(mode=0o700)
    cpu_stop = threading.Event()
    cpu_thread = threading.Thread(target=_cpu_watch, args=(cpu_started, cpu_stop), daemon=True)
    cpu_thread.start()
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=300, max_rss_bytes=3 * GIB)) as guard:
            parent, selected, bindings, checkpoints = saved.validate_inputs(parent_report)
            for path, checksum in parent["input_bindings"].items():
                saved.bound(Path(path), checksum, bindings)
            if timbre_summary is None:
                from timbre_metrics import summary as timbre_summary
            import timbre_metrics
            for path in (Path(__file__).resolve(), Path(saved.__file__).resolve(), Path(prepare_corpus.__file__).resolve(),
                         Path(level_trial.__file__).resolve(), Path(level_metrics.__file__).resolve(),
                         Path(pilot_metrics.__file__).resolve(),
                         HERE / "prepare_real_features.py", Path(timbre_metrics.__file__).resolve(),
                         HERE.parent / "foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = saved.sha256(path)
            report = dict(schema="mini.sifigan-world-timbre-roundtrip.v1", status="started",
                parent_report_path=str(parent_report), input_bindings=bindings,
                carrier_checkpoints_hash_only_never_loaded=checkpoints, source_credit=saved.CREDIT,
                training=False, learned_model_loaded_or_run=False, public_weights_used=False,
                GPU_used=False, Torch_imported=False, new_score_or_music=False, heldout_is_blind=False,
                quality_approved=False, perceptually_approved=False, source_PCM_mixed_into_synthesis=False,
                EQ_AGC_gain_pitch_time_edit=False, WORLD_synthesis_performed=True,
                feature_normalizer_used=False, original_pitch_controls_edited=False,
                params=dict(sample_rate=RATE, hop_samples=HOP, f0_floor=70., f0_ceil=1800.,
                    frame_period_ms=5., fft_size=FFT, d4c_threshold=.85, mcep_order=39, mcep_alpha=.466,
                    bap_dimensions=3, compact_mcep_inversion="pysptk.mc2sp POWER, not amplitude; no extra squaring",
                    compact_bap_inversion="pyworld.decode_aperiodicity(saved_bap_float64,24000,2048)",
                    raw_Harvest_F0_identical_for_all_four_WORLD_branches=True,
                    synthesis_frames=FRAMES, synthesis_samples=SAMPLES, max_CPU_seconds=MAX_CPU_SECONDS,
                    max_wall_seconds=300, max_output_bytes=MAX_BYTES),
                limitations=["Diagnostic only: neither new music, learned synthesis training, nor a perceptual pass.",
                    "The same full source analysis is required before slicing the fixed first4.8s; saved conditioning must match byte-for-byte.",
                    "All WORLD branches use raw Harvest F0, including zeros/errors; no continuous-F0 substitution or threshold tuning.",
                    "WORLD does not preserve original waveform phase or its exact noise waveform. Pinned WORLD reseeds its local RNG for each synthesis call.",
                    "WORLD raw float64 Harvest excitation is shared among WORLD branches, not claimed identical to the neural model's continuous-f0 float32 excitation.",
                    "Full WORLD is not an upper bound on learnability; neural-vs-WORLD is not a controlled causal architecture comparison.",
                    "Compact/full spectrum and AP factor changes remain diagnostics, not proof of their perceptual causal contribution.",
                    "Raw metrics include no reference-level conditioning or other waveform postprocessing."], cases=[])
            for source in selected:
                case = source["case"]
                corpus_path = Path(source["corpus_npz_path"])
                manifest_path = saved.regular(corpus_path.parent / "manifest.json", 5_000_000)
                saved.bound(manifest_path, bindings.get(str(manifest_path)), bindings)
                rows = [row for row in json.loads(manifest_path.read_text())["files"] if row["case"] == case]
                if len(rows) != 1 or rows[0]["source_path"] != source["original_path"]:
                    raise ValueError("unique_same_native_source_manifest_row_required")
                decoded = prepare_corpus.decode(rows[0])
                controls, facts = analyse_full(decoded)
                del decoded
                with np.load(corpus_path, allow_pickle=False) as archive:
                    corpus_f0, corpus_cf0, features, corpus_wave = (archive[key] for key in ("f0", "cf0", "features", "waveform"))
                matches = verify_conditioning(controls, corpus_f0, corpus_cf0, features, corpus_wave, source["reference"])
                saved_features = features[:FRAMES].copy()
                compact_sp, compact_ap = invert_compact(saved_features)
                waves = synthesize_branches(controls["raw_harvest_f0"], controls["full_sp"], controls["full_ap"],
                                            compact_sp, compact_ap)
                control_file = write_npz(output / (case + "_full_analysis_and_saved_compact_controls.npz"),
                    raw_harvest_f0=controls["raw_harvest_f0"], full_sp=controls["full_sp"], full_ap=controls["full_ap"],
                    saved_mcep=saved_features[:, :40], saved_bap=saved_features[:, 40:], saved_f0=corpus_f0[:FRAMES],
                    saved_cf0=corpus_cf0[:FRAMES])
                waves = dict(original_reference=source["reference"], saved_SiFiGAN_global1000=source["generated"], **waves)
                raw_file = write_npz(output / (case + "_raw_roundtrip_waveforms.npz"), **waves)
                if any(not np.isfinite(wave).all() or wave.dtype != np.float32 or wave.shape != (SAMPLES,)
                       for wave in waves.values()):
                    raise ValueError("all_raw_waveforms_must_remain_exact_shape_finite_float32")
                reference_diag = prepare_corpus.diagnostics(source["reference"])
                report["cases"].append(dict(case=case, original_path=source["original_path"],
                    original_sha256=source["original_sha256"], corpus_npz_path=str(corpus_path),
                    corpus_npz_sha256=source["corpus_npz_sha256"], saved_carrier_path=source["reconstruction_path"],
                    saved_carrier_sha256=source["reconstruction_sha256"], full_analysis=facts,
                    byte_exact_corpus_checks=matches, controls=control_file, raw_waveforms=raw_file,
                    raw_Harvest_F0_sha256=array_hash(controls["raw_harvest_f0"]),
                    compact_sp_POWER_sha256=array_hash(compact_sp), compact_ap_sha256=array_hash(compact_ap),
                    compression_parameter_diagnostics=timbre_metrics.parameter_summary(controls["full_sp"],
                        compact_sp, controls["full_ap"], compact_ap,
                        level_metrics.frame_rms_db(source["reference"]) > -60.),
                    waveform_hashes={name: array_hash(wave) for name, wave in waves.items()},
                    raw_timbre_metrics={name: timbre_summary(wave, source["reference"]) for name, wave in waves.items()},
                    raw_pitch_level_diagnostics={name: level_trial.diagnostics(wave, source["reference"], reference_diag)
                        for name, wave in waves.items()}))
                print(json.dumps(dict(stage="case_complete", case=case,
                    raw_f0_cf0_features_and_PCM_byte_exact=True, four_WORLD_branches=4)), flush=True)
            if "torch" in sys.modules:
                raise ValueError("Torch_imported_during_CPU_only_diagnostic")
            if any(saved.sha256(path) != checksum for path, checksum in bindings.items()):
                raise ValueError("parent_original_corpus_model_or_code_changed")
            cpu_seconds = time.process_time() - cpu_started
            if cpu_seconds > MAX_CPU_SECONDS:
                raise ValueError("process_CPU_time_cap")
            report.update(status="roundtrip_diagnostic_complete_not_perceptually_approved", inputs_unchanged=True,
                elapsed_seconds=time.monotonic() - started, CPU_seconds=cpu_seconds, resources=guard.snapshot())
            payload = json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False).encode() + b"\n"
            if directory_bytes(output) + len(payload) > MAX_BYTES:
                raise ValueError("50MB_roundtrip_output_cap")
            with os.fdopen(os.open(output / "report.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "wb") as handle:
                handle.write(payload)
    finally:
        cpu_stop.set()
        cpu_thread.join(timeout=1)
        os.umask(previous_umask)
    return report


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--parent-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = build(args.parent_report, args.output)
    print(json.dumps(dict(status=result["status"], cases=len(result["cases"]),
        CPU_seconds=result["CPU_seconds"], bytes=directory_bytes(args.output))))
