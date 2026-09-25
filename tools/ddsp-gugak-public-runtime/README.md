# Published DDSP-Gugak Daegeum CPU runtime — R&D only

This is a contained renderer for the public DDSP-Gugak Daegeum checkpoint. It
is deliberately not a trainer, source-audio processor, CREPE wrapper, or game
asset pipeline. It takes the explicit authorial plan
`tools/score-expression/plans/ari_source_led_response_r1.json`, creates a new
250 Hz F0/loudness control table, and calls only the published decoder,
harmonic oscillator, and filtered-noise synthesizer on CPU.

The exact rendered state is gated before import:

- DDSP-Gugak: commit `523012c340170841ed6499670e9dcef19783817d`;
- ddsp-pytorch: commit `ea5f25318dd4cd22c601dd405ebc2bac8e3f4cb6`;
- Daegeum checkpoint: SHA-256 `cc73b645…f547f28`, 17,400,893 bytes;
- checkpoint config: SHA-256 `0804084e…cef05e77f`, 1,477 bytes.

Both source repositories have verified MIT `LICENSE` files. That covers the
repository code, not necessarily the separately downloadable model weights or
their game/public-distribution use. The output remains R&D-only and is not a
cleared Daegeum game asset.

## What the renderer does

The published architecture has a 16 kHz sample rate and `0.004` second frame
resolution, so its controls are exactly 250 Hz. The authorial -28 to -30 dB
steady levels map to the decoder's **linear** loudness input with
`10 ** (dB / 20)` (0.03981 to 0.03162); raw dB is never passed into the model.
A separate public-sample audit reported active median linear loudness 0.0369
for Daegeum and 0.0347 for flute. This runtime records that context but does
not open either audio file.

`breath_start`, `rearticulate`, `slur`, and `release` remain explicit
authorial curves. The public decoder has only F0 and loudness inputs, so it
does not receive invented categorical articulation labels. Written rests are
hard-zeroed after dry synthesis. The 250 Hz voicing curve is linearly
upsampled to 16 kHz (not held as 4 ms steps), and each explicit voiced-to-rest
boundary gets a deterministic 16 ms pre-rest fade-out to avoid a hard-cut
click. A `breath_start` after an already voiced event must have an authored
gap containing at least one 250 Hz rest row. The long-standing breath onset
still begins at four percent of its steady level; the new topology gate stops
that envelope from being misused as a touching transition and creating an
energy cliff. A slur is treated as continuous breath plus a fast fingering change:
its pitch moves from the captured entry F0 to the new note in **12 ms** by a
monotonic minimum-jerk S-curve in log-frequency/cents—not a 90 ms linear-Hz
slide. The runtime can make isolated 8/12/20 ms R&D candidates with
`--slur-transition-ms`; 12 ms is the conservative canonical default. The
published oscillator then linearly interpolates its 250 Hz frames, so the
control transition is already settled long before the 50 ms target-pitch QA
gate. A slur does not manufacture a re-attack or voicing dip. Its separately
authored dynamic is retained with an independent 80 ms minimum-jerk transition
in linear loudness (entry → steady target), checked for monotonicity,
no-overshoot, and target arrival by 100 ms.

An explicitly enabled score vibrato may also declare
`end_fade_seconds`. The runtime keeps the authored phase clock but linearly
closes its depth so the final half-open 250 Hz row of that note is exactly on
the nominal pitch. This is used by the separate Gyeonggi/Arirang research
audition plan; it is not an automatic pitch-based vibrato rule. A release
cannot declare a new vibrato. It inherits the preceding note's normalized
source state, continues that clock when necessary, and independently closes
the release depth to nominal pitch on its own final control row.

The separate B2-R plan can embed exactly one pinned
`reference_shape_unreviewed` contour on `b16_e0_rearticulate`. This is a
strictly bounded offline audition path, not a general expression model. The
runtime independently checks the source-artifact SHA-256, candidate/source
provenance, negative claim limits, and the canonical SHA-256 of all 65 embedded
normalized contour points. It rejects changed timing, points, hashes, status,
or provenance. The original 1.5-second source time is retained exactly: each
250 Hz row linearly interpolates at
`source_time = contour_elapsed_seconds / 1.5`, without remapping the last
half-open row to the source endpoint. Explicit 120 ms linear depth fades begin
and end the gesture at zero cents; the final event row is forced to zero cents
and nominal pitch before the release, which remains nominal rather than
replaying the contour.

