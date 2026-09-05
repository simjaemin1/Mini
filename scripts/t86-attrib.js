#!/usr/bin/env node
// === scripts/t86-attrib.js — T86 귀속 계측기(읽기만) ============================
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 수치를 낸다.
// 재민 요구(2026-09-05): ① 농촌1 246→81 을 T60 §0-ⓔ' 문법으로 세 줄 귀속
//   (죽기 전날 dP 분해 · 곳간 구성 전/후 · 생선 유입이 끊겼는지)  ② 인구 −30% 넘는 마을 수 + 군수 변화
// 세계 조립은 scripts/t17-metrics.js 와 같은 순서·같은 정본 함수(사본 아님).
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t86-attrib-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || '/tmp/t86/attrib.json';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim'); const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout'); const Villages = R('server/villages');
const P = Villages.__labProbe; const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => { if (ZONE.isOcean) return true; if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
const hard = T.getZoneVillages(Z) || [];
const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
const seeds = [];
for (const hv of picked) {
  const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
  if (!c) continue;
  let layout;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;
const WATCH = '농촌1';
let prevWatch = null, minPop = { n: 1e9, day: -1 };
const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);
  const v = world.villages.find((x) => x.name === WATCH);
  if (v) {
    const n = (v.npcs || []).length;
    if (n < minPop.n) minPop = { n, day: world.day };
    // 인구가 줄어드는 날의 직전 상태를 계속 덮어 둔다(마지막 하락일의 어제가 남는다)
    if (prevWatch && n < prevWatch.N) prevWatch.dropAt = world.day;
    prevWatch = { N: n, day: world.day,
      dp: v._dpDebug ? JSON.parse(JSON.stringify(v._dpDebug)) : null,
      stats: v.lastStats ? { h: +v.lastStats.happiness.toFixed(3), he: +v.lastStats.health.toFixed(3), fg: v.lastStats.foodGroups } : null,
      foodEq: +econ.totalFoodEquivalent(v).toFixed(1),
      surF: v.surplusEMA ? +v.surplusEMA.food.toFixed(3) : null,
      dropAt: prevWatch && prevWatch.dropAt };
  }
}
console.log = _log;
const FOODK = ['food','cooked_food','fish','meat','fruit','vegetable','mushroom','wheat','rice','barley',
               'dried_fish','dried_fruit','smoked_meat','pickled_veg','salmon','shrimp','crab','oyster','seaweed','grape'];
const out = { seed: SEED, days: DAYS, mode: process.env.T86_DIET === '0' ? 'off' : ('on/' + (process.env.T86_WMODE || 'ii')), villages: {} };
for (const v of world.villages) {
  const st = {}; for (const k of FOODK) { const q = +(v.storage[k] || 0); if (q > 0.5) st[k] = +q.toFixed(1); }
  out.villages[v.name] = { pop: (v.npcs || []).length, fg: (v.lastStats && v.lastStats.foodGroups) || 0,
    happy: +(((v.lastStats && v.lastStats.happiness) || 0)).toFixed(3), storage: st,
    foodEq: +econ.totalFoodEquivalent(v).toFixed(1) };
}
// 캐러밴 원장 — 농촌1 로 **들어온** 것(도착지 기준) 품목별 합
const inflow = {}, outflow = {};
let nIn = 0, nOut = 0;
for (const t of (world.tradeLog || [])) {
  if (t.to === WATCH && t.sent && t.sent.res) { inflow[t.sent.res] = (inflow[t.sent.res] || 0) + (t.sent.amt || 0); nIn++; }
  if (t.from === WATCH && t.sent && t.sent.res) { outflow[t.sent.res] = (outflow[t.sent.res] || 0) + (t.sent.amt || 0); nOut++; }
  if (t.to === WATCH && t.bought && t.bought.res) { outflow['(되사옴)' + t.bought.res] = (outflow['(되사옴)' + t.bought.res] || 0) + (t.bought.amt || 0); }
}
out.watch = { name: WATCH, last: prevWatch, minPop, inflow, outflow, nIn, nOut, tradeLogN: (world.tradeLog || []).length };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
console.log('wrote', OUT, '· 마을', Object.keys(out.villages).length, '· 원장', out.watch.tradeLogN, '· 농촌1 유입건', nIn, '유출건', nOut);
