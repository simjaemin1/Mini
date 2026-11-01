'use strict';
// (@regress 없음 — 러너 밖 · T1055 관찰기 · 제품 무변 · 읽기만)
// === scripts/t1055-observe.js — 첫 90날 성장: 서버 판 자 ↔ 랩 자(t17 · t176) **마을마다 · 날마다** 한 줄 ===
//   랩:   T1055_OUT=<파일> NODE_OPTIONS="-r $PWD/scripts/t1055-observe.js" node scripts/t17-metrics.js 90 1020
//   서버: NODE_OPTIONS="-r $PWD/scripts/t1055-observe.js" node scripts/t577-server-run.js 90 1020,7,42   (아이 존만 · 판 JSON 곁 `<판>-<시드>.t1055.json`)
//   T1055_DAYS(기본 90) 날 0 ~ DAYS−1 만 적는다. 장부 `scanDay`(econ 하루 끝)에서 econ 이 이미 쥔 칸만 읽는다(사본 0 · 새 수 0 · 세계에 쓰기 0):
//     인구 · 들어온 몸(출생 — `npcs` 에 처음 본 개체) · 나간 몸 · 그중 굶어 죽음(정본 `lib-day-deaths`)
//     주거 `housing` · 침상 `_mapBeds` · 그날 올리고 싶던 몫 `_t958Want` · 계획 주거 `_t958Plan`
//     식량 환산 · 식량 흐름 EMA · 출생 식 칸(`_dpDebug` — K · 로지스틱 · 굶주림 · 행복 · 건강 · 위신 · 주거 게이트 · dP) · 누적 `_dPAccum` · 행복 · K 분해(`_kDbg`) · 땔감 덮음 `_fuelCov` · 곳간 목재 · 돌
//     집 크루 그날(서버 `vil._t400Dbg` · 랩 `labHouseDay` 가 econ `houseCrewDay` 에 넘긴 dbg 를 그대로 받는 `_t1050.sum` 차): 크루 · 꺼낸 목재 · 단계 · 기다린 날 · 왕복
//     집터 단계 · 지은 집 칸(서버 `_houseCells` · 랩 `_t1050.cells`) · 서버만: 가시 몸 수(`npcPids`) · 밭 칸(`_farmSet`)
//     낮 초(서버 크루 dbg `dayS` — 왕복 상한과 같은 낮 초 × 크루) · 목재 수입 누계(`tradeStats.woodImported`) · 보낸 캐러밴 누계 · 목재 내보낸 누계(`tradeStats.exportBy.wood` — 있으면)
//     표본 날(0 · 29 · 59 · 89): 마을마다 직업 칸(`counts`)
const path = require('path');
const fs = require('fs');
const A1 = process.argv[1] || '';
const SERVER = !!process.env.T577_SEED && /server[\/\\]zone\.js$/.test(A1);
const LAB = !SERVER && !!process.env.T1055_OUT && /scripts[\/\\](t17-metrics|t176-ab)\.js$/.test(A1);
if (!SERVER && !LAB) return;
const OUT = SERVER ? (process.env.T577_OUT ? process.env.T577_OUT.replace(/\.json$/, '') + '.t1055.json' : '') : process.env.T1055_OUT;
if (!OUT) return;
const DAYS = parseInt(process.env.T1055_DAYS || '', 10) || 90;
const ROOT = path.join(__dirname, '..');
const V1 = require(path.join(ROOT, 'sim', 'economy-sim'));
const DD = require('./lib-day-deaths'); DD.install(V1);
const Ev = require(path.join(ROOT, 'server', 'events'));
let SV = null; if (SERVER) { try { SV = require(path.join(ROOT, 'server', 'villages')); } catch (e) { SV = null; } }
const r3 = (x) => (x == null || !isFinite(+x) ? null : Math.round((+x) * 1000) / 1000);
const F = ['pop', 'born', 'out', 'fam', 'hous', 'beds', 'want', 'plan', 'tfe', 'fema', 'K', 'ks', 'kp', 'kf', 'logi', 'hung', 'happy', 'hlth', 'pres', 'gate', 'dP', 'acc', 'hap', 'fcov', 'wood', 'stone',
  'crew', 'took', 'adv', 'stall', 'trips', 'walkS', 'site', 'cells', 'bodies', 'farm', 'dayS', 'wimp', 'csent', 'wexp'];
