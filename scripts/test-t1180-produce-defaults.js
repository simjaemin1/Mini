#!/usr/bin/env node
// @regress
'use strict';
process.env.T1192_FISH_SPECIES='0';
const assert=require('assert'),fs=require('fs'),path=require('path'),Module=require('module'),{spawnSync}=require('child_process');
const ROOT=path.resolve(__dirname,'..'),flags=['T312_FISH_ACT','T325_WOOD_ACT','T347_FORAGE_ACT'];
let pass=0,fail=0;
function check(name,fn){try{fn();pass++;console.log('PASS '+name);}catch(e){fail++;console.log('FAIL '+name+': '+e.message);}}
if(!process.env.T1180_MUTANT)for(const val of [undefined,'0','1',''])check('defaults '+String(val),()=>{
 const env={...process.env};for(const k of flags){delete env[k];if(val!==undefined)env[k]=val;}
 const r=spawnSync(process.execPath,['-e',`const E=require('./sim/economy-sim');console.log(JSON.stringify(${JSON.stringify(flags)}.map(k=>E[k])));`],{cwd:ROOT,env,encoding:'utf8'});
 assert.strictEqual(r.status,0,r.stderr);assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)),flags.map(()=>val==='1'));   // ★PM land1048: 끔 기본(켬 판 세계 전멸 · 켤 날 T1202)
});
for(const k of flags)process.env[k]='1';   // ★PM land1048: 끔 기본 — 아래 몸 길 검사는 켬 판으로
process.env.ENABLE_VILLAGES='0';
if(process.env.T1180_MUTANT){
 const old=Module._extensions['.js'],kind=process.env.T1180_MUTANT;
 Module._extensions['.js']=function(m,file){const target=path.join(ROOT,kind==='formula'?'sim/economy-sim.js':'server/villages.js');if(file!==target)return old(m,file);let src=fs.readFileSync(file,'utf8');
  if(kind==='cell'){const hit=src.match(/function _t312Take\(vil, day, key, want\) \{[\s\S]*?\n\}/);assert(hit);src=src.replace(hit[0],"function _t312Take(vil, day, key, want) { return _actTake(_t312Day(vil,day),key,want); }");}
  else{const needle=kind==='formula'?'if (productionFormulaOff(v, npc.currentJob)) return;':'if (Math.hypot(npc.x - S.tx, npc.y - S.ty) > 44)';assert(src.includes(needle));src=src.replace(needle,kind==='formula'?'if (false) return;':'if (false)');}
  m._compile(src,file);
 };
}
const V=require('../server/villages'),P=V.__labProbe._t1180Probe,E=require('../sim/economy-sim'),F=require('../server/freshfish');
const state=V.__p3Bind({}).state,oldDeps=state.deps;state.deps={players:new Map()};
const id=F.ids().find(x=>F.kgOf(x)>0),kg=F.kgOf(id);
function fixture(){return {v:{ccx:0,ccy:0,_granList:[],econ:{storage:{fish:0},treasury:{fish:0},_t312Cells:1,_fishOutLast:10}},p:{pid:'fish-test',simJob:'fisher',x:1000,y:16,inventory:{[id]:2},_t312U:20,_t312Kg:kg*2}};}
check('physical host suppresses all formula byproducts even before sites exist',()=>{
 const E2=require('../sim/economy-sim-v2');
 for(const job of ['fisher','lumberjack','forager']){
  const make=()=>{const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0];v.land={...v.land,water:1,wood:1,fertility:1,stone:1};v.storage.food=10000;for(const p of v.npcs)p.currentJob=job;return {w,v};};
  const a=make(),b=make();assert(!E.productionFormulaOff(a.v,job));E.bindProductionActs(b.w);assert(E.productionFormulaOff(b.v,job));
  E.tickVillage(a.v,1);E.tickVillage(b.v,1);
  const sum=v=>Object.values(v.dailyProductionBuf||{}).reduce((n,x)=>n+x,0);
  assert(sum(a.v)>0,job+' positive control');assert.strictEqual(sum(b.v),0,job+' formula leaked');
 }
});
check('an econ resource callback cannot replace a walking producer in a physical host',()=>{
 const E2=require('../sim/economy-sim-v2');const make=()=>{const w=E2.createWorldV2({seed:1020,villageCount:1}),v=w.villages[0];v.storage.food=10000;v.lastStats={health:1,happiness:.5,production:2};for(const p of v.npcs)p.currentJob='forager';w.forageRealItems=['herb'];let issued=0;w.forageTakeFn=(_v,n)=>{issued+=n;return {herb:n};};return {w,v,issued:()=>issued};};
 const a=make(),b=make();E.bindProductionActs(b.w);E.tickVillage(a.v,1);E.tickVillage(b.v,1);assert(a.issued()>0,'legacy callback positive control');assert.strictEqual(b.issued(),0);assert.strictEqual(b.v.dailyProductionBuf.herb||0,0);
});
check('physical host disables anonymous bulk crews and old uncarried packs',()=>{
 const src=fs.readFileSync(path.join(ROOT,'server/villages.js'),'utf8'),w={},v={_world:w};E.bindProductionActs(w);
 const ln=src.match(/const _ln = (.*?);/)[1],count=new Function('_t449S','_bodyOnly','_lnE','return ('+ln+');');assert.strictEqual(count(false,E.productionFormulaOff(v,'lumberjack'),7),0);assert.strictEqual(count(false,E.productionFormulaOff({},'lumberjack'),7),7);
 for(const m of src.matchAll(/const _fg = (.*productionFormulaOff.*?);/g)){const f=new Function('_t449S','_lifeEcon','vil','_fgE','return ('+m[1]+');');assert.strictEqual(f(false,()=>E,{econ:v},7),0);assert.strictEqual(f(false,()=>E,{econ:{}},7),7);}
 assert(src.includes('if (T717_WOOD_HAND && _on && !_bodyOnly) _t717PackIn(vil);'));assert(src.includes('if (T733_FELL_LOOT && _on && !_bodyOnly) _t733PackIn(vil);'));
 const pack=src.match(/const _pkIn = (.*?);/)[1],f=new Function('_on','_keep','_lifeEcon','vil','_t544PackIn','return ('+pack+');');let calls=0;assert.strictEqual(f(true,['herb'],()=>E,{econ:v},()=>{calls++;return 5;}),0);assert.strictEqual(calls,0);assert.strictEqual(f(true,['herb'],()=>E,{econ:{}},()=>{calls++;return 5;}),5);assert.strictEqual(calls,1);
});
check('missing fishing site cannot reactivate the legacy catch clock',()=>{const src=fs.readFileSync(path.join(ROOT,'server/villages.js'),'utf8'),m=src.match(/else if \((!_lifeEcon\(\)\.T312_FISH_ACT && .*?)\) \{/);assert(m);const f=new Function('_lifeEcon','npc','now','return ('+m[1]+');');assert.strictEqual(f(()=>E,{},10000),false);assert.strictEqual(f(()=>({T312_FISH_ACT:false}),{},10000),true);assert.strictEqual(f(()=>({T312_FISH_ACT:false}),{_lastFishAt:9000},10000),false);});
check('a whole fish can use the unchanged village quota across shoreline cells',()=>{const v={econ:{_t312Cells:200,_fishOutLast:5}};assert.strictEqual(P.fishTake(v,1,'a',3),3);assert.strictEqual(P.fishTake(v,1,'b',3),0);assert.strictEqual(P.fishTake(v,1,'b',2),2);assert.strictEqual(v._t312.took,5);assert.strictEqual(P.fishTake(v,2,'a',3),3);});
check('failed real stock draw refunds the fishing quota; over-quota catch draws nothing',()=>{const v={econ:{_t312Cells:200,_fishOutLast:5}},saved=state.deps.t312DrawFishAt;let calls=0;try{state.deps.t312DrawFishAt=()=>{calls++;return false;};assert.strictEqual(P.fishCatch(v,1,0,0,3,1,10000),0);assert.strictEqual(v._t312.took,0);assert.strictEqual(v._t312.n,0);state.deps.t312DrawFishAt=()=>{calls++;return true;};assert.strictEqual(P.fishCatch(v,1,0,0,3,1,10001),3);assert.strictEqual(P.fishCatch(v,1,1,0,3,1,10002),0);assert.strictEqual(calls,2);}finally{state.deps.t312DrawFishAt=saved;}});
check('an overweight next fish is rejected before stock and quota are spent',()=>{const {v,p}=fixture(),C=require('../server/carry'),saved=state.deps.t312DrawFishAt;let calls=0;try{state.deps.t312DrawFishAt=()=>{calls++;return true;};p._t312Kg=C.CFG.CAP_KG-1;assert.strictEqual(P.fishCatch(v,1,0,0,1,2,10000,p),0);assert.strictEqual(calls,0);assert.strictEqual(p._t1180FullFish,true);assert.strictEqual(p.inventory[id],2);assert.strictEqual(v._t312,undefined);}finally{state.deps.t312DrawFishAt=saved;}});
check('whole fish draw consumes the same natural stock and refuses a partial fish',()=>{const F=require('../server/fishing'),saved=new Map(F.fishCells);try{F.fishCells.clear();assert.strictEqual(F.drawWholeStock(NaN,0,1,10000),0);let cells=0,saves=0;for(let y=-F.CFG.DRAW_R;y<=F.CFG.DRAW_R;y++)for(let x=-F.CFG.DRAW_R;x<=F.CFG.DRAW_R;x++)if(x*x+y*y<=F.CFG.DRAW_R*F.CFG.DRAW_R)cells++;assert.strictEqual(F.drawWholeStock(0,0,cells*F.CFG.CELL_K+1,10000,()=>saves++),0);assert.strictEqual(saves,0);assert.strictEqual(F.deficitStock(),0);assert.strictEqual(F.drawWholeStock(0,0,1,10000,()=>saves++),1);assert(saves>0);assert(Math.abs(F.deficitStock()-1)<1e-9);}finally{F.fishCells.clear();for(const [k,v]of saved)F.fishCells.set(k,v);}});
check('wood and forage alone open the actual unobserved movement predicate',()=>{const src=fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8').match(/function _t316WalkAlways\(npc\) \{[\s\S]*?\n\}/)[0],make=new Function('_t316Econ','SimVillages','return ('+src+');');for(const [flag,job]of [['T325_WOOD_ACT','lumberjack'],['T347_FORAGE_ACT','forager']]){const f=make({[flag]:true},{chiefWalking:()=>false});assert(f({simVillageId:1,simJob:job}));assert(!f({simVillageId:1,simJob:'warrior'}));assert(!f({simJob:job}));}assert(!make({},{} )({simVillageId:1,simJob:'lumberjack'}));assert(make({T312_FISH_ACT:true},{})({simVillageId:1,simJob:'warrior'}));});
check('NPC and player share water targeting inside the canonical reach',()=>{const src=fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8'),fn=src.match(/function _castTargetFor\(player, spotAt\) \{[\s\S]*?\n\}/)[0],sp={water:true},Fishing={CFG:{REACH_PX:96},spotScore:()=>({rate:1,size:1}),spotAt:()=>sp},make=new Function('Fishing','_fishSea','isWaterTileLocal','_terrain','ZONE_ID','return ('+fn+');'),pick=make(Fishing,()=>undefined,(x,y)=>x===48&&y===16,{},'test');assert.strictEqual(pick({x:16,y:16}).x,48);const t=pick({x:16,y:16},()=>sp);assert.strictEqual(t.x,48);assert.strictEqual(t.y,16);assert.strictEqual(pick({x:1000,y:16},()=>sp),null);assert(src.includes('t312FishTargetAt: (p,spot) => _castTargetFor(p,spot)'));});
check('a cast stays on its real water cell; leaving reach or dry water aborts it',()=>{const {v,p}=fixture(),deps=state.deps;state.deps={...deps,isWaterTileLocal:()=>true,t312FishTargetAt:()=>null};try{p.x=16;p.y=16;p._fishSpotX=9999;const cast={key:'1,0',day:1,x:48,y:16,cx:1,cy:0,biteAt:10000,windowMs:1000,sp:id,kg};p._t340={...cast};const got=P.cast(v,p,10000,1,0,{});assert.strictEqual(got.id,id);assert.strictEqual(got.cx,1);assert.strictEqual(got.cy,0);assert.strictEqual(v._t340Hook,1);p.x=1000;p._t340={...cast};assert.strictEqual(P.cast(v,p,10000,1,0,{}),'none');assert.strictEqual(v._t340Hook,1);p.x=16;p._t340={...cast};state.deps.isWaterTileLocal=()=>false;assert.strictEqual(P.cast(v,p,10000,1,0,{}),'none');assert.strictEqual(v._t340Hook,1);}finally{state.deps=deps;}});
check('full fish walks to the hall before any deposit',()=>{
 const {v,p}=fixture(),t=10000;
 assert(P.returnStep(v,p,t,.3,.7,1,true));assert(P.returnStep(v,p,t+P.storeMs()+1,.3,.7,1,true));
 assert.strictEqual(v.econ.storage.fish,0);assert.strictEqual(p.inventory[id],2);assert.strictEqual(p._t312U,20);
 assert.strictEqual(p.targetX,16);assert.strictEqual(p.targetY,16);
 p.x=16;p.y=16;const a=t+P.storeMs()+2;P.returnStep(v,p,a,.3,.7,1,true);
 assert.strictEqual(v.econ.storage.fish,0);P.returnStep(v,p,a+P.storeMs()+1,.3,.7,1,true);
 assert.strictEqual(p.inventory[id],1);assert.strictEqual(p._t312U,10);assert.strictEqual(p._t312Kg,kg);
 assert(Math.abs(v.econ.storage.fish+v.econ.treasury.fish+p._t312U-20)<1e-6);
});
check('zero demand keeps every fish and credited unit',()=>{const {v,p}=fixture();v.econ._fishOutLast=0;assert.strictEqual(P.fishDeliver(v,p),0);assert.strictEqual(p.inventory[id],2);assert.strictEqual(p._t312U,20);assert.strictEqual(p._t312Kg,kg*2);});
check('whole fish only; second accepted fish is deposited once',()=>{const {v,p}=fixture();v.econ._fishOutLast=9;assert.strictEqual(P.fishDeliver(v,p),0);v.econ._fishOutLast=10;assert.strictEqual(P.fishDeliver(v,p),10);assert.strictEqual(p.inventory[id],1);v.econ._fishOutLast=20;assert.strictEqual(P.fishDeliver(v,p),10);assert.strictEqual(p.inventory[id],0);assert.strictEqual(p._t312U,0);assert.strictEqual(p._t312Kg,0);assert.strictEqual(P.fishDeliver(v,p),0);assert(Math.abs(v.econ.storage.fish+v.econ.treasury.fish-20)<1e-6);});
check('credit without a physical fish cannot enter storage',()=>{const {v,p}=fixture();p.inventory={};assert.strictEqual(P.fishDeliver(v,p),0);assert.strictEqual(v.econ.storage.fish,0);assert.strictEqual(p._t312U,20);});
check('sea species use the same partial deposit and keep rejected fish',()=>{const S=require('../server/seafish'),sea=S.ids().find(x=>!F.ids().includes(x)&&S.kgOf(x)>0);assert(sea);const {v,p}=fixture();p.inventory={[sea]:2};p._t312Kg=S.kgOf(sea)*2;assert.strictEqual(P.fishDeliver(v,p),10);assert.strictEqual(p.inventory[sea],1);assert.strictEqual(p._t312U,10);assert.strictEqual(p._t312Kg,S.kgOf(sea));});
state.deps=oldDeps;
if(!process.env.T1180_MUTANT)check('mutant removing arrival check is caught',()=>{const r=spawnSync(process.execPath,[__filename],{cwd:ROOT,env:{...process.env,T1180_MUTANT:'1'},encoding:'utf8'});assert.strictEqual(r.status,1,r.stderr);assert(r.stdout.includes('FAIL full fish walks to the hall before any deposit'),r.stdout);});
if(!process.env.T1180_MUTANT)check('mutant restoring formula production is caught',()=>{const r=spawnSync(process.execPath,[__filename],{cwd:ROOT,env:{...process.env,T1180_MUTANT:'formula'},encoding:'utf8'});assert.strictEqual(r.status,1,r.stderr);assert(r.stdout.includes('FAIL physical host suppresses all formula byproducts even before sites exist'),r.stdout);});
if(!process.env.T1180_MUTANT)check('mutant restoring per-cell fish fractions is caught',()=>{const r=spawnSync(process.execPath,[__filename],{cwd:ROOT,env:{...process.env,T1180_MUTANT:'cell'},encoding:'utf8'});assert.strictEqual(r.status,1,r.stderr);assert(r.stdout.includes('FAIL a whole fish can use the unchanged village quota across shoreline cells'),r.stdout);});
console.log(`PASS ${pass} / FAIL ${fail}`);process.exitCode=fail?1:0;
