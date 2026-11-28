"""Own a detached native zone run and always publish return code/done."""
import hashlib,json,os,signal,subprocess,time
from pathlib import Path
root=Path(os.environ.get('T1517_SOURCE_ROOT','/workspace/Mini-WarSnap'))
out=Path(os.environ.get('WAR_SNAP_RUN_DIR','/workspace/scratch/t1517-zone-smoke'))
out.mkdir(parents=True,exist_ok=True)
files=['scripts/war-snapshot-zone-hook.js','scripts/t1308-long-run.js','server/villages.js','server/war-live.js','server/war-snapshot.js','server/war-snapshot-host.js','sim/path-core.js','server/home-population.js','server/granary-lots.js','server/lots.js']
signal.signal(signal.SIGTERM, lambda signum, frame: (_ for _ in ()).throw(SystemExit(128 + signum)))
signal.signal(signal.SIGHUP, lambda signum, frame: (_ for _ in ()).throw(SystemExit(128 + signum)))
manifest={}
for name in files:
 data=(root/name).read_bytes();dest=out/'source'/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data);manifest[name]=hashlib.sha256(data).hexdigest()
(out/'source-sha256.json').write_text(json.dumps(manifest,indent=2))
env=dict(os.environ,T1517_WAR_SNAP='1',T1445_BOOT_BOUND='1',T577_BODY='1',T577_CAND_SEEDPOP='24',VILLAGE_DAY_MS='30000',T941_BATTLE_DAY='0',T627_TRIP_DAY='0',VILLAGE_NPC_CAP=os.environ.get('WAR_SNAP_CAP','Infinity'),VILLAGE_CARAVAN_MAX='0',T745_VCLOCK='1',T400_BUILD_ACT='1',ENABLE_BANDITS='0',WAR_SNAP_ZONE_FIXTURE='1',WAR_SNAP_ZONE_OUT=str(out/'observed'),NODE_OPTIONS='--require '+str(root/'scripts/war-snapshot-zone-hook.js'))
cmd=['node','scripts/t1308-long-run.js','4','42'] + (['--every','4'] if os.environ.get('WAR_SNAP_CONTINUOUS')=='1' else ['--cuts','2']) + ['--dir',str(out/'run'),'--tag','t1517-war-snapshot']
if os.environ.get('WAR_SNAP_RESUME_DIR'): cmd=['node','scripts/t1308-long-run.js','--resume',os.environ['WAR_SNAP_RESUME_DIR']]
status={'controller':os.getpid(),'started':time.time(),'cmd':cmd,'flags':{k:v for k,v in env.items() if k.startswith(('T1517_','T1445_','T577_','VILLAGE_','WAR_SNAP_','T941_','T627_','T745_','T400_','ENABLE_BANDITS'))}}
(out/'controller.json').write_text(json.dumps(status,indent=2));rc=1
try:
 with (out/'controller.log').open('wb') as log:
  rc=subprocess.run(cmd,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log).returncode
finally:
 status.update(rc=rc,finished=time.time());(out/'controller.json').write_text(json.dumps(status,indent=2));(out/'rc').write_text(str(rc));(out/'done').write_text(str(time.time()))
