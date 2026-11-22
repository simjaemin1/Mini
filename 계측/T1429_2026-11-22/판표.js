// table29.js — T1429 100날 판 표 · 전(T1416 x-*) · 후(T1429 y-*)
const fs = require('fs'), path = require('path');
const S = process.argv[2] || require('path').join(__dirname, '판줄');   // 판 줄 폴더(x-* = T1416 판 · y-* = T1429 판)
const Kc = require(require('path').join(__dirname, '../../server/kcal')); const U1 = Kc.econUnitsOf('meat_game', 1);
const rd = (f) => { if (!fs.existsSync(f)) return null; const L = fs.readFileSync(f, 'utf8').trim().split('\n').map((x) => JSON.parse(x)).filter((x) => x.d > 0); return L.length ? L : null; };
const row = (L, seed, tag) => {
  const last = L[L.length - 1], ch = last.chase || {}, t = last.t16 || {}, c = last.c16 || {}, z = last.t29 || {};
  const meat = (a, b) => { const s = L.filter((x) => x.d >= a && x.d <= b); return s.length ? +(s.reduce((p, x) => p + x.meat, 0) / U1 / s.length).toFixed(1) : null; };
  const p99 = L.map((x) => x.tick && x.tick.p99).filter((x) => x != null);
  return { seed, tag, days: last.d, pop: last.pop, hun: last.hun, meatKg: meat(1, 100), kills: ch.hunt || 0, butch: ch.butch, lost: ch.carcLost, lostWhy: ch.lostWhy,
    cpuSecDay: +((last.cpu - L[0].cpu) / 1e6 / (last.d - L[0].d)).toFixed(2), fieldCpuSec: +((ch.cpuUs || 0) / 1e6).toFixed(1), steps: ch.steps, wake: ch.wake, tickP99max: p99.length ? Math.max(...p99) : null,
    carryKg: last.carryKg, trips: c.trips, homeKg: c.kg, cacheKg: t.cacheKg, fetchKg: t.fetchKg, leftKg: t.leftKg, lostCarc: t.lostCarc, t29: z };
};
const out = [];
for (const seed of [1020, 7, 42]) for (const [tag, f] of [['전 on', `${S}/x-on-${seed}.p16.jsonl`], ['후 on', `${S}/y-on-${seed}.p16.jsonl`], ['전 all', `${S}/x-all-${seed}.p16.jsonl`], ['후 all', `${S}/y-all-${seed}.p16.jsonl`]]) {
  const L = rd(f); out.push(L ? row(L, seed, tag) : { seed, tag, missing: true });
}
for (const r of out) console.log(JSON.stringify(r));
