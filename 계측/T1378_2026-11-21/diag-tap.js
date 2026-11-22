'use strict';
// (@regress 없음 — 러너 밖 · T1378 존 곁 프리로드 · 제품 무변 · 읽기만)
// 존이 찍는 `diag` 줄을 파일에 시각과 함께 옮겨 적는다(존 stdout 은 봇 도구가 버린다 — 그 도구를 안 고치려고 곁에서 듣는다).
//   NODE_OPTIONS="-r <이 파일>" T1378_DIAG=<줄 파일> T1378_PID=<pid 파일> node server/zone.js
//   central 등 다른 아이에서는 아무것도 안 한다. 끝날 때 종료 코드 한 줄을 남긴다.
const fs = require('fs');
if (!/server[\/\\]zone\.js$/.test(process.argv[1] || '') || !process.env.T1378_DIAG) return;
const OUT = process.env.T1378_DIAG;
try { if (process.env.T1378_PID) fs.writeFileSync(process.env.T1378_PID, String(process.pid)); } catch (e) {}
const log0 = console.log;
console.log = function () {
  try {
    const s = arguments.length ? String(arguments[0]) : '';
    if (s.indexOf(' diag tick_avg=') >= 0) fs.appendFileSync(OUT, Date.now() + ' ' + s + '\n');
  } catch (e) {}
  return log0.apply(this, arguments);
};
process.on('exit', (c) => { try { fs.appendFileSync(OUT, Date.now() + ' EXIT ' + c + '\n'); } catch (e) {} });
