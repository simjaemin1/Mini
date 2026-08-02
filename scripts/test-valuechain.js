#!/usr/bin/env node
// === scripts/test-valuechain.js — 가치 사슬 항등식 하네스 ===
//
// ★[재민] "돌덩이를 팔지, 광물을 팔지, 금속을 팔지, 무기/도구를 팔지도 정말 잘 계산할 수
//          있는 거 맞지? 이 모든 걸 경제학적 원리에 입각해 한 치의 오차도 없이 엄밀하게."
//
// econ 의 기준가는 **노동가치 앵커**로 매겨져 있다. BASE_VALUE 주석이 그 근거를 적어뒀다:
//     food 1.0 "농부 1.5/day"  ·  stone 2.14 "광부 0.7/day"  ·  ore 3.0 "광물 0.5/day"
//   즉  P(r) = P(food) × (농부 하루 산출 ÷ r 하루 산출)  — 1단위에 드는 노동일의 비.
//
// 문제는 그 뒤로 **산출량이 바뀌었는데 가격을 안 고쳤다**는 것이다. 지금 광부는 원석을
// 0.5/day 가 아니라 1.5/day 캔다(land.ore 1.0 기준). 돌은 채집꾼이 0.9/day 캔다.
// 그래서 사슬이 뒤집혔다 — 실측: 원석을 그대로 팔면 3.0, 제련하면 1.32, 무기로 만들면 0.94.
// **가공할수록 가치가 준다.** 그러면 제련도 주조도 가치를 태우는 짓이 된다.
//
// 이 하네스가 못박는 것:
//   ① 노동가치 정합 — 기준가가 실제 산출량과 맞는가 (P = 1.5 × 노동일/개)
//   ② 부가가치 양(+) — 어떤 공정도 가치를 파괴하면 안 된다
//   ③ 사슬 단조 — 원석 → 금속 → 무기 로 갈수록 가치가 올라야 한다
//   ④ 노동 무차별 — 대안이 있는 공정끼리 하루 벌이가 비슷해야 한다
//      (석기 무기는 **열등 기술**이라 제외한다 — 금속이 없는 마을의 유일한 선택이라
//       대안 간 재배분의 대상이 아니다. 다만 부가가치 > 0 은 요구한다.)
//
// 실행: node scripts/test-valuechain.js
'use strict';
const path = require('path');
const R = (p) => require(path.join(__dirname, '..', p));
const econ = R('sim/economy-sim');
const SP = R('server/specialty');

let fail = 0;
const ok = (c, m) => { console.log((c ? '  ✔ ' : '  ✗ ') + m); if (!c) fail++; };
const P = (r) => {
  if (econ.BASE_VALUE[r] > 0) return econ.BASE_VALUE[r];
  const b = SP.RESOURCES[r] && SP.RESOURCES[r].baseValue;
  return b > 0 ? b : 1;
};

// ── econ 상수를 코드에서 직접 읽는다(복제하면 하네스가 거짓말을 한다) ──────
const MINER_BASE = econ.JOBS.miner.base;
const SMITH_BASE = econ.JOBS.smith.base;
const MASON_BASE = econ.JOBS.mason.base;
const FARMER_BASE = econ.JOBS.farmer.base;
const WEAPON_LABOR_MULT = 1 / 3;
const SMELT_PER_LABOR = econ._SMELT_PER_LABOR, SMELT_YIELD = econ._SMELT_YIELD;
const MELT_TOTAL = econ._MELT_TOTAL;
const STONE_PER_WEAPON = 0.5, STONE_PER_TOOL = 0.2;
const FORAGE_STONE = 0.9;   // 채집꾼 돌 산출 계수(land.stone 1.0 기준)
const METAL = 'copper';

console.log('가격: ' + ['food', 'ore', 'stone', 'copper', 'weapon', 'tool'].map((r) => r + ' ' + P(r)).join(' · '));
console.log('상수: 제련 ' + SMELT_PER_LABOR + '×' + SMELT_YIELD + ' · 주조 투입 ' + MELT_TOTAL
  + ' · 무기노동배수 ' + WEAPON_LABOR_MULT.toFixed(3));

