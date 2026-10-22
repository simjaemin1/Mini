#!/usr/bin/env node
// @regress
// === scripts/test-food-floor.js — 먹을 것의 값은 식량 값 밑으로 안 내려간다(T842 · 손잡이 `T842_FOOD_FLOOR`='1' · 없음 = 끔 = main 바이트) ===
//
// ★왜 [재민 10-21 · T842] 굶주림 신호(`surplusEMA.food < 0` → 재고 30일 선반영)는 `food` 값에만 걸리고, 생계 소비 0 인 쌀 · 바다 종 · 채집은
//   마을이 굶어도 값이 평소대로였다 → 곳간 식량이 쌀뿐인 마을이 쌀을 내다 팔았다(T796 회부 4 · T825).
//   켬: 먹을 것 r 의 그 마을 값 ≥ (r 1단위 식량 환산) × (그 마을 food 값). 잉여 셈은 안 건드린다(값이 막는다).
//
//  econ 랩(포트 0 · 하위 실행) — ①②③ 은 끔 세계의 같은 곳간에 끔 · 켬 두 값 함수를 · ④ 는 끔 세계 ↔ 켬 세계:
//   ① 굶는 마을(식량류 0 · 쌀만 · 식량 흐름 적자) — 켬: 쌀 값 ≥ 0.72 × 식량 값 · 끔: 그 하한 밑(상황 assert — 자명 통과 금지)
//   ② 배부른 마을 — 켬 · 끔 값표가 하한이 안 닿는 품목에서 같다 · 하한이 닿는 품목은 하한 값 그대로
//   ③ 정산 곡선 — 켬: 쌀을 그 마을에 팔면 단가 ≥ 하한(곡선 바닥이 하한) · 곡선 값(유효 재고) = 값표 값
//   ④ 20일 — 굶는 마을(매일 같은 곳간)이 굶는 날 먹을 것 수출: 끔 > 0(상황) · 켬 0
// 실행: node scripts/test-food-floor.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T842_SUB === '1') {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const world = V2.createWorldV2({ seed: 7, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  for (let d = 0; d < 60; d++) V2.tickWorldV2(world);
  const fw = (r) => { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; return V1.totalFoodEquivalent({ storage: st, npcs: [] }); };
  const S = world.villages[0], F = world.villages[1];
  const starve = (v) => { for (const r of Object.keys(v.storage)) if (fw(r) > 0) v.storage[r] = 0; v.storage.rice = v.npcs.length * 5; v.surplusEMA = Object.assign({}, v.surplusEMA, { food: -Math.max(1, v.npcs.length * 0.1) }); };
  starve(S);
  const out = { knob: process.env.T842_FOOD_FLOOR === '1', riceF: fw('rice'), S: S.name, F: F.name };
  //   ①②③ 은 **같은 곳간**에 끔 · 켬 두 값 함수를 댄다 — 켬 모듈은 손잡이를 켠 채 한 번 더 적재(econ 세계 · 마을 객체는 그대로 · 값 함수는 순수 읽기)
  const _env = process.env.T842_FOOD_FLOOR;
  const mod = (on) => { const k = require.resolve(path.join(ROOT, 'sim', 'economy-sim-v2')); delete require.cache[k];
    if (on) process.env.T842_FOOD_FLOOR = '1'; else delete process.env.T842_FOOD_FLOOR; const m = require(k); if (_env == null) delete process.env.T842_FOOD_FLOOR; else process.env.T842_FOOD_FLOOR = _env; return m; };
  const M = { off: mod(false), on: mod(true) };
  out.fwOf = {};
  for (const k of ['off', 'on']) {
    const X = M[k], pS = X.computeShadowPrices(S), pF = X.computeShadowPrices(F);
    const P = X._priceParamsV2(S, 'rice'), S0 = X._impactSegs(P), rev = X._impactSellV2(S, 'rice', 10), eps = 1e-6;
    out[k] = { pS: { food: pS.food, rice: pS.rice }, pF, settle: { unit: rev / 10, curveAt: (X._impactF(P, S0, P.sEff + eps) - X._impactF(P, S0, P.sEff)) / eps } };
    for (const r of Object.keys(pF)) { const f = fw(r); if (f > 0) out.fwOf[r] = f; }
  }
  // ④ 20일 — 매일 아침 S 를 같은 굶는 곳간으로 · 굶는 날(싣기 전 곳간 < 하루치) 먹을 것 leg
  const legs = [];
  world.onTradeLeg = (o) => { const v = world.villages[o.vid]; const f = fw(o.res); if (f > 0 && !['food', 'fish', 'meat', 'cooked_food'].includes(o.res)) { const before = V1.totalFoodEquivalent(v) + o.units * f; if (before < v.npcs.length) legs.push({ from: o.from, res: o.res, units: o.units }); } };
  for (let d = 0; d < 20; d++) { starve(S); V2.tickWorldV2(world); }
  out.starveLegs = legs;
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (env) => { const e = Object.assign({}, process.env, env, { T842_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T842_FOOD_FLOOR' in env)) delete e.T842_FOOD_FLOOR;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };
const f3 = (x) => (+x).toFixed(3);
console.log('\n=== T842 — 먹을 것의 값은 식량 값 밑으로 안 내려간다 ===');
const OFFW = sub({}), ONW = sub({ T842_FOOD_FLOOR: '1' }), KNOB = sub({ T842_FOOD_FLOOR: 'true' });
const OFF = Object.assign({ riceF: OFFW.riceF, fwOf: OFFW.fwOf }, OFFW.off), ON = Object.assign({ riceF: OFFW.riceF, fwOf: OFFW.fwOf }, OFFW.on);   // ①②③ = 끔 세계 같은 곳간에 두 값 함수
console.log('\n① 굶는 마을(같은 곳간 · 끔 값 함수 ↔ 켬 값 함수)');
ok(OFF.pS.rice < OFF.riceF * OFF.pS.food, `상황 — 끔: 굶는 마을 쌀 값이 식량 환산(${OFF.riceF}) × 식량 값 밑이다`, `쌀 ${f3(OFF.pS.rice)} < ${f3(OFF.riceF * OFF.pS.food)}(식량 ${f3(OFF.pS.food)})`);
ok(ON.pS.rice >= ON.riceF * ON.pS.food - 1e-9 && Math.abs(ON.pS.food - OFF.pS.food) < 1e-12, '★켬: 쌀 값 ≥ 0.72 × 식량 값 · 식량 값 자신은 끔과 같다', `쌀 ${f3(ON.pS.rice)} ≥ ${f3(ON.riceF * ON.pS.food)}`);
console.log('\n② 배부른 마을');
let same = 0, floored = 0, bad = [];
for (const r of Object.keys(OFF.pF)) {
  const fl = (r === 'food' || !OFF.fwOf[r]) ? 0 : OFF.fwOf[r] * OFF.pF.food;
  const want = Math.max(OFF.pF[r], fl);
  if (Math.abs(ON.pF[r] - want) > 1e-9 * Math.max(1, want)) bad.push(`${r} ${ON.pF[r]} ≠ ${want}`);
  else if (fl > OFF.pF[r]) floored++; else same++;
}
ok(bad.length === 0 && same > 0, `★켬 값표 = max(끔 값, 하한) — 하한이 안 닿는 품목 ${same} 은 끔과 같은 값 · 닿는 품목 ${floored} 은 하한 값`, bad.slice(0, 3).join(' · '));
console.log('\n③ 정산 곡선');
ok(ON.settle.unit >= ON.riceF * ON.pS.food - 1e-9, '★켬: 굶는 마을에 쌀을 팔면 단가 ≥ 하한(곡선 바닥 = 하한)', `${f3(ON.settle.unit)} ≥ ${f3(ON.riceF * ON.pS.food)} · 끔 ${f3(OFF.settle.unit)}`);
ok(Math.abs(ON.settle.curveAt - ON.pS.rice) <= 1e-3 * Math.max(1, ON.pS.rice), '켬: 곡선 값(유효 재고) = 값표 값(같은 하한 · 같은 식량 값)', `${f3(ON.settle.curveAt)} ≈ ${f3(ON.pS.rice)}`);
console.log('\n④ 굶는 날 먹을 것 수출(20일 · 굶는 마을 매일 같은 곳간)');
const so = OFFW.starveLegs.filter((l) => l.from === OFFW.S), sn = ONW.starveLegs.filter((l) => l.from === ONW.S);
ok(so.length > 0, '상황 — 끔: 굶는 마을이 굶는 날 먹을 것을 싣는다', `${so.length} leg · ${so.slice(0, 3).map((l) => `${l.res} ${(+l.units).toFixed(1)}`).join(' · ')}`);
ok(sn.length === 0, '★켬(켬 세계): 굶는 날 먹을 것 수출 0(잉여 셈은 그대로 — 값이 막는다)', `${sn.length} leg · 세계 전체 ${ONW.starveLegs.length}`);
console.log('\n⑤ 손잡이');
ok(OFFW.knob === false && ONW.knob === true, "'1' 만 켬 — 없음 = 끔");
ok(JSON.stringify(KNOB.starveLegs) === JSON.stringify(OFFW.starveLegs) && JSON.stringify(KNOB.off) === JSON.stringify(OFFW.off), "다른 값('true')은 끔 — 세계 · 값표 글자 그대로");
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
