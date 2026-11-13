"""Same-source fast clock ON control, to isolate the two clock fixes on land1068."""
from pathlib import Path
import os, sys, json, time, hashlib, subprocess
R=Path(__file__).resolve().parents[1];P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1274').resolve()
while not (all((P/a/'status.json').exists() for a in ['OFF','WOOD','TERR','V2_WOOD']) and
           any((P/a/'status.json').exists() for a in ['FAST_OLD_CLOCK','OFF_GATE'])):
 time.sleep(10)
d=P/'FAST_CURRENT';d.mkdir(parents=True,exist_ok=True)
source=json.loads((P/'source.json').read_text())['sha256']
assert all(hashlib.sha256((R/f).read_bytes()).hexdigest()==h for f,h in source.items())
flags={'T325_WOOD_ACT':'1','T1259_WOOD_CAP':'0','T1207_TERR_REAL':'1','T1238_TERR_V2':'1',
       'T1243_FARM_ON':'0','T1253_CLOCK_FIX':'1','T1258_ARTISAN_CLOCK':'1'}
env=dict(os.environ,**flags);env['NODE_OPTIONS']='-r '+str(R/'scripts/t1274-baseline-hook.js')
args=['node','scripts/server-baseline-check.js','--make',str(d/'baseline.json'),'--days','400','--seeds','1020','--vclock','--par','1']
(d/'input.json').write_text(json.dumps({'argv':args,'flags':flags,'source':source,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
t=time.monotonic()
with (d/'controller.log').open('w') as f:r=subprocess.run(args,cwd=R,env=env,stdout=f,stderr=subprocess.STDOUT)
status={'exit':r.returncode,'wallSeconds':time.monotonic()-t,
        'sourceUnchanged':all(hashlib.sha256((R/f).read_bytes()).hexdigest()==h for f,h in source.items()),
        'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(d/'status.json').write_text(json.dumps(status,indent=2));print(status,flush=True)
raise SystemExit(r.returncode or int(not status['sourceUnchanged']))
