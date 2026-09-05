#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-econ-diet.js — 식단은 사다리가 아니라 예산이다 (ECON 수술 2-d) =======
//
// ★왜 [재민 확정 2026-09-03 · T86]
//   재민 물음: *"식량이 여러 종류 있으면 골고루 소모해? 저렴한 것부터? 골고루만이면 비효율,
//   저렴한 것부터면 행복이 바닥 — 경제학적 균형을 맞춰야."*
//   종전 `consumeFood` 는 **고정 사다리**라 위 칸이 넉넉하면 그것만 먹고 **가격을 안 봤다.**
//   어촌은 곳간에 곡식이 있어도 생선만 먹었다 — 다양성이 설계가 아니라 **재고 부족의 부산물**이었다.
//
// ★★이 하네스가 지키는 것
//   ① 둘 다 먹는다  : 생선 넉넉 + 곡식 넉넉이면 **둘 다** (종전은 생선만 — 대조군을 같이 본다)
//   ② 하위 호환    : 한 품목뿐이면 종전과 **비트 동일** · 가격표가 없으면 **사다리로 내려간다**
//   ③ 한계효용     : 싼 것을 더 많이 먹되 **비싼 것도 0 이 아니다**
//   ④ 보존식       : 신선식이 있으면 **안 먹는다**(T17 ② 맨 뒤 규약 — 예산 밖으로 뺀 자리)
//   ⑤ 열량 보존    : 먹은 열량 합 = need − remaining (사다리 반환 규약 무변)
//   ⑥ 돌연변이     : w_g 하나를 0 으로 만들면 그 군이 0 이라 **빨개진다**
//   ⑦ 3사본        : 번들이 소스와 같은 표·같은 손잡이를 갖는다
//
// 실행: node scripts/test-econ-diet.js
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
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const ON = process.env.T86_DIET !== '0';

// 인구 0 픽스처 — 곳간만 놓고 `consumeFood` 를 직접 부른다(소비·생산 틱이 안 끼어든다)
function vil(storage, prices) {
  const v = econ.createVillage({ initialPop: 0, name: '픽스처' });
  for (const k of Object.keys(v.storage)) v.storage[k] = 0;
  Object.assign(v.storage, storage);
  if (prices) v._priceCache = prices;
  return v;
}
const ate = (v) => { const o = {}; for (const k in (v._foodEaten || {})) if (v._foodEaten[k] > 1e-6) o[k] = +v._foodEaten[k].toFixed(3); return o; };
const PRICES = { fish: 1, wheat: 0.1, rice: 0.1, barley: 0.1, food: 3, meat: 1, fruit: 1, vegetable: 1, mushroom: 1, cooked_food: 1,
                 dried_fish: 0.2, dried_fruit: 0.2, smoked_meat: 0.2, pickled_veg: 0.2 };

console.log('\n=== 식단은 사다리가 아니라 예산이다 (ECON 수술 2-d) ===');
console.log(`  손잡이: T86_DIET=${ON ? '켬' : '끔'} · w_g 모드 ${process.env.T86_WMODE || 'i'}`);

// ── ① 둘 다 먹는가 ─────────────────────────────────────────────────────────
console.log('\n① 생선도 곡식도 있으면 — 둘 다 먹는가');
{
  const v = vil({ fish: 100, wheat: 100 }, PRICES);
  const left = econ.consumeFood(v, 10);
  const E = ate(v);
  ok(left < 1e-6, '① [자명 통과 금지] 10인분을 실제로 다 먹였다', `남은 ${left.toFixed(4)}`);
  ok((E.fish || 0) > 0, '① [상황] 생선을 먹었다', `${E.fish || 0}`);
  if (ON) {
    ok((E.wheat || 0) > 0, '① ★★곳간에 곡식이 있으면 **곡식도 먹는다**(재민 물음의 답)', `밀 ${E.wheat}`);
    ok((E.fish || 0) < 10 - 1e-6, '① ★그리고 생선만 먹지 않는다(종전은 생선 10 이었다)', `생선 ${E.fish}`);
  } else {
    ok(!(E.wheat > 0), '① ★★[대조군] 끄면 **생선만** 먹는다 — 그게 종전 사다리다', `밀 ${E.wheat || 0}`);
    ok(Math.abs((E.fish || 0) - 10) < 1e-6, '① ★[대조군] 생선 10 을 다 먹는다', `생선 ${E.fish}`);
  }
}

