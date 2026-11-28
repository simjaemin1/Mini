'use strict';
// Opt-in read-only observer plus explicitly labelled native server fixture inputs.
if (!process.env.WAR_SNAP_ZONE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs=require('fs'),path=require('path'),Module=require('module');
const root=path.join(__dirname,'..'),out=process.env.WAR_SNAP_ZONE_OUT;fs.mkdirSync(out,{recursive:true});
const write=(name,data)=>fs.writeFileSync(path.join(out,name),JSON.stringify(data));
const load=Module._load;let hooked=false;
Module._load=function(request,parent,isMain){
 const value=load.apply(this,arguments);let file;try{file=Module._resolveFilename(request,parent);}catch(_){return value;}
 if(file===path.join(root,'server','villages.js')&&!hooked){hooked=true;
  const init=value.init;value.init=function(...args){let spawnCalls=0;const spawn=args[0].spawnNpc;if(spawn)args[0].spawnNpc=function(...xs){spawnCalls++;return spawn.apply(this,xs);};const r=init.apply(this,args),H=value.__p3Bind({}),st=H.state;if(!st.ready)return r;
   const restored=st.war.WARS.length>0||st.warBodies.size>0;
   if(!restored&&process.env.WAR_SNAP_ZONE_FIXTURE==='1'){
    let pair=null,dist=Infinity;
    for(const a of st.villages)for(const d of st.villages){if(a===d||a.econ.npcs.length<12||d.econ.npcs.length<8)continue;const z=Math.hypot(a.ccx-d.ccx,a.ccy-d.ccy);if(z<dist){pair=[a,d];dist=z;}}
    if(!pair)throw new Error('WAR_SNAP zone fixture: no viable native pair');
    for(const v of pair){v.econ.storage.food=10000;v.econ.storage.weapon=100;v.econ.storage.armor=50;v.econ.storage.stone=1000;v.econ.counts={};for(let i=0;i<v.econ.npcs.length;i++){const n=v.econ.npcs[i],job=v===pair[0]?(i%2?'hunter':'warrior'):(i<2?'hunter':'farmer');n.currentJob=job;v.econ.counts[job]=(v.econ.counts[job]||0)+1;}}
    pair[1]._defPolicy='respond';if(!st.war.warMobilize(pair[0],pair[1],'feud',dist,st.world.day))throw new Error('WAR_SNAP zone fixture: mobilize refused');
    st.war.WARS[st.war.WARS.length-1]._opPolicy='assault';
    write('fixture.json',{nativePair:pair.map(v=>[v.name,v.dbId,v.ccx,v.ccy]),distance:dist,day:st.world.day,profile:{node:process.version,dayMs:st.dayMs,T941:process.env.T941_BATTLE_DAY,T1445:process.env.T1445_BOOT_BOUND,T1381:process.env.T1381_WALK_HEAP}});
   }
   const snap=H._warSnapPack();write((restored?'restored':'initial')+'-snapshot.json',snap);write((restored?'restored':'initial')+'-boot.json',{spawnCallsDuringInit:spawnCalls,bodyCount:st.deps.players.size,slots:st.villages.map(v=>[v.dbId,v.npcPids.length]),rng:st.econ&&st.econ.rngState?st.econ.rngState():null});
   process.on('exit',()=>write('final.json',{day:st.world.day,stats:st.world._warStats,wars:st.war.WARS.length,bodies:st.warBodies.size,villages:st.villages.map(v=>[v.dbId,v.econ.npcs.length])}));
   const counts={};H._warSnapObserve((kind,f,detail)=>{counts[kind]=(counts[kind]||0)+1;});
   const BC=require('../sim/battle-core'),step=BC._stepBattle;let physical=0,shots=0,steps=0,dtSum=0,ctlRanged=0;
   BC._stepBattle=function(ctx,dt){steps++;dtSum+=dt;const before=(ctx.sides.A.arrows||0)+(ctx.sides.B.arrows||0);for(const u of ctx.units)if(u.hp>0&&BC.UNITS[u.type].ranged>0&&!u.ctl)ctlRanged++;const result=step.apply(this,arguments);shots+=Math.max(0,before-(ctx.sides.A.arrows||0)-(ctx.sides.B.arrows||0));return result;};
   let donated=false;const oldTick=value.onGameTick;value.onGameTick=function(...xs){const z=oldTick.apply(this,xs);physical++;if(process.env.WAR_SNAP_ZONE_DONATE==='1'&&!restored&&!donated&&st.world.day>=1&&!st.tickJobs&&!st._t731&&st.warBodies.size){const v=st.war.WARS[0].atk,bag={wood:3},before=v.econ.storage.wood,r=value.playerVillageDeposit(v,bag,{wood:3});if(!r.ok)throw Error('native donation failed');const saved=value.t983Save(v);write('donation.json',{day:st.world.day,before,after:v.econ.storage.wood,result:r,saved});donated=true;}if(physical%100===0)write('observer.json',{day:st.world.day,physical,steps,dtSum,shots,ctlRanged,gates:counts,wars:st.war.WARS.length,bodies:st.warBodies.size});return z;};
   const db=st.db,save=db.saveVillagesAndMeta;db.saveVillagesAndMeta=function(rows,zone,meta,day){const parsed=JSON.parse(meta),z=save.apply(this,arguments);if(process.env.WAR_SNAP_ZONE_FIXTURE==='0')write('no-war-last.json',{rows,meta:parsed,day});if(parsed.t1517WarSnap){write('saved-snapshot-'+day+'.json',parsed.t1517WarSnap);write('saved-summary-'+day+'.json',{day,rows:rows.length,sha:parsed.t1517WarSnap.sha256,steps,dtSum,shots,gates:counts});}return z;};
   return r;
  };
 }
 return value;
};
