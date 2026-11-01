'use strict';
// (@regress 없음 — 러너 밖 · T1050 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1050-observe.js — 랩 자(t17 · t176)에서 몸 없는 마을의 집(econ `labHouseDay`)이 한 일을 적는다 ===
//   T1050_OBS=<파일> NODE_OPTIONS="-r $PWD/scripts/t1050-observe.js" node scripts/t17-metrics.js 400 1020
//   장부 `scanDay`(econ 하루 끝 · 집 하루 뒤)에서 econ 이 이미 쥔 칸만 읽는다(사본 0 · 새 수 0):
//     표본 날(30 · 90 · 365 · 399 · 마지막 날) 세계 합: 인구 · 주거 · 침상(`_mapBeds`) · 지은 집 칸 · 서 있는 집터 ·
//       크루가 꺼낸 목재 누계(`_t1050.sum.took`) · 크루-날 · 단계 · 곳간 빈 날 · 지은 채 · 곳간 목재 · 주거 > 침상 마을 · 인구 ≥ 침상(게이트) 마을
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
if (!/scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1) || !process.env.T1050_OBS) return;
const OUT = process.env.T1050_OBS;
const Ev = require(path.join(__dirname, '..', 'server', 'events'));
const SAMPLE = new Set([29, 89, 364, 399]);
const rec = { where: path.basename(A1), samples: {}, lastDay: -1 };
let last = -1, lastW = null;
function snap(world) {
  const o = { pop: 0, housing: 0, beds: 0, cells: 0, sites: 0, took: 0, crewDays: 0, adv: 0, stallDays: 0, built: 0, wood: 0, hOverB: 0, gated: 0, attached: 0 };
  for (const v of world.villages || []) {
    const N = (v.npcs || []).length; o.pop += N; o.housing += +v.housing || 0; o.wood += +(v.storage && v.storage.wood) || 0;
    const H = v._t1050; if (!H) continue; o.attached++;
    o.beds += +v._mapBeds || 0; o.cells += H.cells; if (H.site) o.sites++;
    o.took += H.sum.took; o.crewDays += H.sum.crewDays; o.adv += H.sum.adv; o.stallDays += H.sum.stallDays; o.built += H.sum.built;
    if ((+v.housing || 0) > (+v._mapBeds || 0) + 1e-9) o.hOverB++;
    if (N > 0 && N >= Math.min(+v.housing || 0, +v._mapBeds || 0)) o.gated++;
  }
  for (const k of ['housing', 'took', 'wood']) o[k] = Math.round(o[k] * 100) / 100;
  return o;
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { const d = day | 0; if (d !== last) { last = d; if (SAMPLE.has(d)) rec.samples[d] = snap(world); rec.lastDay = d; lastW = world; } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { if (lastW) rec.samples.last = snap(lastW); fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
