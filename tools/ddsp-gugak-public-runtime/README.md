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
hard-zeroed after dry synthesis. Release uses F0=0 (therefore silent harmonic
branch), an explicit decoder-loudness decay, and a compiled voicing fade for
the learned-noise tail. No arbitrary air/noise multiplier is added.

The legacy source is used untouched. A temporary, process-local adapter maps
its removed `torch.rfft`/`torch.irfft` calls to `torch.fft`, and source
harmonic/noise modules receive `device="cpu"`; neither patch persists nor
modifies a checkout. The encoder, CREPE, source WAVs, NGC audio, and learned
reverb are not imported or called for the dry render.

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
  --reference-flute-wav "$ROOT/_bgm_rnd/midi-ddsp-official-flute-runtime-r1-20260925-121434/b_authorial_bridge6_controls/authorial_score_bridge6.wav"
```

The pair is active-RMS matched to -24 dBFS. It fails instead of silently
limiting either side if that target would clip. The flute WAV is only read
after rendering to make a listening comparison; it is never an inference or
training input.

Outputs are a dry WAV, a 250 Hz CSV control table, and a path-free provenance
sidecar. The output directory must be new, so a failed or prior experiment
cannot be overwritten.
