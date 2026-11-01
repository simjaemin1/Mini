'use strict';
// (@regress 없음 — 러너 밖 · T1055 갈래 팔 · 제품 무변 · 랩 자 판에서만 세계를 바꾼다)
// === scripts/t1055-arm.js — 랩 자(t17 · t176) 곁 프리로드: 서버 판 자의 집 크루 수를 랩에 거는 진단 팔 ===
//   T1055_ARM=crew1 NODE_OPTIONS="-r $PWD/scripts/t1055-arm.js" node scripts/t17-metrics.js 90 1020
//   crew1 — 랩 자가 `labHouseAttach(v, 칸, { crew: LIFE_CREW, pday })` 를 부를 때 크루를 **서버 판 자에서 실제로 집을 짓는 몸 수**로 준다.
//           서버 `_t400Crew`(villages.js)는 명부 `npcPids`(가시 몸) 앞 `min(LIFE_CREW, 몸 수)` 명이고, 판 자 조건 `VILLAGE_NPC_CAP=1` 에선 몸이 마을마다 1 이다
//           (T1055 관찰기 `bodies` 칸 — 3시드 51곳 89날 전부 1). 그래서 판 자의 집 크루 = min(LIFE_CREW, 1) = 1.
//           이 팔은 그 1 을 `VILLAGE_NPC_CAP` 의 값 그대로 읽는다(새 수 0 · 사본 0 — 판 자 조건이 준 수) · 없으면 팔이 안 선다.
//   없음 — 아무것도 안 한다(랩 판 그대로).
const path = require('path');
const A1 = process.argv[1] || '';
if (!/scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1)) return;
const ARM = process.env.T1055_ARM || '';
if (ARM !== 'crew1') return;
const cap = parseInt(process.env.VILLAGE_NPC_CAP || '', 10);
if (!(cap > 0)) { console.error('[t1055-arm] crew1 팔은 VILLAGE_NPC_CAP(판 자 몸 상한)을 읽는다 — 없어서 팔을 안 세운다'); return; }
const E = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const at = E.labHouseAttach;
let n = 0;
E.labHouseAttach = function (v, cells0, life) {
  const L = Object.assign({}, life || {}); if (L.crew > 0) L.crew = Math.min(L.crew, cap);   // 서버 `_t400Crew` 의 min(LIFE_CREW, 몸 수) — 몸 수 = 판 자 몸 상한
  n++;
  return at.call(this, v, cells0, L);
};
process.on('exit', () => { console.error(`[t1055-arm] crew1 — labHouseAttach ${n}곳 · 크루 상한 ${cap}`); });
