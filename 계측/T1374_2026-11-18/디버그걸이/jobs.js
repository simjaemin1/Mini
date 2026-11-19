'use strict';
// 디버그 걸이(커밋 안 함) — 30날마다 econ 직업 합 · 기근 블록 안 마을 수
const path=require('path'),fs=require('fs');if(!(process.env.T577_SEED&&/server[\/\\]zone\.js$/.test(process.argv[1]||'')))return;
const E=require(path.join(process.env.JOBS_ROOT,'sim','economy-sim'));const OUT=process.env.JOBS_OUT;const rows=[];let cur=-1,acc=null;
const _t=E.tickVillage;E.tickVillage=function(v,day){const r=_t.apply(this,arguments);try{if(day!==cur){if(acc&&cur%15===0)rows.push(acc);cur=day;acc={day,jobs:{},pop:0,famine:0,tfe:0};}
const n=(v.npcs||[]).length;acc.pop+=n;for(const p of v.npcs||[]){const j=p.currentJob||'none';acc.jobs[j]=(acc.jobs[j]||0)+1;}const t=E.totalFoodEquivalent(v);acc.tfe+=t;if(n&&t<n*30)acc.famine++;
if(day%30===0)fs.writeFileSync(OUT,JSON.stringify(rows));}catch(e){}return r;};process.on('exit',()=>{try{fs.writeFileSync(OUT,JSON.stringify(rows))}catch(e){}});
