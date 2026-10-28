#!/usr/bin/env node
// @regress
// === scripts/test-food-keep.js — 굶는 마을은 먹을 것을 내다 팔지 않는다(T825 · 손잡이 `T825_FOOD_KEEP` · ★[T935] 켬 기본 · 되돌림 `=0` · ★[T928] 하한 = 하루치) ===
//
// ★왜 [T796 회부 4 · T825] 잉여 셈(`economy-sim-v2.js` 발주 후보)은 식량류 넷(food · fish · meat · cooked_food)만 식량 하한(36일치)으로 본다.
//   생곡(쌀 · 밀 · 보리)은 곳간 식량 환산(`totalFoodEquivalent`)에 드는데 "그 외: 15일치" 줄로 잡혀, 하루치도 안 남은 마을이 쌀을 실어 보냈다.
//   켬: 먹을 것의 잉여 = 곳간 식량 환산이 **하루치**(그 마을 하루 먹는 양 · `SUBSISTENCE_PER_NPC.food × N`)를 넘는 몫까지(그 품목 단위로).
//   ★[T928 · T905 ㄴ] 하한이 36일치면 1 ~ 36일치 마을(농촌 · 어촌)의 교역이 막혀 굶는 마을-날이 띠 밖으로 늘었다 — 하루치로 좁혔다.
//
//  판 셋을 같은 세계에서(하위 실행 · 끔 · 켬 · 'true'):
//   ① 굶는 마을(식량류 0 · 쌀만 · 곳간 식량 환산 < 하루치) — 끔은 먹을 것을 싣는다(상황 assert · 자명 통과 금지) · 켬은 먹을 것 0
//   ② 1 ~ 36일치 마을(식량류 0 · 쌀 · 곳간 약 7일치) — ★켬도 판다(36일 하한으로 되돌아가면 문다) · 실은 뒤 곳간 ≥ 하루치
//      그 마을은 켬 · 끔 같은 수를 싣는다(하루치 위에선 손잡이가 안 닿는다 · F = 배부른 마을은 세계를 채우는 이웃으로만)
//   ③ 세계 전체 — 켬이면 어느 마을도 먹을 것을 싣다가 하루치 밑으로 안 내려간다 · 손잡이 값(★[T935] 없음 = 켬 · '0' 만 끔)
// 실행: node scripts/test-food-keep.js
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');

