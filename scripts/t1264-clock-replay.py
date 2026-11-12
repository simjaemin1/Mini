# T1264: historical clock-condition counterfactual, after the observer gate (diagnostic).
from pathlib import Path
import os,json,time,hashlib,subprocess,concurrent.futures,sys
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1264-replay').resolve();P.mkdir(parents=True,exist_ok=True)
FILES=['sim/economy-sim.js','server/villages.js','server/zone.js','server/wood-walk-evidence.json','scripts/t1264-observe.js','scripts/server-baseline-check.js','scripts/t577-server-run.js']
source={f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in FILES};(P/'clock-source.json').write_text(json.dumps(source,indent=2))
ARMS={'OFF':(0,0,0),'WOOD':(1,0,0),'TERR':(0,0,1),'V2_WOOD':(1,0,1)}
def run(name,flags,args):
 d=P/name;d.mkdir(exist_ok=True);env=dict(os.environ,**{k:str(v) for k,v in flags.items()},NODE_OPTIONS='-r '+str(R/'scripts/t1264-observe.js'))
 info={'name':name,'flags':flags,'argv':args,'source':source,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};(d/'input.json').write_text(json.dumps(info,indent=2));t=time.monotonic()
 with (d/'controller.log').open('w') as f:r=subprocess.run(['node','scripts/server-baseline-check.js',*args],cwd=R,env=env,stdout=f,stderr=subprocess.STDOUT)
 after={f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in FILES};z={'exit':r.returncode,'wallSeconds':time.monotonic()-t,'sourceUnchanged':after==source,'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};(d/'status.json').write_text(json.dumps(z,indent=2));print(name,z,flush=True);return name,z

# Wait until the observer gate finishes so at most five servers share this host.
while not (P/'OFF_GATE/status.json').exists(): time.sleep(10)
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 futures=[]
 for name,w,t in [('OLD_CLOCK_OFF',0,0),('OLD_CLOCK_V2_WOOD',1,1)]:
  flags={'T325_WOOD_ACT':w,'T1259_WOOD_CAP':0,'T1207_TERR_REAL':t,'T1238_TERR_V2':t,'T1253_CLOCK_FIX':0,'T1258_ARTISAN_CLOCK':0}
  args=['--make',str(P/name/'baseline.json'),'--days','400','--seeds','1020','--vclock','--par','1']
  futures.append(pool.submit(run,name,flags,args))
 results=dict(f.result() for f in concurrent.futures.as_completed(futures))
(P/'clock-status.json').write_text(json.dumps(results,indent=2))
raise SystemExit(any(z['exit'] or not z['sourceUnchanged'] for z in results.values()))
