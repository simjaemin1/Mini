#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-audio.js — 소리 층 계약 [T261 2026-09-13] ==========================
//
// CI 단위다 — 서버도 브라우저도 안 띄운다(`npm ci` 만으로 돈다 · 공통 §2 ⑥).
//
// 계약:
//   ① **키 표가 곧 정본** — `public/assets/sfx/manifest.json` 의 키마다 값이 다 있고(볼륨·반경·반복·
//      동시상한·쿨다운), `file` 이 있으면 그 파일이 디스크에 있고 **크기·길이 상한** 안이며
//      `source` 가 가리키는 출처 칸(라이선스·URL·작성자·받은 날)이 **비어 있지 않다**.
//      ⚠`file: null` 은 **미확보**이고 빨강이 아니다 — 세어서 표로만 낸다.
//        "출처 없는 소리 0" 은 *나는* 소리에 걸린 규약이다. 안 나는 키를 빨갛게 하면
//        음원이 들어오기 전엔 CI 가 계속 빨간데, 그건 결함이 아니라 **순서**다(족보: test-assets-audit ③).
//   ② **13곡 표 ↔ 디스크** — `render-meta.json` 의 `tracks` 수가 표가 말하는 수와 같고,
//      곡마다 `.ogg` + `.m4a` 가 둘 다 있고, 디스크에만 있는 곡이 없다(양방향).
//   ③ **훅 전수** — 클라가 부르는 키가 전부 표에 있고(없는 키 0), 표의 키가 전부 불린다(고아 키 0).
//      훅은 **파일당 한 줄**이다(남의 영역에 로직을 안 흘린다 — T261 영역 규약).
//   ④ **제스처 전에 `AudioContext` 를 안 만든다** — 정적 검사. `new AC(...)` 는 `sfxWake` 안에만 있고,
//      `48-a-audio.js` 에 **최상위 실행문이 0** 이다(파일이 실려도 아무 일이 안 난다).
//   ⑤ **자 자신을 먼저 검증한다** — 길이 자(ogg granule)를 BGM 13곡으로 대조한다. 레포가 ffmpeg 로 직접 잰
//      단 하나의 값(`village_day_trad 108.28s`)을 맞혀야 한다. ⚠`render-meta.json` 의 `seconds` 에는 대지 마라 —
//      그 표는 배포 ogg 가 아니라 합성기의 float 배열을 잰 값이고, 1차 판이 거기에 대고 없는 결함 9건을 봤다.
//
//   ⑦ **[T283] 표 셋이 정본이다** — `resourceHit`·`mobs`·`buildings` 의 값이 전부 매니페스트 키이고,
//      **발신 자리에 소리 훅이 0** 이며(`sendPrimary` 안에 `__sfx` 가 없다 — 정적),
//      `eat` 이 기대는 서버의 성질(`gauges` 중 `carry` 를 싣는 자리가 **정확히 하나**)이 아직 참이다.
//      ⚠마지막 것은 이 하네스가 **서버 소스를 읽는** 유일한 자리다. 클라가 서버의 어떤 성질에
//      기대고 있으면, 그 성질이 깨지는 날 **소리가 조용히 틀려진다** — 조용한 것은 하네스가 막는다.
//
// 자명 통과 금지(⑥): 키 하나를 빼고 · 없는 키를 부르고 · `new AC()` 를 최상위로 올린
//   픽스처 셋을 만들어 ①③④가 **무는지** 본다. 그리고 대조 — 멀쩡한 픽스처는 통과한다.
//
// 실행: node scripts/test-audio.js
'use strict';
const fs = require('fs');
const path = require('path');
const acorn = require(path.join(__dirname, '..', 'node_modules', 'acorn'));

const ROOT = path.resolve(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const SFX_DIR = path.join(PUB, 'assets', 'sfx');
const MAN_PATH = path.join(SFX_DIR, 'manifest.json');
const BGM_DIR = path.join(PUB, 'assets', 'audio', 'bgm');
const META_PATH = path.join(BGM_DIR, 'render-meta.json');
const MOD_REL = 'client/48-a-audio.js';

let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };

