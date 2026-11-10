'use strict';
// Read-only companion to SBC. Loaded only in the actual zone child.
if (!/server[\\/]zone\.js$/.test(process.argv[1] || '') || !process.env.T577_OUT) return;
const fs = require('fs'), path = require('path'), Module = require('module');
const compile = Module.prototype._compile;
Module.prototype._compile = function (source, file) {
  if (file === process.argv[1]) source += `
global.__t1255Read = function(world, day) {
  const E = require('../sim/economy-sim'), K = require('./kcal');
  const alive = {}, present = {};
  for (const m of mobs.values()) {
    if (!ANIMALS[m.type]) continue;
    present[m.type] = (present[m.type] || 0) + 1;
    if (m.hp > 0) alive[m.type] = (alive[m.type] || 0) + 1;
  }
  const villages = world.villages.map(v => ({
    name: v.name, population: v.npcs.length,
    foodKcal: E.totalFoodEquivalent(v) * K.DAY_KCAL,
    hungerSum: v.npcs.reduce((sum, p) => sum + (+p.hunger || 0), 0),
    hungerZero: v.npcs.filter(p => p.hunger <= 0).length,
    fdDeaths: v._fdDeadTot || 0, legacyMeatUnits: (v.dailyProductionBuf || {}).meat || 0
  }));
  return {day, worldDay: world.day, villages, mobsAlive: alive, mobsPresent: present,
    hunt: SimVillages.t1195Stat(), waterDeer: {...Wildlife._debug.t1237},
    activeChunks: activeChunkKeys.size, wildlife: {...Wildlife._debug.stats},
    realHuntEnabled: E.T1195_HUNT_REAL, enabled: waterDeerOn(), sourceModule: __filename};
};
`;
  return compile.call(this, source, file);
};
const Ev = require(path.join(path.dirname(process.argv[1]), 'events'));
const make = Ev.createLedger;
let last = -1;
Ev.createLedger = function () {
  const ledger = make.apply(this, arguments), scan = ledger.scanDay;
  ledger.scanDay = function (world, day) {
    const result = scan.apply(this, arguments);
    if (day !== last) {
      last = day;
      try {
        const row = global.__t1255Read(world, day);
        fs.appendFileSync(process.env.T577_OUT + '.t1255.jsonl', JSON.stringify(row) + '\n');
      } catch (error) {
        fs.writeFileSync(process.env.T577_OUT + '.t1255-error.json', JSON.stringify({day, error: error.stack}));
      }
    }
    return result;
  };
  return ledger;
};
