#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1426 ⑤ⓐ) 두 판의 `eq-srv-dump` 덤프(같은 날)를 칸 · 마을마다 견준다 — 갈린 칸 · 마을 수 · 첫 마을의 두 값(앞 600자)
//   node scripts/eq-srv-dumpcmp.js <A-d21.json> <B-d21.json> [--json out]
'use strict';
const fs = require('fs');
const [fa, fb] = process.argv.slice(2).filter((x) => !x.startsWith('--'));
const A = JSON.parse(fs.readFileSync(fa, 'utf8')), B = JSON.parse(fs.readFileSync(fb, 'utf8'));
const out = { day: A.day, world: [], vil: {} };
for (const k of new Set(Object.keys(A.world).concat(Object.keys(B.world)))) {
  const a = A.world[k], b = B.world[k];
  if (!a || !b || a[0] !== b[0]) out.world.push({ k, a: a ? a[1].slice(0, 300) : '(없음)', b: b ? b[1].slice(0, 300) : '(없음)' });
}
A.villages.forEach((va, i) => {
  const vb = B.villages[i] || {};
  for (const k of new Set(Object.keys(va).concat(Object.keys(vb)))) {
    const a = va[k], b = vb[k];
    if (a && b && a[0] === b[0]) continue;
    const o = out.vil[k] || (out.vil[k] = { n: 0, first: null });
    o.n++; if (!o.first) o.first = { i, a: a ? a[1] : '(없음)', b: b ? b[1] : '(없음)' };
  }
});
const J = process.argv.indexOf('--json'); if (J > 0) fs.writeFileSync(process.argv[J + 1], JSON.stringify(out, null, 1));
console.log(`날 ${out.day} · 세계 칸 갈림 ${out.world.length} · 마을 칸 갈림 ${Object.keys(out.vil).length}`);
for (const w of out.world) console.log(`  [세계] ${w.k}\n     A ${w.a}\n     B ${w.b}`);
for (const [k, o] of Object.entries(out.vil).sort((x, y) => y[1].n - x[1].n)) console.log(`  [마을] ${k} — ${o.n}마을 · 첫 V${o.first.i}\n     A ${String(o.first.a).slice(0, 260)}\n     B ${String(o.first.b).slice(0, 260)}`);
