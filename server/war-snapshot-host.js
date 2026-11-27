'use strict';
const Graph = require('./war-snapshot');
const PathCore = require('../sim/path-core');
const BC = require('./body-cols');
const Home = require('./home-population'), Granary = require('./granary-lots'), Lots = require('./lots');
const MEMORY = ['_warTickAt', '_bxTickAt', '_warRects', '_warRectCells', '_warRectAt', '_warTerrMemo', '_warTreeMemo', '_warWaterMemo', '_t1330Path', '_t1381G', '_t1349', '_t1338WalkLive', '_warNoCollide', '_warStat', '_warThreatOn', '_t1094St', 'bodyExits'];
const BODY_LOCAL = new Set(['ws', '_t1145S']);
const PID_KEYS = new Set(['pid', 'agent', '_warPid', 'ownerPid']);
function index(state) {
  const external = new Map(), objects = new Map(), tokens = new Map(), people = [];
  const add = (o, k) => { if (o && typeof o === 'object') { external.set(o, k); objects.set(k, o); } };
  add(state.world, 'world');
  for (const v of state.villages || []) {
    add(v, 'v:' + v.dbId); add(v.econ, 'e:' + v.dbId);
    for (const n of v.econ && v.econ.npcs || []) add(n, 'n:' + v.dbId + ':' + n.id);
    for (let i = 0; i < (v.npcPids || []).length; i++) {
      const pid = v.npcPids[i], p = state.deps.players.get(pid), key = 'p:' + v.dbId + ':' + i;
      if (!p) Graph.fail('missing village body at slot ' + key);
      tokens.set(pid, key); if (p) { add(p, key); people.push([key, p]); }
    }
  }
  for (const [pid] of state.bodyExits || []) {
    const p = state.deps.players.get(pid); if (!p || external.has(p)) continue;
    const key = 'd:' + String(pid); tokens.set(pid, key); add(p, key); people.push([key, p]);
  }
  return { external, objects, tokens, people };
}
function pack(state, bindings, now) {
  if (!state.war || (!state.war.WARS.length && !(state.warBodies && state.warBodies.size))) return null;
  if (bindings.busy()) Graph.fail('save inside unfinished war host step');
  const idx = index(state), pidMaps = new Set(), pidArrays = new Set(), special = new Map();
  const registerPid = (pid) => {
    if (pid == null || idx.tokens.has(pid)) return;
    if (state.deps.players.has(pid)) Graph.fail('unsupported non-village combatant ' + pid);
    idx.tokens.set(pid, 'gone:' + String(pid));
  };
  const pidMap = (m) => { if (m instanceof Map) { pidMaps.add(m); for (const k of m.keys()) registerPid(k); } };
  const pidArray = (a) => { if (Array.isArray(a)) { pidArrays.add(a); for (const k of a) registerPid(k); } };
  for (const w of state.war.WARS) {
    if (!w.atk || !w.def || w.atk._den || w.def._den || w.atk._xz || w.def._xz) Graph.fail('unsupported den/cross-zone war');
    for (const k of ['_armsPack', '_starve', '_debt']) pidMap(w[k]);
  }
  for (const b of state.warBodies.values()) {
    pidArray(b.pids); pidArray(b.defPids);
    for (const g of [b.atkGroup, b.defGroup, b.retGroup]) if (g) {
      for (const u of g.units || []) registerPid(u.pid);
      if (g.detour) special.set(g.detour, { type: 'detour', data: { body: b, walk: !!g.detour.walk } });
    }
    const f = b.fight; if (!f) continue;
    pidMap(f.byPid);
    if (!f.ctx.rng || typeof f.ctx.rng.getState !== 'function') Graph.fail('unregistered battle RNG');
    special.set(f, { type: 'fight', data: Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'handle')) });
    special.get(f).data.$rng = f.ctx.rng.getState();
    special.set(f.ctx, { type: 'context', data: Object.fromEntries(Object.entries(f.ctx).filter(([k]) => !['rng', 'world', 'onArrow'].includes(k))) });
  }
  pidMap(state.bodyExits);
  for (const m of bindings.pref.values()) pidMap(m);
  // All village bodies are captured: reserves and prisoners affect the next muster too.
  const records = idx.people.map(([key, p]) => [key, Object.fromEntries(Object.keys(p).filter((k) => !BODY_LOCAL.has(k)).map((k) => [k, p[k]])), state.deps.npcs.has(p.pid), Home.warResidentOf(p), Granary.snapshotBody(p), Lots.snapshotNpc(p)]);
  const village = (state.villages || []).map((v) => [v, Object.fromEntries(Object.keys(v).filter((k) => /^_(war|siege|def)/.test(k)).map((k) => [k, v[k]]))]);
  const root = { profile: bindings.profile(), day: state.world.day, at: now, records, village, wars: state.war.WARS, bodies: state.warBodies,
    memory: Object.fromEntries(MEMORY.map((k) => [k, state[k]])), stand: bindings.stand, route: bindings.route,
    econPids: (state.villages || []).flatMap((v) => (v.econ.npcs || []).filter((n) => n._warPid != null).map((n) => [n, { _warPid: n._warPid }])),
    world: { seq: state.world._warSeq, stats: state.world._warStats, capTransit: state.world._capTransit, tributes: state.world._warTributes },
    bodyIds: idx.people.map(([key, p]) => [key, p.pid]),
    nextPid: state.deps.t1372Pid && state.deps.t1372Pid.get(),
    playerOrder: [...state.deps.players.keys()].map((p) => idx.tokens.get(p) || ('other:' + p)),
    npcOrder: [...state.deps.npcs.keys()].map((p) => idx.tokens.get(p) || ('other:' + p)),
    polySeq: bindings.polySeq(), pref: bindings.pref, runtime: state.warLive.snapshotRuntime(), pidTokens: [...idx.tokens.values()] };
  const atom = (v, parent, key) => {
    if (typeof v === 'number' && v > 1e12 && Math.abs(v - now) < 3.2e10 && !(parent === root && key === 'at')) return { t: v - now };
    if ((PID_KEYS.has(key) || pidArrays.has(parent) || (pidMaps.has(parent) && key === '$key')) && idx.tokens.has(v)) return { p: idx.tokens.get(v) };
  };
  return Graph.pack(root, { external: idx.external, atom, project: (o) => {
    if (special.has(o)) return special.get(o);
    if (o && o.open && typeof o.H === 'function' && 'maxPops' in o) return { type: 'path', data: PathCore.snapshotState(o) };
    return null;
  } });
}
// Boot the exact saved entities before legacy spawning/caps. No spawn or RNG call.
function prepareBodies(snapshot, state) {
  Graph.validate(snapshot);
  const ns = snapshot.graph.nodes;
  const field = (ref, key) => { const n = ref && ns[ref.r]; return n && Array.isArray(n.v) ? (n.v.find(([k]) => k === key) || [])[1] : undefined; };
  const list = (ref) => { const n = ref && ns[ref.r]; if (!n || n.t !== 'array') Graph.fail('missing body identity manifest'); return n.v.map(([, v]) => v); };
  const ids = new Map();
  const manifest = field(snapshot.graph.root, 'bodyIds');
  if (manifest) for (const ref of list(manifest)) {
    const pair = list(ref), key = pair[0], value = pair[1];
    if (typeof key !== 'string' || typeof value !== 'string' || ids.has(key)) Graph.fail('invalid body identity manifest');
    ids.set(key, value);
  }
  // Compatibility with initial v1 checkpoints whose canonical body rows already carry pid.
  if (!manifest) for (const v of state.villages) {
    const B = v.econ && v.econ._t747Body;
    for (let i = 0; B && i < (B.rows || []).length; i++) if (B.rows[i] && typeof B.rows[i].$p === 'string') ids.set('p:' + v.dbId + ':' + i, B.rows[i].$p);
  }
  const idx = index(state), placeholders = new Map(), oldIds = new Set(), playerMap = state.deps.players;
  const pid = (key) => { const value = ids.get(key); if (value !== undefined) return value; if (key.startsWith('gone:') || key.startsWith('d:')) return key.slice(key.indexOf(':') + 1); Graph.fail('missing body identity ' + key); };
  const resolve = (key) => {
    if (idx.objects.has(key)) return idx.objects.get(key);
    if (/^(p:|d:)/.test(key)) { if (!placeholders.has(key)) placeholders.set(key, { pid: pid(key) }); return placeholders.get(key); }
  };
  const root = Graph.unpack(snapshot, { resolve, pid, time: (dt) => Date.now() + dt, types: ['path', 'fight', 'context', 'detour'] });
  if (root.day !== state.world.day || !Array.isArray(root.records) || !state.deps.t1372Pid) Graph.fail('unsupported boot body/allocator boundary');
  const byVillage = new Map(), bodies = [];
  for (const [key, data, npc] of root.records) {
    if (!/^p:/.test(key)) continue;
    const match = /^p:([^:]+):([0-9]+)$/.exec(key), v = match && state.byDbId.get(+match[1]), i = match && +match[2], id = pid(key);
    if (!v || !Number.isFinite(data.x) || !Number.isFinite(data.y) || data.pid !== id || oldIds.has(id) || playerMap.has(id)) Graph.fail('conflicting saved body identity');
    oldIds.add(id); if (!byVillage.has(v)) byVillage.set(v, []); const slots = byVillage.get(v);
    if (slots[i] !== undefined) Graph.fail('duplicate saved body slot'); slots[i] = id;
    const p = resolve(key); for (const k of Object.keys(data)) p[k] = data[k]; p._t1145S = -1;
    bodies.push([p, npc]);
  }
  for (const slots of byVillage.values()) for (let i = 0; i < slots.length; i++) if (slots[i] === undefined) Graph.fail('non-contiguous saved body slots');
  for (const [v, slots] of byVillage) v.npcPids = slots;
  for (const [p, npc] of bodies) { playerMap.set(p.pid, p); BC.w(p, p.x, p.y); if (npc) state.deps.npcs.add(p.pid); else state.deps.npcs.delete(p.pid); }
  if (Number.isFinite(root.nextPid)) state.deps.t1372Pid.set(root.nextPid);
  return bodies.length;
}

