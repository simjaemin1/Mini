// === server/weather.js — 연중 연속 온도 곡선 =====================================
//
// ★★[재민 확정 2026-08-31] 이 모듈이 있는 이유 한 줄:
//   **"12월과 1월과 2월이 같은 강도는 아니지."**
//   종전 추위는 `zone.js seasonColdNow()` 의 **4단 계단**이었다(겨울 1 · 봄가을 0.35 · 여름 0).
//   그래서 12월 1일과 1월 20일이 **완전히 같은 추위**였고, 계절이 바뀌는 날 밤에
//   몸이 한 칸 뚝 떨어졌다. 계절은 달력의 이름이지 몸이 느끼는 단위가 아니다.
//
// ★★★사본 금지 — 이 모듈은 **곡선을 새로 만들지 않는다.** ★★★
//   `sim/economy-sim-v2.js:224 temperatureAt(day, hourFrac, elevKm)` 이 이미 정본이다.
//   그 함수의 주석이 이렇게 적혀 있다: *"econ(일 틱)은 일평균·야간최저만 소비 —
//   시간 곡선(hourFrac)은 **생활층(밤낮) 인계용 노출**"*. 즉 **이 자리를 위해 이미 내보내 둔 것**이고,
//   여태 아무도 연결하지 않았을 뿐이다. `module.exports` 에 `temperatureAt, CLIMATE` 가 그래서 있다.
//   ⇒ 여기서 하는 일은 딱 하나: **℃ → 몸이 느끼는 추위(0..1)** 로 옮기는 것.
//   ⇒ 연주기·일교차·감률·위상은 **전부 econ 정본에서 온다.** 여기에 365·90·315 같은 수를 적지 마라.
//     (초안은 `seasonOf` 에서 코사인을 따로 만들었다가 폐기했다 — econ 정본과 최한일이
//      **2일 어긋났다**. 사본은 언제나 이렇게 조용히 어긋난다.)
//
// ★★econ 무수정: `temperatureAt`·`CLIMATE` 를 **읽기만** 한다. 한 줄도 바꾸지 않는다.
//
// ★★시간 구조 불변 캐논 — [재민 확정 2026-08-31] ★절대 바꾸지 마라★
//   **하루 = 실시간 24분 · 1년 = 365 게임일.** *"시간은 절대 바꾸면 안 돼.
//   차라리 겨울 버티는 난이도를 수정."* 겨울이 짧게 느껴지면 **곡선과 완충**을 고치지,
//   1년을 늘리지 않는다. 이 세계의 공전은 정확히 365일이다(그 365도 econ 정본이 갖고 있다).
//
// ★★"매년 7월 1일이 같으면 안 된다" — [재민 확정 2026-08-31]
//   날씨 편차는 **절대 게임일**을 먹는다(`day % 365` 가 아니다). 그래서 3년차 7월 1일은
//   1년차 7월 1일과 다르다. 대신 씨앗이 같으면 **모든 존·모든 재시작에서 같다**
//   (존마다 날씨가 다르면 그건 세계가 아니라 방이다 — 경도 시차는 회부로 남긴다).
'use strict';

const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const _int = (k, d) => { const v = parseInt(process.env[k], 10); return Number.isFinite(v) ? v : d; };

