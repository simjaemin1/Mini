# Full-Arirang B1 / B2-R reference-contour audition pack

This tool creates an **offline R&D-only** listening pair after both candidates
have already been rendered. It never renders, resamples, normalizes, changes
gain, or edits audio; verified wet-WAV bytes are copied unchanged.

The comparison is intentionally narrow:

- B1 uses the current provisional sine expression on b08 and b16.
- B2-R must preserve b08 exactly and replace only b16 expression with the
  pinned `reference_shape_unreviewed` contour.
- The reference is an automatic periodic-F0 proxy. It is not learned, human
  reviewed, confirmed as yoseong, validated as Gyeonggi-minyo style, approved
  for training, or cleared as a game/distribution asset.

## Fail-closed checks

The builder verifies all of the following before publishing a pack:

- both inputs have the same 59-note nominal score skeleton, release, timing,
  nominal pitches,
  articulation, loudness, voicing, event assignment, hard-step transition
  policy, public-source revisions, checkpoint, renderer seed, and
  checkpoint-native reverb;
- both use the exact same positive gain explicitly derived from B0 over the
  exact `[0.00, 34.56)` monitoring interval, without compression or limiting;
- B1 has sine vibrato on b08 and b16 only, while B2-R has the exact same b08
  F0/vibrato controls and differs only on b16;
- reference-artifact file SHA-256, schema, status, candidate ID, source ID and
  SHA, rights status, all five false claim-limit flags, and canonical contour
  payload SHA-256;
- the exact embedded 65-point pitch/RMS/time payload equals the reference;
- the runtime independently reproduces the exact piecewise-linear contour,
  using source time `elapsed / 1.5` without endpoint remapping or time
  compression;
- exactly 375 controls occupy `[33.06, 34.56)`, with 120 ms linear-depth fades,
  exact zero cents on frames 8265 and 8639, and nominal pitch on the final row;
- the final release returns/stays at nominal pitch, the b8 written rest and
  other authored gaps remain intact, and default game BGM paths are untouched.

The generic full-score timing/audio/rest/release validators are shared with
`tools/full-ari-yoseong-audition-pack`; the reference-specific identity,
interpolation, duration, boundary, comparison, and interpretation checks live
in this directory.

## Current build

Generate a fresh, hash-pinned spec:

```sh
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

python "$ROOT/tools/full-ari-reference-contour-audition-pack/make_full_ari_reference_contour_spec.py" \
  --repository-root "$ROOT" \
  --output "$ROOT/_bgm_rnd/full-ari-b1-b2r-reference-spec-20260925.json" \
  --b1-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230100-full-ari-b1/runtime_report.json" \
  --b1-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b1_contextual_yoseong_r1.json" \
  --b1-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b1-20260925/score_expression_manifest.json" \
  --b2r-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230200-full-ari-b2r/runtime_report.json" \
  --b2r-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2_reference_shape_unreviewed_r1.json" \
  --b2r-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2r-20260925-173104-final/score_expression_manifest.json" \
  --reference-artifact "$ROOT/tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
```

Package the exact verified source bytes into a fresh ignored directory:

```sh
python "$ROOT/tools/full-ari-reference-contour-audition-pack/build_full_ari_reference_contour_audition_pack.py" \
  --repository-root "$ROOT" \
  --spec "$ROOT/_bgm_rnd/full-ari-b1-b2r-reference-spec-20260925.json" \
  --output-dir "$ROOT/_bgm_rnd/full-ari-reference-contour-audition-pack-r1-YYYYMMDD-HHMMSS"
```

Run the contract suite:

```sh
python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-contour-audition-pack" \
  -p 'test_*.py' -v
```

The pack contains plainly named B1 and B2-R WAVs, a deterministic manifest, a
spec snapshot, and frozen runtime/plan/policy/control/reference evidence under
`provenance/`.