// ── ① 노동가치 정합 ───────────────────────────────────────────────────────
// 기준: 농부 하루 산출 FARMER_BASE = 식량 P(food) 어치.
const DAY = FARMER_BASE * P('food');          // 노동 하루의 가치(= 식량 환산)
console.log('\n① 노동가치 정합 — 기준가가 실제 산출량과 맞는가 (노동 하루 = ' + DAY.toFixed(2) + ')');
const anchors = [];
// 원석: 광부 하루 MINER_BASE 개
anchors.push({ r: 'ore', perDay: MINER_BASE, extra: 0 });
// 돌: 채집꾼 하루 FORAGE_STONE 개
anchors.push({ r: 'stone', perDay: FORAGE_STONE, extra: 0 });
// 도구: 석공 하루 MASON_BASE 개 + 돌 원료
anchors.push({ r: 'tool', perDay: MASON_BASE, extra: STONE_PER_TOOL * P('stone') / MASON_BASE });
// 금속: 채광 노동 + 제련 노동
{
  const oreNeed = 1 / SMELT_YIELD;                        // 금속 1개에 필요한 원석
  const days = oreNeed / MINER_BASE + oreNeed / (SMITH_BASE * SMELT_PER_LABOR);
  anchors.push({ r: METAL, perDayEquivDays: days });
}
// 무기(청동): 금속 원료 + 주조 노동
{
  const perDay = SMITH_BASE * WEAPON_LABOR_MULT;
  const metalPer = MELT_TOTAL / perDay;
  const oreNeed = metalPer / SMELT_YIELD;
  const days = 1 / perDay + oreNeed / MINER_BASE + oreNeed / (SMITH_BASE * SMELT_PER_LABOR);
  anchors.push({ r: 'weapon', perDayEquivDays: days });
}
console.log('  자원      기준가   노동가치 정합가   비');
for (const a of anchors) {
  const days = a.perDayEquivDays != null ? a.perDayEquivDays : (1 / a.perDay);
  const fair = DAY * days + (a.extra || 0);
  const ratio = P(a.r) / fair;
  console.log('  ' + a.r.padEnd(9) + P(a.r).toFixed(2).padStart(7) + fair.toFixed(2).padStart(15)
    + ('×' + ratio.toFixed(2)).padStart(9) + (Math.abs(Math.log(ratio)) > Math.log(1.5) ? '   ← 어긋남' : ''));
  ok(Math.abs(Math.log(ratio)) <= Math.log(1.5), '  ' + a.r + ' 기준가가 노동가치의 ±50% 안');
}

// ── ② 부가가치 ────────────────────────────────────────────────────────────
const rows = [];
rows.push({ k: 'mine', name: '채광 (노동 → 원석)', out: MINER_BASE * P('ore'), inp: 0, alt: true });
{
  const use = SMITH_BASE * SMELT_PER_LABOR, met = use * SMELT_YIELD;
  rows.push({ k: 'smelt', name: '제련 (원석 → 금속)', out: met * P(METAL), inp: use * P('ore'), alt: true });
}
{
  const amt = SMITH_BASE * WEAPON_LABOR_MULT;
  rows.push({ k: 'cast', name: '주조 (금속 → 청동검)', out: amt * P('weapon'), inp: MELT_TOTAL * P(METAL), alt: true });
}
{
  const amt = MASON_BASE * WEAPON_LABOR_MULT;
  rows.push({ k: 'stoneweap', name: '석기 (돌 → 마제석검)', out: amt * P('weapon'), inp: STONE_PER_WEAPON * P('stone'), alt: false });
}
rows.push({ k: 'stonetool', name: '석기 (돌 → 도구)', out: MASON_BASE * P('tool'), inp: STONE_PER_TOOL * P('stone'), alt: true });
rows.push({ k: 'forage', name: '채집 (노동 → 돌)', out: FORAGE_STONE * P('stone'), inp: 0, alt: true });

console.log('\n② 부가가치 — 가치를 파괴하는 공정이 있는가');
console.log('  공정                        산출     투입    하루벌이');
for (const r of rows) {
  const va = r.out - r.inp;
  console.log('  ' + r.name.padEnd(26) + r.out.toFixed(2).padStart(7) + r.inp.toFixed(2).padStart(9)
    + va.toFixed(2).padStart(11) + (r.alt ? '' : '   (열등기술)'));
}
for (const r of rows) ok(r.out - r.inp > 0, r.name + ' 부가가치 > 0');

