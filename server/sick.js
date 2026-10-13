// === server/sick.js — 식중독 지수 P · 배탈 지수 B [T705 · 2026-10-12 · 재민 10-12 · 손잡이 `T705_FOOD_SICK=1` · 없음 = 끔 = main 바이트] ===
//
// ★재민 10-12(족보 617): *"날고기·상한 음식은 먹는 즉시 체력이 까이는 게 아니다."*
//   식중독 지수 P — 먹은 만큼 오르고 시간에 따라 준다:        dP/dt = 섭취 − a·P
//   배탈 지수 B   — P 의 적분이 쌓이고 시간에 따라 준다:      dB/dt = P − b·B
//   체력          — B 가 문턱 θ 를 넘은 만큼 깎인다:          dHP/dt = −max(0, B − θ)      (게임 시간 1시간마다)
//   ⇒ 두 단계라 **잠복기**가 저절로 생긴다(P 가 B 로 옮겨 가는 동안은 아무 일도 없다) · 많이 먹을수록 빨리·길게 앓는다.
//   ★주사위 0 — 같은 것을 같은 양 먹으면 같은 탈이다(`spoil.js` 머리의 일관성 원칙 그대로).
//
// ★섭취(P 에 얹는 몫) = 먹은 kg × (1 − f) — f = `spoil.freshnessOf`(로트의 노출에서 · 새 곡선 0).
//   영양은 f 몫(`spoil.nutritionMult`) · 독은 1 − f 몫 — 한 끼가 두 몫으로 갈린다. 갓 잡은 것(f = 1)은 독 0 이다.
// ★익힘 갈래(zone `doCook` — 요리 인스턴스 · T694 품목 굽기·삶기): **익히면 균 몫이 죽는다** — 시듦까지(f > 0)의 1 − f 는 사라지고
//   갓 익힌 것은 f = 1 로 다시 시작한다. **상함(f = 0 · `spoil.stageOf` 의 이분)에서 생긴 독소는 열에 안 깨진다** — CDC:
//   *"Even though cooking can kill Staph, it does not destroy the toxin in the food."* ⇒ 상한 몫으로 익힌 것은 **상한 채로** 태어난다
//   (상한 걸 구우면 갓 구운 것이 되던 길 — T694 재민 칸 ⑦ — 이 이 식으로 닫힌다).
//
// ★★수 셋(a · b · θ)은 **출처의 시간 셋**에서 유도한다(아래 `derive` — 이 파일이 매번 다시 푼다 · 하네스가 출처 수·식을 대조).
//   출처 — CDC "About Staph Food Poisoning"(last reviewed 2024-04-16 · https://www.cdc.gov/staph-food-poisoning/about/index.html):
//     잠복 *"Symptoms usually start suddenly within 30 minutes to 8 hours after eating contaminated food."*
//     기간 *"They last 24 hours or less."*
//   왜 포도상구균인가: 이 식의 섭취가 **상한 몫(1 − f)** 이고, 그 몫의 대표 탈이 상한 음식에서 자라는 독소형이다(살모넬라·선모충은
//     날것·덜 익힌 것의 감염형 — 갓 잡은 것도 품는다 · f 로 안 잡힌다 — 보고 표 · 재민 칸).
//   ⓐ b = 1 / 앓는 기간 상한(24시간)                    — B 가 e 분의 1 로 주는 시간 = 앓는 기간
//   ⓑ a: B 꼭대기 시각 ln(a/b)/(a − b) = 잠복 상한(8시간) — 문턱을 겨우 넘는 양은 꼭대기에서 앓기 시작한다(가장 늦은 시작)
//   ⓒ θ = B(잠복 하한 30분 · 한 끼)                       — 가장 큰 한 끼는 가장 빨리 앓는다(가장 이른 시작)
//        한 끼 = 고기 한 단위(`weights.meat` 1.00kg "도체 정형 1일분")가 다 상한 것(1 − f = 1).
//   ⇒ a ≈ 0.2796 /h · b ≈ 0.04167 /h · θ ≈ 0.4617 kg·h (문턱을 겨우 넘는 양 ≈ 0.18kg 상한 것)
//   ⚠"증상 나는 양"을 **kg 로** 적은 출처는 못 찾았다 — 포도상구균 *"At least 100,000 organisms"*(캐나다 PSDS) · 살모넬라
//     *"As low as one cell"*(FDA Bad Bug Book 2판) — 상한 음식 kg 으로 못 옮긴다 ⇒ θ 는 ⓒ(잠복 하한)로 유도했다 · 재민 칸.
// ★시간은 **게임 시간**이다(하루 = `dayMs` · 기본 24분 → 1시간 = 실초 60). 체력은 게임 1시간마다 (B − θ) —
//   몸 틱의 단위(HP/게임분 = HP/실초 · `body.extremeHpRate`)로는 그 60분의 1이다(분 ↔ 시간 단위 환산 · 새 수 아님).
// ★몸에 드는 것은 셋뿐이다 — `p.body.sick = { P, B, at }`(at = 마지막으로 푼 실시각 ms). 둘 다 0 이면 안 본다(lazy · `spoil.js` 문법).
//   닫힌 해(두 칸 선형 · 충격 입력)로 몸 틱이 넘긴 dt 를 한 걸음에 푼다(오일러 아님 · dt 에 안 흔들린다) — 둘 다 0 인 몸은 안 본다 · 틱 비용 ≈ 0.
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };

