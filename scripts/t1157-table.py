#!/usr/bin/env python3
"""Summarize T1157 with food-debt deaths and matched market-arrival cargo samples."""
import argparse,json,pathlib,hashlib,math
p=argparse.ArgumentParser(description=__doc__);p.add_argument('data',type=pathlib.Path);p.add_argument('--canonical',type=pathlib.Path,required=True);p.add_argument('--original',type=pathlib.Path);p.add_argument('--reference',type=pathlib.Path);p.add_argument('--off-kg',type=pathlib.Path);p.add_argument('--out',type=pathlib.Path,required=True);a=p.parse_args();a.reference=a.reference or a.data;a.off_kg=a.off_kg or a.data;rows=[];refs=[]
def status(f):
 r=json.loads(f.read_text())
 if r.get('rc')!=0 or not(r.get('sourceUnchanged') is True or r.get('sourceChangedDuringRun') is False):raise SystemExit('invalid source/run control: '+str(f))
 return r
for mode in ['off','basket','settle','eat','release','all']:
 for seed in [1020,7,42]:
  f=a.data/f'{mode}-{seed}.json';j=json.loads(f.read_text());status(f.with_suffix('.status.json'));v=json.loads(f.with_suffix('.json.verified.json').read_text())
  if j['days']!=800 or v['days']!=800:raise SystemExit('incomplete world')
  equal=None
  if a.original:
   equal=f.read_bytes()==(a.original/f.name).read_bytes()
   if not equal:raise SystemExit('observer changed world: '+f.name)
  if mode=='off':
   if f.read_bytes()!=(a.canonical/f'main_{seed}.json').read_bytes():raise SystemExit('OFF canonical divergence')
   status(a.off_kg/f'off-{seed}.status.json');kg=json.loads((a.off_kg/f'off-{seed}.json.off-arrival-kg.json').read_text())
   if kg['days']!=800 or kg['errors'] or kg['arrivals']<=0 or not math.isfinite(kg['mean']):raise SystemExit('invalid OFF cargo observation')
   mean,legs=kg['mean'],kg['arrivals']
  else:mean,legs=v['kgPerLeg'],v['legs']
  rows.append({'mode':mode,'seed':seed,'days':800,**{k:v[k] for k in ['population','empty','econDeaths','foodDebtDeaths','starvingPersonDays','starvingVillageDays']},'outboundKgMean':mean,'outboundArrivalCount':legs,'eventDensity':j['eight']['densAll'],'valueEventDensity':j['eight']['densValue'],'byteEqualOriginal':equal,'worldSHA256':hashlib.sha256(f.read_bytes()).hexdigest()})
for seed in [1020,7,42]:
 f=a.reference/f'reference-{seed}.json';j=json.loads(f.read_text())
 if j['days']!=800 or f.read_bytes()!=(a.canonical/f'main_{seed}.json').read_bytes():raise SystemExit('prerequisite control divergence')
 refs.append({'seed':seed,'days':800,'byteEqualCanonical':True})
totals={m:{k:sum(r[k] for r in rows if r['mode']==m) for k in ['population','empty','econDeaths','foodDebtDeaths','starvingPersonDays','starvingVillageDays']} for m in ['off','basket','settle','eat','release','all']}
a.out.parent.mkdir(parents=True,exist_ok=True);a.out.write_text(json.dumps({'complete':True,'definitions':{'econDeaths':'_deadTot population-pressure plus food-debt deaths','foodDebtDeaths':'_fdDeadTot food-debt loop only','hunger':'daily foodDebtOf(v).starving, summed as person-days or village-days','outboundKgMean':'departure kg of outbound legs reaching accepted market arrival; abandoned legs excluded; legacy T707 settlement may still be pending. OFF state transition and basket arrive event use the same arrival sample; old all-launch average is reference only.'},'runs':rows,'totals':totals,'referenceControls':refs},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'complete':True,'variants':len(rows),'referenceControls':len(refs)}))
