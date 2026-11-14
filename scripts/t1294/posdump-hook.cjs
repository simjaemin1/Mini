'use strict';
// (러너 밖 · T1294 계측 · 읽기만) 몸 자리 덤프 — econ 날 경계마다 players 전부의 pid → [x, y](소수 둘째 자리) · 켬/끔 짝의 자리 어긋남(px)을 재려고.
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1] || '') || !process.env.T1294_POSDUMP) return;
const path = require('path'), fs = require('fs');
const root = process.env.T1278_ROOT, out = process.env.T1294_POSDUMP;
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
        const pl = V && V.exports.__p3Bind({}).state.deps.players, o = {};
        if (pl) for (const [k, p] of pl) o[k] = [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, p.simCaravan ? 1 : 0, p.behavior || ''];
        fs.appendFileSync(out, JSON.stringify({ day, p: o }) + '\n');
      } catch (e) { fs.appendFileSync(out, JSON.stringify({ day, err: String(e && e.message) }) + '\n'); }
    }
    return scan.apply(this, arguments);
  };
  return L;
};
