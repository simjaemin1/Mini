#!/usr/bin/env python3
"""Render the second actual-Daegeum Ari articulation audition.

This is deliberately a follow-up to ``render_village_day_ari_sanjo_audition``
rather than a replacement for it.  The first audition established that a new
breath, a tongue re-attack, and an explicit slur cannot all use one generic
sample entry.  While auditing the user's complete local National Gugak Center
download corpus, we found the untrimmed Sanjo Daegeum take
``sanjo_deageum_scale_chung_34.wav``.  It supplies the exact score pitches
used in browser ``village_day / ari`` bars 8--10 much more closely than the
older restored mini-bank did.

The result is still a listening experiment, *not* a product replacement:

* every source region is a manually audited raw-recording interval;
* 77 -> 74 -> 72 still has no matching recorded natural fingering triple, so
  it remains an explicitly labelled steady-body crossfade; and
* no game runtime code, default BGM, raw source file, or asset manifest is
  changed by this script.

The input must be the direct local Daegeum source collection (currently the
user's ``monotone-6`` folder), not an inferred or copied game asset:

    python3 render_village_day_ari_native_pitch_audition.py --dry-run
    python3 render_village_day_ari_native_pitch_audition.py \
      --raw-daegeum-dir /path/to/monotone-6 \
      --output-dir /tmp/village-day-ari-native-pitch
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
import warnings
from pathlib import Path
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import render_village_day_ari_sanjo_audition as v3  # noqa: E402


SCHEMA = "durango.village-day-ari-native-pitch-articulation-audition.v1"
SOURCE_LABEL = (
    "National Gugak Center digital instrument sound archive "
    "(user-local direct Sanjo Daegeum source collection)"
)

# These intervals were audited from the direct 48 kHz stereo source.  The
# shared reader resamples it to the renderer's 44.1 kHz timeline, but seconds
# stay the source-time authority.  Each sustain includes a genuine head and a
# later clean steady interval.  All four targets use one scale_chung take, so
# the mic, player, room, and broad tone are matched before any score splice.
NATIVE_SUSTAIN_SOURCES: dict[float, dict[str, Any]] = {
    70.0: {
        "wav": "sanjo_deageum_scale_chung_34.wav",
        "midi": 69.97,
        "head_start_s": 27.700,
        "head_end_s": 31.380,
        "body_start_s": 28.200,
        "body_end_s": 31.150,
    },
    72.0: {
        "wav": "sanjo_deageum_scale_chung_34.wav",
        "midi": 72.35,
        "head_start_s": 42.550,
        "head_end_s": 46.435,
        "body_start_s": 43.050,
        "body_end_s": 46.200,
    },
    74.0: {
        "wav": "sanjo_deageum_scale_chung_34.wav",
        "midi": 74.97,
        "head_start_s": 49.750,
        "head_end_s": 53.600,
        "body_start_s": 50.250,
        "body_end_s": 53.350,
    },
    77.0: {
        "wav": "sanjo_deageum_scale_chung_34.wav",
        "midi": 76.82,
        "head_start_s": 56.650,
        "head_end_s": 61.000,
        "body_start_s": 57.250,
        "body_end_s": 60.750,
    },
}

# A separately recorded tongue attack is still more appropriate than using a
# new full phrase head at b09_e1.  It is intentionally kept as a proxy: the
# archive does not contain a paired tongue/steady take at every score note.
NATIVE_TONGUE_SOURCES: dict[float, dict[str, Any]] = {
    77.0: {
        "wav": "sanjo_deageum_stacatto_60.wav",
        "midi": 76.82,
        "head_start_s": 10.740,
        "head_end_s": 11.035,
    },
}


def _source_file(root: Path, name: str) -> Path:
    path = (root / name).resolve()
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise v3.AuditionError(f"raw source path escapes explicit root: {name}") from exc
    if not path.is_file():
        raise v3.AuditionError(f"missing audited raw Daegeum source: {name}")
    if path.suffix.lower() != ".wav":
        raise v3.AuditionError(f"{name}: this renderer requires the direct WAV source, not a re-encode")
    return path


def _float_spec(spec: Mapping[str, Any], key: str) -> float:
    try:
        value = float(spec[key])
    except (KeyError, TypeError, ValueError) as exc:
        raise v3.AuditionError(f"raw source specification has no finite {key!r}") from exc
    if not math.isfinite(value):
        raise v3.AuditionError(f"raw source specification has non-finite {key!r}")
    return value


def _raw_interval_material(
    *,
    role: str,
    root: Path,
    spec: Mapping[str, Any],
    articulation: str,
    sampler_module: Any,
    np: Any,
) -> v3.Material:
    """Make one audited raw head/body or tongue material without scanning it.

    A generic auto-scan would obscure the source-time decision and can split a
    multi-note scale recording at the wrong musical event.  These intervals
    remain small enough to audit and are recorded in provenance verbatim.
    """
    try:
        name = str(spec["wav"])
    except KeyError as exc:
        raise v3.AuditionError("raw source specification lacks WAV name") from exc
    head_start = _float_spec(spec, "head_start_s")
    head_end = _float_spec(spec, "head_end_s")
    source_midi = _float_spec(spec, "midi")
    if not (0.0 <= head_start < head_end):
        raise v3.AuditionError(f"{name}: invalid audited head interval")
    path = _source_file(root, name)
    # The direct WAVE originals carry an ancillary metadata chunk which
    # SciPy's reader intentionally skips after warning.  It is not audio data
    # and does not justify obscuring a successful render with a scary warning.
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", message=r"Chunk .* not understood", category=UserWarning)
        source = sampler_module.read_wav(str(path), stereo=False)
    if getattr(source, "ndim", 1) != 1:
        raise v3.AuditionError(f"{name}: expected mono or dual-mono recording")
    sample_rate = int(sampler_module.SR)
    a = int(round(head_start * sample_rate))
    b = int(round(head_end * sample_rate))
    minimum_seconds = 0.35 if articulation == "sus" else 0.12
    if a < 0 or b > len(source) or b - a < int(minimum_seconds * sample_rate):
        raise v3.AuditionError(f"{name}: audited head interval falls outside usable recorded audio")
    signal = source[a:b].astype(np.float32)

    body_start: float | None = None
    body_end: float | None = None
    if articulation == "sus":
        source_body_start = _float_spec(spec, "body_start_s")
        source_body_end = _float_spec(spec, "body_end_s")
        if not (head_start <= source_body_start < source_body_end <= head_end):
            raise v3.AuditionError(f"{name}: steady interval must lie inside audited head interval")
        body_start = source_body_start - head_start
        body_end = source_body_end - head_start
        if body_end - body_start < 0.70:
            raise v3.AuditionError(f"{name}: audited steady interval is too short")
        probe_start = int(round((body_start + 0.05) * sample_rate))
        probe_end = min(int(round((body_start + 0.55) * sample_rate)), len(signal))
    elif articulation == "staccato":
        probe_start = int(round(0.020 * sample_rate))
        probe_end = min(int(round(0.100 * sample_rate)), len(signal))
    else:
        raise v3.AuditionError(f"{name}: unsupported direct raw articulation {articulation!r}")
    measured_rms = v3._rms(signal[probe_start:probe_end])
    if measured_rms < 1e-5:
        raise v3.AuditionError(f"{name}: calibration window is silent")
    gain = float(np.clip(v3.STEADY_TARGET_RMS / measured_rms, 0.35, 3.0))
    return v3.Material(
        role=role,
        path=path,
        meta={
            "wav": name,
            "src": name,
            "inst": "daegeum",
            "art": articulation,
            "source_crop_s": [head_start, head_end],
            "source_body_span_s": (
                None if body_start is None else [source_body_start, source_body_end]
            ),
        },
        source_midi=source_midi,
        signal=signal,
        sample_rate=sample_rate,
        body_start_s=body_start,
        body_end_s=body_end,
        calibration_gain=gain,
        calibration_rms=measured_rms,
    )


def _load_materials(root: Path, sampler_module: Any, np: Any) -> tuple[dict[float, v3.Material], dict[float, v3.Material]]:
    sustains = {
        target: _raw_interval_material(
            role="native_pitch_sustain",
            root=root,
            spec=spec,
            articulation="sus",
            sampler_module=sampler_module,
            np=np,
        )
        for target, spec in NATIVE_SUSTAIN_SOURCES.items()
    }
    tongues = {
        target: _raw_interval_material(
            role="native_pitch_tongue_onset",
            root=root,
            spec=spec,
            articulation="staccato",
            sampler_module=sampler_module,
            np=np,
        )
        for target, spec in NATIVE_TONGUE_SOURCES.items()
    }
    rates = {material.sample_rate for material in (*sustains.values(), *tongues.values())}
    if len(rates) != 1:
        raise v3.AuditionError("audited direct source intervals did not resolve to one sample rate")
    return sustains, tongues


def dry_run_document() -> dict[str, Any]:
    base = v3.dry_run_document()
    browser_score = dict(base["browser_score"])
    browser_score["source_revision"] = (
        "v4 uses direct native/near-native pitch intervals from the raw source collection; "
        "70/72/74/77 share scale_chung, and this is not a runtime replacement"
    )
    return {
        "schema": f"{SCHEMA}.dry-run",
        "actual_render": False,
        "requires_explicit_raw_daegeum_root": True,
        "fallback": "forbidden",
        "browser_score": browser_score,
        "performance_events": base["performance_events"],
        "variants": [
            "all_sustain_heads",
            "all_steady_crossfades",
            "score_articulated_native_pitch",
        ],
        "source_policy": {
            "bank": "one direct Sanjo Daegeum scale_chung take plus direct raw staccato onset",
            "max_pitch_shift_cents": v3.MAX_PITCH_SHIFT_CENTS,
            "sustain_source_map": NATIVE_SUSTAIN_SOURCES,
            "tongue_source_map": NATIVE_TONGUE_SOURCES,
            "not_a_natural_transition_claim": "77->74->72 remains a labelled crossfade, not retrieved fingering data",
        },
    }


def _native_boundary_metrics(signal: Any, plans: Sequence[Mapping[str, Any]], sample_rate: int) -> list[dict[str, Any]]:
    """Keep v3's hole/click checks but respect a recorded breath ramp.

    The v3 mini-bank heads happened to be audible within the first 30 ms.  A
    direct raw Daegeum breath is physically quieter there and reaches its
    stable attack energy roughly 70--120 ms after the score onset.  Treating
    that measured ramp as a failure would tempt a renderer to replace it with
    an artificial hard attack.  The v4 gate therefore uses the same settled
    window already used for a tongue re-attack, while retaining v3's de-click
    and slur continuity gates.
    """
    metrics = v3._boundary_metrics(signal, plans, sample_rate)
    for item in metrics:
        is_breath = item["kind"] == "breath_start"
        item["native_breath_attack_window"] = "70_to_120ms"
        item["native_breath_attack_gate_pass"] = (
            not is_breath or float(item["post_70_to_120ms_rms"]) >= 0.010
        )
    return metrics


def render_audition(raw_daegeum_root: str | Path, output_dir: str | Path) -> dict[str, Any]:
    """Render native/near-native-pitch controls and the score-aware candidate."""
    root = Path(raw_daegeum_root).expanduser().resolve()
    if not root.is_dir():
        raise v3.AuditionError(f"--raw-daegeum-dir must be a direct source directory: {root}")
    np, sps, sampler_module = v3._load_audio_modules()
    sustains, tongues = _load_materials(root, sampler_module, np)
    sample_rate = int(sampler_module.SR)
    score = v3.default_score()
    plans, _lookup = v3._score_plans(score)
    variants = (
        ("all_sustain_heads", "01_all_sustain_heads.wav"),
        ("all_steady_crossfades", "02_all_steady_crossfades.wav"),
        ("score_articulated", "03_score_articulated_native_pitch.wav"),
    )
    raw_variants = [
        (name, *v3._render_variant(name, plans, sustains, tongues, np=np, sps=sps, sample_rate=sample_rate))
        for name, _file in variants
    ]
    global_peak = max(float(np.max(np.abs(signal))) for _name, signal, _events in raw_variants)
    common_gain = 1.0 if global_peak <= v3.OUTPUT_PEAK_LIMIT else v3.OUTPUT_PEAK_LIMIT / global_peak
    if not math.isfinite(common_gain) or common_gain <= 0:
        raise v3.AuditionError("invalid common post-mix gain")

    output = Path(output_dir).expanduser().resolve()
    if output.exists():
        raise v3.AuditionError(
            f"--output-dir must not already exist: {output}. Choose a fresh R&D directory "
            "so listening artifacts cannot overwrite a prior result."
        )
    if not output.parent.is_dir():
        raise v3.AuditionError(f"--output-dir parent does not exist: {output.parent}")
    filenames = dict(variants)
    with tempfile.TemporaryDirectory(prefix=f".{output.name}.stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        rendered: list[dict[str, Any]] = []
        for name, signal, events in raw_variants:
            normalized = (signal * common_gain).astype(np.float32)
            peak = float(np.max(np.abs(normalized))) if len(normalized) else 0.0
            if peak > v3.OUTPUT_PEAK_LIMIT + 1e-6:
                raise v3.AuditionError(f"{name}: common gain did not prevent clipping")
            metrics = _native_boundary_metrics(normalized, plans, sample_rate)
            if name == "score_articulated" and not all(
                item["continuity_gate_pass"] and item["native_breath_attack_gate_pass"]
                and item["rearticulation_attack_gate_pass"] and item["onset_declick_gate_pass"]
                for item in metrics
            ):
                raise v3.AuditionError("native-pitch candidate has a measured hole or click at a declared boundary")
            wav = stage / filenames[name]
            v3._write_pcm16(wav, normalized, sample_rate)
            rendered.append({
                "name": "score_articulated_native_pitch" if name == "score_articulated" else name,
                "wav": filenames[name],
                "wav_sha256": v3.sha256_file(wav),
                "seconds": round(len(normalized) / sample_rate, 6),
                "peak_after_common_gain": peak,
                "events": events,
                "boundary_metrics": metrics,
            })
        document = {
            "schema": SCHEMA,
            "actual_recorded_samples_only": True,
            "renderer": (
                "direct recorded-WAV interval crop/static pitch-resample/envelope/crossfade; "
                "no sampler.Voices/install, no oscillator fallback, no reverb, no synthesized vibrato"
            ),
            "source_attribution": SOURCE_LABEL,
            "browser_score": dry_run_document()["browser_score"],
            "source_bank": {
                "identity": "explicit direct local raw Daegeum source; raw source is not embedded",
                "directory_basename": root.name,
                "source_files": sorted({spec["wav"] for spec in (*NATIVE_SUSTAIN_SOURCES.values(), *NATIVE_TONGUE_SOURCES.values())}),
            },
            "timing_policy": {
                "slur_xfade_s": v3.SLUR_XFADE_S,
                "rearticulate_previous_release_inside_score_s": v3.REARTICULATE_RELEASE_S,
                "tongue_body_start_s": v3.TONGUE_BODY_START_S,
                "tongue_body_xfade_s": v3.TONGUE_XFADE_S,
                "onset_declick_s": v3.ONSET_DECLICK_S,
                "raw_breath_attack_measurement_window": "70_to_120ms",
                "next_score_onsets_are_never_moved": True,
            },
            "level_policy": {
                "source_calibration": "fixed per manually audited recorded interval",
                "post_mix_gain_is_common_to_all_variants": True,
                "peak_before_common_gain": global_peak,
                "common_gain": common_gain,
                "peak_limit": v3.OUTPUT_PEAK_LIMIT,
            },
            "variants": rendered,
            "known_limitations": [
                "The exact 77->74->72 natural fingering sequence is absent from the direct source collection.",
                "The candidate therefore uses labelled steady-body crossfades only at explicit score slurs; this is not a recorded natural transition claim.",
                "The 77 re-articulation uses a separately recorded staccato onset plus a recorded steady body, so it remains a labelled articulation proxy rather than paired-gesture proof.",
                "This is a manual R&D score interpretation and does not read, replace, or assert parity with bgm.js runtime articulation.",
            ],
        }
        (stage / "provenance.json").write_text(
            json.dumps(v3._json_value(document), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        stage.rename(output)
    return document


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-daegeum-dir", type=Path,
                        help="explicit direct raw Sanjo Daegeum source folder; required unless --dry-run")
    parser.add_argument("--output-dir", type=Path, default=Path("out_village_day_ari_native_pitch_audition"),
                        help="fresh directory for three WAVs plus provenance.json")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the score/source contract without audio dependencies")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.dry_run:
            print(json.dumps(dry_run_document(), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.raw_daegeum_dir is None:
            raise v3.AuditionError("--raw-daegeum-dir is required for actual audio; use --dry-run otherwise")
        document = render_audition(args.raw_daegeum_dir, args.output_dir)
    except v3.AuditionError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "common_gain": document["level_policy"]["common_gain"],
        "outputs": [{"name": item["name"], "wav": item["wav"], "sha256": item["wav_sha256"]}
                    for item in document["variants"]],
    }, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
