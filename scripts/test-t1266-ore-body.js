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
//   ★[T1271] ⑧ 쉰 값 = 어부와 같은 함수(`t1217RestValue` · 광부 값 함수에 쉰 값 식 사본 0) · 광부 쉰 사람-날이 econ 여가 밑변(`t1217IdleFrac`)에 어부와 같은 셈으로 든다 ·
//              서버가 그날 멈춘 몸의 쉰 몫을 적는다(`_t1271Day` — 어부 몸 줄 그 식).
//     ⑨ 한 시간 값에 짐 왕복 걸음이 든다 — 곳간이 멀면 그 시간 캘 단위가 타 시간 ÷ (타 시간 + 왕복) 배로 준다 · 곳간 없는 마을은 짐에 남은 자리까지.
//     ⑩ 광부 자리(`T1271_ORE_CAP` 켬) = 닿는 광맥 셀 × 0.30 — 닿는 셀 0 인 마을은 자리 0 · 읽개가 없으면 종전 땅 모형.
//     미끼 셋 더: 광부 값 함수에 쉰 값 식 사본(`restcopy`) · 닿지 않는 광맥을 세는 읽개(`capreach`) · 읽개를 안 보는 자리 식(`capform`).
//   ★[T1277] ⑤ 한 단위 값 = Σ 몫 × 그 마을 원석 그림자 값 × λ(순수출가 안 읽음) · ⑩ 광부 자리 = 닿는 셀 × 조 사람 수(`MINE_TEAM` · 0.30 안 곱함)
//     ⑪ 재고가 녹임 목표(흐름 × 30날)를 넘으면 그림자 값이 떨어져 한 시간 문이 닫힌다 — 이웃이 더 쳐 줘도(순수출가 > 그 마을 값) · 같은 날 곳간이 불어도(시간 표)
//     미끼 넷 더: 순수출가와 큰 쪽(`nevmax` — 종전 줄) · 그날 아침 값표(`daycache`) · 자리 × 0.30(`cap030`) · 자리 = 셀 수(`slot1`) — 각각 빨강.
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
process.env.T1271_ORE_CAP = '1';   // ★[T1271] 읽개를 하네스가 직접 심는다(서버 부팅 없음 — 심지 않은 판은 종전 땅 모형)
process.env.T1188_ORE_SPLIT = '1'; process.env.T724_MINE_ACT = '1'; process.env.T427_WORK_REACH = '0'; process.env.ENABLE_VILLAGES = '0'; process.env.T1192_FISH_SPECIES = '0';
if (process.env.T1266_ARM !== '0') process.env.T1266_ORE_BODY = '1';
if (MUT) {   // 미끼 — 정본 파일을 읽어 한 줄만 바꾼 사본으로 싣는다(파일 무변)
  const M = require('module'), old = M._extensions['.js'];
  const R = {
    dgate: ['server/villages.js', 'const left = T66 ? Infinity : E.mineDemandLeft(', 'const left = E.mineDemandLeft('],
    cap: ['sim/economy-sim.js', "const u = T1266_ORE_BODY ? ((typeof units === 'number' && units > 0) ? units : 0) : actDemandCap(", 'const u = actDemandCap('],
    formula: ['sim/economy-sim.js', "(job === 'miner' && T1188_ORE_SPLIT)", "(job === 'miner' && T1188_ORE_SPLIT && !T1266_ORE_BODY)",
      'function mineActOn(v) { return !!(T724_MINE_ACT && v && ((v._t724Walk | 0) > 0 || (T1188_ORE_SPLIT && productionActsBound(v)))); }', 'function mineActOn(v) { return !!(T724_MINE_ACT && v && ((v._t724Walk | 0) > 0 || (T1188_ORE_SPLIT && productionActsBound(v) && !T1266_ORE_BODY))); }'],   // 켬이면 몸이 안 친 날 수식이 원석을 낸다
    restcopy: ['sim/economy-sim-v2.js', 'return { N, H, unit: p * lam, p, lam, best, rest: t1217RestValue(N, H) };', 'return { N, H, unit: p * lam, p, lam, best, rest: H > 0 ? v1.LEISURE_HAPPY_W / (N * H) : Infinity };'],   // 같은 값의 사본 식(값은 같다 — 함수가 하나여야 한다)
    capreach: ['server/villages.js', '    if (reach && !_t427Reach(vil, null, c.cx * SZ + SZ / 2, c.cy * SZ + SZ / 2, day)) continue;\n', ''],   // 닿지 않는 광맥도 센다
    capform: ['sim/economy-sim.js', 'oreReach == null ? Math.floor(s * Math.max(', 'true ? Math.floor(s * Math.max('],   // 읽개를 안 본다
    nevmax: ['sim/economy-sim-v2.js', 'p += f * (px[id] || 0); }   // ★[T1277]', 'const nev = v._world ? netExportValue(v._world, v, id) : 0; p += f * Math.max(px[id] || 0, nev || 0); }   // ★[T1277]'],   // 종전 줄(이웃 값과 큰 쪽)
    daycache: ['sim/economy-sim-v2.js', 'px = t1217PricesOf(v, key) || computeShadowPrices(v);\n  const { lam, best } = _t1217Lam(v, px, N);\n  const M = mix', 'px = v._priceCache || t1217PricesOf(v, key) || computeShadowPrices(v);\n  const { lam, best } = _t1217Lam(v, px, N);\n  const M = mix'],   // 그날 아침 값표
    cap030: ['sim/economy-sim.js', ': Math.floor(oreReach),', ': Math.floor(oreReach * 0.30),'],   // T1259 계수를 광맥에
    slot1: ['server/villages.js', 'return n == null ? null : n * MINE_TEAM; }', 'return n; }'],   // 자리 = 셀 수(조 사람 수 안 곱함)
  }[MUT];
  M._extensions['.js'] = function (m, f) { if (f !== path.join(ROOT, R[0])) return old(m, f); let x = fs.readFileSync(f, 'utf8'); for (let i = 1; i < R.length; i += 2) { assert(x.includes(R[i]), '미끼 자리 없음 ' + MUT); x = x.replace(R[i], R[i + 1]); } (global.__t1266Src || (global.__t1266Src = {}))[R[0]] = x; m._compile(x, f); };
}
const srcOf = (rel) => (global.__t1266Src && global.__t1266Src[rel]) || fs.readFileSync(path.join(ROOT, rel), 'utf8');   // 실린 글(미끼면 그 사본)
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
if (ARM) {
  console.log('⑧ 쉰 값 = 어부와 같은 함수 · 광부 쉰 시간이 econ 여가에 든다');
  test('쉰 값 식은 v2 에 한 자리(`t1217RestValue`) — 어부 `t1217Value` · 광부 `t1266OreValue` 둘 다 그 함수를 부른다(사본 0) · 값 같음', () => {
    const src = srcOf('sim/economy-sim-v2.js');
    const body = (name) => { const i = src.indexOf('function ' + name + '('); assert(i >= 0, name + ' 없음'); const j = src.indexOf('\n}', i); return src.slice(i, j < 0 ? undefined : j); };
    assert.strictEqual(src.split('LEISURE_HAPPY_W / (N * H)').length - 1, 1, '쉰 값 식이 한 자리가 아니다');
    assert(body('t1217RestValue').includes('LEISURE_HAPPY_W / (N * H)'), '정본 함수에 식이 없다');
    for (const f of ['t1217Value', 't1266OreValue']) assert(body(f).includes('rest: t1217RestValue(N, H)'), f + ' 가 같은 함수를 안 부른다');
    const v = E.createVillage({ initialPop: 12, oreMix: { copper: 1 } });
    close(E2.t1266OreValue(v, 10, null, null).rest, E2.t1217Value(v, 10, null).rest); close(E2.t1217RestValue(12, 10), E.LEISURE_HAPPY_W / 120);
  });
  test('econ 여가 밑변(`t1217IdleFrac`) — 행위 광부 3 · 쉰 사람-날 1.5 · 수식 여유 0.2 · 10명 → (7 × 0.2 + 1.5) ÷ 10 · 칸이 없으면 종전 값', () => {
    const w = { day: 1 }; E.bindProductionActs(w);
    const v = { _world: w, _idleFrac: 0.2, counts: { miner: 3 }, npcs: new Array(10).fill(0).map(() => ({})), _t724Walk: 1 };
    close(E.t1217IdleFrac(v, 10), 0.2);
    v._t1271Rest = 1.5; close(E.t1217IdleFrac(v, 10), (7 * 0.2 + 1.5) / 10);
    v._t1271Rest = 9; close(E.t1217IdleFrac(v, 10), (7 * 0.2 + 3) / 10);   // 광부 수에서 자른다(어부 줄 그 꼴)
  });
  test('서버 `_t1271Day` — 어제 낮 몫 0.35 에서 멈춘 광부 몸(낮 비율 0.7) → 쉰 사람-날 0.5 · econ `_t1271Rest` · 다른 날 멈춘 몸은 0', () => {
    const { v, p } = fixture({ unit: 1, rest: 0 }); p._t1266Stop = { day: 1, f: 0.35 };
    close(V._t1271Day(v, 2), 0.5); close(v.econ._t1271Rest, 0.5); close(V._t1271Day(v, 3), 0); close(v.econ._t1271Rest, 0);
  });
  console.log('⑨ 한 시간 값에 짐 왕복 걸음');
  test('곳간 사다리가 셀 곁이면 칠 몫 1 · 3,200 px 떨어지면 타 시간 ÷ (타 시간 + 왕복) · 곳간이 없으면 짐에 남은 자리까지', () => {
    const { v, p } = fixture({ unit: 1, rest: 0 }); S.deps.moveSpeed = 100;
    const s0 = { cx: 2, cy: 0, x: 80, y: 16 }, cap = require('../server/carry').CFG.CAP_KG, ck = Sp.mineChunkKg(5), need = Sp.mineSwingsNeeded(1000 / Sp.ORE_K);
    const swH = Math.floor(S.dayMs / 24 / Sp.MINE_SWING_MS), U = (f) => Math.min(swH * f / need, 1000) * ck / KGU;
    const u = (gl, hand) => { v._granList = gl; p.inventory.ore_chunk = hand || 0; const a = V.t1266Stat().u; V._t1266Keep(v, p, s0, 1, Sp, KGU); return V.t1266Stat().u - a; };
    close(u([{ cx: 2, cy: -2 }]), U(1), 1e-9);
    const load = cap / (ck / need) * Sp.MINE_SWING_MS, walk = 2 * 3200 / 100 * 1000;
    close(u([{ cx: 102, cy: -2 }]), U(load / (load + walk)), 1e-9); assert(load / (load + walk) < 1);
    close(u([], 20), Math.min(swH / need, 1000, (cap - 20) / ck) * ck / KGU, 1e-9);
  });
  console.log('⑩ 광부 자리 = 닿는 광맥 셀(`T1271_ORE_CAP`)');
  test('econ `jobCapacity` — 읽개(자리) 0 → 광부 자리 0 · 40 → 40(0.30 안 곱함) · 읽개 없음(null) → 종전 땅 모형', () => {
    assert.strictEqual(E.T1271_ORE_CAP, true);
    const v = E.createVillage({ initialPop: 12, oreMix: { copper: 1 } }); v.land.ore = 1;
    E.setT1271OreReader(null); const base = E.jobCapacity(v).miner; assert(base > 0, '종전 자리 0 — 아래가 자명 통과');
    try {
      E.setT1271OreReader(() => 0); assert.strictEqual(E.jobCapacity(v).miner, 0);
      E.setT1271OreReader(() => 40); assert.strictEqual(E.jobCapacity(v).miner, 40);
      E.setT1271OreReader(() => null); assert.strictEqual(E.jobCapacity(v).miner, base);
    } finally { E.setT1271OreReader(null); }
  });
  test('서버 읽개 `_t1271OreCells` — 광맥 셀 셋 · 회관에서 하나도 안 닿으면 0 · 다 닿으면 재고 ≥ 1 인 셀만(둘)', () => {
    const { v } = fixture({ unit: 1, rest: 0 }); v._oreCells = [{ cx: 2, cy: 0, p: .5 }, { cx: 3, cy: 0, p: .4 }, { cx: 4, cy: 0, p: .3 }];
    S.byEcon = new Map([[v.econ, v]]); let can = false;
    Object.assign(S.deps, { oreStockAt: (cx) => (cx === 4 ? 0.5 : 1000), npcCanReach: () => can, collGenAround: () => 0, npcReachBegin: () => ({ done: true }), npcReachStep: () => true, npcReachHas: () => can });
    delete v._t1271C; v._t427R = null; assert.strictEqual(V._t1271OreCells(v.econ), 0, '안 닿는 광맥을 셌다');
    can = true; delete v._t1271C; v._t427R = null; assert.strictEqual(V._t1271OreCells(v.econ), 2);
    assert.strictEqual(V.MINE_TEAM, 2); assert.strictEqual(V._t1277OreSlots(v.econ), 2 * V.MINE_TEAM, '자리 = 닿는 셀 × 조 사람 수');   // ★[T1277]
  });
}
if (ARM) {
  console.log('⑪ 재고가 녹임 목표를 넘으면 그림자 값이 떨어져 문이 닫힌다(T1277)');
  //   세계 셋: a(광부 · 구리 녹임 흐름 2/날 → 목표 60) · b(구리 원석을 녹이는데 곳간 0 — 이웃이 더 쳐 준다) · c(구리 100 · 구리 원석 200 — 세계 공급)
  const fx3 = () => {
    const w = E2.createWorldV2({ seed: 42, villageCount: 3, infoRange: 5000 }), [a, b, c] = w.villages; E.bindProductionActs(w);
    a.land.ore = 1; a.land.oreMix = { copper: 1 }; b.land.oreMix = { copper: 1 };
    a._consEMA = Object.assign(a._consEMA || {}, { ore_copper: 2, copper: 5 }); a.storage.copper = 0.5;
    b._consEMA = Object.assign(b._consEMA || {}, { ore_copper: 5, copper: 5 }); b.storage.ore_copper = 0; b.storage.copper = 0;
    c.storage.copper = 100; c.storage.ore_copper = 200;
    const vil = { name: 'ore-t1277', ccx: 0, ccy: 0, _granList: [{ cx: 2, cy: -2 }], _oreCells: [{ cx: 2, cy: 0, p: .5 }], npcPids: ['a'], _mineLvl: 5, econ: a };
    const p = { pid: 'a', simVillageId: 1, simJob: 'miner', x: 80, y: 16, inventory: {}, _t724Site: { cx: 2, cy: 0, x: 80, y: 16, day: 1 } };
    S.world = w; S.dayMs = 1440000; S.epoch = 0; S.zoneId = 'test'; S.villages = [vil];
    S.deps = { players: new Map([['a', p]]), oreStockAt: () => 1000, oreMixAt: () => ({ copper: 1 }), oreMineralAt: () => 'copper', dayPhaseRatio: .7, moveSpeed: 100 };
    S.econV2 = E2;   // 정본 값 함수 그대로(고정판 ② 의 값 자리 대신)
    let hk = 100;
    const ask = (st, sameDay) => { a.storage.ore_copper = st; if (!sameDay) w.day++; hk++; const t0 = V.t1266Stat(); const keep = V._t1266Keep(vil, p, { cx: 2, cy: 0, x: 80, y: 16 }, hk, Sp, KGU); const t1 = V.t1266Stat(); return { keep, wr: (t1.w - t0.w) / (t1.r - t0.r), hk }; };
    return { w, a, b, ask };
  };
  test('녹임 목표 60(흐름 2 × 30날) · 곳간 5 · 30 → 친다 · 60 · 6,000 → 그 시간 멈춘다 · 이웃 순수출가(> 그 마을 값)는 안 읽는다', () => {
    const { w, a, ask } = fx3();
    const r5 = ask(5), r30 = ask(30), r60 = ask(60), rB = ask(6000);
    assert(r5.keep && r5.wr > 1, `곳간 5 에서 멈췄다 W/R ${r5.wr}`); assert(r30.keep, `곳간 30(15날 치) 에서 멈췄다 W/R ${r30.wr}`);
    assert(!r60.keep, `곳간 60(30날 치) 에서 안 멈췄다 W/R ${r60.wr}`); assert(!rB.keep, `곳간 6,000(3,000날 치) 에서 안 멈췄다 W/R ${rB.wr}`);
    const px = E2.t1217PricesOf(a, rB.hk), nev = E2.netExportValue(w, a, 'ore_copper'), val = E2.t1266OreValue(a, 16.8, rB.hk, { ore_copper: 1 });
    assert(nev > px.ore_copper * 10, `이웃 값이 그 마을 값보다 안 크다 — 판이 자명 ${nev} ${px.ore_copper}`);
    close(val.p, px.ore_copper, 1e-12); close(val.unit, px.ore_copper * val.lam, 1e-12);
    const src = srcOf('sim/economy-sim-v2.js'), i = src.indexOf('function t1266OreValue('), j = src.indexOf('\n}', i);
    assert(!src.slice(i, j).includes('netExportValue'), '광부 값 함수가 순수출가를 읽는다');
  });
  test('같은 날 곳간이 5 → 6,000 으로 불면 다음 시간 값이 떨어져 멈춘다(그날 아침 값표가 아니다)', () => {
    const { a, ask } = fx3();
    const r5 = ask(5); assert(r5.keep, '곳간 5 에서 멈췄다');
    a._priceCache = E2.computeShadowPrices(a);   // 그날 아침 교역 값표(곳간 5)
    const rB = ask(6000, true); assert(!rB.keep, `같은 날 곳간 6,000 에서 안 멈췄다 W/R ${rB.wr}`);
  });
}
if (!SUB) {
  console.log('⑩′ 손잡이 `T1271_ORE_CAP`');
  for (const val of [undefined, '0', '1', '']) test('T1271 손잡이 ' + String(val) + ' → ' + (val === '1' ? '켬' : '끔'), () => {
    const env = { ...process.env }; delete env.T1271_ORE_CAP; if (val !== undefined) env.T1271_ORE_CAP = val;
    const r = spawnSync(process.execPath, ['-e', "console.log(JSON.stringify(require('./sim/economy-sim').T1271_ORE_CAP))"], { cwd: ROOT, env, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr); assert.strictEqual(JSON.parse(r.stdout.trim().split('\n').at(-1)), val === '1');
  });
  console.log('⑤ 값 함수');
  test('t1266OreValue λ = t1217Value λ(같은 함수) · unit = Σ 몫 × 그림자 값 × λ · rest = 어부와 같다', () => {
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
  for (const [kind, name] of [['dgate', 'D(0.01 단위'], ['cap', 'D(0.01 단위'], ['formula', '몸 호스트에 묶인 광산 마을'], ['restcopy', '쉰 값 식은 v2 에 한 자리'], ['capreach', '서버 읽개'], ['capform', 'econ `jobCapacity`'], ['nevmax', '녹임 목표 60'], ['daycache', '같은 날 곳간이'], ['cap030', 'econ `jobCapacity`'], ['slot1', '서버 읽개']]) test('미끼 ' + kind + ' 가 걸린다', () => {
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1266_MUTANT: kind }, encoding: 'utf8' });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr); assert(r.stdout.split('\n').some((l) => l.includes('✗') && l.includes(name)), r.stdout);
  });
  test('끈 팔(`T1266_ARM=0`) — 같은 고정판에서 종전 D 문 그대로(초록)', () => {
    const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1266_ARM: '0', T1266_MUTANT: '', T1266_ORE_BODY: '' }, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
  });
}
console.log(`=== ${pass} 통과 / ${fail} 실패 ===`); process.exitCode = fail ? 1 : 0;
