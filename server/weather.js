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
//   ★[T570 재민 10-02] 해는 **실제 해**다 — 그레고리력(평년 365 · 윤년 366 · 4/100/400 · 게임일 0 = 1년 3월 1일). 하루 24분은 그대로.
//     연주기 위상은 달력 `solarFrac`(그해 1월 1일 기점 0..1)이라 윤년에도 계절이 밀리지 않는다(`server/calendar.js`).
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
// ★★[천장 해제 2026-08-31 재민 확정] **추운 쪽 끝을 붙잡지 않는다 — 마지막 기울기로 잇는다.**
//   종전엔 가장 추운 제어점(−5℃ → 1.00)에서 표가 **평평해졌다**. 그게 진짜 천장이었다:
//   −5℃ 도 −15℃ 도 똑같이 1.00 이라, 한겨울 밤의 절반이 같은 값에 붙고 고도 감률도 죽었다.
//   ⇒ 이제 −5℃ 아래는 **첫 구간의 기울기(0.03/℃)를 그대로 연장**한다. 새 식이 아니라
//     "붙잡기(clamp)를 안 하는 것"이다 — 곡선은 그대로고 끝만 안 자른다.
//   ⇒ 반환이 1 을 넘을 수 있다. **상태값은 여전히 0~1** 이다(`tick` 이 거기서 자른다) —
//     넘친 몫은 세기가 아니라 **속도**로 나타난다(목표점−현재 가 크니 지수 수렴이 가팔라진다).
//   ⚠따뜻한 쪽(29℃ 위)은 그대로 붙잡는다. 더위 축은 이 세계에 없다(있으면 그건 다른 배치다).
function coldOfC(tempC) {
  const pts = _coldPts();
  if (!pts) return 0;
  const last = pts[pts.length - 1];
  if (tempC >= last[0]) return last[1];
  if (tempC <= pts[0][0]) {
    // ★외삽 — 첫 구간의 기울기를 그대로 쓴다(꺾이지 않는다 ⇒ 어디서도 C0 연속)
    const [x0, y0] = pts[0], [x1, y1] = pts[1];
    const slope = (y1 - y0) / (x1 - x0 || 1);           // 음수(추울수록 큰 값)
    return y0 + slope * (tempC - x0);
  }
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    if (tempC <= x1) return y0 + (y1 - y0) * ((tempC - x0) / (x1 - x0 || 1));
  }
  return last[1];
}

/** 그날의 날씨 편차(℃) — **절대 게임일**을 먹는다 ⇒ 해마다 다르다. */
function devCOf(day) { return _fbm(CFG.SEED, day) * CFG.DEV_C; }

