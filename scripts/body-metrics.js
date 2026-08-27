#!/usr/bin/env node
// === scripts/body-metrics.js — 신체 상태 **대리 지표** 실측 =====================
//
// ★[재민 확정 2026-08-26] "1시간 세션 식사 횟수 · 각 축의 1단계 도달 시간 ·
//   최악 조합 시 체감 저하율 — 손잡이 표와 함께."
//
// ★전부 `server/body.js` **정본 함수**를 부른다. 하네스가 아니라 **손잡이 돌릴 때 보는 자**다.
// 실행: node scripts/body-metrics.js
'use strict';
const path = require('path');
const B = require(path.join(__dirname, '..', 'server', 'body.js'));
const C = B.CFG;
const DAY_MIN = 24;   // 게임일 24분(zone-config WORLD)

const mk = () => ({ hunger: 100, thirst: 100 });
const CALM = { night: false, nearFire: false, indoor: false, warmth: 0, seasonCold: 0, moving: false, sprint: false };

console.log(`\n=== 신체 상태 대리 지표 (게임일 ${DAY_MIN}분) ===\n`);
console.log('손잡이: '
  + `허기 ${C.HUNGER_SEC}s · 갈증 ${C.THIRST_SEC}s · 추위↑ ${C.COLD_RISE_SEC}s · 피로/타 ${C.FATIGUE_PER_LABOR}`
  + ` · 부상문턱 ${C.INJURY_DMG} · 바닥 ${C.MOVE_FLOOR}/${C.WORK_FLOOR}\n`);

// ── ① 각 축이 **1단계(효과 체감점 = 이속 −5%)**에 닿는 시간 ────────────────────
console.log('① 1단계(이속 −5% 체감점) 도달 시간 — 아무것도 안 하고 그냥 있을 때');
const rows = [];
{
  // 배고픔·목마름 — 가만히 있어도 준다
  const p = mk(); let t = 0;
  const s1h = B.STAGE_AT.hunger[0], s1t = B.STAGE_AT.thirst[0];
  let tH = null, tT = null;
  while (t < 7200 && (tH === null || tT === null)) {
    B.tick(p, 1, { ...CALM }); t++;
    const sv = B.severity(p);
    if (tH === null && sv.hunger >= s1h) tH = t;
    if (tT === null && sv.thirst >= s1t) tT = t;
  }
  rows.push(['배고픔', tH, `(가만히 · 문턱 심각도 ${s1h.toFixed(2)})`]);
  rows.push(['목마름', tT, `(가만히 · 문턱 심각도 ${s1t.toFixed(2)})`]);
}
{ // 추위 — 맨몸·한겨울 밤
  const p = mk(); let t = 0, tC = null;
  const s1 = B.STAGE_AT.cold[0];
  while (t < 7200 && tC === null) {
    B.tick(p, 1, { ...CALM, night: true, seasonCold: 1 }); t++;
    if (B.ensure(p).cold >= s1) tC = t;
  }
  rows.push(['추위', tC, '(맨몸·한겨울 밤 · 옷/불 없음)']);
}
{ // 피로 — 채광 1타/초
  const p = mk(); let t = 0, tF = null;
  const s1 = B.STAGE_AT.fatigue[0];
  while (t < 7200 && tF === null) {
    B.onLabor(p, 1); B.tick(p, 1, { ...CALM, moving: true }); t++;
    if (B.ensure(p).fatigue >= s1) tF = t;
  }
  rows.push(['피로', tF, '(채광 1타/초 계속)']);
}
{ // 부상 — 늑대 한 대(15)
  const p = mk();
  B.onDamage(p, 15);
  const sv = B.ensure(p).injury, s1 = B.STAGE_AT.injury[0];
  rows.push(['부상', null, `늑대 한 대(15) → 부상 ${sv.toFixed(3)} · 1단계 문턱 ${s1.toFixed(3)} → ${sv >= s1 ? '즉시 1단계' : '아직 무증상'}`]);
}
for (const [name, sec, note] of rows) {
  const t = sec == null ? '   —  ' : `${(sec / 60).toFixed(1).padStart(5)}분`;
  console.log(`  ${name.padEnd(5)} ${t}  ${(sec != null ? `(게임일 ${(sec / 60 / DAY_MIN).toFixed(2)}일)` : '')}  ${note}`);
}

