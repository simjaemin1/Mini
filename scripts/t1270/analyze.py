"""CPU accounting and native trace GC union. No elapsed GC duration is billed as CPU."""
import bisect,csv,json,sys,math
from collections import defaultdict
from pathlib import Path
folder=Path(sys.argv[1]);out=Path(sys.argv[2]);out.mkdir(parents=True,exist_ok=True)
p=json.loads((folder/'profile.json').read_text());contexts=sorted(json.loads((folder/'gc-contexts.json').read_text()),key=lambda r:r['ts']);ctxstarts=[r['ts'] for r in contexts]
# Stream trace events: full 30-day traces need not fit in memory as Python objects.
def events(file):
 decoder=json.JSONDecoder();buf='';started=False
 with file.open() as f:
  while chunk:=f.read(131072):
   buf+=chunk
   if not started:
    at=buf.find('[')
    if at<0:continue
    buf=buf[at+1:];started=True
   while True:
    buf=buf.lstrip(' \r\n\t,')
    if buf.startswith(']'):return
    try:r,end=decoder.raw_decode(buf)
    except json.JSONDecodeError:break
    yield r;buf=buf[end:]
  if buf.strip(' \r\n\t,') and not buf.lstrip().startswith(']'):raise ValueError('incomplete trace JSON')
tracefiles=sorted(folder.glob('trace-'+str(p['pid'])+'-*.json'),key=lambda f:int(f.stem.rsplit('-',1)[1]));
if not tracefiles:tracefiles=[folder/('trace-'+str(p['pid'])+'.json')]
intervals=defaultdict(list);stacks=defaultdict(list);threadnames={};counts=defaultdict(int);main=None
from itertools import chain
for e in chain.from_iterable(events(f) for f in tracefiles):
 name=e.get('name','');tid=e.get('tid');ph=e.get('ph')
 if ph=='M' and name=='thread_name':
  threadnames[tid]=e.get('args',{}).get('name')
  if threadnames[tid]=='JavaScriptMainThread':main=tid
 if not ('v8.gc' in e.get('cat','') or name.startswith('V8.GC') or name in ['MinorGC','MajorGC']):continue
 if e.get('ts',0)>p['endWallUs']:continue
 counts[name]+=1
 if ph=='X' and e.get('tdur',0)>0:intervals[tid].append((e['tts'],e['tts']+e['tdur'],e['ts'],e['ts']+e.get('dur',0)))
 elif ph=='B':stacks[tid].append(e)
 elif ph=='E':
  for i in range(len(stacks[tid])-1,-1,-1):
   b=stacks[tid][i]
   if b['name']==name:
    stacks[tid].pop(i)
    if e.get('tts',0)>b.get('tts',0):intervals[tid].append((b['tts'],e['tts'],b['ts'],e['ts']))
    break
assert main==p['pid']
def union(items):
 result=[]
 for a,b,w0,w1 in sorted(items):
  if result and a<=result[-1][1]:
   prev=result[-1];result[-1]=(prev[0],max(prev[1],b),min(prev[2],w0),max(prev[3],w1))
  else:result.append((a,b,w0,w1))
 return result
unions={tid:union(v) for tid,v in intervals.items()};gcbythread={tid:sum(b-a for a,b,_,_ in v) for tid,v in unions.items()};mainGC=gcbythread.get(main,0);bgGC=sum(v for tid,v in gcbythread.items() if tid!=main)
assert bgGC<=p['otherThreadUs']+5000,(bgGC,p['otherThreadUs'])
raw=dict(p['bucketsUs']);adjusted=dict(raw);removed=defaultdict(int);unmatched=0;gcgroups=defaultdict(int);gcDaily=[]
for a,b,w0,w1 in unions.get(main,[]):
 us=b-a;at=bisect.bisect_right(ctxstarts,w0+100);near=contexts[max(0,at-5):min(len(contexts),at+2)];candidates=[r for r in near if r['key'] and r['ts']-100<=w0<=r['ts']+r['dur']+100]
 if not candidates:unmatched+=us;continue
 ctx=min(candidates,key=lambda r:abs(r['ts']-w0));key=ctx['key'];amount=min(us,max(0,adjusted.get(key,0)))
 if not amount:unmatched+=us;continue
 adjusted[key]-=amount;removed[key]+=amount;coarse=key.split('::',1)[0];target=coarse+'::GC:main-thread';adjusted[target]=adjusted.get(target,0)+amount;gcgroups[target]+=amount;unmatched+=us-amount;gcDaily.append({'ts':w0,'cpuUs':amount,'originalKey':key,'target':target})
