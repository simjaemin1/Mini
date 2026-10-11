# Private Mac MPS daegeum timbre trial (review before running)

This is a bounded, local **timbre** experiment. It does not learn when to
vibrate, compose a melody, or render the 19.2-second game score. The AI Hub
71470 source, 16 kHz resamples, checkpoints, and listening excerpts remain in
private local folders; do not commit, upload, redistribute, or make game assets
from them. Confirm the approved use terms before running either private mode.

The model code is [IRCAM `ddsp_pytorch`](https://github.com/acids-ircam/ddsp_pytorch)
at commit `9db246f48dba66e9b2133691d7abf4af6ede0279`, Apache-2.0. The
local private checkout must pass the exact source/license hashes pinned in
`mac_mps_ddsp_pilot.py`; its `core.py` patch only delays old librosa/CREPE
imports. The feature code SHA-256 is pinned in `mac_mps_ddsp_long_trial.py`.
The fitted normalizer is the mean of each **selected training 4-second
window's** loudness mean and unbiased standard deviation. It is not a claim
that the original IRCAM B16 loader's statistics are identical.

## Preconditions and bounds

- Mac arm64, 16 GB physical RAM or more, exact tested PyTorch 2.14.1, MPS
  available, CPU fallback disabled, and at least 8 GiB free before and after
  each checkpoint. MPS is capped to half the recommended allocation.
- Approved C001 training manifest must contain exactly 250 verified 16 kHz
  mono PCM16 WAVs. The song split must be 216 train clips/15 songs and 34
  heldout clips/4 other songs. Every split WAV's header, SHA-256, 0600 file
  mode, and non-overlapping inode are checked before any feature extraction.
  Heldout audio is read for integrity checking, **never fitted or included in
  the training normalizer**.
- At most 216 train files; analyze at most the first 120 seconds of each.
  Choose up to three nonoverlapping, high-confidence 4-second windows per
  file: at most 648 windows/2,592 seconds of source exposure. Their float32
  waveform storage is at most about 166 MiB; model/MPS overhead is additional.
  Clips without a qualifying window are counted and excluded.
- At most 1,000 optimization steps, 120 elapsed minutes per invocation, and
  at most 100 steps between checkpoints. `--minutes` is a **soft** wall cap
  checked between clips and steps; an in-progress SHA/feature/MPS call is not
  interrupted. If it expires during preparation, no training checkpoint is
  possible; retry with a fresh run or an allowed longer cap.
- A 3,785,000-parameter model has about 14.4 MiB float32 weights and roughly
  43.3 MiB model+Adam tensors after optimizer initialization. Ten checkpoints
  therefore suggest about 0.45 GiB, **not a measured disk guarantee**; each
  checkpoint is capped at 512 MiB. The 8 GiB free-space floor is still
  enforced. Saved files are 0600 in a separate 0700 folder. Each checkpoint
  file is staged/fsynced, then a small atomic marker commits it; an orphan
  staged file after a crash is ignored. Resume is explicit and re-verifies
  the source, split, features, configuration, and selected training windows.

Create existing, empty **0700 folders outside Git and outside the audio/source
directories** for each output. Use the Python executable in the separately
prepared, private environment with the tested PyTorch dependencies, not the
system Python. Then, after code and F0 review, run the two commands separately
(replace each angle-bracket path with an absolute local path; never paste
credentials):

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/mac_mps_ddsp_long_trial.py train \
  --source-manifest <private_16k_manifest.json> \
  --split-manifest <private_split.json> \
  --upstream-root <private_pinned_ddsp_pytorch_checkout> \
  --output-dir <private_checkpoint_directory> \
  --clips 216 --steps 1000 --minutes 90 --save-every 100
```

If the time cap stops a run after a committed checkpoint, repeat that command
with `--resume`; `--steps` is the **total target**, not an extra number of
steps. An uninterrupted run may finish sooner. Successful step completion
only proves that the optimization executed, not that the timbre is convincing.

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/bound_heldout_evaluation.py evaluate-and-bind \
  --source-manifest <private_16k_manifest.json> \
  --split-manifest <private_split.json> \
  --upstream-root <private_pinned_ddsp_pytorch_checkout> \
  --checkpoint-dir <private_checkpoint_directory> \
  --output-dir <new_private_evaluation_directory> \
  --pairs 3 --minutes 30
```

The wrapper runs the pinned evaluator unchanged in a fresh private output
folder. It verifies the 1,000-step checkpoint marker and actual tensor-file
hash before and after, then binds the training/evaluation reports and exact
listening WAV bytes in a private `result/checkpoint_binding.json`. A bare
`heldout_report.json` without this binding is **incomplete**, even if it has
plausible metrics. Check the current checkpoint and all bound outputs later
with:

```sh
<private_venv_python> tools/bgm-gpt/aihub-readiness/bound_heldout_evaluation.py inspect \
  --checkpoint-dir <private_checkpoint_directory> \
  --output-dir <private_evaluation_directory>
```

Evaluation records unmasked four-second heldout spectral loss, then separately
looks for an acoustic quiet-to-active proxy (20 frames below -50 dBFS then
20 above -42 dBFS). This level-based proxy is **not a labeled breath or
attack** and may miss softer recordings. The report counts source-quiet
10-millisecond frames below -50 dBFS where the reconstruction exceeds
-40 dBFS. This exposes a known problem: the upstream model can emit noise
even when F0 is zero. Listening uses the **full reconstruction waveform**, no
loss mask. Its stochastic noise is seeded; a 4-second crop still loses
preceding context and cuts reverb tails.

`<new_private_evaluation_directory>/result/heldout_report.json` and
`result/pairs/` are committed together. `pair_01` is a quiet-to-active
diagnostic when one can be matched audibly. If not, an explicitly labeled
*sustained-tone-only* fallback may be saved while the report states that
rest/attack behavior remains untested. The pair called
`pair_01_source_input_16k.wav` is the **16 kHz resampled model input, not the
48 kHz AI Hub original**; `pair_01_reconstruction.wav` is the new DDSP output
for that same four seconds. Both are normalized to an audible ~-29.1 dBFS
RMS only if this can be done without clipping or >16× gain. Otherwise fewer
or no pairs are produced, and the numerical evaluation/report still survives.
The private report preserves original/reconstruction RMS and gain for each
saved pair. Do not share the source-input excerpts.

The pinned IRCAM model upsamples 100 Hz controls with nearest interpolation;
its two input-MLP references are shared in the upstream source. The local
64 ms YIN F0 extractor can miss low-note/ornament detail and is not a
validated expression label. Training uses one 4-second crop at a time and
masks low-confidence frames in the loss, so attacks, rests, or breath quality
can remain poor even when loss falls. A later 19.2-second score render needs
its own continuity/phrase test; concatenating four-second outputs would reset
GRU/phase/reverb context and cannot be called a musical solution.
