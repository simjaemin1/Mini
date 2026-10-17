#!/usr/bin/env python3
"""Private one-second source/copy listening diagnostics; never a music pass.

Reads only the four saved 2..3s evaluation clips, not original recordings or
weights. Each excerpt receives one static gain. Pairs are normalized source,
0.4s digital silence, normalized prediction, with no additional pair gain.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "foundation-model-trial"))
import compare_audio as audio
import prepare_inputs as private

TARGET_LUFS, LUFS_TOLERANCE = -24.0, 0.3
SECONDS, GAP_SECONDS = 1.0, 0.4
FRAMES, GAP_FRAMES = 48000, 19200
SCHEMA = "mini.private-nsf-copy-listening-diagnostic.v1"


def private_file(path: Path) -> Path:
    root = private.PRIVATE_ROOT.resolve(strict=True)
    if (not path.is_absolute() or not stat.S_ISREG(path.lstat().st_mode)
            or stat.S_IMODE(path.stat().st_mode) & 0o077
            or root not in path.resolve(strict=True).parents):
        raise ValueError("private_absolute_regular_readonly_input_required")
    return path


def load_inputs(report_path: Path) -> tuple[dict, list[dict], dict]:
    report_path = private_file(report_path)
    if report_path.stat().st_size > 1_000_000:
        raise ValueError("bounded_evaluation_report_required")
    bindings = {str(report_path): private.sha256(report_path)}
    report = json.loads(report_path.read_text(encoding="utf-8"))
    pairs = report.get("copy_diagnostics", [])
    if (report.get("schema") != "mini.nsf-copy-and-authorial-score-evaluation.v1"
            or report.get("status") != "rendered_not_listening_approved" or len(pairs) != 2):
        raise ValueError("completed_two_pair_evaluation_report_required")
    inputs = []
    for index, pair in enumerate(pairs, 1):
        if (pair.get("start_frame") != 200 or pair.get("frames") != 100
                or pair.get("seconds") != [2., 3.]
                or pair.get("not_blind_same_file_as_training_validation") is not True
                or pair.get("distinct_from_validation_first_second") is not True
                or not re.fullmatch(r"[0-9a-f]{64}", pair.get("source_sha256", ""))
                or not math.isfinite(pair.get("source_static_gain", float("nan")))
                or pair["source_static_gain"] <= 0
                or len(pair.get("audio", [])) != 2):
            raise ValueError("fixed_reused_file_2_to_3second_copy_crops_required")
        measured_rms = []
        for role, row in zip(("source_static_gain", "prediction"), pair["audio"]):
            name = f"heldout{index}_{role}_1s_24k.wav"
            if (row.get("file") != name or row.get("sample_rate_hz") != 24000
                    or row.get("frames") != 24000 or row.get("format") != "WAV_FLOAT"
                    or not re.fullmatch(r"[0-9a-f]{64}", row.get("sha256", ""))):
                raise ValueError("fixed_24k_one_second_float_clip_required")
            path = private_file(report_path.parent / name)
            if private.sha256(path) != row["sha256"] or path.stat().st_size != row.get("bytes"):
                raise ValueError("copy_clip_sha_or_size_mismatch")
            samples, rate = sf.read(path, dtype="float64", always_2d=True)
            if (rate != 24000 or samples.shape != (24000, 1)
                    or sf.info(path).subtype != "FLOAT" or not np.isfinite(samples).all()):
                raise ValueError("finite_mono_float_24k_24000_frames_required")
            rms = float(np.sqrt(np.mean(samples**2)))
            if rms <= 0:
                raise ValueError("non_silent_clip_required")
            measured_rms.append(rms)
            decoded = audio.decode(path, trim=False, seconds=SECONDS)
            if decoded.shape != (FRAMES, 2):
                raise ValueError("exact_resampled_one_second_required")
            stats = audio.measure(decoded)
            gain = TARGET_LUFS - stats["integrated_lufs"]
            if stats["true_peak_dbfs"] + gain > audio.PEAK_MARGIN_DBFS:
                raise ValueError("static_minus24_lufs_would_exceed_true_peak_ceiling")
            inputs.append({"pair": index, "role": role, "path": path, "sha256": row["sha256"],
                "pcm": decoded, "measurement": stats, "gain_db": gain, "raw_rms": rms})
            bindings[str(path)] = row["sha256"]
        delta = 20 * math.log10(measured_rms[1] / measured_rms[0])
        metrics = pair["metrics"]
        if (not math.isclose(delta, metrics["rms_delta_db"], abs_tol=0.001)
                or not math.isclose(measured_rms[0], metrics["target_rms"], rel_tol=1e-5)
                or not math.isclose(measured_rms[1], metrics["rms"], rel_tol=1e-5)):
            raise ValueError("saved_raw_rms_diagnostic_mismatch")
    return report, inputs, bindings


def validate_aac(path: Path, seconds: float, expected_lufs: float) -> tuple[np.ndarray, dict]:
    decoded = audio.decode(path, trim=False, seconds=seconds)  # Full AAC decode, including tail padding.
    frames = round(seconds * audio.SR)
    probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
        "stream=duration,sample_rate,channels,codec_name", "-of", "json", str(path)],
        capture_output=True, check=True, timeout=20)
    stream = json.loads(probe.stdout)["streams"][0]
    if (stream["codec_name"] != "aac" or int(stream["sample_rate"]) != 48000
            or int(stream["channels"]) != 2 or abs(float(stream["duration"]) - seconds) > 1/48000
            or len(decoded) > frames + 1023):
        raise ValueError("aac_container_duration_or_padding_invalid")
    stats = audio.measure(decoded)
    programme_stats = audio.measure(decoded[:frames])
    if (stats["true_peak_dbfs"] > audio.PEAK_MARGIN_DBFS
            or any(abs(row["integrated_lufs"] - expected_lufs) > LUFS_TOLERANCE
                   for row in (stats, programme_stats))):
        raise ValueError("decoded_aac_lufs_or_true_peak_check_failed")
    return decoded, {"seconds": seconds, "sample_rate_hz": 48000, "channels": 2,
        "programme_frames": frames, "decoded_frames": len(decoded), "decoded_full": stats,
        "decoded_programme": programme_stats, "expected_programme_lufs": expected_lufs}


def build(report_path: Path, output_dir: Path) -> dict:
    report, inputs, bindings = load_inputs(report_path)
    code_bindings = {str(Path(__file__).resolve()): private.sha256(Path(__file__)),
                     str(Path(audio.__file__).resolve()): private.sha256(Path(audio.__file__))}
    destination = private.fresh_private_dir(output_dir)
    original_umask = os.umask(0o077)
    try:
        pending = []
        with tempfile.TemporaryDirectory(prefix=".encoding_", dir=destination) as temporary:
            temp = Path(temporary)
            for row in inputs:
                name = f"pair{row['pair']}_{row['role']}_1s.m4a"
                path = temp / name
                audio.encode(row["pcm"], path, row["gain_db"])
                _decoded, checked = validate_aac(path, SECONDS, TARGET_LUFS)
                pending.append({"temp": path, "kind": "single", "pair": row["pair"], "role": row["role"],
                    "input_path": str(row["path"]), "input_sha256": row["sha256"], "raw_rms": row["raw_rms"],
                    "input_loudness": row["measurement"], "static_gain_db": row["gain_db"], **checked})
            for index in (1, 2):
                first, second = [row for row in inputs if row["pair"] == index]
                normalized = [row["pcm"] * 10**(row["gain_db"]/20) for row in (first, second)]
                pcm = np.concatenate((normalized[0], np.zeros((GAP_FRAMES, 2)), normalized[1]))
                expected = audio.measure(pcm)
                path = temp / f"pair{index}_source_then_prediction_2p4s.m4a"
                audio.encode(pcm, path, 0.)  # No second pair gain, fade, limiter, or double AAC encoding.
                decoded, checked = validate_aac(path, 2.4, expected["integrated_lufs"])
                segments = [audio.measure(decoded[a:b]) for a, b in ((0, FRAMES), (FRAMES+GAP_FRAMES, 2*FRAMES+GAP_FRAMES))]
                if any(abs(row["integrated_lufs"] - TARGET_LUFS) > LUFS_TOLERANCE for row in segments):
                    raise ValueError("paired_excerpt_lufs_not_matched")
                pending.append({"temp": path, "kind": "source_then_prediction", "pair": index,
                    "segment_order_seconds": [{"role": "source_static_gain", "start": 0., "end": 1.},
                        {"role": "authored_digital_silence", "start": 1., "end": 1.4},
                        {"role": "prediction", "start": 1.4, "end": 2.4}],
                    "digital_gap_before_encoding_exact_zero": True, "aac_gap_exact_zero_claimed": False,
                    "additional_pair_gain_db": 0., "decoded_excerpt_measurements": segments, **checked})
            if any(private.sha256(Path(path)) != digest for path, digest in {**bindings, **code_bindings}.items()):
                raise ValueError("immutable_input_or_code_changed")
            outputs = []
            for row in pending:
                path = row.pop("temp")
                target = destination / path.name
                fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
                with os.fdopen(fd, "wb") as handle:
                    handle.write(path.read_bytes())
                outputs.append({**row, "file": target.name, "sha256": private.sha256(target),
                                "bytes": target.stat().st_size})
        metadata = {"schema": SCHEMA, "status": "ready_private_diagnostic_not_quality_approved",
            "source_report_path": str(report_path), "input_bindings": bindings, "code_bindings": code_bindings,
            "checkpoint_sha256_provenance_only_not_loaded": report.get("checkpoint_sha256"),
            "source_credit": report.get("source_credit"), "license_scope": report.get("license_scope"),
            "requested_excerpt_lufs": TARGET_LUFS, "lufs_tolerance_db": LUFS_TOLERANCE,
            "true_peak_ceiling_dbfs": -1., "peak_measurement_margin_db": .1,
            "processing": "24k mono FLOAT to48k dualmono; one static gain per excerpt; AAC192k; no EQ/AGC/compression/pitch/time edits",
            "short_loudness_limit": "1s BS.1770/EBU-R128 integrated estimate,400ms gating; not whole-track loudness or perceptual equality proof",
            "padding_policy": "exact1s/2.4s AAC container; full decode may contain0..1023 tail samples; full and programme loudness/peak checked",
            "raw_level_errors_before_listening_normalization_db": [p["metrics"]["rms_delta_db"] for p in report["copy_diagnostics"]],
            "pair_provenance": [{"pair": i, "original_recording_sha256_reported_not_reopened": p["source_sha256"],
                "saved_source_clip_global_training_gain": p["source_static_gain"], "original_recording_read": False}
                for i, p in enumerate(report["copy_diagnostics"], 1)],
            "originals_unchanged": True, "model_load_or_inference": False, "external_upload": False,
            "music_timbre_or_generalization_approved": False,
            "not_blind": "same two source files used in internal validation;2..3s crops differ from validation0..1s",
            "outputs": outputs}
        fd = os.open(destination / "copy_diagnostic.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(metadata, handle, ensure_ascii=False, indent=2, allow_nan=False)
            handle.write("\n")
        return metadata
    finally:
        os.umask(original_umask)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluation-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    result = build(args.evaluation_report, args.output_dir)
    print(json.dumps({"status": result["status"], "outputs": len(result["outputs"])}))
