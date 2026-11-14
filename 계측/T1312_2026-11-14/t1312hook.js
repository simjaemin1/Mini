// 서버 판 계측(세계 0 · 읽기만) — T1312: 무리 이주 · 들은 행복 · 침상 · 죽음 까닭(마을-날)
//   마을-날 줄(51마을 × 날): 아래 `COLS` 차례 —
//     닿은 사람(`arr` — 오늘 이 마을 명부에 새로 든 사람 중 이 마을에서 오늘 난 사람(번호 `n<마을 id>.<k>` · k > 어제 계수기)이 아닌 사람 — 그날 나 그날 떠난 새 주민 · 걸어 든 모든 몸) ·
//     이 마을에서 오늘 난 사람(`bornE` — econ 새 주민 번호 계수기 `_nid` 의 날 차) · 떠난 사람(`emig` — econ `_emigTot` 날 차) ·
//     죽음(`dead` — econ `_deadTot` 날 차 · 굶어 죽음 `fd` = `_fdDeadTot` 날 차 · 늙어 죽음 `nat` = `_natDeadTot`(T1206 생명표) 날 차 · 나머지 `dead − fd − nat` = 인구 식이 K 위에서 끌어낸 가장 늙은 사람 · 그 밖) ·
//     그날 곳간 일치(`fdays` — 식량 환산 ÷ 사람 · 날 끝) · 행복(`h` — econ `lastStats.happiness`) · 침상(`beds` — min(집 · 지도 침상)) · K · 그날 늘림(`dP` — `_dpDebug`)
//   판 끝에 서버 이주 문 셈(`t1306Stat`) · 무리 셈(`t1312Stat`)을 함께 적는다.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1312_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const COLS = ['day', 'v', 'N', 'arr', 'bornE', 'emig', 'dead', 'fd', 'nat', 'fdays', 'h', 'beds', 'K', 'dP'];
  const names = [], nameIdx = new Map(), rows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1;
  const prevRoster = new Map(), prev = new Map();   // 마을 이름 → 어제 명부 id 집합 · 어제 계수기들
  const VS = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')]; return vm && vm.exports; };
  const sv = () => { const V = VS(); return V && V.__labProbe && V.__labProbe._t569Probe ? (V.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const vils = sv().filter((vil) => vil && vil.econ && !vil.econ.founder);
    const out = [];
    for (const vil of vils) {
      const e = vil.econ, N = (e.npcs || []).length;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      const p = prev.get(vil.name) || null, roster = new Set((e.npcs || []).map((n) => n.id));
      const nid = e._nid | 0, pre = 'n' + e.id + '.';
      let arr = null;
      if (p) {
        arr = 0;
        const yr = prevRoster.get(vil.name) || new Set();
        for (const id of roster) {
          if (yr.has(id)) continue;
          const s = String(id);
          const bornHere = s.startsWith(pre) && (+s.slice(pre.length)) > p.nid;
          if (!bornHere) arr++;
        }
      }
      const d = (k) => (p ? (e[k] || 0) - (p[k] || 0) : null);
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      const dd = e._dpDebug || null, ls = e.lastStats || null;
      const beds = Math.min(e.housing !== undefined ? e.housing : Infinity, e._mapBeds !== undefined ? e._mapBeds : Infinity);
      out.push([day, vi, N, arr, p ? nid - p.nid : null, d('_emigTot'), d('_deadTot'), d('_fdDeadTot'), d('_natDeadTot'), fe == null || !N ? null : r3(fe / N),
        ls && typeof ls.happiness === 'number' ? r3(ls.happiness) : null, isFinite(beds) ? beds : null, dd ? dd.K : null, dd ? dd.dP : null]);
      prev.set(vil.name, { nid, _emigTot: e._emigTot || 0, _deadTot: e._deadTot || 0, _fdDeadTot: e._fdDeadTot || 0, _natDeadTot: e._natDeadTot || 0 });
      prevRoster.set(vil.name, roster);
    }
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
    const V = VS();
    const st6 = V && typeof V.t1306Stat === 'function' ? V.t1306Stat() : null, st12 = V && typeof V.t1312Stat === 'function' ? V.t1312Stat() : null;
    fs.writeFileSync(OUT + '.t1312.json', JSON.stringify({ env: { T1297: process.env.T1297_BIRTH_FOOD || null, MIG: process.env.T1306_MIGRATE_FOOD || null, HERD: process.env.T1312_HERD || null,
      T325: process.env.T325_WOOD_ACT || null, T1238: process.env.T1238_TERR_V2 || null, T1283: process.env.T1283_WOOD_DEMAND || null }, t1306Stat: st6, t1312Stat: st12, cols: COLS, names, rows }));
  } catch (e) {} });
}
