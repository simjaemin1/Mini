#!/usr/bin/env node
// === scripts/t371-rest-table.js — t371-tick-rest.js 가 낸 JSON 을 **표 하나**로 줄인다 (T371) ==========
// 실행: node scripts/t371-rest-table.js /tmp/t371-rest-day.json [/tmp/t371-rest-night.json]
//   ★T356 정의 그대로: 그 밖 = tot − loopDec − loopMov − aoi.
//   ★자 값은 계수로 뺀다: 갈래마다 틱당 `cut()` 한 번 ⇒ `cutNs × 1` 을 그 갈래에서 뺀다.
'use strict';
const fs = require('fs');
const DEN = 8.22;              // T356 낮 합(µs/사람) — 카드가 %의 분모로 지정한 수
const DEN_N = 3.93;            // T356 밤 합
const REST356 = { day: 2.11, night: 1.46 };
// 호출/틱 — 원본에서 센 수(계측기가 아니라 **소스가 정본**이다). `N` = 주민 수 · `M` = 몹 수.
const CALLS = { head: '1', econDay: '1', worldDay: '4', idleScan: '1 루프(≤N · 첫 사람에서 break)',
  chunks: '1', spatial: '2 (인덱스 셋 재삽입: N + M + 활성청크 건물)', inputTO: '1 루프(N)', decPre: '0 (주석뿐)',
  farm: '1 (평시 정수 비교 1 · 게임일 경계에만 순회)', arrows: '3 (화살 + ghost 맵 둘)',
  stairs: '2 루프(N + M)', fall: '2 루프(N + M)', gauge: '1 루프(N)', hpRegen: '1 루프(N)',
  gaugeNet: '1 루프(N)', mobs: '1 루프(M)', wildlife: '1' };

const SEGS = ['head','econDay','worldDay','idleScan','chunks','spatial','inputTO','decPre','farm','arrows',
  'stairs','fall','gauge','hpRegen','gaugeNet','mobs','wildlife'];

function reduce(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const W = j.WINDOW, segs = (j.run.segs || SEGS.map((k) => [k])).map((s) => s[0]);
  const keys = segs.concat(['loopDec', 'loopMov', 'aoi']);
  const acc = {}; for (const k of keys) acc[k] = 0;
  let ticks = 0, tot = 0, popSum = 0, mobSum = 0, lines = 0, clockNs = 0, cutNs = 0, p50 = [];
  // ★줄의 출처 — 조각에 담긴 것이 있으면 그것을, 없으면(첫 판의 바이트/글자 버그) **로그를 직접** 읽고
  //   그 창의 국면(phase)에 든 줄만 고른다. 어느 쪽이든 **같은 줄**이다(지어낸 수 0).
  let lo = 1e9, hi = -1e9;
  for (const s of j.run.slices) { if (s.phase != null) { if (s.phase < lo) lo = s.phase; if (s.phase > hi) hi = s.phase; } }
  let src = [];
  for (const s of j.run.slices) { if (s.p50) p50.push(s.p50); src = src.concat(s.rest || []); }
  if (!src.length) {
    const LOG = `/tmp/t371-${W}.log`;
    const span = (hi - lo) / Math.max(1, j.run.slices.length - 1);
    src = fs.readFileSync(LOG, 'utf8').split('\n').filter((x) => x.startsWith('[REST] '))
      .map((x) => { try { return JSON.parse(x.slice(7)); } catch (e) { return null; } }).filter(Boolean)
      .filter((r) => r.phase >= lo - span && r.phase <= hi + span);
  }
  for (const r of src) {
    ticks += r.n; tot += r.tot; popSum += r.pop * r.n; mobSum += r.mobN * r.n; lines++;
    clockNs += r.clockNs; cutNs += r.cutNs;
    for (const k of keys) acc[k] += r[k] || 0;
  }
  if (!ticks) throw new Error('REST 줄이 없다: ' + file);
  clockNs /= lines; cutNs /= lines;
  const pop = popSum / ticks, mob = mobSum / ticks;
  const us = (msSum) => (msSum / ticks) * 1000 / pop;          // ms합 → 사람당 µs
  const cutUs = (cutNs / 1e3) / pop;                            // 갈래 하나의 자 값(사람당 µs)
  const rows = segs.map((k) => ({ k, raw: us(acc[k]), us: Math.max(0, us(acc[k]) - cutUs) }));
  const restMeas = us(tot) - us(acc.loopDec) - us(acc.loopMov) - us(acc.aoi);
  const sum = rows.reduce((a, r) => a + r.us, 0);
  return { W, file, ticks, pop, mob, clockNs, cutNs, cutUs, p50: p50.sort((a, b) => a - b)[Math.floor(p50.length / 2)],
    tot: us(tot), loopDec: us(acc.loopDec), loopMov: us(acc.loopMov), aoi: us(acc.aoi),
    rest: restMeas, rows, sum, gap: restMeas - sum };
}

const out = process.argv.slice(2).filter(Boolean).map(reduce);
for (const r of out) {
  const DENOM = r.W === 'day' ? DEN : DEN_N;
  console.log(`\n=== ${r.W} · 틱 ${r.ticks} · 주민 ${r.pop.toFixed(0)} · 몹 ${r.mob.toFixed(0)} · 틱 p50 ${r.p50}ms ===`);
  console.log(`틀: tot ${r.tot.toFixed(2)} − loopDec ${r.loopDec.toFixed(2)} − loopMov ${r.loopMov.toFixed(2)} − aoi ${r.aoi.toFixed(2)} = 그 밖 ${r.rest.toFixed(2)} µs/사람 (T356 ${REST356[r.W]})`);
  console.log('| 갈래 | µs/사람 | %(T356 합 ' + DENOM + ') | %(이 판 합 ' + r.tot.toFixed(2) + ') | %(이 판 그 밖) | 호출/틱 |');
  console.log('|---|---:|---:|---:|---:|---|');
  for (const x of r.rows.slice().sort((a, b) => b.us - a.us))
    console.log(`| ${x.k} | ${x.us.toFixed(3)} | ${(x.us / DENOM * 100).toFixed(1)} | ${(x.us / r.tot * 100).toFixed(1)} | ${(x.us / r.rest * 100).toFixed(1)} | ${CALLS[x.k] || '1'} |`);
  console.log(`| **합** | **${r.sum.toFixed(2)}** | **${(r.sum / DENOM * 100).toFixed(1)}** | **${(r.sum / r.tot * 100).toFixed(1)}** | **${(r.sum / r.rest * 100).toFixed(1)}** | 17 |`);
  console.log(`| 못 가른 것 | ${r.gap.toFixed(3)} | ${(r.gap / DENOM * 100).toFixed(1)} | ${(r.gap / r.tot * 100).toFixed(1)} | ${(r.gap / r.rest * 100).toFixed(1)} | — |`);
  console.log(`자 값: clock ${r.clockNs.toFixed(1)}ns · cut ${r.cutNs.toFixed(1)}ns · 갈래당 ${(r.cutUs * 1000).toFixed(3)}ns/사람 · 틱당 20번 = ${(r.cutNs * 20 / 1e6).toFixed(4)}ms`);
}
fs.writeFileSync('/tmp/t371-table.json', JSON.stringify(out, null, 1));
