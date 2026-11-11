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
//   ⑦~⑨ [T1257] 한 눈 · 주석을 짚는 리터럴 · 한글 경로 · 얇은 클론 못 잼(아래 절 머리)
//   ⑥ 커밋 2 의 부분 클론(`--filter=blob:none`) — 망 0(전송 금지) · 지금 없는 두 줄은 못 잼으로 센다(끝 줄 · ⚠ 줄 · 20초 안)
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
    ok(r.status === 0 && /못 잼 2\(태어난 판이 지역에 없음/.test(last) && /⚠ 부분 클론/.test(out) && sec < 20,
      '⑥ 부분 클론 — 망 0 · 빨강 · 참고 줄 둘을 못 잼으로 센다(조용히 초록 아님 · 끝 줄 · ⚠ 줄) · 빨리 끝난다', `${last} · ${sec.toFixed(1)}초`);
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

// ── ★[T1257] 한 눈 · 주석을 짚는 리터럴 · 한글 경로 · 얇은 클론 (T1252 회부 1 · land1064 ⑭ 빨강 2) ─────────────────────────────
//   가짜 레포 둘째: 커밋 1 → 2(진짜로 사라짐 셋) → 3(새 줄 하나 + 그 글자) → 4(그 글자 사라짐).
//   ⑦ 커밋 1 — 여러 줄 `/* */` 속에만 있는 글자를 짚는 줄은 빨강이 아니다(종전: 옛 판만 줄 머리로 걸러 "있었다" → 거짓 빨강 · 지금 판과 다른 눈)
//   ⑧ ★커밋 2 — 진짜로 사라진 판정 글자 셋이 다 빨강: (가) 주석을 짚는 리터럴 `/\/\/ 직업별 인구/` — 그 주석을 지웠다
//      (나) 글자가 이제 줄 가운데 `/* */` 에만 남았다 — 주석은 "없다" (다) 한글 이름 파일(`lab/한글판.html`)의 글자 — `core.quotePath` 와 무관하게 읽는다
//   ⑨ ★얇은 클론(`--depth 3` · 경계 = 커밋 2) — 경계 너머에서 태어난 줄은 **못 잼**(빨강 · 초록 어디에도 안 넣는다 · 끝 줄에 수) · 잰 줄은 전체 클론과 같은 판
{
  const R2 = fs.mkdtempSync(path.join(os.tmpdir(), 'tlhw2-'));
  const W2 = (rel, s2) => { fs.mkdirSync(path.dirname(path.join(R2, rel)), { recursive: true }); fs.writeFileSync(path.join(R2, rel), s2); };
  const G2 = (...a) => execFileSync('git', ['-C', R2, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const commit2 = (m) => { G2('add', '-A'); G2('commit', '-q', '-m', m); return G2('rev-parse', 'HEAD').trim(); };
  const lint2 = (root) => { const r = spawnSync(process.execPath, [LINT, '--root', root], { encoding: 'utf8' }); const out = (r.stdout || '') + (r.stderr || ''); return { code: r.status, out, last: out.trim().split('\n').pop(), red: out.split('\n').filter((l) => /^  ✗/.test(l)) }; };
  const SRV = (c) => `'use strict';
const t = 1;${c.cm ? '   // 직업별 인구 (incremental)' : ''}
function a(send) { send(${c.rice ? "'밥을 지었다'" : "'밥을 지었습니다'); /* 옛: 밥을 지었다 */ (0"}); }
/*
  옛 글자 노을이 졌다
*/
function b(send) { send('해가 졌습니다'); }
${c.star ? "function s(send) { send('별이 떴다'); }\n" : ''}module.exports = { a, b };
`;
  const HTML = (bow) => `<!doctype html><script>function c(send) { send(${bow ? "'활을 쐈다'" : "'활을 쐈습니다'"}); }</script>\n`;
  const HAR = (e) => `'use strict';
const ok = (c, m) => console.log(c ? '  ✓ ' + m : '  ✗ ' + m);
const notes = [], src = '';
ok(/\\/\\/ 직업별 인구/.test(src), '주석 앵커');
ok(notes.some((t) => /밥을 지었다/.test(t)), '밥');
ok(notes.some((t) => /활을 쐈다/.test(t)), '활');
ok(notes.some((t) => /노을이 졌다/.test(t)), '노을');
${e ? "ok(notes.some((t) => /별이 떴다/.test(t)), '별');\n" : ''}`;
  G2('init', '-q'); G2('config', 'core.quotePath', 'true');   // 한글 경로를 따옴표로 감싸는 기본값 그대로(자가 스스로 끈다)
  W2('server/b.js', SRV({ cm: 1, rice: 1 })); W2('lab/한글판.html', HTML(1)); W2('scripts/test-y.js', HAR(0));
  commit2('1');
  const p1 = lint2(R2);
  ok(p1.code === 0 && p1.red.length === 0 && /^LINT-HARNESS-WORDS PASS · 빨강 0 · /.test(p1.last),
    '⑦ 커밋 1 — 여러 줄 `/* */` 속에만 있는 글자(노을)는 지금 · 옛 판 둘 다 "없다"(같은 눈) — 거짓 빨강 0', p1.red.join(' ; ') || p1.last);
  W2('server/b.js', SRV({ cm: 0, rice: 0 })); W2('lab/한글판.html', HTML(0));
  commit2('2 사라짐 셋');
  const p2 = lint2(R2);
  const has = (re) => p2.red.some((l) => re.test(l));
  ok(p2.code === 1 && p2.red.length === 3 && has(/test-y\.js:4 .*그때 있음 직업별 인구/) && has(/test-y\.js:5 .*그때 있음 밥을 지었다/) && has(/test-y\.js:6 .*그때 있음 활을 쐈다/),
    '★⑧ 커밋 2 — 진짜로 사라진 셋이 다 빨강: 주석 앵커(주석 포함 판 · 지금 · 옛 같게) · 줄 가운데 `/* */` 에만 남은 글자 · 한글 이름 파일 글자(quotePath 켬)', p2.red.join(' ; ') || p2.last);
  W2('server/b.js', SRV({ cm: 0, rice: 0, star: 1 })); W2('scripts/test-y.js', HAR(1));
  commit2('3 별');
  W2('server/b.js', SRV({ cm: 0, rice: 0, star: 0 }));
  commit2('4 별 사라짐');
  const full = lint2(R2);
  const P2 = R2 + '-sh';
  execFileSync('git', ['clone', '-q', '--depth', '3', 'file://' + R2, P2], { stdio: 'ignore' });
  const sh = lint2(P2);
  const lineOf = (l) => (/test-y\.js:(\d+)/.exec(l) || [])[1];
  ok(full.code === 1 && full.red.length === 4 && sh.code === 1 && sh.red.length === 1 && lineOf(sh.red[0]) === '8' && full.red.some((l) => lineOf(l) === '8')
    && /못 잼 4/.test(sh.out) && /⚠ 얇은 클론 — 경계 너머에서 태어난 줄 4 은 못 잼/.test(sh.out) && !/못 잼/.test(full.out),
    '★⑨ 얇은 클론(깊이 3) — 경계 너머 넷은 못 잼(빨강에도 초록에도 안 듦 · 끝 줄 · ⚠ 줄) · 잰 줄(별 · 커밋 3)은 전체 클론과 같은 빨강', `전체 빨강 ${full.red.length} · 얇은 빨강 ${sh.red.length} · ${sh.last}`);
  fs.rmSync(P2, { recursive: true, force: true }); fs.rmSync(R2, { recursive: true, force: true });
}
console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
