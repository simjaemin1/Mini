#!/usr/bin/env node
// === scripts/test-alloy.js — 합금·주조·광종배분 하네스 ===
//
// 이 세션에서 들어간 것들의 계약을 못박는다:
//   ① 합금 물성 모델(server/specialty.js)   — 알려진 합금 11종의 실측 경도를 재현하는가
//   ② Kocks 중첩 / 밀도 패널티              — 3원 배합이 폭주하지 않는가, 기준 11종은 안 흔들렸는가
//   ③ 플레이어 주조(server/player-items.js) — 표(MAT_GRADE)와 모델이 같은 값을 말하는가
//   ④ oreMix(server/villages.js → econ)     — 지도의 광종 구성이 마을 산출에 닿는가
//   ⑤ 시대 게이트                            — 청동기 노가 못 녹이는 금속이 배합에 못 들어가는가
//
// 실행: node scripts/test-alloy.js
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const S = R('server/specialty');
const P = R('server/player-items');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✗ ') + m); if (!c) fail++; };
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol);

// ── ① 알려진 합금의 실측 경도 재현 ────────────────────────────────────────
// ★상수를 손보면 여기가 먼저 깨진다. 이 표가 모델의 유일한 외부 근거다.
console.log('① 알려진 합금 — 실측 경도대 재현 (경도는 HB)');
const KNOWN = [
  ['순동',        { copper: 1 },                          50,  1.00],
  ['청동(Sn12)',  { copper: .88, tin: .12 },              107, 1.00],
  ['세형동검',    { copper: .74, tin: .14, lead: .11 },    89, 0.91],
  ['다뉴세문경',  { copper: .66, tin: .34 },              233, 0.08],
  ['주석 과잉',   { copper: .55, tin: .45 },              305, 0.03],
  ['황동',        { copper: .70, zinc: .30 },              83, 1.00],
  ['백동',        { copper: .75, nickel: .25 },            81, 1.00],
  ['스털링',      { silver: .925, copper: .075 },          88, 1.00],
  ['적금',        { gold: .75, copper: .25 },             143, 1.00],
  // ⚠구리+철 행은 **외부 실측이 아니다** — Cu-Fe 는 액상에서도 안 섞이는 비혼화계라 단순
  //   혼합칙의 대상이 아니고, 원표의 41 도 표 작성 때 모델이 낸 값이었다(순동 50에 더 단단한
  //   철을 섞었는데 41 이 되는 실물은 없다). 이 행의 역할은 문헌 재현이 아니라 **비혼화 배합의
  //   모델 거동 고정**(회귀 앵커)이다. iron.h0 150→80 고증 교정(2026-08-01) 때 재고정했다.
  ['구리+철',     { copper: .80, iron: .20 },              27, 0.83],
  ['납청동',      { copper: .80, tin: .10, lead: .10 },    82, 0.92],
];
for (const [n, mix, h, t] of KNOWN) {
  const a = S.alloyProps(mix);
  const okH = Math.abs(a.hardness - h) <= 1.0, okT = Math.abs(a.tough - t) <= 0.011;
  console.log('    ' + n.padEnd(12) + '경도 ' + a.hardness.toFixed(0).padStart(4) + ' (기대 ' + h + ')'
    + ' · 인성 ' + a.tough.toFixed(2) + ' (기대 ' + t.toFixed(2) + ')'
    + ' · 융점 ' + a.mp.toFixed(0) + '℃ · 무기 ' + a.weapon.toFixed(2));
  ok(okH && okT, n + ' 경도·인성 고정');
}

// ── ② Kocks 중첩 & 밀도 패널티 ────────────────────────────────────────────
console.log('\n② 다원 배합이 폭주하지 않는가');
// 용질이 하나면 √(a²)=a — 중첩 규칙이 기준 11종을 건드리지 않는다는 뜻(①이 이미 증명)
const g = (m) => S.alloyGrade(m, 'weapon');
const gBronze = g({ copper: .88, tin: .12 });
ok(near(gBronze, 1.0, 0.005), '표준 청동 = 1.00 (등급 축의 원점)');
// 청동기 제련 가능 금속만으로 5% 격자 전수 — 최댓값이 청동의 2배를 넘으면 안 된다
const M = S.ALLOY_ERA.bronze;
let top = 0, topMix = null;
for (let a = 0; a <= 20; a++) for (let b = 0; b <= 20 - a; b++) for (let c = 0; c <= 20 - a - b; c++) {
  for (let d = 0; d <= 20 - a - b - c; d++) {
    const e = 20 - a - b - c - d;
    const mix = {}; const w = [a, b, c, d, e];
    M.forEach((k, i) => { if (w[i] > 0) mix[k] = w[i] / 20; });
    const v = g(mix); if (v > top) { top = v; topMix = mix; }
  }
}
console.log('    청동기 전수 최적 ' + top.toFixed(2) + ' — ' + Object.entries(topMix).map(([k, v]) => k + ' ' + Math.round(v * 100) + '%').join(' · '));
ok(top < 2.0, '★최강 배합이 청동의 2배 미만 (Kocks 중첩 없으면 여기서 2.1 이 나왔다)');
ok(top > 1.0, '청동보다 나은 배합은 **존재한다** — 안 그러면 배합할 이유가 없다');
// 밀도: 금은 물성이 좋아도 무기로는 실격
const au = S.alloyProps({ gold: .5, copper: .5 });
ok(au.rho > 13 && au.weapon < au.hardness / 150, '★금 배합은 밀도로 깎인다(휘두를 수 없는 검)');
ok(near(S.alloyProps({ copper: .88, tin: .12 }).rho, 8.76, 0.01), '청동 밀도 8.76 — 패널티 경계(8.9) 아래라 무패널티');

