const fs=require('fs'),path=require('path');
function arr(dir){ const segs=fs.readdirSync(dir).filter(f=>/^seg-\d+\.log$/.test(f)).sort((a,b)=>+a.match(/\d+/)[0]-+b.match(/\d+/)[0]);
  const M=new Map(); for(const f of segs){ let day=+f.match(/\d+/)[0]; for(const l of fs.readFileSync(path.join(dir,f),'utf8').split('\n')){ const d=l.match(/마을 econ day (\d+):/); if(d){day=+d[1];continue;} const a=l.match(/캐러밴#(\d+) 도착:/); if(a){ const k=a[1]+(l.includes('귀환')?'':''); if(!M.has(k)) M.set(k,day);} const r=l.match(/캐러밴#(\d+) 귀환 완료/); if(r&&!M.has('r'+r[1])) M.set('r'+r[1],day);} }
  return M; }
const A=arr(process.argv[2]),B=arr(process.argv[3]); let both=0,diff=0,onlyA=0,onlyB=0,ex=[];
for(const [k,d] of A){ if(!B.has(k)){onlyA++;continue;} both++; if(B.get(k)!==d){diff++; if(ex.length<5) ex.push(k+':'+d+'→'+B.get(k));} }
for(const k of B.keys()) if(!A.has(k)) onlyB++;
console.log(`도착 · 귀환 완료 ${both}(둘 다) · 날 다름 ${diff} · A 에만 ${onlyA} · B 에만 ${onlyB} ${ex.join(' ')}`);