Runtime reports expose this as `score_controls.reference_contour_control_qa`,
including the event and provenance hashes, 375-row duration gate, first/final
zero-cent gates, final nominal-F0 gate, and the final source interpolation
position (`(1.5 - 0.004) / 1.5`). The report explicitly keeps learned,
Gyeonggi-style-aligned, human-reviewed, training, and game-clearance claims
false. The source contour is an automatic periodic-F0 proxy with unverified
rights; embedding it does not upgrade those claims.

The B2-Rd plan is a second, separately named audition of those exact source
points. Its status is `reference_shape_depth_matched_unreviewed`, and its
fail-closed `linear_peak_abs_match` record pins source maximum absolute depth
`34.047561` cents, target `18.0` cents, and scale
`0.5286722300020257` (`18.0 / 34.047561`). The runtime verifies that the
embedded source points still reach the declared source maximum, that the
ratio and product are exact within the numeric contract, and that the source
artifact, payload hash, normalized points, and negative claims remain those
of B2-R. It linearly interpolates the unmodified 65-point residual, multiplies
that result by the fixed scale, and only then applies the same 120 ms boundary
depth fades. It does not rescale time or modify the b08 contextual sine
yoseong, loudness, articulation, or release.

The same QA record labels this semantic operation
`scale_to_max_abs_cents`, records the raw transform kind and application
order, recomputes both source and transformed embedded maxima, and reports the
actual maximum across the 250 Hz runtime rows. A completed B2-Rd contour must
still have 375 rows, exactly 373 nonzero interior rows, zero-cent first/final
rows, a nominal-pitch release, and an actual maximum no greater than 18 cents.
This depth match remains an unreviewed proxy audition; it is not learned,
style-aligned, human-reviewed, or cleared for training/game use.

B2-Rdf keeps the same unscaled 65-point payload, source hashes, negative claim
limits, 18-cent depth transform, 120 ms fade-in, and 1.5-second time mapping as
B2-Rd. Its separate status,
`reference_shape_depth_matched_long_fade_unreviewed`, adds only a pinned
`linear_depth_fade_extension`: source fade-out `0.12` seconds and target
fade-out `0.24` seconds. The runtime rejects any other status, field set,
duration, transform kind, or source/target value.

The B2-Rdf end envelope remains one linear depth closure anchored to the final
half-open row. It equals B2-Rd through absolute time `34.32` (frame 8580), then
starts differing at `34.324` (frame 8581):
`(34.556 - t) / (34.556 - 34.32)` until the zero-cent row at `34.556`.
B2-Rd remains full-depth through `34.44`, then uses
`(34.556 - t) / (34.556 - 34.44)`. The report records both formulas, their
frame boundaries, exact equality through the new fade start, the 59 compared
long-fade rows, and that b08 lies outside this single-event transform. Direct
regression tests also compare every B2-Rd/B2-Rdf control through frame 8580,
the complete b08 event, the relative fade formula, and the nominal release.

The score-expression compiler has the same canonical constants and math, and
each runtime sidecar probes both implementations at 5.040/5.044/… seconds.
That is formula equivalence only: its 100 Hz control artifact can be
quantized/upsampled differently, so this 250 Hz renderer does not claim
audio-rate parity with a separate synthetic preview path.

### Experimental hard-F0-step diagnostic

`--experimental-hard-f0-step` is a separate R&D mode; it does not replace the
12 ms default and is mutually exclusive with `--slur-transition-ms`. The last
control row before a moving slur retains the source F0 and the first row of the
slur takes the target F0. Loudness still follows the same independently
authored 80 ms dynamic, voicing stays at one, and no onset or oscillator phase
reset is introduced. The unchanged published oscillator integrates one phase
bank continuously and linearly upsamples 250 Hz controls to audio rate, so the
control discontinuity may be smoothed over roughly one 4 ms frame. The QA gate
requires no intermediate-pitch control row, target arrival within 8 ms, and no
re-attack through that interval.

