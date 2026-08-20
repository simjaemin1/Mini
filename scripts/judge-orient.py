#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""격자 판정기 확장 — 기울기 방향 히스토그램 + 전대역 스펙트럼.  [타 세션 지시 2026-08-19 3항]

왜 필요한가
  종전 판정기(judge-grid.py)는 **역격자 후보점 몇 군데만** 들여다봤다: 셀 격자(±27°)와
  세분 격자. 그래서 "색·음영 경로가 만든 **축 정렬**(0°/90°) 명암 블록"은 후보에 없어
  통과했다. 판정기가 보는 격자만 닫히고 안 보는 격자가 남은 것이다 — 이번이 세 번째다.
  ⇒ ⓐ 방향을 **전부** 훑고(히스토그램), ⓑ 주기를 **전 대역**(6~120px) 훑는다.

ⓐ 기울기 방향 히스토그램
  각 화소의 휘도 기울기 (gx,gy) 를 구해, **크기로 가중**한 방향 히스토그램을 만든다.
  방향은 180° 주기(선의 방향이라 부호 무의미). 등각 셀 변은 화면에서 ±26.57°
  (=atan(16/32)) 이므로, 0°/90° 봉우리는 **셀 격자가 아니다** — 축 정렬 자료의 흔적이다.
  봉우리 높이 = 그 방향 ±4° 평균 ÷ 전체 중앙값. 1.0 이면 방향 편향 없음.

ⓑ 전대역 스펙트럼 봉우리
  고역통과한 휘도의 파워 스펙트럼에서 주기 6~120px 대역의 **모든 방향·모든 주기**를 훑어
  같은 반지름 고리(같은 크기 블록 최댓값) 대비 최대 배수를 낸다. 어느 주기든 격자가 있으면 잡힌다.

자명 통과 금지 — 반례 4종
  ⓐ 0°/90° 인공 격자 주입 → 0°/90° 봉우리와 전대역 봉우리가 둘 다 떠야 한다
  ⓑ ±27° 등각 격자 주입    → ±27° 봉우리만 떠야 한다(방향을 **구분**하는지 증명)
  ⓒ 백색잡음               → 전부 ≈1 (허위 양성 없음)
  ⓓ 매끄러운 경사(격자 없음) → 전부 ≈1
