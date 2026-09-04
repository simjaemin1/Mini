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
//
// ★★[T85 2026-09-03 재민 확정] **재개 가능**하게 갈랐다 — `_searchBegin`(상태를 만든다) +
//   `_searchStep(S, budget)`(예산만큼 돌고 **힙과 g 를 그대로 둔 채 나간다**).
//   `_search` 는 이제 그 둘의 **동기 래퍼**다(begin → step(무제한)) — 서명도 답도 무변.
//
//   ★왜: 캐러밴 한 걸음의 콜드 A* 가 실측 1,265~1,695ms 이고, T1 슬라이서는 "캐러밴 한 대"
//     단위라 그 **안**을 못 자른다(T42 회부 3). 2코어 상자에서 그게 17초 루프 막힘으로 증폭됐다.
//   ★★답은 **비트 동일**이다 — 그게 이 갈래의 유일한 계약이다. 근거는 구조다:
//     ⓐ 양보는 **반복 사이**에서만 일어난다(`open.pop()` 앞). 반복 하나는 통째로 돌거나 안 돈다.
//     ⓑ 양보가 만지는 것은 **없다** — 힙·g·came·pops 는 전부 `S` 에 그대로 남는다.
//     ⓒ 그래서 예산이 1이든 무한이든 **같은 순서로 같은 노드를 꺼낸다**.
//     ⇒ 예산은 답이 아니라 **언제 쉬는가**만 정한다. 하네스가 예산 1 로 그걸 잰다.
//   ⚠**scratch 를 공유하는 두 탐색을 번갈아 돌리면 깨진다**(gen-스탬프가 하나뿐이고 `came` 는
//     스탬프도 없다). ⇒ 재개형을 쓰는 쪽은 **한 번에 하나**여야 한다(호출측 계약 · `villages.js` 큐).
//     Map 백엔드(scratch 없음)는 상태가 `S` 안에만 있으므로 번갈아 돌려도 안전하다.

function _searchBegin(sx, sy, gx, gy, o) {
  // ★왕복 대칭: 질의 정규화(사전순 작은 끝점에서 계산) — 커널 한 곳에서만 처리.
  //   ⚠종전엔 **재귀 호출 + reverse** 였다. 재개형은 상태가 하나여야 하므로 여기서 끝점을 한 번
  //     바꿔 두고 `rev` 로 기억한다 — 같은 계산, 같은 결과(뒤집기는 백트레이스 끝에서 한 번).
  let rev = false;
  if (gx < sx || (gx === sx && gy < sy)) { rev = true; const tx = sx; sx = gx; gx = tx; const ty = sy; sy = gy; gy = ty; }
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
  // ★상태는 **전부 여기 한 덩어리**다 — 그래야 놓았다 이어 갈 수 있다(지역 변수로 남으면 못 잇는다).
  return {
    sx, sy, gx, gy, rev, minX, maxX, minY, maxY, H,
    gGet, gSet, cameGet, cameSet, enc, sc, W2, open,
    maxPops: o.maxPops, dirs: o.dirs, nodeBlocked: o.nodeBlocked,
    costMul: o.costMul, prefer: o.prefer, stepBlocked: o.stepBlocked,
    pops: 0, found: false, done: false, path: null,
  };
}

