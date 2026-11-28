import os,json,subprocess,time,hashlib
from pathlib import Path
repo=Path('/workspace/Mini-t1516');out=repo/'계측/T1516_2026-11-27'
expected='693e98ab4a9f5f8fbdb64e81d403721169a3f4d459f7a520faf08c5d078dcaa1'
sha=lambda:hashlib.sha256((repo/'server/villages.js').read_bytes()).hexdigest()
env={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','T1516_BODY_FIRST','T325_WOOD_ACT')};env.update(T1516_BODY_FIRST='1',T325_WOOD_ACT='1')
base=['node','scripts/server-baseline-check.js'];args=['--days','30','--seeds','1020','--par','1','--vclock','--body-day','--bodies','all'];rows=[]
for name,cmd,extra in [('body-on-30-plain',base+['--make',str(out/'body-on-30-plain.json')]+args,{}),('body-on-30-observed',base+[str(out/'body-on-30-plain.json')]+args,{'NODE_OPTIONS':'--require /tmp/t1516/observe.cjs','T1516_OBS_OUT':str(out/'body-on-30-observed.json')})]:
 assert sha()==expected
 record=dict(name=name,command=cmd,env={**{'T1516_BODY_FIRST':'1','T325_WOOD_ACT':'1'},**extra},sourceSha256=expected,state='running');rows.append(record);(out/'body30-status.json').write_text(json.dumps(rows,indent=1))
 start=time.monotonic()
 with (out/(name+'.txt')).open('wb') as f:r=subprocess.run(cmd,cwd=repo,env={**env,**extra},stdout=f,stderr=subprocess.STDOUT)
 record.update(state='finished',exit=r.returncode,seconds=round(time.monotonic()-start,3));(out/'body30-status.json').write_text(json.dumps(rows,indent=1))
 assert r.returncode==0 and sha()==expected
(out/'body30-done.json').write_text(json.dumps(dict(passed=2,sameSource=True)))
