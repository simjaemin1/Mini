'use strict';
// === scripts/t1473-observe.js — T1473 서버 판 곁 관찰기(읽기만 · 세계 무변 · T1417 관찰기 꼴) ===
//   쓰는 법: T1473_OBS=<폴더> T1473_ARM=<팔> NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js --make … --vclock
//   econ `tickVillage` 를 감싸(인자 · 돌려주는 값 그대로) 마을-날마다 센다: 사람 있는 마을-날 · 나무꾼 0 마을-날.
//   100날마다(와 판 끝): 인구 · 마을 · 빈 마을 · 굶어 죽음(`_fdDeadTot` 합) · 죽음 · 떠남 · 주거 합 · RSS 꼭대기 · 벽시계 초.
const path = require('path'), fs = require('fs');
const A1 = process.argv[1] || '';
if (!(process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1))) return;
const DIR = process.env.T1473_OBS; if (!DIR) return;
const ROOT = path.resolve(path.dirname(A1), '..');
const OUT = path.join(DIR, `obs-${process.env.T1473_ARM || 'x'}-${process.env.T577_SEED}.json`);
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const rec = { seed: +process.env.T577_SEED, arm: process.env.T1473_ARM || '?', snaps: [], lastDay: 0, rssMax: 0, vd: 0, lj0: 0, err: null };
const W0 = Date.now(); let last = -1, vdW = 0, ljW = 0, wallPrev = W0, dayPrev = 0;
const seenDay = new WeakMap();
function rss() { try { const r = process.memoryUsage().rss; if (r > rec.rssMax) rec.rssMax = r; } catch (e) {} }
function snap(day) {
  try {
    const VIL = require(path.join(ROOT, 'server', 'villages'));
    const P = VIL.__labProbe._t569Probe.setup();
    let pop = 0, vills = 0, empty = 0, fd = 0, emig = 0, dead = 0, hous = 0;
    for (const vil of (P.villages || [])) {
      const e = vil.econ; if (!e) continue; vills++;
      const n = (e.npcs || []).length; pop += n; if (n === 0) empty++;
      fd += e._fdDeadTot || 0; emig += e._emigTot || 0; dead += e._deadTot || 0; hous += +e.housing || 0;
    }
    rss();
    const now = Date.now();
    rec.snaps.push({ day, pop, vills, empty, fdDead: fd, dead, emig, housing: Math.round(hous), vd: vdW, lj0: ljW, rssMax: rec.rssMax,
      wall: Math.round((now - W0) / 1000), secPerDay: +(((now - wallPrev) / 1000) / Math.max(1, day - dayPrev)).toFixed(3) });
    wallPrev = now; dayPrev = day;
  } catch (e) { rec.err = rec.err || String(e && e.stack || e).slice(0, 400); }
  rec.vd = vdW; rec.lj0 = ljW;
  try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {}
}
const _t = V1.tickVillage;
V1.tickVillage = function (v, day) {
  if (day !== last) { if (last > 0 && last % 100 === 0) snap(last); last = day; rec.lastDay = day; rss(); }
  try {
    if (v && !v.founder && seenDay.get(v) !== day) {
      seenDay.set(v, day);
      if ((v.npcs || []).length > 0) { vdW++; if (!((v.counts && v.counts.lumberjack) > 0)) ljW++; }
    }
  } catch (e) {}
  return _t.apply(this, arguments);
};
process.on('exit', () => { if (last > 0 && !rec.snaps.some((s) => s.day === last)) snap(last); });
