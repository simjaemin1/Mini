# Full-Arirang B1 / B2-R / B2-Rd / B2-Rdf audition pack

This post-render tool creates a four-way, byte-exact offline listening pack:

- **B1** — provisional sine expression on b08 and b16;
- **B2-R** — the exact unreviewed 65-point reference contour on b16;
- **B2-Rd** — the same reference shape with the pinned runtime depth scale
  `0.5286722300020257` and the original 120 ms end fade;
- **B2-Rdf** — B2-Rd with only b16's end fade extended from 120 ms to
  240 ms.

B2-Rdf keeps the source artifact, unscaled 65-point contour, interpolation,
1.5-second mapping, onset, fade-in, and depth scale unchanged. Its controls
are numerically identical to B2-Rd through 34.320 seconds (316 active contour
rows). Frame 8581 at 34.324 seconds is the first changed row. The remaining 59
active rows follow the pinned long-fade formula and both variants reach zero
cents on frame 8639 before a nominal-pitch release.

This is strictly an offline R&D audition. Every reference variant is an
automatic periodic-F0 proxy: unreviewed, not learned, not confirmed as
yoseong, not validated as Gyeonggi-minyo style, not a training item, and not
cleared for game or distribution use. The fade extension is a numeric audition
control, not a musicological validation.

## Fail-closed contract

The pack is published only when all four candidates prove:

- the same 59-note nominal score skeleton, score/release timing,
  non-expression controls, articulation, loudness, voicing, hard-step pitch
  policy, checkpoint, public-source revisions, renderer seed, and
  checkpoint-native reverb;
- the same exact positive gain derived from B0 and the same `[0.00, 34.56)`
  monitoring interval, without compression or limiting;
- exact numeric b08 F0/vibrato controls;
- nominal-pitch final release and preserved written rests;
- false learned, style-aligned, human-reviewed, training, game, distribution,
  and rights-clearance claims.

The inherited three-way verifier independently proves B2-R versus B2-Rd
source identity, contour-payload identity, the pinned depth scale, 18-cent
target, boundary rows, duration, and release behavior. For B2-Rd versus
B2-Rdf, this tool additionally proves:

- the exact same source artifact and payload, 65 unscaled points, onset,
  duration, interpolation, fade-in, and depth transform;
- the only authored b16 transform is the pinned linear fade extension
  `0.12 -> 0.24` seconds;
- exact numeric equality outside b16 and at every b16 row through 34.320;
- for `34.32 < t < 34.556`, B2-Rdf's envelope is
  `(34.556 - t) / (34.556 - 34.32)` and the corresponding controls have the
  exact relative relationship to B2-Rd's short-fade envelope;
- a shared zero-cent endpoint at 34.556 and nominal-pitch release.

Signed-zero CSV spellings such as `-0.0` and `0.0` are compared numerically and
do not create a false expression difference.

The packer never renders, normalizes, changes gain, resamples, or edits audio.
It copies verified WAV bytes unchanged and freezes all reports, plans, policy
manifests, controls, and reference evidence under `provenance/`.

## Current verified build

Generate a fresh hash-pinned spec:

```sh
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

python "$ROOT/tools/full-ari-reference-fade-audition-pack/make_full_ari_reference_fade_spec.py" \
  --repository-root "$ROOT" \
  --output "$ROOT/_bgm_rnd/full-ari-b1-b2r-b2rd-b2rdf-fade-spec-20260925.json" \
  --b1-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230100-full-ari-b1/runtime_report.json" \
  --b1-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b1_contextual_yoseong_r1.json" \
  --b1-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b1-20260925/score_expression_manifest.json" \
  --b2r-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230200-full-ari-b2r/runtime_report.json" \
  --b2r-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2_reference_shape_unreviewed_r1.json" \
  --b2r-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2r-20260925-173104-final/score_expression_manifest.json" \
  --b2rd-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230300-full-ari-b2rd/runtime_report.json" \
  --b2rd-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2rd_reference_shape_depth_matched_unreviewed_r1.json" \
  --b2rd-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2rd-20260925-174815-final/score_expression_manifest.json" \
  --b2rdf-runtime-report "$ROOT/_bgm_rnd/ddsp-gugak-public-daegeum-runtime-r1-20260925-230400-full-ari-b2rdf/runtime_report.json" \
  --b2rdf-plan "$ROOT/tools/score-expression/plans/ari_full_16bar_b2rdf_reference_shape_depth_matched_long_fade_unreviewed_r1.json" \
  --b2rdf-policy-manifest "$ROOT/_bgm_rnd/score-expression-full-ari-b2rdf-20260925-191902-final/score_expression_manifest.json" \
  --reference-artifact "$ROOT/tools/daegeum-vibrato-reference/reference_shape_unreviewed.ngc-20260925.json"
```

Package into a fresh ignored output directory:

```sh
python "$ROOT/tools/full-ari-reference-fade-audition-pack/build_full_ari_reference_fade_audition_pack.py" \
  --repository-root "$ROOT" \
  --spec "$ROOT/_bgm_rnd/full-ari-b1-b2r-b2rd-b2rdf-fade-spec-20260925.json" \
  --output-dir "$ROOT/_bgm_rnd/full-ari-reference-fade-audition-pack-r1-YYYYMMDD-HHMMSS"
```

The verified local output produced on 2026-09-25 is
`_bgm_rnd/full-ari-reference-fade-audition-pack-r1-20260925-193000/`.

Run this suite and both inherited regression suites:

```sh
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-fade-audition-pack" -p 'test_*.py' -v

PYTHONDONTWRITEBYTECODE=1 python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-depth-audition-pack" -p 'test_*.py' -v

PYTHONDONTWRITEBYTECODE=1 python -m unittest discover \
  -s "$ROOT/tools/full-ari-reference-contour-audition-pack" -p 'test_*.py' -v
```
