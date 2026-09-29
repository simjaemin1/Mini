#!/usr/bin/env node
// === scripts/t508-decay-table.js — T508 ① 감쇠의 꼴 · 적분 표 (계측기 · 러너 미등록) =====================
//
// ★[T508 ① 2026-09-29] 허기·갈증 감쇠를 두 토막 선형 → 지수(또는 유리) 꼴로 바꾸면 **적분이 같은가**를 표로 낸다.
//   `kcal.js` 앵커 "하루 허기 50 = 2,450 kcal" 은 `dayHunger = 100 × 하루 ÷ HUNGER_SEC` — **한 바퀴(100→0) 평균**이다.
//   꼴이 바뀌어도 총시간이 같으면 한 바퀴 평균은 같다. 다른 것은 **어느 띠에서 사느냐**다 — 그 띠마다 하루 몇 점·몇 kcal 을 쓰는지 잰다.
//
// ★사본 0 — 곡선은 전부 `server/body.js` 정본(`tick` · `decayStep` · `decayRate` · `t508Info`)에서 나온다.
//   꼴마다 env(`T508_DECAY_EXP` = '' · '1' · 'rat')를 주고 모듈을 **다시 올린다**(test-body ⑲ⓗ 와 같은 규약).
//
// 실행: node scripts/t508-decay-table.js [--json <파일>]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BP = require.resolve(path.join(ROOT, 'server', 'body.js'));
const K = require(path.join(ROOT, 'server', 'kcal.js'));

function load(form) {
  const keep = process.env.T508_DECAY_EXP;
  delete require.cache[BP];
  if (form) process.env.T508_DECAY_EXP = form; else delete process.env.T508_DECAY_EXP;
  try { return require(BP); } finally {
    delete require.cache[BP];
    if (keep === undefined) delete process.env.T508_DECAY_EXP; else process.env.T508_DECAY_EXP = keep;
  }
}
const FORMS = [['', '두 토막 선형(끔)'], ['1', '지수 꼴(켬 1)'], ['rat', '유리 꼴(켬 rat)']];
const DT = 1;   // 초 — 정확 해라 틱 길이에 안 흔들린다(끔은 종전 오일러 그대로)

// 게이지 한 축을 만복에서 흘린다 — 매 초 게이지를 적는다(몸 정본 `tick` · 맥락 없음 = 추위·여름·짠물 배율 1)
function trace(B, key, T) {
  const P = { hunger: 100, thirst: 100 }; B.ensure(P);
  const g = [100];
  for (let t = 0; t < T * 3 && P[key] > 0; t += DT) { B.tick(P, DT, {}); g.push(P[key]); }
  return g;   // g[i] = i 초 뒤 게이지
}
// 게이지가 lvl 에 닿는 **연속** 시각(초) — 두 표본 사이를 직선으로 잇는다(1초 격자에 걸린 반올림을 걷는다)
const firstAt = (g, lvl) => {
  for (let i = 1; i < g.length; i++) if (g[i] <= lvl) return (i - 1) + (g[i - 1] - lvl) / Math.max(1e-12, g[i - 1] - g[i]);
  return null;
};

const DAY = 1440;                                  // 게임 하루(초) — 시간 구조 캐논(하루 24분)
const KC_PT = K.DAY_KCAL / K.dayHunger();          // 허기 1점 = 2,450 ÷ 50 = 49 kcal (kcal.js 앵커)
const rows = [];
for (const [form, ko] of FORMS) {
  const B = load(form);
  const I = B.t508Info();
  const H = trace(B, 'hunger', B.CFG.HUNGER_SEC), Tt = trace(B, 'thirst', B.CFG.THIRST_SEC);
  const tot = H.length - 1, totT = Tt.length - 1;
  const knot = H[Math.round(B.CFG.HUNGER_SEC * B.CFG.DECAY_TOP_FRAC)];
  const d1 = 100 - H[DAY], d2 = H[DAY] - H[Math.min(2 * DAY, tot)];
  // 한 바퀴 게이지 평균(시간 평균) — 사다리꼴
  let area = 0; for (let i = 1; i < H.length; i++) area += (H[i - 1] + H[i]) / 2 * DT;
  // 띠에서 살기 — 게이지가 a 에 닿으면 100 으로 채운다 ⇒ 하루에 쓰는 점 = (100 − a) × 하루 ÷ t(100→a)
  const bands = {};
  for (const a of [90, 75, 50, 25, 0]) {
    const t = firstAt(H, a);
    const pts = (100 - a) * DAY / t;
    bands[a] = { t: +t.toFixed(2), ptsDay: +pts.toFixed(2), kcalDay: Math.round(pts * KC_PT) };
  }
  // 굶어·목말라 죽는 시간 — 만복에서 먹지(마시지) 않을 때 · 다른 축은 채운다 · 극단 감소(`extremeHpRate`) 누적이 HP 100 에 닿는 때
  const starve = (key) => {
    const P = { hunger: 100, thirst: 100 }; B.ensure(P);
    const other = key === 'hunger' ? 'thirst' : 'hunger';
    let onset = null, zero = null, lost = 0;
    for (let t = 1; t <= 6 * 1440; t++) {
      P[other] = 100; B.tick(P, 1, {});
      const r = B.extremeHpRate(P).rate;
      if (onset === null && r > 0) onset = t;
      if (zero === null && P[key] <= 0) zero = t;
      lost += r; if (lost >= 100) return { onset, zero, dead: t };
    }
    return { onset, zero, dead: null };
  };
  const stH = starve('hunger'), stT = starve('thirst');
  rows.push({ form: form || 'off', ko, shape: I.shape, totalH: tot, totalT: totT, knot: +knot.toFixed(3), starveH: stH, starveT: stT,
    rate100: +B.decayRate(100, B.CFG.HUNGER_SEC).toFixed(6), rate50: +B.decayRate(50, B.CFG.HUNGER_SEC).toFixed(6), rate0: +B.decayRate(0, B.CFG.HUNGER_SEC).toFixed(6),
    day1: +d1.toFixed(2), day2: +d2.toFixed(2), cycleAvgPerDay: +(100 * DAY / tot).toFixed(2), meanGauge: +(area / tot).toFixed(2), bands,
    curveH: H.filter((_, i) => i % 30 === 0), curveT: Tt.filter((_, i) => i % 15 === 0),
    rateH: Array.from({ length: 101 }, (_, g) => +(B.decayRate(g, B.CFG.HUNGER_SEC) * 60).toFixed(5)) });   // 게이지 g 에서 분당 점(그림 ②)
}

