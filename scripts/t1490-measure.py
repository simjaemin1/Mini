#!/usr/bin/env python3
# Runner 밖 계측 orchestration: 기존 하네스/observer 그대로, 고정 포트는 직렬 lease.
import os, sys, subprocess, json, time, pathlib
ROOT=pathlib.Path(__file__).resolve().parent.parent
RAW=pathlib.Path(os.environ.get('T1490_RAW','/var/tmp/t1490'))
(RAW/'raw').mkdir(parents=True,exist_ok=True); (RAW/'done').mkdir(exist_ok=True)
plan=[]
for k in range(1,41):
 for arm in ['off','on']: plan.append(('mem',arm,k))
for k in range(1,31):
 for arm in ['off','on']: plan.append(('re',arm,k))
for k in range(1,21): plan.append(('walk','on',k))
try:
 for kind,arm,k in plan:
  tag=f'{kind}-{arm}-{k:02d}'
  done=RAW/'done'/f'{tag}.done'
  if done.exists(): continue
  env=os.environ.copy(); env.update(T1490_NEAR_NOW='1' if arm=='on' else '0',TIDE_FREEZE_MS='372603',LAB_SEED='1020',T1485_LOG=str(RAW/'raw'/f'{tag}.obs.jsonl'),NODE_OPTIONS=f'--require {ROOT}/scripts/t1490-observer.js')
  if kind=='re': env['T1485_RECONN']='2'
  script='scripts/e2e-membership.js' if kind=='mem' else 'scripts/t1485-walkbot.js'
  t=time.time(); rc=None
  try:
   with open(RAW/'raw'/f'{tag}.log','w') as f:
    proc=subprocess.Popen(['node',script],cwd=ROOT,env=env,stdout=f,stderr=subprocess.STDOUT,start_new_session=True)
    (RAW/'active.json').write_text(json.dumps({'tag':tag,'pid':proc.pid,'started':t}))
    try: rc=proc.wait(timeout=2400)
    except subprocess.TimeoutExpired:
     import signal
     os.killpg(proc.pid,signal.SIGKILL); proc.wait(); rc=124
   if kind!='mem' and pathlib.Path('/tmp/t1485-walk.json').exists():
    target=RAW/'raw'/f'{tag}.walk.json'; target.write_bytes(pathlib.Path('/tmp/t1485-walk.json').read_bytes()); pathlib.Path('/tmp/t1485-walk.json').unlink()
  except BaseException as e: rc=str(e)
  finally: done.write_text(json.dumps({'rc':rc,'seconds':round(time.time()-t,3)}))
  print(tag,rc,flush=True)
finally:
 (RAW/'ALL.done').write_text(json.dumps({'completed':len(list((RAW/'done').glob('*.done'))),'planned':len(plan)}))
