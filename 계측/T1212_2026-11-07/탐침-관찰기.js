'use strict';
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT.replace(/\.json$/, '') + '.probe.json';
const ROOT = '/tmp/t905/repo';
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const SNAP = (process.env.PROBE_SNAP || '5,30,45,60,100,150,200,300,400').split(',').map(Number); const done = new Set(); const rec = [];
const _t = V1.tickVillage; let last = -1;
V1.tickVillage = function (v, day) {
  try { if (day !== last) { last = day; for (const s of SNAP) if (day >= s && !done.has(s)) { done.add(s);
    const VIL = require(path.join(ROOT, 'server', 'villages')); const P = VIL.__labProbe._t569Probe.setup(); const B = VIL.__p3Bind({});
    const C = require(path.join(ROOT, 'server', 'crops'));
    const o = { day, cred: 0, hN: 0, food: 0, crops: {}, cells: 0, planted: 0, farmers: 0, hl: 0, body: 0 };
    for (const vil of P.villages) { const e = vil.econ || {}; o.cred += e._t368CredTot || 0; o.hN += e._t100HarvestN || 0; o.food += e._t368FoodTot || 0; o.cells += vil._farmSet ? vil._farmSet.size : 0;
      if (vil._crop) for (const [k, c] of vil._crop) { o.planted++; o.crops[c.c] = (o.crops[c.c] || 0) + 1; }
      o.farmers += (e.counts && e.counts.farmer) || 0; o.hl += vil._t368HlBatch || 0; o.body += vil._t368HlBody || 0; o.hlDay = vil._hlDay; }
    o.farmDay = B._farmDay ? B._farmDay(null, o.hlDay) : null; o.mo = C.monthOf(o.farmDay != null ? o.farmDay : o.hlDay); o.off = B._t1212Off ? B._t1212Off() : null;
    o.rest = B._t1212Rest ? Object.assign({}, B._t1212Rest) : null; o.cal = B._t1212Stat ? Object.assign({}, B._t1212Stat) : null;
    rec.push(o); fs.writeFileSync(OUT, JSON.stringify(rec)); } } } catch (e) { rec.push({ err: String(e.stack).slice(0, 400) }); fs.writeFileSync(OUT, JSON.stringify(rec)); }
  return _t.apply(this, arguments);
};
