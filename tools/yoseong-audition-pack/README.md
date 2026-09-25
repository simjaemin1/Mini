# Daegeum yoseong B0/B1/B2 audition pack

`build_yoseong_audition_pack.py` is a post-render, fail-closed R&D harness. It
does not synthesize, normalize, reverberate, or otherwise alter audio. It
checks independently rendered candidates and copies their exact verified wet
WAV bytes into one fresh `_bgm_rnd/` listening directory.

The fixed slots are:

- **B0** — experimental hard F0 step, no nonzero explicit yoseong control,
  and the fixed phase-continuous/nominal-pitch release;
- **B1** — the same conditions plus an explicitly selected research-rule
  yoseong. A policy merely marked `candidate_off` is rejected: the 250 Hz
  runtime CSV must contain nonzero `vibrato_cents` on exactly the selected
  event IDs, and every selected event must end on a zero-cent control row;
- **B2** — the same conditions with a real reference-extracted curve or
  learned-expression output. If its fingerprinted source, curve, derivation,
  and reviewed R&D-use record do not exist, B2 must be `blocked`. The pack then
  writes `B2_BLOCKED.json` and never manufactures proxy audio.

This is deliberately separate from `tools/score-expression/` and
`tools/ddsp-gugak-public-runtime/`. Those tools own policy compilation and
rendering; this harness verifies their artifacts without changing either
implementation.

## Candidate requirements

Each ready candidate points to a full successful
`mini.ddsp-gugak-public-daegeum-runtime.v1` report, the exact plan it rendered,
and their expected SHA-256 values. The runtime report must prove:

- R&D-only scope and no default-BGM write;
- experimental hard-step mode;
- checkpoint-native reverb was called;
- full-render release QA passed with phase continuing from the source
  vibrato clock and a minimum-jerk depth fade to nominal pitch;
- a score-length wet WAV and 250 Hz controls CSV whose bytes match the report.

Across every ready slot, the harness requires identical score structure apart
from expression, identical loudness/voicing/timing/articulation controls,
identical renderer seed, checkpoint and public-source identities, identical
learned-reverb contract, identical duration, and a `[0.00, 6.48)` monitoring RMS of
`-24.0 ± 0.02 dBFS`. It applies no additional gain. A committed, staged,
unstaged, or untracked change to the guarded default BGM paths relative to
commit `03a54f5c` blocks assembly.

## Spec

Use repository-relative paths only. Hash each artifact after rendering. This
minimal shape builds B0/B1 while recording an honest B2 blocker:

```json
{
  "schema": "mini.yoseong-audition-pack-spec.v1",
  "candidates": {
    "B0": {
      "status": "ready",
      "role": "hard_step_no_explicit_yoseong_fixed_release",
      "runtime_report": {"path": "_bgm_rnd/B0/runtime_report.json", "sha256": "..."},
      "plan_artifact": {"path": "_bgm_rnd/B0/plan.json", "sha256": "..."},
      "expected_yoseong_event_ids": []
    },
    "B1": {
      "status": "ready",
      "role": "hard_step_research_rule_yoseong_fixed_release",
      "runtime_report": {"path": "_bgm_rnd/B1/runtime_report.json", "sha256": "..."},
      "plan_artifact": {"path": "_bgm_rnd/B1/plan.json", "sha256": "..."},
      "policy_manifest": {"path": "_bgm_rnd/B1/score_expression_manifest.json", "sha256": "..."},
      "expected_policy_rule_ids": ["exact.rule.id"],
      "expected_yoseong_event_ids": ["exact_event_id"]
    },
    "B2": {
      "status": "blocked",
      "role": "hard_step_reference_derived_or_learned_yoseong_fixed_release",
      "reason": "No verified performance-derived curve is available.",
      "unmet_requirements": [
        "fingerprinted source performance",
        "measured curve or learned output with reviewed R&D-use scope"
      ]
    }
  }
}
```

A ready B2 also needs `reference_provenance` and `reference_curve` artifact
records. Its provenance JSON must use schema
`mini.yoseong-reference-derivation.v1`, status `verified`, set
`placeholder_or_hand_authored_proxy` to `false`, identify either
`reference_extracted_f0_curve` or `learned_expression_model_output`, list at
least one source ID/byte length/SHA-256, set
`rights_scope.r_and_d_use_reviewed` to `true`, and repeat the exact curve
SHA-256.

## Build and verify

After the two runtime renders finish, generate the hash-pinned spec without
manually copying checksums. Repeat `--b1-rule-id` and `--b1-event-id` if the
policy selected more than one:

```sh
ROOT=/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01

python3 "$ROOT/tools/yoseong-audition-pack/make_blocked_b2_spec.py" \
  --repository-root "$ROOT" \
  --output "$ROOT/_bgm_rnd/yoseong-b0-b1-b2-spec.json" \
  --b0-runtime-report "$ROOT/_bgm_rnd/B0/runtime_report.json" \
  --b0-plan "$ROOT/_bgm_rnd/B0/plan.json" \
  --b1-runtime-report "$ROOT/_bgm_rnd/B1/runtime_report.json" \
  --b1-plan "$ROOT/_bgm_rnd/B1/plan.json" \
  --b1-policy-manifest "$ROOT/_bgm_rnd/B1/score_expression_manifest.json" \
  --b1-rule-id exact.rule.id \
  --b1-event-id exact_event_id
```

Then assemble the checked pack:

```sh
python3 "$ROOT/tools/yoseong-audition-pack/build_yoseong_audition_pack.py" \
  --repository-root "$ROOT" \
  --spec "$ROOT/_bgm_rnd/yoseong-b0-b1-b2-spec.json" \
  --output-dir "$ROOT/_bgm_rnd/yoseong-audition-pack-r1-YYYYMMDD-HHMMSS"

python3 "$ROOT/tools/yoseong-audition-pack/test_build_yoseong_audition_pack.py"
```

The output contains the plainly named B0/B1 WAVs, B2 audio only when fully
verified, frozen plan/report/control/policy evidence under `provenance/`, the
input spec snapshot, checksums and metrics in
`yoseong_audition_manifest.json`, and a short listening README. All remain
R&D-only; the public checkpoint's game-distribution rights are not established
by this pack.
