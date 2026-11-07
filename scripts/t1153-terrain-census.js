#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1153 표 기계 · 제품 무변 · 읽기만)
// =============================================================================
// T1153 — 새벌(한반도) · 아사기 열도(닛폰) 지형 전수 조사: 생업 다섯 축 · 빈 땅 · 마을 분포 균일도 · 고증 추가 후보 추정.
//
//   ① 셀마다(격자 G셀 간격 · 4셀 격자에 맞춘 중심) 그 자리에 마을이 선다면의 땅값을 **정본 식**으로 잰다:
//      · 숲 · 사냥 밴드 · 바위 · 광맥 몫 = `extractLandParamsApprox` 와 같은 4셀 표본 격자(반경 140 · 사냥 40~130) → `livelihood.landOf`
//      · 물 = 그 함수의 고리 스캔(`nearestWaterDist` 와 같은 18방 · 140) → `water = max(0.05, 1 − nd/140) × 1.6`
//      · 비옥도 = `fertility.buildField`(prepareFert 와 같은 상자 반경 62 · EDT) 를 영토(원판 · 넓이 = 51 마을 실영토 중앙값)에서 평균 × 1.4
//      · 지속 상한 = `sustain.scanLabor` + `sustainOf`(노동권 150) · 광맥 등급 · 특수 산지 = 어댑터 `oreMix` · `oreMinerals` + `sustain.specialOf`
//      ⚠근사 둘: 영토를 원판으로(실영토는 `VillageLayout.generate`) · 술어는 셀 래스터(지형 정본 술어를 한 번 구운 것). 51 + 닛폰 후보 자리에서는
//        정본 그대로(실영토 · 정본 술어)도 재서 둘을 맞댄다(§검증).
//   ② 축마다 "그 축 하나로 N명(20 · 40)을 먹이거나 바꿔 먹나" — econ 정본 조각만: 자리 = `jobCapacity`(s × 땅값 × 계수) · 1인 산출 = `JOBS` base × landBoost ·
//      식량 등가 = `totalFoodEquivalent`(곡 · 생선 · 고기 1) · 나무 · 원석은 `BASE_VALUE` 비로 바꿔 먹는다 · 지속 상한(woodSustain · fishSustain) 적용 ·
//      하루 소비 `DAILY_FOOD_CONSUMPTION`. 판정 = min(자리, N) × 1인 산출(상한) ≥ N × 소비. 손 문턱 0.
//   ③ 마을 거리 = `_distMatrixGen` 과 같은 코스 격자 BFS(4셀 · 8방 · 코너 절단 금지 · `coarseOpen` 다리 구제) — 한반도는 교역로 캐시 실길이도 같이.
//   ④ 고증 추가 추정(①②③ 순서 — 지류 → 자잘한 숲 → 자잘 광맥): 빈 자리마다 넣은 것을 땅값에 얹어 같은 판정을 다시.
//
// 쓰는 법: node scripts/t1153-terrain-census.js <zone> <out.json> [--grid 32]
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t1153-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando';
const OUT = process.argv[3] || `/tmp/t1153/${Z}.json`;
const GRID = (() => { const i = process.argv.indexOf('--grid'); return i >= 0 ? (+process.argv[i + 1] || 32) : 32; })();
// ★[T1173] 비옥도 물 술어 갈래 · 내륙 후보 — `--fert all|nosea|nosea+stream`(기본 all = 정본 그대로) · `--add valley,grove,foot` · `--noscen`(처방 추정 건너뜀)
//   all = 큰 물 전부(해안 띠 바다 포함 — 존 `isWaterTileLocal`) · nosea = 바다 뺌(존 `isSeaTileLocal` = 해안 띠이면서 강 · 호수 아님 — 그 차집합) · +stream = 개울(T585) 더함
//   valley = 지형 `valleys`(곡간 통로)를 물과 같은 항(0.62 · e^(−d/80))의 근원으로 · grove = 군락 `water_pool`(둠벙)을 같은 근원으로
//   foot = 산록 완사면 띠 — 바위에서 ROCK_FULL/2 ~ 2·ROCK_FULL 셀(30 ~ 120)에 W_ROCK(0.18)을 더한다(정본 상수에서 유도 · 새 수 0 · 판정 칸)
const _arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FERT_MODE = _arg('--fert', 'all');
const FERT_ADD = new Set(String(_arg('--add', '')).split(',').filter(Boolean));
const NOSCEN = process.argv.includes('--noscen');
const FERT_CANON = FERT_MODE === 'all' && !FERT_ADD.size;
const t0 = Date.now();
const log = (...a) => process.stderr.write(`[t1153 ${Z} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.join(' ')}\n`);

// ── 지형 정본 부트스트랩(t436-gate-trade.js `setup` 그 줄 — 해안 띠 포함) ──
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');
const BAND = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
  Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
