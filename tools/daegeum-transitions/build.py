#!/usr/bin/env python3
"""Build an auditable *candidate* bank for direct Daegeum recordings.

R&D-06 deliberately separates audio measurement from a musical claim.  It
reads only the direct source WAVE files named by ``--raw-daegeum-dir`` and
creates three distinct kinds of output:

* a native-frame source catalog and frame-aligned feature cache;
* **unreviewed** F0/onset candidates plus raw, contiguous review crops; and
* a transition/training bank made only from separately supplied approved
  human labels.

It never resamples or normalizes an original source, never calls a sampler or
oscillator, and never calls an automatically detected F0 change a natural
legato, same-breath gesture, or approved training item.  The first direct
local Daegeum corpus is tiny; this tool is intentionally a truth-preserving
atlas for determining what is actually present before any ML is attempted.

    python tools/daegeum-transitions/build.py --dry-run
    python tools/daegeum-transitions/build.py \
      --raw-daegeum-dir /path/to/sanjo-direct-wavs \
      --raw-daegeum-dir /path/to/jeongak-direct-wavs \
      --output-dir _bgm_rnd/daegeum-transition-bank-YYYYMMDD

Pass ``--labels`` only when a reviewer has filled in a label JSONL using
native source frame coordinates.  An unreviewed template is always emitted;
the supplied labels are copied nowhere unless they validate against the exact
source hash and contiguous raw-frame ranges.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import html
import json
import math
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping, Sequence


HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

from native_wav import NativeWavError, inspect_wav, read_native_wav  # noqa: E402


SCHEMA = "durango.daegeum.transition-bank.v1"
LABEL_SCHEMA = "durango.daegeum.transition-label.v1"
ANALYSIS_SCHEMA = "durango.daegeum.expression-features.v1"

FEATURE_HOP_S = 0.010
FEATURE_WINDOW_S = 0.050
F0_ANALYSIS_RATE = 12_000
F0_MIN_HZ = 65.0
F0_MAX_HZ = 1_000.0
MIN_VOICING_CONFIDENCE = 0.42
MIN_CANDIDATE_STEP_CENTS = 80.0
MAX_SAME_PITCH_STEP_CENTS = 55.0
SAME_PITCH_ONSET_FLUX_QUANTILE = 0.90
SAME_PITCH_MIN_RELATIVE_VALLEY_DB = -5.0
MIN_CANDIDATE_GAP_S = 0.500
CONTEXT_S = 0.750
BOUNDARY_HALF_WINDOW_S = 0.080

APPROVED_GESTURE_CLASSES = frozenset({
    "continuous_pitch_change",
    "tongued_rearticulation",
    "breath_separated",
    "same_pitch_continuation",
    "ornament_or_sigimsae",
    "not_a_transition",
})

# A reviewer may preserve a tongued onset, breath boundary, same-pitch
# continuation, ornament, or genuine pitch change as expression evidence.  A
# finding that is explicitly *not* a transition is useful review history but
# must not become a training/example row.
EXPRESSION_GESTURE_CLASSES = APPROVED_GESTURE_CLASSES - {"not_a_transition"}
REVIEW_STATES = frozenset({"unreviewed", "needs_review", "rejected", "approved"})
AUDIBLE_ONSET_VALUES = frozenset({"unknown", "none", "tongue", "breath", "other"})
SAME_BREATH_VALUES = frozenset({"unknown", "yes", "no"})
LABEL_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$")

# This classification is intentionally only a source-recording description;
# it makes no claim about the musical content of an individual candidate.
KNOWN_SOURCE_ROLE: dict[str, str] = {
    "Sanjo_deageum_1.wav": "isolated_note_series",
    "Sanjo_deageum_2.wav": "continuous_performance_candidate",
    "Jeongakdaegeum.wav": "continuous_performance_candidate",
    "sanjo_deageum_nina_29.wav": "separated_sigimsae_exercises",
    "sanjo_deageum_nira_23.wav": "separated_sigimsae_exercises",
    "sanjo_deageum_scale_chung_34.wav": "separated_scale_exercises",
    "sanjo_deageum_scale_deep_vib_48.wav": "separated_deep_vibrato_exercises",
    "sanjo_deageum_scale_sus_04.wav": "separated_sustain_exercises",
    "sanjo_deageum_scale_vib_39.wav": "separated_vibrato_exercises",
    "sanjo_deageum_stacatto_60.wav": "separated_staccato_exercises",
    "jungak_deageum_scale_sus_25.wav": "separated_sustain_exercises",
    "jungak_deageum_scale_chung_59.wav": "separated_scale_exercises",
    "jungak_deageum_scale_sus_vib_26.wav": "separated_vibrato_exercises",
    "jungak_deageum_scale_sus_deep_vib_61.wav": "separated_deep_vibrato_exercises",
    "jungak_deageum_nina_vib_32.wav": "separated_sigimsae_exercises",
}

# Local access to a user-provided copy is not evidence of a license for model
# training, redistribution, or a shipped game.  This record intentionally
# travels with every source rather than relying on an undocumented blanket
# assumption about a download page.
LOCAL_RND_RIGHTS: dict[str, Any] = {
    "status": "unverified_local_rnd_only",
    "license_assertion": "none",
    "training_or_distribution_requires_source_term_confirmation": True,
}

COVERAGE_TARGETS: tuple[dict[str, Any], ...] = (
    {
        "target_id": "77_to_77_rearticulation",
        "from_midi": 77.0,
        "to_midi": 77.0,
        "required_capability": "expression_articulation",
        "gesture_classes": ["tongued_rearticulation", "same_pitch_continuation"],
    },
    {
        "target_id": "77_to_74_continuous",
        "from_midi": 77.0,
        "to_midi": 74.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
    {
        "target_id": "74_to_72_continuous",
        "from_midi": 74.0,
        "to_midi": 72.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
    {
        "target_id": "72_to_70_continuous",
        "from_midi": 72.0,
        "to_midi": 70.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
    {
        "target_id": "70_to_72_continuous",
        "from_midi": 70.0,
        "to_midi": 72.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
    {
        "target_id": "72_to_74_continuous",
        "from_midi": 72.0,
        "to_midi": 74.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
    {
        "target_id": "74_to_77_continuous",
        "from_midi": 74.0,
        "to_midi": 77.0,
        "required_capability": "transition_retrieval",
        "gesture_classes": ["continuous_pitch_change"],
    },
)


class BuildError(RuntimeError):
    """The builder must stop rather than quietly create a misleading bank."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _json_value(value: Any) -> Any:
    """Convert NumPy scalars/arrays when optional analysis dependencies are loaded."""
    if hasattr(value, "item"):
        try:
            return value.item()
        except (TypeError, ValueError):
            pass
    if hasattr(value, "tolist"):
        try:
            return value.tolist()
        except (TypeError, ValueError):
            pass
    if isinstance(value, Mapping):
        return {str(key): _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(_json_value(value), ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                    encoding="utf-8")


def _write_jsonl(path: Path, rows: Iterable[Mapping[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as stream:
        for row in rows:
            stream.write(json.dumps(_json_value(row), ensure_ascii=False, sort_keys=True) + "\n")


def _inside(root: Path, child: Path) -> Path:
    resolved = child.resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise BuildError(f"source path escapes explicit raw root: {child}") from exc
    return resolved


def _normalize_raw_roots(raw_daegeum_roots: str | Path | Sequence[str | Path]) -> list[Path]:
    """Resolve explicit source roots without retaining them in any artifact."""
    if isinstance(raw_daegeum_roots, (str, Path)):
        values: Sequence[str | Path] = [raw_daegeum_roots]
    else:
        values = raw_daegeum_roots
    if not values:
        raise BuildError("at least one --raw-daegeum-dir is required")
    roots: list[Path] = []
    seen: set[Path] = set()
    for value in values:
        root = Path(value).expanduser().resolve()
        if not root.is_dir():
            raise BuildError(f"--raw-daegeum-dir must be a directory: {root}")
        if root in seen:
            raise BuildError("the same --raw-daegeum-dir was supplied more than once")
        seen.add(root)
        roots.append(root)
    return roots


def _list_direct_waves(roots: Sequence[Path]) -> list[tuple[Path, Path]]:
    """List immediate WAV files with the root that authorizes each path.

    Multiple explicitly supplied roots make it possible to inspect separate
    official recording sets together without copying, symlinking, or leaking
    either local directory name into the generated catalog.
    """
    waves: list[tuple[Path, Path]] = []
    seen_sources: set[Path] = set()
    for root in roots:
        root_waves = sorted(
            (_inside(root, item) for item in root.iterdir()
             if item.is_file() and item.suffix.lower() == ".wav"),
            key=lambda item: item.name.casefold(),
        )
        if not root_waves:
            raise BuildError("an explicit --raw-daegeum-dir contains no direct .wav source files")
        for path in root_waves:
            if path in seen_sources:
                raise BuildError("the same direct WAV appears under multiple supplied source roots")
            seen_sources.add(path)
            waves.append((root, path))
    return waves


def _source_id(sha256: str) -> str:
    return f"src_{sha256[:16]}"


def _source_catalog_item(path: Path) -> dict[str, Any]:
    try:
        meta = dict(inspect_wav(path))
    except NativeWavError as exc:
        raise BuildError(f"cannot inspect direct WAV {path.name}: {exc}") from exc
    sha = str(meta.get("sha256", ""))
    if len(sha) != 64:
        raise BuildError(f"{path.name}: reader did not supply a SHA-256")
    # ``inspect_wav`` must not surface an absolute source path.  The explicit
    # relative filename is enough to recover a locally selected source root.
    if "path" in meta or "absolute_path" in meta:
        raise BuildError("native WAV inspector leaked a source path into catalog metadata")
    native_audio = meta.get("native_audio")
    if not isinstance(native_audio, Mapping):
        raise BuildError(f"{path.name}: native WAV descriptor has no native_audio object")
    try:
        compact_native = {
            "sample_rate_hz": int(native_audio["sample_rate_hz"]),
            "channels": int(native_audio["channels"]),
            "frame_count": int(native_audio["frame_count"]),
            "encoding": str(native_audio["encoding"]),
            "bits_per_sample": int(native_audio["bits_per_sample"]),
            "container_id": str(meta["container"]["id"]),
            "analysis_mono_policy": meta["analysis_mono_policy"],
            "reader_descriptor": meta,
        }
    except (KeyError, TypeError, ValueError) as exc:
        raise BuildError(f"{path.name}: native WAV descriptor is incomplete") from exc
    return {
        "source_id": _source_id(sha),
        "sha256": sha,
        "relative_path": path.name,
        "source_role": KNOWN_SOURCE_ROLE.get(path.name, "unclassified_direct_daegeum_source"),
        "rights": dict(LOCAL_RND_RIGHTS),
        "native": compact_native,
    }


def _candidate_config() -> dict[str, Any]:
    """Freeze detector parameters in output provenance, not only in code."""
    return {
        "feature_hop_s": FEATURE_HOP_S,
        "feature_window_s": FEATURE_WINDOW_S,
        "feature_working_rate_hz": F0_ANALYSIS_RATE,
        "f0_range_hz": [F0_MIN_HZ, F0_MAX_HZ],
        "minimum_voicing_confidence": MIN_VOICING_CONFIDENCE,
        "pitch_change_minimum_step_cents": MIN_CANDIDATE_STEP_CENTS,
        "same_pitch_maximum_step_cents": MAX_SAME_PITCH_STEP_CENTS,
        "same_pitch_onset_flux_quantile": SAME_PITCH_ONSET_FLUX_QUANTILE,
        "same_pitch_minimum_relative_valley_db": SAME_PITCH_MIN_RELATIVE_VALLEY_DB,
        "minimum_candidate_gap_s": MIN_CANDIDATE_GAP_S,
        "context_s_each_side": CONTEXT_S,
        "boundary_half_window_s": BOUNDARY_HALF_WINDOW_S,
    }


def _load_analysis_modules() -> tuple[Any, Any, dict[str, str]]:
    try:
        import numpy as np  # type: ignore
        import scipy  # type: ignore
        from scipy import signal as sps  # type: ignore
    except ModuleNotFoundError as exc:
        raise BuildError(
            "actual feature extraction needs NumPy/SciPy; use --dry-run without audio dependencies "
            f"or install the R&D environment (missing {exc.name})"
        ) from exc
    return np, sps, {"numpy": str(np.__version__), "scipy": str(scipy.__version__)}


def _midi_from_hz(frequency: Any, np: Any) -> Any:
    result = np.full(len(frequency), np.nan, dtype=np.float32)
    valid = frequency > 0
    result[valid] = (69.0 + 12.0 * np.log2(frequency[valid] / 440.0)).astype(np.float32)
    return result


def _compute_features(native: Any, *, np: Any, sps: Any) -> dict[str, Any]:
    """Derive unlabelled frame features while preserving native-frame authority.

    The acoustic analysis is allowed to use a deterministic low-rate working
    copy for speed.  Every returned feature frame carries its mapped **native
    source frame** and all review/label coordinates remain native frames.
    """
    native_audio = native.metadata.get("native_audio")
    if not isinstance(native_audio, Mapping):
        raise BuildError("native reader metadata has no native_audio object")
    source_rate = int(native_audio["sample_rate_hz"])
    source_frames = int(native_audio["frame_count"])
    mono = native.analysis_mono.astype(np.float32, copy=False)
    if source_frames != len(mono) or source_rate <= 0:
        raise BuildError("native reader returned inconsistent sample/frame metadata")
    decimation = max(1, int(round(source_rate / F0_ANALYSIS_RATE)))
    analysis_rate = source_rate / decimation
    # ``resample_poly`` is a feature-only convenience; original WAV data and
    # native source coordinates are never overwritten or used as this signal.
    analysis = (mono if decimation == 1 else sps.resample_poly(mono, 1, decimation)).astype(np.float32)
    window = max(16, int(round(FEATURE_WINDOW_S * analysis_rate)))
    hop = max(1, int(round(FEATURE_HOP_S * analysis_rate)))
    if len(analysis) < window:
        raise BuildError("direct WAV is shorter than one analysis window")
    starts = np.arange(0, len(analysis) - window + 1, hop, dtype=np.int64)
    centers_s = (starts.astype(np.float64) + window / 2.0) / analysis_rate
    native_centers = np.minimum(
        source_frames - 1, np.maximum(0, np.rint(centers_s * source_rate).astype(np.int64))
    )
    # Native RMS uses a matching time span and cumulative energy rather than a
    # resampled proxy.  This is a source-measurable value.
    native_window = max(1, int(round(FEATURE_WINDOW_S * source_rate)))
    native_starts = np.maximum(0, native_centers - native_window // 2)
    native_ends = np.minimum(source_frames, native_starts + native_window)
    energy = np.concatenate(([0.0], np.cumsum(mono.astype(np.float64) ** 2)))
    rms = np.sqrt(np.maximum((energy[native_ends] - energy[native_starts]) /
                             np.maximum(1, native_ends - native_starts), 1e-20))
    rms_dbfs = (20.0 * np.log10(rms)).astype(np.float32)

    f0 = np.full(len(starts), np.nan, dtype=np.float32)
    confidence = np.zeros(len(starts), dtype=np.float32)
    onset_flux = np.zeros(len(starts), dtype=np.float32)
    centroid = np.full(len(starts), np.nan, dtype=np.float32)
    flatness = np.full(len(starts), np.nan, dtype=np.float32)
    hann = np.hanning(window).astype(np.float32)
    nfft = 1 << int(math.ceil(math.log2(max(32, window * 2))))
    min_lag = max(1, int(math.floor(analysis_rate / F0_MAX_HZ)))
    max_lag = min(nfft // 2 - 1, int(math.ceil(analysis_rate / F0_MIN_HZ)))
    previous_log_spectrum: Any | None = None
    frequency_bins = np.fft.rfftfreq(nfft, 1.0 / analysis_rate).astype(np.float32)

    for ordinal, start in enumerate(starts.tolist()):
        frame = analysis[start:start + window]
        frame = frame - float(np.mean(frame))
        framed = frame * hann
        spectrum = np.abs(np.fft.rfft(framed, n=nfft)).astype(np.float32)
        power = spectrum * spectrum
        magnitude_sum = float(np.sum(spectrum))
        if magnitude_sum > 1e-12:
            centroid[ordinal] = float(np.sum(frequency_bins * spectrum) / magnitude_sum)
            flatness[ordinal] = float(math.exp(float(np.mean(np.log(np.maximum(spectrum, 1e-12))))) /
                                      max(float(np.mean(spectrum)), 1e-12))
        log_spectrum = np.log1p(spectrum)
        if previous_log_spectrum is not None:
            onset_flux[ordinal] = float(np.sum(np.maximum(0.0, log_spectrum - previous_log_spectrum)) /
                                        max(1, len(log_spectrum)))
        previous_log_spectrum = log_spectrum
        if rms_dbfs[ordinal] < -62.0 or max_lag <= min_lag:
            continue
        autocorrelation = np.fft.irfft(power, n=nfft)[:max_lag + 1].real
        baseline = float(autocorrelation[0])
        if baseline <= 1e-12:
            continue
        search = autocorrelation[min_lag:max_lag + 1]
        local = int(np.argmax(search))
        lag = min_lag + local
        peak = float(search[local] / baseline)
        if peak < 0.20:
            continue
        # Quadratic interpolation gives a stable enough F0 proxy for a review
        # queue.  It is not a musical pitch label and is never used by itself
        # to approve a transition.
        refined = float(lag)
        if 0 < local < len(search) - 1:
            left, middle, right = (float(search[local - 1]), float(search[local]), float(search[local + 1]))
            denominator = left - 2.0 * middle + right
            if abs(denominator) > 1e-12:
                refined += max(-0.5, min(0.5, 0.5 * (left - right) / denominator))
        f0[ordinal] = float(analysis_rate / refined)
        confidence[ordinal] = peak

    return {
        "schema": ANALYSIS_SCHEMA,
        "analysis": {
            "analysis_mono_policy": native.metadata["analysis_mono_policy"],
            "feature_hop_s": FEATURE_HOP_S,
            "feature_window_s": FEATURE_WINDOW_S,
            "working_rate_hz": analysis_rate,
            "working_decimation_ratio": decimation,
            "f0_method": "windowed_fft_autocorrelation_proxy",
            "f0_range_hz": [F0_MIN_HZ, F0_MAX_HZ],
            "f0_is_not_a_human_pitch_label": True,
        },
        "native_frame_center": native_centers,
        "time_s": centers_s.astype(np.float64),
        "f0_hz": f0,
        "midi_proxy": _midi_from_hz(f0, np),
        "voicing_confidence": confidence,
        "rms_dbfs": rms_dbfs,
        "onset_flux": onset_flux,
        "spectral_centroid_hz": centroid,
        "spectral_flatness": flatness,
    }


def _stable_median(values: Any, valid: Any, start: int, stop: int, np: Any) -> float | None:
    subset = values[start:stop]
    mask = valid[start:stop] & np.isfinite(subset)
    if int(np.count_nonzero(mask)) < max(4, (stop - start) // 2):
        return None
    return float(np.median(subset[mask]))


def _cents(from_hz: float, to_hz: float) -> float:
    return 1200.0 * math.log2(to_hz / from_hz)


def _candidate_rows(
    source: Mapping[str, Any],
    features: Mapping[str, Any],
    *,
    np: Any,
) -> list[dict[str, Any]]:
    """Offer F0/onset candidates, never automatic musical-gesture labels.

    A pitch step and a same-pitch onset are deliberately separate detector
    classes.  Neither says whether the player slurred, tongued, changed
    breath, executed a sigimsae, or made an edit.  That is why both classes
    stay ``unreviewed`` and are kept out of every bank until a listener labels
    the exact native-frame region.
    """
    if source["source_role"] != "continuous_performance_candidate":
        return []
    times = features["time_s"]
    f0 = features["f0_hz"]
    midi = features["midi_proxy"]
    confidence = features["voicing_confidence"]
    rms_dbfs = features["rms_dbfs"]
    flux = features["onset_flux"]
    native_frames = features["native_frame_center"]
    if len(times) < 30:
        return []
    valid = (confidence >= MIN_VOICING_CONFIDENCE) & np.isfinite(f0) & (rms_dbfs >= -58.0)
    rms_valid = np.isfinite(rms_dbfs) & (rms_dbfs >= -90.0)
    half = max(5, int(round(0.120 / FEATURE_HOP_S)))
    positive_flux = flux[np.isfinite(flux) & (flux > 0.0)]
    flux_threshold = (
        float(np.quantile(positive_flux, SAME_PITCH_ONSET_FLUX_QUANTILE))
        if len(positive_flux) else float("inf")
    )
    candidates_without_ids: list[tuple[float, dict[str, Any]]] = []
    last_time = -float("inf")
    for index in range(half, len(times) - half):
        at = float(times[index])
        if at - last_time < MIN_CANDIDATE_GAP_S:
            continue
        pre = _stable_median(f0, valid, index - half, index, np)
        post = _stable_median(f0, valid, index + 1, index + half + 1, np)
        if pre is None or post is None:
            continue
        step = _cents(pre, post)
        # These are stable-window *proxies*, not score pitch labels.  We keep
        # them only to distinguish a large F0 change from a same-pitch onset
        # candidate for the human review queue below.
        local_before = _stable_median(midi, valid, index - half, index, np)
        local_after = _stable_median(midi, valid, index + 1, index + half + 1, np)
        if local_before is None or local_after is None:
            continue
        pre_rms = _stable_median(rms_dbfs, rms_valid, index - half, index, np)
        post_rms = _stable_median(rms_dbfs, rms_valid, index + 1, index + half + 1, np)
        if pre_rms is None or post_rms is None:
            continue
        relative_valley = float(rms_dbfs[index] - min(pre_rms, post_rms))
        if abs(step) >= MIN_CANDIDATE_STEP_CENTS:
            detector_class = "f0_change_candidate"
        elif (
            abs(step) <= MAX_SAME_PITCH_STEP_CENTS
            and (float(flux[index]) >= flux_threshold or relative_valley <= SAME_PITCH_MIN_RELATIVE_VALLEY_DB)
        ):
            detector_class = "same_pitch_onset_candidate"
        else:
            continue
        source_rate = int(source["native"]["sample_rate_hz"])
        frame = int(native_frames[index])
        context_start = max(0, int(round(frame - CONTEXT_S * source_rate)))
        context_end = min(int(source["native"]["frame_count"]), int(round(frame + CONTEXT_S * source_rate)))
        boundary_half = int(round(BOUNDARY_HALF_WINDOW_S * source_rate))
        candidates_without_ids.append((at, {
            "schema": f"{SCHEMA}.candidate.v1",
            "source": {
                "source_id": source["source_id"],
                "sha256": source["sha256"],
                "relative_path": source["relative_path"],
            },
            "region_frames": {
                "context_start": context_start,
                "boundary_center": frame,
                "proposed_boundary_window": [max(context_start, frame - boundary_half),
                                             min(context_end, frame + boundary_half)],
                "context_end": context_end,
            },
            "auto_evidence": {
                "analysis_frame_index": index,
                "detector_class": detector_class,
                "pre_f0_hz_proxy": pre,
                "post_f0_hz_proxy": post,
                "pre_midi_proxy": local_before,
                "post_midi_proxy": local_after,
                "f0_step_cents": step,
                "onset_flux": float(flux[index]),
                "same_pitch_onset_flux_threshold": flux_threshold,
                "rms_dbfs": float(rms_dbfs[index]),
                "rms_valley_db_relative_to_stable_anchors": relative_valley,
                "voicing_confidence": float(confidence[index]),
            },
            "status": "unreviewed",
            "automatic_detection_is_not_a_musical_gesture_label": True,
        }))
        last_time = at
    # Candidate ids depend on source + native-time ordering, not output
    # directory location or the host filesystem enumeration order.
    candidates: list[dict[str, Any]] = []
    for ordinal, (_, candidate) in enumerate(sorted(candidates_without_ids, key=lambda item: item[0]), 1):
        candidate["candidate_id"] = f"cand_{source['source_id']}_{ordinal:03d}"
        candidates.append(candidate)
    return candidates


def _template_label(candidate: Mapping[str, Any]) -> dict[str, Any]:
    region = candidate["region_frames"]
    return {
        "schema": LABEL_SCHEMA,
        "label_id": "",
        "candidate_id": candidate["candidate_id"],
        "source": dict(candidate["source"]),
        "frames": {
            "clip": [region["context_start"], region["context_end"]],
            "pre_stable": [],
            "transition": list(region["proposed_boundary_window"]),
            "post_stable": [],
        },
        "gesture": {
            "class": "unreviewed",
            "audible_onset": "unknown",
            "same_breath": "unknown",
            "traditional_term": "",
        },
        "pitch_anchors": [],
        "review": {
            "state": "unreviewed",
            "retrieval_eligible": False,
            "expression_eligible": False,
            "reviewer": "",
            "notes": "Auto candidate only. A reviewer must replace every blank/unknown decision.",
        },
    }


def _read_labels(path: Path | None) -> list[dict[str, Any]]:
    if path is None:
        return []
    if not path.is_file():
        raise BuildError(f"--labels is not a readable JSONL file: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as stream:
        for line_number, line in enumerate(stream, 1):
            raw = line.strip()
            if not raw:
                continue
            try:
                row = json.loads(raw)
            except json.JSONDecodeError as exc:
                raise BuildError(f"labels line {line_number} is not JSON: {exc}") from exc
            if not isinstance(row, dict):
                raise BuildError(f"labels line {line_number} is not an object")
            rows.append(row)
    return rows


def _range(value: Any, *, label: str, frame_count: int) -> tuple[int, int]:
    if not isinstance(value, list) or len(value) != 2:
        raise BuildError(f"{label}: expected a two-frame list")
    if type(value[0]) is not int or type(value[1]) is not int:
        raise BuildError(f"{label}: frame values must be integers, not coerced values")
    start, end = value[0], value[1]
    if not (0 <= start < end <= frame_count):
        raise BuildError(f"{label}: frame range lies outside native source bounds")
    return start, end


def _strict_bool(value: Any, *, label: str) -> bool:
    """Reject JSON lookalikes such as ``"false"`` before an approval gate."""
    if type(value) is not bool:
        raise BuildError(f"{label}: expected a JSON boolean")
    return value


def _approved_bank_rows(
    labels: Sequence[Mapping[str, Any]],
    catalog_by_id: Mapping[str, Mapping[str, Any]],
    candidates_by_id: Mapping[str, Mapping[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate approvals and make retrieval/training manifests only from them.

    The third return value stays internal to the build and carries every
    valid human-approved label for coverage accounting.  It is deliberately
    not a new raw-audio bank: only the two explicitly eligible outputs below
    are persisted as reusable manifests.
    """
    bank: list[dict[str, Any]] = []
    training: list[dict[str, Any]] = []
    approved_evidence: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    seen_approved_candidate_ids: set[str] = set()
    for ordinal, label in enumerate(labels, 1):
        if label.get("schema") != LABEL_SCHEMA:
            raise BuildError(f"label {ordinal}: unexpected schema")
        candidate_id = label.get("candidate_id")
        if not isinstance(candidate_id, str) or candidate_id not in candidates_by_id:
            raise BuildError(f"label {ordinal}: candidate_id is not in this generated candidate set")
        candidate = candidates_by_id[candidate_id]
        source = label.get("source")
        if not isinstance(source, Mapping):
            raise BuildError(f"label {ordinal}: source object is required")
        source_id = source.get("source_id")
        if not isinstance(source_id, str) or source_id not in catalog_by_id:
            raise BuildError(f"label {ordinal}: source_id is not in the current direct source catalog")
        catalog = catalog_by_id[source_id]
        if source.get("sha256") != catalog["sha256"] or source.get("relative_path") != catalog["relative_path"]:
            raise BuildError(f"label {ordinal}: source hash/path does not match the current direct source")
        if candidate["source"]["source_id"] != source_id:
            raise BuildError(f"label {ordinal}: candidate and label point to different source recordings")
        review = label.get("review")
        if not isinstance(review, Mapping):
            raise BuildError(f"label {ordinal}: review object is required")
        review_state = review.get("state")
        if review_state not in REVIEW_STATES:
            raise BuildError(f"label {ordinal}: review.state is not a declared review state")
        # Labels that are not approved are evidence records only.  They never
        # enter either the retrieval or training collection.
        if review_state != "approved":
            continue
        label_id = label.get("label_id")
        if not isinstance(label_id, str) or not LABEL_ID_RE.fullmatch(label_id) or label_id in seen_ids:
            raise BuildError(f"label {ordinal}: approved label_id must be unique, non-empty, and portable")
        seen_ids.add(label_id)
        if candidate_id in seen_approved_candidate_ids:
            raise BuildError(f"label {label_id}: a candidate may have only one approved review in one build")
        seen_approved_candidate_ids.add(candidate_id)
        reviewer = review.get("reviewer")
        notes = review.get("notes")
        if not isinstance(reviewer, str) or not reviewer.strip() or len(reviewer) > 160:
            raise BuildError(f"label {label_id}: approved label needs a non-empty local reviewer identifier")
        if not isinstance(notes, str) or len(notes) > 2000:
            raise BuildError(f"label {label_id}: approved label needs a text review note of at most 2000 characters")
        frames = label.get("frames")
        gesture = label.get("gesture")
        if not isinstance(frames, Mapping) or not isinstance(gesture, Mapping):
            raise BuildError(f"label {ordinal}: approved label needs frames and gesture objects")
        frame_count = int(catalog["native"]["frame_count"])
        clip = _range(frames.get("clip"), label=f"label {label_id}.clip", frame_count=frame_count)
        pre = _range(frames.get("pre_stable"), label=f"label {label_id}.pre_stable", frame_count=frame_count)
        transition = _range(frames.get("transition"), label=f"label {label_id}.transition", frame_count=frame_count)
        post = _range(frames.get("post_stable"), label=f"label {label_id}.post_stable", frame_count=frame_count)
        if not (
            clip[0] == pre[0] < pre[1] == transition[0] < transition[1] == post[0] < post[1] == clip[1]
        ):
            raise BuildError(
                f"label {label_id}: clip/pre/transition/post must partition one contiguous ordered native-source span"
            )
        candidate_region = candidate["region_frames"]
        candidate_start = int(candidate_region["context_start"])
        candidate_end = int(candidate_region["context_end"])
        candidate_center = int(candidate_region["boundary_center"])
        if not (candidate_start <= clip[0] < clip[1] <= candidate_end):
            raise BuildError(f"label {label_id}: approved clip must stay inside its generated candidate context")
        if not (transition[0] <= candidate_center < transition[1]):
            raise BuildError(f"label {label_id}: approved transition must contain its candidate boundary center")
        gesture_class = gesture.get("class")
        if not isinstance(gesture_class, str) or gesture_class not in APPROVED_GESTURE_CLASSES:
            raise BuildError(f"label {label_id}: approved item needs a specific human gesture class")
        if gesture.get("audible_onset") not in AUDIBLE_ONSET_VALUES:
            raise BuildError(f"label {label_id}: audible_onset is not a declared human-review value")
        if gesture.get("same_breath") not in SAME_BREATH_VALUES:
            raise BuildError(f"label {label_id}: same_breath is not a declared human-review value")
        traditional_term = gesture.get("traditional_term")
        if not isinstance(traditional_term, str) or len(traditional_term) > 160:
            raise BuildError(f"label {label_id}: traditional_term must be text of at most 160 characters")
        anchors = label.get("pitch_anchors", [])
        anchor_values: dict[str, float] = {}
        if not isinstance(anchors, list):
            raise BuildError(f"label {label_id}: pitch_anchors must be a list")
        for anchor in anchors:
            if not isinstance(anchor, Mapping):
                raise BuildError(f"label {label_id}: every pitch anchor must be an object")
            region = anchor.get("region")
            try:
                midi = float(anchor.get("midi"))
            except (TypeError, ValueError) as exc:
                raise BuildError(f"label {label_id}: pitch anchor MIDI must be finite") from exc
            if not isinstance(region, str) or not math.isfinite(midi):
                raise BuildError(f"label {label_id}: invalid pitch anchor")
            if region not in {"pre_stable", "post_stable"} or region in anchor_values:
                raise BuildError(f"label {label_id}: pitch anchors must name pre_stable/post_stable exactly once")
            if not (0.0 <= midi <= 127.0):
                raise BuildError(f"label {label_id}: pitch anchor MIDI must be within 0..127")
            anchor_values[region] = midi
        retrieval_eligible = _strict_bool(
            review.get("retrieval_eligible"), label=f"label {label_id}.review.retrieval_eligible"
        )
        if retrieval_eligible:
            if gesture_class != "continuous_pitch_change":
                raise BuildError(
                    f"label {label_id}: only an approved continuous_pitch_change may enter transition retrieval"
                )
            if not {"pre_stable", "post_stable"}.issubset(anchor_values):
                raise BuildError(
                    f"label {label_id}: retrieval-eligible continuous transition needs pre/post MIDI anchors"
                )
        expression_eligible = _strict_bool(
            review.get("expression_eligible"), label=f"label {label_id}.review.expression_eligible"
        )
        if expression_eligible and gesture_class not in EXPRESSION_GESTURE_CLASSES:
            raise BuildError(
                f"label {label_id}: expression evidence needs an approved musical gesture, not not_a_transition"
            )
        base = {
            "schema": f"{SCHEMA}.approved-transition.v1",
            "label_id": label_id,
            "candidate_id": candidate_id,
            "source": {
                "source_id": source_id,
                "sha256": catalog["sha256"],
                "relative_path": catalog["relative_path"],
            },
            "frames": {"clip": list(clip), "pre_stable": list(pre), "transition": list(transition), "post_stable": list(post)},
            "gesture": dict(gesture),
            "pitch_anchors": anchors,
            "review": dict(review),
        }
        approved_evidence.append(base)
        if retrieval_eligible:
            bank.append(base)
        if expression_eligible:
            training.append({
                "schema": f"{SCHEMA}.expression-manifest.v1",
                "label_id": label_id,
                "candidate_id": candidate_id,
                "source": base["source"],
                "clip_frames": list(clip),
                "gesture_class": gesture_class,
                "pitch_anchors": anchors,
                "review": dict(review),
                "feature_file": f"features/{source_id}.npz",
                "take_split_key": source_id,
            })
    return bank, training, approved_evidence


def _write_float32_wav(path: Path, samples: Any, sample_rate: int, np: Any) -> None:
    """Write an amplitude-preserving review crop in IEEE-float WAVE.

    ``wave`` cannot author IEEE-float WAVE portably.  This tiny writer emits
    standard format-tag 3 WAV data without gain, resampling, fades, or channel
    changes.  It exists only in an ignored local review bundle.
    """
    if samples.ndim == 1:
        samples = samples[:, None]
    if samples.ndim != 2 or len(samples) == 0:
        raise BuildError("review crop must contain non-empty frame/channel audio")
    channels = int(samples.shape[1])
    if not (1 <= channels <= 8):
        raise BuildError("unsupported review channel count")
    payload = np.asarray(samples, dtype="<f4", order="C").tobytes()
    block_align = channels * 4
    byte_rate = int(sample_rate) * block_align
    fmt = (3).to_bytes(2, "little") + channels.to_bytes(2, "little") + int(sample_rate).to_bytes(4, "little") \
        + byte_rate.to_bytes(4, "little") + block_align.to_bytes(2, "little") + (32).to_bytes(2, "little")
    data_size = len(payload)
    riff_size = 4 + 8 + len(fmt) + 8 + data_size
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as stream:
        stream.write(b"RIFF" + riff_size.to_bytes(4, "little") + b"WAVE")
        stream.write(b"fmt " + len(fmt).to_bytes(4, "little") + fmt)
        stream.write(b"data" + data_size.to_bytes(4, "little") + payload)


def _svg_polyline(points: Sequence[tuple[float, float]], *, width: int, height: int, color: str) -> str:
    if not points:
        return ""
    text = " ".join(f"{x:.2f},{y:.2f}" for x, y in points)
    return f'<polyline fill="none" stroke="{color}" stroke-width="1.5" points="{text}"/>'


def _write_review_svg(path: Path, candidate: Mapping[str, Any], features: Mapping[str, Any], source_rate: int, np: Any) -> None:
    """Use a tiny self-contained SVG rather than a plotting dependency."""
    start, end = candidate["region_frames"]["context_start"], candidate["region_frames"]["context_end"]
    frames = features["native_frame_center"]
    mask = (frames >= start) & (frames <= end)
    local_frames = frames[mask]
    midi = features["midi_proxy"][mask]
    rms = features["rms_dbfs"][mask]
    width, height, pad = 900, 280, 34
    duration = max(1, end - start)
    def x(frame: float) -> float:
        return pad + (width - 2 * pad) * (float(frame) - start) / duration
    finite_midi = midi[np.isfinite(midi)]
    midi_min = float(np.min(finite_midi)) - 0.5 if len(finite_midi) else 50.0
    midi_max = float(np.max(finite_midi)) + 0.5 if len(finite_midi) else 90.0
    if midi_max <= midi_min:
        midi_max = midi_min + 1.0
    def y_midi(value: float) -> float:
        return pad + (height / 2 - pad) * (midi_max - value) / (midi_max - midi_min)
    def y_rms(value: float) -> float:
        clipped = min(-6.0, max(-72.0, value))
        return height / 2 + pad + (height / 2 - 2 * pad) * (-6.0 - clipped) / 66.0
    pitch_points = [(x(frame), y_midi(value)) for frame, value in zip(local_frames.tolist(), midi.tolist())
                    if math.isfinite(float(value))]
    rms_points = [(x(frame), y_rms(float(value))) for frame, value in zip(local_frames.tolist(), rms.tolist())]
    boundary = candidate["region_frames"]["proposed_boundary_window"]
    source_seconds = f"{start / source_rate:.3f}–{end / source_rate:.3f}s"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">
<rect width="100%" height="100%" fill="#10151c"/>
<text x="{pad}" y="18" fill="#dce8f3" font-family="system-ui" font-size="12">{html.escape(candidate['candidate_id'])} · raw context {source_seconds}</text>
<line x1="{pad}" y1="{height / 2}" x2="{width - pad}" y2="{height / 2}" stroke="#40505e"/>
<rect x="{x(boundary[0]):.2f}" y="{pad}" width="{max(1.0, x(boundary[1]) - x(boundary[0])):.2f}" height="{height - 2 * pad}" fill="#f4c95d" opacity="0.16"/>
{_svg_polyline(pitch_points, width=width, height=height, color="#7bdff2")}
{_svg_polyline(rms_points, width=width, height=height, color="#f4a261")}
<text x="{pad}" y="{height - 8}" fill="#9ab" font-family="system-ui" font-size="11">cyan: F0/MIDI proxy · orange: RMS dBFS · yellow: automatic candidate only, not a transition label</text>
</svg>'''
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(svg, encoding="utf-8")


def _write_review_index(path: Path, candidates: Sequence[Mapping[str, Any]]) -> None:
    rows = []
    for item in candidates:
        cid = html.escape(str(item["candidate_id"]))
        rows.append(
            f'<article><h2>{cid}</h2><audio controls preload="none" src="clips/{cid}.wav"></audio>'
            f'<img alt="F0 and RMS evidence for {cid}" src="plots/{cid}.svg"/>'
            '<p>Automatic F0/onset candidate only. Do not infer slur, tongue, breath, or same-breath intent until reviewed.</p></article>'
        )
    page = """<!doctype html><meta charset=\"utf-8\"><title>Daegeum transition review queue</title>
<style>body{margin:2rem auto;max-width:920px;background:#10151c;color:#dce8f3;font:15px system-ui}article{border:1px solid #40505e;padding:1rem;margin:1rem 0}audio,img{display:block;width:100%;margin:.75rem 0}h1{color:#f4c95d}p{color:#aab8c4}</style>
<h1>Daegeum candidate review queue</h1><p>Every clip is an un-normalized, contiguous raw-source crop. All candidates are unreviewed.</p>""" + "\n".join(rows)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(page, encoding="utf-8")


def _coverage(rows: Sequence[Mapping[str, Any]]) -> list[dict[str, Any]]:
    """Only eligible, human-approved native evidence can close a target.

    ``transition_retrieval`` and ``expression_articulation`` are intentionally
    different coverage capabilities: a tongued same-pitch example can help a
    future expression model but can never masquerade as a reusable legato
    transition.
    """
    coverage = []
    for target in COVERAGE_TARGETS:
        missing_status = (
            "missing_native_transition"
            if target["required_capability"] == "transition_retrieval"
            else "missing_native_expression_evidence"
        )
        coverage.append(dict(target, status=missing_status, approved_label_ids=[]))
    for item in rows:
        anchors = item.get("pitch_anchors")
        if not isinstance(anchors, list) or len(anchors) < 2:
            continue
        values: dict[str, float] = {}
        for anchor in anchors:
            if isinstance(anchor, Mapping) and isinstance(anchor.get("region"), str):
                try:
                    values[str(anchor["region"])] = float(anchor["midi"])
                except (KeyError, TypeError, ValueError):
                    pass
        if "pre_stable" not in values or "post_stable" not in values:
            continue
        for target in coverage:
            required_capability = target["required_capability"]
            review = item.get("review")
            if not isinstance(review, Mapping):
                continue
            is_eligible = (
                bool(review.get("retrieval_eligible"))
                if required_capability == "transition_retrieval"
                else bool(review.get("expression_eligible"))
            )
            if not is_eligible or item["gesture"].get("class") not in target["gesture_classes"]:
                continue
            if abs(target["from_midi"] - values["pre_stable"]) <= 0.5 and abs(target["to_midi"] - values["post_stable"]) <= 0.5:
                target["status"] = (
                    "covered_by_approved_native_transition"
                    if required_capability == "transition_retrieval"
                    else "covered_by_approved_native_expression_evidence"
                )
                target["approved_label_ids"].append(item["label_id"])
    return coverage


def dry_run_document() -> dict[str, Any]:
    return {
        "schema": f"{SCHEMA}.dry-run",
        "actual_audio_read": False,
        "requires_one_or_more_explicit_raw_daegeum_roots": True,
        "requires_fresh_output_directory": True,
        "raw_source_policy": {
            "direct_wav_only": True,
            "source_coordinate_authority": "native WAV SHA-256 plus native frame numbers",
            "original_source_resampling_or_normalization": "forbidden",
            "feature_only_working_copy_may_be_resampled": True,
            "absolute_source_paths_in_output": "forbidden",
        },
        "automatic_detection_policy": {
            "status": "unreviewed",
            "may_not_assert": ["natural_transition", "same_breath", "slur", "approved_training_item"],
            "human_approval_required_for_transition_bank": True,
        },
        "coverage_targets": list(COVERAGE_TARGETS),
        "outputs": [
            "source_catalog.json", "candidates.jsonl", "features/*.npz", "features/*.json",
            "review/index.html", "review/queue.tsv", "review/clips/*.wav", "review/plots/*.svg",
            "labels.template.jsonl", "transition_bank.jsonl", "expression_manifest.jsonl", "coverage.json", "provenance.json",
        ],
    }


def build(
    raw_daegeum_roots: str | Path | Sequence[str | Path],
    output_dir: str | Path,
    labels_path: str | Path | None = None,
) -> dict[str, Any]:
    roots = _normalize_raw_roots(raw_daegeum_roots)
    output = Path(output_dir).expanduser().resolve()
    waves = _list_direct_waves(roots)
    if output.exists():
        raise BuildError(
            f"--output-dir must not already exist: {output}. Use a fresh R&D directory so a prior review bundle stays intact."
        )
    if not output.parent.is_dir():
        raise BuildError(f"--output-dir parent does not exist: {output.parent}")
    label_file = None if labels_path is None else Path(labels_path).expanduser().resolve()
    labels = _read_labels(label_file)
    np, sps, dependency_versions = _load_analysis_modules()
    catalog = [_source_catalog_item(path) for _, path in waves]
    catalog_by_id = {item["source_id"]: item for item in catalog}
    # A duplicate digest would make labels ambiguous even if filenames differ.
    if len(catalog_by_id) != len(catalog):
        raise BuildError("direct source set contains duplicate source SHA-256 identifiers")
    paths_by_source_id = {item["source_id"]: path for (_, path), item in zip(waves, catalog)}
    direct_before = {item["source_id"]: item["sha256"] for item in catalog}

    with tempfile.TemporaryDirectory(prefix=f".{output.name}.stage-", dir=output.parent) as stage_name:
        stage = Path(stage_name)
        all_candidates: list[dict[str, Any]] = []
        feature_summaries: list[dict[str, Any]] = []
        for item in catalog:
            path = paths_by_source_id[item["source_id"]]
            try:
                native = read_native_wav(path, mono_policy="mean_channels")
            except NativeWavError as exc:
                raise BuildError(f"cannot decode direct WAV {path.name}: {exc}") from exc
            if native.metadata.get("sha256") != item["sha256"]:
                raise BuildError(f"{path.name}: native reader SHA changed between inspect and read")
            features = _compute_features(native, np=np, sps=sps)
            npz_path = stage / "features" / f"{item['source_id']}.npz"
            npz_path.parent.mkdir(parents=True, exist_ok=True)
            np.savez_compressed(
                npz_path,
                native_frame_center=features["native_frame_center"], time_s=features["time_s"],
                f0_hz=features["f0_hz"], midi_proxy=features["midi_proxy"],
                voicing_confidence=features["voicing_confidence"], rms_dbfs=features["rms_dbfs"],
                onset_flux=features["onset_flux"], spectral_centroid_hz=features["spectral_centroid_hz"],
                spectral_flatness=features["spectral_flatness"],
            )
            feature_metadata = {
                "schema": ANALYSIS_SCHEMA,
                "source_id": item["source_id"],
                "source_sha256": item["sha256"],
                "relative_path": item["relative_path"],
                "native": item["native"],
                "analysis": features["analysis"],
                "feature_count": int(len(features["native_frame_center"])),
                "npz": f"features/{item['source_id']}.npz",
            }
            _write_json(stage / "features" / f"{item['source_id']}.json", feature_metadata)
            feature_summaries.append(feature_metadata)
            candidates = _candidate_rows(item, features, np=np)
            all_candidates.extend(candidates)
            # Produce actual raw crops only for candidates.  Any source-level
            # resample, gain, fade, or spectral modification here would poison
            # the very human review meant to catch such assumptions.
            for candidate in candidates:
                start = int(candidate["region_frames"]["context_start"])
                end = int(candidate["region_frames"]["context_end"])
                _write_float32_wav(
                    stage / "review" / "clips" / f"{candidate['candidate_id']}.wav",
                    native.samples[start:end], int(native.metadata["native_audio"]["sample_rate_hz"]), np,
                )
                _write_review_svg(
                    stage / "review" / "plots" / f"{candidate['candidate_id']}.svg",
                    candidate, features, int(native.metadata["native_audio"]["sample_rate_hz"]), np,
                )
            # Read-only integrity check after expensive work.  This catches a
            # broken tool before it can present output as a source audit.
            if _sha256(path) != direct_before[item["source_id"]]:
                raise BuildError(f"raw source changed while building: {path.name}")

        _write_json(stage / "source_catalog.json", {
            "schema": f"{SCHEMA}.source-catalog.v1",
            "source_coordinate_authority": "native direct WAV SHA-256 and frame coordinates",
            "files": catalog,
        })
        _write_jsonl(stage / "candidates.jsonl", all_candidates)
        _write_jsonl(stage / "labels.template.jsonl", (_template_label(item) for item in all_candidates))
        candidates_by_id = {item["candidate_id"]: item for item in all_candidates}
        approved, training, approved_evidence = _approved_bank_rows(labels, catalog_by_id, candidates_by_id)
        _write_jsonl(stage / "transition_bank.jsonl", approved)
        _write_jsonl(stage / "expression_manifest.jsonl", training)
        coverage = _coverage(approved_evidence)
        _write_json(stage / "coverage.json", {
            "schema": f"{SCHEMA}.coverage.v1",
            "targets": coverage,
            "unreviewed_candidates_do_not_close_coverage": True,
        })
        review = stage / "review"
        review.mkdir(parents=True, exist_ok=True)
        with (review / "queue.tsv").open("w", encoding="utf-8", newline="") as stream:
            writer = csv.writer(stream, delimiter="\t")
            writer.writerow(["candidate_id", "source_id", "relative_path", "context_start_frame", "context_end_frame",
                             "boundary_start_frame", "boundary_end_frame", "f0_step_cents", "status"])
            for item in all_candidates:
                region = item["region_frames"]
                writer.writerow([item["candidate_id"], item["source"]["source_id"], item["source"]["relative_path"],
                                 region["context_start"], region["context_end"], *region["proposed_boundary_window"],
                                 f"{item['auto_evidence']['f0_step_cents']:.3f}", "unreviewed"])
        _write_review_index(review / "index.html", all_candidates)
        document = {
            "schema": SCHEMA,
            "actual_direct_wav_read": True,
            "raw_source_modified": False,
            "source_root_not_embedded": True,
            "source_catalog": "source_catalog.json",
            "feature_files": feature_summaries,
            "candidate_count": len(all_candidates),
            "approved_label_count": len(approved_evidence),
            "approved_transition_count": len(approved),
            "expression_training_item_count": len(training),
            "automatic_candidates_are_unreviewed": True,
            "review_policy": {
                "clips": "contiguous native-source crop, amplitude/channel/sample-rate preserved in float32 WAVE",
                "no_per_candidate_gain_pitch_or_time_processing": True,
            },
            "source_policy": dry_run_document()["raw_source_policy"],
            "rights_policy": dict(LOCAL_RND_RIGHTS),
            "reproducibility": {
                "builder_sha256": _sha256(HERE / "build.py"),
                "native_wav_reader_sha256": _sha256(HERE / "native_wav.py"),
                "python_version": sys.version.split()[0],
                "analysis_dependency_versions": dependency_versions,
                "candidate_detector_config": _candidate_config(),
                "labels": {
                    "supplied": label_file is not None,
                    "sha256": _sha256(label_file) if label_file is not None else None,
                    "record_count": len(labels),
                },
            },
            "coverage": "coverage.json",
            "labels_input_supplied": labels_path is not None,
            "labels_template": "labels.template.jsonl",
            "known_limitations": [
                "An automatic F0/onset candidate is not proof of natural fingering, same breath, slur, tongue, or a usable transition.",
                "No unreviewed candidate is included in transition_bank.jsonl or expression_manifest.jsonl.",
                "Missing coverage remains missing until an approved human label with native source coordinates closes it.",
            ],
        }
        _write_json(stage / "provenance.json", document)
        # Do not permit an absolute raw root to leak into text output.  Binary
        # feature arrays intentionally contain no strings at all.
        raw_root_texts = {str(root) for root in roots}
        for text_file in stage.rglob("*"):
            if not text_file.is_file() or text_file.suffix.lower() not in {".json", ".jsonl", ".html", ".svg", ".tsv"}:
                continue
            text = text_file.read_text(encoding="utf-8")
            if any(raw_root_text in text for raw_root_text in raw_root_texts):
                raise BuildError(f"source root leaked into staged text artifact: {text_file.name}")
        stage.rename(output)
    return document


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-daegeum-dir", type=Path, action="append",
                        help="explicit direct Daegeum source directory; repeat to combine separate direct sets")
    parser.add_argument("--labels", type=Path,
                        help="optional human-reviewed label JSONL; unreviewed labels never enter a bank")
    parser.add_argument("--output-dir", type=Path, default=Path("out_daegeum_transition_bank"),
                        help="fresh output directory for catalog, feature cache, and review bundle")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the no-audio source/label contract")
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        if args.dry_run:
            print(json.dumps(dry_run_document(), ensure_ascii=False, indent=2, sort_keys=True))
            return 0
        if args.raw_daegeum_dir is None:
            raise BuildError("--raw-daegeum-dir is required for actual build; use --dry-run otherwise")
        document = build(args.raw_daegeum_dir, args.output_dir, args.labels)
    except (BuildError, NativeWavError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2
    print(json.dumps({
        "candidate_count": document["candidate_count"],
        "approved_transition_count": document["approved_transition_count"],
        "output": str(args.output_dir),
    }, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
