// =============================================================================
// bridge-stages.js — ★★[T527 2026-09-29] 다리 짓는 공정·자재 — 정본 하나(`hut-stages.js` · `granary-stages.js` · `well-stages.js` 문법)
//
//   왜: 다리는 지금 시딩 때 계획기가 놓는 것뿐이다(존 설정 `bridges`). 마을이 새 다리를 **짓는 일**이 없다.
//   집(T400)·곳간(T435)·우물(T509)은 행위가 됐다 ⇒ 다리도 크루가 곳간에서 자재를 꺼내 날라 놓아야 선다(손잡이 `T527_BRIDGE_ACT` 기본 끔).
//   ★착공 자리는 이 표가 정하지 않는다 — 계획기 v2 후보 셀 그대로(존 설정 `bridgeSites` · 폭 2셀 · 축 4방).
//   ★수는 출토 보고의 수(아래 `BRIDGE_SRC`)만 적고, 자재 개수는 그 수와 **다리의 칸 수**에서 **유도**한다(새 수 0 · 사본 0).
//   ★순수 모듈(require 없음 · Node 전용 API 0). 원자재로 풀 때는 부르는 쪽이 레시피 표(움집 `HUT_RECIPES` · 곳간 `GRANARY_RECIPES`)를 넘긴다.
// =============================================================================
'use strict';

// ── 출토 보고의 수 — 영국 테스트우드 호수(Testwood Lakes) 청동기 다리(방사성탄소 ~1,500BC · Wessex Archaeology) ──────────
//   https://www.wessexarch.co.uk/our-work/testwood-lakes
//   인용(15자 안): "143 timbers driven into the river bed"
//   요약: 길이 약 26 m · 폭 1.5~2 m · 곧게 선 말뚝 두 줄(간격 약 1.5 m)이 약 22 m 이어진다 · 가장 큰 말뚝 지름 0.25 m·높이 3 m ·
//         상판 판자 15 매 조각 · 목재는 참나무 위주(오리나무·물푸레·개암·버들) · **돌 기재 0**.
//   ⚠한반도 청동기 다리 유구는 이 판에서 못 찾았다(징검다리 포함 · 보고/T527 §ⓑ) — 같은 시대 통나무 다리의 실측을 쓴다.
const BRIDGE_SRC = {
  lengthM: 26,          // 다리 전체 길이(착지 포함)
  widthM: [1.5, 2],     // 폭 — 게임 다리 폭 2셀(2 m · 1셀 = 1 m)과 맞는다
  stakeRunM: 22,        // 말뚝 두 줄이 이어진 길이(= 물 위 구간)
  stakeRows: 2,
  timbers: 143,         // 강바닥에 박은 목재 수(두 줄 합)
  stone: 0,             // 돌 — 기재 0
};
// ── 유도 — 말뚝 = 물 칸 1 m 마다 `timbers ÷ stakeRunM` 개(올림) · 널 = 다리 칸마다 판자 1(존 `floor` 설치 비용과 같은 수 — 하네스가 대조) ──
const STAKES_PER_M = BRIDGE_SRC.timbers / BRIDGE_SRC.stakeRunM;   // = 6.5
const DECK_PER_CELL = { plank: 1 };                                // = zone.js `floor: { plank: 1 }`(바닥 한 칸)
function stakesFor(span) { return Math.ceil(STAKES_PER_M * Math.max(0, span | 0)); }
//   다리 한 채의 공정 — span = 물 칸 수(계획기 v2 `span`) · nCells = 다리 칸 수(폭 2 × (span + 착지 2))
//   ① 말뚝 박기: 굴립주 기둥(`pillar` — 움집 ② 와 같은 중간재 · 통나무 3)을 물 칸 1 m 마다 6.5 개
//   ② 널 깔기: 판자(`plank` — 곳간과 같은 중간재 · 통나무 1 → 판자 2)를 다리 칸마다 1
function bridgeStages(span, nCells) {
  const deck = {}; for (const [k, n] of Object.entries(DECK_PER_CELL)) deck[k] = n * Math.max(0, nCells | 0);
  return [
    { need: { pillar: stakesFor(span) }, label: `① 말뚝 박기(기둥 ${stakesFor(span)} — 물 ${span | 0} m × ${STAKES_PER_M})` },
    { need: deck,                         label: `② 널 깔기(판자 ${deck.plank || 0} — 다리 ${nCells | 0} 칸)` },
  ];
}
// 원자재 — 레시피 표(`{ item: { from, to } }`)로 되돌린다(올림). `hut-stages.rawOfNeed` 와 같은 문법.
function rawOfNeed(need, recipes) {
  const out = {};
  for (const [k, n] of Object.entries(need || {})) {
    const rc = recipes && recipes[k];
    if (!rc) { out[k] = (out[k] || 0) + n; continue; }
    const per = (rc.to && rc.to[k]) || Object.values(rc.to || {})[0] || 1;
    const times = Math.ceil(n / per);
    for (const [m, q] of Object.entries(rc.from || {})) out[m] = (out[m] || 0) + q * times;
  }
  return out;
}
function bridgeRaw(span, nCells, recipes) {
  const out = {};
  for (const st of bridgeStages(span, nCells)) for (const [k, n] of Object.entries(rawOfNeed(st.need, recipes))) out[k] = (out[k] || 0) + n;
  return out;
}

module.exports = { BRIDGE_SRC, STAKES_PER_M, DECK_PER_CELL, stakesFor, bridgeStages, rawOfNeed, bridgeRaw };
