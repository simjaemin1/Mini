#!/usr/bin/env python3
"""Fit-only CPU Ridge volume head plus explicit learned gain postprocessing.

This is NOT raw-vocoder training or new-score synthesis. Runtime controls are
predicted from original acoustic features, not copied from reference RMS.
Only the complete global1000 saved carrier is used. No Torch or model loading.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import time

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
from ace_limits import GIB, ResourceCaps, ResourceGuard
import level_metrics
import pilot_metrics
import prepare_corpus

FIT = {"sus04", "vib39", "sanjo2", "daru1", "nina29", "nira23", "staccato60", "chung34"}
HELDOUT = {"deepvib48", "arirang001", "arirang002", "arirang003", "arirang004"}
EVALUATION = ("deepvib48", "arirang001")
RMS_STRATA = np.array([-80., -60., -40., -20.])
TARGET_FLOOR, ALPHA, GAIN_LIMIT, MAX_BYTES = -100., 1., 60., 20_000_000


def sha(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def validate_xy(features, target):
    x, y = np.asarray(features, np.float64), np.asarray(target, np.float64)
    if (x.ndim != 2 or x.shape[1] != 43 or y.shape != (len(x),) or not len(x)
            or not np.isfinite(x).all() or not np.isfinite(y).all()):
        raise ValueError("finite_nonempty_Nx43_features_and_N_target_required")
    return x, y


def balanced_weights(target):
    """Equal total mass for each observed predeclared RMS stratum."""
    y = np.asarray(target, np.float64)
    if y.ndim != 1 or not len(y) or not np.isfinite(y).all():
        raise ValueError("finite_nonempty_target_vector_required")
    bins = np.searchsorted(RMS_STRATA, y, side="right")
    counts = np.bincount(bins, minlength=5)
    present = int(np.count_nonzero(counts))
    return len(y) / (present * counts[bins]), counts


def fit(features, target):
    """Fixed linear43 Ridge: no model/alpha selection on heldout data."""
    x, original_y = validate_xy(features, target)
    y = np.maximum(original_y, TARGET_FLOOR)
    weights, counts = balanced_weights(y)
    mean = np.sum(x * weights[:, None], axis=0) / weights.sum()
    variance = np.sum((x - mean) ** 2 * weights[:, None], axis=0) / weights.sum()
    scale = np.sqrt(np.maximum(variance, 0))
    scale[scale < 1e-12] = 1.
    z = (x - mean) / scale
    intercept = float(np.dot(weights, y) / weights.sum())
    gram = z.T @ (z * weights[:, None]) + ALPHA * np.eye(43)
    coefficient = np.linalg.solve(gram, z.T @ (weights * (y - intercept)))
    prediction = z @ coefficient + intercept
    if not np.isfinite(coefficient).all() or not np.isfinite(prediction).all():
        raise ValueError("nonfinite_head_fit")
    return dict(mean=mean, scale=scale, coefficient=coefficient,
                intercept=np.array(intercept)), dict(
        frames=len(y), target_floor_dbfs=TARGET_FLOOR,
        clipped_fit_target_frames=int((original_y < TARGET_FLOOR).sum()),
        stratum_boundaries_dbfs=RMS_STRATA.tolist(), stratum_counts=counts.tolist(),
        weighted_training_RMSE_against_floored_target_db=float(np.sqrt(np.dot(weights, (prediction-y)**2)/weights.sum())),
        unweighted_training_RMSE_against_floored_target_db=float(np.sqrt(np.mean((prediction-y)**2))),
        regularized_gram_condition_number=float(np.linalg.cond(gram)),
        linear_dimensions=43, ridge_alpha=ALPHA, intercept_penalized=False,
        normalizer="fit-only RMS-stratum-weighted population mean/std; nearconstant scale->1",
        model_selection_or_cross_validation=False, heldout_used_for_fit_or_statistics=False)


def predict(model, features):
    x = np.asarray(features, np.float64)
    if x.ndim != 2 or x.shape[1] != 43 or not np.isfinite(x).all():
        raise ValueError("finite_Nx43_runtime_features_required")
    result = ((x - model["mean"]) / model["scale"]) @ model["coefficient"] + model["intercept"]
    if not np.isfinite(result).all():
        raise ValueError("nonfinite_level_prediction")
    return result


def apply_head(model, features, carrier):
    """No reference audio/RMS argument exists in the runtime control path."""
    wave = np.asarray(carrier, np.float64)
    if wave.ndim != 1 or len(wave) % 120 or not len(wave) or not np.isfinite(wave).all():
        raise ValueError("finite_24k_carrier_with_whole5ms_frames_required")
    desired_level = predict(model, features)
    if desired_level.shape != (len(wave)//120,):
        raise ValueError("same_timestamps_features_and_carrier_required")
    carrier_level = level_metrics.frame_rms_db(wave)
    raw_gain = desired_level - carrier_level
    bounded_gain = np.clip(raw_gain, -GAIN_LIMIT, GAIN_LIMIT)
    positions = np.arange(-5, 6, dtype=np.float64)
    kernel = np.exp(-.5 * (positions / 2.) ** 2)
    kernel /= kernel.sum()
    smoothed = np.convolve(np.pad(bounded_gain, (5, 5), mode="edge"), kernel, mode="valid")
    smoothed = np.clip(smoothed, -GAIN_LIMIT, GAIN_LIMIT)
    sample_gain_db = np.interp(np.arange(len(wave))/120., np.arange(len(smoothed)), smoothed)
    output = (wave * 10 ** (sample_gain_db/20)).astype(np.float32)
    if not np.isfinite(output).all():
        raise ValueError("nonfinite_continuous_gain_output")
    controls = dict(predicted_level_dbfs=desired_level, carrier_measured_level_dbfs=carrier_level,
                    desired_gain_db=raw_gain, bounded_gain_db=bounded_gain, smoothed_gain_db=smoothed)
    return output, controls, dict(
        limited_gain_frames=int((np.abs(raw_gain) > GAIN_LIMIT).sum()),
        raw_gain_min_max_db=[float(raw_gain.min()), float(raw_gain.max())],
        smoothed_gain_min_max_db=[float(smoothed.min()), float(smoothed.max())],
        output_peak=float(np.abs(output).max()), saturated_sample_count=int((np.abs(output)>=1).sum()),
        smoothing="centered11tap Gaussian sigma2frames;5ms grid;50ms endpoint span;edgepad loggain",
        sample_interpolation="linear frameindex*120; final half-open5ms interval holds last control",
        causal_latency_samples=0, offline_noncausal_context_ms=25.,
        learned_gain_control=True, AGC=True, output_postprocessing=True,
        reference_RMS_or_reference_waveform_used_for_runtime_gain=False,
        hard_quiet_threshold_or_mute=False, output_clipping_or_normalization=False,
        F0_or_EQ_or_time_edit=False)


def write_npz(path, **arrays):
    with path.open("xb") as handle:
        np.savez_compressed(handle, **arrays)
    path.chmod(0o600)
    return sha(path)


def diagnostics(wave, reference):
    rd, gd = prepare_corpus.diagnostics(reference), prepare_corpus.diagnostics(wave)
    return dict(pitch=pilot_metrics.summary(wave, reference, rd["yin_hz"], rd["periodicity"],
        gd["yin_hz"], gd["periodicity"], rd["rms_db"], gd["rms_db"]),
        level=level_metrics.summary(wave, reference, rd["rms_db"], gd["rms_db"]))


def run(corpus_manifest, carrier_report, output):
    if "torch" in sys.modules:
        raise RuntimeError("CPU_numpy_only_no_Torch_allowed")
    output = Path(output).resolve()
    private = (Path.home()/"Mini/_bgm/gpt").resolve(strict=True)
    if output.exists() or not output.is_relative_to(private):
        raise ValueError("fresh_output_inside_private_gpt_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-learned-linear-volume-head.v1", status="started",
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
        CPU_numpy_only=True, Torch_imported=False, max_seconds=60, max_output_bytes=MAX_BYTES,
        learned_continuous_gain_control=True, AGC=True, output_postprocessing=True,
        raw_vocoder_training=False, new_score_or_music=False, perceptually_approved=False,
        runtime_requires_original_acoustic_features=True,
        reference_envelope_copied=False, reference_RMS_used_for_runtime_gain=False,
        hard_quiet_threshold_or_mute=False, original_vocoder_normalizer_changed=False,
        heldout_used_for_head_fit_statistics_or_hyperparameter_selection=False,
        evaluation_role="historically_seen_development_clips_not_blind", cases=[])
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=60, max_rss_bytes=2*GIB)) as guard:
            manifest, carrier_path = Path(corpus_manifest).resolve(strict=True), Path(carrier_report).resolve(strict=True)
            corpus, parent = json.loads(manifest.read_text()), json.loads(carrier_path.read_text())
            if (corpus.get("schema") != "mini.sifigan-corpus.v1" or corpus.get("status") != "complete"
                    or corpus.get("sample_rate") != 24000 or corpus.get("hop_size") != 120):
                raise ValueError("completed_original24k120hop_corpus_required")
            files = {r["case"]:r for r in corpus["files"]}
            if (len(files)!=len(corpus["files"]) or {k for k,r in files.items() if r["split"]=="fit"} != FIT
                    or {k for k,r in files.items() if r["split"]=="heldout"} != HELDOUT):
                raise ValueError("exact8fit5protected_heldout_sources_required")
            if (parent.get("schema") != "mini.sifigan-corpus-resume.v1"
                    or parent.get("status") != "bounded_resume_complete_not_perceptually_approved"
                    or parent.get("completed_steps") != 1000):
                raise ValueError("only_complete1000_carrier_not_failed1500_allowed")
            bindings = {str(manifest):sha(manifest), str(carrier_path):sha(carrier_path)}
            for row in files.values():
                for path, expected in ((Path(row["source_path"]),row["source_sha256"]),
                        (manifest.parent/row["npz_file"],row["npz_sha256"])):
                    if sha(path)!=expected:
                        raise ValueError("original_or_corpus_changed")
                    bindings[str(path)] = expected
            for path in (Path(__file__).resolve(), Path(level_metrics.__file__), Path(pilot_metrics.__file__),
                         Path(prepare_corpus.__file__), HERE/"prepare_real_features.py",
                         HERE.parent/"foundation-model-trial/ace_limits.py"):
                bindings[str(path)] = sha(path)
            report["input_bindings"] = bindings
            fit_x, fit_y, slices = [], [], {}
            offset = 0
            for case in sorted(FIT):
                row = files[case]
                with np.load(manifest.parent/row["npz_file"],allow_pickle=False) as archive:
                    x,y = validate_xy(archive["features"],archive["rms_db"])
                    fit_x.append(x.copy());fit_y.append(y.copy())
                slices[case]=(offset,offset+len(y));offset+=len(y)
            x,y = np.concatenate(fit_x),np.concatenate(fit_y)
            del fit_x,fit_y
            model, training = fit(x,y)
            training["fit_cases"] = sorted(FIT)
            training["per_case_frames"] = {c:b-a for c,(a,b) in slices.items()}
            prediction = predict(model,x)
            training["per_case_RMSE_against_declared_floored_target_db"] = {
                c:float(np.sqrt(np.mean((prediction[a:b]-np.maximum(y[a:b],TARGET_FLOOR))**2)))
                for c,(a,b) in slices.items()}
            report["training"] = training
            model_path = output/"linear43_volume_head.npz"
            report["model_file"] = model_path.name
            report["model_sha256"] = write_npz(model_path,**model)
            del x,y,prediction
            for case in EVALUATION:
                row=files[case]
                old=next(r for r in parent["reconstructions"] if r["case"]==case)
                carrier=carrier_path.parent/old["file"]
                if sha(carrier)!=old["sha256"]:
                    raise ValueError("complete1000_carrier_NPZ_changed")
                bindings[str(carrier)] = old["sha256"]
                with np.load(carrier,allow_pickle=False) as archive:
                    before,reference=archive["generated"].copy(),archive["reference"].copy()
                with np.load(manifest.parent/row["npz_file"],allow_pickle=False) as archive:
                    features=archive["features"][:960].copy()
                    if reference.tobytes()!=archive["waveform"][:115200].tobytes():
                        raise ValueError("carrier_reference_not_original_corpus_first4p8s")
                if before.shape!=(115200,) or before.dtype!=np.float32:
                    raise ValueError("complete_float32_4p8s_carrier_required")
                unchanged=before.tobytes()
                after,controls,facts=apply_head(model,features,before)
                if before.tobytes()!=unchanged:
                    raise ValueError("carrier_mutated")
                entry=dict(case=case,carrier_path=str(carrier),carrier_sha256=old["sha256"],facts=facts)
                for label,wave in (("before",before),("after",after)):
                    path=output/f"{label}_{case}_reconstruction.npz"
                    entry[label]=dict(file=path.name,sha256=write_npz(path,generated=wave,reference=reference),
                                      diagnostics=diagnostics(wave,reference))
                path=output/f"{case}_predicted_gain_controls.npz"
                entry["controls"]=dict(file=path.name,sha256=write_npz(path,**controls))
                report["cases"].append(entry)
            if any(sha(p)!=checksum for p,checksum in bindings.items()):
                raise ValueError("original_data_carrier_or_code_changed")
            if sum(p.stat().st_size for p in output.iterdir())>MAX_BYTES-200000:
                raise ValueError("20MB_new_output_ceiling")
            report.update(status="learned_gain_head_evaluated_not_perceptually_approved",
                          originals_carriers_models_unchanged=True,final_resources=guard.snapshot())
    except Exception as error:
        report.update(status="failed",error_type=type(error).__name__,error=str(error))
        raise
    finally:
        report["wall_seconds"]=time.monotonic()-started
        with (output/"report.json").open("x",encoding="utf-8") as handle:
            json.dump(report,handle,indent=2,ensure_ascii=False,allow_nan=False)
        (output/"report.json").chmod(0o600)
    return report


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--corpus-manifest",type=Path,required=True)
    parser.add_argument("--carrier-report",type=Path,required=True)
    parser.add_argument("--output",type=Path,required=True)
    args=parser.parse_args()
    os.umask(0o077)
    result=run(args.corpus_manifest,args.carrier_report,args.output)
    print(json.dumps({"status":result["status"],"wall_seconds":result["wall_seconds"]}))
