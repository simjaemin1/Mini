#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T588 ①④ 자 · 판정 0 · 표만)
# =============================================================================
# 존의 해안선 띠 마스크(`t588-coast-mask.js` 가 떨군 u8 + json)를 **바다 변(구간)마다** 잰다.
#   모양 자(1셀 돌기 · 박스 카운팅 D · 곶·만 반경 분포 · 줄 점프)는 **T549 자를 그대로 부른다**(`t549-coast-shape.py` ·
#   세션5 · 사본 0) — 변 하나를 띠 폭만큼 잘라(해안이 늘 동쪽 또는 남쪽에 오게 뒤집어) 그 자에 넘긴다.
#   여기서 더하는 것(그 자에 없는 것)만 센다:
#     ⓐ 띠가 먹는 뭍 % (존 칸 기준)          ⓑ 섬 — 본토에 안 붙은 뭍 덩이(4방 · 크기별)
#     ⓒ 갇힌 바다 — 존 테두리에 안 닿는 띠 물 덩이(4방 · 크기별 · 석호 꼴)
#   본토 = 존 테두리 중 **바다가 아닌 변**(이웃 뭍 존으로 이어지는 변)에 닿는 덩이 + 가장 큰 덩이.
#   ⚠1셀 = 32px · 4방 = 서버 통행(`isWaterTileLocal` 4방 걸음)과 같은 이웃.
# 쓰는 법: python3 scripts/t588-coast-measure.py <이름=mask.u8:meta.json> ... > out.json
#   env T549_SHAPE = T549 모양 자 경로(기본 scripts/t549-coast-shape.py — T591 이 main 에 다시 얹는다)
# =============================================================================
import json, os, subprocess, sys, tempfile
import numpy as np
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHAPE = os.environ.get('T549_SHAPE') or os.path.join(HERE, 't549-coast-shape.py')
if not os.path.exists(SHAPE):
    sys.exit(f'[T588 measure] T549 모양 자가 없다: {SHAPE} — 세션5 가지 3c5a5a91(T591 이 main 에 다시 얹는다) · env T549_SHAPE 로 경로를 줘라')
BINS = [(1, 1), (2, 9), (10, 99), (100, 999), (1000, 9999), (10000, None)]
BIN_KO = ['1', '2~9', '10~99', '100~999', '1천~1만', '1만+']
N4 = np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]], bool)

def bins(sizes):
    out = []
    for lo, hi in BINS:
        out.append(int(((sizes >= lo) & ((sizes <= hi) if hi else True)).sum()))
    return out

def components(meta, sea):
    NY, NX = sea.shape
    land = ~sea
    # 존 테두리 중 바다 변(바다 존과 맞닿은 구간)과 뭍 변을 가른다
    oceanEdge = {'N': np.zeros(NX, bool), 'S': np.zeros(NX, bool), 'W': np.zeros(NY, bool), 'E': np.zeros(NY, bool)}
    for s in meta['sides']:
        if s['side'] in oceanEdge: oceanEdge[s['side']][s['a']:s['b']] = True
    lab, n = ndi.label(land, structure=N4)
    sizes = ndi.sum(np.ones_like(lab), lab, index=np.arange(1, n + 1)).astype(np.int64) if n else np.zeros(0, np.int64)
    main = set()
    if n: main.add(int(np.argmax(sizes)) + 1)
    for side, row in (('N', lab[0, :]), ('S', lab[-1, :]), ('W', lab[:, 0]), ('E', lab[:, -1])):
        for v in np.unique(row[(row > 0) & ~oceanEdge[side]]): main.add(int(v))
    isl = np.array([sizes[i - 1] for i in range(1, n + 1) if i not in main], np.int64)
    # 갇힌 바다: 띠 물 덩이 중 존 테두리 어디에도 안 닿는 것
    slab, sn = ndi.label(sea, structure=N4)
    ssz = ndi.sum(np.ones_like(slab), slab, index=np.arange(1, sn + 1)).astype(np.int64) if sn else np.zeros(0, np.int64)
    edge = set(np.unique(np.concatenate([slab[0, :], slab[-1, :], slab[:, 0], slab[:, -1]])).tolist()) - {0}
    lak = np.array([ssz[i - 1] for i in range(1, sn + 1) if i not in edge], np.int64)
    return dict(islands=int(isl.size), islandCells=int(isl.sum()), islandBins=bins(isl), islandMax=int(isl.max()) if isl.size else 0,
                enclosedSea=int(lak.size), enclosedSeaCells=int(lak.sum()), enclosedBins=bins(lak)), lab, main

