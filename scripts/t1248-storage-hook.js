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
   F.reset();let points;outer:for(let r=1;r<100;r++)for(let dy=-r;dy<=r;dy++)for(const dx of[-r,r]){const x=(Math.floor(p.x/32)+dx)*32+16,y=(Math.floor(p.y/32)+dy)*32+16;if(!F.blocked(x,y)&&!F.blocked(x+32,y)&&!F.wall(x+32,y,x,y,0,null)){points=[x,y,x+32,y];break outer;}}
   assert(points);F.put(p,points[0],points[1]);p.body={cold:.2,fatigue:.3};p.hunger=100;p.thirst=100;
   const r=new F.DES.Route(points,()=>32,now,16),survival=F.DB.survivalPlan(p,now,false,F.services),S={k:'walk',r,t0:now,until:r.t1,P:null,pn:1,pi:0,d:F.V.econDay(),hp:p.hp,work:false,survival};
   assert(survival.ok);F.DB.survivalAdvance(p,survival,now,F.services);p._des=S;assert(F.space.park(p,S));F.heap.park(p.pid,r.T[1],{kind:'walk'},p._sh);F.tick.delete(p.pid);F.movers.delete(p.pid);
   const saveAt=now+250;Date.now=()=>saveAt;F.pulse(saveAt);
   const B=F.V.__p3Bind({}),state=B.state;state.dayFreeze=true;
   const rows=state.villages.filter(v=>v.econ&&Number.isFinite(v.dbId)).map(v=>({id:v.dbId,econ:B.serializeEcon(v.econ),pop:v.econ.npcs.length,day:state.world.day}));
   const meta=B._t728Meta(),snap=JSON.parse(meta).t742['zone.desWork'],a=snap.actors.find(a=>a.identity===String(p._sh));
   assert(a);assert.equal(a.position.x,points[0]+8);assert.equal(a.wakeAt-saveAt,250);
   state.db.saveVillagesAndMeta(rows,state.zoneId,meta,state.world.day|0);
   fs.writeFileSync(file,JSON.stringify({now:saveAt,day:state.world.day,actor:a,remaining:a.wakeAt-saveAt,rows:rows.length,db:process.env.DB_PATH}));
  }else{
   const saved=JSON.parse(fs.readFileSync(file)),a=saved.actor,q=[...players.values()].find(q=>String(q._sh)===a.identity);
   assert(q,'stable identity respawned');assert(q._des,'walking event restored');
   assert.equal(q.x,a.position.x);assert.equal(q.y,a.position.y);
   assert.equal(F.heap.actors.get(q.pid).at-now,saved.remaining);
   assert.equal(F.heap.actors.get(q.pid).order,a.orderId);
   assert.equal(q._des.survival.elapsedMs,a.data.survival.elapsedMs);assert.deepEqual(q.body,a.fields.body);
  }
  fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:true,now}));process.exit(0);
 }catch(e){fs.writeFileSync(process.env.T577_OUT+'.storage.json',JSON.stringify({stage,pass:false,error:e.stack,now}));process.exit(1);}
};
