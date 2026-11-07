'use strict';
// T1195 관측 preload(읽기만 · 세계 0): 사냥 마을 인구 · 사냥 고기 · 짐승 장부 · 몸 입고 통계를 판 끝에 `$T577_OUT.t1195.json` 으로.
//   쓰는 법: NODE_OPTIONS="--require scripts/t1195-observe.js" node scripts/server-baseline-check.js --make … (아이 존에서만 켠다 — `T577_SEED`)
if (require('worker_threads').isMainThread && process.env.T577_SEED) {
  const fs = require('fs'), path = require('path'), root = path.resolve(__dirname, '..');
  const st = { seed: +process.env.T577_SEED, knob: process.env.T1195_HUNT_REAL === undefined ? 'unset' : process.env.T1195_HUNT_REAL, dayMs: process.env.VILLAGE_DAY_MS, npcCap: process.env.VILLAGE_NPC_CAP || 'default', days: [], vil: {}, errors: [] };
  const S = () => { const m = require.cache[path.join(root, 'server/villages.js')]; return m && m.exports.__p3Bind ? m.exports.__p3Bind({}).state : null; };
  const gameSum = (sv) => { let n = 0; if (sv && sv._gameRich) for (const g of sv._gameRich.values()) n += g; return n; };
  let last = -1;
  const Events = require('../server/events'), create = Events.createLedger;
  Events.createLedger = function (...a) {
    const L = create.apply(this, a), scan = L.scanDay;
    L.scanDay = function (w, ...b) {
      try {
        const d = (w.day | 0);
        if (d !== last) {
          last = d;
          const s = S(), sv = new Map(); if (s && s.villages) for (const v of s.villages) if (v.econ) sv.set(v.econ, v);
          let pop = 0, empty = 0, dead = 0, meat = 0, hunters = 0, game = 0, got = 0;
          for (const v of (w.villages || [])) {
            const n = (v.npcs || []).length, h = (v.counts && v.counts.hunter) || 0, me = (v.dailyProductionBuf && v.dailyProductionBuf.meat) || 0, x = sv.get(v);
            pop += n; if (!n) empty++; dead += v._deadTot || 0; meat += me; hunters += h;
            const g = gameSum(x); game += g; got += (x && x._t1195Got) || 0;
            const r = st.vil[v.name] || (st.vil[v.name] = { h0: null, pop0: null, hDays: 0, meat: 0, pops: {}, game0: null, gameEnd: 0, landGame: [], got: 0, dead: 0 });
            if (r.h0 === null) { r.h0 = h; r.pop0 = n; }
            if (r.game0 === null && g > 0) r.game0 = g;
            r.hDays += h; r.meat += me; r.gameEnd = g; r.got = (x && x._t1195Got) || 0; r.dead = v._deadTot || 0; r.popEnd = n; r.hEnd = h;
            if (d % 50 === 0) { r.pops[d] = n; r.landGame.push(+((v.land && v.land.game) || 0).toFixed(3)); }
          }
          st.days.push([d, pop, empty, dead, +meat.toFixed(4), hunters, +game.toFixed(1), got]);
        }
      } catch (e) { if (st.errors.length < 20) st.errors.push(String(e && e.stack || e)); }
      return scan.call(this, w, ...b);
    };
    return L;
  };
  const dump = () => { try { const m = require.cache[path.join(root, 'server/villages.js')]; if (m && m.exports.t1195Stat) st.stat = m.exports.t1195Stat(); } catch (e) {} try { fs.writeFileSync(process.env.T577_OUT + '.t1195.json', JSON.stringify(st)); } catch (e) {} };
  process.on('exit', dump); setInterval(dump, 5000).unref();
}
