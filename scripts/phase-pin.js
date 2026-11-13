'use strict';
// (@regress 없음 — 러너 밖 · T1299 프리로드 · 제품 무변)
// === scripts/phase-pin.js — 벽시계 판 묶음(하네스 · central · zone · 아이)의 띄운 시각 낮밤을 게임 `T1299_PHASE_HOUR` 시에 고정한다 ============
//   정본은 `lib-phase.pin` 한 자리(이 파일은 env 를 읽어 부르기만 — 사본 0). `NODE_OPTIONS="--require <이 파일>"` 로 실으면 아이 프로세스도
//   같은 env(`T1299_PHASE_HOUR` · 먼저 건 프로세스가 적은 `T1299_PHASE_OFF`)를 물려받아 **같은 상수**로 옮겨진다.
//   가상 시계 판(`T745_VCLOCK=1`)은 안 건다(시각을 가상 시계가 정한다).
// 쓰는 법: T1299_PHASE_HOUR=18 NODE_OPTIONS="--require $PWD/scripts/phase-pin.js" node scripts/e2e-….js
//   하네스 안에서: require('./lib-phase').pin(0) — 판 머리에서 한 번(아이를 띄우기 앞 · 아이는 env 로 같은 상수를 받는다)
const h = process.env.T1299_PHASE_HOUR;
if (h != null && h !== '' && process.env.T745_VCLOCK !== '1') require('./lib-phase').pin(+h);
