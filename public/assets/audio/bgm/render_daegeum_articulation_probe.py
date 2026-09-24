#!/usr/bin/env python3
"""Render a four-edge Daegeum articulation probe from recorded samples only.

This is deliberately an *offline R&D probe*, not a game renderer.  It exists
to listen to the four places that were previously conflated into one generic
"continuous note" behaviour:

* ``breath_start`` — a new phrase, using a recorded sample head;
* ``slur`` — change pitch inside one breath, using a recorded steady body;
* ``rearticulate`` — a new recorded head after a deliberate micro-gap; and
* ``detached`` — a new recorded head after an intentional score gap.

The program requires an explicitly restored ``samples_jdae`` directory for an
actual render.  It calls :class:`sampler.Bank` directly and rejects missing,
wrong-instrument, or unsuitable sample selections.  In particular, it never
uses ``sampler.Voices`` or ``sampler.install``: neither oscillator synthesis
nor a fallback instrument can enter this WAV.

``--dry-run`` is dependency- and sample-free.  It emits the score/articulation
contract that an actual run will enforce, which keeps CI useful on machines
where the archival source bank is intentionally absent.

Examples::

    python3 render_daegeum_articulation_probe.py --dry-run
    python3 render_daegeum_articulation_probe.py \\
        --samples-jdae /restored/samples_jdae --output-dir /tmp/dae-probe

The accompanying ``provenance.json`` is part of the result.  It names each
source WAV, its SHA-256, source recording, selected entry mode, and the exact
recorded-head/hold entry evidence used for the four events.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import wave
from pathlib import Path
from typing import Any, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from articulation import (  # noqa: E402  (the module lives beside this script)
    BREATH_START,
    DETACHED,
    REARTICULATE,
    SLUR,
    plan_articulations,
)


class ProbeError(RuntimeError):
    """An actual-only probe precondition failed; never replace it with synth."""


SLUR_XFADE_S = 0.070
REARTICULATE_GAP_S = 0.035
RELEASE_TAIL_S = 0.085
DETACHED_TAIL_S = 0.045


# These pitches are exact (or within cents) entries in the restored Jungak
# Daegeum ``sus`` set.  Keeping all four in the same original source recording
# makes the first listening pass specifically about entry behaviour, not about
# a jump between differently miked sample sessions.
DEFAULT_EVENTS: tuple[dict[str, Any], ...] = (
    {
        "id": "01_breath_start",
        "start": 0.00,
        "end": 1.15,
        "midi": 79.59,
        "articulation": BREATH_START,
    },
    {
        "id": "02_slur",
        "start": 1.15,
        "end": 2.15,
        "midi": 80.89,
        "slur_from_previous": True,
    },
    {
        "id": "03_rearticulate",
        # The short, explicit score gap lets the preceding steady tone fade
        # *inside* the gap before this recorded head begins.  It is not a
        # breath: the authoritative annotation remains rearticulate.
        "start": 2.15 + REARTICULATE_GAP_S,
        "end": 3.10 + REARTICULATE_GAP_S,
        "midi": 82.55,
        "articulation": REARTICULATE,
    },
    {
        "id": "04_detached",
        "start": 3.24 + REARTICULATE_GAP_S,
        "end": 4.06 + REARTICULATE_GAP_S,
        "midi": 84.30,
        "articulation": DETACHED,
    },
)


def default_events() -> list[dict[str, Any]]:
    """Return a fresh, caller-safe copy of the four listening events."""
    return [dict(event) for event in DEFAULT_EVENTS]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _json_value(value: Any) -> Any:
    """Turn NumPy scalar-ish metadata into ordinary JSON values without NumPy."""
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _read_json(path: Path, label: str) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProbeError(f"cannot read {label}: {path}: {exc}") from exc
    if not isinstance(data, dict):
        raise ProbeError(f"{label} must be a JSON object: {path}")
    return data


def validate_sample_root(root: str | Path) -> tuple[Path, dict[str, Any], dict[str, Any]]:
    """Validate a restored source bank before importing/using the sampler.

    This is intentionally stricter than merely checking a directory exists:
    every index path must remain under the explicit restored root and the
    selected bank must contain real Daegeum entries.  It does not rebuild or
    modify the archive index/hold cache.
    """
    resolved = Path(root).expanduser().resolve()
    if not resolved.is_dir():
        raise ProbeError(f"--samples-jdae must be a restored directory, got: {resolved}")

    index_path = resolved / "_index.json"
    hold_path = resolved / "_hold.json"
    if not index_path.is_file() or not hold_path.is_file():
        raise ProbeError(
            "--samples-jdae must point to the restored samples_jdae root "
            "containing _index.json and _hold.json"
        )
    index = _read_json(index_path, "sample index")
    hold = _read_json(hold_path, "hold cache")
    entries = index.get("entries")
    if not isinstance(entries, list) or not entries:
        raise ProbeError(f"sample index has no entries: {index_path}")

    daegeum = []
    for ordinal, entry in enumerate(entries):
        if not isinstance(entry, dict):
            raise ProbeError(f"sample index entry {ordinal} is not an object")
        wav = entry.get("wav")
        if not isinstance(wav, str) or not wav:
            raise ProbeError(f"sample index entry {ordinal} has no relative WAV path")
        wav_path = (resolved / wav).resolve()
        if not _is_relative_to(wav_path, resolved) or not wav_path.is_file():
            raise ProbeError(f"sample index entry {ordinal} points outside/missing bank: {wav}")
        if entry.get("inst") == "daegeum":
            daegeum.append(entry)
    if not daegeum:
        raise ProbeError("the restored bank contains no daegeum sample entries")
    return resolved, index, hold


def plan_probe(events: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Return a validated score plan without touching audio/sample dependencies."""
    plans = plan_articulations(events)
    if not plans:
        raise ProbeError("probe needs at least one sounding event")
    seen = {plan["kind"] for plan in plans}
    required = {BREATH_START, SLUR, REARTICULATE, DETACHED}
    missing = sorted(required - seen)
    if missing:
        raise ProbeError("probe score must exercise all entry modes; missing " + ", ".join(missing))
    for plan in plans:
        event = events[plan["event_index"]]
        midi = event.get("midi")
        try:
            midi = float(midi)
        except (TypeError, ValueError) as exc:
            raise ProbeError(f"event {plan['event_index']} needs numeric midi") from exc
        if not math.isfinite(midi):
            raise ProbeError(f"event {plan['event_index']} has non-finite midi")
        plan["midi"] = midi
        plan["id"] = str(event.get("id", f"event_{plan['event_index']:02d}"))
    return plans


