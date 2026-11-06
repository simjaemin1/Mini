#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-lint-harness-words.js — 하네스 판정 글자 자(`scripts/lint-harness-words.js` · T1097 · 2026-11-03) 미끼 ===============================
//
// 판정 사본 0: 임시 폴더에 작은 가짜 레포(git)를 세우고 자를 `--root` 로 그대로 부른다. 말투 카드 꼴을 커밋으로 재연한다:
//   커밋 1 — 서버가 "고기를 먹였다" · "너무 멀다" · "너무 멀어" · `${name}에 들었습니다` 를 낸다. 하네스는 `/먹였다/` · `/너무 멀/` · `/열린뜰에 들었습니다/`(제 손으로
//            길드 "열린뜰"을 만든다) · `includes('하네스만의 글자')`(제 출력) 를 판정한다.
//   커밋 2 — 말투 카드: "먹였다" → "먹였습니다"(그리고 **주석**에 옛 글자를 남긴다) · "너무 멀다" → "너무 멉니다"("너무 멀어" 는 그대로).
//   커밋 3 — 하네스를 고친다(`/먹였(다|습니다)/`).
// 지키는 것:
//   ① 커밋 1 — PASS(나감 0) · 런타임 이름(열린뜰)과 하네스 제 글자는 빨강이 아니다
//   ② ★커밋 2 — FAIL(나감 1) · 빨강 = `/먹였다/` 하나 · 주석에 남은 옛 글자가 빨강을 숨기지 않는다
//   ③ 커밋 2 · `--old <커밋 1>` — `/너무 멀/` 이 **줄어듦**(노랑 · 2→1)에 선다(다른 문장에 남아 "있다"가 되는 꼴) · 나감은 빨강만 가른다
//   ④ 커밋 3 — PASS(나감 0 · 고치면 풀린다)
//   ⑤ 판정 자리 밖(`console.log` · `ok()` 메시지)의 옛 글자는 안 본다 — 커밋 2 의 빨강은 하나뿐
//   ⑥ 커밋 2 의 부분 클론(`--filter=blob:none`) — 망 0(전송 금지) · 지금 없는 두 줄은 건너뜀으로 센다(끝 줄 · ⚠ 줄 · 20초 안)
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawnSync, execFileSync } = require('child_process');
const LINT = path.join(__dirname, 'lint-harness-words.js');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'tlhw-'));
const W = (rel, s) => { fs.mkdirSync(path.dirname(path.join(R, rel)), { recursive: true }); fs.writeFileSync(path.join(R, rel), s); };
const G = (...a) => execFileSync('git', ['-C', R, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
const commit = (m) => { G('add', '-A'); G('commit', '-q', '-m', m); return G('rev-parse', 'HEAD').trim(); };
const lint = (...a) => { const r = spawnSync(process.execPath, [LINT, '--root', R, ...a], { encoding: 'utf8' }); const out = (r.stdout || '') + (r.stderr || ''); return { code: r.status, out, last: out.trim().split('\n').pop(), red: out.split('\n').filter((l) => /^  ✗/.test(l)), yel: out.split('\n').filter((l) => /^  ~/.test(l)) }; };
const SERVER1 = `'use strict';
function feed(send) { send('고기를 먹였다'); }
function far(send, d) { if (d > 9) send('너무 멀다'); }
function far2(send) { send('너무 멀어'); }
function join(send, name) { send(\`\${name}에 들었습니다\`); }
module.exports = { feed, far, far2, join };
`;
const HARNESS = (fed) => `'use strict';
const ok = (c, m) => console.log(c ? '  ✓ ' + m : '  ✗ ' + m);
const notes = [];
const send = (t) => notes.push(t);
send('/길드 만들기 열린뜰');
console.log('먹였다 — 장식(판정 자리 밖)');
ok(notes.some((t) => /${fed}/.test(t)), '먹였다(메시지는 장식)');
ok(notes.some((t) => /너무 멀/.test(t)), '멀다');
ok(notes.some((t) => /열린뜰에 들었습니다/.test(t)), '길드');
ok(notes.join('').includes('하네스만의 글자'), '제 출력');
`;
git: {
  G('init', '-q');
  W('server/a.js', SERVER1); W('scripts/test-x.js', HARNESS('먹였다'));
  const c1 = commit('1');
  console.log('\n=== 하네스 판정 글자 자 — scripts/lint-harness-words.js(가짜 레포) ===');
  const a = lint();
  ok(a.code === 0 && /^LINT-HARNESS-WORDS PASS · 빨강 0 · 한글 판정 리터럴 4 · /.test(a.last), '① 커밋 1 — PASS · 런타임 이름(열린뜰) · 하네스 제 글자는 빨강 아님', a.last);
  W('server/a.js', SERVER1.replace("send('고기를 먹였다');", "send('고기를 먹였습니다'); // 옛 글자: 고기를 먹였다").replace("send('너무 멀다')", "send('너무 멉니다')"));
  commit('2 말투');
  const b = lint();
  ok(b.code === 1 && b.red.length === 1 && /test-x\.js:7 .*먹였다.*그때 있음 먹였다/.test(b.red[0]) && /^LINT-HARNESS-WORDS FAIL · 빨강 1 · test-x\.js:7 먹였다/.test(b.last),
    '★② 커밋 2(말투) — FAIL · 빨강 = /먹였다/ 하나 · 주석에 남은 옛 글자가 숨기지 않는다', b.red.join(' ; ') || b.last);
  ok(b.red.length === 1 && !b.red.some((l) => /장식|메시지|열린뜰|하네스만의/.test(l)), '⑤ 판정 자리 밖 · 런타임 이름 · 제 출력은 빨강이 아니다(빨강 하나뿐)');
  //   ⑥ 부분 클론(옛 블롭 없음 · 약속 원격) — 망 0: 옛 판을 원격에서 받지 않고 그 줄을 **건너뜀**으로 센다(T1112 · PM land1039 추신)
  {
    G('config', 'uploadpack.allowFilter', 'true');
    const P = R + '-pc';
    execFileSync('git', ['clone', '-q', '--filter=blob:none', 'file://' + R, P], { stdio: 'ignore' });
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [LINT, '--root', P], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || ''), last = out.trim().split('\n').pop(), sec = (Date.now() - t0) / 1000;
    ok(r.status === 0 && /건너뜀 2\(태어난 판이 지역에 없음/.test(last) && /⚠ 부분 클론/.test(out) && sec < 20,
      '⑥ 부분 클론 — 망 0 · 빨강 · 참고 줄 둘을 건너뜀으로 센다(조용히 초록 아님 · 끝 줄 · ⚠ 줄) · 빨리 끝난다', `${last} · ${sec.toFixed(1)}초`);
    fs.rmSync(P, { recursive: true, force: true });
  }
  const y = lint('--old', c1);
  ok(y.code === 1 && y.yel.length === 1 && /test-x\.js:8 .*너무 멀.*줄어듦 너무 멀 2→1/.test(y.yel[0]), '★③ `--old <커밋 1>` — /너무 멀/ 이 줄어듦(노랑 2→1)에 선다 · 나감은 빨강만 가른다', y.yel.join(' ; ') || y.last);
  W('scripts/test-x.js', HARNESS('먹였(다|습니다)'));
  commit('3 하네스 고침');
  const c = lint();
  ok(c.code === 0 && /^LINT-HARNESS-WORDS PASS · 빨강 0 · /.test(c.last), '④ 커밋 3(하네스 고침) — PASS', c.last);
}
fs.rmSync(R, { recursive: true, force: true });
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
