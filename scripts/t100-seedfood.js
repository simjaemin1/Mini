#!/usr/bin/env node
// === scripts/t100-seedfood.js — T100 5판 §0-ⓐ 표: 창설 곳간의 밑변 ==========
//
// ⚠**표 짜는 기계다. 하네스가 아니다** — 러너에 넣지 않는다(`// @regress` 를 안 붙인다).
//
// ★왜 [지시 T100 5판 §0-ⓐ]
//   econ 의 창설 부존은 `storage.food = initN × 45` 였다. **45 는 유도된 수가 아니다** —
//   커밋 `6084b479`(2026-07-01, *"초반 인구 진동 해결: 부양력=생산잠재력 + 초기식량 300→45일"*)가
//   글럿을 피하려 고른 수다. T100 4판이 산출을 밭에 물리자 그 자리가 **골짜기**로 드러났다.
//   5판은 그 수를 `crops.js` 정본(`daysToFirstHarvest`)에서 유도한다 — 이 파일이 그 표를 낸다.
//
// ★이 파일엔 산수가 없다. 전부 `server/crops.js` 정본이 답한다(사본 0).
//
// 실행: node scripts/t100-seedfood.js
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t100-sf-${process.pid}.db`;
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const C = R('server/crops.js');
const econ = R('sim/economy-sim.js');

const _l = console.log; console.log = () => {};
const E = R('server/events.js');
console.log = _l;
const YEAR = (E.yearDaysOf && E.yearDaysOf()) || 365;

console.log('\n=== T100 5판 §0-ⓐ — 창설 곳간의 밑변 ===');
console.log(`  옛 수 45  ← 커밋 6084b479 (2026-07-01) "초반 인구 진동 해결: 부양력=생산잠재력 + 초기식량 300→45일"`);
console.log(`            원 주석도 스스로 말한다: "옛 300일치는 글럿" — **글럿을 피하려 고른 수**이지 유도된 수가 아니다.`);
console.log(`  새 밑변   crops.js daysToFirstHarvest(창설일) = 파종창(sowableMonth) + 익음 시계(readyDay · 휴면·춘화 T99) · 여유 0`);
console.log(`  한 해 ${YEAR}일 · 게임일 0 = ${C.monthOf(0)}월 (CROP_ANCHOR_MONTH — crops.js 가 카탈로그에서 역산한 앵커)`);

// ── ⓐ-1 달마다 ──────────────────────────────────────────────────────────────
console.log('\nⓐ-1 창설한 달마다 — 첫 수확까지 며칠인가');
console.log('  월  게임일  심을 수 있나  후보종  익음(최소~최대)   **유도 일수**   옛 45 대비');
for (let m = 1; m <= 12; m++) {
  let d0 = null;
  for (let d = 0; d < YEAR; d++) if (C.monthOf(d) === m) { d0 = d; break; }
  if (d0 == null) continue;
  const cand = [...new Set([...C.sowableMonth('논', m), ...C.sowableMonth('밭', m)])];
  const rd = cand.map((id) => C.readyDay(id, d0, 900)).filter((x) => x != null).map((x) => x - d0);
  const got = C.daysToFirstHarvest(d0);
  console.log('  ' + String(m).padStart(2) + String(d0).padStart(8)
    + (cand.length ? '     예' : '   아니오(굴러간다)').padStart(cand.length ? 13 : 13)
    + String(cand.length).padStart(7)
    + (rd.length ? `${Math.min(...rd)}~${Math.max(...rd)}` : '—').padStart(15)
    + String(got).padStart(15) + (got >= 45 ? '+' : '') + String(got - 45).padStart(10));
}
console.log('  ※겨울(심을 수 있는 종 0)은 **봄 첫 파종창까지 굴러간 뒤** 익는다 — T99 휴면 그대로, 새 규칙 0.');

// ── ⓐ-2 실지도 51마을 ───────────────────────────────────────────────────────
console.log('\nⓐ-2 실지도 51마을 — 창설일 분포');
{
  const { ZONES } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const V = R('server/villages.js');
  const n = ((T.getZoneVillages && T.getZoneVillages('hanbando')) || []).length;
  console.log(`  후보 ${n}곳 · NPC 마을은 **전부 부팅(게임일 0)에 선다** — \`seedVillages\` 가 한 번에 세운다.`);
  console.log(`  ⇒ 창설일 분포는 한 점이다: 게임일 0(${C.monthOf(0)}월) → 유도 **${C.daysToFirstHarvest(0)}일** (옛 45 대비 +${C.daysToFirstHarvest(0) - 45})`);
  console.log(`  ⇒ 계절이 갈리는 것은 **플레이어가 세우는 마을**뿐이다 — 위 ⓐ-1 표가 그 값을 준다(창설 한 줄이 \`opts.bornDay\` 를 읽는다).`);
  console.log(`  · econ 이 적어 둔 폴백 SEED_FOOD_DAYS_D0 = ${econ.SEED_FOOD_DAYS_D0} (하네스 ⑩ 이 crops.js 에서 다시 유도해 대조)`);
  console.log(`  · 옛 수는 끈 팔의 값으로만 남았다 SEED_FOOD_DAYS_LEGACY = ${econ.SEED_FOOD_DAYS_LEGACY}`);
  if (V) { /* 적재만 — 표는 위가 전부다 */ }
}

// ── ⓐ-3 ⓒ 텃밭 하한(조건부) ────────────────────────────────────────────────
console.log('\nⓐ-3 ⓒ 텃밭 하한 — 유도(쓰이면)');
console.log(`  텃밭 칸수 ${econ.T100_GARDEN_CELLS}칸/농부 (= 생활층 LIFE_CLEAR_PDAY) × k ${econ.T100_K.toFixed(4)} ÷ 익음 주기 ${econ.SEED_FOOD_DAYS_D0}일`);
console.log(`  = **${econ.T100_GARDEN_FLOOR.toFixed(4)} 식량등가/농부·일**  (앵커 N ${econ.T100_ANCHOR_N} 의 ${(econ.T100_GARDEN_FLOOR / econ.T100_ANCHOR_N * 100).toFixed(1)}%)`);
console.log(`  손잡이 T100_GARDEN=0 이면 끈다(지금 ${econ.T100_GARDEN ? '켬' : '끔'}). 수확이 바닥보다 많은 날엔 한 톨도 안 댄다(max).`);
console.log('');
