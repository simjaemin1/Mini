'use strict';
// Two real zone processes and the production SQLite save transaction.
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
require('./t1248-body-hook');
const fs=require('fs'),assert=require('assert/strict');
let ran=false;
global.__t1241Probe=function(now,players){
 const F=global.__t1248BodyFixture,p=[...players.values()].find(p=>p.isNpc&&p.simVillageId&&p._sh!=null);
 if(ran||!F||!p)return;ran=true;
 const file=process.env.T1248_STORAGE_EXPECT,stage=process.env.T1248_STORAGE_STAGE;
 try{
  if(stage==='save'){
   F.reset();const cohort=[...players.values()].filter(q=>q!==p&&q.isNpc&&q.simVillageId===p.simVillageId&&q._sh!=null),waiter=cohort[0],worker=cohort[1],farm=F.V.__p3Bind({}).state.byDbId.get(p.simVillageId)?._farmSet;assert(waiter&&worker,'three real NPC identities');let points;outer:for(let r=1;r<100;r++)for(let dy=-r;dy<=r;dy++)for(const dx of[-r,r]){const x=(Math.floor(p.x/32)+dx)*32+16,y=(Math.floor(p.y/32)+dy)*32+16;if(!farm?.has(Math.floor(x/32)+','+Math.floor(y/32))&&!F.blocked(x,y)&&!F.blocked(x+32,y)&&!F.wall(x+32,y,x,y,0,null)){points=[x,y,x+32,y];break outer;}}
   assert(points);F.put(p,points[0],points[1]);p.body={cold:.2,fatigue:.3};p.hunger=100;p.thirst=100;
   const r=new F.DES.Route(points,()=>32,now,16),survival=F.DB.survivalPlan(p,now,false,F.services),S={k:'walk',r,t0:now,until:r.t1,P:null,pn:1,pi:0,d:F.V.econDay(),hp:p.hp,work:false,survival};
   assert(survival.ok);F.DB.survivalAdvance(p,survival,now,F.services);p._des=S;assert(F.space.park(p,S));F.heap.park(p.pid,r.T[1],{kind:'walk'},p._sh);F.tick.delete(p.pid);F.movers.delete(p.pid);
   const hold=(body,k,until,work)=>{body.hunger=100;body.thirst=100;const plan=F.DB.survivalPlan(body,now,false,F.services);assert(plan.ok);const state={k,t0:now,until,r:null,P:null,pn:0,pi:0,d:F.V.econDay(),hp:body.hp,work,survival:plan};body._des=state;assert(F.space.park(body,state));F.heap.park(body.pid,until,{kind:k},body._sh);F.tick.delete(body.pid);F.movers.delete(body.pid);};
   const key='contract:sqlite-persist';assert(F.acquire(p,key,1,now));assert(!F.acquire(waiter,key,1,now+1));hold(waiter,'queue',now+1000,false);
   F.put(worker,points[0],points[1]);worker._lifeAct='개간';worker._lifeTask={k:'clear',cx:Math.floor(worker.x/32),cy:Math.floor(worker.y/32),px:worker.x,py:worker.y,prog:7};worker._workT=now;const task=F.V.desWorkOf(worker,now);assert.equal(task.kind,'clear');assert(task.until>now+250);hold(worker,'clear',task.until,true);
   const saveAt=now+250;Date.now=()=>saveAt;F.pulse(saveAt);
   const B=F.V.__p3Bind({}),state=B.state;state.dayFreeze=true;
   const rows=state.villages.filter(v=>v.econ&&Number.isFinite(v.dbId)).map(v=>({id:v.dbId,econ:B.serializeEcon(v.econ),pop:v.econ.npcs.length,day:state.world.day}));
   const meta=B._t728Meta(),snap=JSON.parse(meta).t742['zone.desWork'],a=snap.actors.find(a=>a.identity===String(p._sh));
   assert(a);assert.equal(a.position.x,points[0]+8);assert.equal(a.wakeAt-saveAt,250);
   state.db.saveVillagesAndMeta(rows,state.zoneId,meta,state.world.day|0);
   const workRow=snap.actors.find(a=>a.identity===String(worker._sh));assert.equal(workRow.workState.clear.progress,257);assert.equal(workRow.fields._lifeTask.prog,257);
   fs.writeFileSync(file,JSON.stringify({now:saveAt,day:state.world.day,actor:a,remaining:a.wakeAt-saveAt,rows:rows.length,db:process.env.DB_PATH,waiter:snap.actors.find(a=>a.identity===String(waiter._sh)),worker:workRow,facility:snap.facilities.find(f=>f.name===key)}));
  }else{
   const saved=JSON.parse(fs.readFileSync(file)),a=saved.actor,q=[...players.values()].find(q=>String(q._sh)===a.identity);
   assert(q,'stable identity respawned');assert(q._des,'walking event restored');
   assert.equal(q.x,a.position.x);assert.equal(q.y,a.position.y);
   assert.equal(F.heap.actors.get(q.pid).at-now,saved.remaining);
   assert.equal(F.heap.actors.get(q.pid).order,a.orderId);
   assert.equal(q._des.survival.elapsedMs,a.data.survival.elapsedMs);assert.deepEqual(q.body,a.fields.body);
   const waiter=[...players.values()].find(p=>String(p._sh)===saved.waiter.identity),worker=[...players.values()].find(p=>String(p._sh)===saved.worker.identity);assert(waiter&&worker);assert(waiter._des&&worker._des);assert.equal(F.heap.actors.get(waiter.pid).at-now,saved.waiter.wakeAt-saved.now);assert.equal(F.heap.actors.get(worker.pid).at-now,saved.worker.wakeAt-saved.now);
   assert.deepEqual(F.V.desCaptureWork(worker),saved.worker.workState);assert.equal(worker._lifeTask.prog,257);assert.equal(worker._workT,now);
   const facility=F.facilities.get(saved.facility.name),shift=now-saved.now;assert.deepEqual([...facility.busy],[q.pid]);assert.deepEqual(facility.q,saved.facility.q.map(e=>({...e,who:waiter.pid,t:e.t+shift})));assert.equal(facility.q[0].t-now,saved.facility.q[0].t-saved.now);
  }
  fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:true,now}));process.exit(0);
 }catch(e){fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:false,error:e.stack,now}));process.exit(1);}
};
