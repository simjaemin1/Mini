#!/usr/bin/env node
// @regress
// === scripts/test-food-hunger.js — 식량 값의 희소도 = 곳간 식량 환산(T859 · 손잡이 `T859_FOOD_HUNGER`='1' · 없음 = 끔 = main 바이트) ===
//
// ★왜 [T842 회부 1 · PM 결정 ㄷ · 재민 10-21 "굶으면 식량 가치가 높아야"] `food` 그림자가격의 유효 재고는 `storage.food` 한 칸이었다 —
//   쌀만 쌓은 배부른 마을도 `food` 칸이 0 이면 값이 천장이었다. 켬: 유효 재고 = 곳간 식량 환산(`totalFoodEquivalent`) · 흐름 선반영은 그대로.
//
//  econ 랩(포트 0 · 하위 실행) — 끔 세계의 같은 곳간에 끔 · 켬 두 값 함수를 댄다(켬 모듈은 손잡이를 켠 채 한 번 더 적재):
//   ① 쌀만 쥔 배부른 마을(food 칸 0 · 쌀 인구 × 60 · 흐름 흑자) — 끔은 food 값이 높다(상황 · 자명 통과 금지) · ★켬은 낮다
//   ② 먹을 것이 하나도 없는 마을 — 켬 · 끔 둘 다 높다(★켬에서 ①보다 높다 — 굶주림이 값을 정한다)
//   ③ food 칸만 쥔 마을(다른 먹을 것 0) — 켬 = 끔(곳간 식량 환산 = food 칸 · 같은 값)
//   ④ 정산 곡선 — 켬: 쌀만 쥔 마을의 food 곡선 값(유효 재고) = 값표 값 · 끔과 다르다
//   ⑤ 손잡이 값('1' 만)
// 실행: node scripts/test-food-hunger.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T859_SUB === '1') {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const world = V2.createWorldV2({ seed: 7, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  for (let d = 0; d < 60; d++) V2.tickWorldV2(world);
  const fw = (r) => { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; return V1.totalFoodEquivalent({ storage: st, npcs: [] }); };
  const clear = (v) => { for (const r of Object.keys(v.storage)) if (fw(r) > 0) v.storage[r] = 0; v.surplusEMA = Object.assign({}, v.surplusEMA, { food: 0 }); };
  const [A, B, C] = world.villages;
  clear(A); A.storage.rice = A.npcs.length * 60;
  clear(B);
  clear(C); C.storage.food = C.npcs.length * 20;
  const out = { knob: process.env.T859_FOOD_HUNGER === '1', tfe: [A, B, C].map((v) => V1.totalFoodEquivalent(v) / v.npcs.length) };
  const _env = process.env.T859_FOOD_HUNGER;
  const mod = (on) => { const k = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2')); delete require.cache[k];
    if (on) process.env.T859_FOOD_HUNGER = '1'; else delete process.env.T859_FOOD_HUNGER; const m = require(k); if (_env == null) delete process.env.T859_FOOD_HUNGER; else process.env.T859_FOOD_HUNGER = _env; return m; };
  for (const [k, X] of [['off', mod(false)], ['on', mod(true)]]) {
    const P = X._priceParamsV2(A, 'food'), S0 = X._impactSegs(P), eps = 1e-6;
    out[k] = { A: X.computeShadowPrices(A).food, B: X.computeShadowPrices(B).food, C: X.computeShadowPrices(C).food,
      curveA: (X._impactF(P, S0, P.sEff + eps) - X._impactF(P, S0, P.sEff)) / eps };
  }
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (env) => { const e = Object.assign({}, process.env, env, { T859_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T859_FOOD_HUNGER' in env)) delete e.T859_FOOD_HUNGER;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };
const f3 = (x) => (+x).toFixed(3);
console.log('\n=== T859 — 식량 값의 희소도 = 곳간 식량 환산 ===');
const W = sub({}), WK = sub({ T859_FOOD_HUNGER: 'true' }), WON = sub({ T859_FOOD_HUNGER: '1' });
const { off: OFF, on: ON } = W;
console.log(`  (곳간 식량 환산 일수 — 쌀만 ${W.tfe[0].toFixed(1)} · 없음 ${W.tfe[1].toFixed(1)} · food 칸만 ${W.tfe[2].toFixed(1)})`);
console.log('\n① 쌀만 쥔 배부른 마을');
ok(OFF.A > OFF.C, '상황 — 끔: food 칸이 0 이라 food 값이 food 칸을 쥔 마을보다 높다', `${f3(OFF.A)} > ${f3(OFF.C)}`);
ok(ON.A < OFF.A && ON.A <= ON.C + 1e-9, '★켬: 쌀만 쥔 배부른 마을의 food 값이 낮다(food 칸을 쥔 마을 이하)', `${f3(ON.A)} < 끔 ${f3(OFF.A)} · food 칸 마을 ${f3(ON.C)}`);
console.log('\n② 먹을 것이 없는 마을');
ok(ON.B > ON.A && ON.B >= OFF.A - 1e-9, '★켬: 먹을 것이 없는 마을의 food 값은 높다 — 쌀만 쥔 마을보다', `${f3(ON.B)} > ${f3(ON.A)}`);
ok(Math.abs(ON.B - OFF.B) < 1e-9 * Math.max(1, OFF.B), '먹을 것이 없는 마을은 켬 = 끔(곳간 식량 환산 = food 칸 = 0)', `${f3(ON.B)} = ${f3(OFF.B)}`);
console.log('\n③ food 칸만 쥔 마을');
ok(Math.abs(ON.C - OFF.C) < 1e-9 * Math.max(1, OFF.C), '켬 = 끔 — 곳간 식량 환산 = food 칸이면 같은 값', `${f3(ON.C)} = ${f3(OFF.C)}`);
console.log('\n④ 정산 곡선');
ok(Math.abs(ON.curveA - ON.A) <= 1e-3 * Math.max(1, ON.A) && Math.abs(OFF.curveA - ON.curveA) > 1e-6, '켬: 쌀만 쥔 마을 food 곡선 값 = 값표 값 · 끔 곡선과 다르다', `${f3(ON.curveA)} ≈ ${f3(ON.A)} · 끔 ${f3(OFF.curveA)}`);
console.log('\n⑤ 손잡이');
ok(W.knob === false && WON.knob === true, "'1' 만 켬 — 없음 = 끔");
ok(JSON.stringify(WK.off) === JSON.stringify(W.off), "다른 값('true')은 끔 — 값 글자 그대로");
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
