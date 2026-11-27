import os,json,subprocess,time,hashlib
from pathlib import Path
repo=Path('/workspace/Mini-t1496');out=repo/'계측/T1496_2026-11-27';temp=Path('/tmp/t1496')
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
expected=sha(repo/'server/villages.js')
while not (out/'gates/done.json').exists():time.sleep(5)
baseEnv={k:v for k,v in os.environ.items() if k not in ('NODE_OPTIONS','T1496_BODY_FIRST','T325_WOOD_ACT')}
common=['node','scripts/server-baseline-check.js']
fast=['--days','30','--seeds','1020','--par','1','--vclock']
body=['--days','3','--seeds','1020','--par','1','--vclock','--body-day','--bodies']
phases=[('wood-off-base',common+['--make',str(out/'wood-off-base.json')]+fast,{'T325_WOOD_ACT':'1','T1496_BODY_FIRST':'0','NODE_OPTIONS':'--require /tmp/t1496/base-hook.cjs'}),
 ('wood-off-compare',common+[str(out/'wood-off-base.json')]+fast,{'T325_WOOD_ACT':'1','T1496_BODY_FIRST':'0'}),
 ('body-on-plain',common+['--make',str(out/'body-on-plain.json')]+body,{'T325_WOOD_ACT':'1','T1496_BODY_FIRST':'1'}),
 ('body-on-observed',common+[str(out/'body-on-plain.json')]+body,{'T325_WOOD_ACT':'1','T1496_BODY_FIRST':'1','NODE_OPTIONS':'--require /tmp/t1496/observe.cjs','T1496_OBS_OUT':str(out/'body-on-observed.json')})]
records=[]
for name,cmd,extra in phases:
 assert sha(repo/'server/villages.js')==expected,'candidate changed during measured worlds'
 record=dict(name=name,command=cmd,env=extra,sourceSha256=expected,baseSourceSha256=sha(Path('/tmp/t1496-base-villages.js')),state='running')
 records.append(record);(out/'world-status.json').write_text(json.dumps(records,indent=1))
 start=time.monotonic()
 with (out/(name+'.txt')).open('wb') as f:r=subprocess.run(cmd,cwd=repo,env={**baseEnv,**extra},stdout=f,stderr=subprocess.STDOUT)
 record.update(state='finished',exit=r.returncode,seconds=round(time.monotonic()-start,3))
 (out/'world-status.json').write_text(json.dumps(records,indent=1))
 assert r.returncode==0,(name,r.returncode)
 assert sha(repo/'server/villages.js')==expected
(out/'world-done.json').write_text(json.dumps(dict(passed=len(records),worlds=len(records),sameSource=True)))
