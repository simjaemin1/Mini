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
//   ⑤ T443 제련 연료 · ⑥ T452 숯가마 · ⑦ T463 숯 파생수요(노의 숯 목표 → 값 → 캐러밴) + era 숯가마 문.
//   ★[T471] ⑤⑥ 손잡이 둘 기본 켬(넷째 판-c) — 되돌림 `=0` 이 끔(넷째 판-b)이다.
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

// ── ⑤ [T443] 제련 연료도 실물 — `server/smelt-uses.js` ─────────────────────────────────
console.log('\n⑤ [T443] 제련 연료 — 노 표 하나 · econ 이 켬에서 숯을 뺀다');
{
  const MP = JSON.stringify(path.join(ROOT, 'server', 'smelt-uses.js'));
  const M = require(path.join(ROOT, 'server', 'smelt-uses.js'));
  ok(M.FURNACE_FUEL_PER_ORE === 2 && M.CHARCOAL_KILN_WOOD === 3 && M.CHARCOAL_KILN_YIELD === 4 && JSON.stringify(M.SMELT_RECIPES.charcoal.from) === '{"wood":3}' && M.SMELT_RECIPES.charcoal.to.charcoal === 2,
    '⑤ 정본 그 수 — 원석 1 = 숯 2 · 숯가마 통나무 3 → 숯 4 · 노천 탄화 통나무 3 → 숯 2');
  const st = (k) => M.FURNACE_KINDS[k].stages.reduce((a, x) => a + (x.need.stone || 0), 0);
  ok(st('crucible') === 14 && st('bloomery') === 24 && M.CHARCOAL_KILN_STAGES.reduce((a, x) => a + (x.need.stone || 0), 0) === 10, '⑤ 노 돌 — 도가니로 14 · 괴련로 24 · 숯가마 10(T419 ⓐ 그 줄)');
  ok(/const SmeltUses = require\('\.\/smelt-uses'\)/.test(ZSRC) && /const FURNACE_KINDS = SmeltUses\.FURNACE_KINDS;/.test(ZSRC) && /const FURNACE_FUEL_PER_ORE = SmeltUses\.FURNACE_FUEL_PER_ORE;/.test(ZSRC)
    && /\.\.\.require\('\.\/smelt-uses'\)\.SMELT_RECIPES,/.test(ZSRC) && !/charcoal: \{ from: \{ wood: 3 \}/.test(codeOf(ZSRC)), '⑤ ★zone 이 **그 표를 읽는다**(노·숯가마·숯 레시피 · 옛 글자 0)');
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'build-econ-bundle.js'), 'utf8');
  ok(/rd\('server\/smelt-uses\.js'\)/.test(B) && /smelt-uses/.test(B.match(/function req\(p\)\{[^\n]*/)[0]), '⑤ 번들이 표를 싣는다');
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T443_SMELT_FUEL === true && E.smeltFuelOn() === true, '⑤ ★★기본 **켬**(T471 · 넷째 판-c)');
  const rv5 = probe({ T443_SMELT_FUEL: '0' }, `const E=require(${EP});process.stdout.write(JSON.stringify({k:E.T443_SMELT_FUEL,on:E.smeltFuelOn()}));`);
  ok(rv5.k === false && rv5.on === false, '⑤ 되돌림 `T443_SMELT_FUEL=0` → 끔(넷째 판-b)');
  ok((SRC.match(/process\.env\.T443_SMELT_FUEL/g) || []).length === 1 && !/T443_SMELT_FUEL/.test(ZSRC), '⑤ 손잡이 하나(econ 한 자리)');
  ok(/const use = smeltFuelOn\(\) \? smeltFuelTake\(v, Math\.min\(have, cap\)\) : Math\.min\(have, cap\);/.test(SRC), '⑤ 끈 판 제련 = 종전 식(`min(have, cap)`)');
  const on = probe({ T443_SMELT_FUEL: '1' }, `const E=require(${EP});const a={storage:{wood:9,charcoal:1}},b={storage:{wood:0,charcoal:0}},c={storage:{wood:30,charcoal:0}};
process.stdout.write(JSON.stringify({per:E.smeltFuelPerOre(),a:E.smeltFuelTake(a,5),as:a.storage,b:E.smeltFuelTake(b,5),bn:b._smeltNoFuel,c:E.smeltFuelTake(c,5),cs:c.storage}));`);
  ok(JSON.stringify(on.per) === '{"charcoal":2}', '⑤ 켬 — 원석 한 덩이 = 숯 2');
  ok(on.c === 5 && on.cs.wood === 15, '⑤ ★숯이 없으면 노천 탄화로 굽는다 — 원석 5 = 숯 10 = 통나무 15(3÷2)', JSON.stringify(on.cs));
  ok(on.a === 3.5 && on.as.wood === 0 && on.as.charcoal === 0, '⑤ 곳간 숯을 먼저 쓰고 모자란 몫만 통나무 · 연료가 댈 수 있는 만큼만 녹인다(3.5)');
  ok(on.b === 0 && on.bn === 1, '⑤ ★★연료가 없으면 **제련이 안 돈다**(= 행위)');
  const mut = probe({ T443_SMELT_FUEL: '1' }, `const M=require(${MP});M.FURNACE_FUEL_PER_ORE=3;M.fuelPerOre=()=>({charcoal:M.FURNACE_FUEL_PER_ORE});const E=require(${EP});const v={storage:{wood:9}};process.stdout.write(JSON.stringify({n:E.smeltFuelTake(v,5)}));`);
  ok(mut.n === 2, '⑤ ★표를 고치면(원석당 숯 3) econ 이 따라온다(통나무 9 = 숯 6 = 원석 2)', JSON.stringify(mut));
  const i = SRC.indexOf('const T443_SMELT_FUEL'), j = SRC.indexOf('function _trySmelt');
  ok(i > 0 && j > i && !/Math\.random/.test(SRC.slice(i, j)) && !/\b[23]\b/.test(SRC.slice(i, j).split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')), '⑤ 주사위 0 · 표의 수(2·3)를 옮겨 적지 않았다');
}

// ── ⑥ [T452] 숯가마 행위 — 숯은 숯가마가 굽는다 ─────────────────────────────────────
console.log('\n⑥ [T452] 숯가마 — 숲 마을에만 서고 · 잉여 통나무로 · 숯 목표까지');
{
  const M = require(path.join(ROOT, 'server', 'smelt-uses.js'));
  ok(M.KILN_BURN_MS === 240000 && M.KILN_BATCH_MS_PER === 30000 && M.kilnBatchesPerDay(1440000) === 41 && JSON.stringify(M.kilnBuildCost()) === '{"stone":10,"wood":2}',
    '⑥ 정본 — 숯가마 조업 4분 + 배치당 30초 → 하루(24분) 41배치 · 짓는 재료 돌 10·통나무 2');
  ok(/const KILN_BURN_MS  = SmeltUses\.KILN_BURN_MS;/.test(ZSRC) && /const KILN_BATCH_MS_PER = SmeltUses\.KILN_BATCH_MS_PER;/.test(ZSRC), '⑥ zone 숯가마 조업 시간도 그 표를 읽는다');
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  ok(E.T452_KILN_ACT === true && E.kilnActOn() === true && /if \(T452_KILN_ACT\) kilnDay\(v\);/.test(SRC), '⑥ ★★기본 **켬**(T471 · 넷째 판-c) · 켬일 때만 하루 한 줄');
  const rv6 = probe({ T452_KILN_ACT: '0' }, `const E=require(${EP});process.stdout.write(JSON.stringify({k:E.T452_KILN_ACT,on:E.kilnActOn()}));`);
  ok(rv6.k === false && rv6.on === false, '⑥ 되돌림 `T452_KILN_ACT=0` → 끔(넷째 판-b · 숯가마 하루 한 줄도 안 돈다)');
  ok((SRC.match(/process\.env\.T452_KILN_ACT/g) || []).length === 1, '⑥ 손잡이 하나');
  const r = probe({ T452_KILN_ACT: '1' }, `const E=require(${EP});const npcs=new Array(10).fill({});
const forest={npcs,counts:{lumberjack:2},storage:{wood:120,stone:12,ore:4}}; const b1=E.kilnDay(forest); const s1=JSON.parse(JSON.stringify(forest.storage)); const d2=E.kilnDay(forest); const s2=JSON.parse(JSON.stringify(forest.storage)); const d3=E.kilnDay(forest);
const nolj={npcs,counts:{lumberjack:0},storage:{wood:500,stone:50,ore:20}}; const x1=E.kilnDay(nolj); E.kilnDay(nolj);
const poor={npcs,counts:{lumberjack:3},storage:{wood:40,stone:50,ore:20}}; const y1=E.kilnDay(poor);
const nost={npcs,counts:{lumberjack:3},storage:{wood:200,stone:9,ore:5}}; const z1=E.kilnDay(nost);
process.stdout.write(JSON.stringify({b1,s1,d2,s2,d3,x1,nolj:nolj.storage,nk:!!nolj._kiln,y1,z1,zk:!!nost._kiln}));`);
  ok(r.b1 && r.b1.built === 1 && r.s1.stone === 2 && r.s1.wood === 118, '⑥ 숲 마을(나무꾼 · 통나무 > 비축)은 재료(돌 10·통나무 2)가 있으면 그날 선다');
  ok(r.d2.batches === 5 && r.s2.charcoal === 20 && r.s2.wood === 103, '⑥ 굽기 — 숯 목표 = max(원석 비축 1×10, 원석 4) × 숯 2 = 20 → 5배치 · 통나무 15 → 숯 20(가마 3 → 4)', JSON.stringify(r.s2));
  ok(r.d3.batches === 0, '⑥ 목표에 닿으면 더 안 굽는다(잉여 통나무를 다 태우지 않는다)');
  ok(r.x1 === null && r.nk === false && !r.nolj.charcoal && r.nolj.wood === 500, '⑥ ★★미끼 — 나무꾼 없는 마을은 숯가마가 **안 서고 숯이 한 톨도 안 생긴다**');
  ok(r.y1 === null, '⑥ 통나무가 비축(5/인) 아래인 마을도 안 선다(잉여가 조건)');
  ok(r.z1 === null && r.zk === false, '⑥ 재료(돌 10)가 모자라면 안 선다(기다린다)');
  const kd = SRC.slice(SRC.indexOf('const T452_KILN_ACT'), SRC.indexOf('function _trySmelt'));
  ok(kd.length > 500 && !/Math\.random/.test(kd) && !/\b(3|4|10|41)\b/.test(kd.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')), '⑥ 주사위 0 · 표의 수(3·4·10·41)를 옮겨 적지 않았다');
}

// ── ⑦ [T463] 숯이 광산으로 간다 — 노의 숯 목표가 파생수요다 ─────────────────────────────────
console.log('\n⑦ [T463] 숯 파생수요 — 노가 있는 마을의 숯 목표(원석 비축 × 숯 2)가 값이 된다 · 손잡이 0');
{
  const js = `const E=require(${EP});const V2=require(${V2P});const npcs=new Array(10).fill({});
const mine={npcs,counts:{miner:1},land:{oreMix:{copper:1}},storage:{ore:4,charcoal:0}};
const idle={npcs,counts:{},land:{oreMix:{copper:1}},storage:{ore:0}};
const noMix={npcs,counts:{miner:1},storage:{ore:4}};
const full={npcs,counts:{miner:1},land:{oreMix:{copper:1}},storage:{ore:4,charcoal:40}};
process.stdout.write(JSON.stringify({m:E.derivedInputTarget(mine,'charcoal'),f:E.furnaceCharcoalTarget(mine),i:E.derivedInputTarget(idle,'charcoal'),n:E.derivedInputTarget(noMix,'charcoal'),
 p:V2.computeShadowPrices(mine).charcoal,pf:V2.computeShadowPrices(full).charcoal,cu:E.derivedInputTarget(mine,'copper')}));`;
  const off = probe({ T443_SMELT_FUEL: '0', T452_KILN_ACT: '0' }, js), a = probe({ T443_SMELT_FUEL: '1', T452_KILN_ACT: '0' }, js), b = probe({ T443_SMELT_FUEL: '0', T452_KILN_ACT: '1' }, js), on = probe({ T443_SMELT_FUEL: '1', T452_KILN_ACT: '1' }, js);
  const dflt = probe({}, js);   // ★[T471] 기본 = 셋 켬
  ok(JSON.stringify(dflt) === JSON.stringify(on), '⑦ [T471] 기본(손잡이 안 줌) = 셋 켬 판 그대로');
  ok(off.m === 0 && a.m === 0 && b.m === 0, '⑦ ★★되돌림 — T443·T452 중 하나라도 `=0` 이면 숯 파생수요 0(손잡이 0 · 뜻은 둘 다 켰을 때만)', JSON.stringify([off.m, a.m, b.m]));
  ok(off.p === a.p && off.p === b.p, '⑦ 끈 판 숯 값 = 종전(바닥)', String(off.p));
  ok(on.m === 20 && on.m === on.f, '⑦ 켬 — 캐는 마을 숯 목표 = max(원석 비축 1×10, 원석 4) × 숯 2 = 20 = 숯가마가 굽는 그 목표(`furnaceCharcoalTarget` 한 함수)', JSON.stringify(on));
  ok(on.i === 0 && on.n === 0, '⑦ ★미끼 — 캐지도 않고 녹일 원석도 없는 마을 · 광맥 조성이 없는 마을은 숯을 원하지 않는다(유령 비축 0)');
  ok(on.p > off.p * 100 && on.pf < on.p && on.pf <= 2, '⑦ 값은 있는 가격 기계 — 숯 0 인 광산 마을은 값이 오르고 목표를 채우면 기준가 아래로 내려온다', `${off.p} → ${on.p} · 채움 ${on.pf}`);
  ok(on.cu === off.cu, '⑦ 구리 파생수요(COPPER_DERIV) 는 무변');
  const dt = SRC.slice(SRC.indexOf('function derivedInputTarget'), SRC.indexOf("if (!COPPER_DERIV_ON || r !== 'copper'"));
  ok(/smeltFuelOn\(\)/.test(dt) && /kilnActOn\(\)/.test(dt) && /return furnaceCharcoalTarget\(v\);/.test(dt) && !/process\.env/.test(dt) && !/\b(?!0\b)\d+(\.\d+)?\b/.test(codeOf(dt)),
    '⑦ 파생수요 절 — 두 손잡이의 문을 그대로 읽는다 · 새 손잡이 0 · 새 수 0(0 밖의 수 글자 0)');
  ok(/const target = furnaceCharcoalTarget\(v\);/.test(SRC.slice(SRC.indexOf('function kilnDay'), SRC.indexOf('function _trySmelt'))), '⑦ 숯가마(`kilnDay`)와 파생수요가 **같은 함수**를 부른다(사본 0)');
  const V2S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
  ok((V2S.match(/v1\.derivedInputTarget \? v1\.derivedInputTarget\(v, r\) : 0/g) || []).length === 3 && !/charcoal/.test(V2S), '⑦ v2 가격 셋 자리(값 · 정산 · 부패)가 같은 줄을 부른다 · 캐러밴·v2 무접촉');
  const ERS = fs.readFileSync(path.join(ROOT, 'server', 'era.js'), 'utf8');
  ok(/bronze: \{\s*\n\s*tech: \[[^\]]*'charcoal_kiln'/.test(ERS) && /function tryKilnStart\(player, atX, atY\) \{ if \(!require\('\.\/era'\)\.hasTech\('charcoal_kiln'\)\)/.test(ZSRC),
    '⑦ era — 표(`UNLOCK.bronze.tech` 의 `charcoal_kiln`)가 정본 · 숯가마 건설 함수가 그 표를 묻는다(노 `tryFurnaceStart` 와 같은 문)');
}

// ── ⑧ [T488] 숯가마의 잉여 = 재고 − 비축 − 집 몫 ─────────────────────────────────────────
console.log('\n⑧ [T488] 숯가마 잉여에서 집 몫을 먼저 뺀다 — 같은 함수(`houseDayBuild`) · 손잡이 0');
{
  const js = `const E=require(${EP});const npcs=new Array(10).fill({});
const mk=()=>({npcs,counts:{lumberjack:2},storage:{wood:53,ore:4,food:1000},housing:5,_kiln:{built:0}});
const a=mk();const share=E.houseWoodShare(a);const r=E.kilnDay(a);
process.stdout.write(JSON.stringify({share,dayBuild:E.houseDayBuild(mk(),10,E.totalFoodEquivalent(mk())),cost:E.houseCostPerCap('wood'),b:r.batches,wood:a.storage.wood,ch:a.storage.charcoal||0}));`;
  const off = probe({ T400_BUILD_ACT: '0' }, js), on = probe({ T400_BUILD_ACT: '1' }, js);
  ok(off.share === 0, '⑧ ★집 끔 — 집 몫 0 = 숯가마 종전 그대로(손잡이 0)', JSON.stringify(off));
  ok(on.share > 0 && Math.abs(on.share - on.dayBuild * on.cost) < 1e-9, '⑧ 집 켬 — 집 몫 = 오늘 집이 올릴 양(`houseDayBuild`) × 통나무 단가(`houseCostPerCap`)', JSON.stringify(on));
  ok(off.b === 1 && on.b === 0 && on.wood === 53, '⑧ ★집 몫만큼 숯가마가 통나무를 남긴다 — 비축(5/인 × 10 = 50) 위 3 은 끔이면 한 배치 · 켬이면 집 몫(0.33)을 빼 3 미만이라 안 굽는다', `${off.b} → ${on.b} 배치 · 통나무 ${off.wood} → ${on.wood}`);
  const hb = SRC.slice(SRC.indexOf('★주거 증축: 집이 인구보다 모자라면'), SRC.indexOf('if (T452_KILN_ACT) kilnDay(v);'));
  ok(/houseDayBuild\(v, N, _fe\)/.test(hb) && !/HOUSE_BUILD_MAX/.test(codeOf(hb)), '⑧ 집 증축 절과 숯가마가 **같은 함수**를 부른다(여유노동 식 사본 0)');
  ok(/const spare = \(v\.storage\.wood \|\| 0\) - reserve - houseWoodShare\(v\);/.test(SRC) && SRC.indexOf('★주거 증축') < SRC.indexOf('if (T452_KILN_ACT) kilnDay(v);'), '⑧ 순서 무변(집 → 숯가마) · 잉여 한 줄');
}

console.log(`\n=== ${pass}/${pass + fail} ${fail ? '✗' : '✓'} ===`);
process.exit(fail ? 1 : 0);
