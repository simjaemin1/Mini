'use strict';
// === server/tick-budget.js — 한 틱 공용 시간 예산 [T687 · 2026-10-10] =====================================================
//
// ★왜: 틱 안의 문마다 예산을 따로 잡았다 — 마을 하루 마감 16ms(`VILLAGE_TICK_SLICE_MS`) · 길 플러시 16 · 교역로 선계산 16 ·
//   다시 파기 16 · 도적 부팅 표본 16 · 풀린 길 16.7 · 주민 결정 15 · 밭 그림 15. 한 틱에 둘 셋이 겹치면 각자 예산 안이어도
//   합이 한 프레임(33ms)을 넘는다 — T686 실측: 30ms 넘는 틱 48 중 27 이 "예산 + 한 조각" · "예산끼리 쌓임"이었다.
// ★무엇: 손잡이 `T687_SHARED_BUDGET=1` 이면 틱 머리에서 **한 틱 몫 하나**(= 마을 하루 마감 예산 그 수 · 30Hz 한 프레임의 절반 ·
//   새 수 0)를 세우고, 문들은 **차례 그대로** 남은 몫을 쓴다(문 제 예산과 남은 몫 중 작은 쪽). 남은 몫이 없으면 그 문은 이 틱을
//   쉬고 다음 틱에 잇는다. 예산은 종전처럼 **조각 사이에서만** 본다(조각 하나는 끊지 않는다).
// ★끔(기본) · 틱 밖(부팅 · 하네스 · 헤드리스) · 문 예산 0(= 끈 대조군 · 한 번에 완주) — 전부 종전 그대로(문 제 예산).
// ⚠세계 값은 안 바꾼다 — 바뀌는 것은 *언제*뿐이다(조각내기 · 재개형 A* 의 T85 비트 동일 계약 그대로). 판정은 T650 자 400일 바이트.
const ON = typeof process !== 'undefined' && !!process.env && process.env.T687_SHARED_BUDGET !== '0';   // ★10-11 PM 착지 켬 기본(`0` = 끔)
let _end = 0, _ms = 0;
const S = { ticks: 0, skipped: {}, over: 0 };   // 계측 — 문이 몫이 없어 쉰 틱 수(문 이름별)
// 틱 머리 · 꼬리(존 게임 틱만 부른다)
function begin(ms) { if (!ON) return; _ms = ms > 0 ? ms : 0; _end = _ms > 0 ? Date.now() + _ms : 0; if (!S.ticks++) console.log(`[${process.env.ZONE_ID || 'zone'}] ⏱ [T687] 한 틱 공용 예산 켬 — ${_ms}ms(문들이 차례로 남은 몫을 쓴다)`); }
function end() { if (!ON) return; if (_end && Date.now() > _end) S.over++; _end = 0; }
// 남은 몫(ms) — 문 제 예산 `own` 보다 크지 않다. 끔 · 틱 밖 · `own <= 0`(무제한) 이면 `own` 그대로.
function left(own) {
  if (!ON || !_end || !(own > 0)) return own;
  const r = _end - Date.now();
  return r < own ? r : own;
}
// 이 문이 이 틱을 쉬어야 하나(남은 몫 없음) — 끔이면 늘 거짓.
function out(own, name) {
  if (!ON || !_end || !(own > 0)) return false;
  if (_end - Date.now() > 0) return false;
  if (name) S.skipped[name] = (S.skipped[name] || 0) + 1;
  return true;
}
// 재개형 일(A* · 넓히기)에 넘길 예산 — 0 은 "무제한 완주"라는 뜻이라 켬일 때는 1ms 아래로 내려 보내지 않는다(알갱이 한 번은 판다).
function slice(own) {
  if (!ON || !_end || !(own > 0)) return own;
  const r = left(own);
  return r >= 1 ? r : 1;
}
function stats() { return ON ? { on: true, ms: _ms, ticks: S.ticks, over: S.over, skipped: Object.assign({}, S.skipped) } : { on: false }; }
module.exports = { ON, begin, end, left, out, slice, stats };
