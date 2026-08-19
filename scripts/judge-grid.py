#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""산 표면의 **격자 흔적**을 재는 계측기.  [타 세션 판정 2026-08-09 지시 3]

  "판정은 '차이 픽셀 %' 금지. 산 영역 음영 채널의 FFT/자기상관에서
   32px 및 세분 주기 봉우리 높이를 현행 대 새판으로 비교하라."

무엇을 재나 — **파워 스펙트럼의 역격자 봉우리**
  화면에서 셀 격자는 아이소 다이아몬드 격자다. 셀 모서리 (i,j)→(i+1,j) 는 화면에서
  (+32,+16), (i,j)→(i,j+1) 은 (−32,+16). 실공간 격자 기저 u=(32,16), v=(−32,16).
  격자 무늬가 있으면 그 **역격자** 주파수 f (f·u, f·v 가 정수)에 뾰족한 봉우리가 선다.
    f1 = (1/64, 1/32) = (0.015625, 0.03125) cyc/px  → 28.6px 주기
    f2 = (−1/64, 1/32)
  세분(sub) 격자는 그 sub 배 주파수다.
  봉우리 높이 = (그 자리 파워) / (같은 |f| 고리의 중앙값 파워). **배수**로 낸다 — 1.0 이면 없음.

왜 자기상관이 아니라 스펙트럼인가  [계측기 수리 2026-08-19]
  자기상관으로 먼저 짰다가 두 번 틀렸다.
    ① 족(族)의 **최댓값**을 썼더니 후보점이 많은 세분자일수록 아무 그림에서나 커졌다(다중비교).
       실제로 sub14 로 재면 gsub3 로 구운 그림도 10σ 가 나왔다 — 그 그림에 **없는** 주기다.
    ② 그래서 **평균**으로 바꿨더니 이번엔 A 의 진짜 철망(눈에 뻔히 보이는)이 7.7σ 로 묽어졌다.
  둘 다 원인은 하나다: 자기상관의 바탕은 |d| 가 같아도 방향마다 크게 달라 기준이 안 선다.
  스펙트럼에서는 격자가 **델타 봉우리**로 서고 바탕이 매끈해서, 같은 반지름 고리 중앙값이
  정직한 기준이 된다.

자명 통과 금지 — 반례 3종
  ⓐ 인공 격자 주입: 그림 위에 셀 격자선을 얹는다 → 배수가 크게 뛰어야 한다(감도 증명).
  ⓑ 백색잡음: 배수 ≈ 1 이어야 한다(허위 양성 없음 증명).
  ⓒ **없는 주기**(어느 판도 안 쓰는 세분자): 모든 실제 그림에서 ≈ 1 이어야 한다.
     ①의 버그를 잡아낸 반례라 상시로 같이 잰다.
