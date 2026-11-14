'use strict';
// Read-only T1302 diagnostics. Works with both the fixed source and T1274's a6b7aba5.
const path=require('path'),fs=require('fs'),Module=require('module');
if(!process.env.T577_SEED || !/server[\\/]zone\.js$/.test(process.argv[1]||''))return;
const ROOT=path.dirname(path.dirname(process.argv[1])),OUT=process.env.T577_OUT+'.t1302';
const E=require(path.join(ROOT,'sim/economy-sim')),Ev=require(path.join(ROOT,'server/events'));
const rec={initialTerritory:{},added:{},batchCalls:0,emigration:[],joins:[],daily:[],errors:[]};
let current=null,state=null;
const getState=()=>state||(state=require(path.join(ROOT,'server/villages')).__p3Bind({}).state);
const store=()=>fs.writeFileSync(OUT+'.json',JSON.stringify(rec));
global.__t1302Trace={
 add(v,keys){if(!(v.name in rec.initialTerritory))rec.initialTerritory[v.name]=v._terrSet.size;
   rec.added[v.name]=(rec.added[v.name]||0)+Array.from(keys).filter(k=>!v._terrSet.has(k)).length;},
 batch(){rec.batchCalls++;},
 depart(v,to,pids){if(current)current.depart={to:to.name,pids,bodyPeople:pids.map(pid=>getState().deps.players.get(pid)?._econId??null)};},
 join(pid,to,person){rec.joins.push({day:getState().world.day,pid,to:to.name,person:person?.id??null,bodyPerson:getState().deps.players.get(pid)?._econId??null});}
};
const load=Module._extensions['.js'];
Module._extensions['.js']=function(m,f){
 if(f!==path.join(ROOT,'server/villages.js'))return load(m,f);
 let s=fs.readFileSync(f,'utf8');
 const edits=[
  ['function _terrAdd(vil, keys, target, fell) {','function _terrAdd(vil, keys, target, fell) { global.__t1302Trace.add(vil,keys);'],
  ['function _t1238Batch(vil, picked, cap) {','function _t1238Batch(vil, picked, cap) { global.__t1302Trace.batch();'],
  ['  return { len, ppd, pids: pick };','  global.__t1302Trace.depart(vil,best,pick); return { len, ppd, pids: pick };'],
  ['  _t765Stat.joined++;','  global.__t1302Trace.join(pid,to,typeof person===\'undefined\'?null:person); _t765Stat.joined++;']
 ];
 for(const[a,b]of edits){if(!s.includes(a))throw Error('T1302 diagnostic anchor missing: '+a);s=s.replace(a,b);}
 m._compile(s,f);
};
const wrapped=new WeakMap();
function bind(w){
 if(!w||typeof w.t1075Emigrate!=='function'||wrapped.get(w)===w.t1075Emigrate)return;
 const orig=w.t1075Emigrate;
 const fn=function(v,p,day){
  const sv=getState().villages.find(x=>x.econ===v),stats=v.lastStats||{};
  const row={day,village:v.name,person:p.id,job:p.currentJob,age:p.age,born:p._born??null,
   population:v.npcs.length,bodies:sv?.npcPids.filter(pid=>getState().deps.players.has(pid)).length,
   food:E.totalFoodEquivalent(v),wood:v.storage.wood,happiness:stats.happiness,health:stats.health,
   housing:v.housing,mapBeds:v._mapBeds??null,gate:JSON.parse(JSON.stringify(v._dpDebug||null)),pressure:v._emigAccum,
   predicate:'t1075Emigrate: happiness < T1134_EMIG_H, accumulated pressure >= 1, accepted happier destination'};
  current=row;let result;
  try{result=orig.apply(this,arguments);}finally{current=null;}
  row.accepted=!!result;rec.emigration.push(row);
  fs.appendFileSync(OUT+'-emigration.jsonl',JSON.stringify(row)+'\n');
  return result;
 };
 w.t1075Emigrate=fn;wrapped.set(w,fn);
}
const tick=E.tickVillage;
E.tickVillage=function(v,day){bind(v._world);return tick.apply(this,arguments);};
const create=Ev.createLedger;
Ev.createLedger=function(){const L=create.apply(this,arguments),scan=L.scanDay;
 L.scanDay=function(world,day){const result=scan.apply(this,arguments);
  try{
   const S=getState(),villages=S.villages.map(v=>{
    const people=v.econ?.npcs||[],bodies=v.npcPids.map(pid=>S.deps.players.get(pid)).filter(Boolean);
    const ids=new Set(bodies.map(p=>p._econId).filter(x=>x!=null));
    return {name:v.name,population:people.length,bodies:bodies.length,
     identifiedBodies:ids.size,missingPeople:people.filter(p=>!ids.has(p.id)).map(p=>p.id),
     emigration:v.econ?._emigTot||0,territory:v._terrSet.size,physical:v._t1207?.body||0,
     added:rec.added[v.name]||0,queued:v._t1207Pend?.length||0,
     wood:v.econ?.storage.wood,happiness:v.econ?.lastStats?.happiness,housing:v.econ?.housing};
   });
   const row={day,population:villages.reduce((n,v)=>n+v.population,0),bodies:villages.reduce((n,v)=>n+v.bodies,0),
    physical:villages.reduce((n,v)=>n+v.physical,0),added:villages.reduce((n,v)=>n+v.added,0),batchCalls:rec.batchCalls,villages};
   rec.daily.push(row);fs.appendFileSync(OUT+'-days.jsonl',JSON.stringify(row)+'\n');
   if(day%10===0)store();
  }catch(e){rec.errors.push(String(e.stack||e));store();}
  return result;
 };return L;
};
process.on('exit',store);
