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

// Phase 14.1+14.3: biome별 자원 강한 편재 + herb/ore 추가
// 설계 문서 §2.2: "지역마다 편재" — 우리 맵에 적용:
//   - korea (mountains): rock·ore 압도 → 광물 지대
//   - russia (forest): tree 압도 → 목재 지대
//   - usa/china (plains): berry·herb 많음 → 농경/약초 지대
function pickResourceType(biome, r) {
  if (biome === 'plains') {
    // 평원: berry 50, herb 25, tree 20, rock 4, water 1
    if (r < 0.50) return 'berry_bush';
    if (r < 0.75) return 'herb';
    if (r < 0.95) return 'tree';
    if (r < 0.99) return 'rock';
    return 'water_pool';
  }
  if (biome === 'mountains') {
    // 산악: rock 55, ore 20, tree 10, herb 8, berry 5, water 2
    if (r < 0.55) return 'rock';
    if (r < 0.75) return 'ore';
    if (r < 0.85) return 'tree';
    if (r < 0.93) return 'herb';
    if (r < 0.98) return 'berry_bush';
    return 'water_pool';
  }
  // forest: tree 70, berry 15, herb 8, rock 5, water 2
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

module.exports = { Chunk, ChunkManager, CHUNK_SIZE, generateChunkResources, seedRand };
