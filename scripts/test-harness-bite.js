#!/usr/bin/env node
// @regress
// @harness-only
// @bait 7
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
//   ★[T1400] 미끼 사본 자(바꾼 자리 셈) — `lib-bait` 의 `count` · `swap` 과 같은 뜻을 여기 둔다(`lib-bait` 는 제품 자리를 읽는 `knob` 이 있어 `@harness-only` ⑳ 밖)
const LB = { count: (t, a) => (typeof a === 'string' ? t.split(a).length - 1 : (t.match(new RegExp(a.source, a.flags.includes('g') ? a.flags : a.flags + 'g')) || []).length),
  swap(t, a, b) { return { src: t.replace(a, b), n: LB.count(t, a) }; } };
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

console.log('\n④ 옛 판 뒤 새로 생긴 제품 파일 · 옛 판에 없던 제품 자리 (T1383 — 자 고침)');
//   종전 자는 `git checkout <옛> -- <제품 자리>` 만 했다 — 옛 판 뒤 새로 생긴 제품 파일이 사본에 남아, 새 모듈을 재는 하네스가 옛 판에서도 초록이었다
//   (`test-t1314-cols` ← `server/hot-cols.js`). 옛 판에 없던 제품 자리(9월의 `lab`)는 checkout 이 멈춰 줄이 비었다.
{
  const R2 = fs.mkdtempSync(path.join(os.tmpdir(), 'thbite2-'));
  const G2 = (...a) => execFileSync('git', ['-C', R2, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const W2 = (rel, t) => { fs.mkdirSync(path.dirname(path.join(R2, rel)), { recursive: true }); fs.writeFileSync(path.join(R2, rel), t); };
  const TOOL = fs.readFileSync(path.join(SCRIPTS, 'pm-old-code-red.sh'), 'utf8');
  G2('init', '-q', '-b', 'main'); W2('prod/keep.js', '1\n'); W2('scripts/pm-old-code-red.sh', TOOL); G2('add', '-A'); G2('commit', '-q', '-m', 'c1'); const o1 = G2('rev-parse', 'HEAD');
  W2('prod/new.js', "module.exports = 'new';\n"); W2('gone/x.js', '1\n');
  W2('scripts/test-nw.js', "#!/usr/bin/env node\n'use strict';\nconst v = require('../prod/new.js');\nconsole.log((v === 'new' ? '  ✓ ' : '  ✗ ') + '새 모듈이 답한다');\nprocess.exit(v === 'new' ? 0 : 1);\n");
  G2('add', '-A'); G2('commit', '-q', '-m', 'c2');
  const run2 = (toolText) => {
    W2('scripts/pm-old-code-red.sh', toolText);
    const OUT = path.join(R2, '.ocr-out.txt'); try { fs.unlinkSync(OUT); } catch (e) {}
    const r = spawnSync('bash', ['scripts/pm-old-code-red.sh', o1, 'test-nw.js'], { cwd: R2, encoding: 'utf8', env: Object.assign({}, process.env, { TIMEOUT_SEC: '60', OUT, PROD: 'prod gone' }) });
    let txt = ''; try { txt = fs.readFileSync(OUT, 'utf8'); } catch (e) {}
    return { rc: r.status, line: txt.split('\n').find((l) => /\| test-nw\.js \|/.test(l)) || ((r.stderr || '') + (r.stdout || '')).trim().slice(0, 120) };
  };
  const C = run2(TOOL);
  ok(/^빨강/.test(C.line) && C.rc === 0, '★★④ 옛 판 뒤 새로 생긴 제품 파일은 사본에서 지운다 — 새 모듈을 재는 하네스가 옛 판에서 빨강(옛 판에 없던 제품 자리 `gone` 이 있어도 자가 안 멈춘다)', C.line.slice(0, 100));
  const from = /^git -C "\$TMP\/w" -c core\.quotepath=off diff --name-only --diff-filter=A[^\n]*\n/m;
  const n = (TOOL.match(new RegExp(from.source, 'gm')) || []).length;
  const B = run2(TOOL.replace(from, ''));
  ok(n === 1 && /^초록 ✗ \| test-nw\.js/.test(B.line) && B.rc === 1, '★④ [미끼] 새 파일 지우는 줄을 뺀 자 사본 — 같은 하네스가 "초록 ✗"(T1314 그 꼴)', `바꾼 자리 ${n} · ${B.line.slice(0, 60)} · RC ${B.rc}`);
  fs.rmSync(R2, { recursive: true, force: true });
}

console.log('\n⑤ 자의 틈 — touched-harness 한글 길 · 기본값 뒤집은 손잡이 (T1400 · T1376 · 족보 881)');
//   종전 `namesFromDiff` 는 `diff --git a/… b/…` 꼴만 읽어, git 이 한글 길을 `"a/\355…"` 로 적으면 그 줄을 지나쳐 **앞 파일 이름에 새 이름을 붙였다**.
//   또 `T1327_ROUTE_FIX` 처럼 기본값만 뒤집은 한 줄은 그 손잡이 글자를 쓰는 하네스만 끌어와, 손잡이를 안 주고 그 파일을 싣는 하네스(`test-t1034`)를 놓쳤다.
{
  const TH = fs.readFileSync(path.join(SCRIPTS, 'touched-harness.js'), 'utf8');
  const TD = require('./lib-tmp').dir('thbite_th');   // 자 사본은 임시 자리에(내장 모듈만 부른다)
  const load = (txt, tag) => { const f = path.join(TD, `th-${tag}.js`); fs.writeFileSync(f, txt); delete require.cache[f]; return require(f); };
  const D = 'diff --git a/scripts/a.js b/scripts/a.js\n@@ -1 +1 @@\n+function alphaOne() {}\n'
    + 'diff --git "a/scripts/\\355\\225\\234.js" "b/scripts/\\355\\225\\234.js"\n@@ -1 +1 @@\n+function gammaTwo() {}\n'
    + "diff --git a/prod/knob.js b/prod/knob.js\n@@ -1 +1 @@\n-const K9 = process.env.K9_FLIP === '1';\n+const K9 = process.env.K9_FLIP !== '0';\n";
  const of = (M) => { const r = M.namesFromDiff(D); const a = r.files.find((x) => x.file === 'scripts/a.js'); const k = r.files.find((x) => x.file === 'prod/knob.js');
    return { aNames: a ? [...a.names].sort().join(',') : '-', ko: r.files.some((x) => /\\355|한/.test(x.file) && x.names.has('gammaTwo')), flips: k && k.flips ? k.flips.join(',') : '' }; };
  const A = of(load(TH, 'real'));
  ok(A.aNames === 'alphaOne' && A.ko, '★⑤ 한글 길(따옴표 꼴) — 그 파일 이름이 앞 파일로 새지 않고 제 파일에 선다', `a.js ${A.aNames} · 한글 파일 ${A.ko}`);
  ok(A.flips === 'K9_FLIP', '★⑤ 기본값을 뒤집은 손잡이(− `=== \'1\'` · + `!== \'0\'`)를 잡는다', A.flips || '없음');
  const oldHead = "    if (/^diff --git /.test(raw)) {\n      m = /^diff --git \"?a\\/(.+?)\"? \"?b\\/(.+?)\"?$/.exec(raw);\n      cur = null; if (!m) continue;\n      const f = m[2];";
  const BH = LB.swap(TH, oldHead, "    if ((m = /^diff --git a\\/(.+?) b\\/(.+)$/.exec(raw))) {\n      const f = m[2]; cur = null;");
  const Bh = of(load(BH.src, 'baith'));
  ok(BH.n === 1 && Bh.aNames !== 'alphaOne', '★⑤ 미끼 — 머리 줄을 종전 꼴로 되돌린 사본은 한글 파일의 이름이 앞 파일(a.js)로 샌다(위 ★ 가 문다)', `바꾼 자리 ${BH.n} · a.js ${Bh.aNames}`);
  const BF = LB.swap(TH, "if (ep && [...ep].join('|') !== [...em].join('|')) F.flips.push(k);", '');
  const Bf = of(load(BF.src, 'baitflip'));
  ok(BF.n === 1 && Bf.flips === '', '⑤ 미끼 — 뒤집기 셈 줄을 뺀 사본은 손잡이를 못 잡는다', `바꾼 자리 ${BF.n} · ${Bf.flips || '없음'}`);
}

console.log('\n⑥ 자의 틈 — 러너는 보조 모듈(`// @helper`)을 하네스로 안 돈다 (T1400 · T1376)');
{
  const R3 = require('./lib-tmp').dir('thbite3');
  const RUN = fs.readFileSync(path.join(SCRIPTS, 'run-regress.sh'), 'utf8');
  fs.mkdirSync(path.join(R3, 'scripts'));
  fs.writeFileSync(path.join(R3, 'scripts', 'e2e-aid.js'), "// @helper   ← 보조 모듈\nmodule.exports = 1;\n");
  fs.writeFileSync(path.join(R3, 'scripts', 'test-fine.js'), "console.log('  ✓ 된다'); console.log('=== 1 통과 / 0 실패 ===');\n");
  const run3 = (txt) => { fs.writeFileSync(path.join(R3, 'scripts', 'run-regress.sh'), txt);
    const r = spawnSync('bash', ['scripts/run-regress.sh', 'e2e-aid.js', 'test-fine.js'], { cwd: R3, encoding: 'utf8', env: Object.assign({}, process.env, { DRAIN_SEC: '0', TIMEOUT_SEC: '60' }), timeout: 120000 });
    return { rc: r.status, out: (r.stdout || '') + (r.stderr || '') }; };
  const A = run3(RUN);
  ok(A.rc === 0 && /\[건넘\] e2e-aid\.js/.test(A.out) && !/##### e2e-aid\.js/.test(A.out), '★⑥ `// @helper` 를 이름으로 받아도 건너고(돌리지 않음) · 나머지는 돈다(RC 0)', `RC ${A.rc}`);
  const skip = /    if head -40 "scripts\/\$_a" 2>\/dev\/null \| grep -q '\^\/\/ @helper[^\n]*\n/;
  const B = LB.swap(RUN, skip, '    LIST+=("$_a")\n');
  const Bt = run3(B.src);
  ok(B.n === 1 && Bt.rc !== 0 && /##### e2e-aid\.js/.test(Bt.out), '⑥ 미끼 — 건너뛰는 줄을 뺀 러너 사본은 보조 모듈을 하네스로 돌려 빨강(결과 줄 0 — T1376 그 꼴)', `바꾼 자리 ${B.n} · RC ${Bt.rc}`);
}

console.log('\n⑦ 자의 틈 — `ci-class --static` 은 이 가지가 바꾼 하네스 줄만 쓴다 (T1400 · T1376)');
{
  const R4 = require('./lib-tmp').dir('thbite4');
  const G4 = (...a) => execFileSync('git', ['-C', R4, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const W4 = (rel, t) => { fs.mkdirSync(path.dirname(path.join(R4, rel)), { recursive: true }); fs.writeFileSync(path.join(R4, rel), t); };
  const CC = fs.readFileSync(path.join(SCRIPTS, 'ci-class.js'), 'utf8');
  W4('scripts/code-only.js', fs.readFileSync(path.join(SCRIPTS, 'code-only.js'), 'utf8'));
  W4('scripts/ci-class.json', JSON.stringify({ rows: {} }) + '\n');
  W4('scripts/test-mine.js', "// @regress\nconsole.log(1);\n"); W4('scripts/test-other.js', "// @regress\nconsole.log(2);\n");
  G4('init', '-q', '-b', 'main'); G4('add', '-A'); G4('commit', '-q', '-m', 'base');
  G4('checkout', '-q', '-b', 'mine'); W4('scripts/test-mine.js', "// @regress\nconsole.log(11);\n"); G4('add', '-A'); G4('commit', '-q', '-m', 'mine');
  const run4 = (txt) => { W4('scripts/ci-class.js', txt); W4('scripts/ci-class.json', JSON.stringify({ rows: {} }) + '\n');
    spawnSync(process.execPath, ['scripts/ci-class.js', '--static', '--base', 'main'], { cwd: R4, encoding: 'utf8', timeout: 60000, env: Object.assign({}, process.env, { NODE_PATH: path.join(ROOT, 'node_modules') }) });   // 가짜 레포엔 node_modules 가 없다(acorn)
    let T = { rows: {} }; try { T = JSON.parse(fs.readFileSync(path.join(R4, 'scripts', 'ci-class.json'), 'utf8')); } catch (e) {}
    return Object.keys(T.rows).sort().join(','); };
  const A = run4(CC);
  ok(A === 'test-mine.js', '★⑦ `--static` — 이 가지가 바꾼 하네스(test-mine)만 표에 쓴다 · 남의 것(test-other)은 안 더한다', A || '없음');
  const B = LB.swap(CC, "const names = has('--all') ? all : changedTests(arg('--base', 'origin/main'));", 'const names = all;');
  const Bt = run4(B.src);
  ok(B.n === 1 && Bt === 'test-mine.js,test-other.js', '⑦ 미끼 — 바꾼 것만 고르는 줄을 종전(전부)으로 되돌린 사본은 남의 줄을 더한다', `바꾼 자리 ${B.n} · ${Bt}`);
}

console.log('\n⑧ 하네스 `/tmp` 치우기 — `lib-tmp` (T1400 · T1364 전수 한 판 3.2 ~ 3.4 GB)');
{
  const LTSRC = fs.readFileSync(path.join(SCRIPTS, 'lib-tmp.js'), 'utf8');
  const R5 = require('./lib-tmp').dir('thbite5');
  //   아이: 제 폴더(`dir`) · 맡긴 pid 이름 DB(`own`)를 짓고 SIGTERM 으로 끝난다(러너 상한 꼴) — 지워졌나 본다
  const kid = (libFile) => { const r = spawnSync(process.execPath, ['-e',
    `const LT=require(${JSON.stringify(libFile)}),fs=require('fs');const d=LT.dir('bitekid');fs.writeFileSync(d+'/a','x');const f='/tmp/bitekid-own-'+process.pid+'.db';fs.writeFileSync(f,'x');LT.own(f);console.log(JSON.stringify([d,f]));setTimeout(()=>process.kill(process.pid,'SIGTERM'),50);setTimeout(()=>{},5000);`],
    { encoding: 'utf8', timeout: 20000 });
    let P = []; try { P = JSON.parse((r.stdout || '').trim().split('\n')[0]); } catch (e) {}
    return { sig: r.signal, rc: r.status, left: P.filter((p) => fs.existsSync(p)), P }; };
  const A = kid(path.join(SCRIPTS, 'lib-tmp.js'));
  ok(A.P.length === 2 && A.left.length === 0, '★⑧ SIGTERM 으로 끝난 판도 제 폴더 · 맡긴 DB 를 지운다', `남음 ${A.left.length} · RC ${A.rc}`);
  const BL = LB.swap(LTSRC, "for (const sig of ['SIGTERM', 'SIGINT']) {", 'for (const sig of []) {');
  const bf = path.join(R5, 'lib-tmp-bait.js'); fs.writeFileSync(bf, BL.src);
  const B = kid(bf);
  ok(BL.n === 1 && B.left.length === 2, '⑧ 미끼 — 신호 손잡이를 안 거는 사본은 SIGTERM 판의 찌꺼기를 남긴다(위 ★ 가 문다)', `바꾼 자리 ${BL.n} · 남음 ${B.left.length}`);
  for (const p of B.P) { try { fs.rmSync(p, { recursive: true, force: true }); } catch (e) {} }
  //   러너 몫 — 이 판 뒤 선 `.db` 가운데 이름의 숫자 토막이 다 죽은 pid 인 것만(산 pid 이름 · 숫자 없는 이름은 남긴다)
  const t0 = Date.now() - 1000, dead = spawnSync('true').pid, live = process.pid;   // dead = 막 끝난 아이의 pid(pid 자리 안 · 죽음)
  const ft = `/tmp/bite-sweep-${dead}-${Date.now()}.db`;   // 시각 토막(pid 자리 밖)이 든 이름 — 안 건드린다
  const fd = `/tmp/bite-sweep-${dead}.db`, fl = `/tmp/bite-sweep-${live}.db`, fn = '/tmp/bite-sweep-seed.db';
  for (const f of [fd, fd + '-wal', fl, fn, ft]) fs.writeFileSync(f, 'x');
  const S = require('./lib-tmp').sweepDead(t0);
  ok(!fs.existsSync(fd) && !fs.existsSync(fd + '-wal') && fs.existsSync(fl) && fs.existsSync(fn) && fs.existsSync(ft), '★⑧ 러너 몫 `sweepDead` — 죽은 pid 이름 DB 만 지우고 산 pid · 숫자 없는 이름 · 시각(pid 자리 밖) 토막 이름은 남긴다', `지움 ${S.n}`);
  for (const f of [fd, fd + '-wal', fl, fn, ft]) { try { fs.unlinkSync(f); } catch (e) {} }
}

fs.rmSync(R, { recursive: true, force: true });
console.log(`\n=== test-harness-bite 결과: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
