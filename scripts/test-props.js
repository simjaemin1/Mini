#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === 가구·시설 렌더 대조 하네스 [T67 2026-09-03] =================================
//
// 계약 넷을 전수로 검사한다:
//   ① 앵커 JSON ↔ PNG 전수 — JSON 의 키마다 PNG 가 있고 w·h 가 IHDR 과 **정확히** 같다.
//   ② 아이콘 키 ⊆ 세계 키  — 인벤에 뜨는 그림은 반드시 세계에 선 그림과 **같은 모델**에서 나온다.
//   ③ 크기 정합 ±1px      — 모델의 실제 z 최대(zmax_px)가 `body_px` 와 ±1px,
//                            그리고 `body_px + flame_px` 가 **서버 정본**
//                            `server/zone.js BUILDING_HEIGHT[type]` 와 정확히 같다.
//   ④ 소스 검사           — `36-r2-building.js` 의 가구 8절에 몸체 도형이 0이다
//                            (스프라이트 한 줄 `drawPropBody` 만 쓴다).
//
// ★검사기는 정본을 스스로 찾는다(족보 79): 높이는 zone.js 를, 앵커는 props_anchors.json 을,
//   그리기는 클라 소스를 **직접 읽는다**. 어느 표도 여기 옮겨 적지 않았다 —
//   옮겨 적었으면 다시 굽는 날 이 하네스가 조용한 거짓말쟁이가 된다.
// ★그리고 이 하네스는 **자기가 실패할 줄 안다**: `--selftest` 로 계약 넷을 일부러 깨 본다.
//
// 실행: node scripts/test-props.js  [--selftest]
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SELFTEST = process.argv.includes('--selftest');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// ── 정본 읽기 ────────────────────────────────────────────────────
const ANCH_PATH = path.join(ROOT, 'public', 'assets', 'props', 'props_anchors.json');
const PROP_DIR = path.join(ROOT, 'public', 'assets', 'props');
const ICON_DIR = path.join(ROOT, 'public', 'assets', 'icons');
const CLIENT = path.join(ROOT, 'public', 'client', '36-r2-building.js');
const ZONE = path.join(ROOT, 'server', 'zone.js');
const RENDER_PY = path.join(ROOT, 'scripts', 'props_render.py');

function pngSize(p) {                       // IHDR 직접 파싱 — 의존성 0(test-building-anchor 규약)
  const b = fs.readFileSync(p);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

// server/zone.js 의 BUILDING_HEIGHT 를 **소스에서** 읽는다(require 하면 서버가 뜬다).
function buildingHeights() {
  const src = fs.readFileSync(ZONE, 'utf8');
  const m = src.match(/const BUILDING_HEIGHT = \{([^}]*)\}/);
  if (!m) return null;
  const out = {};
  for (const mm of m[1].matchAll(/(\w+)\s*:\s*(\d+)/g)) out[mm[1]] = +mm[2];
  return out;
}

console.log('[① 앵커 JSON ↔ PNG 전수]');
ok(fs.existsSync(ANCH_PATH), 'props_anchors.json 이 배치돼 있다');
const A = JSON.parse(fs.readFileSync(ANCH_PATH, 'utf8'));
const worldKeys = Object.keys(A);
ok(worldKeys.length > 0, `세계 키 ${worldKeys.length}종`);
for (const k of worldKeys) {
  const p = path.join(PROP_DIR, k + '.png');
  if (!fs.existsSync(p)) { ok(false, `${k}.png 없음`); continue; }
  const s = pngSize(p);
  ok(s.w === A[k].w && s.h === A[k].h, `${k}.png ${s.w}×${s.h} = JSON ${A[k].w}×${A[k].h}`);
}
// 반대 방향 — 폴더에 **JSON 이 모르는 PNG** 가 있으면 클라가 영영 안 부른다(조용한 미아).
{
  const stray = fs.readdirSync(PROP_DIR).filter(f => f.endsWith('.png'))
    .map(f => f.replace(/\.png$/, '')).filter(k => !A[k]);
  ok(stray.length === 0, `앵커에 없는 미아 PNG 0 ${stray.length ? JSON.stringify(stray) : ''}`);
}
// PPU 무변 — 씬 정본(45.255). 이게 흔들리면 세계와 그림의 축척이 갈린다.
{
  const PPU = +(64 / Math.SQRT2).toFixed(3);
  const bad = worldKeys.filter(k => Math.abs(A[k].ppu - PPU) > 0.001);
  ok(bad.length === 0, `PPU 전수 = ${PPU} ${bad.length ? JSON.stringify(bad) : ''}`);
}

console.log('\n[② 아이콘 키 ⊆ 세계 키 — 같은 모델에서 나왔는가]');
{
  const icons = [...new Set(worldKeys.map(k => A[k].icon))].sort();
  ok(icons.length === 8, `아이콘 8종 (실측 ${icons.length}): ${icons.join(' ')}`);
  for (const ic of icons) {
    const p = path.join(ICON_DIR, ic + '.png');
    const has = fs.existsSync(p);
    const owned = worldKeys.filter(k => A[k].icon === ic);
    let sz = null;
    if (has) sz = pngSize(p);
    ok(has && sz.w === 96 && sz.h === 96 && owned.length >= 1,
      `${ic}.png 96×96 · 세계 변형 ${owned.length}종(${owned.join(',')})`);
  }
  // 아이콘만 있고 세계 그림이 없는 가구가 있으면 그건 캐논 위반이다(§1-5).
  const orphan = worldKeys.filter(k => !A[k].icon);
  ok(orphan.length === 0, `아이콘 없는 세계 키 0 ${orphan.length ? JSON.stringify(orphan) : ''}`);
}

