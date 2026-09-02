#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// =============================================================================
// test-rooms — 방 판정(server/rooms.js) 전수 하네스 [배치 18 ①]
//   재민 확정 "건축 제대로 하자" 의 첫 단. 인계가 요구한 모양을 전부 짓고 판정을 확인한다:
//   직사각형 · ㄱ자 · ㅁ자(안마당 있는 回자) · 문 2개 · 벽 1칸 뚫림(→방 해체).
//
// ★사본 금지 — 이 하네스는 방 알고리즘을 **다시 쓰지 않는다.** `server/rooms.js` 정본을 그대로
//   불러 놓고, zone.js 가 주는 것과 같은 모양의 접근자(벽·문·바닥 조회)만 스텁으로 끼운다.
//   스텁은 '건물 목록에서 찾는다'는 zone.js 의 계약을 그대로 따르되 자료구조만 Map 이다.
//
// ★자명한 통과 금지 — 각 시나리오마다 "그 상황이 실제로 성립했는지"를 먼저 assert 한다
//   (벽이 놓였나 · 바닥이 깔렸나). 안 그러면 '아무것도 안 지어서 방이 0' 으로도 통과한다.
//
// 실행: node scripts/test-rooms.js
// =============================================================================
'use strict';
const Rooms = require('../server/rooms.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const H = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 62 - t.length)));

// ── zone.js 계약과 같은 모양의 스텁 세계 ─────────────────────────────────────
//   edges: "cx,cy,side,floor" → { type:'wall'|'door', open?, damaged? }
//   floors: "cx,cy,floor" → { type:'floor', data:{} }
let edges, floors;
function reset() { edges = new Map(); floors = new Map(); Rooms._reset(); }
const ek = (cx, cy, s, f) => `${cx},${cy},${s},${f}`;
const fk = (cx, cy, f) => `${cx},${cy},${f}`;
// zone.js 의 findEdgeBoundary 와 **같은 술어**: 벽이거나 문이면 경계(열림 무관), 부서졌으면 아니다.
function hasBoundaryEdge(cx, cy, side, floor) {
  const b = edges.get(ek(cx, cy, side, floor));
  if (!b) return false;
  if (b.damaged) return false;
  return b.type === 'wall' || b.type === 'door';
}
// 참고용 — 콜라이더 술어(열린 문은 통과). 방 경계와 갈리는지 대조하는 데 쓴다.
function collides(cx, cy, side, floor) {
  const b = edges.get(ek(cx, cy, side, floor));
  if (!b || b.damaged) return false;
  if (b.type === 'door' && b.open) return false;
  return true;
}
function floorTileAt(cx, cy, floor) { return floors.get(fk(cx, cy, floor)) || null; }
function isVillageTagged(b) { return !!(b && b.data && (b.data.hut || b.data.bld || b.data.gran)); }
Rooms.init({ hasBoundaryEdge, floorTileAt, isVillageTagged });

// ── 짓기 도구 ────────────────────────────────────────────────────────────────
const putEdge = (cx, cy, s, f, o = {}) => edges.set(ek(cx, cy, s, f), { type: 'wall', ...o });
const putDoor = (cx, cy, s, f, open) => edges.set(ek(cx, cy, s, f), { type: 'door', open: !!open });
const delEdge = (cx, cy, s, f) => edges.delete(ek(cx, cy, s, f));
const putFloor = (cx, cy, f, data) => floors.set(fk(cx, cy, f), { type: 'floor', data: data || {} });
// 셀 목록을 감싸는 벽을 두른다 — '바깥과 맞닿은 변'에만 벽을 세운다(사람이 짓는 방식과 같다).
function encloseCells(cells, f) {
  const S = new Set(cells.map(([x, y]) => `${x},${y}`));
  for (const [x, y] of cells) {
    if (!S.has(`${x},${y - 1}`)) putEdge(x, y, 'N', f);          // 북
    if (!S.has(`${x},${y + 1}`)) putEdge(x, y + 1, 'N', f);      // 남 = 아래칸의 북
    if (!S.has(`${x + 1},${y}`)) putEdge(x, y, 'E', f);          // 동
    if (!S.has(`${x - 1},${y}`)) putEdge(x - 1, y, 'E', f);      // 서 = 왼칸의 동
  }
}
const rect = (x0, y0, x1, y1) => { const o = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) o.push([x, y]); return o; };
function build(cells, f = 0, data) { for (const [x, y] of cells) putFloor(x, y, f, data); encloseCells(cells, f); }
// 정본 진입점으로 재판정(zone.js roomsTouchCell 과 같은 호출)
const recompute = (cells, f = 0) => Rooms.recomputeAround(cells, f);
const roomOf = (x, y, f = 0) => Rooms.roomAt(x, y, f);

