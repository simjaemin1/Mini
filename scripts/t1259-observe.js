'use strict';
// T1259, server-baseline-check --make 곁 관찰기. 정본 함수 반환값/날 장부만 기록한다.
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const V = require(path.join(ROOT, 'server/villages'));
const E = require(path.join(ROOT, 'sim/economy-sim'));
const Events = require(path.join(ROOT, 'server/events'));
const OUT = process.env.T577_OUT + '.t1259.json';
const cpuStart = process.cpuUsage(), wallStart = process.hrtime.bigint();
const crypto = require('crypto');
const rec = { seed: process.env.T577_SEED, rows: [], snapshots: [], errors: [],
  felledTrees: 0, felledWood: 0, bodyWoodIn: 0, econWoodD: 0, famineVillageDays: 0,
  starvedEvents: 0, notes: 'Felling includes the canonical territory-clearing inlet. bodyWoodIn is the actual inlet before daily settlement; econWoodD is the previous daily _woodOutLast, matching T1251. K uses canonical raw trees in the native lumberjack candidate ring. Famine is the existing villageFamine predicate, counted per village-day.' };
const init = V.init;
V.init = function () {
  const result = init.apply(this, arguments);
  const state = V.__p3Bind({}).state;
  const cut = state.deps.t325CutTreeAt;
  if (typeof cut === 'function') state.deps.t325CutTreeAt = function () {
    const loot = cut.apply(this, arguments);
    if (loot) { rec.felledTrees++; rec.felledWood += +loot.wood || 0; }
    return loot;
  };
  return result;
};
const starved = V.noteStarved;
if (typeof starved === 'function') V.noteStarved = function () { rec.starvedEvents++; return starved.apply(this, arguments); };
const tick = E.tickVillage;
E.tickVillage = function (v) {
  rec.bodyWoodIn += +v._t325InflowToday || 0;
  rec.econWoodD += +v._woodOutLast || 0;
  return tick.apply(this, arguments);
};
let last = -1;
const create = Events.createLedger;
Events.createLedger = function () {
  const L = create.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function (world, day) {
    const result = scan.apply(this, arguments);
    try {
      if (day === last) return result;
      last = day;
      const state = V.__p3Bind({}).state;
      let pop = 0, empty = 0, wood = 0, lumber = 0, famine = 0;
      for (const vil of state.villages || []) {
        const e = vil.econ; if (!e) continue;
        const n = (e.npcs || []).length;
        pop += n; if (!n) empty++;
        wood += (e.storage && e.storage.wood) || 0;
        lumber += (e.counts && e.counts.lumberjack) || 0;
        if (V.villageFamine(vil)) famine++;
      }
      rec.famineVillageDays += famine;
      rec.rows.push({ day, pop, empty, wood, lumber, famine, starvedEvents: rec.starvedEvents,
        felledTrees: rec.felledTrees, felledWood: rec.felledWood, bodyWoodIn: rec.bodyWoodIn, econWoodD: rec.econWoodD });
      if (day % 10 === 0) {
        const villages = [];
        for (const vil of state.villages || []) {
          let K = 0, standingCells = 0;
          const xy = V._t398Cells(vil).xy;
          for (let i = 0; i < xy.length; i += 2) {
            if (xy[i] < 0 || xy[i + 1] < 0) continue;
            const raw = state.deps.t325TreesAtCell(xy[i], xy[i + 1], true);
            const live = state.deps.t325TreesAtCell(xy[i], xy[i + 1]);
            K += raw ? raw.length : 0;
            if (live && live.length) standingCells++;
          }
          const e = vil.econ || {};
          villages.push({ name: vil.name, K, standingCells, lumber: (e.counts && e.counts.lumberjack) || 0, pop: (e.npcs || []).length });
        }
        rec.snapshots.push({ day, villages });
      }
    } catch (e) { rec.errors.push({ day, error: String(e.stack || e) }); }
    return result;
  };
  return L;
};
const source = {};
for (const name of ['sim/economy-sim.js', 'server/villages.js', 'server/zone.js', 'server/wood-walk-evidence.json', 'scripts/t1259-observe.js', 'scripts/t577-server-run.js', 'scripts/server-baseline-check.js']) {
  const file = path.join(ROOT, name);
  if (fs.existsSync(file)) source[name] = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
process.on('exit', () => {
  try {
    const cpu = process.cpuUsage(cpuStart);
    rec.cpuSeconds = (cpu.user + cpu.system) / 1e6;
    rec.wallSeconds = Number(process.hrtime.bigint() - wallStart) / 1e9;
    rec.clock = typeof global.__t745 === 'function' ? global.__t745() : null;
    rec.source = source;
    fs.writeFileSync(OUT, JSON.stringify(rec));
  } catch (e) {}
});
