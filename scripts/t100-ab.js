#!/usr/bin/env node
// === scripts/t100-ab.js — T100 4판 A/B 표(3시드 여덟 수 + ratio + k + 부양 실측) ==========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T100 4판 §2-④ · §3]
//   4판의 A/B 는 `t17-metrics.js` 로 못 낸다: 그 계측기는 **밭 상태기를 안 돈다**(T112 §0ⓑ).
//   켠 팔의 식량은 **실제 수확**에서 오므로 밭을 안 도는 자로 재면 그 팔은 통째로 기근이다.
//   그래서 두 팔 다 **T117 자(`scripts/farm-metrics.js`)** 로 재고, 그 자가 같이 뱉는
//   `world8`(여덟 수 — 읽는 자리는 `t17-metrics.js` ⓐⓓⓔ 와 같다)을 여기서 견준다.
//
// ★이 파일에 산수는 **비율 하나**뿐이다(ON/OFF). 수는 전부 측정 JSON 에서 온다 — 사본 0.
//
// 실행:
//   1) 측정   : LAB_SEEDCACHE=/tmp/s.json FARM_JSON=/tmp/ab/off_1020.json                     node scripts/farm-metrics.js 800 1020
//               LAB_SEEDCACHE=/tmp/s.json FARM_JSON=/tmp/ab/on_1020.json  T100_FIELD_YIELD=1  node scripts/farm-metrics.js 800 1020
//   2) 표     : node scripts/t100-ab.js /tmp/ab            (기본 시드 1020·7·42 · `--seeds a,b,c` 로 바꿈)
'use strict';
const fs = require('fs');
const path = require('path');

const DIR = process.argv[2] && process.argv[2][0] !== '-' ? process.argv[2] : '/tmp/t100ab';
const si = process.argv.indexOf('--seeds');
const SEEDS = si >= 0 && process.argv[si + 1] ? process.argv[si + 1].split(',').map(Number) : [1020, 7, 42];

const load = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } };
const nf = (x) => (x == null ? '—' : Number(x).toLocaleString());
const pct = (a, b) => (b > 0 ? ((a / b - 1) * 100 >= 0 ? '+' : '') + ((a / b - 1) * 100).toFixed(1) + '%' : '—');

// 여덟 수(T17/T86 문법) + 밭 넉 수 — 이름과 자리는 `farm-metrics.js` 의 `world8` 이 정한다.
const COLS = [
  ['pop', '인구'], ['dead', '소멸'], ['weapQ', '무기Q'], ['expand', '확장셀'],
  ['trades', '거래'], ['toolQ', '도구Q'], ['preserved', '보존식'], ['salt', '소금'],
  ['econFood', '곳간식량'], ['hungry', '굶는마을'],
  ['cells', '밭칸'], ['cleared', '개간'], ['harvestN', '수확건'], ['foodEq', '밭식량등가'],
];

console.log('\n=== T100 4판 A/B — 밭이 곳간에 닿는다 (같은 자: scripts/farm-metrics.js) ===');
console.log(`  자료 ${DIR} · 시드 ${SEEDS.join('·')}`);
console.log('  팔: OFF = 경작지 12칸 · 산출식 끔(농부 추상 산출 그대로)  /  ON = 경작지 12칸 · 산출식 켬(수확 × k)');

const got = [];
for (const s of SEEDS) {
  const off = load(path.join(DIR, `off_${s}.json`)), on = load(path.join(DIR, `on_${s}.json`));
  if (!off || !on || !off.world8 || !on.world8) { console.log(`  ⚠시드 ${s} — 자료가 없다(off ${!!off} · on ${!!on})`); continue; }
  got.push({ s, off: off.world8, on: on.world8, offRows: off.rows, onRows: on.rows, days: on.days });
}
if (!got.length) { console.log('\n측정 JSON 이 없다 — 위 실행 절차를 먼저 돌려라.\n'); process.exit(1); }

const K = got[0].on.k, N = got[0].on.N;
console.log(`  앵커 N ${N} · 유도 k ${K != null ? K.toFixed(4) : '—'} · ${got[0].days}일`);

// ── ⓐ 여덟 수 A/B ───────────────────────────────────────────────────────────
console.log('\nⓐ 여덟 수 + 밭 넉 수 (OFF → ON · 변화율)');
const w = 13;
console.log('  시드  팔      ' + COLS.map(([, ko]) => ko.padStart(w)).join(''));
for (const g of got) {
  const row = (tag, o) => '  ' + String(g.s).padEnd(6) + tag.padEnd(8)
    + COLS.map(([k]) => (k === 'dead' ? `${o.dead}/${o.ever}` : nf(typeof o[k] === 'number' ? Math.round(o[k]) : o[k])).padStart(w)).join('');
  console.log(row('OFF', g.off));
  console.log(row('ON', g.on));
  console.log('  ' + ''.padEnd(6) + 'Δ'.padEnd(8)
    + COLS.map(([k]) => (k === 'dead' ? `${g.on.dead - g.off.dead}` : pct(g.on[k], g.off[k])).padStart(w)).join(''));
}