adjusted['other::GC:background-threads']=bgGC
adjusted['other::unattributed-background']=p['otherThreadUs']-bgGC
assert all(v>=0 for v in adjusted.values())
assert sum(adjusted.values())==p['processUs']
coarse=defaultdict(int)
for k,v in adjusted.items():coarse[k.split('::',1)[0]]+=v
other=coarse['other'];unknown={k:v for k,v in adjusted.items() if k.startswith('other::unattributed')};unidentified=sum(unknown.values());coverage=1-unidentified/other
rows=[]
for key,us in sorted(adjusted.items(),key=lambda kv:kv[1],reverse=True):
 c,name=key.split('::',1);rows.append({'key':key,'coarse':c,'name':name,'cpuUs':us,'cpuMinutes':us/60e6,'percentOfProcess':us/p['processUs']*100,'percentOfOther':us/other*100 if c=='other' else None,'zeroOnlyThisMinutes':(p['processUs']-us)/60e6,'known':not key.startswith('other::unattributed'),'source':p['labels'].get(key,{}).get('source','native trace GC' if '::GC:' in key else None)})
with (out/'blocks.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
days=[json.loads(l) for l in (folder/'days-cpu.jsonl').read_text().splitlines()];daily=[];previousMain=0
# Daily curves retain callback CPU including GC; GC subdivision above is the exclusive full-window table.
for r in days:
 d=dict(r['deltaUs']);bg=r['cpuUs']-(r['mainThreadUs']-previousMain);previousMain=r['mainThreadUs'];otherday=sum(v for k,v in d.items() if k.startswith('other::'))+bg
 daily.append({'day':r['day'],'population':r['population'],'bodies':r['bodies']['players'],'npcs':r['bodies']['npcs'],'frames':r['frames'],'cpuMinutes':r['cpuUs']/60e6,'otherMinutes':otherday/60e6,'backgroundMinutes':bg/60e6,'startupMinutes':sum(v for k,v in d.items() if k.startswith('startup::'))/60e6})
with (out/'daily.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(daily[0]));w.writeheader();w.writerows(daily)
result={'processCpuMinutes':p['processUs']/60e6,'mainThreadCpuMinutes':p['mainThreadUs']/60e6,'otherThreadCpuMinutes':p['otherThreadUs']/60e6,'otherCpuMinutes':other/60e6,'coveragePercent':coverage*100,'identifiedOtherCpuMinutes':(other-unidentified)/60e6,'unknownCpuMinutes':unidentified/60e6,'coarseUs':dict(coarse),'gc':{'clock':'trace event thread CPU tts/tdur in microseconds, union within each thread; never ts/dur as CPU','traceFiles':[f.name for f in tracefiles],'mainUs':mainGC,'backgroundUs':bgGC,'mainAssignedUs':sum(gcgroups.values()),'mainUnassignedUs':unmatched,'byThreadUs':gcbythread,'threadNames':threadnames,'eventsByName':dict(counts),'removedByOriginalBucketUs':dict(removed)},'otherBlocks':[r for r in rows if r['coarse']=='other'],'allBlocks':rows,'days':len(days),'first':daily[0],'last':daily[-1],'timers':p['timers'],'functions':p['calls']}
(out/'summary.json').write_text(json.dumps(result,indent=2)+'\n');(out/'gc-attribution.json').write_text(json.dumps(gcDaily)+'\n')
print(json.dumps({k:result[k] for k in ['processCpuMinutes','otherCpuMinutes','coveragePercent','unknownCpuMinutes']},indent=2));print('other top5',[(r['name'],round(r['cpuMinutes'],3),round(r['percentOfOther'],2)) for r in result['otherBlocks'][:5]]);print('GC',mainGC/1e6,bgGC/1e6,'unassigned main seconds',unmatched/1e6)