// ═══════════════════════════════════════════════════════════════════════════
// ★★[T98 2026-09-05 재민 확정] **강수 — "오늘 비가 오는가"를 세계가 안다.**
//
//   T93 이 비·눈 화면 층을 세우면서 §0 에 이렇게 적었다: *"비가 오느냐 — 그걸 정하는 정본이
//   세계에 없다."* (실측: `server/`·`sim/` 에 `precip` 0건) 그 층은 `wx.precip`(0..1)을 **읽을 뿐**이라
//   세계가 값을 보내는 날 저절로 켜진다. 이 카드가 그 값을 만든다.
//
//   ★규약 — 기온과 같은 문법:
//     · **절대 게임일**을 먹는 결정론 — 주사위 0. ⇒ "매년 7월 1일이 같으면 안 된다" 가 강수에도 선다.
//     · **전 존 공통**(같은 세계는 같은 하늘) · 경도 시차는 기온과 **같이** 회부.
//     · econ 무수정 · 플레이 영향 0(젖음·추위·밭 물대기는 회부 — 이 카드는 하늘만).
//     · 새 수는 **앵커 열둘뿐** · 환경변수 손잡이 0(`WEATHER_SEED` 는 이미 있던 씨앗이다).
//
//   ★비냐 눈이냐는 **여기서 정하지 않는다.** T93 이 옳다: 물은 0℃에서 언다 — 세계 규칙이 아니라
//     물리다. 서버는 `precip`(0..1 = 강도)만 보내고, 갈림은 클라가 `wx.tempC` 하나로 한다.
//
//   ★★[실측이 카드의 짐작을 뒤집은 자리 — 반드시 읽어라]
//     카드 §1 은 잡음을 `_fbm(SEED + 오프셋, day)` 로 적었다(기온 편차와 **같은** 잡음). 재 보니 안 된다.
//     `_fbm` 은 매끄러운 잡음이고 가장 센 주기가 P1=23일이라 한 달(30일) 안에 **독립한 마루가 1.3개**
//     밖에 없다. 그래서 분위수를 정확히 맞춰도 **짧은 눈금에서 달이 통째로 마른다**:
//       (씨앗 20260831 · 앵커 부여 · 월별 강수일 비율의 최대오차)
//         A  `_fbm`(3옥타브)      3년 **−28.7%p** · **비가 0일인 달 4개**(1·4·11·12월) · 83일/년
//         B  `_vnoise` P3=4.3     3년   26.5%p · 0일인 달 0 · 109일/년
//         B2 `_vnoise` P2=9.5     3년   25.9%p · 0일인 달 0 · 110일/년
//         C  `_h` 균등(일별 독립)  3년   **9.2%p** · 0일인 달 0 · 108일/년
//       200년으로 늘리면 A 도 105.6일/년(앵커 105.5)으로 맞는다 — **긴 눈금에서는 넷 다 맞는다.**
//       사람이 사는 눈금은 3년이다(게임 1년 = 실시간 6일). 4년을 이어 붙여도 12월에 비를 한 번도
//       못 본 마을이 생기면 그건 기후가 아니라 버그로 보인다.
//     ⇒ **C 를 쓴다**: 잡음 대신 `_h` — **그 잡음이 딛고 선 바로 그 해시** — 를 날마다 한 번 뽑는다.
//       이론 바닥: 완전 독립 · p=0.28 · 90일(3년치 한 달)이면 1σ = 4.7%p ⇒ 실측 9.2%p 는 2σ 로
//       **이항분포 바닥에 붙어 있다.** 이보다 더 맞추는 건 불가능하고, 맞췄다면 그건 속인 것이다.
//     ⇒ 덤: `_fbm` 을 쓰려면 필요했던 **경험 분위수 표**(200년 표본 정렬 · 초안에 있었다)가 통째로
//       사라진다. `_h` 는 이미 0..1 균등이라 문턱이 **곧 p** 다. 잴 것이 없으면 어긋날 것도 없다.
//       (분위수 표가 왜 필요했는지는 보고 §0-ⓐ: 이 잡음은 정규가 아니라 유계 −0.9202..0.9440 이라
//        `mean + z·sd` 로 잡은 문턱이 0.012~0.022 어긋났고 그게 비 오는 날 1.5~2.5%p 였다.)
//     ★대신 **잃은 것을 적어 둔다: 비가 이어지지 않는다.** 오늘 왔다고 내일이 더 올 것 같지 않다.
//       실제 비는 며칠씩 이어진다 — 그런데 **앵커 열둘은 "며칠이나 오는가"만 담고 "얼마나
//       이어지는가"는 담지 않는다.** 이어짐을 넣으려면 그 길이를 어디선가 지어내야 하고, 그건
//       지형이 아니라 소원이다(그리고 A 는 바로 그 소원을 넣었다가 12월을 말렸다). 지속 앵커는 회부.
// ═══════════════════════════════════════════════════════════════════════════

