# Expressive synthesis: isolated R&D baseline

This directory is an experiment harness for **one sustained instrument**.  It
does not install anything, train anything, transform audio, or alter default
BGM/runtime assets by itself.  It is deliberately independent of the archived
MIDI-DDSP work: the baseline uses only maintained PyTorch plus NumPy.

The model shape is intentionally small and inspectable:

```
score features -> continuous f0 / loudness / harmonic-noise controls
               -> harmonic + noise source-filter reconstruction -> waveform
```

The controls and target waveform must come from an explicit, SHA-verified
R&D corpus manifest.  The validator refuses directory discovery, inferred
rights, non-contiguous provenance, default assets, runtime BGM, game outputs,
and public-distribution use.  Passing a manifest is a project gate, **not** a
claim that a source recording has broader rights or that output is suitable for
the game.

## Untrained synthetic control preview

`render_synthetic_preview.py` is a separate, CPU-only listening aid for the
current `tools/score-expression` output.  It reads exactly one fresh compiler
artifact directory containing `score_expression_controls.npz` and its
SHA-verified manifest, then writes a fresh isolated directory containing:

```text
untrained_synthetic_preview.wav
untrained_synthetic_preview_manifest.json
```

The WAV is a deterministic **generic harmonic-plus-noise** monitor driven by
the explicit F0, loudness, air-noise, and voicing curves.  It is not trained,
does not read, copy, or transform source audio, and is **not a real Daegeum
renderer**.  The filename and sidecar say so explicitly.  Gesture state is
validated but never used to invent an attack or slur; audible articulation
comes only from the compiler's supplied continuous curves.

It rejects a controls hash mismatch, wrong schema/timeline, missing R&D scope
flags, controls or output inside `public/assets/audio/bgm/`, a nested output,
or any pre-existing output directory.  It never discovers source audio, loads
a model, or writes game assets.

```bash
/tmp/durango-bgm-rnd-venv/bin/python tools/expressive-synthesis/render_synthetic_preview.py \
  --controls-dir /absolute/path/to/fresh-score-expression-controls \
  --output-dir /absolute/path/to/fresh-untrained-synthetic-preview \
  --confirm-rnd-only
```

The optional `--seed` only makes the generic synthetic air-noise repeatable.
The sidecar records it, the two input digests, the one global monitoring gain,
and the explicit limits.  It is not a model export, training result, gameplay
audio, or clearance to use source recordings for training or distribution.

## WSL / RTX 4060 preparation

Run these commands in a WSL Ubuntu checkout after confirming that `nvidia-smi`
sees the Windows NVIDIA driver.  The CUDA profile uses PyTorch 2.6.0's CUDA
12.4 wheel; it does not require this repository to install a separate CUDA
toolkit.

```bash
bash tools/expressive-synthesis/setup_train_wsl.sh --check
bash tools/expressive-synthesis/setup_train_wsl.sh --setup --allow-install --profile cuda124
bash tools/expressive-synthesis/setup_train_wsl.sh --smoke
```

`--setup` is the only mode that creates a local virtual environment or invokes
pip, and it requires the explicit `--allow-install` acknowledgement.  The
smoke test forcibly uses CPU, has a fixed synthetic tensor, reads no corpus,
and writes no checkpoint.

## Explicit corpus manifest

Create a narrow JSON file alongside explicitly derived NPZ tensors.  The
source recording itself is provenance only: the validator does not decode it
or use it as a training input.  Each NPZ has its own SHA-256 and must be named
directly in `entries`; wildcard or directory corpus discovery is unavailable.

```json
{
  "schema": "mini.expressive-synthesis.rnd-corpus-manifest.v1",
  "r_and_d_scope": {
    "r_and_d_only": true,
    "no_default_assets": true,
    "no_runtime_bgm": true,
    "no_game_output": true,
    "no_public_release": true
  },
  "rights_gate": {
    "r_and_d_training_authorized_for_this_manifest": true,
    "no_default_asset_or_runtime_use": true,
    "no_game_or_public_distribution_clearance": true,
    "requires_new_rights_review_for_scope_expansion": true
  },
  "instrument": {
    "id": "daegeum",
    "sustained": true,
    "render_family": "harmonic_noise_source_filter"
  },
  "entries": [
    {
      "entry_id": "rnd_example_001",
      "entry_gate": {
        "r_and_d_only": true,
        "not_default_asset": true,
        "not_runtime_bgm": true,
        "not_game_asset": true,
        "not_public_distribution": true
      },
      "source": {
        "source_id": "verified_source_identifier",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_SOURCE_DIGEST",
        "relative_path": "provenance/original.wav"
      },
      "native_source_span": {
        "frame_range": [100, 220],
        "sample_rate_hz": 16000,
        "single_contiguous_source_frame_span": true,
        "not_a_game_asset": true
      },
      "controls_npz": {
        "relative_path": "derived/rnd_example_001_controls.npz",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_CONTROLS_DIGEST",
        "schema": "mini.expressive-synthesis.continuous-controls.v1"
      },
      "target_npz": {
        "relative_path": "derived/rnd_example_001_target.npz",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_TARGET_DIGEST",
        "schema": "mini.expressive-synthesis.rnd-reconstruction-target.v1"
      }
    }
  ]
}
```

Validate before a train run:

```bash
python3 tools/expressive-synthesis/validate_manifest.py \
  --manifest /absolute/path/to/explicit-rnd-manifest.json --verify-files
```

The `controls_npz` archive must contain `score_features` (`[frames, features]`),
`target_f0_hz` (`[frames]`), and `target_loudness_db` (`[frames]`).  The
separate `target_npz` archive must contain `waveform` (`[frames * hop_size]`).
They are experiment tensors, not expert transcription, score annotation,
breath/slur labels, production training data, transition-bank items, or game
assets.

## Deliberate train invocation

The launcher verifies the explicit manifest and its NPZ hashes before it calls
the baseline.  A fresh output directory and an acknowledgement are required:

```bash
bash tools/expressive-synthesis/setup_train_wsl.sh --train \
  --manifest /absolute/path/to/explicit-rnd-manifest.json \
  --output-dir /absolute/path/to/rnd-only-output \
  --confirm-rnd-only
```

This produces an R&D checkpoint/report only.  It is not a default asset,
runtime BGM, game output, public release, or rights clearance.  Any move toward
those scopes requires a new review outside this harness.
