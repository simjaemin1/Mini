#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-itemlabel.js — 화면에 영문 키가 뜰 품목이 남아 있나 (T38) ======
//
// ★왜 [T38 2026-09-01]
//   자염 배치가 `brine`(짠물)을 들여왔는데 제작창 비용 칸에 **영문 키 그대로** 떴다.
//   원인은 "표에 한 줄이 빠졌다"가 아니라 **표가 둘**이었기 때문이다 —
//     정본 `server/zone.js ITEM_LABEL_SERVER` (salt.js·spoil.js·crops.js 에서 이름을 가져온다)
//     사본 `public/client/41-h-char.js ITEM_LABEL` (손으로 유지 · 새 품목이 오면 뒤처진다)
//   T38 이 서버가 이름표를 실어 보내게 고쳤으므로(`costKo`·`missing[].ko`),
//   이제 **서버 표에 없는 키만** 화면에 영문으로 뜬다. 이 하네스는 그 집합을 0 으로 지킨다.
//
// ★자명 통과 금지: 일부러 빠진 키를 하나 넣어 잡히는지 먼저 보인다.
//
// 실행: node scripts/test-itemlabel.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra ? `  ${extra}` : '')); };

// ── 서버 이름표 정본을 **소스에서 읽는다**(서버를 띄우지 않는다 — 이 검사는 표의 문제다) ──
//   ⚠정규식으로 표를 긁으면 그게 사본이다. 그래서 `zone.js` 를 통째로 require 하지 않고,
//     표를 만드는 **정본 모듈들**을 직접 부른다(zone.js 가 부르는 그것들).
const src = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const m = src.match(/const ITEM_LABEL_SERVER = \{([\s\S]*?)\n\};/);
if (!m) { console.log('  ✗ ITEM_LABEL_SERVER 를 못 찾았다 — zone.js 구조가 바뀌었다'); process.exit(1); }
const SERVER_KEYS = new Set();
for (const mm of m[1].matchAll(/(?:^|[,{\s])([A-Za-z_][\w]*)\s*:/g)) SERVER_KEYS.add(mm[1]);
// 표가 코드로 덧붙이는 것들 — 정본 모듈에서 그대로 가져온다(옮겨 적지 않는다)
try {
  const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
  for (const k of Object.keys(Spoil.PRESERVED_ITEMS || {})) SERVER_KEYS.add(k);
} catch (e) { console.log(`    (spoil.js 로드 실패 — 그만큼 덜 센다: ${e.message})`); }
try {
  const Crops = require(path.join(ROOT, 'server', 'crops.js'));
  for (const k of Object.keys(Crops.labelMap ? Crops.labelMap() : {})) SERVER_KEYS.add(k);
} catch (e) { console.log(`    (crops.js 로드 실패 — 그만큼 덜 센다: ${e.message})`); }

console.log('\n=== 이름표 — 화면에 영문 키가 뜰 품목이 남아 있나 (T38) ===');
console.log(`  서버 이름표 ${SERVER_KEYS.size}키`);
ok(SERVER_KEYS.size > 40, '① 전제: 서버 이름표를 실제로 읽었다(빈 집합이면 아래가 자명 통과다)', `${SERVER_KEYS.size}키`);

// ── 제작 비용에 쓰이는 키를 모은다 — 이 키들이 그대로 화면 비용 칸에 간다 ──────
const COST_TABLES = [
  ['BUILDING_COST', /const BUILDING_COST = \{([\s\S]*?)\n\};/],
  ['ITEM_RECIPES', /const ITEM_RECIPES = \{([\s\S]*?)\n\};/],
  ['COOK_RECIPES', /const COOK_RECIPES = \{([\s\S]*?)\n\};/],
];
const costKeys = new Set();
for (const [name, re] of COST_TABLES) {
  const b = src.match(re);
  if (!b) { console.log(`    (${name} 를 못 찾았다 — 그만큼 덜 센다)`); continue; }
  // `{ stone: 4, wood: 3 }` 꼴의 **값 쪽** 키를 모은다(레시피 이름이 아니라 재료 이름)
  for (const mm of b[1].matchAll(/\{([^{}]*)\}/g)) {
    for (const kv of mm[1].matchAll(/([A-Za-z_][\w]*)\s*:\s*\d/g)) costKeys.add(kv[1]);
  }
}
try {
  const Salt = require(path.join(ROOT, 'server', 'salt.js'));
  for (const k of Object.keys(Salt.potCost ? Salt.potCost(Object.keys(Salt.RECIPES || {})[0]) : {})) costKeys.add(k);
} catch (e) { console.log(`    (salt.js 로드 실패 — 그만큼 덜 센다: ${e.message})`); }

// 재료가 아닌 손잡이 키는 뺀다(값이 숫자라 위 정규식에 걸린다)
const NOT_ITEM = new Set(['_buildType', 'qty', 'need', 'have', 'days', 'shelf', 'level', 'lvl', 'x', 'y', 'w', 'h']);
const cost = [...costKeys].filter((k) => !NOT_ITEM.has(k)).sort();
console.log(`  제작 비용에 쓰이는 재료 키 ${cost.length}개`);
ok(cost.length > 5, '② 전제: 비용 키를 실제로 읽었다', `${cost.length}개`);

const leak = cost.filter((k) => !SERVER_KEYS.has(k));
ok(leak.length === 0, '★★③ 서버 이름표가 모든 제작 재료를 안다 — 화면에 영문 키가 뜰 품목 0',
   leak.length ? `남은 것: ${leak.join(', ')}` : `${cost.length}개 전부`);

// ── ★자명 통과 금지 — 일부러 빠진 키를 넣어 ③ 이 잡는지 본다 ──────────────────
{
  const fake = 'zzz_not_a_real_item';
  const leak2 = [...cost, fake].filter((k) => !SERVER_KEYS.has(k));
  ok(leak2.includes(fake), '★④ 자명 통과 금지 — 이름표에 없는 키를 넣으면 ③ 이 잡는다', fake);
}

// ── 클라 사본 표는 **폴백일 뿐**임을 확인한다(정본이 아니어야 한다) ────────────
{
  const panel = fs.readFileSync(path.join(ROOT, 'public', 'client', '50-i-panel.js'), 'utf8');
  ok(/r\.costKo/.test(panel) && /m\.ko \|\| m\.item/.test(panel),
     '★⑤ 제작창이 **서버 이름표를 먼저** 본다(클라 표는 폴백)');
  // ★주석 줄은 뺀다 — 이 검사를 설명하는 **내 주석**이 검사에 걸렸다(test-hist 의 `/splice/` 와 같은 함정).
  const codeOnly = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const sideSrc = fs.readFileSync(path.join(ROOT, 'public', 'client', '51-s-side.js'), 'utf8');
  const bad = [['50-i-panel.js', codeOnly(panel)], ['51-s-side.js', codeOnly(sideSrc)]]
    .filter(([, t]) => /itemIconHtml\((\w[\w.]*),\s*\d+,\s*\1\)/.test(t)).map(([n]) => n);
  ok(bad.length === 0, '★⑥ 아이콘 폴백에 **키를 그대로** 넣는 자리가 없다(그게 화면에 영문 키를 띄웠다)',
     bad.length ? `남은 파일: ${bad.join(', ')}` : '50-i-panel · 51-s-side 둘 다 없음');
}


// ── ★★[T61 2026-09-03] 클라에 이름표 **사본이 남아 있지 않은가** ────────────────
//   T55 는 정본을 실어 보내고 사본을 **폴백으로** 남겼다. T61 이 그 폴백을 지웠다 —
//   사본이 살아 있으면 언젠가 읽히고, 그날 화면과 서버가 갈린다(T38 · 자염 · 갯벌이 그 셋이다).
//   ⇒ 이 검사는 **한글 이름 리터럴이 클라 소스에 있는가**를 본다. 주석은 뺀다(설명이 검사에 걸린다).
console.log('\n=== [T61] 클라에 이름표 사본이 남았나 ===');
{
  const codeOnly = (t) => t.split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const FILES = ['43-i-icon.js', '60-t-market.js'];
  const KO = /[가-힣]/;
  const ILmod = require(path.join(ROOT, 'server', 'itemlabel.js'));
  // ★무엇을 "사본"이라 부를지 **먼저 정한다**: 서버가 이름을 아는 **품목 키** 또는 **자원 종류 키**에
  //   클라가 한글을 적어 둔 자리. 계절(`봄`)·직업(`농부`) 같은 다른 표는 여기 대상이 아니다 —
  //   그건 그것대로 사본이지만 **이 카드의 것이 아니다**(발견은 보고에 적고 회부한다).
  const OWNED = new Set([...SERVER_KEYS, ...Object.keys(ILmod.CATEGORY_KO || {})]);
  const scan = (src) => [...src.matchAll(/(?:^|[,{\s])([A-Za-z_][\w]*)\s*:\s*'([^']*)'/g)]
    .filter((m) => KO.test(m[2]) && OWNED.has(m[1]));
  const hits = [];
  for (const f of FILES) {
    const src = codeOnly(fs.readFileSync(path.join(ROOT, 'public', 'client', f), 'utf8'));
    for (const m of scan(src)) hits.push(`${f} ${m[1]}: '${m[2]}'`);
  }
  ok(hits.length === 0, "★★⑦ `43-i-icon`·`60-t-market` 에 **품목·자원 종류 이름 표가 0개**다(정본 하나)",
     hits.length ? hits.slice(0, 6).join(' · ') : '둘 다 없음');
  // ★자명 통과 금지 — 사본을 되살리면 이 검사가 빨개지는가(같은 함수로 잰다)
  {
    const back = scan("  const ITEM_LABEL = { wood: '통나무', stone: '돌' };");
    ok(back.length === 2, '★⑧ 자명 통과 금지 — 사본을 되살린 소스에서는 이 검사가 잡는다', `${back.length}건`);
    // ★그리고 대상이 아닌 표는 **안 잡는다**(늘 빨간 검사가 아니다)
    const off = scan("  const SEASON_KO = { spring: '봄' };");
    ok(off.length === 0, '★⑧ 대조 — 이 카드의 대상이 아닌 표(계절)는 안 잡는다', `${off.length}건`);
  }
}

// ── ★★[T61] econ 자원 종류 이름 — 정본이 하나이고, 클라가 쓰는 키를 덮는가 ────────
console.log('\n=== [T61] econ 자원 종류 이름(장마당 열) ===');
{
  const IL = require(path.join(ROOT, 'server', 'itemlabel.js'));
  const CK = Object.keys(IL.CATEGORY_KO || {});
  ok(CK.length >= 9, '★⑨ 전제: 정본 `itemlabel.js CATEGORY_KO` 를 읽었다(빈 표면 아래가 자명 통과다)', `${CK.length}키`);
  const mk = fs.readFileSync(path.join(ROOT, 'public', 'client', '60-t-market.js'), 'utf8');
  // ★함수 **본문만** 뗀다 — 뒤따르는 주석까지 딸려 오면 남의 한글이 이 검사에 걸린다
  //   (`test-hist` 의 `/splice/` 함정과 같은 자리다: 검사 범위를 넓게 잡으면 검사가 거짓말한다).
  const itemKrBody = (mk.match(/function ITEM_KR\([^)]*\)\s*\{[^}]*\}/) || [''])[0];
  ok(/CATEGORY_KO_SRV/.test(itemKrBody) && !/[가-힣]/.test(itemKrBody),
     '★★⑨ `ITEM_KR` 이 **서버 표만** 본다(자기 안에 한글 표가 없다)', JSON.stringify(itemKrBody.slice(0, 90)));
  ok(/welcome/.test(fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8')) &&
     /categoryLabels/.test(fs.readFileSync(path.join(ROOT, 'public', 'client', '30-n-net.js'), 'utf8')),
     '★⑨ 그 표는 `welcome.categoryLabels` 로 온다');
  // ★품목 표 합치기 — 옛 클라 사본 55키를 서버가 **전부** 덮는지(글자까지)
  const zsrc = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const obj = (src, name) => { const i = src.indexOf('const ' + name + ' = {'); let j = src.indexOf('{', i), d = 0, k = j;
    for (; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
    return src.slice(j, k + 1); };
  let BR = null; try { BR = eval('(' + obj(zsrc, 'BUILDING_RECIPES') + ')'); } catch (e) {}
  ok(!!BR, '★⑩ 전제: `BUILDING_RECIPES` 를 읽었다(건축물 이름의 정본)');
  const base = {}; for (const k of SERVER_KEYS) base[k] = 'x';
  const merged = IL.itemLabels(base, BR || {});
  ok(Object.keys(merged).length > SERVER_KEYS.size,
     '★⑩ 합친 표가 zone 표보다 크다 — 광물·건축물 이름이 실제로 붙었다',
     `${SERVER_KEYS.size} → ${Object.keys(merged).length}키`);
  for (const k of ['item_wall', 'item_fence', 'ore_chunk', 'iron', 'tungsten', 'jade_raw']) {
    ok(!!merged[k] && merged[k] !== 'x', `★⑩ \`${k}\` 이름을 안다(옛 클라 사본에만 있던 키)`, merged[k]);
  }
  ok(!/\(Wall\)|\(Fence\)/.test(String(merged.item_wall) + String(merged.item_fence)),
     '★⑩ 건축물 이름에서 영문 꼬리를 뗐다(정본 라벨은 "벽 (Wall)" 꼴이다)', `${merged.item_wall} · ${merged.item_fence}`);
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
