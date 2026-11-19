#!/usr/bin/env python3
# T1376 계측 상자 싣기 — 판 사슬 출력 · 진단 · 지키기 · 도구를 레포 `계측/T1376_<날짜>/` 로 옮겨 싣는다(존 로그 · DB 는 안 싣는다 — 발췌만)
#   python3 pack.py <레포> <날짜>
import os, sys, shutil, glob, json
S = os.path.dirname(os.path.abspath(__file__))
REPO, DATE = sys.argv[1], sys.argv[2]
O = os.path.join(REPO, '계측', f'T1376_{DATE}')
def cp(src, dst_dir, name=None):
    os.makedirs(dst_dir, exist_ok=True)
    shutil.copy2(src, os.path.join(dst_dir, name or os.path.basename(src)))
# 진단
d = os.path.join(O, '진단')
for t in ['D0', 'D1', 'D2', 'D3', 'D5', 'D6', 'D7']: cp(os.path.join(S, 'e2e', f'{t}.txt'), d)
cp(os.path.join(S, 'diag-linger.js'), d)
for f in glob.glob(os.path.join(S, 'out', '진단', '*')): cp(f, d)
# e2e
e = os.path.join(O, 'e2e')
for i in range(1, 21): cp(os.path.join(S, 'e2e', f'E{i:02d}.txt'), e)
for t in ['X1', 'X0']: cp(os.path.join(S, 'e2e', f'{t}.txt'), e)
cp(os.path.join(S, 'e2e', 'E06_재부팅끊김.txt'), e)
cp(os.path.join(S, 'out', '표.md'), e)
# 판
p = os.path.join(O, '판')
for t in ['L1020', 'L7', 'L42', 'LB1020', 'LB7', 'LB42']:
    if os.path.exists(os.path.join(S, 'runs', f'an_{t}.json')):
        cp(os.path.join(S, 'runs', f'an_{t}.json'), p, f'an1292_{t}.json')
        for k in ['meta', 'final']:
            f = os.path.join(S, 'runs', f'{k}_{t}.json')
            if os.path.exists(f): cp(f, p)
for f in glob.glob(os.path.join(S, 'out', 'lan_*.json')) + [os.path.join(S, 'out', '판표.md')]:
    if os.path.exists(f): cp(f, p, '표.md' if f.endswith('판표.md') else None)
# 지키기
k = os.path.join(O, '지키기')
for f in glob.glob(os.path.join(S, 'ev', '*')):
    if f.endswith('.bak') or f.endswith('guards.done'): continue
    cp(f, k)
# 도구
t = os.path.join(O, '도구')
for f in ['chain.js', 'after.js', 'runB.js', 'guards.sh', 'sig.py', 'e2e_table.py', 'e_rows.py', 'lgan.py', 'lan.py', 'l_rows.py', 'cmp_lb.py', 'post_l.js', 'nohold.js', 'pack.py']:
    cp(os.path.join(S, f), t)
for f in ['final2.json', 'final3.json', 'final4.json', 'diag.json', 'diag2.json', 'diag3.json']: cp(os.path.join(S, f), t, '판목록_' + f)
# README
cp(os.path.join(S, 'out', 'README.md'), O)
tot = 0
for root, _, fs in os.walk(O):
    for f in fs: tot += os.path.getsize(os.path.join(root, f))
print(O, round(tot / 1e6, 2), 'MB')
