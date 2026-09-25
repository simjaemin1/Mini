#!/usr/bin/env python3
"""Contract tests for the fail-closed B0/B1/B2 yoseong audition pack."""

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

from build_yoseong_audition_pack import (  # noqa: E402
    ACTIVE_END_SECONDS,
    CONTROL_RATE_HZ,
    EXPECTED_SAMPLE_RATE_HZ,
    MANIFEST_FILENAME,
    REFERENCE_SCHEMA,
    ROLES,
    SPEC_SCHEMA,
    YoseongAuditionPackError,
    _validate_reference_provenance,
    build_yoseong_audition_pack,
)
from make_blocked_b2_spec import make_blocked_b2_spec  # noqa: E402


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
    result = subprocess.run(
        ["git", "-C", str(root), *arguments],
        check=True,
        capture_output=True,
        text=True,
    )
    return result.stdout.strip()


def _write_wav(path: Path, *, frame_count: int) -> None:
    # Alternating PCM values have a stable -24.00 dBFS RMS to within the
    # packer's explicit 0.02 dB quantization tolerance.
    amplitude = round(32768.0 * 10.0 ** (-24.0 / 20.0))
    raw = bytearray()
    for index in range(frame_count):
        value = amplitude if index % 2 == 0 else -amplitude
        raw.extend(int(value).to_bytes(2, byteorder="little", signed=True))
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(EXPECTED_SAMPLE_RATE_HZ)
        output.setcomptype("NONE", "not compressed")
        output.writeframes(bytes(raw))


def _release_qa() -> dict[str, object]:
    return {
        "passed": True,
        "final_nominal_pitch_gate_passed": True,
        "policy": {
            "phase_continuity": "source_vibrato_clock_continues_without_reset",
            "depth_envelope": "minimum_jerk_to_zero_on_final_control_row",
        },
    }


