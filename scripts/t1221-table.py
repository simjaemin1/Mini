#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T1221 표 기계 · `t1221-observe.js` 가 찍은 `<판>-<시드>.t1221.json` 만 읽는다 · 산수뿐 · 판정 0)
# =============================================================================
# 쓰는 법: python3 scripts/t1221-table.py <뿌리> <판,…> [시드,…]   ⇒ <뿌리>/run-<판>/base-<시드>.t1221.json
#   표 ① 농부 하루 중 밭일 몫(달마다 · 3시드 합) — 켬 판 = 쓴 초 ÷ 하루 낮 초 몫 · 끈 판 = 한 일감 ÷ 일감 몫(일괄 · 몸 갈래 둘 다 `_t1212Rest`)
#   표 ② 마을 · 비옥 사분위 — 농사만 덮음 = 창(첫 찍음 → 끝 찍음) 안 밭 식량등가 차 ÷ 사람-날 차 · 끝 인구 · 영토 · 밭 칸 · 덮음 > 1 마을 몫
# =============================================================================
import json, os, sys
root = sys.argv[1]; arms = sys.argv[2].split(','); seeds = (sys.argv[3] if len(sys.argv) > 3 else '1020,7,42').split(',')
def load(a, s):
    f = os.path.join(root, f'run-{a}', f'base-{s}.t1221.json')
    return json.load(open(f)) if os.path.exists(f) else None
MO = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '1', '2']
print('### ① 농부 하루 중 밭일 몫(30날 창마다 · 3시드 합)\n')
print('| 판 | ' + ' | '.join(f'{d}날' for d in range(30, 400, 30)) + ' |')
print('|---|' + '---:|' * 13)
for a in arms:
    row = []
    for i in range(13):
        num = den = 0
        for s in seeds:
            d = load(a, s)
            if not d or len(d['shots']) <= i: continue
            sh = d['shots'][i]; pv = d['shots'][i - 1] if i > 0 else None
            lab = sh.get('lab') or {}
            if lab.get('budgetS', 0) > 0:
                u = lab['usedS'] - ((pv or {}).get('lab') or {}).get('usedS', 0); b = lab['budgetS'] - ((pv or {}).get('lab') or {}).get('budgetS', 0)
            else:
                r, r0 = sh.get('rest') or {}, ((pv or {}).get('rest') or {})
                u = r.get('batchTasks', 0) - r0.get('batchTasks', 0); b = r.get('restBudget', 0) - r0.get('restBudget', 0)
            num += u; den += b
        row.append(f'{100 * num / den:.1f}%' if den > 0 else '—')
    print(f'| {a} | ' + ' | '.join(row) + ' |')
print('\n### ② 비옥 사분위 — 농사만 덮음(밭 식량 ÷ 먹은 사람-날 · 첫 찍음 → 끝 찍음) · 끝 인구 · 영토 · 밭 칸\n')
print('| 판 | 사분위(비옥 순위) | 마을-시드 | 덮음 가운데 | 덮음 > 1 몫 | 끝 인구 합 | 빈 마을 | 영토 가운데 | 밭 칸 가운데 | 비옥도 범위 |')
print('|---|---|---:|---:|---:|---:|---:|---:|---:|---|')
med = lambda a: (sorted(a)[len(a) // 2] if a else None)
for a in arms:
    rows = []
    for s in seeds:
        d = load(a, s)
        if not d or len(d['shots']) < 2: continue
        A, Z = d['shots'][0], d['shots'][-1]
        za = {v['n']: v for v in A['vs']}
        for v in Z['vs']:
            v0 = za.get(v['n'])
            if not v0: continue
            pd = v['pd'] - v0['pd']; ff = v['ff'] - v0['ff']
            rows.append(dict(r=v['r'] if v['r'] is not None else 0, f=v['f'], cov=(ff / pd if pd > 0 else 0), pop=v['pop'], terr=v['terr'], farm=v['farm']))
    for lab_, lo, hi in [('하위 ¼', -1, 0.25), ('둘째 ¼', 0.25, 0.5), ('셋째 ¼', 0.5, 0.75), ('상위 ¼', 0.75, 2)]:
        g = [x for x in rows if lo < x['r'] <= hi] if lo >= 0 else [x for x in rows if x['r'] <= hi]
        if not g: continue
        c = [x['cov'] for x in g]
        print(f"| {a} | {lab_} | {len(g)} | {med(c):.2f} | {sum(1 for x in c if x > 1) / len(c):.2f} | {sum(x['pop'] for x in g):,} | {sum(1 for x in g if x['pop'] == 0)} | {med([x['terr'] for x in g]):,} | {med([x['farm'] for x in g]):,} | {min(x['f'] for x in g):.2f} ~ {max(x['f'] for x in g):.2f} |")
