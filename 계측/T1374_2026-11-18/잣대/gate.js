// 문 표: node gate.js <arm> <seed...> — 날 365 · 400 · 730 · 800 인구 · 빈 마을 · 해마다 굶어 죽음(마을-달 fd 합 · 해 = 3월~2월)
const fs=require('fs');const [,,arm,...seeds]=process.argv;
for(const s of seeds){const f=`/tmp/t1374/srv/${arm}-${s}/${arm}-${s}.t1374.json`;if(!fs.existsSync(f)){console.log(arm,s,'없음');continue;}const o=JSON.parse(fs.readFileSync(f));
 const W=new Map(o.w.map(r=>[r[0],r]));const at=d=>{const r=W.get(d);return r?`${r[1]}/${51-r[2]}`:'—'};
 const I=o.cols.indexOf('fd');const yr={};const win={};const sownW={};const Is=o.cols.indexOf('sown'),Ii=o.cols.indexOf('inF'),Ib=o.cols.indexOf('byIn');
 for(const r of o.rows){const y=Math.floor(r[0]/100),m=r[0]%100;const sy=m<=2?y-1:y;yr[sy]=(yr[sy]||0)+(r[I]||0);if(m===12||m<=2){win[sy]=(win[sy]||0)+(r[Is]||0);sownW['in'+sy]=(sownW['in'+sy]||0)+(r[Ii]||0)+(r[Ib]||0);}}
 const last=o.w[o.w.length-1];
 console.log(`${arm}-${s} 날365 ${at(365)} · 400 ${at(400)} · 730 ${at(730)} · 800 ${at(800)} · 끝 ${last[0]}:${last[1]}/${51-last[2]} · 해마다 굶음 ${JSON.stringify(yr)} · 겨울 심은 칸 ${JSON.stringify(win)} · 겨울 곳간 든 ${JSON.stringify(sownW)}`);}
