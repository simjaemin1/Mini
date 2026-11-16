import json,sys
a,b=sys.argv[1],sys.argv[2]
def load(f,key):
  out={}
  for ln in open(f):
    ln=ln.strip()
    if not ln: continue
    d=json.loads(ln); out[d.get(key)]=ln
  return out
for fn,key in (('pos-days.jsonl','day'),('world-days.jsonl','day')):
  A=load(f'{a}/{fn}',key); B=load(f'{b}/{fn}',key)
  days=sorted(set(A)&set(B), key=lambda x: (x is None, x))
  same=sum(1 for d in days if A[d]==B[d]); diff=[d for d in days if A[d]!=B[d]]
  print(fn, 'compared',len(days),'same',same,'diff',diff[:5], 'onlyA',len(set(A)-set(B)),'onlyB',len(set(B)-set(A)))
