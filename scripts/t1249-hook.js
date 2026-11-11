// (@regress 없음 — 계측 훅 · 러너 밖 · T1249 · 판정 0)
// === scripts/t1249-hook.js — 서버 판 광산 마을: 날마다 광부 수 · 원석 재고(종류별) · 원석 산출 ===
//
// 쓰는 법(존 아이 프리로드 · 세계에 손대지 않는다):
//   NODE_OPTIONS="--require $PWD/scripts/t745-vclock.js --require $PWD/scripts/t1249-hook.js" T745_VCLOCK=1 \
//     T1249_OUT=/tmp/t1249/srv node scripts/t577-server-run.js 400 1020
//   → `<OUT>.<시드>.jsonl` 한 줄 = 하루 { d · pop · miners(전 마을) · m: [[이름 · land.ore · 인구 · 광부 · 원석 합 · 종류별 원석 · 그날 원석 산출(수식 `dailyProductionBuf`) · 금속 글럿 · 몸 원석 누계 · 그날 몸 원석]] }
//   광산 마을 = land.ore > 0.15 또는 land.tin > 0.15(광부 정원이 서는 땅).
'use strict';
const path = require('path');
const fs = require('fs');
const OUT = process.env.T1249_OUT;
if (OUT && process.env.T577_SEED && /zone\.js$/.test(process.argv[1] || '')) {
  const ROOT = path.join(__dirname, '..');
  const f = `${OUT}.${process.env.T577_SEED}.jsonl`;
  try { fs.writeFileSync(f, ''); } catch (e) { /* 자리 */ }
  const OG = require(path.join(ROOT, 'server', 'ore-goods'));
  const Ev = require(path.join(ROOT, 'server', 'events'));
  const mk = Ev.createLedger;
  let last = -1;
  Ev.createLedger = function () {
    const L = mk.apply(this, arguments);
    const sd = L.scanDay;
    L.scanDay = function (world, day) {
      try {
        const d = day | 0;
        if (d !== last) {
          last = d;
          let pop = 0, miners = 0; const m = [];
          for (const v of (world.villages || [])) {
            const N = (v.npcs || []).length; pop += N;
            const mn = (v.npcs || []).filter((n) => n.currentJob === 'miner').length; miners += mn;
            const L0 = v.land || {};
            if (!((L0.ore || 0) > 0.15 || (L0.tin || 0) > 0.15)) continue;
            const st = v.storage || {}; const typed = {};
            for (const k of OG.ids) if ((st[k] || 0) > 0) typed[k] = +st[k].toFixed(2);
            const tot = (st.ore || 0) + OG.ids.reduce((s, k) => s + (st[k] || 0), 0);
            const dp = v.dailyProductionBuf || {}; const out = (dp.ore || 0) + OG.ids.reduce((s, k) => s + (dp[k] || 0), 0);   // 그날 econ 산출(`dailyProductionBuf` — 날 머리에 0 으로 지운다)
            const inCum = v._t1188InByItem ? Object.values(v._t1188InByItem).reduce((s, q) => s + (q || 0), 0) : 0;   // 몸이 곳간에 넣은 원석 누계(쪼개기 판 · `mineToGranary`)
            m.push([v.name, +(L0.ore || 0).toFixed(2), N, mn, +tot.toFixed(2), typed, +(+out).toFixed(3), +(v._metalGlut || 0).toFixed(3), +inCum.toFixed(3), +(v._t724InflowToday || 0).toFixed(3)]);
          }
          let t724 = null, outLast = null;
          try { const V = require(path.join(ROOT, 'server', 'villages')); const tp = V.tickPerf ? V.tickPerf() : null; const P = tp && tp.probe && tp.probe.t724;   // ★[T1266 · T1256 회부 3] 채굴 셈은 `probeStats()` 안(`tickPerf().probe.t724`) — 겉 `tickPerf().t724` 는 늘 없다(종전 글자가 읽던 자리)
            if (P) t724 = { pulse: P.pulse, sw: P.sw, kg: +(+P.kg).toFixed(2), bodies: P.bodies, gran: P.gran, granU: +(+P.granU).toFixed(3), dusk: P.dusk, duskU: +(+P.duskU).toFixed(3), done: P.done, none: P.none, walk: P.walk, wait: P.wait, repick: P.repick, full: P.full, picks: P.picks }; } catch (e) {}
          let bodyMiners = 0; const acts = {};
          try { const V = require(path.join(ROOT, 'server', 'villages')); const st = V.__labProbe._t740Probe.setup(); const pl = st && st.deps && st.deps.players;   // 인자 없이 = 읽기만
            if (pl) for (const p of pl.values()) if (p && p.isNpc && p.simJob === 'miner') { bodyMiners++; const a = p._lifeAct || '(없음)'; acts[a] = (acts[a] || 0) + 1; } } catch (e) {}
          outLast = (world.villages || []).filter((v) => ((v.land || {}).ore || 0) > 0.15).map((v) => +((v._oreOutLast || 0)).toFixed(3));
          fs.appendFileSync(f, JSON.stringify({ d, pop, miners, m, t724, outLast, bodyMiners, acts }) + '\n');
        }
      } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
}
