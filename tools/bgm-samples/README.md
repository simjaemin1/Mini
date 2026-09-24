# Local BGM sample-backup restore

`restore_backups.py` restores the ignored, local-only Daegeum sample backups.
It has no network behavior and does not add raw audio to Git.

Before restoring, run its non-destructive verifier against the original backup
folder:

```sh
python3 tools/bgm-samples/restore_backups.py \
  --source-dir /Users/simjaemin1/Mini/durango-mini/public/assets/audio/bgm \
  --verify
```

To restore, choose a destination that does not exist yet or is completely
empty. The tool refuses a nonempty destination and extracts into a staging
directory first, so a failed run cannot leave a partial destination.

```sh
python3 tools/bgm-samples/restore_backups.py \
  --source-dir /Users/simjaemin1/Mini/durango-mini/public/assets/audio/bgm \
  --dest /tmp/durango-bgm-samples
```

The output keeps the archive layout:

```text
samples_daegeum/
samples_jdae/
  _index.json
  _hold.json
  _trimmed/
```

The known SHA-256 values are embedded in the script. A changed, missing, or
wrongly ordered backup fails before extraction. ZIP member paths, symlinks,
encryption, duplicate output paths, expansion size, compression ratio, and CRC
are checked before any files are copied. The Jungak-Daegeum metadata is copied
directly from the backup: the tool never rescans audio or regenerates
`_index.json` or `_hold.json`.