const isWaterTileLocal = (x, y) => { if (!_inZone(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
//   다리 = 존 설정 `bridges`(zone.js `BRIDGE_CELLS` · `isBridgeTileLocal` 그 표) — 통행 술어에서 물 위 다리 칸은 열린다(바위는 다리로 못 덮는다 · `coarseOpen` 그 뜻)
const BR = new Set(); { const bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
const isBridgeLocal = (x, y) => BR.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || (isWaterTileLocal(x, y) && !isBridgeLocal(x, y)), isWaterTileLocal, isBridgeLocal });
const L = R('server/livelihood'), S = R('server/sustain'), FERT = R('server/fertility'), VL = R('server/village-layout');
const ECON = R('sim/economy-sim');
let STR = null; try { STR = R('server/streams'); } catch (e) { STR = null; }
const isSeaTileLocal = (x, y) => { if (!_inZone(x, y) || !BAND) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  if (!BAND.has(`${tx}_${ty}`)) return false; try { return !T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };   // zone.js `isSeaTileLocal` 그 차집합

// ── 셀 래스터(정본 술어를 한 번 굽는다) ──
const W = Math.ceil(ZONE.zoneWidth / SZ), H = Math.ceil(ZONE.zoneHeight / SZ);
const WAT = new Uint8Array(W * H), ROCK = new Uint8Array(W * H), FOR = new Uint8Array(W * H), ORE = new Uint8Array(W * H), STRM = new Uint8Array(W * H), SEA = new Uint8Array(W * H), VAL = new Uint8Array(W * H), GRV = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (ta.isWater(x, y)) WAT[i] = 1;
  if (ta.isRock(x, y)) ROCK[i] = 1;
  if (ta.forestMult(x, y) > 1.2) FOR[i] = 1;
  if (ta.isOre && ta.isOre(x, y)) ORE[i] = 1;
  if (STR && STR.isStreamCell && STR.isStreamCell(Z, x, y)) STRM[i] = 1;
  if (WAT[i] && isSeaTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) SEA[i] = 1;
}
// ★[T1173] 지형 층 둘을 셀로(지형 JSON 그대로 · 읽기만) — 계곡(path + width · 강과 같은 꼴) · 군락 둠벙(center · r)
{
  const TJ = R('server/hanbando-terrain.json')[Z] || {};
  for (const v of (TJ.valleys || [])) {
    const P2 = v.path || [];
    for (let k = 1; k < P2.length; k++) {
      const a = P2[k - 1], b = P2[k], hw = ((a.width || 0) + (b.width || 0)) / 4 / SZ;   // 반폭(셀)
      const ax = a.pos[0] / SZ, ay = a.pos[1] / SZ, bx = b.pos[0] / SZ, by = b.pos[1] / SZ;
      const x0 = Math.floor(Math.min(ax, bx) - hw - 1), x1 = Math.ceil(Math.max(ax, bx) + hw + 1), y0 = Math.floor(Math.min(ay, by) - hw - 1), y1 = Math.ceil(Math.max(ay, by) + hw + 1);
      const L2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
      for (let y = Math.max(0, y0); y <= Math.min(H - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++) {
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * (bx - ax) + (y + 0.5 - ay) * (by - ay)) / L2));
        const dx = x + 0.5 - (ax + t * (bx - ax)), dy = y + 0.5 - (ay + t * (by - ay));
        if (dx * dx + dy * dy <= hw * hw) VAL[y * W + x] = 1;
      }
    }
  }
  for (const g of (TJ.groves || [])) {
    if (g.kind !== 'water_pool') continue;
    const cx0 = g.center[0] / SZ, cy0 = g.center[1] / SZ, r = Math.max(1, (g.r || 40) / SZ);
    for (let y = Math.floor(cy0 - r); y <= Math.ceil(cy0 + r); y++) for (let x = Math.floor(cx0 - r); x <= Math.ceil(cx0 + r); x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue; if ((x + 0.5 - cx0) ** 2 + (y + 0.5 - cy0) ** 2 <= r * r) GRV[y * W + x] = 1; }
  }
}
// 숲 적분 영상(임상 비율 — fertility.buildField 의 WOODY_R 창 · 창은 늘 17×17 칸으로 나눈다 — 그 함수의 넓힌 상자 그대로)
const FII = new Float64Array((W + 1) * (H + 1));
for (let y = 0; y < H; y++) { let row = 0; for (let x = 0; x < W; x++) { row += FOR[y * W + x]; FII[(y + 1) * (W + 1) + (x + 1)] = FII[y * (W + 1) + (x + 1)] + row; } }
const woodyAt = (cx, cy) => { const M = FERT.WOODY_R, x0 = Math.max(0, cx - M), y0 = Math.max(0, cy - M), x1 = Math.min(W - 1, cx + M), y1 = Math.min(H - 1, cy + M);
  if (x1 < x0 || y1 < y0) return 0; const s = FII[(y1 + 1) * (W + 1) + (x1 + 1)] - FII[y0 * (W + 1) + (x1 + 1)] - FII[(y1 + 1) * (W + 1) + x0] + FII[y0 * (W + 1) + x0]; return s / ((2 * M + 1) * (2 * M + 1)); };
