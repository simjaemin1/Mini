"""Official T1264 gate without the observation preload; preserve all 400 side days."""
from pathlib import Path
import os, sys, json, time, hashlib, subprocess
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1264-replay').resolve()
# Start when the clock replay ends, or two main arms have released their slots.
while not ((P/'clock-status.json').exists() or
           ((P/'OFF/status.json').exists() and (P/'TERR/status.json').exists())):
 time.sleep(10)
d=P/'OFF_GATE_FULL';d.mkdir(parents=True,exist_ok=True)
flags={k:'0' for k in ['T325_WOOD_ACT','T1259_WOOD_CAP','T1207_TERR_REAL','T1238_TERR_V2']}
env=dict(os.environ,**flags);env.pop('NODE_OPTIONS',None)
source=json.loads((P/'matrix-source.json').read_text())
assert all(hashlib.sha256((R/f).read_bytes()).hexdigest()==h for f,h in source.items())
args=['node','scripts/server-baseline-check.js','계측/서버기준선_2026-11-11.json','--vclock','--plan','1020:400','--par','1']
(d/'input.json').write_text(json.dumps({'argv':args,'flags':flags,'NODE_OPTIONS':None,'source':source,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
t=time.monotonic()
with (d/'controller.log').open('w') as f:
 r=subprocess.run(args,cwd=R,env=env,stdout=f,stderr=subprocess.STDOUT)
unchanged=all(hashlib.sha256((R/f).read_bytes()).hexdigest()==h for f,h in source.items())
status={'exit':r.returncode,'wallSeconds':time.monotonic()-t,'sourceUnchanged':unchanged,'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
(d/'status.json').write_text(json.dumps(status,indent=2));print(status,flush=True)
raise SystemExit(r.returncode or int(not unchanged))
