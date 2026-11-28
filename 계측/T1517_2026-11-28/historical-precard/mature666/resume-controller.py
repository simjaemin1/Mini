from pathlib import Path
import os,json,time,hashlib,shutil,subprocess,signal
out=Path('/workspace/scratch/war-snap-mature-resume666');root=Path('/workspace/Mini-WarSnap-Resume666');src=Path('/workspace/scratch/war-snap-mature-early/preserved666');status={'pid':os.getpid(),'started':time.time(),'sourceCommit':'7ccaa48e','sourceSnapshotCommit':'703ad08a','from':666,'to':667};rc=1
signal.signal(signal.SIGTERM,lambda s,f:(_ for _ in ()).throw(SystemExit(128+s)))
try:
 shutil.copytree(src,out/'run')
 names=['server/villages.js','server/war-snapshot-host.js','server/war-snapshot.js','server/war-live.js','sim/path-core.js','scripts/war-snapshot-mature-hook.js','scripts/t577-server-run.js','scripts/t577-server-hook.js'];manifest={}
 for n in names:
  data=(root/n).read_bytes();p=out/'source'/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data);manifest[n]=hashlib.sha256(data).hexdigest()
 manifest['runner.js']=hashlib.sha256((out/'runner.js').read_bytes()).hexdigest();manifest['controller.py']=hashlib.sha256(Path(__file__).read_bytes()).hexdigest();(out/'source-sha256.json').write_text(json.dumps(manifest,indent=2))
 env=dict(os.environ,T1497_WAR_SNAP='1',T1445_BOOT_BOUND='1',T400_BUILD_ACT='0',VILLAGE_CARAVAN_MAX='0',T745_VCLOCK='1',VILLAGE_WAR_LOG='1',WAR_SNAP_MATURE_OUT=str(out/'observed'),WAR_SNAP_MATURE_FROM='666',WAR_SNAP_MATURE_TO='667')
 with (out/'controller.log').open('wb') as log:rc=subprocess.run(['node',str(out/'runner.js')],cwd=root,env=env,stdout=log,stderr=log).returncode
 status['sourceUnchanged']=all(hashlib.sha256((root/n).read_bytes()).hexdigest()==h for n,h in manifest.items() if n not in ['runner.js','controller.py'])
finally:
 status.update(rc=rc,finished=time.time());(out/'status.json').write_text(json.dumps(status,indent=2));(out/'done').write_text(str(rc))