def _event_options(plan: Mapping[str, Any], next_plan: Mapping[str, Any] | None) -> dict[str, Any]:
    """Map the explicit performance edge to the current sample-bank contract."""
    kind = plan["kind"]
    if kind == SLUR:
        legato = SLUR_XFADE_S
        entry_mode = "steady"
    elif kind in (BREATH_START, REARTICULATE, DETACHED):
        legato = 0.0
        entry_mode = "head"
    else:  # plan_probe guards the current four modes; keep future additions loud.
        raise ProbeError(f"unsupported articulation mode: {kind}")

    if next_plan is not None and next_plan["kind"] == SLUR:
        ring = SLUR_XFADE_S
    elif next_plan is not None and next_plan["kind"] == REARTICULATE:
        gap = float(next_plan["start"]) - float(plan["end"])
        if gap < REARTICULATE_GAP_S - 1e-6:
            raise ProbeError(
                "rearticulate must have an explicit score gap of at least "
                f"{REARTICULATE_GAP_S * 1000:.0f} ms so the preceding tone can fade "
                "before the recorded head"
            )
        # Keep the previous tone's release entirely within the declared gap.
        # Starting the next head after an 85 ms tail would merely reintroduce
        # the unwanted overlap that this probe is meant to distinguish.
        ring = gap
    elif next_plan is not None and next_plan["kind"] == DETACHED:
        ring = DETACHED_TAIL_S
    else:
        ring = RELEASE_TAIL_S
    return {"entry_mode": entry_mode, "legato": legato, "ring": ring}


