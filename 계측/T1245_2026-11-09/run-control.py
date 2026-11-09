import subprocess,os,concurrent.futures,json,hashlib
from pathlib import Path
root='/workspace/Mini';out='/tmp/t1245/control'
source={p:hashlib.sha256(Path(root,p).read_bytes()).hexdigest() for p in ['server/crops.js','server/villages.js','server/zone.js','scripts/t176-ab.js','scripts/t176-ab.js']}
Path(out,'source.json').write_text(json.dumps(source,indent=2))
def run(seed):
 env={**os.environ,'T1243_FARM_ON':'0','T17_JSON':f'{out}/{seed}.json','T176_JSON':f'{out}/{seed}.farm.json'}
 with open(f'{out}/{seed}.log','w') as f:r=subprocess.run(['node','scripts/t176-ab.js','800',str(seed)],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
 print(seed,r.returncode,flush=True);return seed,r.returncode
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:r=dict(e.map(run,[1020,7,42]))
Path(out,'status.json').write_text(json.dumps(r));raise SystemExit(any(r.values()))
