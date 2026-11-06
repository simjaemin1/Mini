#!/usr/bin/env node
'use strict';
process.env.T419_STONE_REAL=process.env.T419_STONE_REAL??'1';
const assert=require('assert'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2');
function plan(stock){
 const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0];
 w.picker='rational';v.land.stone=.25;v.storage.food=10000;v.storage.tool=0;v.storage.iron_tool=0;v.storage.bronze_tool=0;v.storage.stone=stock;v.storage.wood=1000;
 v.counts={farmer:v.npcs.length,mason:0,forager:0};v.npcs.forEach(p=>p.currentJob='farmer');
 E._autoSwitchJobForTest(v,100,w);return v._dbgSwitch?.need;
}
assert.equal(plan(.225),E.T419_STONE_REAL?'forager':'mason','material recovery must not stop at obsolete .2 stock');
assert.equal(plan(E.stoneWorkStock({npcs:[]})),'mason','funded tool production remains selectable');
console.log('PASS stone recipe planning T419='+E.T419_STONE_REAL);

{
 const v={npcs:new Array(10).fill({}),counts:{farmer:10,mason:0},storage:{tool:0}};
 assert.equal(E.derivedInputTarget(v,'stone'),E.T419_STONE_REAL?E.toolDesiredStock(v)*E.stoneRealPer('tool').stone:0);
 if(E.T419_STONE_REAL){const raw=E.stoneRealPer('crude'),p=E.derivedInputTarget(v,'pebble'),t=E.derivedInputTarget(v,'twig');assert(p>0&&t>0);assert(Math.abs(p/raw.pebble-t/raw.twig)<1e-9);}
 v.storage.tool=E.toolDesiredStock(v);assert.equal(E.derivedInputTarget(v,'stone'),0);assert.equal(E.derivedInputTarget(v,'pebble'),0);assert.equal(E.derivedInputTarget(v,'twig'),0);
 v.npcs=[];v.storage.tool=0;assert.equal(E.derivedInputTarget(v,'stone'),0);
 console.log('PASS raw stone demand follows actual missing tools, including when production is blocked');
}
