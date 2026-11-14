'use strict';
// === scripts/t1317-ore0-observe.js — T1317 0원 원석 관측(계측기 · 러너 밖 · 제품 무변) ======================================
//   랩 자(`t17-metrics.js`)에 `NODE_OPTIONS=--require` 로 싣는다. econ 하루(`tickWorldV2`) 끝에서 그 마을 값표(`computeShadowPrices`)가
//   원석 칸을 0 으로 매기는 곳(원석 상한 · 시대를 모르는 금속 — T1301 관측 153칸)마다 그날의 세 가지를 센다:
//     ⓐ 곳간에 쌓인 그 원석(재고) · ⓑ 그날 그 마을이 캔 그 원석(`dailyProductionBuf`) · ⓒ 그날 교역 장부(`tradeLog` 새 줄)에 그 원석이 실린 줄 · 양.
//   광부 수(`counts.miner`)는 0원 원석이 있는 마을 · 없는 마을로 갈라 합한다. 끝에 `$T1317_OUT`(기본 /tmp/t1317-ore0.json).
//   ★T1293(광부 문 · "녹임 목표를 넘을 몫 값 0")은 서버 몸 층(`server/villages.js _t1266Keep`)이라 랩 자에선 안 돈다 — 이 관측은 랩의 값표 · 교역 · econ 광부 몫만 본다.
if (require('worker_threads').isMainThread) {
  const fs = require('fs');
  const V2 = require('../sim/economy-sim-v2');
  const OreGoods = (() => { try { return require('../server/ore-goods'); } catch (e) { return null; } })();
  const isOre = (r) => r === 'ore' || !!(OreGoods && OreGoods.isOre && OreGoods.isOre(r));
  const EVERY = parseInt(process.env.T1317_EVERY || '1', 10) || 1;
  const OUT = process.env.T1317_OUT || '/tmp/t1317-ore0.json';
  const days = [];
  const SEEN = new WeakSet();
  const tk = V2.tickWorldV2;
  V2.tickWorldV2 = function (w) {
    const r = tk.apply(this, arguments);
    try {
      const L = w.tradeLog || [];
      const newRows = []; for (let i = L.length - 1; i >= 0 && !SEEN.has(L[i]); i--) { SEEN.add(L[i]); newRows.push(L[i]); }   // 장부는 5,000 줄에서 앞을 자른다 — 줄 정체로 새 줄을 가린다
      if ((w.day | 0) % EVERY === 0) {
        let cells = 0, stock = 0, prod = 0, minersZ = 0, minersN = 0, vilsZ = 0;
        const zeroBy = new Map();   // village → Set(ore)
        const items = {};
        for (const v of w.villages) {
          if (!v || !v.npcs || !v.npcs.length) continue;
          const P = V2.computeShadowPrices(v), z = new Set();
          for (const k in P) if (isOre(k) && P[k] === 0) z.add(k);
          const m = (v.counts && v.counts.miner) || 0;
          if (z.size) { vilsZ++; minersZ += m; zeroBy.set(v, z); } else minersN += m;
          for (const k of z) {
            cells++;
            const s = +((v.storage || {})[k] || 0), p = +((v.dailyProductionBuf || {})[k] || 0);
            stock += s; prod += p;
            const it = items[k] || (items[k] = { cells: 0, stock: 0, prod: 0, tradeRows: 0, tradeAmt: 0 });
            it.cells++; it.stock += s; it.prod += p;
          }
        }
        let tradeRows = 0, tradeAmt = 0;
        const zeroAny = new Set(); for (const z of zeroBy.values()) for (const k of z) zeroAny.add(k);
        for (const row of newRows) {
          const lines = [];
          if (row && row.sent) lines.push(row.sent);
          if (row && Array.isArray(row.basket)) lines.push(...row.basket);
          if (row && row.bought) lines.push(...(Array.isArray(row.bought) ? row.bought : [row.bought]));
          let hit = false;
          for (const x of lines) if (x && zeroAny.has(x.res)) { hit = true; tradeAmt += +x.amt || 0; const it = items[x.res]; if (it) { it.tradeRows++; it.tradeAmt += +x.amt || 0; } }
          if (hit) tradeRows++;
        }
        if ((w.day | 0) === 100) { const v = w.villages.find((u) => u && u.counts && u.counts.miner > 0); if (v) console.error('[t1317-ore0] 광부 마을 하루 산출 원석 칸', v.name, JSON.stringify(Object.fromEntries(Object.entries(v.dailyProductionBuf || {}).filter(([k]) => isOre(k) || /ore|metal|copper|tin|iron/.test(k)))), '곳간', JSON.stringify(Object.fromEntries(Object.entries(v.storage || {}).filter(([k]) => isOre(k)).map(([k, x]) => [k, +(+x).toFixed(2)])))); }
        days.push({ day: w.day | 0, cells, vilsZ, stock: +stock.toFixed(2), prod: +prod.toFixed(3), minersZ, minersN, tradeRowsDay: newRows.length, tradeRows, tradeAmt: +tradeAmt.toFixed(2), items });
      }
    } catch (e) { console.error('[t1317-ore0]', e.message); }
    return r;
  };
  process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(days)); } catch (e) {} });
}
