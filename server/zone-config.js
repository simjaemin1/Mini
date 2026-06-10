// === Phase 14.46-a v8: 26 zone, 게이밍 인구 비례 + 지리 사실성 ===
// 한반도가 가장 크게 (91M, Korean dev 우선). 인기 zone 모두 mid-north에 13000 height로.
// 러시아 가로띠 (시바라+베링), 한·일 북쪽 = 러시아, 호주·NZ 통합, 양극 ICE_BAND 1500.
//
// 좌표계: X 0~61000 (서→동), Y 0~38000 (북→남)
// 컬럼: c0(11000) c1(5000) c2(9000) c3(6000) c4(10000) c5(7000) c6(5000) c7(8000)
// 행:   r0(5000) r1(13000) r2(6000) r3(7000) r4(7000)
//
// MEMO: 현재 단일 VPS. zone 1개=컨테이너 1개. multi-zone host는 Stage 2 (Task #192 참조).

function hostFromEnv(zoneId, fallback) {
  const k = `ZONE_HOST_${zoneId.toUpperCase()}`;
  if (process.env[k]) return process.env[k];
  if (process.env.ZONE_HOSTS) {
    try {
      const map = JSON.parse(process.env.ZONE_HOSTS);
      if (map[zoneId]) return map[zoneId];
    } catch (e) {}
  }
  // Phase 5-G: PUBLIC_HOST 단일 변수로 모든 zone host 채움 (단일 VPS 배포)
  if (process.env.PUBLIC_HOST) return process.env.PUBLIC_HOST;
  return fallback;
}

const WS_PROTO = process.env.WS_PROTO || 'ws';
const HTTP_PROTO = process.env.HTTP_PROTO || 'http';

