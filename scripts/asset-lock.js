#!/usr/bin/env node
// === 자산 잠금 자 — 정본 하나 [T257 2026-09-13] =====================================
//
// ★★이 파일이 **자**다. 검사기도 기록기도 여기 함수를 부른다 — 자를 두 벌 적으면 그 순간 실패다
//   (T243 1차 판이 `icons.lock` 의 자를 char 시트에 들이대고 192장 전부 거짓 빨강을 봤다).
//
// ── 왜 화소 해시인가 [T246 실측] ──────────────────────────────────────────────────
//   종전 자는 **sha1(IDAT)** 이었다. IDAT 는 그림이 아니라 **압축된 바이트**다.
//   같은 화소를 압축 수준만 바꿔 다시 인코딩하니:
//       lvl 6 → 6f841957d4976a6b   lvl 9 → 1dfe38bd9a9f7bf3   lvl 1 → f288777463ce446b
//       화소 해시는 셋 다 10de3585a617dbcc (화소 동일 True)
//   ⇒ zlib 판이나 PNG 라이터가 바뀌면 잠금 364장이 **그림은 그대로인 채** 통째로 빨개진다.
//   화소 해시는 그 반대다: 압축이 바뀌어도 안 물고, 그림이 바뀌면 문다. 그게 잠금이 하려던 일이다.
//
// ── 자 ────────────────────────────────────────────────────────────────────────
//   PNG  : sha1("<w>x<h>|" + 디코드한 RGBA 바이트) 앞 16자      ← `pixel` (pngjs 로 디코드 · 재구현 0)
//   webp : sha1("<w>x<h>|" + 디코드한 RGBA 바이트) 앞 16자      ← `pixel` (@cwasm/webp · [T303] · 아래 ⚠)
//
//   ★[T303 · #32 ⓐ] **webp 도 화소 해시가 됐다.** T260 이 디코더 넷을 재서 `@cwasm/webp` 를 권했고
//     (wasm · MIT · 168KB · `npm ci` **+0.0s**) 그때 못 켠 이유는 "저장소에 디코더가 없다" 하나였다.
//     `devDependencies` 에 한 줄 넣었고 `test-icons` 는 여전히 `npm ci` 만으로 돈다.
//
// 쓰임:
//   const L = require('./asset-lock.js');
//   L.lockValue(p)        → { hash, ruler }        한 장
//   L.groups()            → { grp: {dir, ext} }    잠금표가 덮는 무리(디렉터리 이름 = 무리 이름)
//   node scripts/asset-lock.js --check             지금 배포판 ↔ 잠금표 대조(빨강만 찍는다)
//   node scripts/asset-lock.js --write             지금 배포판에서 잠금표 **재생성**(값만 · 메타 보존)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const AST = path.join(ROOT, 'public', 'assets');
const LOCK = path.join(AST, 'icons.lock.json');
const CUT = 16;                                   // 잠금표에 적는 앞자리 수 — 종전과 같다

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');

