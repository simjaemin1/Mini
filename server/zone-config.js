// === Phase 14.46-a: 대지각변동 (위도 정확화) ===
// 24개 zone, 가변 직사각형 (per-zone width/height), wrap-ready.
// 각 zone은 (worldOffsetX, worldOffsetY, zoneWidth, zoneHeight) 사각형. 핸드오프는 abs 좌표 lookup.
//
// 좌표계 (Mercator-ish):
//   X: 0 (서, 아메리카) → 61000 (동, 태평양)
//   Y: 0 (북, 북극 빙하) → 38000 (남, 남극 빙하)
//
// 위도 매핑 (실제 지구):
//   Row "Arctic"  y=0~6000      → 60~90°N (캐나디아, 노르단, 시바라, 베링)
//   Row "MidN"    y=6000~16000  → 30~60°N (누비아노, 유로파, 중아세아, 중원북, 한반도)
//   Row "Tropics" y=16000~24000 → 0~30°N  (마야안, 사하르, 힌드강, 중원남, 닛폰)
//   Row "MidS"    y=24000~32000 → 0~30°S  (아마조니아, 콩그우림, 인도양, 남양제도, 오세니아)
//   Row "South"   y=32000~38000 → 30~60°S (파타고나, 케이프, 남빙양, 즈일랜드)
//
// 한반도(중위도) + 닛폰(중위도, Korea보다 약간 남쪽) + 베링(NE Russia, 북극).
// 한·중·일 분리 (각 다른 VPS 호스팅 가능).

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

// Column X 경계:
//   c0(아메리카):   0      ~ 12000  (w=12000)
//   c1(대서양):     12000  ~ 18000  (w=6000)
//   c2(유럽+아프리카): 18000 ~ 28000 (w=10000)
//   c3(중앙Eurasia+인도양): 28000 ~ 36000 (w=8000)
//   c4(중원+동남아):    36000 ~ 46000 (w=10000)
//   c5(한반도+닛폰+오세니아): 46000 ~ 54000 (w=8000)
//   c6(태평양):     54000  ~ 61000  (w=7000)

