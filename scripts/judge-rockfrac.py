#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""가시 사면에서 **바위가 차지하는 비중**을 잰다.  [타 세션 ② 2026-08-20]

  "사면에서 바위 비율이 대략 어느 정도인지 숫자로 보고해라 — 절반 이하가 되어야 한다."

무엇이 '산 화소'인가
  눈대중으로 상자를 치지 않는다. **산을 끈 그림과 켠 그림의 차이**가 산이 그린 화소다.
  (mtOff 손잡이 — 정본 경로를 그대로 켰다 껐다 한다.)

무엇이 '바위'인가
  이 판의 재질은 두 극이다: 바위 = 회색(채도 낮음), 수관 = 초록(녹색 우세).
  ⇒ 화소마다 채도 s 와 녹색 우세 g−max(r,b) 를 보고 가른다. 경계는 넉넉히 잡고,
    **애매한 화소는 따로 센다**(어느 쪽으로도 몰아 주지 않는다).

자명 통과 금지 — 반례 2종
  ⓐ 순수 회색판 → 바위 100%
  ⓑ 순수 숲색판 → 바위 0%
  분류기가 두 극을 못 가르면 숫자를 낼 자격이 없다.
"""
import sys, os
import numpy as np
from PIL import Image


def classify(rgb):
    a = rgb.astype(np.float64)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mx = a.max(-1); mn = a.min(-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-9), 0.0)
    green = g - np.maximum(r, b)
    rock = (sat < 0.12) | (green < 2.0)
    forest = (~rock) & (green >= 4.0)
    return rock, forest


def main(on_path, off_path):
    on = np.asarray(Image.open(on_path).convert('RGB'))
    off = np.asarray(Image.open(off_path).convert('RGB'))
    if on.shape != off.shape:
        sys.exit('두 그림 크기가 다르다')
    diff = np.abs(on.astype(int) - off.astype(int)).sum(-1)
    m = diff > 24                      # 산이 실제로 그린 화소
    # UI 는 화면 왼쪽 띠·상단 막대에 몰려 있다 — 산 영역과 안 겹치게 잘라 낸다
    m[:270, :] = False; m[:, :70] = False; m[850:, :] = False
    n = int(m.sum())
    if n < 5000:
        sys.exit('산 화소가 너무 적다(%d) — 카메라가 산을 안 보고 있다' % n)
    rock, forest = classify(on)
    nr = int((rock & m).sum()); nf = int((forest & m).sum())
    amb = n - nr - nf
    print('산 화소 %d' % n)
    print('  바위    %8d  %5.1f%%' % (nr, nr / n * 100))
    print('  수관·풀 %8d  %5.1f%%' % (nf, nf / n * 100))
    print('  애매     %8d  %5.1f%%' % (amb, amb / n * 100))
    print('  ⇒ 바위 비중 %.1f%%  — %s' % (nr / n * 100, '통과(절반 이하)' if nr / n < 0.5 else '실패(절반 초과)'))
    # 반례
    gray = np.full((64, 64, 3), 122, np.uint8)
    leaf = np.dstack([np.full((64, 64), 40, np.uint8), np.full((64, 64), 92, np.uint8),
                      np.full((64, 64), 38, np.uint8)])
    for nm, img, want in [('반례ⓐ 순수 회색판', gray, 1.0), ('반례ⓑ 순수 숲색판', leaf, 0.0)]:
        rk, _ = classify(img)
        f = rk.mean()
        print('  %s → 바위 %.0f%% %s' % (nm, f * 100, 'OK' if abs(f - want) < 0.01 else '★분류기 이상'))
    return nr / n


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
