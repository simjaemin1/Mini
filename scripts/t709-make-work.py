#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T709 ① 남해안 손질(T631 작업 파일의 얹은 43개)을 **오늘 정본** 위에 다시 얹는다 · 정본 무접촉)
# T631(`scripts/t631-make-work.py`)은 10-04 main(43be2b9)을 뽑은 판 위에 남해안 id 만 얹었다. 그 뒤 T638(닛폰 동쪽)이 피처를 넣어 export id 가
#   밀렸다(예: 유키모리 2992 → 3032). ⇒ id 로 잇지 않고 **꼴로** 잇는다:
#   얹은 것 하나마다 10-04 판 피처(옛 id 의 꼴 그대로)를 오늘 판에서 찾는다(id 뺀 꼴이 바이트 같은 것 · 꼭 하나여야 한다 — 아니면 멈춘다 rc 3)
#   → 그 자리(오늘 id)에 T631 꼴을 넣는다 · T631 이 지운 것은 뺀다 · 새로 그린 것(강1)은 T631 id 그대로 끝에 붙인다(오늘 판에 그 id 가 없어야 한다).
#   얹은 것 밖은 오늘 판 그대로(닛폰 동쪽 · 해안 이음 · 하야가와/후카가와 등 무접촉).
# 쓰는 법: python3 scripts/t709-make-work.py <10-04 판 export.json> <T631 작업 파일> <out.json>
#   10-04 판 export = `git worktree add <d> 43be2b9` 에서 `EW_ZONE=hanbando EW_OUT=<f> node scripts/export-editor-work.js`
import json, sys, os, subprocess, tempfile
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OLD, SRC, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
tmp = os.path.join(tempfile.mkdtemp(), 'exp.json')
subprocess.check_call(['node', 'scripts/export-editor-work.js'], cwd=ROOT, env={**os.environ, 'EW_ZONE': 'hanbando', 'EW_OUT': tmp}, stdout=subprocess.DEVNULL)
N = json.load(open(tmp, encoding='utf-8')); O = json.load(open(OLD, encoding='utf-8')); W = json.load(open(SRC, encoding='utf-8'))
strip = lambda f: json.dumps({k: v for k, v in f.items() if k != 'id'}, sort_keys=True)
om = {str(f['id']): f for f in O['mf']}; wm = {str(f['id']): f for f in W['mf']}; nm = {str(f['id']): f for f in N['mf']}
nidx = {}
for f in N['mf']: nidx.setdefault(strip(f), []).append(str(f['id']))
take = W['_t631']['taken']
rep, drop, add, rows = {}, set(), [], []
for i in take:
    o, w = om.get(i), wm.get(i)
    if o is None:   # 새로 그림
        if i in nm: print('✗ 새 피처 id 가 오늘 판에 있다:', i); sys.exit(3)
        add.append(w); rows.append((i, '새로', w['type'], w.get('name'), '-')); continue
    m = nidx.get(strip(o), [])
    if len(m) != 1: print('✗ 오늘 판에서 옛 꼴을 하나로 못 찾았다:', i, o.get('name'), m); sys.exit(3)
    j = m[0]
    if w is None: drop.add(j); rows.append((i, '지움', o['type'], o.get('name'), j))
    else: rep[j] = {**w, 'id': nm[j]['id']}; rows.append((i, '바뀜', o['type'], o.get('name'), j))
out = []
for f in N['mf']:
    j = str(f['id'])
    if j in drop: continue
    out.append(rep.get(j, f))
out.extend(add)
Wn = dict(N); Wn['mf'] = out
Wn['_t709'] = {'src': os.path.basename(SRC), 'old': os.path.basename(OLD), 'rows': rows}
json.dump(Wn, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
moved = [r for r in rows if r[4] not in ('-',) and r[0] != r[4]]
print(f'얹음 {len(rows)} · 바뀜 {len(rep)} · 지움 {len(drop)} · 새로 {len(add)} · id 밀린 것 {[(r[0], r[4], r[3]) for r in moved]} · 오늘 판 {len(N["mf"])} → {len(out)} → {OUT}')
