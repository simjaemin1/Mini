// 서버 판 계측(세계 0 · 읽기만) — T1346: 2년째 봄 굶음 — 마을-날 식량 흐름 줄(T1342 훅 곁에 · 그 줄에 없는 칸만)
//   마을-날 줄(`COLS` 차례): 식량 흐름 장부(`surplusEMA.food` — 생산 − 하루 수요 · econ 정본 칸) · 들여온 식량 평균(`_importEMA` — 100날 · prodK 가 읽는 칸) ·
//     하루 소비(`DAILY_FOOD_CONSUMPTION` × 사람) 단위로 나눈 두 값 · 땅 배수(지금 비옥 ÷ 원래 비옥 — v2 `applyLandModifiers` 가 건 철 · 날씨 · 풍흉) ·
//     출생 문 표지(`_t1297Gate` — 1 곳간 · 2 흐름 후보) · 곳간 날 수 · 그날 일하는 사람(`counts` — 농부 · 어부 · 사냥꾼 · 채집꾼 · 나무꾼 · 광부 · 석공 · 전사 · 상인) · 땔감 충당(`_fuelCov`) · 추위(`_coldStress`) · 도구 몫(곳간 도구 ÷ 도구 쓰는 일꾼 `_toolDeps` — 1 밑이면 맨손 0.25×) · 건강 · 행복 · 굶어 죽음 누계(`_fdDeadTot`) · K 위 죽음 누계(`_deadTot` − 굶음 − 자연사)
//   30날마다 파일을 새로 쓴다(판이 OOM 으로 죽어도 그때까지 줄이 남는다) · 끝날 때 한 번 더.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산)만 부른다(끈 판이 기준선과 같아야 한다).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1346_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const JOBS = ['farmer', 'fisher', 'hunter', 'forager', 'lumberjack', 'miner', 'mason', 'warrior', 'merchant'];
  const COLS = ['day', 'v', 'N', 'sur', 'imp', 'surPC', 'impPC', 'fert', 'gate', 'foodDays', ...JOBS.map((j) => 'n_' + j), 'fuelCov', 'cold', 'toolCov', 'health', 'happy', 'fdTot', 'kovTot'];
  const names = [], nameIdx = new Map(), rows = [];
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, lastWrite = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const c = E.DAILY_FOOD_CONSUMPTION;
  const dayRows = (day) => {
    const out = [];
    for (const vil of sv()) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      const N = (e.npcs || []).length, sur = e.surplusEMA ? e.surplusEMA.food : null, imp = e._importEMA != null ? e._importEMA : null;
      const fert = e._origLand && e._origLand.fertility > 0 && e.land ? e.land.fertility / e._origLand.fertility : null;
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      out.push([day, vi, N, r3(sur), r3(imp), N && sur != null ? r3(sur / (N * c)) : null, N && imp != null ? r3(imp / (N * c)) : null, r3(fert),
        e._t1297Gate == null ? null : e._t1297Gate, fe == null || !N ? null : r3(fe / N), ...JOBS.map((j) => (e.counts && e.counts[j]) || 0),
        e._fuelCov == null ? null : r3(e._fuelCov), e._coldStress == null ? null : r3(e._coldStress),
        e._toolDeps > 0 && e.storage ? r3(((e.storage.tool || 0) + (e.storage.bronze_tool || 0) + (e.storage.iron_tool || 0)) / e._toolDeps) : null,
        e.lastStats && typeof e.lastStats.health === 'number' ? r3(e.lastStats.health) : null, e.lastStats && typeof e.lastStats.happiness === 'number' ? r3(e.lastStats.happiness) : null,
        e._fdDeadTot || 0, (e._deadTot || 0) - (e._fdDeadTot || 0) - (e._natDeadTot || 0)]);
    }
    return out;
  };
  const dump = () => fs.writeFileSync(OUT + '.t1346.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, BIND: process.env.T1346_BIND || null, AUT: process.env.T1319_AUTUMN_LOOK || null, W: process.env.T1149_WINTER || null },
    cols: COLS, names, rows, last: lastDay, err: dayRows._err || null }));
  const mk = Ev.createLedger;
  Ev.createLedger = function () {
    const Lg = mk.apply(this, arguments), sd = Lg.scanDay;
    Lg.scanDay = function (world, day) {
      const r = sd.apply(this, arguments);
      try {
        if ((day | 0) === lastDay) return r; lastDay = day | 0;
        for (const q of dayRows(lastDay)) rows.push(q);
        if (lastDay - lastWrite >= 30) { lastWrite = lastDay; dump(); }
      } catch (e) { if (!dayRows._err) { dayRows._err = String(e && e.stack || e); } }
      return r;
    };
    return Lg;
  };
  process.on('exit', () => { try { dump(); } catch (e) { try { fs.writeFileSync(OUT + '.t1346.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
