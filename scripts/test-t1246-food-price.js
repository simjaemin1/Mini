#!/usr/bin/env node
// @regress
'use strict';
// T1246: aggregate food stock is not a tradable physical `food` balance.
const assert=require('node:assert/strict'),{execFileSync}=require('node:child_process'),path=require('node:path');
const root=path.join(__dirname,'..');let pass=0;
function run(on,body,extra={}){
 const env={...process.env};delete env.NODE_OPTIONS;
 for(const k of ['T1243_FARM_ON','T859_FOOD_HUNGER','T1152_MARKET','T1152_POOL','T732_MOMENT','T789_DISCARD'])delete env[k];
 Object.assign(env,{T1243_FARM_ON:String(on)},extra);
 const setup=`const assert=require('node:assert/strict'),E=require('./sim/economy-sim'),V=require('./sim/economy-sim-v2'),C=require('./server/crops'),K=require('./server/kcal');
 const mk=()=>{const v=E.createVillage({initialPop:20,name:'grain-only'});for(const r of Object.keys(v.storage))v.storage[r]=0;v.surplusEMA={};v._world={cropFoodEq:Object.fromEntries(C.IDS.map(id=>[id,K.econUnitsOf(id,1)]))};return v;};
 const near=(a,b)=>assert(Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b)),a+' != '+b);`;
 execFileSync(process.execPath,['-e',setup+body],{cwd:root,env,stdio:'pipe',maxBuffer:16<<20});
}
function check(name,fn){fn();pass++;console.log('PASS '+name);}
for(const id of ['foxtail_millet','millet','rice','barley','wheat','soybean'])check(id+' only: kcal/state counted once, food price below cap',()=>run(1,`const v=mk();v.storage.${id}=10000;const f=E.t368FoodPer(v,'${id}');near(E.totalFoodEquivalent(v),10000*f);assert(f>0);assert(V.computeShadowPrices(v).food<1000);assert.equal(v.storage.food,0);`));
check('OFF keeps historical food-only price',()=>run(0,"const v=mk();v.storage.foxtail_millet=10000;assert.equal(V.computeShadowPrices(v).food,1000);"));
check('seed reserve is not edible food',()=>run(1,"const v=mk();v.storage.seed_millet=100000;v.storage.seed_rice=100000;near(E.totalFoodEquivalent(v),0);assert.equal(V.computeShadowPrices(v).food,1000);"));
check('reserveSeed crop/seed split is counted without a second reservation',()=>run(1,"const v=mk(),p=C.reserveSeed('millet',1000,0,100);v.storage.millet=p.cropUnits;v.storage.seed_millet=p.seedUnits;assert(p.seedUnits>0);near(E.totalFoodEquivalent(v),p.cropUnits*K.econUnitsOf('millet',1));"));
check('eating reduces the actual crop, and scarcity increases its aggregate price',()=>run(1,"const v=mk();v.storage.foxtail_millet=1000;const q=v.storage.foxtail_millet,f=E.t368FoodPer(v,'foxtail_millet'),a=E.totalFoodEquivalent(v),p=V.computeShadowPrices(v).food;near(E.consumeFood(v,10),0);near(v.storage.foxtail_millet,q-10/f);near(E.totalFoodEquivalent(v),a-10);assert(V.computeShadowPrices(v).food>p);assert.equal(v.storage.food,0);"));
check('normalized legacy food and preserved stocks keep their storage units',()=>run(1,"const v=mk();v.storage.food=7;v.storage.fish=3;v.storage.cooked_food=2;v.storage.dried_fish=4;v.storage.rice=10;const f=E.t368FoodPer(v,'dried_fish');assert(f>0);near(E.totalFoodEquivalent(v),7+3+2*1.12+4*f+10*E.rawGrainF('rice'));"));
check('headless/no host injection reads the same crop kcal canonical',()=>run(1,"const v=mk();v.storage.foxtail_millet=100;const a=E.totalFoodEquivalent(v);delete v._world;near(E.totalFoodEquivalent(v),a);"));
const rotten=`const L=require('./server/lots'),G=require('./server/granary-lots');let now=1000;const ms=1440000;L.setClock(()=>now*ms,ms);const v=mk();v.storage.foxtail_millet=100;const rec=(u,e)=>({k:now*ms,u,f0:1,e,t:now,m:1,w:0});assert(G.attach(v,{L:{foxtail_millet:[rec(25,1e9),rec(75,0)]}}));`;
check('expired grain is excluded without deleting stock or mutating lot records',()=>run(1,rotten+"const snap=JSON.stringify(G.dump(v));near(E.totalFoodEquivalent(v),75*K.econUnitsOf('foxtail_millet',1));assert.equal(v.storage.foxtail_millet,100);assert.equal(JSON.stringify(G.dump(v)),snap);",{T732_MOMENT:'1',T789_DISCARD:'0'}));
check('visible-lot view does not subtract spoiled grain twice',()=>run(1,rotten+"G.viewBegin();try{near(v.storage.foxtail_millet,75);near(E.totalFoodEquivalent(v),75*K.econUnitsOf('foxtail_millet',1));}finally{G.viewEnd();}",{T732_MOMENT:'1',T789_DISCARD:'1'}));
check('all-rotten lots retain the famine price and all-fresh lots release it',()=>run(1,rotten+"const a=G.ledger(v,'foxtail_millet');a[1].e=1e9;near(E.totalFoodEquivalent(v),0);assert.equal(V.computeShadowPrices(v).food,1000);a[0].e=a[1].e=0;assert(V.computeShadowPrices(v).food<1000);",{T732_MOMENT:'1',T789_DISCARD:'0'}));
check('bait: restoring the old food-only read is caught by the positive assertion',()=>run(1,"const v=mk();v.storage.foxtail_millet=10000;assert(V.computeShadowPrices(v).food<1000);const good=E.totalFoodEquivalent;E.totalFoodEquivalent=x=>x.storage.food||0;try{assert.throws(()=>assert(V.computeShadowPrices(v).food<1000),assert.AssertionError);}finally{E.totalFoodEquivalent=good;}"));
check('grain quote remains a physical item quote, not virtual food inventory',()=>run(1,"const v=mk();v.storage.rice=10000;const p=V.computeShadowPrices(v);assert(p.rice>0);assert(p.food<1000);assert.equal(v.storage.food,0);assert.equal(v.storage.rice,10000);assert(p.food!==p.rice);"));
check('browser/headless bundle uses the same aggregate kcal function',()=>run(1,"require('./sim/economy-engine.browser');const B=globalThis.EconEngine;assert(B.T1243_FARM_ON);const v=mk();v.storage.foxtail_millet=10000;v.storage.rice=100;near(B.totalFoodEquivalent(v),E.totalFoodEquivalent(v));near(B.computeShadowPrices(v).food,V.computeShadowPrices(v).food);"));
console.log('RESULT '+pass+' passed / 0 failed');
