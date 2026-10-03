#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 ② 걸림 표 재료 · 관측 전용 · 판정 0)
# t614-mask.js 가 낸 옛/새 셀 꼴·본토 판(<D>/{han,nip}_{old,new}.kind.u8 · .main.u8)과 br_old.json(존 설정 다리) · vill_{old,new}.json(후보 자리)으로:
#   ⓐ 물 차이 · 본토 차이(끊긴 뭍 · 새로 이어진 뭍)  ⓑ 다리 덩이마다 옛/새 물 칸(뜬 다리 = 새 물 0) → br_hit.json
#   ⓒ 새 물 덩이를 가로지르는 옛 이웃 길의 돌아감(셀) → detour.json  ⓓ 마을 회관 마당(r10)·물 거리(옛/새) → vill.json
# 쓰는 법: T614_DIR=/tmp/t614 python3 scripts/t614-check.py
import os
DIR = os.environ.get('T614_DIR', '/tmp/t614')
# ── an ──
def _an():
    import json, numpy as np
    from scipy import ndimage as nd
    for z, NX in [('hanbando', 2188), ('nippon', 2187)]:
        NY = 4063
        ko = np.fromfile(f'{DIR}/{"han" if z=="hanbando" else "nip"}_old.kind.u8', np.uint8).reshape(NY, NX)
        kn = np.fromfile(f'{DIR}/{"han" if z=="hanbando" else "nip"}_new.kind.u8', np.uint8).reshape(NY, NX)
        mo = np.fromfile(f'{DIR}/{"han" if z=="hanbando" else "nip"}_old.main.u8', np.uint8).reshape(NY, NX)
        mn = np.fromfile(f'{DIR}/{"han" if z=="hanbando" else "nip"}_new.main.u8', np.uint8).reshape(NY, NX)
        L = (ko == 2) & (kn != 2); G = (kn == 2) & (ko != 2)
        print(z, 'lost water', int(L.sum()), 'gained', int(G.sum()), 'lost->band', int(((ko==2)&(kn==1)).sum()))
        lab, n = nd.label(L); print(' lost comps', n, sorted(nd.sum(L, lab, range(1, n+1)).astype(int).tolist(), reverse=True)[:12])
        lab, n = nd.label(G); 
        if n: 
            sl = nd.find_objects(lab); print(' gained comps', n, [(int((lab[s]==i+1).sum()), s[1].start, s[0].start, s[1].stop, s[0].stop) for i, s in enumerate(sl)][:10])
        cut = (mo == 1) & (mn == 0); join = (mn == 1) & (mo == 0)
        print(' main old', int(mo.sum()), 'new', int(mn.sum()), 'cut', int(cut.sum()), 'joined', int(join.sum()), 'joined that were land in old', int((join & (ko == 0)).sum()))
        lab, n = nd.label(join & (ko == 0))
        if n:
            sz = nd.sum(join & (ko==0), lab, range(1, n+1)); sl = nd.find_objects(lab)
            big = sorted([(int(sz[i]), sl[i][1].start, sl[i][0].start) for i in range(n)], reverse=True)[:8]; print(' joined old-land comps', n, big)
        lab, n = nd.label(cut)
        if n:
            sz = nd.sum(cut, lab, range(1, n+1)); sl = nd.find_objects(lab)
            print(' cut comps', n, sorted([(int(sz[i]), sl[i][1].start, sl[i][0].start) for i in range(n)], reverse=True)[:8])
