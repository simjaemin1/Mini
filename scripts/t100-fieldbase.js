#!/usr/bin/env node
// === /tmp/t86/attrib-probe.js — T86 귀속 프로브(읽기만) ==========================
// 재민 요구(2026-09-05): ① 농촌1 246→81 을 T60 §0-ⓔ' 문법으로 세 줄 귀속
//   (죽기 전날 dP 분해 · 곳간 구성 전/후 · 생선 유입이 끊겼는지)  ② 인구 −30% 넘는 마을 수 + 군수 변화
// 세계 조립은 scripts/t17-metrics.js 와 같은 순서·같은 정본 함수(사본 아님).
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 수치를 낸다.
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t86-attrib-${process.pid}.db`;
const path = require('path'), fs = require('fs');
const ROOT = require('path').join(__dirname, '..');
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
  seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp: P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout),
    nong: (layout.farmland || []).length, bat: (layout.dryfield || []).length });
}
const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
world.villages = []; world.events = [];
for (const s of seeds) {
  const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
  ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
  ev._nong = s.nong; ev._bat = s.bat;
  world.villages.push(ev);
}
world.day = 0;
const _log = console.log; console.log = () => {};
for (let d = 0; d < DAYS; d++) econV2.tickWorldV2(world);
console.log = _log;

// ── 앵커 유도 — 전부 정본에서 읽는다(새 수 0) ────────────────────────────
const CR = R('server/crops.js'), KC = R('server/kcal.js'), W = R('server/weights.js');
const GKG = CR.GROUP_KG, DAYK = KC.DAY_KCAL;
// 밭 1칸 1회 수확 = yield × GROUP_KG[group] kg × kcal/kg ÷ DAY_KCAL  = food 단위(사람·일)
function cellFoodUnits(c) { const kg = (c.yield || 0) * (GKG[c.group] || 0); return kg * (c.kcal || 0) / DAYK; }
const LIST = Object.values(CR.CROPS).filter(c => (GKG[c.group] || 0) > 0 && (c.kcal || 0) > 0);
const grains = LIST.filter(c => c.group === '곡물');
const perDay = (c) => cellFoodUnits(c) / Math.max(1, c.growDays || 1);
const gAvg = grains.reduce((a, c) => a + perDay(c), 0) / grains.length;
console.log('\n══ 앵커 유도(정본에서) ══');
console.log(`  crops.js:212  수확 개수 = floor(yield × w × germ)   ·  GROUP_KG['곡물'] = ${GKG['곡물']} kg/개`);
console.log(`  kcal.js       DAY_KCAL = ${DAYK}  ·  food 1단위 = ${W.kgOf('food')}kg × ${KC.KCAL_PER_KG.food} = ${W.kgOf('food') * KC.KCAL_PER_KG.food} kcal (T86 검산)`);
console.log('  ⇒ 밭 1칸 1회 = yield × GROUP_KG[group] × kcal ÷ DAY_KCAL  [food 단위]');
for (const c of grains.slice(0, 6))
  console.log(`     ${c.ko.padEnd(4)} yield ${c.yield} × ${GKG[c.group]}kg × ${c.kcal}kcal ÷ ${DAYK} = ${cellFoodUnits(c).toFixed(2)} 단위/칸 ÷ ${c.growDays}일 = ${perDay(c).toFixed(4)}/칸/일`);
console.log(`  ★곡물 ${grains.length}종 평균 = **${gAvg.toFixed(4)} food 단위/칸/일**`);

// ── ⓐ 두 밑변 · ⓑ 농부당 밭 칸 ─────────────────────────────────────────
const rows = [];
for (const v of world.villages) {
  const N = (v.npcs || []).length, fN = (v.counts || {}).farmer || 0;
  const cells = (v._nong || 0) + (v._bat || 0);
  const econOut = 1.5 * (v.land.fertility || 0) * fN;      // OUT1.farmer × 농부 (food 단위/일)
  const fieldOut = cells * gAvg;                            // 밭 밑변 (food 단위/일)
  rows.push({ name: v.name, N, fN, cells, perFarmer: fN ? cells / fN : null,
    econOut: +econOut.toFixed(2), fieldOut: +fieldOut.toFixed(2),
    ratio: fieldOut > 0 ? +(econOut / fieldOut).toFixed(2) : null, fert: +(v.land.fertility || 0).toFixed(2) });
}
const live = rows.filter(r => r.fN > 0 && r.cells > 0);
const rs = live.map(r => r.ratio).sort((a, b) => a - b);
const pf = live.map(r => r.perFarmer).sort((a, b) => a - b);
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log('\n══ ⓐ 어긋남 표 (econ 밑변 ÷ 밭 밑변) ══');
console.log(`  잰 마을 ${live.length}/51 (농부>0 · 밭>0)`);
console.log(`  비 — 최소 ${q(rs,0)} · 25% ${q(rs,0.25)} · **중앙 ${q(rs,0.5)}** · 75% ${q(rs,0.75)} · 최대 ${q(rs,0.99)}`);
console.log(`  합계 — econ ${live.reduce((a,r)=>a+r.econOut,0).toFixed(0)} vs 밭 ${live.reduce((a,r)=>a+r.fieldOut,0).toFixed(0)} 단위/일  ⇒ **×${(live.reduce((a,r)=>a+r.econOut,0)/live.reduce((a,r)=>a+r.fieldOut,0)).toFixed(2)}**`);
console.log('\n══ ⓑ 농부당 밭 칸 ══');
console.log(`  최소 ${q(pf,0).toFixed(1)} · 25% ${q(pf,0.25).toFixed(1)} · **중앙 ${q(pf,0.5).toFixed(1)}** · 75% ${q(pf,0.75).toFixed(1)} · 최대 ${q(pf,0.99).toFixed(1)} 칸/농부`);
console.log(`  ⇒ 생활층 _lifeTasksPerFarmerDay() = 201칸/일 처리 능력 대비 **${(q(pf,0.5)/201*100).toFixed(1)}%**`);
console.log(`  밭 0칸 마을 ${rows.filter(r=>r.cells===0).length}곳 · 농부 0 마을 ${rows.filter(r=>r.fN===0).length}곳`);
console.log('\n  상하위 6곳 (비 큰 순):');
for (const r of live.sort((a,b)=>b.ratio-a.ratio).slice(0,6))
  console.log(`    ${r.name.padEnd(6)} 농부${String(r.fN).padStart(3)} 밭${String(r.cells).padStart(4)}칸(${r.perFarmer.toFixed(1)}/농부) fert ${r.fert} · econ ${r.econOut} vs 밭 ${r.fieldOut} = ×${r.ratio}`);
for (const r of live.slice(-3))
  console.log(`    ${r.name.padEnd(6)} 농부${String(r.fN).padStart(3)} 밭${String(r.cells).padStart(4)}칸(${r.perFarmer.toFixed(1)}/농부) fert ${r.fert} · econ ${r.econOut} vs 밭 ${r.fieldOut} = ×${r.ratio}`);
require('fs').writeFileSync('/tmp/t100/base.json', JSON.stringify({ gAvg, rows }, null, 1));
