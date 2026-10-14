#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T745 표 기계 · 판 폴더만 읽는다)
// === scripts/t745-table.js — 판 쌍마다 econ 지문 · 서버 마을 칸 지문 견줌을 한 줄로(`t740-cmp.js` 의 `cmp` 그대로) ======================
//   node scripts/t745-table.js <루트> <이름>=<판A>:<판B> … [--from N] [--fields]
//   ⇒ | 쌍 | econ 견준 날 · 첫 갈림 | 마을 칸 견준 날 · 첫 갈림 | 갈린 칸 수 | 먼저 갈린 칸(첫 날 · 갈린 날 수 · 최대 마을) |
'use strict';
const path = require('path');
const { cmp } = require('./t740-cmp');
const a = process.argv.slice(2);
const ROOT = a[0];
// --from N 은 t740-cmp 가 같은 argv 에서 읽는다(그 모듈의 FROM)
const pairs = a.slice(1).filter((x) => x.includes('=') && x.includes(':'));
console.log('| 쌍 | econ 지문(견준 날 · 첫 갈림) | 마을 칸 지문(견준 날 · 첫 갈림) | 갈린 칸 | 먼저 갈린 칸(첫 날 · 갈린 날 · 최대 마을) |');
console.log('|---|---|---|---:|---|');
const rows = [];
for (const p of pairs) {
  const [name, ab] = p.split('='); const [A, B] = ab.split(':');
  let R; try { R = cmp(path.join(ROOT, A), path.join(ROOT, B)); } catch (e) { console.log(`| ${name} | 읽기 실패 ${e.message} | | | |`); continue; }
  const F = Object.entries(R.side.fields).sort((x, y) => x[1].first - y[1].first || y[1].days - x[1].days);
  const top = F.slice(0, 6).map(([k, q]) => `\`${k}\` ${q.first} · ${q.days} · ${q.vMax}`).join(' / ');
  console.log(`| ${name} | ${R.econ.both} · ${R.econ.first == null ? '**같음**' : R.econ.first + ` (${R.econ.n}날 · ${R.econ.vil.slice(0, 3).join(',')})`} | ${R.side.both} · ${R.side.first == null ? '**같음**' : R.side.first} | ${F.length} | ${top || '—'} |`);
  rows.push({ name, R });
}
if (a.includes('--fields')) for (const { name, R } of rows) {
  const F = Object.entries(R.side.fields).sort((x, y) => x[1].first - y[1].first);
  console.log(`\n### ${name} — 갈린 칸 전부`);
  for (const [k, q] of F) console.log(`* \`${k}\` 첫 ${q.first} · 갈린 날 ${q.days} · 첫날 마을 ${q.vFirst} · 최대 ${q.vMax}`);
}
