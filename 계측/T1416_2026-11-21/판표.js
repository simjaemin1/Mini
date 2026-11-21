// 판표.js <판 폴더> — 100날 판 표(씨 × 판) · 날 줄(scripts/t1416-probe.js)에서 · T1416 계측(러너 밖)
// table.js — 100날 판 표(씨 × 판) · 날 줄(t1416-probe)에서
const fs=require('fs'),path=require('path');const D=process.argv[2];const Kc=require(path.join(__dirname,'..','..','server','kcal'));const U1=Kc.econUnitsOf('meat_game',1);
const out=[];
for(const seed of [1020,7,42])for(const tag of ['off','on','all']){
  const f=path.join(D,`x-${tag}-${seed}.p16.jsonl`);if(!fs.existsSync(f)){out.push({seed,tag,missing:true});continue;}
  const L=fs.readFileSync(f,'utf8').trim().split('\n').map(x=>JSON.parse(x)).filter(x=>x.d>0);const last=L[L.length-1];
  const meatKg=(a,b)=>{const s=L.filter(x=>x.d>=a&&x.d<=b);return s.length?+(s.reduce((p,x)=>p+x.meat,0)/U1/s.length).toFixed(1):null;};
  const p50=L.map(x=>x.tick.p50).filter(x=>x!=null).sort((a,b)=>a-b),p99=L.map(x=>x.tick.p99).filter(x=>x!=null),mx=L.map(x=>x.tick.max).filter(x=>x!=null);
  const ch=last.chase||{},t=last.t16||{},c=last.c16||{};
  let done={};try{done=JSON.parse(fs.readFileSync(path.join(D,`x-${tag}-${seed}.done`),'utf8'));}catch(e){}
  const cpu=(last.cpu-(L[0].cpu))/1e6/(last.d-L[0].d);
  out.push({seed,tag,days:last.d,pop:last.pop,hun:last.hun,meat_1_25:meatKg(1,25),meat_50_100:meatKg(50,100),meat_all:meatKg(1,100),kills:ch.hunt||0,
    carryKg:last.carryKg,trips:c.trips||0,leftKg:t.leftKg,cacheKg:t.cacheKg,fetchKg:t.fetchKg,lost:t.lostCarc,
    tickP50:p50.length?p50[Math.floor(p50.length/2)]:null,tickP99:p99.length?Math.max(...p99):null,tickMax:mx.length?Math.max(...mx):null,ticks:L.reduce((p,x)=>p+(x.tick.n||0),0),
    awakeMean:ch.awakeN?+(ch.awakeSum/ch.awakeN).toFixed(1):null,awakePeak:ch.awakePeak,wakeN:t.wakeN,wakeP50:t.wakeP50,wakeP99:t.wakeP99,wakeMax:t.wakeMax,scanMax:ch.scanMax,
    unitSteps:t.unitSteps,wallHit:t.wallHit,cross:t.cross,cpuSday:+cpu.toFixed(2),sec:done.sec,mismatch:last.body?last.body.mismatch:null});
}
console.log(JSON.stringify(out,null,0).replace(/\},\{/g,'},\n{'));
