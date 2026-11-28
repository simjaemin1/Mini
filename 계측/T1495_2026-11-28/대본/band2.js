const {rd}=require("./an.js");
const [a,b]=process.argv.slice(2,4).map(Number);
for (const t of process.argv.slice(4)) { const L=rd(t+".why.jsonl").filter(r=>r.d>=a&&r.d<=b&&r.bandA); const acc={},nn={};
 for (const r of L) for (const sp of Object.keys(r.bandA)) { const A=acc[sp]||(acc[sp]=[0,0,0,0,0]); r.bandA[sp].forEach((v,i)=>A[i]+=v); nn[sp]=(nn[sp]||0)+(r.spA[sp]||0); }
 console.log(t.padEnd(10), a+"-"+b, Object.keys(acc).sort().map(sp=>{const A=acc[sp],S=A.reduce((x,y)=>x+y,0);return sp.slice(0,5)+" n"+Math.round(nn[sp]/L.length)+" <100m "+(100*(A[0]+A[1])/S).toFixed(0)+"% ≥200m "+(100*(A[3]+A[4])/S).toFixed(0)+"%";}).join(" | "));
}
