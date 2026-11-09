#!/usr/bin/env node
'use strict';
const path=require('path'),fs=require('fs'),crypto=require('crypto'),R=path.resolve(process.env.T1245_CODE_ROOT||path.join(__dirname,'..'));
const E=require(R+'/sim/economy-sim'),C=require(R+'/server/crops'),S=require(R+'/server/spoil'),L=require(R+'/server/lots'),G=require(R+'/server/granary-lots'),B=require(R+'/server/villages').__p3Bind({}),E2=require(R+'/sim/economy-sim-v2');
let day=0;L.setClock(()=>day*1440000,1440000);
const rows=[];let total=0,bad=0,nominal=0;
for(let id=1;id<=51;id++){
 const v=E.createVillage({initialPop:8,name:'audit-'+id});v._world={};B._t1243Seed(v,id);if(!v._t1243Seed)continue;G.attach(v,null,0);const d=G.dump(v),h=E.seedFoodDays(0);total+=v._t1243Seed.food;
 for(const c of v._t1243Seed.crops){const r=d.L[c][0],food=r.u*E.t368FoodPer(v,c),exposure=S.exposureAt(r,h,0);const spoiled=S.isSpoiled(c,exposure);if(spoiled)bad+=food;if(C.keepDaysOf(c)<=h)nominal+=food;
 let dead=null;for(let x=0;x<=800;x++)if(S.isSpoiled(c,S.exposureAt(r,x,0))){dead=x;break;}
 rows.push({villageId:id,crop:c,keep:C.get(c).keep,shelf:S.shelfOf(c),food,firstHarvest:h,initial:r,initialTemperatureC:E2.temperatureAt(0,.5,0),exposureAtHarvest:exposure,freshnessAtHarvest:S.freshnessOf(c,exposure),spoiledAtHarvest:spoiled,firstSpoiledDay:dead});
 }
}
const result={scope:'Unconsumed initial reference lots, not actual discarded fraction; sea-level climate; no feeding/trades.',on:E.T1243_FARM_ON,discard:G.T789,place:S.placeOf('granary'),q10:S.EXP,referenceTemperatureC:S.refC(),totalFood:total,nominalKeepLessThanHarvestFood:nominal,nominalFraction:nominal/total,exposureSpoiledFood:bad,exposureSpoiledFraction:bad/total,source:Object.fromEntries(['server/crops.js','server/spoil.js','server/granary-lots.js','server/villages.js'].map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(R+'/'+f)).digest('hex')])),rows};
if(process.env.T1245_AUDIT_OUT)fs.writeFileSync(process.env.T1245_AUDIT_OUT,JSON.stringify(result,null,2));console.log(JSON.stringify({nominalFraction:result.nominalFraction,exposureSpoiledFraction:result.exposureSpoiledFraction,rows:rows.length,discard:result.discard}));
