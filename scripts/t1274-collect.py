"""T1274 completed-run collection, independent coverage checks, daily CPU CSV."""
from pathlib import Path
import sys,json,gzip,hashlib,re,csv,statistics,subprocess
R=Path(__file__).resolve().parents[1]
P=Path(sys.argv[1] if len(sys.argv)>1 else '/tmp/t1274-r2')
O=R/'계측/T1274_2026-11-12';O.mkdir(parents=True,exist_ok=True)
read=lambda p:json.loads(p.read_text())
source=read(P/'source.json');sha=source['sha256']
assert all(hashlib.sha256((R/f).read_bytes()).hexdigest()==h for f,h in sha.items())
subprocess.run(['git','diff','--quiet',source['head'],'--','server','sim','public'],cwd=R,check=True)
summary={'base':source['head'],'sourceUnchanged':True,'arms':{},'fast':{},'preflight':{},
         'exitCodeScope':'status.exit is the CLI runner exit. The metadata preload additionally records the actual leaf zone OS exit via child_process exit(code,signal) in the native parent.'}

def copy(src,dest):
 dest.parent.mkdir(parents=True,exist_ok=True)
 if src.suffix in ['.json','.jsonl','.log']:
  dest=dest.with_name(dest.name+'.gz');dest.write_bytes(gzip.compress(src.read_bytes(),mtime=0))
 else:dest.write_bytes(src.read_bytes())

def controller(name):
 d=P/name;s=read(d/'status.json');info=read(d/'input.json')
 assert s['exit']==0 and s['sourceUnchanged'],(name,s)
 assert info['source']==sha
 for f in d.iterdir():
  if f.is_file():copy(f,O/'controllers'/name/f.name)
 return d,s,info

def body(name,days,observed):
 d,status,info=controller(name);q=d/'server';native=read(q/'run-1020.json')
 assert native['days']==days and native['villages']==51 and len(native['seedPop'])==51 and min(native['seedPop'])>0
 assert len(native['rows'])==days and [r[0] for r in native['rows']]==list(range(1,days+1))
 fingerprint=read(q/'run-1020.json.sbc.json');assert len(fingerprint['days'])==days
 assert [r[0] for r in fingerprint['days']]==list(range(1,days+1))
 meta=read(q/'run-1020.json.t1274-meta.json')
 zoneExit=read(q/'run-1020.json.zone-exit.json')
 assert zoneExit['code']==0 and zoneExit['signal'] is None and meta['exitEventCode']==0
 assert meta['clock']['errs']==0 and meta['clock']['started'] and meta['npcCapEnvironment'] is None
 result={'days':days,'runnerExit':status['exit'],'zoneExit':zoneExit,'population':native['eight']['pop'],'empty':native['empty'],
         'eight':native['eight'],'initialPopulation':sum(native['seedPop']),'clockErrors':0,
         'bodyExit':native['bodyExit'],'wallSeconds':status['wallSeconds']}
 if observed:
  x=read(q/'run-1020.json.t1274.json');rows=x['rows']
  assert not x['errors'] and x['clock']['errs']==0
  assert len(rows)==days and [r['day'] for r in rows]==list(range(1,days+1))
  assert rows[-1]['pop']==native['eight']['pop']
  assert rows[-1]['debtDeaths']==read(q/'run-1020.fd-deaths.json')['fdDeadTot']
  assert rows[-1]['bodyStarve']==native['bodyExit']['died']['starve']
  assert rows[0]['bodies']>51
  assert abs(sum(r['cpuSeconds'] for r in rows)-rows[-1]['processCPUSeconds'])<1e-5
  legacy={}
  for suffix in ['t1243','t1221','t1230','t1251']:
   legacyPath=q/f'run-1020.{suffix}.json'
   # T1221 writes every T1221_EVERY=10 days, so the one-day preflight has no output.
   if suffix=='t1221' and days<10 and not legacyPath.exists():
    legacy[suffix]={'notEmittedBeforeDay':10};continue
   legacy[suffix]=read(legacyPath);assert legacy[suffix].get('err') is None,(name,suffix,legacy[suffix].get('err'))
  valid=[r['cpuSeconds'] for r in rows if r['day']>1]
  result.update({'rows':rows,'snapshots':x['snapshots'],'final':rows[-1],
    'cpu':{'firstBoundaryIncludingStartup':rows[0]['cpuSeconds'],'sumThroughLastLedger':sum(r['cpuSeconds'] for r in rows),
           'meanDays2ToEnd':statistics.mean(valid) if valid else None,'medianDays2ToEnd':statistics.median(valid) if valid else None,
           'maxDay':max(rows,key=lambda r:r['cpuSeconds'])['day'],'maxDaySeconds':max(r['cpuSeconds'] for r in rows),
           'throughObserverExitSeconds':sum(x['finalCPU'].values())/1e6},
    'bodyCoverage':{'minimumBodyToPopulationRatio':min(r['bodies']/r['pop'] for r in rows if r['pop']),
      'maxPopulationMinusBodies':max(r['pop']-r['bodies'] for r in rows),
      'firstDifferentDay':next((r['day'] for r in rows if r['bodies']!=r['pop']),None)},
    'legacyBodyExitHeads':legacy['t1243'].get('ten',[]),
    'woodCrossCheck':{'ownSettledPre':x['settledBodyWood'],
      'legacyRoundedSettledPre':sum(r[legacy['t1251']['cols'].index('bodyWood')] for r in legacy['t1251']['rows']),
      'ownPreviousD':x['legacyPreviousWoodD'],'ownCurrentD':x['currentWoodD']}})
 for f in q.iterdir():
  if f.is_file() and '.db' not in f.name:copy(f,O/'runs'/name/f.name)
 return result,fingerprint

