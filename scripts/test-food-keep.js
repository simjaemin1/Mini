#!/usr/bin/env node
// @regress
// === scripts/test-food-keep.js — 곳간이 바닥인 마을은 먹을 것을 내다 팔지 않는다(T825 · 손잡이 `T825_FOOD_KEEP` · ★[T879] 켬 기본 · 되돌림 `=0`) ===
//
// ★왜 [T796 회부 4 · T825] 잉여 셈(`economy-sim-v2.js` 발주 후보)은 식량류 넷(food · fish · meat · cooked_food)만 식량 하한(36일치)으로 본다.
//   생곡(쌀 · 밀 · 보리)은 곳간 식량 환산(`totalFoodEquivalent`)에 드는데 "그 외: 15일치" 줄로 잡혀, 하루치도 안 남은 마을이 쌀을 실어 보냈다.
//   켬: 먹을 것의 잉여 = 곳간 식량 환산이 같은 하한을 넘는 몫까지(그 품목 단위로).
//
//  판 셋을 같은 세계에서(하위 실행 · 끔 · 켬):
//   ① 굶는 마을(식량류 0 · 쌀만 · 곳간 식량 환산 < 하한) — 끔은 쌀을 싣는다(상황 assert · 자명 통과 금지) · 켬은 먹을 것 0
//   ② 배부른 마을(식량류 하한 넘게 + 쌀) — 켬도 쌀을 싣되 실은 뒤 곳간 식량 환산 ≥ 하한(넘는 몫까지만)
//   ③ 세계 전체 — 켬이면 어느 마을도 먹을 것을 싣다가 하한 밑으로 안 내려간다 · 손잡이 값(★[T879] 없음 = 켬 · '0' 만 끔)
// 실행: node scripts/test-food-keep.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T825_SUB === '1') {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const FOODS = ['food', 'fish', 'meat', 'cooked_food'];
  const world = V2.createWorldV2({ seed: 7, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  for (let d = 0; d < 60; d++) V2.tickWorldV2(world);
  const fw = (r) => { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; return V1.totalFoodEquivalent({ storage: st, npcs: [] }); };
  const legs = [];
  world.onTradeLeg = (o) => { const v = world.villages[o.vid]; legs.push({ day: o.day, from: o.from, res: o.res, units: o.units, f: fw(o.res), tfe: V1.totalFoodEquivalent(v), N: v.npcs.length }); };
  const S = world.villages[0], F = world.villages[1];
  const out = { on: V2 ? process.env.T825_FOOD_KEEP !== '0' : null, riceF: fw('rice'), S: S.name, F: F.name, days: 0 };
  for (let d = 0; d < 20; d++) {
    // 매일 아침 같은 곳간으로 — S: 식량류 0 · 쌀 인구 × 5(하한 36일치의 1할) / F: 식량류 하한 + 1할 · 쌀 인구 × 5
    for (const v of [S, F]) { for (const r of Object.keys(v.storage)) if (fw(r) > 0) v.storage[r] = 0; }
    S.storage.rice = S.npcs.length * 5;
    F.storage.food = F.npcs.length * 30 * 1.2 * 1.1; F.storage.rice = F.npcs.length * 5;
    V2.tickWorldV2(world); out.days++;
  }
  out.legs = legs;
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (env) => { const e = Object.assign({}, process.env, env, { T825_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T825_FOOD_KEEP' in env)) delete e.T825_FOOD_KEEP;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };
console.log('\n=== T825 — 곳간이 바닥인 마을은 먹을 것을 내다 팔지 않는다 ===');
const OFF = sub({ T825_FOOD_KEEP: '0' }), ON = sub({}), KNOB = sub({ T825_FOOD_KEEP: 'true' });   // ★[T879] 켬 기본
const edible = (L, who) => L.legs.filter((l) => l.from === who && l.f > 0);
console.log('\n① 굶는 마을');
const so = edible(OFF, OFF.S), sn = edible(ON, ON.S);
ok(so.length > 0 && so.every((l) => l.tfe + l.units * l.f < l.N * 36), `상황 — 끔에서 굶는 마을(곳간 식량 환산 < 하한)이 먹을 것을 싣는다(쌀 1단위 = 식량 ${OFF.riceF})`, `${so.length} leg · ${so.slice(0, 3).map((l) => `${l.res} ${l.units.toFixed(1)}`).join(' · ')}`);
ok(sn.length === 0, '★켬 — 굶는 마을은 먹을 것을 하나도 안 싣는다', `${sn.length} leg`);
console.log('\n② 배부른 마을');
const fo = edible(OFF, OFF.F).filter((l) => l.res === 'rice'), fn = edible(ON, ON.F).filter((l) => l.res === 'rice');
ok(fn.length > 0, '상황 — 켬에서도 하한을 넘는 마을은 쌀을 싣는다(손잡이가 교역을 통째로 막지 않는다)', `${fn.length} leg · 끔 ${fo.length}`);
ok(fn.every((l) => l.tfe >= l.N * 36 - 1e-6), '★켬 — 실은 뒤에도 곳간 식량 환산 ≥ 하한(넘는 몫까지만 싣는다)', fn.slice(0, 3).map((l) => `${l.tfe.toFixed(0)} ≥ ${l.N * 36}`).join(' · '));
console.log('  (정보) 끔의 배부른 마을 쌀 leg — ' + fo.length + ' · ' + fo.slice(0, 3).map((l) => `${l.units.toFixed(1)} → ${l.tfe.toFixed(0)}/${l.N * 36}`).join(' · '));
console.log('\n③ 손잡이');
ok(OFF.on === false && ON.on === true, "★[T879] 없음 = 켬 — '0' 만 끔");
ok(JSON.stringify(KNOB.legs) === JSON.stringify(ON.legs), "다른 값('true')은 켬 — leg 줄 글자 그대로(되돌림은 '0' 하나)");
{ const fl = (l) => l.N * 36, ed = (L) => L.legs.filter((l) => l.f > 0 && !['food', 'fish', 'meat', 'cooked_food'].includes(l.res));
  const offLow = ed(OFF).filter((l) => l.tfe < fl(l) - 1e-6), onLow = ed(ON).filter((l) => l.tfe < fl(l) - 1e-6);
  ok(offLow.length > 0, `상황 — 끔에선 세계 전체에 하한 밑으로 내려가며 실은 먹을 것 leg 가 있다(쌀 · 연어 · 새우 …)`, `${offLow.length} · ${[...new Set(offLow.map((l) => l.res))].join(' ')}`);
  ok(onLow.length === 0 && ed(ON).length > 0, '★켬 — 세계 전체 먹을 것 leg 가 하나도 하한 밑으로 안 내려간다(그리고 먹을 것 leg 는 남아 있다)', `${onLow.length} / ${ed(ON).length}`); }
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
