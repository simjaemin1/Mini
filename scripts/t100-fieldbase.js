#!/usr/bin/env node
// === scripts/t100-fieldbase.js — T100 밭 밑변 계측기(전/후 **같은 자**) =========
// 재민 지시(2026-09-05 판정 ⓐ'): "계측기 t100-fieldbase.js 로 전/후 표를 같은 자로."
//   §0(1차)  : ⓐ 어긋남 표 · ⓑ 농부당 밭 칸 · 앵커 유도 — **읽기만**
//   §2-①(2차): 개간을 랩 안에서 **정본 함수로** 돌려 밭 칸 추이를 잰다
//              (needLand 가 켜지는지 · 몇 일 만에 econ 산출을 따라잡나 · 소멸·인구 곡선)
//
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 수치를 낸다.
// ★사본 0: 개간은 `villages.__labProbe._clearProbe.day()` = `_lifeClearDay` 정본 그대로다.
//   앵커(0.0806)도 여기서 새로 안 적는다 — `crops.js`·`kcal.js` 에서 매번 유도한다.
//
// 실행: node scripts/t100-fieldbase.js [일수] [시드] [출력json]
//   T100_FIELD_YIELD=1  → 밭 밑변 켬(econ)      · 안 주면 T86 세계(끔)
//   T100_CLEAR=0        → 개간 관찰 끔(§0 1차 재현 — 밭 칸이 시딩값에 얼어붙는다)
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t100-fieldbase-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEED = parseInt(process.argv[3], 10) || 1020;
const OUT = process.argv[4] || '/tmp/t100/base.json';
const CLEAR_ON = process.env.T100_CLEAR !== '0';
const FY = process.env.T100_FIELD_YIELD === '1';

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim'); const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout'); const Villages = R('server/villages');
const P = Villages.__labProbe, CP = P._clearProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => { if (ZONE.isOcean) return true; if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
// ── 시딩 — 51곳 `VillageLayout.generate` 는 곳당 5~17초다(전수 ~10분). **결정론이라 캐시한다.**
//   캐시는 계측 편의일 뿐 정본이 아니다: 지우면 그대로 다시 만든다(값 동일 — 같은 지형·같은 함수).
const CACHE = process.env.T100_SEEDCACHE || '/tmp/t100/seedcache.json';
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
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout),
      layout: { farmland: layout.farmland, dryfield: layout.dryfield, nongZone: layout.nongZone, territory: layout.territory,
                houses: (layout.houses || []).map(h => ({ cx: h.cx, cy: h.cy })) },
      nong: (layout.farmland || []).length, bat: (layout.dryfield || []).length });
    process.stderr.write(`[seedcache] ${seeds.length}/${picked.length} ${hv.name}\n`);
  }
  try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(seeds)); } catch (e) {}
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
const vils = [];   // 생활층 껍데기(공간) — 개간 정본이 보는 자리에 그대로 꽂는다
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  ev._nong = s.nong; ev._bat = s.bat;
  world.villages.push(ev);
  vils.push(CP.attach({ dbId: vils.length + 1, name: s.name, ccx: s.ccx, ccy: s.ccy, econ: ev, layout: s.layout }));
}
world.day = 0;
// 개간 정본이 보는 전역 자리(하네스는 판정을 다시 짜지 않는다)
let _rowid = 0;
CP.setup(ta, world, { insertVillageBuilding: () => ++_rowid });

