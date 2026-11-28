const {rd}=require("./an.js");
const ph=[[1,60],[61,400]];
for (const t of process.argv.slice(2)) { const L=rd(t+".why.jsonl"); const out=[];
 for (const [a,b] of ph) { const R=L.filter(r=>r.d>=a&&r.d<=b); const acc={}; const nn={};
  for (const r of R) { const BD=(process.env.ALL&&r.bandA)?r.bandA:r.band, SN=(process.env.ALL&&r.spA)?r.spA:r.spN; for (const sp of Object.keys(BD||{})) { const x=BD[sp]; const A=acc[sp]||(acc[sp]=[0,0,0,0,0]); x.forEach((v,i)=>A[i]+=v); nn[sp]=(nn[sp]||0)+(SN[sp]||0); } }
  out.push(a+"-"+b+" "+Object.keys(acc).sort().map(sp=>{const A=acc[sp],S=A.reduce((x,y)=>x+y,0);return sp.slice(0,4)+":n"+Math.round(nn[sp]/R.length)+"["+A.map(v=>(100*v/S).toFixed(0)).join(",")+"]";}).join(" "));
 }
 const got=(d0,d1)=>{const A=L.filter(r=>r.d<d0).pop()||L[0],B=L.filter(r=>r.d<=d1).pop();return B.got.reduce((x,y)=>x+y,0)-A.got.reduce((x,y)=>x+y,0);};
 console.log(t.padEnd(10), out.join(" | "), "got", got(1,60), got(61,400));
}