// ── 길이 자 — ogg granule ─────────────────────────────────────────────────────
//   ★자를 두 벌 적지 않으려고 여기 **하나**만 둔다. Vorbis/Opus 공통: 마지막 OggS 페이지의
//   granulepos ÷ 표본율. 표본율은 첫 페이지의 식별 헤더에서 읽는다(Opus 는 항상 48000 눈금).
function oggSeconds(buf) {
  if (buf.length < 32 || buf.toString('ascii', 0, 4) !== 'OggS') return null;
  let rate = null;
  // 첫 몇 페이지 안에 식별 헤더가 있다
  for (let i = 0; i < Math.min(buf.length - 64, 65536); i++) {
    if (buf.toString('ascii', i, i + 7) === '\x01vorbis') { rate = buf.readUInt32LE(i + 12); break; }
    if (buf.toString('ascii', i, i + 8) === 'OpusHead') { rate = 48000; break; }
  }
  if (!rate) return null;
  // 마지막 OggS 페이지를 뒤에서 찾는다
  for (let i = buf.length - 27; i >= 0; i--) {
    if (buf[i] === 0x4f && buf[i + 1] === 0x67 && buf[i + 2] === 0x67 && buf[i + 3] === 0x53) {
      const lo = buf.readUInt32LE(i + 6), hi = buf.readUInt32LE(i + 10);
      const g = hi * 4294967296 + lo;
      if (!Number.isFinite(g) || g <= 0) continue;
      return g / rate;
    }
  }
  return null;
}

// ── AST 도우미 ────────────────────────────────────────────────────────────────
function parse(code) {
  return acorn.parse(code, { ecmaVersion: 2023, sourceType: 'script', locations: true, allowReturnOutsideFunction: true });
}
function walk(n, fn, fnName) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { n.forEach((x) => walk(x, fn, fnName)); return; }
  let inner = fnName;
  if (n.type === 'FunctionDeclaration' && n.id) inner = n.id.name;
  fn(n, fnName);
  for (const k of Object.keys(n)) { if (k === 'loc' || k === 'range') continue; walk(n[k], fn, inner); }
}
const lit = (a) => (a && a.type === 'Literal' && typeof a.value === 'string') ? a.value : null;

