'use strict';
// T1295 관찰기 — 판 자에서 농부 몸 하루: 틱 수 · 걸은 px · 밭 칸 배정 거리 · 몸이 한 밭 일(건수 · 게임분) · 읽기만
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const OUT = process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1295.json' : '';
if (!OUT) return;
const ROOT = path.join(__dirname, '..', '..', '..');
const Module = require('module'); const _comp = Module.prototype._compile; const ZONE = path.join(ROOT, 'server', 'zone.js'); let wrapped = false;
Module.prototype._compile = function (content, filename) {
  if (filename === ZONE && !wrapped) { const H = 'function npcStep(npc, dt, now) {'; const i = content.indexOf(H);
    if (i >= 0) { content = content.slice(0, i) + 'function npcStep(npc, dt, now) { return global.__t1295 ? global.__t1295(npc, dt, now, __t1295Inner) : __t1295Inner(npc, dt, now); }\nfunction __t1295Inner(npc, dt, now) {' + content.slice(i + H.length); wrapped = true; } }
  return _comp.call(this, content, filename);
};
let VIL = null; const rec = { days: [], wrapped: false };
let cur = null, curD = -1; const LAST = new Map();
function flush() { if (cur) rec.days.push(cur); try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }
global.__t1295 = function (npc, dt, now, inner) {
  if (!VIL) VIL = require(path.join(ROOT, 'server', 'villages'));
  const B = VIL.__p3Bind({}); const d = B.state.world ? B.state.world.day : -1;
  if (d !== curD) { if (cur) { const S = B._t1221Stat; cur.bodyS1 = S.bodyS; cur.cut = B._t1243Stat && B._t1243Stat.cutDays; const PS = B._t1243PStat || {}; cur.pick = PS.pick; cur.reaped = PS.reaped; cur.clrB = B._t1243CStat && B._t1243CStat.bodyCells; const W = VIL._t1295Stat; if (W) { cur.walks = W.walks; cur.walkPx = W.walkPx; } } flush(); curD = d; cur = { d, steps: 0, fSteps: 0, fBodies: new Set(), fPx: 0, assign: 0, assignPx: 0, farmK: 0, dwell: 0, labels: {}, dtSum: 0, bodyS0: B._t1221Stat.bodyS, nowMs0: now }; }
  const isF = npc.simJob === 'farmer' && npc.simVillageId != null;
  const x0 = npc.x, y0 = npc.y, k0 = npc._farmK; const lp = LAST.get(npc.pid); if (isF && lp) cur.fPx += Math.hypot(npc.x - lp[0], npc.y - lp[1]);
  const r = inner(npc, dt, now);
  cur.steps++; cur.nowMs1 = now;
  if (isF) { if (cur.s == null) { cur.s = VIL.t1295S ? VIL.t1295S(npc) : "none"; cur.dbg = [npc.simJob, !!npc.simVillageId, B.state.dayMs, !!(B.state.deps && B.state.deps.zoneAwake), process.env.T1243_FARM_ON]; } cur.fSteps++; cur.fBodies.add(npc.pid); LAST.set(npc.pid, [npc.x, npc.y]); cur.dtSum += dt;
    const a = npc._lifeAct || ''; cur.labels[a] = (cur.labels[a] || 0) + 1;
    if (npc._farmK) cur.farmK++; if (npc._jobT && now < npc._jobT) cur.dwell++;
    if (npc._farmK && npc._farmK !== k0) { cur.assign++; const k = npc._farmK, ci = k.indexOf(','); cur.assignPx += Math.hypot(+k.slice(0, ci) * 32 + 16 - npc.x, +k.slice(ci + 1) * 32 + 16 - npc.y); } }
  return r;
};
const _f = flush; process.on('exit', () => { if (cur) for (const c of rec.days) if (c.fBodies instanceof Set) c.fBodies = c.fBodies.size; if (cur && cur.fBodies instanceof Set) cur.fBodies = cur.fBodies.size; rec.wrapped = wrapped; _f(); });
setInterval(() => { for (const c of rec.days) if (c.fBodies instanceof Set) c.fBodies = c.fBodies.size; try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (_) {} }, 20000).unref();
