// === 청크 시스템 ===
// zone을 N×N 청크 그리드로 분할. 자원/mob/건물을 청크별 분류 보관.
// 12.2.a: 분류만 (활성/비활성 X). 12.2.b에서 활성 청크만 tick 처리.
//
// API:
//   const cm = new ChunkManager(zoneWidth, zoneHeight, chunkSize);
//   cm.insertResource(r);  // r._chunkKey 자동 셋
//   cm.removeResource(r);
//   cm.updateMobChunk(m);  // mob 이동 후 호출 — 청크 바뀌었으면 재배치
//   cm.getChunksInRadius(x, y, radius); // 활성 청크 계산용
//   cm.allChunks();

const CHUNK_SIZE = 256;

class Chunk {
  constructor(cx, cy) {
    this.cx = cx; this.cy = cy;
    this.resources = new Map();
    this.mobs = new Map();
    this.buildings = new Map();
  }
  isEmpty() {
    return this.resources.size === 0 && this.mobs.size === 0 && this.buildings.size === 0;
  }
}

class ChunkManager {
  constructor(zoneWidth, zoneHeight, chunkSize = CHUNK_SIZE) {
    this.chunkSize = chunkSize;
    this.colsX = Math.ceil(zoneWidth / chunkSize);
    this.colsY = Math.ceil(zoneHeight / chunkSize);
    this.chunks = new Map(); // key → Chunk
  }

  keyOf(cx, cy) { return `${cx}_${cy}`; }
  chunkXY(x, y) {
    return { cx: Math.floor(x / this.chunkSize), cy: Math.floor(y / this.chunkSize) };
  }
  getOrCreate(cx, cy) {
    const k = this.keyOf(cx, cy);
    let c = this.chunks.get(k);
    if (!c) { c = new Chunk(cx, cy); this.chunks.set(k, c); }
    return c;
  }
  getChunkAt(x, y) {
    const { cx, cy } = this.chunkXY(x, y);
    return this.getOrCreate(cx, cy);
  }

