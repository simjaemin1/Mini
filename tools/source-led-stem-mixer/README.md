# Source-led stem mixer — isolated R&D preview

This helper renders one **separate**, synthetic `M_source_led_mixed_preview_48k_stereo.wav` from a verified raw lead A and optional, explicitly supplied support hits. It never overwrites or copies over `A_raw_lead_stem.wav`; A is read-only and its full WAV SHA-256 is checked before and after rendering.

It uses the repository's native WAV reader plus NumPy; use an existing R&D Python environment with NumPy installed. This directory does not install anything.

It is not a default asset, runtime BGM file, game output, public-release artifact, transition-bank item, training item, expert arrangement, or evidence of natural legato. The output manifest makes the distinction explicit:

- `A_raw_lead_stem.source_faithful: true` — the existing raw A remains untouched.
- `M_mixed_preview.not_source_faithful: true` — decoded/recombined output is a synthetic R&D preview.

No support source is selected by this tool. A caller must create an explicit support-hit manifest after a separate rights/provenance decision.

## Invocation

```bash
python3 tools/source-led-stem-mixer/source_led_stem_mixer.py \
  --lead-manifest /absolute/path/to/span_audition.json \
  --support-hit-manifest /absolute/path/to/explicit-support-hits.json \
  --output-dir /absolute/path/to/fresh-rnd-mix \
  --lead-gain-db 0 --lead-pan 0 \
  --confirm-rnd-only
```

`--support-hit-manifest` is optional. Without it, the tool still makes a separately labelled lead-only M preview. `--output-dir` must not already exist. The tool does not install dependencies, search directories, choose sources, alter the input files, or write anywhere outside that fresh directory.

## Lead contract

The lead must be the phrase-boundary raw branch emitted by
`tools/daegeum-transitions/phrase_span_audition.py`:

- schema `durango.daegeum.transition-bank.v1.phrase-span-audition.v1`;
- `artifact_kind: unreviewed_source_led_raw_lead_stem_audition`;
- `A_raw_lead_stem` with source-faithful payload attestation, all processing fields set to `none`, unreviewed/not-game limits, and phrase-boundary provenance gates;
- A is resolved only beside that manifest, then its payload SHA-256 and native descriptor are rechecked; and
- A must already be native **48 kHz stereo**. The tool rejects it rather than pitch-shifting, time-stretching, resampling, trimming, fading, or changing its channels.

Mix-bus gain/pan affects only the new M waveform. It never modifies A. M uses no hidden normalizer or limiter; its peak is recorded.

## Explicit support-hit manifest

The support manifest is a new mix-only schema, deliberately separate from the expressive-synthesis/training NPZ manifest. It must list every source WAV directly—no glob, directory traversal, filename inference, or default/runtime asset lookup is accepted.

```json
{
  "schema": "durango.source-led-stem-mixer.rnd-support-hit-manifest.v1",
  "r_and_d_scope": {
    "r_and_d_only": true,
    "no_default_assets": true,
    "no_runtime_bgm": true,
    "no_game_output": true,
    "no_public_release": true
  },
  "rights_gate": {
    "r_and_d_mixing_authorized_for_this_manifest": true,
    "no_default_asset_or_runtime_use": true,
    "no_game_or_public_distribution_clearance": true,
    "requires_new_rights_review_for_scope_expansion": true
  },
  "source_roots": {
    "explicit_input_root": "/absolute/path/to/verified/source-directory"
  },
  "support_hits": [
    {
      "hit_id": "example_hit_001",
      "hit_gate": {
        "r_and_d_only": true,
        "not_default_asset": true,
        "not_runtime_bgm": true,
        "not_game_asset": true,
        "not_public_distribution": true,
        "not_a_training_item": true,
        "source_audio_is_direct_native_wav": true
      },
      "source": {
        "source_id": "explicit_source_id",
        "root_id": "explicit_input_root",
        "relative_path": "verified-inputs/example.wav",
        "sha256": "REPLACE_WITH_64_LOWERCASE_HEX_FULL_WAV_SHA256",
        "native_audio": {
          "sample_rate_hz": 44100,
          "channels": 2,
          "frame_count": 123456,
          "encoding": "PCM"
        }
      },
      "native_source_span": {
        "frame_range": [8800, 36800],
        "single_contiguous_source_frame_range": true
      },
      "placement": {
        "start_frame_48k": 0,
        "start_seconds": 0.0,
        "gain_db": -12.0,
        "pan": 0.0
      }
    }
  ]
}
```

`source_roots` is the sole explicit bridge to recordings outside the worktree (for example, a user’s Downloads corpus): it maps a stable `root_id` to an existing absolute directory. Each hit then supplies that `root_id` plus a safe relative POSIX path. Resolution is containment-checked; `..`, absolute hit paths, undeclared roots, symlink escapes, and directory crawling are rejected. Output JSON records only `root_id` and the relative path, never an absolute source path.

`source.sha256` and all `native_audio` fields are checked against the actual WAV before decoding. The crop stays in the original source’s native frame coordinates and its computed payload digest is recorded in M’s provenance. A source may be native 44.1 or 48 kHz, mono or stereo; only the **support crop** is deterministically converted to the new 48 kHz M timeline when necessary. The manifest must explicitly pair `start_frame_48k` with an equal `start_seconds × 48000` timestamp. Gain is limited to -96…+24 dB and pan to -1…+1.

Support resampling is always stated in the M manifest. The current R&D policy is NumPy linear interpolation (`numpy_linear_interpolation_v1_support_only`), not a production-quality conversion claim. The lead has no corresponding conversion path: it is rejected if it is not already native 48 kHz stereo.

## Output

The fresh output directory contains exactly the new float32 48 kHz stereo M WAV and `source_led_mix_manifest.json`. The JSON records:

- lead/support manifest SHA-256 identities and path-free names;
- each support’s SHA-verified native descriptor, native crop, output-frame timestamp, gain, pan, panning law, and support-only resample policy;
- lead SHA-256 before/after, raw payload identity, and explicit forbidden lead transformations;
- M’s full WAV SHA-256/native descriptor/peak; and
- R&D-only, non-source-faithful, non-game/non-runtime interpretation limits.
