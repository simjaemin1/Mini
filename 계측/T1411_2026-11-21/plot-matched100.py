from pathlib import Path
import csv,statistics
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
D=Path(__file__).resolve().parent
def read(path,case):
 rows=[r for r in csv.DictReader(path.open()) if r['case']==case and int(r['day'])<=100]
 assert [int(r['day']) for r in rows]==list(range(1,101))
 return rows
base=read(D/'base-100/daily.csv','base-plain-1020');fast=read(D/'pair-1020-100/daily.csv','ON-1020')
assert [r['pop'] for r in base]==[r['pop'] for r in fast]
values=[[float(r['cpuSeconds']) for r in rows] for rows in [base,fast]]
assert abs(statistics.mean(values[0])-99.01225134)<1e-8
assert abs(statistics.mean(values[1])-100.4883079)<1e-8
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'svg.fonttype':'none'})
fig,axes=plt.subplots(2,1,figsize=(10,7),sharex=True,gridspec_kw={'height_ratios':[1.25,1]})
colors=['#475569','#2563eb'];labels=['Original ON','Candidate ON'];x=list(range(1,101));means=[]
for y,color,label in zip(values,colors,labels):
 axes[0].plot(x,y,color=color,alpha=.22,lw=.8)
 axes[0].plot(x[9:],[statistics.mean(y[i-9:i+1]) for i in range(9,100)],color=color,lw=2,label=label+' (10-day mean)')
 cum=[statistics.mean(y[:i+1]) for i in range(100)];means.append(cum)
 axes[1].plot(x,cum,color=color,lw=2,label=label)
for day,offset in [(30,(5,14)),(60,(4,-17)),(100,(-20,14))]:
 delta=(means[1][day-1]/means[0][day-1]-1)*100
 axes[1].plot(day,means[1][day-1],'o',color=colors[1],ms=4)
 axes[1].annotate(f'd{day}: {delta:+.1f}%',(day,means[1][day-1]),xytext=(day+offset[0],means[1][day-1]+offset[1]),fontsize=9,arrowprops={'arrowstyle':'-','color':'#94a3b8'},color='#b91c1c' if delta>0 else '#334155')
axes[0].set_ylabel('CPU seconds / day');axes[0].set_title('Daily CPU (faint) and trailing 10-day mean',loc='left',fontsize=11)
axes[1].set_ylabel('Cumulative mean CPU sec / day');axes[1].set_xlabel('Game day');axes[1].set_title('One paired world per arm; observed change is not an independent daily replication',loc='left',fontsize=10)
for ax in axes:
 ax.grid(axis='y',color='#e2e8f0',lw=.7);ax.set_ylim(bottom=0);ax.legend(frameon=False,loc='upper left');ax.set_xlim(1,103)
fig.suptitle('T1411: same ON model, original vs candidate (seed 1020)',fontsize=14,x=.08,ha='left')
fig.text(.08,.925,'NPC cap: unlimited | 100/100 economic + village fingerprints match | start/restart CPU included',fontsize=9,color='#475569')
fig.text(.08,.015,'OS CPU = user + system time. Both runs unprofiled; candidate daily census is included. All shown days precede the environment interruption.',fontsize=8,color='#475569')
fig.subplots_adjust(left=.10,right=.97,top=.87,bottom=.10,hspace=.30)
fig.savefig(D/'matched100-cpu.png',dpi=170)
fig.savefig(D/'matched100-cpu.svg',metadata={'Date':None})
