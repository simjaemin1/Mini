// =============================================================================
// 선분 격자 색인 — `_isPointInRiver` 의 선형 주사를 없앤다 [2026-08-31 밤 · 기본 꺼짐]
// =============================================================================
// ★왜 (측정 근거):
//   `_isPointInRiver` 는 bbox 조기기각 **뒤** path 를 선형으로 훑는다. v7 스무딩 이후
//   강 55개 4,241점 · 산맥 11개 2,140점이라, bbox 안에 든 점 하나가 수백 개 선분과
//   거리 계산을 한다. 실측 1회 ≈ 50µs.
//   타일 메모(terrain-tilecache.js)는 **같은 셀을 다시 묻는** 비용만 없앤다.
//   처음 묻는 비용은 그대로다 — 그래서 부팅이 여전히 25초다:
//   프로파일에서 `SimVillages.init` 24.6초 중 `computeAndInjectDistMatrix` 가 24.2초이고,
//   그 밑이 전부 이 술어다(전부 최초 질의라 메모가 안 듣는다).
//   ⇒ 두 수리는 겹치지 않는다. 이건 **최초 1회**를 싸게 만든다.
//
// ★등가성의 근거 (왜 답이 안 바뀌나):
//   원본은 "어떤 선분 i 에 대해 dist(p, seg_i) < halfWidth_i(t) 인가"를 묻는 **불리언**이다.
//   구간 i 위에서 halfWidth 의 최대값은 max(w1, w2)/2 이므로,
//   그 조건을 만족하는 p 는 반드시 `bbox(seg_i) + max(w1,w2)/2` 안에 있다.
//   따라서 그 확장 bbox 가 덮는 격자 칸들에 선분 i 를 넣어 두면,
//   질의점이 속한 칸의 후보 목록은 **답이 참일 수 있는 모든 선분을 포함**한다.
//   ⇒ 검사 순서만 달라지고 불리언 결과는 같다(원본도 첫 일치에서 true 를 낸다).
//
// ★기본 꺼짐: env TERRAIN_SEG_INDEX=1. 끄면 색인을 만들지도 않고 종전 선형 주사 그대로.
//
// ★거울에 관하여 (다음 사람에게):
//   `public/terrain.js` 에도 같은 `_isPointInRiver` 가 있다(클라 거울 — add-valley.js 가 남긴 규약).
//   **여기만 고쳤다.** 이유: ①이 수리는 **답을 안 바꾸는 순수 가속기**라 거울이 갈릴 여지가 없다
//   (데이터 규약이 아니라 탐색 순서만 다르다), ②보고된 문제는 서버 멎음이지 클라 렌더가 아니다,
//   ③env 로 켜지는 것이라 클라엔 켤 자리도 없다.
//   ⇒ 클라도 같은 선형 주사를 하고 있으니 **거기도 느릴 수 있다.** 재려면 클라 프로파일부터 —
//     짐작으로 옮겨 심지 마라(회부_존_멎음_다음층.md 참조).

const CELL = 512;          // 격자 칸 크기(월드 px). 강 폭(≈200)보다 넉넉히 크게 — 확장이 칸을 크게 안 늘린다.
const MAX_CELLS = 400000;  // 안전판 — 이보다 커지면 색인을 포기하고 null(=종전 경로)

// path 한 벌(강/산맥/계곡 하나)에 대한 색인. 실패하면 null 을 준다 — 호출측은 그때 종전 경로를 탄다.
function buildSegIndex(river) {
  const path = river.path;
  if (!path || path.length < 2) return null;
  const defW = river.width || 200;
  const px = (p) => (p.pos ? p.pos[0] : p[0]);
  const py = (p) => (p.pos ? p.pos[1] : p[1]);
  const pw = (p) => (p.width != null ? p.width : defW);

  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of path) {
    const a = px(p), b = py(p), h = pw(p) / 2;
    if (a - h < x0) x0 = a - h; if (a + h > x1) x1 = a + h;
    if (b - h < y0) y0 = b - h; if (b + h > y1) y1 = b + h;
  }
  const gx0 = Math.floor(x0 / CELL), gy0 = Math.floor(y0 / CELL);
  const gw = Math.floor(x1 / CELL) - gx0 + 1, gh = Math.floor(y1 / CELL) - gy0 + 1;
  if (!(gw > 0 && gh > 0) || gw * gh > MAX_CELLS) return null;

  const cells = new Array(gw * gh);
  for (let i = 0; i < path.length - 1; i++) {
    const p1 = path[i], p2 = path[i + 1];
    const ax = px(p1), ay = py(p1), bx = px(p2), by = py(p2);
    const h = Math.max(pw(p1), pw(p2)) / 2;          // ★구간 위 halfWidth 의 상한
    const cx0 = Math.floor((Math.min(ax, bx) - h) / CELL) - gx0;
    const cx1 = Math.floor((Math.max(ax, bx) + h) / CELL) - gx0;
    const cy0 = Math.floor((Math.min(ay, by) - h) / CELL) - gy0;
    const cy1 = Math.floor((Math.max(ay, by) + h) / CELL) - gy0;
    for (let cy = cy0; cy <= cy1; cy++) {
      if (cy < 0 || cy >= gh) continue;
      for (let cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cx >= gw) continue;
        const k = cy * gw + cx;
        (cells[k] || (cells[k] = [])).push(i);
      }
    }
  }
  let entries = 0, used = 0;
  for (const c of cells) if (c) { used++; entries += c.length; }
  return {
    gx0, gy0, gw, gh, cells, segs: path.length - 1, entries, used,
    // 질의점이 속한 칸의 후보 목록(없으면 빈 배열 = 그 칸엔 어떤 선분도 닿지 않는다)
    at(x, y) {
      const cx = Math.floor(x / CELL) - gx0, cy = Math.floor(y / CELL) - gy0;
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return EMPTY;
      return cells[cy * gw + cx] || EMPTY;
    },
  };
}
const EMPTY = [];

module.exports = { buildSegIndex, CELL, EMPTY };
