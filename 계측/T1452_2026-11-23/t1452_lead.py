#!/usr/bin/env python3
# T1452 비상이 미리 서나 — 밭 세계 판 훅 칸(.t1452.json)에서 못 먹은 마디(30날 넘게 쉰 뒤 처음 못 먹은 날)마다 그 앞 90날 안에
#   비상 · 장부 골 그 자체(0 밑 첫날이 그 마디 앞) · (가) 모자람이 섰나 · 처음 선 날부터 마디까지 날(가운데) · 마디가 난 철
# 쓰는 법: python3 t1452_lead.py <scratch 뿌리(…/t1452/srv 의 위)> <꼬리표> …
import json, sys, os, statistics as st
SP=sys.argv[1]  # <뿌리>/t1452/srv/<꼬리표>-<시드>/…
SEN={'s':'봄','u':'여름','a':'가을','w':'겨울'}
for tag in sys.argv[2:]:
    ep=[]; 
    for s in ('1020','7','42'):
        f=f'{SP}/t1452/srv/{tag}-{s}/{tag}-{s}.json.t1452.json'
        if not os.path.exists(f): continue
        d=json.load(open(f)); se=d.get('se',''); dfc=d.get('dfc') or 1
        for v in d['vil']:
            S,N,sh,ga,ah=v['S'],v['N'],v['sh'],v['ga'],v.get('ah') or []
            d0=v.get('d0',0); L=len(S)
            hung=[(sh[i] or 0)>1e-6 for i in range(L)]
            em=[bool(ah[i] and ah[i][3]) if i<len(ah) else False for i in range(L)]
            k0=[(ah[i][9] if (i<len(ah) and ah[i]) else None) for i in range(L)]
            gac=[(N[i] and S[i] is not None and ga[i] is not None and S[i]/(N[i]*dfc)<ga[i]) for i in range(L)]
            last=-999
            for i in range(L):
                if not hung[i]: continue
                if i-last>30 and i>=1:
                    W=range(max(0,i-90),i)
                    fe=[j for j in W if em[j]]; fk=[j for j in W if k0[j] and j+k0[j]<=i+3]; fg=[j for j in W if gac[j]]
                    sea=se[d0+i] if d0+i<len(se) else '.'
                    ep.append({'s':sea,'em':(i-fe[0]) if fe else None,'emOn':em[i-1],'k0':(i-fk[0]) if fk else None,'ga':(i-fg[0]) if fg else None})
                last=i
    n=len(ep)
    def lead(k):
        xs=[e[k] for e in ep if e[k] is not None]
        return {'warned%':round(100*len(xs)/max(1,n),1),'leadMed':st.median(xs) if xs else None}
    byS={}
    for e in ep: byS.setdefault(e['s'],[]).append(e)
    print(tag,'episodes',n,'emerg',lead('em'),'emerg on day before',round(100*sum(e['emOn'] for e in ep)/max(1,n),1),'trough k0',lead('k0'),'(가)',lead('ga'))
    for k in 'suaw':
        E=byS.get(k,[]); 
        if not E: continue
        xs=[e['em'] for e in E if e['em'] is not None]
        print('   ',SEN[k],len(E),'emerg warned%',round(100*len(xs)/len(E),1),'leadMed',st.median(xs) if xs else None)
