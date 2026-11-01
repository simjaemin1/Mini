# Private score/audio timing triage

This is a new preparation step, not another timbre resynthesis comparison.
The user explicitly keeps the ACE-Step assets. Existing models, audio, datasets
and previous experiment evidence are not removed. Mac training/rendering stays
blocked while the separate free-disk requirement is not met; this small CPU-only
reader does not lower that requirement or claim additional training occurred.

The desired future component is score → time-varying instrument/expression
features. Matching filenames alone cannot provide that supervision. The existing
AI Hub71470 C001 collection has250prepared mono WAVs and a song-disjoint
216train/34heldout split, but precise MIDI/audio synchronization is unresolved.
The prior audit only counted note-ons and rough MIDI end times.

## Bounded next measurement

Before looking at results, choose the first record in each of the first SIX
distinct TRAIN song indices, in original preparation-manifest order. This fixes
indices1,2,3,5,7,8 and samples001,034,066,115,138,148. Do not replace a poorly
matching case with a better one. No heldout file enters this measurement.

`parse_midi.py` is a pure, bounded SMF0/1 parser. It integrates integer tick ×
microseconds-per-quarter through tempo changes, with PPQN division and the
500000default. SMF1 accepts only conductor-track0tempo. It retains track/channel,
note-on/off, velocity-zero offs, rests, unmatched events, overlap, pedal/bends,
and warnings instead of silently choosing a melody track. Unsupported or
ambiguous scores stay in the six-case report but skip the affine search.
The output is nominal key timing, not acoustic attack/release or solo proof.
Timing units follow the [Microsoft MIDI timing documentation](https://learn.microsoft.com/en-us/windows/win32/multimedia/timing-information)
and [Standard MIDI Files](https://midi.org/standard-midi-files-specification).

`audit_note_pairs.py` reads six MIDI members directly through the already-tested
virtual ZIP-over-TAR reader; nothing is extracted. Selected MIDI payloads get
full CRC/SHA checks. Full source TAR SHA is NOT claimed: its identity/size/mtime
is checked before/after, and the exact read payloads are hashed. Existing
16kHz PCM16 preparation copies are read and hash-checked, not regenerated.
The existing NumPy-only100Hz YIN/RMS extractor supplies coarse acoustic evidence;
these reduced-resolution copies are NOT used to judge original timbre.

`alignment_metrics.py` compares unmodified MIDI timing with a fixed global
`audio_time = offset + scale * score_time` search:61scales0.3..1.5 and41offsets
−1..1s. The exact identity map is included and preferred on an exact objective
tie. Every candidate keeps the same audio-only support denominator
(`voiced & Hz>0 & RMS>−60dBFS`). Missing or overlapping note mappings cost200c;
valid unwrapped pitch errors are capped at200c for this search objective only.
Pitch is never shifted or octave-wrapped. Conditional pitch errors,50/100/200c
fractions, missing/ambiguous/outside frames and unvoiced/quiet frames remain
explicit. Per-note detail has a128row cap, NEVER a frame-denominator cap.
Only the best and top-five diagnostic candidates are emitted, not a giant grid.
The small triage report retains exact parsed note events but omits the bulky
per-note metric details, explicitly marking that omission; global counts stay.

The same-clip best map is an exploratory fit, not validation accuracy, local
tempo/ornament alignment, manual ground truth, or approved training labels.
No score/audio timestamps or samples are changed. Zero pairs are automatically
promoted for training. Acoustic onset, breath, reattack, vibrato timing and
within-note feature supervision still require a later checked alignment stage.

## Resources and privacy

The actual process is read-only: stdout JSON≤2MB, wall120s, RSS512MiB, noTorch,
noGPU, no model, no optimizer, no synthesized audio, no extraction or network.
This is a different small-read workload from model execution, not a relaxed
training/render guard. Save its private derived report only outside Git under
`/Users/simjaemin1/Mini/_bgm/gpt/`. Exact MIDI/note/source records are private,
not committed alongside the code. No new listening item should be advertised.

Source credit: 국악 악보 및 음원 데이터 — AI Hub (71470); 승인된 비공개 연구개발.
This step does not authorize source redistribution, international upload or
game use of the AI Hub originals. NGC/SiFiGAN models remain unchanged.

```text
python -B audit_note_pairs.py --prepared-manifest PRIVATE_PREP/private_manifest.json \
  --split PRIVATE_SPLIT/private_split.json --source-tar PRIVATE_TS_E_SOURCE.tar
python -B -m unittest discover -s tools/bgm-gpt/note-alignment -p 'test_*.py'
```

The prepared reader must use the existing private dependency environment.
No package installation, download, deletion or audio conversion is necessary.
