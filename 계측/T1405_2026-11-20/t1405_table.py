#!/usr/bin/env python3
# T1405 판 표 — `t1405_diag.py --out` JSON 들을 읽어 보고 표(마크다운)를 낸다(세계 0 · 읽기만)
#   실행: python3 t1405_table.py <diag JSON …> [--md <out.md>] [--json <out.json>]
#   표 ① 팔 × 시드: 떠난 사람(해마다) · 0.25 밑 마을-날 · 가장 큰 다섯(끝 해) · 200명 넘는 마을(해마다) · 가장 큰 마을(판 전체) · 해 끝 인구 · 굶어 죽음 · 빈 마을
#   표 ② 누가 떠났나(팔마다 · 시드 합): 큰 마을 붐빔 · 작은 마을 굶주림 기억 · 그 사이 — 떠난 사람 · 0.25 밑 마을-날
import json, sys, collections
A = sys.argv[1:]
MD = A[A.index('--md') + 1] if '--md' in A else None
JO = A[A.index('--json') + 1] if '--json' in A else None
FILES = [a for a in A if a.endswith('.json') and a not in (MD, JO)]
ARM = {'OFF': '끔(지금 main)', 'RB1': '㉠ + ㉡ 첫 판(곡선이 h 를 그대로 읽음 — 버림)', 'RB': '㉠ + ㉡', 'R': '㉠ 받는 쪽 문만', 'B': '㉡ 출생 곡선만', 'RBX': '㉠ + ㉡ + ㉣(T1394 가지 얹음)',
       'BK': '묶음(T1334) 끔', 'BKRB': '묶음 + ㉠ + ㉡', 'BKLRB': '묶음 + ㉢(T1380 가지 얹음) + ㉠ + ㉡', 'RBS': '㉠ + ㉡ + 반사실 S 위 끝 1(판 자)'}
ORDER = ['OFF', 'RB1', 'B', 'R', 'RB', 'RBX', 'RBS', 'BK', 'BKRB', 'BKLRB']
runs = []
for f in FILES:
    for r in json.load(open(f)): runs.append(r)
seen = {}
for r in runs: seen[(r['arm'], str(r['seed']))] = r   # 같은 팔 · 시드는 뒤 파일이 이긴다
runs = sorted(seen.values(), key=lambda r: (ORDER.index(r['arm']) if r['arm'] in ORDER else 99, {'7': 0, '42': 1, '1020': 2}.get(str(r['seed']), 9)))
fmt = lambda x: '—' if x is None else (f'{x:,}' if isinstance(x, int) else str(x))
def yrs(r):
    return [(int(y), x) for y, x in sorted(r['years'].items(), key=lambda t: int(t[0]))]
def col(r, k, full_only=False):
    out = []
    for y, x in yrs(r):
        v = x.get(k)
        if full_only and not x['full']: v = None
        s = fmt(v)
        if not x['full'] and v is not None: s += f"(날 {r['last']} 까지)"
        out.append(s)
    return ' · '.join(out)
L = []
L.append('| 팔 | 시드 | 떠난 사람 1 · 2(· 3 · 4)년째 | 0.25 밑 마을-날 1 · 2(· 3 · 4)년째 | 가장 큰 다섯(끝 해 · 그 해 가장 큰 사람) | 200명 넘은 마을(해마다) · 판 전체 가장 큰 마을 | 해 끝 인구 | 굶어 죽음(해마다) | 빈 마을 |')
L.append('|---|---|---|---|---|---|---|---|---|')
J = []
for r in runs:
    ys = yrs(r); last = ys[-1][1]
    top = ' · '.join(f'{n} {c}' for n, c in last['top5'])
    emp = sorted(set(n for _, x in ys for (n, d) in x['emptied']))
    L.append(f"| {ARM.get(r['arm'], r['arm'])} | {r['seed']} | {col(r, 'emig')} | {col(r, 'u25')} | {top} | {' · '.join(str(x['over200']) for _, x in ys)} · **{r.get('maxNever', '—')}** | "
             f"{col(r, 'popEnd', True)} | {col(r, 'fd')} | {len(emp)}{(' (' + ' · '.join(emp) + ')') if emp else ''} |")
    J.append({'arm': r['arm'], 'seed': r['seed'], 'last': r['last'], 'emig': [x['emig'] for _, x in ys], 'u25': [x['u25'] for _, x in ys], 'fd': [x['fd'] for _, x in ys],
              'pop': [x['popEnd'] for _, x in ys], 'over200': [x['over200'] for _, x in ys], 'maxN': r.get('maxNever'), 'emptied': emp, 'top5': last['top5'],
              'groups': [x['groups'] for _, x in ys], 'u25g': [x.get('u25g') for _, x in ys]})
L.append('')
# 표 ② 누가 떠났나 — 팔마다 시드 합 · 두 해(1 · 2년째)
G = [('big|B', '큰 마을(100명 넘음) — 붐빔(부담 B ≥ 겪은 일 E)'), ('small|E', '작은 마을(50명 밑) — 굶주림 기억(E > B)'), ('mid|E', '그 사이(50 ~ 100명) — 굶주림 기억'),
     ('mid|B', '그 사이 — 붐빔'), ('big|E', '큰 마을 — 굶주림 기억'), ('small|B', '작은 마을 — 붐빔')]
arms = [a for a in ORDER if any(r['arm'] == a for r in runs)]
L.append('| 무리 | ' + ' | '.join(f"{ARM[a]} 떠난 사람 1 · 2년째(0.25 밑 마을-날)" for a in arms) + ' |')
L.append('|---|' + '---|' * len(arms))
for k, lab in G:
    row = [lab]
    for a in arms:
        rs = [r for r in runs if r['arm'] == a]
        e = [sum(r['years'].get(str(y), r['years'].get(y, {})).get('groups', {}).get(k, 0) for r in rs) for y in (1, 2)]
        u = [sum((r['years'].get(str(y), r['years'].get(y, {})).get('u25g') or {}).get(k, 0) for r in rs) for y in (1, 2)]
        row.append(f"{e[0]:,} · {e[1]:,}({u[0]:,} · {u[1]:,})" + (f" — 시드 {len(rs)}" if len(rs) != 3 else ''))
    if any(c.split('(')[0] != '0 · 0' or '(0 · 0)' not in c for c in row[1:]): L.append('| ' + ' | '.join(row) + ' |')
out = '\n'.join(L)
print(out)
if MD: open(MD, 'w').write(out + '\n')
if JO: json.dump(J, open(JO, 'w'), ensure_ascii=False, indent=1)
