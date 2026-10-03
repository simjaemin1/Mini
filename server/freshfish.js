// === server/freshfish.js — 민물고기 10종 정본 (T312 · 설계_민물고기.md §1 을 코드로) ==========
//
// ★왜 한 파일인가 — 종 이름·무게·물·계절을 **여러 자리에 적으면 사본**이다. 무게 표(`weights.js`)에
//   물고기 **종별**이 없어서(코어 `fish` 0.90kg 한 줄뿐), 그 앵커를 여기 한 번만 적고
//   `weights.js`·`kcal.js` 정본을 **부르는 쪽**이 이 표를 읽는다.
//
// ★★새 수 0 규약 — 이 파일의 수는 **전부 `설계/설계_민물고기.md` §1 표에서 온다**(재민 09-18 · PM 초안):
//   · `kg`     그 표의 "몸 크기(무게 앵커 · 성체 대표)" **구간의 중앙**이다(2~3kg → 2.5). 지어낸 수 0.
//   · `water`  그 표의 "물" 열을 다섯 갈래로 정규화한 것(상류여울 · 중류자갈 · 하류진흙 · 호소늪 · 논).
//   · `season` 그 표의 "계절" 열 — 0/1 이다(은어 여름만 · 뱀장어 가을만 · 메기 여름 · 나머지 사철).
//   ⚠**가중은 없다.** 그 물에 사는 종이 여럿이면 **고르게** 나눈다 — 고르게는 값이 아니라 값의 부재다.
//     종별 흔함(잉어가 쏘가리보다 흔하다)은 표에 수가 없으므로 **안 짓는다**(회부 — 재민 한 글자).
//   ⚠열량은 `kcal.js` 의 `fish` 495 kcal/kg 을 **그대로 쓴다**(종별 열량 표가 없다 · 사본 0).
'use strict';

// 물 다섯 갈래 — 지형 정본에서 읽은 마을의 물 종류가 이 중 하나로 온다(`설계_민물고기.md` §1 각주).
const WATERS = ['upper', 'mid', 'lower', 'lake', 'paddy'];

// 계절 — econ 정본과 같은 경계(d<90 봄 · <180 여름 · <270 가을 · 그 밖 겨울). 새 수 0.
// ★[T570] 켬 = 달력 정본(`server/calendar.js` — econ·events 와 같은 함수 하나). 옛 줄은 `% 360` 이라 econ(365)과 해마다 닷새씩
//   어긋나던 **사본**이었다 — 끔(`T570_CALENDAR=0`)에서만 글자 그대로 남는다.
const _Cal = require('./calendar');
function seasonOf(day) { if (_Cal.ON) return _Cal.seasonOf(day | 0); const d = ((day | 0) % 360 + 360) % 360; return d < 90 ? 'spring' : d < 180 ? 'summer' : d < 270 ? 'autumn' : 'winter'; }

