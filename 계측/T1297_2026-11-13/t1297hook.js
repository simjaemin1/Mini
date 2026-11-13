// 서버 판 계측(세계 0 · 읽기만) — T1297: 출생이 곳간 며칠치에서 일어나나 · 꼭대기 앞뒤 마을-날마다 출생 · 죽음 · 굶음 · K · 곳간
//   마을-날 줄(51마을 × 날): 아래 `COLS` 차례 —
//     사람 수 · 새 얼굴(`born` — 오늘 처음 보는 id: 이 마을에서 난 사람 + 다른 마을에서 나 그날 바로 걸어 나와 여기 닿은 사람) · 죽은 사람(어제 이 마을에 있던 id 가 오늘 어느 마을에도 없다) ·
//     옮겨 온 · 옮겨 간 사람(어제 다른 마을 · 오늘 다른 마을) · 곳간 식량 날 수(식량 환산 ÷ 사람 · 하루 소비 1 = 1 사람-날) ·
//     인구 식 항(`_dpDebug` — K · 로지스틱 · 그날 dP · 주거 문) · 출생 문 표지(T1149 ⓑ `_t1149Gate` · T1297 `_t1297Gate` — 켠 판만) ·
//     굶는 사람(`foodDebtOf` — 빚 판 정본) · 그날 굶어 죽은 사람(`_fdDeadTot` 날 차) · 주거 · 지은 침상 · 나무꾼 · 농부 · 땔감 충당 · 식량 흐름(`surplusEMA.food`)
//     이 마을에서 오늘 난 사람(`bornE` — econ 새 주민 번호 계수기 `_nid` 의 날 차 · 출생 줄만 올린다 · 그날 걸어 나간 아이도 난 마을 · 난 날에 센다 · T1297 관찰 판부터)
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산 · 식량 빚 셈)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1297_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'born', 'died', 'mvIn', 'mvOut', 'foodDays', 'K', 'logi', 'dP', 'gated', 't1149', 't1297', 'starving', 'fdDead',
    'housing', 'beds', 'lj', 'farmer', 'fuelCov', 'surplus', 'bornE'];
  const names = [], nameIdx = new Map(), rows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, prevWhere = new Map();   // 어제: id → 마을 이름
  const seen = new Set();                    // 한 번이라도 본 id(난 사람 = 처음 보는 id)
  const fdPrev = new Map();
  const nidPrev = new Map();                 // 마을 이름 → 어제 econ 새 주민 번호 계수기(`_nid` — 출생 줄 `createNPC` 만 올린다 · T731 마을 흐름)
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const vils = sv().filter((vil) => vil && vil.econ && !vil.econ.founder);
    const where = new Map();
    for (const vil of vils) for (const n of (vil.econ.npcs || [])) where.set(n.id, vil.name);
    const first = prevWhere.size === 0;
    const out = [];
    for (const vil of vils) {
      const e = vil.econ, N = (e.npcs || []).length, c = e.counts || {}, dd = e._dpDebug || null;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      let born = 0, mvIn = 0, died = 0, mvOut = 0;
      if (!first) {
        for (const n of (e.npcs || [])) { const w = prevWhere.get(n.id); if (w === undefined) { if (!seen.has(n.id)) born++; } else if (w !== vil.name) mvIn++; }
        for (const [id, w] of prevWhere) if (w === vil.name) { const now = where.get(id); if (now === undefined) died++; else if (now !== vil.name) mvOut++; }
      }
      let fe = null, st = null;
      try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      try { st = E.foodDebtOf ? E.foodDebtOf(e).starving : null; } catch (_) {}
      const fdT = e._fdDeadTot || 0, fdD = fdT - (fdPrev.has(vil.name) ? fdPrev.get(vil.name) : fdT); fdPrev.set(vil.name, fdT);
      const nid = e._nid | 0, bornE = nidPrev.has(vil.name) ? nid - nidPrev.get(vil.name) : null; nidPrev.set(vil.name, nid);   // 이 마을에서 오늘 난 사람(그날 바로 걸어 나간 아이까지)
      out.push([day, vi, N, born, died, mvIn, mvOut, fe == null || !N ? null : r3(fe / N), dd ? dd.K : null, dd ? dd.logi : null, dd ? dd.dP : null, dd && dd.gated ? 1 : 0,
        e._t1149Gate == null ? null : e._t1149Gate, e._t1297Gate == null ? null : e._t1297Gate, st, fdD,
        r3(e.housing), e._mapBeds == null ? null : r3(e._mapBeds), c.lumberjack || 0, c.farmer || 0, e._fuelCov == null ? null : r3(e._fuelCov),
        e.surplusEMA && e.surplusEMA.food != null ? r3(e.surplusEMA.food) : null, bornE]);
    }
    for (const id of where.keys()) seen.add(id);
    prevWhere = where;
    return out;
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        for (const q of dayRows(lastDay)) rows.push(q);
      } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try {
    fs.writeFileSync(OUT + '.t1297.json', JSON.stringify({ env: { T325: process.env.T325_WOOD_ACT || null, T1207: process.env.T1207_TERR_REAL || null, T1238: process.env.T1238_TERR_V2 || null,
      T1283: process.env.T1283_WOOD_DEMAND || null, T1297: process.env.T1297_BIRTH_FOOD || null, HAUL: process.env.T1283_CLEAR_HAUL || null, T1149: process.env.T1149_WINTER || null }, cols: COLS, names, rows }));
  } catch (e) {} });
}
