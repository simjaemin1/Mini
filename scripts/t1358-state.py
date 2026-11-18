#!/usr/bin/env python3
"""Read canonical T740 full snapshots, never a live DB: exact ledger-time stakes ledger."""
import argparse,json,hashlib
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('snapshot',type=Path);p.add_argument('--out',type=Path,required=True);a=p.parse_args()
s=json.loads(a.snapshot.read_text());raw=s.get('raw') or s.get('side',{}).get('raw')
assert raw,'full raw village snapshot required'
rows=[]
def value(v,k,default):
 x=v.get(k)
 if x is None or x in ['∅','u']:return default
 return json.loads(x)
for name,v in raw.items():
 t=value(v,'_t1207',{}) or {};S=value(v,'_t1207Sum',{}) or {};jobs=value(v,'_t1207Pend',[]) or []
 rows.append(dict(name=name,done=t.get('body',0),completedWood=t.get('wood',0),placedWood=S.get('placed',0),drawnWood=S.get('took',0),
  pendingPlacedWood=sum((j.get('mat') or {}).get('wood',0) for j in jobs),remainingQuote=sum(max(0,j.get('wood',0)-(j.get('mat') or {}).get('wood',0)) for j in jobs),
  pending=len(jobs)))
keys=['done','completedWood','placedWood','drawnWood','pendingPlacedWood','remainingQuote','pending']
res=dict(day=s.get('d',s.get('worldDay')),sourceSha256=hashlib.sha256(a.snapshot.read_bytes()).hexdigest(),totals={k:sum(r[k] for r in rows) for k in keys},villages=rows)
res['totals']['placedMinusCompletedAndPending']=res['totals']['placedWood']-res['totals']['completedWood']-res['totals']['pendingPlacedWood']
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps(res,ensure_ascii=False,indent=1))
print(json.dumps({k:v for k,v in res.items() if k!='villages'},ensure_ascii=False))
