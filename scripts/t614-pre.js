// (@regress 없음 — 러너 밖 · T614 예비 적재 · `node --require ./scripts/t614-pre.js …` · 정본 파일 무접촉 — 메모리 객체만)
//   T614_PLAN=<안.json>     → `server/hanbando-terrain.json` 의 require 객체에서 안에 든 존 절(한반도·닛폰)을 통째로 바꾼다(t614-make-plan.py 출력)
//   T614_BRIDGES=<br.json>  → `zone-config` ZONES[존].bridges 를 그 flat 셀 줄로 바꾼다({존: [x,y,…]})
'use strict';
const p = require('path'), fs = require('fs'), ROOT = p.join(__dirname, '..');
if (process.env.T614_PLAN) {
  const W = require(p.join(ROOT, 'server', 'hanbando-terrain.json'));
  const P = JSON.parse(fs.readFileSync(process.env.T614_PLAN, 'utf8'));
  for (const [z, sec] of Object.entries(P)) W[z] = sec;
}
if (process.env.T614_BRIDGES) {
  const Z = require(p.join(ROOT, 'server', 'zone-config')).ZONES;
  const Bq = JSON.parse(fs.readFileSync(process.env.T614_BRIDGES, 'utf8'));
  for (const [z, flat] of Object.entries(Bq)) Z[z].bridges = flat;
}
