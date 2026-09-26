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
// ★★[T354] 배선 표 목록을 **손으로 적지 않는다.** T323 소리판이 이미 배운 것인데 이 자는 아직
//   목록을 박고 있었다 — 그래서 `ground`·`rainSplit` 이 생기자 멀쩡히 배선된 키 넷이
//   "아무도 안 부르는 키" 로 빨개졌다(거짓 빨강 · T283 이 같은 모양으로 한 번 당했다).
//   ⇒ 매니페스트에서 **표를 스스로 찾는다**: 값이 키 이름인 칸을 가진 최상위 객체가 배선 표다.
// ★[T412] 배선 표가 **한 겹 더 깊어졌다** — 규칙 목록(`buildEdge` · `[{types, field, on, off}]`)의 `on`/`off` 도 키를 잇는다.
//   겉 칸만 보면 그 키들이 "아무도 안 부르는 키" 로 거짓 빨강이 된다(T354 가 같은 꼴로 한 번 당했다).
//   ⇒ 표 안의 객체·배열을 **한 겹** 더 내려가 키 이름인 문자열을 모은다. `_` 칸은 설명이라 안 본다.
function tableStrings(v, depth) {
  const out = [];
  if (typeof v === 'string') { out.push(v); return out; }
  if (!v || typeof v !== 'object' || depth > 2) return out;
  for (const [k, x] of Object.entries(v)) { if (typeof k === 'string' && k.startsWith('_')) continue; out.push(...tableStrings(x, depth + 1)); }
  return out;
}
const TABLES = Object.keys(man).filter((t) => {
  if (t.startsWith('_') || t === 'keys' || t === 'sources' || t === 'bus' || t === 'bgm') return false;
  const v = man[t];
  if (!v || typeof v !== 'object') return false;
  return tableStrings(v, 0).some((x) => man.keys[x]);
});
function tableKeys() {
  const out = new Set();
  for (const t of TABLES) for (const x of tableStrings(man[t], 0)) if (man.keys[x]) out.add(x);
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
// ★[T358] **후보 키**는 일부러 배선이 없다 — 재민이 소리판에서 옛 것과 새 것을 견주려고 남겨 둔
//   것이다(`bronze_hit` 이 `rock_hit`·`drop` 에 자리를 내준 뒤 그렇게 됐다).
//   ⚠그렇다고 조용히 빼지는 않는다: **세어서 이름을 낸다.** 안 그러면 `후보: true` 한 줄로
//     아무 키나 이 자를 피해 갈 수 있고, 그러면 "안 불리는 키 0" 이 아무 뜻도 없는 수가 된다.
const cand = keyNames.filter((k) => KEYS[k]['후보']);
const orphan = keyNames.filter((k) => !used.has(k) && !KEYS[k]['후보']);
ok(orphan.length === 0, `아무도 안 부르는 키 ${orphan.length}개`, orphan.join(' ') || `${keyNames.length}종 중 후보 ${cand.length} 빼고 전부 불린다`);
console.log(`     · 후보(배선 없음이 맞다 · 소리판에서 견주는 용): ${cand.length}개 — ${cand.join(' ') || '없음'}`);
ok(cand.every((k) => KEYS[k].file), '후보 키에도 파일은 있다(못 들으면 견줄 수가 없다)', cand.join(' ') || '없음');

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
    const orphan2 = keyNames.filter((k) => !u2.has(k) && !KEYS[k]['후보']);   // ★[T358] 후보는 원래 배선이 없다
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
  // ⚠[T354] **글자 칸만 본다.** 표에는 키 말고 **수**가 들어가는 칸도 있다(`rainSplit.문턱` 0.5 —
  //   두 파일을 가르는 세기). 수까지 "키여야 한다"로 재면 멀쩡한 표가 빨개진다(실제로 그랬다).
  //   키를 가리키는 칸은 글자다 — 오타를 잡는 자의 대상은 그 칸뿐이다.
  const badTbl = [];
  for (const t of TABLES) for (const [k, v] of Object.entries(man[t] || {})) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    if (!KEYS[v]) badTbl.push(`${t}.${k}→${v}`);
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

  // ⑦g4~⑦g8 ★★★[T305] **서버가 동사를 말한다 — 층은 더 이상 짐작하지 않는다.**
  //     먹기 판별의 역사가 이 집의 교훈 하나를 통째로 담고 있다:
  //       T283 — 메시지의 **모양**(`carry` 칸이 있나)으로 갈랐다 ⇒ 그 칸이 초당 게이지 틱에도 있어 **1초마다 씹었다**.
  //       T292-b — 메시지의 **값**(허기가 올랐나)으로 갈랐다 ⇒ 모양에 안 기대니 옳았지만
  //                **배가 꽉 차면** 허기가 안 올라 무음이었다(짐작의 한계가 남았다).
  //       T305 — 서버 두 자리를 허락받아 `doEat` 이 **`ate` 한 낱말**을 댄다 ⇒ 짐작이 0 이 됐다.
  //     ⇒ 자가 지키는 것: 층이 **모양에도 값에도 안 기대고 동사를 읽는가**.
  {
    const gaugeBlk = (() => {
      const i = modCode.indexOf("t === 'gauges'");
      return i < 0 ? '' : modCode.slice(i, i + 200);
    })();
    ok(gaugeBlk && !/msg\.carry/.test(gaugeBlk),
       '⑦g4 ★먹기 판별이 `msg.carry` **모양**에 안 기댄다(그 칸은 초당 틱에도 실린다 — T283 이 1초마다 씹었다)',
       gaugeBlk ? '안 기댄다' : '`gauges` 갈래를 못 찾았다');
    ok(gaugeBlk && !/hunger/.test(gaugeBlk),
       '⑦g5 ★먹기 판별이 허기 **값**에도 안 기댄다(배가 꽉 차면 안 올라 무음이었다 — T292-b 의 남은 구멍)',
       '값 추측 0');
    ok(/msg\.ate/.test(gaugeBlk),
       '⑦g6 ★★대신 **서버의 동사**(`gauges.ate`)를 읽는다 — 먹었다는 사실 자체다',
       '동사로 가른다');

    // ⑦g7 ★서버가 실제로 그 낱말을 대고 있나 — 층이 기대는 자리를 서버 소스에서 확인한다
    ok(/\bate:\s*\(/.test(srv) || /\bate:\s*'/.test(srv),
       '⑦g7 ★★서버 `doEat` 이 `ate` 낱말을 **실제로 싣는다**(층의 기대가 허공이 아니다)',
       (srv.match(/ate:\s*\([^)]*\)/) || srv.match(/ate:\s*'[a-z]*'/) || ['못 찾음'])[0].slice(0, 46));

    // ⑦g8 ★밭 수확 — `inventory` 의 `where` 낱말이 **표**로 키가 된다(코드에 낱말이 안 박힌다)
    const invBlk = (() => { const i = modCode.indexOf("t === 'inventory'"); return i < 0 ? '' : modCode.slice(i, i + 260); })();
    ok(invBlk && /inventoryWhere/.test(invBlk) && !/'harvest'/.test(invBlk),
       '⑦g8 ★수확 소리도 **표**가 고른다(`inventoryWhere`) — 층 코드에 낱말이 박혀 있지 않다',
       invBlk ? '표가 고른다' : '`inventory` 갈래를 못 찾았다');
    ok(/sendInventory\(player, 'harvest'\)/.test(srv) && /where:\s*where/.test(srv),
       '⑦g9 ★★서버가 `where` 를 **전문에 싣고** 밭 수확이 이름을 댄다(T292 ⓑ 가 적은 그 한 칸)',
       '`where` 한 칸 + `harvest` 낱말');
    const whereTbl = man.inventoryWhere || {};
    const whereKeys = Object.keys(whereTbl).filter((k) => !k.startsWith('_'));
    ok(whereKeys.length > 0 && whereKeys.every((w) => KEYS[whereTbl[w]]),
       '⑦g10 `inventoryWhere` 가 가리키는 키가 전부 표에 있다(없는 키를 가리키면 조용한 무음이다)',
       whereKeys.map((w) => `${w}→${whereTbl[w]}`).join(' '));
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
  const kneeHolds = (peak) => typeof peak === 'number' && L.knee > peak;   // ⑧c 와 ⑧g 가 **같은 술어**를 쓴다
  ok(kneeHolds(M.worstPeak),
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
  // ⑧k ★★[T417 ★PM] 최악 조합은 **실측에서 뽑는다** — 손으로 겹친 표가 아니라 진짜 한 판(`scripts/sfx-cooccur.js`)에서
  //   같은 200ms 창에 **실제로 겹친** 묶음 중 리미터 없이 가장 센 것. 손으로 겹친 표는 `handCombo` 로 남아 대조 자로만 쓴다.
  const WS = M.worstSource || {};
  ok(WS.tool === 'sfx-cooccur' && WS.windows > 0 && WS.distinct > 0 && (M.worstCombo || []).length > 0 && (M.worstCombo || []).every((k) => KEYS[k]),
     '⑧k ★★최악 조합이 **실측 묶음**이다(`sfx-cooccur` 한 판 · 관측 창·묶음 수가 적혀 있다)',
     `${WS.minutes}분 · 창 ${WS.windows} · 묶음 ${WS.distinct} · 울림 ${WS.plays} · ${(M.worstCombo || []).join('+')} = ${M.worstPeak}`);
  ok(!kneeHolds(undefined) && !kneeHolds(NaN), '⑧k2 자명 통과 금지 — 묶음을 비우면(잰 값 없음) ⑧c 의 술어가 **빨갛다**');
  ok(Array.isArray(M.handCombo) && typeof M.handPeak === 'number', '⑧k3 손으로 겹친 표는 대조 자로 남아 있다(`handCombo`)',
     `${(M.handCombo || []).length}키 · 없이 ${M.handPeak}${typeof M.handPeak === 'number' ? (kneeHolds(M.handPeak) ? ' (문턱 안)' : ' (★문턱 밖 — 대조만)') : ''}`);
  // ⑧h ★★[T387] 최악 조합에 **울 수 없는 키**(후보)가 없다 — 게임에서 안 나는 소리로 잰 최악은 거짓 대상이다.
  //   T358 이 `bronze_hit` 을 후보로 돌리고도 조합에 남겨 둬서, 그 조합의 '리미터 없는' 피크 0.8755 가 문턱을 넘었는데
  //   표에는 리미터 **낀** 값(0.7623)이 적혀 ⑧c 가 거짓으로 초록이었다(T354~T358). 자가 두 번 틀린 자리다.
  const candInCombo = (M.worstCombo || []).filter((k) => KEYS[k] && KEYS[k]['후보']);
  ok(candInCombo.length === 0, '⑧h ★★최악 조합에 후보 키(배선 없음 = 게임에서 안 운다)가 없다', candInCombo.join(' ') || (M.worstCombo || []).join(' '));
  ok(['bronze_hit'].some((k) => KEYS[k] && KEYS[k]['후보']),
     '⑧h2 자명 통과 금지 — 후보 키가 실제로 표에 있다(없으면 ⑧h 는 아무것도 안 거른다)', Object.keys(KEYS).filter((k) => KEYS[k]['후보']).join(' '));
  // ⑧i ★[T387] 전투 한 판도 **리미터 없이** 문턱 아래다(새 갈래가 평소 판을 넘기지 않았다)
  ok(typeof M.combatPeak === 'number' && L.knee > M.combatPeak && (M.combatCombo || []).every((k) => KEYS[k] && !KEYS[k]['후보']),
     '⑧i ★전투 한 판(배선 키만)의 리미터 없는 피크가 문턱 아래다', `${L.knee} > ${M.combatPeak} · ${(M.combatCombo || []).join(' ')}`);
  // ⑧f ★수가 코드에 없다 — 층은 문턱을 표에서 읽는다
  ok(/bus\s*&&\s*_sfxMan\.bus\.limiter|limiter\s*&&\s*_sfxMan\.bus\.limiter\.knee|limiter\.knee/.test(modCode),
     '⑧f 층이 문턱을 **표에서** 읽는다(코드에 박힌 수가 아니다)');
  // ⑧g 자명 통과 금지 — 문턱을 최악 피크 아래로 내린 셈 치면 ⑧c 의 부등식이 깨진다
  // ⑧g 자명 통과 금지 — ★[T397] 옛 줄은 `!(x*0.9 > x)` 였다: 값과 무관하게 참인 **항진**이라 아무것도 안 쟀다.
  //   이제 **잰 미끼**를 같은 술어에 넣는다: `_실측.bait` = 문턱을 실제로 넘는 조합(리미터 없이 잰 값).
  //   ⑧c 의 술어가 그 미끼를 **빨갛게** 판정해야 자가 산 것이다(미끼가 초록이면 술어가 아무거나 통과시킨다).
  const B = M.bait || {};
  ok(typeof B.peak === 'number' && Array.isArray(B.combo) && B.combo.length > 0 && !kneeHolds(B.peak) && kneeHolds(M.worstPeak),
     '⑧g ★자명 통과 금지 — ⑧c 와 **같은 술어**가 잰 미끼(문턱 넘는 조합)는 빨갛게, 최악 조합은 초록으로 판정한다',
     `미끼 ${(B.combo || []).length}키 ${B.peak} → ${kneeHolds(B.peak) ? '초록(자가 죽었다)' : '빨강'} · 최악 ${M.worstPeak} → ${kneeHolds(M.worstPeak) ? '초록' : '빨강'}`);
  ok(!!(B.combo || []).length && (B.combo || []).every((k) => KEYS[k]), '⑧g2 미끼 조합의 키가 전부 표에 있다(없는 키로 잰 미끼는 거짓)', (B.combo || []).join(' '));
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

// ══════════════════════════════════════════════════════════════════════════════
// ⑪ ★★★[T305] 리미터 곡선 — **정본 하나**이고, 넘침은 **증명**이지 짐작이 아니다
//
//   T283 이 `bgm.js` 의 곡선을 **베껴** 효과음 버스에 달았다. T292 가 그 사본을 실측해
//   **원점 기울기 1.4364 = +3.15 dB** 임을 찾았지만, 카드가 "재생기 수정 0" 이라 효과음 쪽만 고쳤다.
//   ⇒ 음악은 **5일 더 3 dB 크게 울었다**. 두 벌이면 한 벌만 고쳐진다 — 그게 사본의 값이다.
//   T305 가 한 벌로 합쳤다: 곡선의 **모양**은 `bgm.js` 가, **문턱 값**은 이 층의 표가 준다.
//
//   ★여기서 자는 **`__sfx.probe()` 가 재던 그 성질**을 잰다. 다만 재는 방식이 다르다:
//     probe 는 진짜 버퍼를 오프라인 렌더해 표본을 **세고**(브라우저가 있어야 한다 — 야간
//     `e2e-audio-probe.js` 가 그 일을 이어받는다), 이 절은 곡선 자체에서 넘침을 **증명한다**.
//     WaveShaper 의 입력은 규격상 [−1,1] 로 잘리므로 **곡선의 최대 절댓값이 곧 출력의 상한**이다.
//     그 값이 1 보다 작으면 "어떤 소리를 몇 개 겹쳐도 안 넘친다"가 표본을 세지 않고 참이 된다.
//     ⇒ 셈이 상한이라 못 믿겠던 T292 의 처지와 **반대**다. 그때는 상한이 1.79 라 실측이 필요했고,
//       지금은 상한이 1 아래라 실측이 필요 없다. 실측은 그래도 야간에 계속 돈다(믿음 아닌 확인).
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑪ ★★[T305] 리미터 곡선 — 정본 하나 · 넘침은 증명');
{
  const bgmSrcC = fs.readFileSync(path.join(BGM_DIR, 'bgm.js'), 'utf8');
  let BGM = null;
  try { (0, eval)(bgmSrcC); BGM = globalThis.DurangoBGM; } catch (e) { BGM = null; }
  ok(BGM && typeof BGM.softLimiterCurve === 'function',
     '⑪a ★곡선 **정본**이 `bgm.js` 에 있고 이름으로 나와 있다(`DurangoBGM.softLimiterCurve`)',
     BGM ? '있다' : '`bgm.js` 를 노드에서 못 읽었다');

  // ⑪b 사본 0 — 효과음 층이 곡선을 **자기 손으로 만들지 않는다**
  const madeHere = /curve\[i\]\s*=/.test(modCode);
  ok(!madeHere && /DurangoBGM\.softLimiterCurve/.test(modCode),
     '⑪b ★★효과음 층은 곡선을 **안 만들고 정본을 부른다**(사본 0 — 한 벌만 고쳐지는 일이 다시 없게)',
     madeHere ? '아직 자기가 만든다' : '정본을 부른다');

  // ⑪c 문턱 값은 **두 표**에 있다 — 갈리면 문다(`bgm.js` 는 매니페스트를 못 읽는다: 오프라인 렌더엔 없다)
  const kneeTbl = (man.bus && man.bus.limiter && man.bus.limiter.knee);
  ok(BGM && BGM.LIMITER_KNEE === kneeTbl,
     '⑪c ★★`bgm.js` 의 문턱 상수와 매니페스트 `bus.limiter.knee` 가 **같은 수**다',
     `bgm.js ${BGM && BGM.LIMITER_KNEE} · 표 ${kneeTbl}`);

  // ⑪d ★싣는 순서 — `bgm.js` 가 앞이어야 효과음 층이 정본을 부를 수 있다(제품에서 리미터가 빠지지 않는다)
  {
    const ih = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
    const iB = ih.indexOf('bgm/bgm.js'), iA = ih.indexOf(MOD_REL);
    ok(iB > 0 && iA > 0 && iB < iA,
       '⑪d ★`index.html` 이 `bgm.js` 를 소리 층 **앞에** 싣는다(정본이 먼저 있어야 한다)',
       `bgm ${iB} < 소리층 ${iA}`);
  }

  if (BGM && typeof BGM.softLimiterCurve === 'function') {
    const T = kneeTbl, C = BGM.softLimiterCurve(T), N = C.length;
    const xOf = (i) => (i / (N - 1)) * 2 - 1;

    // ⑪e ★★문턱 아래는 **비트 동일**이어야 한다 — 기울기 1(투명). 1.4364 배가 다시 들어오면 여기가 문다.
    let offBelow = 0, worstBelow = 0;
    for (let i = 0; i < N; i++) {
      const x = xOf(i); if (Math.abs(x) > T) continue;
      if (C[i] !== Math.fround(x)) { offBelow++; worstBelow = Math.max(worstBelow, Math.abs(C[i] - x)); }
    }
    ok(offBelow === 0, '⑪e ★★문턱 아래는 **입력 그대로**다(기울기 정확히 1 · 비트 동일 — 증폭 0)',
       offBelow ? `어긋난 표본 ${offBelow} · 최대 차 ${worstBelow}` : `${T} 아래 전 표본 동일`);

    // ⑪f ★위는 단조이고 1.0 을 안 넘는다 ⇒ **출력 상한이 1 아래** = 어떤 조합도 클리핑 0
    let mono = true, maxAbs = 0, prev = -Infinity;
    for (let i = 0; i < N; i++) { if (C[i] < prev) mono = false; prev = C[i]; if (Math.abs(C[i]) > maxAbs) maxAbs = Math.abs(C[i]); }
    ok(mono, '⑪f 곡선이 단조 증가다(순서가 뒤집히면 파형이 찢어진다)');
    ok(maxAbs < 1, '⑪g ★★★출력 **상한**이 1 아래다 ⇒ 키를 몇 개 겹쳐도 **클리핑이 원리상 0**이다(표본을 안 세고 참)',
       `최대 |출력| ${maxAbs.toFixed(6)} (${(20 * Math.log10(maxAbs)).toFixed(2)} dBFS)`);

    // ⑪h ★18키 전부 + T292 최악 조합 — **표** 한 장(매 판 낸다 · 기계 의존 ms 0)
    const soundKeys = keyNames.filter((k) => KEYS[k].file);
    const volSum = soundKeys.reduce((t, k) => t + (KEYS[k].volume || 0), 0);
    const busSfx = (man.bus && man.bus.sfx && man.bus.sfx.default) || 0;
    const busMst = (man.bus && man.bus.master && man.bus.master.default) || 0;
    const thru = (v) => { const a = Math.min(Math.abs(v), 1); const y = a <= T ? a : T + (1 - T) * Math.tanh((a - T) / (1 - T)); return y * Math.sign(v || 1); };
    const worstCombo = (man._실측 && man._실측.worstCombo) || [];
    const rows = [
      ['소리 나는 키 전부', soundKeys.length, volSum],
      ['T292 최악 조합', worstCombo.length, worstCombo.reduce((t, k) => t + ((KEYS[k] && KEYS[k].volume) || 0), 0)],
    ];
    console.log('    ── 최악 정렬(모든 파형이 같은 순간 같은 부호) 상한표 ──');
    let anyClip = 0;
    for (const [name, n, sum] of rows) {
      const inBus = sum * busSfx;                 // 버스 입력(최악 정렬)
      const out = thru(inBus) * busMst;           // 리미터 → 마스터
      if (out >= 1) anyClip++;
      console.log(`      ${name.padEnd(18)} 키 ${String(n).padStart(2)} · 합 ${sum.toFixed(2).padStart(5)}`
        + ` · 버스입력 ${inBus.toFixed(4)} · 출력 ${out.toFixed(4)} (${(20 * Math.log10(Math.max(out, 1e-9))).toFixed(2)} dBFS) · 클리핑 ${out >= 1 ? '있다' : '0'}`);
    }
    ok(anyClip === 0, '⑪h ★★18키 전부·최악 조합 **둘 다 클리핑 0**(위 표 — 최악 정렬 기준이라 실제는 이보다 낮다)',
       `줄 ${rows.length} · 넘친 줄 ${anyClip}`);

    // ⑪i 자명 통과 금지 — 옛 곡선(기울기 1.4364)을 같은 자로 재면 ⑪e 가 **문다**
    {
      const old = new Float32Array(N);
      for (let i = 0; i < N; i++) { const x = xOf(i); old[i] = Math.tanh(x * 1.35) / Math.tanh(1.35) * 0.93; }
      let bad = 0;
      for (let i = 0; i < N; i++) { const x = xOf(i); if (Math.abs(x) <= T && old[i] !== Math.fround(x)) bad++; }
      ok(bad > 0, '⑪i 자명 통과 금지 — **옛 곡선**을 같은 자로 재면 문턱 아래가 어긋난다(자가 살아 있다)',
         `옛 곡선의 어긋난 표본 ${bad} · 원점 기울기 ${(1.35 / Math.tanh(1.35) * 0.93).toFixed(4)}`);
    }

    // ⑪j 야간 실측 하네스가 있고 표식을 달고 있다 — 증명과 **별도로** 진짜 버퍼를 계속 센다
    {
      const pb = path.join(ROOT, 'scripts', 'e2e-audio-probe.js');
      const has = fs.existsSync(pb);
      const head = has ? fs.readFileSync(pb, 'utf8').slice(0, 400) : '';
      ok(has && /@regress/.test(head) && /@nightly\s+[A-Z]/.test(head),
         '⑪j ★야간 실측 하네스(`e2e-audio-probe.js`)가 있고 `@regress`·`@nightly` 를 달고 있다',
         has ? (head.match(/@nightly\s+[A-Z]/) || ['표식 없다'])[0] : '없다');
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑫ ★★★[T321] 어부의 소리 — **없는 순간을 지어내지 않았다**
//
//   카드는 "던짐·입질·걸림 훅 셋" 을 시켰다. 그런데 **NPC 어부에게는 그 셋이 차례로 일어나지 않는다**:
//   `villages.js` 의 8초 게이트 안에서 종 추첨 → 셀 예산 → 장부가 **같은 틱**에 끝난다.
//   플레이어 낚시에는 있는 대기 창(`biteAt`·`windowMs` · `fish_state` 가 'wait'→'bite' 로 두 번 온다)이
//   NPC 경로에는 **없다**. 그래서 셋을 차례로 울리려면 층이 **없던 시간을 지어내야** 한다(족보 226).
//   ⇒ 대신 **한 시도의 결말**이 원래 셋으로 갈려 있는 것을 쓴다(코드가 이미 갈라 놓았다):
//        안 물림(`!_sp`) → `cast` · 물고 놓침(`_got<=0`) → `bite` · 건짐(`_got>0`) → `hook`
//   이 절은 그 배선과, **그 전제 자체**(NPC 경로에 대기 창이 없다)를 함께 지킨다 —
//   세계가 나중에 대기 창을 주면 이 단언이 빨개지고, 그때 소리를 **차례로** 바꾸면 된다.
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑫ ★★[T321] 어부의 소리 — 결말 셋에 키 셋');
{
  const vilPath = path.join(ROOT, 'server', 'villages.js');
  const vil = fs.readFileSync(vilPath, 'utf8');
  const TBL = man.npcAct || {};
  const words = Object.keys(TBL).filter((k) => !k.startsWith('_'));

  ok(words.length === 3 && words.every((w) => KEYS[TBL[w]] && KEYS[TBL[w]].file),
     '⑫a ★표가 낱말 셋을 **파일 있는 키** 셋으로 옮긴다', words.map((w) => `${w}→${TBL[w]}`).join(' '));

  // ⑫b ★★서버가 그 낱말들을 실제로 세운다 — 그리고 **한 시도에 하나만** 선다(배타)
  // ★[T354] 창을 **글자 수로 자르지 않는다.** T340 이 이 블록을 길게 고쳐 쓰면서 3200자 창이
  //   `'낚음'` 줄(블록 끝머리)을 못 덮었고, ⑫b·⑫c 가 **코드가 멀쩡한데** 빨개졌다.
  //   ⇒ 블록은 **다음 직업 갈래**까지다. 자를 대상의 모양이 바뀌어도 창이 따라간다.
  const blk = (() => {
    const i = vil.indexOf("if (job === 'fisher')");
    if (i < 0) return '';
    const j = vil.indexOf("if (job === '", i + 10);
    return vil.slice(i, j > i ? j : i + 8000);
  })();
  const setWords = (blk.match(/_lifeAct\(npc, '([^']+)'\)/g) || []).map((x) => x.match(/'([^']+)'/)[1]);
  for (const w of words) ok(setWords.includes(w), `⑫b ★서버 어부 자리가 \`${w}\` 을 세운다`, TBL[w]);
  // ⑫c ★★한 틱에 낱말이 **하나만** 선다. `_lifeAct` 는 덮어쓰는 칸이라 둘이 서면 마지막만 남는다.
  //   ⚠[T354] T321 판은 이것을 `if (!_sp)` 라는 **그때의 철자**로 쟀다. T340 이 대본을 주며
  //     갈래가 `_hook === 'none'|'miss'|객체` 로 바뀌자 자가 빨개졌다 — 코드는 멀쩡한데.
  //     ⇒ 철자가 아니라 **성질**을 잰다: 낱말을 세우는 갈래들이 **서로 배타인 조건**에 달려 있는가.
  const actConds = (blk.match(/if \([^)]*\)\s*_lifeAct\(npc, '(드리움|놓침|낚음)'\)|\} else _lifeAct\(npc, '(드리움|놓침|낚음)'\)/g) || []);
  ok(actConds.length >= 3,
     '⑫c ★★낱말 셋이 **저마다 조건 아래** 선다(맨몸으로 서는 낱말이 없다 = 한 틱에 하나)',
     `조건 붙은 자리 ${actConds.length}`);

  // ⑫c2 ★★[T354] **대본이 생겼다** — T321 이 회부해 둔 그날이 왔다.
  //   T340 이 어부에게 '던짐 → 기다림 → 걸림/놓침' 을 줬다(`_t340Try` 가 `'wait'|'none'|'miss'|{…}`).
  //   ⇒ 이제 셋은 '한 순간의 결말' 이 아니라 **시도의 흐름**이다. 그런데 **`'wait'`(진짜 던짐)에는
  //     낱말이 없다** — 소리로는 던지는 순간이 여전히 비어 있다. 서버 한 줄이라 이 카드 밖이다(회부).
  const hasScript = /_t340Try|'wait'/.test(blk);
  ok(hasScript, '⑫c2 ★대본이 있다(`_t340Try` — 던짐/기다림/걸림/놓침)', hasScript ? '있다' : '없다');
  // ⑫c3 ★★[T358] **던지는 순간에 낱말이 생겼다.** T321 이 "없는 순간에 소리를 걸지 마라" 로 결말 셋에
  //   붙였고, T340 이 대본을 주자 T354 가 "`'wait'` 에 낱말이 없다" 를 **기록으로** 남겼으며,
  //   T358 이 서버 한 줄로 채웠다. 이제 셋이 **차례로** 난다: 던짐 → (기다림) → 놓침/낚음.
  //   ⇒ 자가 뒤집힌다 — 없다는 기록에서 **있어야 한다는 계약**으로.
  ok(/_hook === 'wait'\) _lifeAct\(npc, '드리움'\)/.test(blk),
     '⑫c3 ★★던지는 순간(`\'wait\'`)에 낱말이 선다 — `cast` 가 제자리를 찾았다',
     '던짐 → 드리움 → cast');

  // ⑫d ★★★[T354 정정] **이 자가 안 물었다 — 철자를 봤기 때문이다.**
  //   T321 판은 "NPC 자리에 `biteAt`·`windowMs` 가 없다" 로 대기 창의 부재를 쟀다. 그런데 T340 은
  //   그 시간을 **`fishing.js` 정본**에 두고 `_t340Try` 로 불렀다 — 두 낱말이 이 블록에 안 나타나므로
  //   자는 **계속 초록이었다.** 대기 창이 생겼는데 "없다" 고 답한 것이다.
  //   ⇒ 부재가 아니라 **존재**를 잰다. 대본이 있으면 `⑫c2` 가 초록이고, 그때 소리를 흐름에 맞춰야 한다.
  //   ⚠교훈: 사라질 수 있는 것의 **이름**으로 부재를 재지 마라. 이름은 옮겨 다닌다.
  ok(/biteAt/.test(fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8')),
     '⑫e 대조 — **플레이어** 낚시에는 그 창이 있다(자가 "어디에도 없다"를 말하는 게 아니다)', '`biteAt` 은 zone.js 에 있다');

  // ⑫f ★층은 **모서리**로 잡는다 — 라벨은 1.2초 창 동안 같은 값이 최대 25틱 온다
  const tickBlk = (() => { const i = modCode.indexOf("t === 'tick'"); return i < 0 ? '' : modCode.slice(i, i + 900); })();
  ok(tickBlk && /prev\.act === pp\.act/.test(tickBlk) && /continue/.test(tickBlk),
     '⑫f ★★같은 낱말이 또 와도 **다시 안 운다**(모서리 검출 — 안 그러면 한 번의 낚음이 스물다섯 번 난다)',
     tickBlk ? '직전 값과 맞대 본다' : '`tick` 갈래를 못 찾았다');
  ok(tickBlk && /npcAct/.test(tickBlk) && !/'낚음'|'드리움'|'놓침'/.test(tickBlk),
     '⑫g ★낱말이 층 코드에 박혀 있지 않다(표가 고른다)', '표가 고른다');
  ok(tickBlk && /pp\.x \+ ox/.test(tickBlk),
     '⑫h ★개체 자리를 붙인다 — 거리 감쇠가 걸린다(남의 마을 어부가 귓가에서 낚지 않는다)');

  // ⑫i ★★그 세 키에 **반경**이 생겼는가 — T292-b 의 `axe` 가 반경 0 인 채 수신 훅에 걸려 터진 그 결함이다
  const noR = ['cast', 'bite', 'hook'].filter((k) => !(KEYS[k] && KEYS[k].radius > 0));
  ok(noR.length === 0,
     '⑫i ★★`cast`·`bite`·`hook` 에 반경이 있다(남의 자리에서도 나는 소리가 됐다 — 반경 0 이면 전 존이 최대 볼륨)',
     noR.length ? '반경 0: ' + noR.join(' ') : ['cast', 'bite', 'hook'].map((k) => `${k} ${KEYS[k].radius}`).join(' · '));

  // ⑫j ★낙하 — 버리기와 죽어 쏟기가 **같은 한 방송**이라 플레이어와 어부가 같은 소리다(층이 묻지 않는다)
  const gd = man.groundDrop || {};
  ok(gd.key && KEYS[gd.key] && KEYS[gd.key].file,
     '⑫j ★낙하 키가 표에 있고 파일이 있다(새 키 0 — 있는 키에서 골랐다)', `groundDrop → ${gd.key}`);
  const giBlk = (() => { const i = modCode.indexOf("t === 'ground_item_added'"); return i < 0 ? '' : modCode.slice(i, i + 460); })();
  ok(giBlk && /groundDrop/.test(giBlk) && !/isNpc|npc/.test(giBlk),
     '⑫k ★★층이 **사람인지 주민인지 묻지 않는다** — 같은 방송 하나라 배선으로 같은 소리다',
     giBlk ? '묻지 않는다' : '`ground_item_added` 갈래를 못 찾았다');
  {
    const zc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
    ok(/broadcast\(\{ type: 'ground_item_added'/.test(zc),
       '⑫l ★그 방송이 서버에 **하나**다(층의 기대가 허공이 아니다)',
       String((zc.match(/type: 'ground_item_added'/g) || []).length) + '자리');
  }

  // ⑫m ★★어부 다섯이 동시에 — 상한표 한 줄(⑪ 문법 · 곡선 상한이 이미 증명하지만 **수를 낸다**)
  {
    const T = (man.bus && man.bus.limiter && man.bus.limiter.knee);
    const busSfx = (man.bus && man.bus.sfx && man.bus.sfx.default) || 0;
    const busMst = (man.bus && man.bus.master && man.bus.master.default) || 0;
    const thru = (v) => { const a = Math.min(Math.abs(v), 1); return (a <= T ? a : T + (1 - T) * Math.tanh((a - T) / (1 - T))); };
    // 어부 다섯 = `cast` 다섯 + 마을 배경(모닥불·바람·새) — 최악 정렬
    const combo = ['cast', 'cast', 'cast', 'cast', 'cast', 'fire', 'wind', 'bird'];
    const sum = combo.reduce((t, k) => t + ((KEYS[k] && KEYS[k].volume) || 0), 0);
    const out = thru(sum * busSfx) * busMst;
    console.log(`    ── 어부 다섯 동시 + 마을 배경 ──`);
    console.log(`      키 ${combo.length} · 합 ${sum.toFixed(2)} · 버스입력 ${(sum * busSfx).toFixed(4)}`
      + ` · 출력 ${out.toFixed(4)} (${(20 * Math.log10(out)).toFixed(2)} dBFS) · 클리핑 ${out >= 1 ? '있다' : '0'}`);
    ok(out < 1, '⑫m ★★어부 다섯이 동시에 낚아도 **클리핑 0**(최악 정렬 상한)',
       `출력 ${out.toFixed(4)} < 1`);
    // ⚠겹침 상한이 따로 있다 — `maxSame` 이 1 이면 다섯이 울려도 실제로 나는 건 하나다(더 조용하다)
    ok((KEYS.cast.maxSame || 3) >= 1,
       '⑫n 참고 — `cast` 의 겹침 상한이 표에 있다(실제로 동시에 나는 수는 이 값이 상한이다)',
       `maxSame ${KEYS.cast.maxSame} · cooldown ${KEYS.cast.cooldownMs}ms`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑬ ★★★[T323] 소리판 — **손으로 적은 목록이 0** 이어야 한다
//
//   페이지(`public/sfx-board.html`)의 값은 전부 정본에서 온다. 그 성질이 깨지는 모양은 하나다:
//   누가 "빨리" 표를 고치려고 키 이름을 페이지에 박는 것. 그러면 키가 늘어도 행이 안 늘고,
//   **페이지가 조용히 낡는다**(이 집이 여러 번 밟은 사본의 값).
//   ⇒ 이 절은 페이지 **소스에 키 이름이 없다**를 정적으로 지킨다. 행 수가 키 수와 같은지는
//     브라우저가 있어야 세므로 `e2e-audio-probe` 가 잇는다(⑲~㉒ · 자명 통과 금지 포함).
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑬ ★★[T323] 소리판 — 손 목록 0');
{
  const BOARD = path.join(PUB, 'sfx-board.html');
  ok(fs.existsSync(BOARD), '⑬a 페이지가 있다', 'public/sfx-board.html');
  const B = fs.existsSync(BOARD) ? fs.readFileSync(BOARD, 'utf8') : '';

  // ⑬b ★★키 이름이 **소스에 박혀 있지 않다**. 주석은 뺀다(주석은 경위를 적는 자리다).
  const strip = B.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
                 .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const hard = keyNames.filter((k) => new RegExp("['\"]" + k + "['\"]").test(strip));
  ok(hard.length === 0, '⑬b ★★페이지 코드에 키 이름이 **한 개도** 박혀 있지 않다(표가 정본이다)',
     hard.length ? '박힌 키: ' + hard.join(' ') : `키 ${keyNames.length}종 중 0`);

  // ⑬c ★정본 셋을 실제로 읽는다
  for (const [u, why] of [['assets/sfx/manifest.json', '키 표'],
                          ['assets/audio/bgm/render-meta.json', 'BGM 13곡'],
                          ['실기_소리', '실기표']]) {
    ok(B.indexOf(u) > 0, `⑬c 페이지가 \`${u}\` 를 읽는다 — ${why}`);
  }

  // ⑬d ★★제품을 **그대로 싣는다**(사본 0) — 그리고 `bgm.js` 가 앞이다(곡선 정본이 먼저 있어야 한다)
  const iB = B.indexOf('bgm/bgm.js'), iA = B.indexOf('client/48-a-audio.js');
  ok(iB > 0 && iA > 0 && iB < iA,
     '⑬d ★★제품 두 파일을 그대로 싣고 순서도 `index.html` 과 같다(사본 0)', `bgm ${iB} < 층 ${iA}`);

  // ⑬e ★제품 파일을 **안 고쳤다** — 이 카드의 diff 에 그 둘이 없어야 한다
  //    (하네스가 git 을 안 부른다 — 대신 층이 이 페이지를 아는 낌새가 없는지만 본다.)
  ok(!/sfx-board/.test(modCode), '⑬e ★소리 층이 이 페이지를 **모른다**(제품이 판을 향해 굽지 않았다)');

  // ⑬f ★서버 0 — 정적 갈래가 `public/` 아래를 그대로 내주므로 새 라우트가 필요 없다
  {
    const cj = fs.readFileSync(path.join(ROOT, 'server', 'central.js'), 'utf8');
    ok(/path\.join\(__dirname, '\.\.', 'public', urlPath\)/.test(cj),
       '⑬f ★서버에 새 라우트 0 — 정적 갈래가 이미 `public/` 아래를 내준다', '`central.js` 정적 갈래');
  }

  // ⑬g ★★실기표가 **배포에 실리는 자리**에 있다. 여기가 T323 의 함정이었다:
  //    `Dockerfile.central` 이 이미지로 담는 것은 `server`·`public`·`sim` 셋뿐이라
  //    `문서/` 에 둔 표는 배포된 호스트에서 **영영 404** 다(페이지의 그 칸이 빈다).
  {
    const df = fs.readFileSync(path.join(ROOT, 'Dockerfile.central'), 'utf8');
    const copies = (df.match(/^COPY\s+(\S+)/gm) || []).map((x) => x.split(/\s+/)[1]);
    ok(copies.includes('public'), '⑬g 전제: 배포 이미지가 `public` 을 담는다', copies.join(' '));
    ok(!copies.includes('문서'), '⑬h 전제: 배포 이미지가 `문서/` 를 **안 담는다**(그래서 옮겼다)', copies.join(' '));
    const pr = (B.match(/PRAC_URL\s*=\s*'([^']+)'/) || [])[1] || '';
    ok(pr && fs.existsSync(path.join(PUB, pr)),
       '⑬i ★★페이지가 읽는 실기표가 **`public/` 아래에** 실제로 있다(배포에 실린다)', pr || '주소를 못 찾았다');
    ok(!/\.\.\//.test(pr), '⑬j ★그 주소가 `public/` 밖으로 안 나간다(정적 갈래가 막는다)', pr);
  }

  // ⑬k 자명 통과 금지 — 키 하나를 박은 셈 치면 ⑬b 가 문다
  {
    const faked = strip + "\n  var k = '" + keyNames[0] + "';\n";
    const bad = keyNames.filter((k) => new RegExp("['\"]" + k + "['\"]").test(faked));
    ok(bad.length === 1, '⑬k 자명 통과 금지 — 키 이름을 한 개 박으면 ⑬b 가 잡는다', bad.join(' '));
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ⑭ ★★★[T358] 이음새 — **반복 파일은 끝과 머리가 이어져야 한다**
//
//   T354 가 새 물·비 루프를 만들며 자 하나를 세웠다: **끝↔머리 표본 차 ÷ 이웃 표본 차 평균**(dB).
//   0 보다 작으면 이음새가 평소 파형 움직임보다 **작다** = 안 들린다. 크면 10초마다 딸깍이 난다.
//   그 자를 옛 파일에 대 보니 **`wind.ogg` 가 +25.2 dB**, 옛 `water.ogg` 가 +12.0 dB 였다 —
//   T262 부터 아무도 안 재 봤고, 재민이 바람을 "바람이 아니라 그냥 공기 소리" 라 한 것의
//   **일부가 이 딸깍**이었다. 자가 한 번 쓰고 사라지면 다음에 또 같은 파일이 들어온다 ⇒ 절로 박는다.
//
//   ⚠BGM 13곡은 **재지 않는다.** 곡은 반복이 아니라 한 번 흐르고 마는 것이고(엔진은 절차적이라
//     그 파일들을 런타임이 읽지도 않는다), 곡의 끝과 머리를 이으라는 요구가 애초에 없다.
//   ⚠자는 **wav 로 디코드해서** 잰다(ogg 는 압축이라 바이트로는 못 잰다). `ffmpeg` 가 없으면
//     이 절은 **건너뛴다고 말하고** 건너뛴다 — 조용히 초록이 되지 않는다.
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑭ ★★[T358] 이음새 — 반복 파일의 끝과 머리');
{
  const { execFileSync, spawnSync } = require('child_process');
  const haveFfmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
  const loopKeys = keyNames.filter((k) => KEYS[k].loop && KEYS[k].file);
  ok(loopKeys.length >= 4, '⑭a 전제: 반복 키가 여럿이다(0 이면 아래가 자명 통과다)', `${loopKeys.length}종 · ${loopKeys.join(' ')}`);

  if (!haveFfmpeg) {
    ok(false, '⑭b ffmpeg 이 없어 이음새를 **못 쟀다**(조용히 넘어가지 않는다 — 자가 없으면 없다고 말한다)');
  } else {
    /** 끝↔머리 차 ÷ 이웃 표본 차 평균 (dB). 작을수록 매끈. */
    const seamDb = (file) => {
      const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '44100', '-'],
                               { maxBuffer: 1 << 28 });
      const y = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
      if (y.length < 1000) return null;
      let sum = 0;
      for (let i = 1; i < y.length; i++) sum += Math.abs(y[i] - y[i - 1]);
      const typ = sum / (y.length - 1);
      const jump = Math.abs(y[0] - y[y.length - 1]);
      return 20 * Math.log10(Math.max(jump, 1e-9) / Math.max(typ, 1e-9));
    };
    const rows = [];
    for (const k of loopKeys) {
      const f = path.join(SFX_DIR, KEYS[k].file);
      let d = null;
      try { d = seamDb(f); } catch (e) { d = null; }
      rows.push({ k, d });
    }
    console.log('    ── 끝↔머리 차 ÷ 이웃 표본 차 평균 ──');
    for (const r of rows) console.log(`      ${r.k.padEnd(12)} ${r.d === null ? '못 잼' : (r.d >= 0 ? '★' : ' ') + r.d.toFixed(1).padStart(6) + ' dB'}`);
    const unread = rows.filter((r) => r.d === null);
    ok(unread.length === 0, '⑭b 반복 파일을 다 읽었다', unread.map((r) => r.k).join(' ') || `${rows.length}장`);
    const bad = rows.filter((r) => r.d !== null && r.d >= 0);
    ok(bad.length === 0,
       '⑭c ★★★반복 키의 이음새가 전부 **0 dB 아래**다(끝↔머리 차가 평소 움직임보다 작다 = 안 들린다)',
       bad.length ? bad.map((r) => `${r.k} ${r.d.toFixed(1)}dB — 10초마다 딸깍`).join(' · ')
                  : rows.map((r) => `${r.k} ${r.d.toFixed(1)}`).join(' · '));

    // ⑭d ★★자명 통과 금지 — **문턱을 비틀면** 지금 성한 판정이 뒤집히는가.
    //    T354 가 실제로 본 값(`wind.ogg` +25.2 dB)이 있으므로, 문턱을 +30 으로 올리면
    //    **그 파일조차 통과**한다. 그 반례가 없으면 이 절은 "아무 문턱이나 통과"하는 자다.
    {
      const loose = rows.filter((r) => r.d !== null && r.d >= 30);
      ok(loose.length === 0 && rows.some((r) => r.d !== null),
         '⑭d 자명 통과 금지 — 문턱을 +30 dB 로 풀면 **지금 빨간 것도 통과한다**(그래서 0 이 문턱이다)',
         `+30 문턱에서 걸리는 파일 ${loose.length}개 — 문턱이 헐거우면 자가 아무것도 안 잰다`);
    }
    // ⑭e ★대조 — 일부러 어긋낸 파형은 **반드시** 잡힌다(자가 살아 있다)
    {
      const n = 44100, y = new Float32Array(n);
      for (let i = 0; i < n; i++) y[i] = Math.sin(i * 0.01) * 0.5;   // 끝과 머리가 안 맞는 사인
      let sum = 0; for (let i = 1; i < n; i++) sum += Math.abs(y[i] - y[i - 1]);
      const d = 20 * Math.log10(Math.abs(y[0] - y[n - 1]) / (sum / (n - 1)));
      ok(d >= 0, '⑭e 대조 — 끝과 머리가 안 맞는 파형은 같은 자로 **0 dB 위**로 잡힌다', `${d.toFixed(1)} dB`);
    }
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// ⑮ ★★★[T387] 사람/전투 11자리 — 사건만 운다 · 서버가 실제로 보내는 이름 · 표가 정본
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑮ ★★[T387] 사람/전투 — 사건 넷은 표로 · 상태 동기화 일곱은 무음');
{
  const CB = man.combat || {};
  const rows = Object.entries(CB).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string');
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const ELEVEN = ['arrow_spawn', 'arrow_removed', 'hp_changed', 'player_attacked', 'player_down_state',
                  'player_downed', 'player_respawn', 'pvp_state', 'war_command_ack', 'self_stat', 'death'];
  const QUIET = ['arrow_removed', 'hp_changed', 'player_down_state', 'pvp_state', 'war_command_ack', 'self_stat'];
  ok(rows.length === 5, '⑮a 표 `combat` 에 사건 다섯(쏨·휘두름·쓰러짐·깨어남 + [T402] 남의 쓰러짐)', rows.map(([k, v]) => `${k}→${v}`).join(' · '));
  const badKey = rows.filter(([, v]) => !KEYS[v] || !KEYS[v].file || KEYS[v]['후보']);
  ok(badKey.length === 0, '⑮b 표가 가리키는 키가 전부 파일 있는 **배선** 키다(후보를 가리키면 판정 전 소리가 난다)', badKey.map(([k, v]) => `${k}→${v}`).join(' ') || '전부');
  // ⑮c ★서버가 **정말 보내는** 이름인가 — 철자가 아니라 `type: '<이름>'` 전문 꼴로 본다
  const sent = (n) => new RegExp(`type:\\s*'${n}'`).test(zsrc);
  const phantom = rows.filter(([k]) => !sent(k));
  ok(phantom.length === 0, '⑮c ★표의 메시지 이름이 전부 `zone.js` 에서 **실제로 나간다**(허공의 이름이면 영영 무음)', phantom.map(([k]) => k).join(' ') || rows.map(([k]) => k).join(' '));
  ok(!sent('player_attacked_zz'), '⑮c2 자명 통과 금지 — 없는 이름은 `sent` 가 거짓을 낸다');
  // ⑮d ★★상태 동기화는 표에 없다 — 11 중 여섯 + `death`(인벤 낱말)
  // [T402] `player_down_state` 는 **`combatOnly` 가 `why:'down'` 만 거를 때** 표에 있어도 된다(쓰러짐 ≠ 업힘 ≠ 재접속).
  const ONLY = man.combatOnly || {};
  const gated = (n) => ONLY[n] && ONLY[n].why === 'down' && ONLY[n]._남만 === true;
  const leaked = QUIET.filter((n) => typeof CB[n] === 'string' && !gated(n));
  ok(typeof CB.player_down_state !== 'string' || gated('player_down_state'),
     '⑮d0 [T402] 남의 쓰러짐은 `combatOnly{why:down, _남만}` 으로만 운다(업힘·내려놓음·재접속 0 · 내 것은 `player_downed`)', JSON.stringify(ONLY.player_down_state || null));
  ok(leaked.length === 0, '⑮d ★★상태 동기화 여섯은 표에 **없다**(HP 눈금·배지·UI 응답·화살 사라짐·갈증 동기)', leaked.join(' ') || QUIET.join(' '));
  const whereTbl = man.inventoryWhere || {};
  ok(typeof whereTbl.death !== 'string', '⑮e ★`inventory where:death` 는 안 운다 — 죽어 쏟기는 `drop` 이 이미 운다(두 번 울지 않는다)', `inventoryWhere.death = ${whereTbl.death}`);
  // ⑮f ★그 '이미 운다' 가 사실인가 — `_deathDrop` → `_spawnGroundItems` → `ground_item_added` 를 **함수 몸통**에서 읽는다
  const body = (name) => { const i = zsrc.indexOf(`function ${name}(`); if (i < 0) return '';
    let d = 0, j = zsrc.indexOf('{', i); const st = j; for (; j < zsrc.length; j++) { if (zsrc[j] === '{') d++; else if (zsrc[j] === '}') { d--; if (!d) break; } } return zsrc.slice(st, j + 1); };
  const dd = body('_deathDrop'), sg = body('_spawnGroundItems');
  ok(/_spawnGroundItems\(/.test(dd) && /type:\s*'ground_item_added'/.test(sg) && man.groundDrop && KEYS[man.groundDrop.key],
     '⑮f ★죽어 쏟기 → `ground_item_added` → `groundDrop.key` 길이 코드에 있다(몸통 괄호 맞춤으로 읽음)',
     `_deathDrop ${dd.length}자 · _spawnGroundItems ${sg.length}자 · key ${man.groundDrop && man.groundDrop.key}`);
  ok(dd.length > 200 && sg.length > 200, '⑮f2 자 전제 — 두 몸통을 실제로 찾았다(0 자면 ⑮f 는 허공을 읽는다)', `${dd.length} · ${sg.length}`);
  // ⑮g ★층은 메시지 이름을 **코드에** 안 박는다(주석 빼고) — 표가 정본
  const stripC = require('./code-only.js');   // 주석 제거기 **정본**(T171 · 사본 0 — 정규식 판은 문자열 속 `//` 에 먹힌다)
  const layerCode = stripC(modCode);
  const spelled = ELEVEN.filter((n) => new RegExp(`['"\`]${n}['"\`]`).test(layerCode));
  ok(spelled.length === 0, '⑮g ★층 코드(주석 제외)에 11자리 이름이 **문자열로 박혀 있지 않다**', spelled.join(' ') || '0개');
  ok(new RegExp(`['"\`]fish_state['"\`]`).test(layerCode), '⑮g2 자명 통과 금지 — 같은 자가 박힌 이름(`fish_state`)은 잡는다');
  // ⑮h ★★'나' 는 주 연결에서만 — pid 는 존마다 `p${nextPid++}` 로 센다(관전 연결의 p1 ≠ 나)
  ok(/pid\s*=\s*`p\$\{nextPid\+\+\}`/.test(zsrc), '⑮h 전제 — pid 가 존 지역 번호다(`p${nextPid++}`)');
  ok(/c\.role\s*===\s*'primary'/.test(layerCode) && /_sfxMan\.combat/.test(layerCode), '⑮h2 ★★층이 \'나\' 를 **주 연결에서만** 가른다(`c.role === \'primary\'`)');
  // ⑮k ★같은 이름의 **재송신**은 안 운다 — 서버가 복원용으로 다시 보내는 자리를 **서버 코드에서** 찾아 표와 맞댄다
  const reSends = [...zsrc.matchAll(/type:\s*'([a-z_]+)'[^}]*?source:\s*'relogin'/g)].map((m) => m[1]);
  const SKIP = man.combatSkip || {};
  const unskipped = reSends.filter((n) => typeof CB[n] === 'string' && !(SKIP[n] && SKIP[n].source === 'relogin'));
  ok(reSends.length >= 1 && unskipped.length === 0,
     '⑮k ★서버의 `source:\'relogin\'` 재송신이 `combat` 에 있으면 `combatSkip` 이 거른다(접속할 때마다 쓰러지는 소리 0)',
     unskipped.join(' ') || `재송신 ${reSends.join(' ')} → 거름`);
  ok(/_sfxMan\.combatSkip/.test(layerCode), '⑮k2 층이 `combatSkip` 표를 읽는다');
  // ⑮i 후보는 짝이 있다 — `<키>_b` 는 배선된 `<키>` 의 2번이다
  const bees = keyNames.filter((k) => /_b$/.test(k) && KEYS[k]['후보']);
  //   [T397] 1번도 후보일 수 있다(배선 보류 — 사건이 아직 없거나 서버 낱말이 모자란다). 그땐 **보류 사유**를 적어야 한다.
  const lone = bees.filter((k) => { const a = KEYS[k.replace(/_b$/, '')]; return !a || (a['후보'] && !Object.keys(a).some((f) => /^_T\d+/.test(f))); });
  ok(bees.length >= 1 && lone.length === 0, '⑮i 후보 2번은 전부 1번과 짝이다(1번이 후보면 보류 사유 칸이 있다 · 소리판에서 나란히 견준다)', lone.join(' ') || bees.map((k) => `${k.replace(/_b$/, '')}/${k}`).join(' · '));
  // ⑮j ★변주도 m4a 짝이 디스크에 있다 — Safari 는 `files` 도 m4a 로 받는다(T387 이 고친 자리)
  const varKeys = keyNames.filter((k) => Array.isArray(KEYS[k].files));
  const noPair = [];
  for (const k of varKeys) for (const f of KEYS[k].files) { const nm = typeof f === 'string' ? f : f.file;
    if (!fs.existsSync(path.join(PUB, 'assets', 'sfx', nm.replace(/\.ogg$/, '.m4a')))) noPair.push(nm); }
  ok(varKeys.length >= 2 && noPair.length === 0, '⑮j ★변주 파일마다 m4a 짝이 있다(ogg 못 여는 브라우저가 변주 키에서 무음이 되지 않게)', noPair.join(' ') || varKeys.map((k) => `${k}×${KEYS[k].files.length}`).join(' · '));
  ok(/\.replace\(\/\\\.ogg\$\/,\s*'\.m4a'\)/.test(layerCode) && /sfxSrcOf\(m\)\s*===\s*m\.fileAlt/.test(layerCode),
     '⑮j2 층이 변주에도 단일 파일과 **같은 규칙**(`sfxSrcOf`)으로 짝을 고른다');
}


// ══════════════════════════════════════════════════════════════════════════════
// ⑯ ★★[T397] 맞음 낱말 · 표면 타일 · 눈
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑯ ★★[T397] `hp_changed.why` · 표면 타일 · 눈이면 빗소리 0');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const stripC = require('./code-only.js');
  const layerCode = stripC(modCode);
  const sends = [...zsrc.matchAll(/\{\s*type:\s*'hp_changed'[^}]*\}/g)].map((m) => m[0]);
  ok(sends.length === 2 && sends.every((x) => /why:\s*why\s*\|\|\s*''/.test(x)),
     '⑯a ★서버의 `hp_changed` 전문 두 자리가 전부 `why` 를 싣는다(T397 두 줄 · 새 낱말 0 — `setHp` 의 인자)', `${sends.length}자리`);
  // ⑯b ★★[T402] `damagePlayer` 가 **출처 앞 낱말**을 `why` 로 보낸다 — 극단 감소는 이제 `extreme` 이다
  const H = man.hpWhy || {};
  ok(/setHp\(p,\s*p\.hp\s*-\s*dmg,\s*String\(source \|\| 'damage'\)\.split\(':'\)\[0\]\)/.test(zsrc) && /damagePlayer\(p,\s*_hpDmg,\s*`extreme:/.test(zsrc),
     '⑯b 전제 — `damagePlayer` 가 출처 앞 낱말을 `why` 로 보내고, 극단 감소의 출처는 `extreme:` 이다(T402 서버 한 줄)');
  ok(typeof H.extreme !== 'string' && typeof H.food !== 'string' && typeof H.damage !== 'string',
     '⑯b2 ★★`extreme`(추위 3.6초마다 1HP)·`food`(회복/독)·`damage` 는 표에 **없다** — 추위 속에서 맞는 소리 0',
     ['extreme', 'food', 'damage'].filter((w) => typeof H[w] === 'string').join(' ') || '0개');
  const srcWords = [...new Set([...zsrc.matchAll(/damagePlayer\([^,]+,[^,]+,\s*[`']([a-z]+)[:`']/g)].map((x) => x[1]))];
  const HIT = ['arrow', 'mob', 'player', 'fall', 'wild'];
  ok(HIT.every((w) => H[w] === 'hit_body') && HIT.filter((w) => w !== 'wild').every((w) => srcWords.includes(w)),
     '⑯b5 맞음 낱말(arrow·mob·player·fall·wild)이 `hit_body` 로 가고, 그 낱말이 **서버 호출부에 실제로 있다**', `호출부 ${srcWords.sort().join(',')}`);
  ok(H._msgType === 'hp_changed' && /_sfxMan\.hpWhy/.test(layerCode), '⑯b3 층이 메시지 이름까지 **표에서** 읽는다(`hpWhy._msgType`)');
  const HEAL = ['food', 'dish', 'rescue', 'debug', 'regen', 'respawn', 'takeover'];
  ok(HEAL.every((w) => typeof H[w] !== 'string'), '⑯b4 회복·먹기·구조 낱말은 표에 없다(소리가 아니다)', HEAL.filter((w) => typeof H[w] === 'string').join(' ') || '0개');
  // ⑯c 표면 타일 — 표의 타입이 **정말 그려지는 건물 타입**이고, 순서가 셋을 다 덮는다
  const S = man.surface || {};
  const types = Object.keys(S).filter((k) => !k.startsWith('_'));
  const bsrc = fs.readFileSync(path.join(PUB, 'client', '36-r2-building.js'), 'utf8');
  const drawn = types.filter((t) => new RegExp(`type === '${t}'`).test(bsrc));
  ok(types.length === 3 && drawn.length === 3, '⑯c 표면 타입 셋이 전부 클라가 **그리는** 건물 타입이다(`36-r2-building`)', drawn.join(' '));
  ok(Array.isArray(S._순서) && types.every((t) => S._순서.includes(t)), '⑯c2 겹침 순서가 셋을 다 덮는다', (S._순서 || []).join(' > '));
  ok(types.every((t) => KEYS[S[t]] && KEYS[S[t]].file && !KEYS[S[t]]['후보']), '⑯c3 표면 키가 전부 파일 있는 배선 키다', types.map((t) => `${t}→${S[t]}`).join(' · '));
  ok(/sfxSurfaceKeyAt\(cell\)/.test(layerCode) && /Math\.floor\(b\.x \/ 32\)/.test(layerCode), '⑯c4 발자국 판정이 표면을 먼저 본다(셀 환산은 지면 그리기와 같은 식)');
  // ⑯d 눈 — 판정은 그리는 층의 것(사본 0)
  const wsrc = fs.readFileSync(path.join(PUB, 'client', '37-r1-weather.js'), 'utf8');
  ok(/kind:\s*snow \? 'snow' : 'rain'/.test(wsrc) && /__rainDbg/.test(layerCode) && /_sfxWxKind === 'snow'/.test(layerCode),
     '⑯d ★눈이냐 비냐는 **그리는 층의 판정**(`37-r1-weather` `kind`)을 읽는다 — 층이 어는점을 다시 안 짓는다');
  ok(!/tempC\s*<\s*0/.test(layerCode), '⑯d2 층 코드에 어는점 사본(`tempC < 0`)이 없다');
  // ⑯e 사건 없는 소리는 안 잇는다 — 천둥·고인 물은 후보뿐
  const noEvent = ['thunder', 'thunder_b', 'water_pool', 'water_pool_b'];
  ok(noEvent.every((k) => KEYS[k] && KEYS[k]['후보'] && KEYS[k].file), '⑯e 천둥(세계가 안 보냄)·고인 물(카드: 후보만)은 **후보**로만 있다', noEvent.join(' '));
}


// ══════════════════════════════════════════════════════════════════════════════
// ⑰ ★★[T412] 도구/작업 — 건물·줍기·심기·궤·가마
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑰ ★★[T412] 도구/작업 — 사건만 운다 · 서버가 실제로 보내는 자리 · 표가 정본');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const layerCode = require('./code-only.js')(modCode);
  const fnOf = (line) => { const lines = zsrc.split('\n'); for (let i = line - 1; i >= 0; i--) { const m = /^(?:async )?function ([A-Za-z_0-9]+)\(/.exec(lines[i]); if (m) return m[1]; } return null; };
  const sitesOf = (type) => zsrc.split('\n').map((l, i) => (new RegExp(`type:\\s*'${type}'`).test(l) ? fnOf(i + 1) : null)).filter(Boolean);
  // ⑰a 줍기 — `ground_item_removed` 는 줍기 함수에서만 나간다(그래서 '누가 주웠다' 로 읽어도 된다)
  const gr = [...new Set(sitesOf('ground_item_removed'))];
  ok(gr.length === 1 && gr[0] === 'tryPickupItem', '⑰a ★`ground_item_removed` 는 `tryPickupItem` 에서만 나간다(= 줍기 · 썩어 사라짐이 아니다)', gr.join(' '));
  ok(man.groundPick && KEYS[man.groundPick.key] && typeof (man.inventoryWhere || {}).pickup !== 'string',
     '⑰a2 줍기는 방송 한 길로만 운다 — `inventory where:pickup` 은 표에 없다(두 번 0)');
  // ⑰b 궤 — `chest_state` 는 넣기·꺼내기 뒤에만 나간다
  const cs = [...new Set(sitesOf('chest_state'))].sort();
  ok(JSON.stringify(cs) === JSON.stringify(['tryChestPut', 'tryChestTake']), '⑰b `chest_state` 는 궤에 넣기·꺼내기 뒤에만 나간다(= 사건)', cs.join(' '));
  // ⑰c 터 — 지워지는 자리가 **단계 오름**이면 조용(새 것이 선다)
  const rmSites = [...new Set(sitesOf('building_removed'))].sort();
  const advance = rmSites.filter((f) => /Advance/.test(f));
  const Q = (man.buildRemoved || {})._조용 || [];
  ok(advance.length >= 3 && ['hut_site', 'kiln_site', 'furnace_site', 'shelter_site'].every((x) => Q.includes(x)),
     '⑰c ★터가 다음 단계로 **바뀌는** 지움(`*Advance`)은 `build_break` 로 안 운다 — 터 타입이 `_조용` 에 있다', `지우는 자리 ${rmSites.join(' ')}`);
  // ⑰d 가장자리 규칙 — 표의 칸이 서버 코드에서 실제로 켜지고 꺼진다
  const E = man.buildEdge || [];
  const bad = E.filter((R) => !(Array.isArray(R.types) && R.field && (!R.on || KEYS[R.on]) && (!R.off || KEYS[R.off])
                        && new RegExp(`data\\.${R.field}\\s*=|delete b\\.data\\.${R.field}|${R.field}:`).test(zsrc)));
  ok(E.length === 3 && bad.length === 0, '⑰d `buildEdge` 규칙 셋의 칸(open·job·crop)이 서버에서 실제로 바뀌고, 키가 표에 있다', bad.map((R) => R.field).join(' ') || E.map((R) => `${R.types.join('/')}.${R.field}`).join(' · '));
  const farm = E.find((R) => R.types.includes('farmland'));
  ok(farm && !farm.off, '⑰d2 밭 `crop` 꺼짐(수확)은 **안 잇는다** — 사람 수확은 `where:harvest` 가 이미 운다(두 번 0)');
  // ⑰e 가마 불 — 반복 소리는 `job` 이 있을 때만
  ok((man.buildings || {}).furnace === 'fire' && (man.buildingsWhen || {}).furnace && man.buildingsWhen.furnace.field === 'job'
     && /_sfxMan\.buildingsWhen/.test(layerCode), '⑰e 노·숯가마 불소리는 `data.job` 이 있을 때만(꺼진 가마가 타는 소리 0)');
  // ⑰f 심기 — 새 id 만(자람·열매 갱신 0)
  ok(/c\.resources\.has\(r\.id\)/.test(layerCode) && (man.resourceNew || {}).sapling === 'dig', '⑰f 묘목 심기는 **처음 보는 id** 일 때만(`resource_spawn` 의 자람·열매 갱신은 같은 id)');
  // ⑰g 상태 동기화는 표에 없다
  const SYNC = ['buildings_spawn', 'buildings_removed', 'resources_spawn', 'resources_removed', 'rooms_update', 'craft_queue', 'claim_added', 'claim_removed', 'claim_updated', 'tools', 'equipment', 'dishes', 'facility', 'plant_menu', 'preserve_menu', 'cast_preview', 'floor_changed'];
  const W = man.work || {}, CB = man.combat || {};
  const leak = SYNC.filter((n) => typeof W[n] === 'string' || typeof CB[n] === 'string');
  ok(leak.length === 0, '⑰g ★★상태 동기화 열일곱은 표에 없다', leak.join(' ') || `${SYNC.length}종`);
  ok(sitesOf('craft_queue').length >= 1, '⑰g2 자 전제 — 그 이름들이 서버에 실제로 있다(없는 이름을 막는 자는 아무것도 안 막는다)');
}


// ══════════════════════════════════════════════════════════════════════════════
// ⑱ ★★[T417] 동물 · 제작 완료 · 자리로 부르는 키의 반경
// ══════════════════════════════════════════════════════════════════════════════
console.log('\n⑱ ★★[T417] 동물 · 제작 완료 · 반경');
{
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const layerCode = require('./code-only.js')(modCode);
  // ⑱a ★★자리로 부르는 표의 키는 반경이 있다 — 반경 0 = 존 어디서 나도 귓가에서 최대 볼륨(T417 이 axe·harvest·downed 에서 찾았다)
  const POS = ['resourceHit', 'mobs', 'npcAct', 'groundDrop', 'fishState', 'combat', 'work', 'buildAdded', 'buildRemoved', 'buildDamaged', 'buildEdge', 'groundPick', 'resourceNew', 'hpWhy', 'mobEvents', 'buildings'];
  const posKeys = new Set();
  for (const t of POS) for (const x of tableStrings(man[t] || {}, 0)) if (KEYS[x]) posKeys.add(x);
  const flatOf = (K) => [...posKeys].filter((k) => !(K[k] && K[k].radius > 0));
  const flat = flatOf(KEYS);
  ok(posKeys.size >= 20 && flat.length === 0, '⑱a ★★자리로 부르는 표의 키 전부 반경 > 0(0 이면 존 반대편 소리가 귓가에서 최대 볼륨)', flat.join(' ') || `${posKeys.size}키`);
  const baitK = Object.assign({}, KEYS, { axe: Object.assign({}, KEYS.axe, { radius: 0 }) });   // 종전 표 그대로의 미끼
  ok(JSON.stringify(flatOf(baitK)) === JSON.stringify(['axe']), '⑱a2 자명 통과 금지 — 같은 술어에 `axe` 반경 0(종전 표)을 먹이면 **그 키 하나**를 잡는다', flatOf(baitK).join(' '));
  // ⑱b 종 울음 — 표의 종이 서버 동물 목록에 있다(새 종 0)
  const A = require(path.join(ROOT, 'server', 'animals.js')).ANIMALS;
  const sp = Object.keys(man.mobs || {}).filter((k) => !k.startsWith('_'));
  ok(sp.length >= 7 && sp.every((k) => A[k]), '⑱b `mobs` 표의 종이 전부 `server/animals.js` 에 있다(새 종 0)', sp.join(' '));
  // ⑱c 짐승 사건 — 맞음은 hp 가 **줄 때만**(먹여 회복 `tryFeed` 도 같은 메시지)
  ok(/function tryFeed[\s\S]{0,1500}type: 'mob_damaged'/.test(zsrc) && /msg\.hp < m\.hp/.test(layerCode),
     '⑱c ★`mob_damaged` 는 먹여 회복에도 나간다 — 층은 직전 hp 보다 **줄 때만** 운다');
  const ME = man.mobEvents || {};
  ok(KEYS[ME.hurt] && KEYS[ME.death] && ME.tamedCall === true, '⑱c2 `mobEvents` 의 키가 표에 있다(맞음·죽음 · 길들임 = 종 울음)', `${ME.hurt} · ${ME.death}`);
  // ⑱d 제작 완료 — 서버 한 줄(`doCraftCollect` 안 · 받은 게 있을 때) · 맡김은 낱말 없음
  const collect = zsrc.slice(zsrc.indexOf('function doCraftCollect('), zsrc.indexOf('function doCraftCollect(') + 4000);
  const enq = zsrc.slice(zsrc.indexOf('function _enqueueCraft('), zsrc.indexOf('function _enqueueCraft(') + 2500);
  ok((zsrc.match(/sendInventory\(player, 'craft'\)/g) || []).length === 1 && /sendInventory\(player, 'craft'\)/.test(collect) && !/'craft'\)/.test(enq),
     '⑱d ★제작·보존 **받음**만 `where:craft` 를 댄다(서버 한 줄 · 맡김 무변)');
  ok((man.inventoryWhere || {}).craft === 'craft_done', '⑱d2 층 표 `inventoryWhere.craft → craft_done`(T412 이 확보한 그 키)');
}

console.log(`\n=== PASS ${pass} / FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
