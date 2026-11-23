'use strict';
// T1465: one physical-cell ledger per world. No village-owned stock copies.
// The optional host bridge addresses zone's existing player/NPC cell records.
const S = require('../server/specialty');
const W = require('../server/weights');
const curve = require('./ore-stock-curve.json');
const ON = process.env.T1465_ORE_STOCK === '1';
const hosts = new WeakMap();
const teams = new WeakMap();
function bindHost(world, host) { if (ON && world) hosts.set(world, host); }
function book(world) {
  return world._oreStock || (world._oreStock = { version: 1, cells: {} });
}
function read(world, cell) {
  const host = hosts.get(world);
  if (host) return host.read(cell.cx, cell.cy);
  const b = book(world), key = cell.key, day = world.day || 0;
  const r = b.cells[key];
  if (!r) return S.ORE_K; // untouched cells are full, including unclaimed veins
  if (day > r.day) { r.s = S.oreRegen(r.s, day - r.day); r.day = day; }
  return r.s;
}
function atStock(rows, fraction) {
  if (!(fraction >= 1 / S.ORE_K)) return 0; // canonical empty-cell threshold
  for (let i = 1; i < rows.length; i++) {
    if (fraction <= rows[i].fraction) {
      const a = rows[i - 1], b = rows[i];
      return a.relativeOutput + (b.relativeOutput - a.relativeOutput) *
        (fraction - a.fraction) / (b.fraction - a.fraction);
    }
  }
  return rows.at(-1).relativeOutput;
}
// Bilinear interpolation between measured stock/frontier samples; no fitted curve.
function response(fraction, frontier = 0) {
  const profiles = curve.profiles;
  for (let i = 1; i < profiles.length; i++) {
    if (frontier <= profiles[i].depletedPrefix) {
      const a = profiles[i-1], b = profiles[i],
        f = (frontier-a.depletedPrefix)/(b.depletedPrefix-a.depletedPrefix);
      return atStock(a.rows,fraction)*(1-f)+atStock(b.rows,fraction)*f;
    }
  }
  return atStock(profiles.at(-1).rows,fraction);
}
function miners(v) {
  const world = v._world, day = world.day || 0;
  let c = teams.get(v);
  if (!c || c.day !== day) {
    const list = (v.npcs || []).filter(n => n.currentJob === 'miner');
    c = { day, list, index: new Map(list.map((n, i) => [n, i])) };
    teams.set(v, c);
  }
  return c;
}
function plan(v, npc) {
  if (!ON || !v || !v._world) return null;
  const topology = v.land && v.land._oreStockCells;
  // Placer has no vein. A host/map must explicitly provide topology for veins.
  if (!topology) {
    if (v.land?.oreMix && !Object.keys(v.land.oreMix).length) return null; // explicit placer, no vein
    throw Error('T1465: canonical ore cell topology missing for ' + v.name);
  }
  const cells = topology.cells, world = v._world, m = miners(v);
  if (!cells.length && !Object.keys(v.land.oreMix || {}).length) return null;
  const count = Math.max(1, Math.ceil(m.list.length / topology.teamSize));
  const team = Math.floor((m.index.get(npc) || 0) / topology.teamSize) % count;
  for (let i = team; i < cells.length; i += count) {
    const cell = cells[i], stock = read(world, cell);
    if (stock >= 1) return { cell, response: response(stock / S.ORE_K, i / cells.length), mix: cell.mix };
  }
  return { cell: null, response: 0, mix: {} };
}
function forecast(v) { const p = plan(v); return p ? p.response : 1; }
function consume(v, p, units, npc) {
  if (!p) return units;
  if (!p.cell || !(units > 0)) return 0;
  const world = v._world, host = hosts.get(world);
  // Body hosts produce through mineToGranary; econ is strictly read-only.
  if (host && host.body(v)) return 0;
  const kg = W.kgOf('ore'), ck = S.mineChunkKg(npc?.skills?.mining || 0);
  const want = units * p.response * kg / ck;
  const stock = read(world, p.cell), got = Math.min(want, stock);
  if (host) return (host.consume(p.cell.cx, p.cell.cy, got) || 0) * ck / kg;
  const b = book(world);
  b.cells[p.cell.key] = { s: stock - got, day: world.day || 0 };
  return got * ck / kg;
}
module.exports = { ON, bindHost, read, response, plan, forecast, consume };
