# Usage: ACT_NODE=/path/to/node22 python3 scripts/t1184-t1159-measure.py IMMUTABLE_SOURCE OUTPUT [--retry-failed]
# Reuses completed results. Failed/capped attempts are retained and skipped unless --retry-failed is explicit.
import os,sys,json,time,pathlib,subprocess,signal,resource,hashlib,re
from concurrent.futures import ThreadPoolExecutor
from threading import Lock,BoundedSemaphore
LOCK=Lock();SLOTS=BoundedSemaphore(3)
if len(sys.argv)<3:raise SystemExit('Usage: ACT_NODE=node22 python3 scripts/t1184-t1159-measure.py IMMUTABLE_SOURCE OUTPUT [--retry-failed]')
SRC=pathlib.Path(sys.argv[1]).resolve();OUT=pathlib.Path(sys.argv[2]).resolve();OUT.mkdir(parents=True,exist_ok=True)
NODE=os.environ.get('ACT_NODE','node');RETRY='--retry-failed' in sys.argv[3:]
TEN=['T790_NO_SNAP','T1041_WAR_BODY','T811_ARMS_BODY','T449_BODY_DAY','T491_BATCH_FROM_BODY','T561_ROSTER_BODY','T502_ODDS_REAL','T815_DRAFT_FAMINE','T941_BATTLE_DAY','T627_TRIP_DAY']
BAND=['T1078_BANDIT_ALL','T1079_BANDIT_CAMP','T1104_BANDIT_WALK'];FOUR=['T1076_ARMY_MORALE','T466_LOOT_ACT','T826_LOOT_BODY','T1168_SORTIE_AMMO']
version=subprocess.check_output([NODE,'--version'],text=True).strip()
if not version.startswith('v22.'):raise RuntimeError('The existing simulation baselines require Node22; set ACT_NODE explicitly')
files=['server/villages.js','server/bandits.js','server/home-population.js','server/war-live.js','sim/war-core.js','sim/economy-sim.js']
sha={f:hashlib.sha256((SRC/f).read_bytes()).hexdigest() for f in files}
head=(SRC/'MEASURE_HEAD').read_text().strip() if (SRC/'MEASURE_HEAD').exists() else subprocess.check_output(['git','rev-parse','HEAD'],cwd=SRC,text=True).strip()
rec={'source':str(SRC),'head':head,'node':version,'sha256':sha,'runs':[]}
if (OUT/'suite.json').exists():
 rec=json.loads((OUT/'suite.json').read_text())
 if rec.get('sha256')!=sha or rec.get('node')!=version:raise RuntimeError('Source/runtime changed; use a separate output directory')
observers={f:hashlib.sha256((SRC/'scripts'/f).read_bytes()).hexdigest() for f in ['t1159-observe.js','t1078-observe.js','t1079-observe.js','t1104-observe.js']}
if rec.get('observerSha256') and rec['observerSha256']!=observers:raise RuntimeError('Observer changed; use a separate output directory or record its adapter transition explicitly')
rec['observerSha256']=observers
rec.setdefault('executionPhases',[]).append({'started':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'runner':'t1184-t1159-measure.py','maxConcurrentCommands':3,'finiteLimitSec':7200,'warInfinityLimitSec':3600,'resume':bool(rec['runs']),'retryFailed':RETRY})
def previous(tag):return next((r for r in reversed(rec['runs']) if r['tag']==tag),None)
def valid(row):
 if row['exit'] not in (0,1):return False
 if row['args'][0]=='scripts/server-baseline-check.js':return row.get('completedAllSeeds') is True and pathlib.Path(row.get('sbcDir','/nonexistent'),'check.json').exists()
 if row['exit']!=0:return False
 try:
  if row['tag'].endswith('-server800'):
   v=row['tag'][:-10];p=OUT/v/'server800'/(v+'-1020.json')
   return json.loads(p.read_text()).get('days')==800 and p.with_suffix('.fd-deaths.json').exists()
  if '-lab-' in row['tag']:return 'fdDeadTot' in json.loads(pathlib.Path(row['env']['T17_JSON']).read_text())
  if row['tag']=='flat-final':return pathlib.Path(row['env']['T1183_ZONE_OUT']).exists()
 except (KeyError,FileNotFoundError,json.JSONDecodeError):return False
 return True
