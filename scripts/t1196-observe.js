'use strict';
// === scripts/t1196-observe.js — T1196 장인 작업장 관측(계측기 · 러너 밖 · 제품 무변) ======================================
//   서버 판 자(`t577-server-run.js` · `physical-production-check.js`) 아이 존에 `--require` 로 싣는다(`NODE_OPTIONS`).
//   5초마다 `$T577_OUT.t1196.json` 에 쓴다: `villages.artisanPerf()`(작업표 몸 · 일괄 · 늦음 · 모자람 · 품목별 몸이 넣은 몫 · 시설 있는 마을) +
//   그날 econ 장인 산출 다섯(곳간 재고 · 품질 EMA) · 장인 몸 라벨 표 · 날마다 한 줄(날이 바뀔 때).
if (require('worker_threads').isMainThread && process.env.T577_OUT) {
  const fs = require('fs'), V = require('../server/villages'), state = V.__p3Bind({}).state;
  const ART = ['mason', 'smith', 'armorsmith', 'tailor', 'cook'], OUT = ['tool', 'weapon', 'armor', 'clothes', 'cooked_food'];
  const days = []; let lastDay = -1;
  const snap = () => {
    const vs = state.villages || [], stock = {}, counts = {}, labels = {};
    let wq = 0, wqn = 0, cq = 0, cqn = 0, pop = 0;
    for (const v of vs) {
      const e = v.econ; if (!e) continue; pop += (e.npcs || []).length;
      for (const k of OUT) stock[k] = +((stock[k] || 0) + (e.storage[k] || 0)).toFixed(3);
      for (const j of ART) counts[j] = (counts[j] || 0) + ((e.counts && e.counts[j]) || 0);
      if (e._weapQ != null) { wq += e._weapQ; wqn++; } if (e._clothQ != null) { cq += e._clothQ; cqn++; }
    }
    for (const p of (state.deps && state.deps.players ? state.deps.players.values() : [])) if (ART.includes(p.simJob)) { const k = p.simJob + ':' + (p._lifeAct || ''); labels[k] = (labels[k] || 0) + 1; }
    return { day: state.world && state.world.day, pop, stock, counts, weapQ: wqn ? +(wq / wqn).toFixed(4) : null, clothQ: cqn ? +(cq / cqn).toFixed(4) : null, labels, perf: V.artisanPerf ? V.artisanPerf() : null };
  };
  const dump = () => { try { const s = snap(); if (s.day !== lastDay) { lastDay = s.day; days.push({ day: s.day, pop: s.pop, stock: s.stock, perf: s.perf && { made: s.perf.made, body: s.perf.body, batch: s.perf.batch, late: s.perf.late, short: s.perf.short, queue: s.perf.queue, held: s.perf.held } }); } fs.writeFileSync(process.env.T577_OUT + '.t1196.json', JSON.stringify({ last: s, days })); } catch (e) {} };
  process.on('exit', dump); setInterval(dump, 5000).unref();
}
