#!/usr/bin/env python3
"""Actual-direct-source integration gate for the native-pitch Ari audition.

This test never generates a sound if the user-local original WAVE collection
is absent.  It is intentionally separate from the v3 restored-mini-bank test:
the source timeline, source provenance, and pitch audit differ.
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
SCRIPT = ROOT / "public" / "assets" / "audio" / "bgm" / "render_village_day_ari_native_pitch_audition.py"
BGM = SCRIPT.parent


def load_module():
    sys.path.insert(0, str(BGM))
    spec = importlib.util.spec_from_file_location("village_day_ari_native_pitch_actual", SCRIPT)
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
    print("=== BGM R&D-04 — direct-WAV native-pitch Ari integration gate ===\n")
    with tempfile.TemporaryDirectory(prefix="durango-ari-native-pitch-") as temporary:
        output = Path(temporary) / "bundle"
        doc = module.render_audition(raw_root, output)

        check(doc.get("actual_recorded_samples_only") is True,
              "① renderer declares actual recordings only")
        check("no oscillator fallback" in str(doc.get("renderer")),
              "② provenance explicitly forbids oscillator fallback")
        variants = doc.get("variants", [])
        check([variant.get("name") for variant in variants] == [
            "all_sustain_heads", "all_steady_crossfades", "score_articulated_native_pitch"
        ], "③ all controlled native-pitch listening variants render")
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
        check(all_valid, "⑤ each output is an intact mono 44.1 kHz WAV with matching hash and no clip")
        check(all_audible, "⑥ each output contains recorded audio")

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

        by_name = {variant["name"]: variant for variant in variants}
        candidate = by_name["score_articulated_native_pitch"]
        events = {event["id"]: event for event in candidate["events"]}
        all_components = [component for event in candidate["events"] for component in event["components"]]
        sustain_components = [component for component in all_components
                              if component["component"] != "recorded_staccato_onset_proxy"]
        check(
            sustain_components
            and all(component["sample"]["wav"] == "sanjo_deageum_scale_chung_34.wav"
                    for component in sustain_components),
            "⑨ every head/body comes from the one audited direct scale_chung take",
            repr([component["sample"]["wav"] for component in sustain_components]),
        )
        shifts = [abs(float(component["sample"]["pitch_shift_cents"])) for component in all_components]
        check(
            shifts and max(shifts) <= 100.0001
            and abs(float(events["b09_e0"]["components"][0]["sample"]["pitch_shift_cents"]) - 18.0) < 0.01,
            "⑩ all candidate source moves stay at or below 100 cents; the 77 head is +18 cents",
            repr(shifts),
        )
        reattack = events["b09_e1"]
        check(
            [component["component"] for component in reattack["components"]]
            == ["recorded_staccato_onset_proxy", "recorded_steady_sustain_body"]
            and reattack["components"][0]["sample"]["recorded_source_crop_s"] == [10.74, 11.035],
            "⑪ reattack remains a distinct direct raw tongue onset plus recorded steady body",
            repr(reattack["components"]),
        )
        slurs = [events[event_id] for event_id in ("b10_e0", "b10_e1", "b10_e2")]
        check(
            all(event["planned_kind"] == "slur"
                and [component["component"] for component in event["components"]]
                == ["recorded_steady_sustain_body"]
                for event in slurs),
            "⑫ only explicit score slurs enter steady bodies", repr(slurs),
        )
        metrics = candidate.get("boundary_metrics", [])
        breaths = [metric for metric in metrics if metric.get("kind") == "breath_start"]
        check(
            len(breaths) == 2
            and all(metric.get("native_breath_attack_gate_pass")
                    and metric.get("native_breath_attack_window") == "70_to_120ms"
                    and float(metric.get("post_70_to_120ms_rms", 0)) >= 0.010
                    for metric in breaths)
            and any(float(metric.get("post_30ms_rms", 1)) < 0.010 for metric in breaths),
            "⑬ raw breath ramps pass their settled-energy gate without forced hard 30 ms attacks",
            repr(breaths),
        )
        slur_metrics = [metric for metric in metrics if metric.get("kind") == "slur"]
        check(
            len(slur_metrics) == 3
            and all(metric.get("continuity_gate_pass")
                    and float(metric.get("pre_30ms_rms", 0)) >= 0.010
                    and float(metric.get("post_30ms_rms", 0)) >= 0.010
                    for metric in slur_metrics),
            "⑭ explicit slurs pass the no-silent-hole measurement", repr(slur_metrics),
        )
        reattack_metric = next(metric for metric in metrics if metric.get("id") == "b09_e1")
        check(
            reattack_metric.get("rearticulation_attack_gate_pass")
            and reattack_metric.get("onset_declick_gate_pass")
            and float(reattack_metric.get("post_70_to_120ms_rms", 0)) >= 0.010,
            "⑮ direct tongue onset is de-clicked and settles into audible reattack energy",
            repr(reattack_metric),
        )

    print(f"\n=== PASS {passed} / FAIL {failed} ===")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
