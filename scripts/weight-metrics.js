#!/usr/bin/env node
// === scripts/weight-metrics.js — 무게 대리 지표 =================================
//
// ★[재민 확정 2026-08-27 · 검증 §] 지시가 요구한 둘을 실측한다:
//   ① **대표 시나리오 짐 무게 표** — 낚시 한나절 · 곡물 배달 한 짐 · 광석 캐기 한 짐(용량 대비 %)
//   ② **과적 시 이속 곡선 표**
//
// ⚠계측기지 하네스가 아니다 — PASS/FAIL 을 세지 않는다. 러너 목록에 넣지 마라.
// ⚠무게·곡선을 여기서 다시 정의하지 않는다. 전부 정본(`weights`·`carry`·`fishing`)이 낸 수다.
//   (서버를 안 띄운다 — 이 셋은 순수 모듈이라 부팅이 필요 없다. 그래서 회귀와 나란히 돌려도 안전하다.)
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const W = require(path.join(ROOT, 'server', 'weights.js'));
const C = require(path.join(ROOT, 'server', 'carry.js'));
const F = require(path.join(ROOT, 'server', 'fishing.js'));
const pad = (s, n) => String(s).padStart(n);

const CAP = C.CFG.CAP_KG;
console.log(`\n=== 무게 대리 지표 (정본 모듈만 사용) ===`);
console.log(`  기본 용량 CARRY_CAP_KG = ${CAP}kg · 과적 바닥 ×${C.CFG.MOVE_FLOOR} · 신체×과적 합산 바닥 ×${C.CFG.COMBINED_FLOOR}`);

// ── ① 대표 시나리오 ─────────────────────────────────────────────────────────
//   각 시나리오의 "한 짐"은 **그 활동이 한나절에 내는 산출**을 정본 상수에서 뽑는다(손으로 정하지 않는다).
const fishMedianKg = Math.exp(F.CFG.SIZE_MU);          // 로그정규 중앙값 = exp(μ)
const scen = [];
{
  // 낚시 한나절 — 사이클(대기+창)이 평균 WAIT_BASE_MS 라 30분에 대략 몇 마리인지에서 뽑는다.
  const cycleSec = F.CFG.WAIT_BASE_MS / 1000 + 3;      // 대기 + 챔질·재투척 여유
  const n = Math.round((30 * 60) / cycleSec);
  scen.push({ name: `낚시 한나절(30분 · ${n}마리)`, kg: +(n * fishMedianKg).toFixed(1),
              note: `중앙값 ${fishMedianKg.toFixed(2)}kg/마리 — 개체라 실제론 편차가 크다` });
}
{
  const n = 40;
  scen.push({ name: `곡물 배달 한 짐(${n}단위)`, kg: +(n * W.kgOf('food')).toFixed(1),
              note: `${W.kgOf('food')}kg/단위 — 1인 1일분` });
}
{
  const n = 8;
  scen.push({ name: `광석 캐기 한 짐(${n}덩이)`, kg: +(n * W.kgOf('ore')).toFixed(1),
              note: `${W.kgOf('ore')}kg/덩이 — 최중량 벌크` });
}
{
  const n = 10;
  scen.push({ name: `판자 나르기(${n}장)`, kg: +(n * W.kgOf('plank')).toFixed(1),
              note: `${W.kgOf('plank')}kg/장 — ※시작 지급이었으나 2026-08-28 빈손 배치로 폐지` });
}
{
  // ★[빈손 시작 2026-08-28] 조잡한 석기 한 벌 — 빈손이 처음 갖는 무게
  const kg = W.kgOf('crude_axe') + W.kgOf('crude_pick') + W.kgOf('crude_blade');
  scen.push({ name: '조잡한 석기 한 벌(3종)', kg: +kg.toFixed(1), note: '빈손이 처음 갖는 짐 — 정품 3.6kg 보다 무겁다' });
}
{
  scen.push({ name: '통나무 한 짐(참나무 4)', kg: +(4 * W.kgOf('oak_log')).toFixed(1),
              note: `${W.kgOf('oak_log')}kg/통 — 통째론 못 나른다(가공해야 한다)` });
}
{
  scen.push({ name: '도구 3종(톱·망치·도끼)', kg: +(3 * W.kgOf('axe')).toFixed(1), note: '항상 지고 다니는 몫' });
}
console.log('\n① 대표 시나리오 짐 무게');
console.log(`   ${pad('시나리오', 26)}${pad('kg', 8)}${pad('용량대비', 10)}${pad('이속', 8)}  비고`);
for (const s of scen) {
  const r = s.kg / CAP;
  const mult = C.lerpCurve(C.MOVE_CURVE, r);
  console.log(`   ${pad(s.name, 26)}${pad(s.kg, 8)}${pad(Math.round(r * 100) + '%', 10)}`
    + `${pad('×' + Math.max(C.CFG.MOVE_FLOOR, mult).toFixed(2), 8)}  ${s.note}`);
}
console.log('   ⇒ 용량 25kg 은 **한 짐이 곧 한 번의 왕복**이 되게 하는 값이다(두 짐을 한 번에 못 든다).');

// ── ② 과적 곡선 ─────────────────────────────────────────────────────────────
console.log('\n② 과적 이속 곡선 (r = 소지/용량)');
console.log(`   ${pad('r', 6)}${pad('kg', 8)}${pad('이속', 8)}${pad('피로', 8)}${pad('무들', 6)}`);
const fake = {};
for (const r of [0.5, 1.0, 1.1, 1.15, 1.3, 1.5, 1.7, 2.0, 2.4, 3.0, 4.0]) {
  fake.inventory = { stone: 1 }; fake.kgLedger = { stone: [r * CAP] }; fake._carryStage = 0;
  const e = C.effects(fake);
  // 단계는 히스테리시스가 있어 이력을 타므로, 표에서는 **바닥에서 올라온 값**으로 찍는다
  let st = 0; for (let x = 0; x <= r + 1e-9; x += 0.01) { fake._carryStage = st; st = C.stageOf(fake, x); }
  console.log(`   ${pad(r.toFixed(2), 6)}${pad((r * CAP).toFixed(0), 8)}${pad('×' + e.moveMult.toFixed(3), 8)}`
    + `${pad('×' + e.fatigueMult.toFixed(2), 8)}${pad(st || '—', 6)}`);
}
console.log(`   ⇒ 1단계 경계 r₁=${C.R1.toFixed(2)} 는 **곡선에서 유도**한 값이다(이속 −5% 체감점 · 상수 아님).`);
console.log(`   ⇒ 바닥(×${C.CFG.MOVE_FLOOR})에 닿는 건 r=${C.MOVE_CURVE[C.MOVE_CURVE.length - 1][0]} — 용량의 3배다. 그 위로는 **피로만** 는다.`);
console.log('');
