// === scripts/lib-tick-rule.js — **틱 자의 규약**의 코드 쪽 (T433 ②) ==========================================
//   정본 문서: `인계/Z-존서버.md` 절 "틱 자의 규약"(ⓐ~ⓖ). 여기엔 **자가 같이 쓰는 조각**만 둔다(사본 0):
//   ⓐ 부팅 뒤 **첫 하루 경계 뒤**부터 잰다 — 틀 DB 존은 그 경계에서 틱이 한 칸 오른다(T410 §2-⓪ · 틀 존 +49 %).
//      경계 = 세계 phase 가 1 → 0 으로 넘어가는 순간(실제 날 길이에선 마을 하루 경계와 같은 순간 · 둘 다 1,440,000ms).
//   ⓔ 사람당 µs 의 **분모가 어느 명부인가**를 값 옆에 적는다 — 명부가 둘이다:
//      `npcs.size`(존의 NPC 몸 전부 — 도적·캐러밴 포함) ↔ `/lifedbg totals.pop`(마을 명부 Σ`npcPids`). 같은 판에서 1,651 ↔ 1,642.
//   ⓕ [T451 · T427 ②] **같은 벽시계에 나란히 띄운 팔**을 **제 phase 로** 여는 자는 존 시계를 기동에 묶는다 — `ZONE_CLOCK_ANCHOR=boot`
//      (zone.js 맨 위 · 계측·하네스 전용 · 제품 기본 무변). 기동 길이가 다른 두 팔은 벽시계가 같아도 첫 틱의 게임 시각이 다르다
//      (T399 가 T406 에 붙인 아침 차의 전부 — T427 §3). ⚠창을 **벽시계로** 여는 자(`t410` — 조각을 모든 팔에 같은 순간)는 묶지 않는다:
//      묶으면 팔마다 기동 길이만큼 phase 가 어긋난 채 잰다. 못 묶는 것 = 시간 예산 순회(사냥 밴드 20 ms 등 · CPU 에 묶인다 · T427 §3).
//   ⓖ ★[T455] **같은 설정을 n판** 돌려 중앙값 + 판 사이 폭을 적는다 — `RULE_REPEATS`(n 유도식) · `summarize`/`fmtRepeats`(표 문법)
//      · 한 판짜리 값은 `[단판]` 표지(`SINGLE_NOTE`) — 자 하나를 한 번 돌리면 한 판이다. n판을 돌리는 자는 `scripts/t455-repeats.js`.
'use strict';
const DENOM = { npcs: '분모 = npcs.size(존의 NPC 몸 전부 · 도적·캐러밴 포함)', village: '분모 = /lifedbg totals.pop(마을 명부 Σnpc)' };
// phase 를 물어 **경계를 한 번 넘을 때까지** 기다린다. 경계 = 앞서 본 phase 보다 0.5 넘게 작아진 순간(1 → 0 넘김).
//   getPhase: async () => number|null · 돌려주는 값: { crossed, phase, waitedMs }
async function waitDayBoundary(getPhase, opts = {}) {
  const pollMs = opts.pollMs || 5000, maxMs = opts.maxMs || (1440000 + 180000);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const t0 = Date.now(); let hi = null, ph = null;
  for (;;) {
    ph = await getPhase();
    if (ph != null && hi != null && ph + 0.5 < hi) return { crossed: true, phase: ph, waitedMs: Date.now() - t0 };
    if (ph != null) hi = hi == null ? ph : Math.max(hi, ph);
    if (Date.now() - t0 > maxMs) return { crossed: false, phase: ph, waitedMs: Date.now() - t0 };
    await sleep(pollMs);
  }
}
// ⓕ 시계 손잡이 — **글자 하나**(자마다 'boot' 를 다시 쓰지 않는다). 어느 자가 켜나는 `인계/Z-존서버.md` 규약 표 ⓕ 줄.
const CLOCK_ANCHOR = { ZONE_CLOCK_ANCHOR: 'boot' };
function clockEnv(on) { return on ? Object.assign({}, CLOCK_ANCHOR) : {}; }   // 팔 env 에 얹는 조각(끔 = 빈 객체 = 종전 env)
// ⓖ ★[T455] **같은 설정을 n판** — 한 판 값은 값이 아니다(T444: 같은 설정 두 판 18.2 ↔ 22.1 ms).
//   s = 같은 설정 판 사이 흔들림(판 값의 표준편차 · T455 ① 에서 잰다) · 판 값 = 그 판 조각 p50 들의 중앙값.
//   두 팔(각 nA·nB 판)의 중앙값 차의 **폭** = s·√(π/2)·√(1/nA + 1/nB)   (중앙값의 표준오차 = 평균의 √(π/2) 배 — 수학 상수)
//   ⇒ 같은 n 이면 폭 = s·√(π/n) · 규약: **폭 ≤ 효과/3** ⇒ n ≥ π·(3s/효과)² · 최소 3(카드). 새 수 0(3 은 카드 · π 는 상수).
//   효과 = 재는 손잡이의 값(옛 단판 값을 먼저 넣어 n 을 뽑고, 잰 뒤 잰 차로 다시 판정한다).
const RULE_REPEATS = {
  min: 3, ratio: 3,
  n(s, effect) { const e = Math.abs(effect); if (!(s > 0)) return this.min; if (!(e > 0)) return Infinity; return Math.max(this.min, Math.ceil(Math.PI * Math.pow(this.ratio * s / e, 2))); },
  width(s, nA, nB) { return s * Math.sqrt(Math.PI / 2) * Math.sqrt(1 / nA + 1 / (nB == null ? nA : nB)); },
  verdict(delta, width) { return Math.abs(delta) >= this.ratio * width ? '가름' : '못 가름'; },
  //   ★짝 판(같은 바퀴 안에서 켬·팔을 이어 돌린 판 — 바퀴를 n 번)이면 흐름(호스트가 몇 시간에 걸쳐 느려지는 것)이 짝 안에서 지워진다 ⇒
  //     s 대신 **짝 차(팔 − 켬)의 sd** s_d 를 쓴다: 폭 = s_d·√(π/2)/√n · n ≥ (π/2)·(3·s_d/효과)² · 최소 3.
  widthPaired(sd, n) { return sd * Math.sqrt(Math.PI / 2) / Math.sqrt(n); },
  nPaired(sd, effect) { const e = Math.abs(effect); if (!(sd > 0)) return this.min; if (!(e > 0)) return Infinity; return Math.max(this.min, Math.ceil(Math.PI / 2 * Math.pow(this.ratio * sd / e, 2))); },
};
const median = (a) => { const b = a.filter((x) => x != null && isFinite(x)).sort((x, y) => x - y); const n = b.length; return n ? (n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2) : null; };
const sd = (a) => { const b = a.filter((x) => x != null && isFinite(x)); const n = b.length; if (n < 2) return null; const m = b.reduce((x, y) => x + y, 0) / n; return Math.sqrt(b.reduce((x, y) => x + (y - m) * (y - m), 0) / (n - 1)); };
// 판 값들 → { n, med, lo, hi, sd } · 표 문법: `중앙값 [lo–hi · n판]` · n < 3 이면 `값 [단판]`(규약 밖 표지)
function summarize(vals) { const b = vals.filter((x) => x != null && isFinite(x)); return { n: b.length, med: median(b), lo: b.length ? Math.min(...b) : null, hi: b.length ? Math.max(...b) : null, sd: sd(b) }; }
function fmtRepeats(sum, d = 2) {
  if (!sum || !sum.n) return '—';
  if (sum.n < RULE_REPEATS.min) return `${sum.med.toFixed(d)} [단판]`;
  return `${sum.med.toFixed(d)} [${sum.lo.toFixed(d)}–${sum.hi.toFixed(d)} · ${sum.n}판]`;
}
const SINGLE_NOTE = '[단판] 이 자 한 번 = 한 판 — 규약 ⓖ(`lib-tick-rule` RULE_REPEATS): 손잡이 몫·예산 판정은 같은 설정 n판 중앙값 + 폭으로(`scripts/t455-repeats.js`)';
module.exports = { waitDayBoundary, DENOM, CLOCK_ANCHOR, clockEnv, RULE_REPEATS, median, sd, summarize, fmtRepeats, SINGLE_NOTE };