// ── ② 하위 호환 ────────────────────────────────────────────────────────────
console.log('\n② 하위 호환 — 한 품목뿐이거나 가격표가 없으면 종전과 같다');
{
  const a = vil({ fish: 100 }, PRICES); const la = econ.consumeFood(a, 10);
  ok(Math.abs((ate(a).fish || 0) - 10) < 1e-6 && la < 1e-6,
    '② ★★곳간에 한 품목뿐이면 **종전과 비트 동일**', JSON.stringify(ate(a)));
  const b = vil({ fish: 100, wheat: 100 }, null);   // 가격표 없음
  econ.consumeFood(b, 10);
  ok(Math.abs((ate(b).fish || 0) - 10) < 1e-6 && !(ate(b).wheat > 0),
    '② ★★가격표(`_priceCache`)가 없으면 **사다리로 내려간다**(v1 CLI·픽스처 안전)', JSON.stringify(ate(b)));
}

// ── ③ 한계효용 — 싼 것을 더, 비싼 것도 0 아님 ──────────────────────────────
console.log('\n③ 싼 것을 더 많이 · 비싼 것도 0 이 아니다');
if (ON) {
  const v = vil({ fish: 100, wheat: 100, vegetable: 100, mushroom: 100, fruit: 100, meat: 100 }, PRICES);
  econ.consumeFood(v, 12);
  const E = ate(v);
  // ★판정은 "몇 품목"이 아니라 **재고가 있는 군을 하나도 빠뜨리지 않는가** 다.
  //   그래야 w_g 하나를 0 으로 만든 판(후보 iii 는 fruit·forage 가 0)이 이 줄에서 빨개진다 — ⑥ 이 그걸 쓴다.
  const GRP = { fish: 'fish', wheat: 'grain', vegetable: 'veg', mushroom: 'forage', fruit: 'fruit', meat: 'meat' };
  const missing = Object.keys(GRP).filter((r) => !(E[r] > 0));
  ok(missing.length === 0,
    '③ ★★재고가 있는 **여섯 군을 하나도 안 빠뜨린다**(다양성이 설계가 된다)',
    missing.length ? `안 먹은 군: ${missing.join(' · ')} — ${JSON.stringify(E)}` : JSON.stringify(E));
  ok(Object.values(E).every((x) => x > 0), '③ 먹은 품목은 전부 양수(0 을 세어 통과하지 않는다)');
  // 같은 군(grain) 안에서: 싼 밀이 비싼 food 보다 많이
  const v2f = vil({ wheat: 100, food: 100 }, PRICES);
  econ.consumeFood(v2f, 10);
  const F = ate(v2f);
  ok((F.wheat || 0) > 0 && (F.food || 0) >= 0, '③ [상황] 같은 군 안 두 품목을 놓고 골랐다', JSON.stringify(F));
  // ★[재민 판정 ⓓ] 배정은 **등분이 아니라 가격 가중 지출 몫**이다 — 그 식을 못 박는다.
  //   싼 군이 더 많은 열량을 받는다: x_g ∝ w_g / p_g. 등분이면 이 줄이 빨개진다.
  {
    const a = vil({ fish: 1000, wheat: 1000 }, { fish: 10, wheat: 0.1 });   // 곡물이 100배 싸다
    econ.consumeFood(a, 10);
    const A = ate(a);
    const calF = (A.fish || 0), calW = (A.wheat || 0) * econ.RAW_GRAIN_FOOD_FACTOR;
    ok(calW > calF * 3,
      '③ ★★싼 군이 **훨씬 많은 열량**을 받는다(등분이면 반반이라 빨개진다 — 재민 판정 ⓓ)',
      `곡물 ${calW.toFixed(2)}kcal vs 생선 ${calF.toFixed(2)}kcal`);
    ok(calF > 0, '③ ★그래도 비싼 군이 **0 은 아니다**(한계효용 — "저렴한 것부터"가 아니다)', `생선 ${calF.toFixed(3)}`);
    ok(/x_g = need × \(w_g\/p_g\) \/ Σ_h \(w_h\/p_h\)/.test(SRC),
      '③ 소스에 그 식이 **적혀 있다**(Cobb-Douglas 지출 몫 · 소스 계약)');
  }
  ok((F.wheat || 0) * econ.RAW_GRAIN_FOOD_FACTOR > (F.food || 0),
    '③ ★군 안에서는 **싼 쪽(밀 0.1)이 비싼 쪽(food 3.0)보다 많다**',
    `밀 ${(F.wheat || 0).toFixed(2)}×${econ.RAW_GRAIN_FOOD_FACTOR} > food ${(F.food || 0).toFixed(2)}`);
} else {
  ok(true, '③ (되돌림 판 — 건너뜀)');
}

