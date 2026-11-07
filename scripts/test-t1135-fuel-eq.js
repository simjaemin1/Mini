#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1135-fuel-eq.js — 땔감 평형(T1135 · ★재민 11-03 판정) ==================
//
// 지키는 것:
//   ① `T1135_FUEL_EQ` 끔(미설정 · '0' · 그 밖 값) = 종전 글자 — 나무꾼 분자 = `_woodOutLast` · 1인 땔감 = `FIREWOOD_PC` · 수식 목재 걷어냄 = `woodActOn`
//   ② 켬 = 분자 = 그날 땔감 수요(`_t1135Need` — 틱이 `fuelNeed` 를 남긴다) · 같은 문(`actDemandLeft`) · 곳간 입구(`woodToGranary`)도 같은 분자
//      ★자명 통과 금지: 켬이면 수요 문이 실제로 다른 값을 낸다(수식 몫 0 인 마을도 땔감 수요만큼 벤다)
//   ③ 나무 칸 0 마을 — 켬 ∧ 행위 층이면 수식 목재 0(`woodFormulaOff`) · 아직 안 센 마을(`undefined`)은 종전
//   ④ 고증 d = 1천만 ㎥ ÷ 21,526,374 × 663 kg/㎥ ÷ 365 ÷ 1단 kg(`weights.kgOf('wood')` 가 3 인지 대조)
//   ⑤ 재생 배수 — `chunk.REGROW.REGROW_K` 한 자리: `T1135_REGROW_K` > 0 이 먼저 · 없으면 켬 판 1 · 둘 다 없으면 T1107 그대로(끔 0)
//   ⑥ 한 그루 w — 존 전리품 배수 F = 67.9 t/ha ÷ (칸당 평균 그루 × 6.42단 × 1단 kg) · 끔 0 · 나무 · 어린나무만 · 반올림 정수
//   ⑦ 삭정이 — 출처 수(가지 574 + 점봉산 1,200 kg/ha/년) · 채집꾼 명부가 줍는다(나무꾼 절 뒤 · 산 나무 안 벰 · 같은 수요 문 · 같은 입구) · 켬만
//
// 실행: node scripts/test-t1135-fuel-eq.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1135_FUEL_EQ', 'T1135_REGROW_K', 'T1107_REGROW_K', 'T325_WOOD_ACT', 'T374_DEMAND_STOP'];
const sub = (env, code) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  for (const k of KNOBS) if (!(k in env)) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').pop());
};
console.log('\n=== T1135 — 땔감 평형 ===');
// ── ①②③ econ 문 ──
const ECON = `const E=require('./sim/economy-sim');
const a={_woodOutLast:2.5,_t1135Need:7.0,_t325InflowToday:1.0,_t325Cells:0};
const b={_woodOutLast:0,_t1135Need:4.0,_t325InflowToday:0};
const c={_woodOutLast:3,_t325Cells:5};
console.log(JSON.stringify({on:E.T1135_FUEL_EQ,src:E.FIREWOOD_PC_SRC,dA:E.woodShareD(a),leftA:E.woodDemandLeft(a),leftB:E.woodDemandLeft(b),
 offA:E.woodFormulaOff(a),offU:E.woodFormulaOff({_woodOutLast:1}),offC:E.woodFormulaOff(c),actA:E.woodActOn(a),actC:E.woodActOn(c)}));`;
