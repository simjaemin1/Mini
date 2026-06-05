// === server/terrain-gen.js — procedural zone terrain generator ===
//
// 사용자 요청 (Phase 5-E):
//   * 정확한 지리 X — 분포만 맞게
//   * 광맥·산이 zone 경계에 걸쳐도 OK (경계 모호화)
//   * 강은 가능한 경계 따라 흐름 (장려, 강제 X)
//   * 강은 N/S/E/W 100 cell (3200px) segment staircase — 계단처럼 깔끔
//   * 모든 zone이 비슷한 자원 밸런스 (특화는 약간)
//
// API: generateAllZoneTerrain(zonesMeta) → { zoneId: { rivers, lakes, forests, mountains, ores } }
//   zonesMeta: { zoneId: { zoneWidth, zoneHeight, biome, isOcean } }
//
// 결정론적 — zoneId seed 기반. 같은 zone은 항상 같은 layout.

'use strict';

const SEGMENT = 3200;       // 100 cell × 32px — 강 한 segment 최소 길이
const TILE = 32;            // cell pixel size

// === seeded RNG (Mulberry32) ===
function strHash(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
function makeRng(seedStr) {
  let s = strHash(seedStr);
  return function() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// === biome별 default profile — 분포 비중 ===
//   (zone size 변경에도 비례 — 큰 zone은 더 많이 생성)
//   per_M_px2: 1M (10^6) pixel² 당 개수
const BIOME_PROFILE = {
  taiga:       { rivers: 4, lakes: 5, forests: 4, mountains: 2, ores: 3, forestDensity: 1.8, mountainStone: 2.5 },
  forest:      { rivers: 5, lakes: 4, forests: 5, mountains: 3, ores: 3, forestDensity: 2.0, mountainStone: 2.5 },
  mountain:    { rivers: 4, lakes: 3, forests: 3, mountains: 6, ores: 5, forestDensity: 1.6, mountainStone: 3.0 },
  mountains:   { rivers: 4, lakes: 3, forests: 3, mountains: 6, ores: 5, forestDensity: 1.6, mountainStone: 3.0 },
  plains:      { rivers: 5, lakes: 3, forests: 2, mountains: 1, ores: 3, forestDensity: 1.8, mountainStone: 2.3 },
  jungle:      { rivers: 6, lakes: 3, forests: 7, mountains: 2, ores: 3, forestDensity: 2.5, mountainStone: 2.4 },
  desert:      { rivers: 2, lakes: 1, forests: 1, mountains: 3, ores: 4, forestDensity: 1.4, mountainStone: 2.6 },
  savanna:     { rivers: 3, lakes: 2, forests: 3, mountains: 2, ores: 3, forestDensity: 1.6, mountainStone: 2.3 },
  tundra:      { rivers: 3, lakes: 5, forests: 3, mountains: 2, ores: 4, forestDensity: 1.5, mountainStone: 2.5 },
  archipelago: { rivers: 4, lakes: 3, forests: 5, mountains: 3, ores: 3, forestDensity: 2.0, mountainStone: 2.6 },
};
function getProfile(biome) {
  return BIOME_PROFILE[biome] || BIOME_PROFILE.plains;
}

// === scaleByZoneSize — zone 크기 비례 ===
function scaleByZone(count, zoneW, zoneH) {
  // 기준: 70000×130000 (한반도) ≈ 9.1B px²
  const REF = 9.1e9;
  const ratio = Math.sqrt((zoneW * zoneH) / REF);
  return Math.max(1, Math.round(count * ratio));
}

// === River generator — staircase 100-cell segment + 경계 장려 ===
function generateRiver(rng, zoneW, zoneH, idx, oreSides) {
  // 30% 확률로 경계 평행 강 (한 변에서 시작·끝)
  const SIDES = ['N','S','W','E'];
  const startSide = SIDES[Math.floor(rng() * 4)];
  let endSide;
  const sameSideRoll = rng();
  if (sameSideRoll < 0.3) {
    // 경계 평행 — 같은 변에서 시작·끝
    endSide = startSide;
  } else if (sameSideRoll < 0.45 && oreSides && oreSides.length > 0) {
    // 15% 추가 확률 — 한쪽 끝은 강 옆에 lake로 갈 수 있도록 다른 변
    endSide = oreSides[Math.floor(rng() * oreSides.length)];
    if (endSide === startSide) endSide = SIDES[(SIDES.indexOf(startSide) + 2) % 4]; // opposite
  } else {
    do { endSide = SIDES[Math.floor(rng() * 4)]; } while (endSide === startSide);
  }

  function pickOnSide(side) {
    const m = 200; // margin
    if (side === 'N') return [m + rng() * (zoneW - 2*m), 0];
    if (side === 'S') return [m + rng() * (zoneW - 2*m), zoneH];
    if (side === 'W') return [0, m + rng() * (zoneH - 2*m)];
    if (side === 'E') return [zoneW, m + rng() * (zoneH - 2*m)];
  }
  let [sx, sy] = pickOnSide(startSide);
  let [ex, ey] = pickOnSide(endSide);
  // 경계 평행 강 — 시작·끝이 같은 변 위에 위치. middle path가 잘 펴지도록 변에서 100~500px 안쪽으로
  if (startSide === endSide) {
    const offset = 800 + rng() * 1800;
    if (startSide === 'N') { sy = offset; ey = offset; }
    else if (startSide === 'S') { sy = zoneH - offset; ey = zoneH - offset; }
    else if (startSide === 'W') { sx = offset; ex = offset; }
    else if (startSide === 'E') { sx = zoneW - offset; ex = zoneW - offset; }
    // 시작·끝이 같으면 너무 짧으니 변 양 끝으로
    const sameAxis = startSide === 'N' || startSide === 'S';
    if (sameAxis) {
      sx = 800 + rng() * 2000;
      ex = zoneW - 800 - rng() * 2000;
    } else {
      sy = 800 + rng() * 2000;
      ey = zoneH - 800 - rng() * 2000;
    }
  }

  const path = [];
  const startWidth = 200 + Math.round(rng() * 200);
  const endWidth = 600 + Math.round(rng() * 600);
  // 폭은 보통 끝점이 더 큼 (하구). 50% 확률로 역전 (발원 강).
  const totalLen = Math.hypot(ex - sx, ey - sy) || 1;
  const widthAt = (frac) => Math.round(startWidth + (endWidth - startWidth) * frac);

  path.push({ pos: [Math.round(sx), Math.round(sy)], width: widthAt(0) });
  let cx = sx, cy = sy, accLen = 0;
  // 진짜 staircase — N/S와 E/W를 번갈아가며 SEGMENT 씩 (사용자 의도)
  // 시작 방향: 처음은 더 멀리 가야 할 쪽으로
  let nextIsNS = Math.abs(ey - sy) >= Math.abs(ex - sx);
  for (let iter = 0; iter < 100; iter++) {
    const dx = ex - cx, dy = ey - cy;
    const remain = Math.hypot(dx, dy);
    if (remain < SEGMENT * 0.4) break;
    const step = SEGMENT + Math.round(rng() * SEGMENT * 0.3); // 100~130 cell jitter
    let moved = false;
    if (nextIsNS && Math.abs(dy) > SEGMENT * 0.2) {
      cy += Math.sign(dy) * Math.min(step, Math.abs(dy));
      moved = true;
      nextIsNS = false;
    } else if (!nextIsNS && Math.abs(dx) > SEGMENT * 0.2) {
      cx += Math.sign(dx) * Math.min(step, Math.abs(dx));
      moved = true;
      nextIsNS = true;
    } else if (Math.abs(dx) > SEGMENT * 0.2) {
      // NS 차례지만 dy 거의 없음 → EW 강제
      cx += Math.sign(dx) * Math.min(step, Math.abs(dx));
      moved = true;
    } else if (Math.abs(dy) > SEGMENT * 0.2) {
      cy += Math.sign(dy) * Math.min(step, Math.abs(dy));
      moved = true;
    }
    if (!moved) break;
    accLen += step;
    const frac = Math.min(1, accLen / totalLen);
    path.push({ pos: [Math.round(cx), Math.round(cy)], width: widthAt(frac) });
  }
  path.push({ pos: [Math.round(ex), Math.round(ey)], width: widthAt(1) });

  const RIVER_NAMES_PREFIX = ['녹', '청', '백', '금', '은', '대', '소', '북', '남', '동', '서', '중', '강', '한', '신', '구', '천', '해'];
  const RIVER_NAMES_SUFFIX = ['하', '강', '천', '수'];
  const name = RIVER_NAMES_PREFIX[Math.floor(rng() * RIVER_NAMES_PREFIX.length)] +
               RIVER_NAMES_SUFFIX[Math.floor(rng() * RIVER_NAMES_SUFFIX.length)] +
               '강' + (idx + 1);
  return { name, path };
}

// === Lake generator ===
function generateLake(rng, zoneW, zoneH, idx) {
  const shapeRoll = rng();
  const cx = 1500 + rng() * (zoneW - 3000);
  const cy = 1500 + rng() * (zoneH - 3000);
  const SIZE_MIN = 400, SIZE_MAX = 1800;
  const LAKE_NAMES = ['청', '맑', '큰', '깊', '푸른', '하늘', '거울', '천', '용', '백', '검', '연못'];
  const baseName = LAKE_NAMES[Math.floor(rng() * LAKE_NAMES.length)] + '호' + (idx + 1);
  if (shapeRoll < 0.4) {
    return { name: baseName, shape: 'circle', center: [Math.round(cx), Math.round(cy)],
             radius: Math.round(SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN)) };
  } else if (shapeRoll < 0.85) {
    return { name: baseName, shape: 'ellipse', center: [Math.round(cx), Math.round(cy)],
             a: Math.round(SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN)),
             b: Math.round(SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN) * 0.6),
             rotation: rng() * Math.PI };
  } else {
    // multi-circle 큰 호수
    const n = 2 + Math.floor(rng() * 3);
    const circles = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + rng() * 0.5;
      const dist = 600 + rng() * 800;
      const r = SIZE_MIN + rng() * (SIZE_MAX - SIZE_MIN) * 0.8;
      circles.push({
        center: [Math.round(cx + Math.cos(ang) * dist), Math.round(cy + Math.sin(ang) * dist)],
        radius: Math.round(r),
      });
    }
    return { name: baseName, shape: 'multi', circles };
  }
}