if (process.env.T825_SUB === '1') {
  const _log = console.log; console.log = () => {}; console.warn = () => {};
  const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
  const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
  const world = V2.createWorldV2({ seed: 7, villageCount: 8, picker: 'rational', infoRange: 5000, raidPer100: 0 });
  for (let d = 0; d < 60; d++) V2.tickWorldV2(world);
  const fw = (r) => { const st = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; st[r] = (st[r] || 0) + 1; return V1.totalFoodEquivalent({ storage: st, npcs: [] }); };
  const legs = [];
  world.onTradeLeg = (o) => { const v = world.villages[o.vid]; legs.push({ day: o.day, from: o.from, res: o.res, units: o.units, f: fw(o.res), tfe: V1.totalFoodEquivalent(v), N: v.npcs.length }); };
  const S = world.villages[0], F = world.villages[1], M = world.villages[2];
  const out = { on: process.env.T825_FOOD_KEEP !== '0', riceF: fw('rice'), S: S.name, F: F.name, M: M.name, days: 0 };
  //   ★교역 바로 앞에 곳간을 맞춘다 — 하루치 문턱은 그날 생산(밀 · 연어 …)이 들어온 뒤의 곳간을 본다(`tickWorldV2` 와 같은 순서 · `tickWorldV2Parts`)
  //   S: 식량류 0 · 먹을 것은 쌀 인구 × 1.3(0.94일치 — 굶는 날) / M: 식량류 0 · 쌀 인구 × 10(7.2일치) / F: 식량류 36일치 + 1할 · 쌀 인구 × 5
  const setStores = () => { for (const v of [S, F, M]) { for (const r of Object.keys(v.storage)) if (fw(r) > 0) v.storage[r] = 0; }
    for (const r of ['hide', 'leather', 'fur', 'hemp', 'herb']) S.storage[r] = 0;   // S 는 먹을 것 밖에 팔 것이 없다(가죽 · 모피 · 삼 · 약초를 비운다 — 끔이 먹을 것을 싣는 상황을 세운다)
    S.storage.rice = S.npcs.length * 1.3; M.storage.rice = M.npcs.length * 10;
    F.storage.food = F.npcs.length * 30 * 1.2 * 1.1; F.storage.rice = F.npcs.length * 5; };
  for (let d = 0; d < 20; d++) {
    const P = V2.tickWorldV2Parts(world);
    P.head(); for (const v of world.villages) P.village(v); setStores(); P.trade(); P.caravans(); P.tail(); out.days++;
  }
  out.legs = legs;
  _log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (env) => { const e = Object.assign({}, process.env, env, { T825_SUB: '1' }); delete e.NODE_OPTIONS; if (!('T825_FOOD_KEEP' in env)) delete e.T825_FOOD_KEEP;
  const t = execFileSync(process.execPath, [__filename], { env: e, stdio: 'pipe', maxBuffer: 64 << 20 }).toString().trim(); return JSON.parse(t.split('\n').filter((l) => l.startsWith('{')).pop()); };
console.log('\n=== T825 — 굶는 마을은 먹을 것을 내다 팔지 않는다(하한 = 하루치) ===');
const OFF = sub({ T825_FOOD_KEEP: '0' }), ON = sub({}), KNOB = sub({ T825_FOOD_KEEP: 'true' });   // ★[T935] 켬 기본
const edible = (L, who) => L.legs.filter((l) => l.from === who && l.f > 0);
const DAY = (l) => l.N * 1;   // 하루치(`SUBSISTENCE_PER_NPC.food` = 1 · 그 마을 인구)
console.log('\n① 굶는 마을(곳간 < 하루치)');
const so = edible(OFF, OFF.S), sn = edible(ON, ON.S);
ok(so.length > 0 && so.every((l) => l.tfe + l.units * l.f < DAY(l)), `상황 — 끔에서 굶는 마을(싣기 전 곳간 < 하루치)이 먹을 것을 싣는다(쌀 1단위 = 식량 ${OFF.riceF})`, `${so.length} leg · ${so.slice(0, 3).map((l) => `${l.res} ${l.units.toFixed(1)}`).join(' · ')}`);
ok(sn.length === 0, '★켬 — 굶는 마을은 먹을 것을 하나도 안 싣는다', `${sn.length} leg`);
console.log('\n② 1 ~ 36일치 마을 · 배부른 마을');
const mn = edible(ON, ON.M);
ok(mn.length > 0, '★켬 — 곳간 7일치 마을(36일치 밑)도 먹을 것을 판다(하한이 36일치로 돌아가면 0 이 된다)', `${mn.length} leg · ${mn.slice(0, 3).map((l) => `${l.res} ${l.units.toFixed(1)} → ${(l.tfe / l.N).toFixed(1)}일치`).join(' · ')}`);
ok(mn.every((l) => l.tfe >= DAY(l) - 1e-6), '★켬 — 실은 뒤에도 곳간 식량 환산 ≥ 하루치(넘는 몫까지만 싣는다)', mn.slice(0, 3).map((l) => `${l.tfe.toFixed(0)} ≥ ${DAY(l)}`).join(' · '));
ok(mn.some((l) => l.tfe < l.N * 36), '상황 — 그 마을은 실은 뒤 36일치 밑이다(36일 하한이었다면 못 실었다)', mn.slice(0, 3).map((l) => `${(l.tfe / l.N).toFixed(1)}일치`).join(' · '));
const mo = edible(OFF, OFF.M);
ok(mo.length > 0 && mn.length === mo.length, '하루치 넘는 마을(7일치)은 켬 · 끔 같은 수를 싣는다(손잡이가 교역을 통째로 막지 않는다)', `켬 ${mn.length} · 끔 ${mo.length} leg`);
console.log('\n③ 세계 전체 · 손잡이');
{ const ed = (L) => L.legs.filter((l) => l.f > 0 && !['food', 'fish', 'meat', 'cooked_food'].includes(l.res));
  const offLow = ed(OFF).filter((l) => l.tfe < DAY(l) - 1e-6), onLow = ed(ON).filter((l) => l.tfe < DAY(l) - 1e-6);
  ok(offLow.length > 0, '상황 — 끔에선 세계 전체에 하루치 밑으로 내려가며 실은 먹을 것 leg 가 있다', `${offLow.length} · ${[...new Set(offLow.map((l) => l.res))].join(' ')}`);
  ok(onLow.length === 0 && ed(ON).length > 0, '★켬 — 세계 전체 먹을 것 leg 가 하나도 하루치 밑으로 안 내려간다(그리고 먹을 것 leg 는 남아 있다)', `${onLow.length} / ${ed(ON).length}`); }
ok(OFF.on === false && ON.on === true, "★[T935] 없음 = 켬 — '0' 만 끔");
ok(JSON.stringify(KNOB.legs) === JSON.stringify(ON.legs), "다른 값('true')은 켬 — leg 줄 글자 그대로(되돌림은 '0' 하나)");
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
