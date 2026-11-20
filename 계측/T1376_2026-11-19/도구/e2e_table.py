#!/usr/bin/env python3
# T1376 e2e-xzone-caravan 가상 시계 판 — 판마다 건 · PASS · FAIL · 빨강 줄 · 서명(sig.py) · 표 줄 몇 · 존 로그 econ 날 줄 · 벽시계 → 표(마크다운)
#   python3 e2e_table.py <사슬 폴더> [묶음 …]   묶음: E(E01 ~ E20) · X(X1 · X0) · D(D0 ~ D7 진단)
#   T1352 `계측/T1352_2026-11-18/도구/e2e_table.py` 꼴 그대로(판 이름 · 묶음만 이 카드 것) + 존 로그 econ 날 줄(`마을 econ day` — 벽시계 칸 뺀 글자 md5 앞 8)
import json, os, re, sys, glob, hashlib, collections
D = sys.argv[1]
GRPS = sys.argv[2:] or ['E', 'X', 'D']
ns = {}
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sig.py')).read().split('out=[sig(p)')[0], ns)   # 서명 = 같은 폴더 sig.py
sig = ns['sig']
wall = {}
for f in sorted(glob.glob(os.path.join(D, 'status_*.json')), key=os.path.getmtime):
    try:
        for d in json.load(open(f)).get('done', []): wall[d['tag']] = d.get('wallS')
    except Exception:
        pass
TAGS = {'E': [f'E{i:02d}' for i in range(1, 21)], 'X': ['X1', 'X0'], 'D': ['D0', 'D1', 'D2', 'D3', 'D5', 'D6', 'D7']}
NAME = {'E': '합친 나무 기본', 'X1': 'land1084 그대로(베이스 제품)', 'X0': '합친 나무 · `T1030_XZ_MARKET=0 T1352_XZ_HOLD=0`',
        'D0': '베이스 `ac33ecf82` 종전 기본 + 진단 픽스처', 'D1': '베이스 · `T1340_RESUME_EXACT=0`', 'D2': '베이스 · `T1321_XZ_KEEP=0`', 'D3': '베이스 · `T1292_XZ_HIDE=0`',
        'D5': '베이스 · `T952_XZ_STAY=1 T1352_XZ_HOLD=1` + 픽스처', 'D6': '베이스 · `T1030_XZ_MARKET=1 T1352_XZ_HOLD=1` + 픽스처', 'D7': '베이스 · `T952 · T1030 · T1352_XZ_HOLD` 셋 `=1` + 픽스처'}
LOGS = ['nippon', 'hanbando', 'nippon-2', 'hanbando-2', 'nippon-3']
def econ(tag):
    out = []
    for f in LOGS:
        p = os.path.join(D, 'e2e', tag, f + '.log')
        if not os.path.exists(p): out.append(f'{f} -'); continue
        L = [re.sub(r' · 일 [0-9]+ms.*', '', l.rstrip('\n')) for l in open(p, encoding='utf-8', errors='replace') if '마을 econ day' in l]
        out.append(f"{f} {len(L)} {hashlib.md5(('\n'.join(L) + ('\n' if L else '')).encode()).hexdigest()[:8]}")
    return ' · '.join(out)
rows = []
for g in GRPS:
    for t in TAGS[g]:
        p = os.path.join(D, 'e2e', t + '.txt')
        if not os.path.exists(p) or t not in wall: continue
        s = sig(p)
        txt = open(p, encoding='utf-8').read()
        m = re.search(r'null 표본 한반도 (\d+) · 닛폰 (\d+)', txt); nul = f'{m.group(1)} · {m.group(2)}' if m else '—'
        m2 = re.search(r'한반도 [\d.]+s\((made|wait|hit)\) · 닛폰 [\d.]+s\((made|wait|hit)\)', txt); mw = f'{m2.group(1)} · {m2.group(2)}' if m2 else '—'
        mj = re.search(r'ⓙ1 [^\n]*?(\d+)/(\d+)', txt); jn = mj.group(2) if mj else '—'
        m3 = re.search(r'숨긴 채 표에 남은 겹침 (\d+)', txt); ov = m3.group(1) if m3 else '—'
        rows.append(dict(g=g, t=t, tot=s['tot'], red=s['red'], ps=s['psig'], vs=s['vsig'], h=s['sig'], w=wall.get(t), nul=nul, mw=mw, jn=jn, ov=ov, econ=econ(t)))
print('| 묶음 | 판 | 건 · PASS · FAIL | 빨강 줄 | 판정 꼴 서명(줄 이름 + ✓/✗) | 판정 줄 값 서명 | ⓙ 표본 수 | T1292 숨긴 채 겹침 | 걸음표 만든 존(한 · 닛) | 존 로그 econ 날 줄(줄 수 · 글자 md5) | 벽시계 |')
print('|---|---|---|---|---|---|---|---|---|---|---|')
for r in rows:
    nm = NAME.get(r['t'], NAME.get(r['g'], r['g']))
    if not r['tot']:
        print(f"| {nm} | {r['t']} | (끝 줄 없음) | | | | | | | {r['econ']} | {r['w']}초 |"); continue
    a, b, c = r['tot']
    print(f"| {nm} | {r['t']} | {a} · {b} · {c} | {' · '.join(r['red']) or '—'} | `{r['ps']}` | `{r['vs']}` | {r['jn']} | {r['ov']} | {r['mw']} | {r['econ']} | {r['w']}초 |")
print()
for g in GRPS:
    R = [r for r in rows if r['g'] == g]
    if not R: continue
    W = [r['w'] or 0 for r in R]
    print(f"# {g}: 판 {len(R)} · 초록 {sum(1 for r in R if r['tot'] and r['tot'][2] == 0)} · 판정 꼴 {len(set(r['ps'] for r in R))}가지 {sorted(set(r['ps'] for r in R))} · 판정 값 {len(set(r['vs'] for r in R))}가지 · 전체 {len(set(r['h'] for r in R))}가지 · econ 날 줄 {len(set(r['econ'] for r in R))}가지 · 벽시계 {min(W)}~{max(W)}초")
    vals = collections.defaultdict(set)
    for r in R:
        nth = collections.Counter()   # 같은 이름 줄이 한 판에 여럿(ⓔ 존 기동 둘 등) — 이름 + 몇째로 맞댄다
        for l in open(os.path.join(D, 'e2e', r['t'] + '.txt'), encoding='utf-8').read().split('\n'):
            if not re.match(r'^\s*(✓|✗)', l): continue
            x = l.strip()
            x = re.sub(r'\d+(\.\d+)?ms(?=\s*$)', '#ms', x); x = re.sub(r'(기동|다시 뜸\(같은 DB\)|닛폰|한반도)\s+\d+(\.\d+)?s', '\\1 #s', x)
            x = re.sub(r'\b\d+(\.\d+)?s\((made|wait|hit)\)', '#geo', x); x = re.sub(r'기동\(마을 시딩 포함\)\s+\d+(\.\d+)?s', '#', x)
            k = x.split()[1]; nth[k] += 1
            vals[k if nth[k] == 1 else f'{k}#{nth[k]}'].add(x)
    diff = {k: len(v) for k, v in vals.items() if len(v) > 1}
    print(f"# {g} — 값이 갈린 판정 줄: {diff}")
    for k in diff:
        print('#   ' + k + ' : ' + ' | '.join(sorted(re.sub(r'^.*?  ', '', v)[:140] for v in vals[k])))
