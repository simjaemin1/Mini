'use strict';
// (@regress 없음 — 러너 밖 · T1356 하네스 검사기 공용 자 · 제품 무변)
// === scripts/lib-harness-guard.js — 하네스 글자를 재는 자 한 벌(박힌 날짜 · 날 경계 · 미끼 표지) [T1356 · 재민 11-17 테스트 강화] ==========
//   부르는 곳: `test-harness-lint` ⑲(금지 줄 · 미끼 표지) · 전수 표 셈(`계측/T1356_*/전수표-셈.js`). 사본 0 — 자는 이 한 자리.
//   ⓐ 박힌 날짜 · 연도 — `Date.UTC(20..` · `new Date('20..` · `Date.parse('20..` · `new Date(20.., …` · 글자 `'20YY-MM`(코드 속 · 주석 뺌).
//      예외는 머리 40줄의 표지 `// @date-ok <까닭>`(까닭 넉 자 이상) — 주입하는 고정 시각 · 로그 픽스처처럼 벽시계와 안 맞대는 자리.
//   ⓑ 날 경계 — 주입 없이 벽시계로 날을 재는 자리(`new Date().getDate()` 꼴 · `new Date().toISOString().slice(0, 10)` · `Date.now() / 하루` ·
//      날 · 달 · 계절 이름 함수에 `Date.now()` 를 바로 넘김). 표에만 센다(제품 함수 속 날 경계는 야간 +30일 판이 드러낸다).
//   ⓒ 미끼 — 파일 안 글자(주석 뺌) 에 `미끼` · `bait` 가 있나. ⓓ 미끼 판정 호출이 바꾼 자리 수를 세나(`바꾼 자리` 글자 · `=== 1`).
//   ⓔ 미끼 표지 — 머리 40줄 `// @bait <n>` · 미끼 판정 줄 = 판정 호출(`ok` · `check` · `assert…` · `expect`) 중 글자에 `미끼` 와 `바꾼 자리` 가 같이 든 것.
const path = require('path');
const CO = require('./code-only.js');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));

const DATE_RE = [
  /Date\.UTC\(\s*20\d\d/, /new Date\(\s*['"`]20\d\d/, /Date\.parse\(\s*['"`]20\d\d/, /new Date\(\s*20\d\d\s*,/, /['"`]20\d\d-[01]\d/,
];
const EDGE_RE = [
  /new Date\(\s*\)\s*\.\s*get(UTC)?(Date|Day|Hours|Month|FullYear)\b/,
  /new Date\(\s*(Date\.now\(\s*\))?\s*\)\s*\.\s*to(ISO|LocaleDate|Date)String\(\s*\)\s*\.\s*(slice|substr|substring)\(\s*0\s*,\s*10\s*\)/,
  /new Date\(\s*Date\.now\(\s*\)[^)]*\)\s*\.\s*get(UTC)?(Date|Day|Hours|Month|FullYear)\b/,
  /Date\.now\(\s*\)\s*(\/|%)\s*(86400000|864e5|DAY_MS|MS_DAY|DAY\b|24\s*\*\s*(3600|60\s*\*\s*60)\s*\*\s*1000)/,
  /\b\w*(day|Day|DAY|date|Date|midnight|Midnight|season|Season|month|Month|week|Week|calendar|Calendar)\w*\s*\(\s*(Date\.now\(\s*\)|new Date\(\s*\))\s*[),]/,
];
const head = (src) => src.split('\n').slice(0, 40).join('\n');
const lines = (src, res) => { const out = []; CO(src).split('\n').forEach((l, i) => { if (res.some((re) => re.test(l))) out.push({ line: i + 1, text: l.trim().slice(0, 160) }); }); return out; };
const dateLines = (src) => lines(src, DATE_RE);
const edgeLines = (src) => lines(src, EDGE_RE);
function dateOk(src) { const m = /^\/\/ @date-ok[ \t]+(\S.*)$/m.exec(head(src)); return m && m[1].trim().length >= 4 ? m[1].trim() : null; }
function baitMark(src) { const m = /^\/\/ @bait[ \t]+(\d+)\b/m.exec(head(src)); return m ? +m[1] : null; }
const regress = (src) => /^\/\/ @regress([\s]|$)/m.test(head(src));
const hasBait = (src) => /미끼|\bbait\b/i.test(CO(src));

// 판정 호출 — 이름이 판정 꼴인 호출(인자 글자를 원문에서 잘라 본다 · 여러 줄 호출도 한 번)
const JUDGE = /^(ok|check|assert\w*|expect|t)$/;
function calls(src) {
  let ast;
  try { ast = acorn.parse(src, { ecmaVersion: 2023, sourceType: 'script', allowReturnOutsideFunction: true, allowHashBang: true }); } catch (e) { return null; }
  const out = [];
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee && n.callee.type === 'Identifier' && JUDGE.test(n.callee.name)) out.push(src.slice(n.start, n.end));
    for (const k in n) { if (k === 'type' || k === 'start' || k === 'end') continue; const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
  })(ast);
  return out;
}
// 미끼 판정 줄 — 판정 호출 글자에 `미끼` 와 `바꾼 자리` 가 같이 든 것(바꾼 자리 수를 적고 어느 줄이 빨강이 되나를 단언하는 꼴 · 규약 ①)
function baitCalls(src) { const C = calls(src); return C ? C.filter((c) => c.includes('미끼') && c.includes('바꾼 자리')) : null; }
// ⓓ (옛 하네스 표) — 미끼를 재는 판정 호출 중 바꾼 자리 수를 세는 꼴이 하나라도 있나
function baitCounts(src) { const C = calls(src); if (!C) return null; const B = C.filter((c) => /미끼|\bbait\b/i.test(c)); return B.some((c) => c.includes('바꾼 자리') || /={2,3}\s*1\b/.test(c)); }
module.exports = { DATE_RE, EDGE_RE, dateLines, edgeLines, dateOk, baitMark, regress, hasBait, calls, baitCalls, baitCounts, head };