// ★★[T260] **굽는 상자 표식** — `render_common.bake_box()` 와 **같은 꼴**이다(자가 하나이듯 표식도 하나).
//   왜: 같은 커밋·같은 스크립트·같은 bpy 인데 그림이 달랐다(T243 `b8a8e18f` ↔ T257 `0eba77eb`).
//   판 안에서는 결정적이고 스레드 탓도 아니다 — 갈리는 건 상자와 상자 사이인데, T243 때 상자를
//   **안 남겨서** 이제 와선 못 가른다. 그래서 다음부터는 남긴다.
//   ⚠여기 적히는 상자는 **이 표를 다시 쓴 상자**이지 그림을 구운 상자가 아니다. 이름을 그렇게 붙였다.
function bakeBox() {
  const os = require('os');
  let cpu = '', simd = [];
  try {
    const info = fs.readFileSync('/proc/cpuinfo', 'utf8');
    cpu = (info.match(/^model name\s*:\s*(.+)$/m) || [, ''])[1].trim();
    const flags = new Set(((info.match(/^flags\s*:\s*(.+)$/m) || [, ''])[1] || '').split(/\s+/));
    simd = ['fma', 'avx', 'avx2', 'avx512f', 'avx512dq', 'avx512bw', 'avx512vl', 'avx512_vnni']
      .filter((f) => flags.has(f));
  } catch (e) { /* /proc 없는 상자 — 아래로 떨어진다 */ }
  if (!cpu) { try { cpu = (os.cpus()[0] || {}).model || os.arch(); } catch (e) { cpu = '?'; } }
  let commit = '?';
  try {
    commit = require('child_process').execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', 'HEAD'],
      { encoding: 'utf8', timeout: 5000 }).trim() || '?';
  } catch (e) { /* git 없는 자리 */ }
  return { cpu, threads: os.cpus().length, simd: simd.join(' ') || '?',
           node: process.version, commit };
}
const bakeBoxLine = (b) => { b = b || bakeBox();
  return `[box] cpu=${b.cpu} · threads=${b.threads} · simd=${b.simd} · node=${b.node} · commit=${b.commit}`; };

// ★화소 해시 — 디코드한 RGBA + 크기. 크기를 같이 넣는 이유: 같은 화소열이라도
//   68×38 과 38×68 은 **다른 그림**이다(전치는 바이트만으로는 안 걸린다).
/** ★[T308] 화소 해시의 알맹이 — **경로가 아니라 화소**를 받는다(하네스가 파일 없이 반례를 먹일 수 있게).
 *  자는 여기 **한 자리**뿐이고 PNG·webp 가 같은 함수를 쓴다(사본 0).
 *
 *  ★**완전투명 아래 RGB 는 0 으로 놓고 잰다.** 잠금의 뜻은 "**보이는 그림**이 바뀌었나"인데,
 *  `a === 0` 인 화소의 RGB 는 화면에 한 점도 기여하지 않고 **인코더가 제 맘대로 고쳐 쓴다**
 *  (webp 의 alpha cleaning). T303 실측: 같은 RGBA 를 무손실 `effort` 0/4/6 으로 다시 구우면
 *  화소 해시가 셋 다 달랐고(전체 기준 85,602~93,237화소 차이), **투명을 빼고 견주면 다른 화소 0** 이었다.
 *  ⇒ 그 자리에 반응하면 재압축마다 **거짓 빨강**이 난다. T246 의 "IDAT 는 압축기를 잰다"와 같은 줄이다.
 *  ⚠**반투명(`0 < a < 255`)은 안 만진다** — 그건 보인다. 건드리는 것은 `a === 0` 하나뿐이다. */
function pixelHashOf(width, height, data) {
  const px = Buffer.from(data);                      // 원본 버퍼를 안 고친다(부르는 쪽이 다시 쓴다)
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] === 0) { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; }
  }
  return sha1(Buffer.concat([Buffer.from(`${width}x${height}|`), px])).slice(0, CUT);
}
/** 화소 수를 세어 준다 — 반례 하네스가 "이 표본에 투명이 실제로 있나"를 먼저 보고 자명 통과를 막는다. */
function alphaStats(data) {
  let clear = 0, semi = 0, dirty = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    n++; const a = data[i + 3];
    if (a === 0) { clear++; if (data[i] || data[i + 1] || data[i + 2]) dirty++; }
    else if (a < 255) semi++;
  }
  return { n, clear, semi, dirty };
}
function decodeImage(p) {
  const buf = fs.readFileSync(p);
  return /\.webp$/i.test(p) ? require('@cwasm/webp').decode(buf)   // [T303 · #32 ⓐ]
                             : require('pngjs').PNG.sync.read(buf);
}
function pixelHash(p) {
  const im = decodeImage(p);
  return pixelHashOf(im.width, im.height, im.data);
}
const fileHash = (p) => sha1(fs.readFileSync(p)).slice(0, CUT);

