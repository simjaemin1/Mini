import pathlib,subprocess,os,json,time,concurrent.futures,hashlib,sys
source=pathlib.Path(sys.argv[1]).resolve();out=pathlib.Path(sys.argv[2]).resolve();out.mkdir(parents=True,exist_ok=True);node='/workspace/.tools/node-v22.23.0-linux-x64/bin/node'
files=['sim/economy-sim.js','sim/economy-sim-v2.js','server/villages.js','server/kcal.js','server/granary-lots.js','scripts/t1230-observe.js'];sha={f:hashlib.sha256((source/f).read_bytes()).hexdigest() for f in files}
def run(c):
 mode,seed=c;tag=f'{mode}-{seed}';env=os.environ.copy();env.pop('NODE_OPTIONS',None);env.update(T1243_FARM_ON=mode,T17_JSON=str(out/(tag+'.world.json')),T176_JSON=str(out/(tag+'.lab.json')),T1230_OUT=str(out/(tag+'.observe.json')),NODE_OPTIONS='--require '+str(source/'scripts/t1230-observe.js'),LAB_SEEDCACHE=str(out/(tag+'.seedcache.json')),DB_PATH=str(out/(tag+'.db')))
 start=time.monotonic();print('START',tag,flush=True)
 with (out/(tag+'.log')).open('w') as f:p=subprocess.run([node,'scripts/t17-metrics.js','800',str(seed)],cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT)
 j=json.loads((out/(tag+'.world.json')).read_text()) if (out/(tag+'.world.json')).exists() else {};obs=json.loads((out/(tag+'.observe.json')).read_text()) if (out/(tag+'.observe.json')).exists() else {};last=obs.get('rows',[[]])[-1];same=sha=={f:hashlib.sha256((source/f).read_bytes()).hexdigest() for f in files}
 r={'mode':mode,'seed':seed,'rc':p.returncode,'seconds':time.monotonic()-start,'worldDays':j.get('days'),'observerLastDay':last[0] if last else None,'observerError':obs.get('err'),'sourceUnchanged':same,'sourceSHA256':sha};(out/(tag+'.status.json')).write_text(json.dumps(r,indent=2)+'\n');print('DONE',tag,json.dumps(r),flush=True);return r
cases=[('1',s) for s in [1020,7,42]]+[('0',s) for s in [1020,7,42]]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:r=list(pool.map(run,cases))
(out/'suite.json').write_text(json.dumps({'source':str(source),'runs':r,'complete':all(x['rc']==0 and x['worldDays']==800 and x['sourceUnchanged'] and not x['observerError'] for x in r)},indent=2)+'\n')
