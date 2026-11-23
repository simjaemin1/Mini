// 두 해 표: node an4.js <dir> <tag>
const fs=require('fs');const [,,D,T]=process.argv;
const r=JSON.parse(fs.readFileSync(`${D}/${T}.t1408.json`));const C=r.cols,I=c=>C.indexOf(c);
const G=new Map();for(const x of r.rows){const k=x[0]+'|'+x[1];const g=G.get(k);if(!g){G.set(k,x.slice());continue;}for(let i=2;i<C.length;i++){const c=C[i];if(c==='pop')g[i]=x[i];else if(c==='popMin'||c==='fdaysMin')g[i]=Math.min(g[i],x[i]);else if(c==='popMax')g[i]=Math.max(g[i],x[i]);else g[i]+=x[i];}}
const by={};for(const x of G.values()){const ym=x[0],d=x[I('days')];const o=by[ym]||(by[ym]={pop:0,farm:0,fd:0,born:0,fdw:0,emp:0});o.pop+=x[I('pop')];o.farm+=x[I('j_farmer')]/d;o.fd+=x[I('fd')];o.born+=x[I('born')];o.fdw+=x[I('fdays')]/d*x[I('pop')];if(x[I('pop')]===0)o.emp++;}
const yms=Object.keys(by).sort();const out={};
for(const ym of yms){const o=by[ym];out[ym]={pop:o.pop,farmShare:+(o.farm/Math.max(1,o.pop)).toFixed(2),fdays:+(o.fdw/Math.max(1,o.pop)).toFixed(0),fd:o.fd,born:o.born,emp:o.emp};}
const R=JSON.parse(fs.readFileSync(`${D}/${T}.json`));const rows=R.rows;const last=rows[rows.length-1][1].slice().sort((a,b)=>a-b);const live=last.filter(x=>x>0);
const med=live.length?live[Math.floor(live.length/2)]:0;const top5=last.slice(-5).reverse();
const F=JSON.parse(fs.readFileSync(`${D}/${T}.fd-deaths.json`)).rows;const fdAt=d=>(F.find(x=>x[0]===d)||F[F.length-1])[1];
const ys=[];for(let y=1;y*365<=rows[rows.length-1][0]+1;y++)ys.push(fdAt(y*365)-fdAt((y-1)*365||1));
const popAt=d=>{const x=rows.find(z=>z[0]===d)||rows[rows.length-1];return [x[1].reduce((a,b)=>a+b,0),x[1].filter(z=>z===0).length];};
console.log(JSON.stringify({tag:T,days:rows[rows.length-1][0],p365:popAt(365),p730:popAt(730),pEnd:popAt(rows[rows.length-1][0]),fdYears:ys,median:med,top5,months:out}));
