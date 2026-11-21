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
function snapshot() {
    const S = V.__p3Bind({}).state, now = Date.now();
    if (!S.world || !S.deps?.players || !S.villages) return null;
    const rows = S.villages.map(v => {
      let bodies = 0, awake = 0, down = 0, resting = 0, territorialWorkers = 0, lifeSleep = 0, lifeOther = 0, lifeUnknown = 0, moving = 0;
      for (const pid of v.npcPids) {
        const p = S.deps.players.get(pid); if (!p) continue;
        bodies++; down += !!p.isDown; resting += !!p._rest;
        if (p._lifeAct === '취침') lifeSleep++; else if (p._lifeAct) lifeOther++; else lifeUnknown++;
        if (p.vx || p.vy) moving++;
        const w = V.t1295Wp(p, now), wp = w != null ? w : S.deps.worldPhase ? S.deps.worldPhase(now) : null;
        const fv = wp == null ? 0.35 : process.env.T720_LON_DAY === '0' ? (wp + (p.simLonOff || 0)) % 1 : C.phaseAdd(wp, p.simLonOff || 0);
        if (fv < (S.deps.dayPhaseRatio || 0.7) && fv >= (p._dOff || 0)) awake++;
        if (p._t1302Terr || String(p._t1181Haul?.key || '').startsWith('t/')) territorialWorkers++;
      }
      return { name: v.name, bodies, awake, down, resting, territorialWorkers, lifeSleep, lifeOther, lifeUnknown, moving };
    });
    const total = k => rows.reduce((n, r) => n + r[k], 0);
    return { now, worldDay: S.world.day, allPlayerEntries: S.deps.players.size,
      nonResidentPlayerEntries: S.deps.players.size - total('bodies'),
      bodies: total('bodies'), scheduledAwake: total('awake'), down: total('down'),
      resting: total('resting'), territorialWorkers: total('territorialWorkers'),
      lifeSleep: total('lifeSleep'), lifeOther: total('lifeOther'), lifeUnknown: total('lifeUnknown'), moving: total('moving'), villages: rows };
}
E.createLedger = function () {
  const ledger = make.apply(this, arguments), scan = ledger.scanDay;
  ledger.scanDay = function (world, day) {
    const result = scan.apply(this, arguments);
    if (last === day) return result;
    last = day;
    const row = snapshot();
    if (row) fs.appendFileSync(process.env.T577_OUT + '.t1411-census.jsonl', JSON.stringify({ day, ...row, scheduledAwakeAtLedger: row.scheduledAwake }) + '\n');
    return result;
  };
  return ledger;
};
// Diagnostic replays only. 24 is the number of observation points per existing
// game day; it changes no game rate. Keep the benchmark's frozen v2 hook intact.
if (process.env.T1411_HOURLY === '1') {
  const dayMs = +process.env.VILLAGE_DAY_MS;
  if (!(dayMs > 0 && Number.isFinite(dayMs))) throw new Error('hourly census needs the declared game day');
  const timer = setInterval(() => {
    const row = snapshot();
    if (row) fs.appendFileSync(process.env.T577_OUT + '.t1411-hourly.jsonl', JSON.stringify(row) + '\n');
  }, dayMs / 24);
  if (timer && typeof timer.unref === 'function') timer.unref();
}
