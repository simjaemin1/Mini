#!/usr/bin/env node
// === scripts/t218-straw.js — T218: 켠 팔의 볏짚 −36~−46% 는 어디서 오나 ===========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T218 §0]
//   T210 이 "켠 팔에서 볏짚이 −36~−46% 로 가장 크게 준다" 까지 갔다. 카드는 그 원인을 **배선 누락**으로
//   보고 한 줄을 요구했는데, §0-ⓐ 가 먼저 답을 냈다 — **밭 수확은 이미 `_grainToday` 에 닿는다**
//   (`harvestToGranary:935` · `gardenFloorTopUp:995`). 그래서 이 파일이 하는 일은 **그 −36~−46% 를
//   `min(상한, 원량)` 의 두 조각으로 가르는 것**이다: 인구가 준 것인가, 곡식이 준 것인가.
//
// ★상수를 옮겨 적지 않는다 — 계측기가 정본 소스에서 읽어 JSON 에 담았다.
//
// 실행: node scripts/t218-straw.js /tmp/t218 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t218';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const sh = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + '%' : '—');

const ARMS = [['OFF', 'off'], ['ON+장부', 'led']];
const got = [];
for (const s of SEEDS) {
  const row = { s }; let ok = true;
  for (const [, t] of ARMS) { row[t] = load(path.join(DIR, `${t}_${s}.json`)); if (!row[t]) ok = false; }
  if (!ok) { console.log(`  ⚠시드 ${s} — 자료 없다`); continue; }
  got.push(row);
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const H = got[0].led, D = H.days;

console.log(`\n=== T218 — 켠 팔의 볏짚: 배선이 아니라 **인구와 곡식**이었다 (51마을 · ${D}일 · 3시드) ===`);
console.log(`  베이스 ${H.base || '?'} · 팔 둘(끔 / 켬+장부) — **셋째 팔은 없다**: 밭 수확은 이미 \`_grainToday\` 에 닿는다(§0-ⓐ).`);
console.log(`  정본 상수: FIREWOOD_PC ${H.FIREWOOD_PC} · STRAW_FUEL_PER_FOOD ${H.STRAW_FUEL_PER_FOOD}`);

// ── ⓐ 볏짚을 두 조각으로 ────────────────────────────────────────────────────
console.log('\nⓐ 볏짚 = `min(상한 N×FIREWOOD_PC, 원량 곡식×STRAW)` — 어느 쪽이 무나');
console.log('  시드  팔        볏짚 합   상한 합   원량 합   원량/상한   상한이 문 날   볏짚 난 날   Σ인구·일   장부유입(곡식)');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(o.supStrawTot).padStart(9)
      + r0(o.strawCapTot).padStart(10) + r0(o.strawRawTot).padStart(10)
      + (o.strawCapTot > 0 ? (o.strawRawTot / o.strawCapTot).toFixed(2) : '—').padStart(11) + '배'
      + `${nf(o.strawCapDaysTot)}/${nf(o.strawDaysTot)}`.padStart(16)
      + nf(o.strawDaysTot).padStart(13) + nf(o.popDaysTot).padStart(12)
      + r0(o.prodLedgerTot).padStart(15));
  }
  const a = g.off, b = g.led;
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(9) + pct(b.supStrawTot, a.supStrawTot).padStart(9)
    + pct(b.strawCapTot, a.strawCapTot).padStart(10) + pct(b.strawRawTot, a.strawRawTot).padStart(10)
    + ''.padStart(13) + ''.padStart(16) + pct(b.strawDaysTot, a.strawDaysTot).padStart(13)
    + pct(b.popDaysTot, a.popDaysTot).padStart(12) + pct(b.prodLedgerTot, a.prodLedgerTot).padStart(15));
}
console.log('  ※상한 합 = Σ(N × FIREWOOD_PC) 이므로 **Σ인구·일 × FIREWOOD_PC** 그 자체다 — 상한이 주는 건 곧 인구가 주는 것이다.');
console.log('  ※원량 합 = Σ(오늘 곡식 × STRAW_FUEL_PER_FOOD) · 오늘 곡식 = `_grainToday` = `dailyProductionBuf.food`(두 팔 모두).');

console.log("\nⓐ' 그래서 −36~−46% 는 어디서 왔나 — **곡식이 준 몫**과 **상한이 버린 몫**");
console.log('  시드  팔        원량 합   볏짚 합   **버려진 몫**   버림 비율   |  Δ볏짚   그중 곡식 몫   그중 버림 몫   버림이 차지하는 비중');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], waste = o.strawRawTot - o.supStrawTot;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(o.strawRawTot).padStart(9)
      + r0(o.supStrawTot).padStart(10) + r0(waste).padStart(15) + sh(waste, o.strawRawTot).padStart(11));
  }
  const a = g.off, b = g.led;
  const wA = a.strawRawTot - a.supStrawTot, wB = b.strawRawTot - b.supStrawTot;
  const dStraw = b.supStrawTot - a.supStrawTot, dRaw = b.strawRawTot - a.strawRawTot, dW = wB - wA;
  console.log('  ' + ''.padEnd(6) + '귀속'.padEnd(9) + ''.padStart(45)
    + '  |' + r0(dStraw).padStart(8) + r0(dRaw).padStart(14) + r0(-dW).padStart(14)
    + sh(Math.abs(dW), Math.abs(dStraw)).padStart(22));
}
console.log('  ※버려진 몫 = Σ(원량 − min(상한, 원량)) — **볏짚은 저장이 안 된다**. 상한 `N × FIREWOOD_PC` 는 그날 취사·난방');
console.log('    수요 그 자체라, 하루에 그보다 많이 나온 짚은 **그날로 사라진다**.');
console.log('  ※끈 팔 농부의 곡식은 **고르다** — 마을·일당 원량이 상한의 0.09배라 33,000일 중 **한 번도** 상한에 안 걸린다(버림 0).');
console.log('    켠 팔의 밭은 **치우쳐 있다** — 상한에 걸리는 날이 전체의 2.5% 뿐인데 그 며칠이 원량의 29~33% 를 버린다');
console.log('    (버린 날 하루 평균 ≈ 상한의 2배가 들어온다). 같은 총량이라도 **고르게 오면 다 쓰이고 몰려 오면 버려진다**.');

// ── ⓑ 연료·목재로 이어지는 자리 ─────────────────────────────────────────────
console.log('\nⓑ 그 볏짚이 연료·목재에 하는 일 (T210 ⓐ 열 + T207 목재 수지)');
console.log('  시드  팔        충당률   충당<1 마을·일   건강    볏짚 몫   연료 목재   건축 목재   끝 재고   못 짓는 마을   인구   소멸');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    const sup = o.supStrawTot + o.supLowTot + o.supWoodTot;
    const bad = o.per.filter((p) => p.everPop && p.woodZeroDays / D >= 0.5).length;
    const h = o.per.reduce((x, p) => x + (p.healthMean || 0), 0) / o.per.length;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + String(o.fuelCovMean).padStart(9)
      + `${nf(o.covLtDaysTot)}/${nf(o.live * o.days)}`.padStart(17) + h.toFixed(4).padStart(9)
      + sh(o.supStrawTot, sup).padStart(9) + r0(o.supWoodTot).padStart(11) + r0(o.woodBuiltTot).padStart(11)
      + r0(o.woodStockEndTot).padStart(10) + `${bad}/${o.ever}`.padStart(13)
      + nf(o.pop).padStart(8) + `${o.dead}/${o.ever}`.padStart(8));
  }
}
console.log('');
