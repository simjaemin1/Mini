# Daegeum training readiness and private source triage

The existing [`aihub-paired-ingest`](../../aihub-paired-ingest/README.md) gate
checks an explicitly named future local WAV/MIDI/JSON bundle for scope, path,
hash, length, and shallow file signature. It **does not** decode WAV, parse
MIDI notes, or compare performance and annotation timing. This independent
prototype tests those missing ideas using generated sine-wave fixtures only.
Later sections describe separate, bounded tools for the applicant's approved
private AI Hub 71470 data.

```bash
python3 tools/bgm-gpt/aihub-readiness/synthetic_pair_quality.py
python3 -m unittest tools/bgm-gpt/aihub-readiness/test_synthetic_pair_quality.py -v
```

The command accepts **no file paths or URLs**, does no network access, writes
no files, and trains no model. Its five in-memory scenarios cover a matched
PCM16 WAV/MIDI/annotation note, silence, clipping, a wrong dominant spectral
peak, and a 240 ms audio/MIDI onset offset. Unit tests also exercise an
annotation mismatch, a truncated audio performance, and malformed input. The
JSON report contains measurements and review flags, not source audio bytes.

The annotation shape (`mini.synthetic-paired-note-smoke.v1`) is an invented
normalized fixture, **not a claim about AI Hub 71470's actual JSON schema**.
Dominant spectral peak is not reliable fundamental-frequency estimation for
breathy or harmonic-rich daegeum; its mismatch flag is only a triage hint,
not a pass/fail musical judgment. Thresholds are test probes, not empirically
calibrated dataset acceptance criteria. Passing this synthetic smoke does not
mean a real pair is usable for training, sounds authentic, or is licensed.

**Rights gate:** The applicant separately accepted the AI Hub 71470 terms
and the site reported automatic approval on 2026-10-12. The real-data tools
below are confined to this approved local R&D dataset and private directory.
The synthetic smoke above still must not receive NGC originals, AI Hub
recordings, or DDSP-Gugak assets. Neither approval nor a passed smoke test
grants permission to ship source audio, use a third-party checkpoint, or
replace a game/default asset.

## 71470 acquisition facts (checked 2026-10-12)

