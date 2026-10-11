# Held-out VB01 reproduction check (local private R&D)

This tests whether the frozen, 1,000-step IRCAM DDSP daegeum checkpoint can
**reproduce pitch modulation supplied in F0 from a different performance**.
It does **not** test when a composer or model should choose vibrato, whether
the VB01 timestamp is a precise acoustic boundary, authentic daegeum timbre,
or readiness for the game's 19.2-second score. Do not change the checkpoint,
normalizer, F0 extractor, score, or game audio after seeing these results and
still call the same four songs an untouched test set. An earlier 250-clip F0
window audit already included these held-out recordings, although none were
used for fitting model weights or loudness statistics.

## Scope and selection fixed before inference

Only the approved C001 song-held-out split is accepted: 216 training clips in
15 songs and 34 evaluation clips in four other songs. All 250 split WAVs are
rechecked against the manifest SHA, PCM header, private permissions, and
inode separation. The training report and exact checkpoint marker/tensor
file must match the pinned source, split, features, code, upstream commit,
configuration, and training-only loudness normalizer. The local label ZIP is
read-only and its SHA is bound to the result.

For each of the 34 held-out clips, the selector counts every VB01 label and
then applies the existing conservative isolated-event rule: label length
0.75–1.60 seconds, at least 0.55 seconds from clip edges, and no other
annotated event within 0.55 seconds. It takes the **first chronological**
eligible event per clip, never the event with the best model output. The
approved label inventory has 163 VB01 labels, 50 isolated eligible labels in
24 clips, and ten clips without a qualifying event; a changed population
fails closed. Each selected event is centered in a deterministic 4-second,
10-ms-grid crop within the first 120 seconds, with at least 0.5 seconds of
context on both sides. All 24 selected crops enter the numerical denominator.

Before loading the model, a private 0600 `vibrato_selection_private.json`
freezes the source-file identifiers and label times, crop boundaries, source-side measurements, and
at most three planned A/B clips. The listening groups are the first three
held-out song indices in sorted order; within each, the first source-input
64-ms F0 strict-positive clip by WAV SHA is used. This source-only filter
deliberately makes the listening examples easy to hear, **not representative
of all 24**. The fourth song still contributes to the aggregate. A planned
pair that cannot be matched audibly without >16× gain or clipping is omitted
without a replacement; the full evaluation is retained.

## Three distinct questions in the metrics

1. The 80-ms YIN detector asks whether the **source waveform** has periodic
   F0 motion in the central half-second. The model's actual input uses the
   pinned 64-ms/100-Hz YIN plus the training two-neighbour voicing mask. The
   reconstruction is measured with that **same 64-ms extractor**, so
   input-to-output comparison does not confuse different F0 window lengths.
   A 3.5–8.5 Hz fit is called strict modulation only at amplitude ≥12 cents,
   ≥40% improvement over a linear trend, and at least two prominent turns.
   Voicing gaps, pitch jumps, and uncertain windows are indeterminate, not
   negative. This is a narrow acoustic diagnostic, not a validated Korean
   ornament label. The 80-ms source/64-ms input/64-ms output states, depth,
   fitted frequency, and same-time F0 error are kept separate.
2. Raw, **unmasked** 4-second spectral loss and raw RMS level difference are
   reported separately from pitch reproduction. For raw 10-ms windows, the
   report counts source-quiet frames (<−50 dBFS) where the model exceeds
   −40 dBFS; it also counts acoustic quiet-to-active proxies matched within
   ±200 ms. A model F0-tracker gap and an actual RMS-level gap during a source
   active region are separate diagnostics. If a denominator is zero, no rate
   is inferred. None of these threshold tests proves a breath or re-attack.
3. At most three **local-only** 4-second A/B pairs are written as 16-kHz mono
   PCM WAV: `source_input_16k` (the resampled model input, **not** the 48-kHz
   AI Hub original) versus `reconstruction`. Only the listening copies have
   whole-clip RMS matched near −29.1 dBFS; raw level metrics are calculated
   first. Judge recognizable daegeum tone, mechanical noise, modulation,
   breaks, and volume by listening, not by spectral loss alone.

The 24 clips are nested in **four songs**, not 24 independent songs. The
private report includes four anonymous song-group rows so a single song
cannot masquerade as broad generalization. Most labels do not establish a
clean flat→modulated→flat acoustic sequence; do not treat published VB01
onset/offset milliseconds as ground truth for timing or train a placement
model from this result.

## Run and inspect

Use the pinned private Python environment with PyTorch 2.14.1 on Mac arm64,
16 GB RAM or more, working MPS, and no CPU fallback. A fresh empty **0700**
output directory must be outside Git and outside every source/checkpoint
directory. At least 8 GiB must remain free. The run caps MPS memory to half
its recommended allocation, evaluates one 4-second crop at a time, and
allows at most 30 minutes (soft wall cap checked between records). A Python
socket guard is present, but it is **not** an operating-system network
sandbox. Do not upload or share AI Hub source, excerpts, features, or model
checkpoints; honor the approved use terms and attribution requirement.

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/bound_heldout_vibrato.py evaluate-and-bind \
  --source-manifest <private_16k_manifest.json> \
  --split-manifest <private_split.json> \
  --label-zip <private_TL_E_zip> \
  --upstream-root <private_pinned_ddsp_pytorch_checkout> \
  --checkpoint-dir <private_1000_step_checkpoint_directory> \
  --output-dir <new_empty_private_directory> \
  --minutes 30
```

The result is incomplete unless `result/checkpoint_binding.json` exists and
the current-input inspection says `complete_bound_to_checkpoint`. It binds
the exact selection/report/listening WAV bytes; label/source/split hashes;
checkpoint marker and tensor SHA; training report; pinned feature, evaluator,
label-audit and helper scripts; upstream commit and loudness normalizer.
The checkpoint and private source/label contents are rechecked after the run.
No individual filename, event time, waveform, F0 trace, or private path is
printed to the terminal or belongs in Git.

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/bound_heldout_vibrato.py inspect \
  --source-manifest <private_16k_manifest.json> \
  --split-manifest <private_split.json> \
  --label-zip <private_TL_E_zip> \
  --upstream-root <private_pinned_ddsp_pytorch_checkout> \
  --checkpoint-dir <private_1000_step_checkpoint_directory> \
  --output-dir <private_vibrato_evaluation_directory>
```

The private outputs are small: no more than six 4-second PCM16 WAVs, about
0.75 MB before filesystem overhead, plus three JSON documents and a lock file.
The checkpoint and source data are never copied into the output. Only
synthetic fixtures are used by `test_bound_heldout_vibrato.py`.
