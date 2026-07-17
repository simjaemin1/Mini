// === sim/path-core.js — 경로탐색 정본 (랩·서버 공용 단일 소스) ===
// ★[통일 계약 2026-07-17, 사용자 지시 "무조건 통일"] 랩(bfsPath L자·tradePath √2·물22배 다리창발)과
//   서버(pathfind.js 계단·computeRoutePts 140/100·물차단)가 갈라져 있던 것을 이 모듈 하나로 통일.
//   배포 토폴로지 = econ 번들·battle-core와 동일 3사본: 이 파일(정본) → 서버 require → 랩 마커 인라인(sim/inline-path.js).
//
// 규칙(사용자 확정):
//   · 물 = 차단, 다리 칸만 통행 — 다리는 맵에 만들어두는 사물(경로 창발 아님). 물/다리 판정은 전부 호출측 blocked 콜백 소관.
//   · 동률 최단경로 = ★직선 편향: 시작→목표 기하 직선에 수직거리가 가장 작은 경로 선택(L자·계단 아닌 자연 근사).
//     구현 = f에 perpDist(현재셀↔직선 수직거리)×미세가중 가산. 가중은 스텝 양자보다 작게 → 회랑 내 최단성 보존.
//     (원거리 우회 시 근사 허용 — 서버 §16 답압 할인의 '근사로 충분' 계약과 동일 선상.)
//   · 비용 정수화: 직교 100 / 대각 140 (서버 §16 할인 정밀도 승계 — 랩 √2(141.42…)와의 차이는 동률 해소 수준).
//   · 대각 코너 절단 금지(양 옆이 막히면 대각 불가) — 행렬·랩·서버 기존 계약 공통.
//
// API (좌표는 전부 정수 그리드 노드 — px 변환·해상도(coarse)는 어댑터 소관):
//   localPath(sx,sy,gx,gy,opts)  — 4방 균일비용. 마을 내 일상 이동.
//     opts.blockedStep(fx,fy,tx,ty) — 이동(간선) 차단 판정. 셀 차단만 있으면 (f,t)→cellBlocked(tx,ty)로 감싸 전달.
//                                     ★간선 시그니처인 이유: 서버 벽은 셀 경계(edge)에 있음(findEdgeWall).
//     opts.maxNodes(기본 16384) · opts.radius(시작·목표 박스 밖 탐색 금지, 기본 무제한)
//     opts.prefer(x,y) — ★답압 수렴(전쟁실험실 "평행길 교정" 승계): >0이면 등거리 대안 중 그 셀(길)을 우선
//                        확장 → 경로가 기존 길로 스냅. 우선순위 = 길 > 직선 편향 > 임의(전부 스텝 양자 미만 = 최단 보존).
//   routePath(sx,sy,gx,gy,opts) — 8방 100/140. 마을 간 교역로.
//     opts.blocked(x,y) — 노드 차단. opts.costMul(x,y) — 스텝 비용 배율(답압 할인·특수지형 — 기본 1).
//     opts.maxPops(기본 250000) · opts.scratch — 재사용 버퍼 {w,h,g,came,stamp,gen} (서버 gen-스탬프 패턴.
//                                     미제공 시 Map 기반 — 랩 규모엔 충분).
//   반환: [{x,y}, …] 시작 포함 노드열. 실패 null.
//
// 검증: sim/_path-core-test.js (형태=직선 편향·최단성 보존·코너컷 금지·랩/서버 구계약 대비 길이 동일성).
'use strict';

const ORTHO = 100, DIAG = 140;   // 정수 비용(×100 스케일) — 서버 §16 정밀도 승계
const BIAS_LOCAL = 0.005, BIAS_ROUTE = 0.1;   // 직선 편향 가중. ★local은 최단성 엄수: perp≤반경√2(기본 64→~91)×0.005×100=45 < 스텝양자 100
const PREF_DISC = 1;   // localPath opts.prefer(길 스냅) = 길 칸 진입비 -1(99/100). ★h(100/스텝)가 항상 ≥ 실비용 → 허용적 유지.
                       //   등가거리 경로 중 길 경유가 엄격히 저렴 → 확정 스냅. +1스텝 우회하려면 길 100칸 필요 = 마을 스케일에선
                       //   불가능 → 구 전쟁실험실 계약("BFS 동일 거리 대안 중" 길 우선)과 동일하게 순수 동률 해소로만 작동.

