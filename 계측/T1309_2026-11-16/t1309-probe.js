'use strict';
// === 계측/T1309_2026-11-16/t1309-probe.js — 갈무리 값 줄 갈라 재기(메모리 되돌림 · 제품 파일 수정 0) ===
//   env T1309_PX=1 → 랩 식량 값의 재고 칸(`economy-sim-v2.js _t859Stock` — 곳간 식량 환산)에서 **보존식 몫을 뺀다**
//     (보존식 곳간 × 그 칸 환산 `preservedFactor` · 나머지 품목은 그대로) — 보존식이 값을 낮추는 줄이 재고 칸인지 가르는 자
const Module = require('module'), compile = Module.prototype._compile;
const PX = process.env.T1309_PX === '1';
const SITES = [];
if (PX) SITES.push(['/sim/economy-sim-v2.js',
  "function _t859Stock(v, r) { return ((T859_FOOD_HUNGER || v1.T1243_FARM_ON) && r === 'food') ? (+v1.totalFoodEquivalent(v) || 0) : (v.storage[r] || 0); }",
  "function _t859Stock(v, r) { if ((T859_FOOD_HUNGER || v1.T1243_FARM_ON) && r === 'food') { let p = 0; for (const k of v1.PRESERVED_FOODS) p += (v.storage[k] || 0) * v1.preservedFactor(k); return Math.max(0, (+v1.totalFoodEquivalent(v) || 0) - p); } return (v.storage[r] || 0); }",
  'px']);
//   env T1309_PNC=1 → 갈무리가 뗀 원물을 흐름 소비(`_cons` — 값의 흐름 수요 `_consEMA × 30`)로 적지 않는다(곳간에서 떼는 것은 그대로) — 갈무리가 값 수요 칸으로 닿는 줄을 가르는 자
if (process.env.T1309_PNC === '1') SITES.push(['/sim/economy-sim.js', '      v.storage[_fr] -= _take; _cons(v, _fr, _take);   // ★flow-EMA — 보존도 수요다', '      v.storage[_fr] -= _take;', 'pnc']);
const hit = {};
Module.prototype._compile = function (src, file) {
  const f = file.replace(/\\/g, '/');
  for (const [tail, from, to, key] of SITES) if (f.endsWith(tail)) {
    const parts = src.split(from); if (parts.length !== 2) throw Error(`T1309 ${key}: 글자 ${parts.length - 1} 곳(기대 1)`);
    src = parts.join(to); hit[key] = (hit[key] || 0) + 1;
  }
  return compile.call(this, src, file);
};
process.on('exit', () => { if (process.env.T1309_PROBE_OUT) try { require('fs').writeFileSync(process.env.T1309_PROBE_OUT, JSON.stringify(hit)); } catch (e) {} });
