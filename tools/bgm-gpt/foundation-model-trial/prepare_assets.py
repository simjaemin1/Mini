"""Inventory downloaded public weights; explicitly sync two official code files.

Run only after the pinned HF snapshot finishes. No network, weight modifications,
or edits to the upstream checkout. Original checkpoint Python is preserved.
"""
import argparse
import json
import os
from pathlib import Path
import shutil

from ace_runtime import MODEL_NAME, sha256_file, verify_official_source

HF_REVISION = "19671f406d603126926c1b7e2adc169acbcade22"
FOLDERS = ("vae", "Qwen3-Embedding-0.6B", MODEL_NAME)
CODE_FILES = ("configuration_acestep_v15.py", "modeling_acestep_v15_turbo.py")


def prepare(source, checkpoints, output):
    os.umask(0o077)
    source, checkpoints, output = map(lambda p: Path(p).resolve(strict=True),
                                      (source, checkpoints, output))
    commit = verify_official_source(source)
    destination = output / "asset_manifest.json"
    if destination.exists():
        raise FileExistsError(destination)
    required = (f"{MODEL_NAME}/model.safetensors", "vae/diffusion_pytorch_model.safetensors",
                "Qwen3-Embedding-0.6B/model.safetensors")
    if any(not (checkpoints / name).is_file() for name in required):
        raise FileNotFoundError("Wait for all three pinned weight files")
    originals = output / "original_checkpoint_code"
    originals.mkdir(mode=0o700)
    changes = []
    for name in CODE_FILES:
        old, new = checkpoints / MODEL_NAME / name, source / "acestep/models/turbo" / name
        shutil.copy2(old, originals / name)
        before = sha256_file(old)
        shutil.copyfile(new, old)
        changes.append({"file": name, "original_hf_sha256": before,
                        "synced_official_sha256": sha256_file(old)})
    files = []
    for folder in FOLDERS:
        for path in sorted((checkpoints / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                files.append({"file": str(path.relative_to(checkpoints)),
                              "bytes": path.stat().st_size, "sha256": sha256_file(path)})
    manifest = {"hf_repository": "ACE-Step/Ace-Step1.5", "hf_revision": HF_REVISION,
                "official_source_commit": commit, "files": files,
                "checkpoint_code_sync": changes, "weights_modified": False,
                "code_backup": str(originals), "network_used_by_this_script": False,
                "lm_loaded_or_downloaded": False}
    destination.write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps({"manifest": str(destination), "files": len(files),
                      "bytes": sum(f["bytes"] for f in files)}), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source", "checkpoints", "output"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    prepare(args.source, args.checkpoints, args.output)
