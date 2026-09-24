# Arirang score ↔ source phrase-pool compatibility R&D report

Date: 2026-09-25

## Scope and inputs

This is an offline, measurement-only R&D report. It evaluated every one of
the five unreviewed rows in the NGC source-led phrase pool against the current
authorial Arirang companion plan:

- score plan: `tools/score-expression/plans/ari_source_led_response_r1.json`
  (`88e055bbb90a839ea66571d8a55f2a1ce3c2e7d71aa62a45f5021d0d621a146c`)
- phrase pool: `_bgm_rnd/daegeum-source-led-phrase-pool-ngc-all192-r2-20260924-234522/phrase_pool.json`
  (`264e9bf058c730c8bdc521cdc694f26e23c8cbc603587d6dc3bee59d3d2a5cc1`)
- existing cache bundle: `daegeum-transition-bank-ngc-20260924-205600`
  source catalog SHA-256 `1273264d2ebf28dca5b2356d168a06408c390cde62a2c8e5626521ef6614ea90`

The generated local R&D artifact is intentionally ignored by Git:
`_bgm_rnd/ari-score-phrase-compatibility-all5-r1-20260925/`.
It contains `score_phrase_compatibility.json`
(`047d8c9c903a99809bc2e17b58fdf566e5263a74c047ae693afde02b264813ea`)
and `score_phrase_compatibility.tsv`
(`508fa585f9587e7b88f5cfdfae8a0e4f1680f5a960d12979970b0adf503585db`).

## Measurement contract

The evaluator compiles the explicitly authored controls in memory and reads
only the existing `features/*.npz` proxy rows for each declared phrase-pool
feature span. For each candidate it measures exactly one global pitch offset
and exactly one duration-derived uniform source-seconds-per-score-second time
ratio. It then samples nearest existing proxy rows only: no per-event offset,
local time warp, interpolation, missing-value fill, audio read, audio write,
score-control rewrite, render, or asset change occurs.

The current plan has seven authored events over 6.72 seconds (two
`breath_start`, one `rearticulate`, three explicit `slur`, and one `release`).
Those are authorial controls, not source performance labels. Candidate rank is
a reproducible numeric measurement order, not a musical-quality or style
ranking.

Default gates were: ratio 0.80–1.25, pitch RMSE ≤120 cents, nearest-rank p95
absolute pitch error ≤220 cents, endpoint interval error ≤180 cents, and
valid-control coverage ≥0.98.

## Actual all-five result

All five candidates were rejected as numeric measurement mismatches. This is
not a judgment about their musical value; it only says this conservative,
single-offset/single-ratio comparison did not pass its gates.

| Measurement rank | Candidate profile | Ratio | RMSE cents | P95 cents | Endpoint interval cents | Flags |
| ---: | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `long_rising_proxy` | 0.848214 | 336.420288 | 471.939017 | -133.462728 | RMSE, P95 |
| 2 | `medium_rising_proxy` | 0.642857 | 294.938381 | 441.501442 | 155.852305 | RMSE, P95, ratio |
| 3 | `medium_compact_proxy` | 0.535714 | 308.410535 | 457.441794 | -305.076802 | RMSE, P95, endpoint interval, ratio |
| 4 | `short_falling_proxy` | 0.392857 | 321.990742 | 569.375546 | -196.806539 | RMSE, P95, endpoint interval, ratio |
| 5 | `short_rising_proxy` | 0.392857 | 337.521755 | 586.486704 | -176.303304 | RMSE, P95, ratio |

Every row retains the explicit disposition
`rejected_measurement_mismatch` and
`not_claimed_not_approved_not_inferred` for natural phrase/slur status.
Nothing in this report approves a phrase, identifies a shared breath, slur,
or natural legato, grants a license, makes a training item, or makes a game
asset. Default runtime BGM and source assets remain untouched.

## Reproduction and verification

The local report was generated with:

```sh
/tmp/durango-bgm-rnd-venv/bin/python tools/daegeum-transitions/score_phrase_compatibility.py \
  --bundle _bgm_rnd/daegeum-transition-bank-ngc-20260924-205600 \
  --score-plan tools/score-expression/plans/ari_source_led_response_r1.json \
  --phrase-pool _bgm_rnd/daegeum-source-led-phrase-pool-ngc-all192-r2-20260924-234522/phrase_pool.json \
  --output-dir _bgm_rnd/ari-score-phrase-compatibility-all5-r1-20260925
```

Deterministic coverage is in
`tools/daegeum-transitions/test_score_phrase_compatibility.py`; it checks a
matching cache-proxy fixture, numeric mismatch rejection, truth-label refusal,
output determinism, absence of a source WAV, and unchanged inputs.
