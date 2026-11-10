#!/usr/bin/env node
// @regress
'use strict';
if(process.env.T1243_FARM_ON!=='1'){require('node:child_process').execFileSync(process.execPath,[__filename],{env:{...process.env,T1243_FARM_ON:'1'},stdio:'inherit'});return;}
const assert=require('node:assert/strict'),V=require('../server/villages'),D=require('../server/des');let n=0;
const ok=(name,fn)=>{fn();n++;console.log('PASS '+name);};
const B=V.__p3Bind({}),state=B.state,old={byDbId:state.byDbId,dayMs:state.dayMs};
const vil={dbId:123,econ:{storage:{},npcs:[]},_t1248Farm:new Map()},npc={pid:'actor',simVillageId:123,x:16,y:16};
state.byDbId=new Map([[123,vil]]);state.dayMs=1440000;
try{
 ok('OFF host never admits work',()=>{V.desInstall(null);npc._jobT=5000;npc.simJob='farmer';assert.equal(V.desWorkOf(npc,1000),null);});
 V.desInstall({work:true,queues:false});
 ok('farmer cooldown keeps its existing deadline',()=>assert.deepEqual(V.desWorkOf(npc,1000),{kind:'farm-wait',until:5000}));
 delete npc._jobT;
 ok('clear finish uses canonical field cost and retained progress',()=>{npc._lifeTask={k:'clear',cx:0,cy:0,px:16,py:16,prog:25};npc._workT=1000;assert.deepEqual(V.desWorkOf(npc,1000),{kind:'clear',until:1000+B._t1221ClearS(vil,'0,0')*state.dayMs/1440-25});});
 ok('leaving the work site prevents stationary admission',()=>{npc.x=1000;assert.equal(V.desWorkOf(npc,1000),null);npc.x=16;});
 ok('clear interruption keeps exact elapsed time beyond old tick clamp',()=>{V.desAdvance(npc,11000);assert.equal(npc._desWorkElapsed,10000);});
 delete npc._lifeTask;delete npc._workT;delete npc._desWorkElapsed;
 ok('farm interruption retains partial shared-cell work once',()=>{vil._t1248Farm.set('crop',{total:100,progress:10});npc._desFarm={sig:'crop',at:1000};V.desAdvance(npc,1040);assert.equal(vil._t1248Farm.get('crop').progress,50);V.desAdvance(npc,1040);assert.equal(vil._t1248Farm.get('crop').progress,50);assert.equal(V.desWorkOf(npc,2000).until,2050);});
 ok('farm side-state roundtrip preserves Map and progress',()=>{const P=V.__labProbe._t740Probe,s=P.pack(vil);assert.deepEqual(P.dec(s._t1248Farm),vil._t1248Farm);});
 delete npc._desFarm;
 ok('queued actor parks until an explicit wake/phase boundary',()=>{npc._desWait='123:crop:0,0';assert.deepEqual(V.desWorkOf(npc,2000),{kind:'queue',until:Infinity});delete npc._desWait;});
 ok('mine event deadline comes from specialty canonical',()=>{npc._t724T=1000;npc._t724Site={};assert.equal(V.desWorkOf(npc,1000).until,1000+require('../server/specialty').MINE_SWING_MS);delete npc._t724T;delete npc._t724Site;});
 ok('granary draw/store deadlines use the production constants',()=>{const P=V.__labProbe._t1181Probe;npc._granTask={at:1000,draw:true};assert.equal(V.desWorkOf(npc,1000).until,1000+P.drawMs());npc._granTask.draw=false;assert.equal(V.desWorkOf(npc,1000).until,1000+P.storeMs());delete npc._granTask;});
 ok('hauling source wait uses the same draw deadline',()=>{npc._t1181Haul={at:1000,leg:'source'};assert.equal(V.desWorkOf(npc,1000).until,1000+V.__labProbe._t1181Probe.drawMs());delete npc._t1181Haul;});
 ok('artisan event deadline comes from facility canonical',()=>{npc.simJob='smith';npc._t1196W={ph:'work',at:1000};assert.equal(V.desWorkOf(npc,1000).until,1000+require('../server/facility').CRAFT_MS[B.T1196_KIND.smith]);delete npc._t1196W;});
 ok('T742 production codec preserves heap and FIFO data',()=>{const q=new D.Dispatcher(),f=new D.Facility('crop',1);q.park('a',1500,{progress:3});f.request('a',1000);f.request('c',1100);f.request('b',1050);let restored=null;V.t742Bind('test.t1248',()=>({heap:q.snapshot(),facility:f.snapshot()}),s=>{restored=s;});const P=V.__labProbe._t742Probe;P.in(JSON.parse(JSON.stringify(P.out())));assert(restored);const g=D.Facility.restore(restored.facility,5000);assert.equal(g.release('a'),'b');const h=D.Dispatcher.restore(restored.heap,5000),got=[];h.runUntil(6500,(id,t,data)=>got.push([id,t,data.progress]));assert.deepEqual(got,[['a',6500,3]]);});
}finally{V.desInstall(null);Object.assign(state,old);}
console.log(`RESULT ${n} passed / 0 failed`);
