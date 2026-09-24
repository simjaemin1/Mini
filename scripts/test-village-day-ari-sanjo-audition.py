#!/usr/bin/env python3
"""Dependency-free contract test for the actual-recording Ari audition."""

from __future__ import annotations

import ast
import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_sanjo_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_audition", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    # Python 3.9's dataclass annotation resolver looks the module up here
    # while executing the class body.
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


print("=== BGM R&D-03 — actual Sanjo Ari articulation audition contract ===\n")
module = load_module()
run = subprocess.run([sys.executable, str(SCRIPT), "--dry-run"], cwd=ROOT, text=True,
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
check(run.returncode == 0, "① dry run needs no raw bank, NumPy, or SciPy", run.stderr.strip())
try:
    doc = json.loads(run.stdout)
except json.JSONDecodeError as exc:
    doc = {}
    check(False, "② dry run emits JSON", str(exc))
else:
    check(True, "② dry run emits JSON")

score = doc.get("browser_score", {})
check(
    score.get("scene") == "village_day" and score.get("mood") == "ari"
    and score.get("browser_do") == 70.0 and score.get("beat_seconds") == 0.72
    and score.get("score_bars_one_based") == [8, 10]
    and score.get("arirang_indices_zero_based") == [7, 9],
    "③ score uses the browser village_day Ari pitch/time grid, not offline do=72",
    repr(score),
)
authority = score.get("articulation_authority", {})
check(
    authority.get("source") == "authorial source-score markup in ari_articulation.py"
    and "does not read" in authority.get("not_runtime_parity", "")
    and "legacy runtime remains unchanged" in authority.get("not_runtime_parity", "")
    and authority.get("authorial_choices", {}).get("b09_e1") == "rearticulate"
    and authority.get("authorial_choices", {}).get("b07_e2_to_b08_e0") == "candidate_only_unmarked",
    "④ source-score articulation is explicit and is not presented as runtime parity",
    repr(authority),
)
events = doc.get("performance_events", [])
check(
    [event.get("kind") for event in events]
    == ["breath_start", "breath_start", "rearticulate", "slur", "slur", "slur"],
    "⑤ canonical slice distinguishes rest→breath, reattack, and explicit slurs",
    repr([event.get("kind") for event in events]),
)
check(
    events and events[2].get("recipe") == "short_tongue_transient_then_recorded_steady_body"
    and all(event.get("recipe") == "recorded_steady_body" for event in events[3:]),
    "⑥ reattack is not conflated with a full new-breath head",
)
boundaries = doc.get("score_articulation_boundaries", [])
check(
    [item.get("sample_entry_mode") for item in boundaries]
    == ["head", "head", "head", "steady", "steady", "steady"]
    and boundaries[2].get("id") == "b09_e1"
    and boundaries[2].get("next_id") == "b10_e0"
    and boundaries[2].get("next_kind") == "slur"
    and abs(float(boundaries[2].get("next_gap_s")) or 0.0) < 1e-12,
    "⑦ provenance exposes exact score timing and head/steady entry mode per boundary",
    repr(boundaries),
)
scope = doc.get("scope", {})
check(
    scope == {
        "output_kind": "offline_R&D_audition_only",
        "default_released_audio_assets_changed": False,
        "bgm_js_runtime_changed": False,
        "new_recorded_assets_added": False,
    },
    "⑧ audition scope explicitly excludes release assets, browser runtime, and new recordings",
    repr(scope),
)
check(
    doc.get("variants") == ["all_sustain_heads", "all_steady_crossfades", "score_articulated"],
    "⑨ listening bundle contains both known failure references and the score-aware middle case",
)
policy = doc.get("source_policy", {})
check(
    policy.get("bank") == "Sanjo Daegeum only"
    and policy.get("max_pitch_shift_cents") == 225.0
    and sorted(float(key) for key in policy.get("sustain_source_map", {})) == [70.0, 72.0, 74.0, 77.0]
    and policy.get("tongue_source_map", {}).get("77.0", {}).get("raw_wav")
    == "대금_sanjo_deageum_stacatto_60.wav",
    "⑩ source map limits the exact score slice to the declared pitch-shift coverage",
    repr(policy),
)

source = SCRIPT.read_text(encoding="utf-8")
calls = dotted_calls(source)
check(
    "sampler.Voices" not in calls and "sampler.install" not in calls,
    "⑪ renderer never calls synth-fallback wrappers",
)
check(
    "entry_mode=\"auto\"" not in source and "no oscillator fallback" in source,
    "⑫ renderer forbids guessed sample entry and records no-oscillator policy",
)
check(
    "next_score_onsets_are_never_moved" in source
    and "post_mix_gain_is_common_to_all_variants" in source
    and "recorded_staccato_onset_proxy" in source,
    "⑬ provenance binds timeline, common gain, and labelled tongue proxy",
)

print(f"\n=== PASS {passed} / FAIL {failed} ===")
raise SystemExit(1 if failed else 0)
