// === server/calendar.js — 달력 정본 하나: 그레고리력 (T570 · 재민 10-02) ================================
//
// ★재민 10-02: *"지금 날짜가 12월제가 아니던데 제대로 고쳐야 한다 · 윤년도 세고 · 정확하게 · 시작은 3월 1일"*
//   ⇒ 게임일 0 = **1년 3월 1일**. 달은 실제 달 길이 · 윤년은 4/100/400 · 계절은 **달에 붙는다**
//     (기상청: 봄 3~5 · 여름 6~8 · 가을 9~11 · 겨울 12~2).
//   1년은 3~12월 306일뿐이고(1월·2월이 없다 — 기점이 3월 1일 · 재민 값) 첫 2월 29일은 **4년**이다.
//
// ★새 수 0 — 달 길이·윤년 규칙·기상청 계절은 현실 값이다. 아래 산수는 그레고리력을 3월 기점으로 세는
//   잘 알려진 셈(400년 = 146,097일 주기 · 3월~2월 한 "해"로 접으면 2월이 맨 끝이라 윤일이 꼬리에 붙는다)이다.
//
// ★사본 0: econ(`sim/economy-sim-v2.js` · 번들은 `build-econ-bundle` 가 이 파일을 같이 싣는다 → 랩 인라인) ·
//   `server/events.js`(seasonOf·calendarOf·yearDaysOf·seasonStartOf · 화면이 받는 달력) · `crops.monthOf` ·
//   `freshfish` · 기온(`temperatureAt` 의 연주기 위상 = `solarFrac`)이 **전부 이 파일의 함수를 부른다**.
//
// ★되돌림 손잡이 `T570_CALENDAR=0` — 옛 달력(1년 365일 · 0~89 봄 · 90~179 여름 · 180~269 가을 · 270~364 겨울)을
//   **글자 그대로** 쓴다(`legacySeasonOf`). 3시드 다섯째 판 바이트 동일이 그 게이트다.
//   ⚠손잡이는 **로드 때 한 번** 읽는다(계절은 하루에 수만 번 불린다 — 매번 env 를 읽지 않는다).
//     하네스가 두 판을 견줄 땐 프로세스를 따로 띄운다(`scripts/test-calendar.js` ⑦).
//
// ⚠라이브 DB 의 절대 게임일은 그대로 읽힌다 — 옛 day 3341 은 그날의 날짜로 **보일 뿐** 저장은 0(재민 10-02 · 초기화는 따로).
'use strict';

const ON = !(typeof process !== 'undefined' && process.env && process.env.T570_CALENDAR === '0');

// ── 그레고리력 ──────────────────────────────────────────────────────────────────────────────
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];   // 1월…12월(평년) — 달력 그 자체
const MONTH_KO = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
function isLeap(y) { return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0; }
function yearLen(y) { return isLeap(y) ? 366 : 365; }
function monthLen(y, m) { return m === 2 && isLeap(y) ? 29 : MONTH_DAYS[m - 1]; }
const _fdiv = (a, b) => Math.floor(a / b);
const ERA = 146097;                    // 400년 = 146,097일(윤년 97번) — 위 규칙의 귀결이지 새 수가 아니다

// 기점 상수 = 0년 3월 1일에서 1년 3월 1일까지의 날수(그 사이 2월 = 1년 2월 · 1년은 평년 ⇒ 365). **유도**한다.
function _daysFromMar0(y, m, d) {        // 0년 3월 1일 = 0 으로 센 날수(3월 기점 "해")
  const yy = m <= 2 ? y - 1 : y;
  const era = _fdiv(yy, 400);
  const yoe = yy - era * 400;                                            // 0..399
  const mp = m > 2 ? m - 3 : m + 9;                                      // 3월=0 … 2월=11
  const doyM = _fdiv(153 * mp + 2, 5) + d - 1;                           // 3월 1일부터
  const doe = yoe * 365 + _fdiv(yoe, 4) - _fdiv(yoe, 100) + doyM;        // 0..146096
  return era * ERA + doe;
}
const EPOCH = _daysFromMar0(1, 3, 1);    // = 365 (게임일 0 = 1년 3월 1일)

/** 게임일 ← (연, 월 1~12, 일). 1년 3월 1일 = 0 · 그 앞은 음수(1년 1월 1일 = −59). */
function dayOf(y, m, d) { return _daysFromMar0(y | 0, m | 0, d | 0) - EPOCH; }

/**
 * 게임일 → 날짜. 정수가 아니면 내림한 날로 답한다.
 * @returns {{year, month, dom, doy, yearLen, isLeap}}  doy = 그해 1월 1일부터 0 기점(1년 3월 1일 = 59)
 */
