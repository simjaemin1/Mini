'use strict';
// (계측 · 읽기만) 몸 모양 — 마을 몸(simVillageId)들의 숨은 모양(map) 무리 수 · 사전 모드 수 · 키 차례 무리 수
if (!/zone\.js$/.test(process.argv[1] || '') || !process.env.T1290_SHAPE) return;
const fs = require('fs'), path = require('path'), v8 = require('v8');
v8.setFlagsFromString('--allow-natives-syntax');
const same = new Function('a', 'b', 'return %HaveSameMap(a, b)');
const fast = new Function('a', 'return %HasFastProperties(a)');
const out = process.env.T1290_SHAPE;
function dump(tag) {
  try {
    const V = Object.values(require.cache).find((m) => /server\/villages\.js$/.test(m.id));
    const pl = V && V.exports.__p3Bind({}).state.deps.players; if (!pl) return;
    const reps = [], cnt = [], keyG = new Map(); let n = 0, dict = 0, other = 0;
    const firstKeys = [];
    for (const p of pl.values()) {
      if (!p || !p.simVillageId) { other++; continue; }
      n++; if (!fast(p)) dict++;
      let j = reps.findIndex((r) => same(r, p));
      if (j < 0) { reps.push(p); cnt.push(0); j = reps.length - 1; firstKeys.push(Object.keys(p)); }
      cnt[j]++;
      const ks = Object.keys(p).join(','); keyG.set(ks, (keyG.get(ks) || 0) + 1);
    }
    // 무리별 첫 몸과 가장 큰 무리의 키 차이
    const big = cnt.indexOf(Math.max(...cnt)), bk = firstKeys[big] || [];
    const diffs = firstKeys.map((k, i) => ({ n: cnt[i], len: k.length, extra: k.filter((x) => !bk.includes(x)).slice(0, 12), miss: bk.filter((x) => !k.includes(x)).slice(0, 12), firstDiff: (() => { for (let q = 0; q < Math.min(k.length, bk.length); q++) if (k[q] !== bk[q]) return q + ':' + k[q] + '/' + bk[q]; return null; })() })).sort((a, b) => b.n - a.n);
    fs.appendFileSync(out, JSON.stringify({ tag, t: Math.round(process.uptime()), n, other, dict, maps: reps.length, keySeqs: keyG.size, groups: diffs.slice(0, 40) }) + '\n');
  } catch (e) { fs.appendFileSync(out, JSON.stringify({ tag, err: String(e && e.stack) }) + '\n'); }
}
let k = 0; setInterval(() => dump('i' + (++k)), 150000).unref();
