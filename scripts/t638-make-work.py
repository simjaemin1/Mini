#!/usr/bin/env python3
# (@regress 없음 — 러너 밖 · T638 ② 닛폰 동쪽만 담은 작업 파일 · 정본 무접촉) — `t631-make-work.py` 의 거울
# 지금 정본을 export-editor-work.js 로 뽑은 판 위에, 작업 파일에서 **닛폰 동쪽 범위만** 얹는다:
#   ⓐ 재민 동쪽 새 지형(한 점이라도 세계 x ≥ 520,000) · 하야가와 2828 · 후카가와 2829(동쪽 연장)
#   ⓑ 재민 v2 에 없던 id(T615 · T616 · T638 이 더한 것 — 지류 · 계곡 · 고개 · 숲 · 마을) — 닛폰 존 안이어야 한다(밖이면 멈춤)
#   남해안(T631 범위 — 한반도 하구 · 지운 강 · 강1 · 어촌6 · 숲 셋 · 광맥 24 · 아라가와 · 오오가와 · 쿠로가와)은 **옛 꼴 그대로**(T631 몫).
# 쓰는 법: python3 scripts/t638-make-work.py <작업 파일(동쪽 판)> <재민 v2 작업 파일> <out.json>
import json, sys, os, subprocess, tempfile
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, V2, OUT = sys.argv[1:4]
tmp = os.path.join(tempfile.mkdtemp(), 'exp.json')
subprocess.check_call(['node', 'scripts/export-editor-work.js'], cwd=ROOT, env={**os.environ, 'EW_ZONE': 'hanbando', 'EW_OUT': tmp}, stdout=subprocess.DEVNULL)
E = json.load(open(tmp, encoding='utf-8')); V = json.load(open(SRC, encoding='utf-8')); B = json.load(open(V2, encoding='utf-8'))
ZC = json.loads(subprocess.check_output(['node', '-e', "const Z=require('./server/zone-config.js').ZONES.nippon;console.log(JSON.stringify([Z.worldOffsetX,Z.worldOffsetY,Z.zoneWidth,Z.zoneHeight]))"], cwd=ROOT))
inNip = lambda p: ZC[0] <= p['x'] < ZC[0] + ZC[2] and ZC[1] <= p['y'] < ZC[1] + ZC[3]
EAST_X = 520000
norm = lambda f: json.dumps({**f, 'id': str(f['id'])}, sort_keys=True)
em = {str(f['id']): f for f in E['mf']}; vm = {str(f['id']): f for f in V['mf']}; bm = {str(f['id']) for f in B['mf']}
def pts(f): return f['path'] if 'path' in f else [f['center']]
take, skip, mine = [], [], []
for i in sorted(set(em) | set(vm), key=int):
    a, b = em.get(i), vm.get(i)
    if a is not None and b is not None and norm(a) == norm(b): continue
    f = b or a
    if i not in bm and i not in em:   # ⓑ 세션이 더한 것
        if not all(inNip(p) for p in pts(f)): print('✗ 더한 피처가 닛폰 밖:', i, f['type'], f['name']); sys.exit(3)
        take.append(i); mine.append(i); continue
    east = i in ('2828', '2829') or any(p['x'] >= EAST_X for p in pts(f))
    (take if east else skip).append(i)
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
W['_t638'] = {'src': os.path.basename(SRC), 'taken': take, 'mine': mine, 'leftOld': skip}
json.dump(W, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
ty = {}
for i in take: f = vm.get(i) or em[i]; k = f['type'] + ('·지움' if i not in vm else '·새로' if i not in em else '·바뀜'); ty[k] = ty.get(k, 0) + 1
print('얹음', len(take), ty, '· 그중 세션이 더한 것', len(mine), '· 옛 꼴 그대로(범위 밖 차이 = 남해안 T631 몫)', len(skip), '→', OUT)
print('  옛 꼴 그대로:', ', '.join(sorted({(vm.get(i) or em[i])['name'] for i in skip})))
