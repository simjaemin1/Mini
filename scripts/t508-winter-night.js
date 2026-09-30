#!/usr/bin/env node
// === scripts/t508-winter-night.js — T508 ③ 겨울밤 표 · ④ 디버프 표 (계측기 · 러너 미등록) =================
//
// ★[T508 ③] 옷 티어(맨몸·삼베·가죽·모피) × 자리(야생·마을·실내·불 곁) × **1단계 · 3단계 · 죽음 도달 분** — 끔/켬(`T508_CLO`).
//   규약은 `wind-matrix` 그대로다(족보 ㊻ — "한 해만 찍지 마라"): 한겨울(최한일) **자정**의 맥락을 해마다(24년) 세워 두고
//   몸 정본 `Body.tick` 을 1초씩 돌린다(최대 60분). 도달 횟수 / 24 와 도달한 해의 **중앙 분**을 적는다.
//   · 마른 몸(`wet: 0`) — 옷을 재는 표다. 젖은 밤은 test-body ⑲ⓙ 가 따로 잰다(같은 규약 · DRY).
//   · 평지(`windExposure` 0) — 능선·골은 wind-matrix 가 잰다.
//   · 허기·갈증은 매 초 100 으로 채운다 — 추위 한 축의 표다(극단 감소는 축마다 더해지므로 다른 축을 0 에 두어야 추위의 몫만 남는다).
//   · 죽음 = 극단 감소(`extremeHpRate` — 3단계 문턱 위에서 연속)의 누적이 HP 100 에 닿는 때.
//     극단 감소가 걸린 동안 자연 회복은 멈춘다(`zone._hpRegenStep` 게이트) ⇒ 누적이 곧 잃은 HP 다.
// ★[T508 ④] 무들 1·2·3단계 문턱에서 `effects()`(이속·작업)와 `recoverMult()`(회복)가 **지금 값 그대로** 무엇을 하는지 — 판정 0.
//
// ★사본 0 — 옷 ℃·목표점·단계·극단은 전부 `server/body.js` 정본이다. 켬 판은 env 를 주고 모듈을 다시 올린다.
// 실행: node scripts/t508-winter-night.js [--json <파일>]
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const BP = require.resolve(path.join(ROOT, 'server', 'body.js'));
const Wx = require(path.join(ROOT, 'server', 'weather.js'));
const PI = require(path.join(ROOT, 'server', 'player-items.js'));
const ZC = require(path.join(ROOT, 'server', 'zone-config.js'));

function load(env) {
  const keep = {};
  for (const k of Object.keys(env)) keep[k] = process.env[k];
  delete require.cache[BP];
  for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  try { return require(BP); } finally {
    delete require.cache[BP];
    for (const [k, v] of Object.entries(keep)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}
const WINTER = Math.round(Wx.anchors().winterMid);
const NIGHT_MIN = (1 - ZC.WORLD.dayPhaseRatio) * ZC.WORLD.dayLengthMs / 60000;   // 하룻밤 실분(= 7.2)
const YEARS = 24, MAX_S = 3600;

function night(B, ctx) {
  const P = { hunger: 100, thirst: 100, hp: 100, maxHp: 100 }; B.ensure(P);
  const H = B.CFG.STAGE_HYST, at = B.STAGE_AT.cold;
  let s1 = null, s3 = null, dead = null, lost = 0;
  for (let s = 1; s <= MAX_S; s++) {
    //   ★먹고 마시며 버틴다 — 이 표는 **추위 한 축**을 잰다. 안 채우면 60분 판에서 갈증(24분에 0)이 먼저 죽인다(첫 판 실측).
    P.hunger = 100; P.thirst = 100;
    B.tick(P, 1, ctx);
    const c = B.ensure(P).cold;
    if (s1 === null && c >= at[0] + H) s1 = s;
    if (s3 === null && c >= at[2] + H) s3 = s;
    lost += B.extremeHpRate(P).rate * 1;
    if (dead === null && lost >= 100) { dead = s; break; }
  }
  return { s1, s3, dead, target: B.coldTarget(ctx) };
}
function years(B, ctx) {
  const acc = { s1: [], s3: [], dead: [], tgt: [] };
  for (let k = 0; k < YEARS; k++) {
    const r = night(B, Object.assign({ day: WINTER + 365 * k, night: true, wet: 0 }, ctx));
    for (const key of ['s1', 's3', 'dead']) if (r[key] !== null) acc[key].push(r[key]);
    acc.tgt.push(r.target);
  }
  const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y); return b[b.length >> 1]; };
  const inNight = (a) => a.filter((x) => x <= NIGHT_MIN * 60).length;   // 하룻밤(7.2분) 안에 닿은 해
  return { s1: { n: acc.s1.length, med: med(acc.s1), night: inNight(acc.s1) }, s3: { n: acc.s3.length, med: med(acc.s3), night: inNight(acc.s3) },
    dead: { n: acc.dead.length, med: med(acc.dead), night: inNight(acc.dead) }, tgtMed: med(acc.tgt), tgtMax: Math.max(...acc.tgt) };
}
const TIERS = [['맨몸', 0], ['삼베(조잡)', PI.craftItem('clothes', 0, { hemp: 3 }).attrs.warmth],
  ['삼베(장인)', PI.craftItem('clothes', 10, { hemp: 3 }).attrs.warmth],
  ['가죽', PI.craftItem('clothes', 5, { leather: 3 }).attrs.warmth],
  ['갖옷', PI.craftItem('clothes', 8, { fur: 3 }).attrs.warmth]];
