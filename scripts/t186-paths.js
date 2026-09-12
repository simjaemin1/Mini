#!/usr/bin/env node
// === scripts/t186-paths.js — T186: 켠 팔은 왜 가난한가 (경로 진단 표 셋) ==========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T186 §0]
//   재는 자는 `scripts/t176-ab.js` 그대로다(관측 항만 늘렸다 · 세계 수 무변). 이 파일은 그 JSON 을
//   ⓐ 직업 분포 · ⓑ 곳간 수지 · ⓒ 죽은 마을 궤적 셋으로 읽기만 한다 — 산수는 비율과 합뿐이다.
//
// 실행: node scripts/t186-paths.js /tmp/t186 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const econ = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t186';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

const got = [];
for (const s of SEEDS) {
  const off = load(path.join(DIR, `off_${s}.json`)), on = load(path.join(DIR, `on_${s}.json`));
  if (!off || !on) { console.log(`  ⚠시드 ${s} — 자료 없다(off ${!!off} · on ${!!on})`); continue; }
  got.push({ s, off, on });
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const DAYS = got[0].on.days, NV = got[0].on.ever;

console.log(`\n=== T186 — 켠 팔은 왜 가난한가 (실지도 ${NV}마을 · ${DAYS}일 · 3시드 · 코드 0) ===`);
console.log(`  베이스 ${got[0].on.base || '?'} · 소비 앵커 DAILY_FOOD_CONSUMPTION = ${econ.DAILY_FOOD_CONSUMPTION}(하루 한 사람)`);

// ── ⓐ 직업 분포 — 농부가 준 만큼 어디로 갔나 ────────────────────────────────
console.log('\nⓐ 직업 분포(마을·일) — 켜면 농부가 어디로 가나');
const JOBS = econ.JOB_NAMES;
console.log('  시드  팔   ' + JOBS.filter((j) => got.some((g) => (g.off.jobDaysTot[j] || 0) + (g.on.jobDaysTot[j] || 0) > 0))
  .map((j) => j.slice(0, 9).padStart(10)).join(''));
const LIVE = JOBS.filter((j) => got.some((g) => (g.off.jobDaysTot[j] || 0) + (g.on.jobDaysTot[j] || 0) > 0));
for (const g of got) {
  const row = (t, o) => '  ' + String(g.s).padEnd(6) + t.padEnd(5) + LIVE.map((j) => nf(o.jobDaysTot[j] || 0).padStart(10)).join('');
  console.log(row('OFF', g.off)); console.log(row('ON', g.on));
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(5) + LIVE.map((j) => pct(g.on.jobDaysTot[j] || 0, g.off.jobDaysTot[j] || 0).padStart(10)).join(''));
  const dOff = LIVE.reduce((a, j) => a + (g.off.jobDaysTot[j] || 0), 0), dOn = LIVE.reduce((a, j) => a + (g.on.jobDaysTot[j] || 0), 0);
  const share = (o, tot) => LIVE.map((j) => (((o.jobDaysTot[j] || 0) / tot * 100).toFixed(1) + '%').padStart(10)).join('');
  console.log('  ' + ''.padEnd(6) + '몫끔'.padEnd(5) + share(g.off, dOff));
  console.log('  ' + ''.padEnd(6) + '몫켬'.padEnd(5) + share(g.on, dOn));
}

console.log('\nⓐ\' 배분식 **밖**의 자리 — 농부를 미는 건 어디인가');
console.log('  시드  팔    식량자리 ΣslotK   확장셀   기근게이트 마을·일   식량 그림자가격   surplusEMA<0 마을·일   개간완료율이 심긴 날');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + nf(o.kSlotTot).padStart(14) + nf(o.expand).padStart(9)
      + nf(o.famineDaysTot).padStart(20) + String(o.priceFoodMean).padStart(18)
      + `${nf(o.surplusNegDaysTot)} / ${nf(o.live * o.days)}`.padStart(24)
      + nf(o.clearedFracDaysTot).padStart(22));
  }
}
console.log('  ※`개간 완료율(_clearedFrac)` 은 econ 이 농사 산출·prodK 에 곱하는 칸이다 — **0 이면 아무도 안 심었다**(다리가 죽어 있다).');

