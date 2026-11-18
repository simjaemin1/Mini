'use strict';
// 디버그 걸이(커밋 안 함) — 광산 마을 날 줄(10날마다): 인구 · 식량 환산 · 원석 · 광부 · 굶어 죽음 · 곳간 칸 합 · 금속
const path=require('path'),fs=require('fs');if(!(process.env.T577_SEED&&/server[\/\\]zone\.js$/.test(process.argv[1]||'')))return;
const OUT=process.env.MV_OUT;const ROOT=process.env.MV_ROOT;const E=require(path.join(ROOT,'sim','economy-sim'));
const rows=[];const _t=E.tickVillage;
E.tickVillage=function(v,day){const r=_t.apply(this,arguments);try{if(day%5===0&&/^광산[13]$/.test(v.name)){const s=v.storage||{};let tot=0;for(const k in s)if(typeof s[k]==='number')tot+=s[k];
rows.push([day,v.name,(v.npcs||[]).length,+(E.totalFoodEquivalent(v)).toFixed(1),+((s.ore||0)+(s.copper_ore||0)+(s.tin_ore||0)).toFixed(1),(v.counts&&v.counts.miner)||0,(v.counts&&v.counts.farmer)||0,(v.counts&&v.counts.forager)||0,v._fdDeadTot||0,+tot.toFixed(0),+(v._oreOutLast||0).toFixed(2),JSON.stringify(Object.fromEntries(Object.entries(s).filter(([k,x])=>typeof x==='number'&&x>20).map(([k,x])=>[k,Math.round(x)])))]);
if(day%50===0)fs.writeFileSync(OUT,JSON.stringify(rows));}}catch(e){}return r;};
process.on('exit',()=>{try{fs.writeFileSync(OUT,JSON.stringify(rows))}catch(e){}});
