#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T669 표 · 관측 전용 · 새 수 0 · 판정 0)
# 자(t17) 두 판의 씨앗(`LAB_SEEDCACHE` JSON)을 마을마다 맞댄다 — 중심 칸(ccx,ccy) · 바다까지 거리(`lp._seaDistPx` ÷ 32 · econ 이 받는 값) · 물가(lp.water) · 마당 칸 수.
#   한 판 = 지금 자(한반도 `T17_COAST` 끔) · 다른 판 = 서버 정본 해안(`T17_COAST=1` — 서버 `WATER_TILES` 와 같은 `generateCoastlineWaterTiles` 를 물 술어에 넣음).
# 쓰는 법: python3 scripts/t669-coast-diff.py <판A seeds.json> <판B seeds.json> [이름A] [이름B]
import json, sys, math
A, B = (json.load(open(p)) for p in sys.argv[1:3]); na, nb = (sys.argv[3:5] + ['A', 'B'])[:2] if len(sys.argv) > 3 else ('A', 'B')
bm = {s['name']: s for s in B}
rows = []
for a in A:
    b = bm.get(a['name'])
    if not b: rows.append((a['name'], '판B 없음')); continue
    da = (a['lp'] or {}).get('_seaDistPx'); db = (b['lp'] or {}).get('_seaDistPx')
    mv = math.hypot(b['ccx'] - a['ccx'], b['ccy'] - a['ccy'])
    ch = mv > 0 or da != db or (a['lp'] or {}).get('water') != (b['lp'] or {}).get('water')
    rows.append(dict(name=a['name'], a=[a['ccx'], a['ccy']], b=[b['ccx'], b['ccy']], move=round(mv, 1), seaA=None if da is None else round(da / 32, 1), seaB=None if db is None else round(db / 32, 1),
                     dSea=None if da is None or db is None or da == float('inf') else round((db - da) / 32, 1), wA=(a['lp'] or {}).get('water'), wB=(b['lp'] or {}).get('water'), ch=ch))
chg = [r for r in rows if isinstance(r, dict) and r['ch']]
print(f'| 마을 | 중심 {na} | 중심 {nb} | 옮김(셀) | 바다 거리 {na}(셀) | {nb}(셀) | 차(셀) | 물가 {na} → {nb} |')
print('|---|---|---|---:|---:|---:|---:|---|')
for r in chg: print(f"| {r['name']} | {tuple(r['a'])} | {tuple(r['b'])} | {r['move']} | {r['seaA']} | {r['seaB']} | {r['dSea']:+} | {r['wA']} → {r['wB']} |")
mx = max((abs(r['dSea']) for r in rows if isinstance(r, dict) and r['dSea'] is not None), default=0)
mm = max((r['move'] for r in rows if isinstance(r, dict)), default=0)
print(f"\n마을 {len(rows)} · 다른 곳 {len(chg)} · 중심 옮김 최대 {mm}셀 · 바다 거리 차 최대 {mx}셀")
