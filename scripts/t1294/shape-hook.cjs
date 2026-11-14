'use strict';
// (러너 밖 · T1294 계측 · 읽기만) 몸 모양 — econ 날 경계(scanDay 첫 부름)마다 players 전부의 숨은 모양(map) 무리 · 사전 모드 수 · 무리마다 큰 무리와 다른 열쇠.
//   세계에 쓰지 않는다(%HaveSameMap · Object.keys 읽기만). `T1278_ROOT`(판 트리) · `T1294_SHAPE`(출력 jsonl).
if (!process.env.T577_SEED || !/zone\.js$/.test(process.argv[1] || '') || !process.env.T1294_SHAPE) return;
const path = require('path'), fs = require('fs'), v8 = require('v8');
v8.setFlagsFromString('--allow-natives-syntax');
const same = new Function('a', 'b', 'return %HaveSameMap(a, b)'), fast = new Function('a', 'return %HasFastProperties(a)');
const root = process.env.T1278_ROOT, out = process.env.T1294_SHAPE;
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
        const pl = V && V.exports.__p3Bind({}).state.deps.players;
        const reps = [], cnt = [], keys = []; let n = 0, dict = 0;
        if (pl) for (const p of pl.values()) {
          n++; if (!fast(p)) dict++;
          let j = -1; for (let i = 0; i < reps.length; i++) if (same(reps[i], p)) { j = i; break; }
          if (j < 0) { reps.push(p); cnt.push(0); keys.push(Object.keys(p)); j = reps.length - 1; }
          cnt[j]++;
        }
        const big = cnt.indexOf(Math.max(...cnt)), bk = keys[big] || [], bs = new Set(bk);
        const groups = keys.map((k, i) => { const ks = new Set(k); return { n: cnt[i], len: k.length, extra: k.filter((x) => !bs.has(x)), miss: bk.filter((x) => !ks.has(x)), order: (() => { for (let q = 0; q < Math.min(k.length, bk.length); q++) if (k[q] !== bk[q]) return q + ':' + k[q] + '/' + bk[q]; return null; })() }; }).sort((a, b) => b.n - a.n);
        fs.appendFileSync(out, JSON.stringify({ day, n, dict, maps: reps.length, groups }) + '\n');
      } catch (e) { fs.appendFileSync(out, JSON.stringify({ day, err: String(e && e.message) }) + '\n'); }
    }
    return scan.apply(this, arguments);
  };
  return L;
};
