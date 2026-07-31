#!/usr/bin/env node
// === scripts/proto-alloy.js — 임의 금속 합금의 물성 모델 시안 ===
//
// ★[재민] "주석·구리·납뿐만 아니라 금·철·은 등 **모든 광물**을 가능하게 하자는 거였어..
//          이래도 잘 작동하게 할 수 있어..?(이래서 3변수 함수라 했던 것)"
//
// 핵심: **조합마다 곡선을 손으로 짜지 않는다.** 원소당 상수 8개만 주면
//       임의 조합의 물성이 **금속학 규칙에서 계산된다**. N개 금속이면 C(N,3) 이 아니라 8N 개다.
//
// 쓰는 물리 —
//   ① Hume-Rothery 고용 규칙 : 원자반지름 차 <15% · 결정구조 동일 · 전기음성도 근접 · 원자가 동일
//                              → 잘 녹아든다(고용). 하나라도 어기면 고용도가 급감한다.
//   ② 고용 강화(Fleischer)   : 녹아든 만큼 격자가 뒤틀려 전위 이동을 막는다.
//                              ΔH ∝ δ^(4/3) · √x  — **이것이 "합금이 순금속보다 단단한" 이유**
//   ③ 제2상                  : 고용 한도를 넘으면 남는다.
//                              원자가 차가 크면 **금속간화합물**(취성) — Cu31Sn8 같은 것
//                              반지름 차가 너무 크면 **액상 분리**(안 섞임) — Cu-Pb, Cu-Fe
//   ④ 공융 강하              : 섞으면 융점이 내려간다(혼합 엔트로피). 주조성의 근거.
//
// 실행: node scripts/proto-alloy.js
'use strict';

// ── 원소 상수 (실측값) ────────────────────────────────────────────────────
//   r 금속 원자반지름(pm) · st 결정구조 · en 전기음성도(폴링) · val 주된 원자가
//   mp 융점(℃) · h0 순금속 경도(HB) · rho 밀도 · lus 광택/백색도(0~1)
// ★2026-07: 이 시안이 통과해서 server/specialty.js 에 들어갔다.
//   이제 이 스크립트는 **시안이 아니라 검증 하네스**다 — 모델을 여기 복제하지 않고
//   출하본(specialty.alloyProps)을 그대로 불러 검증한다. 복제본이 있으면
//   출하본을 고쳐도 검증이 통과해버린다(실제로 밀도 패널티를 넣었을 때 그럴 뻔했다).
const SP = require('../server/specialty');
const KO = { copper: '구리', tin: '주석', lead: '납', zinc: '아연', silver: '은', gold: '금', iron: '철', nickel: '니켈' };
const E = {}; for (const k in SP.ALLOY_E) E[k] = Object.assign({ ko: KO[k] || k }, SP.ALLOY_E[k]);
function alloy(mix) {
  const a = SP.alloyProps(mix);
  // 소견은 출하본이 낸 제2상 분율에서 되짚는다(문구는 이 하네스 소유)
  const notes = [];
  const ks = Object.keys(mix).filter((k) => mix[k] > 1e-6 && E[k]);
  const tot = ks.reduce((t, k) => t + mix[k], 0);
  for (const k of ks) {
    if (k === a.base) continue;
    const t = (SP.ALLOY_SOL[a.base] && SP.ALLOY_SOL[a.base][k]) || null;
    if (!t) continue;
    const sec = mix[k] / tot - Math.min(mix[k] / tot, t[0]);
    if (sec <= 0.01) continue;
    if (t[1] === 'split') notes.push(E[k].ko + ' 불용 — 층이 갈린다');
    else if (t[1] === 'im') notes.push(E[k].ko + ' 과잉 → 금속간화합물(단단·취성)');
  }
  return Object.assign({}, a, { notes });
}