def strips(meta, sea):
    """바다 변마다 띠 폭만큼 자른 창 — 해안이 동(E)·남(S)에 오게 뒤집는다(T549 자의 줄 점프가 E·S 를 본다).
    ⚠상자 격자 맞춤: T549 자의 박스 카운팅은 (y//s, x//s) 격자를 쓴다 — 창을 아무 데서나 자르면 같은 해안도 상자 수가 달라진다
      (첫 판에서 한반도 남해안 D 가 존 통째 1.116 · 창 1.091 로 갈렸다). ⇒ 창의 시작을 128셀(가장 큰 상자) 배수에 두고,
      뒤집는 변(N·W)은 창 폭을 128 배수로 둔다 — 그러면 뒤집어도 상자 경계가 상자 경계로 간다(존 통째 판과 같은 격자)."""
    NY, NX = sea.shape
    out = []
    sd = [s for s in meta['sides'] if s['side'] in 'NSWE']
    ys, xs = np.nonzero(sea)
    # 띠 칸마다 가장 가까운 바다 변(셀 중심 → 변 선분 거리) — 그 변의 띠 깊이를 잰다
    dist = []
    for s in sd:
        a, b = s['a'], s['b']
        if s['side'] in 'NS':
            dy = (NY - 0.5 - ys) if s['side'] == 'S' else (ys + 0.5)
            dx = np.maximum(np.maximum(a - xs, xs - (b - 1)), 0)
        else:
            dy = (NX - 0.5 - xs) if s['side'] == 'E' else (xs + 0.5)
            dx = np.maximum(np.maximum(a - ys, ys - (b - 1)), 0)
        dist.append(np.hypot(dy, dx))
    # 꼭짓점으로만 닿는 바다도 후보에 넣는다(그 꼭짓점 사분원 띠가 옆 변 창으로 새지 않게 — 첫 판에서 중원남 동변 창이 존 폭 3,125셀로 부풀었다)
    ctouch = [t for t in meta['sides'] if t['side'] == 'corner']
    cdist = []
    for t in ctouch:
        cy = NY if 'S' in t['corner'] else 0; cx = NX if 'E' in t['corner'] else 0
        cdist.append(np.hypot(ys + 0.5 - cy, xs + 0.5 - cx))
    allD = dist + cdist
    own = np.argmin(np.vstack(allD), axis=0) if allD else np.zeros(0, int)
    for i, s in enumerate(sd):
        side, a, b = s['side'], s['a'], s['b']
        others = [o['side'] for o in sd if o is not s]
        mine = own == i
        dmax = int(np.ceil(dist[i][mine].max())) if mine.any() else 0
        need = dmax + 8
        if side in 'SE':
            L = NY if side == 'S' else NX
            st = max(0, ((L - need) // 128) * 128); M = L - st
        else:
            M = int(np.ceil(need / 128) * 128)
        if side == 'S': win = sea[NY - M:NY, a:b]
        elif side == 'N': win = sea[0:M, a:b][::-1, :]
        elif side == 'E': win = sea[a:b, NX - M:NX]
        else: win = sea[a:b, 0:M][:, ::-1]
        cut0 = cut1 = 0
        if side in 'NS':
            if 'W' in others and a == 0: cut0 = M
            if 'E' in others and b == NX: cut1 = M
            win = win[:, cut0:win.shape[1] - cut1]
        else:
            if 'N' in others and a == 0: cut0 = M
            if 'S' in others and b == NY: cut1 = M
            win = win[cut0:win.shape[0] - cut1, :]
        out.append(dict(side=side, ocean=s['ocean'], a=a + cut0, b=b - cut1, M=M, depth=dmax, cells=int(mine.sum()), win=np.ascontiguousarray(win)))
    # 모서리 — ⓐ 바다 변 둘이 만나는 볼록 모서리(두 변 창에서 뗀 정사각) ⓑ 꼭짓점으로만 바다에 닿는 모서리(그 존에 바다 변이 없는 쪽)
    #   창은 남동(SE) 꼴로 돌려 넘긴다(뒤집기 둘 — 128 배수 폭이라 상자 격자 그대로).
    byside = {o['side']: o for o in out}
    corners = []
    for c, (s1, s2) in {'NW': ('N', 'W'), 'NE': ('N', 'E'), 'SW': ('S', 'W'), 'SE': ('S', 'E')}.items():
        if s1 in byside and s2 in byside:
            corners.append((c, max(byside[s1]['M'], byside[s2]['M']), f"{byside[s1]['ocean']}+{byside[s2]['ocean']}", None))
    for j, t in enumerate(ctouch):
        c = t['corner']
        mine = own == (len(sd) + j)
        if not mine.any(): continue   # 그 꼭짓점이 가장 가까운 띠 칸이 없다 — 옆 변의 띠가 덮는다(한반도 남동 · 닛폰 남서)
        dmax = int(np.ceil(cdist[j][mine].max()))
        corners.append((c, int(np.ceil((dmax + 8) / 128) * 128), t['ocean'], dmax))
    for c, M, oc, dmax in corners:
        M = min(M, NY, NX)
        win = sea[NY - M:NY, :] if 'S' in c else sea[0:M, :][::-1, :]
        win = win[:, NX - M:NX] if 'E' in c else win[:, 0:M][:, ::-1]
        out.append(dict(side='corner:' + c, ocean=oc, a=0, b=M, M=M, depth=dmax if dmax is not None else M - 8, cells=int(win.sum()), win=np.ascontiguousarray(win)))
    return out

def shape(name, win):
    with tempfile.TemporaryDirectory() as td:
        p = os.path.join(td, 'w.u8'); win.astype(np.uint8).tofile(p)
        r = subprocess.run([sys.executable, SHAPE, str(win.shape[1]), str(win.shape[0]), f'{name}={p}'], capture_output=True, text=True)
        if r.returncode: sys.exit(f'[T588 measure] T549 자 실패: {r.stderr[-400:]}')
        return json.loads(r.stdout)[name]

out = {}
for a in sys.argv[1:]:
    name, rest = a.split('=', 1); mp, jp = rest.split(':', 1)
    meta = json.load(open(jp, encoding='utf-8'))
    sea = np.fromfile(mp, np.uint8).reshape(meta['NY'], meta['NX']).astype(bool)
    comp, _, _ = components(meta, sea)
    rows = []
    for st in strips(meta, sea):
        m = shape(f"{meta['zone']}-{st['side']}", st['win'])
        m.pop('boxN', None)
        rows.append(dict(side=st['side'], ocean=st['ocean'], a=st['a'], b=st['b'], win=st['M'], depthCells=st['depth'], bandCells=st['cells'], **m))
        # 구간 몸통(섞임 폭 T/2 씩 뗀 곳)마다 따로 — 구간 상자(세계 px)를 이 변의 셀 축으로 옮긴다 · 시작은 128셀 배수(상자 격자)
        if st['side'] not in ('N', 'S', 'E', 'W'): continue
        for q in meta.get('secs', []):
            if q.get('zone') != meta['zone'] or q.get('side') != st['side']: continue
            T2 = q['T'] / 2
            if st['side'] in 'NS': lo, hi = (q['ax'] + T2 - meta['x0']) / 32, (q['bx'] - T2 - meta['x0']) / 32
            else: lo, hi = (q['ay'] + T2 - meta['y0']) / 32, (q['by'] - T2 - meta['y0']) / 32
            lo = max(lo, st['a']); hi = min(hi, st['b'])
            lo = int(np.ceil((lo - st['a']) / 128) * 128); hi = int(np.floor(hi - st['a']))
            if hi - lo < 256: continue
            w = st['win'][:, lo:hi] if st['side'] in 'NS' else st['win'][lo:hi, :]
            mm = shape(f"{meta['zone']}-{q['id']}", np.ascontiguousarray(w)); mm.pop('boxN', None)
            rows.append(dict(side=st['side'] + ':' + q['id'], ko=q.get('ko'), ocean=st['ocean'], a=st['a'] + lo, b=st['a'] + hi, win=st['M'], depthCells=st['depth'], bandCells=int(w.sum()), **mm))
    out[name] = dict(zone=meta['zone'], knob=meta.get('knob', ''), NX=meta['NX'], NY=meta['NY'], band=meta['band'], bandPct=round(meta['bandPct'], 3),
                     ms=meta.get('ms'), **comp, sides=rows)
    print(name, json.dumps({k: v for k, v in out[name].items() if k != 'sides'}, ensure_ascii=False), file=sys.stderr)
    for r in rows:
        print('   ', r['side'], r['ocean'], json.dumps({k: r[k] for k in ('depthCells', 'coast', 'spikeLand', 'spikeSea', 'spikePer1k', 'D', 'Dsmall', 'Dlarge')}, ensure_ascii=False), file=sys.stderr)
json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
