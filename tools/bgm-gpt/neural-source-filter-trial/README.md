# Small public-NGC neural source-filter pilot

Local research, not a production daegeum instrument or a game BGM replacement.
This is a new, small from-scratch Torch decoder, not an external NSF/SiFi-GAN
checkpoint or a claim to reproduce a published model's quality.

The input controls are continuous F0, RMS level, harmonic voicing, and a separate
active/rest curve at 100 Hz. CPU float64 phase drives harmonic excitation; noise
can remain active during unvoiced breath. A learned causal nonlinear filter,
two-times internal sampling, and a fixed low-pass FIR produce 24 kHz audio.
The explicit active curve is authored control, not learned breath placement.
Measured output pitch and listening quality still require separate checks.

The fixed public source preparation uses nine NIKL daegeum files, capped at the
first 60 seconds each under the bounded selection rule. SHA-separated source
files form seven fit files (247.65 s) and two heldout files (79.2 s); the latter
were encountered previously and are not blind data. Original files are read-only.
Uncertain FFT-YIN F0 stays zero/unvoiced, never silently interpolated.

`prepare_ngc_data.py` creates private 24 kHz waveforms and 100 Hz features.
`train_nsf_pilot.py` validates original/NPZ hashes, computes one fit-only common
gain and loudness anchor, and trains a default 11,265-parameter `NSFLite`.
Targets use a common gain so fit peak is at most 0.25. Conditioning levels are
clipped to [-120,6] dBFS; the original measured features remain unchanged.
Harmonic voicing and pre-gain source-RMS>-60dB active masks are distinct.

Losses are phase-tolerant multi-resolution STFT, ten-millisecond RMS, and DC
penalty. No phase-misaligned pointwise waveform L1 is used. CPU spectral-loss
copies retain autograd to the MPS model; CPU and MPS synthetic gradients are
tested. Device choice is explicit; there is no automatic backend fallback.

Training is bounded to at most 1,500 steps / 900 seconds, 12 GiB conservative
RSS+MPS-driver allocation and 12 GiB free disk. Only best/latest own weights
are retained (under 3 MB total). Training source, code, and calibration hashes
are bound in immutable private metadata; checkpoints must not enter Git.

`evaluate_copy_and_score.py` reads a completed bound checkpoint, reconstructs
two diagnostic heldout crops at seconds2..3 (not the first-second selection
windows), and synthesizes the authored19.2-second B1 score once. Copy diagnostics
are not new music. New-score output uses no recording fragments. Its explicit
sample-domain written-rest gate and 24→48 kHz conversion are recorded separately.
No AI Hub originals or external model weights are used in this pilot.

Example paths are operator-supplied private absolute paths:

```
python train_nsf_pilot.py --manifest PRIVATE_DATA/manifest.json \
  --output NEW_EMPTY_PRIVATE_DIRECTORY --device mps --steps 500 --max-seconds 900
python evaluate_copy_and_score.py --checkpoint PRIVATE_TRAIN/best.pt \
  --data-manifest PRIVATE_DATA/manifest.json --plan PRIVATE_B1_PLAN.json \
  --output NEW_EMPTY_PRIVATE_DIRECTORY --device mps
```

Keep shell logs outside an output directory that must start empty. Never
redirect a log into that directory before the freshness check.

Source credit: 국악기 음원 제공 — 국립국악원 (공공누리 제1유형).
Architecture background: [Neural source-filter waveform models](https://arxiv.org/abs/1904.12088).
No public SiFi-GAN or noncommercial SingingVocoders weights were downloaded.

## Actual 2026-10-16 bounded pilot

The first scratch500-step run completed in35.3s (best500, fixed validation
loss15.08→2.475). A separate identical-seed1500-step run completed in88.3s;
its fixed internal-validation selection was step800(loss2.345), not the last
checkpoint. Both runs preserved source/code bindings and used no external
weights. This small validation set is reused selection data, not blind proof.

Both selected models synthesized the authored19.2-second score in one forward
each. All28notes and1426steady frames passed the direct nominal/guide50-cent
pitch criteria and the separate authored-rest treatment passed4rest checks.
Full AAC comparisons are19.2s/-24LUFS, not mismatched-melody comparisons.

Step800's measured final fixed-rate vibrato depth was17.054c versus guide17.084c;
all28 steady-note loudness differences after programme matching were within
[-1.46,+0.78]dB. Its second/first harmonic ratio changed from guide-19.49dB to
-10.58dB. These show control retention and changed harmonic balance, not
perceptual authenticity. One of two diagnostic source-copy crops remained
5.03dB too loud; do not claim universal reconstruction or generalization.
No game assets/default player or upstream originals were modified.

## 2026-10-17 listening rejection — do not promote this pilot

The user rejected the latest comparison: “하면 할수록 대금소리가 더더욱 아닌데?
그냥 기계음이 됐어”. Treat the latest NSF audition as a timbre failure, not
an improvement justified by pitch accuracy or lower validation loss. Do not
continue this tiny pilot's training, add noise/EQ/vibrato, or promote its score
renders as a solution without a new, independently justified experiment.

The default learned filter sees only127 internal48k samples (2.65ms); including
the65-tap fixed FIR gives191samples (3.98ms). A320ms training crop does not
give this network320ms of learned context. Four conditioning values, a fixed
1/k eight-harmonic excitation and independent white noise are not an observed
time-varying spectral envelope, aperiodicity, or articulation representation.
Nonlinear filtering can generate more than eight output harmonics; the output
is **not** hard-limited to eight. These are verified architecture limitations,
not a controlled causal proof of the user's perceptual result.

The stored same-recording copy diagnostics already have substantial spectral
and level errors. A read-only follow-up found high-band energy increased in
both copies, while off-harmonic energy decreased in the second; do not reduce
this failure to simply “missing treble” or “not enough noise”. These features
do not isolate breath or membrane vibration and are not naturalness scores.

Before any future new-score audition, establish same-recording reconstruction
quality separately from score control, on source-bound, level-matched examples
covering attacks, sustained tone, transitions and breath. Listening identity
must be evaluated independently; F0/rest/unit tests cannot approve it. Reused
diagnostic files are not blind evaluation. Keep the failed pilot and its logs
for reproducibility; no original recordings or game defaults are changed.

The published SiFi-GAN is **not** the architecture trained here. Its paper uses
spectral-envelope and band-aperiodicity conditioning, adversarial training and
a much larger network; it separately measures perceptual quality and pitch.
That speech/singing result does not establish daegeum quality or authorize
using external weights: https://arxiv.org/html/2210.15533v3.
