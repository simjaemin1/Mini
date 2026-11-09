#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1212-farm-clock.js — 판 자 결함 둘: 생활층 밭 달력 = econ 날 · 몸이 못 한 밭 몫은 일괄이(T1212) ==================
//
// 지키는 것:
//   ① `T1212_LIFE_CAL` ★[T1223] 켬 기본(미설정 · `1` · 그 밖 값) = econ 날(`econDayToMs` 의 역 — world.day + (생활 날 − 앵커)) · 끔(`0`) = 종전 — 밭 날 = 생활 날 그대로
//      ★자명 통과 금지: 생활 날 70억(판 자) · 290만(운영) 둘 다에서 켬 = econ 날 · 달력이 3월에 서지 않는다(2³¹ 넘는 날)
//   ② 이어받기 — 켠 뒤 처음 만지는 마을의 밭 칸 날 셋(p · td · w)에서 그 차를 한 번 뺀다(나이 · 물때 그대로) · 표식 `_t1212Cal` ·
//      끈 판이 표식 선 마을을 만나면 다시 더하고 표식을 뗀다(왕복 = 원래 값) · 표식은 T740 곁 칸이다
//   ③ 몸 XOR 일괄 — `T1212_FARM_REST` 켬(기본)이면 몸 갈래에서도 일괄이 몸이 못 한 몫(Σ max(0, 정본 하루 − 한 일))을 · 개간은 아무것도 못 한 농부 수만큼 ·
//      끄면 종전(몸 갈래면 두 절 다 안 돈다) · 몸이 한 일은 칸 처리 · 개간 칸에서만 센다
//
// 실행: node scripts/test-t1212-farm-clock.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const sub = (env, code) => {
  const e = Object.assign({}, process.env); delete e.NODE_OPTIONS; delete e.T1212_LIFE_CAL; delete e.T1212_FARM_REST;
  Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop());
};
console.log('\n=== T1212 — 생활층 밭 달력 = econ 날 · 몸이 못 한 밭 몫 ===');
const S = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
// ── ① 밭 날 ──
const DAY = `const V=require('./server/villages');const C=require('./server/crops');const o={};
for(const [L,E] of [[7068902409,10],[2903155,400]]){const B=V.__p3Bind({world:{day:E},lastGameDay:L});o[L]={on:B.T1212_LIFE_CAL,fd:B._farmDay(null,L),mo:C.monthOf(B._farmDay(null,L)),moE:C.monthOf(E),moL:C.monthOf(L)};}
console.log(JSON.stringify(o));`;
const d0 = sub({}, DAY), dz = sub({ T1212_LIFE_CAL: '0' }, DAY), dx = sub({ T1212_LIFE_CAL: 'yes' }, DAY), d1 = sub({ T1212_LIFE_CAL: '1' }, DAY);
ok(d0[7068902409].on && !dz[7068902409].on && dx[7068902409].on && d1[7068902409].on, '① ★[T1223] 켬 기본 — 미설정 · `1` · 그 밖 값 = 켬 · `0` = 끔');
ok(dz[7068902409].fd === 7068902409 && dz[2903155].fd === 2903155, '① 끔(`0`) — 밭 날 = 생활 날 그대로(종전)');
ok(d0[7068902409].fd === 10 && d0[2903155].fd === 400, '① ★[T1223] 미설정(기본) = 켬과 같은 밭 날', `${d0[7068902409].fd} · ${d0[2903155].fd}`);
ok(d1[7068902409].fd === 10 && d1[2903155].fd === 400, '① 켬 — 밭 날 = econ 날(판 자 70억 · 운영 290만 둘 다)', `${d1[7068902409].fd} · ${d1[2903155].fd}`);
ok(dz[7068902409].moL === 3 && d1[2903155].mo === d1[2903155].moE && d1[7068902409].mo === d1[7068902409].moE, '① ★자명 통과 금지 — 끔이면 판 자 생활 날의 달이 3월(2³¹ 넘는 날) · 켬이면 econ 날의 달', `끔 ${dz[7068902409].moL}월 · 켬 econ 400날 ${d1[2903155].mo}월`);
// ── ② 이어받기 ──
const MIG = (vilJson) => `const V=require('./server/villages');const B=V.__p3Bind({world:{day:10},lastGameDay:1000});
const vil=${vilJson};vil._crop=new Map(vil._crop);const fd=B._farmDay(vil,1000);
console.log(JSON.stringify({fd,cal:vil._t1212Cal===undefined?null:vil._t1212Cal,crop:[...vil._crop]}));`;
const vil0 = { _crop: [['3,4', { c: 'rice', p: 950, td: 990, w: 995, wd: 2, ps: 0, q: 0.8 }], ['5,6', { c: 'millet', p: 980, td: 980, w: 980, wd: 0, ps: 1, q: 1 }]] };
const m1 = sub({ T1212_LIFE_CAL: '1' }, MIG(JSON.stringify(vil0)));
const e1 = m1.crop[0][1];
ok(m1.cal === 990 && e1.p === -40 && e1.td === 0 && e1.w === 5 && e1.wd === 2 && e1.q === 0.8, '② 켬 — 밭 칸 날 셋에서 차(990)를 한 번 빼고 표식 · 그 밖 칸(wd · ps · q)은 그대로', JSON.stringify(e1));
ok(1000 - 950 === m1.fd - e1.p && 1000 - 995 === m1.fd - e1.w, '② 나이 · 물때가 그대로(오늘 − 심은 날 · 오늘 − 물 댄 날)');
const m2 = sub({ T1212_LIFE_CAL: '1' }, MIG(JSON.stringify({ _crop: m1.crop, _t1212Cal: 990 })));
ok(m2.crop[0][1].p === -40, '② 표식 선 마을은 다시 빼지 않는다(한 번만)');
const m3 = sub({ T1212_LIFE_CAL: '0' }, MIG(JSON.stringify({ _crop: m1.crop, _t1212Cal: 990 })));   // ★[T1223] 끈 판 = `=0`(미설정은 이제 켬)
ok(m3.cal === null && JSON.stringify(m3.crop) === JSON.stringify(vil0._crop), '② 끈 판이 표식 선 마을을 만나면 되돌린다(왕복 = 원래 값 · 표식 뗌)');
ok(/'_granPend',[^\n]*\n\s*'_t1212Cal'\];/.test(S), '② 표식은 T740 곁 칸(다시 떠도 한 번만 옮긴다)');
// ── ③ 몸 XOR 일괄 ──
const R = sub({}, `const V=require('./server/villages');const B=V.__p3Bind({});console.log(JSON.stringify({rest:B.T1212_FARM_REST}));`);
const R0 = sub({ T1212_FARM_REST: '0' }, `const V=require('./server/villages');const B=V.__p3Bind({});console.log(JSON.stringify({rest:B.T1212_FARM_REST}));`);
ok(R.rest === true && R0.rest === false, '③ `T1212_FARM_REST` 켬 기본 · `0` 끔');
const hb = S.slice(S.indexOf('function _lifeHeadlessDay(vil) {'), S.indexOf('// ★★★[T117 2026-09-05] **하루치 작물 노동 — 정본 하나.**'));
ok(/if \(_body && T1212_FARM_REST && !_cut\) \{/.test(hb) && /_restB \+= Math\.max\(0, per - did\);/.test(hb) && /if \(!did\) \{ _restN\+\+;/.test(hb) && /_lifeClearDay\(vil, _restN\)/.test(hb), '③ 몸 갈래 — 작물 = Σ max(0, 정본 하루 − 한 일) · 개간 = 아무것도 못 한 농부 수');
ok(/const per = _t1221On\(\) \? _t1221DayS\(\) : _lifeTasksPerFarmerDay\(\);/.test(hb) && !/_t561Fit\(p\)/.test(hb), '③ 정본 하루 = `_lifeTasksPerFarmerDay`(배수 0) · 명부 = 종전 일괄 농부 명부(몸 칸 거르기 0 — T1215 보강)');
ok(/if \(!_body && !_cut\) _lifeClearDay\(vil, farmerN\);/.test(hb) && /if \(!_body\) lifeFarmDay\(vil, _farmDay\(vil, day\), farmerN\);/.test(hb), '③ 몸 갈래가 아니면 종전 두 절 그대로(밭 날만 ① · T1243 켬 + 라이브면 걷음 — `_cut`)');
ok(/const _ok = _lifeDoTask\(vil, npc, k, _fd\);\s*if \(_ok\) _t1212Note\(npc, _L \? _c : 1\);/.test(S) && /const _fd = _farmDay\(vil, day\)/.test(S) && /if \(npc\.simJob === 'farmer'\) _t1212Note\(npc, _t1221On\(\) \? _t1221ClearS\(\) : 1\);/.test(S), '③ 몸이 한 일 = 칸 처리 · 개간 칸에서만 센다');
ok(/let budget = \(budget0 != null\) \? Math\.max\(0, _L \? \+budget0 : \(budget0 \| 0\)\) : Math\.max\(0, farmerN \| 0\) \* \(_L \? _t1221DayS\(\) : _lifeTasksPerFarmerDay\(\)\);/.test(S), '③ `lifeFarmDay` 일감 몫(안 주면 종전 식)');
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
