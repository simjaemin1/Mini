import json,sys,statistics as st
FISH=set("carp crucian catfish snakehead mandarin barbel minnow sweetfish eel loach salmon herring sardine anchovy shrimp crab octopus squid cod pollock trout fish".split())
def load(d,seed):
    W=[json.loads(l) for l in open(f'/tmp/t1294/{d}/world-days.jsonl') if l.strip()]
    P=[json.loads(l) for l in open(f'/tmp/t1294/{d}/pos-days.jsonl') if l.strip()]
    B=[json.loads(l) for l in open(f'/tmp/t1294/{d}/body.{seed}.jsonl') if l.strip()]
    Bd=[b for b in B if 'd' in b and b['d']>=0]
    last=Bd[-1]
    fish=sum(v for vil in W[-1]['villages'] for k,v in vil['parts'][0].items() if k in FISH and isinstance(v,(int,float)))
    sto=sum(v for vil in W[-1]['villages'] for k,v in vil['parts'][0].items() if isinstance(v,(int,float)))
    return dict(W=[json.dumps(w,sort_keys=True) for w in W],P=[p['h'] for p in P],pop=last['pop'],bodies=P[-1]['n'],car=P[-1]['car'],fish=round(fish,1),sto=round(sto,1),farm=last.get('farm'),harv=last.get('harvN'),steps=last['st']['steps'])
def first(a,b):
    for i,(x,y) in enumerate(zip(a,b)):
        if x!=y: return i+1
    return None
out={}
for seed in (1020,7,42):
    o=load(f'off-{seed}',seed); a=load(f'ab-{seed}',seed)
    out[seed]={'off':{k:v for k,v in o.items() if k not in('W','P')},'ab':{k:v for k,v in a.items() if k not in('W','P')},
      'worldFirstDiff':first(o['W'],a['W']),'posFirstDiff':first(o['P'],a['P']),
      'worldSame':sum(x==y for x,y in zip(o['W'],a['W'])),'posSame':sum(x==y for x,y in zip(o['P'],a['P']))}
M=['pop','bodies','fish','sto','farm','harv','steps']
print(json.dumps(out,ensure_ascii=False))
print('지표'.ljust(8),''.join(f'{s}:off/ab/Δ%'.rjust(30) for s in (1020,7,42)),'  시드 사이 CV%(off)  |Δ| 평균%')
for m in M:
    offs=[out[s]['off'][m] for s in (1020,7,42)]
    cv=100*st.pstdev(offs)/st.mean(offs) if st.mean(offs) else 0
    ds=[100*(out[s]['ab'][m]-out[s]['off'][m])/out[s]['off'][m] if out[s]['off'][m] else 0 for s in (1020,7,42)]
    print(m.ljust(8),''.join(f"{out[s]['off'][m]}/{out[s]['ab'][m]}/{d:+.2f}".rjust(30) for s,d in zip((1020,7,42),ds)), f'{cv:8.2f}', f'{st.mean(abs(x) for x in ds):8.2f}')
for s in (1020,7,42): print(s,'날 지문 첫 갈림',out[s]['worldFirstDiff'],'같은 날',out[s]['worldSame'],'· 몸 자리 첫 갈림',out[s]['posFirstDiff'],'같은 날',out[s]['posSame'])
