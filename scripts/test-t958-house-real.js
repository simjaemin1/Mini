#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t958-house-real.js — 집 행위 마을 econ 주거는 크루가 지은 침상까지만 [T958] ======================
//
// ★왜 [T946 회부 2 → T958] 집 짓는 마을(`buildActOn` — 서버가 `_t400Live` 를 심은 마을)은 econ 주거의 목재 상한이 `Infinity` 다(차감은 크루).
//   그래서 econ 주거가 크루가 지은 집(맵 침상 `_mapBeds`)과 따로 오른다(보고 T958 ①). 손잡이 `T958_HOUSE_REAL`(★[T974] 켬 기본 · 되돌림 `=0` = 종전 글자 · ★[T966] 끔 기본이던 글자 `=== '1'`)이
//   하루 증축을 `min(여유노동 몫, 지은 침상 − 주거)` 로 묶고, 그날 올리고 싶었던 몫을 `_t958Want` 에 적는다(집터 방아쇠가 읽는다).
//
// 재는 것:
//   ① 술어 — econ `T958_HOUSE_REAL` 는 `!(… === '0')`(★[T974] 켬 기본) · env 를 읽는 자리 하나 · 내보냄 · 서버는 방아쇠 한 줄에서만 그 값과 `_t958Want` 를 읽는다
//   ② 한 마을 하루(가짜 마을 · 존 안 띄움 · 아이 판 — 켬 = env 없음(기본) · 그 밖 값 `=1` · 끔 = `=0`): 인구 20 · 주거 20 · 목재 0 · 침상 24
//      ⓐ 켬 — 주거가 오르되 24 를 못 넘는다(스무 날) · 그날 올리고 싶은 몫 > 0 · 목재 차감 0(크루 몫)
//      ⓑ ★자명 통과 금지 — 끔(`=0` — 되돌림) 판은 같은 자로 주거가 24 를 **넘는다**(결함이 실제로 보인다) · `_t958Want` 없음
//      ⓒ 집 행위가 아닌 마을(`_t400Live` 없음)은 켬 · 끔 같은 값(종전 목재 상한 — 목재 0 이면 0)
//   ④ [T966] 계획 주거 `_t958Plan` = 끔 세계 주거 궤적 · 나무꾼 안전망 · 영토 목표 두 줄이 켬이면 그 칸을 읽는다
//   ③ 방아쇠 — `houseSiteWant` 는 인구 ≤ 주거 ≤ 침상(= 지은 칸 × 칸당 침상)이면 **안 선다**(그래서 올리고 싶은 몫을 더해 읽는다) ·
//      주거 + 올리고 싶은 몫이 침상을 넘으면 선다 · 끔(+ 0)은 종전 인수 그대로
//
// 실행: node scripts/test-t958-house-real.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T958_SUB === '1') {
  const _l = console.log; console.log = () => {};
  const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  if (econ.setSeed) econ.setSeed(1);
  const lp = { fertility: 1.2, arable: 1, water: 0.8, wood: 0.67, game: 0.74, stone: 1.0, ore: 0.1, size: 400, baseSize: 400, woodSustain: 12.61, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, coastal: false };
  const runOne = (live) => {
    const v = econ.createVillage({ ...lp, name: '시험농촌', initialPop: 20 });
    v.housing = 20; v.storage.wood = 0; v.storage.food = 5000;
    if (live) { v._t400Live = true; v._mapBeds = 24; }
    const hs = [], wants = [], wood = [], plans = [];
    for (let d = 1; d <= 20; d++) { econ.tickVillage(v, d); hs.push(+v.housing.toFixed(6)); wants.push(v._t958Want === undefined ? null : +v._t958Want.toFixed(6)); wood.push(+(v.storage.wood || 0).toFixed(6)); plans.push(v._t958Plan === undefined ? null : +v._t958Plan.toFixed(6)); }
    return { hs, wants, wood, plans, max: Math.max(...hs), n: v.npcs.length };
  };
  const out = { on: econ.T958_HOUSE_REAL, live: runOne(true), dead: runOne(false) };
  console.log = _l; console.log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const VSRC = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');

