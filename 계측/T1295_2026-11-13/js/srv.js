// 서버 판 자 표 — node srv.js <디렉터리> <판,…> [시드] [날,…] ⇒ <디렉터리>/<판>-<시드>/<판>-<시드>.t1276.json · .t1243.json · run.log (이 폴더의 srv-*.gz 도 읽는다)
// 서버 판 자 표 — /tmp/t1295/srv/<판>-<시드>/<판>-<시드>.t1276.json
const fs=require('fs'),z=require('zlib');const D=process.argv[2],arms=process.argv[3].split(','),seeds=(process.argv[4]||'1020,7,42').split(','),days=(process.argv[5]||'100,200,400').split(',').map(Number);
const J=f=>{for(const g of [f,f+'.gz']){try{const b=fs.readFileSync(g);return JSON.parse((g.endsWith('.gz')?z.gunzipSync(b):b).toString())}catch(e){}}return null};
const nf=x=>x==null?'—':Math.round(x).toLocaleString('en-US');
console.log('| 판 · 시드 | '+days.map(d=>`날 ${d} 인구 · 빈 마을 · 거둔 칸(곳간)`).join(' | ')+' | 굶어 죽음(산 마을 관찰) | 죽음 누계(판 자) |');
console.log('|---|'+days.map(()=>'---').join('|')+'|---:|---:|');
const tot={};
for(const a of arms)for(const s of seeds){const o=J(`${D}/${a}-${s}/${a}-${s}.t1276.json`)||J(`${D}/srv-${a}-${s}.t1276.json`);if(!o){console.log(`| ${a} · ${s} | 자료 없음 |`);continue}
 const C=o.cols,g0=(r,k)=>r[C.indexOf(k)];const at=d=>o.rows.find(r=>r[0]===d)||o.rows[o.rows.length-1];const q=J(`${D}/${a}-${s}/${a}-${s}.t1243.json`)||J(`${D}/srv-${a}-${s}.t1243.json`);const hv=d=>{if(!q)return null;const r=q.rows.find(r=>r[0]===d)||q.rows[q.rows.length-1];return r[q.cols.indexOf('harvN')]};const g=(r,k)=>k==='harvN'?hv(r[0]):g0(r,k);
 const cells=days.map(d=>{const r=at(d);return `${nf(g(r,'pop'))} · ${51-g(r,'vils')} · ${nf(g(r,'harvN'))}`});const L=o.rows[o.rows.length-1];
 const T=tot[a]||(tot[a]={pop:0,empty:0,harv:0,fd:0,dead:0});T.pop+=g(L,'pop');T.empty+=51-g(L,'vils');T.harv+=g(L,'harvN');T.fd+=g(L,'fdDead');
 let dt=null;try{const lg=fs.readFileSync(`${D}/${a}-${s}/run.log`,'utf8').split('\n').find(l=>l.startsWith('| ')&&l.split('|')[2].trim()===s&&l.split('|').length>18);if(lg)dt=+lg.split('|')[16].trim()}catch(e){}
 T.deadAll=(T.deadAll||0)+(dt||0);
 console.log(`| ${a} · ${s} | ${cells.join(' | ')} | ${nf(g(L,'fdDead'))} | ${nf(dt)} |`);}
console.log('\n| 판 | 인구(400 · 3시드 합) | 빈 마을 | 거둔 칸(곳간 수확 건수) | 굶어 죽음 | 죽음 전부 |\n|---|---:|---:|---:|---:|---:|');
for(const [a,T] of Object.entries(tot))console.log(`| ${a} | ${nf(T.pop)} | ${T.empty} | ${nf(T.harv)} | ${nf(T.fd)} | ${nf(T.deadAll)} |`);
