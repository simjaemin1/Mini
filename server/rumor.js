// === server/rumor.js — 소문 물리 전파(도달 시각표) ============================
//
// ★설계 근거: `설계_게임성_사건레이어_TODO.md` §3 [T7 · 재민 확정 2026-09-01]
//   *"사건은 순간 전파되지 않는다. 이웃 마을의 사건은 캐러밴·여행자가 도착한 뒤에야 들린다."*
//   이건 [[durango-consistency-principle]](순간이동·소멸·추상화 금지 · 주사위 금지)의 **정보판**이다:
//   물건이 걸어서 오듯 소식도 걸어서 온다. 소식만 텔레포트하면 그게 곧 추상화다.
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★이 파일의 제1 규약: **도달 시각은 거리의 함수다. 주사위가 없다.**
//   같은 세계·같은 마을 배치면 같은 사건은 언제나 같은 날 같은 마을에 닿는다.
//   "행상이 늦었다/빨랐다"를 난수로 흔들고 싶어지겠지만, 그건 왜곡(T34)과 같은 층이고
//   **설계 판정 뒤**의 일이다(회부).
//
// ★★제2 규약: **시계를 둘 만들지 않는다.**
//   econ 은 이미 마을 사이를 걷는 시계를 갖고 있다 — `sim/economy-sim-v2.js`
//     const NPC_SPEED = 500;                                  // px/시뮬-day
//     travelDaysForDistance(dist) = max(1, round(dist / 500))
//   소문은 **그 시계 위에 탄다**. 행상이 5일 걸려 가는 길이면 소식도 5일 걸린다.
//   ⚠그런데 그 함수는 econ 의 `module.exports` 에 **없다**(내부 함수다).
//     그리고 이 배치의 절대 규칙은 **econ 무수정**이다 — export 한 줄을 더하면
//     econ 3사본 규약(번들 재생성 + 랩 2종 재인라인 · [[durango-econ-inline-deploy]])이 걸린다.
//   ⇒ 그래서 **정본을 옮겨 적는 대신, 한 줄 거울 + 계약 검사**를 둔다.
//     이건 이 프로젝트가 이미 쓰는 패턴이다: `server/events.js` 의 `seasonOf` 가 정확히 그 자리에
//     같은 주석("economy-sim-v2.js:210 seasonOf 와 동기 계약 — test-events ③ 이 검사한다")과 함께 있다.
//     여기서도 `scripts/test-events.js` 가 **econ 이 실제로 띄운 캐러밴의 `travelDays`** 와
//     이 함수의 값을 전 구간 대조한다(자기 검사가 아니라 교차 검사다).
//   ★엔진이 NPC_SPEED 를 바꾸면 그 검사가 빨개진다. 그게 이 거울의 값이다.
//
// ★제3 규약: **틱 비용 0.** 도달표는 사건이 날 때 **출발 마을당 한 번** 계산해 캐시하고,
//   조회(브리핑·게시판·근황)는 그 표를 읽기만 한다. 하루 경계에도, 조회에도 그래프를 걷지 않는다.
//
// ★제4 규약: **거리는 정본 함수에 묻는다.** 마을 사이 거리는 이미 `world._distMatrix`
//   (지형 BFS 전쌍 최단거리 · `server/villages.js computeAndInjectDistMatrix`)가 정본이고,
//   그걸 읽는 정본 접근자가 `economy-sim.js villageDist` 다. 여기서 좌표를 다시 재지 않는다.
//   ⇒ 강·산으로 막힌 쌍은 `Infinity` 로 오고, 그 마을엔 **소문이 영영 안 간다**(그것도 사실이다).
'use strict';

const _num = (envName, def) => {
  const x = parseFloat(process.env[envName] != null ? process.env[envName] : '');
  return isFinite(x) ? x : def;
};

const CFG = {
  // ★★econ `NPC_SPEED` 의 거울(위 제2 규약). 손잡이로 열어 두되 **기본값이 곧 econ 값**이다.
  SPEED: _num('RUMOR_SPEED', 500),
  // ★같은 거울의 나머지 반쪽 — `max(1, ...)`. 같은 날 도착하는 이웃은 없다(하루는 걸린다).
  MIN_DAYS: _num('RUMOR_MIN_DAYS', 1),
  // ★★단일 손잡이(재민 확정 "플래그를 두 개 만들지 마라"). 1 이면 **전파 없음** =
  //   T7 이전 동작(자기 마을 것만 보인다). A/B 기준선 확인용이고 기본은 꺼짐.
  OFF: _num('RUMOR_OFF', 0),
};

