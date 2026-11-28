'use strict';
// Canonical shutdown serialization + real SQLite transaction; fixture, not a 1246-day world.
const fs=require('fs'),path=require('path'),cp=require('child_process');
if(process.argv[2]==='--child'){
 const [flag,seedText,file]=process.argv.slice(3);process.env.T1517_WAR_SNAP=flag;process.env.T696_WAL='0';process.env.DB_PATH=file;process.env.ZONE_ID='t1517-cost';
 const {DatabaseSync}=require('node:sqlite'),{performance}=require('perf_hooks'),store=require('../server/zone-local-db'),F=require('./lib-war-snap-fixture'),V=require('../server/villages');
 const f=F.create(+seedText,{defenders:147});f.mobilize();f.tick();let db=new DatabaseSync(file);for(const v of f.villages)db.prepare('INSERT INTO villages(id,zone,name,cx,cy,population,econ_state,day,created_at)VALUES(?,?,?,?,?,?,?,?,?)').run(v.dbId,f.H.state.zoneId,v.name,v.ccx,v.ccy,v.econ.npcs.length,'{}',f.world.day,0);db.close();
 let capture,sqlMs=0;const save=store.saveVillagesAndMeta;store.saveVillagesAndMeta=function(rows,zone,meta,day){capture={rows,meta,day};const t=performance.now();const r=save.apply(this,arguments);sqlMs=performance.now()-t;return r;};f.H.state.db=store;
 const t=performance.now();let end;f.at(()=>V.t728Shutdown(Infinity,r=>{end=r;}));const totalMs=performance.now()-t;if(end?.err)throw Error(end.err);if(!capture)throw Error('canonical shutdown did not save');
 const m=JSON.parse(capture.meta),bytes={meta:Buffer.byteLength(capture.meta),rows:capture.rows.reduce((n,r)=>n+Buffer.byteLength(r.econ),0),snapshot:m.t1517WarSnap?Buffer.byteLength(JSON.stringify(m.t1517WarSnap)):0};console.log(JSON.stringify({flag,seed:+seedText,profile:'native 24+147 resident fixture, canonical shutdown, SQLite WAL',defenders:[...f.H.state.warBodies.values()][0].defPids.length,day:capture.day,bytes:{...bytes,total:bytes.meta+bytes.rows},totalMs,sqlMs,shutdown:end}));
}else{
 const out=process.argv[2];if(!out)throw Error('output directory required');fs.mkdirSync(out,{recursive:true});const rows=[];
 for(const seed of [7,42])for(let rep=0;rep<3;rep++)for(const flag of ['0','1']){const file=path.join(out,`${seed}-${rep}-${flag}.db`),r=cp.spawnSync(process.execPath,[__filename,'--child',flag,String(seed),file],{env:process.env,encoding:'utf8',timeout:60000});fs.writeFileSync(file+'.txt',r.stdout+r.stderr);if(r.status!==0)throw Error(r.stderr);rows.push({...JSON.parse(r.stdout.trim().split('\n').at(-1)),rep});}
 const deltas=[];for(const a of rows.filter(r=>r.flag==='0')){const b=rows.find(r=>r.flag==='1'&&r.seed===a.seed&&r.rep===a.rep);deltas.push({seed:a.seed,rep:a.rep,bytes:b.bytes.total-a.bytes.total,totalMs:b.totalMs-a.totalMs,sqlMs:b.sqlMs-a.sqlMs});}
 fs.writeFileSync(path.join(out,'cost.json'),JSON.stringify({rows,deltas,measurement:'real performance.now; no T745 preload; serialization + canonical SQLite commit, not a benchmark conclusion'},null,2));console.log('T1517 storage cost pairs '+deltas.length+'; fixture defenders146');
}
