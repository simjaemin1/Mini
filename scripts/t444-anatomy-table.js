#!/usr/bin/env node
// === scripts/t444-anatomy-table.js — T394 값의 해부 표 (T444 ①③) ============================================
//   ⚠계측기 표(러너 밖). `t371-tick-rest.js`(T444_SUB=1)가 낸 JSON 들을 받아 팔마다 한 줄씩 낸다.
//   규약(`인계/Z-존서버.md` Z-자): 첫 경계 뒤(WAITDAY) · 같은 띠 · 같은 틀 · 분모 = npcs.size.
//   실행: node scripts/t444-anatomy-table.js a.json b.json …
'use strict';
const fs = require('fs');
const { DENOM } = require('./lib-tick-rule');
const rows = [];
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  const R = []; for (const s of j.run.slices) for (const r of (s.rest || [])) R.push(r);
  if (!R.length) { console.log(f, 'REST 줄 0'); continue; }
  const sum = (g) => R.reduce((a, r) => a + (g(r) || 0), 0);
  const ticks = sum((r) => r.n), pop = sum((r) => r.pop * r.n) / ticks;
  const perTickMs = (g) => sum(g) / ticks;
  const us = (g) => perTickMs(g) * 1000 / pop;
  const X = (k) => sum((r) => r.x && r.x[k]);
  // 걸음 계수(`walk.steps`)는 조각마다 비워진다(`/perf?reset`) · 틱 수(`tick.n`)는 **누계**다 ⇒ 조각 걸음 ÷ 이웃 조각 틱 차
  const W = j.run.slices.filter((s) => s.walk && s.walk.steps != null);
  let steps = 0, stTicks = 0;
  for (let k = 1; k < W.length; k++) { steps += W[k].walk.steps; stTicks += W[k].ticks - W[k - 1].ticks; }
  const segs = (j.run.segs || []).map((x) => x[0]);
  const rest = us((r) => r.tot) - us((r) => r.loopDec) - us((r) => r.loopMov) - us((r) => r.aoi);
  const p50 = j.run.slices.map((s) => s.p50).filter(Boolean).sort((a, b) => a - b);
  rows.push({ arm: j.ARM, ticks, pop, p50: p50[Math.floor(p50.length / 2)],
    tot: us((r) => r.tot), loopDec: us((r) => r.loopDec), loopMov: us((r) => r.loopMov), rest,
    ow: X('ow') / ticks, owMs: X('owT') / ticks, owUs: X('ow') ? X('owT') * 1000 / X('ow') : 0, owMoved: X('owMoved') / ticks, owRep: X('owRep'),
    oj: X('oj') / ticks, ojMs: X('ojT') / ticks, oq: X('oq') / ticks, wander: X('wander') / ticks,
    path: X('path') / ticks, pathMs: X('pathT') / ticks, pathUs: X('path') ? X('pathT') * 1000 / X('path') : 0,
    stepsPerTick: stTicks ? steps / stTicks : null });
}
const f = (v, d = 3) => (v == null ? '—' : (+v).toFixed(d));
console.log(`${DENOM.npcs}(★규약 ⓔ)`);
console.log('| 팔 | 틱 p50 | 사람당 합 | 결정 문 | 이동 문 | 그 밖 | 배회 결정/틱 | 되짚기(배회)/틱 · ms/틱 · µs/회 · 옮김/틱 · 반복 | 되짚기(튕김)/틱 · ms/틱 | 술어/틱 | 길 묻기/틱 · ms/틱 · µs/회 | 걸음/틱 |');
console.log('|---|---:|---:|---:|---:|---:|---:|---|---|---:|---|---:|');
for (const r of rows) console.log(`| ${r.arm} | ${f(r.p50)} | ${f(r.tot, 2)} | ${f(r.loopDec, 2)} | ${f(r.loopMov, 2)} | ${f(r.rest)} | ${f(r.wander, 1)} | ${f(r.ow, 1)} · ${f(r.owMs, 4)} · ${f(r.owUs, 2)} · ${f(r.owMoved, 2)} · ${r.owRep} | ${f(r.oj, 2)} · ${f(r.ojMs, 4)} | ${f(r.oq, 1)} | ${f(r.path, 0)} · ${f(r.pathMs, 3)} · ${f(r.pathUs, 3)} | ${f(r.stepsPerTick, 0)} |`);
fs.writeFileSync('/tmp/t444-table.json', JSON.stringify(rows, null, 1));
