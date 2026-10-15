# Offline foundation-model listening trial

Research only. Nothing here changes default BGM or the game player. Public
NIKL daegeum and the project's own score are the only musical inputs. No AI Hub
recordings or DDSP-Gugak audio/weights are model inputs.

## Frozen dependencies

- ACE-Step source: `ca1e85fe9430179831e6bc6be790c332190a3866` (MIT).
- `ACE-Step/Ace-Step1.5` snapshot:
  `19671f406d603126926c1b7e2adc169acbcade22`.
- Download only `acestep-v15-turbo/`, `vae/`, and
  `Qwen3-Embedding-0.6B/` (about 6.337 GB decimal total).
- ACE model/VAE: MIT; Qwen3 embedding: Apache-2.0.
- Use a separate Python 3.12 environment and upstream's frozen lockfile.
  Do not install into the existing DDSP environment. No optional LM is needed.

Do not substitute SA3/SAME/Gemma weights: their registration/commercial terms
were not cleared for this particular trial. No remote music-generation API,
account, uploaded recording, or paid service is required.

## Three distinct audio roles

1. `prepare_inputs.py` produces an untrained sine guide from the authored public
   score (19.2 seconds, 28 notes, four rests, vibrato off). It is not daegeum.
2. A five-second codec roundtrip reconstructs an original recording. It tests
   codec fidelity only; it is **not newly composed music**.
3. The cover operation takes the new-score sine guide plus a separate continuous
   NIKL timbre reference. Its generated performance is the actual model trial.

The reference is a different melody/register, not a note-for-note ground truth.
`audio_cover_strength` controls the fraction of diffusion steps using the guide
cover context, not a literal percentage of daegeum timbre. It cannot guarantee
exact pitch, breath, vibrato, or instrument identity.

## Execution sequence

All paths below are absolute private paths supplied by the operator. No audio,
weights, model cache, or private manifests belong in Git.

1. Run `prepare_inputs.py --help`, then prepare the guide and read-only reference
   conversions in a new private directory.
2. Finish the exact HF snapshot download. Run `prepare_assets.py --source ...
   --checkpoints ... --output ...`. This preserves the two downloaded Python
   files, explicitly syncs the two corresponding files from pinned official
   source (as official startup normally does), and inventories file hashes.
   It never modifies weights or the upstream checkout.
3. Run `run_trial.py --source ... --checkpoints ... --inputs ... --assets
   .../asset_manifest.json --output NEW_DIRECTORY`. The disposable process
   performs codec reconstruction and then the new-score cover. `--mode cover`
   is an explicit separate run, not an automatic fallback. Optional
   `--guide-gain-db 16` creates a separate constant-gain guide copy without
   changing notes or exact rests; its gain and input/output hashes are recorded.
4. Use `compare_audio.py --help` for same-length, same-integrated-loudness AAC
   comparison. Preserve unnormalized raw WAVs and all failed-run diagnostics.

The default macOS pilot intentionally deviates from official defaults: DiT/text
BF16 after a tiny MPS numerical probe; FP32 VAE; CPU offload; no MLX duplicates,
LM, quantization, compilation, automatic downloads, or implicit CPU retry.
No upstream source is patched. The explicit overrides are recorded in each
report; this is not a benchmark of the official default implementation.

Each stage has a watchdog and the whole run is limited to 30 minutes. Stop at
12 GiB RSS plus MPS-driver allocation (a conservative, potentially double-counted
bound, not actual total unified-memory consumption), or under 12 GiB free disk.
Hard abort diagnostics are on stderr; exit 124 may bypass final report writing.
Use only a disposable inference process, never the interactive app process.

Technical checks do not establish musical quality. Listen before approving any
generated performance. Keep these trials out of game assets unless separately
approved, with the NIKL credit:

> 국악기 음원 제공 — 국립국악원 (공공누리 제1유형)

## Tests

`python -m unittest discover -s tools/bgm-gpt/foundation-model-trial -p 'test_*.py'`

Synthetic tests do not download weights or run the music model. Real inference
reports and frozen input/asset manifests remain in the private workspace.

## 2026-10-15 actual result

Three local 19.2-second cover renders completed: guide strength 1.0, strength
0.8, and strength 1.0 with explicit +16 dB guide calibration. A separate
five-second original codec reconstruction also completed. Same-duration AAC
comparisons were decoded and measured at -24 LUFS using static gain only.

These cover trials did **not** demonstrate exact score or breath adherence:
the first three written rests retained sound; guide-level calibration did not
resolve this. Monophonic YIN also disagreed with much of the authored pitch,
but mixture/subharmonic tracking errors mean its near-pitch fraction is not a
literal melody-accuracy score. No listening-quality or game-asset approval was
granted. Do not substitute codec reconstruction for a generated performance.
