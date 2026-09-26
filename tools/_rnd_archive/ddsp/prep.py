#!/usr/bin/env python3
"""wav 폴더 → 학습 조각 [T353]  ·  `python3 tools/ddsp/prep.py <wav폴더> <출력폴더>`

무엇을 버리나 — **표로 낸다**(조용히 버리지 않는다):
  · 다성 구간: f0 신뢰도가 낮고 스펙트럼 피크가 여럿인 창 → 버린다(DDSP 는 단선율만 배운다)
  · 무음: 앞뒤를 자른다
  · 4초보다 짧게 남는 꼬리
"""
import json, os, sys


def main(src, out, sr=16000, seg=4.0):
    import numpy as np, librosa, soundfile as sf
    os.makedirs(out, exist_ok=True)
    rows, kept, dropped = [], 0, 0
    for fn in sorted(os.listdir(src)):
        if not fn.lower().endswith((".wav", ".flac", ".ogg", ".mp3")):
            continue
        y, _ = librosa.load(os.path.join(src, fn), sr=sr, mono=True)
        y, _ = librosa.effects.trim(y, top_db=35)
        f0, voiced, prob = librosa.pyin(y, sr=sr, fmin=80, fmax=2000, frame_length=1024)
        n = int(seg * sr)
        for i in range(0, max(0, len(y) - n + 1), n):
            chunk = y[i:i + n]
            fi0, fi1 = int(i / 1024 * 4), int((i + n) / 1024 * 4)
            v = voiced[fi0:fi1]
            p = np.nanmean(prob[fi0:fi1]) if fi1 > fi0 else 0.0
            vr = float(np.mean(v)) if len(v) else 0.0
            if vr < 0.6 or p < 0.5:                      # 단선율이 아니거나 음정이 안 잡힌다
                dropped += 1
                rows.append(dict(file=fn, at=round(i / sr, 2), keep=False,
                                 voiced=round(vr, 3), prob=round(float(p), 3)))
                continue
            sf.write(os.path.join(out, f"{os.path.splitext(fn)[0]}_{i // n:03d}.wav"), chunk, sr)
            kept += 1
            rows.append(dict(file=fn, at=round(i / sr, 2), keep=True,
                             voiced=round(vr, 3), prob=round(float(p), 3)))
    json.dump(dict(sr=sr, seg=seg, kept=kept, dropped=dropped, rows=rows),
              open(os.path.join(out, "_prep.json"), "w"), ensure_ascii=False, indent=1)
    print(f"조각 {kept}개 · 버림 {dropped}개 → {out}/_prep.json 에 왜 버렸는지 표로 있다")
    return 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(2)
    sys.exit(main(sys.argv[1], sys.argv[2]))
