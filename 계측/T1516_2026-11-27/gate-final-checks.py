import json,subprocess,time
from pathlib import Path
repo=Path('/workspace/Mini-t1516');out=repo/'계측/T1516_2026-11-27/gates'
rows=json.loads((out/'status.json').read_text());names=json.loads((out.parent/'touched-plan-final.json').read_text())['list']
todo=[n for n in names if n not in {r['name'] for r in rows}]+['test-t1516-body-first.js','test-harness-lint.js','test-ci-list.js']
for name in todo:
 start=time.monotonic()
 with (out/(name+'.txt')).open('wb') as f:r=subprocess.run(['node','scripts/'+name],cwd=repo,stdout=f,stderr=subprocess.STDOUT)
 record=dict(name=name,exit=r.returncode,seconds=round(time.monotonic()-start,3),final=True)
 if name in names:
  rows=[x for x in rows if x['name']!=name]+[record]
  (out/'status.json').write_text(json.dumps(rows,indent=1))
 else:(out/'ci-list-result.json').write_text(json.dumps(record))
 print(name,r.returncode,flush=True)
assert set(names)=={r['name'] for r in rows}
additional=json.loads((out/'additional-status.json').read_text())
(out/'done.json').write_text(json.dumps(dict(passed=sum(r['exit']==0 for r in rows),failed=sum(r['exit']!=0 for r in rows),additionalPassed=sum(r['exit']==0 for r in additional),additionalFailed=sum(r['exit']!=0 for r in additional))))
