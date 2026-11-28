'use strict';
// Fault injection into the canonical SQL writer, after a real row update in BEGIN.
process.env.T1517_WAR_SNAP='1';process.env.T696_WAL='0';process.env.DB_PATH=process.argv[2];process.env.ZONE_ID='t1517-fault';
const fs=require('fs'),assert=require('assert'),{DatabaseSync}=require('node:sqlite');
const prepare=DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare=function(sql){const s=prepare.call(this,sql);if(/^UPDATE villages SET econ_state/.test(sql)){this.exec('PRAGMA cache_size=1');const run=s.run;Object.defineProperty(s,'run',{value:function(...a){const r=run.apply(this,a);if(global.__t1517Crash){fs.writeFileSync(process.argv[2]+'.hit','after native row update, before COMMIT');process.kill(process.pid,'SIGKILL');}return r;}});}return s;};
const store=require('../server/zone-local-db'),F=require('./lib-war-snap-fixture'),f=F.create(42),file=process.argv[2];f.mobilize();f.tick();
let db=new DatabaseSync(file);for(const v of f.villages)db.prepare('INSERT INTO villages (id,zone,name,cx,cy,population,econ_state,day,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run(v.dbId,f.H.state.zoneId,v.name,v.ccx,v.ccy,v.econ.npcs.length,'{}',f.world.day,0);db.close();f.H.state.db=store;
f.at(()=>f.H._warSnapAtomicSave());db=new DatabaseSync(file);const expected={meta:store.getWorldMeta(f.H.state.zoneId).data,rows:db.prepare('SELECT id,econ_state,population,day FROM villages ORDER BY id').all(),walBytes:fs.statSync(file+'-wal').size};db.close();fs.writeFileSync(file+'.before.json',JSON.stringify(expected));
const p=f.deps.players.values().next().value;p.x+=1;f.villages[0].econ.storage.food+=1;global.__t1517Crash=process.argv[3]==='crash';f.at(()=>f.H._warSnapAtomicSave());
assert(!global.__t1517Crash,'fault did not fire');db=new DatabaseSync(file);fs.writeFileSync(file+'.after.json',JSON.stringify({meta:store.getWorldMeta(f.H.state.zoneId).data,rows:db.prepare('SELECT id,econ_state,population,day FROM villages ORDER BY id').all()}));db.close();
