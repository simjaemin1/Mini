#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T740 계측기)
// === scripts/t740-table.js — 멈춘 판 ↔ 대조 판의 마을 칸 갈림을 **흔들림 판**(대조 ↔ 대조)과 나란히 =====================================
//   node scripts/t740-table.js <흔들림 A> <흔들림 B> <대조> <팔1> [<팔2> …] [--from 201]
//   칸마다: 흔들림(재기동 없는 두 판이 이미 갈리는 정도) · 팔마다 갈린 날 수 / 최대 마을 수.
//   ★"재기동 탓" = 흔들림 판에서 한 번도 안 갈린 칸이 팔에서 갈린 것(아래 표 끝 줄).
'use strict';
const path = require('path');
const { cmp } = require('./t740-cmp');
const a = process.argv.slice(2).filter((x, i, A) => !(x.startsWith('--') || (i > 0 && A[i - 1].startsWith('--'))));
const fi = process.argv.indexOf('--from'); if (fi >= 0) process.argv.splice(fi, 2);
const [NA, NB, REF, ...ARMS] = a;
const N = cmp(NA, NB), Rs = ARMS.map((d) => cmp(REF, d));
const keys = [...new Set([N, ...Rs].flatMap((r) => Object.keys(r.side.fields)))].sort();
const cell = (r, k) => { const p = r.side.fields[k]; return p ? `${p.days} / ${p.vMax}` : '—'; };
console.log(`| 칸 | 흔들림 ${path.basename(NA)}↔${path.basename(NB)} | ${ARMS.map((d) => `${path.basename(REF)}↔${path.basename(d)}`).join(' | ')} |`);
console.log(`|---|---|${ARMS.map(() => '---').join('|')}|`);
for (const k of keys) console.log(`| \`${k}\` | ${cell(N, k)} | ${Rs.map((r) => cell(r, k)).join(' | ')} |`);
console.log(`| econ 지문 첫 갈림 | ${N.econ.first ?? '없음'} | ${Rs.map((r) => r.econ.first ?? '없음').join(' | ')} |`);
const extra = Rs.map((r) => Object.keys(r.side.fields).filter((k) => !N.side.fields[k]));
console.log(`| **흔들림 밖 갈린 칸** | — | ${extra.map((e) => (e.length ? e.join(' · ') : '0')).join(' | ')} |`);
