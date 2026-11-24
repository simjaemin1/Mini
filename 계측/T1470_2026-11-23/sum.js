'use strict';
// T1470 계측 묶음 — 판/<판>/{bot.json, jp.json, run.json} → 표 · node 계측/T1470_2026-11-23/sum.js 계측/T1470_2026-11-23/판
const fs = require('fs'), path = require('path'), D = process.argv[2];
const J = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const out = {};
for (const tag of fs.readdirSync(D).filter((t) => /^P(ON|OFF)_/.test(t))) {
  const b = J(path.join(D, tag, 'bot.json')), jp = J(path.join(D, tag, 'jp.json')); if (!b) continue;
  const g = b.groups.pin || {}, k = b.groups.shopK || {}, s = b.groups.shop || {};
  const cl = (arr) => (arr || []).reduce((m, c) => { const v = c.ok ? (c.v || '?') : 'refused'; m[v] = (m[v] || 0) + 1; return m; }, {});
  const maxJ = Math.max(0, ...((jp && jp.jobs) || []).map((j) => j.cpu), ...(((jp && jp.small) || {}).max != null ? [jp.small.max] : []));
  out[tag] = { viol: b.viol.length, shop: { off: s.offAt, adj0: s.adj0, adj1: s.adj1, n: (s.claims || []).length }, shopK: { thru0: k.thru0, thru1: k.thru1, off: k.offAt, n: (k.claims || []).length, v: cl(k.claims) },
    pin: { at: g.at, thru0: g.thru0, thru1: g.thru1, rel: g.thruRel, steps: g.steps, v: cl((g.claims || []).slice(0, 8)), wall: g.wall && { ok: g.wall.ok, v: g.wall.v, mark: g.wall.mark }, after: g.after },
    judgeMax: +maxJ.toFixed(1), pinJ: (g.steps || []).map((x) => x[5]).filter((x) => x != null) };
}
console.log(JSON.stringify(out, null, 1));
