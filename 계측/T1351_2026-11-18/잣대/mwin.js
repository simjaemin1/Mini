const fs=require('fs');const[, ,dir,re]=process.argv;const R=new RegExp(re);const rows=new Map();
for(const f of fs.readdirSync(dir).filter(f=>R.test(f))){const o=JSON.parse(fs.readFileSync(dir+'/'+f));for(const r of o.rows){const m={};o.cols.forEach((c,i)=>m[c]=r[i]);rows.set(r[0],m);}}
const W=[[1,25],[26,50],[51,75],[76,100],[101,115]];
console.log(W.map(([a,b])=>{let D=0,I=0,M=0,n=0,v=0;for(let d=a;d<=b;d++){const m=rows.get(d);if(!m)continue;D+=m.oreD;I+=m.oreIn;M+=m.miners;v+=m.vils;n++;}return `${a}-${b}: D ${D.toFixed(0)} in ${I.toFixed(0)} (${(I/D*100).toFixed(0)}%) 광부 ${(M/n).toFixed(1)}`}).join(' | '));
