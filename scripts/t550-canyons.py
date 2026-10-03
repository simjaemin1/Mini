#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T550 ②ⓓ 협곡 · 정본 무접촉)
# 강이 산맥 몸을 지나는 구간마다 **강 중심선을 따라 계곡**(`valleys` · 폭 = 강 폭 + 4셀)을 얹는다 — 강은 물 그대로, 양 기슭 2셀이 걷는 길(협곡).
#   서버 판정 우선순위: 계곡·고개 > 물 > 바위(`terrain.js isRockCellLocal` · 에디터 셀 미리보기 주석) ⇒ 계곡은 바위만 지우고 물은 그대로 둔다.
#   구간 = 강 표본(32px)이 산맥 몸(그 자리 반폭) 안 · 고개 원 밖인 연속 구간 — t549 자 "산맥을 고개 없이 자름"과 같은 자.
#   계곡 끝은 몸 밖으로 2표본(64px) 더 — 뭍으로 열린다. 한반도 조각(T408 짝)은 건너뛴다.
# 쓰는 법: python3 scripts/t550-canyons.py <폭 얹은 안.json> <협곡 얹은 안.json>   → 옆에 *_canyons.json(표)
import json, math, sys
P = json.load(open(sys.argv[1], encoding='utf-8')); OUT = sys.argv[2]
SZ = 32; PAD = 4 * SZ; EXT = 2
SEAM = {'시로가와', '달재천', '솔여울', '미르내', '쿠로가와'}
XY = lambda p: (p['pos'][0], p['pos'][1])
def seg(px, py, a, b):
    ax, ay = XY(a); bx, by = XY(b); dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
    t = 0 if L2 == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - ax - dx * t, py - ay - dy * t), a['width'] + (b['width'] - a['width']) * t
def in_ridge(x, y):
    for g in P['ridges']:
        for a, b in zip(g['path'], g['path'][1:]):
            d, w = seg(x, y, a, b)
            if d <= w / 2: return g['name']
    return None
def in_pass(x, y):
    return any(math.hypot(x - q['pos'][0], y - q['pos'][1]) <= q['radius'] for q in P.get('passes', []))
def samples(f):
    out = []
    for a, b in zip(f['path'], f['path'][1:]):
        ax, ay = XY(a); bx, by = XY(b); L = math.hypot(bx - ax, by - ay); n = max(1, int(L // SZ))
        for k in range(n):
            t = k / n; out.append((ax + (bx - ax) * t, ay + (by - ay) * t, a['width'] + (b['width'] - a['width']) * t))
    q = f['path'][-1]; out.append((q['pos'][0], q['pos'][1], q['width']))
    return out
rows = []; P.setdefault('valleys', [])
for f in P['rivers']:
    if f['name'] in SEAM: continue
    S = samples(f); tag = [in_ridge(x, y) if not in_pass(x, y) else None for x, y, _ in S]
    i = 0; k = 0
    while i < len(S):
        if not tag[i]: i += 1; continue
        j = i
        while j + 1 < len(S) and tag[j + 1]: j += 1
        a, b = max(0, i - EXT), min(len(S) - 1, j + EXT)
        names = sorted({t for t in tag[i:j + 1] if t})
        pts = S[a:b + 1:4] if (b - a) >= 8 else S[a:b + 1]   # 계곡 꼭짓점은 128px 간격(끝점은 꼭 넣는다)
        if pts[-1] != S[b]: pts = pts + [S[b]]
        k += 1
        P['valleys'].append({'name': f"{f['name']}협곡{k}", 'path': [{'pos': [round(x), round(y)], 'width': round(w + PAD)} for x, y, w in pts], '_canyon': f['name']})
        rows.append(dict(river=f['name'], ridges=names, cells=j - i + 1, wmin=round(min(w for *_, w in S[i:j + 1]) + PAD), wmax=round(max(w for *_, w in S[i:j + 1]) + PAD)))
        i = j + 1
json.dump(P, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False)
json.dump(rows, open(OUT.replace('.json', '_canyons.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(f'협곡 {len(rows)} 구간 · 강 {len({r["river"] for r in rows})} · 셀 {sum(r["cells"] for r in rows)}')
for r in rows: print(f"  {r['river']:<8} {'/'.join(r['ridges']):<16} {r['cells']:>4}셀 · 폭 {r['wmin']}~{r['wmax']}")
