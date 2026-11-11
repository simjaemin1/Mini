'use strict';
// === 계측/T1265_2026-11-11/t1265-doors.js — T1260 식량 문 아홉을 하나씩 켜거나 끄는 메모리 패치(제품 파일 수정 0 · T1255 §0 꼴) ===
//   쓰는 법: node -r <이 파일> … — env `T1265_DOOR=<번호>`(1 ~ 9) · `T1265_MODE=on|off`
//     on  = 손잡이 `T1260_FOOD_READS` 끔 판에서 그 문 하나만 합계(나머지 여덟 = `food` 칸 · 종전)
//     off = 손잡이 켬 판(`T1260_FOOD_READS=1`)에서 그 문 하나만 종전 `food` 칸(나머지 여덟 = 합계)
//   문 번호(보고/T1260 §1 표 순서): 1 요리 8일 문 · 2 개간 120일 문 · 3 곳간 증설 목표 · 4 요리 재료 한 단 ·
//     5 `npcRegenMul` · 6 요리 후보 `foodRich` · 7 v2 의복/다양성 목표(첫째) · 8 v2 다양성 목표(둘째) · 9 전쟁 식량 추정
//   닿은 자리 수를 exit 에 `T1265_AUDIT` 파일로 적는다(닿지 않으면 판이 헛것이다 — 표 자가 본다).
const fs = require('fs');
const Module = require('module'), compile = Module.prototype._compile;
const DOOR = +process.env.T1265_DOOR | 0, MODE = process.env.T1265_MODE;
const ON = MODE === 'on';
if (!(DOOR >= 1 && DOOR <= 9) || !(MODE === 'on' || MODE === 'off')) throw Error('T1265_DOOR 1~9 · T1265_MODE on|off');
// 문마다 [파일 꼬리, 바꿀 글자, 켬일 때 글자, 끔일 때 글자, 몇째 것(0 = 하나뿐)]
const SITES = {
  1: ['/sim/economy-sim.js', 't1260FoodOf(v) < N * 8', 'totalFoodEquivalent(v) < N * 8', '(v.storage.food || 0) < N * 8'],
  2: ['/server/villages.js', '_lifeEcon().t1260FoodOf(e) > e.npcs.length * 120', '_lifeEcon().totalFoodEquivalent(e) > e.npcs.length * 120', '((e.storage && e.storage.food) || 0) > e.npcs.length * 120'],
  3: ['/server/villages.js', 'const food = _lifeEcon().t1260FoodOf(vil.econ);', 'const food = _lifeEcon().totalFoodEquivalent(vil.econ);', 'const food = (vil.econ.storage && vil.econ.storage.food) || 0;'],
  4: ['/sim/economy-sim.js', '(T1260_FOOD_READS ? _t1260CookStaple(v) : null)', '_t1260CookStaple(v)', 'null'],
  5: ['/sim/economy-sim.js', 'const _food = (T1243_FARM_ON || T1260_FOOD_READS) ? totalFoodEquivalent(econ)', 'const _food = (T1243_FARM_ON || true) ? totalFoodEquivalent(econ)', 'const _food = (T1243_FARM_ON || false) ? totalFoodEquivalent(econ)'],
  6: ['/sim/economy-sim.js', 'const foodRich = ((T1243_FARM_ON || T1260_FOOD_READS) ?', 'const foodRich = ((T1243_FARM_ON || true) ?', 'const foodRich = ((T1243_FARM_ON || false) ?'],
  7: ['/sim/economy-sim-v2.js', '(v1.T1243_FARM_ON || v1.T1260_FOOD_READS)', '(v1.T1243_FARM_ON || true)', '(v1.T1243_FARM_ON || false)', 1],
  8: ['/sim/economy-sim-v2.js', '(v1.T1243_FARM_ON || v1.T1260_FOOD_READS)', '(v1.T1243_FARM_ON || true)', '(v1.T1243_FARM_ON || false)', 2],
  9: ['/sim/war-core.js', 'const _feD = (e) => (_T1260 ? _feOf(e) : warFE(e));', 'const _feD = (e) => _feOf(e);', 'const _feD = (e) => warFE(e);'],
};
const [tail, from, toOn, toOff, nth] = SITES[DOOR];
let hit = 0;
Module.prototype._compile = function (src, file) {
  if (file.replace(/\\/g, '/').endsWith(tail)) {
    const parts = src.split(from);
    const want = nth ? 3 : 2;   // 둘 있는 자리(7 · 8)는 정확히 둘 · 나머지는 정확히 하나
    if (parts.length !== want) throw Error(`T1265 문 ${DOOR}: 글자 ${parts.length - 1} 곳(기대 ${want - 1})`);
    const k = nth ? nth : 1;
    src = parts.slice(0, k).join(from) + (ON ? toOn : toOff) + parts.slice(k).join(from);
    hit++;
  }
  return compile.call(this, src, file);
};
process.on('exit', () => { if (process.env.T1265_AUDIT) try { fs.writeFileSync(process.env.T1265_AUDIT, JSON.stringify({ door: DOOR, mode: MODE, hit, pid: process.pid })); } catch (e) {} });
