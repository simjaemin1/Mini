'use strict';
// Read-only ledger-time census. "Awake" is the actual territory scheduler window,
// not an action label, a count of worker calls, or an all-day average.
if (!process.env.T577_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('node:fs'), path = require('node:path');
const root = path.resolve(process.env.T1411_ROOT || path.join(__dirname, '..'));
const V = require(path.join(root, 'server/villages'));
const C = require(path.join(root, 'server/zone-config'));
const E = require(path.join(root, 'server/events')), make = E.createLedger;
let last;
E.createLedger = function () {
  const ledger = make.apply(this, arguments), scan = ledger.scanDay;
  ledger.scanDay = function (world, day) {
    const result = scan.apply(this, arguments);
    if (last === day) return result;
    last = day;
    const S = V.__p3Bind({}).state, now = Date.now();
    const rows = S.villages.map(v => {
      let bodies = 0, awake = 0, down = 0, resting = 0, territorialWorkers = 0;
      for (const pid of v.npcPids) {
        const p = S.deps.players.get(pid); if (!p) continue;
        bodies++; down += !!p.isDown; resting += !!p._rest;
        const w = V.t1295Wp(p, now), wp = w != null ? w : S.deps.worldPhase ? S.deps.worldPhase(now) : null;
        const fv = wp == null ? 0.35 : process.env.T720_LON_DAY === '0' ? (wp + (p.simLonOff || 0)) % 1 : C.phaseAdd(wp, p.simLonOff || 0);
        if (fv < (S.deps.dayPhaseRatio || 0.7) && fv >= (p._dOff || 0)) awake++;
        if (p._t1302Terr || String(p._t1181Haul?.key || '').startsWith('t/')) territorialWorkers++;
      }
      return { name: v.name, bodies, awake, down, resting, territorialWorkers };
    });
    const total = k => rows.reduce((n, r) => n + r[k], 0);
    fs.appendFileSync(process.env.T577_OUT + '.t1411-census.jsonl', JSON.stringify({ day, now,
      bodies: total('bodies'), scheduledAwakeAtLedger: total('awake'), down: total('down'),
      resting: total('resting'), territorialWorkers: total('territorialWorkers'), villages: rows }) + '\n');
    return result;
  };
  return ledger;
};
