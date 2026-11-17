#!/usr/bin/env node
// @regress
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-touched-harness.js — 만진 함수 → 하네스 목록(`touched-harness.js`)이 바뀐 이름을 무는 하네스를 고르나 [T1356 ④] ==========
//   임시 git 저장소(제품 파일 하나 · 하네스 다섯)에서 갈림점 뒤 네 곳을 바꾸고 고른 목록을 본다 — 하네스 도구 검사(제품 무관):
//   ① 함수 몸통 속 한 줄(들여쓴 줄) → 둘레 함수 이름(`@@ … @@` 머리)으로 그 함수를 부르는 하네스를 고른다
//   ② 대문자 상수 → 그 상수를 무는 하네스 · ③ env 손잡이(`process.env.X`) → 그 손잡이를 무는 하네스 · ④ 바뀐 하네스 자신
//   ⑤ 안 바뀐 이름만 무는 하네스 · 흔한 낱말(지역 변수 `value` 같은)만 무는 하네스는 안 고른다 → 목록이 꼭 기대한 넷
//   ★미끼 둘 — `touched-harness.js` 사본 한 곳씩: 둘레 함수를 안 읽는 사본 → ① 빨강 · env 손잡이를 안 뽑는 사본 → ③ 빨강.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), Module = require('module'), { execFileSync } = require('child_process');
const TH = path.join(__dirname, 'touched-harness.js');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };

// 임시 저장소 — 베이스 커밋 뒤 작업 트리에 네 곳을 바꾼다(커밋 안 함 — 도구는 작업 트리까지 본다)
const R = fs.mkdtempSync(path.join(os.tmpdir(), 't1356-th-'));
const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd: R, encoding: 'utf8' });
const put = (f, s) => { fs.mkdirSync(path.dirname(path.join(R, f)), { recursive: true }); fs.writeFileSync(path.join(R, f), s); };
const A0 = ['function alphaWalk(x) {', '  const value = x + 1;', '  return value;', '}', '', 'function deltaRest(x) {', '  return x * 2;', '}', '', 'const BETA_LIMIT = 5;', 'module.exports = { alphaWalk, deltaRest, BETA_LIMIT };', ''];
put('server/a.js', A0.join('\n'));
put('scripts/test-uses-alpha.js', "// @regress\nconst A = require('../server/a');\nconsole.log(A.alphaWalk(1));\n");
put('scripts/test-uses-beta.js', "// @regress\nconst A = require('../server/a');\nconsole.log(A.BETA_LIMIT);\n");
put('scripts/test-uses-env.js', "// @regress\nprocess.env.GAMMA_KNOB = '1';\nrequire('../server/a');\n");
put('scripts/test-uses-delta.js', "// @regress\nconst A = require('../server/a');\nconsole.log(A.deltaRest(2));\n");
put('scripts/test-value.js', "// @regress\nconst value = 3;\nconsole.log(value);\n");
put('scripts/test-edit-me.js', '// @regress\nconsole.log(1);\n');
git('init', '-q', '-b', 'main'); git('add', '-A'); git('commit', '-q', '-m', 'base');
const A1 = A0.slice();
A1[1] = '  const value = x + 2;';                                                   // ① 몸통 속 한 줄(둘레 함수 = alphaWalk)
A1.splice(2, 0, "  if (process.env.GAMMA_KNOB === '1') return 0;");                   // ③ env 손잡이(같은 몸통)
A1[A1.indexOf('const BETA_LIMIT = 5;')] = 'const BETA_LIMIT = 6;';                   // ② 대문자 상수
put('server/a.js', A1.join('\n'));
put('scripts/test-edit-me.js', '// @regress\nconsole.log(2);\n');                    // ④ 바뀐 하네스
const WANT = ['test-edit-me.js', 'test-uses-alpha.js', 'test-uses-beta.js', 'test-uses-env.js'];

function planOf(src) {   // 도구(또는 그 사본)를 같은 자리에서 실어 plan() 을 부른다
  const m = new Module(TH, module); m.filename = TH; m.paths = Module._nodeModulePaths(path.dirname(TH));
  m._compile(src, TH);
  return m.exports.plan(R, 'main');
}
console.log('\n=== 만진 함수 → 하네스 목록 (touched-harness · 임시 저장소) ===');
const SRC = fs.readFileSync(TH, 'utf8');
const P = planOf(SRC);
const L = P.list;
ok(P.files.length === 1 && P.files[0].file === 'server/a.js', '[상황] 바뀐 코드 파일 하나를 읽었다(하네스 파일은 이름을 안 뽑는다)', JSON.stringify(P.files));
ok(L.includes('test-uses-alpha.js') && P.names.includes('alphaWalk'), '① 함수 몸통 속 한 줄 → 둘레 함수(alphaWalk)를 부르는 하네스를 고른다', P.names.join(' '));
ok(L.includes('test-uses-beta.js') && P.names.includes('BETA_LIMIT'), '② 대문자 상수(BETA_LIMIT) → 그 상수를 무는 하네스', '');
ok(L.includes('test-uses-env.js') && P.names.includes('GAMMA_KNOB'), '③ env 손잡이(GAMMA_KNOB) → 그 손잡이를 무는 하네스', '');
ok(L.includes('test-edit-me.js') && P.changedHarness.includes('test-edit-me.js'), '④ 바뀐 하네스 자신이 목록에 든다', P.changedHarness.join(' '));
ok(JSON.stringify(L) === JSON.stringify(WANT) && !P.names.includes('value'), '⑤ 안 바뀐 함수(deltaRest) · 흔한 지역 변수(value)만 무는 하네스는 안 고른다 — 목록이 꼭 기대한 넷', L.join(' '));

// ★미끼 — 도구 사본 한 곳씩(바꾼 자리 수를 센다) · 어느 줄이 빨강이 되나를 단언한다
const bait = (FROM, TO) => { const n = SRC.split(FROM).length - 1; let Q = null, err = ''; if (n === 1) { try { Q = planOf(SRC.replace(FROM, TO)); } catch (e) { err = String(e.message || e).slice(0, 100); } } return { n, Q, err }; };
{
  const B = bait('ctx = declNames(m[1]); continue;', 'continue;');
  ok(B.n === 1 && !!B.Q && !B.Q.list.includes('test-uses-alpha.js') && B.Q.list.includes('test-uses-beta.js'), '미끼 — 둘레 함수(덩어리 머리)를 안 읽는 사본 → ① 빨강(alphaWalk 하네스 빠짐 · ② 는 그대로)', `바꾼 자리 ${B.n} · 사본 목록 ${B.Q ? B.Q.list.join(' ') : B.err}`);
}
{
  const B = bait('  /process\\.env\\.([A-Z][A-Z0-9_]+)/g,\n', '');
  ok(B.n === 1 && !!B.Q && !B.Q.list.includes('test-uses-env.js') && B.Q.list.includes('test-uses-alpha.js'), '미끼 — env 손잡이를 안 뽑는 사본 → ③ 빨강(GAMMA_KNOB 하네스 빠짐 · ① 은 그대로)', `바꾼 자리 ${B.n} · 사본 목록 ${B.Q ? B.Q.list.join(' ') : B.err}`);
}
try { fs.rmSync(R, { recursive: true, force: true }); } catch (e) { /* 임시 */ }
console.log(`\n=== test-touched-harness 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
