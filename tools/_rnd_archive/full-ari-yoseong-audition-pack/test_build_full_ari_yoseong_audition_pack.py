#!/usr/bin/env python3
"""Contract tests for the full-Arirang B0/B1 audition pack."""

from __future__ import annotations

import csv
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from build_full_ari_yoseong_audition_pack import (  # noqa: E402
    CONTROL_RATE_HZ,
    EXPECTED_AUDIO_SAMPLES,
    MANIFEST_FILENAME,
    OUTPUT_AUDIO_NAMES,
    ROLES,
    SAMPLE_RATE_HZ,
    SPEC_SCHEMA,
    FullAriAuditionPackError,
    build_full_ari_yoseong_audition_pack,
)
from make_full_ari_yoseong_spec import make_full_ari_yoseong_spec  # noqa: E402


PATTERNS = (
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.0), (1.0, 0.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 0.5), (0.5, 0.5), (1.0, 0.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 1.0)),
    ((0.0, 2.0),),
    ((0.0, 2.0), (2.0, 1.0)),
    ((0.0, 1.0), (1.0, 1.0), (2.0, 1.0)),
    ((0.0, 1.0), (1.0, 0.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 0.5), (0.5, 0.5), (1.0, 0.5), (1.5, 0.5), (2.0, 0.5), (2.5, 0.5)),
    ((0.0, 1.5), (1.5, 0.5), (2.0, 1.0)),
    ((0.0, 3.0),),
)
SELECTED = ("b08_e0", "b16_e0")
RULES = (
    "gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate",
    "gyeonggi_ari.v1.global_cadence_late_yoseong_candidate",
)


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, sort_keys=True) + "\n", encoding="utf-8")


def _git(root: Path, *arguments: str) -> str:
    completed = subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip()


def _events(*, b1: bool) -> list[dict[str, object]]:
    result: list[dict[str, object]] = []
    pitch_cycle = (392.0, 440.0, 523.251131, 587.329536, 698.456463)
    note_index = 0
    for bar_index, pattern in enumerate(PATTERNS, start=1):
        bar_start = (bar_index - 1) * 2.16
        for event_index, (beat_start, duration_beats) in enumerate(pattern):
            event_id = f"b{bar_index:02d}_e{event_index}"
            start = bar_start + beat_start * 0.72
            end = start + duration_beats * 0.72
            enabled = b1 and event_id in SELECTED
            result.append({
                "id": event_id,
                "start_seconds": round(start, 9),
                "end_seconds": round(end, 9),
                "pitch_hz": pitch_cycle[note_index % len(pitch_cycle)],
                "articulation": "breath_start" if event_index == 0 and bar_index in {1, 5, 9, 13} else "slur",
                "steady_loudness_db": -30.0 + float(note_index % 3),
                "vibrato": (
                    {
                        "enabled": True,
                        "rate_hz": 3.45,
                        "depth_cents": 18.0,
                        "onset_seconds": 0.2,
                        "ramp_seconds": 0.18,
                        "end_fade_seconds": 0.18,
                    }
                    if enabled
                    else {"enabled": False}
                ),
            })
            note_index += 1
    assert len(result) == 59
    final = result[-1]
    result.append({
        "id": "b16_release",
        "start_seconds": 34.56,
        "end_seconds": 34.8,
        "articulation": "release",
        "steady_loudness_db": final["steady_loudness_db"],
        "release_source": {
            "event_id": final["id"],
            "nominal_pitch_hz": final["pitch_hz"],
            "elapsed_seconds_at_release": 2.16,
            "vibrato": final["vibrato"],
        },
        "vibrato": {"enabled": False},
    })
    return result


def _event_at(events: list[dict[str, object]], time_seconds: float) -> dict[str, object] | None:
    for event in events:
        if float(event["start_seconds"]) <= time_seconds < float(event["end_seconds"]):
            return event
    return None


def _vibrato_cents(event: dict[str, object], frame: int) -> float:
    if event["id"] not in SELECTED:
        return 0.0
    start = round(float(event["start_seconds"]) * CONTROL_RATE_HZ)
    end = round(float(event["end_seconds"]) * CONTROL_RATE_HZ)
    if end - start <= 1:
        return 0.0
    progress = (frame - start) / (end - start - 1)
    return 14.0 * math.sin(progress * math.pi) * math.sin(progress * 8.0 * math.pi)


