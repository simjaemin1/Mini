#!/usr/bin/env node
// ※ `// @regress` 표식은 **일부러 없다** — 전수 러너 창이 모자라는 판이라(공통 §2 ⑥ · T185·T234)
//    야간 목록을 늘리지 않는다. 자산을 만지는 카드가 손으로 부른다: `node scripts/test-assets-audit.js`
// === 배포 자산 전수 감사 하네스 [T243 2026-09-13] ==================================
//
// 계약:
//   ① **없는 참조 0** — 닿는 표(클라·서버·스크립트가 실제로 읽는 표)가 가리키는 키마다 파일이 있다.
//      404 는 배포된 뒤에야 보인다. 여기서 소스 층에서 먼저 잡는다.
//   ② **잠금 불일치 0** — `icons.lock.json`·`char/char_sheets.lock.json` 의 값과 파일의 해시가 같다.
//      ★★**자가 표마다 다르다. 베끼지 말고 그 표의 정본에서 읽어라** — 이 하네스의 1차 판이 여기서 없는 결함을 봤다:
//      `icons.lock` 의 자(IDAT sha1)를 char 시트에 들이대고 **192장 전부 불일치**를 봤는데, 틀린 건 시트가 아니라 자였다.
//        · `icons.lock.json`        = PNG 는 **IDAT sha1 앞 16자**(블렌더가 `Date`·`RenderTime` tEXt 를 써서
//                                     파일 전체는 못 쓴다 — 표 자신의 `_규약` 이 그렇게 적어 뒀다) · webp 는 파일 전체 sha1[:16]
//        · `char_sheets.lock.json`  = **파일 전체 sha256 앞 16자**(`test-charsheet.js` ⑤ 가 굽는 자 · 키는
//                                     `char_meta.json` 의 `sheets` 에서 `probeall*` 를 뺀 것)
//   ③ **고아 표는 빨강이 아니다** — 사용처 0 인 파일은 세어서 **표로만** 낸다. 지우는 것은 사람이다.
//      (지우기를 하네스에 맡기면 "아직 안 배선한 새 자산"이 빨개진다 — 그건 결함이 아니라 순서다.)
//   ④ **닿음은 전이적이다** — 표 안의 이름이 참조가 되려면 **그 표 자신이 닿아야** 한다.
//      제 폴더 안에서 저희끼리만 가리키는 파일 무더기는 참조가 아니다(T243 §0-ⓑ 가 그걸로 45.7MB 를 찾았다).
//
//   ⑤ **잠금이 무엇을 잡는 자인지** — `icons.lock.json` 의 `_` 는 "다음 재굽기가 이 표와 대조한다"고 적는데,
//      T243 §0-ⓑ 가 재 보니 **재굽기로는 절대 못 맞춘다**: 표본 넷(bush01·acorn·lettuce_2·lettuce_3)이
//      IDAT 재현 **0/4** 였다. 그런데 같은 코드로 연달아 두 번 구우면 IDAT 가 **같다**(대조군) —
//      즉 굽기는 결정적이고, 어긋나는 건 **배포판을 구운 판이 지금 판이 아니기 때문**이다(드리프트).
//      그림은 넷 다 같다(|Δ|>24 가 0.01~0.49% · T205 잡음 바닥 5.3% 의 1/10 아래).
//      ⇒ 이 잠금은 "다시 구우면 같은가" 가 아니라 **"파일이 몰래 바뀌었는가"** 를 잡는 자다.
//        그 뜻으로 읽으면 ②는 지금 초록이고, 실제로 초록이다.
//
// 자명 통과 금지(--selftest): 없는 참조 하나와 잠금 어긋남 하나를 **주입**해서 ①②가 무는지 본다.
//
// 실행: node scripts/test-assets-audit.js [--json <경로>] [--selftest]
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const AST = path.join(ROOT, 'public', 'assets');
const SELFTEST = process.argv.includes('--selftest');
const JSONI = process.argv.indexOf('--json');
let fail = 0;
const ok = (c, m, note) => { console.log((c ? '  ✓ ' : '  ✗ ') + m + (note ? '  ' + note : '')); if (!c) fail++; };

// ── 해시 ────────────────────────────────────────────────────────────────
const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
function idatSha1(buf) {                       // PNG 의 화소 페이로드만
  if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) return null;
  const h = crypto.createHash('sha1');
  let i = 8, any = false;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i), typ = buf.toString('ascii', i + 4, i + 8);
    if (typ === 'IDAT') { h.update(buf.slice(i + 8, i + 8 + len)); any = true; }
    i += 12 + len;
    if (typ === 'IEND') break;
  }
  return any ? h.digest('hex') : null;
}
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
// 잠금표가 쓰는 자 — **표마다 다르다**(위 계약 ②). 자를 표에서 받아 온다.
const RULER = {
  icons: (p) => { const b = fs.readFileSync(p);          // PNG=IDAT sha1 · webp=파일 sha1
    return (path.extname(p).toLowerCase() === '.png' ? idatSha1(b) : sha1(b)); },
  char:  (p) => sha256(fs.readFileSync(p)),              // 파일 전체 sha256
};