const ZONES_BASE = {
  // === c0: 아메리카 (11000w) ===
  canadia: {
    port: 3001, biome: 'taiga', displayName: '캐나디아 (NA 북부)',
    groundColor: '#5a7c4a', tintColor: '#3a6a2a',
    worldOffsetX: 0, worldOffsetY: 0, zoneWidth: 11000, zoneHeight: 5000,
    villageSeed: 1001, villageCount: 6,
    mainSquare: { x: 5500, y: 2500, name: '카나디 광장' },
  },
  nubiano: {
    port: 3002, biome: 'plains', displayName: '누비아노 (USA)',
    groundColor: '#bca56a', tintColor: '#8a6a3a',
    worldOffsetX: 0, worldOffsetY: 5000, zoneWidth: 11000, zoneHeight: 13000,
    villageSeed: 1002, villageCount: 25,
    mainSquare: { x: 5500, y: 6500, name: '뉴아크 광장' },
  },
  mayan: {
    port: 3003, biome: 'jungle', displayName: '마야안 (중미)',
    groundColor: '#4a7c3a', tintColor: '#2a5a1a',
    worldOffsetX: 0, worldOffsetY: 18000, zoneWidth: 11000, zoneHeight: 6000,
    villageSeed: 1003, villageCount: 10,
    mainSquare: { x: 5500, y: 3000, name: '치치카 광장' },
  },
  amazonia: {
    port: 3004, biome: 'jungle', displayName: '아마조니아 (브라질)',
    groundColor: '#3a6a2a', tintColor: '#1a4a0a',
    worldOffsetX: 0, worldOffsetY: 24000, zoneWidth: 11000, zoneHeight: 7000,
    villageSeed: 1004, villageCount: 14,
    mainSquare: { x: 5500, y: 3500, name: '마나스 광장' },
  },
  patagona: {
    port: 3005, biome: 'plains', displayName: '파타고나 (남미 남단)',
    groundColor: '#7a8a6a', tintColor: '#5a6a4a',
    worldOffsetX: 0, worldOffsetY: 31000, zoneWidth: 11000, zoneHeight: 7000,
    villageSeed: 1005, villageCount: 6,
    mainSquare: { x: 5500, y: 3500, name: '바리로체 광장' },
  },

  // === c1: 대서양 (5000w, 세로 전체) ===
  atlantic: {
    port: 3006, biome: 'ocean', displayName: '대서양',
    groundColor: '#2a4a7c', tintColor: '#1a3a6a',
    worldOffsetX: 11000, worldOffsetY: 0, zoneWidth: 5000, zoneHeight: 38000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2500, y: 19000, name: '대서양 중심' },
    isOcean: true,
  },

  // === c2: 유럽 + 아프리카 (9000w) ===
  nordan: {
    port: 3007, biome: 'taiga', displayName: '노르단 (스칸디)',
    groundColor: '#6a8a5a', tintColor: '#4a6a3a',
    worldOffsetX: 16000, worldOffsetY: 0, zoneWidth: 9000, zoneHeight: 5000,
    villageSeed: 1007, villageCount: 8,
    mainSquare: { x: 4500, y: 2500, name: '오스로 광장' },
  },
  europa: {
    port: 3008, biome: 'forest', displayName: '유로파 (유럽)',
    groundColor: '#5a8a4a', tintColor: '#3a6a2a',
    worldOffsetX: 16000, worldOffsetY: 5000, zoneWidth: 9000, zoneHeight: 13000,
    villageSeed: 1008, villageCount: 25,
    mainSquare: { x: 4500, y: 6500, name: '파리시 광장' },
  },
  sahar: {
    port: 3009, biome: 'desert', displayName: '사하르 (북아프리카)',
    groundColor: '#d4b97a', tintColor: '#a89460',
    worldOffsetX: 16000, worldOffsetY: 18000, zoneWidth: 9000, zoneHeight: 6000,
    villageSeed: 1009, villageCount: 8,
    mainSquare: { x: 4500, y: 3000, name: '카이르 광장' },
  },
  kongra: {
    port: 3030, biome: 'savanna', displayName: '콩그·케이프 (남아프리카)',
    groundColor: '#8a8a5a', tintColor: '#6a6a3a',
    worldOffsetX: 16000, worldOffsetY: 24000, zoneWidth: 9000, zoneHeight: 14000,
    villageSeed: 1010, villageCount: 10,
    mainSquare: { x: 4500, y: 7000, name: '나로비 광장' },
  },

  // === c3: 중앙 Eurasia + 인도양 (6000w) — sibara/centaria/hindgang/indoyang ===
  // sibara는 c3+c4 row 0 wide → 별도 정의 (아래)
  centaria: {
    port: 3012, biome: 'plains', displayName: '중아세아',
    groundColor: '#a89460', tintColor: '#806e44',
    worldOffsetX: 25000, worldOffsetY: 5000, zoneWidth: 6000, zoneHeight: 13000,
    villageSeed: 1012, villageCount: 14,
    mainSquare: { x: 3000, y: 6500, name: '아스나 광장' },
  },
  hindgang: {
    port: 3013, biome: 'jungle', displayName: '힌드강 (인도)',
    groundColor: '#5a8a3a', tintColor: '#3a6a1a',
    worldOffsetX: 25000, worldOffsetY: 18000, zoneWidth: 6000, zoneHeight: 6000,
    villageSeed: 1013, villageCount: 16,
    mainSquare: { x: 3000, y: 3000, name: '델리아 광장' },
  },
  indoyang: {
    port: 3014, biome: 'ocean', displayName: '인도양',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 25000, worldOffsetY: 24000, zoneWidth: 6000, zoneHeight: 14000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3000, y: 7000, name: '인도양 중심' },
    isOcean: true,
  },

  // === Russia 가로띠 (row 0, c3+c4 wide) ===
  sibara: {
    port: 3011, biome: 'tundra', displayName: '시바라 (Siberia 西·中)',
    groundColor: '#8a9a9a', tintColor: '#6a7a7a',
    worldOffsetX: 25000, worldOffsetY: 0, zoneWidth: 16000, zoneHeight: 5000,
    villageSeed: 1011, villageCount: 8,
    mainSquare: { x: 8000, y: 2500, name: '노보 광장' },
  },

  // === c4: 중원 + 동남아 (10000w) ===
  jungwon_n: {
    port: 3016, biome: 'plains', displayName: '중원북 (中北)',
    groundColor: '#9aa860', tintColor: '#7a8a40',
    worldOffsetX: 31000, worldOffsetY: 5000, zoneWidth: 10000, zoneHeight: 13000,
    villageSeed: 1016, villageCount: 25,
    mainSquare: { x: 5000, y: 6500, name: '베이장 광장' },
  },
  jungwon_s: {
    port: 3017, biome: 'plains', displayName: '중원남 (中南)',
    groundColor: '#8aa860', tintColor: '#6a8840',
    worldOffsetX: 31000, worldOffsetY: 18000, zoneWidth: 10000, zoneHeight: 6000,
    villageSeed: 1017, villageCount: 16,
    mainSquare: { x: 5000, y: 3000, name: '샹하 광장' },
  },
  nanyang: {
    port: 3018, biome: 'archipelago', displayName: '남양제도 (동남아)',
    groundColor: '#4a8a5a', tintColor: '#2a6a3a',
    worldOffsetX: 31000, worldOffsetY: 24000, zoneWidth: 10000, zoneHeight: 7000,
    villageSeed: 1018, villageCount: 14,
    mainSquare: { x: 5000, y: 3500, name: '발리 광장' },
  },

  // === Russia 가로띠 (row 0, c5+c6+half_c7 wide) ===
  bering: {
    port: 3015, biome: 'tundra', displayName: '베링 (NE 러시아)',
    groundColor: '#7a8a8a', tintColor: '#5a6a6a',
    worldOffsetX: 41000, worldOffsetY: 0, zoneWidth: 16000, zoneHeight: 5000,
    villageSeed: 1015, villageCount: 4,
    mainSquare: { x: 8000, y: 2500, name: '아나디 광장' },
  },

  // === c5: 한반도 컬럼 (7000w) ===
  hanbando: {
    port: 3020, biome: 'forest', displayName: '한반도',
    groundColor: '#9a9670', tintColor: '#7a8a4a',
    worldOffsetX: 41000, worldOffsetY: 5000, zoneWidth: 7000, zoneHeight: 13000,
    villageSeed: 1020, villageCount: 0, // Phase 5-G: 강·호수만 검증용 (마을·자원·NPC 모두 제거)
    mainSquare: { x: 3500, y: 6500, name: '한양 광장' },
    cleanZone: true, // 자원 procedural spawn도 skip
  },
  east_sea_s: {
    port: 3026, biome: 'ocean', displayName: '동중국해',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 41000, worldOffsetY: 18000, zoneWidth: 7000, zoneHeight: 6000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3500, y: 3000, name: '동중국해 중심' },
    isOcean: true,
  },
  oseania: {
    port: 3022, biome: 'savanna', displayName: '오세니아 (호주+NZ)',
    groundColor: '#c4a05a', tintColor: '#a08040',
    worldOffsetX: 41000, worldOffsetY: 24000, zoneWidth: 7000, zoneHeight: 7000,
    villageSeed: 1022, villageCount: 10,
    mainSquare: { x: 3500, y: 3500, name: '시디니 광장' },
  },

  // === c6: 닛폰 컬럼 (5000w) ===
  nippon: {
    port: 3021, biome: 'mountain', displayName: '닛폰 (日本)',
    groundColor: '#7a8a5a', tintColor: '#5a6a3a',
    worldOffsetX: 48000, worldOffsetY: 5000, zoneWidth: 5000, zoneHeight: 13000,
    villageSeed: 1021, villageCount: 16,
    mainSquare: { x: 2500, y: 6500, name: '도카이 광장' },
  },
  japan_pacific: {
    port: 3028, biome: 'ocean', displayName: '필리핀해+일본남해',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 48000, worldOffsetY: 18000, zoneWidth: 5000, zoneHeight: 13000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2500, y: 6500, name: '필리핀해 중심' },
    isOcean: true,
  },

  // === 남빙양 (row 4 가로, c4+c5+c6 통합) ===
  nambingyang: {
    port: 3019, biome: 'ocean', displayName: '남빙양',
    groundColor: '#3a6a9a', tintColor: '#2a5a8a',
    worldOffsetX: 31000, worldOffsetY: 31000, zoneWidth: 22000, zoneHeight: 7000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 11000, y: 3500, name: '남빙양 중심' },
    isOcean: true,
  },

  // === c7: 태평양 (8000w) ===
  // bering이 c7 절반(53000~57000) row 0 차지. pacific_arctic은 동쪽 corner 작은 ocean.
  pacific_arctic: {
    port: 3027, biome: 'ocean', displayName: '북태평양 corner',
    groundColor: '#1a3a7a', tintColor: '#0a2a5a',
    worldOffsetX: 57000, worldOffsetY: 0, zoneWidth: 4000, zoneHeight: 5000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 2000, y: 2500, name: '북태평양 NE' },
    isOcean: true,
  },
  pacific: {
    port: 3024, biome: 'ocean', displayName: '태평양',
    groundColor: '#1a3a7a', tintColor: '#0a2a5a',
    worldOffsetX: 53000, worldOffsetY: 5000, zoneWidth: 8000, zoneHeight: 33000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 4000, y: 16500, name: '태평양 중심' },
    isOcean: true,
  },
};

