// === server/crop-cal.js — 작물 철 고증 표 (T594 · 농사로 1차) ======================================
//
// ★왜 있나 — 달력(T570)이 생기자 작물 철이 드러났다(T583 · 족보 548): 카탈로그 `성장일(활동)` 이
//   실제 파종→수확 기간보다 짧아서 벼가 7월에 익고 팥이 7월 말에 익는다. 이 파일은 그 기간의 **고증 원문**이다.
//   `server/crops.js` 가 손잡이 `T594_CROP_CAL`(끔 기본)을 켰을 때만 이 표에서 성장일을 **유도**한다.
//
// ★★새 수 0 — 이 파일에 적힌 것은 **출처의 글자**(파종창 · 수확창)뿐이다. 성장일은 여기 없다.
//   유도 규칙 하나(`crops.js calDaysOf`): **파종창 가운데날에 심은 밭이 수확창 가운데날에 익는 활동일.**
//     · 1년생 = 두 가운데날 사이 날수(휴면이 없다).
//     · 월동(보리·밀·마늘) = 게임의 휴면·춘화 규칙(T99)으로 센 활동일 — 가을은 뿌리내림, 익음 시계는
//       겨울이 끝난 다음 날부터 돈다. 그래서 휴면 모델이 바뀌어도 수확은 실제 가운데날에 그대로 떨어진다.
//   ⚠가운데날은 순(旬)을 날로 푼 범위의 한가운데다 — 상순 1~10일 · 중순 11~20일 · 하순 21일~말일 ·
//     달만 적힌 것은 그 달 전체 · "5.15" 처럼 날이 적힌 것은 그 날.
//
// ★작형 고르기 — 게임은 작물마다 성장일이 **하나**다. 그래서 작형도 하나만 고른다:
//   ⓐ 노지(시설·터널 작형은 안 쓴다 — 청동기 밭이다) ⓑ 게임의 **첫 파종 묶음**(카탈로그 `sowMonths` 의
//   첫 덩이)과 파종창이 겹치는 작형 ⓒ 지역은 중부(한반도 기후 정본 관측소 = 부여 · `climate-normals`).
//   두 번째 파종 묶음(가을배추·가을무·가을메밀 …)은 작형이 다르면 기간도 다르다 — 그 차이는 보고 §회부.
//
// ★표에 없는 작물은 **카탈로그 그대로**다(손잡이를 켜도): 다년생 넷(재생 주기는 별도 축 · T91 회부) ·
//   시설 작형만 출처가 있는 둘(오이·참외) · 농사로 1차 출처를 못 찾은 열하나 · 출처 판독이 흔들린 하나(수수).
//
// ⚠파종창(`sowMonths`)은 바꾸지 않는다 — 재민 xlsx 의 값이다. 게임 창이 실제보다 이르면(조 4월 ↔ 실제 6월)
//   성장일을 고증으로 맞춰도 수확이 그만큼 이르다. 그 잔차는 보고 원인 표의 셋째 칸이다(회부).
'use strict';

const WS = (n) => `https://www.nongsaro.go.kr/portal/ps/psb/psbl/workScheduleDtl.ps?menuId=PS00087&cntntsNo=${n}`;
const RICE_HARVEST = 'https://www.nongsaro.go.kr/portal/ps/psz/psza/contentSub.ps?menuId=PS00078&pageIndex=1&pageSize=10&cntntsNo=207071&sType=sCntntsSj';

