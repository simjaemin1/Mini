// === scripts/t455-clock.js — [T455 자 · 적재 순간 덧붙임] 이 프로세스의 벽시계를 **고정 원점**에서 흐르게 한다 ===
//   쓰는 법: `NODE_OPTIONS="--require <이 파일>" T455_CLOCK_PRE=1 T455_CLOCK_AT=<ms>` 로 자(예: t410-zone-awake)를 띄운다 —
//   자·central·존 셋이 같은 원점을 본다(흐르는 빠르기는 실시간 그대로). 레포 서버 코드 무접촉(사본도 안 뜬다).
//   `t371-tick-rest` 는 이 파일을 안 쓴다 — 그 자는 사본의 T427 시계 블록 한 글자를 바꾼다(`T455_CLOCK_AT`).
//   ⚠두 손잡이가 다 있어야 돈다(`T455_CLOCK_PRE=1` · `T455_CLOCK_AT`) — 하나만 있으면 아무것도 안 한다.
'use strict';
if (process.env.T455_CLOCK_PRE === '1' && process.env.T455_CLOCK_AT) {
  const real = Date.now, t0 = real(), at = +process.env.T455_CLOCK_AT;
  Date.now = function () { return at + (real() - t0); };
}
