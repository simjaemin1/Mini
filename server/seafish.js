// === server/seafish.js — 바닷물고기 표 정본 (T593 · `freshfish.js` 꼴 그대로 · T602 고증 채움) ======================
//
// ★왜 따로 있나 — T593 전엔 낚시 종을 **존 바이옴 목록 하나**(`fishing.js SPECIES_BY_BIOME`)에서 뽑았다.
//   그 목록은 물 종류를 모른다(한반도 forest = 송어·잉어·명태 — 강에서 명태, 바다에서 잉어가 나왔다).
//   ⇒ 물이 표를 고른다: 민물(강·호수·하구) = `freshfish.js`(NPC 와 같은 표) · 바다 = 이 표.
//
// ★★[T602 2026-10-03] **표를 고증으로 채웠다** — `설계/고증_바닷물고기.md`(T592 · 세션12) · 손잡이 `T602_SEA_TABLE`
//   (기본 켬 · `0` = 아래 T593 표 **글자 그대로**: 열 종 · 해역·철 빈칸 · kg = 무게 정본 · 고르게).
//   ① 표 `TABLE` = T592 의 25줄 그대로(지금 marine 17 + 해안 후보 8). 칸: 잡는 자리 `gear` · 해역 여섯 단계 · 철(월) ·
//      kg(보통 구간 · 큰 것) · kcal/100g · 출처 · 낮은 확실도 칸(`low`). **미확인 = null**(지어내지 않는다).
//      `gear` — 'rod' 해안 낚시(배 없이 갯바위·방파제·하구) · 'boat' **배 필요**(캐논 "배 없음" 재민 09-23 — 해안 표에서 빠진다 ·
//      품목은 그대로라 거래·곳간으로는 돈다) · 'hand' 손 채집(갯벌·조간대 = `tidal.js` 자리 — 낚싯대 표 밖) ·
//      'fresh' 민물 표와 겹침(T592 회부 ② — 송어·잉어) · null 미확인(자색고둥).
//   ② 해안 표 `SPECIES`(낚싯대가 무는 종) = `gear: 'rod'` 줄 — 기본 8종. 새 어종 일곱은 `T602_NEW_FISH=1` 일 때만 든다
//      (품목 자체가 그때만 선다 — `specialty.js` · 기본 끔).
//   ③ 해역 = **그 자리의 해안 구간**(T588 정본 `public/coast-shape.js SECTIONS` — 이 세계의 서해·남해·동해·대한해협·세토·
//      태평양 쪽이 어느 변의 어느 몫인가)을 T592 의 해역 낱말에 잇는다(`SECTION_AREAS`). 구간은 그 자리에서 가장 가까운
//      바다 변(같은 변이면 그 변을 따라 잰 몫)으로 고른다. ⚠T592 는 "동해"를 한반도 쪽·열도 쪽으로 가르지 않았다 —
//      닛폰 서(대한해협·동해 쪽) 구간은 그 두 해역 중 **더 흔한 쪽** 단계다. 중원(황해 쪽)은 T592 표 밖이라 null(= 고르게).
//   ④ 흔함 — T592 단계 낱말을 **존 특산 프로필의 단계 수**(`region-profiles.LV` — 많음 26 · 보통 12.5 · 낮음 2 · 그 파일이
//      정본 POOL 에서 파생한 수 · 나무·물고기 갈래가 이미 쓰는 그 문법)로 읽는다: 많음 → 많음 · 있음 → 보통 · 드묾 → 낮음 ·
//      미확인 → 보통(모르면 고르게 — 그 파일의 규약 그대로). 그 자리 풀의 가중이 고르게면 **옛 해시 그대로**(`chooseSpecies` ⓑ
//      와 같은 규약 — 서해 해안처럼 다 '보통'인 자리는 T593 과 같은 뽑기다). 곁가지 `T602_GRADE=0` = 언제나 고르게.
//      ⚠"있음~많음"(정어리·숭어·감성돔·전갱이·고등어)은 아래 끝 '있음'으로 · "전 해역 가능"(농어)은 '있음'으로 읽었다(보고 표).
//   ⑤ 철 = 월(달력 정본 `calendar.dateOf` — 화면 날짜와 같은 시계). 달력 끔(`T570_CALENDAR=0`)이면 월이 없어 거르지 않는다.
//   ⑥ kg = **보통 구간의 중앙**(민물 표 `freshfish` 규약 그대로: 2~3kg → 2.5) — 플레이어 무게의 중앙값·NPC 창이 읽는다.
//      ⚠품목의 무게 정본(`specialty.weight` · 짐·거래)은 안 고친다 — econ 이 읽는 수다(보고 회부).
//   ⚠열량·값은 이 파일이 정하지 않는다 — 열량 `kcal.js`(새 어종 줄은 `T602_NEW_FISH` 뒤) · 값 `specialty.js`(새 어종 = 형제 펴기 ·
//     재민 판정 표). 여기 `kcal100` 은 표의 기록이다(게임이 안 읽는다 · 하네스가 kcal.js 새 줄과 대조한다).
'use strict';

