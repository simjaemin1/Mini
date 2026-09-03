// === server/itemlabel.js — 이름표 정본이 사는 곳 (T61) ==========================
//
// ★왜 이 파일이 생겼나
//   T55 가 `welcome.itemLabels` 로 **품목** 이름표를 클라에 실어 보냈다. 그런데 두 자리가 남았다:
//     ⓐ 클라 사본(`43-i-icon.js ITEM_LABEL` 55키)에만 있는 이름 **20개** — 광물 12 · 건축물 8.
//        서버 표에 없어서, 사본을 지우면 그 스무 개가 영문 키로 떨어진다.
//     ⓑ econ **자원 종류** 이름(`60-t-market.js ITEM_KR` 9키) — 장마당 시세표의 열 이름.
//   ⇒ 둘을 여기서 닫는다. **정본 하나**: 클라에는 표가 남지 않는다(폴백도 없다).
//
// ★★제1 규약: **여기서 이름을 옮겨 적지 않는다.**
//   광물 이름은 `specialty.js RESOURCES[k].ko` 가 정본이고, 건축물 이름은 zone 의
//   `BUILDING_RECIPES[k].label` 이 정본이다. 이 파일은 그 둘을 **부른다**.
//   손으로 적는 것은 아래 `NO_CANON` 하나뿐이고, 그건 **다른 정본이 없는 것**이다(있으면 거기로 옮겨라).
//
// ★★제2 규약: 이미 있는 이름을 **덮지 않는다.** `base`(zone 의 `ITEM_LABEL_SERVER`)가 먼저다 —
//   같은 키가 econ 자원에도 있을 수 있고(예: `salt`·`charcoal`·`plank`), 플레이어 품목 쪽 뜻이 정본이다.
'use strict';
const Specialty = require('./specialty');

// ★econ 자원 종류 — v2 시세표의 **열 이름**이다(품목이 아니라 종류).
//   `specialty.RESOURCES` 는 품목(구리·주석…)을 알지 이 굵은 종류는 모르고, 다른 곳에도 정본이 없다.
//   ⇒ **여기가 그 자리다.** 클라가 이 표를 들면 그게 사본이다(T55 가 품목에서 겪은 그것).
//   이모지를 이름에 붙여 둔 것은 종전 클라 사본의 형식 그대로다(화면이 바뀌면 안 된다).
const CATEGORY_KO = {
  food: '🍞 식량', wood: '🪵 나무', stone: '🪨 돌', ore: '⛏️ 광석', metal: '⚙️ 금속',
  forage: '🌿 채집물', cooked: '🍲 요리', fish: '🐟 생선', meat: '🥩 고기',
};

// ★다른 정본이 없는 이름 — 여기 말고 갈 데가 있으면 거기로 옮겨라.
const NO_CANON = {
  ore_chunk: '원석(kg·미확인)',   // 선광 전 미확인 덩이. `specialty` 는 무게만 알고 이름은 모른다.
};

// 괄호 안 영문 꼬리를 뗀다 — `BUILDING_RECIPES.label` 은 '벽 (Wall)' 꼴이고 화면엔 '벽' 이 맞다.
function koOfLabel(s) { return String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim(); }

// ★품목 이름표 정본 = zone 의 표 + 자원 정본 + 건축 레시피 라벨 + 정본 없는 것 몇.
//   순서가 규약이다: **base 가 먼저**(덮지 않는다).
function itemLabels(base, buildingRecipes) {
  const out = Object.assign({}, base || {});
  const R = Specialty.RESOURCES || {};
  for (const k of Object.keys(R)) { const ko = R[k] && R[k].ko; if (ko && !out[k]) out[k] = ko; }
  for (const k of Object.keys(buildingRecipes || {})) {
    const ko = koOfLabel(buildingRecipes[k] && buildingRecipes[k].label);
    if (ko && !out[k]) out[k] = ko;
  }
  for (const k of Object.keys(NO_CANON)) if (!out[k]) out[k] = NO_CANON[k];
  return out;
}

module.exports = { CATEGORY_KO, NO_CANON, itemLabels, koOfLabel };
