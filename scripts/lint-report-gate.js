#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · 보고 글 점검 · 경고만 · 제품 무변)
// === scripts/lint-report-gate.js — 보고의 끈 판 줄에 기준선 자 끝 줄(칸별 날 수)이 붙었나 (T1287 · T1280 회부 1) ==========================
//
// ★왜 T1280: 기준선 자는 생활층(마을 칸 지문)을 0일만 견줘도 '같음 1/1' 을 냈고, 보고는 대개 '끈 판 같음 1/1' 요약만 적어
//   생활층을 실제로 견줬는지 거꾸로 가를 수 없었다. T1280 뒤로 자의 끝 줄은 `=== 같음 1/1 · 경제 n/N · 생활층 m/M · …` 이다.
//   ⇒ 보고 규약(`지시/_보고머리_템플릿.md` T1287 줄): 끈 판 줄은 그 끝 줄을 그대로 붙인다.
// 점검(날짜 = 파일 이름 `T◯◯◯_<날짜>.md` · 기본 --since 2026-11-13 = 규약을 둔 날 뒤 · 그 앞 보고는 `--since` 로 훑기만):
//   보고에 끈 판 낱말(`끈 판` · `OFF_GATE` · `server-baseline-check`)이 있으면 같은 보고 안에 칸별 날 수 꼴
//   (`경제 \d+/\d+ · 생활층 (\d+/\d+|기준선에 없음)`)이 하나 이상 있어야 한다. 없으면 경고 한 줄(파일 · 끈 판 첫 줄).
//   생활층이 기준선보다 적은 꼴(`생활층 m/M` · m < M)이 '같음' 줄에 적혀 있으면 경고(그 판은 같음이 아니라 판 실패다 · `판 실패` · `미끼` 줄은 뺀다).
// 쓰는 법: node scripts/lint-report-gate.js [--since 2026-11-12] [--strict(경고 있으면 나감 1)] [--self-test]
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf(k); return i >= 0 ? A[i + 1] : d; };
const SINCE = opt('--since', '2026-11-13');
const GATE = /끈 판|OFF_GATE|server-baseline-check/;
const COV = /경제 (\d+)\/(\d+) · 생활층 (?:(\d+)\/(\d+)|기준선에 없음)/g;
function check(text) {   // → { gate: bool, cov: n, short: [ '생활층 m/M' ], first: '끈 판 첫 줄' }
  const lines = text.split('\n');
  const g = lines.find((l) => GATE.test(l));
  if (!g) return { gate: false };
  const cov = [...text.matchAll(COV)];
  const short = [];
  for (const l of lines) { if (/판 실패|미끼/.test(l) || !/같음/.test(l)) continue; for (const m of l.matchAll(COV)) if ((m[3] != null && +m[3] < +m[4]) || +m[1] < +m[2]) short.push(m[0]); }
  return { gate: true, cov: cov.length, short, first: g.trim().slice(0, 140) };
}
if (A.includes('--self-test')) {   // 미끼 — 같은 자로 넷을 재면 각자 답한다
  const t = [
    ['끈 판 `server-baseline-check …` → `=== 같음 1/1 · 경제 400/400 · 생활층 400/400 · 판 807초 ===`', 'ok'],
    ['끈 판 = 기준선 같음 1/1(인구 3,914)', 'warn'],
    ['끈 판 `=== 같음 1/1 · 경제 400/400 · 생활층 0/400 · …`', 'short'],
    ['게이트 줄 없음 — 랩 판만', 'none'],
  ].map(([x, want]) => { const r = check(x); const got = !r.gate ? 'none' : r.short.length ? 'short' : r.cov ? 'ok' : 'warn'; return got === want; });
  const ok = t.every(Boolean);
  console.log(`LINT-REPORT-GATE 자기 점검 ${ok ? 'PASS' : 'FAIL'} — 붙음 · 요약만 · 생활층 모자람 · 게이트 없음 = ${t.map((x) => (x ? '○' : '✗')).join(' ')}`);
  process.exit(ok ? 0 : 1);
}
const DIR = path.join(ROOT, '보고');
const files = fs.readdirSync(DIR).filter((f) => /^T\d+[A-Za-z0-9-]*_(\d{4}-\d{2}-\d{2})\.md$/.test(f) && f.match(/_(\d{4}-\d{2}-\d{2})\.md$/)[1] >= SINCE).sort();
let warn = 0, seen = 0;
for (const f of files) {
  const r = check(fs.readFileSync(path.join(DIR, f), 'utf8'));
  if (!r.gate) continue;
  seen++;
  if (!r.cov) { warn++; console.log(`  ⚠ ${f}: 끈 판 줄에 칸별 날 수(경제 n/N · 생활층 m/M)가 없다 — ${r.first}`); }
  else if (r.short.length) { warn++; console.log(`  ⚠ ${f}: 칸이 기준선보다 적은 날을 견줬다(같음 아님 · 판 실패) — ${r.short.join(' · ')}`); }
}
console.log(`LINT-REPORT-GATE ${warn ? '경고' : 'PASS'} · ${SINCE} 뒤 보고 ${files.length} · 끈 판 있는 보고 ${seen} · 경고 ${warn}`);
process.exit(warn && A.includes('--strict') ? 1 : 0);
