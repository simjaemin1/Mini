#!/usr/bin/env python3
# T1438 보고 꾸리기 — out/report_draft.md + 판 수(out/nums.json) + 갈래 판 + 지키기(ev/) → out/report.md · out/hubu_final.md
import json, os, re, sys
D = '/tmp/claude-0/-home-claude/cfe6cf25-46e1-5300-98ba-fce9e6ec0ae5/scratchpad/t1438'
O = D + '/out'
r = open(O + '/report_draft.md').read()
hub = open(O + '/hubu.md').read()
N = json.load(open(O + '/nums.json'))['rows']
def get(tag, day): 
    for x in N:
        if x['tag'] == tag and x['day'] == day: return x
    return None
fmt = lambda v: f'{v:,}' if isinstance(v, int) else (f'{v:,.1f}' if isinstance(v, float) else str(v))
def ev(name):
    p = os.path.join(D, 'ev', name)
    return open(p).read() if os.path.exists(p) else ''
def lastline(txt, pat):
    L = [l for l in txt.splitlines() if re.search(pat, l)]
    return L[-1].strip() if L else None
S = {}
# 끈 판
off = lastline(ev('기준선1118_끔.txt'), r'^=== 같음')
S['OFFLINE'] = (off.replace('===', '').strip() if off else '[[OFFLINE]]')
S['OFFSAME'] = re.search(r'같음 (\d+/\d+)', off).group(1) if off else '[[OFFSAME]]'
# t17
t17 = ev('t17.txt'); m = re.findall(r'인구[^\d]{0,12}([\d,]{4,6})', t17)
S['T17'] = S['T17DETAIL'] = '[[T17]]'
mm = re.search(r'(\d{1},\d{3})', lastline(t17, r'800') or '')
# 켠 판 표
mid = [get('ON_MID_1020', 400), get('ON_MID_7', 400), get('ON_MID_42', 400), get('ON_MID_1020', 730)]
hdr = '| 판 | 날 | 인구 켬 · 끔 · 끔비 | 빈 마을 | 새 집 | 지붕 가운데 · 가장 낮은 | 뼈대 가운데 · 가장 낮은 | 곳간 가운데 | 손질(지붕 · 뼈대 · 곳간) | 풀(하루 · 짓기 견줌) | 통나무(하루 · 집 자재 견줌) | 일손(크루 · 사람-날) | 짓는 날 뺀 단계 | 무너짐 | 나무꾼 켬 · 끔 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'
rows = []
for x in mid:
    if not x: continue
    emp = '0' if not x.get('empty') or (x.get('firstEmpty') and x['firstEmpty'] > x['day']) else str(x['empty'])
    pop = x.get('popEnd') or x['pop']
    rows.append(f"| {x['seed']} | {x['day']} | {fmt(pop)} · {fmt(x.get('popOff'))} · {x.get('ratio')} | {emp} | {x['built']} | {x['roofMed']} · {x['roofMin']} | {x['frameMed']} · {x['frameMin']} | {x['granMed']} | {x['roofRep']} · {x['frameRep']} · {x['granRep']} | {fmt(x['fiber'])}단({x['fiberDay']}/날 · +{x['fiberPct']}%) | {x['woodR']}({x['woodDay']}/날 · {x['woodPct']}%) | {x['laborPctCrew']}% · {x['laborPctPop']}% | {x['ded']} | {x['collapse']} | {x['lj']} · {x.get('ljOff') if x.get('ljOff') is not None else '—'} |")
S['S5TABLE'] = hdr + '\n' + '\n'.join(rows)
sets = [get('ON_LO_1020', 400), get('ON_MID_1020', 400), get('ON_HI_1020', 400)]
sh = '| 빠르기 | 풀 · 나무 · 흙돌(해) | 인구 · 끔비 | 지붕 가운데 · 가장 낮은 | 뼈대 가운데 | 풀(하루) | 통나무 | 일손(크루) | 빈 마을 |\n|---|---|---|---|---|---|---|---|---|'
srow = []
for x, yrs in zip(sets, ['1 · 10 · 14', '1.5 · 15 · 17', '2 · 20 · 20']):
    if not x: continue
    emp = '0' if not x.get('empty') or (x.get('firstEmpty') and x['firstEmpty'] > x['day']) else str(x['empty'])
    srow.append(f"| {x['tag'].split('_')[1].lower()} | {yrs} | {fmt(x['pop'])} · {x.get('ratio')} | {x['roofMed']} · {x['roofMin']} | {x['frameMed']} | {x['fiberDay']} | {x['woodR']} | {x['laborPctCrew']}% | {emp} |")
S['SETTABLE'] = sh + '\n' + '\n'.join(srow)
open(O + '/S.json', 'w').write(json.dumps(S, ensure_ascii=False, indent=1))
for k, v in S.items():
    if v and not v.startswith('[['): r = r.replace('[[' + k + ']]', v)
X = json.load(open(O + '/extra.json')) if os.path.exists(O + '/extra.json') else {}
for k, v in X.items(): r = r.replace('[[' + k + ']]', v); hub = hub.replace('[[' + k + ']]', v)
r = r.replace('[[HUBU]]', hub.strip())
r = r.replace('[[DIAG]]', open(D + '/diag.md').read().strip())
open(O + '/report.md', 'w').write(r)
open(O + '/hubu_final.md', 'w').write(hub)
left = sorted(set(re.findall(r'\[\[[A-Z0-9_]+\]\]', r)))
print('report.md', len(r.splitlines()), '줄 · 남은 칸', left)
