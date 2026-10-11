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
