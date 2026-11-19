// 사냥 마을(끔 판 날 50 ~ 400 econ 사냥꾼 평균 ≥ 1) 인구 · 사냥꾼 · 고기 — node hv.js <runs> <off표지> <켬표지…>
const fs=require('fs');const [,,D,off,...arms]=process.argv;
const load=t=>fs.readFileSync(`${D}/${t}.probe.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l));
const O=load(off);const hs={};let n=0;for(const r of O){if(r.d<50)continue;n++;for(const v of r.vil)hs[v[0]]=(hs[v[0]]||0)+v[10];}
const HV=new Set(Object.keys(hs).filter(k=>hs[k]/n>=1));
const sum=(rs,d,f)=>{const r=rs.find(x=>x.d===d)||rs[rs.length-1];let a=0;for(const v of r.vil)if(HV.has(v[0]))a+=f(v);return [r.d,a];};
const meatAvg=rs=>{const q=rs.filter(r=>r.d>=50);return q.reduce((a,r)=>a+(r.meat||0),0)/Math.max(1,q.length);};
console.log('사냥 마을',HV.size,[...HV].join(','));
for(const t of [off,...arms]){const R=load(t);const p=sum(R,400,v=>v[11]),h=sum(R,400,v=>v[10]),pa=sum(R,400,()=>0);const last=R[R.length-1];
 console.log(t,`날 ${p[0]} 사냥 마을 인구 ${p[1]} · 사냥꾼 ${h[1]} · 세계 인구 ${last.pop} · 고기 평균 ${meatAvg(R).toFixed(1)}`);}
