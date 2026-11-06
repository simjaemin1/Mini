'use strict';
// T1188 preload: observe production entrances, real receipts, smelting and casting.
if(require('worker_threads').isMainThread&&(process.env.T577_SEED||process.env.T17_JSON)){
 const fs=require('fs'),path=require('path'),Module=require('module'),crypto=require('crypto');
 const root=path.resolve(__dirname,'..'),server=!!process.env.T577_SEED,hash=f=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
 const st={mode:server?'server':'lab',seed:server?+process.env.T577_SEED:+process.argv[3],runtime:{node:process.version,v8:process.versions.v8,icu:process.versions.icu},flags:Object.fromEntries(['T1188_ORE_SPLIT','T312_FISH_ACT','T325_WOOD_ACT','T347_FORAGE_ACT','T435_GRANARY_ACT','T527_BRIDGE_ACT','T517_HUT_STONE','T419_STONE_REAL','T1179_CROP_SEASON','T368_FARM_ACT','T100_FIELD_YIELD'].map(k=>[k,process.env[k]])),source:{},villageN:0,villageNs:0,worldN:0,worldNs:0,formulaRaw:{},directMinerals:{},receipts:{},bodyReceipts:0,remoteReceipts:0,smeltOut:{},bulkCut:0,days:[],errors:[]};
 for(const f of ['sim/economy-sim.js','sim/economy-sim-v2.js','server/villages.js','server/zone.js','server/specialty.js','server/weights.js','server/ore-goods.js'])st.source[f]=hash(f);
 const cast=new Set();let world=null;
 const add=(o,k,n)=>{if(n>0)o[k]=(o[k]||0)+n;};
 const O=globalThis.__t1188Observe={st,actor:null,produced(v,p,r,n){if(p.currentJob==='smith'&&r==='weapon'&&n>0)cast.add(v.name);if(p.currentJob==='miner'&&n>0){if(r==='ore'||r.startsWith('ore_'))add(st.formulaRaw,r,n);else add(st.directMinerals,r,n);}},smelt(v,before,ids){for(const k of ids)add(st.smeltOut,k,(v.storage[k]||0)-before[k]);}};
 const ext=Module._extensions['.js'];Module._extensions['.js']=function(m,file){
  if(file!==path.join(root,'sim/economy-sim.js')&&file!==path.join(root,'server/villages.js'))return ext(m,file);
  let src=fs.readFileSync(file,'utf8');
  if(file.endsWith('/sim/economy-sim.js')){
   const needle='if (amt <= 0) return;';if(!src.includes(needle))throw Error('T1188 observer produce entrance missing');src=src.replace(needle,needle+' globalThis.__t1188Observe.produced(v,npc,r,amt);');
   src+=`\n;(()=>{const O=globalThis.__t1188Observe,f=_trySmelt,ids=[...new Set(OreGoods.minerals.map(k=>k==='jade_raw'?'jade':k))];_trySmelt=function(v,...a){const before=Object.fromEntries(ids.map(k=>[k,v.storage[k]||0]));const q=f(v,...a);O.smelt(v,before,ids);return q;};module.exports._trySmelt=_trySmelt;})();`;
  }else src+=`\n;(()=>{const O=globalThis.__t1188Observe,f=_t724Deliver;_t724Deliver=function(v,p,...a){const prev=O.actor,S=p._t720,t=p._granTask,g=S&&S.k?{x:S.tx,y:S.ty}:t?_granLadder(t):{x:v.ccx*SZ+SZ/2,y:v.ccy*SZ+SZ/2};O.actor={p,...g};try{return f(v,p,...a);}finally{O.actor=prev;}};const b=_oreMineDaily;_oreMineDaily=function(...a){const r=b(...a);O.st.bulkCut+=r?.consumed||0;return r;};})();`;
  m._compile(src,file);
 };
 const E=require('../sim/economy-sim'),tick=E.tickVillage,receipt=E.mineToGranary;
 E.tickVillage=function(v,...a){const t=process.hrtime.bigint();try{return tick(v,...a);}finally{world=v._world||world;st.villageN++;st.villageNs+=Number(process.hrtime.bigint()-t);}};
 E.mineToGranary=function(v,n,k){const q=receipt(v,n,k);if(q>0){add(st.receipts,E.T1188_ORE_SPLIT?E.OreGoods.idOf(k):'ore',q);if(O.actor){st.bodyReceipts+=q;const A=O.actor,d=Math.hypot(A.p.x-A.x,A.p.y-A.y);if(!Number.isFinite(d)||d>44+1e-6)st.remoteReceipts+=q;}}return q;};
 const snapshot=w=>{world=w;const raw={},metals={};for(const v of w.villages){for(const k of E.OreGoods.ids)add(raw,k,v.storage[k]||0);for(const k of E.OreGoods.minerals)add(metals,k==='jade_raw'?'jade':k,v.storage[k==='jade_raw'?'jade':k]||0);}return{day:w.day,pop:w.villages.reduce((n,v)=>n+v.npcs.length,0),empty:w.villages.filter(v=>!v.npcs.length).length,econStarved:w.villages.reduce((n,v)=>n+(v._deadTot||0),0),dissolved:w.villages.filter(v=>v._banditized).length,ore:w.villages.reduce((n,v)=>n+E.oreTotal(v),0),legacyOre:w.villages.reduce((n,v)=>n+(v.storage.ore||0),0),raw,metals,castVillagesEver:cast.size,aliveCasters:w.villages.filter(v=>v.npcs.length&&cast.has(v.name)).length,smeltOut:{...st.smeltOut},bulkCut:st.bulkCut,bodyReceipts:st.bodyReceipts,remoteReceipts:st.remoteReceipts};};
 if(server){const Events=require('../server/events'),create=Events.createLedger;Events.createLedger=function(...a){const L=create(...a),scan=L.scanDay;L.scanDay=function(w,...b){try{st.days.push(snapshot(w));}catch(e){st.errors.push(String(e));}return scan.call(this,w,...b);};return L;};}
 else{const V=require('../sim/economy-sim-v2'),f=V.tickWorldV2;V.tickWorldV2=function(w,...a){const t=process.hrtime.bigint();try{return f(w,...a);}finally{st.worldN++;st.worldNs+=Number(process.hrtime.bigint()-t);st.days.push(snapshot(w));}};}
 const dump=()=>{try{st.villageUs=st.villageN?st.villageNs/st.villageN/1000:0;st.worldUs=st.worldN?st.worldNs/st.worldN/1000:0;st.castingVillages=[...cast].sort();if(world)st.final=snapshot(world);fs.writeFileSync((server?process.env.T577_OUT:process.env.T17_JSON)+'.t1188.json',JSON.stringify(st));}catch(e){st.errors.push(String(e));}};
 process.on('exit',dump);if(server)setInterval(dump,5000).unref();
}
