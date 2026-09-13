#!/usr/bin/env node
// === scripts/t240-straw.js — T240: 곡식은 즉시 · 짚만 이월하면 무엇이 달라지나 (표 넷) ===
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T240 §0]
//   T227 이 기각한 것: **곡식**을 늦추면 창설 곳간이 마르는 60일부터 골짜기가 다시 열려 세계가 −23~−35% 가난해진다.
//   이 파일은 곡식을 안 건드리고 **짚만** 이월했을 때(`T240_STRAW_CARRY`) 그 버림이 얼마나 돌아오는지,
//   그리고 그게 세계에 무엇을 하는지를 읽는다. 재는 자는 `t176-ab.js` 그대로고(관측 항만 늘렸다),
//   여기선 산수가 비율과 합뿐이다.
//
// 실행: node scripts/t240-straw.js /tmp/t240 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t240';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const sh = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + '%' : '—');

const ARMS = [['OFF', 'off'], ['ON+장부', 'led'], ['+짚이월', 'car']];
const got = [];
for (const s of SEEDS) {
  const row = { s }; let ok = true;
  for (const [, t] of ARMS) { row[t] = load(path.join(DIR, `${t}_${s}.json`)); if (!row[t]) ok = false; }
  if (!ok) { console.log(`  ⚠시드 ${s} — 자료 없다(${ARMS.map(([, t]) => t + ':' + !!row[t]).join(' · ')})`); continue; }
  got.push(row);
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const H = got[0].car, D = H.days;

console.log(`\n=== T240 — 곡식은 즉시 · 짚만 이월 (실지도 51마을 · ${D}일 · 3시드 · 팔 셋) ===`);
console.log(`  베이스 ${H.base || '?'} · 손잡이 T240_STRAW_CARRY(기본 끔) · 상한 = 종전 그대로 N × FIREWOOD_PC(${H.FIREWOOD_PC})`);
console.log('  ※단위는 짚 kg 이 아니라 **목재 열량 당량**(STRAW_FUEL_PER_FOOD 정본 주석의 wood-eq) — 상한·수요·목재와 같은 축.');

// ── ⓐ 여덟 수 ───────────────────────────────────────────────────────────────
console.log('\nⓐ 여덟 수 + 밀도');
const C = [['pop', '인구', 0], ['dead', '소멸', 0], ['weapQ', '무기Q', 0], ['expand', '확장셀', 0],
  ['reqOpened', '게시', 0], ['toolQ', '도구Q', 1], ['preserved', '보존식', 1], ['rawGrain', '생곡', 1]];
const cell = (o, k, d) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], d || 0));
console.log('  시드  팔        ' + C.map(([, k]) => k.padStart(11)).join('') + '   ㉮ 전체   ㉯ 값유형');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + C.map(([k, , d]) => cell(o, k, d).padStart(11)).join('')
      + o.densAll.toFixed(2).padStart(9) + o.densVal.toFixed(2).padStart(11));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ장부→이월'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.car.dead - g.led.dead}` : pct(g.car[k], g.led[k])).padStart(11)).join('')
    + pct(g.car.densAll, g.led.densAll).padStart(9) + pct(g.car.densVal, g.led.densVal).padStart(11));
  console.log('  ' + ''.padEnd(6) + '이월 대 OFF'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.car.dead - g.off.dead}` : pct(g.car[k], g.off[k])).padStart(11)).join(''));
}

// ── ⓑ 볏짚 (T218/T227 ⓑ 열 그대로 + 이월 열) ────────────────────────────────
console.log('\nⓑ 볏짚 — 버림이 돌아왔나 (T218/T227 ⓑ 열 그대로)');
console.log('  시드  팔        볏짚 합   상한 합   원량 합   **버려진 몫**   버림 비율   상한이 문 날   끝 대기   대기 평균   대기 최대');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    // ★버려진 몫 = 원량 − 실제로 탄 양 − 아직 대기 중인 양. 이월 팔에서 이 셋의 합이 원량이다(질량 누수 0).
    const waste = o.strawRawTot - o.supStrawTot - (o.strawPendEndTot || 0);
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + r0(o.supStrawTot).padStart(9)
      + r0(o.strawCapTot).padStart(10) + r0(o.strawRawTot).padStart(10) + r0(waste).padStart(15)
      + sh(waste, o.strawRawTot).padStart(11) + `${nf(o.strawCapDaysTot)}/${nf(o.strawDaysTot)}`.padStart(15)
      + r0(o.strawPendEndTot).padStart(10) + fx(o.strawPendMeanTot, 1).padStart(11) + fx(o.strawPendMaxTot, 1).padStart(11));
  }
  const b = g.led, e = g.car;
  const wb = b.strawRawTot - b.supStrawTot - (b.strawPendEndTot || 0);
  const we = e.strawRawTot - e.supStrawTot - (e.strawPendEndTot || 0);
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(10) + pct(e.supStrawTot, b.supStrawTot).padStart(9)
    + pct(e.strawCapTot, b.strawCapTot).padStart(10) + pct(e.strawRawTot, b.strawRawTot).padStart(10)
    + pct(we, wb).padStart(15));
}
console.log('  ※버려진 몫 = 원량 − 탄 양 − 끝 대기. 이월 팔은 **질량 누수 0** 이라 셋의 합이 원량과 같다.');
console.log('  ※`볏짚 합` 은 **실제로 탄 양**이다 — 이월 팔에서는 정본 상태에서 역산했다(탄 양 = 원량 + 어제 대기 − 오늘 대기).');

// ── ⓑ' 종전 산수라면 — 이월이 되살린 몫 ─────────────────────────────────────
console.log("\nⓑ' 이월이 실제로 되살린 몫 (종전 산수 `min(상한, 원량)` 과 나란히)");
console.log('  시드  팔        탄 양   종전이라면   되살린 몫   되살린 비율   연료 목재   Δ연료 목재');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], old = o.strawOldTot != null ? o.strawOldTot : o.supStrawTot;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + r0(o.supStrawTot).padStart(8)
      + r0(old).padStart(13) + r0(o.supStrawTot - old).padStart(12)
      + sh(o.supStrawTot - old, old).padStart(14) + r0(o.supWoodTot).padStart(11)
      + (t === 'car' ? pct(o.supWoodTot, g.led.supWoodTot) : '').padStart(12));
  }
}

// ── ⓒ 연료·목재·인구 (T210 + T207 열) ───────────────────────────────────────
console.log('\nⓒ 그래서 세계는 — 연료 · 목재 · 집 (T227 ⓒ 표 문법 그대로)');
console.log('  시드  팔        충당률   충당<1 마을·일   건강    연료 목재   건축 목재   끝 재고   못 짓는 마을   지은 수용력   인구   소멸');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t];
    const bad = o.per.filter((p) => p.everPop && p.woodZeroDays / D >= 0.5).length;
    const h = o.per.reduce((x, p) => x + (p.healthMean || 0), 0) / o.per.length;
    const built = o.per.reduce((x, p) => x + (p.builtSum || 0), 0);
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + String(o.fuelCovMean).padStart(9)
      + `${nf(o.covLtDaysTot)}/${nf(o.live * o.days)}`.padStart(17) + h.toFixed(4).padStart(9)
      + r0(o.supWoodTot).padStart(11) + r0(o.woodBuiltTot).padStart(11) + r0(o.woodStockEndTot).padStart(10)
      + `${bad}/${o.ever}`.padStart(13) + r0(built).padStart(13)
      + nf(o.pop).padStart(8) + `${o.dead}/${o.ever}`.padStart(8));
  }
}

// ── ⓒ' 소멸 귀속 ────────────────────────────────────────────────────────────
console.log('\nⓒ\' 소멸 귀속 (T165 ⓒ 문법)');
for (const g of got) {
  console.log(`  시드 ${g.s}  ` + ARMS.map(([nm, t]) => `${nm} ${g[t].dead}/${g[t].ever}`).join(' · ')
    + ` · 석재 바닥 ${g.car.stoneFloorN}/${g.car.ever}곳`);
  for (const [nm, t] of ARMS) {
    const dead = g[t].per.filter((p) => p.everPop && p.N <= 0);
    console.log('    ' + nm.padEnd(9) + (dead.length
      ? dead.map((p) => `${p.name}(지력 ${p.fert} · 숲 ${p.wood} · 돌 ${p.stone}${p.stoneFloor ? ' ★바닥' : ''})`).join(' · ')
      : '(없음)'));
  }
}
console.log('');
