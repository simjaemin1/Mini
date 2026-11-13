"""Bounded T1274 job supervisor, independent of a terminal connection."""
from pathlib import Path
import os,sys,time,json,subprocess,signal,fcntl
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1274-run').resolve()
P.mkdir(parents=True,exist_ok=True)
lock=(P/'supervisor.lock').open('w')
fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
if (P/'source.json').exists():raise RuntimeError('Existing measurement directory; preserve it and choose a fresh run directory.')
with (P/'pipeline.log').open('w') as mainlog,(P/'fast-current-controller.log').open('w') as fastlog:
 main=subprocess.Popen([sys.executable,str(R/'scripts/t1274-run.py'),str(P)],cwd=R,stdin=subprocess.DEVNULL,stdout=mainlog,stderr=subprocess.STDOUT)
 fast=subprocess.Popen([sys.executable,str(R/'scripts/t1274-fast-current.py'),str(P)],cwd=R,stdin=subprocess.DEVNULL,stdout=fastlog,stderr=subprocess.STDOUT)
 info={'supervisorPID':os.getpid(),'processGroup':os.getpgrp(),'sessionID':os.getsid(0),'mainPID':main.pid,'fastControlPID':fast.pid,
       'directory':str(P),'startedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 (P/'processes.json').write_text(json.dumps(info,indent=2))
 code=main.wait()
 if code:
  (P/'supervisor-complete.json').write_text(json.dumps({'mainExit':code,'state':'failed; stopped remaining own process group'},indent=2))
  os.killpg(os.getpgrp(),signal.SIGTERM)
  raise SystemExit(code)
 fastcode=fast.wait()
 result={'mainExit':code,'fastControlExit':fastcode,'state':'complete' if not fastcode else 'failed',
         'finishedUTC':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 (P/'supervisor-complete.json').write_text(json.dumps(result,indent=2));print(result,flush=True)
 raise SystemExit(fastcode)