plain,pfp=body('PREFLIGHT_PLAIN',1,False);obs,ofp=body('PREFLIGHT_OBSERVED',1,True)
assert pfp==ofp
summary['preflight']={'days':1,'sameNativeEconomyFingerprint':True,'plain':plain,'observed':obs}
for a in ['OFF','WOOD','TERR','V2_WOOD']:
 summary['arms'][a]=body(a,100,True)[0]

H=lambda s,n:hashlib.sha1(s.encode()).hexdigest()[:n]
def side_object(side):
 assert len(side['days'])==400 and [r['d'] for r in side['days']]==list(range(1,401))
 assert len(side['names'])==51
 keys=sorted({k for r in side['days'] for k in r['f']});assert keys
 days=[]
 for r in side['days']:
  hs=[H(r['f'].get(k) or '∅',8) for k in keys];days.append([r['d'],H(''.join(hs),12),hs])
 return {'names':side['names'],'keys':keys,'days':days}

for a in ['FAST_OLD_CLOCK','FAST_CURRENT','OFF_GATE']:
 d,status,info=controller(a);log=(d/'controller.log').read_text()
 q=Path(re.search(r'판 (/tmp/sbc-\w+)',log)[1])
 assert re.search(r'시드 1020 400일 판 \d+초\(종료 0\)',log)
 native=read(q/'sbc-1020.json');assert native['days']==400 and native['villages']==51 and min(native['seedPop'])>0
 zoneExit=read(q/'sbc-1020.json.zone-exit.json');meta=read(q/'sbc-1020.json.t1274-meta.json')
 assert zoneExit['code']==0 and zoneExit['signal'] is None and meta['exitEventCode']==0 and meta['clock']['errs']==0
 assert len(native['rows'])==400
 side=side_object(read(q/'sbc-1020.json.t740.json'))
 clockLog=re.findall(r'\[t745\] 끝[^\n]*오류 (\d+)',(q/'sbc-1020.log').read_text())
 assert not clockLog or clockLog==['0']
 if a=='OFF_GATE':
  assert '=== 같음 1/1' in log and '마을 칸 지문 400일 같음' in log
  ref=read(R/'계측/서버기준선_2026-11-11.json')['byseed']['1020']
  assert native['eight']==ref['eight'] and native['eight']['pop']==3914 and side==ref['side']
 else:
  make=read(d/'baseline.json')['byseed']['1020'];assert make['side']==side
 fp=read(q/'sbc-1020.json.sbc.json')
 summary['fast'][a]={'population':native['eight']['pop'],'eight':native['eight'],'empty':native['empty'],
    'days':400,'sideDays':400,'clockErrors':0,'runnerExit':status['exit'],'zoneExit':zoneExit,
    'populationByDay':[{'day':r[0],'population':sum(r[1])} for r in native['rows']],
    'fingerprint':fp,'bodyExit':native['bodyExit']}
 for f in q.iterdir():
  if f.is_file() and '.db' not in f.name:copy(f,O/'runs'/a/f.name)

