#!/usr/bin/env python3
"""Bind a local-only, whole-RMS-matched 48 kHz VB01 listening comparison.

The original 48 kHz excerpts, bound 16 kHz pairs, and diagnostic dry files
are read-only. Only three new, gain-adjusted 48 kHz PCM16 WAVs are saved.
This is a listening aid, not a model evaluation or a game asset.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import math
import os
from pathlib import Path
import shutil
import sys
import wave

import numpy as np

import mac_mps_ddsp_pilot as pilot


SCHEMA = "mini.aihub-71470-vb01-fair-local-listen.v1"
TARGET_RMS = 0.035
MAX_PEAK = 0.9
MIN_FREE_AFTER = 8 * 1024**3
PAIR_COUNT = 3
MAX_WAV_BYTES = 400_000
MAX_JSON_BYTES = 128_000


class FairListenError(Exception):
    """Fixed error code; private paths and source details never reach stdout."""


def _sha(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _document(path: Path) -> tuple[dict, str]:
    try:
        payload = pilot._private_file(path, max_bytes=MAX_JSON_BYTES)
        value = json.loads(payload)
    except (pilot.PilotError, OSError, UnicodeError, ValueError) as exc:
        raise FairListenError("private_document_invalid") from exc
    if not isinstance(value, dict):
        raise FairListenError("private_document_invalid")
    return value, _sha(payload)


def _wav(path: Path, *, rate: int, frames: int) -> tuple[bytes, np.ndarray]:
    try:
        payload = pilot._private_file(path, max_bytes=MAX_WAV_BYTES)
        with wave.open(io.BytesIO(payload), "rb") as reader:
            if (reader.getnchannels() != 1 or reader.getsampwidth() != 2
                    or reader.getframerate() != rate or reader.getnframes() != frames
                    or reader.getcomptype() != "NONE"):
                raise FairListenError("wav_format_or_length_invalid")
            pcm = reader.readframes(frames)
    except (pilot.PilotError, OSError, EOFError, wave.Error) as exc:
        raise FairListenError("wav_unreadable") from exc
    if len(pcm) != frames * 2:
        raise FairListenError("wav_truncated")
    return payload, np.frombuffer(pcm, dtype="<i2")


def _pack_wav(samples: np.ndarray, rate: int) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as writer:
        writer.setnchannels(1)
        writer.setsampwidth(2)
        writer.setframerate(rate)
        writer.writeframes(np.asarray(samples, dtype="<i2").tobytes())
    return output.getvalue()


def _match_48k(samples: np.ndarray) -> tuple[bytes, dict]:
    if samples.dtype != np.dtype("<i2") or samples.shape != (192_000,):
        raise FairListenError("original_pcm_invalid")
    original = samples.astype(np.float64) / 32768.0
    rms = float(np.sqrt(np.mean(original * original)))
    peak = float(np.max(np.abs(original)))
    if not math.isfinite(rms) or rms < 1e-5:
        raise FairListenError("original_too_quiet")
    gain = TARGET_RMS / rms
    if peak * gain > MAX_PEAK:
        raise FairListenError("matching_would_clip")
    scaled = np.rint(original * gain * 32767.0)
    if np.max(np.abs(scaled)) > 32767:
        raise FairListenError("matching_would_clip")
    matched = scaled.astype("<i2")
    actual = matched.astype(np.float64) / 32768.0
    actual_rms = float(np.sqrt(np.mean(actual * actual)))
    actual_peak = float(np.max(np.abs(actual)))
    if abs(actual_rms - TARGET_RMS) > 1e-5 or actual_peak > MAX_PEAK:
        raise FairListenError("matched_level_invalid")
    return _pack_wav(matched, 48_000), {
        "raw_rms_dbfs": round(20 * math.log10(rms), 4),
        "listening_gain_db": round(20 * math.log10(gain), 4),
        "matched_rms_dbfs": round(20 * math.log10(actual_rms), 4),
        "matched_peak": round(actual_peak, 6),
    }


def _prior_inputs(original_dir: Path, bound_dir: Path, dry_dir: Path) -> tuple[dict, dict]:
    try:
        original = pilot._private_dir(original_dir)
        bound = pilot._private_dir(bound_dir)
        dry = pilot._private_dir(dry_dir)
    except pilot.PilotError as exc:
        raise FairListenError("private_directory_invalid") from exc
    if (original.parent.parent != bound.parent or dry.parent != bound.parent
            or len({original, bound, dry}) != 3):
        raise FairListenError("private_input_layout_invalid")
    reference, reference_sha = _document(original / "reference_manifest_private.json")
    selection, selection_sha = _document(bound / "vibrato_selection_private.json")
    vb_report, vb_report_sha = _document(bound / "result" / "vibrato_reproduction_report.json")
    vb_binding, vb_binding_sha = _document(bound / "result" / "checkpoint_binding.json")
    dry_report, dry_report_sha = _document(dry / "result" / "dry_listen_report.json")
    dry_binding, dry_binding_sha = _document(dry / "result" / "checkpoint_binding.json")
    if (reference.get("schema") != "mini.aihub-71470-vb01-48k-source-reference.v1"
            or reference.get("reference_level") != "original_not_rms_matched"
            or reference.get("prepared_crop_to_bound_pair_exact") is not True
            or reference.get("source_to_16k_pcm_exact") is not True
            or vb_binding.get("status") != "complete_bound_to_checkpoint"
            or dry_binding.get("status") != "complete_bound_to_checkpoint"
            or dry_report.get("status") != "dry_component_listen_ready"
            or reference.get("selection_sha256") != selection_sha
            or reference.get("bound_report_sha256") != vb_report_sha
            or reference.get("bound_binding_sha256") != vb_binding_sha
            or vb_binding.get("selection_sha256") != selection_sha
            or vb_binding.get("reproduction_report_sha256") != vb_report_sha
            or dry_binding.get("selection_sha256") != selection_sha
            or dry_binding.get("vb_report_sha256") != vb_report_sha
            or dry_binding.get("vb_binding_sha256") != vb_binding_sha
            or dry_binding.get("reference48_manifest_sha256") != reference_sha
            or dry_binding.get("dry_report_sha256") != dry_report_sha
            or dry_binding.get("checkpoint_sha256") != vb_binding.get("checkpoint_sha256")
            or dry_binding.get("checkpoint_marker_sha256") != vb_binding.get("checkpoint_marker_sha256")
            or dry_report.get("pair_count") != PAIR_COUNT):
        raise FairListenError("prior_provenance_mismatch")
    rows = reference.get("references")
    vb_assets = vb_binding.get("private_pair_wav_digests")
    dry_assets = dry_binding.get("dry_wav_digests")
    dry_metrics = dry_report.get("pairs")
    if (not isinstance(rows, list) or len(rows) != PAIR_COUNT
            or not isinstance(vb_assets, list) or len(vb_assets) != 2 * PAIR_COUNT
            or not isinstance(dry_assets, dict) or len(dry_assets) != PAIR_COUNT
            or not isinstance(dry_metrics, list) or len(dry_metrics) != PAIR_COUNT):
        raise FairListenError("prior_asset_set_invalid")
    vb_by_name = {row.get("name"): row for row in vb_assets if isinstance(row, dict)}
    if len(vb_by_name) != 2 * PAIR_COUNT:
        raise FairListenError("prior_asset_set_invalid")
    reference_by_rank = {row.get("pair_number"): row for row in rows if isinstance(row, dict)}
    metric_by_rank = {row.get("pair_number"): row for row in dry_metrics if isinstance(row, dict)}
    if len(reference_by_rank) != PAIR_COUNT or len(metric_by_rank) != PAIR_COUNT:
        raise FairListenError("prior_asset_set_invalid")
    assets = {}
    for rank in range(1, PAIR_COUNT + 1):
        ref_name = f"reference_{rank:02d}_original_48k.wav"
        source_name = f"pair_{rank:02d}_source_input_16k.wav"
        full_name = f"pair_{rank:02d}_reconstruction.wav"
        dry_name = f"dry_pair_{rank:02d}_harmonic_plus_noise.wav"
        ref_row = reference_by_rank.get(rank)
        if (not isinstance(ref_row, dict) or ref_row.get("reference_name") != ref_name
                or metric_by_rank.get(rank, {}).get("matched_rms_dbfs") != dry_report.get("target_rms_dbfs")):
            raise FairListenError("prior_asset_set_invalid")
        paths = {
            "raw48": original / ref_name,
            "source16": bound / "result" / "pairs" / source_name,
            "full16": bound / "result" / "pairs" / full_name,
            "dry16": dry / "result" / "pairs" / dry_name,
        }
        for key, path in paths.items():
            rate, frames = (48_000, 192_000) if key == "raw48" else (16_000, 64_000)
            payload, pcm = _wav(path, rate=rate, frames=frames)
            if key != "raw48":
                normalized = pcm.astype(np.float64) / 32768.0
                actual_rms = float(np.sqrt(np.mean(normalized * normalized)))
                if abs(actual_rms - TARGET_RMS) > 2e-5:
                    raise FairListenError("prior_pair_level_mismatch")
            expected = (ref_row if key == "raw48" else
                        dry_assets.get(dry_name) if key == "dry16" else
                        vb_by_name.get(source_name if key == "source16" else full_name))
            if not isinstance(expected, dict):
                raise FairListenError("prior_asset_set_invalid")
            expected_sha = expected.get("reference_sha256") if key == "raw48" else expected.get("sha256")
            expected_bytes = expected.get("reference_bytes") if key == "raw48" else expected.get("bytes")
            if _sha(payload) != expected_sha or len(payload) != expected_bytes:
                raise FairListenError("prior_asset_digest_mismatch")
            assets[f"{rank}_{key}"] = {"path": path, "sha256": _sha(payload),
                                         "bytes": len(payload), "pcm": pcm if key == "raw48" else None}
    if (set(vb_by_name) != {f"pair_{rank:02d}_{suffix}.wav" for rank in range(1, 4)
                            for suffix in ("source_input_16k", "reconstruction")}
            or set(dry_assets) != {f"dry_pair_{rank:02d}_harmonic_plus_noise.wav" for rank in range(1, 4)}):
        raise FairListenError("prior_asset_set_invalid")
    provenance = {
        "reference_manifest_sha256": reference_sha,
        "selection_sha256": selection_sha,
        "vb_report_sha256": vb_report_sha,
        "vb_binding_sha256": vb_binding_sha,
        "dry_report_sha256": dry_report_sha,
        "dry_binding_sha256": dry_binding_sha,
        "checkpoint_sha256": vb_binding["checkpoint_sha256"],
        "checkpoint_marker_sha256": vb_binding["checkpoint_marker_sha256"],
    }
    return provenance, assets


def _page(output_dir: Path, original_dir: Path, bound_dir: Path, dry_dir: Path) -> bytes:
    output_dir = output_dir.resolve()
    original_dir = original_dir.resolve()
    bound_dir = bound_dir.resolve()
    dry_dir = dry_dir.resolve()
    rows = []
    for rank in range(1, PAIR_COUNT + 1):
        sources = [
            ("① 원 녹음 48kHz · 전체 음량 일치", output_dir / f"pair_{rank:02d}_original48_matched.wav"),
            ("② 모델 입력 16kHz · 전체 음량 일치", bound_dir / "result" / "pairs" / f"pair_{rank:02d}_source_input_16k.wav"),
            ("③ 학습 모델 전체 출력 16kHz · 전체 음량 일치", bound_dir / "result" / "pairs" / f"pair_{rank:02d}_reconstruction.wav"),
            ("④ 리버브 전 dry 16kHz · 분석용 큰 증폭", dry_dir / "result" / "pairs" / f"dry_pair_{rank:02d}_harmonic_plus_noise.wav"),
        ]
        players = "\n".join(
            f'<label>{label}<audio controls preload="none" src="{html.escape(os.path.relpath(path, output_dir), quote=True)}"></audio></label>'
            for label, path in sources)
        raw_link = html.escape(os.path.relpath(original_dir / f"reference_{rank:02d}_original_48k.wav", output_dir), quote=True)
        rows.append(f'<section><h2>사전 선택 구간 {rank} · 같은 4초</h2>{players}'
                    f'<p><a href="{raw_link}">48kHz 원래 음량 파일 따로 열기</a></p></section>')
    markup = '''<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>대금 4종 공정 음량 비교</title>
<style>body{max-width:820px;margin:2rem auto;padding:0 1rem;color:#202020;background:#f7f7f5;font:17px/1.6 system-ui,sans-serif}h1{font-size:1.6rem}.note{background:#eaf1f4;padding:1rem;border-radius:10px}section{background:white;border:1px solid #ddd;border-radius:10px;margin:1.2rem 0;padding:1rem}h2{margin-top:0;font-size:1.15rem}label{display:block;margin-top:.8rem;font-weight:650}audio{display:block;width:100%;margin-top:.3rem}a{color:#075a80}</style></head><body>
<h1>대금 원음과 모델: 음량을 맞춘 4종 비교</h1>
<p class="note">모든 트랙은 같은 구간 4초이며 각각 전체 RMS를 약 −29.12 dBFS로 맞췄습니다. ①만 AI Hub 원 녹음의 48kHz 대역을 유지한 별도 청취 사본이고 ②·③·④는 16kHz입니다. 원본 파일은 건드리지 않았습니다. 전체 음량 일치는 시간에 따른 음량 변화·호흡·어택을 같게 만들지 않으므로 그 차이도 직접 들어 보세요. 세 구간은 모델 결과를 보기 전에 원음 기준으로 골랐습니다.</p>
<p><strong>④는 학습 모델의 최종 소리가 아닙니다.</strong> 리버브 전 내부 배음+잡음 신호를 들리도록 약 31–36dB 크게 증폭한 진단물입니다. 게임 BGM 후보나 음색 개선으로 해석하면 안 됩니다. 이 파일들은 이 Mac의 비공개 폴더에서만 재생하며 공유·업로드하지 마세요.</p>
''' + "\n".join(rows) + '''\n<p>듣기 순서: 각 구간에서 ①의 대금 음색·숨·첫 발음을 기억한 뒤 ②에서 16kHz 변환 손실, ③에서 모델 차이, ④에서 리버브 이전 내부 성분을 비교하세요. 이 화면은 연주를 재현하는 시험이며 새 악보에서 비브라토 시점을 정하는 능력은 시험하지 않습니다.</p></body></html>\n'''
    if "http:" in markup or "https:" in markup:
        raise FairListenError("remote_page_asset_forbidden")
    return markup.encode("utf-8")


def _write_new(path: Path, data: bytes) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0), 0o600)
    with os.fdopen(descriptor, "wb") as handle:
        handle.write(data)
    os.chmod(path, 0o600)


def create(original_dir: Path, bound_dir: Path, dry_dir: Path, output_dir: Path) -> dict:
    if not output_dir.is_absolute() or output_dir.exists() or output_dir.is_symlink():
        raise FairListenError("new_absolute_output_dir_required")
    try:
        parent = pilot._private_dir(output_dir.parent)
    except pilot.PilotError as exc:
        raise FairListenError("private_output_parent_invalid") from exc
    if parent != original_dir.parent.resolve(strict=True):
        raise FairListenError("output_must_be_private_reference_sibling")
    before, assets = _prior_inputs(original_dir, bound_dir, dry_dir)
    output_wavs = {}
    metrics = []
    for rank in range(1, PAIR_COUNT + 1):
        payload, row = _match_48k(assets[f"{rank}_raw48"]["pcm"])
        name = f"pair_{rank:02d}_original48_matched.wav"
        output_wavs[name] = payload
        metrics.append({"pair_number": rank, "matched_name": name,
                        "original_sha256": assets[f"{rank}_raw48"]["sha256"],
                        "matched_sha256": _sha(payload), "matched_bytes": len(payload), **row})
    page = _page(output_dir, original_dir, bound_dir, dry_dir)
    reserve = sum(len(item) for item in output_wavs.values()) + len(page) + MAX_JSON_BYTES
    if shutil.disk_usage(parent).free - reserve < MIN_FREE_AFTER:
        raise FairListenError("disk_reserve_below_8gib")
    # Rehash all immutable source/diagnostic inputs immediately before writing.
    again, current_assets = _prior_inputs(original_dir, bound_dir, dry_dir)
    if again != before or any(current_assets[key]["sha256"] != value["sha256"]
                              for key, value in assets.items()):
        raise FairListenError("prior_inputs_changed")
    output_dir.mkdir(mode=0o700)
    os.chmod(output_dir, 0o700)
    try:
        for name, data in output_wavs.items():
            _write_new(output_dir / name, data)
        _write_new(output_dir / "listen.html", page)
        manifest = {
            "schema": SCHEMA, "status": "complete_private_local_listen_only",
            "scope": "approved_local_research_only_not_game_output_or_redistribution",
            "pair_count": PAIR_COUNT, "seconds_per_pair": 4, "target_whole_clip_rms": TARGET_RMS,
            "original_48k_level": "new_listening_copy_gain_adjusted_original_untouched",
            "dry_role": "boosted_pre_reverb_diagnostic_not_final_model",
            "provenance": before,
            "prior_asset_digests": {key: {name: value[name] for name in ("sha256", "bytes")}
                                    for key, value in assets.items()},
            "matched_48k": metrics, "listen_html_sha256": _sha(page),
        }
        _write_new(output_dir / "fair_listen_manifest_private.json",
                   (json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode())
        if shutil.disk_usage(parent).free < MIN_FREE_AFTER:
            raise FairListenError("disk_reserve_below_8gib_after_write")
    except Exception:
        for item in output_dir.iterdir():
            if item.is_file() and not item.is_symlink():
                item.unlink()
        output_dir.rmdir()
        raise
    inspect(original_dir, bound_dir, dry_dir, output_dir)
    return {"status": "complete_private_local_listen_only", "pairs": PAIR_COUNT, "tracks": 4 * PAIR_COUNT}


def inspect(original_dir: Path, bound_dir: Path, dry_dir: Path, output_dir: Path) -> dict:
    try:
        root = pilot._private_dir(output_dir)
    except pilot.PilotError as exc:
        raise FairListenError("private_output_invalid") from exc
    if root.parent != pilot._private_dir(original_dir.parent):
        raise FairListenError("private_output_layout_invalid")
    manifest, _ = _document(root / "fair_listen_manifest_private.json")
    provenance, assets = _prior_inputs(original_dir, bound_dir, dry_dir)
    if (manifest.get("schema") != SCHEMA
            or manifest.get("status") != "complete_private_local_listen_only"
            or manifest.get("pair_count") != PAIR_COUNT
            or manifest.get("provenance") != provenance
            or manifest.get("prior_asset_digests") != {
                key: {name: value[name] for name in ("sha256", "bytes")}
                for key, value in assets.items()}):
        raise FairListenError("output_provenance_mismatch")
    rows = manifest.get("matched_48k")
    if not isinstance(rows, list) or len(rows) != PAIR_COUNT:
        raise FairListenError("output_asset_set_invalid")
    expected_files = {"listen.html", "fair_listen_manifest_private.json"}
    for rank, row in enumerate(rows, 1):
        name = f"pair_{rank:02d}_original48_matched.wav"
        if not isinstance(row, dict) or row.get("pair_number") != rank or row.get("matched_name") != name:
            raise FairListenError("output_asset_set_invalid")
        payload, samples = _wav(root / name, rate=48_000, frames=192_000)
        remade, metrics = _match_48k(assets[f"{rank}_raw48"]["pcm"])
        if (payload != remade or row.get("original_sha256") != assets[f"{rank}_raw48"]["sha256"]
                or row.get("matched_sha256") != _sha(payload) or row.get("matched_bytes") != len(payload)
                or any(row.get(key) != value for key, value in metrics.items())
                or len(samples) != 192_000):
            raise FairListenError("output_asset_mismatch")
        expected_files.add(name)
    page = pilot._private_file(root / "listen.html", max_bytes=64_000)
    if page != _page(root, original_dir, bound_dir, dry_dir) or _sha(page) != manifest.get("listen_html_sha256"):
        raise FairListenError("output_page_mismatch")
    if set(os.listdir(root)) != expected_files:
        raise FairListenError("output_asset_set_invalid")
    return {"status": "complete_private_local_listen_only", "pairs": PAIR_COUNT, "tracks": 4 * PAIR_COUNT}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("mode", choices=("create", "inspect"))
    parser.add_argument("--original48-dir", type=Path, required=True)
    parser.add_argument("--bound-dir", type=Path, required=True)
    parser.add_argument("--dry-dir", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if args.mode == "create":
            result = create(args.original48_dir, args.bound_dir, args.dry_dir, args.output_dir)
        else:
            result = inspect(args.original48_dir, args.bound_dir, args.dry_dir, args.output_dir)
    except FairListenError as exc:
        result = {"status": "error", "code": str(exc)}
        print(json.dumps(result))
        return 2
    except Exception:
        print(json.dumps({"status": "error", "code": "unexpected_private_fair_listen_failure"}))
        return 2
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    sys.exit(main())
