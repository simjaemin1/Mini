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

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
