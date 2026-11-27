'use strict';
// (@regress 없음 — 러너 밖 판 도구 · T1515 · 제품 코드 · 있던 스크립트 손 0)
// =============================================================================
// scripts/t1515-shift.js — **벽시계를 상수만큼 민다**(흐르는 빠르기 1 · 실제 하루 24분 그대로). `NODE_OPTIONS=--require` 로 중앙 · 존 프로세스에만 건다.
//   왜: 날 경계는 벽시계 축의 고정 자리다(`gameDayOf` = (지금 − worldEpoch 0) ÷ 하루 · 마을마다 현지 자정 `_t731LD`). 부팅을 경계 X초 앞에 맞추려면
//     24분마다 한 번 오는 경계를 기다려야 한다(판 하나 ≤ 24분 · 판 72개면 하루 넘게). 이 자는 그 기다림 대신 시계 원점을 옮긴다 —
//     프로세스 안의 "지금" = 실제 지금 + K(`T1515_SHIFT_MS`). 흐름(초당 1초) · 타이머 · 단조 시계(`hrtime` · `performance.now`)는 손대지 않는다
//     ⇒ 마감 길이 · 요청 늦음 · 배경 셈 빠르기는 실제 시계 그대로이고, 경계가 오는 순간만 고른 자리에 선다(가상 시계 `t745-vclock` 과 다르다 — 그것은 시간을 멈춘다).
//   덮는 것: `Date.now()` · 인수 없는 `new Date()` · `Date()` 문자열. 인수 있는 `new Date(x)` · `Date.UTC` · `Date.parse` 는 그대로.
//   K 가 0 이거나 없으면 아무것도 안 건다(이 파일을 안 거는 것과 같다).
// =============================================================================
const K = Number(process.env.T1515_SHIFT_MS || 0);
if (Number.isFinite(K) && K !== 0) {
  const RD = global.Date;
  const now0 = RD.now.bind(RD);
  function SDate(...a) {
    if (!new.target) return new RD(now0() + K).toString();
    return a.length ? new RD(...a) : new RD(now0() + K);
  }
  SDate.prototype = RD.prototype;
  Object.defineProperty(SDate, 'name', { value: 'Date' });
  SDate.now = function () { return now0() + K; };
  SDate.UTC = RD.UTC; SDate.parse = RD.parse;
  Object.setPrototypeOf(SDate, RD);
  global.Date = SDate;
  global.__t1515Shift = K;
}
