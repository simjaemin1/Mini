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
const WELL_PEBBLES = Math.ceil((Math.PI * _meanMouthCm) / _meanStoneCm) * WELL_SRC.tiers;   // = ceil(π·94.5/15) × 2 = 20 × 2 = 40

// 우물 파기 — 두 단계(착공 = 터파기 · 완공 = 벽 두르기). 착공은 곡괭이(움집 ① 수혈 굴착과 같은 도구 문법).
const WELL_STAGES = [
  { need: {},                          tool: 'pickaxe', wear: 3, label: `① 우물 파기(물 나는 모래·자갈층까지 — 깊이 ${WELL_SRC.depthCm}㎝)` },
  { need: { pebble: WELL_PEBBLES },                              label: `② 자갈돌 벽 두르기(자갈 ${WELL_PEBBLES} — ${WELL_SRC.tiers}단)` },
];
const WELL_COST = (() => { const o = {}; for (const st of WELL_STAGES) for (const [k, n] of Object.entries(st.need || {})) o[k] = (o[k] || 0) + n; return o; })();

module.exports = { WELL_SRC, WELL_PEBBLES, WELL_STAGES, WELL_COST };
