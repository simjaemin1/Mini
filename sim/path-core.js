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
//     opts.costMul(x,y) — ★[T585] 스텝 비용 배율(개울 칸 2 = 걸음 ×0.5 의 역 · ≥ 1 이라 h 가 허용적으로 남는다 · 기본 없음)
//     opts.prefer(x,y) — ★답압 수렴(전쟁실험실 "평행길 교정" 승계): >0(길)이면 진입비 99/100 → 등거리 대안이
//                        길로 스냅(h는 100/스텝이라 허용적 유지 = 최단 보존·우회 불가). 우선순위 = 길 > 직선 편향 > 임의.
//   localPathBegin(sx,sy,gx,gy,opts) — ★[T821] 같은 걸음 프리셋의 재개형 문(상태 → `pathStep` 으로 민다 · 답은 `localPath` 와 비트 동일).
//   LOCAL_MAX_NODES · ROUTE_MAX_POPS — 두 프리셋의 탐색 상한 기본값(16384 · 250000)에 붙인 이름(호출측이 정본 상한을 이름으로 부른다).
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

// ★★[T662 2026-10-08] 힙을 **평평한 배열 넷**(f · g · x · y)으로 — 같은 알고리즘 · 같은 비교 · 같은 차례(답 비트 동일).
//   종전: 칸 하나를 꺼낼 때마다 `{f,g,x,y}` 객체 하나를 만들고(밀 때) 힙은 객체 포인터 배열이었다 — 큰 탐색(꺼냄 25만 · 힙 수십만)에서
//   내리기(sift-down)가 객체를 쫓아다니는 캐시 미스가 됐다(T662 해부: 두 존 걸음표 길 403초 중 `pop` 자기시간 32% · `_searchStep` 35%).
//   ⇒ 같은 이진 최소힙을 타입 배열로: 올리기 `F[p] <= f` 면 멈춤 · 내리기 왼쪽 `<` 다음 오른쪽 `<`(종전 `a[m].f` 비교 그대로) —
//     맞바꾸기 대신 구멍을 옮기는 것만 다르고 매 단계 같은 자리에 같은 값이 선다(최종 배열 같음 ⇒ 꺼내는 차례 같음).
//   꺼낸 값은 힙의 칸 넷(`tf`·`tg`·`tx`·`ty`)에 둔다(객체 0). `size` · `pop()` 문은 그대로(하네스 ⑦ 이 재개 사이에 하나 뺀다).
function _mkHeap() {   // 이진 최소힙 (f,g,x,y) — 랩·서버 기존 구현 동형
  let cap = 1024, n = 0;
  let F = new Float64Array(cap), G = new Float64Array(cap), X = new Int32Array(cap), Y = new Int32Array(cap);
  const grow = () => {
    cap *= 2;
    const F2 = new Float64Array(cap); F2.set(F); F = F2; const G2 = new Float64Array(cap); G2.set(G); G = G2;
    const X2 = new Int32Array(cap); X2.set(X); X = X2; const Y2 = new Int32Array(cap); Y2.set(Y); Y = Y2;
  };
  const h = {
    tf: 0, tg: 0, tx: 0, ty: 0,
    push(f, g, x, y) {
      if (n === cap) grow();
      let c = n++;
      while (c > 0) { const p = (c - 1) >> 1; if (F[p] <= f) break; F[c] = F[p]; G[c] = G[p]; X[c] = X[p]; Y[c] = Y[p]; c = p; }
      F[c] = f; G[c] = g; X[c] = x; Y[c] = y;
    },
    pop() {
      h.tf = F[0]; h.tg = G[0]; h.tx = X[0]; h.ty = Y[0];
      n--;
      if (n > 0) {
        const lf = F[n], lg = G[n], lx = X[n], ly = Y[n];
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c, mf = lf;
          if (l < n && F[l] < mf) { m = l; mf = F[l]; }
          if (r < n && F[r] < mf) m = r;
          if (m === c) break;
          F[c] = F[m]; G[c] = G[m]; X[c] = X[m]; Y[c] = Y[m]; c = m;
        }
        F[c] = lf; G[c] = lg; X[c] = lx; Y[c] = ly;
      }
      return h;
    },
    get size() { return n; },
  };
  return h;
}
function _perp(x, y, sx, sy, gx, gy, invLen) {   // 시작→목표 직선까지 수직거리(직선 편향)
  return Math.abs((x - sx) * (gy - sy) - (y - sy) * (gx - sx)) * invLen;
}