def _load_sampler_modules() -> tuple[Any, Any, Any]:
    """Import the existing offline sampler only for an actual render.

    The current sampler depends on NumPy/SciPy.  Do not silently swap to an
    oscillator if an environment lacks them: that would invalidate this probe.
    """
    try:
        import numpy as np  # type: ignore
        import sampler as sampler_module  # type: ignore
        import gugak as gugak_module  # type: ignore
    except ModuleNotFoundError as exc:
        raise ProbeError(
            "actual probe needs the existing offline sample-renderer dependencies "
            f"(NumPy/SciPy); missing module: {exc.name}. "
            "Use the project/WSL audio environment or run --dry-run."
        ) from exc
    return np, sampler_module, gugak_module


def _capturing_bank_class(base: type) -> type:
    """Create a local ``Bank`` subclass that records the exact chosen WAV."""
    class CapturingBank(base):
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            super().__init__(*args, **kwargs)
            self._probe_picks: list[Any] = []

        def _pick(self, *args: Any, **kwargs: Any) -> Any:
            chosen = super()._pick(*args, **kwargs)
            self._probe_picks.append(chosen)
            return chosen

        def note_with_provenance(self, *args: Any, **kwargs: Any) -> tuple[Any, Any]:
            before = len(self._probe_picks)
            audio = self.note(*args, **kwargs)
            picks = self._probe_picks[before:]
            if len(picks) != 1 or picks[0] is None:
                raise ProbeError("sampler did not make exactly one recorded-sample selection")
            return audio, picks[0]

    return CapturingBank


def _sample_provenance(root: Path, selection: Any) -> dict[str, Any]:
    """Turn a captured ``Bank._pick`` result into auditable, source-safe JSON."""
    try:
        selected_midi, _audio, meta = selection
    except (TypeError, ValueError) as exc:
        raise ProbeError("sampler returned malformed sample selection") from exc
    if not isinstance(meta, Mapping):
        raise ProbeError("sampler selection has no sample metadata")
    wav = meta.get("wav")
    if not isinstance(wav, str) or not wav:
        raise ProbeError("sampler selected a sample without a WAV provenance path")
    wav_path = (root / wav).resolve()
    if not _is_relative_to(wav_path, root) or not wav_path.is_file():
        raise ProbeError(f"sampler selected an invalid WAV path: {wav}")
    return {
        "wav": wav,
        "wav_sha256": sha256_file(wav_path),
        "source_recording": meta.get("src"),
        "selected_midi": _json_value(selected_midi),
        "instrument": meta.get("inst"),
        "sample_articulation": meta.get("art"),
        "dynamic": meta.get("dyn"),
        "seconds": _json_value(meta.get("secs")),
        "recorded_attack_s": _json_value(meta.get("atk")),
        "hold": _json_value(meta.get("hold")),
    }


