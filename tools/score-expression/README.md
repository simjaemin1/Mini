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

### Gyeonggi-minyo / Ari policy v1

`plans/ari_source_led_response_r1.json` now carries a fail-closed musical
policy, not a pitch-only vibrato switch.  Every voiced event preserves
`musical_context`: genre, style, tori, mode, phrase role, modal degree,
duration in beats, metric beat, melodic approach, whether a rest follows, and
whether the event is a global cadence.  Every event also records an explicit
`vibrato_policy` decision, style, fired rule ID, and end behavior.  The
compiler checks those contextual rules and copies both the context and fired
rule into its in-memory result and JSON manifest.

The policy deliberately defaults to straight tone.  In particular, b10_e2 is
a one-beat `local_phrase_tail` reached by `descending_arrival`, and is not a
global cadence; `gyeonggi_ari.v1.short_local_tail_no_full_yoseong` therefore
keeps its former full-note vibrato off.  B08 is a different case: it is a
two-beat local phrase cadence followed by a written rest.  It receives one
late, gentle *candidate*, but the canonical plan records `candidate_off` and
does not synthesize it automatically.

`plans/ari_gyeonggi_policy_r1_audition.json` is the separate B1 audition that
explicitly selects only that b08 candidate.  Its 3.45 Hz / 18 cent / 0.72 s
onset / 0.18 s ramp and end-fade values are marked provisional local proxy
bounds, not measurements of an authentic performance.  The compiler requires
the selected controls to exactly match the recorded candidate and tapers the
depth to zero over `end_fade_seconds`.  Both plans explicitly state that the
underlying browser score is an authorial Western pitch-grid skeleton—not an
authentic Bonjo Arirang, Gyeonggi-minyo, or Daegeum transcription.  A real
reference-performance curve is still required before an authenticity claim,
training label, default BGM, or release decision.

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
        "onset_seconds": 0.20, "ramp_seconds": 0.08,
        "end_fade_seconds": 0.08
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

The output contains `score_expression_controls.npz` and a path-free v2 JSON
manifest.  NPZ fields include 48 kHz frame centers, `f0_hz`, `f0_cents`,
`loudness_db`, `air_noise_ratio`, `voicing`, articulation `gesture_state`,
requested vibrato rate/depth plus the resulting `vibrato_cents` curve, and a
stable nine-column `score_features` matrix.  The
arrays are authorial control prescriptions—not audio-derived labels and not
permission to add a recording to an ML corpus.

## Slur timing and control-rate limit

The compiler's canonical 12 ms pitch policy uses the same independently tested
minimum-jerk log-frequency math and constants as
`tools/ddsp-gugak-public-runtime/`. It does **not** claim that its 100 Hz rows
are audio-rate F0: the v2 manifest now writes each slur's compiler-derived
source-boundary F0, target-entry F0, 48 kHz sample boundary, and first
post-transition authorial rejoin row. The isolated generic preview refuses
older manifests or incomplete boundary metadata; when eligible, it restores
the first 12 ms at 48 kHz in log-frequency/cents and rejoins any deliberately
early authorial target motion in that same domain. This is a preview-specific
reconstruction contract, not a performance inference or a claim of parity
with the public Daegeum runtime's separate 250 Hz auditions and strict
`<20 ms` intermediate-pitch dwell / 50 ms target-pitch gates.
