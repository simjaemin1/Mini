#!/usr/bin/env node
// @regress
// @bait 4
// T1490: 실제 채팅 권한 handler + 기존 villageWithdrawGate. 표시·몸 전이·주인·끔 동등성.
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const cp = require('child_process');
const root = path.resolve(__dirname, '..');
const file = path.join(root, 'server/membership.js');
const source = fs.readFileSync(file, 'utf8');
process.on('uncaughtException', e => { console.error('✗ '+(e.stack || e)); process.exit(1); });
let V = require('../server/villages');
if (process.env.T1490_MUTANT === 'far') {
  const vf=path.join(root,'server/villages.js'), raw=fs.readFileSync(vf,'utf8');
  const needle='if (d > EV_BRIEF_PX)'; assert.strictEqual(raw.split(needle).length-1,1,'ONE_MUTATION');
  const vm=new Module(vf,module); vm.filename=vf; vm.paths=Module._nodeModulePaths(path.dirname(vf));
  vm._compile(raw.replace(needle,'if (false && d > EV_BRIEF_PX)'),vf); V=vm.exports;
}
const E = require('../sim/economy-sim-v2');
const Events = require('../server/events');
const w = E.createWorldV2({ seed: 7, villageCount: 2, picker: 'rational' });
const vs = w.villages.map((econ, i) => ({ dbId: i + 1, ccx: 100 + i * 4, ccy: 100, name: 'v'+i, econ }));
const ledger = Events.createLedger({ econV2: E, vidOf: (v,i) => i+1, depositMap: V.playerVillageDepositMap() });
ledger.prime(w); V.__labProbe._memberProbe.setup(ledger, vs, E);
// 실제 부팅 clientPayload의 목록만 주입. 거리와 권한·실물 함수는 제품 그대로다.
const view = Object.create(V); view.clientVillages = () => vs.map(v => ({ id:v.dbId }));
function load(src, arm) {
  process.env.T1490_NEAR_NOW = arm;
  const m = new Module(file, module); m.filename=file; m.paths=Module._nodeModulePaths(path.dirname(file)); m._compile(src,file); return m.exports;
}
function run(src, arm, p, cmd='/인출') {
  const messages=[]; const m=load(src,arm);
  m.init({ SimVillages:view, gameDay:()=>0, send:(ws,msg)=>messages.push(msg), afterWithdraw:(p,r)=>messages.push(r) });
  assert.strictEqual(m.handleChat(p,cmd),true);
  return JSON.stringify({messages, p});
}
const anchor=V.villageAnchorPx(vs[0]);
function body(extra={}) { return Object.assign({ playerId:'guest', ws:{}, inventory:{}, x:anchor.x,y:anchor.y,member:null },extra); }
const old = process.env.T1490_OLD_SOURCE ? fs.readFileSync(process.env.T1490_OLD_SOURCE,'utf8') : cp.execFileSync('git',['show','6896843a:server/membership.js'],{cwd:root,encoding:'utf8'});
function checks(src) {
  // 캐시 없는 새 몸(재접속·존이동·부활), 순간이동 직후: NPC 촌장 문까지 반드시 도착.
  for(const kind of ['reconnect','zone','respawn','teleport']) {
    const text=run(src,'1',body({kind})); assert.match(text,/이 마을 곳간은 사람이 열지 않습니다/, 'EMPTY_CACHE');
  }
  // 먼 몸 + 근처였던 표시로 권한을 통과할 수 없다. 기존 gate의 바깥.
  assert.match(run(src,'1',body({x:anchor.x+V.__labProbe._memberProbe.BRIEF_PX*3,_memberNearVid:1})),/너무 멉니다/,'FAR_BODY');
  // 두 문이 모두 열리는 맞닿은 마을: B 앞의 A 촌장이 캐시 A로 A 곳간을 열면 안 됨.
  vs[0].econ.founder='guest'; vs[0]._kin={ chief:'guest' };
  const ownerCheck=load(src,'1'); ownerCheck.init({SimVillages:view});
  assert.strictEqual(ownerCheck.chiefCached(body(),vs[0]),true,'FIXTURE_A_CHIEF');
  const b=V.villageAnchorPx(vs[1]);
  assert(!V.villageWithdrawGate(1,b.x,b.y).err && !V.villageWithdrawGate(2,b.x,b.y).err);
  const stocks=JSON.stringify(vs.map(v=>v.econ.storage));
  const visitor=body({x:b.x,y:b.y,_memberNearVid:1});
  assert.match(run(src,'1',visitor),/이 마을 곳간은 사람이 열지 않습니다/,'OWNER_CANONICAL');
  assert.deepStrictEqual(visitor.inventory,{},'OWNER_NO_ITEM');
  assert.strictEqual(JSON.stringify(vs.map(v=>v.econ.storage)),stocks,'OWNER_NO_STOCK_CHANGE');
  delete vs[0].econ.founder; delete vs[0]._kin;
  // 유효한 최신 표시 때 판정·몸 바이트 같음. 사유지 칸은 근접 정본에 없으므로 추가 거절하지 않음.
  for(const delta of [-300,-260,-128,0,64,128,260,300]) {
    const p=body({x:anchor.x+delta, lot:{owner:'someone'}});
    let best=null;
    for(const v of vs){const g=V.villageWithdrawGate(v.dbId,p.x,p.y);if(!g.err){const d=Math.hypot(v.ccx*32-p.x,v.ccy*32-p.y);if(!best||d<best.d)best={d,id:v.dbId};}}
    if(best)p._memberNearVid=best.id;
    assert.strictEqual(run(src,'1',structuredClone(p)),run(src,'0',structuredClone(p)),'VALID_CACHE_EQ');
  }
  for(const cache of [undefined,1,2,999]) for(const x of [anchor.x,anchor.x+1000]) for(const cmd of ['/인출','/곳간','/가입','/소속','/기부 나무 1']) {
    const p=body({x,_memberNearVid:cache});
    assert.strictEqual(run(src,'0',structuredClone(p),cmd),run(old,'0',structuredClone(p),cmd),'OFF_BYTES');
  }
}
if(process.env.T1490_MUTANT) {
  const muts={
    empty:["T1490_NEAR_NOW ? _nearVil(player, null) : null", "T1490_NEAR_NOW ? (player._memberNearVid == null ? { err: 'empty' } : _nearVil(player, null)) : null"],
    owner:["ng.err ? null : ng.vil.dbId | 0", "ng.err ? null : (player._memberNearVid == null ? ng.vil.dbId : player._memberNearVid) | 0"],
    off:["process.env.T1490_NEAR_NOW === '1'", "true"],
  };
  if(process.env.T1490_MUTANT === 'far') { checks(source); process.exit(0); }
  const [a,b]=muts[process.env.T1490_MUTANT]; assert.strictEqual(source.split(a).length-1,1,'ONE_MUTATION');
  checks(source.replace(a,b)); process.exit(0);
}
checks(source);
function bait(name, reason) {
  const r=cp.spawnSync(process.execPath,[__filename],{env:{...process.env,T1490_MUTANT:name},encoding:'utf8'});
  return r.status === 1 && new RegExp('AssertionError.*'+reason).test(r.stderr);
}
const ok=(condition,label,extra)=>{ assert(condition,label); console.log('  ✓ '+label+' '+extra); };
ok(bait('empty','EMPTY_CACHE'),'미끼 표시 빔 거절 → EMPTY_CACHE 빨강','바꾼 자리 1');
ok(bait('far','FAR_BODY'),'미끼 먼 곳 허용 → FAR_BODY 빨강','바꾼 자리 1');
ok(bait('owner','OWNER_CANONICAL'),'미끼 맞닿은 다른 주인 → OWNER_CANONICAL 빨강','바꾼 자리 1');
ok(bait('off','OFF_BYTES'),'미끼 끔 변경 → OFF_BYTES 빨강','바꾼 자리 1');
console.log('통과 T1490 handler · 코너 · 판정 동일 8 · OFF 바이트 40 · 미끼 4/4 (crash 0)');
