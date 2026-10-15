"""One disposable offline ACE-Step process: codec diagnostic, then new-score cover.

No upstream patching, external upload, automatic retries, or game integration.
The private output directory must be new. Musical quality requires listening.
"""
import argparse
from importlib.metadata import version
import json
import os
from pathlib import Path
import time

from ace_limits import ResourceCaps, ResourceGuard
from ace_operations import cover_once, vae_roundtrip
from ace_runtime import initialize_runtime, sha256_file


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")


def check_audio(path, expected_frames=None):
    import numpy as np
    import soundfile as sf
    path = Path(path).resolve(strict=True)
    data, rate = sf.read(path, dtype="float32", always_2d=True)
    if rate != 48000 or data.shape[1] != 2 or not np.isfinite(data).all():
        raise ValueError("Invalid saved model audio")
    if expected_frames is not None and abs(len(data) - expected_frames) > 480:
        raise ValueError(f"Unexpected duration: {len(data)} frames")
    rms = float(np.sqrt(np.mean(data.astype(np.float64) ** 2)))
    if rms < 1e-6 or np.max(np.abs(data)) > 4:
        raise ValueError("Silent or extreme-amplitude model audio")
    return {"path": str(path), "sha256": sha256_file(path), "frames": len(data),
            "sample_rate": rate, "channels": 2, "rms": rms,
            "peak": float(np.max(np.abs(data))),
            "over_full_scale_fraction": float(np.mean(np.abs(data) > 1))}


def validate_inputs(inputs, assets, checkpoints):
    manifest = json.loads((inputs / "input_manifest.json").read_text())
    for item in manifest["outputs"]:
        if sha256_file(inputs / item["file"]) != item["sha256"]:
            raise ValueError("Prepared input hash changed")
    for path_key, hash_key in (("source_path", "source_sha256"), ("score_path", "score_sha256")):
        if sha256_file(manifest[path_key]) != manifest[hash_key]:
            raise ValueError("Original source or public score changed")
    inventory = json.loads(assets.read_text())
    for item in inventory["files"]:
        path = checkpoints / item["file"]
        if path.stat().st_size != item["bytes"] or sha256_file(path) != item["sha256"]:
            raise ValueError("Frozen model asset changed")
    return {"input_manifest_sha256": sha256_file(inputs / "input_manifest.json"),
            "asset_manifest_sha256": sha256_file(assets),
            "source_credit": manifest["source_credit"],
            "AIHub_or_DDSP_Gugak_used": False}


def run(args):
    os.umask(0o077)
    args.output.mkdir(mode=0o700, parents=False, exist_ok=False)
    started = time.monotonic()
    report = {"status": "started", "mode": args.mode, "stages": [],
              "wall_time_limit_seconds": 1800, "model_audio_is_not_verified_game_asset": True}
    report_path = args.output / "report.json"
    write_json(report_path, report)
    try:
        report["provenance"] = validate_inputs(args.inputs, args.assets, args.checkpoints)
        print(json.dumps({"stage": "inputs_and_assets_verified"}), flush=True)
        with ResourceGuard(args.output, ResourceCaps(max_seconds=1800)):
            handler = initialize_runtime(args.source, args.checkpoints, args.output)
            report["runtime"] = handler.private_pilot_metadata
            report["versions"] = {name: version(name) for name in
                                  ("torch", "diffusers", "transformers", "ace-step", "soundfile")}
            print(json.dumps({"stage": "models_loaded"}), flush=True)
            write_json(report_path, report)
            import soundfile as sf
            import torch
            if args.mode == "both":
                path = args.inputs / "ngc_002_reference_first4p8_plus0p2pad_5s_48k_stereo.wav"
                data, _ = sf.read(path, dtype="float32", always_2d=True)
                waveform, facts = vae_roundtrip(handler, torch.from_numpy(data.T.copy())[None],
                                               torch, output_dir=args.output)
                codec_path = args.output / "codec_reconstruction_5s_raw.wav"
                sf.write(codec_path, waveform[0].numpy().T, 48000, subtype="FLOAT")
                report["stages"].append({**facts, "audio": check_audio(codec_path, 240000)})
                print(json.dumps({"stage": "codec_reconstruction_saved"}), flush=True)
                write_json(report_path, report)
                del waveform, data
                torch.mps.empty_cache()
            cover_dir = args.output / "cover"
            cover_dir.mkdir(mode=0o700)
            result, facts = cover_once(
                handler, args.inputs / "public_b0_sine_guide_19p2s_48k_stereo.wav",
                args.inputs / "ngc_002_reference_full_19p2s_48k_stereo.wav", cover_dir,
                cover_strength=args.cover_strength, seed=args.seed)
            saved = result.audios[0].get("path")
            if not saved or not Path(saved).is_file():
                raise RuntimeError("Upstream reported success without a saved WAV")
            report["stages"].append({**facts, "audio": check_audio(saved, 921600)})
            print(json.dumps({"stage": "new_score_cover_saved", "audio": saved}), flush=True)
            report["status"] = "rendered_not_listening_approved"
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:3000])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        write_json(report_path, report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "checkpoints", "inputs", "assets", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    parser.add_argument("--mode", choices=("both", "cover"), default="both")
    parser.add_argument("--cover-strength", type=float, default=0.8)
    parser.add_argument("--seed", type=int, default=20261015)
    run(parser.parse_args())
