'use strict';
if(require('worker_threads').isMainThread&&process.env.T577_SEED){
 require('./t1192-observe');
 const fs=require('fs'),V=require('../server/villages'),C=require('../server/carry'),state=V.__p3Bind({}).state;
 const carry={maxKg:0,overSamples:0,bodies:{}};
 const snap=()=>{
  const vs=state.villages||[],stock={},held={},jobs={},stoneIn={},woodIn=vs.reduce((n,v)=>n+(v._t325Deliv||0),0),woodLadderIn=vs.reduce((n,v)=>n+(v._t561Lad||0),0);
  for(const v of vs){for(const k of ['stone','pebble','wood','tool'])stock[k]=(stock[k]||0)+(v.econ?.storage?.[k]||0);for(const [k,n]of Object.entries(v._t1146Gr||{}))stoneIn[k]=(stoneIn[k]||0)+n;}
  for(const p of state.deps.players?.values()||[]){jobs[p.simJob]=(jobs[p.simJob]||0)+1;if(['fisher','forager','lumberjack','miner'].includes(p.simJob)){const kg=C.npcTotalKg(p);carry.maxKg=Math.max(carry.maxKg,kg);if(kg>C.CFG.CAP_KG+1e-9){carry.overSamples++;carry.bodies[p.pid]={job:p.simJob,kg,inventory:{...p.inventory}};}}for(const k of ['stone','pebble','wood'])held[k]=(held[k]||0)+(p.inventory?.[k]||0);}
  return {day:state.world?.day,dayMs:state.dayMs,pop:state.world?.villages.reduce((n,v)=>n+v.npcs.length,0),stock,held,jobs,stoneIn,woodIn,woodLadderIn,carry};
 };
 const dump=()=>fs.writeFileSync(process.env.T577_OUT+'.physical.json',JSON.stringify(snap()));
 process.on('exit',dump);setInterval(dump,5000).unref();
}