const ZONES_BASE = {
  // === c0: 아메리카 ===
  canadia: {
    port: 3001, biome: 'taiga', displayName: '캐나디아 (NA 북부)',
    groundColor: '#5a7c4a', tintColor: '#3a6a2a',
    worldOffsetX: 0, worldOffsetY: 0, zoneWidth: 12000, zoneHeight: 6000,
    villageSeed: 1001, villageCount: 6,
    mainSquare: { x: 6000, y: 3000, name: '카나디 광장' },
  },
  nubiano: {
    port: 3002, biome: 'plains', displayName: '누비아노 (USA)',
    groundColor: '#bca56a', tintColor: '#8a6a3a',
    worldOffsetX: 0, worldOffsetY: 6000, zoneWidth: 12000, zoneHeight: 10000,
    villageSeed: 1002, villageCount: 20,
    mainSquare: { x: 6000, y: 5000, name: '뉴아크 광장' },
  },
  mayan: {
    port: 3003, biome: 'jungle', displayName: '마야안 (중미)',
    groundColor: '#4a7c3a', tintColor: '#2a5a1a',
    worldOffsetX: 0, worldOffsetY: 16000, zoneWidth: 12000, zoneHeight: 8000,
    villageSeed: 1003, villageCount: 10,
    mainSquare: { x: 6000, y: 4000, name: '치치카 광장' },
  },
  amazonia: {
    port: 3004, biome: 'jungle', displayName: '아마조니아 (브라질)',
    groundColor: '#3a6a2a', tintColor: '#1a4a0a',
    worldOffsetX: 0, worldOffsetY: 24000, zoneWidth: 12000, zoneHeight: 8000,
    villageSeed: 1004, villageCount: 14,
    mainSquare: { x: 6000, y: 4000, name: '마나스 광장' },
  },
  patagona: {
    port: 3005, biome: 'plains', displayName: '파타고나 (남미 남단)',
    groundColor: '#7a8a6a', tintColor: '#5a6a4a',
    worldOffsetX: 0, worldOffsetY: 32000, zoneWidth: 12000, zoneHeight: 6000,
    villageSeed: 1005, villageCount: 6,
    mainSquare: { x: 6000, y: 3000, name: '바리로체 광장' },
  },

  // === c1: 대서양 (세로 전체 1 zone) ===
  atlantic: {
    port: 3006, biome: 'ocean', displayName: '대서양',
    groundColor: '#2a4a7c', tintColor: '#1a3a6a',
    worldOffsetX: 12000, worldOffsetY: 0, zoneWidth: 6000, zoneHeight: 38000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3000, y: 19000, name: '대서양 중심' },
    isOcean: true,
  },

  // === c2: 유럽 + 아프리카 ===
  nordan: {
    port: 3007, biome: 'taiga', displayName: '노르단 (스칸디)',
    groundColor: '#6a8a5a', tintColor: '#4a6a3a',
    worldOffsetX: 18000, worldOffsetY: 0, zoneWidth: 10000, zoneHeight: 6000,
    villageSeed: 1007, villageCount: 8,
    mainSquare: { x: 5000, y: 3000, name: '오스로 광장' },
  },
  europa: {
    port: 3008, biome: 'forest', displayName: '유로파 (유럽)',
    groundColor: '#5a8a4a', tintColor: '#3a6a2a',
    worldOffsetX: 18000, worldOffsetY: 6000, zoneWidth: 10000, zoneHeight: 10000,
    villageSeed: 1008, villageCount: 20,
    mainSquare: { x: 5000, y: 5000, name: '파리시 광장' },
  },
  sahar: {
    port: 3009, biome: 'desert', displayName: '사하르 (북아프리카)',
    groundColor: '#d4b97a', tintColor: '#a89460',
    worldOffsetX: 18000, worldOffsetY: 16000, zoneWidth: 10000, zoneHeight: 8000,
    villageSeed: 1009, villageCount: 8,
    mainSquare: { x: 5000, y: 4000, name: '카이르 광장' },
  },
  // 콩그우림 + 케이프 통합 (남부 아프리카)
  kongra: {
    port: 3030, biome: 'savanna', displayName: '콩그·케이프 (남아프리카)',
    groundColor: '#8a8a5a', tintColor: '#6a6a3a',
    worldOffsetX: 18000, worldOffsetY: 24000, zoneWidth: 10000, zoneHeight: 14000,
    villageSeed: 1010, villageCount: 10,
    mainSquare: { x: 5000, y: 7000, name: '나로비 광장' },
  },

  // === c3: 중앙 Eurasia + 인도양 ===
  sibara: {
    port: 3011, biome: 'tundra', displayName: '시바라 (시베리아)',
    groundColor: '#7a8a8a', tintColor: '#5a6a6a',
    worldOffsetX: 28000, worldOffsetY: 0, zoneWidth: 8000, zoneHeight: 6000,
    villageSeed: 1011, villageCount: 5,
    mainSquare: { x: 4000, y: 3000, name: '노보 광장' },
  },
  centaria: {
    port: 3012, biome: 'plains', displayName: '중아세아',
    groundColor: '#a89460', tintColor: '#806e44',
    worldOffsetX: 28000, worldOffsetY: 6000, zoneWidth: 8000, zoneHeight: 10000,
    villageSeed: 1012, villageCount: 12,
    mainSquare: { x: 4000, y: 5000, name: '아스나 광장' },
  },
  hindgang: {
    port: 3013, biome: 'jungle', displayName: '힌드강 (인도)',
    groundColor: '#5a8a3a', tintColor: '#3a6a1a',
    worldOffsetX: 28000, worldOffsetY: 16000, zoneWidth: 8000, zoneHeight: 8000,
    villageSeed: 1013, villageCount: 18,
    mainSquare: { x: 4000, y: 4000, name: '델리아 광장' },
  },
  // 인도양 — 인도 남쪽 + 호주 서쪽 사이 (확장)
  indoyang: {
    port: 3014, biome: 'ocean', displayName: '인도양',
    groundColor: '#2a5a8a', tintColor: '#1a4a7a',
    worldOffsetX: 28000, worldOffsetY: 24000, zoneWidth: 8000, zoneHeight: 14000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 4000, y: 7000, name: '인도양 중심' },
    isOcean: true,
  },

  // === c4: 중원(중국) + 동남아 ===
  bering: {
    port: 3015, biome: 'tundra', displayName: '베링 (NE 시베리아)',
    groundColor: '#8a9a9a', tintColor: '#6a7a7a',
    worldOffsetX: 36000, worldOffsetY: 0, zoneWidth: 10000, zoneHeight: 6000,
    villageSeed: 1015, villageCount: 4,
    mainSquare: { x: 5000, y: 3000, name: '아나디 광장' },
  },
  jungwon_n: {
    port: 3016, biome: 'plains', displayName: '중원북 (中北)',
    groundColor: '#9aa860', tintColor: '#7a8a40',
    worldOffsetX: 36000, worldOffsetY: 6000, zoneWidth: 10000, zoneHeight: 10000,
    villageSeed: 1016, villageCount: 20,
    mainSquare: { x: 5000, y: 5000, name: '베이장 광장' },
  },
  jungwon_s: {
    port: 3017, biome: 'plains', displayName: '중원남 (中南)',
    groundColor: '#8aa860', tintColor: '#6a8840',
    worldOffsetX: 36000, worldOffsetY: 16000, zoneWidth: 10000, zoneHeight: 8000,
    villageSeed: 1017, villageCount: 18,
    mainSquare: { x: 5000, y: 4000, name: '샹하 광장' },
  },
  nanyang: {
    port: 3018, biome: 'archipelago', displayName: '남양제도 (동남아)',
    groundColor: '#4a8a5a', tintColor: '#2a6a3a',
    worldOffsetX: 36000, worldOffsetY: 24000, zoneWidth: 10000, zoneHeight: 8000,
    villageSeed: 1018, villageCount: 12,
    mainSquare: { x: 5000, y: 4000, name: '발리 광장' },
  },
  // 남빙양 — c3+c4 통합 (가로 길게, 맨 아래)
  nambingyang: {
    port: 3019, biome: 'ocean', displayName: '남빙양',
    groundColor: '#3a6a9a', tintColor: '#2a5a8a',
    worldOffsetX: 36000, worldOffsetY: 32000, zoneWidth: 10000, zoneHeight: 6000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 5000, y: 3000, name: '남빙양 중심' },
    isOcean: true,
  },

  // === c5: 한반도 + 닛폰 + 오세니아 + 즈일랜드 ===
  // 한반도: y=0~10000 (북극+중북 통합. 인구밀도 높아서 크게)
  hanbando: {
    port: 3020, biome: 'forest', displayName: '한반도',
    groundColor: '#9a9670', tintColor: '#7a8a4a',
    worldOffsetX: 46000, worldOffsetY: 0, zoneWidth: 8000, zoneHeight: 10000,
    villageSeed: 1020, villageCount: 15,
    mainSquare: { x: 4000, y: 5000, name: '한양 광장' },
  },
  // 닛폰: y=10000~18000 (중북~열대 위쪽, Japan 위도와 일치)
  nippon: {
    port: 3021, biome: 'mountain', displayName: '닛폰 (日本)',
    groundColor: '#7a8a5a', tintColor: '#5a6a3a',
    worldOffsetX: 46000, worldOffsetY: 10000, zoneWidth: 8000, zoneHeight: 8000,
    villageSeed: 1021, villageCount: 15,
    mainSquare: { x: 4000, y: 4000, name: '도카이 광장' },
  },
  // 오세니아: y=18000~28000 (열대~중남, Australia 위도)
  oseania: {
    port: 3022, biome: 'savanna', displayName: '오세니아 (호주)',
    groundColor: '#c4a05a', tintColor: '#a08040',
    worldOffsetX: 46000, worldOffsetY: 18000, zoneWidth: 8000, zoneHeight: 10000,
    villageSeed: 1022, villageCount: 10,
    mainSquare: { x: 4000, y: 5000, name: '시디니 광장' },
  },
  // 즈일랜드: y=28000~38000 (중남~남극)
  zealandi: {
    port: 3023, biome: 'forest', displayName: '즈일랜드 (NZ)',
    groundColor: '#5a8a5a', tintColor: '#3a6a3a',
    worldOffsetX: 46000, worldOffsetY: 28000, zoneWidth: 8000, zoneHeight: 10000,
    villageSeed: 1023, villageCount: 6,
    mainSquare: { x: 4000, y: 5000, name: '울링톤 광장' },
  },

  // === c6: 태평양 (세로 전체 1 zone) ===
  // wrap 도입 시 동쪽 끝이 캐나디아/누비아노 서쪽과 연결됨
  pacific: {
    port: 3024, biome: 'ocean', displayName: '태평양',
    groundColor: '#1a3a7a', tintColor: '#0a2a5a',
    worldOffsetX: 54000, worldOffsetY: 0, zoneWidth: 7000, zoneHeight: 38000,
    villageSeed: 0, villageCount: 0,
    mainSquare: { x: 3500, y: 19000, name: '태평양 중심' },
    isOcean: true,
  },
};

// host 채우기 + ENABLED_ZONES 적용 — 비활성 zone은 ZONES에서 제외
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
  port: parseInt(process.env.CENTRAL_PORT || '3000', 10),
  proto: HTTP_PROTO,
};

// === 월드 전체 크기 (자동 산정) ===
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
  zoneWidth: 10000,   // 옛 코드 fallback
  zoneHeight: 10000,
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

// === abs 좌표 → zone lookup (핸드오프용, wrap-ready) ===
function findZoneAt(absX, absY) {
  for (const [id, z] of Object.entries(ZONES_BASE)) {
    if (absX >= z.worldOffsetX && absX < z.worldOffsetX + z.zoneWidth &&
        absY >= z.worldOffsetY && absY < z.worldOffsetY + z.zoneHeight) {
      return { id, ...z };
    }
  }
  return null;
}

// === wrap-ready 거리 헬퍼 ===
const WRAP_X = null; // null이면 wrap 안 함. 나중에 WORLD.worldWidth로 활성화.
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
      // 14.46-a — 옛 클라 호환용: 각 변 중앙에 닿는 zone 1개
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
