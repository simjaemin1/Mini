'use strict';
// (@regress 없음 — 러너 밖 · T1047 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1047-house.js — 집 한 칸 값 · 짓는 횟수: 서버(크루가 곳간 목재로) ↔ 랩(econ 이 곳간 목재로) 같은 자 ===
//   랩:   T1047_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1047-house.js" node scripts/t17-metrics.js 365 1020
//   서버: NODE_OPTIONS="-r $PWD/scripts/t1047-house.js" node scripts/t577-server-run.js 365 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1047.json`)
//   econ 이 이미 쥔 칸 · 정본 함수만 읽는다(사본 0 · 새 수 0):
//     ⓐ econ 주거 하루(`tickVillage` 앞뒤 — 같은 틱의 `housing` · `storage.wood/stone`): 지은 양 = 뒤 주거 − 앞 주거 × (1 − `HOUSE_DECAY`)
//        → 노후 메움(≤ 앞 주거 × `HOUSE_DECAY`) · 늘린 몫(나머지)으로 가른다. 그 마을이 집 행위 마을(`buildActOn`)이면 목재를 안 뺀다(크루 몫) ·
//        아니면(랩) econ 이 뺀 목재 = 지은 양 × `houseCostPerCap('wood')`(econ 단가 — 그 줄이 쓰는 같은 함수).
//     ⓑ 크루 곳간 출구(`actFromGranary` — 집 · 곳간 · 다리 크루의 유일한 문): 품목별 꺼낸 양.
//     ⓒ 완공 움집 — 하루 끝 `_mapBeds`(지은 침상 = 완공 칸 × `HOUSE_CAP_PER_FLOOR`) 가 는 몫 ÷ 칸당 침상.
//     ⓓ 곳간 목재 흐름 — 틱 안 순변화(생산 · 땔감 · 집 · 숯가마 …) · 틱 밖 순변화(크루 · 행위 입고 · 교역 도착 …) = 하루 끝 사이 변화 − 틱 안 순변화.
//     ⓔ 날 364 단면 — 인구 · 주거 · 지은 침상 · 곳간 목재 · 돌 합.
//   `HOUSE_DECAY` 는 내보내기가 없어 정본 소스 줄에서 읽는다(`t176-ab` T207 규약 — 값을 이 파일에 안 적는다).
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1047_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1047.json' : '') : process.env.T1047_OUT;
if (!OUT) return;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const Ev = require(path.join(ROOT, 'server', 'events'));
const VL = require(path.join(ROOT, 'server', 'village-layout'));
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const HOUSE_DECAY = (() => { const m = SRC.match(/const\s+HOUSE_DECAY\s*=\s*([0-9.]+)\s*;/); return m ? +m[1] : null; })();
const CAP = VL.HOUSE_CAP_PER_FLOOR * VL.HOUSE_MAX_FLOORS;
let curDay = 0;   // 지금 도는 틱의 날(마지막으로 닫은 날 + 1)
const Y = () => (curDay < 365 ? 'y1' : 'rest');
const B = () => ({ refill: 0, grow: 0, builtLive: 0, builtLab: 0, woodPaid: 0, stonePaid: 0, crew: {}, crewCalls: 0, huts: 0, bedsLost: 0, woodTick: 0, woodOut: 0 });
const rec = { where: SERVER ? 'server' : path.basename(A1), HOUSE_DECAY, CAP, price: { wood: V1.houseCostPerCap('wood'), stone: V1.houseCostPerCap('stone') }, y1: B(), rest: B(), snap: {}, lastDay: -1, err: null };
const lastBeds = new WeakMap(), lastWood = new WeakMap();
const tv = V1.tickVillage;
V1.tickVillage = function (v) {
  const h0 = v && v.housing, w0 = v && v.storage ? (v.storage.wood || 0) : 0;
  if (v && v.storage && !lastWood.has(v)) lastWood.set(v, w0);   // 첫 틱 앞 곳간 — 틱 밖 순변화의 출발
  try { return tv.apply(this, arguments); } finally {
    try {
      if (v && v.storage && h0 !== undefined && v.housing !== undefined && HOUSE_DECAY != null) {
        const b = rec[Y()], built = v.housing - h0 * (1 - HOUSE_DECAY);
        if (built > 1e-12) {
          const rf = Math.min(built, h0 * HOUSE_DECAY); b.refill += rf; b.grow += built - rf;
          if (V1.buildActOn(v)) b.builtLive += built; else { b.builtLab += built; b.woodPaid += built * rec.price.wood; b.stonePaid += built * rec.price.stone; }
        }
        b.woodTick += (v.storage.wood || 0) - w0;
      }
    } catch (e) { rec.err = String(e && e.message); }
  }
};
const af = V1.actFromGranary;
V1.actFromGranary = function (v, item) {
  const r = af.apply(this, arguments);
  try { if (r > 0) { const b = rec[Y()]; b.crew[item] = (b.crew[item] || 0) + r; b.crewCalls++; } } catch (e) {}
  return r;
};
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d > rec.lastDay) {
        const b = rec[d < 365 ? 'y1' : 'rest'];
        let pop = 0, housing = 0, beds = 0, wood = 0, stone = 0;
        for (const v of world.villages || []) {
          const mb = v._mapBeds;
          if (mb !== undefined) { const p = lastBeds.get(v); if (p !== undefined) { if (mb > p) b.huts += (mb - p) / CAP; else if (mb < p) b.bedsLost += p - mb; } lastBeds.set(v, mb); beds += mb; }
          const w = (v.storage && v.storage.wood) || 0, pw = lastWood.get(v); if (pw !== undefined) b.woodOut += w - pw; lastWood.set(v, w);
          pop += (v.npcs || []).length; housing += v.housing || 0; wood += w; stone += (v.storage && v.storage.stone) || 0;
        }
        if (d === 89 || d === 364) rec.snap[d] = { pop, housing: +housing.toFixed(2), beds, wood: +wood.toFixed(2), stone: +stone.toFixed(2) };
        rec.lastDay = d; curDay = d + 1;
      }
    } catch (e) { rec.err = String(e && e.message); }
    return sd.apply(this, arguments);
  };
  return L;
};
// 틱 밖 순변화 = 하루 끝 사이 변화(woodOut 에 먼저 담았다) − 틱 안 순변화
process.on('exit', () => { try { for (const k of ['y1', 'rest']) { const b = rec[k]; b.woodOut = +(b.woodOut - b.woodTick).toFixed(3); } fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
