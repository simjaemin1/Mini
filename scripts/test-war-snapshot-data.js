#!/usr/bin/env node
// @regress unit
// @bait 3
'use strict';
process.env.T1497_WAR_SNAP='1';
const assert=require('assert'),cp=require('child_process');
try{assert.strictEqual(typeof require('../server/villages').__p3Bind({})._warSnapPack,'function','complete snapshot product API');}catch(e){console.error('✗ complete snapshot product API absent');throw e;}
const G=require('../server/war-snapshot'),P=require('../sim/path-core');
let pass=0;function check(name,fn){try{fn();}catch(e){console.error('✗ '+name);throw e;}pass++;console.log('✓ '+name);}
if(process.argv[2]==='--pending'){
 const F=require('./lib-war-snap-fixture'),f=F.create(42);const w=f.mobilize();f.tick();
 f.H.state._warNoCollide=false;
 f.deps.isTerrainBlockedLocal=(px,py)=>Math.floor(px/32)===500&&Math.floor(py/32)>=200&&Math.floor(py/32)<=600;
 f.H._warBuildRectIndex(true);
 const b=f.H.state.warBodies.get(w.id),mem=b._snapshotProbe={};
 const way=(m)=>f.H._t804Way(m,480.5,400.5,600.5,400.5,1/15,b);
 way(mem);assert(mem._t821s&&mem._t821s.S,'native initial pop limit must expose a suspended search');
 const J=mem._t821s;assert.strictEqual(J.mem,mem);assert.strictEqual(f.H.state._t1349.live.get(J.sk),J);assert.strictEqual(f.H.state._t1338WalkLive,mem);
 const typed=!!J.S.tl;assert.strictEqual(typed,process.env.T1445_BOOT_BOUND!=='0');
 const snapshot=f.at(()=>f.H._warSnapPack()),heap=G.unpack(G.pack(P.snapshotState(J.S)));
 let loops=0;while(mem._t821s&&loops++<100000)way(mem);assert(loops<100000);const answer=JSON.stringify(mem._t804p);
 f.at(()=>f.H._warSnapRestore(snapshot));const rb=f.H.state.warBodies.get(w.id),rm=rb._snapshotProbe,rj=rm._t821s;
 for(const k of Object.keys(heap))if(!require('util').isDeepStrictEqual(P.snapshotState(rj.S)[k],heap[k]))console.error('heap-different-field',k);assert(require('util').isDeepStrictEqual(P.snapshotState(rj.S),heap),'all heap storage, map order and counters');assert.strictEqual(rj.mem,rm);assert.strictEqual(f.H.state._t1349.live.get(rj.sk),rj);assert.strictEqual(f.H.state._t1338WalkLive,rm);
 loops=0;while(rm._t821s&&loops++<100000)way(rm);assert.strictEqual(JSON.stringify(rm._t804p),answer);
 let ghost=false;
 if(typed){
  const m2=rb._snapshotGhost={};way(m2);assert(m2._t821s&&m2._t821s.G,'native shared-generation ghost exposure');const sk=m2._t821s.gx===undefined?'':m2._t821s.sx+','+m2._t821s.sy+'>'+m2._t821s.gx+','+m2._t821s.gy;
  const gs=f.at(()=>f.H._warSnapPack());f.at(()=>f.H._warSnapRestore(gs));const gm=f.H.state.warBodies.get(w.id)._snapshotGhost,gj=gm._t821s;
  assert.strictEqual(gj.G,f.H.state._t1381G.m.get(sk));assert.strictEqual(gj.A.rc,f.H.state._warRectCells);assert.strictEqual(gj.gen,f.H.state._warRectCells);assert.strictEqual(gj.A.tm,f.H.state._warTerrMemo);
  f.H._warBuildRectIndex(true);way(gm);assert(!gm._t821s||!gm._t821s.G,'generation change must rebind/replay the original native predicate');let n=0;while(gm._t821s&&n++<100000)way(gm);assert(n<100000);assert.strictEqual(JSON.stringify(gm._t804p),answer,'ghost generation replay reaches the same native path');ghost=true;
 }
 console.log(JSON.stringify({pending:true,typed,ghost,heapNodes:heap.open.n,initialPops:heap.pops,continuationCalls:loops}));process.exit(0);
}
check('미끼 · 바꾼 자리: default OFF and nonliteral flags preserve canonical saved bytes',()=>{
 const fs=require('fs'),path=require('path'),dir=require('./lib-tmp').dir('war_snapshot_off');
 try {
  const bytes=[];for(const flag of [undefined,'0','true','1']){
   const env={...process.env};if(flag===undefined)delete env.T1497_WAR_SNAP;else env.T1497_WAR_SNAP=flag;
   const file=path.join(dir,String(bytes.length)+'.json'),r=cp.spawnSync(process.execPath,[path.join(__dirname,'war-snapshot-off-child.js'),file],{env,encoding:'utf8',timeout:30000});
   assert.strictEqual(r.status,0,r.stderr);bytes.push(fs.readFileSync(file));
  }
  assert(bytes[0].equals(bytes[1]),'unset must preserve explicit OFF canonical bytes');assert(bytes[2].equals(bytes[1]),'true is not literal 1');assert(!bytes[3].equals(bytes[1]),'active native war must expose an ON checkpoint');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
check('cycles, external refs, Map/Set order, sparse arrays and all numeric atoms',()=>{
 const ext={},buf=new ArrayBuffer(40),a=new Float64Array(buf,8,3),b=new Uint8Array(buf,4,20);a[0]=Infinity;a[1]=NaN;a[2]=-0;
 const x={buf,a,b,ext,u:undefined,big:123n,map:new Map(),set:new Set([3,1,2]),sparse:new Array(5),nullObject:Object.create(null)};x.self=x;x.map.set(x,b);x.map.set('second',a);x.sparse[3]=x;
 const r=G.unpack(G.pack(x,{external:new Map([[ext,'ext']])}),{resolve:k=>k==='ext'?ext:undefined});
 assert.strictEqual(r.self,r);assert.strictEqual(r.ext,ext);assert.strictEqual(r.a.buffer,r.buf);assert.strictEqual(r.b.buffer,r.buf);assert.strictEqual(r.map.get(r),r.b);assert.deepStrictEqual([...r.set],[3,1,2]);assert.strictEqual(r.sparse[3],r);assert(!(0 in r.sparse));assert(Object.is(r.a[2],-0));assert(Number.isNaN(r.a[1]));assert.strictEqual(Object.getPrototypeOf(r.nullObject),null);
});
check('미끼 · 바꾼 자리: unregistered closure field fails without eval',()=>assert.throws(()=>G.pack({callback:()=>1}),/WAR_SNAP/));
check('미끼 · 바꾼 자리: corrupt/partial/version fields and missing registry fail closed',()=>{
 const s=G.pack({a:1});for(const m of [{...s,version:2},{...s,complete:false},{...s,sha256:'wrong'}])assert.throws(()=>G.unpack(m),/WAR_SNAP/);
 const ext={};assert.throws(()=>G.unpack(G.pack({ext},{external:new Map([[ext,'absent']])})),/missing external/);
});
for(const lean of [false,true])for(const tile of [false,true])check(`path closure/frontier exact stepwise ${lean}/${tile}`,()=>{
 P.setLean(lean);const blocked=(x,y)=>x===20&&y<60,s=P.localPathBegin(0,0,70,0,{tile,blockedStep:(fx,fy,x,y)=>blocked(x,y),maxNodes:250000});P.pathStep(s,87);
 const snapshot=G.pack(s,{project:o=>o===s?{type:'path',data:P.snapshotState(o)}:null});const r=G.unpack(snapshot,{types:['path'],revive:(o,t)=>{if(t==='path')P.resumeState(o,{blocked});}});
 assert.deepStrictEqual(P.snapshotState(r),P.snapshotState(s));let a,b;do{a=P.pathStep(s,111);b=P.pathStep(r,111);assert.deepStrictEqual(b,a);assert.deepStrictEqual(P.snapshotState(r),P.snapshotState(s));}while(!a.done);
});
for(const bound of ['0','1'])check('native pending heap + shared worker aliases, T1445='+bound,()=>{
 const r=cp.spawnSync(process.execPath,[__filename,'--pending'],{encoding:'utf8',env:{...process.env,T1445_BOOT_BOUND:bound,T1349_WAR_PATH_SHARE:'1',T1338_WALK_BUDGET:'1'},timeout:60000});
 assert.strictEqual(r.status,0,String(r.error&&r.error.code)+' '+String(r.signal)+' '+r.stderr);console.log(r.stdout.trim().split('\n').at(-1));
});
check('atomic body rows + metadata share one boundary; corrupt metadata and legacy are explicit',()=>{
 const f=require('./lib-war-snap-fixture').create(42);f.mobilize();f.tick();let stored,writes=0;
 f.H.state.db.saveVillagesAndMeta=(rows,zone,meta,day)=>{stored={rows,zone,meta,day};writes++;};
 f.at(()=>f.H._warSnapAtomicSave());assert.strictEqual(writes,1);const meta=JSON.parse(stored.meta);assert(meta.t1497WarSnap,'native metadata must contain the graph, not only a direct pack helper');G.validate(meta.t1497WarSnap);assert.strictEqual(meta.anchor.at,f.now());
 for(const r of stored.rows){const v=f.villages.find(v=>v.dbId===r.id),body=JSON.parse(r.econ)._t747Body;for(let i=0;i<body.rows.length;i++)if(body.rows[i]){const p=f.deps.players.get(v.npcPids[i]);assert.strictEqual(body.rows[i].x,p.x);assert.strictEqual(body.rows[i].y,p.y);}}
 f.H.state.db.getWorldMeta=()=>({data:JSON.stringify({...meta,t1497WarSnap:{...meta.t1497WarSnap,version:99}})});assert.throws(()=>f.H._warSnapEarly(),e=>e.code==='WAR_SNAP_INVALID');
 f.H.state.db.getWorldMeta=()=>({data:'{"t1497WarSnap":'});assert.throws(()=>f.H._warSnapEarly(),e=>e.code==='WAR_SNAP_INVALID');f.H.state.db.getWorldMeta=()=>({data:'{legacy:'});assert.doesNotThrow(()=>f.H._warSnapEarly());
 delete meta.t1497WarSnap;f.H.state.db.getWorldMeta=()=>({data:JSON.stringify(meta)});assert.doesNotThrow(()=>f.H._warSnapEarly());assert.strictEqual(writes,1);
 f.war.WARS.splice(0);f.H.state.warBodies.clear();assert.strictEqual(f.H._warSnapNeedsAtomic(),false,'new/legacy no-war save scheduling stays unchanged');
});
check('unfinished physical step cannot write a snapshot during temporary ctl release',()=>{
 const f=require('./lib-war-snap-fixture').create(42);f.mobilize();f.tick();const bc=require('../sim/battle-core'),old=bc._stepBattle;let rejected=0,writes=0;
 f.H.state.db.saveVillagesAndMeta=()=>{writes++;};bc._stepBattle=function(...args){assert.throws(()=>f.at(()=>f.H._warSnapAtomicSave()),/WAR_SNAP/);rejected++;return old.apply(this,args);};
 try{f.at(()=>f.live.stepFight([...f.H.state.warBodies.values()][0].fight));}finally{bc._stepBattle=old;}assert.strictEqual(rejected,1);assert.strictEqual(writes,0);
});
check('normal donation row-save advances the same complete war checkpoint',()=>{
 const f=require('./lib-war-snap-fixture').create(42),V=require('../server/villages');f.mobilize();f.tick();let stored,writes=0;
 f.H.state.db.updateVillageState=()=>assert.fail('individual row must not mix with an older war snapshot');f.H.state.db.saveVillagesAndMeta=(rows,z,meta)=>{stored={rows,meta:JSON.parse(meta)};writes++;};
 f.at(()=>f.H._warSnapAtomicSave());const old=stored.meta.t1497WarSnap.sha256;for(let i=0;i<20;i++)f.tick();
 const bag={wood:3};const r=V.playerVillageDeposit(f.villages[0],bag,{wood:3});assert(r.ok);assert.strictEqual(f.at(()=>V.t983Save(f.villages[0])),true);assert.strictEqual(writes,2);
 assert.notStrictEqual(stored.meta.t1497WarSnap.sha256,old,'current combat state accompanies the donation');
 assert.strictEqual(JSON.parse(stored.rows.find(r=>r.id===1).econ).storage.wood,f.villages[0].econ.storage.wood);
 const semantic=require('./test-war-snapshot').semantic;assert(require('util').isDeepStrictEqual(semantic(stored.meta.t1497WarSnap),semantic(f.at(()=>f.H._warSnapPack()))));
});
check('cold boot reconstructs every saved body above the visibility cap without spawn/RNG draws',()=>{
 const F=require('./lib-war-snap-fixture'),f=F.create(42);f.mobilize();f.day();for(let i=0;i<100;i++)f.tick();
 const snapshot=f.at(()=>f.H._warSnapPack()),saved={day:f.world.day,now:f.now(),econs:f.villages.map(v=>f.H.serializeEcon(v.econ))},ids=[...f.deps.players.keys()];
 const partial=JSON.parse(JSON.stringify(snapshot)),node=partial.graph.nodes[partial.graph.root.r];node.v=node.v.filter(([k])=>k!=='bodyIds');partial.sha256=require('crypto').createHash('sha256').update(JSON.stringify(partial.graph)).digest('hex');
 assert.throws(()=>f.at(()=>require('../server/war-snapshot-host').prepareBodies(partial,f.H.state)),e=>e.code==='WAR_SNAP_INVALID');assert.throws(()=>f.at(()=>f.H._warSnapRestore(partial)),e=>e.code==='WAR_SNAP_INVALID');
 const r=F.create(42,{saved});r.deps.players.clear();r.deps.npcs.clear();for(const v of r.villages)v.npcPids=[];let calls=0;r.deps.spawnNpc=()=>{calls++;assert.fail('gameplay spawn during saved-body reconstruction');};
 const E=require('../sim/economy-sim'),before=E.rngState();r.at(()=>require('../server/war-snapshot-host').prepareBodies(snapshot,r.H.state));assert.deepStrictEqual(E.rngState(),before);assert.strictEqual(calls,0);assert.deepStrictEqual([...r.deps.players.keys()],ids);r.at(()=>r.H._warSnapRestore(snapshot));
 const semantic=require('./test-war-snapshot').semantic;assert(require('util').isDeepStrictEqual(semantic(snapshot),semantic(r.at(()=>r.H._warSnapPack()))));
});
console.log(`WAR_SNAP data contracts ${pass}/14`);