// 비옥도의 물 근원(갈래)
const fertSrc = (x, y) => { const i = (x < 0 || y < 0 || x >= W || y >= H) ? -1 : y * W + x; if (i < 0) return false;
  if (WAT[i] && !(FERT_MODE !== 'all' && SEA[i])) return true;
  if (FERT_MODE === 'nosea+stream' && STRM[i]) return true;
  if (FERT_ADD.has('valley') && VAL[i]) return true;
  if (FERT_ADD.has('grove') && GRV[i]) return true;
  return false; };
log(`래스터 ${W}×${H}`);
const at = (A, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : A[y * W + x];
const pred = { isWater: (x, y) => at(WAT, x, y) === 1, isRock: (x, y) => at(ROCK, x, y) === 1, isForest: (x, y) => at(FOR, x, y) === 1, isOre: (x, y) => at(ORE, x, y) === 1 };
let land = 0, water = 0, rock = 0, forest = 0, oreN = 0, strmN = 0;
for (let i = 0; i < W * H; i++) { if (WAT[i]) water++; else if (ROCK[i]) rock++; else land++; if (FOR[i]) forest++; if (ORE[i]) oreN++; if (STRM[i]) strmN++; }

// ── 정본 상수 ──
const LR = 140, STEP = 4, HUNT0 = 40, HUNT1 = 130;
const OFF = [], HOFF = [];
for (let dy = -LR; dy <= LR; dy += STEP) for (let dx = -LR; dx <= LR; dx += STEP) {
  const d2 = dx * dx + dy * dy;
  if (d2 >= HUNT0 * HUNT0 && d2 <= HUNT1 * HUNT1) HOFF.push([dx, dy]);
  if (d2 <= LR * LR) OFF.push([dx, dy]);
}
const JOBS = ECON.JOBS || null;
const BV = ECON.BASE_VALUE || null;
const SRCE = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim.js'), 'utf8');
const numOf = (re, d) => { const m = SRCE.match(re); return m ? +m[1] : d; };
const C = {   // 정본 글자에서 읽는다(사본으로 적지 않는다 — 못 읽으면 멈춘다)
  base: { farmer: numOf(/farmer: \{\s*field: 'farming', output: 'food', base: ([\d.]+)/), fisher: numOf(/fisher: \{\s*field: 'fishing', output: 'fish', base: ([\d.]+)/),
    hunter: numOf(/hunter: \{[^]*?base: ([\d.]+)/), lumberjack: numOf(/lumberjack: \{\s*field: 'woodworking', output: 'wood', base: ([\d.]+)/), miner: numOf(/miner: \{[^]*?base: ([\d.]+)/) },
  cap: { farmer: numOf(/farmer:\s+Math\.floor\(s \* arable \* ([\d.]+)\)/), fisher: numOf(/fisher:\s+Math\.floor\(s \* v\.land\.water\s+\* ([\d.]+)\)/),
    hunter: numOf(/hunter:\s+Math\.floor\(s \* v\.land\.game\s+\* ([\d.]+)\)/), lumberjack: numOf(/lumberjack: Math\.floor\(s \* v\.land\.wood\s+\* ([\d.]+)\)/),
    miner: numOf(/miner:\s+Math\.floor\(s \* Math\.max\(v\.land\.ore[^)]*\) \* ([\d.]+)\)/) },
  value: { food: numOf(/^\s+food:\s+([\d.]+),\s+\/\/ 농부/m), fish: numOf(/^\s+fish:\s+([\d.]+),\s+\/\/ 어부/m), meat: numOf(/^\s+meat:\s+([\d.]+),/m),
    wood: numOf(/^\s+wood:\s+([\d.]+),\s+\/\/ 벌목/m), ore: numOf(/^\s+ore:\s+([\d.]+),\s+\/\/ 광부/m) },
  daily: numOf(/const DAILY_FOOD_CONSUMPTION = ([\d.]+)/),
};
for (const g of Object.values(C)) if (typeof g === 'object') for (const [k, v] of Object.entries(g)) if (!(v > 0)) { throw new Error(`정본 상수 못 읽음: ${k}`); }
if (!(C.daily > 0)) throw new Error('DAILY_FOOD_CONSUMPTION 못 읽음');

// ── 땅값 — 래스터 판(격자) ──
function nearestWater(cx, cy, maxR, A) {   // villages.js `nearestWaterDist` 와 같은 고리(18방)
  for (let r = 1; r <= maxR; r++) for (let a = 0; a < 360; a += 20) {
    const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
    if (at(A, Math.round(cx + ca * r), Math.round(cy + sa * r))) return r;
  }
  return maxR + 1;
}
let TERR_N = 2850;   // 아래 §검증에서 51 실영토 중앙값으로 바꾼다
function fieldVariant(cx, cy, R0, extraWater) {   // ★[T1173] 갈래 장 — 상자 EDT(prepareFert 그 상자) · `fertility.fertAt` 정본 식 + 산록 띠(켤 때만)
  const src = extraWater ? (x, y) => fertSrc(x, y) || extraWater(x, y) : fertSrc;
  const x0 = cx - R0, y0 = cy - R0, x1 = cx + R0, y1 = cy + R0;
  const WD = VL.maskEDT(src, x0, y0, x1, y1), RD = VL.maskEDT(pred.isRock, x0, y0, x1, y1);
  const FOOT = FERT_ADD.has('foot');
  return { at: (x, y) => {
    if (x < x0 || y < y0 || x > x1 || y > y1) return FERT.NEUTRAL;
    const blocked = at(WAT, x, y) === 1 || at(ROCK, x, y) === 1;
    let f = FERT.fertAt(WD.at(x, y), RD.at(x, y), woodyAt(x, y), blocked);
    if (FOOT && !blocked) { const dr = RD.at(x, y); if (dr >= FERT.ROCK_FULL / 2 && dr <= FERT.ROCK_FULL * 2) f = Math.min(1, f + FERT.W_ROCK); }
    return f; } };
}
function fertMean(cx, cy, extraWater) {
  const R0 = 62;
  const isW = extraWater ? (x, y) => at(WAT, x, y) === 1 || extraWater(x, y) : pred.isWater;
  const F = (FERT_CANON && !extraWater) || (FERT_CANON && extraWater) ? FERT.buildField({ isWater: isW, isRock: pred.isRock, isWoody: pred.isForest, maskEDT: VL.maskEDT }, cx - R0, cy - R0, cx + R0, cy + R0)
    : fieldVariant(cx, cy, R0, extraWater);
  const r = Math.sqrt(TERR_N / Math.PI);
  let s = 0, n = 0, tw = 0;
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const x = cx + dx, y = cy + dy;
    if (at(ROCK, x, y)) continue;   // 영토는 바위에 안 선다(원판 근사)
    n++; s += F.at(x, y); if (at(WAT, x, y) === 1 || (extraWater && extraWater(x, y))) tw++;   // ★[T1173] 경작 몫은 물 칸 전부를 뺀다(바다 칸도 밭이 아니다)
  }
  return { fert: n ? Math.max(0.1, Math.min(2.0, +((s / n) * 1.4).toFixed(2))) : 0.1, arable: n ? +((n - tw) / n).toFixed(2) : 1, tn: n };
}
function landRaster(cx, cy, add) {
  add = add || {};
  let rk = 0, fo = 0, or = 0, n = 0, hf = 0;
  for (const [dx, dy] of OFF) { const x = cx + dx, y = cy + dy; n++; if (at(ORE, x, y)) or++; if (at(ROCK, x, y)) rk++; else if (at(FOR, x, y) || (add.forest && add.forest(x, y))) fo++; }
  for (const [dx, dy] of HOFF) { const x = cx + dx, y = cy + dy; if (at(FOR, x, y) || (add.forest && add.forest(x, y))) hf++; }
  let rockD = rk / n, forD = fo / n, oreD = or / n + (add.oreShare || 0), huntD = HOFF.length ? hf / HOFF.length : 0;
  const nd = add.water ? Math.min(nearestWater(cx, cy, 140, WAT), add.waterNd != null ? add.waterNd : 999) : nearestWater(cx, cy, 140, WAT);
  const wv = Math.max(0.05, Math.min(1, 1 - nd / 140));
  const fm = fertMean(cx, cy, add.water || null);
  const LV = L.landOf({ forShare: forD, huntShare: huntD, rockShare: rockD, oreShare: oreD });
  const scan = S.scanLabor({ isForest: (x, y) => pred.isForest(x, y) || !!(add.forest && add.forest(x, y)), isWater: (x, y) => pred.isWater(x, y) || !!(add.water && add.water(x, y)), isRock: pred.isRock }, cx, cy);
  const sus = S.sustainOf(scan, LV.wood);
  let ore = LV.ore, special = 0;
  if (oreD > 0 && !add.oreShare) {   // `extractSustain` 그 차례 — 특수 산지(`specialOf`) 뒤 광맥 등급(`oreMix`)이 ore 와 광종 칸을 다시 쓴다
    const sp0 = {}; try { if (ta.oreMinerals) Object.assign(sp0, S.specialOf(ta.oreMinerals(cx, cy, S.LABOR_R), LV.ore)); } catch (e) {}
    try { if (ta.oreMix) { const m = ta.oreMix(cx, cy, S.LABOR_R); ore = +Math.max(0.05, Math.min(2.5, LV.ore * m.gradeMult)).toFixed(2);
      for (const [mn, k] of Object.entries(S.MINERAL_KEY)) if (m.mix[mn] != null) sp0[k] = +(m.mix[mn] * ore).toFixed(3); } } catch (e) {}
    special = Math.max(sp0.obsidian || 0, sp0.jade || 0, sp0.tin || 0);
  }
  return { fertility: fm.fert, arable: fm.arable, water: +(wv * 1.6).toFixed(2), wood: LV.wood, game: LV.game, stone: LV.stone, ore, special,
    size: Math.max(30, Math.round(TERR_N / 25)), woodSustain: sus.woodSustain, fishSustain: sus.fishSustain, nd, shares: { forD: +forD.toFixed(4), huntD: +huntD.toFixed(4), rockD: +rockD.toFixed(4), oreD: +oreD.toFixed(5) } };
}

// ── 축 판정(econ 정본 조각) ──
const AX = ['farm', 'hunt', 'wood', 'fish', 'mine'];
const AXL = { farm: 'a', hunt: 'h', wood: 'w', fish: 'f', mine: 'm' };   // 그림 · 표 글자(농사 a · 사냥 h · 숲 w · 고기잡이 f · 광업 m)
function axes(Lp, N) {
  const s = Lp.size;
  const o = {};
  const oreB = Math.max(Lp.ore || 0, Lp.special || 0);
  const row = (slots, base, boost, valRatio, cap) => { let out = Math.min(slots, N) * base * boost; if (cap != null && cap >= 0) out = Math.min(out, cap); return out * valRatio; };
  o.farm = row(Math.floor(s * Lp.arable * C.cap.farmer), C.base.farmer, Lp.fertility, C.value.food / C.value.food, null);   // 곡 = 식량 등가 1
  o.fish = row(Math.floor(s * Lp.water * C.cap.fisher), C.base.fisher, Lp.water, 1, Lp.fishSustain);                     // 생선 = 식량 등가 1(totalFoodEquivalent)
  o.hunt = row(Math.floor(s * Lp.game * C.cap.hunter), C.base.hunter, Lp.game, 1, null);                                 // 고기 = 식량 등가 1
  o.wood = row(Math.floor(s * Lp.wood * C.cap.lumberjack), C.base.lumberjack, Lp.wood, C.value.wood / C.value.food, Lp.woodSustain);   // 나무 → 교역 값으로 바꿔 먹기
  o.mine = row(Math.floor(s * oreB * C.cap.miner), C.base.miner, oreB, C.value.ore / C.value.food, null);                  // 원석 → 교역 값
  const need = N * C.daily;
  const pass = {}; for (const k of AX) pass[k] = o[k] >= need;
  return { out: o, pass, need };
}

// ── 후보 자리 · 정본 그대로(실영토) ──
const cands = T.siteCandidates(Z) || [];
const _l = console.log; console.log = () => {};
let seeded = [];
try { seeded = P.pickSeedVillages(cands, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 }) || []; } catch (e) { seeded = []; }
const seededNames = new Set(seeded.map((v) => v.name));
const sites = [];
for (const hv of cands) {
  const raw = { ccx: Math.round(hv.x / SZ), ccy: Math.round(hv.y / SZ) };
  const c = P.findOpenCenter(ta, raw.ccx, raw.ccy);
  if (!c) { sites.push({ name: hv.name, type: hv.type, cx: raw.ccx, cy: raw.ccy, skip: true }); continue; }
  let lp = null, tn = 0;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); const lay = VL.generate(ta, c.ccx, c.ccy, 8, {}); tn = lay.territory.length; lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, lay); } catch (e) { lp = null; }
  sites.push({ name: hv.name, type: hv.type, cx: c.ccx, cy: c.ccy, tn, seeded: seededNames.has(hv.name), lp });
}
console.log = _l;
const tns = sites.filter((s) => s.tn).map((s) => s.tn).sort((a, b) => a - b);
if (tns.length) TERR_N = tns[Math.floor(tns.length / 2)];
log(`후보 ${cands.length} · 시딩 ${seeded.length} · 실영토 중앙값 ${TERR_N}`);
// 검증 — 같은 자리 래스터 판 vs 정본 판
for (const s of sites) {
  if (!s.lp) continue;
  const rl = landRaster(s.cx, s.cy);
  s.raster = rl;
  const lpx = Object.assign({}, s.lp, { special: Math.max(s.lp.obsidian || 0, s.lp.jade || 0, s.lp.tin || 0), size: s.lp.size });
  s.axes20 = axes(lpx, 20); s.axes40 = axes(lpx, 40);
  s.axes20r = axes(rl, 20); s.axes40r = axes(rl, 40);
}
log('후보 자리 정본 · 래스터 판');

