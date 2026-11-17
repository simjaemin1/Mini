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
  Q_IDLE: Math.max(0, _num('T1343_Q_IDLE', 0.25)),
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

// 몸 칸 `deeds` = { z: { 존: 그 존의 내 칸 수 } } — 존을 넘어도 N 은 한 사람 합(카드 ①). `serializeBody` 끝 칸(있을 때만 · 켬 판에서만 선다).
function bodyOf(player) { const d = player && player.deeds; return (d && typeof d === 'object' && d.z && typeof d.z === 'object') ? d : null; }
function setZone(player, zone, n) { if (!player) return; if (!bodyOf(player)) player.deeds = { z: {} }; player.deeds.z[String(zone)] = Math.max(0, n | 0); }
function othersOf(player, zone) { const d = bodyOf(player); if (!d) return 0; let s = 0; for (const [k, v] of Object.entries(d.z)) if (k !== String(zone)) s += Math.max(0, v | 0); return s; }

// 칸 좌표(칸 단위 정수) → 청크 좌표(세계 격자 · 바닥 나눗셈)
function chunkOf(cellX, cellY) { const K = CFG.CHUNK; return [Math.floor(cellX / K), Math.floor(cellY / K)]; }

module.exports = { ON, CFG, daysOf, dailyNeed, capOf, rateOf, init, settle, zeroAt, stageOf, nextAt, add, bodyOf, setZone, othersOf, chunkOf };