// ── 앵커 — **기상청 평년값 월별 강수일수**(0.1mm 이상). 새 수는 이 열둘뿐이다. ──────
//   관측소: **부여**(충남 부여군 — 송국리 유적이 있는 그 고장이다. 서울보다 이 세계에 가깝다).
//   기간: **1991~2020 평년값** · 출처: 기상청 "Climatological Normals of Korea (1991~2020)"
//         https://data.kma.go.kr/normals/  (표 확인: en.wikipedia.org/wiki/Buyeo_County 기후표 —
//         같은 표의 강수량(mm)이 7월 295.7 · 8월 284.8 로 장마를 그대로 보인다)
//   ⇒ 여름 장마도 겨울 건조도 **이 표에서 저절로 나온다** — 계절 손잡이를 따로 만들지 않는다.
//   ⚠**손잡이가 아니다**: 환경변수로 못 바꾼다. 세계의 기후를 바꾸려면 이 표를 바꾸고 출처를 다시 적어라.
const PRECIP_DAYS = [6.9, 5.8, 7.6, 7.9, 7.9, 9.3, 14.7, 13.5, 8.7, 5.9, 8.4, 8.9];   // 1월…12월 (연 105.5일)
// 그레고리력 달 길이 — **앵커가 아니라 달력**이다(평년 30년에 윤년이 여덟 번이라 2월은 28.27;
//   28.25 로 써도 p 가 0.0001 안에서 같다 — 실측). 이걸로 "며칠"을 "얼마나 자주"로 옮긴다.
//   ★[T570] 켬: 게임 달 = **진짜 달**(달력 정본 · 윤년이면 2월 29일)이라 이 표와 길이가 같다.
//   ⚠끔(`T570_CALENDAR=0`): 게임 달의 길이는 이것과 다르다(겨울 31·32·32 — 옛 `crops.monthOf` 가 겨울 95일을 셋으로 나눈다).
//     그래도 p 는 **하루가 비 올 확률**이라 옳다 — 게임 2월이 32일이면 비 오는 날이 6.6일로 늘 뿐이다.
//     그래서 하네스는 "며칠"이 아니라 **비율**을 잰다.
const _MONTH_DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
/** 그 달에 비가 오는 날의 비율 p(0..1) — 평년 강수일수 ÷ 그 달의 날 수. */
function precipPOfMonth(month) {
  const i = (((month | 0) - 1) % 12 + 12) % 12;
  if (_paleo.on) return PRECIP_DAYS[i] * _paleo.pMult / _MONTH_DAYS[i];   // ★[T484 ③] 켬만 — 앵커 열둘에 배수(T98 문법)
  return PRECIP_DAYS[i] / _MONTH_DAYS[i];
}

// ── 씨앗 오프셋 — 기온 편차(SEED)·일교차(SEED+40507)와 **같은 문법**의 세 번째 줄기 ──
//   ⚠`_h(seed, i)` 는 seed 와 i 를 XOR 로 섞는다 ⇒ 오프셋이 작으면 다른 줄기와 낮은 비트가 겹친다.
//     40507 과 충분히 떨어진 수를 골랐고, 겹치지 않음을 하네스가 잰다(`test-weather` 씨앗 절).
const PRECIP_OFF = 90107;

