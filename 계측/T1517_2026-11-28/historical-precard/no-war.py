"""Wait for the isolated regional suite, then compare two real no-war zone runs."""
from pathlib import Path
import os,time,json,subprocess,signal,hashlib
root=Path('/workspace/Mini-WarSnap');out=Path('/workspace/scratch/war-snap-no-war-zone');out.mkdir(exist_ok=True)
signal.signal(signal.SIGTERM,lambda s,f:(_ for _ in ()).throw(SystemExit(128+s)))
status={'controller':os.getpid(),'waitingFor':'/workspace/scratch/war-snap-mature/done','started':time.time(),'runs':[]};(out/'status.json').write_text(json.dumps(status));rc=1
try:
 while not Path(status['waitingFor']).exists():time.sleep(30)
 for tag,flag in [('off','0'),('on','1')]:
  dest=out/tag;dest.mkdir(exist_ok=True)
  env=dict(os.environ,T1497_WAR_SNAP=flag,T1445_BOOT_BOUND='1',T577_BODY='1',T577_CAND_SEEDPOP='8',VILLAGE_DAY_MS='30000',T941_BATTLE_DAY='0',T627_TRIP_DAY='0',VILLAGE_NPC_CAP='Infinity',VILLAGE_CARAVAN_MAX='0',T745_VCLOCK='1',T400_BUILD_ACT='1',ENABLE_BANDITS='0',WAR_SNAP_ZONE_FIXTURE='0',WAR_SNAP_ZONE_OUT=str(dest/'observed'),NODE_OPTIONS='--require '+str(root/'scripts/war-snapshot-zone-hook.js'))
  files=['server/villages.js','server/war-live.js','server/war-snapshot.js','server/war-snapshot-host.js','sim/path-core.js','scripts/war-snapshot-zone-hook.js'];manifest={p:hashlib.sha256((root/p).read_bytes()).hexdigest() for p in files};(dest/'source-sha256.json').write_text(json.dumps(manifest))
  cmd=['node','scripts/t1308-long-run.js','10','1020','--every','10','--dir',str(dest/'run'),'--tag','no-war']
  t=time.time()
  with (dest/'controller.log').open('wb') as log:rc=subprocess.run(cmd,cwd=root,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=log).returncode
  status['runs'].append({'tag':tag,'rc':rc,'seconds':time.time()-t});(out/'status.json').write_text(json.dumps(status))
  if rc:break
finally:status.update(rc=rc,finished=time.time());(out/'status.json').write_text(json.dumps(status,indent=2));(out/'done').write_text(str(rc))
