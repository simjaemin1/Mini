// =============================================================================
// well-stages.js — ★★[T509 2026-09-29] 우물 짓는 공정·재료 — 정본 하나(`hut-stages.js` · `granary-stages.js` 문법)
//
//   왜: 이 세계의 민물은 **강·호수 타일뿐**이다(샘 0 · 우물 0). 내륙 마을의 문 앞에서 물가까지 p95 가 335 걸음(보고/T509 §ⓐ).
//   청동기 우물은 출토된다 — 대구 동천동(석조 · 4기)과 논산 마전리(목조). 이 표는 **동천동 1호**의 실측에서 공정·재료를 유도한다.
//   ★수는 출토 보고의 수(아래 `WELL_SRC`)만 적고, 재료 개수는 그 수에서 **유도**한다(새 수 0 · 사본 0).
//   ★순수 모듈(require 없음). 서버(`zone.js` — 손잡이 `T509_WELL` 기본 끔)만 읽는다 · econ 무접촉.
//   ⚠지하수(우물에 물이 고이느냐)는 이 표가 정하지 않는다 — 가용도는 재민 #88(보고 §ⓒ 후보: 강·호수 거리에서 유도).
// =============================================================================
'use strict';

// ── 출토 보고의 수(동천동 우물 1호 · 매일신문 2014-03-15 「동천동 청동기 유물」 인용 · 보고/T509 §ⓒ) ──────────
//   "전체 규모는 110×79㎝" · "우물 벽은 2단으로 좁아지는 구조" · "깊이는 61㎝" ·
//   "바닥은 물이 스며 나오는 모래 자갈돌까지 파서" · "10, 20㎝의 자갈돌로 벽을 시공"
const WELL_SRC = {
  mouthCm: [110, 79],      // 아가리 긴지름·짧은지름
  depthCm: 61,             // 깊이 — 물이 스며 나오는 모래·자갈층까지
  tiers: 2,                // 벽이 2단으로 좁아진다
  stoneCm: [10, 20],       // 벽 자갈돌 크기
};
// ── 유도 — 벽 자갈 수 = 단마다 둘레(타원 근사 π·평균지름) ÷ 돌 평균 크기 · 올림 × 단 수 ─────────────
const _meanMouthCm = (WELL_SRC.mouthCm[0] + WELL_SRC.mouthCm[1]) / 2;
const _meanStoneCm = (WELL_SRC.stoneCm[0] + WELL_SRC.stoneCm[1]) / 2;
const WELL_PEBBLES_PER_TIER = Math.ceil((Math.PI * _meanMouthCm) / _meanStoneCm);   // = ceil(π·94.5/15) = 20 — 한 단 둘레
const WELL_PEBBLES = WELL_PEBBLES_PER_TIER * WELL_SRC.tiers;                             // = 20 × 2 = 40

// 우물 파기 — 세 단계(착공 = 터파기 · ② 1단 벽 · ③ 2단 벽 = 완공). 착공은 곡괭이(움집 ① 수혈 굴착과 같은 도구 문법).
//   ★[T557 · T519 회부 1] 벽을 **단마다** 가른다 — 출토 벽이 2단으로 좁아지는 구조라 공정도 둘이다(그림 `well_s2` = 1단을 쌓은 터).
const WELL_STAGES = [
  { need: {},                                   tool: 'pickaxe', wear: 3, label: `① 우물 파기(물 나는 모래·자갈층까지 — 깊이 ${WELL_SRC.depthCm}㎝)` },
  { need: { pebble: WELL_PEBBLES_PER_TIER },                              label: `② 자갈돌 벽 1단(자갈 ${WELL_PEBBLES_PER_TIER})` },
  { need: { pebble: WELL_PEBBLES_PER_TIER },                              label: `③ 자갈돌 벽 2단 — 좁혀 쌓기(자갈 ${WELL_PEBBLES_PER_TIER})` },
];
const WELL_COST = (() => { const o = {}; for (const st of WELL_STAGES) for (const [k, n] of Object.entries(st.need || {})) o[k] = (o[k] || 0) + n; return o; })();

// ── ★[T557 · 재민 #88 2026-09-30] **어디서 팔 수 있나 — 지하수 가용도** ─────────────────────────────────────────────
//   판정기록 #88: "우물 켬 — p95 밖 임업4·농촌10·광산1·임업1"(T509 §ⓐ: 도착 자리에서 마실 자리까지 실걸음 p95 335 m 밖 둘 + p95 선 광산1 + 200 m 밖 임업1).
//   이 표는 **데이터**다(재민 결정 값 그대로) — 우물은 이 마을들의 노동권(`sustain.LABOR_R` 셀 · 후보 자리 기준) 안에서만 판다.
//   ⚠수위(마른 우물)는 없다(#88 — T519 회부 5). 표를 넓히면 그대로 따라온다(코드 0줄).
const WELL_VILLAGES = ['임업4', '농촌10', '광산1', '임업1'];

module.exports = { WELL_SRC, WELL_PEBBLES_PER_TIER, WELL_PEBBLES, WELL_STAGES, WELL_COST, WELL_VILLAGES };
