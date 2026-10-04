#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T614 ③ 고친 작업 파일 적는 기계 · 정본 무접촉)
# 재민 v2 작업 파일에 T614 손질을 얹어 새 파일로 쓴다(원본 무변):
#   · mf 광맥 — 바다 위 광맥(t614-ores.py 표)의 center 만 옮긴다(존 local → 월드 · 반경·광종·이름 무변)
#   · `bridges` — 에디터 구운 판(`lab/map-editor-baked.json .bridges`)과 같은 꼴({존: flat}) · 뜬 다리 뺀 줄(t614 br_new)
#   · `bridgeShortcutsAdd` — 지름길 규칙(T537 · plan-bridges-v2 `bridgeShortcuts 형`)이 새 강 위에 낸 후보만(존 설정 `bridgeShortcuts` 끝에 붙일 줄)
#   · `_t614` — 무엇을 왜 바꿨나(사람 읽기용)
#   마을은 안 옮긴다(걸린 마을 0 · 어촌6 은 재민 자리 그대로).
# 쓰는 법: python3 scripts/t614-write-work.py <v2 work> <out> <dir(/tmp/t614)>
import json, sys
SRC, OUT, D = sys.argv[1:4]
W = json.load(open(SRC, encoding='utf-8'))
BK = json.load(open('lab/map-editor-baked.json', encoding='utf-8'))
ORE = json.load(open(f'{D}/ores_move.json')); BRN = json.load(open(f'{D}/br_new.json')); SC = json.load(open(f'{D}/sc_add.json'))
HIT = json.load(open(f'{D}/br_hit.json'))
OX, OY = 409984, 49984
mv = {r['name']: r for r in ORE if r['to']}
n = 0
for f in W['mf']:
    if f['type'] == 'ore' and f['name'] in mv and OX <= f['center']['x'] < OX + 70016 and OY <= f['center']['y'] < OY + 130016:
        r = mv[f['name']]; f['center'] = {'x': r['toPx'][0] + OX, 'y': r['toPx'][1] + OY}; n += 1
assert n == len(mv), (n, len(mv))
br = dict(BK['bridges']); br['hanbando'] = BRN['hanbando']; br['nippon'] = BRN['nippon']
W['bridges'] = br
W['bridgeShortcutsAdd'] = {'hanbando': [{k: s[k] for k in ('v', 'span', 'rank', 'pot', 'inWin', 'cells')} for s in SC]}
removed = [c for r in HIT['hanbando'] if r['newWater'] == 0 for c in r['cells']]
W['_t614'] = {'src': 'editor-work_재민_v2.json(재민 10-03)', 'card': 'T614',
    'oresMoved': [{'name': r['name'], 'fromCell': r['from'], 'toCell': r['to'], 'moved': r['moved']} for r in ORE if r['to']],
    'bridgesRemoved': {'hanbando': removed}, 'bridgesNote': '시딩 다리(bridges) 섬 규칙(plan-bridges-v2) 새로 0 · 지름길 후보(bridgeShortcutsAdd)는 존 설정 bridgeShortcuts(손잡이 T537_SHORTCUT·T527_BRIDGE_ACT 켬일 때만 지음) 끝에 붙일 줄',
    'villages': '옮김 0 · 어촌6 재민 자리 그대로(계획기 v2 판: 마당·겹침·땅 하한 어김 0)'}
json.dump(W, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('광맥', n, '· 다리 hanbando', len(br['hanbando']) // 2, '셀 · 뺀', len(removed), '· 지름길 더함', len(SC), '→', OUT)
