// === sim/path-core.js — 경로탐색 정본 (랩·서버 공용 단일 소스) ===
// ★[통일 계약 2026-07-17, 사용자 지시 "무조건 통일"] 랩(bfsPath L자·tradePath √2·물22배 다리창발)과
//   서버(pathfind.js 계단·computeRoutePts 140/100·물차단)가 갈라져 있던 것을 이 모듈 하나로 통일.
//   배포 토폴로지 = econ 번들·battle-core와 동일 3사본: 이 파일(정본) → 서버 require → 랩 마커 인라인(sim/inline-path.js).
//
// ★[커널 단일화 — 사용자 질문 "둘을 통일할 수는 없어?"] 탐색 엔진은 _search 하나뿐이다.
//   localPath/routePath는 알고리즘이 아니라 **규칙 프리셋**(걸음 규칙 vs 도로 규칙):
//     · localPath = 사람 한 걸음: 4방(대각 걸음은 벽-edge 판정 복잡으로 동결 — 열린 지형 대각은 호출측 직진 보간이 담당)
//                   + 간선(edge) 차단(서버 벽은 셀 경계에 있음) + 길 스냅(답압 수렴).
//     · routePath = 도로: 8방 100/140 + 코너컷 금지 + costMul(답압 할인·월드젠 도하 22배) + 대격자 scratch.
//   힙·정규화(왕복 대칭)·직선 편향·백트레이스 등 탐색 본체는 전부 커널 한 곳 — 갈라질 코드가 없다.
//
// 규칙(사용자 확정):
//   · 물 = 차단, 다리 칸만 통행 — 다리는 맵에 만들어두는 사물(경로 창발 아님). 물/다리 판정은 전부 호출측 blocked 콜백 소관.
//   · 동률 최단경로 = ★직선 편향: 시작→목표 기하 직선에 수직거리가 가장 작은 경로 선택(L자·계단 아닌 자연 근사).
//     구현 = f에 perpDist(현재셀↔직선 수직거리)×미세가중 가산. 가중은 스텝 양자보다 작게 → 회랑 내 최단성 보존.
//     (원거리 우회 시 근사 허용 — 서버 §16 답압 할인의 '근사로 충분' 계약과 동일 선상.)
//   · ★왕복 대칭(사용자 지적 "돌아올 땐 같은 경로여야"): 질의 정규화 — 끝점을 사전순(x, 다음 y)으로 정렬해
//     항상 한 방향으로만 계산 후 필요시 뒤집기 → a→b == reverse(b→a)가 동률·장애물 불문 항상 성립.
//     ⇒ 갔던 경로를 저장할 필요 없음: 같은 두 점·같은 세계면 재계산이 같은 복도를 결정론으로 재현.
//     전제: blockedStep·prefer·costMul이 방향대칭(현 호출자 전부 셀/벽 기반 = 충족). 일방통행 간선이 생기면 재검토.
//   · 비용 정수화: 직교 100 / 대각 140 (서버 §16 할인 정밀도 승계 — 랩 √2(141.42…)와의 차이는 동률 해소 수준).
//   · 대각 코너 절단 금지(양 옆이 막히면 대각 불가) — 행렬·랩·서버 기존 계약 공통.
//
// API (좌표는 전부 정수 그리드 노드 — px 변환·해상도(coarse)는 어댑터 소관):
//   localPath(sx,sy,gx,gy,opts)  — 걸음 프리셋(4방 균일비용). 마을 내 일상 이동.
//     opts.blockedStep(fx,fy,tx,ty) — 이동(간선) 차단 판정. 셀 차단만 있으면 (f,t)→cellBlocked(tx,ty)로 감싸 전달.
//     opts.maxNodes(기본 16384) · opts.radius(시작·목표 박스 밖 탐색 금지, 기본 무제한)
//     opts.prefer(x,y) — ★답압 수렴(전쟁실험실 "평행길 교정" 승계): >0(길)이면 진입비 99/100 → 등거리 대안이
//                        길로 스냅(h는 100/스텝이라 허용적 유지 = 최단 보존·우회 불가). 우선순위 = 길 > 직선 편향 > 임의.
//   routePath(sx,sy,gx,gy,opts) — 도로 프리셋(8방 100/140). 마을 간 교역로.
//     opts.blocked(x,y) — 노드 차단. opts.costMul(x,y) — 스텝 비용 배율(답압 할인·특수지형 — 기본 1).
//     opts.maxPops(기본 250000) · opts.scratch — 재사용 버퍼 {w,h,g,came,stamp,gen} (서버 gen-스탬프 패턴.
//                                     미제공 시 Map 기반 — 랩 규모엔 충분).
//   반환: [{x,y}, …] 시작 포함 노드열. 실패 null.
//
// 검증: sim/_path-core-test.js (형태=직선 편향·최단성 보존·코너컷 금지·왕복 대칭·랩/서버 구계약 대비 길이 동일성).
'use strict';

