#!/usr/bin/env node
// === scripts/t183-delta.js — T183 §0-ⓒ: 잠재 비대칭을 고치기 전/후 (ON 팔) ========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T183 §0-ⓒ]
//   재는 자는 `scripts/t176-ab.js` **그대로**다(카드 §1-②). 이 파일은 그 자가 뱉은 JSON 셋을
//   전(베이스 엔진) / 후(고친 엔진) 로 견주기만 한다 — 세계를 안 세우고 산수는 **비율 하나**뿐이다.
//
// 실행: node scripts/t183-delta.js /tmp/t183 [--seeds 1020,7,42]
//   자료 이름: off_<시드>.json(고친 판 · 끈 팔) · onb_<시드>.json(전 · 켠 팔) · ona_<시드>.json(후 · 켠 팔)
'use strict';
const fs = require('fs');
const path = require('path');
const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t183';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];
const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString('en-US'));
const fx = (x, d) => (x == null ? '—' : Number(x).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(2) + '%' : '—');

const got = [];
for (const s of SEEDS) {
  const off = load(path.join(DIR, `off_${s}.json`)), b = load(path.join(DIR, `onb_${s}.json`)), a = load(path.join(DIR, `ona_${s}.json`));
  if (!off || !b || !a) { console.log(`  ⚠시드 ${s} — 자료 없다(off ${!!off} · 전 ${!!b} · 후 ${!!a})`); continue; }
  got.push({ s, off, b, a });
}
if (!got.length) { console.log('\n측정 JSON 이 없다.\n'); process.exit(1); }

console.log(`\n=== T183 §0-ⓒ — 잠재 비대칭을 고치면 켠 팔이 얼마나 돌아오나 (${got[0].a.days}일 · 실지도 51마을) ===`);
console.log(`  전 = 베이스 엔진(농부가 잠재에서 빠진 판) · 후 = 고친 판(실체 그대로 잠재에도) · 끈 팔은 두 판 모두 같은 수(ⓐ)`);

const C = [['pop', '인구', 0], ['dead', '소멸', 0], ['weapQ', '무기Q', 0], ['expand', '확장셀', 0],
  ['reqOpened', '게시', 0], ['toolQ', '도구Q', 1], ['preserved', '보존식', 1], ['rawGrain', '생곡', 1]];
const cell = (o, k, d) => (k === 'dead' ? `${o.dead}/${o.ever}` : fx(o[k], d || 0));
console.log('\nⓒ-1 여덟 수 — 전 → 후 (그리고 끈 팔까지의 거리)');
console.log('  시드  줄     ' + C.map(([, k]) => k.padStart(11)).join('') + '   ㉮ 전체   ㉯ 값유형');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['전', g.b], ['후', g.a]]) {
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(6) + C.map(([k, , d]) => cell(o, k, d).padStart(11)).join('')
      + o.densAll.toFixed(2).padStart(9) + o.densVal.toFixed(2).padStart(11));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ전후'.padEnd(6)
    + C.map(([k]) => (k === 'dead' ? `${g.a.dead - g.b.dead}` : pct(g.a[k], g.b[k])).padStart(11)).join('')
    + pct(g.a.densAll, g.b.densAll).padStart(9) + pct(g.a.densVal, g.b.densVal).padStart(11));
  console.log('  ' + ''.padEnd(6) + '후 대 OFF'.padEnd(6)
    + C.map(([k]) => (k === 'dead' ? `${g.a.dead - g.off.dead}` : pct(g.a[k], g.off[k])).padStart(11)).join(''));
}

console.log('\nⓒ-2 리비히 세 다리와 집 — 고친 자리가 무는 곳(ΣK 분해 · 끝값 합)');
console.log('  시드  줄       ΣslotK      ΣprodK      ΣfuelK   평균 집 수   유휴노동(평균)   곳간식량   주거게이트 마을·일');
for (const g of got) {
  for (const [t, o] of [['OFF', g.off], ['전', g.b], ['후', g.a]]) {
    console.log('  ' + String(g.s).padEnd(6) + t.padEnd(7) + fx(o.kSlotTot, 1).padStart(11) + fx(o.kProdTot, 1).padStart(12)
      + fx(o.kFuelTot, 1).padStart(12) + fx(o.housingMeanTot, 1).padStart(13)
      + (o.idleMeanTot != null ? o.idleMeanTot.toFixed(4) : '—').padStart(17)
      + nf(Math.round(o.econFoodTot)).padStart(11) + nf(o.gatedDaysTot).padStart(21));
  }
  console.log('  ' + ''.padEnd(6) + 'Δ전후'.padEnd(7) + pct(g.a.kSlotTot, g.b.kSlotTot).padStart(11)
    + pct(g.a.kProdTot, g.b.kProdTot).padStart(12) + pct(g.a.kFuelTot, g.b.kFuelTot).padStart(12)
    + pct(g.a.housingMeanTot, g.b.housingMeanTot).padStart(13)
    + pct(g.a.idleMeanTot, g.b.idleMeanTot).padStart(17)
    + pct(g.a.econFoodTot, g.b.econFoodTot).padStart(11)
    + pct(g.a.gatedDaysTot, g.b.gatedDaysTot).padStart(21));
}

console.log('\nⓒ-3 소멸 — 고치면 살아나나');
for (const g of got) {
  const nm = (o) => o.per.filter((p) => p.everPop && p.N <= 0).map((p) => p.name).join(' · ') || '(없음)';
  console.log(`  시드 ${g.s}  전 ${g.b.dead}/${g.b.ever} [${nm(g.b)}]  →  후 ${g.a.dead}/${g.a.ever} [${nm(g.a)}]`
    + `   (끈 팔 ${g.off.dead}/${g.off.ever})`);
}
console.log('');
