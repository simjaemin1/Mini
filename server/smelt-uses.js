// =============================================================================
// smelt-uses.js — ★★[T443 2026-09-27] 노(爐)·숯가마·제련 연료 — 정본 하나
//
//   T419 전수가 찾은 구멍: 서버 노 조업은 정광 1 덩이에 **숯 2** 를 먹는데 econ 제련(`_trySmelt`)은 연료 **0** 이었다.
//   ⇒ `stone-uses.js` 문법 그대로 서버 노 표를 이 파일 하나로 옮긴다(zone 이 읽는다 · 값·키 순서 무변 · 사본 0).
//     econ 은 손잡이 `T443_SMELT_FUEL` 켬일 때만 여기서 원석 한 덩이당 숯을, 숯 한 개당 통나무를 **유도**한다.
//   ★수는 옮겼을 뿐이다 — zone.js 의 `FURNACE_STAGES`·`FURNACE_KINDS`·`FURNACE_FUEL_PER_ORE`·`CHARCOAL_KILN_*`·
//     `ITEM_RECIPES.charcoal` 을 글자 그대로 옮겼다(주석은 zone 쪽에 남겼다).
//   ★순수 모듈(require 없음) — 서버·econ·랩 번들이 같은 파일을 읽는다.
// =============================================================================
'use strict';

// 도가니로(청동기 tech) — 3단계
const FURNACE_STAGES = [
  { need: { stone: 6 },            tool: 'pickaxe', wear: 2, label: '① 노 터 다지기(돌 기초 6)' },
  { need: { stone: 8, wood: 4 },                            label: '② 노벽 쌓기(돌 8·통나무 4)' },
  { need: { hide: 4, wood: 2 },                             label: '③ 풀무 걸기(가죽 4·통나무 2)' },
];
// 노 티어 — 게이트는 era.hasTech 하나(zone). 새 노를 더할 곳은 이 표 하나.
const FURNACE_KINDS = {
  crucible: { ko: '도가니로', stages: FURNACE_STAGES },
  bloomery: { ko: '괴련로', stages: [
    { need: { stone: 10 },           tool: 'pickaxe', wear: 3, label: '① 괴련로 터 다지기(돌 기초 10)' },
    { need: { stone: 14, wood: 6 },                            label: '② 원통 노벽 쌓기(돌 14·통나무 6)' },
    { need: { hide: 6, wood: 4 },                              label: '③ 송풍구·풀무 걸기(가죽 6·통나무 4)' },
  ] },
};
const FURNACE_FUEL_PER_ORE = 2;   // 정광 1덩이당 숯 2
// 숯가마 — 2단계 · 1회 조업 통나무 3 → 숯 4(노천 탄화 레시피는 같은 통나무 3 에 숯 2)
const CHARCOAL_KILN_STAGES = [
  { need: { stone: 4 },            tool: 'pickaxe', wear: 2, label: '① 가마 구덩이 파기(돌 기초 4)' },
  { need: { stone: 6, wood: 2 },                            label: '② 가마 봉토·연도 내기(돌 6·통나무 2)' },
];
const CHARCOAL_KILN_WOOD = 3;
const CHARCOAL_KILN_YIELD = 4;
// 노천 탄화 — 제작창 레시피(zone `ITEM_RECIPES` 가 이 줄을 펼친다 · 시설 없이 된다)
const SMELT_RECIPES = {
  charcoal: { from: { wood: 3 }, to: { charcoal: 2 },                    label: '숯 (통나무 3 → 숯 2 — 노 연료)' },
};

// ── 유도 — econ 이 원석 한 덩이를 녹일 때 무엇을 먹나(새 수 0) ─────────────────────────
// 원석 1 = 숯 `FURNACE_FUEL_PER_ORE`. 숯이 곳간에 없으면 **시설 없이 되는 길**(노천 탄화 레시피)로 그 자리에서 굽는다 —
//   econ 마을엔 숯가마가 없다(숯가마는 플레이어 사유지 시설). ⇒ 숯 1 = 통나무 from.wood ÷ to.charcoal.
const fuelPerOre = () => ({ charcoal: FURNACE_FUEL_PER_ORE });
const woodPerCharcoal = () => SMELT_RECIPES.charcoal.from.wood / SMELT_RECIPES.charcoal.to.charcoal;
const woodPerCharcoalKiln = () => CHARCOAL_KILN_WOOD / CHARCOAL_KILN_YIELD;   // (대조용 — 가마가 있으면 반값)

module.exports = { FURNACE_STAGES, FURNACE_KINDS, FURNACE_FUEL_PER_ORE, CHARCOAL_KILN_STAGES, CHARCOAL_KILN_WOOD, CHARCOAL_KILN_YIELD,
  SMELT_RECIPES, fuelPerOre, woodPerCharcoal, woodPerCharcoalKiln };
