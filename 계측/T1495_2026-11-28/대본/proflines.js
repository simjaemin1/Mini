const fs=require('fs');const P=JSON.parse(fs.readFileSync(process.argv[2]));const fn=process.argv[3];
const L=new Map();let tot=0;
for(const n of P.nodes){ if((n.callFrame.functionName||'')!==fn) continue; for(const pt of (n.positionTicks||[])){L.set(pt.line,(L.get(pt.line)||0)+pt.ticks);tot+=pt.ticks;} }
console.log(fn,'ticks',tot);console.log([...L].sort((a,b)=>b[1]-a[1]).slice(0,+process.argv[4]||20).map(([l,t])=>l+': '+t+' ('+(100*t/tot).toFixed(1)+'%)').join('\n'));
// callers of fn
const byId=new Map(P.nodes.map(n=>[n.id,n]));const par=new Map();for(const n of P.nodes)for(const c of (n.children||[]))par.set(c,n.id);
const C=new Map();for(const n of P.nodes){if((n.callFrame.functionName||'')!==fn)continue;const p=byId.get(par.get(n.id));const k=p?(p.callFrame.functionName+':'+(p.callFrame.lineNumber+1)):'?';const self=(n.positionTicks||[]).reduce((a,b)=>a+b.ticks,0);C.set(k,(C.get(k)||0)+self);}
console.log('callers(self ticks):',JSON.stringify([...C].sort((a,b)=>b[1]-a[1]).slice(0,6)));
