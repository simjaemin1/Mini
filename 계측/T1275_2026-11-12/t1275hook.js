// 서버 판 계측(세계 0 · 읽기만) — T1275: 영토 v2 의 땅 입구 셋(말뚝 통나무 · 개간 목재 · 주거 문)이 무엇을 읽는지 날마다
//   날 줄(51마을 합): [날 · 인구 · 영토 칸 · 곳간 통나무 · 잉여(통나무 − 1인 비축 5 × 인구 · 0 아래는 0) · 잉여 > 0 마을 수 · 1인 비축 넘는 마을 수 ·
//     통나무 막힘 날 누계 · 몸 막힘 날 누계 · 넓힌 칸 누계 · 말뚝 통나무 누계 · 벤 그루 누계 · 곳간에 든 개간 통나무 누계 · 마을 짐(`_t717Pack`) ·
//     나무꾼 · 나무꾼 자리(정본 식 `jobCapacity` 를 옮겨 셈 — 값 함수 안 부름) · 수식 목재 산출(`_woodOutLast`) · 주거 · 모자람 장부(`_t1207Need`) · econ 땅 크기 · 출생 0 중 주거 문 날]
//   스냅(25날마다 + 끝 날): 마을마다 같은 칸.
//   ⚠값(가격) 함수 · 캐시 세우는 함수는 안 부른다 — 칸 읽기만(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1275_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger, days = [], snaps = [];
  const BETA = 0.105, RES_WOOD = 5;   // 정본 `LAND_Q_BETA` · `RESERVE_PC.wood`(sim/economy-sim.js — 옮겨 적음 · 판 밖 셈에만)
  const effS = (L) => { const s0 = L.baseSize || 1, s = L.size || 0; if (s <= s0) return s; return s0 + (s0 / (1 - BETA)) * (Math.pow(s / s0, 1 - BETA) - 1); };
  let lastDay = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const row = (v) => {
    const e = v.econ || {}, st = e.storage || {}, L = e.land || {}, T = v._t1207 || {}, N = (e.npcs || []).length, c = e.counts || {}, wood = st.wood || 0;
    return [v.name, N, v._terrSet ? v._terrSet.size : 0, +wood.toFixed(2), +(wood - RES_WOOD * N).toFixed(2), c.lumberjack || 0,
      Math.floor(effS(L) * (L.wood || 0) * 0.30), +(e._woodOutLast || 0).toFixed(3), +(e.housing || 0).toFixed(2),
      T.days || 0, T.stallWood || 0, T.stallBody || 0, T.cells || 0, +(T.wood || 0).toFixed(2), +(T.laborMin || 0).toFixed(1), T.felled || 0, +(T.woodIn || 0).toFixed(2),
      +(e._t1207Need || 0).toFixed(2), +(e._t717Pack || 0).toFixed(2), (v._t1238Pend || []).length, +(L.size || 0).toFixed(2), L.wood == null ? null : L.wood, e.founder ? 1 : 0,
      +(((e._consEMA || {}).wood) || 0).toFixed(3), e._dpDebug && e._dpDebug.gated ? 1 : 0,
      // 칸 25 ~ 31: 값표 캐시(그 마을이 마지막으로 쓴 표 — 읽기만) 통나무 · 식량 · K 분해(자리 · 식량 흐름 · 땔감) · 땔감 충당 · 농부
      (e._priceCache && e._priceCache.wood != null) ? +e._priceCache.wood.toFixed(3) : null, (e._priceCache && e._priceCache.food != null) ? +e._priceCache.food.toFixed(3) : null,
      e._kDbg ? e._kDbg.slot : null, e._kDbg ? e._kDbg.prod : null, e._kDbg ? e._kDbg.fuel : null, e._fuelCov == null ? null : +e._fuelCov.toFixed(3), c.farmer || 0];
  };
  const agg = (day, rows) => {
    const s = (i) => rows.reduce((a, r) => a + (r[i] || 0), 0);
    return [day, s(1), s(2), +s(3).toFixed(1), +rows.reduce((a, r) => a + Math.max(0, r[4]), 0).toFixed(1), rows.filter((r) => r[4] > 0).length, rows.filter((r) => r[1] > 0 && r[4] >= 0).length,
      s(10), s(11), s(12), +s(13).toFixed(1), s(15), +s(16).toFixed(1), +s(18).toFixed(1), s(5), s(6), +s(7).toFixed(2), +s(8).toFixed(1), +s(17).toFixed(1), +s(20).toFixed(1), s(24)];
  };
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments), sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        const rows = sv().filter((v) => v && v.econ && !v.econ.founder).map(row);
        days.push(agg(lastDay, rows));
        if (lastDay % 25 === 0) snaps.push({ day: lastDay, rows });
      } catch (e) {}
      return r;
    };
    return L;
  };
  process.on('exit', () => { try { const rows = sv().filter((v) => v && v.econ && !v.econ.founder).map(row); snaps.push({ day: lastDay, rows, end: true });
    fs.writeFileSync(OUT + '.t1275.json', JSON.stringify({ env: { T325: process.env.T325_WOOD_ACT || null, T1207: process.env.T1207_TERR_REAL || null, T1238: process.env.T1238_TERR_V2 || null, fix: process.env.T1275_FIX || null }, days, snaps })); } catch (e) {} });
}
