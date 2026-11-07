#!/usr/bin/env node
// @regress
'use strict';
// [T1217] 수요 문 대신 "한 시간 값 ↔ 쉰 값"(★재민 11-07 문 35 ⓓ) — 어부부터: 손잡이 · 입질 기댓값(CPUE ∝ 재고 · `plan` 과 같은 빈도) · 온전한 마리 n 까지 같은 어장 장부 ·
//   일괄 하루(한 시간씩 · 빚이면 먹는 값 · 남으면 시세 × 바꿈 · 쉰 값보다 크지 않으면 멈춤 · D 로 안 자름 · 어장이 실제로 준다) · 쉰 몫 → econ 여가 · 시세 하루 안 갱신(같은 시간 · 같은 곳간 = 같은 표 ·
//   캐러밴 주문 · 순수출가가 같은 표) · 끔 = 종전(수요 문 · 마을 몫 · 그날 값) · 변이 넷.
process.env.T312_FISH_ACT = '1'; process.env.T1217_MARGIN = '1';
//   픽스처 조건 하나 — 한 재고 단위를 크게(`FISH_KG_PER_STOCK` · fishing.js 의 env 손잡이) 해서 한 자리(29셀)가 하루 낚시로 바닥나지 않게 한다 —
//   그래야 "반쯤 빈 자리는 한 시간에 덜 문다"(CPUE)를 바닥(재고 한도)과 따로 잰다. 제품 값은 무변(이 프로세스만).
process.env.FISH_KG_PER_STOCK = '50';
const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); } }
const MUT = process.env.T1217_MUTANT || '';
const lastJson = (r) => JSON.parse(r.stdout.trim().split('\n').at(-1));
if (!MUT) for (const val of [undefined, '', '0', '1', 'yes']) check('default ' + String(val), () => {
  const env = { ...process.env, ENABLE_VILLAGES: '0' }; delete env.T1217_MARGIN; if (val !== undefined) env.T1217_MARGIN = val;
  const r = spawnSync(process.execPath, ['-e', "const E=require('./sim/economy-sim');console.log(JSON.stringify(E.T1217_MARGIN));"], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.strictEqual(lastJson(r), val === '1');
});
process.env.ENABLE_VILLAGES = '0';
if (MUT) {
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, file) {
    if (file !== path.join(ROOT, 'server/villages.js')) return old(m, file);
    let src = fs.readFileSync(file, 'utf8');
    const swap = (a, b) => { assert(src.includes(a), 'mutant needle ' + MUT); src = src.replace(a, b); };
    if (MUT === 'nodraw') swap('      const n = mE > 0 ? _t1217Draw(F, p.cx, p.cy, p.kgF / KPS, mE, now, vil) : 0;', '      const n = mE;');
    else if (MUT === 'nostop') swap('      if (!(W > L)) {', '      if (false) {');
    else if (MUT === 'nocpue') swap('      const s01 = _t1217Stock01(F, p.cx, p.cy, now), ew = F.expectedWaitMs(p.spot, s01);', '      const s01 = _t1217Stock01(F, p.cx, p.cy, now), ew = F.expectedWaitMs(p.spot, 1);');
    else if (MUT === 'nochoose') swap('const r = _t1217Stock01(F, e.cx, e.cy, now); if (r > bs + 1e-12) { bs = r; best = e; }', 'const r = 1; if (r > bs + 1e-12) { bs = r; best = e; }');
    else if (MUT === 'norest') swap('  if (vil.econ) vil.econ._t1217Rest = ((r && r.rest) || 0) + bodyRest;', '  if (vil.econ) vil.econ._t1217Rest = 0;');
    m._compile(src, file);
  };
}
const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2'), F = require('../server/fishing');
const V = require('../server/villages'), state = V.__p3Bind({}).state, oldDeps = state.deps, oldDay = state.dayMs, oldZone = state.zoneId;
const near = (a, b, eps = 1e-6) => assert(Math.abs(a - b) <= eps, a + ' != ' + b);
const SZ = 32, SPOT = { water: true, kind: 'river', u: 0.5, depth01: 0, flow01: 0.5, seam01: 0, conflu: 0, halfWidth: 64 };
check('knob on in this harness', () => { assert.strictEqual(E.T1217_MARGIN, true); assert.strictEqual(typeof E2.t1217Value, 'function'); });
// ── 입질 기댓값 · 어장 장부 ──
check('expected bite wait = the plan() wait at its mean draw (same rate line) · halves the bites when the stock halves (CPUE)', () => {
  const e1 = Math.exp(-1);   // −ln(rng) = 1 → 대기 = WAIT_BASE ÷ 빈도 × (JIT + 1 − JIT) = 평균
  for (const s01 of [1, 0.6, 0.3]) {
    const pl = F.plan(SPOT, s01, 0, () => e1);
    near(pl.waitMs, Math.round(F.expectedWaitMs(SPOT, s01)), 0.5);
  }
  near(F.expectedWaitMs(SPOT, 0.5) / F.expectedWaitMs(SPOT, 1), 2, 1e-9);
  assert.strictEqual(F.expectedWaitMs(SPOT, 0), F.CFG.WAIT_MAX_MS);   // 빈 자리 = 가장 긴 대기(두 끝은 `plan` 과 같다)
});
check('whole fish from the same ledger: k = min(n, whole fish the disc still holds) · nothing when not even one', () => {
  F.fishCells.clear();
  const N = F.discN(); assert.strictEqual(N, 29);
  assert.strictEqual(F.drawWholeFish(500, 500, 2, 5, 1000, null), 5);
  near(F.stockRatioAt(500, 500, 1000), (N - 10) / N);
  assert.strictEqual(F.drawWholeFish(500, 500, 2, 1000, 1000, null), Math.floor((N - 10) / 2));   // 남은 온전한 마리까지만
  const left = F.stockRatioAt(500, 500, 1000) * N;
  assert(left < 2 && left >= 0, 'left ' + left);
  const before = JSON.stringify([...F.fishCells]);
  assert.strictEqual(F.drawWholeFish(500, 500, 2, 1, 1000, null), 0);
  assert.strictEqual(JSON.stringify([...F.fishCells]), before);   // 못 대는 한 마리는 장부를 안 건드린다
  F.fishCells.clear();
});
// ── 한 시간 값 ──
function world1() { const w = E2.createWorldV2({ seed: 42, villageCount: 1 }), v = w.villages[0]; E.bindProductionActs(w); return { w, v }; }
function clearHappyGoods(w, v) {
  for (const r of Object.keys(E2.ELASTICITY)) if (E.t1217HappyMu(v, r, v.npcs.length) > 0 || ((E.t1217HappyMu({ storage: {}, npcs: v.npcs }, r, v.npcs.length)) > 0)) { v.storage[r] = 0; }
  v.dailyProductionBuf = {}; w._effDemCache = null;
}
check('value: food debt → one unit = one person-day of debt (1 ÷ (N × die days)) · rest hour = leisure weight ÷ (N × H)', () => {
  const { v } = world1(), N = v.npcs.length;
  v.npcs[0]._fd = 3;
  const val = E2.t1217Value(v, 16.8);
  near(val.vEat, 1 / (N * E.t1197DieDays())); near(val.unit, val.vEat);
  near(val.rest, E.LEISURE_HAPPY_W / (N * 16.8));
});
check('value: no debt → surplus = max(fish price, food price, net export) × best (happiness slope ÷ price) · goods nobody has are not a trade', () => {
  const { w, v } = world1(), N = v.npcs.length;
  for (const p of v.npcs) p._fd = 0;
  clearHappyGoods(w, v);
  let val = E2.t1217Value(v, 16.8);
  assert.strictEqual(val.lam, 0); assert.strictEqual(val.unit, 0);   // 바꿀 행복 물건이 세계에 없다
  v.storage.honey = 1; w._effDemCache = null;   // 꿀 1 — 1인당 2 미만 · 세계에 있다
  val = E2.t1217Value(v, 16.8);
  const px = E2.computeShadowPrices(v);
  assert.strictEqual(val.best, 'honey');
  near(val.lam, E.t1217HappyMu(v, 'honey', N) / px.honey);
  near(val.unit, Math.max(px.fish || 0, px.food || 0, val.nev) * val.lam);   // 생선 = 곳간 식량 1:1 — 식량 값도 그 시세
  v.storage.honey = 2 * N + 1; w._effDemCache = null;   // 찼다 — 기울기 0
  assert.strictEqual(E2.t1217Value(v, 16.8).lam, 0);
});
check('leisure base: act fishers count by their rested person-days, formula jobs by the idle fraction (population-weighted)', () => {
  const { v } = world1(), N = v.npcs.length;
  v.counts = Object.assign({}, v.counts, { fisher: 3 }); v._idleFrac = 0.2;
  assert.strictEqual(E.t1217IdleFrac(v, N), 0.2);   // 칸이 없으면 종전 값
  v._t1217Rest = 1.5;
  near(E.t1217IdleFrac(v, N), ((N - 3) * 0.2 + 1.5) / N);
  v._t1217Rest = 99; near(E.t1217IdleFrac(v, N), ((N - 3) * 0.2 + 3) / N);   // 어부 수를 못 넘는다
});
// ── 시세 하루 안 갱신 ──
check('hour prices: same hour → same table · new hour, same granary → same table · changed granary → priced again · trade and net export read it', () => {
  const { w, v } = world1(); let H = 100;
  w.t1217Hour = () => H;
  const p0 = E2.t1217PricesOf(v); assert(p0 && typeof p0.fish === 'number');
  assert.strictEqual(E2.t1217PricesOf(v), p0);
  H = 101; assert.strictEqual(E2.t1217PricesOf(v), p0);   // 곳간이 그대로 — 다시 안 매긴다
  v.storage.fish = (v.storage.fish || 0) + 500;
  assert.strictEqual(E2.t1217PricesOf(v), p0);           // 같은 시간 안에서는 한 번까지
  H = 102; const p2 = E2.t1217PricesOf(v); assert.notStrictEqual(p2, p0);
  near(p2.fish, E2.computeShadowPrices(v).fish);
  assert(p2.fish < p0.fish, 'more fish → cheaper fish ' + p2.fish + ' < ' + p0.fish);
  delete w.t1217Hour; assert.strictEqual(E2.t1217PricesOf(v), null);   // 호스트 시각이 없으면 없음(종전 길)
  const src = fs.readFileSync(path.join(ROOT, 'sim/economy-sim-v2.js'), 'utf8');
  assert(src.includes('const _t1217 = t1217PricesOf(v); if (_t1217) return _t1217;'), 'neighbour table');
  assert(src.includes('a.prices = t1217PricesOf(a.v) || computeShadowPrices(a.v);'), 'deciding village table');
  assert(src.includes("t = (_t1217H != null && t1217PricesOf(b)) || computeShadowPrices(b);"), 'net export table');
});
// ── 일괄 하루 ──
function fishFixture(opt = {}) {
  const { w, v } = world1();
  v.storage = Object.assign({ fish: 0 }, opt.storage || {}); v.treasury = {}; v.counts = { fisher: opt.fishers != null ? opt.fishers : 3 };
  v._fishOutLast = opt.D != null ? opt.D : 2; v._t312Cells = 1; v._t312InflowToday = 0;
  for (const p of v.npcs) p._fd = 0;
  if (opt.debt) v.npcs[0]._fd = opt.debt;
  //   물 = 셀 x 11 ~ 22 · y 0 ~ 23(버킷 (0, 0) 의 물셀 K = 12 × 24 = 288) — 물가 자리(10, 10)의 동쪽 한 칸(11, 10)이 던질 물 칸
  const isW = (x, y) => { const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ); return cx >= 11 && cx <= 22 && cy >= 0 && cy <= 23; };
  const vil = { name: '어촌시험', ccx: 10, ccy: 14, econ: v, npcPids: [], _jobSites: { day: 7, tmul: 1, fisher: [{ x: 10 * SZ + 16, y: 10 * SZ + 16 }], lumberjack: [], miner: [], forager: [], hunter: [] } };
  state.deps = { moveSpeed: 64, dayPhaseRatio: 0.7, players: new Map(), isWaterTileLocal: isW, t312FishSpotAt: () => SPOT };
  state.dayMs = 250; state.zoneId = 'hanbando';
  F.fishCells.clear(); F.fishBuckets.clear();
  return { w, v, vil };
}
const bucketDeficit = () => [...F.fishBuckets.values()].reduce((s, b) => s + (1 - b.s) * (b.K || 0), 0);
const DEBT = 'batch day: with food debt the fishers fish past the old demand, draw the very fish from the ledger, and the granary gets what the ledger lost';
check(DEBT, () => {
  const { v, vil } = fishFixture({ D: 2, debt: 3 });
  const r = V._t1217FishDay(vil, 7);
  assert(r && r.got > 2 + 1e-9, 'past the old demand D=2: ' + (r && r.got));
  near(v.storage.fish + (v.treasury.fish || 0), r.got);
  const st = V.t1217Stat();
  assert.strictEqual(V._t1217BucketK(0, 0), 288);
  const drawn = bucketDeficit();
  assert(drawn > 0, 'the village ledger (bucket) lost fish');
  assert.strictEqual(F.fishCells.size, 0, 'the player ledger (cells) is not touched');
  //   빠진 재고 = 낚은 마리의 kg ÷ KG_PER_STOCK(몸과 같은 환산)
  assert(st.fishN > 0);
});
check('batch day: no debt and nothing worth buying → every fisher rests from the first hour (rested person-days = roster) · nothing drawn', () => {
  const { w, v, vil } = fishFixture({ D: 2 });
  clearHappyGoods(w, v);
  const s0 = V.t1217Stat();
  const r = V._t1217Day(vil, 7);
  assert.strictEqual(r.got, 0); assert.strictEqual(F.fishBuckets.size, 0);
  near(v._t1217Rest, 3);
  const s1 = V.t1217Stat(); assert.strictEqual(s1.stopN - s0.stopN, 3); assert.strictEqual(s1.stopH - s0.stopH, 0);
});
const CPUE = 'batch day: a half-empty spot gives fewer fish in the hour than a full one (CPUE) and an empty spot stops the day';
check(CPUE, () => {
  //   두 사람 — 이 픽스처의 첫 사람(r 0)은 그 물가 그날의 종이 작아(한 시간 값 < 쉰 값) 첫 시간부터 쉰다 · 둘째가 낚는다
  const a = fishFixture({ debt: 3, fishers: 2 });
  const full = V._t1217FishDay(a.vil, 7);
  const b = fishFixture({ debt: 3, fishers: 2 });
  F.drawBucketFish(11, 10, 1, 144, Date.now(), V._t1217BucketK, null);   // 그 물(버킷 K 288)을 반 비운다
  near(F.bucketRatioAt(11, 10, Date.now(), null), 0.5, 1e-6);
  const half = V._t1217FishDay(b.vil, 7);
  assert(full.got > 0 && half.got > 0 && half.got < 0.75 * full.got, 'half ' + half.got + ' < 0.75 × full ' + full.got);   // 입질 빈도 ∝ 재고 — 거의 절반
  const c = fishFixture({ debt: 3, fishers: 2 });
  F.drawBucketFish(11, 10, 1, 288, Date.now(), V._t1217BucketK, null);      // 다 비웠다
  const s0 = V.t1217Stat(), empty = V._t1217FishDay(c.vil, 7), s1 = V.t1217Stat();
  assert.strictEqual(empty.got, 0); assert.strictEqual(s1.stopN - s0.stopN, 2); assert.strictEqual(s1.stopH - s0.stopH, 0);
});
check('rest goes to econ: _t1217Day writes the rested person-days the leisure base reads', () => {
  const { w, v, vil } = fishFixture({ D: 2, fishers: 2 });
  clearHappyGoods(w, v);
  V._t1217Day(vil, 7);
  near(v._t1217Rest, 2);
  const N = v.npcs.length; v._idleFrac = 0;
  near(E.t1217IdleFrac(v, N), 2 / N);
});
check('knob on: no demand gate, no village quota (the ledger counts but does not cap)', () => {
  const { v } = fishFixture({ D: 1 });
  assert.strictEqual(E.fishDemandLeft(v), Infinity);
  near(E.fishToGranary(v, 5), 5);
  const src = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  assert(src.includes('if (!(want>0) || (!_t1217On() && B.took+want>cap+1e-9)) return 0;'));
});
check('knob off (subprocess): demand gate and quota as before, no hour prices, no hour host', () => {
  const code = "process.env.ENABLE_VILLAGES='0';process.env.T312_FISH_ACT='1';const E=require('./sim/economy-sim'),E2=require('./sim/economy-sim-v2');" +
    "const w=E2.createWorldV2({seed:42,villageCount:1}),v=w.villages[0];E.bindProductionActs(w);v.storage={fish:0};v.treasury={};v._fishOutLast=1;v._t312InflowToday=0;w.t1217Hour=()=>5;" +
    "console.log(JSON.stringify([E.T1217_MARGIN,E.fishDemandLeft(v),E.fishToGranary(v,5),E2.t1217PricesOf(v)]));";
  const env = { ...process.env }; delete env.T1217_MARGIN;
  const r = spawnSync(process.execPath, ['-e', code], { cwd: ROOT, env, encoding: 'utf8' });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(lastJson(r), [false, 1, 1, null]);
});
check('body: the same hour predicate (stop at an empty spot), and a stopped body rests for the rest of that day', () => {
  const { v, vil } = fishFixture({ debt: 3 });
  const ws = vil._jobSites.fisher[0], npc = { pid: 'p1', x: ws.x, y: ws.y };
  assert.strictEqual(V._t1217BodyKeep(vil, npc, ws, 7), true);
  F.drawBucketFish(11, 10, 1, 288, Date.now(), V._t1217BucketK, null);
  assert.strictEqual(V._t1217BodyKeep(vil, npc, ws, 7), false);
  const pl = new Map([['p1', Object.assign(npc, { _t1217Stop: { day: 6, f: 0.35 } })]]);
  state.deps.players = pl; vil.npcPids = ['p1']; v.counts.fisher = 0;   // 일괄 없음 — 몸만
  V._t1217Day(vil, 7);
  near(v._t1217Rest, (0.7 - 0.35) / 0.7);
  const src = fs.readFileSync(path.join(ROOT, 'server/villages.js'), 'utf8');
  assert(src.includes("if (_t1217On() && npc._t1217Stop && npc._t1217Stop.day === day) { _lifeGoHome(npc, '휴식'); return true; }"), 'stopped body goes home');
});
const MOVE = 'site choice: fishers go where the fish are (best bite ratio among the shore sites) · an emptied water is left for one that still holds fish';
check(MOVE, () => {
  const { v, vil } = fishFixture({ debt: 3, fishers: 2 });
  //   둘째 물가 B(40, 10) — 던질 물(41, 10) = 버킷 (1, 0) · 물 = 셀 x 41 ~ 46
  const isW0 = state.deps.isWaterTileLocal;
  state.deps.isWaterTileLocal = (x, y) => { const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ); return isW0(x, y) || (cx >= 41 && cx <= 46 && cy >= 0 && cy <= 23); };
  vil._jobSites.fisher = [{ x: 10 * SZ + 16, y: 10 * SZ + 16 }, { x: 40 * SZ + 16, y: 10 * SZ + 16 }];
  F.drawBucketFish(11, 10, 1, 288, Date.now(), V._t1217BucketK, null);   // A 의 물(버킷 0,0)을 비웠다
  const r = V._t1217FishDay(vil, 7);
  assert(r.got > 0, 'fished at B ' + r.got);
  assert(F.fishBuckets.has('1_0') && F.fishBuckets.get('1_0').s < 1, 'B water lost fish');
  assert.strictEqual(F.fishBuckets.get('0_0').s, 0, 'A stays empty');
  //   고르기 그 자체 — A 가 해시 차례 첫째(h = 0)여도 입질 비율이 높은 B · 같으면 해시 차례 첫째(종전 자리)
  const now = Date.now(), sites = vil._jobSites.fisher, isW = state.deps.isWaterTileLocal;
  F.fishBuckets.clear(); vil._t1217Sites = null;
  F.drawBucketFish(11, 10, 1, 259, now, V._t1217BucketK, null);   // A 의 물 = 10 %
  assert.strictEqual(V._t1217Choose(vil, 7, sites, 0, F, isW, now, null).s, sites[1]);
  F.fishBuckets.clear();
  assert.strictEqual(V._t1217Choose(vil, 7, sites, 0, F, isW, now, null).s, sites[0]);
  assert.strictEqual(V._t1217Choose(vil, 7, sites, 1, F, isW, now, null).s, sites[1]);
});
check('village ledger (bucket): regrows by the same logistic, spreads only into water buckets, keeps the deficit total while spreading', () => {
  fishFixture();
  const t0 = 1e6, kFn = (bx, by) => (bx === 0 && by === 0 ? 288 : (bx === 1 && by === 0 ? 100 : 0));
  assert.strictEqual(F.drawBucketFish(11, 10, 1, 144, t0, kFn, null), 144);
  near(F.bucketRec(0, 0, t0, kFn).s, 0.5);
  //   재생 = 셀 장부와 같은 로지스틱(r = L_FISHR · 비율에) — 10날 뒤
  const day = F.DAY_MS, s10 = F.regen(0.5, 10, 1);
  near(F.bucketRec(0, 0, t0 + 10 * day, kFn).s, s10, 1e-12);
  //   번짐 — 물이 있는 이웃 버킷(1, 0)으로만 · 총 결손(물셀 단위)은 재생 몫만 준다
  const before = (1 - F.bucketRec(0, 0, t0 + 10 * day, kFn).s) * 288;
  const r = F.bucketDiffuse(0.5, kFn, null);
  const after = [...F.fishBuckets.entries()].reduce((s, [k, b]) => s + (1 - b.s) * b.K, 0);
  assert(F.fishBuckets.has('1_0'), 'spread into the water neighbour');
  assert(!F.fishBuckets.has('0_1') && !F.fishBuckets.has('-1_0'), 'not into land buckets');
  near(before - after, r.regen, 1e-6);
});
state.deps = oldDeps; state.dayMs = oldDay; state.zoneId = oldZone; F.fishCells.clear(); F.fishBuckets.clear();
if (!MUT) for (const [kind, name] of [['nochoose', MOVE], ['nodraw', DEBT], ['nostop', 'batch day: no debt and nothing worth buying → every fisher rests from the first hour (rested person-days = roster) · nothing drawn'], ['nocpue', CPUE], ['norest', 'rest goes to econ: _t1217Day writes the rested person-days the leisure base reads']])
  check('mutant ' + kind + ' is caught', () => { const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1217_MUTANT: kind }, encoding: 'utf8' }); assert.strictEqual(r.status, 1, r.stderr); assert(r.stdout.includes('FAIL ' + name), r.stdout.slice(-600)); });
console.log(`PASS ${pass} / FAIL ${fail}`); process.exitCode = fail ? 1 : 0;
