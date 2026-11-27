import subprocess,json,time,hashlib,os
from pathlib import Path
repo=Path('/workspace/Mini-t1516');out=repo/'계측/T1516_2026-11-27';sha=lambda:hashlib.sha256((repo/'server/villages.js').read_bytes()).hexdigest()
expected='693e98ab4a9f5f8fbdb64e81d403721169a3f4d459f7a520faf08c5d078dcaa1'
assert sha()==expected
cmd=['node','scripts/server-baseline-check.js','계측/서버기준선_2026-11-18.json','--plan','1020:400','--par','1','--vclock','--side']
env={**os.environ,'T1516_BODY_FIRST':'0'}
start=time.monotonic()
with (out/'off-baseline.txt').open('wb') as f:r=subprocess.run(cmd,cwd=repo,env=env,stdout=f,stderr=subprocess.STDOUT)
result=dict(command=cmd,env={'T1516_BODY_FIRST':'0'},sourceSha256=expected,sourceUnchanged=sha()==expected,exit=r.returncode,seconds=round(time.monotonic()-start,3))
(out/'off-baseline-result.json').write_text(json.dumps(result,indent=1))
assert r.returncode==0 and result['sourceUnchanged'],result
