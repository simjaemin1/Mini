#!/usr/bin/env node
// T1279 — 열 시드 짝 Δ(읽기만) · 끔 F1(밭 켬 · 손잡이 끔) · 켬 F1R(T1260) = T1272 판(R0 · 같은 바이트 — §1 의 다섯 시드 대조) · 고침 G(T1260 + T1279) · 영 흔들기 Z = 이 카드 판(R)
//   쓰는 법: node t1279-pairs.js [시드들] [--json] · env R0(기본 /dev/shm/t1272x) · R(기본 /dev/shm/t1279)
'use strict';
const fs = require('fs');
const R0 = process.env.R0 || '/dev/shm/t1272x', R = process.env.R || '/dev/shm/t1279';
const SEEDS = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '1020,7,42,1,2,3,4,5,6,8').split(',').map(Number);
const SRC = { F1: R0, F1R: R0, G: R, Z: R };   // Z = 영 흔들기(끈 판 + 50날째 난수 하나 · t1279-split.js Z)
const rd = (a, s) => { try { return JSON.parse(fs.readFileSync(`${SRC[a]}/${a}-${s}/farm.json`, 'utf8')); } catch (e) { return null; } };
const live = (f) => f.per.filter((p) => p.everPop);
const wmean = (f, k) => { let n = 0, w = 0; for (const p of live(f)) { const x = +p[k]; if (!Number.isFinite(x)) continue; const ww = p.popDays || 0; n += x * ww; w += ww; } return w ? n / w : 0; };
const met = (f) => ({ pop: f.pop, cook: (f.jobDaysTot || {}).cook || 0, farmer: (f.jobDaysTot || {}).farmer || 0, harvest: f.harvestNTot || 0,
  houseUp: f.houseUpTot || 0, gated: f.gatedDaysTot || 0, price: wmean(f, 'priceFood'), sp: wmean(f, 'surplusMean') });
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const pct = (a, b) => (b / a - 1) * 100;
const out = { seeds: SEEDS, arms: {}, pairs: {} };
for (const a of Object.keys(SRC)) { out.arms[a] = {}; for (const s of SEEDS) { const f = rd(a, s); if (f) out.arms[a][s] = met(f); } }
for (const [name, A, B] of [['T1260', 'F1', 'F1R'], ['T1260+T1279', 'F1', 'G'], ['T1279 몫(켬 → 고침)', 'F1R', 'G'], ['영 흔들기(난수 하나)', 'F1', 'Z']]) {
  const rows = []; for (const s of SEEDS) { const x = out.arms[A][s], y = out.arms[B][s]; if (!x || !y) continue;
    const r = { seed: s, a: x.pop, b: y.pop }; for (const k of Object.keys(x)) { r[k] = y[k] - x[k]; r[k + 'Pct'] = x[k] ? pct(x[k], y[k]) : null; } rows.push(r); }
  const sum = {}; for (const k of ['pop', 'farmer', 'harvest', 'houseUp', 'gated', 'price']) { const xs = rows.map((r) => r[k + 'Pct']).filter((v) => v != null && Number.isFinite(v));
    sum[k] = { n: rows.length, down: rows.filter((r) => r[k] < 0).length, up: rows.filter((r) => r[k] > 0).length, med: q(xs, 0.5), q1: q(xs, 0.25), q3: q(xs, 0.75), min: Math.min(...xs), max: Math.max(...xs) }; }
  const tA = rows.reduce((t, r) => t + r.a, 0), tB = rows.reduce((t, r) => t + r.b, 0);
  out.pairs[name] = { A, B, rows, sum, totA: tA, totB: tB, totPct: pct(tA, tB) };
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const f1 = (v) => (v == null || !Number.isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
for (const [name, p] of Object.entries(out.pairs)) {
  console.log(`\n== ${name} (${p.A} → ${p.B}) · 합 ${p.totA} → ${p.totB} (${f1(p.totPct)})`);
  for (const r of p.rows) console.log(`  ${String(r.seed).padStart(4)}  ${String(r.a).padStart(5)} → ${String(r.b).padStart(5)}  인구 ${f1(r.popPct).padStart(7)} · 농부 ${f1(r.farmerPct).padStart(7)} · 수확 ${f1(r.harvestPct).padStart(7)} · 새 집 ${f1(r.houseUpPct).padStart(7)} · 집 막힘 ${f1(r.gatedPct).padStart(7)} · 값 ${f1(r.pricePct).padStart(7)}`);
  for (const [k, s] of Object.entries(p.sum)) console.log(`   ${k.padEnd(8)} 내림 ${s.down} · 오름 ${s.up} / ${s.n} · 가운데 ${f1(s.med)} · 사분위 ${f1(s.q1)} ~ ${f1(s.q3)} · 폭 ${f1(s.min)} ~ ${f1(s.max)}`);
}
console.log('\n== 팔 절댓값(시드마다 인구)');
for (const a of Object.keys(out.arms)) console.log(`  ${a.padEnd(4)} ` + SEEDS.map((s) => out.arms[a][s] ? String(out.arms[a][s].pop).padStart(5) : '    —').join(' '));
