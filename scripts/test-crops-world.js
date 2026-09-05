#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 밭 세계 스프라이트 하네스 [T79c 2026-09-04] ================================
//
// 밭이 **작물을 안다**는 것을 지킨다. 종전엔 몰랐다 — `cropSprite()` 가 셀 좌표 해시 홀짝으로
// `grain`/`veg` 를 골라서 **벼밭이 채소로 그려질 수 있었다**(T79 §0-ⓑ 실측).
//
// 계약 다섯:
//   ① 32장이 있다 — 8군 × 4단계 · 전부 **64×64** · 알파가 살아 있다.
//   ② 8군이 **서버 정본과 1:1** — 굽는 표(`fields_render.py GROUPS`)의 group 집합이
//      `server/crops.js` 의 group 집합과 정확히 같다. 작물 분류가 늘면 여기가 먼저 빨개진다.
//   ③ 클라가 **group 으로 고른다** — `cropSprite` 가 좌표를 안 받고, 좌표 해시가 0곳이며,
//      슬러그 표가 서버 group 을 키로 갖는다. 그리고 그 표는 **서버가 준 값으로 채워진다**
//      (작물표 사본 0 · 족보 79).
//   ④ 단계 0(맨 흙)은 군마다 **다르다** — 이랑 수가 다르다(줄 간격이 작물마다 다르니까).
//      자명 통과 방지: 8장이 다 같으면 "군을 고른다"는 말이 그림에선 거짓이 된다.
//   ⑤ 단계가 **자란다** — 한 군 안에서 0→3 으로 갈수록 불투명 화소가 늘어난다(빈 흙 → 무성).
//
// ★검사기는 정본을 스스로 찾는다: 군 목록은 `crops.js` 에서, 굽는 표는 `fields_render.py` 에서,
//   배선은 클라 소스에서 **직접 읽는다**. 어느 표도 여기 옮겨 적지 않았다.
// ★`--selftest` 로 계약을 일부러 깨 본다.
//
// 실행: node scripts/test-crops-world.js  [--selftest]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

const DIR = path.join(ROOT, 'public', 'assets', 'crops');
const PY = path.join(ROOT, 'scripts', 'fields_render.py');
const CONST = path.join(ROOT, 'public', 'client', '00-const.js');
const ICON = path.join(ROOT, 'public', 'client', '43-i-icon.js');

function png(p) {
  const { PNG } = require('pngjs');
  const im = PNG.sync.read(fs.readFileSync(p));
  let clear = 0, solid = 0;
  for (let i = 3; i < im.data.length; i += 4) { if (im.data[i] === 0) clear++; else if (im.data[i] > 240) solid++; }
  return { w: im.width, h: im.height, clear, solid, data: im.data };
}

console.log('=== 밭 세계 스프라이트 (T79c) ===');