function _mkHeap() {   // 이진 최소힙 {f,g,i} — 랩·서버 기존 구현 동형
  const a = [];
  return {
    push(n) { a.push(n); let c = a.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (a[p].f <= a[c].f) break; const t = a[p]; a[p] = a[c]; a[c] = t; c = p; } },
    pop() { const top = a[0], last = a.pop(); if (a.length) { a[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = 2 * c + 2; let m = c; if (l < a.length && a[l].f < a[m].f) m = l; if (r < a.length && a[r].f < a[m].f) m = r; if (m === c) break; const t = a[m]; a[m] = a[c]; a[c] = t; c = m; } } return top; },
    get size() { return a.length; },
  };
}
function _perp(x, y, sx, sy, gx, gy, invLen) {   // 시작→목표 직선까지 수직거리(직선 편향)
  return Math.abs((x - sx) * (gy - sy) - (y - sy) * (gx - sx)) * invLen;
}

// ── localPath: 4방 균일비용 A*(맨해튼×100 + 직선 편향) ──
//   랩 bfsPath(L자)·서버 findPath(계단)를 대체 — 길이는 동일 최단, 모양만 직선 근사로 통일.
function localPath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blockedStep = opts.blockedStep || (() => false);
  const prefer = opts.prefer || null;
  const maxNodes = opts.maxNodes || 16384;
  const radius = opts.radius || 0;
  const minX = radius ? Math.min(sx, gx) - radius : -Infinity, maxX = radius ? Math.max(sx, gx) + radius : Infinity;
  const minY = radius ? Math.min(sy, gy) - radius : -Infinity, maxY = radius ? Math.max(sy, gy) + radius : Infinity;
  const invLen = 1 / Math.max(1, Math.hypot(gx - sx, gy - sy));
  const H = (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * ORTHO + _perp(x, y, sx, sy, gx, gy, invLen) * BIAS_LOCAL * ORTHO;
  const key = (x, y) => x + ',' + y;
  const g = new Map(), came = new Map(), closed = new Set();
  const open = _mkHeap();
  const sk = key(sx, sy);
  g.set(sk, 0); open.push({ f: H(sx, sy), g: 0, k: sk, x: sx, y: sy });
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  let expanded = 0;
  while (open.size > 0 && expanded < maxNodes) {
    const cur = open.pop();
    if (closed.has(cur.k)) continue;
    closed.add(cur.k); expanded++;
    if (cur.x === gx && cur.y === gy) {
      const path = []; let k = cur.k;
      while (k !== undefined) { const c = k.indexOf(','); path.unshift({ x: +k.slice(0, c), y: +k.slice(c + 1) }); k = came.get(k); }
      return path;
    }
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + DIRS[d][0], ny = cur.y + DIRS[d][1];
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const nk = key(nx, ny);
      if (closed.has(nk)) continue;
      if (blockedStep(cur.x, cur.y, nx, ny)) continue;
      const ng = cur.g + (prefer && prefer(nx, ny) > 0 ? ORTHO - PREF_DISC : ORTHO);   // ★길 스냅(답압 수렴): 길 칸 진입 -1 — 등가거리 중 길 경유가 엄격히 저렴
      if (ng < (g.has(nk) ? g.get(nk) : Infinity)) {
        g.set(nk, ng); came.set(nk, cur.k);
        open.push({ f: ng + H(nx, ny), g: ng, k: nk, x: nx, y: ny });
      }
    }
  }
  return null;
}

