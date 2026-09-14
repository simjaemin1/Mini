#!/usr/bin/env node
// === scripts/t222-life800.js — 생활층이 **실제로 도는** 800일 자 (헤드리스 `Villages.init` 판) ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T222 · T213 §2 회부 1]
//   여덟 수 자(`t17-metrics`·`t165-ab`·`t176-ab`)는 econ 만 돌린다 — `Villages.init()` 을 **안 부른다**.
//   그래서 생활층이 내는 것(T146 사냥 장부 · 개간 · 건축 · T213 사냥 소득 문)을 **한 번도 못 봤다**:
//     · T190 `_farmMul` 은 계측기 마을에 `npcPids` 가 없어 헤드리스 라운드로빈으로 우회했고,
//     · T213 은 4팔이 전부 비트 동일이었다(사냥 장부 0 마을·일 — 문을 심는 줄이 `init()` 안이라 안 탄다).
//   ⇒ 이 자는 **`Villages.init()` 을 부른다**. 그 한 가지가 다르고, 나머지는 아무것도 새로 만들지 않는다.
//
// ★이 파일에 세계 산수는 **없다**. 전부 제품 함수를 그대로 부른다:
//     기동      : `Villages.init(deps)`   ← zone.js 가 주는 것과 **같은 모양**의 stub deps
//     하루      : `Villages.onGameTick(now)` ← 제품의 그 진입점(마감 조각까지 같은 길)
//     읽는 값   : `vil.econ` · `vil._farmSet` · `econ._hkillDay` … **정본이 써 둔 칸만 옮겨 적는다**
//   계측 항 이름은 `t176-ab.js` 와 같은 것을 쓴다(두 자를 나란히 놓으려면 같은 이름이어야 한다).
//
// ★결정성: 제품 `spawnOneNpc` 가 `Math.random` 으로 집 앞 자리를 흩는다. 자는 그것을 **씨 있는 난수**로
//   고정한다(랩 계측기 넷이 이미 쓰는 그 mulberry32 — `lab-hunt.js:32` 등). 고정하지 않으면 두 판이 갈린다.
//
// 실행:
//   node scripts/t222-life800.js [일수=800] [시드=1020]
//     T213_HUNT_REAL=1  ← 사냥 소득 실체 팔
//     T222_JSON=/tmp/t222/off_1020.json
'use strict';
const path = require('path');
const fs = require('fs');

const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.env.T222_JSON || '';

