#!/usr/bin/env node
'use strict';
process.env.T419_STONE_REAL='1';process.env.T400_BUILD_ACT='0';
const assert=require('assert'),E=require('../sim/economy-sim'),E2=require('../sim/economy-sim-v2');
for(const kind of ['tool','sword','spare']){
 const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0],N=v.npcs.length;
 v.storage.food=10000;v.storage.stone=1000;v.storage.tool=kind==='sword'?1000:kind==='spare'?(N-1)*3:0;v.storage.weapon=kind==='spare'?2:0;v.storage.copper=0;v.storage.tin=0;v._swordFrac=1;
 v.counts={mason:1,farmer:kind==='sword'?0:N-1,warrior:kind==='sword'?N-1:0};
 v.npcs.forEach((p,i)=>{p.currentJob=i===0?'mason':kind==='sword'?'warrior':'farmer';p.age=30;});
 E.tickVillage(v,1);
 const tools=v._stoneToolMade||0,swords=v._stoneWeaponMade||0,used=tools*E.stoneRealPer('tool').stone+swords*E.stoneRealPer('stoneSword').stone;
 assert(used>0,'positive mason production required: '+kind);
 if(kind==='tool')assert(tools>0);if(kind==='sword')assert(swords>0);if(kind==='spare')assert(tools>0&&swords>0,'tool and spare-sword production both required');
 assert((v._consDay?.stone||0)+1e-9>=used,`actual mason stone ${used} absent from consumption flow ${v._consDay?.stone}`);
 assert(Math.abs(1000-v.storage.stone-v._consDay.stone)<1e-9,'stone consumption must match actual stock decrease: '+kind);
 console.log(JSON.stringify({kind,tools,swords,recipeStone:used,recordedStone:v._consDay.stone}));
}
assert.equal(E.stoneWorkStock({npcs:[]}),E.stoneRealPer('tool').stone*E.JOBS.mason.base);
assert.equal(E.stoneWorkStock({npcs:[{currentJob:'mason',skills:{masonry:10}}]}),E.stoneRealPer('tool').stone*E.JOBS.mason.base*(1+10*.05));
console.log('PASS actual material consumption and recipe-based planning');
