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
click. A slur is treated as continuous breath plus a fast fingering change:
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

The score-expression compiler has the same canonical constants and math, and
each runtime sidecar probes both implementations at 5.040/5.044/… seconds.
That is formula equivalence only: its 100 Hz control artifact can be
quantized/upsampled differently, so this 250 Hz renderer does not claim
audio-rate parity with a separate synthetic preview path.

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
audition. The dry input is exact zero in the written rest, but a learned FIR
tail can remain audible there and after 6.72 seconds; that is room response,
not a newly asserted score note. Both wet files and the dry/flute A/B pair are
matched using the same `[0.00, 6.48)` interval (103,680 samples at 16 kHz) to
-24 dBFS RMS. Each file gets one constant gain over its entire duration; a
potential clip fails the run rather than triggering a limiter, compressor,
peak normalization, or tail-specific gain.

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

Outputs are a dry WAV, a 250 Hz CSV control table, a path-free provenance
sidecar, and—only with the explicit flag—the two separate wet audition WAVs.
The output directory must be new, so a failed or prior experiment cannot be
overwritten.
