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

## 2026-10-23: fixed spectral +1-semitone control, not F0-only synthesis

`run_spectral_pitch_trial.py` reuses the exact pinned model, code and dependency
folder; no new installation or training. It reads the SHA-bound original
`vib39[2,6.8)` source, not a WORLD result, and makes two CPU forwards: unchanged
pitch and a fixed+1semitone. The latter samples the linear1024-FFT magnitude
at `output_bin / 2**(1/12)` **before** the same Slaney mel projection and log.
Time frames are unchanged. This shifts the spectral envelope and noise as well
as harmonics; the original top band is pushed above Nyquist and lost. It is not
formant-preserving F0 control, a new score, or learned vibrato placement.

The identity path matches the official mel with max absolute error0. Both
forwards preserve450frames/115,200samples without output pitch correction,
alignment search, trimming, source-waveform insertion or post-filtering. The
actual two-forward run took22.47seconds; source/model/code43bindings were
unchanged. Auditions038/039/040 are original/unchanged/+1, all4.8s,48kstereo,
full230,400decoded frames, measured−24.0LUFS and0600. Their gains are separate
programme-level constants, not AGC.

Independent YIN checks retain the same470/480source-fixed stable frames. The
unchanged version has100%voicing/±50c agreement; +1has100%voicing and468/470
within50c of its target (median absolute error11.09c, p9536.56c). Its median
shift versus unchanged synthesis is98.69c. These establish approximate pitch
movement, **not preservation of the original vibrato**: same-time source pitch
contour correlations are only0.612/0.702 and measured residual pitch variation
increases. These are imperfect estimator proxies, not an auditory verdict.

A single separate exploratory input-level control is retained rather than
silently replacing the first run. `run_input_level_control.py` applies one
source-derived constant+19.634dB (peak0.05215→0.5), repeats the same0/+1pair,
then applies the reciprocal constant to each waveform.0.5is a conservative
test setting, not the official training normalization target0.95. This run
took34.98seconds. No framewise gain, normalization of individual notes, or
further level search occurred. The +1target error improved modestly, but
unchanged-pitch results partly worsened and contour correlations decreased;
**input level is not established as the cause or cure of vibrato differences**.
This arm is not promoted as an improvement. Both runs, reports, saved mels and
native WAVs remain private. The complete folder is about13MiB, under the
announced30MB limit. Four actual model forwards total; model weights unchanged.

Ten spectral-control and six fixed-level synthetic tests join the original
thirteen wrapper tests:29pass without reading real recordings/checkpoints or
instantiating the public model. Game defaults and original source files remain
unchanged. Permission to continue after027/037 was not broad timbral approval
or acceptance of this different vibrato recording, and does not make the
decoder a score-conditioned instrument.

## User rejection: 2026-10-23

The user judged the038/039/040 comparison: “이상해.. 대금 소리같지도 않고,
비브라토도 불안정”. Generated039/040 are rejected, not approved instruments.
The unchanged-pitch reconstruction039 already loses the required identity;
the+1 spectral warp cannot be the sole explanation. Verified configuration,
sample rate, official mel identity, strict checkpoint loading and unchanged
input bindings did not reveal an implementation error. This does not prove
that every possible software fault is absent, or identify a unique acoustic
cause. Approximate pitch movement and finite outputs were insufficient gates.

Do not promote this decoder, smooth the measured vibrato into apparent success,
or conceal the failure with EQ/source-waveform mixing. Preserve all existing
artifacts. A separate synthetic full F0-conditioned architecture/device probe
is in `../sifigan-readiness/`; it is not a new daegeum model or quality result.
