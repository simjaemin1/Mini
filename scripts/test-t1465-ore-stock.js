#!/usr/bin/env node
// @regress
// @old-red-also scripts/migrate-db-ore-only.js
// @bait 8
'use strict';
const assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),{spawnSync}=require('child_process');
const ROOT=path.join(__dirname,'..'),mut=process.env.T1465_MUTANT||'',scenario=process.env.T1465_CASE||'';
const mutations={
 decrement:['sim/ore-stock.js','s: stock - got','s: stock'],
 shared:['sim/ore-stock.js','b.cells[p.cell.key] =','b.cells[v.id + p.cell.key] ='],
 double:['sim/ore-stock.js','if (host && host.body(v)) return 0;','if (host && host.body(v)) return host.consume(p.cell.cx,p.cell.cy,units);'],
 refill:['sim/ore-stock.js','r.s = S.oreRegen(r.s, day - r.day);','r.s = S.oreRegen(r.s, day - r.day) + S.ORE_K;'],
 restore:['sim/ore-stock.js','const r = b.cells[key];','const r = null;'],
 off:['sim/ore-stock.js',"process.env.T1465_ORE_STOCK === '1'","process.env.T1465_ORE_STOCK !== '0'"],
 fertility:['scripts/migrate-db-ore-only.js','const next = { ...land };','const next = { ...land, fertility: 0 };'],
 preview:['scripts/migrate-db-ore-only.js','dbPath,apply=false,','dbPath,apply=true,']
};
if(scenario){
 if(scenario==='off')delete process.env.T1465_ORE_STOCK;else process.env.T1465_ORE_STOCK='1';
 if(mut){const Module=require('module'),load=Module._extensions['.js'],[file,a,b]=mutations[mut];Module._extensions['.js']=function(m,f){if(f!==path.join(ROOT,file))return load(m,f);const s=fs.readFileSync(f,'utf8');assert.strictEqual(s.split(a).length-1,1,'mutation site count');console.log('MUTATED 1');m._compile(s.replace(a,b),f);};}
 const O=require('../sim/ore-stock'),S=require('../server/specialty');
 const cell={key:'test:1,1',cx:1,cy:1,mix:{tin:1}},w={day:0},npc={currentJob:'miner',skills:{mining:5}};
 const v={id:'a',_world:w,land:{oreMix:{tin:1},_oreStockCells:{teamSize:2,cells:[cell]}},npcs:[npc]};
 const p=()=>O.plan(v,npc);
 const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
 if(scenario==='decrement'){const got=O.consume(v,p(),10,npc);assert(got>0);close(O.read(w,cell),S.ORE_K-got*require('../server/weights').kgOf('ore')/S.mineChunkKg(5));}
 if(scenario==='shared'){const b={...v,id:'b'};O.consume(v,p(),10,npc);assert(O.plan(b,npc).response<1,'shared village must observe depletion');}
 if(scenario==='double'){let stock=500;O.bindHost(w,{read:()=>stock,consume:(_x,_y,n)=>{stock-=n;return n;},body:()=>true});const bodyCut=10;stock-=bodyCut;O.consume(v,p(),10,npc);assert.strictEqual(stock,490,'econ deducted after physical body');stock=0;assert.strictEqual(O.forecast(v),0,'player empty must be visible immediately');}
 if(scenario==='refill'){O.consume(v,p(),10,npc);w.day=1000000;assert(O.read(w,cell)<=S.ORE_K,'refill exceeded canonical K');}
 if(scenario==='restore'){O.consume(v,p(),10,npc);const before=O.read(w,cell),r=JSON.parse(JSON.stringify(w));close(O.read(r,cell),before);w.day=r.day=14;close(O.read(r,cell),O.read(w,cell));assert(before<S.ORE_K);}
 if(scenario==='off'){const before=JSON.stringify(w);const got=O.consume(v,p(),10,npc);assert.strictEqual(got,10);assert.strictEqual(JSON.stringify(w),before,'OFF state bytes changed');assert.strictEqual(O.ON,false);}
 if(['fertility','preview'].includes(scenario)){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'t1465-')),dbPath=path.join(dir,'copy.db'),backupPath=path.join(dir,'before.json');
  const {DatabaseSync}=require('node:sqlite'),db=new DatabaseSync(dbPath);
  db.exec('CREATE TABLE villages(id INTEGER PRIMARY KEY,name TEXT,cx INTEGER,cy INTEGER,zone TEXT,econ_state TEXT)');
  const initial={land:{fertility:1.23,water:.7,wood:.9,territory:[[1,2]],ore:1,oreMix:{tin:1},oreP:.2,oreDist:3,tin:1},storage:{food:11}};
  db.prepare('INSERT INTO villages VALUES(1,\'fixture\',1,2,\'hanbando\',?)').run(JSON.stringify(initial));db.close();
  const M=require('./migrate-db-ore-only'),compute=()=>({ore:.5,oreMix:{copper:1},oreP:.3,oreDist:2,tin:0});
  const read=()=>{const d=new DatabaseSync(dbPath,{readOnly:true});try{return JSON.parse(d.prepare('SELECT econ_state FROM villages').get().econ_state);}finally{d.close();}};
  try{
   if(scenario==='preview'){const bytes=fs.readFileSync(dbPath);M.migrate({dbPath,backupPath,compute});assert.deepStrictEqual(fs.readFileSync(dbPath),bytes,'preview wrote database');assert(!fs.existsSync(backupPath),'preview wrote backup');}
   else{M.migrate({dbPath,backupPath,apply:true,compute});const result=read();for(const k of ['fertility','water','wood','territory'])assert.deepStrictEqual(result.land[k],initial.land[k],'unrelated land changed: '+k);assert.deepStrictEqual(result.storage,initial.storage);assert.strictEqual(M.migrate({dbPath,backupPath,apply:true,compute}).changed,0,'not idempotent');M.migrate({dbPath,apply:true,rollbackPath:backupPath});assert.deepStrictEqual(read(),initial,'rollback differs');}
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
 console.log('CASE PASS '+scenario);process.exit(0);
}
// Product wiring first: an already-depleted physical fixture must lower job value.
// This asserts behaviour on the old engine without importing the new module.
const wiring=spawnSync(process.execPath,['-e',`
 process.env.T1465_ORE_STOCK='1';
 const assert=require('assert'),E=require('./sim/economy-sim'),S=require('./server/specialty');
 const n={currentJob:'miner',skills:{mining:5}},w={day:1};
 const v={name:'wire',id:'wire',_world:w,npcs:[n],land:{ore:1,oreMix:{tin:1},_oreStockCells:{teamSize:2,cells:[{key:'wire:1,1',cx:1,cy:1,mix:{tin:1}}]}}};
 const before=E.oreValue(v,()=>1);
 w._oreStock={version:1,cells:{'wire:1,1':{s:S.ORE_K/2,day:1}}};
 assert(E.oreValue(v,()=>1)<before,'oreValue ignored remaining physical yield');
 v.land.oreMix={copper:1};
 assert(E.oreValue(v,id=>id==='ore_tin'?10:1)>1,'oreValue used stale village mineral mix');
`],{cwd:ROOT,env:process.env,encoding:'utf8'});
if(wiring.status!==0){console.error('✗ product value wiring: '+wiring.stdout+wiring.stderr);process.exit(1);}
console.log('PASS product value wiring');
// Real economy production -> stock conservation, then exact whole-world resume.
const native=spawnSync(process.execPath,['-e',`
 process.env.T1465_ORE_STOCK='1';
 const assert=require('assert'),fs=require('fs'),os=require('os'),path=require('path'),E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),S=require('./server/specialty'),W=require('./server/weights'),L=require('./scripts/lib-eq-lab');
 const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];w.day=1;w.priceBase=null;
 for(const k in v.counts)v.counts[k]=0;v.counts.miner=v.npcs.length;
 v.land.ore=1;v.land.oreMix={tin:1};v.land.oreP=null;v.land._oreStockCells={teamSize:2,cells:[{key:'native:1,1',cx:1,cy:1,mix:{tin:1}}]};
 for(const n of v.npcs){n.currentJob='miner';n.lastJobChangeDay=1;n.skills.mining=5;}
 v.storage.food=1000;E.tickVillage(v,w.day);
 const units=v.dailyProductionBuf.ore_tin||0;assert(units>0,'native miner produced no ore');
 const left=E.OreStock.read(w,v.land._oreStockCells.cells[0]);
 assert(Math.abs((S.ORE_K-left)-units*W.kgOf('ore')/S.mineChunkKg(5))<1e-7,'native output/stock mass mismatch');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'t1465-resume-')),file=path.join(dir,'world.v8.gz');
 try{L.save(file,w,E);for(let i=0;i<30;i++)E2.tickWorldV2(w);const a=L.fpDay(w);const r=L.load(file,E).world;for(let i=0;i<30;i++)E2.tickWorldV2(r);assert.deepStrictEqual(L.fpDay(r),a,'whole-world stock resume differs');}finally{fs.rmSync(dir,{recursive:true,force:true});}
`],{cwd:ROOT,env:process.env,encoding:'utf8'});
assert.strictEqual(native.status,0,'native production/resume\n'+native.stdout+native.stderr);
console.log('PASS native production and whole-world resume');
// Actual body entry points and the host bridge share the same player cell record.
const body=spawnSync(process.execPath,['-e',`
 Object.assign(process.env,{T1465_ORE_STOCK:'1',T1266_ORE_BODY:'1',T1188_ORE_SPLIT:'1',T724_MINE_ACT:'1',T427_WORK_REACH:'0',ENABLE_VILLAGES:'0'});
 const assert=require('assert'),E=require('./sim/economy-sim'),V=require('./server/villages'),S=require('./server/specialty');
 const w={day:1},n={currentJob:'miner',skills:{mining:5}},cell={key:'test:2,0',cx:2,cy:0,mix:{tin:1}},e={name:'body',_world:w,storage:{food:1000},treasury:{},land:{ore:1,oreMix:{tin:1},_oreStockCells:{teamSize:2,cells:[cell]}},counts:{miner:1},npcs:[n]};E.bindProductionActs(w);
 const v={name:'body',ccx:0,ccy:0,_oreCells:[{cx:2,cy:0,p:.5}],_granList:[],npcPids:['a'],_mineLvl:5,econ:e},p={pid:'a',simVillageId:1,simJob:'miner',x:80,y:16,inventory:{}};let stock=S.ORE_K;
 const H=V.__p3Bind({world:w,dayMs:1440000,epoch:0,zoneId:'test',villages:[v],econV2:{},deps:{players:new Map([['a',p]]),oreStockAt:()=>stock,oreConsumeAt:(_x,_y,q)=>{const got=Math.min(q,stock);stock-=got;return got;},oreMixAt:()=>({tin:1}),oreMineralAt:()=> 'tin'}}),P=V.__labProbe._t1188Probe;
 P.mine(v,p,1000,1);P.mine(v,p,61000,1);assert.strictEqual(stock,S.ORE_K-1,'body did not debit exactly one chunk');assert(p.inventory.ore_chunk>0);
 const before=stock;E.OreStock.consume(e,E.OreStock.plan(e,n),10,n);P.bulk(v);assert.strictEqual(stock,before,'body and econ double debit');assert(!w._oreStock,'shadow ledger created in physical host');
 stock=0;assert.strictEqual(E.oreValue(e,()=>1),0,'player depletion not immediately visible');
`],{cwd:ROOT,env:process.env,encoding:'utf8'});
assert.strictEqual(body.status,0,'native body host\n'+body.stdout+body.stderr);
console.log('PASS native body host and immediate player depletion');
const bundled=spawnSync(process.execPath,[path.join(__dirname,'t1465-bundle-check.js')],{cwd:ROOT,env:process.env,encoding:'utf8'});
assert.strictEqual(bundled.status,0,'bundle ON parity\n'+bundled.stdout+bundled.stderr);
console.log('PASS bundle ON mapped/shared-cell parity');
let count=0;
function check(name,label){
 for(const mutant of ['',name]){
  const r=spawnSync(process.execPath,[__filename],{cwd:ROOT,env:{...process.env,T1465_CASE:name,T1465_MUTANT:mutant},encoding:'utf8'}),s=r.stdout+r.stderr;
  if(!mutant)assert.strictEqual(r.status,0,name+' positive\n'+s);
  else{assert.strictEqual(r.status,1,name+' mutant not red\n'+s);assert(s.includes('MUTATED 1'),name+' mutation not loaded');assert(s.includes('AssertionError'),name+' failed by crash\n'+s);}
 }
 count++;console.log('✓ '+label);
}
check('decrement','미끼 차감 누락 · 바꾼 자리 1 → 재고 보존 assertion 빨강');
check('shared','미끼 마을별 공유 장부 · 바꾼 자리 1 → 이웃 잔량 assertion 빨강');
check('double','미끼 몸 이중 차감 · 바꾼 자리 1 → 몸 뒤 장부 assertion 빨강');
check('refill','미끼 되참 K 초과 · 바꾼 자리 1 → 정본 상한 assertion 빨강');
check('restore','미끼 복원 시 만재 · 바꾼 자리 1 → 저장 잔량 assertion 빨강');
check('off','미끼 끔 상태 변경 · 바꾼 자리 1 → 끔 바이트 assertion 빨강');
check('fertility','미끼 비옥도 변경 · 바꾼 자리 1 → 비광종 보존 assertion 빨강');
check('preview','미끼 미리보기 쓰기 · 바꾼 자리 1 → 읽기 전용 assertion 빨강');
console.log(`=== test-t1465-ore-stock 결과: ${count+4} 통과 / 0 실패 · 미끼 ${count} ===`);
