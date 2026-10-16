"""Read-only, source-SHA-grouped public NGC data and fit-only level calibration."""
import bisect
import hashlib
import json
import math
from pathlib import Path
import stat

import numpy as np
import torch

SEED, CROP_FRAMES, BATCH_SIZE, ACTIVE_THRESHOLD_DB = 20261016, 32, 4, -60.


def digest(path):
    with Path(path).open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def load_dataset(path):
    path = Path(path).resolve(strict=True)
    manifest_sha = digest(path)
    manifest = json.loads(path.read_text())
    if (manifest.get("schema") != "mini.nsf-public-ngc-data.v1" or manifest.get("status") != "complete"
            or manifest.get("AIHub_files_used") != 0 or manifest.get("network_used") is not False
            or manifest.get("sample_rate") != 24000 or manifest.get("feature_rate_hz") != 100
            or manifest.get("split_unit") != "immutable source file SHA, never windows"):
        raise ValueError("complete_public_ngc_source_file_split_required")
    root = Path(manifest["source_root"]).resolve(strict=True)
    bindings = {str(path): manifest_sha, str(root / ".done"): manifest["archive_done_sha256"]}
    rows, sources, waveforms = [], set(), set()
    for item in manifest["files"]:
        source, relative = Path(item["source_path"]), Path(item["npz_file"])
        if (not source.is_absolute() or not source.resolve(strict=True).is_relative_to(root)
                or not stat.S_ISREG(source.lstat().st_mode) or len(relative.parts) != 1
                or relative.suffix != ".npz" or item["split"] not in ("fit", "heldout")):
            raise ValueError("invalid_local_source_or_npz_path")
        npz = path.parent / relative
        if not stat.S_ISREG(npz.lstat().st_mode):
            raise ValueError("regular_npz_required")
        for file, key in ((source, "source_sha256"), (npz, "npz_sha256")):
            if digest(file) != item[key]: raise ValueError("data_source_hash_changed")
            bindings[str(file)] = item[key]
        with np.load(npz, allow_pickle=False) as data:
            arrays = {name: np.asarray(data[name]).copy() for name in
                      ("waveform", "pitch_hz", "rms_db", "voiced_mask")}
        wave, pitch, rms, uv = (arrays[name] for name in ("waveform", "pitch_hz", "rms_db", "voiced_mask"))
        wave_sha = hashlib.sha256(wave.tobytes()).hexdigest()
        if item["source_sha256"] in sources or wave_sha in waveforms:
            raise ValueError("duplicate_source_or_waveform_across_file_groups")
        if (wave.dtype != np.float32 or uv.dtype != np.bool_ or any(a.ndim != 1 for a in arrays.values())
                or len(pitch) < CROP_FRAMES or len(wave) != len(pitch) * 240
                or len(rms) != len(pitch) or len(uv) != len(pitch)
                or len(wave) != item["samples"] or len(pitch) != item["feature_frames"]
                or wave_sha != item["decoded_waveform_sha256"]
                or not all(np.isfinite(a).all() for a in (wave, pitch, rms))
                or np.any(pitch[~uv] != 0) or np.any(pitch[uv] <= 0) or np.any(pitch > 10800)):
            raise ValueError("invalid_or_unsynchronized_npz_arrays")
        sources.add(item["source_sha256"])
        waveforms.add(wave_sha)
        rows.append({"split": item["split"], "source_sha256": item["source_sha256"],
                     "npz_sha256": item["npz_sha256"], "source_path": str(source),
                     "npz_path": str(npz), "samples": len(wave), "feature_frames": len(pitch), **arrays})
    fit = [row for row in rows if row["split"] == "fit"]
    heldout = [row for row in rows if row["split"] == "heldout"]
    if not fit or not heldout: raise ValueError("separate_fit_and_heldout_files_required")
    peak = max(float(np.abs(row["waveform"]).max()) for row in fit)
    if peak <= 0: raise ValueError("nonzero_fit_peak_required")
    gain = min(1., .25 / peak)
    voiced_rms = np.concatenate([row["rms_db"][row["voiced_mask"]] for row in fit])
    if not len(voiced_rms): raise ValueError("fit_voiced_rms_anchor_required")
    metadata = {"manifest_path": str(path), "manifest_sha256": manifest_sha,
        "source_credit": manifest["source_credit"], "license_scope": manifest["license_scope"],
        "heldout_is_blind": manifest.get("heldout_is_blind", False), "fit_peak_before_gain": peak,
        "target_gain": gain, "target_gain_db": 20 * math.log10(gain), "fit_only_gain": True,
        "fit_voiced_rms_db_median_scaled": float(np.median(voiced_rms)) + 20 * math.log10(gain),
        "active_definition": "source RMS>-60dBFS before common gain, independent of harmonic voicing",
        "conditioning_db_clip": [-120, 6], "AIHub_or_external_weights_used": False,
        "files": [{key: row[key] for key in ("split", "source_path", "source_sha256", "npz_path",
                   "npz_sha256", "samples", "feature_frames")} for row in rows],
        "input_bindings": bindings}
    verify_bindings(bindings)
    return fit, heldout, metadata


def verify_bindings(bindings):
    if any(digest(path) != expected for path, expected in bindings.items()):
        raise ValueError("immutable_source_or_dataset_binding_changed")


def batch_from_windows(windows, gain):
    level_shift = 20 * math.log10(gain)
    columns = [[], [], [], [], []]
    for row, start, frames in windows:
        end = start + frames
        if start < 0 or end > len(row["pitch_hz"]): raise ValueError("crop_out_of_range")
        columns[0].append(row["waveform"][start * 240:end * 240] * gain)
        columns[1].append(row["pitch_hz"][start:end])
        columns[2].append(np.clip(row["rms_db"][start:end] + level_shift, -120, 6))
        columns[3].append(row["voiced_mask"][start:end])
        columns[4].append(row["rms_db"][start:end] > ACTIVE_THRESHOLD_DB)
    tensors = [torch.from_numpy(np.stack(column).astype(np.float32)) for column in columns]
    return tensors[0].unsqueeze(1), tensors[1:]


def sample_fit_windows(fit, rng, batch_size=BATCH_SIZE):
    counts = np.cumsum([len(row["pitch_hz"]) - CROP_FRAMES + 1 for row in fit]).tolist()
    windows = []
    for _ in range(batch_size):
        position = rng.randrange(counts[-1])
        index = bisect.bisect_right(counts, position)
        start = position - (counts[index - 1] if index else 0)
        windows.append((fit[index], start, CROP_FRAMES))
    return windows
