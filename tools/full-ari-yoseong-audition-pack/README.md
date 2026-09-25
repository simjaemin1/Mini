# Full-Arirang Daegeum B0/B1 audition pack

This directory contains a post-render, fail-closed verifier and byte-for-byte
packer for the complete 16-bar Arirang Daegeum comparison. It never renders,
normalizes, reverberates, or edits audio.

The pack is published only when both candidates prove all of the following:

- 59 voiced score notes followed by one `[34.56, 34.80)` release;
- exactly 8,700 controls at 250 Hz and a 556,800-sample, 34.80-second,
  16 kHz mono PCM16 score-length wet WAV;
- the exact b8 written rest `[16.56, 17.28)` is zero in F0, loudness,
  voicing, and vibrato and agrees with the runtime's hard-zero gate report;
- hard-step pitch-transition mode and a final release control row at the
  inherited nominal pitch with zero vibrato cents;
- identical B0/B1 score timing, articulation, loudness, voicing, event
  assignment, checkpoint, public-source revisions, renderer seed, and
  checkpoint-native reverb;
- B0 has no enabled or audible vibrato; B1 has nonzero vibrato only on the
  explicitly selected policy events, each ending on a zero-cent row;
- both use the exact same gain explicitly marked as derived from B0, with the
  same `[0.00, 34.56)` monitoring interval. B0 alone is required to measure
  `-24.0 ± 0.02 dBFS`; B1 is not independently normalized;
- score-expression manifests bind the exact rendered plans, remain
  provisional/default-off/non-automatic, and identify the B1 opt-in rules;
- the default game BGM paths remain untouched relative to `03a54f5c`.

Other explicit breath-silence gaps may exist in the authored plan. They are
accepted only when the runtime report and both candidates contain the same
hard-zero control ranges; they cannot extend or replace the b8 written rest.

## Runtime report contract

The existing `mini.ddsp-gugak-public-daegeum-runtime.v1` report is consumed.
In addition to its established fields, `checkpoint_native_reverb_audition.
level_match` must include:

```json
{
  "constant_gain_applied_to_entire_file": 1.234,
  "gain_source_slot": "B0",
  "shared_interval_start_seconds": 0.0,
  "shared_interval_end_seconds": 34.56,
  "shared_interval_sample_count": 552960,
  "target_shared_interval_rms_dbfs": -24.0,
  "compression_or_limiter": false,
  "clipping_limited": false
}
```

For schema-compatible producers, `gain_linear` may replace the constant-gain
field, and B0 provenance may instead appear as
`constant_gain_source_slot`, `normalization_source_slot`, or inside
`shared_gain_provenance.{source_slot,derived_from_slot,gain_source_slot}`.
One explicit B0 provenance form is mandatory; equality alone is not accepted
as evidence that B1 avoided independent normalization.

Controls CSV may add columns, but the eight established fields
`frame_index,time_seconds,f0_hz,loudness_linear,voicing,articulation,event_id,
vibrato_cents` are mandatory.

## Current full-score build

Generate the hash-pinned spec:

```sh
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

python3 "$ROOT/tools/full-ari-yoseong-audition-pack/make_full_ari_yoseong_spec.py" \
  --repository-root "$ROOT" \
  --output "$ROOT/_bgm_rnd/full-ari-yoseong-b0-b1-spec.json" \
  --b0-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230000-full-ari-b0/runtime_report.json" \
  --b0-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b0_straight_r1.json" \
  --b0-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b0-20260925/score_expression_manifest.json" \
  --b1-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230100-full-ari-b1/runtime_report.json" \
  --b1-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b1_contextual_yoseong_r1.json" \
  --b1-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b1-20260925/score_expression_manifest.json" \
  --b1-rule-id gyeonggi_ari.v1.sustained_before_rest_late_yoseong_candidate \
  --b1-rule-id gyeonggi_ari.v1.global_cadence_late_yoseong_candidate \
  --b1-event-id b08_e0_rearticulate \
  --b1-event-id b16_e0_rearticulate
```

Verify and package exact source bytes into a fresh ignored directory:

```sh
python3 "$ROOT/tools/full-ari-yoseong-audition-pack/build_full_ari_yoseong_audition_pack.py" \
  --repository-root "$ROOT" \
  --spec "$ROOT/_bgm_rnd/full-ari-yoseong-b0-b1-spec.json" \
  --output-dir "$ROOT/_bgm_rnd/full-ari-yoseong-audition-pack-r1-YYYYMMDD-HHMMSS"

python3 "$ROOT/tools/full-ari-yoseong-audition-pack/test_build_full_ari_yoseong_audition_pack.py"
```

The result contains plainly named B0/B1 WAVs, a deterministic manifest, the
spec snapshot, and frozen report/plan/policy/control evidence under
`provenance/`. All outputs remain R&D-only; the checkpoint weights are not
established as cleared game-distribution assets.
