#!/usr/bin/env python3
# T1352 e2e-xzone-caravan 가상 시계 판 스물 — 판마다 PASS/FAIL · 빨강 줄 · 서명(sig.py) · 벽시계 → 표 줄
import json, os, sys, importlib.util
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1352'
spec = importlib.util.spec_from_file_location('sig', f'{D}/e2e/sig.py.mod')
src = open(f'{D}/e2e/sig.py').read().split('out=[sig(p)')[0]
ns = {}
exec(src, ns)
sig = ns['sig']
st = json.load(open(f'{D}/chain_status.json'))
wall = {d['tag']: d.get('wallS') for d in st['done']}
rows = []
for grp in ['E0', 'EH']:
    for i in range(1, 11):
        t = f'{grp}_{i:02d}'
        p = f'{D}/e2e/{t}.txt'
        if not os.path.exists(p) or t not in wall: continue
        s = sig(p)
        import re as _re
        txt = open(p, encoding='utf-8').read()
        m = _re.search(r'null 표본 한반도 (\d+) · 닛폰 (\d+)', txt); nul = f'{m.group(1)} · {m.group(2)}' if m else '—'
        m2 = _re.search(r'한반도 [\d.]+s\((made|wait|hit)\) · 닛폰 [\d.]+s\((made|wait|hit)\)', txt); mw = f'{m2.group(1)} · {m2.group(2)}' if m2 else '—'
        mj = _re.search(r'ⓙ1 [^\n]*?(\d+)/(\d+)', txt); jn = mj.group(2) if mj else '—'
        m3 = _re.search(r'숨긴 채 표에 남은 겹침 (\d+)번', txt); ov = m3.group(1) if m3 else '—'
        rows.append((grp, t, s['tot'], s['red'], s['psig'], s['vsig'], s['sig'], wall.get(t), nul, mw, jn, ov))
out = ['| 묶음 | 판 | 건 · PASS · FAIL | 빨강 줄 | 판정 꼴 서명(줄 이름 + ✓/✗) | 판정 줄 값 서명 | ⓙ 표본 수 | T1292 숨긴 채 겹침 | ⓗ null 표본(한 · 닛) | 걸음표 만든 존(한 · 닛) | 벽시계 |', '|---|---|---|---|---|---|---|---|---|---|---|']
for grp, t, tot, red, ps, vs, h, w, nul, mw, jn, ov in rows:
    out.append(f"| {'끔(기본)' if grp == 'E0' else '`T1352_XZ_HOLD=1`'} | {t} | {tot[0]} · {tot[1]} · {tot[2]} | {' · '.join(red)} | `{ps}` | `{vs}` | {jn} | {ov} | {nul} | {mw} | {w}초 |" if tot else f'| {grp} | {t} | (끝 줄 없음) | | | | | | | | |')
summ = {}
for grp, t, tot, red, ps, vs, h, w, nul, mw, jn, ov in rows:
    S = summ.setdefault(grp, {'n': 0, 'sigs': set(), 'psigs': set(), 'vsigs': set(), 'reds': set(), 'green': 0, 'wall': []})
    S['n'] += 1; S['sigs'].add(h); S['psigs'].add(ps); S['vsigs'].add(vs); S['reds'].add(' · '.join(red)); S['wall'].append(w or 0)
    if tot and tot[2] == 0: S['green'] += 1
print('\n'.join(out))
for g, S in summ.items():
    print(f"# {g}: 판 {S['n']} · 판정 꼴 {len(S['psigs'])}가지 · 판정 값 {len(S['vsigs'])}가지 · 전체 {len(S['sigs'])}가지 · 빨강 꼴 {len(S['reds'])}가지 {sorted(S['reds'])} · 초록 {S['green']} · 벽시계 {min(S['wall'])}~{max(S['wall'])}초")

#   묶음 안에서 값이 갈린 판정 줄(벽시계 수 · 만든 존/기다린 존을 지운 뒤) — 줄 이름 → 값 가짓수
import re as _re2, collections as _co
for grp in ['E0', 'EH']:
    vals = _co.defaultdict(set); nrun = 0
    for i in range(1, 11):
        t = f'{grp}_{i:02d}'; p = f'{D}/e2e/{t}.txt'
        if not os.path.exists(p) or t not in wall: continue
        nrun += 1
        for l in open(p, encoding='utf-8').read().split('\n'):
            if not _re2.match(r'^\s*(✓|✗)', l): continue
            x = l.strip()
            x = _re2.sub(r'\d+(\.\d+)?ms(?=\s*$)', '#ms', x); x = _re2.sub(r'(기동|다시 뜸\(같은 DB\)|닛폰|한반도)\s+\d+(\.\d+)?s', '\\1 #s', x)
            x = _re2.sub(r'\b\d+(\.\d+)?s\((made|wait|hit)\)', '#geo', x); x = _re2.sub(r'기동\(마을 시딩 포함\)\s+\d+(\.\d+)?s', '#', x)
            vals[x.split()[1]].add(x)
    diff = {k: len(v) for k, v in vals.items() if len(v) > 1}
    print(f"# {grp} 판 {nrun} — 값이 갈린 판정 줄: {diff}")
    for k in diff:
        print('#   ' + k + ' : ' + ' | '.join(sorted(_re2.sub(r'^.*?  ', '', v)[:120] for v in vals[k])))
