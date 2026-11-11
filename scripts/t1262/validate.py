"""Compare completed new measurements with immutable historical V4 evidence."""
import gzip,json,math
from pathlib import Path
out=Path('계측/T1262_2026-11-11');historical={};new={};cps={}
for mode,oldname in [('tick','v4-world-tick30'),('event','v4-world100')]:
 old=Path('/tmp/t1262-v4/계측/T1248_2026-11-10-independent/runs')/oldname;p=Path('/tmp/t1262-'+mode+'30')
 assert json.loads((p/'status.json').read_text())['valid']
 a={}
 for l in gzip.open(old/'days.jsonl.gz','rt'):
  r=json.loads(l)
  if r['day']>30:break
  a[r['day']]=r
 b={r['day']:r for l in (p/'days.jsonl').read_text().splitlines() if (r:=json.loads(l))};assert set(b)==set(range(1,31));new[mode]=b
 historical[mode]={'newDays':len(b),'same':sum(r==a.get(d) for d,r in b.items()),'firstMismatch':next((d for d,r in b.items() if r!=a.get(d)),None)}
 assert historical[mode]['same']==30
 freshcp={r['cp']:r for l in (p/'body.1020.jsonl').read_text().splitlines() if 'cp' in (r:=json.loads(l)) and r['cp'] in [10,20]}
 oldcp={r['cp']:r for l in gzip.open(old/'body.1020.jsonl.gz','rt') if 'cp' in (r:=json.loads(l)) and r['cp'] in [10,20]}
 historical[mode]['positionCheckpointBodiesMatchHistorical']={d:freshcp.get(d,{}).get('b')==oldcp.get(d,{}).get('b') for d in [10,20]};cps[mode]=freshcp
common=sorted(new['tick'].keys()&new['event'].keys());first=next((d for d in common if new['tick'][d]!=new['event'][d]),None)
pair={'days':len(common),'sameDays':sum(new['tick'][d]==new['event'][d] for d in common),'firstDifferenceDay':first}
if first is not None:
 for a,b in zip(new['tick'][first]['villages'],new['event'][first]['villages']):
  if a!=b:
   pair['firstVillage']=a['name'];pair['firstStorageDifferences']={k:[a['parts'][0].get(k),b['parts'][0].get(k)] for k in a['parts'][0].keys()|b['parts'][0].keys() if a['parts'][0].get(k)!=b['parts'][0].get(k)};break
per=[];allv=[]
for day in [10,20]:
 x={p[0]:p for p in cps['tick'][day]['b']};y={p[0]:p for p in cps['event'][day]['b']};dist=sorted(math.hypot(x[k][1]-y[k][1],x[k][2]-y[k][2])/32 for k in x.keys()&y.keys());allv+=dist
 per.append({'day':day,'pairs':len(dist),'unmatchedTick':len(x.keys()-y.keys()),'unmatchedEvent':len(y.keys()-x.keys()),'p50M':dist[len(dist)//2],'p90M':dist[int(len(dist)*.9)],'maxM':dist[-1],'virtualTimeDifferenceMs':cps['tick'][day]['t']-cps['event'][day]['t']})
allv.sort();pair['position']={'per':per,'pairs':len(allv),'p50M':allv[len(allv)//2],'p90M':allv[int(len(allv)*.9)],'maxM':allv[-1]}
(out/'historical-validation.json').write_text(json.dumps(historical,indent=2)+'\n');(out/'new-pair-comparison.json').write_text(json.dumps(pair,ensure_ascii=False,indent=2)+'\n');(out/'historical-partial-validation.json').unlink(missing_ok=True)
print(json.dumps({'historical':historical,'newPair':pair},ensure_ascii=False,indent=2))
