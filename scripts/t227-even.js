#!/usr/bin/env node
// === scripts/t227-even.js — T227: 밭 산출을 고르게 하면 무엇이 달라지나 (표 셋) ======
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T227 §0]
//   T218 이 잰 것: 켠 팔 볏짚 손실의 55~75% 가 **상한이 버린 몫**이다(짚은 저장이 안 된다 · 몰려 오면 버려진다).
//   이 파일은 손잡이 `T227_EVEN`(수확 덩어리를 정본 주기로 나눠 흘린다)이 그 버림을 얼마나 줄이는지 읽는다.
//   재는 자는 `t176-ab.js` 그대로고(관측 항만 늘렸다), 여기선 산수가 비율과 합뿐이다.
//
// 실행: node scripts/t227-even.js /tmp/t227 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t227';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');
const sh = (a, b) => (b > 0 ? (a / b * 100).toFixed(1) + '%' : '—');

const ARMS = [['OFF', 'off'], ['ON+장부', 'led'], ['+고르게', 'evn']];
const got = [];
for (const s of SEEDS) {
  const row = { s }; let ok = true;
  for (const [, t] of ARMS) { row[t] = load(path.join(DIR, `${t}_${s}.json`)); if (!row[t]) ok = false; }
  if (!ok) { console.log(`  ⚠시드 ${s} — 자료 없다(${ARMS.map(([, t]) => t + ':' + !!row[t]).join(' · ')})`); continue; }
  got.push(row);
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const H = got[0].evn, D = H.days;

console.log(`\n=== T227 — 밭 산출을 고르게 (실지도 51마을 · ${D}일 · 3시드 · 팔 셋) ===`);
console.log(`  베이스 ${H.base || '?'} · 손잡이 T227_EVEN(기본 끔) · 주기 = 정본 seedFoodDays ${H.seedFoodDays}일`);

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
  console.log('  ' + ''.padEnd(6) + 'Δ장부→고르게'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.evn.dead - g.led.dead}` : pct(g.evn[k], g.led[k])).padStart(11)).join('')
    + pct(g.evn.densAll, g.led.densAll).padStart(9) + pct(g.evn.densVal, g.led.densVal).padStart(11));
  console.log('  ' + ''.padEnd(6) + '고르게 대 OFF'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.evn.dead - g.off.dead}` : pct(g.evn[k], g.off[k])).padStart(11)).join(''));
}

// ── ⓑ 볏짚 (T218 ⓐ 열 그대로) ───────────────────────────────────────────────
console.log('\nⓑ 볏짚 — 버림이 줄었나 (T218 ⓐ 열 그대로)');
console.log('  시드  팔        볏짚 합   상한 합   원량 합   **버려진 몫**   버림 비율   상한이 문 날   끝 대기(총량 무변)');
for (const g of got) {
  for (const [nm, t] of ARMS) {
    const o = g[t], waste = o.strawRawTot - o.supStrawTot;
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + r0(o.supStrawTot).padStart(9)
      + r0(o.strawCapTot).padStart(10) + r0(o.strawRawTot).padStart(10) + r0(waste).padStart(15)
      + sh(waste, o.strawRawTot).padStart(11) + `${nf(o.strawCapDaysTot)}/${nf(o.strawDaysTot)}`.padStart(15)
      + (o.t100PendTot != null ? fx(o.t100PendTot, 2) : '—').padStart(20));
  }
  const b = g.led, e = g.evn;
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(10) + pct(e.supStrawTot, b.supStrawTot).padStart(9)
    + pct(e.strawCapTot, b.strawCapTot).padStart(10) + pct(e.strawRawTot, b.strawRawTot).padStart(10)
    + pct(e.strawRawTot - e.supStrawTot, b.strawRawTot - b.supStrawTot).padStart(15));
}
console.log('  ※끝 대기 = 800일째 아직 안 풀린 몫(`_t100Pend` 합). **질량 누수 0** — 예치한 것은 전부 풀렸거나 여기 있다.');

// ── ⓒ 연료·목재·인구 (T210 + T207 열) ───────────────────────────────────────
console.log('\nⓒ 그래서 세계는 — 연료 · 목재 · 집 (T210 + T207 열)');
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
    + ` · 석재 바닥 ${g.evn.stoneFloorN}/${g.evn.ever}곳`);
  for (const [nm, t] of ARMS) {
    const dead = g[t].per.filter((p) => p.everPop && p.N <= 0);
    console.log('    ' + nm.padEnd(9) + (dead.length
      ? dead.map((p) => `${p.name}(지력 ${p.fert} · 숲 ${p.wood} · 돌 ${p.stone}${p.stoneFloor ? ' ★바닥' : ''})`).join(' · ')
      : '(없음)'));
  }
}
console.log('');