  // === resources (이동 안 함) ===
  insertResource(r) {
    const c = this.getChunkAt(r.x, r.y);
    c.resources.set(r.id, r);
    r._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeResource(r) {
    if (!r._chunkKey) return;
    const c = this.chunks.get(r._chunkKey);
    if (c) c.resources.delete(r.id);
    r._chunkKey = null;
  }

  // === mobs (이동함 — 위치 바뀌면 청크 갱신) ===
  insertMob(m) {
    const c = this.getChunkAt(m.x, m.y);
    c.mobs.set(m.mid, m);
    m._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeMob(m) {
    if (!m._chunkKey) return;
    const c = this.chunks.get(m._chunkKey);
    if (c) c.mobs.delete(m.mid);
    m._chunkKey = null;
  }
  updateMobChunk(m) {
    const { cx, cy } = this.chunkXY(m.x, m.y);
    const newKey = this.keyOf(cx, cy);
    if (m._chunkKey === newKey) return;
    if (m._chunkKey) {
      const old = this.chunks.get(m._chunkKey);
      if (old) old.mobs.delete(m.mid);
    }
    const c = this.getOrCreate(cx, cy);
    c.mobs.set(m.mid, m);
    m._chunkKey = newKey;
  }

  // === buildings (이동 안 함) ===
  insertBuilding(b) {
    const c = this.getChunkAt(b.x, b.y);
    c.buildings.set(b.id, b);
    b._chunkKey = this.keyOf(c.cx, c.cy);
  }
  removeBuilding(b) {
    if (!b._chunkKey) return;
    const c = this.chunks.get(b._chunkKey);
    if (c) c.buildings.delete(b.id);
    b._chunkKey = null;
  }

  // === 활성 청크 계산 (12.2.b에서 사용) ===
  // 위치 (x,y) 주변 radius 안 청크들 반환
  getChunksInRadius(x, y, radius) {
    const rc = Math.ceil(radius / this.chunkSize);
    const center = this.chunkXY(x, y);
    const result = [];
    for (let dx = -rc; dx <= rc; dx++) {
      for (let dy = -rc; dy <= rc; dy++) {
        const cx = center.cx + dx;
        const cy = center.cy + dy;
        if (cx < 0 || cy < 0 || cx >= this.colsX || cy >= this.colsY) continue;
        const c = this.chunks.get(this.keyOf(cx, cy));
        if (c) result.push(c);
      }
    }
    return result;
  }

  // 여러 viewer 위치 → 활성 청크 set
  getActiveChunks(viewers, radius) {
    const set = new Set();
    for (const v of viewers) {
      for (const c of this.getChunksInRadius(v.x, v.y, radius)) {
        set.add(c);
      }
    }
    return set;
  }

  allChunks() { return this.chunks.values(); }
  size() { return this.chunks.size; }
}

// === Procedural generation (12.2.e) ===
// 청크별 시드로 자원 위치/타입 결정. 같은 청크는 매번 같은 자원 spawn.
// 채집된 자원만 harvested_seeds DB에 기록.
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; }
function seedRand(zoneId, cx, cy, n) {
  let h = hashStr(zoneId);
  h = (h ^ (cx * 73856093)) >>> 0;
  h = (h ^ (cy * 19349663)) >>> 0;
  h = (h ^ (n * 83492791)) >>> 0;
  h = ((h * 9301) + 49297) >>> 0;
  return (h % 2147483647) / 2147483647;
}

const RESOURCE_HP_TABLE = { tree: 3, rock: 4, berry_bush: 2, water_pool: 999, herb: 1, ore: 5 };

// Phase 14.1+14.3+14.46-a: biome별 자원 강한 편재.
// biome 종류: plains, mountain, forest, taiga, tundra, desert, jungle, savanna, archipelago, ocean
function pickResourceType(biome, r) {
  if (biome === 'plains') {
    if (r < 0.50) return 'berry_bush';
    if (r < 0.75) return 'herb';
    if (r < 0.95) return 'tree';
    if (r < 0.99) return 'rock';
    return 'water_pool';
  }
  if (biome === 'mountain' || biome === 'mountains') {
    if (r < 0.55) return 'rock';
    if (r < 0.75) return 'ore';
    if (r < 0.85) return 'tree';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'berry_bush';
    return 'water_pool';
  }
  if (biome === 'forest') {
    if (r < 0.70) return 'tree';
    if (r < 0.85) return 'berry_bush';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'rock';
    return 'water_pool';
  }
  if (biome === 'taiga') {
    // 침엽수림: tree 압도, 약간 ore + rock
    if (r < 0.78) return 'tree';
    if (r < 0.90) return 'rock';
    if (r < 0.96) return 'ore';
    return 'water_pool';
  }
  if (biome === 'tundra') {
    // 동토: 자원 희박
    if (r < 0.40) return 'rock';
    if (r < 0.55) return 'ore';
    if (r < 0.70) return 'tree';
    if (r < 0.85) return 'herb';
    return 'water_pool';
  }
  if (biome === 'desert') {
    // 사막: rock·ore 중심, 식물 희박
    if (r < 0.55) return 'rock';
    if (r < 0.78) return 'ore';
    if (r < 0.88) return 'herb';
    if (r < 0.94) return 'berry_bush';
    return 'water_pool';
  }
  if (biome === 'jungle') {
    // 정글: tree 매우 많고 herb·berry 풍부
    if (r < 0.55) return 'tree';
    if (r < 0.75) return 'herb';
    if (r < 0.90) return 'berry_bush';
    if (r < 0.96) return 'rock';
    return 'water_pool';
  }
  if (biome === 'savanna') {
    // 초원/사바나: 풀+드문 나무
    if (r < 0.45) return 'berry_bush';
    if (r < 0.70) return 'herb';
    if (r < 0.88) return 'tree';
    if (r < 0.96) return 'rock';
    return 'water_pool';
  }
  if (biome === 'archipelago') {
    // 군도: 식물 중심, 약간 광물, 물 많음
    if (r < 0.40) return 'tree';
    if (r < 0.65) return 'berry_bush';
    if (r < 0.80) return 'herb';
    if (r < 0.92) return 'rock';
    return 'water_pool';
  }
  if (biome === 'ocean') {
    // 해양 — 자원 거의 없음. 14.46-b에서 물고기 추가 예정.
    return 'water_pool';
  }
  // fallback (모를 때): forest 기본
  if (r < 0.70) return 'tree';
  if (r < 0.85) return 'berry_bush';
  if (r < 0.93) return 'herb';
  if (r < 0.98) return 'rock';
  return 'water_pool';
}

// 청크 안 자원 시드 생성. harvestedSet에 있는 건 제외.
// 청크당 자원 N개 (기본 5개) — 청크 면적 256² = 65536. zone 4096이면 16×16=256 청크. 총 자원 1280.
const RESOURCES_PER_CHUNK = 5;
function generateChunkResources(zoneId, biome, cx, cy, chunkSize, harvestedSet) {
  const result = [];
  for (let n = 0; n < RESOURCES_PER_CHUNK; n++) {
    const seedKey = `${cx}_${cy}_${n}`;
    if (harvestedSet && harvestedSet.has(seedKey)) continue;
    const r1 = seedRand(zoneId, cx, cy, n * 3);
    const r2 = seedRand(zoneId, cx, cy, n * 3 + 1);
    const r3 = seedRand(zoneId, cx, cy, n * 3 + 2);
    const x = cx * chunkSize + 16 + r1 * (chunkSize - 32);
    const y = cy * chunkSize + 16 + r2 * (chunkSize - 32);
    const type = pickResourceType(biome, r3);
    const maxHp = RESOURCE_HP_TABLE[type] || 3;
    result.push({
      id: `s_${cx}_${cy}_${n}`,
      seedKey, // 채집 시 DB 기록용
      isSeed: true,
      x, y, type, hp: maxHp, maxHp,
    });
  }
  return result;
}

// === Phase 14.46-a: 마을 자동 생성 ===
// biome별 음절 표를 조합해서 마을 이름 + 위치를 zone당 N개 결정.
// 시드 기반이라 zone마다 같은 입력 → 같은 출력 (재시작해도 동일).

const VILLAGE_NAME_TABLES = {
  // 각 biome마다 "어울리는" 음절을 골라 마을 이름 생성 (2~3 음절)
  forest:      { syl1: ['그린','우드','릴','파인','오크','애쉬','글렌','벨','로지','케른'],     syl2: ['데일','우드','글로','홀로','부르크','보로','베일','셰어','크로프트',''] },
  taiga:       { syl1: ['스나','코트','이르','콜드','노보','한스','우슈','피요르','오스','코페'], syl2: ['스크','후스','뷔크','달','네스','보르그','쇠르','베르겐','블린','홀름'] },
  tundra:      { syl1: ['이글','얀','베르호','노렐','이르쿠','마가단','워르쿠','노릴','수르구','얌부'], syl2: ['스크','곤','버그','드','단','이','네츠','얀',''] },
  plains:      { syl1: ['그래스','월드','선','크라이','롤링','오크','휘트','메도우','매든','애머'],   syl2: ['랜드','필드','데일','뷰','크릭','로지','튼','보로','버그',''] },
  desert:      { syl1: ['오아','사르','두니','카이','타브','메르사','파르','오르','시르','자그'],   syl2: ['시스','로','만','라','즈','쿠','와','루','벤','시'] },
  jungle:      { syl1: ['마노','이파','우루','카주','시바','일라','쿠르','벤투','파라','만나'],     syl2: ['스','쿠','마','로','이','우스','우','네','라','시'] },
  savanna:     { syl1: ['크루','나로','음바','잘란','오트','다카','케리','루카','드라','사부'],     syl2: ['거','베','네','로','자','시','와','우','크',''] },
  archipelago: { syl1: ['발리','자카','부키','마닐','수마','셀레','보르네','루손','쿠팡','데보'],   syl2: ['타라','스타','노','반','뜨라','베스','우','이','파',''] },
  mountain:    { syl1: ['카토','노라','히마','마트','타카','지옹','이즈','후지','쿠라','네코'],     syl2: ['야마','사키','다','노','자','이','쿠','네','마','로'] },
  ocean:       { syl1: [], syl2: [] }, // 해양은 마을 없음
};

function makeVillageName(biome, rand) {
  const t = VILLAGE_NAME_TABLES[biome] || VILLAGE_NAME_TABLES.forest;
  if (!t.syl1.length) return null;
  const s1 = t.syl1[Math.floor(rand * t.syl1.length) % t.syl1.length];
  const r2 = (rand * 7919) % 1;
  const s2 = t.syl2[Math.floor(r2 * t.syl2.length) % t.syl2.length];
  return (s1 + s2).trim();
}

// 마을 좌표 — zone 안 골고루. 빙하 띠는 피함 (y < 800 또는 y > zoneHeight-800).
// margin 안 쪽으로 마을 spawn.
function generateVillagesForZone(zone) {
  const villages = [];
  if (zone.isOcean) return villages;
  if (!zone.villageCount || zone.villageCount <= 0) return villages;
  const seed = zone.villageSeed || 1;
  const margin = 600;
  const safeTop = 900;
  const safeBot = zone.zoneHeight - 900;
  const usedNames = new Set();
  for (let i = 0; i < zone.villageCount; i++) {
    let name = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      const rn = seedRand(zone.displayName || 'z', seed + i, attempt, 0);
      const candidate = makeVillageName(zone.biome, rn);
      if (candidate && !usedNames.has(candidate)) { name = candidate; break; }
    }
    if (!name) name = `${zone.biome[0]}-${i}`;
    usedNames.add(name);
    const rx = seedRand(zone.displayName || 'z', seed + i, 1, 0);
    const ry = seedRand(zone.displayName || 'z', seed + i, 2, 0);
    const x = margin + rx * (zone.zoneWidth - margin * 2);
    let y = safeTop + ry * (safeBot - safeTop);
    if (y < safeTop) y = safeTop;
    if (y > safeBot) y = safeBot;
    villages.push({ name, x, y });
  }
  return villages;
}

