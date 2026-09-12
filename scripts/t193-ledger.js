#!/usr/bin/env node
// === scripts/t193-ledger.js — T193: 장부가 밭을 보면 무엇이 달라지나 (표 셋) =======
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T193 §0-ⓑⓒ]
//   재는 자는 `t176-ab.js` 그대로다(관측 항만 늘렸다 · 세계 수 무변). 이 파일은 그 JSON 셋(OFF · ON ·
//   ON+장부)을 T186 ⓑ' 열 그대로 읽고, 주거 게이트 한 표를 더 낸다 — 산수는 비율과 합뿐이다.
//
// 실행: node scripts/t193-ledger.js /tmp/t193 [--seeds 1020,7,42]
'use strict';
const fs = require('fs');
const path = require('path');
const econ = require(path.join(__dirname, '..', 'sim', 'economy-sim'));
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t193';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const r0 = (x) => (x == null ? '—' : nf(Math.round(x)));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

const ARMS = [['OFF', 'off'], ['ON', 'on'], ['ON+장부', 'led']];
const got = [];
for (const s of SEEDS) {
  const row = { s };
  let okAll = true;
  for (const [, tag] of ARMS) { row[tag] = load(path.join(DIR, `${tag}_${s}.json`)); if (!row[tag]) okAll = false; }
  if (!okAll) { console.log(`  ⚠시드 ${s} — 자료 없다(${ARMS.map(([, t]) => t + ':' + !!row[t]).join(' · ')})`); continue; }
  got.push(row);
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }
const D = got[0].led.days;

console.log(`\n=== T193 — 장부가 밭을 본다 (실지도 51마을 · ${D}일 · 3시드) ===`);
console.log(`  베이스 ${got[0].led.base || '?'} · 손잡이 T193_LEDGER(기본 끔) · 팔 셋: 끔 / 켬 / 켬+장부`);
console.log(`  ※ⓑ(일할)는 **만들지 않았다** — "오늘 밭이 낸 몫"을 말하는 정본 칸이 없다(§0-ⓐ).`);

// ── ⓑ-1 여덟 수 ─────────────────────────────────────────────────────────────
console.log('\nⓑ-1 여덟 수 + 밀도 (T163 ⓚ 문법)');
const C = [['pop', '인구', 0], ['dead', '소멸', 0], ['weapQ', '무기Q', 0], ['expand', '확장셀', 0],
  ['reqOpened', '게시', 0], ['toolQ', '도구Q', 1], ['preserved', '보존식', 1], ['rawGrain', '생곡', 1]];
const cell = (o, k, d) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], d || 0));
console.log('  시드  팔        ' + C.map(([, k]) => k.padStart(11)).join('') + '   ㉮ 전체   ㉯ 값유형');
for (const g of got) {
  for (const [nm, tag] of ARMS) {
    const o = g[tag];
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(10) + C.map(([k, , d]) => cell(o, k, d).padStart(11)).join('')
      + o.densAll.toFixed(2).padStart(9) + o.densVal.toFixed(2).padStart(11));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ켬→장부'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.led.dead - g.on.dead}` : pct(g.led[k], g.on[k])).padStart(11)).join('')
    + pct(g.led.densAll, g.on.densAll).padStart(9) + pct(g.led.densVal, g.on.densVal).padStart(11));
  console.log('  ' + ''.padEnd(6) + '장부 대 OFF'.padEnd(10)
    + C.map(([k]) => (k === 'dead' ? `${g.led.dead - g.off.dead}` : pct(g.led[k], g.off[k])).padStart(11)).join(''));
}

// ── ⓑ-2 T186 ⓑ' 다섯 열 그대로 ──────────────────────────────────────────────
console.log("\nⓑ-2 마을이 스스로를 어떻게 읽나 — **T186 ⓑ' 다섯 열 그대로**");
console.log('  시드  팔         장부유입÷소비   surplusEMA 평균   **음수 마을·일 비율**   식량 그림자가격   식량 수입/인구·일   장부 오른 날');
for (const g of got) {
  for (const [nm, tag] of ARMS) {
    const o = g[tag];
    const cons = o.popDaysTot * econ.DAILY_FOOD_CONSUMPTION;
    const spMean = o.per.reduce((a, p) => a + (p.surplusMean || 0), 0) / Math.max(1, o.per.length);
    console.log('  ' + String(g.s).padEnd(6) + nm.padEnd(11) + (cons > 0 ? (o.prodLedgerTot / cons).toFixed(3) : '—').padStart(12)
      + spMean.toFixed(3).padStart(18) + ((o.surplusNegDaysTot / (o.live * o.days) * 100).toFixed(1) + '%').padStart(24)
      + String(o.priceFoodMean).padStart(18)
      + (o.popDaysTot > 0 ? (o.foodImportedTot / o.popDaysTot).toFixed(4) : '—').padStart(20)
      + `${nf(o.ledgerDaysTot)} / ${nf(o.live * o.days)}`.padStart(18));
  }
}