"""
import sys, os, json
import numpy as np
from PIL import Image

U = (32.0, 16.0)             # 셀 격자 기저 (실공간, 화면 px)
V = (-32.0, 16.0)
PAD = 1024                   # 스펙트럼 격자(0채움) — 주파수 분해능 1/1024 cyc/px
WIN = 3.0                    # 봉우리 검색 반경(bin). 창(≈400px)이 만드는 봉우리 폭 ≈ 2.6bin
EXCL = 7.0                   # 바탕 고리에서 뺄 봉우리 주변 반경(bin)


def lum(im):
    a = np.asarray(im.convert('RGB'), dtype=np.float64)
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


def highpass(y, sig=6.0):
    """큰 음영(산 형태)을 지운다. σ=6 이면 주기 18px 위쪽만 깎여 셀(28.6px)·세분(4.8px) 다 남는다."""
    n = int(sig * 4) | 1
    x = np.arange(n) - n // 2
    k = np.exp(-0.5 * (x / sig) ** 2); k /= k.sum()
    lo = np.apply_along_axis(lambda r: np.convolve(r, k, 'same'), 1, y)
    lo = np.apply_along_axis(lambda c: np.convolve(c, k, 'same'), 0, lo)
    return y - lo


def power(y):
    """Hann 창 → 0채움 → |FFT|². 창을 안 씌우면 테두리 불연속이 십자 줄무늬를 만든다."""
    h, w = y.shape
    y = (y - y.mean()) * (np.hanning(h)[:, None] * np.hanning(w)[None, :])
    b = np.zeros((PAD, PAD)); b[:h, :w] = y
    return np.fft.fftshift(np.abs(np.fft.fft2(b)) ** 2)


def recip(scale):
    """역격자 기저. f1·u = 1, f1·v = 0 을 푼다(scale: 세분이면 1/sub)."""
    M = np.array([[U[0] * scale, U[1] * scale], [V[0] * scale, V[1] * scale]])
    return np.linalg.inv(M).T        # 행이 f1, f2


def targets(scale, fmax=0.45):
    """1차 근처의 역격자점들 — 격자가 있으면 **반드시** 여기 선다."""
    R = recip(scale)
    out = []
    for a in (-1, 0, 1):
        for b in (-1, 0, 1):
            if a == 0 and b == 0: continue
            f = a * R[0] + b * R[1]
            if 0.004 < np.hypot(*f) <= fmax:
                out.append((float(f[0]), float(f[1])))
    return out


_RR = None
def radii():
    global _RR
    if _RR is None:
        g = np.arange(PAD) - PAD // 2
        gx, gy = np.meshgrid(g, g, indexing='xy')
        _RR = np.hypot(gx, gy)
    return _RR


def peak_ratio(P, f, excl_pts):
    """봉우리 배수 = (±WIN bin 안 최대 파워) / (같은 반지름 고리의 중앙값 파워).
       고리에서는 **모든 후보 역격자점 주변**을 뺀다 — 봉우리로 바탕을 재면 안 된다."""
    cx = PAD // 2
    bx, by = f[0] * PAD, f[1] * PAD
    r = float(np.hypot(bx, by))
    if r < 5 or r > PAD // 2 - 12: return float('nan')
    w = int(np.ceil(WIN))
    ix, iy = int(round(bx)), int(round(by))
    pk = float(P[cx + iy - w: cx + iy + w + 1, cx + ix - w: cx + ix + w + 1].max())
    # ★★바탕도 **같은 크기 블록의 최댓값**으로 재야 한다.  [계측기 수리 2026-08-19]
    #   봉우리를 7×7 최댓값으로 읽고 바탕을 화소별 중앙값으로 읽으면, 파워가 지수분포인
    #   **백색잡음조차** 배수 4.7 이 나온다(49개 중 최댓값 ÷ 중앙값). 실제로 그렇게 나왔다.
    #   같은 블록 최댓값끼리 견주면 잡음의 기댓값이 1 로 돌아온다.
    bgs = []
    for k in range(360):
        th = k * np.pi / 180.0
        qx, qy = r * np.cos(th), r * np.sin(th)
        if any(np.hypot(qx - px * PAD, qy - py * PAD) < EXCL for (px, py) in excl_pts): continue
        jx, jy = int(round(qx)), int(round(qy))
        if abs(jx) > PAD // 2 - w - 2 or abs(jy) > PAD // 2 - w - 2: continue
        bgs.append(P[cx + jy - w: cx + jy + w + 1, cx + jx - w: cx + jx + w + 1].max())
    bg = float(np.median(bgs)) if bgs else float('nan')
    return pk / bg if bg > 0 else float('nan')


def measure(img, box, subs=(6,), extra=(11,)):
    y = highpass(lum(img.crop(box)))
    P = power(y)
    allp = targets(1.0) + [t for s in set(list(subs) + list(extra)) for t in targets(1.0 / s)]
    out = {'셀32px': float(np.median([peak_ratio(P, f, allp) for f in targets(1.0)]))}
    for s in subs:
        out['세분%d' % s] = float(np.median([peak_ratio(P, f, allp) for f in targets(1.0 / s)]))
    for s in extra:
        out['반례ⓒ없는%d' % s] = float(np.median([peak_ratio(P, f, allp) for f in targets(1.0 / s)]))
    return out


def inject(img, box, amp=5.0):
    """반례ⓐ — 셀 격자선을 인공으로 얹는다. 계측기가 이걸 못 잡으면 계측기가 틀린 것이다."""
    a = np.asarray(img.crop(box).convert('RGB'), dtype=np.float64)
    h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    for u in ((xx / 64.0 + yy / 32.0), (-xx / 64.0 + yy / 32.0)):
        a += amp * (np.abs(u - np.round(u)) < 0.04)[:, :, None]
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def noise(box, seed=7):
    rng = np.random.default_rng(seed)
    h, w = box[3] - box[1], box[2] - box[0]
    return Image.fromarray(rng.integers(90, 130, (h, w, 3), dtype=np.uint8))


if __name__ == '__main__':
    args = sys.argv[1:]
    box = tuple(int(v) for v in os.environ.get('BOX', '250,400,650,700').split(','))
    subs = tuple(int(v) for v in os.environ.get('SUBS', '6').split(','))
    z = (0, 0, box[2] - box[0], box[3] - box[1])
    rows = [(os.path.basename(a).rsplit('.', 1)[0], measure(Image.open(a), box, subs)) for a in args]
    base = Image.open(args[-1])
    rows.append(('반례ⓐ 인공격자주입', measure(inject(base, box), z, subs)))
    rows.append(('반례ⓑ 백색잡음', measure(noise(box), z, subs)))
    keys = list(rows[0][1].keys())
    print('영역 %s   봉우리 배수 = 역격자점 파워 / 같은 반지름 고리 중앙값 (1.0 = 격자 없음)' % (box,))
    print('%-24s' % '' + ''.join('%13s' % k for k in keys) + '    판정')
    for name, m in rows:
        det = any(m[k] >= 3.0 for k in keys if not k.startswith('반례'))
        print('%-24s' % name[:24] + ''.join('%13.2f' % m[k] for k in keys) +
              ('    격자 검출' if det else '    격자 없음'))
    json.dump(dict(rows), open(os.environ.get('JSON', '/tmp/judge-grid.json'), 'w'),
              ensure_ascii=False, indent=1)
