#!/usr/bin/env node
// T1309 할 일 1 — 갈무리 값 줄을 값 함수 · 교역 · 들여옴으로 가르는 표(읽기만) · farm.json 칸
//   값 = priceFoodMean(마을-날 식량 값 평균) · 들여옴 = foodImportedTot · 내보냄 = cargoSentTot(교역 건수 `trades` 는 모든 판 50000 에 막혀 못 씀 · `consFoodTot` 은 이 팔들에서 0 — 표에서 뺌)
//   쓰는 법: node t1309-channels.js · env R0(기본 /dev/shm/t1298x — C · CNP) · R(기본 /dev/shm/t1309 — CNC · CM)
'use strict';
const fs = require('fs');
const R0 = process.env.R0 || '/dev/shm/t1298x', R = process.env.R || '/dev/shm/t1309';
const SEEDS = [1020, 7, 42, 1, 2, 3, 4, 5, 6, 8];
const SRC = { C: R0, CNP: R0, CNC: R, CM: R };
const K = { pop: (f) => f.pop, farmer: (f) => (f.jobDaysTot || {}).farmer || 0, price: (f) => f.priceFoodMean, imp: (f) => f.foodImportedTot, cargo: (f) => f.cargoSentTot, famine: (f) => f.famineDaysTot };
const rd = (a, s) => { try { return JSON.parse(fs.readFileSync(`${SRC[a]}/${a}-${s}/farm.json`, 'utf8')); } catch (e) { return null; } };
const med = (xs) => { const a = xs.filter(Number.isFinite).sort((x, y) => x - y); if (!a.length) return NaN; const m = (a.length - 1) / 2; return (a[Math.floor(m)] + a[Math.ceil(m)]) / 2; };
const f1 = (v) => Number.isFinite(v) ? (v >= 0 ? '+' : '') + v.toFixed(1) + '%' : '—';
console.log('짝(C → 팔) · 칸마다 시드 짝 Δ% 가운데 · (오름/n)');
console.log('팔    ' + Object.keys(K).map((k) => k.padStart(16)).join(''));
for (const B of ['CNP', 'CNC', 'CM']) {
  const cols = {}; let n = 0;
  for (const k of Object.keys(K)) cols[k] = [];
  for (const s of SEEDS) { const x = rd('C', s), y = rd(B, s); if (!x || !y) continue; n++;
    for (const [k, g] of Object.entries(K)) { const a = +g(x), b = +g(y); cols[k].push(a ? (b / a - 1) * 100 : NaN); } }
  console.log(`${B.padEnd(5)} ` + Object.keys(K).map((k) => `${f1(med(cols[k]))} (${cols[k].filter((v) => v > 0).length}/${n})`.padStart(16)).join(''));
}
console.log('\n팔 절댓값(시드 합 · 값은 가운데)');
for (const a of ['C', 'CNP', 'CNC', 'CM']) { const fs_ = SEEDS.map((s) => rd(a, s)).filter(Boolean); if (!fs_.length) continue;
  console.log(`${a.padEnd(5)} n ${fs_.length} · 인구 ${fs_.reduce((t, f) => t + f.pop, 0)} · 값 ${med(fs_.map(K.price)).toFixed(3)} · 들여옴 ${fs_.reduce((t, f) => t + K.imp(f), 0).toFixed(0)} · 내보냄 ${fs_.reduce((t, f) => t + K.cargo(f), 0).toFixed(0)}`); }
