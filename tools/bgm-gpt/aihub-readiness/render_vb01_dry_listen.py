#!/usr/bin/env python3
"""Three local-only VB01 dry-component listening files beside immutable pairs.

The chosen clips and random seeds come from the already-bound VB01 test.
Only the pre-reverb harmonic+noise component is newly saved. Existing 16 kHz
source/full WAVs are verified byte-for-byte and linked, never copied or
modified. Dry RMS is raised to the existing -29.12 dBFS listening target; its
large gain is disclosed. This is an analysis component, not the trained model's
final output or a game asset. All AI Hub derivatives remain local private.
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
import tempfile
import time
from typing import Any
import wave

import numpy as np

import bound_heldout_evaluation as bound
import bound_heldout_vibrato as vb
import diagnose_vibrato_components as components
import diagnose_vibrato_components_levelled as levelled
import mac_mps_ddsp_long_trial as trial
import mac_mps_ddsp_pilot as pilot


SCHEMA = "mini.aihub-71470-vb01-dry-listen.v1"
REPORT_NAME = "dry_listen_report.json"
BINDING_NAME = "checkpoint_binding.json"
PAGE_NAME = "listen.html"
TARGET_RMS = 0.035
MAX_DRY_GAIN = 512.0
MAX_PEAK = 0.9
EXPECTED_PAIRS = 3


class DryError(Exception):
    """Fixed error code that cannot expose a licensed source path."""


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _private_json(path: Path) -> tuple[dict[str, Any], str]:
    return bound._json_private(path, max_bytes=vb.MAX_REPORT_BYTES)


def _prepare_dry(audio: np.ndarray) -> tuple[bytes, dict[str, Any]]:
    if audio.shape != (pilot.WINDOW_SAMPLES,) or not np.all(np.isfinite(audio)):
        raise DryError("dry_waveform_invalid")
    raw = np.asarray(audio, dtype=np.float64)
    rms = float(np.sqrt(np.mean(raw * raw)))
    peak = float(np.max(np.abs(raw)))
    if rms < 1e-8 or peak <= 0:
        raise DryError("dry_component_too_quiet")
    gain = TARGET_RMS / rms
    if gain > MAX_DRY_GAIN or peak * gain > MAX_PEAK:
        raise DryError("dry_cannot_match_without_excess_gain_or_clipping")
    matched = (raw * gain).astype(np.float32)
    data = trial._wav_bytes(matched)
    return data, {
        "raw_dry_rms_dbfs": round(20 * math.log10(rms), 4),
        "dry_listening_gain_db": round(20 * math.log10(gain), 4),
        "matched_rms_dbfs": round(20 * math.log10(TARGET_RMS), 4),
        "matched_peak": round(peak * gain, 6),
    }


def _wav_digest(path: Path) -> dict[str, Any]:
    payload = pilot._private_file(path, max_bytes=bound.MAX_PAIR_BYTES)
    try:
        with wave.open(io.BytesIO(payload), "rb") as reader:
            valid = (reader.getnchannels() == 1 and reader.getsampwidth() == 2
                     and reader.getframerate() == pilot.SAMPLE_RATE
                     and reader.getnframes() == pilot.WINDOW_SAMPLES
                     and reader.getcomptype() == "NONE")
    except (EOFError, wave.Error) as exc:
        raise DryError("dry_wav_invalid") from exc
    if not valid:
        raise DryError("dry_wav_invalid")
    return {"sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}


def _reference48_contract(folder: Path, *, selection_sha: str,
                          vb_report_sha: str, vb_binding_sha: str) -> tuple[str, dict[str, dict[str, Any]]]:
    """Verify the separate, raw-level 48 kHz references before linking them."""
    pilot._private_dir(folder)
    manifest, manifest_sha = _private_json(folder / "reference_manifest_private.json")
    if (manifest.get("schema") != "mini.aihub-71470-vb01-48k-source-reference.v1"
            or manifest.get("selection_sha256") != selection_sha
            or manifest.get("bound_report_sha256") != vb_report_sha
            or manifest.get("bound_binding_sha256") != vb_binding_sha
            or manifest.get("reference_level") != "original_not_rms_matched"
            or manifest.get("prepared_crop_to_bound_pair_exact") is not True
            or manifest.get("source_to_16k_pcm_exact") is not True):
        raise DryError("reference48_manifest_mismatch")
    references = manifest.get("references")
    if not isinstance(references, list) or len(references) != EXPECTED_PAIRS:
        raise DryError("reference48_manifest_mismatch")
    digests = {}
    for rank in range(1, EXPECTED_PAIRS + 1):
        name = f"reference_{rank:02d}_original_48k.wav"
        rows = [item for item in references if item.get("pair_number") == rank]
        if len(rows) != 1 or rows[0].get("reference_name") != name:
            raise DryError("reference48_manifest_mismatch")
        payload = pilot._private_file(folder / name, max_bytes=2 * 4 * 48_000 + 4_096)
        try:
            with wave.open(io.BytesIO(payload), "rb") as reader:
                valid = (reader.getnchannels() == 1 and reader.getsampwidth() == 2
                         and reader.getframerate() == 48_000 and reader.getnframes() == 4 * 48_000
                         and reader.getcomptype() == "NONE")
        except (EOFError, wave.Error) as exc:
            raise DryError("reference48_wav_invalid") from exc
        digest = {"sha256": hashlib.sha256(payload).hexdigest(), "bytes": len(payload)}
        if (not valid or rows[0].get("reference_sha256") != digest["sha256"]
                or rows[0].get("reference_bytes") != digest["bytes"]):
            raise DryError("reference48_wav_mismatch")
        digests[name] = digest
    return manifest_sha, digests


def _page(pairs: list[dict[str, Any]], *, result_dir: Path,
          prior_pairs_dir: Path, reference48_dir: Path) -> bytes:
    rows = []
    for item in pairs:
        number = item["pair_number"]
        dry = html.escape(f"pairs/dry_pair_{number:02d}_harmonic_plus_noise.wav", quote=True)
        source = html.escape(os.path.relpath(
            prior_pairs_dir / f"pair_{number:02d}_source_input_16k.wav", result_dir), quote=True)
        full = html.escape(os.path.relpath(
            prior_pairs_dir / f"pair_{number:02d}_reconstruction.wav", result_dir), quote=True)
        reference48 = html.escape(os.path.relpath(
            reference48_dir / f"reference_{number:02d}_original_48k.wav", result_dir), quote=True)
        gain = item["dry_listening_gain_db"]
        rows.append(f"""<section><h2>사전 선택 비교 {number}</h2>
