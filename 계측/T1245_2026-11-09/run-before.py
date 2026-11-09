import subprocess,os,concurrent.futures,json
root='/tmp/t1245/base';out='/tmp/t1245/before'
def run(seed):
 env={**os.environ,'T1243_FARM_ON':'1','T17_JSON':f'{out}/{seed}.json','T176_JSON':f'{out}/{seed}.farm.json'}
 with open(f'{out}/{seed}.log','w') as f:r=subprocess.run(['node','scripts/t176-ab.js','800',str(seed)],cwd=root,env=env,stdout=f,stderr=subprocess.STDOUT)
 print(seed,r.returncode,flush=True);return seed,r.returncode
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as e:r=dict(e.map(run,[1020,7,42]))
open(out+'/status.json','w').write(json.dumps(r));raise SystemExit(any(r.values()))
