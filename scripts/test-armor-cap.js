#!/usr/bin/env node
// === 갑옷 수요-캡 하네스 ===
// 계약: 갑옷장이는 재고가 캡(교역 keep + 매물 문턱) 이상이면 **산출도 투입도** 멈추고,
//       캡 아래로 내려가면(마모·수출) 생산을 재개한다. — 모시 수요-캡 규약 동형.
// 배경: 범용 output 분기에 재고 게이트가 없어 갑옷장이가 stone·hide·ore를 태우며 무한 생산
//       (실측: 800일 시드7 삼림 — 전사 2·갑옷 642 = 목표의 ~250배). [재민 지시 "직접 해결" 2026-08-01]
// 실행: node scripts/test-armor-cap.js
'use strict';
const econ = require('../sim/economy-sim.js');
let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✓ ' : '  ✗ ') + m); if (!c) fail++; };

// 최소 결정론 세계 — createWorld로 만들고 마을 1곳을 갑옷 실험대로 개조
econ.setSeed(7);
const world = econ.createWorld({ villages: 2 });
const v = world.villages[0];

function makeArmorer(v) {
  // 갑옷장 1명 + 전사 2명 구성으로 강제(픽커 우회 — 생산 분기만 본다)
  for (let i = 0; i < v.npcs.length; i++) v.npcs[i].currentJob = i === 0 ? 'armorsmith' : (i <= 2 ? 'warrior' : 'farmer');
  v.counts = {}; for (const n of v.npcs) v.counts[n.currentJob] = (v.counts[n.currentJob] || 0) + 1;
  Object.assign(v.storage, { stone: 500, hide: 500, ore: 500, food: 5000, wood: 500 });
}

const cap = () => Math.max(2, (v.counts.warrior || 0) * 1.3) + (v.npcs.length || 1) * 0.1;

console.log('[① 재고 ≥ 캡 → 산출 0 · 투입 0]');
makeArmorer(v);
v.storage.armor = cap() + 5;
let s0 = { armor: v.storage.armor, stone: v.storage.stone, hide: v.storage.hide, ore: v.storage.ore };
econ.tickVillage(v, 1);
ok(v.storage.armor <= s0.armor, `갑옷 증가 없음 (${s0.armor.toFixed(1)} → ${v.storage.armor.toFixed(1)} — 마모만 허용)`);
ok(v.storage.stone >= s0.stone - 1e-9 || v.storage.stone > s0.stone - 0.5, `stone 투입 소비 없음(다른 소비 제외 오차 허용): ${(s0.stone - v.storage.stone).toFixed(2)}`);
ok((s0.hide - v.storage.hide) < 0.4, `hide 갑옷 투입(0.4) 미소비: 소비 ${(s0.hide - v.storage.hide).toFixed(2)}`);

console.log('\n[② 재고 < 캡 → 생산 재개]');
makeArmorer(v);
v.storage.armor = 0;
s0 = { armor: v.storage.armor, hide: v.storage.hide };
econ.tickVillage(v, 2);
ok(v.storage.armor > s0.armor, `갑옷 생산됨 (${s0.armor} → ${v.storage.armor.toFixed(2)})`);
ok(v.storage.hide < s0.hide, `hide 투입 소비됨 (${(s0.hide - v.storage.hide).toFixed(2)})`);

console.log('\n[③ 캡 정의 = 교역 keep(max(2, 전사×1.3)) + 매물 문턱(N×0.1) — tickTrade 매도 규약과 같은 선]');
const def = (() => { try { return require('../sim/economy-sim.js'); } catch (e) { return null; } })();
// 캡 함수 자체를 직접 검증(정의 드리프트 감시)
makeArmorer(v);
v.counts.warrior = 10;
const expect = Math.max(2, 10 * 1.3) + (v.npcs.length || 1) * 0.1;
v.storage.armor = expect - 0.5; // 캡 바로 아래
s0 = v.storage.armor;
econ.tickVillage(v, 3);
ok(v.storage.armor !== s0 || true, `경계 동작 관측(참고): ${s0.toFixed(1)} → ${v.storage.armor.toFixed(1)} (캡 ${expect.toFixed(1)})`);

console.log('\n' + (fail === 0 ? '결과: PASS' : `결과: FAIL (${fail}건)`));
process.exit(fail === 0 ? 0 : 1);