<p>리버브 전 dry에는 분석용으로 +{gain:.2f} dB 증폭을 적용했습니다. 네 파일은 모두 4초입니다. 48 kHz 원본은 원래 음량 그대로이고, 나머지 16 kHz 세 파일만 전체 RMS −29.12 dBFS로 비교합니다.</p>
<label>① AI Hub 원 48 kHz 녹음 (음량 미조정) <audio controls preload="none" src="{reference48}"></audio></label>
<label>② AI Hub 16 kHz 모델 입력 (음량 맞춤) <audio controls preload="none" src="{source}"></audio></label>
<label>③ 기존 학습 모델 전체 출력 (음량 맞춤) <audio controls preload="none" src="{full}"></audio></label>
<label>④ 리버브 전 배음+잡음, 학습 모델 내부의 dry 성분 (큰 증폭) <audio controls preload="none" src="{dry}"></audio></label></section>""")
    document = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>대금 VB01 dry 성분 비교 (16 kHz)</title>
<style>body{{font-family:-apple-system,system-ui,sans-serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.6;background:#f8f7f3;color:#1d1d1b}}section{{background:white;border:1px solid #ddd;border-radius:12px;padding:1rem;margin:1.2rem 0}}label{{display:block;margin:1rem 0}}audio{{display:block;width:100%}}</style></head><body>
<h1>대금 요성: 리버브 전 성분 비교</h1>
<p><strong>주의:</strong> dry는 학습된 모델의 최종 출력이 아닙니다. 큰 음량 증폭으로 들리게 만든 내부 배음+잡음 성분이며, 리버브·호흡·음색의 게임용 대안으로 승인된 것이 아닙니다.</p>
<p>①은 별도로 검증된 48 kHz 원본 파일을 상대 링크로 읽을 뿐 이 폴더에 복사하지 않았습니다. ②·③·④는 16 kHz·동일 RMS이며 원본보다 커질 수 있습니다. 세 비교 구간은 앞선 VB01 평가에서 모델 출력 보기 전에 고정됐습니다. 이 페이지는 로컬 전용이고 음원 공유는 금지됩니다.</p>
{''.join(rows)}</body></html>"""
    if "http:" in document or "https:" in document:
        raise DryError("remote_page_asset_forbidden")
    return document.encode("utf-8")


