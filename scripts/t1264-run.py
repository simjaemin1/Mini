# T1264: measurement only; four arms and the observer gate (diagnostic; see t1264-full-gate.py). Node 22 required.
from pathlib import Path
import os,json,time,hashlib,subprocess,concurrent.futures,sys
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1264-replay').resolve();P.mkdir(parents=True,exist_ok=True)
tracked=subprocess.check_output(['git','ls-files','server','sim','public'],cwd=R,text=True).splitlines()
product={f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in tracked if (R/f).is_file()}
(P/'product-source-before.json').write_text(json.dumps(product,indent=2))
FILES=['sim/economy-sim.js','server/villages.js','server/zone.js','server/wood-walk-evidence.json','scripts/t1264-observe.js','scripts/server-baseline-check.js','scripts/t577-server-run.js']
source={f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in FILES};(P/'matrix-source.json').write_text(json.dumps(source,indent=2))
ARMS={'OFF':(0,0,0),'WOOD':(1,0,0),'TERR':(0,0,1),'V2_WOOD':(1,0,1)}
def run(name,flags,args):
 d=P/name;d.mkdir(exist_ok=True);env=dict(os.environ,**{k:str(v) for k,v in flags.items()},NODE_OPTIONS='-r '+str(R/'scripts/t1264-observe.js'))
 info={'name':name,'flags':flags,'argv':args,'source':source,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};(d/'input.json').write_text(json.dumps(info,indent=2));t=time.monotonic()
 with (d/'controller.log').open('w') as f:r=subprocess.run(['node','scripts/server-baseline-check.js',*args],cwd=R,env=env,stdout=f,stderr=subprocess.STDOUT)
 after={f:hashlib.sha256((R/f).read_bytes()).hexdigest() for f in FILES};z={'exit':r.returncode,'wallSeconds':time.monotonic()-t,'sourceUnchanged':after==source,'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())};(d/'status.json').write_text(json.dumps(z,indent=2));print(name,z,flush=True);return name,z
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as arm,concurrent.futures.ThreadPoolExecutor(max_workers=1) as gate:
 futures=[]
 for n,(w,c,t) in ARMS.items():
  flags={'T325_WOOD_ACT':w,'T1259_WOOD_CAP':c,'T1207_TERR_REAL':t,'T1238_TERR_V2':t}
  futures.append(arm.submit(run,n,flags,['--make',str(P/n/'baseline.json'),'--days','400','--seeds','1020,7,42','--vclock','--par','1']))
 futures.append(gate.submit(run,'OFF_GATE',{'T325_WOOD_ACT':0,'T1259_WOOD_CAP':0,'T1207_TERR_REAL':0,'T1238_TERR_V2':0},['계측/서버기준선_2026-11-11.json','--vclock','--plan','1020:400','--par','1']))
 results=dict(f.result() for f in concurrent.futures.as_completed(futures))
(P/'matrix-status.json').write_text(json.dumps(results,indent=2));raise SystemExit(any(z['exit'] or not z['sourceUnchanged'] for z in results.values()))
