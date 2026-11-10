'use strict';

// T1248: indexed trajectories, rather than a per-frame walk over parked bodies.
// Every segment's cells are registered once. A delayed query still finds the
// body, then the caller materializes its analytical position at query time.
class BodyIndex {
  constructor(resolve, cellSize = 128, maxCells = 4096) {
    this.resolve = resolve; this.cellSize = cellSize; this.maxCells = maxCells;
    this.cells = new Map(); this.actors = new Map();
  }
  _key(x, y) { return x + ',' + y; }
  park(actor, state) {
    const keys = new Set(), add = (ax, ay, bx, by) => {
      if (![ax, ay, bx, by].every(Number.isFinite)) return false;
      const s = this.cellSize, x0 = Math.floor(Math.min(ax, bx) / s), x1 = Math.floor(Math.max(ax, bx) / s), y0 = Math.floor(Math.min(ay, by) / s), y1 = Math.floor(Math.max(ay, by) / s);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.maxCells) return false;
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) { keys.add(this._key(x, y)); if (keys.size > this.maxCells) return false; }
      return true;
    };
    const r = state.r;
    if (r) { if(r.X.length<2)return false;for (let i = 1; i < r.X.length; i++) if (!add(r.X[i - 1], r.Y[i - 1], r.X[i], r.Y[i])) return false; }
    else if (!add(actor.x, actor.y, actor.x, actor.y)) return false;
    this.remove(actor.pid);
    this.actors.set(actor.pid, { actor, state, keys });
    for (const key of keys) { let c = this.cells.get(key); if (!c) this.cells.set(key, c = new Set()); c.add(actor.pid); }
    return true;
  }
  remove(id) {
    const e = this.actors.get(id); if (!e) return;
    for (const k of e.keys) { const c = this.cells.get(k); if (c) { c.delete(id); if (!c.size) this.cells.delete(k); } }
    this.actors.delete(id);
  }
  queryRect(x, y, w, h, now) {
    if(![x,y,w,h,now].every(Number.isFinite)||w<0||h<0)return [];
    const ids = new Set(), s = this.cellSize;
    const x0=Math.floor(x/s),x1=Math.floor((x+w)/s),y0=Math.floor(y/s),y1=Math.floor((y+h)/s);
    if((x1-x0+1)*(y1-y0+1)>this.cells.size*4+64)for(const id of this.actors.keys())ids.add(id);
    else for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const c = this.cells.get(this._key(cx, cy)); if (c) for (const id of c) ids.add(id);
    }
    const out = [];
    for (const id of ids) { const e = this.actors.get(id); if (!e) continue; const p = this.resolve(e.actor, e.state, now); if (p && p.x >= x && p.x < x + w && p.y >= y && p.y < y + h) out.push(p); }
    return out;
  }
  queryCircle(x, y, radius, now) {
    const r2 = radius * radius;
    return this.queryRect(x - radius, y - radius, radius * 2, radius * 2, now).filter(p => (p.x - x) ** 2 + (p.y - y) ** 2 <= r2);
  }
  attach(tree, clock) {
    if (!tree || tree._desBodyIndex === this) return;
    const rect = tree.queryRect.bind(tree), index = this;
    tree.queryRect = function (x, y, w, h, out = []) {
      rect(x, y, w, h, out); const seen = new Set(out);
      for (const p of index.queryRect(x, y, w, h, clock())) if (!seen.has(p)) { out.push(p); seen.add(p); }
      return out;
    };
    // queryCircle calls queryRect and therefore uses the same exact positions.
    tree.queryCircleScratch = function (x, y, r) { return this.queryCircle(x, y, r); };
    tree._desBodyIndex = this;
  }
}

// The existing ordinary NPC gauge rule is also used at a DES catch-up.
// T1197 bodies with individual, nonzero survival are deliberately unsupported:
// their ordinary tick path remains authoritative, including threshold timing.
function npcGaugeStep(p, now, visible, services) {
  if (!(services.bodyOn && p.simVillageId != null && services.bodyStep && services.bodyStep(p, now, visible))) p.hunger = services.hungerMax;
  p.thirst = services.thirstMax;
}
function survivalPlan(p, now, visible, services) {
  if (!p.isNpc || p.simVillageId == null || p.canadiaVillage) return { ok: false, reason: 'non-village-survival' };
  if (visible || services.bodyOn) return { ok: false, reason: 'nonzero-survival-needs-tick-thresholds' };
  return { ok: true, kind: 'canonical-npc-exemption', at: now, elapsedMs: 0 };
}
function survivalAdvance(p, plan, now, services) {
  if (!plan || !plan.ok || plan.kind !== 'canonical-npc-exemption') throw new Error('unsupported DES survival');
  if (now < plan.at) throw new Error('survival clock went backwards');
  npcGaugeStep(p, now, false, services);
  plan.elapsedMs += now - plan.at; plan.at = now;
  // All four body axes follow the ordinary exempt-NPC branch: hunger/thirst
  // normalize, cold/fatigue are unchanged. Their rate is zero, so there is no
  // future threshold; nonzero-rate regimes are rejected by survivalPlan.
  return Infinity;
}

module.exports = { BodyIndex, npcGaugeStep, survivalPlan, survivalAdvance };
