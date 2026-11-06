#!/usr/bin/env node
'use strict';
process.env.T419_STONE_REAL=process.env.T419_STONE_REAL??'1';
const assert=require('assert'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2');
function run(bound){const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0];v.land.forageSustain=0;v.land.stone=1;v.storage.food=10000;v.counts={forager:v.npcs.length};v.npcs.forEach(p=>p.currentJob='forager');if(bound)E.bindProductionActs(w);E.tickVillage(v,1);return v.dailyProductionBuf?.stone||0;}
const free=run(false),physical=run(true);
assert(E.T419_STONE_REAL?free>0:free===0,'rock budget must not be the plant regeneration budget');assert.equal(physical,0,'physical host cannot regain formula stones');
console.log(JSON.stringify({realStone:E.T419_STONE_REAL,headlessStone:free,physicalFormulaStone:physical}));console.log('PASS independent mineral budget and body-only host');
