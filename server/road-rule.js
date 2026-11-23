'use strict';
// ═══ ★★[T1440 2026-11-22 · ★재민 판정 47 · 48 · 49 · 50] 처음 길 — 보호는 땅의 권리에서 · 길은 사유지와 마을 것을 비켜 간다 · 주인 없는 땅의 길 위 것은 부순다 ═══
//   손잡이 `T1440_ROAD_RULE`('1' 만 켬 · ★끔 기본 — 끔이면 villages.js · zone.js 가 이 모듈을 부르지 않는다 = 종전 바이트).
//   정본 = `설계/길막기_코너케이스_2026-11-22.md` §7 · 카드 `지시/지시_T1440.md`(셋째 판 · 판정 49 · 50).
//   이 모듈은 세 표와 판정 하나다(존 · 마을 시뮬이 같이 쓴다 — 한 프로세스에 하나):
//   ① 구조물 표(S) — 걸음을 막는 것을 땅의 급으로 나눈다(판정 50 급: ① 주인 없는 땅 < ② 마을 밖 개인 사유지 < ③ 마을 땅 위 개인 사유지 < ④ 마을 것):
//      U = 주인 없는 땅의 구조물(벽 · 문 · 울타리 · 움집터 — 사유지 밖 · 마을 땅 밖 · 마을 주인 아님) — 길 구하기 첫째 걸음만 비킨다 · 길 위에 있으면 누구든 부순다
//      V = 마을 것(NPC 마을 · 마을 주인 행 · 마을 땅 위 것) — 늘 비킨다
//      P = 개인 사유지 칸 안의 구조물 — 길 계산은 그 사유지 칸이 맡는다(몸은 부딪는다)
//      사유지 칸(② · ③) — 선포 시각 · "길이 지나는 칸"(내준 칸 — 길이 그대로 지난다). 표시 붙은 조각(길이 지나는 칸에 세운 막는 것)은 없는 것.
//   ② 길 표(R) — 저장된 길(마을 쌍 → px 꺾은 줄)이 지나는 칸을 8×8 칸 덩이로 묶은 역색인(메모리 · 저장 0 — 부팅 때 다시 세운다).
//   ③ 처음 길(F) — 쌍마다 처음 길의 길이 · 꺾은 줄 — 3배의 기준(조금씩 돌려 넘기는 것을 막는다 · 존 DB 에 남긴다).
//   ④ 판정(J) — 사유지 선포 · 마을 건물 때만(그 칸이 저장된 길에 닿을 때). 그 쌍들의 길을 걸음마다 다시 구한다 — 급이 낮은 것부터 길을 내준다:
//      걸음 1 다 피해서 · 2 주인 없는 구조물은 없는 것 · 3 마을 밖 사유지를 나중 칸부터 · 4 마을 땅 위 사유지를 나중 칸부터 · 5 3배 없이 가장 짧은 길(마을 건물만).
//      놓는 것의 급이 갈 걸음을 정한다: 마을 밖 사유지 = 2 · 마을 땅 위 사유지 = 3 · 마을 건물 = 5(NPC 마을 = 2 — PM 결정). 걸음 1 ~ 4 는 처음 길의 3배 안.
//      한 걸음 안은 종전 셋(줄기 고쳐 잇기 → 마디 다시 구하기 → 쌍 전체 다시 구하기). 3배 = T1406 자의 수(새 수 0). 상자 둘레 16 · 48 칸 · 문턱 1 · 2 · 4 … 는 구현 상한.
const ON = process.env.T1440_ROAD_RULE === '1';
const SZ = 32;
const K = (x, y) => y * 65536 + x;                              // 칸 열쇠
const KX = (k) => k % 65536, KY = (k) => (k / 65536) | 0;
const EK = (cx, cy, side) => K(cx, cy) * 2 + (side === 'E' ? 1 : 0);   // 변 열쇠 — N = (cx,cy) 윗변 · E = (cx,cy) 오른변(zone `_edgeScan` 꼴)
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };   // 판정 시간(ms) — 가상 시계 판에서도 흐르는 CPU 시간
const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
const MULT = 3;                      // 돌아갈 길 = 처음 길 × 3 안(T1406 자)
const REPAIR_PAD = [16, 48];         // 줄기 고쳐 잇기 상자 둘레(칸) — 구현 상한(넘는 돌아감은 마디 다시 구하기 · 코스 격자)
const REPAIR_MAX_NODES = 600000;     // 칸 A* 상한(상자 하나)
const FIX_PAD = [16, 48, 128, 256];  // 막힌 이음 고치기 상자 둘레(칸) — 끝 칸이 긴 담 건너 코스 마디에 붙은 이음(드물다)
const NEWEST = [1, 2, 4, 8, 16, 32, Infinity];   // 걸음 3 · 4 — 나중 칸부터 몇 장까지 내주게 하나(가장 적게 — 선포 시각 문턱을 좁힌다)
const CLAIM_NEAR = 64;               // 걸음 3 · 4 의 사유지 후보 = 그 쌍의 지금 길 상자 둘레(칸)
const WIN = 40 * SZ;                 // 줄기 고쳐 잇기 창(px) — 조각이 닿는 마디가 길면 조각 앞뒤 40칸에서 끊어 그 사이만 고친다(긴 곧은 마디의 두 끝 = 큰 상자 · 칸 A* 상한)
const st = { judge: 0, free: 0, protected: 0, yield: 0, step: [0, 0, 0, 0, 0, 0], stepFail: 0, rep: 0, repFail: 0, seg: 0, segFail: 0, full: 0, fullFail: 0, cpu: [], pairs: [], marks: 0, idx: { add: 0, del: 0 }, rIdx: 0, rDel: 0, firstSet: 0 };