def _write_controls(path: Path, events: list[dict[str, object]], *, b1: bool) -> None:
    fields = (
        "frame_index", "time_seconds", "f0_hz", "loudness_linear", "voicing",
        "articulation", "event_id", "vibrato_cents",
    )
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        for frame in range(8700):
            time_seconds = frame / CONTROL_RATE_HZ
            event = _event_at(events, time_seconds)
            if event is None:
                row = {
                    "frame_index": frame,
                    "time_seconds": time_seconds,
                    "f0_hz": 0.0,
                    "loudness_linear": 0.0,
                    "voicing": 0.0,
                    "articulation": "rest",
                    "event_id": "",
                    "vibrato_cents": 0.0,
                }
            else:
                cents = _vibrato_cents(event, frame) if b1 else 0.0
                nominal = float(
                    event.get("pitch_hz", event.get("release_source", {}).get("nominal_pitch_hz"))
                )
                release = event["articulation"] == "release"
                release_progress = (time_seconds - 34.56) / 0.24 if release else 0.0
                row = {
                    "frame_index": frame,
                    "time_seconds": time_seconds,
                    "f0_hz": nominal * 2.0 ** (cents / 1200.0),
                    "loudness_linear": 0.04 * (1.0 - release_progress) if release else 0.04,
                    "voicing": 1.0 - release_progress if release else 1.0,
                    "articulation": event["articulation"],
                    "event_id": event["id"],
                    "vibrato_cents": cents,
                }
            writer.writerow(row)


