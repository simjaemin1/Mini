const fs=require("fs");const R="/dev/shm/t1265";
const arms=process.argv[2].split(",");const seeds=[1020,7,42];
const keys=new Set();
for(const a of arms){const row=[a];let P=0,D=0,ok=1;const agg={};
 for(const s of seeds){const p=R+"/"+a+"-"+s+"/farm.json";if(!fs.existsSync(p)){row.push("—");ok=0;continue;}
  const f=JSON.parse(fs.readFileSync(p));row.push(f.pop);P+=f.pop;D+=f.dead;
  const j=f.jobDaysTot||{};for(const k of Object.keys(j))keys.add(k);
  const add=(k,v)=>agg[k]=(agg[k]||0)+(v||0);
  add("cook",j.cook);add("farmer",j.farmer);add("fisher",j.fisher);add("forager",j.forager);add("hunter",j.hunter);
  add("cleared",f.clearedTot);add("cells",f.cellsTot);add("famine",f.famineDaysTot);add("hunger",f.hungerDaysTot);add("gated",f.gatedDaysTot);
  let au="";try{au=fs.readFileSync(R+"/"+a+"-"+s+"/audit.json","utf8").trim()}catch(e){}if(s===1020&&au)agg.audit=au.slice(0,80);
 }
 console.log([...row,"합"+P,"빈"+D,JSON.stringify(agg)].join("\t"));}
console.log([...keys].join(","));
