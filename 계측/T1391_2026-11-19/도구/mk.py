#!/usr/bin/env python3
# T1391 표 전부 → out/*.md (ana.py 함수 그대로) · python3 mk.py
import os, sys, json, importlib.util
os.environ['T1391_ANA'] = 'none'
D = os.path.dirname(os.path.abspath(__file__))
sys.argv = ['ana.py', 's2.json', 's3.json', 'wB.json', 'wW.json']
spec = importlib.util.spec_from_file_location('ana', os.path.join(D, 'ana.py')); A = importlib.util.module_from_spec(spec); spec.loader.exec_module(A)
# s2 의 ALL_7(메모리 넘침으로 죽은 판)은 s3 의 다시 돈 판이 대신한다 — 같은 tag · 같은 폴더(runs/ALL_7)라 한 번만 센다
seen = set(); RUNS = []
for r in A.RUNS:
    if r['tag'] in seen: continue
    seen.add(r['tag']); RUNS.append(r)
A.RUNS[:] = RUNS
SUM = [s for s in (A.summary(r) for r in RUNS) if s]
json.dump(SUM, open(os.path.join(D, 'out', 'sum.json'), 'w'), ensure_ascii=False, indent=1)
W = lambda n, t: open(os.path.join(D, 'out', n), 'w').write(t + '\n')
W('tabA.md', A.tables(SUM))
W('tabMain.md', A.main_table(SUM))
W('tabNow.md', A.now_table(SUM))
W('tabCause.md', A.cause_table(SUM))
W('tabProt.md', A.prot_table(SUM))
W('tabRich.md', A.rich_table(SUM))
t, n = A.rich_effect_table(); W('tabRichEff.md', t)
for kind, seeds in (('sbc', (1020, 7, 42)), ('war', (1020,)), ('body', (1020,))):
    t, n = A.feedback_table(kind=kind, seeds=seeds); W(f'tabFeed_{kind}.md', t)
    W(f'corr_{kind}.json', json.dumps({a: A.feedback_corr(kind=kind, seeds=seeds, arm_=a) for a in ('ALL', 'NH')}, ensure_ascii=False))
W('tabMainWar.md', A.main_table(SUM, kind='war', seeds=(1020,), arms=('OFF', 'NH', 'ALL')))
W('tabMainBody.md', A.main_table(SUM, kind='body', seeds=(1020,), arms=('OFF', 'NH', 'ALL')))
W('tabAWar.md', A.tables(SUM, seeds=(1020,), kind='war'))
W('tabABody.md', A.tables(SUM, seeds=(1020,), kind='body'))
rec = {r['tag']: A.recovery(r) for r in RUNS}
W('recovery.json', json.dumps(rec, ensure_ascii=False))
W('sameR.json', json.dumps(A.same_world('R_1020', 'OFF_1020', 1020), ensure_ascii=False))
print('ok', len(SUM), [(s['tag'], s['days'], s['done']) for s in SUM])
# 마을-달 줄(할 일 1 — 끔 세계 3시드) CSV
import csv
for r in RUNS:
    if not r['tag'].startswith('OFF_') or r.get('kind', 'sbc') != 'sbc': continue
    h, _ = A.load(r)
    if not h: continue
    V = A.vmrows(h); names = h['names']
    with open(os.path.join(D, 'out', f"마을달_{r['tag']}.csv"), 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['시드', '달', '마을', '날', '끝 인구', '최저 인구', '평균 행복', '0.25 밑 날', '0.32 밑 날', '불행 이탈 문(번)', '이웃 마을로', '남음(마을-날)', '죽음', '굶어 죽음',
                    '캐러밴 보냄', '짐 보냄', '식량 수입', '행상 피살', '털린 캐러밴', '잃은 짐', '약탈 건', '약탈 양', '약탈 식량', '평균 인구 부담 B', '사람당 식량(평균)', '전사(끝)', '위험 최대', '목책(끝)',
                    '0.25 밑 날 좋은 것 G 합', '겪은 일 E 합', '부담 B 합', '느린 S 합', '굶는 몫 합', '새 캐러밴', '호위'])
        for x in sorted(V, key=lambda x: (x['m'], x['v'])):
            dd = x['days'] or 1
            w.writerow([r['seed'], x['m'] + 1, names[x['v']], x['days'], x['Nend'], x['Nmin'], round(x['hSum'] / dd, 4), x['u25'], x['u32'], x.get('emTry', 0), x.get('emMove', 0), x.get('emStay', 0), x['dead'], x['fd'],
                        x['sent'], x['cargo'], x['foodImp'], x['killed'], x['raided'], x['lost'], x['lootN'], x['lootAmt'], x['lootFood'], round(x['hBSum'] / dd, 4), round(x['feSum'] / dd, 3), x['warEnd'], x['riskMax'], x['palEnd'],
                        x.get('uG', 0), x.get('uE', 0), x.get('uB', 0), x.get('uS', 0), x.get('uStv', 0), x.get('car', 0), x.get('esc', 0)])
