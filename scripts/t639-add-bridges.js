#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T639 ① 지름길 다리를 존 `bridges` 줄 끝에 붙인다 · 셀 = 계획기 v2 `bridgeShortcuts 형` 줄 그대로(T614 · 규칙 0줄) · 기본 표만)
// 쓰는 법: node scripts/t639-add-bridges.js <존> <후보 json([{v, span, cells:[x,y,…]}, …])> [--apply]
'use strict';
const fs = require('fs'), path = require('path');
const [Z, F] = process.argv.slice(2), APPLY = process.argv.includes('--apply');
const ZC = path.join(__dirname, '..', 'server', 'zone-config.js');
const S = JSON.parse(fs.readFileSync(F, 'utf8'));
const s = fs.readFileSync(ZC, 'utf8');
const re = new RegExp(`(\\n  ${Z}: \\{[\\s\\S]*?\\n    bridges: )\\[([0-9,]*)\\](,)`);
const m = s.match(re); if (!m) { console.error('존 bridges 줄을 못 찾았다'); process.exit(3); }
const a = m[2].split(',').map(Number), have = new Set(); for (let i = 0; i + 1 < a.length; i += 2) have.add(a[i] + '_' + a[i + 1]);
let add = 0;
for (const c of S) for (let i = 0; i + 1 < c.cells.length; i += 2) { const k = c.cells[i] + '_' + c.cells[i + 1]; if (have.has(k)) continue; have.add(k); a.push(c.cells[i], c.cells[i + 1]); add++; }
console.log(`${Z} 다리 ${(a.length / 2) - add} → ${a.length / 2}셀 · 더함 ${add}(후보 ${S.length})`);
if (APPLY) { fs.writeFileSync(ZC, s.replace(re, `$1[${a.join(',')}]$3`)); console.log('기록: server/zone-config.js'); }