// === Forest (rect) generator — zone 경계 걸침 가능 ===
function generateForest(rng, zoneW, zoneH, idx, densityMult) {
  // rect 크기 — zone 크기 비례
  const w = Math.round((4000 + rng() * 10000) * Math.sqrt(zoneW / 70000));
  const h = Math.round((4000 + rng() * 10000) * Math.sqrt(zoneH / 70000));
  // 경계 걸침: 시작점이 zone 밖일 수도 (음수 OK)
  const x1 = Math.round(-w * 0.2 + rng() * (zoneW + w * 0.4));
  const y1 = Math.round(-h * 0.2 + rng() * (zoneH + h * 0.4));
  const x2 = x1 + w, y2 = y1 + h;
  const NAMES = ['깊은', '큰', '오래된', '신비한', '검은', '북부', '남부', '동부', '서부', '울창한'];
  const name = NAMES[Math.floor(rng() * NAMES.length)] + ' 숲' + (idx + 1);
  return { name, rect: [x1, y1, x2, y2], densityMult };
}

// === Mountain (rect) generator — zone 경계 걸침 가능 ===
function generateMountain(rng, zoneW, zoneH, idx, stoneMult) {
  const w = Math.round((5000 + rng() * 12000) * Math.sqrt(zoneW / 70000));
  const h = Math.round((5000 + rng() * 12000) * Math.sqrt(zoneH / 70000));
  const x1 = Math.round(-w * 0.2 + rng() * (zoneW + w * 0.4));
  const y1 = Math.round(-h * 0.2 + rng() * (zoneH + h * 0.4));
  const x2 = x1 + w, y2 = y1 + h;
  const NAMES = ['높', '큰', '검', '백', '청', '북', '남', '대', '소', '큰바위'];
  const name = NAMES[Math.floor(rng() * NAMES.length)] + '산맥' + (idx + 1);
  return { name, rect: [x1, y1, x2, y2], stoneMult };
}

