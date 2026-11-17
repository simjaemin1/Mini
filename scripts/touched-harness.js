#!/usr/bin/env node
'use strict';
// (@regress 없음 — 러너 밖 · T1356 ④ · 제품 무변)
// === scripts/touched-harness.js — 만진 함수 · 상수 → 그 이름을 글자로 무는 하네스 목록 [T1356 · ★재민 11-17 테스트 강화 규약 ④] ==========
//   왜: "71/0" 은 제 하네스만 돌린 수였다(T1295 — 남의 하네스 둘이 빨강). PM 이 착지 때 손으로 하던 `grep -lE` 를 기계로 —
//   세션은 이 출력과 돌린 결과를 보고에 붙인다("○/0" 은 무엇을 돌린 수인지와 함께만).
//   ① 바뀐 줄 = `git diff -U0 <갈림점>`(갈림점 = `git merge-base <base> HEAD` · 작업 트리까지 — 커밋 전에도 돈다).
//      하네스 자신(`scripts/test-*.js` · `e2e-*.js`)은 이름을 안 뽑고 "바뀐 하네스" 로 목록에 넣는다.
//   ② 이름 = 바뀐 덩어리 머리의 둘레 함수(git 이 `@@ … @@` 뒤에 적는 줄) + 바뀐 줄(+ · −)의 선언(함수 · const/let/var · 객체 메서드 · exports) + env 손잡이(`process.env.X`).
//      넉 자 미만 · 흔한 낱말 · 내장 메서드(`STOP`)는 뺀다 · 하네스 절반 넘게가 무는 이름은 "흔한 이름" 으로 따로 적고 목록에 안 넣는다(넣으면 전수다).
//      새 코드 파일(갈림점 뒤 더한 것 · 아직 안 더한 것)은 파일 이름(그 파일을 싣는 하네스)으로 센다 — 안의 지역 이름은 남의 하네스와 무관하다. 둘레 함수는 덩어리 안에 들여쓴(몸통 속) 바뀐 줄이 있을 때만 쓴다(맨 앞 줄만 바뀌면 git 이 고른 줄은 바로 위 함수일 뿐이다).
//      하네스 공용 자(`scripts/lib-*.js`)가 바뀌면 그 파일 이름도 이름으로 넣는다(그 자를 싣는 하네스 — 바뀐 함수 이름이 내장 이름과 같아 빠지는 것을 막는다).
//   ③ 하네스 = 그 이름을 낱말 경계로 무는 `scripts/test-*.js` · `e2e-*.js`(주석 포함 글자 — PM 의 `grep -l` 과 같은 자) ∪ 바뀐 하네스 ∪ 규약 다섯.
// 쓰는 법:
//   node scripts/touched-harness.js [<base> = origin/main]            # 표 + 목록
//   node scripts/touched-harness.js origin/main --list                # 하네스 이름만 한 줄에 하나(러너에 넘길 꼴)
//   node scripts/touched-harness.js origin/main --json
//   node scripts/touched-harness.js origin/main --run [-j 4]         # 목록을 러너로 돈다(`run-regress.sh` · @regress 아닌 것도 이름으로 준다)
//   --root <dir>  다른 작업 트리(하네스 · 시험용)
const fs = require('fs'), path = require('path'), { execFileSync, spawnSync } = require('child_process');

const RULE5 = ['test-body-fields.js', 'test-coll-grid.js', 'test-hp-src.js', 'test-lon-day.js', 'test-harness-lint.js'];   // 규약 다섯(공통.md) — 늘 돈다
const STOP = new Set(('this self that true false null undefined require module exports return const function value values item items data list '
  + 'opts args name names type then push keys length index count result error start state string number object array main test path text '
  + 'line lines file files root next prev left right done size more find each from into with when else case break default async await '
  + 'node info warn emit call apply bind ready close open send read write load save init make step tick time date event events '
  // 내장 메서드 · 전역(하네스가 제 일로 늘 부른다 — 바뀐 함수가 이 이름이면 이름만으로는 못 가른다)
  + 'shift unshift slice splice filter reduce join split replace match sort concat includes indexOf forEach some every fill assign freeze '
  + 'parse stringify floor round ceil trim padStart padEnd startsWith endsWith toString valueOf entries has delete clear from then catch finally '
  + 'resolve reject Math JSON Date Object Array String Number Promise Error console process Buffer setTimeout setInterval clearTimeout').split(' '));
