#!/usr/bin/env node
// @regress
// === scripts/test-food-floor.js — T842 하한(`T842_FOOD_FLOOR`)을 걷은 뒤 — 끔 갈래만 남았다(★[T879 · PM 10-23] 걷기) ===
//
// ★왜 [T842 → T859 → T879] T842(먹을 것 값 ≥ 식량 환산 × 그 마을 food 값)는 T842 · T859 두 판 다 T837 갈림 띠 밖으로 나빠졌다
//   (빈 마을 · 인구 · 굶는 마을-날 · 굶는 날 수출). PM 10-23 결정 = 걷기. 손잡이 줄 · 도우미 셋 · 값 자리 여섯을 지우고 끔 갈래만 남겼다.
//   이 하네스는 그 걷기가 "끔 그대로"인지를 문다(느슨하게 만들지 않는다 — 걷은 손잡이를 다시 심으면 ①③ 이 문다).
//
//  econ 랩(포트 0 · 하위 실행):
//   ① 3사본(econ 소스 · 번들 · 랩 둘)에 `T842_FOOD_FLOOR` 를 읽는 줄 · `_t842` 도우미 · 곡선 바닥 칸(`minAdj`)이 없다
//   ② 상황 — 굶는 마을(식량류 0 · 쌀만 · 흐름 적자)의 쌀 값은 0.72 × 그 마을 food 값 **밑**이다(하한이 없다 · 자명 통과 금지)
//   ③ `T842_FOOD_FLOOR=1` 세계 = 없음 세계 — 값표 · 정산 곡선 · 20일 leg 글자 그대로
// 실행: node scripts/test-food-floor.js
'use strict';
const fs = require('fs');
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
  const pS = V2.computeShadowPrices(S), pF = V2.computeShadowPrices(F);
  const P = V2._priceParamsV2(S, 'rice'), S0 = V2._impactSegs(P);
  const out = { riceF: fw('rice'), pS: { food: pS.food, rice: pS.rice }, pF, P, S0, sell: V2._impactSellV2(S, 'rice', 10) };
  const legs = [];
  world.onTradeLeg = (o) => { legs.push([o.day, o.vid, o.res, o.units]); };
  for (let d = 0; d < 20; d++) { starve(S); V2.tickWorldV2(world); }
  out.legs = legs;
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (env) => { const e = Object.assign({}, process.env, env, { T842_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T842_FOOD_FLOOR' in env)) delete e.T842_FOOD_FLOOR;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };
const f3 = (x) => (+x).toFixed(3);
console.log('\n=== T842 걷은 뒤 — 끔 갈래만 남았다 ===');
console.log('\n① 3사본');
const FILES = ['sim/economy-sim-v2.js', 'sim/economy-engine.browser.js', 'lab/마을실험실.html', 'lab/전쟁실험실.html'];
for (const f of FILES) {
  const code = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');   // 주석 줄은 뺀다(걷은 내력은 주석에 남는다)
  const hits = ['process.env.T842_FOOD_FLOOR', 'T842_FOOD_FLOOR', '_t842', 'minAdj'].filter((k) => code.includes(k));
  ok(hits.length === 0, `${f} — T842 손잡이 · 도우미 · 곡선 바닥 칸 0`, hits.join(' · '));
}
const OFF = sub({}), K = sub({ T842_FOOD_FLOOR: '1' });
console.log('\n② 굶는 마을 쌀 값');
ok(OFF.pS.rice < OFF.riceF * OFF.pS.food, `상황 — 굶는 마을 쌀 값이 식량 환산(${OFF.riceF}) × 식량 값 밑이다(하한 없음)`, `쌀 ${f3(OFF.pS.rice)} < ${f3(OFF.riceF * OFF.pS.food)}(식량 ${f3(OFF.pS.food)})`);
ok(OFF.S0.pHi != null && Math.abs(OFF.S0.pHi - OFF.P.base * 0.01) < 1e-12, '정산 곡선 바닥 = base × PRICE_ADJ_MIN(0.01) — 끔 갈래', `${OFF.S0.pHi} = ${OFF.P.base} × 0.01`);
console.log('\n③ 걷은 손잡이');
ok(OFF.legs.length > 0, '상황 — 20일 leg 가 있다', `${OFF.legs.length} leg`);
ok(JSON.stringify(K) === JSON.stringify(OFF), "`T842_FOOD_FLOOR=1` 세계 = 없음 세계 — 값표 · 정산 곡선 · 20일 leg 글자 그대로");
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
