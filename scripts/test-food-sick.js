#!/usr/bin/env node
// @regress
// === scripts/test-food-sick.js — T705 식중독 지수 P · 배탈 지수 B · 문턱 θ (손잡이 T705_FOOD_SICK=1 · 없음 = 끔 = main 바이트) ===
//
// ★왜 [재민 10-12 · 족보 617] 날고기·상한 음식은 먹는 즉시 체력이 까이는 게 아니다 — P(먹은 만큼 오르고 준다) → B(P 가 쌓이고 준다) →
//   B 가 θ 를 넘은 만큼 체력. 두 단계라 잠복기가 생긴다 · 주사위 0. 섭취 = kg × (1 − f) · 익히면 균 몫은 죽고 독소 몫(상함)은 남는다.
//   이 하네스가 지키는 것:
//
//  ① 끔 = 종전 — 손잡이 없음·빈 값·0·true = 끔 · 끔이면 `sick.js` 를 부르지도 않는다 · 날고기 −3 · 상한 것 즉시 부상 그대로
//  ② 수 = 출처 — `sick.js` 의 출처 수 셋(30분 · 8시간 · 24시간)이 `설계/고증_식중독_배탈.md` S1 글자 · a·b·θ 가 규칙 ⓐⓑⓒ 를 맞춘다 · 코드에 지은 수 0
//  ③ 식 — 닫힌 해 한 걸음 = 잘게 나눈 걸음(dt 에 안 흔들린다) = 충격 응답 · 꼭대기 시각은 양과 무관(8시간) · 근거표 §3 곡선 표와 같은 수
//  ④ 실기(켬) — 존을 띄워 먹기: 갓 잡은 날것 독 0 · 시든 날것 독 = kg × (1 − f) · 즉시 체력·부상 0(잠복) → 몸 틱이 B 를 올리고 θ 를 넘으면
//     극단 합산기에 '배탈' 한 줄 → 빚 → 정본 피해 경로 · 자연 회복 멈춤 · 곡선이 ③ 의 식과 같다
//  ⑤ 익힘(켬) — 상한 날고기로 지은 요리 = 독소(그릇 무게 × 상한 몫) · 시든 것으로 지은 요리 = 독 0 · T694 굽기도 상한 몫은 상한 채로 태어난다
//  ⑥ 저장 — 앓는 중이면 [P, B] 가 실리고 다시 붙으면 그 자리부터(오프라인 따라잡기 0) · 끔이면 그 칸이 없다
//  ⑦ NPC — 존 몸은 허기·갈증 면제(먹지 않는다 · 몸 틱을 안 돈다) — econ 곳간 조사는 보고 표
//
// 실행: node scripts/test-food-sick.js      (④~⑥ 이 존을 세 번 띄운다 — 가벼운 판이라 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
const SV = (p) => path.join(ROOT, 'server', p);

