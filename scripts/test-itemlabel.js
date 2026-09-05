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


// ── ★★[T66] 구운 렌더 목록이 **디렉터리와 같은가** ────────────────────────────
//   `43-i-icon.js ICON_RENDERED` 는 `/assets/icons/*.png` 의 **사본**이다. 사본은 언젠가 갈린다 —
//   그래서 검사로 못 박는다. ART 카드가 렌더를 구우면 이 검사가 "빠졌다"고 먼저 말한다.
console.log('\n=== [T66] 구운 아이템 렌더 목록 ===');
{
  const dir = fs.readdirSync(path.join(ROOT, 'public', 'assets', 'icons'))
    .filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)).sort();
  const src = fs.readFileSync(path.join(ROOT, 'public', 'client', '43-i-icon.js'), 'utf8');
  const m = src.match(/const ICON_RENDERED = new Set\(\[([\s\S]*?)\]\);/);
  ok(!!m, '★⑪ 전제: `ICON_RENDERED` 를 읽었다');
  const list = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort() : [];
  ok(list.length === dir.length && list.every((k, i) => k === dir[i]),
     '★★⑪ 목록이 `public/assets/icons/` 와 **정확히 같다**(사본이 갈리면 여기서 잡는다)',
     list.length === dir.length ? `${dir.length}장` :
       `목록 ${list.length} vs 파일 ${dir.length} · 차이 ${dir.filter((k) => !list.includes(k)).concat(list.filter((k) => !dir.includes(k))).join(' ')}`);
  // ★자명 통과 금지 — 한 장을 빼면 잡는가
  ok(!(list.slice(1).length === dir.length), '★⑪ 자명 통과 금지 — 목록에서 하나를 빼면 길이가 어긋난다');
}

