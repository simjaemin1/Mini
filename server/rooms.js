'use strict';
// =============================================================================
// server/rooms.js — 방(room) 판정 정본 [배치 18 ①, 2026-08-04d]
//   재민 확정: "건축 제대로 하자." 현행 실내 판정은 **발자국 렉트**(data.hut/bld/gran)라
//   마을 정형 건물 전용이다. 플레이어가 ㄱ자·ㅁ자로 자유 건축하면 실내라는 개념 자체가 없다.
//   이 모듈이 그 층을 만든다.
//
// ── 정의 ────────────────────────────────────────────────────────────────────
//   방 = **벽·문으로 닫힌** 셀 집합이면서 **그 셀 전부에 바닥이 깔린** 것.
//     · 닫힘: 4방 BFS 가 MAX_ROOM_CELLS 안에서 갇히면 닫힌 것. 새어 나가면 실외다.
//     · 바닥: 한 칸이라도 맨땅이면 방이 아니라 **마당**이다. 인계의 "열린 구조(울타리 마당)는
//       방이 아니다"를 이 규칙 하나로 성립시킨다 — 울타리는 애초에 경계도 아니고(아래),
//       벽으로 둘러친 안마당도 바닥이 없으면 방이 아니다(回자 집의 마당이 여기 걸린다).
//     · 규칙이 한 줄이라 플레이어에게 설명된다: **"바닥을 다 깔아야 방이 된다."**
//
// ── ★문 개체화 (이 배치의 핵심 한 줄) ──────────────────────────────────────
//   경계 판정에서 문은 **열려 있어도 경계다.** 콜라이더는 종전 그대로(열린 문 = 통과).
//   즉 물리는 한 비트도 안 바뀌고 판정만 갈라진다. 종전엔 열린 문이 경계에서 빠져
//   방 BFS 가 문으로 새어 나갔다(client.js 4272 주석이 그 실증이다).
//   부수 효과: **문을 여닫아도 방이 안 바뀐다** — 토글마다 재계산하던 무효화 버그가 통째로 사라진다.
//
// ── 마을 건물은 이 경로를 안 탄다 (회귀 0) ─────────────────────────────────
//   인계 확정: "기존 마을 건물(data.hut/bld/gran)은 현행 경로 그대로 — 새 경로는 플레이어
//   자유 건축 전용". 그래서 시드(BFS 출발점)를 **마을 태그가 없는 바닥**으로만 잡는다.
//   마을 움집·큰집은 문이 개구(문 개체가 아예 없다)라 어차피 BFS 가 새지만, 시드에서 빼는 편이
//   비용도 0 이고 계약도 명시적이다. 장기 통합은 회부.
//
// ── 방 id 는 저장하지 않는다 ────────────────────────────────────────────────
//   id = `r<floor>:<minCx>,<minCy>` — 셀 집합에서 결정론적으로 나온다. 그래서
//     · DB 스키마 변경 0(마이그레이션 없음) · 서버 재시작에도 같은 id · 모든 클라가 같은 id.
//   방은 건물에서 **파생**되는 상태고, 건물은 이미 영속이다. 파생값을 또 저장하면 두 진실이 된다.
// =============================================================================

const MAX_ROOM_CELLS = 400;   // 이 이상 퍼지면 '실외'로 확정하고 멈춘다(작업량 상한 겸용)

let D = null;   // 주입된 정본 접근자 — 이 모듈은 벽·바닥을 **직접 뒤지지 않는다**(사본 금지)
const rooms = new Map();          // id → { id, floor, cells:Set<"cx,cy">, bbox:[x0,y0,x1,y1] }
const cellRoom = new Map();       // "cx,cy,floor" → id

// deps:
//   hasBoundaryEdge(cx, cy, side, floor) → bool   벽 또는 문(열림 무관). zone.js 정본.
//   floorTileAt(cx, cy, floor)           → 건물 또는 null   그 칸의 바닥 타일
//   isVillageTagged(b)                   → bool   마을 정형 건물(발자국 렉트 태그)인가
function init(deps) { D = deps; }

const ckey = (cx, cy, f) => `${cx},${cy},${f}`;

