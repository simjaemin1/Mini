"""Seven fresh T1302 body worlds, at most two live simulations, immutable sources.
Launch with setsid (or Popen(start_new_session=True)); never reuse an output folder.
"""
from pathlib import Path
import os,sys,json,subprocess,time,hashlib,concurrent.futures,fcntl,signal,traceback,re
R=Path(__file__).resolve().parents[1]
OLD=Path('/tmp/t1302-t1274-original')
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1302-r1').resolve()
if os.getsid(0)!=os.getpid() or os.getpgrp()!=os.getpid():
 raise RuntimeError('Launch in a dedicated POSIX session: setsid python3 scripts/t1302-run.py NEWDIR')
P.mkdir(parents=True,exist_ok=True)
lock=(P/'supervisor.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
if (P/'source.json').exists():raise RuntimeError('Existing run: preserve it and choose another directory')
HOOKS=['scripts/t745-vclock.js','scripts/t1274-baseline-hook.js','scripts/t1302-observe.js',
 'scripts/t1243-observe.js','scripts/t1221-observe.js','scripts/t1230-observe.js','scripts/t1251-observe.js','scripts/t1274-observe.js']
def source(root):
 files=subprocess.check_output(['git','ls-files','server','sim','public'],cwd=root,text=True).splitlines()+HOOKS
 if root==R:files+=['server/terr-body.js','scripts/t1302-run.py']
 return {f:hashlib.sha256((root/f).read_bytes()).hexdigest() for f in sorted(set(files)) if (root/f).is_file()}
frozen={'current':source(R),'original':source(OLD)}
(P/'source.json').write_text(json.dumps({'currentHead':subprocess.check_output(['git','rev-parse','HEAD'],cwd=R,text=True).strip(),
 'base':'3dae4c5f','originalHead':'a6b7aba5','sha256':frozen},indent=2))
(P/'environment.json').write_text(json.dumps({'node':subprocess.check_output(['node','--version'],text=True).strip(),
 'python':sys.version,'cpusVisible':os.cpu_count(),'cpuQuota':Path('/sys/fs/cgroup/cpu.max').read_text().strip(),
 'inheritedExperiments':{k:v for k,v in os.environ.items() if re.match(r'^(T[0-9]+_|VILLAGE_)',k)}},indent=2))
(P/'source.patch').write_bytes(subprocess.check_output(['git','diff','--binary','3dae4c5f'],cwd=R))
(P/'processes.json').write_text(json.dumps({'pid':os.getpid(),'pgid':os.getpgrp(),'sid':os.getsid(0),
 'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
def run(name,seed,wood,terr,fixed,original=False):
 root=OLD if original else R;key='original' if original else 'current'
 assert source(root)==frozen[key],name+' source changed before start'
 d=P/name;d.mkdir()
 flags={'VILLAGE_DAY_MS':'1440000','VILLAGE_NPC_CAP':'Infinity','T400_BUILD_ACT':'0','VILLAGE_CARAVAN_MAX':'0',
 'T745_VCLOCK':'1','T1244_BODY_MS':'10000','T1221_EVERY':'10','T577_PAR':'1','T577_TAG':'run','T577_DIR':str(d/'server'),
 'T325_WOOD_ACT':str(wood),'T1259_WOOD_CAP':'0','T1207_TERR_REAL':str(terr),'T1238_TERR_V2':str(terr),
 'T1243_FARM_ON':'0','T1302_TERR_BODY':str(fixed)}
 env=dict(os.environ,**flags);env['NODE_OPTIONS']=' '.join('-r '+str(root/f) for f in HOOKS)
 args=['node','scripts/t577-server-run.js','100',str(seed)]
 (d/'input.json').write_text(json.dumps({'root':str(root),'seed':seed,'flags':flags,'argv':args,'NODE_OPTIONS':env['NODE_OPTIONS'],
 'original':original,'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
 start=time.monotonic()
 with (d/'controller.log').open('w') as log:
  child=subprocess.Popen(args,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
  (d/'pid.json').write_text(json.dumps({'runner':child.pid}))
  code=child.wait()
 ok=source(root)==frozen[key]
 status={'exit':code,'sourceUnchanged':ok,'wallSeconds':time.monotonic()-start,
 'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 (d/'status.json').write_text(json.dumps(status,indent=2));print(name,status,flush=True)
 assert code==0 and ok,(name,status)
 native=json.loads((d/f'server/run-{seed}.json').read_text())
 assert [r[0] for r in native['rows']]==list(range(1,101)),name+' incomplete native run'
 return status
cases=[('BODY_1020',1020,1,1,1),('T1274_REPLAY_1020',1020,1,1,0,True),
 ('OFF_1020',1020,0,0,0),('COMBO_1020',1020,1,1,0),
 ('OFF_7',7,0,0,0),('COMBO_7',7,1,1,0),('BODY_7',7,1,1,1)]
try:
 results={}
 pool=concurrent.futures.ThreadPoolExecutor(max_workers=2)
 try:
  jobs={pool.submit(run,*case):case[0] for case in cases}
  for job in concurrent.futures.as_completed(jobs):results[jobs[job]]=job.result()
 except BaseException:
  pool.shutdown(wait=False,cancel_futures=True)
  raise
 else:pool.shutdown(wait=True)
 # The exact immutable product used for the long runs also passes the official off gate.
 d=P/'GATE_1020';d.mkdir()
 env=dict(os.environ,T1302_TERR_BODY='0',T1207_TERR_REAL='0',T1238_TERR_V2='0',T325_WOOD_ACT='0',T1259_WOOD_CAP='0',T1243_FARM_ON='0')
 env['NODE_OPTIONS']='-r '+str(R/'scripts/t1274-baseline-hook.js')
 args=['node','scripts/server-baseline-check.js','계측/서버기준선_2026-11-11.json','--vclock','--plan','1020:400','--par','1']
 (d/'input.json').write_text(json.dumps({'seed':1020,'kind':'gate','argv':args,'flags':{k:env[k] for k in ['T1302_TERR_BODY','T1207_TERR_REAL','T1238_TERR_V2','T325_WOOD_ACT']}}))
 start=time.monotonic()
 with (d/'controller.log').open('w') as log:r=subprocess.run(args,cwd=R,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT)
 ok=source(R)==frozen['current'];status={'exit':r.returncode,'sourceUnchanged':ok,'wallSeconds':time.monotonic()-start}
 (d/'status.json').write_text(json.dumps(status));assert r.returncode==0 and ok,status
 assert '=== 같음 1/1' in (d/'controller.log').read_text()
 results['GATE_1020']=status
 (P/'complete.json').write_text(json.dumps({'state':'complete','results':results,
 'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())},indent=2))
except BaseException:
 (P/'failure.json').write_text(json.dumps({'state':'failed','error':traceback.format_exc()},indent=2))
 os.killpg(os.getpgrp(),signal.SIGTERM)
 raise
