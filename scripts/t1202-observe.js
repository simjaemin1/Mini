'use strict';
// T1202 관측 preload(읽기만 · 세계 0): 생산 셋(어부 · 나무꾼 · 채집꾼 · 광부)의 마을 · 날 표 — 몸/일괄이 들여온 양 · 공식 몫(D) · 먹은 양 · 땔감.
//   쓰는 법: NODE_OPTIONS="--require scripts/t1202-observe.js" node scripts/server-baseline-check.js --make … (아이 존에서만 · `T577_SEED`)
//   판 끝에 `$T577_OUT.t1202.json` — 머리 `cols` · 마을마다 날 줄(`rows[이름]`) · 판 통계.
if (require('worker_threads').isMainThread && process.env.T577_SEED) {
  const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
  const KN = ['T312_FISH_ACT', 'T325_WOOD_ACT', 'T347_FORAGE_ACT', 'T1188_ORE_SPLIT', 'T1202_BATCH', 'T1217_MARGIN'];
  const cols = ['day', 'pop', 'dead', 'bodies', 'fisher', 'lumber', 'forager', 'miner', 'bFisher', 'bLumber', 'bForager', 'bMiner',
    'fishIn', 'woodIn', 'forageIn', 'oreIn', 'fishD', 'woodD', 'forageD', 'oreD', 'foodEaten', 'fuelCov', 'foodStock', 'woodStock',
    'fishBody', 'woodBody', 'forageBody', 'fishBatch', 'woodBatch', 'forageBatch',
    'hunter', 'bHunter', 'meatIn', 'meatD',   // ★[T1202 → T1195] 사냥꾼(econ · 몸) · 그날 든 고기(econ 단위) · 사냥 그날 몫(T1195 켬일 때만 · 끔 0)
    'rest', 'happy', 'leis', 'fishPx', 'fishStock', 'stock01', 'foodPx'];   // ★[T1217] 어부가 쉰 사람-날(`_t1217Rest`) · 행복 h · 여가 몫 · 생선 값 · 곳간 생선 · 그 마을 반경 안 판 버킷의 재고 비율 · 식량 값(그 마을 그 시간 표)
  const st = { seed: +process.env.T577_SEED, knobs: Object.fromEntries(KN.map((k) => [k, process.env[k] === undefined ? 'unset' : process.env[k]])), dayMs: process.env.VILLAGE_DAY_MS, cols, rows: {}, errors: [] };
  const S = () => { const m = require.cache[path.join(root, 'server/villages.js')]; return m && m.exports.__p3Bind ? m.exports.__p3Bind({}).state : null; };
  const E = () => require.cache[path.join(root, 'sim/economy-sim.js')]?.exports || null;
  const prev = new Map();
  const r4 = (x) => +((+x || 0).toFixed(4));
  let last = -1;
  const Events = require('../server/events'), create = Events.createLedger;
  Events.createLedger = function (...a) {
    const L = create.apply(this, a), scan = L.scanDay;
    L.scanDay = function (w, ...b) {
      try {
        const d = (w.day | 0);
        if (d !== last) {
          last = d;
          const s = S(), ec = E(), sv = new Map(); if (s && s.villages) for (const v of s.villages) if (v.econ) sv.set(v.econ, v);
          const pl = s && s.deps && s.deps.players;
          for (const v of (w.villages || [])) {
            const x = sv.get(v), c = v.counts || {}, dp = v.dailyProductionBuf || {};
            const bj = { fisher: 0, lumberjack: 0, forager: 0, miner: 0, hunter: 0 }; let nb = 0;
            if (x && pl) for (const pid of (x.npcPids || [])) { const p = pl.get(pid); if (!p) continue; nb++; if (p.simJob in bj) bj[p.simJob]++; }
            const acts = (ec && ec.forageActItemsOf) ? (ec.forageActItemsOf(v) || []) : [];
            let fIn = 0; for (const k of acts) fIn += dp[k] || 0;
            let oIn = 0; if (ec && ec.OreGoods && ec.T1188_ORE_SPLIT) { for (const k of ec.OreGoods.ids) oIn += dp[k] || 0; } else oIn = dp.ore || 0;
            const eaten = v._foodEaten ? Object.values(v._foodEaten).reduce((n, q) => n + (q > 0 ? q : 0), 0) : 0;
            const woodD = (ec && ec.T1135_FUEL_EQ) ? (v._t1135Need || 0) : (v._woodOutLast || 0);
            const fD = (v._forageOutLast || 0) * (typeof v._t347MixShare === 'number' ? v._t347MixShare : 0);
            const p0 = prev.get(v.name) || {}, cur = { fish: (x && x._t312Deliv) || 0, wood: (x && x._t325Deliv) || 0, forage: (x && x._t347Gran) || 0,
              fb: (x && x._t1202Batch && x._t1202Batch.fish) || 0, wb: (x && x._t1202Batch && x._t1202Batch.wood) || 0, gb: (x && x._t1202Batch && x._t1202Batch.forage) || 0 };
            prev.set(v.name, cur);
            //   ★[T1217] 그 마을 반경(노동권 150셀) 안 **판 버킷**(마을 어부 장부 · 만땅 아닌 것)의 재고 비율 — 물셀 가중 평균 · 판 버킷이 없으면 1(만땅)
            let s01 = 1;
            const FM = require.cache[path.join(root, 'server/fishing.js')]?.exports;
            if (FM && FM.fishBuckets && FM.fishBuckets.size && x) { let kS = 0, kK = 0; const B = FM.FISH_BK || 24;
              for (const [key, b] of FM.fishBuckets) { const i = key.indexOf('_'), bx = +key.slice(0, i), by = +key.slice(i + 1); if (Math.hypot(bx * B + B / 2 - x.ccx, by * B + B / 2 - x.ccy) > 150 || !(b.K > 0)) continue; kS += b.s * b.K; kK += b.K; }
              if (kK > 0) s01 = kS / kK; }
            const ls = v.lastStats || {};
            const row = [d, (v.npcs || []).length, v._deadTot || 0, nb, c.fisher || 0, c.lumberjack || 0, c.forager || 0, c.miner || 0, bj.fisher, bj.lumberjack, bj.forager, bj.miner,
              r4(dp.fish), r4(dp.wood), r4(fIn), r4(oIn), r4(v._fishOutLast), r4(woodD), r4(fD), r4(v._oreOutLast), r4(eaten), r4(v._fuelCov), r4((v.storage && v.storage.food) || 0), r4((v.storage && v.storage.wood) || 0),
              r4(cur.fish - (p0.fish || 0)), r4(cur.wood - (p0.wood || 0)), r4(cur.forage - (p0.forage || 0)), r4(cur.fb - (p0.fb || 0)), r4(cur.wb - (p0.wb || 0)), r4(cur.gb - (p0.gb || 0)),
              c.hunter || 0, bj.hunter, r4(dp.meat), r4(v._huntOutLast),
              r4(v._t1217Rest), r4(ls.happiness), r4(ls.leisure), r4(v._t1217Px && v._t1217Px.prices ? v._t1217Px.prices.fish : (v._priceCache ? v._priceCache.fish : 0)), r4((v.storage && v.storage.fish) || 0), r4(s01),
              r4(v._t1217Px && v._t1217Px.prices ? v._t1217Px.prices.food : (v._priceCache ? v._priceCache.food : 0))];
            (st.rows[v.name] || (st.rows[v.name] = [])).push(row);
          }
        }
      } catch (e) { if (st.errors.length < 20) st.errors.push(String(e && e.stack || e)); }
      return scan.call(this, w, ...b);
    };
    return L;
  };
  //   ★[T1217] 판 통계 — 어장 장부(파인 셀 수 · 결손 합) · 일괄 · 몸 멈춤 · 시세 다시 매김 · 곳간에서 썩어 없어진 품목(T789) · 교역 도착 수
  const dump = () => { try { const m = require.cache[path.join(root, 'server/villages.js')]; if (m && m.exports.t1202Stat) st.stat = m.exports.t1202Stat(); if (m && m.exports.t1217Stat) st.t1217 = m.exports.t1217Stat(); if (m && m.exports.t1217SharedTable) st.shared = m.exports.t1217SharedTable(); } catch (e) {}
    try { const FM = require.cache[path.join(root, 'server/fishing.js')]?.exports; if (FM) { let def = 0; for (const [, r] of FM.fishCells) def += Math.max(0, FM.CFG.CELL_K - r.s);
      let bd = 0, bk = 0, bn = 0, low = 0; if (FM.fishBuckets) for (const [, b] of FM.fishBuckets) { bn++; bk += b.K || 0; bd += Math.max(0, 1 - b.s) * (b.K || 0); if (b.s < 0.05) low++; }
      st.fish = { cells: FM.fishCells.size, deficit: +def.toFixed(4), kgPerStock: FM.CFG.KG_PER_STOCK, buckets: bn, bucketK: bk, bucketDeficit: +bd.toFixed(4), bucketLow: low }; } } catch (e) {}
    try { const v2 = require.cache[path.join(root, 'sim/economy-sim-v2.js')]?.exports; if (v2 && v2.t1217PxStat) st.px = v2.t1217PxStat(); } catch (e) {}
    try { const G = require.cache[path.join(root, 'server/granary-lots.js')]?.exports; if (G && G.rotOf) st.rot = G.rotOf(); } catch (e) {}
    try { const s = S(), w = s && s.world; if (w && w._tradeAudit) st.trade = { n: w._tradeAudit.n, bail: w._tradeAudit.bail, reroute: w._tradeAudit.reroute }; } catch (e) {}
    try { fs.writeFileSync(process.env.T577_OUT + '.t1202.json', JSON.stringify(st)); } catch (e) {} };
  process.on('exit', dump); setInterval(dump, 10000).unref();
}