// === Ore cluster generator — zone 경계 걸침 가능 ===
function generateOre(rng, zoneW, zoneH, idx) {
  const radius = Math.round(400 + rng() * 1000);
  // 경계 걸쳐 OK — center가 zone 밖일 수도
  const cx = Math.round(-radius * 0.3 + rng() * (zoneW + radius * 0.6));
  const cy = Math.round(-radius * 0.3 + rng() * (zoneH + radius * 0.6));
  const ORE_TYPES = ['iron', 'copper', 'gold', 'silver', 'lead', 'tin', 'coal', 'salt'];
  const oreType = ORE_TYPES[Math.floor(rng() * ORE_TYPES.length)];
  const NAMES = ['북', '남', '동', '서', '대', '소', '큰', '작은', '검은', '하얀'];
  const name = NAMES[Math.floor(rng() * NAMES.length)] + ' ' + oreType + ' 광산' + (idx + 1);
  return { name, center: [cx, cy], radius, oreType };
}

// === main — zone 하나 generate ===
function generateZoneTerrain(zoneId, zoneMeta) {
  if (zoneMeta.isOcean) return { rivers: [], lakes: [], forests: [], mountains: [], ores: [] };
  const zw = zoneMeta.zoneWidth || zoneMeta.width;
  const zh = zoneMeta.zoneHeight || zoneMeta.height;
  if (!zw || !zh) return { rivers: [], lakes: [], forests: [], mountains: [], ores: [] };
  const profile = getProfile(zoneMeta.biome);
  const rng = makeRng(`terrain-v1:${zoneId}`);

  // 자원 수 — biome profile × zone 크기
  const riverN    = scaleByZone(profile.rivers, zw, zh);
  const lakeN     = scaleByZone(profile.lakes, zw, zh);
  const forestN   = scaleByZone(profile.forests, zw, zh);
  const mountainN = scaleByZone(profile.mountains, zw, zh);
  const oreN      = scaleByZone(profile.ores, zw, zh);

  const rivers = [];
  for (let i = 0; i < riverN; i++) rivers.push(generateRiver(rng, zw, zh, i, null));
  const lakes = [];
  for (let i = 0; i < lakeN; i++) lakes.push(generateLake(rng, zw, zh, i));
  const forests = [];
  for (let i = 0; i < forestN; i++) forests.push(generateForest(rng, zw, zh, i, profile.forestDensity));
  const mountains = [];
  for (let i = 0; i < mountainN; i++) mountains.push(generateMountain(rng, zw, zh, i, profile.mountainStone));
  const ores = [];
  for (let i = 0; i < oreN; i++) ores.push(generateOre(rng, zw, zh, i));

  return { rivers, lakes, forests, mountains, ores };
}

function generateAllZoneTerrain(zonesMeta) {
  const out = {};
  for (const [zid, meta] of Object.entries(zonesMeta)) {
    out[zid] = generateZoneTerrain(zid, meta);
  }
  return out;
}

// Dual export — server (CommonJS) + browser (window)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    generateZoneTerrain,
    generateAllZoneTerrain,
    BIOME_PROFILE,
    makeRng,
  };
}
if (typeof window !== 'undefined') {
  window.TerrainGen = { generateZoneTerrain, generateAllZoneTerrain, BIOME_PROFILE };
}