// ★★[T697 2026-10-11 · 세션4] **알뜰 판**(`setLean(true)` — 서버가 손잡이 `T697_DAY_GC=1` 일 때만 켠다 · 랩은 안 부른다 = 종전 글자).
//   T689·T697 표본 힙 프로파일러가 쟀다: 교역로 선계산(`_routeResume` → `_searchStep`)이 존 할당의 첫째였고, 그 몸은 **숫자 상자**다 —
//     ⓐ `pop` 이 꺼낸 값을 힙 객체 칸(`tf` · `tg`)에 실수로 쓸 때마다 상자 하나씩(종전 판 `tf` 는 읽는 곳이 없다),
//     ⓑ `H` 클로저 · `open.push` 는 탐색마다 새로 짓는 클로저라 부르는 자리가 여러 모양이 되어 펼쳐 넣지 못한다 → 실수 인자·반환마다 상자,
//     ⓒ Map 판(걸음 `localPath` · 먼 걸음 `routePathBegin`)은 칸마다 `x + ',' + y` 문자열을 짓는다.
//   ⇒ 같은 알고리즘 · 같은 비교 · 같은 차례를 **모듈 함수 하나 모양**으로: 힙은 모듈 함수(`_hlPush` · `_hlPop`)가 미는 평평한 배열 넷 그대로,
//     꺼낸 g 는 실수 배열 한 칸(`TG[0]`)에, h 는 같은 식을 모듈 함수(`_hval`)로, Map 열쇠는 범위 안이면 정수(`_lk` · 범위 밖은 종전 문자열 —
//     문자열엔 늘 ',' 가 있어 정수 열쇠와 안 겹친다). 값·차례는 한 비트도 안 바뀐다(`_path-core-test` ⑧ 이 끔 ↔ 켬 길 · 꺼낸 수를 견준다).
let _LEAN = false;
function setLean(on) { _LEAN = !!on; }
const _LK_O = 16384, _LK_W = 32768;   // 정수 열쇠 = (x+16384)·32768 + (y+16384) — |x|,|y| < 16384 이면 정수(작은 정수 범위 안 · 단사)
function _lk(x, y) { return (x > -_LK_O && x < _LK_O && y > -_LK_O && y < _LK_O) ? (x + _LK_O) * _LK_W + (y + _LK_O) : x + ',' + y; }
function _mkHeapL() {   // `_mkHeap` 과 같은 이진 최소힙 — 상태만 객체에, 밀기·꺼내기는 모듈 함수
  const hp = { cap: 64, n: 0, F: new Float64Array(64), G: new Float64Array(64), X: new Int32Array(64), Y: new Int32Array(64), TG: new Float64Array(1), tx: 0, ty: 0,   // 처음 64칸(걸음 탐색은 작다 · 차면 두 배 — 차례 무관)
    push(f, g, x, y) { _hlPush(hp, f, g, x, y); }, pop() { _hlPop(hp); return hp; }, get size() { return hp.n; }, get tg() { return hp.TG[0]; } };   // 겉 문(하네스 ⑦ 의 `pop()` · `size`)
  return hp;
}
function _hlGrow(hp) {
  const cap = hp.cap * 2; hp.cap = cap;
  const F2 = new Float64Array(cap); F2.set(hp.F); hp.F = F2; const G2 = new Float64Array(cap); G2.set(hp.G); hp.G = G2;
  const X2 = new Int32Array(cap); X2.set(hp.X); hp.X = X2; const Y2 = new Int32Array(cap); Y2.set(hp.Y); hp.Y = Y2;
}
function _hlPush(hp, f, g, x, y) {   // = `_mkHeap` push 글자(같은 비교 `F[p] <= f`)
  if (hp.n === hp.cap) _hlGrow(hp);
  const F = hp.F, G = hp.G, X = hp.X, Y = hp.Y;
  let c = hp.n++;
  while (c > 0) { const p = (c - 1) >> 1; if (F[p] <= f) break; F[c] = F[p]; G[c] = G[p]; X[c] = X[p]; Y[c] = Y[p]; c = p; }
  F[c] = f; G[c] = g; X[c] = x; Y[c] = y;
}
function _hlPop(hp) {   // = `_mkHeap` pop 글자(왼쪽 `<` 다음 오른쪽 `<`) · 꺼낸 g 는 `TG[0]` · x·y 는 정수 칸
  const F = hp.F, G = hp.G, X = hp.X, Y = hp.Y;
  hp.TG[0] = G[0]; hp.tx = X[0]; hp.ty = Y[0];
  const n = --hp.n;
  if (n > 0) {
    const lf = F[n], lg = G[n], lx = X[n], ly = Y[n];
    let c = 0;
    for (;;) {
      const l = 2 * c + 1, r = l + 1; let m = c, mf = lf;
      if (l < n && F[l] < mf) { m = l; mf = F[l]; }
      if (r < n && F[r] < mf) m = r;
      if (m === c) break;
      F[c] = F[m]; G[c] = G[m]; X[c] = X[m]; Y[c] = Y[m]; c = m;
    }
    F[c] = lf; G[c] = lg; X[c] = lx; Y[c] = ly;
  }
}
function _hval(S, x, y) {   // = `_searchBegin` 의 `H` 클로저 글자(같은 연산 · 같은 차례) — S 칸에서 읽는다
  const gx = S.gx, gy = S.gy;
  if (S.oct) { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return ((dx > dy ? ORTHO * (dx - dy) + DIAG * dy : ORTHO * (dy - dx) + DIAG * dx) + _perp(x, y, S.sx, S.sy, gx, gy, S.invLen) * S.biasW * ORTHO) * S.hs; }
  return ((Math.abs(x - gx) + Math.abs(y - gy)) * ORTHO + _perp(x, y, S.sx, S.sy, gx, gy, S.invLen) * S.biasW * ORTHO) * S.hs;
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
  // ★[T578] `hScale` — 스텝 비용이 1 보다 싸질 수 있는 호출(답압 할인 `costMul` 최저 0.87)이 h 를 그만큼 줄여 일관성을 지킨다.
  //   안 주면 1 = 종전 h 그대로(비트 동일 · 랩 사본·걸음 프리셋 무변). 줄이지 않으면 할인 칸에서 h 가 실제 비용을 넘어
  //   같은 노드를 몇 번씩 다시 열고 `maxPops` 에 걸린다(T573 §② ⓑ: 1,219쌍 중 280쌍 `null` · 꺼낸 노드 45만~500만+).
  const hs = (o.hScale > 0 && o.hScale < 1) ? o.hScale : 1;
  const H = o.octile
    ? (x, y) => { const dx = Math.abs(x - gx), dy = Math.abs(y - gy); return ((dx > dy ? ORTHO * (dx - dy) + DIAG * dy : ORTHO * (dy - dx) + DIAG * dx) + _perp(x, y, sx, sy, gx, gy, invLen) * o.biasW * ORTHO) * hs; }
    : (x, y) => ((Math.abs(x - gx) + Math.abs(y - gy)) * ORTHO + _perp(x, y, sx, sy, gx, gy, invLen) * o.biasW * ORTHO) * hs;
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
  if (_LEAN) return _searchBeginL(sx, sy, gx, gy, o, rev, minX, maxX, minY, maxY, invLen, hs, H, sc, W2);   // ★[T697] 알뜰 판(같은 시작 · 같은 h)
  const open = _mkHeap();
  gSet(sx, sy, 0); cameSet(sx, sy, -1);
  open.push(H(sx, sy), 0, sx, sy);
  // ★상태는 **전부 여기 한 덩어리**다 — 그래야 놓았다 이어 갈 수 있다(지역 변수로 남으면 못 잇는다).
  return {
    sx, sy, gx, gy, rev, minX, maxX, minY, maxY, H,
    gGet, gSet, cameGet, cameSet, enc, sc, W2, open, scGen: sc ? sc.gen : 0,   // ★[T662] 이 탐색의 세대(시작 때 값 — 클로저 `gen` 과 같은 수)
    maxPops: o.maxPops, dirs: o.dirs, nodeBlocked: o.nodeBlocked,
    costMul: o.costMul, prefer: o.prefer, stepBlocked: o.stepBlocked,
    pops: 0, found: false, done: false, path: null,
  };
}

