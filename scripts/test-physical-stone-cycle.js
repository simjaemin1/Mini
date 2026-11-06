#!/usr/bin/env node
'use strict';
if(!process.env.PHYSICAL_CYCLE_CHILD){
 const path=require('path'),{spawnSync}=require('child_process');
 const env={...process.env,PHYSICAL_CYCLE_CHILD:'1',T745_VCLOCK:'1',T577_SEED:'1020',T696_WAL:'0',NODE_OPTIONS:'--require '+path.join(__dirname,'t745-vclock.js')+' '+(process.env.NODE_OPTIONS||'')};
 const r=spawnSync(process.execPath,[__filename],{env,stdio:'inherit'});if(r.error)throw r.error;process.exit(r.status??1);
}

process.env.ENABLE_VILLAGES='0';process.env.ENABLE_WILDLIFE='0';process.env.ENABLE_BANDITS='0';process.env.ENABLE_ROADS='0';process.env.T1146_STONE_RULE='0';process.env.T419_STONE_REAL='1';
process.env.ZONE_ID='hanbando';process.env.PORT=String(46000+process.pid%900);process.env.DB_PATH='/tmp/physical-stone-cycle-'+process.pid+'.db';
const assert=require('assert'),fs=require('fs'),log=console.log;console.log=(...a)=>{if(String(a[0]).includes('zone server up on'))log(...a);};console.warn=console.error=()=>{};
try{
 const Z=require('../server/zone'),H=Z.__testBind(),V=require('../server/villages'),E=require('../sim/economy-sim'),C=require('../server/carry'),CH=require('../server/chunk'),cfg=require('../server/zone-config'),P=V.__labProbe._t1180Probe,Q=V.__labProbe._t1146Probe,S=V.__p3Bind({}).state;
 let rock=null;for(let k=0;k<60&&!rock;k++)rock=(CH.generateChunkResources('hanbando',cfg.ZONES.hanbando.biome,k,k,CH.CHUNK_SIZE,new Set(),0)||[]).find(r=>r.type==='rock'&&r.hp>10&&!H.isTerrainBlockedLocal(r.x+22,r.y)&&!H.isTerrainBlockedLocal((Math.floor(r.x/32)+3)*32+16,Math.floor(r.y/32)*32+16));assert(rock,'real procedural rock required');rock=H._physicalRocksInCircle(rock.x,rock.y,32).find(r=>r.type==='rock'&&r.hp>10&&!H.isTerrainBlockedLocal(r.x+22,r.y)&&!H.isTerrainBlockedLocal((Math.floor(r.x/32)+3)*32+16,Math.floor(r.y/32)*32+16));assert(rock,'canonical unobserved rock required');assert(!H.resources.has(rock.id),'unobserved fixture must not activate resource');
 const world={};E.bindProductionActs(world);
 const p={pid:'physical-cycle',playerId:'npc_physical_cycle',name:'채집꾼',simJob:'forager',isNpc:true,x:rock.x+22,y:rock.y,vx:0,vy:0,floor:0,behavior:'wander',targetX:rock.x+22,targetY:rock.y,nextDecisionAt:Infinity,inventory:{},hp:100,maxHp:100,lastAttackAt:0};
 H.players.set(p.pid,p);const v={ccx:Math.floor(rock.x/32)+3,ccy:Math.floor(rock.y/32),_granList:[],npcPids:[p.pid],econ:{_world:world,npcs:new Array(6).fill({}),counts:{forager:6},storage:{stone:0,pebble:0},treasury:{}}};
 S.deps={players:H.players,gatherRange:H.GATHER_RANGE,stoneResources:(x,y,r)=>H._physicalRocksInCircle(x,y,r).filter(a=>(a.seedKey||a.id)===(rock.seedKey||rock.id)),stoneHit:(p,r)=>H._physicalStoneHit(p,r),qtResources:()=>({queryCircle:()=>H.resources.has(rock.id)?[rock]:[]})};
 const hp0=rock.hp,started=Date.now(),x0=p.x,y0=p.y;let maxKg=0,walked=false;
 p.simVillageId='controlled-stone-cycle';p.nextDecisionAt=0;H.npcs.add(p.pid);
 const normal=V.npcLifeTick;
 V.npcLifeTick=(npc,now)=>{
   if(npc!==p)return normal(npc,now);
   if((v._t1146Gr?.stone||0)>=6){npc.behavior='wander';npc.targetX=npc.x;npc.targetY=npc.y;npc.gatherTarget=null;return true;}
   return P.returnStep(v,p,now,.3,.7,1)||Q.stoneWork(v,p,now,.3,.7,1);
 };
 setInterval(()=>{
  try{
   maxKg=Math.max(maxKg,C.npcTotalKg(p));walked=walked||Math.hypot(p.x-x0,p.y-y0)>1e-9;
   assert(maxKg<=C.CFG.CAP_KG+1e-9,'physical carry cap');
   if((v._t1146Gr?.stone||0)<6)return;
   const stored=(v.econ.storage.stone||0)+(v.econ.treasury.stone||0),held=p.inventory.stone||0;
   assert(walked,'actual return movement required');assert.equal(stored+held,hp0-rock.hp,'resource/body/storage mass conserved');assert.equal(held,0);assert.equal(p.simJob,'forager');assert(!H.resources.has(rock.id),'partial quarry stays valid without an observer');
   log(JSON.stringify({stoneMined:hp0-rock.hp,stoneStored:stored,held,maxKg,walked,elapsedVirtualMs:Date.now()-started}));log('PASS unobserved canonical rock → actual hit/body/movement/timed storage');process.exit(0);
  }catch(e){log(e.stack);process.exit(1);}
 },50);
 setTimeout(()=>{log(JSON.stringify({failure:'cycle timeout',p:{x:p.x,y:p.y,inventory:p.inventory,S:p._t720,behavior:p.behavior},hp:rock.hp,hp0,carry:maxKg}));process.exit(1);},200000);
}catch(e){log(e.stack);process.exit(1);}