const PLACES = [['야생', { windExposure: 0 }], ['마을', { villageShelter: 1, windExposure: 0 }], ['실내', { indoor: true }], ['불 곁', { nearFire: true }]];

const ARMS = [['끔', { T508_CLO: '0' }], ['켬', { T508_CLO: '1' }]];   // ★[T536 추신] 기본이 켬이라 끔 팔은 `'0'` 으로 부른다(미설정 = 켬)
const out = { WINTER, NIGHT_MIN, years: YEARS, arms: {} };
const cell = (r) => {
  const f = (x) => x.n ? `${x.n}/${YEARS} ${(x.med / 60).toFixed(1)}` : `0/${YEARS} —`;
  return `${f(r.s1)} · ${f(r.s3)} · ${f(r.dead)}`;
};
const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += /[가-힣]/.test(ch) ? 2 : 1; return s + ' '.repeat(Math.max(1, n - w)); };
console.log(`\n=== T508 ③ 겨울밤 — 한겨울(doy ${WINTER}) 자정이 이어질 때 · ${YEARS}년 표본 · 마른 몸 · 평지 · 하룻밤 = ${NIGHT_MIN.toFixed(1)}분 ===`);
console.log('  칸 = 1단계 · 3단계 · 죽음 (도달 해/24 중앙 분)');
for (const [arm, env] of ARMS) {
  const B = load(env);
  const I = B.t508Info();
  out.arms[arm] = { cPer: I.cPer, rows: [] };
  console.log(`\n  ── ${arm}: 방한 1점 = ${I.cPer.toFixed(4)}℃ ──`);
  console.log('  ' + pad('옷(방한 · +℃)', 24) + PLACES.map(([p]) => pad(p, 30)).join(''));
  for (const [name, w] of TIERS) {
    const ins = B.warmthInsC(w);
    const cells = PLACES.map(([pn, ctx]) => { const r = years(B, Object.assign({ warmth: w }, ctx)); out.arms[arm].rows.push({ tier: name, warmth: w, insC: +ins.toFixed(3), place: pn, r }); return r; });
    console.log('  ' + pad(`${name}(${w} · +${ins.toFixed(1)}℃)`, 24) + cells.map((r) => pad(cell(r), 30)).join(''));
  }
  //   하룻밤 안(7.2분) — 야생만(다른 자리는 전부 0)
  const wild = out.arms[arm].rows.filter((x) => x.place === '야생');
  console.log('  하룻밤(' + NIGHT_MIN.toFixed(1) + '분) 안 · 야생 — ' + wild.map((x) => `${x.tier} 1단계 ${x.r.s1.night} · 3단계 ${x.r.s3.night} · 죽음 ${x.r.dead.night}`).join(' | '));
}

