'use strict';
// T1259: T1251 관측을 보완하는 실제 나무꾼 이동거리. 제품 상태를 쓰지 않는다.
// NODE_OPTIONS="-r .../t745-vclock.js -r .../t1259-walk-observe.js"
// 하루 경계는 운영 dayMs; 모든 존 틱에서 연속 좌표 표본의 거리를 합한다.
if (!process.env.T577_SEED || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), V = require(path.join(ROOT, 'server/villages'));
const OUT = process.env.T1259_WALK_OUT || process.env.T577_OUT + '.t1259-walk.json';
const previous = new Map(), rows = new Map();
let state, frames = 0, error = null, lastDay = -1;
const original = V.onGameTick;
function save() {
  const W = require(path.join(ROOT, 'server/zone-config')).WORLD;
  fs.writeFileSync(OUT, JSON.stringify({ seed: process.env.T577_SEED, frames, error,
    dayMs: state && state.dayMs, productionDayMs: W.dayLengthMs,
    moveSpeed: state && state.deps.moveSpeed, dayPhaseRatio: state && state.deps.dayPhaseRatio,
    note: 'Actual adjacent tick coordinate chords, per runtime body and global 24-minute day; no job forcing. Role changes/partial days have incomplete observedMs. All finite displacement is included, including canonical road acceleration. maxStepPx and fasterThanBaseFrames allow inspection; the base-speed comparison does not remove distance.',
    rows: [...rows.values()] }));
}
V.onGameTick = function () {
  const result = original.apply(this, arguments);
  try {
    state = state || V.__p3Bind({}).state;
    if (!state || !state.deps.players || !state.dayMs) return result;
    frames++;
    const now = Date.now(), day = Math.floor((now - state.epoch) / state.dayMs);
    const speed = state.deps.moveSpeed || 0;
    for (const p of state.deps.players.values()) {
      if (!p.isNpc || !p.simVillageId) continue;
      const old = previous.get(p.pid);
      if (p.simJob === 'lumberjack' && old && old.job === p.simJob && old.day === day) {
        const dt = now - old.at;
        if (dt > 0) {
          const key = day + ':' + p.pid;
          let row = rows.get(key);
          if (!row) { row = { day, pid: p.pid, village: p.simVillageId, distancePx: 0, movingMs: 0, observedMs: 0, samples: 0, nonfinite: 0, fasterThanBaseFrames: 0, maxStepPx: 0 }; rows.set(key, row); }
          const distance = Math.hypot(p.x - old.x, p.y - old.y);
          row.observedMs += dt; row.samples++;
          // Base speed is not a bound: canonical roads can accelerate a walking body.
          const clockUlp = Number.EPSILON * Math.max(Math.abs(now), Math.abs(old.at)) * 16;
          const positionUlp = Number.EPSILON * Math.max(Math.abs(p.x), Math.abs(p.y)) * 16;
          if (Number.isFinite(distance)) {
            row.maxStepPx = Math.max(row.maxStepPx, distance);
            row.distancePx += distance;
            if (distance > 0) row.movingMs += dt;
            if (distance > speed * (dt + clockUlp) / 1000 + positionUlp) row.fasterThanBaseFrames++;
          } else row.nonfinite++;
        }
      }
      previous.set(p.pid, { at: now, day, job: p.simJob, x: p.x, y: p.y });
    }
    if (day !== lastDay) { lastDay = day; save(); }
  } catch (e) { error = String(e.stack || e); }
  return result;
};
process.on('exit', () => { try { save(); } catch (e) {} });