const CFG = {
  SEED: _int('WEATHER_SEED', 20260831),          // ★전 존 공통 — 같은 세계는 같은 날씨다

  // ── ★★튜닝1(2026-08-30) 채택 4점을 **곡선의 앵커로 재사용** ────────────────
  //   이 넷은 "몸이 느끼는 추위" 쪽 값이다. **대응하는 ℃ 는 econ 정본에서 유도한다**
  //   (`_anchors()` — 여름 정오·여름 자정·겨울 정오·겨울 자정). 그래서 여기에 온도는 없다.
  //   ⇒ 종전 4단 계단이 이 네 점을 지나는 **연속 곡선**으로 바뀐다. 값은 하나도 안 잃는다.
  //
  //   ★★왜 밤 몫이 여름 0.45 · 겨울 0.30 으로 저절로 갈리는가:
  //     ℃→추위 곡선이 **비선형**이기 때문이다. 여름밤(19℃)−여름낮(29℃) 구간은 가파르고,
  //     겨울밤(−5℃)−겨울낮(5℃) 구간은 이미 천장 근처라 완만하다. 같은 일교차 5℃ 라도
  //     몸에 더해지는 몫이 다르다 — 이걸 **손으로 보간하지 않고 곡선이 만들게** 둔다.
  //     (종전 계단은 겨울밤이 0.7+0.45=1.15 → **잘려서** 초겨울 밤도 한겨울 밤도 똑같이 1.0 이었다.
  //      재민이 지적한 "같은 강도"가 클램프에서 부활했던 자리다. 이제 겨울밤은 정확히 1.00 이다.)
  A_SUMMER_DAY: _num('WEATHER_A_SUMMER_DAY', 0.00),
  A_SUMMER_NIGHT: _num('WEATHER_A_SUMMER_NIGHT', 0.45),
  A_WINTER_DAY: _num('WEATHER_A_WINTER_DAY', 0.70),
  A_WINTER_NIGHT: _num('WEATHER_A_WINTER_NIGHT', 1.00),

  // ── 날씨 편차(fBm 3옥타브 · **℃ 단위**) — "같은 겨울도 어떤 주는 더 춥다" ────
  //   ±5℃ = 실제 한반도의 일평균 편차 규모. 주기는 서로 나눠떨어지지 않게 둔다(23·9.5·4.3일).
  DEV_C: _num('WEATHER_DEV_C', 5),
  P1: _num('WEATHER_P1', 23), W1: _num('WEATHER_W1', 0.55),
  P2: _num('WEATHER_P2', 9.5), W2: _num('WEATHER_W2', 0.30),
  P3: _num('WEATHER_P3', 4.3), W3: _num('WEATHER_W3', 0.15),

  // ── 일교차 변조 — 맑은 밤은 복사냉각으로 더 춥고, 흐린 밤은 덜 춥다 ──────────
  //   econ `CLIMATE.diurnalAmp`(5℃)에 곱해지는 배율. 1 이면 econ 정본 그대로다.
  AMP_NOISE: _num('WEATHER_AMP_NOISE', 0.35), AMP_P: _num('WEATHER_AMP_P', 7.7),
  AMP_MIN: _num('WEATHER_AMP_MIN', 0.55), AMP_MAX: _num('WEATHER_AMP_MAX', 1.45),
};

// ── 결정론 해시 — Math.imul 만 쓴다(부동소수 누적 없음 ⇒ 플랫폼 무관 동일) ─────
function _h(seed, i) {
  let h = Math.imul((seed | 0) ^ (i | 0), 0x27d4eb2d);
  h ^= h >>> 15; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;                 // 0..1
}
// 값 잡음 — smoothstep 보간. 매듭에서 기울기가 0 이라 **C1 연속**이다(계단이 안 생긴다).
function _vnoise(seed, day, period) {
  const x = day / period, i = Math.floor(x), f = x - i;
  const s = f * f * (3 - 2 * f);
  const a = _h(seed, i), b = _h(seed, i + 1);
  return (a + (b - a) * s) * 2 - 1;              // −1..1
}
function _fbm(seed, day) {
  const w = CFG.W1 + CFG.W2 + CFG.W3;
  return (_vnoise(seed, day, CFG.P1) * CFG.W1
        + _vnoise(seed + 1013, day, CFG.P2) * CFG.W2
        + _vnoise(seed + 7919, day, CFG.P3) * CFG.W3) / w;
}

// ── ★econ 기온 정본 물기 ──────────────────────────────────────────────────────
//   ⚠못 물면 **거짓말을 지어내지 않는다**: `available()` 이 false 가 되고,
//     `Body.coldTarget` 은 종전 4단 계단(`ctx.seasonCold`)으로 **그대로** 떨어진다.
//     여기에 `temperatureAt` 의 사본을 두는 것이 최악이다(그게 세 번째 온도 곡선이다).
let _econ;
function _E() {
  if (_econ === undefined) {
    try {
      const m = require('../sim/economy-sim-v2.js');
      _econ = (m && typeof m.temperatureAt === 'function' && m.CLIMATE) ? m : null;
    } catch (e) { _econ = null; }
  }
  return _econ;
}
function available() { return !!_E(); }
/** 테스트·다른 기후용 주입구(econ 스텁). null 이면 다시 정본을 문다. */
function bindEcon(m) { _econ = (m === undefined) ? undefined : m; _anch = null; _oc = { k: null, v: null }; return available(); }

// ── ★앵커 유도 — 여름 골·겨울 봉우리를 **econ 곡선 자신에게서** 찾는다 ────────
//   `seasonOf` 경계(90/180/270)가 아니라 **기온 곡선의 극값**이 기준이다.
//   econ 은 최한일을 doy 315 로 잡았는데 계절 중앙은 317 이다 — 2일 차이를 여기서 없앤다.
let _anch = null;
function _anchors() {
  if (_anch) return _anch;
  const E = _E();
  if (!E) return null;
  const T = (d) => E.temperatureAt(d, null, 0);           // 그날의 **일평균** ℃(고도 0)
  let lo = 0, hi = 0;
  for (let d = 0; d < 366; d += 0.25) { if (T(d) < T(lo)) lo = d; if (T(d) > T(hi)) hi = d; }
  const dA = E.CLIMATE.diurnalAmp;
  _anch = {
    summerMid: hi, winterMid: lo, diurnalAmp: dA,
    // 네 앵커의 ℃ — 자정(hourFrac 0) = 최저, 정오(0.5) = 최고
    tSummerDay: E.temperatureAt(hi, 0.5, 0), tSummerNight: E.temperatureAt(hi, 0, 0),
    tWinterDay: E.temperatureAt(lo, 0.5, 0), tWinterNight: E.temperatureAt(lo, 0, 0),
  };
  return _anch;
}
function anchors() { return _anchors(); }

