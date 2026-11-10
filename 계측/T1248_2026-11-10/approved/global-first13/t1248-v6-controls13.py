import os,subprocess,pathlib,json,time,concurrent.futures,signal,hashlib
src=pathlib.Path('/tmp/t1248-final-v6');out=pathlib.Path('/tmp/t1248-v6-firstdiff13');out.mkdir(exist_ok=True);node='/workspace/.tools/node-v22.23.0-linux-x64/bin/node'
cases=[('workoff13',13,{'T1241_DES':'1','T1243_FARM_ON':'1','T1241_DES_WORK':'0'}),('queueoff13',13,{'T1241_DES':'1','T1243_FARM_ON':'1','T1241_DES_QUEUES':'0'})]
def run(c):
 tag,days,extra=c;dest=out/tag;dest.mkdir(exist_ok=True);env=os.environ.copy();env.pop('NODE_OPTIONS',None)
 env.update(extra);env.update(T745_VCLOCK='1',T1241_PROBE='1',VILLAGE_DAY_MS='1440000',VILLAGE_NPC_CAP='Infinity',T577_DIR=str(dest),T577_TAG=tag,T577_PAR='1',T699_ROUTE_CACHE='/tmp/durango-route-cache',T1241_OUT=str(dest/'legacy'),T1248_CHILD_STATUS=str(dest/'child.json'),T1248_DUMP_DAY='13')
 env['NODE_OPTIONS']='--require '+str(src/'scripts/t1248-child-status.js')+' --require '+str(src/'scripts/t1248-observe.js')+' --require '+str(src/'scripts/t745-vclock.js')
 args=[node,'scripts/t577-server-run.js',str(days),'1020']
 if tag=='offgate':
  env.pop('VILLAGE_NPC_CAP');env.pop('T1241_PROBE');env.pop('NODE_OPTIONS');env.pop('VILLAGE_DAY_MS');env.pop('T745_VCLOCK');args=[node,'scripts/server-baseline-check.js','계측/서버기준선_2026-11-08c.json','--vclock','--plan','1020:400']
 start=time.monotonic();print('START',tag,flush=True)
 timedOut=False
 with (dest/'driver.log').open('w') as f:
  proc=subprocess.Popen(args,cwd=src,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
  try:proc.wait(timeout=None)
  except subprocess.TimeoutExpired:
   timedOut=True;os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=30)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
 class R:pass
 r=R();r.returncode=proc.returncode
 status={'tag':tag,'source':str(src),'args':args,'env':{k:env[k] for k in sorted(env) if k.startswith(('T124','T745','VILLAGE_'))},'budgetExpired':timedOut,'sourceSHA256':{f:hashlib.sha256((src/f).read_bytes()).hexdigest() for f in ['server/zone.js','server/villages.js','server/des.js','scripts/t1248-observe.js']},'rc':r.returncode,'seconds':time.monotonic()-start};(dest/'status.json').write_text(json.dumps(status,indent=2)+'\n');print('DONE',tag,json.dumps(status),flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:list(p.map(run,cases))
