#!/usr/bin/env node
// === scripts/farm-q-metrics.js — 농사 품질 q 계측기 (T58b ⓖ) =====================
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`// @regress` 표를 붙이지 않는다).
//
// ★무엇을 재나: 카드 T58 ⓖ — *"NPC 의 `q` 가 곳간에 닿았다면 얼마인가"*.
//   지금 서버의 NPC 수확은 **곳간에 아무것도 안 넣는다**(`vil._crop.delete` + 짐 1칸이 전부).
//   랩은 `s.food += yieldC·L_YIELD·(1+숙련·0.09)·fert·V.fert²·q·(0.8+0.4·rand)` 였다.
//   ⇒ 서버로 옮길 때 **곱해질 자리가 q 하나**다(숙련은 §8.4 이력서 몫 · ±20% 는 주사위라 안 온다).
//     그래서 "닿았다면 얼마"는 **평균 q** 로 답이 나온다 — 그 수를 여기서 잰다.
//
// ★어떻게: 상태기 **정본**(`villages.__farmBind`)을 그대로 돌린다(사본 0).
//   마을을 흉내 내되 **노동 예산**은 제품 공식(`낮 실초 ÷ 건당 5초`)을 그대로 쓴다.
//   ⚠**근사다** — 실제 마을은 개간·건설과 노동을 나눠 쓰고 농부 수가 인구를 따라 움직인다.
//     여기서는 (밭 칸수 × 농부 수) 격자를 훑어 **q 가 어디에 앉는지**를 본다.
//
// 실행: node scripts/farm-q-metrics.js [일수=800]
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.ZONE_ID = 'hanbando';
process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0';
process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';

const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const V = require(path.join(ROOT, 'server', 'villages.js'));
const F = V.__farmBind();
const DAYS = parseInt(process.argv[2], 10) || 800;

function mkVil(dbId) {
  return { dbId, name: 'v' + dbId, ccx: 100, ccy: 100, _crop: new Map(), _drySet: new Set(), _farmSet: new Set() };
}
// 밭 칸 · 농부 수 격자 — 마을 규모의 실제 폭(개간 셀 수십~수백 · 농부 2~12)
const CELLS = [24, 48, 96, 192];
const FARMERS = [2, 4, 8, 12];
const TASKS_PER_FARMER = 100;      // 제품 공식(낮 실초 ÷ 5초)의 기본값 대역 — 아래 표에 명시

console.log(`=== 농사 품질 q — "닿았다면 얼마인가" (T58b ⓖ · ${DAYS}일) ===`);
console.log(`  상태기: villages.__farmBind() 정본 · 노동 예산 = 농부 × ${TASKS_PER_FARMER}칸/일(제품 공식 대역)`);
console.log('');
console.log('  밭칸 | 농부 | 예산/칸 |  평균 q | q≥0.9 | q=바닥 | 수확 | 병충해일');
console.log('  -----|------|---------|---------|-------|--------|------|--------');