// ── ⓑ 유도의 자기 검산 — 농부 1인이 실제로 몇 명을 먹였나 ────────────────────
console.log('\nⓑ 자기 검산 — 농부 1인 부양 실측(켠 팔의 곳간 유입 ÷ 농부·해 ÷ 365)  대  앵커 N');
console.log('  시드   수확건/농부·해   곳간 유입(수확×k)      부양 실측     앵커 N     차이');
for (const g of got) {
  const fy = g.on.fDays / 365;
  const hpfy = fy > 0 ? g.on.harvestN / fy : 0;
  const inflow = g.on.harvestN * K;
  const sup = fy > 0 ? inflow / fy / 365 : 0;
  console.log('  ' + String(g.s).padEnd(7) + hpfy.toFixed(2).padStart(13) + nf(Math.round(inflow)).padStart(20)
    + sup.toFixed(3).padStart(15) + String(N).padStart(11) + (sup - N >= 0 ? '+' : '') + (sup - N).toFixed(3).padStart(8));
}
console.log('\nⓑ\' 앵커의 전제 — 인구의 몇 %가 농사를 짓나(출처가 가정한 70~80% 대 이 세계의 실제)');
console.log('  시드   팔    농부/인구   농부가 먹인 몫(부양실측 × 농부비율)');
for (const g of got) {
  const fr = (o, rows) => { const N = rows.reduce((a, r) => a + r.N, 0), f = rows.reduce((a, r) => a + r.fN, 0); return N > 0 ? f / N : 0; };
  const fo = fr(g.off, g.offRows), fn = fr(g.on, g.onRows);
  const fy = g.on.fDays / 365, sup = fy > 0 ? (g.on.harvestN * K) / fy / 365 : 0;
  console.log('  ' + String(g.s).padEnd(7) + 'OFF  ' + (fo * 100).toFixed(1).padStart(8) + '%');
  console.log('  ' + ''.padEnd(7) + 'ON   ' + (fn * 100).toFixed(1).padStart(8) + '%' + (sup * fn * 100).toFixed(1).padStart(28) + '%');
}
console.log('  ※출처(Clark)의 N 은 **인구의 70~80% 가 농사짓는 세계**의 수다. 이 세계는 농부가 그보다 훨씬 적다 —');
console.log('    그래서 농부 1인이 N 명을 먹여도 인구 전체는 못 먹인다. 나머지는 어부·사냥·채집이 낸다.');
console.log('    이 어긋남은 **적는 것**이지 N 을 키워 메우는 것이 아니다(튜닝 금지 · 회부).');
console.log('  ※`k` 는 시드 1020 OFF 팔의 수확건/농부·해로 유도했다. 켠 팔에서 그 수가 움직이면(인구·개간이 달라지므로)');
console.log('    부양 실측도 N 에서 벗어난다 — 그 벗어남을 **적는 것**이 이 표의 일이다(되맞추기=튜닝, 금지).');

// ── ⓒ ratio — T117 자의 원래 뜻(곳간 대비 밭 규모) ──────────────────────────
console.log('\nⓒ ratio(밭 연간 식량등가 ÷ 곳간 식량) — T117 자의 열 그대로');
console.log('  시드      OFF      ON');
for (const g of got) {
  const r = (o) => (o.econFood > 0 ? ((o.foodEq / (g.days / 365)) / o.econFood).toFixed(3) : '—');
  console.log('  ' + String(g.s).padEnd(8) + r(g.off).padStart(8) + r(g.on).padStart(8));
}

// ── ⓓ 소멸·기근 귀속 ────────────────────────────────────────────────────────
console.log('\nⓓ 소멸·굶는 마을 (0/51 이 아니면 어느 마을인가)');
for (const g of got) {
  const bad = (rows, o) => rows.filter((r) => r.N <= 0).map((r) => `${r.vid}:${r.name}`);
  const bo = bad(g.offRows), bn = bad(g.onRows);
  console.log(`  시드 ${g.s}  OFF 소멸 ${g.off.dead}/${g.off.ever}${bo.length ? ' (' + bo.join(' · ') + ')' : ''}`
    + ` · 굶는 마을 ${g.off.hungry}`);
  console.log(`         ON  소멸 ${g.on.dead}/${g.on.ever}${bn.length ? ' (' + bn.join(' · ') + ')' : ''}`
    + ` · 굶는 마을 ${g.on.hungry}`);
}
console.log('');
