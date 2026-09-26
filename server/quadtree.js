// 표준 Quadtree — 영역 안 entity 빠르게 찾기.
// 매 tick 재구축 가정 (entity 위치 자주 바뀌니까 부분 업데이트보다 단순).
// 사용:
//   const qt = new Quadtree(0, 0, 1024, 1024);
//   qt.insert({ x: 100, y: 200, ref: someObj });
//   const refs = qt.queryCircle(150, 250, 80);  // 반경 80 안 ref들

class Quadtree {
  constructor(x, y, w, h, capacity = 8, depth = 0, maxDepth = 8) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.capacity = capacity;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.entities = [];
    this.divided = false;
    this.nw = this.ne = this.sw = this.se = null;
  }

  contains(px, py) {
    return px >= this.x && px < this.x + this.w && py >= this.y && py < this.y + this.h;
  }

  intersects(rx, ry, rw, rh) {
    return !(rx + rw < this.x || rx > this.x + this.w ||
             ry + rh < this.y || ry > this.y + this.h);
  }

  subdivide() {
    const hw = this.w / 2, hh = this.h / 2;
    const d = this.depth + 1;
    this.nw = new Quadtree(this.x,      this.y,      hw, hh, this.capacity, d, this.maxDepth);
    this.ne = new Quadtree(this.x + hw, this.y,      hw, hh, this.capacity, d, this.maxDepth);
    this.sw = new Quadtree(this.x,      this.y + hh, hw, hh, this.capacity, d, this.maxDepth);
    this.se = new Quadtree(this.x + hw, this.y + hh, hw, hh, this.capacity, d, this.maxDepth);
    this.divided = true;
    // 기존 entity 재분배
    const old = this.entities;
    this.entities = [];
    for (const e of old) this._insertChild(e);
  }

  insert(e) {
    // e: { x, y, ref }
    if (!this.contains(e.x, e.y)) return false;
    if (!this.divided) {
      if (this.entities.length < this.capacity || this.depth >= this.maxDepth) {
        this.entities.push(e);
        return true;
      }
      this.subdivide();
    }
    return this._insertChild(e);
  }

  _insertChild(e) {
    if (this.nw.insert(e)) return true;
    if (this.ne.insert(e)) return true;
    if (this.sw.insert(e)) return true;
    if (this.se.insert(e)) return true;
    // 어디에도 못 들어가면 (경계 케이스) 여기에 보관
    this.entities.push(e);
    return true;
  }

  queryRect(rx, ry, rw, rh, out = []) {
    if (!this.intersects(rx, ry, rw, rh)) return out;
    for (const e of this.entities) {
      if (e.x >= rx && e.x < rx + rw && e.y >= ry && e.y < ry + rh) out.push(e.ref);
    }
    if (this.divided) {
      this.nw.queryRect(rx, ry, rw, rh, out);
      this.ne.queryRect(rx, ry, rw, rh, out);
      this.sw.queryRect(rx, ry, rw, rh, out);
      this.se.queryRect(rx, ry, rw, rh, out);
    }
    return out;
  }

  queryCircle(cx, cy, r) {
    // bounding rect로 추린 후 거리 필터
    const candidates = [];
    this.queryRect(cx - r, cy - r, r * 2, r * 2, candidates);
    const r2 = r * r;
    const out = [];
    for (const ref of candidates) {
      const dx = ref.x - cx, dy = ref.y - cy;
      if (dx * dx + dy * dy <= r2) out.push(ref);
    }
    return out;
  }

  // 가장 가까운 1개 (rough — bounding box로만 추리고 거리 계산)
  findNearest(cx, cy, maxRadius) {
    const candidates = this.queryCircle(cx, cy, maxRadius);
    let best = null, bestD = maxRadius;
    for (const ref of candidates) {
      const d = Math.hypot(ref.x - cx, ref.y - cy);
      if (d < bestD) { best = ref; bestD = d; }
    }
    return { ref: best, dist: bestD };
  }
}

// ★★[T421 2026-09-26] **증분 판** — 겉 동작은 `Quadtree` 와 한 글자도 안 다르다: 같은 순서로 넣으면 같은 구조가 서고,
//   같은 구조면 조회가 **같은 것을 같은 순서로** 낸다(자식 순회 nw·ne·sw·se · 칸 안은 넣은 순서).
//   다른 것은 둘뿐이다 — ① 칸에 들어간 항목이 **자기가 든 칸**(`_n`)을 기억한다 · ② `nodeFor(x, y)` 가
//   "지금 구조에 새로 넣었다면 들어갈 칸" 을 답한다(삽입 규칙을 그대로 따라 내려간다).
//   ⇒ 몸이 움직여도 **들 칸이 같으면** 구조가 안 바뀐다(칸마다 들어오는 몸의 차례가 같으니 나누기도 같다)
//     ⇒ 항목의 x·y 만 고치면 **새로 세운 나무와 같은 나무**다. 칸이 바뀌면 부르는 쪽이 통째로 다시 세운다.
//   ⚠원판 `Quadtree` 는 **안 건드렸다**(끔 = 한 글자도 안 바뀐 옛 나무).
class QuadtreeInc extends Quadtree {
  subdivide() {
    const hw = this.w / 2, hh = this.h / 2;
    const d = this.depth + 1;
    this.nw = new QuadtreeInc(this.x,      this.y,      hw, hh, this.capacity, d, this.maxDepth);
    this.ne = new QuadtreeInc(this.x + hw, this.y,      hw, hh, this.capacity, d, this.maxDepth);
    this.sw = new QuadtreeInc(this.x,      this.y + hh, hw, hh, this.capacity, d, this.maxDepth);
    this.se = new QuadtreeInc(this.x + hw, this.y + hh, hw, hh, this.capacity, d, this.maxDepth);
    this.divided = true;
    const old = this.entities;
    this.entities = [];
    for (const e of old) this._insertChild(e);
  }
  insert(e) {
    if (!this.contains(e.x, e.y)) return false;
    if (!this.divided) {
      if (this.entities.length < this.capacity || this.depth >= this.maxDepth) {
        this.entities.push(e); e._n = this;
        return true;
      }
      this.subdivide();
    }
    return this._insertChild(e);
  }
  _insertChild(e) {
    if (this.nw.insert(e)) return true;
    if (this.ne.insert(e)) return true;
    if (this.sw.insert(e)) return true;
    if (this.se.insert(e)) return true;
    this.entities.push(e); e._n = this;
    return true;
  }
  // 지금 구조에 (px,py) 를 넣었다면 들어갈 칸 — `insert` 의 길을 그대로 밟는다(뿌리 밖이면 null)
  nodeFor(px, py) {
    if (!this.contains(px, py)) return null;
    let n = this;
    for (;;) {
      if (!n.divided) return n;
      if (n.nw.contains(px, py)) { n = n.nw; continue; }
      if (n.ne.contains(px, py)) { n = n.ne; continue; }
      if (n.sw.contains(px, py)) { n = n.sw; continue; }
      if (n.se.contains(px, py)) { n = n.se; continue; }
      return n;
    }
  }
}

module.exports = { Quadtree, QuadtreeInc };
