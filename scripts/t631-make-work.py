#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T631 ① 남해안만 담은 작업 파일 · 정본 무접촉)
# 지금 정본을 export-editor-work.js 로 뽑은 판(= 에디터 구운 판 mf) 위에, T614 작업 파일에서 **남해안 범위 id 만** 얹는다:
#   강 하구 4(986·1005·1022·1026) · 지움 8(1008·1015·1025·1027·2823·2825·2826·2827) · 새로 강1(3) · 아라가와 2881 · 오오가와 2882 ·
#   어촌6 1943(재민 옮김) · 숲 셋(1101·2992·3005 — 재민 남해안 손질) · 바다 위 광맥 24(T614 ②+ · center 만)
#   닛폰 동쪽(id 6~66 · x ≥ 520,000) · 하야가와 2828 · 후카가와 2829 = 옛 꼴 그대로. 범위 밖 차이가 하나라도 섞이면 멈춘다(rc 3).
# 쓰는 법: python3 scripts/t631-make-work.py <T614 작업 파일> <out.json>
import json, sys, os, subprocess, tempfile
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, OUT = sys.argv[1], sys.argv[2]
tmp = os.path.join(tempfile.mkdtemp(), 'exp.json')
subprocess.check_call(['node', 'scripts/export-editor-work.js'], cwd=ROOT, env={**os.environ, 'EW_ZONE': 'hanbando', 'EW_OUT': tmp}, stdout=subprocess.DEVNULL)
E = json.load(open(tmp, encoding='utf-8')); V = json.load(open(SRC, encoding='utf-8'))
SCOPE = {'986', '1005', '1022', '1026', '1008', '1015', '1025', '1027', '2823', '2825', '2826', '2827', '3', '2881', '2882', '1943', '1101', '2992', '3005'}
ORES = {o['name'] for o in V['_t614']['oresMoved']}
EAST_X = 520000
norm = lambda f: json.dumps({**f, 'id': str(f['id'])}, sort_keys=True)
em = {str(f['id']): f for f in E['mf']}; vm = {str(f['id']): f for f in V['mf']}
def pts(f): return f['path'] if 'path' in f else [f['center']]
take, skip = [], []
for i in sorted(set(em) | set(vm), key=int):
    a, b = em.get(i), vm.get(i)
    if a is not None and b is not None and norm(a) == norm(b): continue
    f = b or a
    inscope = i in SCOPE or (f['type'] == 'ore' and f['name'] in ORES and a is not None and b is not None)
    (take if inscope else skip).append(i)
bad = [i for i in take if any(p['x'] >= EAST_X for p in pts(vm.get(i) or em[i]))]
if bad: print('✗ 동쪽 피처가 범위에 섞였다:', bad); sys.exit(3)
out = []
for f in E['mf']:
    i = str(f['id'])
    if i in take:
        if i in vm: out.append(vm[i])
        continue
    out.append(f)
for i in take:
    if i not in em: out.append(vm[i])
W = dict(E); W['mf'] = out
W['_t631'] = {'src': os.path.basename(SRC), 'taken': take, 'leftOld': skip}
json.dump(W, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
ty = {}
for i in take: f = vm.get(i) or em[i]; k = f['type'] + ('·지움' if i not in vm else '·새로' if i not in em else ''); ty[k] = ty.get(k, 0) + 1
print('얹음', len(take), ty, '· 옛 꼴 그대로(범위 밖 차이)', len(skip), '· 범위 밖 x≥520000 or 2828/2829:', sum(1 for i in skip if i in ('2828', '2829') or any(p['x'] >= EAST_X for p in pts(vm.get(i) or em[i]))), '/', len(skip), '→', OUT)
