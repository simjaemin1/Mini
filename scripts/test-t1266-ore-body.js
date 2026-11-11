#!/usr/bin/env node
// @regress
'use strict';
// === scripts/test-t1266-ore-body.js — T1266 광부 원석의 양 = 몸이 친 만큼(손잡이 `T1266_ORE_BODY` · 끔 기본) ==========
//   ① 손잡이: 끔 기본 · `=1` 만 켬.
//   ② 켬 = 몸은 그날 수식 몫 D 에서 안 멈추고(짐 · 셀 · 한 시간 값만) · 곳간 입구가 D 로 안 자른다(친 kg ÷ 원석 한 단위 kg 그대로 든다).
//      끔 = 종전(D 에서 퇴근 · 입구가 D 로 자른다) — 같은 고정판에서 견준다.
//   ③ 켬 = 다음 한 시간 캔 값이 쉰 값보다 크지 않으면 그날 멈춘다(그날 다시 안 친다 · 이튿날 다시 묻는다).
//   ④ 몸이 안 친 날 원석이 곳간에 안 든다(실제 몸 호스트에 묶인 마을 · 수식 원석 0).
//   ⑤ 값 함수: `t1266OreValue` 의 λ 는 어부 `t1217Value` 의 λ 와 같은 함수다(사본 0) · unit = Σ 몫 × 값 × λ.
//   ⑥ `oreMixAt` = `oreMineralAt` 추첨의 기댓값 몫(같은 자리 · 씨 고정 추첨 4만 번과 0.01 안).
//   ⑦ 미끼 셋(사본 · `T1266_MUTANT`) — 각각 빨강이어야 한다: D 문이 남은 사본 · 입구가 D 로 자르는 사본 · 몸이 안 친 날 수식 원석이 드는 사본.
const assert = require('assert'), fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..'); let pass = 0, fail = 0;
function test(n, f) { try { f(); pass++; console.log('  ✓ ' + n); } catch (e) { fail++; console.log('  ✗ ' + n + ': ' + (e && e.message || e)); } }
function child(env, code) { const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' }); assert.strictEqual(r.status, 0, r.stderr); return JSON.parse(r.stdout.trim().split('\n').at(-1)); }
const MUT = process.env.T1266_MUTANT || '', SUB = !!MUT || process.env.T1266_ARM === '0';   // 아이 판(미끼 · 끈 팔)은 ②③④ 만
if (!SUB) {
  console.log('① 손잡이');
  for (const val of [undefined, '0', '1', '', 'true']) test('손잡이 ' + String(val) + ' → ' + (val === '1' ? '켬' : '끔'), () => {
    const env = { ...process.env }; delete env.T1266_ORE_BODY; if (val !== undefined) env.T1266_ORE_BODY = val;
    const r = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./sim/economy-sim').T1266_ORE_BODY))"], { cwd: ROOT, env, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), val === '1');
  });
}
process.env.T1188_ORE_SPLIT = '1'; process.env.T724_MINE_ACT = '1'; process.env.T427_WORK_REACH = '0'; process.env.ENABLE_VILLAGES = '0'; process.env.T1192_FISH_SPECIES = '0';
if (process.env.T1266_ARM !== '0') process.env.T1266_ORE_BODY = '1';
if (MUT) {   // 미끼 — 정본 파일을 읽어 한 줄만 바꾼 사본으로 싣는다(파일 무변)
  const M = require('module'), old = M._extensions['.js'];
  const R = {
    dgate: ['server/villages.js', 'const left = T66 ? Infinity : E.mineDemandLeft(', 'const left = E.mineDemandLeft('],
    cap: ['sim/economy-sim.js', "const u = T1266_ORE_BODY ? ((typeof units === 'number' && units > 0) ? units : 0) : actDemandCap(", 'const u = actDemandCap('],
    formula: ['sim/economy-sim.js', "(job === 'miner' && T1188_ORE_SPLIT)", "(job === 'miner' && T1188_ORE_SPLIT && !T1266_ORE_BODY)",
      'function mineActOn(v) { return !!(T724_MINE_ACT && v && ((v._t724Walk | 0) > 0 || (T1188_ORE_SPLIT && productionActsBound(v)))); }', 'function mineActOn(v) { return !!(T724_MINE_ACT && v && ((v._t724Walk | 0) > 0 || (T1188_ORE_SPLIT && productionActsBound(v) && !T1266_ORE_BODY))); }'],   // 켬이면 몸이 안 친 날 수식이 원석을 낸다
  }[MUT];
  M._extensions['.js'] = function (m, f) { if (f !== path.join(ROOT, R[0])) return old(m, f); let x = fs.readFileSync(f, 'utf8'); for (let i = 1; i < R.length; i += 2) { assert(x.includes(R[i]), '미끼 자리 없음 ' + MUT); x = x.replace(R[i], R[i + 1]); } m._compile(x, f); };
}
const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2'), O = E.OreGoods, Sp = require('../server/specialty'), W = require('../server/weights'), V = require('../server/villages'), Tr = require('../server/terrain');
const H = V.__p3Bind({}), S = H.state, P = V.__labProbe._t1188Probe;
const KGU = W.kgOf('ore');
function close(a, b, e) { assert(Math.abs(a - b) < (e || 1e-6), `${a} != ${b}`); }
//   고정판(T1188 하네스 그 꼴): 마을 하나 · 광부 몸 하나 · 셀 하나(주석) · 그날 D = 0.01 단위(아주 작다)
function fixture(val) {
  const w = { day: 1 }, v = { name: 'ore-t1266', ccx: 0, ccy: 0, _granList: [], _oreCells: [{ cx: 2, cy: 0, p: .5 }], npcPids: ['a'], _mineLvl: 5,
    econ: { _world: w, storage: { food: 1000 }, treasury: {}, land: { ore: 1, oreMix: { tin: 1 } }, counts: { miner: 1 }, npcs: [{ currentJob: 'miner', skills: { mining: 5 } }], _oreOutLast: 0.01 } };
  const p = { pid: 'a', simVillageId: 1, simJob: 'miner', x: 80, y: 16, inventory: {}, _t724Site: { cx: 2, cy: 0, x: 80, y: 16, day: 1 } };
  let stock = 1000, cuts = 0; E.bindProductionActs(w);
  S.world = w; S.dayMs = 1440000; S.epoch = 0; S.zoneId = 'test'; S.villages = [v];
  S.deps = { players: new Map([['a', p]]), oreStockAt: () => stock, oreConsumeAt: (_x, _y, n) => { cuts++; const q = Math.min(n, stock); stock -= q; return q; }, oreMineralAt: () => 'tin', oreMixAt: () => ({ tin: 1 }), dayPhaseRatio: .7 };
  S.econV2 = Object.assign({}, E2, { t1266OreValue: () => val });   // 값 함수 자리(⑤ 가 정본을 따로 잰다) — 이 판은 문만 잰다
  return { v, p, cuts: () => cuts };
}
const ARM = E.T1266_ORE_BODY;
console.log('② 켬 = D 에서 안 멈춘다 · 입구가 안 자른다' + (ARM ? '' : '(끈 팔)'));
test((ARM ? '켬' : '끔') + ': 한 시간 값 > 쉰 값이면 D(0.01 단위 = 0.05 kg)를 넘겨 짐(25 kg)까지 친다 · 입구가 다 받는다', () => {
  const { v, p, cuts } = fixture({ unit: 1, rest: 0 }); const T = V.tickPerf().probe.t724 || {}; const d0 = T.done || 0;
  P.mine(v, p, 1000, 1); P.mine(v, p, 1000 + 3600 * 1000, 1);
  const kg = p.inventory.ore_chunk || 0; assert(cuts() > 0, '한 타도 안 쳤다');
  const cap = require('../server/carry').CFG.CAP_KG;
  if (ARM) { assert(kg >= cap - 1e-6, `손 ${kg} kg < 짐 ${cap}`); assert.strictEqual((V.tickPerf().probe.t724.done || 0) - d0, 0, 'D 문으로 퇴근했다'); }
  else assert(kg <= 0.01 * KGU + Sp.mineChunkKg(5) / Sp.mineSwingsNeeded(1) + 1e-6, `끔인데 D 를 넘겼다 ${kg}`);
  const g = P.deliver(v, p, 1000 + 3600 * 1000 + 1);
  if (ARM) { close(g, kg / KGU); close((v.econ.storage.ore_tin || 0) + (v.econ.treasury.ore_tin || 0), kg / KGU); close(p.inventory.ore_chunk || 0, 0); }   // 곳간 + 세금(금고) = 친 kg 그대로
  else assert((v.econ.storage.ore_tin || 0) + (v.econ.treasury.ore_tin || 0) <= 0.01 + 1e-9, '끔 입구가 D 를 넘겨 받았다');
});
if (ARM) {
  console.log('③ 켬 = 한 시간 값 ≤ 쉰 값이면 그날 멈춘다');
  test('값 0 ↔ 쉰 값 > 0 → 그날 한 타도 안 친다 · 다음 시간에도 안 친다 · 이튿날 다시 묻는다', () => {
    const { v, p, cuts } = fixture({ unit: 0, rest: 1e-6 });
    P.mine(v, p, 1000, 1); P.mine(v, p, 30000, 1); P.mine(v, p, 1000 + 2 * 3600 * 1000, 1);
    assert.strictEqual(cuts(), 0); assert(p._t1266Stop && p._t1266Stop.day === 1, '멈춤 칸이 안 섰다');
    p._t724Site = { cx: 2, cy: 0, x: 80, y: 16, day: 2 }; S.econV2.t1266OreValue = () => ({ unit: 1, rest: 0 });
    P.mine(v, p, 1440000 + 1000, 2); P.mine(v, p, 1440000 + 5000, 2); assert(cuts() > 0, '이튿날 값이 서도 안 쳤다');
  });
  test('값을 못 매기면(값 함수가 null) 종전처럼 친다(멈춤 0)', () => {
    const { v, p, cuts } = fixture(null); P.mine(v, p, 1000, 1); P.mine(v, p, 5000, 1); assert(cuts() > 0); assert(!p._t1266Stop);
  });
  console.log('④ 몸이 안 친 날 원석이 곳간에 안 든다');
  test('몸 호스트에 묶인 광산 마을 · 몸이 안 친 날 — 그날 econ 원석 산출 0 · 곳간 원석 무변', () => {
    const w = E2.createWorldV2({ seed: 42, villageCount: 1 }), a = w.villages[0]; E.bindProductionActs(w);
    a.storage.food = 10000; a.land.ore = 1; a.land.oreMix = { copper: 1 }; a._consEMA = { ore_copper: 1, copper: 1 }; for (const n of a.npcs) n.currentJob = 'miner'; a.counts = { miner: a.npcs.length };
    for (const k of O.ids) a.storage[k] = 0; E.tickVillage(a, 1);
    for (const k of O.ids) close(a.dailyProductionBuf[k] || 0, 0); for (const k of O.ids) assert(!((a.storage[k] || 0) > 1e-9), `몸 없이 ${k} ${a.storage[k]}`);
  });
}
if (!SUB) {
  console.log('⑤ 값 함수');
  test('t1266OreValue λ = t1217Value λ(같은 함수) · unit = Σ 몫 × max(값, 순수출가) × λ · rest = 어부와 같다', () => {
    const v = E.createVillage({ initialPop: 12, oreMix: { copper: 1 } });
    const px = E2.computeShadowPrices(v), a = E2.t1217Value(v, 10, null), b = E2.t1266OreValue(v, 10, null, { ore_copper: .7, ore_tin: .3 });
    close(b.lam, a.lam); assert.strictEqual(b.best, a.best); close(b.rest, a.rest); close(b.p, .7 * px.ore_copper + .3 * px.ore_tin); close(b.unit, b.p * b.lam);
    const c = E2.t1266OreValue(v, 10, null, null); close(c.p, px.ore || 0);
  });
  console.log('⑥ oreMixAt = oreMineralAt 추첨의 기댓값');
  test('한반도 구리 광맥 · 납 광맥 · 몫 합 1 · 씨 고정 추첨 4만 번과 0.01 안', () => {
    for (const [x, y] of [[45602, 25421], [67840, 67753]]) {
      const m = Tr.oreMixAt('hanbando', x, y); assert(m, '몫 없음'); let s = 0; for (const k in m) s += m[k]; close(s, 1, 1e-9);
      let z = 12345; const rnd = () => ((z = (Math.imul(z, 1103515245) + 12345) >>> 0) / 4294967296);
      const n = 40000, c = {}; for (let i = 0; i < n; i++) { const k = Tr.oreMineralAt('hanbando', x, y, rnd); c[k] = (c[k] || 0) + 1; }
      for (const k of new Set([...Object.keys(m), ...Object.keys(c)])) close((c[k] || 0) / n, m[k] || 0, 0.01);
    }
  });
  console.log('⑦ 미끼(사본) — 빨강이어야 한다');
  for (const [kind, name] of [['dgate', 'D(0.01 단위'], ['cap', 'D(0.01 단위'], ['formula', '몸 호스트에 묶인 광산 마을']]) test('미끼 ' + kind + ' 가 걸린다', () => {
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1266_MUTANT: kind }, encoding: 'utf8' });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr); assert(r.stdout.split('\n').some((l) => l.includes('✗') && l.includes(name)), r.stdout);
  });
  test('끈 팔(`T1266_ARM=0`) — 같은 고정판에서 종전 D 문 그대로(초록)', () => {
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1266_ARM: '0', T1266_MUTANT: '', T1266_ORE_BODY: '' }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  });
}
console.log(`=== ${pass} 통과 / ${fail} 실패 ===`); process.exitCode = fail ? 1 : 0;