This is not a learned slur. The decoder has a causal GRU, but receives only F0
and loudness—not breath, tongue, fingering, or articulation labels. Its `a`
(overall harmonic amplitude), `c` (101-way harmonic distribution), and `H`
(65-bin filtered-noise response) may react to the changed control history; the
report calls that a recurrent checkpoint response and makes no stronger claim.
The compiler's canonical 12 ms policy is still verified, while candidate
formula equivalence is explicitly recorded as not applicable for the runtime-
only hard step.

With `--component-diagnostics`, a hard-step run also renders a fresh canonical
12 ms candidate in the same process with the same checkpoint and noise seed.
It writes post-authorial-gate harmonic/noise stems and both dry candidates.
Every diagnostic WAV receives one canonical-derived constant listening gain;
there is no per-candidate normalization, compression, or limiting. The report
compares unmodified decoder `a`, `c`, and `H` at -4/0/4/8/12/20/100 ms around
each moving slur. In particular, the +100 ms record exposes recurrent carry.
Neither `c` nor `H` is edited, and this experiment adds no noise pulse.

This timing is an R&D **flute-based inference**, not a claim about Daegeum
performance: the cited flute key-motion study reports roughly 10 ms
finger-driven and 16 ms spring-driven key motion, with multi-finger timing in
the tens of milliseconds and nonlinear acoustic effects; it supports avoiding
a long uniform sweep. [Almeida et al., JASA 2009](https://www.phys.unsw.edu.au/jw/reprints/AlmeidaetalJASA09.pdf)
The companion portamento timing reference is recorded in each R&D sidecar as a
perceptual rationale, not as direct Daegeum evidence. Release declares no new
score pitch but carries the immediately prior rendered F0. Its loudness starts
from the inherited steady event level once and decays as `release ** 1.35`, so
both published harmonic and learned-noise branches decay over the authored 240
ms tail without a recursive per-frame attenuation bug. No arbitrary air/noise
multiplier is added.

The legacy source is used untouched. A temporary, process-local adapter maps
its removed `torch.rfft`/`torch.irfft` calls to `torch.fft`, and source
harmonic/noise modules receive `device="cpu"`; neither patch persists nor
modifies a checkout. The encoder, CREPE, source WAVs, NGC audio, and learned
reverb are not imported or called for the dry render.

## Optional checkpoint-native reverb audition

`--checkpoint-native-reverb` is explicit and creates a **separate** R&D
audition while preserving the dry WAV byte-for-byte in the same fresh output
directory. It hash-gates unchanged published `components/reverb.py`, strictly
loads exactly `reverb.fir`, `reverb.drywet`, and `reverb.decay` from the pinned
checkpoint, and passes the authorial-gated dry model result through the public
FIR component on CPU. It neither opens source audio nor changes the score.

It writes two wet WAVs: a full learned-room tail and a score-length crop for
audition. The dry input is exact zero in written rests, but a learned FIR tail
can remain audible there and after the score; that is room response, not a
newly asserted score note. `--shared-interval-end-seconds` selects the explicit
score-length monitoring interval used to derive a -24 dBFS RMS listening gain.
Its default remains `[0.00, 6.48)` (103,680 samples at 16 kHz), preserving the
original 6.72-second regression. A 34.80-second full score can instead use
`--shared-interval-end-seconds 34.56` to omit only its final release.

For a matched B0/B1 comparison, B0 names its derivation with
`--listening-gain-source-slot B0`. B1 supplies B0's successful sidecar with
`--reuse-checkpoint-native-reverb-gain-from-report`. The runtime only accepts a
directly derived gain from the same checkpoint, interval, target, and runtime
schema in an isolated `_bgm_rnd` output. It records the source report hash and
slot, applies the exact floating-point gain to both the score-length and
full-tail outputs, and does not normalize B1 independently. Every mode applies
one constant gain over the entire file; a potential clip fails the run rather
than triggering a limiter, compressor, peak normalization, replacement gain,
or tail-specific gain.

## Check, then render

The tool never clones sources, installs Torch, downloads a checkpoint, or
creates an output unless `--execute --confirm-rnd-only` is supplied. Give it
explicit immutable checkouts and a fresh direct child of ignored `_bgm_rnd/`.

```sh
PYTHON=/tmp/ddsp-gugak-cpu-rnd-XXXXXX/venv/bin/python
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

"$PYTHON" "$ROOT/tools/ddsp-gugak-public-runtime/ddsp_gugak_public_runtime.py" \
  --check \
  --plan "$ROOT/tools/score-expression/plans/ari_source_led_response_r1.json" \
  --gugak-source-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/DDSP-Gugak" \
  --ddsp-pytorch-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/ddsp-pytorch" \
  --checkpoint "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth" \
  --checkpoint-config "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth.config"
```

For a full 6.72-second dry render plus a safe, post-render-only listening pair
against the already-generated official MIDI-DDSP western-flute B artifact:

```sh
"$PYTHON" "$ROOT/tools/ddsp-gugak-public-runtime/ddsp_gugak_public_runtime.py" \
  --execute --confirm-rnd-only \
  --plan "$ROOT/tools/score-expression/plans/ari_source_led_response_r1.json" \
  --gugak-source-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/DDSP-Gugak" \
  --ddsp-pytorch-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/ddsp-pytorch" \
  --checkpoint "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth" \
  --checkpoint-config "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth.config" \
  --repository-root "$ROOT" \
  --output-dir "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-YYYYMMDD-HHMMSS" \
  --slur-transition-ms 12 \
  --checkpoint-native-reverb \
  --reference-flute-wav "$ROOT/_bgm_rnd/midi-ddsp-official-flute-runtime-r1-20260925-121434/b_authorial_bridge6_controls/authorial_score_bridge6.wav"
```

The pair and optional reverb audition use the same shared-interval RMS target
of -24 dBFS. They fail instead of silently limiting any side if that target
would clip. The flute WAV is only read after rendering to make a listening
comparison; it is never an inference or training input.

For a full-score B0 wet render, add:

```sh
  --checkpoint-native-reverb \
  --shared-interval-end-seconds 34.56 \
  --listening-gain-source-slot B0
```

Then render B1 with the exact B0 wet gain by replacing the slot flag with:

```sh
  --checkpoint-native-reverb \
  --shared-interval-end-seconds 34.56 \
  --reuse-checkpoint-native-reverb-gain-from-report \
    "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-YYYYMMDD-HHMMSS-full-b0/runtime_report.json"
```

The report retains `constant_gain_applied_to_entire_file` and additionally
records `gain_derivation`, `gain_source_slot`, `fixed_gain_reference`, and the
explicit interval. Reused-gain outputs are named `shared_fixed_gain`; directly
derived outputs retain the historical `shared_interval_rms_matched` names.

For the isolated hard-step/canonical diagnostic pair (full score only):

```sh
"$PYTHON" "$ROOT/tools/ddsp-gugak-public-runtime/ddsp_gugak_public_runtime.py" \
  --execute --confirm-rnd-only \
  --plan "$ROOT/tools/score-expression/plans/ari_source_led_response_r1.json" \
  --gugak-source-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/DDSP-Gugak" \
  --ddsp-pytorch-root "$ROOT/_bgm_rnd/ddsp-gugak-public-source-r1/ddsp-pytorch" \
  --checkpoint "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth" \
  --checkpoint-config "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth.config" \
  --repository-root "$ROOT" \
  --output-dir "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-YYYYMMDD-HHMMSS-hard-step-diagnostic" \
  --experimental-hard-f0-step \
  --component-diagnostics
```

Outputs are a dry WAV, a 250 Hz CSV control table, a path-free provenance
sidecar, and—only with their explicit flags—the diagnostic stems/comparison or
two separate wet audition WAVs.
The output directory must be new, so a failed or prior experiment cannot be
overwritten.
