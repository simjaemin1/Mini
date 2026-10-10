#!/usr/bin/env python3
"""Private B1 A/B: apply the pinned checkpoint's native FIR to B1's saved dry PCM.

This is post-render native FIR, not a second decoder pass. The source dry PCM16
is quantized, so the wet file must not be claimed bit-identical to a native
reverb render driven by the unquantized in-memory decoder output.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import wave


SCRATCH_ROOT = Path('/Users/simjaemin1/Mini/_bgm/gpt')
DEFAULT_OUTPUT_DIR = SCRATCH_ROOT / '새선율_시험/음색_시험/공간감'
RND = Path('/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01/_bgm_rnd')
SOURCE = RND / 'ddsp-gugak-public-daegeum-runtime-r1-20261010-075800-b1-final-c-private'
LEGACY = Path('/Users/simjaemin1/.codex/worktrees/durango-mini-bgm-rnd-01/tools/ddsp-gugak-public-runtime/ddsp_gugak_public_runtime.py')
PYTORCH_ROOT = RND / 'ddsp-gugak-public-source-r1/ddsp-pytorch'
CHECKPOINT = RND / 'ddsp-gugak-public-daegeum-checkpoint-audit-r1/daegeum.pth'
REFERENCE = Path('/Users/simjaemin1/Mini/_bgm/gpt/새선율_시험/비공개_전체곡_실험/새선율_8마디_대금모델_끝음약비브라토_B1_권리미확인_비공개.m4a')
OUT_NAME = 'B1_체크포인트고유FIR_공간감만_권리미확인_비공개.m4a'
REPORT_NAME = 'B1_체크포인트고유FIR_공간감만_제작정보.json'
PIN = {
    LEGACY: '3d160f3d9021d3d1c302901554e8d04546c4965f02bf919ab5655cd927771799',
    PYTORCH_ROOT / 'components/reverb.py': '68d21b2df51fd6c98612831983928f16bdb64f31b002ff904a9f906b5ee29b91',
    CHECKPOINT: 'cc73b645a9c4de934ec463246527fe5f1b16c783688ef3f2face53e67f547f28',
    SOURCE / 'runtime_report.json': '84d5b481e357fc8c4469aa7c36d92bf51fdad1024922118955cf5aa0e79ecaed',
    SOURCE / 'published_daegeum_decoder_dry_authorial_gate.wav': 'c74bce36480206cfd3123b8ac3ca5975fe31dfb4a645502ef3fe97cfb22d9d4d',
    REFERENCE: '1e892c40c2025baccd13424d0c7fb9e7ec5dc48d22054f79109a3fb63703ecb4',
}


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def loudness(path: Path) -> tuple[float, float]:
    proc = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path),
                           '-filter_complex', 'ebur128=peak=true', '-f', 'null', '-'],
                          check=True, capture_output=True, text=True)
    summaries = re.findall(r'Summary:\s*Integrated loudness:\s*I:\s*([-\d.]+) LUFS.*?True peak:\s*Peak:\s*([-\d.]+) dBFS',
                           proc.stderr, flags=re.S)
    if not summaries:
        raise RuntimeError('ffmpeg did not return an integrated loudness and true-peak summary')
    return tuple(map(float, summaries[-1]))


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=DEFAULT_OUTPUT_DIR,
                        help='private Mini/_bgm/gpt scratch directory; never the repository')
    args = parser.parse_args(argv)
    output_dir = args.output_dir.expanduser().resolve()
    if SCRATCH_ROOT not in output_dir.parents:
        raise RuntimeError('output must stay in private Mini/_bgm/gpt scratch, outside the repository')
    output_dir.mkdir(parents=True, exist_ok=True)
    out = output_dir / OUT_NAME
    report_path = output_dir / REPORT_NAME
    if out.exists() or report_path.exists():
        raise RuntimeError('output already exists; preserve the earlier audition')
    for path, expected in PIN.items():
        if sha(path) != expected:
            raise RuntimeError(f'provenance SHA mismatch: {path}')
    source_report = json.loads((SOURCE / 'runtime_report.json').read_text())
    if source_report['actions_performed']['learned_reverb_called'] is not False:
        raise RuntimeError('source B1 must be the dry-only version')
    if source_report['license_limits']['render'] != 'R&D-only; no game/public distribution clearance':
        raise RuntimeError('checkpoint rights gate changed')
    with wave.open(str(SOURCE / 'published_daegeum_decoder_dry_authorial_gate.wav'), 'rb') as wav:
        if (wav.getnchannels(), wav.getframerate(), wav.getsampwidth(), wav.getnframes()) != (1, 16000, 2, 307200):
            raise RuntimeError('B1 dry PCM dimensions changed')
        import numpy as np
        dry = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float32) / 32768.0
    with (SOURCE / 'score_controls_250hz.csv').open(newline='') as handle:
        frames = list(csv.DictReader(handle))
    if len(frames) != 4800:
        raise RuntimeError('B1 control length changed')
    spec = importlib.util.spec_from_file_location('pinned_ddsp_gugak_runtime', LEGACY)
    assert spec and spec.loader
    legacy = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(legacy)
    wet, reverb_info = legacy.render_checkpoint_native_reverb_cpu(
        dry.tolist(), frames, ddsp_pytorch_root=PYTORCH_ROOT, checkpoint=CHECKPOINT)
    if len(wet) <= len(dry) or not all(math.isfinite(v) for v in wet):
        raise RuntimeError('native FIR failed to produce a finite full tail')
    score_wet = np.asarray(wet[:len(dry)], dtype=np.float32)
    # Score-length comparison only. Fade the last 20 ms of room tail to zero to
    # prevent a hard cutoff; this is explicit post-processing, not the model.
    fade_samples = 320
    fade = np.linspace(1.0, 0.0, fade_samples, dtype=np.float32)
    score_wet[-fade_samples:] *= fade
    if np.max(np.abs(score_wet)) >= 1.0:
        raise RuntimeError('unscaled wet signal clips')
    scratch = output_dir / f'.B1_native_FIR_unscaled_{os.getpid()}.wav'
    attempt_output = output_dir / f'.B1_native_FIR_attempt_{os.getpid()}.m4a'
    if scratch.exists() or attempt_output.exists():
        raise RuntimeError('private temporary output already exists; refusing to overwrite')
    legacy.write_pcm16_wav(scratch, score_wet.tolist())
    reference_lufs, reference_tp = loudness(REFERENCE)
    unscaled_lufs, _ = loudness(scratch)
    gain_db = reference_lufs - unscaled_lufs
    try:
        for attempt in range(2):
            if attempt_output.exists():
                attempt_output.unlink()
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y',
                            '-i', str(scratch), '-af', f'volume={gain_db:.7f}dB',
                            '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '128k',
                            '-metadata', 'comment=Private R&D only; DDSP-Gugak checkpoint rights uncleared; native FIR applied to saved B1 dry PCM16',
                            str(attempt_output)], check=True)
            measured_lufs, measured_tp = loudness(attempt_output)
            if abs(measured_lufs - reference_lufs) <= 0.10:
                break
            gain_db += reference_lufs - measured_lufs
        if abs(measured_lufs - reference_lufs) > 0.10 or measured_tp > -0.5:
            raise RuntimeError('loudness matching or true peak failed')
        report = {
            'status': 'private_RnD_only_unreviewed',
            'description': 'Checkpoint-native learned FIR applied to saved B1 dry PCM16, after decoder; no retraining or source audio read; final 20 ms room-tail fade and 19.2 s trim for A/B.',
            'rights': 'DDSP-Gugak checkpoint game/public rights unconfirmed; do not use in game or publish.',
            'score_seconds': 19.2, 'sample_rate_hz': 44100, 'codec': 'AAC',
            'source_dry_pcm_sha256': sha(SOURCE / 'published_daegeum_decoder_dry_authorial_gate.wav'),
            'reference_b1_m4a_sha256': sha(REFERENCE),
            'native_FIR_component_sha256': sha(PYTORCH_ROOT / 'components/reverb.py'),
            'checkpoint_sha256': sha(CHECKPOINT), 'native_FIR_info': reverb_info,
            'wet_full_tail_seconds_before_trim': len(wet) / 16000,
            'gain_db_on_entire_score_length': gain_db,
            'reference_integrated_lufs': reference_lufs, 'wet_integrated_lufs': measured_lufs,
            'reference_true_peak_dbfs': reference_tp, 'wet_true_peak_dbfs': measured_tp,
            'output_sha256': sha(attempt_output),
            'caveat': 'The source dry WAV is PCM16, not the unquantized decoder output. This only isolates checkpoint-native FIR spatial processing; it cannot repair the model timbre by itself.'
        }
        # link() fails if a concurrent process created the name; no published
        # audition is ever overwritten by an iteration or a rerun.
        os.link(attempt_output, out)
        with report_path.open('x', encoding='utf-8') as handle:
            handle.write(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + '\n')
        print(json.dumps({'output': str(out), 'report': str(report_path), 'lufs': measured_lufs, 'true_peak': measured_tp}, ensure_ascii=False))
    finally:
        if scratch.exists():
            scratch.unlink()
        if attempt_output.exists():
            attempt_output.unlink()


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'private native FIR B1 failed: {exc}', file=sys.stderr)
        raise
