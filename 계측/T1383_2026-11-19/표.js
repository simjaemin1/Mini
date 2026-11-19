#!/usr/bin/env node
'use strict';
// (계측 자 · 판정 0) T1383 ④ — 하네스 규약 수 표: 앞(베이스 ref) → 뒤(지금 나무).
//   쓰는 법: node 계측/T1383_2026-11-19/표.js [베이스 ref — 기본 origin/batch/harness-bite-1118]
//   ⓐ `@bait` 표지 단 하네스 수 ⓑ 미끼는 있는데 바꾼 자리를 안 세는 @regress(lib-harness-guard ⓓ) ⓒ 옛 목록(harness-bait-old.txt) 줄 수
//   ⓓ old-green-ok.txt 줄 수 ⓔ `@old-red-also` 표지 수 ⓕ CI core · 서버 잡 하네스 수 ⓖ 야간에만 도는 @regress(= @regress 가운데 CI 목록 밖 · 규약 lint 는 게이트 잡)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const G = require(path.join(ROOT, 'scripts', 'lib-harness-guard.js'));
const BASE = process.argv[2] || 'origin/batch/harness-bite-1118';
const git = (...a) => execFileSync('git', ['-C', ROOT, '-c', 'core.quotepath=off', ...a], { encoding: 'utf8', maxBuffer: 1 << 28 });
function tree(ref) {   // ref 없으면 지금 나무
  const read = (rel) => { try { return ref ? git('show', `${ref}:${rel}`) : fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return null; } };
  const names = ref ? git('ls-tree', '--name-only', ref, 'scripts/').split('\n').map((p) => path.basename(p)) : fs.readdirSync(path.join(ROOT, 'scripts'));
  const H = names.filter((f) => /^(test|e2e)-.*\.js$/.test(f));
  let marked = 0, noCount = 0, reg = 0, also = 0; const regs = [];
  for (const f of H) {
    const s = read(`scripts/${f}`); if (s == null) continue;
    if (G.baitMark(s) != null) marked++;
    if (G.regress(s)) { reg++; regs.push(f); if (G.hasBait(s) && G.baitCounts(s) === false) noCount++; }
    if (/^\/\/ @old-red-also[ \t]/m.test(G.head(s))) also++;
  }
  const lines = (rel) => { const s = read(rel); return s == null ? null : s.split('\n').filter((l) => l.trim() && !l.startsWith('#')).length; };
  const yml = read('.github/workflows/regress-unit.yml') || '';
  const blk = (a, b) => { const i = yml.indexOf(a), j = yml.indexOf(b); return i >= 0 && j > i ? yml.slice(i, j).match(/test-[\w.-]+\.js/g) || [] : []; };
  const core = blk('# <ci-class core', '# </ci-class core>'), srv = blk('# <ci-class srv', '# </ci-class srv>');
  const inCI = new Set([...core, ...srv, 'test-harness-lint.js']);
  return { H: H.length, reg, marked, noCount, old: lines('scripts/harness-bait-old.txt'), green: lines('scripts/old-green-ok.txt'), also, core: core.length, srv: srv.length,
    nightlyOnly: regs.filter((f) => !inCI.has(f)).length };
}
const A = tree(BASE), B = tree(null);
const row = (k, name) => `| ${name} | ${A[k]} | ${B[k]} |`;
console.log(`# T1383 하네스 규약 수 — 앞(\`${BASE}\`) → 뒤(이 가지)\n`);
console.log('| 무엇 | 앞 | 뒤 |'); console.log('|---|---:|---:|');
console.log([row('H', '하네스 파일(test-* · e2e-*)'), row('reg', '@regress'), row('marked', '`@bait` 표지 단 하네스'), row('noCount', '미끼는 있는데 바꾼 자리를 안 세는 @regress(ⓓ)'),
  row('old', '옛 목록 `harness-bait-old.txt` 줄'), row('green', '`old-green-ok.txt` 줄'), row('also', '`@old-red-also` 표지'), row('core', 'CI core 하네스'), row('srv', 'CI 서버 잡 하네스'),
  row('nightlyOnly', '야간에만 도는 @regress(CI 목록 밖)')].join('\n'));
