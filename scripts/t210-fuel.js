#!/usr/bin/env node
// === scripts/t210-fuel.js — T210: 연료가 아홉 몫 — 그 모자람이 세계에 무엇을 하나 ========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T210 §0]
//   T207 이 "목재 유출의 91% 가 연료인데 충당률은 0.53~0.65" 까지 갔다. 이 파일은 그 **모자람의 값**을 읽는다.
//   재는 자는 `t176-ab.js` 그대로고(관측 항만 늘렸다 · 세계 수 무변), 여기선 산수가 비율과 합뿐이다.
//
// ★상수를 옮겨 적지 않는다 — `FIREWOOD_PC`·`FUEL_COLD_W`·`SMELT_FUEL_PER`·`STRAW_FUEL_PER_FOOD`·
//   `FUEL_HEALTH_W`·`POP_GROWTH_RATE`·`_healthTerm` 계수까지 전부 계측기가 **정본 소스에서 읽어** JSON 에 담았다.
//
// 실행: node scripts/t210-fuel.js /tmp/t210 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t210';
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

console.log(`\n=== T210 — 연료가 아홉 몫: 그 모자람이 세계에 무엇을 하나 (실지도 51마을 · ${D}일 · 3시드) ===`);
console.log(`  베이스 ${H.base || '?'} · 팔 둘: 끔 / 켬+장부(T190 배율 + T193 장부)`);
console.log(`  정본에서 읽은 상수: FIREWOOD_PC ${H.FIREWOOD_PC} · FUEL_COLD_W ${H.FUEL_COLD_W} · SMELT_FUEL_PER ${H.SMELT_FUEL_PER}`
  + ` · STRAW_FUEL_PER_FOOD ${H.STRAW_FUEL_PER_FOOD} · FUEL_HEALTH_W ${H.FUEL_HEALTH_W}`);
console.log(`                      HEALTH_PROD_W ${H.HEALTH_PROD_W} · 건강→인구 계수 ${H.HEALTH_DP_W} · POP_GROWTH_RATE ${H.POP_GROWTH_RATE}`);

// ── ⓐ `_fuelCov` 를 떼면 ─────────────────────────────────────────────────────
console.log('\nⓐ `_fuelCov` 를 1 로 떼면 — 그 항은 `:118` 한 줄의 **닫힌 꼴**이라 정확히 떼어진다(첫째 차수)');
console.log('  시드  팔        충당률 평균  충당<1 마을·일   건강 평균   **Δ건강**   작업량 평균   **Δ작업량**   건강 인구항 합   **Δ인구항 합**   Σ dP');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], vd = o.live * o.days;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9)
      + String(o.fuelCovMean).padStart(11) + `${nf(o.covLtDaysTot)}/${nf(vd)}`.padStart(17)
      + (o.per.reduce((a, p) => a + (p.healthMean || 0), 0) / o.per.length).toFixed(4).padStart(11)
      + ('+' + (o.per.reduce((a, p) => a + (p.dHealthMean || 0), 0) / o.per.length).toFixed(4)).padStart(12)
      + (o.per.reduce((a, p) => a + (p.hpmMean || 0), 0) / o.per.length).toFixed(5).padStart(13)
      + ('+' + (o.per.reduce((a, p) => a + (p.dHpmMean || 0), 0) / o.per.length).toFixed(5)).padStart(14)
      + r0(o.dpHealthTot).padStart(15) + ('+' + Math.round(o.dHealthTermTot)).padStart(16)
      + r0(o.dpTot).padStart(10));
  }
}
console.log('  ※`:118` 은 `stats.health += (_fuelCov − 1) × FUEL_HEALTH_W` 한 줄이고, `stats.fuelCov`(`:119`)를 **읽는 곳은 없다**.');
console.log('  ※Δ는 **첫째 차수**다 — 페널티를 실제로 떼면 세계가 되먹임으로 더 움직인다(여긴 그 한 항만 뗀 값).');
console.log('  ※Σ dP 는 800일 동안 인구식이 낸 **순** 증분이라 균형에 앉은 세계에선 0 근처다 — 분모로 쓰면 안 된다.');
console.log("\nⓐ' 그 몫 — 건강 항이 몇 배가 되나 · 작업량은 몇 % 오르나");
console.log('  시드  팔        건강 인구항 합   Δ건강 항   **배(倍)**   건강 평균 → 뗀 뒤   작업량 배수 → 뗀 뒤   세계 산출 Δ');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    const h = o.per.reduce((a, p) => a + (p.healthMean || 0), 0) / o.per.length;
    const dh = o.per.reduce((a, p) => a + (p.dHealthMean || 0), 0) / o.per.length;
    const hp = o.per.reduce((a, p) => a + (p.hpmMean || 0), 0) / o.per.length;
    const dhp = o.per.reduce((a, p) => a + (p.dHpmMean || 0), 0) / o.per.length;
    const mul = o.dpHealthTot !== 0 ? (o.dpHealthTot + o.dHealthTermTot) / o.dpHealthTot : null;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(o.dpHealthTot).padStart(13)
      + ('+' + Math.round(o.dHealthTermTot)).padStart(11)
      + (mul == null ? '—' : mul.toFixed(2) + '배').padStart(12)
      + `${h.toFixed(3)} → ${(h + dh).toFixed(3)}`.padStart(20)
      + `${hp.toFixed(4)} → ${(hp + dhp).toFixed(4)}`.padStart(22)
      + ('+' + (dhp / hp * 100).toFixed(2) + '%').padStart(13));
  }
}
console.log('  ※건강 항 = `_healthTerm = (건강 − 0.5) × ' + H.HEALTH_DP_W + ' × N × POP_GROWTH_RATE`(`:3101`) 의 800일 합.');
console.log('  ※세계 산출 Δ = `_hpm`(건강→작업량) 의 상대 변화 — 모든 직업의 산출에 그대로 곱해지는 배수다.');

