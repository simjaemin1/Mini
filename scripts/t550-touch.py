#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 ② ★PM 손질 · 정본 무접촉)
# =============================================================================
# 재민 안 v1(`t550-make-plan.py` 의 결과 · 폭 규칙 **앞**)에 카드 §②의 PM 손질 넷을 얹는다. 폭은 손질 뒤 `t550-geom.py` → `t550-widths.py` 가 다시 단다.
#   ⓐ 강10 · 강15 · 강24 지움 — 호수7 · 호수2 · 호수6 이 동(후카가와·츠키가와)과 서(미도리가와) 두 물길로 흘러 나간다(호수 출구는 하나 · 분수계)
#   ⓑ 강2 를 후카가와에서 뗀다 — 발원을 산맥23 기슭(강2 가 산맥 몸을 빠져나오는 자리)으로 옮기고, 남은 물길이 후카가와와 (반폭 + 반폭 + 2셀) 이상 떨어지게
#   ⓒ 옛 막다른 하구 넷 — 츠키가와 · 사키가와 · 토오가와는 **가장 가까운 동해 띠**까지 곧게 잇는다(길에 다른 강이 먼저 있으면 거기서 합류).
#      미도리가와는 남으로 강42 의 발원까지 이어 강42 에 든다(→ 토오가와 → 동해)
#   (ⓓ 협곡 · ⓔ 고개→계곡은 폭이 선 뒤 `t550-canyons.py` · `passes-to-valleys.js`)
# 자: 바다 띠 = T524 자 칸 `kind == 2`(서버 `WATER_TILES` 와 같은 것) · 새 수 0(간격 = 반폭 + 반폭 + 2셀 — t549 자의 "닿음"과 같은 자).
# 쓰는 법: python3 scripts/t550-touch.py <v1 안.json> <T524 디렉터리(띠)> <손질 안.json>   → 옆에 *_touch.json(한 일 표)
# =============================================================================
import json, math, sys
import numpy as np
P = json.load(open(sys.argv[1], encoding='utf-8')); TD = sys.argv[2]; OUT = sys.argv[3]
J = json.load(open(f'{TD}/nippon.json', encoding='utf-8')); raw = open(J['bin'], 'rb').read(); N = J['N']
KIND = np.frombuffer(raw[:N], np.uint8).reshape(J['NY'], J['NX']); SZ = 32; NY, NX = KIND.shape
log = []
R = {r['name']: r for r in P['rivers']}
G = {g['name']: g for g in P['ridges']}
XY = lambda p: (p['pos'][0], p['pos'][1])
def seg_d(px, py, a, b):
    ax, ay = a; bx, by = b; dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - ax - dx * t, py - ay - dy * t), t
def dist_path(px, py, f):
    best = (1e18, 0.0)
    for a, b in zip(f['path'], f['path'][1:]):
        d, t = seg_d(px, py, XY(a), XY(b))
        if d < best[0]: best = (d, a['width'] + (b['width'] - a['width']) * t)
    return best   # (거리, 그 자리 폭)
