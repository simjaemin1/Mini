# MIDI-DDSP Daegeum transfer-train readiness scaffold

This directory is deliberately a **readiness gate**, not a training system.
It never downloads a model, installs packages, finds a dataset, decodes audio,
loads an NGC recording, writes a checkpoint, or changes game BGM.  It has no
`--train` command.

The intended future experiment is narrow: begin from the audited official
MIDI-DDSP URMP checkpoint, preserve its expression generator frozen, and
fine-tune only the synthesis generator against a separately rights-reviewed,
explicitly paired Daegeum feature corpus.  The official pretrained FLUTE ID 4
is an initialization condition only; it is not a Daegeum identity or a licence
to ship an output.

## Gates

`transfer_readiness.py --check` validates an isolated WSL2 Python 3.8 runtime,
the exact legacy package pins, TensorFlow GPU visibility, an RTX 4060-class
CUDA inventory, a clean `pip check`, and the official weight ZIP hash.  `--dry-run` additionally
accepts one explicit approved-feature manifest and proves that train and
held-out source records cannot overlap.  It reads only declared derived `.npz`
feature files and explicitly declared local rights receipts to verify hashes;
it never reads source WAV/MIDI/NGC bytes.

The manifest must use `mini.midi-ddsp-transfer-train.approved-dataset.v1` and
must explicitly attest all R&D and project rights gates.  Those attestations
remain project gates, not external legal proof.  An AI Hub ingest manifest is
not sufficient: it explicitly prohibits model training and must first be
re-reviewed into this later manifest type.

## Candidate corpus boundary (not an approval)

The existing NGC 192 material is blocked for this transfer scaffold: its
permission has not been established for this experiment, so it is never opened
or accepted as a manifest source.  It must not be relabelled as a feature file
to bypass that boundary.

The only recommended future input candidate is AI Hub **71470**, *국악 악보 및
음원 데이터* (reported as WAV, MIDI, and sigimsae JSON; Daegeum has 900 clips).
The raw files are still not consumed by this tool: a separately reviewed
pipeline would create explicit derived control/target `.npz` archives first.
AI Hub 71955 (reported as 838 Daegeum multitracks) is not an interchangeable
fallback and needs its own later review.

Before a 71470-derived manifest can pass `--dry-run`, it must name and hash a
user-held local download receipt plus a current terms/FAQ receipt, and record
an attribution plan.  The AI Hub FAQ has been described as permitting
commercial ML outputs with attribution, but this repository does **not**
certify that claim, a future game release, or pretrained-weight distribution
rights.  No local receipt means fail closed; a new scope, release, or dataset
requires a new rights review.

`daegeum_synthesis_only_finetune_config.json` fixes the initial 8 GiB profile:
batch size 1, gradient accumulation 8, max 1,000 frames, frozen expression
generator, and trainable synthesis generator only.  The readiness tool rejects
any relaxed or ambiguous version of those policies.

## Mac CPU-only smoke

This is a pure synthetic arithmetic/configuration test.  It does not import
MIDI-DDSP, TensorFlow, a model checkpoint, or audio data.

```sh
python3 tools/midi-ddsp-transfer-train/cpu_synthetic_smoke.py \
  --config tools/midi-ddsp-transfer-train/daegeum_synthesis_only_finetune_config.json
```

## Future WSL2 dry-run — only after approval and an audited venv exist

First create an isolated **Python 3.8** WSL virtual environment using an
audited historic wheelhouse and the exact versions in
`requirements-wsl-py38-tf27.txt`.  Do not alter Ubuntu's system Python and do
not let a modern resolver substitute packages.  Then, from the repository in
WSL, run this read-only command with the three explicit approved paths:

```sh
WSL_PYTHON=/mnt/c/path/to/isolated-midi-ddsp-py38/bin/python
APPROVED_MANIFEST=/mnt/c/path/to/approved-daegeum-transfer-manifest.json
OFFICIAL_WEIGHTS=/mnt/c/path/to/midi_ddsp_model_weights_urmp_9_10.zip

"$WSL_PYTHON" tools/midi-ddsp-transfer-train/transfer_readiness.py \
  --dry-run \
  --runtime-python "$WSL_PYTHON" \
  --nvidia-smi /usr/bin/nvidia-smi \
  --official-weight-zip "$OFFICIAL_WEIGHTS" \
  --dataset-manifest "$APPROVED_MANIFEST" \
  --fine-tune-config tools/midi-ddsp-transfer-train/daegeum_synthesis_only_finetune_config.json \
  --environment-lock tools/midi-ddsp-transfer-train/wsl_py38_tf27_environment.lock.json
```

Success means only that the static environment, byte identity, split, and
project-gate contracts agree.  It does not start training and does not prove
that pretrained weights or later audio may be distributed in the game.