# ── br ──
def _br():
    import json, numpy as np
    B = json.load(open(DIR + '/br_old.json'))
    def groups(flat):
        cells = {(flat[i], flat[i+1]) for i in range(0, len(flat) - 1, 2)}
        seen, out = set(), []
        for c in sorted(cells):
            if c in seen: continue
            st = [c]; seen.add(c); g = []
            while st:
                q = st.pop(); g.append(q)
                for d in ((1,0),(-1,0),(0,1),(0,-1)):
                    k = (q[0]+d[0], q[1]+d[1])
                    if k in cells and k not in seen: seen.add(k); st.append(k)
            out.append(sorted(g))
        return out
    res = {}
    for z, NX, tag in [('hanbando', 2188, 'han'), ('nippon', 2187, 'nip')]:
        NY = 4063
        ko = np.fromfile(f'{DIR}/{tag}_old.kind.u8', np.uint8).reshape(NY, NX)
        kn = np.fromfile(f'{DIR}/{tag}_new.kind.u8', np.uint8).reshape(NY, NX)
        rows = []
        for src, lists in [('bridges', [B[z]['bridges']]), ('shortcut', B[z]['sc']), ('site', B[z]['sites'])]:
            for li, flat in enumerate(lists):
                for gi, g in enumerate(groups(flat)):
                    xs = [c[0] for c in g]; ys = [c[1] for c in g]
                    ow = sum(1 for x, y in g if ko[y, x] in (1, 2)); nw = sum(1 for x, y in g if kn[y, x] in (1, 2))
                    lost = sum(1 for x, y in g if ko[y, x] == 2 and kn[y, x] != 2); gain = sum(1 for x, y in g if kn[y, x] == 2 and ko[y, x] != 2)
                    if lost or gain:
                        rows.append({'src': src, 'list': li, 'g': gi, 'n': len(g), 'bbox': [min(xs), min(ys), max(xs), max(ys)], 'oldWater': ow, 'newWater': nw, 'lost': lost, 'gain': gain, 'cells': g})
        res[z] = rows
        for r in rows: print(z, r['src'], r['list'], r['g'], 'n', r['n'], 'bbox', r['bbox'], 'water old→new', r['oldWater'], '→', r['newWater'], 'lost', r['lost'], 'gain', r['gain'])
    json.dump(res, open(DIR + '/br_hit.json', 'w'))
