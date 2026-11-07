'use strict';
// (@regress 없음 — 러너 밖 · T1166 계측기 · 읽기만 · 제품 무변 · 판정 0)
// === scripts/t1166-size-hook.js — 서버 판 자(`t577-server-run.js`) 곁 프리로드: 날마다 "지금 저장하면 몸 줄에 더해질 NPC 손 로트 칸(`_lots`)" 크기를 잰다 ===
//   쓰는 법: NODE_OPTIONS="-r $PWD/scripts/t1166-size-hook.js" T1166_SIZE_OUT=/tmp/t1166 node scripts/t577-server-run.js 400 1020,7,42
//   (`T577_SEED` 가 있는 아이 존만 · 마을 셈 `villages.t1166Sizes()` 를 econ 하루 끝 장부 문(`scanDay` — t815 · t650 과 같은 문)에서 부른다)
//   ⇒ $T1166_SIZE_OUT/size-<시드>.json — 날마다 [날 · 로트 든 몸 · 레코드 · 바이트 · 로트 든 마을 · 마을 최대 바이트 · 몸 최대 바이트] · 최대 줄
if (!process.env.T577_SEED) return;
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.T1166_SIZE_OUT || '/tmp/t1166';
const Ev = require(path.join(ROOT, 'server', 'events'));
const rows = [];
let V = null;
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if (!V) V = require(path.join(ROOT, 'server', 'villages')); const s = V.t1166Sizes && V.t1166Sizes(); if (s) rows.push([day | 0, s.bodies, s.recs, s.bytes, s.vils, s.maxVilBytes, s.maxBodyBytes, s.npcs]); } catch (e) {}
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => {
  try {
    fs.mkdirSync(OUT, { recursive: true });
    const max = (i) => rows.reduce((m, r) => Math.max(m, r[i]), 0);
    const withLot = rows.filter((r) => r[1] > 0);
    fs.writeFileSync(path.join(OUT, `size-${process.env.T577_SEED}.json`), JSON.stringify({ seed: +process.env.T577_SEED, days: rows.length, daysWithLot: withLot.length,
      max: { bodies: max(1), recs: max(2), bytes: max(3), vils: max(4), vilBytes: max(5), bodyBytes: max(6) },
      meanWhenLot: withLot.length ? { bodies: +(withLot.reduce((a, r) => a + r[1], 0) / withLot.length).toFixed(1), bytes: Math.round(withLot.reduce((a, r) => a + r[3], 0) / withLot.length) } : null,
      rows }));
  } catch (e) {}
});
