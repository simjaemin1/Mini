'use strict';
// (@regress 없음 — 러너 밖 · T958 관찰기 · 제품 무변 · 읽기만)
// === scripts/t958-observe.js — 집 행위 마을: 크루가 실제로 지은 집(곳간 자재 꺼냄 · 완공 침상) ↔ econ 주거 증가 — 랩 자(`t17-metrics.js`) · 서버 판 자(`t577-server-run.js`) 곁 프리로드 ===
//   쓰는 법:
//     랩:   T958_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t958-observe.js" node scripts/t17-metrics.js 90 1020
//     서버: NODE_OPTIONS="-r $PWD/scripts/t958-observe.js" node scripts/t577-server-run.js 90 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t958.json`)
//   날마다(장부 `scanDay` · econ 하루 끝 · `T958_DAYS` 앞까지 · 기본 90) 마을마다 한 줄:
//     인구 · econ 주거(`housing`) · econ 이 오늘 올린 주거(= 오늘 주거 − 어제 주거 × (1 − 노후) — econ 줄 차례 "노후 → 증축" 그대로 거꾸로 읽는다) ·
//     맵 침상(`_mapBeds` — 서버가 완공 움집 칸 × 칸당 침상으로 심는 값 · 랩 null) · 집 행위 마을(`_t400Live`) · 곳간 목재 ·
//     오늘 크루가 곳간에서 꺼낸 자재(econ 출구 `actFromGranary` 를 감싸 그 마을 · 그 품목 양을 더한다 — 꺼낸 양 그대로 · T435 · T527 크루는 끔 기본) ·
//     인구 게이트가 막았나(`_dpDebug.gated`).
//   상수는 econ 이 내보낸 것만 읽는다(노후 `HOUSE_DECAY` 는 안 내보내므로 econ 소스의 그 한 줄을 읽어 쓴다 — 사본 0 · 값이 바뀌면 같이 바뀐다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T958_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t958.json' : '') : process.env.T958_OUT;
if (!OUT) return;
const DAYS = +(process.env.T958_DAYS || 90);
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const DECAY = +((SRC.match(/^const HOUSE_DECAY = ([0-9.]+);/m) || [])[1]);
const r3 = (x) => Math.round((+x || 0) * 1e3) / 1e3;
const rec = {
  where: SERVER ? 'server' : path.basename(A1),
  knob: Object.fromEntries(['T958_HOUSE_REAL', 'T400_BUILD_ACT', 'T315_MAPBEDS', 'T627_TRIP_DAY', 'T858_NO_SHIELD', 'DCTL_SKIP', 'LDCTL_SKIP', 'T931_SLOTK_EMA'].map((k) => [k, process.env[k] != null ? process.env[k] : null])),
  econ: { HOUSE_DECAY: DECAY, woodPerCap: V1.houseCostPerCap ? V1.houseCostPerCap('wood') : null, stonePerCap: V1.houseCostPerCap ? V1.houseCostPerCap('stone') : null, T958_ON: V1.T958_ON != null ? !!V1.T958_ON : null },
  cols: ['pop', 'housing', 'built', 'beds', 'live', 'wood', 'tookWood', 'tookOther', 'gated', 'paid'],
  names: null, rows: [],
};
const took = new WeakMap();   // econ 마을 → 오늘 꺼낸 자재 { item: 양 }
const mkA = V1.actFromGranary;
V1.actFromGranary = function (v, item) {
  const t = mkA.apply(this, arguments);
  try { if (v && t > 0) { const m = took.get(v) || {}; m[item] = (m[item] || 0) + t; took.set(v, m); } } catch (e) {}
  return t;
};
let last = -1;
const prevH = new Map();
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try { if ((day | 0) !== last && (day | 0) < DAYS) { last = day | 0; snap(world, day | 0); } } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
function snap(world, day) {
  const V = world.villages || [];
  if (!rec.names) rec.names = V.map((v) => v.name);
  for (const v of V) if (rec.names.indexOf(v.name) < 0) rec.names.push(v.name);
  const row = new Array(rec.names.length).fill(null);
  for (const v of V) {
    const i = rec.names.indexOf(v.name), h = +v.housing || 0;
    const ph = prevH.has(v.name) ? prevH.get(v.name) : null; prevH.set(v.name, h);
    const m = took.get(v) || {}; took.set(v, {});
    let other = 0; for (const k of Object.keys(m)) if (k !== 'wood') other += m[k];
    row[i] = [(v.npcs || []).length, r3(h), ph == null ? null : r3(h - ph * (1 - DECAY)), v._mapBeds != null ? r3(v._mapBeds) : null, v._t400Live ? 1 : 0,
      r3(v.storage && v.storage.wood), r3(m.wood || 0), r3(other), (v._dpDebug && v._dpDebug.gated) ? 1 : 0, v._t958Paid != null ? r3(v._t958Paid) : null];
  }
  rec.rows.push([day, row]);
}
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
