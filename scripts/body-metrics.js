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

// ── ⑤ ★[여름 2026-09-03 · T64] 더위 = 갈증 배율 — 계절 × 낮밤 × 그늘 ──────────
//   더위 축은 **없다**(T56 §4: 24년 최고 33.69℃ · `coldOfC` 표가 29℃ 에서 끝난다).
//   여름은 물을 더 마시게 하는 것으로만 온다. 여기서 그 세기를 눈으로 본다.
{
  const Tidal = require(path.join(__dirname, '..', 'server', 'tidal.js'));
  const W = C.HEAT_THIRST_W;
  console.log(`\n⑤ 여름 — 더위는 갈증이다 (W=${W} · 배율 = 1 + W·여름가중·낮·(1−그늘))`);
  console.log(`   여름가중은 **추위 가중의 거울**이다: 겨울 0 · 봄가을 0.35 · 여름 1 (계절 표 두 벌 0)`);

  // 물 없이 갈증 극단까지 — 정본 tick 으로 적분한다(하네스가 감쇠식을 다시 짜지 않는다)
  const dry = (ctx) => {
    const p = mk(); B.ensure(p);
    let s = 0; const thr = 100 * (1 - B.extremeAt('thirst'));
    while (p.thirst > thr && s < 100000) { B.tick(p, 1, { day: 1, now: Date.now(), ...ctx }); s++; }
    return s / 60;
  };
  console.log('\n   물 없이 **갈증 극단**까지(분)');
  console.log('   ┌─────────┬──────────┬────────┬───────────┐');
  console.log('   │   계절   │ 낮 · 야외 │   밤    │ 낮 · 그늘 │');
  for (const [ko, sc] of [['한겨울', 1], ['봄·가을', 0.35], ['한여름', 0]]) {
    const d = dry({ seasonCold: sc, night: false, indoor: false });
    const n = dry({ seasonCold: sc, night: true, indoor: false });
    const i = dry({ seasonCold: sc, night: false, indoor: true });
    console.log(`   │ ${ko.padEnd(7)} │ ${(d.toFixed(1) + '분').padStart(8)} │ ${(n.toFixed(1) + '분').padStart(6)} │ ${(i.toFixed(1) + '분').padStart(9)} │`);
  }
  console.log('   └─────────┴──────────┴────────┴───────────┘');
  console.log('   ★그늘은 **실내**뿐이다(ctx.indoor). 숲 그늘은 회부 — `wind.js` 의 `fsh` 가 정본인데');
  console.log('     꺼내려면 그 파일에 접근자 한 줄이 필요하고 그건 T64 의 접촉 밖이다.');

  // ★고증 대조 — 게이지·되·kg 이 이미 리터와 같은 자리에 있다
  const perDay = (mDay) => {           // 하루(1,440 게임분) 동안 **채워 가며** 쓰는 되
    const p = mk(); B.ensure(p); let used = 0;
    for (let s = 0; s < 1440; s++) {
      const t0 = p.thirst;
      B.tick(p, 1, { day: 1, now: Date.now(), seasonCold: mDay.sc, night: s >= 720, indoor: false });
      used += (t0 - p.thirst);
      if (p.thirst < 60) p.thirst = Math.min(100, p.thirst + Tidal.DRINK_THIRST);
    }
    return used / Tidal.DRINK_THIRST;
  };
  console.log('\n   하루 물 필요 — 되(= 1kg ≈ 1L · 게이지 100 = 3.33되)');
  const win = perDay({ sc: 1 });
  for (const [ko, sc] of [['한겨울', 1], ['봄·가을', 0.35], ['한여름', 0]]) {
    const v = perDay({ sc });
    console.log(`     ${ko.padEnd(7)} ${v.toFixed(2)}되  ⇒ 겨울 대비 ×${(v / win).toFixed(3)}`);
  }
  console.log(`   ★고증 앵커: 사람의 하루 물 2.5~3.5L(더위엔 1.4~1.6배). 이 세계의 겨울이 ${win.toFixed(2)}L 이고`);
  console.log(`     여름이 그 ×${(perDay({ sc: 0 }) / win).toFixed(2)} 다 — **W 는 고른 게 아니라 그 밴드에서 유도했다**(보고 T64 §ⓓ).`);
  console.log(`   ★되돌림: BODY_HEAT_THIRST_W=0 이면 세 줄이 전부 겨울 값이 된다(T56 비트 동일).`);
}
console.log('');
