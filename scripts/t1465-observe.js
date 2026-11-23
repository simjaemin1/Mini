'use strict';
// Read-only measurement preload. No stock reads that advance the product ledger.
const fs=require('fs'),E=require('../sim/economy-sim'),S=require('../server/specialty'),W=require('../server/weights');
const OUT=process.env.T1465_OBS;if(!OUT)return;
const D=JSON.parse(fs.readFileSync(require('path').join(__dirname,'../계측/T1465_2026-11-23/광맥-진단.json')));
const cells=new Map();for(const v of D.villages)for(const c of v.cells)cells.set('hanbando:'+c.cx+','+c.cy,c);
let world=null,last=-1,observed=0;const per={},annual=[],mining=[],emptyFirst={};
function snap(day){
 if(day===observed)return;observed=day;
 for(const v of world.villages){const p=per[v.name]||(per[v.name]={days:0,minedKg:{}});p.days++;for(const id of E.OreGoods.ids){const q=v.dailyProductionBuf?.[id]||0;if(q)p.minedKg[id]=(p.minedKg[id]||0)+q*W.kgOf(id);}}
 const v=world.villages.find(v=>v.name==='광산5');if(v)mining.push([day,v.counts?.miner||0,v._priceCache?.tin||0]);
 if(day%365===0)annual.push(summary(day));
}
function summary(day){
 const deficit={},b=world._oreStock?.cells||{};let empty=0;
 for(const [key,r]of Object.entries(b)){const c=cells.get(key);if(!c)throw Error('unknown physical cell '+key);const st=S.oreRegen(r.s,Math.max(0,day-r.day));if(st<1){empty++;if(!emptyFirst[key])emptyFirst[key]=day;}for(const[m,f]of Object.entries(c.mix||{}))deficit[m]=(deficit[m]||0)+(S.ORE_K-st)*S.CHUNK_KG*f;}
 const pop=world.villages.reduce((n,v)=>n+v.npcs.length,0),stone=world.villages.reduce((n,v)=>n+(v._stoneWeaponMade||0),0),bronze=world.villages.reduce((n,v)=>n+(v._bronzeWeaponMade||0),0);
 return {day,pop,starved:world.villages.reduce((n,v)=>n+(v._fdDeadTot||0),0),emptyVillages:world.villages.filter(v=>!v.npcs.length).map(v=>v.name),stoneMade:stone,bronzeMade:bronze,stoneBronzeRatio:bronze?stone/bronze:null,emptyAccessibleCells:empty,touchedCells:Object.keys(b).length,
 npcRemainingKg:Object.fromEntries(Object.entries(D.totals.npcAccessibleMineralsKg).map(([m,n])=>[m,n-(deficit[m]||0)])),worldRemainingKg:Object.fromEntries(Object.entries(D.totals.mineralsKg).map(([m,n])=>[m,n-(deficit[m]||0)])),perVillage:JSON.parse(JSON.stringify(per))};
}
const tick=E.tickVillage;E.tickVillage=function(v,day){if(!world){world=v._world;if(E.T1465_ORE_STOCK&&process.env.T1465_ATTACH==='1'){for(const a of world.villages){const t=D.villages.find(x=>x.name===a.name);if(!t)throw Error('No canonical topology '+a.name);if(Math.abs(a.coord.x/2.5-t.ccx)>1||Math.abs(a.coord.y/2.5-t.ccy)>1)throw Error('Topology centre mismatch '+a.name);a.land._oreStockCells={zone:'hanbando',teamSize:D.constants.MINE_TEAM,cells:t.cells.map(c=>({...c,key:'hanbando:'+c.cx+','+c.cy}))};}}}if(day!==last){if(last>=0)snap(last);last=day;}return tick.apply(this,arguments);};
process.on('exit',()=>{if(!world)return;snap(last);const result={stockOn:E.T1465_ORE_STOCK,scope:'canonical reference raw chunk mass; daily production uses actual ore item kg; unchanged T1407 observers provide caravan/bronze ownership detail',final:summary(world.day),annual,mining,emptyFirst};fs.writeFileSync(OUT,JSON.stringify(result));});