// ── 궤적 기록 ────────────────────────────────────────────────────────────────
const SNAP = [0, 25, 50, 100, 200, 400, 600, 800].filter(d => d <= DAYS);
const traj = {};                                     // name → { cells:[], pop:[], farmers:[] }
for (const v of vils) traj[v.name] = { cells: [], pop: [], farmers: [], need: 0, cleared: 0 };
const popCurve = [];                                 // [day, 총인구, 소멸수]
const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) {
  econV2.tickWorldV2(world);   // `world.day` 는 틱이 스스로 올린다(economy-sim-v2:1281)
  if (CLEAR_ON) {
    for (const vil of vils) if (CP.needClear(vil)) traj[vil.name].need++;   // 계측만(판정은 tickDay 안의 정본이 한다)
    const before = {}; for (const vil of vils) before[vil.name] = vil._farmSet.size;
    CP.tickDay(vils);                                                       // ★개간 정본 — 하루치
    for (const vil of vils) traj[vil.name].cleared += vil._farmSet.size - before[vil.name];
  }
  if (SNAP.indexOf(d + 1) >= 0 || d === 0) {
    for (const vil of vils) { const t = traj[vil.name]; t.cells.push(vil._farmSet.size);
      t.pop.push((vil.econ.npcs || []).length); t.farmers.push((vil.econ.counts && vil.econ.counts.farmer) || 0); }
  }
  if ((d + 1) % 20 === 0 || d === 0) popCurve.push([d + 1,
    world.villages.reduce((a, v) => a + (v.npcs || []).length, 0),
    world.villages.filter(v => !(v.npcs || []).length).length]);
}
console.log = _log;

// ── 앵커 유도 — 전부 정본에서 읽는다(새 수 0) ────────────────────────────
const CR = R('server/crops.js'), KC = R('server/kcal.js'), W = R('server/weights.js');
const GKG = CR.GROUP_KG, DAYK = KC.DAY_KCAL;
function cellFoodUnits(c) { const kg = (c.yield || 0) * (GKG[c.group] || 0); return kg * (c.kcal || 0) / DAYK; }
const LIST = Object.values(CR.CROPS).filter(c => (GKG[c.group] || 0) > 0 && (c.kcal || 0) > 0);
const grains = LIST.filter(c => c.group === '곡물');
const perDay = (c) => cellFoodUnits(c) / Math.max(1, c.growDays || 1);
const gAvg = grains.reduce((a, c) => a + perDay(c), 0) / grains.length;
console.log(`\n══ T100 계측기 — 시드 ${SEED} · ${DAYS}일 · FIELD_YIELD ${FY ? 'ON' : 'off'} · 개간 ${CLEAR_ON ? 'ON' : 'off'} ══`);
console.log(`  앵커: 밭 1칸 1회 = yield × GROUP_KG × kcal ÷ DAY_KCAL(${DAYK})  ·  food 1단위 = ${W.kgOf('food')}kg × ${KC.KCAL_PER_KG.food} = ${W.kgOf('food') * KC.KCAL_PER_KG.food}`);
console.log(`  ★곡물 ${grains.length}종 평균 = **${gAvg.toFixed(4)} food 단위/칸·일**  (econ 상수 ${econ.CELL_FOOD_PER_DAY} · 텃밭 하한 ${econ.T100_GARDEN_PER_FARMER}칸/농부 = 생활층 개간속도 ${CP.LIFE_CLEAR_PDAY})`);