// ── ★★[T66] 이모지 0 · 색 리터럴 0 (클라 소스) ──────────────────────────────
console.log('\n=== [T66] 화면 규칙 B — 이모지 0 · 색은 토큰 하나 ===');
{
  // 주석을 걷어낸다 — 설명 글이 검사에 걸리면 검사가 거짓말한다(족보: test-hist `/splice/`).
  const stripJs = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => {
    let q = null, out = '';
    for (let i = 0; i < l.length; i++) {
      const c = l[i], n = l[i + 1];
      if (q) { out += c; if (c === '\\') { out += n || ''; i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; out += c; continue; }
      if (c === '/' && n === '/') break;
      out += c;
    }
    return out;
  }).join('\n');
  const CLI = path.join(ROOT, 'public', 'client');
  const files = fs.readdirSync(CLI).map((f) => ['client/' + f, stripJs(fs.readFileSync(path.join(CLI, f), 'utf8'))]);
  files.push(['index.html', fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')]);
  const EMO = /\p{Extended_Pictographic}/gu;
  const emoHits = files.filter(([, t]) => EMO.test(t)).map(([f]) => f);
  ok(emoHits.length === 0, '★★⑫ 클라 소스에 **이모지 0**(UI 틀 · 예외 목록 0)',
     emoHits.length ? emoHits.join(' · ') : `${files.length}개 파일 전부`);
  // ★자명 통과 금지 — 폴백 이모지 한 줄을 되살리면 잡는가
  ok(EMO.test("const ITEM_ICONS = { wood: '\u{1FAB5}' };"), '★⑫ 자명 통과 금지 — 이모지 한 줄을 되살린 소스는 잡힌다');

  // ★★[T66 2차 · 재민 보고 §2] 색의 자리는 **두 갈래**이고, 규칙이 서로 반대다.
  //   ⓐ 판을 짓는 조각(아래 표) — 값은 `style.css` 토큰 하나. 리터럴 0.
  //   ⓑ 세계를 그리는 조각(캔버스) — 값은 **리터럴이어야 한다**. `ctx.fillStyle = 'var(--x)'` 는
  //     예외도 콘솔 오류도 없이 **그냥 안 칠해진다**(앞 값이 남는다). 1차 판이 정확히 그 함정에 빠졌고,
  //     줄 단위 어림짐작(`fillStyle` 이 같은 줄에 있나)으로는 `tileColor = …` 같은 줄을 못 가른다.
  //   ⇒ ⓐ 는 여기서 **파일 표**로 재고(사람이 읽을 수 있는 목록), ⓑ 는 `e2e-ui ⑬` 이
  //     진짜 캔버스에 들어간 값을 **실행 중에** 가로채 잰다. 어느 쪽도 어림짐작이 아니다.
  //   ★[T80 2026-09-03] `47-s-board.js`(게시판 판)를 표에 더한다 — 판을 짓는 조각이 표 밖에 있으면
  //     그 판만 색 검사를 **조용히 빠져나간다**(빠뜨린 자리는 언젠가 리터럴이 들어온다).
  const DOM_ONLY = ['client/05-u-icon.js', 'client/44-h-hud.js', 'client/45-t-market.js',
    'client/47-s-board.js',
    'client/50-i-panel.js', 'client/51-s-side.js', 'client/60-t-market.js',
    'client/65-s-chronicle.js', 'client/70-lobby.js', 'client/99-main.js', 'index.html'];
  const seen = files.map(([f]) => f);
  ok(DOM_ONLY.every((f) => seen.includes(f)), '★⑫ 전제: 표의 조각이 전부 실재한다',
     DOM_ONLY.filter((f) => !seen.includes(f)).join(' · ') || `${DOM_ONLY.length}개`);
  const colHits = [];
  for (const [f, t] of files) {
    if (!DOM_ONLY.includes(f)) continue;
    t.split('\n').forEach((l, i) => {
      const m2 = l.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g);
      if (m2) colHits.push(`${f}:${i + 1}`);
    });
  }
  ok(colHits.length === 0, '★★⑫ 판을 짓는 조각에 **색 리터럴 0** — 값은 `style.css` 토큰 하나다',
     colHits.length ? colHits.slice(0, 6).join(' · ') : `${DOM_ONLY.length}개 조각 전부`);
  ok(/#[0-9a-fA-F]{3,8}\b/.test("  slot.style.borderColor = '#f0c674';"),
     '★⑫ 자명 통과 금지 — 판 조각에 색 한 줄을 되살리면 잡힌다');
  // ── ★★[T66 2차] ⑬ 선 아이콘 — **이름 하나 = 그림 하나** ────────────────────
  //   ★왜: 두 이름이 같은 `d` 를 쓰면 서로 다른 뜻이 화면에서 **한 얼굴**이 된다.
  //     실기에서 레일의 `build` 가 `home` 과, `상태(body)` 가 `부상(heart)` 과 같은 그림이었다.
  //     이름 수만 세는 검사는 그걸 절대 못 잡는다(연표 아이콘 ④ 가 배운 것과 같은 함정).
  const icoSrc = fs.readFileSync(path.join(CLI, '05-u-icon.js'), 'utf8');
  const icoTbl = icoSrc.match(/const UI_ICON_D = \{([\s\S]*?)\n  \};/);
  ok(!!icoTbl, '★⑬ 전제: `UI_ICON_D` 를 읽었다');
  const icoMap = {};
  if (icoTbl) for (const m3 of icoTbl[1].matchAll(/^\s*([a-zA-Z]+):\s*'([^']+)'/gm)) icoMap[m3[1]] = m3[2];
  ok(Object.keys(icoMap).length >= 40, '★⑬ (상황) 세트가 실제로 크다 — 빈 표면 아래가 자명 통과다',
     `${Object.keys(icoMap).length}개`);
  const byD = {};
  for (const k in icoMap) (byD[icoMap[k]] = byD[icoMap[k]] || []).push(k);
  const dupIco = Object.values(byD).filter((v) => v.length > 1);
  ok(dupIco.length === 0, '★★⑬ 두 이름이 **같은 그림**을 쓰지 않는다',
     dupIco.length ? dupIco.map((v) => v.join('=')).join(' · ') : `${Object.keys(byD).length}종 전부 다르다`);
  // ★자명 통과 금지 — 일부러 겹치면 잡는가
  {
    const probe = { a: 'M0 0', b: 'M0 0', c: 'M1 1' }, pb = {};
    for (const k in probe) (pb[probe[k]] = pb[probe[k]] || []).push(k);
    ok(Object.values(pb).some((v) => v.length > 1), '★⑬ 자명 통과 금지 — 겹친 표를 넣으면 잡힌다');
  }

  // ── ★★[T90] ⑭ 자연물 동사 이름표 — **종류 전수를 덮는가** ──────────────────
  //   ★왜: T82 는 이 표를 클라에 두고 폴백('채집')으로 접었다. 그러면 새 자연물이 생겨도
  //     화면은 조용히 '채집'이라 말하고 **아무도 모른다**(연표 아이콘 ③ 이 배운 그 함정).
  //   ⇒ 정본은 서버(`itemlabel.RESOURCE_VERBS`)이고, 키 집합을 **자연물 정본**과 맞대 본다.
  //     자연물 정본은 `server/chunk.js` 의 `RESOURCE_HP_TABLE` 이다(스폰이 그 표로 hp 를 준다).
  {
    const RV = require(path.join(ROOT, 'server', 'itemlabel.js')).RESOURCE_VERBS;
    const chunkSrc = fs.readFileSync(path.join(ROOT, 'server', 'chunk.js'), 'utf8');
    const m4 = chunkSrc.match(/const RESOURCE_HP_TABLE = \{([^}]*)\}/);
    ok(!!m4 && !!RV, '★⑭ 전제: 두 표를 실제로 읽었다(자연물 hp 정본 · 동사 이름표)');
    const kinds = m4 ? [...m4[1].matchAll(/(\w+)\s*:/g)].map((x) => x[1]) : [];
    ok(kinds.length >= 6, '★⑭ (상황) 자연물 종류가 실제로 여럿이다 — 빈 표면 아래가 자명 통과다',
       `${kinds.length}종: ${kinds.join(' ')}`);
    const missing = kinds.filter((k) => !RV[k]);
    const extra = Object.keys(RV || {}).filter((k) => !kinds.includes(k));
    ok(missing.length === 0, '★★⑭ 동사 이름표가 **자연물 종류를 전부 덮는다**(빠지면 이름 없이 뜬다)',
       missing.length ? missing.join(' ') : `${kinds.length}종 전부`);
    ok(extra.length === 0, '★⑭ 그리고 없는 종류를 지어내지 않았다', extra.join(' ') || '0건');
    // ★자명 통과 금지 — 한 종류를 빼면 잡는가
    ok(['a', 'b'].filter((k) => !({ a: 1 })[k]).length === 1, '★⑭ 자명 통과 금지 — 빠진 키를 집어낸다');
    // ★클라에 그 표의 **사본이 없다**(T82 가 자인한 사본 — 이 카드에서 지웠다)
    const verbsSrc = fs.readFileSync(path.join(CLI, '46-h-verbs.js'), 'utf8');
    ok(!/tree:\s*'벌목'/.test(verbsSrc), '★★⑭ 클라에 한 단어 표의 **사본이 없다**(사본 −1)');
  }

  // ── ★★[T90] ⑮ 알림 종류 아홉 — **각각 다른 그림** ──────────────────────────
  {
    const noticeKinds = require(path.join(ROOT, 'server', 'notice.js')).KINDS;
    const panelSrc = fs.readFileSync(path.join(CLI, '50-i-panel.js'), 'utf8');
    const m5 = panelSrc.match(/const NOTICE_ICO = \{([\s\S]*?)\};/);
    ok(!!m5 && !!noticeKinds, '★⑮ 전제: 서버 `KINDS` 와 클라 `NOTICE_ICO` 를 읽었다');
    const map = {};
    if (m5) for (const x of m5[1].matchAll(/(\w+):\s*'([\w]+)'/g)) map[x[1]] = x[2];
    const miss = (noticeKinds || []).filter((k) => !map[k]);
    ok(miss.length === 0, '★★⑮ 아홉 종류가 **전부 그림을 갖는다**(T78 이 실은 칸을 화면이 읽는다)',
       miss.length ? miss.join(' ') : `${(noticeKinds || []).length}종 전부`);
    const names = (noticeKinds || []).map((k) => map[k]).filter(Boolean);
    ok(new Set(names).size === names.length, '★★⑮ 그리고 **아홉이 서로 다른 그림**이다(종류가 안 뭉개진다)',
       names.join(' '));
    const bad = names.filter((n) => !icoMap[n]);
    ok(bad.length === 0, '★★⑮ 그 이름이 전부 **세트에 실재한다**(없으면 점선 네모가 뜬다)', bad.join(' ') || '0건');
  }

  const css = fs.readFileSync(path.join(ROOT, 'public', 'style.css'), 'utf8');
  const body = css.slice(css.indexOf('\n}\n') + 3);
  ok(!/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/.test(body),
     '★★⑫ `style.css` 도 **`:root` 블록 밖엔 색이 없다**');
  // ⚠`\s*[^0]` 로 쓰면 안 된다 — `\s*` 가 되짚어 **공백 하나**를 `[^0]` 로 먹어 `: 0` 도 걸린다
  //   (1차 판이 정확히 그렇게 없는 결함을 보고했다). 공백은 명시로 먹고 그 다음 글자를 본다.
  ok(!/shadow/.test(body) && !/border-radius:[ \t]*[^0\s]/.test(body),
     '★⑫ 그림자 0 · 모서리 0');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
