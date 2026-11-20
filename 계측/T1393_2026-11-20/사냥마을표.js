// 사냥 마을 낱 표: node vil.js <seed>
const fs=require('fs');const S=process.argv[2];const D='/tmp/t1393/runs';
const ld=f=>fs.existsSync(f)?fs.readFileSync(f,'utf8').trim().split('\n').map(JSON.parse).filter(r=>!r.zone&&!r.err):null;
const O=fs.readFileSync(`/tmp/t1393/t59/off-${S}.probe.jsonl`,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.zone&&r.vil);
const hs={};let n=0;for(const r of O){if(r.d<50)continue;n++;for(const v of r.vil)hs[v[0]]=(hs[v[0]]||0)+v[10];}
const HV=Object.keys(hs).filter(k=>hs[k]/n>=1);
const at=(L,d)=>L.find(r=>r.d===d)||L[L.length-1];
const R={};for(const t of ['off','body','on']){const L=ld(`${D}/${t}-${S}.probe.jsonl`);if(L)R[t]=L;}
const rows=[];
for(const name of HV){const row=[name,(hs[name]/n).toFixed(1)];
 for(const t of ['off','body','on']){if(!R[t]){row.push('-');continue;}const g=d=>{const v=at(R[t],d).vil.find(x=>x[0]===name);return v||[name,0,0,0,0,0];};
  row.push(`${g(100)[1]}→${g(400)[1]} h${g(50)[2]}/${g(400)[2]} fd${g(400)[4]} got${g(400)[5]}`);}
 rows.push(row.join(' | '));}
console.log('사냥 마을',HV.length);console.log(rows.join('\n'));
