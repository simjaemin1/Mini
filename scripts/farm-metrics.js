#!/usr/bin/env node
// === scripts/farm-metrics.js — 밭을 도는 계측기 (T117) ==========================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`// @regress` 표를 붙이지 않는다).
//
// ★★왜 만들었나 [T112 §0ⓑ · 회부 ⓪-f · 족보 130 · 재민 확정 2026-09-05]
//   여덟 수 계측기(`t17-metrics.js`)도 econ 랩도 **`crops.js` 를 아예 안 적재한다.**
//   `Villages.init()` 을 안 부르고 `__labProbe` 로 econ 세계만 조립하기 때문에 `state.villages`
//   (그리고 `_terrSet`/`_farmSet`)가 서지 않고, **밭 상태기가 한 번도 안 돈다.**
//   ⇒ T58a·T91·T99 가 3시드 0줄을 *"작물이 곳간에 안 닿는다"의 증거*로 든 것은 과한 주장이었다.
//     0줄은 **이 계측기가 밭을 안 돈다**는 사실의 결과였다.
//   ⇒ **밭이 econ 에 닿는지 재려면 밭을 도는 자가 먼저 있어야 한다.** 이 파일이 그 자다.
//
// ★★사본 0 — 루프를 여기서 다시 쓰지 않는다
//   노동(`lifeFarmDay`)·우선순위(`_cellTask`)·하루 틱(`cropDayTick`)·개간(`_lifeClearDay`)이
//   전부 **정본 함수**이고, 계측기는 `__labProbe._cropProbe` / `._clearProbe` 로 그걸 부른다.
//   T58b 의 `farm-q-metrics.js` 는 노동 예산을 손으로 `100` 이라 적었다 — 그게 사본이고,
//   지금은 제품의 `_lifeTasksPerFarmerDay()`(날 길이 파생 · 실측 84)가 답한다.
//
// ★개간은 세션1 T100 의 `_clearProbe` 가 정본이다. 있으면 부르고(밭이 자란다), 없으면
//   **밭 칸을 고정**한 채 돈다(그 판은 `cleared 0` 으로 찍힌다 — 표가 스스로 말한다).
//
// 열 이름은 **PM 지정**이다(세션1 T100 표와 같아야 두 세션의 자가 같다):
//   vid · name · fert · N · fN · cells · cells0 · cleared · perFarmer · need ·
//   harvestN · foodEq · qMean · tasksWater · tasksWeed · econFood · ratio
//
// 실행: node scripts/farm-metrics.js [일수=800] [시드=1020]
//   시딩 캐시: LAB_SEEDCACHE=/tmp/farm-seeds.json  (51곳 layout 을 한 번만 굽는다 · T100 규약)
//   전 시드: for s in 1020 7 42; do LAB_SEEDCACHE=/tmp/fs.json node scripts/farm-metrics.js 800 $s; done
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/farm-metrics-${process.pid}.db`;

const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const CACHE = process.env.LAB_SEEDCACHE || '';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const Crops = R('server/crops');
const P = Villages.__labProbe;
const CP = P._cropProbe;
const CL = P._clearProbe || null;                      // ★세션1 T100 — 있으면 밭이 자란다
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

// ── ① 실지도 51마을 — `t17-metrics` 와 **같은 길**(같은 세계여야 견줄 수 있다) ──
function buildSeeds() {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const out = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    out.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, layout, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout) });
  }
  return out;
}
let seeds = null;
if (CACHE && fs.existsSync(CACHE)) { try { seeds = JSON.parse(fs.readFileSync(CACHE, 'utf8')); } catch (e) { seeds = null; } }
if (!seeds) { seeds = buildSeeds(); if (CACHE) { try { fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {} } }

const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  world.villages.push(ev);
}
world.day = 0;

// ── ② 생활층 마을 — 정본 `attach` 가 만든다(계측기가 손으로 안 조립한다) ──────
CP.setup(ta, world, null);
if (CL) CL.setup(ta, world, null);
const vils = seeds.map((s, i) => CP.attach({ dbId: i + 1, name: s.name, ccx: s.ccx, ccy: s.ccy, layout: s.layout, econ: world.villages[i] }));
const cells0 = vils.map((v) => v._farmSet.size);

// ── ③ 800일 — 정본 노동 + 정본 하루 틱 ──────────────────────────────────────
const CROP = new Map();
const bump = (id, f, n) => { let r = CROP.get(id); if (!r) { r = { sow: 0, harvest: 0, units: 0, foodEq: 0 }; CROP.set(id, r); } r[f] += n; };
const M = vils.map(() => ({ sow: 0, harvestN: 0, units: 0, foodEq: 0, tasksWater: 0, tasksWeed: 0, tasksPest: 0, fDays: 0 }));
const IX = new Map(vils.map((v, i) => [v, i]));
const DAY_KCAL = 2450;                                  // `server/kcal.js` 의 하루치 — 식량등가의 자
let clearedTot = 0;

const _log = console.log; console.log = () => {};
for (let day = 0; day < DAYS; day++) {
  econV2.tickWorldV2(world);
  if (CL) clearedTot += CL.tickDay(vils) || 0;          // ★개간은 T100 정본(없으면 밭 칸 고정)
  for (const v of vils) { const ev = v.econ; if (ev && ev.npcs && ev.npcs.length) M[IX.get(v)].fDays += (ev.counts && ev.counts.farmer) || 0; }
  CP.tickDay(vils, day, (vil, k, t, c0, p0, e1) => {
    const i = IX.get(vil), m = M[i];
    if (t === 2) { m.sow++; if (e1) bump(e1.c, 'sow', 1); return; }
    if (t === 3) { m.tasksWater++; return; }
    if (t === 1) { m.tasksWeed++; return; }
    if (t === 4) { m.tasksPest++; return; }
    if (t === 5 && c0) {                                 // 수확 — 산출은 정본 식(`Crops.harvestUnits`)
      const u = Crops.harvestUnits(c0, { supply: vil._drySet.has(k) ? 1 : 5, seedFresh: 1 });
      const c = Crops.get(c0), fe = u * (Crops.kgOf(c0) || 0) * ((c && c.kcal) || 0) / DAY_KCAL;
      m.harvestN++; m.units += u; m.foodEq += fe;
      bump(c0, 'harvest', 1); bump(c0, 'units', u); bump(c0, 'foodEq', fe);
    }
  });
}
console.log = _log;

// ── 출력 ─────────────────────────────────────────────────────────────────────
const nf = (x) => Number(x).toLocaleString();
const r1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
let qS = 0, qN = 0, cellsTot = 0, cells0Tot = 0;
for (let i = 0; i < vils.length; i++) { cellsTot += vils[i]._farmSet.size; cells0Tot += cells0[i]; for (const [, e] of vils[i]._crop) { qS += e.q; qN++; } }
const totU = [...CROP.values()].reduce((a, r) => a + r.units, 0);
const totF = [...CROP.values()].reduce((a, r) => a + r.foodEq, 0);
const totH = [...CROP.values()].reduce((a, r) => a + r.harvest, 0);
const totS = [...CROP.values()].reduce((a, r) => a + r.sow, 0);
let econFoodTot = 0, popTot = 0;
for (const v of world.villages) { econFoodTot += (v.storage && v.storage.food) || 0; popTot += (v.npcs || []).length; }

console.log(`\n=== 밭 계측 — 실지도 ${vils.length}마을 · 시드 ${SEED} · ${DAYS}일 ===`);
console.log(`  개간 정본(T100 \`_clearProbe\`) ${CL ? '있다 — 밭이 자란다' : '**아직 없다** — 밭 칸 고정(cleared 0)'}`);
console.log(`  밭 칸 ${nf(cells0Tot)} → ${nf(cellsTot)} (개간 ${nf(clearedTot)}) · 농부 1인 하루 처리 칸 ${CP.TASKS_PER_FARMER} · 물때 ${CP.L_WATERGAP}일`);