// ── ③ 사슬 단조 ───────────────────────────────────────────────────────────
console.log('\n③ 사슬 단조 — 원석 1단위를 …');
const oreV = P('ore');
const metV = SMELT_YIELD * P(METAL);
const wPerOre = (SMELT_YIELD / MELT_TOTAL) * (SMITH_BASE * WEAPON_LABOR_MULT);
const weaV = wPerOre * P('weapon');
console.log('    그대로 판다        ' + oreV.toFixed(3));
console.log('    제련해서 판다      ' + metV.toFixed(3) + '   (금속 ' + SMELT_YIELD.toFixed(2) + ')');
console.log('    무기로 만들어 판다  ' + weaV.toFixed(3) + '   (무기 ' + wPerOre.toFixed(4) + ')');
ok(metV > oreV, '  제련하면 가치가 오른다');
ok(weaV > metV, '  무기로 만들면 더 오른다');

// ── ④ 노동 무차별 (대안 공정끼리만) ───────────────────────────────────────
console.log('\n④ 노동 무차별 — 대안이 있는 공정끼리 하루 벌이가 비슷한가');
const alt = rows.filter((r) => r.alt).map((r) => ({ n: r.name, v: r.out - r.inp }));
alt.sort((a, b) => b.v - a.v);
for (const a of alt) console.log('    ' + a.n.padEnd(26) + a.v.toFixed(3));
const mx = alt[0].v, mn = alt[alt.length - 1].v;
console.log('  최대/최소 = ' + (mn > 0 ? (mx / mn).toFixed(2) + '배' : '(음수)'));
// ⚠이건 **참고 지표**다. 완전한 무차별은 가격이 노동을 배분하는 경제에서만 성립하는데,
//   econ 의 장인(석공·대장장이)은 가격이 아니라 스톡-플로우 노동목표로 정원이 정해진다.
//   그래서 여기서 격차가 크다는 건 "가격이 틀렸다"가 아니라 "가격이 노동을 안 잡는다"는 뜻이다.
//   FAIL 은 **부호가 뒤집힐 때**만 낸다 — 그건 진짜 오류다.
ok(mn > 0, '  모든 대안 공정의 하루 벌이가 양수 (음수면 그 일을 할 이유가 없다)');

// ── ⑤ 효용 사슬 — stat 기여도 가공할수록 커야 한다 ────────────────────────
console.log('\n⑤ 효용 사슬 — 제련하면 마을 stat 이 오르는가');
{
  const C = econ._LEGACY_CONTRIBUTES || {};
  const oreC = (C.ore && C.ore.production) || 0;
  const cuC = (SP.RESOURCES[METAL] && SP.RESOURCES[METAL].contributes && SP.RESOURCES[METAL].contributes.production) || 0;
  const perMetal = 1 / SMELT_YIELD;                     // 금속 1개에 드는 원석
  console.log('    원석 ' + perMetal.toFixed(2) + '개 기여 ' + (perMetal * oreC).toFixed(3)
    + '  →  금속 1개 기여 ' + cuC.toFixed(3));
  ok(cuC > perMetal * oreC, '  제련하면 stat 기여가 는다 (아니면 녹일수록 마을이 가난해진다)');
}

