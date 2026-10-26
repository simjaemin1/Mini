#!/usr/bin/env python3
"""Fit-only physical-power Ridge volume head: explicit learned AGC, not a vocoder.

Two predeclared representations are selected by recording-disjoint FIT-only CV.
Original acoustic features are required at runtime. Reference RMS is never an
argument to the continuous gain controller. No Torch, GPU, or model inference.
"""
import argparse
import json
import os
from pathlib import Path
import sys
import time

import numpy as np

HERE = Path(__file__).resolve().parent
import fit_level_head as previous
import level_metrics
from ace_limits import GIB, ResourceCaps, ResourceGuard

FIT, HELDOUT, EVALUATION = previous.FIT, previous.HELDOUT, previous.EVALUATION
TARGET_FLOOR, ALPHA, GAIN_LIMIT = -100., 1., 60.
MAX_BYTES, FRAME_STRIDE, FFTLEN, MCEP_ALPHA = 20_000_000, 4, 2048, .466
CANDIDATES = {"power1": (0,), "physical5": (0, 1, 2, 3, 4)}
DB_PER_NAT = 10. / np.log(10.)


def make_basis(mc2sp):
    """mc2sp is POWER; log(mc2sp(mc)) is linear in the 40 mel cepstra."""
    basis = np.stack([np.log(mc2sp(row, MCEP_ALPHA, FFTLEN)) for row in np.eye(40)])
    if basis.shape != (40, 1025) or not np.isfinite(basis).all():
        raise ValueError("finite40x1025_log_POWER_basis_required")
    probe = np.linspace(-.03, .03, 40)
    error = float(np.max(np.abs(probe @ basis - np.log(mc2sp(probe, MCEP_ALPHA, FFTLEN)))))
    if error > 1e-9:
        raise ValueError("basis_does_not_match_direct_mc2sp_log_POWER")
    return basis, error


def logmeanexp(values, axis):
    high = np.max(values, axis=axis, keepdims=True)
    return np.squeeze(high, axis=axis) + np.log(np.mean(np.exp(values - high), axis=axis))


def physical_features(features, basis):
    """Power averaged over centered 13x5ms frames BEFORE taking its logarithm."""
    x = np.asarray(features, np.float64)
    basis = np.asarray(basis, np.float64)
    if (x.ndim != 2 or x.shape[1] != 43 or not len(x) or basis.shape != (40, 1025)
            or not np.isfinite(x).all() or not np.isfinite(basis).all()):
        raise ValueError("finite_nonempty_Nx43_features_and40x1025_basis_required")
    power_log, flatness_db = np.empty(len(x)), np.empty(len(x))
    for start in range(0, len(x), 512):
        stop = min(start + 512, len(x))
        logsp = x[start:stop, :40] @ basis
        integrated = logmeanexp(logsp, axis=1)
        power_log[start:stop] = integrated
        flatness_db[start:stop] = DB_PER_NAT * (logsp.mean(axis=1) - integrated)
    windows = np.lib.stride_tricks.sliding_window_view(np.pad(power_log, (6, 6), mode="edge"), 13)
    smooth_power_log = logmeanexp(windows, axis=1)
    result = np.column_stack((DB_PER_NAT * smooth_power_log, flatness_db, x[:, 40:43]))
    if not np.isfinite(result).all():
        raise ValueError("nonfinite_physical_power_features")
    return result


def fit_ridge(features, target):
    x, original = np.asarray(features, np.float64), np.asarray(target, np.float64)
    if (x.ndim != 2 or x.shape[1] not in (1, 5) or original.shape != (len(x),) or not len(x)
            or not np.isfinite(x).all() or not np.isfinite(original).all()):
        raise ValueError("finite_nonempty_one_or_five_dimensional_fit_required")
    y = np.maximum(original, TARGET_FLOOR)
    weights, counts = previous.balanced_weights(y)
    mean = np.average(x, axis=0, weights=weights)
    scale = np.sqrt(np.average((x - mean) ** 2, axis=0, weights=weights))
    scale[scale < 1e-12] = 1.
    z = (x - mean) / scale
    intercept = float(np.average(y, weights=weights))
    gram = z.T @ (z * weights[:, None]) + ALPHA * np.eye(x.shape[1])
    coefficient = np.linalg.solve(gram, z.T @ (weights * (y - intercept)))
    model = dict(mean=mean, scale=scale, coefficient=coefficient, intercept=np.array(intercept))
    predicted = predict(model, x)
    return model, dict(frames=len(y), target_floor_dbfs=TARGET_FLOOR,
        clipped_fit_target_frames=int((original < TARGET_FLOOR).sum()),
        stratum_boundaries_dbfs=previous.RMS_STRATA.tolist(), stratum_counts=counts.tolist(),
        weighted_training_RMSE_against_floored_target_db=float(np.sqrt(np.average((predicted-y)**2,weights=weights))),
        unweighted_training_RMSE_against_floored_target_db=float(np.sqrt(np.mean((predicted-y)**2))),
        linear_dimensions=x.shape[1], ridge_alpha=ALPHA, intercept_penalized=False,
        regularized_gram_condition_number=float(np.linalg.cond(gram)),
        normalizer="training-recordings-only RMS-stratum-weighted population mean/std; nearconstant scale->1")