// ── 자산 전수 ────────────────────────────────────────────────────────────
function walk(d, out) {
  for (const n of fs.readdirSync(d).sort()) {
    const p = path.join(d, n);
    if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
const ASSETS = walk(AST, []).map((p) => ({
  abs: p,
  rel: path.relative(ROOT, p).split(path.sep).join('/'),
  url: '/' + path.relative(path.join(ROOT, 'public'), p).split(path.sep).join('/'),
  dir: path.relative(AST, path.dirname(p)).split(path.sep).join('/') || '.',
  name: path.basename(p),
  stem: path.basename(p, path.extname(p)),
  ext: path.extname(p).slice(1).toLowerCase(),
  bytes: fs.statSync(p).size,
}));
for (const a of ASSETS) a.sha1 = sha1(fs.readFileSync(a.abs));

// ── 참조 원천(뿌리) ──────────────────────────────────────────────────────
function srcFiles(sub, exts) {
  const d = path.join(ROOT, sub);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).sort().map((n) => path.join(d, n))
    .filter((p) => fs.statSync(p).isFile() && exts.includes(path.extname(p).slice(1).toLowerCase()));
}
const ROOT_SRC = [
  ...srcFiles('public/client', ['js']),
  ...srcFiles('public', ['js', 'html', 'css']),
  ...srcFiles('server', ['js', 'json']),
  ...srcFiles('sim', ['js']),
  ...srcFiles('scripts', ['py', 'js', 'sh']),
];
const TOKENS = /[A-Za-z0-9_ㄱ-힝][A-Za-z0-9_.\-ㄱ-힝]*/g;
function readSrc(p) {
  const t = fs.readFileSync(p, 'utf8');
  return { rel: path.relative(ROOT, p).split(path.sep).join('/'), text: t, toks: new Set(t.match(TOKENS) || []) };
}
const SRC = ROOT_SRC.map(readSrc);
const names = (a) => [a.stem, a.name, a.url];
const mentions = (s, a) => (s.toks.has(a.stem) || s.toks.has(a.name) || s.text.includes(a.url));

// ── 닿음 — 전이 폐포(계약 ④) ────────────────────────────────────────────
//   표(자산 안의 JSON)는 **제가 닿아야** 참조 원천이 된다.
const JSONS = ASSETS.filter((a) => a.ext === 'json');
const reached = new Map();                       // rel → [닿게 한 원천들]
for (const a of ASSETS) {
  const hit = SRC.filter((s) => mentions(s, a)).map((s) => s.rel);
  if (hit.length) reached.set(a.rel, hit);
}
let grew = true;
const tableSrc = [];
while (grew) {                                   // 닿은 표를 원천에 더하고 다시 돈다
  grew = false;
  for (const j of JSONS) {
    if (!reached.has(j.rel) || tableSrc.some((s) => s.rel === j.rel)) continue;
    tableSrc.push(readSrc(j.abs)); grew = true;
    for (const a of ASSETS) {
      if (a.rel === j.rel) continue;
      const s = tableSrc[tableSrc.length - 1];
      if (mentions(s, a)) {
        const cur = reached.get(a.rel) || [];
        if (!cur.includes(j.rel)) { cur.push(j.rel); reached.set(a.rel, cur); grew = true; }
      }
    }
  }
}
for (const a of ASSETS) { a.refs = reached.get(a.rel) || []; a.orphan = a.refs.length === 0; }

// ── ① 없는 참조 — 닿는 잠금·앵커 표가 가리키는데 파일이 없는 것 ──────────
const have = new Set(ASSETS.map((a) => a.rel));
function resolve(dir, key) {                     // 확장자는 디렉터리가 정한다(.png · .webp)
  for (const e of ['png', 'webp']) {
    const r = `public/assets/${dir}/${key}.${e}`;
    if (have.has(r)) return r;
  }
  return null;
}
const missing = [];
const LOCK = path.join(AST, 'icons.lock.json');
const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
let LOCK_EXTRA = SELFTEST ? { icons: { __selftest_ghost__: '0'.repeat(16) } } : {};
for (const [grp, tbl] of Object.entries({ ...lock, ...LOCK_EXTRA })) {
  if (grp.startsWith('_') || typeof tbl !== 'object') continue;
  const merged = { ...(lock[grp] || {}), ...((LOCK_EXTRA[grp]) || {}) };
  for (const key of Object.keys(merged)) {
    if (!resolve(grp, key)) missing.push({ from: 'icons.lock.json:' + grp, key });
  }
}
const CHLOCK = JSON.parse(fs.readFileSync(path.join(AST, 'char', 'char_sheets.lock.json'), 'utf8'));
for (const key of Object.keys(CHLOCK)) {
  if (key.startsWith('_')) continue;
  if (!resolve('char', key)) missing.push({ from: 'char_sheets.lock.json', key });
}
for (const [f, dir] of [['crops/crops_anchors.json', 'crops'], ['nature/nature_anchors.json', 'nature'],
                        ['props/props_anchors.json', 'props'], ['mountains/mountain_anchors.json', 'mountains'],
                        ['buildings/building_anchors.json', 'buildings']]) {
  const t = JSON.parse(fs.readFileSync(path.join(AST, f), 'utf8'));
  for (const key of Object.keys(t)) {
    if (key.startsWith('_')) continue;
    // 자연물 앵커는 나무·풀을 한 표에 담는다 — 두 디렉터리를 다 본다
    if (!resolve(dir, key) && !(dir === 'nature' && resolve('trees', key))) {
      missing.push({ from: f, key });
    }
  }
}
ok(missing.length === 0, `① 없는 참조 0 — 닿는 표가 가리키는 키마다 파일이 있다`,
   missing.length ? JSON.stringify(missing.slice(0, 8)) : `표 7개 · 키 ${
     Object.entries(lock).filter(([k, v]) => !k.startsWith('_') && typeof v === 'object')
       .reduce((n, [, v]) => n + Object.keys(v).length, 0) + Object.keys(CHLOCK).length} 전수 확인`);

// ── ② 잠금 불일치 0 ─────────────────────────────────────────────────────
const bad = [];
let locked = 0;
for (const [grp, tbl] of Object.entries(lock)) {
  if (grp.startsWith('_') || typeof tbl !== 'object') continue;
  for (const [key, want] of Object.entries(tbl)) {
    const r = resolve(grp, key); if (!r) continue;
    locked++;
    let got = RULER.icons(path.join(ROOT, r));
    if (SELFTEST && locked === 1) got = 'f'.repeat(40);          // ★주입 — ②가 물어야 한다
    if (!got || got.slice(0, want.length) !== want) bad.push({ grp, key, want, got: got && got.slice(0, 16) });
  }
}
for (const [key, want] of Object.entries(CHLOCK)) {
  if (key.startsWith('_')) continue;
  const r = resolve('char', key); if (!r) continue;
  locked++;
  const got = RULER.char(path.join(ROOT, r));
  if (!got || got.slice(0, want.length) !== want) bad.push({ grp: 'char', key, want, got: got && got.slice(0, 16) });
}
ok(bad.length === 0, `② 잠금 불일치 0 — 잠긴 ${locked}장의 해시가 표와 같다`,
   bad.length ? JSON.stringify(bad.slice(0, 6)) : 'icons=IDAT sha1[:16]/webp 파일 sha1[:16] · char=파일 sha256[:16]');

// ②b 잠기지 않은 장이 있으면 **이름을 대야 한다** — "몇 장이 안 잠겼다"는 답이 아니다.
{
  const CHM = JSON.parse(fs.readFileSync(path.join(AST, 'char', 'char_meta.json'), 'utf8'));
  const sheetKeys = new Set(Object.keys(CHM.sheets || {}).filter((k) => !k.startsWith('probeall')));
  const unlockedChar = ASSETS.filter((a) => a.dir === 'char' && a.ext === 'png' && !(a.stem in CHLOCK))
                             .map((a) => a.stem);
  ok(unlockedChar.every((k) => !sheetKeys.has(k)),
     `②b 안 잠긴 char 시트 ${unlockedChar.length}장은 전부 \`probeall*\`(잠금 대상 밖) — 설명 없는 자산 0`,
     unlockedChar.join(',') || '없다');
}

// ── ③ 고아 — 표만(빨강 아님) ────────────────────────────────────────────
const orph = ASSETS.filter((a) => a.orphan);
const sum = (xs) => xs.reduce((n, a) => n + a.bytes, 0);
console.log(`  · ③ 고아(사용처 0) **${orph.length}**장 · ${(sum(orph) / 1e6).toFixed(1)} MB — 빨강 아님(표만 · 지우기는 사람)`);
const byDir = {};
for (const a of orph) { (byDir[a.dir] = byDir[a.dir] || []).push(a); }
for (const [d, xs] of Object.entries(byDir).sort((A, B) => sum(B[1]) - sum(A[1]))) {
  console.log(`      ${d.padEnd(20)} ${String(xs.length).padStart(3)}장 ${(sum(xs) / 1e6).toFixed(2)} MB`);
}
console.log(`  · 자산 전수 ${ASSETS.length}장 · ${(sum(ASSETS) / 1e6).toFixed(1)} MB · 잠긴 것 ${locked}`);

if (JSONI >= 0 && process.argv[JSONI + 1]) {
  fs.writeFileSync(process.argv[JSONI + 1], JSON.stringify(ASSETS.map((a) => ({
    rel: a.rel, dir: a.dir, ext: a.ext, bytes: a.bytes, sha1: a.sha1, refs: a.refs, orphan: a.orphan,
  })), null, 0));
  console.log(`  · 전수표 → ${process.argv[JSONI + 1]}`);
}

if (SELFTEST) {
  console.log('\n[--selftest] 없는 참조 하나(`icons/__selftest_ghost__`)와 잠금 어긋남 하나를 주입했다. ①②가 둘 다 빨개야 한다.');
  console.log('결과: ' + (fail >= 2 ? `PASS(검사기가 둘 다 물었다 · ${fail}건)` : `FAIL(자명 통과 — ${fail}건만 물었다)`));
  process.exit(fail >= 2 ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
