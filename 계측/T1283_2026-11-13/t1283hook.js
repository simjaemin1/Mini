// 서버 판 계측(세계 0 · 읽기만) — T1283: 나무꾼이 빠지는 날 앞뒤로 "어느 항이 나무꾼을 지게 했나"
//   마을-날 줄(51마을 × 날): 아래 `COLS` 차례 — 사람 수 · 나무꾼 · 농부 · 곳간 식량 날 수(식량 환산 ÷ 사람) · 곳간 통나무 ·
//     값 가중(피커 · 전환 문이 쓰는 식 그대로: 값표 캐시 `_priceCache` 를 0.05 ~ 200 으로 자름) 통나무 · 식량 · 날값(자르기 전) 통나무 · 식량 ·
//     피커 한계 가치(땅 몫 × 100날 × 가중) 나무꾼 · 농부 · 전환 문 기회비용(숙련 1 — 땅 몫 × 가중) 나무꾼 · 농부 ·
//     말뚝 모자람(`_t1207Need`) · 그날 수요 D(`woodShareD`) · 남은 수요(`woodDemandLeft`) · 집 목재 바람(`houseBuildWant(v,'wood')`) · 주거 · 지은 침상 · 땔감 충당(`_fuelCov`) ·
//     나무꾼 자리(`jobCapacity`) · 피커 판단(`_dbgSwitch` — 그날 것만 · 직업 번호) · 그 결과(직업 번호 · 보류 = -2) ·
//     나무꾼 흐름: 나감(다른 일로) · 들어옴 · 죽음/떠남 · 새로 남(나무꾼으로) · 나간 곳(직업 번호별 수 — 글자)
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고, 순수 함수(식량 환산 · 자리 · 수요 · 집 바람)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1283_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const JOBS = Object.keys(E.JOBS), JI = (j) => { const i = JOBS.indexOf(j); return i; };
  const COLS = ['day', 'v', 'N', 'lj', 'farmer', 'foodDays', 'wood', 'wWood', 'wFood', 'pWood', 'pFood', 'gainLJ', 'gainFarmer', 'ocLJ', 'ocFarmer',
    'postNeed', 'D', 'Dleft', 'houseWant', 'housing', 'beds', 'fuelCov', 'capLJ', 'need', 'did', 'ljOut', 'ljIn', 'ljGone', 'ljBorn', 'outTo', 'fert', 'landWood',
    'health', 'dpK', 'dpLogi', 'dpHunger', 'dpHealth', 'dpHappy', 'dP', 'gated', 'jobs', 'haulMin', 'haulWait'];   // ★덧칸(32 ~ 40): 건강 · 인구 식 항(`_dpDebug`) · 주거 문 · 직업별 사람 수(`JOBS` 차례) · ★덧칸(41 ~ 42 · (나) 판부터): 개간 통나무 걸음 분 누계 · 걸음 때문에 미룬 칸 누계(`_t1207` 칸 — 읽기만)
  const names = [], nameIdx = new Map(), rows = [], prevJobs = new Map();
  const clampW = (p) => Math.max(0.05, Math.min(200, p || 1));
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const row = (vil, day) => {
    const e = vil.econ, st = e.storage || {}, L = e.land || {}, N = (e.npcs || []).length, c = e.counts || {};
    let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
    const P = e._priceCache || {}, wW = clampW(P.wood), wF = clampW(P.food);
    let fe = null, cap = null, Dv = null, Dl = null, hw = null;
    try { fe = E.totalFoodEquivalent(e); } catch (_) {}
    try { cap = E.jobCapacity(e).lumberjack; } catch (_) {}
    try { Dv = E.woodShareD(e); Dl = E.woodDemandLeft(e); } catch (_) {}
    try { hw = E.houseBuildWant(e, 'wood'); } catch (_) {}
    // 나무꾼 흐름 — 어제 직업표와 견준다(사람 id)
    const prev = prevJobs.get(vil.name), now = new Map();
    let out = 0, inn = 0, gone = 0, born = 0; const to = {};
    for (const n of (e.npcs || [])) now.set(n.id, n.currentJob);
    if (prev) {
      for (const [id, j] of prev) {
        const j2 = now.get(id);
        if (j === 'lumberjack') { if (j2 === undefined) gone++; else if (j2 !== 'lumberjack') { out++; to[j2] = (to[j2] || 0) + 1; } }
        else if (j2 === 'lumberjack') inn++;
      }
      for (const [id, j2] of now) if (!prev.has(id) && j2 === 'lumberjack') born++;
    }
    prevJobs.set(vil.name, now);
    const dbg = e._dbgSwitch && e._dbgSwitch.day === day ? e._dbgSwitch : null;
    const did = dbg ? (dbg.did == null ? -1 : (String(dbg.did).startsWith('hold') ? -2 : JI(dbg.did))) : null;
    const outTo = Object.keys(to).map((j) => JI(j) + ':' + to[j]).join(',');
    return [day, vi, N, c.lumberjack || 0, c.farmer || 0, fe == null || !N ? null : r3(fe / N), r3(st.wood || 0), r3(wW), r3(wF), r3(P.wood), r3(P.food),
      r3((L.wood || 0) * 0.3 * 100 * wW), r3((L.fertility || 0) * 0.4 * 100 * wF), r3((L.wood || 0) * 0.3 * wW), r3((L.fertility || 0) * 0.4 * wF),
      r3(e._t1207Need || 0), r3(Dv), Dl === Infinity ? -1 : r3(Dl), r3(hw), r3(e.housing), e._mapBeds == null ? null : r3(e._mapBeds), e._fuelCov == null ? null : r3(e._fuelCov),
      cap, dbg ? (dbg.need == null ? -1 : JI(dbg.need)) : null, did, out, inn, gone, born, outTo, r3(L.fertility), r3(L.wood),
      e.lastStats && typeof e.lastStats.health === 'number' ? r3(e.lastStats.health) : null,
      ...(e._dpDebug ? [e._dpDebug.K, e._dpDebug.logi, e._dpDebug.hunger, e._dpDebug.health, e._dpDebug.happy, e._dpDebug.dP, e._dpDebug.gated ? 1 : 0] : [null, null, null, null, null, null, null]),
      JOBS.map((j) => c[j] || 0), ...haul(vil)];
  };
  const haul = (vil) => { try { const T = vil._t1207 || {}; return [r3(T.haulMin || 0), T.haulWait || 0]; } catch (_) { return [null, null]; } };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        for (const vil of sv()) if (vil && vil.econ && !vil.econ.founder) rows.push(row(vil, lastDay));
      } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try {
    fs.writeFileSync(OUT + '.t1283.json', JSON.stringify({ env: { T325: process.env.T325_WOOD_ACT || null, T1207: process.env.T1207_TERR_REAL || null, T1238: process.env.T1238_TERR_V2 || null,
      T1283: process.env.T1283_WOOD_DEMAND || null, HAUL: process.env.T1283_CLEAR_HAUL || null }, cols: COLS, jobs: JOBS, names, rows }));
  } catch (e) {} });
}
