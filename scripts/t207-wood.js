#!/usr/bin/env node
// === scripts/t207-wood.js — T207: 켠 세계의 목재는 어디로 가나 (표 셋) ============
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T207 §0]
//   T193 §0-ⓒ 가 "막힌 마을을 가른 건 40일째 **목재 0**" 까지 갔다. 이 파일은 그 목재의 **수지**를 읽는다 —
//   재는 자는 `t176-ab.js` 그대로고(관측 항만 늘렸다 · 세계 수 무변), 여기선 산수가 비율과 합뿐이다.
//
// ★상수를 옮겨 적지 않는다 — `HOUSE_WOOD`·`HOUSE_DECAY` 는 계측기가 **정본 소스에서 읽어** JSON 에 담았다.
//
// 실행: node scripts/t207-wood.js /tmp/t207 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const econ = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t207';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const sh = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + '%' : '—');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };

const ARMS = [['OFF', 'off'], ['ON+장부', 'led']];
const got = [];
for (const s of SEEDS) {
  const row = { s }; let okAll = true;
  for (const [, t] of ARMS) { row[t] = load(path.join(DIR, `${t}_${s}.json`)); if (!row[t]) okAll = false; }
  if (!okAll) { console.log(`  ⚠시드 ${s} — 자료 없다`); continue; }
  got.push(row);
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const D = got[0].led.days, HW = got[0].led.HOUSE_WOOD;

console.log(`\n=== T207 — 켠 세계의 목재는 어디로 가나 (실지도 51마을 · ${D}일 · 3시드) ===`);
console.log(`  베이스 ${got[0].led.base || '?'} · 팔 둘: 끔 / 켬+장부(T190 배율 + T193 장부 — T193 §0-ⓑ 세계)`);
console.log(`  정본에서 읽은 상수: HOUSE_WOOD ${HW} · HOUSE_DECAY ${got[0].led.HOUSE_DECAY} (계측기에 숫자를 안 적었다)`);

// ── ⓐ 목재 수지 ─────────────────────────────────────────────────────────────
console.log('\nⓐ 목재 수지 (800일 · 51마을 합) — 유입 대 유출, 어느 항이 갈리나');
console.log('  시드  팔        벌목 산출   교역 유입   **연료**   **건축**   끝 재고   연료/유출   건축/유출   연료 충당률   목재값');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], out = o.woodConsTot;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(o.woodProdTot).padStart(11) + r0(o.woodImportedTot).padStart(11)
      + r0(o.woodFuelTot).padStart(11) + r0(o.woodBuiltTot).padStart(11) + r0(o.woodStockEndTot).padStart(10)
      + sh(o.woodFuelTot, out).padStart(11) + sh(o.woodBuiltTot, out).padStart(11)
      + String(o.fuelCovMean).padStart(13) + String(o.priceWoodMean).padStart(11));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(9) + pct(g.led.woodProdTot, g.off.woodProdTot).padStart(11)
    + pct(g.led.woodImportedTot, g.off.woodImportedTot).padStart(11)
    + pct(g.led.woodFuelTot, g.off.woodFuelTot).padStart(11) + pct(g.led.woodBuiltTot, g.off.woodBuiltTot).padStart(11)
    + pct(g.led.woodStockEndTot, g.off.woodStockEndTot).padStart(10) + ''.padStart(22)
    + pct(g.led.fuelCovMean, g.off.fuelCovMean).padStart(13) + pct(g.led.priceWoodMean, g.off.priceWoodMean).padStart(11));
}
console.log(`  ※\`_cons(v,'wood',…)\` 로 잡히는 유출은 **둘뿐**이다 — 연료 \`:3028\` · 건축 \`:3047\`. 활대(\`:2729\`)·교역 수출은 그 밖이라`);
console.log(`    "벌목+수입 − 연료−건축 − Δ재고" 의 잔차로 남는다(아래 검산).`);
console.log('\nⓐ\' 검산 — 창설 재고 + 유입 − 유출 − 끝 재고 = 잔차(활대 + 교역 수출)');
console.log('  시드  팔        유입 합   유출 합(연료+건축)   끝 재고   잔차   잔차/유입');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    const inn = o.woodProdTot + o.woodImportedTot;
    const res = inn - o.woodConsTot - o.woodStockEndTot;   // 창설 재고는 이 잔차에 음수로 섞인다(아래 주)
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + r0(inn).padStart(10) + r0(o.woodConsTot).padStart(20)
      + r0(o.woodStockEndTot).padStart(10) + r0(res).padStart(9) + sh(Math.abs(res), inn).padStart(11));
  }
}
console.log('  ※잔차에는 **창설 재고**(`storage.wood = initN×8` + 숲빈약 보너스)가 음수로 섞여 있다 — 절대값이 아니라 두 팔의 **차이**를 봐라.');

