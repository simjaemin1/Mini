#!/usr/bin/env node
'use strict';
const assert=require('assert'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2');
const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v._t347Cells=1;v._forageActItems=['herb'];v.storage.food=10000;v.counts={forager:v.npcs.length};v.npcs.forEach(p=>p.currentJob='forager');
E.tickVillage(v,1);assert(v._t347MixShare>0,'physical forage intake plan disappeared with formula suppression');assert(v._forageOutLast>0);
assert.equal(Object.values(v.dailyProductionBuf||{}).reduce((a,b)=>a+b,0),0,'no anonymous physical production');
assert(E.forageToGranary(v,'herb',1)>0,'real gathered herb must be accepted');console.log('PASS physical forage plan survives without formula production');