def _assert_real_selection(plan: Mapping[str, Any], provenance: Mapping[str, Any], last_entry: Any,
                           last_skip: Any, requested_entry_mode: str) -> dict[str, Any]:
    """Reject a selection that could make the A/B listening claim dishonest."""
    if provenance.get("instrument") != "daegeum":
        raise ProbeError(f"{plan['id']}: selected non-Daegeum sample")
    if provenance.get("sample_articulation") != "sus":
        raise ProbeError(
            f"{plan['id']}: required a recorded Daegeum sus sample, got "
            f"{provenance.get('sample_articulation')!r}; refusing substitute"
        )
    if not provenance.get("source_recording") or not provenance.get("wav_sha256"):
        raise ProbeError(f"{plan['id']}: selected sample lacks recorded-source provenance")

    kind = plan["kind"]
    try:
        reported_skip = float(last_skip)
    except (TypeError, ValueError) as exc:
        raise ProbeError(f"{plan['id']}: sampler reported invalid entry skip") from exc
    entry = str(last_entry)
    evidence: dict[str, Any] = {
        "requested_entry_mode": requested_entry_mode,
        "bank_last_entry": entry,
        "bank_last_skip_s": reported_skip,
    }

    if kind == SLUR:
        hold = provenance.get("hold")
        try:
            hold_start = float(hold[0]) if isinstance(hold, list) and hold else None
        except (TypeError, ValueError):
            hold_start = None
        if requested_entry_mode != "steady" or entry != "mid" or hold_start is None:
            raise ProbeError(
                f"{plan['id']}: slur did not enter a recorded hold/steady body "
                f"(entry={entry!r}, hold_start={hold_start})"
            )
        if reported_skip + 1e-6 < hold_start:
            raise ProbeError(
                f"{plan['id']}: slur entry offset {reported_skip:.6f}s is before its "
                f"recorded hold start {hold_start:.6f}s"
            )
        evidence.update({
            "mode": "recorded_steady_body",
            "hold_start_s": hold_start,
            "claim": "A recorded hold/steady section was entered; no new sample head was used.",
        })
        return evidence

    hold = provenance.get("hold")
    hold_start = hold[0] if isinstance(hold, list) and hold else None
    evidence["hold_start_s"] = hold_start
    if requested_entry_mode != "head" or entry != "head" or abs(reported_skip) > 1e-9:
        raise ProbeError(
            f"{plan['id']}: {kind} cannot truthfully use a recorded head "
            f"(entry={entry!r}, skip={reported_skip:.6f}, requested={requested_entry_mode!r})"
        )
    evidence.update(
        mode="recorded_head",
        claim=(
            "A recorded sample head was retained by entry_mode='head' (even if its "
            "hold span begins later). This bank has no dedicated "
            f"{plan['attack_style']!r}-labelled attack sample, so the probe does not "
            "claim that it captured a separately recorded tongue/breath gesture."
        ),
    )
    return evidence