// ── ① 구조물 표 ─────────────────────────────────────────────────────
const CLS = ['U', 'V', 'P'];
const S = {
  byId: new Map(),                                              // id → { piece, cls }
  cell: { U: new Map(), V: new Map(), P: new Map() },           // 칸 → 수
  edge: { U: new Map(), V: new Map(), P: new Map() },           // 변 → 수
  phys: { U: new Map(), V: new Map(), P: new Map() },           // 몸이 부딪는 칸(울타리 — 발자국 렉트는 길만 막는다)
  blkW: 0, blkH: 0, blk: null,                                  // 16×16 칸 덩이마다 표에 든 칸 · 변 · 사유지 칸 수(빠른 '없음')
  claimCells: new Map(), claimIds: new Map(), claimsDirty: true, claimsIter: null,   // 칸 → { id, t, lvl(2|3), pass }
  marked: new Set(), ver: 0,
};
function init(o) {   // o = { W, H } (칸) — 존이 처음 물을 때 한 번
  if (S.blk) return;
  S.blkW = Math.ceil((o.W || 0) / 16) + 2; S.blkH = Math.ceil((o.H || 0) / 16) + 2;
  S.blk = new Uint32Array(Math.max(1, S.blkW * S.blkH));
}
function _bi(x, y) { const bx = x >> 4, by = y >> 4; if (bx < 0 || by < 0 || bx >= S.blkW || by >= S.blkH) return -1; return by * S.blkW + bx; }
function _bump(M, k, d) { const v = (M.get(k) || 0) + d; if (v > 0) M.set(k, v); else M.delete(k); }
function _blkAdd(x, y, d) { if (!S.blk) return; const i = _bi(x, y); if (i >= 0) S.blk[i] = Math.max(0, S.blk[i] + d); }
function _none(x, y) { if (!S.blk) return false; const i = _bi(x, y); return i >= 0 && !S.blk[i]; }
//   조각 = { cells: [칸 열쇠], edges: [변 열쇠], phys } · 급 cls ∈ U · V · P
function sAdd(id, piece, cls) {
  if (!piece || S.marked.has(id)) return false;
  if (S.byId.has(id)) sDel(id);
  const c = CLS.includes(cls) ? cls : 'U';
  S.byId.set(id, { piece, cls: c });
  for (const k of piece.cells) { _bump(S.cell[c], k, 1); if (piece.phys) _bump(S.phys[c], k, 1); _blkAdd(KX(k), KY(k), 1); }
  for (const e of piece.edges) { _bump(S.edge[c], e, 1); const k = Math.floor(e / 2); _blkAdd(KX(k), KY(k), 1); }
  if (!String(id).startsWith('__')) { S.ver++; st.idx.add++; }   // '__' = 판정이 잠깐 넣는 조각(표 판이 안 바뀐 것으로 친다)
  return true;
}
function sDel(id) {
  const o = S.byId.get(id); if (!o) return false;
  S.byId.delete(id);
  const p = o.piece, c = o.cls;
  for (const k of p.cells) { _bump(S.cell[c], k, -1); if (p.phys) _bump(S.phys[c], k, -1); _blkAdd(KX(k), KY(k), -1); }
  for (const e of p.edges) { _bump(S.edge[c], e, -1); const k = Math.floor(e / 2); _blkAdd(KX(k), KY(k), -1); }
  if (!String(id).startsWith('__')) { S.ver++; st.idx.del++; }
  return true;
}
function sGet(id) { return S.byId.get(id) || null; }
//   사유지 — 존이 준 순회(`claimsIter() → [[id, [[cx,cy]…], marked, t, lvl, pass]…]`)로 늦게 다시 센다(바뀌면 존이 `claimsDirty()`)
function claimsUse(iter) { S.claimsIter = iter; S.claimsDirty = true; }
function claimsDirty() { S.claimsDirty = true; }
function _claimsBuild() {
  S.claimsDirty = false;
  for (const [, o] of S.claimIds) for (const k of o.cells) _blkAdd(KX(k), KY(k), -1);
  S.claimCells.clear(); S.claimIds.clear();
  if (!S.claimsIter) return;
  for (const [id, cells, marked, t, lvl, pass] of S.claimsIter()) {
    if (marked) continue;
    const L = [], o = { id, t: +t || 0, lvl: lvl === 3 ? 3 : 2, pass: !!pass, cells: L };
    for (const [x, y] of cells) { const k = K(x, y); S.claimCells.set(k, o); _blkAdd(x, y, 1); L.push(k); }
    S.claimIds.set(id, o);
  }
  S.ver++;
}
function claimAt(x, y) { if (S.claimsDirty) _claimsBuild(); return S.claimCells.get(K(x, y)) || null; }
//   걸음(모드) — { U: 주인 없는 구조물을 비키나 · P2 · P3: null = 그 급 사유지 칸이 다 막는다 · 'all' = 다 지난다 · Set(id) = 그 사유지만 지난다 }
const M1 = { U: true, P2: null, P3: null };    // 걸음 1 — 다 피해서(일반 길 구하기의 첫째 걸음)
const M2 = { U: false, P2: null, P3: null };   // 걸음 2 — 주인 없는 구조물은 없는 것(일반 길 구하기의 둘째 걸음 · 저장된 길 검사 · 걸음 5 의 막힘)
function _claimBlk(o, M) {
  if (!o || o.pass) return false;                 // 길이 지나는 칸(내준 칸)
  const a = o.lvl === 3 ? M.P3 : M.P2;
  if (a === 'all') return false;
  if (a && a.has(o.id)) return false;
  return true;
}
function cellBlkM(x, y, M) {
  if (S.claimsDirty) _claimsBuild();
  if (_none(x, y)) return false;
  const k = K(x, y);
  if (S.cell.V.has(k)) return true;
  if (M.U && S.cell.U.has(k)) return true;
  const o = S.claimCells.get(k);
  return o ? _claimBlk(o, M) : false;
}
function _ek(fx, fy, tx, ty) {
  if (tx === fx + 1 && ty === fy) return EK(fx, fy, 'E');
  if (tx === fx - 1 && ty === fy) return EK(tx, ty, 'E');
  if (ty === fy + 1 && tx === fx) return EK(tx, ty, 'N');
  if (ty === fy - 1 && tx === fx) return EK(fx, fy, 'N');
  return -1;
}
function edgeStepM(fx, fy, tx, ty, M) {
  const e = _ek(fx, fy, tx, ty); if (e < 0) return false;
  const c = Math.floor(e / 2); if (_none(KX(c), KY(c))) return false;
  return S.edge.V.has(e) || (M.U && S.edge.U.has(e));
}
//   저장된 길 검사 · 걷는 길 — 걸음 2(주인 없는 구조물은 캐러밴이 친다 · 길이 안 비킨다)
function cellBlk(x, y) { return cellBlkM(x, y, M2); }
function edgeStep(fx, fy, tx, ty) { return edgeStepM(fx, fy, tx, ty, M2); }
function stepBlk(fx, fy, tx, ty) { return cellBlk(tx, ty) || edgeStep(fx, fy, tx, ty); }
function stepBlk8(fx, fy, tx, ty) {
  const sx = tx - fx, sy = ty - fy;
  if (sx && sy) {
    if (cellBlk(tx, ty)) return true;
    const a = !edgeStep(fx, fy, fx + sx, fy) && !cellBlk(fx + sx, fy) && !edgeStep(fx + sx, fy, tx, ty);
    const b = !edgeStep(fx, fy, fx, fy + sy) && !cellBlk(fx, fy + sy) && !edgeStep(fx, fy + sy, tx, ty);
    return !(a || b);
  }
  return stepBlk(fx, fy, tx, ty);
}
//   몸 걸음(8방) — 몸이 멈추는 것(마을 것 V · 사유지 안 P 의 벽 · 문 변 · 울타리 칸 — 콜라이더가 보는 그것). 주인 없는 것(U)은 멈추지 않고 친다(존 `_t1440MarkHit`).
function stepPhys8(fx, fy, tx, ty) {
  const pc = (x, y) => { if (_none(x, y)) return false; const k = K(x, y); return S.phys.V.has(k) || S.phys.P.has(k); };
  const pe = (ax, ay, bx, by) => { const e = _ek(ax, ay, bx, by); if (e < 0) return false; const c = Math.floor(e / 2); if (_none(KX(c), KY(c))) return false; return S.edge.V.has(e) || S.edge.P.has(e); };
  const sx = tx - fx, sy = ty - fy;
  if (sx && sy) {
    if (pc(tx, ty)) return true;
    const a = !pe(fx, fy, fx + sx, fy) && !pe(fx + sx, fy, tx, ty);
    const b = !pe(fx, fy, fx, fy + sy) && !pe(fx, fy + sy, tx, ty);
    return !(a || b);
  }
  return pc(tx, ty) || pe(fx, fy, tx, ty);
}
//   주인 없는 구조물(U)이 그 칸 · 변에 있나(존이 친다 — 열쇠만)
function uAtCell(x, y) { return S.cell.U.has(K(x, y)); }
function uAtEdge(fx, fy, tx, ty) { const e = _ek(fx, fy, tx, ty); return e >= 0 && S.edge.U.has(e); }
//   주인 없는 구조물(U)이 그 칸 상자에 있나 — 없으면 걸음 2(U 는 없는 것)가 걸음 1 과 같은 답이다(판정이 같은 탐색을 두 번 안 한다)
function uIn(x0, y0, x1, y1) {
  if (!S.cell.U.size && !S.edge.U.size) return false;
  for (const k of S.cell.U.keys()) { const x = KX(k), y = KY(k); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; }
  for (const e of S.edge.U.keys()) { const c = Math.floor(e / 2), x = KX(c), y = KY(c); if (x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1) return true; }
  return false;
}
//   두 px 끝 · 길이 문턱(px)의 타원이 든 칸 상자
function _ellBox(ax, ay, bx, by, bound) { const d = Math.hypot(bx - ax, by - ay), r = Math.max(0, (bound - d) / 2) + 4 * 4 * SZ; return [Math.floor((Math.min(ax, bx) - r) / SZ), Math.floor((Math.min(ay, by) - r) / SZ), Math.ceil((Math.max(ax, bx) + r) / SZ), Math.ceil((Math.max(ay, by) + r) / SZ)]; }
function hasAny() { if (S.claimsDirty) _claimsBuild(); return S.byId.size > 0 || S.claimCells.size > 0; }
//   조각 만들기 — 칸 · 변 · 렉트
function pieceCell(cx, cy, phys) { return { cells: [K(cx, cy)], edges: [], phys: !!phys }; }
function pieceEdge(cx, cy, side) { return { cells: [], edges: [EK(cx, cy, side === 'E' ? 'E' : 'N')] }; }
function pieceRect(x0, y0, x1, y1) { const cells = []; for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(K(x, y)); return { cells, edges: [] }; }
function pieceCells(list) { return { cells: list.map(([x, y]) => K(x, y)), edges: [] }; }
function pieceBox(p) {   // 조각이 닿는 칸 상자(변은 양쪽 칸)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (x, y) => { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; };
  for (const c of p.cells) add(KX(c), KY(c));
  for (const e of p.edges) { const c = Math.floor(e / 2), x = KX(c), y = KY(c); add(x, y); if (e & 1) add(x + 1, y); else add(x, y - 1); }
  return [x0, y0, x1, y1];
}
function edgeCells(e) { const c = Math.floor(e / 2), x = KX(c), y = KY(c); return (e & 1) ? [K(x, y), K(x + 1, y)] : [K(x, y - 1), K(x, y)]; }
//   표시 — 길을 닫는 조각(길이 지나는 칸에 세운 막는 것 · 길 계산에서 없는 것 · 표에서 뺀다 · 다시 넣지 않는다)
function mark(id) { S.marked.add(id); sDel(id); st.marks++; S.ver++; }
function unmark(id) { S.marked.delete(id); }
function isMarked(id) { return S.marked.has(id); }