// ── ⓐ 두 밑변 · ⓑ 농부당 밭 칸 ─────────────────────────────────────────
const rows = [];
for (const vil of vils) {
  const v = vil.econ;
  const N = (v.npcs || []).length, fN = (v.counts || {}).farmer || 0;
  const cells = vil._farmSet.size, cells0 = (vil._farmN + vil._dryN);
  const econOut = fN * 1.5 * (v.land.fertility || 0);      // 옛 밑변(T86 세계) — 자는 안 바뀐다
  const fieldOut = cells * gAvg * (v.land.fertility || 0); // 밭 밑변(T100 식 그대로 · 지력 곱)
  rows.push({ name: v.name, N, fN, cells, cells0, perFarmer: fN ? cells / fN : null,
    econOut: +econOut.toFixed(2), fieldOut: +fieldOut.toFixed(2),
    ratio: fieldOut > 0 ? +(econOut / fieldOut).toFixed(2) : null, fert: +(v.land.fertility || 0).toFixed(2),
    need: traj[v.name].need, cleared: traj[v.name].cleared, cellTraj: traj[v.name].cells, popTraj: traj[v.name].pop,
    // ★귀속용(T60 §0-ⓔ' 문법) — 판정 안 한다, 정본이 남긴 것을 그대로 옮긴다
    dp: v._dpDebug || null, housing: v.housing != null ? +v.housing.toFixed(1) : null,
    stock: ['food', 'fish', 'meat', 'wheat', 'rice', 'barley', 'wood', 'cooked_food'].reduce((o, r) => (o[r] = +((v.storage[r] || 0)).toFixed(1), o), {}),
    prodK: v._prodKema != null ? +v._prodKema.toFixed(1) : null, foodEq: +econ.totalFoodEquivalent(v).toFixed(1) });
}
const dead = rows.filter(r => r.N === 0);
const live = rows.filter(r => r.fN > 0 && r.cells > 0);
const rs = live.map(r => r.ratio).sort((a, b) => a - b);
const pf = live.map(r => r.perFarmer).sort((a, b) => a - b);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`\n══ 소멸 ${dead.length}/${rows.length}  ·  총인구 ${rows.reduce((a, r) => a + r.N, 0)} ══`);
if (dead.length) console.log('   소멸: ' + dead.map(r => r.name).join(' '));
console.log('\n══ ⓐ 어긋남 표 (옛 밑변 ÷ 밭 밑변) ══');
console.log(`  잰 마을 ${live.length}/${rows.length} (농부>0 · 밭>0)`);
console.log(`  비 — 최소 ${q(rs,0)} · 25% ${q(rs,0.25)} · **중앙 ${q(rs,0.5)}** · 75% ${q(rs,0.75)} · 최대 ${q(rs,0.99)}`);
console.log(`  합계 — 옛 ${live.reduce((a,r)=>a+r.econOut,0).toFixed(0)} vs 밭 ${live.reduce((a,r)=>a+r.fieldOut,0).toFixed(0)} 단위/일  ⇒ **×${(live.reduce((a,r)=>a+r.econOut,0)/live.reduce((a,r)=>a+r.fieldOut,0)).toFixed(2)}**`);
console.log('\n══ ⓑ 농부당 밭 칸 ══');
console.log(`  최소 ${q(pf,0).toFixed(1)} · 25% ${q(pf,0.25).toFixed(1)} · **중앙 ${q(pf,0.5).toFixed(1)}** · 75% ${q(pf,0.75).toFixed(1)} · 최대 ${q(pf,0.99).toFixed(1)} 칸/농부`);
console.log(`  밭 0칸 마을 ${rows.filter(r=>r.cells===0).length}곳 · 농부 0 마을 ${rows.filter(r=>r.fN===0).length}곳`);
console.log('\n══ ⓒ 밭 칸 추이 (개간 정본 · needLand 켜진 일수 / 총 개간 칸) ══');
console.log(`  스냅 일차: ${[1].concat(SNAP.filter(d=>d>0)).join(' · ')}`);
const byCleared = rows.slice().sort((a, b) => b.cleared - a.cleared);
for (const r of byCleared.slice(0, 8))
  console.log(`   ${r.name.padEnd(6)} fert ${String(r.fert).padStart(4)} 인구 ${String(r.N).padStart(3)} 농부 ${String(r.fN).padStart(3)} · 밭 ${r.cells0}→${r.cells} · needLand ${r.need}일 · 개간 ${r.cleared}칸\n      칸 ${r.cellTraj.join(' → ')}\n      인구 ${r.popTraj.join(' → ')}`);
const zero = rows.filter(r => r.cleared === 0);
console.log(`  개간 0칸 마을 ${zero.length}/${rows.length}` + (zero.length ? ' : ' + zero.slice(0, 12).map(r => r.name).join(' ') : ''));
console.log('\n══ 인구 곡선(20일) ══');
console.log('  ' + popCurve.filter((_, i) => i % 5 === 0).map(c => `${c[0]}d:${c[1]}${c[2] ? '/사망' + c[2] : ''}`).join('  '));
try { fs.mkdirSync(path.dirname(OUT), { recursive: true }); } catch (e) {}
fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, days: DAYS, fieldYield: FY, clear: CLEAR_ON, gAvg, dead: dead.map(r => r.name), rows, popCurve }, null, 1));
console.log(`\n  → ${OUT}`);
