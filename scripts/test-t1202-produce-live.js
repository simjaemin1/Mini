#!/usr/bin/env node
// @regress
'use strict';
// [T1202] 생산 셋 켤 날 — 몸이 못 하는 하루를 일괄이 그 몸의 하루로: 손잡이 · 시계 문턱 · 명부(몸 없는 일꾼 · 왕복 못 하는 시계의 안 걸은 몸) ·
//   어부 일괄(시간 · 짐 · 마을 몫 · 수요 · 온전한 마리) · 가장 가까운 물가 · 나무꾼 · 채집 명부 글자 · 변이 셋.
process.env.T312_FISH_ACT = '1'; process.env.T325_WOOD_ACT = '1'; process.env.T347_FORAGE_ACT = '1';
const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }
const MUT = process.env.T1202_MUTANT || '';
if (!MUT) for (const val of [undefined, '0', '1', '']) check('default ' + String(val), () => {
  const env = { ...process.env, ENABLE_VILLAGES: '0' }; delete env.T1202_BATCH; if (val !== undefined) env.T1202_BATCH = val;
  const r = spawnSync(process.execPath, ['-e', "const V=require('./server/villages');console.log(JSON.stringify(V._t1202Roster({econ:{counts:{fisher:2}},npcPids:[]},'fisher',null,0,false)));"], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout.trim().split('\n').at(-1));
  if (val === '0') assert.strictEqual(out, null); else assert.deepStrictEqual(out, { n: 2, bodiless: 2, bodies: 0 });
});
process.env.ENABLE_VILLAGES = '0';
if (MUT) {
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, file) {
    if (file !== path.join(ROOT, 'server/villages.js')) return old(m, file);
    let src = fs.readFileSync(file, 'utf8');
    const swap = (a, b) => { assert(src.includes(a), 'mutant needle ' + MUT); src = src.replace(a, b); };
    if (MUT === 'bodiless') swap('  const bodiless = Math.max(0, econN - nb);', '  const bodiless = 0;');
    else if (MUT === 'clock') swap('  const bodies = _t1202ClockShort() ?', '  const bodies = true ?');
    else if (MUT === 'observed') swap('  if (observed) return { n: 0, bodiless: 0, bodies: 0 };', '');
    else if (MUT === 'demand') swap('      const m = Math.min(mT, mD, mQ);', '      const m = Math.min(mT, mQ);');
    m._compile(src, file);
  };
}
const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2'), K = require('../server/kcal');
const V = require('../server/villages'), state = V.__p3Bind({}).state, oldDeps = state.deps, oldDay = state.dayMs, oldZone = state.zoneId;
const near = (a, b, eps = 1e-6) => assert(Math.abs(a - b) <= eps, a + ' != ' + b);
const SZ = 32;
check('clock threshold: a 250ms village day cannot hold one cell round trip; the canonical day can', () => {
  state.deps = { moveSpeed: 64, dayPhaseRatio: 0.7, players: new Map() };
  state.dayMs = 250; assert.strictEqual(V._t1202ClockShort(), true);
  state.dayMs = 1440000; assert.strictEqual(V._t1202ClockShort(), false);
});
check('roster = bodiless workers always + idle bodies only on a short clock; an observed village keeps its body roster (T449)', () => {
  const pl = new Map([['a', { pid: 'a', simJob: 'lumberjack' }], ['b', { pid: 'b', simJob: 'lumberjack' }], ['c', { pid: 'c', simJob: 'farmer' }]]);
  state.deps = { moveSpeed: 64, dayPhaseRatio: 0.7, players: pl };
  const vil = { econ: { counts: { lumberjack: 5 } }, npcPids: ['a', 'b', 'c'] }, crew = [pl.get('a'), pl.get('b')];
  state.dayMs = 1440000; assert.deepStrictEqual(V._t1202Roster(vil, 'lumberjack', crew, 0, false), { n: 3, bodiless: 3, bodies: 0 });
  state.dayMs = 250; assert.deepStrictEqual(V._t1202Roster(vil, 'lumberjack', crew, 0, false), { n: 5, bodiless: 3, bodies: 2 });
  assert.deepStrictEqual(V._t1202Roster(vil, 'lumberjack', crew, 1, false), { n: 4, bodiless: 3, bodies: 1 });
  assert.deepStrictEqual(V._t1202Roster(vil, 'lumberjack', crew, 0, true), { n: 0, bodiless: 0, bodies: 0 });   // 관측 마을 = 몸 명부(몸 없는 일꾼도 일괄 0)
  state.dayMs = 1440000; assert.deepStrictEqual(V._t1202Roster(vil, 'lumberjack', crew, 0, true), { n: 0, bodiless: 0, bodies: 0 });
});
// ── 어부 일괄 ──
function fishFixture(opt = {}) {
  const w = E2.createWorldV2({ seed: 42, villageCount: 1 }), v = w.villages[0]; E.bindProductionActs(w);
  v.storage = { fish: 0 }; v.treasury = {}; v.counts = { fisher: opt.fishers != null ? opt.fishers : 3 };
  v._fishOutLast = opt.D != null ? opt.D : 2; v._t312Cells = 1; v._t312InflowToday = 0;
  const water = new Set(['11,10']);
  const isW = (x, y) => water.has(Math.floor(x / SZ) + ',' + Math.floor(y / SZ));
  const vil = { name: '어촌시험', ccx: 10, ccy: 14, econ: v, npcPids: [], _jobSites: { day: 7, tmul: 1, fisher: [{ x: 10 * SZ + 16, y: 10 * SZ + 16 }], lumberjack: [], miner: [], forager: [], hunter: [] } };
  state.deps = { moveSpeed: 64, dayPhaseRatio: 0.7, players: new Map(), isWaterTileLocal: isW };
  state.dayMs = 250; state.zoneId = 'hanbando';
  return { v, vil };
}
check('fish batch: bodiless fishers land whole fish up to the day demand through the same quota and granary door', () => {
  const { v, vil } = fishFixture({ D: 4 });
  v._t312InflowToday = 3;   // 몸이 오늘 이미 3 을 넣었다 — 남은 수요 1 (마을 몫 장부는 4 그대로 — 수요 문이 따로 문다)
  const g = V._t1202FishBatch(vil, 7);
  assert(g > 0, 'landed ' + g);
  assert(g <= 1 + 1e-9, 'not past the day demand ' + g);
  near(v.storage.fish + (v.treasury.fish || 0), g);
  near(vil._t312.took, g);   // 마을 몫 장부에서 빠진 것 = 곳간에 든 것(문이 잘라낸 몫을 장부가 먼저 빼면 안 된다)
  const g2 = V._t1202FishBatch(vil, 7); assert(g + g2 <= 1 + 1e-9, 'second call still inside the demand');
  assert.strictEqual(vil._t1202Batch.fish, +(g + g2).toFixed(6));
});
check('fish batch: no fisher, no shore, or knob off brings nothing', () => {
  const a = fishFixture({ fishers: 0 }); assert.strictEqual(V._t1202FishBatch(a.vil, 7), 0);
  const b = fishFixture(); b.vil._jobSites.fisher = []; assert.strictEqual(V._t1202FishBatch(b.vil, 7), 0);
  const r = spawnSync(process.execPath, ['-e', "process.env.ENABLE_VILLAGES='0';const V=require('./server/villages');console.log(V._t1202Roster({econ:{counts:{fisher:3}},npcPids:[]},'fisher',null,0,false)===null?'off':'on')"], { cwd: ROOT, env: { ...process.env, T1202_BATCH: '0' }, encoding: 'utf8' });
  assert.strictEqual(r.stdout.trim().split('\n').at(-1), 'off');
});
check('production off (the default world): the fish batch and the shore search never run', () => {
  //   생산 셋이 꺼진 세계(지금 기본)에서는 T1202 줄이 한 줄도 안 돈다 — 어부 일괄은 첫 줄(`T312_FISH_ACT`)에서 0 · 물가 찾기는 `_lifeJobSites` 의 같은 술어 뒤
  const code = "process.env.ENABLE_VILLAGES='0';const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2'),V=require('./server/villages'),S=V.__p3Bind({}).state;" +
    "const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v.storage={fish:0};v.treasury={};v.counts={fisher:3};v._fishOutLast=4;v._t312Cells=1;" +
    "S.deps={moveSpeed:64,dayPhaseRatio:0.7,players:new Map(),isWaterTileLocal:(x,y)=>Math.floor(x/32)===11&&Math.floor(y/32)===10};S.dayMs=250;S.zoneId='hanbando';" +
    "const vil={name:'x',ccx:10,ccy:14,econ:v,npcPids:[],_jobSites:{day:7,tmul:1,fisher:[{x:336,y:336}],lumberjack:[],miner:[],forager:[],hunter:[]}};" +
    "console.log(JSON.stringify([E.T312_FISH_ACT,V._t1202FishBatch(vil,7),(v.storage.fish||0)+(v.treasury.fish||0),vil._t1202Shore===undefined]));";
  const env = { ...process.env }; delete env.T312_FISH_ACT; delete env.T325_WOOD_ACT; delete env.T347_FORAGE_ACT;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), [false, 0, 0, true]);
  const r1 = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...env, T312_FISH_ACT: '1' }, encoding: 'utf8' });
  const o1 = JSON.parse(r1.stdout.trim().split('\n').at(-1)); assert(o1[0] === true && o1[1] > 0, 'positive control ' + r1.stdout.slice(-200));
});
check('fish batch: a big demand is bounded by the bodies day (time and carry), not by the demand', () => {
  const { v, vil } = fishFixture({ D: 1e6, fishers: 1 });
  v._t312Cells = 1;
  const g = V._t1202FishBatch(vil, 7);
  assert(g > 0 && g < 1e6, 'bounded ' + g);
  const F = require('../server/fishing'), maxCasts = Math.floor(1440000 * 0.7 / F.CFG.WAIT_BASE_MS);
  const perFishMax = Math.max(...require('../server/freshfish').ids().map((id) => K.econUnitsOf(id, 1, require('../server/fish-goods').bodyKg(id)) || 0));
  assert(g <= maxCasts * perFishMax + 1e-6, 'no more than one fish per cast ' + g);
});
check('nearest shore: a village with no bank in its territory walks to the first water ring', () => {
  const water = new Set(['20,14']);
  state.deps = { isWaterTileLocal: (x, y) => water.has(Math.floor(x / SZ) + ',' + Math.floor(y / SZ)) };
  const vil = { ccx: 10, ccy: 14 };
  const sh = V.__labProbe && V.__labProbe._t1202Probe ? V.__labProbe._t1202Probe.shore(vil) : null;
  assert(sh && sh.length >= 1, 'found');
  assert.deepStrictEqual(sh[0], { x: 19 * SZ + 16, y: 14 * SZ + 16 });
});
check('wood and forage rosters use the T1202 roster only on the real host (T1180 body-only line otherwise)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  assert(src.includes("const _t1202W = (_bodyOnly && _on) ? _t1202Roster(vil, 'lumberjack', _t561W || _t491C, _walked, _t449S) : null;"));
  assert(src.includes('const _ln = _t1202W ? _t1202W.n : ((_t449S || _bodyOnly) ? 0 : _lnE);'));
  assert(src.includes("const _t1202G = (_on && _lifeEcon().productionFormulaOff?.(vil.econ,'forager')) ? _t1202Roster(vil, 'forager', _t561F, _walked, _t449S) : null;"));
  assert(src.includes("const _fg = _t1202G ? _t1202G.n : ((_t449S || _lifeEcon().productionFormulaOff?.(vil.econ,'forager')) ? 0 : _fgE);"));
  //   어부 일괄은 `fishActOn` 문 밖에서 — 그 마을 몸이 어부가 아니어도(현장 목록이 안 열려도) 몸 없는 어부의 하루가 돈다
  const at = src.indexOf('  if (T1202_BATCH && vil.econ && _lifeEcon().T312_FISH_ACT) _t1202FishBatch(vil, ');
  assert(at > 0, 'fish batch call');
  const gate = src.lastIndexOf('  if (vil.econ && _lifeEcon().fishActOn(vil.econ)) {', at), close = src.indexOf('\n  }\n', gate);
  assert(gate > 0 && close > gate && close < at, 'called after the fishActOn block closes');
});
state.deps = oldDeps; state.dayMs = oldDay; state.zoneId = oldZone;
const ROSTER = 'roster = bodiless workers always + idle bodies only on a short clock; an observed village keeps its body roster (T449)';
if (!MUT) for (const [kind, name] of [['bodiless', ROSTER], ['clock', ROSTER], ['observed', ROSTER], ['demand', 'fish batch: bodiless fishers land whole fish up to the day demand through the same quota and granary door']])
  check('mutant ' + kind + ' is caught', () => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1202_MUTANT: kind }, encoding: 'utf8' }); assert.strictEqual(r.status, 1, r.stderr); assert(r.stdout.includes('FAIL ' + name), r.stdout); });
console.log(`PASS ${pass} / FAIL ${fail}`); process.exitCode = fail ? 1 : 0;
