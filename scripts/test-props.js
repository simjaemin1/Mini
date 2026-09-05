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
// ★[T97] 세계 키가 두 갈래다 — 건물 행(`PROPS`) 과 실내 장식(`DECOR`).
//   장식은 서버 건물 타입도 아이콘도 없다(짐에 안 들어간다 · 해체 대상이 아니다 — §0-ⓑ).
//   그래서 `btype`·`icon` 을 묻는 검사는 **건물 행에만** 묻고, 장식은 장식대로 따로 묻는다.
const decorKeys = worldKeys.filter(k => A[k].decor === true).sort();
const propKeys = worldKeys.filter(k => A[k].decor !== true);
{
  const nDecor = (fs.readFileSync(RENDER_PY, 'utf8').match(/^\s*dict\(key='/gm) || []).length;
  ok(decorKeys.length === nDecor,
     `실내 장식 ${nDecor}종 = 굽는 표 \`DECOR\` 항목 수 (실측 ${decorKeys.length}): ${decorKeys.join(' ')}`);
  for (const k of decorKeys) {
    const a = A[k];
    ok(a.icon === null && a.btype === null,
       `${k}: 아이콘·건물타입 둘 다 null (장식은 렌더 하나 — 아이콘은 회부)`);
    ok(Math.abs(a.zmax_px - a.body_px) <= 1.0,
       `${k}: 모델 실측 z ${a.zmax_px}px ≒ 몸체 ${a.body_px}px (±1 — 서버 대조가 없으니 이 줄이 유일한 자다)`);
  }
}
{
  const icons = [...new Set(propKeys.map(k => A[k].icon))].sort();
  // ★[T95] 종전엔 `=== 8` 이 박혀 있었다 — 물건이 늘면 검사기가 먼저 거짓말한다.
  //   수는 **굽는 표에서 유도**한다(`props_render.py PROPS` 의 항목 수). 표가 정본이다.
  const nProps = (fs.readFileSync(RENDER_PY, 'utf8').match(/^\s*dict\(icon='/gm) || []).length;
  ok(icons.length === nProps,
     `아이콘 ${nProps}종 = 굽는 표 항목 수 (실측 ${icons.length}): ${icons.join(' ')}`);
  for (const ic of icons) {
    const p = path.join(ICON_DIR, ic + '.png');
    const has = fs.existsSync(p);
    const owned = propKeys.filter(k => A[k].icon === ic);
    let sz = null;
    if (has) sz = pngSize(p);
    ok(has && sz.w === 96 && sz.h === 96 && owned.length >= 1,
      `${ic}.png 96×96 · 세계 변형 ${owned.length}종(${owned.join(',')})`);
  }
  // 아이콘만 있고 세계 그림이 없는 가구가 있으면 그건 캐논 위반이다(§1-5).
  const orphan = propKeys.filter(k => !A[k].icon);
  ok(orphan.length === 0, `아이콘 없는 건물 세계 키 0 ${orphan.length ? JSON.stringify(orphan) : ''}`);
}

console.log('\n[③ 크기 정합 — 서버 BUILDING_HEIGHT 가 정본]');
{
  const BH = buildingHeights();
  ok(!!BH, 'server/zone.js 에서 BUILDING_HEIGHT 표를 읽었다');
  for (const k of propKeys) {
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
  const nDict = (py.match(/^\s*dict\(icon='/gm) || []).length;
  ok(declared.length === nDict,
     `props_render.py 의 선언 ${nDict}종을 전부 읽었다 (실측 ${declared.length})`);
  for (const d of declared) {
    const mine = propKeys.filter(k => A[k].btype === d.t);
    ok(mine.length > 0 && mine.every(k => A[k].body_px === d.b && A[k].flame_px === d.f),
      `${d.t}: 스크립트 선언 ${d.b}+${d.f} = 앵커 기록`);
  }
}

console.log('\n[④ 소스 검사 — 가구·시설 절에 몸체 도형 0]');
{
  let src = fs.readFileSync(CLIENT, 'utf8');
  if (SELFTEST) src = src.replace("if (!drawPropBody('workbench', x, y)) drawPropPending(x, y);",
    "ctx.fillRect(x - 13, y - 2, 3, 8);");
  // 8절을 소스에서 **잘라 내어** 검사한다(파일 전체를 보면 회부 구역의 도형까지 걸린다).
  // ★[T95] T67 이 남긴 셋(농지·바닥·계단)이 여기 들어왔다 — 이제 셋 다 스프라이트다.
  const TYPES = ['wall', 'door', 'chest', 'fence', 'workbench', 'drying_rack', 'salt_kiln', 'campfire',
                 'farmland', 'floor', 'stair'];
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
    // 예외는 **하나씩 이름을 붙인다** — 수를 헐겁게 잡으면 검사기가 먼저 거짓말한다(T95 교훈).
    const allowFill = s0.t === 'campfire' ? 2                     // 불꽃 두 겹(코드가 얹는 상태)
      // ★[T97] 농지 1 = 스프라이트 밑 그림자 타원 하나. 마을 시뮬 카펫 띠(옛 2)는 **지웠다**
      //   — 같은 '경작지'가 소유자에 따라 달리 보이면 정본이 둘이다(PM 판정 · 회부 2).
      : s0.t === 'farmland' ? 1
      // ★[T97] 바닥 1 = 화덕 잉걸빛 그라디언트 하나. **상태**라 남는다(모닥불 불꽃과 같은 경계 · T67 ⓒ).
      //   침상·화덕 몸체(옛 3)는 `DECOR` 스프라이트 둘로 갔다.
      : s0.t === 'floor' ? 1 : 0;
    const allowRect = s0.t === 'chest' ? 1                        // 거래소 이름표 배경 한 장
      : s0.t === 'floor' ? 2 : 0;                                 // 잉걸 두 점 — 잉걸빛과 같은 상태(목침은 스프라이트로 갔다)
    ok(shapes <= allowFill && rects <= allowRect,
      `${s0.t}: 몸체 도형 0 (fill ${shapes}/${allowFill} · fillRect ${rects}/${allowRect})`);
    // ★[T95] 몸체를 **스프라이트에서** 그리는가. 길은 둘이다:
    //   · props 표의 물건 → `drawPropBody`(앵커 JSON 을 읽는 그 경로)
    //   · 농지 → `cropSprite`(몸이 밭 스프라이트다 — T79c 8군 × 4단계. props 표에 또 만들면 사본이다)
    const viaProp = /drawPropBody\(/.test(strippedForShapes);
    if (s0.t === 'floor') {                                        // ★[T97] 실내 둘을 이름으로 확인
      for (const k of ['bed', 'hearth']) {
        ok(new RegExp(`drawPropBody\\('${k}'`).test(strippedForShapes),
           `floor 절: 실내 ${k} 을 \`drawPropBody('${k}')\` 로 그린다`);
        ok(!!A[k], `앵커에 ${k} 가 있다(장식 표가 구웠다)`);
      }
    }
    const viaCrop = s0.t === 'farmland' && /cropSprite\(/.test(strippedForShapes);
    ok(viaProp || viaCrop,
      `${s0.t}: 몸체를 스프라이트에서 그린다 (${viaProp ? 'drawPropBody' : ''}${viaCrop ? 'cropSprite' : ''})`);
  }
  // 앵커 표를 클라에 옮겨 적지 않았는가 — 적는 순간 다시 굽는 날 갈린다(족보 79).
  ok(/fetch\('\/assets\/props\/props_anchors\.json'\)/.test(src),
    '클라가 앵커 JSON 을 **읽는다**(표를 박아 두지 않았다)');
  for (const k of worldKeys) {
    if (new RegExp(`['"\`]${k}['"\`]\\s*:\\s*\\[`).test(src)) { ok(false, `클라에 ${k} 앵커 사본이 있다`); }
  }
  ok(true, '클라에 앵커 수치 사본 0');
}

console.log('\n[⑤ 자연물 앵커·잠금 — 굽는 표가 정본이다 (T97)]');
{
  const NAT_PY = path.join(ROOT, 'scripts', 'nature_render.py');
  const NAT_DIR = path.join(ROOT, 'public', 'assets', 'nature');
  const TREE_DIR = path.join(ROOT, 'public', 'assets', 'trees');
  const NAT_ANCH = path.join(NAT_DIR, 'nature_anchors.json');
  const py = fs.existsSync(NAT_PY) ? fs.readFileSync(NAT_PY, 'utf8') : '';
  // 수는 **굽는 표에서 유도**한다 — 손으로 적으면 표가 늘 때 검사기가 먼저 거짓말한다(T95 교훈).
  const tblCount = (name) => {
    const m = py.match(new RegExp(`^${name} = \\[([\\s\\S]*?)^\\]`, 'm'));
    return m ? (m[1].match(/^\s*\("/gm) || []).length : -1;
  };
  const nTree = tblCount('TREE_BUILD'), nProp = tblCount('PROP_BUILD');
  ok(nTree > 0 && nProp > 0, `굽는 표 — TREE_BUILD ${nTree} · PROP_BUILD ${nProp}`);
  ok(fs.existsSync(NAT_ANCH), 'public/assets/nature/nature_anchors.json 이 있다');
  if (fs.existsSync(NAT_ANCH) && nTree > 0) {
    const NA = JSON.parse(fs.readFileSync(NAT_ANCH, 'utf8'));
    const keys = Object.keys(NA);
    // ★[T101] 앵커 키 = **구운 것**(굽는 표 두 개) + **파생한 것**(광맥 — 모델이 아니라 바위의 변색).
    //   파생 수도 손으로 안 적는다: `ore-outcrop.py` 의 `N_EACH` 가 정본이다.
    const oreN = (() => {
      const t = fs.readFileSync(path.join(ROOT, 'scripts', 'ore-outcrop.py'), 'utf8');
      const m = t.match(/^N_EACH\s*=\s*(\d+)/m) || t.match(/range\(1,\s*(\d+)\s*\)/);
      return m ? (m[1].length && +m[1] > 6 ? +m[1] - 1 : +m[1]) : -1;
    })();
    ok(keys.length === nTree + nProp + oreN,
       `앵커 ${keys.length}키 = 구운 ${nTree}+${nProp} + 파생 ${oreN}(광맥 — 바위의 변색이지 모델이 아니다)`);
    const trees = keys.filter(k => NA[k].kind === 'tree');
    ok(trees.length === nTree, `kind=tree ${trees.length} = TREE_BUILD ${nTree}`);
    // PNG 실측 — 나무는 trees/, 소품은 nature/. w·h 는 IHDR 과 정확히 같아야 한다.
    let sizeBad = [];
    for (const k of keys) {
      const p2 = path.join(NA[k].kind === 'tree' ? TREE_DIR : NAT_DIR, k + '.png');
      if (!fs.existsSync(p2)) { sizeBad.push(k + '(없음)'); continue; }
      const sz = pngSize(p2);
      if (sz.w !== NA[k].w || sz.h !== NA[k].h) sizeBad.push(`${k} ${sz.w}×${sz.h}≠${NA[k].w}×${NA[k].h}`);
    }
    ok(sizeBad.length === 0, `앵커 ${keys.length}키 ↔ PNG 크기 전수 일치` +
       (sizeBad.length ? ` — ${sizeBad.slice(0, 4).join(', ')}` : ''));
    // ppu — 자연물은 **고해상 배포**다(가구와 규격이 다르다). 굽는 루프의 `ss=` 가 정본.
    const PPU = 64 / Math.SQRT2;
    const ssT = +(py.match(/render\(key, ss=(\d+), margin=\d+\)\n\s*anchors\[key\]\["kind"\] = "tree"/) || [])[1];
    const ssP = +(py.match(/render\(key, ss=(\d+), margin=\d+\)\n\s*anchors\[key\]\["kind"\] = "prop"/) || [])[1];
    ok(ssT > 0 && ssP > 0, `굽는 루프의 배수 — 나무 ×${ssT} · 소품 ×${ssP}`);
    const ppuBad = keys.filter(k => Math.abs(NA[k].ppu - PPU * (NA[k].kind === 'tree' ? ssT : ssP)) > 0.01);
    ok(ppuBad.length === 0, `ppu 전수 = 45.255×배수 (어긋남 ${ppuBad.length}${ppuBad.length ? ': ' + ppuBad.slice(0, 4).join(', ') : ''})`);
    // ★★[T101] T97 회부 1 이 닫혔다 — 바위 12 는 이제 `nature_render.py` 가 굽고(PROP_BUILD),
    //   광맥 6 은 `ore-outcrop.py` 가 그 바위에서 파생하며 **앵커까지 복사**한다.
    //   ⇒ 앵커 밖 PNG 는 **0** 이어야 한다. 하나라도 남으면 클라가 자리를 모르는 그림이 있다는 뜻이다.
    const strayNat = fs.readdirSync(NAT_DIR).filter(f => f.endsWith('.png'))
      .map(f => f.slice(0, -4)).filter(k => !NA[k]).sort();
    ok(strayNat.length === 0,
       `앵커 밖 PNG 0장 (남은 것 ${strayNat.length}${strayNat.length ? ': ' + strayNat.slice(0, 6).join(', ') : ''})`);
    // 광맥은 **모델이 아니다** — 바위에서 파생한다. 실루엣이 같으니 앵커도 같아야 한다.
    {
      const off = [...Array(6)].map((_, i) => String(i + 1).padStart(2, '0'))
        .filter(n => JSON.stringify(NA['ore' + n]) !== JSON.stringify(NA['rock' + n]));
      ok(off.length === 0,
         `광맥 6키 앵커 = 바위 6키 앵커(실루엣이 같으니 자리도 같다 · 어긋남 ${off.length})`);
    }
    // 바위 12 가 굽는 표에 있다 — 저장소 밖 스크립트가 굽던 것이 안으로 들어왔는가.
    {
      const want = [...Array(6)].flatMap((_, i) => {
        const n = String(i + 1).padStart(2, '0'); return ['rock' + n, 'mossrock' + n];
      });
      const miss = want.filter(k => !new RegExp(`\\("${k}", rock,`).test(py));
      ok(miss.length === 0,
         `막돌·이끼바위 12키가 \`nature_render.py PROP_BUILD\` 에 있다 (없는 것 ${miss.length})`);
      // ★주석 줄은 소스가 아니다 — 여기 `hash(kind)` 는 **왜 지웠는지 적은 문장** 안에 있다
      //   (T95 에서 주석 속 따옴표 토큰이 검사기를 속인 그 함정).
      const pyCode = py.split('\n').filter(l => !/^\s*#/.test(l)).join('\n');
      ok(/_KSEED = \{/.test(pyCode) && !/hash\(kind\)/.test(pyCode),
         '바위 씨앗이 정수로 못 박혀 있다(`hash(str)` 은 프로세스마다 달라 재현이 안 됐다 · T101 §0-ⓐ)');
    }
    const strayTree = fs.readdirSync(TREE_DIR).filter(f => f.endsWith('.png'))
      .map(f => f.slice(0, -4)).filter(k => !NA[k]);
    ok(strayTree.length === 0, `trees/ 미아 PNG 0 ${strayTree.length ? JSON.stringify(strayTree) : ''}`);
    // 잠금 — 자연물·나무도 잠금표에 든다(다음 재굽기가 여기와 대조한다).
    const LOCK = path.join(ROOT, 'public', 'assets', 'icons.lock.json');
    if (fs.existsSync(LOCK)) {
      const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
      for (const [grp, n] of [['nature', nProp + oreN], ['trees', nTree]]) {
        const t = lock[grp] || {};
        ok(Object.keys(t).length === n, `잠금표 ${grp} ${Object.keys(t).length}키 (기대 ${n})`);
      }
      ok(!lock._기계_예외,
         "잠금표에 '다른 기계' 예외가 **없다** — 배포하는 그림을 전부 이 저장소가 굽는다(T97 회부 1 닫힘)");
      ok(typeof lock._범프 === 'string' && /Distance/.test(lock._범프),
         '잠금표가 5.0 범프 기본값 변경(Distance 1.0 → 0.001)을 적어 뒀다');
    } else ok(false, 'icons.lock.json 이 있다');
  }
}

if (SELFTEST) {
  console.log('\n[--selftest] ④가 오염을 잡았어야 한다 → 위에 ✗ 가 하나 이상 있어야 통과다.');
  console.log('결과: ' + (fail ? 'PASS(검사기가 오염을 잡았다)' : 'FAIL(자명 통과 — 검사기가 눈멀었다)'));
  process.exit(fail ? 0 : 1);
}
console.log('\n결과: ' + (fail ? `FAIL(${fail})` : 'PASS'));
process.exit(fail ? 1 : 0);
