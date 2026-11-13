'use strict';
// Read-only counters; no price, capacity, geometry or model update helpers.
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('fs'), path = require('path');
const E = require(path.join(__dirname, '..', 'sim/economy-sim'));
const Ev = require(path.join(__dirname, '..', 'server/events'));
const OUT = process.env.T577_OUT + '.t1274.json';
const DAILY = process.env.T577_OUT + '.t1274-days.jsonl';
const rec = { rows: [], snapshots: [], errors: [], seed: process.env.T577_SEED,
  settledBodyWood: 0, legacyPreviousWoodD: 0, currentWoodD: 0,
  cutCalls: 0, felledTrees: 0, felledWood: 0 };
const cumulative = new Map(), initialHouses = new Map(), seenHouses = new Map(), initialFarms = new Map();
let V = null, cutInstalled = false, last = null, cpuPrevious = { user: 0, system: 0 };
let period = { born: 0, econDeaths: 0, emigration: 0 };
const stateOfWorld = () => {
  if (!V) V = require(path.join(__dirname, '..', 'server/villages'));
  return V.__p3Bind({}).state;
};
const houseKeys = v => (v._houseCells || []).map(h => h.cx + ',' + h.cy);
function installCutCounter(st) {
  if (cutInstalled || !st.deps || typeof st.deps.t325CutTreeAt !== 'function') return;
  const cut = st.deps.t325CutTreeAt;
  st.deps.t325CutTreeAt = function() {
    rec.cutCalls++;
    const loot = cut.apply(this, arguments);
    if (loot) { rec.felledTrees++; rec.felledWood += +loot.wood || 0; }
    return loot;
  };
  cutInstalled = true;
}
const tick = E.tickVillage;
E.tickVillage = function(e) {
  const before = new Set(e.npcs || []), dead = e._deadTot || 0, emig = e._emigTot || 0;
  try {
    const st = stateOfWorld(); installCutCounter(st);
    const vil = st.byEcon && st.byEcon.get(e);
    if (vil && !initialHouses.has(vil.name)) {
      initialHouses.set(vil.name, new Set(houseKeys(vil)));
      seenHouses.set(vil.name, new Set(houseKeys(vil)));
      initialFarms.set(vil.name, vil._farmSet ? vil._farmSet.size : 0);
    }
    rec.settledBodyWood += +e._t325InflowToday || 0;
    rec.legacyPreviousWoodD += +e._woodOutLast || 0;
  } catch(err) { rec.errors.push(String(err.stack || err)); }
  const result = tick.apply(this, arguments);
  try {
    let born = 0; for (const n of e.npcs || []) if (!before.has(n)) born++;
    const deaths = (e._deadTot || 0) - dead, emigrants = (e._emigTot || 0) - emig;
    period.born += born; period.econDeaths += deaths; period.emigration += emigrants;
    const r = cumulative.get(e.name) || { born: 0, zeroBirthDays: 0, zeroBirthHouseDays: 0 };
    r.born += born;
    if ((e.npcs || []).length && !born) { r.zeroBirthDays++; if ((e._dpDebug || {}).gated) r.zeroBirthHouseDays++; }
    cumulative.set(e.name, r);
    rec.currentWoodD += +e._woodOutLast || 0;
  } catch(err) { rec.errors.push(String(err.stack || err)); }
  return result;
};
const create = Ev.createLedger;
Ev.createLedger = function() {
  const L = create.apply(this, arguments), scan = L.scanDay;
  L.scanDay = function(world, day) {
    const result = scan.apply(this, arguments);
    try {
      if (last === day) return result; last = day;
      const cpu = process.cpuUsage(), st = stateOfWorld();
      const villages = (st.villages || []).map(v => {
        const e = v.econ || {}, t = v._t1207 || {}, keys = houseKeys(v);
        const seen = seenHouses.get(v.name) || new Set(); for (const k of keys) seen.add(k); seenHouses.set(v.name, seen);
        const initial = initialHouses.get(v.name) || new Set();
        const stats = e.lastStats || {}, prices = e._priceCache || {};
        return { name: v.name, pop: (e.npcs || []).length,
          bodies: (v.npcPids || []).filter(pid => st.deps.players.has(pid)).length,
          territory: v._terrSet ? v._terrSet.size : 0, farm: v._farmSet ? v._farmSet.size : 0,
          initialFarmCells: initialFarms.has(v.name) ? initialFarms.get(v.name) : null,
          farmNetNewCells: initialFarms.has(v.name) ? (v._farmSet ? v._farmSet.size : 0) - initialFarms.get(v.name) : null,
          houses: keys.length, initialHouseCells: initial.size,
          newHouseCells: [...seen].filter(k => !initial.has(k)).length,
          housing: e.housing, foodEquivalent: E.totalFoodEquivalent(e), wood: (e.storage || {}).wood || 0,
          pendingBodyWood: +e._t325InflowToday || 0, woodD: +e._woodOutLast || 0,
          debtDeaths: e._fdDeadTot || 0, econDeaths: e._deadTot || 0, emigration: e._emigTot || 0,
          famine: V.villageFamine(v), land: e.land, counts: e.counts, gate: e._dpDebug,
          happiness: stats.happiness, health: stats.health, woodPrice: prices.wood, foodPrice: prices.food,
          territoryCost: Object.fromEntries(['days','stallWood','stallBody','cells','wood','laborMin','felled','woodIn','body','queued'].map(k => [k,t[k] || 0])),
          ...cumulative.get(v.name) };
      });
      const sum = k => villages.reduce((s,v) => s + (+v[k] || 0), 0);
      const cost = Object.fromEntries(['days','stallWood','stallBody','cells','wood','laborMin','felled','woodIn','body','queued'].map(k => [k,villages.reduce((s,v)=>s+v.territoryCost[k],0)]));
      const exits = V.bodyExitStats();
      const row = { day, cpuSeconds: ((cpu.user-cpuPrevious.user)+(cpu.system-cpuPrevious.system))/1e6,
        processCPUSeconds: (cpu.user+cpu.system)/1e6, uptimeSeconds: process.uptime(),
        pop: sum('pop'), bodies: sum('bodies'), playerEntries: st.deps.players.size,
        empty: villages.filter(v => v.pop === 0).length, ...period,
        bornCumulative: sum('born'), debtDeaths: sum('debtDeaths'), econDeathsCumulative: sum('econDeaths'), emigrationCumulative: sum('emigration'),
        famineVillages: villages.filter(v => v.famine).length,
        bodyExit: exits, bodyStarve: exits.died.starve, banditStarve: exits.died.bandit_starve,
        territory: sum('territory'), farm: sum('farm'), farmNetNewCells: sum('farmNetNewCells'), houses: sum('houses'), newHouseCells: sum('newHouseCells'), housing: sum('housing'),
        wood: sum('wood'), settledBodyWood: rec.settledBodyWood,
        acceptedBodyWood: rec.settledBodyWood + sum('pendingBodyWood'),
        legacyPreviousWoodD: rec.legacyPreviousWoodD, currentWoodD: rec.currentWoodD,
        cutCalls: rec.cutCalls, felledTrees: rec.felledTrees, felledWood: rec.felledWood, territoryCost: cost };
      rec.rows.push(row); fs.appendFileSync(DAILY, JSON.stringify(row)+'\n');
      cpuPrevious = cpu; period = { born: 0, econDeaths: 0, emigration: 0 };
      if (day % 10 === 0 || rec.rows.length === 1 || day === +(process.env.T577_DAYS || 100)) {
        rec.snapshots.push(JSON.parse(JSON.stringify({ day, villages })));
        fs.writeFileSync(OUT, JSON.stringify(rec));
      }
    } catch(err) { rec.errors.push(String(err.stack || err)); fs.writeFileSync(OUT, JSON.stringify(rec)); }
    return result;
  }; return L;
};
process.on('exit', () => {
  rec.finalCPU = process.cpuUsage(); rec.clock = typeof global.__t745 === 'function' ? global.__t745() : null;
  fs.writeFileSync(OUT, JSON.stringify(rec));
});