const Fresh = require('./freshfish');   // 철(`seasonOf` — 달력 정본) · 뽑기 몸통(`pickFrom`) — 같은 함수를 부른다
const Cal = require('./calendar');      // ★[T602] 월 — `dateOf(day).month`(달력 정본)

// ── 손잡이 ─────────────────────────────────────────────────────────────────────────────────────────
const T602_SEA_TABLE = process.env.T602_SEA_TABLE !== '0';                      // 기본 켬 — 0 = T593 표 글자 그대로
const T602_GRADE = T602_SEA_TABLE && process.env.T602_GRADE !== '0';            // 곁가지(기본 켬) — 0 = 고르게
const T602_NEW_FISH = T602_SEA_TABLE && process.env.T602_NEW_FISH === '1';      // 기본 끔 — 해안 새 어종 일곱(품목은 `specialty.js` 가 같은 손잡이로 세운다)

// 자리 두 갈래 — `fishing.spotAt` 의 바다 갈래가 낸다(해안 물가 · 강어귀 곁).
const SPOTS = ['coast', 'mouth'];

// `ko`·`kg` 는 정본에게 묻는다 — 늦게 부른다(`specialty`·`weights` 를 이 파일 적재 때 물면 `fishing` ↔ `spoil` 맞물림이 생긴다).
let _Sp = null, _W = null;
const _sp = () => _Sp || (_Sp = require('./specialty'));
const _w = () => _W || (_W = require('./weights'));

// ══ T593 표(끔 · `T602_SEA_TABLE=0`) — 글자 그대로 ══════════════════════════════════════════════════
// 표 — 카드 T593 ② 의 열 종(명태·대구·청어·정어리·멸치·연어(하구)·문어·오징어·게·새우).
const ROWS = [
  { id: 'pollock', areas: null, spots: null,      seasons: null },
  { id: 'cod',     areas: null, spots: null,      seasons: null },
  { id: 'herring', areas: null, spots: null,      seasons: null },
  { id: 'sardine', areas: null, spots: null,      seasons: null },
  { id: 'anchovy', areas: null, spots: null,      seasons: null },
  { id: 'salmon',  areas: null, spots: ['mouth'], seasons: null },
  { id: 'octopus', areas: null, spots: null,      seasons: null },
  { id: 'squid',   areas: null, spots: null,      seasons: null },
  { id: 'crab',    areas: null, spots: null,      seasons: null },
  { id: 'shrimp',  areas: null, spots: null,      seasons: null },
];
const SPECIES_T593 = ROWS.map((r) => Object.freeze({
  id: r.id, areas: r.areas, spots: r.spots, seasons: r.seasons,
  get ko() { const x = _sp().RESOURCES && _sp().RESOURCES[r.id]; return (x && x.ko) || r.id; },
  get kg() { return _w().kgOf(r.id) || 0; },
}));

