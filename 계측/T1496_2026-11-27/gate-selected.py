import subprocess,json,time,os
from pathlib import Path
repo=Path('/workspace/Mini-t1496');out=repo/'계측/T1496_2026-11-27/gates';out.mkdir(exist_ok=True)
plan=json.loads((out.parent/'touched-plan.json').read_text());rows=[]
for name in plan['list']:
 start=time.monotonic()
 with (out/(name+'.txt')).open('wb') as log:
  r=subprocess.run(['node','scripts/'+name],cwd=repo,stdout=log,stderr=subprocess.STDOUT)
 rows.append(dict(name=name,exit=r.returncode,seconds=round(time.monotonic()-start,3)))
 (out/'status.json').write_text(json.dumps(rows,indent=1))
 print(name,r.returncode,flush=True)
(out/'done.json').write_text(json.dumps(dict(passed=sum(r['exit']==0 for r in rows),failed=sum(r['exit']!=0 for r in rows))))
