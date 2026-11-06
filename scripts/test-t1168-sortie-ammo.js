#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-t1168-sortie-ammo.js — 출격 승산이 몸의 탄을 본다(T1168 카드 감 K5 · 손잡이 `T1168_SORTIE_AMMO` · 켬 기본 · 되돌림 `=0`) ==========
//
// ★왜 [T771 회부 3 · 판정대기 K5 · 추상 없애기 캐논] 방어 몸(궁수)이 화살을 다 쏜 뒤에도 출격 승산이 76 ~ 81% 로 날마다 출격을 정했다
//   (war-core `_opDefOdds` 는 병력만 본다) — 탄 없는 사수는 물러나고 접촉 0 → 대치가 되풀이됐다.
//   고침: 호스트(존)가 교전 몸이 서 있는 전쟁마다 방어 편의 산 몸 · 사수 · 편 탄을 `w._defAmmo` 에 적고(`_t1168WriteAmmo`),
//   war-core 출격 결단이 그 칸으로 방어 유효전력에 탄 몫(`_opAmmoShare`)을 건다 — 화살 0 궁수는 근접 몫(battle-core `mAtk ÷ atk`)만.
//   지키는 것: ⓐ 정적(손잡이 문 · 비율은 battle-core 표 · 새 수 0) · ⓑ 식(칸 없음 = 1 · 탄 가득 = 1 · 화살 0 궁수 = 10/44 · 연속) ·
//             ⓒ war-core 날 틱 — 탄 0 이면 출격이 안 난다 · ★대조(칸 없음 · 탄 가득 · `=0`) = 출격 · ⓓ 호스트 — 교전 몸에서 칸을 적는다 · 교전 없으면 지운다 · `=0` 이면 안 적는다.
// ⚠존을 부팅하지 않는다 — war-core 정본(`daily`)과 호스트 정본(`__p3Bind`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-t1168-sortie-ammo.js
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CW = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'war-core.js'), 'utf8'));
const CV = codeOf(fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'));
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0; const j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };
const near = (a, b, e) => Math.abs(a - b) <= (e || 1e-12);
const knob = (v) => { if (v == null) delete process.env.T1168_SORTIE_AMMO; else process.env.T1168_SORTIE_AMMO = v; };
const K0 = process.env.T1168_SORTIE_AMMO;

console.log('\n=== 출격 승산이 몸의 탄을 본다(T1168 K5) ===');
const WarCore = R('sim/war-core.js'), BC = R('sim/battle-core.js');

