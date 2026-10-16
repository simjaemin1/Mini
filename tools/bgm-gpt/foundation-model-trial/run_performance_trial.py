"""Offline two-condition ACE trial using our authored-score performance guide.

The guide is a render by our AIHub-trained model, NOT the original performance.
No codec reconstruction, LM, upstream edits, or game-asset approval occurs here.
"""
import argparse
from dataclasses import asdict
from importlib.metadata import version
import json
import os
from pathlib import Path
import time

from ace_limits import ResourceCaps, ResourceGuard
from ace_operations import cover_once
from ace_runtime import initialize_runtime, sha256_file, verify_official_source
from run_trial import check_audio, write_json

SEED = 20261016
NOISE_CONDITIONS = (0.5, 0.8)
EXPECTED_FRAMES = 921600


def read_json(path):
    path = Path(path).resolve(strict=True)
    if path.stat().st_size > 1024 ** 2:
        raise ValueError("Pilot manifest exceeds 1 MiB")
    return json.loads(path.read_text())


def checked_record(item):
    path = Path(item["path"])
    if not path.is_absolute() or not path.is_file() or sha256_file(path) != item["sha256"]:
        raise ValueError("Frozen local input is missing or changed")
    return {"path": str(path.resolve()), "sha256": item["sha256"]}


def verify_inputs_and_assets(args):
    manifest = read_json(args.manifest)
    provenance = manifest["provenance"]
    if not isinstance(provenance, dict):
        raise ValueError("provenance must be an object")
    derived = manifest.get("derived_from_AIHub_trained_model",
                           provenance.get("derived_from_AIHub_trained_model"))
    if derived is not True or provenance.get("DDSP_Gugak_used", False) is not False:
        raise ValueError("Trial requires our AIHub-trained performance, not DDSP-Gugak")
    records = {name: checked_record(manifest[name]) for name in
               ("guide", "reference", "authored_score", "control_plan")}
    guide_audio = check_audio(records["guide"]["path"], EXPECTED_FRAMES)
    if guide_audio["frames"] != EXPECTED_FRAMES:
        raise ValueError("Authored performance guide must be exactly 19.2 seconds")
    reference_audio = check_audio(records["reference"]["path"])
    if not 0 < reference_audio["frames"] <= 960000:
        raise ValueError("Reference must be at most 20 seconds")
    inventory = read_json(args.assets)
    for item in inventory["files"]:
        relative = Path(item["file"])
        if relative.is_absolute() or ".." in relative.parts:
            raise ValueError("Unsafe asset inventory path")
        path = args.checkpoints / relative
        if path.stat().st_size != item["bytes"] or sha256_file(path) != item["sha256"]:
            raise ValueError("Frozen model asset changed")
    return {"manifest_sha256": sha256_file(args.manifest), "records": records,
            "asset_manifest_sha256": sha256_file(args.assets),
            "official_source_commit": verify_official_source(args.source),
            "guide_audio": guide_audio, "reference_audio": reference_audio,
            "derived_from_AIHub_trained_model": True, "source_provenance": provenance,
            "guide_is_original_recording": False, "DDSP_Gugak_used": False,
            "guide_identity": "our_model_render_of_authored_new_melody_not_original_song"}


def run(args):
    os.umask(0o077)
    args.output.mkdir(mode=0o700, parents=False, exist_ok=False)
    started = time.monotonic()
    caps = ResourceCaps(max_seconds=1800)
    report_path = args.output / "report.json"
    report = {"schema": "mini.foundation-performance-cover-trial.v1", "status": "started",
              "seed": SEED, "cover_strength": 1.0, "noise_conditions": list(NOISE_CONDITIONS),
              "stages": [], "caps": asdict(caps), "codec_reconstruction_run": False,
              "model_audio_is_not_verified_game_asset": True,
              "launcher_sha256": sha256_file(__file__)}
    write_json(report_path, report)
    try:
        with ResourceGuard(args.output, caps):
            before = verify_inputs_and_assets(args)
            report["provenance"] = before
            write_json(report_path, report)
            print(json.dumps({"stage": "performance_inputs_and_assets_verified"}), flush=True)
            handler = initialize_runtime(args.source, args.checkpoints, args.output)
            report["runtime"] = handler.private_pilot_metadata
            report["versions"] = {name: version(name) for name in
                                  ("torch", "diffusers", "transformers", "ace-step", "soundfile")}
            for noise in NOISE_CONDITIONS:
                condition_dir = args.output / f"cover_noise_{int(noise * 10):02d}"
                condition_dir.mkdir(mode=0o700)
                stage = {"cover_noise_strength": noise, "status": "started"}
                report["stages"].append(stage)
                write_json(report_path, report)
                result, facts = cover_once(
                    handler, before["records"]["guide"]["path"],
                    before["records"]["reference"]["path"], condition_dir,
                    seed=SEED, cover_strength=1.0, cover_noise_strength=noise, caps=caps)
                saved = result.audios[0].get("path")
                if not saved or not Path(saved).is_file():
                    raise RuntimeError("Upstream returned success without a saved WAV")
                if not Path(saved).resolve().is_relative_to(condition_dir.resolve()):
                    raise RuntimeError("Saved output is outside this condition directory")
                stage.update(facts, audio=check_audio(saved, EXPECTED_FRAMES), status="rendered")
                write_json(report_path, report)
                print(json.dumps({"stage": "performance_cover_saved", "noise": noise,
                                  "audio": saved}), flush=True)
            after = verify_inputs_and_assets(args)
            if before != after:
                raise RuntimeError("Input or model/source binding changed during inference")
            report.update(status="rendered_not_listening_approved", inputs_and_assets_unchanged=True)
    except BaseException as exc:
        report.update(status="failed", error_type=type(exc).__name__, error=str(exc)[:3000])
        raise
    finally:
        report["elapsed_seconds"] = time.monotonic() - started
        write_json(report_path, report)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("manifest", "source", "checkpoints", "assets", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    run(parser.parse_args())