// ── 한 칸에서 시작하는 방 판정 ───────────────────────────────────────────────
//   반환: room 객체 또는 null(실외이거나 바닥이 안 깔림)
function computeRoomAt(cx, cy, floor) {
  const seen = new Set();
  const cells = [];
  const q = [[cx, cy]];
  seen.add(`${cx},${cy}`);
  let escaped = false;
  while (q.length) {
    if (cells.length >= MAX_ROOM_CELLS) { escaped = true; break; }   // 너무 넓다 = 실외 취급
    const [x, y] = q.shift();
    cells.push([x, y]);
    // 4방 — 변에 벽/문이 있으면 못 넘는다. 문은 **열려 있어도** 못 넘는다(경계).
    //   변 정규화는 zone.js 와 같다: (x,y)의 서변 = (x-1,y)의 동변 · 남변 = (x,y+1)의 북변.
    const nb = [
      [x, y - 1, D.hasBoundaryEdge(x, y, 'N', floor)],
      [x, y + 1, D.hasBoundaryEdge(x, y + 1, 'N', floor)],
      [x - 1, y, D.hasBoundaryEdge(x - 1, y, 'E', floor)],
      [x + 1, y, D.hasBoundaryEdge(x, y, 'E', floor)],
    ];
    for (const [nx, ny, blocked] of nb) {
      if (blocked) continue;
      const k = `${nx},${ny}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push([nx, ny]);
    }
  }
  if (escaped) return null;                       // 닫히지 않았다 = 실외
  if (!cells.length) return null;
  // 바닥 전수 — 한 칸이라도 맨땅이면 방이 아니라 마당이다
  for (const [x, y] of cells) if (!D.floorTileAt(x, y, floor)) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of cells) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  // id 는 셀 집합에서 결정론적으로(최소 셀). 같은 방이면 언제 어디서 재계산해도 같은 id.
  const id = `r${floor}:${x0},${y0}`;
  return { id, floor, cells: new Set(cells.map(([x, y]) => `${x},${y}`)), bbox: [x0, y0, x1, y1] };
}

// ── 국소 재계산 ─────────────────────────────────────────────────────────────
//   벽·문·바닥이 바뀐 자리 주변만 다시 본다. **전역 재계산 금지**(거리행렬 증분화 선례).
//   반환: { changed: [room…], removed: [id…] } — 그대로 브로드캐스트하면 된다.
function recomputeAround(seedCells, floor) {
  const changed = [], removed = [];
  // 1) 영향권의 옛 방을 먼저 걷어낸다 — 시드 칸이 속했던 방 전체가 대상이다
  const dropped = new Set();
  for (const [cx, cy] of seedCells) {
    const oldId = cellRoom.get(ckey(cx, cy, floor));
    if (oldId && !dropped.has(oldId)) {
      dropped.add(oldId);
      const r = rooms.get(oldId);
      if (r) { for (const k of r.cells) cellRoom.delete(`${k},${floor}`); rooms.delete(oldId); }
    }
  }
  // 2) 시드에서 다시 판정 — 이미 이번 회차에 담긴 칸은 건너뛴다(같은 방 중복 BFS 방지)
  const done = new Set();
  for (const [cx, cy] of seedCells) {
    if (done.has(`${cx},${cy}`)) continue;
    const t = D.floorTileAt(cx, cy, floor);
    if (!t || D.isVillageTagged(t)) { done.add(`${cx},${cy}`); continue; }   // 마을 정형 건물은 이 경로 밖
    const room = computeRoomAt(cx, cy, floor);
    if (!room) { done.add(`${cx},${cy}`); continue; }
    for (const k of room.cells) done.add(k);
    rooms.set(room.id, room);
    for (const k of room.cells) cellRoom.set(`${k},${floor}`, room.id);
    dropped.delete(room.id);              // 같은 id 로 되살아났으면 '삭제'가 아니라 '갱신'
    changed.push(room);
  }
  for (const id of dropped) removed.push(id);
  return { changed, removed };
}

// 벽·문 한 장이 바뀌었을 때의 시드 = 그 변 양옆 두 칸
function seedsForEdge(cx, cy, side) {
  return side === 'N' ? [[cx, cy], [cx, cy - 1]] : [[cx, cy], [cx + 1, cy]];
}

function roomIdAt(cx, cy, floor) { return cellRoom.get(ckey(cx, cy, floor)) || null; }
function roomAt(cx, cy, floor) { const id = roomIdAt(cx, cy, floor); return id ? rooms.get(id) || null : null; }
function allRooms() { return Array.from(rooms.values()); }
function wireRoom(r) { const c = []; for (const k of r.cells) { const [x, y] = k.split(','); c.push(+x, +y); } return { id: r.id, floor: r.floor, bbox: r.bbox, cells: c }; }
function dropRoom(id) {
  const r = rooms.get(id); if (!r) return false;
  for (const k of r.cells) cellRoom.delete(`${k},${r.floor}`);
  rooms.delete(id); return true;
}
function stats() { return { rooms: rooms.size, cells: cellRoom.size }; }
function _reset() { rooms.clear(); cellRoom.clear(); }

module.exports = { init, computeRoomAt, recomputeAround, seedsForEdge, roomAt, roomIdAt, allRooms, wireRoom, dropRoom, stats, MAX_ROOM_CELLS, _reset };
