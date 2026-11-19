#!/usr/bin/env node
// @regress
// @harness-only
// @bait 1
// === scripts/test-harness-bite.js — 옛 코드 빨강 자가 `scripts/` 운영 파일을 재는 하네스도 무는가 (T1375 · T1369 "여전히 초록" 셋) =====================
//
// ★왜: T1369 의 옛 코드 빨강 판에서 셋이 고침 앞 제품에서도 초록이었다. 둘(`test-live-lag-net` · `test-lint-harness-words`)은 재는 고침이 제품 자리
//   (server · sim · public · lab)가 아니라 `scripts/` 안 운영 파일(`live-lag.sh` · `lint-harness-words.js`)이라, 자가 그 파일을 지금 것 그대로 두어 초록이 났다.
//   ⇒ 머리 표지 `// @old-red-also <경로…>` — 자(`pm-old-code-red.sh`)가 그 파일도 옛 ref 것으로 되돌려 돈다(T1375).
// ★무엇: ① 임시 레포에서 진짜 자를 그대로 돈다(판정 사본 0) — 표지 단 하네스는 운영 파일이 옛 판이라 빨강 ○ · 판이 끝나면 운영 파일이 지금 것으로 돌아온다
//   ② 지금 `scripts/test-*.js` 의 표지 경로는 레포에 있고 하네스 자신(`scripts/test-*`)이 아니다 · 표지 단 하네스가 실제로 있다
// ★미끼(이 파일 안): 같은 하네스 사본에서 표지 한 줄만 뺀다 → 자가 "초록 ✗"(옛 판에서도 초록 — T1369 그 꼴)로 빨강 — 바꾼 자리 1.
// ★제품 부름 0(`@harness-only`).
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const SCRIPTS = __dirname, ROOT = path.join(SCRIPTS, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x != null && x !== '' ? '  ' + x : '')); };
const R = fs.mkdtempSync(path.join(os.tmpdir(), 'thbite-'));
const G = (...a) => execFileSync('git', ['-C', R, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const W = (rel, s) => { fs.mkdirSync(path.dirname(path.join(R, rel)), { recursive: true }); fs.writeFileSync(path.join(R, rel), s); };
const commit = (m) => { G('add', '-A'); G('commit', '-q', '-m', m); return G('rev-parse', 'HEAD'); };

//   가짜 레포 — 가짜 제품 자리 하나(`PROD=prod` — 자는 `git checkout <옛> -- $PROD`) · 운영 스크립트 하나 · 그것을 재는 하네스 하나
const HARNESS = (mark) => `#!/usr/bin/env node
// @regress
${mark ? '// @old-red-also scripts/op.sh   (재는 고침이 이 운영 스크립트)\n' : ''}'use strict';
const out = require('child_process').execFileSync('bash', [require('path').join(__dirname, 'op.sh')], { encoding: 'utf8' }).trim();
const good = out === 'new';
console.log((good ? '  ✓ ' : '  ✗ ') + '운영 스크립트가 고친 답을 낸다  ' + out);
process.exit(good ? 0 : 1);
`;
G('init', '-q', '-b', 'main');
W('prod/keep.js', '1\n');   // 가짜 제품 자리 하나(자 `PROD` env 로 이 자리를 옛 판으로 — 진짜 제품 자리 이름은 안 쓴다)
W('scripts/op.sh', 'echo old\n');
fs.copyFileSync(path.join(SCRIPTS, 'pm-old-code-red.sh'), path.join(R, 'scripts', 'pm-old-code-red.sh'));
const c1 = commit('옛 판 — 운영 스크립트 고치기 전');
W('scripts/op.sh', 'echo new\n');
W('scripts/test-op.js', HARNESS(true));
commit('고침 + 하네스(표지 있음)');

function ocr(harnessText) {
  W('scripts/test-op.js', harnessText);
  const OUT = path.join(R, '.ocr-out.txt'); try { fs.unlinkSync(OUT); } catch (e) {}
  const r = spawnSync('bash', ['scripts/pm-old-code-red.sh', c1, 'test-op.js'], { cwd: R, encoding: 'utf8', env: Object.assign({}, process.env, { TIMEOUT_SEC: '60', OUT, PROD: 'prod' }) });
  let txt = ''; try { txt = fs.readFileSync(OUT, 'utf8'); } catch (e) {}
  const line = txt.split('\n').find((l) => /\| test-op\.js \|/.test(l)) || ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 120);
  return { rc: r.status, line, after: fs.readFileSync(path.join(R, 'scripts', 'op.sh'), 'utf8').trim() };
}

console.log('\n=== ① 옛 코드 빨강 — `@old-red-also` 표지 (T1375) ===');
const A = ocr(HARNESS(true));
ok(/^빨강 ○ \| test-op\.js/.test(A.line) && A.rc === 0, '★★① 표지 단 하네스 — 운영 스크립트를 옛 판으로 되돌려 돌면 빨강 ○(자 RC 0)', A.line.slice(0, 120));
ok(/옛 판으로 되돌린 운영 파일: scripts\/op\.sh/.test(A.line), '① 줄에 되돌린 파일 이름을 적는다(무엇을 옛 판으로 돌렸나)', '');
ok(A.after === 'echo new', '① 자는 레포의 운영 스크립트를 안 건드린다(사본 안에서만 옛 판)', A.after);

console.log('\n② 지금 레포의 표지');
const tagged = fs.readdirSync(SCRIPTS).filter((f) => /^test-.*\.js$/.test(f)).map((f) => [f, (/^\/\/ @old-red-also[ \t]+(.*)$/m.exec(fs.readFileSync(path.join(SCRIPTS, f), 'utf8').split('\n').slice(0, 40).join('\n')) || [])[1]]).filter(([, v]) => v);
const bad = [];
for (const [f, v] of tagged) for (const p of v.replace(/\s+\(.*$/, '').trim().split(/\s+/)) {
  if (/^scripts\/test-|\.\.|^\//.test(p) || !fs.existsSync(path.join(ROOT, p))) bad.push(`${f}→${p}`);
}
ok(tagged.length >= 2, '② [전제] 표지 단 하네스가 실제로 있다(0 이면 아래가 자명 통과다)', tagged.map(([f]) => f).join(' '));
ok(bad.length === 0, '★② 표지 경로는 레포에 있고 하네스 자리(`scripts/test-*`) · 바깥(`..` · `/`)이 아니다', bad.join(' ') || `${tagged.length}/${tagged.length}`);

console.log('\n③ 미끼 — 표지 한 줄을 뺀 하네스 사본');
{ const withMark = HARNESS(true), noMark = HARNESS(false);
  const n = withMark.split('\n').length - noMark.split('\n').length;
  const B = ocr(noMark);
  ok(n === 1 && /^초록 ✗ \| test-op\.js/.test(B.line) && B.rc === 1, '★③ [미끼] 표지를 뺀 사본 — 자가 "초록 ✗"(옛 판에서도 초록 · T1369 그 꼴)로 빨강', `바꾼 자리 ${n} · ${B.line.slice(0, 80)} · RC ${B.rc}`); }

fs.rmSync(R, { recursive: true, force: true });
console.log(`\n=== test-harness-bite 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
