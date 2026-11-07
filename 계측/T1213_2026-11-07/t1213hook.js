// 서버 판 계측(세계 0 · 읽기만) — T1213: 50날마다 + 끝 날 — 마을마다 [이름 · 인구 · 영토 · 곳간 통나무 · 돌 · 나무꾼 · 채집꾼 · 석공 · 농부 ·
//   T1207 장부(치른 날 · 통나무 막힘 날 · 몸 막힘 날 · 넓힌 셀 · 말뚝 통나무 · 개간 분 · 벤 그루 · 곳간에 든 통나무) · 모자람 · 산 적 · 창설자 ·
//   소비 EMA 통나무 · 돌 · 소비 누계 통나무 · 짓는 파생수요 통나무 · 돌(T1213 켬만) · 숯가마 통나무 누계 · 숯 곳간(칸 0~26) ·
//   훅 2(칸 27~37 — 값표 캐시 `_priceCache` 통나무 · 식량 · 돌 · 바꾸기 문 `_dbgSwitch` need · did · 날 · 땅 숲 · size · baseSize · 비옥 · 식량 잉여 EMA)]
//   ⚠값(가격) 함수는 안 부른다 — 세계 공급 캐시를 다른 순간에 세우면 끔 판이 기준선과 갈린다. 칸 읽기 · 순수 함수만.
'use strict';
//   쓰는 법(보고 §8): NODE_OPTIONS="--require <이 파일>" node scripts/server-baseline-check.js … --vclock — 판 폴더의 sbc-<시드>.json 곁에 .t1213.json 을 쓴다
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1213_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;   // 기본 = 이 레포(계측/<폴더>/ 의 두 칸 위)
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger, snaps = [], cum = new Map();
  let lastDay = 0;
  const snap = (day) => {
    const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports;
    const em = require.cache[path.join(ROOT, 'sim', 'economy-sim.js')], E = em && em.exports;
    const on = !!(E && E.T1213_ON);
    const sv = VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : [];
    const rows = sv.map((v) => {
      const e = v.econ || {}, np = e.npcs || [], T = v._t1207 || {}, st = e.storage || {}, pc = e._priceCache || {}, sw = e._dbgSwitch || {}, L = e.land || {};
      let lj = 0, fo = 0, ma = 0, fa = 0; for (const n of np) { const j = n.currentJob; if (j === 'lumberjack') lj++; else if (j === 'forager') fo++; else if (j === 'mason') ma++; else if (j === 'farmer') fa++; }
      return [v.name, np.length, v._terrSet ? v._terrSet.size : 0, +(st.wood || 0).toFixed(1), +(st.stone || 0).toFixed(1), lj, fo,
        T.days || 0, T.stallWood || 0, T.stallBody || 0, T.cells || 0, +(T.wood || 0).toFixed(2), +(T.laborMin || 0).toFixed(1), T.felled || 0, +(T.woodIn || 0).toFixed(2),
        +(e._t1207Need || 0).toFixed(2), e._everPop ? 1 : 0, e.founder ? 1 : 0,
        +(((e._consEMA || {}).wood) || 0).toFixed(3), +(((e._consEMA || {}).stone) || 0).toFixed(3), +(cum.get(v.name) || 0).toFixed(2),
        ma, fa, on ? +E.buildInputTarget(e, 'wood').toFixed(2) : 0, on ? +E.buildInputTarget(e, 'stone').toFixed(2) : 0, +(e._kilnWood || 0).toFixed(1), +(st.charcoal || 0).toFixed(1),
        // ★[훅 2] 칸 읽기만(값 함수 안 부름) — 마을 값표 캐시(그 마을이 마지막으로 쓴 표) · 바꾸기 문 표지 · 땅(자리 셈은 판 밖에서 정본 jobCapacity 로)
        pc.wood == null ? null : +pc.wood.toFixed(4), pc.food == null ? null : +pc.food.toFixed(4), pc.stone == null ? null : +pc.stone.toFixed(4),
        sw.need || null, sw.did || null, sw.day == null ? null : sw.day, L.wood == null ? null : L.wood, L.size == null ? null : +L.size.toFixed(3), L.baseSize == null ? null : L.baseSize,
        L.fertility == null ? null : L.fertility, +(((e.surplusEMA || {}).food) || 0).toFixed(2)];
    });
    snaps.push({ day, t: VS && VS.t1207Stat ? VS.t1207Stat() : null, rows });
  };
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments), sd = L.scanDay;
    L.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        lastDay = day | 0;
        for (const v of (world.villages || [])) { const d = v._consDay; if (d && d.wood > 0) cum.set(v.name, (cum.get(v.name) || 0) + d.wood); }
        if (lastDay > 0 && lastDay % 50 === 0) snap(lastDay);
      } catch (e) {}
      return r;
    };
    return L;
  };
  process.on('exit', () => { try { if (!snaps.length || snaps[snaps.length - 1].day !== lastDay) snap(lastDay); fs.writeFileSync(OUT + '.t1213.json', JSON.stringify({ knob: process.env.T1207_TERR_REAL || null, add: process.env.T1213_DERIV_ADD || null, lastDay, snaps })); } catch (e) {} });
}
