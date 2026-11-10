// (@regress 없음 — 계측 훅 · 러너 밖 · T1249 · 판정 0)
// === scripts/t1249-hook.js — 서버 판 광산 마을: 날마다 광부 수 · 원석 재고(종류별) · 원석 산출 ===
//
// 쓰는 법(존 아이 프리로드 · 세계에 손대지 않는다):
//   NODE_OPTIONS="--require $PWD/scripts/t745-vclock.js --require $PWD/scripts/t1249-hook.js" T745_VCLOCK=1 \
//     T1249_OUT=/tmp/t1249/srv node scripts/t577-server-run.js 400 1020
//   → `<OUT>.<시드>.jsonl` 한 줄 = 하루 { d · pop · miners(전 마을) · m: [[이름 · land.ore · 인구 · 광부 · 원석 합 · 종류별 원석 · 그날 원석 산출 · 금속 글럿]] }
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
            m.push([v.name, +(L0.ore || 0).toFixed(2), N, mn, +tot.toFixed(2), typed, +(+out).toFixed(3), +(v._metalGlut || 0).toFixed(3)]);
          }
          fs.appendFileSync(f, JSON.stringify({ d, pop, miners, m }) + '\n');
        }
      } catch (e) { /* 계측 실패는 판을 안 막는다 */ }
      return sd.apply(this, arguments);
    };
    return L;
  };
}
