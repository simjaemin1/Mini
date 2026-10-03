// === server/seafish.js — 바닷물고기 표 정본 (T593 · `freshfish.js` 꼴 그대로) ======================
//
// ★왜 따로 있나 — T593 전엔 낚시 종을 **존 바이옴 목록 하나**(`fishing.js SPECIES_BY_BIOME`)에서 뽑았다.
//   그 목록은 물 종류를 모른다(한반도 forest = 송어·잉어·명태 — 강에서 명태, 바다에서 잉어가 나왔다).
//   ⇒ 물이 표를 고른다: 민물(강·호수·하구) = `freshfish.js`(NPC 와 같은 표) · 바다 = 이 표.
//     바이옴은 이제 **해역 고르기에만** 쓴다(아래 `areaOfZone`).
//
// ★★새 수 0 · 사본 0 — 이 파일에 수가 없다:
//   · 종       카드 T593 ② 의 열 — **지금 세계에 있는 marine 품목만**(`specialty.js` 의 `category: 'marine'`)
//   · `ko`·`kg` 정본(`specialty.RESOURCES` · `weights.kgOf`)에서 **읽는다**(옮겨 적지 않는다 — 아래 `_row`)
//   · `areas`(해역)·`seasons`(철) **빈칸**(null = 아직 표가 없다 · 전 해역 · 사철) — T592(세션12) 고증 표가 오면 채운다.
//     빈칸은 값이 아니라 값의 부재다(freshfish 의 "고르게"와 같은 규약).
//   · `spots`(자리) — 연어만 강어귀('mouth' · 카드 "연어(하구)"). 나머지는 빈칸(해안 어디서나).
//   ⚠가중 없음 — 그 해역·그 자리·그 철에 사는 종을 **고르게** 나눈다(freshfish 와 같은 규약 · 흔함은 표에 수가 없으므로 안 짓는다).
//   ⚠열량은 `kcal.js` 의 종별 줄이 이미 있다(연어·대구·명태·청어·정어리·멸치·새우·게·문어·오징어) — 여기 안 적는다.
'use strict';

const Fresh = require('./freshfish');   // 철(`seasonOf` — 달력 정본) · 뽑기 몸통(`pickFrom`) — 같은 함수를 부른다

// 자리 두 갈래 — `fishing.spotAt` 의 바다 갈래가 낸다(해안 물가 · 강어귀 곁).
const SPOTS = ['coast', 'mouth'];

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
// `ko`·`kg` 는 정본에게 묻는다 — 늦게 부른다(`specialty`·`weights` 를 이 파일 적재 때 물면 `fishing` ↔ `spoil` 맞물림이 생긴다).
let _Sp = null, _W = null;
const _sp = () => _Sp || (_Sp = require('./specialty'));
const _w = () => _W || (_W = require('./weights'));
const SPECIES = ROWS.map((r) => Object.freeze({
  id: r.id, areas: r.areas, spots: r.spots, seasons: r.seasons,
  get ko() { const x = _sp().RESOURCES && _sp().RESOURCES[r.id]; return (x && x.ko) || r.id; },
  get kg() { return _w().kgOf(r.id) || 0; },
}));
const BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

// 해역 — **바이옴이 고른다**(카드 T593 ②: "바이옴은 해역 고르기에만"). 해역 칸이 빈 지금은 바이옴 이름이 곧 해역 열쇠다
//   (T592 표가 해역 이름을 정하면 이 한 줄이 그 표를 읽는다). 존 설정에 바이옴이 없으면 null(= 모든 해역).
function areaOfZone(zoneId) {
  let Z = null; try { Z = require('./zone-config').ZONES; } catch (e) { Z = null; }
  const z = Z && Z[zoneId];
  return (z && z.biome) || null;
}
// 그 해역·그 자리·그 철에 나는 종 — 빈칸은 "거르지 않는다".
function poolOf(area, spot, day) {
  const se = Fresh.seasonOf(day);
  return SPECIES.filter((s) => (!s.areas || s.areas.indexOf(area) >= 0)
    && (!s.spots || s.spots.indexOf(spot) >= 0)
    && (!s.seasons || s.seasons.indexOf(se) >= 0));
}
// 결정론 추첨 — 민물 표와 **같은 몸통**(`freshfish.pickFrom` · 주사위 0 · 같은 입력 = 같은 종).
const _byId = (id) => BY_ID.get(id);
function pick(area, spot, day, h, choose) { return Fresh.pickFrom(poolOf(area, spot, day), day, h, choose, _byId); }
function kgOf(id) { const s = BY_ID.get(id); return s ? s.kg : 0; }
function koOf(id) { const s = BY_ID.get(id); return s ? s.ko : id; }
function isFish(id) { return BY_ID.has(id); }
module.exports = { SPOTS, SPECIES, areaOfZone, poolOf, pick, kgOf, koOf, isFish, ids: () => SPECIES.map((s) => s.id) };
