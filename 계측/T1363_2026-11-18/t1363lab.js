'use strict';
// (@regress 없음 — 러너 밖 · T1363 ② 랩 글 계측 · 제품 무변 · 읽기만)
// === 계측/T1363_2026-11-18/t1363lab.js — 랩 자(`scripts/t17-metrics.js` — 랩과 같은 세계 조립 · 같은 econ 정본)의 마을-날 줄 ===
//   node -r <이 파일> scripts/t17-metrics.js 800 1020 · T1363_LABOUT=<json>
//   econ v2 `tickWorldV2` 를 감싸 하루가 끝날 때마다 마을마다 한 줄(서버 훅 t1363hook 과 같은 칸 일부): 사람 · 도구 몫 · 생산 도구 배수 · 석공 · 석공 목표 · 돌 · 재료 문턱 ·
//   곳간 날 수 · 기근 블록 · 치명 도구 · 식량 일꾼 · 그날 전환(피커가 낸 일 · 옮긴 사람의 옛 일) · 굶어 죽음 누계.
const path = require('path'), fs = require('fs');
const OUT = process.env.T1363_LABOUT; if (!OUT) return;
const ROOT = path.resolve(__dirname, '..', '..');
const V2 = require(path.join(ROOT, 'sim', 'economy-sim-v2.js'));
const E = require(path.join(ROOT, 'sim', 'economy-sim.js'));
const COLS = ['day', 'v', 'N', 'toolCov', 'toolBoost', 'n_mason', 'masonT', 'stone', 'stoneWork', 'foodDays', 'famine', 'toolCrit', 'n_farmer', 'n_fisher', 'n_hunter', 'n_forager', 'need', 'moves', 'fdTot', 'deadTot', 'natTot', 'kProd', 'toolMade'];
const names = [], rows = []; let day = 0;
const lastJob = new Map();   // 사람 id → 어제 일(서버 훅 t1363hook 과 같은 셈 — 그날 옮긴 사람 '옛 일>새 일')
const r3 = (x) => (x == null || !isFinite(x)) ? null : Math.round(x * 1000) / 1000;
const orig = V2.tickWorldV2;
V2.tickWorldV2 = function (world) {
  const r = orig.apply(this, arguments);
  try {
    (world.villages || []).forEach((e, vi) => {
      if (names[vi] === undefined) names[vi] = e.name;
      const N = (e.npcs || []).length, st = e.storage || {}, c = e.counts || {};
      const tI = st.iron_tool || 0, tB = st.bronze_tool || 0, tSt = st.tool || 0, tS = tI + tB + tSt, deps = e._toolDeps || 0;
      let boost = null;
      if (deps > 0) { const ni = Math.min(deps, tI), nb = Math.min(deps - ni, tB), ns = Math.min(deps - ni - nb, tSt), nn = deps - ni - nb - ns; boost = (ni * 1.8 + nb * 1.4 + ns * (e._toolQ != null ? e._toolQ : 1.4) + nn * 0.25) / deps; }
      let fe = null, mt = null, sw = null; try { fe = E.totalFoodEquivalent(e); } catch (_) {} try { mt = E.masonTarget(e); } catch (_) {} try { sw = E.stoneWorkStock(e); } catch (_) {}
      const sd = e._dbgSwitch && e._dbgSwitch.day === e.day ? e._dbgSwitch : (e._dbgSwitch && e._dbgSwitch.day === world.day ? e._dbgSwitch : null);
      const mv = {}; for (const p of e.npcs || []) { const j0 = lastJob.get(p.id); if (j0 !== undefined && j0 !== p.currentJob) { const kk = j0 + '>' + p.currentJob; mv[kk] = (mv[kk] || 0) + 1; } lastJob.set(p.id, p.currentJob); }
      rows.push([day, vi, N, deps > 0 ? r3(tS / deps) : null, r3(boost), c.mason || 0, r3(mt), r3(st.stone || 0), r3(sw), fe == null || !N ? null : r3(fe / N),
        fe == null ? null : (fe < N * 30 ? 1 : 0), tS < deps * 0.7 ? 1 : 0, c.farmer || 0, c.fisher || 0, c.hunter || 0, c.forager || 0,
        sd ? sd.need : null, Object.keys(mv).length ? mv : null, e._fdDeadTot || 0, e._deadTot || 0, e._natDeadTot || 0, e._kDbg && e._kDbg.prod != null ? e._kDbg.prod : null, r3(e.dailyProductionBuf ? e.dailyProductionBuf.tool : null)]);
    });
  } catch (err) { if (!V2._t1363Err) V2._t1363Err = String(err && err.stack || err); }
  day++;
  return r;
};
process.on('exit', () => { try { fs.writeFileSync(OUT, JSON.stringify({ cols: COLS, names, rows, err: V2._t1363Err || null })); } catch (_) {} });
