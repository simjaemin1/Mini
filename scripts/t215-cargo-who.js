#!/usr/bin/env node
// === scripts/t215-cargo-who.js — T215: 둘째 화물이 켜지면 누가 팔려 나가나 ==================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). **코드 0** — 읽기만 한다.
//
// T206 이 남긴 물음: 수레가 차면 교역량이 늘고, 교역이 늘면 **어떤 마을은 팔려 나간다**
//   (서버 시드 7 −8.5% · 랩 시드 42 −25.5%). 그게 누구인가가 #26 켜기 판정의 마지막 자료다.
//
// 세계 조립은 `cargo-diag.js`·`t17-metrics.js` 와 **같은 순서·같은 정본 함수**.
// 읽는 창구는 T206 이 뚫어 둔 **계측 전용 훅**(`world.onTradeLeg`) 하나뿐이다(새 창구 0).
//
// 실행: node scripts/t215-cargo-who.js [일수=800] [시드=1020]
//   T206_CARGO_TWO=1  둘째 화물 켬     T215_JSON=/tmp/x.json
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

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
R('server/trees').attachToWorld(world);
const TWO = process.env.T206_CARGO_TWO === '1';
if (TWO) world.cargoTwo = true;
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

const FL = LV.FLOOR.stone;
// 마을별 자 — 지도 성질은 **시딩 값 그대로**(계측이 아무것도 안 만든다)
const rows = world.villages.map((v, i) => ({
  vid: i, name: v.name, floor: Math.abs((v.land.stone || 0) - FL) < 1e-9,
  fert: v.land.fertility, water: v.land.water, wood: v.land.wood, stone: v.land.stone, game: v.land.game, ore: v.land.ore,
  pop0: v.npcs.length, popEnd: 0, popMax: 0,
  first: {}, second: {}, secondUnits: 0, legs: 0, twoLegs: 0,
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
const secondSum = rows.reduce((a, r) => a + r.secondUnits, 0);
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, x]) => `${k} ${x.toFixed(0)}`).join(' · ');

console.log(`\n=== T215 ${TWO ? '**둘째 화물 켬**' : '끔'} — 시드 ${SEED} · ${DAYS}일 · 마을 ${rows.length} ===`);
console.log(`  인구 합 **${totalPop}** · 출발 leg ${rows.reduce((a, r) => a + r.legs, 0)} · 둘째 실린 leg ${rows.reduce((a, r) => a + r.twoLegs, 0)} · **둘째 적재량 ${secondSum.toFixed(0)} 단위**`);
console.log(`  둘째 화물 품목(전체) — ${top(rows.reduce((acc, r) => { for (const k in r.second) acc[k] = (acc[k] || 0) + r.second[k]; return acc; }, {}), 12) || '없다'}`);
if (process.env.T215_JSON) {
  fs.writeFileSync(process.env.T215_JSON, JSON.stringify({ seed: SEED, two: TWO, totalPop, secondSum, rows }, null, 1));
  console.log(`  JSON: ${process.env.T215_JSON}`);
}
