#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 폭 규칙 · 정본 무접촉)
# 쓰는 법: python3 scripts/t550-widths.py <안.json> <t550-geom 표.json> <폭 얹은 안.json>  → 옆에 *_widths.json(표)
# 폭 규칙(새 수 0 — 한반도 정본 분포에서 맞춘 식 둘):
#   강  w(s) = 120 + 1.60·U^0.780   U = 그 점 위쪽에 쌓인 물길 길이(셀) = 발원부터 거리 + 위에서 합류한 지류의 U 전부
#            (한반도 강 35의 발원 폭 중앙값 120 · 하구 폭 ~ 길이 맞춤 · Hack 법칙 꼴) · 경계 접합 끝(한반도에서 들어오는 강)은 그 자리 폭을 고정(T408)
#   산맥 w_max = 260.4·L^0.253 · 양끝 20% 구간은 0.42·w_max 로 좁아진다(한반도 산맥 11 의 프로파일)
# 방향(하구 끝) 고르기: 옛 강(폭 기울기 있음) = 넓은 끝 · 새 강 = 경계/바다 띠 > 다른 강 > 호수 > 뭍 순으로 닿는 끝.
import json, math, sys, collections
P = json.load(open(sys.argv[1], encoding='utf-8')); G = json.load(open(sys.argv[2], encoding='utf-8')); OUT = sys.argv[3]
SZ = 32; A, B, W0 = 1.60, 0.780, 120; RA, RB, REND = 260.4, 0.253, 0.42
gr = {r['name']: r for r in G['rivers']}
rivers = {r['name']: r for r in P['rivers']}
SEAM = {'시로가와', '달재천', '솔여울', '미르내', '쿠로가와'}  # 한반도 조각·경계 강은 손대지 않는다(T408 짝)
def pts(r): return [(p['pos'][0], p['pos'][1], p['width']) for p in r['path']]
def cum(ps):
    c = [0.0]
    for a, b in zip(ps, ps[1:]): c.append(c[-1] + math.hypot(b[0]-a[0], b[1]-a[1]) / SZ)
    return c
def rank(e):
    k = e.split(' ')[0]
    return {'경계': 0, '바다': 0, '존': 0, '강': 1, '호수': 2, '뭍': 3, '산맥': 3}.get(k, 3)
info = {}
for n, r in rivers.items():
    g = gr[n]; ps = pts(r); ws = [p[2] for p in ps]
    if n in SEAM or ws[0] == ws[-1] and n not in gr: continue
    if len(ps) < 2: continue
    if ws[0] != ws[-1] and not g['jm']:  # 옛 강(정본 폭 기울기) — 넓은 끝이 하구
        mouth_last = ws[-1] > ws[0]
    elif ws[0] != ws[-1] and g['jm'] and n in ('사키가와', '미도리가와'):
        mouth_last = ws[-1] > ws[0]
    else:
        r0, r1 = rank(g['end0']), rank(g['end1'])
        mouth_last = r1 < r0 if r1 != r0 else False
    src_end = g['end1'] if not mouth_last else g['end0']
    mouth_end = g['end0'] if not mouth_last else g['end1']
    order = ps if mouth_last else ps[::-1]  # order[0] = 발원
    sx = order[0][0]
    seam = src_end.startswith('경계 서') or src_end == '존 밖' or (src_end.startswith('강 ') and src_end[2:] in SEAM) or sx <= 2 * SZ
    info[n] = dict(order=order, cum=cum(order), mouth_last=mouth_last, src=src_end, mouth=mouth_end,
                   seamW=order[0][2] if seam else None)
# 합류: 하구 끝이 '강 X' 이면 X 의 어느 지점(발원부터 거리)에 붙나
def nearest_s(x, y, name):
    o = info[name]['order']; c = info[name]['cum']; best = (1e18, 0)
    for i, (a, b) in enumerate(zip(o, o[1:])):
        dx, dy = b[0]-a[0], b[1]-a[1]; L2 = dx*dx+dy*dy
        t = 0 if L2 == 0 else max(0, min(1, ((x-a[0])*dx+(y-a[1])*dy)/L2))
        d = math.hypot(x-(a[0]+dx*t), y-(a[1]+dy*t))
        if d < best[0]: best = (d, c[i] + (c[i+1]-c[i])*t)
    return best[1]
joins = collections.defaultdict(list)  # parent -> [(s, child)]
for n, I in info.items():
    if I['mouth'].startswith('강 '):
        p = I['mouth'][2:]
        if p in info:
            m = I['order'][-1]; joins[p].append((nearest_s(m[0], m[1], p), n))
U = {}
def utot(n, stack=()):
    if n in U: return U[n]
    if n in stack: return 0
    I = info[n]; u0 = 0
    if I['seamW']: u0 = ((I['seamW'] - W0) / A) ** (1 / B)
    U[n] = u0 + I['cum'][-1] + sum(utot(c, stack + (n,)) for s, c in joins.get(n, []))
    return U[n]
for n in info: utot(n)
out = {'rivers': {}, 'ridges': {}}
for n, I in info.items():
    u0 = ((I['seamW'] - W0) / A) ** (1 / B) if I['seamW'] else 0
    js = sorted(joins.get(n, []))
    ws = []
    for s in I['cum']:
        u = u0 + s + sum(U[c] for sj, c in js if sj <= s + 1e-9)
        ws.append(int(round(W0 + A * u ** B)))
    if not I['mouth_last']: ws = ws[::-1]
    for p, w in zip(rivers[n]['path'], ws): p['width'] = w
    out['rivers'][n] = dict(src=I['src'], mouth=I['mouth'], L=round(I['cum'][-1]), U=round(U[n]), wSrc=min(ws), wMouth=max(ws), tribs=[c for s, c in js])
for r in P['ridges']:
    if '_jm' not in r: continue
    ps = pts(r); c = cum(ps); L = c[-1]
    wmax = RA * L ** RB; ws = []
    for s in c:
        f = min(s, L - s) / (0.2 * L) if L > 0 else 1
        ws.append(int(round(wmax * (REND + (1 - REND) * min(1, f)))))
    for p, w in zip(r['path'], ws): p['width'] = w
    out['ridges'][r['name']] = dict(L=round(L), wMax=round(wmax), wEnd=min(ws))
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(out, open(OUT.replace('.json', '_widths.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
for n, o in out['rivers'].items(): print(f"{n:8s} L{o['L']:5d} U{o['U']:5d} {o['wSrc']:4d}→{o['wMouth']:4d}  발원[{o['src']}] 하구[{o['mouth']}] 지류{o['tribs']}")
for n, o in out['ridges'].items(): print(f"{n:6s} L{o['L']:4d} w {o['wEnd']}~{o['wMax']}")
