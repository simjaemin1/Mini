'use strict';
// === scripts/t1301-floor-observe.js — T1301 값 바닥 관측(계측기 · 러너 밖 · 제품 무변) ===========================
//   랩 자(`t17-metrics.js`)에 `NODE_OPTIONS=--require` 로 싣는다. econ 하루(`tickWorldV2`) 끝에서 T1301_EVERY 날(기본 50)마다
//   마을마다 값표(`computeShadowPrices` — 서버 거래소 · 결정층이 읽는 그 함수) 전 칸을 그 칸의 바닥과 견준다.
//   바닥 = 같은 칸 곡선(`_targetV2`)을 같은 값 함수(`_priceFromV2`)에 재고 ∞ 로 넣은 값(= 기준값 × 바닥 배율 · 상수를 옮겨 적지 않는다).
//   바닥 아래 칸은 까닭을 가른다: 원석 상한(`_oreCapV2` · 원석 칸) · 그 밖. 끝에 `$T1301_OUT`(기본 /tmp/t1301-floor.json).
//   ★값 하나 0.0000127 의 정체도 같이 적는다 — 넘침 품목(바닥에 붙은 칸) 가운데 가장 싼 칸 · 그 칸의 기준값.
if (require('worker_threads').isMainThread) {
  const fs = require('fs');
  const V2 = require('../sim/economy-sim-v2');
  const EVERY = parseInt(process.env.T1301_EVERY || '50', 10) || 50;
  const OUT = process.env.T1301_OUT || '/tmp/t1301-floor.json';
  const OreGoods = (() => { try { return require('../server/ore-goods'); } catch (e) { return null; } })();
  const isOre = (r) => r === 'ore' || !!(OreGoods && OreGoods.isOre && OreGoods.isOre(r));
  const rows = [];
  const tk = V2.tickWorldV2;
  V2.tickWorldV2 = function (w) {
    const r = tk.apply(this, arguments);
    try {
      if (w && (w.day | 0) % EVERY === 0) {
        let cells = 0, atFloor = 0; const below = [], low = [];
        for (const v of w.villages) {
          if (!v || !v.npcs || !v.npcs.length) continue;
          const P = V2.computeShadowPrices(v), ctx = V2._targetCtxV2(v);
          for (const k in P) {
            const p = P[k]; if (!(typeof p === 'number')) continue;
            const T = V2._targetV2(v, k, ctx); if (!T || !(T.base > 0)) continue;
            const floor = V2._priceFromV2(Object.assign({}, T, { sEff: Infinity }));
            cells++;
            if (Math.abs(p - floor) <= floor * 1e-9) atFloor++;
            if (p < floor * (1 - 1e-9)) below.push([v.name, k, p, floor, isOre(k) ? 'ore-cap' : 'other']);
            low.push([p, k, v.name, T.base, floor]);
          }
        }
        low.sort((a, b) => a[0] - b[0]);
        rows.push({ day: w.day | 0, cells, atFloor, below: below.length, belowOre: below.filter((x) => x[4] === 'ore-cap').length,
          belowOther: below.filter((x) => x[4] !== 'ore-cap'), belowSample: below.slice(0, 8), cheapest: low.slice(0, 5),
          belowItems: [...new Set(below.map((x) => x[1]))], belowVils: [...new Set(below.map((x) => x[0]))], belowZero: below.filter((x) => x[2] === 0).length,
          cheapestNonOre: low.filter((x) => !isOre(x[1])).slice(0, 5) });
      }
    } catch (e) { console.error('[t1301-floor]', e.message); }
    return r;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rows)); } catch (e) {} });
}
