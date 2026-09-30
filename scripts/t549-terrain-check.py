#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T549 표 짜는 기계 · 판정 0)
# =============================================================================
# T549 ② — 가로막는 지형(강 · 호수 · 산맥 · 고개)의 **자연스러움 표**. 새 문턱 0:
#   "멀다/많다"의 자는 두 가지뿐 — 그 피처 자신의 폭(강 반폭 · 산맥 반폭 · 호수 반경 · 고개 반경)과
#   `chunk.js COASTLINE_BASE`(해안선 띠 평균 깊이 6,000px = 187셀)와 **한반도 같은 자 분포**(p95).
#
#   강: 하구(폭이 넓은 끝) · 발원(좁은 끝) 이 어디에 닿나(바다 띠 · 호수 · 다른 강 · 산맥 · 존 가장자리 · 뭍)
#       ① 바다(또는 호수 · 큰 강 · 옆 존)에 닿나  ② 막다른 하구  ③ 산에서 나나  ④ 하류로 넓어지나
#       ⑤ 산맥을 고개 없이 자르나(발원 쪽 한 덩이는 뺀다)  ⑥ 해안을 따라 나란히 흐르나(바다로 내려가는 효율 < 한반도 p5)
#   호수: 강이 드나드나 · 바다 띠 안인가 · 존 모서리/가장자리에 걸렸나 · 가장 가까운 산맥
#   산맥: 경계 거울 띠(존 서쪽 가장자리 ±산맥 반폭 · T408) / 섬 안 · 섬 안 산맥끼리 이어지나(끝이 다른 산맥 몸에 닿나) ·
#         등뼈(섬 안 산맥의 바위 셀이 북→남 몇 % 의 줄에 있나 · 끊긴 줄 구간) · 고개 몇
#
# 쓰는 법: python3 scripts/t549-terrain-check.py <지형 절 json | -> <T524 bin 디렉터리> <표.json> [--zone nippon]
#   지형 절 json 이 `-` 이면 정본의 그 존 칸을 읽는다(읽기만).
# =============================================================================
import json, math, os, sys
import numpy as np
from scipy import ndimage

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SZ = 32
COAST_BASE_CELLS = 6000 / SZ   # chunk.js COASTLINE_BASE

def load_bin(d, z):
    J = json.load(open(os.path.join(d, f'{z}.json'), encoding='utf-8'))
    raw = open(J['bin'], 'rb').read(); N = J['N']; kind = np.frombuffer(raw[:N], np.uint8).reshape(J['NY'], J['NX'])
    J['_compB'] = np.frombuffer(raw[3 * N:7 * N], np.int32).reshape(J['NY'], J['NX'])
    return J, kind

def cutters(T, J, kind):
    """본토 밖 성분(1,000셀 이상)마다 — 그 둘레의 민물 셀이 어느 강 · 호수 것인가(셀 수). 문턱 0: 둘레에 닿은 물 셀 전부."""
    cb = J['_compB']; out = []
    tags = [chr(65+i) if i<26 else 'Z'+str(i) for i in range(400)]
    big = [c for c in J['compsB'] if c['cls'] != '본토' and c['area'] >= 1000]
    feats = [(r['name'], pts(r), 'river') for r in T.get('rivers', [])]
    for n, c in enumerate(big):
        m = cb == c['id']
        ring = ndimage.binary_dilation(m, structure=ndimage.generate_binary_structure(2, 1)) & ~m
        ys, xs = np.nonzero(ring & (kind == 3))
        seaN = int((ring & (kind == 2)).sum()); rockN = int((ring & (kind == 4)).sum())
        cnt = {}
        if len(xs):
            P = np.stack([xs * SZ + SZ / 2, ys * SZ + SZ / 2], 1)
            best = np.full(len(P), np.inf); who = np.array([''] * len(P), dtype=object)
            for name, A, _ in feats:
                d, hw = seg_dist(P, A); e = d - hw
                upd = e < best; best[upd] = e[upd]; who[upd] = name
            for l in T.get('lakes', []):
                e = np.hypot(P[:, 0] - l['center'][0], P[:, 1] - l['center'][1]) - l.get('radius', 0)
                upd = e < best; best[upd] = e[upd]; who[upd] = l['name']
            for w in who: cnt[w] = cnt.get(w, 0) + 1
        out.append(dict(tag=tags[n], area=c['area'], cls=c['cls'], cx=c['cx'], cy=c['cy'], fresh=dict(sorted(cnt.items(), key=lambda kv: -kv[1])), sea=seaN, rock=rockN))
    return out

def pts(f):
    return np.array([[p['pos'][0], p['pos'][1], p.get('width', f.get('width', 200))] for p in f['path']], float)

