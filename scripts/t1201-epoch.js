'use strict';
// (@regress 없음 — 러너 밖 · T1201 판 자 조건 · 프리로드 · 제품 무변)
// === scripts/t1201-epoch.js — 서버 판 자에서 생활층 날을 econ 날에 맞춘다 ===============================================
//   왜: 생활층 날 = `gameDayOf(now)` = (지금 − `WORLD.worldEpoch`) ÷ 하루 길이. `worldEpoch` 는 0 이다(`server/zone-config.js`).
//     판 자는 하루 250 ms(`VILLAGE_DAY_MS`)라 날이 지금 ÷ 250 ≈ 70억이 되고, 달력 정본(`events.calendarOf`)은 2³¹ 을 넘는 날을 0 날(3월 1일)로 본다
//     ⇒ 판 자 안에서 생활층 밭은 달이 늘 3월이다(파종창 · 휴면 · 익음이 econ 철과 무관 — T1201 보고 §0).
//   이 프리로드는 판 자 안에서만 `worldEpoch` 를 존이 뜨는 때(가상 시계)로 둔다 ⇒ 생활층 날이 0 부터 econ 날과 같이 간다.
//   ⚠제품 무변(파일 안 고침) · `T577_SEED` 가 선 존 프로세스에서만 · `t745-vclock.js` 다음에 건다.
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const path = require('path');
const ZC = require(path.join(__dirname, '..', 'server', 'zone-config'));
ZC.WORLD.worldEpoch = Date.now();