// ══ 하위 실행 — 존 하나를 띄워 먹기 · 몸 틱 · 요리 · 수령 · 저장 ═══════════════════════════════════
if (process.env.T705_SUB === 'zone') {
  const TMP = `/tmp/t705-food-sick-${process.pid}.db`;
  for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
  process.env.ZONE_ID = 'hanbando';
  process.env.PORT = String(42300 + (process.pid % 90));
  process.env.DB_PATH = TMP;
  process.env.ENABLE_VILLAGES = '0'; process.env.ENABLE_WILDLIFE = '0'; process.env.ENABLE_BANDITS = '0'; process.env.ENABLE_ROADS = '0';
  process.env.CRAFT_COOK_MS = process.env.CRAFT_COOK_MS || '300';
  const _log = console.log; console.log = () => {}; console.warn = () => {}; console.error = () => {};
  const Zone = require(SV('zone.js'));
  const H = Zone.__testBind();
  const out = {};
  const _sickLoaded = () => Object.keys(require.cache).some((k) => k.endsWith(path.join('server', 'sick.js')));
  const notes = [];
  const mkP = (tag) => ({ pid: `p_${tag}`, playerId: `anon_t705_${tag}`, name: '먹보', persistent: false,
    x: 5000, y: 5000, floor: 0, hp: 100, maxHp: 100, hunger: 50, thirst: 100, lastDamagedAt: 0,
    inventory: {}, toolItems: [], equipment: [], equipSlots: {}, craftSkill: {}, oreLedger: {}, oreCarry: {}, dishes: [], lots: {},
    isNpc: false, isDown: false, vx: 0, vy: 0,
    ws: { readyState: 1, send: (s) => { try { const o = JSON.parse(s); if (o.type === 'notice') notes.push(o.text); } catch (e) {} } } });
  const today = H.zoneGameDay();
  let _dOff = 1;
  // 신선도를 **정확히** 세운 로트 한 줄(노출 = 보관일 × (1 − f)) — 날짜는 줄마다 달리(같은 날·같은 자리는 `note` 가 섞는다)
  const give = (p, item, n, f) => {
    const L = H.Spoil.shelfOf(item);
    p.inventory[item] = (p.inventory[item] || 0) + n;
    H.Lots.moveIn(p, item, [{ d: today - (_dOff++), n, e: L * (1 - f), t: today }], today, 0, 'carry');
  };
  const sick = (p) => (p.body && p.body.sick) ? { P: +p.body.sick.P.toFixed(6), B: +p.body.sick.B.toFixed(6) } : null;
  const dayMs = H._SEASON_DAY_MS;
  // 몸 틱 — 실초 1초(= 게임 1분)씩 · 허기·갈증은 가득 채워 둔다(극단 허기가 섞이지 않게) · 빚은 정본 피해 경로로(존 `_gaugeStep` 과 같은 두 줄)
  let clock = Date.now();
  const tickFor = (p, gameHours, everyH, rec) => {
    const n = Math.round(gameHours * 60);
    for (let i = 1; i <= n; i++) {
      p.hunger = 100; p.thirst = 100; clock += 1000;
      H.Body.tick(p, 1, { now: clock, indoor: true, nearFire: true, seasonCold: 0 });   // 하루 길이는 존이 부팅 때 몸에 알린 값(존 `_gaugeStep` 과 같은 인자)
      const d = H.Body.takeHpDamage(p);
      if (d > 0) H.damagePlayer(p, d, 'extreme:sick');
      if (rec && everyH && i % Math.round(everyH * 60) === 0) {
        const er = H.Body.extremeHpRate(p);
        rec.push({ h: +(i / 60).toFixed(3), P: sick(p) ? sick(p).P : 0, B: sick(p) ? sick(p).B : 0, hp: p.hp, sickPart: er.parts.some((x) => x.axis === 'sick'), rate: +er.rate.toFixed(6) });
      }
    }
  };
  (async () => {
    out.eff = { meat_raw: H.FOOD_EFFECTS.meat_raw || null, meat_game: H.FOOD_EFFECTS.meat_game || null, meat_bear: H.FOOD_EFFECTS.meat_bear || null };
    out.dayMs = { zone: H._SEASON_DAY_MS, body: (typeof H.Body.sickDayMs === 'function') ? H.Body.sickDayMs() : null };   // 부팅 한 줄이 몸에 알린 하루 길이
    // A — 갓 잡은 날것(f = 1)
    const a = mkP('a'); give(a, 'meat_raw', 1, 1);
    H.doEat(a, 'meat_raw', 1);
    out.A = { hp: a.hp, injury: H.Body.ensure(a).injury, sick: sick(a) };
    // B — 시든 날것(f = 0.6 · 독 0.4) → 몸 틱 60시간
    const b = mkP('b'); give(b, 'meat_raw', 1, 0.6);
    H.doEat(b, 'meat_raw', 1);
    out.B0 = { hp: b.hp, injury: H.Body.ensure(b).injury, sick: sick(b) };
    const rec = []; tickFor(b, 60, 0.25, rec);
    out.Bcurve = rec;
    out.Bend = { hp: b.hp, sick: sick(b) };
    // C — 상한 날것(f = 0 · 독 1.0)
    const c = mkP('c'); give(c, 'meat_raw', 1, 0);
    H.doEat(c, 'meat_raw', 1);
    out.C0 = { hp: c.hp, injury: H.Body.ensure(c).injury, sick: sick(c) };
    const recC = []; tickFor(c, 2, 0.25, recC);
    out.Ccurve = recC;
    // 저장 — 앓는 중
    out.save = H.Body.toSave(c);
    const c2 = mkP('c2'); H.Body.fromSave(c2, JSON.parse(JSON.stringify(out.save)));
    out.restored = { sick: sick(c2), at: c2.body && c2.body.sick ? c2.body.sick.at : null };
    out.saveHealthy = H.Body.toSave(a);
    // D — 요리 인스턴스: 상한 날고기 1 · 시든 날고기 1
    const fire = { id: 'cf705', dbId: null, type: 'campfire', ownerId: 'anon_t705_d', ownerName: 'anon_t705_d', x: 5020, y: 5000, data: {} };
    H.buildings.set(fire.id, fire);
    const d = mkP('d'); give(d, 'meat_raw', 1, 0);
    H.doCook(d, 'meat_cooked');
    const dw = mkP('dw'); dw.playerId = 'anon_t705_d'; dw.pid = 'p_dw';   // 같은 주인(불 쓰기) — 시든 것
    give(dw, 'meat_raw', 1, 0.3);
    await new Promise((r) => setTimeout(r, 2 * H.Facility.CRAFT_MS.cook + 400));
    d.playerId = 'anon_t705_d';
    H.doCraftCollect(d, fire.id);
    out.Ddish = d.dishes.map((x) => ({ tox: x.tox == null ? null : x.tox, label: x.label }));
    if (d.dishes[0]) H.doEatDish(d, d.dishes[0].id);
    out.Dafter = { sick: sick(d), hp: d.hp };
    H.doCook(dw, 'meat_cooked');
    await new Promise((r) => setTimeout(r, 2 * H.Facility.CRAFT_MS.cook + 400));
    H.doCraftCollect(dw, fire.id);
    out.DWdish = dw.dishes.map((x) => ({ tox: x.tox == null ? null : x.tox }));
    if (dw.dishes[0]) H.doEatDish(dw, dw.dishes[0].id);
    out.DWafter = { sick: sick(dw) };
    // E — T694 굽기(품목) — 손잡이 둘 다 켬일 때만 줄이 있다
    out.E = null;
    if (H.COOK_RECIPES.meat_game_cooked) {
      const e = mkP('e'); e.playerId = 'anon_t705_d'; e.pid = 'p_e';
      give(e, 'meat_game', 1, 0); give(e, 'meat_game', 1, 0.6);
      H.doCook(e, 'meat_game_cooked'); H.doCook(e, 'meat_game_cooked');
      await new Promise((r) => setTimeout(r, 3 * H.Facility.CRAFT_MS.cook + 500));
      H.doCraftCollect(e, fire.id);
      const lots = H.Lots.of(e, 'meat_game_cooked').map((l) => ({ n: l.n, f: H.Spoil.freshnessOf('meat_game_cooked', H.Spoil.exposureOf(l, H.zoneGameDay())) }));
      const n0 = e.inventory.meat_game_cooked || 0;
      H.doEat(e, 'meat_game_cooked', 1);     // 오래된 것부터 = 상한 몫 먼저
      const s1 = sick(e);
      H.doEat(e, 'meat_game_cooked', 1);
      const s2 = sick(e);
      out.E = { n0, lots, s1, s2, kg: H.Weights.kgOf('meat_game_cooked') };
    }
    out.sickLoaded = _sickLoaded();   // 판 끝 — 먹고 앓고 굽고 다 한 뒤에도 끔이면 안 실린다
    console.log = _log;
    console.log(JSON.stringify(out));
    for (const f of [TMP, TMP + '-wal', TMP + '-shm']) { try { fs.unlinkSync(f); } catch (e) {} }
    process.exit(0);
  })().catch((e) => { console.log = _log; console.log(JSON.stringify({ err: String(e && e.stack || e) })); process.exit(1); });
  return;
}