/** 소리 층 소스에서 **키 자리**의 문자열만 모은다(아무 문자열이나 줍지 않는다). */
function keysUsedInModule(code) {
  const ast = parse(code), used = new Set();
  walk(ast, (n, inFn) => {
    if (n.type === 'CallExpression' && n.callee) {
      const name = n.callee.type === 'Identifier' ? n.callee.name : null;
      if (name === 'sfxPlay' || name === 'sfxKey' || name === 'sfxBuffer') { const v = lit(n.arguments[0]); if (v) used.add(v); }
      if (name === 'sfxLoop') { const v = lit(n.arguments[1]); if (v) used.add(v); }
    }
    // 발밑 지형이 고르는 키 — 그 함수 안의 문자열 리터럴이 곧 키다
    if (inFn === 'sfxGroundKey' && n.type === 'Literal' && typeof n.value === 'string' && /^[a-z][a-z0-9_]*$/.test(n.value)
        && n.value.indexOf('step_') === 0) used.add(n.value);
  });
  return used;
}
/** 훅 파일에서 `__sfx.play('k')`·`__sfx.ambient('k', …)` 의 키를 모으고, 파일당 훅 줄 수를 센다. */
function hooksInFile(code) {
  const ast = parse(code), keys = new Set(), lines = new Set();
  walk(ast, (n) => {
    if (n.type !== 'MemberExpression' || n.computed) return;
    if (!n.object || n.object.type !== 'MemberExpression' || n.object.computed) return;
    if (!n.object.object || n.object.object.type !== 'Identifier' || n.object.object.name !== 'window') return;
    if (!n.object.property || n.object.property.name !== '__sfx') return;
    if (n.loc) lines.add(n.loc.start.line);
  });
  walk(ast, (n) => {
    if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'MemberExpression') return;
    const p = n.callee.property && n.callee.property.name;
    const o = n.callee.object;
    const isSfx = o && ((o.type === 'Identifier' && o.name === '__sfx')
      || (o.type === 'MemberExpression' && o.property && o.property.name === '__sfx'));
    if (!isSfx) return;
    if (p === 'play' || p === 'ambient') { const v = lit(n.arguments[0]); if (v) keys.add(v); }
  });
  return { keys, lines: [...lines].sort((a, b) => a - b) };
}
const registeredScripts = (html) => [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"[^>]*>/g)].map((m) => m[1].split('?')[0]);

// ═══════════════════════════════════════════════════════════════════════════════
console.log('\n=== 소리 층 계약 (T261) ===');

const man = JSON.parse(fs.readFileSync(MAN_PATH, 'utf8'));
const KEYS = man.keys || {};
// ★[T283] `_` 로 시작하는 것은 **키가 아니라 주석**이다 — 표 안에 규약을 적는 이 집의 문법이고,
//   T272 가 잠금표에서 같은 것을 배웠다("잠금표 `_` 키는 자산이 아니다"). 같은 줄을 여기도 긋는다.
const keyNames = Object.keys(KEYS).filter((k) => !k.startsWith('_'));
const html = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
const scripts = registeredScripts(html);
const modCode = fs.readFileSync(path.join(PUB, MOD_REL), 'utf8');

console.log('\n⓪ 검사 상황 — 무엇을 재고 있나(0 이면 아래가 자명 통과다)');
ok(keyNames.length >= 18, `키 표에 키 ${keyNames.length}개 (밑줄 주석 항목은 뺐다)`, keyNames.join(' '));
ok(scripts.includes(MOD_REL), `index.html 이 소리 층을 싣는다`, MOD_REL);
ok(scripts.some((s) => /bgm\.js$/.test(s)), 'index.html 이 BGM 엔진을 싣는다(재구현 0 — 있는 것을 부른다)',
   scripts.filter((s) => /bgm\.js$/.test(s)).join(' '));

// ── ① 키 표 ────────────────────────────────────────────────────────────────────
console.log('\n① 키 표 — 값이 다 있고, 파일이 있으면 상한 안이며 출처가 채워져 있다');
const NUM = ['volume', 'radius', 'maxSame', 'cooldownMs'];
const badVal = keyNames.filter((k) => NUM.some((f) => typeof KEYS[k][f] !== 'number') || typeof KEYS[k].loop !== 'boolean'
  || !('file' in KEYS[k]) || !('source' in KEYS[k]));
ok(badVal.length === 0, `값이 빠진 키 ${badVal.length}개 (볼륨·반경·반복·동시상한·쿨다운·파일·출처)`,
   badVal.join(' ') || `${keyNames.length}종 전부 완비`);
ok(keyNames.every((k) => KEYS[k].volume >= 0 && KEYS[k].volume <= 1), '볼륨이 전부 0..1');
ok(keyNames.every((k) => KEYS[k].radius >= 0), '반경이 전부 0 이상(0 = 위치 없는 소리)');
ok(['linear', 'inverse_square'].includes(man.attenuation), `감쇠 식을 하나 골랐다`, man.attenuation);

const LIM = { bytes: 150 * 1024, oneShotSec: 3, loopSec: 10 };
const haveFile = keyNames.filter((k) => KEYS[k].file);
const noFile = keyNames.filter((k) => !KEYS[k].file);
// ★한 소리에 **두 파일**이다(`.ogg` + `.m4a` — 사파리가 Ogg Vorbis 를 못 튼다). 둘 다 잰다.
//   그리고 표가 **파일 이름을 그대로** 적어야 `test-assets-audit` 의 고아가 풀린다(T266: 소리는 어간 대조에서 빠졌다).
const filesOfKey = (k) => [KEYS[k].file, KEYS[k].fileAlt].filter(Boolean);
const noAlt = haveFile.filter((k) => !KEYS[k].fileAlt);
ok(noAlt.length === 0, `\`.m4a\` 짝이 없는 키 ${noAlt.length}개 (사파리에서 무음이 된다)`, noAlt.join(' '));
const badName = haveFile.filter((k) => filesOfKey(k).some((f) => !/\.(ogg|m4a)$/.test(f)));
ok(badName.length === 0, `표가 **파일 이름 그대로**(확장자 포함)를 적는다 — 어긋난 키 ${badName.length}개`, badName.join(' '));
const missOnDisk = haveFile.flatMap((k) => filesOfKey(k).filter((f) => !fs.existsSync(path.join(SFX_DIR, f))));
ok(missOnDisk.length === 0, `표가 가리키는데 디스크에 없는 파일 ${missOnDisk.length}개`, missOnDisk.join(' '));
const tooBig = [], tooLong = [];
for (const k of haveFile) {
  for (const f of filesOfKey(k)) {
    const p = path.join(SFX_DIR, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    if (buf.length > LIM.bytes) tooBig.push(`${f}(${Math.round(buf.length / 1024)}KB)`);
    const sec = oggSeconds(buf);                      // ogg 만 잰다(m4a 는 이 자의 대상이 아니다)
    const cap = KEYS[k].loop ? LIM.loopSec : LIM.oneShotSec;
    if (sec != null && sec > cap) tooLong.push(`${f}(${sec.toFixed(3)}s>${cap})`);
  }
}
ok(tooBig.length === 0, `크기 상한(${LIM.bytes / 1024}KB) 넘은 파일 ${tooBig.length}개`, tooBig.join(' '));
ok(tooLong.length === 0, `길이 상한(단발 ${LIM.oneShotSec}s · 반복 ${LIM.loopSec}s) 넘은 파일 ${tooLong.length}개`, tooLong.join(' '));
// ★실측 길이를 표로 남긴다 — `인계/ART-자산.md` §1-b-3 이 적은 수와 같아야 한다(두 자가 어긋나면 사람이 본다).
for (const k of haveFile) {
  const p = path.join(SFX_DIR, KEYS[k].file);
  if (!fs.existsSync(p)) continue;
  const sec = oggSeconds(fs.readFileSync(p));
  console.log(`     · ${k.padEnd(12)} ${KEYS[k].loop ? '반복' : '단발'} ${(sec == null ? '?' : sec.toFixed(3) + 's').padStart(8)}`
    + ` · ${filesOfKey(k).map((f) => `${f} ${fs.statSync(path.join(SFX_DIR, f)).size}B`).join(' / ')}`);
}
const SRC = man.sources || {};
const SRC_COLS = ['license', 'url', 'author', 'received'];
const badSrc = haveFile.filter((k) => {
  const s = KEYS[k].source && SRC[KEYS[k].source];
  return !s || SRC_COLS.some((c) => !s[c]);
});
ok(badSrc.length === 0, `파일이 있는데 출처 칸이 빈 키 ${badSrc.length}개 (출처 없는 소리 0)`, badSrc.join(' '));
console.log(`     · 미확보(무음 · 빨강 아님): ${noFile.length}개 — ${noFile.join(' ') || '없음'}`);
console.log(`     · 확보:               ${haveFile.length}개 — ${haveFile.join(' ') || '없음'}`);

// ── ② 13곡 표 ↔ 디스크 ────────────────────────────────────────────────────────
console.log('\n② BGM — 표와 디스크가 맞는다(양방향)');
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));
const tracks = Object.keys(meta.tracks || {});
const want = (man.bgm && man.bgm.trackCount) || 0;
ok(tracks.length === want, `표의 곡 수 ${tracks.length} = 키 표가 말하는 수 ${want}`);
const noPair = tracks.filter((t) => !fs.existsSync(path.join(BGM_DIR, t + '.ogg')) || !fs.existsSync(path.join(BGM_DIR, t + '.m4a')));
ok(noPair.length === 0, `.ogg+.m4a 쌍이 없는 곡 ${noPair.length}개`, noPair.join(' '));
const onDisk = [...new Set(fs.readdirSync(BGM_DIR).filter((f) => /\.(ogg|m4a)$/.test(f)).map((f) => f.replace(/\.(ogg|m4a)$/, '')))];
const extra = onDisk.filter((t) => !tracks.includes(t));
ok(extra.length === 0, `디스크에만 있고 표에 없는 곡 ${extra.length}개 (f75e8158 이 낸 그 결함 — T246 발견 · T257 수습)`, extra.join(' '));

