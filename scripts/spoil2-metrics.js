#!/usr/bin/env node
// (표 없음 — **계측기다. 러너에 넣지 마라.**)
// === scripts/spoil2-metrics.js — 부패 2차 대리 지표 ==============================
//
// 재민이 실기 전에 봐야 할 수를 한 장으로 낸다. **판정하지 않는다** — 수만 낸다.
//   ① 품목 × 계절 × 자리 — 상할 때까지 며칠(그리고 실시간 몇 시간)
//   ② 겨울나기 산수(부패 배치의 "겨울 한 주 = 건어물 11.7단위")가 온도 결합 뒤 어떻게 바뀌나
//   ③ 산 위 vs 평지 — 고도가 실제로 뜻을 갖는가
//   ④ 기준온도 유도의 검산 — 1년 노출 합
//
// 실행: node scripts/spoil2-metrics.js
'use strict';
const path = require('path');
const ROOT = path.join(__dirname, '..');
const Spoil = require(path.join(ROOT, 'server', 'spoil.js'));
const Weather = require(path.join(ROOT, 'server', 'weather.js'));

const A = Weather.anchors();
const SUMMER = Math.round(A.summerMid), WINTER = Math.round(A.winterMid);
const DAY_MIN = 24;                                     // 하루 = 실시간 24분(캐논)

function daysToSpoil(item, startDay, placeKey, elevKm) {
  const P = Spoil.placeOf(placeKey), SH = Spoil.shelfOf(item);
  let e = 0;
  for (let k = 0; k < 2000; k++) {
    e += Spoil.dayExposure(startDay + k, elevKm || 0, P.damp) * P.seal;
    if (e >= SH) return k + 1;
  }
  return Infinity;
}
const hrs = (d) => (d * DAY_MIN / 60);

console.log('=== 부패 2차 대리 지표 ===\n');
console.log(`기준온도(유도) ${Spoil.refC().toFixed(2)}℃ · Q10 ${Spoil.EXP.Q10}`
  + ` · 한여름 doy ${SUMMER}(낮 ${Weather.tempAt(SUMMER, false, 0).toFixed(1)}℃)`
  + ` · 한겨울 doy ${WINTER}(낮 ${Weather.tempAt(WINTER, false, 0).toFixed(1)}℃)`);

// ── ④ 검산 ──────────────────────────────────────────────────────────────────
{
  const y = Spoil.cumExposure(SUMMER + 365, 0, 0) - Spoil.cumExposure(SUMMER, 0, 0);
  console.log(`\n④ 기준온도 검산 — 1년 노출 합 ${y.toFixed(1)} / 365 (오차 ${(100 * (y - 365) / 365).toFixed(1)}%)`);
  console.log('   ⇒ **연평균으로는 채택된 보관일이 그대로다.** 갈리는 건 계절과 자리뿐이다.');
}

// ── ① 품목 × 계절 × 자리 ────────────────────────────────────────────────────
const ITEMS = [['생선', 'fish'], ['조리식', 'fish_cooked'], ['채소', 'vegetable'],
               ['건어물', 'dried_fish'], ['절임', 'pickled_veg'], ['곡물', 'food']];
const PLACES = ['carry', 'chest', 'granary'];
console.log('\n① 상할 때까지 — 며칠(실시간 시간)');
console.log('   ' + '품목'.padEnd(8) + '보관일'.padStart(6)
  + PLACES.map((k) => (Spoil.placeOf(k).ko + '(여름)').padStart(16)).join('')
  + PLACES.map((k) => (Spoil.placeOf(k).ko + '(겨울)').padStart(16)).join(''));
for (const [ko, it] of ITEMS) {
  const row = [];
  for (const D of [SUMMER, WINTER]) for (const pk of PLACES) {
    const d = daysToSpoil(it, D, pk, 0);
    row.push((d === Infinity ? '∞' : `${d}일(${hrs(d).toFixed(0)}h)`).padStart(16));
  }
  // 열 순서를 여름3 · 겨울3 으로 맞춘다
  console.log('   ' + ko.padEnd(8) + String(Spoil.shelfOf(it)).padStart(6) + row.join(''));
}
console.log('   ⚠"보관일" 은 **기준온도 기준**이다 — 여름엔 그보다 짧고 겨울엔 길다(그게 이 배치다).');

