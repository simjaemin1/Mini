// =============================================================================
// granary-stages.js — ★★[T435 2026-09-27] 곳간(5×3 고상 창고) 짓는 재료 — 정본 하나
//
//   T419 전수가 찾은 구멍: NPC 마을의 곳간 증설(`villages.js _lifeGranAdd`)은 **재료 0** 으로 섰다(집이 T400 전에 그랬던 자리).
//   플레이어 길드 곳간(`zone.js tryBuildGuildGranary`)은 판자 12·돌 8 을 냈다 — 같은 5×3 곳간인데 한쪽만 값을 치렀다.
//   ⇒ `hut-stages.js` 문법 그대로 표 하나를 세운다: 플레이어 곳간·NPC 곳간·econ 이 **이 표를 읽는다**(사본 0).
//   ★수는 옮겼을 뿐이다 — zone.js 에 있던 `GRANARY_COST = { plank: 12, stone: 8 }` 와 판자 레시피(`ITEM_RECIPES.plank`)를
//     글자 그대로 이 파일로 옮겼다. zone 은 여기서 읽는다. econ 은 손잡이 `T435_GRANARY_ACT` 켬일 때만 여기서 원자재를 유도한다.
//   ★순수 모듈(require 없음) — 서버·econ·랩 번들이 같은 파일을 읽는다.
// =============================================================================
'use strict';

// 곳간 짓기 — 공정 한 단계(플레이어 길드 곳간은 한 번에 치른다 · NPC 크루는 이 재료를 날라 놓는다).
const GRANARY_STAGES = [
  { need: { plank: 12, stone: 8 }, label: '곳간 짓기(판자 12·돌 8)' },
];
// 판자 — 곳간 재료의 중간재(zone `ITEM_RECIPES` 가 이 줄을 펼친다 · 키 순서 불변 — 표의 첫 줄).
const GRANARY_RECIPES = {
  plank:   { from: { wood: 1 }, to: { plank: 2 }, requiresTool: 'saw', label: '판자 (통나무 1 → 판자 2)' },
};
// 유도 — 한 동에 드는 재료(중간재 그대로) · 원자재(레시피로 풀어 · 올림).
const GRANARY_COST = (() => { const o = {}; for (const st of GRANARY_STAGES) for (const [k, n] of Object.entries(st.need || {})) o[k] = (o[k] || 0) + n; return o; })();
function granaryRaw() {
  const o = {};
  for (const [k, n] of Object.entries(GRANARY_COST)) {
    const r = GRANARY_RECIPES[k];
    if (!r) { o[k] = (o[k] || 0) + n; continue; }
    const per = (r.to && r.to[k]) || 1, times = Math.ceil(n / per);
    for (const [m, q] of Object.entries(r.from || {})) o[m] = (o[m] || 0) + q * times;
  }
  return o;
}

module.exports = { GRANARY_STAGES, GRANARY_RECIPES, GRANARY_COST, granaryRaw };
