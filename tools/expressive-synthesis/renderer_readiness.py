#!/usr/bin/env python3
"""Fail-closed, read-only readiness report for an actual Daegeum renderer.

This is deliberately *not* a renderer, model loader, corpus crawler, or
installer.  It inventories only paths named on the command line, interrogates
named Python interpreters without changing them, and records why the current
machine is or is not ready for a score-conditioned expressive Daegeum model.

In particular, an audio file, an NGC catalog record, a model-shaped file, or a
project-local boolean is never treated as proof of training permission.  The
report can identify missing technical pieces, but it cannot grant rights.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import platform
import shutil
import subprocess
import sys
from typing import Any, Iterable


REPORT_SCHEMA = "mini.expressive-synthesis.renderer-readiness.v1"
REPORT_FILENAME = "renderer_readiness.json"
MODEL_SUFFIXES = frozenset({".pt", ".pth", ".ckpt", ".safetensors", ".onnx", ".h5", ".tflite", ".pb"})
HARNESS_FILES = (
    "tools/expressive-synthesis/setup_train_wsl.sh",
    "tools/expressive-synthesis/validate_manifest.py",
    "tools/expressive-synthesis/train_baseline.py",
    "tools/expressive-synthesis/render_synthetic_preview.py",
    "tools/aihub-paired-ingest/validate_bundle.py",
)


class RendererReadinessError(RuntimeError):
    """A requested diagnostic/report destination is ambiguous or unsafe."""


def _default_repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _under(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def _relative_for_report(path: Path, *, repo_root: Path) -> str:
    try:
        return path.resolve().relative_to(repo_root.resolve()).as_posix()
    except ValueError:
        # External roots/interpreters are opt-in CLI inputs.  Keeping their
        # absolute spelling makes the diagnostic reproducible and avoids
        # confusing two different ``python`` or ``torch`` directories.
        return str(path.expanduser().resolve())


def _model_artifacts(root: Path, *, repo_root: Path) -> dict[str, Any]:
    """List model-shaped files under one explicitly named root, never infer use."""

    item: dict[str, Any] = {
        "requested_root": _relative_for_report(root, repo_root=repo_root),
        "root_exists": root.is_dir(),
        "model_artifact_count": 0,
        "artifacts": [],
        "interpretation_limit": (
            "A model-shaped file is not a legitimate/compatible Daegeum renderer "
            "without explicit model provenance, compatibility, and rights evidence."
        ),
    }
    if not root.is_dir():
        return item
    artifacts: list[str] = []
    # ``rglob`` does not follow directory symlinks.  The root is explicit, so
    # this is a bounded local inventory rather than a home-directory crawl.
    for candidate in sorted(root.rglob("*")):
        if candidate.is_file() and candidate.suffix.lower() in MODEL_SUFFIXES:
            artifacts.append(_relative_for_report(candidate, repo_root=repo_root))
    item["model_artifact_count"] = len(artifacts)
    item["artifacts"] = artifacts
    return item


def _probe_python(executable: Path, *, repo_root: Path) -> dict[str, Any]:
    """Read import/capability facts from one named interpreter, without installing."""

    result: dict[str, Any] = {
        "requested_python": _relative_for_report(executable, repo_root=repo_root),
        "exists": executable.is_file(),
        "probe_succeeded": False,
    }
    if not executable.is_file():
        result["reason"] = "named interpreter is absent"
        return result
    probe = r'''
import importlib.util
import json
import platform
import sys

packages = {}
for name in ("numpy", "torch", "torchaudio", "tensorflow", "ddsp"):
    spec = importlib.util.find_spec(name)
    info = {"available": spec is not None}
    if spec is not None:
        try:
            module = __import__(name)
            info["version"] = getattr(module, "__version__", "unknown")
            if name == "torch":
                info["cuda_build"] = module.version.cuda
                info["cuda_available"] = bool(module.cuda.is_available())
        except BaseException as exc:
            info["import_error"] = type(exc).__name__
    packages[name] = info
print(json.dumps({
    "python_version": platform.python_version(),
    "executable": sys.executable,
    "packages": packages,
}, sort_keys=True))
'''
    try:
        completed = subprocess.run(
            [str(executable), "-c", probe],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        result["reason"] = f"runtime probe failed: {type(exc).__name__}"
        return result
    if completed.returncode != 0:
        result["reason"] = "runtime probe returned non-zero"
        result["stderr"] = completed.stderr.strip()[:400]
        return result
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        result["reason"] = "runtime probe did not return JSON"
        return result
    packages = payload.get("packages", {})
    torch = packages.get("torch", {}) if isinstance(packages, dict) else {}
    result.update(
        {
            "probe_succeeded": True,
            "python_version": payload.get("python_version"),
            "packages": packages,
            "cuda_training_runtime_ready": bool(
                isinstance(torch, dict)
                and torch.get("available") is True
                and torch.get("cuda_available") is True
            ),
        }
    )
    return result


def _probe_nvidia_smi() -> dict[str, Any]:
    executable = shutil.which("nvidia-smi")
    report: dict[str, Any] = {"nvidia_smi_found": executable is not None, "gpus": []}
    if executable is None:
        report["reason"] = "nvidia-smi is unavailable on this host"
        return report
    try:
        completed = subprocess.run(
            [
                executable,
                "--query-gpu=name,driver_version,memory.total",
                "--format=csv,noheader",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        report["reason"] = f"nvidia-smi probe failed: {type(exc).__name__}"
        return report
    if completed.returncode != 0:
        report["reason"] = "nvidia-smi returned non-zero"
        return report
    report["gpus"] = [line.strip() for line in completed.stdout.splitlines() if line.strip()]
    return report


def _inspect_ngc_manifest(path: Path | None, *, repo_root: Path) -> dict[str, Any]:
    """Record the exact R&D-only evidence already carried by the NGC manifest."""

    if path is None:
        return {"provided": False, "training_ready": False, "reason": "no NGC manifest was named"}
    report: dict[str, Any] = {
        "provided": True,
        "manifest": _relative_for_report(path, repo_root=repo_root),
        "training_ready": False,
    }
    if not path.is_file():
        report["reason"] = "named NGC manifest is absent"
        return report
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        report["reason"] = f"NGC manifest is unreadable: {type(exc).__name__}"
        return report
    entries = manifest.get("entries") if isinstance(manifest, dict) else None
    if not isinstance(entries, list):
        report["reason"] = "NGC manifest has no entries list"
        return report
    musical_statuses = [entry.get("musical_status", {}) for entry in entries if isinstance(entry, dict)]
    marked_ineligible = sum(
        1
        for status in musical_statuses
        if isinstance(status, dict) and status.get("eligible_for_model_training_or_game_asset") is False
    )
    r_and_d_only = manifest.get("r_and_d_only", {})
    license_evidence = manifest.get("license_evidence", {})
    report.update(
        {
            "schema": manifest.get("schema"),
            "entry_count": len(entries),
            "entries_explicitly_ineligible_for_model_training_or_game_asset": marked_ineligible,
            "human_review_and_rights_review_required_before_training_or_shipping": bool(
                isinstance(r_and_d_only, dict)
                and r_and_d_only.get("human_review_and_rights_review_required_before_training_or_shipping")
                is True
            ),
            "license_evidence_explicitly_not_training_or_game_clearance": bool(
                isinstance(license_evidence, dict)
                and license_evidence.get("not_a_model_training_or_game_distribution_clearance")
                is True
            ),
            "reason": (
                "This manifest itself marks source entries ineligible for model training/game assets "
                "and requires human/rights review; it cannot seed a trained renderer."
            ),
        }
    )
    return report


def _harness_inventory(repo_root: Path) -> dict[str, Any]:
    files = {relative: (repo_root / relative).is_file() for relative in HARNESS_FILES}
    return {
        "files": files,
        "all_required_rnd_harness_files_present": all(files.values()),
        "interpretation_limit": (
            "Harness source code provides a gated experiment path only; it is not an installed "
            "model, trained checkpoint, or authorization."
        ),
    }


def build_readiness_report(
    *,
    repo_root: Path,
    runtime_pythons: Iterable[Path],
    model_roots: Iterable[Path],
    ngc_manifest: Path | None,
) -> dict[str, Any]:
    """Build the stable, fail-closed report without writing files."""

    repo_root = repo_root.resolve()
    runtimes = [_probe_python(path.expanduser(), repo_root=repo_root) for path in runtime_pythons]
    model_inventory = [_model_artifacts(path.expanduser(), repo_root=repo_root) for path in model_roots]
    ngc = _inspect_ngc_manifest(ngc_manifest.expanduser() if ngc_manifest else None, repo_root=repo_root)
    cuda_runnable = any(item.get("cuda_training_runtime_ready") is True for item in runtimes)
    model_count = sum(int(item["model_artifact_count"]) for item in model_inventory)
    nvidia = _probe_nvidia_smi()
    blockers: list[str] = []
    if model_count == 0:
        blockers.append("No model/checkpoint artifact was found under the explicitly named model roots.")
    if ngc.get("training_ready") is not True:
        blockers.append("No approved paired audio/score/gesture training corpus was supplied; NGC evidence is R&D-only and ineligible.")
    if not cuda_runnable:
        blockers.append("No named Python runtime has both PyTorch and an accessible CUDA device for the GPU-only baseline.")
    if not nvidia.get("nvidia_smi_found"):
        blockers.append("This host has no nvidia-smi-visible NVIDIA GPU; the WSL/RTX 4060 path is not active here.")
    report = {
        "schema": REPORT_SCHEMA,
        "read_only": True,
        "repo_root": repo_root.name,
        "host": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
        },
        "runtimes": runtimes,
        "gpu": nvidia,
        "rnd_harness": _harness_inventory(repo_root),
        "model_inventory": model_inventory,
        "ngc_source_evidence": ngc,
        "actual_score_conditioned_daegeum_renderer": {
            "ready": False,
            "fail_closed": True,
            "blockers": blockers,
            "why_false_even_if_a_future_file_appears": (
                "This local check cannot verify model provenance, paired-performance semantics, "
                "or external training rights. A model-shaped file or self-attestation alone never "
                "changes this result into a real Daegeum claim."
            ),
        },
        "currently_honest_capabilities": [
            "Explicit score expression curves can be compiled and provenance-checked.",
            "The repository contains a gated R&D PyTorch baseline and a CPU-only synthetic smoke path.",
            "The existing synthetic preview remains generic/untrained and must not be called a real Daegeum render.",
            "NGC continuous-source spans can be audited as source references, not converted into training approval.",
        ],
        "smallest_next_executable_experiment": {
            "precondition": (
                "Obtain a rights-reviewed, explicitly paired Daegeum corpus: each take needs source WAV, "
                "aligned performance score/MIDI, and breath/re-attack/slur annotations, plus an external "
                "scope decision allowing this R&D training use."
            ),
            "then_on_the_windows_wsl_rtx4060_machine": [
                "Run bash tools/expressive-synthesis/setup_train_wsl.sh --check after nvidia-smi sees the RTX 4060.",
                "Create one SHA-verified explicit R&D corpus manifest and validate it before training.",
                "Run one held-out, R&D-only baseline experiment; compare score-conditioned attacks, re-attacks, and slurs against the paired recording without shipping its output.",
            ],
            "success_criterion": (
                "A checkpoint is only an R&D result. Call it a Daegeum renderer only after held-out listening/measurement "
                "and provenance review show score-conditioned gestures rather than copied phrase joins."
            ),
        },
        "interpretation_limits": {
            "no_download": True,
            "no_training": True,
            "no_model_load": True,
            "no_audio_decode_or_render": True,
            "no_default_bgm_change": True,
            "no_rights_inference": True,
        },
    }
    return report


def _write_report(report: dict[str, Any], report_dir: Path, *, repo_root: Path) -> Path:
    report_dir = report_dir.expanduser().resolve()
    public_assets = repo_root / "public" / "assets"
    if _under(report_dir, public_assets):
        raise RendererReadinessError("--report-dir must not be inside public/assets")
    if report_dir.exists():
        raise RendererReadinessError("--report-dir must be a fresh R&D directory")
    if not report_dir.parent.is_dir():
        raise RendererReadinessError("--report-dir parent must already exist")
    report_dir.mkdir()
    path = report_dir / REPORT_FILENAME
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Read-only fail-closed readiness check for a trained score-conditioned Daegeum renderer."
    )
    parser.add_argument("--repo-root", default=str(_default_repo_root()), help="Repository to inspect")
    parser.add_argument(
        "--runtime-python",
        action="append",
        default=[],
        help="Explicit Python interpreter to probe; repeatable, defaults to this interpreter",
    )
    parser.add_argument(
        "--model-root",
        action="append",
        default=[],
        help="Explicit local directory to inventory for model-shaped files; repeatable",
    )
    parser.add_argument("--ngc-manifest", help="Optional explicit NGC source manifest to inspect")
    parser.add_argument(
        "--report-dir",
        help="Optional fresh R&D directory for renderer_readiness.json; otherwise print JSON only",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = Path(args.repo_root).expanduser()
    if not repo_root.is_dir():
        print("renderer readiness rejected: --repo-root must be an existing directory", file=sys.stderr)
        return 2
    runtimes = [Path(value) for value in args.runtime_python] or [Path(sys.executable)]
    model_roots = [Path(value) for value in args.model_root] or [repo_root]
    try:
        report = build_readiness_report(
            repo_root=repo_root,
            runtime_pythons=runtimes,
            model_roots=model_roots,
            ngc_manifest=Path(args.ngc_manifest) if args.ngc_manifest else None,
        )
        if args.report_dir:
            path = _write_report(report, Path(args.report_dir), repo_root=repo_root)
            print(json.dumps({"report": _relative_for_report(path, repo_root=repo_root), "schema": REPORT_SCHEMA}, ensure_ascii=False, sort_keys=True))
        else:
            print(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True))
    except RendererReadinessError as exc:
        print(f"renderer readiness rejected: {exc}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
