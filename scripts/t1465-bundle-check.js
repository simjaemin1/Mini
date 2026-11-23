#!/usr/bin/env node
'use strict';
// ON parity on a mapped, shared-cell fixture. No browser/UI or market calibration.
process.env.T1465_ORE_STOCK='1';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2'),S=require('../server/specialty');
const context={process:{env:{T1465_ORE_STOCK:'1'}},console:{log(){},warn(){},error(){}},setTimeout,clearTimeout};
vm.runInNewContext(fs.readFileSync(require.resolve('../sim/economy-engine.browser'),'utf8'),context);
const B=context.EconEngine;
assert.strictEqual(B.T1465_ORE_STOCK,true,'ON flag missing from bundle');
const run=(eng,low)=>{
 const w=eng.createWorldV2({seed:42,villageCount:3});w.priceBase=null;const initial=low?S.ORE_K/100:S.ORE_K;if(low)w._oreStock={version:1,cells:Object.fromEntries([0,1,2].map(cx=>['fixture:'+cx+',0',{s:initial,day:0}]))};
 for(const v of w.villages){
  v.land.ore=1;v.land.oreMix={tin:1};v.land.oreP=null;v.storage.food=1000;
  v.land._oreStockCells={teamSize:2,cells:[0,1,2].map(cx=>({key:'fixture:'+cx+',0',cx,cy:0,mix:{tin:1}}))};
  for(const k in v.counts)v.counts[k]=0;v.counts.miner=v.npcs.length;
  for(const n of v.npcs){n.currentJob='miner';n.lastJobChangeDay=0;n.skills.mining=5;}
 }
 for(let i=0;i<20;i++)eng.tickWorldV2(w);
 assert(Object.keys(w._oreStock?.cells||{}).length>0,'fixture did not exercise finite depletion');assert(Object.values(w._oreStock.cells).some(c=>c.s<initial),'fixture did not extract stock');
 return JSON.parse(JSON.stringify({world:eng.serializeWorld(w),stock:w._oreStock}));
};
for(const low of [false,true])assert.deepStrictEqual(run(Object.assign({},E,E2),low),run(B,low),'bundle/native ON diverged');
console.log('PASS T1465 bundle ON: 20 days × full/1% stock, 3 mapped villages, shared finite cells');
