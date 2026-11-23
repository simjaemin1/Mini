'use strict';
// Read-only measurement preload. No stock reads that advance the product ledger.
const fs=require('fs'),E=require('../sim/economy-sim'),S=require('../server/specialty'),W=require('../server/weights');
const OUT=process.env.T1465_OBS;if(!OUT)return;
const D=JSON.parse(fs.readFileSync(require('path').join(__dirname,'../계측/T1465_2026-11-23/광맥-진단.json')));
const cells=new Map();for(const v of D.villages)for(const c of v.cells)cells.set('hanbando:'+c.cx+','+c.cy,c);
let world=null,last=-1,observed=0,startDay=null,initial=null;const tradeSeen=new WeakSet(),trade={};const per={},annual=[],mining=[],emptyFirst={};
function snap(day){
 if(day===observed)return;observed=day;
 for(const r of world.tradeLog||[]){if(tradeSeen.has(r))continue;tradeSeen.add(r);const items=[];if(!r.abandoned){if(r.sent)items.push(r.sent);if(r.sent2)items.push(r.sent2);items.push(...(r.basket||[]));}items.push(...(r.retBasket||[]));if(!r.retBasket&&r.bought)items.push(r.bought);for(const it of items)if(['tin','ore_tin'].includes(it?.res)&&it.amt>0){const a=trade[it.res]||(trade[it.res]={legs:0,kg:0});a.legs++;a.kg+=it.amt*W.kgOf(it.res);}}
 for(const v of world.villages){const p=per[v.name]||(per[v.name]={days:0,minedKg:{}});p.days++;for(const id of E.OreGoods.ids){const q=v.dailyProductionBuf?.[id]||0;if(q)p.minedKg[id]=(p.minedKg[id]||0)+q*W.kgOf(id);}}
 const v=world.villages.find(v=>v.name==='광산5');if(v)mining.push([day,v.counts?.miner||0,v._priceCache?.tin||0]);
 if((day-startDay+1)%365===0){annual.push(summary(day));write(true);}
}
function summary(day){
 const deficit={},b=world._oreStock?.cells||{};let empty=0;
 for(const [key,r]of Object.entries(b)){const c=cells.get(key);if(!c)throw Error('unknown physical cell '+key);const st=S.oreRegen(r.s,Math.max(0,day-r.day));if(st<1){empty++;if(!emptyFirst[key])emptyFirst[key]=day;}for(const[m,f]of Object.entries(c.mix||{}))deficit[m]=(deficit[m]||0)+(S.ORE_K-st)*S.CHUNK_KG*f;}
 const pop=world.villages.reduce((n,v)=>n+v.npcs.length,0),stone=world.villages.reduce((n,v)=>n+(v._stoneWeaponMade||0),0),bronze=world.villages.reduce((n,v)=>n+(v._bronzeWeaponMade||0),0);
 return {day,startDay,elapsedDays:day-startDay+1,pop,bronzeHolders:world.villages.filter(v=>E._t1344BronzeStock(v)>=1).map(v=>v.name),trade:JSON.parse(JSON.stringify(trade)),stoneMadeSinceStart:stone-(initial?.stone||0),bronzeMadeSinceStart:bronze-(initial?.bronze||0),starved:world.villages.reduce((n,v)=>n+(v._fdDeadTot||0),0),emptyVillages:world.villages.filter(v=>!v.npcs.length).map(v=>v.name),stoneMade:stone,bronzeMade:bronze,stoneBronzeRatio:bronze?stone/bronze:null,emptyAccessibleCells:empty,touchedCells:Object.keys(b).length,
 npcRemainingKg:Object.fromEntries(Object.entries(D.totals.npcAccessibleMineralsKg).map(([m,n])=>[m,n-(deficit[m]||0)])),worldRemainingKg:Object.fromEntries(Object.entries(D.totals.mineralsKg).map(([m,n])=>[m,n-(deficit[m]||0)])),perVillage:JSON.parse(JSON.stringify(per))};
}
const resume=process.env.T1465_OBS_RESUME?JSON.parse(fs.readFileSync(process.env.T1465_OBS_RESUME)):null;
const tick=E.tickVillage;E.tickVillage=function(v,day){if(!world){world=v._world;if(resume){if(resume.final.day!==world.day-1)throw Error('Observer/checkpoint day mismatch');startDay=resume.final.startDay;last=observed=resume.final.day;Object.assign(per,resume.final.perVillage);Object.assign(trade,resume.final.trade);Object.assign(emptyFirst,resume.emptyFirst);annual.push(...resume.annual);mining.push(...resume.mining);initial={stone:resume.final.stoneMade-resume.final.stoneMadeSinceStart,bronze:resume.final.bronzeMade-resume.final.bronzeMadeSinceStart};}else{startDay=day;initial={stone:world.villages.reduce((n,v)=>n+(v._stoneWeaponMade||0),0),bronze:world.villages.reduce((n,v)=>n+(v._bronzeWeaponMade||0),0)};}for(const r of world.tradeLog||[])tradeSeen.add(r);if(E.T1465_ORE_STOCK&&process.env.T1465_ATTACH==='1'){for(const a of world.villages){const t=D.villages.find(x=>x.name===a.name);if(!t)throw Error('No canonical topology '+a.name);if(a.coord.x!==t.ccx*2.5||a.coord.y!==t.ccy*2.5)throw Error('Topology centre mismatch '+a.name);const topology={zone:'hanbando',teamSize:D.constants.MINE_TEAM,cells:t.cells.map(c=>({...c,key:'hanbando:'+c.cx+','+c.cy}))};a.land._oreStockCells=topology;if(a._origLand)a._origLand._oreStockCells=topology;}}}if(day!==last){if(last>=0)snap(last);last=day;}return tick.apply(this,arguments);};
function write(partial){if(!world)return;const result={partial,node:process.version,stockOn:E.T1465_ORE_STOCK,scope:'canonical reference raw chunk mass; daily production uses actual ore item kg; unchanged T1407 observers provide caravan/bronze ownership detail',final:summary(observed),annual,mining,emptyFirst};const tmp=OUT+'.tmp-'+process.pid;fs.writeFileSync(tmp,JSON.stringify(result));fs.renameSync(tmp,OUT);}
process.on('exit',()=>{if(!world)return;snap(last);write(false);});

if(E.T1465_ORE_STOCK&&process.env.T1465_EMPTY_WATCH==='1'){
 const E2=require('../sim/economy-sim-v2'),watch=require('./t1465-empty-watch'),tickWorld=E2.tickWorldV2;
 E2.tickWorldV2=function(w){const result=tickWorld.apply(this,arguments);watch.scan(w,w.day,OUT);return result;};
}

// Long-run checkpoints use completed-day measurements, not gameplay mutations.
module.exports={flushCompletedDay:()=>{if(world)snap(last);},writePartial:()=>write(true)};