/**
 * 그날의 강수 강도 0..1. **0 = 안 온다.**
 *   u = `_h(SEED + PRECIP_OFF, 절대 게임일)` — 0..1 균등 · 날마다 독립 · 결정론(씨앗 같으면 어디서나 같다).
 *   오는 날: `u < p`(그 달 앵커 비율) ⇒ 오는 날의 비율이 **정확히 p** 다(문턱을 따로 잴 것이 없다).
 *   강도: 문턱을 넘은 몫 `p − u` ⇒ 0..p.
 * ★강도의 눈금이 달마다 다른 건 규칙을 하나 더 만든 게 아니라 **같은 표에서 저절로 나온 것**이다:
 *   장마철은 p 가 커서 넘칠 폭도 크다(7월 최대 0.474 vs 1월 0.223 — 평균으로 2.1배).
 *   ⚠다만 **강도에는 앵커가 없다.** 같은 기상청 표의 강수량(mm) 열둘이 그 앵커인데
 *     (7월 20.0mm/일 vs 1월 3.6mm/일 = **5.6배**) 그걸 들이면 새 수가 열둘 더 는다 ⇒ 회부.
 *     지금 값은 **방향만 맞고 세기는 덜하다**(2.1배 < 5.6배). 이 줄을 지우지 말고 회부를 처리해라.
 *   ⚠약한 날(u 가 p 에 거의 닿는 날)은 화면에 거의 안 보인다 — 그게 맞다. 앵커가 세는 날은
 *     **0.1mm 이상**이고 그중 상당수가 실제로도 흩뿌리다 마는 날이다.
 * ★달은 `crops.monthOf` **정본**을 부른다(새 시계·새 매핑 금지 — T58a 가 세운 그 함수다).
 *   ⚠못 물면 **0 을 돌려준다.** 거짓말을 지어내지 않는다(이 모듈 머리의 `available()` 과 같은 규약).
 * ★한 슬롯 메모 — 한 존의 모든 사람이 같은 날을 묻는다(`outdoorCold` 의 `_oc` 와 같은 수법).
 */
let _Crops;
function _C() {
  if (_Crops === undefined || _Crops === null) {
    try { const m = require('./crops'); _Crops = (m && typeof m.monthOf === 'function') ? m : false; }
    catch (e) { _Crops = false; }
  }
  return _Crops || null;
}
let _pc = null;
function precipAt(day) {
  const d = day | 0;
  if (_pc && _pc.d === d && _pc.seed === CFG.SEED) return _pc.v;
  let v = 0;
  const C = _C();
  if (C) {
    let m = 0;
    try { m = C.monthOf(d); } catch (e) { m = 0; }
    if (m >= 1 && m <= 12) {
      const p = precipPOfMonth(m);
      const u = _h(CFG.SEED + PRECIP_OFF, d);
      if (u < p) v = +Math.max(0, Math.min(1, p - u)).toFixed(4);
    }
  }
  _pc = { d, seed: CFG.SEED, v };
  return v;
}
/** 그날 밤의 일교차 배율(AMP_MIN..AMP_MAX) — 맑은 밤은 더 춥다. */
function ampMultOf(day) {
  const m = 1 + CFG.AMP_NOISE * _vnoise(CFG.SEED + 40507, day, CFG.AMP_P);
  return Math.max(CFG.AMP_MIN, Math.min(CFG.AMP_MAX, m));
}

/**
 * 그 시각의 기온(℃). elevKm 을 주면 econ 감률(−6.5℃/km)이 그대로 걸린다.
 * ★[천장 해제] 이제 감률이 **살아 있다** — 목표점이 1 에서 안 잘리므로 높은 곳이 실제로 더 빨리 언다.
 * ⚠다만 **이 세계의 산은 35m 다**(산 높이 캐논) ⇒ 0.23℃ ≈ 추위 0.007. 모델은 살았지만 세계가 낮다.
 *   게다가 바위 셀은 **통행 불가**라 플레이어가 설 수 있는 고도가 지금은 0 뿐이다 — 회부.
 */