// ══ 본 실행 ═══════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const pre = (c, m, x) => { if (!c) { fail++; console.log('  ✗ [상황] ' + m + (x !== undefined ? `  ${x}` : '')); } else console.log('  · [상황] ' + m + (x !== undefined ? `  ${x}` : '')); };
const say = (m) => console.log(m);
const BASE_ENV = (() => { const e = Object.assign({}, process.env); delete e.T705_FOOD_SICK; delete e.T694_GAME_MEAT; delete e.T705_SUB; delete e.SICK_A_PER_H; delete e.SICK_B_PER_H; delete e.SICK_THETA; return e; })();
const sub = (env) => {
  const o = execFileSync(process.execPath, [__filename], { env: Object.assign({}, BASE_ENV, env, { T705_SUB: 'zone' }), stdio: 'pipe', maxBuffer: 64 << 20 });
  return JSON.parse(o.toString().trim().split('\n').pop());
};
delete process.env.SICK_A_PER_H; delete process.env.SICK_B_PER_H; delete process.env.SICK_THETA;
const S = require(SV('sick.js'));
const SSRC = fs.readFileSync(SV('sick.js'), 'utf8');
const ZSRC = fs.readFileSync(SV('zone.js'), 'utf8');
const DOC = fs.readFileSync(path.join(ROOT, '설계', '고증_식중독_배탈.md'), 'utf8');
const near = (x, y, e) => Math.abs(x - y) <= (e == null ? 1e-9 : e);

