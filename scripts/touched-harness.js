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
  let cur = null, ctx = [];
  //   ★[T1400 · 족보 881] 기본값을 뒤집은 손잡이 — 같은 파일의 − 줄과 + 줄에 같은 `process.env.X` 가 서로 다른 꼴로 서면(`=== '1'` → `!== '0'` …) 그 X.
  //     land1084 의 `T1327_ROUTE_FIX` 켬 기본 한 줄이 `test-t1034-caravan-keep`(손잡이를 안 주는 · villages 를 싣는 하네스)을 못 끌어와 PM 이 빨강을 놓쳤다.
  const envOf = (ln) => [...ln.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)([^;,)]*)/g)].map((m) => [m[1], m[2].replace(/\s+/g, '')]);   // ctx = 이 덩어리 머리의 둘레 함수 이름(몸통 속 줄이 바뀌었을 때만 쓴다)
  for (const raw of diff.split('\n')) {
    let m;
    //   ★[T1400 · T1376] 한글 길 — git 이 `core.quotepath` 켬이면 `diff --git "a/\352…" "b/\352…"` 로 적어 종전 꼴이 못 읽었다: 그 줄을 지나쳐
    //     앞 파일(`cur`)이 그대로 남아 한글 파일의 바뀐 줄 이름이 **앞 파일 이름으로 새고** · 한글 하네스는 빠졌다. 부르는 쪽이 quotepath 를 끄고(아래 git) ·
    //     여기서도 따옴표 꼴을 받고 · 못 읽은 `diff --git` 줄은 `cur` 를 끊는다(새는 일 0).
    if (/^diff --git /.test(raw)) {
      m = /^diff --git "?a\/(.+?)"? "?b\/(.+?)"?$/.exec(raw);
      cur = null; if (!m) continue;
      const f = m[2];
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
      for (const [k, e] of envOf(ln)) { const M = raw[0] === '+' ? (cur.envP = cur.envP || new Map()) : (cur.envM = cur.envM || new Map()); if (!M.has(k)) M.set(k, new Set()); M.get(k).add(e); }
      for (const n of declNames(ln)) cur.names.add(n);
      if (/^\s+\S/.test(ln) && ctx.length) { for (const n of ctx) cur.names.add(n); ctx = []; }   // 몸통 속(들여쓴) 줄이 바뀌었을 때만 — 맨 앞 줄만 바뀌면 git 이 고른 "위 함수" 는 둘레가 아니다
    }
  }
  for (const F of files) {
    F.flips = [];
    if (F.envM && F.envP) for (const [k, em] of F.envM) { const ep = F.envP.get(k); if (ep && [...ep].join('|') !== [...em].join('|')) F.flips.push(k); }
    delete F.envM; delete F.envP;
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
  const git = (...a) => execFileSync('git', ['-c', 'core.quotepath=off', ...a], { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28 });   // ★[T1400] 한글 길 그대로(위 namesFromDiff)
  const mb = git('merge-base', base, 'HEAD').trim();
  const diff = git('diff', '-U0', '--no-color', '--no-ext-diff', mb);
  const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean);
  const D = namesFromDiff(diff);
  for (const f of untracked) {   // 아직 안 더한 새 파일 — 하네스는 목록에 · 코드는 파일 전체의 선언을 이름으로
    if (isHarness(f)) D.harness.push(path.basename(f));
    else if (isCode(f)) D.files.push({ file: f, names: new Set([path.basename(f).replace(/\.(c|m)?js$/, '')]) });   // 새 코드 파일 — 파일 이름(그 파일을 싣는 하네스만 그 안 이름을 부를 수 있다)
  }
  const SD = path.join(root, 'scripts');
  //   ★[T1400] 머리 `// @helper`(보조 모듈 — `e2e-browser.js`)는 하네스가 아니다 — 무는 쪽 · 바뀐 하네스 둘 다에서 뺀다.
  const helper = (h) => { try { return /^\/\/ @helper(\s|$)/m.test(fs.readFileSync(path.join(SD, h), 'utf8').split('\n').slice(0, 40).join('\n')); } catch (e) { return false; } };
  const hfiles = fs.readdirSync(SD).filter((f) => /^(test|e2e)-.*\.js$/.test(f) && !helper(f)).sort();
  D.harness = D.harness.filter((h) => !helper(h));
  const cache = new Map(), readH = (h) => { if (!cache.has(h)) cache.set(h, fs.readFileSync(path.join(SD, h), 'utf8')); return cache.get(h); };
  const all = new Set(); for (const F of D.files) for (const n of F.names) if (keep(n)) all.add(n);
  const hit = match([...all].sort(), hfiles, readH);
  const COMMON = Math.ceil(hfiles.length / 2), common = [], used = [];
  const pick = new Set();
  for (const [n, hs] of hit) { if (hs.length > COMMON) { common.push([n, hs.length]); continue; } if (hs.length) used.push([n, hs.length]); for (const h of hs) pick.add(h); }
  for (const h of D.harness) if (fs.existsSync(path.join(SD, h))) pick.add(h);
  //   ★[T1400] 뒤집힌 손잡이 → 그 파일(모듈)을 글자로 부르는 하네스(`'villages.js'` · `server/villages` …) 가운데 **그 손잡이 글자가 없는** 것(= 손잡이를 안 주니 새 기본으로 돈다).
  //     흔한 이름 문턱(절반)은 안 건다 — 기본값 뒤집기는 그 파일을 도는 판 모두의 일이다.
  const flips = [];
  for (const F of D.files) for (const k of (F.flips || [])) {
    const b = path.basename(F.file).replace(/\.(c|m)?js$/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`['"\`/]${b}(?:\\.js)?['"\`]`);
    const hs = hfiles.filter((h) => { const t = readH(h); return re.test(t) && !t.includes(k); });
    flips.push([k, F.file, hs.length]); for (const h of hs) pick.add(h);
  }
  for (const h of RULE5) if (fs.existsSync(path.join(SD, h))) pick.add(h);
  const list = [...pick].sort();
  const reg = (h) => /^\/\/ @regress([\s]|$)/m.test(readH(h).split('\n').slice(0, 40).join('\n'));
  return { base, mergeBase: mb.slice(0, 9), flips, files: D.files.map((F) => ({ file: F.file, names: [...F.names].filter(keep).sort(), flips: F.flips || [] })), names: [...all].sort(), hit, used, common, changedHarness: [...new Set(D.harness)].sort(), rule5: RULE5, list, notRegress: list.filter((h) => !reg(h)) };
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
  if (P.flips && P.flips.length) L.push('· ★기본값을 뒤집은 손잡이 → 그 파일을 싣고 손잡이를 안 주는 하네스: ' + P.flips.map(([k, f, n]) => `${k}(${path.basename(f)}) ${n}`).join(' · '));
  if (P.changedHarness.length) L.push('· 바뀐 하네스: ' + P.changedHarness.join(' '));
  L.push('· 돌릴 하네스: ' + P.list.join(' '));
  console.log(L.join('\n'));
  if (argv.includes('--run')) {
    const j = opt('-j');
    const r = spawnSync('bash', [path.join(root, 'scripts', 'run-regress.sh'), ...(j ? ['-j', j] : []), ...P.list], { cwd: root, stdio: 'inherit' });
    process.exit(r.status == null ? 1 : r.status);
  }
}
