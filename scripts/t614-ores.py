#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 ②+ 바다 위 광맥 옮김 표 · 관측 전용 · 정본 무접촉 · 수 무변)
# 바다 띠·물 위에 앉은 광맥 중심을 **가장 가까운 뭍 칸**으로 — 자리 규칙은 `plan-ore-clusters.js` 자잘(R0 ≤ 12셀) 그대로:
#   ⓐ 중심 = 물(띠 + 손그림 물) 아님 · 카드 "뭍 칸" 이라 바위도 아님  ⓑ 땅 비율 lf(±gR·4셀 상자 · 물·바위 아닌 몫) ≥ 0.25
#   ⓒ 다른 광맥과 거리 ≥ max(22, (r_i + r_j) × 0.55)셀(MINOR_MIN_SEP · 비례 간격) — 이미 옮긴 것은 옮긴 자리로 잰다 · 반경 · 광종 · 이름 무변
# 쓰는 법: python3 scripts/t614-ores.py <coast.json(t604-coast-shift 출력)> <kind.u8(t614-mask)> <NX> <NY> <안.json> <존> <out.json>
import json, sys, math, numpy as np
C = json.load(open(sys.argv[1])); K = np.fromfile(sys.argv[2], np.uint8).reshape(int(sys.argv[4]), int(sys.argv[3]))
P = json.load(open(sys.argv[5], encoding='utf-8')); Z = sys.argv[6]; OUT = sys.argv[7]
NY, NX = K.shape; SZ = 32
land = (K == 0)
LI = np.pad(land.astype(np.int32), ((1, 0), (1, 0))).cumsum(0).cumsum(1)
def lf(cx, cy, g):
    x0, y0, x1, y1 = max(0, cx - g), max(0, cy - g), min(NX - 1, cx + g), min(NY - 1, cy + g)
    s = LI[y1 + 1, x1 + 1] - LI[y0, x1 + 1] - LI[y1 + 1, x0] + LI[y0, x0]
    return s / ((x1 - x0 + 1) * (y1 - y0 + 1))
ores = P[Z]['ores']
pos = {o['name']: [o['center'][0] / SZ, o['center'][1] / SZ, o['radius'] / SZ] for o in ores}
sea = C['zones'][Z]['rows'][0]['canon']['detail']['ores']
rows = []
for s in sea:
    nm = s['name']; cx0, cy0, r = pos[nm]; gR = max(1, round(r / 4)) * 4
    best = None
    for R in range(1, 400):
        cand = []
        for dy in range(-R, R + 1):
            for dx in (range(-R, R + 1) if abs(dy) == R else (-R, R)):
                cx, cy = int(cx0) + dx, int(cy0) + dy
                if not (0 <= cx < NX and 0 <= cy < NY) or not land[cy, cx]: continue
                d = math.hypot(cx + 0.5 - cx0, cy + 0.5 - cy0); cand.append((d, cy, cx))
        for d, cy, cx in sorted(cand):
            if best and d >= best[0]: break
            if lf(cx, cy, gR) < 0.25: continue
            ok = all(math.hypot(q[0] - (cx + .5), q[1] - (cy + .5)) >= max(22, (q[2] + r) * 0.55) for n2, q in pos.items() if n2 != nm)
            if ok: best = (d, cx, cy)
        if best and best[0] <= R: break
    if best:
        d, cx, cy = best; pos[nm] = [cx + 0.5, cy + 0.5, r]
        rows.append({'name': nm, 'mineral': s.get('mineral'), 'r': round(r, 1), 'from': [round(cx0, 1), round(cy0, 1)], 'to': [cx, cy], 'toPx': [cx * SZ + SZ // 2, cy * SZ + SZ // 2], 'moved': round(d, 1), 'lf': round(lf(cx, cy, gR), 2)})
    else: rows.append({'name': nm, 'from': [cx0, cy0], 'to': None})
json.dump(rows, open(OUT, 'w'), ensure_ascii=False, indent=1)
for r in rows: print(r)
