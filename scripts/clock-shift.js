'use strict';
// (@regress 없음 — 러너 밖 · T1356 프리로드 · 제품 무변)
// === scripts/clock-shift.js — 한 판의 프로세스 묶음(하네스 · central · zone · 아이) 벽시계를 `T1356_CLOCK_SHIFT_DAYS` 날 민다 ============
//   정본은 `lib-phase.shift` 한 자리(이 파일은 env 를 읽어 부르기만 — 사본 0 · lint ⑯b). `NODE_OPTIONS="--require <이 파일>"` 로 실으면
//   아이 프로세스도 같은 env 를 물려받아 **같은 상수**로 밀린다.
//   왜 [T1356 · 재민 11-17 테스트 강화 ②]: 사유지 하네스에 `Date.UTC(2026, 10, 14, 12)` 가 박혀 다음 날 깨졌다(T1305). 날짜를 박은 하네스 ·
//   주입 없이 오늘 날짜로 날 경계를 재는 하네스는 시계를 민 판에서 빨개진다 — 야간 "+30일 판"(`nightly-run.sh` `NIGHT_CLOCK_DAYS`)이 이 자를 건다.
//   가상 시계 판(`T745_VCLOCK=1`)은 안 건다(시각을 가상 시계가 정한다). ⚠브라우저(Playwright 페이지)는 안 민다 — node 프로세스만.
// 쓰는 법: T1356_CLOCK_SHIFT_DAYS=30 NODE_OPTIONS="--require $PWD/scripts/clock-shift.js" node scripts/test-….js
const d = process.env.T1356_CLOCK_SHIFT_DAYS;
if (d != null && d !== '' && +d && process.env.T745_VCLOCK !== '1') {
  const S = require('./lib-phase').shift(+d * 86400000);
  //   증인(선택 · `T1356_CLOCK_LOG=<파일>`) — 민 프로세스마다 한 줄(pid · 무엇 · 민 날 · 민 뒤 날짜) — 아이(존 · central)까지 닿았나를 본다
  if (S && process.env.T1356_CLOCK_LOG) { try { require('fs').appendFileSync(process.env.T1356_CLOCK_LOG, `${process.pid} ${require('path').basename(process.argv[1] || '-')} ${S.days} ${new Date().toISOString()}\n`); } catch (e) {} }
}