// ★★[T484 ① 2026-09-28] **기온은 시각의 연속 함수다** — 종전 식은 `mean(정수 일) + 편차(정수 일) ± 일교차·배율`(낮/밤 **깃발**)이라
//   하루 두 번 뛰었다: 낮→밤(phase 0.7)에 일교차 두 배(5.5~14.5℃) · 하루 경계에 연주기·편차·배율의 한 날 치.
//   ⇒ 이제 econ 정본의 **시각 코사인**(`temperatureAt(day, hourFrac)` — econ 이 "생활층 인계용"으로 이미 내보낸 그것)을 그대로 쓴다.
//     t = **분수 게임일**(정수부 = 그날 · 소수부 = 그날 안의 시각) · 연주기·편차·배율은 t 로(`_vnoise` 는 분수를 받는다 — C¹) ·
//     일교차 = econ 의 시각 항(`temperatureAt(t, hf) − temperatureAt(t, null)`)에 그날의 배율(`ampMultOf`)을 곱한다(같은 자리 · 새 수 0).
//   ★시각(hourFrac)은 **세계 phase** 에서 온다: 정오 = 낮의 한가운데(`dayPhaseRatio/2`) · 자정 = 밤의 한가운데(`(1+dayPhaseRatio)/2`) —
//     둘 다 `WORLD.dayPhaseRatio` 하나에서 유도(두 점은 정확히 반날 떨어진다 · 새 수 0). econ 의 hourFrac 0 = 자정 최저 · 0.5 = 정오 최고.
function _dayPhaseRatio() { try { return require('./zone-config').WORLD.dayPhaseRatio; } catch (e) { return null; } }
const PH = (() => { const r = _dayPhaseRatio(); const q = Number.isFinite(r) ? r : 0.7; return { noon: q / 2, midnight: (1 + q) / 2 }; })();
/** 세계 phase(0..1) → econ hourFrac(0 = 자정 · 0.5 = 정오). */
function hourFracOf(phase) { const f = (phase - PH.midnight) % 1; return f < 0 ? f + 1 : f; }
/** ★정본 — 분수 게임일 t 의 기온(℃). `phase` 를 안 주면 t 의 소수부가 곧 세계 phase 다. */
function tempAtT(t, elevKm, phase) {
  const E = _E(), a = _anchors();
  if (!E || !a || !Number.isFinite(t)) return null;
  const ph = Number.isFinite(phase) ? phase : (t - Math.floor(t));
  const hf = hourFracOf(ph), el = elevKm || 0;
  const mean = E.temperatureAt(t, null, el);
  return mean + devCOf(t) + (E.temperatureAt(t, hf, el) - mean) * ampMultOf(t);
}
/** 옛 호출 규약 — 그날(정수 일)의 **낮 = 정오 · 밤 = 자정** 값(눈·상함처럼 "그날 최고/최저"를 묻는 자리). 같은 곡선의 두 점이다. */
function tempAt(day, night, elevKm) {
  // 그날(day) 의 연주기·편차·배율 + 시각만 정오/자정 — 종전 식(`mean ± 일교차·배율`)과 **같은 수**다(econ 코사인 cos 0 = 1 · cos π = −1).
  return tempAtT(day, elevKm, night ? PH.midnight : PH.noon);
}
/** 불·실내·마을을 **뺀** "얼마나 추운가"(옷의 단열 `insC` ℃ 는 반영). ★**1 을 넘을 수 있다**(하한만 0).
 *  ★한 틱의 모든 플레이어가 **같은 (day, night, elev)** 를 묻는다 ⇒ 한 칸 메모로 적중률이 사실상 100%다.
 *    (fBm 3옥타브 + 코사인을 플레이어 수만큼 다시 도는 건 그냥 낭비다. 결과는 순수 함수라 같다.) */
let _oc = { k: null, v: null };
// ★[T484 ①] `dayT`(분수 게임일)·`phase`(세계 phase)가 오면 **그 시각**의 기온 — 안 오면 옛 규약(그날 정오/자정) 그대로.
function _tNow(day, night, elevKm, dayT, phase) { return Number.isFinite(dayT) ? tempAtT(dayT, elevKm, phase) : tempAt(day, night, elevKm); }
function outdoorCold(day, night, elevKm, insC, dayT, phase) {
  const k = `${day}|${night ? 1 : 0}|${elevKm || 0}|${insC || 0}|${Number.isFinite(dayT) ? dayT : ''}|${Number.isFinite(phase) ? phase : ''}`;
  if (_oc.k === k) return _oc.v;
  // ★[옷 티어] `insC` = 옷의 단열(℃). 고도 감률·날씨 편차와 **같은 단위**라 그냥 더한다.
  const t0 = _tNow(day, night, elevKm, dayT, phase);
  const t = (t0 === null) ? null : t0 + (+insC || 0);
  const v = (t === null) ? null : +Math.max(0, coldOfC(t)).toFixed(4);   // ★상한 없음(천장 해제)
  _oc = { k, v };
  return v;
}

