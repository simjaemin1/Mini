// === server/terrain.js — zone별 지리 (강·호수·숲·산·광맥) ===
// Phase 5-1 (보강): 사실적 캐나다 매핑
//
// scale 가정: 1 px ≈ 1.35 km (zone 110K px ≈ 캐나다 동서 5,500 km × 0.55)
//   - 호수 면적: 실제 비율 (km² × 550 ≈ 면적 px²)
//   - 강 폭: 시각상 ×10 확대 (1 km 강 → 7~8 px가 아닌 70~80 px)
//
// shape 종류:
//   - lake.shape='circle': { center, radius }
//   - lake.shape='ellipse': { center, a, b, rotation } — 길쭉한 호수
//   - lake.shape='multi':   { circles: [{center, radius}, ...] } — 복잡 형상
// 강 path: [ {pos: [x,y], width: N}, ... ] — segment별 width 보간
//
// API:
//   ZONE_TERRAIN[zoneId]
//   isWaterCellLocal(zoneId, localX, localY)
//   getTerrainWaterTilesForChunk(zoneId, cx, cy, chunkSize)
//   getForestMultiplier(zoneId, x, y) — tree density 배율
//   getStoneMultiplier(zoneId, x, y) — stone density 배율
//   isOreClusterAt(zoneId, x, y)
//   getTileType(zoneId, x, y) — 미니맵용: 'water'|'forest'|'mountain'|'ore'|'plain'

