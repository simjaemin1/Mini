// 몸 세계(seg-*.t1351/t1276) ↔ 판 시계 F(<arm>-<seed>.t1351/t1276) 날 줄
const fs=require('fs'),path=require('path');
const [,,seed,arm,...dl]=process.argv; const days=dl.length?dl.map(Number):[25,50,75,100,150,200,250,300,350,400];
function load(dir,re){let rows=[],cols=null;for(const f of fs.readdirSync(dir).filter(f=>re.test(f))){const o=JSON.parse(fs.readFileSync(path.join(dir,f)));cols=cols&&cols.length>=o.cols.length?cols:o.cols;for(const r of o.rows){const m={};o.cols.forEach((c,i)=>m[c]=r[i]);rows.push(m);}}return new Map(rows.map(m=>[m.day,m]));}
const B=`/tmp/t1351/body-${seed}`, F=`/tmp/t1351/srv/${arm||'F'}-${seed}`;
const b51=load(B,/^seg-\d+\.t1351\.json$/), b76=load(B,/^seg-\d+\.t1276\.json$/), f51=load(F,/\.t1351\.json$/), f76=load(F,/\.t1276\.json$/);
const K=[['pop','pop',51],['houses','houses',51],['stall','stall',51],['bodyKg','bodyKg',51],['bodySw','bodySw',51],['tfe','tfe',51],['fdDead','fdDead',76],['terr','terr',51]];
console.log('| 날 | '+K.map(k=>k[0]+' 몸 : 판').join(' | ')+' |');console.log('|---|'+K.map(()=>'---').join('|')+'|');
for(const d of days){const bm={51:b51.get(d),76:b76.get(d)},fm={51:f51.get(d),76:f76.get(d)};if(!bm[51]&&!bm[76])continue;
 console.log(`| ${d} | `+K.map(([n,c,src])=>{const x=bm[src]&&bm[src][c],y=fm[src]&&fm[src][c];const f=v=>v==null?'—':Math.round(v);return `${f(x)} : ${f(y)}`;}).join(' | ')+' |');}
