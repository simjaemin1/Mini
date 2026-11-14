'use strict';
// T1302: clearing time belongs to a body standing at the cell. Harvested cargo
// remains in that body's inventory until it walks back to the granary.
function step(npc, task, c) {
  let s = npc._t1302Terr;
  if (!task && !s) return false;
  if (!s) s = npc._t1302Terr = { key: task.key, at: null, last: null, cargo: {}, source: task.source, sourceVillageId: task.sourceVillageId };
  for(const k of Object.keys(s.cargo))s.cargo[k]=Math.min(s.cargo[k],Math.max(0,npc.inventory?.[k]||0));
  const cancelled = !task || s.key !== task.key;
  const carrying = () => Object.values(s.cargo).some(n => n > 1e-9);
  if (!cancelled && s.cleared) return false;
  if (!c.awake) { s.at = s.last = null; c.home(); return true; }
  if (cancelled && !carrying()) { npc._t1302Terr = undefined; return task ? step(npc,task,c) : false; }
  const returning = carrying();
  const goal = returning ? s.source : task.target;
  c.move(goal, returning ? '운반' : '출근');
  if (!Number.isFinite(npc.x) || !Number.isFinite(npc.y) || Math.hypot(npc.x-goal.x, npc.y-goal.y) > c.reach) { s.at = s.last = null; return true; }
  if (returning) {
    c.act('저장');
    if (s.at == null || c.now-s.at > c.maxGap+c.storeMs) s.at=c.now;
    if (c.now-s.at < c.storeMs) return true;
    c.deposit(s.cargo,s.sourceVillageId); s.at=s.last=null;
    if (cancelled && !carrying()) npc._t1302Terr=undefined;
    return true;
  }
  if (task.site.workMs < c.laborMs(task.site)) {
    c.act('개간');
    if (s.last != null) task.site.workMs += Math.max(0,Math.min(c.now-s.last,c.maxGap));
    s.last=c.now; s.at=null;
    return true;
  }
  s.last=null;
  if (c.hasTrees(task.site)) {
    c.act('벌목');
    if (s.at == null || c.now-s.at > c.maxGap+c.swingMs) s.at=c.now;
    if (c.now-s.at < c.swingMs) return true;
    const loot=c.cut(task.site); s.at=null;
    if (loot) npc.inventory=npc.inventory||{};
    if (loot) for (const [k,n] of Object.entries(loot)) if (n>0) {
      npc.inventory[k]=(npc.inventory[k]||0)+n; s.cargo[k]=(s.cargo[k]||0)+n;
    }
    return true;
  }
  // Clearing and all its return trips finished. Existing build-haul now carries
  // stakes from the granary and places them at this same cell.
  c.clearRemainder(task.site);
  s.cleared=true;
  return false;
}
module.exports={step};
