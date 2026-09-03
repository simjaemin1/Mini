#!/usr/bin/env node
// === scripts/t60-extinct.js — 소멸 마을 한 줄 표 (읽기 전용 계측) =================
// ★재민 추가 지시 ⓔ'(2026-09-03): "시드 2·3(1·2·3 계열 · 기준선 아님)에서 T17 뒤
//   소멸 0/0/1 인 마을이 어디이고 왜인지 표 한 줄(읽기만)".
// ★세계 조립은 `scripts/t17-metrics.js` 와 **같은 순서·같은 정본 함수**다(사본 아님).
//   여기서 새로 하는 일은 하나뿐: **날마다 한 줄씩 기억해 두고**, 인구가 0 이 되는 날
//   그 전날의 진단을 뱉는다. 엔진에 아무것도 안 쓴다.
// ⚠계측기다 — 러너 등재 표(`// @regress`)가 **없다**. 판정하지 않고 수치를 낸다.
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t60-ext-${process.pid}.db`;

const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const DAYS = parseInt(process.argv[2], 10) || 800;
const SEEDS = (process.argv[3] || '1,2,3').split(',').map((s) => parseInt(s, 10));

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const econ = R('sim/economy-sim');
const econV2 = R('sim/economy-sim-v2');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const SPEC = R('server/specialty');
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

const ko = (r) => (SPEC.RESOURCES[r] && SPEC.RESOURCES[r].ko) || r;
const topStore = (v, n) => Object.entries(v.storage || {}).filter(([k, q]) => q > 0.5)
  .sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, q]) => `${ko(k)} ${q.toFixed(0)}`).join(' · ');
const jobs = (v) => Object.entries(v.counts || {}).filter(([, n]) => n > 0)
  .sort((a, b) => b[1] - a[1]).map(([j, n]) => `${j}${n}`).join(' ');

const rows = [];
for (const SEED of SEEDS) {
  const world = econV2.createWorldV2({ seed: SEED, villageCount: seeds.length, picker: 'rational', infoRange: 5000, raidPer100: 0.005 });
  world.villages = []; world.events = [];
  for (const s of seeds) {
    const ev = econ.createVillage({ ...s.lp, initialPop: P.INITIAL_POP, name: s.name });
    ev._world = world; ev.coord = { x: s.ccx * 2.5, y: s.ccy * 2.5 };
    world.villages.push(ev);
  }
  world.day = 0;
  const prev = new Map();      // vi → 어제 한 줄
  const peak = new Map();      // vi → [최대 인구, 그 날]
  const died = [];
  const _log = console.log; console.log = () => {};
  for (let d = 0; d < DAYS; d++) {
    econV2.tickWorldV2(world);
    world.villages.forEach((v, i) => {
      const N = (v.npcs || []).length;
      const pk = peak.get(i);
      if (!pk || N > pk[0]) peak.set(i, [N, world.day]);
      if (v._everPop && N === 0 && !died.some((x) => x.i === i)) {
        died.push({ i, v, day: world.day, before: prev.get(i), peak: peak.get(i) });
      }
      prev.set(i, {
        N, dp: v._dpDebug ? JSON.parse(JSON.stringify(v._dpDebug)) : null,
        foodEq: +econ.totalFoodEquivalent(v).toFixed(1),
        prodEq: econ.totalFoodProductionEquivalent ? +econ.totalFoodProductionEquivalent(v).toFixed(2) : null,
        surF: v.surplusEMA ? +v.surplusEMA.food.toFixed(3) : null,
        deadTot: v._deadTot || 0, shieldAte: +(v._shieldAteTot || 0).toFixed(1),
        store: topStore(v, 5), job: jobs(v),
        stats: v.lastStats ? { h: +v.lastStats.happiness.toFixed(2), he: +v.lastStats.health.toFixed(2), p: +(v.lastStats.prestige || 0).toFixed(2) } : null,
      });
    });
  }
  console.log = _log;
  const live = world.villages.filter((v) => (v.npcs || []).length > 0).length;
  const ever = world.villages.filter((v) => v._everPop).length;
  console.log(`\n=== 시드 ${SEED} · ${DAYS}일 · 소멸 ${died.length}/${ever} · 생존 ${live} ===`);
  for (const D of died) {
    const v = D.v, b = D.before || {};
    const L = v.land || {};
    console.log(`  ▸ **${v.name}** (#${D.i}) — 소멸 Day ${D.day} · 최대 인구 ${D.peak[0]}명(Day ${D.peak[1]}) · 누적 아사 ${b.deadTot} · 보호막이 삼킨 압력 ${b.shieldAte}`);
    console.log(`    땅: 해안 ${L.coastal ? 'O' : 'X'}(바다 ${L._seaDistPx != null ? L._seaDistPx + 'px' : '?'}) · 농지 ${(+L.farmland || 0).toFixed(2)} · 숲 ${(+L.forest || 0).toFixed(2)} · 물 ${(+L.water || 0).toFixed(2)} · 광 ${(+L.ore || 0).toFixed(2)} · 돌 ${(+L.stone || 0).toFixed(2)}`);
    console.log(`    죽기 전날: 인구 ${b.N} · 식량equiv ${b.foodEq} · 생산equiv ${b.prodEq} · 식량흐름EMA ${b.surF}`);
    console.log(`      dP분해 ${b.dp ? JSON.stringify(b.dp) : '없음'}`);
    console.log(`      stat ${b.stats ? JSON.stringify(b.stats) : '없음'} · 직군 ${b.job || '없음'} · 창고 ${b.store || '빔'}`);
    rows.push({ seed: SEED, name: v.name, i: D.i, day: D.day, peak: D.peak, b, L });
  }
  if (!died.length) console.log('  (소멸 없음)');
}
console.log('\n=== 한 줄 표 ===');
for (const r of rows) {
  const L = r.L, b = r.b, dp = b.dp || {};
  console.log(`| ${r.seed} | ${r.name}(#${r.i}) | Day ${r.day} | 최대 ${r.peak[0]}명 | 해안 ${L.coastal ? 'O' : 'X'} · 농지 ${(+L.farmland || 0).toFixed(2)} · 숲 ${(+L.forest || 0).toFixed(2)} · 물 ${(+L.water || 0).toFixed(2)} | K ${dp.K} · logi ${dp.logi} · hunger ${dp.hunger} · happy ${dp.happy} · health ${dp.health} | 식량equiv ${b.foodEq} · 흐름 ${b.surF} |`);
}