def predict(model, features):
    x = np.asarray(features, np.float64)
    if (x.ndim != 2 or x.shape[1] != len(model["mean"]) or not np.isfinite(x).all()):
        raise ValueError("finite_runtime_features_matching_head_dimensions_required")
    result = ((x - model["mean"]) / model["scale"]) @ model["coefficient"] + model["intercept"]
    if not np.isfinite(result).all():
        raise ValueError("nonfinite_head_prediction")
    return result


def select_fit_only(recordings):
    """Each validation recording is excluded from that fold's fit and normalizer."""
    if set(recordings) != FIT:
        raise ValueError("exact_eight_fit_recordings_required_no_heldout")
    results = {}
    for candidate, columns in CANDIDATES.items():
        folds = []
        for validation_case in sorted(FIT):
            training_cases = sorted(FIT - {validation_case})
            x = np.concatenate([recordings[c][0][:, columns] for c in training_cases])
            y = np.concatenate([recordings[c][1] for c in training_cases])
            model, fit_facts = fit_ridge(x, y)
            vx, vy = recordings[validation_case]
            target = np.maximum(vy, TARGET_FLOOR)
            errors = predict(model, vx[:, columns]) - target
            weights, counts = previous.balanced_weights(target)
            folds.append(dict(validation_case=validation_case, training_cases=training_cases,
                validation_frames=len(target), training_frames=fit_facts["frames"],
                training_only_normalizer=True, validation_used_for_fit_or_normalizer=False,
                validation_stratum_counts=counts.tolist(),
                balanced_MSE_against_floored_target_db2=float(np.average(errors**2, weights=weights)),
                unweighted_RMSE_against_floored_target_db=float(np.sqrt(np.mean(errors**2)))))
        score = float(np.sqrt(np.mean([f["balanced_MSE_against_floored_target_db2"] for f in folds])))
        results[candidate] = dict(columns=list(columns), recording_balanced_CV_RMSE_db=score, folds=folds)
    selected = min(CANDIDATES, key=lambda c: results[c]["recording_balanced_CV_RMSE_db"])
    columns = CANDIDATES[selected]
    x = np.concatenate([recordings[c][0][:, columns] for c in sorted(FIT)])
    y = np.concatenate([recordings[c][1] for c in sorted(FIT)])
    model, facts = fit_ridge(x, y)
    facts.update(selected_candidate=selected, candidate_columns=list(columns), candidates=results,
        selection="minimum sqrt(mean of eight per-recording RMS-stratum-balanced validation MSE); tie->power1",
        feature_sampling="every4frames at native indices0,4,...;20ms; physical extraction uses all FIT frames",
        fit_cases=sorted(FIT), model_selection_or_cross_validation=True,
        heldout_used_for_fit_or_statistics=False, heldout_used_for_model_selection=False,
        per_case_sampled_frames={c:len(recordings[c][1]) for c in sorted(FIT)})
    return model, facts