// ── ② 겨울나기 산수 ─────────────────────────────────────────────────────────
console.log('\n② 겨울나기 — 부패 배치의 수치가 어떻게 바뀌나');
{
  const W = Spoil.winterMath ? null : null; void W;
  const dfShelf = Spoil.shelfOf('dried_fish');
  const dWinCarry = daysToSpoil('dried_fish', WINTER, 'carry', 0);
  const dWinGran = daysToSpoil('dried_fish', WINTER, 'granary', 0);
  const dSumCarry = daysToSpoil('dried_fish', SUMMER, 'carry', 0);
  console.log(`   건어물 보관일 ${dfShelf}일(기준온도)`);
  console.log(`     · 한겨울 · 몸에 지님 : ${dWinCarry}일 (${(dWinCarry / dfShelf).toFixed(2)}배)`);
  console.log(`     · 한겨울 · 곳간     : ${dWinGran}일 (${(dWinGran / dfShelf).toFixed(2)}배)`);
  console.log(`     · 한여름 · 몸에 지님 : ${dSumCarry}일 (${(dSumCarry / dfShelf).toFixed(2)}배)`);
  console.log('   ⇒ **겨울 보존식은 오래 간다** — 부패 배치의 "한 번 말리면 6.4주"가 겨울엔 더 늘고');
  console.log('     여름엔 준다. 겨울나기 비축의 값은 그대로거나 커졌다(안 깎였다).');
}

// ── ③ 고도 ──────────────────────────────────────────────────────────────────
console.log('\n③ 고도 — 산 위가 서늘한가');
{
  const flat = Spoil.dayExposure(SUMMER, 0, 0);
  const mt = Spoil.dayExposure(SUMMER, 0.035, 0);        // 산 높이 캐논 35m
  console.log(`   평지 ${flat.toFixed(4)} · 35m(산 높이 캐논) ${mt.toFixed(4)} ⇒ ${((1 - mt / flat) * 100).toFixed(2)}% 느림`);
  console.log('   ⚠**모델은 살아 있는데 세계가 낮다** — 감률 6.5℃/km × 0.035km = 0.23℃ 뿐이다.');
  console.log('     게다가 바위 셀은 통행 불가라 플레이어가 설 수 있는 고도는 사실상 0 이다.');
  console.log('     ⇒ "산 위 상자" 는 지금 **뜻이 없다**. 배선은 해 뒀다(고도가 생기는 날 저절로 산다). 회부.');
  const km1 = Spoil.dayExposure(SUMMER, 1.0, 0);
  console.log(`   (참고) 고도 1km 라면 ${km1.toFixed(4)} ⇒ ${((1 - km1 / flat) * 100).toFixed(0)}% 느림 — 모델은 이만큼 답한다`);
}

// ── 자리표 ──────────────────────────────────────────────────────────────────
console.log('\n⑤ 자리표 — 하루 노출(1.0 = 기준온도 하루)');
for (const k of Spoil.placeKeys()) {
  const P = Spoil.placeOf(k);
  const su = Spoil.dayExposure(SUMMER, 0, P.damp) * P.seal;
  const wi = Spoil.dayExposure(WINTER, 0, P.damp) * P.seal;
  console.log(`   ${P.ko.padEnd(9)} 밀폐 ${P.seal.toFixed(2)} · 완충 ${P.damp.toFixed(2)}`
    + ` → 여름 ${su.toFixed(3)} · 겨울 ${wi.toFixed(3)} · 연중 ${(Spoil.cumExposure(SUMMER + 365, 0, P.damp) - Spoil.cumExposure(SUMMER, 0, P.damp)) / 365 * P.seal >= 0 ? ((Spoil.cumExposure(SUMMER + 365, 0, P.damp) - Spoil.cumExposure(SUMMER, 0, P.damp)) / 365 * P.seal).toFixed(3) : '-'}`);
}
console.log('\n(수는 전부 `server/spoil.js` 정본과 `server/weather.js` 에서 온다 — 이 스크립트는 계산만 한다.)');
