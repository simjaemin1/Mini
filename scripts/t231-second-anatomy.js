#!/usr/bin/env node
// === scripts/t231-second-anatomy.js — T231: 둘째 화물이 준 마을에서 무엇을 실어 냈나 =========
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
//
// T215 가 자인한 구멍을 가른다. 엔진의 `spareCap`(동시 교역 상한)은 `N`(인구)의 **곱**이라
//   `sim/economy-sim-v2.js:611`  `Math.max(1, Math.floor(N * (v._idleFrac||0) * TRADE_SPARE_UTIL))`
// "leg 이 줄어 인구가 줄었다" 와 "인구가 줄어 `spareCap` 이 줄어 leg 이 줄었다" 가 **같은 표**를 낸다.
//
// 그래서 **끔 팔의 그 마을·그 날 `spareCap` 궤적**을 도로 주입해 되먹임 고리를 끊는다(지어낸 수 0).
//   고정 팔에서도 **준 마을이 그대로 준다** → 원인은 leg(트립) 쪽이다.
//   고정 팔에서 **덜 준다**            → 인구 → `spareCap` → leg 되먹임이 끼어 있었다.
//
// 네 팔: off(기준·궤적 기록) · two(둘째 화물) · twofix(둘째+고정) · fix(고정만)
//   ⚠`fix` 는 **자기검증 팔**이다 — 끔 궤적을 끔에 도로 주입하는 것이므로 `off` 와 **같아야** 한다.
//     다르면 주입 기구가 틀린 것이고, 그러면 `twofix` 표도 못 믿는다.
//
// 세계 조립은 `t215-cargo-who.js`·`t17-metrics.js` 와 **같은 순서·같은 정본 함수**.
// 창구는 `world.onTradeLeg`(T206) 과 `world.spareCapFn`(T223) 둘뿐이다.
//
// 실행: node scripts/t223-sparecap-ab.js [일수=800] [시드=1020]
//   T223_ARM=off|two|twofix|fix   T223_TRACE=/tmp/sc-<시드>.json (off 가 쓰고 fix/twofix 가 읽는다)
//   T223_JSON=/tmp/x.json
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t215-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const LV = R('server/livelihood');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const CACHE = process.env.LAB_SEEDCACHE || '/tmp/t163-seeds.json';
let seeds = null;
if (fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  try { fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {}
}

const ARM = process.env.T231_ARM || 'two';
//   ★[T233] 팔 하나 추가 — `twogate` = 둘째 화물 + 첫째와 같은 관문(`world.cargoTwoGate`).
//   ★[T239] 팔 하나 더 — `twobest` = 둘째 + 관문 + **수익 최대 선택**.
if (!['off', 'two', 'twofix', 'twogate', 'twobest'].includes(ARM)) { console.error(`알 수 없는 팔: ${ARM}`); process.exit(2); }
const TRACE = process.env.T231_TRACE || `/tmp/t231-sc-${SEED}.json`;
const TWO = (ARM === 'two' || ARM === 'twofix' || ARM === 'twogate' || ARM === 'twobest');
const FIX = (ARM === 'twofix');
const GATE = (ARM === 'twogate' || ARM === 'twobest');
const BEST = (ARM === 'twobest');

//   ★흐름 품목 정본 — **재구현 0**. 이름만 정본에서 그대로 옮겨 적는다(값 계산은 안 한다).
//     `sim/economy-sim.js:181` COOK_SIDE_INGREDIENTS · `:3026` fuelFromWood(연료 목재) · `:2398` _stCost(석기 재료 돌)
const COOK_SIDE = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig'];
const FUEL = ['wood', 'twig', 'straw'];
const TOOLMAT = ['stone', 'wood'];
const CLASSOF = (r) => {
  const c = [];
  if (COOK_SIDE.includes(r)) c.push('부재료');
  if (FUEL.includes(r)) c.push('연료');
  if (TOOLMAT.includes(r)) c.push('도구재료');
  return c;
};

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
if (TWO) world.cargoTwo = true;
if (GATE) world.cargoTwoGate = true;
if (BEST) world.cargoTwoBest = true;
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.villages.forEach((v, i) => { v._t223i = i; v._t231i = i; });
world.day = 0;

const FL = LV.FLOOR.stone;
const rows = world.villages.map((v, i) => ({
  vid: i, name: v.name, floor: Math.abs((v.land.stone || 0) - FL) < 1e-9,
  pop0: v.npcs.length, popEnd: 0,
  legs: 0, twoLegs: 0, secondUnits: 0,
  first: {}, second: {},                       // 품목 → {n, units, gross}
  //   ⓒ 교환비 감사 — 첫째는 `:736` 관문을 통과한 값, 둘째는 관문이 **없다**.
  p1Gain: 0, p2Gain: 0, p2Loss: 0, p2LossUnits: 0, p2N: 0,
  //   ★[T233] 사후 관문 자 — 정본이 낸 `p2ProfitPerUnit`(첫째와 같은 함수)을 그대로 쓴다(사본 0).
  g1Fail: 0, g1FailUnits: 0, g2Fail: 0, g2FailUnits: 0, gateBlocked: 0, p2PU: 0,
  //   ★[T239] 선택 갈림 자 — 정본이 같은 판에서 낸 두 값(고른 것 / 최대였을 것)을 그대로 비교한다.
  selDiff: 0, selGain: 0, selChosen: 0, selBest: 0, diffTo: {},
  //   ★[T248] leg 감소의 자리 — **문 추가 0**. `spareCapFn`(T223 · 기록만 · null 반환)은 그 마을이
  //     그날 교역을 **시도한** village-day 마다 불리고, `onTradeLeg` 는 **실제로 선** 캐러밴마다 불린다.
  //     둘의 차가 "설 수 있었는데 안 선 자리" 다. 어느 쪽이 줄었나로 문턱/`spareCap` 이 갈린다.
  vDays: 0, capSum: 0, capMax: 0, candSum: 0, candN: 0, candMin: 1e9,
  //   ★[T271 관측 항] "떼이는 쪽인가 안 오는 쪽인가" 를 가르려면 **들어오는 것**도 세야 한다.
  //     T265 광산1 이 보인 것: 나간 게 없어도 **오는 캐러밴이 줄어** 죽을 수 있다.
  inLegs: 0, inRes: {}, inUnits: 0,
  //   ⓑ 흐름 품목
  flowUnits: { '부재료': 0, '연료': 0, '도구재료': 0 }, flowN: { '부재료': 0, '연료': 0, '도구재료': 0 },
  //   ⓐ 실린 뒤 며칠 만에 keep 아래로
  dropDays: [], dropN: 0, noDropN: 0,
  //   T200 부족 사건 자 (그 자 그대로)
  shortFruit: 0, shortTool: 0, shortFuel: 0, shortCookSide: 0, cookDays: 0,
  toolOut: 0, cookOut: 0,
}));
const byRes = (o, r) => (o[r] || (o[r] = { n: 0, units: 0, gross: 0 }));

//   실린 뒤 추적 — {vid, res, keep, day} 를 큐에 넣고 매일 곳간을 본다.
const watch = [];
//   ★[T271] 이름→행 지도 — 도착지(`to`)는 이름으로 오므로 한 번 만들어 둔다.
//     ⚠첫 판은 이 선언을 쓰는 줄보다 **아래**에 두어 `ReferenceError` 로 45판이 통째로 죽었다.
const _byName = new Map(rows.map((r) => [r.name, r]));
world.onTradeLeg = (o) => {
  //   ★[T271] 도착지 쪽도 적는다 — `to` 는 마을 이름이라 이름→행 지도를 한 번 만든다.
  const rin = _byName.get(o.to);
  if (rin) {
    rin.inLegs++; rin.inUnits += (o.units || 0) + (o.secondUnits || 0);
    rin.inRes[o.res] = (rin.inRes[o.res] || 0) + o.units;
    if (o.second) rin.inRes[o.second] = (rin.inRes[o.second] || 0) + o.secondUnits;
  }
  const r = rows[o.vid]; if (!r) return;
  r.legs++;
  //   ★[T248] 이 leg 이 섰을 때 후보가 몇 개였나 — 문턱 쪽이 좁아졌는지 본다.
  if (o.cands) { r.candSum += o.cands.length; r.candN++; if (o.cands.length < r.candMin) r.candMin = o.cands.length; }
  const f = byRes(r.first, o.res); f.n++; f.units += o.units; f.gross += o.units * (o.pFrom || 0);
  r.p1Gain += (o.profit || 0);
  if (o.second && o.secondUnits > 0) {
    r.twoLegs++; r.secondUnits += o.secondUnits; r.p2N++;
    const s = byRes(r.second, o.second); s.n++; s.units += o.secondUnits; s.gross += o.secondUnits * (o.p2From || 0);
    //   ⓒ **둘째의 관문 없는 이익** — 첫째와 같은 식(`:733-735`)을 **밖에서 재계산하지 않고**,
    //     훅이 내보낸 그 leg 의 값·운반비를 그대로 써서 단위당을 본다.
    //   ★[T233] **정본이 낸 수를 그대로 쓴다** — `p2ProfitPerUnit` 은 첫째가 부르는 `_legProfitPerUnit`
    //     이 낸 값이다(운반비·TAU·약탈 기대손실 전부 반영). 밖에서 다시 계산하지 않는다.
    const pu2 = o.p2ProfitPerUnit || 0;
    r.p2PU += pu2 * o.secondUnits;
    r.gateBlocked += (o.gateBlocked || 0);
    r.selChosen += (o.p2Total || 0); r.selBest += (o.p2BestTotal || 0);
    if (o.p2Best && o.p2Best !== o.second) {
      r.selDiff++; r.selGain += (o.p2BestTotal || 0) - (o.p2Total || 0);
      r.diffTo[o.p2Best] = (r.diffTo[o.p2Best] || 0) + 1;
    }
    //   관문 ①(수익성): 첫째의 `if (totalProfit <= 0) continue;` 와 같은 판정
    if (!(pu2 * o.secondUnits > 0)) { r.g1Fail++; r.g1FailUnits += o.secondUnits; }
    //   관문 ②(기회비용): 첫째의 `if (best.profit <= lp.mv * tripDays * (1 - 0.5*slack)) break;`
    //     ⚠둘째에 이걸 그대로 적용하는 건 **논리가 다르다**(노동은 첫째가 이미 치렀다) — 크기만 잰다.
    if (!(pu2 * o.secondUnits > (o.mv || 0) * (o.tripDays || 0) * (1 - 0.5 * (o.slack || 0)))) { r.g2Fail++; r.g2FailUnits += o.secondUnits; }
    if (pu2 >= 0) r.p2Gain += pu2 * o.secondUnits;
    else { r.p2Loss += -pu2 * o.secondUnits; r.p2LossUnits += o.secondUnits; }
    for (const c of CLASSOF(o.second)) { r.flowUnits[c] += o.secondUnits; r.flowN[c]++; }
    watch.push({ vid: o.vid, res: o.second, day: o.day });
  }
};

//   ★[T265 관측 항] 마을 하나를 **날마다** 본다 — `T265_WATCH=<마을이름>`.
//     T256 이 낸 유일한 유의 악화(시드 2 광산1 이 끔 71명 → twobest 0)의 경로를 보려는 자리다.
//     env 가 없으면 한 줄도 안 돈다(무변). 값 판정은 안 한다 — 날짜별 한 줄씩 적기만 한다.
const WATCH = process.env.T265_WATCH || '';
const watchLog = [];
const watchLeg = [];
if (WATCH) {
  const _prev = world.onTradeLeg;
  world.onTradeLeg = (o) => {
    if (_prev) _prev(o);
    //   이 마을에서 **나간** leg 과 이 마을로 **들어온** leg 을 둘 다 적는다(방향이 물음이다).
    if (o.from === WATCH) watchLeg.push({ d: o.day, dir: 'out', to: o.to, r1: o.res, n1: +o.units.toFixed(1), r2: o.second, n2: +(o.secondUnits || 0).toFixed(1) });
    else if (o.to === WATCH) watchLeg.push({ d: o.day, dir: 'in', from: o.from, r1: o.res, n1: +o.units.toFixed(1), r2: o.second, n2: +(o.secondUnits || 0).toFixed(1) });
  };
}

//   ★[T248] `spareCap` 창구 — **기록만** 한다(`null` 반환 = 세계 무변 · T223 하네스 ㉓ 가 증명).
//     이 훅은 그 마을이 그날 교역을 **시도한** village-day 마다 불리고, `onTradeLeg` 는 **실제로 선**
//     캐러밴마다 불린다. `capSum`(설 수 있던 자리) 과 `legs`(실제로 선 것)의 차가 "안 선 자리" 다.
//     `capSum` 이 줄면 `spareCap`(인구 함수) 탓이고, `capSum` 은 그대론데 `legs` 만 줄면 문턱 탓이다.
world.spareCapFn = (v, day, cur) => {
  const r = rows[v._t231i];
  if (r) { r.vDays++; r.capSum += cur; if (cur > r.capMax) r.capMax = cur; }
  return null;
};

//   부족 사건 자 — T200 이 쓴 그 신호(곳간 문턱 아래 일수). **새 판정식 0**.
const SHORT = { fruit: 0.5, tool: 0.05 };
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world, d);
  if (WATCH) {
    const v = world.villages.find((x) => x.name === WATCH);
    if (v) {
      const st = v.storage || {};
      watchLog.push({ d, pop: v.npcs.length,
        food: +(st.food || 0).toFixed(1), fish: +(st.fish || 0).toFixed(1), meat: +(st.meat || 0).toFixed(1),
        foodEq: +((econ.totalFoodEquivalent ? econ.totalFoodEquivalent(v) : 0) || 0).toFixed(1),
        tool: +(st.tool || 0).toFixed(2), wood: +(st.wood || 0).toFixed(1), stone: +(st.stone || 0).toFixed(1),
        ore: +(st.ore || 0).toFixed(1),
        ema: +(((v.surplusEMA || {}).food) || 0).toFixed(2),
        fuel: v._fuelCov != null ? +v._fuelCov.toFixed(2) : null,
        house: v.houses != null ? v.houses : null });
    }
  }
  for (let i = 0; i < world.villages.length; i++) {
    const v = world.villages[i], r = rows[i], st = v.storage || {};
    if ((st.fruit || 0) < SHORT.fruit) r.shortFruit++;
    if ((st.tool || 0) < SHORT.tool) r.shortTool++;
    if ((v._fuelCov != null) && v._fuelCov < 1) r.shortFuel++;
    //   조리 부재료 — 정본 `:2354` 와 같은 문턱(0.5)으로 "쓸 수 있는 부재료 종 수" 를 센다
    const avail = COOK_SIDE.filter((x) => (st[x] || 0) >= 0.5).length;
    if (avail === 0) r.shortCookSide++;
    r.cookDays++;
    r.toolOut += (v.dailyProductionBuf && v.dailyProductionBuf.tool) || 0;
    r.cookOut += (v.dailyProductionBuf && v.dailyProductionBuf.cooked_food) || 0;
  }
  //   ⓐ 실린 뒤 며칠 만에 `keep` 아래로 — `keep` 은 정본 식(`:649·:657`)을 **그 자리에서 읽는다**
  for (let k = watch.length - 1; k >= 0; k--) {
    const w = watch[k];
    const v = world.villages[w.vid], r = rows[w.vid];
    const N = v.npcs.length;
    const FOODR = { food: 1, fish: 1, meat: 1, cooked_food: 1 };
    const target = Math.max((econV2.SUBSISTENCE_PER_NPC[w.res] || 0) * N * 30, N * 0.8);   // ★정본 상수를 그대로 읽는다(사본 0 · :649 와 같은 식)
    const keep = FOODR[w.res] ? target * 1.2 : target * 0.5;
    if ((v.storage[w.res] || 0) < keep) { r.dropDays.push(d - w.day); r.dropN++; watch.splice(k, 1); }
    else if (d - w.day >= 60) { r.noDropN++; watch.splice(k, 1); }   // 60일 안 안 내려가면 "안 내려갔다"
  }
}
for (let i = 0; i < world.villages.length; i++) {
  const v = world.villages[i], r = rows[i];
  r.popEnd = v.npcs.length;
  //   ★[T271 관측 항] 생선 — 어촌이 지는 기전을 보려면 재고와 **그림자가격**이 필요하다.
  //     가격은 정본 함수를 그대로 부른다(사본 0 — `computeShadowPrices` 는 v2 가 내보낸다).
  const st = v.storage || {};
  r.fishStock = +(st.fish || 0).toFixed(1);
  r.salmonStock = +(st.salmon || 0).toFixed(1);
  r.foodStock2 = +(st.food || 0).toFixed(1);
  r.foodEq2 = +((econ.totalFoodEquivalent ? econ.totalFoodEquivalent(v) : 0) || 0).toFixed(1);
  try { const _p = econV2.computeShadowPrices(v); r.fishPrice = +(_p.fish || 0).toFixed(3); r.foodPrice = +(_p.food || 0).toFixed(3); }
  catch (e) { r.fishPrice = null; r.foodPrice = null; }
}

const totalPop = rows.reduce((a, r) => a + r.popEnd, 0);
console.log(`\n=== T231 [${ARM}] — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} ===`);
console.log(`  인구 합 **${totalPop}** · leg ${rows.reduce((a, r) => a + r.legs, 0)} · 둘째 적재 ${rows.reduce((a, r) => a + r.secondUnits, 0).toFixed(0)} 단위`);
if (WATCH && process.env.T265_WATCH_JSON) {
  fs.writeFileSync(process.env.T265_WATCH_JSON, JSON.stringify({ seed: SEED, arm: ARM, village: WATCH, log: watchLog, legs: watchLeg }));
  console.log(`  WATCH JSON: ${process.env.T265_WATCH_JSON} (${watchLog.length}일 · leg ${watchLeg.length}건)`);
}
if (process.env.T231_JSON) {
  fs.writeFileSync(process.env.T231_JSON, JSON.stringify({ seed: SEED, arm: ARM, totalPop, rows }, null, 1));
  console.log(`  JSON: ${process.env.T231_JSON}`);
}
