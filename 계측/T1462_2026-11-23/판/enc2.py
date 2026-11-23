#!/usr/bin/env python3
# 싸움만 — 진 편 몸 수 · 진 편 쓰러짐 · 이긴 편 쓰러짐(호위 진 판 = 호위가 진 편 · 호위 이긴 판 = 도적이 진 편)
import re, sys, glob, os, json
D = os.path.dirname(os.path.abspath(__file__))
pat = re.compile(r'D(\d+) 캐러밴#(\d+)\(.*?(가는 길|귀로) · 호위 (\d+) · 행복 ([\d.]+)\) ↔ 도적단#(\d+) (\d+)명 — (.*) \[T1431\]')
for tag in sys.argv[1:]:
    seen=set(); R={'fight':0,'loserN':0,'loserD':0,'winnerN':0,'winnerD':0,'escWinLoserD':0}
    for f in glob.glob(os.path.join(D,'runs',tag,'*.log')):
        for line in open(f,encoding='utf-8',errors='replace'):
            m=pat.search(line)
            if not m or m.group(0) in seen: continue
            seen.add(m.group(0)); E=int(m.group(4)); G=int(m.group(7)); res=m.group(8)
            if '달아났다' in res: continue
            mm=re.search(r'쓰러짐 호위 (\d+) · 행상 (\d+) · 도적 (\d+)',res); e,t,b=(int(x) for x in mm.groups()) if mm else (0,0,0)
            R['fight']+=1
            if '물리쳤다' in res: R['loserN']+=G; R['loserD']+=b; R['winnerN']+=E; R['winnerD']+=e
            else: R['loserN']+=E; R['loserD']+=e; R['winnerN']+=G; R['winnerD']+=b
    R['loserDeadPct']=round(100*R['loserD']/max(1,R['loserN'])); R['winnerDeadPct']=round(100*R['winnerD']/max(1,R['winnerN']))
    print(tag, R)