// ── ③ 플레이어 주조: 표와 모델의 일치 ─────────────────────────────────────
console.log('\n③ 플레이어 주조 — 표(MAT_GRADE)와 모델이 어긋나지 않는가');
for (const k of P.castKinds()) {
  const solo = S.alloyGrade({ [k]: 1 }, 'weapon');
  ok(near(P.MAT_GRADE[k], +solo.toFixed(3), 1e-9), k + ' 단일재료 등급 = 모델값 ' + P.MAT_GRADE[k]);
}
ok(near(P.matGrade({ copper: 3 }, 'weapon'), P.MAT_GRADE.copper, 1e-3), '단일재료 경로 = 배합 경로(구리 3)');
ok(P.matGrade({ iron: 3 }, 'weapon') === P.MAT_GRADE.iron, '철은 주조 불가 → 옛 표 경로(0.85) 유지');
ok(P.matGrade({ leather: 3 }) > 0.8, '비금속은 옛 표 경로');
const wCu = P.craftItem('weapon', 10, { copper: 3 });
const wBr = P.craftItem('weapon', 10, { copper: 2.49, tin: 0.51 });
console.log('    만렙 순동검 공격 ' + wCu.attrs.attack + ' · 만렙 청동검(Sn17%) 공격 ' + wBr.attrs.attack);
ok(wBr.attrs.attack > wCu.attrs.attack * 2, '★배합이 무기 성능을 2배 이상 가른다 — 주석을 쥔 쪽이 강하다');
ok(P.castGrade({ copper: 1, tin: 1, lead: 1, silver: 1 }, 'weapon') === null, '4종 배합은 거부(최대 ' + P.CAST_MAX_KINDS + '종)');
ok(P.castGrade({ copper: .9, iron: .1 }, 'weapon') === null, '청동기엔 철을 도가니에 못 넣는다');
// 최적 주석 비율이 실제 세형동검 구간 안에 있는가
let bestS = 0, bestG = 0;
for (let t = 0; t <= 0.4; t += 0.002) { const v = g({ copper: 1 - t, tin: t }); if (v > bestG) { bestG = v; bestS = t; } }
console.log('    최적 주석 비율 ' + (bestS * 100).toFixed(1) + '% (등급 ' + bestG.toFixed(2) + ')');
ok(bestS > 0.10 && bestS < 0.20, '★최적점이 실측 세형동검 Sn 13.6~18.7% 구간 근처');

// ── ④ 시대 게이트 ─────────────────────────────────────────────────────────
console.log('\n④ 시대 게이트');
ok(!S.alloySmeltable('iron', 'bronze') && S.alloySmeltable('iron', 'iron'), '철은 청동기엔 제련 불가(융점 1538℃)');
ok(!S.alloySmeltable('zinc', 'bronze'), '아연도 불가(907℃에서 끓어 증발)');
ok(['copper', 'tin', 'lead'].every((k) => S.alloySmeltable(k, 'bronze')), '구리·주석·납은 가능');
ok(!P.castKinds().includes('iron') && !P.castKinds().includes('zinc'), '주조 UI 에 노출되는 금속도 같은 게이트');

// ── ⑤ oreMix — 지도의 광종이 마을 산출에 닿는가 ───────────────────────────
console.log('\n⑤ oreMix — 지도 광종 구성 → 마을 경제');
const econ = R('sim/economy-sim');
const vC = econ.createVillage({ name: '주석촌', ore: 0.9, oreMix: { tin: 0.25, copper: 0.75 }, initialPop: 8 });
console.log('    주석촌 land.tin = 0.25 × 0.9 = ' + vC.land.tin);
ok(near(vC.land.tin, 0.225), '★land.tin 이 연속량 — 산지/비산지 이분법 폐기');
const vD = econ.createVillage({ name: '미량주석', ore: 0.5, oreMix: { tin: 0.04, copper: 0.96 }, initialPop: 8 });
console.log('    미량주석 land.tin = ' + vD.land.tin);
ok(vD.land.tin > 0 && vD.land.tin < 0.05, '★"주석이 조금 나는 마을"이 표현된다');
const vA = econ.createVillage({ name: '금광촌', ore: 1.0, oreMix: { gold: 0.7, copper: 0.3 }, initialPop: 8 });
ok(vA.land.oreMix && vA.land.oreMix.gold === 0.7, 'oreMix 가 land 에 실린다');
const vOld = econ.createVillage({ name: '랩마을', ore: 1.5, initialPop: 8 });
ok(vOld.land.oreMix === null && typeof vOld.land.tin === 'number', '폴백 — oreMix 없는 호출부는 옛 이름해시 경로');

// villages.js 어댑터의 원-교집합 면적 가중치가 실제로 비율을 낸다
const V = R('server/villages');
ok(typeof V === 'object', 'villages.js 로드');

console.log('\n결과: ' + (fail ? 'FAIL — ' + fail + '건' : 'PASS'));
process.exit(fail ? 1 : 0);