// ── 겉은 계단(§8.3) — 표시는 6단계. 몸 상태가 아니라 **바깥 날씨**의 이름이다 ──
//   ★[천장 해제] 1 초과 구간이 생겼다 — 화면이 "여기서 더 갈 데가 있다"고 말해야 한다.
//   ⚠맨 윗칸을 '살인적'이라 부르지 않는다.
//     ★★[캐논 변경 2026-09-01 · T44] 이제 **추위 극단은 HP 를 깎는다**("아사 폐지" 폐기).
//       그래도 이름은 안 바꿨다 — 이 표는 **바깥 날씨**의 이름이지 몸의 예후가 아니고,
//       옷·불·실내·마을이 그 사이에 있어서 "맹추위 = 죽는다"가 아니기 때문이다.
//       그리고 HP 를 깎는 일은 여기가 아니라 `body.js extremeHpRate` **합산기 하나**가 한다
//       (이 모듈은 목표점만 만든다 — 추위발 감소를 여기에 두면 그게 두 번째 합산기다).
const _LABELS = [[0.15, '포근함', '🌤'], [0.35, '선선함', '🍃'], [0.55, '쌀쌀함', '🌬'],
                 [0.75, '추움', '❄️'], [0.92, '혹한', '🥶'], [1.05, '맹추위', '🧊'],
                 [99, '살을 에는 추위', '🩸']];
function label(cold) {
  for (const [at, ko, emo] of _LABELS) if (cold < at) return { ko, emo };
  return { ko: '살을 에는 추위', emo: '🩸' };
}
function hintOf(day, night, elevKm, dayT, phase) {
  const cold = outdoorCold(day, night, elevKm, 0, dayT, phase);
  if (cold === null) return null;
  const L = label(cold);
  // ℃ 도 같이 낸다 — 화면이 "왜 추운지"를 말할 수 있어야 한다(비네트 원인 축과 같은 규약).
  return { cold, ko: L.ko, emo: L.emo, night: !!night, tempC: +_tNow(day, night, elevKm, dayT, phase).toFixed(1) };
}

// ═══ ★★[T484 ② 2026-09-28] 존별 평년값 → econ `CLIMATE` — **유도는 여기 한 곳** ═══════════════════════════════════
//   원자료 = `server/climate-normals.js` CLIMATE_NORMALS(관측소 30년 평년 월평균·월평균최고·월평균최저 열둘 · 출처 URL).
//   유도(새 수 0 — 12·2·½ 은 셈이다):
//     연평균   = 월평균 열둘의 평균(기상청·CMA·JMA 표의 "Year" 칸과 같은 정의)
//     연진폭·위상 = 월평균 열둘의 **1차 조화**(달 한가운데 = (k+½)/12 해) — 진폭 = √(a²+b²) · 최난 = atan2(b, a) · 최한 = 최난 + ½ 해
//     일교차   = (월평균최고 − 월평균최저)/2 의 열둘 평균(econ 의 ±diurnalAmp 코사인과 같은 뜻 — 하루 폭의 반)
//   ⚠최한 위상: 끔(`T570_CALENDAR=0`)은 **표만**이다 — econ 식에 doy 315 가 글자로 박혀 있다. ★[T570] 켬이면 econ 연주기가 달력 `solarFrac`
//     (1월 1일 기점)을 읽으므로 `coldFrac` 을 `applyZoneClimate` 가 얹는다(`apply: true` 존만 — 한반도는 `apply: false` 그대로).
function deriveClimate(n) {
  if (!n || !Array.isArray(n.mean) || n.mean.length !== 12) return null;
  const K = 12;
  let s = 0, a = 0, b = 0, d = 0;
  for (let k = 0; k < K; k++) {
    const x = 2 * Math.PI * (k + 0.5) / K;
    s += n.mean[k]; a += n.mean[k] * Math.cos(x); b += n.mean[k] * Math.sin(x);
    if (Array.isArray(n.max) && Array.isArray(n.min)) d += (n.max[k] - n.min[k]) / 2;
  }
  a *= 2 / K; b *= 2 / K;
  const warm = ((Math.atan2(b, a) / (2 * Math.PI)) % 1 + 1) % 1;   // 해 안 자리(1월 1일 = 0)
  return { zoneLatBase: s / K, annualAmp: Math.hypot(a, b), diurnalAmp: d / K, warmFrac: warm, coldFrac: (warm + 0.5) % 1 };
}

