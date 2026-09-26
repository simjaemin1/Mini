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
//        · `icons.lock.json`        = **화소 해시**[:16] — sha1("<w>x<h>|" + 디코드한 RGBA). 자는
//                                     `scripts/asset-lock.js` **하나**이고 여기선 부르기만 한다 [T257].
//                                     (⚠webp 산 88장만 아직 파일 sha1[:16] — 디코더가 없다 · 회부)
//        · `char_sheets.lock.json`  = ★[T320] **같은 정규화 화소 해시**(자가 하나가 됐다 · 키는
//                                     `char_meta.json` 의 `sheets` 에서 `probeall*` 를 뺀 것 · 굽는 자리는 `test-charsheet.js` ⑤)
//   ③ **고아 표는 빨강이 아니다** — 사용처 0 인 파일은 세어서 **표로만** 낸다. 지우는 것은 사람이다.
//      (지우기를 하네스에 맡기면 "아직 안 배선한 새 자산"이 빨개진다 — 그건 결함이 아니라 순서다.)
//   ④ **닿음은 전이적이다** — 표 안의 이름이 참조가 되려면 **그 표 자신이 닿아야** 한다.
//      제 폴더 안에서 저희끼리만 가리키는 파일 무더기는 참조가 아니다(T243 §0-ⓑ 가 그걸로 45.7MB 를 찾았다).
//
//   ⑥ **삼자 대조 [T291]** — 소리 자산은 표 **셋**이 따로 적는다(매니페스트 · 잠금표 · `CREDITS.md` §2-b).
//      셋이 **같은 파일 집합**을 말하고 출처 값이 같아야 한다. 그 자리가 비어 있었다 — 실측: `sfx/` 에
//      `.ogg` 한 장을 더 놓으면 `test-assets-audit` 도 `test-audio` 도 **둘 다 초록**이었다(고아 표에 숫자가
//      하나 늘 뿐이고 그 표는 빨강이 아니다). 즉 **잠기지도 크레딧에 적히지도 않은 소리가 배포된다.**
//      겹치는 검사는 안 만든다 — 절 끝에 "어느 하네스가 무엇을 지키나" 표를 찍는다.
//      자명 통과 금지는 절 안에 상주한다(매 판 돌연변이 셋 · **늘어난 수**로 본다 — 절대값이면 진짜 결함이 있을 때 같이 넘어진다).
//
//   ⑤ **잠금이 무엇을 잡는 자인지** — T243 표본 넷(bush01·acorn·lettuce_2·lettuce_3)은 재굽기가
//      배포판과 안 맞는다. 같은 코드로 연달아 두 번 구우면 바이트가 **같으므로**(대조군) 굽기는 결정적이고,
//      어긋나는 건 **배포판을 구운 판이 지금 판이 아니기 때문**이다(렌더 드리프트 · 그림 차이는
//      |Δ|>24 0.01~0.49% 로 T205 잡음 바닥 5.3% 의 1/10 아래 — 눈엔 같다).
//      ★[T257] 자를 화소 해시로 바꿔도 그 넷은 **여전히 어긋난다** — 화소가 실제로 다르기 때문이다.
//        자 바꾸기가 고친 것은 **압축기 탓의 거짓 빨강**이고, 드리프트는 재굽기 카드 몫이다(별 카드).
//        잠금표는 지금 배포판 값으로 재생성했으므로 ②는 초록이고, 넷은 "알려진 드리프트"로 보고에 적혀 있다.
//
//   ⑧ **배포 폴더에 바이트코드 0 [T391]** — public/ 아래 추적되는 `.pyc`·`__pycache__/` 0 · 무시 규칙이 살아 있다.
//      디스크의 **무시된** 캐시는 표만(안 실린다). 미끼는 절 안에 상주(⑤ 와 같은 꼴).
//
// 자명 통과 금지(--selftest): 없는 참조 하나 · 잠금 어긋남 하나 · 추적 목록의 미끼 `.pyc` 하나를 **주입**해서 ①②⑧a 가 무는지 본다.
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
//   ★[T257] `icons` 쪽 자는 이제 `scripts/asset-lock.js` 하나다(화소 해시 · PNG 는 압축기에 안 흔들린다).
//     여기선 **부르기만** 한다 — 자를 두 벌 적으면 그 순간 실패다.
//     ★[T320] `char` 도 같은 자가 됐다 — 이제 **표마다 다르지 않다**(위 계약 ② 의 그 문장은 옛말이 됐고, 그 이력은 남겨 둔다).
const ASSETLOCK = require('./asset-lock.js');
const RULER = {
  icons: (p) => ASSETLOCK.lockValue(p).hash,
  char:  (p) => ASSETLOCK.pixelHash(p),                   // ★[T320] 시트도 **정규화 화소 해시**(정본 하나 · 사본 0)
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
// ★★[T257] **어간 대조는 키로 불리는 자산에만 쓴다.**
//   클라가 `/assets/icons/<key>.png` 를 키 목록에서 조립하므로 그림·소리는 어간이 곧 참조다
//   (그렇게 걸린 103장 전부 정당하다). 그런데 키로 안 불리는 **소스 파일**은 어간이 흔한 영단어라
//   남의 지역 변수에 걸린다 — T246 실측: `compose.py` 가 `mock-fogband.js:71 function compose(...)` 와
//   `mt3d-scenes.js:304 composeInto` 에 걸려 "쓰임 있음"이 됐다(그 둘은 `assets/audio` 를 0번 부른다).
//   그래서 고아가 56 인데 55 로 보였다. 오차는 **한 방향**이다 — 거짓 양성은 고아를 숨긴다.
//   ⇒ 아래 확장자는 **이름·URL 로만** 찾는다(어간 금지). 이름을 대면 여전히 걸린다.
const NO_STEM_EXT = new Set(['py', 'zip', 'md', 'txt', 'json', '',
  // ★[T266] 소리도 어간을 못 쓴다 — 키가 `wind`·`fire`·`eat`·`axe` 같은 **짧은 영단어**라
  //   코드 아무 데나 걸린다(실측: 갓 넣은 `sfx/fire.ogg` 가 `building_render.py`·`test-craft.js` 에,
  //   `sfx/wind.ogg` 가 `zone.js`·`e2e-weather.js` 에 걸려 **쓰는 데가 없는데 '쓰임 있음'** 이 됐다).
  //   ⇒ 이름(`wind.ogg`)이나 URL(`/assets/sfx/wind.ogg`)로만 찾는다. 세션9 매니페스트가 그렇게 부를 것이다.
  'ogg', 'm4a']);                        // '' = `.gitignore` 꼴
const NO_STEM = process.env.T257_NOSTEM === '0' ? new Set() : NO_STEM_EXT;   // 자명 통과 금지용 되돌림
// ★★[T257] **주석은 쓰임이 아니다.** 이 집이 세 번째로 밟은 지뢰다 — "검사 범위를 넓히면 검사가 거짓말한다"
//   (T182 `test-itemlabel` ⑩ · T205 `test-crops-world` · 그리고 여기). 위 주석에 `compose.py` 라고 적었더니
//   **이 하네스가 제 주석을 보고 그 파일을 "쓰임 있음"이라고 답했다.** 파일 이름을 설명하는 줄은 부르는 자리가 아니다.
//   ⇒ 토큰을 뽑기 전에 주석을 걷어낸다. 문자열 안의 `://` 는 지킨다(따옴표가 짝이 안 맞으면 자르지 않는다).
function stripComments(t, ext) {
  const evenQuotes = (x) => [...'\'"`'].every((q) => (x.split(q).length - 1) % 2 === 0);
  if (ext === 'js') {
    t = t.replace(/\/\*[\s\S]*?\*\//g, ' ');
    return t.split('\n').map((ln) => {
      for (let i = ln.indexOf('//'); i >= 0; i = ln.indexOf('//', i + 1)) {
        if (i > 0 && ln[i - 1] === ':') continue;              // https:// 따위
        if (evenQuotes(ln.slice(0, i))) return ln.slice(0, i); // 문자열 밖의 // 부터가 주석
      }
      return ln;
    }).join('\n');
  }
  if (ext === 'py' || ext === 'sh') {
    return t.split('\n').map((ln) => {
      for (let i = ln.indexOf('#'); i >= 0; i = ln.indexOf('#', i + 1)) {
        if (evenQuotes(ln.slice(0, i))) return ln.slice(0, i);
      }
      return ln;
    }).join('\n');
  }
  return t;
}
function readSrc(p) {
  const t = stripComments(fs.readFileSync(p, 'utf8'), path.extname(p).slice(1).toLowerCase());
  return { rel: path.relative(ROOT, p).split(path.sep).join('/'), text: t, toks: new Set(t.match(TOKENS) || []) };
}
const SRC = ROOT_SRC.map(readSrc);
const names = (a) => [a.stem, a.name, a.url];
const mentions = (s, a) => ((!NO_STEM.has(a.ext) && s.toks.has(a.stem)) || s.toks.has(a.name) || s.text.includes(a.url));

// ── 닿음 — 전이 폐포(계약 ④) ────────────────────────────────────────────
//   표(자산 안의 JSON)는 **제가 닿아야** 참조 원천이 된다.
// ★★[T266] **잠금표는 쓰임이 아니다.** 잠금은 파일에서 **유도된** 검사값이지 파일을 부르는 자리가 아니다.
//   그림에선 우연히 겹쳐서(잠긴 것은 다 쓰인다) 티가 안 났는데, 소리가 들어오자 드러났다:
//   `sfx/*.ogg` 를 잠그자마자 감사기가 **그 잠금표를 보고 '쓰임 있음'** 이라 답했다.
//   그러면 '잠갔으니 쓰는 것'이 되어, 아직 아무도 안 부르는 자산이 영원히 안 보인다.
//   ⇒ `*.lock.json` 은 참조 원천에서 뺀다. 실측: 빼도 그림은 하나도 안 흔들리고(고아 56 → 60)
//     늘어난 넷이 정확히 갓 넣은 `sfx/` 다 — 매니페스트가 부르면 그때 사라진다.
const JSONS = ASSETS.filter((a) => a.ext === 'json' && !/\.lock\.json$/.test(a.rel));
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
  // ★[T266] 소리 키는 **파일 이름 그대로**다(한 소리에 `.ogg`+`.m4a` 두 장 — `asset-lock.keyOf`).
  if (have.has(`public/assets/${dir}/${key}`)) return `public/assets/${dir}/${key}`;
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
   bad.length ? JSON.stringify(bad.slice(0, 6)) : '★[T320] 자가 **하나**다 — icons·mountains(webp)·char 전부 정규화 화소 해시[:16]');

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

// ── ⑤ 삼자 대조 — 매니페스트 ↔ 잠금표 ↔ `CREDITS.md` [T291] ──────────────
//
// 왜 여기 있나: 소리 자산은 **표 셋**이 따로 적는다.
//   `public/assets/sfx/manifest.json`   — 키·파일·출처 id  (지키는 자: `test-audio` · 세션9)
//   `public/assets/icons.lock.json.sfx` — 파일마다 해시     (지키는 자: 이 하네스 ②)
//   `CREDITS.md` §2-b                   — 파일마다 출처 URL·라이선스 (지키는 자: **아무도 없었다**)
// 셋 다 사람이 손으로 적고, **셋이 같은 파일 집합을 말해야** 한다. 그 자리가 비어 있었다 —
// 실측: `public/assets/sfx/` 에 `.ogg` 한 장을 더 놓으면 `test-assets-audit` 도 `test-audio` 도
// **둘 다 초록**이었다(고아 표에 숫자 하나가 늘 뿐이고 그 표는 빨강이 아니다).
// 즉 **잠기지도 크레딧에 적히지도 않은 소리가 배포된다.** 그래서 이 절이 있다.
//
// ★겹치는 검사는 안 만든다 — 누가 무엇을 지키는지 아래 표로 찍는다.
//   `test-audio ①` 이 이미 보는 것(매니페스트가 가리키는 파일이 디스크에 있나 · `.m4a` 짝 ·
//   크기·길이 상한 · `sources` 칸이 비었나)은 여기서 **다시 안 본다**.
function creditRows() {
  const md = fs.readFileSync(path.join(ROOT, 'CREDITS.md'), 'utf8');
  const i = md.indexOf('## 2-b.');
  if (i < 0) return null;                                   // 절이 사라지면 ⑤a 가 문다(수를 지어내지 않는다)
  const sec = md.slice(i).split(/\n## /)[0];
  const out = {}; let last = null;
  for (const line of sec.split('\n')) {
    const s = line.trim();
    if (!s.startsWith('|')) continue;
    const c = s.replace(/^\||\|$/g, '').split('|').map((x) => x.trim());
    const m = /^`([a-z0-9_]+)`$/.exec(c[0] || '');          // 첫 칸이 **오직** 백틱 키인 줄만 = 크레딧 행
    if (!m) continue;                                       // (§2-b 안의 설명용 표는 이 자로 걸러진다)
    const key = m[1];
    let url = mdLink(c[1] || '');
    if (/^〃/.test(c[1] || '') && last) url = out[last].url; // 〃 = 윗줄과 같은 출처
    out[key] = { url, license: c[3] || '', row: s }; last = key;
  }
  return out;
}
/** 마크다운 링크의 URL — 괄호를 센다(`File:Rain_(1).ogg` 처럼 URL 안에 괄호가 있다). */
function mdLink(cell) {
  const i = cell.indexOf('](');
  if (i < 0) { const m = /(https?:\/\/\S+)/.exec(cell); return m ? m[1].replace(/[).,]+$/, '') : null; }
  let j = i + 2, d = 1, out = '';
  while (j < cell.length && d) {
    const ch = cell[j];
    if (ch === '(') d++;
    else if (ch === ')') { if (!--d) break; }
    out += ch; j++;
  }
  return out.trim();
}
/** 라이선스 이름을 견줄 수 있게 — 굵게·괄호주석을 떼고 같은 것을 같은 말로. */
const normLic = (s) => {
  const v = String(s).replace(/\*\*/g, '').replace(/\([^)]*\)/g, '').replace(/`/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  return ({ 'cc0 1.0': 'cc0', 'cc0': 'cc0', 'public domain': 'pd' })[v] || v;
};

/** 삼자 대조의 알맹이 — 순수 함수라 **돌연변이를 먹여 무는지 볼 수 있다**(자명 통과 금지). */
function triCheck(x) {
  const only = (a, b) => a.filter((v) => !b.includes(v));
  const credFiles = x.cred ? Object.keys(x.cred).flatMap((k) => [k + '.ogg', k + '.m4a']).sort() : [];
  const a = [...only(x.disk, x.lock).map((f) => '잠금없음:' + f), ...only(x.lock, x.disk).map((f) => '파일없음:' + f)];
  const b = x.cred === null ? ['§2-b절없음']
    : [...only(x.disk, credFiles).map((f) => '크레딧없음:' + f), ...only(credFiles, x.disk).map((f) => '파일없음:' + f)];
  const c = [];
  for (const [k, v] of Object.entries(x.keys)) {
    if (!v.file) continue;                                   // 미확보 키는 출처가 없는 게 맞다(빨강 아님)
    const s = x.sources[v.source] || {};
    const cr = x.cred && x.cred[k];
    if (!cr) { c.push(`${k}:크레딧줄없음`); continue; }
    if (s.url !== cr.url) c.push(`${k}:url`);
    if (normLic(s.license) !== normLic(cr.license)) c.push(`${k}:라이선스(${normLic(s.license)}↔${normLic(cr.license)})`);
  }
  return { a, b, c };
}

console.log('\n⑤ 삼자 대조 — 소리 파일 하나를 표 셋이 똑같이 말하나 [T291]');
{
  const SFX = path.join(AST, 'sfx');
  const disk = fs.existsSync(SFX) ? fs.readdirSync(SFX).filter((f) => /\.(ogg|m4a)$/i.test(f)).sort() : [];
  const lock = Object.keys(JSON.parse(fs.readFileSync(path.join(AST, 'icons.lock.json'), 'utf8')).sfx || {}).sort();
  const man = JSON.parse(fs.readFileSync(path.join(SFX, 'manifest.json'), 'utf8'));
  const cred = creditRows();
  const base = { disk, lock, cred, keys: man.keys || {}, sources: man.sources || {} };
  const r = triCheck(base);

  ok(r.a.length === 0, `⑤a 디스크 ↔ 잠금표 — 한쪽에만 있는 파일 ${r.a.length}개 (잠기지 않은 소리가 배포되지 않는다)`,
     r.a.join(' ') || `${disk.length}장 양방향 일치`);
  ok(r.b.length === 0, `⑤b 디스크 ↔ CREDITS §2-b — 한쪽에만 있는 파일 ${r.b.length}개 (출처 없는 소리 0)`,
     r.b.join(' ') || `크레딧 ${cred ? Object.keys(cred).length : 0}줄`);
  ok(r.c.length === 0, `⑤c 매니페스트 출처 ↔ CREDITS 줄 — 어긋난 칸 ${r.c.length}개`,
     r.c.join(' ') || `${Object.values(base.keys).filter((v) => v.file).length}키 · URL·라이선스 양쪽 같다`);

  // ★자명 통과 금지 — 셋을 각각 한 군데씩 깨서 **그 절만** 무는지 본다(다른 절까지 물면 자가 뭉툭한 것이다).
  const cp = (o) => JSON.parse(JSON.stringify(o));
  const k0 = Object.keys(base.cred || {})[0];
  const mGhost = triCheck({ ...base, disk: [...disk, 'zzghost.ogg'] });
  const mCred = triCheck({ ...base, cred: (() => { const d = cp(base.cred); delete d[k0]; return d; })() });
  const mUrl = triCheck({ ...base, cred: (() => { const d = cp(base.cred); d[k0].url += '#zz'; return d; })() });
  // ★수를 **절대값이 아니라 늘어난 만큼**으로 본다 — 진짜 결함이 하나 있는 판에서도 이 시험이 제 몫을 해야 한다
  //   (T272 에서 배운 것과 같은 줄: 시험이 제가 시험하는 것에 걸려 넘어지면 안 된다).
  ok(mGhost.a.length === r.a.length + 1 && mGhost.b.length === r.b.length + 1,
     'ⓐ 잠금에도 크레딧에도 없는 `.ogg` 한 장을 놓으면 ⑤a·⑤b 가 **하나씩 더** 문다',
     `a ${r.a.length}→${mGhost.a.length} · b ${r.b.length}→${mGhost.b.length}`);
  ok(mCred.b.length === r.b.length + 2 && mCred.a.length === r.a.length,
     `ⓑ 크레딧 한 줄(\`${k0}\`)을 지우면 ⑤b 만 **둘 더** 문다(.ogg+.m4a) — ⑤a 는 그대로`,
     `b ${r.b.length}→${mCred.b.length} · a ${r.a.length}→${mCred.a.length}`);
  ok(mUrl.c.length === r.c.length + 1 && mUrl.b.length === r.b.length,
     'ⓒ 크레딧 URL 을 한 글자 바꾸면 ⑤c 만 **하나 더** 문다',
     `c ${r.c.length}→${mUrl.c.length} · b ${r.b.length}→${mUrl.b.length}`);
  ok(triCheck({ ...base, keys: cp(base.keys) }).c.length === r.c.length,
     'ⓓ ★대조 — 안 건드린 표를 다시 재면 수가 그대로다(자가 아무거나 물지 않는다)', `c=${r.c.length}`);
  // ⓔ ★[T303] **개명은 셋이 같이 움직여야 한다** — 한 표에만 옛 이름이 남으면 문다.
  //   실제 개명(`wolf_growl` → `wolf_howl`) 때 이 절이 도중 상태를 잡았다(⑤b 4개 · ⑤c 1개). 그것을 시험으로 남긴다.
  const renamed = Object.keys(base.cred || {}).find((k) => disk.includes(k + '.ogg')) || Object.keys(base.cred || {})[0];
  const mStale = triCheck({ ...base, cred: (() => {
    const d = cp(base.cred); d[renamed + '_stale'] = d[renamed]; delete d[renamed]; return d; })() });
  ok(mStale.b.length === r.b.length + 4 && mStale.c.length === r.c.length + 1,
     `ⓔ ★크레딧에만 옛 이름이 남으면(\`${renamed}\` → \`${renamed}_stale\`) ⑤b 가 **넷 더**(없는 파일 둘 + 크레딧 없는 파일 둘) · ⑤c 가 **하나 더** 문다`,
     `b ${r.b.length}→${mStale.b.length} · c ${r.c.length}→${mStale.c.length}`);

  const manFiles = Object.values(base.keys).flatMap((v) => [v.file, v.fileAlt]).filter(Boolean);
  const noKey = [...new Set(disk.filter((f) => !manFiles.includes(f)).map((f) => f.replace(/\.(ogg|m4a)$/i, '')))];
  const noFile = Object.entries(base.keys).filter(([, v]) => !v.file).map(([k]) => k);
  // ★[T303] "후보"라고 부르지 않는다 — 비어 있는 것이 **대기인지 결정인지**는 매니페스트가 적는다(`_파일없음`).
  //   하네스가 키 이름을 손으로 들고 있으면 결정이 바뀔 때마다 여기도 고쳐야 한다 ⇒ 라벨은 중립으로.
  const st = (k) => (base.keys[k] && base.keys[k].state) ? `(${base.keys[k].state})` : '';
  console.log(`     · 파일은 있는데 **키가 없다**: ${noKey.join(' ') || '없음'}  — 왜인지는 매니페스트 \`_파일없음\``);
  console.log(`     · 키는 있는데 **파일이 없다**: ${noFile.map((k) => k + st(k)).join(' ') || '없음'}  — \`state\` 가 적혀 있으면 **결정**이고 비어 있으면 대기다`);
  console.log('     ┌ 어느 하네스가 무엇을 지키나 (겹치는 검사는 안 만든다) ─────────────');
  console.log('     │ `test-audio`(세션9)   매니페스트 **안쪽** — 값·상한·`.m4a` 짝·훅·BGM·리미터·페이드');
  console.log('     │ 이 하네스 ①②         잠금 해시 · 닿는 표가 가리키는 파일이 있나');
  console.log('     │ 이 하네스 ⑤ [T291]    디스크 ↔ 잠금 ↔ CREDITS 의 **파일 집합**과 **출처 값**');
  console.log('     └ 겹침 0: 매니페스트가 가리키는 파일의 존재·크기·길이는 `test-audio ①` 이 본다 — 여기선 안 본다');
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

// ★[T308] 꼬리를 함수로 — ⑥ 의 재압축 대조가 **비동기**(sharp)라 그 절이 끝난 뒤에 마무리해야 한다.
//   sharp 가 없으면 ⑥ 가 동기로 끝나고 바로 `finish()` 가 불린다(길이 둘이 아니라 **한 자리**다).
function finish() {
if (JSONI >= 0 && process.argv[JSONI + 1]) {
  fs.writeFileSync(process.argv[JSONI + 1], JSON.stringify(ASSETS.map((a) => ({
    rel: a.rel, dir: a.dir, ext: a.ext, bytes: a.bytes, sha1: a.sha1, refs: a.refs, orphan: a.orphan,
  })), null, 0));
  console.log(`  · 전수표 → ${process.argv[JSONI + 1]}`);
}

if (SELFTEST) {
  // ★[T391] 셋째 주입 — 추적 목록에 미끼 `.pyc` 한 장(⑧a). 셋 다 물어야 한다.
  console.log('\n[--selftest] 없는 참조 하나(`icons/__selftest_ghost__`) · 잠금 어긋남 하나 · 추적 목록의 미끼 `.pyc` 하나를 주입했다. ①②⑧a 가 셋 다 빨개야 한다.');
  console.log('결과: ' + (fail >= 3 ? `PASS(검사기가 셋 다 물었다 · ${fail}건)` : `FAIL(자명 통과 — ${fail}건만 물었다)`));
  process.exit(fail >= 3 ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
}

// ── ⑦ 배선은 있는데 파일이 없는 키 — **고아의 반대** [T320] ──────────────────
//
// ③ 고아는 "파일은 있는데 아무도 안 부른다" 를 센다. 그 반대가 여기 있다:
// **표가 부르는데 소리가 없다.** 둘 다 빨강이 아니지만 **다른 뜻**이다 —
// 고아는 "아직 안 이었다", 이쪽은 "이었는데 **무음으로 난다**"(누르면 아무 일도 안 일어난 것처럼 보인다).
// ⇒ 세는 것이 값이다. 그리고 계약 하나만 건다: **무음이면 그 사실이 표에 적혀 있어야 한다**(`state`).
//   말없이 무음인 키가 하나라도 있으면 문다 — "음원이 오다 말았나 / 원래 없는 건가" 를 사람이 못 가른다.
//   ⚠음원을 **만들지 않는다**(녹음은 재민 · #34). 이 절은 세고 적을 뿐이다.
console.log('\n⑦ 배선은 있는데 파일이 없는 키 — 고아의 반대 [T320]');
{
  const MP = path.join(AST, 'sfx', 'manifest.json');
  const man = JSON.parse(fs.readFileSync(MP, 'utf8'));
  const KEYS = man.keys || {};
  // 배선 = 표가 키를 보내는 자리. 표 이름을 손으로 안 적는다 — 값이 키 이름인 표를 전부 찾는다.
  const wiredBy = {};
  for (const [tbl, body] of Object.entries(man)) {
    if (tbl.startsWith('_') || tbl === 'keys' || tbl === 'sources' || typeof body !== 'object') continue;
    for (const [slot, v] of Object.entries(body)) {
      if (slot.startsWith('_') || typeof v !== 'string' || !KEYS[v]) continue;
      (wiredBy[v] = wiredBy[v] || []).push(`${tbl}.${slot}`);
    }
  }
  const silent = Object.keys(KEYS).filter((k) => !KEYS[k].file).sort();
  const wiredSilent = silent.filter((k) => wiredBy[k]);
  const loneSilent = silent.filter((k) => !wiredBy[k]);
  const undeclared = wiredSilent.filter((k) => !KEYS[k].state);

  ok(Object.keys(wiredBy).length > 0, `⓪ [전제] 표가 실제로 키를 보내고 있다 — 배선된 키 ${Object.keys(wiredBy).length}종`,
     `표 ${[...new Set(Object.values(wiredBy).flat().map((s) => s.split('.')[0]))].join(' ')}`);
  ok(undeclared.length === 0,
     `⑦a ★**말없이 무음인 키 ${undeclared.length}개** — 배선됐는데 파일도 없고 \`state\` 도 없다`,
     undeclared.join(' ') || `무음 ${wiredSilent.length}종이 전부 \`state\` 를 달고 있다(결정이지 사고가 아니다)`);
  console.log(`     · 배선 있고 **무음**: ${wiredSilent.length}개`);
  for (const k of wiredSilent) {
    console.log(`       ${k.padEnd(12)} state=${String(KEYS[k].state || '없음').padEnd(8)} ← ${wiredBy[k].join(' · ')}`);
  }
  console.log(`     · 배선도 파일도 없음(키만 있다): ${loneSilent.join(' ') || '없음'}`);
  console.log('     ⚠빨강이 아니다 — 음원이 오면 **코드 0** 으로 난다. 만드는 것은 사람이다(녹음은 재민 · #34).');

  // ★자명 통과 금지 — `state` 를 떼면 ⑦a 가 문다(계약이 실제로 물 줄 아는가).
  const probe = JSON.parse(JSON.stringify(KEYS));
  const first = wiredSilent[0];
  if (first) { delete probe[first].state; }
  const wouldBite = wiredSilent.filter((k) => !probe[k].state);
  ok(!first || wouldBite.length === 1,
     `⑦b 자명 통과 금지 — \`${first || '-'}\` 의 \`state\` 를 떼면 ⑦a 가 문다`, `문 키 ${wouldBite.length}개`);
}

// ── ⑧ 배포 폴더에 바이트코드 0 — `.pyc`·`__pycache__/` [T391] ─────────────────
//
// T386 이 `public/assets/audio/bgm/__pycache__/*.cpython-311.pyc` **4장**을 찾았다 — GPT R&D 착지(`462b4acc`)가
// 같이 커밋했다. 원본이 아니라 파이썬이 import 할 때 떨구는 캐시이고, 부르는 데도 없다.
// 배포는 **서버 checkout** 에서 이미지를 굽는다(`redeploy-hanbando.sh` = git pull · `.dockerignore` 는 `bgm/*.py` 만 뺀다)
// ⇒ **추적되는 `.pyc` 는 이미지에 실린다.** 그래서 이 절은 "디스크에 있나" 가 아니라 **"실리나"** 를 잰다:
//   ⑧a public/ 아래 **git 이 추적하는** 바이트코드 0
//   ⑧b `git add -A` 가 주울 **무시 안 된** 바이트코드 0 (다음 커밋에 새어 들어갈 것)
//   ⑧c `.gitignore` 의 `__pycache__/` 규칙이 **살아 있다** — 대조: 같은 폴더의 `.py` 는 안 무시(규칙이 뭉툭하지 않다)
// 디스크의 **무시된** 캐시는 빨강이 아니다(bgm 모듈을 import 하는 파이썬 하네스·도구가 돌 때마다 생긴다 — 안 실린다) → 표만.
// 자명 통과 금지는 절 안에 상주한다(⑤ 와 같은 꼴 · 미끼를 **목록에** 놓고 **늘어난 수**로 본다).
console.log('\n⑧ 배포 폴더에 바이트코드 0 — `.pyc`·`__pycache__/` [T391]');
{
  const { execFileSync } = require('child_process');
  const isByte = (rel) => /(^|\/)__pycache__\//.test(rel) || /\.py[co]$/i.test(rel);
  const bytecode = (xs) => xs.filter(isByte);
  const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const lsz = (extra) => git(['ls-files', '-z', ...extra, '--', 'public']).split('\0').filter(Boolean);
  const ignored = (p) => { try { git(['check-ignore', '-q', '--no-index', '--', p]); return true; } catch (e) { return false; } };
  const DECOY = 'public/assets/audio/bgm/__pycache__/zz_t391_decoy.cpython-311.pyc';
  const CTRL = 'public/assets/audio/bgm/zz_t391_decoy.py';
  let tracked = null, loose = [];
  try { tracked = lsz([]); loose = lsz(['--others', '--exclude-standard']); } catch (e) { tracked = null; }
  const onDisk = ASSETS.map((a) => a.rel).filter(isByte);
  if (tracked === null) {
    // git checkout 이 아니다(타르볼 등) — **디스크 전수**로 대신 잰다(더 엄하다: 무시된 캐시까지 문다).
    tracked = ASSETS.map((a) => a.rel);
    console.log('     · git 없음 — ⑧a 를 디스크 전수로 잰다(무시된 캐시도 빨강이다)');
  }
  const trackedEff = SELFTEST ? [...tracked, DECOY] : tracked;          // ★--selftest 주입 — ⑧a 가 물어야 한다
  const shipT = bytecode(trackedEff), shipL = bytecode(loose);
  ok(shipT.length === 0, `⑧a public/ 아래 **추적되는** 바이트코드 ${shipT.length}장 — 서버 checkout 에 실리는 것`,
     shipT.slice(0, 6).join(' ') || `추적 ${tracked.length}장 중 0`);
  ok(shipL.length === 0, `⑧b \`git add -A\` 가 주울 **무시 안 된** 바이트코드 ${shipL.length}장`,
     shipL.slice(0, 6).join(' ') || `미추적·미무시 ${loose.length}장 중 0`);
  const ruleLive = ignored(DECOY), ctrlFree = !ignored(CTRL);
  ok(ruleLive && ctrlFree, `⑧c \`.gitignore\` 의 \`__pycache__/\` 가 살아 있다 — 미끼 경로는 무시 · 같은 폴더 \`.py\` 는 안 무시`,
     `pyc ${ruleLive ? '무시' : '★안 무시'} · py ${ctrlFree ? '안 무시' : '★무시(뭉툭)'}`);
  // ★자명 통과 금지 — 미끼 한 장을 **추적 목록**에 놓으면 ⑧a 가, **무시 안 된 목록**에 놓으면 ⑧b 가 하나씩 더 문다.
  //   대조: 같은 자리에 `.py` 한 장을 놓으면 수가 그대로다(자가 아무거나 물지 않는다).
  const base = bytecode(tracked).length;
  ok(bytecode([...tracked, DECOY]).length === base + 1 && bytecode([...loose, DECOY]).length === shipL.length + 1,
     'ⓐ 미끼 `.pyc` 한 장을 놓으면 ⑧a·⑧b 가 **하나씩 더** 문다', `a ${base}→${base + 1} · b ${shipL.length}→${shipL.length + 1}`);
  ok(bytecode([...tracked, CTRL]).length === base,
     'ⓑ ★대조 — 같은 자리에 `.py` 한 장을 놓으면 수가 그대로다', `a=${base}`);
  const tset = new Set(tracked), lset = new Set(loose);
  const quiet = onDisk.filter((r) => !tset.has(r) && !lset.has(r));    // 추적도 아니고 주울 것도 아닌 것 = 무시된 캐시
  console.log(`     · 디스크의 바이트코드 ${onDisk.length}장 — 추적 ${onDisk.filter((r) => tset.has(r)).length} · 무시 안 됨 ${onDisk.filter((r) => lset.has(r)).length} · **무시됨 ${quiet.length}**(안 실린다 · 빨강 아님 · 파이썬 하네스가 bgm 모듈을 import 하면 생긴다)`);
  for (const r of quiet.slice(0, 8)) console.log(`       ${r}`);
}

// ── ⑨ `legacy/` 는 배포 폴더 밖이어야 한다 — `.dockerignore` 로 [T401] ─────────────────
//
// T401 ① 은 07-30 판 11곡의 코드를 찾으면 `public/assets/audio/bgm/legacy/` 에 올리라고 했다(배포 폴더 **밖** —
// 이미지에 안 실리게). 이미지는 `COPY public ./public` 으로 굽고 빼는 것은 `.dockerignore` 하나다.
// ⇒ 이 절은 **Docker 의 규칙으로** `.dockerignore` 를 읽어 legacy 파일이 빠지는지 잰다.
//   ★Docker 규칙은 .gitignore 와 다르다: 패턴은 **문맥 뿌리에 붙는다**(`*.zip` 은 뿌리의 zip 만 — 어디서나는 `**/*.zip`) ·
//     `*` 는 `/` 를 못 넘는다 · 폴더가 걸리면 그 안이 다 빠진다 · 뒤 줄이 앞 줄을 이긴다 · `!` 는 되살린다.
//     (moby/patternmatcher 꼴 — T401 실측: 레포 추적 2,446장 전수에서 docker-py 7.2.0 `exclude_paths` 와 **들어가는
//      집합이 같다**(1,864장 · 양쪽에만 있는 것 0).) 그 결과 하나: T303 의 `*.zip`·`samples/` 두 줄은 **뿌리에만** 걸려
//      `bgm/코드백업*.zip` 2장·`bgm/samples/` 는 **지금도 실린다**(T303 이 센 0.55 MB 중 0.31 MB) — 표만 · 회부.
// ★[T422] Docker 규칙 셋(`toRe`·`parse`·`excluded`)은 ⑩ 도 쓴다 — ⑨ 블록 밖으로 **그대로** 옮겼다(몸 무변).
const DOCKER_RULES = (() => {
  const toRe = (p) => {                                   // moby/patternmatcher 꼴 — ** · * · ? · 나머지는 글자 그대로
    let s = '^';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '*') {
        if (p[i + 1] === '*') { i++; if (p[i + 1] === '/') { i++; s += '(?:.*/)?'; } else s += '.*'; }
        else s += '[^/]*';
      } else if (c === '?') s += '[^/]';
      else s += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(s + '$');
  };
  const parse = (txt) => txt.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const neg = l.startsWith('!'); let p = neg ? l.slice(1).trim() : l;
    p = path.posix.normalize(p).replace(/\/+$/, '').replace(/^\/+/, '');   // filepath.Clean + 앞 `/` 떼기
    return { p, neg, re: toRe(p) };
  });
  const excluded = (rel, pats) => {                       // 파일이나 **그 위 폴더**가 걸리면 빠진다 · 뒤 줄이 이긴다
    const parts = rel.split('/'); let ex = false;
    for (const q of pats) {
      let hit = false;
      for (let i = parts.length; i >= 1 && !hit; i--) hit = q.re.test(parts.slice(0, i).join('/'));
      if (hit) ex = !q.neg;
    }
    return ex;
  };
  return { toRe, parse, excluded };
})();
console.log('\n⑨ `legacy/` 는 배포 폴더 밖 — `.dockerignore`(Docker 규칙)로 [T401]');
{
  const DI = path.join(ROOT, '.dockerignore');
  const { parse, excluded } = DOCKER_RULES;
  const PATS = fs.existsSync(DI) ? parse(fs.readFileSync(DI, 'utf8')) : [];
  const LEG = 'public/assets/audio/bgm/legacy';
  const DECOY = `${LEG}/tracks2.py`;
  let tracked = null;
  try { tracked = require('child_process').execFileSync('git', ['ls-files', '-z', '--', 'public'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean); }
  catch (e) { tracked = ASSETS.map((a) => a.rel); }
  const legacyFiles = tracked.filter((r) => r.startsWith(LEG + '/'));
  const shipping = (xs, pats) => xs.filter((r) => r.startsWith(LEG + '/') && !excluded(r, pats));
  ok(shipping(legacyFiles, PATS).length === 0,
     `⑨a \`legacy/\` 에서 이미지에 실리는 파일 ${shipping(legacyFiles, PATS).length}장`,
     legacyFiles.length ? `legacy ${legacyFiles.length}장 전부 \`.dockerignore\` 가 뺀다` : '`legacy/` 없음 — T401 ① 이 정본을 못 찾았다(0/11 · 보고/T401)');
  // 자가 서는지 — 이미 있는 줄로 알려진 답을 낸다(자명 통과 금지 · 대조 둘)
  ok(excluded('public/assets/audio/bgm/compose.py', PATS) && !excluded('public/assets/audio/bgm/bgm.js', PATS)
     && !excluded(DECOY, PATS),
     'ⓐ 자 대조 — `bgm/*.py` 줄은 `compose.py` 를 빼고 `bgm.js` 는 안 뺀다 · `*` 는 `/` 를 못 넘어 `legacy/tracks2.py` 는 **안 뺀다**',
     `compose.py ${excluded('public/assets/audio/bgm/compose.py', PATS) ? '빠짐' : '★실림'} · bgm.js ${excluded('public/assets/audio/bgm/bgm.js', PATS) ? '★빠짐' : '실림'} · legacy/tracks2.py ${excluded(DECOY, PATS) ? '빠짐' : '실림'}`);
  // 미끼 — legacy 파일 한 장을 추적 목록에 놓으면 ⑨a 가 **하나 더** 문다 · 규칙 한 줄을 (가상으로) 더하면 안 문다
  const base = shipping(legacyFiles, PATS).length;
  const withRule = PATS.concat(parse(LEG + '/'));
  ok(shipping([...legacyFiles, DECOY], PATS).length === base + 1 && shipping([...legacyFiles, DECOY], withRule).length === 0,
     `ⓑ 미끼 \`${DECOY}\` 를 놓으면 ⑨a 가 **하나 더** 문다 · \`${LEG}/\` 한 줄을 더하면 안 문다(세우는 카드가 같이 넣을 줄)`,
     `${base}→${base + 1} · 줄 더하면 ${shipping([...legacyFiles, DECOY], withRule).length}`);
  // 표만 — 뿌리에 붙은 줄 때문에 **지금 실리는** bgm 의 zip·samples (빨강 아님 · 회부)
  const rooted = tracked.filter((r) => r.startsWith('public/assets/audio/bgm/') && /(\.zip$|\/samples\/)/.test(r) && !excluded(r, PATS));
  console.log(`     · 뿌리에 붙은 줄(\`*.zip\`·\`samples/\`)이 못 빼는 bgm 파일 ${rooted.length}장 — **이미지에 실린다**(표만 · 회부 — 어디서나 빼려면 \`**/\`)`);
  for (const r of rooted) console.log(`       ${r}`);
}

// ── ⑩ R&D 보관소 `tools/_rnd_archive/` 는 배포 밖 — 이미지는 `COPY` 가 가리키는 것만 싣는다 [T422] ─────
//
// T422 가 GPT R&D 도구 14 폴더(T411 권고 "버림")를 `tools/_rnd_archive/` 로 옮겼다 — **정본 아님**(그 폴더 README).
// 배포는 서버 checkout 에서 `docker build -f Dockerfile.{zone,central}` 로 굽는다(`scripts/redeploy-hanbando.sh`).
// 이미지에 드는 것은 Dockerfile 의 `COPY <원본…> <목적>` 이 가리키는 것뿐이고, 그 안에서 `.dockerignore` 가 뺀다(⑨ 의 자).
// ⇒ 이 절은 **Dockerfile 전부**의 `COPY` 원본을 읽어 보관소 파일이 어느 이미지에도 안 실리는지 잰다(정적 폴더 `public/` 밖인지도).
//   ⓐ 자 대조 — `public/…/bgm.js`·`server/` 파일은 **실린다** · `보고/` 는 안 실린다(COPY 읽기가 살아 있다)
//   ⓑ 미끼 — `COPY . .` 한 줄을 (가상으로) 더하면 ⑩a 가 보관소 파일 **전부**를 문다 · 그때 `tools/` 한 줄을 `.dockerignore` 에 더하면 다시 0
console.log('\n⑩ R&D 보관소 `tools/_rnd_archive/` 는 배포 밖 — 이미지는 `COPY` 한 것만 [T422]');
{
  const { toRe, parse, excluded } = DOCKER_RULES;
  const ARC = 'tools/_rnd_archive';
  const DI = path.join(ROOT, '.dockerignore');
  const PATS = fs.existsSync(DI) ? parse(fs.readFileSync(DI, 'utf8')) : [];
  const DOCKERFILES = fs.readdirSync(ROOT).filter((f) => /^Dockerfile(\..+)?$/.test(f)).sort();
  const copySrcs = (txt) => txt.split('\n').map((l) => l.trim())
    .filter((l) => /^COPY\s/i.test(l) && !/--from=/i.test(l))
    .flatMap((l) => {
      const args = l.replace(/^COPY\s+/i, '').split(/\s+/).filter((a) => a && !a.startsWith('--'));
      return args.slice(0, -1).map((a) => path.posix.normalize(a).replace(/^\.\//, '').replace(/\/+$/, '') || '.');
    });
  const IMAGES = DOCKERFILES.map((f) => ({ f, srcs: copySrcs(fs.readFileSync(path.join(ROOT, f), 'utf8')) }));
  const copiedBy = (rel, srcs) => srcs.some((src) => {
    if (src === '.') return true;
    if (/[*?]/.test(src)) { const re = toRe(src); const parts = rel.split('/'); for (let i = 1; i <= parts.length; i++) if (re.test(parts.slice(0, i).join('/'))) return true; return false; }
    return rel === src || rel.startsWith(src + '/');
  });
  const ships = (rel, images, pats) => images.some((im) => copiedBy(rel, im.srcs)) && !excluded(rel, pats);
  let tracked = null;
  try { tracked = require('child_process').execFileSync('git', ['ls-files', '-z', '--', ARC, 'public', 'server'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0').filter(Boolean); }
  catch (e) { tracked = null; }
  if (tracked === null) {                                  // git 없음 — 디스크로 센다
    const walk = (d) => (fs.existsSync(path.join(ROOT, d)) ? fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])) : []);
    tracked = [...walk(ARC), ...ASSETS.map((a) => a.rel)];
  }
  const arcFiles = tracked.filter((r) => r.startsWith(ARC + '/'));
  const arcShip = arcFiles.filter((r) => ships(r, IMAGES, PATS));
  ok(arcFiles.length > 0 && arcShip.length === 0,
     `⑩a 보관소 파일 중 이미지에 실리는 것 ${arcShip.length}장`,
     `보관소 ${arcFiles.length}장 · ${IMAGES.map((im) => `${im.f}: COPY ${im.srcs.join(' ')}`).join(' / ')}`);
  const inPublic = tracked.filter((r) => r.startsWith('public/') && r.split('/').includes('_rnd_archive'));
  ok(inPublic.length === 0, `⑩b 정적 폴더 \`public/\` 아래 \`_rnd_archive\` ${inPublic.length}장`, inPublic.slice(0, 4).join(' ') || '없다');
  const serverFile = tracked.find((r) => r.startsWith('server/'));
  ok(IMAGES.length > 0 && ships('public/assets/audio/bgm/bgm.js', IMAGES, PATS) && !!serverFile && ships(serverFile, IMAGES, PATS)
     && !ships('보고/T422_2026-09-26.md', IMAGES, PATS),
     'ⓐ 자 대조 — `bgm.js`·`server/` 파일은 **실린다** · `보고/` 는 안 실린다(COPY 읽기가 살아 있다)',
     `Dockerfile ${IMAGES.length}장 · bgm.js ${ships('public/assets/audio/bgm/bgm.js', IMAGES, PATS) ? '실림' : '★안 실림'} · ${serverFile} ${serverFile && ships(serverFile, IMAGES, PATS) ? '실림' : '★안 실림'}`);
  const withDot = IMAGES.map((im) => ({ f: im.f, srcs: [...im.srcs, '.'] }));
  const bitAll = arcFiles.filter((r) => ships(r, withDot, PATS)).length;
  const healed = arcFiles.filter((r) => ships(r, withDot, PATS.concat(parse('tools/')))).length;
  ok(bitAll === arcFiles.length && healed === 0,
     'ⓑ 미끼 — `COPY . .` 를 더하면 ⑩a 가 보관소 **전부**를 문다 · `.dockerignore` 에 `tools/` 를 더하면 다시 0',
     `${arcShip.length}→${bitAll}/${arcFiles.length} · 줄 더하면 ${healed}`);
}

// ── ⑥ 반례 — 화소 자가 **무엇에 둔하고 무엇에 예민한지** [T308] ──────────────
//
// T303 이 자를 webp 까지 넓히며 **그 자가 둔하지 않다는 것도 쟀다**: 같은 RGBA 를 무손실
// `effort` 0/4/6 으로 다시 구우면 화소 해시가 셋 다 달랐고, **완전투명 화소를 빼고 견주면 다른 화소 0** 이었다.
// 범인은 안 보이는 값(투명 아래 RGB)을 인코더가 고쳐 쓰는 것(alpha cleaning)이었다.
// T308 이 자를 고쳤다 — `a === 0` 이면 RGB 를 0 으로 놓고 잰다. 이 절은 그 고침을 **양쪽으로** 못 박는다:
//   ⓐ 압축기를 갈아도 **같은 해시**(옛 자로는 달랐다 — 같은 판에서 둘 다 찍는다)
//   ⓑ **보이는** 화소 하나를 1 바꾸면 **다른 해시** — 둔해진 게 아니라 **안 보이는 데만** 둔하다
//   ⓒ 투명 아래 RGB 만 바꾸면 **같은 해시**
// ⚠반투명(`0 < a < 255`)은 안 만진다 — 그건 보인다. ⓑ 가 그 자리를 지킨다.
console.log('\n⑥ 반례 — 화소 자는 **안 보이는 데만** 둔하다 [T308]');
{
  const A = require('./asset-lock.js');
  const LK = JSON.parse(fs.readFileSync(A.LOCK, 'utf8'));
  // ★옛 자(대조용) — 정규화 없이 재는 것. 이 줄이 있어야 "고쳤다"가 수로 보인다.
  const rawHash = (im) => sha1(Buffer.concat([Buffer.from(`${im.width}x${im.height}|`), Buffer.from(im.data)])).slice(0, 16);

  // 표본은 손으로 안 적는다 — 잠금표에서 **투명이 실제로 있는** 것을 확장자별로 둘씩 고른다.
  const pick = (ext, n) => {
    const out = [];
    for (const [g, gg] of Object.entries(A.groups(LK))) {
      for (const f of A.filesOf(gg)) {
        if (out.length >= n || !f.toLowerCase().endsWith(ext) || A.rulerOf(f) !== 'pixel') continue;
        const p = path.join(gg.dir, f);
        const im = A.decodeImage(p);
        const s = A.alphaStats(im.data);
        if (s.clear > 0 && s.clear < s.n) out.push({ p, rel: `${g}/${f}`, im, s });   // 투명도 있고 보이는 것도 있다
      }
      if (out.length >= n) break;
    }
    return out;
  };
  // ★[T320] `char/` 시트도 같은 자를 쓰게 됐으니 **같은 반례를 시트로도** 재현한다.
  //   시트는 격자라 투명 비중이 전혀 다르다(실측 97.1% — 산 51% · 다리 90%). 자가 거기서도 서는지 본다.
  const pickChar = (n) => {
    const D = path.join(AST, 'char'), out = [];
    const META = JSON.parse(fs.readFileSync(path.join(D, 'char_meta.json'), 'utf8'));
    for (const k of Object.keys(META.sheets)) {
      if (out.length >= n || k.startsWith('probeall')) continue;
      const p = path.join(D, k + '.png');
      if (!fs.existsSync(p)) continue;
      const im = A.decodeImage(p), s = A.alphaStats(im.data);
      if (s.clear > 0 && s.clear < s.n) out.push({ p, rel: `char/${k}.png`, im, s });
    }
    return out;
  };
  const samples = [...pick('.png', 2), ...pick('.webp', 2), ...pickChar(4)];
  const chars = samples.filter((x) => x.rel.startsWith('char/'));
  ok(samples.length === 8 && chars.length === 4 && samples.every((x) => x.s.clear > 0),
     `⓪ 표본 여덟이 서 있다(자산 PNG 둘 · webp 둘 · **시트 넷** · 전부 투명이 실제로 있다)`,
     samples.map((x) => `${x.rel.replace(/\.(png|webp)$/, '')} ${(x.s.clear / x.s.n * 100).toFixed(0)}%`).join(' · '));
  ok(chars.every((x) => x.s.clear / x.s.n > 0.9),
     `⓪b ★시트는 투명 비중이 **자산과 다르다** — 넷 다 90% 넘는다(자가 거기서도 서는지가 이 절의 값이다)`,
     chars.map((x) => `${(x.s.clear / x.s.n * 100).toFixed(1)}%`).join(' · '));

  // ⓑ 보이는 화소 하나를 1 바꾸면 다른 해시 ─ 자가 둔해진 게 아니다
  const bBad = [];
  for (const x of samples) {
    const d = Buffer.from(x.im.data);
    let i = -1;
    for (let j = 0; j < d.length; j += 4) if (d[j + 3] > 0) { i = j; break; }   // 첫 **보이는** 화소
    if (i < 0) { bBad.push(`${x.rel}:보이는화소0`); continue; }
    d[i] = (d[i] + 1) & 0xff;                                                   // R 을 딱 1
    if (A.pixelHashOf(x.im.width, x.im.height, d) === A.pixelHashOf(x.im.width, x.im.height, x.im.data)) bBad.push(x.rel);
  }
  ok(bBad.length === 0, `ⓑ ★**보이는** 화소 하나의 R 을 1 바꾸면 **다른 해시** — 어긋난 표본 ${bBad.length}개`,
     bBad.join(' ') || `${samples.length}/4 전부 문다(둔해진 게 아니라 **안 보이는 데만** 둔하다)`);

  // ⓒ 투명 아래 RGB 만 바꾸면 같은 해시 ─ 인코더가 고쳐 쓰는 그 자리
  const cBad = [], cNote = [];
  for (const x of samples) {
    const d = Buffer.from(x.im.data);
    let n = 0;
    for (let j = 0; j < d.length; j += 4) if (d[j + 3] === 0) { d[j] = 0xff; d[j + 1] = 0x7f; d[j + 2] = 0x01; n++; }
    cNote.push(`${x.rel} ${n}화소`);
    if (A.pixelHashOf(x.im.width, x.im.height, d) !== A.pixelHashOf(x.im.width, x.im.height, x.im.data)) cBad.push(x.rel);
    if (rawHash({ width: x.im.width, height: x.im.height, data: d }) === rawHash(x.im)) cBad.push(`${x.rel}:대조실패`);
  }
  ok(cBad.length === 0, `ⓒ ★투명 아래 RGB 를 전부 뒤엎어도 **같은 해시**(그리고 옛 자로는 **달랐다**) — 어긋난 표본 ${cBad.length}개`,
     cBad.join(' ') || cNote.join(' · '));

  // ⓐ 무손실 재압축 ─ 진짜 인코더가 있어야 한다. 픽스처를 저장소에 굽어 넣지 않고 **런타임에** 굽는다.
  let sharp = null;
  try { sharp = require('sharp'); } catch (e) { /* CI 엔 없다 */ }
  if (!sharp) {
    console.log('     · ⓐ 무손실 재압축 대조: **sharp 없음 · 건너뜀**(저장소 의존성 0 — 픽스처를 구워 넣지 않는다).');
    console.log('       ⓒ 가 같은 것을 **인코더 없이** 이미 재 놨다(투명 아래 RGB 를 뒤엎어도 같은 해시).');
    finish();
  } else {
    const rows = [];
    (async () => {
      // webp 자산 둘 + 시트 둘 — 시트는 그 RGBA 를 무손실 webp 로 구워 **같은 alpha cleaning** 에 태운다.
      for (const x of [...samples.filter((s) => s.p.endsWith('.webp')), ...chars.slice(0, 2)]) {
        const news = new Set(), olds = new Set(), dirties = [];
        for (const eff of [0, 4, 6]) {
          const buf = await sharp(Buffer.from(x.im.data),
            { raw: { width: x.im.width, height: x.im.height, channels: 4 } })
            .webp({ lossless: true, effort: eff }).toBuffer();
          const im = require('@cwasm/webp').decode(buf);
          news.add(A.pixelHashOf(im.width, im.height, im.data));
          olds.add(rawHash(im));
          dirties.push(A.alphaStats(im.data).dirty);          // 인코더가 투명 아래를 얼마나 채웠나
        }
        rows.push({ rel: x.rel, news: news.size, olds: olds.size, dirty: dirties });
      }
      // ★계약은 **새 자가 하나**인 것이다. 옛 자가 몇 종인지는 **그림마다 다르다** — 그것을 수로 적는다.
      ok(rows.every((r) => r.news === 1),
         `ⓐ ★무손실 재압축 effort 0/4/6 — **새 자는 어느 표본에서도 해시 하나**`,
         rows.map((r) => `${r.rel} 새 ${r.news}종`).join(' · '));
      // ★자명 통과 금지 — 옛 자가 **어디선가는 갈라져야** 이 절이 무언가를 재고 있는 것이다.
      ok(rows.some((r) => r.olds > 1),
         `ⓐ-2 ★대조 — 옛 자는 **적어도 한 표본에서 갈라진다**(안 갈라지면 이 절은 자명 통과다)`,
         rows.map((r) => `${r.rel} 옛 ${r.olds}종 · 투명아래 채운 화소 [${r.dirty.join(' ')}]`).join(' · '));
      // ★그리고 **왜 그림마다 다른지**를 수로 남긴다: effort 0 은 투명 아래를 비우고, 4·6 은 **압축에 이롭게 채운다**.
      console.log('     · 읽히는 것 — 옛 자가 무는 것은 **인코더가 채울 게 있을 때**다:');
      for (const r of rows) console.log(`       ${r.rel.padEnd(34)} effort 0/4/6 이 투명 아래에 채운 화소 ${r.dirty.join(' / ')}`);
      finish();
    })();
  }
}
