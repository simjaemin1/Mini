// === scripts/zone-preds.js — 존 지형 술어 셋(계측기 전용 · 한 벌만 있다) ===
//
// ★왜 [T251]
//   `Villages.init(deps)` 가 받는 `isTerrainBlockedLocal`·`isWaterTileLocal`·`isBridgeLocal` 은
//   제품에선 `server/zone.js` 가 만든다(`zone.js:570~650`, 넘기는 줄은 `zone.js:2651`).
//   그런데 `zone.js` 는 **require 하는 순간이 곧 서버 기동**이라 계측기가 부를 수 없다.
//   ⇒ 계측기는 zone.js 가 술어를 **짓는 데 쓴 정본 조각**을 그대로 불러 같은 값을 만든다.
//      조각: `chunk.generateCoastlineWaterTiles` · `zone-config.findZoneAt` · `ZONE.bridges` ·
//            `terrain.isWaterCellLocal` · `terrain.isRockCellLocal`. **이 파일이 지어낸 수·표는 0 이다.**
//
// ⚠사본 규약: 이 파일은 **한 벌만** 있어야 한다. 계측기가 각자 술어를 다시 적으면 그게 사본이고,
//   T232→T251 이 정확히 그래서 갈렸다(`isTerrainBlockedLocal: () => false` · `land.fertility` 0.99→0.42).
//   zone.js 의 저 세 함수가 바뀌면 **여기도 같이** 고쳐라.
//
// ⚠도랑(`isDitchTileLocal`)은 뺐다 — 제품에서도 `DITCH_CELLS` 는 `SimVillages.init` **직후**에 채워진다
//   (`zone.js:2686 refreshDitchCells()`). 땅을 세우는 순간엔 제품도 비어 있다.
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');

function makeZonePreds(zoneId) {
  const ZC = require(path.join(ROOT, 'server/zone-config'));
  const CHUNK = require(path.join(ROOT, 'server/chunk'));
  const terrain = require(path.join(ROOT, 'server/terrain'));
  const { ZONES } = ZC;
  const ZONE = ZONES[zoneId];
  const SZ = 32;                                   // zone.js:550 도 리터럴 32 다(BUILDING_SIZE TDZ 회피)

  // zone.js:551~557 — 해안선 물 띠
  const OCEAN_RECTS = Object.values(ZONES).filter((z) => z.isOcean)
    .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
  const WATER_TILES = CHUNK.generateCoastlineWaterTiles({ ...ZONE, id: zoneId }, SZ, ZC.findZoneAt, OCEAN_RECTS);

  // zone.js:618~624 — 다리 셀
  const BRIDGE_CELLS = new Set();
  { const bl = (ZONE && ZONE.bridges) || null;
    if (bl && bl.length) for (let i = 0; i + 1 < bl.length; i += 2) BRIDGE_CELLS.add(bl[i] + '_' + bl[i + 1]); }
  const isBridgeTileLocal = (x, y) => (!BRIDGE_CELLS.size ? false : BRIDGE_CELLS.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ)));

  const inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);

  // zone.js:570~583
  const isWaterTileLocal = (x, y) => {
    if (ZONE.isOcean) return true;
    if (!inZone(x, y)) return false;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (WATER_TILES.has(tx + '_' + ty)) return true;
    try { return !!terrain.isWaterCellLocal(zoneId, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch (e) { return false; }
  };
  // zone.js:599~608 — **타일 중심**으로 묻는다(픽셀 그대로 묻는 판과 값이 다르다)
  const isRockTileLocal = (x, y) => {
    if (ZONE.isOcean) return false;
    if (!inZone(x, y)) return false;
    if (typeof terrain.isRockCellLocal !== 'function') return false;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    try { return !!terrain.isRockCellLocal(zoneId, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch (e) { return false; }
  };
  // zone.js:643~649 — 바위 > 도랑(기동 시점 공집합) > (물 ∧ ¬다리)
  const isTerrainBlockedLocal = (x, y) => {
    if (isRockTileLocal(x, y)) return true;
    if (isWaterTileLocal(x, y)) return !isBridgeTileLocal(x, y);
    return false;
  };
  return { SZ, ZONE, isWaterTileLocal, isRockTileLocal, isTerrainBlockedLocal, isBridgeTileLocal,
    waterTiles: WATER_TILES.size, bridgeCells: BRIDGE_CELLS.size };
}
module.exports = { makeZonePreds };
