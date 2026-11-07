#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1197 · T1198 표 기계 · 판정 0)
// === scripts/t1197-table.js — 관찰기(`t1197-observe.js`) 판 JSON 묶음 → 표 ===
//   쓰는 법: node scripts/t1197-table.js <이름>=<관찰 JSON>[,<관찰 JSON>…] …  [--json <출력>]
//   판마다: 끝 인구 · 빈 마을 · 굶어 죽음(`_fdDeadTot` 증분) · 죽음 전체(`_deadTot` 증분) · 보호막이 막은 수 · 철별 굶어 죽음 ·
//          겨울 들어갈 때 곳간 식량 일수(겨울 첫날 Σ 식량 환산 ÷ Σ 인구 · 해마다) · 봄 굶어 죽음(해마다) · 농촌 인구 · 마을 틱 µs/사람·날
'use strict';
const fs = require('fs');
const args = process.argv.slice(2);
const jOut = args.indexOf('--json') >= 0 ? args[args.indexOf('--json') + 1] : null;
const SEAS = ['spring', 'summer', 'autumn', 'winter'], KO = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
function one(file) {
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rows = d.rows, n = rows.length, first = rows[0], last = rows[n - 1];
  const sum = (r, k) => r[2].reduce((a, x) => a + (x[k] || 0), 0);
  const res = { file, days: n, day0: first[0], dayN: last[0] };
  res.pop = sum(last, 0);
  res.empty = last[2].filter((x) => x[0] === 0).length;
  res.villages = last[2].length;
  res.starved = sum(last, 2) - sum(first, 2);
  res.dead = sum(last, 1) - sum(first, 1);
  res.shield = sum(last, 3) - sum(first, 3);
  res.born = rows.reduce((a, r) => a + sum(r, 6), 0);   // 새 사람(출생 + 들어옴 · 관찰기 7번째 칸이 없으면 0)
  const bySeason = {}, byYearSeason = {};
  for (let i = 1; i < n; i++) {
    const dd = sum(rows[i], 2) - sum(rows[i - 1], 2), s = rows[i][1], y = Math.floor(rows[i][0] / 365) + 1;
    bySeason[s] = (bySeason[s] || 0) + dd;
    const k = y + ':' + s; byYearSeason[k] = (byYearSeason[k] || 0) + dd;
  }
  res.bySeason = bySeason; res.byYearSeason = byYearSeason;
  const winter = [];
  for (let i = 1; i < n; i++) if (rows[i][1] === 'winter' && rows[i - 1][1] !== 'winter') {
    const P = sum(rows[i], 0), F = sum(rows[i], 5);
    const per = rows[i][2].filter((x) => x[0] > 0).map((x) => x[5] / x[0]).sort((a, b) => a - b);
    winter.push({ day: rows[i][0], year: Math.floor(rows[i][0] / 365) + 1, pop: P, foodDays: P ? +(F / P).toFixed(1) : null, villageMedian: per.length ? +per[Math.floor(per.length / 2)].toFixed(1) : null, under30: per.filter((x) => x < 30).length });
  }
  res.winter = winter;
  const names = d.names || [];
  res.farmPop = last[2].reduce((a, x, i) => a + ((names[i] || '').startsWith('농촌') ? x[0] : 0), 0);
  let popDays = 0; for (const r of rows) popDays += sum(r, 0);
  res.usPerPersonDay = d.us && d.us.batchMs && popDays ? +((d.us.batchMs * 1000) / popDays).toFixed(2) : null;
  res.host = d.host || null; res.host98 = d.host98 || null;
  return res;
}
const out = {};
for (const a of args) {
  if (a === '--json' || a === jOut) continue;
  const [name, list] = a.split('=');
  out[name] = list.split(',').filter(Boolean).map((f) => { try { return one(f); } catch (e) { return { file: f, err: e.message }; } });
}
for (const [name, rs] of Object.entries(out)) {
  console.log(`\n## ${name}`);
  console.log('| 판 | 날 | 인구 | 빈 마을 | 새 사람 | 굶어 죽음 | 죽음 전체 | 보호막 | 봄 · 여름 · 가을 · 겨울 굶음 | 겨울 들 때 식량 일수(해마다) | 농촌 인구 | 마을 틱 µs/사람·날 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rs) {
    if (r.err) { console.log(`| ${r.file} | 실패 ${r.err} |`); continue; }
    const s = SEAS.map((x) => r.bySeason[x] || 0).join(' · ');
    const w = r.winter.map((x) => `${x.year}년 ${x.foodDays}`).join(' / ');
    console.log(`| ${r.file.split('/').pop()} | ${r.dayN} | ${r.pop} | ${r.empty}/${r.villages} | ${r.born} | ${r.starved} | ${r.dead} | ${r.shield} | ${s} | ${w} | ${r.farmPop} | ${r.usPerPersonDay} |`);
  }
}
if (jOut) fs.writeFileSync(jOut, JSON.stringify(out, null, 1));