say('\n=== 식중독 지수 P · 배탈 지수 B · 문턱 θ (T705 · 손잡이 T705_FOOD_SICK=1) ===');

// ── ① 끔 = 종전 ─────────────────────────────────────────────────────────────────────────
say('\n① 끔 = 종전 — 손잡이 · sick.js 안 부름 · 날고기 −3 · 상한 것 즉시 부상');
const zOff = sub({});
const zOn = sub({ T705_FOOD_SICK: '1' });
const zBoth = sub({ T705_FOOD_SICK: '1', T694_GAME_MEAT: '1' });
{
  pre(!zOff.err && !zOn.err && !zBoth.err, '존 세 판이 떴다', zOff.err || zOn.err || zBoth.err || '');
  const knob = (v) => JSON.parse(execFileSync(process.execPath, ['-e', 'process.stdout.write(JSON.stringify(require(process.argv[1]).ON))', SV('sick.js')], { env: Object.assign({}, BASE_ENV, v === undefined ? {} : { T705_FOOD_SICK: v }) }).toString());
  ok(knob(undefined) === false && knob('') === false && knob('0') === false && knob('true') === false && knob('1') === true, "★① 손잡이 — '1' 하나만 켬(없음·빈 값·'0'·'true' = 끔)");
  ok(zOff.sickLoaded === false && zOn.sickLoaded === true, '★★① 끔이면 존이 `sick.js` 를 부르지도 않는다(적재 목록 무변)', `끔 ${zOff.sickLoaded} · 켬 ${zOn.sickLoaded}`);
  ok(zOff.eff.meat_raw && zOff.eff.meat_raw.hpDelta === -3 && zOff.eff.meat_game && zOff.eff.meat_game.hpDelta === -3, '① 끔 — 날고기 줄 HP −3 그대로(main)');
  ok(zOff.B0.hp === 97 && zOff.B0.sick === null && zOff.C0.injury > 0 && zOff.C0.sick === null, '★① 끔 — 날고기 먹으면 즉시 HP −3 · 상한 것은 즉시 부상(종전 둘 그대로) · 배탈 칸 없음', `HP ${zOff.B0.hp} · 부상 ${zOff.C0.injury}`);
  ok(zOff.Ddish.every((x) => x.tox === null) && zOff.Dafter.sick === null && !('sick' in zOff.save), '① 끔 — 요리 독소 칸 없음 · 저장에 배탈 칸 없음(종전 저장 꼴)');
  ok(/const T705_SICK = process\.env\.T705_FOOD_SICK === '1';/.test(ZSRC) && !/require\('\.\/sick'\)(?![\s\S]{0,40}_SickM)/.test(ZSRC.replace(/_SickM = require\('\.\/sick'\)/g, '')), '① 배선 — zone 은 켬일 때만 늦게 부른다(`_sickM()` 한 자리)');
  // ★[T705 · 게이트가 드러냈다] 존 틱 글자는 main 그대로 — `test-move-soa` 가 `_gaugeStep` 글자를 떠서 제 판에서 돌린다(새 이름을 넣으면 거기서 죽는다)
  const _gi = ZSRC.indexOf('  function _gaugeStep(p) {'), _gj = ZSRC.indexOf('\n  }\n', _gi), _gs = (_gi > 0 && _gj > _gi) ? ZSRC.slice(_gi, _gj) : '';
  ok(_gs.length > 0 && !/T705|_SEASON_DAY_MS|sick/i.test(_gs), '★① 존 틱 글자(`_gaugeStep`)에 T705 가 없다 — 하루 길이는 부팅 때 한 번(`Body.sickDayMs`) · `test-move-soa` 가 그 글자를 떠서 돌린다', `${_gs.length}자`);
  ok(zOff.dayMs.body === 0 && zOn.dayMs.zone > 0 && zOn.dayMs.body === zOn.dayMs.zone, '① 하루 길이 — 켬이면 존이 부팅 때 몸에 알린다(정본 `_SEASON_DAY_MS` 하나) · 끔이면 안 부른다', `켬 몸 ${zOn.dayMs.body} = 존 ${zOn.dayMs.zone} · 끔 몸 ${zOff.dayMs.body}`);
}