const IDENT = '[A-Za-z_$][\\w$]*';
const DECL = [
  new RegExp(`\\bfunction\\s*\\*?\\s*(${IDENT})`, 'g'),
  new RegExp(`^(?:const|let|var)\\s+(${IDENT})\\s*=`, 'g'),                    // 맨 앞(들여쓰기 0) 선언만 — 함수 속 지역 변수는 이름이 흔하다
  new RegExp(`\\b(?:const|let|var)\\s+([A-Z][A-Z0-9_]{3,})\\s*=`, 'g'),           // 대문자 상수는 어디서든
  new RegExp(`^\\s*(${IDENT})\\s*[:=]\\s*(?:async\\s+)?(?:function\\b|\\([^)]*\\)\\s*=>|${IDENT}\\s*=>)`, 'g'),
  new RegExp(`^\\s*(?:async\\s+)?(?!if\\b|for\\b|while\\b|switch\\b|catch\\b|function\\b|return\\b)(${IDENT})\\s*\\([^)]*\\)\\s*\\{`, 'g'),
  new RegExp(`\\b(?:module\\.)?exports\\.(${IDENT})\\s*=`, 'g'),
  /process\.env\.([A-Z][A-Z0-9_]+)/g,
];
const isHarness = (f) => /^scripts\/(test|e2e)-[^/]*\.js$/.test(f);
const isCode = (f) => /\.(c|m)?js$/.test(f) && !/(^|\/)node_modules\//.test(f);

// 한 줄에서 선언 이름 뽑기
function declNames(line) {
  const out = [];
  for (const re of DECL) { re.lastIndex = 0; let m; while ((m = re.exec(line))) out.push(m[1]); }
  return out;
}
// `git diff -U0` 글자 → { files: [{ file, names: Set }], harness: [바뀐 하네스] }
function namesFromDiff(diff) {
  const files = [], harness = [];
  let cur = null, ctx = [];   // ctx = 이 덩어리 머리의 둘레 함수 이름(몸통 속 줄이 바뀌었을 때만 쓴다)
  for (const raw of diff.split('\n')) {
    let m;
    if ((m = /^diff --git a\/(.+?) b\/(.+)$/.exec(raw))) {
      const f = m[2]; cur = null;
      if (isHarness(f)) harness.push(path.basename(f));
      else if (isCode(f)) { cur = { file: f, names: new Set() }; files.push(cur); if (/^scripts\/lib-[^/]*\.js$/.test(f)) cur.names.add(path.basename(f, '.js')); }   // 하네스 공용 자가 바뀌면 그 자를 싣는 하네스도
      continue;
    }
    if (!cur) continue;
    if (/^new file mode /.test(raw)) { cur.names = new Set([path.basename(cur.file).replace(/\.(c|m)?js$/, '')]); cur.added = true; continue; }   // 새 파일 — 파일 이름만(그 파일을 싣는 하네스)
    if (cur.added) continue;
    if ((m = /^@@ [^@]* @@ ?(.*)$/.exec(raw))) { ctx = declNames(m[1]); continue; }   // ★둘레 함수(덩어리 머리 — git 이 고른 줄)
    if (/^(\+\+\+|---) /.test(raw)) continue;
    if (raw[0] === '+' || raw[0] === '-') {
      const ln = raw.slice(1);
      for (const n of declNames(ln)) cur.names.add(n);
      if (/^\s+\S/.test(ln) && ctx.length) { for (const n of ctx) cur.names.add(n); ctx = []; }   // 몸통 속(들여쓴) 줄이 바뀌었을 때만 — 맨 앞 줄만 바뀌면 git 이 고른 "위 함수" 는 둘레가 아니다
    }
  }
  return { files, harness };
}
const keep = (n) => n.length >= 4 && !STOP.has(n) && !STOP.has(n.toLowerCase());
// 이름 → 그 이름을 무는 하네스(낱말 경계 · 원문 글자)
function match(names, hfiles, readH) {
  const hit = new Map();
  for (const n of names) {
    const re = new RegExp(`(^|[^\\w$-])${n.replace(/[$.*+?^()[\]{}|\\]/g, '\\$&')}(?![\\w$-])`);
    hit.set(n, hfiles.filter((h) => re.test(readH(h))));
  }
  return hit;
}
function plan(root, base) {
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });
  const mb = git('merge-base', base, 'HEAD').trim();
  const diff = git('diff', '-U0', '--no-color', '--no-ext-diff', mb);
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  const D = namesFromDiff(diff);
  for (const f of untracked) {   // 아직 안 더한 새 파일 — 하네스는 목록에 · 코드는 파일 전체의 선언을 이름으로
    if (isHarness(f)) D.harness.push(path.basename(f));
    else if (isCode(f)) D.files.push({ file: f, names: new Set([path.basename(f).replace(/\.(c|m)?js$/, '')]) });   // 새 코드 파일 — 파일 이름(그 파일을 싣는 하네스만 그 안 이름을 부를 수 있다)
  }
  const SD = path.join(root, 'scripts');
  const hfiles = fs.readdirSync(SD).filter((f) => /^(test|e2e)-.*\.js$/.test(f)).sort();
  const cache = new Map(), readH = (h) => { if (!cache.has(h)) cache.set(h, fs.readFileSync(path.join(SD, h), 'utf8')); return cache.get(h); };
  const all = new Set(); for (const F of D.files) for (const n of F.names) if (keep(n)) all.add(n);
  const hit = match([...all].sort(), hfiles, readH);
  const COMMON = Math.ceil(hfiles.length / 2), common = [], used = [];
  const pick = new Set();
  for (const [n, hs] of hit) { if (hs.length > COMMON) { common.push([n, hs.length]); continue; } if (hs.length) used.push([n, hs.length]); for (const h of hs) pick.add(h); }
  for (const h of D.harness) if (fs.existsSync(path.join(SD, h))) pick.add(h);
  for (const h of RULE5) if (fs.existsSync(path.join(SD, h))) pick.add(h);
  const list = [...pick].sort();
  const reg = (h) => /^\/\/ @regress([\s]|$)/m.test(readH(h).split('\n').slice(0, 40).join('\n'));
  return { base, mergeBase: mb.slice(0, 9), files: D.files.map((F) => ({ file: F.file, names: [...F.names].filter(keep).sort() })), names: [...all].sort(), hit, used, common, changedHarness: [...new Set(D.harness)].sort(), rule5: RULE5, list, notRegress: list.filter((h) => !reg(h)) };
}
module.exports = { namesFromDiff, declNames, match, plan, keep, STOP, RULE5 };

