#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T429 표 기계)
// =============================================================================
// T429 — 시딩 게이트의 식량 하한이 **무엇을 재나** · 후보마다 그 값.
//
//   게이트 정본: `server/villages.js pickSeedVillages` 의 `landScore`
//     `lp = extractLandParamsApprox(ta, 후보칸, { territory: [] })`  (후보 칸 **한 점**의 땅 · 영토 0)
//     `food = fertility×1.5 + water×1.2 + game×0.7` · `food < FOOD_FLOOR → 0 점(심지 않는다)`
//   ★식은 위 한 줄을 옮겨 적은 것이다 — 그래서 **옮겨 적은 것이 맞는지 정본으로 검사한다**:
//     후보 하나만 넣은 `pickSeedVillages([hv], ta, { seedAll: false })` 가 뽑으면 통과 · 안 뽑으면 탈락.
//     이 둘이 후보 전부에서 같아야 표가 유효하다(`agree` 열). 문턱은 소스에서 읽는다(새 수 0).
//
// 쓰는 법: node scripts/t429-gate-food.js <zoneId> [출력.json]     (env T17_COAST 같은 뜻 · 기본 한반도 끔 · 다른 존 켬)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t429g-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando';
const OUT = process.argv[3] || '';
const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z], SZ = P.SZ;
P.setZoneId(Z);
const SRC = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
const FOOD_FLOOR = +((SRC.match(/const FOOD_FLOOR = ([\d.]+)/) || [])[1]);
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');
const BAND = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
  Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
const isWaterTileLocal = (x, y) => { if (!_inZone(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal: (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y), isWaterTileLocal });
const cands = T.siteCandidates(Z) || [];
const _log = console.log; console.log = () => {};
const rows = cands.map((hv) => {
  let lp = null;
  try { lp = P.extractLandParamsApprox(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ), { territory: [] }); } catch (e) {}
  const f = lp ? { fert: lp.fertility || 0, water: lp.water || 0, game: lp.game || 0 } : { fert: 0, water: 0, game: 0 };
  const food = f.fert * 1.5 + f.water * 1.2 + f.game * 0.7;
  const alone = P.pickSeedVillages([hv], ta, { seedAll: false, max: 0 }).length > 0;
  return { name: hv.name, type: hv.type, fert: +f.fert.toFixed(3), water: +f.water.toFixed(3), game: +f.game.toFixed(3),
    food: +food.toFixed(3), pass: food >= FOOD_FLOOR, alone, agree: (food >= FOOD_FLOOR) === alone,
    ore: lp ? +(lp.ore || 0).toFixed(3) : 0, stone: lp ? +(lp.stone || 0).toFixed(3) : 0, wood: lp ? +(lp.wood || 0).toFixed(3) : 0 };
});
console.log = _log;
const res = { zone: Z, FOOD_FLOOR, seedAll: !!ZONE.seedAllVillages, n: rows.length, agree: rows.every((r) => r.agree), rows };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`[T429 게이트] ${Z} 후보 ${rows.length} · 문턱 ${FOOD_FLOOR} · 존 설정 전수=${res.seedAll} · 옮겨 적은 식 = 정본 선별 ${rows.filter((r) => r.agree).length}/${rows.length}`);
for (const r of rows.filter((x) => x.type === 'mining')) console.log(`  ${r.name.padEnd(6)} food ${r.food.toFixed(2)} (비옥 ${r.fert} ×1.5 + 물 ${r.water} ×1.2 + 사냥 ${r.game} ×0.7) → ${r.pass ? '통과' : '탈락'} · 광맥 ${r.ore}`);
