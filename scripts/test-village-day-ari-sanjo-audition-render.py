#!/usr/bin/env python3
"""Actual-source integration gate for the Sanjo Ari articulation audition.

This intentionally needs a locally restored ``samples_daegeum`` directory.
It never fabricates a tone when that source is unavailable.
"""

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
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_sanjo_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_audition_actual", SCRIPT)
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
    parser.add_argument("--bank", type=Path, required=True,
                        help="explicit restored Sanjo samples_daegeum directory")
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
    bank = args.bank.expanduser().resolve()
    if not (bank / "_index.json").is_file():
        raise SystemExit(f"not a restored Sanjo sample bank: {bank}")
    module = load_module()
    print("=== BGM R&D-03 — actual Sanjo Ari audition integration gate ===\n")
    with tempfile.TemporaryDirectory(prefix="durango-ari-audition-") as temporary:
        output = Path(temporary) / "bundle"
        doc = module.render_audition(bank, output)

        check(doc.get("actual_recorded_samples_only") is True,
              "① renderer declares actual recordings only")
        check("no oscillator fallback" in str(doc.get("renderer")),
              "② renderer provenance explicitly forbids oscillator fallback")
        variants = doc.get("variants", [])
        check([variant.get("name") for variant in variants] == [
            "all_sustain_heads", "all_steady_crossfades", "score_articulated"
        ], "③ all three controlled listening variants render")
        common_gain = doc.get("level_policy", {}).get("common_gain")
        check(isinstance(common_gain, (float, int)) and common_gain > 0,
              "④ one finite common post-mix gain is recorded", repr(common_gain))

        all_valid = True
        all_audible = True
        for variant in variants:
            wav = output / variant["wav"]
            try:
                with wave.open(str(wav), "rb") as stream:
                    valid = (stream.getnchannels() == 1 and stream.getframerate() == 44100
                             and stream.getnframes() > 44100)
                    frames = stream.readframes(stream.getnframes())
            except (OSError, wave.Error):
                valid, frames = False, b""
            all_valid &= valid and wav.is_file() and sha256(wav) == variant.get("wav_sha256")
            all_audible &= any(byte != 0 for byte in frames)
            all_valid &= float(variant.get("peak_after_common_gain", 2)) <= 0.920001
        check(all_valid, "⑤ each variant is an intact mono 44.1 kHz WAV with matching hash and no clip")
        check(all_audible, "⑥ each rendered WAV contains recorded audio")

        provenance_path = output / "provenance.json"
        try:
            provenance_text = provenance_path.read_text(encoding="utf-8")
            published = provenance_path.is_file() and json.loads(provenance_text)
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            provenance_text, published = "", None
        check(
            bool(published)
            and published.get("source_bank", {}).get("directory_basename") == bank.name
            and str(bank) not in provenance_text
            and not list(output.parent.glob(f".{output.name}.stage-*")),
            "⑦ published provenance is relative-only and staging leaves no partial bundle",
        )
        try:
            module.render_audition(bank, output)
        except module.AuditionError:
            overwrite_refused = True
        else:
            overwrite_refused = False
        check(
            overwrite_refused,
            "⑧ renderer refuses an existing output directory instead of overwriting a listening bundle",
        )

        by_name = {variant["name"]: variant for variant in variants}
        candidate_events = {event["id"]: event for event in by_name["score_articulated"]["events"]}
        reattack = candidate_events["b09_e1"]
        components = reattack["components"]
        check(
            [component["component"] for component in components]
            == ["recorded_staccato_onset_proxy", "recorded_steady_sustain_body"],
            "⑨ rearticulation uses a distinct staccato onset then steady body",
            repr([component["component"] for component in components]),
        )
        onset = components[0]["sample"]
        check(
            onset.get("wav") == "대금_sanjo_deageum_stacatto_60.wav"
            and onset.get("recorded_source_crop_s") == [10.73, 11.05]
            and abs(float(onset.get("pitch_shift_cents", 999))) < 10,
            "⑩ tongue onset preserves the audited native 77 pre-onset/attack, not the mis-tagged multi-note trim",
            repr(onset),
        )
        slur_events = [candidate_events[event_id] for event_id in ("b10_e0", "b10_e1", "b10_e2")]
        check(
            all(event["planned_kind"] == "slur"
                and [component["component"] for component in event["components"]]
                == ["recorded_steady_sustain_body"]
                and abs(event["components"][0]["fade_in_s"] - module.SLUR_XFADE_S) < 1e-12
                for event in slur_events),
            "⑪ explicitly marked slurs alone enter steady bodies with the declared crossfade",
        )
        head_reattack = next(event for event in by_name["all_sustain_heads"]["events"]
                              if event["id"] == "b09_e1")
        check(
            head_reattack["components"][0]["component"] == "recorded_full_sustain_head",
            "⑫ choppy reference retains the full-head behavior being tested against",
        )
        all_components = [component for variant in variants for event in variant["events"]
                          for component in event["components"]]
        check(
            all(abs(float(component["sample"]["pitch_shift_cents"])) <= module.MAX_PITCH_SHIFT_CENTS + 1e-6
                and component["sample"]["instrument"] == "daegeum"
                and component["sample"].get("wav_sha256")
                for component in all_components),
            "⑬ every actual component stays within pitch cap and has Daegeum SHA provenance",
        )
        check(
            doc.get("timing_policy", {}).get("next_score_onsets_are_never_moved") is True
            and abs(reattack["score_start_s"] - 3.6) < 1e-12
            and abs(reattack["components"][1]["timeline_offset_s"] - module.TONGUE_BODY_START_S) < 1e-12,
            "⑭ tongue/body layering keeps the authored reattack onset fixed on the score grid",
        )
        metrics = by_name["score_articulated"].get("boundary_metrics", [])
        slur_metrics = [metric for metric in metrics if metric.get("kind") == "slur"]
        check(
            len(slur_metrics) == 3
            and all(metric.get("continuity_gate_pass")
                    and float(metric.get("pre_30ms_rms", 0)) >= 0.010
                    and float(metric.get("post_30ms_rms", 0)) >= 0.010
                    for metric in slur_metrics),
            "⑮ declared slurs pass the no-unintended-silent-hole measurement",
            repr(slur_metrics),
        )
        declick_metrics = [metric for metric in metrics if metric.get("onset_declick_required")]
        check(
            declick_metrics
            and all(metric.get("onset_declick_gate_pass")
                    and float(metric.get("onset_sample_step", 1.0)) <= 1e-4
                    for metric in declick_metrics)
            and abs(doc.get("timing_policy", {}).get("onset_declick_s", 0)
                    - module.ONSET_DECLICK_S) < 1e-12,
            "⑯ onset crops are de-clicked without moving the score onset",
            repr(declick_metrics),
        )

    print(f"\n=== PASS {passed} / FAIL {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
