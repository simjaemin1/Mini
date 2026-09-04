#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 인벤 아이콘 대조 하네스 [T72 · T76 2026-09-03] ================================
//
// 계약:
//   ① 굽는 표 ↔ 파일 전수 — `props_render.py` 의 `ITEMS` 가 선언한 키마다 PNG 가 있고 **96×96** 이다.
//   ② 알파가 살아 있다 — 투명 화소와 불투명 화소가 **둘 다** 있다(꽉 찬 사각형·빈 장이면 잡는다).
//   ③ 키가 **서버 품목**이다 — `server/weights.js kgOf(key)` 가 null 이 아니어야 한다.
//      (아이콘 키를 지어내면 인벤에 영영 안 뜬다. 화면이 아니라 **정본**에 물어본다.)
//   ④ 404 가 날 수 없다 — 클라가 실제로 **요청하는** 키(★T66 뒤로 `ICON_RENDERED` 하나)는
//      전부 파일이 있어야 한다. `e2e-nature` 의 "자산 요청 404 없음"을 소스 층에서 미리 잡는다.
//   ⑤ 배선 상태 — 새로 구운 키가 클라 표에 올랐는지 **세어서 보고**한다.
//   ⑥ [T76] 원물 → 보존식 **계보** — 두 겹으로 본다:
//      ⓐ 서버가 그 짝을 인정하는가(`spoil.PRESERVE` 의 from→out 을 소스에서 읽어 대조)
//      ⓑ **같은 모델 함수**에서 나오는가(`props_render.py` 에서 두 `m_*` 가 같은 `_빌더` 를 부른다)
//      ★픽셀 상관은 **판정에 안 쓴다** — 측정해 보니 못 쓴다(아래 ⑥-★). 숫자는 기록만 한다.
//      ⚠T72 착지 시점에 `43-i-icon.js` 는 T66(세션4) 이 만지는 중이라 **접점을 회부했다**(카드 §1).
//        ★T66 이 리베이스에서 그 배선을 했다 — 지금 '회부 중'은 0 이다. 표기는 그대로 둔다(다음 굽기 때 또 쓴다).
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
  // ★★[T66 착지] 정본이 바뀌었다. 옛 `ITEM_ICONS`(키 → 이모지 폴백)은 **삭제**됐고,
  //   지금 클라가 그림을 요청하는 키는 `ICON_RENDERED` **하나**다(있으면 <img>, 없으면 점선 빈 칸).
  //   거부 목록(`ICON_NO_RENDER`)도 그 집합의 여집합으로 바뀌어 따로 읽을 것이 없다.
  const tbl = src.match(/const ICON_RENDERED = new Set\(\[([\s\S]*?)\]\);/);
  ok(!!tbl, '43-i-icon.js 에서 `ICON_RENDERED` 표를 읽었다');
  const wanted = tbl ? [...tbl[1].matchAll(/'([\w]+)'/g)].map(m => m[1]) : [];
  const denied = new Set();
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
    if (absent.length) console.log(`       · ICON_RENDERED 에 키 추가: ${absent.join(', ')}`);
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

