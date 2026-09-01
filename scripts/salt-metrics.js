#!/usr/bin/env node
// (표 없음 — **계측기다. 러너에 넣지 마라.**)
// === scripts/salt-metrics.js — 자염 대리 지표 ====================================
//
// 재민이 실기 전에 봐야 할 수들을 한 장으로 낸다. **판정하지 않는다** — 수만 낸다.
//   ① 갯벌이 닿는 마을 몇 곳인가 · 시작 광장에서 바다까지 얼마인가
//   ② 빈손에서 소금 한 줌까지 무엇이 몇 개·몇 분 드는가(30분 예산 대비)
//   ③ 땔감 대비 수율
//   ④ 거래소 가격 대비 손익 — **지금 성립하는가**
//   ⑤ 사건 장부의 "소금 부족" 빈도(실측은 `ev-density` 계열이 낸다 — 여기선 구조만)
//
// 실행: node scripts/salt-metrics.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Salt = require(path.join(ROOT, 'server', 'salt.js'));
const Weights = require(path.join(ROOT, 'server', 'weights.js'));
const Specialty = require(path.join(ROOT, 'server', 'specialty.js'));
const Crops = require(path.join(ROOT, 'server', 'crops.js'));
const Villages = require(path.join(ROOT, 'server', 'villages.js'));
const Chunk = require(path.join(ROOT, 'server', 'chunk.js'));
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const T = require(path.join(ROOT, 'server', 'terrain')); if (T.setZonesMeta) T.setZonesMeta(ZONES);

const Z = ZONES.hanbando;
const SPEED = 64;                       // 정본 이속 px/s
const DAY_MS = 24 * 60 * 1000;
const NEED = Salt.brinePerPot(), WOOD = Salt.CFG.WOOD_PER_POT, OUT = Salt.potYield('boil_salt');

console.log('=== 자염 대리 지표 ===\n');

// ── ① 지리 ──────────────────────────────────────────────────────────────────
const OCEAN = Object.values(ZONES).filter((z) => z.isOcean)
  .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const WT = Chunk.generateCoastlineWaterTiles({ ...Z, id: 'hanbando' }, 32, () => null, OCEAN);
const isSea = (x, y) => {
  if (x < 0 || y < 0 || x >= Z.zoneWidth || y >= Z.zoneHeight) return false;
  const tx = Math.floor(x / 32), ty = Math.floor(y / 32);
  if (!WT.has(`${tx}_${ty}`)) return false;
  return !T.isWaterCellLocal('hanbando', tx * 32 + 16, ty * 32 + 16);
};
const CTX = { isSea };
console.log('① 지리 — 바다가 어디 있나');
console.log(`   해안선 타일 ${WT.size}개 · 바다에 면한 변: 남(동창해) 하나뿐(서·동·북은 육지 존)`);
const vs = T.getZoneVillages('hanbando') || [];
const tiles = [...WT].map((s) => { const [a, b] = s.split('_'); return [+a * 32 + 16, +b * 32 + 16]; });
const rows = vs.map((v) => {
  let best = Infinity;
  for (const [cx, cy] of tiles) { const d = Math.hypot(cx - v.x, cy - v.y); if (d < best) best = d; }
  return { name: v.name, d: best };
}).sort((a, b) => a.d - b.d);
for (const R of [960, 3200, 9600]) console.log(`   바다까지 ${String(R).padStart(5)}px(도보 ${String(Math.round(R / SPEED)).padStart(3)}초) 안: ${rows.filter((r) => r.d <= R).length}/${vs.length}곳`);
console.log(`   가장 가까운 셋: ${rows.slice(0, 3).map((r) => `${r.name} ${Math.round(r.d)}px`).join(' · ')}`);
const sq = Z.mainSquare;
let sqD = Infinity; for (const [cx, cy] of tiles) { const d = Math.hypot(cx - sq.x, cy - sq.y); if (d < sqD) sqD = d; }
console.log(`   ★시작 광장(${sq.name})에서 바다까지 ${Math.round(sqD)}px = 도보 **${(sqD / SPEED / 60).toFixed(1)}분**`);

