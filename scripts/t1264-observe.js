'use strict';
// T1264: read existing fields after native callbacks. Never call price/cache/model helpers.
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'sim/economy-sim'));
const V = require(path.join(ROOT, 'server/villages'));
const Ev = require(path.join(ROOT, 'server/events'));
const out = process.env.T577_OUT + '.t1264.json';
const rec = { seed: process.env.T577_SEED, rows: [], snapshots: [], errors: [], villages: {} };
const cpu0 = process.cpuUsage();
const tick = E.tickVillage;
E.tickVillage = function(v, day) {
  const before = new Set(v.npcs || []);
  const result = tick.apply(this, arguments);
  try {
    const n = (v.npcs || []).length;
    const r = rec.villages[v.name] || (rec.villages[v.name] = { days: 0, inhabitedDays: 0, born: 0, zeroBirthDays: 0, zeroBirthHouseDays: 0, houseGateDays: 0 });
    let born = 0; for (const a of v.npcs || []) if (!before.has(a)) born++;
    r.days++; r.born += born;
    if (n) { r.inhabitedDays++; if (v._dpDebug && v._dpDebug.gated) r.houseGateDays++;
      if (!born) { r.zeroBirthDays++; if (v._dpDebug && v._dpDebug.gated) r.zeroBirthHouseDays++; }
    }
  } catch(e) { rec.errors.push(String(e.stack || e)); }
  return result;
};
let last = null;
const create = Ev.createLedger;
Ev.createLedger = function() {
  const L = create.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function(world, day) {
    const result = scan.apply(this, arguments);
    try {
      if (last === day) return result; last = day;
      const state = V.__p3Bind({}).state;
      const villages = (state.villages || []).map(v => {
        const e = v.econ || {}, t = v._t1207 || {}, st = e.storage || {};
        return { name: v.name, pop: (e.npcs || []).length, territory: v._terrSet ? v._terrSet.size : 0,
          farm: v._farmSet ? v._farmSet.size : 0, dry: v._drySet ? v._drySet.size : 0,
          land: e.land, housing: e.housing, mapBeds: e._mapBeds, wood: st.wood || 0,
          lumber: (e.counts || {}).lumberjack || 0, farmer: (e.counts || {}).farmer || 0,
          debtDeaths: e._fdDeadTot || 0, deaths: e._deadTot || 0, emigration: e._emigTot || 0,
          famine: V.villageFamine(v), gate: e._dpDebug,
          territoryCost: Object.fromEntries(['days','stallWood','stallBody','cells','wood','laborMin','felled','woodIn'].map(k => [k,t[k] || 0])),
          fallenCells: (v._t1238Stat || {}).gone || 0, need: e._t1207Need || 0,
          woodIn: e._t325WoodTot || 0, ...rec.villages[v.name] };
      });
      rec.rows.push({ day, pop: villages.reduce((s,v)=>s+v.pop,0), villages: villages.length,
        debtDeaths: villages.reduce((s,v)=>s+v.debtDeaths,0), famine: villages.filter(v=>v.famine).length });
      if (day % 10 === 0 || rec.rows.length === 1) {
        // Deep copy: subsequent native ticks mutate the land/debug objects.
        rec.snapshots.push(JSON.parse(JSON.stringify({ day, villages })));
        fs.writeFileSync(out, JSON.stringify(rec));
      }
    } catch(e) { rec.errors.push(String(e.stack || e)); }
    return result;
  }; return L;
};
process.on('exit', () => {
  const cpu = process.cpuUsage(cpu0); rec.cpuSeconds = (cpu.user + cpu.system)/1e6;
  rec.clock = typeof global.__t745 === 'function' ? global.__t745() : null;
  fs.writeFileSync(out, JSON.stringify(rec));
});
