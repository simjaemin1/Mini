'use strict';
// Actual T747/T1340 restore + T1167 early/bind + actual draft gate, no zone simulation.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '../..');
const input = JSON.parse(fs.readFileSync(process.argv[2]));
const out = process.argv[3];
const log = console.log; console.log = () => {};
const V = require(path.join(ROOT, 'server/villages'));
const W = require(path.join(ROOT, 'sim/war-core'));
const players = new Map(), npcs = new Set();
const originals = new Map();
const villages = input.villages.map(v => {
  v.housesPx = []; v.npcPids = [];
  for (let i = 0; i < v.econ._t747Body.rows.length; i++) {
    const r = v.econ._t747Body.rows[i];
    const pid = r.$p; assert(pid != null);
    v.npcPids.push(pid); originals.set(pid, structuredClone(r));
    players.set(pid, { pid, isNpc: true, hp: 100, maxHp: 100, x: 0, y: 0, simJob: r.simJob, simVillageId: v.dbId });
    npcs.add(pid);
  }
  return v;
});
const world = { day: 870, villages: villages.map(v => v.econ) };
const war = W.createWar({ villages, world, seed: 42, log: () => {} });
const H = V.__p3Bind({ deps: { players, npcs, setHp: (p, hp) => { p.hp = hp; } },
  war, warCore: W, world, villages, byDbId: new Map(villages.map(v => [v.dbId,v])),
  byEcon: new Map(villages.map(v => [v.econ, v])), zoneId: 'hanbando', warBodies: new Map(),
  db: { getWorldMeta: () => ({ data: JSON.stringify(input.meta) }) },
  warLive: { MU: { NPC_SAMPLE: 999 }, bindGroupUnit: () => {} } });
H._t1167Early();
const restored = H._t747Restore(); H._t1167Bind();
const w = war.WARS.find(w => w.id === 44); assert(w);
const rows = [], summary = [];
for (const v of villages) {
  const ps = v.npcPids.map(pid => players.get(pid));
  const coord = ps.every(p => p.x === originals.get(p.pid).x && p.y === originals.get(p.pid).y);
  assert(coord);
  const cnt = k => ps.filter(p => p[k]).length;
  const types = {};
  for (const p of ps) {
    types[p._muType] = (types[p._muType] || 0) + 1;
    rows.push([v.name, p.pid, p.x, p.y, p.npcHomeX, p.npcHomeY, p.simJob, p._muType || '',
      !!p._muster, !!p.simWar, p._bt, p._bside, !!p._bcmd, p.hp,
      Math.hypot(p.x-p.npcHomeX,p.y-p.npcHomeY), Math.hypot(p.x/32-v.ccx,p.y/32-v.ccy)]);
  }
  const before = { muster: cnt('_muster'), simWar: cnt('simWar'), eligible: ps.filter(p => !p._muster && p.hp > 0).length };
  const d = H._warDraftPids(v, { archer: 1 }, 1, w.id);
  summary.push({ village: v.name, physical: ps.length, muster: before.muster, simWar: before.simWar,
    dead: ps.filter(p => p.hp <= 0).length, sameCoordinates: coord,
    atHomeExact: ps.filter(p => p.x === p.npcHomeX && p.y === p.npcHomeY).length,
    battleLabels: cnt('_bt'), commanded: cnt('_bcmd'), types,
    eligible: before.eligible, draftReturnedNull: d === null,
    homeDistancePx: [Math.min(...ps.map(p=>Math.hypot(p.x-p.npcHomeX,p.y-p.npcHomeY))),Math.max(...ps.map(p=>Math.hypot(p.x-p.npcHomeX,p.y-p.npcHomeY)))],
  });
}
assert.equal(summary[1].physical, 146); assert.equal(summary[1].muster,146); assert(summary[1].draftReturnedNull);
fs.writeFileSync(path.join(out,'restored-bodies.csv'), 'village,pid,x,y,homeX,homeY,job,unitType,muster,simWar,battleType,side,commanded,hp,homeDistancePx,centerDistanceCell\n'+rows.map(r=>r.join(',')).join('\n')+'\n');
fs.writeFileSync(path.join(out,'restore.json'), JSON.stringify({ scope: 'actual restore gates on extracted checkpoint rows; no running zone', restored, pref: H._t1167Pref.get(44).size, summary },null,2)+'\n');
log('actual restore: 146/146 at saved coordinates; defense draft null; CSV written');