// ── ★℃ → 몸이 느끼는 추위(0..1) — piecewise linear 제어점 **4개**(§8.3) ───────
//   제어점이 곧 튜닝1 앵커다. 상수 곡선이 아니라 **유도된 표**라서, econ 이 기후를 바꾸면 따라온다.
function _coldPts() {
  const a = _anchors();
  if (!a) return null;
  // ℃ 오름차순 · 추위 내림차순
  return [[a.tWinterNight, CFG.A_WINTER_NIGHT], [a.tWinterDay, CFG.A_WINTER_DAY],
          [a.tSummerNight, CFG.A_SUMMER_NIGHT], [a.tSummerDay, CFG.A_SUMMER_DAY]];
}
function coldOfC(tempC) {
  const pts = _coldPts();
  if (!pts) return 0;
  if (tempC <= pts[0][0]) return pts[0][1];
  const last = pts[pts.length - 1];
  if (tempC >= last[0]) return last[1];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (tempC <= x1) return y0 + (y1 - y0) * ((tempC - x0) / (x1 - x0 || 1));
  }
  return last[1];
}

/** 그날의 날씨 편차(℃) — **절대 게임일**을 먹는다 ⇒ 해마다 다르다. */
function devCOf(day) { return _fbm(CFG.SEED, day) * CFG.DEV_C; }
/** 그날 밤의 일교차 배율(AMP_MIN..AMP_MAX) — 맑은 밤은 더 춥다. */
function ampMultOf(day) {
  const m = 1 + CFG.AMP_NOISE * _vnoise(CFG.SEED + 40507, day, CFG.AMP_P);
  return Math.max(CFG.AMP_MIN, Math.min(CFG.AMP_MAX, m));
}

/**
 * 그 시각의 기온(℃). elevKm 을 주면 econ 감률(−6.5℃/km)이 그대로 걸린다.
 * ⚠지금 `Body` 는 elevKm=0 으로만 부른다 — 산 추위는 회부(추위 축 천장 문제와 묶여 있다).
 */
function tempAt(day, night, elevKm) {
  const E = _E(), a = _anchors();
  if (!E || !a) return null;
  const mean = E.temperatureAt(day, null, elevKm || 0);
  return mean + devCOf(day) + (night ? -1 : 1) * a.diurnalAmp * ampMultOf(day);
}
/** 옷·불·실내·마을을 **뺀** "밖이 얼마나 추운가"(0..1). `Body.coldTarget` 의 바깥 항.
 *  ★한 틱의 모든 플레이어가 **같은 (day, night, elev)** 를 묻는다 ⇒ 한 칸 메모로 적중률이 사실상 100%다.
 *    (fBm 3옥타브 + 코사인을 플레이어 수만큼 다시 도는 건 그냥 낭비다. 결과는 순수 함수라 같다.) */
let _oc = { k: null, v: null };
function outdoorCold(day, night, elevKm) {
  const k = `${day}|${night ? 1 : 0}|${elevKm || 0}`;
  if (_oc.k === k) return _oc.v;
  const t = tempAt(day, night, elevKm);
  const v = (t === null) ? null : +Math.max(0, Math.min(1, coldOfC(t))).toFixed(4);
  _oc = { k, v };
  return v;
}

// ── 겉은 계단(§8.3) — 표시는 6단계. 몸 상태가 아니라 **바깥 날씨**의 이름이다 ──
const _LABELS = [[0.15, '포근함', '🌤'], [0.35, '선선함', '🍃'], [0.55, '쌀쌀함', '🌬'],
                 [0.75, '추움', '❄️'], [0.92, '혹한', '🥶'], [2, '맹추위', '🧊']];
function label(cold) {
  for (const [at, ko, emo] of _LABELS) if (cold < at) return { ko, emo };
  return { ko: '맹추위', emo: '🧊' };
}
function hintOf(day, night, elevKm) {
  const cold = outdoorCold(day, night, elevKm);
  if (cold === null) return null;
  const L = label(cold);
  // ℃ 도 같이 낸다 — 화면이 "왜 추운지"를 말할 수 있어야 한다(비네트 원인 축과 같은 규약).
  return { cold, ko: L.ko, emo: L.emo, night: !!night, tempC: +tempAt(day, night, elevKm).toFixed(1) };
}

module.exports = {
  CFG, available, bindEcon, anchors,
  coldOfC, devCOf, ampMultOf, tempAt, outdoorCold, label, hintOf,
  _internals: { _h, _vnoise, _fbm, _coldPts },
};
