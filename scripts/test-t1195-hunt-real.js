#!/usr/bin/env node
// @regress
'use strict';
// [T1195] 사냥 고기 = 몸이 잡은 마리 × kg — 손잡이 기본값 · 수식 닫힘 · 수요 문 · 몸 입고 · 장부 되돌림 · 표식 · 종 기록 · 변이 셋.
process.env.T1192_FISH_SPECIES = '0';
const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }
const MUT = process.env.T1195_MUTANT || '';
if (!MUT) for (const val of [undefined, '0', '1', '']) check('default ' + String(val), () => {
  const env = { ...process.env }; delete env.T1195_HUNT_REAL; if (val !== undefined) env.T1195_HUNT_REAL = val;
  const r = spawnSync(process.execPath, ['-e', "const E=require('./sim/economy-sim'),W=require('./server/wildlife');console.log(JSON.stringify([E.T1195_HUNT_REAL,W.preyIds]));"], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const [on, prey] = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.strictEqual(on, val === '1');   // ★[PM land1049] 끔 기본(`=1` 만 켬)
  assert.deepStrictEqual(prey, ['deer', 'deer', 'deer', 'wild_boar', 'arctic_hare', 'arctic_hare']);
});
// ★[PM land1049] `T1195_HUNT_REAL` · `T1197_MEAL_BODY`(+ T1198) 끔 기본으로(켬 판 서버 빈 마을 1 → 15 · 켤 날 T1209) — 이 하네스는 켬 판의 일을 잰다 → 켬에 묶는다(기본값 줄만 끔 기본으로).
process.env.T1195_HUNT_REAL = '1';
process.env.ENABLE_VILLAGES = '0';
if (MUT) {
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, file) {
    const target = path.join(ROOT, MUT === 'formula' ? 'sim/economy-sim.js' : 'server/villages.js');
    if (file !== target) return old(m, file);
    let src = fs.readFileSync(file, 'utf8');
    const swap = (a, b) => { assert(src.includes(a), 'mutant needle ' + MUT); src = src.replace(a, b); };
    if (MUT === 'formula') swap(" || (job === 'hunter' && T1195_HUNT_REAL)", '');
    else if (MUT === 'refund') swap('    if (diff !== 0 && m) {', '    if (false) {');
    else if (MUT === 'reach') swap('      if (!at) _t1195Stat.noReach += nOut;\n      else for', '      for');
    m._compile(src, file);
  };
}
const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2'), K = require('../server/kcal'), A = require('../server/animals');
const V = require('../server/villages'), state = V.__p3Bind({}).state, oldDeps = state.deps, oldZone = state.zoneId;
const deerU = K.econUnitsOf('meat_game', A.dropsOf('deer', 'hanbando').meat_game);
const near = (a, b, eps = 1e-6) => assert(Math.abs(a - b) <= eps, a + ' != ' + b);
check('physical host closes hunter formula meat and every byproduct; non-host keeps the formula', () => {
  const make = () => { const w = E2.createWorldV2({ seed: 1020, villageCount: 1 }), v = w.villages[0]; v.land = { ...v.land, game: 1 }; v.storage.food = 10000; for (const p of v.npcs) p.currentJob = 'hunter'; v.counts = { hunter: v.npcs.length }; return { w, v }; };
  const a = make(), b = make(); assert(!E.productionFormulaOff(a.v, 'hunter')); E.bindProductionActs(b.w); assert(E.productionFormulaOff(b.v, 'hunter'));
  E.tickVillage(a.v, 1); E.tickVillage(b.v, 1);
  const sum = (v) => Object.values(v.dailyProductionBuf || {}).reduce((n, x) => n + x, 0);
  assert(sum(a.v) > 0 && (a.v.dailyProductionBuf.meat || 0) > 0, 'formula positive control');
  assert.strictEqual(sum(b.v), 0, 'formula leaked');
  assert(b.v._huntOutLast > 0, 'demand D seeded'); near(b.v._t1195Bal, b.v._huntOutLast);
  assert.strictEqual(a.v._huntOutLast, undefined, 'no host = no new field');
});
check('daily demand: whole animal may overshoot, prepaid carries, unmet demand expires', () => {
  const w = E2.createWorldV2({ seed: 7, villageCount: 1 }), v = w.villages[0]; E.bindProductionActs(w);
  for (const p of v.npcs) p.currentJob = 'hunter'; v.counts = { hunter: v.npcs.length }; v.storage.food = 10000;
  E.tickVillage(v, 1); const D = v._huntOutLast; assert(D > 0 && D < deerU, 'D ' + D);
  assert.strictEqual(E.huntDemandLeft(v), v._t1195Bal);
  const s0 = v.storage.meat || 0, t0 = v.treasury.meat || 0;
  near(E.huntToGranary(v, 'meat', deerU), deerU);
  near((v.storage.meat - s0) + (v.treasury.meat - t0), deerU);
  assert(E.huntDemandLeft(v) < 0, 'overshoot is prepaid');
  const bal1 = v._t1195Bal; E.tickVillage(v, 2); near(v._t1195Bal, bal1 + v._huntOutLast);
  assert(v.dailyProductionBuf.meat >= deerU - 1e-6, 'realized ledger fold');
  v._t1195Bal = 5; E.tickVillage(v, 3); near(v._t1195Bal, v._huntOutLast);
});
// ── 서버 입고 ──
function fixture(opt = {}) {
  const w = E2.createWorldV2({ seed: 42, villageCount: 1 }), v = w.villages[0]; E.bindProductionActs(w);
  v.storage = { meat: 0 }; v.treasury = {}; v._t1195Bal = opt.bal != null ? opt.bal : 100;
  const m = new Map([['10,10', opt.g != null ? opt.g : 50]]);
  const p = { pid: 'hunt-test', simJob: 'hunter', _huntBud: opt.bud != null ? opt.bud : 3.6, _huntKil: opt.kil || 0, _t1195K: '10,10', _t1195Open: 1, _t1195At: opt.at ? 1 : 0, _t1195Sp: opt.sp || null, _huntWk: { cx: 10, cy: 10 } };
  const vil = { name: 'T', ccx: 0, ccy: 0, econ: v, npcPids: [p.pid], _gameRich: m };
  state.deps = { players: new Map([[p.pid, p]]) }; state.zoneId = 'hanbando';
  return { v, p, m, vil };
}
check('in view: every seen kill enters by its species and kg; ledger deduction equals the kills', () => {
  const { v, p, m, vil } = fixture({ bud: 3.6, kil: 2, sp: { deer: 1, wild_boar: 1 }, at: 0, bal: 0 });
  V._t1195HuntIn(vil);
  const boarU = K.econUnitsOf('meat_game', A.dropsOf('wild_boar', 'hanbando').meat_game);
  near(v.storage.meat + (v.treasury.meat || 0), deerU + boarU);
  near((v.storage.leather || 0) + (v.treasury.leather || 0), 3); near((v.storage.horn || 0) + (v.treasury.horn || 0), 1); near((v.storage.bone || 0) + (v.treasury.bone || 0), 2);
  near(m.get('10,10'), 50 + 3.6 - 2);
  assert.strictEqual(p._t1195Sp, null); assert.strictEqual(p._t1195At, 0);
});
check('out of view: unreached day brings nothing and returns the whole take to the cell', () => {
  const { v, m, vil } = fixture({ bud: 3.6, at: 0 });
  V._t1195HuntIn(vil);
  assert.strictEqual(v.storage.meat, 0); near(m.get('10,10'), 53.6);
});
check('out of view: reached day brings whole animals only, in prey order, while demand lasts', () => {
  const { v, p, m, vil } = fixture({ bud: 3.6, at: 1, bal: 100 });
  V._t1195HuntIn(vil);
  assert.strictEqual(vil._t1195Got, 3); near(m.get('10,10'), 50 + 0.6);
  const prey = require('../server/wildlife').preyIds, h = require('../server/seed-rand').pidHash(p.pid);
  const want = [0, 1, 2].map((c) => prey[(h + c) % prey.length]);
  const u = want.reduce((n, sp) => n + K.econUnitsOf('meat_game', A.dropsOf(sp, 'hanbando').meat_game), 0);
  near(v.storage.meat + (v.treasury.meat || 0), u); assert.strictEqual(p._t1195C, 3);
  V._t1195HuntIn(vil); assert.strictEqual(vil._t1195Got, 3, 'settled once'); near(m.get('10,10'), 50.6);
});
check('out of view: demand met stops at the first whole animal and returns the rest', () => {
  const { v, m, vil } = fixture({ bud: 3.2, at: 1, bal: 0.5 });
  V._t1195HuntIn(vil);
  assert.strictEqual(vil._t1195Got, 1); near(m.get('10,10'), 50 + 2.2); assert(v._t1195Bal < 0);
  const f2 = fixture({ bud: 3.2, at: 1, bal: 0 }); V._t1195HuntIn(f2.vil); assert.strictEqual(f2.vil._t1195Got || 0, 0); near(f2.m.get('10,10'), 53.2);
});
check('ledger stays within 0..K and an over-budget seen kill is deducted', () => {
  const a = fixture({ bud: 3.6, at: 0, g: 99 }); V._t1195HuntIn(a.vil); assert.strictEqual(a.m.get('10,10'), V.L_GAMEMAX);
  const b = fixture({ bud: 0.4, kil: 1, sp: { deer: 1 }, g: 0.2 }); V._t1195HuntIn(b.vil); assert.strictEqual(b.m.get('10,10'), 0); near(b.v.storage.meat + (b.v.treasury.meat || 0), deerU);
});
check('knob off: hands-in hook does nothing and fields stay', () => {
  const r = spawnSync(process.execPath, ['-e', `process.env.ENABLE_VILLAGES='0';const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),V=require('./server/villages'),S=V.__p3Bind({}).state;const w=E2.createWorldV2({seed:1,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);const p={pid:'x',simJob:'hunter',_huntBud:3,_huntKil:0,_t1195At:1,_t1195Open:1};S.deps={players:new Map([['x',p]])};const vil={econ:v,npcPids:['x'],_gameRich:new Map([['1,1',50]])};const s0=JSON.stringify(v.storage);V._t1195HuntIn(vil);console.log(JSON.stringify([E.productionFormulaOff(v,'hunter'),E.huntActOn(v),E.huntDemandLeft(v),JSON.stringify(v.storage)===s0,p._t1195At,vil._gameRich.get('1,1')]));`], { cwd: ROOT, env: { ...process.env, T1195_HUNT_REAL: '0' }, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), [false, false, null, true, 1, 50]);   // Infinity → JSON null
});
check('reach flag is planted only at a hunting ground that is not home', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  const mm = src.match(/    if \(_lifeEcon\(\)\.T1195_HUNT_REAL && !npc\._t1195At\) \{ (.*?) \}\n/); assert(mm, 'flag line');
  const f = new Function('_t427HomeOf', 'vil', 'npc', 'ws', mm[1]);
  const home = () => ({ x: 5, y: 5 });
  const n1 = {}; f(home, {}, n1, { x: 900, y: 900 }); assert.strictEqual(n1._t1195At, 1);
  const n2 = {}; f(home, {}, n2, { x: 5, y: 5 }); assert.strictEqual(n2._t1195At, undefined);
  assert(src.includes('  _t1195HuntIn(vil);   // ★[T1195]') && src.indexOf('  _t1195HuntIn(vil);   // ★[T1195]') < src.indexOf('  if (T720_LON_DAY) { _t724DayMark(vil); return; }'), 'hook before T720 return');
});
check('seen kill records its species at the kill (wildlife)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/wildlife.js'), 'utf8');
  assert(src.includes("if (T1195_HUNT_REAL) { const sp = MAIN_TYPE[a._carc.type]; if (sp) { const o = rp0._t1195Sp || (rp0._t1195Sp = {}); o[sp] = (o[sp] || 0) + 1; } }"));
});
state.deps = oldDeps; state.zoneId = oldZone;
if (!MUT) for (const [kind, name] of [['formula', 'physical host closes hunter formula meat and every byproduct; non-host keeps the formula'], ['refund', 'out of view: unreached day brings nothing and returns the whole take to the cell'], ['reach', 'out of view: unreached day brings nothing and returns the whole take to the cell']])
  check('mutant ' + kind + ' is caught', () => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1195_MUTANT: kind }, encoding: 'utf8' }); assert.strictEqual(r.status, 1, r.stderr); assert(r.stdout.includes('FAIL ' + name), r.stdout); });
console.log(`PASS ${pass} / FAIL ${fail}`); process.exitCode = fail ? 1 : 0;
