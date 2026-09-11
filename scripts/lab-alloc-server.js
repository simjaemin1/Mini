#!/usr/bin/env node
// === scripts/lab-alloc-server.js — T164: 실현 배분 서버 A/B (51마을 · 800일) ==================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음).
// ⚠세계는 `scripts/t17-metrics.js` 와 **같은 문**으로 세운다(사본이 아니라 같은 절차 · 족보 130).
//   이 파일이 더 내는 것은 T164 가 물은 것들뿐이다:
//     여덟 수 + **K 축 분포**(자리/식량/연료 · `_kDbg`) + **직업 점유** + **MSY 최소**(`_forageScale`)
//
// 실행: node scripts/lab-alloc-server.js [일수=800] [시드=1020]
//   L_ALLOC_REAL=1 …   ← 실현 배분 팔   ·   (없음) ← 종전 팔
//   T164_JSON=/tmp/x.json  표를 JSON 으로도 남긴다
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t164-${process.pid}.db`;

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
const Events = R('server/events');
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
R('server/trees').attachToWorld(world);        // ★족보 130 — 서버가 여는 그 문을 계측기도 연다
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// 장부 — `t17-metrics.js` 와 같은 계약(정본 문턱 그대로 · cfg 사본 없음)
const L = Events.createLedger({ econV2, vidOf: (v, i) => i, depositMap: Villages.playerVillageDepositMap(), onEvent: () => {} });
L.prime(world);

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) { econV2.tickWorldV2(world); L.scanDay(world, world.day, {}); }
console.log = _log;

// ── 여덟 수 ──────────────────────────────────────────────────────────────────
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0;
for (const v of world.villages) {
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) * (v._toolQ != null ? v._toolQ : 1);
}
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const presStock = world.villages.reduce((a, v) => a + PRESERVED.reduce((b, r) => b + (v.storage[r] || 0), 0), 0);
const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
const S = L.stats;
const daysPer = 1 / Math.max(1e-9, S.emitted / Math.max(1, live * S.days));

// ── T164 가 더 묻는 것 ───────────────────────────────────────────────────────
const bind = { slot: 0, prod: 0, fuel: 0, none: 0 };
let Ksum = 0;
for (const v of world.villages) {
  const k = v._kDbg; if (!k) { bind.none++; continue; }
  const m = Math.min(k.slot, k.prod, k.fuel); Ksum += m;
  if (m === k.fuel) bind.fuel++; else if (m === k.prod) bind.prod++; else bind.slot++;
}
const jc = {}; let tot = 0;
for (const v of world.villages) for (const n of (v.npcs || [])) { jc[n.currentJob] = (jc[n.currentJob] || 0) + 1; tot++; }
const jobs = Object.entries(jc).sort((a, b) => b[1] - a[1]);
const topShare = tot ? jobs[0][1] / tot : 0;
const farmerShare = tot ? (jc.farmer || 0) / tot : 0;
const foragerShare = tot ? (jc.forager || 0) / tot : 0;
const fsArr = world.villages.map((v) => (v._forageScale != null ? v._forageScale : null)).filter((x) => x != null);
const msyMin = fsArr.length ? Math.min.apply(null, fsArr) : null;
const msyMean = fsArr.length ? fsArr.reduce((a, b) => a + b, 0) / fsArr.length : null;
const msyBite = fsArr.filter((x) => x < 0.999).length;
// ratio — 채집 식량환산이 전체 식량등가 재고에서 차지하는 몫(T151 ⓐ 문법)
const foodEq = world.villages.reduce((a, v) => a + econ.totalFoodEquivalent(v), 0);
const FF = econ.FORAGE_FOOD_FACTOR;
const forageEq = world.villages.reduce((a, v) => a + Object.keys(FF).reduce((b, r) => b + (v.storage[r] || 0) * FF[r], 0), 0);

const ARM = econ.allocRealOn() ? '실현' : '종전';
console.log(`\n=== T164 서버 A/B — 실지도 ${seeds.length}곳 · 시드 ${SEED} · ${DAYS}일 · 배분 **${ARM}**`
  + (econ.allocRealOn() ? ` (창 ×${econ.allocRealWin()})` : '') + ' ===');
console.log(`  여덟 수   인구 ${pop} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${expand}`);
console.log(`            게시 ${S.reqOpened} · 일/건 ${daysPer.toFixed(2)} · 도구Q ${toolQ.toFixed(1)} · 보존식 ${presStock.toFixed(1)}`);
console.log(`  K 축      자리 ${bind.slot} · 식량흐름 ${bind.prod} · 연료 ${bind.fuel}  (K 합 ${Ksum.toFixed(0)} · 인구있는 마을 ${live})`);
console.log(`  직업      최대 ${jobs[0] ? jobs[0][0] + ' ' + (topShare * 100).toFixed(1) + '%' : '—'} · 농부 ${(farmerShare * 100).toFixed(1)}% · 채집꾼 ${(foragerShare * 100).toFixed(1)}% · 가짓수 ${jobs.length}`);
console.log(`            ${jobs.slice(0, 8).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
console.log(`  MSY       평균 ${msyMean == null ? '—' : msyMean.toFixed(3)} · 최소 ${msyMin == null ? '—' : msyMin.toFixed(3)} · **무는 마을 ${msyBite}/${fsArr.length}**`);
console.log(`  ratio     식량등가 ${foodEq.toFixed(0)} · 그중 구황(채집) ${forageEq.toFixed(0)} = ${(forageEq / Math.max(1, foodEq) * 100).toFixed(1)}%`);

if (process.env.T164_JSON) {
  fs.writeFileSync(process.env.T164_JSON, JSON.stringify({ seed: SEED, days: DAYS, arm: ARM,
    pop, dead, ever, weapQ, expand, toolQ, presStock, posted: S.reqOpened, daysPer,
    bind, Ksum, live, jobs, topShare, farmerShare, foragerShare, msyMean, msyMin, msyBite, foodEq, forageEq }));
  console.log(`  JSON: ${process.env.T164_JSON}`);
}
