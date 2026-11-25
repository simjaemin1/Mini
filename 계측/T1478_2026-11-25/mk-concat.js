// usage: node mk-concat.js out.log chunk1.log chunk2.log ...  — 조각 로그를 한 판 로그로 잇는다(요약 줄은 합쳐 한 번만)
const fs=require('fs');const [out,...ch]=process.argv.slice(2);
let body='',P=[],F=[],H=[],wall=0,rc=0;
for(const f of ch){const t=fs.readFileSync(f,'utf8');const m=/^=== .*요약 ===$/m.exec(t);const i=m?m.index:t.length;
 body+=t.slice(0,i).replace(/\n*$/,'\n');const s=t.slice(i);
 const g=(k)=>{const r=new RegExp('^  '+k+' \\d+: (.*)$','m').exec(s);return r?r[1].split(' ').filter(Boolean):[]};
 P.push(...g('통과'));F.push(...g('실패'));H.push(...g('유보'));
 const w=/^rc=(\d+) 벽 (\d+)초/m.exec(s);if(w){wall+=+w[2];rc=Math.max(rc,+w[1]);}}
body+='\n=== 판 요약(조각 '+ch.length+'개를 이음 · T1478) ===\n';
body+=`  통과 ${P.length}: ${P.join(' ')}\n  실패 ${F.length}: ${F.join(' ')}\n`;
if(H.length)body+=`  유보 ${H.length}: ${H.join(' ')}\n`;
body+=`rc=${rc} 벽 ${wall}초\n`;fs.writeFileSync(out,body);