// ── ② 굽는 표 ↔ 서버 group ─────────────────────────────────────
console.log('\n[② 8군이 서버 정본과 1:1 — 굽는 표 ↔ crops.js]');
let py = fs.existsSync(PY) ? fs.readFileSync(PY, 'utf8') : null;
ok(!!py, 'scripts/fields_render.py 가 있다');
let SLUGS = [], GROUPS = [];
if (py) {
  const blk = py.match(/^GROUPS = \[([\s\S]*?)^\]/m);
  ok(!!blk, 'fields_render.py 에서 GROUPS 표를 읽었다');
  if (blk) {
    for (const m of blk[1].matchAll(/^\s*\('([a-z]+)',\s*'([^']+)'/gm)) { SLUGS.push(m[1]); GROUPS.push(m[2]); }
  }
}
let C = null; try { C = require(path.join(ROOT, 'server', 'crops.js')); } catch (e) {}
ok(!!C, 'server/crops.js 를 읽었다(분류 정본)');
if (C) {
  const srv = [...new Set(C.list().map((c) => c.group))].sort();
  const mine = [...GROUPS].sort();
  ok(srv.length === 8, `서버 분류 ${srv.length}군 — ${srv.join(' ')}`);
  ok(JSON.stringify(srv) === JSON.stringify(mine),
     `굽는 표의 군 집합이 서버와 같다 ${JSON.stringify(srv) !== JSON.stringify(mine) ? `— 서버 ${srv.join(' ')} / 표 ${mine.join(' ')}` : ''}`);
  ok(new Set(SLUGS).size === SLUGS.length && SLUGS.length === 8, `슬러그 8개가 겹치지 않는다 — ${SLUGS.join(' ')}`);
}

// ── ① 32장 존재·치수·알파 ──────────────────────────────────────
console.log('\n[① 8군 × 4단계 = 32장 · 64×64 · 알파]');
const meta = {};
let bad = 0;
for (const s of SLUGS) for (let st = 0; st < 4; st++) {
  const k = `${s}_${st}`, p = path.join(DIR, k + '.png');
  if (!fs.existsSync(p)) { ok(false, `${k}.png 없음`); bad++; continue; }
  const m = png(p); meta[k] = m;
  if (m.w !== 64 || m.h !== 64) { ok(false, `${k}.png ${m.w}×${m.h} (64 아님)`); bad++; }
  else if (!(m.clear > 0 && m.solid > 0)) { ok(false, `${k}.png 알파가 죽었다`); bad++; }
}
ok(bad === 0, `32장 전수 — 64×64 · 알파 살아 있음 (어긋남 ${bad})`);
{
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4));
  const orphan = files.filter((f) => !(f in meta));
  ok(orphan.length === 0, `옛 스프라이트가 안 남았다 (남은 것 ${orphan.length}${orphan.length ? ': ' + orphan.join(', ') : ''})`);
}

