// 맞대기 표 — 랩 t176 판 JSON(들) → 농부 한 사람 한 해 · 고증
const fs=require('fs'),z=require('zlib'),path=require('path');const R=path.join(__dirname,'..','..','..');
const C=require(R+'/server/crops');const DAY_KCAL=require(R+'/server/kcal').DAY_KCAL;
const J=f=>{for(const g of [f,f+'.gz']){try{const b=fs.readFileSync(g);return JSON.parse((g.endsWith('.gz')?z.gunzipSync(b):b).toString())}catch(e){}}return null};
const files=process.argv.slice(2);
const HA=C.FIELD_CELL_M2/10000, DAYMIN=1008;
const out=[];
for(const f of files){const o=J(f);if(!o){continue}
 const fy=o.fDaysTot/365, py=o.popDaysTot/365, cy=o.cellDaysTot/365;
 const by=(o.t368&&o.t368.byCrop)||{};let kg=0,fe=0,ev=0;for(const [id,b] of Object.entries(by)){kg+=(b.units||0)*(C.kgOf(id)||0);fe+=b.fe||0;ev+=b.ev||0;}
 const k=(o.t1221&&o.t1221.byKind)||{};const used=(o.t1221&&o.t1221.usedS)||0;
 const sowM=(k[2]||0)*(300+80)*HA*60, weedM=(k[1]||0)*350/6*HA*60, wpM=((k[3]||0)+(k[4]||0))*5, harvM=used-sowM-weedM-wpM;
 out.push({f:path.basename(f),pop:o.pop,farmerShare:o.fDaysTot/o.popDaysTot,cellsPerFarmer:cy/fy,cellsPerPerson:cy/py,sowPerFarmer:o.sowTot/fy,harvPerFarmer:o.harvestNTot/fy,harvPerCellYear:o.harvestNTot/cy,
  kgPerHarv:ev?kg/ev:null,kcalPerHarv:ev?fe*DAY_KCAL/ev:null,
  daysSow:sowM/fy/DAYMIN,daysWeed:weedM/fy/DAYMIN,daysHarv:harvM/fy/DAYMIN,daysOther:wpM/fy/DAYMIN,laborUse:used/(o.t1221?o.t1221.budgetS:1),
  fedPerFarmer:o.fieldFoodEqTot/o.fDaysTot,fieldShare:o.fieldFoodEqTot/o.popDaysTot});}
// 고증(T1215 사람당 심는 밭 12칸 × 250 m² · 농부 몫 0.7 ~ 0.8 → 0.75 · 조 650 kg/ha(T1221 500 ~ 800 가운데) · 일손 T1221 h/ha · 거두기 털기 h/t T1243 추신 2)
const kgC=650*HA, cellsF=12/0.75;
const G={farmerShare:0.75,cellsPerFarmer:cellsF,cellsPerPerson:12,sowPerFarmer:cellsF,harvPerFarmer:cellsF,harvPerCellYear:1,kgPerHarv:kgC,kcalPerHarv:kgC*3600,
 daysSow:cellsF*380*HA*60/DAYMIN,daysWeed:cellsF*350*HA*60/DAYMIN,daysHarv:cellsF*(620+75)*kgC/1000*60/DAYMIN,fedPerFarmer:cellsF*kgC*3600/DAY_KCAL/365,fieldShare:12*kgC*3600/DAY_KCAL/365};
console.log(JSON.stringify({G,out},null,1));
