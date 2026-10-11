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
const S = { ticks: 0, skipped: {}, over: 0, rsvOut: {}, yieldTicks: 0, decCut: 0 };
// ★★[T695 2026-10-11] **결정 문 몫을 앞에 둔다**(손잡이 `T695_DEC_FIRST=1` · 기본 끔 = T687 그대로 · 공용 예산이 켜져 있을 때만 뜻이 있다).
//   T687 회부 1: 마감 조각이 공용 몫을 다 쓰면 틱 안 차례가 뒤인 주민 결정 문이 **0 명**이 된다(54분에 2,467틱 — T562 ④ 가 막았던 굶음).
//   ⇒ 차례(세계)는 그대로 두고 **몫만** 나눈다: 결정 문보다 앞 차례 문들은 "결정 문이 쓸 몫"을 남기고 쓴다.
//     그 몫은 새 수가 아니다 — **지난 틱 결정 문이 실제로 쓴 시간**(다 돌았으면) · 끊겼으면 결정 문 제 예산(15ms — 그 문의 수).
//   ⚠둘이 같이 굶지 않게: 앞 문이 그 몫 때문에 이 틱을 쉬었으면 다음 틱엔 몫을 안 남긴다(번갈아 — 결정이 무거운 틱에도 마감이 선다).
//   ⚠한 틱 합은 그대로 공용 몫 하나다("마감 16 + 결정 15" 쌓임은 안 선다) — 결정 문이 남은 몫 안에서 돈다.
const DEC_FIRST = ON && typeof process !== 'undefined' && !!process.env && process.env.T695_DEC_FIRST === '1';
let _rsv = 0, _rsvNext = 0, _late = false, _rsvHit = false;
const _rsvNow = () => (DEC_FIRST && !_late ? _rsv : 0);   // 계측 — 문이 몫이 없어 쉰 틱 수(문 이름별)
// 틱 머리 · 꼬리(존 게임 틱만 부른다)
function begin(ms) { if (!ON) return; _ms = ms > 0 ? ms : 0; _end = _ms > 0 ? Date.now() + _ms : 0;
  if (DEC_FIRST) { if (_rsvHit) S.yieldTicks++; _rsv = _rsvHit ? 0 : _rsvNext; _rsvHit = false; _late = false; }   // ★[T695] 지난 틱 앞 문이 몫 때문에 쉬었으면 이번엔 안 남긴다
  if (!S.ticks++) console.log(`[${process.env.ZONE_ID || 'zone'}] ⏱ [T687] 한 틱 공용 예산 켬 — ${_ms}ms(문들이 차례로 남은 몫을 쓴다)`); }
function end() { if (!ON) return; if (_end && Date.now() > _end) S.over++; _end = 0; }
// 남은 몫(ms) — 문 제 예산 `own` 보다 크지 않다. 끔 · 틱 밖 · `own <= 0`(무제한) 이면 `own` 그대로.
function left(own) {
  if (!ON || !_end || !(own > 0)) return own;
  const r = _end - Date.now() - _rsvNow();   // ★[T695] 결정 문 앞 차례면 결정 몫을 남긴다(끔이면 0)
  return r < own ? r : own;
}
// 이 문이 이 틱을 쉬어야 하나(남은 몫 없음) — 끔이면 늘 거짓.
function out(own, name) {
  if (!ON || !_end || !(own > 0)) return false;
  const rv = _rsvNow(), r = _end - Date.now();
  if (r - rv > 0) return false;
  if (name) S.skipped[name] = (S.skipped[name] || 0) + 1;
  if (rv > 0 && r > 0) { _rsvHit = true; if (name) S.rsvOut[name] = (S.rsvOut[name] || 0) + 1; }   // ★[T695] 결정 몫 때문에 쉬었다 — 다음 틱은 번갈아
  return true;
}
// 재개형 일(A* · 넓히기)에 넘길 예산 — 0 은 "무제한 완주"라는 뜻이라 켬일 때는 1ms 아래로 내려 보내지 않는다(알갱이 한 번은 판다).
function slice(own) {
  if (!ON || !_end || !(own > 0)) return own;
  const r = left(own);
  return r >= 1 ? r : 1;
}
// ★[T695] 결정 문 머리 · 꼬리 — 머리부터는 몫을 안 남긴다(결정 문 · 그 뒤 문은 남은 몫 전부) · 꼬리에서 다음 틱 몫을 정한다.
function lateBegin() { _late = true; }
function lateEnd(spentMs, ownMs, cut) { if (!DEC_FIRST) return; if (cut) S.decCut++; _rsvNext = cut ? ownMs : Math.min(ownMs, spentMs); }
function stats() { return ON ? { on: true, ms: _ms, ticks: S.ticks, over: S.over, skipped: Object.assign({}, S.skipped),
  decFirst: DEC_FIRST ? { rsvOut: Object.assign({}, S.rsvOut), yieldTicks: S.yieldTicks, decCut: S.decCut, rsvNext: +_rsvNext.toFixed(2) } : null } : { on: false }; }
module.exports = { ON, DEC_FIRST, begin, end, left, out, slice, stats, lateBegin, lateEnd };