// ── routePath: 8방 100/140 A*(octile + 직선 편향 + costMul) — 코너컷 금지 ──
//   랩 tradePath(√2·물22배)·서버 computeRoutePts(140/100·답압)를 대체. 물·다리·답압은 콜백 소관.
function routePath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blocked = opts.blocked || (() => false);
  const costMul = opts.costMul || null;
  const maxPops = opts.maxPops || 250000;
  const sc = opts.scratch || null;   // {w,h,g,came,stamp,gen} — 서버 gen-스탬프 재사용 버퍼(대격자 성능)
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  const invLen = 1 / Math.max(1, Math.hypot(gx - sx, gy - sy));
  const H = (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx > dy ? ORTHO * (dx - dy) + DIAG * dy : ORTHO * (dy - dx) + DIAG * dx) + _perp(x, y, sx, sy, gx, gy, invLen) * BIAS_ROUTE * ORTHO; };
  const open = _mkHeap();
  const DIRS = [[1, 0, ORTHO], [-1, 0, ORTHO], [0, 1, ORTHO], [0, -1, ORTHO], [1, 1, DIAG], [1, -1, DIAG], [-1, 1, DIAG], [-1, -1, DIAG]];
  let gGet, gSet, cameGet, cameSet, seen;
  if (sc) {   // 타이프트 배열 경로(어댑터 소유 폭·높이 — 노드 = y*w+x, 좌표는 [0,w)×[0,h) 전제)
    sc.gen = (sc.gen | 0) + 1; const gen = sc.gen, W = sc.w;
    gGet = (x, y) => (sc.stamp[y * W + x] === gen ? sc.g[y * W + x] : Infinity);
    gSet = (x, y, v) => { const i = y * W + x; sc.stamp[i] = gen; sc.g[i] = v; };
    cameGet = (x, y) => sc.came[y * W + x];
    cameSet = (x, y, v) => { sc.came[y * W + x] = v; };
    seen = null;
  } else {
    const gm = new Map(), cm = new Map();
    const key = (x, y) => x + ',' + y;
    gGet = (x, y) => (gm.has(key(x, y)) ? gm.get(key(x, y)) : Infinity);
    gSet = (x, y, v) => gm.set(key(x, y), v);
    cameGet = (x, y) => cm.get(key(x, y));
    cameSet = (x, y, v) => cm.set(key(x, y), v);
    seen = null;
  }
  const enc = sc ? ((x, y) => y * sc.w + x) : null, W2 = sc ? sc.w : 0;
  gSet(sx, sy, 0); cameSet(sx, sy, -1);
  open.push({ f: H(sx, sy), g: 0, x: sx, y: sy });
  let pops = 0, fx = -1, fy = -1;
  while (open.size > 0) {
    const cur = open.pop();
    if (cur.g !== gGet(cur.x, cur.y)) continue;   // stale(lazy 삭제 — 서버 동형)
    if (cur.x === gx && cur.y === gy) { fx = gx; fy = gy; break; }
    if (++pops > maxPops) break;
    for (let d = 0; d < 8; d++) {
      const dx = DIRS[d][0], dy = DIRS[d][1], w0 = DIRS[d][2];
      const nx = cur.x + dx, ny = cur.y + dy;
      if (blocked(nx, ny)) continue;
      if (dx && dy && (blocked(cur.x + dx, cur.y) || blocked(cur.x, cur.y + dy))) continue;   // 대각 코너 절단 금지
      const step = costMul ? Math.round(w0 * costMul(nx, ny)) : w0;
      const ng = cur.g + step;
      if (ng < gGet(nx, ny)) {
        gSet(nx, ny, ng);
        cameSet(nx, ny, sc ? enc(cur.x, cur.y) : (cur.x + ',' + cur.y));
        open.push({ f: ng + H(nx, ny), g: ng, x: nx, y: ny });
      }
    }
  }
  if (fx < 0) return null;
  const path = [];
  if (sc) {
    let i = enc(fx, fy);
    while (i >= 0) { path.unshift({ x: i % W2, y: (i / W2) | 0 }); i = cameGet(i % W2, (i / W2) | 0); }
  } else {
    let k = fx + ',' + fy;
    while (k !== undefined && k !== -1) { const c = k.indexOf(','); path.unshift({ x: +k.slice(0, c), y: +k.slice(c + 1) }); k = cameGet(+k.slice(0, c), +k.slice(c + 1)); if (k === -1) break; }
  }
  return path;
}

const PathCore = { localPath, routePath, ORTHO, DIAG };
if (typeof module !== 'undefined' && module.exports) module.exports = PathCore;
if (typeof window !== 'undefined') window.PathCore = PathCore;
