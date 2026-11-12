'use strict';
// (러너 밖 · T1278 계측 · 읽기만) 몸 자리 지문 — econ 날 경계(scanDay 첫 부름)마다 players 전부(열쇠 차례)의 x · y · vx · vy · hp 를 sha1 로.
//   세계에 쓰지 않는다. `T1278_ROOT`(판 트리) · `T1278_POS`(출력 jsonl).
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1] || '') || !process.env.T1278_POS) return;
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const root = process.env.T1278_ROOT, out = process.env.T1278_POS;
fs.writeFileSync(out, '');
const E = require(path.join(root, 'server/events')), make = E.createLedger;
let last = -1;
E.createLedger = function () {
  const L = make.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function (world, day) {
    if (day !== last) {
      last = day;
      try {
        const V = require.cache[path.join(root, 'server/villages.js')];
        const st = V && V.exports.__p3Bind({}).state, pl = st && st.deps && st.deps.players;
        const h = crypto.createHash('sha1'); let n = 0, car = 0;
        if (pl) for (const k of [...pl.keys()].sort()) { const p = pl.get(k); h.update(`${k}:${p.x},${p.y},${p.vx},${p.vy},${p.hp};`); n++; if (p.simCaravan) car++; }
        fs.appendFileSync(out, JSON.stringify({ day, n, car, h: h.digest('hex').slice(0, 16) }) + '\n');
      } catch (e) { fs.appendFileSync(out, JSON.stringify({ day, err: String(e && e.message) }) + '\n'); }
    }
    return scan.apply(this, arguments);
  };
  return L;
};
