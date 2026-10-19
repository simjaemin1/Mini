#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T788 표 기계 · 판 JSON 만 읽는다)
// === scripts/t788-coast.js — 마을마다 바다 거리 · 해안(land.coastal) 판 사이 견줌 ==========
//   각 판에서 먼저: `node scripts/t593-labels.js --json <판.json>`(서버 시딩과 같은 조립 · 같은 `seaDistPx`)
//   node scripts/t788-coast.js <이름>=<판.json> … [--top 10]   ⇒ 첫 판 기준 가까운 순 표 · 판마다 해안 마을 수
'use strict';
const fs = require('fs');
const a = process.argv.slice(2), ti = a.indexOf('--top'), TOP = ti >= 0 ? +a[ti + 1] : 10;
const arms = a.filter((x, i) => x.includes('=') && a[i - 1] !== '--top').map((x) => x.split('='));
const T = arms.map(([n, f]) => [n, new Map(JSON.parse(fs.readFileSync(f, 'utf8')).find((t) => t.zone === 'hanbando').rows.map((r) => [r.name, r]))]);
const names = [...T[0][1].keys()].sort((p, q) => Math.min(...T.map(([, m]) => m.get(p).sea)) - Math.min(...T.map(([, m]) => m.get(q).sea)));
console.log(`| 마을 | ${T.map(([n]) => `${n} 바다 px · 해안`).join(' | ')} |`);
console.log(`|---|${T.map(() => '---').join('|')}|`);
for (const nm of names.slice(0, TOP)) console.log(`| ${nm} | ${T.map(([, m]) => `${m.get(nm).sea.toLocaleString('en-US')} · ${m.get(nm).coastal ? '○' : '✗'}`).join(' | ')} |`);
console.log(`\n해안 마을 수: ${T.map(([n, m]) => `${n} ${[...m.values()].filter((r) => r.coastal).length}(${[...m.values()].filter((r) => r.coastal).map((r) => r.name).join(',') || '없음'})`).join(' · ')}`);