// ══════════════════════════════════════════════════════════════════════════════
H('① 직사각형 4×3 — 기본형');
{
  reset();
  const cells = rect(10, 10, 13, 12);
  build(cells);
  ok(hasBoundaryEdge(10, 10, 'N', 0), '검사 전제 — 북벽이 실제로 놓였다');
  ok(!!floorTileAt(11, 11, 0), '검사 전제 — 바닥이 실제로 깔렸다');
  const res = recompute([[11, 11]]);
  const r = roomOf(11, 11);
  ok(!!r, '닫힌 직사각형은 방이다');
  ok(r && r.cells.size === 12, `방 크기 = 12칸 (실측 ${r ? r.cells.size : 0})`);
  ok(r && r.bbox.join(',') === '10,10,13,12', `bbox = 10,10,13,12 (실측 ${r ? r.bbox.join(',') : '-'})`);
  ok(res.changed.length === 1 && res.removed.length === 0, '변경 1 · 삭제 0 으로 보고된다');
  ok(roomOf(9, 11) === null && roomOf(14, 11) === null, '벽 바깥 칸은 방이 아니다');
  // id 결정성 — 다시 계산해도 같은 id
  const id1 = r.id; Rooms._reset(); recompute([[12, 12]]);
  ok(roomOf(11, 11) && roomOf(11, 11).id === id1, `id 가 결정론적이다 — 어느 칸에서 다시 재도 ${id1}`);
}

H('② 바닥이 없으면 방이 아니다 — "울타리 마당"');
{
  reset();
  const cells = rect(10, 10, 13, 12);
  encloseCells(cells, 0);                     // 벽만 두르고 바닥은 안 깐다
  ok(hasBoundaryEdge(10, 10, 'N', 0), '검사 전제 — 벽은 실제로 둘러쳐졌다');
  ok(!floorTileAt(11, 11, 0), '검사 전제 — 바닥은 없다');
  recompute([[11, 11]]);
  ok(roomOf(11, 11) === null, '벽으로 닫혔어도 바닥이 없으면 방이 아니다(마당)');
  // 한 칸만 비어도 안 된다
  for (const [x, y] of cells) putFloor(x, y, 0);
  floors.delete(fk(12, 11, 0));
  recompute([[11, 11]]);
  ok(roomOf(11, 11) === null, '★한 칸이라도 맨땅이면 방이 아니다');
  putFloor(12, 11, 0);
  recompute([[11, 11]]);
  ok(!!roomOf(11, 11), '그 칸을 채우면 그때 방이 된다');
}

H('③ ㄱ자 — 비직사각형');
{
  reset();
  // (10..13, 10..12) 에 (10..11, 13..15) 를 덧댄 ㄱ자
  const cells = rect(10, 10, 13, 12).concat(rect(10, 13, 11, 15));
  build(cells);
  recompute([[11, 11]]);
  const r = roomOf(11, 11);
  ok(!!r, 'ㄱ자도 방이다');
  ok(r && r.cells.size === cells.length, `방 크기 = ${cells.length}칸 (실측 ${r ? r.cells.size : 0})`);
  ok(r && r.cells.has('11,15'), '★꺾인 쪽 끝 칸(11,15)까지 같은 방이다 — 직사각형 가정이면 실패한다');
  ok(r && r.cells.has('13,10'), '반대쪽 끝 칸(13,10)도 같은 방이다');
  ok(roomOf(13, 14) === null, 'ㄱ자의 오목한 바깥(13,14)은 방이 아니다');
  ok(r && r.bbox.join(',') === '10,10,13,15', `bbox 는 외접 사각형 10,10,13,15 (실측 ${r ? r.bbox.join(',') : '-'})`);
}