// ── ③ 훅 전수 ─────────────────────────────────────────────────────────────────
console.log('\n③ 훅 — 부르는 키가 전부 표에 있고, 표의 키가 전부 불린다 · 훅은 파일당 한 줄');
// ★[T283] 키가 불리는 길이 **둘**이 됐다: 코드가 이름을 적는 자리와, **표 셋이 이름을 보내는** 자리.
//   둘 다 세지 않으면 "아무도 안 부르는 키"가 거짓 빨강이 된다(1차 판이 실제로 12개를 그렇게 봤다).
const TABLES = ['resourceHit', 'mobs', 'buildings', 'fishState'];
function tableKeys() {
  const out = new Set();
  for (const t of TABLES) for (const [k, v] of Object.entries(man[t] || {})) {
    if (k.startsWith('_')) continue;
    if (typeof v === 'string') out.add(v);
  }
  return out;
}
const used = keysUsedInModule(modCode);
for (const k of hooksInFile(modCode).keys) used.add(k);   // 층 자신이 `__sfx.ambient('rain'…)` 로 부르는 자리
for (const k of tableKeys()) used.add(k);
const hookFiles = [];
for (const s of scripts) {
  if (s === MOD_REL) continue;
  const p = path.join(PUB, s);
  if (!fs.existsSync(p)) continue;
  const h = hooksInFile(fs.readFileSync(p, 'utf8'));
  for (const k of h.keys) used.add(k);
  if (h.lines.length) hookFiles.push({ f: s, lines: h.lines });
}
ok(hookFiles.length > 0, `훅이 실제로 걸려 있다 — ${hookFiles.length}개 파일`,
   hookFiles.map((h) => `${h.f}:${h.lines.join(',')}`).join(' · '));
