#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1400 ② — 제 `/tmp` 를 판 끝에 안 지우는 하네스 수: 앞(베이스 ref · lib-port 의 pidDbs 없음) → 뒤(지금 나무).
//   쓰는 법: node 계측/T1400_2026-11-19/tmp셈.js [베이스 ref — 기본 origin/main]
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const LT = require(path.join(ROOT, 'scripts', 'lib-tmp.js')), CO = require(path.join(ROOT, 'scripts', 'code-only.js'));
const BASE = process.argv[2] || 'origin/main';
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
const UNIQ = /mkdtempSync\(|['"`]\/tmp\/[^'"`\n]*(?:process\.pid|Date\.now|random)|tmpdir\(\)[^\n;]*(?:process\.pid|Date\.now|random)/;
function count(ref) {
  const names = ref ? git('ls-tree', '--name-only', ref, 'scripts/').split('\n').map((p) => path.basename(p)) : fs.readdirSync(path.join(ROOT, 'scripts'));
  const H = names.filter((f) => /^(test|e2e)-.*\.js$/.test(f));
  let uniq = 0, lib = 0; const bad = [];
  for (const f of H) {
    const s = CO(ref ? git('show', `${ref}:scripts/${f}`) : fs.readFileSync(path.join(ROOT, 'scripts', f), 'utf8'));
    if (UNIQ.test(s)) uniq++;
    if (/require\(\s*['"]\.\/lib-tmp['"]\s*\)/.test(s)) lib++;
    const a = LT.audit(s, { noRunner: !!ref }); if (a.length) bad.push(`${f}(${a.length})`);
  }
  return { H: H.length, uniq, lib, bad };
}
const A = count(BASE), B = count(null);
console.log(`# T1400 ② 제 \`/tmp\` 를 판 끝에 안 지우는 하네스 — 앞(\`${BASE}\`) → 뒤(이 가지)\n`);
console.log('| 무엇 | 앞 | 뒤 |\n|---|---:|---:|');
console.log(`| 하네스 파일 | ${A.H} | ${B.H} |\n| 판마다 새 이름 \`/tmp\` 를 짓는 하네스 | ${A.uniq} | ${B.uniq} |\n| \`lib-tmp\` 를 직접 부르는 하네스 | ${A.lib} | ${B.lib} |\n| **판 끝에 안 지우는 하네스(lint ㉑ 자)** | **${A.bad.length}** | **${B.bad.length}** |`);
console.log(`\n앞: ${A.bad.join(' · ')}\n\n뒤: ${B.bad.join(' · ') || '0'}`);
