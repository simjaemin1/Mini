#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-stone-real.js — 돌 쓰는 실물 (T419) ============================================
//
// ★왜 [지시 T419 · T400 회부 "석재 실물 수요(PM)"]
//   T400 이 집 자재를 표 하나(`hut-stages.js`)로 세우자 econ 의 집 석재가 켬에서 0 이 됐다.
//   돌은 어디서 실물로 쓰이나 — 전수 표(보고/T419 §0-ⓐ)가 찾은 **econ ↔ 서버 짝** 셋을 정본 하나(`server/stone-uses.js`)로 묶었다:
//     ① 정품 간석기(작업대 `EQUIPMENT_RECIPES.tool` 돌 qty) ↔ econ 석공 도구
//     ② 마제석검(작업대 `EQUIPMENT_RECIPES.weapon` 돌 qty)  ↔ econ 석공 마제석검
//     ③ 막석기(맨손 `RECIPES.crude_*` · 자갈·잔가지·풀 — 돌 0) ↔ econ 자급 막석기
//     (+ ④ 철검의 돌 — 작업대 무기는 재료 한 가지라 0)
//   이 하네스가 지키는 것: 표가 하나다(zone·econ·번들이 읽는다) · 표를 고치면 econ 이 따라온다 · 끄면 문이 하나도 안 열린다 ·
//   켜면 세 자리의 돌 단가가 표의 그 수다 · 주사위 0 · 손잡이 하나.
//
// 실행: node scripts/test-stone-real.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const USRC = fs.readFileSync(path.join(ROOT, 'server', 'stone-uses.js'), 'utf8');
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').replace(/\/\*[\s\S]*?\*\//g, ' ');
const probe = (env, js) => JSON.parse(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, { ENABLE_VILLAGES: '0', T419_STONE_REAL: '', T400_BUILD_ACT: '' }, env), stdio: ['ignore', 'pipe', 'pipe'] })
  .toString().split('\n').filter((l) => l.startsWith('{')).pop());
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js'));
const V2P = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
const UP = JSON.stringify(path.join(ROOT, 'server', 'stone-uses.js'));

console.log('\n=== 돌 쓰는 실물 (T419) ===');

// ── ① 정본 하나 ────────────────────────────────────────────────────────────────
console.log('\n① 정본 하나 — `server/stone-uses.js`');
{
  const U = require(path.join(ROOT, 'server', 'stone-uses.js'));
  ok(U.EQUIP_MAT_QTY.tool === 3 && U.EQUIP_MAT_QTY.weapon === 3, '① 작업대 장비 재료 수 그대로 — 도구 3 · 무기 3');
  ok(JSON.stringify(Object.keys(U.CRUDE_TOOLS)) === '["crude_axe","crude_pick","crude_blade"]'
    && U.CRUDE_TOOLS.crude_pick.cost.pebble === 3 && U.CRUDE_TOOLS.crude_axe.cost.fiber === 2 && U.CRUDE_TOOLS.crude_blade.cost.fiber === 1,
    '① 조잡한 석기 세 줄 그 값 · 그 순서(글자 그대로 옮겼다)');
  ok(!/require\(/.test(codeOf(USRC)), '① 순수 모듈(require 0 — 서버·econ·랩 번들이 같은 파일을 읽는다)');
  ok(/const StoneUses = require\('\.\/stone-uses'\)/.test(ZSRC) && /\.\.\.StoneUses\.CRUDE_TOOLS,/.test(ZSRC)
    && /qty: StoneUses\.EQUIP_MAT_QTY\.weapon/.test(ZSRC) && /qty: StoneUses\.EQUIP_MAT_QTY\.tool/.test(ZSRC),
    '① ★zone 이 **그 표를 읽는다**(조잡한 석기 펼침 · 무기/도구 qty)');
  ok(!/crude_axe:\s*\{\s*cost:/.test(codeOf(ZSRC)), '① zone 에 옛 조잡 석기 글자가 **남지 않았다**(사본 0)');
  ok(/require\('\.\.\/server\/stone-uses'\)/.test(SRC), '① ★econ 도 **그 표를 읽는다**(`_stoneUses` 게으른 적재)');
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'build-econ-bundle.js'), 'utf8');
  ok(/rd\('server\/stone-uses\.js'\)/.test(B) && /stone-uses/.test(B.match(/function req\(p\)\{[^\n]*/)[0]), '① 브라우저 번들이 표를 싣고 길을 안다(랩이 같은 수를 본다)');
  //   T419 가 더한 줄만 본다(econ 에는 종전부터 `stone: 3` 을 쓰는 가격 표가 있다 — 그건 이 카드의 수가 아니다).
  const _t419Lines = SRC.split('\n').filter((l) => /T419|stoneReal|_swCost|_stCost|_cc\b|_isSt/.test(l)).map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  ok(_t419Lines.length > 300 && !/\bstone:\s*3\b|\b3\s*\*|pebble:\s*[23]\b|7\s*\/\s*3/.test(_t419Lines), '① econ 의 T419 줄에 표의 수(돌 3 · 자갈 2·3 · 7/3)를 옮겨 적지 않았다');
}

// ── ② 손잡이 — 기본 끔 · 끄면 문이 안 열린다 ─────────────────────────────────────
console.log('\n② 손잡이 — 기본 끔');
{
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T419_STONE_REAL === false && E.stoneRealOn() === false, '② ★★기본이 **끔**이다');
  ok((SRC.match(/process\.env\.T419_STONE_REAL/g) || []).length === 1 && !/T419_STONE_REAL/.test(ZSRC), '② 손잡이 하나 — econ 한 자리에서만 읽는다(zone 은 모른다)');
  //   끈 판의 수가 종전 그 수인가 — 글자로(끈 갈래 식이 그대로 남았나)
  ok(/const _stCost = _t419 \? [^:]+: 0\.2 \* _toolTaper;/.test(SRC), '② 끈 판 석공 도구 돌 = `0.2 × taper`(종전 식)');
  ok(/const _swCost = _t419 \? [^:]+: 0\.5;/.test(SRC), '② 끈 판 마제석검 돌 = `0.5`(종전 수 · 게이트도 같은 수)');
  ok(/stoneRealOn\(\) \? 0 : 0\.2/.test(SRC), '② 끈 판 철검 돌 = `0.2`(종전 수)');
  ok(/\} else if \(_tcov < SELF_TOOL_COV && \(v\.storage\.stone \|\| 0\) >= 0\.2\) \{\s*\n\s*const _self = Math\.min\(toolDeps \* SELF_TOOL_RATE, \(v\.storage\.stone \|\| 0\) \/ 0\.2 \* 0\.2\);/.test(SRC),
    '② 끈 판 막석기 = 종전 갈래 그대로(돌 0.5/개)');
  ok(!/0\.5\s*\*\s*_spare/.test(SRC) || /_swCost \* _spare/.test(SRC), '② 남는 손 마제석검도 같은 단가(`_swCost × spare`)');
}

