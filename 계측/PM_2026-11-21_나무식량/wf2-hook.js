const path=require('path'),fs=require('fs'); const ROOT='/tmp/wt-l63';
const V2=require(path.join(ROOT,'sim/economy-sim-v2')), E=require(path.join(ROOT,'sim/economy-sim'));
const orig=V2.tickWorldV2; let n=0; const seen=new WeakSet(); let woodTr=0, woodRows=0, famDays=0, vilDays=0, lj0Days=0;
const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y); return s.length?s[Math.min(s.length-1,Math.floor(p*s.length))]:0;};
V2.tickWorldV2=function(world){ const r=orig.apply(this,arguments); n++;
  const TL=world.tradeLog||[]; for(let i=TL.length-1;i>=0&&!seen.has(TL[i]);i--){ const t=TL[i]; seen.add(t); const its=[].concat(t.basket||(t.sent?[t.sent]:[]), t.retBasket||(t.bought?[t.bought]:[])); let w=0; for(const it of its) if(it&&it.res==='wood'&&it.amt>0) w+=it.amt; if(w>0){woodTr+=w; woodRows++;} }
  const live=world.villages.filter(v=>v.npcs&&v.npcs.length>0);
  for(const v of live){ vilDays++; if(E.totalFoodEquivalent(v)/v.npcs.length<30) famDays++; if(!((v.counts&&v.counts.lumberjack)>0)) lj0Days++; }
  if(n%100===0){ const wd=live.map(v=>v.storage.wood||0); const px=live.map(v=>(v._priceCache&&v._priceCache.wood)||NaN).filter(Number.isFinite);
    const lw=live.map(v=>v.land.wood||0);
    fs.appendFileSync('/tmp/l87/wf2.out',`[WF2] ~day ${n} · 지난 100날: 나무 교역 ${woodTr.toFixed(0)}단(${woodRows}건) · 식량 30날치 밑 마을-날 ${(100*famDays/vilDays).toFixed(0)}% · 나무꾼 0 마을-날 ${(100*lj0Days/vilDays).toFixed(0)}% | 지금: 나무 있는 마을 ${wd.filter(x=>x>=1).length} · 나무 값 중앙 ${px.length?q(px,.5).toFixed(2):'?'} (최저 ${px.length?Math.min(...px).toFixed(2):'?'} · 최고 ${px.length?Math.max(...px).toFixed(2):'?'}) · 숲 값 중앙 ${q(lw,.5).toFixed(2)} (0.3 밑 ${lw.filter(x=>x<0.3).length}곳)\n`);
    woodTr=0; woodRows=0; famDays=0; vilDays=0; lj0Days=0; }
  return r; };
