"""Run the known 870-day profile from an immutable checkout; retain checkpoint bytes."""
from pathlib import Path
import os,sys,signal,time,json,hashlib,subprocess,shutil
root=Path(os.environ['WAR_SNAP_IMMUTABLE_ROOT']).resolve();out=Path('/workspace/scratch/war-snap-mature');out.mkdir(exist_ok=True)
status={'controller':os.getpid(),'started':time.time(),'root':str(root),'runs':[]};rc=1
signal.signal(signal.SIGTERM,lambda s,f:(_ for _ in ()).throw(SystemExit(128+s)))
signal.signal(signal.SIGHUP,lambda s,f:(_ for _ in ()).throw(SystemExit(128+s)))
try:
 commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip();status['commit']=commit
 names=['server/villages.js','server/war-snapshot-host.js','server/war-snapshot.js','server/war-live.js','sim/path-core.js','server/home-population.js','server/granary-lots.js','server/lots.js','scripts/war-snapshot-mature-hook.js','scripts/t1308-long-run.js']
 manifest={}
 for name in names:
  data=(root/name).read_bytes();target=out/'source'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);manifest[name]=hashlib.sha256(data).hexdigest()
 (out/'source-sha256.json').write_text(json.dumps(manifest,indent=2))
 env=dict(os.environ)
 for key in ['T577_BODY','T577_CAND_SEEDPOP','VILLAGE_NPC_CAP','VILLAGE_DAY_MS','T941_BATTLE_DAY','T627_TRIP_DAY','T315_MAPBEDS','ENABLE_BANDITS','T1381_WALK_HEAP','WAR_SNAP_ZONE_OUT','WAR_SNAP_ZONE_FIXTURE','WAR_SNAP_ZONE_DONATE']:env.pop(key,None)
 env.update(T1497_WAR_SNAP='1',T1445_BOOT_BOUND='1',T400_BUILD_ACT='0',VILLAGE_CARAVAN_MAX='0',T745_VCLOCK='1',VILLAGE_WAR_LOG='1',WAR_SNAP_MATURE_OUT=str(out/'observed'),WAR_SNAP_MATURE_FROM='866',WAR_SNAP_MATURE_TO='872',NODE_OPTIONS='--max-old-space-size=6144 --require '+str(root/'scripts/war-snapshot-mature-hook.js'))
 status['flags']={k:v for k,v in env.items() if k.startswith(('T1497_','T1445_','T400_','T745_','VILLAGE_','WAR_SNAP_MATURE_'))}
 cmd=['node','scripts/t1308-long-run.js','872','42','--cuts','870','--dir',str(out/'run'),'--tag','new-war-snapshot-870'];status['cmd']=cmd;(out/'controller.json').write_text(json.dumps(status,indent=2))
 with (out/'controller.log').open('wb') as log:rc=subprocess.run(cmd,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log).returncode
 ck=out/'run'/'ck'
 if (ck/'day').exists() and (ck/'day').read_text().strip()=='870':
  files=[ck/n for n in ['w.db','w.db-wal','w.db-shm'] if (ck/n).exists()];hashes={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
  shutil.copytree(ck,out/'retained-870');assert all(hashlib.sha256((ck/n).read_bytes()).hexdigest()==h for n,h in hashes.items());(out/'checkpoint-sha256.json').write_text(json.dumps(hashes,indent=2))
 status['sourceUnchanged']=all(hashlib.sha256((root/n).read_bytes()).hexdigest()==h for n,h in manifest.items())
finally:
 status.update(rc=rc,finished=time.time());(out/'controller.json').write_text(json.dumps(status,indent=2));(out/'rc').write_text(str(rc));(out/'done').write_text(str(time.time()))
