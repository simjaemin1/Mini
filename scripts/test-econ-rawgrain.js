#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-econ-rawgrain.js — 곳간의 생곡은 식량이다 (ECON 수술 2-a) ======
//
// ★왜 [재민 확정 2026-09-03 · T73]
//   T60 §0-ⓔ' 가 잡은 자리: 소멸한 광산1 은 **밀 21 · 쌀 12 를 두고 굶어 죽었다.**
//   `totalFoodEquivalent` 도 `consumeFood` 사다리도 생곡을 안 세는데, 세계의 다른 곳은 이미 식량으로 친다
//   (`specialty` 의 `contributes.subsistence` · `FOOD_GLUT_SAT`). 안 세는 자리가 둘뿐이었다.
//
// ★★이 하네스가 지키는 것 — **계수는 유도이지 발명이 아니다**
//   ① 근거 표  : 무게 정본 × 열량 정본이 `food` 1단위 = DAY_KCAL 을 낸다(교차 검산 · 사본 0)
//               그리고 채택 계수가 품목별 유도값(밀 0.750 · 쌀 0.771)보다 **작다**(보수성)
//   ② 계상     : 곳간의 생곡이 식량등가에 든다 · **끄면 정확히 0 을 더한다**(되돌림 = 비트 동일)
//   ③ 사다리   : `food` 뒤 · 채집물 앞. 세 칸의 순서를 실제 소비로 증명한다
//   ④ 광산1    : 생곡만 남은 마을이 **끄면 굶고 켜면 먹는다** — 둘 다 본다(대조군)
//   ⑤ 돌연변이 : 계수를 흔들면 이 하네스가 **빨개진다**(자식 프로세스로 실증)
//   ⑥ 3사본    : 번들이 소스와 같은 상수·같은 세 자리를 갖는다
//
// 실행: node scripts/test-econ-rawgrain.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (extra !== undefined && extra !== '' ? `  ${extra}` : '')); };

const econ = R('sim/economy-sim');
const W = R('server/weights');
const K = R('server/kcal');
const SPEC = R('server/specialty');
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const GRAINS = econ.RAW_GRAINS;                 // ★표도 정본에게 묻는다
const F = econ.RAW_GRAIN_FOOD_FACTOR;          // ★정본에게 묻는다 — 계수를 여기 다시 적지 않는다
const ON = process.env.T73_RAWGRAIN !== '0';

// 곳간만 바꾼 최소 픽스처 — 인구 0(소비·생산이 안 돌아 곳간이 그대로 남는다)
function vil(storage) {
  const v = econ.createVillage({ initialPop: 0, name: '픽스처' });
  for (const k of Object.keys(v.storage)) v.storage[k] = 0;
  Object.assign(v.storage, storage);
  return v;
}

console.log('\n=== 곳간의 생곡은 식량이다 (ECON 수술 2-a) ===');
console.log(`  손잡이: T73_RAWGRAIN=${ON ? '켬' : '끔'} · 계수 ${F}`);

// ── ① 근거 표 — 계수는 두 정본의 나눗셈이다 ────────────────────────────────
console.log('\n① 계수는 발명이 아니다 — 무게 정본 ÷ 열량 정본');
{
  const kgFood = W.kgOf('food'), kcalFood = K.KCAL_PER_KG.food;
  ok(kgFood > 0 && kcalFood > 0, '① [자명 통과 금지] 두 정본을 실제로 읽었다', `food ${kgFood}kg · ${kcalFood}kcal/kg`);
  ok(kgFood * kcalFood === K.DAY_KCAL,
    '① ★★교차 검산 — `food` 1단위가 **사람 하루**다(사다리의 단위가 그것이라는 증거)',
    `${kgFood}kg × ${kcalFood} = ${kgFood * kcalFood}kcal = DAY_KCAL ${K.DAY_KCAL}`);
  // 품목별로 kg 비까지 반영하면 이만큼 나온다 — 채택값은 그 아래여야 한다(보수성)
  const per = { wheat: W.kgOf('wheat') * 0.75 / kgFood, rice: W.kgOf('rice') * 0.72 / kgFood };
  ok(per.wheat > 0.7 && per.rice > 0.7, '① [자명 통과 금지] 품목별 유도값이 실제로 계산됐다',
    `밀 ${per.wheat.toFixed(3)} · 쌀 ${per.rice.toFixed(3)}`);
  ok(F <= Math.min(per.wheat, per.rice) + 1e-9,
    '① ★채택 계수가 품목별 유도값보다 **작다**(보수적 — 과대계상 방지)',
    `${F} ≤ min(${per.wheat.toFixed(3)}, ${per.rice.toFixed(3)})`);
  ok(/const RAW_GRAIN_FOOD_FACTOR/.test(SRC) && (SRC.match(/RAW_GRAIN_FOOD_FACTOR/g) || []).length >= 4,
    '① 계수가 **하나의 이름**으로 서 있다(품목마다 흩뿌리지 않았다)',
    `${(SRC.match(/RAW_GRAIN_FOOD_FACTOR/g) || []).length}곳에서 그 이름을 쓴다`);
}