// ══ ★[T602] 고증 표 — T592 `설계/고증_바닷물고기.md` §1 ⓐ·ⓑ 의 25줄 ═══════════════════════════════════
// 해역 여섯(T592 의 낱말 그대로 — "열도 동해 쪽"은 T592 가 "동해"와 가르지 않았다).
const AREAS = Object.freeze([
  Object.freeze({ id: 'W', ko: '서해' }), Object.freeze({ id: 'S', ko: '남해' }), Object.freeze({ id: 'E', ko: '동해' }),
  Object.freeze({ id: 'K', ko: '대한해협' }), Object.freeze({ id: 'T', ko: '세토' }), Object.freeze({ id: 'P', ko: '태평양 쪽' }),
]);
// 해안 구간(T588 `SECTIONS` 의 id) → 그 구간이 닿는 T592 해역. 표에 없는 구간(중원 황해 쪽) = null.
const SECTION_AREAS = Object.freeze({
  kr_w: Object.freeze(['W']), kr_s: Object.freeze(['S']), kr_e: Object.freeze(['E']),
  jp_w: Object.freeze(['K', 'E']), jp_s: Object.freeze(['T']), jp_e: Object.freeze(['P']),
});
const GRADES = Object.freeze(['많음', '있음', '드묾']);   // T592 단계 낱말('없음'은 T592 에 없다 — 오면 풀에서 뺀다)
const _ALL = (g) => ({ W: g, S: g, E: g, K: g, T: g, P: g });
const _AR = (o) => Object.freeze(Object.assign({ W: null, S: null, E: null, K: null, T: null, P: null }, o));
// 한 줄 — 빈 칸은 null(미확인). `low` = T592 확실도가 '낮음'·'중(추론)'·'일반 상식'인 칸(보고 표에 표시).
function _R(r) {
  return Object.freeze({
    id: r.id, ko: r.ko || null, isNew: !!r.isNew, gear: r.gear === undefined ? null : r.gear,
    spots: r.spots ? Object.freeze(r.spots.slice()) : null,
    areas: r.areas ? _AR(r.areas) : null,
    months: r.months ? Object.freeze(r.months.slice()) : null,
    kg: r.kg ? Object.freeze(r.kg.slice()) : null, big: r.big == null ? null : r.big,
    kcal100: r.kcal100 == null ? null : r.kcal100,
    src: r.src || null, low: Object.freeze((r.low || []).slice()), note: r.note || '',
  });
}
const TABLE = Object.freeze([
  // ── ⓐ 지금 세계의 marine 17(`specialty.js` 의 그 줄들) ──
  _R({ id: 'pollock', gear: 'boat', kg: [0.5, 1], big: 3, months: [12, 1, 2], kcal100: 72,
    areas: { E: '많음', W: '드묾', S: '드묾', K: '드묾', T: '드묾', P: '드묾' },
    src: 'dietexercisenavi(kcal)', low: ['gear', 'months', 'kg'], note: '심해 회유 — 연안 갯바위 대상 아님(일반 상식) · 어기 겨울(통설 · 1차 미확인)' }),
  _R({ id: 'salmon', gear: 'rod', spots: ['mouth'], kg: [3, 4], big: 7, months: [9, 10, 11], kcal100: 169,
    areas: { E: '많음', W: '드묾', S: '드묾', K: '드묾', T: '드묾', P: '드묾' },
    src: 'dietexercisenavi(kcal)', low: ['gear', 'months', 'kg'], note: '하구 — 가을 회귀철엔 배 없이(일반 상식) · 회귀 9~11월(1차 미확인)' }),
  _R({ id: 'cod', gear: 'boat', kg: [2, 4], big: 10, months: [12, 1, 2], kcal100: 86,
    areas: { S: '많음', K: '많음', E: '있음', W: '드묾', T: '드묾', P: '드묾' },
    src: 'nofat.kr(kcal)', low: ['gear', 'months', 'kg'], note: '심해성 — 배 필요(일반 상식) · 겨울(대구축제 시기 · 1차 미확인)' }),
  _R({ id: 'herring', gear: 'rod', kg: [0.1, 0.2], big: 0.3, kcal100: 228, areas: { E: '있음', S: '있음' },
    src: 'dietexercisenavi(kcal)', low: ['gear', 'kg'], note: '방파제·갯바위(연안 회유성) · 나머지 해역·철 미확인' }),
  _R({ id: 'sardine', gear: 'rod', kg: [0.05, 0.1], kcal100: 213, areas: _ALL('있음'),
    src: 'dietexercisenavi(kcal)', low: ['gear', 'kg', 'areas'], note: '방파제(투망·뜰채) · 전 해역 "있음~많음"(아래 끝으로 읽음) · 철 미확인' }),
  _R({ id: 'anchovy', gear: 'rod', kg: [0.01, 0.02], kcal100: 127, areas: Object.assign(_ALL('있음'), { S: '많음' }),
    src: 'pillyze(kcal)', low: ['gear', 'kg'], note: '방파제 · 남해 많음(기선권현망) · 철 미확인' }),
  _R({ id: 'trout', gear: 'fresh', note: '`freshfish.js` 와 겹침(T592 회부 ②) — 이 표의 칸 없음' }),
  _R({ id: 'carp', gear: 'fresh', kcal100: 172, note: '`freshfish.js` 와 겹침(T592 회부 ②) · kcal 참고치' }),
  _R({ id: 'shrimp', gear: 'rod', kg: [0.01, 0.03], kcal100: 137, areas: _ALL('있음'),
    src: 'pillyze(kcal)', low: ['gear', 'kg'], note: '갯벌·방파제(통발) · 철 미확인' }),
  _R({ id: 'crab', gear: 'rod', kg: [0.1, 0.3], kcal100: 100, areas: _ALL('있음'),
    src: 'geniet(kcal · 환산치 ~100)', low: ['gear', 'kg', 'kcal'], note: '갯바위·갯벌(배 없이 흔함) · 철 미확인' }),
  _R({ id: 'lobster', gear: 'boat', kg: [0.3, 1], kcal100: 97,
    src: 'pillyze(kcal · 환산치)', low: ['gear', 'kg', 'kcal'], note: '통발 — 배 필요(일반 상식) · 분포·철 미확인' }),
  _R({ id: 'oyster', gear: 'hand', kg: [0.05, 0.1], kcal100: 81, areas: Object.assign(_ALL('있음'), { S: '많음' }),
    src: 'pillyze(kcal)', low: ['kg'], note: '갯벌·조간대 손 채집(갯벌 `tidal.js` 자리)' }),
  _R({ id: 'abalone', gear: 'hand', kg: [0.1, 0.3], kcal100: 78, areas: Object.assign(_ALL('있음'), { S: '많음' }),
    src: 'pillyze(kcal)', low: ['kg', 'gear'], note: '갯바위 저조대 — 배 없이도 되나 보통 잠수(갯벌 `tidal.js` 자리)' }),
  _R({ id: 'octopus', gear: 'rod', kg: [0.3, 1], areas: _ALL('있음'),
    src: '—(T592 의 311 은 건조 문어 — 생물 수치 아님)', low: ['gear', 'kg'], note: '갯바위(통발·갈고리 · 배 없이) · 철·kcal 미확인' }),
  _R({ id: 'squid', gear: 'rod', kg: [0.2, 0.4], kcal100: 105, areas: Object.assign(_ALL('있음'), { E: '많음' }),
    src: 'pillyze(kcal · 삶은 것)', low: ['gear', 'kg', 'kcal'], note: '갯바위(집어등 연안형 — 원양 채낚기는 배 필요) · 동해 많음 · 철 미확인' }),
  _R({ id: 'seaweed', gear: 'hand', kcal100: 18, areas: Object.assign(_ALL('있음'), { S: '많음' }),
    src: 'nofat.kr(kcal)', note: '조간대 손 채집(갯벌 `tidal.js` 자리)' }),
  _R({ id: 'murex_shell', note: '전부 미확인(종 동정 미확인 · 조간대로 추정)' }),
  // ── ⓑ 해안 후보 8 — 지금 세계에 없는 종(새 어종 일곱 = 'rod' 줄 · `T602_NEW_FISH`) ──
  _R({ id: 'red_seabream', ko: '참돔', isNew: true, gear: 'rod', kg: [1, 3], months: [4, 5, 10, 11], kcal100: 114,
    areas: { S: '많음', K: '많음', T: '많음', W: '있음', E: '있음' },
    src: 'ocean-fishing.com · pillyze(kcal · 구운 것)', low: ['gear', 'kg', 'areas', 'kcal'],
    note: '갯바위(제한적 — 보통 배낚시가 주류) · 해역은 수온 추론 · 태평양 쪽 미확인' }),
  _R({ id: 'sea_bass', ko: '농어', isNew: true, gear: 'rod', kg: [1, 3], months: [5, 6, 7, 8], kcal100: 96, areas: _ALL('있음'),
    src: 'ocean-fishing.com · pillyze(kcal · 회)', low: ['kg', 'areas', 'kcal'], note: '갯바위·방파제·하구(배 없이 대표적) · "전 해역 가능"(수온 폭 넓음 — 있음으로 읽음)' }),
  _R({ id: 'mullet', ko: '숭어', isNew: true, gear: 'rod', kg: [0.5, 1.5], kcal100: 143, areas: _ALL('있음'),
    src: 'pillyze(kcal)', low: ['kg', 'areas'], note: '방파제·하구(배 없이 매우 흔함) · 전 해역 하구·내만 "있음~많음" · 철 미확인' }),
  _R({ id: 'black_porgy', ko: '감성돔', isNew: true, gear: 'rod', kg: [0.5, 1.5], months: [3, 4, 5, 11, 12], areas: _ALL('있음'),
    src: 'ocean-fishing.com', low: ['kg', 'areas'], note: '갯바위(짜낚시 대표) · "있음~많음" · kcal 미확인' }),
  _R({ id: 'rockfish', ko: '볼락', isNew: true, gear: 'rod', kg: [0.1, 0.3], months: [1, 2, 3, 4], kcal100: 109, areas: { W: '많음', S: '많음' },
    src: 'ocean-fishing.com', low: ['kg', 'areas'], note: '갯바위(밤낚시 대표) · 서·남해 암초지대 많음(추정) · 나머지 해역 미확인' }),
  _R({ id: 'horse_mackerel', ko: '전갱이', isNew: true, gear: 'rod', kg: [0.1, 0.3], kcal100: 144, areas: _ALL('있음'),
    src: 'dietexercisenavi(kcal)', low: ['kg', 'areas'], note: '방파제(배 없이 흔함) · "있음~많음" · 철 미확인' }),
  _R({ id: 'mackerel', ko: '고등어', isNew: true, gear: 'rod', kg: [0.3, 0.5], months: [8, 9, 10], kcal100: 239, areas: _ALL('있음'),
    src: 'ocean-fishing.com · dietexercisenavi(kcal)', low: ['kg', 'areas'], note: '방파제(회유 철 따라 배 없이) · "있음~많음"' }),
  _R({ id: 'skipjack', ko: '가다랑어', gear: 'boat', months: [3, 4, 5, 9, 10, 11], kcal100: 108,
    areas: { T: '있음', P: '있음', K: '있음', W: '드묾', S: '드묾', E: '드묾' },
    src: 'nanawa.co.jp · 文部科学省(kcal 1차)', low: ['areas', 'months'], note: '원양 회유종 — 배 필요(품목으로 안 세운다) · 철은 고치 기준(규슈 고유 아님) · kg 미확인' }),
]);
const TABLE_BY_ID = new Map(TABLE.map((r) => [r.id, r]));
const NEW_IDS = Object.freeze(TABLE.filter((r) => r.isNew && r.gear === 'rod').map((r) => r.id));
const _mid = (kg) => (kg ? +(((kg[0] + kg[1]) / 2).toFixed(6)) : 0);
// 해안 표 — 낚싯대가 무는 종(배 필요·손 채집·민물 겹침·미확인은 뺀다 · 새 어종은 손잡이 뒤)
const SPECIES_T602 = TABLE.filter((r) => r.gear === 'rod' && (!r.isNew || T602_NEW_FISH)).map((r) => Object.freeze({
  id: r.id, areas: r.areas, spots: r.spots, months: r.months, isNew: r.isNew,
  get ko() { const x = _sp().RESOURCES && _sp().RESOURCES[r.id]; return (x && x.ko) || r.ko || r.id; },
  kg: _mid(r.kg) || 0,
}));