for marker in ['complete','finished']:(OUT/marker).unlink(missing_ok=True)
def save(): (OUT/'suite.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2)+'\n')
def run(tag,args,env):
 old=previous(tag)
 if old and (valid(old) or not RETRY):
  print('SKIP',tag,'completed' if valid(old) else 'retained failure/cap',flush=True);return
 if old:
  log=pathlib.Path(old['log'])
  if log.exists():
   archive=OUT/(tag+f'-attempt-{sum(r["tag"]==tag for r in rec["runs"])}.log');log.rename(archive);old['log']=str(archive)
 with SLOTS:return execute(tag,args,env)
def execute(tag,args,env):
 log=OUT/(tag+'.log'); e=os.environ.copy(); e.update(env); t=time.monotonic()
 print('START',tag,flush=True)
 with log.open('w') as stream:
  p=subprocess.Popen([NODE]+args,cwd=SRC,env=e,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
  limitSec=3600 if '--war' in args else 7200; deadline=time.monotonic()+limitSec; timedOut=False
  while True:
   pid,status,usage=os.wait4(p.pid,os.WNOHANG)
   if pid:
    p.returncode=os.waitstatus_to_exitcode(status); code=124 if timedOut else p.returncode; break
   if time.monotonic()>=deadline:
    os.killpg(p.pid,signal.SIGKILL if timedOut else signal.SIGTERM)
    timedOut=True;deadline=time.monotonic()+10
   time.sleep(.1)
 if timedOut:
  # Parent may exit before its server children. Allow their exit observers to flush, then drain this owned group.
  cleanupDeadline=time.monotonic()+10
  while True:
   try:os.killpg(p.pid,0)
   except ProcessLookupError:break
   if time.monotonic()>=cleanupDeadline:
    try:os.killpg(p.pid,signal.SIGKILL)
    except ProcessLookupError:pass
    break
   time.sleep(.1)
 row={'cpuComplete':not timedOut,'tag':tag,'limitSec':limitSec,'args':args,'env':env,'exit':code,'wallSec':round(time.monotonic()-t,3),'cpuUs':round((usage.ru_utime+usage.ru_stime)*1e6),'log':str(log)}
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
 if code not in (0,1) or (code==1 and args[0]!='scripts/server-baseline-check.js'):print('LIMIT' if code==124 else 'FAILED',tag,'continuing independent cases',flush=True)
base={k:'1' for k in TEN+FOUR};base.update({k:'0' for k in BAND+['T1159_HOME_N']})
rollback=dict(base);rollback.update({k:'0' for k in TEN+FOUR});rollback['T941_BATTLE_DAY']='1'
run('final-rollback',['scripts/server-baseline-check.js','계측/서버기준선_2026-11-04c.json','--par','3'],rollback)
flat=dict(base,WW_ONLY_SERVER='1',WW_PHYSICAL='1',T1183_FLAT_ENCOUNTER='1',T1183_ZONE_OUT=str(OUT/'flat-final.json'),NODE_OPTIONS='-r '+str(SRC/'scripts/t1183-zone-observe.js'))
run('flat-final',['scripts/test-war-world.js'],flat)
def measureBand(pair):
 variant,n=pair
 env=dict(base,T577_PORT_BASE=str(55000+n*1000));env.update({k:'1' for k in BAND[:n]});d=OUT/variant;d.mkdir(exist_ok=True)
 run(variant+'-plan',['scripts/server-baseline-check.js','계측/서버기준선_2026-11-04c.json','--plan','1020:400,7:60,42:60','--par','1'],env)
 env=dict(env,T400_BUILD_ACT='0',VILLAGE_CARAVAN_MAX='0',NODE_OPTIONS=' '.join('-r '+str(SRC/'scripts'/s) for s in ['t1078-observe.js','t1079-observe.js','t1104-observe.js']),T577_DIR=str(d/'server800'),T577_PAR='1',T577_TAG=variant)
 run(variant+'-server800',['scripts/t577-server-run.js','800','1020'],env)
 def lab(seed):
  # This lab inherits T400_BUILD_ACT=0: compare with band-off at the same condition. Standard house-on lab is separate.
  labenv=dict(env,T17_JSON=str(d/f'lab-{seed}.json'),LAB_SEEDCACHE=str(d/f'lab-{seed}.seedcache.json'),DB_PATH=str(d/f'lab-{seed}.db'))
  run(variant+f'-lab-{seed}',['scripts/t17-metrics.js','800',str(seed)],labenv)
 with ThreadPoolExecutor(max_workers=3) as pool:list(pool.map(lab,[1020,7,42]))

with ThreadPoolExecutor(max_workers=3) as variantsPool:list(variantsPool.map(measureBand,[('band-off',0),('band-all-body',1),('band-camp',2),('band-walk',3)]))

# Physical war worlds, with the same conditions as the existing war baseline.
for tag,tenOn,fourOn,bandOn,homeOn in [('war-rollback',False,False,False,False),('war-ten-off',False,True,False,False),('war-ten-on',True,True,False,False),('home-off',True,True,True,False),('home-on',True,True,True,True)]:
 env={k:'1' if tenOn else '0' for k in TEN};env.update({k:'1' if fourOn else '0' for k in FOUR});env.update({k:'1' if bandOn else '0' for k in BAND});env['T1159_HOME_N']='1' if homeOn else '0'
 if tag=='war-rollback':env['T941_BATTLE_DAY']='1'
 env['NODE_OPTIONS']='-r '+str(SRC/'scripts/t1159-observe.js')
 run(tag,['scripts/server-baseline-check.js','계측/서버기준선_전쟁_2026-11-03.json','--war','--par','3'],env)
latest={r['tag']:r for r in rec['runs']}
rec['status']='complete' if len(latest)==27 and all(valid(r) for r in latest.values()) else 'finished-with-failures-or-limits'
save();(OUT/'finished').touch()
if rec['status']=='complete':(OUT/'complete').touch()
print('FINISHED',rec['status'],len(latest),'/27',flush=True)
raise SystemExit(0 if rec['status']=='complete' else 1)