// === Phase 14.46-b-mini: 해안선 (Coastline water tiles) ===
// 육지 zone의 가장자리 중 ocean 인접 부분에 물 타일 strip을 organic noise로 생성.
// ocean zone은 전체가 물 (별도 처리, 이 함수에선 빈 set 반환).
// Korea↔Japan 같은 직접 land 인접은 자동으로 land (그 변엔 ocean이 없으니 water tile 0).
const COASTLINE_BASE = 600;   // 기본 해안선 폭 (px)
const COASTLINE_NOISE = 400;  // 곡선 변동량 (px)

function _coastNoise(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return (((h * 9301 + 49297) >>> 0) % 1000) / 1000;
}
// Smooth noise: 8 타일마다 sample + smoothstep 보간. 인접 타일은 거의 같은 값 → 톱니 X
function _coastSmoothNoise(side, zoneId, t) {
  const STEP = 8;
  const t0 = Math.floor(t / STEP) * STEP;
  const t1 = t0 + STEP;
  const n0 = _coastNoise(`${side}_${zoneId}_${t0}`);
  const n1 = _coastNoise(`${side}_${zoneId}_${t1}`);
  const frac = (t - t0) / STEP;
  const u = frac * frac * (3 - 2 * frac); // smoothstep
  return n0 * (1 - u) + n1 * u;
}