// ── 격자 ──
const g0 = Math.ceil(GRID / 2 / STEP) * STEP;
const cells = [];
for (let cy = g0; cy < H; cy += GRID) for (let cx = g0; cx < W; cx += GRID) {
  const i = cy * W + cx;
  if (WAT[i] || ROCK[i]) { cells.push({ cx, cy, k: WAT[i] ? 'w' : 'r' }); continue; }
  const lp = landRaster(cx, cy);
  const a20 = axes(lp, 20), a40 = axes(lp, 40);
  cells.push({ cx, cy, k: 'l', fe: lp.fertility, nd: lp.nd, lp: { fertility: lp.fertility, arable: lp.arable, water: lp.water, wood: lp.wood, game: lp.game, stone: lp.stone, ore: lp.ore, special: lp.special, nd: lp.nd, fS: lp.fishSustain, wS: lp.woodSustain },
    o20: a20.out, p20: a20.pass, p40: a40.pass });
}
log(`격자 ${cells.length}칸 (뭍 ${cells.filter((c) => c.k === 'l').length})`);

// ── 추가 추정 ①②③(빈 자리만 · 누적) ──
//   ① 지류: 가장 가까운 물이 d 셀이 되게 1~2셀 내천이 지난다고 본다(그 길이 = 노동권 원판을 가르는 곧은 물줄기 · 폭 2셀) — d ∈ {20, 40}.
//   ② 자잘한 숲: 반경 r_f 셀 숲 하나가 노동권 안(중심에서 60셀 — 영토 밖)에 선다 — r_f ∈ {30, 62}(sw4 숲 1단계 반경 2,000px = 62셀).
//   ③ 자잘 광맥: 광맥 몫 0.25%(livelihood 주석의 '자잘' 등급) — 등급 1(평균).
function addStream(cx, cy, d) {   // 중심에서 d 셀 떨어진 동서 곧은 내천(폭 2) — 물 래스터에 겹쳐 본다
  const y0 = cy + d;
  return { water: (x, y) => (y === y0 || y === y0 + 1) && Math.abs(x - cx) <= 160, waterNd: d };
}
function addForest(cx, cy, rf) { const fx = cx + 60, fy = cy; return { forest: (x, y) => ((x - fx) * (x - fx) + (y - fy) * (y - fy)) <= rf * rf }; }
const SCEN = [
  { id: 's20', label: '① 지류 20셀', mk: (c) => addStream(c.cx, c.cy, 20) },
  { id: 's20f62', label: '①+② 지류 20 + 숲 r62', mk: (c) => Object.assign(addStream(c.cx, c.cy, 20), addForest(c.cx, c.cy, 62)) },
  { id: 's20f62o', label: '①+②+③ + 자잘 광맥', mk: (c) => Object.assign(addStream(c.cx, c.cy, 20), addForest(c.cx, c.cy, 62), { oreShare: 0.0025 }) },
  { id: 's40', label: '① 지류 40셀', mk: (c) => addStream(c.cx, c.cy, 40) },
  { id: 'strm', label: '①′ 있는 개울(T585)을 물로 센다', mk: (c) => ({ water: (x, y) => at(STRM, x, y) === 1, waterNd: nearestWater(c.cx, c.cy, 140, STRM) }) },
  { id: 'f62', label: '② 숲 r62 만', mk: (c) => addForest(c.cx, c.cy, 62) },
  { id: 'f30', label: '② 숲 r30 만', mk: (c) => addForest(c.cx, c.cy, 30) },
  { id: 'o', label: '③ 자잘 광맥 만', mk: () => ({ oreShare: 0.0025 }) },
];
const empty20 = NOSCEN ? [] : cells.filter((c) => c.k === 'l' && !AX.some((k) => c.p20[k]));
for (const c of empty20) {
  c.fix = {};
  for (const sc of SCEN) { const lp = landRaster(c.cx, c.cy, sc.mk(c)); const a = axes(lp, 20); c.fix[sc.id] = AX.filter((k) => a.pass[k]); }
}
log(`빈 자리 ${empty20.length} 추정`);