const ORTHO = 100, DIAG = 140;   // 정수 비용(×100 스케일) — 서버 §16 정밀도 승계
const BIAS_LOCAL = 0.005, BIAS_ROUTE = 0.1;   // 직선 편향 가중. ★local은 최단성 엄수: perp≤반경√2(기본 64→~91)×0.005×100=45 < 스텝양자 100
const PREF_DISC = 1;   // prefer(길 스냅) = 길 칸 진입비 -1(99/100). 등가거리 중 길 경유가 엄격히 저렴 → 확정 스냅.
                       //   +1스텝 우회하려면 길 100칸 필요 = 마을 스케일에선 불가능 → 순수 동률 해소로만 작동(구 전쟁랩 계약).
const DIRS4 = [[1, 0, ORTHO], [-1, 0, ORTHO], [0, 1, ORTHO], [0, -1, ORTHO]];   // 이웃 순서 = 완전 동률의 최후 해소(가로 우선) — 정규화 덕에 방향 무관 동일 복도
const DIRS8 = [[1, 0, ORTHO], [-1, 0, ORTHO], [0, 1, ORTHO], [0, -1, ORTHO], [1, 1, DIAG], [1, -1, DIAG], [-1, 1, DIAG], [-1, -1, DIAG]];

function _mkHeap() {   // 이진 최소힙 {f,g,x,y} — 랩·서버 기존 구현 동형
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

// ── _search: 단일 탐색 커널 — localPath/routePath는 이걸 규칙 프리셋으로 호출한다 ──
//   o = { dirs, octile(bool — h 모드), biasW, stepBlocked(fx,fy,tx,ty), nodeBlocked(x,y)|null(코너컷용),
//         costMul(x,y)|null, prefer(x,y)|null, maxPops, radius, scratch|null }
function _search(sx, sy, gx, gy, o) {
  // ★왕복 대칭: 질의 정규화(사전순 작은 끝점에서 계산) — 커널 한 곳에서만 처리.
  if (gx < sx || (gx === sx && gy < sy)) { const p = _search(gx, gy, sx, sy, o); return p ? p.reverse() : null; }
  const radius = o.radius || 0;
  const minX = radius ? Math.min(sx, gx) - radius : -Infinity, maxX = radius ? Math.max(sx, gx) + radius : Infinity;
  const minY = radius ? Math.min(sy, gy) - radius : -Infinity, maxY = radius ? Math.max(sy, gy) + radius : Infinity;
  const invLen = 1 / Math.max(1, Math.hypot(gx - sx, gy - sy));
  const H = o.octile
    ? (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return (dx > dy ? ORTHO * (dx - dy) + DIAG * dy : ORTHO * (dy - dx) + DIAG * dx) + _perp(x, y, sx, sy, gx, gy, invLen) * o.biasW * ORTHO; }
    : (x, y) => (Math.abs(x - gx) + Math.abs(y - gy)) * ORTHO + _perp(x, y, sx, sy, gx, gy, invLen) * o.biasW * ORTHO;
  // 저장 백엔드: scratch(gen-스탬프 타이프트 — 대격자·좌표 [0,w)×[0,h) 전제) 또는 Map(소규모·좌표 무제한)
  let gGet, gSet, cameGet, cameSet, W2 = 0;
  const sc = o.scratch || null;
  if (sc) {
    sc.gen = (sc.gen | 0) + 1; const gen = sc.gen; W2 = sc.w;
    gGet = (x, y) => (sc.stamp[y * W2 + x] === gen ? sc.g[y * W2 + x] : Infinity);
    gSet = (x, y, v) => { const i = y * W2 + x; sc.stamp[i] = gen; sc.g[i] = v; };
    cameGet = (x, y) => sc.came[y * W2 + x];
    cameSet = (x, y, v) => { sc.came[y * W2 + x] = v; };
  } else {
    const gm = new Map(), cm = new Map(), key = (x, y) => x + ',' + y;
    gGet = (x, y) => { const v = gm.get(key(x, y)); return v === undefined ? Infinity : v; };
    gSet = (x, y, v) => gm.set(key(x, y), v);
    cameGet = (x, y) => { const v = cm.get(key(x, y)); return v === undefined ? -1 : v; };
    cameSet = (x, y, v) => cm.set(key(x, y), v);
  }
  const enc = (x, y) => (sc ? y * W2 + x : x + ',' + y);
  const open = _mkHeap();
  gSet(sx, sy, 0); cameSet(sx, sy, -1);
  open.push({ f: H(sx, sy), g: 0, x: sx, y: sy });
  const maxPops = o.maxPops, dirs = o.dirs, nodeBlocked = o.nodeBlocked, costMul = o.costMul, prefer = o.prefer, stepBlocked = o.stepBlocked;
  let pops = 0, found = false;
  while (open.size > 0) {
    const cur = open.pop();
    if (cur.g !== gGet(cur.x, cur.y)) continue;   // stale(lazy 삭제 — 서버 동형)
    if (cur.x === gx && cur.y === gy) { found = true; break; }
    if (++pops > maxPops) break;   // 예산 가드
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0], dy = dirs[d][1], w0 = dirs[d][2];
      const nx = cur.x + dx, ny = cur.y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (stepBlocked ? stepBlocked(cur.x, cur.y, nx, ny) : nodeBlocked(nx, ny)) continue;   // 간선(edge) 판정 없으면 노드 판정 직행(래퍼 간접호출 제거 — 대격자 성능)
      if (dx && dy && nodeBlocked && (nodeBlocked(cur.x + dx, cur.y) || nodeBlocked(cur.x, cur.y + dy))) continue;   // 대각 코너 절단 금지
      let step = costMul ? Math.round(w0 * costMul(nx, ny)) : w0;
      if (prefer && prefer(nx, ny) > 0) step -= PREF_DISC;   // ★길 스냅(답압 수렴)
      const ng = cur.g + step;
      if (ng < gGet(nx, ny)) {
        gSet(nx, ny, ng); cameSet(nx, ny, enc(cur.x, cur.y));
        open.push({ f: ng + H(nx, ny), g: ng, x: nx, y: ny });
      }
    }
  }
  if (!found) return null;
  const path = [];
  if (sc) {
    let i = gy * W2 + gx;
    while (i >= 0) { path.unshift({ x: i % W2, y: (i / W2) | 0 }); i = cameGet(i % W2, (i / W2) | 0); }
  } else {
    let k = gx + ',' + gy;
    while (k !== -1) { const c = k.indexOf(','); const x = +k.slice(0, c), y = +k.slice(c + 1); path.unshift({ x, y }); k = cameGet(x, y); }
  }
  return path;
}

