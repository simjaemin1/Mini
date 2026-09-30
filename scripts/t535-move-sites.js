// === scripts/t535-move-sites.js — 마을 후보 자리를 **자 안에서만** 덮어 잰다(T535 ② · 러너 밖 · 제품 무변) ==========
//   `NODE_OPTIONS=--require=<이 파일>` + `T535_MOVE=<json>`(+ `T535_MOVE_ZONE`, 기본 nippon) — json = { 후보이름: [x px, y px] }.
//   `server/terrain` 의 `getZoneVillages`(t17-metrics · audit-reachability 가 부른다) · `siteCandidates`(t524-land-audit · 서버 시딩이 부른다)
//   두 문이 **그 존에서만** 옮긴 자리를 돌려준다. 나머지 필드(이름 · 꼴 · …)는 원본 그대로 · 원본 배열은 안 건드린다(사본).
//   `siteCandidates` 를 고치지 않는다 — 카드 규약("자리는 시딩을 바꾸니 기준선 칸 → 표만").
'use strict';
const path = require('path');
const fs = require('fs');
const FILE = process.env.T535_MOVE;
if (FILE) {
  const MOVE = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  const ZID = process.env.T535_MOVE_ZONE || 'nippon';
  const T = require(path.join(__dirname, '..', 'server', 'terrain'));
  const wrap = (fn) => function (z, ...rest) {
    const r = fn.call(this, z, ...rest);
    if (z !== ZID || !Array.isArray(r)) return r;
    return r.map((v) => (v && MOVE[v.name]) ? { ...v, x: MOVE[v.name][0], y: MOVE[v.name][1], _t535From: [v.x, v.y] } : v);
  };
  for (const k of ['getZoneVillages', 'siteCandidates']) if (typeof T[k] === 'function') T[k] = wrap(T[k]);
  process.stderr.write(`[T535] ${ZID} 후보 자리 덮음 ${Object.keys(MOVE).length}곳: ${Object.keys(MOVE).join(' · ')}\n`);
}
