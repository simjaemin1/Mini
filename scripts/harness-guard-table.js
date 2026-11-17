#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1356 진단 표 · 제품 무변)
// === scripts/harness-guard-table.js — 하네스 전수 표: 박힌 날짜 · 날 경계 · 미끼 없음 · 미끼가 바꾼 자리를 안 셈 [T1356 ① · 재민 11-17 테스트 강화] ======
//   자는 `lib-harness-guard.js` 한 벌(lint ⑲ 와 같은 자 — 사본 0). 대상 = `scripts/test-*.js` · `e2e-*.js`.
//   쓰는 법: node scripts/harness-guard-table.js > 계측/T1356_<날짜>/전수표.md      (--json 이면 JSON 한 줄)
const fs = require('fs'), path = require('path');
const G = require('./lib-harness-guard.js');
const S = __dirname;
const files = fs.readdirSync(S).filter((f) => /^(test|e2e)-.*\.js$/.test(f)).sort();
const rows = files.map((f) => {
  const src = fs.readFileSync(path.join(S, f), 'utf8');
  const C = G.calls(src);
  return { f, reg: G.regress(src), dates: G.dateLines(src), dateOk: G.dateOk(src), edge: G.edgeLines(src), bait: G.hasBait(src), counts: G.baitCounts(src), mark: G.baitMark(src), baitCalls: C ? G.baitCalls(src).length : null, parse: !!C };
});
const A = rows.filter((r) => r.dates.length), B = rows.filter((r) => r.edge.length);
const Cc = rows.filter((r) => r.reg && !r.bait), Dd = rows.filter((r) => r.reg && r.bait && r.counts === false);
const M = rows.filter((r) => r.mark != null);
const sum = { files: rows.length, regress: rows.filter((r) => r.reg).length, dateLines: A.reduce((s, r) => s + r.dates.length, 0), dateFiles: A.length, dateUnmarked: A.filter((r) => !r.dateOk).length,
  edgeLines: B.reduce((s, r) => s + r.edge.length, 0), edgeFiles: B.length, noBait: Cc.length, noCount: Dd.length, marked: M.length, parseFail: rows.filter((r) => !r.parse).map((r) => r.f) };
if (process.argv.includes('--json')) { console.log(JSON.stringify({ sum, rows })); process.exit(0); }
const L = [];
L.push('# T1356 하네스 전수 표 — 박힌 날짜 · 날 경계 · 미끼 (자 = `scripts/lib-harness-guard.js` · 셈 = `node scripts/harness-guard-table.js`)', '');
L.push(`· 대상 \`scripts/test-*.js\` · \`e2e-*.js\` ${sum.files}파일(@regress ${sum.regress}) · 주석 뺀 코드 글자로 센다(\`code-only.js\`) · 판정 호출은 AST(\`acorn\` — 못 읽은 파일 ${sum.parseFail.length}${sum.parseFail.length ? ': ' + sum.parseFail.join(' ') : ''})`);
L.push(`· ⓐ 박힌 날짜 ${sum.dateLines}줄 · ${sum.dateFiles}파일 — 표지(\`// @date-ok <까닭>\`) 없는 파일 **${sum.dateUnmarked}**`);
L.push(`· ⓑ 날 경계(주입 없이 벽시계로 날을 잼) ${sum.edgeLines}줄 · ${sum.edgeFiles}파일 — 표에만(제품 함수 속 날 경계는 야간 +30일 판)`);
L.push(`· ⓒ 미끼 없는 @regress **${sum.noBait}** — 파일 안 글자(주석 뺌)에 \`미끼\` · \`bait\` 0`);
L.push(`· ⓓ 미끼는 있으나 바꾼 자리 수를 안 세는 @regress **${sum.noCount}** — 미끼 판정 호출 어디에도 \`바꾼 자리\` · \`=== 1\` 꼴 0(글자 셈 · 손으로 짠 사본 셈은 놓칠 수 있다)`);
L.push(`· ⓔ \`// @bait <n>\` 표지 단 파일 ${sum.marked}`, '');
L.push('## ⓐ 박힌 날짜', '', '| 파일 | 줄 | 글자 | 표지 까닭 |', '|---|---:|---|---|');
for (const r of A) for (const d of r.dates) L.push(`| \`${r.f}\` | ${d.line} | \`${d.text.replace(/\|/g, '\\|').slice(0, 100)}\` | ${r.dateOk ? r.dateOk.replace(/\|/g, '\\|') : '**없음**'} |`);
L.push('', '## ⓑ 날 경계', '', '| 파일 | 줄 | 글자 |', '|---|---:|---|');
for (const r of B) for (const d of r.edge) L.push(`| \`${r.f}\` | ${d.line} | \`${d.text.replace(/\|/g, '\\|').slice(0, 110)}\` |`);
L.push('', `## ⓒ 미끼 없는 @regress (${Cc.length})`, '', Cc.map((r) => `\`${r.f}\``).join(' · ') || '없음');
L.push('', `## ⓓ 미끼가 바꾼 자리 수를 안 세는 @regress (${Dd.length})`, '', Dd.map((r) => `\`${r.f}\``).join(' · ') || '없음');
L.push('', `## ⓔ \`@bait\` 표지 (${M.length})`, '', '| 파일 | 표지 n | 미끼 판정 줄 |', '|---|---:|---:|');
for (const r of M) L.push(`| \`${r.f}\` | ${r.mark} | ${r.baitCalls} |`);
console.log(L.join('\n'));
