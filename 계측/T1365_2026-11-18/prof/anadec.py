import json,sys,collections
d=json.load(open(sys.argv[1])); j=json.load(open(sys.argv[2]))
nodes={n['id']:n for n in d['nodes']}; par={}
for n in d['nodes']:
    for c in n.get('children',[]): par[c]=n['id']
ts=[];t=d['startTime']
for dt in d['timeDeltas']: t+=dt; ts.append(t)
cache={}
def stk(i):
    if i in cache: return cache[i]
    out=[];k=i
    while k is not None: out.append(nodes[k]['callFrame']['functionName']); k=par.get(k)
    cache[i]=out; return out
for w in j['windows']:
    iv=[(s['mt0'],s['mt1']) for s in w['slices']]
    C=collections.Counter(); L=0
    for sid,t in zip(d['samples'],ts):
        if not any(a<=t<=b for a,b in iv): continue
        st=stk(sid)
        if '_decOne' not in st and 'decLoopMarker' not in st: 
            # fall back: inside tick but count dec subtrees by function names
            pass
        names=set(st)
        if 'decideNpcBehavior' in names: C['decide']+=1
        if 'npcLifeTick' in names: C['  life']+=1
        if 't1365Work' in names: C['t1365Work']+=1
        if 't1348Farm' in names: C['t1348Farm']+=1
        if 't1337Sleep' in names: C['t1337Sleep']+=1
        if '_t1348Dec' in names: C['_t1348Dec']+=1
        if '_t1337Dec' in names: C['_t1337Dec']+=1
        if '_t1348Walk' in names: C['_t1348Walk']+=1
        if '_t1322Skip' in names: C['_t1322Skip']+=1
        if 'npcStep' in names: C['npcStep']+=1
        if '_decOne' in names: C['_decOne']+=1
        if '_t1181Task' in names: C['_t1181Task']+=1
        if 'queryCircle' in names and ('_t1348Dec' in names or 'decideNpcBehavior' in names): C['wolfq']+=1
        L+=1
    print(w['W'], L, ' '.join(f'{k}:{v}' for k,v in sorted(C.items(),key=lambda x:-x[1])))
