# Fail-closed MIDI-DDSP Daegeum dataset adapter

This is a metadata-only contract adapter for a possible future Daegeum
fine-tuning dataset. It is not an audio converter, TFRecord writer, feature
extractor, trainer, MIDI-DDSP installer, renderer, or game-asset pipeline.

It can inspect explicitly named JSON/JSONL metadata and feature *metadata*
sidecars. It never opens source audio, MIDI, or cached feature `.npz` arrays;
never copies audio; and never writes TFRecords, tensors, checkpoints, or
default BGM files. The report's access ledger makes those zero-access facts
auditable.

## Current 192-file bundle: intentionally blocked

Run a metadata-only readiness report against the controlled NGC bundle:

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-daegeum-adapter/adapter.py \
  --controlled-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-20260924/ngc-extended-daegeum-sanjo.manifest.json \
  --controlled-bundle _bgm_rnd/daegeum-transition-bank-ngc-20260924-205600 \
  --output-dir _bgm_rnd/midi-ddsp-daegeum-adapter-blocked-r1-YYYYMMDD-HHMMSS
```

The present bundle is expected to be `blocked`: its NGC manifest is R&D-only,
marks its source entries ineligible for model-training/game assets, and does
not say `training_allowed: true`. The feature catalog's local R&D status,
auto-generated F0 proxies, and unreviewed label template do not change that.
Neither a catalog licence notice nor a source checksum is silently upgraded to
training permission.

## What would be required later

A later data owner must provide two new, separately reviewed JSON records:

1. A `mini.midi-ddsp-daegeum-adapter.rights.v1` manifest with explicit
   `training_allowed: true`, an approval identity/authority, a matching
   `approved_dataset_id`, and each required local-training/derived-feature/
   training-record scope flag set to true. For real data (never the synthetic
   fixture), it must also SHA-256 verify two present, non-audio local files:
   the user's download/approval receipt and a snapshot of the applicable terms.
   It also identifies the locally downloaded source via
   `local_dataset_source.provider`, `catalog_dataset_id`, and
   `locally_downloaded_by_user: true`; this keeps `aihub_71470` a generic
   candidate rather than a hard-coded privilege.
2. A `mini.midi-ddsp-daegeum-adapter.training-contract.v1` paired contract.
   Its source bytes remain unopened by this tool, but every declared item must
   name a continuous mono WAV, aligned MIDI, exact identities, and explicit
   scored/gesture records.

Even a structurally valid rights manifest is an attestation, not legal advice
or independent authentication by this code. This utility still emits no
training data if such a manifest is supplied; a separately reviewed exporter
would be needed after rights confirmation.

## AI Hub candidates: discovery hints, not permission

`aihub_71470` (국악 악보 및 음원 데이터) is the preferred future acquisition
candidate because its official catalog describes WAV, aligned MIDI, and JSON
labels. The project must first obtain the user's approved local download,
inventory its actual Daegeum subset, and bind its local receipt plus terms
snapshot to the rights manifest above. The adapter never logs in, applies,
downloads, or assumes that catalog availability grants this project training
rights. The official catalog also notes that MIDI/audio synchronization still
needs validation per local pair. [AI Hub 71470](https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=realm&currMenu=&dataSetSn=71470&topMenu=)

`aihub_71955` is a separate future continuous-audio/timbre candidate: its
official catalog reports WAV multitracks and a Daegeum class, but this adapter
does not assume it supplies the aligned MIDI and explicit breath/rearticulate/
slur/vibrato labels required for fine-tuning. It must pass the same local
receipt, terms, pairing, and human-review gate. [AI Hub 71955](https://aihub.or.kr/aihubdata/data/view.do?aihubDataSe=data&dataSetSn=71955)

## Paired contract mapping

| Contract input | Future MIDI-DDSP-facing requirement | Important limit |
| --- | --- | --- |
| Continuous mono WAV | Reconstruction target plus later audio-derived F0/loudness inputs | The adapter never opens it. |
| Aligned MIDI/score | `pitch`, `onset`, `offset`, `note_length` at 250 Hz | Monophonic, score/audio alignment ≤ one 4 ms frame. |
| Measured, human-validated note targets | `volume`, `vol_fluc`, `vibrato`, `brightness`, `attack`, `vol_peak_pos`, each `[0,1]` | Labels do not magically determine these values. |
| `breath_start` / `rearticulate` / explicit `slur` | Auxiliary boundary supervision for later analysis | Touching notes never imply slur. |
| Vibrato enabled/rate/depth/onset/ramp | Unit-range `vibrato` target plus preserved rate/depth metadata | Rate is not a seventh documented MIDI-DDSP expression field. |
| Post-note release | Auxiliary release annotation | Not one of the six conditioning fields. |

The six expression targets use the documented MIDI-DDSP field order:
`volume`, `vol_fluc`, `vibrato`, `brightness`, `attack`, `vol_peak_pos`.
No Daegeum MIDI-DDSP instrument ID is invented here.

## Synthetic contract fixture

The fixtures prove the schema and explicit-articulation rules while pointing
at deliberately nonexistent audio/MIDI paths. A successful run demonstrates
that no such path was opened; it is **not** permission to use real data.

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-daegeum-adapter/adapter.py \
  --rights-manifest tools/midi-ddsp-daegeum-adapter/fixtures/synthetic_training_rights.json \
  --training-contract tools/midi-ddsp-daegeum-adapter/fixtures/synthetic_training_contract.json \
  --output-dir _bgm_rnd/midi-ddsp-daegeum-adapter-synthetic-r1-YYYYMMDD-HHMMSS
```

Expected status: `synthetic_contract_validated_metadata_only`.

## Verify

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-daegeum-adapter/test_adapter.py
/tmp/durango-bgm-rnd-venv/bin/python tools/midi-ddsp-daegeum-adapter/adapter.py --dry-run
```