function dateOf(day) {
  const z = Math.floor(+day || 0) + EPOCH;
  const era = _fdiv(z, ERA);
  const doe = z - era * ERA;                                                                  // 0..146096
  const yoe = _fdiv(doe - _fdiv(doe, 1460) + _fdiv(doe, 36524) - _fdiv(doe, 146096), 365);   // 0..399
  const doyM = doe - (365 * yoe + _fdiv(yoe, 4) - _fdiv(yoe, 100));                           // 3월 1일부터 0..365
  const mp = _fdiv(5 * doyM + 2, 153);                                                        // 0..11
  const dom = doyM - _fdiv(153 * mp + 2, 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = yoe + era * 400 + (month <= 2 ? 1 : 0);
  const leap = isLeap(year);
  // 그해 1월 1일부터: 1·2월이면 3월 기점 doyM 에서 (3월~12월 306일)을 뺀다
  const doy = month <= 2 ? doyM - 306 : doyM + 59 + (leap ? 1 : 0);
  return { year, month, dom, doy, yearLen: leap ? 366 : 365, isLeap: leap };
}

// ── 계절 = 달(기상청) ──────────────────────────────────────────────────────────────────────
const SEASON_OF_MONTH = [null, 'winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const SEASON_FIRST_MONTH = { spring: 3, summer: 6, autumn: 9, winter: 12 };
const KO_SEASON = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
function seasonOfMonth(m) { return SEASON_OF_MONTH[m | 0] || 'spring'; }

// ★옛 달력(손잡이 0) — 이 줄이 T570 전의 econ `seasonOf` 글자 그대로다(`day % 365` · 경계 90/180/270).
//   음수 처리도 옛 두 벌의 차이를 그대로 둔다: econ 은 `day % 365`(음수면 음수 → 'spring'), events 는 양수로 접었다.
function legacySeasonOf(day) {
  const d = day % 365;
  if (d < 90) return 'spring';
  if (d < 180) return 'summer';
  if (d < 270) return 'autumn';
  return 'winter';
}
function seasonOf(day) {
  if (!ON) return legacySeasonOf(day);
  return seasonOfMonth(dateOf(day).month);
}
/** 그 날이 든 계절의 첫날(게임일). 겨울 1·2월이면 **전해** 12월 1일이다. */
function seasonStart(day) {
  const t = dateOf(day);
  const m0 = SEASON_FIRST_MONTH[seasonOfMonth(t.month)];
  return dayOf(m0 === 12 && t.month <= 2 ? t.year - 1 : t.year, m0, 1);
}
/** 그 날이 든 계절의 길이(일) — 봄 92 · 여름 92 · 가을 91 · 겨울 90(윤년 2월이면 91). */
function seasonLen(day) {
  const s = seasonStart(day), t = dateOf(s);
  const m1 = t.month + 3 > 12 ? t.month - 9 : t.month + 3;
  const y1 = t.month + 3 > 12 ? t.year + 1 : t.year;
  return dayOf(y1, m1, 1) - s;
}

/**
 * 해 안 위치 0..1 — (그해 1월 1일부터 날수 + 0.5) ÷ 그해 길이. 기후·일교차·해 길이가 이걸 읽는다.
 *   ★윤년에도 계절이 하루씩 밀리지 않는다(해마다 0..1 로 다시 접는다). 분수 날이면 그날 안의 몫을 더한다
 *     (`weather._anchors` 가 0.25일 간격으로 곡선을 훑는다 — 그날 안에서도 연속이어야 한다).
 *   ★12/31 → 1/1 은 1 → 0 으로 접히지만 1 과 0 은 해의 같은 자리다(코사인의 주기).
 */
function solarFrac(day) {
  const x = +day || 0, f = x - Math.floor(x);
  const t = dateOf(x);
  return (t.doy + f + 0.5) / t.yearLen;
}

/**
 * 봄 기점 해 — 그 날 앞의 가장 가까운 **3월 1일이 든 해**(1·2월이면 전해). 게임일 0 이 1년 3월 1일이라 1년 = 0~364 다.
 *   ★"겨울이 끝나면 다시 차는" 해마다의 장부(열매 · 채집 예산)가 이 열쇠를 쓴다 — 달력 연도(1월 1일 기점)로 세면
 *     한겨울(1월 1일)에 해가 바뀌어 겨울 비움이 새 해 열쇠를 먼저 잡고, 봄에 다시 안 찬다.
 */
function springYearOf(day) { const t = dateOf(day); return t.month <= 2 ? t.year - 1 : t.year; }

/** 화면 한 줄 — "1년 3월 1일 (봄)". */
function labelOf(day) {
  const t = dateOf(day);
  return `${t.year}년 ${t.month}월 ${t.dom}일 (${KO_SEASON[seasonOfMonth(t.month)]})`;
}

module.exports = {
  ON, EPOCH, MONTH_DAYS, MONTH_KO, SEASON_OF_MONTH, SEASON_FIRST_MONTH, KO_SEASON,
  isLeap, yearLen, monthLen, dayOf, dateOf, seasonOfMonth, seasonOf, legacySeasonOf,
  seasonStart, seasonLen, solarFrac, springYearOf, labelOf,
};
