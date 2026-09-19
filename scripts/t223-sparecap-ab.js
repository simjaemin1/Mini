#!/usr/bin/env node
// === scripts/t223-sparecap-ab.js — T223: leg 의 인과 방향 (`spareCap` 고정 4팔) ============
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

const ARM = process.env.T223_ARM || 'off';
if (!['off', 'two', 'twofix', 'fix'].includes(ARM)) { console.error(`알 수 없는 팔: ${ARM}`); process.exit(2); }
const TRACE = process.env.T223_TRACE || `/tmp/t223-sc-${SEED}.json`;
const TWO = (ARM === 'two' || ARM === 'twofix');
const FIX = (ARM === 'fix' || ARM === 'twofix');

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
world.cargoTwo = !!TWO;   // ★[T299] 팔은 **명시**로 잡는다 — 기본이 하루 켬이었다가 끔으로 되돌았다(재민 09-19). 명시면 어느 쪽이든 안 흔들린다
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.villages.forEach((v, i) => { v._t223i = i; });
world.day = 0;

const FL = LV.FLOOR.stone;
const rows = world.villages.map((v, i) => ({
  vid: i, name: v.name, floor: Math.abs((v.land.stone || 0) - FL) < 1e-9,
  fert: v.land.fertility, water: v.land.water, wood: v.land.wood, stone: v.land.stone, game: v.land.game, ore: v.land.ore,
  pop0: v.npcs.length, popEnd: 0, popMax: 0,
  first: {}, second: {}, secondUnits: 0, legs: 0, twoLegs: 0,
  scDays: 0, scSum: 0, scMax: 0, scInj: 0, scMiss: 0,
}));
world.onTradeLeg = (o) => {
  const r = rows[o.vid]; if (!r) return;
  r.legs++;
  r.first[o.res] = (r.first[o.res] || 0) + o.units;
  if (o.second && o.secondUnits > 0) {
    r.twoLegs++; r.secondUnits += o.secondUnits;
    r.second[o.second] = (r.second[o.second] || 0) + o.secondUnits;
  }
};

// ── `spareCap` 창구 ────────────────────────────────────────────────────────────────────
//   off : 엔진이 계산한 값을 **기록만** 하고 `null` 을 돌려준다(되돌림 — 하네스 ㉓ 가 증명).
//   fix/twofix : 끔 팔 궤적을 주입한다. 그 마을·그 날 칸이 비면 `null`(부분 주입 금지).
let trace = null;
if (ARM === 'off') {
  trace = world.villages.map(() => []);
  world.spareCapFn = (v, day, cur) => {
    const i = v._t223i, r = rows[i];
    if (trace[i]) trace[i][day] = cur;
    if (r) { r.scDays++; r.scSum += cur; if (cur > r.scMax) r.scMax = cur; }
    return null;                       // ★기록만 — 세계를 안 건드린다
  };
} else if (FIX) {
  if (!fs.existsSync(TRACE)) { console.error(`끔 팔 궤적이 없다: ${TRACE} — 먼저 T223_ARM=off 로 돌려라`); process.exit(2); }
  const tr = JSON.parse(fs.readFileSync(TRACE, 'utf8'));
  if (!Array.isArray(tr) || tr.length !== world.villages.length) { console.error(`궤적 마을수 불일치: ${tr.length} ≠ ${world.villages.length}`); process.exit(2); }
  world.spareCapFn = (v, day, cur) => {
    const i = v._t223i, r = rows[i];
    const row = tr[i]; const x = row ? row[day] : undefined;
    if (r) { r.scDays++; r.scSum += cur; if (cur > r.scMax) r.scMax = cur; }
    if (typeof x === 'number' && isFinite(x) && x >= 1) { if (r) r.scInj++; return x; }
    if (r) r.scMiss++;
    return null;
  };
}

for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world, d);
  for (let i = 0; i < world.villages.length; i++) {
    const n = world.villages[i].npcs.length;
    if (n > rows[i].popMax) rows[i].popMax = n;
  }
}
for (let i = 0; i < world.villages.length; i++) {
  const v = world.villages[i], r = rows[i];
  r.popEnd = v.npcs.length;
  r.surplusFood = +((v.surplusEMA && v.surplusEMA.food) || 0).toFixed(3);
  r.foodEq = +((econ.totalFoodEquivalent ? econ.totalFoodEquivalent(v) : 0) || 0).toFixed(1);
  r.stoneStock = +(v.storage.stone || 0).toFixed(1);
  r.foodStock = +(v.storage.food || 0).toFixed(1);
}
const totalPop = rows.reduce((a, r) => a + r.popEnd, 0);
const totalLegs = rows.reduce((a, r) => a + r.legs, 0);
const secondSum = rows.reduce((a, r) => a + r.secondUnits, 0);
const injN = rows.reduce((a, r) => a + r.scInj, 0), missN = rows.reduce((a, r) => a + r.scMiss, 0);

if (ARM === 'off') {
  fs.writeFileSync(TRACE, JSON.stringify(trace));
  console.log(`  궤적 기록: ${TRACE} (${trace.length}마을 × ${DAYS}일)`);
}
const LAB = { off: '끔(기준·궤적 기록)', two: '둘째 화물 켬', twofix: '둘째+spareCap 고정', fix: 'spareCap 고정만(자기검증)' }[ARM];
console.log(`\n=== T223 [${ARM}] ${LAB} — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} ===`);
console.log(`  인구 합 **${totalPop}** · 출발 leg **${totalLegs}** · 둘째 적재량 ${secondSum.toFixed(0)} 단위`);
if (FIX) console.log(`  주입 ${injN.toLocaleString()}회 · 빈칸(엔진 제값) ${missN.toLocaleString()}회 · 주입률 ${(injN / (injN + missN) * 100).toFixed(1)}%`);
if (process.env.T223_JSON) {
  fs.writeFileSync(process.env.T223_JSON, JSON.stringify({ seed: SEED, arm: ARM, two: TWO, fix: FIX, totalPop, totalLegs, secondSum, injN, missN, rows }, null, 1));
  console.log(`  JSON: ${process.env.T223_JSON}`);
}