const ZONE_TERRAIN = {
  // === 캐나디아 — 실제 캐나다 지도 모티브 ===
  // x: 0~110000 (서→동, 밴쿠버→핼리팩스, 5500 km)
  // y: 0~50000  (북→남, 북극해→미국 국경, 2500 km)
  canadia: {
    rivers: [
      // 유콘강 — 알래스카 방향 (서북→서)
      // 실제 길이 3,190 km, 폭 평균 500m~2km
      { name: '유콘강', path: [
        { pos: [15000, 3500], width: 80 },
        { pos: [11000, 4500], width: 120 },
        { pos: [7000, 6000],  width: 160 },
        { pos: [4000, 7500],  width: 200 },
        { pos: [2000, 8500],  width: 250 },  // 알래스카 국경 (게임 zone 서변)
      ]},
      // 마켄지강 — 그레이트슬레이브호 → 북극해 (북서)
      // 실제 1,738 km, 하구 7~10 km
      { name: '마켄지강', path: [
        { pos: [27000, 11000], width: 200 },  // 그레이트슬레이브호 유출
        { pos: [25000, 8500],  width: 350 },
        { pos: [23500, 6000],  width: 500 },
        { pos: [22500, 4000],  width: 700 },
        { pos: [22000, 2000],  width: 1000 }, // 북극해 하구
      ]},
      // 프레이저강 — 로키 산맥 → 태평양 (서남)
      // 실제 1,375 km, 하구 1 km
      { name: '프레이저강', path: [
        { pos: [16000, 18000], width: 80 },   // 로키 발원
        { pos: [13000, 21000], width: 120 },
        { pos: [10000, 24000], width: 180 },
        { pos: [7000, 26500],  width: 250 },  // 태평양 하구
      ]},
      // 콜롬비아강 — 캐나다 BC → 미국 (서남, 짧게)
      // 실제 2,000 km (캐나다 측 약 500 km)
      { name: '콜롬비아강', path: [
        { pos: [13000, 25000], width: 100 },
        { pos: [11000, 28000], width: 160 },
        { pos: [9000, 30000],  width: 220 },
      ]},
      // 세인트로렌스강 — 5대호 → 대서양 (동)
      // 실제 3,058 km, 하구 80~100 km (게임상 시각 ÷10)
      { name: '세인트로렌스강', path: [
        { pos: [90000, 33000],  width: 350 },  // 온타리오호 유출
        { pos: [94000, 31500],  width: 500 },
        { pos: [98000, 30000],  width: 800 },
        { pos: [102000, 28000], width: 1300 },
        { pos: [105500, 26000], width: 2200 },
        { pos: [108500, 24000], width: 3500 }, // 대서양 하구 (산로렌만)
      ]},
      // 처칠강 — 중북 → 허드슨만
      // 실제 1,609 km
      { name: '처칠강', path: [
        { pos: [38000, 18000], width: 100 },
        { pos: [45000, 16500], width: 160 },
        { pos: [51000, 15000], width: 220 },
        { pos: [55000, 14000], width: 280 },   // 허드슨만 입수
      ]},
      // 넬슨강 — 위니펙호 → 허드슨만
      // 실제 644 km, 큰 강
      { name: '넬슨강', path: [
        { pos: [55000, 22000], width: 200 },   // 위니펙호 유출
        { pos: [55500, 19000], width: 300 },
        { pos: [55000, 16000], width: 400 },
        { pos: [54000, 14000], width: 500 },   // 허드슨만
      ]},
      // 올바니강 — 동중 → 허드슨만 (제임스만)
      { name: '올바니강', path: [
        { pos: [68000, 22000], width: 100 },
        { pos: [65000, 19500], width: 150 },
        { pos: [62000, 17500], width: 220 },
      ]},
      // 레드강 — 남에서 위니펙호로 (북향)
      { name: '레드강', path: [
        { pos: [54000, 28000], width: 80 },
        { pos: [54500, 25000], width: 120 },
        { pos: [55000, 22500], width: 180 },   // 위니펙호 유입
      ]},
      // 미시시피강 (캐나다 X지만 게임 zone 남쪽 가장자리 표시)
      // 생략 — 미국 zone에서 처리
    ],
    lakes: [
      // ── 허드슨만 (실제 1.23M km², 캐나다 면적의 12% — multi-circle 큰 만) ──
      { name: '허드슨만', shape: 'multi', circles: [
        { center: [50000, 13000], radius: 6500 },
        { center: [58000, 12000], radius: 6500 },
        { center: [62000, 16000], radius: 5500 },
        { center: [54000, 18000], radius: 5500 },
        { center: [47000, 17000], radius: 4500 },
        { center: [64000, 20000], radius: 4000 }, // 제임스만 (남부 연장)
        { center: [68000, 17500], radius: 3500 },
      ]},
      // ── 5대호 (실제 비율 — 일부 미국 zone 경계 가까이) ──
      // 슈피리어호 (82,100 km², 가로 560×260km — 가장 길쭉)
      { name: '슈피리어호', shape: 'ellipse',
        center: [73000, 32500], a: 4500, b: 2000, rotation: -0.15 },
      // 미시간호 (58,000 km², 길쭉 세로 — 미국 zone 경계)
      { name: '미시간호', shape: 'ellipse',
        center: [77000, 37000], a: 1700, b: 3800, rotation: 0 },
      // 휴런호 (59,600 km², 둥글지만 약간 길쭉)
      { name: '휴런호', shape: 'ellipse',
        center: [82000, 33000], a: 2800, b: 2200, rotation: 0.2 },
      // 이리호 (25,700 km², 가로 길쭉)
      { name: '이리호', shape: 'ellipse',
        center: [85000, 36500], a: 2200, b: 900, rotation: -0.1 },
      // 온타리오호 (19,000 km², 가로 길쭉)
      { name: '온타리오호', shape: 'ellipse',
        center: [89000, 34000], a: 1800, b: 800, rotation: 0 },

      // ── 캐나다 내륙 큰 호수 (사실적 비율) ──
      // 그레이트베어호 (31,000 km², 십자 모양)
      { name: '그레이트베어호', shape: 'multi', circles: [
        { center: [18000, 4500], radius: 1800 },
        { center: [21000, 5000], radius: 1600 },
        { center: [19500, 6500], radius: 1400 },
        { center: [16500, 6000], radius: 1200 },
      ]},
      // 그레이트슬레이브호 (28,000 km², L자 길쭉)
      { name: '그레이트슬레이브호', shape: 'multi', circles: [
        { center: [27000, 10500], radius: 1700 },
        { center: [29500, 11500], radius: 1400 },
        { center: [25000, 11000], radius: 1300 },
      ]},
      // 위니펙호 (24,500 km², 남북 길쭉)
      { name: '위니펙호', shape: 'ellipse',
        center: [55000, 22500], a: 1000, b: 2200, rotation: 0 },
      // 위니페고시스호 (5,400 km²)
      { name: '위니페고시스호', shape: 'ellipse',
        center: [50000, 23500], a: 700, b: 1400, rotation: -0.2 },
      // 마니토바호 (4,624 km²)
      { name: '마니토바호', shape: 'ellipse',
        center: [52500, 24500], a: 600, b: 1500, rotation: 0 },
      // 아타바스카호 (7,850 km², 동서 길쭉)
      { name: '아타바스카호', shape: 'ellipse',
        center: [30000, 13000], a: 1700, b: 600, rotation: 0.1 },
      // 레인디어호 (6,650 km², 좀 길쭉)
      { name: '레인디어호', shape: 'ellipse',
        center: [36000, 14500], a: 800, b: 1500, rotation: 0.3 },
      // 누에치카니카호 (1,950 km², 작음)
      { name: '누에치카니카호', shape: 'circle',
        center: [40000, 12500], radius: 900 },
    ],
    forests: [
      // 보리얼 forest — 캐나다 가로띠 (taiga + 침엽수 띠)
      // 실제로 캐나다 면적의 50% (북위 50~60°)
      { name: '보리얼 포레스트', rect: [3000, 13000, 108000, 27000], densityMult: 2.2 },
      // 알공킨 숲 — 동부 (온타리오·퀘벡 활엽수)
      { name: '알공킨 숲', rect: [78000, 27000, 105000, 35000], densityMult: 1.6 },
      // 태평양 코스트 레인포레스트 — 서해안
      { name: '태평양 우림', rect: [3000, 22000, 12000, 35000], densityMult: 1.8 },
    ],
    mountains: [
      // 로키 산맥 — 서쪽 세로띠 (BC·앨버타)
      { name: '로키 산맥', rect: [10000, 8000, 20000, 35000], stoneMult: 3.0 },
      // 코스트 산맥 — 더 서쪽 (해안)
      { name: '코스트 산맥', rect: [3500, 15000, 9000, 35000], stoneMult: 2.5 },
      // 캐나디안 실드 — 중북부 (오래된 암반 지대)
      { name: '캐나디안 실드', rect: [30000, 13000, 78000, 26000], stoneMult: 1.5 },
      // 애팔래치아 — 동남 (작게)
      { name: '애팔래치아', rect: [98000, 36000, 108000, 48000], stoneMult: 2.0 },
    ],
    ores: [
      // 클론다이크 골드러시 — 유콘 (서북)
      { name: '클론다이크 금광', center: [6000, 4500], radius: 800, oreType: 'gold' },
      // 슈드베리 분지 — 세계 최대 니켈 매장 (중동부)
      { name: '슈드베리 니켈광', center: [83000, 30000], radius: 1100, oreType: 'nickel' },
      // 앨버타 타르샌드 — 중서 (석유)
      { name: '앨버타 타르샌드', center: [22000, 19000], radius: 1500, oreType: 'iron' },
      // 로키 광맥 (BC 금·구리)
      { name: '로키 광맥', center: [15000, 20000], radius: 900, oreType: 'iron' },
      // 헤메즈 광맥 (NWT 다이아몬드)
      { name: '에카티 다이아몬드', center: [24000, 8000], radius: 600, oreType: 'gold' },
      // 보트우드 철광 (라브라도르)
      { name: '라브라도르 철광', center: [88000, 22000], radius: 1100, oreType: 'iron' },
    ],
  },
};