const show = (name, mix, expect) => {
  const a = alloy(mix);
  const comp = Object.entries(mix).map(([k, v]) => E[k].ko + ' ' + (v * 100).toFixed(0) + '%').join(' · ');
  console.log('  ' + name.padEnd(12) + comp.padEnd(30)
    + '경도 ' + a.hardness.toFixed(0).padStart(4) + ' · 인성 ' + a.tough.toFixed(2)
    + ' · 융점 ' + a.mp.toFixed(0).padStart(4) + '℃ · 주조 ' + a.cast.toFixed(2)
    + ' · 무기 ' + a.weapon.toFixed(2) + ' · 거울 ' + a.mirror.toFixed(2));
  if (a.notes.length) console.log(' '.repeat(16) + '↳ ' + a.notes.join(' · '));
  if (expect) console.log(' '.repeat(16) + '↳ 실제: ' + expect);
};

console.log('=== 알려진 합금을 이 모델로 계산 (원소 상수만 주고, 조합 곡선은 안 짰다) ===');
show('순동',       { copper: 1 },                             '경도 ~50 HB, 무름');
show('청동(주력)', { copper: 0.88, tin: 0.12 },                '표준 청동 Cu 87 + Sn 8~12.5%');
show('세형동검',   { copper: 0.74, tin: 0.144, lead: 0.106 },  '실측 Cu 74.0 Sn 14.4 Pb 10.6');
show('다뉴세문경', { copper: 0.657, tin: 0.343 },              '실측 Cu 65.7 Sn 34.3 — 단단·취성·백색 반사');
show('주석 과잉',  { copper: 0.55, tin: 0.45 },                '거의 부서진다');
show('황동',       { copper: 0.70, zinc: 0.30 },               '연성 좋고 금빛');
show('백동',       { copper: 0.75, nickel: 0.25 },             '완전 고용, 은백색');
show('스털링',     { silver: 0.925, copper: 0.075 },           '은 92.5%');
show('적금',       { gold: 0.75, copper: 0.25 },               'rose gold — 완전 고용');
show('구리+철',    { copper: 0.80, iron: 0.20 },               '거의 안 섞인다(액상 분리)');
show('납청동',     { copper: 0.80, tin: 0.10, lead: 0.10 },    '주조성↑ 강도↓');

console.log('\n=== 모델이 스스로 고르는 최적 배합 (구리 기지 · 3원까지 전수 탐색) ===');
const metals = Object.keys(E).filter((k) => k !== 'copper');
const search = (score, label) => {
  let best = null;
  for (let i = 0; i < metals.length; i++) for (let j = i; j < metals.length; j++) {
    for (let xa = 0; xa <= 0.5; xa += 0.01) for (let xb = 0; xb <= 0.5; xb += 0.01) {
      if (xa + xb > 0.6) continue;
      const mix = { copper: +(1 - xa - xb).toFixed(3) };
      mix[metals[i]] = (mix[metals[i]] || 0) + xa;
      if (i !== j) mix[metals[j]] = (mix[metals[j]] || 0) + xb; else mix[metals[i]] += xb;
      const a = alloy(mix); const v = score(a);
      if (!best || v > best.v) best = { v, mix: { ...mix }, a };
    }
  }
  console.log('  ' + label.padEnd(8) + Object.entries(best.mix).filter(([, v]) => v > 0.005)
    .map(([k, v]) => E[k].ko + ' ' + (v * 100).toFixed(0) + '%').join(' · ')
    + '   → 점수 ' + best.v.toFixed(2) + ' (경도 ' + best.a.hardness.toFixed(0) + ' · 인성 ' + best.a.tough.toFixed(2) + ')');
};
search((a) => a.weapon, '무기');
search((a) => a.mirror, '거울');
console.log('  ※철은 구리에 안 녹는다 — 모델이 스스로 "철검은 합금이 아니라 철 단독"이라고 말한다');