const SAMPLE = new Set([0, 29, 59, 89]);
const rec = { where: SERVER ? 'server' : path.basename(A1), days: DAYS, fields: F, vil: {}, jobs: {}, err: null, lastDay: -1 };
const seen = new WeakSet();
const prevSet = new Map();   // 마을 이름 → 어제 npc 집합
const prevLab = new Map();   // 마을 이름 → 어제 `_t1050.sum` 사본(차를 그날 몫으로)
let last = -1;
function srvMap() {
  const m = new Map();
  try { const H = SV && SV.banditHost && SV.banditHost(); for (const vil of ((H && H.villages) || [])) if (vil && vil.econ) m.set(vil.econ, vil); } catch (e) {}
  return m;
}
function row(v, vil, d) {
  const N = (v.npcs || []).length;
  const cur = new Set(v.npcs || []);
  const pv = prevSet.get(v.name);
  let born = 0; for (const n of cur) if (!seen.has(n)) { seen.add(n); if (pv) born++; } let out = 0; if (pv) for (const n of pv) if (!cur.has(n)) out++;
  prevSet.set(v.name, cur);
  let tfe = 0; try { tfe = V1.totalFoodEquivalent(v); } catch (e) { tfe = null; }
  const D = v._dpDebug || {}, K = v._kDbg || {}, S = v.storage || {}, T = v.tradeStats || {};
  let crew = null, took = null, adv = null, stall = null, trips = null, walkS = null, site = 0, cells = null, bodies = null, farm = null, dayS = null;
  if (vil) {   // 서버 — 그날 크루 dbg(`_t400BuildDay` 가 날마다 새로 세운다 · 집터 없으면 크루 0)
    const g = vil._t400Dbg;
    if (g) { crew = g.crew; took = g.took; adv = g.adv; stall = g.stall; trips = g.trips; walkS = g.walkS; dayS = g.dayS; }
    site = vil._site ? (vil._site.stage | 0) : 0;
    cells = vil._houseCells ? (vil._houseCells.size != null ? vil._houseCells.size : vil._houseCells.length) : null;
    bodies = (vil.npcPids || []).length;
    farm = vil._farmSet ? vil._farmSet.size : null;
  } else if (v._t1050) {   // 랩 — 누계 차
    const H = v._t1050, U = H.sum, p = prevLab.get(v.name) || { crewDays: 0, took: 0, adv: 0, stallDays: 0, trips: 0 };
    crew = U.crewDays - p.crewDays; took = U.took - p.took; adv = U.adv - p.adv; stall = U.stallDays - p.stallDays; trips = U.trips - p.trips; walkS = 0;
    prevLab.set(v.name, Object.assign({}, U));
    site = H.site ? (H.site.stage | 0) : 0; cells = H.cells;
  }
  const o = { pop: N, born, out, fam: DD.deathsToday(v), hous: v.housing, beds: v._mapBeds, want: v._t958Want, plan: v._t958Plan, tfe, fema: v.surplusEMA && v.surplusEMA.food,
    K: D.K, ks: K.slot, kp: K.prod, kf: K.fuel, logi: D.logi, hung: D.hunger, happy: D.happy, hlth: D.health, pres: D.prestige, gate: D.gated ? 1 : 0, dP: D.dP, acc: v._dPAccum,
    hap: v.lastStats && v.lastStats.happiness, fcov: v._fuelCov, wood: S.wood, stone: S.stone, crew, took, adv, stall, trips, walkS, site, cells, bodies, farm, dayS,
    wimp: T.woodImported || 0, csent: T.caravansSent || 0, wexp: (T.exportBy && T.exportBy.wood) || 0 };
  return F.map((k) => r3(o[k]));
}
const mk = Ev.createLedger;
Ev.createLedger = function () {
  const L = mk.apply(this, arguments);
  const sd = L.scanDay;
  L.scanDay = function (world, day) {
    try {
      const d = day | 0;
      if (d !== last && d >= 0 && d < DAYS) {
        last = d;
        const M = SERVER ? srvMap() : null;
        for (const v of world.villages || []) {
          const A = rec.vil[v.name] || (rec.vil[v.name] = []);
          A.push([d].concat(row(v, M ? M.get(v) : null, d)));
          if (SAMPLE.has(d)) (rec.jobs[d] || (rec.jobs[d] = {}))[v.name] = Object.fromEntries(Object.entries(v.counts || {}).filter(([, n]) => n > 0));
        }
        rec.lastDay = d;
      }
    } catch (e) { rec.err = String(e && e.stack); }
    return sd.apply(this, arguments);
  };
  return L;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} });
