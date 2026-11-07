# Usage: ACT_NODE=node22 [T1183_MEASURE_PAR=3] python3 scripts/t1183-measure.py SOURCE OUTPUT [off,T790_NO_SNAP,...,all]
# SOURCE must be an immutable checkout/snapshot with dependencies installed.
import os,sys,json,time,subprocess,pathlib,hashlib,resource,re,signal
from concurrent.futures import ThreadPoolExecutor
from threading import Lock, BoundedSemaphore
LOCK=Lock()
PAR=max(1,min(3,int(os.environ.get("T1183_MEASURE_PAR","1"))))
SLOTS=BoundedSemaphore(3 if PAR > 1 else 99)
SRC=pathlib.Path(sys.argv[1]).resolve(); OUT=pathlib.Path(sys.argv[2]).resolve(); OUT.mkdir(parents=True,exist_ok=True)
NODE=os.environ.get('ACT_NODE','node')
if PAR>1 and 'T577_PORT_BASE' not in (SRC/'scripts/t577-server-run.js').read_text():raise RuntimeError('parallel variants require the isolated-port measurement adapter')
KEYS=['T790_NO_SNAP','T1041_WAR_BODY','T811_ARMS_BODY','T449_BODY_DAY','T491_BATCH_FROM_BODY','T561_ROSTER_BODY','T502_ODDS_REAL','T815_DRAFT_FAMINE','T941_BATTLE_DAY','T627_TRIP_DAY']
variants=sys.argv[3].split(',') if len(sys.argv)>3 else ['off']+KEYS+['all']
rec={'source':str(SRC),'node':subprocess.check_output([NODE,'--version'],text=True).strip(),'files':{f:hashlib.sha256((SRC/f).read_bytes()).hexdigest() for f in ['server/villages.js','server/war-live.js','sim/war-core.js','sim/economy-sim.js']},'runs':[]}
if (OUT/'suite.json').exists():
 prior=json.loads((OUT/'suite.json').read_text())
 if prior.get('files') != rec['files']: raise RuntimeError('source changed; use a new output directory')
 rec=prior
rec.setdefault('executionPhases',[]).append({'started':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'variantWorkers':PAR,'maxConcurrentCommands':3 if PAR>1 else 3,'planParallelism':1 if PAR>1 else 3})
def save(): (OUT/'suite.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
def completed(tag):
 old=next((r for r in reversed(rec['runs']) if r['tag']==tag and r['exit'] in (0,1)),None)
 if not old:return False
 if tag.endswith('-plan'):
  d=pathlib.Path(old.get('sbcDir','/nonexistent'))
  return all((d/f'sbc-{seed}.fd-deaths.json').exists() for seed in [1020,7,42])
 if tag.endswith('-server800'):
  v=tag[:-10]
  return (OUT/v/'server800'/f'{v}-1020.fd-deaths.json').exists()
 if '-lab-' in tag:
  try:return 'fdDeadTot' in json.loads(pathlib.Path(old['env']['T17_JSON']).read_text())
  except (FileNotFoundError,json.JSONDecodeError):return False
 return True
def run(tag,args,env):
 if completed(tag):return
 with SLOTS:return execute(tag,args,env)
def execute(tag,args,env):
 log=OUT/(tag+'.log'); e=os.environ.copy(); e.update(env); t=time.monotonic()
 print('START',tag,flush=True)
 with log.open('w') as stream:
  p=subprocess.Popen([NODE]+args,cwd=SRC,env=e,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  limitSec=7200; deadline=time.monotonic()+limitSec; timedOut=False
  while True:
   pid,status,usage=os.wait4(p.pid,os.WNOHANG)
   if pid:
    p.returncode=os.waitstatus_to_exitcode(status); code=124 if timedOut else p.returncode; break
   if time.monotonic()>=deadline:
    os.killpg(p.pid,signal.SIGKILL if timedOut else signal.SIGTERM)
    timedOut=True;deadline=time.monotonic()+10
   time.sleep(.1)
 row={'tag':tag,'limitSec':limitSec,'args':args,'env':env,'exit':code,'wallSec':round(time.monotonic()-t,3),'cpuUs':round((usage.ru_utime+usage.ru_stime)*1e6),'log':str(log)}
 txt=log.read_text(); m=re.search(r'판 (/tmp/sbc-[\w-]+)',txt)
 if m: row['sbcDir']=m[1]
 if args[0]=='scripts/server-baseline-check.js' and code in (0,1):
  try:
   check=json.loads((pathlib.Path(row['sbcDir'])/'check.json').read_text())
   verified=len(check.get('per',{}))==3 and all(x.get('code')==0 for x in check['per'].values())
  except (KeyError,FileNotFoundError,json.JSONDecodeError):verified=False
  row['completedAllSeeds']=verified
  if not verified:code=2;row['exit']=2;row['failure']='server child did not complete; not a changed-world comparison'
 with LOCK:
  rec['runs'].append(row);save(); print('DONE',tag,code,row['wallSec'],flush=True)
 if code not in (0,1) or (code==1 and args[0]!='scripts/server-baseline-check.js'):sys.exit(code or 2)
def measure(v):
 env={k:'0' for k in KEYS};env.update({k:'0' for k in ['T1078_BANDIT_ALL','T1079_BANDIT_CAMP','T1104_BANDIT_WALK','T1159_HOME_N']});env.update({k:'1' for k in ['T1076_ARMY_MORALE','T466_LOOT_ACT','T826_LOOT_BODY','T1168_SORTIE_AMMO']})
 if v=='all':env.update({k:'1' for k in KEYS})
 elif v!='off':env[v]='1'
 if PAR>1:env['T577_PORT_BASE']=str(41000+(['off']+KEYS+['all']).index(v)*1000)
 dest=OUT/v;dest.mkdir(exist_ok=True)
 run(v+'-plan',['scripts/server-baseline-check.js','계측/서버기준선_2026-11-04c.json','--plan','1020:400,7:60,42:60','--par',str(1 if PAR>1 else 3)],env)
 e=dict(env,T400_BUILD_ACT='0',VILLAGE_CARAVAN_MAX='0',T577_DIR=str(dest/'server800'),T577_PAR='1',T577_TAG=v)
 run(v+'-server800',['scripts/t577-server-run.js','800','1020'],e)
 def lab(seed):
  e=dict(env,T17_JSON=str(dest/f'lab-{seed}.json'),LAB_SEEDCACHE=str(dest/f'lab-{seed}.seedcache.json'),DB_PATH=str(dest/f'lab-{seed}.db'))
  run(v+f'-lab-{seed}',['scripts/t17-metrics.js','800',str(seed)],e)
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lab,[1020,7,42]))

if any(v not in ['off']+KEYS+['all'] for v in variants):raise ValueError('unknown variant')
with ThreadPoolExecutor(max_workers=PAR) as variantsPool:list(variantsPool.map(measure,variants))