# ── detour ──
def _detour():
    import json, numpy as np
    from scipy import ndimage as nd
    from collections import deque
    B = json.load(open(DIR + '/br_old.json'))
    def bfs(walk, s, t, lim):
        NY, NX = walk.shape; seen = {s: 0}; q = deque([s])
        while q:
            c = q.popleft(); d = seen[c]
            if c == t: return d
            if d >= lim: continue
            x, y = c
            for nx_, ny_ in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
                if 0 <= nx_ < NX and 0 <= ny_ < NY and walk[ny_, nx_] and (nx_, ny_) not in seen:
                    seen[(nx_, ny_)] = d + 1; q.append((nx_, ny_))
        return None
    out = {}
    for z, NX, tag in [('hanbando', 2188, 'han'), ('nippon', 2187, 'nip')]:
        NY = 4063
        ko = np.fromfile(f'{DIR}/{tag}_old.kind.u8', np.uint8).reshape(NY, NX)
        kn = np.fromfile(f'{DIR}/{tag}_new.kind.u8', np.uint8).reshape(NY, NX)
        br = np.zeros((NY, NX), bool); f = B[z]['bridges']
        for i in range(0, len(f) - 1, 2): br[f[i+1], f[i]] = True
        walk = (kn == 0) | (((kn == 1) | (kn == 2)) & br)
        G = (kn == 2) & (ko != 2); lab, n = nd.label(G); sl = nd.find_objects(lab)
        rows = []
        for i in range(n):
            s = sl[i]; m = lab[s] == i + 1; cnt = int(m.sum())
            if cnt < 50: rows.append({'comp': i+1, 'cells': cnt, 'bbox': [s[1].start, s[0].start, s[1].stop-1, s[0].stop-1], 'samples': 0}); continue
            ys0, xs0 = s[0].start, s[1].start; dets = []
            H, Wd = m.shape
            horiz = Wd >= H
            for k in range(0, Wd if horiz else H, 12):
                line = m[:, k] if horiz else m[k, :]
                idx = np.where(line)[0]
                if not len(idx): continue
                a, b = idx[0], idx[-1]
                if horiz: p, q = (xs0 + k, ys0 + a - 1), (xs0 + k, ys0 + b + 1)
                else: p, q = (xs0 + a - 1, ys0 + k), (xs0 + b + 1, ys0 + k)
                if not (0 <= p[1] < NY and 0 <= q[1] < NY and 0 <= p[0] < NX and 0 <= q[0] < NX): continue
                if not (walk[p[1], p[0]] and walk[q[1], q[0]]): continue
                d = bfs(walk, p, q, 3000); straight = (b - a + 2)
                dets.append((None if d is None else d - straight, p, q, straight))
            ok = [d for d in dets if d[0] is not None]
            rows.append({'comp': i+1, 'cells': cnt, 'bbox': [s[1].start, s[0].start, s[1].stop-1, s[0].stop-1], 'samples': len(dets), 'unreach3000': len(dets) - len(ok),
                         'detourMax': max((d[0] for d in ok), default=None), 'detourMed': (sorted(d[0] for d in ok)[len(ok)//2] if ok else None),
                         'worst': (lambda w: {'from': w[1], 'to': w[2], 'straight': w[3], 'detour': w[0]})(max(ok, key=lambda d: d[0])) if ok else None})
        out[z] = rows
        for r in rows: print(z, r)
    json.dump(out, open(DIR + '/detour.json', 'w'), default=int)
# ── vill ──
def _vill():
    import json, numpy as np
    from scipy import ndimage as nd
    O = json.load(open(DIR + '/vill_old.json')); N = json.load(open(DIR + '/vill_new.json'))
    YARD = [(dx, dy) for dx in range(-10, 10) for dy in range(-10, 10) if (dx + .5) ** 2 + (dy + .5) ** 2 < 100]
    out = {}
    for z, NX, tag in [('hanbando', 2188, 'han'), ('nippon', 2187, 'nip')]:
        NY = 4063
        K = {s: np.fromfile(f'{DIR}/{tag}_{s}.kind.u8', np.uint8).reshape(NY, NX) for s in ('old', 'new')}
        D = {}; DH = {}
        for s in K:
            D[s] = nd.distance_transform_edt(~((K[s] == 1) | (K[s] == 2)))
            DH[s] = nd.distance_transform_edt(K[s] != 2)
        band = K['new'] == 1
        rows = []
        for vo, vn in zip(O[z], N[z]):
            assert vo['name'] == vn['name']
            r = {'name': vo['name'], 'type': vo['type']}
            for s, v in (('old', vo), ('new', vn)):
                cx, cy = round(v['x'] / 32), round(v['y'] / 32); k = K[s]
                yk = [k[cy + dy, cx + dx] for dx, dy in YARD if 0 <= cx + dx < NX and 0 <= cy + dy < NY]
                r[s] = {'c': [cx, cy], 'yardBand': int(sum(1 for q in yk if q == 1)), 'yardWater': int(sum(1 for q in yk if q == 2)), 'yardRock': int(sum(1 for q in yk if q == 3)),
                        'dWater': round(float(D[s][cy, cx]), 1), 'dHand': round(float(DH[s][cy, cx]), 1)}
            o, n = r['old'], r['new']
            flags = []
            if (n['yardBand'] or n['yardWater']) and not (o['yardBand'] or o['yardWater']): flags.append('마당 물(새로)')
            if (n['yardBand'] or n['yardWater']) and (o['yardBand'] or o['yardWater']): flags.append('마당 물(옛부터)')
            if o['dWater'] <= 140 < n['dWater']: flags.append('물 자 140 넘음')
            if abs(o['dHand'] - n['dHand']) >= 1 or abs(o['dWater'] - n['dWater']) >= 1: flags.append('물 거리 바뀜')
            if o['c'] != n['c']: flags.append('자리 바뀜(작업 파일)')
            r['flags'] = flags; rows.append(r)
        out[z] = rows
        for r in rows:
            if r['flags']: print(z, r['name'], r['type'], r['old'], '→', r['new'], r['flags'])
    json.dump(out, open(DIR + '/vill.json', 'w'), ensure_ascii=False)

for _f in (_an, _br, _detour, _vill): _f()
