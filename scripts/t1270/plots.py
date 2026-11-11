import csv,json,os,statistics,math
from pathlib import Path
import sys
folder=Path(sys.argv[1]);out=Path(sys.argv[2]);s=json.loads((out/'summary.json').read_text());p=json.loads((folder/'profile.json').read_text());raw=[json.loads(l) for l in (folder/'days-cpu.jsonl').read_text().splitlines()];daily=list(csv.DictReader((out/'daily.csv').open()))
os.environ.setdefault('MPLCONFIGDIR','/tmp/t1270-mpl');os.environ.setdefault('XDG_CACHE_HOME','/tmp/t1270-font-cache');Path(os.environ['XDG_CACHE_HOME']).mkdir(parents=True,exist_ok=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
keys=[r['key'] for r in s['otherBlocks'] if r['known'] and r['key'] in p['bucketsUs'] and r['cpuUs']>0][:5]
mean=lambda a:sum(a)/len(a)
def corr(a,b):
 aa=[x-mean(a) for x in a];bb=[y-mean(b) for y in b];den=math.sqrt(sum(x*x for x in aa)*sum(y*y for y in bb));return sum(x*y for x,y in zip(aa,bb))/den if den else None
drivers=[];wide=[];previous=0
for i,r in enumerate(raw):
 d={'day':r['day'],'frames':r['frames']-previous,'population':r['population'],'bodies':r['bodies']['players']};previous=r['frames']
 for k in keys:d[k]=r['deltaUs'].get(k,0)/60e6
 wide.append(d)
with (out/'daily-drivers.csv').open('w') as f:
 w=csv.DictWriter(f,fieldnames=list(wide[0]));w.writeheader();w.writerows(wide)
for k in keys:
 a=[r[k] for r in wide];first=mean(a[:10]);last=mean(a[-10:]);drivers.append({'key':k,'first10MeanMinutes':first,'last10MeanMinutes':last,'lastVsFirst':last/first if first else None,'correlationWithBodiesExcludingFirstDay':corr([r['bodies'] for r in wide[1:]],a[1:]),'correlationWithPopulationExcludingFirstDay':corr([r['population'] for r in wide[1:]],a[1:]),'first10MeanUsPerOuterFrame':mean([r[k]*60e6/r['frames'] for r in wide[:10]]),'last10MeanUsPerOuterFrame':mean([r[k]*60e6/r['frames'] for r in wide[-10:]])})
s['dailyDrivers']=drivers;s['dailyAverages']={'first10CpuMinutesStartupExcluded':mean([float(r['cpuMinutes'])-float(r['startupMinutes']) for r in daily[:10]]),'last10CpuMinutes':mean([float(r['cpuMinutes']) for r in daily[-10:]]),'first10OtherMinutes':mean([float(r['otherMinutes']) for r in daily[:10]]),'last10OtherMinutes':mean([float(r['otherMinutes']) for r in daily[-10:]])};(out/'curve-analysis.json').write_text(json.dumps({k:s[k] for k in ['dailyDrivers','dailyAverages']},indent=2)+'\n')
fig,axs=plt.subplots(3,1,figsize=(11,10),sharex=True);day=[int(r['day']) for r in daily]
axs[0].plot(day,[float(r['cpuMinutes'])-float(r['startupMinutes']) for r in daily],label='Whole CPU (startup excluded)');axs[0].plot(day,[float(r['otherMinutes']) for r in daily],label='Other CPU');axs[0].set_ylabel('CPU min / day')
for k in keys[:4]:
 label=k.split('::',1)[1].replace('villages:','').replace('zone:','');axs[1].plot(day,[r[k] for r in wide],label=label[:56])
axs[1].set_ylabel('Callback CPU min / day\n(GC included)')
axs[2].plot(day,[int(r['population']) for r in daily],label='Economic population');axs[2].plot(day,[int(r['bodies']) for r in daily],linestyle='--',label='Physical bodies (players Map)');axs[2].set_ylabel('Count');axs[2].set_xlabel('Simulation day')
for ax in axs:ax.grid(alpha=.3);ax.legend(fontsize=9)
fig.tight_layout();fig.savefig(out/'daily-cpu.png',dpi=160);fig.savefig(out/'daily-cpu.svg');plt.close(fig)
print(json.dumps(s['dailyAverages'],indent=2));print('driver ratios',[(d['key'],round(d['lastVsFirst'],2) if d['lastVsFirst'] else None) for d in drivers])
