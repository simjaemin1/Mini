'use strict';
// === server/deeds.js — 사유지 돌봄(T1305 → T1332 → ★T1343 계량기 · 재민 11-16 확정) =====================================
//
// ★무엇: 개인 사유지는 **마을과 무관**하다(영토 밖 빈 들은 누구나 · 영토 안은 그 마을 인정 구성원만 — 문은 `zone.tryClaim`).
//   셀 수는 겉으로 무제한이고, 실제 상한은 **돌봄**이 만든다(캐논 797 — 땅을 쥐는 힘 = 몸이 들인 시간).
//
// ★★[T1343 · 재민 11-16 확정 — 카드 글 그대로]
//   ① 넓이: "보통 자기 사유지는 수십 타일이면 괜찮지 않나" · ② **실제 날짜로 낡는다**("현실로 보름 동안 안 들어와도 어느 정도는 유지" ·
//      "셀 욕심을 부릴수록 좀 더 공격적으로 관리를 피곤하게") — T1305 의 "접속한 날만 낡음"은 버린다.
//   ③ 안 쓰고 버티는 날 **D(N) = 15일 × (40 ÷ N)²**(N = 내 사유지 칸 수 합 — 존을 넘어도 한 사람 합) · 숫자 상한 없음.
//   ④ **청크 계량기**: "한 청크에 포함되는 내 영토에 관리비용이 비례 — 3칸이면 300 · 감소속도 3k, 10칸이면 1000 · 10k.
//      그 청크 안의 어느 셀을 관리해도 전체 청크의 관리도가 오른다." ⑤ 청크 = 4×4(세계 격자).
//   ⇒ 청크 c 의 관리도 `m ∈ [0, PT × n_c]` · 줄어듦 = 실제 시간으로 하루 `n_c × PT ÷ D(N)`(가득 찬 청크가 비는 날 = D(N) — 칸 수와 무관) ·
//      0 이면 그 청크의 내 칸이 풀린다(`free` — 이어받기 규약 그대로) · 새로 잡은 칸은 가득(+PT) · 하루 필요 점수 합 = N × PT ÷ D(N) = N³ ÷ 240.
//
// ★계산은 게으르게(읽을 때 · 바뀔 때) — 청크 줄 `{ m, t }`(t = 마지막 셈 시각 ms). 풀림 · 단계 시각은 닫힌 식(`zeroAt` · `nextAt`)으로 미리 안다
//   (존이 그 시각에 깨는 예약 하나 — 틱마다 전 청크를 안 돈다).
//
// ★규약: 이 파일은 **수식 · 상태만** 쥔다(존 · DB · 방송은 부르는 쪽 `zone.js`). 판(`scripts/t1305-care-sim.js`)이 같은 함수를 부른다(사본 0).
//   손잡이 `T1305_DEEDS`(끔 기본 · `=1` 켬) — 끔이면 아무 데서도 안 불린다(바이트 같음).
//   ⚠점수(무엇이 몇 점인가 — `SCORE` · `P_USE` · `Q_WORK` · `Q_IDLE`)는 판으로 고를 **제안**이다 — 정본은 재민(보고 T1343 고를 표).

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const ON = process.env.T1305_DEEDS === '1';
const CFG = {
  // ★[T1343 ③] 버티는 날 D(N) = D0 × (N0 ÷ N)² — 재민 11-16 글의 두 수(15일 · 40칸)
  D0: Math.max(0.01, _num('T1343_D0', 15)),
  N0: Math.max(1, _num('T1343_N0', 40)),
  PT: Math.max(1, _num('T1343_PT', 100)),          // ★[T1343 ④] 칸 하나의 관리도 몫(재민 글 "3칸이면 300")
  CHUNK: Math.max(1, _num('T1332_CHUNK', 4) | 0),  // ★[T1343 ⑤] 청크 4×4(T1332 손잡이 글자 그대로 · 기본만 8 → 4)
  // 흐림 — 관리도 몫이 이 밑이면 경계가 흐려진다. 수는 T1305 의 흐림 · 풀림 날(3 · 7)에서 유도(새 수 0): 남은 몫 ≤ 1 − 3 ÷ 7.
  FADE_D: Math.max(1, _num('T1305_FADE_D', 3)),
  FREE_D: Math.max(2, _num('T1305_FREE_D', 7)),
  // ★[T1343 ②] 점수(판 제안 — 재민 고름) · 'a' = 쓴 일마다 P_USE 점(머묾 한 번도 한 일) · 'b' = 그 청크에서 일하는 시간 초당 Q_WORK(서 있기만 Q_IDLE) · 'c' = 반씩
  SCORE: /^[abc]$/.test(process.env.T1343_SCORE || '') ? process.env.T1343_SCORE : 'b',
  P_USE: Math.max(0, _num('T1343_P_USE', 4)),
  Q_WORK: Math.max(0, _num('T1343_Q_WORK', 1)),
  Q_IDLE: Math.max(0, _num('T1343_Q_IDLE', 0)),   // ★[T1402 · 재민 11-20 판정 12] 서 있기만 = 0점(점수는 일한 시간뿐) · 되돌림 `T1343_Q_IDLE=0.25`(T1343 제안 값)
  // 머묾 — 연속으로 이만큼 그 청크에 있어야 "머문 것"(걸어 지나가기 0) · 일한 뒤 이만큼은 "일하는 중" — T1305 손보는 시간(20초) 재사용(새 수 0)
  DWELL_MS: Math.max(1000, _num('T1305_CARE_S', 20) * 1000),
  TICK_MS: Math.max(10 * 1000, _num('T1305_TICK_MS', 60 * 1000)),
  // 하루 길이 — 기본 = 실시간 하루. 시험 판(`scripts/t1305-screen.js`)만 줄인다(`T1305_DAY_MS` · 운영은 안 준다).
  DAY_MS: Math.max(1000, _num('T1305_DAY_MS', 24 * 60 * 60 * 1000)),
  SAFETY: 0,
};
if (CFG.FADE_D >= CFG.FREE_D) CFG.FADE_D = CFG.FREE_D - 1;
// 숨은 안전판(칸) — 숫자 상한은 없다. DB · 성능 문 하나만: D(N) 이 한 틱(`TICK_MS`)보다 짧아지는 넓이(유도 · 기본 5,879칸 — 그 땅은 잡는 사이 풀린다).
CFG.SAFETY = Math.max(1, _num('T1305_SAFETY', Math.ceil(CFG.N0 * Math.sqrt(CFG.D0 * CFG.DAY_MS / CFG.TICK_MS))) | 0);

