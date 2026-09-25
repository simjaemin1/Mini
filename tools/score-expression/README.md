# Score → expression curves — isolated R&D control layer

This small compiler turns an **explicit** monophonic Daegeum score plan into
continuous, 48 kHz-timeline-aligned control arrays.  It writes no audio,
reads no recording, trains no model, and never changes default/runtime BGM.
It is the missing middle layer between authorial notes and a later
source-filter/DDSP renderer:

```text
notes + explicit articulation + optional sigim/vibrato
                    ↓
F0 / loudness / air-noise / voicing / gesture-state curves
                    ↓
future R&D renderer only
```

The four event states are intentionally distinct:

- `breath_start`: fresh phrase head; slower loudness onset and larger air
  proxy.
- `rearticulate`: a named tongue/re-attack; short, different transient
  recipe—not a new breath and not a steady-state crossfade.
- `slur`: must set `slur_from_previous: true` and touch the prior event; its
  canonical pitch move is a 12 ms minimum-jerk curve in log-frequency/cents
  (not a long linear-Hz slide), with no invented attack. Its separately
  authored dynamic moves from entry to target over 80 ms in monotonic
  minimum-jerk linear loudness, rather than being discarded or becoming an
  onset dip.
- `release`: pitch-free tail whose loudness/voicing decays from the previous
  authored level.

Touching timestamps alone are **not** legato evidence.  Every playable event
must name its state, and a `slur` without the explicit link is rejected.

## Daegeum vibrato guardrail

Vibrato is off when absent or explicitly disabled.  When an author opts in,
this R&D version only accepts 3.3–3.8 Hz and 12–45 cents.  Those bounds come
from a conservative local F0-proxy scan of a file named
`sanjo_deageum_scale_vib_39.wav`; they are parameter bounds, **not** semantic
labels, a performance claim, a training target, or a rights clearance.  A
separate sustained-scale scan did not meet that strict periodic screen, which
is why no globally always-on wobble is introduced.

## Plan and output

The input plan is an explicit R&D-only JSON object.  It has one sustained
`daegeum` instrument, an optional 25–1000 Hz control rate, and exact events.
This short example contains a breath, tongue re-attack, continuous slur, and
release:

```json
{
  "schema": "mini.score-expression.plan.v1",
  "r_and_d_scope": {
    "r_and_d_only": true,
    "no_default_assets": true,
    "no_runtime_bgm": true,
    "no_game_output": true,
    "no_public_release": true
  },
  "instrument": {"id": "daegeum", "sustained": true},
  "control_hz": 100,
  "events": [
    {
      "id": "a", "start_seconds": 0.0, "end_seconds": 0.72,
      "pitch_hz": 440.0, "articulation": "breath_start"
    },
    {
      "id": "b", "start_seconds": 0.72, "end_seconds": 1.44,
      "pitch_hz": 440.0, "articulation": "rearticulate"
    },
    {
      "id": "c", "start_seconds": 1.44, "end_seconds": 2.16,
      "pitch_hz": 392.0, "articulation": "slur",
      "slur_from_previous": true,
      "vibrato": {
        "enabled": true, "rate_hz": 3.45, "depth_cents": 23.0,
        "onset_seconds": 0.20, "ramp_seconds": 0.08
      }
    },
    {
      "id": "tail", "start_seconds": 2.16, "end_seconds": 2.36,
      "articulation": "release"
    }
  ]
}
```

Run only into a fresh R&D output directory:

```bash
/tmp/durango-bgm-rnd-venv/bin/python tools/score-expression/compile_expression.py \
  --plan /absolute/path/to/explicit-plan.json \
  --output-dir /absolute/path/to/fresh-rnd-controls \
  --confirm-rnd-only
```

The output contains `score_expression_controls.npz` and a path-free JSON
manifest.  NPZ fields include 48 kHz frame centers, `f0_hz`, `f0_cents`,
`loudness_db`, `air_noise_ratio`, `voicing`, articulation `gesture_state`,
requested vibrato rate/depth plus the resulting `vibrato_cents` curve, and a
stable nine-column `score_features` matrix.  The
arrays are authorial control prescriptions—not audio-derived labels and not
permission to add a recording to an ML corpus.

## Slur timing and control-rate limit

The compiler's canonical 12 ms pitch policy uses the same independently tested
minimum-jerk log-frequency math and constants as
`tools/ddsp-gugak-public-runtime/`. It does **not** claim audio-rate parity:
the tracked plan is 100 Hz, so a 12 ms transition is represented by 10 ms
spaced control rows and a downstream preview may linearly interpolate those
rows. The public Daegeum runtime is the authority for actual 250 Hz candidate
auditions and its strict `<20 ms` intermediate-pitch dwell / 50 ms target-pitch
gates. The compiler writes this quantization caveat into every manifest.
