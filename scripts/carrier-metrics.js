#!/usr/bin/env node
// (표 없음 — **계측기다. 러너에 넣지 마라.**)
// === scripts/carrier-metrics.js — 지게 대리 지표 ==================================
//
// 재민이 실기 전에 봐야 할 수들을 한 장으로 낸다. **판정하지 않는다** — 수만 낸다.
//   ① 지게 한 대의 값: 재료·시간·무게·순이득 (숙련별)
//   ② **곡물 1회 운반량** 전/후 — "곡물이 화폐 노릇을 한다"는 이 카드의 전제를 수로 만든다
//   ③ **자염 한 솥 왕복 횟수** 전/후 — 이 카드가 첫 병목이라 부른 그 원정
//   ④ 이속으로 본 값 — 같은 짐을 지고 얼마나 빨라지나
//   ⑤ 내구가 견디는 원정 횟수
//
// ★수는 전부 정본에서 온다(`carry` · `player-items` · `weights` · `salt`). 여기서 계산만 한다.
// 실행: node scripts/carrier-metrics.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const C = require(path.join(ROOT, 'server', 'carry.js'));
const PI = require(path.join(ROOT, 'server', 'player-items.js'));
const W = require(path.join(ROOT, 'server', 'weights.js'));
const Salt = require(path.join(ROOT, 'server', 'salt.js'));

const BASE = C.CFG.CAP_KG;
const KGE = W.kgOf('carrier');
const SPEED = 64;                    // 정본 이속 px/s
const SEA_PX = 61900;                // 시작 광장 → 바다 실측(자염 §0 — 도보 16.1분)
const LEG_MIN = SEA_PX / SPEED / 60;
const mk = (lv) => { const i = PI.craftItem('carrier', lv, { wood: 2 }); i.id = 'm'; return i; };
const wear = (lv) => { const p = { inventory: {}, equipment: [mk(lv)], equipSlots: { [C.CARRIER_SLOT]: 'm' } }; return p; };
const capOf = (lv) => (lv == null ? BASE : C.capKg(wear(lv)));
// 짐으로 쓸 수 있는 kg — 지게 자신의 무게를 뺀다(지게도 짐이다)
const payload = (lv) => (lv == null ? BASE : capOf(lv) - KGE);

console.log('=== 지게 대리 지표 ===\n');

// ── ① 지게 한 대 ────────────────────────────────────────────────────────────
console.log('① 지게 한 대의 값');
const R = { qty: 2, extra: { fiber: 2 } };
const matKg = 2 * W.kgOf('wood') + 2 * W.kgOf('fiber');
console.log(`   재료 통나무 ${R.qty}(${(2 * W.kgOf('wood')).toFixed(1)}kg) + 풀 ${R.extra.fiber}(${(2 * W.kgOf('fiber')).toFixed(1)}kg) = ${matKg.toFixed(1)}kg → 지게 **${KGE.toFixed(1)}kg**(깎아 낸 몫)`);
console.log(`   작업대에서 ${(parseInt(process.env.CRAFT_TOOL_MS || '180000', 10) / 60000).toFixed(0)}분(오프라인 진행 · 도구와 같은 대기열)`);
console.log('   숙련  적재가산  상한      순이득   내구');
for (const lv of [0, 3, 5, 7, 10]) {
  const i = mk(lv);
  console.log(`   Lv${String(lv).padStart(2)}    +${String(i.attrs.load).padStart(2)}kg    ${String(BASE)}→${String(capOf(lv)).padStart(2)}kg    +${String(i.attrs.load - KGE).padStart(2)}kg    ${i.durMax}`);
}

// ── ② 곡물 1회 운반량 ───────────────────────────────────────────────────────
console.log('\n② 곡물 1회 운반량 — 전/후 (★이 카드의 전제: "곡물이 화폐 노릇을 한다")');
const FOOD = W.kgOf('food');
console.log(`   곡식 1단위 = ${FOOD}kg(앵커)`);
const g0 = Math.floor(BASE / FOOD);
console.log(`   맨몸          상한 ${BASE}kg → **곡식 ${g0}단위**`);
for (const lv of [0, 5, 10]) {
  const g = Math.floor(payload(lv) / FOOD);
  console.log(`   지게 Lv${String(lv).padStart(2)}     상한 ${capOf(lv)}kg(짐 ${payload(lv)}kg) → **곡식 ${g}단위**  (×${(g / g0).toFixed(2)})`);
}

