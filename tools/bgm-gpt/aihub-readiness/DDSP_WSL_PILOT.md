# Private daegeum DDSP pilot (WSL2 / RTX 4060)

This is a **gated experiment, not a working model or a game asset**. It uses
only the already-approved, locally held AI Hub 71470 daegeum candidates. Do
not upload WAVs, labels, TFRecords, checkpoints, TensorBoard events, or
listening examples to a cloud service or Git. Do not put this data in a public
or game asset directory. Preserve the source and dataset attribution. Never
train on the official validation split.

Run the commands below **one at a time** and inspect each exit status. Stop
at the first failure; they are an experimental checklist, not an unattended
script to paste through to completion.

The official DDSP `solo_instrument.gin` is an audio autoencoder conditioned on
measured fundamental frequency and loudness. It can test **daegeum timbre
reconstruction**. It does not learn the eight-bar score, choose breath or
slurs, or decide when to use vibrato. Those expression controls still require
another, separately validated score-to-performance stage. The model also has
a trainable reverb, so a common performer/place/channel metadata cluster is
only a candidate for a common recording environment, not proof of one.

## Evidence and compatibility gate

The [DDSP official training guide](https://github.com/magenta/ddsp/blob/main/ddsp/training/README.md)
documents `ddsp_prepare_tfrecord` and `ddsp_run` for custom WAV data. Its
[solo-instrument config](https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/models/solo_instrument.gin)
decodes from `f0` and loudness, and the
[TFRecord config](https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/datasets/tfrecord.gin)
binds train, evaluate, and sample providers. The 3.7.0
[package requirements](https://github.com/magenta/ddsp/blob/main/setup.py)
constrain TensorFlow to `<=2.11` and several older dependencies. TensorFlow's
[tested build table](https://www.tensorflow.org/install/source#gpu) lists
2.11.0 Linux GPU with Python 3.7–3.10, CUDA 11.2, and cuDNN 8.1. Its
[pip guide](https://www.tensorflow.org/install/pip) supports NVIDIA GPU in
WSL2, but the current `tensorflow[and-cuda]` recipe targets the *current*
TensorFlow release, not this old DDSP combination.

These pins are a **candidate**, not a verified install on the user's WSL host:
Python 3.10, `ddsp==3.7.0`, `tensorflow==2.11.0`, compatible CUDA 11.2 and
cuDNN 8.1 runtime libraries. A Linux/Python-3.10 wheel-only resolver check
did not complete because DDSP's `mir_eval<=0.7` has no matching wheel; an
ordinary source build may or may not work. Do not use `--no-deps`, override
version bounds, or silently fall back to CPU to force the environment green.
Record the exact installed dependency lock after a successful installation.

There is a **second, independent RTX 4060 risk**: it is Ada (compute 8.9),
whereas NVIDIA lists [native Ada toolkit support beginning with CUDA 11.8](https://docs.nvidia.com/datacenter/tesla/drivers/latest/cuda-toolkit-driver-and-architecture-matrix.html).
NVIDIA's [Ada compatibility guide](https://docs.nvidia.com/cuda/ada-compatibility-guide/)
says binaries built with CUDA 11.0–11.7 can still work *if* they contain
Ampere-compatible cubins or forward-compatible PTX. We have not established
that the TensorFlow 2.11 / cuDNN 8.1 wheels provide everything DDSP training
needs on this specific 4060. GPU visibility alone is not enough: the small
DDSP training smoke must also pass. Do not interpret a failure as evidence
that all ML daegeum synthesis is impossible; it only rejects this legacy
version combination.

## 1. Prepare a song-level holdout before model work

Use the private `private_manifest.json` created by `prepare_selected_audio.py`
for one 16 kHz mono PCM16 candidate cluster. Transfer only through a route
permitted by the AI Hub terms, and keep source and work on the WSL Linux
filesystem in a private directory (mode 0700). The commands below use
`PILOT_DIR` as a stand-in for that explicit absolute directory; set it to a
private path that is not inside the repository or a shared Windows folder.

```bash
umask 077
PILOT_DIR=/absolute/private/wsl/directory
: "${PILOT_DIR:?Set PILOT_DIR to an absolute private WSL directory}"
python3.10 tools/bgm-gpt/aihub-readiness/ddsp_wsl_pilot.py split \
  --manifest "$PILOT_DIR/audio/private_manifest.json" \
  --output-dir "$PILOT_DIR/song_split"
```

The default checks every WAV format, size, and SHA-256; it creates nothing.
After reviewing the aggregate counts, repeat the same command with
`--materialize`. It hard-links each checked WAV into either `train/` or
`heldout/`, never both, and writes a private split manifest. Its target is
about 15% of audio by one to four **whole song groups** (accepted 8–25%).
This blocks adjacent clips of one labeled song from crossing the boundary;
it cannot rule out duplicated performances under different song labels.
If the split gate fails, inspect the metadata/audio and decide a partition
manually rather than weakening the checks. Do not train merely because the
aggregate metadata says there are 250 files or 82 minutes.

## 2. Install and prove the environment on the actual 4060 host

On WSL2 Ubuntu, use a new Python 3.10 environment. The system-level CUDA
11.2/cuDNN 8.1 provision is *not automated here*; check NVIDIA/TensorFlow
documentation for the host's exact WSL and driver combination. The following
package command is an **attempted pin**, not a promise that its legacy
dependency graph resolves:

```bash
: "${PILOT_DIR:?Set PILOT_DIR to an absolute private WSL directory}"
python3.10 -m venv "$PILOT_DIR/venv"
"$PILOT_DIR/venv/bin/python" -m pip install 'tensorflow==2.11.0' 'ddsp==3.7.0'
"$PILOT_DIR/venv/bin/python" -m pip check
"$PILOT_DIR/venv/bin/python" tools/bgm-gpt/aihub-readiness/ddsp_wsl_pilot.py environment
```

If installation, `pip check`, or `environment` fails, **stop** and record the
error; do not proceed to training. The environment gate requires WSL, Python
3.10, the exact two versions, the DDSP executables, an RTX 4060 visible to
`nvidia-smi`, and a TensorFlow matrix multiplication actually placed on GPU.
This gate cannot be run on the current Mac.

## 3. Only after both gates pass: official DDSP smoke path

Activate the private environment and keep all outputs private. The following
is derived from DDSP's official commands and flags; it has **not** yet been
executed on this WSL/4060 or the licensed dataset.

```bash
: "${PILOT_DIR:?Set PILOT_DIR to an absolute private WSL directory}"
source "$PILOT_DIR/venv/bin/activate"
mkdir -m 700 "$PILOT_DIR/records"
ddsp_prepare_tfrecord \
  --input_audio_filepatterns="$PILOT_DIR/song_split/train/*.wav" \
  --output_tfrecord_path="$PILOT_DIR/records/train.tfrecord" \
  --num_shards=10 --sample_rate=16000 --eval_split_fraction=0 \
  --alsologtostderr
ddsp_prepare_tfrecord \
  --input_audio_filepatterns="$PILOT_DIR/song_split/heldout/*.wav" \
  --output_tfrecord_path="$PILOT_DIR/records/heldout.tfrecord" \
  --num_shards=1 --sample_rate=16000 --eval_split_fraction=0 \
  --alsologtostderr
```

Check that both TFRecord patterns actually produced files. The preprocessing
extracts pitch/loudness from audio; it does **not** make the MIDI and WAV
aligned. Short clips under one 4-second training window may yield no examples
and must be counted before training. Keep the Mac 48 kHz/24-bit original for
listening: 16 kHz conversion cannot preserve energy above 8 kHz, including
some breath/noise detail.

Use a separate, disposable smoke checkpoint directory. `train.num_steps`
and `train.steps_per_save` are present in DDSP's
[optimization base config](https://github.com/magenta/ddsp/blob/main/ddsp/training/gin/optimization/base.gin).
Start at batch size 1 to discover memory and dependency faults, not to judge
sound quality:

```bash
: "${PILOT_DIR:?Set PILOT_DIR to an absolute private WSL directory}"
ddsp_run --mode=train --save_dir="$PILOT_DIR/model_smoke" \
  --gin_file=models/solo_instrument.gin \
  --gin_file=datasets/tfrecord.gin \
  --gin_file=eval/basic_f0_ld.gin \
  --gin_param="TFRecordProvider.file_pattern='$PILOT_DIR/records/train.tfrecord*'" \
  --gin_param="batch_size=1" \
  --gin_param="train.num_steps=20" \
  --gin_param="train.steps_per_save=20" \
  --allow_memory_growth --alsologtostderr
```

Only if preprocessing, GPU execution, and a checkpoint pass should a new
training run be configured. Do not extrapolate a training time or quality
from this smoke. Keep a fixed song holdout and record the exact configuration,
package versions, and training steps. For a first bounded trial, use the
same official `ddsp_run` arguments with a **new** `--save_dir`, batch size 1
or 2 based on measured memory, and a chosen finite `train.num_steps` (for
example, 5,000), then assess held-out loss and listening; more steps are not
automatically better. Never feed the heldout TFRecord to `--mode=train`.

## 4. Held-out reconstruction, not score rendering

Once a *non-smoke* checkpoint exists, the official `ddsp_run`
[`eval` and `sample` modes](https://github.com/magenta/ddsp/blob/main/ddsp/training/ddsp_run.py)
can run once on the held-out TFRecords. Substitute the actual non-smoke model
directory below:

```bash
: "${PILOT_DIR:?Set PILOT_DIR to an absolute private WSL directory}"
MODEL_DIR="$PILOT_DIR/model_trial"
ddsp_run --mode=eval --run_once --save_dir="$MODEL_DIR" \
  --gin_file=datasets/tfrecord.gin --gin_file=eval/basic_f0_ld.gin \
  --gin_param="TFRecordProvider.file_pattern='$PILOT_DIR/records/heldout.tfrecord*'" \
  --alsologtostderr
ddsp_run --mode=sample --run_once --save_dir="$MODEL_DIR" \
  --gin_file=datasets/tfrecord.gin --gin_file=eval/basic_f0_ld.gin \
  --gin_param="TFRecordProvider.file_pattern='$PILOT_DIR/records/heldout.tfrecord*'" \
  --alsologtostderr
```

The sample path writes private TensorBoard audio/summaries for reconstruction
comparison; it is not an eight-bar score render. Compare reconstructed
held-out phrases against their source at matched length and loudness. The
listening gate is attack, breath, identifiable daegeum tone, vibrato, note
transitions, and room sound; reject a machine-like rendering even if loss
improves. Add an entirely separate score-to-`f0`/loudness/attack model or
curated performance curves before considering an eight-bar A/B. Do not alter
the game's default BGM from a successful reconstruction test.
