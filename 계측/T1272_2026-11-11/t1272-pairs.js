#!/usr/bin/env node
// T1272 — 같은 시드 짝 Δ 표(읽기만) · 판 폴더 R(기본 /dev/shm/t1272)/<팔>-<시드>/farm.json
'use strict';
const fs = require('fs');
const R = process.env.R || '/dev/shm/t1272';
const SEEDS = (process.argv[2] || '1020,7,42,1,2,3,4,5,6,8').split(',').map(Number);
const PAIRS = [['켬', 'F1', 'F1R'], ['① 만 종전', 'F1', 'F1off1'], ['밭 끔 켬', 'F0', 'F0R']];
const rd = (a, s) => { try { return JSON.parse(fs.readFileSync(`${R}/${a}-${s}/farm.json`, 'utf8')); } catch (e) { return null; } };
const met = (f) => ({ pop: f.pop, dead: f.dead, cook: (f.jobDaysTot || {}).cook || 0, farmer: (f.jobDaysTot || {}).farmer || 0,
  harvest: f.harvestNTot || 0, houseUp: f.houseUpTot || 0, gated: f.gatedDaysTot || 0, famine: f.famineDaysTot || 0, price: f.priceFoodMean || 0 });
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const pct = (a, b) => (b / a - 1) * 100;
const out = { seeds: SEEDS, arms: {}, pairs: {} };
for (const a of ['F1', 'F1R', 'F1off1', 'F0', 'F0R']) { out.arms[a] = {}; for (const s of SEEDS) { const f = rd(a, s); if (f) out.arms[a][s] = met(f); } }
for (const [name, A, B] of PAIRS) {
  const rows = []; for (const s of SEEDS) { const x = out.arms[A][s], y = out.arms[B][s]; if (!x || !y) continue;
    const r = { seed: s }; for (const k of Object.keys(x)) { r[k] = y[k] - x[k]; r[k + 'Pct'] = x[k] ? pct(x[k], y[k]) : null; } r.a = x.pop; r.b = y.pop; rows.push(r); }
  const sum = {}; for (const k of ['pop', 'cook', 'farmer', 'harvest', 'houseUp', 'gated', 'famine', 'price']) {
    const xs = rows.map((r) => r[k + 'Pct']).filter((v) => v != null && Number.isFinite(v));
    const dn = rows.filter((r) => r[k] < 0).length, up = rows.filter((r) => r[k] > 0).length;
    sum[k] = { n: rows.length, down: dn, up, zero: rows.length - dn - up, med: q(xs, 0.5), q1: q(xs, 0.25), q3: q(xs, 0.75), min: Math.min(...xs), max: Math.max(...xs) }; }
  const tA = rows.reduce((s, r) => s + r.a, 0), tB = rows.reduce((s, r) => s + r.b, 0);
  out.pairs[name] = { A, B, rows, sum, totA: tA, totB: tB, totPct: pct(tA, tB) };
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const f1 = (v) => (v == null || !Number.isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
for (const [name, p] of Object.entries(out.pairs)) {
  console.log(`\n== ${name} (${p.A} → ${p.B}) · 합 ${p.totA} → ${p.totB} (${f1(p.totPct)})`);
  for (const r of p.rows) console.log(`  ${String(r.seed).padStart(4)}  ${String(r.a).padStart(5)} → ${String(r.b).padStart(5)}  인구 ${f1(r.popPct).padStart(7)} · 요리사 ${String(r.cook).padStart(6)} · 농부 ${f1(r.farmerPct).padStart(7)} · 수확 ${f1(r.harvestPct).padStart(7)} · 새 집 ${f1(r.houseUpPct).padStart(7)} · 집 막힘 ${f1(r.gatedPct).padStart(7)} · 기근 ${f1(r.faminePct).padStart(7)} · 값 ${f1(r.pricePct).padStart(7)}`);
  for (const [k, s] of Object.entries(p.sum)) console.log(`   ${k.padEnd(8)} 내림 ${s.down} · 오름 ${s.up} · 같음 ${s.zero} / ${s.n} · 가운데 ${f1(s.med)} · 사분위 ${f1(s.q1)} ~ ${f1(s.q3)} · 폭 ${f1(s.min)} ~ ${f1(s.max)}`);
}
