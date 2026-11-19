// 몸 세계(긴 판 seg-*.t1276.json) ↔ 판 시계 후보(sbc-<s>.json rows) 날 줄
const fs=require('fs'),path=require('path');
const [,,seed,candDir,...dl]=process.argv; const days=dl.length?dl.map(Number):[50,100,150,200,250,300,325,350,365,400];
const B=`/tmp/t1308/t1326-body-${seed}`; const rows=[];let cols=null;
for (const f of fs.readdirSync(B).filter(f=>/^seg-\d+\.t1276\.json$/.test(f))) { const o=JSON.parse(fs.readFileSync(path.join(B,f))); cols=o.cols; rows.push(...o.rows); }
const by=new Map(rows.map(r=>[r[0],r])); const C=n=>cols.indexOf(n);
// 겨울 굶어 죽음 누계 — fdDead 칸(날마다 누계인지 그날인지 모름 → 둘 다)
const cand=JSON.parse(fs.readFileSync(path.join(candDir,`sbc-${seed}.json`))); const cby=new Map(cand.rows.map(r=>[r[0],r]));
const fd=JSON.parse(fs.readFileSync(path.join(candDir,`sbc-${seed}.fd-deaths.json`))); const fdc=new Map(); for (const [d,n] of fd.rows) fdc.set(d,n);
console.log('| 날 | 몸 세계 인구 · 빈 · 거둔 칸 · 굶어 죽음 | 판 시계 후보 인구 · 빈 · 굶어 죽음(누계) | 인구 차 |');console.log('|---|---|---|---|');
for (const d of days){ const r=by.get(d), c=cby.get(d); const bp=r?r[C('pop')]:null; const cp=c?c[1].reduce((a,b)=>a+b,0):null; const ce=c?c[1].filter(x=>x===0).length:null;
 console.log(`| ${d} | ${r?`${bp} · ${51-r[C('vils')]} · ${r[C('cells')]} · ${r[C('fdDead')]}`:'—'} | ${c?`${cp} · ${ce} · ${fdc.get(d)||0}`:'—'} | ${bp&&cp?((cp/bp-1)*100).toFixed(1)+'%':'—'} |`); }
