#!/usr/bin/env python3
"""T1358 collection for main >= T1340: village territory counters SURVIVE restarts.
Never sum those counters across segments. Observer-local counters (births, body exits,
add trace, accepted emigrations) are separately accumulated and cross-checked.
"""
import argparse,json,csv,statistics,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--runs',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--allow-live',action='store_true');a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
expected=[f'{arm}-{seed}' for seed in [1020,7] for arm in ['OFF','BODY','A']]
allruns={};dailyout=[];vilout=[]
rd=lambda f:json.loads(f.read_text())
def lines(f):return [json.loads(x) for x in f.read_text().splitlines() if x.strip()] if f.exists() else []
for name in expected:
 d=a.runs/name
 if not (d/'progress.json').exists():
  if a.allow_live:continue
  raise AssertionError('missing run '+name)
 P=rd(d/'progress.json');assert a.allow_live or P.get('done'),name+' incomplete'
 starts=[s['from'] for s in P.get('segs',[])]
 if a.allow_live:
  starts=sorted(set(starts+[int(f.name.split('-')[1].split('.')[0]) for f in d.glob('seg-*.log')]))
 rows=[];villast={};zeroStreak={};worstZero={};zeroDays={};byvilDone={};starveBase=0;traceBase=0;batchBase=0;emigrations=[];errors=[];meta=[]
 for start in sorted(starts):
  base=d/f'seg-{start}.json'
  rr=lines(Path(str(base)+'.t1274-days.jsonl'))
  bodyrows={r['day']:r for r in lines(Path(str(base)+'.t1302-days.jsonl'))}
  terrrows={r['day']:r for r in lines(Path(str(base)+'.t1329-days.jsonl'))}
  for r in rr:
   day=r['day'];assert start<day<=min(start+P['every'],P['days']),(name,start,day)
   assert not rows or day==rows[-1]['day']+1,(name,'gap or duplicate',day)
   br=bodyrows[day];tr=terrrows.get(day);t=r['territoryCost'];inc=0;z=0
   if tr:
    for v in tr['vils']:
     n=v['n'];dv=v['done']-villast.get(n,0);assert dv>=0,(name,n,'territory counter lost on resume')
     villast[n]=v['done'];inc+=dv;z+=int(dv==0)
     zeroStreak[n]=zeroStreak.get(n,0)+1 if dv==0 else 0;worstZero[n]=max(worstZero.get(n,0),zeroStreak[n]);zeroDays[n]=zeroDays.get(n,0)+int(dv==0)
     vilout.append(dict(case=name,day=day,village=n,pop=v['pop'],doneDay=dv,done=v['done'],pending=v['pend'],pendingWood=v['pendWood'],jobBodies=v['jobBodies'],woodSpare=v['woodSpare'],wood=v['wood'],need=v['need']))
     byvilDone.setdefault(n,[]).append([day,dv])
    assert tr['done']==t['body']==br['physical'],(name,day,'independent body count mismatch')
   row=dict(case=name,day=day,segmentStart=start,pop=r['pop'],bodies=r['bodies'],empty=r['empty'],territory=r['territory'],cpuSeconds=r['cpuSeconds'],
    completed=t['body'],completedWood=t['wood'],placedWood=None,doneDay=inc if tr else 0,zeroVillages=z if tr else None,
    traceAdded=traceBase+br['added'],batchCalls=batchBase+br['batchCalls'],bodyStarve=starveBase+r['bodyStarve'],debtDeaths=r['debtDeaths'],
    emigrationCumulative=r['emigrationCumulative'],emigrationDay=r['emigration'],bornDay=r['born'])
   if name.split('-')[0]!='OFF':assert row['traceAdded']==row['completed'],(name,day,'actual expansion trace closure')
   rows.append(row)
  if rr:
   starveBase+=rr[-1]['bodyStarve'];traceBase+=bodyrows[rr[-1]['day']]['added'];batchBase+=bodyrows[rr[-1]['day']]['batchCalls']
  f=Path(str(base)+'.t1302.json')
  if f.exists():
   rec=rd(f);errors+=rec.get('errors',[]);emigrations.extend(e for e in rec.get('emigration',[]) if e.get('accepted'))
  for suffix in ['.t1274.json','.t1329.json']:
   f=Path(str(base)+suffix)
   if f.exists():errors+=rd(f).get('errors',[])
  f=Path(str(base)+'.t1274-meta.json')
  if f.exists():meta.append(rd(f))
 if not rows:
  allruns[name]=dict(done=False,days=0);continue
 assert not errors,(name,errors[:3])
 if not a.allow_live:
  assert len(rows)==P['days'] and len(P['segs'])==(P['days']+P['every']-1)//P['every']
  assert all(s['code']==0 for s in P['segs'])
  assert len(meta)==len(P['segs'])
  assert all(m['exitEventCode']==0 and not (m.get('clock') or {}).get('errs') for m in meta)
 points={}
 for day in [100,200,400]:
  R=next((r for r in rows if r['day']==day),None)
  if R is None:continue
  start=((day-1)//P['every'])*P['every'];snap=d/f'seg-{start}.json.t740.d{day}.json';state=None
  if snap.exists():
   dest=a.out/(name+f'-state-{day}.json')
   subprocess.run(['python3',str(Path(__file__).with_name('t1358-state.py')),str(snap),'--out',str(dest)],check=True,stdout=subprocess.DEVNULL)
   state=rd(dest);R['placedWood']=state['totals']['placedWood']
   assert state['day']==day and state['totals']['done']==R['completed'],(name,day,'snapshot time mismatch')
  elif not a.allow_live:raise AssertionError('missing exact material snapshot '+str(snap))
  window=[r for r in rows if day-10<r['day']<=day]
  prefix=[r for r in rows if r['day']<=day];steady=[r['cpuSeconds'] for r in prefix if r['day']!=r['segmentStart']+1]
  points[str(day)]=dict(R,placedWood=state['totals']['placedWood'] if state else None,
   pendingPlacedWood=state['totals']['pendingPlacedWood'] if state else None,
   materialsResidual=state['totals']['placedMinusCompletedAndPending'] if state else None,
   zeroLast10Mean=statistics.mean(r['zeroVillages'] for r in window) if window and window[0]['zeroVillages'] is not None else None,
   zeroWholeLast10=sum(not any(day-10<d0<=day and n>0 for d0,n in vv) for vv in byvilDone.values()) if byvilDone else None,
   cpuMeanAll=statistics.mean(r['cpuSeconds'] for r in prefix),cpuMeanSteady=statistics.mean(steady) if steady else None,
   emigrated=sum(e['day']<=day for e in emigrations))
 last=rows[-1]
 allruns[name]=dict(done=P.get('done'),days=last['day'],target=P['days'],pop=last['pop'],points=points,
  cpuMeanAll=statistics.mean(r['cpuSeconds'] for r in rows),completed=last['completed'],completedWood=last['completedWood'],
  minBodyRatio=min(r['bodies']/r['pop'] for r in rows if r['pop']),batchCalls=last['batchCalls'],observerErrors=len(errors),
  segments=P.get('segs'),clockExitMeta=meta,
  villageWorst=sorted([dict(village=n,zeroDays=zeroDays[n],maxConsecutiveZero=worstZero[n],completed=villast[n]) for n in villast],key=lambda r:(-r['maxConsecutiveZero'],r['completed'])))
 dailyout.extend(rows)
for name,r in allruns.items():
 for day,point in r.get('points',{}).items():
  seed=name.split('-')[-1];off=allruns.get('OFF-'+seed,{}).get('points',{}).get(day)
  if off:point['offRatio']=point['pop']/off['pop'];point['ratioAtLeast130']=point['offRatio']>=1.30
(a.out/'summary.json').write_text(json.dumps(allruns,ensure_ascii=False,indent=1))
for fname,rows in [('daily.csv',dailyout),('villages-daily.csv',vilout)]:
 if rows:
  with (a.out/fname).open('w') as f:
   w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
print({k:dict(days=v['days'],done=v['done'],pop=v.get('pop')) for k,v in allruns.items()})
