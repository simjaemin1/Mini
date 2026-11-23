#!/usr/bin/env python3
# T1433 보고 표 — 계측 JSON 에서 보고에 붙일 마크다운 줄을 뽑는다(손으로 옮기지 않는다)
#   입력(이 폴더): 진단-끔.json · 진단-켬.json · 지문-800.json · 부팅-끔.json · 부팅-이관.json · 부팅-켬.json · 표-끔.rows.json · 표-켬.rows.json · 부팅덤프-*.json
#   출력: 표준 출력에 ⟨칸 이름⟩ 머리를 단 덩이들
import json, os
D = os.path.dirname(os.path.abspath(__file__))
J = lambda f: json.load(open(os.path.join(D, f), encoding='utf8'))
fmt = lambda n: f'{n:,}' if isinstance(n, int) else (f'{n:,.1f}' if isinstance(n, float) else str(n))
def uniq(S):
    out, seen = [], set()
    for s in S:
        d = 800 if s['name'] == 'dEnd' else s['day']
        if d in seen: continue
        seen.add(d); out.append(s)
    return out
A = uniq(J('진단-끔.json')['snaps']); B = uniq(J('진단-켬.json')['snaps'])
print('⟨DIAG_ROWS⟩')
for s in A:
    t = s['terr']; d = 800 if s['name'] == 'dEnd' else s['day']
    print(f"| {s['name']}({d}) | {fmt(t['rows'])} | {t['dupRows']} | {t['contested']} | {t['dead']} | {fmt(s['pop'])} | {s['livePerPop']} | {fmt(s['capSum'])} | {s['liveOverCap']:.3f} | {s['atCap']} · {s['overCap']}(+{fmt(s['overBy'])}칸) · {s['underCap']} |")
print()
# 판 표
ta = J('표-끔.rows.json')['base']; tb = J('표-켬.rows.json')['base']
la, lb = ta[-1], tb[-1]
REF = 'd300'   # 두 판 모두 있는 같은 날 사본(301날) — 판 자 사본 날이 판마다 달라(T1379 자가 로그 날로 떠서 · 새 main 은 캐러밴 줄이 드물다) 같은 창으로 잰다
def refOf(R): return next(s for s in R if s['name'] == REF)
def slope(R, t):
    last = R[-1]; ref = refOf(R); dd = last['day'] - ref['day']
    r = (last['T'][t]['rows'] - ref['T'][t]['rows']) / dd
    b = ((last['T'][t]['bytes'] + last['T'][t]['idxBytes']) - (ref['T'][t]['bytes'] + ref['T'][t]['idxBytes'])) / dd
    return r, b, ref['day'], last['day']
MB = lambda b: b / 1048576
print('⟨RUN_ROWS⟩')
ea, eb = A[-1], B[-1]
print(f"| 800날 `village_buildings` 행 | {fmt(ea['rows']['village_buildings'])} | {fmt(eb['rows']['village_buildings'])} | ×{eb['rows']['village_buildings']/ea['rows']['village_buildings']:.3f} |")
print(f"| 그중 영토 행(칸 행 · 묶음 행) | {fmt(ea['terr']['rows'])} · 0 | 0 · {fmt(eb['terr']['seqRows'])} | 부팅 한 번 뒤 51 |")
print(f"| 영토 칸(되읽은 산 칸) | {fmt(ea['terr']['live'])} | {fmt(eb['terr']['live'])} | 같음 |")
print(f"| DB 파일 · 쓰는 MB | {MB(la['file']):.1f} · {ea['usedMB']} | {MB(lb['file']):.1f} · {eb['usedMB']} | ×{eb['usedMB']/ea['usedMB']:.3f} |")
for t in ['village_buildings', 'roads', 'buildings', 'harvested_seeds', 'village_chronicle']:
    ra, ba, r0, r1 = slope(ta, t); rb, bb, _, _ = slope(tb, t)
    print(f"| 하루 새 행 `{t}`(d{r0} → d{r1}) | +{ra:.1f} | +{rb:.1f} | {'' if abs(ra) < 1e-9 else f'×{rb/ra:.3f}'} |")
tot = lambda s: sum(v['rows'] for v in s['T'].values())
print(f"| 표 합 행(800날) | {fmt(tot(la))} | {fmt(tot(lb))} | ×{tot(lb)/tot(la):.3f} |")
print()
print('⟨YEAR_ROWS_TAB⟩')
for t in ['village_buildings', 'roads', 'buildings', 'harvested_seeds', 'village_chronicle']:
    out = []
    for R in (ta, tb):
        r, b, _, _ = slope(R, t); L = R[-1]['T'][t]; B0 = L['bytes'] + L['idxBytes']
        out.append(f"{fmt(L['rows'])}행 {MB(B0):.1f} MB → **{fmt(round(L['rows'] + r * 21900))}행 · {MB(B0 + b * 21900):,.0f} MB**")
    print(f"| `{t}` | {out[0]} | {out[1]} |")
allb = lambda s: sum(v['bytes'] + v['idxBytes'] for v in s['T'].values())
def ally(R):
    last = R[-1]; ref = refOf(R); dd = last['day'] - ref['day']
    return allb(last), (allb(last) - allb(ref)) / dd
(a0, asl), (b0, bsl) = ally(ta), ally(tb)
print(f"| 표 전부(바이트 · 색인 포함) | {MB(a0):.1f} MB → **{MB(a0 + asl * 21900):,.0f} MB** | {MB(b0):.1f} MB → **{MB(b0 + bsl * 21900):,.0f} MB** |")
print()
# 부팅
def boots(f):
    try: return {r['name']: r for r in J(f)}
    except Exception: return {}
bo, bm, bn = boots('부팅-끔.json'), boots('부팅-이관.json'), boots('부팅-켬.json')
print('⟨BOOT_ROWS⟩')
cell = lambda r: (f"{r['bootSec']}초 · RSS {r['rssPeakMB']} MB · 첫 틱 {r['firstTick']['ms'] if r.get('firstTick') else '—'} ms" if r and r.get('up') else ('—' if not r else '못 뜸'))
for n in ['d100', 'd400', 'dEnd']:
    print(f"| {n} | {cell(bo.get(n))} | {cell(bm.get(n))} | {cell(bn.get(n))} |")
print()
# 지문
try:
    fp = J('지문-800.json')['res']
    print('⟨FP⟩', json.dumps({k: fp[k] for k in ('same', 'diff', 'terrRows', 'terrCells')}, ensure_ascii=False))
except Exception as e: print('⟨FP⟩ 없음', e)
for f in ('부팅덤프-끔.json', '부팅덤프-이관.json', '부팅덤프-켬.json'):
    try:
        r = J(f); print('⟨DUMP⟩', f, 'up', r.get('upS'), 'heapMax', r.get('heapMax'), 'rssMax', r.get('rssMax'), 'vils', len(r.get('dump') or []))
    except Exception as e: print('⟨DUMP⟩', f, '없음')