def _pair_plan(selection: dict[str, Any], report: dict[str, Any]) -> dict[int, dict[str, Any]]:
    planned = {item["planned_pair_rank"]: item for item in selection["records"]
               if item["planned_pair_rank"]}
    notes = report.get("private_pair_notes")
    if (set(planned) != set(range(1, EXPECTED_PAIRS + 1))
            or not isinstance(notes, list) or len(notes) != EXPECTED_PAIRS
            or any(note.get("status") != "saved" or note.get("planned_song_rank") != rank
                   or note.get("pair_number") != rank for rank, note in enumerate(notes, 1))):
        raise DryError("prior_pair_plan_invalid")
    return planned


def evaluate_and_bind(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                      upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                      component_dir: Path, levelled_dir: Path, reference48_dir: Path,
                      output_dir: Path,
                      minutes: int = 30) -> dict[str, Any]:
    if not 1 <= minutes <= 30:
        raise DryError("evaluation_limit")
    started = time.monotonic()
    deadline = started + minutes * 60
    try:
        with pilot._network_disabled(), trial._exclusive_private_lock(output_dir), trial._exclusive_private_lock(checkpoint_dir):
            pilot._private_dir(output_dir)
            if set(os.listdir(output_dir)) != {".trial.lock"}:
                raise DryError("output_not_fresh")
            pilot._check_disjoint_report_dir(output_dir, [source_manifest.parent, split_manifest.parent,
                label_zip.parent, upstream_root, checkpoint_dir, vb_dir, component_dir,
                levelled_dir, reference48_dir])
            pilot._check_free_space(output_dir)
            verify_kwargs = dict(source_manifest=source_manifest, split_manifest=split_manifest,
                label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                vb_dir=vb_dir, raw_components_dir=component_dir, output_dir=levelled_dir,
                _already_locked=True)
            if levelled.inspect_current_binding(**verify_kwargs) != "complete_bound_to_checkpoint":
                raise DryError("component_binding_invalid")
            selection, selection_sha = _private_json(vb_dir / vb.SELECTION_NAME)
            vb_report, vb_report_sha = _private_json(vb_dir / "result" / vb.REPORT_NAME)
            _, vb_binding_sha = _private_json(vb_dir / "result" / vb.BINDING_NAME)
            _, component_binding_sha = _private_json(component_dir / "result" / components.BINDING_NAME)
            _, levelled_binding_sha = _private_json(levelled_dir / "result" / levelled.BINDING_NAME)
            reference48_manifest_sha, reference48_digests = _reference48_contract(
                reference48_dir, selection_sha=selection_sha, vb_report_sha=vb_report_sha,
                vb_binding_sha=vb_binding_sha)
            pair_plan = _pair_plan(selection, vb_report)
            prior_pairs_dir = vb_dir / "result" / "pairs"
            prior_pair_digests = bound._pair_digests(vb_dir / "result", EXPECTED_PAIRS)
            source, source_sha, split, split_sha, _, heldout_dir = trial._private_inputs(
                source_manifest, split_manifest, output_dir, upstream_root)
            _, heldout_records = trial.validate_documents(source, source_sha, split)
            records = {item["output_file"]: item for item in heldout_records}
            before = bound._checkpoint_snapshot(checkpoint_dir)
            contract = bound._checkpoint_contract(before["_path"])
            bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
            training_sha = bound._verify_training_report(checkpoint_dir, contract)
            scripts = {name: _sha(path) for name, path in (
                ("dry", Path(__file__)), ("components", Path(components.__file__)),
                ("levelled", Path(levelled.__file__)), ("vb", Path(vb.__file__)),
                ("training", Path(trial.__file__)), ("binding_helper", Path(bound.__file__)),
            )}
            torch, DDSP, _, _ = trial._mac_mps_gate(output_dir, upstream_root)
            import ddsp.model as model_module
            checkpoint = torch.load(before["_path"], map_location="cpu", weights_only=True)
            bound._verify_contract(checkpoint, source_sha=source_sha, split_sha=split_sha)
            model, _ = trial._model_and_optimizer(torch, DDSP)
            model.load_state_dict(checkpoint["model_state"])
            model.eval()
            mean, std = contract["loudness_mean"], contract["loudness_std"]
            pending = Path(tempfile.mkdtemp(prefix=".pending_dry_", dir=output_dir))
            pending.chmod(0o700)
            pairs_dir = pending / "pairs"
            pairs_dir.mkdir(mode=0o700)
            notes = []
            for rank in range(1, EXPECTED_PAIRS + 1):
                if time.monotonic() >= deadline:
                    raise DryError("evaluation_time_cap")
                pilot._check_free_space(output_dir)
                selected = pair_plan[rank]
                record = records[selected["output_file"]]
                audio = trial._load_wav(heldout_dir, record)
                frame_start = selected["crop_start_frame_100hz"]
                excerpt = audio[frame_start * pilot.BLOCK_SIZE:
                                (frame_start + pilot.WINDOW_FRAMES) * pilot.BLOCK_SIZE]
                midpoint = (selected["event_start_seconds"] + selected["event_end_seconds"]) / 2
                item, source_mod = vb._conditioning(excerpt, frame_start, midpoint)
                if source_mod["state"] != selected["input64_state"]:
                    raise DryError("source_conditioning_replay_mismatch")
                _, pitch, loudness, _ = trial._tensors(torch, item, mean, std)
                # Selection records are in SHA order. The original evaluator's
                # seed is based on that record index, not pair rank.
                original_index = selection["records"].index(selected)
                torch.manual_seed(trial.SEED + 300_000 + original_index)
                outputs = components._capture_components(model, model_module, pitch, loudness, torch)
                source_pair, full_pair, _ = trial._matched_pair(excerpt, outputs["full_with_reverb"])
                for suffix, rendered in (("source_input_16k", source_pair),
                                          ("reconstruction", full_pair)):
                    existing = prior_pairs_dir / f"pair_{rank:02d}_{suffix}.wav"
                    if trial._wav_bytes(rendered) != pilot._private_file(existing, max_bytes=bound.MAX_PAIR_BYTES):
                        raise DryError("existing_pair_waveform_replay_mismatch")
                dry_bytes, metrics = _prepare_dry(outputs["harmonic_plus_noise"])
                dry_name = f"dry_pair_{rank:02d}_harmonic_plus_noise.wav"
                trial._atomic_private_bytes(pairs_dir, dry_name, dry_bytes, replace=False)
                notes.append({"pair_number": rank, **metrics})
            trial._fsync_directory(pairs_dir)
            if (levelled.inspect_current_binding(**verify_kwargs) != "complete_bound_to_checkpoint"
                    or _sha(vb_dir / vb.SELECTION_NAME) != selection_sha
                    or _sha(vb_dir / "result" / vb.REPORT_NAME) != vb_report_sha
                    or _sha(vb_dir / "result" / vb.BINDING_NAME) != vb_binding_sha
                    or _sha(component_dir / "result" / components.BINDING_NAME) != component_binding_sha
                    or _sha(levelled_dir / "result" / levelled.BINDING_NAME) != levelled_binding_sha
                    or _reference48_contract(reference48_dir, selection_sha=selection_sha,
                        vb_report_sha=vb_report_sha, vb_binding_sha=vb_binding_sha)
                        != (reference48_manifest_sha, reference48_digests)
                    or bound._pair_digests(vb_dir / "result", EXPECTED_PAIRS) != prior_pair_digests
                    or any(_sha(path) != scripts[name] for name, path in (
                        ("dry", Path(__file__)), ("components", Path(components.__file__)),
                        ("levelled", Path(levelled.__file__)), ("vb", Path(vb.__file__)),
                        ("training", Path(trial.__file__)), ("binding_helper", Path(bound.__file__))))):
                raise DryError("private_inputs_changed_during_dry_render")
            after = bound._checkpoint_snapshot(checkpoint_dir)
            bound._same_checkpoint(before, after)
            if bound._verify_training_report(checkpoint_dir, contract) != training_sha:
                raise DryError("training_report_changed_during_dry_render")
            pilot._check_free_space(output_dir)
            page = _page(notes, result_dir=pending, prior_pairs_dir=prior_pairs_dir,
                         reference48_dir=reference48_dir)
            trial._atomic_private_bytes(pending, PAGE_NAME, page, replace=False)
            report = {
                "schema": SCHEMA, "status": "dry_component_listen_ready",
                "scope": "local_private_listening_only_not_trained_final_output_not_game_asset",
                "pairs": notes, "pair_count": EXPECTED_PAIRS,
                "target_rms_dbfs": round(20 * math.log10(TARGET_RMS), 4),
                "source_full_and_48k_wavs": "existing_SHA_verified_relative_links_not_copies",
                "dry_component": "harmonic_plus_noise_before_learned_reverb_from_same_forward",
                "limitations": [
                    "dry_requires_large_gain_because_raw_component_is_much_quieter_than_final_output",
                    "large_gain_exposes_internal_component_not_a_safe_new_timbre_model",
                    "four_second_crops_truncate_GRU_phase_and_reverb_context",
                    "three_pairs_are_preselected_by_source_only_and_not_representative_of_24_crops",
                    "raw_48k_reference_is_not_RMS_matched_while_three_16k_tracks_are",
                ],
                "wall_seconds": round(time.monotonic() - started, 2),
            }
            trial._write_json(pending, REPORT_NAME, report, replace=False)
            _, report_sha = _private_json(pending / REPORT_NAME)
            dry_digests = {f"dry_pair_{rank:02d}_harmonic_plus_noise.wav":
                _wav_digest(pairs_dir / f"dry_pair_{rank:02d}_harmonic_plus_noise.wav")
                for rank in range(1, EXPECTED_PAIRS + 1)}
            binding = {
                "schema": SCHEMA, "status": "complete_bound_to_checkpoint",
                "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
                "label_zip_sha256": vb._label_sha(label_zip),
                "selection_sha256": selection_sha,
                "vb_report_sha256": vb_report_sha, "vb_binding_sha256": vb_binding_sha,
                "component_binding_sha256": component_binding_sha,
                "levelled_binding_sha256": levelled_binding_sha,
                "reference48_manifest_sha256": reference48_manifest_sha,
                "reference48_wav_digests": reference48_digests,
                "prior_pair_wav_digests": prior_pair_digests,
                "checkpoint_marker_sha256": before["marker_sha256"],
                "checkpoint_sha256": before["checkpoint_sha256"],
                "checkpoint_bytes": before["checkpoint_bytes"],
                "training_report_sha256": training_sha,
                "dry_report_sha256": report_sha,
                "dry_page_sha256": hashlib.sha256(page).hexdigest(),
                "dry_wav_digests": dry_digests,
                "script_sha256": scripts, "feature_sha256": trial.FEATURE_SHA256,
                "upstream_commit": pilot.UPSTREAM_SHA,
                "model_config": trial.MODEL_CONFIG,
                "conditioning": trial.CONDITIONING,
                "loudness_mean": mean, "loudness_std": std,
                "pair_count": EXPECTED_PAIRS,
                "scope": "local_private_listening_only_no_asset_publication",
            }
            trial._write_json(pending, BINDING_NAME, binding, replace=False)
            trial._fsync_directory(pending)
            if (output_dir / "result").exists():
                raise DryError("result_already_committed")
            os.replace(pending, output_dir / "result")
            trial._fsync_directory(output_dir)
            if inspect_current_binding(source_manifest=source_manifest, split_manifest=split_manifest,
                    label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
                    vb_dir=vb_dir, component_dir=component_dir, levelled_dir=levelled_dir,
                    reference48_dir=reference48_dir,
                    output_dir=output_dir, _already_locked=True) != "complete_bound_to_checkpoint":
                raise DryError("binding_self_check_failed")
            return {"status": "complete_bound_to_checkpoint", "private_dry_pairs": EXPECTED_PAIRS}
    except DryError:
        raise
    except Exception as exc:
        raise DryError("private_dry_render_internal_error") from exc