// ═══ ★★[T484 ③ 2026-09-28] 청동기 고기후 오프셋 — 손잡이 `T484_PALEO`(기본 **끔** · 끔 = 비트 동일) · **값은 재민 판정 칸(#81)** ═══
//   재민 확정(09-28) "청동기 온난습윤을 고려한다" — 그 **크기**를 논문에서 읽는다(송국리 ≈ 3,000~2,500 BP).
//   ★기준에 주의: 우리 평년값은 **1991~2020** 이다(산업화 뒤 +1℃ 안팎이 이미 들었다). 같은 청동기가
//     산업화 전(1800~1900) 대비로는 따뜻하고(+0.46) 오늘 평년 대비로는 조금 춥다(−0.54). 표는 **오늘 평년 대비**다(존 평년값에 더하니까).
//   정량 행(Δ℃ · ΔP%)만 범위를 만든다 · 정성 행은 방향만 적는다. 권고 = 정량 범위의 가운데(PM · 재민 거부권).
const PALEO_SOURCES = [
  { id: 'Kaufman2020', dC: 0.7 - 0.08 * 3 - 1.0, dP: null, kind: 'GMST(Temp12k)',
    cite: '"0.7 °C (0.3, 1.8) warmer than the 1800–1900" · "−0.08 °C per 1000 years" · "past decade ... 1 °C higher"',
    url: 'https://www.nature.com/articles/s41597-020-0530-7', note: '6 ka +0.7 → 3 ka +0.46(1800–1900 대비) → 2011–19 대비 −0.54' },
  { id: 'Song2026', dC: 11.0 - 11.2, dP: null, kind: 'brGDGT MAT · 화북 동부',
    cite: '"average MAT of 11°C from ∼3440 cal. yr BP" · 현재 11.2℃', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0031018225008156',
    note: '3.2 · 2.8 · 2.5 ka 냉각 사건이 그 평균 안에 있다' },
  { id: 'Lee2024', dC: null, dP: [(1385 - 1475) / 1475 * 100, (1545 - 1475) / 1475 * 100], kind: '화분 Tann/Pann · 광양(섬진강 하구)',
    cite: '"Pann was 1,385–1,545 mm" · "Tann ... gradually decreased"', url: 'https://www.sciencedirect.com/science/article/pii/S0341816224002297',
    note: 'Tann 최고 ≈4000 BP 뒤 감소 · 건조 사건 2800 BP · 강수는 홀로세 평균(≈1,475mm) 대비 폭' },
  { id: 'Park2023', dC: null, dP: null, kind: '화분·숯 · 한반도 서해안', cite: '"cooling events at 2.8 ka and 2.3 ka"', url: 'https://www.nature.com/articles/s41598-023-42551-x',
    note: '2600~1700 BP 건조(정성 · 수 없음)' },
  { id: 'Park2019', dC: null, dP: null, kind: '화분 · 한반도', cite: '"abrupt drying and/or cooling event"', url: 'https://www.nature.com/articles/s41598-019-47264-8',
    note: '2.8 ka 사건 · 송국리 문화에 위협(정성)' },
  { id: 'Geng2024', dC: null, dP: null, kind: '화분 계절 기온 · 동북 중국', cite: '"2.5 ka" · "amplitude variation up to 3 °C"', url: 'https://www.sciencedirect.com/science/article/abs/pii/S0031018224003808',
    note: '사건 폭(최한월) — 연평균 오프셋이 아니다' },
];
function paleoRange() {
  const C = PALEO_SOURCES.map((r) => r.dC).filter((x) => Number.isFinite(x));
  const P = [].concat(...PALEO_SOURCES.map((r) => r.dP).filter(Boolean));
  const mid = (xs) => (xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0);
  return { dC: [Math.min(...C), Math.max(...C)], dP: P.length ? [Math.min(...P), Math.max(...P)] : [0, 0], recC: mid(C), recP: mid(P) };
}
const T484_PALEO = process.env.T484_PALEO === '1';
const _paleo = { on: T484_PALEO, dC: 0, pMult: 1 };
if (T484_PALEO) { const R = paleoRange(); _paleo.dC = R.recC; _paleo.pMult = 1 + R.recP / 100; }
/**
 * 존 기동 때 한 번 — econ `CLIMATE` 에 그 존의 평년값(`apply` 인 존만 · 또는 `opts.forceNormals`)과 고기후 Δ(손잡이 켬만)를 얹는다.
 * ★표에 없는 존 · `apply: false` · 손잡이 끔이면 **아무것도 안 바꾼다**(비트 동일). econ 은 이 객체를 호출마다 읽는다(econ 파일 무수정 —
 *   econ 주석 그대로의 "존 생성 시 오버라이드").
 */
