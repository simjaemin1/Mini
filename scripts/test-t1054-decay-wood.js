#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1054-decay-wood.js — 집 행위 마을의 노후 메움도 곳간 목재를 쓴다 [T1054] ======================
//
// ★왜 [T1047 ② → T1054 · PM "짓는 것은 목재가 든다 · 같은 규칙"] T958 마을(집 행위 · 지은 침상 — 서버 · 랩 T1050)은 econ 주거가 침상까지만 오르고
//   목재 상한이 `Infinity` 라, 노후(`HOUSE_DECAY`)로 닳은 주거가 침상 밑에서 **목재 없이** 다시 찼다(서버 첫해 노후 메움 3,095 · 목재 0).
//   손잡이 `T1054_DECAY_WOOD`(★끔 기본 — 켬 기본 후보였으나 판 자 띠에서 첫해 기근이 커져 회부 · 켜는 값 `'1'`): 틈 = 새 침상(크루가 냈다 — 목재 없이) + 닳은 몫(`_t1054Wear` — 수리 · 곳간 목재 × econ 단가).
//
// 재는 것(econ 만 · 존 안 띄움 · 아이 판 — 켬 = `=1` · 끔 = env 없음(기본)):
//   ① 술어 — `=== '1'`(끔 기본) · env 읽는 자리 하나 · 내보냄 · 수리 단가 = `_HW`(= `houseCostPerCap('wood')` — 랩 econ 이 쓰는 그 값) · 새 수 0
//   ② 수리만(주거 = 침상 · 목재 100 · 60날): ⓐ 켬 — 목재가 줄고 그 줄어든 양 = 수리한 주거 × 단가 · 주거는 침상을 못 넘는다
//      ⓑ ★자명 통과 금지 — 끔(기본)은 같은 마을 목재가 100 그대로(결함이 보인다) · 주거는 같은 자리로 다시 찬다
//   ③ 새 침상(주거 < 침상 · 목재 0): 켬 — 크루가 낸 새 침상 몫은 목재 없이 찬다(주거가 오른다) · 닳은 몫은 목재가 없어 못 고친다(`_t1054Wear` > 0 · 끔보다 주거가 낮다)
//      그 뒤 목재를 넣으면 그 닳은 몫을 고친다(목재가 준다 · 주거가 끔 판 값에 닿는다)
//   ④ 집 행위가 아닌 마을(`_t400Live` 없음)은 켬 · 끔 같은 값(종전 — 이미 노후 메움에 목재를 낸다) · `_t1054Wear` 칸 없음
//
// 실행: node scripts/test-t1054-decay-wood.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

