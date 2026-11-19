import json,sys,collections
pf=sys.argv[1]; j=json.load(open(sys.argv[2]))
d=json.load(open(pf)); nodes={n['id']:n for n in d['nodes']}
par={}
for n in d['nodes']:
    for c in n.get('children',[]): par[c]=n['id']
ts=[];t=d['startTime']
for dt in d['timeDeltas']: t+=dt; ts.append(t)
def stack(i):
    out=[]
    while i is not None: out.append(nodes[i]['callFrame']['functionName']); i=par.get(i)
    return out
cache={}
def stk(i):
    if i not in cache: cache[i]=stack(i)
    return cache[i]
for w in j['windows']:
    iv=[(s['mt0'],s['mt1']) for s in w['slices']]
    C=collections.Counter(); tot=0
    for sid,t in zip(d['samples'],ts):
        if not any(a<=t<=b for a,b in iv): continue
        tot+=1
        st=stk(sid)
        if '_decOne' not in st: continue
        k=st.index('_decOne')
        C['loop']+=1
        below=st[:k]  # callee chain (innermost first)
        if 'npcStep' in below:
            C['step']+=1
            if 'decideNpcBehavior' in below:
                C['decide']+=1
                if 'npcLifeTick' in below: C['life']+=1
            elif any(x in below for x in ('computeNpcPath','detectStuck','followNpcPath','_t1295Stale','_t791Mir')): C['walkfns']+=1
            else: C['stepself']+=1
        elif 'slot' in below: C['ss.slot']+=1
        elif '_t1322Skip' in below: C['skip']+=1
        elif '_t1322Grant' in below: C['grant']+=1
        elif 'now' in below[:1] or 'Date.now' in below: C['date']+=1
        elif 'out' in below[:1]: C['tb.out']+=1
        else: C['loopself/other']+=1
    L=C['loop']
    print(w['W'], 'samples',tot,'loop',L, ' '.join(f'{k}:{v}({100*v/L:.0f}%)' for k,v in C.most_common()))