// ── ⓐ'' 집 못 짓는 마을 vs 나머지 ────────────────────────────────────────────
console.log('\nⓐ" 집 못 짓는 마을 vs 나머지 (**두 팔** · 기준: 재고 < HOUSE_WOOD 인 날이 전체의 절반 이상)');
console.log('  시드  무리          n   재고<한채 날 비율   **숲(land.wood)**   벌목 산출/마을   **산출/나무꾼·일**   연료/마을   건축/마을   나무꾼 마을·일   지은 수용력   끝 인구');
for (const g of got) {
 for (const [arm, tag] of ARMS) {
  const o = g[tag];
  const live = o.per.filter((p) => p.everPop);
  const bad = live.filter((p) => p.woodZeroDays / D >= 0.5), good = live.filter((p) => p.woodZeroDays / D < 0.5);
  for (const [nm0, grp] of [['못 짓는', bad], ['나머지', good]]) {
    const nm = (arm === 'OFF' ? '끔·' : '켬·') + nm0;
    if (!grp.length) { console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(12) + '0'.padStart(4) + '   (없음)'); continue; }
    const A = (f) => grp.reduce((a, p) => a + f(p), 0) / grp.length;
    const lj = grp.reduce((a, p) => a + ((p.jobDays && p.jobDays.lumberjack) || 0), 0);
    const wp = grp.reduce((a, p) => a + p.woodProd, 0);
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(12) + String(grp.length).padStart(4)
      + (A((p) => p.woodZeroDays / D) * 100).toFixed(1).padStart(16) + '%'
      + A((p) => p.wood).toFixed(2).padStart(16)
      + r0(A((p) => p.woodProd)).padStart(15) + (lj > 0 ? (wp / lj).toFixed(3) : '—').padStart(18)
      + r0(A((p) => p.woodFuel)).padStart(11) + r0(A((p) => p.woodBuilt)).padStart(11)
      + r0(A((p) => (p.jobDays && p.jobDays.lumberjack) || 0)).padStart(15)
      + A((p) => p.builtSum).toFixed(1).padStart(13) + A((p) => p.N).toFixed(1).padStart(8));
  }
 }
}

// ── ⓑ 나무꾼 궤적 + 목재값 ──────────────────────────────────────────────────
console.log('\nⓑ 나무꾼은 어디로 갔나 — 13직업 몫(마을·일) · 목재 그림자가격');
const JOBS = econ.JOB_NAMES;
for (const g of got) {
  const LIVE = JOBS.filter((j) => (g.off.jobDaysTot[j] || 0) + (g.led.jobDaysTot[j] || 0) > 0);
  const T = (o) => LIVE.reduce((a, j) => a + (o.jobDaysTot[j] || 0), 0);
  const to = T(g.off), tl = T(g.led);
  console.log('  시드 ' + g.s);
  console.log('    직업        ' + LIVE.map((j) => j.slice(0, 9).padStart(10)).join(''));
  console.log('    몫 끔       ' + LIVE.map((j) => ((g.off.jobDaysTot[j] || 0) / to * 100).toFixed(1).padStart(9) + '%').join(''));
  console.log('    몫 켬+장부  ' + LIVE.map((j) => ((g.led.jobDaysTot[j] || 0) / tl * 100).toFixed(1).padStart(9) + '%').join(''));
  console.log('    Δ%p        ' + LIVE.map((j) => { const d = (g.led.jobDaysTot[j] || 0) / tl * 100 - (g.off.jobDaysTot[j] || 0) / to * 100; return ((d >= 0 ? '+' : '') + d.toFixed(1)).padStart(10); }).join(''));
}
console.log('\nⓑ\' 값 — 목재는 오르나 내리나(식량과 나란히)');
console.log('  시드  팔        목재 그림자가격   식량 그림자가격   목재/식량   나무꾼 마을·일   벌목 산출');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(9) + String(o.priceWoodMean).padStart(14)
      + String(o.priceFoodMean).padStart(18) + (o.priceWoodMean / o.priceFoodMean).toFixed(3).padStart(12)
      + nf(o.jobDaysTot.lumberjack || 0).padStart(16) + r0(o.woodProdTot).padStart(11));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(9) + pct(g.led.priceWoodMean, g.off.priceWoodMean).padStart(14)
    + pct(g.led.priceFoodMean, g.off.priceFoodMean).padStart(18) + ''.padStart(12)
    + pct(g.led.jobDaysTot.lumberjack || 0, g.off.jobDaysTot.lumberjack || 0).padStart(16)
    + pct(g.led.woodProdTot, g.off.woodProdTot).padStart(11));
}

// ── ⓒ 집터 자 ───────────────────────────────────────────────────────────────
console.log('\nⓒ 집터 자 — `_mapBeds` 는 **아무도 안 심는다**(레포 전수)');
console.log(`  두 팔 · 3시드 · 122,400 마을·일에서 \`_mapBeds\` 가 심긴 마을: `
  + got.map((g) => `${g.s}: OFF ${g.off.mapBedsSeen} · 켬 ${g.led.mapBedsSeen}`).join(' | '));
console.log('');
