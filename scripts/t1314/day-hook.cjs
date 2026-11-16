'use strict';
// (러너 밖 · T1314 계측 · 읽기만) 날마다 — 몸 모양(숨은 모양 무리 · 사전 모드 수 · 큰 무리와 다른 열쇠) + 그날 존 프로세스 CPU(process.cpuUsage 차분 · 초).
//   econ 날 경계(scanDay 첫 부름)에 한 번. 세계에 쓰지 않는다. `T1314_ROOT`(판 트리) · `T1314_DAY`(출력 jsonl).
if (!/zone\.js$/.test(process.argv[1] || '') || !process.env.T1314_DAY) return;
const path = require('path'), fs = require('fs'), v8 = require('v8');
v8.setFlagsFromString('--allow-natives-syntax');
const same = new Function('a', 'b', 'return %HaveSameMap(a, b)'), fast = new Function('a', 'return %HasFastProperties(a)');
const root = process.env.T1314_ROOT, out = process.env.T1314_DAY;
fs.writeFileSync(out, '');
const E = require(path.join(root, 'server/events')), make = E.createLedger;
let last = -1, cpu0 = process.cpuUsage();
E.createLedger = function () {
  const L = make.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function (world, day) {
    if (day !== last) {
      last = day;
      const c = process.cpuUsage(cpu0); cpu0 = process.cpuUsage();
      try {
        const V = require.cache[path.join(root, 'server/villages.js')];
        const pl = V && V.exports.__p3Bind({}).state.deps.players;
        const reps = [], cnt = [], keys = [], dictK = new Map(); let n = 0, dict = 0;
        if (pl) for (const p of pl.values()) {
          n++; if (!fast(p)) { dict++; continue; }
          let j = -1; for (let i = 0; i < reps.length; i++) if (same(reps[i], p)) { j = i; break; }
          if (j < 0) { reps.push(p); cnt.push(0); keys.push(Object.keys(p)); j = reps.length - 1; }
          cnt[j]++;
        }
        const big = cnt.indexOf(Math.max(...cnt)), bk = keys[big] || [], bs = new Set(bk);
        const groups = keys.map((k, i) => { const ks = new Set(k); return { n: cnt[i], extra: k.filter((x) => !bs.has(x)), miss: bk.filter((x) => !ks.has(x)) }; }).sort((a, b) => b.n - a.n);
        fs.appendFileSync(out, JSON.stringify({ day, cpu: +((c.user + c.system) / 1e6).toFixed(3), n, dict, maps: reps.length, groups }) + '\n');
      } catch (e) { fs.appendFileSync(out, JSON.stringify({ day, err: String(e && e.message) }) + '\n'); }
    }
    return scan.apply(this, arguments);
  };
  return L;
};
