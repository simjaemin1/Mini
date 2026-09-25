# Full-Arirang B1 / B2-R / B2-Rd audition pack

This post-render tool creates a three-way, byte-exact offline listening pack:

- **B1** — provisional sine expression on b08 and b16;
- **B2-R** — the exact unreviewed 65-point reference contour on b16;
- **B2-Rd** — the same unscaled embedded contour, timing, interpolation, and
  fades, with pitch residuals multiplied by `0.5286722300020257` at runtime.

The scale maps the embedded source maximum `34.047561` cents to an 18-cent
target. Because the 250 Hz runtime grid is half-open and the boundary envelope
is applied afterward, the observed B2-Rd runtime maximum is
`17.958564073355973` cents; it must not exceed 18 cents.

This is strictly an offline R&D audition. B2-R and B2-Rd are automatic
periodic-F0 proxies: unreviewed, not learned, not confirmed as yoseong, not
validated as Gyeonggi-minyo style, not training items, and not cleared for game
or distribution use. Depth matching is a numeric comparison control, not a
musicological validation.

## Fail-closed contract

The pack is published only when all three candidates prove:

- the same 59-note nominal score skeleton, score/release timing, articulation,
  loudness, voicing, event assignment, hard-step pitch-transition policy,
  checkpoint, public-source revisions, renderer seed, and checkpoint-native
  reverb;
- the same exact positive gain explicitly derived from B0 and the same
  `[0.00, 34.56)` monitoring interval, without compression or limiting;
- exact numeric b08 F0/vibrato controls;
- nominal-pitch final release and preserved written rests;
- false learned, style-aligned, human-reviewed, training, game, distribution,
  and rights-clearance claims.

For B2-R versus B2-Rd it additionally proves:

- identical source artifact SHA, candidate/source identity, contour-payload
  SHA, exact unscaled 65-point payload, time mapping, 1.5-second duration,
  120 ms boundary fades, and 375 runtime rows;
- exact zero cents on first/final active rows, 373 nonzero interior rows, no
  endpoint remap/time compression, and nominal final/release pitch;
- B2-Rd cents equal raw B2-R cents times the one pinned scale on every b16
  control row, while every non-b16 numeric F0/vibrato control is unchanged;
- the embedded source maximum, scale ratio, 18-cent transformed target, and
  actual runtime maximum are independently recomputed and gated.

Signed-zero CSV spellings such as `-0.0` and `0.0` are compared numerically and
do not create a false expression difference.

The packer never renders, normalizes, changes gain, resamples, or edits audio.
It copies verified WAV bytes unchanged and freezes all reports, plans, policy
manifests, controls, and reference evidence under `provenance/`.

## Current verified build

Generate the fresh hash-pinned spec:

```sh
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

python "$ROOT/tools/full-ari-reference-depth-audition-pack/make_full_ari_reference_depth_spec.py" \
  --repository-root "$ROOT" \
  --output "$ROOT/_bgm_rnd/full-ari-b1-b2r-b2rd-depth-spec-20260925.json" \
  --b1-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230100-full-ari-b1/runtime_report.json" \
  --b1-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b1_contextual_yoseong_r1.json" \
  --b1-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b1-20260925/score_expression_manifest.json" \
  --b2r-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230200-full-ari-b2r/runtime_report.json" \
  --b2r-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2_reference_shape_unreviewed_r1.json" \
  --b2r-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2r-20260925-173104-final/score_expression_manifest.json" \
  --b2rd-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230300-full-ari-b2rd/runtime_report.json" \
  --b2rd-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2rd_reference_shape_depth_matched_unreviewed_r1.json" \
  --b2rd-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2rd-20260925-174815-final/score_expression_manifest.json" \
  --reference-artifact "$ROOT/tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
```

Package into a fresh ignored output directory:

```sh
python "$ROOT/tools/full-ari-reference-depth-audition-pack/build_full_ari_reference_depth_audition_pack.py" \
  --repository-root "$ROOT" \
  --spec "$ROOT/_bgm_rnd/full-ari-b1-b2r-b2rd-depth-spec-20260925.json" \
  --output-dir "$ROOT/_bgm_rnd/full-ari-reference-depth-audition-pack-r1-YYYYMMDD-HHMMSS"
```

Run the new suite and the predecessor regression suite:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-depth-audition-pack" -p 'test_*.py' -v

PYTHONDONTWRITEBYTECODE=1 python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-contour-audition-pack" -p 'test_*.py' -v
```