def _write_pcm16(path: Path, signal: Any, sample_rate: int) -> None:
    """Write a mono WAV with stdlib ``wave``; no effects/reverb/synthesis added."""
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = (signal.clip(-1.0, 1.0) * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(int(sample_rate))
        stream.writeframes(pcm.tobytes())


def render_probe(sample_root: str | Path, output_dir: str | Path,
                 events: Sequence[Mapping[str, Any]] | None = None) -> dict[str, Any]:
    """Render the actual-sample probe and return its provenance document.

    ``sample_root`` is mandatory.  This function makes no fallback attempt if
    the bank, source WAV, entry-mode, or SciPy dependency is unavailable.
    """
    root, index, _hold = validate_sample_root(sample_root)
    active_events = [dict(event) for event in (events if events is not None else default_events())]
    plans = plan_probe(active_events)
    np, sampler_module, gugak_module = _load_sampler_modules()

    CapturingBank = _capturing_bank_class(sampler_module.Bank)
    bank = CapturingBank(root, stereo=False)
    if not bank.has("daegeum"):
        raise ProbeError("sampler loaded no Daegeum samples from the explicit bank")

    sample_rate = int(gugak_module.SR)
    tail = max(SLUR_XFADE_S, RELEASE_TAIL_S) + 0.05
    end_s = max(float(plan["end"]) for plan in plans) + tail
    mix = np.zeros(int(math.ceil(end_s * sample_rate)), dtype=np.float32)
    event_provenance: list[dict[str, Any]] = []

    for position, plan in enumerate(plans):
        next_plan = plans[position + 1] if position + 1 < len(plans) else None
        opts = _event_options(plan, next_plan)
        duration = float(plan["end"]) - float(plan["start"])
        audio, selection = bank.note_with_provenance(
            "daegeum",
            float(plan["midi"]),
            duration,
            amp=0.70,
            art="sus",
            legato=opts["legato"],
            ring=opts["ring"],
            entry_mode=opts["entry_mode"],
            rr=position,
        )
        if audio is None or len(audio) == 0:
            raise ProbeError(f"{plan['id']}: sampler returned no actual audio")
        if getattr(audio, "ndim", 1) != 1:
            raise ProbeError(f"{plan['id']}: probe requires a mono actual-sample render")

        selected = _sample_provenance(root, selection)
        entry_evidence = _assert_real_selection(
            plan, selected, getattr(gugak_module, "LAST_ENTRY", None),
            getattr(gugak_module, "LAST_SKIP", None), opts["entry_mode"],
        )
        start = int(round(float(plan["start"]) * sample_rate))
        stop = min(len(mix), start + len(audio))
        if stop <= start:
            raise ProbeError(f"{plan['id']}: rendered audio falls outside probe timeline")
        mix[start:stop] += audio[:stop - start]
        event_provenance.append(
            {
                "id": plan["id"],
                "kind": plan["kind"],
                "reason": plan["reason"],
                "score_start_s": plan["start"],
                "score_end_s": plan["end"],
                "requested_midi": plan["midi"],
                "gap_before_s": plan["gap_before"],
                "sample_mode": plan["sample_mode"],
                "attack_style": plan["attack_style"],
                "renderer_legato_s": opts["legato"],
                "renderer_tail_s": opts["ring"],
                "renderer_entry_mode": opts["entry_mode"],
                "sample": selected,
                "entry_evidence": entry_evidence,
            }
        )

    peak_before = float(np.max(np.abs(mix))) if len(mix) else 0.0
    normalization_gain = 1.0 if peak_before <= 0.98 else 0.98 / peak_before
    mix *= normalization_gain
    output = Path(output_dir).expanduser().resolve()
    wav_path = output / "daegeum_articulation_probe.wav"
    _write_pcm16(wav_path, mix, sample_rate)
    document = {
        "schema": "durango.daegeum-articulation-probe.v1",
        "actual_recorded_samples_only": True,
        "renderer": "sampler.Bank.note direct (no Voices/install/fallback)",
        "source_bank": {
            "root": str(root),
            "index_sha256": sha256_file(root / "_index.json"),
            "hold_sha256": sha256_file(root / "_hold.json"),
            "index_entry_count": index.get("count", len(index.get("entries", []))),
        },
        "output": {
            "wav": str(wav_path),
            "wav_sha256": sha256_file(wav_path),
            "sample_rate": sample_rate,
            "seconds": round(len(mix) / sample_rate, 6),
            "peak_before_normalization": peak_before,
            "normalization_gain": normalization_gain,
        },
        "events": event_provenance,
    }
    provenance_path = output / "provenance.json"
    provenance_path.write_text(
        json.dumps(document, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    return document


def dry_run_document(events: Sequence[Mapping[str, Any]] | None = None) -> dict[str, Any]:
    """Return the no-source planning contract used by the repository test."""
    active_events = [dict(event) for event in (events if events is not None else default_events())]
    plans = plan_probe(active_events)
    return {
        "schema": "durango.daegeum-articulation-probe.dry-run.v1",
        "actual_render": False,
        "requires_explicit_samples_jdae_root": True,
        "fallback": "forbidden",
        "events": [
            {
                "id": plan["id"],
                "kind": plan["kind"],
                "sample_mode": plan["sample_mode"],
                "attack_style": plan["attack_style"],
                "requested_midi": plan["midi"],
                "gap_before_s": plan["gap_before"],
                "renderer": _event_options(
                    plan, plans[position + 1] if position + 1 < len(plans) else None
                ),
            }
            for position, plan in enumerate(plans)
        ],
    }


def _read_events(path: Path) -> list[dict[str, Any]]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProbeError(f"cannot read --events-json {path}: {exc}") from exc
    if not isinstance(data, list) or not all(isinstance(event, dict) for event in data):
        raise ProbeError("--events-json must be a JSON list of event objects")
    return [dict(event) for event in data]


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--samples-jdae",
        type=Path,
        help="explicit restored samples_jdae directory; mandatory unless --dry-run",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("out_daegeum_articulation_probe"),
        help="directory for daegeum_articulation_probe.wav + provenance.json",
    )
    parser.add_argument(
        "--events-json",
        type=Path,
        help="optional JSON list replacing the default four-event listening score",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="validate and print score/articulation plan without samples or audio dependencies",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        events = _read_events(args.events_json) if args.events_json else None
        if args.dry_run:
            print(json.dumps(dry_run_document(events), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.samples_jdae is None:
            raise ProbeError("--samples-jdae is required for an actual render; use --dry-run otherwise")
        document = render_probe(args.samples_jdae, args.output_dir, events)
    except ProbeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps(document["output"], ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
