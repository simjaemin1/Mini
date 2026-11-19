#!/usr/bin/env node
// === scripts/t1369-table.js — T1369 표: 스무 종 새 판정 · 크래시 59 가름 (손으로 세지 않는다) =====================
// (@regress 없음 — 러너 밖 · 표 도구)
//
// 입력: `계측/T1369_2026-11-18/rerun.tsv`(`t1369-run.sh` 가 낸 줄) · `계측/T1361_2026-11-17/rows.tsv`(T1361 원 줄 — 크래시의 첫 오류 줄)
// 출력: `계측/T1369_2026-11-18/표.md` · 표준 출력에 보고 첫 줄의 수
//
// ★크래시 가름은 **첫 오류 줄 글자로만**(T1361 rows 의 마지막 칸 = 첫 ✗ 줄 또는 첫 `Error|Cannot find|is not defined|not a function` 줄):
//   ㉮ 손잡이 · 함수 · 모듈 없음(옛 제품에 없는 이름) — `is not a function` · `is not defined` · `is not iterable` · `is not a constructor` ·
//      `Cannot find module` · 제품 경로(`server|sim|public|lab`)를 여는 `ENOENT`
//   ㉯ 하네스가 찾는 소스 줄 없음(글자 핀) — 소스를 `indexOf(…)` 로 찾다 못 찾으면 던지는 줄(`indexOf(` 와 `throw new Error(` 가 한 줄)
//   ㉰ 그 밖 — 빈 줄 · `AssertionError`(node assert — ✗ 글자가 아닌 단언) · `Cannot read properties of undefined` · `Command failed`(아이 프로세스) 등
//      ㉰ 안의 갈래는 참고로만 센다(판정 아님).
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = process.env.OUT || path.join(ROOT, '계측', 'T1369_2026-11-18');
const SRC = process.env.SRC || path.join(ROOT, '계측', 'T1361_2026-11-17', 'rows.tsv');
const rd = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l.trim()).map((l) => l.split('\t'));

function crashKind(why) {
  const w = String(why || '');
  if (/is not a function|is not defined|is not iterable|is not a constructor|Cannot find module/.test(w)) return '㉮';
  if (/ENOENT/.test(w) && /\/(server|sim|public|lab)\//.test(w)) return '㉮';
  if (/indexOf\(/.test(w) && /throw new Error\(/.test(w)) return '㉯';
  return '㉰';
}
function crashSub(why) {
  const w = String(why || '').trim();
  if (!w) return '첫 오류 줄 없음';
  if (/AssertionError/.test(w)) return 'node assert 단언';
  if (/Cannot read propert/.test(w)) return 'undefined 읽기';
  if (/Command failed/.test(w)) return '아이 프로세스 실패';
  return '그 밖';
}

const src = rd(SRC);
const crashes = src.filter((r) => r[0] === '크래시').map((r) => ({ t: r[1], card: r[3], why: (r[10] || '').trim() }));
for (const c of crashes) { c.k = crashKind(c.why); c.sub = c.k === '㉰' ? crashSub(c.why) : ''; }
const K = { '㉮': 0, '㉯': 0, '㉰': 0 }; for (const c of crashes) K[c.k]++;
const SUB = {}; for (const c of crashes) if (c.sub) SUB[c.sub] = (SUB[c.sub] || 0) + 1;

const rerunF = path.join(OUT, 'rerun.tsv');
const rr = fs.existsSync(rerunF) ? rd(rerunF).map((r) => ({ t: r[0], kind: r[1], card: r[2], head: r[3], F: r[4], v: r[5], rc: r[6], np: r[7], nf: r[8], sec: r[9], why: r[10] || '' })) : [];
const cls = (v) => (/^빨강 ○/.test(v) ? '빨강' : /크래시/.test(v) ? '크래시' : /초록/.test(v) ? '초록' : v === '못찾음' ? '못찾음' : '모름');
const C = { 빨강: 0, 크래시: 0, 초록: 0, 못찾음: 0, 모름: 0 }; for (const r of rr) C[cls(r.v)]++;
const greens = rr.filter((r) => cls(r.v) === '초록');

const L = [];
L.push('# T1369 — T1361 초록 스무 종을 고침 커밋 F 앞(F^) 제품으로 다시 · 크래시 59 가름', '');
L.push(`자: \`scripts/t1369-run.sh\`(판) · \`scripts/t1369-table.js\`(이 표) · 판정 글자 = \`scripts/pm-old-code-red.sh\` 그대로(하네스 · lib = 지금 것 · 제품만 F^)`, '');
L.push('## 1. 스무 종', '');
L.push(`| 돈 줄 | 빨강 ○ | 크래시 △ | 초록 ✗ | 못 찾음 | 모름 |`, '|---:|---:|---:|---:|---:|---:|', `| ${rr.length} | ${C.빨강} | ${C.크래시} | ${C.초록} | ${C.못찾음} | ${C.모름} |`, '');
L.push('| 하네스 | T1361 갈래 | 카드(들인 커밋) | 머리 첫 T | F | 새 판정 | RC | ✓ | ✗ | 초 | 첫 실패 줄 |', '|---|---|---|---|---|---|---:|---:|---:|---:|---|');
for (const r of rr) L.push(`| ${r.t} | ${r.kind} | ${r.card} | ${r.head} | ${r.F === '—' ? '—' : '`' + r.F + '`'} | ${r.v} | ${r.rc} | ${r.np} | ${r.nf} | ${r.sec} | ${r.why.replace(/\|/g, '/')} |`);
L.push('', '### 여전히 초록(이 카드의 답 · 고치지 않고 회부)', '');
if (!greens.length) L.push('없음');
else { L.push('| 하네스 | 카드 | F | 초록인 단언 수(✓) |', '|---|---|---|---:|'); for (const r of greens) L.push(`| ${r.t} | ${r.card} | \`${r.F}\` | ${r.np} |`); }
L.push('', '## 2. 크래시 59 가름(T1361 · 첫 오류 줄 글자로만)', '');
L.push(`| ㉮ 이름 없음 | ㉯ 글자 핀 | ㉰ 그 밖 | 합 |`, '|---:|---:|---:|---:|', `| ${K['㉮']} | ${K['㉯']} | ${K['㉰']} | ${crashes.length} |`, '');
L.push(`㉰ 안(참고): ${Object.entries(SUB).map(([k, n]) => `${k} ${n}`).join(' · ')}`, '');
L.push('| 가름 | 하네스 | 카드 | 첫 오류 줄 |', '|---|---|---|---|');
for (const k of ['㉮', '㉯', '㉰']) for (const c of crashes.filter((x) => x.k === k)) L.push(`| ${k}${c.sub ? ' · ' + c.sub : ''} | ${c.t} | ${c.card} | ${c.why.replace(/\|/g, '/').slice(0, 150) || '(없음)'} |`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, '표.md'), L.join('\n') + '\n');
console.log(`스무 종 다시 — 빨강 ${C.빨강} · 크래시 ${C.크래시} · 여전히 초록 ${C.초록}(${greens.map((g) => g.t.replace(/\.js$/, '')).join(' · ') || '없음'}) · 못 찾음 ${C.못찾음} · 모름 ${C.모름} · 크래시 ${crashes.length} 가름 ㉮ ${K['㉮']} ㉯ ${K['㉯']} ㉰ ${K['㉰']}`);
