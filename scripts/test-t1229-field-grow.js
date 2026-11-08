#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1229-field-grow.js — T1229: 밭 넓이 = 일손 한도(손잡이 `T1229_FIELD_GROW` · 끔 기본) ======
//   진짜 서버 함수(`villages._lifeNeedClear` → `_t1229Need`)를 모의 마을로 부른다 — 손잡이는 모듈 머리에서 읽혀 아이 판으로 잰다.
//   ① 끔(기본) — 종전 목표(밭 칸 < 인구 × landNeedPer)만 본다 · 덮음 · 일손 셈 0
//   ② 켬 — 덮음 < 1 · 일손 모자란 날 없음 · 프론티어 있음 = 개간 문이 열린다(밭 칸이 종전 목표를 넘어도)
//   ③ 켬 — 덮음 ≥ 1(지난 창 밭 식량 ≥ 사람-날)이면 닫힌다
//   ④ 켬 — 지난 365날 안에 일손이 모자란 날이 있으면 닫힌다 · 365날 지나면 다시 열린다
//   ⑤ 켬 — 곳간 120일치 글럿 정지는 그대로(종전 문)
//   ⑥ 켬 — 프론티어가 비면 닫히고 `blocked` 로 센다(영토가 막음)
//   ⑦ 글자 — `lifeFarmDay` 의 두 자리(몫이 다 된 break · 시간 모자란 continue)가 일손 모자람을 적는다 · 손잡이 읽는 자리 하나
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined ? '  ' + JSON.stringify(x) : '')); };
const sub = (env, js) => {
  const e = Object.assign({}, process.env, { ENABLE_VILLAGES: '0' }, env); delete e.NODE_OPTIONS;
  if (env.T1229_FIELD_GROW == null) delete e.T1229_FIELD_GROW;
  return JSON.parse(execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 }).trim().split('\n').pop());
};
//   마을: 사람 10 · 밭 칸 200(종전 목표 120 남짓을 넘는다) · 잠재 칸 하나(프론티어) · 곳간 식량 food · 밭 식량 누계는 날마다 perDay 씩
//   steps = [[날, 그날 밭 식량 누계 증가, 일손 모자람 표시?], …] 를 차례로 부르고 마지막 날의 답을 낸다
const probe = (o) => `
const V=require('./server/villages');const world={day:0};
const B=V.__p3Bind({world,deps:{players:new Map()}});
const farm=new Set();for(let i=0;i<${o.cells == null ? 200 : o.cells};i++)farm.add((1000+i)+',5000');
const pot=new Set(${o.pot === false ? '[]' : "['999,5000']"});
const vil={dbId:1,name:'가',ccx:0,ccy:0,econ:{npcs:new Array(10).fill(0).map(()=>({})),storage:{food:${o.food || 0}},land:{fertility:0.55},_t368FoodTot:0},
  _farmSet:farm,_potSet:pot,_terrSet:new Set(),_houseCells:[],_granList:[],_site:null,_frontier:null,_frontDay:-1};
let ans=null;
for(const [d,df,short] of ${JSON.stringify(o.steps)}){world.day=d;vil.econ._t368FoodTot+=df;vil._frontier=null;if(short)B._t1229Short(vil,d);ans=V.__labProbe._clearProbe.needClear(vil);}
console.log(JSON.stringify({on:B.T1229_FIELD_GROW,ans,st:Object.assign({},B._t1229Stat),cov:vil._t1229?vil._t1229.cov:null}));`;
// 날마다 부르는 판(0 ~ D) — 밭 식량은 하루 perDay
const days = (D, perDay, shortAt) => { const a = []; for (let d = 0; d <= D; d++) a.push([d, perDay, shortAt != null && d === shortAt]); return a; };
console.log('\n=== T1229 밭 넓이 = 일손 한도 ===');
const off = sub({}, probe({ steps: days(40, 2) }));
ok(off.on === false && off.ans === false && off.st.days === 0, '① 끔 기본 — 밭 200 칸 ≥ 종전 목표(사람 10 × 12) 라 닫힌다 · T1229 셈 0', off);
const offLow = sub({}, probe({ cells: 5, steps: days(40, 2) }));
ok(offLow.ans === true, '① 끔 — 밭이 종전 목표 밑이면 종전대로 열린다(자명 통과 금지)', offLow.ans);
const on = sub({ T1229_FIELD_GROW: '1' }, probe({ steps: days(40, 2) }));
ok(on.on === true && on.ans === true && on.cov < 1 && on.st.open > 0, '② 켬 — 덮음 < 1(하루 밭 식량 2 ÷ 사람 10) · 일손 모자람 없음 = 밭 200 칸에서도 열린다', { ans: on.ans, cov: on.cov, st: on.st });
const full = sub({ T1229_FIELD_GROW: '1' }, probe({ steps: days(40, 12) }));
ok(full.ans === false && full.cov >= 1 && full.st.covStop > 0, '③ 켬 — 덮음 ≥ 1(하루 밭 식량 12 ≥ 사람 10)이면 닫힌다', { ans: full.ans, cov: full.cov });
const sh = sub({ T1229_FIELD_GROW: '1' }, probe({ steps: days(100, 2, 50) }));
ok(sh.ans === false && sh.st.laborStop > 0 && sh.st.shortDays === 1, '④ 켬 — 50날에 일손이 모자랐으면 100날엔 닫힌다', { ans: sh.ans, st: sh.st });
const sh2 = sub({ T1229_FIELD_GROW: '1' }, probe({ steps: days(420, 2, 50) }));
ok(sh2.ans === true, '④ 켬 — 365날이 지나면(420날) 다시 열린다', sh2.ans);
const glut = sub({ T1229_FIELD_GROW: '1' }, probe({ food: 10 * 121, steps: days(40, 2) }));
ok(glut.ans === false && glut.st.days === 0, '⑤ 켬 — 곳간 식량 > 사람 × 120 이면 종전 문이 먼저 닫는다', glut);
const blk = sub({ T1229_FIELD_GROW: '1' }, probe({ pot: false, steps: days(40, 2) }));
ok(blk.ans === false && blk.st.blocked > 0, '⑥ 켬 — 프론티어가 비면 닫히고 `blocked` 로 센다', blk.st);
const S = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const fd = S.slice(S.indexOf('function lifeFarmDay('), S.indexOf('// ★★[T1144 ① 2026-11-04'));
ok(/if \(budget <= 0\) \{ if \(T1229_FIELD_GROW && _cellTask\(vil, k, day\) > 0\) _t1229Short\(vil, day\); break; \}/.test(fd)
  && /if \(_L && _c > budget\) \{ if \(T1229_FIELD_GROW\) _t1229Short\(vil, day\); continue; \}/.test(fd), '⑦ `lifeFarmDay` 두 자리가 일손 모자람을 적는다(끔 = 종전 break · continue)');
ok((S.match(/process\.env\.T1229_FIELD_GROW/g) || []).length === 1 && /const T1229_FIELD_GROW = process\.env\.T1229_FIELD_GROW === '1';/.test(S), '⑦ 손잡이 읽는 자리 하나 · `=== \'1\'` 만 켬');
console.log(`\n=== T1229 밭 넓이: 통과 ${pass} · 실패 ${fail} ===`);
process.exit(fail ? 1 : 0);
