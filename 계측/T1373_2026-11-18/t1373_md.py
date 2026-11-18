#!/usr/bin/env python3
# T1373 보고 표 — t1373_table.py JSON → 마크다운 줄(§1 진단 · §3 땔감 몫 · §7 판)
#   python3 t1373_md.py <표 JSON> [팔 차례 …]
import json, sys
T = json.load(open(sys.argv[1])); ARMS = sys.argv[2:] or list(T)
SEEDS = ['1020', '7', '42']
f = lambda x: '—' if x is None else (f'{x:,}' if isinstance(x, int) else (f'{x:,.1f}' if isinstance(x, float) else str(x)))
def till(a):
    L = a['last']
    return '' if L >= 1094 else f'(날 {L} 까지)'
def yrs(v, a, n=3):
    L = a['last']; out = []
    for i in range(n):
        if i * 365 > L or (i == 2 and L < 900): out.append('—')   # 3년째 70날 남짓(800날 판)은 칸에 안 올린다
        else: out.append(f(v[i]) + ('' if (i + 1) * 365 - 1 <= L else f'(날 {L} 까지)'))
    return ' · '.join(out)
print('### §7 판 표')
print('| 팔 | 시드 | 인구 날 364 · 729 · 1,094(명) | 굶어 죽음 1 · 2 · 3년째 | K 위 죽음 1 · 2 · 3년째 | 땅 몫 | 땔감 몫 | 건강 몫(로지스틱 0 이상 날) | 겨울 꺾임 % 1 · 2 · 3 | 빈 마을(해 끝) · 비었던 마을 | 마을별 최악 — 한 해 가장 큰 내림 · 한 해 굶음 몫 | 주거 문에 막힌 마을-날 1 · 2 · 3년째 |')
print('|---|---|---|---|---|---|---|---|---|---|---|---|')
for arm in ARMS:
    e = T.get(arm)
    if not e: continue
    for s in SEEDS:
        a = e['seeds'].get(s)
        if not a or ('err' in a and len(a) == 1): continue
        pop = ' · '.join(f(x) for x in a['pop'])
        wd = ' · '.join('—' if x is None else f'{x:.1f}' for x in a['winter_drop'])
        ee = ' · '.join(f(x) for x in a['empty_end'])
        wst = f"{a['worst_drop'][0]:.1f}%({a['worst_drop'][1]} · {a['worst_drop'][2]}년) · {a['worst_fd'][0]:.1f}%({a['worst_fd'][1]} · {a['worst_fd'][2]}년)"
        print(f"| {e['label']} | {s} | {pop} | {yrs(a['fd'], a)} | {yrs(a['kov'], a)} | {yrs(a['land'], a)} | {yrs(a['fuel'], a)} | {yrs(a['other'], a)} | {wd} | {ee} · {a['n_empty']} | {wst} | {yrs(a['gated'], a)} |")
print()
print('### §1 진단 — K 를 묶은 칸(두 해 · 사람 있는 마을-날) · 넘김 · 땅만 넘긴 날')
print('| 팔 | 시드 | 묶은 칸 slotK · prodK · fuelK(마을-날) | 주거 문 막힘 | 사람 > min(slotK · fuelK) — 땅 쪽 · 땔감 쪽 | slotK < 사람 ≤ fuelK 마을-날 · 그날 K 위 죽음 · 그 가운데 로지스틱 음수 날 · 죽음 | 계절 배수만이 slotK 를 사람 밑으로(마을-날 · 죽음) |')
print('|---|---|---|---|---|---|---|')
for arm in ARMS:
    e = T.get(arm)
    if not e: continue
    for s in SEEDS:
        a = e['seeds'].get(s)
        if not a or ('err' in a and len(a) == 1): continue
        b = a['bind']; bo = a['bind_over']
        print(f"| {e['label']} | {s} | {f(b.get('slotK', 0))} · {f(b.get('prodK', 0))} · {f(b.get('fuelK', 0))} | {f(b.get('gated', 0))} | {f(bo.get('slot', 0))} · {f(bo.get('fuel', 0))} | {f(a['landonly'][0])} · {f(a['landonly'][1])} · {f(a['landonly_logi'][0])} · {f(a['landonly_logi'][1])} | {f(a['seasononly'][0])} · {f(a['seasononly'][1])} |")
print()
print('### §3 땔감 K 가 사람 밑인 마을-날 · 그날 K 위 죽음 · 땔감 곳간 가운데값(해마다)')
print('| 팔 | 시드 | 1년째 | 2년째 | 3년째 |')
print('|---|---|---|---|---|')
for arm in ARMS:
    e = T.get(arm)
    if not e: continue
    for s in SEEDS:
        a = e['seeds'].get(s)
        if not a or ('err' in a and len(a) == 1): continue
        fu = a['fuel_under']; cells = []
        for y in ('1', '2', '3'):
            v = fu.get(y)
            cells.append('—' if not v else f"{f(v[0])} · {f(v[1])} · {f(v[2])}")
        print(f"| {e['label']} | {s} | " + ' | '.join(cells) + ' |')
print()
print('### ⓒ 계절 배수 몫(마을-날 평균 비 — 그날 econ 이 본 값 ÷ 계절 배수만 뺀 값) · 1인 하루 산출(econ 단위)')
for arm in ARMS:
    e = T.get(arm)
    if not e: continue
    for s in SEEDS:
        a = e['seeds'].get(s)
        if not a or ('err' in a and len(a) == 1): continue
        ss = a['sea_slot']; sw = a['sea_wcap']; pc = a['pc']
        nm = ['봄', '여름', '가을', '겨울']
        print(f"- {e['label']} {s}: slotK " + ' · '.join(f"{nm[int(k)]} {v[0]}" for k, v in sorted(ss.items())) + ' / 숲 몫 ' + ' · '.join(f"{nm[int(k)]} {v[0]}" for k, v in sorted(sw.items()))
              + ' / 1인 산출 농 ' + ' · '.join(f"{nm[i]} {pc.get(f'{i}|n_farmer')}" for i in range(4)) + ' · 어 ' + ' · '.join(f"{nm[i]} {pc.get(f'{i}|n_fisher')}" for i in range(4))
              + ' · 사냥 ' + ' · '.join(f"{nm[i]} {pc.get(f'{i}|n_hunter')}" for i in range(4)))
print()
print('### ⓓ 주거 · 집터')
for arm in ARMS:
    e = T.get(arm)
    if not e: continue
    for s in SEEDS:
        a = e['seeds'].get(s)
        if not a or ('err' in a and len(a) == 1): continue
        print(f"- {e['label']} {s}: {a['site']}")
