#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 인벤 아이콘 대조 하네스 [T72 · T76 2026-09-03] ================================
//
// 계약:
//   ① 굽는 표 ↔ 파일 전수 — `props_render.py` 의 `ITEMS` 가 선언한 키마다 PNG 가 있고 **96×96** 이다.
//   ② 알파가 살아 있다 — 투명 화소와 불투명 화소가 **둘 다** 있다(꽉 찬 사각형·빈 장이면 잡는다).
//   ③ 키가 **서버 품목**이다 — `server/weights.js kgOf(key)` 가 null 이 아니어야 한다.
//      (아이콘 키를 지어내면 인벤에 영영 안 뜬다. 화면이 아니라 **정본**에 물어본다.)
//   ④ 404 가 날 수 없다 — 클라가 실제로 **요청하는** 키(`ITEM_ICONS` − `ICON_NO_RENDER`)는
//      전부 파일이 있어야 한다. `e2e-nature` 의 "자산 요청 404 없음"을 소스 층에서 미리 잡는다.
//   ⑤ 배선 상태 — 새로 구운 키가 클라 표에 올랐는지 **세어서 보고**한다.
//   ⑥ [T76] 원물 → 보존식 **계보** — 두 겹으로 본다:
//      ⓐ 서버가 그 짝을 인정하는가(`spoil.PRESERVE` 의 from→out 을 소스에서 읽어 대조)
//      ⓑ **같은 모델 함수**에서 나오는가(`props_render.py` 에서 두 `m_*` 가 같은 `_빌더` 를 부른다)
//      ★픽셀 상관은 **판정에 안 쓴다** — 측정해 보니 못 쓴다(아래 ⑥-★). 숫자는 기록만 한다.
//      ⚠T72 착지 시점에 `43-i-icon.js` 는 T66(세션4) 이 만지는 중이라 **접점을 회부했다**(카드 §1).
//        그래서 여기서 배선은 **실패가 아니라 표기**다 — 배선이 오면 이 절의 '회부 중'이 0 이 된다.
//
// ★검사기는 정본을 스스로 찾는다(족보 79): 키 목록은 `props_render.py` 에서, 무게는 `weights.js` 에서,
//   배선은 클라 소스에서 **직접 읽는다**. 어느 표도 여기 옮겨 적지 않았다.
//
// 실행: node scripts/test-icons.js  [--selftest]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const ICON_DIR = path.join(ROOT, 'public', 'assets', 'icons');
const RENDER_PY = path.join(ROOT, 'scripts', 'props_render.py');
const CLIENT_ICON = path.join(ROOT, 'public', 'client', '43-i-icon.js');

function pngMeta(p) {                        // IHDR + IDAT 알파 — pngjs 로 읽는다(러너가 이미 무는 의존성)
  const { PNG } = require('pngjs');
  const png = PNG.sync.read(fs.readFileSync(p));
  let clear = 0, solid = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    if (png.data[i] === 0) clear++; else if (png.data[i] > 240) solid++;
  }
  return { w: png.width, h: png.height, clear, solid };
}

