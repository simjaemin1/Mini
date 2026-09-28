// === scripts/fixture-house.js — 방 하나를 DB 에 미리 짓는 픽스처 [T500 2026-09-28] ==============
//
// ★실내 판정(`isCellIndoor`·`playerIsIndoors` — 방 정본)을 재려면 **방이 있어야** 한다. 문법은 `e2e-rooms`·`e2e-weather`
//   가 각자 들고 있는 `seedHouse` 그대로다(바닥 칸 + 둘레 벽 · `buildings` 행). 이 카드는 남의 하네스를 안 고친다 —
//   새 하네스(`e2e-breath`)가 여기서 부르고, 두 사본을 여기로 모을지는 회부다.
//   ⚠존이 **꺼진 채로** 부른다(스키마를 만든 1차 부팅 뒤 · e2e-weather 와 같은 순서).
'use strict';
const SZ = 32;
const RECT = (x0, y0, x1, y1) => { const o = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
/** 칸 목록(존 로컬 셀)에 바닥을 깔고 둘레에 벽을 세운다. @returns {floors, walls} */
function seedHouse(dbPath, cells) {
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(dbPath); const now = Date.now();
  const ins = db.prepare('INSERT INTO buildings (type, owner_id, owner_name, x, y, data, created_at) VALUES (?,?,?,?,?,?,?)');
  const S = new Set(cells.map(([x, y]) => `${x},${y}`));
  let nf = 0, nw = 0;
  for (const [x, y] of cells) { ins.run('floor', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ floor: 0 }), now); nf++; }
  const edges = [];
  for (const [x, y] of cells) {
    if (!S.has(`${x},${y - 1}`)) edges.push([x, y, 'N']);
    if (!S.has(`${x},${y + 1}`)) edges.push([x, y + 1, 'N']);
    if (!S.has(`${x + 1},${y}`)) edges.push([x, y, 'E']);
    if (!S.has(`${x - 1},${y}`)) edges.push([x - 1, y, 'E']);
  }
  for (const [x, y, s] of edges) { ins.run('wall', 'e2e', 'E2E', x * SZ, y * SZ, JSON.stringify({ side: s, floor: 0 }), now); nw++; }
  db.close(); return { floors: nf, walls: nw };
}

module.exports = { SZ, RECT, seedHouse };