// ── ② 길 표(역색인) ────────────────────────────────────────────────────
const B8 = (x, y) => K(x >> 3, y >> 3);
const R = { pid: new Map(), keys: [], blocks: new Map(), pairBlocks: [], ver: 0, cellsOf: null, routeOf: null };
function _pid(key) { let i = R.pid.get(key); if (i === undefined) { i = R.keys.length; R.keys.push(key); R.pid.set(key, i); } return i; }
//   ctx = { cellsOf(a, b, fn) — 길 줄이 지나는 칸(villages `_t1327Cells`) · routeOf(key) → pts | null | undefined }
function bindRoutes(ctx) { R.cellsOf = ctx.cellsOf; R.routeOf = ctx.routeOf; }
function _segCells(a, b, fn) { R.cellsOf(a, b, (cx, cy) => { fn(cx, cy); return false; }); }
function rIndex(key, pts) {
  rUnindex(key);
  if (!pts || pts.length < 2 || !R.cellsOf) return;
  const i = _pid(key), S8 = new Set();
  for (let s = 1; s < pts.length; s++) _segCells(pts[s - 1], pts[s], (cx, cy) => { S8.add(B8(cx, cy)); });
  const arr = [...S8];
  for (const b of arr) { const L = R.blocks.get(b); if (L) L.push(i); else R.blocks.set(b, [i]); }
  R.pairBlocks[i] = arr; R.ver++; st.rIdx++;
}
function rUnindex(key) {
  const i = R.pid.get(key); if (i === undefined) return;
  const arr = R.pairBlocks[i]; if (!arr) return;
  for (const b of arr) { const L = R.blocks.get(b); if (!L) continue; const j = L.indexOf(i); if (j >= 0) { L[j] = L[L.length - 1]; L.pop(); } if (!L.length) R.blocks.delete(b); }
  R.pairBlocks[i] = null; R.ver++; st.rDel++;
}
function rClear() { R.blocks.clear(); R.pairBlocks = []; R.ver++; }
//   마디마다 지나는 칸(조각 상자 ±1 안 마디만) — [[마디 번호, 칸 집합]…]
function _segsNear(pts, box) {
  const [x0, y0, x1, y1] = box, out = [];
  for (let s = 1; s < pts.length; s++) {
    const a = pts[s - 1], b = pts[s];
    const ax = Math.floor(a.x / SZ), ay = Math.floor(a.y / SZ), bx = Math.floor(b.x / SZ), by = Math.floor(b.y / SZ);
    if (Math.max(ax, bx) < x0 - 1 || Math.min(ax, bx) > x1 + 1 || Math.max(ay, by) < y0 - 1 || Math.min(ay, by) > y1 + 1) continue;
    const C = new Set(); _segCells(a, b, (cx, cy) => { C.add(K(cx, cy)); });
    out.push([s, C]);
  }
  return out;
}
//   그 마디가 조각에 닿나 — 칸이 겹치거나 · 변의 양쪽 칸을 다 지난다(곧은 줄이 변을 건넌다)
function _segTouch(C, piece) {
  for (const c of piece.cells) if (C.has(c)) return true;
  for (const e of piece.edges) { const [u, v] = edgeCells(e); if (C.has(u) && C.has(v)) return true; }
  return false;
}
//   조각에 닿는 쌍 + 쌍마다 닿는 마디 [처음 마디, 끝 마디]
function rTouching(piece) {
  const box = pieceBox(piece), cand = new Set();
  for (let y = (box[1] - 1) >> 3; y <= (box[3] + 1) >> 3; y++) for (let x = (box[0] - 1) >> 3; x <= (box[2] + 1) >> 3; x++) { const L = R.blocks.get(K(x, y)); if (L) for (const i of L) cand.add(i); }
  const out = [];
  for (const i of cand) {
    const key = R.keys[i], pts = R.routeOf ? R.routeOf(key) : null; if (!pts) continue;
    let s0 = -1, s1 = -1;
    for (const [s, C] of _segsNear(pts, box)) if (_segTouch(C, piece)) { if (s0 < 0) s0 = s; s1 = s; }
    if (s0 >= 0) out.push({ key, pts, i0: s0 - 1, i1: s1 });
  }
  return out;
}
//   칸 열쇠들 둘레(±1 칸)의 8×8 덩이에 든 쌍 열쇠 — 부분 무효화의 후보(`_t1440Flush`)
function rNear(cells) {
  const B = new Set(), out = new Set();
  for (const c of cells) { const x = KX(c), y = KY(c); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) B.add(B8(x + dx, y + dy)); }
  for (const b of B) { const L = R.blocks.get(b); if (L) for (const i of L) out.add(R.keys[i]); }
  return out;
}
function rStats() { let refs = 0; for (const L of R.blocks.values()) refs += L.length; return { pairs: R.pairBlocks.filter(Boolean).length, blocks: R.blocks.size, refs }; }

