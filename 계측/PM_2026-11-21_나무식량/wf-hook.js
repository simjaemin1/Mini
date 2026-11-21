// 날 100·200·300·400·600·800 에 세계의 나무 · 식량 사정을 한 줄씩(계측만 · 세계 무접촉)
const path=require('path'); const ROOT='/tmp/wt-l63';
const V2=require(path.join(ROOT,'sim/economy-sim-v2')), E=require(path.join(ROOT,'sim/economy-sim'));
const orig=V2.tickWorldV2; const MARK=new Set([100,200,300,400,600,800]); let _n=0;
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y); return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0;};
V2.tickWorldV2=function(world){ const r=orig.apply(this,arguments); const d=++_n; if(_n<=2) console.error("[WF] hook alive day", world.day);
  if(MARK.has(d)){ const live=world.villages.filter(v=>v.npcs&&v.npcs.length>0);
    const pop=live.reduce((s,v)=>s+v.npcs.length,0);
    const fd=live.map(v=>E.totalFoodEquivalent(v)/v.npcs.length), wd=live.map(v=>(v.storage.wood||0)), wpc=live.map(v=>(v.storage.wood||0)/v.npcs.length);
    const cnt=(k)=>live.reduce((s,v)=>s+((v.counts&&v.counts[k])||0),0);
    const b=(lo,hi)=>fd.filter(x=>x>=lo&&x<hi).length;
    require("fs").appendFileSync("/tmp/l87/wf.out", `[WF] day ${d} · 마을 ${live.length} · 인구 ${pop} · 식량 날치 중앙 ${q(fd,.5).toFixed(0)} (10밑 ${b(0,10)} · 10~30 ${b(10,30)} · 30~60 ${b(30,60)} · 60위 ${b(60,1e9)}) · 곳간 나무 0~1 마을 ${wd.filter(x=>x<1).length} · 나무 중앙 ${q(wd,.5).toFixed(0)} · 1인당 중앙 ${q(wpc,.5).toFixed(2)} · 나무 합 ${wd.reduce((a,b)=>a+b,0).toFixed(0)} · 농부 ${cnt('farmer')} 나무꾼 ${cnt('lumberjack')} 사냥 ${cnt('hunter')} 어부 ${cnt('fisher')} 채집 ${cnt("forager")}\n`);
  } return r; };
