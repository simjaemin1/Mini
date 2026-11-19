// 서버 판 계측(세계 0 · 읽기만) — T1363: 굶주림 ↔ 도구 나선 — 마을-날 줄(도구 · 석공 · 돌 · 기근 블록 · 직업 고르기 · K 셋 · 흐름 · 죽음)
//   마을-날 줄(`COLS` 차례):
//     도구 — 곳간 도구(석기 + 청동 + 철) · 도구 쓰는 일꾼(`_toolDeps` — 생산 단계가 남긴 칸) · 도구 몫(곳간 ÷ 일꾼) ·
//            그날 생산 도구 배수(생산 단계의 `toolBoostShared` 식 그대로 — 철 1.8 · 청동 1.4 · 석기 `_toolQ` · 맨손 0.25 · 곳간으로 다시 셈) · 그날 만든 석기(`dailyProductionBuf.tool`)
//     석공 — 석공 수 · 석공 노동 목표(`masonTarget` — 정본 함수 그대로) · 곳간 돌 · 석공 하루 재료 문턱(`stoneWorkStock` — 정본) · 땅 돌(`land.stone`)
//     기근 블록 — 곳간 날 수(`totalFoodEquivalent` ÷ 사람) · 블록 켬(곳간 < 사람 × 30 — 피커 `foodEquiv < N * 30` 그 식) · 치명 도구(곳간 도구 < 일꾼 × 0.7 — 피커 S2 `_toolCrit` 그 식)
//     일 — 농부 · 어부 · 사냥꾼 · 채집꾼 · 나무꾼 · 광부 · 전사 · 대장장이 수
//     직업 고르기 — 그날 전환이 섰으면 피커가 낸 일(`_dbgSwitch.need`) · 그날 옮긴 사람 '옛 일>새 일' 수(사람 id 로 어제 일과 견준다 — `_dbgSwitch.did` 는 옮긴 뒤 일을 적는다)
//     그날 만든 돌(`dailyProductionBuf.stone`) · 그날 만든 식량(곡식 · 생선 · 고기 — `food + fish + meat`)
//     K 셋(`_kDbg` — 자리 · 식량 흐름 · 땔감) · 흐름 장부(`surplusEMA.food`) · 들여온 식량(`_importEMA`) · 땔감 충당(`_fuelCov`) · 건강 · 굶어 죽음 누계(`_fdDeadTot`) · K 위 죽음 누계
//   30날마다 파일을 새로 쓴다(판이 도중에 죽어도 그때까지 줄이 남는다) · 끝날 때 한 번 더.
//   ⚠값 함수 · 캐시를 세우는 함수는 안 부른다 — 칸을 읽고 순수 함수(식량 환산 · 석공 목표 · 재료 문턱)만 부른다(끈 판이 기준선과 같아야 한다 — 판 지문으로 확인).
'use strict';
if (process.env.T577_OUT) {
  const path = require('path'), fs = require('fs');
  const ROOT = process.env.T1363_ROOT || path.resolve(__dirname, '..', '..'), OUT = process.env.T577_OUT;
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
  const JOBS = ['farmer', 'fisher', 'hunter', 'forager', 'lumberjack', 'miner', 'warrior', 'smith'];
  const COLS = ['day', 'v', 'N', 'toolStock', 'toolDeps', 'toolCov', 'toolBoost', 'toolMade', 'n_mason', 'masonT', 'stone', 'stoneWork', 'landStone',
    'foodDays', 'famine', 'toolCrit', ...JOBS.map((j) => 'n_' + j), 'need', 'moves', 'kSlot', 'kProd', 'kFuel', 'sur', 'imp', 'fuelCov', 'health', 'fdTot', 'kovTot', 'stoneMade', 'foodMade'];
  const names = [], nameIdx = new Map(), rows = [];
  const lastJob = new Map();   // 사람 id → 어제 일(전환 = 어제와 다른 일 · 새로 난 사람 · 죽은 사람은 안 센다)
  const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
  let lastDay = -1, lastWrite = -1;
  const sv = () => { const vm = require.cache[path.join(ROOT, 'server', 'villages.js')], VS = vm && vm.exports; return VS && VS.__labProbe && VS.__labProbe._t569Probe ? (VS.__labProbe._t569Probe.setup().villages || []) : []; };
  const dayRows = (day) => {
    const out = [];
    for (const vil of sv()) {
      const e = vil && vil.econ; if (!e || e.founder) continue;
      let vi = nameIdx.get(vil.name); if (vi === undefined) { vi = names.length; names.push(vil.name); nameIdx.set(vil.name, vi); }
      const N = (e.npcs || []).length, st = e.storage || {}, c = e.counts || {};
      const tIron = st.iron_tool || 0, tBr = st.bronze_tool || 0, tSt = st.tool || 0, tS = tIron + tBr + tSt;
      const deps = e._toolDeps || 0;
      let boost = null;
      if (deps > 0) {
        const ni = Math.min(deps, tIron), nb = Math.min(deps - ni, tBr), ns = Math.min(deps - ni - nb, tSt), nn = deps - ni - nb - ns;
        boost = (ni * 1.8 + nb * 1.4 + ns * (e._toolQ != null ? e._toolQ : 1.4) + nn * 0.25) / deps;
      }
      let fe = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {}
      let mt = null, sw = null; try { mt = E.masonTarget(e); } catch (_) {} try { sw = E.stoneWorkStock(e); } catch (_) {}
      const sd = e._dbgSwitch && e._dbgSwitch.day === day ? e._dbgSwitch : null, k = e._kDbg || {};
      const mv = {};   // 그날 옮긴 사람 — '옛 일>새 일' 수(econ `_dbgSwitch.did` 는 옮긴 뒤 일을 적어 옛 일을 못 본다 · 사람 id 로 어제 일과 견준다)
      for (const p of e.npcs || []) { const j0 = lastJob.get(p.id); if (j0 !== undefined && j0 !== p.currentJob) { const kk = j0 + '>' + p.currentJob; mv[kk] = (mv[kk] || 0) + 1; } lastJob.set(p.id, p.currentJob); }
      const dp = e.dailyProductionBuf || {};
      out.push([day, vi, N, r3(tS), deps, deps > 0 ? r3(tS / deps) : null, r3(boost), r3(e.dailyProductionBuf ? e.dailyProductionBuf.tool : null),
        c.mason || 0, r3(mt), r3(st.stone || 0), r3(sw), r3(e.land ? e.land.stone : null),
        fe == null || !N ? null : r3(fe / N), fe == null ? null : (fe < N * 30 ? 1 : 0), tS < deps * 0.7 ? 1 : 0,
        ...JOBS.map((j) => c[j] || 0), sd ? sd.need : null, Object.keys(mv).length ? mv : null,
        k.slot == null ? null : k.slot, k.prod == null ? null : k.prod, k.fuel == null ? null : k.fuel,
        e.surplusEMA ? r3(e.surplusEMA.food) : null, e._importEMA != null ? r3(e._importEMA) : null, e._fuelCov == null ? null : r3(e._fuelCov),
        e.lastStats && typeof e.lastStats.health === 'number' ? r3(e.lastStats.health) : null,
        e._fdDeadTot || 0, (e._deadTot || 0) - (e._fdDeadTot || 0) - (e._natDeadTot || 0), r3(dp.stone || 0), r3((dp.food || 0) + (dp.fish || 0) + (dp.meat || 0))]);
    }
    return out;
  };
  const dump = () => fs.writeFileSync(OUT + '.t1363.json', JSON.stringify({ env: { BUNDLE: process.env.T1334_BUNDLE || null, BIND: process.env.T1363_BIND || null, FIX: process.env.T1363_FAMINE_TOOLS || null },
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
  process.on('exit', () => { try { dump(); } catch (e) { try { fs.writeFileSync(OUT + '.t1363.json', JSON.stringify({ err: String(e && e.stack || e) })); } catch (_) {} } });
}