const SPECIES = T602_SEA_TABLE ? SPECIES_T602 : SPECIES_T593;
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// ══ 해역 ═══════════════════════════════════════════════════════════════════════════════════════════
// 해역 — T593: **바이옴이 고른다**(카드 T593 ②: "바이옴은 해역 고르기에만"). 해역 칸이 빈 지금은 바이옴 이름이 곧 해역 열쇠다
//   (T592 표가 해역 이름을 정하면 이 한 줄이 그 표를 읽는다). 존 설정에 바이옴이 없으면 null(= 모든 해역).
function areaOfZone(zoneId) {
  let Z = null; try { Z = require('./zone-config').ZONES; } catch (e) { Z = null; }
  const z = Z && Z[zoneId];
  return (z && z.biome) || null;
}
// ★[T602] 그 자리(존 로컬 px)의 해안 구간 id — T588 구간 표 정본(`SECTIONS`)을 존 사각에서 읽는다(박힌 px 0 · 존 폭이 바뀌면 따라간다).
//   변 구간: 그 변까지의 거리가 가장 짧은 구간(그 변을 따라 잰 몫이 [from, to) 안) · 꼭짓점 구간: 꼭짓점까지 거리 · `as` 면 그 구간 이름.
let _CS = null;
const _cs = () => _CS || (_CS = require('../public/coast-shape.js'));
function sectionAt(zoneId, x, y) {
  let Z = null; try { Z = require('./zone-config').ZONES; } catch (e) { Z = null; }
  const z = Z && Z[zoneId]; if (!z || !(z.zoneWidth > 0) || !(z.zoneHeight > 0)) return null;
  const W = z.zoneWidth, H = z.zoneHeight;
  let best = null, bd = Infinity;
  for (const s of _cs().SECTIONS) {
    if (s.zone !== zoneId) continue;
    let d;
    if (s.corner) {
      d = Math.hypot(x - (s.corner.indexOf('E') >= 0 ? W : 0), y - (s.corner.indexOf('S') >= 0 ? H : 0));
    } else {
      const along = (s.side === 'S' || s.side === 'N') ? x / W : y / H;
      const f = Math.min(Math.max(along, 0), 1 - 1e-12);
      if (f < s.from || f >= s.to) continue;
      d = s.side === 'S' ? H - y : (s.side === 'N' ? y : (s.side === 'E' ? W - x : x));
    }
    if (d < bd) { bd = d; best = s; }
  }
  return best ? (best.as || best.id) : null;
}
// 부르는 쪽(존 낚시 · NPC 어부)이 넘기는 해역 열쇠 — 켬: 그 자리 구간이 닿는 T592 해역(배열 · 표 밖이면 null) · 끔: T593 그대로(바이옴).
function areaAt(zoneId, x, y) {
  if (!T602_SEA_TABLE) return areaOfZone(zoneId);
  const sec = sectionAt(zoneId, x, y);
  return (sec && SECTION_AREAS[sec]) || null;
}