// ── ③ 처음 길 ──────────────────────────────────────────────────────
const F = new Map();   // key → { len, pts }
let _firstPersist = null;
function firstUse(rows, persist) { for (const [k, len, pts] of rows || []) F.set(k, { len, pts }); _firstPersist = persist || null; }
function firstGet(key) { return F.get(key) || null; }
function firstSet(key, pts) {   // 없을 때만(처음 길은 바뀌지 않는다)
  if (F.has(key) || !pts || pts.length < 2) return false;
  const o = { len: plen(pts), pts }; F.set(key, o); st.firstSet++;
  if (_firstPersist) { try { _firstPersist(key, o.len, pts); } catch (e) {} }
  return true;
}
function firstCount() { return F.size; }

//   칸 A*(8방 · 곧은 1 · 대각 √2 · 대각은 두 L 길 가운데 하나가 열려야) — 상자 안 · 막힘 = 지형 ∨ 표 ∨ 조각
function _fine(ax, ay, bx, by, blk, step8, pad) {
  const x0 = Math.min(ax, bx) - pad, y0 = Math.min(ay, by) - pad, x1 = Math.max(ax, bx) + pad, y1 = Math.max(ay, by) + pad;
  const W = x1 - x0 + 1, H = y1 - y0 + 1, N = W * H; if (N > REPAIR_MAX_NODES * 4) return null;
  if (blk(ax, ay) || blk(bx, by)) return null;
  const g = new Float64Array(N).fill(Infinity), came = new Int32Array(N).fill(-1), cl = new Uint8Array(N);
  const id = (x, y) => (y - y0) * W + (x - x0);
  const hh = (x, y) => { const dx = Math.abs(x - bx), dy = Math.abs(y - by); return Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy); };
  const HF = [], HI = [];
  const push = (f, i) => { HF.push(f); HI.push(i); let j = HF.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (HF[p] <= HF[j]) break; [HF[p], HF[j]] = [HF[j], HF[p]]; [HI[p], HI[j]] = [HI[j], HI[p]]; j = p; } };
  const pop = () => { const i = HI[0], lf = HF.pop(), li = HI.pop(); if (HF.length) { HF[0] = lf; HI[0] = li; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let s = j; if (l < HF.length && HF[l] < HF[s]) s = l; if (r < HF.length && HF[r] < HF[s]) s = r; if (s === j) break; [HF[s], HF[j]] = [HF[j], HF[s]]; [HI[s], HI[j]] = [HI[j], HI[s]]; j = s; } } return i; };
  const s0 = id(ax, ay), gi = id(bx, by); g[s0] = 0; push(hh(ax, ay), s0); let pops = 0;
  while (HF.length) {
    const i = pop(); if (cl[i]) continue; cl[i] = 1;
    if (i === gi) break;
    if (++pops > REPAIR_MAX_NODES) return null;
    const x = x0 + (i % W), y = y0 + ((i / W) | 0);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      if (blk(nx, ny)) continue;
      if (dx && dy && (blk(x + dx, y) || blk(x, y + dy))) continue;   // 지형 모서리 깎기 0(걸음과 같은 규칙)
      if (step8(x, y, nx, ny)) continue;
      const j = id(nx, ny); if (cl[j]) continue;
      const ng = g[i] + (dx && dy ? Math.SQRT2 : 1);
      if (ng < g[j]) { g[j] = ng; came[j] = i; push(ng + hh(nx, ny), j); }
    }
  }
  if (!cl[gi]) return null;
  const out = []; for (let c = gi; c !== -1; c = came[c]) out.push([x0 + (c % W), y0 + ((c / W) | 0)]);
  return out.reverse();
}
//   두 px 점 곧은 줄이 열렸나(지나는 칸 전부 · 칸 사이 변) — 줄 당기기
function clearLine(cellsOf, a, b, blk, step4) {
  //   지나는 칸이 막혔거나 · 바로 앞 칸(또는 그 앞 칸 — 꼭짓점을 정확히 지나는 줄은 옆 두 칸을 다 들른다)에서 4방으로 넘는 변이 막혔으면 닫힘
  //   `cellsOf` = 마을 시뮬의 길 줄 칸 걷기(`_t1327Cells`) — 길 줄 검사와 같은 칸
  let ok = true, p1x = null, p1y = null, p2x = null, p2y = null;
  const adj = (ax, ay, bx, by) => ax !== null && Math.abs(ax - bx) + Math.abs(ay - by) === 1;
  cellsOf(a, b, (cx, cy) => {
    if (blk(cx, cy)) { ok = false; return true; }
    if (adj(p1x, p1y, cx, cy) && step4(p1x, p1y, cx, cy)) { ok = false; return true; }
    if (adj(p2x, p2y, cx, cy) && step4(p2x, p2y, cx, cy)) { ok = false; return true; }
    p2x = p1x; p2y = p1y; p1x = cx; p1y = cy; return false;
  });
  return ok;
}
function _clear(a, b, blk, step4) { return clearLine(R.cellsOf, a, b, blk, step4); }
function _pull(cells, a, b, blk, step4) {   // 칸 열 → px 꺾은 줄(시작 a · 끝 b 는 그 px 그대로) · 곧은 줄이 열린 동안 건너뛴다
  const P = cells.map(([x, y]) => ({ x: x * SZ + SZ / 2, y: y * SZ + SZ / 2 }));
  P[0] = { x: a.x, y: a.y }; P[P.length - 1] = { x: b.x, y: b.y };
  const out = [P[0]];
  for (let i = 0; i < P.length - 1;) {
    let j = P.length - 1;
    while (j > i + 1 && !_clear(P[i], P[j], blk, step4)) j--;
    out.push(P[j]); i = j;
  }
  return out;
}
//   꺾은 줄 한 토막(인덱스 lo..hi)을 다시 당긴다 — 고쳐 이은 마디 앞뒤 꼭짓점까지(이어 붙인 자리의 V 꼴을 편다 · 곧은 줄이 열린 동안 건너뛴다 · 짧아지기만 한다)
function _pullWin(P, lo, hi, blk, step4) {
  lo = Math.max(0, lo); hi = Math.min(P.length - 1, hi);
  if (hi - lo < 2) return P;
  const out = [P[lo]];
  for (let i = lo; i < hi;) { let j = hi; while (j > i + 1 && !_clear(P[i], P[j], blk, step4)) j--; out.push(P[j]); i = j; }
  return P.slice(0, lo).concat(out, P.slice(hi + 1));
}
//   막힌 이음 고치기 — 꺾은 줄의 마디가 막혔으면(칸 · 변) 그 두 끝 사이 칸 A*(상자를 넓혀 가며) + 줄 당기기로 갈아 끼운다 · 못 고치면 그 마디 그대로(셈)
//   (교역로 A* 의 몸 칸 잇기 `_t1327Finish` 가 못 이은 이음 — 코스 격자 마디가 긴 담 건너편에 붙은 끝 · 켬에서만 부른다)
function fixRoute(pts, blk, step4) {
  if (!pts || pts.length < 2) return pts;
  const e8 = (fx, fy, tx, ty) => { const sx = tx - fx, sy = ty - fy; if (sx && sy) { const a = !step4(fx, fy, fx + sx, fy) && !step4(fx + sx, fy, tx, ty); const b = !step4(fx, fy, fx, fy + sy) && !step4(fx, fy + sy, tx, ty); return !(a || b); } return step4(fx, fy, tx, ty); };
  let out = null;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (clearLine(R.cellsOf, a, b, blk, step4)) { if (out) out.push(b); continue; }
    if (!out) out = pts.slice(0, i);
    let cells = null; for (const pad of FIX_PAD) { cells = _fine(Math.floor(a.x / SZ), Math.floor(a.y / SZ), Math.floor(b.x / SZ), Math.floor(b.y / SZ), blk, e8, pad); if (cells) break; }
    if (!cells) { st.fixFail = (st.fixFail | 0) + 1; out.push(b); continue; }
    const mid = _pull(cells, a, b, blk, step4); for (let k = 1; k < mid.length; k++) out.push(mid[k]);
    st.fix = (st.fix | 0) + 1;
  }
  return out || pts;
}
//   길 전체(또는 상자 [x0,y0,x1,y1] 둘레 마디만)가 막혔나 — 걸음 2 의 막힘(마을 것 · 사유지 칸 · 지나는 칸은 열림 · 주인 없는 구조물은 안 본다 — 캐러밴이 친다)
//   M = 그 걸음(판정이 구한 길은 그 걸음의 막힘으로 본다 — 걸음 3 · 4 는 내준 사유지가 열림) · 지형은 안 본다(지형은 길을 판 A* 가 이미 본다 · 끔 판의 곧은 줄 폴백과 같은 뜻)
function clearRoute(pts, box, M) {
  if (!pts || pts.length < 2) return true;
  const cb = M ? (x, y) => cellBlkM(x, y, M) : cellBlk, eb = M ? (fx, fy, tx, ty) => edgeStepM(fx, fy, tx, ty, M) : edgeStep;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (box) { const ax = a.x / SZ, ay = a.y / SZ, bx = b.x / SZ, by = b.y / SZ; if (Math.max(ax, bx) < box[0] - 2 || Math.min(ax, bx) > box[2] + 2 || Math.max(ay, by) < box[1] - 2 || Math.min(ay, by) > box[3] + 2) continue; }
    if (!clearLine(R.cellsOf, a, b, cb, eb)) return false;
  }
  return true;
}
//   길이 지나는 사유지 칸들(그 길이 지나는 칸 가운데 사유지인 것 — 걸음 3 · 4 가 내준 칸 · 사유지가 내준 칸)
function claimsOn(pts) {
  if (S.claimsDirty) _claimsBuild();
  const out = new Map();
  if (!pts || !S.claimCells.size) return out;
  for (let i = 1; i < pts.length; i++) R.cellsOf(pts[i - 1], pts[i], (x, y) => { const o = S.claimCells.get(K(x, y)); if (o) { let s = out.get(o.id); if (!s) out.set(o.id, s = new Set()); s.add(K(x, y)); } return false; });
  return out;
}
//   구조물 표 지문(급마다 칸 · 변 · 사유지 칸 열쇠 · 지나는 칸을 정렬해 sha1 앞 12) — 교역로 디스크 캐시 열쇠(같은 세계 · 같은 구조물 = 같은 길)
function sig() {
  if (S.claimsDirty) _claimsBuild();
  const a = [];
  for (const c of CLS) { for (const k of S.cell[c].keys()) a.push(c + 'c' + k); for (const k of S.edge[c].keys()) a.push(c + 'e' + k); }
  for (const [k, o] of S.claimCells) a.push('p' + o.lvl + (o.pass ? 'x' : '') + k);
  return require('crypto').createHash('sha1').update(a.sort().join(',')).digest('hex').slice(0, 12);
}
// ── ④ 판정 ───────────────────────────────────────────────────────
//   ctx(마을 시뮬이 준다) = { terrBlk(x,y) — 지형(물 · 바위 · 다리 칸 열림) · routeTemp(piece, x0,y0,x1,y1, M) → pts|null — 그 조각을 잠깐 넣고 그 걸음(모드)으로 교역로 A* ·
//     ends(key) → [x0,y0,x1,y1] 쌍 두 끝(px) }
let J = null;
function bindJudge(ctx) { J = ctx; }
//   meta = { cls: 2(마을 밖 사유지) | 3(마을 땅 위 사유지) | 4(마을 건물), max: 갈 걸음(2 · 3 · 5 — NPC 마을 = 2), early: 처음 내줌에서 끝(NPC 터 고르기 · 사유지 한 칸 — 한 쌍이라도 못 비키면 그 칸은 길이 지나는 칸이라 다른 쌍도 그대로 지난다) }
function judgeBegin(piece, meta) {
  if (S.claimsDirty) _claimsBuild();   // 판 번호를 잡기 앞에 사유지 표를 세운다(안 그러면 판정 첫 물음이 표를 세우며 판을 올려 막 시작한 판정이 낡는다)
  const m = Object.assign({ cls: 4, max: 5, early: false }, meta || {});
  return { piece, meta: m, phase: 'pairs', touch: null, groups: null, q: null, res: new Map(), stepOf: new Map(), passBy: new Map(), fail: [], ratios: [], verdict: null, cpu: 0, n: { rep: 0, seg: 0, full: 0, s3: 0, s4: 0, s5: 0, hit: 0 }, tm: { rep: 0, seg: 0, full: 0, s3: 0, s4: 0, s5: 0 }, cache: new Map(), Ms: new Map(), sVer: S.ver, t0: Date.now() };
}
//   긴 마디에 창 — 첫 닿는 마디에서 조각 투영점 WIN 앞 · 끝 닿는 마디에서 WIN 뒤에 꼭짓점을 넣는다(같은 줄 위 — 길은 그대로 · 사본)
function _window(m, pc) {
  const P = m.pts, i0 = m.i0, i1 = m.i1;
  const cut = (a, b, back) => { const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 2 * WIN) return null; let t = ((pc.x - a.x) * dx + (pc.y - a.y) * dy) / (L * L); t = Math.max(0, Math.min(1, t)); const tt = back ? t - WIN / L : t + WIN / L; if (tt <= 0.02 || tt >= 0.98) return null; return { x: Math.round(a.x + dx * tt), y: Math.round(a.y + dy * tt) }; };
  const c0 = cut(P[i0], P[i0 + 1], true), c1 = cut(P[i1 - 1], P[i1], false);
  if (!c0 && !c1) return;
  const Q = P.slice(); let j0 = i0, j1 = i1;
  if (c1) Q.splice(j1, 0, c1);
  if (c0) { Q.splice(j0 + 1, 0, c0); j0 += 1; j1 += 1; }
  m.pts = Q; m.i0 = j0; m.i1 = j1;
}
function _spliced(m, mid) { return m.pts.slice(0, m.i0 + 1).concat(mid.slice(1, mid.length - 1), m.pts.slice(m.i1)); }
function _spanLen(m) { let L = 0; for (let i = m.i0 + 1; i <= m.i1; i++) L += Math.hypot(m.pts[i].x - m.pts[i - 1].x, m.pts[i].y - m.pts[i - 1].y); return L; }
function _base(key, pts) { const f = F.get(key); return f ? f.len : plen(pts); }
const _idNum = (id) => { const m = /(\d+)$/.exec(String(id)); return m ? +m[1] : 0; };
//   걸음 3 · 4 의 사유지 후보 — 그 쌍의 지금 길 상자 둘레(CLAIM_NEAR 칸) 사유지(그 급 · 지나는 칸 아닌 것) · 나중 선포부터
function _claimCand(m, lvl) {
  if (S.claimsDirty) _claimsBuild();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of m.pts) { const x = p.x / SZ, y = p.y / SZ; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  x0 -= CLAIM_NEAR; y0 -= CLAIM_NEAR; x1 += CLAIM_NEAR; y1 += CLAIM_NEAR;
  const L = [];
  for (const o of S.claimIds.values()) { if (o.lvl !== lvl || o.pass) continue; const k = o.cells[0]; const x = KX(k), y = KY(k); if (x >= x0 && x <= x1 && y >= y0 && y <= y1) L.push(o); }
  L.sort((a, b) => b.t - a.t || _idNum(b.id) - _idNum(a.id) || String(b.id).localeCompare(String(a.id)));   // 같은 시각이면 나중에 선 행(존 사유지 id 의 수)
  return L;
}
function judgeStep(job, budgetMs) {
  const c0 = cpu();
  const over = () => budgetMs > 0 && cpu() - c0 >= budgetMs;   // 몫 = CPU 시간(가상 시계 판에서도 닳는다)
  const piece = job.piece, meta = job.meta;
  const Pc = new Set(piece.cells), Pe = new Set(piece.edges);
  const blkOf = (M) => (x, y) => J.terrBlk(x, y) || cellBlkM(x, y, M) || Pc.has(K(x, y));
  const e4Of = (M) => (fx, fy, tx, ty) => edgeStepM(fx, fy, tx, ty, M) || (Pe.size > 0 && Pe.has(_ek(fx, fy, tx, ty)));
  const e8Of = (e4) => (fx, fy, tx, ty) => { const sx = tx - fx, sy = ty - fy; if (sx && sy) { const a = !e4(fx, fy, fx + sx, fy) && !e4(fx + sx, fy, tx, ty); const b = !e4(fx, fy, fx, fy + sy) && !e4(fx, fy + sy, tx, ty); return !(a || b); } return e4(fx, fy, tx, ty); };
  const MS = { 1: M1, 2: M2 };
  const ok = (m, s, pts, M) => {   // 그 쌍이 이 걸음에서 통과
    job.res.set(m.key, pts); job.stepOf.set(m.key, s); st.step[s]++;
    if (pts) job.ratios.push(plen(pts) / _base(m.key, m.pts));
    if (s >= 3 && pts) { const on = claimsOn(pts); const pb = new Map(); for (const [id, cs] of on) { const o = S.claimIds.get(id); if (o && !o.pass && ((o.lvl === 2 && M.P2) || (o.lvl === 3 && M.P3))) pb.set(id, [...cs]); } if (pb.size) job.passBy.set(m.key, pb); }
  };
  const next = (m, s) => {   // 이 걸음에서 못 했다 — 다음 걸음(급이 허락하는 데까지)
    const n = s + 1;
    if (n > meta.max) { job.fail.push(m); st.stepFail++; if (meta.early) { job.res.clear(); job.stepOf.clear(); job.passBy.clear(); job.verdict = 'yield'; job.phase = 'done'; } return; }   // early = 처음 내줌에서 끝(그 조각은 내준다 — 앞서 비킨 쌍도 길을 안 바꾼다)
    if (n === 2) job.q.unshift({ k: 'rep', g: { a: m.pts[m.i0], b: m.pts[m.i1], members: [m], pend: [] }, s: 2 });   // 걸음 2 도 줄기 고쳐 잇기부터(같은 두 끝 = 같은 답 — 판정 안 메모)
    else job.q.unshift({ k: 's' + n, m, s: n });
  };
  try {
    if (job.phase === 'pairs') {
      job.touch = rTouching(piece);
      if (!job.touch.length) { job.verdict = 'free'; job.phase = 'done'; return true; }
      const G = new Map();
      const onP = (q) => Pc.has(K(Math.floor(q.x / SZ), Math.floor(q.y / SZ)));
      const bx0 = pieceBox(piece), pc = { x: (bx0[0] + bx0[2] + 1) / 2 * SZ, y: (bx0[1] + bx0[3] + 1) / 2 * SZ };
      for (const m of job.touch) {
        m.ref = m.pts;                                                     // 저장된 길 물건(낡음 판정 · 창을 낸 사본과 따로)
        while (m.i0 > 0 && onP(m.pts[m.i0])) m.i0--;                       // 조각이 꼭짓점 칸을 덮으면 마디를 한 칸씩 넓힌다(잇는 두 끝은 열린 칸)
        while (m.i1 < m.pts.length - 1 && onP(m.pts[m.i1])) m.i1++;
        _window(m, pc);
        const a = m.pts[m.i0], b = m.pts[m.i1], gk = `${a.x},${a.y},${b.x},${b.y}`;
        const g = G.get(gk); if (g) g.members.push(m); else G.set(gk, { a, b, members: [m], pend: [] });
      }
      job.groups = [...G.values()]; job.q = job.groups.map((g) => ({ k: 'rep', g, s: 1 })); job.phase = 'run';
    }
    //   일 줄(깊이 먼저) — 걸음 1: 줄기 고쳐 잇기 → 마디 다시 구하기 → 쌍 전체 · 못 하면 그 쌍은 걸음 2(쌍 전체) → 3 → 4 → 5 를 그 자리에서 내려간다
    let did = 0;
    while (job.phase === 'run') {
      if (!job.q.length) { job.verdict = job.fail.length ? 'yield' : 'protected'; job.phase = 'done'; break; }
      if (did++ && over()) return false;
      const t = job.q.shift(), tc0 = cpu();
      try {
      if (t.k === 'rep') {
        const g = t.g, M = MS[t.s], blk = blkOf(M), e4 = e4Of(M);
        job.n.rep++; st.rep++;
        const ax = Math.floor(g.a.x / SZ), ay = Math.floor(g.a.y / SZ), bx = Math.floor(g.b.x / SZ), by = Math.floor(g.b.y / SZ);
        const ck = 'r' + t.s + '|' + ax + ',' + ay + ',' + bx + ',' + by, ck1 = 'r1|' + ax + ',' + ay + ',' + bx + ',' + by, P0 = REPAIR_PAD[REPAIR_PAD.length - 1];
        let cells = job.cache.get(ck);
        if (cells === undefined && t.s === 2 && job.cache.has(ck1) && !uIn(Math.min(ax, bx) - P0, Math.min(ay, by) - P0, Math.max(ax, bx) + P0, Math.max(ay, by) + P0)) { cells = job.cache.get(ck1); job.n.same = (job.n.same | 0) + 1; }   // 상자에 U 없음 = 걸음 1 과 같은 답
        if (cells === undefined) { cells = null; for (const pad of REPAIR_PAD) { cells = _fine(ax, ay, bx, by, blk, e8Of(e4), pad); if (cells) break; } job.cache.set(ck, cells); } else job.n.hit++;
        if (!cells) { st.repFail++; g.pend = g.members.slice(); job.q.unshift({ k: 'seg', g, s: t.s }); continue; }
        const mid = _pull(cells, g.a, g.b, blk, e4), dl = plen(mid);
        g.pend = [];
        for (const m of g.members) {
          const nl = plen(m.pts) - _spanLen(m) + dl;
          if (nl <= MULT * _base(m.key, m.pts)) ok(m, t.s, _pullWin(_spliced(m, mid), m.i0 - 3, m.i0 + mid.length - 1 + 3, blk, e4), M);
          else g.pend.push(m);
        }
        if (g.pend.length) job.q.unshift({ k: 'seg', g, s: t.s });
      } else if (t.k === 'seg') {
        const g = t.g, M = MS[t.s], blk = blkOf(M), e4 = e4Of(M);
        job.n.seg++; st.seg++;
        let sb = 0; for (const m of g.pend) sb = Math.max(sb, MULT * _base(m.key, m.pts) - (plen(m.pts) - _spanLen(m)));   // 그 마디가 쓸 수 있는 길이(쌍마다 3배 − 마디 밖 길이 · 가장 너그러운 것)
        const ck = 'g' + t.s + '|' + g.a.x + ',' + g.a.y + ',' + g.b.x + ',' + g.b.y, c = job.cache.get(ck);   // 같은 두 끝 · 같은 걸음 = 같은 답(못 찾았으면 그 길이 문턱 안에서는 없다)
        const c1 = t.s === 2 ? job.cache.get('g1|' + g.a.x + ',' + g.a.y + ',' + g.b.x + ',' + g.b.y) : null;
        let mid;
        if (c && (c.mid || c.sb >= sb)) { mid = c.mid; job.n.hit++; }
        else if (c1 && !c1.mid && c1.sb >= sb && !uIn(..._ellBox(g.a.x, g.a.y, g.b.x, g.b.y, sb))) { mid = null; job.n.same = (job.n.same | 0) + 1; }   // 걸음 1 이 못 찾았고 그 타원에 U 없음 = 같은 답
        else { mid = sb > 0 ? J.routeTemp(piece, g.a.x, g.a.y, g.b.x, g.b.y, M, sb) : null; job.cache.set(ck, { mid, sb }); }
        let keep = g.pend;
        if (!mid || mid.length < 2) st.segFail++;
        else {
          const dl = plen(mid); keep = [];
          for (const m of g.pend) {
            const nl = plen(m.pts) - _spanLen(m) + dl;
            if (nl <= MULT * _base(m.key, m.pts)) { const mm = [g.a].concat(mid.slice(1, mid.length - 1), [g.b]); ok(m, t.s, _pullWin(_spliced(m, mm), m.i0 - 3, m.i0 + mm.length - 1 + 3, blk, e4), M); }
            else keep.push(m);
          }
        }
        for (let i = keep.length - 1; i >= 0; i--) if (!job.res.has(keep[i].key)) job.q.unshift({ k: 'full', m: keep[i], s: t.s });
      } else if (t.k === 'full') {   // 걸음 1 · 2 — 쌍 전체 다시 구하기(3배 안)
        const m = t.m; if (job.res.has(m.key)) continue;
        const M = MS[t.s], blk = blkOf(M), e4 = e4Of(M);
        job.n.full++; st.full++;
        const base = _base(m.key, m.pts);
        const e = J.ends(m.key);
        if (t.s === 2 && m._f1 === null && e && !uIn(..._ellBox(e[0], e[1], e[2], e[3], MULT * base))) { job.n.same = (job.n.same | 0) + 1; if (m._f1raw) m._p2 = m._f1raw; st.fullFail++; next(m, t.s); continue; }   // 걸음 1 쌍 전체가 못 찾았고 그 타원에 U 없음 = 같은 답(걸음 5 는 그 길을 다시 쓴다)
        let p2 = e ? J.routeTemp(piece, e[0], e[1], e[2], e[3], M, MULT * base) : null;
        if (t.s === 1) { m._f1 = p2 && plen(p2) <= MULT * base ? p2 : null; m._f1raw = p2 || null; }
        if (p2 && plen(p2) > MULT * base) { const pp = _pullWin(p2, 0, p2.length - 1, blk, e4); if (plen(pp) < plen(p2)) p2 = pp; }   // 문턱 위면 코스 격자 길을 당겨 본다(고쳐 잇기와 같은 자로)
        if (t.s === 2 && p2) m._p2 = p2;   // 걸음 5 가 다시 쓴다(같은 막힘 · 그 길이 3배 상자 안에서 찾은 가장 짧은 길 — 없으면 걸음 5 가 상자 없이 다시 판다)
        if (p2 && plen(p2) <= MULT * base) ok(m, t.s, p2, M);
        else { st.fullFail++; next(m, t.s); }
      } else if (t.k === 's3' || t.k === 's4') {   // 걸음 3 · 4 — 그 급 사유지를 나중 선포부터 내주게 한다(문턱을 좁혀 가장 적게)
        const m = t.m; if (job.res.has(m.key)) continue;
        const lvl = t.k === 's3' ? 2 : 3; job.n[t.k]++;
        const cand = _claimCand(m, lvl), base = _base(m.key, m.pts), e = J.ends(m.key);
        const a = m.pts[m.i0], b = m.pts[m.i1], ax = Math.floor(a.x / SZ), ay = Math.floor(a.y / SZ), bx = Math.floor(b.x / SZ), by = Math.floor(b.y / SZ);
        let done = false;
        for (const n of NEWEST) {
          if (!cand.length || !e) break;
          const k = Math.min(n, cand.length), ids = cand.slice(0, k).map((o) => o.id), mk = lvl + '|' + ids.slice().sort().join(',');
          let M = job.Ms.get(mk);
          if (!M) { const allow = new Set(ids); M = lvl === 2 ? { U: false, P2: allow, P3: null } : { U: false, P2: 'all', P3: allow }; job.Ms.set(mk, M); }   // 같은 허락 = 같은 물건(쌍끼리 판정 격자를 다시 안 비운다)
          //   줄기 고쳐 잇기 먼저(그 걸음의 막힘 — 코스 격자가 못 보는 한 칸 틈도 · 같은 두 끝 · 같은 문턱 = 판정 안 메모)
          const blk = blkOf(M), e4 = e4Of(M), ck = t.k + '|' + k + '|' + ax + ',' + ay + ',' + bx + ',' + by;
          let cells = job.cache.get(ck);
          if (cells === undefined) { cells = null; for (const pad of REPAIR_PAD) { cells = _fine(ax, ay, bx, by, blk, e8Of(e4), pad); if (cells) break; } job.cache.set(ck, cells); } else job.n.hit++;
          if (cells) { const mid = _pull(cells, a, b, blk, e4); if (plen(m.pts) - _spanLen(m) + plen(mid) <= MULT * base) { ok(m, t.s, _pullWin(_spliced(m, mid), m.i0 - 3, m.i0 + mid.length - 1 + 3, blk, e4), M); done = true; break; } }
          const p3 = J.routeTemp(piece, e[0], e[1], e[2], e[3], M, MULT * base);
          if (p3 && plen(p3) <= MULT * base) { ok(m, t.s, p3, M); done = true; break; }
          if (n >= cand.length) break;
        }
        if (!done) next(m, t.s);
      } else if (t.k === 's5') {   // 걸음 5 — 포기하고 다시 찾는다: 3배 없이 가장 짧은 길(걸음 2 의 막힘 — 사유지 · 마을 것은 비킨다) · 없으면 그 쌍은 교역 0
        const m = t.m; if (job.res.has(m.key)) continue;
        job.n.s5++;
        let p5 = m._p2;
        if (p5 === undefined) { const e = J.ends(m.key); p5 = e ? J.routeTemp(piece, e[0], e[1], e[2], e[3], M2) : null; }
        if (!p5) {   // 코스 격자가 못 보는 한 칸 틈 — 줄기 고쳐 잇기(걸음 2 막힘 · 상자 안)
          const a = m.pts[m.i0], b = m.pts[m.i1], blk = blkOf(M2), e4 = e4Of(M2);
          let cells = null; for (const pad of REPAIR_PAD) { cells = _fine(Math.floor(a.x / SZ), Math.floor(a.y / SZ), Math.floor(b.x / SZ), Math.floor(b.y / SZ), blk, e8Of(e4), pad); if (cells) break; }
          if (cells) { const mid = _pull(cells, a, b, blk, e4); p5 = _pullWin(_spliced(m, mid), m.i0 - 3, m.i0 + mid.length - 1 + 3, blk, e4); }
        }
        ok(m, 5, p5 || null, M2);
      }
      } finally { job.tm[t.k] = (job.tm[t.k] || 0) + (cpu() - tc0); }   // 일 갈래마다 CPU(계측)
    }
    return job.phase === 'done';
  } finally {
    job.cpu += cpu() - c0;
    if (job.phase === 'done' && !job._counted) {
      job._counted = true; st.judge++; st[job.verdict] = (st[job.verdict] | 0) + 1;
      if (st.cpu.length < 20000) st.cpu.push(+job.cpu.toFixed(3));
      if (job.touch && st.pairs.length < 20000) st.pairs.push(job.touch.length);
    }
  }
}
//   한 번에(예산 0) — 마을 시뮬의 터 고르기 · 하네스
function judgeNow(piece, meta) { const j = judgeBegin(piece, meta); judgeStep(j, 0); return j; }
//   낡았나 — 구조물 표가 바뀌었거나(판 번호) · 닿은 쌍의 길이 갈렸다(다른 쌍의 길이 새로 서는 것은 이 판정과 무관)
function stale(job) {
  if (job.sVer !== S.ver) return true;
  if (job.touch && R.routeOf) for (const m of job.touch) if (R.routeOf(m.key) !== (m.ref || m.pts)) return true;
  return false;
}
function stats() {
  if (S.claimsDirty) _claimsBuild();
  let pass = 0; for (const o of S.claimIds.values()) if (o.pass) pass++;
  return Object.assign({}, st, { cpu: undefined, pairs: undefined, idxN: S.byId.size, U: S.cell.U.size + S.edge.U.size, V: S.cell.V.size + S.edge.V.size, P: S.cell.P.size + S.edge.P.size, claims: S.claimIds.size, passClaims: pass, marked: S.marked.size, first: F.size, r: rStats() });
}
function cpuList() { return { cpu: st.cpu.slice(), pairs: st.pairs.slice() }; }

module.exports = {
  ON, MULT, K, EK, KX, KY, plen, M1, M2,
  init, sAdd, sDel, sGet, claimsUse, claimsDirty, claimAt, cellBlkM, edgeStepM, cellBlk, edgeStep, stepBlk, stepBlk8, stepPhys8, uAtCell, uAtEdge, hasAny,
  pieceCell, pieceEdge, pieceRect, pieceCells, pieceBox, edgeCells, mark, unmark, isMarked,
  bindRoutes, rIndex, rUnindex, rClear, rTouching, rNear, rStats, clearLine, clearRoute, claimsOn, fixRoute, sig,
  firstUse, firstGet, firstSet, firstCount,
  bindJudge, judgeBegin, judgeStep, judgeNow, stale, stats, cpuList,
  _S: S, _R: R, _F: F, _st: st,
};
