// === server/board-food-ema.js — [T274] 게시판만 식사를 본다 (좁은 팔 · 기본 끔) ==================
//
// ⚠**왜 서버에 있나**: 엔진(`sim/`)은 무접촉이다. 식사 소비를 엔진의 `_cons` 에 실으면
//   가격·부패·게시판이 **한꺼번에** 눈을 뜬다(그게 T263 의 넓은 팔이고, PM 권고는 "안 켠다"였다).
//   이 파일은 **게시판 하나만** 눈을 뜨게 하는 좁은 팔이다 — 상태도 장부(`events.js` 의 `s`) 안에 산다.
//
// ⚠**정본 참조(사본 0 · 새 수 0)**: 접는 문법과 α 는 엔진의 일 경계 폴드 그대로다
//   (`sim/economy-sim.js` — `_consDay → _consEMA`, α=1/30, **오늘 키 없는 재화도 29/30 으로 감쇠**).
//   여기서 새로 정한 수는 하나도 없고, 읽는 장부도 정본(`v._foodEaten` — `consumeFood` 가 그날 먹은 몫을 적는다)이다.
//
// ⚠**끔이면 한 글자도 안 바뀐다**: `view()` 가 `v._consEMA` **그 객체를 그대로** 돌려주고,
//   `foldDay()` 는 아무것도 안 한다. 그래서 끔 = 비트 동일이다.
'use strict';

// ★정본 참조 — `sim/economy-sim.js` 의 일 경계 폴드가 쓰는 그 창(α = 1/30). 새 수 아님.
const EMA_N = 30;

// ★손잡이 — 엔진의 `_allocKnob` 과 **같은 규약**(미설정 또는 '0' 이면 끔).
//   ⚠엔진 쪽 손잡이와 달리 이건 **서버 전용**이다: 랩은 `events.js` 를 안 싣는다(그래서 [H] 표가 아니라
//     `lab-wiring-check` 의 서버 기본 절이 이 값을 본다).
function boardFoodOn() {
  const x = (typeof process !== 'undefined' && process.env) ? process.env.T274_BOARD_FOOD : undefined;
  return x !== undefined && x !== null && String(x) !== '0';
}

// 하루 한 번 — 그날 먹은 몫(`v._foodEaten`)을 장부 안의 식사 EMA 로 접는다.
//   ⚠`consumeFood` 는 키를 지우지 않고 0 으로 눌러 두므로, 안 먹은 품목도 자연히 감쇠한다(엔진과 같은 거동).
function foldDay(s, v) {
  if (!boardFoodOn() || !s || !v) return;
  const fe = v._foodEaten; if (!fe) return;
  const e = s.foodEma || (s.foodEma = {});
  for (const r in e) if (!(r in fe)) e[r] *= (EMA_N - 1) / EMA_N;
  for (const r in fe) e[r] = (e[r] || 0) * ((EMA_N - 1) / EMA_N) + (fe[r] || 0) * (1 / EMA_N);
}

// 읽는 쪽 — 소비 EMA + 식사 EMA. **끔이면 정본 객체 그대로**(새 객체도 안 만든다).
function view(s, v) {
  const base = (v && v._consEMA) || {};
  if (!boardFoodOn() || !s || !s.foodEma) return base;
  const out = Object.assign({}, base);
  for (const r in s.foodEma) { const q = s.foodEma[r]; if (q > 0) out[r] = (out[r] || 0) + q; }
  return out;
}

module.exports = { boardFoodOn, foldDay, view, EMA_N };
