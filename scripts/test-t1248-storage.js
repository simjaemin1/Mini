#!/usr/bin/env node
// @regress
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict'),{spawnSync}=require('child_process');
const root=path.join(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'t1248-storage-')),expected=path.join(dir,'expected.json');
const env={...process.env,T1241_DES:'1',T1241_PROBE:'1',T1243_FARM_ON:'1',T1197_MEAL_BODY:'0',T745_VCLOCK:'1',VILLAGE_MAX:'1',VILLAGE_DAY_MS:'1440000',VILLAGE_NPC_CAP:'Infinity',T577_DIR:dir,T577_TAG:'save',T577_PAR:'1',T1248_STORAGE_EXPECT:expected,T1248_STORAGE_STAGE:'save',T1248_CHILD_STATUS:path.join(dir,'child.json'),T699_ROUTE_CACHE:process.env.T699_ROUTE_CACHE||path.join(os.tmpdir(),'durango-route-cache')};
env.NODE_OPTIONS=['t1248-child-status.js','t1248-storage-hook.js','t745-vclock.js'].map(f=>'--require '+path.join(root,'scripts',f)).join(' ');
const run=(args,e,label)=>{const r=spawnSync(process.execPath,args,{cwd:root,env:e,encoding:'utf8',timeout:300000});fs.writeFileSync(path.join(dir,label+'.log'),(r.stdout||'')+(r.stderr||''));assert(!r.error,String(r.error));assert.equal(r.signal,null);return r;};
const first=run([path.join(root,'scripts/t577-server-run.js'),'3','1020'],env,'save-wrapper');
assert.equal(JSON.parse(fs.readFileSync(env.T1248_CHILD_STATUS)).code,0);
const s=JSON.parse(fs.readFileSync(expected));assert(s.rows>0);assert.equal(s.remaining,250);
console.log('PASS production SQLite save at mid-segment; actual child=0, fixture wrapper='+first.status);
// A SQLite backup captures a consistent database, including any journal state.
const bait=path.join(dir,'bait.db'),py=spawnSync('python3',['-c',"import sqlite3,json,sys\ns=sqlite3.connect(sys.argv[1]);d=sqlite3.connect(sys.argv[2]);s.backup(d)\nr=d.execute('select zone,data from world_meta').fetchone();m=json.loads(r[1]);a=next(a for a in m['t742']['zone.desWork']['actors'] if a['identity']==sys.argv[3]);del a['position'];d.execute('update world_meta set data=? where zone=?',(json.dumps(m),r[0]));d.commit()",s.db,bait,s.actor.identity],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);
const ownerBait=path.join(dir,'owner-bait.db');const backup=spawnSync('python3',['-c',"import sqlite3,sys\ns=sqlite3.connect(sys.argv[1]);d=sqlite3.connect(sys.argv[2]);s.backup(d)",s.db,ownerBait],{encoding:'utf8'});assert.equal(backup.status,0,backup.stderr);
for(const [label,db,code] of [['resume',s.db,0],['missing-position-bait',bait,1],['missing-owner-bait',ownerBait,1]]){
 const e={...env,T1248_STORAGE_STAGE:'resume',T745_V0:String(s.now+90000),T577_SEED:'1020',T577_DAYS:String(s.day+10),T577_OUT:path.join(dir,label+'.json'),DB_PATH:db,ZONE_ID:'hanbando',PORT:'0',ENABLE_VILLAGES:'1',CENTRAL_URL:'http://localhost:1',T640_BOOT_SLICE:'0',T696_WAL:'0',T315_MAPBEDS:'1',T941_BATTLE_DAY:'1',T1013_BAND_DAY:'1',T990_ECON_DAY:'1'};
 delete e.VILLAGE_NPC_CAP;
 if(label==='missing-owner-bait')e.T1248_STORAGE_DISABLE_REKEY=String(s.artisanJob);
 const r=run([path.join(root,'server/zone.js')],e,label),proof=JSON.parse(fs.readFileSync(e.T577_OUT+'.storage.json'));
 assert.equal(r.status,code,JSON.stringify(proof));assert.equal(proof.pass,code===0,JSON.stringify(proof));
 if(label==='missing-position-bait')assert.match(proof.error,/walking event restored|saved walking position/);
 if(label==='missing-owner-bait'){assert.match(proof.error,/artisan event restored/);const links=JSON.parse(fs.readFileSync(e.T577_OUT+'.links.json'));assert.equal(links.artisanHeld,false);assert.equal(links.artisanTick,true);assert.equal(links.artisanMover,true);assert.notEqual(links.jobPid,links.newArtisanPid);}
 console.log('PASS '+label+': actual new zone process='+code+(code?' (expected invariant failure)':''));
}
console.log('RESULT 4 passed / 0 failed');console.log('ARTIFACTS '+dir);
if(process.env.T1248_KEEP!=='1')fs.rmSync(dir,{recursive:true,force:true});