// ── ② 1시간 세션 식사 횟수 ────────────────────────────────────────────────────
console.log('\n② 1시간 세션에 몇 끼를 먹게 되나 — "허기 30 아래로 떨어지면 먹는다" 가정');
for (const [label, food, gain] of [['조리 고기(meat_cooked)', 'meat_cooked', 40], ['산딸기(berry)', 'berry', 6], ['조리 고기 ×2', 'x2', 80]]) {
  for (const [ctx, cname] of [[{ ...CALM }, '평온'], [{ ...CALM, night: true, seasonCold: 1 }, '한겨울 밤']]) {
    const p = mk(); let meals = 0;
    for (let t = 0; t < 3600; t++) {
      B.tick(p, 1, ctx);
      if (p.hunger < 30) { p.hunger = Math.min(100, p.hunger + gain); meals++; }
    }
    console.log(`  ${label.padEnd(22)} ${cname.padEnd(7)} → ${String(meals).padStart(2)}끼/시간`
      + `  (끝 허기 ${p.hunger.toFixed(0)})`);
  }
}
console.log('  ※ 재민 지시 목표: **1시간에 2~3회**. 조리 고기 한 덩이면 그 리듬에 든다.');

// ── ③ 최악 조합 체감 저하율 ───────────────────────────────────────────────────
console.log('\n③ 체감 저하율 — 축이 하나씩 최악일 때, 그리고 다 겹쳤을 때');
const one = (axis) => {
  const p = mk();
  if (axis === 'hunger') p.hunger = 0;
  else if (axis === 'thirst') p.thirst = 0;
  else B.ensure(p)[axis] = 1;
  return B.effects(p);
};
for (const a of B.AXES) {
  const e = one(a);
  console.log(`  ${B.KO[a].padEnd(5)} 단독 최악 → 이속 ×${e.moveMult.toFixed(3)} · 작업 ×${e.workMult.toFixed(3)}`);
}
{
  const p = mk(); p.hunger = 0; p.thirst = 0;
  const b = B.ensure(p); b.cold = 1; b.fatigue = 1; b.injury = 1;
  const e = B.effects(p);
  console.log(`  ★전부 최악  → 곱 원값 ${e.rawMove.toFixed(3)}/${e.rawWork.toFixed(3)}`
    + `  →  **바닥 적용 ×${e.moveMult} / ×${e.workMult}**  (죽음의 나선 방지)`);
  console.log(`     동시 표시 무들 ${B.moodles(p).length}개(상한 ${C.SHOW_MAX}) — ${B.moodles(p).map((m) => `${m.ko}${m.stage}`).join(' ')}`);
}
{ // 현실적인 "고된 하루 끝" — 하루 종일 일하고 저녁에 배고픈 몸
  const p = mk();
  for (let t = 0; t < DAY_MIN * 60; t++) { B.onLabor(p, 1); B.tick(p, 1, { ...CALM, moving: true }); }
  const e = B.effects(p);
  console.log(`\n  현실 조합(하루 24분 내내 채광, 안 먹음): 허기 ${p.hunger.toFixed(0)} · 피로 ${B.ensure(p).fatigue.toFixed(2)}`
    + ` → 이속 ×${e.moveMult.toFixed(3)} · 작업 ×${e.workMult.toFixed(3)}`);
  console.log(`     ⇒ 저녁엔 손이 ${Math.round((1 - e.workMult) * 100)}% 느리다. **벽이 아니라 기울기**(§7).`);
}
console.log('');
