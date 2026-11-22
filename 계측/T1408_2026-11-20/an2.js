// 첫 해 진단: node an2.js <dir> <tag>
const fs=require('fs');const [,,D,T]=process.argv;const CAL=require('/tmp/t1408wt/server/calendar');
const o=JSON.parse(fs.readFileSync(`${D}/${T}.t1388.json`));const C=o.cols,I=c=>C.indexOf(c);
const yr=(lo,hi)=>{const s={};let eat=0;for(const r of o.rows){if(r[0]<lo||r[0]>hi)continue;eat+=r[I('eat')];for(const k of o.src){s[k]=(s[k]||0)+(r[I('e_'+k)]||0);}}return [eat,Object.fromEntries(Object.entries(s).map(([k,v])=>[k,+(v/eat*100).toFixed(1)]))];};
console.log('첫 해(3월~2월) 먹은 몫 %',JSON.stringify(yr(103,202)));
console.log('첫 거둠 앞(3~7월)',JSON.stringify(yr(103,107)));
console.log('둘째 해',JSON.stringify(yr(203,302)));
const t=JSON.parse(fs.readFileSync(`${D}/${T}.t1374.json`));const w=t.w;
for(const d of [1,60,120,150,180,210,240,270,300,330,365,400,455,500,550,600,640,700,730]){const x=w.find(r=>r[0]===d);if(x){const dt=CAL.dateOf(d);console.log(d,`${dt.year}-${dt.month}`,'pop',x[1],'vils',x[2],'fd',x[3],'tfe',x[4].toFixed(0),'days',(x[4]/x[1]).toFixed(0));}}
const R=JSON.parse(fs.readFileSync(`${D}/${T}.json`));const rows=R.rows;const nm=R.names;const first={};
for(const [d,p] of rows)p.forEach((x,i)=>{if(x===0&&first[nm[i]]==null)first[nm[i]]=d;});
const byM={};for(const [n,d] of Object.entries(first)){const dt=CAL.dateOf(d);const k=`${dt.year}-${dt.month}`;byM[k]=(byM[k]||0)+1;}console.log('빈 마을 처음 난 달',JSON.stringify(byM));
