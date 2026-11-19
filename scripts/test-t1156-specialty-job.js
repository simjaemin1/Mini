'use strict';
const assert=require('node:assert/strict'), E=require('../sim/economy-sim-v2'), V=require('../sim/economy-sim');
const w=E.createWorldV2({seed:1020,villageCount:2,infoRange:5000,picker:'rational',raidPer100:0});
const [a,b]=w.villages;a.coord={x:0,y:0};b.coord={x:100,y:0};
a.land.jade=2;a.land.obsidian=2;a.land.wood=2;
for(const r in a.storage)a.storage[r]=0;
b.storage.food=1e6;b.storage.fish=1e6;
const before=JSON.stringify(w.villages.map(v=>({storage:v.storage,treasury:v.treasury,npcs:v.npcs})));
const q=E._t1156Specialty(a,w);
assert(q.length>0,'a reachable food surplus must quote a specialty job');
assert(q.every(x=>Number.isFinite(x.foodPerDay)&&x.foodPerDay>0));
assert.equal(before,JSON.stringify(w.villages.map(v=>({storage:v.storage,treasury:v.treasury,npcs:v.npcs}))),'forecast must not move goods or bodies');
assert.strictEqual(q,E._t1156Specialty(a,w),'same day shares the quote');
w.day++;w.infoRange=1;
assert.deepEqual(E._t1156Specialty(a,w),[],'unreachable market buys no food');
assert.equal(V.T1156_SPECIALTY_JOB,process.env.T1156_SPECIALTY_JOB==='1');
console.log('T1156: 6 assertions passed; '+JSON.stringify(q));
console.log('=== 결과: 6 PASS / 0 FAIL ===');   // [T1367] 러너 결과 줄 꼴(단언은 그대로 — 하나라도 어긋나면 위에서 던져 RC 1 · 이 줄 없음)
