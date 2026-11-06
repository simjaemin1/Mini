#!/usr/bin/env python3
"""Same-day three-seed home-N comparison in the existing physical war world.
Use a separate output directory. This does not replace or regenerate a baseline.
"""
import argparse,hashlib,json,os,pathlib,re,signal,subprocess,time
p=argparse.ArgumentParser(description=__doc__);p.add_argument('source',type=pathlib.Path);p.add_argument('output',type=pathlib.Path);p.add_argument('--days',type=int,default=200);p.add_argument('--port-base',type=int,default=60000);p.add_argument('--limit',type=int,default=3600);p.add_argument('--world',choices=['inf','front'],default='inf');p.add_argument('--battle-day',choices=['0','1'],default='1');a=p.parse_args()
if a.days<=0 or a.limit<=0:p.error('days and limit must be positive')
a.source=a.source.resolve();a.output=a.output.resolve();a.output.mkdir(parents=True,exist_ok=True);node=os.environ.get('ACT_NODE','node');version=subprocess.check_output([node,'--version'],text=True).strip()
if not version.startswith('v22.'):p.error('set ACT_NODE to the baseline Node22 executable')
knobs=['T790_NO_SNAP','T1041_WAR_BODY','T811_ARMS_BODY','T449_BODY_DAY','T491_BATCH_FROM_BODY','T561_ROSTER_BODY','T502_ODDS_REAL','T815_DRAFT_FAMINE','T941_BATTLE_DAY','T627_TRIP_DAY','T1076_ARMY_MORALE','T466_LOOT_ACT','T826_LOOT_BODY','T1168_SORTIE_AMMO','T1078_BANDIT_ALL','T1079_BANDIT_CAMP','T1104_BANDIT_WALK']
files=['server/villages.js','server/bandits.js','server/home-population.js','server/war-live.js','sim/war-core.js','sim/economy-sim.js','scripts/t1159-observe.js','scripts/t1078-observe.js','scripts/t1079-observe.js','scripts/t1104-observe.js']
def hashes():return {f:hashlib.sha256((a.source/f).read_bytes()).hexdigest() for f in files}
sha=hashes();manifest={'source':str(a.source),'node':version,'sourceSHA256':sha,'days':a.days,'portBase':a.port_base,'limitSeconds':a.limit,'world':a.world,'battleDay':a.battle_day,'runs':[]};mp=a.output/'suite.json'
if mp.exists():
 old=json.loads(mp.read_text())
 if any(old[k]!=manifest[k] for k in ['sourceSHA256','node','days','portBase','limitSeconds']) or old.get('world','inf')!=a.world or old.get('battleDay','1')!=a.battle_day:raise SystemExit('source or conditions changed; choose a separate output directory')
 manifest=old
for mode in ['0','1']:
 if any(r['mode']==mode for r in manifest['runs']):continue
 env=os.environ.copy()
 for k in list(env):
  if k.startswith(('T1159_','T577_')) or k=='NODE_OPTIONS':env.pop(k)
 env.update({k:'1' for k in knobs});env.update(T941_BATTLE_DAY=a.battle_day,T1159_HOME_N=mode,T577_PORT_BASE=str(a.port_base),NODE_OPTIONS='-r '+str(a.source/'scripts/t1159-observe.js'))
 # front uses the same existing T1041 rule as --war front: war towns have
 # unlimited bodies; other towns retain the ordinary harness cap. No new baseline.
 if a.world=='front':env.pop('VILLAGE_NPC_CAP',None)
 reference='계측/서버기준선_전쟁_2026-11-03.json' if a.world=='inf' else '계측/서버기준선_2026-11-04c.json'
 args=[node,'scripts/server-baseline-check.js',reference]+(['--war'] if a.world=='inf' else [])+['--days',str(a.days),'--seeds','1020,7,42','--par','3'];log=a.output/f'home-{mode}.log';start=time.monotonic();timed=False
 with log.open('w') as stream:
  child=subprocess.Popen(args,cwd=a.source,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  try:rc=child.wait(timeout=a.limit)
  except subprocess.TimeoutExpired:
   timed=True;os.killpg(child.pid,signal.SIGTERM)
   try:child.wait(timeout=10)
   except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);child.wait()
   rc=124
 text=log.read_text();m=re.search(r' · 판 (/tmp/sbc-[^ =\n]+)',text);d=pathlib.Path(m[1]) if m else None;complete=False;seeds=[]
 if d and (d/'check.json').exists():
  check=json.loads((d/'check.json').read_text());complete=rc in [0,1] and not timed and all(check.get('per',{}).get(str(seed),{}).get('code')==0 for seed in [1020,7,42])
  for seed in [1020,7,42]:
   f=d/f'sbc-{seed}.json';h=d/f'sbc-{seed}.t1159.json';w=json.loads(f.read_text());home=json.loads(h.read_text());valid=w['days']==a.days and home['endDay']==a.days and home['lastCompleteEconDay']==a.days and not home['errors'];complete &= valid
   seeds.append({'seed':seed,'days':w['days'],'population':w['eight']['pop'],'births':home['births'],'starvationDeaths':home['starvationDeaths'],'starvingPersonDays':home['starvingPersonDays'],'awayPersonDays':home['awayPersonDays'],'observerErrors':home['errors'],'unknownHomeDays':home['unknownHomeDays']})
 if hashes()!=sha:raise SystemExit('measured source changed')
 r={'mode':mode,'exit':rc,'timedOut':timed,'seconds':time.monotonic()-start,'args':args,'env':{k:env[k] for k in knobs+['T1159_HOME_N','T577_PORT_BASE','NODE_OPTIONS']},'sbcDir':str(d) if d else None,'complete':bool(complete),'seeds':seeds};manifest['runs'].append(r);mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');print(json.dumps(r,ensure_ascii=False),flush=True)
 if not complete:break
manifest['complete']=len(manifest['runs'])==2 and all(r['complete'] for r in manifest['runs']);mp.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n');raise SystemExit(0 if manifest['complete'] else 1)