// === helpers ===
function _pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { dist: Math.hypot(px - x1, py - y1), t: 0 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  const projX = x1 + t * dx, projY = y1 + t * dy;
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
  for (let i = 0; i < river.path.length - 1; i++) {
    const p1 = river.path[i], p2 = river.path[i + 1];
    // 새 format {pos, width} 또는 옛 format [x, y]
    const x1 = p1.pos ? p1.pos[0] : p1[0];
    const y1 = p1.pos ? p1.pos[1] : p1[1];
    const x2 = p2.pos ? p2.pos[0] : p2[0];
    const y2 = p2.pos ? p2.pos[1] : p2[1];
    const w1 = (p1.width != null) ? p1.width : (river.width || 200);
    const w2 = (p2.width != null) ? p2.width : (river.width || 200);
    const r = _pointToSegmentDist(x, y, x1, y1, x2, y2);
    const halfWidth = (w1 + (w2 - w1) * r.t) / 2;  // 폭 보간
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
function getTileType(zoneId, x, y) {
  if (isWaterCellLocal(zoneId, x, y)) return 'water';
  if (isOreClusterAt(zoneId, x, y)) return 'ore';
  if (getStoneMultiplier(zoneId, x, y) > 1.5) return 'mountain';
  if (getForestMultiplier(zoneId, x, y) > 1.5) return 'forest';
  return 'plain';
}

// Dual export — server (CommonJS) + browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ZONE_TERRAIN,
    isWaterCellLocal,
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
    isWaterCellLocal,
    getTerrainWaterTilesForChunk,
    getForestMultiplier,
    getStoneMultiplier,
    isOreClusterAt,
    getTileType,
  };
}