// ── 거리 — 코스 격자 BFS(`_distMatrixGen` 과 같은 규칙) ──
const DS = 4, gw = Math.ceil(W / DS), gh = Math.ceil(H / DS), half = DS >> 1;
const blk = new Int8Array(gw * gh);
const isBlk = (gx, gy) => {
  if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return true;
  const i = gy * gw + gx;
  if (blk[i] === 0) {
    let v = 0; const bx = gx * DS, by = gy * DS;
    if (!ta.isBlocked(bx + half, by + half)) v = 1;
    else if (ta.isBridgeCell) { for (let dy = 0; dy < DS && !v; dy++) for (let dx = 0; dx < DS; dx++) if (ta.isBridgeCell(bx + dx, by + dy) && !ta.isBlocked(bx + dx, by + dy)) { v = 2; break; } }
    blk[i] = v ? 1 : 2;
  }
  return blk[i] === 2;
};
function nodeOf(cx, cy) {
  const gx0 = Math.min(gw - 1, Math.max(0, Math.round(cx / DS))), gy0 = Math.min(gh - 1, Math.max(0, Math.round(cy / DS)));
  if (!isBlk(gx0, gy0)) return gy0 * gw + gx0;
  for (let r = 1; r <= 6; r++) for (let a = 0; a < 16; a++) { const nx = Math.round(gx0 + Math.cos(a / 16 * 2 * Math.PI) * r), ny = Math.round(gy0 + Math.sin(a / 16 * 2 * Math.PI) * r); if (nx >= 0 && ny >= 0 && nx < gw && ny < gh && !isBlk(nx, ny)) return ny * gw + nx; }
  return -1;
}
const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
function distMatrix(pts) {   // 셀 거리(코스 BFS 비용 /10 × 4)
  const M = pts.length, src = pts.map((p) => nodeOf(p.cx, p.cy));
  const mat = pts.map(() => new Array(M).fill(Infinity)); for (let i = 0; i < M; i++) mat[i][i] = 0;
  const dist = new Int32Array(gw * gh);
  for (let s = 0; s < M; s++) {
    if (src[s] < 0) continue;
    const tg = new Map(); let rem = 0;
    for (let j = s + 1; j < M; j++) if (src[j] >= 0) { (tg.get(src[j]) || tg.set(src[j], []).get(src[j])).push(j); rem++; }
    if (!rem) continue;
    dist.fill(-1); dist[src[s]] = 0; const B = [[src[s]]];
    for (let c = 0; c < B.length && rem > 0; c++) { const q = B[c]; if (!q) continue;
      for (const i of q) { if (dist[i] !== c) continue;
        const t = tg.get(i); if (t) { for (const j of t) { mat[s][j] = mat[j][s] = (c / 10) * DS; rem--; } tg.delete(i); if (!rem) break; }
        const x = i % gw, y = (i / gw) | 0;
        for (const [dx, dy, w] of DIRS) { const nx = x + dx, ny = y + dy; if (isBlk(nx, ny)) continue; if (dx && dy && (isBlk(x + dx, y) || isBlk(x, y + dy))) continue;
          const ni = ny * gw + nx, nc = c + w; if (dist[ni] < 0 || nc < dist[ni]) { dist[ni] = nc; (B[nc] || (B[nc] = [])).push(ni); } } }
      B[c] = null; }
  }
  return mat;
}
// 이웃 셈 — 4일: T474 몸 걸음(7,200 econ/일 = 2,880셀/일) · 종전 500 econ/일(200셀/일) — econ 정본 수에서
const V2 = fs.readFileSync(path.join(__dirname, '..', 'sim', 'economy-sim-v2.js'), 'utf8');
let walkEcon = null; try { walkEcon = R('sim/economy-sim-v2').caravanWalkPerDay ? R('sim/economy-sim-v2').caravanWalkPerDay() : null; } catch (e) { walkEcon = null; }
if (!walkEcon) { const MM = R('public/move-model'); const WD = R('server/zone-config').WORLD; walkEcon = MM.DEFAULTS.baseSpeed * (WD.dayLengthMs / 1000) * 2.5 / WD.tileSize; }
const npcSpeed = +((V2.match(/const NPC_SPEED = (\d+)/) || [])[1] || 500);
const DAYS = 4;
const REACH = { walk: DAYS * walkEcon / 2.5, old: DAYS * npcSpeed / 2.5 };   // 셀
function nbStats(pts, mat) {
  const rows = pts.map((p, i) => {
    const d = mat[i].map((x, j) => (j === i ? Infinity : x));
    const fin = d.filter((x) => isFinite(x));
    return { name: p.name, nn: fin.length ? Math.min(...fin) : null, nWalk: d.filter((x) => x <= REACH.walk).length, nOld: d.filter((x) => x <= REACH.old).length, unreach: d.filter((x, j) => j !== i && !isFinite(x)).length };
  });
  const st = (a) => { const v = a.filter((x) => x != null && isFinite(x)); const m = v.reduce((s, x) => s + x, 0) / (v.length || 1); const sd = Math.sqrt(v.reduce((s, x) => s + (x - m) * (x - m), 0) / (v.length || 1)); return { n: v.length, mean: +m.toFixed(2), sd: +sd.toFixed(2), cv: m ? +(sd / m).toFixed(3) : null, min: v.length ? Math.min(...v) : null, max: v.length ? Math.max(...v) : null }; };
  return { rows, nn: st(rows.map((r) => r.nn)), nWalk: st(rows.map((r) => r.nWalk)), nOld: st(rows.map((r) => r.nOld)), loners: rows.filter((r) => r.nOld === 0).map((r) => r.name) };
}
const live = sites.filter((s) => !s.skip && s.seeded);
const matLive = distMatrix(live);
const nbLive = nbStats(live, matLive);
log(`거리 행렬 ${live.length}`);
let routeCache = null;
if (Z === 'hanbando') {
  try {
    const dir = '/tmp/durango-route-cache'; const f = fs.readdirSync(dir).find((n) => n.startsWith('routes_hanbando_'));
    if (f) { const arr = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); routeCache = { file: f, n: arr.length, len: {} };
      for (const [k, pts] of arr) { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); routeCache.len[k] = +(s / SZ).toFixed(1); } }
  } catch (e) { routeCache = { err: String(e.message) }; }
}

