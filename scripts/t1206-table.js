#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1206 표 기계 · 판정 0)
// === scripts/t1206-table.js — 관찰기(`t1206-observe.js`) 판 JSON 묶음 → 표 ===
//   쓰는 법: node scripts/t1206-table.js <이름>=<관찰 JSON>[,…] … [--json <출력>]
//   판마다: 끝 인구 · 빈 마을 · 새 사람 · 죽음 전체 · 자연사 · 굶어 죽음 · 연 사망률(죽음 ÷ 평균 인구 ÷ 해) · 끝 평균 나이(사람 가중) · 끝 최고 나이 ·
//          사치품 합(처음 · 끝) · 부장 누계 · 명장 무너짐(그날 마을 최고 숙련이 2 단 이상 떨어진 날 — 명장이 빠지고 이을 사람이 두 단 아래 · 800날 판의 숙련 천장이 5 남짓이라 이 문턱)
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const jOut = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
function one(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const R = d.rows, n = R.length, f = R[0], l = R[n - 1];
  const sum = (r, k) => r[2].reduce((a, x) => a + (x[k] || 0), 0);
  let popDays = 0, born = 0, master = 0;
  for (let i = 0; i < n; i++) {
    popDays += sum(R[i], 0); born += sum(R[i], 9);
    if (i) R[i][2].forEach((x, j) => { const p = R[i - 1][2][j]; if (p && p[8] - x[8] >= 2) master++; });
  }
  const pop = sum(l, 0), years = (l[0] - f[0]) / 365;
  let ageW = 0; for (const x of l[2]) ageW += x[4] * x[0];
  const dead = sum(l, 1) - sum(f, 1);
  return {
    file, days: n, pop, empty: l[2].filter((x) => x[0] === 0).length, villages: l[2].length, born,
    dead, nat: sum(l, 2) - sum(f, 2), starved: sum(l, 3) - sum(f, 3),
    deathRate: popDays ? +(100 * dead / (popDays / n) / Math.max(1e-9, years)).toFixed(2) : null,
    natRate: popDays ? +(100 * (sum(l, 2) - sum(f, 2)) / (popDays / n) / Math.max(1e-9, years)).toFixed(2) : null,
    meanAge: pop ? +(ageW / pop).toFixed(1) : null, maxAge: +Math.max(...l[2].map((x) => x[5])).toFixed(1),
    lux0: +sum(f, 6).toFixed(1), lux: +sum(l, 6).toFixed(1), bury: +sum(l, 7).toFixed(1), master,
  };
}
const out = {};
for (const a of args) { if (a === '--json' || a === jOut) continue; const [name, list] = a.split('='); out[name] = list.split(',').filter(Boolean).map((f) => { try { return one(f); } catch (e) { return { file: f, err: e.message }; } }); }
for (const [name, rs] of Object.entries(out)) {
  console.log(`\n## ${name}`);
  console.log('| 판 | 날 | 인구 | 빈 마을 | 새 사람 | 죽음 | 자연사 | 굶어 죽음 | 연 사망률 % | 자연사율 % | 평균 나이 | 최고 나이 | 사치품 처음 → 끝 | 부장 누계 | 명장 무너짐 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    if (r.err) { console.log(`| ${r.file} | 실패 ${r.err} |`); continue; }
    console.log(`| ${r.file.split('/').pop()} | ${r.days} | ${r.pop} | ${r.empty}/${r.villages} | ${r.born} | ${r.dead} | ${r.nat} | ${r.starved} | ${r.deathRate} | ${r.natRate} | ${r.meanAge} | ${r.maxAge} | ${r.lux0} → ${r.lux} | ${r.bury} | ${r.master} |`);
  }
}
if (jOut) fs.writeFileSync(jOut, JSON.stringify(out, null, 1));
