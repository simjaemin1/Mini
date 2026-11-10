'use strict';
// (@regress 없음 — 러너 밖 · T1251 판 DB 끝 상태 자 · 읽기만)
// === scripts/t1251-dbvil.js — 판 DB(`<판>-<시드>.db`) 끝 상태 — 마을마다 land.wood · 인구 · 나무꾼 · 곳간 목재 · 주거 · econ 식 몫(`_woodOutLast`) · 나무 칸 ===
//   쓰는 법: node scripts/t1251-dbvil.js <판 DB> [1]   → 첫 두 줄 = land.wood 0.5 밑 · 위 마을 합 · `1` 이면 마을마다 한 줄(JSON)
const D=require('better-sqlite3');
const db=new D(process.argv[2],{readonly:true});
const out=[];
for(const r of db.prepare('select name,econ_state from villages').all()){const e=JSON.parse(r.econ_state);
 out.push({n:r.name,lw:e.land&&e.land.wood,pop:(e.npcs||[]).length,lj:(e.counts||{}).lumberjack|0,st:Math.round((e.storage||{}).wood||0),h:Math.round(e.housing||0),D:+(e._woodOutLast||0).toFixed(2),cells:e._t325Cells|0});}
const poor=out.filter(o=>o.lw<0.5),rich=out.filter(o=>o.lw>=0.5);
const S=(a,k)=>a.reduce((s,o)=>s+(+o[k]||0),0);
for(const [nm,a] of [['land.wood<0.5',poor],['land.wood≥0.5',rich]])console.log(nm,'n',a.length,'pop',S(a,'pop'),'lj',S(a,'lj'),'D',S(a,'D').toFixed(1),'D/lj',(S(a,'D')/Math.max(1,S(a,'lj'))).toFixed(3),'st',S(a,'st'),'h',S(a,'h'));
if(process.argv[3])for(const o of out.sort((a,b)=>a.lw-b.lw))console.log(JSON.stringify(o));
