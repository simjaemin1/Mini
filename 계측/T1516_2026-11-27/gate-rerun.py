import json,subprocess,time,shutil
from pathlib import Path
repo=Path('/workspace/Mini-t1516');out=repo/'계측/T1516_2026-11-27/gates'
rows=json.loads((out/'status.json').read_text());history=out/'history-initial';history.mkdir(exist_ok=True)
shutil.copyfile(out/'status.json',history/'status.json')
failed=[r['name'] for r in rows if r['exit']]
for n in failed:shutil.copyfile(out/(n+'.txt'),history/(n+'.txt'))
extra=['test-t1135-fuel-eq.js','test-t1148-fuel-job.js','test-t1202-produce-live.js','test-t1259-wood-cap.js','test-t1046-wood-share.js','test-wood-flow.js','test-ci-list.js']
names=list(dict.fromkeys(failed+['test-t1516-body-first.js','test-wood-act.js']+extra));additional=[]
for name in names:
 start=time.monotonic()
 with (out/(name+'.txt')).open('wb') as f:r=subprocess.run(['node','scripts/'+name],cwd=repo,stdout=f,stderr=subprocess.STDOUT)
 record=dict(name=name,exit=r.returncode,seconds=round(time.monotonic()-start,3),rerun=True)
 index=next((i for i,x in enumerate(rows) if x['name']==name),None)
 if index is None:additional.append(record)
 else:rows[index]=record
 (out/'status.json').write_text(json.dumps(rows,indent=1));(out/'additional-status.json').write_text(json.dumps(additional,indent=1))
 print(name,r.returncode,flush=True)
(out/'done.json').write_text(json.dumps(dict(passed=sum(r['exit']==0 for r in rows),failed=sum(r['exit']!=0 for r in rows),additionalPassed=sum(r['exit']==0 for r in additional),additionalFailed=sum(r['exit']!=0 for r in additional))))
