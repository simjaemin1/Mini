'use strict';
// node prof.js <x.cpuprofile> [N] — 제 시간(self) · 품은 시간(total) 많은 함수 N 개(파일 이름:줄)
const fs = require('fs'), P = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), N = +process.argv[3] || 15;
const byId = new Map(); for (const n of P.nodes) byId.set(n.id, n);
const dt = P.timeDeltas || [], self = new Map();
for (let i = 0; i < P.samples.length; i++) { const id = P.samples[i]; self.set(id, (self.get(id) || 0) + (dt[i] || 0)); }
const par = new Map(); for (const n of P.nodes) for (const c of n.children || []) par.set(c, n.id);
const key = (n) => { const f = n.callFrame; return `${f.functionName || '(anon)'} ${String(f.url).split('/').slice(-1)[0]}:${f.lineNumber + 1}`; };
const S = new Map(), T = new Map(); let tot = 0;
for (const [id, us] of self) {
  tot += us; const n = byId.get(id); const k = key(n); S.set(k, (S.get(k) || 0) + us);
  const seen = new Set(); let x = id; while (x != null) { const kk = key(byId.get(x)); if (!seen.has(kk)) { seen.add(kk); T.set(kk, (T.get(kk) || 0) + us); } x = par.get(x); }
}
const fmt = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, N).map(([k, v]) => `${(v / 1e6).toFixed(1)}s ${(100 * v / tot).toFixed(1)}% ${k}`).join('\n');
console.log(`총 ${(tot / 1e6).toFixed(1)}s\n— 제 시간\n${fmt(S)}\n— 품은 시간\n${fmt(T)}`);
