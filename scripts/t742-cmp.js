#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T742 계측기)
// === scripts/t742-cmp.js — 두 판(t740-run + t742-mod-hook)의 모듈 메모리 해시를 날마다 견준다 ==========================================
//   node scripts/t742-cmp.js <판 A 폴더> <판 B 폴더> [--stop 200]
//   ⇒ 칸마다: 멈춤 전(≤ stop)에 갈린 날 수(흔들림) · 멈춤 뒤 첫 갈린 날 · 갈린 날 수 · B 에만 / A 에만 있는 칸.
//     "재기동 탓 후보" = 멈춤 전엔 한 번도 안 갈렸는데 멈춤 뒤 갈린 칸(첫 날 차례).
'use strict';
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf('--' + k); return i >= 0 ? a[i + 1] : d; };
const STOP = +opt('stop', '200');
function load(D) {
  const out = new Map();
  for (const f of ['p1.json.t742.json', 'p2.json.t742.json']) {
    const p = path.join(D, f); if (!fs.existsSync(p)) continue;
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    for (const r of j.days) if (!out.has(r.d) || f.startsWith('p2')) out.set(r.d, r.h);
  }
  return out;
}
const A = load(a[0]), B = load(a[1]);
const per = {};
for (const [d, ha] of A) {
  const hb = B.get(d); if (!hb) continue;
  for (const k of new Set([...Object.keys(ha), ...Object.keys(hb)])) {
    if (ha[k] === hb[k]) continue;
    const p = per[k] || (per[k] = { pre: 0, post: 0, first: null, onlyA: 0, onlyB: 0 });
    if (d <= STOP) p.pre++; else { p.post++; if (p.first == null || d < p.first) p.first = d; }
    if (!(k in hb)) p.onlyA++; if (!(k in ha)) p.onlyB++;
  }
}
const days = [...A.keys()].filter((d) => B.has(d));
console.log(`견준 날 ${days.length}(멈춤 전 ${days.filter((d) => d <= STOP).length} · 뒤 ${days.filter((d) => d > STOP).length}) · 칸 ${Object.keys(A.get(days[0]) || {}).length}`);
const cand = Object.entries(per).filter(([, p]) => !p.pre && p.post).sort((x, y) => x[1].first - y[1].first || x[0].localeCompare(y[0]));
console.log(`\n재기동 탓 후보(멈춤 전 0 · 뒤에 갈림) ${cand.length}:`);
for (const [k, p] of cand) console.log(`  ${k.padEnd(44)} 첫 ${p.first} · 갈린 날 ${p.post}${p.onlyA ? ` · A 에만 ${p.onlyA}` : ''}${p.onlyB ? ` · B 에만 ${p.onlyB}` : ''}`);
const noisy = Object.entries(per).filter(([, p]) => p.pre).sort((x, y) => y[1].pre - x[1].pre);
console.log(`\n흔들림(멈춤 전에도 갈림) ${noisy.length}: ${noisy.map(([k, p]) => `${k}(${p.pre}/${p.post})`).join(' · ')}`);
if (a.includes('--json')) console.log(JSON.stringify(per));
