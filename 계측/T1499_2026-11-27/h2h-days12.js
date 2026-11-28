const fs=require('fs');const fl=process.argv.slice(2);const K=['px','jumpPx','trips','work','gran','cast','fish','far650','far','task'];
for(const f of fl){const o=JSON.parse(fs.readFileSync(f));const acc={};
 for(const d of ['1','2']){const j=(o.days[d]||{}).job||{};for(const J in j){const a=acc[J]||(acc[J]={bodies:0});const s=j[J];a.bodies+=s.bodies;for(const k of K)a[k]=(a[k]||0)+(s[k]||0);}}
 const r=[o.arm];for(const J of ['F','R','L']){const a=acc[J];if(!a)continue;const b=a.bodies;r.push(J+' bd '+b+' px '+(a.px/b|0)+' +jump '+((a.px+a.jumpPx)/b|0)+' far650% '+(100*a.far650/b).toFixed(0)+' trips '+(a.trips/b).toFixed(3)+' work '+(a.work/b).toFixed(2)+' gran '+(a.gran/b).toFixed(4)+' cast '+(a.cast/b).toFixed(1)+' fish '+(a.fish/b).toFixed(2)+' task '+(a.task/b).toFixed(2));}
 console.log(r.join('\n  '));}
