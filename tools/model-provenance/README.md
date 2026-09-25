# Official pretrained-model provenance gates

This directory validates already-obtained official model artifacts without
running, extracting, training, or rendering them. It is not an installer and
does not imply a right to use an artifact in R&D, a game, training, or public
distribution.

## MIDI-DDSP / URMP 9.10 archive

`midi_ddsp_official.py` pins the official Magenta source ref, the separate
`models` ref, expected archive/member SHA-256 values, declared runtime, and the
13 instruments named in the source README. It inspects a ZIP by streaming its
members; no TensorFlow import or checkpoint execution occurs.

```sh
python3 tools/model-provenance/midi_ddsp_official.py \
  --archive _bgm_rnd/midi-ddsp-official-weights-audit-r1/midi_ddsp_model_weights_urmp_9_10.zip \
  --output _bgm_rnd/midi-ddsp-official-weights-audit-r1/provenance.json \
  --confirm-no-execution
```

The official code downloader points at a ZIP on the repository's `models`
branch. The main source branch has Apache-2.0, but the audited `models` tree
and ZIP contain no LICENSE/NOTICE or model card. Therefore this tool always
records pretrained-weight R&D and game rights as **not proven**, even when the
bytes match exactly. Do not interpret a byte match as a licence grant.

```sh
python3 tools/model-provenance/test_midi_ddsp_official.py
```
