#!/usr/bin/env node
// T1279 — 200날 판 요리 한 번 안 가르기 표(읽기만) · R(기본 /dev/shm/t1279d)/<팔>-<시드>/farm.json
//   칸: 값(식량 그림자가격 · 마을 사람-날 가중) · 농부 날 · 인구 · 새 집 · 장부(surplusMean) — F1 대비 Δ% · 몫 = (X − P) ÷ (F1 − P)(값 · 농부)
'use strict';
const fs = require('fs');
const R = process.env.R || '/dev/shm/t1279d';
const S = (process.argv[2] || '1020,7,42,1,3').split(',').map(Number), ARMS = (process.argv[3] || 'F1,P,L,S,O,I,E,G').split(',');
const rd = (a, s) => { try { return JSON.parse(fs.readFileSync(`${R}/${a}-${s}/farm.json`, 'utf8')); } catch (e) { return null; } };
const wm = (f, k) => { let n = 0, w = 0; for (const p of f.per) { if (!p.everPop) continue; const x = +p[k]; if (!Number.isFinite(x)) continue; n += x * (p.popDays || 0); w += p.popDays || 0; } return w ? n / w : NaN; };
const met = (f) => ({ price: wm(f, 'priceFood'), farmer: (f.jobDaysTot || {}).farmer || 0, cook: (f.jobDaysTot || {}).cook || 0, pop: f.pop, houseUp: f.houseUpTot || 0, sp: wm(f, 'surplusMean') });
const T = {}; for (const a of ARMS) { T[a] = {}; for (const s of S) { const f = rd(a, s); if (f) T[a][s] = met(f); } }
const med = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; const i = (a.length - 1) / 2; return (a[Math.floor(i)] + a[Math.ceil(i)]) / 2; };
const out = { S, ARMS, T, rows: {} };
for (const a of ARMS) { const r = {}; for (const k of ['price', 'farmer', 'pop', 'houseUp', 'sp', 'cook']) {
    r[k] = S.map((s) => (T[a][s] && T.F1[s] ? (k === 'sp' || k === 'cook' ? T[a][s][k] : (T[a][s][k] / T.F1[s][k] - 1) * 100) : NaN)); r[k + 'Med'] = med(r[k]); }
  for (const k of ['price', 'farmer']) { r[k + 'Share'] = S.map((s) => { const x = T[a][s], p = T.P[s], f = T.F1[s]; return x && p && f && f[k] !== p[k] ? (x[k] - p[k]) / (f[k] - p[k]) * 100 : NaN; }); r[k + 'ShareMed'] = med(r[k + 'Share']); }
  out.rows[a] = r; }
if (process.argv.includes('--json')) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }
const f = (v) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) : '—';
console.log(`시드 ${S.join(' ')} · F1 대비 Δ%(시드마다 → 가운데) · 몫 = (X − P) ÷ (F1 − P)`);
for (const a of ARMS) { const r = out.rows[a];
  console.log(`${a.padEnd(3)} 값 ${r.price.map(f).join(' ')} → ${f(r.priceMed)} · 농부 ${r.farmer.map(f).join(' ')} → ${f(r.farmerMed)} · 인구 ${f(r.popMed)} · 새 집 ${f(r.houseUpMed)} · 요리사 날 ${r.cook.map((x) => x.toFixed(0)).join(' ')} · 몫 값 ${f(r.priceShareMed)}% · 농부 ${f(r.farmerShareMed)}%`); }