// ── 참고: clo 로 다시 매긴 옷(회부 — 옷 카탈로그 방한 재배정은 뒤 카드) — 켬 판에서 ℃ = clo × CLO_C 가 되게 방한을 역산 ──
{
  const B = load({ T508_CLO: '1' });
  const I = B.t508Info();
  const CLO = [['삼베 0.40', 0.40], ['가죽 0.72', 0.72], ['갖옷 2.85', B.CFG.CLO_TOP]];
  out.reassign = [];
  console.log(`\n  ── 참고(회부): clo 로 다시 매긴 옷 — 방한 = WARMTH_MIN + clo × CLO_C ÷ ${I.cPer.toFixed(4)} ──`);
  for (const [name, clo] of CLO) {
    const w = B.CFG.WARMTH_MIN + clo * B.CFG.CLO_C / I.cPer;
    const cells = PLACES.map(([pn, ctx]) => { const r = years(B, Object.assign({ warmth: w }, ctx)); out.reassign.push({ tier: name, clo, warmth: +w.toFixed(2), place: pn, r }); return r; });
    console.log('  ' + pad(`${name}clo(${w.toFixed(1)} · +${B.warmthInsC(w).toFixed(1)}℃)`, 24) + cells.map((r) => pad(cell(r), 30)).join(''));
  }
}

// ── ★[T526 2026-09-29] 마을 움집·쉼터 **안** — 완충(마을 한복판 1) + 실내(지붕 아래) 가 **같이** 걸리는 칸 ──
//   T508 의 네 칸(야생 · 마을 · 실내 · 불 곁)은 한 가지씩만 걸었다. 몸의 실내가 마을 움집을 세지 않던 동안(T520: 0/50)
//   "마을 안의 실내"는 세계에 없는 칸이었다 — `T526_VILLAGE_INDOOR` 를 켜면 쉼터에 선 몸이 바로 이 칸이다.
//   ⚠열을 뒤에 붙인다(위 표의 줄은 T508 판과 글자 동일).
{
  out.t526 = {};
  const INSIDE = { villageShelter: 1, windExposure: 0, indoor: true };
  console.log(`\n  ── [T526] 마을 움집 안(완충 1 + 실내) · 야생·마을 칸과 같은 판 ──`);
  for (const [arm, env] of ARMS) {
    const B = load(env);
    out.t526[arm] = [];
    const row = TIERS.map(([name, w]) => { const r = years(B, Object.assign({ warmth: w }, INSIDE)); out.t526[arm].push({ tier: name, warmth: w, r }); return `${name}(${w}) ${cell(r)} · 목표점 중앙 ${r.tgtMed}`; });
    console.log(`  ${arm}: ` + row.join(' | '));
  }
}
// ── ★[T526 ③] 불 곁 × 실내가 겹칠 때 — **지금 순서 그대로**(판정 0) · 몸 정본 `coldTarget`·`tick` 이 낸 값 ──
//   `coldTarget` 의 차례: ℃ 곡선(옷 ℃ 포함) → 바람 곱 → 마을 완충 곱 → **실내 곱(×COLD_INDOOR_MULT)** → **불 곁 상한(min COLD_FIRE_TARGET)**.
//   그 밖의 자리(젖음 마름 · 비 · 더위 갈증 · 피로 · 옷 닳음)도 같은 두 술어를 읽는다 — 차례를 표로 적는다.
{
  const B = load({});
  const day = WINTER, base = { day, night: true, wet: 0, warmth: 0, windExposure: 0 };
  const cases = [['야생', {}], ['마을(완충 1)', { villageShelter: 1 }]];
  const combos = [['—', {}], ['실내', { indoor: true }], ['불 곁', { nearFire: true }], ['실내 + 불 곁', { indoor: true, nearFire: true }]];
  out.overlap = [];
  console.log(`\n=== T526 ③ 불 곁 × 실내 — 한겨울 자정(doy ${WINTER} · 해 0) 맨몸 목표점 · 지금 순서 그대로 ===`);
  console.log('  ' + pad('자리', 16) + combos.map(([c]) => pad(c, 16)).join(''));
  for (const [cn, cc] of cases) {
    const vals = combos.map(([, x]) => B.coldTarget(Object.assign({}, base, cc, x)));
    out.overlap.push({ place: cn, vals });
    console.log('  ' + pad(cn, 16) + vals.map((v) => pad(v.toFixed(4), 16)).join(''));
  }
  // 마름 빠르기(`_dryFactor` — 불 먼저 · 실내 다음) · 비(실내만 막는다) · 더위 갈증(실내 = 그늘) · 피로 회복(실내 ×2)
  const dryOf = (x) => { const P = { hunger: 100, thirst: 100 }; B.ensure(P); B.ensure(P).wet = 1; B.wetStep(P, 60, Object.assign({ day: 180 }, x)); return +(1 - B.wetOf(P)).toFixed(5); };
  const heatOf = (x) => B.heatThirstMult(Object.assign({ seasonCold: 0, night: false }, x));
  console.log(`  마름(젖음 1 에서 60초에 마른 몫 · 여름 맑은 날): 없음 ${dryOf({})} · 실내 ${dryOf({ indoor: true })} · 불 곁 ${dryOf({ nearFire: true })} · 둘 다 ${dryOf({ indoor: true, nearFire: true })}`);
  console.log(`  더위 갈증 배율(여름 낮): 없음 ${heatOf({})} · 실내 ${heatOf({ indoor: true })} · 불 곁 ${heatOf({ nearFire: true })} · 둘 다 ${heatOf({ indoor: true, nearFire: true })}`);
  console.log(`  상수: COLD_INDOOR_MULT ${B.CFG.COLD_INDOOR_MULT} · COLD_FIRE_TARGET ${B.CFG.COLD_FIRE_TARGET} · COLD_VILLAGE_SHELTER ${B.CFG.COLD_VILLAGE_SHELTER} · FATIGUE_INDOOR_MULT ${B.CFG.FATIGUE_INDOOR_MULT}`);
  out.dry = { none: dryOf({}), indoor: dryOf({ indoor: true }), fire: dryOf({ nearFire: true }), both: dryOf({ indoor: true, nearFire: true }) };
}

