#!/usr/bin/env python3
"""T1411 six-world collection for main >= T1340: village territory counters SURVIVE restarts.
Never sum those counters across segments. Observer-local counters (births, body exits,
add trace, accepted emigrations) are separately accumulated and cross-checked.
"""
import argparse,json,csv,statistics,subprocess,re
from pathlib import Path
from t1411_resident_audit import resident_link_audit
p=argparse.ArgumentParser();p.add_argument('--runs',type=Path,required=True);p.add_argument('--out',type=Path,required=True);p.add_argument('--allow-live',action='store_true');p.add_argument('--cases',help='comma-separated diagnostic cases; default is the six 730-day arms')
p.add_argument('--report-link-gaps',action='store_true',help='export resident identity violations as explicit RED findings; default strict identity check remains unchanged')
a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
expected=a.cases.split(',') if a.cases else [f'{arm}-{seed}' for seed in [1020,7,42] for arm in ['OFF','ON']]
allruns={};dailyout=[];vilout=[]
rd=lambda f:json.loads(f.read_text())
def lines(f):return [json.loads(x) for x in f.read_text().splitlines() if x.strip()] if f.exists() else []
for name in expected:
 d=a.runs/name
 if not (d/'progress.json').exists():
  if a.allow_live:continue
  raise AssertionError('missing run '+name)
 launch=rd(a.runs/(name+'.launch.json'));is_on=launch['arm']=='ON'
 P=rd(d/'progress.json')
 exitpath=a.runs/(name+'.exit.json');actualExit=rd(exitpath) if exitpath.exists() else None
 failed=actualExit is not None and (actualExit['exit']!=0 or not P.get('done'))
 assert a.allow_live or P.get('done') or failed,name+' incomplete and still running'
 starts=[s['from'] for s in P.get('segs',[])]
 if a.allow_live or failed:
  starts=sorted(set(starts+[int(f.name.split('-')[1].split('.')[0]) for f in d.glob('seg-*.log')]))
 rows=[];villast={};zeroStreak={};worstZero={};zeroDays={};byvilDone={};starveBase=0;traceBase=0;batchBase=0;emigrations=[];errors=[];meta=[];linkDetails=[]
 for start in sorted(starts):
  base=d/f'seg-{start}.json'
  rr=lines(Path(str(base)+'.t1274-days.jsonl'))
  bodyrows={r['day']:r for r in lines(Path(str(base)+'.t1302-days.jsonl'))}
  terrrows={r['day']:r for r in lines(Path(str(base)+'.t1329-days.jsonl'))}
  census={r['day']:r for r in lines(Path(str(base)+'.t1411-census.jsonl'))}
  for r in rr:
   day=r['day'];assert start<day<=min(start+P['every'],P['days']),(name,start,day)
   assert not rows or day==rows[-1]['day']+1,(name,'gap or duplicate',day)
   br=bodyrows[day];tr=terrrows.get(day);t=r['territoryCost'];inc=0;z=0;zq=0;zw=0;zdry=0;emptyneed=0
   if tr:
    for v in tr['vils']:
     n=v['n'];dv=v['done']-villast.get(n,0);assert dv>=0,(name,n,'territory counter lost on resume')
     villast[n]=v['done'];inc+=dv;z+=int(dv==0);zq+=int(dv==0 and v['pend']>0);zw+=int(dv==0 and v['pendWood']>0);zdry+=int(dv==0 and v['pendWood']>0 and v['woodSpare']<=0);emptyneed+=int(v['pend']==0 and v['need']>0)
     zeroStreak[n]=zeroStreak.get(n,0)+1 if dv==0 else 0;worstZero[n]=max(worstZero.get(n,0),zeroStreak[n]);zeroDays[n]=zeroDays.get(n,0)+int(dv==0)
     vilout.append(dict(case=name,day=day,village=n,pop=v['pop'],doneDay=dv,done=v['done'],pending=v['pend'],pendingWood=v['pendWood'],jobBodies=v['jobBodies'],woodSpare=v['woodSpare'],wood=v['wood'],need=v['need']))
     byvilDone.setdefault(n,[]).append([day,dv])
    assert tr['done']==t['body']==br['physical'],(name,day,'independent body count mismatch')
   row=dict(case=name,day=day,segmentStart=start,pop=r['pop'],bodies=r['bodies'],empty=r['empty'],territory=r['territory'],cpuSeconds=r['cpuSeconds'],
    completed=t['body'],completedWood=t['wood'],placedWood=None,scheduledAwakeAtLedger=census.get(day,{}).get('scheduledAwakeAtLedger'),doneDay=inc if tr else 0,zeroVillages=z if tr else None,zeroNeverCompleted=sum(v['done']==0 for v in tr['vils']) if tr else None,zeroWithQueue=zq if tr else None,zeroWithWoodOwed=zw if tr else None,zeroDryWoodOwed=zdry if tr else None,emptyQueueWithNeed=emptyneed if tr else None,
    traceAdded=traceBase+br['added'],batchCalls=batchBase+br['batchCalls'],bodyStarve=starveBase+r['bodyStarve'],debtDeaths=r['debtDeaths'],
    emigrationCumulative=r['emigrationCumulative'],emigrationDay=r['emigration'],bornDay=r['born'],missingResidents=sum(len(v['missingPeople']) for v in br['villages']) if is_on else None)
   if is_on:
    assert row['traceAdded']==row['completed'],(name,day,'actual expansion trace closure')
    missing=[dict(name=v['name'],population=v['population'],bodies=v['bodies'],missingPeople=v['missingPeople']) for v in br['villages'] if v['missingPeople']]
    if missing:linkDetails.append(dict(day=day,villages=missing))
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
  allruns[name]=dict(done=False,failed=failed,days=0,target=P['days'],actualExit=actualExit,launch=launch,checkpoint=P['ck']);continue
 assert failed or not errors,(name,errors[:3])
 identityAudit=resident_link_audit(rows,enforce=not a.allow_live and not failed,report_gaps=a.report_link_gaps,details=linkDetails) if is_on else dict(applicable=False,passed=None,status='not-applicable')
 if not a.allow_live and not failed:
  if is_on:
   assert min(r['bodies']/r['pop'] for r in rows if r['pop'])>=1,(name,'body cap')
 if not a.allow_live and not failed:
  assert len(rows)==P['days'] and len(P['segs'])==(P['days']+P['every']-1)//P['every']
  assert all(s['code']==0 for s in P['segs'])
  assert len(meta)==len(P['segs'])
  assert all(m['exitEventCode']==0 and isinstance(m.get('clock'),dict) and m['clock']['errs']==0 and m['clock']['fired']>0 and m['clock']['V']>=m['clock']['V0'] for m in meta)
 points={}
 for day in [1,10,20,30,100,200,300,365,400,500,600,700,730]:
  R=next((r for r in rows if r['day']==day),None)
  if R is None:continue
  start=((day-1)//P['every'])*P['every'];snap=d/f'seg-{start}.json.t740.d{day}.json';state=None
  if snap.exists():
   dest=a.out/(name+f'-state-{day}.json')
   subprocess.run(['python3',str(Path(__file__).with_name('t1358-state.py')),str(snap),'--out',str(dest)],check=True,stdout=subprocess.DEVNULL)
   state=rd(dest);R['placedWood']=state['totals']['placedWood']
   assert state['day']==day and state['totals']['done']==R['completed'],(name,day,'snapshot time mismatch')
  elif not a.allow_live and not failed and day>=100:raise AssertionError('missing exact material snapshot '+str(snap))
  window=[r for r in rows if day-10<r['day']<=day]
  prefix=[r for r in rows if r['day']<=day];steady=[r['cpuSeconds'] for r in prefix if r['day']!=r['segmentStart']+1]
  points[str(day)]=dict(R,placedWood=state['totals']['placedWood'] if state else None,
   drawnWood=state['totals']['drawnWood'] if state else None,loadTrips=state['totals']['loadTrips'] if state else None,
   pendingPlacedWood=state['totals']['pendingPlacedWood'] if state else None,
   materialsResidual=state['totals']['placedMinusCompletedAndPending'] if state else None,
   zeroLast10Mean=statistics.mean(r['zeroVillages'] for r in window) if window and window[0]['zeroVillages'] is not None else None,
   zeroWholeLast10=sum(not any(day-10<d0<=day and n>0 for d0,n in vv) for vv in byvilDone.values()) if byvilDone else None,
   cpuMeanAll=statistics.mean(r['cpuSeconds'] for r in prefix),cpuMeanSteady=statistics.mean(steady) if steady else None,
   cpuLast100Mean=statistics.mean(r['cpuSeconds'] for r in rows if day-100<r['day']<=day),
   emigrated=None if failed and start not in [s['from'] for s in P.get('segs',[])] and not (d/f'seg-{start}.json.t1302.json').exists() else sum(e['day']<=day for e in emigrations))
 last=rows[-1]
 failureEvidence=None
 if failed:
  log=d/f'seg-{max(starts)}.log';text=log.read_text(errors='replace') if log.exists() else ''
  loggedDays=[int(x) for x in re.findall(r'econ day (\d+)',text)]
  zone=d/f'seg-{max(starts)}.json.zone-exit.json'
  failureEvidence=dict(lastObservedLedgerDay=last['day'],lastLoggedEconomyDay=max(loggedDays) if loggedDays else None,
   checkpoint=P['ck'],zoneExit=rd(zone) if zone.exists() else None,lastLogLines=text.splitlines()[-20:],observerErrors=errors)
 allruns[name]=dict(done=P.get('done'),failed=failed,days=last['day'],target=P['days'],pop=last['pop'],points=points,
  cpuMeanAll=statistics.mean(r['cpuSeconds'] for r in rows),completed=last['completed'],completedWood=last['completedWood'],
  minBodyRatio=min(r['bodies']/r['pop'] for r in rows if r['pop']),maxBodyGap=max(r['pop']-r['bodies'] for r in rows),maxMissingResidents=max(r['missingResidents'] for r in rows) if is_on else None,batchCalls=last['batchCalls'],observerErrors=len(errors),
  launch=launch,segments=P.get('segs'),clockExitMeta=meta,
  actualExit=actualExit,failureEvidence=failureEvidence,residentLinkAudit=identityAudit,
  emptyQueuePositiveNeedVillageDays=sum(r['emptyQueueWithNeed'] or 0 for r in rows),villageWorst=sorted([dict(village=n,zeroDays=zeroDays[n],maxConsecutiveZero=worstZero[n],completed=villast[n]) for n in villast],key=lambda r:(-r['maxConsecutiveZero'],r['completed'])))
 dailyout.extend(rows)
for name,r in allruns.items():
 for day,point in r.get('points',{}).items():
  seed=name.split('-')[-1];off=allruns.get('OFF-'+seed,{}).get('points',{}).get(day)
  if off:
   point['offRatio']=point['pop']/off['pop'] if off['pop'] else None
   point['ratioAtLeast130']=point['offRatio']>=1.30 if point['offRatio'] is not None else None
(a.out/'summary.json').write_text(json.dumps(allruns,ensure_ascii=False,indent=1))
for fname,rows in [('daily.csv',dailyout),('villages-daily.csv',vilout)]:
 if rows:
  with (a.out/fname).open('w') as f:
   w=csv.DictWriter(f,fieldnames=list(rows[0]),lineterminator='\n');w.writeheader();w.writerows(rows)
print({k:dict(days=v['days'],done=v['done'],pop=v.get('pop')) for k,v in allruns.items()})