def densify(a, b, step=320):
    n = max(1, int(math.hypot(b[0] - a[0], b[1] - a[1]) // step))
    return [[round(a[0] + (b[0] - a[0]) * k / n), round(a[1] + (b[1] - a[1]) * k / n)] for k in range(1, n + 1)]

# ⓐ 지움
for n in ('강10', '강15', '강24'):
    if n in R: P['rivers'] = [r for r in P['rivers'] if r['name'] != n]; log.append(f'ⓐ {n} 지움(호수 출구 둘 · 분수계)')
R = {r['name']: r for r in P['rivers']}

# ⓑ 강2 떼기
k2, fk, g23 = R['강2'], R['후카가와'], G['산맥23']
pts = k2['path']
inside = [dist_path(*XY(p), g23)[0] <= dist_path(*XY(p), g23)[1] / 2 for p in pts]
# 강2 의 시작(후카가와 쪽)에서 하구 쪽으로 — 산맥 몸 안의 마지막 점 = 기슭
start_is_fk = dist_path(*XY(pts[0]), fk)[0] < dist_path(*XY(pts[-1]), fk)[0]
seq = list(range(len(pts))) if start_is_fk else list(range(len(pts)))[::-1]
lastin = max((i for i, j in enumerate(seq) if inside[j]), default=None)
cut = seq[lastin] if lastin is not None else seq[0]
keep = seq[seq.index(cut):]
def far_ok(p, w):
    d, wf = dist_path(*XY(p), fk); return d >= wf / 2 + w / 2 + 2 * SZ
while keep and not far_ok(pts[keep[0]], pts[keep[0]]['width']): keep = keep[1:]
newpath = [pts[i] for i in keep]
if not start_is_fk: newpath = newpath[::-1]
dmin = min(dist_path(*XY(p), fk)[0] - dist_path(*XY(p), fk)[1] / 2 - p['width'] / 2 for p in newpath)
log.append(f'ⓑ 강2 발원 → 산맥23 기슭 {XY(newpath[0] if start_is_fk else newpath[-1])} · 점 {len(pts)} → {len(newpath)} · 후카가와와 가장 가까운 물가 사이 {dmin / SZ:.1f}셀(≥ 2)')
k2['path'] = newpath

# ⓒ 막다른 하구 잇기
band = (KIND == 2)
by, bx = np.nonzero(band)
BC = np.stack([bx * SZ + SZ // 2, by * SZ + SZ // 2], 1)
def mouth_end(f):   # 넓은 끝 = 하구(옛 강은 폭이 발원 → 하구로 넓다)
    return (len(f['path']) - 1, 'end') if f['path'][-1]['width'] >= f['path'][0]['width'] else (0, 'start')
def hits_other(a, b, me, w):
    """a→b 직선 위에서 다른 강 몸에 처음 닿는 자리(없으면 None) — 그 강 반폭 + 내 반폭."""
    L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L // 64))
    for k in range(1, n + 1):
        x, y = a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n
        for o in P['rivers']:
            if o is me: continue
            d, wo = dist_path(x, y, o)
            if d <= wo / 2 + w / 2: return [round(x), round(y)], o['name']
    return None
def extend_to_sea(nm):
    f = R[nm]; i, side = mouth_end(f); m = XY(f['path'][i]); w = f['path'][i]['width']
    # 가장 가까운 띠 칸(유클리드) — 그 칸 안쪽으로 2셀 더(띠 바다에 확실히 든다)
    d2 = (BC[:, 0] - m[0]) ** 2 + (BC[:, 1] - m[1]) ** 2; j = int(np.argmin(d2)); tgt = BC[j].tolist()
    L = math.sqrt(float(d2[j])); ux, uy = (tgt[0] - m[0]) / (L or 1), (tgt[1] - m[1]) / (L or 1)
    tgt = [round(tgt[0] + ux * 2 * SZ), round(tgt[1] + uy * 2 * SZ)]
    h = hits_other(m, tgt, f, w); why = '동해 띠'
    if h: tgt, why = h[0], f'강 {h[1]} 합류(띠 앞에서 먼저 닿음)'
    add = [{'pos': q, 'width': w} for q in densify(m, tgt)]
    f['path'] = (f['path'] + add) if side == 'end' else (add[::-1] + f['path'])
    rock = sum(1 for q in densify(m, tgt, 32) if 0 <= q[1] // SZ < NY and 0 <= q[0] // SZ < NX and KIND[q[1] // SZ, q[0] // SZ] == 4)
    log.append(f'ⓒ {nm} 하구 {m} → {tgt} · {L / SZ:.0f}셀 · {why} · 길의 바위 {rock}셀(있으면 협곡 몫)')
    return dict(name=nm, frm=m, to=tgt, cells=round(L / SZ), why=why, rock=rock)
ext = [extend_to_sea(n) for n in ('츠키가와', '사키가와', '토오가와')]
# 미도리가와 → 강42 발원
f, g = R['미도리가와'], R['강42']; i, side = mouth_end(f); m = XY(f['path'][i]); w = f['path'][i]['width']
# 강42 는 양끝 폭이 같다(340 · 340) — 하구 = 토오가와에 닿는 끝, 발원 = 먼 끝
_t = R['토오가와']; src = max((XY(g['path'][0]), XY(g['path'][-1])), key=lambda q: dist_path(q[0], q[1], _t)[0])
add = [{'pos': q, 'width': w} for q in densify(m, src)]
f['path'] = (f['path'] + add) if side == 'end' else (add[::-1] + f['path'])
rock = sum(1 for q in densify(m, src, 32) if KIND[q[1] // SZ, q[0] // SZ] == 4)
L = math.hypot(src[0] - m[0], src[1] - m[1])
log.append(f'ⓒ 미도리가와 하구 {m} → 강42 발원 {src} · {L / SZ:.0f}셀 · 강42 → 토오가와 → 동해 · 길의 바위 {rock}셀')
ext.append(dict(name='미도리가와', frm=m, to=src, cells=round(L / SZ), why='강42 발원', rock=rock))
P.setdefault('_t550', {})['touch'] = log
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump({'log': log, 'ext': ext}, open(OUT.replace('.json', '_touch.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for l in log: print(l)
