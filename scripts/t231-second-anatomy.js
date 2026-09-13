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
world.villages.forEach((v, i) => { v._t231i = i; });
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
world.onTradeLeg = (o) => {
  const r = rows[o.vid]; if (!r) return;
  r.legs++;
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

//   부족 사건 자 — T200 이 쓴 그 신호(곳간 문턱 아래 일수). **새 판정식 0**.
const SHORT = { fruit: 0.5, tool: 0.05 };
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world, d);
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
for (let i = 0; i < world.villages.length; i++) rows[i].popEnd = world.villages[i].npcs.length;

const totalPop = rows.reduce((a, r) => a + r.popEnd, 0);
console.log(`\n=== T231 [${ARM}] — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} ===`);
console.log(`  인구 합 **${totalPop}** · leg ${rows.reduce((a, r) => a + r.legs, 0)} · 둘째 적재 ${rows.reduce((a, r) => a + r.secondUnits, 0).toFixed(0)} 단위`);
if (process.env.T231_JSON) {
  fs.writeFileSync(process.env.T231_JSON, JSON.stringify({ seed: SEED, arm: ARM, totalPop, rows }, null, 1));
  console.log(`  JSON: ${process.env.T231_JSON}`);
}
