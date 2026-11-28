const fs=require("fs");
const f=(t)=>{const J=JSON.parse(fs.readFileSync(t+".probe.json"));const D=J.days.filter(d=>d.d>=1);const n=D.length;
const cpu=D.reduce((a,d)=>a+d.cpuDayMs,0)/n,pop=D.reduce((a,d)=>a+d.pop,0)/n;const b=(D[n-1].w.cpuUs-D[0].w.cpuUs)/1000/(n-1);
const tk=(D[n-1].w.ticks-D[0].w.ticks)/(n-1);
const w61=D[n-1].w61; const sec=JSON.parse(fs.readFileSync(t+".done")).sec;
return {t,n,cpu:+cpu.toFixed(0),pop:+pop.toFixed(0),beast:+b.toFixed(0),rest:+(cpu-b).toFixed(0),usTick:+(b*1000/tk).toFixed(0),ticksDay:+tk.toFixed(2),endPop:D[n-1].pop,empty:D[n-1].empty,sec,w61:w61&&{wakers:w61.wakers,hits:w61.hits,outHits:w61.outHits,byKind:w61.byKind}}};
const A=process.argv.slice(2).map(f); const b=A[0];
for(const a of A) console.log(JSON.stringify(a), "zone x"+(a.cpu/b.cpu).toFixed(3), "beast x"+(a.beast/b.beast).toFixed(3), "rest x"+(a.rest/b.rest).toFixed(3));
