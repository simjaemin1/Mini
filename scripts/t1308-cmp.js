#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1308 견줌 기계 · 판 폴더만 읽는다 · 판정 0)
// === scripts/t1308-cmp.js — 두 판(이어 도는 판 자 `t1308-long-run.js` 폴더)의 날 지문 · 마을 칸 · 몸 자리 · 판 JSON · 관찰 줄 견줌 ===
//   node scripts/t1308-cmp.js <폴더 A> <폴더 B> [--json <출력>]
//   ⇒ 칸마다 { 견준 날 수 · 같은 날 수 · 첫 갈림 날 } — econ(`*.json.t650.json` days) · 마을 칸(`*.json.t740.json` days[].f — 칸마다 첫 갈림) ·
//     몸 자리(`*.t1308b.json` days[].h) · 관찰 줄(`*.t1230.json` · `*.t1276.json` rows) · 판 JSON(`<태그>-<시드>.json` — 판 조건 칸 `env` 은 뺀다)
'use strict';
const fs = require('fs');
const path = require('path');
const a = process.argv.slice(2);
const [DA, DB] = a.filter((x) => !x.startsWith('--') && a[a.indexOf(x) - 1] !== '--json');
const JOUT = a.includes('--json') ? a[a.indexOf('--json') + 1] : null;
const find = (d, re) => { const f = fs.readdirSync(d).filter((x) => !x.startsWith('seg-') && re.test(x)); return f.length ? JSON.parse(fs.readFileSync(path.join(d, f[0]), 'utf8')) : null; };
const S = (x) => JSON.stringify(x);
function byDay(arr, key) { const m = new Map(); for (const r of arr || []) m.set(key(r), r); return m; }
function cmpDays(A, B, key, val) {
  const ma = byDay(A, key), mb = byDay(B, key); let both = 0, same = 0, first = null;
  for (const d of [...ma.keys()].sort((x, y) => x - y)) { if (!mb.has(d)) continue; both++; if (S(val(ma.get(d))) === S(val(mb.get(d)))) same++; else if (first == null) first = d; }
  return { both, same, first };
}
const out = {};
{ const A = find(DA, /\.json\.t650\.json$/), B = find(DB, /\.json\.t650\.json$/);
  out.econ = A && B ? cmpDays(A.days, B.days, (r) => r.d, (r) => { const o = Object.assign({}, r); delete o.ms; delete o.sites; delete o.cnt; return o; }) : null; }   // 시계 · 난수 부른 자리 셈(계측 칸 — 부팅이 부른 수가 섞인다)은 뺀다
{ const A = find(DA, /\.json\.t740\.json$/), B = find(DB, /\.json\.t740\.json$/);
  if (A && B) {
    out.side = cmpDays(A.days, B.days, (r) => r.d, (r) => r.f);
    const F = {}; const mb = byDay(B.days, (r) => r.d);
    for (const r of A.days) { const q = mb.get(r.d); if (!q) continue; for (const k of new Set(Object.keys(r.f).concat(Object.keys(q.f)))) if (r.f[k] !== q.f[k]) { F[k] = F[k] || { first: r.d, days: 0 }; F[k].days++; } }
    out.sideFields = F;
  } }
{ const A = find(DA, /\.t1308b\.json$/), B = find(DB, /\.t1308b\.json$/);
  out.body = A && B ? cmpDays(A.days, B.days, (r) => r.d, (r) => [r.n, r.h]) : null; }
for (const k of ['t1230', 't1276']) { const re = new RegExp(`\\.${k}\\.json$`); const A = find(DA, re), B = find(DB, re);
  out[k] = A && B ? cmpDays(A.rows, B.rows, (r) => r[0], (r) => r) : null; }
{ const A = find(DA, /^[^.]+-\d+\.json$/), B = find(DB, /^[^.]+-\d+\.json$/);
  if (A && B) { const strip = (o) => { const c = Object.assign({}, o); delete c.env; return c; }; const a1 = strip(A), b1 = strip(B);
    const diff = Object.keys(Object.assign({}, a1, b1)).filter((k) => S(a1[k]) !== S(b1[k]));
    out.runJson = { same: diff.length === 0, diff }; } }
const f = (r) => (r ? `${r.same}/${r.both}${r.first != null ? ` · 첫 갈림 ${r.first}` : ''}` : '—');
console.log(`| 견줌 | econ 날 지문 | 마을 칸 | 몸 자리 | t1230 줄 | t1276 줄 | 판 JSON |`);
console.log(`|---|---|---|---|---|---|---|`);
console.log(`| ${path.basename(DA)} : ${path.basename(DB)} | ${f(out.econ)} | ${f(out.side)} | ${f(out.body)} | ${f(out.t1230)} | ${f(out.t1276)} | ${out.runJson ? (out.runJson.same ? '같음' : '다름 — ' + out.runJson.diff.join(' · ')) : '—'} |`);
if (out.sideFields && Object.keys(out.sideFields).length) console.log('  마을 칸 갈림: ' + Object.entries(out.sideFields).sort((x, y) => x[1].first - y[1].first).map(([k, q]) => `${k} ${q.first}(${q.days}날)`).join(' · '));
if (JOUT) fs.writeFileSync(JOUT, JSON.stringify(out, null, 1));