// ── ① 굽는 표에서 키를 읽는다 ────────────────────────────────────
console.log('[① 굽는 표(props_render.py ITEMS) ↔ 파일]');
const py = fs.readFileSync(RENDER_PY, 'utf8');
const itemsBlock = py.match(/^ITEMS = \[([\s\S]*?)^\]/m);
ok(!!itemsBlock, 'props_render.py 에서 ITEMS 표를 찾았다');
const KEYS = itemsBlock ? [...itemsBlock[1].matchAll(/\('([a-z_0-9]+)',\s*m_/g)].map(m => m[1]) : [];
ok(KEYS.length === 31, `아이콘 1·2차 31종 (실측 ${KEYS.length})`);
console.log('     ' + KEYS.join(' '));

const meta = {};
for (const k of KEYS) {
  const p = path.join(ICON_DIR, k + '.png');
  if (!fs.existsSync(p)) { ok(false, `${k}.png 없음`); continue; }
  meta[k] = pngMeta(p);
  ok(meta[k].w === 96 && meta[k].h === 96, `${k}.png ${meta[k].w}×${meta[k].h}`);
}

console.log('\n[② 알파가 살아 있다 — 투명·불투명이 둘 다 있다]');
for (const k of KEYS) {
  if (!meta[k]) continue;
  let m = meta[k];
  if (SELFTEST && k === 'pebble') m = { ...m, clear: 0 };   // 꽉 찬 사각형을 흉내 낸다
  ok(m.clear > 200 && m.solid > 200, `${k}: 투명 ${m.clear} · 불투명 ${m.solid} 화소`);
}

console.log('\n[③ 아이콘 키 = 서버 품목 키 (weights.kgOf 가 정본)]');
{
  const W = require(path.join(ROOT, 'server', 'weights.js'));
  for (const k of KEYS) {
    const kg = W.kgOf(k);
    ok(kg != null, `${k}: 서버 무게 ${kg == null ? '없음(가짜 키)' : kg + 'kg'}`);
  }
}

console.log('\n[④ 클라가 요청하는 키는 전부 파일이 있다 — 404 가 날 수 없다]');
{
  const src = fs.readFileSync(CLIENT_ICON, 'utf8');
  const tbl = src.match(/const ITEM_ICONS = \{([\s\S]*?)\n  \};/);
  ok(!!tbl, '43-i-icon.js 에서 ITEM_ICONS 표를 읽었다');
  const wanted = tbl ? [...tbl[1].matchAll(/(\w+)\s*:\s*'/g)].map(m => m[1]) : [];
  const noRender = src.match(/const ICON_NO_RENDER = new Set\(\[([\s\S]*?)\]\)/);
  const denied = new Set(noRender ? [...noRender[1].matchAll(/'([\w]+)'/g)].map(m => m[1]) : []);
  const requested = wanted.filter(k => !denied.has(k));
  const missing = requested.filter(k => !fs.existsSync(path.join(ICON_DIR, k + '.png')));
  ok(missing.length === 0,
    `요청 ${requested.length}키 전부 파일 있음 ${missing.length ? '— 없는 것: ' + JSON.stringify(missing) : ''}`);

  console.log('\n[⑤ 배선 상태 — 새 13키가 클라 표에 올랐나]');
  const wired = KEYS.filter(k => wanted.includes(k) && !denied.has(k));
  const stale = KEYS.filter(k => denied.has(k));            // 파일은 있는데 거부 목록에 남은 것
  const absent = KEYS.filter(k => !wanted.includes(k));     // 표에 키가 아예 없는 것
  console.log(`     배선됨 ${wired.length}: ${wired.join(' ') || '—'}`);
  console.log(`     회부 중 ${stale.length + absent.length}: ` +
              `${[...stale.map(k => k + '(거부목록)'), ...absent.map(k => k + '(표에 없음)')].join(' ') || '—'}`);
  if (stale.length + absent.length) {
    console.log('     ⚠ 배선은 `43-i-icon.js` 두 줄이다 — T66(세션4) 뒤로 회부(인계/회부.md 0-아이콘):');
    if (absent.length) console.log(`       · ITEM_ICONS 에 키 추가: ${absent.join(', ')}`);
    if (stale.length) console.log(`       · ICON_NO_RENDER 에서 제거: ${stale.join(', ')}`);
  }
  ok(true, `배선 ${wired.length} / 회부 중 ${stale.length + absent.length} (표기 전용 — 실패로 세지 않는다)`);
}

console.log('\n[⑥ 원물 → 보존식 계보 — 서버가 인정하고, 같은 모델에서 나오는가]');
{
  const lin = py.match(/^ITEM_LINEAGE = \[([\s\S]*?)\]/m);
  ok(!!lin, 'props_render.py 에서 ITEM_LINEAGE 를 읽었다');
  const PAIRS = lin ? [...lin[1].matchAll(/\('([a-z_]+)',\s*'([a-z_]+)'\)/g)].map(m => [m[1], m[2]]) : [];
  ok(PAIRS.length >= 3, `계보 짝 ${PAIRS.length}`);

  // ⓑ 서버가 그 짝을 인정하는가 — `spoil.js` PRESERVE 를 **소스에서** 읽는다(require 하면 서버가 뜬다)
  const spoil = fs.readFileSync(path.join(ROOT, 'server', 'spoil.js'), 'utf8');
  const block = spoil.slice(spoil.indexOf('const PRESERVE = {'));
  const srvPairs = new Set();
  for (const m of block.matchAll(/from:\s*(?:'([a-z_]+)'|_fishItems\(\))[\s\S]{0,80}?out:\s*'([a-z_]+)'/g)) {
    srvPairs.add(`${m[1] || '<어종>'}→${m[2]}`);
  }
  ok(srvPairs.size >= 6, `서버 PRESERVE 짝 ${srvPairs.size}: ${[...srvPairs].join(' ')}`);
  for (const [raw, dry] of PAIRS) {
    const okPair = srvPairs.has(`${raw}→${dry}`) || (raw === 'fish' && srvPairs.has(`<어종>→${dry}`));
    ok(okPair, `${raw} → ${dry}: 서버 PRESERVE 에 있다`);
  }

  // ⓒ 같은 모델 함수에서 나오는가 — 우연히 맞을 수 없는 계약이다
  const builderOf = (key) => {
    const i2 = py.indexOf(`def m_${key}(`);
    if (i2 < 0) return null;
    let seg = py.slice(i2);
    const nx = seg.indexOf('\ndef ', 1);
    seg = seg.slice(seg.indexOf('):') + 2, nx > 0 ? nx : 400);   // ★def 줄의 이름을 안 세게 `):` 뒤부터 본다
    const c = seg.match(/(?<![A-Za-z0-9_])_([a-z_0-9]+)\(/);
    return c ? c[1] : null;
  };
  for (const [raw, dry] of PAIRS) {
    const a = builderOf(raw), b = builderOf(dry);
    ok(!!a && a === b, `${raw} / ${dry}: 같은 모델 함수 _${a || '?'} / _${b || '?'}`);
  }

  // ⓓ 픽셀 IoU — **기록만 한다**(판정 근거 아님 · 아래 ★)
  const { PNG } = require('pngjs');
  const cache = {};
  const mk = (k) => cache[k] || (cache[k] = (() => {
    const p2 = PNG.sync.read(fs.readFileSync(path.join(ICON_DIR, k + '.png')));
    const out = new Uint8Array(96 * 96);
    for (let i = 0; i < 96 * 96; i++) out[i] = p2.data[i * 4 + 3] > 60 ? 1 : 0;
    return out;
  })());
  const iou = (a, b) => { const A = mk(a), B = mk(b); let n = 0, u = 0;
    for (let i = 0; i < A.length; i++) { if (A[i] && B[i]) n++; if (A[i] || B[i]) u++; } return u ? n / u : 0; };
  const all = [];
  for (let i = 0; i < KEYS.length; i++) for (let j = i + 1; j < KEYS.length; j++) all.push([iou(KEYS[i], KEYS[j]), KEYS[i], KEYS[j]]);
  all.sort((x, y) => y[0] - x[0]);
  console.log('     계보 짝 IoU: ' + PAIRS.map(([a, b]) => `${a}→${b} ${iou(a, b).toFixed(3)}`).join(' · '));
  console.log('     남남 최고 3: ' + all.slice(0, 3).map(([v, a, b]) => `${a}/${b} ${v.toFixed(3)}`).join(' · '));
  console.log('     ★픽셀 IoU 로는 계보를 못 가른다 — `icons-postprocess.js` 가 모든 아이콘을 96px 에 꽉 채우므로');
  console.log('       실루엣이 **담긴 그릇**에 지배된다(접시에 담은 셋이 서로 0.97~0.98 로 계보 짝보다 높다).');
  console.log('       그래서 판정은 ⓑ서버 짝 + ⓒ같은 모델 함수로 한다.');
  ok(true, '계보 IoU 기록 완료(판정 근거 아님 — 위 ★)');
}

if (SELFTEST) {
  console.log('\n[--selftest] ②가 오염(투명 화소 0)을 잡았어야 한다.');
  console.log('결과: ' + (fail ? 'PASS(검사기가 오염을 잡았다)' : 'FAIL(자명 통과 — 검사기가 눈멀었다)'));
  process.exit(fail ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