off=summary['arms']['OFF']['population']
summary['bodyRatios']={a:summary['arms'][a]['population']/off for a in ['WOOD','TERR','V2_WOOD']}
f_off=summary['fast']['OFF_GATE']['population']
summary['fastCurrentRatio']=summary['fast']['FAST_CURRENT']['population']/f_off
summary['clockJointEffect']={'currentPopulation':summary['fast']['FAST_CURRENT']['population'],
 'oldClockPopulation':summary['fast']['FAST_OLD_CLOCK']['population'],
 'difference':summary['fast']['FAST_CURRENT']['population']-summary['fast']['FAST_OLD_CLOCK']['population']}
fast100=lambda a:next(r['population'] for r in summary['fast'][a]['populationByDay'] if r['day']==100)
summary['matchedHorizon100']={'bodyOff':off,'bodyCombined':summary['arms']['V2_WOOD']['population'],
 'fastOff':fast100('OFF_GATE'),'fastCombined':fast100('FAST_CURRENT'),
 'bodyRatio':summary['bodyRatios']['V2_WOOD'],'fastRatio':fast100('FAST_CURRENT')/fast100('OFF_GATE')}
summary['clockJointEffect'].update({'currentPopulation100':fast100('FAST_CURRENT'),'oldClockPopulation100':fast100('FAST_OLD_CLOCK'),
 'firstDifferentFinancialDay':next((u[0] for u,v in zip(summary['fast']['FAST_CURRENT']['fingerprint']['days'],
 summary['fast']['FAST_OLD_CLOCK']['fingerprint']['days']) if u!=v),None)})
referenceRatios={'WOOD':0.784,'TERR':0.743,'V2_WOOD':1.184}
sign=lambda r:1 if r>1 else -1 if r<1 else 0
summary['directions']={a:{'bodyRatio':r,'referenceFast400Ratio':referenceRatios[a],
 'sameDirection':sign(r)==sign(referenceRatios[a]),'oppositeDirection':sign(r)*sign(referenceRatios[a])<0}
 for a,r in summary['bodyRatios'].items()}
summary['tenDayTables']={}
for a,v in summary['arms'].items():
 table=[];previous=None
 for r in v['rows']:
  if r['day']%10:continue
  recent=[p for p in v['rows'] if r['day']-10<p['day']<=r['day']]
  delta=lambda k:r[k]-(previous[k] if previous else 0)
  table.append({'day':r['day'],'population':r['pop'],'bodies':r['bodies'],'empty':r['empty'],
   'birth10':sum(p['born'] for p in recent),'emigration10':delta('emigrationCumulative'),
   'debtDeathsCumulative':r['debtDeaths'],'bodyStarveCumulative':r['bodyStarve'],
   'cpuMean10':statistics.mean(p['cpuSeconds'] for p in recent),
   'territory':r['territory'],'farm':r['farm'],'farmNetNewCells':r['farmNetNewCells'],
   'felledWood10':delta('felledWood'),'acceptedBodyWood10':delta('acceptedBodyWood'),'modelWoodD10':delta('currentWoodD'),
   'woodStock':r['wood'],'territoryCost':r['territoryCost'],'newHouseCellsCumulative':r['newHouseCells'],'housing':r['housing']})
  previous=r
 summary['tenDayTables'][a]=table

# Interrupted observations are a replication prefix only, never part of a fresh 100-day case.
summary['interruptedPrefixComparison']={}
for a in ['OFF','WOOD']:
 oldFile=O/'interrupted-environment'/a/'server/run-1020.json.sbc.json.gz'
 if oldFile.exists():
  old=json.loads(gzip.decompress(oldFile.read_bytes()))
  now=read(P/a/'server/run-1020.json.sbc.json')
  n=len(old['days']);pairs=list(zip(old['days'],now['days'][:n]))
  summary['interruptedPrefixComparison'][a]={'days':n,'sameEconomyFingerprint':old['days']==now['days'][:n],
   'firstDifferentDay':next((u[0] for u,v in pairs if u!=v),None),'usedAsCompletedDays':False}

