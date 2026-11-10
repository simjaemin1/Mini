'use strict';
if(!process.env.T577_SEED||!/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
process.env.T1248_STORAGE_STAGE='nopoll';require('./t1248-body-hook');
const fs=require('fs'),assert=require('assert/strict'),Module=require('module'),compile=Module.prototype._compile;
const visits={};let held=null,calls=0;
global.__t1248Visit=(name,p)=>{if(p===held&&p._des)visits[name]=(visits[name]||0)+1;};
Module.prototype._compile=function(s,f){if(f.endsWith('/server/zone.js')){
 for(const name of ['_inputTOStep','_stairStepP','_fallStepP','_gaugeStep','_hpRegenStep','_gaugeNetStep','_fishPollOne','npcStep']){
  const re=new RegExp('(function '+name+'\\(p(?:[,)]|$)[^{]*\\{)');
  // npcStep names its actor npc; all other helpers name it p.
  const actual=name==='npcStep'?/(function npcStep\(npc,[^{]*\{)/:re;
  assert(actual.test(s),'instrument '+name);s=s.replace(actual,'$1 global.__t1248Visit('+JSON.stringify(name)+','+(name==='npcStep'?'npc':'p')+');');
 }
 if(process.env.T1248_NOPOLL_BAIT==='1'){
  const start=s.indexOf('function _rebuildSpatialInc('),end=s.indexOf('function rebuildSpatialIndex(',start),part=s.slice(start,end),needle='(_desHeapOn ? _desMovers : players).values()';assert(part.includes(needle));s=s.slice(0,start)+part.replace(needle,'players.values()')+s.slice(end);
 }
 s+='\nglobal.__t1248HumanIndex=_desHumans;\n';
 }return compile.call(this,s,f);};
global.__t1241Probe=function(now,players){const F=global.__t1248BodyFixture;if(!F)return;
 if(!held){const seed=[...players.values()].find(p=>p.isNpc&&p.simVillageId);if(!seed)return;
  const h={pid:'__human_map_fixture',isNpc:false,hp:100,x:seed.x,y:seed.y};F.players.set(h.pid,h);assert.equal(global.__t1248HumanIndex.get(h.pid),h);F.players.delete(h.pid);assert(!global.__t1248HumanIndex.has(h.pid));
  held={pid:'__nopoll',_sh:'nopoll',isNpc:true,simVillageId:seed.simVillageId,hp:100,maxHp:100,hunger:100,thirst:100,x:seed.x,y:seed.y,vx:0,vy:0};F.players.set(held.pid,held);F.npcs.add(held.pid);
  const survival=F.DB.survivalPlan(held,now,false,F.services),S={k:'sleep',t0:now,until:now+60000,r:null,P:null,pn:0,pi:0,d:F.V.econDay(),hp:100,work:false,survival};assert(survival.ok);held._des=S;assert(F.space.park(held,S));F.heap.park(held.pid,S.until,{kind:S.k},held._sh);F.tick.delete(held.pid);F.movers.delete(held.pid);return;
 }
 if(++calls<100)return;
 const result={ticks:calls,visits,humanMapAddDelete:true,pass:held._des!=null&&Object.keys(visits).length===0,originalMaps:F.players.has(held.pid)&&F.npcs.has(held.pid),heap:F.heap.actors.has(held.pid)};
 result.pass=result.pass&&result.originalMaps&&result.heap;fs.writeFileSync(process.env.T577_OUT+'.nopoll.json',JSON.stringify(result));process.exit(result.pass?0:1);
};