const fat = hookFiles.filter((h) => h.lines.length > 1);
ok(fat.length === 0, `훅이 두 줄 이상인 파일 ${fat.length}개 (남의 영역엔 줄 하나 · 로직 0)`,
   fat.map((h) => `${h.f}(${h.lines.length})`).join(' '));
const unknown = [...used].filter((k) => !KEYS[k]);
ok(unknown.length === 0, `표에 없는 키를 부르는 자리 ${unknown.length}개`, unknown.join(' '));
const orphan = keyNames.filter((k) => !used.has(k));
ok(orphan.length === 0, `아무도 안 부르는 키 ${orphan.length}개`, orphan.join(' ') || `${keyNames.length}종 전부 불린다`);

// ── ④ 제스처 전 AudioContext 0 ────────────────────────────────────────────────
console.log('\n④ `AudioContext` 를 첫 제스처 전에 만들지 않는다(정적)');
function acAudit(code) {
  const ast = parse(code);
  const bad = [], top = [];
  for (const st of ast.body) if (st.type === 'ExpressionStatement') top.push(st.loc.start.line);
  walk(ast, (n, inFn) => {
    if (n.type !== 'NewExpression') return;
    const c = n.callee;
    const name = c && (c.type === 'Identifier' ? c.name : (c.property && c.property.name));
    if (!name || !/^(AC|AudioContext|webkitAudioContext)$/.test(name)) return;
    if (inFn !== 'sfxWake') bad.push(`${name}@${inFn || '최상위'}:${n.loc.start.line}`);
  });
  return { bad, top };
}
{
  const a = acAudit(modCode);
  ok(a.bad.length === 0, `\`sfxWake\`(첫 제스처) 밖에서 만드는 자리 ${a.bad.length}개`, a.bad.join(' '));
  ok(a.top.length === 0, `소리 층의 최상위 실행문 ${a.top.length}개 — 실려도 아무 일이 안 난다`, a.top.join(','));
  ok(/addEventListener\('pointerdown'/.test(modCode) && /addEventListener\('keydown'/.test(modCode),
     '제스처 리스너가 실제로 걸린다(안 걸면 영영 안 깨어난다)');
  ok(/canPlayType/.test(modCode),
     '★형식을 브라우저에게 **물어보고** 고른다(사파리는 Ogg Vorbis 를 못 튼다 — 짐작으로 고르면 거기서만 무음이다)');
}

// ── ⑤ 자 자신 검증 — 길이 자를 이미 있는 13곡으로 댄다 ────────────────────────
console.log('\n⑤ ★길이 자(ogg granule)를 먼저 검증한다 — 자가 틀리면 없는 결함을 본다');
{
  const got = [];
  for (const t of tracks) {
    const p = path.join(BGM_DIR, t + '.ogg');
    if (!fs.existsSync(p)) continue;
    const s = oggSeconds(fs.readFileSync(p));
    if (s != null) got.push({ t, s });
  }
  ok(got.length === tracks.length, `13곡 전부에서 길이가 나왔다 ${got.length}/${tracks.length}`);
  const sane = got.filter((g) => g.s > 60 && g.s < 180);
  ok(sane.length === got.length, `길이가 전부 60~180초 — 표의 seconds 와 같은 눈이다`,
     got.slice(0, 3).map((g) => `${g.t} ${g.s.toFixed(2)}s`).join(' · '));
  // ★★자를 **표에 대지 않는다.** `render-meta.json` 의 `seconds` 는 배포된 ogg 에서 잰 값이 아니라
  //   `compose.py:676` 이 합성한 float 배열에서 잰 값이고, 레포가 이미 *"12곡 전부 안 맞는다"* 고
  //   적어 뒀다(`_T257` 주석). 그 표에 자를 대면 **없는 결함**을 본다(족보: 자를 먼저 검증해라).
  //   ⇒ 대신 레포가 **ffmpeg 로 직접 잰 단 하나의 값**에 댄다: village_day_trad = 108.28초.
  //      이 자가 그 수를 맞히면 자는 옳고, 표가 ogg 를 안 재고 있다는 그 주석도 같이 확인된다.
  const anchor = got.find((g) => g.t === 'village_day_trad');
  ok(anchor && Math.abs(anchor.s - 108.28) <= 0.05,
     '★자 대조 — village_day_trad 가 레포의 ffmpeg 실측 108.28초와 같다(`_T257` 주석)',
     anchor ? anchor.s.toFixed(2) + 's' : '없음');
  // ★대조 — 자가 상수를 내지 않는다(곡마다 다른 값이 나온다).
  const distinct = new Set(got.map((g) => g.s.toFixed(2)));
  ok(distinct.size >= 3, `★대조 — 자가 한 값만 내지 않는다: 서로 다른 길이 ${distinct.size}종`,
     [...distinct].sort().join(' '));
  // ★[T261 실측] 장면이 같으면 길이가 **같다**(같은 마디를 편성만 바꿔 굽는다) — 표의 수는 그렇지 않다.
  console.log('     · 실측 길이(초): ' + got.map((g) => `${g.t} ${g.s.toFixed(2)}`).join(' · '));
}

// ── ⑥ 자명 통과 금지 — 일부러 깨뜨린다 · 그리고 대조 ──────────────────────────
console.log('\n⑥ ★이 하네스가 실패할 줄 아는가 — 픽스처로 일부러 깨뜨린다');
{
  // ⓐ 키 하나를 빼면 ③의 "표에 없는 키" 가 문다
  const K2 = Object.assign({}, KEYS); delete K2.wind;
  ok([...used].filter((k) => !K2[k]).length === 1, 'ⓐ 키 하나(wind)를 표에서 빼면 ③이 문다');
  // ⓐ-2 ★[T283] **표 셋이 키를 보낸다는 것**도 자명 통과 금지: `mobs` 를 비우면 야생 넷이 고아가 된다
  {
    const savedMobs = man.mobs; man.mobs = {};
    const u2 = new Set([...keysUsedInModule(modCode), ...hooksInFile(modCode).keys, ...tableKeys()]);
    man.mobs = savedMobs;
    const orphan2 = keyNames.filter((k) => !u2.has(k));
    ok(orphan2.length === 4 && orphan2.every((k) => /_(growl|grunt|call)$/.test(k)),
       'ⓐ-2 ★`mobs` 표를 비우면 야생 넷이 **고아로 잡힌다**(표가 곧 배선이라는 증거)', orphan2.join(' '));
  }
  // ⓑ 없는 키를 부르면 문다
  const u2 = hooksInFile("window.__sfx && window.__sfx.play('없는키');");
  ok([...u2.keys].filter((k) => !KEYS[k]).length === 1, 'ⓑ 표에 없는 키를 부르는 자리를 ③이 잡는다');
  // ⓒ `new AudioContext()` 를 최상위로 올리면 ④가 문다
  const a2 = acAudit('const AC = window.AudioContext;\nconst c = new AC();\n');
  ok(a2.bad.length === 1 && a2.top.length === 0, 'ⓒ 제스처 밖 `new AC()` 를 ④가 잡는다', a2.bad.join(' '));
  const a3 = acAudit('function sfxWake() { const c = new AudioContext(); }\nfoo();\n');
  ok(a3.bad.length === 0 && a3.top.length === 1, 'ⓓ `sfxWake` 안은 안 물고, 최상위 실행문은 따로 잡는다');
  // ⓔ 대조 — 멀쩡한 픽스처는 통과한다(항상 실패하는 하네스가 아니다)
  const u3 = hooksInFile("window.__sfx && window.__sfx.ambient('wind', 0.5, {});");
  ok([...u3.keys].length === 1 && KEYS[[...u3.keys][0]], 'ⓔ ★대조 — 표에 있는 키를 부르면 안 문다');
  // ⓕ 대조 — 길이 자가 ogg 가 아닌 바이트엔 null 을 낸다(아무 수나 짓지 않는다)
  ok(oggSeconds(Buffer.from('this is not an ogg file at all, not even close!!')) === null,
     'ⓕ ★대조 — ogg 가 아니면 길이 자가 `null` 이다(수를 지어내지 않는다)');
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑦ ★[T283] 표가 정본인가 · 발신 자리에 소리가 없는가 · 서버의 그 성질이 아직 참인가
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑦ ★[T283] 표 셋 · 발신 훅 0 · 서버가 기대는 성질');
{
  // ⑦a 표의 값이 전부 실제 키다(오타 한 글자면 그 소리가 영영 안 난다 — 조용한 결함)
  const badTbl = [];
  for (const t of TABLES) for (const [k, v] of Object.entries(man[t] || {})) {
    if (k.startsWith('_')) continue;
    if (typeof v !== 'string' || !KEYS[v]) badTbl.push(`${t}.${k}→${v}`);
  }
  ok(badTbl.length === 0, `⑦a 표 셋의 값이 전부 매니페스트 키다 — 어긋난 줄 ${badTbl.length}개`,
     badTbl.join(' ') || TABLES.map((t) => `${t} ${Object.keys(man[t] || {}).filter((k) => !k.startsWith('_')).length}줄`).join(' · '));

  // ⑦b ★발신 자리에 소리가 0 — T261 의 회부 ①을 되돌아오지 못하게 막는다.
  //    `sendPrimary` 는 **보내는** 함수다. 거기서 소리를 내면 거절당한 동사도 울린다.
  const netCode = fs.readFileSync(path.join(PUB, 'client', '30-n-net.js'), 'utf8');
  //   ★줄 단위로 센다 — `window.__sfx && window.__sfx.recv(…)` 는 한 줄에 `__sfx` 가 둘이다.
  //     개수를 그대로 세면 "훅 하나"가 2 로 읽힌다(1차 판이 그렇게 빨갰다).
  function sfxInsideFn(code, fnName) {
    const ast = parse(code); const hits = new Set();
    walk(ast, (n, inFn) => {
      if (inFn !== fnName) return;
      if (n.type !== 'MemberExpression' || !n.property || n.property.name !== '__sfx') return;
      if (n.loc) hits.add(n.loc.start.line);
    });
    return [...hits].sort((a, b) => a - b);
  }
  const sendHits = sfxInsideFn(netCode, 'sendPrimary');
  ok(sendHits.length === 0, `⑦b ★**발신**(\`sendPrimary\`) 안에 소리 훅 ${sendHits.length}개 — 소리는 수신에서만 난다`,
     sendHits.join(',') || 'T261 회부 ① 닫힘');
  const recvHits = sfxInsideFn(netCode, 'handleMessage');
  ok(recvHits.length === 1, `⑦c ★**수신**(\`handleMessage\`) 안에 소리 훅이 정확히 하나`, recvHits.join(','));
  // ⑦d ★그리고 그 한 줄이 **머리**에 있어야 한다 — `resource_removed` 가 자원을 지우기 전.
  const delLine = (() => {
    const ast = parse(netCode); let line = 0;
    walk(ast, (n) => {
      if (n.type !== 'CallExpression' || !n.callee || n.callee.type !== 'MemberExpression') return;
      if (n.callee.property && n.callee.property.name === 'delete'
          && n.callee.object && n.callee.object.type === 'MemberExpression'
          && n.callee.object.property && n.callee.object.property.name === 'resources') {
        if (!line && n.loc) line = n.loc.start.line;
      }
    });
    return line;
  })();
  ok(delLine > 0 && recvHits.length === 1 && recvHits[0] < delLine,
     '⑦d ★수신 훅이 `c.resources.delete(...)` **위**에 있다(아래면 자원 자리를 못 찾아 위치 없는 소리가 된다)',
     `훅 ${recvHits[0]} < 지움 ${delLine}`);

  // ⑦e ★★서버가 기대는 성질 — `gauges` 아홉 중 `carry` 를 싣는 자리가 **정확히 하나**(= `doEat`).
  //    클라가 서버의 성질에 기대고 있으면, 그 성질이 깨지는 날 **소리가 조용히 틀려진다**.
  //    조용한 것은 하네스가 막는다. (이 하네스가 서버 소스를 읽는 유일한 자리다 — 서버는 안 만진다.)
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const gaugeLines = srv.split('\n').map((l, i) => ({ l, n: i + 1 })).filter((x) => /type:\s*'gauges'/.test(x.l));
  const withCarry = gaugeLines.filter((x) => /\bcarry:/.test(x.l));
  ok(gaugeLines.length >= 5, `⑦e 전제: 서버에 \`gauges\` 를 보내는 자리가 여럿이다`, `${gaugeLines.length}곳`);
  ok(withCarry.length === 1, `⑦f ★★그중 \`carry\` 를 싣는 자리가 **정확히 하나**(= \`doEat\` · 먹기 소리가 그것으로 갈린다)`,
     withCarry.map((x) => 'zone.js:' + x.n).join(' ') || '없다 — 먹기 소리가 영영 안 난다');
  // ⑦g 자명 통과 금지 — 같은 자로 한 줄을 더한 셈 치면 잡는가
  {
    const faked = gaugeLines.concat([{ l: "send(x, { type: 'gauges', carry: 1 })", n: -1 }]).filter((x) => /\bcarry:/.test(x.l));
    ok(faked.length === 2, '⑦g 자명 통과 금지 — `carry` 실은 줄이 하나 더 생기면 ⑦f 가 문다');
  }
  // ⑦h ★실내 배율이 반복 키마다 있다(없으면 실내에서 빗소리가 그대로 난다)
  const loops = keyNames.filter((k) => KEYS[k].loop);
  const noIndoor = loops.filter((k) => typeof KEYS[k].indoorMul !== 'number');
  ok(noIndoor.length === 0, `⑦h 반복 키 ${loops.length}종에 실내 배율이 다 있다 — 빠진 것 ${noIndoor.length}개`, noIndoor.join(' '));
  // ⑦j ★리미터 — 헤드룸 계산이 리미터를 전제한다(T283). 있는지 정적으로 본다.
  ok(/createWaveShaper/.test(modCode) && /oversample/.test(modCode),
     '⑦j ★효과음 버스 끝에 소프트 리미터가 있다(최악 동시 합 3.2 × 0.56 = 1.79 를 0.93 으로 뭉갠다)');
  const noFade = loops.filter((k) => typeof KEYS[k].fade !== 'number');
  ok(noFade.length === 0, `⑦i 반복 키에 페이드(초)가 다 있다 — 빠진 것 ${noFade.length}개`,
     noFade.join(' ') || loops.map((k) => `${k} ${KEYS[k].fade}s/실내×${KEYS[k].indoorMul}`).join(' · '));
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