H('④ ㅁ자(回) — 안마당은 방이 아니다');
{
  reset();
  // 5×5 겉테두리만 방(안마당 1칸 = 12,12 는 바닥 없음)
  const all = rect(10, 10, 14, 14);
  const yard = new Set(['12,12']);
  const roomCells = all.filter(([x, y]) => !yard.has(`${x},${y}`));
  build(roomCells);                       // 바닥 + 겉·안쪽 벽(안마당과 맞닿은 변에도 벽이 선다)
  ok(hasBoundaryEdge(12, 12, 'N', 0), '검사 전제 — 안마당 북변에 벽이 섰다');
  recompute([[10, 10]]);
  const r = roomOf(10, 10);
  ok(!!r, '回자 몸통은 방이다');
  ok(r && r.cells.size === 24, `몸통 24칸 (실측 ${r ? r.cells.size : 0})`);
  ok(r && !r.cells.has('12,12'), '★안마당(12,12)은 그 방에 안 들어간다');
  recompute([[12, 12]]);
  ok(roomOf(12, 12) === null, '★안마당 자체도 방이 아니다 — 바닥이 없으니까(열린 구조)');
  // 안마당에 바닥을 깔면? 벽으로 닫혀 있으니 그때는 별도의 방이 된다(지붕 덮인 골방).
  putFloor(12, 12, 0);
  recompute([[12, 12]]);
  const y = roomOf(12, 12);
  ok(!!y && y.cells.size === 1, '안마당에 바닥을 깔면 1칸짜리 **별도의 방**이 된다');
  ok(y && y.id !== r.id, '그 방은 몸통과 다른 방이다');
}

H('⑤ ★문 — 통행은 되고 방은 안 샌다 (이 배치의 핵심)');
{
  reset();
  const cells = rect(10, 10, 13, 12);
  build(cells);
  putDoor(11, 13, 'N', 0, false);   // 남벽 한 장을 닫힌 문으로 교체
  recompute([[11, 11]]);
  ok(!!roomOf(11, 11), '닫힌 문이 있어도 방이다');
  const before = roomOf(11, 11).cells.size;
  // 문을 연다 — 콜라이더는 뚫리고, 방 경계는 그대로여야 한다
  edges.get(ek(11, 13, 'N', 0)).open = true;
  ok(collides(11, 13, 'N', 0) === false, '검사 전제 — 열린 문은 **통행 가능**하다(콜라이더 술어)');
  ok(hasBoundaryEdge(11, 13, 'N', 0) === true, '★열린 문도 **방 경계**다(판정 술어) — 두 술어가 갈린다');
  recompute([[11, 11]]);
  const r = roomOf(11, 11);
  ok(!!r, '★문을 열어도 방이 유지된다 — 종전엔 여기서 BFS 가 새어 실내 판정이 풀렸다');
  ok(r && r.cells.size === before, `방 크기 불변 ${before} (실측 ${r ? r.cells.size : 0})`);
  // 문 2개
  putDoor(12, 13, 'N', 0, true);
  recompute([[11, 11]]);
  ok(roomOf(11, 11) && roomOf(11, 11).cells.size === before, '문이 2개여도(둘 다 열림) 방 크기 불변');
}

H('⑥ 벽 1칸 뚫림 → 방 해체');
{
  reset();
  const cells = rect(10, 10, 13, 12);
  build(cells);
  recompute([[11, 11]]);
  ok(!!roomOf(11, 11), '검사 전제 — 뚫기 전에는 방이다');
  delEdge(11, 13, 'N', 0);                       // 남벽 한 장 철거
  const res = recompute([[11, 12], [11, 13]]);   // zone.js seedsForEdge(11,13,'N') 과 같은 시드
  ok(roomOf(11, 11) === null, '★벽 한 칸이 사라지면 방이 해체된다');
  ok(res.removed.length === 1, `삭제된 방 1개로 보고된다 (실측 ${res.removed.length})`);
  ok(res.changed.length === 0, '새로 생긴 방은 없다');
  // 다시 막으면 되살아난다 — 그리고 id 가 같다(결정론)
  putEdge(11, 13, 'N', 0);
  const res2 = recompute([[11, 12], [11, 13]]);
  ok(!!roomOf(11, 11), '다시 막으면 방이 되살아난다');
  ok(res2.changed.length === 1 && res2.changed[0].id === `r0:10,10`, `같은 id 로 되살아난다 (${res2.changed[0] && res2.changed[0].id})`);
  // 부서진 벽도 구멍이다
  edges.get(ek(11, 13, 'N', 0)).damaged = true;
  recompute([[11, 12], [11, 13]]);
  ok(roomOf(11, 11) === null, '★부서진 벽도 구멍이다 — 방이 해체된다');
}

