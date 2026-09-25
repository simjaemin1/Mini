# Official NGC source receipt — provenance and credit gate

This is a small gate for a **future, already obtained normal National Gugak
Center download**.  It does not scrape, download, bypass the catalog form,
invent a usage purpose/organization, copy audio, or make an asset playable in
the game.

It accepts one explicit receipt containing:

- official NGC Digital Eum catalog collection, record ID, HTTPS catalog URL;
- a declared KOGL Type 1 mark and required attribution fields;
- a normal-official-UI-download attestation;
- a named local source root, safe relative WAV path, full WAV SHA-256, and
  native descriptor; and
- R&D-only / not-game / not-training scope limits.

The validator rehashes and inspects that exact WAV, then emits a fresh,
path-free report with the credit line and verified source identity.  It
refuses unprovenanced local filenames, an incorrect hash, non-Type-1 receipt,
unsafe path, non-NGC URL, or an existing output directory.

```bash
/tmp/durango-bgm-rnd-venv/bin/python tools/ngc-source-receipts/validate_receipt.py \
  --receipt /absolute/path/to/official-ui-download-receipt.json \
  --output-dir /absolute/path/to/fresh-rnd-report \
  --confirm-rnd-only
```

The report intentionally says `not_a_game_asset` and `not_a_training_item`.
Catalog/license and local-byte identity are the only facts it proves.  Any
runtime, public-release, or ML promotion still needs a separate scope and
rights review.
