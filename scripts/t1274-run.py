"""T1274: fresh body worlds, exactly two body cases at once, product source frozen."""
from pathlib import Path
import os, sys, json, time, hashlib, subprocess, concurrent.futures
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1274').resolve()
P.mkdir(parents=True,exist_ok=True)
PRODUCT=subprocess.check_output(['git','ls-files','server','sim','public'],cwd=R,text=True).splitlines()
HOOKS=['scripts/t745-vclock.js','scripts/t577-server-run.js','scripts/t577-server-hook.js',
       'scripts/server-baseline-check.js','scripts/t1243-observe.js','scripts/t1221-observe.js',
       'scripts/t1230-observe.js','scripts/t1251-observe.js','scripts/t1274-baseline-hook.js',
       'scripts/t1274-observe.js','scripts/t1274-run.py','scripts/t1274-fast-current.py','scripts/t1274-supervise.py']
FILES=PRODUCT+HOOKS
hashes=lambda:{f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in FILES if (R/f).is_file()}
source=hashes()
(P/'source.json').write_text(json.dumps({'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),'sha256':source},indent=2))
LEGACY=['scripts/t1243-observe.js','scripts/t1221-observe.js','scripts/t1230-observe.js','scripts/t1251-observe.js']
def run(name,w=0,t=0,days=100,observed=True,kind='body'):
 d=P/name;d.mkdir(parents=True,exist_ok=True)
 flags={'T325_WOOD_ACT':str(w),'T1259_WOOD_CAP':'0','T1207_TERR_REAL':str(t),'T1238_TERR_V2':str(t),'T1243_FARM_ON':'0'}
 env=dict(os.environ,**flags);env['NODE_OPTIONS']='-r '+str(R/'scripts/t1274-baseline-hook.js')
 if kind=='body':
  flags.update({'VILLAGE_DAY_MS':'1440000','VILLAGE_NPC_CAP':'Infinity','T400_BUILD_ACT':'0','VILLAGE_CARAVAN_MAX':'0',
   'T745_VCLOCK':'1','T1244_BODY_MS':'10000','T1221_EVERY':'10','T577_PAR':'1','T577_DIR':str(d/'server'),'T577_TAG':'run'})
  env.update(flags)
  hooks=['scripts/t745-vclock.js','scripts/t1274-baseline-hook.js']+(LEGACY+['scripts/t1274-observe.js'] if observed else [])
  env['NODE_OPTIONS']=' '.join('-r '+str(R/f) for f in hooks)
  args=['node','scripts/t577-server-run.js',str(days),'1020']
 elif kind=='old-clock':
  flags.update({'T1253_CLOCK_FIX':'0','T1258_ARTISAN_CLOCK':'0'});env.update(flags)
  args=['node','scripts/server-baseline-check.js','--make',str(d/'baseline.json'),'--days','400','--seeds','1020','--vclock','--par','1']
 else:
  args=['node','scripts/server-baseline-check.js','계측/서버기준선_2026-11-11.json','--vclock','--plan','1020:400','--par','1']
 info={'name':name,'kind':kind,'flags':flags,'argv':args,'NODE_OPTIONS':env.get('NODE_OPTIONS'),
       'source':source,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 (d/'input.json').write_text(json.dumps(info,indent=2));start=time.monotonic()
 with (d/'controller.log').open('w') as f:r=subprocess.run(args,cwd=R,env=env,stdout=f,stderr=subprocess.STDOUT)
 status={'exit':r.returncode,'wallSeconds':time.monotonic()-start,'sourceUnchanged':hashes()==source,
         'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 (d/'status.json').write_text(json.dumps(status,indent=2));print(name,status,flush=True)
 if r.returncode or not status['sourceUnchanged']:raise RuntimeError((name,status))
 return status

with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 fs=[pool.submit(run,'PREFLIGHT_PLAIN',days=1,observed=False),pool.submit(run,'PREFLIGHT_OBSERVED',days=1)]
 [f.result() for f in fs]
a=json.loads((P/'PREFLIGHT_PLAIN/server/run-1020.json.sbc.json').read_text())
b=json.loads((P/'PREFLIGHT_OBSERVED/server/run-1020.json.sbc.json').read_text())
assert a==b,'Observer preflight changed native economy fingerprint'
(P/'preflight.json').write_text(json.dumps({'days':1,'sameNativeFingerprint':True},indent=2))
results={}
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 for pair in [[('OFF',0,0),('WOOD',1,0)],[('TERR',0,1),('V2_WOOD',1,1)]]:
  futures={pool.submit(run,n,w,t):n for n,w,t in pair}
  for f in concurrent.futures.as_completed(futures):results[futures[f]]=f.result()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
 futures={pool.submit(run,'FAST_OLD_CLOCK',1,1,kind='old-clock'):'FAST_OLD_CLOCK',
          pool.submit(run,'OFF_GATE',kind='gate'):'OFF_GATE'}
 for f in concurrent.futures.as_completed(futures):results[futures[f]]=f.result()
(P/'status.json').write_text(json.dumps(results,indent=2));print('T1274 all stages complete',flush=True)
