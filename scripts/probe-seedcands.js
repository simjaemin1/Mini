#!/usr/bin/env node
// === scripts/probe-seedcands.js — 시딩 후보 전수 스캔 ========================
// ★[2026-08-02f ①-1] **손잡이를 만들기 전에 지도부터 읽는다.**
//   배치 지시는 "광산 후보 슬롯 예약, 단 식량 바닥 2.0 은 하드 유지"다. 그런데 그 둘이
//   동시에 성립하려면 **바닥을 넘으면서 광맥도 실한 후보**가 실제로 지도에 있어야 한다.
//   없으면 그 손잡이는 짜도 아무 마을도 안 바꾸는 사문(死文)이고, "구현했다"고 적는 건 거짓이다.
//   그래서 51개 후보를 전수로 찍는다 — 식량 하한 통과 여부·veinScore·구리 지수·선별 결과.
//   지형 부트스트랩은 econ-lab-real.js 와 같은 줄을 쓴다(랩과 같은 인자여야 결과가 같은 세계다).
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = 'hanbando';
const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const E = R('sim/economy-sim');
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z];
const SZ = P.SZ;

P.setZoneId(Z);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (ZONE.isOcean) return true;
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => { if (!_inZone(x, y)) return true; return isRockTileLocal(x, y) || isWaterTileLocal(x, y); };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });

const hard = T.getZoneVillages(Z) || [];
const lpOf = (v) => { try { return P.extractLandParamsApprox(ta, Math.round(v.x / SZ), Math.round(v.y / SZ), { territory: [] }); } catch (e) { return null; } };
const picked = P.pickSeedVillages(hard, ta);
const pickedSet = new Set(picked.map(v => v.name));

const FOOD_FLOOR = 2.0;
const VMIN = E.BOOM_VEIN_MIN != null ? E.BOOM_VEIN_MIN : 1.0;
const rows = [];
for (const v of hard) {
  const lp = lpOf(v); if (!lp) continue;
  const food = (lp.fertility || 0) * 1.5 + (lp.water || 0) * 1.2 + (lp.game || 0) * 0.7;
  const toolAccess = Math.min(1, Math.max(0, (lp.stone || 0) - 0.25) / 0.75 + Math.max(0, (lp.wood || 0) - 0.45) / 1.5);
  const land = food < FOOD_FLOOR ? 0 : food * (0.5 + toolAccess);
  const vein = E.veinScore ? E.veinScore(lp) : 0;
  const mix = lp.oreMix || {};
  const cuIdx = (lp.ore || 0) * (mix.copper || 0);
  rows.push({ name: v.name, type: v.type, food: +food.toFixed(2), land: +land.toFixed(2),
    vein: +vein.toFixed(3), cu: +cuIdx.toFixed(3), boom: !!(E.isBoomtown && E.isBoomtown(lp)),
    pick: pickedSet.has(v.name) });
}
rows.sort((a, b) => b.vein - a.vein);
const pad = (s, w) => String(s).padEnd(w);
console.log(`=== 시딩 후보 전수 (후보 ${rows.length} · 선별 ${picked.length}/${P.VILLAGE_MAX} · 광맥 문턱 ${VMIN}) ===`);
console.log(`${pad('마을', 10)}${pad('타입', 11)}${pad('식량', 7)}${pad('땅점수', 8)}${pad('광맥', 8)}${pad('구리지수', 10)}${pad('부얼', 6)}선별`);
for (const r of rows.slice(0, 24)) {
  console.log(`${pad(r.name, 10)}${pad(r.type, 11)}${pad(r.food, 7)}${pad(r.land, 8)}${pad(r.vein, 8)}${pad(r.cu, 10)}${pad(r.boom ? 'O' : '', 6)}${r.pick ? '✓' : (r.land > 0 ? '·(점수밀림)' : '✗(하한미달)')}`);
}
const dropped = rows.filter(r => !r.pick && r.land > 0);
const droppedVein = dropped.filter(r => r.vein >= VMIN);
console.log(`\n[하한 통과했으나 미선별] ${dropped.length}곳 — 그중 광맥 ${VMIN} 이상: **${droppedVein.length}곳**`);
for (const r of dropped.slice().sort((a, b) => b.vein - a.vein).slice(0, 5)) console.log(`   ${pad(r.name, 10)} 광맥 ${pad(r.vein, 8)} 구리 ${pad(r.cu, 8)} 땅 ${r.land}`);
const belowVein = rows.filter(r => !(r.land > 0) && r.vein >= VMIN);
console.log(`[하한 미달인데 광맥 실함 = 부얼타운 후보] **${belowVein.length}곳**`);
for (const r of belowVein) console.log(`   ${pad(r.name, 10)} 광맥 ${pad(r.vein, 8)} 구리 ${pad(r.cu, 8)} 식량 ${r.food}`);
const pickedRows = rows.filter(r => r.pick);
console.log(`[선별된 곳 중 광맥 상위 3]`);
for (const r of pickedRows.slice(0, 3)) console.log(`   ${pad(r.name, 10)} 광맥 ${pad(r.vein, 8)} 구리 ${r.cu}`);
console.log(`[선별된 곳의 구리 부존 합] ${pickedRows.reduce((a, r) => a + r.cu, 0).toFixed(3)} · 구리 지수>0.1 인 선별 마을 ${pickedRows.filter(r => r.cu > 0.1).length}곳`);