def apply_gain(predicted_level, carrier):
    """Only predicted levels and the generated carrier enter this runtime path."""
    wave = np.asarray(carrier, np.float64)
    desired = np.asarray(predicted_level, np.float64)
    if (wave.ndim != 1 or not len(wave) or len(wave) % 120 or desired.shape != (len(wave)//120,)
            or not np.isfinite(wave).all() or not np.isfinite(desired).all()):
        raise ValueError("finite_same_timestamps_5ms_predictions_and24k_carrier_required")
    measured = level_metrics.frame_rms_db(wave)
    raw = desired - measured
    bounded = np.clip(raw, -GAIN_LIMIT, GAIN_LIMIT)
    positions = np.arange(-5, 6, dtype=np.float64)
    kernel = np.exp(-.5 * (positions / 2.) ** 2); kernel /= kernel.sum()
    smooth = np.convolve(np.pad(bounded, (5, 5), mode="edge"), kernel, mode="valid")
    smooth = np.clip(smooth, -GAIN_LIMIT, GAIN_LIMIT)
    per_sample = np.interp(np.arange(len(wave))/120., np.arange(len(smooth)), smooth)
    output = (wave * 10 ** (per_sample/20.)).astype(np.float32)
    if not np.isfinite(output).all():
        raise ValueError("nonfinite_continuous_gain_output")
    controls = dict(predicted_level_dbfs=desired, carrier_measured_level_dbfs=measured,
        desired_gain_db=raw, bounded_gain_db=bounded, smoothed_gain_db=smooth)
    facts = dict(limited_gain_frames=int((np.abs(raw)>GAIN_LIMIT).sum()),
        raw_gain_min_max_db=[float(raw.min()),float(raw.max())],
        smoothed_gain_min_max_db=[float(smooth.min()),float(smooth.max())],
        output_peak=float(np.abs(output).max()), saturated_sample_count=int((np.abs(output)>=1).sum()),
        smoothing="centered11tap Gaussian sigma2frames;5ms grid;50ms endpoint span;edgepad loggain",
        sample_interpolation="linear frameindex*120;final half-open5ms interval holds last control",
        waveform_time_shift_samples=0, offline_noncausal=True,
        gain_smoothing_future_context_ms=25., carrier_RMS_future_context_ms=32.,
        physical_power_smoothing_future_context_ms=30.,
        original_acoustic_feature_future_context_not_included=True,
        learned_gain_control=True, AGC=True, output_postprocessing=True,
        reference_RMS_or_reference_waveform_used_for_runtime_gain=False,
        hard_quiet_threshold_or_mute=False, output_clipping_or_normalization=False,
        F0_or_EQ_or_time_edit=False)
    return output, controls, facts


def run(corpus_manifest, carrier_report, output):
    if "torch" in sys.modules:
        raise RuntimeError("CPU_numpy_only_no_Torch_allowed")
    output = Path(output).resolve()
    private = (Path.home()/"Mini/_bgm/gpt").resolve(strict=True)
    if output.exists() or not output.is_relative_to(private):
        raise ValueError("fresh_output_inside_private_gpt_required")
    output.mkdir(mode=0o700)
    started = time.monotonic()
    report = dict(schema="mini.sifigan-physical-volume-head.v1", status="started",
        source_credit="국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
        CPU_numpy_only=True, Torch_imported=False, max_seconds=60, max_output_bytes=MAX_BYTES,
        learned_continuous_gain_control=True, AGC=True, output_postprocessing=True,
        raw_vocoder_training=False, new_score_or_music=False, perceptually_approved=False,
        quality_approved=False, runtime_requires_original_acoustic_features=True,
        reference_envelope_copied=False, reference_RMS_used_for_runtime_gain=False,
        hard_quiet_threshold_or_mute=False, original_vocoder_normalizer_changed=False,
        heldout_used_for_head_fit_statistics_or_hyperparameter_selection=False,
        evaluation_role="historically_seen_development_clips_not_blind", cases=[])
    try:
        with ResourceGuard(output, ResourceCaps(max_seconds=60,max_rss_bytes=2*GIB)) as guard:
            import pysptk
            manifest, carrier_path = Path(corpus_manifest).resolve(strict=True), Path(carrier_report).resolve(strict=True)
            corpus, parent = json.loads(manifest.read_text()), json.loads(carrier_path.read_text())
            if (corpus.get("schema")!="mini.sifigan-corpus.v1" or corpus.get("status")!="complete"
                    or corpus.get("sample_rate")!=24000 or corpus.get("hop_size")!=120):
                raise ValueError("completed_original24k120hop_corpus_required")
            feature_spec=corpus["feature_spec"]
            if (feature_spec.get("mcep_order")!=39 or feature_spec.get("mcep_alpha")!=MCEP_ALPHA
                    or feature_spec.get("fft_size")!=FFTLEN):
                raise ValueError("original_mcep39_alpha0466_FFT2048_required")
            files={r["case"]:r for r in corpus["files"]}
            if (len(files)!=len(corpus["files"]) or {c for c,r in files.items() if r["split"]=="fit"}!=FIT
                    or {c for c,r in files.items() if r["split"]=="heldout"}!=HELDOUT):
                raise ValueError("exact8fit5protected_heldout_sources_required")
            if (parent.get("schema")!="mini.sifigan-corpus-resume.v1"
                    or parent.get("status")!="bounded_resume_complete_not_perceptually_approved"
                    or parent.get("completed_steps")!=1000):
                raise ValueError("only_complete1000_carrier_not_failed1500_allowed")
            bindings={str(manifest):previous.sha(manifest),str(carrier_path):previous.sha(carrier_path)}
            for row in files.values():
                for path,expected in ((Path(row["source_path"]),row["source_sha256"]),
                        (manifest.parent/row["npz_file"],row["npz_sha256"])):
                    if previous.sha(path)!=expected:
                        raise ValueError("original_or_corpus_changed")
                    bindings[str(path)]=expected
            for path in (Path(__file__).resolve(), Path(previous.__file__), Path(level_metrics.__file__),
                    Path(previous.pilot_metrics.__file__),Path(previous.prepare_corpus.__file__),
                    HERE/"prepare_real_features.py",HERE.parent/"foundation-model-trial/ace_limits.py",
                    Path(pysptk.__file__),Path(pysptk.conversion.__file__)):
                bindings[str(path)]=previous.sha(path)
            report["input_bindings"]=bindings
            basis,error=make_basis(pysptk.mc2sp)
            report["physical_transform"]=dict(fftlen=FFTLEN,mcep_alpha=MCEP_ALPHA,basis_shape=list(basis.shape),
                mc2sp_returns="POWER",basis_direct_log_POWER_max_abs_error=error,
                integrated_power="stable logmeanexp over all1025 one-sided bins;10/log(10) conversion",
                power_smoothing="13frames65ms centered arithmetic POWER mean before log;edgepad;+-30ms",
                flatness="unsmoothed10/log(10)*(mean(logPOWER)-logmeanexp(logPOWER))",
                dimensions=["power_db","flatness_db","BAP0","BAP1","BAP2"],
                predetermined_candidates={k:list(v) for k,v in CANDIDATES.items()},
                numpy_version=np.__version__,pysptk_version=pysptk.__version__)
            recordings, full_counts, full_clip_count={}, {},0
            for case in sorted(FIT):
                with np.load(manifest.parent/files[case]["npz_file"],allow_pickle=False) as archive:
                    raw,y=previous.validate_xy(archive["features"],archive["rms_db"])
                    features=physical_features(raw,basis)
                    recordings[case]=(features[::FRAME_STRIDE].copy(),y[::FRAME_STRIDE].copy())
                    full_counts[case]=len(y); full_clip_count+=int((y<TARGET_FLOOR).sum())
            model,training=select_fit_only(recordings)
            training.update(per_case_full_native_frames=full_counts,
                full_native_frames_total=sum(full_counts.values()),
                full_native_target_frames_below_floor=full_clip_count)
            columns=CANDIDATES[training["selected_candidate"]]
            training["per_case_RMSE_against_declared_floored_target_db"]={
                c:float(np.sqrt(np.mean((predict(model,x[:,columns])-np.maximum(y,TARGET_FLOOR))**2)))
                for c,(x,y) in recordings.items()}
            report["training"]=training
            model_path=output/"physical_volume_head.npz"
            report["model_file"],report["model_sha256"]=model_path.name,previous.write_npz(model_path,
                **model,basis=basis,candidate_columns=np.array(columns,np.int64))
            del recordings
            # Heldout acoustic features are first opened here, after model selection/refit.
            for case in EVALUATION:
                row=files[case]
                old=next(r for r in parent["reconstructions"] if r["case"]==case)
                carrier=carrier_path.parent/old["file"]
                if previous.sha(carrier)!=old["sha256"]:
                    raise ValueError("complete1000_carrier_NPZ_changed")
                bindings[str(carrier)]=old["sha256"]
                with np.load(carrier,allow_pickle=False) as archive:
                    before,reference=archive["generated"].copy(),archive["reference"].copy()
                with np.load(manifest.parent/row["npz_file"],allow_pickle=False) as archive:
                    features=archive["features"][:960].copy()
                    if reference.tobytes()!=archive["waveform"][:115200].tobytes():
                        raise ValueError("carrier_reference_not_original_corpus_first4p8s")
                if before.shape!=(115200,) or before.dtype!=np.float32:
                    raise ValueError("complete_float32_4p8s_carrier_required")
                unchanged=before.tobytes()
                desired=predict(model,physical_features(features,basis)[:,columns])
                after,controls,facts=apply_gain(desired,before)
                if before.tobytes()!=unchanged:
                    raise ValueError("carrier_mutated")
                entry=dict(case=case,carrier_path=str(carrier),carrier_sha256=old["sha256"],facts=facts)
                for label,wave in (("before",before),("after",after)):
                    path=output/f"{label}_{case}_reconstruction.npz"
                    entry[label]=dict(file=path.name,sha256=previous.write_npz(path,generated=wave,reference=reference),
                        diagnostics=previous.diagnostics(wave,reference))
                path=output/f"{case}_predicted_gain_controls.npz"
                entry["controls"]=dict(file=path.name,sha256=previous.write_npz(path,**controls))
                report["cases"].append(entry)
            if any(previous.sha(p)!=checksum for p,checksum in bindings.items()):
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
    args=parser.parse_args();os.umask(0o077)
    result=run(args.corpus_manifest,args.carrier_report,args.output)
    print(json.dumps({"status":result["status"],"wall_seconds":result["wall_seconds"]}))