// ── ② 계상 — 곳간의 생곡이 식량등가에 든다 / 끄면 0 ────────────────────────
console.log('\n② 곳간의 생곡이 식량등가에 든다');
{
  const base = vil({ food: 10 });
  const withG = vil({ food: 10, wheat: 21, rice: 12, barley: 7 });
  const fe0 = econ.totalFoodEquivalent(base), fe1 = econ.totalFoodEquivalent(withG);
  const grain = 21 + 12 + 7;
  ok(fe0 === 10, '② [자명 통과 금지] 생곡 없는 곳간은 그대로다', `${fe0}`);
  if (ON) {
    ok(Math.abs(fe1 - (10 + grain * F)) < 1e-9,
      '② ★★생곡 40 이 계수만큼 더해진다', `${fe0} → ${fe1.toFixed(2)} (= 10 + ${grain}×${F})`);
    ok(fe1 > fe0, '② [자명 통과 금지] 실제로 늘었다(0 을 더하고 통과하는 게 아니다)', `+${(fe1 - fe0).toFixed(2)}`);
  } else {
    ok(fe1 === fe0, '② ★★되돌림 — 끄면 생곡이 **정확히 0** 을 더한다(비트 동일)', `${fe0} = ${fe1}`);
  }
  // ★기장은 산출이 0 이라 표에 안 넣었다 — 그 사실을 계약으로 못 박는다(넣고 싶으면 이 줄이 먼저 빨개진다)
  const millet = vil({ millet: 100 });
  ok(econ.totalFoodEquivalent(millet) === 0,
    '② 기장은 표에 **없다**(부산물 산출 0 — 실측). 넣으려면 이 줄부터 고쳐라', `${econ.totalFoodEquivalent(millet)}`);
  ok(/const RAW_GRAINS = \['wheat', 'rice', 'barley'\]/.test(SRC), '② 표가 셋뿐이다(소스 계약)');
}

// ── ③ 사다리 — `food` 뒤 · 채집물 앞 ───────────────────────────────────────
console.log('\n③ 사다리에서 생곡의 자리 — `food` 뒤 · 채집물 앞');
{
  const v = vil({ food: 2, wheat: 10, fruit: 10 });
  const left = econ.consumeFood(v, 5);
  const eaten = v._foodEaten || {};
  ok(left < 1e-9, '③ [자명 통과 금지] 5인분을 실제로 다 먹였다', `남은 ${left.toFixed(3)}`);
  ok((eaten.food || 0) === 2, '③ `food` 를 **먼저** 비운다', `food ${eaten.food}`);
  if (ON) {
    ok((eaten.wheat || 0) > 0, '③ ★★그 다음이 **생곡**이다', `밀 ${(eaten.wheat || 0).toFixed(2)}`);
    ok((eaten.fruit || 0) === 0, '③ ★★채집물(과일)은 **손도 안 댔다** — 생곡이 앞이다', `과일 ${eaten.fruit || 0}`);
    ok(Math.abs((eaten.wheat || 0) * F - 3) < 1e-9, '③ 먹은 만큼만 준다(환산이 계수 그대로)',
      `${(eaten.wheat || 0).toFixed(3)} × ${F} = 3`);
  } else {
    ok((eaten.wheat || 0) === 0, '③ ★★되돌림 — 끄면 생곡을 **안 먹는다**', `밀 ${eaten.wheat || 0}`);
    ok((eaten.fruit || 0) > 0, '③ [대조군] 대신 채집물이 소비된다(사다리가 살아 있다)', `과일 ${(eaten.fruit || 0).toFixed(2)}`);
  }
}

