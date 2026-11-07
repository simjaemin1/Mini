#!/usr/bin/env node
'use strict';
for (const k of ['T312_FISH_ACT','T325_WOOD_ACT','T347_FORAGE_ACT']) if (process.env[k] == null) process.env[k] = '1';   // ★PM land1048: 생산 셋 끔 기본(켤 날 T1202) — 이 하네스는 몸 길 켬 판을 잰다
if (process.env.T561_ROSTER_BODY == null) process.env.T561_ROSTER_BODY = '0';   // ★PM land1048: T1183 이 T561 켬 기본 — 이 하네스의 "옛 T561/T904 끔" 칸은 끔 판
process.env.ENABLE_VILLAGES='0';
process.env.T1146_STONE_RULE='0';
const assert=require('assert'),E=require('../sim/economy-sim'),V=require('../server/villages');
const api=V.__p3Bind({}),P=V.__labProbe._t1180Probe,H=V.__labProbe._t1146Probe,state=api.state,old=state.deps;
state.deps={players:new Map()};
let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.error('FAIL '+name,e.stack);}}
function fixture(bound=true){
 const world={};if(bound)E.bindProductionActs(world);
 return {v:{ccx:0,ccy:0,_granList:[],econ:{_world:world,storage:{stone:0,pebble:0},treasury:{}}},p:{pid:'stone-return',simJob:'miner',x:1000,y:16,inventory:{stone:3,pebble:2}}};
}
check('legacy rock-yield switch remains OFF',()=>assert.strictEqual(H.ON,false));
check('stone-only physical body walks, waits and deposits once',()=>{
 const {v,p}=fixture();assert.strictEqual(P.returnStep(v,p,10000,.8,.7,1),true);assert.strictEqual(p.targetX,16);assert.strictEqual(v.econ.storage.stone,0);
 p.x=p.y=16;P.returnStep(v,p,11000,.8,.7,1);P.returnStep(v,p,11000+P.storeMs()-1,.8,.7,1);assert.strictEqual(p.inventory.stone,3);
 P.returnStep(v,p,11000+P.storeMs(),.8,.7,1);assert.strictEqual(p.inventory.stone,0);assert.strictEqual(p.inventory.pebble,0);
 assert.strictEqual(v.econ.storage.stone+(v.econ.treasury.stone||0),3);assert.strictEqual(v.econ.storage.pebble+(v.econ.treasury.pebble||0),2);
 P.returnStep(v,p,20000,.8,.7,1);assert.strictEqual(v.econ.storage.stone+(v.econ.treasury.stone||0),3);
});
check('legacy world retains its old OFF path',()=>{const {v,p}=fixture(false);assert.strictEqual(P.returnStep(v,p,10000,.8,.7,1),false);assert.strictEqual(H.handIn(v,p),0);assert.strictEqual(p.inventory.stone,3);});
check('physical hand-in cannot teleport from a remote callback',()=>{const {v,p}=fixture();assert.strictEqual(H.handIn(v,p),0);assert.strictEqual(p.inventory.stone,3);});
check('partial acceptance leaves the rejected material on its owner',()=>{
 const {v,p}=fixture(),save=E.actToGranary;p.x=p.y=16;
 try{E.actToGranary=(v,k,n,...a)=>save(v,k,Math.min(n,1),...a);H.handIn(v,p);assert.strictEqual(p.inventory.stone,2);assert.strictEqual(p.inventory.pebble,1);assert(Math.abs(p.inventory.stone+v.econ.storage.stone+(v.econ.treasury.stone||0)-3)<1e-9);}finally{E.actToGranary=save;}
});
check('full physical stone cargo returns during daytime',()=>{const {v,p}=fixture();p.inventory={stone:6,ore_chunk:1};assert.strictEqual(require('../server/carry').npcTotalKg(p),25);assert.strictEqual(P.returnStep(v,p,10000,.3,.7,1),true);assert.strictEqual(p.targetX,16);assert.strictEqual(v.econ.storage.stone,0);});
check('physical wood path works with legacy T561/T904 switches OFF',()=>{
 const W=V.__labProbe._t561Probe,{v,p}=fixture();assert.strictEqual(W.bodyDay,false);assert.strictEqual(W.bodyDayOn(v),true);assert.strictEqual(W.bodyDayOn(fixture(false).v),false);
 v.econ._t325Cells=1;v.econ._woodOutLast=20;v.econ.storage.wood=0;p.simJob='lumberjack';p.inventory={wood:4};p.x=p.y=16;
 const n=W.ladder(v,p,10000);assert.strictEqual(n,4);assert.strictEqual(p.inventory.wood,0);assert(Math.abs(v.econ.storage.wood+(v.econ.treasury.wood||0)-4)<1e-9);assert.strictEqual(W.ladder(v,p,10001),0);
});
check('standing-tree selection skips an empty nearest cell',()=>{
 const W=V.__labProbe._t561Probe,{p}=fixture(),trees=[{cx:0,cy:0,x:16,y:16},{cx:1,cy:0,x:48,y:16}];p.x=p.y=16;
 state.deps.t325TreesAtCell=(x)=>x===1?[{}]:[];assert.strictEqual(W.standing(trees,p,0,trees[0]),trees[1]);state.deps.t325TreesAtCell=()=>[];assert.strictEqual(W.standing(trees,p,0,trees[0]),null);
});
check('stone bag returns when another whole stone cannot fit, even before25kg',()=>{const {v,p}=fixture();p.inventory={stone:6};assert.strictEqual(require('../server/carry').npcTotalKg(p),24);assert.strictEqual(P.returnStep(v,p,10000,.3,.7,1),true);assert.strictEqual(p.targetX,16);});
check('forager selects a real rock without creating stock or changing jobs',()=>{
 const {v,p}=fixture();v.econ.npcs=new Array(6).fill({});p.simJob='forager';p.inventory={};
 const rock={id:'real-rock',type:'rock',hp:200,x:16,y:16};state.deps.qtResources=()=>({queryCircle:()=>[rock]});
 assert.strictEqual(H.stoneWork(v,p,10000,.3,.7,1),true);assert.strictEqual(p.gatherTarget,rock.id);assert.strictEqual(p.simJob,'forager');assert.deepStrictEqual(p.inventory,{});assert.strictEqual(v.econ.storage.stone,0);assert.strictEqual(rock.hp,200);
});
check('stone gathering stops at actual demand or when no real rock exists',()=>{
 const {v,p}=fixture();v.econ.npcs=new Array(6).fill({});p.simJob='forager';p.inventory={};v.econ.storage.stone=10000;
 assert.strictEqual(H.stoneWork(v,p,10000,.3,.7,1),false);v.econ.storage.stone=0;state.deps.qtResources=()=>({queryCircle:()=>[]});assert.strictEqual(H.stoneWork(v,p,10000,.3,.7,1),false);assert.deepStrictEqual(p.inventory,{});
});
check('another whole stone must fit before any quarry hit is requested',()=>{
 const {v,p}=fixture();v.econ.npcs=new Array(6).fill({});p.simJob='forager';p.inventory={stone:6};const rock={id:'r',type:'rock',hp:200,x:16,y:16};state.deps.qtResources=()=>({queryCircle:()=>[rock]});
 assert.strictEqual(H.stoneWork(v,p,10000,.3,.7,1),true);assert.strictEqual(p.gatherTarget,null);assert.strictEqual(p._t720.k,1);assert.strictEqual(p.inventory.stone,6);assert.strictEqual(rock.hp,200);
});
check('finishing-rock byproducts also fit within the same body limit',()=>{
 const {v,p}=fixture();v.econ.npcs=new Array(6).fill({});p.simJob='forager';p.inventory={stone:5};const rock={id:'r',type:'rock',hp:1,x:16,y:16};state.deps.qtResources=()=>({queryCircle:()=>[rock]});state.deps.t325LootOf=()=>({stone:1,pebble:2});
 assert.strictEqual(H.stoneWork(v,p,10000,.3,.7,1),true);assert.strictEqual(p.gatherTarget,null);assert.strictEqual(p._t720.k,1);assert.strictEqual(p.inventory.stone,5);assert.strictEqual(rock.hp,1);
});
state.deps=old;
console.log(`PASS ${pass} / FAIL ${fail}`);process.exitCode=fail?1:0;
