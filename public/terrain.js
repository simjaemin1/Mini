// === server/terrain.js — zone별 지리 (강·호수·숲·산·광맥) ===
// Phase 5-E: hardcoded 폐기. 모든 zone이 procedural generation (terrain-gen.js).
//   seeded RNG 기반 — 같은 zone은 항상 같은 layout. zoneId만 같으면 결정론적.
//   정확한 지리 X — 분포만 맞춤. 경계 모호화 OK (광맥·산이 인접 zone 걸침).
//
// shape 종류:
//   - lake.shape='circle': { center, radius }
//   - lake.shape='ellipse': { center, a, b, rotation }
//   - lake.shape='multi':   { circles: [{center, radius}, ...] }
//   - 강 path: [ {pos: [x,y], width: N}, ... ] — segment별 width 보간
//
// API:
//   ZONE_TERRAIN[zoneId]
//   isWaterCellLocal(zoneId, localX, localY)
//   getTerrainWaterTilesForChunk(zoneId, cx, cy, chunkSize)
//   getForestMultiplier(zoneId, x, y)
//   getStoneMultiplier(zoneId, x, y)
//   isOreClusterAt(zoneId, x, y)
//   getTileType(zoneId, x, y)
//
// 사용 패턴:
//   서버: 자동으로 zone-config의 ZONES 활용
//   클라: setZonesMeta(metas) 한 번 호출 후 사용

'use strict';

// === Lazy generation cache ===
const _generated = new Map();
let _zonesMetaCache = null;

// === Hardcoded terrain (Phase 5-G — server welcome에서 받은 한반도·인접 강·호수) ===
let _hardcodedCache = {};
function setHardcoded(zoneId, data) {
  if (!zoneId) return;
  _hardcodedCache[zoneId] = data || null;
  _generated.delete(zoneId);
}

function _getZonesMeta() {
  if (_zonesMetaCache) return _zonesMetaCache;
  // 서버 측 — zone-config 자동 require (한 번 cache)
  try {
    const { ZONES } = require('./zone-config');
    _zonesMetaCache = ZONES;
    return ZONES;
  } catch {}
  // 클라 측 — 매번 새로 받음 (zone이 동적 추가될 수 있음, cache X)
  if (typeof window !== 'undefined' && typeof window.__getZonesMeta === 'function') {
    return window.__getZonesMeta();
  }
  return null;
}

function setZonesMeta(metas) {
  _zonesMetaCache = metas;
  _generated.clear();
}

function _getZoneTerrain(zoneId) {
  if (_generated.has(zoneId)) return _generated.get(zoneId);
  const metas = _getZonesMeta();
  if (!metas) return null;
  const meta = metas[zoneId];
  if (!meta) return null;
  let gen;
  try { gen = require('./terrain-gen'); }
  catch { gen = (typeof window !== 'undefined') ? window.TerrainGen : null; }
  if (!gen) return null;
  const data = gen.generateZoneTerrain(zoneId, meta);
  // hardcoded override (한반도는 강·호수 모두 교체, 나머지는 추가)
  const hc = _hardcodedCache[zoneId];
  if (hc) {
    if (zoneId === 'hanbando') {
      // Phase 5-G: cleanZone — 강·호수만, 숲·산·광맥 제거
      data.rivers    = hc.rivers || [];
      data.lakes     = hc.lakes  || [];
      data.ridges    = hc.ridges || []; // Phase 5-H: 산맥
      data.passes    = hc.passes || [];
      data.forests   = [];
      data.mountains = [];
      data.ores      = [];
    } else {
      if (hc.rivers && hc.rivers.length) data.rivers = [...(data.rivers || []), ...hc.rivers];
      if (hc.lakes  && hc.lakes.length)  data.lakes  = [...(data.lakes  || []), ...hc.lakes];
      if (hc.ridges && hc.ridges.length) data.ridges = [...(data.ridges || []), ...hc.ridges];
      if (hc.passes && hc.passes.length) data.passes = [...(data.passes || []), ...hc.passes];
    }
  }
  _generated.set(zoneId, data);
  return data;
}

// === ZONE_TERRAIN — lazy Proxy (zone id로 access 시 자동 generate) ===
const ZONE_TERRAIN = new Proxy({}, {
  get(_, zoneId) {
    if (typeof zoneId !== 'string') return undefined;
    return _getZoneTerrain(zoneId);
  },
  ownKeys() {
    const metas = _getZonesMeta();
    return metas ? Object.keys(metas) : [];
  },
  getOwnPropertyDescriptor(_, zoneId) {
    return { enumerable: true, configurable: true, value: _getZoneTerrain(zoneId) };
  },
  has(_, zoneId) {
    const metas = _getZonesMeta();
    return !!(metas && metas[zoneId]);
  },
});

// === helpers ===
function _pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 0.0001) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return { dist: Math.hypot(px - projX, py - projY), t };
}

function _isPointInLake(x, y, lake) {
  if (lake.shape === 'multi') {
    for (const c of lake.circles) {
      const dx = x - c.center[0], dy = y - c.center[1];
      if (dx * dx + dy * dy < c.radius * c.radius) return true;
    }
    return false;
  }
  if (lake.shape === 'ellipse') {
    const cx = lake.center[0], cy = lake.center[1];
    const rot = lake.rotation || 0;
    const dx = x - cx, dy = y - cy;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    return (lx * lx) / (lake.a * lake.a) + (ly * ly) / (lake.b * lake.b) < 1;
  }
  // default: circle
  const dx = x - lake.center[0], dy = y - lake.center[1];
  return dx * dx + dy * dy < lake.radius * lake.radius;
}