def _make_runtime(
    root: Path,
    slot: str,
    *,
    audible_yoseong: bool,
) -> tuple[Path, Path]:
    directory = root / "_bgm_rnd" / f"runtime-{slot}"
    directory.mkdir(parents=True)
    plan = root / "_bgm_rnd" / f"{slot}_plan.json"
    plan_payload = {
        "schema": "mini.score-expression.plan.v1",
        "events": [{"id": "tone", "vibrato": {"enabled": audible_yoseong}}],
    }
    _write_json(plan, plan_payload)

    controls = directory / "score_controls_250hz.csv"
    frame_count = round(6.72 * CONTROL_RATE_HZ)
    with controls.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=[
                "frame_index",
                "time_seconds",
                "f0_hz",
                "loudness_linear",
                "voicing",
                "articulation",
                "event_id",
                "vibrato_cents",
            ],
        )
        writer.writeheader()
        for index in range(frame_count):
            release = index >= round(ACTIVE_END_SECONDS * CONTROL_RATE_HZ)
            cents = 0.0
            if audible_yoseong and not release and 200 <= index < 400:
                # The final event row remains exactly nominal; this explicit
                # control evidence distinguishes a selected candidate from
                # metadata-only candidate_off.
                cents = 12.0 * math.sin((index - 200) * math.pi / 100.0)
            writer.writerow({
                "frame_index": index,
                "time_seconds": index / CONTROL_RATE_HZ,
                "f0_hz": 440.0 * 2.0 ** (cents / 1200.0),
                "loudness_linear": 0.04 * (1.0 - (index - 1620) / 60.0) if release else 0.04,
                "voicing": max(0.0, 1.0 - (index - 1620) / 60.0) if release else 1.0,
                "articulation": "release" if release else "slur",
                "event_id": "release" if release else "tone",
                "vibrato_cents": cents,
            })

    audio = directory / "wet.wav"
    _write_wav(audio, frame_count=frame_count * (EXPECTED_SAMPLE_RATE_HZ // CONTROL_RATE_HZ))
    report = {
        "schema": "mini.ddsp-gugak-public-daegeum-runtime.v1",
        "status": "succeeded",
        "scope": {
            "r_and_d_only": True,
            "no_default_bgm_changed": True,
            "not_a_game_asset": True,
        },
        "actions_performed": {
            "default_bgm_changed": False,
            "experimental_hard_f0_step": True,
            "learned_reverb_called": True,
        },
        "checkpoint": {
            "checkpoint": {"sha256": "a" * 64},
            "checkpoint_config": {"sha256": "b" * 64},
            "architecture": {"sample_rate_hz": EXPECTED_SAMPLE_RATE_HZ},
        },
        "public_sources": {
            "ddsp_gugak": {"revision": "source-a"},
            "ddsp_pytorch": {"revision": "source-b"},
        },
        "render": {
            "runtime": {
                "seed": 20260925,
                "device": "cpu",
                "torch": "fixture",
            }
        },
        "score_controls": {
            "renderer_control_hz": CONTROL_RATE_HZ,
            "frame_count": frame_count,
            "slur_transition_policy": {"pitch_mode": "experimental_phase_continuous_hard_f0_step"},
            "release_vibrato_qa": _release_qa(),
        },
        "score_plan": {
            "plan": {"sha256": _sha256(plan)},
            "events": [
                {
                    "id": "tone",
                    "start_seconds": 0.0,
                    "end_seconds": 6.48,
                    "pitch_hz": 440.0,
                    "articulation": "slur",
                    "steady_loudness_db": -28.0,
                    "vibrato": {"enabled": audible_yoseong},
                },
                {
                    "id": "release",
                    "start_seconds": 6.48,
                    "end_seconds": 6.72,
                    "articulation": "release",
                    "steady_loudness_db": -28.0,
                },
            ],
        },
        "checkpoint_native_reverb_audition": {
            "kind": "separate published-checkpoint-native learned-FIR reverb audition",
            "level_match": {
                "target_shared_interval_rms_dbfs": -24.0,
                "shared_interval_start_seconds": 0.0,
                "shared_interval_end_seconds": 6.48,
                "compression_or_limiter": False,
                "clipping_limited": False,
            },
            "runtime": {
                "source": {
                    "component": "unchanged published reverb",
                    "checkpoint_tensor_keys": ["reverb.fir", "reverb.drywet", "reverb.decay"],
                }
            },
        },
        "outputs": {
            "controls_csv": {"basename": controls.name, "sha256": _sha256(controls)},
            "checkpoint_native_reverb_score_length_wav": {
                "basename": audio.name,
                "sha256": _sha256(audio),
            },
        },
    }
    report_path = directory / "runtime_report.json"
    _write_json(report_path, report)
    return report_path, plan


def _artifact(root: Path, path: Path) -> dict[str, str]:
    return {"path": path.relative_to(root).as_posix(), "sha256": _sha256(path)}


def _fixture(*, b1_audible: bool = True) -> tuple[tempfile.TemporaryDirectory[str], Path, str, Path]:
    temporary = tempfile.TemporaryDirectory()
    root = Path(temporary.name)
    _git(root, "init")
    _git(root, "config", "user.email", "test@example.invalid")
    _git(root, "config", "user.name", "Yoseong Test")
    (root / ".gitignore").write_text("_bgm_rnd/\n", encoding="utf-8")
    default_dir = root / "public/assets/audio/bgm"
    default_dir.mkdir(parents=True)
    for name in ("bgm.js", "bgm-loops.js", "render-meta.json"):
        (default_dir / name).write_text(f"fixture {name}\n", encoding="utf-8")
    _git(root, "add", ".gitignore", "public/assets/audio/bgm")
    _git(root, "commit", "-m", "fixture baseline")
    baseline = _git(root, "rev-parse", "HEAD")

    b0_report, b0_plan = _make_runtime(root, "B0", audible_yoseong=False)
    b1_report, b1_plan = _make_runtime(root, "B1", audible_yoseong=b1_audible)
    policy = root / "_bgm_rnd/B1_policy.json"
    _write_json(policy, {
        "expression_policy": {
            "style": "late_gentle_yoseong",
            "automatic_activation": False,
            "default_decision": "off",
            "evidence_status": "literature_informed_but_provisional",
            "active_selection_provenance": {
                "status": "explicit_rnd_audition_opt_in",
                "selected_event_ids": ["tone"],
                "source_policy_rule_id": "gyeonggi.long_structural_note.candidate",
            },
        },
        "fired_policy_rules": [{
            "event_id": "tone",
            "policy_rule_id": "gyeonggi.long_structural_note.candidate",
            "decision": "selected",
        }],
    })
    spec = {
        "schema": SPEC_SCHEMA,
        "candidates": {
            "B0": {
                "status": "ready",
                "role": ROLES["B0"],
                "runtime_report": _artifact(root, b0_report),
                "plan_artifact": _artifact(root, b0_plan),
                "expected_yoseong_event_ids": [],
            },
            "B1": {
                "status": "ready",
                "role": ROLES["B1"],
                "runtime_report": _artifact(root, b1_report),
                "plan_artifact": _artifact(root, b1_plan),
                "policy_manifest": _artifact(root, policy),
                "expected_policy_rule_ids": ["gyeonggi.long_structural_note.candidate"],
                "expected_yoseong_event_ids": ["tone"],
            },
            "B2": {
                "status": "blocked",
                "role": ROLES["B2"],
                "reason": "No verified performance-derived curve is available.",
                "unmet_requirements": [
                    "fingerprinted source performance",
                    "measured curve with reviewed R&D-use scope",
                ],
            },
        },
    }
    spec_path = root / "tools/audition_spec.json"
    _write_json(spec_path, spec)
    return temporary, root, baseline, spec_path


class YoseongAuditionPackTests(unittest.TestCase):
    def test_spec_generator_hashes_inputs_and_blocks_b2(self) -> None:
        temporary, root, _, original_spec = _fixture()
        self.addCleanup(temporary.cleanup)
        original = json.loads(original_spec.read_text(encoding="utf-8"))
        b0 = original["candidates"]["B0"]
        b1 = original["candidates"]["B1"]
        generated_path = root / "_bgm_rnd/generated_spec.json"
        generated = make_blocked_b2_spec(
            root,
            generated_path,
            b0_runtime_report=root / b0["runtime_report"]["path"],
            b0_plan=root / b0["plan_artifact"]["path"],
            b1_runtime_report=root / b1["runtime_report"]["path"],
            b1_plan=root / b1["plan_artifact"]["path"],
            b1_policy_manifest=root / b1["policy_manifest"]["path"],
            b1_rule_ids=b1["expected_policy_rule_ids"],
            b1_event_ids=b1["expected_yoseong_event_ids"],
        )
        self.assertTrue(generated_path.is_file())
        self.assertEqual(generated["candidates"]["B0"]["runtime_report"], b0["runtime_report"])
        self.assertEqual(generated["candidates"]["B1"]["policy_manifest"], b1["policy_manifest"])
        self.assertEqual(generated["candidates"]["B2"]["status"], "blocked")

    def test_builds_deterministic_b0_b1_pack_and_keeps_b2_blocked(self) -> None:
        temporary, root, baseline, spec = _fixture()
        self.addCleanup(temporary.cleanup)
        source_hashes = {path: _sha256(path) for path in (root / "_bgm_rnd").rglob("*") if path.is_file()}
        first_dir = root / "_bgm_rnd/pack-first"
        second_dir = root / "_bgm_rnd/pack-second"
        first = build_yoseong_audition_pack(root, spec, first_dir, baseline_revision=baseline)
        second = build_yoseong_audition_pack(root, spec, second_dir, baseline_revision=baseline)

        self.assertEqual(first, second)
        self.assertEqual(first["status"], "succeeded_with_blocked_B2")
        self.assertTrue(first["comparison_contract"]["same_loudness_voicing_timing_and_articulation_controls"])
        self.assertEqual(first["candidates"]["B0"]["controls"]["nonzero_vibrato_frame_count"], 0)
        self.assertGreater(first["candidates"]["B1"]["controls"]["nonzero_vibrato_frame_count"], 0)
        self.assertTrue(first["candidates"]["B1"]["selected_yoseong_end_taper_qa"]["passed"])
        self.assertEqual(first["candidates"]["B2"]["status"], "BLOCKED")
        self.assertTrue(first["candidates"]["B2"]["no_placeholder_audio_generated"])
        self.assertTrue((first_dir / "B2_BLOCKED.json").is_file())
        self.assertFalse((first_dir / "B2_hard_step_reference_derived_yoseong_fixed_release.wav").exists())
        self.assertEqual(
            (first_dir / MANIFEST_FILENAME).read_bytes(),
            (second_dir / MANIFEST_FILENAME).read_bytes(),
        )
        for source, before in source_hashes.items():
            self.assertEqual(_sha256(source), before)

    def test_rejects_metadata_only_b1_without_audible_controls(self) -> None:
        temporary, root, baseline, spec = _fixture(b1_audible=False)
        self.addCleanup(temporary.cleanup)
        output = root / "_bgm_rnd/must-not-exist"
        with self.assertRaisesRegex(YoseongAuditionPackError, "audible yoseong event ids"):
            build_yoseong_audition_pack(root, spec, output, baseline_revision=baseline)
        self.assertFalse(output.exists())

    def test_default_bgm_guard_rejects_uncommitted_change(self) -> None:
        temporary, root, baseline, spec = _fixture()
        self.addCleanup(temporary.cleanup)
        (root / "public/assets/audio/bgm/bgm.js").write_text("changed\n", encoding="utf-8")
        with self.assertRaisesRegex(YoseongAuditionPackError, "default BGM no-touch guard failed"):
            build_yoseong_audition_pack(
                root,
                spec,
                root / "_bgm_rnd/must-not-exist",
                baseline_revision=baseline,
            )

    def test_reference_candidate_rejects_placeholder_provenance(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            curve = root / "curve.csv"
            curve.write_text("time_seconds,cents\n0,0\n", encoding="utf-8")
            provenance = root / "provenance.json"
            _write_json(provenance, {
                "schema": REFERENCE_SCHEMA,
                "status": "verified",
                "placeholder_or_hand_authored_proxy": True,
                "derivation_kind": "reference_extracted_f0_curve",
                "source_records": [{"source_id": "x", "sha256": "a" * 64, "byte_length": 1}],
                "rights_scope": {"r_and_d_use_reviewed": True},
                "curve_artifact": {"sha256": _sha256(curve)},
            })
            with self.assertRaisesRegex(YoseongAuditionPackError, "placeholder"):
                _validate_reference_provenance(
                    provenance,
                    {"sha256": _sha256(curve)},
                )


if __name__ == "__main__":
    unittest.main()
