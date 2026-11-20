#!/usr/bin/env python3
# T1376 보고 §4-3 표 — 300날 두 존 판(an_<표지>.json + 하루 줄 끝 · lan.py 와 같은 셈)을 한 줄씩
#   python3 l_rows.py <runs 폴더> L1020 L7 L42 [LB1020]
import json, os, sys
D = sys.argv[1]; TAGS = sys.argv[2:]
ZS = ['hanbando', 'nippon']
def rows(tag, z):
    f = os.path.join(D, f'rows_{tag}_{z}.jsonl')
    return [json.loads(l) for l in open(f) if l.strip()] if os.path.exists(f) else []
def meta(tag):
    try: return json.load(open(os.path.join(D, f'meta_{tag}.json')))
    except Exception: return {}
f = lambda n: f'{n:,}' if isinstance(n, int) else str(n)
print("| 판 | 나무 | 날(한 · 닛) | 넘은 캐러밴('arrive' 한→닛 · 닛→한) | 기록 보존(보낸 존이 적은 수 = 받는 존이 받은 수) | 교역 성사(팔기 · 곳간 입금 · 잃음) | 몸 보존(논리 몸 · 넘김 · 두 존 동시 · 사라짐 · 숨긴 채 남음 · 호위 늚 · 길 위 죽음) | 판 끝 넘어가 귀환 날 지남(한 · 닛) | 머문 이웃 존 상인 보인 날(하루 줄 · 한 · 닛) | 기록 하루 늦음 | 인구 한 · 닛(굶어 죽음) | 교역 행 한 · 닛 | 벽시계 |")
print("|---|---|---|---|---|---|---|---|---|---|---|---|---|")
out = []
for t in TAGS:
    p = os.path.join(D, f'an_{t}.json')
    if not os.path.exists(p): continue
    A = json.load(open(p)); R = {z: rows(t, z) for z in ZS}
    last = {z: (R[z][-1] if R[z] else {}) for z in ZS}
    core = {z: ((last[z].get('xz') or {}).get('core') or {}) for z in ZS}
    C = A['crossed']; B = A['bodies']; S = A['stuck']; F = A['final']
    rec = []
    ok = True
    for a, b in (('hanbando', 'nippon'), ('nippon', 'hanbando')):
        ao, ai, ro, ri, pe = core[a].get('arriveOut'), core[b].get('arriveIn'), core[b].get('returnOut'), core[a].get('returnIn'), core[b].get('pend')
        ok = ok and ao == ai and ro == ri
        rec.append((ao, ai, ro, ri, pe))
    lin = {z: (sum(1 for r in R[z] if r.get('xzLinger', 0) > 0), len(R[z])) for z in ZS}
    lag = A['lag']['dueMinusSend']; nl = sum(lag.values())
    cons = ok and B['both']['n'] == 0 and B['vanished']['n'] == 0 and B['hidden']['left'] == 0 and B['esc']['more'] == 0 and C['lost'] == 0
    tree = '베이스(land1084 · 고침 앞)' if t.startswith('LB') else '합친 나무(고침 셋 기본)'
    m = meta(t)
    print(f"| {t} | {tree} | {A['days']['hanbando']} · {A['days']['nippon']} | {f(rec[0][0])} · {f(rec[1][0])} | "
          f"{'○' if ok else '✗'} 한반도 캐러밴 'arrive' {f(rec[0][0])} = {f(rec[0][1])} · 'return' {f(rec[0][2])} = {f(rec[0][3])} / 닛폰 캐러밴 {f(rec[1][0])} = {f(rec[1][1])} · {f(rec[1][2])} = {f(rec[1][3])} · 받는 줄 남음 {rec[0][4]} · {rec[1][4]} | "
          f"{f(C['soldOk'])} · {f(C['deposited'])} · {C['lost']} | {f(B['logical'])} · {f(B['handoffs'])} · {B['both']['n']} · {B['vanished']['n']} · {B['hidden']['left']} · {B['esc']['more']} · {B['esc']['way']['died']} | "
          f"{S['hanbando']['overdue'] if S.get('hanbando') else '-'} · {S['nippon']['overdue'] if S.get('nippon') else '-'} | {lin['hanbando'][0]}/{lin['hanbando'][1]} · {lin['nippon'][0]}/{lin['nippon'][1]} | "
          f"{' · '.join(f'{k}날 {f(v)}' for k, v in sorted(lag.items(), key=lambda x: int(x[0])))}/{f(nl)} · 설명 안 됨 {A['lag']['late']['unexplained']} | "
          f"{f(F['hanbando']['pop'])} · {f(F['nippon']['pop'])}({F['hanbando']['fdDeaths']} · {F['nippon']['fdDeaths']}) | {f(F['hanbando']['trades'])} · {f(F['nippon']['trades'])} | {f(m.get('wallS', '-'))}초 |")
    out.append((t, cons))
print()
print('<!-- 합 보존 ' + ' · '.join(f"{t} {'○' if c else '✗'}" for t, c in out) + ' -->')