// ── ③ 켬 — 표의 그 수 ──────────────────────────────────────────────────────────
console.log('\n③ 켬 — 세 자리의 단가가 표에서 나온다');
{
  const on = probe({ T419_STONE_REAL: '1' },
    `const E=require(${EP});process.stdout.write(JSON.stringify({on:E.stoneRealOn(),t:E.stoneRealPer('tool'),s:E.stoneRealPer('stoneSword'),c:E.stoneRealPer('crude')}));`);
  ok(on.on === true, '③ 켜면 열린다');
  ok(JSON.stringify(on.t) === '{"stone":3}', '③ ★간석기 한 자루 = 돌 3(작업대 `tool.qty`)', JSON.stringify(on.t));
  ok(JSON.stringify(on.s) === '{"stone":3}', '③ ★마제석검 한 자루 = 돌 3(작업대 `weapon.qty`)', JSON.stringify(on.s));
  ok(Math.abs(on.c.pebble - 7 / 3) < 1e-12 && on.c.twig === 1 && !('stone' in on.c) && !('fiber' in on.c),
    '③ ★막석기 한 자루 = 조잡한 석기 세 종 평균(자갈 7/3 · 잔가지 1 · **돌 0** · 풀은 econ 재화가 아니다)', JSON.stringify(on.c));
  const mut = probe({ T419_STONE_REAL: '1' },
    `const U=require(${UP});U.EQUIP_MAT_QTY.tool=5;U.CRUDE_TOOLS.crude_axe.cost.stone=1;const E=require(${EP});process.stdout.write(JSON.stringify({t:E.stoneRealPer('tool'),c:E.stoneRealPer('crude')}));`);
  ok(mut.t.stone === 5 && Math.abs(mut.c.stone - 1 / 3) < 1e-12, '③ ★★표 한 줄(도구 5 · 돌도끼에 돌 1)을 바꾸면 econ 이 **따라온다** — 사본 0 의 기능 증명', JSON.stringify(mut));
  //   세계 하나를 돌려 켠 판이 실제로 다른 길을 탄다(자명 통과 금지): 막석기는 자갈을 먹고, 석공은 돌을 더 먹는다.
  const W = (env) => probe(env, `const V2=require(${V2P});const w=V2.createWorldV2({seed:7,villageCount:5,namePool:['가','나','다','라','마'],infoRange:5000,raidPer100:0.005,picker:'rational'});
for(let d=0;d<150;d++)V2.tickWorldV2(w);let st=0,peb=0,self=0,tool=0,sw=0;for(const v of w.villages){st+=v.storage.stone||0;peb+=v.storage.pebble||0;self+=v._selfToolMade||0;tool+=v._stoneToolMade||0;sw+=v._stoneWeaponMade||0}
process.stdout.write(JSON.stringify({st,peb,self,tool,sw,pop:w.villages.reduce((a,v)=>a+v.npcs.length,0)}));`);
  const a = W({}), b = W({ T419_STONE_REAL: '1' }), a2 = W({});
  ok(JSON.stringify(a) === JSON.stringify(a2), '③ [전제] 같은 씨 두 판이 같다(끈 판 결정론 — 아래 차이가 잡음이 아니다)');
  ok(JSON.stringify(a) !== JSON.stringify(b), '③ ★켠 판은 **다른 길**을 탄다(150일 · 5마을)', `돌 ${a.st.toFixed(1)} → ${b.st.toFixed(1)} · 자갈 ${a.peb.toFixed(1)} → ${b.peb.toFixed(1)}`);
}

// ── ④ 주사위 0 ────────────────────────────────────────────────────────────────
console.log('\n④ 주사위 0 · 새 수 0');
{
  const r = probe({ T419_STONE_REAL: '1' }, `Math.random=()=>{throw new Error('Math.random')};const E=require(${EP});let e=null;try{E.stoneRealPer('tool');E.stoneRealPer('crude');E.stoneRealPer('stoneSword')}catch(x){e=String(x.message)}process.stdout.write(JSON.stringify({e}));`);
  ok(r.e === null, '④ ★`Math.random` 을 던지게 바꿔도 유도가 돈다');
  ok(!/Math\.random/.test(codeOf(USRC)), '④ 정본에 `Math.random` 0');
  const i = SRC.indexOf('const T419_STONE_REAL'), j = SRC.indexOf('function actFromGranary');
  ok(i > 0 && j > i && !/Math\.random/.test(SRC.slice(i, j)), '④ econ T419 함수에 `Math.random` 0');
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
process.exit(fail ? 1 : 0);