// 종 표 — 설계_민물고기.md §1 그대로(이름·kg·사는 물·나는 계절).
const SPECIES = [
  { id: 'carp',      ko: '잉어',     kg: 2.5,   waters: ['mid', 'lower', 'lake'],  seasons: ['spring', 'summer', 'autumn'] },
  { id: 'crucian',   ko: '붕어',     kg: 0.3,   waters: ['mid', 'lower', 'lake', 'paddy'], seasons: ['spring', 'summer', 'autumn', 'winter'] },
  { id: 'catfish',   ko: '메기',     kg: 1.5,   waters: ['mid', 'lower'],          seasons: ['summer'] },
  { id: 'snakehead', ko: '가물치',   kg: 1.5,   waters: ['lake'],                  seasons: ['summer'] },
  { id: 'mandarin',  ko: '쏘가리',   kg: 0.75,  waters: ['upper', 'mid'],          seasons: ['spring', 'summer', 'autumn'] },
  { id: 'barbel',    ko: '누치',     kg: 0.75,  waters: ['mid'],                   seasons: ['spring', 'summer', 'autumn'] },
  { id: 'minnow',    ko: '피라미',   kg: 0.035, waters: ['upper', 'mid'],          seasons: ['spring', 'summer', 'autumn'] },
  { id: 'sweetfish', ko: '은어',     kg: 0.15,  waters: ['upper', 'mid'],          seasons: ['summer'] },
  { id: 'eel',       ko: '뱀장어',   kg: 0.75,  waters: ['lower'],                 seasons: ['autumn'] },
  { id: 'loach',     ko: '미꾸라지', kg: 0.015, waters: ['paddy'],                 seasons: ['spring', 'summer', 'autumn'] },
];
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// ══ ★★[T609 2026-10-03] **민물 표 = T603 고증**(`설계/고증_민물고기.md` §1·§3 · 세션12) — 손잡이 `T609_FRESH_TABLE`(기본 **끔** · `1` = 켬) ══
//   카드 T609 ① 규약: T603 표의 구간·철(월)·kg 로 채운다 · **확실도 낮은/미확인 칸은 지금 값 그대로** + 표시(`t603` 칸) · 새 수 0.
//   ① 구간 — T603 이 1·2차 자료로 채운 8/10 중 **바뀐 넷**(나머지 넷은 같음 · 은어·뱀장어 둘은 구간 미확인 → 지금 값):
//      메기 + 호수 · 가물치 + 중류 · 누치 + 상류("주로" 상류 — 중류는 지금 값 유지) · 피라미 상·중 → 중·하.
//      ⚠플레이어 강 자리는 지금 늘 '중류'다(지형에 상·중·하 자료 없음 — T593 회부) — 상류 칸은 표에만 산다.
//   ② 철 — **바뀜 0**: T603 이 "지금 철과 일치/0 어긋남"이라 적은 셋(메기·은어·뱀장어) · 산란기만 적힌 둘(붕어 4~7 · 피라미 6~8 —
//      잡히는 철이 아니다 · 미확인) · 금어기(쏘가리 5월 — T603 이 대조 보류) · 미확인 넷 → 전부 지금 값.
//   ③ kg — **바뀜 0**: T603 은 길이(cm)만 적었다 — kg 환산 출처 없음(미확인) → 지금 값.
//   ④ **열도(닛폰 존)에서 가물치를 뺀다** — "일본으로의 도입은 제2차 세계대전 중"(T603 §3 · 확실 · 근대 도입). 그 존의 풀에서만 빠진다.
//   ⑤ 새 후보 다섯(송어 · 산천어 · 버들치 · 꺽지 · 연어 하구)은 **표만**(`CANDIDATES` — 풀에 안 든다 · 품목 0 · 값은 재민).
const T609_FRESH_TABLE = process.env.T609_FRESH_TABLE === '1';
const T603 = Object.freeze({
  carp:      { t603: '구간 같음(강 중하류·하구·호수 — 중) · 철 미확인(산란철) · kg 미확인(길이만 — 최대 1m)' },
  crucian:   { t603: '구간 같음(하천 중류 이하·호소·논 — 어식백세 · 높음) · 철: 산란기 4~7월만(잡히는 철 미확인 → 지금 값) · kg 미확인' },
  catfish:   { waters: ['mid', 'lower', 'lake'], t603: '구간 + 호수("강이나 호수 바닥 근처" — 상·중·하는 안 가름 → 강 갈래는 지금 값) · 철 일치(제철 7월경 = 여름) · kg 미확인(30cm~1m)' },
  snakehead: { waters: ['mid', 'lake'], noZones: ['nippon'], t603: '구간 + 중류("강 중류·저수지·습지·연못") · 열도 뺌(2차 대전 중 도입 — §3 확실) · 철·kg 미확인(45~80cm)' },
  mandarin:  { t603: '구간 같음("상·중류와 부합" — 중) · 철: 금어기 5월(산란 보호 — T603 대조 보류 → 지금 값) · kg 미확인' },
  barbel:    { waters: ['upper', 'mid'], t603: '구간 + 상류("주로 상류 쪽" — "주로"라 중류는 지금 값 유지) · 철·kg 미확인(20~30cm)' },
  minnow:    { waters: ['mid', 'lower'], t603: '구간 상·중 → 중·하("하천 중류와 하류의 여울") · 철: 산란 6~8월만(잡히는 철 미확인 → 지금 값) · kg 미확인' },
  sweetfish: { t603: '구간 미확인(지금 값) · 철 일치(여름 — 7월말~8월초 축제 · T583) · kg 미확인' },
  eel:       { t603: '구간 미확인(지금 값) · 철 일치(10~11월 — 지금 9~11월과 "0 어긋남" · T583) · kg 미확인' },
  loach:     { t603: '구간 같음(논·둠벙 — 높음) · 철·kg 미확인 · ⚠열도의 どじょう 는 미꾸리(다른 종 — 회부)' },
});
const SPECIES_T609 = SPECIES.map((s) => { const o = T603[s.id] || {};
  return Object.freeze(Object.assign({}, s, { waters: o.waters || s.waters, noZones: o.noZones || null, t603: o.t603 || null })); });