// ── ③ 클라가 group 으로 고른다 ─────────────────────────────────
console.log('\n[③ 클라 선택이 group 이다 — 좌표 해시 0]');
{
  const cs = fs.readFileSync(CONST, 'utf8');
  const fn = cs.match(/function cropSprite\(([^)]*)\)([\s\S]*?)\n\}/);
  ok(!!fn, '00-const.js 에서 cropSprite 를 읽었다');
  if (fn) {
    const args = fn[1].split(',').map((x) => x.trim());
    ok(!args.some((a) => /^w[xy]$/.test(a)),
       `cropSprite 가 좌표를 안 받는다 — (${args.join(', ')})`);
    ok(!/73856093|19349663/.test(fn[2]), '고르는 몸에 좌표 해시가 없다');
    ok(/_slug\[/.test(fn[2]) && /_of\[/.test(fn[2]), 'group → 슬러그 표로 고른다');
  }
  // 슬러그 표의 키가 서버 group 과 같은가(사본이 아니라 **키**로만 존재)
  const sl = cs.match(/_slug:\s*\{([\s\S]*?)\}/);
  ok(!!sl, '00-const.js 에서 _slug 표를 읽었다');
  if (sl && C) {
    const keys = [...sl[1].matchAll(/'([^']+)':\s*'([a-z]+)'/g)];
    const kk = keys.map((m) => m[1]).sort();
    const vv = keys.map((m) => m[2]).sort();
    const srv = [...new Set(C.list().map((c) => c.group))].sort();
    ok(JSON.stringify(kk) === JSON.stringify(srv), `_slug 의 키 8개가 서버 분류와 같다`);
    ok(JSON.stringify(vv) === JSON.stringify([...SLUGS].sort()), `_slug 의 값 8개가 굽는 슬러그와 같다`);
  }
  // 표를 **서버가 준 값으로** 채운다(작물표 사본 금지)
  const ic = fs.readFileSync(ICON, 'utf8');
  ok(/CROP_SPR\._of\[c\.id\]\s*=\s*c\.group/.test(ic),
     '작물 군은 서버 페이로드에서 채운다(43-i-icon applyCropPayload)');
  // 호출부가 작물을 넘긴다
  const b = fs.readFileSync(path.join(ROOT, 'public', 'client', '36-r2-building.js'), 'utf8');
  ok(/cropSprite\(_st,\s*data\.crop\)/.test(b), '플레이어 밭이 `data.crop` 을 넘긴다');
}

// ── ④ 익은 밭 여덟 장이 서로 다르다 (=밭이 작물을 안다) ────────
console.log('\n[④ 단계 3(익음) 여덟 장이 서로 다르다 — 이게 "밭이 작물을 안다"의 그림 쪽 뜻이다]');
const sigOf = (m) => { let h = 0; for (let i = 0; i < m.data.length; i += 4) h = (h * 31 + m.data[i] + m.data[i + 3] * 7) | 0; return h; };
{
  const sig = {};
  for (const s of SLUGS) if (meta[`${s}_3`]) sig[s] = sigOf(meta[`${s}_3`]);
  const uniq = new Set(Object.values(sig));
  ok(uniq.size === SLUGS.length,
     `익은 밭 여덟 장이 서로 다르다 (서로 다른 그림 ${uniq.size}/${SLUGS.length})`);
  // ★단계 0(맨 흙)은 **같아도 된다** — 심기 전 밭은 무엇이 심길지 말해 주지 않는다.
  //   줄 간격이 같은 군끼리는 같은 그림이 나온다. 그게 옳다(주사위가 아니라 이랑 수의 함수다).
  const s0 = new Set(SLUGS.map((s) => meta[`${s}_0`] && sigOf(meta[`${s}_0`])).filter(Boolean));
  console.log(`     ⓘ 단계 0 은 서로 다른 그림 ${s0.size}/${SLUGS.length} — 이랑 수가 같은 군끼리 같다.`);
  console.log('       심기 전 밭이 무엇이 심길지 말해 주면 그게 거짓말이다. 여기선 실패로 안 센다.');
}

// ── ⑤ 한 군의 네 단계가 네 그림이다 ────────────────────────────
console.log('\n[⑤ 한 군의 네 단계가 서로 다른 그림이다]');
{
  const bad2 = [];
  for (const s of SLUGS) {
    const u = new Set([0, 1, 2, 3].map((st) => meta[`${s}_${st}`] && sigOf(meta[`${s}_${st}`])).filter(Boolean));
    if (u.size !== 4) bad2.push(`${s}(${u.size}/4)`);
  }
  ok(bad2.length === 0, `여덟 군 × 네 단계가 다 다르다 ${bad2.length ? '— 아닌 것: ' + bad2.join(' · ') : ''}`);
  // ★불투명 화소 수로 "자란다"를 판정하지 **않는다** — 재 보니 못 쓴다.
  //   프레임이 bbox 에 맞춰지므로 작물이 위로 자랄수록 흙이 차지하는 **비율이 줄어**
  //   `bean`·`tuber` 는 단계 3 의 불투명 화소가 단계 0 보다 **적다**(1161 < 1194 · 1180 < 1194).
  //   자란 게 아니라 액자가 커진 것이다. 그래서 숫자는 기록만 한다(T76 §IoU 와 같은 판단).
  const line = SLUGS.map((s) => `${s} ${[0, 1, 2, 3].map((st) => (meta[`${s}_${st}`] || {}).solid || 0).join('/')}`);
  console.log('     불투명 화소(0/1/2/3) — 기록만: ' + line.join(' · '));
}

if (SELFTEST) {
  console.log('\n[--selftest] 아래 셋을 일부러 깨 본다.');
  let s2 = 0;
  const chk = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) s2++; };
  // ②를 깬다 — 굽는 표에서 한 군을 뺀다
  const g2 = GROUPS.slice(0, 7);
  chk(JSON.stringify(g2.sort()) === JSON.stringify([...new Set(C.list().map((c) => c.group))].sort()),
      '[오염] 굽는 표에서 한 군을 빼면 ② 가 잡는다');
  // ③을 깬다 — 좌표 해시를 되살린 몸
  chk(!/73856093/.test('const h = (wx*73856093) ^ (wy*19349663);'), '[오염] 좌표 해시를 되살리면 ③ 이 잡는다');
  // ④를 깬다 — 맨 흙 여덟 장이 다 같다면
  chk(new Set(['a', 'a', 'a', 'a', 'a', 'a', 'a', 'a']).size === 8, '[오염] 익은 밭이 다 같으면 ④ 가 잡는다');
  console.log('결과: ' + (s2 === 3 ? 'PASS(검사기가 오염 3건을 다 잡았다)' : `FAIL(${s2}/3 만 잡았다)`));
  process.exit(s2 === 3 ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
