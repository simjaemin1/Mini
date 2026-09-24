# AI Hub paired-data ingest: bounded R&D gate

This is a **local, read-only ingest validator** for one future AI Hub-named
bundle whose pairs contain one WAV, one Standard MIDI file, and one JSON
annotation.  It does not download, browse, discover, crawl, unzip, train,
extract features, render audio, copy source material, or touch default/runtime
BGM assets.

The tool cannot establish AI Hub approval, a license, or training permission.
Its explicit gates are only project attestations for the local bundle named in
the manifest.  A successful report means exactly this: a future, locally
available, explicitly named set of files passed its path, byte-length,
SHA-256, shallow container/document signature, and R&D-scope checks.  It is
not an assertion that the data may be redistributed, used as a game asset,
published, or used to train a model.

## Contract

The manifest is deliberately narrow.  It must sit beside the future local
bundle, and every path must be a distinct POSIX-relative path beneath that
manifest's directory.  No URL, glob, directory root, implicit companion file,
or source discovery is accepted.  A path escaping the bundle through `..` or a
symlink is rejected.

All scope and rights fields below must be literal `true`.  The wording
`does_not_claim_ai_hub_approval_or_training_authorization` is intentional:
this validator requires the caller not to mistake a local project record for
external platform authorization.

```json
{
  "schema": "mini.aihub-paired-data.rnd-local-bundle-manifest.v1",
  "ai_hub_local_bundle": {
    "source_platform": "aihub",
    "dataset_id": "future-aihub-gugak-paired-data",
    "bundle_id": "approved-local-bundle-001",
    "local_bundle_only": true,
    "network_download_disabled_by_contract": true,
    "dataset_discovery_disabled_by_contract": true,
    "external_approval_not_inferred": true
  },
  "ai_hub_r_and_d_scope": {
    "r_and_d_only": true,
    "future_local_bundle_only": true,
    "no_network_download_or_dataset_discovery": true,
    "no_source_redistribution": true,
    "no_default_assets": true,
    "no_runtime_bgm": true,
    "no_game_output": true,
    "no_public_release": true,
    "no_model_training": true
  },
  "ai_hub_rights_gate": {
    "project_has_explicit_local_bundle_access_record": true,
    "project_rights_review_completed_for_this_local_bundle": true,
    "project_scope_limited_to_later_feature_extraction": true,
    "ai_hub_terms_reviewed_for_this_local_bundle": true,
    "no_source_redistribution": true,
    "no_default_asset_or_runtime_use": true,
    "no_game_or_public_distribution_clearance": true,
    "no_model_training_authorized_by_this_manifest": true,
    "requires_new_rights_review_for_scope_expansion": true,
    "does_not_claim_ai_hub_approval_or_training_authorization": true
  },
  "pairs": [
    {
      "pair_id": "daegeum_001",
      "source_record_id": "record_001",
      "pair_gate": {
        "r_and_d_only": true,
        "not_default_asset": true,
        "not_runtime_bgm": true,
        "not_game_asset": true,
        "not_public_distribution": true,
        "not_source_redistributable": true,
        "not_a_model_training_item": true
      },
      "audio_wav": {
        "relative_path": "audio/take_001.wav",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_WAV_DIGEST",
        "byte_length": 12345
      },
      "performance_midi": {
        "relative_path": "midi/take_001.mid",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_MIDI_DIGEST",
        "byte_length": 234
      },
      "annotation_json": {
        "relative_path": "annotation/take_001.json",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_JSON_DIGEST",
        "byte_length": 345
      }
    }
  ]
}
```

`audio_wav` must have a RIFF/RF64/BW64 WAV signature; `performance_midi` must
have a Standard MIDI `MThd` header; `annotation_json` must parse as a JSON
object or array.  Those are shallow integrity checks only.  The validator does
not decode audio, parse MIDI events, or interpret annotation labels.

## Run

Choose a **new** R&D report directory outside `public/assets`; it must not
already exist.  The command creates that directory and writes exactly one JSON
report, `aihub_paired_ingest_report.json`.  It writes no copy of a WAV, MIDI,
or annotation file.

```bash
python3 tools/aihub-paired-ingest/validate_bundle.py \
  --bundle-manifest /absolute/path/to/local-bundle/explicit-aihub-bundle.json \
  --report-dir /absolute/path/to/_bgm_rnd/aihub-paired-ingest-001
```

The report is a handoff contract for a separately reviewed, later feature
extraction tool.  That later tool must re-verify every listed SHA-256 and must
not treat this ingest report as training permission, redistribution permission,
or game/public-output approval.

## Test

```bash
python3 -m unittest tools/aihub-paired-ingest/test_aihub_paired_ingest.py -v
```

The tests create only tiny synthetic WAV/MIDI/JSON files in temporary
directories.  They never access an AI Hub dataset or network service.