// ★[T303 · #32 ⓐ 재민 위임 → PM] **webp 도 화소 해시다.** T260 이 디코더 넷을 재서 `@cwasm/webp` 를 권했고
//   (wasm · MIT · 168KB · `npm ci` +0.0s · 오프라인) 다른 디코더(`sharp`/libvips)와 **88장 중 88장 일치**였다.
//   그때 못 켠 이유는 "이 저장소에 webp 디코더가 없다" 하나뿐이었다 — 이제 있다.
//   남은 파일 자(ogg·m4a)는 **그대로 둔다**: 오디오는 디코드해서 잴 것이 아니다(손실 부호화라 판마다 다르다).
//
//   ⚠**그런데 webp 화소 해시는 PNG 것만큼 압축기에 둔하지 않다 — 쟀다 [T303].** 같은 RGBA 를
//   `effort` 0/4/6 으로 무손실 재압축하면 **화소 해시가 셋 다 다르다.** 원인은 **완전투명 화소 아래의 RGB** 다:
//   보이지 않으므로 인코더가 제 맘대로 고쳐 쓴다(webp 의 alpha cleaning). 실측 `mt_F0v0`(933×562):
//   완전투명이 **50.7%** 이고, 그 화소를 빼고 견주면 세 판이 **다른 화소 0** 이다(전체 기준으론 85,602~93,237).
//   ⇒ 이 자는 "배포된 파일의 화소가 움직였나"는 정확히 잡지만, PNG 자처럼 "압축기를 갈아도 같다"까지는 아니다.
//   고치려면 **투명 아래 RGB 를 0 으로 정규화**하면 되는데, 그러면 PNG 쪽도 같이 움직인다
//   (실측: PNG 557장 중 **404장**이 투명 아래 RGB ≠ 0 · 698,959화소) ⇒ 전수 재잠금이라 **별 카드**다.
//   이 카드는 "그림 무변"이 규약이라 **자를 한 벌로 두되 정규화는 안 했다.**
const rulerOf = (p) => (/\.(png|webp)$/i.test(p) ? 'pixel' : 'file');
function lockValue(p) {
  const ruler = rulerOf(p);
  return { hash: ruler === 'pixel' ? pixelHash(p) : fileHash(p), ruler };
}

// 무리 = 디렉터리다(표를 손으로 안 적는다). 잠금표의 `_` 아닌 키가 곧 디렉터리 이름이다.
function groups(lock) {
  lock = lock || JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const out = {};
  for (const k of Object.keys(lock)) {
    if (k.startsWith('_') || typeof lock[k] !== 'object') continue;
    const dir = path.join(AST, k);
    if (!fs.existsSync(dir)) continue;
    const exts = [...new Set(fs.readdirSync(dir)
      .filter((f) => ASSET_EXT.test(f)).map((f) => path.extname(f).toLowerCase()))];
    out[k] = { dir, ext: exts.length === 1 ? exts[0] : exts };
  }
  return out;
}
// ★[T266] 소리가 들어왔다 — 잠그는 확장자를 한 곳에 둔다(무리는 디렉터리에서 오고, 자는 `rulerOf` 가 고른다:
//   PNG 만 화소 해시이고 webp·ogg·m4a 는 파일 해시다. 오디오는 그게 맞다 — 고칠 자가 없다).
const ASSET_EXT = /\.(png|webp|ogg|m4a)$/i;
const filesOf = (g) => fs.readdirSync(g.dir).filter((f) => ASSET_EXT.test(f)).sort();
// ★[T266] 키는 **한 파일 하나**여야 한다. 그림은 무리마다 확장자가 하나라 어간이 곧 키다.
//   소리는 **한 소리에 두 파일**(`.ogg`+`.m4a`)이라 어간을 키로 쓰면 둘이 한 칸을 다툰다
//   (실측: 그렇게 두니 기록기는 `.ogg` 를 적고 검사기는 `.m4a` 를 재서 2장이 거짓 빨강이었다).
//   ⇒ 소리만 **파일 이름 그대로** 키로 쓴다.
const keyOf = (f) => (/\.(ogg|m4a)$/i.test(f) ? f : f.replace(ASSET_EXT, ''));

