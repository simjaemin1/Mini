"""Validate every completed T1302 run before publishing any 100-day result."""
from pathlib import Path
import sys,json,gzip,hashlib,subprocess,re,csv,statistics
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1302-r2')
O=R/'계측/T1302_2026-11-14';O.mkdir(exist_ok=True)
read=lambda p:json.loads(p.read_text())
complete=read(P/'complete.json');assert complete['state']=='complete'
source=read(P/'source.json')
for label,root in [('current',R),('original',Path('/tmp/t1302-t1274-original'))]:
 for name,h in source['sha256'][label].items():assert hashlib.sha256((root/name).read_bytes()).hexdigest()==h,name
def archive(src,dst):
 dst.parent.mkdir(parents=True,exist_ok=True)
 if src.suffix in ['.json','.jsonl','.log','.patch']:
  dst=dst.with_name(dst.name+'.gz');dst.write_bytes(gzip.compress(src.read_bytes(),mtime=0))
 else:dst.write_bytes(src.read_bytes())
summary={'base':'3dae4c5f','implementation':source['currentHead'],'completedUTC':complete['finishedUTC'],'cases':{},'seedComparison':{}}
cases=['OFF_1020','COMBO_1020','BODY_1020','OFF_7','COMBO_7','BODY_7','T1274_REPLAY_1020']
for name in cases:
 d=P/name;info=read(d/'input.json');status=read(d/'status.json');seed=info['seed'];q=d/'server';prefix=f'run-{seed}'
 assert status['exit']==0 and status['sourceUnchanged']
 n=read(q/(prefix+'.json'));x=read(q/(prefix+'.json.t1274.json'));z=read(q/(prefix+'.json.zone-exit.json'))
 m=read(q/(prefix+'.json.t1274-meta.json'));diag=read(q/(prefix+'.json.t1302.json'))
 assert n['days']==100 and n['villages']==51 and min(n['seedPop'])>0
 assert [r[0] for r in n['rows']]==list(range(1,101))
 assert [r['day'] for r in x['rows']]==list(range(1,101))
 assert [r['day'] for r in diag['daily']]==list(range(1,101))
 assert not x['errors'] and not diag['errors'] and x['clock']['errs']==0 and m['clock']['errs']==0
 assert z['code']==0 and z['signal'] is None and m['exitEventCode']==0 and m['npcCapEnvironment'] is None
 assert x['rows'][-1]['pop']==n['eight']['pop']==diag['daily'][-1]['population']
 assert x['rows'][-1]['bodies']==diag['daily'][-1]['bodies']
 assert x['rows'][-1]['bodyStarve']==n['bodyExit']['died']['starve']
 assert x['rows'][-1]['debtDeaths']==read(q/(prefix+'.fd-deaths.json'))['fdDeadTot']
 for suffix in ['t1243','t1221','t1230','t1251']:assert read(q/(prefix+'.'+suffix+'.json')).get('err') is None
 fp=read(q/(prefix+'.json.sbc.json'));assert len(fp['days'])==100
 accepted=[e for e in diag['emigration'] if e['accepted']]
 final=x['rows'][-1];assert len(accepted)==final['emigrationCumulative'],(name,len(accepted),final['emigrationCumulative'])
 ratio=min(r['bodies']/r['pop'] for r in x['rows'] if r['pop'])
 actual=diag['daily'][-1]
 c={'seed':seed,'population':n['eight']['pop'],'empty':n['empty'],'eight':n['eight'],
    'bodyExit':n['bodyExit'],'final':final,'daily':x['rows'],
    'minBodyRatio':ratio,'maxBodyGap':max(r['pop']-r['bodies'] for r in x['rows']),
    'meanCPUSecondsDays2to100':statistics.mean(r['cpuSeconds'] for r in x['rows'][1:]),
    'peakCPU':max(x['rows'],key=lambda r:r['cpuSeconds']),
    'physical':actual['physical'],'added':actual['added'],'batchCalls':actual['batchCalls'],
    'emigration':len(accepted),'uniqueEmigrants':len({e['person'] for e in accepted}),
    'events':accepted,'diagnosticDaily':[{k:r[k] for k in ['day','population','bodies','physical','added','batchCalls']} for r in diag['daily']],'zoneExit':z,'wallSeconds':status['wallSeconds']}
 if name.startswith('BODY_'):
  assert c['physical']>0 and c['physical']==c['added'] and c['batchCalls']==0,(name,'physical path not exclusive')
  c['maxUnrepresentedPeople']=max(sum(len(v['missingPeople']) for v in row['villages']) for row in diag['daily'])
  assert c['maxUnrepresentedPeople']==0,(name,'person id without its own body')
  c['bodyTargetMet']=ratio>=.98
 if name=='T1274_REPLAY_1020':
  assert c['population']==3423 and c['emigration']==193 and final['bodies']==3232
  golden=json.loads(gzip.decompress((R/'계측/T1274_2026-11-12/runs/V2_WOOD/run-1020.json.sbc.json.gz').read_bytes()))
  assert fp==golden,'Original replay changed the T1274 economic fingerprint'
  c['sameOriginalEconomicFingerprint100Days']=True
 summary['cases'][name]=c
 for f in d.iterdir():
  if f.is_file():archive(f,O/'controllers'/name/f.name)
 for f in q.iterdir():
  if f.is_file() and '.db' not in f.name:archive(f,O/'runs'/name/f.name)
 fields=['day','village','person','job','age','population','bodies','food','wood','happiness','health','housing','mapBeds','pressure','predicate']
 with (O/(name+'-emigration.csv')).open('w') as f:
  w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader()
  for e in accepted:w.writerow({k:e.get(k) for k in fields})
