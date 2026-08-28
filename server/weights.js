// === server/weights.js — 소지품 kg 정본 [재민 확정 2026-08-27] ==================
//
// 재민 원문: *"모든 아이템은 좀보이드처럼 무게를 가져야 해."*
//
// ★★**정본은 하나다 — 이 파일은 표를 두 벌로 만들지 않는다.**
//   specialty 재화(197종)의 kg 는 `server/specialty.js` 의 `weight` 필드가 정본이고,
//   여기서는 **그걸 읽기만** 한다(값을 옮겨 적지 않는다 — 옮겨 적는 순간 사본이고, 갈린다).
//   이 파일이 스스로 정하는 건 **specialty 에 없는 것들**뿐이다:
//     ⓐ 코어 재화 19종(food·fish·meat·hide·ore·stone·wood…) — econ 내부 재화라 specialty 에 없다.
//     ⓑ 플레이어 전용 아이템(기둥·서까래·이엉·씨앗…) — 어느 카탈로그에도 없다.
//   ⇒ "플레이어용 별도 무게 테이블 금지"(지시서)는 지켜진다: 겹치는 건 한 곳에만 있다.
//
// ★출처: `물품_무게_고증표_kg.md`(재민 작성). 앵커는 **주식 곡물 food = 0.70 kg/단위**
//   (청동기 성인 곡물 일일 배급 0.6~0.8kg · `DAILY_FOOD_CONSUMPTION=1.0/일`).
//   1 게임 단위 = 1인 1일분(식량) / 표준 교역 꾸러미(재료).
//
// ⚠**econ 은 이 파일을 부르지 않는다.** 무게는 **플레이어 층 전용**이다 —
//   NPC 캐러밴 무게 예산(`CARGO_PER_TRIP=100` flat 을 무게 예산으로 바꾸는 일)은 **이번이 아니다**
//   (랩 A/B 선행 · `회부_무게_다음층.md` M항). econ 교역 경로는 한 줄도 안 건드렸다.
'use strict';
const Specialty = require('./specialty');

// ── ⓐ 코어 재화 — 고증표 §1. specialty 에 **없는** econ 재화들 ────────────────
//   (있는 것은 여기 적지 않는다: leather·fur·bone·armor·clothes·hemp·mushroom·obsidian·
//    copper·tin·iron·salmon·shrimp·crab·oyster·seaweed·charcoal·meteorite 등은 specialty 가 정본)
const CORE_KG = {
  food: 0.70,          // ★앵커 — 주식 곡물. 일일 배급 0.6~0.8kg
  fish: 0.90,          // 손질 전 담수·잡어 1마리분
  meat: 1.00,          // 도체 정형 1일분
  cooked_food: 0.55,   // 익힌 한 끼(수분 감소)
  hide: 6.00,          // 생가죽 — 무겁고 부피 큼(가죽 글럿 교역을 국지로 만드는 값)
  herb: 0.08,          // 건조 약재 다발
  ore: 5.00,           // 생광석 암괴 — 최중량 벌크
  stone: 4.00,         // 가공용 석괴
  wood: 3.00,          // 장작·목재 단(段)
  twig: 0.40,          // 불쏘시개
  pebble: 0.60,        // 기초 잔돌
  tool: 1.20,          // 석·청동 손도구
  weapon: 1.50,        // 검·창
  ramie: 0.35,         // 저마 섬유
  fruit: 0.50,         // 생과(수분多)
  vegetable: 0.60,     // 생채소
  jade: 3.00,          // 옥(밀도 ~2.9)
  bronze_tool: 1.30,   // 금속 손도구
  iron_tool: 1.30,
};

// ── 플레이어 아이템 → 카탈로그 키 (이름이 다른 것만) ─────────────────────────
//   ★값을 옮겨 적지 않고 **가리킨다**. `berry` 의 kg 는 `fruit` 하나에만 적혀 있다.
const ITEM_ALIAS = {
  berry: 'fruit',
  berry_jam: 'cooked_food',
  meat_raw: 'meat',
  meat_cooked: 'cooked_food',
  fish_cooked: 'cooked_food',
  food_cooked: 'cooked_food',  // ★[곡물 품목화] 익힌 곡식
  iron_ore: 'iron',            // '철 정광' — 제련 전 정광이라 철괴와 같은 급으로 본다
  meteoric_iron: 'meteorite',  // 운철
  bronze: 'copper',            // 청동 잉곳 ≈ 구리 잉곳(주석 17%는 밀도차 미미)
  // 도구 인스턴스 타입 → 코어 표
  axe: 'tool', pickaxe: 'tool', saw: 'tool', hammer: 'tool',
  sword: 'weapon',
};