function _isPointInRiver(x, y, river) {
  if (!river.path || river.path.length < 2) return false;
  // bbox 조기 기각 — v7 스무딩으로 강 path점이 ~15배 폭증(296→4599). 셀마다 전체 path를 스캔하면
  //   물·바위 판정이 느려지고, welcome마다 캐시를 비우면 재계산이 메인 루프를 멈춰 orphan 재연결 루프를 유발.
  //   path bbox(+최대폭) 밖이면 즉시 false → 대부분의 강을 O(1)로 건너뜀.
  let bb = river._bbox;
  if (bb === undefined) {
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, maxW = 0;
    for (const _p of river.path) {
      const px = _p.pos ? _p.pos[0] : _p[0], py = _p.pos ? _p.pos[1] : _p[1];
      const w = (_p.width != null) ? _p.width : (river.width || 200);
      if (px < bx0) bx0 = px; if (px > bx1) bx1 = px;
      if (py < by0) by0 = py; if (py > by1) by1 = py;
      if (w > maxW) maxW = w;
    }
    const m = maxW / 2 + 1;
    bb = river._bbox = [bx0 - m, by0 - m, bx1 + m, by1 + m];
  }
  if (x < bb[0] || x > bb[2] || y < bb[1] || y > bb[3]) return false;
  for (let i = 0; i < river.path.length - 1; i++) {
    const p1 = river.path[i], p2 = river.path[i + 1];
    const x1 = p1.pos ? p1.pos[0] : p1[0];
    const y1 = p1.pos ? p1.pos[1] : p1[1];
    const x2 = p2.pos ? p2.pos[0] : p2[0];
    const y2 = p2.pos ? p2.pos[1] : p2[1];
    const w1 = (p1.width != null) ? p1.width : (river.width || 200);
    const w2 = (p2.width != null) ? p2.width : (river.width || 200);
    const r = _pointToSegmentDist(x, y, x1, y1, x2, y2);
    const halfWidth = (w1 + (w2 - w1) * r.t) / 2;
    if (r.dist < halfWidth) return true;
  }
  return false;
}

function isWaterCellLocal(zoneId, localX, localY) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t) return false;
  for (const lake of t.lakes || []) {
    if (_isPointInLake(localX, localY, lake)) return true;
  }
  for (const river of t.rivers || []) {
    if (_isPointInRiver(localX, localY, river)) return true;
  }
  return false;
}

function getTerrainWaterTilesForChunk(zoneId, cx, cy, chunkSize) {
  const tiles = new Set();
  const t = ZONE_TERRAIN[zoneId];
  if (!t) return tiles;
  const CELL = 32;
  const tilesPerChunk = Math.ceil(chunkSize / CELL);
  const startTx = cx * tilesPerChunk;
  const startTy = cy * tilesPerChunk;
  for (let dy = 0; dy < tilesPerChunk; dy++) {
    for (let dx = 0; dx < tilesPerChunk; dx++) {
      const tx = startTx + dx, ty = startTy + dy;
      const cellX = tx * CELL + CELL / 2;
      const cellY = ty * CELL + CELL / 2;
      if (isWaterCellLocal(zoneId, cellX, cellY)) {
        tiles.add(`${tx}_${ty}`);
      }
    }
  }
  return tiles;
}

function getForestMultiplier(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.forests) return 1.0;
  let m = 1.0;
  for (const f of t.forests) {
    const [x1, y1, x2, y2] = f.rect;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2 && f.densityMult > m) m = f.densityMult;
  }
  return m;
}

function getStoneMultiplier(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.mountains) return 1.0;
  let m = 1.0;
  for (const mt of t.mountains) {
    const [x1, y1, x2, y2] = mt.rect;
    if (x >= x1 && x <= x2 && y >= y1 && y <= y2 && mt.stoneMult > m) m = mt.stoneMult;
  }
  return m;
}

function isOreClusterAt(zoneId, x, y) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.ores) return null;
  for (const o of t.ores) {
    const dx = x - o.center[0];
    const dy = y - o.center[1];
    if (dx * dx + dy * dy < o.radius * o.radius) return o;
  }
  return null;
}

// === 미니맵용 — cell 종류 결정 ===
// 우선순위: water > ore > mountain > forest > plain
// === Phase 5-H: 산맥(바위) 셀 판정 — 통행 불가. 고개(pass) > 물 > 바위 우선. ===
function isRockCellLocal(zoneId, localX, localY) {
  const t = ZONE_TERRAIN[zoneId];
  if (!t || !t.ridges || t.ridges.length === 0) return false;
  let inRidge = false;
  for (const ridge of t.ridges) {
    if (_isPointInRiver(localX, localY, ridge)) { inRidge = true; break; }
  }
  if (!inRidge) return false;
  for (const q of t.passes || []) {
    const dx = localX - q.pos[0], dy = localY - q.pos[1];
    if (dx * dx + dy * dy < q.radius * q.radius) return false;
  }
  if (isWaterCellLocal(zoneId, localX, localY)) return false;
  return true;
}

function getTileType(zoneId, x, y) {
  if (isWaterCellLocal(zoneId, x, y)) return 'water';
  if (isRockCellLocal(zoneId, x, y)) return 'rock';
  if (isOreClusterAt(zoneId, x, y)) return 'ore';
  if (getStoneMultiplier(zoneId, x, y) > 1.5) return 'mountain';
  if (getForestMultiplier(zoneId, x, y) > 1.5) return 'forest';
  return 'plain';
}

// Dual export — server (CommonJS) + browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZONE_TERRAIN,
    setZonesMeta,
    setHardcoded,
    isWaterCellLocal,
    isRockCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    getTileType,
  };
}
if (typeof window !== 'undefined') {
  window.Terrain = {
    ZONE_TERRAIN,
    setZonesMeta,
    setHardcoded,
    isWaterCellLocal,
    isRockCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    getTileType,
  };
}
