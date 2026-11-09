#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1224-econ-farm.js — T1224: 몸 없는 econ 농부의 하루를 일괄이 한다(손잡이 `T1224_ECON_FARM` · 끔 기본) ======
//   진짜 서버 함수(`villages._lifeHeadlessDay`)를 모의 마을(몸 둘 — 농부 하나 · econ 농부 10)로 부른다 — 손잡이는 모듈 머리에서 읽혀 아이 판으로 잰다.
//   일감 몫은 T1221 켬(`T1221_FARM_LABOR=1` — 일감 = 낮 초)일 때 `_t1221Stat.budgetS` 가 그날 일괄이 받은 몫을 그대로 센다(빈 밭이라 쓰지는 않는다).
//   ① 끔(기본) — 명부 = 몸 농부 1 · 몫 = 1 × 낮 초 · 몸 없는 농부 셈 0
//   ② 켬 · 일괄 갈래(존 잠) — 명부 = 몸 농부 1 + 몸 없는 농부 9 = econ 농부 10 · 몫 = 10 × 낮 초
//   ③ 켬 · 몸 갈래(존 깸 · T1212 ② 켬) — 몸이 오늘 한 일 0 이면 몫 = (몸 1 + 몸 없는 9) × 낮 초 · 몸이 낮 하루를 다 했으면 몫 = 9 × 낮 초(몸 몫은 몸이 했다)
//   ④ 몸이 econ 보다 많은 날(몸 농부 ≥ econ 농부) — 몸 없는 농부 0 · 켬 = 끔 몫
//   ⑤ 글자 — 종전 줄(`if (_body && T1212_FARM_REST) {` · `if (!_body) _lifeClearDay(vil, farmerN);` · `lifeFarmDay(vil, _farmDay(vil, day), farmerN)`) 그대로
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const sub = (env, js) => {
  const e = Object.assign({}, process.env, { T1221_FARM_LABOR: '1', ENABLE_VILLAGES: '0' }, env); delete e.NODE_OPTIONS;
  if (env.T1224_ECON_FARM == null) delete e.T1224_ECON_FARM;
  return JSON.parse(execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 }).trim().split('\n').pop());
};
//   몸 둘(a 농부 · b 나무꾼) · econ 농부 econF · 빈 밭(`_farmSet` 빈 Set — 일감을 받기만 하고 쓸 칸이 없다) · 존 깸 = awake
const probe = (econF, awake, did) => `
const V=require('./server/villages');
const pl=new Map([['a',{pid:'a',simJob:'farmer',_t1212N:${did}}],['b',{pid:'b',simJob:'woodcutter'}]]);
const B=V.__p3Bind({deps:{players:pl,zoneAwake:()=>${awake}},dayMs:0});
const vil={dbId:1,name:'가',npcPids:['a','b'],econ:{counts:{farmer:${econF},woodcutter:5},npcs:new Array(${econF}+5).fill(0).map(()=>({}))},_farmSet:new Set(),_crop:new Map()};
const b0=B._t1221Stat.budgetS;B._lifeHeadlessDay(vil);
console.log(JSON.stringify({on:B.T1224_ECON_FARM,dayS:B._t1221DayS(),bud:B._t1221Stat.budgetS-b0,st:Object.assign({},B._t1224Stat),rest:Object.assign({},B._t1212Rest)}));`;
console.log('\n=== T1224 몸 없는 econ 농부의 하루 ===');
const off = sub({}, probe(10, false, 0));
ok(off.on === false && off.st.vilDays === 0 && off.st.ghost === 0, '① 끔 기본 — 몸 없는 농부 셈 0', off.st);
ok(off.bud === off.dayS, '① 끔 — 일괄 몫 = 몸 농부 1 × 낮 초', { bud: off.bud, dayS: off.dayS });
const on = sub({ T1224_ECON_FARM: '1' }, probe(10, false, 0));
ok(on.on === true && on.st.ghost === 9 && on.st.batch === 1, '② 켬 · 일괄 갈래 — 몸 없는 농부 9(econ 10 − 몸 1)', on.st);
ok(Math.abs(on.bud - 10 * on.dayS) < 1e-6, '② 켬 · 일괄 갈래 — 몫 = econ 농부 10 × 낮 초', { bud: on.bud, want: 10 * on.dayS });
const w0 = sub({ T1224_ECON_FARM: '1', T368_FARM_ACT: '1' }, probe(10, true, 0));
ok(w0.st.body === 1 && w0.rest.farmers === 1 && Math.abs(w0.bud - 10 * w0.dayS) < 1e-6, '③ 켬 · 몸 갈래 — 몸이 한 일 0 · 몫 = (몸 1 + 몸 없는 9) × 낮 초', { bud: w0.bud, st: w0.st });
const w1 = sub({ T1224_ECON_FARM: '1', T368_FARM_ACT: '1' }, probe(10, true, w0.dayS));   // 몸 a 가 오늘 낮 초를 다 썼다
ok(Math.abs(w1.bud - 9 * w1.dayS) < 1e-6, '③ 켬 · 몸 갈래 — 몸이 낮 하루를 다 했으면 몫 = 몸 없는 9 × 낮 초', { bud: w1.bud, want: 9 * w1.dayS });
const w1off = sub({ T368_FARM_ACT: '1' }, probe(10, true, 0));
ok(Math.abs(w1off.bud - w1off.dayS) < 1e-6 && w1off.st.ghost === 0, '③ 대조 — 끔이면 몸 갈래 몫 = 몸 1 의 못 한 하루뿐(자명 통과 금지)', { bud: w1off.bud });
const few = sub({ T1224_ECON_FARM: '1' }, probe(1, false, 0));
ok(few.st.ghost === 0 && Math.abs(few.bud - few.dayS) < 1e-6, '④ 몸 농부 ≥ econ 농부 — 몸 없는 농부 0 · 켬 = 끔 몫', { st: few.st, bud: few.bud });
const S = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const hb = S.slice(S.indexOf('function _lifeHeadlessDay(vil) {'), S.indexOf('// ★★★[T117 2026-09-05] **하루치 작물 노동 — 정본 하나.**'));
ok(/if \(_body && T1212_FARM_REST && !_cut\) \{/.test(hb) && /if \(!_body && !_cut\) _lifeClearDay\(vil, farmerN\);/.test(hb) && /else if \(!_body\) lifeFarmDay\(vil, _farmDay\(vil, day\), farmerN\);/.test(hb) && /if \(T1224_ECON_FARM && !_cut\) \{/.test(hb),
  '⑤ 종전 줄 그대로 — 몸 갈래 문 · 일괄 개간 · 일괄 작물(새 줄은 `if (T1224_ECON_FARM && !_cut) {` 블록 하나 · T1243 켬 + 라이브면 `_cut` 이 셋 다 걷는다)');
ok((S.match(/process\.env\.T1224_ECON_FARM/g) || []).length === 1 && /const T1224_ECON_FARM = process\.env\.T1224_ECON_FARM === '1';/.test(S), '⑤ 손잡이 읽는 자리 하나 · `=== \'1\'` 만 켬');
console.log(`\n=== T1224 몸 없는 농부: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
