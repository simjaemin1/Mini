#!/usr/bin/env python3
"""Standalone scientific CPU/population/ruler curves from the collected daily CSV."""
import argparse,csv,json,os
from pathlib import Path
os.environ.setdefault('MPLCONFIGDIR','/tmp/t1358/mpl')
os.environ.setdefault('XDG_CACHE_HOME','/tmp/t1358/cache')
Path(os.environ['XDG_CACHE_HOME']).mkdir(parents=True,exist_ok=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
p=argparse.ArgumentParser();p.add_argument('results',type=Path);a=p.parse_args()
with (a.results/'daily.csv').open() as f:rows=list(csv.DictReader(f))
summary=json.loads((a.results/'summary.json').read_text())
plt.rcParams.update({'font.size':9,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
colors={'OFF':'#64748b','BODY':'#0072b2','A':'#d55e00'}
def roll(xs):return [sum(xs[max(0,i-9):i+1])/len(xs[max(0,i-9):i+1]) for i in range(len(xs))]
for seed in [1020,7]:
 fig,axs=plt.subplots(3,2,figsize=(12,10.5),sharex=True,layout='constrained')
 axes=axs.ravel();by={}
 for arm in ['OFF','BODY','A']:
  name=f'{arm}-{seed}';rs=[r for r in rows if r['case']==name]
  if not rs:continue
  rs.sort(key=lambda r:int(r['day']));by[arm]=rs
  x=[int(r['day']) for r in rs];c=colors[arm]
  axes[0].plot(x,[int(r['pop']) for r in rs],label=arm,color=c)
  cpu=[float(r['cpuSeconds']) for r in rs]
  axes[5].plot(x,cpu,color=c,alpha=.13,lw=.65)
  axes[5].plot(x,roll(cpu),color=c,label=arm,lw=1.4)
  if arm=='OFF':continue
  for ax,key in [(axes[2],'doneDay'),(axes[3],'zeroVillages')]:
   pairs=[(int(r['day']),float(r[key])) for r in rs if r[key] not in ['',None,'None']]
   if pairs:
    xx,ys=zip(*pairs);ax.plot(xx,ys,color=c,alpha=.18,lw=.6);ax.plot(xx,roll(ys),color=c,label=arm,lw=1.4)
  axes[4].plot(x,[float(r['completedWood']) for r in rs],color=c,label=arm+' completed')
  pts=summary.get(name,{}).get('points',{})
  for day,pt in pts.items():
   if pt.get('placedWood') is not None:axes[4].scatter([int(day)],[pt['placedWood']],marker='x',s=40,color=c,zorder=4)
 off={int(r['day']):int(r['pop']) for r in by.get('OFF',[])}
 for arm in ['BODY','A']:
  ps=[(int(r['day']),int(r['pop'])/off[int(r['day'])]) for r in by.get(arm,[]) if off.get(int(r['day']))]
  if ps:
   x,y=zip(*ps);axes[1].plot(x,y,color=colors[arm],label=arm)
 axes[1].axhline(1.30,color='#111827',ls='--',lw=1,label='1.30 ruler')
 axes[2].set_yscale('symlog',linthresh=1)
 axes[2].set_ylim(bottom=0)
 axes[3].set_ylim(-1,52)
 titles=['Economic population (all bodies retained)','Population / same-day OFF','Physical completions per day (symlog)','Villages with zero completions that day','Stakes: completed cells; x = all placed incl. pending','Process CPU sec/day (raw faint; 10-day mean)']
 for ax,title in zip(axes,titles):
  ax.set_title(title,loc='left',fontsize=10);ax.grid(axis='y',alpha=.2)
  for day in [100,200,400]:
   if day<=max((int(r['day']) for r in rows if r['case'].endswith('-'+str(seed))),default=0):ax.axvline(day,color='#94a3b8',lw=.6,ls=':')
  handles,labels=ax.get_legend_handles_labels()
  if handles:ax.legend(fontsize=8,frameon=False,loc='best')
 for ax in axs[-1]:ax.set_xlabel('Economy day; checkpoint cadence = 10 days')
 partial=' | PARTIAL DATA' if any(not summary.get(f'{arm}-{seed}',{}).get('done') for arm in ['OFF','BODY','A']) else ''
 fig.suptitle(f'T1358 | seed {seed} | house/farm act OFF | BODY includes existing B/C'+partial,fontsize=13)
 for ext in ['png','svg']:fig.savefig(a.results/f'curves-{seed}.{ext}',dpi=160)
 plt.close(fig)
print('Wrote PNG/SVG curves')