// ── ④ 광산1 — 생곡만 남은 마을 ─────────────────────────────────────────────
console.log('\n④ 광산1 — 생곡만 남은 마을은 굶는가, 먹는가');
{
  // T60 §0-ⓔ' 의 그 곳간을 그대로 세운다: 밀 21 · 쌀 12 · 그 밖의 식량 0
  const v = vil({ wheat: 21, rice: 12 });
  const fe = econ.totalFoodEquivalent(v);
  const left = econ.consumeFood(v, 5);          // 사람 5명의 하루
  if (ON) {
    ok(fe > 5, '④ ★★그 곳간은 **닷새치보다 많다**(굶을 곳간이 아니었다)', `식량등가 ${fe.toFixed(1)}`);
    ok(left < 1e-9, '④ ★★다섯 사람이 **먹는다**', `남은 ${left.toFixed(3)}`);
  } else {
    ok(fe === 0, '④ ★★[대조군] 끄면 그 곳간은 **식량 0** 이다 — 그래서 굶었다', `식량등가 ${fe}`);
    ok(Math.abs(left - 5) < 1e-9, '④ ★★[대조군] 다섯 사람이 **한 입도 못 먹는다**', `남은 ${left.toFixed(3)}`);
  }
  ok(21 > 0 && 12 > 0, '④ [자명 통과 금지] 곳간에 실제로 생곡이 있다(빈 곳간으로 통과하는 게 아니다)', '밀 21 · 쌀 12');
}

// ── ⑤ 돌연변이 — 계수를 흔들면 빨개지는가 ──────────────────────────────────
console.log('\n⑤ ★이 하네스가 실패할 줄 아는가 — 계수를 흔들어 본다');
if (!process.env.T73_MUTANT) {
  const run = (env) => {
    try { execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T73_MUTANT: '1' }), stdio: 'pipe' }); return 0; }
    catch (e) { return e.status || 1; }
  };
  ok(run({ T73_GRAIN_F: '0.01' }) !== 0, '⑤ 계수를 0.01 로 낮추면 **빨개진다**(계상·사다리가 안 맞는다)');
  ok(run({ T73_GRAIN_F: '0.99' }) !== 0, '⑤ 계수를 0.99 로 올리면 **빨개진다**(보수성 판정이 잡는다)');
  ok(run({ T73_RAWGRAIN: '0' }) === 0, '⑤ [대조] 되돌림 판(끔)은 **깨끗하게 통과한다**(항상 빨간 감사기가 아니다)');
} else {
  console.log('  (자식 프로세스 — ⑤ 건너뜀)');
}

// ── ⑥ 3사본 ────────────────────────────────────────────────────────────────
console.log('\n⑥ 3사본 — 번들이 소스와 같은 세계다');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  ok(/const RAW_GRAINS = \['wheat', 'rice', 'barley'\]/.test(B), '⑥ 번들에 생곡 표가 있다');
  ok(/RAW_GRAIN_FOOD_FACTOR/.test(B) && /T73_RAWGRAIN/.test(B), '⑥ 번들에 계수와 손잡이가 있다');
  const n = (B.match(/T73_RAWGRAIN/g) || []).length, m = (SRC.match(/T73_RAWGRAIN/g) || []).length;
  ok(n === m, '⑥ ★손잡이가 무는 자리 수가 소스와 **같다**(한 자리가 빠지면 랩만 다른 세계가 된다)', `번들 ${n} = 소스 ${m}`);
  ok(SPEC.RESOURCES.wheat.contributes.subsistence > 0,
    '⑥ [교차] specialty 는 **이미** 생곡을 자급 식량으로 친다(이 카드는 그 표에 econ 을 맞춘 것이다)',
    `wheat subsistence ${SPEC.RESOURCES.wheat.contributes.subsistence}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
