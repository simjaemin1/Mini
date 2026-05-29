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

module.exports = { Chunk, ChunkManager, CHUNK_SIZE };
