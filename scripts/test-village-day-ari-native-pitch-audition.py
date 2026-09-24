#!/usr/bin/env python3
"""Dependency-free contract test for the direct-WAV native-pitch audition."""

from __future__ import annotations

import ast
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_native_pitch_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_native_pitch_audition", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def dotted_calls(source: str) -> set[str]:
    def name_of(node):
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            parent = name_of(node.value)
            return f"{parent}.{node.attr}" if parent else node.attr
        return ""

    tree = ast.parse(source)
    return {name_of(node.func) for node in ast.walk(tree) if isinstance(node, ast.Call)}


passed = 0
failed = 0


def check(condition: bool, label: str, detail: str = "") -> None:
    global passed, failed
    if condition:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        print(f"  ✗ {label}" + (f" — {detail}" if detail else ""))


print("=== BGM R&D-04 — direct-WAV native-pitch Daegeum audition contract ===\n")
module = load_module()
run = subprocess.run([sys.executable, str(SCRIPT), "--dry-run"], cwd=ROOT, text=True,
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
check(run.returncode == 0, "① dry run needs no direct source or audio dependency", run.stderr.strip())
try:
    doc = json.loads(run.stdout)
except json.JSONDecodeError as exc:
    doc = {}
    check(False, "② dry run emits JSON", str(exc))
else:
    check(True, "② dry run emits JSON")

score = doc.get("browser_score", {})
check(
    score.get("browser_do") == 70.0 and score.get("beat_seconds") == 0.72
    and score.get("score_bars_one_based") == [8, 10]
    and "not a runtime replacement" in score.get("source_revision", ""),
    "③ score stays on the browser Ari grid while refusing runtime-parity claims",
    repr(score),
)
sources = doc.get("source_policy", {}).get("sustain_source_map", {})
expected = {70.0: 69.97, 72.0: 72.35, 74.0: 74.97, 77.0: 76.82}
actual = {float(key): float(value.get("midi")) for key, value in sources.items()}
check(actual == expected, "④ audited direct WAV pitch map is fixed", repr(actual))
check(
    len(sources) == 4
    and {value.get("wav") for value in sources.values()} == {"sanjo_deageum_scale_chung_34.wav"}
    and max(abs(target - actual[target]) * 100 for target in actual) <= 100,
    "⑤ all four score pitches use one direct scale take within a 100-cent source move",
    repr(sources),
)
tongue = doc.get("source_policy", {}).get("tongue_source_map", {}).get("77.0", {})
check(
    tongue.get("wav") == "sanjo_deageum_stacatto_60.wav"
    and tongue.get("head_start_s") == 10.74 and tongue.get("head_end_s") == 11.035
    and tongue.get("midi") == 76.82,
    "⑥ reattack retains a separately labelled direct raw 77 tongue onset",
    repr(tongue),
)
check(
    doc.get("variants") == [
        "all_sustain_heads", "all_steady_crossfades", "score_articulated_native_pitch"
    ],
    "⑦ bundle keeps both failure controls beside the native-pitch candidate",
)
check(
    "77->74->72 remains a labelled crossfade" in doc.get("source_policy", {}).get(
        "not_a_natural_transition_claim", ""
    ),
    "⑧ no source selection is mislabelled as a natural fingering transition",
)

source = SCRIPT.read_text(encoding="utf-8")
calls = dotted_calls(source)
check(
    "sampler.Voices" not in calls and "sampler.install" not in calls,
    "⑨ renderer never enters synth-fallback wrappers",
)
check(
    "native_breath_attack_window" in source
    and "70_to_120ms" in source
    and "onset_declick_gate_pass" in source,
    "⑩ real raw breath ramps are measured after onset without dropping click protection",
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