console.log('\n[ⓐ] 정적 — 손잡이 문 · 비율 · 새 수 0');
{
  ok(/function _t1168AmmoOn\(\) \{ return typeof process !== 'undefined' && !!process\.env && process\.env\.T1168_SORTIE_AMMO !== '0'; \}/.test(CW), "ⓐ 손잡이 하나 — `T1168_SORTIE_AMMO !== '0'`(켬 기본 · 되돌림 `=0`)");
  const sh = fnBody(CW, '_opAmmoShare');
  ok(/BattleCore\.UNITS/.test(sh) && /BattleCore\.ARROWS_PER/.test(sh) && /BattleCore\.STONES_PER/.test(sh) && /D\.mAtk \|\| 0\) \/ D\.atk/.test(sh), 'ⓐ 비율 = battle-core 병종 표(근접 몫 `mAtk ÷ atk` · 한 사람 탄 `ARROWS_PER` · `STONES_PER`)');
  const lit = sh.replace(/BattleCore\.(ARROWS_PER|STONES_PER) \|\| \d+/g, '').match(/[^\w.'](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/g);
  ok(!lit, 'ⓐ 새 수 0 — 0 · 1 과 battle-core 기본값 자리만', lit ? lit.join(' ') : '');
  const dd = fnBody(CW, '_opDefenseDaily');
  ok(/_opDefOdds\(w\.def, w\.force \|\| 0, _t1168AmmoOn\(\) \? w\._defAmmo : null\)/.test(dd), 'ⓐ 출격 결단만 탄을 본다(태세 · 항복 · 위협은 종전 — 칸을 안 넘긴다)');
  ok((CW.match(/w\._defAmmo/g) || []).length === 1, 'ⓐ war-core 가 칸을 읽는 자리 하나(출격 결단)');
  const wa = fnBody(CV, '_t1168WriteAmmo');
  ok(/state\.war\.daily\(state\.world\.day\)/.test(CV) && CV.indexOf('_t1168WriteAmmo(); state.war.daily(state.world.day)') > 0 && /u\.side !== 'B'/.test(wa) && /sd\.arrows/.test(wa) && /sd\.stones/.test(wa),
    'ⓐ 호스트 — war-core 날 결단 바로 앞에 방어 편(B) 몸 · 편 탄을 적는다');
}

console.log('\n[ⓑ] 식 — `_opAmmoShare`');
{
  const S = WarCore._opAmmoShare, U = BC.UNITS, mA = U.archer.mAtk / U.archer.atk, mS = U.slinger.mAtk / U.slinger.atk;
  ok(S(null) === 1 && S(undefined) === 1 && S({ n: 0 }) === 1, 'ⓑ 칸 없음 · 몸 0 = 1(종전 승산)');
  ok(S({ n: 1, archer: 1, arrows: BC.ARROWS_PER }) === 1 && S({ n: 3, archer: 2, arrows: 2 * BC.ARROWS_PER, slinger: 1, stones: BC.STONES_PER }) === 1, 'ⓑ 탄 가득 = 1');
  ok(near(S({ n: 1, archer: 1, arrows: 0 }), mA), 'ⓑ ★화살 0 궁수 하나 = 근접 몫만(' + U.archer.mAtk + ' ÷ ' + U.archer.atk + ')', S({ n: 1, archer: 1, arrows: 0 }).toFixed(4));
  ok(near(S({ n: 4, archer: 1, arrows: 0 }), 1 - (1 - mA) / 4), 'ⓑ 넷 중 궁수 하나 화살 0 = 그 하나의 원거리 몫만 빠진다', S({ n: 4, archer: 1, arrows: 0 }).toFixed(4));
  ok(near(S({ n: 1, archer: 1, arrows: BC.ARROWS_PER / 2 }), mA + (1 - mA) / 2), 'ⓑ 반 남은 화살 = 반만(연속 — 스위치 0)');
  ok(near(S({ n: 2, slinger: 1, stones: 0, archer: 1, arrows: 0 }), 1 - ((1 - mA) + (1 - mS)) / 2), 'ⓑ 투석병도 같은 식(돌)');
  ok(S({ n: 2, archer: 1, arrows: 999 }) === 1, 'ⓑ 탄이 한 사람 몫보다 많아도 1 을 안 넘는다');
}

console.log('\n[ⓒ] war-core 날 틱 — 탄 0 이면 출격 결단이 안 난다');
const econ = R('sim/economy-sim.js');
function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const _origRandom = Math.random;
function mkCamp(force, ammo) {
  Math.random = seeded(11);
  const mk = (name, pop) => { const e = econ.createVillage({ fertility: 1, water: 1, stone: 1.2, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: pop, name }); e.storage.weapon = 40; e.storage.stone = 400; return e; };
  const atk = { name: '공격A', econ: mk('공격A', 60) }, def = { name: '방어B', econ: mk('방어B', 40) };
  Math.random = _origRandom;
  def._defPolicy = 'respond';
  const logs = [], engages = [];
  const world = { day: 400, seed: 7, _warWars: [], _warTributes: [], _warSeq: 2 };
  const war = WarCore.createWar({ villages: [atk, def], world, seed: 7, infoRange: 5000, centerOf: (v) => ({ cx: v === atk ? 0 : 200, cy: 0 }), territoryOf: () => 2800,
    log: (day, m) => logs.push('D' + day + ' ' + m), onEngage: (w, day, why) => { engages.push([day, why]); w.phase = 'battle'; return true; } });
  const w = { id: 1, atk, def, casus: 'feud', force, warriors: 1, composition: { dagger: force }, weapQ: 0.5, phase: 'march', op: 'camp', eta: 399, marchDays: 1, born: 398, _arriveDay: 399, _packDays: 12, _packRem: 12, _opPolicy: 'siege' };
  if (ammo) w._defAmmo = ammo;
  war.WARS.push(w);
  return { war, w, logs, engages, def };
}
const sortied = (K) => K.logs.some((x) => /출격\(sortie\) 결단/.test(x)) && K.engages.some((e) => e[1] === 'sortie');
{
  knob(null);
  const empty = { n: 1, archer: 1, arrows: 0 }, full = { n: 1, archer: 1, arrows: BC.ARROWS_PER };
  //   공격 병력 F 를 골라 — 칸 없음이면 출격 승산이 출격 문턱 위 · 화살 0 궁수 칸이면 문턱 밑(그 판의 수로 고른다 · 새 수 0)
  let F = null, p0 = 0, p1 = 0;
  for (let f = 2; f <= 400 && F == null; f++) {
    const K = mkCamp(f); const a = WarCore._opDefOdds(K.def, f), b = WarCore._opDefOdds(K.def, f, empty);
    if (a >= WarCore.WAR_SORTIE_ODDS && b < Math.min(WarCore.WAR_SORTIE_ODDS, 0.42)) { F = f; p0 = a; p1 = b; }
  }
  ok(F != null, 'ⓒ 판 — 칸 없음 출격 승산 ≥ 문턱 · 화살 0 궁수 칸이면 문턱 밑인 공격 병력이 있다', `F ${F} · 승산 ${(p0 * 100).toFixed(1)}% → ${(p1 * 100).toFixed(1)}% · 문턱 ${WarCore.WAR_SORTIE_ODDS}`);
  if (F != null) {
    const A = mkCamp(F); A.war.daily(400);
    ok(sortied(A), 'ⓒ ★대조 — 칸 없음(랩 · 헤드리스 · 교전 전): 출격(종전)', A.logs.filter((x) => /출격|태세/.test(x)).join(' | '));
    const B = mkCamp(F, full); B.war.daily(400);
    ok(sortied(B), 'ⓒ ★대조 — 탄 가득: 출격(칸이 있어도 승산 그대로)', B.logs.filter((x) => /출격|태세/.test(x)).join(' | '));
    const C = mkCamp(F, empty); C.war.daily(400);
    ok(!sortied(C) && C.w.phase === 'march', 'ⓒ ★화살 0 궁수 — 출격이 안 난다 · 그날 공격 쪽 결단이 돈다(T771 교착의 꼴이 풀린다)', C.logs.join(' | '));
    knob('0'); const D = mkCamp(F, empty); D.war.daily(400); knob(null);
    ok(sortied(D), 'ⓒ ★끔(`=0`) — 칸이 있어도 출격(종전 글자)', D.logs.filter((x) => /출격|태세/.test(x)).join(' | '));
  }
}

console.log('\n[ⓓ] 호스트 — `_t1168WriteAmmo`(교전 몸 → 칸)');
{
  const V = R('server/villages.js');
  const mkBody = (units, B) => ({ w: { id: 9 }, fight: { ctx: { sides: { A: {}, B }, units } } });
  const run = (bodies, k) => { knob(k); const H = V.__p3Bind({ warBodies: new Map(bodies.map((b, i) => [i, b])), warCore: WarCore, war: {} }); H._t1168WriteAmmo(); knob(K0 == null ? null : K0); return bodies.map((b) => b.w._defAmmo || null); };
  const U = [{ side: 'B', type: 'archer', hp: 40 }, { side: 'B', type: 'slinger', hp: 30 }, { side: 'B', type: 'spear', hp: 90 }, { side: 'B', type: 'archer', hp: 0, _dead: 1 }, { side: 'A', type: 'archer', hp: 50 }];
  const [a] = run([mkBody(U, { arrows: 3, stones: 0 })], null);
  ok(a && a.n === 3 && a.archer === 1 && a.slinger === 1 && a.arrows === 3 && a.stones === 0, 'ⓓ 기본(켬) — 방어 편 산 몸만(죽은 몸 · 공격 편 밖) · 사수 수 · 편 탄', JSON.stringify(a));
  const nb = mkBody(U, { arrows: 3 }); nb.w._defAmmo = { n: 1 }; nb.fight = null;
  const [b] = run([nb], null);
  ok(b === null, 'ⓓ 교전이 없으면 칸을 지운다(= 종전 승산)', JSON.stringify(b));
  const ob = mkBody(U, { arrows: 0 }); ob.w._defAmmo = { n: 1, archer: 1, arrows: 0 };
  const [c] = run([ob], '0');
  ok(c === null, 'ⓓ ★끔(`=0`) — 칸을 안 적고 남은 칸도 지운다', JSON.stringify(c));
  const [d] = run([mkBody([{ side: 'B', type: 'archer', hp: 0, _dead: 1 }], { arrows: 0 })], null);
  ok(d === null, 'ⓓ 방어 편 산 몸 0 — 칸 없음', JSON.stringify(d));
}

knob(K0 == null ? null : K0);
console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