console.log(`\nⓐ 일감 — 파종 ${nf(totS)} · 수확 ${nf(totH)} · 물대기 ${nf(M.reduce((a, m) => a + m.tasksWater, 0))} · 김매기 ${nf(M.reduce((a, m) => a + m.tasksWeed, 0))} · 방제 ${nf(M.reduce((a, m) => a + m.tasksPest, 0))}`);
console.log(`ⓑ 산출 — ${nf(totU)}단위 · **식량등가 ${nf(Math.round(totF))}**(1 = 하루치 ${nf(DAY_KCAL)}kcal) · 마을·해당 ${r1(totF / vils.length / (DAYS / 365))}`);
console.log(`ⓒ 품질 — 끝 평균 qMean ${qN ? (qS / qN).toFixed(4) : '—'} (심긴 칸 ${nf(qN)})`);

console.log('\nⓓ 작물별 (파종 많은 순 · 상위 14)');
console.log('  crop        lifecycle      sow  harvestN    units     foodEq');
for (const [id, r] of [...CROP.entries()].sort((a, b) => b[1].sow - a[1].sow).slice(0, 14)) {
  console.log('  ' + (Crops.koOf(id) || id).padEnd(10) + String(Crops.lifecycleOf(id) || '—').padEnd(13)
    + String(r.sow).padStart(7) + String(r.harvest).padStart(10) + String(r.units).padStart(9) + String(Math.round(r.foodEq)).padStart(11));
}