"""
import sys, os, json
import numpy as np
from PIL import Image

ISO_DEG = np.degrees(np.arctan2(16.0, 32.0))     # 26.565° — 등각 셀 변
PAD = 1024


def lum(im):
    a = np.asarray(im.convert('RGB'), dtype=np.float64)
    return 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]


# ★★[계측기 수리 2026-08-19] 처음 판은 `np.convolve(...,'same')` 로 저역을 뽑았다.
#   그건 테두리를 **0 으로 채운다**. 그래서 그림 가장자리에 인공 계단이 서고, 그 계단은
#   당연히 **축 정렬(0°/90°)** 이라 방향 히스토그램을 지배했다. 실제로 반례가 잡아냈다:
#     매끄러운 경사(격자 0)가 0° 봉우리 101배, 등각 격자가 0°/90° 31배 — 전부 테두리였다.
#   ⇒ 흐림은 **가장자리 복제**로 패딩하고, 통계는 여유(3σ)를 잘라낸 안쪽에서만 낸다.
def _blur(y, sig):
    n = int(sig * 4) | 1
    x = np.arange(n) - n // 2
    k = np.exp(-0.5 * (x / sig) ** 2); k /= k.sum()
    p = n // 2
    z = np.pad(y, ((0, 0), (p, p)), mode='edge')
    z = np.apply_along_axis(lambda r: np.convolve(r, k, 'valid'), 1, z)
    z = np.pad(z, ((p, p), (0, 0)), mode='edge')
    return np.apply_along_axis(lambda c: np.convolve(c, k, 'valid'), 0, z)


def highpass(y, sig=6.0):
    hp = y - _blur(y, sig)
    m = int(sig * 3)
    return hp[m:-m or None, m:-m or None]


def bandpass(y, lo=3.0, hi=14.0):
    """★방향 히스토그램을 **고역통과**로 돌렸더니 세 판이 다 1.8~2.4배로 붙었다.
       원인: 기울기 크기의 대부분이 7~9px 짜리 **바위 결**이라, 50~60px 짜리 명암 블록이
       묻힌 것이다. 눈은 블록을 보는데 계측기는 결을 보고 있었다.
       ⇒ 블록이 사는 대역(대략 18~90px)만 남기는 띠통과로 본다. 결도 큰 음영도 뺀다."""
    z = _blur(y, lo) - _blur(y, hi)
    m = int(hi * 3)
    return z[m:-m or None, m:-m or None]


AMP_MIN = 0.30          # 계조. 이보다 약하면 '무늬 없음' — 작은 수끼리 나누지 않는다


# ── ⓐ 기울기 방향 히스토그램 ──────────────────────────────────────────────
def orient_hist(y, nbin=180, blur=1.2):
    """크기 가중 방향 히스토그램(180° 주기). 미세 잡음은 살짝 눌러서 **구조**만 본다."""
    z = _blur(y, blur)
    gy, gx = np.gradient(z)
    gx = gx[2:-2, 2:-2]; gy = gy[2:-2, 2:-2]      # gradient 의 한쪽차분 테두리도 버린다
    mag = np.hypot(gx, gy)
    m = mag > np.percentile(mag, 60)          # 평탄한 데서 나오는 무작위 방향은 뺀다
    # ★내용이 없으면 방향을 묻지 않는다. 매끄러운 경사(무늬 0)가 95배를 냈던 게
    #   '재는 값'이 아니라 '나누는 값'이 0 이라서였다.
    if m.sum() < 500 or float(np.std(z)) < AMP_MIN:
        return np.ones(nbin), np.linspace(0, 180, nbin, endpoint=False)
    # 기울기 방향 = 밝기 변화 방향. **모서리 선의 방향**은 그것과 직교하므로 90° 돌린다.
    ang = (np.degrees(np.arctan2(gy[m], gx[m])) + 90.0) % 180.0
    h, edges = np.histogram(ang, bins=nbin, range=(0, 180), weights=mag[m])
    h = h / max(h.sum(), 1e-9) * nbin          # 평균 1 로 정규화
    return h, (edges[:-1] + edges[1:]) / 2


def peak_at(h, ctr, deg, half=4.0):
    """그 방향 ±half° 평균. h 는 이미 **평균 1** 로 정규화돼 있으니 그대로가 배수다.
       ★중앙값으로 나눴더니 반례ⓑ(순수 ±27° 격자)에서 중앙값이 0 이 되어 7e8 이 나왔다 —
         재는 값이 아니라 나누는 값이 터진 것이다. 평균 1 정규화면 나눌 필요가 없다."""
    d = np.abs(((ctr - deg + 90.0) % 180.0) - 90.0)
    sel = d <= half
    if not sel.any(): return float('nan')
    return float(h[sel].mean())


# ── ⓑ 전대역 스펙트럼 봉우리 ──────────────────────────────────────────────
def power(y):
    hh, ww = y.shape
    w2 = np.hanning(hh)[:, None] * np.hanning(ww)[None, :]
    y = (y - y.mean()) * w2
    b = np.zeros((PAD, PAD)); b[:hh, :ww] = y
    # 창 합을 같이 돌려준다 — 봉우리를 **명도 단위 진폭**으로 되돌리는 데 쓴다.
    return np.fft.fftshift(np.abs(np.fft.fft2(b)) ** 2), float(w2.sum())


def band_peak(P, wsum, pmin=6.0, pmax=120.0, win=3, amp_min=0.15):
    """★배수만 보면 **내용이 없는 대역**에서 작은 수끼리 나눠 배수가 폭발한다.
       실제로 매끄러운 경사(격자 0)가 9e5 를 냈다 — 창(Hann)의 축 방향 누설이 바탕보다
       컸을 뿐이고, 그림에는 아무 무늬도 없었다.
       ⇒ 봉우리를 **명도 단위 진폭**(a ≈ 2√P / Σw)으로 되돌려, 눈에 안 보이는 크기
         (기본 0.15 계조)면 '무늬 없음'으로 본다. 배수와 진폭을 **둘 다** 낸다."""
    """주기 [pmin,pmax] 대역에서 (블록 최댓값 ÷ 같은 반지름 고리의 블록 최댓값 중앙값) 의 최대.
       ★봉우리를 블록 최댓값으로 읽으면 바탕도 같은 블록 최댓값이어야 한다 —
         안 그러면 백색잡음조차 4.7배가 나온다(judge-grid 에서 이미 겪은 덫)."""
    c = PAD // 2
    g = np.arange(PAD) - c
    gx, gy = np.meshgrid(g, g, indexing='xy')
    R = np.hypot(gx, gy)
    rlo, rhi = PAD / pmax, PAD / pmin
    # 블록 최댓값 지도 (2*win+1 정사각)
    from numpy.lib.stride_tricks import sliding_window_view
    Wv = sliding_window_view(P, (2 * win + 1, 2 * win + 1)).max(axis=(-1, -2))
    off = win
    Rm = R[off:off + Wv.shape[0], off:off + Wv.shape[1]]
    # ★내용이 **없는** 대역에서 작은 수끼리 나누면 배수가 폭발한다(반례ⓓ 매끄러운 경사가
    #   9e5 를 냈다 — 고역통과 뒤 그 대역엔 부동소수 찌꺼기뿐이었다). 바닥을 깐다.
    best = (1.0, 0.0, 0.0, 0.0)
    for r0 in np.arange(rlo, rhi, 2.0):
        ring = (Rm >= r0) & (Rm < r0 + 2.0)
        if ring.sum() < 24: continue
        v = Wv[ring]
        med = np.median(v)
        if med <= 0: continue
        i = int(np.argmax(v))
        amp = 2.0 * np.sqrt(max(v[i], 0.0)) / max(wsum, 1e-9)
        if amp < amp_min: continue          # 눈에 안 보이는 크기 — 배수를 낼 자격이 없다
        ratio = v[i] / med
        if ratio > best[0]:
            ys, xs = np.where(ring)
            rr = float(np.hypot(gx[off + ys[i], off + xs[i]], gy[off + ys[i], off + xs[i]]))
            ang = float((np.degrees(np.arctan2(gy[off + ys[i], off + xs[i]],
                                               gx[off + ys[i], off + xs[i]])) + 90.0) % 180.0)
            best = (float(ratio), PAD / max(rr, 1e-9), ang, float(amp))
    return best   # (배수, 주기px, 선 방향deg, 명도 진폭)


def measure(img, box):
    g0 = lum(img.crop(box))
    y = highpass(g0)
    h, ctr = orient_hist(bandpass(g0), blur=0.8)     # 블록은 띠통과로, 결은 빼고
    P, wsum = power(y)
    ratio, per, ang, amp = band_peak(P, wsum)
    # ★고정 각(0/90/±27)만 보면 안 된다. **경사면 위의 셀 격자는 ±27° 가 아니다** —
    #   기울기 g(m/셀)인 면에서 셀 축은 화면에서 atan2(16−32g, ±32) 로 눕는다.
    #   g=3 이면 ≈±68° 라 "축 정렬처럼" 보인다. 그래서 **자유 최강 방향**도 같이 낸다.
    top = int(np.argmax(h))
    return {'최강방향': float(ctr[top]), '최강배수': float(h[top]),
            '0°': peak_at(h, ctr, 0.0), '90°': peak_at(h, ctr, 90.0),
            '+27°': peak_at(h, ctr, ISO_DEG), '−27°': peak_at(h, ctr, -ISO_DEG),
            '전대역배수': ratio, '주기px': per, '방향deg': ang, '진폭계조': amp}


# ── 반례 생성기 ───────────────────────────────────────────────────────────
def syn_axis(w, h, per=54, amp=4.0):
    """0°/90° **판 블록** — 이번 결함(조각별 상수 AO)과 같은 종류다."""
    yy, xx = np.mgrid[0:h, 0:w]
    a = 128 + amp * (np.floor(xx / per) % 2) + amp * (np.floor(yy / per) % 2)
    return Image.fromarray(np.clip(np.dstack([a] * 3), 0, 255).astype(np.uint8))


def syn_iso(w, h, amp=4.0):
    """등각 셀 **판 블록**(±27°) — 방향을 구분하는지 보는 대조군."""
    yy, xx = np.mgrid[0:h, 0:w]
    a = np.full((h, w), 128.0)
    for u in ((xx / 64.0 + yy / 32.0), (-xx / 64.0 + yy / 32.0)):
        a += amp * (np.floor(u) % 2)
    return Image.fromarray(np.clip(np.dstack([a] * 3), 0, 255).astype(np.uint8))


def syn_noise(w, h, seed=7):
    rng = np.random.default_rng(seed)
    return Image.fromarray(rng.integers(100, 150, (h, w, 3), dtype=np.uint8))


def syn_ramp(w, h):
    """무늬가 **정말로 없는** 대조군 — 순수 평면.
       ★처음엔 여기에 sin(y/40) 을 넣어 뒀다. 주기 251px 짜리 가로 줄무늬라
         띠통과 대역에 5계조나 남았고, 판정기는 그걸 0° 무늬로 **옳게** 잡았다.
         계측기가 아니라 **반례가 틀렸던 것**이다."""
    yy, xx = np.mgrid[0:h, 0:w]
    a = 90 + 60 * (xx / w) + 25 * (yy / h)
    return Image.fromarray(np.clip(np.dstack([a] * 3), 0, 255).astype(np.uint8))


if __name__ == '__main__':
    args = sys.argv[1:]
    box = tuple(int(v) for v in os.environ.get('BOX', '560,380,760,530').split(','))
    w, h = box[2] - box[0], box[3] - box[1]
    z = (0, 0, w, h)
    rows = [(os.path.basename(a).rsplit('.', 1)[0], measure(Image.open(a), box)) for a in args]
    rows += [('반례ⓐ 0°/90° 인공격자', measure(syn_axis(w, h), z)),
             ('반례ⓑ ±27° 등각격자', measure(syn_iso(w, h), z)),
             ('반례ⓒ 백색잡음', measure(syn_noise(w, h), z)),
             ('반례ⓓ 매끄러운 경사', measure(syn_ramp(w, h), z))]
    keys = ['최강방향', '최강배수', '0°', '90°', '+27°', '−27°', '전대역배수', '진폭계조', '주기px', '방향deg']
    print('영역 %s   기울기 방향 봉우리(1.0=편향 없음) · 전대역(6~120px) 스펙트럼 봉우리' % (box,))
    print('%-24s' % '' + ''.join('%9s' % k for k in keys) + '   판정')
    out = {}
    for name, m in rows:
        axis = max(m['0°'], m['90°'])
        iso = max(m['+27°'], m['−27°'])
        v = []
        if m['최강배수'] >= 1.8: v.append('방향편향 %.0f° (%.1f배)' % (m['최강방향'], m['최강배수']))
        if axis >= 1.5: v.append('축정렬(0/90)')
        if iso >= 1.5: v.append('등각(±27)')
        if m['전대역배수'] >= 8: v.append('주기 %.0fpx·%.0f° (%.2f계조)' % (m['주기px'], m['방향deg'], m['진폭계조']))
        print('%-24s' % name[:24] + ''.join('%9.2f' % m[k] for k in keys) +
              ('   ' + ' · '.join(v) if v else '   격자 없음'))
        out[name] = m
    json.dump(out, open(os.environ.get('JSON', '/tmp/judge-orient.json'), 'w'), ensure_ascii=False, indent=1)