// ── Phase 5-3: world scale ────────────────────────────────────────
// 좌표·크기 일괄 배율. SCALE=1이면 옛 크기, SCALE=10이면 가로세로 10배 (면적 100배, PZ급).
// 환경변수 WORLD_SCALE로 운영 중 변경 가능.
const WORLD_SCALE = parseFloat(process.env.WORLD_SCALE || '10');
for (const [id, z] of Object.entries(ZONES_BASE)) {
  z.worldOffsetX = Math.round(z.worldOffsetX * WORLD_SCALE);
  z.worldOffsetY = Math.round(z.worldOffsetY * WORLD_SCALE);
  z.zoneWidth = Math.round(z.zoneWidth * WORLD_SCALE);
  z.zoneHeight = Math.round(z.zoneHeight * WORLD_SCALE);
  if (z.mainSquare) {
    // canadia는 시뮬 마을 좌표(1k~10k px)에 마을이 몰려있으므로 spawn은 시뮬 영역에.
    // (시뮬 마을 좌표 ×10 fix는 별도 task)
    if (id === 'canadia') {
      // 시뮬 마을 평균 좌표 (5500, 2500) 그대로
    } else {
      z.mainSquare.x = Math.round(z.mainSquare.x * WORLD_SCALE);
      z.mainSquare.y = Math.round(z.mainSquare.y * WORLD_SCALE);
    }
  }
}