// ── ⑥ 배합↔교역 한 단위 통합 — 순수출가 산술을 **못박는다** ───────────────
//   ★★[2026-08-02c 재민 "비교가 필요해. 단, 정확해야 해"]
//   `설계_배합과교역_한단위_통합.md` (가)안. 주조 결정과 교역 결정이 한 재화에 **같은 값**을 매기는지가
//   이 통합의 전부다. 그래서 여기서 검사하는 건 결과 숫자가 아니라 **산술의 동일성**이다 —
//   `netExportValue` 가 `tickTradeV2` 발주 EV 의 순수취 항과 한 항이라도 다르면 두 결정이 다시 갈라진다.
console.log('\n⑥ 배합↔교역 한 단위 통합 — 순수출가 산술 고정');
{
  const v2 = R('sim/economy-sim-v2');
  const src = require('fs').readFileSync(path.join(__dirname, '..', 'sim/economy-sim-v2.js'), 'utf8');

  // (a) 상수 일치 — 두 곳의 forward margin 리터럴이 같은 값인가(한 곳만 고치면 두 결정이 갈라진다)
  const mLocal = src.match(/const FORWARD_PRICE_MARGIN\s*=\s*([\d.]+)/);
  ok(!!mLocal, '  tickTradeV2 의 FORWARD_PRICE_MARGIN 리터럴을 찾았다');
  ok(mLocal && Number(mLocal[1]) === v2.FORWARD_PRICE_MARGIN_NEV,
    `  forward margin 일치 (교역 ${mLocal ? mLocal[1] : '?'} = 순수출가 ${v2.FORWARD_PRICE_MARGIN_NEV})`);

  // (b) 항 일치 — 순수취 = pTo×MARGIN×(1−TAU)×(1−손실) − 운반비. 각 항이 실제로 쓰이는지 소스에서 확인.
  const nevSrc = src.slice(src.indexOf('function netExportValue'), src.indexOf('function createWorldV2'));
  ok(/FORWARD_PRICE_MARGIN_NEV/.test(nevSrc), '  순수취에 forward margin 항이 있다');
  ok(/\(1 - TAU\)/.test(nevSrc), '  순수취에 (1−TAU) 항이 있다');
  ok(/\(1 - expectedLossRatio\)/.test(nevSrc), '  순수취에 (1−기대손실) 항이 있다');
  ok(/TRANSPORT_COST_PER_1000 \* dist \/ 1000/.test(nevSrc), '  순수취에 운반비 항이 있다(교역식과 같은 식)');
  ok(!/pFrom/.test(nevSrc), '  순수취에 −pFrom 항이 **없다**(그게 기회비용 자체라 빼면 이중계상)');
  ok(/RAID_BASE[\s\S]{0,120}raidPer100/.test(nevSrc) && /expectedLossRatio = raidProb \* 0\.5/.test(nevSrc),
    '  기대손실이 교역식과 같은 위험모형(RAID_BASE + 도적훅 + 거리, ×0.5)');
  ok(/banditGang/.test(nevSrc) && /_repelP/.test(nevSrc), '  갱·호위 보정도 교역식과 동형');

  // (c) 수치 재현 — 손으로 푼 값과 엔진 값이 **정확히** 같은가(2마을 인공 세계)
  //   ⚠순수취가 **양수**인 상황을 만들어야 진짜 검사다(음수면 max(0,·) 로 뭉개져 0=0 자명 통과가 된다).
  //     → 거리를 붙이고(운반비↓), 도착 마을은 그 재화가 **품귀**(그림자가격↑)가 되게 만든다.
  const w = v2.createWorldV2({ villages: 2, seed: 7 });
  const [A, B] = w.villages;
  B.coord.x = A.coord.x + 60; B.coord.y = A.coord.y;     // 60 단위 이웃 — 운반비 0.12/단위
  A.storage.food = 900; B.storage.food = 0.5;            // A 풍년 · B 기근 → B 의 식량 그림자가격 폭등
  for (const v of [A, B]) { v._near20 = w.villages.filter(x => x !== v); }
  const dist = econ.villageDist(A, B);
  const pToB = v2.computeShadowPrices(B).food * v2.FORWARD_PRICE_MARGIN_NEV;
  const raidProb = Math.min(0.5, 0.03 + (dist / 100) * (w.raidPer100 != null ? w.raidPer100 : 0.04));
  const expect = pToB * (1 - v2.TAU) * (1 - raidProb * 0.5) - (2.0 * dist / 1000);
  const got = v2.netExportValue(w, A, 'food');
  console.log(`    거리 ${dist.toFixed(1)} · B 식량가 ${(pToB / v2.FORWARD_PRICE_MARGIN_NEV).toFixed(3)} → 순수취 손계산 ${expect.toFixed(6)} · 엔진 ${got.toFixed(6)}`);
  ok(expect > 0.05, '  검사 상황이 유효하다(순수취가 양수 — 0=0 자명통과가 아님)');
  ok(Math.abs(got - Math.max(0, expect)) < 1e-9, '  순수출가가 손계산과 정확히 일치(오차 < 1e-9)');
  // (c2) 거리 의존 — 멀어지면 운반비만큼 정확히 준다(운반비 항이 진짜 살아 있는가)
  {
    B.coord.x = A.coord.x + 160; w._nevCache = null;
    const d2 = econ.villageDist(A, B);
    const r2 = Math.min(0.5, 0.03 + (d2 / 100) * (w.raidPer100 != null ? w.raidPer100 : 0.04));
    const e2 = pToB * (1 - v2.TAU) * (1 - r2 * 0.5) - (2.0 * d2 / 1000);
    const g2 = v2.netExportValue(w, A, 'food');
    ok(Math.abs(g2 - Math.max(0, e2)) < 1e-9 && g2 < got, '  거리가 늘면 순수출가가 정확히 그만큼 준다(운반비·위험 항 생존)');
    B.coord.x = A.coord.x + 60; w._nevCache = null; v2.netExportValue(w, A, 'food');   // 원상복구(아래 캐시 검사용)
  }

  // (d) 하루 1회 캐시가 **값을 바꾸지 않는가** (같은 날 두 번 불러도 같은 값)
  ok(v2.netExportValue(w, A, 'food') === got, '  같은 날 재호출이 같은 값(캐시가 값을 바꾸지 않는다)');

  // (e) opp = max(내 가격, 순수출가) — 두 결정이 같은 값을 본다. 여기서는 **수출가가 이겨야** 한다
  //     (A 는 풍년이라 현지가가 바닥이고 이웃은 기근 — "팔면 훨씬 낫다"가 주조식에 실제로 보여야 통합이 된 것이다).
  const pLocalA = v2.computeShadowPrices(A).food;
  console.log(`    A 현지 식량가 ${pLocalA.toFixed(3)} vs 순수출가 ${got.toFixed(3)} → opp ${Math.max(pLocalA, got).toFixed(3)}`);
  ok(Math.max(pLocalA, got) === got && got > pLocalA,
    '  풍년 마을의 opp(식량) = 순수출가 (현지 헐값이 아니라 이웃이 쳐 주는 값을 본다)');
}

