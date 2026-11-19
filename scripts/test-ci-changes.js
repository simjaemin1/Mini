#!/usr/bin/env node
// @regress
// @harness-only
// @bait 2
// === scripts/test-ci-changes.js — CI `changes` 잡의 자(`scripts/ci-changes.sh`)가 문서만 판을 가르는가 (T1375 · main 보호 규칙 앞) ===============
//
// ★무엇: 임시 git 레포(가짜 `origin/main` 포함)에 커밋을 쌓고 진짜 `ci-changes.sh` 를 그대로 부른다(판정 사본 0). 지키는 것:
//   ① 문서만(지시 · 보고 · 인계 · 회부 — 종전 `paths-ignore` 그대로) = code=false · 코드 한 파일이라도 = true · 섞임 = true · `계측/`(문서 자리 아님) = true
//   ② 옛 판 고르기 — push 의 `before` · 새 가지(before 0 줄) = `origin/main` 과 갈림점 · 없는 커밋 = 갈림점 · PR = base sha · 수동 = 늘 true
//   ③ 보수 — 바뀐 파일 0 · 옛 판 없음 = true(건너뜀은 확실할 때만)
// ★미끼(이 파일 안 — 자 사본): ⓐ 문서 자리에서 `보고` 를 뺀 사본 → ① "보고만 = false" 가 빨강 ⓑ `core.quotepath=off` 를 뺀 사본(한글 경로가 따옴표 · 8진수로 나와
//   문서 자리 글자에 안 맞는다) → 같은 줄이 빨강 — 둘 다 바꾼 자리 1 을 센다.
// ★제품 부름 0(`@harness-only`).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const SCRIPT = path.join(__dirname, 'ci-changes.sh');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'tcich-'));
const G = (...a) => execFileSync('git', ['-C', R, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const W = (rel, s) => { fs.mkdirSync(path.dirname(path.join(R, rel)), { recursive: true }); fs.writeFileSync(path.join(R, rel), s); };
const commit = (files, m) => { for (const [f, s] of Object.entries(files)) W(f, s); G('add', '-A'); G('commit', '-q', '-m', m); return G('rev-parse', 'HEAD'); };
//   자를 부른다 — script = 자 글자(사본이면 그 사본) · 레포 뿌리에서
function run(script, ev, before, prbase) {
  const f = path.join(R, '.ci-changes.sh'); fs.writeFileSync(f, script);
  const r = spawnSync('bash', [f, ev, before || '', prbase || ''], { cwd: R, encoding: 'utf8' });
  fs.unlinkSync(f);
  const code = (/^code=(\w+)/m.exec(r.stdout || '') || [])[1] || `rc${r.status}`;
  return { code, why: ((/^why=(.*)$/m.exec(r.stdout || '') || [])[1] || (r.stderr || '').trim()).slice(0, 80) };
}
const SRC = fs.readFileSync(SCRIPT, 'utf8');

G('init', '-q', '-b', 'main');
const c0 = commit({ 'scripts/a.js': '1\n', '보고/T1.md': '첫\n' }, 'c0');
G('update-ref', 'refs/remotes/origin/main', c0);   // 가짜 origin/main
G('checkout', '-q', '-b', 'batch/x');
const cDoc = commit({ '보고/T2.md': '보고만\n', '지시/지시_T2.md': '카드\n' }, 'docs');
const cDoc2 = commit({ '인계/회부.md': '회부\n', '회부/x.md': 'y\n' }, 'docs2');
const cCode = commit({ 'scripts/b.js': '2\n' }, 'code');
const cMix = commit({ '보고/T3.md': '3\n', 'scripts/z.js': '3\n' }, 'mix');
const cMeas = commit({ '계측/T3/표.md': '계측\n' }, 'meas');
const ZERO = '0000000000000000000000000000000000000000';

function cases(script) {
  const at = (sha) => G('checkout', '-q', sha);
  const out = {};
  at(cDoc); out.docOnly = run(script, 'push', c0);
  at(cDoc2); out.docOnly2 = run(script, 'push', cDoc);
  at(cCode); out.code = run(script, 'push', cDoc2);
  at(cMix); out.mix = run(script, 'push', cCode);
  at(cMeas); out.meas = run(script, 'push', cMix);
  at(cDoc2); out.newBranchDoc = run(script, 'push', ZERO);          // 새 가지 — origin/main(c0) 과 갈림점부터 = 문서 둘
  at(cCode); out.newBranchCode = run(script, 'push', ZERO);
  at(cDoc); out.unknownBefore = run(script, 'push', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');   // 없는 커밋(강제 밂 뒤) — 갈림점
  at(cDoc2); out.pr = run(script, 'pull_request', '', c0);
  at(cCode); out.prCode = run(script, 'pull_request', '', cDoc2);
  at(cDoc); out.manual = run(script, 'workflow_dispatch', c0);
  at(cDoc); out.empty = run(script, 'push', cDoc);                  // 바뀐 파일 0
  G('checkout', '-q', 'batch/x');
  return out;
}

console.log('\n=== CI `changes` 자 — 문서만이면 건너뛴다 (T1375) ===');
const A = cases(SRC);
ok(A.docOnly.code === 'false' && A.docOnly2.code === 'false', '★★① 문서만(보고 · 지시 · 인계 · 회부 — 한글 경로) = code=false', `${A.docOnly.why} · ${A.docOnly2.why}`);
ok(A.code.code === 'true' && A.mix.code === 'true', '★★① 코드 한 파일 · 문서와 섞임 = code=true', `${A.code.why} · ${A.mix.why}`);
ok(A.meas.code === 'true', '① `계측/` 은 문서 자리가 아니다(종전 paths-ignore 와 같다) = true', A.meas.why);
ok(A.newBranchDoc.code === 'false' && A.newBranchCode.code === 'true', '★② 새 가지(before 0 줄) = origin/main 과 갈림점부터 — 문서만 false · 코드 섞이면 true', `${A.newBranchDoc.why} · ${A.newBranchCode.why}`);
ok(A.unknownBefore.code === 'false' && /문서만 2/.test(A.unknownBefore.why), '② 없는 before(강제 밂 뒤) = 갈림점으로 — 그 사이 문서만', A.unknownBefore.why);
ok(A.pr.code === 'false' && A.prCode.code === 'true', '② PR = base sha 부터', `${A.pr.why} · ${A.prCode.why}`);
ok(A.manual.code === 'true' && A.empty.code === 'true', '③ 수동 판 · 바뀐 파일 0 = true(보수 — 건너뜀은 확실할 때만)', `${A.manual.why} · ${A.empty.why}`);

console.log('\n④ 미끼 — 자 사본 둘(한 자리만 바꿈)');
{ const from = "DOCS='^(지시|보고|인계|회부)/'", n = SRC.split(from).length - 1;
  const B = cases(SRC.replace(from, "DOCS='^(지시|인계|회부)/'"));
  ok(n === 1 && B.docOnly.code === 'true' && B.docOnly2.code === 'false', '★④ⓐ [미끼] 문서 자리에서 `보고` 를 뺀 사본 — ① "보고만 = false" 줄이 빨강(보고 없는 문서 판은 그대로)', `바꾼 자리 ${n} · ${B.docOnly.code} · ${B.docOnly2.code}`); }
{ const from = 'git -c core.quotepath=off diff', n = SRC.split(from).length - 1;
  const B = cases(SRC.replace(from, 'git -c core.quotepath=on diff'));
  ok(n === 1 && B.docOnly.code === 'true' && B.code.code === 'true', '★④ⓑ [미끼] 한글 경로를 따옴표로 내는 사본(quotepath 켬) — ① 문서만 판이 true 로 빨강', `바꾼 자리 ${n} · ${B.docOnly.code}(${B.docOnly.why})`); }

fs.rmSync(R, { recursive: true, force: true });
console.log(`\n=== test-ci-changes 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
