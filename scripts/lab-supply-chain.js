// ═══════════════════════════════════════════════════════════════════════════
// T151 계측기 — **공급이 늘면 왜 사람이 주는가**: 고리를 하나씩 짚는다 (진단 전용)
//
//   러너 밖이다(`scripts/lab-*.js`). 세계 규칙 0 · 게임 행동 변경 0.
//   `t17-metrics.js` 와 **같은 문**으로 세계를 세운다(족보 130 — 계측기가 안 도는 층은 안 보인다).
//
//   실행:
//     node scripts/lab-supply-chain.js [일수=800] [시드=7]
//   두 팔을 한 판에서 돌린다(같은 자·같은 씨앗):
//     A = T135_TREES=0 (대체 없음)
//     B = T135_TREES=1 · T135_FOREST_MEAN=0 (품목 셋만 = 3판 분리표의 그 팔)
//   ⚠팔은 **자식 프로세스 + env** 로 가른다 — export 교체는 모듈 상수를 못 바꾼다(족보 128).
//     이 파일은 한 팔만 돈다. 두 팔을 도는 것은 `--pair` 가 한다.
//
//   찍는 것(10일마다 · 마을마다): 다섯 고리를 **순서대로** 한 줄에 놓는다.
//     ① 값   w(vegetable) · w(herb) · w(food) · 네 열매 값
//     ② 배분 counts.forager / farmer / lumberjack / 전체
//     ③ 산출 채집 일산출(품목별) · 그 **식량 환산**(FORAGE_FOOD_FACTOR)
//     ④ 식량 totalFoodEquivalent
//     ⑤ 인구 npcs.length
//   → 두 팔의 같은 줄을 빼면 **어느 고리에서 처음 갈리는지**가 표로 나온다.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t151-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 7;
const STEP = parseInt(process.env.T151_STEP, 10) || 10;
const OUT = process.env.T151_JSON || '';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Trees = R('server/trees');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;

// ── 세계 세우기 — `t17-metrics.js` 와 같은 절차(사본이 아니라 같은 문) ──────────
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
Trees.attachToWorld(world);                       // ★족보 130 — 계측기도 그 문을 연다
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ── 찍을 것 — 다섯 고리 ──────────────────────────────────────────────────────
// 값·배분·산출·식량·인구. 어느 것도 **새로 계산하지 않는다** — 엔진이 쥔 값을 읽기만 한다.
const PRICE_KEYS = ['vegetable', 'herb', 'food', 'stone', 'wood', 'acorn', 'chestnut', 'mulberry_fruit', 'grape', 'fruit'];
const JOB_KEYS = ['forager', 'farmer', 'lumberjack', 'fisher', 'hunter', 'mason', 'miner'];
const snaps = [];

function snapOne(v) {
  const tbl = (typeof world.priceFn === 'function') ? world.priceFn(v) : null;
  const price = {};
  for (const k of PRICE_KEYS) price[k] = tbl ? +(tbl[k] != null ? tbl[k] : 1).toFixed(4) : 1;
  const counts = {}; for (const n of (v.npcs || [])) counts[n.currentJob] = (counts[n.currentJob] || 0) + 1;
  const jobs = {}; for (const j of JOB_KEYS) jobs[j] = counts[j] || 0;
  // 산출 — 엔진이 그날 찍어 둔 일일 생산 버퍼(사본 아님)
  const prod = {};
  const dp = v.dailyProductionBuf || null;
  if (dp) for (const k in dp) if (dp[k] > 0) prod[k] = +dp[k].toFixed(4);
  return {
    name: v.name, pop: (v.npcs || []).length,
    food: +(econ.totalFoodEquivalent ? econ.totalFoodEquivalent(v) : 0).toFixed(1),
    jobs, price, prod,
    // 픽커가 **무엇을 골랐나** — 엔진이 이미 찍어 두는 진단 필드를 읽는다(배분식을 베끼지 않는다)
    pick: (v._dbgSwitch && v._dbgSwitch.need) || null,
    fscale: (v._forageScale != null) ? +v._forageScale.toFixed(4) : null,
    // ★인구식이 무엇에 막혔나 — 엔진이 이미 찍어 두는 진단 필드(`_dpDebug`)를 그대로 읽는다.
    //   K · 굶주림 · 건강 · 행복 · 위신 · 주거 · **gated**(무엇이 상한이었나) — 사본 0.
    dp: v._dpDebug || null,
    // ★K 는 무엇에 막혔나 — `_kDbg = {slot, prod, fuel}` 은 엔진이 이미 노출하는 분해다(리비히 min).
    kdb: v._kDbg || null,
    ws: { wood: +(v.storage.wood || 0).toFixed(1), stone: +(v.storage.stone || 0).toFixed(1),
          tool: +(v.storage.tool || 0).toFixed(1), food: +(v.storage.food || 0).toFixed(1) },
    housing: (v.housing != null) ? +v.housing.toFixed(1) : null,
    exp: v.expansions || 0,
    stock: { acorn: +(v.storage.acorn || 0).toFixed(1), chestnut: +(v.storage.chestnut || 0).toFixed(1),
             mulberry_fruit: +(v.storage.mulberry_fruit || 0).toFixed(1), grape: +(v.storage.grape || 0).toFixed(1),
             vegetable: +(v.storage.vegetable || 0).toFixed(1), fruit: +(v.storage.fruit || 0).toFixed(1) },
  };
}

const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);
  if (world.day % STEP === 0) snaps.push({ day: world.day, v: world.villages.map(snapOne) });
}
console.log = _log;

const arm = (process.env.T135_TREES === '0') ? 'A(대체 없음)' : 'B(대체 있음)';
let pop = 0, dead = 0, ever = 0;
for (const v of world.villages) { const n = (v.npcs || []).length; pop += n; if (v._everPop) ever++; if (v._everPop && n <= 0) dead++; }
console.log(`=== T151 고리 계측 — 시드 ${SEED} · ${DAYS}일 · ${world.villages.length}곳 · ${arm} ===`);
console.log(`   인구 ${pop} · 소멸 ${dead}/${ever} · 스냅 ${snaps.length}개(${STEP}일마다)`);
if (OUT) { fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, days: DAYS, step: STEP, arm, pop, dead, ever, snaps }, null, 0)); console.log(`   → ${OUT}`); }
