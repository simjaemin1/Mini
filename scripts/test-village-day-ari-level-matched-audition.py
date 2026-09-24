#!/usr/bin/env python3
"""Dependency-free contract test for the V5 Daegeum splice-repair audition."""

from __future__ import annotations

import ast
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_level_matched_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_level_matched_audition", SCRIPT)
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


print("=== BGM R&D-05 — phase/level-matched Daegeum audition contract ===\n")
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

check(
    doc.get("variants") == [
        "v4_score_articulated_native_pitch_reference",
        "phase_level_matched_score_articulated_native_pitch",
    ],
    "③ V4 reference and a separate V5 candidate are both retained",
    repr(doc.get("variants")),
)
source_policy = doc.get("source_policy", {})
sources = source_policy.get("sustain_source_map", {})
actual = {float(key): float(value.get("midi")) for key, value in sources.items()}
expected = {70.0: 69.97, 72.0: 72.35, 74.0: 74.97, 77.0: 76.82}
check(
    source_policy.get("same_direct_source_map_as_v4") is True and actual == expected
    and {entry.get("wav") for entry in sources.values()} == {"sanjo_deageum_scale_chung_34.wav"},
    "④ V5 inherits V4's audited direct native-pitch sustain map rather than inventing a bank",
    repr(sources),
)
phase = source_policy.get("phase_match", {})
check(
    phase.get("searched_only_inside_human_audited_steady_span") is True
    and float(phase.get("minimum_positive_correlation", 0)) >= 0.70
    and phase.get("same_pitch_handoff_curve") == "linear_amplitude_complementary",
    "⑤ same-pitch tongue/body repair requires a positive phase match and a coherent linear handoff",
    repr(phase),
)
pitch_change = source_policy.get("pitch_change_level_match", {})
check(
    float(pitch_change.get("max_abs_adjust_db", 99)) <= 3.0
    and "remains a labelled crossfade" in pitch_change.get("not_a_natural_transition_claim", ""),
    "⑥ pitch-changing slurs remain bounded, labelled crossfades rather than fake natural transitions",
    repr(pitch_change),
)
source = SCRIPT.read_text(encoding="utf-8")
calls = dotted_calls(source)
check(
    "sampler.Voices" not in calls and "sampler.install" not in calls
    and "no oscillator fallback" in source,
    "⑦ renderer never enters synth fallback wrappers",
)
check(
    "continued_recorded_body_without_duplicate_same_pitch_splice" in source
    and "REATTACK_TROUGH_GATE_START_S" in source
    and "HELD_BODY_TAPER_MAX_DB" in source,
    "⑧ source continuation and measured anti-pump gates are explicit in the R&D renderer",
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