const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣ㄱ-ㅎ]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(1, n - w)); };
console.log('\n=== T508 ① 감쇠의 꼴 — 적분 표 (몸 정본 · 1초 틱 · 맥락 배율 1) ===');
console.log(`  허기 1점 = ${KC_PT} kcal (kcal.js: 하루 ${K.DAY_KCAL} kcal = 허기 ${K.dayHunger()})`);
for (const r of rows) console.log(`  ${pad(r.ko, 18)} 모양 ${JSON.stringify(r.shape)}`);
console.log('\n  ── 총시간 · 매듭 · 기울기(허기 · 게이지/초) ──');
console.log('  ' + pad('꼴', 18) + pad('허기 100→0', 12) + pad('갈증 100→0', 12) + pad('⅓T 게이지', 11) + pad('100 에서', 10) + pad('50 에서', 10) + '0 에서');
for (const r of rows) console.log('  ' + pad(r.ko, 18) + pad(r.totalH + '초', 12) + pad(r.totalT + '초', 12) + pad(r.knot, 11) + pad(r.rate100, 10) + pad(r.rate50, 10) + r.rate0);
console.log('\n  ── 적분 — 만복에서 이틀(허기) ──');
console.log('  ' + pad('꼴', 18) + pad('첫날 쓴 점', 12) + pad('둘째 날', 10) + pad('한 바퀴 평균/일', 16) + '게이지 시간평균');
for (const r of rows) console.log('  ' + pad(r.ko, 18) + pad(r.day1, 12) + pad(r.day2, 10) + pad(r.cycleAvgPerDay + ` (${Math.round(r.cycleAvgPerDay * KC_PT)} kcal)`, 16) + r.meanGauge);
console.log('\n  ── 띠에서 살기 — 게이지가 a 에 닿으면 100 으로 채운다 · 하루에 쓰는 점(kcal) ──');
console.log('  ' + pad('꼴', 18) + [90, 75, 50, 25, 0].map((a) => pad(`a=${a}`, 16)).join(''));
for (const r of rows) console.log('  ' + pad(r.ko, 18) + [90, 75, 50, 25, 0].map((a) => pad(`${r.bands[a].ptsDay}(${r.bands[a].kcalDay})`, 16)).join(''));
console.log('\n  ── 굶어·목말라 죽는 시간 — 만복에서 안 먹을 때(다른 축은 채움) · 실분(= 게임시간) ──');
console.log('  ' + pad('꼴', 18) + pad('허기: 감소 시작', 16) + pad('0 도달', 10) + pad('HP 0', 12) + pad('갈증: 감소 시작', 16) + pad('0 도달', 10) + 'HP 0');
const mn = (x) => x === null ? '—' : (x / 60).toFixed(1);
for (const r of rows) console.log('  ' + pad(r.ko, 18) + pad(mn(r.starveH.onset), 16) + pad(mn(r.starveH.zero), 10) + pad(mn(r.starveH.dead), 12) + pad(mn(r.starveT.onset), 16) + pad(mn(r.starveT.zero), 10) + mn(r.starveT.dead));
const j = process.argv.indexOf('--json');
if (j > 0 && process.argv[j + 1]) { fs.writeFileSync(process.argv[j + 1], JSON.stringify({ KC_PT, rows }, null, 1)); console.log(`\n  JSON → ${process.argv[j + 1]}`); }
