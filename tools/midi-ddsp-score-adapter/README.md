# Authorial MIDI-DDSP score adapter (R&D-only)

This directory turns a validated `mini.score-expression.plan.v1` into two
separate things:

- `authorial_score.mid`: a standards-valid Type-0, one-track, monophonic
  Standard MIDI File; and
- `midi_ddsp_authorial_bridge.json`: a deterministic, human-readable bridge
  from the authored plan to MIDI-DDSP's six documented note-expression fields.

It is intentionally **not** a MIDI-DDSP installer, importer, renderer, or
trainer. It opens no source audio and does not claim a Daegeum performance has
been inferred. The bridge is only an authorial starting point that can be
applied after a future, separately authorized western-model inference trial.

## What the MIDI encodes

The MIDI uses channel 0 and an explicit General MIDI Flute program change:

| Meaning | Value |
| --- | --- |
| General MIDI displayed program | Flute #74 (one-based) |
| Program Change data byte | `73` (zero-based) |
| MIDI-DDSP documented instrument name | `flute` |
| MIDI-DDSP documented instrument ID | `4` |

Those last two rows are deliberately sidecar data, not MIDI Program Change
data. The MIDI-DDSP archived source maps `flute` to ID 4, while it maps its
General MIDI flute program to zero-based byte 73. Do not mix them.

MIDI has no universal slur event. Every pitch-bearing authored event is written
as a note; a shared boundary always serializes Note Off before Note On. The
sidecar carries `explicit_authorial_slur` only when the input plan explicitly
sets a slur. A touching timestamp alone never produces a slur. A `release`
event has no pitch note, so it remains an explicit sidecar release segment and
the MIDI End-of-Track preserves its final timeline position.

## Expression bridge

MIDI-DDSP's official README names the six note-expression controls as
`volume`, `vol_fluc`, `vibrato`, `brightness`, `attack`, and `vol_peak_pos`.
The project describes them as unit-range note controls. This adapter records
all six per MIDI note, plus the original authorial vibrato rate/depth and
onset/ramp/end-fade metadata.

The deterministic policy is visible in the JSON:

- `volume`: clamps authored `steady_loudness_db` from -60..-6 dB to 0..1.
- `vol_fluc`, `brightness`, `attack`, `vol_peak_pos`: explicit conservative
  defaults selected by authored `breath_start`, `rearticulate`, or `slur`.
- `vibrato`: zero when disabled; otherwise `source_depth_cents / 45`. The
  source vibrato rate and its onset/ramp/end-fade envelope are preserved in
  metadata because a single MIDI-DDSP note scalar cannot represent those
  time-varying authorial controls.

These are not learned values, acoustic labels, a Korean-wind timbre mapping,
or a claim that the pretrained western flute model can reproduce Daegeum. They
must be auditioned only after a separate model/runtime decision.

## Run

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-score-adapter/adapter.py \
  --plan tools/score-expression/plans/ari_source_led_response_r1.json \
  --output-dir _bgm_rnd/ari-midi-ddsp-score-adapter-YYYYMMDD
```

The output directory must be new. The adapter never changes default BGM,
runtime assets, score source, or source audio.

## Verify

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-score-adapter/test_adapter.py
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-score-adapter/adapter.py --dry-run
```

## Primary references

- [MIDI-DDSP official archived README](https://github.com/magenta/midi-ddsp/blob/main/README.md)
  documents the six conditioning fields and its monophonic MIDI workflow.
- [MIDI-DDSP note-expression controls](https://midi-ddsp.github.io/note_expression_control.html)
  describes the effect of volume, fluctuation, peak position, vibrato,
  brightness, and attack-noise controls.
- [MIDI-DDSP instrument mapping source](https://github.com/magenta/midi-ddsp/blob/main/midi_ddsp/data_handling/instrument_name_utils.py)
  records `flute` as instrument ID 4 and General MIDI flute as zero-based
  program 73.
