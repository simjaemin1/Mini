const fs=require('fs');const P=JSON.parse(fs.readFileSync(process.argv[2]));
const byId=new Map(P.nodes.map(n=>[n.id,n]));const self=new Map();
const dt=P.timeDeltas;const cnt=new Map();for(let i=0;i<P.samples.length;i++){cnt.set(P.samples[i],(cnt.get(P.samples[i])||0)+(dt[i]||0));}
const parent=new Map();for(const n of P.nodes)for(const c of (n.children||[]))parent.set(c,n.id);
const key=n=>`${n.callFrame.functionName||'(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber+1}`;
const selfT=new Map(),totT=new Map();let total=0;
for(const [id,t] of cnt){total+=t;const n=byId.get(id);const k=key(n);selfT.set(k,(selfT.get(k)||0)+t);
 const seen=new Set();let x=id;while(x!=null){const kk=key(byId.get(x));if(!seen.has(kk)){seen.add(kk);totT.set(kk,(totT.get(kk)||0)+t);}x=parent.get(x);} }
const f=(m,N)=>[...m].sort((a,b)=>b[1]-a[1]).slice(0,N).map(([k,t])=>(100*t/total).toFixed(1).padStart(5)+'% '+k);
console.log('total s',(total/1e6).toFixed(1));console.log('--self');console.log(f(selfT,int(process.argv[3]||30)).join('\n'));console.log('--total');console.log(f(totT,int(process.argv[4]||40)).join('\n'));
function int(x){return parseInt(x,10);}
