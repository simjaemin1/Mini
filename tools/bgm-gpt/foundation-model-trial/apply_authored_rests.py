"""Explicit authored rest envelope, NOT learned breathing or pitch correction.

Preserve the raw model output. Only apply this to a separate copy after its
pitch-preservation gate passes. No EQ, AGC, source mixing, time or pitch edits.
"""
import argparse
import json
import math
import os
from pathlib import Path

import numpy as np
import soundfile as sf

from ace_runtime import sha256_file


def rest_envelope(frames, rate, plan, fade_seconds=.01):
    if rate != 48000 or frames != 921600 or fade_seconds != .01:
        raise ValueError("Fixed 19.2s/48k/10ms authored-envelope trial required")
    rests = [e for e in plan["events"] if e["articulation"] == "release"]
    if len(rests) != 4:
        raise ValueError("Exactly four written rests required")
    envelope = np.ones(frames, dtype=np.float64)
    fade = round(fade_seconds * rate)
    for rest in rests:
        start, end = (math.ceil(rest[k] * rate) for k in ("start_seconds", "end_seconds"))
        if not 0 < start < end <= frames:
            raise ValueError("Invalid authored rest")
        envelope[start:end] = 0
        n = min(fade, start)
        u = np.arange(n, dtype=np.float64) / n
        envelope[start-n:start] *= 1 - u**3 * (10 - 15*u + 6*u*u)
        n = min(fade, frames-end)
        if n:
            u = np.arange(n, dtype=np.float64) / n
            envelope[end:end+n] *= u**3 * (10 - 15*u + 6*u*u)
    return envelope


def apply(raw, plan, output, pitch_report):
    os.umask(0o077)
    raw, plan, output = map(Path, (raw, plan, output))
    if output.exists() or not output.is_absolute():
        raise ValueError("Fresh absolute output path required")
    report = json.loads(Path(pitch_report).read_text())
    if (report["binding"]["candidate_sha256"] != sha256_file(raw) or
            report["binding"]["plan_sha256"] != sha256_file(plan) or
            not all(report[k]["pitch_passed"] for k in ("full_19p2s", "first_4p8s"))):
        raise ValueError("Unchanged raw output must pass both pitch gates first")
    before = sha256_file(raw)
    audio, rate = sf.read(raw, dtype="float32", always_2d=True)
    if audio.shape[1] != 2 or not np.isfinite(audio).all():
        raise ValueError("Finite stereo model output required")
    envelope = rest_envelope(len(audio), rate, json.loads(plan.read_text()))
    sf.write(output, (audio * envelope[:, None]).astype("float32"), rate, subtype="FLOAT")
    if before != sha256_file(raw):
        raise RuntimeError("Raw input changed")
    facts = {"raw_path": str(raw), "raw_sha256": before, "output_sha256": sha256_file(output),
             "plan_sha256": sha256_file(plan), "processing": "four authored rests; 10ms minimum-jerk release before rest and attack after rest; rest samples zero",
             "learned_breathing": False, "pitch_time_EQ_AGC_or_source_mixing": False,
             "script_sha256": sha256_file(__file__)}
    output.with_suffix(".json").write_text(json.dumps(facts, indent=2) + "\n")
    print(json.dumps({"output": str(output), "raw_preserved": True}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("raw", "plan", "output", "pitch-report"):
        parser.add_argument("--" + name, required=True, type=Path)
    args = parser.parse_args()
    apply(args.raw, args.plan, args.output, args.pitch_report)