def _write_wav(path: Path) -> None:
    amplitude = round(32768.0 * 10.0 ** (-24.0 / 20.0))
    pair = int(amplitude).to_bytes(2, "little", signed=True) + int(-amplitude).to_bytes(2, "little", signed=True)
    raw = pair * (EXPECTED_AUDIO_SAMPLES // 2)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE_HZ)
        output.writeframes(raw)


def _policy(plan: Path, *, b1: bool) -> dict[str, object]:
    selected_records = []
    if b1:
        selected_records = [
            {"event_id": SELECTED[0], "policy_rule_id": RULES[0], "decision": "selected"},
            {"event_id": SELECTED[1], "policy_rule_id": RULES[1], "decision": "selected"},
        ]
    return {
        "schema": "mini.score-expression.render-manifest.v2",
        "r_and_d_scope": {"r_and_d_only": True, "no_default_assets": True, "no_game_output": True},
        "input": {"plan_sha256": _sha256(plan)},
        "expression_policy": {
            "automatic_activation": False,
            "default_decision": "off",
            "evidence_status": "literature_informed_but_provisional",
            "active_selection_provenance": (
                {
                    "status": "explicit_rnd_audition_opt_in",
                    "selected_event_ids": list(SELECTED),
                }
                if b1 else None
            ),
        },
        "fired_policy_rules": selected_records,
    }


def _make_runtime(root: Path, slot: str) -> tuple[Path, Path, Path]:
    b1 = slot == "B1"
    directory = root / "_bgm_rnd" / f"runtime-{slot}"
    directory.mkdir(parents=True)
    events = _events(b1=b1)
    plan = root / "_bgm_rnd" / f"{slot}_full_plan.json"
    _write_json(plan, {"schema": "mini.score-expression.plan.v1", "events": events})
    policy = root / "_bgm_rnd" / f"{slot}_policy.json"
    _write_json(policy, _policy(plan, b1=b1))
    controls = directory / "score_controls_250hz.csv"
    _write_controls(controls, events, b1=b1)
    audio = directory / "wet.wav"
    _write_wav(audio)
    final = events[-2]
    report = {
        "schema": "mini.ddsp-gugak-public-daegeum-runtime.v1",
        "status": "succeeded",
        "scope": {"r_and_d_only": True, "no_default_bgm_changed": True, "not_a_game_asset": True},
        "actions_performed": {
            "default_bgm_changed": False,
            "experimental_hard_f0_step": True,
            "learned_reverb_called": True,
        },
        "checkpoint": {
            "checkpoint": {"sha256": "a" * 64},
            "checkpoint_config": {"sha256": "b" * 64},
            "architecture": {"sample_rate_hz": SAMPLE_RATE_HZ},
        },
        "public_sources": {"ddsp_gugak": {"revision": "a"}, "ddsp_pytorch": {"revision": "b"}},
        "render": {"runtime": {"seed": 20260925, "device": "cpu", "torch": "fixture"}},
        "score_controls": {
            "renderer_control_hz": CONTROL_RATE_HZ,
            "frame_count": 8700,
            "duration_seconds": 34.8,
            "full_plan_duration_seconds": 34.8,
            "slur_transition_policy": {"pitch_mode": "experimental_phase_continuous_hard_f0_step"},
            "renderer_gate": {
                "hard_zero_rest_ranges": [{
                    "start_frame": 4140,
                    "end_frame_exclusive": 4320,
                    "start_seconds": 16.56,
                    "end_seconds": 17.28,
                    "start_sample": 264960,
                    "end_sample_exclusive": 276480,
                }],
            },
            "release_vibrato_qa": {
                "passed": True,
                "final_nominal_pitch_gate_passed": True,
                "policy": {
                    "phase_continuity": "source_vibrato_clock_continues_without_reset",
                    "depth_envelope": "minimum_jerk_to_zero_on_final_control_row",
                },
            },
        },
        "score_plan": {"plan": {"sha256": _sha256(plan)}, "events": events},
        "checkpoint_native_reverb_audition": {
            "kind": "published-checkpoint-native learned-FIR reverb",
            "level_match": {
                "constant_gain_applied_to_entire_file": 1.75,
                "gain_source_slot": "B0",
                "target_shared_interval_rms_dbfs": -24.0,
                "shared_interval_start_seconds": 0.0,
                "shared_interval_end_seconds": 34.56,
                "shared_interval_sample_count": 552960,
                "compression_or_limiter": False,
                "clipping_limited": False,
            },
            "runtime": {"source": {"component": "unchanged published reverb", "keys": ["reverb.fir"]}},
        },
        "outputs": {
            "controls_csv": {"basename": controls.name, "sha256": _sha256(controls)},
            "checkpoint_native_reverb_score_length_wav": {"basename": audio.name, "sha256": _sha256(audio)},
        },
    }
    assert final["id"] == "b16_e0"
    report_path = directory / "runtime_report.json"
    _write_json(report_path, report)
    return report_path, plan, policy


def _artifact(root: Path, path: Path) -> dict[str, str]:
    return {"path": path.relative_to(root).as_posix(), "sha256": _sha256(path)}


def _fixture() -> tuple[tempfile.TemporaryDirectory[str], Path, str, Path]:
    temporary = tempfile.TemporaryDirectory()
    root = Path(temporary.name)
    _git(root, "init")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Full Ari Test")
    (root / ".gitignore").write_text("_bgm_rnd/\n", encoding="utf-8")
    default = root / "public/assets/audio/bgm"
    default.mkdir(parents=True)
    for name in ("bgm.js", "bgm-loops.js", "render-meta.json"):
        (default / name).write_text(f"fixture {name}\n", encoding="utf-8")
    _git(root, "add", ".gitignore", "public/assets/audio/bgm")
    _git(root, "commit", "-m", "fixture baseline")
    baseline = _git(root, "rev-parse", "HEAD")
    artifacts = {slot: _make_runtime(root, slot) for slot in ("B0", "B1")}
    spec = {
        "schema": SPEC_SCHEMA,
        "candidates": {
            slot: {
                "status": "ready",
                "role": ROLES[slot],
                "runtime_report": _artifact(root, artifacts[slot][0]),
                "plan_artifact": _artifact(root, artifacts[slot][1]),
                "policy_manifest": _artifact(root, artifacts[slot][2]),
                "expected_policy_rule_ids": list(RULES) if slot == "B1" else [],
                "expected_yoseong_event_ids": list(SELECTED) if slot == "B1" else [],
            }
            for slot in ("B0", "B1")
        },
    }
    spec_path = root / "_bgm_rnd/spec.json"
    _write_json(spec_path, spec)
    return temporary, root, baseline, spec_path


def _rehash_report_and_spec(root: Path, spec_path: Path, slot: str) -> None:
    spec = json.loads(spec_path.read_text(encoding="utf-8"))
    report_path = root / spec["candidates"][slot]["runtime_report"]["path"]
    spec["candidates"][slot]["runtime_report"]["sha256"] = _sha256(report_path)
    _write_json(spec_path, spec)


class FullAriAuditionPackTests(unittest.TestCase):
    def test_builds_verified_full_song_pack(self) -> None:
        temporary, root, baseline, spec = _fixture()
        self.addCleanup(temporary.cleanup)
        output = root / "_bgm_rnd/full-pack"
        manifest = build_full_ari_yoseong_audition_pack(
            root, spec, output, baseline_revision=baseline
        )
        self.assertEqual(manifest["status"], "succeeded")
        self.assertEqual(manifest["fixed_full_song_contract"]["control_frame_count"], 8700)
        self.assertEqual(manifest["candidates"]["B0"]["controls"]["nonzero_vibrato_frame_count"], 0)
        self.assertEqual(manifest["candidates"]["B1"]["controls"]["nonzero_vibrato_event_ids"], list(SELECTED))
        self.assertTrue(manifest["candidates"]["B1"]["release_qa"]["final_nominal_pitch_gate_passed"])
        self.assertEqual(manifest["comparison_contract"]["same_B0_derived_constant_gain"], 1.75)
        self.assertTrue((output / MANIFEST_FILENAME).is_file())
        for name in OUTPUT_AUDIO_NAMES.values():
            self.assertTrue((output / name).is_file())

    def test_spec_generator_hashes_every_input(self) -> None:
        temporary, root, _, original_spec = _fixture()
        self.addCleanup(temporary.cleanup)
        original = json.loads(original_spec.read_text(encoding="utf-8"))["candidates"]
        output = root / "_bgm_rnd/generated.json"
        generated = make_full_ari_yoseong_spec(
            root,
            output,
            b0_runtime_report=root / original["B0"]["runtime_report"]["path"],
            b0_plan=root / original["B0"]["plan_artifact"]["path"],
            b0_policy_manifest=root / original["B0"]["policy_manifest"]["path"],
            b1_runtime_report=root / original["B1"]["runtime_report"]["path"],
            b1_plan=root / original["B1"]["plan_artifact"]["path"],
            b1_policy_manifest=root / original["B1"]["policy_manifest"]["path"],
            b1_rule_ids=RULES,
            b1_event_ids=SELECTED,
        )
        self.assertEqual(generated["candidates"]["B1"]["expected_yoseong_event_ids"], list(SELECTED))
        self.assertEqual(
            generated["candidates"]["B0"]["runtime_report"]["sha256"],
            original["B0"]["runtime_report"]["sha256"],
        )

    def test_rejects_independently_derived_B1_gain(self) -> None:
        temporary, root, baseline, spec = _fixture()
        self.addCleanup(temporary.cleanup)
        payload = json.loads(spec.read_text(encoding="utf-8"))
        report_path = root / payload["candidates"]["B1"]["runtime_report"]["path"]
        report = json.loads(report_path.read_text(encoding="utf-8"))
        report["checkpoint_native_reverb_audition"]["level_match"]["gain_source_slot"] = "B1"
        _write_json(report_path, report)
        _rehash_report_and_spec(root, spec, "B1")
        with self.assertRaisesRegex(FullAriAuditionPackError, "gain source must be B0"):
            build_full_ari_yoseong_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )

    def test_rejects_default_BGM_change(self) -> None:
        temporary, root, baseline, spec = _fixture()
        self.addCleanup(temporary.cleanup)
        (root / "public/assets/audio/bgm/bgm.js").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(FullAriAuditionPackError, "default BGM no-touch"):
            build_full_ari_yoseong_audition_pack(
                root, spec, root / "_bgm_rnd/rejected", baseline_revision=baseline
            )


if __name__ == "__main__":
    unittest.main()