// ── [T697] 알뜰 판 시작 — 종전 시작과 같은 끝점·상자·h · 저장은 scratch 그대로 또는 Map(정수 열쇠) ──
function _searchBeginL(sx, sy, gx, gy, o, rev, minX, maxX, minY, maxY, invLen, hs, H, sc, W2) {
  const open = _mkHeapL();
  const gm = sc ? null : new Map(), cm = sc ? null : new Map();
  const S = {
    sx, sy, gx, gy, rev, minX, maxX, minY, maxY, H, lean: true, oct: !!o.octile, biasW: o.biasW, invLen, hs, gm, cm,
    gGet: null, gSet: null, cameSet: null, enc: null,
    cameGet: sc ? ((x, y) => sc.came[y * W2 + x]) : ((x, y) => { const v = cm.get(_lk(x, y)); return v === undefined ? -1 : v; }),   // 백트레이스 · 하네스가 읽는다
    sc, W2, open, scGen: sc ? sc.gen : 0,
    maxPops: o.maxPops, dirs: o.dirs, nodeBlocked: o.nodeBlocked,
    costMul: o.costMul, prefer: o.prefer, stepBlocked: o.stepBlocked,
    pops: 0, found: false, done: false, path: null,
  };
  if (sc) { const i = sy * W2 + sx; sc.stamp[i] = sc.gen; sc.g[i] = 0; sc.came[i] = -1; }   // = gSet(sx,sy,0) · cameSet(sx,sy,-1)
  else { const k = _lk(sx, sy); gm.set(k, 0); cm.set(k, -1); }
  _hlPush(open, _hval(S, sx, sy), 0, sx, sy);
  return S;
}
// ── [T697] 알뜰 판 걸음 — `_searchStep` 과 같은 고리 · 같은 거름 · 같은 차례(값 상자 · 문자열 열쇠만 없다) ──
function _searchStepL(S, budget) {
  //   ★밀기·꺼내기·h 를 **이 고리 안에 펼쳐** 적었다(= `_hlPush` · `_hlPop` · `_hval` 글자 — 같은 비교 · 같은 연산 · 같은 차례).
  //     서버 표본 힙(T697 E 판)이 그 셋을 따로 부르면 실수 인자·반환마다 상자를 지었다(펼쳐 넣기가 안 됐다) — 부르지 않으면 상자 0.
  const open = S.open, TG = open.TG;
  let F = open.F, G = open.G, X = open.X, Y = open.Y;
  const gx = S.gx, gy = S.gy, minX = S.minX, maxX = S.maxX, minY = S.minY, maxY = S.maxY;
  const dirs = S.dirs, nodeBlocked = S.nodeBlocked, costMul = S.costMul, prefer = S.prefer;
  const stepBlocked = S.stepBlocked, maxPops = S.maxPops;
  const sc = S.sc, W2 = S.W2, scG = sc ? sc.g : null, scSt = sc ? sc.stamp : null, scCame = sc ? sc.came : null, gen = S.scGen;
  const gm = S.gm, cm = S.cm;
  const oct = S.oct, hsx = S.sx, hsy = S.sy, invLen = S.invLen, biasW = S.biasW, hs = S.hs;   // `_hval` 이 읽는 칸
  let n = 0;
  while (open.n > 0) {
    if (budget > 0 && n >= budget) return { done: false, path: null };
    n++;
    // — 꺼내기(= `_hlPop`) —
    TG[0] = G[0]; const cx = X[0], cy = Y[0];
    { const hn = --open.n;
      if (hn > 0) {
        const lf = F[hn], lg = G[hn], lx = X[hn], ly = Y[hn];
        let c = 0;
        for (;;) {
          const l = 2 * c + 1, r = l + 1; let m = c, mf = lf;
          if (l < hn && F[l] < mf) { m = l; mf = F[l]; }
          if (r < hn && F[r] < mf) m = r;
          if (m === c) break;
          F[c] = F[m]; G[c] = G[m]; X[c] = X[m]; Y[c] = Y[m]; c = m;
        }
        F[c] = lf; G[c] = lg; X[c] = lx; Y[c] = ly;
      } }
    open.tx = cx; open.ty = cy;
    const cg = TG[0];
    if (sc) { if (scSt[cy * W2 + cx] === gen ? cg !== scG[cy * W2 + cx] : cg !== Infinity) continue; }
    else { const v = gm.get(_lk(cx, cy)); if (cg !== (v === undefined ? Infinity : v)) continue; }   // = gGet
    if (cx === gx && cy === gy) { S.found = true; break; }
    if (++S.pops > maxPops) break;
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0], dy = dirs[d][1], w0 = dirs[d][2];
      const nx = cx + dx, ny = cy + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (stepBlocked ? stepBlocked(cx, cy, nx, ny) : nodeBlocked(nx, ny)) continue;
      if (dx && dy && nodeBlocked && (nodeBlocked(cx + dx, cy) || nodeBlocked(cx, cy + dy))) continue;
      let step = costMul ? Math.round(w0 * costMul(nx, ny)) : w0;
      if (prefer && prefer(nx, ny) > 0) step -= PREF_DISC;
      const ng = cg + step;
      let take = false;
      if (sc) {
        const ni = ny * W2 + nx;
        if (ng < (scSt[ni] === gen ? scG[ni] : Infinity)) { scSt[ni] = gen; scG[ni] = ng; scCame[ni] = cy * W2 + cx; take = true; }
      } else {
        const nk = _lk(nx, ny), v = gm.get(nk);
        if (ng < (v === undefined ? Infinity : v)) { gm.set(nk, ng); cm.set(nk, _lk(cx, cy)); take = true; }
      }
      if (take) {
        // — h(= `_hval` · `_perp` 글자) —
        const pp = Math.abs((nx - hsx) * (gy - hsy) - (ny - hsy) * (gx - hsx)) * invLen;
        let hv;
        if (oct) { const ax = Math.abs(nx - gx), ay = Math.abs(ny - gy); hv = ((ax > ay ? ORTHO * (ax - ay) + DIAG * ay : ORTHO * (ay - ax) + DIAG * ax) + pp * biasW * ORTHO) * hs; }
        else hv = ((Math.abs(nx - gx) + Math.abs(ny - gy)) * ORTHO + pp * biasW * ORTHO) * hs;
        const f = ng + hv;
        // — 밀기(= `_hlPush`) —
        if (open.n === open.cap) { _hlGrow(open); F = open.F; G = open.G; X = open.X; Y = open.Y; }
        let c = open.n++;
        while (c > 0) { const pq = (c - 1) >> 1; if (F[pq] <= f) break; F[c] = F[pq]; G[c] = G[pq]; X[c] = X[pq]; Y[c] = Y[pq]; c = pq; }
        F[c] = f; G[c] = ng; X[c] = nx; Y[c] = ny;
      }
    }
  }
  S.done = true;
  S.path = S.found ? _searchTraceL(S) : null;
  return { done: true, path: S.path };
}
// ── [T697] 알뜰 판 백트레이스 — 정수 열쇠는 풀고, 문자열 열쇠(범위 밖)는 종전처럼 쪼갠다 ──
function _searchTraceL(S) {
  if (S.sc) return _searchTrace(S);   // scratch 판은 종전 글자 그대로(`cameGet` 이 같은 배열을 읽는다)
  const path = [], cm = S.cm;
  let k = _lk(S.gx, S.gy);
  while (k !== -1) {
    let x, y;
    if (typeof k === 'number') { x = Math.floor(k / _LK_W) - _LK_O; y = k - (x + _LK_O) * _LK_W - _LK_O; }
    else { const c = k.indexOf(','); x = +k.slice(0, c); y = +k.slice(c + 1); }
    path.unshift({ x, y }); const v = cm.get(_lk(x, y)); k = v === undefined ? -1 : v;   // = cameGet(없으면 -1)
  }
  return S.rev ? path.reverse() : path;
}