function applyZoneClimate(zoneId, opts) {
  const E = _E(); if (!E) return null;
  let N = null; try { N = require('./climate-normals').CLIMATE_NORMALS[zoneId] || null; } catch (e) { N = null; }
  const use = !!(N && (N.apply || (opts && opts.forceNormals)));
  const D = use ? deriveClimate(N) : null;
  if (!D && !_paleo.on) return { zoneId, changed: false };
  if (D) { E.CLIMATE.zoneLatBase = D.zoneLatBase; E.CLIMATE.annualAmp = D.annualAmp; E.CLIMATE.diurnalAmp = D.diurnalAmp; }
  // ★[T570] 켬: 최한 위상도 얹는다 — econ 연주기가 달력 `solarFrac`(그해 1월 1일 기점 0..1)을 읽으니 1차 조화의 `coldFrac`(같은 기점)을
  //   **그대로** 꽂을 자리가 생겼다(T484 ② 회부 "최한 위상은 표만" 이 닫힌다). 끔이면 econ 이 이 필드를 안 읽는다(비트 동일).
  if (D && require('./calendar').ON) E.CLIMATE.coldFrac = D.coldFrac;
  if (_paleo.on) E.CLIMATE.zoneLatBase += _paleo.dC;
  _anch = null; _oc = { k: null, v: null }; _pc = null;
  return { zoneId, changed: true, normals: !!D, paleo: _paleo.on, CLIMATE: Object.assign({}, E.CLIMATE) };
}

module.exports = {
  CFG, available, bindEcon, anchors,
  // ★[T484] 연속 시각 · 존 평년값 · 고기후
  tempAtT, hourFracOf, PH, deriveClimate, applyZoneClimate, PALEO_SOURCES, paleoRange, T484_PALEO,
  coldOfC, devCOf, ampMultOf, tempAt, outdoorCold, label, hintOf,
  // ★[T98] 강수 정본 — 값 하나(`precipAt`)와 그 재료(하네스·보고가 표를 만들 수 있게)
  precipAt, precipPOfMonth, PRECIP_DAYS, PRECIP_OFF,
  _internals: { _h, _vnoise, _fbm, _coldPts, _MONTH_DAYS },
};