// ── 자리 고르기 규칙 초안 — 생업 하나 이상(N=20) · 외톨이(4일 종전 이웃 0)면 자급 축 둘 · 같은 수만큼 · 가장 먼 점 고르기(코스 BFS 거리) ──
function pickRule(nWant) {
  const viable = cells.filter((c) => c.k === 'l' && AX.some((k) => c.p20[k]));
  const score = (c) => AX.filter((k) => c.p20[k]).length + AX.filter((k) => c.p40[k]).length * 0.5;
  // 시작: 지금 살아 있는 마을 중 생업 있는 자리(바뀜 최소) — 그다음 빈 자리 채우기는 가장 먼 점
  const picked = [];
  const viableSet = viable.slice().sort((a, b) => score(b) - score(a) || a.cy - b.cy || a.cx - b.cx);
  const dmin = (c) => { let m = Infinity; for (const p of picked) { const d = Math.hypot(p.cx - c.cx, p.cy - c.cy); if (d < m) m = d; } return m; };
  // 곧은 거리 간격 문턱을 이분 — nWant 개가 나오는 가장 큰 간격
  let lo = 50, hi = 2000, best = null;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2; picked.length = 0;
    for (const c of viableSet) if (dmin(c) >= mid) picked.push(c);
    if (picked.length >= nWant) { lo = mid; best = { gap: mid, pts: picked.slice(0, nWant) }; } else hi = mid;
  }
  if (!best) return null;
  const pts = best.pts.map((c, i) => ({ name: `규칙${i + 1}`, cx: c.cx, cy: c.cy, axes: AX.filter((k) => c.p20[k]) }));
  const mat = distMatrix(pts);
  return { gapCells: Math.round(best.gap), pts, nb: nbStats(pts, mat), viable: viable.length };
}
const rule = pickRule(live.length);
log('규칙 초안');