const off = sub({ T325_WOOD_ACT: '1' }, ECON), off0 = sub({ T325_WOOD_ACT: '1', T1135_FUEL_EQ: '0' }, ECON), offX = sub({ T325_WOOD_ACT: '1', T1135_FUEL_EQ: 'yes' }, ECON);
const on = sub({ T325_WOOD_ACT: '1', T1135_FUEL_EQ: '1' }, ECON), onNoAct = sub({ T1135_FUEL_EQ: '1' }, ECON);
ok(off.on === false && JSON.stringify(off0) === JSON.stringify(off) && JSON.stringify(offX) === JSON.stringify(off), '① 미설정 · 0 · 그 밖 값 = 끔(같은 답)');
ok(off.dA === 2.5 && Math.abs(off.leftA - 1.5) < 1e-12 && off.leftB === 0, '① 끔 = 분자는 수식 몫(`_woodOutLast`)', `남은 몫 ${off.leftA} · 수식 0 마을 ${off.leftB}`);
ok(off.offA === off.actA && off.offC === off.actC && off.offA === false, '① 끔 = 수식 목재 걷어냄 = `woodActOn` 그대로');
ok(on.on === true && on.dA === 7 && Math.abs(on.leftA - 6) < 1e-12, '② 켬 = 분자는 그날 땔감 수요(`_t1135Need`)', `남은 몫 ${on.leftA}`);
ok(on.leftB === 4 && off.leftB === 0, '② ★자명 통과 금지 — 수식 몫 0 마을이 켬이면 땔감 수요만큼 벤다', `끔 ${off.leftB} → 켬 ${on.leftB}`);
ok(on.offA === true && on.offU === false && on.offC === true && onNoAct.offA === false, '③ 켬 ∧ 행위 층 ∧ 나무 칸 0 = 수식 목재 0 · 안 센 마을 · 행위 층 끔 = 종전');
{
  const S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  ok(/function woodToGranary\(v, units\) \{[\s\S]{0,120}actDemandCap\(v, units, woodShareD\(v\), '_t325InflowToday'\)/.test(S), '② 곳간 입구도 같은 분자(`woodShareD`)');
  ok(/const fuelNeed = _homeN \* _firewoodPC\(\) \* \(1 \+ FUEL_COLD_W/.test(S) && /if \(T1135_FUEL_EQ\) v\._t1135Need = fuelNeed;/.test(S), '② 틱이 그날 `fuelNeed` 를 남긴다(1인 수요 = `_firewoodPC()`)');
  const SC = S.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');   // 주석 뺀 판(부름만 센다)
  const uses = (SC.match(/\bFIREWOOD_PC\b(?!_SRC)/g) || []).length, fn = (SC.match(/_firewoodPC\(\)/g) || []).length;
  ok(fn === 6 && /const need = N \* _firewoodPC\(\) \* \(H \+ FUEL_COLD_W \* \(A\.cs \|\| 0\)\);/.test(S) && /const _firewoodPC = \(\) => \(T1135_FUEL_EQ \? FIREWOOD_PC_SRC : FIREWOOD_PC\);/.test(S), '④ 1인 땔감을 읽는 자리가 한 함수(`_firewoodPC` — 주석 뺀 부름: T1135 네 줄 다섯 + ★[T1148] 추위 빚 하나)', `함수 ${fn} · 상수 글자 ${uses}`);
}
// ── ④ 고증 d ──
{
  const kg = sub({}, `console.log(JSON.stringify(require('./server/weights').kgOf('wood')))`);
  const want = 10000000 / 21526374 * 663 / 365 / kg;
  ok(kg === 3 && Math.abs(off.src - want) < 1e-12 && Math.abs(off.src - 0.2813) < 1e-4, '④ 고증 d = 1천만 ㎥ ÷ 21,526,374 × 663 ÷ 365 ÷ 1단 kg', `${off.src.toFixed(5)}단 = ${(off.src * kg).toFixed(3)} kg/인/일`);
}
// ── ⑤ 재생 배수 ──
{
  const K = `const C=require('./server/chunk');console.log(JSON.stringify({k:C.REGROW.REGROW_K(),oak:C.regrowStageOf('tree',3000,'oak'),hz:C.regrowStageOf('tree',400,'hazel')}));`;
  const k0 = sub({}, K), kon = sub({ T1135_FUEL_EQ: '1' }, K), k4 = sub({ T1135_REGROW_K: '4' }, K), k4b = sub({ T1135_FUEL_EQ: '1', T1135_REGROW_K: '4', T1107_REGROW_K: '8' }, K), k1107 = sub({ T1107_REGROW_K: '8' }, K), k1107on = sub({ T1135_FUEL_EQ: '1', T1107_REGROW_K: '8' }, K);
  ok(k0.k === 0 && kon.k === 1 && k4.k === 4 && k4b.k === 4, '⑤ 끔 0 · 켬 1 · `T1135_REGROW_K` 가 먼저', `${k0.k} · ${kon.k} · ${k4.k} · ${k4b.k}`);
  ok(k1107.k === 8 && k1107on.k === 1, '⑤ 둘 다 없으면 T1107 그대로 · 켬 판은 T1107 값을 안 읽는다(k 손잡이는 T1135 하나)', `${k1107.k} · ${k1107on.k}`);
  const k16 = sub({ T1135_REGROW_K: '16' }, K);
  ok(k16.hz !== k0.hz || k16.oak !== k0.oak, '⑤ ★자명 통과 금지 — k 16 이면 단계가 바뀐다', `개암 400일 ${k0.hz} → ${k16.hz} · 참나무 3000일 ${k0.oak} → ${k16.oak}`);
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/\n    if \(_on && !\(_t1107K\(\) > 0\)\) \{\n      const _r = _lifeEcon\(\)\.woodRegrowR\(/.test(V) && !/T1135_REGROW_K/.test(V), '⑤ 로지스틱 끔 문은 같은 한 줄(정본 `REGROW_K` 를 묻는다 · villages 는 env 무접촉)');
}
// ── ⑥ 한 그루 w ──
{
  const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
  const i0 = Z.indexOf('const T1135_W_BAR'), i1 = Z.indexOf('function lootOfResource(r, ctx) {'), i2 = Z.indexOf("  if (t === 'berry_bush') {", i1);
  ok(i0 > 0 && i1 > i0 && i2 > i1, '⑥ 전리품 배수 절이 전리품 정본 바로 앞에 있다');
  //   정본의 나무 · 어린나무 · 바위 갈래를 **그 글자 그대로** 떼어 돌린다(도토리 해시만 막대 — 이 검사는 단을 본다)
  const snip = Z.slice(i0, i2) + '  return null;\n}\n';
  const run = (env) => sub(env, `const Weights=require('./server/weights');const _gidHash=()=>1;const ACORN_BYPRODUCT=0;
${snip.replace(/require\('\.\/chunk'\)/g, "require('./server/chunk')")}
const C=require('./server/chunk');console.log(JSON.stringify({F:_t1135W(),want:67.9*1000/10000/(C.forestTreesPerCellMean(32)*6.42*Weights.kgOf('wood')),t8:lootOfResource({type:'tree',r:8,x:0,y:0}),t20:lootOfResource({type:'tree',r:20,x:0,y:0}),s4:lootOfResource({type:'sapling',r:4}),rock:lootOfResource({type:'rock'})}));`);
  const a = run({}), b = run({ T1135_FUEL_EQ: '1' });
  ok(a.F === 0 && a.t8.wood === 5 && a.t20.wood === 9 && a.s4.wood === 2, '⑥ 끔 = 배수 0(전리품 그대로)');
  ok(Math.abs(b.F - b.want) < 1e-12 && Math.abs(b.F - 2.2034) < 1e-3, '⑥ 켬 F = 67.9 t/ha ÷ (칸당 평균 그루 × 6.42단 × 1단 kg)', `F ${b.F.toFixed(4)}`);
  ok(b.t8.wood === Math.round(5 * b.F) && b.t20.wood === Math.round(9 * b.F) && b.s4.wood === Math.round(2 * b.F) && b.t8.twig === 1 && JSON.stringify(b.rock) === JSON.stringify(a.rock), '⑥ 나무 · 어린나무 단만 × F(반올림) · 잔가지 · 바위 무변', `${a.t8.wood}→${b.t8.wood} · ${a.t20.wood}→${b.t20.wood} · 어린 ${a.s4.wood}→${b.s4.wood}`);
  ok((Z.match(/_t1135Sap\(/g) || []).length === 3 && /    return _t1135Sap\(l\);/.test(Z) && /  if \(t === 'sapling'\)    return _t1135Sap\(\{ wood: 1 \+ Math\.floor\(\(r\.r \|\| 4\) \/ 3\), twig: 1 \}\);/.test(Z)
     && /t325LootOf: \(r\) => lootOfResource\(r\)/.test(Z), '⑥ 정본 두 갈래의 return 이 한 함수(`_t1135Sap`)를 지난다 · 몸 · 헤드리스가 같은 `lootOfResource`(→ `t325LootOf`)');
}
// ── ⑦ 삭정이 ──
// ★[T1208] 옛 글자 둘을 지금 글자로 — ② 인구 칸이 `_homeN`(집에 있는 사람 · 원정 뺌) · ⑦ 명부 0 문에 T1180 생산 식 끔(`productionFormulaOff` 나무꾼) 갈래가 붙었다(뜻 · 단언 무변).
{
  const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/const T1135_DEAD_KG_HA_YR = 6593 \* 0\.087 \+ 1200;/.test(V), '⑦ 출처 수 — 계방산 가지 낙엽(6,593 × 8.7%) + 점봉산 고사목 1,200 kg/ha/년');
  const g = V.indexOf('// ★★[T1135 ③] **삭정이 줍기 — 채집꾼이 숲 칸을 걸으며 줍는다**'), lj = V.indexOf("let loot = null; try { loot = state.deps.t325CutTreeAt ? state.deps.t325CutTreeAt(t.cx, t.cy) : null; }"), fg = V.indexOf('// ★★[T347 2026-09-22] **채집도 같은 하루다**');
  ok(g > lj && fg > g && lj > 0, '⑦ 줍기 절은 나무꾼 절 뒤 · 채집 절 앞(헤드리스 하루 한 자리)');
  const blk = V.slice(g, fg);
  ok(!/t325CutTreeAt|t341Unharvest/.test(blk), '⑦ 산 나무는 안 벤다(벌목 문 · 되살림 문을 안 부른다)');
  ok(/_t561Crew\(vil, 'forager'\)/.test(blk) && /vil\.econ\.counts && vil\.econ\.counts\.forager/.test(blk) && /const _fg = \(_t449S \|\| _lifeEcon\(\)\.productionFormulaOff\?\.\(vil\.econ,'lumberjack'\)\) \? 0 : _fgE;/.test(blk), '⑦ 명부 = 채집꾼(채집 절과 같은 한 칸 · 관측 마을은 몸 명부라 0)');
  ok(/woodDemandLeft\(vil\.econ\)/.test(blk) && /woodToGranary\(vil\.econ, _take\)/.test(blk) && /_t491BodyDay\(vil, Math\.sqrt\(_bd\)\) \* _fg/.test(blk), '⑦ 같은 수요 문 · 같은 곳간 입구 · 걸음 한도(한 몸의 하루 단 × 명부)');
  ok(/if \(vil\.econ && _lifeEcon\(\)\.T325_WOOD_ACT && _t1135On\(\) && _lifeEcon\(\)\.woodActOn\(vil\.econ\)\) \{/.test(blk) && /function _t1135On\(\) \{ return !!_lifeEcon\(\)\.T1135_FUEL_EQ; \}/.test(V), '⑦ 켬만(끔 = 한 줄도 안 돈다 · env 는 econ 정본 하나)');
  ok(/const live = \(S && S\.K > 0\) \? Math\.min\(1, \(S\.N \| 0\) \/ S\.K\) : 0;/.test(V), '⑦ 벤 숲은 덜 떨어뜨린다(지금 선 그루 ÷ 교란 전 그루)');
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
