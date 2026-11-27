'use strict';
// Small native orchestration fixture, not a reconstructed historical W44 world.
const V = require('../server/villages'), Core = require('../sim/war-core'), WL = require('../server/war-live'), Battle = require('../sim/battle-core'), Econ = require('../sim/economy-sim');
function create(seed = 42, opts = {}) {
  let next = opts.next || 1, now = opts.saved ? opts.saved.now : 400 * 30000 + 1, H;
  const rng = WL._muRng(seed), old = Math.random; Math.random = rng;
  let villages;
  try {
    villages = [1, 2].map((id) => {
      let e = Econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: id === 1 ? 24 : 18, name: 'snap' + id });
      e.storage.food = 10000; e.storage.weapon = 100; e.storage.armor = 50; e.storage.stone = 1000;
      if (opts.saved) e = V.__p3Bind({}).restoreEcon(opts.saved.econs[id - 1], Econ);
      return { dbId: id, name: 'snap' + id, ccx: 100 + (id - 1) * 160, ccy: 100, econ: e, npcPids: [], housesPx: [] };
    });
  } finally { Math.random = old; }
  const players = new Map(), npcs = new Set(), events = [];
  const deps = { players, npcs, broadcast: (m) => events.push(m), anyViewerNear: () => true, isPositionActive: () => true,
    isBlockedByWall: () => false, isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, tickHz: 30, moveSpeed: 64,
    spawnNpc: (o) => { const p = { pid: 'p' + next++, x: o.x, y: o.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, inventory: {}, simJob: 'warrior' }; players.set(p.pid, p); npcs.add(p.pid); return p; },
    setHp: require('./lib-hp-door').makeSetHp((m) => events.push(m)), t1372Pid: { get: () => next, set: (n) => { next = Math.max(next, n); } } };
  const world = { day: opts.saved ? opts.saved.day : 400, seed, _warWars: [], _warTributes: [], _warSeq: 1, villages: villages.map((v) => v.econ), caravans: [] };
  const war = Core.createWar({ villages, world, seed, infoRange: 5000, centerOf: (v) => ({ cx: v.ccx, cy: v.ccy }), territoryOf: () => 2800,
    onEngage: (w, d, why) => H._warEngage(w, d, why), rationEat: (w, d) => H._warRationEat(w, d), rationCollect: (w) => H._warRationCollect(w), lootCarry: (w, items, kind) => H._warLootAccept(w, items, kind) });
  const db = { getVillageStructRows: () => [] };
  H = V.__p3Bind({ ready: true, zoneId: 'war-snap-fixture', deps, villages, byDbId: new Map(villages.map((v) => [v.dbId, v])), byEcon: new Map(villages.map((v) => [v.econ, v])),
    world, war, warCore: Core, warBodies: new Map(), caravanBodies: new Map(), bodyExits: new Map(), db, pathfind: require('../server/pathfind'),
    routeCache: new Map(), _route: null, _distCtx: null, roads: null, epoch: 0, dayMs: 30000, lastGameDay: 400,
    _warTickAt: null, _bxTickAt: null, _warRects: null, _warRectCells: null, _warRectAt: null, _warTerrMemo: null, _warTreeMemo: null, _warWaterMemo: null,
    _t1381G: null, _t1349: null, _t1330Path: null, _warNoCollide: true, _warThreatBuf: null,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 },
    _warPerf: { ring: new Array(3000).fill(0), i: 0, n: 0, max: 0, soldiers: 0, soldiersMax: 0, fighting: 0 } });
  const live = WL.createWarLive({ BC: Battle, dayOf: () => world.day, cellPx: 32, pxPerM: 32, tickHz: 30, blockedCell: (x, y) => H._warBlockedCell(x, y),
    resolveBattle: (w, d, pre) => war.warResolveBattle(w, d, pre), arrowOut: deps.broadcast, arrowNear: () => true });
  H.state.warLive = live;
  const oldNow = Date.now; Date.now = () => now;
  try { for (const v of villages) H.syncVillagePop(v, Infinity); H._warBuildRectIndex(); } finally { Date.now = oldNow; }
  function at(fn) { const prev = Date.now; Date.now = () => now; try { return fn(); } finally { Date.now = prev; } }
  function tick() { return at(() => { now += 1000 / 30; H.tickWarBodies(now); }); }
  function day() { return at(() => { const before = war.stats().surrender || 0; H._t681Flush(); world.day++; now = world.day * 30000 + 1; war.daily(world.day); H._warAfterDaily(before); H._t681Day(now); }); }
  function mobilize(policy = 'assault') {
    return at(() => {
      const a = villages[0], d = villages[1];
      for (const v of villages) { v.econ.counts = {}; for (let i = 0; i < v.econ.npcs.length; i++) { const n = v.econ.npcs[i], job = v.dbId === 1 ? (i % 2 ? 'hunter' : 'warrior') : (i < 3 ? 'hunter' : 'farmer'); n.currentJob = job; v.econ.counts[job] = (v.econ.counts[job] || 0) + 1; } }
      if (!war.warMobilize(a, d, 'feud', 160, world.day)) throw new Error('fixture mobilize failed');
      const w = war.WARS[war.WARS.length - 1]; w._opPolicy = policy; d._defPolicy = opts.hold ? 'hold' : 'respond'; return w;
    });
  }
  return { H, world, war, live, villages, deps, events, tick, day, at, mobilize, now: () => now, setNow: (t) => { now = t; } };
}
module.exports = { create };