// ★[T100 4판 · 손잡이 없으면 무변] `FARM_JSON=<경로>` 면 **51마을 전수**를 JSON 으로도 낸다.
//   4판이 `k`(칸당 산출 계수)를 유도하려면 상위 14가 아니라 전수의 `harvestN·foodEq·fDays` 가 필요하다.
//   화면 출력·계산은 한 줄도 안 바뀐다 — 쓰기만 더 한다.
if (process.env.FARM_JSON) {
  const rows = vils.map((v, i) => { const m = M[i], ev = v.econ;
    return { vid: i, name: v.name, fert: +((ev.land && ev.land.fertility) || 0).toFixed(2),
      N: (ev.npcs || []).length, fN: (ev.counts && ev.counts.farmer) || 0, fDays: m.fDays,
      cells: v._farmSet.size, cells0: cells0[i], cleared: v._farmSet.size - cells0[i],
      harvestN: m.harvestN, units: m.units, foodEq: +m.foodEq.toFixed(2),
      tasksWater: m.tasksWater, tasksWeed: m.tasksWeed,
      econFood: +(((ev.storage && ev.storage.food) || 0)).toFixed(1),
      // ★[T100 4판 ⓒ 귀속] 인구가 왜 움직였나 — 정본이 **이미 남겨 둔 것**을 옮겨 적기만 한다(판정 0 · 새 계산 0).
      //   `_dpDebug` 는 economy-sim 의 인구식이 매 틱 써 두는 항 분해다(K·물류·기근·건강·행복·위세·주거 게이트).
      dp: ev._dpDebug || null,
      housing: ev.housing != null ? +(+ev.housing).toFixed(1) : null,
      prodK: ev._prodKema != null ? +ev._prodKema.toFixed(1) : null,
      fuelK: ev._fuelKema != null ? +ev._fuelKema.toFixed(1) : null,
      hunger: ev.hunger != null ? +(+ev.hunger).toFixed(3) : null,
      stockFoodEq: +econ.totalFoodEquivalent(ev).toFixed(1),
      stock: ['food', 'fish', 'meat', 'cooked_food', 'wheat', 'rice', 'barley', 'wood']
        .reduce((o, r) => (o[r] = +((ev.storage[r] || 0)).toFixed(1), o), {}) }; });
  // ★[T100 4판 ④] 같은 판의 **여덟 수**(T17/T86 문법 · 읽는 자리는 `t17-metrics.js` ⓐⓓⓔ 와 같다)를
  //   같이 담는다 — A/B 표(`scripts/t100-ab.js`)가 두 팔을 **같은 자**로 견주려면 한 파일에 있어야 한다.
  const _stock = (r) => world.villages.reduce((a, v) => a + (v.storage[r] || 0), 0);
  let _pop = 0, _dead = 0, _ever = 0, _weapQ = 0, _expand = 0, _toolQ = 0, _hungry = 0;
  for (const v of world.villages) {
    const n = (v.npcs || []).length; _pop += n;
    if (v._everPop) _ever++;
    if (v._everPop && n <= 0) _dead++;
    _weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
    _expand += v.expansions || 0;
    _toolQ += (v.storage.tool || 0) * (v._toolQ != null ? v._toolQ : 1);
    if ((v.hunger || 0) > 0) _hungry++;
  }
  const _pres = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'].reduce((a, r) => a + _stock(r), 0);
  const world8 = { pop: _pop, dead: _dead, ever: _ever, weapQ: +_weapQ.toFixed(1), expand: _expand,
    trades: (world.tradeLog || []).length, toolQ: +_toolQ.toFixed(1), preserved: +_pres.toFixed(1),
    salt: +_stock('salt').toFixed(1), econFood: +econFoodTot.toFixed(1), hungry: _hungry,
    cells0: cells0Tot, cells: cellsTot, cleared: clearedTot,
    harvestN: totH, foodEq: +totF.toFixed(1), fDays: M.reduce((a, m) => a + m.fDays, 0),
    T100_FIELD_YIELD: process.env.T100_FIELD_YIELD === '1',
    k: (() => { try { return R('sim/economy-sim').T100_K; } catch (e) { return null; } })(),
    N: (() => { try { return R('sim/economy-sim').T100_ANCHOR_N; } catch (e) { return null; } })() };
  try { fs.writeFileSync(process.env.FARM_JSON, JSON.stringify({ days: DAYS, seed: SEED, world8, rows }, null, 1));
    console.log(`  [json] ${process.env.FARM_JSON} · ${rows.length}마을`); } catch (e) {}
}
console.log('\nⓔ 마을별 (밭 칸 많은 순 · 상위 14) — ★열 이름은 PM 지정(세션1 T100 과 같은 자)');
console.log('  vid name         fert    N   fN cells cells0 cleared perFarmer  need harvestN   foodEq qMean tasksWater tasksWeed econFood ratio');
const order = vils.map((v, i) => i).sort((a, b) => vils[b]._farmSet.size - vils[a]._farmSet.size);
for (const i of order.slice(0, 14)) {
  const v = vils[i], m = M[i], ev = v.econ;
  const N = (ev.npcs || []).length, fN = (ev.counts && ev.counts.farmer) || 0;
  const cells = v._farmSet.size, cleared = cells - cells0[i];
  const need = Math.round(N * ((P._clearProbe && P._clearProbe.L_LANDNEED) || 0));
  let q = 0, qn = 0; for (const [, e] of v._crop) { q += e.q; qn++; }
  const eF = (ev.storage && ev.storage.food) || 0;
  const foodEqY = m.foodEq / (DAYS / 365);
  console.log('  ' + String(i).padStart(3) + ' ' + String(v.name).padEnd(12)
    + r1((ev.land && ev.land.fertility) || 0).padStart(5) + String(N).padStart(5) + String(fN).padStart(5)
    + String(cells).padStart(6) + String(cells0[i]).padStart(7) + String(cleared).padStart(8)
    + (cells && fN ? (cells / fN).toFixed(1) : '—').padStart(10) + String(need).padStart(6)
    + String(m.harvestN).padStart(9) + String(Math.round(m.foodEq)).padStart(9)
    + (qn ? (q / qn).toFixed(2) : '—').padStart(6) + String(m.tasksWater).padStart(11) + String(m.tasksWeed).padStart(10)
    + String(Math.round(eF)).padStart(9) + (eF > 0 ? (foodEqY / eF).toFixed(2) : '—').padStart(6));
}