const ON = typeof process !== 'undefined' && !!process.env && process.env.T705_FOOD_SICK !== '0';   // ★[PM 10-13] 켬 기본 · 되돌림 `=0`
const DAY_MS_DEFAULT = 24 * 60 * 1000;

// ── 출처의 수(시간) — 이 셋 말고 새 수는 없다 ─────────────────────────────────
const SRC = Object.freeze({
  onsetMinH: 0.5,   // CDC "within 30 minutes to 8 hours" — 하한
  onsetMaxH: 8,     // 〃 상한
  illMaxH: 24,      // CDC "They last 24 hours or less"
  url: 'https://www.cdc.gov/staph-food-poisoning/about/index.html',
});

// ── 닫힌 해 ─────────────────────────────────────────────────────────────────
//   충격 D(t=0) 하나의 B(t) — 두 칸 선형계(Bateman 꼴). a = b 면 극한 꼴.
function impulseB(t, D, a, b) {
  if (!(t > 0) || !(D > 0)) return 0;
  if (Math.abs(a - b) < 1e-12) return D * t * Math.exp(-a * t);
  return D * (Math.exp(-a * t) - Math.exp(-b * t)) / (b - a);
}
function peakT(a, b) { return Math.abs(a - b) < 1e-12 ? 1 / a : Math.log(a / b) / (a - b); }
// ⓑ 를 a 에 대해 푼다 — 꼭대기 시각은 a 가 커질수록 줄어든다(단조) ⇒ 이분법(로그 눈금).
function solveA(b, tPeak) {
  let lo = b * (1 + 1e-9), hi = b * 1e9;
  for (let i = 0; i < 400; i++) {
    const m = Math.sqrt(lo * hi);
    if (peakT(m, b) > tPeak) lo = m; else hi = m;
  }
  return Math.sqrt(lo * hi);
}
let _W = null;
function _mealKg() {
  if (_W === null) { try { _W = require('./weights'); } catch (e) { _W = false; } }
  const k = _W && typeof _W.kgOf === 'function' ? _W.kgOf('meat') : null;
  return k > 0 ? k : 1;
}
function derive(src) {
  const s = src || SRC;
  const b = 1 / s.illMaxH;
  const a = solveA(b, s.onsetMaxH);
  const mealKg = _mealKg();
  const theta = impulseB(s.onsetMinH, mealKg, a, b);
  return { a, b, theta, mealKg, peakH: peakT(a, b), peakPerKg: impulseB(peakT(a, b), 1, a, b) };
}
const D0 = derive(SRC);
// ★손잡이는 이 셋뿐이다(재민 칸 — 다른 균 판을 얹어 볼 때). 없으면 위 유도값.
const PARAM = Object.freeze({
  a: _num('SICK_A_PER_H', D0.a), b: _num('SICK_B_PER_H', D0.b), theta: _num('SICK_THETA', D0.theta),
});