function restore(snapshot, state, bindings, now) {
  const idx = index(state), pidByToken = new Map(), created = [], paths = [], fights = [], detours = [];
  for (const [pid, token] of idx.tokens) pidByToken.set(token, pid);
  let next = state.deps.t1372Pid ? state.deps.t1372Pid.get() : 1;
  const used = new Set(state.deps.players.keys());
  function pid(token) {
    if (pidByToken.has(token)) return pidByToken.get(token);
    if (!/^(d:|gone:)/.test(token)) Graph.fail('missing saved body slot ' + token);
    let p = token.slice(token.indexOf(':') + 1); if (!/^p[0-9]+$/.test(p) || used.has(p)) do { p = 'p' + next++; } while (used.has(p)); used.add(p); pidByToken.set(token, p); return p;
  }
  function resolve(key) {
    if (idx.objects.has(key)) return idx.objects.get(key);
    if (key.startsWith('d:')) { const p = { pid: pid(key), _t1145S: -1 }; idx.objects.set(key, p); created.push(p); return p; }
  }
  const root = Graph.unpack(snapshot, { resolve, pid, time: (offset) => now + offset, types: ['path', 'fight', 'context', 'detour'], revive: (o, type) => {
    if (type === 'path') paths.push(o); if (type === 'fight') fights.push(o); if (type === 'detour') detours.push(o);
  } });
  if (JSON.stringify(root.profile) !== JSON.stringify(bindings.profile())) Graph.fail('incompatible war runtime profile');
  if (root.day !== state.world.day || !Array.isArray(root.wars) || !(root.bodies instanceof Map) || !Array.isArray(root.records) || !root.runtime || (!Number.isSafeInteger(root.runtime.arrowSeq) || root.runtime.arrowSeq < 0)) Graph.fail('inconsistent world boundary');
  if (!(root.stand && root.stand.m instanceof Map) || !(root.route instanceof Map) || !(root.pref instanceof Map) || !Array.isArray(root.pidTokens) || !root.world || !Array.isArray(root.econPids)) Graph.fail('missing shared state');
  for (const w of root.wars) if (!w || !idx.external.has(w.atk) || !idx.external.has(w.def) || !w.atk.econ || !w.def.econ) Graph.fail('missing attacker/defender');
  const recordKeys = new Set(root.records.map((r) => r && r[0]));
  if (recordKeys.size !== root.records.length || !Array.isArray(root.playerOrder) || !Array.isArray(root.npcOrder)) Graph.fail('incomplete body/order manifest');
  for (const token of root.pidTokens) {
    if (typeof token !== 'string' || /^(p:|d:)/.test(token) && !recordKeys.has(token)) Graph.fail('missing saved body record');
    pid(token);
  }
  for (const [key] of idx.people) if (!recordKeys.has(key)) Graph.fail('unexpected village body at restore');
  // Validate the entire graph and bindings before changing any host data.
  for (const [key, data] of root.records) {
    const p = resolve(key); if (!p || data.pid !== p.pid || !Number.isFinite(data.x) || !Number.isFinite(data.y)) Graph.fail('invalid body identity/position ' + key);
  }
  const wars = new Set(root.wars);
  for (const [id, b] of root.bodies) {
    if (!b.w || b.w.id !== id || !wars.has(b.w) && !b.ended && b.phase !== 'return') Graph.fail('orphan war body');
    if (b.instantiated && b.phase !== 'return' && !b.noArmy && !b.fight) Graph.fail('missing instantiated fight context');
    for (const g of [b.atkGroup, b.defGroup, b.retGroup]) if (g) {
      if (!Array.isArray(g.units) || g.commander && !g.units.includes(g.commander)) Graph.fail('invalid formation');
      for (const u of g.units) if (u._bound && !state.deps.players.has(u.pid) && !created.some((p) => p.pid === u.pid) && !u.dead && !(u.bu && u.bu.hp <= 0)) Graph.fail('missing live soldier');
    }
    if (b.fight) {
      const f = b.fight; if (!fights.includes(f) || f.w !== b.w || !f.ctx || !Array.isArray(f.ctx.units) || !Array.isArray(f.ctx.arrows) || !(f.byPid instanceof Map) || !Number.isInteger(f.$rng)) Graph.fail('incomplete fight');
      if (!f.ctx.sides || !f.ctx.sides.A || !f.ctx.sides.B || f.$rng < 0 || f.$rng > 4294967295 || !Number.isFinite(f.t)) Graph.fail('incomplete battle state');
      for (const u of f.ctx.units) if (!Number.isFinite(u.cd) || !Number.isFinite(u.hp) || !Number.isFinite(u.mrl)) Graph.fail('incomplete soldier state');
      for (const ar of f.ctx.arrows) if (!ar || !['x', 'y', 'vx', 'vy', 'trav', 'range', 'dmg'].every((k) => Number.isFinite(ar[k])) || !f.ctx.units.includes(ar.sh)) Graph.fail('incomplete projectile');
      for (const u of f.ctx.units) if (u.gu && u.gu.bu !== u) Graph.fail('broken unit alias');
    }
  }
  for (const S of paths) PathCore.resumeState(S, { blocked: bindings.blocked });
  // No draw or gameplay callback runs below: existing entities and accessors are reattached.
  for (const p of created) state.deps.players.set(p.pid, p);
  bindings.clearPending(new Set(root.records.map(([key]) => resolve(key))));
  for (const [key, data, npc, resident, bag, lots] of root.records) {
    const p = resolve(key);
    for (const k of Object.keys(p)) if (!BODY_LOCAL.has(k)) delete p[k];
    for (const k of Object.keys(data)) p[k] = data[k];
    BC.w(p, data.x, data.y);
    if (npc) state.deps.npcs.add(p.pid); else state.deps.npcs.delete(p.pid);
    Home.bindWarBody(p, resident); Granary.restoreBodySnapshot(p, bag); Lots.restoreNpcSnapshot(p, lots);
  }
  for (const [v, data] of root.village) { for (const k of Object.keys(v)) if (/^_(war|siege|def)/.test(k) && !(k in data)) delete v[k]; Object.assign(v, data); }
  for (const [n, data] of root.econPids) n._warPid = data._warPid;
  state.world._warSeq = root.world.seq; state.world._warStats = root.world.stats; state.world._capTransit = root.world.capTransit;
  state.world._warTributes.splice(0, state.world._warTributes.length, ...(root.world.tributes || []));
  state.war.WARS.splice(0, state.war.WARS.length, ...root.wars);
  state.warBodies = root.bodies;
  Object.assign(state, root.memory);
  bindings.setStand(root.stand); bindings.setRoute(root.route); bindings.setPref(root.pref); bindings.polySeq(root.polySeq);
  state.warLive.snapshotRuntime(root.runtime);
  for (const d of detours) {
    const fn = bindings.detour(d.body, d.walk);
    for (const b of root.bodies.values()) for (const g of [b.atkGroup, b.defGroup, b.retGroup]) if (g && g.detour === d) g.detour = fn;
  }
  for (const b of root.bodies.values()) {
    for (const g of [b.atkGroup, b.defGroup, b.retGroup]) if (g) for (const u of g.units) { const p = state.deps.players.get(u.pid); if (p && u._bound) state.warLive.resumeUnit(u, p, true); }
    if (b.fight) {
      const f = b.fight, rng = f.$rng; delete f.$rng;
      f.ctx.world = bindings.world(f); state.warLive.resumeFight(f, rng);
      for (const u of f.ctx.units) { const p = state.deps.players.get(u.agent); if (p) state.warLive.resumeUnit(u, p, false); }
    }
  }
  const orderId = (token) => token.startsWith('other:') ? token.slice(6) : pidByToken.get(token);
  const ordered = new Map();
  for (const token of root.playerOrder) { const id = orderId(token); if (state.deps.players.has(id)) ordered.set(id, state.deps.players.get(id)); }
  for (const [id, p] of state.deps.players) if (!ordered.has(id)) ordered.set(id, p);
  // Keep body-column ownership: reorder the Map without allocating/releasing entities.
  Map.prototype.clear.call(state.deps.players); for (const [id, p] of ordered) Map.prototype.set.call(state.deps.players, id, p);
  const others = [...state.deps.npcs].filter((id) => !pidByToken.has(idx.tokens.get(id)));
  state.deps.npcs.clear(); for (const token of root.npcOrder) { const id = orderId(token); if (state.deps.players.has(id)) state.deps.npcs.add(id); } for (const id of others) state.deps.npcs.add(id);
  if (state.deps.t1372Pid) state.deps.t1372Pid.set(Math.max(next, root.nextPid || 0));
  return { wars: root.wars.length, bodies: root.bodies.size, players: root.records.length, searches: paths.length };
}
module.exports = { pack, restore, prepareBodies, MEMORY };
