#!/usr/bin/env python3
# T1373 결정성 — 새 기준선 후보(--make · 생활층 지문 켬 · 훅 없음)의 날 지문 대 ⓐ 판(--make · 생활층 끔 · 계측 훅 둘)의 같은 날 지문
#   python3 t1373_det.py <후보 JSON> <시드>=<판 JSON> …   — 두 판이 따로 돈 같은 글 · 같은 시드 → 날마다 econ 지문(세계 12자 · 마을 51 칸)이 같아야 한다
import json, sys
C = json.load(open(sys.argv[1]))
ok_all = 0; out = []
for arg in sys.argv[2:]:
    s, p = arg.split('=', 1)
    A = json.load(open(p))
    c = C['byseed'][s]; a = A['byseed'][s]
    cd = {r[0]: r for r in c['days']}; ad = {r[0]: r for r in a['days']}
    days = sorted(d for d in cd if d in ad)
    same_w = sum(1 for d in days if cd[d][2] == ad[d][2])
    same_v = sum(1 for d in days if cd[d][3] == ad[d][3])
    first = next((d for d in days if cd[d][2] != ad[d][2] or cd[d][3] != ad[d][3]), None)
    good = same_w == len(days) and same_v == len(days) and len(days) >= 400
    ok_all += good
    out.append(f'{s}: 날 {len(days)} · 세계 지문 같음 {same_w}/{len(days)} · 마을 지문 같음 {same_v}/{len(days)} · 첫 갈림 {first} · 끝 여덟 칸 후보 {c["eight"]} / 판 날 400 이후라 견주지 않음')
print('\n'.join(out)); print(f'결정성 {ok_all}/{len(sys.argv) - 2}')
