#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1303 맞대기 표 자 · 제품 무변 · 읽기만)
// === scripts/t1303-birth-table.js — 켬 판 출생 막힘(날 90 ~ 230) 10날 출생 줄 · 출생 0 마을-날 까닭(주거 · 곳간 · K · 행복 · 그 밖)을 판마다 나란히 ===
//   쓰는 법: node scripts/t1303-birth-table.js [--from 80] [--to 230] 이름=<t1230 관찰기 JSON(.gz 도)> …
//   칸은 `t1230-observe.js` 날 줄 그대로(`born` · `zHouse` · `zGran` · `zK` · `zH` · `zOther`) — 새 셈 0. 10날 칸 k = 날 줄 (k−10 ~ k−1) 합(T1263 표 '출생(10날)' 과 같은 끊음 — 관찰기 날 줄 d 는 그 날 틱 머리 = 앞 날까지의 일).
const fs = require('fs');
const zlib = require('zlib');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? +A[i + 1] : d; };
const FROM = opt('--from', 80), TO = opt('--to', 230);
const runs = A.filter((a, i) => a.includes('=') && !(i > 0 && A[i - 1].startsWith('--'))).map((a) => { const j = a.indexOf('='); return [a.slice(0, j), a.slice(j + 1)]; });
const load = (f) => { let b = fs.readFileSync(f); if (/\.gz$/.test(f)) b = zlib.gunzipSync(b); return JSON.parse(b.toString('utf8')); };
const R = runs.map(([name, f]) => {
  const r = load(f), c = (k) => r.cols.indexOf(k), by = new Map();
  for (const row of r.rows) by.set(row[c('day')], row);
  const get = (d, k) => { const row = by.get(d); return row ? row[c(k)] : null; };
  return { name, last: Math.max(...r.rows.map((x) => x[c('day')])), get };
});
const pct = (a, n) => (n ? `${Math.round(100 * a / n)}%` : '—');
const buckets = []; for (let e = Math.ceil(FROM / 10) * 10; e <= TO; e += 10) buckets.push(e);
console.log(`| 10날(끝 날) | ${R.map((x) => `${x.name} 출생 · 주거 문`).join(' | ')} |`);
console.log(`|---|${R.map(() => '---:').join('|')}|`);
for (const e of buckets) {
  const cells = R.map((x) => {
    if (e > x.last) return '—';
    let b = 0, z = 0, h = 0;
    for (let d = e - 10; d < e; d++) { b += x.get(d, 'born') || 0; const zz = ['zHouse', 'zGran', 'zK', 'zH', 'zOther'].reduce((s, k) => s + (x.get(d, k) || 0), 0); z += zz; h += x.get(d, 'zHouse') || 0; }
    return `${b} · ${pct(h, z)}`;
  });
  console.log(`| ${e} | ${cells.join(' | ')} |`);
}
console.log('');
console.log(`| 판(날 ${FROM} ~ ${TO} · 판이 닿은 날까지) | 출생 | 출생 0 마을-날 | 주거 문 | 곳간 문 | K | 행복 | 그 밖 |`);
console.log('|---|---:|---:|---:|---:|---:|---:|---:|');
for (const x of R) {
  const to = Math.min(TO, x.last); let b = 0; const z = { zHouse: 0, zGran: 0, zK: 0, zH: 0, zOther: 0 };
  for (let d = FROM; d < to; d++) { b += x.get(d, 'born') || 0; for (const k of Object.keys(z)) z[k] += x.get(d, k) || 0; }
  const n = Object.values(z).reduce((s, v) => s + v, 0);
  console.log(`| ${x.name}(~${to}) | ${b.toLocaleString()} | ${n.toLocaleString()} | ${pct(z.zHouse, n)} | ${pct(z.zGran, n)} | ${pct(z.zK, n)} | ${pct(z.zH, n)} | ${pct(z.zOther, n)} |`);
}