// ── ⓑ 곳간 수지 — 장부가 본 식량과 실제로 든 식량 ───────────────────────────
console.log('\nⓑ 곳간 수지 — **흐름 장부(`dailyProductionBuf.food`)가 본 식량** 대 실제로 곳간에 든 식량');
console.log('  시드  팔     밭 실체유입   장부가 본 유입   장부가 못 본 몫   소비 앵커(Σ인구·일)   끝 곳간   끝 식량등가   세금   식량 수입   화물 보냄');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
    const real = o.knob ? (o.harvestNTot * o.k + o.floorTot) : 0;
    const miss = o.knob ? real : 0;   // 켠 팔에선 밭 유입이 통째로 장부 밖이다(아래 ⓑ' 가 그걸 증명한다)
    const foodEq = o.per.reduce((a, p) => a + (p.stockFoodEq || 0), 0);
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + r0(real).padStart(12) + r0(o.prodLedgerTot).padStart(16)
      + r0(miss).padStart(17) + r0(o.popDaysTot * econ.DAILY_FOOD_CONSUMPTION).padStart(21)
      + r0(o.econFoodTot).padStart(11) + r0(foodEq).padStart(13)
      + r0(o.taxFoodTot).padStart(8) + r0(o.foodImportedTot).padStart(11) + r0(o.cargoSentTot).padStart(11));
  }
  const b = g.off, a = g.on;
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(6) + ''.padStart(12) + pct(a.prodLedgerTot, b.prodLedgerTot).padStart(16)
    + ''.padStart(17) + pct(a.popDaysTot, b.popDaysTot).padStart(21)
    + pct(a.econFoodTot, b.econFoodTot).padStart(11)
    + pct(a.per.reduce((x, p) => x + (p.stockFoodEq || 0), 0), b.per.reduce((x, p) => x + (p.stockFoodEq || 0), 0)).padStart(13)
    + pct(a.taxFoodTot, b.taxFoodTot).padStart(8) + pct(a.foodImportedTot, b.foodImportedTot).padStart(11)
    + pct(a.cargoSentTot, b.cargoSentTot).padStart(11));
}
console.log("\nⓑ\" 식량 한 톨의 값 — 같은 농부·일이 내는 양을 두 팔에서 나란히(★이 카드의 핵심 수)");
console.log('  시드  팔     식량 유입(팔의 정본 경로)   농부·일   **유입/농부·일**   Σ인구·일   **유입/인구·일**');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
    // 끈 팔의 정본 경로 = 추상 `addProduce` 가 장부에 적은 `food`(배수 적용 **후**의 실현량)
    // 켠 팔의 정본 경로 = `harvestToGranary` + 텃밭 하한이 곳간에 넣은 양(배수 없음 — 그 자체가 실현량)
    const inflow = o.knob ? (o.harvestNTot * o.k + o.floorTot) : o.prodLedgerTot;
    const fd = o.jobDaysTot.farmer || 0;
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + r0(inflow).padStart(20) + nf(fd).padStart(11)
      + (fd > 0 ? (inflow / fd).toFixed(3) : '—').padStart(18)
      + nf(o.popDaysTot).padStart(13) + (o.popDaysTot > 0 ? (inflow / o.popDaysTot).toFixed(3) : '—').padStart(18));
  }
  const inf = (o) => (o.knob ? (o.harvestNTot * o.k + o.floorTot) : o.prodLedgerTot);
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(6) + pct(inf(g.on), inf(g.off)).padStart(20)
    + pct(g.on.jobDaysTot.farmer || 0, g.off.jobDaysTot.farmer || 0).padStart(11)
    + pct(inf(g.on) / (g.on.jobDaysTot.farmer || 1), inf(g.off) / (g.off.jobDaysTot.farmer || 1)).padStart(18)
    + pct(g.on.popDaysTot, g.off.popDaysTot).padStart(13)
    + pct(inf(g.on) / g.on.popDaysTot, inf(g.off) / g.off.popDaysTot).padStart(18));
}
console.log('  ※끈 팔 열은 `dailyProductionBuf.food`(배수 적용 후 실현) · 켠 팔 열은 곳간 실유입이다 — 둘 다 **그 팔에서 실제로 들어온 식량**이다.');

console.log("\nⓑ' 장부가 본 유입을 **소비로 나눈 것** — 마을이 스스로를 어떻게 읽나");
console.log('  시드  팔    장부유입 ÷ 소비   surplusEMA 평균   음수 마을·일 비율   식량 그림자가격   식량 수입/인구·일');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['ON', g.on]]) {
    const cons = o.popDaysTot * econ.DAILY_FOOD_CONSUMPTION;
    const spMean = o.per.reduce((a, p) => a + (p.surplusMean || 0), 0) / Math.max(1, o.per.length);
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + (cons > 0 ? (o.prodLedgerTot / cons).toFixed(3) : '—').padStart(14)
      + spMean.toFixed(3).padStart(18) + ((o.surplusNegDaysTot / (o.live * o.days) * 100).toFixed(1) + '%').padStart(20)
      + String(o.priceFoodMean).padStart(18)
      + (o.popDaysTot > 0 ? (o.foodImportedTot / o.popDaysTot).toFixed(4) : '—').padStart(19));
  }
}

// ── ⓒ 죽은 마을 궤적 ────────────────────────────────────────────────────────
console.log('\nⓒ 죽은 마을 궤적 (20일 간격 · 400일까지 · ON 팔) — T177 ⓒ 문법');
for (const g of got) {
  const dead = g.on.per.filter((p) => p.everPop && p.N <= 0);
  if (!dead.length) { console.log(`  시드 ${g.s} — ON 소멸 0곳`); continue; }
  for (const p of dead) {
    const q = g.off.per.find((x) => x.name === p.name) || {};
    console.log(`  시드 ${g.s} · ${p.name}  (끈 팔 끝 인구 ${q.N} · 지력 ${p.fert} · 물 ${p.water} · 돌 ${p.stone}${p.stoneFloor ? ' ★석재바닥' : ''})`);
    console.log('    일    인구  농부  밭칸    곳간   식량등가    집   surplusEMA   prodK   주거게이트  |  (끈 팔) 인구  농부   곳간');
    const qm = new Map((q.traj || []).map((r) => [r.d, r]));
    for (const r of p.traj) {
      if (r.d > 400) break;
      const o = qm.get(r.d) || {};
      console.log('    ' + String(r.d).padStart(4) + String(r.N).padStart(6) + String(r.fN).padStart(6)
        + String(r.cells).padStart(6) + r0(r.food).padStart(8) + r0(r.foodEq).padStart(11)
        + String(r.house == null ? '—' : r.house.toFixed(0)).padStart(6) + String(r.sp.toFixed(2)).padStart(13)
        + String(r.prodK == null ? '—' : r.prodK.toFixed(1)).padStart(8) + (r.gated ? '  ★막힘' : '   —').padStart(11)
        + '  |  ' + String(o.N == null ? '—' : o.N).padStart(6) + String(o.fN == null ? '—' : o.fN).padStart(6)
        + r0(o.food).padStart(8));
    }
  }
}
console.log('');
