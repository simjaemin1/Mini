#!/usr/bin/env python3
"""Dependency-free contract test for the actual-sample Daegeum probe.

Run from the repository root:

    python3 scripts/test-daegeum-articulation-probe.py

It purposely needs neither the archived sample bank nor NumPy/SciPy.  The
actual render must be exercised separately in an audio environment with an
explicit restored ``samples_jdae`` root.
"""

from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import ast
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
PROBE = ROOT / "public" / "assets" / "audio" / "bgm" / "render_daegeum_articulation_probe.py"
BGM = PROBE.parent


def load_probe():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("dae_probe_contract", PROBE)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {PROBE}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def check(condition: bool, label: str, detail: str = "") -> int:
    status = "PASS" if condition else "FAIL"
    print(f"{status}  {label}" + (f" — {detail}" if detail else ""))
    return 0 if condition else 1


def called_names(source: str) -> set[str]:
    """Return dotted function calls, ignoring explanatory docstrings/comments."""
    def name_of(node):
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parent = name_of(node.value)
            return f"{parent}.{node.attr}" if parent else node.attr
        return ""

    tree = ast.parse(source)
    return {name_of(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)}


def main() -> int:
    failures = 0
    probe = load_probe()

    dry = subprocess.run(
        [sys.executable, str(PROBE), "--dry-run"],
        cwd=ROOT,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    failures += check(dry.returncode == 0, "dry run needs no sample bank or audio dependency", dry.stderr.strip())
    try:
        document = json.loads(dry.stdout)
    except json.JSONDecodeError as exc:
        document = {}
        failures += check(False, "dry run emits JSON", str(exc))

    kinds = [event.get("kind") for event in document.get("events", [])]
    failures += check(
        kinds == ["breath_start", "slur", "rearticulate", "detached"],
        "default score distinguishes all four entry modes",
        repr(kinds),
    )
    modes = [event.get("sample_mode") for event in document.get("events", [])]
    failures += check(
        modes == ["head", "steady", "head", "head"],
        "only explicit slur uses steady body; other edges demand recorded heads",
        repr(modes),
    )
    failures += check(
        document.get("requires_explicit_samples_jdae_root") is True
        and document.get("fallback") == "forbidden",
        "actual mode declares explicit-root/no-fallback contract",
    )

    rearticulate = document["events"][2]
    failures += check(
        0.03 <= rearticulate["gap_before_s"] <= 0.04
        and rearticulate["renderer"]["entry_mode"] == "head",
        "rearticulation has an explicit ~35 ms release gap before a recorded head",
        repr(rearticulate),
    )
    prior = document["events"][1]
    failures += check(
        abs(prior["renderer"]["ring"] - rearticulate["gap_before_s"]) < 1e-9,
        "preceding steady note fades entirely inside the rearticulation gap",
    )

    source = PROBE.read_text(encoding="utf-8")
    calls = called_names(source)
    failures += check(
        "sampler.Voices" not in calls and "sampler.install" not in calls,
        "probe never imports a synth-fallback wrapper",
    )
    failures += check(
        "selected non-Daegeum sample" in source and "required a recorded Daegeum sus sample" in source,
        "probe hard-fails wrong instrument or articulation selection",
    )
    failures += check(
        "entry_mode=opts[\"entry_mode\"]" in source
        and "entry_mode\": entry_mode" in source,
        "probe explicitly passes head/steady entry mode to the sample bank",
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