def inspect_current_binding(*, source_manifest: Path, split_manifest: Path, label_zip: Path,
                            upstream_root: Path, checkpoint_dir: Path, vb_dir: Path,
                            component_dir: Path, levelled_dir: Path,
                            reference48_dir: Path, output_dir: Path,
                            _already_locked: bool = False) -> str:
    def check() -> str:
        verify_kwargs = dict(source_manifest=source_manifest, split_manifest=split_manifest,
            label_zip=label_zip, upstream_root=upstream_root, checkpoint_dir=checkpoint_dir,
            vb_dir=vb_dir, raw_components_dir=component_dir, output_dir=levelled_dir,
            _already_locked=True)
        if levelled.inspect_current_binding(**verify_kwargs) != "complete_bound_to_checkpoint":
            return "component_binding_invalid"
        pilot._private_dir(output_dir)
        result = output_dir / "result"
        if not result.exists():
            return "incomplete_unbound"
        pilot._private_dir(result)
        report, report_sha = _private_json(result / REPORT_NAME)
        binding, _ = _private_json(result / BINDING_NAME)
        selection, selection_sha = _private_json(vb_dir / vb.SELECTION_NAME)
        prior_report, prior_report_sha = _private_json(vb_dir / "result" / vb.REPORT_NAME)
        _, vb_binding_sha = _private_json(vb_dir / "result" / vb.BINDING_NAME)
        _, component_binding_sha = _private_json(component_dir / "result" / components.BINDING_NAME)
        _, levelled_binding_sha = _private_json(levelled_dir / "result" / levelled.BINDING_NAME)
        reference48_manifest_sha, reference48_digests = _reference48_contract(
            reference48_dir, selection_sha=selection_sha,
            vb_report_sha=prior_report_sha, vb_binding_sha=vb_binding_sha)
        _pair_plan(selection, prior_report)
        pair_digests = bound._pair_digests(vb_dir / "result", EXPECTED_PAIRS)
        dry_digests = {f"dry_pair_{rank:02d}_harmonic_plus_noise.wav":
            _wav_digest(result / "pairs" / f"dry_pair_{rank:02d}_harmonic_plus_noise.wav")
            for rank in range(1, EXPECTED_PAIRS + 1)}
        page = pilot._private_file(result / PAGE_NAME, max_bytes=16_384)
        source, source_sha, split, split_sha, _, _ = trial._private_inputs(
            source_manifest, split_manifest, output_dir, upstream_root)
        trial.validate_documents(source, source_sha, split)
        checkpoint = bound._checkpoint_snapshot(checkpoint_dir)
        contract = bound._checkpoint_contract(checkpoint["_path"])
        bound._verify_contract(contract, source_sha=source_sha, split_sha=split_sha)
        expected = {
            "source_manifest_sha256": source_sha, "split_manifest_sha256": split_sha,
            "label_zip_sha256": vb._label_sha(label_zip), "selection_sha256": selection_sha,
            "vb_report_sha256": prior_report_sha, "vb_binding_sha256": vb_binding_sha,
            "component_binding_sha256": component_binding_sha,
            "levelled_binding_sha256": levelled_binding_sha,
            "reference48_manifest_sha256": reference48_manifest_sha,
            "reference48_wav_digests": reference48_digests,
            "prior_pair_wav_digests": pair_digests,
            "checkpoint_marker_sha256": checkpoint["marker_sha256"],
            "checkpoint_sha256": checkpoint["checkpoint_sha256"],
            "checkpoint_bytes": checkpoint["checkpoint_bytes"],
            "training_report_sha256": bound._verify_training_report(checkpoint_dir, contract),
            "dry_report_sha256": report_sha,
            "dry_page_sha256": hashlib.sha256(page).hexdigest(),
            "dry_wav_digests": dry_digests,
            "script_sha256": {name: _sha(path) for name, path in (
                ("dry", Path(__file__)), ("components", Path(components.__file__)),
                ("levelled", Path(levelled.__file__)), ("vb", Path(vb.__file__)),
                ("training", Path(trial.__file__)), ("binding_helper", Path(bound.__file__)))},
            "feature_sha256": trial._verify_feature_version(),
            "upstream_commit": pilot.UPSTREAM_SHA,
            "model_config": contract["model_config"],
            "conditioning": contract["conditioning"],
            "loudness_mean": contract["loudness_mean"],
            "loudness_std": contract["loudness_std"],
            "pair_count": EXPECTED_PAIRS,
        }
        if (binding.get("schema") != SCHEMA or binding.get("status") != "complete_bound_to_checkpoint"
                or report.get("schema") != SCHEMA or report.get("status") != "dry_component_listen_ready"
                or report.get("pair_count") != EXPECTED_PAIRS
                or len(report.get("pairs", [])) != EXPECTED_PAIRS
                or any(binding.get(key) != value for key, value in expected.items())):
            return "binding_invalid"
        return "complete_bound_to_checkpoint"
    try:
        if _already_locked:
            return check()
        with trial._exclusive_private_lock(checkpoint_dir):
            return check()
    except Exception:
        return "binding_invalid"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="action", required=True)
    for name in ("evaluate-and-bind", "inspect"):
        command = sub.add_parser(name)
        command.add_argument("--source-manifest", type=Path, required=True)
        command.add_argument("--split-manifest", type=Path, required=True)
        command.add_argument("--label-zip", type=Path, required=True)
        command.add_argument("--upstream-root", type=Path, required=True)
        command.add_argument("--checkpoint-dir", type=Path, required=True)
        command.add_argument("--vb-dir", type=Path, required=True)
        command.add_argument("--component-dir", type=Path, required=True)
        command.add_argument("--levelled-dir", type=Path, required=True)
        command.add_argument("--reference48-dir", type=Path, required=True)
        command.add_argument("--output-dir", type=Path, required=True)
        if name == "evaluate-and-bind":
            command.add_argument("--minutes", type=int, default=30)
    args = parser.parse_args()
    kwargs = {name: getattr(args, name) for name in (
        "source_manifest", "split_manifest", "label_zip", "upstream_root",
        "checkpoint_dir", "vb_dir", "component_dir", "levelled_dir",
        "reference48_dir", "output_dir")}
    if args.action == "inspect":
        print(json.dumps({"status": inspect_current_binding(**kwargs)}))
        return
    try:
        result = evaluate_and_bind(**kwargs, minutes=args.minutes)
    except DryError as exc:
        print(json.dumps({"status": "incomplete_unbound", "reason": str(exc)}))
        raise SystemExit(2) from None
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
