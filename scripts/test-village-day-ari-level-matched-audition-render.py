#!/usr/bin/env python3
"""Actual-source integration gate for the V5 phase/level Daegeum audition."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
import wave
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_level_matched_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_level_matched_actual", SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-daegeum-dir", type=Path, required=True,
                        help="explicit direct Sanjo Daegeum WAVE source directory")
    return parser.parse_args()


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


def main() -> int:
    args = parse_args()
    raw_root = args.raw_daegeum_dir.expanduser().resolve()
    required = {"sanjo_deageum_scale_chung_34.wav", "sanjo_deageum_stacatto_60.wav"}
    if not raw_root.is_dir() or not all((raw_root / name).is_file() for name in required):
        raise SystemExit(f"not the required direct Sanjo Daegeum source collection: {raw_root}")
    module = load_module()
    print("=== BGM R&D-05 — phase/level-matched Daegeum integration gate ===\n")
    with tempfile.TemporaryDirectory(prefix="durango-ari-level-matched-") as temporary:
        output = Path(temporary) / "bundle"
        doc = module.render_audition(raw_root, output)

        check(doc.get("actual_recorded_samples_only") is True,
              "① renderer declares actual recordings only")
        check("no oscillator fallback" in str(doc.get("renderer")),
              "② provenance explicitly forbids oscillator fallback")
        variants = doc.get("variants", [])
        check([item.get("name") for item in variants] == [
            "v4_score_articulated_native_pitch_reference",
            "phase_level_matched_score_articulated_native_pitch",
        ], "③ V4 reference and V5 candidate both render")
        common_gain = doc.get("level_policy", {}).get("common_gain")
        check(isinstance(common_gain, (float, int)) and common_gain > 0,
              "④ one finite common post-mix gain is recorded", repr(common_gain))

        valid = True
        audible = True
        for variant in variants:
            wav = output / variant["wav"]
            try:
                with wave.open(str(wav), "rb") as stream:
                    intact = stream.getnchannels() == 1 and stream.getframerate() == 44100 and stream.getnframes() > 44100
                    frames = stream.readframes(stream.getnframes())
            except (OSError, wave.Error):
                intact, frames = False, b""
            valid &= intact and wav.is_file() and sha256(wav) == variant.get("wav_sha256")
            valid &= float(variant.get("peak_after_common_gain", 2.0)) <= 0.920001
            audible &= any(byte != 0 for byte in frames)
        check(valid, "⑤ each output is an intact mono 44.1 kHz WAV with matching hash and no clip")
        check(audible, "⑥ each output contains recorded audio")

        provenance_path = output / "provenance.json"
        try:
            provenance_text = provenance_path.read_text(encoding="utf-8")
            provenance = json.loads(provenance_text)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            provenance_text, provenance = "", {}
        check(
            provenance.get("source_bank", {}).get("directory_basename") == raw_root.name
            and set(provenance.get("source_bank", {}).get("source_files", [])) == required
            and str(raw_root) not in provenance_text
            and not list(output.parent.glob(f".{output.name}.stage-*")),
            "⑦ provenance is relative-only and staging leaves no partial bundle",
            repr(provenance.get("source_bank")),
        )
        try:
            module.render_audition(raw_root, output)
        except module.v3.AuditionError:
            overwrite_refused = True
        else:
            overwrite_refused = False
        check(overwrite_refused, "⑧ renderer refuses an existing listening-bundle directory")

        candidate = variants[1]
        events = {event["id"]: event for event in candidate["events"]}
        b09 = events["b09_e1"]
        components = b09["components"]
        phase = components[1].get("phase_match", {})
        check(
            [component.get("component") for component in components]
            == ["recorded_staccato_onset_proxy", "recorded_phase_matched_steady_body"]
            and float(phase.get("correlation", -1)) >= 0.70
            and phase.get("crossfade_curve") == "linear_amplitude_complementary"
            and abs(float(components[1].get("tail_after_score_s", -1)) - 0.070) < 1e-6
            and components[1].get("sample", {}).get("wav") == "sanjo_deageum_scale_chung_34.wav",
            "⑨ reattack has an auditable positive-phase direct handoff and its held tail meets 74 complementarily",
            repr(components),
        )
        b10_hold = events["b10_e0"]
        check(
            b10_hold.get("realization") == "continued_recorded_body_without_duplicate_same_pitch_splice"
            and b10_hold.get("continued_from_event") == "b09_e1"
            and b10_hold.get("components") == [],
            "⑩ the same-pitch b10 77 is a true continuation, not another overlapping body",
            repr(b10_hold),
        )
        taper = components[1].get("held_body_taper", {})
        check(
            taper.get("kind") == "score_visible_gentle_held_body_taper"
            and abs(float(taper.get("requested_taper_db", 99))) <= 4.5001
            and abs(float(taper.get("taper_start_s_relative_to_body", -1)) - 0.045) < 1e-6
            and taper.get("target_event_id") == "b10_e1",
            "⑪ the only long-body level curve is bounded and attributed to its next score transition",
            repr(taper),
        )

        metrics = candidate.get("boundary_metrics", [])
        all_native = all(
            item.get("continuity_gate_pass") and item.get("native_breath_attack_gate_pass")
            and item.get("rearticulation_attack_gate_pass") and item.get("onset_declick_gate_pass")
            for item in metrics
        )
        check(all_native, "⑫ inherited click, breath, reattack, and slur continuity gates pass")
        slurs = [item for item in metrics if item.get("kind") == "slur"]
        check(
            len(slurs) == 3 and all(item.get("slur_level_gate_pass")
                and abs(float(item.get("slur_level_delta_db", 99))) <= 1.5001 for item in slurs),
            "⑬ every explicit slur's realized early level is within 1.5 dB across the boundary",
            repr([(item.get("id"), item.get("slur_level_delta_db")) for item in slurs]),
        )
        reattack = next(item for item in metrics if item.get("id") == "b09_e1")
        continuation = next(item for item in metrics if item.get("id") == "b10_e0")
        check(
            reattack.get("reattack_trough_gate_pass")
            and float(reattack.get("reattack_trough_vs_median_db", -99)) >= -3.0001,
            "⑭ after the preserved 50 ms tongue attack, no reattack valley exceeds 3 dB",
            repr(reattack.get("reattack_trough_vs_median_db")),
        )
        check(
            continuation.get("same_pitch_continuation_gate_pass")
            and abs(float(continuation.get("same_pitch_continuation_delta_db", 99))) <= 1.0001,
            "⑮ same-pitch continuation has no duplicate-splice pump",
            repr(continuation.get("same_pitch_continuation_delta_db")),
        )

    print(f"\n=== PASS {passed} / FAIL {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
