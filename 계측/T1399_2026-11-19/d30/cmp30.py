import json,sys
a,b,seed=sys.argv[1],sys.argv[2],sys.argv[3]
python_out=[]
def load(f,key):
  out={}
  for ln in open(f):
    ln=ln.strip()
    if ln: d=json.loads(ln); out[d.get(key)]=ln
  return out
res={}
for fn,key in (('pos-days.jsonl','day'),('world-days.jsonl','day')):
  A=load(f'{a}/{fn}',key); B=load(f'{b}/{fn}',key)
  days=[d for d in A if d in B]; same=sum(1 for d in days if A[d]==B[d])
  res[fn]=(same,len(days),[d for d in days if A[d]!=B[d]][:5])
def body(f):
  out={}
  for ln in open(f):
    ln=ln.strip()
    if not ln: continue
    d=json.loads(ln); d.pop('cpu',None); d.pop('clk',None)
    st=d.get('st') or {}
    for k in list(st):
      if k.startswith('ns'): st.pop(k)
    out[d.get('d', 'x'+str(len(out)))]=json.dumps(d,sort_keys=True)
  return out
A=body(f'{a}/body.{seed}.jsonl'); B=body(f'{b}/body.{seed}.jsonl')
days=[d for d in A if d in B]; same=sum(1 for d in days if A[d]==B[d])
res['body']=(same,len(days),[d for d in days if A[d]!=B[d]][:5])
for k,v in res.items(): print(f'{k}: {v[0]}/{v[1]} 다름 {v[2]}')