const RULE_LINE =
  '값 = **화소 해시**: PNG 는 sha1("<w>x<h>|" + 디코드한 RGBA) 앞 16자 — 파일도 IDAT 도 아니다. ' +
  'IDAT 는 그림이 아니라 압축기를 잰다(T246: 같은 화소를 lvl 1/6/9 로 다시 인코딩하면 IDAT 해시가 셋, 화소 해시는 하나). ' +
  '★[T303 · #32 ⓐ] webp(산 88장)**도 이제 화소 해시**다 — `@cwasm/webp`(wasm · MIT · 168KB · `npm ci` +0.0s)를 ' +
  'devDependencies 에 넣었고, 다른 디코더(sharp/libvips)와 88장 중 **88장 일치**를 실측했다. ' +
  '⚠단 webp 는 **완전투명 아래 RGB 를 인코더가 고쳐 쓰므로**(실측: 무손실 재압축 세 판이 화소 해시가 다르고, ' +
  '투명을 빼면 다른 화소 0) PNG 자만큼 압축기에 둔하지는 않다 — 정규화는 전수 재잠금이라 별 카드다. ' +
  '자는 `scripts/asset-lock.js` 하나이고 검사기·기록기가 같은 함수를 부른다.';

function check(lock) {
  lock = lock || JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const bad = [], gs = groups(lock);
  let n = 0;
  for (const [grp, g] of Object.entries(gs)) {
    for (const f of filesOf(g)) {
      const key = keyOf(f);
      const want = lock[grp][key];
      if (want === undefined) continue;
      n++;
      const { hash, ruler } = lockValue(path.join(g.dir, f));
      if (hash !== want) bad.push({ grp, key, want, got: hash, ruler });
    }
  }
  return { n, bad };
}

if (require.main === module) {
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  if (process.argv.includes('--write')) {
    const gs = groups(lock);
    let n = 0;
    for (const [grp, g] of Object.entries(gs)) {
      const tbl = {};
      for (const f of filesOf(g)) {
        const key = keyOf(f);
        if (!(key in lock[grp])) continue;                 // ★있던 키만 — 새 키를 몰래 더하지 않는다
        tbl[key] = lockValue(path.join(g.dir, f)).hash; n++;
      }
      for (const k of Object.keys(lock[grp])) if (!(k in tbl)) tbl[k] = lock[grp][k];   // 파일 없는 키는 그대로
      lock[grp] = tbl;
    }
    lock._규약 = RULE_LINE;
    // ★[T260] 이 표를 **다시 쓴 상자**를 같이 남긴다(그림을 구운 상자가 아니다 — 위 주석).
    lock._상자 = { _: '이 잠금표를 마지막으로 다시 쓴 상자. 그림을 구운 상자가 아니다 [T260]. '
                      + '같은 커밋인데 그림이 다르면 굽기 로그의 [box] 줄과 이 칸을 먼저 견준다.',
                   ...bakeBox(), 당시: new Date().toISOString().slice(0, 10) };
    fs.writeFileSync(LOCK, JSON.stringify(lock, null, 1) + '\n');
    console.log(`잠금표 재생성 ${n}장 → ${path.relative(ROOT, LOCK)}`);
    console.log(bakeBoxLine());
  } else {
    const { n, bad } = check(lock);
    console.log(`대조 ${n}장 · 어긋남 ${bad.length}`);
    for (const b of bad.slice(0, 20)) console.log(`  ✗ ${b.grp}/${b.key}  표 ${b.want} ↔ 파일 ${b.got} (${b.ruler})`);
    process.exit(bad.length ? 1 : 0);
  }
}

module.exports = { pixelHash, pixelHashOf, alphaStats, decodeImage, fileHash, lockValue, rulerOf, groups, filesOf, keyOf, check, bakeBox, bakeBoxLine, LOCK, AST, RULE_LINE, CUT };