// ── ⓑ 플레이어 전용 아이템 — 고증표에 **없어서 내가 유도한 값** ───────────────
//   ★유도 근거를 한 줄씩 남긴다. 표의 앵커에서 뽑았지 지어내지 않았다.
//   ⚠재민 확인 대상으로 `회부_무게_다음층.md` 에 그대로 옮겨 적었다.
const DERIVED_KG = {
  fiber:        0.30,  // 풀 한 아름 — 표 hemp(삼 섬유 다발) 0.40 보다 성기고 가볍다
  thatch:       1.00,  // 이엉 한 단 = 풀 4단을 엮은 것(레시피 fiber×4=1.2kg) — 엮으며 다져 1.00
  pillar:       6.00,  // 굴립주 기둥 = 통나무 3(레시피) 을 깎아 낸 것. 표 pine_log 8.00 의 다듬은 몫
  rafter:       1.50,  // 서까래 = 통나무 1 → 2개(레시피). wood 3.00 ÷ 2
  // ※`plank`(판자)는 여기 없다 — **specialty 가 정본**이라 옮겨 적으면 그게 사본이다(하네스 ①ⓒ가 막는다)
  seed_berry:   0.02,  // 씨앗 한 줌 — 표 최경량군(사프란 0.01 · 누에 0.01) 급
  water_bottle: 1.00,  // 박 물병 + 물 — 표 milk 1.03 과 같은 물 한 되 무게
  // 건축 아이템(인벤에 든 완제 부재) — 레시피 재료 무게를 그대로 물려받는다
  item_wall:    6.00,  // plank 2
  item_floor:   3.00,  // plank 1
  item_door:    6.00,  // plank 2
  item_fence:   3.00,  // plank 1
  item_stair:  12.00,  // plank 4
  item_chest:  12.00,  // plank 4
  item_campfire: 9.00, // wood 3
  item_farmland: 0.02, // seed_berry 1
};

// ── 정본 접근자 ─────────────────────────────────────────────────────────────
//   순서: 별칭 → specialty(정본) → 코어 표 → 플레이어 전용 유도값.
function kgOf(id) {
  if (!id) return null;
  const key = ITEM_ALIAS[id] || id;
  const sp = Specialty.RESOURCES && Specialty.RESOURCES[key];
  if (sp && sp.weight > 0) return sp.weight;
  if (CORE_KG[key] > 0) return CORE_KG[key];
  if (DERIVED_KG[id] > 0) return DERIVED_KG[id];
  return null;
}
// 못 찾으면 0 이 아니라 **기본값**을 준다 — 0 이면 "무게 없는 물건"이 조용히 생긴다.
//   (하네스 ①이 "빠진 품목 0건"을 요구하는 이유가 이것이다. 기본값은 그물이지 답이 아니다.)
const DEFAULT_KG = 1.0;
function kgOfOrDefault(id) { const w = kgOf(id); return w == null ? DEFAULT_KG : w; }

// 전 품목 카탈로그 — 클라는 이걸 **페이로드로 받는다**(클라가 표를 갖지 않는다).
function catalog() {
  const out = {};
  for (const k of Object.keys(Specialty.RESOURCES || {})) out[k] = Specialty.RESOURCES[k].weight;
  for (const k of Object.keys(CORE_KG)) if (out[k] == null) out[k] = CORE_KG[k];
  for (const k of Object.keys(DERIVED_KG)) if (out[k] == null) out[k] = DERIVED_KG[k];
  for (const [item, key] of Object.entries(ITEM_ALIAS)) if (out[item] == null && out[key] != null) out[item] = out[key];
  return out;
}
// 알려진 아이디 전부(하네스 전수 스윕용)
function allIds() { return Object.keys(catalog()); }

module.exports = { CORE_KG, ITEM_ALIAS, DERIVED_KG, DEFAULT_KG, kgOf, kgOfOrDefault, catalog, allIds };
