#!/usr/bin/env python3
"""Run a contained, provenance-bearing MIDI-DDSP FLUTE R&D render.

This tool is intentionally narrow.  It accepts only an explicitly named
standard-MIDI FLUTE score, an explicitly named authorial bridge JSON, and an
explicitly named official MIDI-DDSP checkpoint root.  It never trains, reads
NGC/user audio, or writes into the game's audio tree.

The 2022 DDSP 3.2.0 package eagerly imports cloud, notebook, and training
modules from ``ddsp.training.__init__``.  MIDI-DDSP inference only needs the
official ``ddsp.training.nn`` and ``ddsp.training.decoders`` modules.  The
runtime shim below creates a package shell and imports exactly those two source
files, unchanged.  It is deliberately recorded as a nonstandard runtime shim;
it must not be represented as a supported modern MIDI-DDSP installation.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import json
from pathlib import Path
import random
import sys
import traceback
import types
from typing import Any, Mapping, Sequence


REPORT_SCHEMA = "mini.midi-ddsp-official-flute-rnd.v1"
REPORT_FILENAME = "official_flute_rnd_report.json"
FRAME_RATE = 250
SAMPLE_RATE = 16_000
FLUTE_GENERAL_MIDI_PROGRAM = 73
FLUTE_MIDI_DDSP_INSTRUMENT_ID = 4
OFFICIAL_MIDI_DDSP_REPOSITORY = "https://github.com/magenta/midi-ddsp"
OFFICIAL_MIDI_DDSP_REVISION = "d7af42704a63b47267ae6a1bc0fee1ed7dc5c855"
DOCUMENTED_BRIDGE_FIELDS = (
    "volume",
    "vol_fluc",
    "vibrato",
    "brightness",
    "attack",
    "vol_peak_pos",
)


class RuntimeContractError(RuntimeError):
    """A caller named a destination/input outside this deliberately narrow R&D contract."""


def default_repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _is_under(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
    except ValueError:
        return False
    return True


def require_fresh_rnd_directory(report_dir: Path, *, repo_root: Path) -> Path:
    """Create one fresh ignored R&D directory; refuse assets and overwrites."""

    expected_root = (repo_root / "_bgm_rnd").resolve()
    resolved = report_dir.resolve()
    if not _is_under(resolved, expected_root) or resolved == expected_root:
        raise RuntimeContractError("report directory must be a fresh child of repo _bgm_rnd/")
    if report_dir.exists():
        raise RuntimeContractError("report directory must be fresh; refusing to overwrite R&D evidence")
    report_dir.mkdir(parents=True, exist_ok=False)
    return report_dir


def require_file(path: Path, *, suffix: str, label: str) -> Path:
    if not path.is_file():
        raise RuntimeContractError(f"{label} is absent or not a file")
    if path.suffix.lower() != suffix:
        raise RuntimeContractError(f"{label} must use {suffix}")
    return path.resolve()


def load_bridge(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise RuntimeContractError(f"bridge JSON is unreadable: {type(exc).__name__}") from exc
    notes = payload.get("notes") if isinstance(payload, dict) else None
    if not isinstance(notes, list) or not notes:
        raise RuntimeContractError("bridge JSON has no nonempty notes list")
    for note in notes:
        expression = note.get("midi_ddsp_expression") if isinstance(note, dict) else None
        if not isinstance(expression, dict) or set(expression) != set(DOCUMENTED_BRIDGE_FIELDS):
            raise RuntimeContractError("each bridge note must contain exactly the six documented fields")
        for field in DOCUMENTED_BRIDGE_FIELDS:
            value = expression[field]
            if not isinstance(value, (int, float)) or not 0.0 <= float(value) <= 1.0:
                raise RuntimeContractError(f"bridge {field} must be a number in [0, 1]")
        if not isinstance(note.get("midi_note"), int):
            raise RuntimeContractError("bridge note lacks integer midi_note")
        for field in ("onset_seconds", "offset_seconds"):
            if not isinstance(note.get(field), (int, float)):
                raise RuntimeContractError(f"bridge note lacks numeric {field}")
    return payload


def bridge_frames(note: Mapping[str, Any], *, frame_rate: int = FRAME_RATE) -> tuple[int, int]:
    onset = int(round(float(note["onset_seconds"]) * frame_rate))
    offset = int(round(float(note["offset_seconds"]) * frame_rate))
    if offset <= onset:
        raise RuntimeContractError("bridge note has non-positive duration after frame conversion")
    return onset, offset


def bridge_row_assignments(
    rows: Sequence[Mapping[str, Any]], bridge_notes: Sequence[Mapping[str, Any]], *, frame_rate: int = FRAME_RATE
) -> list[tuple[int, Mapping[str, Any]]]:
    """Match authorial bridge events to exactly one model conditioning row each.

    Matching pitch/onset/offset is intentionally exact.  The bridge must not
    silently slide a control across a rest or infer a slur from adjacent MIDI
    timestamps.
    """

    assignments: list[tuple[int, Mapping[str, Any]]] = []
    assigned_rows: set[int] = set()
    for note in bridge_notes:
        onset, offset = bridge_frames(note, frame_rate=frame_rate)
        matches = [
            row_index
            for row_index, row in enumerate(rows)
            if int(row["pitch"]) == int(note["midi_note"])
            and int(row["onset"]) == onset
            and int(row["offset"]) == offset
            and int(row["note_length"]) == offset - onset
        ]
        if len(matches) != 1:
            raise RuntimeContractError(
                "bridge event does not map to exactly one MIDI-DDSP conditioning row "
                f"(pitch={note['midi_note']}, onset={onset}, offset={offset}, matches={matches})"
            )
        if matches[0] in assigned_rows:
            raise RuntimeContractError("multiple bridge events target the same conditioning row")
        assigned_rows.add(matches[0])
        assignments.append((matches[0], note))
    return assignments


def apply_bridge_controls(conditioning_df: Any, bridge_payload: Mapping[str, Any]) -> tuple[Any, list[dict[str, Any]]]:
    """Return a copy with only the six documented bridge fields overridden."""

    rows = conditioning_df.to_dict(orient="records")
    assignments = bridge_row_assignments(rows, bridge_payload["notes"])
    result = conditioning_df.copy(deep=True)
    applied: list[dict[str, Any]] = []
    for row_index, note in assignments:
        expression = note["midi_ddsp_expression"]
        for field in DOCUMENTED_BRIDGE_FIELDS:
            result.at[row_index, field] = float(expression[field])
        applied.append(
            {
                "conditioning_row": row_index,
                "plan_event_id": note.get("plan_event_id"),
                "midi_note": int(note["midi_note"]),
                "onset_frame": int(result.at[row_index, "onset"]),
                "offset_frame": int(result.at[row_index, "offset"]),
                "fields_overridden": list(DOCUMENTED_BRIDGE_FIELDS),
            }
        )
    return result, applied


def _runtime_source_record(path: Path, *, label: str) -> dict[str, str]:
    return {"label": label, "sha256": sha256_file(path)}


def install_minimal_training_shim() -> dict[str, Any]:
    """Expose only official inference-needed DDSP training modules in this process.

    This avoids the legacy package's unrelated eager cloud/notebook imports.
    No source is copied, patched, or rewritten.
    """

    import ddsp  # Imported only in explicit runtime execution.

    training_dir = Path(ddsp.__file__).resolve().parent / "training"
    nn_path = training_dir / "nn.py"
    decoders_path = training_dir / "decoders.py"
    if not nn_path.is_file() or not decoders_path.is_file():
        raise RuntimeContractError("DDSP package lacks inference-required nn/decoders source files")

    training = types.ModuleType("ddsp.training")
    training.__path__ = [str(training_dir)]
    training.__package__ = "ddsp.training"
    sys.modules["ddsp.training"] = training
    setattr(ddsp, "training", training)
    training.nn = importlib.import_module("ddsp.training.nn")
    training.decoders = importlib.import_module("ddsp.training.decoders")
    return {
        "enabled": True,
        "reason": "DDSP 3.2.0 eager-imports unrelated cloud/notebook/training modules; inference imports only nn and decoders.",
        "source_files_imported_unchanged": [
            _runtime_source_record(nn_path, label="site-packages/ddsp/training/nn.py"),
            _runtime_source_record(decoders_path, label="site-packages/ddsp/training/decoders.py"),
        ],
    }


def package_version(name: str) -> str | None:
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def tensor_shape_tree(value: Any) -> Any:
    """Summarize tensor-like outputs without serializing audio/control samples."""

    if isinstance(value, Mapping):
        return {str(key): tensor_shape_tree(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [tensor_shape_tree(item) for item in value]
    shape = getattr(value, "shape", None)
    if shape is not None:
        try:
            return {"shape": [int(item) for item in shape]}
        except TypeError:
            return {"shape": str(shape)}
    return {"type": type(value).__name__}


def apply_authorial_release_and_truncate(
    audio: Any,
    *,
    release_start_seconds: float,
    release_end_seconds: float,
    sample_rate: int = SAMPLE_RATE,
) -> Any:
    """Apply an explicit post-model fade then discard the model's synthetic tail.

    This is not a MIDI-DDSP note-expression feature.  It is kept separate from
    the six-field bridge because the supplied authorial plan names this release
    outside standard MIDI-DDSP conditioning.  The caller must name both times.
    """

    import numpy as np

    if not 0.0 <= release_start_seconds < release_end_seconds:
        raise RuntimeContractError("authorial release must have a positive, non-negative time span")
    release_start = int(round(release_start_seconds * sample_rate))
    release_end = int(round(release_end_seconds * sample_rate))
    samples = np.asarray(audio)
    if samples.ndim != 1:
        raise RuntimeContractError("post-model release expects one mono audio stem")
    if samples.shape[0] < release_end:
        raise RuntimeContractError("official model audio is shorter than explicit authorial release end")
    result = samples[:release_end].copy()
    result[release_start:release_end] *= np.linspace(
        1.0, 0.0, release_end - release_start, endpoint=True, dtype=result.dtype
    )
    return result


def assert_flute_score(midi_path: Path) -> dict[str, Any]:
    import pretty_midi

    midi = pretty_midi.PrettyMIDI(str(midi_path))
    if len(midi.instruments) != 1:
        raise RuntimeContractError("R&D score must be monophonic/one-part MIDI")
    instrument = midi.instruments[0]
    if instrument.is_drum or instrument.program != FLUTE_GENERAL_MIDI_PROGRAM:
        raise RuntimeContractError("R&D score must be General MIDI program 73 (flute), never a guessed Daegeum program")
    if not instrument.notes:
        raise RuntimeContractError("R&D score contains no notes")
    return {
        "general_midi_program": instrument.program,
        "note_count": len(instrument.notes),
        "duration_seconds": midi.get_end_time(),
        "midi_ddsp_instrument_id": FLUTE_MIDI_DDSP_INSTRUMENT_ID,
    }


def _json_scalar(value: Any) -> Any:
    """Convert NumPy-style scalar metadata, never tensor/audio arrays, for a sidecar."""

    item = getattr(value, "item", None)
    if callable(item):
        try:
            converted = item()
        except (TypeError, ValueError) as exc:
            raise TypeError(f"sidecar refuses non-scalar value {type(value).__name__}") from exc
        if isinstance(converted, (str, int, float, bool)) or converted is None:
            return converted
    if isinstance(value, Path):
        return value.as_posix()
    raise TypeError(f"sidecar refuses non-scalar value {type(value).__name__}")


def write_json(path: Path, payload: Mapping[str, Any]) -> None:
    path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True, default=_json_scalar) + "\n",
        encoding="utf-8",
    )


def run(
    *,
    repo_root: Path,
    midi_path: Path,
    bridge_path: Path,
    weights_root: Path,
    weight_zip: Path,
    report_dir: Path,
    seed: int,
    release_start_seconds: float,
    release_end_seconds: float,
) -> dict[str, Any]:
    """Perform two explicitly labeled FLUTE-only variants and write a sidecar."""

    midi_path = require_file(midi_path, suffix=".mid", label="MIDI score")
    bridge_path = require_file(bridge_path, suffix=".json", label="bridge JSON")
    weight_zip = require_file(weight_zip, suffix=".zip", label="official weight ZIP")
    if not weights_root.is_dir():
        raise RuntimeContractError("extracted official weight root is absent")
    if not (weights_root / "synthesis_generator" / "50000.index").is_file():
        raise RuntimeContractError("official synthesis-generator checkpoint is absent")
    if not (weights_root / "expression_generator" / "5000.index").is_file():
        raise RuntimeContractError("official expression-generator checkpoint is absent")
    bridge = load_bridge(bridge_path)
    score_summary = assert_flute_score(midi_path)
    report_dir = require_fresh_rnd_directory(report_dir, repo_root=repo_root)

    base_report: dict[str, Any] = {
        "schema": REPORT_SCHEMA,
        "status": "started",
        "scope": {
            "r_and_d_only": True,
            "not_a_daegeum_renderer": True,
            "not_a_training_result": True,
            "not_a_game_asset": True,
            "no_ngc_or_user_audio_read": True,
            "no_default_bgm_changed": True,
            "pretrained_weight_game_license_clearance_not_established": True,
        },
        "inputs": {
            "midi": {"sha256": sha256_file(midi_path), "label": "explicit authorial FLUTE MIDI"},
            "bridge": {"sha256": sha256_file(bridge_path), "label": "explicit authorial six-field bridge"},
            "official_weight_zip": {
                "sha256": sha256_file(weight_zip),
                "label": "official MIDI-DDSP URMP checkpoint ZIP; provenance/license remains R&D review subject",
            },
        },
        "official_code_provenance": {
            "repository": OFFICIAL_MIDI_DDSP_REPOSITORY,
            "checked_out_revision_used_to_build_runtime": OFFICIAL_MIDI_DDSP_REVISION,
            "interpretation_limit": "Repository/weight identity does not establish permission to distribute the resulting audio in the game.",
        },
        "flute_scope": score_summary,
        "variants": {},
    }
    try:
        random.seed(seed)
        import numpy as np
        import tensorflow as tf

        np.random.seed(seed)
        tf.random.set_seed(seed)
        shim = install_minimal_training_shim()
        from midi_ddsp.midi_ddsp_synthesize import load_pretrained_model
        from midi_ddsp.utils.audio_io import save_wav
        from midi_ddsp.utils.inference_utils import conditioning_df_to_audio
        from midi_ddsp.utils.midi_synthesis_utils import synthesize_mono_midi

        synthesis_generator, expression_generator = load_pretrained_model(
            synthesis_generator_path=str(weights_root / "synthesis_generator" / "50000"),
            expression_generator_path=str(weights_root / "expression_generator" / "5000"),
        )
        automatic_dir = report_dir / "a_automatic_flute_expression"
        bridge_dir = report_dir / "b_authorial_bridge6_controls"
        automatic_dir.mkdir()
        bridge_dir.mkdir()

        automatic_audio, automatic_controls, automatic_synth, automatic_df = synthesize_mono_midi(
            synthesis_generator,
            expression_generator,
            str(midi_path),
            instrument_id=FLUTE_MIDI_DDSP_INSTRUMENT_ID,
            output_dir=str(automatic_dir),
            display_progressbar=False,
        )
        automatic_audio_path = automatic_dir / f"{midi_path.stem}.wav"
        automatic_csv = automatic_dir / "automatic_expression_controls.csv"
        automatic_df.to_csv(automatic_csv, index=False)

        bridge_df, bridge_applied = apply_bridge_controls(automatic_df, bridge)
        bridge_audio, bridge_controls, bridge_synth = conditioning_df_to_audio(
            synthesis_generator,
            bridge_df,
            tf.constant([FLUTE_MIDI_DDSP_INSTRUMENT_ID]),
            display_progressbar=False,
        )
        bridge_audio_path = bridge_dir / f"{midi_path.stem}_bridge6.wav"
        bridge_post_model_audio = apply_authorial_release_and_truncate(
            bridge_audio[0].numpy(),
            release_start_seconds=release_start_seconds,
            release_end_seconds=release_end_seconds,
        )
        save_wav(bridge_post_model_audio, str(bridge_audio_path), SAMPLE_RATE)
        bridge_csv = bridge_dir / "authorial_bridge6_expression_controls.csv"
        bridge_df.to_csv(bridge_csv, index=False)

        base_report.update(
            {
                "status": "succeeded",
                "runtime": {
                    "python": sys.version.split()[0],
                    "tensorflow": package_version("tensorflow-macos") or package_version("tensorflow"),
                    "ddsp": package_version("ddsp"),
                    "midi_ddsp": package_version("midi-ddsp"),
                    "seed": seed,
                    "nonstandard_import_shim": shim,
                },
                "variants": {
                    "A_automatic_flute_expression": {
                        "description": "Official MIDI-DDSP ExpressionGenerator prediction followed by official synthesis generator.",
                        "audio": {"relative_path": automatic_audio_path.relative_to(report_dir).as_posix(), "sha256": sha256_file(automatic_audio_path)},
                        "expression_controls_csv": {"relative_path": automatic_csv.relative_to(report_dir).as_posix(), "sha256": sha256_file(automatic_csv)},
                        "model_control_shapes": tensor_shape_tree(automatic_controls),
                        "model_synthesis_shapes": tensor_shape_tree(automatic_synth),
                    },
                    "B_authorial_bridge6_controls": {
                        "description": "A conditioning dataframe with exactly six documented fields overridden per explicitly matched authorial bridge event; re-synthesized by official synthesis generator.",
                        "audio": {"relative_path": bridge_audio_path.relative_to(report_dir).as_posix(), "sha256": sha256_file(bridge_audio_path)},
                        "expression_controls_csv": {"relative_path": bridge_csv.relative_to(report_dir).as_posix(), "sha256": sha256_file(bridge_csv)},
                        "bridge_events_applied": bridge_applied,
                        "model_control_shapes": tensor_shape_tree(bridge_controls),
                        "model_synthesis_shapes": tensor_shape_tree(bridge_synth),
                        "post_model_authorial_release": {
                            "applied": True,
                            "start_seconds": release_start_seconds,
                            "end_seconds": release_end_seconds,
                            "action": "linear amplitude release then truncate at end_seconds",
                            "interpretation_limit": "This is an explicit post-model authorial envelope, not a MIDI-DDSP expression field or learned performance claim.",
                        },
                    },
                },
            }
        )
    except BaseException as exc:
        base_report.update(
            {
                "status": "failed",
                "failure": {"type": type(exc).__name__, "message": str(exc)},
            }
        )
        write_json(report_dir / REPORT_FILENAME, base_report)
        raise
    write_json(report_dir / REPORT_FILENAME, base_report)
    return base_report


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo-root", type=Path, default=default_repo_root())
    parser.add_argument("--midi-path", type=Path, required=True)
    parser.add_argument("--bridge-json", type=Path, required=True)
    parser.add_argument("--weights-root", type=Path, required=True)
    parser.add_argument("--weight-zip", type=Path, required=True)
    parser.add_argument("--report-dir", type=Path, required=True)
    parser.add_argument("--seed", type=int, default=20260925)
    parser.add_argument("--authorial-release-start-seconds", type=float, required=True)
    parser.add_argument("--authorial-release-end-seconds", type=float, required=True)
    parser.add_argument("--execute", action="store_true", help="Required: performs model inference and writes R&D-only outputs.")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if not args.execute:
        raise RuntimeContractError("refusing inference without explicit --execute")
    try:
        report = run(
            repo_root=args.repo_root.resolve(),
            midi_path=args.midi_path,
            bridge_path=args.bridge_json,
            weights_root=args.weights_root,
            weight_zip=args.weight_zip,
            report_dir=args.report_dir,
            seed=args.seed,
            release_start_seconds=args.authorial_release_start_seconds,
            release_end_seconds=args.authorial_release_end_seconds,
        )
    except RuntimeContractError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except BaseException as exc:
        print(f"runtime error: {type(exc).__name__}: {exc}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return 1
    print(json.dumps({"status": report["status"], "report": REPORT_FILENAME}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
