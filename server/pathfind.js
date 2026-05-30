// === server/pathfind.js — 로컬 A* pathfinding ===
// Phase 14.49-b
// 32px cell grid. NPC 주변 ~64 cell (2048px) 범위 안에서만 탐색.
// walkability:
//   - 같은 cell 안 이동: 항상 가능 (wall은 edge에만)
//   - 인접 cell 이동: findEdgeWall + isWaterTileLocal로 판정
// 결과: waypoint 배열 [{x, y}, ...] (cell 중심 좌표, 마지막은 실제 endX/Y)

const CELL = 32; // BUILDING_SIZE와 동일

// Binary heap min-priority queue (작은 f score가 먼저 나옴)
class MinHeap {
  constructor() { this.arr = []; }
  push(item) {
    const a = this.arr;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.arr;
    if (a.length === 0) return null;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      const n = a.length;
      while (true) {
        const l = i * 2 + 1, r = i * 2 + 2;
        let best = i;
        if (l < n && a[l].f < a[best].f) best = l;
        if (r < n && a[r].f < a[best].f) best = r;
        if (best === i) break;
        [a[best], a[i]] = [a[i], a[best]];
        i = best;
      }
    }
    return top;
  }
  get size() { return this.arr.length; }
}

// A* — startX/Y, endX/Y는 픽셀 좌표
// opts: { floor, isBlockedFn(oldX,oldY,newX,newY,floor), isWaterFn(x,y), maxCells=4096, searchRadiusCells=64 }
// 반환: 성공 시 [{x,y}] 배열 (waypoint 픽셀 좌표), 실패 시 null
function findPath(startX, startY, endX, endY, opts = {}) {
  const isBlocked = opts.isBlockedFn || (() => false);
  const isWater = opts.isWaterFn || (() => false);
  const floor = opts.floor || 0;
  const maxCells = opts.maxCells || 4096;
  const searchRadius = opts.searchRadiusCells || 64;

  const startCx = Math.floor(startX / CELL);
  const startCy = Math.floor(startY / CELL);
  const endCx = Math.floor(endX / CELL);
  const endCy = Math.floor(endY / CELL);

  // 시작 == 목적지 cell — waypoint 없이 바로 갈 수 있음
  if (startCx === endCx && startCy === endCy) {
    return [{ x: endX, y: endY }];
  }

  // 거리가 너무 멀면 search 안 함 (호출 측이 부분 path 처리)
  const cellDist = Math.abs(endCx - startCx) + Math.abs(endCy - startCy);
  if (cellDist > searchRadius) return null;

  // search bounds (start + end 중심 + radius)
  const minCx = Math.min(startCx, endCx) - searchRadius;
  const maxCx = Math.max(startCx, endCx) + searchRadius;
  const minCy = Math.min(startCy, endCy) - searchRadius;
  const maxCy = Math.max(startCy, endCy) + searchRadius;

  const key = (cx, cy) => `${cx},${cy}`;
  const heuristic = (cx, cy) => Math.abs(cx - endCx) + Math.abs(cy - endCy);

  const gScore = new Map();
  const cameFrom = new Map();
  const open = new MinHeap();
  const closed = new Set();

  gScore.set(key(startCx, startCy), 0);
  open.push({ cx: startCx, cy: startCy, f: heuristic(startCx, startCy) });

  let expanded = 0;
  while (open.size > 0 && expanded < maxCells) {
    const cur = open.pop();
    const ck = key(cur.cx, cur.cy);
    if (closed.has(ck)) continue;
    closed.add(ck);
    expanded++;

    if (cur.cx === endCx && cur.cy === endCy) {
      // 경로 복원
      const waypoints = [];
      let nk = ck;
      while (nk) {
        const [cx, cy] = nk.split(',').map(Number);
        waypoints.unshift({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 });
        nk = cameFrom.get(nk);
      }
      // 첫 waypoint는 NPC 현재 위치 — 제거
      waypoints.shift();
      // 마지막은 실제 endX/Y로 교체 (cell 중심이 아닌 정확한 목표)
      if (waypoints.length > 0) {
        waypoints[waypoints.length - 1] = { x: endX, y: endY };
      } else {
        waypoints.push({ x: endX, y: endY });
      }
      return waypoints;
    }

    // 4방향 (대각선은 wall edge 통과 판정 복잡해서 일단 생략 — TODO)
    const dirs = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    ];
    for (const { dx, dy } of dirs) {
      const ncx = cur.cx + dx;
      const ncy = cur.cy + dy;
      if (ncx < minCx || ncx > maxCx || ncy < minCy || ncy > maxCy) continue;
      const nk = key(ncx, ncy);
      if (closed.has(nk)) continue;

      // walkability — 현재 cell 중심에서 인접 cell 중심으로 이동 시도
      const fromCenterX = cur.cx * CELL + CELL / 2;
      const fromCenterY = cur.cy * CELL + CELL / 2;
      const toCenterX = ncx * CELL + CELL / 2;
      const toCenterY = ncy * CELL + CELL / 2;
      if (isBlocked(fromCenterX, fromCenterY, toCenterX, toCenterY, floor)) continue;
      if (isWater(toCenterX, toCenterY)) continue;

      const tentativeG = (gScore.get(ck) || 0) + 1;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, ck);
        gScore.set(nk, tentativeG);
        open.push({ cx: ncx, cy: ncy, f: tentativeG + heuristic(ncx, ncy) });
      }
    }
  }
  return null; // 못 찾음
}

module.exports = { findPath, CELL };