// ══ 풀 · 뽑기 ══════════════════════════════════════════════════════════════════════════════════════
// T593 — 그 해역·그 자리·그 철에 나는 종 — 빈칸은 "거르지 않는다".
function _poolOfT593(area, spot, day) {
  const se = Fresh.seasonOf(day);
  return SPECIES.filter((s) => (!s.areas || s.areas.indexOf(area) >= 0)
    && (!s.spots || s.spots.indexOf(spot) >= 0)
    && (!s.seasons || s.seasons.indexOf(se) >= 0));
}
// ★[T602] 그 자리·그 달에 나는 종 — 해역은 **풀을 거르지 않는다**(T592 에 '없음'이 없다 · 드묾도 산다) · 흔함만 가중이다.
const _RANK = Object.freeze({ '없음': 0, '드묾': 1, '있음': 2, '많음': 3 });
function monthOf(day) { return (Cal.ON && day != null && Number.isFinite(+day)) ? Cal.dateOf(+day).month : null; }
function gradeOf(s, area) {   // 그 종의 그 해역 단계 — 구간이 해역 둘에 닿으면 더 흔한 쪽 · 모르면 null
  const r = s && TABLE_BY_ID.get(s.id);
  if (!r || !r.areas || !Array.isArray(area)) return null;   // 해역 열쇠는 배열(`areaAt`) — 바이옴 글자(T593 열쇠)·null 이면 모른다 = 보통
  let g = null;
  for (const a of area) { const v = r.areas[a]; if (v != null && v in _RANK && (g == null || _RANK[v] > _RANK[g])) g = v; }
  return g;
}
function _poolOfT602(area, spot, day) {
  const m = monthOf(day);
  return SPECIES.filter((s) => (!s.spots || s.spots.indexOf(spot) >= 0)
    && (!s.months || m == null || s.months.indexOf(m) >= 0)
    && gradeOf(s, area) !== '없음');
}
const poolOf = T602_SEA_TABLE ? _poolOfT602 : _poolOfT593;
// 단계 → 수(region-profiles 정본 단계 · 새 수 0) — 늦게 부른다(맞물림 금지)
let _RP = null;
const _rp = () => _RP || (_RP = require('./region-profiles'));
const _LVKEY = Object.freeze({ '많음': '많음', '있음': '보통', '드묾': '낮음', '없음': '없음' });
function weightOf(s, area) { const g = gradeOf(s, area); return _rp().LV[_LVKEY[g] || '보통']; }
// 흔함 가중 뽑기 — `freshfish.pickFrom` 의 `choose(ids, u)` 자리. 고르게면 null(옛 해시 그대로 — `chooseSpecies` ⓑ 규약).
function _gradeChooser(area) {
  if (!T602_GRADE || !Array.isArray(area)) return undefined;
  return (ids, u) => {
    const p = {}; let w0 = null, flat = true;
    for (const id of ids) { const w = weightOf(BY_ID.get(id), area); p[id] = w; if (w0 == null) w0 = w; else if (w !== w0) flat = false; }
    return flat ? null : _rp().pickBy(ids, p, u);
  };
}
// 결정론 추첨 — 민물 표와 **같은 몸통**(`freshfish.pickFrom` · 주사위 0 · 같은 입력 = 같은 종).
const _byId = (id) => BY_ID.get(id);
function pick(area, spot, day, h, choose) {
  if (!T602_SEA_TABLE) return Fresh.pickFrom(poolOf(area, spot, day), day, h, choose, _byId);
  return Fresh.pickFrom(poolOf(area, spot, day), day, h, choose || _gradeChooser(area), _byId);
}
function kgOf(id) { const s = BY_ID.get(id); return s ? s.kg : 0; }
function koOf(id) { const s = BY_ID.get(id); return s ? s.ko : id; }
function isFish(id) { return BY_ID.has(id); }
module.exports = {
  SPOTS, SPECIES, areaOfZone, poolOf, pick, kgOf, koOf, isFish, ids: () => SPECIES.map((s) => s.id),
  // ★[T602]
  T602_SEA_TABLE, T602_GRADE, T602_NEW_FISH, TABLE, AREAS, SECTION_AREAS, GRADES, NEW_IDS, T593_IDS: Object.freeze(ROWS.map((r) => r.id)),
  sectionAt, areaAt, monthOf, gradeOf, weightOf, rowOf: (id) => TABLE_BY_ID.get(id) || null,
};
