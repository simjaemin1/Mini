'use strict';
// (@regress 없음 — 러너 밖 · T1000 자 · 제품 무변 · 읽기만)
// === scripts/t1000-load-probe.js — 존 곁 프리로드: central 저장 요청(`central-client.updatePlayer`)의 수 · 지연 · 실패를 센다 ===
//   NODE_OPTIONS="-r $PWD/scripts/t1000-load-probe.js" T1000_OUT=<파일> node server/zone.js
//   5초마다 파일을 다시 쓴다(SIGKILL 로 끝나도 남는다). 지연 = 요청을 낸 순간 ~ central 응답(존이 기다리지 않는 fire-and-forget 그 약속).
const path = require('path'), fs = require('fs');
if (!/server[\/\\]zone\.js$/.test(process.argv[1] || '') || !process.env.T1000_OUT) return;
const CC = require(path.join(__dirname, '..', 'server', 'central-client.js'));
const rec = { t0: Date.now(), n: 0, fail: 0, ms: [], byPid: {} };
const mk = CC.updatePlayer;
CC.updatePlayer = function (id, patch) {
  const t = Date.now(); rec.n++; rec.byPid[id] = (rec.byPid[id] || 0) + 1;
  const pr = mk.apply(this, arguments);
  pr.then(() => { rec.ms.push(Date.now() - t); }, () => { rec.fail++; rec.ms.push(Date.now() - t); });
  return pr;
};
const flush = () => { try { fs.writeFileSync(process.env.T1000_OUT, JSON.stringify({ ...rec, t1: Date.now() })); } catch (e) {} };
setInterval(flush, 5000).unref(); process.on('exit', flush);
