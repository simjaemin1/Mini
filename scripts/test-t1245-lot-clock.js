#!/usr/bin/env node
'use strict';
process.env.T1243_FARM_ON=process.env.T1243_FARM_ON??'1';process.env.T789_DISCARD='1';
const assert=require('assert'),L=require('../server/lots'),G=require('../server/granary-lots'),S=require('../server/spoil'),E=require('../sim/economy-sim');
let day=10000.5;const ms=1440000;L.setClock(()=>day*ms,ms);
const v=E.createVillage({initialPop:0});v.storage.food=10;G.attach(v,null,null);
assert.equal(G.dump(v).L.food[0].k,10000.5*ms);
G.tickBegin([v],1);v.storage.food+=2;const lots=G.dump(v).L.food;const newest=lots.find(r=>r.k===(process.env.T1243_FARM_ON==='1'?10000.5*ms:ms));
assert(newest);assert.equal(newest.u,process.env.T1243_FARM_ON==='1'?12:2,'new receipt must carry the correct timestamp, not just the existing startup record');
if(process.env.T1243_FARM_ON==='1'){
 assert.equal(newest.k,10000.5*ms,'fresh receipt must use the same absolute day as startup lots');
 assert.equal(S.exposureAt(newest,day,0),0,'fresh receipt is not millennia old');
 G.tickEnd();day+=1000;G.tickBegin([v],1001);assert.equal(v.storage.food,0,'absolute elapsed exposure expires startup lots as well');G.tickEnd();
 console.log('PASS same absolute clock for startup, fresh receipt and expiry');
}else{
 assert.equal(newest.k,ms,'OFF preserves historical econ-day timestamp');G.tickEnd();
 console.log('PASS OFF retains existing clock bytes');
}
