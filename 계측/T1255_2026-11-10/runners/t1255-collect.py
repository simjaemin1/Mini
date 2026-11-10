from pathlib import Path
import json,gzip,shutil,hashlib,subprocess
root=Path('/workspace/Mini-T1255');runs=Path('/tmp/t1255-baseline');out=root/'계측/T1255_2026-11-10';out.mkdir(exist_ok=True)
def read(p):return json.loads(Path(p).read_text())
def dump(p,o):Path(p).write_text(json.dumps(o,ensure_ascii=False,indent=2)+'\n')
tags=['off_old','make_new','repeat1','repeat2'];missing=[t for t in tags if not(runs/t/'status.json').exists()]
if missing:print('PENDING',missing);raise SystemExit(2)
source={f:hashlib.sha256((root/f).read_bytes()).hexdigest()for f in ['server/animals.js','server/wildlife.js','server/zone.js','scripts/t1255-baseline-observe.js']}
old=read(root/'계측/서버기준선_2026-11-08c.json');new=read(root/'계측/서버기준선_2026-11-10.json');assert new['seeds']==old['seeds']==[1020,7,42];assert new['days']==old['days']==400
assert new['head']=='83a44e55',new['head']
groups={};metrics={}
for tag in tags:
 d=runs/tag;s=read(d/'status.json');assert s['rc']==0 and s['sourceUnchanged'];assert source==s['sourceSHA256'];assert read(d/'exit.json')['code']==0
 raw=Path(s['raw']);m={}
 if tag!='make_new':
  check=read(raw/'check.json');assert set(check['res'])=={'1020','7','42'}and all(q['same']for q in check['res'].values())
 for seed in [1020,7,42]:
  p=raw/f'sbc-{seed}.json';world=read(p);assert world['days']==400 and world['seed']==seed;assert read(Path(str(p)+'.t1255-exit.json'))['code']==0
  rs=[json.loads(l)for l in Path(str(p)+'.t1255.jsonl').read_text().splitlines()];assert [r['day']for r in rs]==list(range(1,401));assert not Path(str(p)+'.t1255-error.json').exists()
  a=rs[-1];n=sum(v['population']for v in a['villages']);assert n==world['eight']['pop'];assert a['enabled']==(tag!='off_old')
  m[str(seed)]={'population':n,'empty':world['empty'],'fdDeaths':sum(v['fdDeaths']for v in a['villages']),'foodKcal':sum(v['foodKcal']for v in a['villages']),'legacyMeatEconUnits400':sum(sum(v['legacyMeatUnits']for v in r['villages'])for r in rs),'mobsAlive':a['mobsAlive'],'mobsPresent':a['mobsPresent'],'waterDeerAlive':a['mobsAlive'].get('water_deer',0),'waterDeerPeakDaily':max(r['mobsAlive'].get('water_deer',0)for r in rs),'maxActiveChunks':max(r['activeChunks']for r in rs),'wildlifeTicks':a['wildlife']['ticks'],'realHuntEnabled':a['realHuntEnabled'],'huntStats':a['hunt'],'huntingKgBySpecies':None,'huntingKgReason':'T1195 physical-hunt path disabled; abstract meat has no species attribution','bodyExit':world.get('bodyExit')}
 metrics[tag]=m;groups[tag]=s
 dest=out/tag;dest.mkdir(exist_ok=True)
 for folder in [d,raw]:
  target=dest/('raw'if folder==raw else'controller');target.mkdir(exist_ok=True)
  for f in folder.iterdir():
   if f.is_file()and f.suffix in ['.json','.jsonl','.log']:
    with gzip.open(target/(f.name+'.gz'),'wb')as z:z.write(f.read_bytes())
# Metadata timings are outside the SBC byte contract. Every data record is retained.
changes={}
for seed in ['1020','7','42']:
 a=old['byseed'][seed];b=new['byseed'][seed]
 changes[seed]={'sameDaily':sum(x==y for x,y in zip(a['days'],b['days'])),'sameRunHash':a['runHash']==b['runHash'],'sameEight':a['eight']==b['eight'],'sameSide':a['side']==b['side'],'sameEmpty':a['empty']==b['empty']}
for repeat in ['repeat1','repeat2']:assert metrics[repeat]==metrics['make_new'],repeat
metricChanges={seed:{key:[metrics['off_old'][seed][key],metrics['make_new'][seed][key]]for key in metrics['off_old'][seed]if metrics['off_old'][seed][key]!=metrics['make_new'][seed][key]}for seed in ['1020','7','42']}
comparison={'oldVsNewMetricDifferences':metricChanges,'productCommit':'83a44e55','base':'bc096dc9','seeds':[1020,7,42],'days':400,'offOldGate':3,'newIndependentChecks':[3,3],'oldVsNew':changes,'metrics':metrics,'groups':groups,'sourceSHA256':source,'candidateOnly':True,'candidateBaselineSHA256':hashlib.sha256((root/'계측/서버기준선_2026-11-10.json').read_bytes()).hexdigest(),'oldBaselineSHA256':hashlib.sha256((root/'계측/서버기준선_2026-11-08c.json').read_bytes()).hexdigest()}
dump(out/'comparison.json',comparison)
for f in ['/tmp/t1255-baseline-runs.py','/tmp/t1255-exit.js','/tmp/t1255-section0.py','/tmp/t1255-collect.py','/tmp/t1255-watch.py']:
 (out/'runners').mkdir(exist_ok=True);shutil.copyfile(f,out/'runners'/Path(f).name)
# Preserve the final observer QA raw records as well as the paired baseline JSONs.
qa=read('/tmp/t1255-qa-v2/proof.json');q=out/'checks/observer-qa-raw';q.mkdir(exist_ok=True)
for f in Path(qa['raw']).iterdir():
 if f.is_file()and f.suffix in ['.json','.jsonl','.log']:
  with gzip.open(q/(f.name+'.gz'),'wb')as z:z.write(f.read_bytes())
manifest={str(p.relative_to(out)):hashlib.sha256(p.read_bytes()).hexdigest()for p in out.rglob('*')if p.is_file()and p.name!='manifest.json'};dump(out/'manifest.json',manifest)
print(json.dumps({'changes':changes,'populations':{t:{s:q['population']for s,q in m.items()}for t,m in metrics.items()},'candidateHead':new['head'],'files':len(manifest)},ensure_ascii=False))
