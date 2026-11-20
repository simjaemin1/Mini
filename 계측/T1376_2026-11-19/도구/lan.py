#!/usr/bin/env python3
# T1376 300날 두 존 판 표 — `t1292-xzone-live.js analyze` 출력(an_<표지>.json) + 하루 줄 끝(rows) 에서 넘음 · 교역 · 보존 · 머문 이웃 존 상인.
#   python3 lan.py <runs 폴더> L1020 L7 L42
import json, sys, os
D = sys.argv[1]; TAGS = sys.argv[2:]
ZS = ['hanbando', 'nippon']
def rows(tag, z):
    f = os.path.join(D, f'rows_{tag}_{z}.jsonl')
    return [json.loads(l) for l in open(f) if l.strip()] if os.path.exists(f) else []
out = []
for t in TAGS:
    A = json.load(open(os.path.join(D, f'an_{t}.json')))
    R = {z: rows(t, z) for z in ZS}
    last = {z: (R[z][-1] if R[z] else {}) for z in ZS}
    core = {z: ((last[z].get('xz') or {}).get('core') or {}) for z in ZS}
    st = {z: ((last[z].get('xz') or {}).get('st') or {}) for z in ZS}
    lin = {z: (sum(r.get('xzLinger', 0) for r in R[z]), sum(1 for r in R[z] if r.get('xzLinger', 0) > 0), len(R[z])) for z in ZS}
    C = A['crossed']; B = A['bodies']; S = A['stuck']; F = A['final']
    # 기록 보존(방향마다): 보낸 존 arriveOut = 받는 존 arriveIn · 받는 존 returnOut = 보낸 존 returnIn(판 끝 셈 — 하루 줄 끝 값)
    rec = {}
    for a, b in (('hanbando', 'nippon'), ('nippon', 'hanbando')):
        rec[f'{a}→{b}'] = dict(arriveOut=core[a].get('arriveOut'), arriveIn=core[b].get('arriveIn'), returnOut=core[b].get('returnOut'), returnIn=core[a].get('returnIn'), pend=core[b].get('pend'))
    out.append(dict(tag=t, days=A['days'], crossed=C, rec=rec, bodies=dict(logical=B.get('logical'), handoffs=B.get('handoffs'), both=B['both']['n'], vanished=B['vanished']['n'], mapGap=B['mapGap']['n'], hiddenLeft=B['hidden']['left'], escMore=B['esc']['more'], wayDied=B['esc']['way']['died']),
                    stuck=S, final=F, lag=A['lag'], lingerRows=lin, st={z: {k: st[z].get(k) for k in ('crossArrive', 'crossReturn', 'soldOk', 'deposited', 'lost', 'sentFail', 'bounced', 'retried', 'dup', 'bodyOut', 'bodyIn')} for z in ZS},
                    t952=A.get('t952')))
print(json.dumps(out, ensure_ascii=False, indent=1))