if (require.main === module) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const root = path.resolve(opt('--root') || path.join(__dirname, '..'));
  const base = argv.find((a, i) => !a.startsWith('-') && !['--root', '-j'].includes(argv[i - 1])) || 'origin/main';
  const P = plan(root, base);
  if (argv.includes('--list')) { process.stdout.write(P.list.join('\n') + '\n'); return; }   // exit 를 안 부른다(파이프로 큰 출력이 잘린다)
  if (argv.includes('--json')) { process.stdout.write(JSON.stringify({ ...P, hit: Object.fromEntries(P.hit) }) + '\n'); return; }
  const L = [];
  L.push(`# 만진 함수 → 하네스 (touched-harness · base ${P.base} · 갈림점 ${P.mergeBase})`);
  L.push(`· 바뀐 코드 파일 ${P.files.length} · 이름 ${P.names.length}(물린 것 ${P.used.length} · 흔한 이름 뺌 ${P.common.length}) · 바뀐 하네스 ${P.changedHarness.length} · 규약 다섯 · **돌릴 하네스 ${P.list.length}**${P.notRegress.length ? `(@regress 아님 ${P.notRegress.length}: ${P.notRegress.join(' ')})` : ''}`);
  for (const F of P.files) L.push(`  ${F.file}: ${F.names.join(' ') || '(이름 없음)'}`);
  if (P.used.length) L.push('· 이름 → 하네스 수: ' + P.used.map(([n, k]) => `${n} ${k}`).join(' · '));
  if (P.common.length) L.push('· 흔한 이름(하네스 절반 넘게 — 목록에 안 넣음): ' + P.common.map(([n, k]) => `${n} ${k}`).join(' · '));
  if (P.changedHarness.length) L.push('· 바뀐 하네스: ' + P.changedHarness.join(' '));
  L.push('· 돌릴 하네스: ' + P.list.join(' '));
  console.log(L.join('\n'));
  if (argv.includes('--run')) {
    const j = opt('-j');
    const r = spawnSync('bash', [path.join(root, 'scripts', 'run-regress.sh'), ...(j ? ['-j', j] : []), ...P.list], { cwd: root, stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
}