// ── ② 빈손 → 소금 한 줌 ─────────────────────────────────────────────────────
console.log('\n② 빈손 → 소금 1 — 무엇이 몇 개, 몇 분');
const gourd = Crops.get('gourd');
const tilesForGourd = Math.ceil(NEED / (gourd.yield || 1));
const boilMin = Salt.boilMs('boil_salt', DAY_MS) / 60000;
const walkMin = sqD / SPEED / 60;
console.log(`   ⓐ 그릇  — 박 ${NEED}개 → 물병 ${NEED}개(맨손 가공 · 즉시)`);
console.log(`             박은 밭 한 칸에 ${gourd.yield}개 ⇒ **밭 ${tilesForGourd}칸** · 성장 ${gourd.growDays}게임일 = 실시간 ${(gourd.growDays * 24 / 60).toFixed(0)}시간 · 파종철 ${gourd.sow.join(',')}`);
console.log(`   ⓑ 가마  — 석재 4 + 통나무 3(망치 없이) · 지고 가면 ${Weights.kgOf('item_salt_kiln')}kg`);
console.log(`   ⓒ 걸음  — 시작 광장 → 바다 **${walkMin.toFixed(0)}분**(편도 · 도구 없이)`);
console.log(`   ⓓ 채수  — ${NEED}회 · 병 ${NEED}개가 짠물 ${NEED}되(${NEED * Weights.kgOf('brine')}kg)로 바뀐다`);
console.log(`   ⓔ 자염  — 한 솥 **${boilMin.toFixed(0)}분**(오프라인 진행) → 소금 ${OUT}`);
console.log(`   ⇒ 30분 예산 대비: **걸음 ${walkMin.toFixed(0)}분 + 자염 ${boilMin.toFixed(0)}분 = ${(walkMin + boilMin).toFixed(0)}분**`);
console.log(`      (박 농사 ${(gourd.growDays * 24 / 60).toFixed(0)}시간은 예산 밖 — 자염은 **원정이자 중반 산업**이다)`);
console.log(`   ★단 병은 **가마가 돌려준다** ⇒ 그릇은 소모가 아니라 **자본**이다.`);
console.log(`      두 번째 솥부터 드는 것: 걸음 + 짠물 ${NEED}되 + 땔감 ${WOOD} + ${boilMin.toFixed(0)}분.`);

// ── ③ 땔감 대비 수율 ────────────────────────────────────────────────────────
console.log('\n③ 땔감 대비 수율');
const brineKg = NEED * Weights.kgOf('brine'), woodKg = WOOD * Weights.kgOf('wood');
console.log(`   짠물 ${NEED}되(${brineKg}kg · 염도 ${(Salt.CFG.BRINE_PCT * 100).toFixed(0)}%) + 땔감 ${WOOD}단(${woodKg}kg) → 소금 ${OUT}(${OUT * Salt.CFG.SALT_KG}kg)`);
console.log(`   ⇒ 땔감 1단당 소금 ${(OUT / WOOD).toFixed(2)} · 소금 1kg당 땔감 **${woodKg.toFixed(1)}kg**`);
console.log(`   (근거: 물 ${(brineKg - OUT).toFixed(0)}kg 증발 × 잠열 2.26MJ ≈ ${((brineKg - OUT) * 2.26).toFixed(1)}MJ ÷ 장작 15MJ/kg ÷ 효율 0.15 ≈ ${(((brineKg - OUT) * 2.26) / 15 / 0.15).toFixed(1)}kg — 추정)`);

// ── ④ 거래소 손익 ───────────────────────────────────────────────────────────
console.log('\n④ 거래소 손익 — 지금 성립하는가');
const map = Villages.playerVillageDepositMap();
const saltBV = Specialty.RESOURCES.salt.baseValue;
const woodBV = (Specialty.RESOURCES.wood || {}).baseValue;
console.log(`   econ 기준값: 소금 baseValue ${saltBV} · 나무 baseValue ${woodBV != null ? woodBV : '(econ 재화 아님)'}`);
console.log(`   ★소금이 PV_DEPOSIT_MAP 에 있나? **${Object.keys(map).includes('salt') ? 'YES' : 'NO'}**`);
if (!Object.keys(map).includes('salt')) {
  console.log('   ⇒ **손익 표를 낼 수 없다.** 팔 수가 없어서 가격이 붙지 않는다.');
  console.log('      플레이어의 소금은 지금 **절임 재료로만** 산다(그것만으로도 잠긴 레시피 하나가 열렸다).');
  console.log('      편입은 `PV_DEPOSIT_MAP` 한 줄 — 게시 건수 기준선이 움직인다(곡물 품목화 전례). 회부 B.');
}
console.log(`   납품 가능 econ 재화 ${new Set(Object.values(map)).size}종: ${[...new Set(Object.values(map))].sort().join(' ')}`);

// ── ⑤ 사건 장부 ─────────────────────────────────────────────────────────────
console.log('\n⑤ 사건 장부의 "소금 부족"');
console.log('   실측(랩 시드 1020 · 800일 · 51마을): 소금 재고합 **0** · 생산 0 · 소비 0 · 캐러밴 교역 **0건** · 부족 사건 **0건**');
console.log('   ⇒ 마을은 소금을 **캐지도 쓰지도 않는다.** 한반도 광종 POOL 여섯에 소금이 없고,');
console.log('      소비 바구니에도 안 든다(`_consEMA` 19종에 salt 없음). `sim/economy-sim.js:2050` 의');
console.log('      `addProduce(\'salt\', oAmt*0.05)` 는 있으나 실지도 51마을에서 재고로 남지 않는다.');
console.log('   ⇒ **"소금 부족 마을에 납품"은 지금 구조적으로 불가능하다** — 표 한 줄로는 안 되고');
console.log('      NPC 수요(specialty·소비 바구니)가 먼저다. econ 수정이라 이 카드 밖이다. 회부 B.');
console.log('\n(수는 전부 `server/salt.js` 정본과 실측에서 온다 — 이 스크립트는 계산만 한다.)');
