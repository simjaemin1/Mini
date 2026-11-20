import json,sys,collections
def load(f):
    d=json.load(open(f)); return d['ns'],d['n']
A=load(sys.argv[1]); B=load(sys.argv[2])
for ph in 'DN':
    tA=sum(v for k,v in A[1].items() if k.startswith(ph+':')); tB=sum(v for k,v in B[1].items() if k.startswith(ph+':'))
    nsA=sum(v for k,v in A[0].items() if k.startswith(ph+':')); nsB=sum(v for k,v in B[0].items() if k.startswith(ph+':'))
    print(f'== {ph} body-ticks base {tA} tok {tB} · ns/body-tick base {nsA/tA:.0f} tok {nsB/tB:.0f}')
    # per route per 1M body-ticks
    def agg(X,t,key):
        c=collections.Counter(); n=collections.Counter()
        for k,v in X[0].items():
            if not k.startswith(ph+':'): continue
            job,rt=k[2:].split('|'); kk=rt if key=='rt' else job; c[kk]+=v/t; n[kk]+=X[1][k]/t*1e6
        return c,n
    for key in ('rt','job'):
        ca,na=agg(A,tA,key); cb,nb=agg(B,tB,key)
        ks=sorted(set(ca)|set(cb),key=lambda k:-(ca.get(k,0)+cb.get(k,0)))[:10]
        print('  '+key+': '+' · '.join(f'{k} {ca.get(k,0):.0f}→{cb.get(k,0):.0f}ns({na.get(k,0):.0f}→{nb.get(k,0):.0f}/백만)' for k in ks))
    # decisions (dec routes) per job per 1M body ticks
    def decs(X,t):
        c=collections.Counter()
        for k,v in X[1].items():
            if not k.startswith(ph+':'): continue
            job,rt=k[2:].split('|')
            if rt.endswith('dec') or rt in ('workD','workT','sleepD'): c[(job,'full' if rt.endswith('dec') else rt)]+=v/t*1e6
        return c
    da,db=decs(A,tA),decs(B,tB)
    jobs=sorted(set(j for j,_ in da)|set(j for j,_ in db), key=lambda j:-sum(v for (jj,_),v in da.items() if jj==j))[:9]
    for j in jobs:
        print('   ',j,' 결정(종전 몸통) %.0f→%.0f · 판정 건넘 %.0f→%.0f · 표 건넘 0→%.0f · 잠 건넘 %.0f→%.0f'%(da.get((j,'full'),0),db.get((j,'full'),0),da.get((j,'workD'),0),db.get((j,'workD'),0),db.get((j,'workT'),0),da.get((j,'sleepD'),0),db.get((j,'sleepD'),0)))
