// === scripts/t463-charcoal-flow.js — 숯이 캐러밴으로 어디서 어디로 갔나 (T463 · 계측기 · 러너 밖 · 제품 무접촉) ==========
//   쓰는 법: `T443_SMELT_FUEL=1 T452_KILN_ACT=1 DIAG_JSON=<경로> node -r ./scripts/t443-smelt-probe.js -r ./scripts/t463-charcoal-flow.js scripts/t17-metrics.js 800 <seed>`
//   세는 것: 출발 화물(`giveRes`·`giveRes2`)과 귀환 화물(`_returningRes`) 중 숯 — 캐러밴 id 당 한 번 · 100일마다 마을별 숯 재고·원석·숯 값 표본.
//   세계는 읽기만 한다(값 표본은 `computeShadowPrices` 를 한 번 더 부를 뿐 — 두 팔에 똑같이 걸어 견준다 · 끔 동일 판은 이 계측기 없이 잰다).
'use strict';
// T463 계측기(러너 밖 · 제품 무접촉): 숯이 캐러밴으로 어디서 어디로 얼마나 갔나 — 출발 화물(give·give2)과 귀환 화물(_returningRes) 전부.
const path=require('path'),fs=require('fs');
const R=process.cwd();
const V2=require(path.join(R,'sim','economy-sim-v2.js'));
const orig=V2.tickWorldV2; let day=0; const seenOut=new Set(), seenRet=new Set(); const flows=[]; const snaps=[];
V2.tickWorldV2=function(w){ const r=orig.apply(this,arguments); day++;
 for(const c of (w.caravans||[])){
   if(!seenOut.has(c.id)){ seenOut.add(c.id);
     if(c.giveRes==='charcoal') flows.push({d:day,kind:'out',from:c.from.name,to:c.to.name,u:+c.giveAmt.toFixed(2)});
     if(c.giveRes2==='charcoal') flows.push({d:day,kind:'out2',from:c.from.name,to:c.to.name,u:+c.giveAmt2.toFixed(2)}); }
   if(c._returningRes==='charcoal' && c._returningAmt>0 && !seenRet.has(c.id)){ seenRet.add(c.id); flows.push({d:day,kind:'ret',from:c.to.name,to:c.from.name,u:+c._returningAmt.toFixed(2)}); }
 }
 if(day%100===0){ const rows=[]; for(const v of w.villages){ if(!v.npcs||!v.npcs.length) continue; const p=V2.computeShadowPrices(v);
   rows.push({n:v.name,N:v.npcs.length,kiln:v._kiln?1:0,sm:(v._smeltedTotal||0)>0?1:0,ch:+(v.storage.charcoal||0).toFixed(1),ore:+(v.storage.ore||0).toFixed(1),p:+(p.charcoal||0).toFixed(2)}); }
   snaps.push({day,rows}); }
 return r;};
process.on('exit',()=>{ if(process.env.DIAG_JSON) fs.writeFileSync(process.env.DIAG_JSON,JSON.stringify({flows,snaps})); });