for seed in [1020,7]:
 off,old,new=[summary['cases'][f'{arm}_{seed}'] for arm in ['OFF','COMBO','BODY']]
 summary['seedComparison'][str(seed)]={'off':off['population'],'oldCombo':old['population'],'bodyCombo':new['population'],
  'oldRatio':old['population']/off['population'],'bodyRatio':new['population']/off['population'],
  'emigrationOff':off['emigration'],'emigrationOld':old['emigration'],'emigrationBody':new['emigration'],
  'emigrationTargetMet':new['emigration']<=off['emigration'],'bodyTargetMet':new['minBodyRatio']>=.98}
g=P/'GATE_1020';log=(g/'controller.log').read_text();assert read(g/'status.json')['exit']==0 and '=== 같음 1/1' in log
q=Path(re.search(r'판 (/tmp/sbc-\w+)',log)[1]);n=read(q/'sbc-1020.json');side=read(q/'sbc-1020.json.t740.json')
assert n['days']==400 and len(n['rows'])==400 and n['eight']['pop']==3914
assert [r['d'] for r in side['days']]==list(range(1,401)) and len(side['names'])==51
keys=sorted({k for row in side['days'] for k in row['f']});H=lambda s,n:hashlib.sha1(s.encode()).hexdigest()[:n]
days=[]
for row in side['days']:
 hs=[H(row['f'].get(k) or '∅',8) for k in keys];days.append([row['d'],H(''.join(hs),12),hs])
gold=read(R/'계측/서버기준선_2026-11-11.json')['byseed']['1020']
assert {'names':side['names'],'keys':keys,'days':days}==gold['side'] and n['eight']==gold['eight']
assert read(q/'sbc-1020.json.zone-exit.json')['code']==0 and read(q/'sbc-1020.json.t1274-meta.json')['clock']['errs']==0
summary['gate']={'same':'1/1','population':3914,'economicDays':400,'lifeDays':400,'lastLine':log.strip().splitlines()[-1]}
assert summary['gate']['lastLine'].startswith('=== 같음 1/1 · 경제 400/400 · 생활층 400/400 · 판 ')
for f in g.iterdir():
 if f.is_file():archive(f,O/'controllers/GATE_1020'/f.name)
for f in q.iterdir():
 if f.is_file() and '.db' not in f.name:archive(f,O/'runs/GATE_1020'/f.name)
for name in ['source.json','source.patch','processes.json','launch.json','environment.json','supervisor.log','complete.json']:
 if (P/name).exists():archive(P/name,O/name)
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
fields=['case','day','pop','bodies','empty','cpuSeconds','emigrationCumulative','bodyStarve','debtDeaths','territory','wood']
with (O/'daily.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=fields,lineterminator='\n');w.writeheader()
 for name,c in summary['cases'].items():
  for r in c['daily']:w.writerow({'case':name,**{k:r[k] for k in fields if k!='case'}})
print(json.dumps({'seedComparison':summary['seedComparison'],'gate':summary['gate'],'originalReplay':True},ensure_ascii=False))
