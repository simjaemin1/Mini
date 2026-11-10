'use strict';
// Two real zone processes and the production SQLite save transaction.
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
require('./t1248-body-hook');
const fs=require('fs'),assert=require('assert/strict');
const Module=require('module'),compile=Module.prototype._compile;
Module.prototype._compile=function(s,f){if(process.env.T1248_STORAGE_STAGE==='resume'&&f.endsWith('/server/zone.js')){const a='let nextPid = 1;';assert.equal(s.split(a).length,2);s=s.replace(a,'let nextPid = 10001;');}if(process.env.T1248_STORAGE_DISABLE_REKEY&&f.endsWith('/server/villages.js')){const a='if(ids.has(job.pid))job.pid=ids.get(job.pid);';assert.equal(s.split(a).length,2);s=s.replace(a,'if(job.id!=='+Number(process.env.T1248_STORAGE_DISABLE_REKEY)+'&&ids.has(job.pid))job.pid=ids.get(job.pid);');}return compile.call(this,s,f);};
let ran=false;
global.__t1241Probe=function(now,players){
 const F=global.__t1248BodyFixture,p=[...players.values()].find(p=>p.isNpc&&p.simVillageId&&p._sh!=null);
 if(ran||!F||!p)return;ran=true;
 const file=process.env.T1248_STORAGE_EXPECT,stage=process.env.T1248_STORAGE_STAGE;
 try{
  if(stage==='save'){
   F.reset();const cohort=[...players.values()].filter(q=>q!==p&&q.isNpc&&q.simVillageId===p.simVillageId&&q._sh!=null),waiter=cohort[0],worker=cohort[1],artisan=cohort[2],vil=F.V.__p3Bind({}).state.byDbId.get(p.simVillageId),farm=vil?._farmSet;assert(waiter&&worker&&artisan,'four real NPC identities');let points;outer:for(let r=1;r<100;r++)for(let dy=-r;dy<=r;dy++)for(const dx of[-r,r]){const x=(Math.floor(p.x/32)+dx)*32+16,y=(Math.floor(p.y/32)+dy)*32+16;if(!farm?.has(Math.floor(x/32)+','+Math.floor(y/32))&&!F.blocked(x,y)&&!F.blocked(x+32,y)&&!F.wall(x+32,y,x,y,0,null)){points=[x,y,x+32,y];break outer;}}
   assert(points);F.put(p,points[0],points[1]);p.body={cold:.2,fatigue:.3};p.hunger=100;p.thirst=100;
   const r=new F.DES.Route(points,()=>32,now,16),survival=F.DB.survivalPlan(p,now,false,F.services),S={k:'walk',r,t0:now,until:r.t1,P:null,pn:1,pi:0,d:F.V.econDay(),hp:p.hp,work:false,survival};
   assert(survival.ok);F.DB.survivalAdvance(p,survival,now,F.services);p._des=S;assert(F.space.park(p,S));F.heap.park(p.pid,r.T[1],{kind:'walk'},p._sh);F.tick.delete(p.pid);F.movers.delete(p.pid);
   const hold=(body,k,until,work)=>{body.hunger=100;body.thirst=100;const plan=F.DB.survivalPlan(body,now,false,F.services);assert(plan.ok);const state={k,t0:now,until,r:null,P:null,pn:0,pi:0,d:F.V.econDay(),hp:body.hp,work,survival:plan};body._des=state;assert(F.space.park(body,state));F.heap.park(body.pid,until,{kind:k},body._sh);F.tick.delete(body.pid);F.movers.delete(body.pid);};
   const key='contract:sqlite-persist';assert(F.acquire(p,key,1,now));assert(!F.acquire(waiter,key,1,now+1));hold(waiter,'queue',now+1000,false);
   F.put(worker,points[0],points[1]);worker._lifeAct='개간';worker._lifeTask={k:'clear',cx:Math.floor(worker.x/32),cy:Math.floor(worker.y/32),px:worker.x,py:worker.y,prog:7};worker._workT=now;const task=F.V.desWorkOf(worker,now);assert.equal(task.kind,'clear');assert(task.until>now+250);hold(worker,'clear',task.until,true);
   const E=require(require('path').join(require('path').dirname(process.argv[1]),'../sim/economy-sim')),e=vil.econ,T=E.__t1196;E.bindProductionActs(e._world);e._t1196Seats={...(e._t1196Seats||{}),mason:2};e._t1196UsedDay=-1;
   const craft=(body,phase)=>{body.simJob='mason';const person=e.npcs[vil.npcPids.indexOf(body.pid)];if(person)person.currentJob='mason';const before=T.begin(e,'mason',F.V.econDay());assert(before,'canonical artisan request');assert(e.storage.stone>=2);e.storage.stone-=2;e.storage.tool=(e.storage.tool||0)+.9;e.treasury.tool=(e.treasury.tool||0)+.1;T.end(e,{currentJob:'mason'},before,F.V.econDay());E.t1196Unhide(e);const job=e._t1196Q.at(-1);assert.equal(E.artisanTake(e,job.id),1);job.pid=body.pid;body._t1196J=job.id;body._desArtisanId=job.id;body._t1196W={ph:phase,at:phase==='work'?now:0,tx:body.x,ty:body.y,fac:'tool'};assert(F.acquire(body,String(vil.dbId)+':artisan:'+job.id,1,now));return job;};
   const artisanJob=craft(artisan,'work');artisan._lifeAct='제작';const art=F.V.desWorkOf(artisan,now);assert.equal(art.kind,'artisan');hold(artisan,'artisan',art.until,true);const walkingJob=craft(p,'go');
   const saveAt=now+250;Date.now=()=>saveAt;F.pulse(saveAt);
   const B=F.V.__p3Bind({}),state=B.state;state.dayFreeze=true;
   const rows=state.villages.filter(v=>v.econ&&Number.isFinite(v.dbId)).map(v=>({id:v.dbId,econ:B.serializeEcon(v.econ),pop:v.econ.npcs.length,day:state.world.day}));
   const meta=B._t728Meta(),snap=JSON.parse(meta).t742['zone.desWork'],a=snap.actors.find(a=>a.identity===String(p._sh));
   assert(a);assert.equal(a.position.x,points[0]+8);assert.equal(a.wakeAt-saveAt,250);
   state.db.saveVillagesAndMeta(rows,state.zoneId,meta,state.world.day|0);
   const workRow=snap.actors.find(a=>a.identity===String(worker._sh));assert.equal(workRow.workState.clear.progress,257);assert.equal(workRow.fields._lifeTask.prog,257);
   fs.writeFileSync(file,JSON.stringify({now:saveAt,day:state.world.day,actor:a,remaining:a.wakeAt-saveAt,rows:rows.length,db:process.env.DB_PATH,waiter:snap.actors.find(a=>a.identity===String(waiter._sh)),worker:workRow,artisan:snap.actors.find(a=>a.identity===String(artisan._sh)),artisanJob:artisanJob.id,walkingJob:walkingJob.id,facility:snap.facilities.find(f=>f.name===key)}));
  }else{
   const saved=JSON.parse(fs.readFileSync(file)),a=saved.actor,q=[...players.values()].find(q=>String(q._sh)===a.identity);
   assert(q,'stable identity respawned');fs.writeFileSync(process.env.T577_OUT+'.fallback.json',JSON.stringify({held:!!q._des,tick:F.tick.has(q.pid),mover:F.movers.has(q.pid),unsafe:!!q._desRestoreUnsafe}));assert.notEqual(q.pid,a.id,'fixture really remapped runtime pid');assert(q._des&&q._des.k==='walk','walking event restored');
   assert.equal(q.x,a.position.x,'saved walking position x');assert.equal(q.y,a.position.y,'saved walking position y');
   assert.equal(F.heap.actors.get(q.pid).at-now,saved.remaining);
   assert.equal(F.heap.actors.get(q.pid).order,a.orderId);
   assert.equal(q._des.survival.elapsedMs,a.data.survival.elapsedMs);assert.deepEqual(q.body,a.fields.body);
   const artisan=[...players.values()].find(p=>String(p._sh)===saved.artisan.identity),vil=F.V.__p3Bind({}).state.byDbId.get(q.simVillageId),job=vil.econ._t1196Q.find(j=>j.id===saved.artisanJob);fs.writeFileSync(process.env.T577_OUT+'.links.json',JSON.stringify({oldArtisanPid:saved.artisan.id,newArtisanPid:artisan?.pid,jobPid:job?.pid,walkingUnstartedAt:q._t1196W?.at,expectedUnstartedAt:0,artisanHeld:!!artisan?._des,artisanTick:artisan?F.tick.has(artisan.pid):false,artisanMover:artisan?F.movers.has(artisan.pid):false}));
   assert.equal(q._t1196W.at,0,'unstarted artisan clock sentinel');assert(artisan?._des,'artisan event restored');assert.equal(job.pid,artisan.pid,'artisan request owner remapped');assert.equal(artisan._t1196W.at-now,saved.artisan.fields._t1196W.at-saved.now);assert.equal(F.heap.actors.get(artisan.pid).at-now,saved.artisan.wakeAt-saved.now);
   const waiter=[...players.values()].find(p=>String(p._sh)===saved.waiter.identity),worker=[...players.values()].find(p=>String(p._sh)===saved.worker.identity);assert(waiter&&worker);assert(waiter._des&&worker._des);assert.equal(F.heap.actors.get(waiter.pid).at-now,saved.waiter.wakeAt-saved.now);assert.equal(F.heap.actors.get(worker.pid).at-now,saved.worker.wakeAt-saved.now);
   assert.deepEqual(F.V.desCaptureWork(worker),saved.worker.workState);assert.equal(worker._lifeTask.prog,257);assert.equal(worker._workT,now);
   const facility=F.facilities.get(saved.facility.name),shift=now-saved.now;assert.deepEqual([...facility.busy],[q.pid]);assert.deepEqual(facility.q,saved.facility.q.map(e=>({...e,who:waiter.pid,t:e.t+shift})));assert.equal(facility.q[0].t-now,saved.facility.q[0].t-saved.now);
  }
  fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:true,now}));process.exit(0);
 }catch(e){fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:false,error:e.stack,now}));process.exit(1);}
};