// ── ③ 자염 한 솥 왕복 ───────────────────────────────────────────────────────
console.log('\n③ 자염 원정 — 한 번 다녀와 소금 몇 · 왕복 몇 번');
const NEED = Salt.brinePerPot(), BKG = W.kgOf('brine'), WKG = W.kgOf('wood'), WOOD = Salt.CFG.WOOD_PER_POT;
console.log(`   한 솥 = 짠물 ${NEED}되(${(NEED * BKG).toFixed(0)}kg) + 땔감 ${WOOD}단(${(WOOD * WKG).toFixed(0)}kg) → 소금 ${Salt.potYield('boil_salt')}`);
console.log(`   ★가마는 바닷가에 짓는다 ⇒ 돌아오는 짐은 **소금**이고, 가는 짐은 **빈 병**이다(병 1kg = 짠물 1kg — 무게가 같다).`);
console.log(`   ⇒ 한 번 원정의 병목은 **들고 갈 수 있는 빈 병 수**다.`);
console.log(`   편도 ${LEG_MIN.toFixed(1)}분(시작 광장→바다 실측) · 왕복 ${(LEG_MIN * 2).toFixed(0)}분`);
const pots = (cap) => Math.floor(cap / (NEED * BKG));
const p0 = pots(BASE);
console.log(`   맨몸          병 ${Math.floor(BASE / BKG)}개 → **${p0}솥 = 소금 ${p0}**  (왕복 ${(LEG_MIN * 2).toFixed(0)}분 + 자염 ${(Salt.boilMs('boil_salt', 24 * 60 * 1000) / 60000 * p0).toFixed(0)}분)`);
for (const lv of [0, 5, 10]) {
  const n = pots(payload(lv));
  console.log(`   지게 Lv${String(lv).padStart(2)}     병 ${Math.floor(payload(lv) / BKG)}개 → **${n}솥 = 소금 ${n}**  (×${(n / p0).toFixed(2)})`);
}
console.log(`   ⇒ **소금 하나당 왕복**: 맨몸 ${(1 / p0).toFixed(2)}회 → 지게 Lv10 ${(1 / pots(payload(10))).toFixed(2)}회`);
console.log(`      (겨울나기 셈 재사용: 절임 한 통 = 소금 1 ⇒ 지게 하나가 **절임 ${pots(payload(10)) - p0}통 몫의 걸음**을 지운다)`);

// ── ④ 이속 ─────────────────────────────────────────────────────────────────
console.log('\n④ 같은 짐을 지고 얼마나 빨라지나 (곡선은 무변경 — 상한만 옮겨졌다)');
console.log('     짐    맨몸     지게Lv0   지게Lv10');
for (const kg of [20, 25, 30, 35, 40, 45, 50]) {
  const row = [null, 0, 10].map((lv) => C.lerpCurve(C.MOVE_CURVE, kg / capOf(lv)));
  console.log(`   ${String(kg).padStart(3)}kg   ×${row[0].toFixed(3)}   ×${row[1].toFixed(3)}    ×${row[2].toFixed(3)}`);
}

// ── ⑤ 내구 ─────────────────────────────────────────────────────────────────
console.log('\n⑤ 지게 하나가 견디는 원정');
const WEAR_MS = parseFloat(process.env.CARRY_CARRIER_WEAR_MS) > 0 ? parseFloat(process.env.CARRY_CARRIER_WEAR_MS) : 120000;
console.log(`   마모 ${(WEAR_MS / 1000).toFixed(0)}초당 1 — **짐을 지고 걸을 때만**(빈 몸·서 있으면 0)`);
for (const lv of [0, 5, 10]) {
  const d = mk(lv).durMax, min = d * WEAR_MS / 60000;
  console.log(`   Lv${String(lv).padStart(2)}  내구 ${String(d).padStart(3)} → 짐 지고 걷는 시간 ${min.toFixed(0)}분 = 자염 왕복 **${(min / (LEG_MIN * 2)).toFixed(1)}회**`);
}
console.log('\n(수는 전부 정본에서 온다 — 이 스크립트는 계산만 한다.)');
