"""Read-only T1262 CPU tables; units are actual CPU microseconds, not elapsed ns."""
import csv,json,math,statistics,sys
from pathlib import Path
out=Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
keys=['body_tick','econ','life_daily','pathfinding','trade_routes','storage','observers','startup','other']
result={}
for label,folder in [('tick',sys.argv[2]),('event',sys.argv[3])]:
 p=Path(folder);x=json.loads((p/'profile.json').read_text());s=json.loads((p/'status.json').read_text())
 assert s['valid'] and x['code']==0 and set(range(1,31))<=set(x['days'])
 b={k:x['bucketsUs'].get(k,0) for k in keys};b['other']+=x['otherThreadUs'];assert sum(b.values())==x['processUs']
 rows=[json.loads(l) for l in (p/'profile-days.jsonl').read_text().splitlines()]
 bodyrows=[json.loads(l) for l in (p/'body.1020.jsonl').read_text().splitlines() if '"d":' in l]
 bodybyday={1 if r['d']==-1 else r['d']+1:r for r in bodyrows}
 daily=[]
 prevstats={}
 for r in rows:
  d=dict(r['deltaUs']);prevmain=rows[rows.index(r)-1]['mainThreadUs'] if rows.index(r) else 0
  d['other']=d.get('other',0)+r['cpuUs']-(r['mainThreadUs']-prevmain)
  st=bodybyday.get(r['day'],{}).get('st',{});activity={k:st.get(k,0)-prevstats.get(k,0) for k in ['steps','bodyTicks','nStep','nMoveTicks']};prevstats=st
  daily.append({'steps':activity['steps'],'body_visits':activity['bodyTicks'],'npc_step_calls':activity['nStep'],'movement_ticks':activity['nMoveTicks'],'day':r['day'],'population':r['population'],'bodies':r['bodies']['players'],'npcs':r['bodies']['npcs'],'held':r['bodies']['held'],'cpu_minutes':r['cpuUs']/60e6,**{k:d.get(k,0)/60e6 for k in keys}})
 with (out/(label+'-daily.csv')).open('w') as f:
  w=csv.DictWriter(f,fieldnames=list(daily[0]));w.writeheader();w.writerows(daily)
 total=x['processUs']/60e6;startup=b['startup']/60e6
 # Extrapolations are scenarios, not 400-day measurements. Do not repeatedly charge startup.
 projected=startup+(total-startup)*400/30
 byblock={k:{'minutes':v/60e6,'percent':v/x['processUs']*100,'zero_this_30_minutes':total-v/60e6,'zero_this_400_minutes':projected-(v/60e6 if k=='startup' else v/60e6*400/30)} for k,v in b.items()}
 for k,v in byblock.items():
  remainder=v['zero_this_400_minutes'];contribution=projected-remainder
  v['requiredFactorIfOnlyThisBlockOptimized']=contribution/(60-remainder) if remainder<60 else None
 steady=daily[1:];mean=lambda a:sum(a)/len(a)
 def corr(a,b):
  aa=[v-mean(a) for v in a];bb=[v-mean(b) for v in b];den=math.sqrt(sum(v*v for v in aa)*sum(v*v for v in bb));return sum(u*v for u,v in zip(aa,bb))/den if den else None
 def regression(a,b):
  aa=[v-mean(a) for v in a];bb=[v-mean(b) for v in b];ss=sum(v*v for v in aa)
  slope=sum(u*v for u,v in zip(aa,bb))/ss if ss else 0
  return {'slopeCpuMinPerCount':slope,'interceptCpuMin':mean(b)-slope*mean(a),'rSquared':(corr(a,b) or 0)**2}
 costs=[r['cpu_minutes'] for r in steady];pops=[r['population'] for r in steady];bodies=[r['bodies'] for r in steady]
 stats={'first10_daily_mean':mean([r['cpu_minutes']-r['startup'] for r in daily[:10]]),'middle10_daily_mean':mean([r['cpu_minutes'] for r in daily[10:20]]),'last10_daily_mean':mean([r['cpu_minutes'] for r in daily[20:30]]),'cpu_population_pearson_excluding_boot_day':corr(costs,pops),'cpu_bodies_pearson_excluding_boot_day':corr(costs,bodies)}
 stats['cpuVsBodiesOLS']=regression(bodies,costs);stats['cpuVsPopulationOLS']=regression(pops,costs)
 paths={k:{**v,'meanInclusiveUs':v['inclusiveUs']/v['n']} for k,v in x['calls'].items() if k.startswith('path:')}
 result[label]={'totalMinutes':total,'startupMinutes':startup,'projection400Minutes':projected,'naive400Minutes':total*400/30,'requiredSpeedup':projected/60,'blocks':byblock,'paths':paths,'largestCalls':sorted(x['calls'].items(),key=lambda kv:kv[1].get('categoryUs',kv[1]['inclusiveUs']),reverse=True)[:20],'dailyStats':stats,'first':daily[0],'last':daily[-1]}
(out/'summary.json').write_text(json.dumps(result,indent=2)+'\n')
import os
os.environ.setdefault('MPLCONFIGDIR','/tmp/t1262-mpl')
os.environ.setdefault('XDG_CACHE_HOME','/tmp/t1262-font-cache')
Path(os.environ['XDG_CACHE_HOME']).mkdir(parents=True,exist_ok=True)
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
fig,axs=plt.subplots(2,1,figsize=(10,7),sharex=True)
for label in result:
 color={'tick':'#2463a8','event':'#d56b16'}[label]
 rows=list(csv.DictReader((out/(label+'-daily.csv')).open()));day=[int(r['day']) for r in rows]
 axs[0].plot(day,[float(r['cpu_minutes'])-float(r['startup']) for r in rows],label=label,color=color)
 axs[1].plot(day,[int(r['population']) for r in rows],label=label+' economic population',color=color)
 axs[1].plot(day,[int(r['bodies']) for r in rows],linestyle='--',label=label+' physical bodies',color=color)
axs[0].set_ylabel('CPU min / day (startup excluded)');axs[1].set_ylabel('Count');axs[1].set_xlabel('Simulation day')
for ax in axs:ax.grid(alpha=.3);ax.legend()
fig.tight_layout();fig.savefig(out/'daily-cpu.svg');fig.savefig(out/'daily-cpu.png',dpi=160);plt.close(fig)
print(json.dumps({k:{n:v[n] for n in ['totalMinutes','projection400Minutes','requiredSpeedup','dailyStats']} for k,v in result.items()},indent=2))