const landCells = cells.filter((c) => c.k === 'l');
const emptyShare = (key) => landCells.length ? +(landCells.filter((c) => !AX.some((k) => c[key][k])).length / landCells.length).toFixed(4) : null;
const axisShare = (key) => { const o = {}; for (const k of AX) o[k] = +(landCells.filter((c) => c[key][k]).length / landCells.length).toFixed(4); return o; };
const scenShare = {};
for (const sc of SCEN) { const still = empty20.filter((c) => !c.fix[sc.id].length).length; scenShare[sc.id] = { label: sc.label, emptyAfter: +(still / landCells.length).toFixed(4), rescued: empty20.length - still }; }
// 지역별(존을 세로 4 · 가로 2 = 8 칸)
const regions = {};
for (const c of landCells) { const rx = c.cx < W / 2 ? '서' : '동', ry = ['북', '중북', '중남', '남'][Math.min(3, Math.floor(c.cy / (H / 4)))]; const k = ry + rx; const r = regions[k] || (regions[k] = { n: 0, e20: 0, e40: 0 }); r.n++; if (!AX.some((a) => c.p20[a])) r.e20++; if (!AX.some((a) => c.p40[a])) r.e40++; }
const res = {
  zone: Z, displayName: ZONE.displayName, made: new Date().toISOString().slice(0, 10), grid: GRID, cells: { W, H, land, water, rock, forest, ore: oreN, stream: strmN },
  constants: C, terrN: TERR_N, reach: REACH, walkEcon, npcSpeed,
  empty: { n20: emptyShare('p20'), n40: emptyShare('p40') }, axisShare: { n20: axisShare('p20'), n40: axisShare('p40') }, regions, scen: scenShare,
  sites: sites.map((s) => ({ name: s.name, type: s.type, cx: s.cx, cy: s.cy, tn: s.tn, seeded: !!s.seeded, skip: !!s.skip,
    lp: s.lp ? { fertility: s.lp.fertility, arable: s.lp.arable, water: s.lp.water, wood: s.lp.wood, game: s.lp.game, stone: s.lp.stone, ore: s.lp.ore, obsidian: s.lp.obsidian, jade: s.lp.jade, tin: s.lp.tin, size: s.lp.size, woodSustain: s.lp.woodSustain, fishSustain: s.lp.fishSustain } : null,
    raster: s.raster ? { fertility: s.raster.fertility, arable: s.raster.arable, water: s.raster.water, wood: s.raster.wood, game: s.raster.game, ore: s.raster.ore, special: s.raster.special, fS: s.raster.fishSustain, wS: s.raster.woodSustain } : null,
    a20: s.axes20 ? AX.filter((k) => s.axes20.pass[k]) : null, a40: s.axes40 ? AX.filter((k) => s.axes40.pass[k]) : null, o20: s.axes20 ? s.axes20.out : null,
    a20r: s.axes20r ? AX.filter((k) => s.axes20r.pass[k]) : null })),
  nbLive, routeCache: routeCache ? { file: routeCache.file, n: routeCache.n, len: routeCache.len } : null, liveNames: live.map((s) => s.name), matLive: matLive.map((r) => r.map((d) => (isFinite(d) ? Math.round(d) : null))),
  rule, fertMode: FERT_MODE, fertAdd: [...FERT_ADD], fertCanon: FERT_CANON, cellsOut: cells.map((c) => c.k === 'l' ? [c.cx, c.cy, AX.map((k) => (c.p20[k] ? 1 : 0) + (c.p40[k] ? 1 : 0)).join(''), c.fix ? SCEN.map((s) => c.fix[s.id].map((k) => AXL[k]).join('') || '-').join(',') : '', c.fe, c.nd] : [c.cx, c.cy, c.k]),
  scenIds: SCEN.map((s) => s.id), sec: Math.round((Date.now() - t0) / 1000),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(res));
log(`끝 → ${OUT}`);