// ── 캐러밴 시계 거울 ──────────────────────────────────────────────────────────
//   ⚠**이 두 줄이 econ 과의 동기 계약이다**(economy-sim-v2.js:234-236).
//     `scripts/test-events.js ⑲` 가 econ 이 실제로 띄운 캐러밴과 대조한다.
function travelDaysOf(dist) {
  const d = Number(dist);
  if (!isFinite(d) || d < 0) return Infinity;
  return Math.max(CFG.MIN_DAYS, Math.round(d / CFG.SPEED));
}

// ── 도달 시각표 ───────────────────────────────────────────────────────────────
// geo = { vids(): [vid…], dist(a, b): px|Infinity }
//   · `dist` 는 **무향**이다(거리행렬이 `mat[s][j] = mat[j][s]` 로 채운다). 그래서 한 마을의
//     행 하나면 "그 마을에서 남에게" 와 "남에게서 그 마을로" 를 **둘 다** 답할 수 있다 —
//     조회(마을 V 에 서 있는 플레이어)는 V 의 행 하나만 데우면 된다.
//     ⚠대칭은 가정이 아니라 검사 대상이다(test-events ⑳).
//
// ★★왜 다단 전파(Dijkstra)를 굳이 도는가 — 직접 거리가 늘 최단이 아니기 때문이다.
//   거리는 삼각부등식을 지키지만 **일수는 `max(1, round(·))` 라 안 지킨다**:
//     A–B 749px → 1일, B–C 749px → 1일 ⇒ 2일.  A–C 1498px → 3일.
//   즉 **이웃을 거쳐 가는 게 하루 빠른 쌍이 실제로 있다.** 소문은 마을을 징검다리로 건너므로
//   그게 물리적으로도 옳다(행상이 한 번에 안 가는 길이다).
function createGraph(geo) {
  const rows = new Map();                 // vid → { [vid]: days }
  const stats = { walks: 0, walkMs: 0, hits: 0, misses: 0, nodes: 0, gen: 0 };

  function invalidate() { rows.clear(); stats.gen++; }

  // 한 출발 마을의 전 마을 도달 일수 — 밀집 그래프 Dijkstra(N≈51 ⇒ O(N²)).
  function walk(from) {
    const t0 = process.hrtime.bigint();
    const ids = geo.vids() || [];
    const n = ids.length;
    const idx = new Map(); for (let i = 0; i < n; i++) idx.set(ids[i], i);
    const src = idx.get(from);
    const best = new Array(n).fill(Infinity);
    const done = new Array(n).fill(false);
    const out = Object.create(null);
    if (src == null) { rows.set(from, out); return out; }
    best[src] = 0;
    for (;;) {
      let u = -1, bu = Infinity;
      for (let i = 0; i < n; i++) if (!done[i] && best[i] < bu) { bu = best[i]; u = i; }
      if (u < 0) break;
      done[u] = true;
      for (let j = 0; j < n; j++) {
        if (done[j] || j === u) continue;
        const w = travelDaysOf(geo.dist(ids[u], ids[j]));
        if (!isFinite(w)) continue;
        const nd = bu + w;
        if (nd < best[j]) best[j] = nd;
      }
    }
    for (let i = 0; i < n; i++) if (isFinite(best[i])) out[ids[i]] = best[i];
    rows.set(from, out);
    stats.walks++; stats.nodes = n;
    stats.walkMs += Number(process.hrtime.bigint() - t0) / 1e6;
    return out;
  }

  function rowOf(vid) {
    const r = rows.get(vid);
    if (r) { stats.hits++; return r; }
    stats.misses++;
    return walk(vid);
  }

  // 며칠 걸리는가 — 같은 마을 0, 못 닿으면 Infinity.
  // ★★대칭이라 **이미 데워진 행이 있으면 그걸 쓴다.** 조회는 "마을 V 에 선 사람이 51곳의 사건을
  //   본다"는 모양이라, V 의 행 하나만 있으면 전부 답이 나온다 — 출발 마을마다 행을 데우면
  //   조회 한 번에 51번 그래프를 걷게 된다(그게 바로 이 배치가 금지한 틱 비용이다).
  function delayBetween(a, b) {
    if (a === b) return 0;
    if (CFG.OFF) return Infinity;          // ★손잡이 하나 — T7 이전 동작
    let r = rows.get(a);
    if (r) { stats.hits++; const d = r[b]; return (d == null) ? Infinity : d; }
    r = rows.get(b);
    if (r) { stats.hits++; const d = r[a]; return (d == null) ? Infinity : d; }
    const d = rowOf(a)[b];
    return (d == null) ? Infinity : d;
  }

  return { rowOf, delayBetween, invalidate, stats, cfg: CFG };
}

module.exports = { createGraph, travelDaysOf, CFG };
