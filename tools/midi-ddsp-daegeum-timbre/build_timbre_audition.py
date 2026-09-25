#!/usr/bin/env python3
"""Build a deterministic, non-ML Daegeum-timbre proxy audition.

This tool deliberately does *not* train, fit, optimise, infer, resample, pitch
shift, time stretch, or splice performance audio.  It derives one static,
heavily smoothed spectral-envelope ratio from a declared subset of an exact
National Gugak Center (NGC) Daegeum Sanjo corpus, then applies that one curve
to the existing authorial MIDI-DDSP flute-bridge waveform.  The source
waveform's timeline and STFT phase are retained.  A third variant is a fixed
dry/wet blend.

The operation is fail-closed.  Before reading any corpus audio it verifies the
rights-audit decision, its exact manifest binding, and every one of the 192
downloaded WAV hashes.  Only the declared subset is decoded for analysis.
Outputs are monitoring-only PCM16 WAVs with one constant whole-file gain per
variant.  There is no compressor, limiter, time-varying gain, or normaliser.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import shutil
import sys
import tempfile
from typing import Any, Mapping, Sequence
import wave

import numpy as np
from scipy import signal
from scipy.ndimage import gaussian_filter1d


SCHEMA = "mini.midi-ddsp-daegeum-non-ml-timbre-audition.v1"
RIGHTS_SCHEMA = "durango.ngc-rights-audit.v1"
CORPUS_SCHEMA = "durango.ngc.extended-daegeum-sanjo-fetch.v1"
FLUTE_REPORT_SCHEMA = "mini.midi-ddsp-official-flute-rnd.v1"
MANIFEST_FILENAME = "non_ml_daegeum_timbre_manifest.json"
EQ_PROFILE_FILENAME = "static_spectral_envelope_ratio.csv"
A_FILENAME = "A_official_flute_bridge_reference.wav"
B_FILENAME = "B_ngc_spectral_envelope_proxy.wav"
C_FILENAME = "C_conservative_dry_wet_proxy.wav"

EXPECTED_CORPUS_COUNT = 192
EXPECTED_FIRST_SEQUENCE = 1520
EXPECTED_LAST_SEQUENCE = 1711
FLUTE_VARIANT = "B_authorial_bridge6_controls"
ACTIVE_END_SECONDS = 6.48
RELEASE_END_SECONDS = 6.72
TARGET_ACTIVE_RMS_DBFS = -24.0
PEAK_CEILING_DBFS = -3.0
CONSERVATIVE_WET = 0.42

# A fixed stride through the exact contiguous 1520..1711 collection, plus its
# final item.  This is deliberately data-independent: no source was selected
# for sounding "best", and reruns cannot silently choose another recording.
DECLARED_SOURCE_SEQUENCES = (
    1520,
    1537,
    1554,
    1571,
    1588,
    1605,
    1622,
    1639,
    1656,
    1673,
    1690,
    1707,
    1711,
)

ANALYSIS_MIN_HZ = 80.0
ANALYSIS_MAX_HZ = 7800.0
LOG_BINS_PER_OCTAVE = 24
ENVELOPE_SMOOTHING_OCTAVES_SIGMA = 0.50
EQ_LIMIT_DB = 9.0
LOW_TAPER_START_HZ = 80.0
LOW_TAPER_END_HZ = 160.0
HIGH_TAPER_START_HZ = 6200.0
HIGH_TAPER_END_HZ = 7900.0
ACTIVE_FRAME_RMS_DBFS = -55.0
APPLICATION_FRAME_LENGTH = 512
APPLICATION_HOP_LENGTH = 128


class NonMlTimbreError(RuntimeError):
    """A narrow source, rights, or signal-processing contract did not pass."""


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _canonical_json(value: Any) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _load_json(path: Path, *, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise NonMlTimbreError(f"missing {label}: {path.name}") from exc
    except json.JSONDecodeError as exc:
        raise NonMlTimbreError(f"invalid JSON in {label}: {path.name}") from exc
    if not isinstance(value, Mapping):
        raise NonMlTimbreError(f"{label} must be a JSON object")
    return dict(value)


def _mapping(value: Any, *, label: str) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise NonMlTimbreError(f"{label} must be an object")
    return value


def _safe_child(root: Path, relative: Any, *, label: str) -> Path:
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise NonMlTimbreError(f"{label} must be a safe POSIX relative path")
    parsed = PurePosixPath(relative)
    if parsed.is_absolute() or "." in parsed.parts or ".." in parsed.parts:
        raise NonMlTimbreError(f"{label} escapes its source directory")
    candidate = (root / parsed).resolve()
    try:
        candidate.relative_to(root.resolve())
    except ValueError as exc:
        raise NonMlTimbreError(f"{label} escapes its source directory") from exc
    return candidate


def _load_native_wav_module() -> Any:
    module_path = (
        Path(__file__).resolve().parents[1]
        / "daegeum-transitions"
        / "native_wav.py"
    )
    spec = importlib.util.spec_from_file_location(
        "mini_daegeum_timbre_native_wav", module_path
    )
    if spec is None or spec.loader is None:
        raise NonMlTimbreError("cannot load the repository native WAV reader")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def _verify_rights_binding(
    rights_path: Path, corpus_path: Path, corpus: Mapping[str, Any]
) -> dict[str, Any]:
    rights = _load_json(rights_path, label="NGC rights audit")
    if rights.get("schema") != RIGHTS_SCHEMA:
        raise NonMlTimbreError("unexpected NGC rights-audit schema")
    binding = _mapping(
        rights.get("controlled_manifest_binding"),
        label="rights controlled_manifest_binding",
    )
    actual_manifest_sha = _sha256(corpus_path)
    if binding.get("manifest_sha256") != actual_manifest_sha:
        raise NonMlTimbreError("rights audit does not bind to this exact corpus manifest")
    if binding.get("manifest_basename") != corpus_path.name:
        raise NonMlTimbreError("rights audit corpus-manifest basename does not match")
    if binding.get("schema") != CORPUS_SCHEMA or corpus.get("schema") != CORPUS_SCHEMA:
        raise NonMlTimbreError("unexpected NGC corpus-manifest schema")
    if binding.get("selected_count") != EXPECTED_CORPUS_COUNT:
        raise NonMlTimbreError("rights audit does not bind exactly 192 sources")
    sequence = _mapping(binding.get("extend_sequence"), label="rights sequence range")
    if sequence != {
        "first": EXPECTED_FIRST_SEQUENCE,
        "last": EXPECTED_LAST_SEQUENCE,
        "contiguous": True,
    }:
        raise NonMlTimbreError("rights audit sequence range is not exact and contiguous")
    live = _mapping(
        _mapping(rights.get("current_official_ngc_metadata"), label="current NGC metadata").get(
            "live_file_list"
        ),
        label="rights live file-list binding",
    )
    if (
        live.get("exact_daegeum_sanjo_row_count") != EXPECTED_CORPUS_COUNT
        or live.get("all_controlled_192_rows_and_server_paths_match") is not True
    ):
        raise NonMlTimbreError("live NGC metadata does not match the controlled 192-source corpus")
    decision = _mapping(
        rights.get("fail_closed_rights_decision"), label="rights decision"
    )
    non_ml = _mapping(
        decision.get("sample_transformation_or_non_ml_derivative_synthesis"),
        label="non-ML derivative decision",
    )
    if non_ml.get("status") != "CONDITIONALLY_PERMITTED_BY_OBSERVED_TYPE1":
        raise NonMlTimbreError("non-ML sample transformation is not permitted by the rights audit")
    conditions = non_ml.get("conditions")
    if not isinstance(conditions, list) or "source attribution" not in conditions:
        raise NonMlTimbreError("rights audit does not carry the required source-attribution condition")
    ml = _mapping(
        decision.get("ml_training_or_ml_derived_game_audio"),
        label="ML rights decision",
    )
    if ml.get("status") != "BLOCKED_FAIL_CLOSED":
        raise NonMlTimbreError("this non-ML tool requires the independent ML path to remain fail-closed")
    if decision.get("no_training_or_shipping_authorized_by_this_report") is not True:
        raise NonMlTimbreError("rights audit scope guard is missing")

    # Recompute the compact selected-row binding rather than trusting two
    # independent strings in the report and source manifest.
    rows: list[dict[str, Any]] = []
    entries = corpus.get("entries")
    if not isinstance(entries, list):
        raise NonMlTimbreError("NGC corpus entries must be an array")
    for entry_value in entries:
        entry = _mapping(entry_value, label="NGC corpus entry")
        catalog = _mapping(entry.get("catalog_record"), label="NGC catalog record")
        rows.append(
            {
                "extendSeq": catalog.get("extendSeq"),
                "wavFilePath": catalog.get("wavFilePath"),
                "mp3FilePath": catalog.get("mp3FilePath"),
            }
        )
    rows.sort(key=lambda item: int(item["extendSeq"]))
    selected_rows_sha = hashlib.sha256(_canonical_json(rows)).hexdigest()
    if binding.get("selected_catalog_row_sha256") != selected_rows_sha:
        raise NonMlTimbreError("rights audit selected-row digest does not match the corpus manifest")
    if live.get("controlled_selected_catalog_row_sha256") != selected_rows_sha:
        raise NonMlTimbreError("live NGC selected-row digest does not match the corpus manifest")

    receipt = _mapping(
        binding.get("historical_catalog_type1_receipt"),
        label="historical NGC Type-1 receipt",
    )
    source_receipt = _mapping(corpus.get("license_evidence"), label="manifest license evidence")
    for key in ("catalog_page_sha256", "catalog_page_url", "notice", "observed_at_utc"):
        if receipt.get(key) != source_receipt.get(key):
            raise NonMlTimbreError(f"rights audit historical receipt mismatch: {key}")

    return {
        "rights_audit_filename": rights_path.name,
        "rights_audit_sha256": _sha256(rights_path),
        "corpus_manifest_filename": corpus_path.name,
        "corpus_manifest_sha256": actual_manifest_sha,
        "selected_catalog_row_sha256": selected_rows_sha,
        "decision_status": non_ml["status"],
        "conditions": list(conditions),
        "ml_training_status": ml["status"],
        "policy_basis": decision.get("policy_basis"),
    }


def _verify_entire_corpus(
    corpus_path: Path, corpus: Mapping[str, Any]
) -> tuple[dict[int, dict[str, Any]], list[dict[str, Any]]]:
    entries_value = corpus.get("entries")
    if not isinstance(entries_value, list) or len(entries_value) != EXPECTED_CORPUS_COUNT:
        raise NonMlTimbreError("corpus must contain exactly 192 entries")
    by_sequence: dict[int, dict[str, Any]] = {}
    receipts: list[dict[str, Any]] = []
    for entry_value in entries_value:
        entry = dict(_mapping(entry_value, label="NGC corpus entry"))
        sequence = entry.get("extend_seq")
        if isinstance(sequence, bool) or not isinstance(sequence, int):
            raise NonMlTimbreError("corpus extend_seq must be an integer")
        if sequence in by_sequence:
            raise NonMlTimbreError("corpus contains a duplicate extend_seq")
        selection = _mapping(entry.get("selection"), label="corpus selection")
        if (
            selection.get("instrument_code") != "EXTEND0001"
            or selection.get("instrument_name") != "대금"
            or selection.get("division_exact") != "대금산조"
        ):
            raise NonMlTimbreError("corpus entry is outside exact Daegeum Sanjo scope")
        download = _mapping(entry.get("download"), label="corpus download receipt")
        expected_sha = download.get("sha256")
        relative = download.get("relative_path")
        if (
            download.get("state") != "downloaded"
            or not isinstance(expected_sha, str)
            or len(expected_sha) != 64
        ):
            raise NonMlTimbreError("corpus entry lacks a complete download receipt")
        wav_path = _safe_child(corpus_path.parent, relative, label="download.relative_path")
        if not wav_path.is_file():
            raise NonMlTimbreError(f"corpus WAV is missing for extend_seq {sequence}")
        actual_sha = _sha256(wav_path)
        if actual_sha != expected_sha:
            raise NonMlTimbreError(f"corpus WAV hash mismatch for extend_seq {sequence}")
        native = _mapping(download.get("native_wav"), label="native WAV receipt")
        if native.get("sha256") != actual_sha:
            raise NonMlTimbreError(f"native WAV receipt mismatch for extend_seq {sequence}")
        by_sequence[sequence] = {"entry": entry, "path": wav_path, "sha256": actual_sha}
        receipts.append(
            {
                "extend_seq": sequence,
                "relative_path": str(relative),
                "sha256": actual_sha,
                "verified": True,
            }
        )
    expected_sequences = list(range(EXPECTED_FIRST_SEQUENCE, EXPECTED_LAST_SEQUENCE + 1))
    if sorted(by_sequence) != expected_sequences:
        raise NonMlTimbreError("corpus sequence set is not exactly 1520..1711")
    for sequence in DECLARED_SOURCE_SEQUENCES:
        if sequence not in by_sequence:
            raise NonMlTimbreError(f"declared source subset item {sequence} is missing")
    receipts.sort(key=lambda item: item["extend_seq"])
    return by_sequence, receipts


def _read_flute_reference(report_path: Path) -> tuple[np.ndarray, int, dict[str, Any]]:
    report = _load_json(report_path, label="official MIDI-DDSP runtime report")
    if report.get("schema") != FLUTE_REPORT_SCHEMA or report.get("status") != "succeeded":
        raise NonMlTimbreError("official MIDI-DDSP runtime report did not succeed")
    scope = _mapping(report.get("scope"), label="official MIDI-DDSP scope")
    required_scope = {
        "no_default_bgm_changed": True,
        "not_a_game_asset": True,
        "not_a_training_result": True,
        "r_and_d_only": True,
    }
    if any(scope.get(key) is not value for key, value in required_scope.items()):
        raise NonMlTimbreError("official MIDI-DDSP report lacks the required R&D scope guards")
    variant = _mapping(
        _mapping(report.get("variants"), label="official MIDI-DDSP variants").get(
            FLUTE_VARIANT
        ),
        label="authorial bridge variant",
    )
    audio = _mapping(variant.get("audio"), label="authorial bridge audio")
    source = _safe_child(report_path.parent, audio.get("relative_path"), label="flute audio path")
    expected_sha = audio.get("sha256")
    if not source.is_file() or _sha256(source) != expected_sha:
        raise NonMlTimbreError("official flute bridge WAV hash does not match its report")
    release = _mapping(variant.get("post_model_authorial_release"), label="authorial release")
    if (
        release.get("applied") is not True
        or float(release.get("start_seconds", -1.0)) != ACTIVE_END_SECONDS
        or float(release.get("end_seconds", -1.0)) != RELEASE_END_SECONDS
    ):
        raise NonMlTimbreError("official flute bridge does not carry the expected authorial release")
    try:
        with wave.open(str(source), "rb") as reader:
            channels = reader.getnchannels()
            width = reader.getsampwidth()
            rate = reader.getframerate()
            frames = reader.getnframes()
            compression = reader.getcomptype()
            raw = reader.readframes(frames)
    except (OSError, wave.Error) as exc:
        raise NonMlTimbreError("cannot read the official flute bridge as PCM WAVE") from exc
    if channels != 1 or width != 2 or compression != "NONE" or rate < 1:
        raise NonMlTimbreError("official flute bridge must be uncompressed PCM16 mono")
    if frames != round(RELEASE_END_SECONDS * rate) or len(raw) != frames * 2:
        raise NonMlTimbreError("official flute bridge must end exactly at the declared 6.72 s release")
    samples = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768.0
    return samples, rate, {
        "runtime_report_filename": report_path.name,
        "runtime_report_sha256": _sha256(report_path),
        "variant": FLUTE_VARIANT,
        "relative_path": audio.get("relative_path"),
        "wav_sha256": expected_sha,
        "sample_rate_hz": rate,
        "frame_count": frames,
        "duration_seconds": RELEASE_END_SECONDS,
        "authorial_active_end_seconds": ACTIVE_END_SECONDS,
        "authorial_release_end_seconds": RELEASE_END_SECONDS,
        "pretrained_weight_game_license_clearance_not_established": scope.get(
            "pretrained_weight_game_license_clearance_not_established"
        ),
    }


def _log_frequency_grid(max_hz: float) -> np.ndarray:
    upper = min(ANALYSIS_MAX_HZ, max_hz)
    if upper <= ANALYSIS_MIN_HZ:
        raise NonMlTimbreError("sample rate is too low for spectral-envelope analysis")
    octaves = math.log2(upper / ANALYSIS_MIN_HZ)
    count = int(math.floor(octaves * LOG_BINS_PER_OCTAVE)) + 1
    return ANALYSIS_MIN_HZ * np.power(2.0, np.arange(count) / LOG_BINS_PER_OCTAVE)


def _next_power_of_two(value: float) -> int:
    return 1 << int(math.ceil(math.log2(max(16.0, value))))


def _smoothed_log_spectral_envelope_db(
    samples: np.ndarray, sample_rate_hz: int, log_grid_hz: np.ndarray
) -> tuple[np.ndarray, int]:
    if samples.ndim != 1 or samples.size < 16 or not np.all(np.isfinite(samples)):
        raise NonMlTimbreError("spectral analysis requires finite mono audio")
    frame_length = min(_next_power_of_two(sample_rate_hz * 0.064), samples.size)
    if frame_length < 16:
        raise NonMlTimbreError("source is too short for spectral analysis")
    hop = max(1, frame_length // 4)
    starts = np.arange(0, samples.size - frame_length + 1, hop, dtype=np.int64)
    if starts.size == 0:
        starts = np.array([0], dtype=np.int64)
    window = signal.windows.hann(frame_length, sym=False).astype(np.float64)
    spectra: list[np.ndarray] = []
    threshold = 10.0 ** (ACTIVE_FRAME_RMS_DBFS / 20.0)
    for start in starts:
        frame = samples[int(start) : int(start) + frame_length]
        rms = float(np.sqrt(np.mean(np.square(frame))))
        if rms < threshold:
            continue
        magnitude = np.abs(np.fft.rfft(frame * window))
        spectra.append(20.0 * np.log10(np.maximum(magnitude, 1.0e-12)))
    if not spectra:
        raise NonMlTimbreError("source has no frames above the fixed analysis threshold")
    frequencies = np.fft.rfftfreq(frame_length, d=1.0 / sample_rate_hz)
    usable = frequencies >= ANALYSIS_MIN_HZ
    if not np.any(usable):
        raise NonMlTimbreError("source has no usable spectral bins")
    mean_log_magnitude = np.mean(np.stack(spectra, axis=0), axis=0)
    interpolated = np.interp(log_grid_hz, frequencies[usable], mean_log_magnitude[usable])
    sigma_bins = ENVELOPE_SMOOTHING_OCTAVES_SIGMA * LOG_BINS_PER_OCTAVE
    envelope = gaussian_filter1d(interpolated, sigma=sigma_bins, mode="nearest")
    normalisation_band = (log_grid_hz >= 250.0) & (log_grid_hz <= 4500.0)
    envelope -= float(np.median(envelope[normalisation_band]))
    return envelope, len(spectra)


def _derive_static_eq(
    flute: np.ndarray,
    flute_rate: int,
    corpus_by_sequence: Mapping[int, Mapping[str, Any]],
) -> tuple[np.ndarray, np.ndarray, dict[str, Any], list[dict[str, Any]]]:
    native_wav = _load_native_wav_module()
    grid = _log_frequency_grid(flute_rate / 2.0)
    flute_envelope, flute_frames = _smoothed_log_spectral_envelope_db(
        flute, flute_rate, grid
    )
    target_envelopes: list[np.ndarray] = []
    source_receipts: list[dict[str, Any]] = []
    for sequence in DECLARED_SOURCE_SEQUENCES:
        source_record = corpus_by_sequence[sequence]
        native = native_wav.read_native_wav(source_record["path"])
        if native.metadata.get("sha256") != source_record["sha256"]:
            raise NonMlTimbreError(f"decoded native WAV digest changed for extend_seq {sequence}")
        native_audio = _mapping(native.metadata.get("native_audio"), label="native audio metadata")
        rate = int(native_audio.get("sample_rate_hz", 0))
        envelope, used_frames = _smoothed_log_spectral_envelope_db(
            native.analysis_mono.astype(np.float64, copy=False), rate, grid
        )
        target_envelopes.append(envelope)
        entry = _mapping(source_record["entry"], label="NGC subset entry")
        catalog = _mapping(entry.get("catalog_record"), label="NGC subset catalog")
        source_receipts.append(
            {
                "extend_seq": sequence,
                "sha256": source_record["sha256"],
                "catalog_name_ko": catalog.get("extendNmKor"),
                "player": catalog.get("player"),
                "beat": catalog.get("beat"),
                "bpm": catalog.get("bpm"),
                "native_sample_rate_hz": rate,
                "native_duration_seconds": round(
                    float(native_audio.get("duration_seconds", 0.0)), 9
                ),
                "active_analysis_frame_count": used_frames,
            }
        )
    target = np.mean(np.stack(target_envelopes, axis=0), axis=0)
    ratio_db = target - flute_envelope
    centre_band = (grid >= 250.0) & (grid <= 4500.0)
    ratio_db -= float(np.median(ratio_db[centre_band]))
    sigma_bins = ENVELOPE_SMOOTHING_OCTAVES_SIGMA * LOG_BINS_PER_OCTAVE
    ratio_db = gaussian_filter1d(ratio_db, sigma=sigma_bins, mode="nearest")
    ratio_db = np.clip(ratio_db, -EQ_LIMIT_DB, EQ_LIMIT_DB)
    low_weight = np.clip(
        (grid - LOW_TAPER_START_HZ) / (LOW_TAPER_END_HZ - LOW_TAPER_START_HZ),
        0.0,
        1.0,
    )
    high_weight = np.clip(
        (HIGH_TAPER_END_HZ - grid) / (HIGH_TAPER_END_HZ - HIGH_TAPER_START_HZ),
        0.0,
        1.0,
    )
    ratio_db *= low_weight * high_weight
    analysis = {
        "method": "mean per-file smoothed log-magnitude spectral envelope; target/reference ratio",
        "selection": "fixed stride of 17 from extend_seq 1520 plus final 1711",
        "declared_subset_count": len(DECLARED_SOURCE_SEQUENCES),
        "declared_subset_sequences": list(DECLARED_SOURCE_SEQUENCES),
        "flute_active_analysis_frame_count": flute_frames,
        "active_frame_rms_threshold_dbfs": ACTIVE_FRAME_RMS_DBFS,
        "log_bins_per_octave": LOG_BINS_PER_OCTAVE,
        "smoothing_sigma_octaves": ENVELOPE_SMOOTHING_OCTAVES_SIGMA,
        "eq_limit_db": EQ_LIMIT_DB,
        "low_frequency_taper_hz": [LOW_TAPER_START_HZ, LOW_TAPER_END_HZ],
        "high_frequency_taper_hz": [HIGH_TAPER_START_HZ, HIGH_TAPER_END_HZ],
        "ratio_db_min": round(float(np.min(ratio_db)), 9),
        "ratio_db_max": round(float(np.max(ratio_db)), 9),
        "fitting_or_optimisation": False,
        "model_training": False,
        "data_dependent_source_selection": False,
    }
    return grid, ratio_db, analysis, source_receipts


def _apply_static_spectral_ratio(
    samples: np.ndarray,
    sample_rate_hz: int,
    grid_hz: np.ndarray,
    ratio_db: np.ndarray,
) -> np.ndarray:
    frequencies, _, spectrum = signal.stft(
        samples,
        fs=sample_rate_hz,
        window="hann",
        nperseg=APPLICATION_FRAME_LENGTH,
        noverlap=APPLICATION_FRAME_LENGTH - APPLICATION_HOP_LENGTH,
        nfft=APPLICATION_FRAME_LENGTH,
        boundary="zeros",
        padded=True,
        return_onesided=True,
    )
    interpolated_db = np.interp(frequencies, grid_hz, ratio_db, left=0.0, right=0.0)
    magnitude_gain = np.power(10.0, interpolated_db / 20.0)
    transformed_spectrum = spectrum * magnitude_gain[:, np.newaxis]
    _, transformed = signal.istft(
        transformed_spectrum,
        fs=sample_rate_hz,
        window="hann",
        nperseg=APPLICATION_FRAME_LENGTH,
        noverlap=APPLICATION_FRAME_LENGTH - APPLICATION_HOP_LENGTH,
        nfft=APPLICATION_FRAME_LENGTH,
        input_onesided=True,
        boundary=True,
    )
    if transformed.size < samples.size:
        raise NonMlTimbreError("STFT reconstruction unexpectedly shortened the timeline")
    transformed = transformed[: samples.size].astype(np.float64, copy=False)
    if not np.all(np.isfinite(transformed)):
        raise NonMlTimbreError("spectral transform produced non-finite samples")
    return transformed


def _rms(samples: np.ndarray) -> float:
    if samples.size == 0:
        raise NonMlTimbreError("cannot measure an empty interval")
    return float(np.sqrt(np.mean(np.square(samples.astype(np.float64, copy=False)))))


def _dbfs(amplitude: float) -> float:
    return float("-inf") if amplitude == 0.0 else 20.0 * math.log10(amplitude)


def _monitoring_pcm16(
    samples: np.ndarray, *, active_end_frame: int, label: str
) -> tuple[np.ndarray, dict[str, Any]]:
    source_rms = _rms(samples[:active_end_frame])
    target = 10.0 ** (TARGET_ACTIVE_RMS_DBFS / 20.0)
    gain = target / source_rms
    peak = float(np.max(np.abs(samples))) * gain
    ceiling = 10.0 ** (PEAK_CEILING_DBFS / 20.0)
    if peak > ceiling:
        raise NonMlTimbreError(
            f"{label} constant monitoring gain would exceed the {PEAK_CEILING_DBFS:.1f} dBFS peak ceiling"
        )
    scaled = samples * gain
    quantized_float = np.rint(scaled * 32768.0)
    if np.any(quantized_float < -32768.0) or np.any(quantized_float > 32767.0):
        raise NonMlTimbreError(f"{label} would clip during PCM16 quantisation")
    quantized = quantized_float.astype(np.int16)
    output_rms = _rms(quantized[:active_end_frame].astype(np.float64) / 32768.0)
    output_peak = float(np.max(np.abs(quantized.astype(np.int32)))) / 32768.0
    return quantized, {
        "source_active_rms_dbfs": round(_dbfs(source_rms), 9),
        "whole_file_constant_gain_linear": round(gain, 12),
        "whole_file_constant_gain_db": round(20.0 * math.log10(gain), 9),
        "output_active_rms_dbfs": round(_dbfs(output_rms), 9),
        "output_peak_dbfs": round(_dbfs(output_peak), 9),
        "peak_ceiling_dbfs": PEAK_CEILING_DBFS,
        "constant_gain_only": True,
        "compression": False,
        "limiting": False,
        "time_varying_gain": False,
    }


def _rms_envelope(
    samples: np.ndarray, *, frame_length: int, hop_length: int
) -> np.ndarray:
    if frame_length < 1 or hop_length < 1 or samples.size < frame_length:
        raise NonMlTimbreError("invalid temporal-integrity envelope window")
    return np.asarray(
        [
            _rms(samples[start : start + frame_length])
            for start in range(0, samples.size - frame_length + 1, hop_length)
        ],
        dtype=np.float64,
    )


def _envelope_correlation(reference: np.ndarray, candidate: np.ndarray) -> float:
    if reference.shape != candidate.shape or reference.size < 2:
        raise NonMlTimbreError("temporal-integrity envelopes do not align")
    if float(np.std(reference)) == 0.0 or float(np.std(candidate)) == 0.0:
        raise NonMlTimbreError("temporal-integrity envelope is constant")
    correlation = float(np.corrcoef(reference, candidate)[0, 1])
    if not math.isfinite(correlation):
        raise NonMlTimbreError("temporal-integrity correlation is not finite")
    return correlation


def _temporal_integrity_metrics(
    reference: np.ndarray, candidate: np.ndarray, *, sample_rate_hz: int
) -> dict[str, Any]:
    if reference.shape != candidate.shape:
        raise NonMlTimbreError("candidate frame count differs from the flute reference")
    full_frame = max(1, round(0.020 * sample_rate_hz))
    full_hop = max(1, round(0.010 * sample_rate_hz))
    reference_full = _rms_envelope(
        reference, frame_length=full_frame, hop_length=full_hop
    )
    candidate_full = _rms_envelope(
        candidate, frame_length=full_frame, hop_length=full_hop
    )
    release_start = round(ACTIVE_END_SECONDS * sample_rate_hz)
    release = reference[release_start:]
    candidate_release = candidate[release_start:]
    release_frame = max(1, round(0.005 * sample_rate_hz))
    reference_release = _rms_envelope(
        release, frame_length=release_frame, hop_length=release_frame
    )
    transformed_release = _rms_envelope(
        candidate_release, frame_length=release_frame, hop_length=release_frame
    )
    return {
        "frame_count_identical": True,
        "source_event_coordinates_unchanged": True,
        "pitch_or_timing_operation_applied": False,
        "full_phrase_short_time_rms_envelope_correlation": round(
            _envelope_correlation(reference_full, candidate_full), 9
        ),
        "full_phrase_envelope_window_ms": 20.0,
        "full_phrase_envelope_hop_ms": 10.0,
        "authorial_release_short_time_rms_envelope_correlation": round(
            _envelope_correlation(reference_release, transformed_release), 9
        ),
        "authorial_release_envelope_window_and_hop_ms": 5.0,
        "interpretation_limit": (
            "correlation is a deterministic timeline sanity check, not a perceptual "
            "or Daegeum-articulation quality score"
        ),
    }


def _wav_bytes(samples: np.ndarray, sample_rate_hz: int) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(sample_rate_hz)
        writer.setcomptype("NONE", "not compressed")
        writer.writeframes(samples.astype("<i2", copy=False).tobytes())
    return output.getvalue()


def _profile_csv_bytes(grid_hz: np.ndarray, ratio_db: np.ndarray) -> bytes:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(("frequency_hz", "static_magnitude_ratio_db"))
    for frequency, gain_db in zip(grid_hz, ratio_db):
        writer.writerow((f"{float(frequency):.9f}", f"{float(gain_db):.9f}"))
    return output.getvalue().encode("utf-8")


def build_timbre_audition(
    rights_audit_path: str | Path,
    corpus_manifest_path: str | Path,
    flute_report_path: str | Path,
    output_dir: str | Path,
) -> dict[str, Any]:
    rights_path = Path(rights_audit_path).expanduser().resolve()
    corpus_path = Path(corpus_manifest_path).expanduser().resolve()
    report_path = Path(flute_report_path).expanduser().resolve()
    destination = Path(output_dir).expanduser().resolve()
    if destination.exists():
        raise NonMlTimbreError("output directory already exists; refusing to overwrite")
    if not destination.parent.is_dir():
        raise NonMlTimbreError("output parent directory does not exist")

    # Nothing is written before all rights, identity, source-hash, and signal
    # checks complete.
    corpus = _load_json(corpus_path, label="NGC corpus manifest")
    rights_receipt = _verify_rights_binding(rights_path, corpus_path, corpus)
    corpus_by_sequence, all_hash_receipts = _verify_entire_corpus(corpus_path, corpus)
    flute, sample_rate_hz, flute_receipt = _read_flute_reference(report_path)
    grid_hz, ratio_db, analysis, subset_receipts = _derive_static_eq(
        flute, sample_rate_hz, corpus_by_sequence
    )
    transformed = _apply_static_spectral_ratio(
        flute, sample_rate_hz, grid_hz, ratio_db
    )
    conservative = (1.0 - CONSERVATIVE_WET) * flute + CONSERVATIVE_WET * transformed
    if transformed.shape != flute.shape or conservative.shape != flute.shape:
        raise NonMlTimbreError("timbre transform changed the source timeline")

    active_end_frame = int(round(ACTIVE_END_SECONDS * sample_rate_hz))
    variants_float = {
        "A_official_flute_bridge_reference": flute,
        "B_ngc_spectral_envelope_proxy": transformed,
        "C_conservative_dry_wet_proxy": conservative,
    }
    output_names = {
        "A_official_flute_bridge_reference": A_FILENAME,
        "B_ngc_spectral_envelope_proxy": B_FILENAME,
        "C_conservative_dry_wet_proxy": C_FILENAME,
    }
    audio_bytes: dict[str, bytes] = {}
    variants: dict[str, Any] = {}
    for key, samples in variants_float.items():
        pcm, monitoring = _monitoring_pcm16(
            samples, active_end_frame=active_end_frame, label=key
        )
        payload = _wav_bytes(pcm, sample_rate_hz)
        audio_bytes[key] = payload
        variants[key] = {
            "filename": output_names[key],
            "sha256": hashlib.sha256(payload).hexdigest(),
            "audio": {
                "encoding": "PCM16_LE",
                "channels": 1,
                "sample_rate_hz": sample_rate_hz,
                "frame_count": int(pcm.size),
                "duration_seconds": round(pcm.size / sample_rate_hz, 9),
            },
            "monitoring": monitoring,
        }
    variants["A_official_flute_bridge_reference"]["operation"] = "source waveform; monitoring gain only"
    variants["B_ngc_spectral_envelope_proxy"]["operation"] = (
        "one static phase-preserving STFT magnitude curve; no temporal or pitch transform"
    )
    variants["C_conservative_dry_wet_proxy"]["operation"] = (
        f"sample-aligned fixed blend: {1.0 - CONSERVATIVE_WET:.2f} dry + {CONSERVATIVE_WET:.2f} B"
    )
    variants["B_ngc_spectral_envelope_proxy"]["temporal_integrity"] = (
        _temporal_integrity_metrics(flute, transformed, sample_rate_hz=sample_rate_hz)
    )
    variants["C_conservative_dry_wet_proxy"]["temporal_integrity"] = (
        _temporal_integrity_metrics(flute, conservative, sample_rate_hz=sample_rate_hz)
    )
    profile_bytes = _profile_csv_bytes(grid_hz, ratio_db)

    corpus_scope = _mapping(corpus.get("scope"), label="corpus scope")
    manifest: dict[str, Any] = {
        "schema": SCHEMA,
        "artifact_kind": "deterministic_non_ml_static_spectral_timbre_proxy_audition",
        "status": "succeeded",
        "rights_gate": rights_receipt,
        "inputs": {
            "official_flute_bridge": flute_receipt,
            "ngc_corpus": {
                "service": corpus_scope.get("service"),
                "instrument_code": corpus_scope.get("instrument_code"),
                "instrument_name": corpus_scope.get("instrument_name"),
                "division_exact": corpus_scope.get("division_exact"),
                "total_source_count": EXPECTED_CORPUS_COUNT,
                "all_192_wav_hashes_verified_before_decode": True,
                "all_source_hash_receipts": all_hash_receipts,
                "decoded_declared_subset": subset_receipts,
            },
        },
        "source_attribution": {
            "institution_ko": "국립국악원",
            "institution_en": "National Gugak Center",
            "service": "국악 디지털 음원/디지털음원 확장음원",
            "collection": "대금산조 악구 (extended Daegeum Sanjo phrases)",
            "performer": "박종현",
            "catalog_url": "https://www.gugak.go.kr/digitaleum/front/extend/list.do",
            "license_notice_observed": "공공누리 제1유형(출처표시)",
            "required_conditions_preserved": rights_receipt["conditions"],
            "no_endorsement_claim": True,
        },
        "algorithm": {
            "spectral_envelope_analysis": analysis,
            "static_eq_application": {
                "profile_filename": EQ_PROFILE_FILENAME,
                "profile_sha256": hashlib.sha256(profile_bytes).hexdigest(),
                "stft_frame_length_samples": APPLICATION_FRAME_LENGTH,
                "stft_hop_length_samples": APPLICATION_HOP_LENGTH,
                "window": "periodic_hann",
                "same_positive_real_gain_at_each_frequency_for_every_frame": True,
                "complex_stft_phase_retained": True,
                "reconstructed_frame_count_equals_source": True,
                "resampling": False,
                "pitch_shift_or_f0_rewrite": False,
                "time_stretch_or_timeline_warp": False,
                "source_splicing": False,
                "dynamic_eq": False,
                "model_training_or_fitting": False,
            },
            "conservative_blend": {
                "dry_fraction": 1.0 - CONSERVATIVE_WET,
                "spectral_proxy_fraction": CONSERVATIVE_WET,
                "sample_aligned": True,
            },
        },
        "level_matching": {
            "shared_active_interval_seconds": [0.0, ACTIVE_END_SECONDS],
            "authorial_release_interval_seconds": [ACTIVE_END_SECONDS, RELEASE_END_SECONDS],
            "shared_target_active_rms_dbfs": TARGET_ACTIVE_RMS_DBFS,
            "whole_file_peak_ceiling_dbfs": PEAK_CEILING_DBFS,
            "one_constant_gain_per_entire_variant_only": True,
            "release_receives_same_constant_gain_as_every_other_sample": True,
            "compression": False,
            "limiting": False,
            "time_varying_normalisation": False,
        },
        "variants": variants,
        "scope_and_warnings": {
            "not_a_daegeum_model": True,
            "not_trained": True,
            "not_a_recorded_daegeum_performance": True,
            "unreviewed_r_and_d_audition_only": True,
            "not_a_default_game_asset": True,
            "no_default_bgm_or_runtime_asset_changed": True,
            "not_authorized_for_model_training": True,
            "not_authorized_for_shipping_by_this_report": True,
            "pretrained_midi_ddsp_weight_game_license_clearance_not_established": True,
            "static_eq_is_only_a_timbre_proxy_and_cannot_create_missing_daegeum_articulation": True,
            "human_listening_review_required": True,
        },
    }

    # Stage every output in a private sibling directory and publish only after
    # every byte and manifest hash is known.
    with tempfile.TemporaryDirectory(
        prefix=f".{destination.name}.staging-", dir=str(destination.parent)
    ) as staging_name:
        staging = Path(staging_name)
        for key, payload in audio_bytes.items():
            (staging / output_names[key]).write_bytes(payload)
        (staging / EQ_PROFILE_FILENAME).write_bytes(profile_bytes)
        (staging / MANIFEST_FILENAME).write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        os.replace(staging, destination)
    return manifest


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Build a rights-gated, deterministic non-ML Daegeum-timbre proxy A/B/C pack."
    )
    parser.add_argument("--rights-audit", type=Path, required=True)
    parser.add_argument("--ngc-manifest", type=Path, required=True)
    parser.add_argument("--flute-report", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = build_timbre_audition(
            args.rights_audit, args.ngc_manifest, args.flute_report, args.output_dir
        )
    except (NonMlTimbreError, OSError, ValueError) as exc:
        print(f"midi-ddsp-daegeum-timbre: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
