#!/usr/bin/env node
'use strict';
const fs=require('fs'),os=require('os'),path=require('path'),assert=require('assert'),{spawnSync}=require('child_process');
const root=process.env.T1246_CODE_ROOT||path.resolve(__dirname,'..');
if(process.env.T1246_CASE){
 const E=require(root+'/sim/economy-sim'),V=require(root+'/sim/economy-sim-v2'),K=require(root+'/server/kcal'),C=require(root+'/server/crops');
 const make=()=>{const v=E.createVillage({initialPop:10});for(const r in v.storage)v.storage[r]=0;v._world={cropFoodEq:{}};return v;};
 const v=make();v.storage.rice=500;const px=V.computeShadowPrices(v).food;
 if(process.env.T1243_FARM_ON==='0'){assert.equal(px,1000);console.log('PASS OFF retains food-only price');process.exit(0);}
 assert(px>0&&px<1000,'grain-only warehouse must not pin food price at 1000');
 assert(Math.abs(E.totalFoodEquivalent(v)-500*K.econUnitsOf('rice',1))<1e-8,'rice calorie/state conversion exactly once');
 const full=E.totalFoodEquivalent(v);v.storage.seed_rice=1e9;v.storage.seed_berry=1e9;v.storage.wood=1e9;assert.equal(E.totalFoodEquivalent(v),full,'seeds and nonfood excluded');
 v.storage.rice=1000;assert(V.computeShadowPrices(v).food<px,'additional grain lowers aggregate food price');
 const q=make();q.storage.foxtail_millet=100;assert(Math.abs(E.totalFoodEquivalent(q)-100*K.econUnitsOf('foxtail_millet',1))<1e-8,'crop calories work without injected world table');
 q._world.cropFoodEq.foxtail_millet=K.econUnitsOf("foxtail_millet",1);const before=E.totalFoodEquivalent(q),stock=q.storage.foxtail_millet;E.consumeFood(q,1);assert(q.storage.foxtail_millet<stock,'eating reduces actual crop item');assert(Math.abs(E.totalFoodEquivalent(q)-(before-1))<1e-6,'eating and food sum agree');
 const r=make();r.storage.food=3;r.storage.fish=4;r.storage.meat=5;r.storage.cooked_food=2;r.storage.dried_fish=6;
 assert.equal(E.totalFoodEquivalent(r),3+4+5+2*K.COOKED_FACTOR+6*E.PRESERVE_FOOD_FACTOR,'normalized econ units and preserved yield are not converted twice');
 assert.equal(E.totalFoodProductionEquivalent({rice:20},v),20*K.econUnitsOf('rice',1),'production uses same canonical factor');
 E.setLotHook({freshOf:(_v,item)=>item==='rice'?{spoiledU:1000}:null});assert.equal(E.totalFoodEquivalent(v),0,'spoiled grain is excluded');E.setLotHook(null);
 const G=require(root+'/server/granary-lots'),L=require(root+'/server/lots');let day=0;L.setClock(()=>day*1440000,1440000);const aged=make();aged.storage.food=10;G.attach(aged,null,0);G.ledger(aged,'food')[0].it='millet';day=120;E.setLotHook(G.hooks);assert.equal(E.totalFoodEquivalent(aged),0,'actual ledger excludes rotten underlying grain, not the generic food shelf');E.setLotHook(null);
 const p1=V._settleParamsV2(v,'rice'),p2=V._settleParamsV2(q,'rice');assert(p1&&p2,'item-specific grain trade curve remains available');assert.equal(p1.physical,v.storage.rice,'rice trade capacity is physical rice');assert.equal(p1.sEff,v.storage.rice,'rice price keeps its own commodity stock');assert.equal(V._settleParamsV2(v,'food').physical,0,'aggregate calories cannot create physical food cargo');
 const vm=require('vm'),ctx={console:{log(){}},process:{env:{T1243_FARM_ON:'1'}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(root+'/sim/economy-engine.browser.js','utf8'),ctx);const B=ctx.EconEngine,bv=B.createVillage({initialPop:10});for(const r in bv.storage)bv.storage[r]=0;bv.storage.rice=500;bv._world={cropFoodEq:{}};assert.equal(B.totalFoodEquivalent(bv),full,'ON browser and Node share the same calorie sum');assert.equal(B.computeShadowPrices(bv).food,px,'ON browser and Node share the same grain-only food price');
 console.log('PASS grain-only, monotone price, seed, actual consumption, milling once, normalized/preserved units, production, spoilage and trade');process.exit(0);
}
const run=(codeRoot,on)=>spawnSync(process.execPath,[__filename],{env:{...process.env,T1246_CASE:'1',T1246_CODE_ROOT:codeRoot,T1243_FARM_ON:on,T859_FOOD_HUNGER:'0'},encoding:'utf8'});
for(const on of ['1','0']){const r=run(root,on);process.stdout.write(r.stdout);process.stderr.write(r.stderr);assert.equal(r.status,0,'T1246 gate '+on);}
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'t1246-mutant-'));
try{
 fs.cpSync(path.join(root,'sim'),path.join(tmp,'sim'),{recursive:true});for(const d of ['server','public','node_modules'])fs.symlinkSync(path.join(root,d),path.join(tmp,d),'dir');
 const p=path.join(tmp,'sim/economy-sim-v2.js'),s=fs.readFileSync(p,'utf8'),from=/function _t859Stock\(v, r\) \{[^\n]+\}/;
 assert(from.test(s),'mutation anchor');fs.writeFileSync(p,s.replace(from,'function _t859Stock(v, r) { return v.storage[r] || 0; }'));
 const bad=run(tmp,'1');assert.notEqual(bad.status,0,'old food-only read must fail');if(!bad.stderr.includes('grain-only warehouse'))process.stderr.write(bad.stderr);assert(bad.stderr.includes('grain-only warehouse'),'mutation fails at the targeted invariant');console.log('PASS mutant old food-only read is rejected');
}finally{fs.rmSync(tmp,{recursive:true,force:true});}
