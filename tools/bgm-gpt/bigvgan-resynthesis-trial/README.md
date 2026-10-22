# BigVGAN-v2: same-source reconstruction, not a new score

This isolated diagnostic asks whether a published pretrained vocoder can
reconstruct the daegeum source behind audition027 without the unacceptable
WORLD029 result. It does **not** train a model, compose music, generate a new
performance, learn vibrato placement, or establish acceptable daegeum timbre.

## Fixed provenance and processing

- Official code: [NVIDIA/BigVGAN](https://github.com/NVIDIA/BigVGAN), commit
  `7d2b454564a6c7d014227f635b7423881f14bdac` (MIT and retained `incl_licenses`).
- Official model: [24kHz/100-mel/256-hop v2](https://huggingface.co/nvidia/bigvgan_v2_24khz_100band_256x),
  revision `c329ede9e9bbc100ddf5c91e2330a61921262370` (model repository MIT).
  Only the450,088,331-byte generator and config/license are needed, not the
  discriminator, optimizer, training dependencies, or a whole model clone.
- Generator SHA256:
  `6f9c5715550c9d0f11159ceb8935638da5aeb19e27d1e63677632df095e376f5`.
- Source: the exact saved unmodified24kHz waveform decoded from National Gugak
  Center Arirang002, seconds0..4.8, not the WORLD output. Its source archive,
  original recording and parent report must match their SHA bindings.

`run_bigvgan_copy.py` validates those inputs **before** loading a model. The
private root contains `upstream/`, `model/`, and separately installed optional
dependencies. Run with an already prepared Python3.12/Torch environment; it
installs nothing and never calls `from_pretrained` or a Hub downloader. Model
Python comes from the pinned official code checkout, not the weight repository.

```text
python run_bigvgan_copy.py --root PRIVATE_TRIAL_ROOT \
  --source-report PRIVATE_WORLD_SOURCE_COPY/report.json \
  --output NEW_EMPTY_PRIVATE_DIRECTORY
```

The official `get_mel_spectrogram` computes Slaney magnitude mel followed by
natural log: FFT/window1024, hop256,384-sample reflect padding per side and
`center=False`. No peak normalization, extra input padding, pitch/tempo edit,
F0 smoothing, EQ or waveform blending occurs.115,200 native samples give450
mel frames and **exactly115,200 output samples**, with no searched alignment or
output trimming. The fixed input lacks frequencies above12kHz; it is the same
source representation used for027, not a full-band fidelity claim.

Checkpoint loading explicitly uses `weights_only=True`, CPU mapping and strict
state matching. The112,414,512-parameter official generator runs once in CPU
float32 inference mode, with four threads and no custom CUDA kernel. Its
published final clamp is retained; any saturated output is rejected. There is
no automatic backend, model, or source fallback. A disposable process watchdog
enforces900seconds/8GiB RSS and at least12GiB free disk. Separate source/model
native FLOAT WAVs, identical24→48kHz dual-mono conversions, the unmodified mel
archive and a report are private outputs. The run's input/code bindings are
checked again afterward. No AI Hub recordings, restricted DDSP weights,
original audio uploads, or game defaults are involved.

Source credit: **국악기 음원 제공 — 국립국악원 (공공누리 제1유형)**.
Software and recording rights remain distinct; retain upstream license notices.

## Actual2026-10-22 result

The one CPU forward completed:45.47seconds including imports/preparation,
16.82seconds for model load and inference. Exact450-frame mel and115,200-sample
output were retained, with no saturation. All39 original/model/code bindings
were unchanged. Source RMS0.13254 versus generated0.13014 is not an audio
quality score. Dependencies and model/code occupy about775MiB including actual
outputs, within the announced1GB bound; no existing runtime was modified.

The existing `foundation-model-trial/compare_audio.py` produced two4.8-second,
48kHz stereo AACs using **one constant gain per input** (no AGC/limiter):
source−10.2dB, model−10.0dB, target−24LUFS. Fully decoded measurements are
source−24.0LUFS / generated−24.1LUFS; true peaks both−15.5dBFS. The source AAC
is byte-identical to old027. These are auditions036/037, not a new melody.
Thirteen synthetic/mock wrapper tests pass without importing the actual model
or reading original data/checkpoints. Neither unit tests nor reconstruction
metrics approve the2-second transition or daegeum identity: user listening
remains the quality decision. If this decoder proves useful, a separate
score→expression/spectrogram model is still needed to create new performances.