// ── ④ 보존식은 신선식이 있으면 안 먹는다 ───────────────────────────────────
console.log('\n④ 보존식은 맨 뒤 — T17 ② 규약(예산 밖)');
{
  const v = vil({ fish: 100, wheat: 100, dried_fish: 100, smoked_meat: 100 }, PRICES);
  econ.consumeFood(v, 10);
  const E = ate(v);
  ok(!(E.dried_fish > 0) && !(E.smoked_meat > 0),
    '④ ★★신선식이 있으면 보존식을 **한 톨도 안 먹는다**(값이 싸도 — 예산 밖이라서)', JSON.stringify(E));
  ok(PRICES.dried_fish < PRICES.fish,
    '④ [자명 통과 금지] 이 픽스처에서 보존식이 **더 싸다**(비싸서 안 먹은 게 아니다)',
    `건어물 ${PRICES.dried_fish} < 생선 ${PRICES.fish}`);
  const w = vil({ dried_fish: 100 }, PRICES);
  const lw = econ.consumeFood(w, 5);
  ok(lw < 1e-6 && (ate(w).dried_fish || 0) > 0,
    '④ [대조군] 신선식이 없으면 보존식을 **먹는다**(굶기는 게 아니다)', JSON.stringify(ate(w)));
}

// ── ⑤ 열량 보존 ────────────────────────────────────────────────────────────
console.log('\n⑤ 열량 보존 — 먹은 만큼만 준다');
{
  const v = vil({ fish: 3, wheat: 4, vegetable: 5 }, PRICES);
  const need = 10, left = econ.consumeFood(v, need);
  const E = v._foodEaten || {};
  const FF = { fruit: 0.4, vegetable: 0.4, mushroom: 0.3 };
  let cal = 0;
  for (const r in E) {
    const f = r === 'cooked_food' ? 1.12 : (r === 'food' || r === 'fish' || r === 'meat') ? 1
      : econ.RAW_GRAINS.indexOf(r) >= 0 ? econ.RAW_GRAIN_FOOD_FACTOR : (FF[r] || 0);
    cal += (E[r] || 0) * f;
  }
  ok(Math.abs(cal - (need - left)) < 1e-6,
    '⑤ ★★먹은 열량 합 = need − remaining (반환 규약 무변)', `${cal.toFixed(4)} = ${need} − ${left.toFixed(4)}`);
  ok(left > 0, '⑤ [자명 통과 금지] 곳간이 모자라 실제로 남았다(0=0 통과가 아니다)', `남은 ${left.toFixed(3)}`);
}

// ── ⑥ 돌연변이 ─────────────────────────────────────────────────────────────
console.log('\n⑥ ★이 하네스가 실패할 줄 아는가');
if (!process.env.T86_MUTANT) {
  const run = (env) => {
    try { execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, env, { T86_MUTANT: '1' }), stdio: 'pipe' }); return 0; }
    catch (e) { return e.status || 1; }
  };
  ok(run({ T86_WMODE: 'iii' }) !== 0, '⑥ w_g 에서 두 군을 0 으로 만드는 후보(iii)면 **빨개진다**(③ 이 잡는다)');
  ok(run({ T86_DIET: '0' }) === 0, '⑥ [대조] 되돌림 판(끔)은 **깨끗이 통과한다**(항상 빨간 감사기가 아니다)');
} else {
  console.log('  (자식 프로세스 — ⑥ 건너뜀)');
}

// ── ⑦ 3사본 ────────────────────────────────────────────────────────────────
console.log('\n⑦ 3사본 · 소스 계약');
{
  const B = fs.readFileSync(path.join(ROOT, 'sim', 'economy-engine.browser.js'), 'utf8');
  for (const k of ['T86_GROUP', 'T86_W', 'T86_DIET', '_t86Factor']) {
    ok(B.indexOf(k) >= 0, `⑦ 번들에 \`${k}\` 가 있다`);
  }
  const n = (B.match(/T86_DIET/g) || []).length, m = (SRC.match(/T86_DIET/g) || []).length;
  ok(n === m, '⑦ ★손잡이가 무는 자리 수가 소스와 **같다**', `번들 ${n} = 소스 ${m}`);
  ok(!/T86_DECAY/.test(SRC) && !/T86_DECAY/.test(B),
    '⑦ ★★부패 항은 **식에 없다**(재민 판정 — 순서를 한 번도 안 바꿔서 뺐다)');
  ok(/const T86_GROUP = Object\.assign\(\{\}, FOOD_GROUP/.test(SRC),
    '⑦ 군 표는 `FOOD_GROUP` 을 **확장**한다(새 군을 만들지 않았다 — 소스 계약)');
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===\n`);
process.exit(fail ? 1 : 0);