// 버티는 날(일) — N = 한 사람의 사유지 칸 합
function daysOf(N) { const n = Math.max(1, +N || 0); return CFG.D0 * (CFG.N0 / n) * (CFG.N0 / n); }
// 하루 필요 점수 합 = N × PT ÷ D(N)
function dailyNeed(N) { return Math.max(0, +N || 0) * CFG.PT / daysOf(N); }
// 청크 줄 꼴: { m, t } · 그 청크 안 내 칸 n · 한 사람 합 N
const capOf = (n) => CFG.PT * Math.max(0, n | 0);
// ms 당 줄어듦
function rateOf(n, N) { return capOf(n) / (daysOf(N) * CFG.DAY_MS); }
// 이행 · 처음 보는 청크: 지금 가득으로 잡는다(켜는 순간 줄지 않는다 · 새로 잡은 칸은 가득)
function init(ch, now, n) { if (!ch) return ch; if (!Number.isFinite(ch.t)) { ch.t = now; ch.m = capOf(n); } if (!Number.isFinite(ch.m)) ch.m = capOf(n); return ch; }
// 지금까지 줄어든 몫을 셈(게으르게) — 반환 = m
function settle(ch, now, n, N) {
  init(ch, now, n);
  const dt = Math.max(0, now - ch.t);
  if (dt) { ch.m = Math.max(0, Math.min(capOf(n), ch.m) - rateOf(n, N) * dt); ch.t = now; }
  ch.m = Math.min(capOf(n), ch.m);
  return ch.m;
}
// 지금 속도로 0 이 되는 시각(ms · 닫힌 식) — settle 한 뒤에 부른다
function zeroAt(ch, n, N) { const r = rateOf(n, N); return r > 0 ? ch.t + ch.m / r : Infinity; }
// 단계 — 'new'(또렷) · 'fade'(흐림 — 남은 몫 ≤ 1 − 흐림 ÷ 풀림) · 'soon'(곧 풀림 — 하루 안에 0) · 'free'
const FADE_FRAC = () => 1 - CFG.FADE_D / CFG.FREE_D;
function stageOf(ch, n, N) {
  const cap = capOf(n); if (!(cap > 0) || !(ch.m > 0)) return 'free';
  if (zeroAt(ch, n, N) - ch.t <= CFG.DAY_MS) return 'soon';
  return ch.m / cap <= FADE_FRAC() + 1e-12 ? 'fade' : 'new';
}
// 다음 단계 바뀜 시각(흐림 문턱 · 곧 풀림 문턱 · 0 중 지금 뒤 가장 이른 것) — 존의 예약 한 개가 이 값의 최소에 깬다
function nextAt(ch, n, N) {
  const r = rateOf(n, N); if (!(r > 0)) return Infinity;
  const cap = capOf(n), z = ch.t + ch.m / r, out = [z];
  const fadeM = cap * FADE_FRAC(); if (ch.m > fadeM) out.push(ch.t + (ch.m - fadeM) / r);
  const soon = z - CFG.DAY_MS; if (soon > ch.t) out.push(soon);
  return Math.min(...out);
}
// 관리 — 점수를 더한다(상한 = 가득). settle 한 뒤에 부른다.
function add(ch, pts, n) { ch.m = Math.min(capOf(n), (+ch.m || 0) + Math.max(0, +pts || 0)); return ch.m; }

