// 서버 판 계측(세계 0 · 읽기만) — T1342: 둘째 겨울 죽음 진단 — 마을-날 줄 + 사람마다 떠남 · 닿음
//   마을-날 줄(51마을 × 날 · 아래 `COLS` 차례):
//     사람 수 · 난 사람(처음 보는 id) · 사라진 사람 가운데 죽은 사람(떠남 표지 없이 어느 마을에도 없다) · 닿은 사람(어제 길 위 · 오늘 이 마을) · 떠난 사람(불행 이탈 몸 문 `t1075Emigrate` 이 참을 낸 사람) ·
//     옮겨 온 · 옮겨 간 사람(어제 다른 마을 · 오늘 이 마을 — 하루 안 걷기) ·
//     econ 죽음 셈 날 차 — 굶어 죽음(`_fdDeadTot`) · 자연사(`_natDeadTot` · T1206) · K 위 죽음(`_deadTot` − 둘 = 인구 식 고리) ·
//     인구 식(`_dpDebug` K · 로지스틱 · dP) · K 쪼갬(`_kDbg` 자리 · 식량 흐름 · 땔감) · 행복 · 인구 부담 · 영토 셀(T1205 `lastStats`) · 곳간 날 수 · 침상 · 출생 문 표지 · 이탈 누적
//   사람마다 길: [떠난 날 · 떠난 마을 · 닿은 날 · 닿은 마을] — 떠남은 econ 이 부르는 몸 문(`world.t1075Emigrate`)을 감싸 그 사람 id 를 적고(반환 · 인자 그대로) 닿음은 명부에서 다시 본 날.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1342_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'born', 'died', 'arr', 'dep', 'mvIn', 'mvOut', 'fdD', 'natD', 'kovD', 'K', 'Kslot', 'Kprod', 'Kfuel', 'logi', 'dP',
    'h', 'burden', 'terr', 'foodDays', 'beds', 'gate', 'emig'];
  const names = [], nameIdx = new Map(), rows = [], trips = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, prevWhere = new Map();
  const seen = new Set(), walking = new Map(), depNow = new Map(), cnt = new Map();
  let arrUnk = 0, depFail = 0, depOk = 0;
  const _tv = E.tickVillage;
  E.tickVillage = function (v) {
    const W = v && v._world;
    if (W && typeof W.t1075Emigrate === 'function' && !W.t1075Emigrate.__t1342) {
      const go = W.t1075Emigrate;
      const w = function (ev, npc) { const r = go.apply(this, arguments); if (r && npc && npc.id != null) { depNow.set(npc.id, ev); depOk++; } else depFail++; return r; };
      w.__t1342 = 1; W.t1075Emigrate = w;
    }
    return _tv.apply(this, arguments);
  };
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const vils = sv().filter((vil) => vil && vil.econ && !vil.econ.founder);
    const where = new Map(), eIdx = new Map();
    for (const vil of vils) {
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      eIdx.set(vil.econ, vi);
      for (const n of (vil.econ.npcs || [])) where.set(n.id, vi);
    }
    const first = prevWhere.size === 0;
    const per = new Map(); const P = (vi) => { let o = per.get(vi); if (!o) { o = { born: 0, died: 0, arr: 0, dep: 0, mvIn: 0, mvOut: 0 }; per.set(vi, o); } return o; };
    if (!first) {
      for (const [id, vi] of where) {
        const pv = prevWhere.get(id);
        if (pv === undefined) {
          const wk = walking.get(id);
          if (wk) { P(vi).arr++; trips.push([wk.d, wk.f, day, vi]); walking.delete(id); }
          else if (!seen.has(id)) P(vi).born++;
          else { P(vi).arr++; arrUnk++; }
        } else if (pv !== vi) {
          P(vi).mvIn++; P(pv).mvOut++;
          if (depNow.has(id)) { trips.push([day, pv, day, vi]); }
        }
      }
      for (const [id, pv] of prevWhere) {
        if (where.has(id)) continue;
        if (depNow.has(id)) { P(pv).dep++; walking.set(id, { d: day, f: pv }); }
        else P(pv).died++;
      }
    }
    depNow.clear();
    const out = [];
    for (const vil of vils) {
      const e = vil.econ, vi = eIdx.get(e), N = (e.npcs || []).length, dd = e._dpDebug || null, kd = e._kDbg || null, ls = e.lastStats || null, o = per.get(vi) || { born: 0, died: 0, arr: 0, dep: 0, mvIn: 0, mvOut: 0 };
      const c0 = cnt.get(vi) || { dt: e._deadTot || 0, fd: e._fdDeadTot || 0, nat: e._natDeadTot || 0 };
      const dt = e._deadTot || 0, fd = e._fdDeadTot || 0, nat = e._natDeadTot || 0;
      const fdD = fd - c0.fd, natD = nat - c0.nat, kovD = (dt - c0.dt) - fdD - natD;
      cnt.set(vi, { dt, fd, nat });
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      const b = Math.min(e.housing !== undefined ? e.housing : Infinity, e._mapBeds !== undefined ? e._mapBeds : Infinity);
      out.push([day, vi, N, o.born, o.died, o.arr, o.dep, o.mvIn, o.mvOut, fdD, natD, kovD,
        dd ? dd.K : null, kd ? kd.slot : null, kd ? kd.prod : null, kd ? kd.fuel : null, dd ? dd.logi : null, dd ? dd.dP : null,
        ls && typeof ls.happiness === 'number' ? r3(ls.happiness) : null, ls && typeof ls.happinessBurden === 'number' ? r3(ls.happinessBurden) : null, ls && ls.terrCells != null ? ls.terrCells : null,
        fe == null || !N ? null : r3(fe / N), isFinite(b) ? r3(b) : null, e._t1297Gate == null ? null : e._t1297Gate, e._emigAccum == null ? null : r3(e._emigAccum)]);
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
      } catch (e) { if (!dayRows._err) { dayRows._err = String(e && e.stack || e); } }
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try {
    const still = []; for (const [id, w] of walking) still.push([w.d, w.f]);
    fs.writeFileSync(OUT + '.t1342.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, AUT: process.env.T1319_AUTUMN_LOOK || null, BIND: process.env.T1342_BIND || null,
      T325: process.env.T325_WOOD_ACT || null, T1207: process.env.T1207_TERR_REAL || null, T1238: process.env.T1238_TERR_V2 || null, T1283: process.env.T1283_WOOD_DEMAND || null, FIX: process.env.T1342_BIRTH_K || null, LEAVE: process.env.T1342_KOVER_LEAVE || null },
      cols: COLS, names, rows, trips, still, arrUnk, depOk, depFail, err: dayRows._err || null }));
  } catch (e) { try { fs.writeFileSync(OUT + '.t1342.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
