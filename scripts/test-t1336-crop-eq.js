#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1336-crop-eq.js — T1336: 복원한 세계도 작물을 먹는다(`T1336_CROP_EQ` · 끔 기본) · 같은 조건이면 직업 하루 생산 몸 = 랩 ===
//
// ★T1336 ②: 작물 식량 값 표(`world.cropFoodEq`)는 세계 객체의 칸이라 저장되지 않는다. 서버가 다시 서면(배포 · T1308 이어 돌리기 마디마다)
//   첫 수확까지 표가 없다 — 곳간 합계(`storageFoodPer` — 표가 없으면 열량 정본 `econUnitsOf`)는 작물을 식량으로 세는데
//   섭식(`consumeFood` 3.6 `_t368Crops` — 표가 없으면 null)은 작물을 안 먹는다 ⇒ 곳간이 차 있는 채 굶는다(몸 1020 날 80: 곳간 19,802 중 작물 약 16,000 · 먹은 작물 0).
//  ① 표 없음(복원한 세계 · 종전) — 곳간 합계는 작물을 센다 · 섭식은 작물을 0 먹고 모자란다(결함 재현)
//  ② 표 있음(시딩 세계 · 랩 · 켬 복원) — 같은 곳간에서 작물을 먹고 모자람 0 · 합계는 같은 자(표 = `econUnitsOf` 그 값)
//  ③ 서버 글자 — 복원 갈래(`restoreEcon` 뒤 `ev._world = world` · 시딩 줄 다음)가 손잡이 켬 + 작물 칸 켬일 때만 같은 함수(`_t368Attach`)로 심는다 · 손잡이 끔 기본
//     · 미끼: 심는 줄을 지운 사본은 ③ 이 빨강
//  ④ 같은 조건 ⇒ 같은 직업 하루 생산 — 같은 씨앗 세계 둘(하나는 실제 호스트 `bindProductionActs` = 몸 · 하나는 랩) 한 틱 뒤 `dailyProductionBuf` 같음
//     (사냥 · 어로 · 채집 행위 손잡이 끔 기본 = 두 세계 모두 econ 식)
//
// 실행: node scripts/test-t1336-crop-eq.js
'use strict';
process.env.T1243_FARM_ON = process.env.T1243_FARM_ON || '1';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');
const E = require(path.join(ROOT, 'sim', 'economy-sim'));
const E2 = require(path.join(ROOT, 'sim', 'economy-sim-v2'));
const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const Kcal = require(path.join(ROOT, 'server', 'kcal.js'));

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else fail++; console.log(`  ${c ? '✓' : '✗'} ${m}${d !== undefined ? '  ' + d : ''}`); };
const f1 = (x) => (x == null ? '-' : (+x).toFixed(2));
const table = () => { const t = {}; for (const id of Crops.IDS) t[id] = +Kcal.econUnitsOf(id, 1) || 0; return t; };   // 서버 `_t368Attach` 와 같은 식

console.log('\n=== T1336 복원한 세계도 작물을 먹는다 · 같은 조건이면 직업 하루 생산 몸 = 랩 ===');
function eatCase(withTable) {
  const W = { villages: [] };
  if (withTable) W.cropFoodEq = table();
  const v = { storage: { azuki: 100, foxtail_millet: 100 }, npcs: [], _world: W };
  const fe0 = E.storageFoodEquivalent ? E.storageFoodEquivalent(v, v.storage, false) : E.totalFoodEquivalent(v);
  const need = 10;
  const gap = E.consumeFood(v, need);
  const ate = (100 - v.storage.azuki) * E.storageFoodPer(v, 'azuki') + (100 - v.storage.foxtail_millet) * E.storageFoodPer(v, 'foxtail_millet');
  return { fe0, gap: +gap || 0, ate, perAz: E.storageFoodPer(v, 'azuki') };
}
console.log('\n① 표 없음(복원한 세계 · 종전)');
const N0 = eatCase(false);
ok(E.T368_FARM_ACT, '전제 — 밭 세계 켬(작물 칸 · `T368_FARM_ACT`)', String(E.T368_FARM_ACT));
ok(N0.fe0 > 100 && N0.perAz > 0, '곳간 합계는 작물을 식량으로 센다(표 없이 열량 정본)', `합계 ${f1(N0.fe0)} · 팥 1 = ${f1(N0.perAz)}`);
ok(N0.ate === 0 && N0.gap > 9.99, '★표 없음 — 작물을 하나도 안 먹고 하루 몫 10 이 다 모자란다(곳간이 차 있는 채 굶음 · 결함 재현)', `먹은 작물 ${f1(N0.ate)} · 모자람 ${f1(N0.gap)}`);
console.log('\n② 표 있음(시딩 세계 · 랩 · 켬 복원)');
const N1 = eatCase(true);
ok(N1.ate > 9.99 && N1.gap < 1e-6, '★표 있음 — 같은 곳간에서 작물로 하루 몫을 다 먹는다', `먹은 작물 ${f1(N1.ate)} · 모자람 ${f1(N1.gap)}`);
ok(Math.abs(N1.fe0 - N0.fe0) < 1e-6, '곳간 합계는 표 유무와 같은 값(표 = 열량 정본 `econUnitsOf` · 세는 자 무변)', `${f1(N1.fe0)} : ${f1(N0.fe0)}`);

