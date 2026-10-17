#!/usr/bin/env python3
"""Same saved one-second source: rejected NSF versus full-feature WORLD.

This is a reconstruction diagnostic, not new composition or ML training.
Each triplet is source1s / gap0.4s / NSF1s / gap0.4s / WORLD1s.
The saved source/NSF clips and originals are immutable. No failed-model rerun.
"""
from __future__ import annotations

import argparse
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time

import numpy as np
import soundfile as sf

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "neural-source-filter-trial"))
import build_copy_diagnostic as diagnostic
from run_world_copy import analyze_and_synthesize

audio, private = diagnostic.audio, diagnostic.private
from ace_limits import ResourceCaps, ResourceGuard


def write_json(path, value):
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        json.dump(value, handle, ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")


def normalized_pcm(path):
    pcm = audio.decode(path, trim=False, seconds=1.)
    if pcm.shape != (48000, 2):
        raise ValueError("exact_one_second_wave_required")
    measurement = audio.measure(pcm)
    gain = -24. - measurement["integrated_lufs"]
    if measurement["true_peak_dbfs"] + gain > -1.1:
        raise ValueError("static_target_exceeds_peak_ceiling")
    return pcm * 10**(gain / 20), {"input_measurement": measurement, "static_gain_db": gain}


def build(evaluation_report, output):
    previous_umask = os.umask(0o077)
    started = time.monotonic()
    try:
        original, inputs, bindings = diagnostic.load_inputs(evaluation_report)
        destination = private.fresh_private_dir(output)
        code = {str(path): private.sha256(path) for path in
                (Path(__file__), HERE / "run_world_copy.py", Path(diagnostic.__file__), Path(audio.__file__))}
        report = {"schema": "mini.saved-source-nsf-world-reconstruction-comparison.v1",
            "date": "2026-10-18", "status": "started", "source_bindings": bindings,
            "code_bindings": code, "pyworld_version": importlib.metadata.version("pyworld"),
            "source_credit": "국악기 음원 제공 — 국립국악원 (공공누리 제1유형)",
            "source_lineage": original["copy_diagnostics"],
            "reused_internal_validation_source_files_not_blind": True,
            "new_composition_or_ML_training": False, "failed_NSF_forward_calls": 0,
            "WORLD_synthesis_calls": 0, "external_upload": False,
            "natural_daegeum_timbre_approved": False, "pairs": []}
        with ResourceGuard(destination, ResourceCaps(max_seconds=300, max_rss_bytes=2*1024**3)):
            for index in (1, 2):
                source, rejected = [row for row in inputs if row["pair"] == index]
                waveform, rate = sf.read(source["path"], dtype="float64")
                reconstructed, controls, facts = analyze_and_synthesize(waveform, sample_rate=rate, pitch_shift=0)
                report["WORLD_synthesis_calls"] += 1
                if reconstructed.shape != (24000,) or not np.isfinite(reconstructed).all():
                    raise ValueError("WORLD_copy_must_remain_exact_finite_one_second")
                world_path = destination / f"pair{index}_world_copy_1s_24k.wav"
                sf.write(world_path, reconstructed, rate, format="WAV", subtype="FLOAT")
                world_path.chmod(0o600)
                controls_path = destination / f"pair{index}_world_controls.npz"
                with controls_path.open("xb") as handle:
                    np.savez_compressed(handle, **controls)
                controls_path.chmod(0o600)
                normalized, gain_facts = [], []
                for role, path in (("source", source["path"]), ("rejected_NSF", rejected["path"]), ("WORLD_copy", world_path)):
                    pcm, levels = normalized_pcm(path)
                    normalized.append(pcm)
                    gain_facts.append({"role": role, "path": str(path), "sha256": private.sha256(path), **levels})
                triplet = np.concatenate((normalized[0], np.zeros((19200, 2)), normalized[1],
                                          np.zeros((19200, 2)), normalized[2]))
                path = destination / f"pair{index}_source_NSF_WORLD_3p8s.m4a"
                audio.encode(triplet, path, 0.)
                path.chmod(0o600)
                decoded, checked = diagnostic.validate_aac(path, 3.8, audio.measure(triplet)["integrated_lufs"])
                segments = [audio.measure(decoded[start:start+48000]) for start in (0, 67200, 134400)]
                if any(abs(row["integrated_lufs"] + 24.) > .3 for row in segments):
                    raise ValueError("triplet_excerpts_not_lufs_matched")
                world_aac = destination / f"pair{index}_world_copy_1s.m4a"
                audio.encode(normalized[2], world_aac, 0.)
                world_aac.chmod(0o600)
                _, single_checked = diagnostic.validate_aac(world_aac, 1., -24.)
                report["pairs"].append({"pair": index, "WORLD_facts": facts,
                    "controls_file": controls_path.name, "controls_sha256": private.sha256(controls_path),
                    "world_wave_file": world_path.name, "world_wave_sha256": private.sha256(world_path),
                    "normalization": gain_facts, "raw_NSF_rms_error_db": original["copy_diagnostics"][index-1]["metrics"]["rms_delta_db"],
                    "segment_order": "source0..1 / digitalgap1..1.4 / rejectedNSF1.4..2.4 / digitalgap2.4..2.8 / WORLD2.8..3.8",
                    "per_excerpt_decoded_loudness": segments,
                    "triplet": {"file": path.name, "sha256": private.sha256(path), **checked},
                    "world_single": {"file": world_aac.name, "sha256": private.sha256(world_aac), **single_checked}})
            if any(private.sha256(Path(path)) != value for path, value in {**bindings, **code}.items()):
                raise ValueError("immutable_input_or_implementation_changed")
            if sum(path.stat().st_size for path in destination.iterdir()) > 10_000_000:
                raise ValueError("ten_megabyte_diagnostic_budget_exceeded")
        report.update(status="rendered_not_listening_approved", elapsed_seconds=time.monotonic()-started,
            immutable_inputs_and_code_unchanged=True,
            processing="same saved source; WORLD full F0/spectral-envelope/aperiodicity; static per-excerpt gain; AAC192k; no source waveform mixing into WORLD",
            limitation="speech vocoder, same reused source files; numerical checks do not establish daegeum identity; no learned breath or composition")
        write_json(destination / "saved_copy_comparison.json", report)
        return report
    finally:
        os.umask(previous_umask)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluation-report", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    report = build(args.evaluation_report, args.output)
    print(json.dumps({key: report[key] for key in ("status", "WORLD_synthesis_calls", "elapsed_seconds")}))
