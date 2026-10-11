# Paired daegeum training readiness: synthetic quality smoke only

The existing [`aihub-paired-ingest`](../../aihub-paired-ingest/README.md) gate
checks an explicitly named future local WAV/MIDI/JSON bundle for scope, path,
hash, length, and shallow file signature. It **does not** decode WAV, parse
MIDI notes, or compare performance and annotation timing. This independent
prototype tests those missing ideas using generated sine-wave fixtures only.

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

**Rights gate before any real-data use:** Obtain the actual bundle and its
applicable terms through a separately authorized process; preserve the
project's access/rights-review record; inspect the real annotation schema;
review this prototype's thresholds and codec support on a small, lawful
sample; and create a separate data adapter that re-verifies the existing
ingest report's hashes. That adapter and any model training require their
own rights/scope review. Do not pass NGC originals, AI Hub recordings, or
DDSP-Gugak assets into this synthetic-only command. No game/default/public
asset permission is inferred here.

## 71470 acquisition facts (checked 2026-10-11)

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
it recommends **2–3×** the compressed size for download/extraction. The
current Mac has only about 15 GiB free, so a full download here is not safe.
The public file listing (read-only `-mode l -datasetkey 71470`, 2026-10-11)
groups audio by **genre**, not by instrument. In particular, traditional
folk-music training source `TS_전통국악_F_민속악.zip` is 7 GB (filekey `504208`)
and its label archive is 4 MB (`504213`); validation source is 1 GB
(`504222`) with a 532 KB label archive (`504227`). Daegeum may also occur
in other genre packages. A safe acquisition sequence after approval is to
download the small label archives first, count `WN01` entries and inspect
their references, then fetch only a source archive whose labels contain
usable candidates. Do not infer that the folk ZIP contains all 900 clips.
The folk training ZIP alone would exceed this Mac's safe extraction budget;
the 1 GB validation ZIP may be a practical first real-audio sample after
checking its labels and the current free space. Store API keys only in an
untracked, private location, never in this repository or logs.

The dataset Download button currently leads to an AI Hub login form. Its
application requires the applicant's own identity and purpose; the page
states domestic applicants only. No account credentials, approval receipt,
API key, dataset WAV/MIDI/JSON, or WSL RTX 4060 training host is established
in this project yet.

The [AI Hub policy](https://www.aihub.or.kr/intrcn/guid/usagepolicy.do?currMenu=151&topMenu=105)
restricts the supplied raw data to model training, prohibits unapproved
redistribution and requires attribution. Its
[FAQ](https://aihub.or.kr/aihubnews/faq/list.do?currMenu=146&topMenu=104)
allows commercial distribution of trained models/services with dataset-name
and AI Hub credit, not redistribution of raw or merely edited recordings.
Record the terms presented to the actual applicant and review near-copy
outputs before any game release. None of this licenses the separate
DDSP-Gugak checkpoint.