// ── ② 수 = 출처 ─────────────────────────────────────────────────────────────────────────
say('\n② 수 = 출처 — CDC 포도상구균 셋 → a · b · θ (규칙 ⓐⓑⓒ)');
{
  const s1 = DOC.split('\n').find((l) => /^\|\s*S1\s*\|/.test(l)) || '';
  ok(/within 30 minutes to 8 hours/.test(s1) && /They last 24 hours or less/.test(s1) && /does not destroy the toxin in the food/.test(s1) && /cdc\.gov\/staph-food-poisoning/.test(s1),
    '★★② 근거표 S1 줄 = CDC 글자 셋(잠복 · 기간 · 익혀도 독소)과 출처 주소', s1.slice(0, 70));
  ok(S.SRC.onsetMinH === 0.5 && S.SRC.onsetMaxH === 8 && S.SRC.illMaxH === 24 && /\*\*30분~8시간\*\*/.test(s1) && /\*\*24시간 이하\*\*/.test(s1), '★② 코드 출처 수 = 30분 · 8시간 · 24시간 = 근거표 굵은 글자');
  const D = S.D0;
  ok(near(D.b, 1 / 24) && near(D.peakH, 8, 1e-9) && near(D.theta, S.impulseB(0.5, D.mealKg, D.a, D.b)) && D.mealKg === 1, '★★② 규칙 ⓐ b = 1/24 · ⓑ 꼭대기 8시간 · ⓒ θ = B(30분 · 한 끼 1kg) — 셋 다 맞는다',
    `a ${D.a.toFixed(4)} · b ${D.b.toFixed(5)} · θ ${D.theta.toFixed(4)}`);
  ok(near(S.PARAM.a, D.a) && near(S.PARAM.b, D.b) && near(S.PARAM.theta, D.theta), '② 손잡이 없음 = 유도값 그대로(SICK_* env 없음)');
  const t2 = DOC.split('\n').find((l) => /^\|\s*θ\s*\|/.test(l)) || '';
  ok(t2.includes('0.4617') && DOC.includes('0.2796') && DOC.includes('0.04167'), '② 근거표 §2 의 값 = 코드가 푼 값(소수 넷째 자리)');
  //   코드(주석 밖)의 수 — 출처 셋 · 단위 환산(24시간 · 60분 · 1000ms) · 수치 풀이 틀(이분법 400번 · 1e9 괄호 · 1e-9/1e-12 판정) · 표 기본값(0.25시간 · 96시간) · 자릿수 6
  const code = SSRC.split('\n').map((l) => l.replace(/'[^'\n]*'/g, "''").replace(/\/\/.*$/, '')).join('\n');   // 글자열 먼저(주소의 // 가 주석으로 안 읽히게) · 그다음 주석
  const nums = [...new Set((code.match(/\b\d+(?:\.\d+)?(?:e-?\d+)?\b/g) || []))];
  const allow = new Set(['0', '1', '0.5', '8', '24', '60', '1000', '400', '1e9', '1e-9', '1e-12', '0.25', '96', '6', '4', '2']);   // 2 = 사다리꼴 ½(곡선 표)
  const extra = nums.filter((n) => !allow.has(n));
  ok(extra.length === 0, '★② sick.js 코드의 수 = 출처 셋 + 단위 환산 + 풀이 틀뿐(지은 수 0)', extra.join(',') || '0');
}

// ── ③ 식 ───────────────────────────────────────────────────────────────────────────────
say('\n③ 식 — 닫힌 해 · 걸음 쪼개기 무관 · 꼭대기 시각 · 근거표 곡선');
{
  const P = S.PARAM;
  const one = { P: 0, B: 0 }; S.intake(one, 1, 0); S.step(one, 8);
  const many = { P: 0, B: 0 }; S.intake(many, 1, 0); for (let i = 0; i < 8 * 3600; i++) S.step(many, 8 / (8 * 3600));
  ok(near(one.B, S.impulseB(8, 1, P.a, P.b), 1e-12) && near(many.B, one.B, 1e-9) && near(many.P, one.P, 1e-12), '★★③ 한 걸음 = 28,800 걸음 = 충격 응답(dt 에 안 흔들린다)', `B(8h) ${one.B.toFixed(6)}`);
  ok([0.2, 0.5, 1, 3].every((D) => near(S.peakT(P.a, P.b), 8, 1e-9) && S.impulseB(8, D, P.a, P.b) > S.impulseB(7.9, D, P.a, P.b) && S.impulseB(8, D, P.a, P.b) > S.impulseB(8.1, D, P.a, P.b)), '③ 꼭대기 시각은 양과 무관 — 8시간(잠복 상한)');
  ok(S.doseOf(1, 1, 1) === 0 && S.doseOf(1, 1, 0.6) === 0.4 && S.doseOf(0.7495716914285837, 1, 0) === 0.749572 && S.doseOf(1, 2, 0.5) === 1, '③ 독 = kg × 개수 × (1 − f) — 갓 잡은 것 0');
  const rows = [[0.2, 4.6, 8.7, 0.3, '0.2'], [0.4, 1.45, 29.5, 9.2, '0.4'], [0.6, 0.9, 39.8, 21.8, '0.6'], [0.75, 0.7, 45.4, 32.1, '0.75'], [1.0, 0.52, 52.5, 50.4, '1.0']];
  const bad = [];
  for (const [D, on, ill, hp, lab] of rows) {
    const c = S.course(D, 200, 1 / 60);
    if (!(near(c.onsetH, on, 0.02) && near(c.illH, ill, 0.06) && near(c.hp, hp, 0.06))) bad.push(`${D}: ${c.onsetH}/${c.illH}/${c.hp}`);
    const line = DOC.split('\n').find((l) => new RegExp('^\\|\\s*' + lab.replace('.', '\\.') + '\\s*\\|').test(l)) || '';
    if (!line.includes(String(hp))) bad.push(`문서 ${D} 줄에 체력 ${hp} 없음`);
  }
  ok(bad.length === 0, '★③ 곡선 — 독 0.2 · 0.4 · 0.6 · 0.75 · 1.0kg 의 앓기 시작 · 앓는 시간 · 깎이는 체력 = 근거표 §3', bad.join(' / ') || '');
  ok(S.course(0.18, 200, 1 / 60).hp === 0 && S.course(0.19, 200, 1 / 60).hp > 0, '③ 문턱을 겨우 넘는 양 ≈ 상한 것 0.18kg — 그보다 적으면 안 앓는다');
}

// ── ④ 실기(켬) ──────────────────────────────────────────────────────────────────────────
say('\n④ 실기(켬) — 먹기 → 잠복 → 몸 틱 → 극단 합산기 · 정본 피해 경로');
{
  const z = zOn;
  ok(z.eff.meat_raw && !('hpDelta' in z.eff.meat_raw) && z.eff.meat_game && !('hpDelta' in z.eff.meat_game), '★★④ 날고기 −3 을 뺐다(⑤ T694 닫힘 · 먹기 표에 hpDelta 0)');
  ok(z.A.hp === 100 && z.A.sick === null && z.A.injury === 0, '★④ 갓 잡은 날것(f = 1) — 독 0 · 몸에 배탈 칸도 안 선다', JSON.stringify(z.A));
  ok(z.B0.hp === 100 && z.B0.injury === 0 && z.B0.sick && near(z.B0.sick.P, 0.4, 1e-6) && z.B0.sick.B === 0, '★★④ 시든 날것(f = 0.6) — 즉시 체력·부상 0 · P = 1kg × 0.4(잠복)', JSON.stringify(z.B0.sick));
  const pts = z.Bcurve;
  const at = (h) => pts.find((r) => near(r.h, h, 1e-6));
  const prm = S.PARAM, Bth = (h) => S.impulseB(h, 0.4, prm.a, prm.b);
  const first = pts.find((r) => r.sickPart);
  ok(first && first.h >= 1.25 && first.h <= 1.75 && at(1.25).sickPart === false, '★★④ 잠복 — 1.45시간 전엔 합산기에 배탈 줄이 없다 · 그 뒤 선다(③ 의 식과 같은 자리)', first ? `${first.h}시간` : '없음');
  ok([2, 8, 24].every((h) => at(h) && near(at(h).B, Bth(h), 1e-6)), '★④ 몸 틱의 B = 닫힌 해(2 · 8 · 24시간)', `B(8) ${at(8) && at(8).B}`);
  ok(at(8) && near(at(8).rate, (Bth(8) - prm.theta) / 60, 1e-6), '④ 합산기 빠르기 = (B − θ)/60 HP/게임분', at(8) ? `${at(8).rate}` : '');
  const lost = 100 - z.Bend.hp, want = S.course(0.4, 60, 1 / 60).hp;
  ok(Math.abs(lost - want) <= 1, '★★④ 60시간 동안 깎인 체력 = 식의 적분(빚 → 정수 HP → 정본 피해 경로)', `${lost} vs ${want.toFixed(2)}`);
  ok(z.Bend.sick && z.Bend.sick.B < prm.theta, '④ 다 앓고 나면 B 가 θ 아래로 내려온다(합산기에서 빠진다)', JSON.stringify(z.Bend.sick));
  ok(z.C0.hp === 100 && z.C0.injury === 0 && near(z.C0.sick.P, 1, 1e-6), '★④ 상한 날것(f = 0) — 즉시 부상 대신 P = 1kg(켬)', JSON.stringify(z.C0));
  const c0 = z.Ccurve.find((r) => near(r.h, 0.25, 1e-6)), c1 = z.Ccurve.find((r) => near(r.h, 0.5, 1e-6)), c2 = z.Ccurve.find((r) => near(r.h, 0.75, 1e-6));
  ok(c0 && c1 && c2 && !c0.sickPart && near(c1.B, S.PARAM.theta, 1e-5) && c1.rate < 1e-6 && c2.sickPart && c2.rate > 0, '④ 1kg 다 상한 것 — 15분엔 안 앓고 · 30분에 B = θ(규칙 ⓒ 의 그 점) · 45분엔 앓는다', c1 ? `B(0.5h) ${c1.B} · θ ${S.PARAM.theta.toFixed(6)}` : '');
  ok(/const _extreme = p\.isNpc \? 0 : Body\.extremeHpRate\(p\)\.rate;/.test(ZSRC) && /if \(_rm > 0 && _extreme <= 0\) setHp/.test(ZSRC), '④ 자연 회복 멈춤 — 회복 게이트가 같은 합산기를 읽는다(앓는 동안 안 아문다)');
}

// ── ⑤ 익힘(켬) ──────────────────────────────────────────────────────────────────────────
say('\n⑤ 익힘 — 균 몫은 죽고 독소 몫(상함)은 남는다');
{
  const z = zOn;
  ok(z.Ddish.length === 1 && near(z.Ddish[0].tox, 0.55, 1e-6), '★★⑤ 상한 날고기로 지은 요리 = 독소(그릇 무게 0.55kg × 상한 몫 1)', JSON.stringify(z.Ddish));
  ok(z.Dafter.sick && near(z.Dafter.sick.P, 0.55, 1e-6), '⑤ 그 요리를 먹으면 P = 0.55', JSON.stringify(z.Dafter.sick));
  ok(z.DWdish.length === 1 && z.DWdish[0].tox === null && z.DWafter.sick === null, '★⑤ 시든 날고기(f = 0.3)로 지은 요리 = 독 0(균은 불에 죽었다)', JSON.stringify(z.DWdish));
  const e = zBoth.E;
  pre(!!e, 'T694 굽기 줄이 있다(손잡이 둘 다 켬)');
  if (e) {
    const sp = e.lots.filter((l) => l.f === 0), fr = e.lots.filter((l) => l.f === 1);
    ok(e.n0 === 2 && sp.length === 1 && near(sp[0].n, 1, 1e-6) && fr.length === 1 && near(fr[0].n, 1, 1e-6), '★★⑤ T694 굽기 — 상한 사슴고기로 구운 것은 **상한 채로** 태어난다(f = 0) · 시든 것으로 구운 것은 갓 구운 것(f = 1)', JSON.stringify(e.lots));
    ok(e.s1 && near(e.s1.P, e.kg, 1e-6) && e.s2 && near(e.s2.P, e.s1.P, 1e-6), '★⑤ 먹으면 — 상한 구운 것 P = 0.7496kg(그 무게 × 1) · 갓 구운 것 독 0(T694 재민 칸 ⑦ 닫힘)', `${e.s1 && e.s1.P} → ${e.s2 && e.s2.P}`);
  }
  ok(zBoth.eff.meat_bear && !('hpDelta' in zBoth.eff.meat_bear), '⑤ 곰고기 날것도 −3 없음(T694 켬)');
}

// ── ⑥ 저장 ─────────────────────────────────────────────────────────────────────────────
say('\n⑥ 저장 — 앓는 중이면 [P, B] · 다시 붙으면 그 자리부터');
{
  const z = zOn;
  ok(Array.isArray(z.save.sick) && z.save.sick.length === 2 && z.save.sick[0] > 0 && z.save.sick[1] > 0, '★⑥ 앓는 중 — 저장에 [P, B]', JSON.stringify(z.save.sick));
  ok(z.restored.sick && near(z.restored.sick.P, z.save.sick[0], 1e-6) && near(z.restored.sick.B, z.save.sick[1], 1e-6) && z.restored.at > 0, '★⑥ 다시 붙으면 같은 P · B · 시각은 붙은 때(접속 끊긴 동안은 안 흘렀다 — 따라잡기 0)');
  ok(!('sick' in z.saveHealthy), '⑥ 안 아픈 몸 — 저장 꼴이 종전 그대로(칸 없음)');
}

// ── ⑦ NPC ──────────────────────────────────────────────────────────────────────────────
say('\n⑦ NPC — 존 몸은 먹지 않는다(econ 소유) · 곳간 조사는 보고 표');
{
  ok(/if \(p\.isNpc\) \{ p\.hunger = HUNGER_MAX; p\.thirst = THIRST_MAX; return; \}/.test(ZSRC), '★⑦ 존 NPC 는 허기·갈증 면제 — 몸 틱을 안 돈다 ⇒ 배탈 칸이 안 선다(식량은 econ 소유)');
  ok(!/Body\.sickIntake\(/.test(fs.readFileSync(SV('villages.js'), 'utf8')), '⑦ 마을(villages.js)은 배탈 문을 안 부른다 — econ 곳간은 날짜 없는 총량(보고 ④ 표)');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