// ── ⓑ-3 소멸 귀속 (T165 ⓒ 문법) ─────────────────────────────────────────────
console.log('\nⓑ-3 소멸 — 어느 마을인가 · 석재 바닥과 겹치나 (T165 ⓒ 문법)');
for (const g of got) {
  const line = ARMS.map(([nm, tag]) => `${nm} ${g[tag].dead}/${g[tag].ever}`).join(' · ');
  console.log(`  시드 ${g.s}  ${line}  · 석재 바닥 ${g.led.stoneFloorN}/${g.led.ever}곳`);
  for (const [nm, tag] of ARMS) {
    const dead = g[tag].per.filter((p) => p.everPop && p.N <= 0);
    if (!dead.length) { console.log(`    ${nm.padEnd(8)} (없음)`); continue; }
    console.log('    ' + nm.padEnd(8) + dead.map((p) => `${p.name}(지력 ${p.fert} · 물 ${p.water} · 돌 ${p.stone}${p.stoneFloor ? ' ★바닥' : ''} · 최고 ${p.popMax})`).join(' · '));
  }
}

// ── ⓒ 주거 게이트 한 표 ─────────────────────────────────────────────────────
console.log('\nⓒ 주거 게이트 — 40일째 **어느 상한**에 걸렸나 (켠 팔 · 죽은 셋 + 산 셋 · 읽기만)');
console.log(`  ※\`_hcap = min(housing, _mapBeds)\`(economy-sim.js:3108). 이 랩은 집터 층(생활층 건축)을 안 돌아`);
console.log(`    \`_mapBeds\` 가 **한 마을도 안 심긴다** — 그래서 이 세계에서 상한은 언제나 \`housing\` 이다.`);
console.log('  시드  마을        N   housing  mapBeds  게이트   dP      K    목재   석재   자갈   식량등가  식량등가/N   집 는 날/주는 날   순변화');
for (const g of got) {
  const o = g.led;
  const dead = o.per.filter((p) => p.everPop && p.N <= 0);
  const alive = o.per.filter((p) => p.N > 0).sort((a, b) => b.N - a.N).slice(0, 3);
  for (const p of [...dead, ...alive]) {
    const d = p.d40 || {};
    console.log('  ' + String(g.s).padEnd(6) + String(p.name).padEnd(10)
      + String(d.N == null ? '—' : d.N).padStart(5) + (d.housing == null ? '—' : d.housing.toFixed(1)).padStart(9)
      + String(d.mapBeds == null ? '없음' : d.mapBeds).padStart(9)
      + (d.gated ? '  ★막힘' : '   —').padStart(9)
      + String(d.dP == null ? '—' : d.dP).padStart(7) + String(d.K == null ? '—' : d.K).padStart(7)
      + r0(d.wood).padStart(7) + r0(d.stone).padStart(7) + r0(d.pebble).padStart(7)
      + r0(d.foodEq).padStart(10) + (d.N > 0 ? (d.foodEq / d.N).toFixed(1) : '—').padStart(12)
      + `${nf(p.houseUp)} / ${nf(p.houseDown)}`.padStart(18) + (p.houseDelta >= 0 ? '+' : '') + p.houseDelta.toFixed(1).padStart(9));
  }
}
console.log('  ※`slack`(건축 속도)은 곳간 식량등가로 갈린다 — `>N×40` 이면 1.0 · `>N×25` 면 0.5 · 그 밖 0.15(economy-sim.js:2990).');
console.log('  ※`built = min(목표−housing, 목재÷HOUSE_WOOD, N×HOUSE_BUILD_MAX×slack)` 이고 석재는 그 뒤 `0.3+0.7×석재충족` 을 곱한다.');

// ── `_clearedFrac` 한 줄 ────────────────────────────────────────────────────
const cf = got.reduce((a, g) => a + g.led.clearedFracDaysTot, 0);
const vd = got.reduce((a, g) => a + g.led.live * g.led.days, 0);
console.log(`\nⓒ' \`_clearedFrac\` (죽은 다리 · 이 카드는 안 건드린다) — 심긴 날 **${cf}** / ${nf(vd)} 마을·일.`);
console.log(`   T100 5판이 심으려던 자리는 \`server/villages.js:4198\` 주석("밭 브리지 — 개간한 칸 수를 econ 이 읽는다`);
console.log(`   \`_paddyShare\`·\`_clearedFrac\` 계열")인데 그 줄이 실제로 심는 건 \`_fieldCells\` 하나다.`);
console.log('');