The [official dataset page](https://www.aihub.or.kr/aihubdata/data/view.do?currMenu=115&dataSetSn=71470&topMenu=100)
lists 900 clips tagged as daegeum (`WN01`) and a total compressed dataset
size of **19.20 GB**. It says only *some* MIDI scores are synchronized with
audio and WAV/score matching needs segment cleanup. Thus 900 is not a count
of clean, aligned solo training examples. The published JSON schema includes
`music_trk_nmbr`, `instrument_cd`, optional `main_instr_player`, and optional
sigimsae spans. Validate their actual values before implementing a real-data
adapter; the synthetic fixture above does not mirror that schema.

The [official API guide](https://www.aihub.or.kr/devsport/apishell/list.do?currMenu=403&topMenu=100)
supports public file listing and, after dataset approval, downloading by
`filekey`;
it recommends **2–3×** the compressed size for download/extraction. The Mac
had about 15 GiB free before selective acquisition, so a full
download/extraction here is not safe.
The public file listing (read-only `-mode l -datasetkey 71470`, 2026-10-11)
groups audio by **genre**, not by instrument. In particular, traditional
folk-music training source `TS_전통국악_F_민속악.zip` is 7 GB (filekey `504208`)
and its label archive is 4 MB (`504213`); validation source is 1 GB
(`504222`) with a 532 KB label archive (`504227`). Daegeum may also occur
in other genre packages. A safe acquisition sequence after approval is to
download the small label archives first, count `WN01` entries and inspect
their references, then fetch only a source archive whose labels contain
usable candidates. Do not infer that the folk ZIP contains all 900 clips.
The folk training ZIP alone would exceed this Mac's safe extraction budget.
The applicant completed the site login and consent flow and the page reported
automatic approval on 2026-10-12. No credentials or API keys are stored by
these tools. Ten small label archives and three selected source archives are
held in a private, Git-ignored directory outside this repository. The WSL
RTX 4060 training host is not yet verified. Keep original WAV/MIDI/JSON and
derived per-clip data out of the repository and public assets.

The [AI Hub policy](https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105)
restricts the supplied raw data to model training, prohibits unapproved
redistribution and requires attribution. Its
[FAQ](https://aihub.or.kr/aihubnews/faq/list.do?currMenu=146&topMenu=104)
allows commercial distribution of trained models/services with dataset-name
and AI Hub credit, not redistribution of raw or merely edited recordings.
Record the terms presented to the actual applicant and review near-copy
outputs before any game release. None of this licenses the separate
DDSP-Gugak checkpoint.

## Read-only local label ZIP inventory

After the applicant has lawfully obtained a **small label TAR** from the
browser, normalize its single `.zip.part0` member to a new private ZIP. The
normalizer verifies archive bounds and ZIP CRCs, never extracts JSON, rejects
repository output paths, and creates the ZIP with mode `0600`. Then inspect
that explicitly named ZIP without extracting it:

```bash
python3 tools/bgm-gpt/aihub-readiness/normalize_label_tar.py \
  --tar /absolute/private/path/label.tar \
  --output /absolute/private/path/label.zip
python3 tools/bgm-gpt/aihub-readiness/inventory_label_zip.py \
  /absolute/private/path/label.zip
python3 -m unittest tools/bgm-gpt/aihub-readiness/test_normalize_label_tar.py -v
python3 -m unittest tools/bgm-gpt/aihub-readiness/test_inventory_label_zip.py -v
```

The inventory command makes no network request, reads no API key, writes no file, and
prints only aggregate counts plus per-JSON-member indices, sizes, and parse
statuses. It never prints local paths, ZIP member names,
annotation values other than the literal `WN01` tally, or performer names.
Traversal-style ZIP member names and symlinks are skipped; nothing is
extracted. AI Hub's actual validation-label ZIP uses a single leading `/`
on JSON member names. Those entries are counted under
`read_only_absolute_name_members` and parsed **only in memory** through their
ZIP entry handles, never used as filesystem paths.
Archive, member, total JSON byte, line, and JSON-structure limits bound the
scan. It reports exact `WN01` string values and matches in the documented
`instrument_cd` field **only in successfully parsed files**. These are not
unique clip counts, verified daegeum solos, or usable WAV/MIDI pairs. Skipped
and unparseable files make the totals lower bounds. The actual AI Hub schema
must still be checked against authorized data before relying on the counts.

## Read-only source archive and pair triage

Source packages arrive as TAR files containing one `.zip.part0` or a ZIP split
across `.partN` members, sometimes in separate TAR downloads. `N` can be an
ordinal or the ZIP byte offset (the actual `TS_E` uses 0, 1073741824, ...).
The inspector verifies that the pieces form a contiguous ZIP under either
scheme; it does not assume every `N` is a part number.
The structural inspector reads their central directory in place (including
bounded ZIP64) without copying, extracting, or decompressing source audio.
Pass each TAR explicitly and in any order; missing or mixed parts fail closed:

```bash
python3 tools/bgm-gpt/aihub-readiness/inspect_source_tar.py \
  --tar /absolute/private/path/source_part0.tar \
  --label-zip /absolute/private/path/label.zip
python3 -m unittest tools/bgm-gpt/aihub-readiness/test_inspect_source_tar.py -v
```

Its aggregate `wn01_pair_linkage` checks only whether each WN01 label's
extensionless `music_source_info.music_src_nm` has a unique `.wav` and `.mid`
name in the source ZIP. It does **not** prove that the payloads are readable,
that the audio is solo daegeum, or that notes and performance times align.
No source paths, filenames, performer names, or payload bytes are printed.

For a bounded first pass over the actual WN01 payloads, use the separate
read-only audit. It reads only uniquely named pairs, at most 64 MiB per WAV,
8 MiB per MIDI, and 2 GiB of payloads in total, one file at a time. It checks
basic PCM format, labeled duration, approximate silence/clipping, MIDI
note-on count, and a **rough** MIDI end time:

```bash
python3 tools/bgm-gpt/aihub-readiness/aihub_pair_quality_audit.py \
  --source-tar /absolute/private/path/source_part0.tar \
  --label-zip /absolute/private/path/label.zip
python3 -m unittest tools/bgm-gpt/aihub-readiness/test_aihub_pair_quality_audit.py -v
```

Repeat `--source-tar` for every split TAR. Outputs contain aggregate counts
only. A good header or matching duration is not an audio-quality judgment;
the MIDI end time may reflect notation or trailing events rather than an
aligned recorded note. Audit results must not be used to merge the official
training and validation splits or to publish original dataset audio.

## Actual 71470 daegeum triage, 2026-10-12

All ten label archives parsed (9,961 JSON files). They contain 816 records
whose `instrument_cd` is exactly `WN01`: 769 training and 47 validation.
This differs from the official page's 900-clip figure for an unresolved
reason; neither figure is a verified solo/aligned training count. The small
`VS_R` validation source yielded 17 named WAV/MIDI pairs; **none** enter
training. `TS_C` training yielded 14 named pairs, only four mono, totaling
about 154 seconds of labeled audio.

The selected `TS_E` training TAR is 5,187,421,184 bytes and contains five
byte-offset-numbered ZIP parts. The virtual ZIP has 2,564 WAV and 2,564
MIDI members. All 331 `WN01` labels in `TL_E` uniquely match both names and
all 331 WAVs were decoded for a bounded read-only audit. Their durations
match labels within 0.1 s; 263 are mono and 68 stereo; no approximate
near-silence or obvious clipping was flagged. A rough MIDI-total-time check
differs from WAV by over one second in 228 cases. This is **not** a proven
note-alignment failure, but it forbids treating filename matches as a
score-to-performance training set without further analysis.

For a WAV-only instrument-timbre pilot, a private selector groups labels by
identical performer, recording place, and channel; these fields do **not**
prove solo recording. Its largest group, `C001`, has 250 mono 48 kHz clips
from 19 titles and 4,928.804 s of labeled duration. All 250 also declare
`music_trk_nmbr == 1`, but that is a track-count label, not an acoustic proof
that no accompaniment leaked into the mic. Run the selector with
the approved, private training label ZIP and save the detailed manifest
outside the repository:

```bash
python3 tools/bgm-gpt/aihub-readiness/select_daegeum_cluster.py \
  --label-zip /absolute/private/path/TL_E_training.zip \
  --split training \
  --output /absolute/private/path/TL_E_clusters.json
```

The following command probes only the chosen WAVs, by default without
writing audio. It refuses stereo input, missing/ambiguous names,
label/header/duration mismatch, validation split, unsafe output paths, and
insufficient disk. `--materialize` then creates a **new** 0700 directory
with 0600 16 kHz mono PCM16 WAVs and a private provenance manifest; it will
not overwrite an existing directory. It never places recordings in Git.

```bash
python3 tools/bgm-gpt/aihub-readiness/prepare_selected_audio.py \
  --tar /absolute/private/path/TS_E_training.tar \
  --manifest /absolute/private/path/TL_E_clusters.json \
  --cluster-id C001 \
  --output-dir /absolute/private/path/TS_E_C001_16k_mono
# Add --materialize only after the read-only summary is accepted.
```

The local `C001` preparation produced 250 private WAVs totaling 157,742,678
bytes, with source CRC, format, and duration checks. Originals are retained.
An aggregate read-only pass found a median clip duration of 20.97 s and
median RMS of -36.8 dBFS; 31 clips have over one-quarter of 100 ms windows
below -50 dBFS, and two have a tiny number of near-full-scale samples.
None is a wholesale silent file. In 19 matched source/prep representatives,
the median original 8-20 kHz power fraction was 0.00016. That low fraction
does **not** rule out perceptually important breath texture.
This is *model input*, not a trained model or a new BGM. A 16 kHz pilot may
lose some high-frequency breath detail, so audible comparison against
original 48 kHz performances and a held-out test are required before any
claim of daegeum-like quality. Score-to-expression, breath phrasing, and
sigimsae placement remain separate unsolved tasks; MIDI and timestamp labels
have not been acoustically aligned. No game/default BGM or `main` files were
changed.

## Song-held-out DDSP pilot gate

See [`DDSP_WSL_PILOT.md`](DDSP_WSL_PILOT.md) for the primary-source-backed
WSL/RTX 4060 compatibility gate and official DDSP commands. The separate
`ddsp_wsl_pilot.py split` checks every prepared WAV's format and SHA-256 and
keeps whole labeled songs out of training. On the private `C001` set it
created hard-link-only partitions: 216 training clips (4,189.610 s, 15 song
groups) and 34 held-out clips (739.201 s, 4 song groups). No model was
trained, and no source audio or checkpoint entered Git. A read-only check at
DDSP's default 4 s window/1 s hop found 3,432 candidate training windows;
21 had full-window RMS below -50 dBFS and none below -60 dBFS. This checks
for pervasive long silence, not pitch quality or solo instrumentation.

The official DDSP solo-instrument model accepts measured F0 and loudness;
that makes it an instrument-timbre reconstruction experiment, **not** a
learned breath/vibrato composer. Its legacy TensorFlow/CUDA dependency stack
is untested on the user's 4060, so the WSL gate must demonstrate an actual
GPU operation and a tiny DDSP train step before a full pilot. A failed gate
would not prove daegeum ML synthesis impossible; it would reject this
specific environment/configuration. [IRCAM's PyTorch DDSP](https://github.com/acids-ircam/ddsp_pytorch)
has a published 16 kHz, 100 Hz F0/loudness example configuration, but its
legacy preprocessing and CUDA/CPU-only training script need Mac adaptation.
[RAVE](https://github.com/acids-ircam/RAVE) is not an independently
score-controlled model and its [code license is CC BY-NC
4.0](https://raw.githubusercontent.com/acids-ircam/RAVE/master/LICENSE), so
game use needs separate rights review before choosing it as a fallback.

## Expression supervision is a separate problem

Read-only inspection of the same `C001` labels found 1,481 timestamped
sigimsae spans in 249 of 250 clips: 1,104 `VB01` (small vibrato) and 377
`DW01` (falling ornament). The other `VB`/`DW` types did not occur in this
cluster. `VB01` spans cover about 20.36% of labeled time. Of them, 777 have
at least 0.5 s free of *other annotations* on both sides, which makes them
useful boundary-review candidates but does **not** establish that those
surroundings are voiced flat tones. Seven event pairs overlap in six clips.

The annotations have clip-local millisecond start/end strings, but no note
ID, pitch, breath, or score alignment. A defensible expression stage first
extracts F0/voicing/confidence and loudness from the private original WAVs,
checks the acoustic onset/release of labeled ornaments, masks uncertain
boundaries, aligns MIDI notes to WAV using pitch/attack evidence and manual
spot checks, and evaluates on the held-out songs. Only then can a
score-conditioned model learn *when* and *how* to enter/leave vibrato. The
DDSP timbre pilot alone cannot make that musical decision.

### Small acoustic check of the VB01 labels

`audit_vibrato_boundaries.py` is a **read-only diagnostic**, not a validated
expression model. It uses 80 ms autocorrelation-style F0 frames and a strict
3.5–8.5 Hz periodic-modulation test on 0.5 s windows. A synthetic-only unit
suite checks flat, modulated, breath-noisy, silent, and gliding cases. The
approved private `C001` input yielded 177 clips with an isolated candidate
VB01 span; the fixed-seed run sampled one span from each of 160 clips.

The center of 120/160 annotated spans met the strict modulation criterion.
An unannotated control from the same clip was analyzable in 119 cases; 18 of
those met it. The start-side windows were both analyzable in 112 cases, with
41 flat-to-modulated patterns; the end-side windows were both analyzable in
85 cases, with 27 modulated-to-flat patterns and 49 still modulated after the
label. This supports further VB01 **presence** research, but not treating the
published start/end milliseconds as precise acoustic onsets/releases. The
half-second windows blur boundaries by roughly 0.3 s; breath noise, attacks,
unlabeled ornaments, and estimator errors remain. The unannotated controls
are not confirmed straight tones, and the isolated sample is not a random
sample of every VB01 event. No private waveform, per-event result, or model
was exported. Acoustic pitch-class counts are only a stratified sample with
possible overtone errors; they do not establish MIDI/audio alignment or
eight-bar-score compatibility.

The same script sampled eight half-second windows from each of the 250
prepared clips: 1,564/2,000 windows had analyzable F0. In 65,217
high-confidence frames within MIDI notes 55–90, the current score's G4 and
C5 appeared in only 83 and 295 frames respectively. A comparison of the
five exact score pitches G4/A4/C5/D5/E5 versus the same melody transposed
two semitones (A4/B4/D5/E5/F#5) counted 25,043 versus 37,943 correlated
frames in this stratified sample. This raises a **coverage question** for a
model trained only on `C001`; it is not a music-fit score or authorization
to transpose the existing draft. YIN can make overtone/octave errors, and
these acoustic estimates are not aligned to the supplied MIDI or the new
score. A future audition may compare keys, but neither one is selected here.

## Score-only conditioning bridge, not a renderer

`score_ddsp_conditioning_adapter.py` converts the existing authorial
19.2-second expression plan's 48 kHz/300 Hz controls in memory into a
16 kHz/250 Hz **candidate** F0/loudness grid (307,200 samples and 4,800
control rows). It preserves explicit rest, breath-start, rearticulation,
and slur ownership across the rate change; it does not read audio, load a
checkpoint, train, synthesize, or modify game playback. Its boundary tests
use only the public score and synthetic mutations.

The 250 Hz choice matches Magenta DDSP's published **default** solo setup,
not every DDSP checkpoint. That decoder takes F0 and loudness, not the
separate air/noise/gesture states. Its preprocessor normally recomputes
loudness from audio, so actual score-only inference must disable that and
verify the trained model's exact feature meaning and frame rate. Even with
the bridge, audible breath timbre and attack realism remain unproven.

`score_ircam_conditioning_adapter.py` separately maps the same unchanged
score to the IRCAM pilot's 100 Hz grid (1,920 rows). Its F0, authored dB
intent, rest/breath/rearticulation ownership, and optional +2-semitone
comparison are **candidate controls only**. The model's measured
weighted-log-spectrum loudness is not the score's authored dB envelope;
the adapter deliberately emits no model loudness tensor and rejects
inference. Training-only loudness calibration, bound to the exact feature
extractor, split, and checkpoint, plus held-out and listening validation are
required before those controls can drive this model. A 12 ms authored slur
occupies only one or two 100 Hz rows, so its rendered articulation is also
unproven. Public-score/synthetic tests enforce these boundaries.

## Bounded Mac MPS data-path pilot

`mac_mps_ddsp_features.py` and `mac_mps_ddsp_pilot.py` provide a separate,
small IRCAM PyTorch DDSP feasibility path. This is **not** the Magenta 250 Hz
path above: the pinned IRCAM example has 16 kHz audio and 100 Hz (160-sample)
pitch/loudness frames. The local YIN pitch extractor replaces CREPE for this
pilot and is an imperfect measurement, especially for fast ornaments. The
loudness feature was compared against the upstream formula with librosa 0.11
on synthetic sine, vibrato, noise, and silence; maximum absolute differences
were below 0.000001 after matching the 0.11 zero-padding behavior. Neither
synthetic agreement nor F0 confidence proves that a recording is a pure solo
or that its MIDI is aligned.

The `private` command deliberately requires the approved, private 16 kHz
manifest and song-held-out split. It rejects validation data, duplicate names
or hashes, cross-split song groups or inodes, repository/public paths,
world-readable private inputs, excess disk use, more than ten clips or twenty
steps. Source WAVs and their feature windows remain in memory. Ordinary
Python socket APIs are guarded during the private run, but this is **not** an
OS network sandbox. It writes only a 0600 aggregate report in a separate
0700 directory—no checkpoint, generated audio, per-file features, or source
names.

On 2026-10-12, the Mac M4 MPS trial selected one four-second window from each
of five different training song groups and completed 20/20 steps with finite
loss and gradients, no CPU fallback, and no held-out input. The private report
records this limited fact only. It establishes a runnable local **learning
path**, not timbre quality, generalization, vibrato timing, or a playable new
BGM. The 64 ms YIN window attenuated 5–7 Hz vibrato depth by roughly 14–27%
on synthetic tones, so it must not be used as validated expressive ground
truth. A longer pilot will need a private checkpoint and strictly held-out
reconstruction listening before score rendering can be judged.

`audit_yin_window_quality.py` compares 32 ms and 64 ms YIN on identical 10 ms
frames without writing source audio or per-frame results. In the private
250-clip aggregate, 118 isolated `VB01` events passed the shared-voicing and
periodicity gates; their median 32/64 ms modulation-depth ratio was **1.064**.
In the sparse 80–150 Hz stratum selected by the 64 ms tracker, median tracker
disagreement was **490 cents**, so neither estimate is established as true F0.
The spectral-flatness “noise-like” proxy selected only five frames and is
**not a usable breath test** here. These are tracker-comparison diagnostics,
not F0 ground truth or proof of better expression. Keep the 64 ms timbre
baseline; do not promote 32 ms as the sole training pitch track without
independent low-pitch, voicing, and breath-boundary validation.