def seg_dist(P, A):
    """P: (m,2) 질의점 · A: (n,3) 선 — 각 질의점의 가장 가까운 거리와 그 자리의 반폭(선형 보간)."""
    if len(A) < 2: d = np.hypot(P[:, 0] - A[0, 0], P[:, 1] - A[0, 1]); return d, np.full(len(P), A[0, 2] / 2)
    a = A[:-1, :2][None]; b = A[1:, :2][None]; ab = b - a; L2 = (ab ** 2).sum(-1); L2[L2 == 0] = 1e-9
    ap = P[:, None, :] - a; t = np.clip((ap * ab).sum(-1) / L2, 0, 1)
    proj = a + t[..., None] * ab; d = np.hypot(*(P[:, None, :] - proj).transpose(2, 0, 1))
    k = d.argmin(1); r = np.arange(len(P))
    w = A[:-1, 2][k] * (1 - t[r, k]) + A[1:, 2][k] * t[r, k]
    return d[r, k], w / 2

def sample(f, step=SZ):
    A = pts(f); out = []
    for i in range(len(A) - 1):
        x0, y0, w0 = A[i]; x1, y1, w1 = A[i + 1]; L = math.hypot(x1 - x0, y1 - y0); n = max(1, int(L // step))
        for k in range(n): t = k / n; out.append((x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, w0 + (w1 - w0) * t, i))
    out.append((A[-1][0], A[-1][1], A[-1][2], len(A) - 1))
    return np.array(out)

def analyze(T, kind, W, H, hb=None):
    NY, NX = kind.shape
    sea = kind == 2
    dsea = ndimage.distance_transform_edt(~sea)   # 셀
    rivers, lakes, ridges, passes = T.get('rivers', []), T.get('lakes', []), T.get('ridges', []), T.get('passes', [])
    edge_margin = lambda f: max(q.get('width', 0) for q in f['path']) / 2 if f.get('path') else 0
    mirror = lambda r: min(q['pos'][0] for q in r['path']) < edge_margin(r) and max(q['pos'][0] for q in r['path']) < 2 * edge_margin(r) + 1000
    in_pass = lambda x, y: any((x - q['pos'][0]) ** 2 + (y - q['pos'][1]) ** 2 < q['radius'] ** 2 for q in passes)
    def cellkind(x, y):
        cx, cy = int(x // SZ), int(y // SZ)
        if cx < 0 or cy < 0 or cx >= NX or cy >= NY: return None
        return int(kind[cy, cx])
    def touches(x, y, w2, me):
        """끝점이 무엇에 닿나 — 순서: 바다 띠 · 존 밖 · 호수 · 다른 강 · 산맥 · 뭍."""
        r = w2 / SZ + 2
        cx, cy = int(x // SZ), int(y // SZ)
        if x >= W or y >= H: return ('바다', '존 밖(동·남 = 바다 존)')
        if x <= 0 or y <= 0:
            return ('옆 존', '서 = 한반도' if x <= 0 else '북 = 베링')
        y0, y1, x0, x1 = max(0, int(cy - r)), min(NY, int(cy + r) + 1), max(0, int(cx - r)), min(NX, int(cx + r) + 1)
        if sea[y0:y1, x0:x1].any(): return ('바다', f'띠 {int(dsea[min(cy,NY-1), min(cx,NX-1)])}셀')
        for l in lakes:
            if math.hypot(x - l['center'][0], y - l['center'][1]) < l.get('radius', 0) + w2 + SZ: return ('호수', l['name'])
        best = None
        for o in rivers:
            if o is me: continue
            d, hw = seg_dist(np.array([[x, y]]), pts(o))
            if d[0] < hw[0] + w2 + SZ and (best is None or d[0] < best[0]): best = (d[0], o['name'])
        if best: return ('강', best[1])
        for g in ridges:
            d, hw = seg_dist(np.array([[x, y]]), pts(g))
            if d[0] < hw[0] + w2: return ('산맥', g['name'])
        return ('뭍', '')
    out = {'rivers': [], 'lakes': [], 'ridges': [], 'spine': {}, 'passes': len(passes)}
    # 강
    for r in rivers:
        A = pts(r); w_first, w_last = A[0, 2], A[-1, 2]
        S = sample(r); L = len(S) * SZ / SZ
        t0 = touches(A[0, 0], A[0, 1], w_first / 2, r); t1 = touches(A[-1, 0], A[-1, 1], w_last / 2, r)
        # 하구 = 폭이 넓은 끝(같으면 바다 쪽)
        if abs(w_first - w_last) < 1e-6: mouth_first = (t0[0] == '바다')
        else: mouth_first = w_first > w_last
        mouth, src = (t0, t1) if mouth_first else (t1, t0)
        wm, ws = (w_first, w_last) if mouth_first else (w_last, w_first)
        seq = S[:, 2] if not mouth_first else S[::-1, 2]   # 발원 → 하구
        mono = float(np.mean(np.diff(seq) >= -1e-6)) if len(seq) > 1 else 1.0
        # 산맥 관통(발원 쪽 한 덩이 빼고)
        cross = {}
        order = S if not mouth_first else S[::-1]   # 발원 → 하구
        for g in ridges:
            d, hw = seg_dist(order[:, :2], pts(g))
            inside = (d < hw) & ~np.array([in_pass(x, y) for x, y in order[:, :2]])
            if not inside.any(): continue
            runs = []; i = 0
            while i < len(inside):
                if inside[i]:
                    j = i
                    while j < len(inside) and inside[j]: j += 1
                    runs.append((i, j)); i = j
                else: i += 1
            if runs and runs[0][0] == 0: runs = runs[1:]          # 발원이 산맥 몸 안 — 거기서 나는 것
            if runs and runs[-1][1] == len(inside) and mouth[0] != '뭍': pass
            n = sum(j - i for i, j in runs)
            if n: cross[g['name']] = n
        # 해안 평행 — "바다로 내려가는 효율" = (발원의 바다 거리 − 하구의 바다 거리) / 길이. 바다로 곧장 가면 1 근처,
        #   해안을 따라 나란히 흐르면 0 근처. 하구가 바다인 강만 잰다(호수·강·옆 존으로 가는 강은 뜻이 다르다).
        cx = np.clip((S[:, 0] // SZ).astype(int), 0, NX - 1); cy = np.clip((S[:, 1] // SZ).astype(int), 0, NY - 1)
        dd = dsea[cy, cx]
        ds_src, ds_mouth = (dd[-1], dd[0]) if mouth_first else (dd[0], dd[-1])
        coast = float((ds_src - ds_mouth) / max(1, len(S))) if mouth[0] == '바다' else None
        out['rivers'].append(dict(name=r['name'], n=len(A), lenCells=round(len(S)), wSrc=round(ws), wMouth=round(wm),
            src=list(src), mouth=list(mouth), mono=round(mono, 2), cross=cross, coast=(round(coast, 2) if coast is not None else None),
            start=[round(A[0, 0]), round(A[0, 1])], end=[round(A[-1, 0]), round(A[-1, 1])], mouthFirst=bool(mouth_first)))
    # 호수
    for l in lakes:
        cxp, cyp, R = l['center'][0], l['center'][1], l.get('radius', 0)
        riv = []
        for r in rivers:
            d, hw = seg_dist(np.array([[cxp, cyp]]), pts(r))
            if d[0] < R + hw[0] + SZ: riv.append(r['name'])
        rd = []
        for g in ridges:
            d, hw = seg_dist(np.array([[cxp, cyp]]), pts(g)); rd.append((max(0, d[0] - hw[0]) / SZ, g['name']))
        rd.sort()
        k = cellkind(min(max(cxp, 0), W - 1), min(max(cyp, 0), H - 1))
        edge = (cxp - R < 0) or (cyp - R < 0) or (cxp + R > W) or (cyp + R > H)
        cyc = min(max(int(cyp // SZ), 0), NY - 1); cxc = min(max(int(cxp // SZ), 0), NX - 1)
        out['lakes'].append(dict(name=l['name'], center=[round(cxp), round(cyp)], rCells=round(R / SZ), rivers=riv,
            nearRidge=[round(rd[0][0]), rd[0][1]] if rd else None, edge=bool(edge), seaDist=round(float(dsea[cyc, cxc]))))
    # 산맥
    for g in ridges:
        A = pts(g); ends = []
        for e in (A[0], A[-1]):
            hit = None
            for o in ridges:
                if o is g: continue
                d, hw = seg_dist(np.array([[e[0], e[1]]]), pts(o))
                if d[0] < hw[0] + e[2] / 2: hit = o['name']; break
            ends.append(hit)
        out['ridges'].append(dict(name=g['name'], mirror=bool(mirror(g)), lenCells=round(len(sample(g))), wMin=round(A[:, 2].min()), wMax=round(A[:, 2].max()),
            y=[round(A[:, 1].min() / SZ), round(A[:, 1].max() / SZ)], x=[round(A[:, 0].min() / SZ), round(A[:, 0].max() / SZ)], ends=ends))
    # 등뼈 — 섬 안(거울 띠 아님) 산맥의 바위가 있는 가로줄 몫 · 끊긴 줄 구간
    inner = [g for g in ridges if not mirror(g)]
    rowsHit = np.zeros(NY, bool)
    for g in inner:
        S = sample(g)
        for x, y, w, _ in S:
            y0 = int((y - w / 2) // SZ); y1 = int((y + w / 2) // SZ)
            rowsHit[max(0, y0):min(NY, y1 + 1)] = True
    gaps = []; i = 0
    while i < NY:
        if not rowsHit[i]:
            j = i
            while j < NY and not rowsHit[j]: j += 1
            gaps.append([i, j - 1]); i = j
        else: i += 1
    out['spine'] = dict(rowsCovered=round(float(rowsHit.mean()), 3), gaps=gaps, inner=[g['name'] for g in inner])
    return out

def flags(A, hbCoastP95):
    F = []
    for r in A['rivers']:
        if r['mouth'][0] == '뭍': F.append((r['name'], '막다른 하구', f"하구 {r['end'] if not r['mouthFirst'] else r['start']} 뭍"))
        if r['mouth'][0] == '산맥': F.append((r['name'], '하구가 산맥', r['mouth'][1]))
        if r['src'][0] not in ('산맥', '호수', '옆 존') and r['lenCells'] >= 100: F.append((r['name'], '산에서 안 남', f"발원 {r['src'][0]}{(' ' + r['src'][1]) if r['src'][1] else ''}"))
        if r['wMouth'] < r['wSrc']: F.append((r['name'], '하류로 좁아짐', f"{r['wSrc']}→{r['wMouth']}"))
        for g, n in r['cross'].items(): F.append((r['name'], '산맥을 고개 없이 자름', f"{g} {n}셀"))
        # (해안 평행은 표에 효율 수로만 싣는다 — 한반도 p5 가 0 이라 자가 안 선다 · 대신 "갇힌 땅을 가른다"가 그 뿌리를 직접 센다)
    for l in A['lakes']:
        if l['edge']: F.append((l['name'], '호수가 존 가장자리에 걸림', f"중심 {l['center']} · 반경 {l['rCells']}셀"))
        if not l['rivers']: F.append((l['name'], '강이 안 드나드는 호수', f"가장 가까운 산맥 {l['nearRidge']}"))
    sp = A['spine']
    big = [g for g in sp['gaps'] if g[1] - g[0] >= 1]
    if big: F.append(('등뼈', '섬 안 산맥이 안 덮는 줄', ' · '.join(f"y {a}~{b}셀" for a, b in big)))
    if A['passes'] == 0 or all(False for _ in []): pass
    return F

if __name__ == '__main__':
    src, bindir, outj = sys.argv[1], sys.argv[2], sys.argv[3]
    z = sys.argv[sys.argv.index('--zone') + 1] if '--zone' in sys.argv else 'nippon'
    hc = json.load(open(os.path.join(ROOT, 'server', 'hanbando-terrain.json'), encoding='utf-8'))
    T = hc[z] if src == '-' else json.load(open(src, encoding='utf-8'))
    J, kind = load_bin(bindir, z)
    W, H = J['NX'] * SZ, J['NY'] * SZ
    # 한반도 자 — 강 해안 평행 몫 p95(같은 함수)
    hbCoast = None
    if os.path.exists(os.path.join(bindir, 'hanbando.json')):
        HJ, hk = load_bin(bindir, 'hanbando')
        HA = analyze(hc['hanbando'], hk, HJ['NX'] * SZ, HJ['NY'] * SZ)
        cs = sorted(r['coast'] for r in HA['rivers'] if r['lenCells'] >= 100 and r['coast'] is not None)
        hbCoast = cs[int(len(cs) * 0.05)] if cs else None   # 한반도 바다로 가는 강의 효율 p5
        A_hb = HA
    A = analyze(T, kind, W, H)
    A['cutters'] = cutters(T, J, kind)
    F = flags(A, hbCoast)
    for c in A['cutters']:
        top = [k for k, v in c['fresh'].items() if v >= max(1, 0.1 * sum(c['fresh'].values()))]
        if top: F.append(('/'.join(top), '갇힌 땅을 가른다', f"{c['tag']} {c['area']:,}셀(둘레 민물 {sum(c['fresh'].values())} · 바다 {c['sea']} · 바위 {c['rock']})"))
    A['flags'] = F; A['hbCoastP5'] = hbCoast
    if hbCoast is not None: A['hbRivers'] = [dict(name=r['name'], coast=r['coast'], lenCells=r['lenCells'], mouth=r['mouth']) for r in A_hb['rivers']]
    json.dump(A, open(outj, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'강 {len(A["rivers"])} · 호수 {len(A["lakes"])} · 산맥 {len(A["ridges"])} · 고개 {A["passes"]} · 등뼈 덮음 {A["spine"]["rowsCovered"]} · 한반도 바다 효율 p5 {hbCoast} · ✗ {len(F)}')
    for f in F: print('  ✗', *f)
