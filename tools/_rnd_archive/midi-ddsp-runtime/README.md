# Official MIDI-DDSP FLUTE runtime R&D

`run_official_flute_rnd.py` is a contained experiment runner for official
MIDI-DDSP pretrained weights.  It creates two R&D-only variants from an
explicit authorial General-MIDI FLUTE score:

- A: the model's automatic expression prediction and official synthesis;
- B: A's conditioning table with only the six documented MIDI-DDSP expression
  fields overridden from an explicit bridge JSON, then official re-synthesis.

It is not a Daegeum model, a trained result, a production game asset, or
evidence that pretrained-weight licensing clears game use.  It never reads or
uploads NGC/user audio.

The legacy DDSP 3.2.0 package eagerly imports unrelated cloud/notebook modules.
The runner records a nonstandard in-process shim that imports only the unchanged
official `ddsp.training.nn` and `ddsp.training.decoders` files required for
inference; their SHA-256 values are written into the sidecar.  A supported
runtime should replace this shim before any broader use.

The runner refuses to run without `--execute` and refuses any destination
outside a new child of `_bgm_rnd/`.  It needs an isolated legacy TensorFlow
environment and explicit checkpoint paths; it neither installs packages nor
downloads weights itself.
