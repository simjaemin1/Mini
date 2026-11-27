// T1494 · 같은 판을 400날 · 730날에 잘라 켬 ÷ 끔 (시드 셋 합). 쓰기: node scripts/t1494-cut400.js off on only-famine …
const fs=require('fs'),zlib=require('zlib'),R='계측/T1494_2026-11-26/runs/';
const sum=a=>a.reduce((x,y)=>x+y,0);
for (const cut of [400,730]) { const T={}; const ARMS=process.argv.slice(2);
 for (const arm of ARMS) { let pop=0,pd=0,b=0,fd=0;
  for (const s of [1020,7,42]) { const o=JSON.parse(zlib.gunzipSync(fs.readFileSync(R+`obs-${arm}-${s}.json.gz`)));
   const D=Math.min(cut+1,o.day.length); pop+=sum(o.n[D-1]);
   for(let d=1;d<D;d++){pd+=sum(o.n[d]);b+=sum(o.b[d].map(x=>x||0));}
   fd+=sum(o.fd[D-1])-sum(o.fd[0]); }
  T[arm]={pop,bPm:1000*b/pd,fdPm:1000*fd/pd}; }
 for(const a of ARMS) console.log(cut,a,T[a].pop,"pop",(T[a].pop/T.off.pop).toFixed(3),"b",(T[a].bPm/T.off.bPm).toFixed(3),"fd",(T[a].fdPm/T.off.fdPm).toFixed(3)); }