// ── localPath: 걸음 프리셋(4방·간선 차단·길 스냅) — 랩 bfsPath·서버 findPath가 위임 ──
function localPath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  return _search(sx, sy, gx, gy, {
    dirs: DIRS4, octile: false, biasW: BIAS_LOCAL,
    stepBlocked: opts.blockedStep || (() => false),
    nodeBlocked: null, costMul: null,
    prefer: opts.prefer || null,
    maxPops: opts.maxNodes || 16384, radius: opts.radius || 0, scratch: null,
  });
}

// ── routePath: 도로 프리셋(8방·코너컷 금지·costMul·scratch) — 랩 tradePath·서버 computeRoutePts가 위임 ──
function routePath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blocked = opts.blocked || (() => false);
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  return _search(sx, sy, gx, gy, {
    dirs: DIRS8, octile: true, biasW: BIAS_ROUTE,
    stepBlocked: null,   // 노드 차단만 → 커널이 nodeBlocked 직행(성능)
    nodeBlocked: blocked,
    costMul: opts.costMul || null, prefer: null,
    maxPops: opts.maxPops || 250000, radius: 0, scratch: opts.scratch || null,
  });
}

const PathCore = { localPath, routePath, ORTHO, DIAG };
if (typeof module !== 'undefined' && module.exports) module.exports = PathCore;
if (typeof window !== 'undefined') window.PathCore = PathCore;