console.log('\n③ 서버 글자 · 미끼');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const LINE = 'if (T1336_CROP_EQ && _t368ItemsOn()) _t368Attach({ econ: ev });';
function restoreAttaches(src) {
  const i = src.indexOf('ev = restoreEcon(row.econ_state, econ);'); if (i < 0) return false;
  const j = src.indexOf('ev._world = world;', i); if (j < 0) return false;
  const seg = src.slice(j, j + 400);
  return seg.indexOf(LINE) >= 0 && seg.indexOf(LINE) > seg.indexOf('_t1243Seed(ev, row.id)');   // 시딩 줄 바로 뒤(`test-t1243-farm-on` ③ 이 `_world` → 시딩 붙음을 글자로 지킨다)
}
ok(restoreAttaches(VSRC), '★복원 갈래 — `ev._world = world` · 첫 시작 시딩 줄 바로 뒤에 같은 함수로 심는다(손잡이 + 작물 칸 켬만)');
ok(/const T1336_CROP_EQ = process\.env\.T1336_CROP_EQ === '1';/.test(VSRC) && VSRC.split('T1336_CROP_EQ &&').length === 2, '손잡이 끔 기본(`=1` 만 켬) · 부르는 자리 하나');
ok(/function _t368Attach\(vil\)[\s\S]{0,400}W\.cropFoodEq = t;/.test(VSRC) && /for \(const id of C\.IDS\) t\[id\] = \+K\.econUnitsOf\(id, 1\) \|\| 0;/.test(VSRC), '심는 함수는 종전 그대로(작물 표 정본 × 열량 정본 · 하네스 ② 의 표와 같은 식)');
ok(!restoreAttaches(VSRC.replace(LINE, '')), '★미끼(심는 줄 지운 사본) — ③ 이 빨강');

console.log('\n④ 같은 조건 ⇒ 같은 직업 하루 생산(몸 호스트 : 랩)');
const mk = (bound) => {
  const w = E2.createWorldV2({ seed: 1020, villageCount: 1 }); w.picker = 'rational';
  if (bound) E.bindProductionActs(w);
  return w;
};
const WB = mk(true), WL = mk(false);
const vB = WB.villages[0], vL = WL.villages[0];
ok(['hunter', 'fisher', 'forager'].every((j) => !E.productionFormulaOff(vB, j) && !E.productionFormulaOff(vL, j)), '사냥 · 어로 · 채집 econ 식이 두 세계 모두 선다(행위 손잡이 끔 기본 — 몸 호스트도 식을 닫지 않는다)');
E.tickVillage(vB, 1, WB); E.tickVillage(vL, 1, WL);
const pB = vB.dailyProductionBuf || {}, pL = vL.dailyProductionBuf || {};
const foodKeys = [...new Set([...Object.keys(pB), ...Object.keys(pL)])].filter((k) => E.storageFoodPer(vB, k) > 0);
const diff = foodKeys.filter((k) => Math.abs((pB[k] || 0) - (pL[k] || 0)) > 1e-9);
ok(foodKeys.length > 0 && diff.length === 0, '★한 틱 뒤 식량 품목 하루 생산 같음(몸 호스트 = 랩)', `품목 ${foodKeys.length} · 다른 것 ${diff.join(',') || 0}`);

console.log(`\n${fail ? '✗' : '✓'} test-t1336-crop-eq ${pass}/${fail}`);
process.exit(fail ? 1 : 0);
