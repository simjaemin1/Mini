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

// === Hardcoded terrain override (한반도 + 인접 STRIP 영역) ===
// hanbando-terrain.json (SVG에서 export)에 정의된 zone은 강·호수가 hardcoded로 교체됨.
// 나머지 (산·숲·광맥) procedural 그대로.
let _hardcodedCache = null;
function _getHardcoded() {
  if (_hardcodedCache !== null) return _hardcodedCache;
  try { _hardcodedCache = require('./hanbando-terrain.json') || {}; }
  catch { _hardcodedCache = {}; }
  return _hardcodedCache;
}

// 하드코딩 마을 (한반도 — 에디터 v9에서 주입). 있으면 zone.js가 procedural 대신 사용.
// 형식: [{ name, x, y, type }] — generateVillagesForZone 출력과 동일.
function getZoneVillages(zoneId) {
  const hc = _getHardcoded();
  return (hc[zoneId] && Array.isArray(hc[zoneId].villages) && hc[zoneId].villages.length) ? hc[zoneId].villages : null;
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

// 클라가 zone welcome에서 받은 hardcoded terrain을 설정 (server에서 broadcast된 data)
function setHardcoded(zoneId, data) {
  if (!_hardcodedCache || typeof _hardcodedCache !== 'object') _hardcodedCache = {};
  if (data) _hardcodedCache[zoneId] = data;
  // 해당 zone cache 무효화 → 다음 access 시 새 데이터로 재생성
  _generated.delete(zoneId);
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
  // hardcoded override — hanbando·bering·jungwon_n·nippon에 SVG 강·호수 적용
  // hanbando는 강·호수 모두 교체 (procedural 무시).
  // bering·jungwon_n·nippon은 STRIP 영역만 hardcoded라 procedural에 추가.
  const hc = _getHardcoded();
  if (hc[zoneId]) {
    // 완전 교체 (world v7 빌드) — 하드코딩 지형이 있는 그려진 존은 손 지형만 사용.
    //   강·호수·산맥·고개·숲 = 손으로 그린 것으로 교체.
    //   절차 산(mountains) 제거 — 산맥(ridges)이 대신함.
    //   광맥(ores)은 에디터에서 그릴 수 없으므로 절차생성 유지 (제거하면 채광 0).
    data.rivers    = hc[zoneId].rivers  || [];
    data.lakes     = hc[zoneId].lakes   || [];
    data.ridges    = hc[zoneId].ridges  || [];
    data.passes    = hc[zoneId].passes  || [];
    data.valleys   = hc[zoneId].valleys || [];   // ★[11차] 계곡 = 산맥을 가로지르는 선형 통로(강과 같은 path+width)
    data.forests   = hc[zoneId].forests || [];
    data.mountains = [];
    // 광맥(ores): 손그림(v8)이 있으면 그걸로 교체. 광물 종류는 zone.js가 biome 보고 배정.
    if (hc[zoneId].ores && hc[zoneId].ores.length) data.ores = hc[zoneId].ores;
    // 없으면 절차 ores 유지.
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

// 호수 경계 각도별 wobble — 완벽한 원/타원 대신 살짝 울퉁불퉁. 중심좌표 시드로 호수마다 고유·결정론적.
function _lakeWobble(center, ang) {
  const s = center[0] * 0.0131 + center[1] * 0.0237;
  return 1 + 0.13 * Math.sin(ang * 3 + s)
           + 0.08 * Math.sin(ang * 5 - s * 1.7)
           + 0.05 * Math.sin(ang * 7 + s * 0.6);
}
function _isPointInLake(x, y, lake) {
  if (lake.shape === 'multi') {
    for (const c of lake.circles) {
      const dx = x - c.center[0], dy = y - c.center[1];
      const R = c.radius * 1.3;
      if (dx < -R || dx > R || dy < -R || dy > R) continue; // bbox 조기기각(atan2 회피)
      const w = _lakeWobble(c.center, Math.atan2(dy, dx)) * c.radius;
      if (dx * dx + dy * dy < w * w) return true;
    }
    return false;
  }
  if (lake.shape === 'ellipse') {
    const dx = x - lake.center[0], dy = y - lake.center[1];
    const R = (lake.a > lake.b ? lake.a : lake.b) * 1.3;
    if (dx < -R || dx > R || dy < -R || dy > R) return false;
    const rot = lake.rotation || 0;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const w = _lakeWobble(lake.center, Math.atan2(ly, lx));
    return (lx * lx) / (lake.a * lake.a) + (ly * ly) / (lake.b * lake.b) < w * w;
  }
  // default: circle
  const dx = x - lake.center[0], dy = y - lake.center[1];
  const R = lake.radius * 1.3;
  if (dx < -R || dx > R || dy < -R || dy > R) return false;
  const w = _lakeWobble(lake.center, Math.atan2(dy, dx)) * lake.radius;
  return dx * dx + dy * dy < w * w;
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

// === Phase 5-H: 산맥(바위) 셀 판정 — 통행 불가 ===
// ridge는 강과 동일한 path+width 형식. 우선순위: 계곡·고개 > 물 > 바위.
//   - pass radius 안 = 통행 가능 (고개 — 능선을 낮춰 넘어가는 자리. 원)
//   - ★[11차 재민 확정] valley = 산맥을 **가로지르는 선형 통로**(강과 같은 path+width). 폭이 좁고 길어
//     '계곡'이라는 말이 맞고, 반지름 50셀짜리 원처럼 산을 100m씩 통째로 지워 버리지 않는다.
//     산은 완벽한 콜라이더다 — 뚫려 있는 곳은 **처음부터 뚫려 있는 이 두 종류뿐**이다.
//   - 물과 겹치면 물 (강이 협곡으로 관통 — 셀은 water로 렌더·판정)
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
  for (const v of t.valleys || []) {
    if (_isPointInRiver(localX, localY, v)) return false;
  }
  if (isWaterCellLocal(zoneId, localX, localY)) return false;
  return true;
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
    let inside = false;
    if (f.rect) {                                  // 절차생성 숲 (사각형)
      const [x1, y1, x2, y2] = f.rect;
      inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
    } else if (f.center) {                          // 손으로 그린 숲 (타원 center/rx/ry)
      const rx = f.rx || f.a || 1, ry = f.ry || f.b || 1;
      const dx = (x - f.center[0]) / rx, dy = (y - f.center[1]) / ry;
      inside = dx * dx + dy * dy <= 1;
    }
    const dm = f.densityMult || f.density || 1.0;
    if (inside && dm > m) m = dm;
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

// ═══════════════════════════════════════════════════════════════════════════
// 광석 확률 p — **연속장** [11차 재민 확정]
// ═══════════════════════════════════════════════════════════════════════════
// 구 규약: 광맥은 완벽한 원이고 그 안이면 어디나 동일. 밖이면 광석 0. 경계에서 뚝 끊겼다.
// 신 규약: 캐면 어디서든 돌덩이가 나오고, 그게 **광석일 확률 p** 만 자리마다 다르다.
//   p(x,y) = p_peak × (1 − d/R)^1.2 × (0.5 + fbm(x/24셀, y/24셀))     · 광맥 밖 = 0
//   · 값 저장 없음 — 좌표에서 결정론적으로 계산(존 전체 셀에 필드를 들 필요가 없다).
//   · **연속성이 구조적으로 보장**된다: fbm 격자가 24셀이라 인접 셀 간 p 급변이 불가능
//     ("이 셀 0.05인데 옆 셀 0.8" 이 일어날 수 없다 — 재민 요구).
//   · 노이즈가 falloff에 곱해지므로 **경계도 원이 아니다**. 모양을 따로 정의할 필요가 없어졌다.
//   · p_peak 은 클러스터 속성(pk). 미지정이면 tier 기본값 — 넓지만 가난한 광맥도 표현된다.
const _ORE_P_GAMMA = 1.2;      // falloff 지수 — 클수록 중심 집중
const _ORE_P_GRID = 24 * 32;   // 노이즈 격자(px) = 24셀. 이 길이 스케일로 완만하게 변한다
const _ORE_P_DEFAULT_PK = 0.33;

function _oHash(ix, iy, s) {
  let h = (ix | 0) * 374761393 + (iy | 0) * 668265263 + (s | 0) * 1274126177;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function _oVN(x, y, s) {   // value noise + smoothstep 보간(연속·C1)
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = _oHash(x0, y0, s), b = _oHash(x0 + 1, y0, s);
  const c = _oHash(x0, y0 + 1, s), d = _oHash(x0 + 1, y0 + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
function _oFbm(x, y, s) { let t = 0, a = 0.5, f = 1; for (let i = 0; i < 3; i++) { t += a * _oVN(x * f, y * f, s + i * 31); a *= 0.5; f *= 2; } return t; }

// 이 좌표(px)에서 캔 덩이가 광석일 확률. 광맥 밖이면 0(= 캐도 영원히 돌만 나온다).
function oreProbAt(zoneId, x, y) {
  const o = isOreClusterAt(zoneId, x, y);
  if (!o) return 0;
  const dx = x - o.center[0], dy = y - o.center[1];
  const d = Math.sqrt(dx * dx + dy * dy) / (o.radius || 1);
  if (d >= 1) return 0;
  const pk = (typeof o.pk === 'number') ? o.pk : _ORE_P_DEFAULT_PK;
  const seed = ((o.center[0] | 0) * 7 + (o.center[1] | 0) * 13 + 911) | 0;
  const n = 0.5 + _oFbm(x / _ORE_P_GRID, y / _ORE_P_GRID, seed);
  const p = pk * Math.pow(1 - d, _ORE_P_GAMMA) * n;
  return p < 0 ? 0 : (p > 1 ? 1 : p);
}

// === 미니맵용 — cell 종류 결정 ===
// 우선순위: water > ore > mountain > forest > plain
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
    _getHardcoded,
    getZoneVillages,
    isWaterCellLocal,
    isRockCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    oreProbAt,
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
    oreProbAt,
    getTileType,
  };
}
