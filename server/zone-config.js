// 존 토폴로지 — 2×2 그리드
//
//        N (북)
//   ┌────────┬────────┐
//   │ russia │  usa   │
// W ├────────┼────────┤ E
//   │ korea  │ china  │
//   └────────┴────────┘
//        S (남)
//
// 좌표계: 화면 위쪽이 작은 Y, 아래쪽이 큰 Y. (스크린 좌표 관행)
//   korea  = 좌하단 (worldOffsetX=0,    worldOffsetY=1024)
//   russia = 좌상단 (worldOffsetX=0,    worldOffsetY=0)
//   usa    = 우상단 (worldOffsetX=1024, worldOffsetY=0)
//   china  = 우하단 (worldOffsetX=1024, worldOffsetY=1024)

function hostFromEnv(zoneId, fallback) {
  const k = `ZONE_HOST_${zoneId.toUpperCase()}`;
  if (process.env[k]) return process.env[k];
  if (process.env.ZONE_HOSTS) {
    try {
      const map = JSON.parse(process.env.ZONE_HOSTS);
      if (map[zoneId]) return map[zoneId];
    } catch (e) {}
  }
  return fallback;
}

const WS_PROTO = process.env.WS_PROTO || 'ws';
const HTTP_PROTO = process.env.HTTP_PROTO || 'http';

const ZONES_BASE = {
  korea: {
    port: 3002, biome: 'mountains', displayName: '한반도 산악',
    groundColor: '#9a9670', tintColor: '#7a8a4a',
    worldOffsetX: 0,     worldOffsetY: 10240,
    simulatedLatencyMs: 5,
    north: 'russia', south: null, west: null, east: 'china',
  },
  russia: {
    port: 3001, biome: 'forest', displayName: '러시아 타이가',
    groundColor: '#5a7c4a', tintColor: '#3a6a2a',
    worldOffsetX: 0,    worldOffsetY: 0,
    simulatedLatencyMs: 30,
    north: null, south: 'korea', west: null, east: 'usa',
  },
  usa: {
    port: 3005, biome: 'plains', displayName: '미국 평원',
    groundColor: '#bca56a', tintColor: '#8a6a3a',
    worldOffsetX: 10240, worldOffsetY: 0,
    simulatedLatencyMs: 90,
    north: null, south: 'china', west: 'russia', east: null,
  },
  china: {
    port: 3003, biome: 'plains', displayName: '중국 평원',
    groundColor: '#8aa860', tintColor: '#d4b97a',
    worldOffsetX: 10240, worldOffsetY: 10240,
    simulatedLatencyMs: 25,
    north: 'usa', south: null, west: 'korea', east: null,
  },
};

// host 채우기 + ENABLED_ZONES 적용 — 비활성 이웃은 null로
const _enabledStr = process.env.ENABLED_ZONES;
const _enabled = _enabledStr ? new Set(_enabledStr.split(',').map(s => s.trim())) : null;
function _filterNbr(id) {
  if (!_enabled) return id;
  return (id && _enabled.has(id)) ? id : null;
}
const ZONES = {};
for (const [id, z] of Object.entries(ZONES_BASE)) {
  if (_enabled && !_enabled.has(id)) continue; // 비활성 zone은 ZONES에서 제외
  ZONES[id] = {
    ...z,
    host: hostFromEnv(id, 'localhost'),
    north: _filterNbr(z.north),
    south: _filterNbr(z.south),
    east:  _filterNbr(z.east),
    west:  _filterNbr(z.west),
  };
}

const CENTRAL = {
  host: process.env.CENTRAL_HOST || 'localhost',
  port: parseInt(process.env.CENTRAL_PORT || '3010', 10),
  proto: HTTP_PROTO,
};

const WORLD = {
  // Phase 12.2.e — zone 10배 (1024→10240, 면적 100배). 자원은 procedural (메모리 X).
  zoneWidth: 10240,
  zoneHeight: 10240,
  tileSize: 32,
  dayLengthMs: 10 * 60 * 1000,
  dayPhaseRatio: 0.7,
  worldEpoch: 0,
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

const ZONE_ORDER = ['russia', 'usa', 'korea', 'china']; // 시각용 (북서, 북동, 남서, 남동)

function publicZoneMap(fallbackHost = 'localhost') {
  const enabledStr = process.env.ENABLED_ZONES;
  const enabled = enabledStr ? new Set(enabledStr.split(',').map(s => s.trim())) : null;
  const map = {};
  for (const [id, z] of Object.entries(ZONES)) {
    if (enabled && !enabled.has(id)) continue;
    const host = z.host || fallbackHost;
    const portPart = WS_PROTO === 'wss' ? '' : `:${z.port}`;
    const filterNbr = (nbr) => (!enabled || (nbr && enabled.has(nbr))) ? nbr : null;
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
      zoneWidth: WORLD.zoneWidth,
      zoneHeight: WORLD.zoneHeight,
      simulatedLatencyMs: z.simulatedLatencyMs,
      north: filterNbr(z.north),
      south: filterNbr(z.south),
      west:  filterNbr(z.west),
      east:  filterNbr(z.east),
    };
  }
  return map;
}

module.exports = {
  ZONES, WORLD, ZONE_ORDER, CENTRAL, WS_PROTO, HTTP_PROTO,
  publicZoneMap, worldPhase, isNight, darknessLevel,
};
