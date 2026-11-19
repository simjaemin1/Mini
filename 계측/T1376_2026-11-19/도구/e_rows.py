#!/usr/bin/env python3
# T1376 보고 §4-1 표 — E01 ~ E20(합친 나무 기본) 판마다 한 줄 + 아래 요약 줄(마크다운) · e2e_table.py 의 셈(sig.py)을 그대로 쓴다
#   python3 e_rows.py <사슬 폴더>
import os, re, sys, json, glob, hashlib, collections
D = sys.argv[1]
ns = {}
exec(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sig.py')).read().split('out=[sig(p)')[0], ns)
sig = ns['sig']
wall = {}
for f in sorted(glob.glob(os.path.join(D, 'status_*.json')), key=os.path.getmtime):
    try:
        for d in json.load(open(f)).get('done', []): wall[d['tag']] = d.get('wallS')
    except Exception:
        pass
def econ(tag, f):
    p = os.path.join(D, 'e2e', tag, f + '.log')
    if not os.path.exists(p): return None
    L = [re.sub(r' · 일 [0-9]+ms.*', '', l.rstrip('\n')) for l in open(p, encoding='utf-8', errors='replace') if '마을 econ day' in l]
    return (len(L), hashlib.md5(('\n'.join(L) + ('\n' if L else '')).encode()).hexdigest()[:8], L)
rows = []
for i in range(1, 21):
    t = f'E{i:02d}'
    p = os.path.join(D, 'e2e', t + '.txt')
    if not os.path.exists(p) or t not in wall: continue
    s = sig(p); txt = open(p, encoding='utf-8').read()
    mw = re.search(r'한반도 [\d.]+s\((made|wait|hit)\) · 닛폰 [\d.]+s\((made|wait|hit)\)', txt)
    mj = re.search(r'ⓙ1 [^\n]*?(\d+)/(\d+)', txt)
    four = tuple(econ(t, f)[:2] for f in ('nippon', 'hanbando', 'nippon-2', 'hanbando-2'))
    n3 = econ(t, 'nippon-3')
    pop = re.search(r'인구 (\d+)', n3[2][0]).group(1) if n3 and n3[2] else '-'
    n2 = open(os.path.join(D, 'e2e', t, 'nippon-2.log'), encoding='utf-8', errors='replace').read()
    h2 = open(os.path.join(D, 'e2e', t, 'hanbando-2.log'), encoding='utf-8', errors='replace').read()
    soil = '있음' if '토양치 day 589075220' in n2 else '없음'
    m = re.search(r'복원 (\d+)셀', h2); trail = m.group(1) if m else '-'
    rows.append(dict(t=t, tot=s['tot'], ps=s['psig'], vs=s['vsig'], jn=mj.group(2) if mj else '—', mw=f'{mw.group(1)} · {mw.group(2)}' if mw else '—',
                     four=four, n3=n3[:2] if n3 else None, pop=pop, soil=soil, trail=trail, w=wall.get(t)))
F0 = rows[0]['four'] if rows else None
print('| 판 | 건 · PASS · FAIL | 판정 꼴 서명 | 판정 줄 값 서명 | ⓙ 표본 수 | 걸음표 만든 존(한 · 닛) | 두 존 econ 날 줄 넷(닛폰 · 한반도 · 다시 뜬 닛폰 · 다시 뜬 한반도) | ⓗ\' 뒤 다시 뜬 닛폰 첫 econ 날(인구 · md5) | 죽인 닛폰 끝 \'토양치 … 저장\' 줄 · 다시 뜬 한반도 답압 길 복원 셀 | 벽시계 |')
print('|---|---|---|---|---|---|---|---|---|---|')
for r in rows:
    a, b, c = r['tot']
    same = '같음' if r['four'] == F0 else '다름 ' + str(r['four'])
    print(f"| {r['t']} | {a} · {b} · {c} | `{r['ps']}` | `{r['vs']}` | {r['jn']} | {r['mw']} | {same} | {r['pop']} · `{r['n3'][1] if r['n3'] else '-'}` | {r['soil']} · {int(r['trail']):,} | {r['w']:,}초 |")
print()
W = [r['w'] for r in rows]
G = sum(1 for r in rows if r['tot'][2] == 0)
print(f"<!-- 요약: 판 {len(rows)} · 초록 {G} · 판정 꼴 {sorted(set(r['ps'] for r in rows))} · 값 {len(set(r['vs'] for r in rows))}가지 · 넷 같음 {sum(1 for r in rows if r['four'] == F0)} · 넷 = {F0} · 닛폰③ {dict(collections.Counter((r['pop'], r['n3'][1]) for r in rows))} · 토양치/답압 {dict(collections.Counter((r['soil'], r['trail']) for r in rows))} · 벽시계 {min(W)}~{max(W)} 가운데 {sorted(W)[len(W)//2]} -->")