H('⑦ 벽으로 방 가르기 / 합치기');
{
  reset();
  const cells = rect(10, 10, 13, 11);
  build(cells);
  recompute([[10, 10]]);
  ok(roomOf(10, 10) && roomOf(10, 10).cells.size === 8, '검사 전제 — 처음엔 8칸 한 방');
  // 가운데 세로 벽(11,y 의 동변)으로 가른다
  putEdge(11, 10, 'E', 0); putEdge(11, 11, 'E', 0);
  const res = recompute([[11, 10], [12, 10]]);
  const a = roomOf(10, 10), b = roomOf(13, 10);
  ok(a && b && a.id !== b.id, '★벽을 세우면 두 방으로 갈린다');
  ok(a && b && a.cells.size === 4 && b.cells.size === 4, `각각 4칸 (실측 ${a ? a.cells.size : 0}·${b ? b.cells.size : 0})`);
  ok(res.changed.length === 2, `변경 2개로 보고된다 (실측 ${res.changed.length})`);
  // 도로 헐면 합쳐진다
  delEdge(11, 10, 'E', 0); delEdge(11, 11, 'E', 0);
  const res2 = recompute([[11, 10], [12, 10], [11, 11], [12, 11]]);
  const m = roomOf(10, 10);
  ok(m && m.cells.size === 8, '★벽을 헐면 다시 한 방(8칸)으로 합쳐진다');
  ok(res2.removed.length >= 1, `합쳐지면서 사라진 방이 보고된다 (실측 ${res2.removed.length})`);
  ok(Rooms.stats().rooms === 1, `세계에 남은 방은 1개 (실측 ${Rooms.stats().rooms})`);
}

H('⑧ 층 분리 · 마을 건물 제외 · 상한');
{
  reset();
  const cells = rect(10, 10, 12, 11);
  build(cells, 0); build(cells, 1);            // 같은 자리에 0층·1층
  recompute([[10, 10]], 0); recompute([[10, 10]], 1);
  const r0 = roomOf(10, 10, 0), r1 = roomOf(10, 10, 1);
  ok(r0 && r1 && r0.id !== r1.id, '층이 다르면 다른 방이다');
  ok(r0.id.startsWith('r0:') && r1.id.startsWith('r1:'), `id 에 층이 박힌다 (${r0.id} · ${r1.id})`);
  // 마을 정형 건물은 이 경로를 안 탄다
  reset();
  const vc = rect(20, 20, 22, 21);
  build(vc, 0, { hut: [20, 20, 22, 21] });     // 마을 태그 붙은 바닥
  ok(isVillageTagged(floorTileAt(21, 20, 0)), '검사 전제 — 마을 태그가 실제로 붙었다');
  recompute([[21, 20]]);
  ok(roomOf(21, 20) === null, '★마을 정형 건물(발자국 렉트 태그)은 방 시스템을 안 탄다 — 현행 경로 유지(회귀 0)');
  // 상한 — 너무 넓으면 실외로 확정하고 멈춘다
  reset();
  const big = rect(0, 0, 24, 24);              // 625칸 > MAX_ROOM_CELLS
  build(big);
  recompute([[12, 12]]);
  ok(roomOf(12, 12) === null, `${Rooms.MAX_ROOM_CELLS}칸을 넘는 영역은 실외로 확정된다(작업량 상한)`);
}

console.log(`\n=== 방 판정 하네스: ${pass} 통과 / ${fail} 실패 ${fail ? '❌' : '✅'} ===`);
process.exit(fail ? 1 : 0);
