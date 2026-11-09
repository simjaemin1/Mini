#!/usr/bin/env node
'use strict';
process.env.T1243_FARM_ON='1';
process.env.ENABLE_VILLAGES='0';process.env.ENABLE_WILDLIFE='0';process.env.ENABLE_BANDITS='0';process.env.ENABLE_ROADS='0';
process.env.DB_PATH='/tmp/t1245-seeds-'+process.pid+'.db';process.env.PORT=String(47000+process.pid%700);
const assert=require('assert'),C=require('../server/crops'),V=require('../server/villages'),B=V.__p3Bind({});
let passed=0;const check=(s,f)=>{f();passed++;console.log('PASS '+s);};
check('legacy seed mass is explicit, not historical sowing evidence',()=>{assert.equal(C.seedKgPerCell('millet'),C.SEED_KG);assert.equal(C.seedUnitsPerCell('millet'),1);});
for(const id of ['foxtail_millet','millet','rice','soybean','barley','wheat'])check(id+' crop + seed mass conserved and can refill expanded fields',()=>{const gross=C.harvestUnits(id,{supply:5,seedFresh:1});const p=C.reserveSeed(id,gross,0,10);assert(p.seedUnits>1);assert(Math.abs(gross*C.kgOf(id)-p.cropUnits*C.kgOf(id)-p.seedKg)<1e-9);assert.equal(p.seedKg,p.seedUnits*C.SEED_KG);assert.equal(p.evidence,'unverified-legacy-packet');});
check('no harvest creates no seed',()=>assert.equal(C.reserveSeed('millet',0,0,100).seedUnits,0));
check('existing seed stock stops unnecessary reservation',()=>{const p=C.reserveSeed('millet',20,100,10);assert.equal(p.cropUnits,20);assert.equal(p.seedUnits,0);});
check('small harvest cannot reserve more seed than its mass',()=>{const p=C.reserveSeed('millet',.001,0,1000);assert(p.seedKg<=.001*C.kgOf('millet'));assert(p.cropUnits>=0);});
check('perennial keeps its crop and returns no seed',()=>{const id=C.list().find(c=>C.isPerennial(c.id)).id,p=C.reserveSeed(id,10,0,20);assert.equal(p.seedUnits,0);assert.equal(p.cropUnits,10);});
function vil(){const keys=new Set(['1,1','2,1','3,1','4,1']);return {_farmSet:keys,_drySet:keys,_crop:new Map(),npcPids:[],econ:{storage:{seed_millet:0}}};}
check('headless and body use the same reserve plan without stock minting',()=>{const a=vil(),b=vil(),it={c:'millet',u:20},it2={...it},npc={pid:'test',inventory:{}};B._t1243Reaped(a,'1,1','millet',100,null,it);B._t1243Reaped(b,'1,1','millet',100,npc,it2);assert.equal(a.econ.storage.seed_millet,npc.inventory.seed_millet);assert.equal(it.u,it2.u);assert.equal(b.econ.storage.seed_millet,0);assert.equal(npc._t1243S.seed_millet,npc.inventory.seed_millet);assert(Math.abs(it.u*C.kgOf('millet')+npc.inventory.seed_millet*C.SEED_KG-20*C.kgOf('millet'))<1e-9);});
check('seed target follows existing crop cap instead of all compatible fields',()=>{const a=vil();a._farmSet=a._drySet=new Set(Array.from({length:100},(_,i)=>i+',1'));a._crop.set('0,1',{c:'millet',p:40});const n=B._t1245SeedTarget(a,'millet',100);assert(n>0&&n<100);});
check('inflight seed prevents duplicate reservation',()=>{const a=vil(),npc={pid:'own',inventory:{}},other={inventory:{seed_millet:4}},old=B.state.deps;B.state.deps={players:new Map([['other',other]])};a.npcPids=['other'];try{const p=B._t1243Reaped(a,'1,1','millet',100,npc,{c:'millet',u:20});assert.equal(p.seedUnits,0);}finally{B.state.deps=old;}});
const log=console.log,warn=console.warn;console.log=console.warn=()=>{};
try{
 const H=require('../server/zone').__testBind();console.log=log;console.warn=warn;H.__e2eFreezeZoneDay(true);const today=H.zoneGameDay();
 const player={pid:'t1245-player',playerId:'t1245-player',name:'seed',persistent:false,ws:{readyState:1,send(){}},x:5000,y:5000,vx:0,vy:0,floor:0,hp:100,maxHp:100,hunger:100,thirst:100,inventory:{},equipment:[],equipSlots:{},craftSkill:{},dishes:[],lots:{}};
 const b={id:'t1245-farm',type:'farmland',ownerId:player.playerId,x:5000,y:5000,dbId:null,data:{crop:'millet',plantedDay:today-400,seedFresh:1,farmStage:0,supply:1,w:today,td:today,wd:0,ps:0,q:1,qd:today}};
 H.buildings.set(b.id,b);
 const expected=C.harvestUnits('millet',{supply:1,seedFresh:1});
 check('actual player harvest splits crop and seed from one mass',()=>{H.tryHarvest(player);assert.equal(b.data.crop,null);assert(player.inventory.seed_millet>0);assert(Math.abs((player.inventory.millet||0)*C.kgOf('millet')+player.inventory.seed_millet*C.SEED_KG-expected*C.kgOf('millet'))<1e-8);});
 check('private NPC and player plan share the canonical calculation',()=>{const p={...player,inventory:{}};assert.deepEqual(H._harvestSeedPlan(p,'millet',20),C.reserveSeed('millet',20,0,1));});
 check('generic berry seed cannot masquerade as a crop seed under farm mode',()=>assert.equal(H._npcSeedCrop({inventory:{seed_berry:99}},80),null));
 check('typed seed is available to private NPC sowing',()=>{const id=C.list().find(c=>C.canSowOn(c.id,80)).id;assert.equal(H._npcSeedCrop({inventory:{[C.seedOf(id)]:2}},80),id);});
 console.log('PASS '+passed+' / FAIL 0');process.exit(0);
}catch(e){console.log=log;console.warn=warn;console.error(e.stack);process.exit(1);}
