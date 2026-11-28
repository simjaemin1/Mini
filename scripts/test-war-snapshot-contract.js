#!/usr/bin/env node
// @regress unit
// @bait 11
'use strict';
process.env.T1517_WAR_SNAP='1';
const assert=require('assert'),fs=require('fs'),path=require('path'),cp=require('child_process'),u=require('util'),{DatabaseSync}=require('node:sqlite'),F=require('./lib-war-snap-fixture');
try{assert.strictEqual(typeof require('../server/villages').__p3Bind({})._warSnapPack,'function','complete snapshot product API');}catch(e){console.error('✗ complete snapshot product API absent');throw e;}
const G=require('../server/war-snapshot'),{semantic,defenderAudit}=require('./test-war-snapshot');
let pass=0;function check(name,fn){try{fn();}catch(e){console.error('✗ '+name);throw e;}pass++;console.log('✓ '+name);}
const dir=process.env.T1517_CONTRACT_OUT||require('./lib-tmp').dir('war_snapshot_contract');fs.mkdirSync(dir,{recursive:true});
function mutant(file,arg,expect){const r=cp.spawnSync(process.execPath,[path.join(__dirname,file),String(arg)],{env:process.env,encoding:'utf8',timeout:60000,maxBuffer:2e6});fs.writeFileSync(path.join(dir,file+'-'+arg+'.txt'),r.stdout+r.stderr);assert.strictEqual(r.status,1,'assertion-red exit');assert(r.stderr.includes('AssertionError [ERR_ASSERTION]')&&r.stderr.includes(expect),r.stderr);assert(!/(TypeError:|ReferenceError:|RangeError:|FATAL ERROR)/.test(r.stderr),'no nonassert crash');}
try{
 check('미끼 · 바꾼 자리1: 전쟁 몸/명부',()=>mutant('war-snapshot-bundle-child.js',1,'missing bundle 1'));
 check('미끼 · 바꾼 자리2: 대형/포진',()=>mutant('war-snapshot-bundle-child.js',2,'missing bundle 2'));
 check('미끼 · 바꾼 자리3: 걸음/탐색',()=>mutant('war-snapshot-bundle-child.js',3,'missing bundle 3'));
 check('미끼 · 바꾼 자리4: battle units',()=>mutant('war-snapshot-bundle-child.js',4,'missing bundle 4'));
 check('미끼 · 바꾼 자리5: ctx 탄/적용상태',()=>mutant('war-snapshot-bundle-child.js',5,'missing bundle 5'));
 check('미끼 · 바꾼 자리6: 비행탄',()=>mutant('war-snapshot-bundle-child.js',6,'missing bundle 6'));
 check('미끼 · 바꾼 자리7: RNG 현재값',()=>mutant('war-snapshot-bundle-child.js',7,'missing bundle 7'));
 check('미끼 · 바꾼 자리8: fight 제어/시각',()=>mutant('war-snapshot-bundle-child.js',8,'missing bundle 8'));
 check('미끼 · 바꾼 자리9: 도장없는 옛 저장을 통째 저장으로 오독',()=>mutant('war-snapshot-policy-child.js','legacy','unsealed legacy bytes must retain legacy behavior'));
 check('미끼 · 바꾼 자리10: OFF 한 칸 변조',()=>mutant('war-snapshot-policy-child.js','off-cell','one OFF save cell changed'));
 check('미끼 · 바꾼 자리11: 실제 저장중 SIGKILL의 미완 WAL은 옛 완전 checkpoint를 유지한다',()=>{
  const file=path.join(dir,'crash.db'),r=cp.spawnSync(process.execPath,[path.join(__dirname,'war-snapshot-atomic-child.js'),file,'crash'],{env:process.env,encoding:'utf8',timeout:60000});
  assert.strictEqual(r.signal,'SIGKILL',r.stderr);assert(fs.existsSync(file+'.hit'),'death point was inside the canonical transaction');const before=JSON.parse(fs.readFileSync(file+'.before.json'));assert(fs.statSync(file+'-wal').size>before.walBytes,'uncommitted WAL bytes really reached disk');
  const copy=path.join(dir,'inspect.db');for(const suffix of ['','-wal','-shm'])if(fs.existsSync(file+suffix))fs.copyFileSync(file+suffix,copy+suffix);
  const db=new DatabaseSync(copy,{readOnly:true});const meta=db.prepare('SELECT data FROM world_meta WHERE zone=?').get('war-snap-fixture').data,rows=db.prepare('SELECT id,econ_state,population,day FROM villages ORDER BY id').all();assert.strictEqual(meta,before.meta);assert.deepStrictEqual(JSON.parse(JSON.stringify(rows)),before.rows);assert.strictEqual(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close();G.validate(JSON.parse(meta).t1517WarSnap);
  const control=path.join(dir,'control.db'),c=cp.spawnSync(process.execPath,[path.join(__dirname,'war-snapshot-atomic-child.js'),control,'complete'],{env:process.env,encoding:'utf8',timeout:60000});assert.strictEqual(c.status,0,c.stderr);const a=JSON.parse(fs.readFileSync(control+'.before.json')),b=JSON.parse(fs.readFileSync(control+'.after.json'));assert.notStrictEqual(a.meta,b.meta);assert.notDeepStrictEqual(a.rows,b.rows);
 });
 check('수비146: 저장시/복원직후/정본 다음소집 후보와 소속이 같다',()=>{
  const f=F.create(42,{defenders:147});f.mobilize();f.tick();const body=[...f.H.state.warBodies.values()][0];assert.strictEqual(body.defPids.length,146);assert.strictEqual(body.defGroup.units.length,146);
  const snap=f.at(()=>f.H._warSnapPack()),saved={day:f.world.day,now:f.now(),econs:f.villages.map(v=>f.H.serializeEcon(v.econ))},before=defenderAudit(f);const comp={militia:147};const drafted=f.at(()=>f.H._warDraftPids(f.villages[1],comp,42,body.w.id));const next=drafted?.pids.length||0;
  const r=F.create(42,{saved});r.deps.players.clear();r.deps.npcs.clear();for(const v of r.villages)v.npcPids=[];r.at(()=>require('../server/war-snapshot-host').prepareBodies(snap,r.H.state));r.at(()=>r.H._warSnapRestore(snap));assert.deepStrictEqual(defenderAudit(r),before);assert(u.isDeepStrictEqual(semantic(r.at(()=>r.H._warSnapPack())),semantic(snap)));const rb=[...r.H.state.warBodies.values()][0],again=r.at(()=>r.H._warDraftPids(r.villages[1],comp,42,rb.w.id));assert.strictEqual(again?.pids.length||0,next);console.log(JSON.stringify({defenders:146,savedCandidates:before[1].candidates,restoredCandidates:before[1].candidates,nextDraftBoth:next}));
 });
 check('저장 중 정본 종전: old checkpoint와 다음 clearing checkpoint가 섞이지 않는다',()=>{
  const f=F.create(7);f.mobilize();f.tick();const before=f.at(()=>f.H._warSnapPack()),day=f.world.day;let first;
  f.H.state.db={saveVillagesAndMeta(rows,zone,meta,d){first={rows,meta,d};for(let n=0;n<20&&(f.war.WARS.length||f.H.state.warBodies.size);n++){for(let t=0;t<900;t++)f.tick();f.day();}assert.strictEqual(f.war.WARS.length,0);assert.strictEqual(f.H.state.warBodies.size,0);}};
  f.at(()=>f.H._warSnapAtomicSave());assert.strictEqual(first.d,day);assert(first.rows.every(r=>r.day===day));assert(u.isDeepStrictEqual(semantic(JSON.parse(first.meta).t1517WarSnap),semantic(before)));let second;f.H.state.db.saveVillagesAndMeta=(rows,zone,meta,d)=>{second={rows,meta,d};};assert(f.H._warSnapNeedsAtomic());f.at(()=>f.H._warSnapRequest());assert(!Object.hasOwn(JSON.parse(second.meta),'t1517WarSnap'));assert(second.rows.every(r=>r.day===second.d));assert(!f.H._warSnapNeedsAtomic());
 });
 console.log(`T1517 formal contracts ${pass}/13`);
}finally{if(!process.env.T1517_CONTRACT_OUT)fs.rmSync(dir,{recursive:true,force:true});}
