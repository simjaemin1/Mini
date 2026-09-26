// =============================================================================
// stone-uses.js — ★★[T419 2026-09-26] 돌을 재료로 받는 물건 중 **econ 이 같은 물건을 만드는 자리**의 정본
//
//   T400 이 집 자재를 `hut-stages.js` 한 표로 세우자 econ 의 집 석재(`HOUSE_STONE 2.5/인`)가 켬에서 0 이 됐다.
//   그럼 돌은 어디서 실물로 쓰이나 — 전수 표(보고/T419 §0-ⓐ)가 찾은 **econ ↔ 서버 짝** 셋이 이 파일에 산다:
//     ① 정품 간석기   서버 작업대 `EQUIPMENT_RECIPES.tool`   (돌 qty 개)  ↔ econ 석공 도구(`mason` · 돌 0.2 × taper /일)
//     ② 마제석검      서버 작업대 `EQUIPMENT_RECIPES.weapon` (돌 qty 개)  ↔ econ 석공 마제석검(돌 0.5 /일)
//     ③ 막석기        서버 맨손 `RECIPES.crude_*`(자갈·잔가지·풀 — **돌 0**) ↔ econ 자급 막석기(돌 0.5 /개)
//   ★수는 옮겨 적지 않았다 — zone.js 에 있던 그 값 그대로 이 파일로 **옮겼고** zone 은 여기서 읽는다(사본 0).
//     econ(`sim/economy-sim.js`)은 손잡이 `T419_STONE_REAL` 켬일 때만 여기서 단가를 **유도**한다(끔 = 종전 수 · 비트 동일).
//   ★순수 모듈(require 없음) — 서버·econ·랩 번들이 같은 파일을 읽는다.
// =============================================================================
'use strict';

// 작업대 정품 장비의 재료 개수(한 가지 재료 × qty) — zone `EQUIPMENT_RECIPES.weapon/tool.qty` 의 정본.
const EQUIP_MAT_QTY = { weapon: 3, tool: 3 };

// ── ★★조잡한 석기 — **맨손으로, 주운 것만으로** [재민 확정 2026-08-28] ──────────────
//   재민 원문: *"돌멩이를 줍고 나뭇가지를 줍고"*. 빈손으로 도착한 사람이 **오늘을 버티게** 해 주는 물건이다.
//   고증: 청동기 후기에도 서민의 일상 도구는 돌이었고, 급하면 자갈을 깨 날을 세워 나뭇가지에
//   섬유로 동여맸다(뗀석기 급조). 위세축·청동과는 무관한 층이다 — 이걸 갖고 자랑하지 않는다.
//   ★★**명확히 나빠야 한다**: 효율은 정품이 준 이득의 절반(`CRUDE_EFF_FRAC`),
//     내구는 정품의 1/4(`CRUDE_DURA_FRAC`). 자급이 충분해지면 마을 장인 경제가 죽는다(듀랑고의 자급자족 병).
//   (T419 — zone.js `RECIPES` 에 있던 세 줄을 글자 그대로 옮겼다 · zone 은 펼쳐 넣는다 · 키 순서 불변)
const CRUDE_TOOLS = {
  crude_axe:   { cost: { pebble: 2, twig: 1, fiber: 2 }, label: '조잡한 돌도끼', crude: true },
  crude_pick:  { cost: { pebble: 3, twig: 1, fiber: 2 }, label: '조잡한 돌괭이', crude: true },
  crude_blade: { cost: { pebble: 2, twig: 1, fiber: 1 }, label: '조잡한 돌칼',   crude: true },
};

// ── 유도 — econ 이 한 개당 무엇을 먹나(표에서 · 새 수 0) ──────────────────────────────
// 정품 간석기 한 자루 · 마제석검 한 자루 = 돌 qty 개.
const perTool = () => ({ stone: EQUIP_MAT_QTY.tool });
const perStoneSword = () => ({ stone: EQUIP_MAT_QTY.weapon });
// 막석기 한 자루 = 조잡한 석기 세 종의 **평균** 재료(econ 은 어느 종인지 모른다 — "급할 때 손수 깬 돌" 한 개).
function perCrudeTool() {
  const ks = Object.keys(CRUDE_TOOLS), o = {};
  for (const k of ks) for (const [m, n] of Object.entries(CRUDE_TOOLS[k].cost || {})) o[m] = (o[m] || 0) + n;
  for (const m of Object.keys(o)) o[m] = o[m] / (ks.length || 1);
  return o;
}

module.exports = { EQUIP_MAT_QTY, CRUDE_TOOLS, perTool, perStoneSword, perCrudeTool };