print('csv ok')
# 행복 회복 표(팔마다 3시드 합)
def rec_row(kind, arms=('OFF', 'NH', 'ALL'), seeds=(1020, 7, 42)):
    out = ['| 팔 | 덜어 낸 길 | 마을-달(그 달에 사람이 나간) | 다음 달 행복이 오른 몫 | 다음 달 행복 Δ 평균 |', '|---|---|---|---|---|']
    for a in arms:
        for k, nm in (('emMove', '이웃 마을로(이주)'), ('emBandit', '도적')):
            n = up = 0; s = 0.0
            for sd in seeds:
                r = next((x for x in RUNS if x['tag'] == f'{a}_{sd}' and x.get('kind', 'sbc') == 'sbc') if kind == 'sbc' else (x for x in RUNS if x.get('kind') == kind and x['tag'].startswith(a + '_') and x['seed'] == sd), None)
                if not r: continue
                R = A.recovery(r)
                if not R or not R[k]['n']: continue
                n += R[k]['n']; up += R[k]['up']; s += R[k]['mean'] * R[k]['n']
            if n: out.append(f"| {A.ARMN[a]} | {nm} | {A.fmt(n)} | {up / n * 100:.0f}%({up}/{n}) | {s / n:+.3f} |")
    return '\n'.join(out)
W('tabRec.md', rec_row('sbc'))
W('tabRecWar.md', rec_row('war', seeds=(1020,)))
W('tabRecBody.md', rec_row('body', seeds=(1020,)))
print('rec ok')
# 몸 — 도적 전환 n 중 몸으로 걸은 몸(몸 층 장부: 단에 듦 `desert` · 새 단 · 모이는 단 `bandit`) · 이주 몸
def body_rows():
    out = ['| 판 | 몸 상한 | 도적 전환 | 몸으로 걸은 도적 몸(단에 듦 · 단 세우기) | 이주(이웃 마을로) | 이주 몸 | 몸이 쓰러진 도적(굶음) |', '|---|---|---|---|---|---|---|']
    for s in SUM:
        w = s.get('bxWalk') or {}; dd = s.get('bxDied') or {}
        cap = '1(판 자)' if s['kind'] == 'sbc' else ('40(`Infinity` 글자 → 40)' if s['kind'] in ('war', 'body') else '—')
        out.append(f"| {s['tag']} | {cap} | {A.fmt(s['emBandit'])} | {A.fmt(w.get('desert'))} · {A.fmt(w.get('bandit'))} | {A.fmt(s['emMove'])} | {A.fmt(w.get('move'))} | {A.fmt(dd.get('bandit_starve'))} |")
    return '\n'.join(out)
W('tabBody.md', body_rows())
print('body ok')
# 전쟁 기준선 조건 · 몸 세계 표(판 끝 날까지 · 관찰기 줄)
def wb_table(kind, arms=('OFF', 'NH', 'ALL')):
    H = ['팔', '날', '인구 365 · 끝(끔비)', '빈 마을 끝', '굶어 죽음', '죽음 전체', '단 끝 · 봉우리', '단원 봉우리', '습격(약탈 건)', '행상 피살', '약탈 식량', '교역 식량 · 짐 전체', '캐러밴 · 호위', '토벌', '불행 이탈 문 → 이웃 · 도적 · 남음(마을-날)', '불행 마을-날 0.25 밑']
    out = ['| ' + ' | '.join(H) + ' |', '|' + '---|' * len(H)]
    S = {s['tag'].split('_')[0]: s for s in SUM if s['kind'] == kind}
    off = S.get('OFF')
    for a in arms:
        s = S.get(a)
        if not s: continue
        rr = f"({s['popEnd'] / off['popEnd']:.2f})" if off and a != 'OFF' and off.get('popEnd') else ''
        out.append('| ' + ' | '.join([A.ARMN[a], str(s['days']), f"{A.fmt(s['pop365'])} · {A.fmt(s['popEnd'])}{rr}", A.fmt(s['emptyEnd']), A.fmt(s['fd']), A.fmt(s['dead']), f"{A.fmt(s['gangsEnd'])} · {A.fmt(s['gangsPeak'])}",
            A.fmt(s['memPeak']), A.fmt(s['lootN']), A.fmt(s['killed']), A.fmt(s['lootFood']), f"{A.fmt(s['foodImp'])} · {A.fmt(s['cargo'])}", f"{A.fmt(s['newCar'])} · {A.fmt(s['esc'])}", A.fmt(s['sup']),
            f"{A.fmt(s['emTry'])} → {A.fmt(s['emMove'])} · {A.fmt(s['emBandit'])} · {A.fmt(s['emStay'])}", A.fmt(s['u25'])]) + ' |')
    return '\n'.join(out)
W('tabWar.md', wb_table('war'))
W('tabBodyW.md', wb_table('body'))
print('wb ok')