if (process.env.T1054_SUB === '1') {
  const _l = console.log; console.log = () => {};
  const econ = require(path.join(ROOT, 'sim', 'economy-sim'));
  if (econ.setSeed) econ.setSeed(1);
  const lp = { fertility: 1.2, arable: 1, water: 0.8, wood: 0, game: 0.74, stone: 1.0, ore: 0.1, size: 400, baseSize: 400, woodSustain: 0, fishSustain: null,
    forageSustain: 9.87, marginalQ: 0.497, coastal: false };
  // 곳간 목재가 **집 줄**로만 움직이게: 숲 0(`land.wood` · `woodSustain` 0 — 나무꾼 산출 0) · 땔감은 잔가지로 덮는다(하급 연료가 먼저 탄다)
  const mk = (pop, housing, beds, wood, live) => {
    const v = econ.createVillage({ ...lp, name: '시험마을', initialPop: pop });
    v.housing = housing; v.storage.wood = wood; v.storage.food = 50000; v.storage.twig = 1e6;
    if (live) { v._t400Live = true; v._mapBeds = beds; }
    return v;
  };
  const run = (v, days, d0) => { const hs = [], wood = [], wear = []; for (let d = d0; d < d0 + days; d++) { econ.tickVillage(v, d); hs.push(+v.housing.toFixed(6)); wood.push(+(v.storage.wood || 0).toFixed(6)); wear.push(v._t1054Wear === undefined ? null : +v._t1054Wear.toFixed(6)); } return { hs, wood, wear, beds: v._mapBeds, n: v.npcs.length }; };
  // ② 수리만 — 주거 = 침상 = 20 · 인구 22(목표 25.3 > 침상 — 증축 절이 돈다)
  const rep = (() => { const v = mk(22, 20, 20, 100, true); const r = run(v, 60, 1); r.consWood = (v._consDay && v._consDay.wood) || 0; return r; })();
  // ③ 새 침상 — 주거 20 · 침상 26 · 목재 0 · 40날 → 목재 60 넣고 40날
  const nb = (() => { const v = mk(24, 20, 26, 0, true); const a = run(v, 40, 1); v.storage.wood = (v.storage.wood || 0) + 60; const b = run(v, 40, 41); return { a, b }; })();
  // ④ 집 행위 아닌 마을
  const dead = run(mk(22, 20, 20, 100, false), 30, 1);
  const out = { on: econ.T1054_DECAY_WOOD, price: econ.houseCostPerCap('wood'), DECAY: (() => { const m = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8').match(/const HOUSE_DECAY = ([0-9.]+);/); return m ? +m[1] : null; })(), rep, nb, dead };
  console.log = _l; console.log(JSON.stringify(out));
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SRC = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
console.log('\n=== 집 행위 마을의 노후 메움도 곳간 목재를 쓴다 (T1054) ===\n');
console.log('① 술어');
ok(/const T1054_DECAY_WOOD = \(typeof process !== 'undefined' && process\.env && process\.env\.T1054_DECAY_WOOD === '1'\);/.test(SRC), '`T1054_DECAY_WOOD` 는 `=== \'1\'` — 끔 기본(회부 · 켜는 값 \'1\' · 끔 = 종전 바이트)');
ok((SRC.match(/process\.env\.T1054_DECAY_WOOD/g) || []).length === 1, 'env 를 읽는 자리 하나(econ 모듈 머리)');
ok(/^\s+T400_BUILD_ACT, T1054_DECAY_WOOD,/m.test(SRC), 'econ 이 내보낸다');
ok(/const _t1054 = _t958 && T1054_DECAY_WOOD;/.test(SRC), '닿는 마을 = T958 마을(집 행위 ∧ 지은 침상) 뿐');
ok(/v\._t1054Wear = Math\.min\(\(v\._t1054Wear \|\| 0\) \+ _h0 \* HOUSE_DECAY, Math\.max\(0, v\._mapBeds - v\.housing\)\);/.test(SRC), '닳은 몫 = 어제 몫 + 그날 노후분(`HOUSE_DECAY`) · 틈을 넘지 않는다 — 새 수 0');
ok(/const _rep = Math\.max\(0, built - _t1054Free\);/.test(SRC) && /_rep \* _HW/.test(SRC), '수리 단가 = `_HW`(econ 주거 단가 `houseCostPerCap(\'wood\')` — 랩 econ 이 쓰는 그 값)');

const sub = (env) => { const E = { ...process.env, T1054_SUB: '1' }; delete E.T1054_DECAY_WOOD; Object.assign(E, env);
  return JSON.parse(execFileSync(process.execPath, [__filename], { env: E, encoding: 'utf8' }).trim().split('\n').pop()); };
const on = sub({ T1054_DECAY_WOOD: '1' }), off = sub({});
ok(on.on === true && off.on === false, '아이 판 손잡이 — `=1` = 켬 · env 없음 = 끔(기본)', `${on.on} · ${off.on}`);

console.log('② 수리만(주거 = 침상 20 · 목재 100 · 60날)');
const r = on.rep, ro = off.rep;
const spent = 100 - r.wood[r.wood.length - 1];
const repaired = (() => { let h = 20, s = 0; for (const x of r.hs) { const dec = h * on.DECAY; s += Math.max(0, x - h * (1 - on.DECAY)); h = x; void dec; } return s; })();
ok(spent > 0 && Math.abs(spent - repaired * on.price) < 1e-6, 'ⓐ 켬 — 곳간 목재가 준다 · 준 양 = 다시 찬 주거 × econ 단가', `목재 −${spent.toFixed(4)} · 수리 ${repaired.toFixed(4)} × ${on.price.toFixed(4)}`);
ok(Math.max(...r.hs) <= 20 + 1e-9 && r.hs[r.hs.length - 1] > 20 - 1e-6 * 0 - 0.05, 'ⓐ 켬 — 주거는 침상 20 을 못 넘고 목재가 있는 동안 침상 자리를 지킨다', `끝 ${r.hs[r.hs.length - 1]}`);
ok(ro.wood.every((x) => x === 100), 'ⓑ ★끔(기본) — 같은 마을 곳간 목재가 100 그대로(노후 메움이 목재 없이 — 결함이 보인다)', `끝 ${ro.wood[ro.wood.length - 1]}`);
ok(JSON.stringify(ro.hs) === JSON.stringify(r.hs), 'ⓑ 목재가 넉넉하면 주거 궤적은 켬 · 끔 같다(바뀌는 것은 목재뿐)');
ok(ro.wear.every((x) => x === null), 'ⓑ 끔 — `_t1054Wear` 칸이 안 선다(종전 글자)');

console.log('③ 새 침상(주거 20 · 침상 26 · 목재 0 → 40날 뒤 목재 60)');
const A = on.nb.a, Ao = off.nb.a, Bn = on.nb.b, Bo = off.nb.b;
ok(A.hs[A.hs.length - 1] > 24 && A.wood.every((x) => x === 0), '켬 — 크루가 낸 새 침상 몫은 목재 없이 찬다(주거가 오른다 · 목재 0 그대로)', `40날 주거 ${A.hs[A.hs.length - 1]}`);
ok(A.wear[A.wear.length - 1] > 0 && A.hs[A.hs.length - 1] < Ao.hs[Ao.hs.length - 1] - 1e-6, '켬 — 닳은 몫은 목재가 없어 못 고친다(닳은 몫 > 0 · 끔보다 주거가 낮다)', `닳음 ${A.wear[A.wear.length - 1]} · 켬 ${A.hs[A.hs.length - 1]} ↔ 끔 ${Ao.hs[Ao.hs.length - 1]}`);
ok(Bn.wood[Bn.wood.length - 1] < 60 && Bn.wear[Bn.wear.length - 1] < A.wear[A.wear.length - 1] && Math.abs(Bn.hs[Bn.hs.length - 1] - Bo.hs[Bo.hs.length - 1]) < 1e-6,
  '켬 — 목재를 넣으면 닳은 몫을 고친다(목재가 준다 · 주거가 끔 판 값에 닿는다)', `목재 ${Bn.wood[Bn.wood.length - 1].toFixed(3)} · 주거 ${Bn.hs[Bn.hs.length - 1]} ↔ 끔 ${Bo.hs[Bo.hs.length - 1]}`);
ok(Math.max(...A.hs, ...Bn.hs) <= 26 + 1e-9, '켬 — 주거는 침상 26 을 못 넘는다');

console.log('④ 집 행위가 아닌 마을');
ok(JSON.stringify(on.dead) === JSON.stringify(off.dead) && on.dead.wear.every((x) => x === null), '켬 · 끔 같은 값 · `_t1054Wear` 칸 없음(종전 — 이미 노후 메움에 목재를 낸다)', `주거 끝 ${on.dead.hs[on.dead.hs.length - 1]}`);

console.log(`\n=== 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
