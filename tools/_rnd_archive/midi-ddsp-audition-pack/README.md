# MIDI-DDSP monitoring audition pack

`build_audition_pack.py` makes fresh, R&D-only listening copies of the two
WAVs recorded by a successful
`mini.midi-ddsp-official-flute-rnd.v1` report.  It is deliberately a small
post-render monitoring tool, not a renderer and not an expression editor.

For the fixed official-flute report, run:

```sh
python3 tools/midi-ddsp-audition-pack/build_audition_pack.py \
  --report-dir _bgm_rnd/midi-ddsp-official-flute-runtime-r1-20260925-121434 \
  --output-dir _bgm_rnd/midi-ddsp-monitoring-audition-pack-r1-YYYYMMDD-HHMMSS
```

The destination must be fresh and outside the source report directory.  The
tool verifies each source WAV against the report SHA-256 before use and again
before it writes the fresh copies, so the source A/B artifacts remain
read-only.

## Fixed operation

It measures PCM sample RMS only over the common authored-active interval
`[0.00, 6.48)` and chooses one scalar for each complete file so both output
intervals target `-24.0 dBFS`.  It does not compute or apply an envelope.  A
whole-file output peak above `-3.0 dBFS` causes a fail-closed error before the
output directory is created.  This permits safe, explicit amplification of a
quiet file, but it never substitutes a limiter or compressor.

The only sample operation is `PCM16 round(source_sample * that_file_gain)`.
There is no compression, limiter, normalization envelope, fade, EQ,
resampling, trimming, timing shift, source-audio modification, or MIDI-DDSP
inference.  B's existing `6.48–6.72 s` release receives the exact same scalar
as every other B sample; the sidecar records and verifies that invariant.

`monitoring_audition_manifest.json` records the report hashes, measured RMS,
whole-file gains and peaks, fixed target/ceiling, and transform prohibitions.
It also explicitly says that matching is a listening-only aid: it is neither
physical loudness calibration, expression calibration, a model output, a
Daegeum-performance claim, nor a production/default-BGM change.

Run the deterministic tests with:

```sh
python3 tools/midi-ddsp-audition-pack/test_build_audition_pack.py
```
