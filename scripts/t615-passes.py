#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T615 ① 고개(= 고개 계곡) · 정본 무접촉 · 판정 0 — 재민 눈)
# =============================================================================
# 닛폰 동쪽(셀 x ≥ 1,250) 고개 수를 **한반도 고개 밀도**까지. 한반도 고개는 전부 계곡(`passes-to-valleys` · 24곳 · 폭 320)이라
#   여기서도 고개 = 산맥을 가로지르는 짧은 계곡이다(T550 ②ⓔ 문법: 산맥 중심선에 직각 · 바위가 끝난 뒤 3셀 더 · 폭 = 한반도 계곡 폭 p50).
#   목표 수 = round(한반도 고개 계곡 수 × 동쪽 뭍 ÷ 한반도 뭍)(인자) − 동쪽에 이미 있는 고개 계곡(이름에 '고개' · 협곡 아닌 것).
#   자리(새 수 0): 동쪽 산맥마다 "건널 자리"(이미 있는 계곡 · 고개 · 산맥을 자르는 강)로 나뉜 구간 중 **가장 긴 구간의 가운데**부터 하나씩 —
#     놓으면 그 구간이 둘로 쪼개지고 다시 가장 긴 구간을 고른다(고르게 퍼진다). 자리에 물(강 · 호수 · 띠)이 걸리면 그 구간은 건너뛴다.
# 쓰는 법: python3 scripts/t615-passes.py <안.json> <T524 dir> <out 안.json> --target <동쪽 고개 수> --width <폭>
# =============================================================================
import json, math, sys, numpy as np
PL, D, OUT = sys.argv[1:4]
arg = lambda k: sys.argv[sys.argv.index(k) + 1]
TARGET = int(arg('--target')); VW = float(arg('--width'))
SZ = 32; X0 = 1250 * SZ; EXT = 3
P = json.load(open(PL, encoding='utf-8'))
J = json.load(open(f'{D}/nippon.json')); N = J['N']; NY, NX = J['NY'], J['NX']
K = np.frombuffer(open(J['bin'], 'rb').read()[:N], np.uint8).reshape(NY, NX)
def segd(p, a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]; L = dx * dx + dy * dy
    t = 0 if L == 0 else max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
    return math.hypot(a[0] + t * dx - p[0], a[1] + t * dy - p[1])
def samples(g, step=SZ):
    out = []
    for a, b in zip(g['path'], g['path'][1:]):
        ax, ay = a['pos']; bx, by = b['pos']; L = math.hypot(bx - ax, by - ay); n = max(1, int(L // step))
        for k in range(n):
            t = k / n; out.append((ax + (bx - ax) * t, ay + (by - ay) * t, (a['width'] + (b['width'] - a['width']) * t) / 2, (bx - ax) / (L or 1), (by - ay) / (L or 1)))
    return out
def crossed(x, y, hw):
    for f in P['rivers'] + P.get('valleys', []):
        for a, b in zip(f['path'], f['path'][1:]):
            if segd((x, y), a['pos'], b['pos']) < hw + (a['width'] + b['width']) / 4: return True
    return False
east_pass = [v for v in P.get('valleys', []) if '고개' in v['name'] and not v.get('_canyon') and any(p['pos'][0] >= X0 for p in v['path'])]
need = TARGET - len(east_pass)
print(f'동쪽 고개 계곡 지금 {len(east_pass)} · 목표 {TARGET} → 더할 {need}')
R = [g for g in P['ridges'] if any(p['pos'][0] >= X0 for p in g['path'])]
S = {g['name']: samples(g) for g in R}
CUT = {g['name']: [i for i, (x, y, hw, *_ ) in enumerate(S[g['name']]) if crossed(x, y, hw)] for g in R}
skip = set(); rows = []
def stretches():
    out = []
    for g in R:
        s = S[g['name']]; cuts = sorted(set(CUT[g['name']])); edges = [-1] + cuts + [len(s)]
        for a, b in zip(edges, edges[1:]):
            lo, hi = a + 1, b - 1
            idx = [i for i in range(lo, hi + 1) if s[i][0] >= X0]
            if len(idx) < 2 or (g['name'], lo) in skip: continue
            out.append((len(idx), g['name'], lo, idx))
    return sorted(out, key=lambda t: (-t[0], t[1], t[2]))
k = 0
while k < need:
    st = stretches()
    if not st: print('구간 다 씀'); break
    L, gname, lo, idx = st[0]; s = S[gname]; i = idx[len(idx) // 2]; x, y, hw, ux, uy = s[i]
    nx, ny = -uy, ux; half = hw + EXT * SZ
    a = (x - nx * half, y - ny * half); b = (x + nx * half, y + ny * half)
    wet = False
    for t in np.linspace(0, 1, max(2, int(2 * half // SZ))):
        px, py = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t; cx, cy = int(px // SZ), int(py // SZ)
        if not (0 <= cx < NX and 0 <= cy < NY) or K[cy, cx] in (2, 3): wet = True; break
    if wet: skip.add((gname, lo)); continue
    k += 1; nm = f"{gname}고개{sum(1 for r in rows if r['ridge'] == gname) + 1}"
    P.setdefault('valleys', []).append({'name': nm, 'path': [{'pos': [round(a[0]), round(a[1])], 'width': round(VW)}, {'pos': [round(x), round(y)], 'width': round(VW)}, {'pos': [round(b[0]), round(b[1])], 'width': round(VW)}], '_t615': '고개'})
    CUT[gname].append(i)
    rows.append(dict(name=nm, ridge=gname, cell=[round(x / SZ), round(y / SZ)], stretch=L, len=round(2 * half / SZ)))
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(dict(target=TARGET, had=len(east_pass), rows=rows), open(OUT.replace('.json', '_passes.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'고개 {len(rows)}'); [print(f"  {r['name']} 셀 {r['cell']} · 구간 {r['stretch']}셀 · 길이 {r['len']}셀") for r in rows]
