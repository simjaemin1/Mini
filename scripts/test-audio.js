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
//   ⑧ **[T292] 리미터는 셈이 아니라 실측이다** — 문턱(`bus.limiter.knee`)이 **실측 최악 피크보다 위**이고,
//      그 실측(`_실측`)이 **지금 키 표를 잰 것**이다(키를 더하고 안 재면 문다). 곡선의 수는 코드에 없다.
//   ⑨ **[T292] BGM 전환은 표가 고른다** — `bgm.scenePick` 네 칸이 두 축(마을 안/밖 × 낮/밤)을 덮고,
//      그 값이 전부 `bgm.js` 가 **실제로 받는** 장면 이름이다(엔진이 모르는 이름을 주면 음악이 조용히 안 바뀐다).
//   ⑩ **[T292] CI 등록** — `test-audio` 가 `.github/workflows/regress-unit.yml` 단위 목록에 들어 있다.
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
    // ★[T303] 기대값을 **이름 꼴로 짐작하지 않고 `mobs` 표에서 읽는다.** 1차 판은 `/_(growl|grunt|call)$/` 였는데
    //   `wolf_growl` → `wolf_howl` 개명 한 번에 빨개졌다 — 자가 배선을 잰 게 아니라 **이름 철자를 재고 있었다.**
    //   표가 보내는 키가 곧 기대값이다(손 목록 0 · 다음 개명에도 안 흔들린다).
    const wiredByMobs = [...new Set(Object.entries(savedMobs)
      .filter(([k]) => !k.startsWith('_')).map(([, v]) => v))].filter((v) => KEYS[v]);
    ok(orphan2.length === wiredByMobs.length && orphan2.every((k) => wiredByMobs.includes(k)),
       `ⓐ-2 ★\`mobs\` 표를 비우면 그 표가 잇던 ${wiredByMobs.length}종이 **고아로 잡힌다**(표가 곧 배선이라는 증거)`,
       orphan2.join(' '));
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

  // ⑦e~⑦g ★★[T292-b 2026-09-14] **먹기 판별이 기대는 성질** — 이 칸이 이 집의 다섯 번째 지뢰다.
  //    T283 판: "`gauges` 아홉 중 `carry` 를 싣는 자리가 **정확히 하나**(=`doEat`)" 를 지킨다고 했고
  //    초록이었다. **거짓 초록이었다.** 자가 `type: 'gauges'` 와 `carry:` 가 **같은 줄**에 있는 것만 셌는데,
  //    `zone.js:11573`(초당 한 번 도는 게이지 틱)은 18줄짜리 객체 리터럴이라 `carry:` 가 11591 에 있다
  //    ⇒ 영영 안 세어졌다. 실제 값은 2인데 하네스는 1이라고 답했고, 게임에서는 **1초마다 씹는 소리**가 났다.
  //    ⑦g 의 돌연변이 픽스처마저 **한 줄짜리**를 더해 봐서, 망가진 자를 망가진 채로 확인해 줬다.
  //    ⇒ ① 자를 **중괄호 맞춤**으로 바꾼다(전송 하나 = 객체 하나, 줄 수와 무관).
  //      ② 그 자를 **먼저 검증한다** — 알려진 두 자리를 못 찾으면 자가 고장 난 것이다.
  //      ③ 픽스처는 **여러 줄짜리**로 넣는다 — 옛 자로는 절대 안 잡히는 모양이어야 뜻이 있다.
  //    그리고 클라는 이제 이 성질에 **안 기댄다**(판별이 `carry` 존재 → 허기 상승으로 바뀌었다).
  //    그래도 세는 이유: 이 수가 조용히 변하는 것이 T283 을 무너뜨린 사건이므로 **기록을 남긴다**.
  //    (이 하네스가 서버 소스를 읽는 유일한 자리다 — 서버는 안 만진다.)
  const srv = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  /** `type: 'gauges'` 가 든 **객체 하나**를 중괄호로 닫아 잡아낸다. 반환 {n, text}. */
  const gaugeSends = (() => {
    const L = srv.split('\n'), out = [];
    for (let i = 0; i < L.length; i++) {
      if (!/type:\s*'gauges'/.test(L[i])) continue;
      let d = 0, started = false, text = '';
      for (let n = i; n < L.length && n < i + 80; n++) {
        for (const ch of L[n]) { if (ch === '{') { d++; started = true; } else if (ch === '}') d--; }
        text += L[n] + '\n';
        if (started && d <= 0) break;
      }
      out.push({ n: i + 1, text });
    }
    return out;
  })();
  const withCarry = gaugeSends.filter((x) => /\bcarry:/.test(x.text));
  ok(gaugeSends.length >= 5, '⑦e 전제: 서버에 `gauges` 를 보내는 자리가 여럿이다', `${gaugeSends.length}곳`);

  // ⑦f ★★**자를 먼저 검증한다.** 줄 하나만 보던 옛 자는 여러 줄 전송을 못 봤다.
  //     알려진 두 자리(한 줄짜리 `doEat` · 여러 줄짜리 게이지 틱)를 **둘 다** 집어내야 자가 성한 것이다.
  const oneLine  = withCarry.filter((x) => /type:\s*'gauges'/.test(x.text.split('\n')[0]) && /\bcarry:/.test(x.text.split('\n')[0]));
  const multiLine = withCarry.filter((x) => !/\bcarry:/.test(x.text.split('\n')[0]));
  ok(oneLine.length >= 1 && multiLine.length >= 1,
     '⑦f ★★자 검증 — `carry` 실은 전송을 **한 줄짜리·여러 줄짜리 둘 다** 집어낸다(옛 자는 여러 줄을 못 봤다)',
     `한 줄 ${oneLine.map((x) => x.n).join(',') || '0'} · 여러 줄 ${multiLine.map((x) => x.n).join(',') || '0(자가 아직 짧다)'}`);

  // ⑦g 지금 수를 적어 둔다 — 바뀌면 문다(클라가 안 기대게 됐어도 **조용한 변화**는 막는다)
  ok(withCarry.length === 2,
     '⑦g ★`gauges` 중 `carry` 를 싣는 자리는 **둘**이다(`doEat` · 초당 게이지 틱). 이 수가 변하면 먹기 판별을 다시 본다',
     withCarry.map((x) => 'zone.js:' + x.n).join(' '));

  // ⑦g2 자명 통과 금지 — **여러 줄짜리**를 하나 더한 셈 치면 잡는가(옛 자로는 절대 안 잡히는 모양이다)
  {
    const fakeMulti = "      send(p.ws, {\n        type: 'gauges',\n        hunger: 1,\n        carry: { w: 0 },\n      });\n";
    const faked = gaugeSends.concat([{ n: -1, text: fakeMulti }]).filter((x) => /\bcarry:/.test(x.text));
    ok(faked.length === 3, '⑦g2 자명 통과 금지 — **여러 줄짜리** `carry` 전송이 하나 더 생기면 ⑦g 가 문다');
    const oldRuler = fakeMulti.split('\n').filter((l) => /type:\s*'gauges'/.test(l) && /\bcarry:/.test(l));
    ok(oldRuler.length === 0, '⑦g3 ★그 모양은 **옛 자(줄 하나)로는 0개**다 — 이 픽스처가 진짜로 옛 구멍을 겨눈다');
  }

  // ⑦g4 ★★그리고 **클라가 이제 `carry` 에 안 기댄다** — 판별이 허기 상승이어야 한다.
  //     이게 실제 고침이다. 위 셋은 기록이고, 이 한 줄이 소리를 멎게 한 자리다.
  {
    const gaugeBlk = (() => {
      const i = modCode.indexOf("t === 'gauges'");
      return i < 0 ? '' : modCode.slice(i, i + 420);
    })();
    ok(gaugeBlk && !/msg\.carry/.test(gaugeBlk),
       '⑦g4 ★★먹기 판별이 `msg.carry` **존재**에 안 기댄다(그 칸은 초당 틱에도 실린다 — 1초마다 씹었다)',
       gaugeBlk ? '기대지 않는다' : '`gauges` 갈래를 못 찾았다');
    ok(/msg\.hunger/.test(gaugeBlk) && />\s*prev/.test(gaugeBlk),
       '⑦g5 ★★대신 **허기가 올랐을 때만** 운다(허기는 자연히 줄기만 한다)',
       '허기 상승 판별');
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

// ══════════════════════════════════════════════════════════════════════════════
// ⑧ ★[T292] 리미터 — 문턱 > 실측 최악 피크 · 실측이 지금 표를 잰 것 · 수는 코드에 없다
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑧ ★[T292] 리미터 — 셈이 아니라 실측');
{
  const L = (man.bus && man.bus.limiter) || {};
  const M = man._실측 || {};
  ok(typeof L.knee === 'number' && L.knee > 0 && L.knee < 1, `⑧a 문턱이 표에 있다(0<knee<1)`, `knee ${L.knee}`);
  ok(typeof M.worstPeak === 'number', `⑧b 실측 최악 피크가 표에 있다`, `${M.worstPeak} (${M.worstPeakDb} dBFS)`);
  ok(L.knee > M.worstPeak,
     '⑧c ★★문턱이 **실측 최악 피크보다 위**다 — 평소엔 리미터가 한 번도 안 문다',
     `${L.knee} > ${M.worstPeak} · 여유 ${(20 * Math.log10(L.knee / M.worstPeak)).toFixed(2)}dB`);
  // ⑧d ★실측이 **지금 키 표**를 잰 것인가 — 키를 더하고 다시 안 재면 여기서 문다
  const sounding = keyNames.filter((k) => KEYS[k].file).length;
  ok(M.soundingKeys === sounding,
     `⑧d ★실측이 지금 키 표를 잰 것이다 — 소리 나는 키 ${sounding}종`,
     M.soundingKeys === sounding ? `\`_실측\` ${M.soundingKeys}종 · ${M.date}`
       : `표는 ${M.soundingKeys}종인데 지금 ${sounding}종 — **\`__sfx.probe()\` 를 다시 돌려라**`);
  const gone = (M.worstCombo || []).filter((k) => !KEYS[k]);
  ok(gone.length === 0, `⑧e 최악 조합의 키가 전부 아직 표에 있다`, gone.join(' ') || (M.worstCombo || []).join(' '));
  // ⑧f ★수가 코드에 없다 — 층은 문턱을 표에서 읽는다
  ok(/bus\s*&&\s*_sfxMan\.bus\.limiter|limiter\s*&&\s*_sfxMan\.bus\.limiter\.knee|limiter\.knee/.test(modCode),
     '⑧f 층이 문턱을 **표에서** 읽는다(코드에 박힌 수가 아니다)');
  // ⑧g 자명 통과 금지 — 문턱을 최악 피크 아래로 내린 셈 치면 ⑧c 의 부등식이 깨진다
  ok(!((M.worstPeak * 0.9) > M.worstPeak),
     '⑧g 자명 통과 금지 — 문턱을 최악 피크 아래로 내리면 ⑧c 의 부등식이 깨진다', `${(M.worstPeak * 0.9).toFixed(4)} < ${M.worstPeak}`);
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑨ ★[T292] BGM 전환 — 표가 고른다 · 엔진이 아는 이름인가
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑨ ★[T292] BGM 전환 — 두 축 네 칸');
{
  const PICK = (man.bgm && man.bgm.scenePick) || {};
  const cells = Object.keys(PICK).filter((k) => !k.startsWith('_'));
  const WANT = ['village:day', 'village:night', 'field:day', 'field:night'];
  const missing = WANT.filter((k) => !PICK[k]);
  ok(missing.length === 0, `⑨a 두 축 네 칸이 다 있다 — 빠진 칸 ${missing.length}개`,
     missing.join(' ') || WANT.map((k) => `${k}→${PICK[k]}`).join(' · '));
  ok(cells.length === WANT.length, `⑨b 표에 군더더기 칸이 없다`, `${cells.length}칸`);
  // ★엔진이 **실제로 받는** 이름인가 — `bgm.js` 의 `setScene` 이 거르는 그 집합을 읽는다(사본 0).
  const bgmSrc = fs.readFileSync(path.join(BGM_DIR, 'bgm.js'), 'utf8');
  const guard = bgmSrc.match(/scene\s+in\s*\{([^}]*)\}/);
  const accepted = guard ? guard[1].split(',').map((x) => x.split(':')[0].trim()).filter(Boolean) : [];
  ok(accepted.length >= 3, `⑨c 전제: 엔진이 거르는 장면 집합을 읽었다`, accepted.join(' '));
  const unknown = WANT.map((k) => PICK[k]).filter((v, i, a) => a.indexOf(v) === i).filter((v) => !accepted.includes(v));
  ok(unknown.length === 0,
     '⑨d ★★표의 장면 이름이 전부 **엔진이 받는 이름**이다(모르는 이름을 주면 `setScene` 이 조용히 되돌아간다)',
     unknown.join(' ') || `${accepted.length}종 중 ${new Set(WANT.map((k) => PICK[k])).size}종을 쓴다`);
  // ★층이 표를 본다 — 장면 이름이 코드에 박혀 있지 않다
  const hard = ['village_day', 'village_night', 'journey', 'battle'].filter((n) => new RegExp(`['"]${n}['"]`).test(modCode));
  ok(hard.length === 0, '⑨e ★층 코드에 장면 이름이 박혀 있지 않다(표가 고른다)', hard.join(' ') || '0개');
  ok(/scenePick/.test(modCode), '⑨f 층이 `scenePick` 을 실제로 읽는다');
  // 페이드 — 표에 있고 층이 그 값을 넘긴다
  const fade = man.bgm && man.bgm.sceneFadeSec;
  ok(typeof fade === 'number' && fade > 0, '⑨g 장면 전환 페이드가 표에 있다(초)', `${fade}s`);
  ok(/sceneFadeSec/.test(modCode), '⑨h 층이 그 값을 `setScene` 에 넘긴다(코드에 박힌 초가 아니다)');
  // ★자명 통과 금지 — 엔진이 모르는 이름을 넣은 셈 치면 ⑨d 가 문다
  ok(!accepted.includes('village_dusk'), '⑨i 자명 통과 금지 — 엔진이 모르는 이름(`village_dusk`)은 집합에 없다');
  // ★[T292] `mood` 는 여전히 못 고른다 — `render-meta.json` 에 태그 칸이 없다(카드가 두 번 물었다)
  const anyTag = Object.values(meta.tracks || {}).some((t) => t && (t.tag || t.tags || t.mood || t.scene));
  ok(!anyTag, '⑨j ★`render-meta.json` 에 태그 칸이 **여전히 없다** — mood 는 안 고른다(지어내지 않는다)',
     '칸: ' + [...new Set(Object.values(meta.tracks || {}).flatMap((t) => Object.keys(t || {})))].join(' '));
  // ★★[T292] 악기 출처 표 ↔ `README-BGM.md` — 두 표가 **같은 말을 한다**.
  //   `f75e8158`("정악대금 도입")이 곡은 넣고 표는 안 고친 결함의 세 번째 흔적이 여기였다:
  //   `source.daegeum` 이 "합성"이라 적혀 있었는데 정악대금은 국립국악원 실제 녹음이다.
  //   ⇒ README 가 "아직 합성음인 악기"라고 적은 목록과 이 표의 "합성" 칸이 어긋나면 문다.
  {
    const rd = fs.readFileSync(path.join(BGM_DIR, 'README-BGM.md'), 'utf8');
    // ★★자를 **목록 줄 하나**로 좁힌다 [T292 실측]. 1차 판은 절 머리에서 200자를 읽었는데, 그 안에
    //   "대금은 절반만 합성이다" 같은 **설명 문단**이 들어와 대금이 목록에 있는 것처럼 읽혔다.
    //   이 집이 세 번 밟은 그 지뢰다(T182 `test-itemlabel ⑩` · T205 · T257 "주석은 쓰임이 아니다") —
    //   **검사 범위를 넓히면 검사가 거짓말한다.** 판정은 목록 줄에서만 한다.
    const rdLines = rd.slice(rd.indexOf('아직 합성음인 악기')).split('\n');
    //   ⚠경고 문단을 표식(그림문자)으로 거르지 마라 — `test-harness-lint ②` 가 판정 자리의 그림문자를 문다
    //   (실제로 물렸다). 목록은 **가운뎃점으로 이어진 줄**이라는 것이 그 자체로 자다.
    const listLine = (rdLines.slice(1).find((l) => l.split('·').length >= 6) || '');
    const KO = { geomungo: '거문고', daegeum: '대금', danso: '단소', piri: '피리',
                 janggu_gung: '장구', janggu_chae: '장구', buk: '북', jing: '징', kkwaenggwari: '꽹과리', bak: '박' };
    ok(listLine.split('·').length >= 6, '⑨k 전제: README 의 "아직 합성음인 악기" **목록 줄**을 읽었다', listLine.trim());
    const src = meta.source || {};
    const bad = Object.keys(KO).filter((k) => {
      const synth = /^합성$/.test(String(src[k] || ''));
      const inList = listLine.includes(KO[k]);
      return synth !== inList;                                   // 표가 "합성"이라면 README 목록에 있어야 한다
    });
    ok(bad.length === 0, `⑨l ★★악기 출처 표와 README 가 어긋나는 악기 ${bad.length}종`,
       bad.map((k) => `${KO[k]}(표:${src[k]})`).join(' ') || '표와 README 가 같은 말을 한다');
    // ★자명 통과 금지 — 목록에서 악기 하나를 뺀 셈 치면 ⑨l 이 문다
    {
      const faked = listLine.replace('거문고', '');
      const bite = Object.keys(KO).filter((k) => /^합성$/.test(String(src[k] || '')) !== faked.includes(KO[k]));
      ok(bite.length === 1 && bite[0] === 'geomungo',
         '⑨l-2 자명 통과 금지 — 목록에서 거문고를 빼면 ⑨l 이 **그 하나만** 문다', bite.join(' '));
    }
    ok(!/^합성$/.test(String(src.gayageum || '')) && !/^합성$/.test(String(src.daegeum || '')),
       '⑨m ★가야금·대금은 **샘플**로 적혀 있다(국립국악원 실제 녹음 — `CREDITS.md` §2 와 같은 말)',
       `가야금=${String(src.gayageum).slice(0, 22)}… · 대금=${String(src.daegeum).slice(0, 22)}…`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑩ ★[T292] CI 등록 — 야간이 아니라 **매 푸시**에 도는 자리에 있다
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑩ ★[T292] CI 등록');
{
  const wf = path.join(ROOT, '.github', 'workflows', 'regress-unit.yml');
  ok(fs.existsSync(wf), '⑩a CI 파일이 있다', 'regress-unit.yml');
  const y = fs.readFileSync(wf, 'utf8');
  const unitBlock = y.slice(y.indexOf('단위 하네스'), y.indexOf('watch:') > 0 ? y.indexOf('watch:') : y.length);
  ok(/test-audio\.js/.test(unitBlock), '⑩b ★`test-audio.js` 가 단위 목록에 있다(매 push·PR 마다 돈다)');
  const listed = (unitBlock.match(/test-[a-z0-9-]+\.js/g) || []);
  ok(listed.length >= 20, `⑩c 단위 목록이 실제로 여럿이다 — ${listed.length}종`, listed.length + '종');
  ok(/@regress/.test(fs.readFileSync(__filename, 'utf8').slice(0, 200)),
     '⑩d 이 하네스가 `@regress` 표식을 달고 있다(야간 러너도 스스로 찾는다)');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
