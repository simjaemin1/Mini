"""Prepare validated results when the independent worlds finish; never publishes."""
from pathlib import Path
import sys,time,subprocess,json,fcntl,traceback
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1302-r2')
lock=(P/'finalize.lock').open('w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
(P/'finalizer-pid.json').write_text(json.dumps({'pid':__import__('os').getpid()}))
try:
 while not (P/'complete.json').exists():
  if any((P/f).exists() for f in ['failure.json','interrupted.json']):
   raise RuntimeError('Measurement did not finish; no report generated')
  time.sleep(30)
 with (P/'finalize.log').open('w') as log:
  subprocess.run([sys.executable,str(R/'scripts/t1302-collect.py'),str(P)],cwd=R,stdout=log,stderr=subprocess.STDOUT,check=True)
  subprocess.run([sys.executable,str(R/'scripts/t1302-report.py')],cwd=R,stdout=log,stderr=subprocess.STDOUT,check=True)
  subprocess.run([sys.executable,str(R/'scripts/t1302-artifacts.py')],cwd=R,stdout=log,stderr=subprocess.STDOUT,check=True)
 (P/'finalized.json').write_text(json.dumps({'state':'validated report ready; not committed or pushed'}))
except BaseException:
 (P/'finalize-failed.json').write_text(json.dumps({'error':traceback.format_exc()}))
 raise
