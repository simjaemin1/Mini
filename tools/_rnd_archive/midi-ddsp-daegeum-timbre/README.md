# Non-ML Daegeum timbre proxy audition

This narrow R&D tool preserves the existing authorial MIDI-DDSP flute bridge's
performance timeline and applies a deterministic Daegeum **timbre proxy**.  It
is not a Daegeum model and does not train or fit anything.

The builder fails closed unless:

- the supplied rights audit binds to the exact 192-item NGC manifest;
- that audit conditionally permits `sample_transformation_or_non_ml_derivative_synthesis`;
- the independently assessed ML route remains `BLOCKED_FAIL_CLOSED`;
- all 192 corpus WAV files match the SHA-256 values in the manifest; and
- the official MIDI-DDSP authorial flute-bridge WAV matches its runtime report.

Only a declared, data-independent 13-record stride is decoded after the
192-file integrity pass.  Per-source long-term log spectra are averaged and
smoothed at a half-octave sigma.  The target/reference ratio is centred,
clamped to +/-9 dB and tapered at the analysis band edges.  One static positive
magnitude curve is applied to every STFT frame while retaining complex phase.
There is no resampling, f0 rewrite, pitch shifting, time stretching, source
splicing, dynamic EQ, compression, limiting, or time-varying normalisation.

The manifest also records 20 ms whole-phrase and 5 ms release-only RMS-envelope
correlations against A.  These are timeline sanity checks, not perceptual or
performance-quality scores.

The output pack contains:

- `A_official_flute_bridge_reference.wav` — the source bridge with monitoring gain only;
- `B_ngc_spectral_envelope_proxy.wav` — the full static-envelope proxy;
- `C_conservative_dry_wet_proxy.wav` — a fixed 58% source / 42% proxy blend;
- `static_spectral_envelope_ratio.csv` — the exact static EQ curve; and
- `non_ml_daegeum_timbre_manifest.json` — hashes, attribution, rights scope,
  parameters, source receipts, and explicit limitations.

All three WAVs receive one whole-file constant gain to match the authored
`[0, 6.48)` interval to -24 dBFS RMS.  The original `[6.48, 6.72)` release
receives the same gain as every other sample.  The builder refuses output if a
variant would exceed -3 dBFS peak; it never inserts a limiter.

## Offline tests

```sh
/tmp/durango-bgm-rnd-venv/bin/python \
  tools/midi-ddsp-daegeum-timbre/test_build_timbre_audition.py
```

## Exact local R&D run

Choose a fresh ignored `_bgm_rnd/` destination each time:

```sh
/tmp/durango-bgm-rnd-venv/bin/python \
  tools/midi-ddsp-daegeum-timbre/build_timbre_audition.py \
  --rights-audit _bgm_rnd/ngc-rights-audit-20260925/ngc_rights_audit.json \
  --ngc-manifest _bgm_rnd/ngc-extended-daegeum-sanjo-20260924/ngc-extended-daegeum-sanjo.manifest.json \
  --flute-report _bgm_rnd/midi-ddsp-official-flute-runtime-r1-20260925-121434/official_flute_rnd_report.json \
  --output-dir _bgm_rnd/midi-ddsp-daegeum-non-ml-timbre-r1-YYYYMMDD-HHMMSS
```

The result is an unreviewed listening experiment, not a recorded Daegeum
performance, trained model, distribution clearance, shipped game asset, or
default-BGM change.  Credit the National Gugak Center and performer Park
Jong-hyeon (`박종현`) whenever this Type-1-derived R&D material is used within
the conditionally permitted scope.  Do not imply National Gugak Center
endorsement.  The upstream MIDI-DDSP weight/output game-distribution question
also remains unresolved.