console.log('\n[③ 크기 정합 — 서버 BUILDING_HEIGHT 가 정본]');
{
  const BH = buildingHeights();
  ok(!!BH, 'server/zone.js 에서 BUILDING_HEIGHT 표를 읽었다');
  for (const k of worldKeys) {
    const a = A[k], h = BH ? BH[a.btype] : undefined;
    ok(h !== undefined, `${k}: 서버에 건물 타입 '${a.btype}' 이 있다`);
    if (h === undefined) continue;
    ok(a.body_px + a.flame_px === h,
      `${k}: 몸체 ${a.body_px} + 코드 ${a.flame_px} = 서버 ${h}px`);
    ok(Math.abs(a.zmax_px - a.body_px) <= 1.0,
      `${k}: 모델 실측 z ${a.zmax_px}px ≒ 몸체 ${a.body_px}px (±1)`);
  }
  // 그리고 굽는 스크립트의 표가 같은 말을 하는지 — 두 벌이 갈리면 여기서 잡힌다.
  const py = fs.readFileSync(RENDER_PY, 'utf8');
  const declared = [...py.matchAll(/btype='(\w+)',[^\n]*body_px=(\d+),\s*flame_px=(\d+)/g)]
    .map(m => ({ t: m[1], b: +m[2], f: +m[3] }));
  ok(declared.length === 8, `props_render.py 가 가구 8종을 선언한다 (실측 ${declared.length})`);
  for (const d of declared) {
    const mine = worldKeys.filter(k => A[k].btype === d.t);
    ok(mine.length > 0 && mine.every(k => A[k].body_px === d.b && A[k].flame_px === d.f),
      `${d.t}: 스크립트 선언 ${d.b}+${d.f} = 앵커 기록`);
  }
}

console.log('\n[④ 소스 검사 — 가구 8절에 몸체 도형 0]');
{
  let src = fs.readFileSync(CLIENT, 'utf8');
  if (SELFTEST) src = src.replace("if (!drawPropBody('workbench', x, y)) drawPropPending(x, y);",
    "ctx.fillRect(x - 13, y - 2, 3, 8);");
  // 8절을 소스에서 **잘라 내어** 검사한다(파일 전체를 보면 회부 구역의 도형까지 걸린다).
  const TYPES = ['wall', 'door', 'chest', 'fence', 'workbench', 'drying_rack', 'salt_kiln', 'campfire'];
  const starts = [];
  for (const t of TYPES) {
    const re = new RegExp(`(?:\\} else )?if \\(type === '${t}'\\) \\{`);
    const m = src.match(re);
    ok(!!m, `${t} 절을 찾았다`);
    if (m) starts.push({ t, i: m.index });
  }
  // 각 절의 끝 = 다음 `} else if (type ===` 또는 함수 끝
  const allBranch = [...src.matchAll(/(?:\} else )?if \(type === '\w+'\) \{/g)].map(m => m.index).sort((a, b) => a - b);
  for (const s0 of starts) {
    const next = allBranch.find(i => i > s0.i);
    const body = src.slice(s0.i, next === undefined ? src.length : next);
    // 몸체 도형 = 채우는 도형. 떠 있는 이름표(fillRect+fillText 한 묶음)와 불꽃은 **상태**라 예외다.
    const strippedForShapes = body
      .split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');   // 주석 줄은 소스가 아니다
    const shapes = (strippedForShapes.match(/ctx\.fill\(\)/g) || []).length;
    const rects = (strippedForShapes.match(/ctx\.fillRect\(/g) || []).length;
    const allowFill = s0.t === 'campfire' ? 2 : 0;                // 불꽃 두 겹(코드가 얹는 상태)
    const allowRect = s0.t === 'chest' ? 1 : 0;                   // 거래소 이름표 배경 한 장
    ok(shapes <= allowFill && rects <= allowRect,
      `${s0.t}: 몸체 도형 0 (fill ${shapes}/${allowFill} · fillRect ${rects}/${allowRect})`);
    ok(/drawPropBody\(/.test(strippedForShapes), `${s0.t}: drawPropBody 로 몸체를 그린다`);
  }
  // 앵커 표를 클라에 옮겨 적지 않았는가 — 적는 순간 다시 굽는 날 갈린다(족보 79).
  ok(/fetch\('\/assets\/props\/props_anchors\.json'\)/.test(src),
    '클라가 앵커 JSON 을 **읽는다**(표를 박아 두지 않았다)');
  for (const k of worldKeys) {
    if (new RegExp(`['"\`]${k}['"\`]\\s*:\\s*\\[`).test(src)) { ok(false, `클라에 ${k} 앵커 사본이 있다`); }
  }
  ok(true, '클라에 앵커 수치 사본 0');
}

if (SELFTEST) {
  console.log('\n[--selftest] ④가 오염을 잡았어야 한다 → 위에 ✗ 가 하나 이상 있어야 통과다.');
  console.log('결과: ' + (fail ? 'PASS(검사기가 오염을 잡았다)' : 'FAIL(자명 통과 — 검사기가 눈멀었다)'));
  process.exit(fail ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