// host 채우기 + ENABLED_ZONES 적용
const _enabledStr = process.env.ENABLED_ZONES;
const _enabled = _enabledStr ? new Set(_enabledStr.split(',').map(s => s.trim())) : null;
const ZONES = {};
for (const [id, z] of Object.entries(ZONES_BASE)) {
  if (_enabled && !_enabled.has(id)) continue;
  ZONES[id] = {
    ...z,
    host: hostFromEnv(id, 'localhost'),
  };
}

const CENTRAL = {
  host: process.env.CENTRAL_HOST || 'localhost',
  port: parseInt(process.env.CENTRAL_PORT || '3010', 10),
  proto: HTTP_PROTO,
};

let _maxX = 0, _maxY = 0;
for (const z of Object.values(ZONES_BASE)) {
  _maxX = Math.max(_maxX, z.worldOffsetX + z.zoneWidth);
  _maxY = Math.max(_maxY, z.worldOffsetY + z.zoneHeight);
}
const WORLD = {
  worldWidth: _maxX,
  worldHeight: _maxY,
  tileSize: 32,
  dayLengthMs: 10 * 60 * 1000,
  dayPhaseRatio: 0.7,
  worldEpoch: 0,
  zoneWidth: 100000, zoneHeight: 100000, // 옛 호환 (Phase 5-3에서 ×10)
};

