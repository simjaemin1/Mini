const fs=require('fs');const {rd,flows,sum}=require('./an.js');
const runs=process.argv.slice(2);
const row=(t)=>{const L=rd(t+'.why.jsonl');const P=JSON.parse(fs.readFileSync(t+'.probe.json')).days.filter(d=>d.d>=1);const n=P.length;
 const a=flows(L,1,60), z=flows(L,1,400);const last=L[L.length-1];
 const cpu=P.reduce((x,d)=>x+d.cpuDayMs,0)/n, b=(P[n-1].w.cpuUs-P[0].w.cpuUs)/1e3/(n-1);
 const P2=P.filter(d=>d.d<=200), n2=P2.length, cpu2=P2.reduce((x,d)=>x+d.cpuDayMs,0)/n2, b2=(P2[n2-1].w.cpuUs-P2[0].w.cpuUs)/1e3/(n2-1);
 const pop60=sum((L.find(r=>r.d===60)||{}).pop);
 const sec=fs.existsSync(t+'.done')?JSON.parse(fs.readFileSync(t+'.done')).sec:null;
 return {t,end:sum(last.pop),empty:last.pop.filter(x=>!x).length,mean:z.popMean,pop60,hitH:a.hitH,hitO:a.hitO,restH:a.restH,meat:Math.round(a.meatU),got:a.got,born:a.born,wake:a.wake,sleep:a.sleep,
  fd:z.fd,emig:z.emig,cpu:Math.round(cpu),beast:Math.round(b),cpu200:Math.round(cpu2),beast200:Math.round(b2),sec,hE:last.hEall,hN:last.hN,hB:last.hB};};
const R=runs.map(row);console.log(Object.keys(R[0]).join('\t'));for(const r of R)console.log(Object.values(r).join('\t'));
