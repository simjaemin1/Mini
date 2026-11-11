const fs=require('fs');const R=process.argv[2]||'/dev/shm/t1260';
const rd=f=>{try{return JSON.parse(fs.readFileSync(f,'utf8'))}catch(e){return null}};
const out={};
for(const a of ['F0','F0R','F1','F1R'])for(const s of [1020,7,42]){const F=rd(`${R}/${a}-${s}/farm.json`),W=rd(`${R}/${a}-${s}/world.json`);
 const vp=W&&W.vpop?W.vpop:[];const pop=vp.reduce((x,v)=>x+v.pop,0);
 const jd=(F&&F.jobDaysTot)||{};
 const r={pop, empty: vp.filter(v=>v.pop===0).length, dead:F&&F.dead, famine:F&&F.famineDaysTot, hunger:F&&F.hungerDaysTot, cookDays:jd.cook||0, cleared:F&&F.clearedTot, cells:F&&F.cellsTot, gran:F&&F.granary, foodPrice:F&&F.priceFoodMean, farmerDays:jd.farmer||0, eight:W&&W.eight&&W.eight.grain};
 (out[a]=out[a]||{})[s]=r;}
console.log(JSON.stringify(out,null,1));