const BY_ID_T609 = new Map(SPECIES_T609.map((s) => [s.id, s]));
// 새 후보 — 표만(낚이지 않는다). 칸은 T603 ⓑ 그대로 · 미확인 = null.
const CANDIDATES = Object.freeze([
  Object.freeze({ id: 'trout', ko: '송어', waters: null, spawn: null, note: '전부 미확인(이번 판은 산천어 쪽 자료만) · 품목은 특산 `trout`(marine 칸 — T592 회부 ②)' }),
  Object.freeze({ id: 'masu', ko: '산천어', waters: ['upper'], spawn: [9, 10], note: '상류(여름에도 18℃ 이하 맑은 물) · 산란 9~10월 · 체장 약 40cm(kg 미확인) · 한반도·열도 둘 다(위키백과 — 중)' }),
  Object.freeze({ id: 'dace', ko: '버들치', waters: ['upper'], spawn: null, note: '상류·계곡(1급수 · 저수지·지류·도심하천에도 적응) · 체장 10~15cm(kg 미확인) · 철 미확인(나무위키 — 중)' }),
  Object.freeze({ id: 'kkeokji', ko: '꺽지', waters: null, spawn: null, note: '미확인(본문 열람 실패 · 스니펫 "한국에서만")' }),
  Object.freeze({ id: 'salmon', ko: '연어(하구 회귀)', waters: ['lower'], spawn: null, note: '하구·하류(회귀성 — 바다 표 강어귀 연어와 같은 종 · T592 재인용) · 철·kg 미확인' }),
]);

// 그 물·그 계절에 나는 종 — **고르게** 나눈다(가중 0 · 위 규약).
//   ★[T609] 셋째 인자 `zone`(존 id) — 켬이면 그 존에서 안 나는 종(`noZones` — 열도 가물치)을 뺀다 · 끔이면 안 읽는다(옛 줄 글자 그대로).
function poolOf(water, day, zone) {
  const se = seasonOf(day);
  const w = WATERS.indexOf(water) >= 0 ? water : 'mid';   // 모르는 물은 중류(가장 넓은 갈래)로 — 폴백 하나
  if (!T609_FRESH_TABLE) return SPECIES.filter((s) => s.waters.indexOf(w) >= 0 && s.seasons.indexOf(se) >= 0);
  return SPECIES_T609.filter((s) => s.waters.indexOf(w) >= 0 && s.seasons.indexOf(se) >= 0 && !(zone && s.noZones && s.noZones.indexOf(zone) >= 0));
}
// 결정론 추첨 — **주사위 금지**(공통 §1). 셀·날·순번 해시로 고른다(같은 입력 = 같은 종).
// ★[T574 2026-10-03] `choose(ids, u)` 를 주면(존 특산 프로필 + 경계 혼용 — `region-profiles.chooseSpecies`) 같은 해시 x 를
//   씨 해시 정본(`seed-rand` 의 `step` 두 번 → `out`)으로 섞은 u 로 넘겨 **가중**으로 고른다(x 는 아랫자리만 움직일 수 있어
//   x ÷ 2³² 를 바로 쓰면 u 가 한쪽에 몰린다 — 하네스가 실제로 그걸 잡았다). 그쪽이 null(고르게와 같다)이면 옛 줄 그대로 —
//   안 주면 이 함수는 한 글자도 안 바뀐다.
let _SR = null;
// ★[T593] 뽑기 몸통을 한 자리로 뺐다 — 바닷물고기 표(`seafish.js`)가 **같은 뽑기**를 부른다(사본 0 · 이 파일의 동작은 한 글자도 안 바뀐다).
//   `pool` 은 그 물·그 철에 사는 종(배열) · `byId` 는 그 표의 id → 종(고른 id 를 종으로 되돌린다) · 나머지 셋은 아래 `pick` 과 같다.
function pickFrom(pool, day, h, choose, byId) {
  if (!pool || !pool.length) return null;
  const x = ((h | 0) ^ Math.imul(day | 0, 0x9e3779b1)) >>> 0;
  if (choose) {
    const SR = _SR || (_SR = require('./seed-rand'));
    const id = choose(pool.map((s) => s.id), SR.out(SR.step(SR.step(x))));
    const s = id ? byId(id) : null; if (s) return s;
  }
  return pool[x % pool.length];
}
const _byId = T609_FRESH_TABLE ? (id) => BY_ID_T609.get(id) : (id) => BY_ID.get(id);
function pick(water, day, h, choose, zone) { return pickFrom(poolOf(water, day, zone), day, h, choose, _byId); }   // ★[T609] 다섯째 = 존(끔이면 안 읽는다)
function kgOf(id) { const s = BY_ID.get(id); return s ? s.kg : 0; }
function koOf(id) { const s = BY_ID.get(id); return s ? s.ko : id; }
function isFish(id) { return BY_ID.has(id); }
module.exports = { WATERS, SPECIES: T609_FRESH_TABLE ? SPECIES_T609 : SPECIES, seasonOf, poolOf, pick, pickFrom, kgOf, koOf, isFish, ids: () => SPECIES.map((s) => s.id),
  T609_FRESH_TABLE, T603, SPECIES_T609, CANDIDATES };   // ★[T609] 손잡이 · T603 칸 · 켬 판 표 · 새 후보(표만)