// ── ④ 디버프 표 — 지금 값 그대로(판정 0) ──
{
  const B = load({});
  out.debuff = [];
  console.log('\n=== T508 ④ 무들 단계 문턱에서 몸이 받는 것 — `effects()` · `recoverMult()` 지금 값 그대로 ===');
  console.log('  ' + pad('축', 8) + pad('단계', 6) + pad('문턱(심각도)', 14) + pad('이속', 10) + pad('작업', 10) + pad('회복', 10) + '극단 HP/분');
  for (const a of B.AXES) {
    for (let st = 0; st < 3; st++) {
      const x = B.STAGE_AT[a][st];
      const P = { hunger: 100, thirst: 100 }; const b = B.ensure(P);
      if (a === 'hunger') P.hunger = 100 * (1 - x); else if (a === 'thirst') P.thirst = 100 * (1 - x); else b[a] = x;
      const e = B.effects(P), rc = B.recoverMult(P), hp = B.extremeHpRate(P).rate;
      const row = { axis: a, stage: st + 1, sev: +x.toFixed(4), move: e.rawMove, work: e.rawWork, recover: rc, hpPerMin: +(hp * 60).toFixed(4) };
      out.debuff.push(row);
      console.log('  ' + pad(B.KO[a], 8) + pad(st + 1, 6) + pad(x.toFixed(4), 14) + pad(e.rawMove, 10) + pad(e.rawWork, 10) + pad(rc, 10) + (hp * 60).toFixed(4));
    }
    // 최심(심각도 1)
    const P = { hunger: 100, thirst: 100 }; const b = B.ensure(P);
    if (a === 'hunger') P.hunger = 0; else if (a === 'thirst') P.thirst = 0; else b[a] = 1;
    const e = B.effects(P), rc = B.recoverMult(P), hp = B.extremeHpRate(P).rate;
    out.debuff.push({ axis: a, stage: 'max', sev: 1, move: e.rawMove, work: e.rawWork, recover: rc, hpPerMin: +(hp * 60).toFixed(4) });
    console.log('  ' + pad(B.KO[a], 8) + pad('최심', 6) + pad('1.0000', 14) + pad(e.rawMove, 10) + pad(e.rawWork, 10) + pad(rc, 10) + (hp * 60).toFixed(4));
  }
  console.log(`  바닥: 이속 ${B.CFG.MOVE_FLOOR} · 작업 ${B.CFG.WORK_FLOOR}(여러 축이 겹쳐도 이 아래로 안 간다) · 히스테리시스 ±${B.CFG.STAGE_HYST}`);
}
const j = process.argv.indexOf('--json');
if (j > 0 && process.argv[j + 1]) { fs.writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1)); console.log(`\n  JSON → ${process.argv[j + 1]}`); }