// ── _searchStep: 예산(꺼낸 노드 수)만큼 돌고 나온다. `budget<=0` = 무제한(완주) ──
//   반환 { done, path } — `done` 이 false 면 아무것도 안 끝났다는 뜻이고, `S` 를 다시 넣으면 이어 간다.
//   ★★양보는 `open.pop()` **앞**에서만 한다: 반복 하나는 통째로 돌거나 아예 안 돈다.
//     그래서 예산이 무엇이든 꺼내는 순서가 같고, 답이 비트 동일이다(위 머리 주석 ⓐⓑⓒ).
function _searchStep(S, budget) {
  if (S.done) return { done: true, path: S.path };
  if (S.lean) return _searchStepL(S, budget);   // ★[T697] 알뜰 판(시작이 정한다 — 한 탐색 안에서 안 바뀐다)
  const open = S.open, gGet = S.gGet, gSet = S.gSet, cameSet = S.cameSet, enc = S.enc, H = S.H;
  const gx = S.gx, gy = S.gy, minX = S.minX, maxX = S.maxX, minY = S.minY, maxY = S.maxY;
  const dirs = S.dirs, nodeBlocked = S.nodeBlocked, costMul = S.costMul, prefer = S.prefer;
  const stepBlocked = S.stepBlocked, maxPops = S.maxPops;
  //   ★[T662] scratch 판은 g·came·stamp 를 **배열에서 바로** 읽고 쓴다(`gGet`·`gSet`·`cameSet`·`enc` 클로저와 같은 식 · 같은 값) — 큰 격자 성능.
  const sc = S.sc, W2 = S.W2, scG = sc ? sc.g : null, scSt = sc ? sc.stamp : null, scCame = sc ? sc.came : null, gen = S.scGen;
  let n = 0;
  while (open.size > 0) {
    if (budget > 0 && n >= budget) return { done: false, path: null };   // ★양보 — 힙·g·came·pops 그대로 두고 나간다
    n++;
    open.pop();
    const cg = open.tg, cx = open.tx, cy = open.ty;   // ★[T662] 꺼낸 칸(객체 0 — 힙의 칸 넷)
    if (sc ? (scSt[cy * W2 + cx] === gen ? cg !== scG[cy * W2 + cx] : cg !== Infinity) : cg !== gGet(cx, cy)) continue;   // stale(lazy 삭제 — 서버 동형)
    if (cx === gx && cy === gy) { S.found = true; break; }
    if (++S.pops > maxPops) break;   // 예산 가드
    for (let d = 0; d < dirs.length; d++) {
      const dx = dirs[d][0], dy = dirs[d][1], w0 = dirs[d][2];
      const nx = cx + dx, ny = cy + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      if (stepBlocked ? stepBlocked(cx, cy, nx, ny) : nodeBlocked(nx, ny)) continue;   // 간선(edge) 판정 없으면 노드 판정 직행(래퍼 간접호출 제거 — 대격자 성능)
      if (dx && dy && nodeBlocked && (nodeBlocked(cx + dx, cy) || nodeBlocked(cx, cy + dy))) continue;   // 대각 코너 절단 금지
      let step = costMul ? Math.round(w0 * costMul(nx, ny)) : w0;
      if (prefer && prefer(nx, ny) > 0) step -= PREF_DISC;   // ★길 스냅(답압 수렴)
      const ng = cg + step;
      if (sc) {
        const ni = ny * W2 + nx;
        if (ng < (scSt[ni] === gen ? scG[ni] : Infinity)) { scSt[ni] = gen; scG[ni] = ng; scCame[ni] = cy * W2 + cx; open.push(ng + H(nx, ny), ng, nx, ny); }
      } else if (ng < gGet(nx, ny)) {
        gSet(nx, ny, ng); cameSet(nx, ny, enc(cx, cy));
        open.push(ng + H(nx, ny), ng, nx, ny);
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
//   ★★[T821 2026-10-20] 걸음 프리셋도 **한 곳**(`_localOpts`)이고 문이 둘이다 — 동기(`localPath`)와 재개형(`localPathBegin`) · T85 `_routeOpts` 꼴.
//     프리셋 글자는 종전 `localPath` 안의 그 객체를 그대로 옮겼다(같은 칸 · 같은 기본값 ⇒ 동기 문의 답은 비트 동일 · `_path-core-test` [T821]).
//     탐색 상한 기본값 둘은 종전 글자(16384 · 250000)에 **이름만** 붙였다 — 호출측이 정본 상한을 이름으로 부르게(새 수 0).
const LOCAL_MAX_NODES = 16384, ROUTE_MAX_POPS = 250000;   // 걸음 프리셋 · 도로 프리셋(재개형 문 T85 `routePathBegin` 도 이것) 탐색 상한 기본값
function _localOpts(opts) {
  return {
    dirs: DIRS4, octile: false, biasW: BIAS_LOCAL,
    stepBlocked: opts.blockedStep || (() => false),
    nodeBlocked: null, costMul: opts.costMul || null,   // ★[T585] 셀 비용 술어 한 자리(개울 칸 ×2 = 걸음 ×0.5 의 역) — 안 넘기면 null(종전 비트 그대로)
    prefer: opts.prefer || null,
    maxPops: opts.maxNodes || LOCAL_MAX_NODES, radius: opts.radius || 0, scratch: null,
  };
}
function localPath(sx, sy, gx, gy, opts) {
  opts = opts || {};
  // ★★[T394 ③ 2026-09-26] **첫 줄을 `routePath` 첫 줄과 같게** — 끝점이 막혔으면 `null`.
  //   커널은 왕복 대칭을 위해 끝점을 사전순으로 뒤집고(`_searchBegin` 의 `rev`) **출발 칸은 아무도 검사하지 않는다.**
  //   그래서 막힌 끝점이 사전순으로 앞서면 탐색이 **그 막힌 칸에서 출발해** 길을 냈다 — 같은 질문이 끝점을
  //   어느 쪽에 적었느냐로 답이 갈렸다(T381 실측: 서버가 찾은 길의 17.6 %가 물칸에서 끝났다 · 격자 58.6 %).
  //   `blocked` 는 **노드** 술어다(`routePath` 와 같은 이름·같은 모양). 안 넘기면 `() => false` — 종전과 비트 동일.
  const blocked = opts.blocked || (() => false);
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  return _search(sx, sy, gx, gy, _localOpts(opts));
}
// ── localPathBegin: 걸음 프리셋의 **재개형 문**(T821) — `routePathBegin` 과 같은 꼴 · 같은 프리셋(`_localOpts`) · 같은 커널.
//   상태를 돌려주고 호출측이 `pathStep` 으로 민다(예산은 언제 쉬는가만 정한다 — 답은 동기 문과 비트 동일).
//   저장은 Map(scratch 없음 — 걸음 프리셋 그대로)이라 여러 탐색을 번갈아 밀어도 안전하다(④). 끝점이 막혔으면 `null`(동기 문과 같은 첫 줄).
function localPathBegin(sx, sy, gx, gy, opts) {
  opts = opts || {};
  const blocked = opts.blocked || (() => false);
  if (blocked(sx, sy) || blocked(gx, gy)) return null;
  return _searchBegin(sx, sy, gx, gy, _localOpts(opts));
}

// ── routePath: 도로 프리셋(8방·코너컷 금지·costMul·scratch) — 랩 tradePath·서버 computeRoutePts가 위임 ──
//   ★★[T85] 프리셋은 **한 곳**(`_routeOpts`)이고 문이 둘이다 — 동기(`routePath`)와 재개형(`routePathBegin`).
//     프리셋을 두 번 적으면 그게 사본이고, 그 사본이 갈리는 날 두 문이 **다른 길**을 낸다.
function _routeOpts(opts) {
  return {
    dirs: DIRS8, octile: true, biasW: BIAS_ROUTE,
    stepBlocked: opts.stepBlocked || null,   // 노드 차단만 → 커널이 nodeBlocked 직행(성능) · ★[T598] 호출측이 간선 술어를 주면 그것(목표 노드 막힘도 그 술어가 본다 · 안 주면 null = 종전)
    nodeBlocked: opts.blocked || (() => false),
    costMul: opts.costMul || null, prefer: null, hScale: opts.hScale || 1,   // ★[T578] 호출측이 costMul 최저값을 준다(안 주면 1 = 종전)
    maxPops: opts.maxPops || ROUTE_MAX_POPS, radius: 0, scratch: opts.scratch || null,
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

const PathCore = { localPath, localPathBegin, routePath, smoothPath, routePathBegin, pathStep, setLean, ORTHO, DIAG, LOCAL_MAX_NODES, ROUTE_MAX_POPS };   // ★[T697] setLean — 서버만 부른다(랩 = 끔) · ★[T821] 걸음 재개형 문 · 정본 상한 이름
if (typeof module !== 'undefined' && module.exports) module.exports = PathCore;
if (typeof window !== 'undefined') window.PathCore = PathCore;
