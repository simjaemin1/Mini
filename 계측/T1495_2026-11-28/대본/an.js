// 갈래 판 견줌 — node an.js A.why.jsonl B.why.jsonl [phases]
'use strict';
const fs = require('fs');
const rd = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.d != null);
const sum = (a) => (Array.isArray(a) ? a.reduce((x, y) => x + (+y || 0), 0) : (+a || 0));
function load(f) { const L = rd(f); const m = new Map(); for (const r of L) m.set(r.d, r); return { L, m }; }
function flows(L, d0, d1) {
  // 누계 칸은 차 · 날 칸은 합
  const R = L.filter((r) => r.d >= d0 && r.d <= d1); if (!R.length) return null;
  const a = L.filter((r) => r.d < d0).pop() || R[0], b = R[R.length - 1];
  const cum = (k) => sum(b[k]) - sum(a[k]);
  const day = (k) => R.reduce((x, r) => x + sum(r[k]), 0);
  const ws = (k) => (b.ws && a.ws ? b.ws[k] - a.ws[k] : null);
  return {
    pop0: sum(a.pop), pop1: sum(b.pop), popMean: Math.round(R.reduce((x, r) => x + sum(r.pop), 0) / R.length), empty1: b.pop.filter((x) => !x).length,
    born: day('born'), gone: day('gone'), inn: day('inn'), left: day('left'),
    fd: cum('fd'), nat: cum('nat'), dead: cum('dead'), emig: cum('emig'), got: cum('got'), meatU: +day('meatU').toFixed(1),
    hunters: +(day('hunters') / R.length).toFixed(1), hOn: +(day('hOn') / R.length).toFixed(1), hOwn: +(day('hOwn') / R.length).toFixed(1),
    restH: +(day('restH') / R.length).toFixed(2), restO: +(day('restO') / R.length).toFixed(2), outB: +(day('outB') / R.length).toFixed(1),
    hitH: day('hitH'), hitO: day('hitO'), dmgH: day('dmgH'), dmgO: day('dmgO'), hitX: day('hitX'),
    food: +(sum(b.food)).toFixed(0), meat: +(sum(b.meat)).toFixed(0), hj: sum(b.hj),
    wake: ws('wake'), hunt: ws('hunt'), cap: ws('cap'), butch: ws('butch'), carcLost: ws('carcLost'),
  };
}
if (require.main === module) {
  const [fa, fb] = process.argv.slice(2);
  const A = load(fa), B = load(fb);
  let fE = null, fN = null, fB = null, fP = null, fV = null;
  for (const r of A.L) { const s = B.m.get(r.d); if (!s) continue;
    if (fE == null && r.hEall !== s.hEall) { fE = r.d; fV = r.hE.map((h, i) => (h !== s.hE[i] ? i : -1)).filter((i) => i >= 0); }
    if (fN == null && r.hN !== s.hN) fN = r.d; if (fB == null && r.hB !== s.hB) fB = r.d; if (fP == null && sum(r.pop) !== sum(s.pop)) fP = r.d; }
  console.log(JSON.stringify({ firstEcon: fE, firstEconVil: fV && fV.slice(0, 12), firstBody: fN, firstBeast: fB, firstPop: fP }));
  const ph = (process.argv[4] || '1-100,101-200,201-300,301-400').split(',').map((s) => s.split('-').map(Number));
  for (const [d0, d1] of ph) { const x = flows(A.L, d0, d1), y = flows(B.L, d0, d1); if (!x || !y) continue;
    const o = {}; for (const k of Object.keys(x)) o[k] = [x[k], y[k]]; console.log(d0 + '-' + d1, JSON.stringify(o)); }
}
module.exports = { rd, load, flows, sum };
