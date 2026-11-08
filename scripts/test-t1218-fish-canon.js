#!/usr/bin/env node
// @regress
'use strict';
// [T1218] 어장 고증 — 한 칸에 사는 물고기 kg(민물 · 바다) · 해마다 돌아오는 몫(r) · 마을 어부 한 시간(kg) 을 한 정본으로(손잡이 `T1218_FISH_CANON` · 끔 기본):
//   끔 = 종전 글자(1.2 kg · r 0.02/날 · econ 2.5 단위 · 마을 어부 입질 = 플레이어 손맛) · 켬 = 출처 범위의 위 끝 넷 × 칸 넓이(T1215) × 열량(kcal.js) × 달력 한 해 ·
//   셀 · 버킷 재생이 같은 r · 결손 → econ 이 같은 환산 · 플레이어 · 몸 · 일괄이 그 물 종류의 kg 로 재고를 뺀다 · 마을 어부 입질은 고증 한 시간 kg(가장 좋은 자리 · 가득 찬 물 = 위 끝 · 그 위 0) ·
//   한 시간 값 = 기댓값 마리(기다림이 시간을 넘어 이어진다 — 한 시간에 한 마리를 못 채우는 큰 고기도 낚인다) · T1205 사치품 항이 바꿈 후보(λ)에 든다 · 변이 셋.
const assert = require('assert'), fs = require('fs'), path = require('path'), Module = require('module'), { spawnSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
function check(name, fn) { try { fn(); pass++; console.log('PASS ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' | ') : e)); } }
const near = (a, b, eps = 1e-9) => assert(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), a + ' != ' + b);
const MUT = process.env.T1218_MUTANT || '', CHILD = process.env.T1218_CHILD === '1';
const lastJson = (r) => JSON.parse(r.stdout.trim().split('\n').at(-1));

if (!CHILD) {
  // ── 손잡이 기본값 · 끔 = 종전 글자 ──
  for (const val of [undefined, '', '0', '1', 'yes']) check('default ' + String(val), () => {
    const env = { ...process.env, ENABLE_VILLAGES: '0' }; delete env.T1218_FISH_CANON; if (val !== undefined) env.T1218_FISH_CANON = val;
    const r = spawnSync(process.execPath, ['-e', "const F=require('./server/fishing');const S=require('./server/sustain');console.log(JSON.stringify([F.T1218_FISH_CANON,S.T1218_FISH_CANON,!!F.t1218Canon()]));"], { cwd: ROOT, env, encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.deepStrictEqual(lastJson(r), [val === '1', val === '1', val === '1']);
  });
  delete process.env.T1218_FISH_CANON;
  process.env.ENABLE_VILLAGES = '0';
  const F = require('../server/fishing'), S = require('../server/sustain');
  check('off = the old letters: r = L_FISHR · 1 stock = KG_PER_STOCK kg = FISH_ECON_PER_STOCK units (kind ignored) · village wait = player wait', () => {
    assert.strictEqual(F.fishR(), S.L_FISHR);
    assert.strictEqual(F.kgPerStock('sea'), F.CFG.KG_PER_STOCK); assert.strictEqual(F.kgPerStock('river'), F.CFG.KG_PER_STOCK);
    assert.strictEqual(F.econPerStock('sea'), S.FISH_ECON_PER_STOCK);
    assert.strictEqual(F.stockToEcon(3, 'sea'), 3 * (S.L_FISHR / 4) * S.FISH_ECON_PER_STOCK);
    const sp = { water: true, kind: 'river', seam01: 0.4, conflu: 0, depth01: 0.2 };
    for (const s01 of [1, 0.5, 0.1]) assert.strictEqual(F.villageWaitMs(sp, s01, 2.5, 60000), F.expectedWaitMs(sp, s01));
    near(F.regen(0.5, 10, 1), 1 / (1 + Math.exp(-S.L_FISHR * 10)));
    const scan = S.scanLabor({ isWater: (x, y) => x > 0, isRock: () => false, isForest: () => false, isSea: () => true }, 0, 0);
    assert(!('sea' in scan), 'no sea count when off');
  });
  // ── 켬(자식 프로세스 — 손잡이는 모듈을 읽을 때 정해진다) ──
  const r = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1218_CHILD: '1', T1218_FISH_CANON: '1', T312_FISH_ACT: '1', T1217_MARGIN: '1', ENABLE_VILLAGES: '0' }, encoding: 'utf8' });
  for (const line of r.stdout.split('\n')) { if (line.startsWith('PASS ')) { pass++; console.log(line); } else if (line.startsWith('FAIL ')) { fail++; console.log(line); } }
  if (r.status !== 0 && !/FAIL /.test(r.stdout)) { fail++; console.log('FAIL canon child: ' + (r.stderr || '').slice(-800)); }
  if (!MUT) for (const [kind, name] of [['nocarry', CARRY_NAME()], ['nokind', KIND_NAME()], ['nocap', CAP_NAME()]]) check('mutant ' + kind + ' is caught', () => {
    const q = spawnSync(process.execPath, [__filename], { cwd: ROOT, env: { ...process.env, T1218_MUTANT: kind }, encoding: 'utf8' });
    assert.strictEqual(q.status, 1, q.stderr); assert(q.stdout.includes('FAIL ' + name), q.stdout.slice(-600));
  });
  console.log(`PASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}
function CARRY_NAME() { return 'batch day (canon): a carp heavier than an hour of catch is still landed — the wait carries over the hour and the hour is worth its expected fish'; }
function KIND_NAME() { return 'one canon: the same fish takes 26 ÷ 7.55 fewer stock from the sea than from fresh water (player · body · batch read the water kind)'; }
function CAP_NAME() { return 'village bite: the best spot in full water gives exactly the source top (7.0 kg/h) · a plain spot 1/(1 + SEAM_W) of it · half water half · never above'; }

// ═══ 켬 자식 ═══
if (MUT) {
  const old = Module._extensions['.js'];
  Module._extensions['.js'] = function (m, file) {
    const swap = (src, a, b) => { assert(src.includes(a), 'mutant needle ' + MUT); return src.replace(a, b); };
    if (file === path.join(ROOT, 'server/villages.js')) {
      let src = fs.readFileSync(file, 'utf8');
      if (MUT === 'nocarry') src = swap(src, '      if (!C18 && p.t < h0) p.t = h0;', '      if (p.t < h0) p.t = h0;');
      if (MUT === 'nokind') src = swap(src, '  return F.kgPerStock(sp && sp.kind);\n}', "  return F.kgPerStock('fresh');\n}");
      return m._compile(src, file);
    }
    if (file === path.join(ROOT, 'server/fishing.js') && MUT === 'nocap') {
      const src = swap(fs.readFileSync(file, 'utf8'), 'return kgF / c.kgHour * hourMs * (1 + CFG.SEAM_W) / _biteRate(spotScore(sp), stock01);', 'return kgF / c.kgHour * hourMs / _biteRate(spotScore(sp), stock01);');
      return m._compile(src, file);
    }
    return old(m, file);
  };
}
const F = require('../server/fishing'), S = require('../server/sustain'), Kc = require('../server/kcal'), Cal = require('../server/calendar'), Crops = require('../server/crops');
check('canon derived once from the sources: cell kg = kg/ha × cell m² (T1215) ÷ 10,000 · econ = kg × fish kcal ÷ day kcal · r(day) = 0.8 ÷ mean calendar year', () => {
  const c = F.t1218Canon(); assert(c, 'canon on');
  assert.strictEqual(c.cellM2, Crops.FIELD_CELL_M2); assert.strictEqual(c.cellM2, 250);
  assert.deepStrictEqual(F.T1218_SRC, { KG_HA_FRESH: 302, KG_HA_SEA: 1040, R_YEAR: 0.8, KG_HOUR: 7.0 });
  near(c.kgFresh, 302 * 250 / 10000); near(c.kgSea, 1040 * 250 / 10000);
  near(c.econFresh, c.kgFresh * Kc.kcalPerKg('fish') / Kc.DAY_KCAL); near(c.econSea, c.kgSea * Kc.kcalPerKg('fish') / Kc.DAY_KCAL);
  let yd = 0; for (let y = 1; y <= 400; y++) yd += Cal.yearLen(y);
  near(c.yearDays, 365.2425); near(c.rDay, 0.8 / (yd / 400));
  //   한 정본 — 낚시 장부(kg/재고)와 econ(단위/재고)이 같은 kg 에서 나온다(종전 1.2 kg ↔ 2.5 단위 ≈ 12.4 kg 의 10배 어긋남이 없다)
  near(F.econPerStock('sea') / F.kgPerStock('sea'), Kc.kcalPerKg('fish') / Kc.DAY_KCAL); near(F.econPerStock('river') / F.kgPerStock('river'), Kc.kcalPerKg('fish') / Kc.DAY_KCAL);
});
check('regen (cells and village buckets) and deficit → econ use the canon r · a year from half full = logistic e^(−0.8)', () => {
  near(F.fishR(), F.t1218Canon().rDay);
  near(F.regen(0.5, 365.2425, 1), 1 / (1 + Math.exp(-0.8)), 1e-12);
  near(F.stockToEcon(2, 'sea'), 2 * (F.fishR() / 4) * F.econPerStock('sea'));
  F.fishBuckets.clear();
  const t0 = 1e9; F.drawBucketFish(1, 1, 1, 50, t0, () => 100, null);   // 버킷 K 100 → 비율 0.5
  near(F.bucketRec(0, 0, t0, () => 100).s, 0.5);
  near(F.bucketRec(0, 0, t0 + 365.2425 * F.DAY_MS, () => 100).s, 1 / (1 + Math.exp(-0.8)), 1e-9);
  F.fishBuckets.clear();
});
check(CAP_NAME(), () => {
  const H = 60000, best = { water: true, kind: 'river', seam01: 1, conflu: 1, depth01: 0 }, plain = { water: true, kind: 'river', seam01: 0, conflu: 0, depth01: 0 };
  const kgh = (sp, s01, kg) => kg / (F.villageWaitMs(sp, s01, kg, H) / H);
  near(kgh(best, 1, 2.5), 7.0); near(kgh(best, 1, 0.3), 7.0);                  // kg 당 시간이 같다(큰 고기는 오래 기다린다)
  near(kgh(plain, 1, 2.5), 7.0 / (1 + F.CFG.SEAM_W));
  near(kgh(plain, 0.5, 2.5), 7.0 / (1 + F.CFG.SEAM_W) / 2);                   // CPUE ∝ 재고
  for (const s of [0, 0.3, 0.7, 1]) for (const c of [0, 1]) for (const s01 of [0.2, 0.6, 1]) assert(kgh({ water: true, kind: 'sea', seam01: s, conflu: c, depth01: 0 }, s01, 1) <= 7.0 + 1e-9);
});
check('sustain (econ cap) under canon: every water cell counted (not the 1/4 sample) · sea cells apart · MSY = Σ cells × r/4 × that water\'s units', () => {
  const pred = { isWater: (x, y) => x >= 0 && x < 40 && y >= 0 && y < 10, isSea: (x, y) => x >= 30, isRock: () => false, isForest: () => false };
  const sc = S.scanLabor(pred, 0, 0);
  assert.strictEqual(sc.water, 400); assert.strictEqual(sc.sea, 100);
  assert.deepStrictEqual(S.fishWaterOf(0, 0), { water: 400, sea: 100 });
  const out = S.sustainOf(sc, 1);
  near(out.fishSustain, +((300 * F.econPerStock('fresh') + 100 * F.econPerStock('sea')) * (F.fishR() / 4)).toFixed(2), 1e-6);
});
// ── 마을 · 일괄(T1217 픽스처 꼴 · 켬) ──
process.env.ENABLE_VILLAGES = '0';
const E = require('../sim/economy-sim'), E2 = require('../sim/economy-sim-v2');
const V = require('../server/villages'), state = V.__p3Bind({}).state;
const SZ = 32, RIVER = { water: true, kind: 'river', u: 0.5, depth01: 0, flow01: 0.5, seam01: 0, conflu: 0, halfWidth: 64 }, SEA = Object.assign({}, RIVER, { kind: 'sea' });
function world1() { const w = E2.createWorldV2({ seed: 42, villageCount: 1 }), v = w.villages[0]; E.bindProductionActs(w); return { w, v }; }
function fixture(spot, fishers, zone) {
  const { w, v } = world1();
  v.storage = { fish: 0 }; v.treasury = {}; v.counts = { fisher: fishers };
  v._fishOutLast = 2; v._t312Cells = 1; v._t312InflowToday = 0;
  for (const p of v.npcs) p._fd = 0;
  v.npcs[0]._fd = 3;   // 식량 빚 — 한 단위 값 = 먹는 값(크다)
  const isW = (x, y) => { const cx = Math.floor(x / SZ), cy = Math.floor(y / SZ); return cx >= 11 && cx <= 22 && cy >= 0 && cy <= 23; };
  const vil = { name: '어촌고증', ccx: 10, ccy: 14, econ: v, npcPids: [], _jobSites: { day: 7, tmul: 1, fisher: [{ x: 10 * SZ + 16, y: 10 * SZ + 16 }], lumberjack: [], miner: [], forager: [], hunter: [] } };
  state.deps = { moveSpeed: 64, dayPhaseRatio: 0.7, players: new Map(), isWaterTileLocal: isW, t312FishSpotAt: () => spot };
  state.dayMs = 250; state.zoneId = zone || 'hanbando';   // 존이 바뀌면 칸 자리 기억(T677)이 비워진다 — 같은 칸을 다른 물 종류로 다시 묻는 하네스만
  F.fishCells.clear(); F.fishBuckets.clear();
  return { w, v, vil };
}
//   그날 그 물가의 종을 잉어(2.5 kg)로 — 민물 표가 사람 해시로 고르는 종을 하네스가 정한다(이 프로세스만)
const FF = require('../server/freshfish'), SF = require('../server/seafish'), _pick = FF.pick, _spick = SF.pick;
const CARP = FF.SPECIES.find((x) => x.id === 'carp');
check(CARRY_NAME(), () => {
  FF.pick = () => CARP;
  try {
    const { vil } = fixture(RIVER, 1);
    F.drawBucketFish(11, 10, 1, 144, Date.now(), V._t1217BucketK, null);   // 그 물(버킷 K 288)을 반 비운다 → 보통 자리 한 시간 7.0/1.9/2 ≈ 1.84 kg < 잉어 2.5 kg
    const kg1h = 7.0 / (1 + F.CFG.SEAM_W) * F.bucketRatioAt(11, 10, Date.now(), null);
    assert(kg1h < 2.5, 'an hour gives less than one carp: ' + kg1h);
    const s0 = V.t1217Stat(), r = V._t1217FishDay(vil, 7), s1 = V.t1217Stat();
    assert(r && r.got > 0, 'landed: ' + (r && r.got));
    const n = s1.fishN - s0.fishN, { H } = V._t1217Clock();
    assert(n >= Math.floor(0.8 * H * kg1h / 2.5), 'about a day of carp: ' + n + ' (H ' + H + ')');
    assert(n <= Math.ceil(H * kg1h / 2.5) + 1, 'not more than the source rate: ' + n);
  } finally { FF.pick = _pick; }
});
check(KIND_NAME(), () => {
  FF.pick = () => CARP; SF.pick = () => CARP;
  try {
    const dRiver = (() => { fixture(RIVER, 1, 't1218-river'); return V._t1218Kps(F, 11, 10); })();
    const dSea = (() => { fixture(SEA, 1, 't1218-sea'); return V._t1218Kps(F, 11, 10); })();
    near(dRiver, F.t1218Canon().kgFresh); near(dSea, F.t1218Canon().kgSea);
    //   일괄이 실제로 그 kg 로 뺀다 — 같은 날 같은 사람 같은 잉어 한 마리가 버킷에서 빼는 재고 비
    const one = (spot) => { const { vil } = fixture(spot, 1, spot === SEA ? 't1218-sea2' : 't1218-river2'); const s0 = V.t1217Stat(); V._t1217FishDay(vil, 7); const n = V.t1217Stat().fishN - s0.fishN; const b = F.fishBuckets.get('0_0'); return { n, lost: b ? (1 - b.s) * b.K : 0 }; };
    const a = one(RIVER), b = one(SEA);
    assert(a.n > 0 && b.n > 0, 'both fished: ' + a.n + ' · ' + b.n);
    near(a.lost / a.n, 2.5 / F.t1218Canon().kgFresh, 1e-9); near(b.lost / b.n, 2.5 / F.t1218Canon().kgSea, 1e-9);
  } finally { FF.pick = _pick; SF.pick = _spick; }
});
check('body cast (canon): the bite wait is the canon expectation × the same memoryless spread (deterministic per person · day · cast)', () => {
  fixture(RIVER, 1);
  const H = V._t1217Clock().hourMs, ew = F.villageWaitMs(RIVER, 0.5, 2.5, H);
  const a = V._t1218BodyWait(F, RIVER, 0.5, 2.5, 123, 4, 7), b = V._t1218BodyWait(F, RIVER, 0.5, 2.5, 123, 4, 7), c = V._t1218BodyWait(F, RIVER, 0.5, 2.5, 123, 5, 7);
  assert.strictEqual(a, b); assert(a !== c);
  let sum = 0; const N = 4000; for (let i = 0; i < N; i++) sum += V._t1218BodyWait(F, RIVER, 0.5, 2.5, 777, i, 9);
  assert(Math.abs(sum / N / ew - 1) < 0.06, 'mean ≈ expectation: ' + (sum / N / ew));
});
check('T1205 luxury in the swap value (λ): a prestige good counts luxW × prestige ÷ (2N) while the village prestige is under 1 · none at 1 · happiness-only goods unchanged', () => {
  const { v } = world1(), N = v.npcs.length;
  const RES = require('../server/specialty').RESOURCES;
  const jadeC = (RES && RES.jade && RES.jade.contributes) || { prestige: 1.2 };   // econ 이 읽는 그 표(`_getSpecialty` · 없으면 LEGACY 옥)
  v.storage = {}; v.lastStats = Object.assign({}, v.lastStats || {}, { prestige: 0.3 });
  const mu = E.t1217HappyMu(v, 'jade', N), luxW = 0.15;
  near(mu, ((jadeC.happiness || 0) + luxW * jadeC.prestige) / (2 * N), 1e-9);
  v.lastStats.prestige = 1; near(E.t1217HappyMu(v, 'jade', N), (jadeC.happiness || 0) / (2 * N), 1e-9);
  v.lastStats.prestige = 0.3; v.storage.jade = 2 * N + 1; assert.strictEqual(E.t1217HappyMu(v, 'jade', N), 0);
  v.storage = {}; assert.strictEqual(E.t1217HappyMu(v, 'honey', N) > 0, true);
});
console.log(`PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