// 열: id · 작형 · 지역 · 심는 일(파종/이앙/아주심기 — 게임의 "심기"에 해당하는 실제 일) · 파종창 · 수확창 · 출처 · 비고
//   글자는 출처의 표기를 **범위 끝이 달을 갖도록만** 고쳐 적었다("6월 중~하순" → "6월 중순~6월 하순").
const ROWS = [
  // ── 곡물 ──
  { id: 'rice', kind: '기계이앙 중모', region: '중북부(이앙) · 중부(수확)', from: '이앙',
    sow: '5.15~6.10', harvest: '10월 상순~10월 중순', src: [WS(30697), RICE_HARVEST],
    note: '게임 파종창 5~6월 = 이앙 철(T583 대조와 같은 짝) · 못자리 파종(4.15~5.10)은 게임에 없다' },
  { id: 'barley', kind: '일반보리', region: '중부 평야지', from: '파종',
    sow: '10월 중순', harvest: '5월 하순~6월 상순', src: [WS(30712)],
    note: '월동 — 원문 월동기 12~1월 · 생육재생기 2월(게임 휴면 = 12~2월 · 기온 문턱은 회부)' },
  { id: 'wheat', kind: '밀', region: '충남 평야지(파종 적기~한계) · 수확은 생육과정 표', from: '파종',
    sow: '10.20~10.30', harvest: '6.5~6.20', src: [WS(30707)],
    note: '월동 — 원문 생육재생기 웃거름 중북부 2월 중·하순' },
  { id: 'foxtail_millet', kind: '조', region: '중부내륙평야지(괴산)', from: '파종',
    sow: '6월 상순~6월 중순', harvest: '10월 상순~10월 중순', src: [WS(30713)],
    note: '원문은 지역별 한 작형뿐(봄조 구분 없음) · 게임 창 4~6월은 두 달 이르다(T583 비고)' },
  { id: 'buckwheat', kind: '여름메밀', region: '중북부', from: '파종',
    sow: '4월 하순~5월 상순', harvest: '7월 상순~7월 중순', src: [WS(30706)],
    note: '게임 둘째 묶음(7~8월) = 가을메밀(7월 중순~하순 → 10월 상순~중순) — 회부' },
  // ── 콩류 ──
  { id: 'soybean', kind: '콩 단작', region: '중북부', from: '파종',
    sow: '5월 하순~6월 상순', harvest: '10월 상순~10월 중순', src: [WS(30715)],
    note: '같은 쪽 품종별 표: 중부 중만생종 6월 상순 → 10월 중순(기간 같다)' },
  { id: 'azuki', kind: '팥', region: '중북부', from: '파종',
    sow: '6월 중순~6월 하순', harvest: '10월 상순~10월 중순', src: [WS(30716)], note: '' },
  { id: 'mungbean', kind: '녹두', region: '중부', from: '파종',
    sow: '6월 상순', harvest: '8월 중순~9월 중순', src: [WS(30702)], note: '' },
  // ── 유료 ──
  { id: 'sesame', kind: '단작', region: '그 외(전남·경남 아닌 곳)', from: '파종',
    sow: '5월 중순~6월 상순', harvest: '8월 하순~9월 상순', src: [WS(30714)], note: '' },
  { id: 'perilla', kind: '직파재배', region: '(지역 구분 없음)', from: '파종',
    sow: '6월 중순~6월 하순', harvest: '9월 중순~10월 중순', src: [WS(30703)],
    note: '육묘이식(6월 상~중순 파종 · 6월 하순~7월 상순 정식)도 수확은 같다' },
  // ── 양념 ──
  { id: 'ginger', kind: '노지재배', region: '(지역 구분 없음)', from: '아주심기',
    sow: '4월 하순~5월 상순', harvest: '10월~11월 상순', src: [WS(30625)], note: '씨생강을 바로 심는다(게임 심기 = 아주심기)' },
  { id: 'garlic', kind: '난지형', region: '(지역 구분 없음)', from: '파종',
    sow: '9월 상순~10월 상순', harvest: '5월 하순~6월 하순', src: [WS(30611)],
    note: '월동 — 한지형(10월 중순~하순 파종)도 수확은 같다 · 게임 창 9~10월과 겹치는 것이 난지형' },
  // ── 채소 ──
  { id: 'cabbage', kind: '봄재배', region: '(작형별 출하시기 표)', from: '파종',
    sow: '3월 중순~4월 하순', harvest: '5월 하순~6월 중순', src: [WS(30618)],
    note: '게임 둘째 묶음(7~9월) = 가을재배(8월 상순~하순 → 10월 중순~12월 상순) — 회부' },
  { id: 'radish', kind: '봄무(노지)', region: '(작형별 출하시기 표)', from: '파종',
    sow: '3월 중순~4월 하순', harvest: '5월 중순~7월 상순', src: [WS(30614)],
    note: '게임 둘째 묶음(7~9월) = 가을무(→ 9월 상순~12월 중순) — 회부' },
  { id: 'curled_mallow', kind: '봄재배', region: '(작형별 출하시기 표)', from: '파종',
    sow: '2월 상순~4월 하순', harvest: '3월 중순~6월 중순', src: [WS(30631)],
    note: '같은 쪽 본문은 봄재배 씨뿌림을 "2월 중순~4월 하순" 으로 적는다(표와 열흘 차) — 수확과 한 줄인 표를 쓴다' },
  { id: 'lettuce', kind: '여름재배', region: '(작형별 출하시기 표)', from: '파종',
    sow: '5월 상순~5월 중순', harvest: '7월 상순~8월 상순', src: [WS(30624)],
    note: '노지 봄 작형이 원문에 없다(시설 봄재배 = 1~2월 하우스) — 게임 첫 묶음 3~5월과 겹치는 노지 작형이 여름재배' },
];