// ── 몸 한 칸 — { P, B, at } ──────────────────────────────────────────────────
//   ★★몸 틱(`body.tick`)이 **넘겨 준 dt 만큼만** 푼다 — `body.js` 머리 헌법 "오프라인 감쇠 절대 금지 · 호출된 만큼만 흐른다"
//     (`lastSeen` 따라잡기 금지 · `test-body ①`). 그래서 벽시계 차이로 풀지 않는다: 접속을 끊거나 쓰러져 틱이 멎으면 배탈도 멎는다.
//   `at` 은 마지막으로 푼 실시각(ms)이다 — 읽기(보고·하네스)용 · 따라잡기에 안 쓴다.
/** 실초 dt → 게임 시간. 하루 길이는 부르는 쪽이 준다(새 시계 0 — 없으면 기본 24분). */
function hoursOf(dtSec, dayMs) {
  const d = Number(dtSec);
  if (!(d > 0)) return 0;
  return d * 1000 * 24 / (Number(dayMs) > 0 ? Number(dayMs) : DAY_MS_DEFAULT);
}
/** h 게임시간만큼 푼다(닫힌 해 · 제자리). 둘 다 0 이면 안 본다. */
function step(s, h, prm) {
  if (!s || !(h > 0)) return s;
  if (!(s.P > 0) && !(s.B > 0)) { s.P = 0; s.B = 0; return s; }
  const p = prm || PARAM, ea = Math.exp(-p.a * h), eb = Math.exp(-p.b * h);
  const B = s.B * eb + (Math.abs(p.a - p.b) < 1e-12 ? s.P * h * ea : s.P * (ea - eb) / (p.b - p.a));
  s.P = s.P * ea; s.B = B;
  if (s.P < 1e-9 && s.B < 1e-9) { s.P = 0; s.B = 0; }   // 다 나았다 — 다음부터는 안 본다
  return s;
}
/** 먹은 독을 얹는다(충격 — P 에 더한다). 몸 상태는 마지막 틱까지 풀려 있다(따라잡기 0). */
function intake(s, dose, nowMs) {
  const d = Number(dose);
  if (!s || !(d > 0)) return s;
  s.P = (s.P || 0) + d;
  if (!(s.B > 0)) s.B = 0;
  if (Number.isFinite(Number(nowMs))) s.at = Number(nowMs);
  return s;
}
/** 체력이 깎이는 빠르기 — HP/게임시간 · HP/게임분(몸 틱 단위). */
function rateHpPerHour(s, prm) { const p = prm || PARAM; return s ? Math.max(0, (s.B || 0) - p.theta) : 0; }
function rateHpPerMin(s, prm) { return rateHpPerHour(s, prm) / 60; }
/** 한 번 먹은 독 — kg × 개수 × (1 − f). */
function doseOf(kgPerUnit, n, fresh) {
  const k = Number(kgPerUnit), q = Number(n), f = Math.max(0, Math.min(1, Number(fresh)));
  if (!(k > 0) || !(q > 0) || !Number.isFinite(f)) return 0;
  return +(k * q * (1 - f)).toFixed(6);
}

// ── 보고·하네스용 — 한 끼의 곡선(게임 시간) ─────────────────────────────────
//   D 한 번을 먹은 뒤 시간마다 P · B · 누적 HP. step·hours 는 게임 시간.
function course(D, hours, stepH, prm) {
  const p = prm || PARAM, dt = stepH || 0.25, H = hours || 96;
  const rows = []; let hp = 0, on = null, off = null;
  for (let t = 0; t <= H + 1e-9; t += dt) {
    const P = (D > 0 && t >= 0) ? D * Math.exp(-p.a * t) : 0;
    const B = impulseB(t, D, p.a, p.b);
    const r = Math.max(0, B - p.theta);
    if (r > 0) { if (on === null) on = t; off = t; }
    rows.push({ t: +t.toFixed(4), P: +P.toFixed(6), B: +B.toFixed(6), hp: +hp.toFixed(4) });
    // 다음 칸까지의 체력 — 사다리꼴(곡선이 매끈하다)
    const B2 = impulseB(t + dt, D, p.a, p.b);
    hp += (r + Math.max(0, B2 - p.theta)) / 2 * dt;
  }
  return { D, rows, onsetH: on, endH: off, illH: on === null ? 0 : +(off - on).toFixed(4), hp: +hp.toFixed(4) };
}

module.exports = { ON, SRC, PARAM, D0, DAY_MS_DEFAULT, derive, impulseB, peakT, solveA,
  hoursOf, step, intake, rateHpPerHour, rateHpPerMin, doseOf, course };
