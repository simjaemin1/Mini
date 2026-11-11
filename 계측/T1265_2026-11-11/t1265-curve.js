const fs=require("fs");const R="/dev/shm/t1265";
const arms=process.argv[2].split(",");const seeds=(process.argv[3]||"1020,7,42").split(",");
const days=[0,40,100,200,300,400,500,600,700,780];
for(const a of arms){const acc={};
 for(const s of seeds){const p=R+"/"+a+"-"+s+"/farm.json";if(!fs.existsSync(p))continue;const f=JSON.parse(fs.readFileSync(p));
  for(const v of f.per){for(const t of v.traj){if(!days.includes(t.d))continue;const o=acc[t.d]=acc[t.d]||{N:0,cells:0,food:0,foodEq:0,house:0,gated:0,n:0};
   o.N+=t.N;o.cells+=t.cells;o.food+=t.food;o.foodEq+=t.foodEq;o.house+=t.house;o.gated+=t.gated?1:0;o.n++;}}}
 console.log("== "+a);for(const d of days){const o=acc[d];if(!o)continue;console.log([d,"N "+o.N,"cells "+o.cells,"food "+Math.round(o.food),"foodEq/N "+(o.foodEq/Math.max(1,o.N)).toFixed(1),"house "+o.house,"gated "+o.gated].join("\t"));}}