// ── ④ 같은 판의 econ · "닿는가" ──────────────────────────────────────────────
{
  // ★읽는 자리는 `t17-metrics` ⓐ 와 **똑같다**(두 계측기가 다른 자리를 읽으면 견줄 수 없다).
  let pop = 0, dead = 0, ever = 0, weapQ = 0, expand = 0;
  for (const v of world.villages) {
    const n = (v.npcs || []).length; pop += n;
    if (v._everPop) ever++;
    if (v._everPop && n <= 0) dead++;
    weapQ += (v.storage.weapon || 0) * (v._weapQ != null ? v._weapQ : 1);
    expand += v.expansions || 0;
  }
  console.log(`\nⓕ 같은 판의 econ — 인구 ${nf(pop)} · 소멸 ${dead}/${ever} · 무기Q ${weapQ.toFixed(0)} · 확장셀 ${nf(expand)} · 곳간 식량 ${nf(Math.round(econFoodTot))}`);
  const ratio = econFoodTot > 0 ? (totF / (DAYS / 365)) / econFoodTot : 0;
  console.log(`\nⓖ ★★"밭이 곳간에 닿는가" — 밭이 해마다 **식량등가 ${nf(Math.round(totF / (DAYS / 365)))}** 를 내는데`);
  // ★[T100 4판 2026-09-07] 이 절의 **"그중 0 이 들어간다"는 이제 팔에 따라 다르다.**
  //   손잡이를 켜면 `_lifeDoTask0` 수확 갈래가 `harvestToGranary(vil.econ, 1)` 를 부른다(수확 건당 `k`).
  //   T117 이 적어 둔 원문(끈 팔)은 그대로 두고, 켠 팔만 사실대로 갈아 끼운다.
  let _T100K = null; try { _T100K = R('sim/economy-sim').T100_FIELD_YIELD ? R('sim/economy-sim').T100_K : null; } catch (e) {}
  if (_T100K != null) {
    const inflow = totH * _T100K;
    console.log(`   econ 곳간(${nf(Math.round(econFoodTot))})에 **${nf(Math.round(inflow))}** 가 800일 동안 들어갔다`);
    console.log(`   (수확 ${nf(totH)}건 × k ${_T100K.toFixed(4)} — \`_lifeDoTask0\` 수확 갈래 → \`harvestToGranary\` 한 곳).`);
    const fy = M.reduce((a, m) => a + m.fDays, 0) / 365;
    console.log(`   ⇒ **농부 1인 부양 실측 ${(inflow / fy / 365).toFixed(3)}인** (앵커 N = ${R('sim/economy-sim').T100_ANCHOR_N} · 유도의 자기 검산)`);
    console.log(`   ⇒ ratio(밭 연간 식량등가 ÷ 곳간) = ${ratio.toFixed(2)} — T117 자의 원래 뜻(곳간 대비 밭 규모)은 그대로 둔다.`);
  } else {
    console.log(`   econ 곳간(${nf(Math.round(econFoodTot))})에 그중 **0** 이 들어간다. \`_lifeDoTask0\` 의 수확 갈래는`);
    console.log(`   \`npc._carry += 1\` 만 하고 주석이 *"식량은 econ이 이미 계상(연출만)"* 이라 적어 둔 그대로다.`);
    console.log(`   ⇒ ratio = ${ratio.toFixed(2)} — 이 수가 **ECON 2-b 가 이을 때 곳간에 더해질 밑변**이다.`);
    console.log(`   ⇒ 그리고 이제 그 말을 **재고 하는 것**이다. 종전엔 여덟 수 0줄로 말했고, 그건 틀린 근거였다(족보 130).`);
  }
}
