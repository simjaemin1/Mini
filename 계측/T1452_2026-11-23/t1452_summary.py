#!/usr/bin/env python3
# T1452 보고 첫 줄 · 한 줄 답의 수 — t1452_report.py 의 JSON 을 읽어 모은다(손으로 옮겨 적지 않게)
# 쓰는 법: python3 t1452_summary.py <rep.json>
import json, sys, statistics as st

R = json.load(open(sys.argv[1], encoding='utf-8'))
SEEDS = ('1020', '7', '42')
out = {}

# ① 진단 — 밭 세계 재는 판(FS) 세 시드 묶음 · H 90 · 틀림 % = 놓침 + 헛울림(마을-날 무게)
def pooled(prefix, H):
    acc = {}
    for k, r in R['diag'].items():
        if not k.startswith(prefix) or not k.endswith(f':{H}'): continue
        for f, v in r['all'].items():
            a = acc.setdefault(f, [0, 0, 0]); a[0] += v['놓침%'] * v['날']; a[1] += v['헛울림%'] * v['날']; a[2] += v['날']
    return {f: {'miss': round(a[0] / a[2], 1), 'false': round(a[1] / a[2], 1), 'wrong': round((a[0] + a[1]) / a[2], 1)} for f, a in acc.items() if a[2]}
out['diagFarm90'] = pooled('FS-', 90); out['diagLab90'] = pooled('LS-', 90)
out['diagFarm180'] = pooled('FS-', 180); out['diagFarm30'] = pooled('FS-', 30)

# ② 맞음 — 재는 판(FS · LS) 시드마다 가운데 |차| · 열에 아홉 · 치우침 → 시드 가운데
def accOf(prefix):
    o = {}
    for h in ('h30', 'h90', 'h180'):
        xs = [R['acc'][f'{prefix}-{s}'][h] for s in SEEDS if f'{prefix}-{s}' in R['acc'] and R['acc'][f'{prefix}-{s}'][h]['n']]
        if not xs: continue
        o[h] = {'med': round(st.median(x['가운데|차|'] for x in xs), 1), 'p90': round(st.median(x['열에아홉|차|'] for x in xs), 1), 'bias': round(st.median(x['치우침(가운데 차)'] for x in xs), 1), 'n': len(xs)}
    em = [R['acc'][f'{prefix}-{s}']['비상%'] for s in SEEDS if f'{prefix}-{s}' in R['acc']]
    if em: o['emerg'] = {k: round(st.mean(e[k] for e in em), 1) for k in 'suaw'}
    sh = [R['acc'][f'{prefix}-{s}']['모자람%'] for s in SEEDS if f'{prefix}-{s}' in R['acc']]
    if sh: o['short'] = {k: round(st.mean(e[k] for e in sh), 1) for k in 'suaw'}
    return o
for p in ('FS', 'FA', 'LS', 'LA', 'EQS', 'EQA', 'FR', 'FRe', 'FY', 'FH', 'FM', 'LR', 'Fseen'):
    a = accOf(p)
    if a: out['acc_' + p] = a

# ③ 판 — 팔마다 세 시드 합 · 가운데
def armOf(tag):
    rows = [R['tbl'][f'{tag}-{s}'] for s in SEEDS if f'{tag}-{s}' in R['tbl']]
    if not rows: return None
    return {'n': len(rows), 'seeds': [s for s in SEEDS if f'{tag}-{s}' in R['tbl']], 'dead': sum(r['deadTot'] for r in rows), 'deadY': [sum((r['dead'][i] or 0) for r in rows) for i in range(2)],
            'pop': [r['pop'] for r in rows], 'empty': sum(r['empty'] for r in rows), 'lj0': round(st.mean(r['lj0'] for r in rows), 1),
            'woodPxEnd': round(st.median(r['woodPxEnd'] for r in rows), 2), 'fdMed': round(st.median(r['fdMed'] for r in rows), 1),
            'miner': [r['miner'] for r in rows], 'bronze': round(st.median(r['bronze'] for r in rows), 1), 'housing': [r['housing'] for r in rows]}
for tag in ('FS', 'Fseen', 'FA', 'FR', 'FRe', 'FY', 'FH', 'FM', 'LS', 'Lseen', 'LA', 'LR', 'LH', 'LM', 'EQS', 'EQseen', 'EQA', 'EQR'):
    a = armOf(tag)
    if a: out['arm_' + tag] = a
def ratio(a, b):   # 인구 끔비(같은 시드끼리 · 가운데)
    if not a or not b: return None
    xs = [x / y for x, y, s1, s2 in zip(a['pop'], b['pop'], a['seeds'], b['seeds']) if s1 == s2 and y]
    return round(st.median(xs), 3) if xs else None
for x, base in (('FA', 'FS'), ('Fseen', 'FS'), ('FR', 'FS'), ('FRe', 'FS'), ('FY', 'FS'), ('FH', 'FS'), ('FM', 'FS'), ('LA', 'LS'), ('Lseen', 'LS'), ('LR', 'LS'), ('LH', 'LS'), ('LM', 'LS'), ('EQA', 'EQS'), ('EQseen', 'EQS'), ('EQR', 'EQS')):
    if 'arm_' + x in out: out['arm_' + x]['popRatio'] = ratio(out['arm_' + x], out.get('arm_' + base))

# µs — 랩 판(가상 시계 없는 판)의 장부 셈
us = [(k, v['us'] / v['evals'], v['maxUs']) for k, v in R['stat'].items() if v and v.get('evals') and v.get('us')]
if us: out['us'] = {'meanOfRuns': round(st.median(u for _, u, _ in us), 1), 'max': round(max(m for _, _, m in us)), 'runs': len(us)}
print(json.dumps(out, ensure_ascii=False, indent=1))