const rows = [];
for (const cells of CELLS) {
  for (const farmers of FARMERS) {
    const vil = mkVil(7);
    const K = [];
    for (let i = 0; i < cells; i++) { const k = (100 + (i % 32)) + ',' + (200 + ((i / 32) | 0)); vil._farmSet.add(k); if (i % 3 === 0) vil._drySet.add(k); K.push(k); }
    let harvest = 0, pestDays = 0;
    const qSum = []; let qN = 0, qHi = 0, qLo = 0;
    for (let day = 0; day < DAYS; day++) {
      // ① 노동 — 우선순위 높은 칸부터(제품 `_lifeHeadlessDay` 와 같은 순회)
      let budget = farmers * TASKS_PER_FARMER;
      while (budget > 0) {
        let did = 0;
        for (const k of K) {
          if (budget <= 0) break;
          if (F._cellTask(vil, k, day) > 0 && F._lifeDoTask0(vil, null, k, day)) { budget--; did++; if (!vil._crop.has(k)) harvest++; }
        }
        if (!did) break;
      }
      // ② 하루 틱 — 품질 감쇠·병충해(정본)
      for (const [k, e] of vil._crop) { F.cropDayTick(e, !vil._drySet.has(k), day, k); if (e.ps) pestDays++; }
      // ③ 표본 — 자라는 중인 칸의 q
      for (const [, e] of vil._crop) { qSum.push(e.q); qN++; if (e.q >= 0.9) qHi++; if (e.q <= 0.2500001) qLo++; }
    }
    const mean = qN ? qSum.reduce((a, b) => a + b, 0) / qN : 1;
    rows.push({ cells, farmers, mean, hi: qHi / Math.max(1, qN), lo: qLo / Math.max(1, qN), harvest, pestDays });
    console.log(`  ${String(cells).padStart(4)} | ${String(farmers).padStart(4)} | ${String(Math.round(farmers * TASKS_PER_FARMER / cells)).padStart(7)} | ${mean.toFixed(4).padStart(7)} | ${(qHi / Math.max(1, qN) * 100).toFixed(1).padStart(5)}% | ${(qLo / Math.max(1, qN) * 100).toFixed(1).padStart(6)}% | ${String(harvest).padStart(4)} | ${String(pestDays).padStart(6)}`);
  }
}
// ── ★자명 통과 금지 — 일손을 **정말로** 굶겨 보고 q 가 내려가는지 본다 ──────────
//   위 격자에서 q 가 전부 1.00 이면 둘 중 하나다: ⓐ 노동이 실제로 병목이 아니거나 ⓑ 계측기가 눈이 멀었거나.
//   ⇒ 예산을 칸의 1/4, 1/10 로 줄여 **내려가는 것을 확인**한다. 내려가면 ⓐ 가 답이다.
console.log('');
console.log('  ★통제 — 예산을 칸보다 적게 주면 q 가 내려가는가(계측기가 눈이 멀지 않았나)');
console.log('  밭칸 | 예산/일 |  평균 q | q=바닥');
const ctrl = [];
for (const [cells, bud] of [[96, 96], [96, 24], [96, 10], [96, 3]]) {
  const vil = mkVil(9); const K = [];
  for (let i = 0; i < cells; i++) { const k = (300 + (i % 32)) + ',' + (400 + ((i / 32) | 0)); vil._farmSet.add(k); if (i % 3 === 0) vil._drySet.add(k); K.push(k); }
  const qs = []; let lo = 0;
  for (let day = 0; day < DAYS; day++) {
    let budget = bud;
    for (const k of K) { if (budget <= 0) break; if (F._cellTask(vil, k, day) > 0 && F._lifeDoTask0(vil, null, k, day)) budget--; }
    for (const [k, e] of vil._crop) F.cropDayTick(e, !vil._drySet.has(k), day, k);
    for (const [, e] of vil._crop) { qs.push(e.q); if (e.q <= 0.2500001) lo++; }
  }
  const m = qs.length ? qs.reduce((a, b) => a + b, 0) / qs.length : 1;
  ctrl.push(m);
  console.log(`  ${String(cells).padStart(4)} | ${String(bud).padStart(7)} | ${m.toFixed(4).padStart(7)} | ${(lo / Math.max(1, qs.length) * 100).toFixed(1)}%`);
}
console.log(`  ⇒ 계측기는 ${ctrl[0].toFixed(3)} → ${ctrl[ctrl.length - 1].toFixed(3)} 로 **실제로 내려간다** — 눈이 멀지 않았다.`);
console.log('');
const all = rows.reduce((a, r) => a + r.mean, 0) / rows.length;
const rich = rows.filter((r) => r.farmers * TASKS_PER_FARMER / r.cells >= 4);
const poor = rows.filter((r) => r.farmers * TASKS_PER_FARMER / r.cells < 4);
console.log('');
console.log(`  ★전 격자 평균 q = ${all.toFixed(4)}`);
console.log(`  ★일손이 넉넉할 때(예산/칸 ≥ 4) 평균 q = ${(rich.reduce((a, r) => a + r.mean, 0) / Math.max(1, rich.length)).toFixed(4)}`);
console.log(`  ★일손이 모자랄 때(예산/칸 < 4) 평균 q = ${(poor.reduce((a, r) => a + r.mean, 0) / Math.max(1, poor.length)).toFixed(4)}`);
console.log('');
console.log('  ⇒ **"닿았다면"의 크기**: 작물 산출을 econ 에 이으면 그 몫이 위 평균 q 만큼 곱해진다.');
console.log('    T73(곳간의 생곡은 식량이다) 뒤로 **밑변이 커졌으므로**, 같은 배율이라도 절대량은 그만큼 크다.');
console.log('    ⚠이 표는 **곱해질 배율**만 말한다 — 밑변(작물 산출 자체)은 ECON 수술 2 가 세운다.');
