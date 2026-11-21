// node sum.js <t1408.json>... — 두 해 요약: pop365 · pop730 · 빈 마을 · fd 해마다 · K · 농부 몫 여름/겨울(2년)
for(const f of process.argv.slice(2)){const r=require(f);const C=r.cols,I=c=>C.indexOf(c);const w=r.w;const d0=w[0][0];
const nV=new Set(r.rows.map(x=>x[1])).size;const at=n=>{let b=null;for(const x of w)if(x[0]-d0<=n)b=x;return b;};
const fdY=[0,0,0,0];for(const x of w){const y=Math.floor((x[0]-d0)/365);if(y<4)fdY[y]+=x[3];}
const S={s:[6,7,8],w:[12,1,2]};const sh=(yr)=>{const a={s:[0,0],w:[0,0]};for(const x of r.rows){const ym=x[0],y=Math.floor(ym/100),m=ym%100;const yy=m<=2?y-1:y;const k=S.s.includes(m)?'s':S.w.includes(m)?'w':null;if(!k)continue;a[k].push([yy,x[I('j_farmer')],x[I('pop')]*x[I('days')]]);}
 const ys=[...new Set(a.s.slice(2).map(z=>z[0]))].sort();const y=ys[yr-1];const g=k=>{let fa=0,pd=0;for(const z of a[k].slice(2))if(z[0]===y){fa+=z[1];pd+=z[2];}return pd?(fa/pd).toFixed(2):'-';};return g('s')+'/'+g('w');};
const out=[f.split('/').slice(-2,-1)[0]];for(const n of [365,730,1095,1459]){const b=at(n);if(b&&b[0]-d0>=n-2)out.push(`${n}:${b[1]}(빈${nV-b[2]})`);}
const L=w[w.length-1];out.push('끝날'+(L[0]-d0),'fd '+fdY.filter((x,i)=>i<=Math.floor((L[0]-d0)/365)).join('/'),'K '+L[5].toFixed(0),'농부 여/겨 1년 '+sh(1)+' 2년 '+sh(2));console.log(out.join(' · '));}