// 표에 없는 까닭(원인 표 · 하네스가 34종 = 표 + 여기 로 다 덮는지 잰다)
const NOT_IN_TABLE = {
  chive: '다년생', mulberry_leaf: '다년생', tea: '다년생', water_dropwort: '다년생',
  cucumber: '시설 작형만(촉성·반촉성·조숙·억제 — 노지 원문 없음)',
  korean_melon: '시설 작형만(촉성·반촉성·조숙(터널)·억제 — 노지 원문 없음)',
  sorghum: '출처 판독 흔들림(농사로 30708 생육과정 표 — 세 번 읽어 세 답)',
  adlay: '농사로 1차 출처 없음', barnyard_millet: '농사로 1차 출처 없음', eggplant: '농사로 1차 출처 없음',
  gourd: '농사로 1차 출처 없음(호박 노지는 다른 종)', hemp_plant: '농사로 1차 출처 없음', indigo_plant: '농사로 1차 출처 없음',
  millet: '농사로 1차 출처 없음', scallion: '농사로 1차 출처 없음', taro: '농사로 1차 출처 없음',
  turnip: '농사로 1차 출처 없음', yam: '농사로 1차 출처 없음',
};

// ── 순(旬) 글자 → 날 ────────────────────────────────────────────────────────────────────────
//   달 길이는 달력 정본에게 묻는다(평년 — 표는 해를 모른다 · 윤일은 2월 말 하루뿐이고 표에 2월 끝 칸이 없다).
const Cal = require('./calendar');
const _JUN = { '상순': [1, 10], '중순': [11, 20], '하순': [21, 99] };
function _tok(t) {                                   // "5월 하순" | "10월" | "5.15" → { m, a, b } (b 는 그 칸의 끝날)
  const s = String(t).trim();
  let r = /^(\d{1,2})\.(\d{1,2})\.?$/.exec(s);
  if (r) { const m = +r[1], d = +r[2]; return { m, a: d, b: d }; }
  r = /^(\d{1,2})월(?:\s*(상순|중순|하순))?$/.exec(s);
  if (!r) throw new Error(`crop-cal: 못 읽는 글자 "${s}"`);
  const m = +r[1], last = Cal.MONTH_DAYS[m - 1];
  if (!r[2]) return { m, a: 1, b: last };
  const j = _JUN[r[2]];
  return { m, a: j[0], b: Math.min(last, j[1]) };
}
// "A~B" 또는 "A" → 시작 (m,d) · 끝 (m,d)
function parseSpan(text) {
  const parts = String(text).split('~');
  if (parts.length > 2) throw new Error(`crop-cal: 범위가 둘 넘는다 "${text}"`);
  const A = _tok(parts[0]);
  let B = parts.length === 2 ? _tok(parts[1]) : A;
  // "6.5~20" 꼴(뒤에 달이 없는 날)은 표에 쓰지 않는다 — 위 _tok 가 그런 글자를 거절한다.
  return { from: [A.m, A.a], to: [B.m, B.b] };
}
// (m,d) 를 기준일 이후 처음 오는 그 날로(게임일). 기준일 당일이면 그날.
function _onOrAfter(m, d, ref) {
  const y0 = Cal.dateOf(ref).year;
  for (let y = y0; y <= y0 + 1; y++) { const x = Cal.dayOf(y, m, d); if (x >= ref) return x; }
  return Cal.dayOf(y0 + 2, m, d);
}
// 한 줄 → 게임일 위의 네 끝점과 두 가운데날. 파종 시작은 1년(게임일 0 = 1년 3월 1일) 안 첫 그날이다.
function spanOf(row) {
  const s = parseSpan(row.sow), h = parseSpan(row.harvest);
  const s0 = _onOrAfter(s.from[0], s.from[1], 0);
  const s1 = _onOrAfter(s.to[0], s.to[1], s0);
  const h0 = _onOrAfter(h.from[0], h.from[1], s0);
  const h1 = _onOrAfter(h.to[0], h.to[1], h0);
  const sMid = (s0 + s1) / 2, hMid = (h0 + h1) / 2;
  return { s0, s1, h0, h1, sMid, hMid, sDay: Math.round(sMid), hDay: Math.round(hMid) };
}

const BY_ID = Object.freeze(ROWS.reduce((o, r) => (o[r.id] = r, o), {}));
function rowOf(id) { return BY_ID[id] || null; }
function ids() { return ROWS.map((r) => r.id); }

module.exports = { ROWS, NOT_IN_TABLE, rowOf, ids, parseSpan, spanOf };