// ── ⑦ [T79] 작물 수확물 14 + 씨앗 14 ───────────────────────────
console.log('\n[⑦ 작물 아이콘 a — 수확물 14 · 씨앗 14 (models_crops.py 가 굽는 표)]');
{
  const CROP_PY = path.join(ROOT, 'scripts', 'models_crops.py');
  const cpy = fs.existsSync(CROP_PY) ? fs.readFileSync(CROP_PY, 'utf8') : null;
  ok(!!cpy, 'scripts/models_crops.py 가 있다');
  if (cpy) {
    const lb = cpy.match(/^CROPS_A = \[([\s\S]*?)\]/m);
    ok(!!lb, 'models_crops.py 에서 CROPS_A 를 읽었다');
    const CA = lb ? [...lb[1].matchAll(/'([a-z_0-9]+)'/g)].map(m => m[1]) : [];
    ok(CA.length === 14, `수확물 14종 (실측 ${CA.length})`);
    const ALL = [...CA, ...CA.map(c => 'seed_' + c)];

    // ⓐ 파일 · 96×96 · 알파가 살아 있다
    let bad = 0;
    for (const k of ALL) {
      const p = path.join(ICON_DIR, k + '.png');
      if (!fs.existsSync(p)) { ok(false, `${k}.png 없음`); bad++; continue; }
      const m = pngMeta(p);
      if (!(m.w === 96 && m.h === 96)) { ok(false, `${k}.png ${m.w}×${m.h} (96 아님)`); bad++; }
      else if (!(m.clear > 0 && m.solid > 0)) { ok(false, `${k}.png 알파가 죽었다 (투명 ${m.clear} · 불투명 ${m.solid})`); bad++; }
    }
    ok(bad === 0, `28장 전수 — 96×96 · 알파 살아 있음 (어긋남 ${bad})`);

    // ⓑ 키가 **서버 품목**이다 — 씨앗은 `crops.js` 의 씨앗 규약을 따른다(§0-ⓐ)
    let C = null; try { C = require(path.join(ROOT, 'server', 'crops.js')); } catch (e) {}
    ok(!!C, 'server/crops.js 를 읽었다(씨앗 id 정본)');
    if (C) {
      const notCrop = CA.filter(k => !C.isCrop(k));
      ok(notCrop.length === 0, `수확물 키 14개가 전부 서버 작물이다 ${notCrop.length ? '— 아닌 것: ' + notCrop.join(', ') : ''}`);
      const badSeed = CA.filter(k => !C.isSeed('seed_' + k) || C.cropOfSeed('seed_' + k) !== k);
      ok(badSeed.length === 0, `씨앗 키 14개가 서버 규약(seedOf/cropOfSeed)과 맞물린다 ${badSeed.length ? '— 아닌 것: ' + badSeed.join(', ') : ''}`);
      // 무게가 갈린다 — 씨앗은 한 줌이다(그림을 크기로 못 가르는 이유이자, 그릇으로 가른 근거)
      const w0 = C.kgOf(CA[0]), w1 = 0.02;
      console.log(`     무게 — 작물 ${C.kgOf('rice')}kg vs 씨앗 ${w1}kg (${Math.round(C.kgOf('rice') / w1)}배). ` +
                  '크기로는 못 가른다(96px 꽉 채움) ⇒ **그릇**으로 갈랐다: 이삭·꼬투리 vs 토기 접시.');
    }

    // ⓒ 계보 — 수확물과 씨앗이 **같은 빌더**에서 나온다(T76 ⑥ 수법 재사용)
    const builderOf = (key) => {
      const i2 = cpy.indexOf(`def m_${key}(`);
      if (i2 < 0) return null;
      let seg = cpy.slice(i2);
      const nx = seg.indexOf('\ndef ', 1);
      seg = seg.slice(seg.indexOf('):') + 2, nx > 0 ? nx : 400);
      const c = seg.match(/(?<![A-Za-z0-9_])_([a-z_0-9]+)\(/);
      return c ? c[1] : null;
    };
    const split = [];
    for (const c of CA) {
      const a = builderOf(c), b = builderOf('seed_' + c);
      if (!a || !b || a !== b) split.push(`${c}(${a}) vs seed_${c}(${b})`);
    }
    ok(split.length === 0,
       `계보 14짝 — 수확물과 씨앗이 같은 빌더를 부른다 ${split.length ? '— 갈린 것: ' + split.join(' · ') : ''}`);
    const builders = [...new Set(CA.map(builderOf))].filter(Boolean);
    console.log('     빌더: ' + builders.join(' · ') + `  (모델 재사용 첫째 층 — 같은 함수 다른 인자)`);

    // ⓓ 배선 — 28키가 전부 클라 표에 있다
    const src = fs.readFileSync(CLIENT_ICON, 'utf8');
    const tb = src.match(/const ICON_RENDERED = new Set\(\[([\s\S]*?)\]\);/);
    const wired = tb ? new Set([...tb[1].matchAll(/'([\w]+)'/g)].map(m => m[1])) : new Set();
    const nw = ALL.filter(k => !wired.has(k));
    ok(nw.length === 0, `28키 전부 ICON_RENDERED 에 올랐다 ${nw.length ? '— 안 오른 것: ' + nw.join(', ') : ''}`);
  }
}

// ── ⑧ [T79] 굽는 기계 잠금 — icons.lock.json ─────────────────────
console.log('\n[⑧ 굽는 기계 정본 — icons.lock.json 이 지금 자산과 맞는가]');
{
  const LOCK = path.join(ROOT, 'public', 'assets', 'icons.lock.json');
  ok(fs.existsSync(LOCK), 'public/assets/icons.lock.json 이 있다');
  if (fs.existsSync(LOCK)) {
    const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
    ok(/^pip bpy /.test(lock._기계 || ''), `굽는 기계가 적혀 있다: ${lock._기계}`);
    // ★값은 **IDAT(화소 페이로드)** 해시다 — 파일 전체가 아니다.
    //   블렌더 원본 PNG 는 `Date`·`RenderTime` tEXt 를 박아 두 번 구우면 바이트가 늘 다르다(T79 실측).
    const idatSha = (p) => {
      const b = fs.readFileSync(p); let i = 8; const parts = [];
      while (i < b.length) {
        const ln = b.readUInt32BE(i), t = b.toString('ascii', i + 4, i + 8);
        if (t === 'IDAT') parts.push(b.subarray(i + 8, i + 8 + ln));
        i += 12 + ln;
      }
      return require('crypto').createHash('sha1').update(Buffer.concat(parts)).digest('hex').slice(0, 16);
    };
    for (const [grp, dir] of [['icons', ICON_DIR], ['props', path.join(ROOT, 'public', 'assets', 'props')]]) {
      const tbl = lock[grp] || {};
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.png')).map(f => f.slice(0, -4)).sort();
      const missing = files.filter(k => !(k in tbl));
      const orphan = Object.keys(tbl).filter(k => !files.includes(k));
      ok(missing.length === 0 && orphan.length === 0,
         `${grp}: 잠금표 ${Object.keys(tbl).length} ↔ 파일 ${files.length} 전수 일치` +
         (missing.length ? ` — 표에 없음: ${missing.slice(0, 4).join(', ')}` : '') +
         (orphan.length ? ` — 파일 없음: ${orphan.slice(0, 4).join(', ')}` : ''));
      const drift = files.filter(k => tbl[k] && tbl[k] !== idatSha(path.join(dir, k + '.png')));
      ok(drift.length === 0,
         `${grp}: 화소 해시가 잠금표와 같다 (어긋남 ${drift.length}${drift.length ? ' — ' + drift.slice(0, 4).join(', ') : ''})`);
    }
    console.log('     ⇒ 다음 재굽기가 이 표와 대조한다. 기계를 바꾸면 여기가 먼저 빨개진다.');
  }
}

if (SELFTEST) {
  console.log('\n[--selftest] ②가 오염(투명 화소 0)을 잡았어야 한다.');
  console.log('결과: ' + (fail ? 'PASS(검사기가 오염을 잡았다)' : 'FAIL(자명 통과 — 검사기가 눈멀었다)'));
  process.exit(fail ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
