#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1153 표 기계 · 제품 무변 · 읽기만)
// =============================================================================
// T1178 — 비옥도를 안 올리고 내륙을 살리는 길 둘: 밭작물(물 덜 먹는 작물) · 들판의 사냥감 · 자리 규칙 다시.
//   T1153 계측기(`scripts/t1153-terrain-census.js`)를 그대로 떠 와서(래스터 · 땅값 · 축 판정 · 거리 · 규칙 — 같은 자) 갈래만 얹었다.
//   제품 무변 · 읽기만 · 러너 밖.
//
//   갈래(셀마다 · 같은 격자):
//     물 바탕   now = 지금 정본(큰 물 전부) · sea = 바다 뺌(★재민 11-04 확정 — 해안선 띠 ∖ 강·호수 를 비옥도 물에서 뺀다 · 경작 불가는 그대로)
//     농사      rice = 지금 econ(비옥도 물 항 0.62·e^(−dw/80) = 논 곡선) · crop = ⓐ 작물마다 "비옥도 × 작물 물 맞음"
//                 물 맞음 m_c: 논 작물 = e(지금 곡선 그대로) · 밭 작물 = crops.waterMult(c, 공급) · 공급 = 1 + 4e
//                   (공급 눈금 1 ~ 5 의 양 끝 = villages.js 생활 층 `supply: 밭 1 · 논 5` · e = 지금 물 항의 몫 0 ~ 1 — 새 수 0)
//                 셀 비옥도_c = 지금 셀 값 − 0.62e + 0.62·m_c (다른 항 그대로) → 영토 평균 × 1.4(지금 그 꼴)
//                 농사 값 = 비옥도_c × Y_c · Y_c = 수확량 × kcal ÷ 벼의 그것(crops.json 표 — 지금 econ = 벼 = 1)
//                 작물 = 청동기 출토 확인 · 조건부 곡물 · 콩류 9(설계/고증_작물.md) — 들깨(기름) 뺌
//     사냥      now = 지금(사냥 띠 숲 몫) · field1 = ⓑ 들판(뭍 · 숲 아님 · 물에서 140셀 밖)을 숲과 같은 사냥터로 셈(r = 1)
//                 · field05 = 민감도(r = 0.5) — r 의 근거 = 고라니 저지 6.93 · 산지 1.91 마리/km²(보고 §2)
//   보고 첫 줄 판: 지금 · 바다 뺌 · ⓐ · ⓑ · ⓒ(ⓐ+ⓑ+작물 고르기) — 빈 땅 % · 축 몫 · 물가 대 내륙 · 마을 작물 표 · 자리 규칙(다섯 축).
//
// 쓰는 법: node scripts/t1178-dryland.js <zone> <out.json> [--grid 32]
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `${process.env.TMPDIR || '/tmp'}/t1178-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando';
const OUT = process.argv[3] || `${process.env.TMPDIR || '/tmp'}/t1178/${Z}.json`;
const GRID = (() => { const i = process.argv.indexOf('--grid'); return i >= 0 ? (+process.argv[i + 1] || 32) : 32; })();
const t0 = Date.now();
const log = (...a) => process.stderr.write(`[t1178 ${Z} ${((Date.now() - t0) / 1000).toFixed(0)}s] ${a.join(' ')}\n`);

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

// ── 셀 래스터(정본 술어를 한 번 굽는다) ──
const W = Math.ceil(ZONE.zoneWidth / SZ), H = Math.ceil(ZONE.zoneHeight / SZ);
const WAT = new Uint8Array(W * H), ROCK = new Uint8Array(W * H), FOR = new Uint8Array(W * H), ORE = new Uint8Array(W * H), SEA = new Uint8Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x;
  if (ta.isWater(x, y)) WAT[i] = 1;
  if (ta.isRock(x, y)) ROCK[i] = 1;
  if (ta.forestMult(x, y) > 1.2) FOR[i] = 1;
  if (ta.isOre && ta.isOre(x, y)) ORE[i] = 1;
  // 바다 = zone.js `isSeaTileLocal` 그 뜻 — 해안선 띠 칸 ∖ 강·호수가 겹친 칸(강어귀는 민물)
  if (WAT[i] && BAND && BAND.has(`${x}_${y}`)) { let fresh = false; try { fresh = !!T.isWaterCellLocal(Z, x * SZ + SZ / 2, y * SZ + SZ / 2); } catch (e) {} if (!fresh) SEA[i] = 1; }
}
const at = (A, x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : A[y * W + x];
const pred = { isWater: (x, y) => at(WAT, x, y) === 1, isRock: (x, y) => at(ROCK, x, y) === 1, isForest: (x, y) => at(FOR, x, y) === 1, isOre: (x, y) => at(ORE, x, y) === 1 };
const isFresh = (x, y) => at(WAT, x, y) === 1 && at(SEA, x, y) === 0;
let land = 0, water = 0, rock = 0, forest = 0, oreN = 0, seaN = 0;
for (let i = 0; i < W * H; i++) { if (WAT[i]) water++; else if (ROCK[i]) rock++; else land++; if (FOR[i]) forest++; if (ORE[i]) oreN++; if (SEA[i]) seaN++; }
log(`래스터 ${W}×${H} · 물 ${water} · 그중 바다 ${seaN}`);
// 들판 = 뭍 · 숲 아님 · 바위 아님 · 가장 가까운 물(큰 물 전부)이 140셀(물 땅값 고리 LR) 밖 — "정말 아무것도 없는 곳"(★재민 11-05)
const DWZ = VL.maskEDT(pred.isWater, 0, 0, W - 1, H - 1);
const FIELD = new Uint8Array(W * H);
let fieldN = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!WAT[i] && !ROCK[i] && !FOR[i] && DWZ.at(x, y) > 140) { FIELD[i] = 1; fieldN++; } }
log(`들판 칸 ${fieldN} (뭍의 ${(fieldN / land * 100).toFixed(1)}%)`);

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

// ── 작물(ⓐ) — crops.json 표 · crops.waterMult 정본 ──
const CR = R('server/crops'), CJ = R('server/crops.json').crops;
const CROP_IDS = ['rice', 'barley', 'wheat', 'foxtail_millet', 'millet', 'sorghum', 'barnyard_millet', 'soybean', 'azuki'];   // 설계/고증_작물.md 출토 확인 9 + 조건부 1(팥) − 들깨
const CROPS = CROP_IDS.map((id) => { const c = CJ[id]; if (!c) throw new Error('작물 없음 ' + id); return { id, ko: c.ko, field: c.field, water: c.water, care: c.care, yield: c.yield, kcal: c.kcal, paddyOnly: c.field === '논' }; });
const RICE = CROPS.find((c) => c.id === 'rice');
for (const c of CROPS) c.Y = +(c.yield * c.kcal / (RICE.yield * RICE.kcal)).toFixed(4);
const ALPHA = 0.5;   // seaH 갈래만 — 물 항 가운데 '흙(충적토)' 몫 · 출처 없음(민감도)
const SUP_LO = 1, SUP_HI = 5;   // villages.js `harvestUnits(e.c, { supply: 밭 1 · 논 5 })` 의 양 끝
const mOf = (c, e) => c.paddyOnly ? e : Math.max(e, CR.waterMult(c.id, SUP_LO + (SUP_HI - SUP_LO) * e));

// ── 땅값 — 래스터 판(격자) ──
function nearestWater(cx, cy, maxR, A) {   // villages.js `nearestWaterDist` 와 같은 고리(18방)
  for (let r = 1; r <= maxR; r++) for (let a = 0; a < 360; a += 20) {
    const ca = Math.cos(a * Math.PI / 180), sa = Math.sin(a * Math.PI / 180);
    if (at(A, Math.round(cx + ca * r), Math.round(cy + sa * r))) return r;
  }
  return maxR + 1;
}
let TERR_N = 2850;   // 아래에서 51 실영토 중앙값으로 바꾼다(T1153 그 길)
const WB = ['now', 'sea', 'seaH'];   // seaH = 바다 뺌 + 물 항의 절반을 흙(충적) 몫으로 남김(α = 0.5 · 출처 없는 민감도 — 판정 칸)
let REST_N = 0, REST_BAD = 0;
const FW = FERT.W_WATER, FD = FERT.DECAY;
// 비옥도 — 지금 셀 값(정본 buildField)에서 물 항만 작물 · 물 바탕마다 갈아 끼운다
function fertCrops(cx, cy) {
  const R0 = 62, x0 = cx - R0, y0 = cy - R0, x1 = cx + R0, y1 = cy + R0;
  const F = FERT.buildField({ isWater: pred.isWater, isRock: pred.isRock, isWoody: pred.isForest, maskEDT: VL.maskEDT }, x0, y0, x1, y1);
  const WD = VL.maskEDT(pred.isWater, x0, y0, x1, y1);
  const WS = seaN ? VL.maskEDT(isFresh, x0, y0, x1, y1) : WD;
  const r = Math.sqrt(TERR_N / Math.PI), rc = Math.ceil(r);
  const sum = { now: new Float64Array(CROPS.length), sea: new Float64Array(CROPS.length), seaH: new Float64Array(CROPS.length) };
  let n = 0, tw = 0, s0 = 0, eSum = { now: 0, sea: 0 };
  for (let dy = -rc; dy <= rc; dy++) for (let dx = -rc; dx <= rc; dx++) {
    if (dx * dx + dy * dy > r * r) continue;
    const x = cx + dx, y = cy + dy;
    if (at(ROCK, x, y)) continue;   // 영토는 바위에 안 선다(원판 근사 — T1153 그대로)
    n++;
    const v = F.at(x, y); s0 += v;
    if (at(WAT, x, y)) { tw++; for (const b of WB) for (let k = 0; k < CROPS.length; k++) sum[b][k] += FERT.BLOCKED; continue; }
    const eN = Math.exp(-Math.min(WD.at(x, y), 999) / FD), eS = Math.exp(-Math.min(WS.at(x, y), 999) / FD);
    const rest = v - FW * eN;
    if (rest < FERT.BASE - 1e-6 || rest > FERT.BASE + FERT.W_ROCK + FERT.W_WOODY + 1e-6) REST_BAD++;   // 물 항을 뺀 나머지 = 0.12 + 0.18·바위 + 0.08·숲 이어야 한다(EDT 가 정본과 같은지)
    REST_N++;
    eSum.now += eN; eSum.sea += eS;
    for (let k = 0; k < CROPS.length; k++) {
      sum.now[k] += Math.max(FERT.BLOCKED, Math.min(1, rest + FW * mOf(CROPS[k], eN)));
      sum.sea[k] += Math.max(FERT.BLOCKED, Math.min(1, rest + FW * mOf(CROPS[k], eS)));
      sum.seaH[k] += Math.max(FERT.BLOCKED, Math.min(1, rest + FW * (ALPHA * eS + (1 - ALPHA) * mOf(CROPS[k], eS))));
    }
  }
  const fin = (s) => n ? Math.max(0.1, Math.min(2.0, +((s / n) * 1.4).toFixed(2))) : 0.1;
  const fert = { now: {}, sea: {}, seaH: {} };
  for (const b of WB) for (let k = 0; k < CROPS.length; k++) fert[b][CROPS[k].id] = fin(sum[b][k]);
  return { fert, fert0: fin(s0), arable: n ? +((n - tw) / n).toFixed(2) : 1, tn: n, eMean: { now: n ? eSum.now / n : 0, sea: n ? eSum.sea / n : 0 } };
}
// 농사 값(비옥도 × Y) — 벼만(지금 econ) · 작물 전부(ⓐ) — 가장 큰 것
function farmPick(fc, b, all) {
  let best = null;
  for (const c of CROPS) { if (!all && c.id !== 'rice') continue; const v = fc.fert[b][c.id] * c.Y; if (!best || v > best.v) best = { id: c.id, v: +v.toFixed(3), fert: fc.fert[b][c.id] }; }
  return best;
}
function landRaster(cx, cy) {
  let rk = 0, fo = 0, or = 0, n = 0, hf = 0, hfield = 0;
  for (const [dx, dy] of OFF) { const x = cx + dx, y = cy + dy; n++; if (at(ORE, x, y)) or++; if (at(ROCK, x, y)) rk++; else if (at(FOR, x, y)) fo++; }
  for (const [dx, dy] of HOFF) { const x = cx + dx, y = cy + dy; if (at(FOR, x, y)) hf++; else if (at(FIELD, x, y)) hfield++; }
  const rockD = rk / n, forD = fo / n, oreD = or / n, huntD = HOFF.length ? hf / HOFF.length : 0, fieldD = HOFF.length ? hfield / HOFF.length : 0;
  const nd = nearestWater(cx, cy, 140, WAT);
  const wv = Math.max(0.05, Math.min(1, 1 - nd / 140));
  const fc = fertCrops(cx, cy);
  const LV = L.landOf({ forShare: forD, huntShare: huntD, rockShare: rockD, oreShare: oreD });
  const game = {
    now: LV.game,
    field1: L.landOf({ forShare: forD, huntShare: Math.min(1, huntD + 1.0 * fieldD), rockShare: rockD, oreShare: oreD }).game,
    field05: L.landOf({ forShare: forD, huntShare: Math.min(1, huntD + 0.5 * fieldD), rockShare: rockD, oreShare: oreD }).game,
  };
  const scan = S.scanLabor({ isForest: pred.isForest, isWater: pred.isWater, isRock: pred.isRock }, cx, cy);
  const sus = S.sustainOf(scan, LV.wood);
  let ore = LV.ore, special = 0;
  if (oreD > 0) {   // `extractSustain` 그 차례(T1153 그대로)
    const sp0 = {}; try { if (ta.oreMinerals) Object.assign(sp0, S.specialOf(ta.oreMinerals(cx, cy, S.LABOR_R), LV.ore)); } catch (e) {}
    try { if (ta.oreMix) { const m = ta.oreMix(cx, cy, S.LABOR_R); ore = +Math.max(0.05, Math.min(2.5, LV.ore * m.gradeMult)).toFixed(2);
      for (const [mn, k] of Object.entries(S.MINERAL_KEY)) if (m.mix[mn] != null) sp0[k] = +(m.mix[mn] * ore).toFixed(3); } } catch (e) {}
    special = Math.max(sp0.obsidian || 0, sp0.jade || 0, sp0.tin || 0);
  }
  return { fc, fertility: fc.fert.now.rice, fert0: fc.fert0, arable: fc.arable, water: +(wv * 1.6).toFixed(2), wood: LV.wood, game, stone: LV.stone, ore, special,
    size: Math.max(30, Math.round(TERR_N / 25)), woodSustain: sus.woodSustain, fishSustain: sus.fishSustain, nd, shares: { forD, huntD, fieldD, rockD, oreD } };
}

// ── 축 판정(econ 정본 조각 — T1153 그대로 · 농사 값 · 사냥감만 갈래) ──
const AX = ['farm', 'hunt', 'wood', 'fish', 'mine'];
const AXL = { farm: 'a', hunt: 'h', wood: 'w', fish: 'f', mine: 'm' };
function axes(Lp, N, farmVal, game) {
  const s = Lp.size, o = {};
  const oreB = Math.max(Lp.ore || 0, Lp.special || 0);
  const row = (slots, base, boost, valRatio, cap) => { let out = Math.min(slots, N) * base * boost; if (cap != null && cap >= 0) out = Math.min(out, cap); return out * valRatio; };
  o.farm = row(Math.floor(s * Lp.arable * C.cap.farmer), C.base.farmer, farmVal, 1, null);
  o.fish = row(Math.floor(s * Lp.water * C.cap.fisher), C.base.fisher, Lp.water, 1, Lp.fishSustain);
  o.hunt = row(Math.floor(s * game * C.cap.hunter), C.base.hunter, game, 1, null);
  o.wood = row(Math.floor(s * Lp.wood * C.cap.lumberjack), C.base.lumberjack, Lp.wood, C.value.wood / C.value.food, Lp.woodSustain);
  o.mine = row(Math.floor(s * oreB * C.cap.miner), C.base.miner, oreB, C.value.ore / C.value.food, null);
  const need = N * C.daily, pass = {};
  for (const k of AX) pass[k] = o[k] >= need;
  return { out: o, pass, need };
}
// 판(보고 이름) — 물 바탕 × 농사 × 사냥
const PLANS = [
  { id: 'base', label: '지금(T1153 자)', wb: 'now', crop: false, hunt: 'now' },
  { id: 'sea', label: '바다 뺌', wb: 'sea', crop: false, hunt: 'now' },
  { id: 'A0', label: 'ⓐ 밭작물(지금 물)', wb: 'now', crop: true, hunt: 'now' },
  { id: 'A', label: 'ⓐ 밭작물(바다 뺌)', wb: 'sea', crop: true, hunt: 'now' },
  { id: 'AH', label: 'ⓐ′ 밭작물 · 물 항 절반은 흙 몫(α=0.5 민감도 · 바다 뺌)', wb: 'seaH', crop: true, hunt: 'now' },
  { id: 'B', label: 'ⓑ 들판 r=1(바다 뺌)', wb: 'sea', crop: false, hunt: 'field1' },
  { id: 'B05', label: 'ⓑ 들판 r=0.5(바다 뺌)', wb: 'sea', crop: false, hunt: 'field05' },
  { id: 'C', label: 'ⓒ 둘 다 + 작물 고르기(바다 뺌)', wb: 'sea', crop: true, hunt: 'field1' },
  { id: 'C05', label: 'ⓒ r=0.5(바다 뺌)', wb: 'sea', crop: true, hunt: 'field05' },
  { id: 'CH', label: 'ⓒ′ α=0.5 + 들판 r=1(바다 뺌)', wb: 'seaH', crop: true, hunt: 'field1' },
  { id: 'C0', label: 'ⓒ(지금 물)', wb: 'now', crop: true, hunt: 'field1' },
];
function judge(lp, N) {
  const o = {};
  for (const pl of PLANS) { const fp = farmPick(lp.fc, pl.wb, pl.crop); const a = axes(lp, N, fp.v, lp.game[pl.hunt]); o[pl.id] = { pass: AX.filter((k) => a.pass[k]), crop: fp.id, farmV: fp.v, out: a.out }; }
  return o;
}

// ── 후보 자리(T1153 그대로 — 실영토는 넓이 중앙값만 쓰고, 축 판정은 래스터 판) ──
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
  let tn = 0;
  try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); const lay = VL.generate(ta, c.ccx, c.ccy, 8, {}); tn = lay.territory.length; } catch (e) { tn = 0; }
  sites.push({ name: hv.name, type: hv.type, cx: c.ccx, cy: c.ccy, tn, seeded: seededNames.has(hv.name) });
}
console.log = _l;
const tns = sites.filter((s) => s.tn).map((s) => s.tn).sort((a, b) => a - b);
if (tns.length) TERR_N = tns[Math.floor(tns.length / 2)];
log(`후보 ${cands.length} · 시딩 ${seeded.length} · 실영토 중앙값 ${TERR_N}`);
// 자 맞춤 — 지금 판 벼 비옥도가 T1153 `fertMean`(정본 buildField 그대로) 과 같은가: 작물 셀 식의 rice·now 는 지금 셀 값으로 돌아와야 한다
let chkN = 0, chkBad = 0;
for (const s of sites) {
  if (s.skip) continue;
  const rl = landRaster(s.cx, s.cy);
  s.raster = rl; s.j20 = judge(rl, 20); s.j40 = judge(rl, 40);
  chkN++; if (Math.abs(rl.fert0 - rl.fc.fert.now.rice) > 0.011) chkBad++;
}
log(`후보 자리 래스터 판 · 자 맞춤 벼(지금) = 정본 셀 값 ${chkN - chkBad}/${chkN}`);
log(`물 항 뺀 나머지 범위 밖 ${REST_BAD}/${REST_N}`);
if (chkBad || REST_BAD) throw new Error('자 맞춤 실패 — 작물 셀 식이 지금 비옥도로 안 돌아온다');

// ── 격자 ──
const g0 = Math.ceil(GRID / 2 / STEP) * STEP;
const cells = [];
for (let cy = g0; cy < H; cy += GRID) for (let cx = g0; cx < W; cx += GRID) {
  const i = cy * W + cx;
  if (WAT[i] || ROCK[i]) { cells.push({ cx, cy, k: WAT[i] ? 'w' : 'r' }); continue; }
  const lp = landRaster(cx, cy);
  const j20 = judge(lp, 20), j40 = judge(lp, 40);
  cells.push({ cx, cy, k: 'l', nd: lp.nd, fieldD: +lp.shares.fieldD.toFixed(3), game: lp.game, fert: lp.fertility,
    fv: Object.fromEntries(PLANS.map((p) => [p.id, j20[p.id].farmV])), crop: Object.fromEntries(PLANS.map((p) => [p.id, j20[p.id].crop])),
    p20: Object.fromEntries(PLANS.map((p) => [p.id, j20[p.id].pass])), p40: Object.fromEntries(PLANS.map((p) => [p.id, j40[p.id].pass])) });
}
const landCells = cells.filter((c) => c.k === 'l');
log(`격자 ${cells.length}칸 (뭍 ${landCells.length})`);

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

// ── 자리 고르기 규칙(T1153 §4 초안 그대로) — 판(축 판정)만 갈아 끼운다 ──
//   생업 하나 이상(N=20) · 같은 마을 수 · 가장 먼 점(곧은 간격 이분) · 외톨이(4일 종전 이웃 0)는 결과에서 센다.
function pickRule(nWant, plan) {
  const viable = cells.filter((c) => c.k === 'l' && c.p20[plan].length);
  const score = (c) => c.p20[plan].length + c.p40[plan].length * 0.5;
  const picked = [];
  const viableSet = viable.slice().sort((a, b) => score(b) - score(a) || a.cy - b.cy || a.cx - b.cx);
  const dmin = (c) => { let m = Infinity; for (const p of picked) { const d = Math.hypot(p.cx - c.cx, p.cy - c.cy); if (d < m) m = d; } return m; };
  let lo = 50, hi = 2000, best = null;
  for (let it = 0; it < 18; it++) {
    const mid = (lo + hi) / 2; picked.length = 0;
    for (const c of viableSet) if (dmin(c) >= mid) picked.push(c);
    if (picked.length >= nWant) { lo = mid; best = { gap: mid, pts: picked.slice(0, nWant) }; } else hi = mid;
  }
  if (!best) return null;
  const pts = best.pts.map((c, i) => ({ name: `규칙${i + 1}`, cx: c.cx, cy: c.cy, axes: c.p20[plan].slice(), axes40: c.p40[plan].slice(), crop: c.crop[plan], nd: c.nd }));
  const mat = distMatrix(pts);
  const nb = nbStats(pts, mat);
  const overlap = pts.filter((p) => live.some((v) => Math.hypot(v.cx - p.cx, v.cy - p.cy) <= 64)).length;
  const loners = nb.rows.map((r, i) => (r.nOld === 0 ? { name: r.name, axes: pts[i].axes } : null)).filter(Boolean);
  const axisCount = {}; for (const k of AX) axisCount[k] = pts.filter((p) => p.axes.includes(k)).length;
  const onlyAxis = {}; for (const k of AX) onlyAxis[k] = pts.filter((p) => p.axes.length === 1 && p.axes[0] === k).length;
  return { plan, gapCells: Math.round(best.gap), pts, nb, viable: viable.length, overlap, loners, lonerSingle: loners.filter((l) => l.axes.length < 2).length,
    noAxis: pts.filter((p) => !p.axes.length).length, multi: pts.filter((p) => p.axes.length >= 2).length, axisCount, onlyAxis,
    foodAxis: pts.filter((p) => p.axes.some((k) => k === 'farm' || k === 'hunt' || k === 'fish')).length };
}
const rules = {};
for (const pl of ['base', 'sea', 'C', 'CH']) { rules[pl] = pickRule(live.length, pl); log(`규칙 ${pl} 간격 ${rules[pl] && rules[pl].gapCells}`); }

// ── 표 ──
const share = (arr, f) => arr.length ? +(arr.filter(f).length / arr.length).toFixed(4) : null;
const planStats = {};
const isWet = (c) => c.nd <= 140;   // 물가 = 물 땅값 고리(140) 안에 큰 물이 있는 칸 · 내륙 = 그 밖
const med = (a) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.floor(v.length / 2)] : null; };
const q = (a, p) => { const v = a.slice().sort((x, y) => x - y); return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * p))] : null; };
for (const pl of PLANS) {
  const wet = landCells.filter(isWet), dry = landCells.filter((c) => !isWet(c));
  const fvW = wet.map((c) => c.fv[pl.id]), fvD = dry.map((c) => c.fv[pl.id]);
  const cropMix = {}; for (const c of landCells) cropMix[c.crop[pl.id]] = (cropMix[c.crop[pl.id]] || 0) + 1;
  for (const k of Object.keys(cropMix)) cropMix[k] = +(cropMix[k] / landCells.length).toFixed(4);
  const ax = {}; for (const k of AX) ax[k] = share(landCells, (c) => c.p20[pl.id].includes(k));
  planStats[pl.id] = { label: pl.label, empty20: share(landCells, (c) => !c.p20[pl.id].length), empty40: share(landCells, (c) => !c.p40[pl.id].length),
    emptyFood20: share(landCells, (c) => !c.p20[pl.id].some((k) => k === 'farm' || k === 'hunt' || k === 'fish')),
    axis20: ax,
    wet: { n: wet.length, empty20: share(wet, (c) => !c.p20[pl.id].length), farm20: share(wet, (c) => c.p20[pl.id].includes('farm')), fvMed: med(fvW), fvP10: q(fvW, 0.1), fvP90: q(fvW, 0.9) },
    dry: { n: dry.length, empty20: share(dry, (c) => !c.p20[pl.id].length), farm20: share(dry, (c) => c.p20[pl.id].includes('farm')), fvMed: med(fvD), fvP10: q(fvD, 0.1), fvP90: q(fvD, 0.9) },
    cropMix };
}
const regions = {};
for (const c of landCells) { const rx = c.cx < W / 2 ? '서' : '동', ry = ['북', '중북', '중남', '남'][Math.min(3, Math.floor(c.cy / (H / 4)))]; const k = ry + rx; const r = regions[k] || (regions[k] = { n: 0 }); r.n++; for (const pl of PLANS) { r[pl.id] = (r[pl.id] || 0) + (c.p20[pl.id].length ? 0 : 1); } }
for (const r of Object.values(regions)) for (const pl of PLANS) r[pl.id] = +(r[pl.id] / r.n).toFixed(4);
const siteRows = sites.filter((s) => !s.skip).map((s) => {
  const fc = s.raster.fc;
  const dryRank = CROPS.filter((c) => !c.paddyOnly).map((c) => ({ id: c.id, ko: c.ko, v: +(fc.fert.sea[c.id] * c.Y).toFixed(3) })).sort((a, b) => b.v - a.v);
  const riceV = +(fc.fert.sea.rice * RICE.Y).toFixed(3);
  return { name: s.name, type: s.type, seeded: !!s.seeded, cx: s.cx, cy: s.cy, nd: s.raster.nd, fieldD: +s.raster.shares.fieldD.toFixed(3), huntD: +s.raster.shares.huntD.toFixed(3),
    fertNow: fc.fert.now.rice, fertSea: fc.fert.sea.rice, game: s.raster.game, riceV, dry1: dryRank[0], dry2: dryRank[1],
    pick: Object.fromEntries(PLANS.map((p) => [p.id, s.j20[p.id].crop])), a20: Object.fromEntries(PLANS.map((p) => [p.id, s.j20[p.id].pass])), a40: Object.fromEntries(PLANS.map((p) => [p.id, s.j40[p.id].pass])),
    farmV: Object.fromEntries(PLANS.map((p) => [p.id, s.j20[p.id].farmV])) };
});
const res = {
  zone: Z, displayName: ZONE.displayName, made: new Date().toISOString().slice(0, 10), grid: GRID, cells: { W, H, land, water, rock, forest, ore: oreN, sea: seaN, field: fieldN },
  constants: C, crops: CROPS, terrN: TERR_N, reach: REACH, plans: PLANS, planStats, regions, sites: siteRows, nbLive, liveNames: live.map((s) => s.name), rules,
  cellsOut: cells.map((c) => c.k === 'l' ? [c.cx, c.cy, PLANS.map((p) => AX.map((k) => (c.p20[p.id].includes(k) ? AXL[k] : '')).join('') || '-').join(','), c.crop.C, c.nd, c.fieldD] : [c.cx, c.cy, c.k]),
  sec: Math.round((Date.now() - t0) / 1000),
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(res));
log(`끝 → ${OUT}`);
