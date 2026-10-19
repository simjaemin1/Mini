#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T631 ② 뜬 다리 빼기 · zone-config 존 `bridges` 한 줄에서 주어진 셀만 뺀다 · 차례 그대로 · 기본 표만)
// 쓰는 법: node scripts/t631-drop-bridge.js <존> <셀 flat json(T614 작업 파일 _t614.bridgesRemoved.<존>)> [--apply]
'use strict';
const fs = require('fs'), path = require('path');
const [Z, F] = process.argv.slice(2), APPLY = process.argv.includes('--apply');
const ZC = path.join(__dirname, '..', 'server', 'zone-config.js');
const drop = JSON.parse(fs.readFileSync(F, 'utf8')); const D = new Set(drop.map((c) => c[0] + '_' + c[1]));
const s = fs.readFileSync(ZC, 'utf8');
const re = new RegExp(`(\\n  ${Z}: \\{[\\s\\S]*?\\n    bridges: )\\[([0-9,]*)\\](,)`);
const m = s.match(re); if (!m) { console.error('존 bridges 줄을 못 찾았다'); process.exit(3); }
const a = m[2].split(',').map(Number), out = []; let n = 0;
for (let i = 0; i + 1 < a.length; i += 2) { if (D.has(a[i] + '_' + a[i + 1])) { n++; continue; } out.push(a[i], a[i + 1]); }
console.log(`${Z} 다리 ${a.length / 2} → ${out.length / 2}셀 · 뺀 ${n}/${drop.length}`);
if (n !== drop.length) { console.error('✗ 뺄 셀이 다 안 찾아진다'); process.exit(3); }
if (APPLY) { fs.writeFileSync(ZC, s.replace(re, `$1[${out.join(',')}]$3`)); console.log('기록: server/zone-config.js'); }