// ★★[T1386 · 재민 11-19 확정 — 족보 879] **통째로 풀리지 않는다 — 바닥난 뒤 빚 100점마다 먼 칸 하나(다시 세지 않는다).**
//   1. 계량기는 저축(칸당 PT) · 2. 날마다 청크마다 `n_c × PT ÷ D(N)` 이 빠져나간다(위 그대로) ·
//   3. 청크의 저축이 0 이면 그 청크 몫의 빠져나감이 **빚**(사람 하나 · 바닥난 청크들의 몫을 한데)으로 쌓인다(같은 속도) ·
//   4. 빚이 PT(= 한 칸 몫)가 되면 칸 하나가 풀리고 빚에서 PT 를 뺀다(자투리는 이어 간다) · 5. N 이 줄면 그 순간부터 2 · 3 이 새 N 으로 ·
//   6. 풀리는 칸 = 바닥난 청크의 내 칸 가운데 **집에서 가장 먼 칸**(내 칸 위 4방 걸음 수 · 같으면 직선 거리 · 그래도 같으면 칸 좌표 차례) ·
//      풀어서 내 땅이 갈라지는 칸은 건너뛴다(`claims.components` 술어 — 부르는 쪽이 넘긴다 · 사본 0) ·
//   7. 들어온 점수는 빚부터 지우고 남는 것이 그 청크 저축에 · 저축 > 0 인 청크는 빚을 안 만든다.
//   ⇒ 사람 상태 P = { chunks: [{ key, n, m, t }], cells: [{ id, x, y, key }], home: 'x,y' | null, debt, t, others }(t = 빚 셈 시각).
//   존(`zone._t1343Advance`)과 판(`scripts/t1386-debt-sim.js`)이 같은 `advance` 를 부른다(사본 0).
//   갈라지지 않는 후보가 하나도 없으면(바닥난 청크가 다 목 칸) 그 셈에서는 빚을 그대로 들고 간다(다음 청크가 바닥나면 다시 고른다 — 보고 T1386 회부).
const ck = (x, y) => x + ',' + y;
// 집에서의 걸음 수(내 칸 위로만 4방) — 닿지 않는 칸 = ∞
function stepsFrom(cells, home) {
  const at = new Map(); for (const c of cells) at.set(ck(c.x, c.y), c);
  const dist = new Map(); if (home == null || !at.has(home)) return dist;
  dist.set(home, 0); const q = [home];
  for (let i = 0; i < q.length; i++) {
    const k = q[i], d = dist.get(k), c = at.get(k);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nk = ck(c.x + dx, c.y + dy); if (at.has(nk) && !dist.has(nk)) { dist.set(nk, d + 1); q.push(nk); } }
  }
  return dist;
}
// 다음에 풀릴 칸 — 바닥난 청크 열쇠 집합 안에서 집에서 가장 먼 칸(갈라지는 칸은 건너뜀) · 없으면 null
//   값 같은 지름길 둘(답은 매번 다시 센 것과 같다 — 하네스가 견준다): ① 이웃이 하나 이하인 칸은 빼도 덩이가 안 는다(술어를 안 부른다) ·
//   ② 걸음 수 표는 한 셈 안에서 이어 쓴다 — 뺀 칸이 땅 전체에서 가장 먼 칸이면 다른 칸의 가장 짧은 길이 그 칸을 안 지난다(아니면 다시 센다).
function pickFar(P, bankrupt, components) {
  const cand = P.cells.filter((c) => bankrupt.has(c.key)); if (!cand.length) return null;
  if (!P._dist || P._distHome !== P.home) { P._dist = stepsFrom(P.cells, P.home); P._distHome = P.home; }
  const dist = P._dist;
  const [hx, hy] = P.home != null ? P.home.split(',').map(Number) : [NaN, NaN];
  const far = (c) => { const d = dist.get(ck(c.x, c.y)); return d == null ? Infinity : d; };
  const eu = (c) => (Number.isFinite(hx) ? Math.hypot(c.x - hx, c.y - hy) : 0);
  cand.sort((a, b) => (far(b) - far(a)) || (eu(b) - eu(a)) || (a.x - b.x) || (a.y - b.y));
  if (typeof components !== 'function' || P._splitOk) return cand[0];   // ★[T1402 판정 20] 갈라져도 된다 — 먼 차례 그대로
  const all = new Set(P.cells.map((c) => ck(c.x, c.y)));
  const before = Number.isFinite(P._comps) ? P._comps : components(all);
  for (const c of cand) {
    const k = ck(c.x, c.y); let deg = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (all.has(ck(c.x + dx, c.y + dy))) deg++;
    let after;
    if (deg <= 1) after = before - (deg === 0 ? 1 : 0);
    else { all.delete(k); after = components(all); all.add(k); }
    if (!(after > before)) { P._compsNext = after; return c; }
  }
  P._comps = before;
  return null;
}
// 칸 하나를 뺀 뒤 — 걸음 수 표 · 덩이 수를 이어 쓸지(②)
function _afterFree(P, cell) {
  P._comps = P._compsNext; P._compsNext = undefined;
  if (P._dist) {
    const k = ck(cell.x, cell.y), dk = P._dist.get(k);
    let mx = -1; for (const v of P._dist.values()) if (v > mx) mx = v;
    if (dk == null || dk >= mx) P._dist.delete(k); else P._dist = null;
  }
}
// ★[T1389] 값 같은 빠른 길 — 부르는 쪽이 `claims` 정본(`splitsInt` · `intKey`)을 넘기면(`G` 가 객체) 한 셈 안에서 정수 칸 집합 · 먼 차례 줄을 고쳐 쓴다.
//   고르는 차례 · 갈라짐 판정은 위 `pickFar` 와 같다(하네스 `test-t1389-deeds-on` 이 무작위 땅 수십 판의 풀림 차례를 견준다).
function _cmpOf(P) {
  const dist = P._dist, [hx, hy] = P.home != null ? P.home.split(',').map(Number) : [NaN, NaN];
  const far = (c) => { const d = dist.get(ck(c.x, c.y)); return d == null ? Infinity : d; };
  const eu = (c) => (Number.isFinite(hx) ? Math.hypot(c.x - hx, c.y - hy) : 0);
  return (a, b) => (far(b) - far(a)) || (eu(b) - eu(a)) || (a.x - b.x) || (a.y - b.y);
}
function pickFarFast(P, bankrupt, G) {
  if (!P._S) { P._S = new Set(); P._ik = new Map(); for (const c of P.cells) { const k = G.intKey(c.x, c.y); P._ik.set(c, k); P._S.add(k); } }
  if (!P._dist || P._distHome !== P.home || !P._order) { P._dist = stepsFrom(P.cells, P.home); P._distHome = P.home; P._order = P.cells.slice().sort(_cmpOf(P)); }
  const K = G.intKey(1, 0) - G.intKey(0, 0);
  for (const c of P._order) {
    if (P._gone.has(c) || !bankrupt.has(c.key)) continue;
    const k = P._ik.get(c); let deg = 0; for (const q of [k + K, k - K, k + 1, k - 1]) if (P._S.has(q)) deg++;
    if (P._splitOk || deg <= 1 || !G.splitsInt(P._S, k)) return c;   // ★[T1402 판정 20] 갈라져도 된다 — 먼 차례 그대로
  }
  return null;
}
// ★★[T1402 · 재민 11-20 판정 20 — "그냥 복도도 끊길 수 있게"] 복도 막힘 셋째 안 — 손잡이 `T1402_SPLIT_OK`(끔 기본 · `T1305_DEEDS` 켬 안에서만):
//   풀리는 칸이 목(빼면 갈라짐)이어도 그대로 먼 칸부터 한 칸씩 푼다(기다림 0 · 조각 통째로 0). 떨어진 조각은 그대로 내 땅이다(돌보면 남는다 · N 에 든다).
//   새 칸을 붙이는 문(본거지 조각에만)은 존(`tryClaim`)에 있다. T1389 의 두 안(㉠ 기다림 · ㉡ `T1389_NECK_GIVE`)은 거뒀다 — 끔 = ㉠ 그대로(값 같음).
//   먼 차례는 걸음 수 표로 센다 — 갈라진 뒤 집에 안 닿는 조각은 걸음 ∞(가장 먼저 · 그 청크가 바닥났을 때만).
const SPLIT_OK = process.env.T1402_SPLIT_OK === '1';
const _debtStat = { iters: 0, maxIters: 0, maxFreed: 0, stuck: 0, capped: 0 };
// ★셈 — P 를 지금까지(빠져나감 · 빚 · 칸 풀림을 일어난 차례대로). onFree(cell, at) = 부르는 쪽이 그 칸을 푼다 · onDrop(chunk) = 빈 청크 줄 지움.
//   되풀이 상한 = 칸 수 × 2 + 청크 수 × 2 + 8(사건은 청크 바닥남 · 칸 풀림 둘뿐 — 넘으면 멈추고 셈 표에 남긴다).
function advance(P, now, components, onFree, onDrop, opt) {   // ★[T1389] opt = { budgetMs, splitOk(★T1402) } · components = `claims.components`(함수 · 종전 길) 또는 `claims` 정본 객체(빠른 길)
  const PT = CFG.PT;
  if (!Number.isFinite(P.debt) || P.debt < 0) P.debt = 0;
  if (Number.isFinite(P.t) && now < P.t) return { freed: 0, iters: 0, stuck: false, capped: false };   // 시각은 거꾸로 안 간다(부팅 벽시계가 셈 시각보다 앞이면 그대로)
  if (!Number.isFinite(P.t)) { let t0 = Infinity; for (const c of P.chunks) if (Number.isFinite(c.t) && c.t < t0) t0 = c.t; P.t = Number.isFinite(t0) ? Math.min(t0, now) : now; }
  for (const c of P.chunks) init(c, now, c.n);
  P._dist = null; P._comps = undefined; P._compsNext = undefined; P._S = null; P._order = null; P._gone = new Set();
  const fast = components && typeof components === 'object' && typeof components.splitsInt === 'function';
  P._splitOk = opt && opt.splitOk != null ? !!opt.splitOk : SPLIT_OK;
  const budget = opt && opt.budgetMs > 0 ? opt.budgetMs : 0, t0 = budget ? Date.now() : 0;
  let T = P.t, freed = 0, it = 0, stuck = false, capped = false, done = true;
  const cap = P.cells.length * 2 + P.chunks.length * 2 + 8;
  for (;;) {
    if (++it > cap) { capped = true; break; }
    if (budget && it > 1 && Date.now() - t0 > budget) { done = false; break; }   // ★[T1389] 틱 예산 — 여기(사건 시각 T)까지 셈하고 다음 틱에 잇는다(같은 차례 · 같은 답)
    const N = P.chunks.reduce((a, c) => a + c.n, 0) + (P.others | 0);
    let R = 0, zc = Infinity, zch = null;
    for (const c of P.chunks) { const r = rateOf(c.n, N); if (!(c.m > 0)) R += r; else if (r > 0) { const z = c.t + c.m / r; if (z < zc) { zc = z; zch = c; } } }
    const zd = (R > 0 && !stuck) ? T + Math.max(0, PT - P.debt) / R : (!stuck && P.debt >= PT ? T : Infinity);
    const e = Math.min(zc, zd);
    const to = e <= now ? e : now;
    // to 까지 — 저축 있는 청크는 줄고 · 바닥난 청크 몫은 빚으로
    if (to > T) P.debt += R * (to - T);
    for (const c of P.chunks) { if (c.m > 0) { settle(c, to, c.n, N); if (c.m > 0 && c.m <= capOf(c.n) * 1e-9) c.m = 0; } else if (c.t < to) c.t = to; }   // 같은 순간 바닥난 청크의 뜬수 찌꺼기(가득의 10억분의 1 밑) = 0
    if (zch && e === zc && e <= now) zch.m = 0;   // 그 청크가 바로 지금 바닥났다(뜬수 찌꺼기 0)
    T = to;
    if (!(e <= now)) break;
    if (e === zc) { stuck = false; continue; }   // 청크가 바닥났다 — 다음 고리에서 빚 속도가 붙는다
    // 빚이 한 칸 몫 — 칸 하나를 푼다
    const bankrupt = new Set(); for (const c of P.chunks) if (!(c.m > 0)) bankrupt.add(c.key);
    const cell = fast ? pickFarFast(P, bankrupt, components) : pickFar(P, bankrupt, components);
    if (!cell) { stuck = true; _debtStat.stuck++; continue; }
    if (fast) { P._gone.add(cell); P._S.delete(P._ik.get(cell)); }
    P.cells.splice(P.cells.indexOf(cell), 1); _afterFree(P, cell);
    const ch = P.chunks.find((c) => c.key === cell.key);
    ch.n--; ch.m = Math.min(ch.m, capOf(ch.n));
    if (P.home === ck(cell.x, cell.y)) P.home = null;
    P.debt = Math.max(0, P.debt - PT); freed++;
    if (onFree) onFree(cell, e);
    if (ch.n <= 0) { P.chunks.splice(P.chunks.indexOf(ch), 1); if (onDrop) onDrop(ch); }
    if (!P.cells.length) { P.debt = 0; break; }
  }
  P.t = T; P._S = null; P._order = null; P._gone = null; P._ik = null; P._splitOk = undefined;
  _debtStat.iters += it; if (it > _debtStat.maxIters) _debtStat.maxIters = it; if (freed > _debtStat.maxFreed) _debtStat.maxFreed = freed; if (capped) _debtStat.capped++;
  return { freed, iters: it, stuck, capped, done };
}
// 들어온 점수 — 빚부터 지우고 남는 것이 그 청크 저축에(상한 = 가득) · 반환 = { paid, saved }
function addPts(P, ch, pts) {
  const v = Math.max(0, +pts || 0), paid = Math.min(P.debt > 0 ? P.debt : 0, v);
  P.debt = Math.max(0, (P.debt || 0) - paid);
  const before = ch.m; add(ch, v - paid, ch.n);
  return { paid, saved: ch.m - before };
}
// ★[T1389 · PM 덧붙임 Q12 — 재민 11-19 "카운트다운을 처음부터 다시 세면 안"] 선포(새 칸 · 풀린 내 칸 다시 · 이어받기)의 +PT 는 **빚을 안 지우고 · 바닥난 청크엔 안 든다**.
//   종전(T1386 회부 6)은 일한 점수와 같은 길(`addPts` — 빚부터)이라 내놓고 다시 선포(나무 3 · 돌 2)만으로 빚 100점 = 다음 풀림 한 칸 몫을 샀다.
//   저축이 남은 청크(빚을 안 만드는 청크)에 든 새 칸만 그 몫을 채운다(종전처럼 "새 칸은 가득") · 바닥난 청크의 새 칸은 빈 채 — 빚 · 빚 시계 그대로.
function addClaim(P, ch, pts) {
  if (!(ch.m > 0)) return { paid: 0, saved: 0 };
  const before = ch.m; add(ch, pts, ch.n);
  return { paid: 0, saved: ch.m - before };
}
// 다음 사건 시각 — 청크 단계 바뀜(흐림 · 하루 안 바닥 · 바닥) · 빚이 한 칸 몫이 되는 때
function nextEventAt(P) {
  const N = P.chunks.reduce((a, c) => a + c.n, 0) + (P.others | 0);
  let due = Infinity, R = 0;
  for (const c of P.chunks) { if (!(c.m > 0)) R += rateOf(c.n, N); else due = Math.min(due, nextAt(c, c.n, N)); }
  if (R > 0) due = Math.min(due, P.t + Math.max(0, CFG.PT - P.debt) / R);
  return due;
}
// 내다보기 — P 를 베껴 손 안 대면 언제 첫 칸이 풀리고 · 그 뒤 하루에 몇 칸 · 다음 하루에 풀릴 칸(차례). P 는 안 바뀐다.
//   멀리 보기 상한 = 한 칸만 남은 땅이 바닥나 풀리는 날(D(1) + PT ÷ 하루 몫 — 식에서 유도).
function forecast(P, now, components, opt) {   // ★[T1389] opt.budgetMs — 넘치면 거기까지 내다본 것만(하루 칸 수가 덜 셀 수 있다 · 셈 자체는 안 바뀐다)
  const Q = { chunks: P.chunks.map((c) => ({ key: c.key, n: c.n, m: c.m, t: c.t })), cells: P.cells.slice(), home: P.home, debt: P.debt, t: P.t, others: P.others | 0 };
  const out = { first: Infinity, perDay: 0, next: [], hits: [] };
  if (!Q.cells.length) return out;
  const horizon = now + (daysOf(1) + CFG.PT / dailyNeed(1)) * CFG.DAY_MS;
  let first = Infinity; const hits = [];
  const t0 = Date.now(), left = () => (opt && opt.budgetMs > 0 ? { budgetMs: Math.max(1e-6, opt.budgetMs - (Date.now() - t0)) } : undefined);
  const step = (to) => advance(Q, to, components, (cell, at) => { if (!Number.isFinite(first)) first = at; hits.push([cell, at]); }, null, left());
  // 첫 풀림 — 사건 시각을 따라 한 걸음씩(첫 칸이 풀리면 멈춘다 · 걸음 수 상한 = advance 의 되풀이 상한)
  const lim = Q.cells.length * 2 + Q.chunks.length * 2 + 8;
  for (let k = 0; k < lim && !Number.isFinite(first); k++) {
    const due = Math.min(Math.max(nextEventAt(Q), Q.t), horizon);
    step(due); if (due >= horizon) break;
  }
  if (!Number.isFinite(first)) return out;
  out.first = first;
  step(first + CFG.DAY_MS);
  const win = hits.filter(([, at]) => at <= first + CFG.DAY_MS);
  out.perDay = win.length; out.next = win.map(([c]) => c.id); out.hits = hits.map(([c, at]) => [c.id, at]);
  return out;
}
function setDebt(player, zone, debt) { if (!player) return; if (!bodyOf(player)) player.deeds = { z: {} }; if (!player.deeds.d || typeof player.deeds.d !== 'object') player.deeds.d = {}; player.deeds.d[String(zone)] = Math.max(0, +debt || 0); }