console.log('① 술어');
ok(/const T958_HOUSE_REAL = !\(typeof process !== 'undefined' && process\.env && process\.env\.T958_HOUSE_REAL === '0'\);/.test(SRC), '`T958_HOUSE_REAL` 는 `!(… === \'0\')` — ★[T974] 켬 기본 · 되돌림 `0` 하나(랩 · 브라우저 빈 env 도 켬)');
ok((SRC.match(/process\.env\.T958_HOUSE_REAL/g) || []).length === 1, 'env 를 읽는 자리 하나(econ 모듈 머리)', (SRC.match(/process\.env\.T958_HOUSE_REAL/g) || []).length);
ok(/^\s+T958_HOUSE_REAL,/m.test(SRC), 'econ 이 내보낸다(서버 방아쇠가 읽는다)');
ok(!/process\.env\.T958_HOUSE_REAL/.test(VSRC), '서버는 env 를 안 읽는다(econ 값 하나)');
{
  const lines = VSRC.split('\n').filter((l) => /_t958Want/.test(l) && !/^\s*\/\//.test(l));
  ok(lines.length === 1 && /houseSiteWant\(vil\.econ\.npcs\.length, vil\.econ\.housing \+ \(\(_lifeEcon\(\)\.T958_HOUSE_REAL && vil\.econ\._t958Want > 0\) \? vil\.econ\._t958Want : 0\)/.test(lines[0]),
    '`_t958Want` 를 읽는 자리는 집터 방아쇠 한 줄 — 주거 + 그날 올리고 싶었던 몫(끔 · 없음 = + 0)', `${lines.length}줄`);
}
ok(/const _t958 = T958_HOUSE_REAL && buildActOn\(v\) && v\._mapBeds !== undefined;/.test(SRC), '닿는 마을 = 집 행위 마을 ∧ 지은 침상을 아는 판(그 밖 = 종전)');
ok(/if \(_t958\) \{ v\._t958Want = built; built = Math\.min\(built, Math\.max\(0, v\._mapBeds - v\.housing\)\); \}/.test(SRC), '증축 = min(여유노동 몫, 지은 침상 − 주거) · 올리고 싶은 몫을 적는다');

console.log('② 한 마을 스무 날(아이 판 둘)');
const sub = (env) => { const E = { ...process.env, T958_SUB: '1' }; delete E.T958_HOUSE_REAL; Object.assign(E, env);   // ★[T974] env 없음 = 바깥 env 를 안 물려받는 미설정(기본)
  return JSON.parse(execFileSync(process.execPath, [__filename], { env: E, encoding: 'utf8' }).trim().split('\n').pop()); };
const on = sub({}), off = sub({ T958_HOUSE_REAL: '0' }), on1 = sub({ T958_HOUSE_REAL: '1' });
ok(on.on === true && off.on === false, '아이 판 손잡이 — env 없음 = 켬(★[T974] 기본) · `=0` = 끔(되돌림)', `${on.on} · ${off.on}`);
ok(on1.on === true && JSON.stringify(on1.live) === JSON.stringify(on.live) && JSON.stringify(on1.dead) === JSON.stringify(on.dead), '그 밖 값(`=1`)도 켬 — 기본 판과 같은 값(끄는 값은 `0` 하나)', `${on1.on}`);
ok(on.live.max <= 24 + 1e-9 && on.live.max > 20, 'ⓐ 켬 — 주거가 오르되 지은 침상 24 를 못 넘는다', `최대 ${on.live.max}`);
ok(on.live.wants.some((x) => x > 0), 'ⓐ 켬 — 그날 올리고 싶었던 몫 > 0 이 적힌다(방아쇠가 읽는다)', `${on.live.wants.filter((x) => x > 0).length}/20날`);
ok(on.live.wood.every((x) => x === 0), 'ⓐ 켬 — econ 이 목재를 안 뺀다(크루 몫 · 목재 0 에서 시작해 0 그대로)');
ok(off.live.max > 24 + 1e-6, 'ⓑ ★끔(`=0` — 되돌림)은 같은 마을 주거가 24 를 넘는다(목재 0 인데 — 결함이 보인다)', `최대 ${off.live.max}`);
ok(off.live.wants.every((x) => x === null), 'ⓑ 끔 — `_t958Want` 를 안 적는다(종전 글자)');
ok(JSON.stringify(on.dead) === JSON.stringify(off.dead), 'ⓒ 집 행위가 아닌 마을은 켬 · 끔 같은 값(종전 목재 상한)', `주거 ${on.dead.max}`);
ok(on.dead.max <= 20 + 1e-9 && on.dead.wants.every((x) => x === null), 'ⓒ 그 마을은 목재 0 이면 안 오르고 `_t958Want` 도 없다');

console.log('④ [T966] 계획 주거 — 주거를 "앞으로 지을 집"으로 읽던 두 자리');
ok(JSON.stringify(on.live.plans) === JSON.stringify(off.live.hs), '켬의 계획 주거(`_t958Plan`)는 끔 세계 주거 궤적과 같은 값이다(같은 노후 · 같은 houseDayBuild · 새 수 0)', `끝 ${on.live.plans[19]} = ${off.live.hs[19]}`);
ok(off.live.plans.every((x) => x === null) && on.dead.plans.every((x) => x === null), '끔 · 집 행위 아닌 마을은 그 칸이 없다(종전)');
ok(/: \(T958_HOUSE_REAL && v\._t958Plan !== undefined\) \? v\._t958Plan : v\.housing;   \/\/ ★\[T966\]/.test(SRC) && /const _hPick = T1046_WOOD_SHARE\n/.test(SRC) && /N >= _hPick \* 0\.95 && \(v\.storage\.wood \|\| 0\) < N \* 2/.test(SRC) && !/N >= v\.housing \* 0\.95/.test(SRC),
  '나무꾼 안전망은 켬이면 계획 주거를 읽는다(끔 = 주거 그대로 · 옛 글자 `N >= v.housing * 0.95` 는 남지 않는다 · ★[T1046] 그 갈래는 `T1046_WOOD_SHARE` 끔(기본)일 때 — `=1` 이면 출생 문 상한)');
{
  const tl = VSRC.split('\n').filter((l) => /territoryTarget\(/.test(l) && !/^\s*\/\//.test(l));
  ok(tl.length === 2 && tl.every((l) => /territoryTarget\(land\.size, _t966TerrHousing\(vil\.econ\)\)/.test(l)), '서버 영토 목표 두 줄은 `_t966TerrHousing` 하나를 읽는다', `${tl.length}줄`);
  ok(/function _t966TerrHousing\(e\) \{ return \(e && _lifeEcon\(\)\.T958_HOUSE_REAL && e\._t958Plan !== undefined\) \? e\._t958Plan : \(\(e && e\.housing\) \|\| 0\); \}/.test(VSRC), '그 함수 = 켬 ∧ 계획 칸이면 계획 · 그 밖 = econ 주거(종전 값)');
}

console.log('③ 집터 방아쇠');
const VL = require(path.join(ROOT, 'server', 'village-layout'));
const CAP = VL.HOUSE_CAP_PER_FLOOR;
ok(!VL.houseSiteWant(24, 24, 24 / CAP, 0) && !VL.houseSiteWant(20, 22, 24 / CAP, 0), '인구 ≤ 주거 ≤ 침상이면 집터가 안 선다(주거를 침상에 묶기만 하면 영영 안 선다)', `칸당 침상 ${CAP}`);
ok(VL.houseSiteWant(24, 24 + 1.44, 24 / CAP, 0), '주거 + 올리고 싶은 몫이 침상을 넘으면 선다');
ok(!VL.houseSiteWant(20, 20 + 1.2, 24 / CAP, 0), '빈 침상이 남았으면(주거 + 몫 ≤ 침상) 안 선다 — 지은 집부터 채운다');

console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