// ── 경제를 얹으면 청동이 나온다 ───────────────────────────────────────────
//   위 탐색은 "구리+금"을 최적 무기로 고른다. 물리적으로는 **맞다**(Au-Cu 고용체는 정말 단단하다).
//   아무도 안 만드는 이유는 금이 구리의 25배이기 때문이다. ⇒ 배합을 정하는 건 물성이 아니라 **가격**이다.
//   모델은 물리만 말하고, 무엇을 만들지는 경제가 정한다 — 층이 제대로 갈린다.
const VAL = { copper: 4, tin: 4, lead: 3, zinc: 4, silver: 30, gold: 100, iron: 3, nickel: 8 };
console.log('\n=== 가치당 성능으로 다시 고르면 (경제 제약) ===');
for (const [label, score] of [['무기', (a) => a.weapon], ['거울', (a) => a.mirror]]) {
  let best = null;
  for (let i = 0; i < metals.length; i++) for (let j = i; j < metals.length; j++) {
    for (let xa = 0; xa <= 0.5; xa += 0.01) for (let xb = 0; xb <= 0.5; xb += 0.01) {
      if (xa + xb > 0.6) continue;
      const mix = { copper: +(1 - xa - xb).toFixed(3) };
      mix[metals[i]] = (mix[metals[i]] || 0) + xa;
      if (i !== j) mix[metals[j]] = (mix[metals[j]] || 0) + xb; else mix[metals[i]] += xb;
      const cost = Object.entries(mix).reduce((s, [k, v]) => s + v * (VAL[k] || 5), 0);
      const v = score(alloy(mix)) / Math.pow(cost, 0.7);          // 가치당 성능
      if (!best || v > best.v) best = { v, mix: { ...mix }, a: alloy(mix) };
    }
  }
  console.log('  ' + label + '   ' + Object.entries(best.mix).filter(([, v]) => v > 0.005)
    .map(([k, v]) => E[k].ko + ' ' + (v * 100).toFixed(0) + '%').join(' · ')
    + '   (경도 ' + best.a.hardness.toFixed(0) + ' · 인성 ' + best.a.tough.toFixed(2) + ' · 주조 ' + best.a.cast.toFixed(2) + ')');
}

// ── 마지막 조각: **제련 가능 금속**이 시대를 만든다 ───────────────────────
//   위 답(구리+주석+아연)은 물성·가격상 옳지만 청동기엔 **불가능**하다.
//   아연은 907℃에서 끓어 증발한다 — 순수 아연 분리는 중세 인도에 가서야 된다.
//   철은 융점 1538℃로 청동기 노(爐)가 못 낸다. 니켈은 근대다.
//   ⇒ 시대가 배합 공간을 자른다. 이게 "청동기 시대"라는 이름의 실질이다.
const ERA = { bronze: ['copper', 'tin', 'lead', 'gold', 'silver'], iron: ['copper', 'tin', 'lead', 'gold', 'silver', 'iron'] };
console.log('\n=== 청동기 시대에 제련 가능한 것만 두고 다시 고르면 ===');
for (const [label, score] of [['무기', (a) => a.weapon], ['거울', (a) => a.mirror], ['의기(주조성)', (a) => a.cast * a.lustre]]) {
  const ms = ERA.bronze.filter((m) => m !== 'copper');
  let best = null;
  for (let i = 0; i < ms.length; i++) for (let j = i; j < ms.length; j++) {
    for (let xa = 0; xa <= 0.5; xa += 0.01) for (let xb = 0; xb <= 0.5; xb += 0.01) {
      if (xa + xb > 0.6) continue;
      const mix = { copper: +(1 - xa - xb).toFixed(3) };
      mix[ms[i]] = (mix[ms[i]] || 0) + xa;
      if (i !== j) mix[ms[j]] = (mix[ms[j]] || 0) + xb; else mix[ms[i]] += xb;
      const cost = Object.entries(mix).reduce((s, [k, v]) => s + v * (VAL[k] || 5), 0);
      const v = score(alloy(mix)) / Math.pow(cost, 0.7);
      if (!best || v > best.v) best = { v, mix: { ...mix }, a: alloy(mix) };
    }
  }
  console.log('  ' + label.padEnd(12) + Object.entries(best.mix).filter(([, v]) => v > 0.005)
    .map(([k, v]) => E[k].ko + ' ' + (v * 100).toFixed(0) + '%').join(' · ')
    + '   (경도 ' + best.a.hardness.toFixed(0) + ' · 인성 ' + best.a.tough.toFixed(2) + ' · 주조 ' + best.a.cast.toFixed(2) + ')');
}
console.log('  ↳ 실제 세형동검 Cu 74 · Sn 14 · Pb 11   /   다뉴세문경 Cu 66 · Sn 34');
