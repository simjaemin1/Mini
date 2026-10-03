#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 ① 숲 · 정본 무접촉 · 판정 0 — 재민 눈)
# =============================================================================
# 닛폰 동쪽(셀 x ≥ 1,250) 숲 면적 %를 **한반도와 같은 자로 잰 한반도 값**까지 — 자잘 숲 규칙(`plan-small-forests.js` · T580) 그대로:
#   소외(물 ≥ 180셀 그리고 숲 ≥ 180셀)의 **가장 깊은 점**에 · 반경 = 덩이 내접 반경 × 0.8 을 [40, 90]셀로 · 타원 찌그러뜨림 · 밀도 1.4~1.8(같은 해시)
#   · 마을 중심 55 + 반경/2 셀 안 금지 · 기존 숲과 (그 숲 반경 + 반경 + 70)셀 · 물 · 바위 위 중심 금지.
#   다른 점 하나(보고에 적는다): 저 기계는 소외 덩이마다 정해진 수(내접 반경/60 · 최대 4)를 놓고 끝나지만, 여기는 **면적 목표**까지
#   하나 놓을 때마다 숲 거리를 다시 재고 가장 깊은 점을 다시 고른다. 소외(물 · 숲 둘 다)가 다 메워져도 모자라면 같은 규칙으로 "숲 ≥ 180셀"만 본다(2단).
#   숲 면적 % = 바다 띠 밖 셀 중 숲 타원 안 셀(합집합) — 한반도도 같은 셈(`t616 dens`).
# 쓰는 법: python3 scripts/t615-forests.py <안.json> <T524 dir> <out 안.json> --target <%>
# =============================================================================
import json, math, sys, numpy as np
from scipy import ndimage
PL, D, OUT = sys.argv[1:4]
TARGET = float(sys.argv[sys.argv.index('--target') + 1])
SZ = 32; X0C = 1250
DW = DF = 180; R_MIN, R_MAX = 40, 90; VIL_CLEAR = 55; MIN_SEP = 70   # plan-small-forests.js
P = json.load(open(PL, encoding='utf-8'))
J = json.load(open(f'{D}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']
K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(NY, NX)
def stroke(mask, a, b, wa, wb):
    r = max(wa, wb) / 2
    x0, x1 = int(max(0, (min(a[0], b[0]) - r) // SZ)), int(min(NX - 1, (max(a[0], b[0]) + r) // SZ))
    y0, y1 = int(max(0, (min(a[1], b[1]) - r) // SZ)), int(min(NY - 1, (max(a[1], b[1]) + r) // SZ))
    if x1 < x0 or y1 < y0: return
    gx, gy = np.meshgrid(np.arange(x0, x1 + 1) * SZ + SZ / 2, np.arange(y0, y1 + 1) * SZ + SZ / 2)
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = np.clip(((gx - a[0]) * dx + (gy - a[1]) * dy) / (L or 1), 0, 1)
    mask[y0:y1 + 1, x0:x1 + 1] |= np.hypot(a[0] + t * dx - gx, a[1] + t * dy - gy) < (wa + (wb - wa) * t) / 2
WATER = (K == 3) | (K == 2)
for f in P['rivers']:
    if f.get('_t615'):   # 이 판에서 더한 지류(T524 바탕에 아직 없다)
        for a, b in zip(f['path'], f['path'][1:]): stroke(WATER, a['pos'], b['pos'], a['width'], b['width'])
ROCK = K == 4; LAND = K != 2
def ell(F, f):
    cx, cy = f['center'][0] / SZ, f['center'][1] / SZ; rx, ry = (f.get('rx') or 4000) / SZ, (f.get('ry') or 3000) / SZ
    x0, x1 = max(0, int(cx - rx)), min(NX, int(cx + rx) + 1); y0, y1 = max(0, int(cy - ry)), min(NY, int(cy + ry) + 1)
    if x1 <= x0 or y1 <= y0: return
    gx, gy = np.meshgrid(np.arange(x0, x1) + .5, np.arange(y0, y1) + .5)
    F[y0:y1, x0:x1] |= ((gx - cx) / rx) ** 2 + ((gy - cy) / ry) ** 2 <= 1
FOR = np.zeros((NY, NX), bool)
for f in P['forests']: ell(FOR, f)
EAST = np.zeros((NY, NX), bool); EAST[:, X0C:] = True
pct = lambda: 100 * (FOR & LAND & EAST).sum() / (LAND & EAST).sum()
dW = ndimage.distance_transform_edt(~WATER)
VS = [(v['x'] / SZ, v['y'] / SZ) for v in P.get('villages', [])]
print(f'동쪽 숲 {pct():.1f}% · 목표 {TARGET}%')
added = []; skip = {}; stage = 1; tried = set()
while pct() < TARGET:
    dF = ndimage.distance_transform_edt(~FOR)
    neg = LAND & ~WATER & ~ROCK & EAST & (dF >= DF) & ((dW >= DW) if stage == 1 else True)
    if not neg.any():
        if stage == 1: stage = 2; continue
        print('소외 다 씀'); break
    inner = ndimage.distance_transform_edt(neg)
    order = np.argsort(-inner, axis=None)
    ok = None
    for idx in order:
        cy, cx = divmod(int(idx), NX); inr = inner[cy, cx]
        if inr <= 0: break
        if (cx, cy) in tried: continue
        r = max(R_MIN, min(R_MAX, round(inr * 0.8)))
        why = None
        if cx < r or cy < r or cx >= NX - r or cy >= NY - r: why = '존 밖'
        elif WATER[cy, cx]: why = '물 위'
        elif ROCK[cy, cx]: why = '바위 위'
        elif any(math.hypot(vx - cx, vy - cy) < VIL_CLEAR + r * 0.5 for vx, vy in VS): why = '마을'
        else:
            for f in P['forests']:
                fr = max(f.get('rx') or 0, f.get('ry') or 0) / SZ
                if math.hypot(f['center'][0] / SZ - cx, f['center'][1] / SZ - cy) < fr + r + MIN_SEP: why = '기존 숲'; break
        if why: skip[why] = skip.get(why, 0) + 1; tried.add((cx, cy)); continue
        ok = (cx, cy, r, inr); break
    if not ok:
        if stage == 1: stage = 2; continue
        print('자리 다 씀'); break
    cx, cy, r, inr = ok
    h = ((cx * 374761393 + cy * 668265263) % (1 << 32) >> 8) % 1000 / 1000
    rx, ry = round(r * (0.75 + h * 0.5)), round(r * (0.75 + (1 - h) * 0.5))
    f = {'name': f'새숲{len(added) + 1}', 'center': [cx * SZ + 16, cy * SZ + 16], 'rx': rx * SZ, 'ry': ry * SZ, 'densityMult': round(1.4 + h * 0.4, 2), '_t615': f'숲({stage}단)'}
    P['forests'].append(f); ell(FOR, f)
    added.append(dict(name=f['name'], cell=[cx, cy], rx=rx, ry=ry, stage=stage, inr=round(float(inr)), pct=round(pct(), 2)))
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(target=TARGET, rows=added, skip=skip, final=pct()), open(OUT.replace('.json', '_forests.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'숲 {len(added)}(1단 {sum(1 for a in added if a["stage"] == 1)} · 2단 {sum(1 for a in added if a["stage"] == 2)}) → 동쪽 {pct():.1f}% · 건너뜀 {skip}')
