#!/usr/bin/env node
// T1279 — 갈라 재기 표(읽기만) · 판 폴더 R(기본 /dev/shm/t1279)/<팔>-<시드>/farm.json · audit.json
//   팔: F1 = 밭 켬 끔 · P = 켬(probe 셈만 · 바이트 = 켬) · A · B · C = 갈래(t1279-split.js) · 그 밖의 이름도 셀 수 있다(argv 3 = 팔들)
//   몫(갈래 X) = (X − P) ÷ (F1 − P) — 켬 손해 가운데 그 갈래 하나가 되돌린 몫
'use strict';
const fs = require('fs');
const R = process.env.R || '/dev/shm/t1279';
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const SEEDS = (args[0] || '1020,7,42,1,3').split(',').map(Number);
const ARMS = (args[1] || 'F1,P,A,B,C').split(',');
const rd = (a, s, f) => { try { return JSON.parse(fs.readFileSync(`${R}/${a}-${s}/${f}`, 'utf8')); } catch (e) { return null; } };
const met = (f) => ({ pop: f.pop, cook: (f.jobDaysTot || {}).cook || 0, farmer: (f.jobDaysTot || {}).farmer || 0, harvest: f.harvestNTot || 0,
  houseUp: f.houseUpTot || 0, gated: f.gatedDaysTot || 0, famine: f.famineDaysTot || 0, price: f.priceFoodMean || 0 });
const q = (xs, p) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const out = { seeds: SEEDS, arms: {}, audit: {}, share: {} };
for (const a of ARMS) { out.arms[a] = {}; out.audit[a] = {}; for (const s of SEEDS) { const f = rd(a, s, 'farm.json'); if (f) out.arms[a][s] = met(f); const u = rd(a, s, 'audit.json'); if (u) out.audit[a][s] = u; } }
for (const a of ARMS.filter((x) => x !== 'F1' && x !== 'P')) {
  const rows = SEEDS.filter((s) => out.arms.F1[s] && out.arms.P[s] && out.arms[a][s]).map((s) => { const f1 = out.arms.F1[s].pop, p = out.arms.P[s].pop, x = out.arms[a][s].pop;
    return { seed: s, eff: p - f1, x, share: f1 !== p ? (x - p) / (f1 - p) * 100 : null, vsF1: (x / f1 - 1) * 100 }; });
  const xs = rows.map((r) => r.share).filter((v) => v != null);
  const tF1 = rows.reduce((t, r) => t + out.arms.F1[r.seed].pop, 0), tP = rows.reduce((t, r) => t + out.arms.P[r.seed].pop, 0), tX = rows.reduce((t, r) => t + r.x, 0);
  out.share[a] = { rows, med: q(xs, 0.5), q1: q(xs, 0.25), q3: q(xs, 0.75), sumShare: tF1 !== tP ? (tX - tP) / (tF1 - tP) * 100 : null, medVsF1: q(rows.map((r) => r.vsF1), 0.5) };
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const p1 = (v) => (v == null || !Number.isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
console.log('== 인구 (팔 × 시드)');
console.log('  팔      ' + SEEDS.map((s) => String(s).padStart(6)).join('') + '      합');
for (const a of ARMS) console.log(`  ${a.padEnd(7)} ` + SEEDS.map((s) => out.arms[a][s] ? String(out.arms[a][s].pop).padStart(6) : '     —').join('') + String(SEEDS.reduce((t, s) => t + ((out.arms[a][s] || {}).pop || 0), 0)).padStart(8));
for (const k of ['cook', 'farmer', 'harvest', 'houseUp', 'gated', 'price']) {
  console.log(`== ${k} (합 · 값은 평균)`);
  for (const a of ARMS) { const v = SEEDS.map((s) => (out.arms[a][s] || {})[k]).filter((x) => x != null); const t = v.reduce((x, y) => x + y, 0) / (k === 'price' ? Math.max(1, v.length) : 1);
    const b = SEEDS.map((s) => (out.arms.F1[s] || {})[k]).filter((x) => x != null).reduce((x, y) => x + y, 0) / (k === 'price' ? Math.max(1, v.length) : 1);
    console.log(`  ${a.padEnd(7)} ${t.toFixed(k === 'price' ? 1 : 0).padStart(12)}  (F1 대비 ${p1(b ? (t / b - 1) * 100 : null)})`); } }
console.log('== 갈래 몫 = (X − P) ÷ (F1 − P)');
for (const [a, s] of Object.entries(out.share)) {
  console.log(`  ${a}: ` + s.rows.map((r) => `${r.seed} ${r.share == null ? '—' : r.share.toFixed(0) + '%'}`).join(' · ') + ` · 가운데 ${s.med.toFixed(0)}% · 사분위 ${s.q1.toFixed(0)} ~ ${s.q3.toFixed(0)}% · 합 몫 ${s.sumShare == null ? '—' : s.sumShare.toFixed(0) + '%'} · F1 대비 가운데 ${p1(s.medVsF1)}`); }
console.log('== 셈(audit) — 요리 번 n · 든 환산 · 난 환산 · 정원 줄 pick · 닿은 자리');
for (const a of ARMS) for (const s of SEEDS) { const u = out.audit[a][s]; if (u) console.log(`  ${a.padEnd(4)} ${String(s).padStart(5)}  n ${u.n} · 든 ${u.inEq.toFixed(0)} · 난 ${u.outEq.toFixed(0)} (${u.inEq ? (u.outEq / u.inEq).toFixed(3) : '—'}) · pick ${u.pick} · hit ${JSON.stringify(u.hit)}`); }