// zone: { id, isOcean, worldOffsetX, worldOffsetY, zoneWidth, zoneHeight }
// tileSize: pixels per tile (보통 32)
// findZoneAtFn: (absX, absY) => zone-like object with .isOcean
// returns Set of "tx_ty" keys (local tile coords)
function generateCoastlineWaterTiles(zone, tileSize, findZoneAtFn) {
  const waterTiles = new Set();
  if (zone.isOcean) return waterTiles; // ocean zone은 전체 물 — 별도 처리

  const cols = Math.ceil(zone.zoneWidth / tileSize);
  const rows = Math.ceil(zone.zoneHeight / tileSize);
  const maxDist = COASTLINE_BASE + COASTLINE_NOISE;

  function isOceanAt(absX, absY) {
    const z = findZoneAtFn(absX, absY);
    return !!(z && z.isOcean);
  }

  for (let ty = 0; ty < rows; ty++) {
    const absY = zone.worldOffsetY + ty * tileSize;
    const distN = ty * tileSize;
    const distS = (rows - 1 - ty) * tileSize;
    for (let tx = 0; tx < cols; tx++) {
      const absX = zone.worldOffsetX + tx * tileSize;
      const distW = tx * tileSize;
      const distE = (cols - 1 - tx) * tileSize;

      // 어느 변과도 너무 멀면 skip
      if (Math.min(distW, distE, distN, distS) > maxDist) continue;

      // West edge — ocean이 인접하면 water
      if (distW < maxDist && isOceanAt(zone.worldOffsetX - 1, absY)) {
        const n = _coastSmoothNoise('W', zone.id, ty) * COASTLINE_NOISE;
        if (distW < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
      }
      // East
      if (distE < maxDist && isOceanAt(zone.worldOffsetX + zone.zoneWidth + 1, absY)) {
        const n = _coastSmoothNoise('E', zone.id, ty) * COASTLINE_NOISE;
        if (distE < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
      }
      // North
      if (distN < maxDist && isOceanAt(absX, zone.worldOffsetY - 1)) {
        const n = _coastSmoothNoise('N', zone.id, tx) * COASTLINE_NOISE;
        if (distN < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
      }
      // South
      if (distS < maxDist && isOceanAt(absX, zone.worldOffsetY + zone.zoneHeight + 1)) {
        const n = _coastSmoothNoise('S', zone.id, tx) * COASTLINE_NOISE;
        if (distS < COASTLINE_BASE + n) { waterTiles.add(`${tx}_${ty}`); continue; }
      }
    }
  }
  return waterTiles;
}

module.exports = { Chunk, ChunkManager, CHUNK_SIZE, generateChunkResources, seedRand, generateVillagesForZone, makeVillageName, generateCoastlineWaterTiles };