// ── ⓑ 수요·공급 분해 ────────────────────────────────────────────────────────
console.log('\nⓑ `fuelNeed` 항별 + 공급 세 갈래 (800일 · 51마을 합)');
console.log('  시드  팔        수요 합   난방   제련   한랭 평균  |  볏짚   하급   목재   공급 합   공급/수요   볏짚 몫');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], sup = o.supStrawTot + o.supLowTot + o.supWoodTot;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(o.fuelNeedTot).padStart(9)
      + sh(o.fuelHeatTot, o.fuelNeedTot).padStart(8) + sh(o.fuelSmeltTot, o.fuelNeedTot).padStart(8)
      + (o.per.reduce((a, p) => a + (p.coldMean || 0), 0) / o.per.length).toFixed(3).padStart(10)
      + '  |' + r0(o.supStrawTot).padStart(8) + r0(o.supLowTot).padStart(8) + r0(o.supWoodTot).padStart(9)
      + r0(sup).padStart(10) + sh(sup, o.fuelNeedTot).padStart(11) + sh(o.supStrawTot, sup).padStart(9));
  }
  const a = g.off, b = g.led;
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(9) + pct(b.fuelNeedTot, a.fuelNeedTot).padStart(9) + ''.padStart(26)
    + '  |' + pct(b.supStrawTot, a.supStrawTot).padStart(8) + pct(b.supLowTot, a.supLowTot).padStart(8)
    + pct(b.supWoodTot, a.supWoodTot).padStart(9)
    + pct(b.supStrawTot + b.supLowTot + b.supWoodTot, a.supStrawTot + a.supLowTot + a.supWoodTot).padStart(10));
}
console.log('  ※수요 = `N × FIREWOOD_PC × (1 + FUEL_COLD_W × 한랭) + 제련공 × SMELT_FUEL_PER`(`:3012` 그대로).');
console.log('  ※볏짚 = `min(N × FIREWOOD_PC, _grainToday × STRAW_FUEL_PER_FOOD)`(`:3011`) — `_grainToday` 는 두 팔 모두');
console.log('    `dailyProductionBuf.food` 와 **같다**(끈 팔은 `addProduce` 가, 켠 팔은 T193 줄이 그렇게 맞춘다).');
console.log('  ※목재 = `_consDay.wood − 건축분`(T207 문법) · 하급 = 충당률 항등식의 남은 한 자리.');

// ── ⓒ 순서 · 임업3 대 재고 0 ────────────────────────────────────────────────
console.log('\nⓒ 아궁이가 집보다 먼저 — 자리와 그 결과');
console.log('  `sim/economy-sim.js`');
console.log('    :3026  const fuelFromWood = Math.min(Math.max(0, fuelNeed − strawFuel − _lowFuel), v.storage.wood || 0);');
console.log('    :3027  v.storage.wood = Math.max(0, (v.storage.wood || 0) − fuelFromWood);      ← 아궁이가 **먼저** 가져간다');
console.log('    :3040  let built = Math.min(houseTarget − v.housing, (v.storage.wood || 0) / HOUSE_WOOD, …);  ← 집은 **그 뒤**');
console.log('  ⇒ 같은 줄에서 갈린다: 집이 보는 재고는 **아궁이가 쓰고 남은 것**이다.');
console.log('\n  숲이 있는 마을 대 없는 마을 (켠 팔 · 같은 순서에서 왜 갈리나)');
console.log('  시드  마을        숲    벌목 산출/일   연료가 먹는 몫/일   남는 몫/일   재고<한채 날   집 는 날   지은 수용력   끝 인구');
for (const g of got) {
  const o = g.led;
  const live = o.per.filter((p) => p.everPop);
  const pick = [...live].sort((a, b) => b.wood - a.wood).slice(0, 2)
    .concat([...live].sort((a, b) => a.wood - b.wood).slice(0, 2));
  for (const p of pick) {
    const prodD = p.woodProd / D, fuelD = p.supWood / D;
    console.log('  ' + String(g.s).padEnd(6) + String(p.name).padEnd(10) + p.wood.toFixed(2).padStart(6)
      + prodD.toFixed(2).padStart(14) + fuelD.toFixed(2).padStart(19)
      + (prodD - fuelD).toFixed(2).padStart(13)
      + String(p.woodZeroDays).padStart(14) + String(p.houseUp).padStart(11)
      + p.builtSum.toFixed(1).padStart(14) + String(p.N).padStart(9));
  }
}
console.log('');