// ── _searchStep: 예산(꺼낸 노드 수)만큼 돌고 나온다. `budget<=0` = 무제한(완주) ──
//   반환 { done, path } — `done` 이 false 면 아무것도 안 끝났다는 뜻이고, `S` 를 다시 넣으면 이어 간다.
//   ★★양보는 `open.pop()` **앞**에서만 한다: 반복 하나는 통째로 돌거나 아예 안 돈다.
//     그래서 예산이 무엇이든 꺼내는 순서가 같고, 답이 비트 동일이다(위 머리 주석 ⓐⓑⓒ).
function _searchStep(S, budget) {
  if (S.done) return { done: true, path: S.path };
  const open = S.open, gGet = S.gGet, gSet = S.gSet, cameSet = S.cameSet, enc = S.enc, H = S.H;
  const gx = S.gx, gy = S.gy, minX = S.minX, maxX = S.maxX, minY = S.minY, maxY = S.maxY;
  const dirs = S.dirs, nodeBlocked = S.nodeBlocked, costMul = S.costMul, prefer = S.prefer;
  const stepBlocked = S.stepBlocked, maxPops = S.maxPops;
  let n = 0;
  while (open.size > 0) {
    if (budget > 0 && n >= budget) return { done: false, path: null };   // ★양보 — 힙·g·came·pops 그대로 두고 나간다
    n++;
    const cur = open.pop();
    if (cur.g !== gGet(cur.x, cur.y)) continue;   // stale(lazy 삭제 — 서버 동형)
    if (cur.x === gx && cur.y === gy) { S.found = true; break; }
    if (++S.pops > maxPops) break;   // 예산 가드
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
  S.done = true;
  S.path = S.found ? _searchTrace(S) : null;
  return { done: true, path: S.path };
}

// ── 백트레이스 — 정규화 프레임에서 만든 뒤, 뒤집을 것이면 여기서 한 번 뒤집는다 ──
function _searchTrace(S) {
  const path = [], sc = S.sc, W2 = S.W2, gx = S.gx, gy = S.gy, cameGet = S.cameGet;
  if (sc) {
    let i = gy * W2 + gx;
    while (i >= 0) { path.unshift({ x: i % W2, y: (i / W2) | 0 }); i = cameGet(i % W2, (i / W2) | 0); }
  } else {
    let k = gx + ',' + gy;
    while (k !== -1) { const c = k.indexOf(','); const x = +k.slice(0, c), y = +k.slice(c + 1); path.unshift({ x, y }); k = cameGet(x, y); }
  }
  return S.rev ? path.reverse() : path;
}

// ── _search: **동기 래퍼**(begin → 완주). 종전 호출자는 이 문 하나만 안다 — 서명 무변 ──
function _search(sx, sy, gx, gy, o) {
  return _searchStep(_searchBegin(sx, sy, gx, gy, o), 0).path;
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
//   ★★[T85] 프리셋은 **한 곳**(`_routeOpts`)이고 문이 둘이다 — 동기(`routePath`)와 재개형(`routePathBegin`).
//     프리셋을 두 번 적으면 그게 사본이고, 그 사본이 갈리는 날 두 문이 **다른 길**을 낸다.
function _routeOpts(opts) {
  return {
    dirs: DIRS8, octile: true, biasW: BIAS_ROUTE,
    stepBlocked: null,   // 노드 차단만 → 커널이 nodeBlocked 직행(성능)
    nodeBlocked: opts.blocked || (() => false),
    costMul: opts.costMul || null, prefer: null,
    maxPops: opts.maxPops || 250000, radius: 0, scratch: opts.scratch || null,
  };
}
function routePath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blocked = opts.blocked || (() => false);
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  return _search(sx, sy, gx, gy, _routeOpts(opts));
}
// ── routePathBegin: **재개형 문** — 같은 프리셋, 같은 커널. 상태를 돌려주고 호출측이 `pathStep` 으로 민다.
//   ⚠`scratch` 를 주면 그 scratch 를 쓰는 탐색은 **한 번에 하나**여야 한다(머리 주석 ⚠ · 호출측 계약).
//   끝점이 막혔으면 `null`(동기 문과 같은 판정 — 사본 0).
function routePathBegin(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blocked = opts.blocked || (() => false);
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  return _searchBegin(sx, sy, gx, gy, _routeOpts(opts));
}
// ── pathStep: 예산(꺼낼 노드 수)만큼 민다. `budget<=0` = 완주. 반환 { done, path } ──
function pathStep(S, budgetNodes) { return _searchStep(S, budgetNodes | 0); }

// ── smoothPath: 이동 직선화(스트링 풀링) — 격자 경로 → 몸이 걷는 웨이포인트만 직선 병합 ──
//   ★[사용자 지적 "계단식으로 움직이는 거 아냐?"] 탐색·다리개통·답압쌍 같은 소비자는 밀집 경로를 그대로 쓰고,
//   에이전트에게 주는 걷기 경로만 이걸로 병합 → (1,2) 방향 ENNENN 계단이 열린 지형에선 세그먼트 1개(진짜 사선 벡터)가 된다.
//   canPass(ax,ay,bx,by) — 직선 통행 판정(호출측 lineClear — 기존 직진 허용 게이트와 동일 규칙 = 일관성).
//   opts.keep(x,y) — true 노드는 병합 앵커(반드시 경유): 길 칸에 쓰면 길 구간은 길 모양대로 걷는다(배속 ×1.10/1.15·답압 강화 루프 유지).
//   ★왕복 대칭: 끝점 사전순 정규화 프레임에서 병합 → smooth(a→b) == reverse(smooth(b→a)) 항상.
function smoothPath(path, canPass, opts) {
  if (!path || path.length < 3) return path ? path.slice() : path;
  opts = opts || {};
  const keep = opts.keep || null;
  const a0 = path[0], b0 = path[path.length - 1];
  const rev = (b0.x < a0.x || (b0.x === a0.x && b0.y < a0.y));
  const p = rev ? path.slice().reverse() : path.slice();
  const out = [p[0]];
  let i = 0;
  while (i < p.length - 1) {
    let lim = p.length - 1;
    if (keep) { for (let k = i + 1; k < p.length - 1; k++) { if (keep(p[k].x, p[k].y)) { lim = k; break; } } }   // 다음 앵커까지가 병합 상한(앵커엔 정확히 착지)
    let j = i + 1;
    while (j < lim && canPass(p[i].x, p[i].y, p[j + 1].x, p[j + 1].y)) j++;
    out.push(p[j]);
    i = j;
  }
  return rev ? out.reverse() : out;
}

const PathCore = { localPath, routePath, smoothPath, routePathBegin, pathStep, ORTHO, DIAG };
if (typeof module !== 'undefined' && module.exports) module.exports = PathCore;
if (typeof window !== 'undefined') window.PathCore = PathCore;