// ── 결정성 — 씨 있는 난수(랩 계측기 넷과 같은 mulberry32) ────────────────────
const _rnd0 = Math.random;
{ let s = SEED >>> 0;
  Math.random = function () { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ── 제품이 기대하는 환경 — 하루를 1ms 로, 조각내기 없이 ──────────────────────
process.env.ZONE_ID = 'hanbando';
process.env.ENABLE_VILLAGES = '1';
// ★하루 길이는 **제품 값 그대로**(24분)다. 자는 벽시계를 기다리지 않고 `now` 를 직접 밀기 때문에
//   줄일 이유가 없고, 줄이면 캐러밴 실체(`tickCaravanBodies(now)`)가 하루에 1ms 만 걷는다 —
//   실측으로 잡았다: `VILLAGE_DAY_MS=1` 로 800일을 돌리니 교역이 서지 않아 **51곳 중 47곳이 소멸**했다.
if (process.env.VILLAGE_DAY_MS) delete process.env.VILLAGE_DAY_MS;
process.env.VILLAGE_TICK_SLICE_MS = '0';                            // 양보 끈을 뽑는다 — 하루가 한 프레임
// ★[결정성] T146 밴드 구축은 **벽시계 예산**(`T146_BUILD_MS` 기본 20ms/마을·일)이라 기계 속도에 따라
//   완성 날이 갈린다 — 같은 씨로 두 판을 돌렸더니 `hkillDaysTot` 이 1,138 vs 1,149 로 벌어졌다(실측).
//   자에서는 예산을 크게 줘 **첫날에 다 짓게** 한다(제품이 이미 가진 손잡이 · 값만 바꾼다 · 세계 규칙 무변).
process.env.T146_BUILD_MS = process.env.T146_BUILD_MS || '100000';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t222-${SEED}-${process.pid}.db`;

const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const ZC = R('server/zone-config');
const { ZONES, WORLD } = ZC;
const ZONE = ZONES.hanbando;
// ★시드 — econ 세계의 씨는 존 설정에서 온다(`createWorldV2({ seed: ZONE.villageSeed })`).
//   자는 그 칸 하나만 바꾼다(env 손잡이가 없어서다 — 값을 지어내지 않고 **정본 칸을 그대로** 쓴다).
ZONE.villageSeed = SEED;

// ── stub deps — zone.js 가 주는 것과 **같은 모양**(없는 것은 무해한 빈 값) ────
//   ★관측자는 없다(`anyViewerNear → false`) ⇒ 제품이 스스로 헤드리스 갈래를 고른다.
// ★[T232] `T232_RAW=1` 이면 **잇기 전**(T228 판)으로 돌아간다 — 그 팔을 다시 돌려 비트 동일을 확인하려고 둔다.
const RAW = process.env.T232_RAW === '1';
// ★[T232] 정본 모듈 — 제품 존이 쓰는 것과 **같은 것**을 부른다(재구현 0).
const _terrain = R('server/terrain');
const SP = R('server/specialty');
// ★★[T251] **땅을 세우는 술어 셋** — `server/zone.js:570~650` 을 **그 구조 그대로** 세운다.
//   왜 여기서 다시 세우나: `zone.js` 는 모듈 하나가 곧 서버 기동이라 자가 require 할 수 없다.
//   그래서 zone.js 가 술어를 **짓는 데 쓴 정본 조각들**(`chunk.generateCoastlineWaterTiles` ·
//   `zone-config.findZoneAt` · `ZONE.bridges` · `terrain.isWater/isRockCellLocal`)을 그대로 불러
//   **같은 값**을 만든다 — 이 자가 지어낸 수도 표도 0 이다.
//   ⚠ T232 는 이 자리를 "이을 정본이 없다"로 두고 `isTerrainBlockedLocal: () => false` 를 줬다.
//     그 한 줄이 `makeTerrainAdapter` 의 `isBlocked` 를 통째로 눕혀, `village-layout.generate`(영토) ·
//     `prepareFert`(비옥도 장) · `extractLandParamsApprox`(부존 스캔) **전부**가 물도 바위도 없는
//     땅 위에서 돌았다 — `land.fertility` 중앙 0.99 → **0.42**(T251 §0ⓑ).
//   ★술어 셋 자체는 `scripts/zone-preds.js` **한 벌**에만 있다(이 자가 다시 적으면 그게 사본이다).
const _ZP = R('scripts/zone-preds').makeZonePreds('hanbando');
const _isWaterTileLocal = _ZP.isWaterTileLocal;
const _isRockTileLocal = _ZP.isRockTileLocal;
const _isTerrainBlockedLocal = _ZP.isTerrainBlockedLocal;
const _isBridgeTileLocal = _ZP.isBridgeTileLocal;
const _mined = new Map();                        // zone.js `minedCells` 와 같은 자리(자 안에서만 · 비어서 시작)
let _oreNow = 0;                                 // 자의 게임 시각(하루 루프가 민다 — zone.js `_simNow()` 자리)
const _ORE_DAY_MS = WORLD.dayLengthMs;
function _oreRec(key) {                          // zone.js `_oreRec` 원문과 같은 꼴(값은 전부 정본)
  let rec = _mined.get(key);
  if (!rec) return { s: SP.ORE_K, t: _oreNow, w: 0, fresh: true };
  const days = (_oreNow - rec.t) / _ORE_DAY_MS;
  if (days > 0) { rec.s = SP.oreRegen(rec.s, days); rec.t = _oreNow; }
  return rec;
}
const players = new Map(), npcs = new Map();
let _pid = 0;
// ★[T228 ⓐ] 자가 비워 둔 deps 를 **누가 몇 번 부르고 무엇을 돌려받았나** — 인공물 후보를 이름으로 찾는다.
const DEPCALL = {};
const _cnt = (n, f) => (...a) => { DEPCALL[n] = (DEPCALL[n] || 0) + 1; return f(...a); };
const deps = {
  players, npcs,
  spawnNpc: _cnt('spawnNpc', (o) => { const p = Object.assign({ pid: 'n' + (++_pid) }, o); players.set(p.pid, p); npcs.set(p.pid, p); return p; }),
  broadcast: _cnt('broadcast', () => {}),
  anyViewerNear: _cnt('anyViewerNear', () => false),                       // ★관측자 0 — 헤드리스 결산 갈래
  isPositionActive: _cnt('isPositionActive', () => false),
  qtResources: _cnt('qtResources', () => null),
  chunkManager: null,
  clearTreesInCells: _cnt('clearTreesInCells', () => 0),
  liveBuildRow: _cnt('liveBuildRow', () => null),
  onVillageAdded: _cnt('onVillageAdded', () => {}),
  // ★★[T251] **이 셋이 땅을 세운다** — `zone.js:2651` 이 `SimVillages.init` 에 넘기는 그 세 칸이다.
  //   `makeTerrainAdapter(terrain, ZONE, deps)` 의 `isBlocked`/`isWater` 가 `village-layout.generate`(영토) ·
  //   `prepareFert`(비옥도 장) · `extractLandParamsApprox`(부존 스캔) **전부의 입력**이고,
  //   그 위에 교역로 A*(`isBlocked`)까지 같은 술어를 쓴다.
  //   ⚠`isRockTileLocal` 은 제품이 `SimVillages.init` 에 **안 넘긴다**(villages.js 도 안 읽는다) — 그래서 안 넘긴다.
  isTerrainBlockedLocal: _cnt('isTerrainBlockedLocal', _isTerrainBlockedLocal),
  isWaterTileLocal: _cnt('isWaterTileLocal', _isWaterTileLocal),
  isBridgeLocal: _cnt('isBridgeLocal', _isBridgeTileLocal),   // ★zone.js:2661 — 물 위 다리 836칸이 통행이다
  isBlockedByWall: _cnt('isBlockedByWall', () => false),
  // ★★[T232] 아래 넷은 **제품 존이 넘기는 그 줄**을 인용한 것이다(`server/zone.js:2651~2683`).
  //   T228 이 `oreProbAt → 0` 에 이름을 붙였는데, 실은 더 깊었다: `_oreMineDaily` 는 첫 줄에서
  //   `if (!dep.oreConsumeAt || !dep.oreStockAt) return null;` 이라 **광맥 장부 문 둘이 없으면 아예 안 돈다**.
  //   자는 그 둘을 **zone.js 와 같은 꼴**로 세운다 — 값은 전부 정본(`specialty.ORE_K`·`oreRegen`)이고,
  //   판 자리 장부(`minedCells`)는 **비어서 시작한다**(갓 시딩한 세계의 참값 — 지어낸 수 0).
  //   zone.js 원문: `oreProbAt: (px, py) => (_terrain.oreProbMajorAt ? _terrain.oreProbMajorAt(ZONE_ID, px, py) : 0.3)`
  oreProbAt: _cnt('oreProbAt', (px, py) => (_terrain.oreProbMajorAt ? _terrain.oreProbMajorAt('hanbando', px, py) : 0.3)),
  //   zone.js 원문: `oreStockAt/oreConsumeAt` — `_oreRec` 가 없으면 `{ s: Specialty.ORE_K, fresh:true }`, 있으면 `oreRegen`
  oreStockAt: _cnt('oreStockAt', (cx, cy) => _oreRec(cx + '_' + cy).s),
  oreConsumeAt: _cnt('oreConsumeAt', (cx, cy, amount) => {
    if (!(amount > 0)) return 0;
    const rec = _oreRec(cx + '_' + cy);
    const got = Math.min(amount, Math.max(0, rec.s));
    if (got <= 0) return 0;
    rec.s -= got; _mined.set(cx + '_' + cy, rec); return got;
  }),
  ORE_K: SP.ORE_K, NPC_MINE_PER_DAY: SP.NPC_MINE_PER_DAY,
  mineDepthCost: (f) => SP.mineDepthCost(f), mineDepthP: (f) => SP.mineDepthP(f),
  mineChunkKg: (lvl) => SP.mineChunkKg(lvl),
  worldPhase: _cnt('worldPhase', (n) => ZC.worldPhase(n)),            // 정본(`zone-config.worldPhase`) — zone.js 가 넘기는 그것
  dayPhaseRatio: WORLD.dayPhaseRatio,                                 // 정본 상수(zone.js 원문과 같은 줄)
  mobs: new Map(),
  zoneWidth: ZONE.zoneWidth,
  perfMark: _cnt('perfMark', () => {}),
  ioBusy: _cnt('ioBusy', () => false),
  ioQuietMs: _cnt('ioQuietMs', () => 1e9),
};

if (RAW) {   // ★잇기 전 판 — T228 이 잰 그 빈 값들(비트 동일 재현용)
  deps.oreProbAt = _cnt('oreProbAt', () => 0);
  delete deps.oreStockAt; delete deps.oreConsumeAt; delete deps.ORE_K; delete deps.NPC_MINE_PER_DAY;
  delete deps.mineDepthCost; delete deps.mineDepthP; delete deps.mineChunkKg;
  deps.isWaterTileLocal = _cnt('isWaterTileLocal', () => false);
  deps.isTerrainBlockedLocal = _cnt('isTerrainBlockedLocal', () => false);
  delete deps.isBridgeLocal;
  deps.worldPhase = _cnt('worldPhase', () => 0.5);
  deps.dayPhaseRatio = () => 0.5;
}
const V = R('server/villages');
const t0 = Date.now();
const _log = console.log; console.log = () => {};
V.init(deps);
console.log = _log;
const tInit = Date.now() - t0;

// ── 하루 루프 — 제품 진입점 그대로 ───────────────────────────────────────────
const dayMs = WORLD.dayLengthMs;
// ★제품은 기동 끝에서 `state.lastGameDay = gameDayOf(Date.now())` 로 **실시계에 앵커**한다(`villages.js:2756`).
//   그래서 자의 첫 날은 기동이 끝난 **그 순간**부터 세야 한다(0 에서 세면 새 날이 안 열린다 — 실측으로 잡았다).
const base = Date.now();
// ★econ 칸은 **제품이 스스로 DB 에 적어 둔 것**을 읽는다(`serializeEcon` — 계측기가 econ 을 다시 안 만든다).
//   하루 한 번 저장 큐를 비우고(제품은 틱당 한 마을씩 배수한다) 그 줄에서 값을 꺼낸다.
const db = R('server/zone-local-db');
const M = new Map();   // 마을별 누계(계측 전용)
const TRAJ = [];       // ★[T241] 20일 궤적(열 × 날)
const grab = (js, key) => { const m = js.match(new RegExp('"' + key + '":(-?[0-9.eE+]+)')); return m ? +m[1] : 0; };
const t1 = Date.now();
// ★★[T241 ③] **자의 시계를 고정한다.** 제품 `_dayNow()` 는 마감 밖이면 `Date.now()` 로 떨어진다
//   (`villages.js:3405`). 자는 저장 큐를 비우려고 같은 날에 `onGameTick` 을 60번 더 부르는데,
//   그 사이에 흐른 **실시간**이 캐러밴 실체·광맥 적분에 들어가 같은 씨 두 판의 `emitted` 를 갈랐다
//   (11,105 vs 11,071 — T232 §1). 세계는 자가 미는 `now` 만 보면 된다 ⇒ 루프 동안 `Date.now` 를 그 값으로 둔다.
//   (랩 계측기가 `Math.random` 을 씨로 고정하는 것과 같은 자리 — 자 코드만 · 제품 무변.)
// ★[T259 ⓒ · T279 ⓑ] 목재 항등식 누계 — 자가 짓는 수는 0(정본 칸을 더하기만 한다).
// ★[T279] 활대 몫을 자리로 세운다. 상수는 **정본 소스에서 읽는다**(`t176-ab.js:202~205` 와 같은 규약 —
//   `SELF_BOW_WOOD` 는 내보내기가 없어서, 값을 이 파일에 적으면 정본이 바뀔 때 조용히 어긋난다).
const _ECONSRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const SELF_BOW_WOOD = (() => { const m = _ECONSRC.match(/const\s+SELF_BOW_WOOD\s*=\s*([0-9.]+)\s*;/); return m ? +m[1] : null; })();
// ★[T279] 부패는 제품이 이미 가진 손잡이로 끈다(`economy-sim-v2.js:1329` `world._dbg?.decay !== false`).
//   자는 그 칸에 `false` 를 놓기만 한다 — 제품 코드 0 · 새 손잡이 0.
const NODECAY = process.env.T279_NODECAY === '1';
// ★★[T279 ⓑ] **세계 합으로 본다.** 마을끼리 오간 목재는 세계 합에서 **정확히 상쇄**되므로
//   `exportBy`/`woodImported` 두 칸은 애초에 항등식의 항이 아니다(그 둘만 세면 다리 절반을 센 셈 —
//   `economy-sim-v2.js:1024` 도착 인도와 `:1103` 귀환 화물 매입이 그 두 칸에 **안 실린다**).
//   세계 합에서 남는 교역 항은 셋뿐이다: **국고**(`:1156` 3% 교역세) · **길 위**(아직 안 닿은 화물) ·
//   **약탈 손실**(`cargoLost` — 재화별이 아니라 총량이라 이름으로만 남긴다).
const DAY = { rows: [], residSum: 0, bowPrev: 0, subsPrev: 0, decPrev: 0 };
const CUM = { prod: 0, cons: 0, imp: 0, exp: 0, stock: 0, bow: 0, treas: 0, road: 0, subs: 0, decay: 0,
  impNow: 0, expNow: 0, stockNow: 0, bowNow: 0, treasNow: 0, subsNow: 0, decayNow: 0, stock0: 0, treas0: 0 };
{ let s0 = 0; for (const row of db.getVillagesByZone('hanbando')) { const lv = V.villageByDbId ? V.villageByDbId(row.id) : null;
    if (lv && lv.econ && lv.econ.storage) s0 += +(lv.econ.storage.wood || 0); }
  CUM.stock0 = s0; }   // ★창설 부존(하루 1 **전**)
{ let t0 = 0; for (const row of db.getVillagesByZone('hanbando')) { const lv = V.villageByDbId ? V.villageByDbId(row.id) : null;
    if (lv && lv.econ && lv.econ.treasury) t0 += +(lv.econ.treasury.wood || 0); }
  CUM.treas0 = t0; }
// ★[T279 ⓑ] 부패 A/B — 제품이 가진 `world._dbg.decay` 를 끈다(자 코드만 · 세계 규칙 무변 · 기본 켬).
if (NODECAY) {
  let hit = 0;
  for (const row of db.getVillagesByZone('hanbando')) {
    const lv = V.villageByDbId ? V.villageByDbId(row.id) : null;
    const w = lv && lv.econ && lv.econ._world; if (!w) continue;
    (w._dbg || (w._dbg = {})).decay = false; hit++;
  }
  console.error(`[T279] 부패 끔 — world._dbg.decay=false (마을 ${hit}곳에서 잡은 world)`);
}
const _now0 = Date.now;
let _simClock = base;
Date.now = () => _simClock;
const _l2 = console.log; console.log = () => {};
for (let d = 1; d <= DAYS; d++) {
  const now = base + d * dayMs;
  _simClock = now;
  _oreNow = now;                                          // ★[T232] 광맥 재생 적분의 시각(zone.js `_simNow()` 자리)
  // ★[T279 ⓑ] 하루 **앞** 총 목재(재고+국고) — 하루 잔차를 날짜별로 보려면 틱 전 값이 있어야 한다.
  let _w0 = 0;
  for (const row of db.getVillagesByZone('hanbando')) {
    const lv = V.villageByDbId ? V.villageByDbId(row.id) : null; const e = lv && lv.econ; if (!e) continue;
    _w0 += +((e.storage && e.storage.wood) || 0) + +((e.treasury && e.treasury.wood) || 0);
  }
  const _road0 = CUM.road;
  V.onGameTick(now);
  for (let f = 0; f < 60; f++) V.onGameTick(now);          // 저장 큐 배수(같은 날 — 제품이 새 날을 안 연다)
  const TR = (d === 1 || (d <= 40 && d % 5 === 0) || d % 20 === 0) ? { pop: 0, food: 0, stone: 0, metal: 0, wood: 0, toolQ: 0, weapQ: 0, hungry: 0, game: [], wd: [], fert: [], hk: 0, wProd: 0, wProdVil: 0, wCons: 0, wImpCum: 0, wExpCum: 0, lumber: 0, wSust: 0, fuelCov: 0 } : null;
  // ★★[T259 ⓒ] **하루도 빠짐없이** 목재 네 항을 더한다 — 궤적은 표본 날만 찍으므로 항등식이 안 닫힌다.
  //   산 마을(`villages.js:4654 villageByDbId` — 제품이 이미 내주는 읽기 전용 문)에서 정본 칸만 읽는다.
  //   `dailyProductionBuf.wood`(오늘 벌목) · `_consDay.wood`(오늘 연료+건축) ·
  //   `tradeStats.woodImported` / `tradeStats.exportBy.wood`(둘 다 **누계**).
  for (const row of db.getVillagesByZone('hanbando')) {
    const live = V.villageByDbId ? V.villageByDbId(row.id) : null;
    const e = live && live.econ; if (!e) continue;
    CUM.prod += +((e.dailyProductionBuf && e.dailyProductionBuf.wood) || 0);
    CUM.cons += +((e._consDay && e._consDay.wood) || 0);
    const TS = e.tradeStats || {};
    CUM.impNow += +(TS.woodImported || 0);
    CUM.expNow += +((TS.exportBy && TS.exportBy.wood) || 0);
    CUM.stockNow += +((e.storage && e.storage.wood) || 0);
    // ★[T279 ⓑ] 활대 — `_bowMade` 는 **누계**다(`_bowMadeToday` 는 같은 틱 안 `:2924` 에서 0 으로 접힌다).
    CUM.bowNow += +(e._bowMade || 0);
    CUM.treasNow += +((e.treasury && e.treasury.wood) || 0);   // ★국고로 빠진 목재(`:1156` 교역세)
    // ★★[T288] **정본이 이제 적어 준다.** T279 가 이름만 붙였던 두 자리가 누계 칸이 됐다 —
    //   `_subsUsed.wood`(`economy-sim-v2.js:525` 주거 인출) · `_decayed.wood`(`:1329` 부패).
    //   자는 그 칸을 **옮겨 적기만** 한다(산수 0 · 재구현 0).
    CUM.subsNow += +((e._subsUsed && e._subsUsed.wood) || 0);
    CUM.decayNow += +((e._decayed && e._decayed.wood) || 0);
  }
  CUM.imp = CUM.impNow; CUM.exp = CUM.expNow; CUM.stock = CUM.stockNow; CUM.bow = CUM.bowNow;
  CUM.treas = CUM.treasNow; CUM.subs = CUM.subsNow; CUM.decay = CUM.decayNow;
  CUM.impNow = 0; CUM.expNow = 0; CUM.stockNow = 0; CUM.bowNow = 0; CUM.treasNow = 0;
  CUM.subsNow = 0; CUM.decayNow = 0;
  // ★길 위의 목재 — 세계 캐러밴 목록(정본 `world.caravans`)에서 그대로 센다.
  {
    let road = 0;
    const any = (() => { for (const row of db.getVillagesByZone('hanbando')) {
      const lv = V.villageByDbId ? V.villageByDbId(row.id) : null;
      if (lv && lv.econ && lv.econ._world) return lv.econ._world; } return null; })();
    for (const c of ((any && any.caravans) || [])) {
      if (c.giveRes === 'wood' && c.state === 'outbound') road += +(c.giveAmt || 0);
      if (c._returningRes === 'wood') road += +(c._returningAmt || 0);
    }
    CUM.road = road;
  }
  // ★[T279 ⓑ] 하루 잔차 — (틱 전 총량 + 오늘 벌목) − (틱 뒤 총량 + 오늘 연료건축 + 오늘 활대 + 길위 증가)
  {
    let _w1 = 0, _bowC = 0, _consC = 0, _prodC = 0, _subsC = 0, _decC = 0;
    for (const row of db.getVillagesByZone('hanbando')) {
      const lv = V.villageByDbId ? V.villageByDbId(row.id) : null; const e = lv && lv.econ; if (!e) continue;
      _w1 += +((e.storage && e.storage.wood) || 0) + +((e.treasury && e.treasury.wood) || 0);
      _bowC += +(e._bowMade || 0);
      _consC += +((e._consDay && e._consDay.wood) || 0);
      _prodC += +((e.dailyProductionBuf && e.dailyProductionBuf.wood) || 0);
      _subsC += +((e._subsUsed && e._subsUsed.wood) || 0);
      _decC += +((e._decayed && e._decayed.wood) || 0);
    }
    const dBow = (_bowC - (DAY.bowPrev || 0)) * (SELF_BOW_WOOD || 0);
    const dSubs = _subsC - (DAY.subsPrev || 0), dDec = _decC - (DAY.decPrev || 0);
    DAY.bowPrev = _bowC; DAY.subsPrev = _subsC; DAY.decPrev = _decC;
    const r = (_w0 + _prodC) - (_w1 + _consC + dBow + dSubs + dDec + (CUM.road - _road0));
    DAY.rows.push({ day: d, w0: +_w0.toFixed(2), w1: +_w1.toFixed(2), prod: +_prodC.toFixed(2),
      cons: +_consC.toFixed(2), bow: +dBow.toFixed(2), subs: +dSubs.toFixed(2), dec: +dDec.toFixed(2),
      dRoad: +(CUM.road - _road0).toFixed(2), resid: +r.toFixed(2) });
    DAY.residSum += r;
  }
  for (const row of db.getVillagesByZone('hanbando')) {
    if (!row.econ_state) continue;
    let m = M.get(row.name); if (!m) M.set(row.name, m = { hkillDays: 0, hkillSum: 0, popMax: 0, everPop: false, huntMax: 0 });
    const hk = grab(row.econ_state, '_hkillDay');
    // ★[T228 ⓐ] `land.game` 궤적 — 첫날 값이 곧 **창설값**이다(14일 갱신 전). 0.45 가 바닥인지 창설값인지 여기서 갈린다.
    const gm = grab(row.econ_state, 'game');
    if (m.game0 === undefined) { m.game0 = gm; m.gameMin = gm; m.gameChanged = 0; }
    if (gm < m.gameMin) m.gameMin = gm;
    if (m.gameLast !== undefined && gm !== m.gameLast) m.gameChanged++;
    m.gameLast = gm;
    if (hk > 0) { m.hkillDays++; m.hkillSum += hk; }
    const pop = row.population || 0;
    if (pop > m.popMax) m.popMax = pop;
    if (pop > 0) m.everPop = true;
    const hn = grab(row.econ_state, '"hunter"'.replace(/"/g, '')) || 0;
    if (hn > m.huntMax) m.huntMax = hn;
    // ★[T241] 20일 궤적 — **정본이 써 둔 칸을 옮겨 적기만** 한다(합·중앙 외 산수 0).
    if (TR) {
      let v; try { v = JSON.parse(row.econ_state); } catch (e) { v = null; }
      if (v) {
        const S = v.storage || {}, L = v.land || {};
        TR.pop += (v.npcs || []).length;
        TR.food += S.food || 0; TR.stone += S.stone || 0; TR.wood += S.wood || 0;
        TR.metal += (S.copper || 0) + (S.tin || 0) + (S.bronze || 0);
        TR.toolQ += (S.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
        TR.weapQ += (S.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
        if ((S.food || 0) <= 0) TR.hungry++;
        TR.game.push(L.game || 0); TR.wd.push(L.wood || 0); TR.fert.push(L.fertility || 0);
        // ★★[T247] 목재 수지 — `t176-ab.js:338~339`(T207)와 **같은 식**으로 같은 정본 칸을 읽는다.
        //   `dailyProductionBuf.wood` = 그날 벌목 실현 산출 · `_consDay.wood` = `_cons` 로 잡히는 유출
        //   (연료 `economy-sim:3028` + 건축 `:3047` 둘뿐 — T207 이 그렇게 못 박았다).
        // ★★[T259 ⓒ] **유입 열은 DB 행에서 못 읽는다.** `dailyProductionBuf` 는 `SERIALIZE_SKIP`
        //   (`villages.js:645~651` — "매 틱 리셋 버퍼라 복원 시 재생성")이라 `econ_state` 에 **아예 없다**.
        //   그래서 T247 §0ⓐ 의 "유입 0" 은 세계가 아니라 **이 칸의 결함**이었다(T251 회부 3).
        //   고침: 제품이 이미 내주는 **읽기 전용 문**(`villages.js:4654 villageByDbId`)으로 **산 마을**을 받아
        //   그 안의 살아 있는 버퍼를 읽는다. 제품 코드 0 · 새 문 0 · 자가 짓는 값 0.
        {
          const live = (V.villageByDbId ? V.villageByDbId(row.id) : null);
          const dpb = live && live.econ && live.econ.dailyProductionBuf;
          TR.wProd += +((dpb && dpb.wood) || 0);
          if (dpb) TR.wProdVil++;
        }
        TR.wCons += +((v._consDay && v._consDay.wood) || 0);
        // ★[T259 ⓒ] 교역 항 — 유입−유출로 재고가 안 닫히면 남는 건 캐러밴이다.
        //   `tradeStats.woodImported`(들어온 누계 · `economy-sim-v2:1164`) · `tradeStats.exportBy.wood`(나간 누계).
        //   둘 다 **누계**라 궤적 칸에는 누계를 그대로 싣는다(차분은 읽는 쪽에서 — 자가 짓는 수 0).
        {
          const TS = v.tradeStats || {};
          TR.wImpCum += +(TS.woodImported || 0);
          TR.wExpCum += +((TS.exportBy && TS.exportBy.wood) || 0);
        }
        TR.lumber += (v.counts || {}).lumberjack || 0;
        TR.wSust += (L.woodSustain != null ? L.woodSustain : 0);
        TR.fuelCov += (v._fuelCov != null ? +v._fuelCov : 1);
        if ((v._hkillDay || 0) > 0) TR.hk++;
      }
    }
  }
  if (TR) { const md = (a) => { a.sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(3) : null; };
    TRAJ.push({ day: d, pop: TR.pop, food: +TR.food.toFixed(1), stone: +TR.stone.toFixed(1),
      metal: +TR.metal.toFixed(1), wood: +TR.wood.toFixed(1), toolQ: +TR.toolQ.toFixed(1), weapQ: +TR.weapQ.toFixed(1),
      hungry: TR.hungry, game: md(TR.game), woodL: md(TR.wd), fert: md(TR.fert), hkVil: TR.hk,
      wProd: +TR.wProd.toFixed(2), wProdVil: TR.wProdVil, wCons: +TR.wCons.toFixed(2),
      wImpCum: +TR.wImpCum.toFixed(2), wExpCum: +TR.wExpCum.toFixed(2), lumber: TR.lumber,
      wSust: +TR.wSust.toFixed(2), fuelCov: +(TR.fuelCov / 51).toFixed(3) }); }
}
console.log = _l2;
Date.now = _now0;                                          // ★[T241] 시계를 돌려준다
const tRun = Date.now() - t1;
Math.random = _rnd0;

const st = V.lifeDebug ? V.lifeDebug() : null;
const LS = (V.__labProbe && V.__labProbe._ledgerStats) ? V.__labProbe._ledgerStats() : null;
// ── 여덟 수 — **제품이 DB 에 적어 둔 econ 을 읽어** `t176-ab.js:427~436` 과 **같은 식**으로 센다.
//   ⚠식이 그쪽과 같아야 두 자를 나란히 놓을 수 있다. 다른 식을 쓰면 그게 사본이다.
//   ⚠사건 장부에서 오는 열(`reqOpened`·`emitted`·㉮㉯)은 서버 state 안에 있어 여기선 못 읽는다 → `null`.
const PRESERVED = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
const RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];
let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0, toolQ = 0, preserved = 0, rawGrain = 0, hunterN = 0;
const per = [];
const lifeBy = new Map();
for (const row of (Array.isArray(st) ? st : (st && st.villages) || [])) lifeBy.set(row.name, row);
for (const row of db.getVillagesByZone('hanbando')) {
  if (!row.econ_state) continue;
  let v; try { v = JSON.parse(row.econ_state); } catch (e) { continue; }
  const n = (v.npcs || []).length; pop += n;
  if (v._everPop) ever++;
  if (v._everPop && n <= 0) dead++;
  weapQ += ((v.storage || {}).weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
  expand += v.expansions || 0;
  toolQ += ((v.storage || {}).tool || 0) * (v._toolQ != null ? v._toolQ : 1);
  for (const r of PRESERVED) preserved += (v.storage || {})[r] || 0;
  for (const r of RAWGRAIN) rawGrain += (v.storage || {})[r] || 0;
  const hn = (v.counts || {}).hunter || 0; hunterN += hn;
  const m = M.get(row.name) || {}; const L = lifeBy.get(row.name) || {};
  const G = M.get(row.name) || {};
  per.push({ name: row.name, N: n, everPop: !!v._everPop, popMax: m.popMax || 0,
    hunter: hn, lumberjack: (v.counts || {}).lumberjack || 0,
    hkillDays: m.hkillDays || 0, hkillSum: +(m.hkillSum || 0).toFixed(3),
    hkillDay: v._hkillDay != null ? +(+v._hkillDay).toFixed(3) : null,
    game: +((v.land || {}).game || 0).toFixed(2),
    // ★[T228 ⓐ] `land.game` 이 **다시 쓰인 적이 있나**(0.45 는 바닥이 아니라 **창설값**일 수 있다 —
    //   `land.game = _baseGame × clamp(gsum/gameTot0, 0.05, 1)` 이 유일한 쓰는 자리다 · `villages.js:5337`).
    game0: G.game0 != null ? +G.game0.toFixed(2) : null,
    gameMin: G.gameMin != null ? +G.gameMin.toFixed(2) : null,
    gameChanged: G.gameChanged || 0,
    gameRatio: (G.game0 > 0) ? +(((v.land || {}).game || 0) / G.game0).toFixed(3) : null,
    meat: +(((v.storage || {}).meat || 0)).toFixed(1),
    farm: L.farm || 0, pot: L.pot || 0, houses: (L.gran || 0), npcVis: L.pop || 0,
    wcut: v._wcutDay != null ? v._wcutDay : null });   // ★벌목 실체는 서버에 없다 — 늘 null(T213 §0ⓐ)
}
const out = {
  arm: (RAW ? 'raw-' : '') + (process.env.T213_HUNT_REAL === '1' ? 'hunt' : 'off'),
  seed: SEED, days: DAYS, initMs: tInit, runMs: tRun, msPerDay: +(tRun / DAYS).toFixed(2),
  villages: per.length,
  pop, dead, ever, weapQ: +weapQ.toFixed(1), expand, toolQ: +toolQ.toFixed(1),
  preserved: +preserved.toFixed(1), rawGrain: +rawGrain.toFixed(1),
  // ★[T228 ④] 사건 장부 — `__labProbe._ledgerStats` **읽기 전용 한 줄**로 자가 읽는다(여덟 수 8/8).
  reqOpened: (LS && LS.reqOpened) || 0, emitted: (LS && LS.emitted) || 0,
  reqClosed: (LS && LS.reqClosed) || 0, reqShrunk: (LS && LS.reqShrunk) || 0,
  // ★[T259 ⓒ] 목재 수지 항등식 — 창설부존 + Σ유입 − Σ유출 + 수입 − 수출 = 끝 재고 ?
  woodBal: (() => {
    const bowWood = CUM.bow * (SELF_BOW_WOOD || 0);
    const treasDelta = CUM.treas - CUM.treas0;
    // ★세계 합 항등식: 창설부존 + 벌목 = 끝재고 + 연료건축 + 활대 + 국고 + 길위 + **이름 없는 나머지**
    //   (마을끼리 오간 것은 상쇄된다 — `exported`/`imported` 는 참고로만 싣는다)
    // ★[T288] 자리 둘이 이름과 **수**를 얻었다 — 이제 항등식에 그대로 들어간다.
    const named = CUM.cons + bowWood + treasDelta + CUM.road + CUM.subs + CUM.decay;
    const resid = CUM.stock0 + CUM.prod - named - CUM.stock;
    return { nodecay: NODECAY, selfBowWood: SELF_BOW_WOOD,
      stock0: +CUM.stock0.toFixed(2), prodSum: +CUM.prod.toFixed(2),
      consSum: +CUM.cons.toFixed(2), bowMade: +CUM.bow.toFixed(3), bowWood: +bowWood.toFixed(2),
      treasury: +treasDelta.toFixed(2), onRoad: +CUM.road.toFixed(2),
      subsUsed: +CUM.subs.toFixed(2), decayed: +CUM.decay.toFixed(2),
      stockEnd: +CUM.stock.toFixed(2), residual: +resid.toFixed(2),
      residPct: +(resid / Math.max(1, CUM.stock0 + CUM.prod) * 100).toFixed(2),
      // 참고(세계 합에서 상쇄되는 항 — 다리 절반씩만 세는 칸이라 항등식에 안 넣는다)
      refExported: +CUM.exp.toFixed(2), refImported: +CUM.imp.toFixed(2),
      dayResidSum: +DAY.residSum.toFixed(2) };
  })(),
  woodDaily: DAY.rows,
  depCalls: DEPCALL, traj: TRAJ,
  hunterN, hkillDaysTot: per.reduce((a, p) => a + p.hkillDays, 0),
  hkillSumTot: +per.reduce((a, p) => a + p.hkillSum, 0).toFixed(3),
  farmTot: per.reduce((a, p) => a + p.farm, 0), meatTot: +per.reduce((a, p) => a + p.meat, 0).toFixed(1),
  per,
};

console.log(`\n=== T222 생활층 자 — ${out.arm} 팔 · 시드 ${SEED} · ${DAYS}일 · 마을 ${out.villages}곳 ===`);
console.log(`  기동 ${(tInit / 1000).toFixed(1)}s · 하루 ${out.msPerDay}ms · 800일 환산 ${(tRun / DAYS * 800 / 60000).toFixed(1)}분`);
console.log(`  인구 ${out.pop} · 소멸 ${out.dead}/${out.ever} · 무기Q ${out.weapQ} · 확장 ${out.expand} · 도구Q ${out.toolQ} · 보존식 ${out.preserved} · 생곡 ${out.rawGrain}`);
console.log(`  사냥꾼 ${out.hunterN} · 장부 선 마을·일 ${out.hkillDaysTot} · 마릿수 합 ${out.hkillSumTot} · 고기 ${out.meatTot} · 개간 ${out.farmTot}`);
if (OUT) { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify(out)); console.log(`  → ${OUT}`); }
process.exit(0);