# Produce same-scenario village contribution comparisons if an arm reverses direction.
summary['directionFlipVillages']={}
for a,direction in summary['directions'].items():
 if not direction['oppositeDirection']:continue
 records={}
 for name in ['OFF',a]:
  path=R/f'계측/T1264_2026-11-12/runs/{name}/1020/sbc-1020.json.t1264.json.gz'
  if path.exists():data=path.read_bytes()
  else:data=subprocess.check_output(['git','show','ef89fd5a:'+str(path.relative_to(R))],cwd=R)
  old=json.loads(gzip.decompress(data))
  records[name]={v['name']:v for v in old['snapshots'][-1]['villages']}
 current={name:{v['name']:v for v in summary['arms'][name]['snapshots'][-1]['villages']} for name in ['OFF',a]}
 oldOff=sum(v['pop'] for v in records['OFF'].values());rank=[]
 for name,b in current[a].items():
  bo=current['OFF'][name];f,fo=records[a][name],records['OFF'][name]
  bodyShare=(b['pop']-bo['pop'])/off;fastShare=(f['pop']-fo['pop'])/oldOff
  rank.append({'name':name,'contributionDifference':bodyShare-fastShare,'body':b,'bodyOff':bo,'fast400':f,'fastOff400':fo})
 summary['directionFlipVillages'][a]=sorted(rank,key=lambda r:abs(r['contributionDifference']),reverse=True)[:5]

with (O/'daily.csv').open('w') as f:
 fields=['arm','day','cpuSeconds','processCPUSeconds','pop','bodies','playerEntries','empty','born','emigrationCumulative','debtDeaths','bodyStarve','territory','farm','farmNetNewCells','houses','newHouseCells','wood','felledWood','acceptedBodyWood','currentWoodD']
 w=csv.DictWriter(f,fieldnames=fields,lineterminator="\n");w.writeheader()
 for a,v in summary['arms'].items():
  for row in v['rows']:w.writerow({'arm':a,**{k:row[k] for k in fields if k!='arm'}})
for name in ['source.json','preflight.json','status.json']:
 copy(P/name,O/name)
for name in ['processes.json','launch.json','supervisor-complete.json','supervisor.log','pipeline.log','fast-current-controller.log']:
 if (P/name).exists():copy(P/name,O/name)
(O/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))

import os
os.environ.setdefault('MPLCONFIGDIR',str(P/'matplotlib-cache'))
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.lines import Line2D
matplotlib.rcParams['svg.hashsalt']='T1274'
fig,axes=plt.subplots(2,1,figsize=(10,7),sharex=True)
for a,v in summary['arms'].items():
 ds=[r['day'] for r in v['rows']]
 line,=axes[0].plot(ds,[r['cpuSeconds'] for r in v['rows']],label=a)
 axes[1].plot(ds,[r['bodies'] for r in v['rows']],color=line.get_color())
 axes[1].plot(ds,[r['playerEntries'] for r in v['rows']],color=line.get_color(),linestyle='--',alpha=.65)
axes[0].set_ylabel('Zone CPU seconds / day');axes[1].set_ylabel('Physical actor entries');axes[1].set_xlabel('Completed simulation day')
axes[0].set_title('Live-rate unlimited-body worlds, seed 1020');axes[0].legend(ncol=4)
axes[1].legend(handles=[Line2D([0],[0],color='black',label='Resident bodies'),Line2D([0],[0],color='black',linestyle='--',label='All player-map entries')])
for ax in axes:ax.grid(alpha=.25)
fig.text(.01,.01,'Day 1 includes startup CPU. All zone threads included; observation overhead retained.',fontsize=8)
fig.tight_layout(rect=[0,.03,1,1]);fig.savefig(O/'daily-cpu.png',dpi=180);fig.savefig(O/'daily-cpu.svg',metadata={'Date':None});plt.close(fig)
svg=O/'daily-cpu.svg';svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines())+'\n')
print(json.dumps({'bodyDays':{a:r['days'] for a,r in summary['arms'].items()},'bodyRatios':summary['bodyRatios'],
                  'gate':'1/1','sideDays':400,'sourceUnchanged':True},ensure_ascii=False))