// 몸 칸 `deeds` = { z: { 존: 그 존의 내 칸 수 } } — 존을 넘어도 N 은 한 사람 합(카드 ①). `serializeBody` 끝 칸(있을 때만 · 켬 판에서만 선다).
function bodyOf(player) { const d = player && player.deeds; return (d && typeof d === 'object' && d.z && typeof d.z === 'object') ? d : null; }
function setZone(player, zone, n) { if (!player) return; if (!bodyOf(player)) player.deeds = { z: {} }; player.deeds.z[String(zone)] = Math.max(0, n | 0); }
function othersOf(player, zone) { const d = bodyOf(player); if (!d) return 0; let s = 0; for (const [k, v] of Object.entries(d.z)) if (k !== String(zone)) s += Math.max(0, v | 0); return s; }

// 칸 좌표(칸 단위 정수) → 청크 좌표(세계 격자 · 바닥 나눗셈)
function chunkOf(cellX, cellY) { const K = CFG.CHUNK; return [Math.floor(cellX / K), Math.floor(cellY / K)]; }

module.exports = { ON, CFG, daysOf, dailyNeed, capOf, rateOf, init, settle, zeroAt, stageOf, nextAt, add, bodyOf, setZone, othersOf, chunkOf,
  stepsFrom, pickFar, pickFarFast, advance, addPts, addClaim, nextEventAt, forecast, setDebt, _debtStat, SPLIT_OK };   // ★[T1386] 빚
