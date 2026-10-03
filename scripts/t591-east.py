#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T591 ④ 넓힌 동쪽 땅 채우기 **안** · 정본 무접촉 · 판정 0 — 재민이 에디터로 고친다)
# =============================================================================
# 존 폭을 넓히면(닛폰 5000 → 7000 · 베링 16000 → 17000) 해안선 띠가 동쪽으로 물러나, 옛 해안에서 바다로 들던 강의 하구가
#   **뭍 한가운데서 끝난다**(막다른 하구). 이 안은 그 강들을 **그대로 연장**한다 — T550 ②ⓒ 문법(`t550-touch.py extend_to_sea`):
#   하구(폭이 넓은 끝)에서 가장 가까운 새 띠 칸까지 곧게 · 띠 안으로 2셀 더 · 길에 다른 강이 먼저 닿으면 거기서 합류 · 폭은 하구 폭 그대로.
#   대상 = 옛 판에서 하구가 띠(바다)에 닿아 있었고(하구 반폭 + 2셀 안에 띠 칸) 새 판에서는 닿지 않는 강. 새 수 0(반폭 + 2셀 = T549 자).
#   숲 · 호수 · 짧은 강은 **안 그린다**(재민 그림 몫) — 새 땅의 빈 몫은 표(물 없는 · 자원 사막)로만.
# 쓰는 법: python3 scripts/t591-east.py <존> <옛 T524 디렉터리> <새 T524 디렉터리> <안.json(그 존 절)>  → 옆에 *_east.json(표)
# =============================================================================
import json, math, sys, numpy as np
Z, OLD, NEW, OUT = sys.argv[1:5]
ROOT = __file__.rsplit('/scripts/', 1)[0]
SZ = 32
def load(d):
    J = json.load(open(f'{d}/{Z}.json')); N = J['N']
    return J, np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(J['NY'], J['NX'])
JO, KO = load(OLD); JN, KN = load(NEW)
NY, NX = KN.shape
P = json.load(open(f'{ROOT}/server/hanbando-terrain.json', encoding='utf-8'))[Z]
XY = lambda p: p['pos']
def band_near(K, x, y, r):
    cx, cy = int(x // SZ), int(y // SZ); R = int(math.ceil(r / SZ))
    y0, y1, x0, x1 = max(0, cy - R), min(K.shape[0], cy + R + 1), max(0, cx - R), min(K.shape[1], cx + R + 1)
    return bool((K[y0:y1, x0:x1] == 2).any()) if y1 > y0 and x1 > x0 else True   # 존 밖이면 바다로 본다
def mouth(f):
    a, b = f['path'][0], f['path'][-1]
    return (len(f['path']) - 1, 'end') if b['width'] >= a['width'] else (0, 'start')
by, bx = np.nonzero(KN == 2); BC = np.stack([bx * SZ + SZ // 2, by * SZ + SZ // 2], 1)
def seg_d(p, a, b):
    ax, ay = a; bx_, by_ = b; dx, dy = bx_ - ax, by_ - ay; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / L)); return math.hypot(ax + t * dx - p[0], ay + t * dy - p[1])
def hits_other(m, tgt, me, w):
    n = max(1, int(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) // SZ))
    for k in range(1, n + 1):
        q = (m[0] + (tgt[0] - m[0]) * k / n, m[1] + (tgt[1] - m[1]) * k / n)
        for g in P['rivers']:
            if g is me: continue
            for a, b in zip(g['path'], g['path'][1:]):
                if seg_d(q, XY(a), XY(b)) < (a['width'] + b['width']) / 4 + w / 2: return [round(q[0]), round(q[1])], g['name']
    return None
rows = []
for f in P['rivers']:
    i, side = mouth(f); m = XY(f['path'][i]); w = f['path'][i]['width']; r = w / 2 + 2 * SZ
    if not (0 <= m[0] < NX * SZ and 0 <= m[1] < NY * SZ): continue          # 경계 접합 끝(옆 존) — 무접촉
    if not band_near(KO, m[0], m[1], r) or band_near(KN, m[0], m[1], r): continue
    d2 = (BC[:, 0] - m[0]) ** 2 + (BC[:, 1] - m[1]) ** 2; j = int(np.argmin(d2)); tgt = BC[j].tolist(); L = math.sqrt(float(d2[j]))
    ux, uy = (tgt[0] - m[0]) / (L or 1), (tgt[1] - m[1]) / (L or 1); tgt = [round(tgt[0] + ux * 2 * SZ), round(tgt[1] + uy * 2 * SZ)]
    h = hits_other(m, tgt, f, w); why = '새 바다 띠'
    if h: tgt, why = h[0], f'강 {h[1]} 합류'
    n = max(1, int(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) // 256))
    add = [{'pos': [round(m[0] + (tgt[0] - m[0]) * k / n), round(m[1] + (tgt[1] - m[1]) * k / n)], 'width': w} for k in range(1, n + 1)]
    f['path'] = (f['path'] + add) if side == 'end' else (add[::-1] + f['path'])
    rows.append(dict(name=f['name'], frm=m, to=tgt, cells=round(math.hypot(tgt[0] - m[0], tgt[1] - m[1]) / SZ), width=w, why=why))
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(zone=Z, rows=rows), open(OUT.replace('.json', '_east.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'{Z}: 하구가 뭍에 남은 강 {len(rows)} — 연장 합 {sum(r["cells"] for r in rows)}셀')
for r in rows: print(f'  {r["name"]} 하구 {r["frm"]} → {r["to"]} · {r["cells"]}셀 · 폭 {r["width"]} · {r["why"]}')