// ── ⑦ 말 사역 — 시대 전 **비트 동일**, 시대 후 운반비만 정확히 내려간다 (2026-08-02e ⑥) ──
//   재민 회부 ⑦의 답을 여기서 못박는다. 소비처를 새로 만들지 않고 **교역 EV 의 운반비 항**에 얹었으므로,
//   검사도 그 항 하나면 된다: 닫힌 시대엔 곱셈 항등원(1), 열린 시대엔 정확히 HORSE_HAUL_MUL.
console.log('\n⑦ 말 사역 — 열기 전 비트 동일 · 연 뒤 운반비만 내려간다');
{
  const v2b = R('sim/economy-sim-v2');
  const EraB = R('server/era');
  EraB.setEra('bronze');
  const mulClosed = v2b.haulMul();
  ok(mulClosed === 1, `닫힌 시대 배수 = ${mulClosed} — **곱셈 항등원**(IEEE x*1===x 라 궤적이 1비트도 안 갈린다)`);
  EraB.setEra('early_iron');
  const mulOpen = v2b.haulMul();
  ok(mulOpen === v2b.HORSE_HAUL_MUL && mulOpen < 1, `열린 시대 배수 = ${mulOpen} (등짐 → 바리·수레)`);

  // 같은 세계·같은 거리에서 순수출가가 **운반비 차이만큼** 오르는가(다른 항은 안 건드렸는지)
  const w2 = v2b.createWorldV2({ villages: 2, seed: 7 });
  const [A2, B2] = w2.villages;
  B2.coord.x = A2.coord.x + 120; B2.coord.y = A2.coord.y;
  A2.storage.food = 900; B2.storage.food = 0.5;
  for (const v of [A2, B2]) v._near20 = w2.villages.filter((x) => x !== v);
  const dist2 = econ.villageDist(A2, B2);
  EraB.setEra('bronze');     w2._nevCache = null; const netClosed = v2b.netExportValue(w2, A2, 'food');
  EraB.setEra('early_iron'); w2._nevCache = null; const netOpen = v2b.netExportValue(w2, A2, 'food');
  EraB.setEra(null);
  const expectGain = (v2b.TRANSPORT_COST_PER_1000 * dist2 / 1000) * (1 - v2b.HORSE_HAUL_MUL);
  console.log(`    거리 ${dist2.toFixed(1)} · 순수출가 ${netClosed.toFixed(4)} → ${netOpen.toFixed(4)} (기대 상승 ${expectGain.toFixed(4)})`);
  ok(Math.abs((netOpen - netClosed) - expectGain) < 1e-9,
    '  상승분이 **운반비 절감분과 정확히 같다**(다른 항은 안 건드렸다 — 오차 <1e-9)');
  ok(netOpen > netClosed, '  말이 있으면 더 먼 곳까지 팔 값이 선다(교역 반경 확장)');
}

console.log('\n결과: ' + (fail ? 'FAIL — ' + fail + '건' : 'PASS'));
process.exit(fail ? 1 : 0);
