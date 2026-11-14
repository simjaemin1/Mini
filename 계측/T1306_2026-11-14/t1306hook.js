// 서버 판 계측(세계 0 · 읽기만) — T1306: 단계 문 비율 · 떠남 · 걸어 닿음 · 이주 문 셈
//   마을-날 줄(51마을 × 날): 아래 `COLS` 차례 —
//     닿은 사람(`arrive` — 어제 어느 마을 명부에도 없던(길 위) 사람이 오늘 이 마을에 · 전에 본 id) · 그날 곳간 일치(식량 환산 ÷ 사람 · 날 끝) ·
//     떠난 사람(`emig` — econ `_emigTot` 날 차 · 불행 이탈로 실제로 걸어 나간 사람) · 못 떠난 압력(`lost` — econ `_emigLost` 날 차 · 받을 곳이 없어 남은 몫) ·
//     단계 문 비율(`r` — econ `_t1306R` · 그날 늘림에 곱한 몫 · 켠 판만)
//   판 끝에 서버 이주 문 셈(`t1306Stat` — 본 후보 · 들은 곳간이 넉넉 · 얇음 · 모름 · 도달 일수 합)을 함께 적는다.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1306_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'arrive', 'foodDays', 'emig', 'lost', 'r'];
  const names = [], nameIdx = new Map(), rows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, prevIn = null;
  const seen = new Set(), emPrev = new Map(), lostPrev = new Map();
  const VS = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')]; return vm && vm.exports; };
  const sv = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const vils = sv().filter((vil) => vil && vil.econ && !vil.econ.founder);
    const inList = new Set();
    for (const vil of vils) for (const n of (vil.econ.npcs || [])) inList.add(n.id);
    const out = [];
    for (const vil of vils) {
      const e = vil.econ, N = (e.npcs || []).length;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      let arrive = 0;
      if (prevIn) for (const n of (e.npcs || [])) if (!prevIn.has(n.id) && seen.has(n.id)) arrive++;
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      const em = e._emigTot || 0, lo = e._emigLost || 0;
      const dEm = emPrev.has(vil.name) ? em - emPrev.get(vil.name) : null, dLo = lostPrev.has(vil.name) ? lo - lostPrev.get(vil.name) : null;
      emPrev.set(vil.name, em); lostPrev.set(vil.name, lo);
      out.push([day, vi, N, arrive, fe == null || !N ? null : r3(fe / N), dEm, dLo == null ? null : r3(dLo), e._t1306R == null ? null : r3(e._t1306R)]);
    }
    for (const id of inList) seen.add(id);
    prevIn = inList;
    return out;
  };
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try { if ((day | 0) === lastDay) return r; lastDay = day | 0; for (const q of dayRows(lastDay)) rows.push(q); } catch (e) {}
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try {
    const V = VS(), st = V && typeof V.t1306Stat === 'function' ? V.t1306Stat() : null;
    fs.writeFileSync(OUT + '.t1306.json', JSON.stringify({ env: { T1297: process.env.T1297_BIRTH_FOOD || null, GRADE: process.env.T1306_BIRTH_GRADE || null, MIG: process.env.T1306_MIGRATE_FOOD || null,
      T325: process.env.T325_WOOD_ACT || null, T1238: process.env.T1238_TERR_V2 || null, T1283: process.env.T1283_WOOD_DEMAND || null }, stat: st, cols: COLS, names, rows }));
  } catch (e) {} });
}