function worldPhase(nowMs = Date.now()) {
  const t = (nowMs - WORLD.worldEpoch) % WORLD.dayLengthMs;
  return t / WORLD.dayLengthMs;
}
function isNight(nowMs = Date.now()) {
  return worldPhase(nowMs) > WORLD.dayPhaseRatio;
}
function darknessLevel(nowMs = Date.now()) {
  const p = worldPhase(nowMs);
  if (p < WORLD.dayPhaseRatio - 0.05) return 0;
  if (p < WORLD.dayPhaseRatio) return (p - (WORLD.dayPhaseRatio - 0.05)) / 0.05;
  if (p > 0.95) return (1 - p) / 0.05;
  return 1;
}

function findZoneAt(absX, absY) {
  for (const [id, z] of Object.entries(ZONES_BASE)) {
    if (absX >= z.worldOffsetX && absX < z.worldOffsetX + z.zoneWidth &&
        absY >= z.worldOffsetY && absY < z.worldOffsetY + z.zoneHeight) {
      return { id, ...z };
    }
  }
  return null;
}

const WRAP_X = null;
function worldDeltaX(a, b) {
  let dx = b - a;
  if (WRAP_X !== null) {
    const w = WRAP_X;
    if (dx > w / 2)  dx -= w;
    if (dx < -w / 2) dx += w;
  }
  return dx;
}
function worldDistance(ax, ay, bx, by) {
  const dx = worldDeltaX(ax, bx);
  const dy = by - ay;
  return Math.hypot(dx, dy);
}

const ZONE_ORDER = Object.keys(ZONES_BASE);

function publicZoneMap(fallbackHost = 'localhost') {
  const enabledStr = process.env.ENABLED_ZONES;
  const enabled = enabledStr ? new Set(enabledStr.split(',').map(s => s.trim())) : null;
  const map = {};
  for (const [id, z] of Object.entries(ZONES)) {
    if (enabled && !enabled.has(id)) continue;
    const host = z.host || fallbackHost;
    const portPart = WS_PROTO === 'wss' ? '' : `:${z.port}`;
    map[id] = {
      id,
      wsUrl: `${WS_PROTO}://${host}${portPart}`,
      host,
      displayName: z.displayName,
      biome: z.biome,
      groundColor: z.groundColor,
      tintColor: z.tintColor,
      worldOffsetX: z.worldOffsetX,
      worldOffsetY: z.worldOffsetY,
      zoneWidth: z.zoneWidth,
      zoneHeight: z.zoneHeight,
      simulatedLatencyMs: z.simulatedLatencyMs || 0,
      mainSquare: z.mainSquare || null,
      isOcean: !!z.isOcean,
      north: _findNeighborSide(id, 'N'),
      south: _findNeighborSide(id, 'S'),
      east:  _findNeighborSide(id, 'E'),
      west:  _findNeighborSide(id, 'W'),
    };
  }
  return map;
}

function _findNeighborSide(zoneId, side) {
  const z = ZONES_BASE[zoneId];
  if (!z) return null;
  let probeX, probeY;
  const eps = 1;
  if (side === 'N') { probeX = z.worldOffsetX + z.zoneWidth / 2;  probeY = z.worldOffsetY - eps; }
  if (side === 'S') { probeX = z.worldOffsetX + z.zoneWidth / 2;  probeY = z.worldOffsetY + z.zoneHeight + eps; }
  if (side === 'W') { probeX = z.worldOffsetX - eps;              probeY = z.worldOffsetY + z.zoneHeight / 2; }
  if (side === 'E') { probeX = z.worldOffsetX + z.zoneWidth + eps; probeY = z.worldOffsetY + z.zoneHeight / 2; }
  const hit = findZoneAt(probeX, probeY);
  return hit ? hit.id : null;
}

module.exports = {
  ZONES, WORLD, ZONE_ORDER, CENTRAL, WS_PROTO, HTTP_PROTO,
  publicZoneMap, worldPhase, isNight, darknessLevel,
  findZoneAt, worldDistance, worldDeltaX, WRAP_X,
};
