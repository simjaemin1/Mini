#!/usr/bin/env node
// T1279 — 날 곡선 나란히(읽기만) · R/<팔>-<시드>/farm.json 의 per[].traj(20날마다) 세계 합
//   쓰는 법: node t1279-curve.js [시드들] [A팔=F1] [B팔=P]
//   칸: N(인구) · fN(농부) · house(집 자리) · gated(집 막힌 마을 수) · sp(식량 흐름 장부 surplusEMA.food 의 세계 합) · 값(마을 평균 식량값 · 판 전체 평균)
'use strict';
const R = process.env.R || '/dev/shm/t1279';
const S = (process.argv[2] || '1020,7,42,1,3').split(',').map(Number), A = process.argv[3] || 'F1', B = process.argv[4] || 'P';
const D = [100, 200, 300, 400, 500, 600, 700, 800];
const rd = (a, s) => require(`${R}/${a}-${s}/farm.json`);
const at = (p, d) => p.traj.find((x) => x.d === d) || p.traj[p.traj.length - 1];
const sum = (f, d, k) => f.per.reduce((a, p) => { const t = at(p, d); return a + (k === 'gated' ? (t.gated ? 1 : 0) : (+t[k] || 0)); }, 0);
const live = (f) => f.per.filter((p) => p.everPop);
const wmean = (f, k) => { let n = 0, w = 0; for (const p of live(f)) { const x = +p[k]; if (!Number.isFinite(x)) continue; const ww = p.popDays || 0; n += x * ww; w += ww; } return w ? n / w : NaN; };
const out = { A, B, seeds: S, curve: {}, whole: {} };
for (const s of S) {
  const a = rd(A, s), b = rd(B, s); out.curve[s] = {};
  for (const k of ['N', 'fN', 'house', 'gated', 'sp']) out.curve[s][k] = D.map((d) => { const x = sum(a, d, k), y = sum(b, d, k); return k === 'gated' || k === 'sp' ? [x, y] : [x, y, (y / x - 1) * 100]; });
  out.whole[s] = { priceA: wmean(a, 'priceFood'), priceB: wmean(b, 'priceFood'), spA: wmean(a, 'surplusMean'), spB: wmean(b, 'surplusMean'),
    negA: a.per.reduce((t, p) => t + (p.surplusNegDays || 0), 0), negB: b.per.reduce((t, p) => t + (p.surplusNegDays || 0), 0),
    cookB: (b.jobDaysTot || {}).cook || 0, farmerA: (a.jobDaysTot || {}).farmer || 0, farmerB: (b.jobDaysTot || {}).farmer || 0 };
}
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const f = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
for (const k of ['N', 'fN', 'house', 'gated', 'sp']) {
  console.log(`\n== ${k} ${A} → ${B} · 날 ${D.join(' ')} ${k === 'gated' ? '(막힌 마을 수 차)' : k === 'sp' ? '(장부 세계 합 A / B)' : '(Δ%)'}`);
  for (const s of S) console.log(String(s).padStart(5) + ' ' + out.curve[s][k].map((r) => k === 'gated' ? String(r[1] - r[0]).padStart(6) : k === 'sp' ? `${r[0].toFixed(0)}/${r[1].toFixed(0)}`.padStart(13) : f(r[2]).padStart(7)).join(''));
}
console.log(`\n== 판 전체(마을 사람-날 가중 평균) ${A} → ${B}`);
for (const s of S) { const w = out.whole[s]; console.log(`${String(s).padStart(5)}  값 ${w.priceA.toFixed(3)} → ${w.priceB.toFixed(3)} (${f((w.priceB / w.priceA - 1) * 100)}%) · 장부 평균 ${w.spA.toFixed(2)} → ${w.spB.toFixed(2)} · 장부 음수 마을-날 ${w.negA} → ${w.negB} · 농부 날 ${f((w.farmerB / w.farmerA - 1) * 100)}% · 요리사 날 ${w.cookB}`); }
