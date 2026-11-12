#!/usr/bin/env node
// T1286 — 열 시드 짝 Δ(읽기만) · F1 · F1R · F1off1 = T1272 판(R0 · `계측/T1272_2026-11-11/랩/runs.tgz` 를 푼 것) · G(T1279 · 요약 칸 판) · GS(G + T1286 남는 시간 요리) · GS3(GS + 부양력 조리식 0) · ZsP(F1 + 곳간 흔들기 — 영 판) = 이 카드 판(R)
//   쓰는 법: node t1286-pairs.js [시드들] [--json] · env R0(기본 /dev/shm/t1272x) · R(기본 /dev/shm/t1286)
//   칸 더함: 굶음(기근 날 · 배고픈 날) · 집 부엌 요리(요약 sum.json — 요리한 마을-날 · 조리식) · 다양성(사람-날 가중 `stats.foodGroups`)
'use strict';
const fs = require('fs');
const R0 = process.env.R0 || '/dev/shm/t1272x', R = process.env.R || '/dev/shm/t1286';
const SEEDS = (process.argv.slice(2).find((a) => !a.startsWith('--')) || '1020,7,42,1,2,3,4,5,6,8').split(',').map(Number);
const SRC = { F1: R0, F1R: R0, F1off1: R0, G: R, GS: R, GS3: R, ZsP: R, LP: R, GSN: R };   // LP = 요리사 일손만 + 갈무리 뺌 · GSN = GS 부재료 뺌
const rd = (a, s) => { try { return JSON.parse(fs.readFileSync(`${SRC[a]}/${a}-${s}/farm.json`, 'utf8')); } catch (e) { return null; } };
const live = (f) => f.per.filter((p) => p.everPop);
const wmean = (f, k) => { let n = 0, w = 0; for (const p of live(f)) { const x = +p[k]; if (!Number.isFinite(x)) continue; const ww = p.popDays || 0; n += x * ww; w += ww; } return w ? n / w : 0; };
const sumOf = (a, s) => { try { return JSON.parse(fs.readFileSync(`${SRC[a]}/${a}-${s}/sum.json`, 'utf8')).SUM; } catch (e) { return null; } };
const met = (f, S) => ({ cookDays: S ? Object.values(S).reduce((t, o) => t + ((o.C && o.C.days) || 0), 0) : 0, cooked: S ? Object.values(S).reduce((t, o) => t + ((o.C && o.C.cooked) || 0), 0) : 0,
  fg: S ? (() => { let n = 0, w = 0; for (const o of Object.values(S)) { n += o.fg; w += o.fgW; } return w ? n / w : 0; })() : 0, famine: f.famineDaysTot || 0, hunger: f.hungerDaysTot || 0, pop: f.pop, cook: (f.jobDaysTot || {}).cook || 0, farmer: (f.jobDaysTot || {}).farmer || 0, harvest: f.harvestNTot || 0,
  houseUp: f.houseUpTot || 0, gated: f.gatedDaysTot || 0, price: wmean(f, 'priceFood'), sp: wmean(f, 'surplusMean') });
const q = (xs, p) => { const a = xs.slice().sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); };
const pct = (a, b) => (b / a - 1) * 100;
const out = { seeds: SEEDS, arms: {}, pairs: {} };
for (const a of Object.keys(SRC)) { out.arms[a] = {}; for (const s of SEEDS) { const f = rd(a, s); if (f) out.arms[a][s] = met(f, sumOf(a, s)); } }
for (const [name, A, B] of [['T1260', 'F1', 'F1R'], ['T1260+T1279(G)', 'F1', 'G'], ['G ↔ F1off1(T1279 판 그대로인가)', 'F1off1', 'G'], ['G + T1286', 'F1', 'GS'], ['G + T1286 + 3', 'F1', 'GS3'], ['T1286 몫(G → GS)', 'G', 'GS'], ['3 몫(GS → GS3)', 'GS', 'GS3'], ['곳간 흔들기(영 판)', 'F1', 'ZsP'], ['요리사 일손만 + 갈무리 뺌(LP)', 'F1', 'LP'], ['남는 시간 요리 부재료 뺌(GSN)', 'G', 'GSN'], ['부재료 몫(GS → GSN)', 'GS', 'GSN']]) {
  const rows = []; for (const s of SEEDS) { const x = out.arms[A][s], y = out.arms[B][s]; if (!x || !y) continue;
    const r = { seed: s, a: x.pop, b: y.pop }; for (const k of Object.keys(x)) { r[k] = y[k] - x[k]; r[k + 'Pct'] = x[k] ? pct(x[k], y[k]) : null; } rows.push(r); }
  const sum = {}; for (const k of ['pop', 'farmer', 'harvest', 'houseUp', 'gated', 'price', 'famine', 'fg']) { const xs = rows.map((r) => r[k + 'Pct']).filter((v) => v != null && Number.isFinite(v));
    sum[k] = { n: rows.length, down: rows.filter((r) => r[k] < 0).length, up: rows.filter((r) => r[k] > 0).length, med: q(xs, 0.5), q1: q(xs, 0.25), q3: q(xs, 0.75), min: Math.min(...xs), max: Math.max(...xs) }; }
  const tA = rows.reduce((t, r) => t + r.a, 0), tB = rows.reduce((t, r) => t + r.b, 0);
  out.pairs[name] = { A, B, rows, sum, totA: tA, totB: tB, totPct: pct(tA, tB) };
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const f1 = (v) => (v == null || !Number.isFinite(v)) ? '—' : (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
for (const [name, p] of Object.entries(out.pairs)) {
  console.log(`\n== ${name} (${p.A} → ${p.B}) · 합 ${p.totA} → ${p.totB} (${f1(p.totPct)})`);
  for (const r of p.rows) console.log(`  ${String(r.seed).padStart(4)}  ${String(r.a).padStart(5)} → ${String(r.b).padStart(5)}  인구 ${f1(r.popPct).padStart(7)} · 농부 ${f1(r.farmerPct).padStart(7)} · 수확 ${f1(r.harvestPct).padStart(7)} · 새 집 ${f1(r.houseUpPct).padStart(7)} · 집 막힘 ${f1(r.gatedPct).padStart(7)} · 값 ${f1(r.pricePct).padStart(7)} · 기근 ${f1(r.faminePct).padStart(7)} · 다양성 ${f1(r.fgPct).padStart(7)}`);
  for (const [k, s] of Object.entries(p.sum)) console.log(`   ${k.padEnd(8)} 내림 ${s.down} · 오름 ${s.up} / ${s.n} · 가운데 ${f1(s.med)} · 사분위 ${f1(s.q1)} ~ ${f1(s.q3)} · 폭 ${f1(s.min)} ~ ${f1(s.max)}`);
}
console.log('\n== 팔 절댓값(시드마다 인구)');
for (const a of Object.keys(out.arms)) console.log(`  ${a.padEnd(4)} ` + SEEDS.map((s) => out.arms[a][s] ? String(out.arms[a][s].pop).padStart(5) : '    —').join(' '));
console.log('\n== 집 부엌 요리 · 다양성 · 굶음(시드마다 · 팔별)');
for (const a of ['G', 'GS', 'GS3']) for (const s of SEEDS) { const m = out.arms[a][s]; if (m) console.log(`  ${a.padEnd(4)} ${String(s).padStart(4)}  요리 마을-날 ${String(m.cookDays).padStart(6)} · 조리식 ${m.cooked.toFixed(0).padStart(7)} · 다양성 ${m.fg.toFixed(3)} · 기근 날 ${m.famine} · 배고픈 날 ${m.hunger}`); }
