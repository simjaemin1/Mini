# WORLD source-copy diagnostic

This is parameter analysis/resynthesis of existing public National Gugak Center
recordings, **not a new melody, an original-PCM copy, ML training, or a timbre
approval**. Original source files remain read-only; no external weights are used.

The fixed primary is **Harvest** (`70..1800 Hz`, `5 ms`) → CheapTrick → D4C
(`threshold=0.85`, the same FFT size) → WORLD synthesis. The .85 threshold is
documented upstream for Harvest. There is no DIO/StoneMask fallback, F0
interpolation, EQ, denoising, or automatic parameter search. Failed cases remain
in the report rather than being silently repaired.

Three preselected source intervals are SHA-bound through the existing public-NGC
preparation manifest: `sus_04 [0,4.8)`, `vib_39 [2,6.8)`, and
`Arirang002 [0,4.8)`. Each is decoded to 24 kHz mono float64. Source F0, spectral
envelope, and aperiodicity are copied into synthesis. WORLD does not retain the
original phase or exact breath/noise waveform. In particular, this speech
vocoder may still fail to preserve daegeum membrane/breath naturalness.

`run_world_copy.py --manifest /private/manifest.json --output /new/private/run`
uses an already prepared runtime with `pyworld==0.3.5`, NumPy, SciPy, SoundFile,
psutil, and FFmpeg. It installs nothing. The output directory must not exist and
must be inside `~/Mini/_bgm/gpt/`. Runtime is bounded to 300 seconds, 12 GiB
conservative process/driver allocation and 12 GiB free disk; all output files
are capped at 80,000,000 bytes. Source excerpts and resynthesized outputs are
separately labelled 24 kHz mono FLOAT plus 48 kHz dual-mono FLOAT for the
existing comparison helper. The latter is only sample-rate conversion, not a
pitch shift. Analysis includes its terminal frame; synthesis is right-trimmed
to the original 115,200 samples, with the exact removed length recorded.
Each private0600 compressed NPZ retains all float64 control arrays and the
exact decoded float64 source waveform, without quantization or pickle.
Array hashes in the report permit exact input/control reproduction; source
WAVs are explicit FLOAT32 listening copies. Initial/final resource snapshots
are reported. A budget failure preserves failed-case metadata without silently
quantizing or changing the original controls.

Default pitch shift is zero. The only optional experimental flag is
`--pitch-shift 1`: multiply **positive** F0 by `2**(1/12)` while preserving
zero/unvoiced rows and byte-identical spectral-envelope/aperiodicity arrays.
This is marked a pitch-transformed original, not a newly composed performance.
Both source and synthesis control hashes, F0/voicing ranges, SP/AP dimensions
and bounds, and voiced frames with all AP bins approximately one are reported.
Numerical integrity is not pitch-ground-truth or listening approval.

For the existing NSF 1-second copies, the same public helper is available:
`analyze_and_synthesize(audio, sample_rate=24000, pitch_shift=0)` returns
`(float64_mono_audio, controls, facts)`. It does not save files. `controls` keys
are `f0_hz`, `synthesis_f0_hz`, `time_seconds`, `spectral_envelope`, and
`aperiodicity`. It accepts audible finite 0.1–4.8-second 24 kHz mono arrays
aligned to a 5 ms sample grid. Passing `world=` is for synthetic/mock tests.

Software licenses are [PyWORLD MIT](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder/blob/master/LICENSE)
and [WORLD modified-BSD](https://github.com/mmorise/World/blob/master/LICENSE.txt);
retain their notices when distributing software. Recording rights remain
separate. Preserve the source-credit and local-research scope in the input
manifest. [Official API/threshold documentation](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder/blob/master/pyworld/pyworld.pyx).

## Actual 2026-10-18 tests, not a timbre approval

All three fixed source-copy cases completed in3.96s. Sus/vibrato source-fixed
independent YIN masks retained378/470steady frames with100%voicing and±50-cent
agreement. The Arirang case failed at78.95%of285frames; it was not hidden by
changing the mask or a pitch-class comparison. All files and original hashes
were retained. Each source/copy AAC is4.8s with static-24LUFS matching.

The same two saved1s sources used in the rejected NSF diagnostics were also
resynthesized with WORLD. `build_saved_copy_comparison.py` creates source1s,
silence0.4s, rejectedNSF1s, silence0.4s, WORLD1s. Each excerpt is-24LUFS;
the whole3.8s file has lower integrated loudness because of the gaps. This is
a controlled reconstruction comparison, not a new tune or a blind evaluation.

A separate+1semitone run preserved original F0/time/SP/AP hashes and changed
only positive synthesis F0. The two low-register cases retained pitch; the
high Arirang case still failed. No claim of learned composition or vibrato
placement follows from this small parameter-control test.

### Isolated high-register D4C gate ablation

The default speech D4C gate set all aperiodicity bins≈1 for16.28%of voiced
Arirang controls. On the same affected time frames the source was predominantly
YIN-voiced but output was not; this was not explained by a level drop alone.
`run_aperiodicity_ablation.py` therefore reads the bound original controls and
source, recomputes **only** AP with the documented legacy `threshold=0`, and
synthesizes each of the same three cases. It never re-extracts/repairs F0,
modifies SP, overwrites the original run, or silently retries parameters.

All three ablations completed in1.72s. The low cases were unchanged; high-case
APall1 declined to0 and same-mask pitch/voicing agreement became100%of285frames
(median0.99c,p955.40c). This isolates an avoidable dropout in this WORLD
configuration, **not** the cause or cure of all earlier NSF mechanical timbre.
Threshold0 bypasses the extra voiced/unvoiced rejection, not measured noise.
Subjective daegeum identity still requires its own listening judgement.

The ablation is bounded to300s/40MB and keeps new AP-only NPZ,24kmono/48kstereo
FLOAT WAVs, input/control/source SHA bindings and10ms source/default/ablation
RMS traces. Failed pilot models, original recordings and game defaults remain
unchanged; there is no new ML training, model download or audio upload.
