# NGC extended-audio rights evidence gate

`audit.py` is a metadata-only, fail-closed audit for the exact 192-item
National Gugak Center extended Daegeum Sanjo manifest.  It is not legal
advice and it is intentionally not a WAV downloader, renderer, trainer, or
asset-promotion tool.

It verifies that the local controlled manifest binds only to the official NGC
extended-catalog endpoints, takes fresh hashed snapshots of the NGC catalog,
instrument list, file list, representative file-info responses, the NGC
service notice, and the official KOGL type/AI terms.  The report stores URLs,
dates, hashes, small metadata facts, and no absolute local paths or page
bodies.

The gate keeps two questions separate:

- An observed KOGL Type-1 mark supports attributed commercial use and
  non-ML transformation/secondary works.
- AI training remains blocked unless the exact collection carries the current
  AI-type marking or the rightsholder gives an explicit collection-specific
  written authorization.  A Type-1 mark by itself is not treated here as an
  ML-training clearance.

Run only against an ignored R&D output directory:

```sh
python3 tools/ngc-rights-audit/audit.py \
  --manifest _bgm_rnd/ngc-extended-daegeum-sanjo-20260924/ngc-extended-daegeum-sanjo.manifest.json \
  --output-dir _bgm_rnd/ngc-rights-audit-YYYYMMDD \
  --confirm-rnd-only
```

The network requests are limited to official NGC/KOGL HTML and JSON metadata
routes.  The WAV download endpoint is only read from already-existing source
provenance; this program never requests it.
