#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1444-side-rest.js — 남는 시간에 한 일은 전부 쉬는 시간에서 뺀다(T1444 · 판정 44) =====================================
//
// 지키는 것(서버 0 · 몇 초 · 운영 함수 그대로 부른다):
//   ① 손잡이 값 — `T1422_LEISURE` = 빈 값(끔 판) → 종전 · `T1422_SIDE_WORK` 켬 판 빈 값 → `all` · `idle` → 종전 ㉠ · `side` · `allsite` · 생활층 몸-ms 셈도 같은 값에서만 선다
//   ② 여가에서 뺌 — 여유노동 0.5 · 사람 8 · 그날 남는 시간 일 현장 2 · 걸음 1 사람-날: `all` = 0.5 − 3/8 · `allsite` = 0.5 − 2/8 · `idle` = 0.5 · 칸 없음 = 0.5 · 바닥 0(현장 10 이면 0)
//   ③ 몸-ms → 사람-날 — 낮 둘(현장) · 낮 하나(걸음) → { site 2 · walk 1 } · 몸 틱이 없던 날 = 칸 없음(일괄 장부만 일한 시간 0) · 넘기고 비운다
//   ④ 남는 시간 일만 센다 — 생활층 셈 자리는 남는 시간 일감(`t.side`) · 그날 남는 시간 직업(`_t1422J`) 두 곳뿐(본업 · '귀가' 0 · 글자)
//   ⑤ 행복이 내려간다 — 같은 마을 · 같은 날 `all` 의 행복 < `idle`(여가 항 무게 그대로)
//   ⑦ 보이는 것 — 마을 보기 구성원 판 한 줄(`members.rest` · 칸이 설 때만)
//   ⑥ 미끼(이 파일 안 · 다섯) — ⓐ 뺌 줄 지움 → ② · ⓑ 사람 수 대신 1 로 나눔 → ② · ⓒ 바닥 0 뺌 → ② · ⓓ 일감 표지 문 뺌(본업도 셈) → ④ · ⓔ 몸 틱 없는 날도 칸 → ③
//   날짜 · 벽시계를 쓰지 않는다.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1444 — 남는 시간에 한 일은 쉬는 시간에서 뺀다 ===');
const KN = ['T1422_LEISURE', 'T1422_SIDE_WORK', 'NODE_OPTIONS', 'ENABLE_VILLAGES'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, { ENABLE_VILLAGES: '0' }, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const run = (env, code) => { try { return kid(env, code); } catch (e) { return { err: String(e).slice(0, 300) }; } };
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
// ── ① ──
const KC = `const E=require('./sim/economy-sim'),V=require('./server/villages');console.log(JSON.stringify({e:E.T1422_LEISURE,v:V.T1444_REST}));`;
const K = {}; for (const [n, env] of Object.entries({ off: {}, side: { T1422_SIDE_WORK: '1' }, idle: { T1422_SIDE_WORK: '1', T1422_LEISURE: 'idle' }, s2: { T1422_SIDE_WORK: '1', T1422_LEISURE: 'side' }, site: { T1422_SIDE_WORK: '1', T1422_LEISURE: 'allsite' }, junk: { T1422_SIDE_WORK: '1', T1422_LEISURE: 'yes' } })) K[n] = run(env, KC);
ok(K.off.e === '' && K.off.v === false && K.side.e === 'all' && K.side.v === true && K.idle.e === '' && K.idle.v === false && K.s2.e === 'side' && K.s2.v === false && K.site.e === 'allsite' && K.site.v === true && K.junk.e === '',
  '① 값 — 끔 판 = 종전 · 남는 시간 켬 판 빈 값 = `all` · `idle` = ㉠ · `side` = ㉡ · `allsite` · 엉뚱한 값 = 종전 · 생활층 셈도 같은 값에서만', JSON.stringify(K));
// ── ② 여가에서 뺌 ──
const LS = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const st=(rest)=>{const v=E.createVillage({initialPop:8,name:'s'});E.tickVillage(v,1);v._idleFrac=0.5;v._tradingN=0;v._t1444Rest=rest;const s=E._computeVillageStats(v,v.npcs.length);return {l:s.leisure,h:s.happiness};};
const a=st({site:2,walk:1}),z=st({site:10,walk:0}),n=st(null);console.log(JSON.stringify({a,z,n,baitN:globalThis.__baitN}));`;
const near = (x, y) => Math.abs(x - y) < 1e-9;
const L = {}; for (const [n, v] of Object.entries({ all: 'all', site: 'allsite', idle: 'idle' })) L[n] = run({ T1422_SIDE_WORK: '1', T1422_LEISURE: v }, LS());
const lOk = (R) => !R.all.err && near(R.all.a.l, 0.5 - 3 / 8) && near(R.site.a.l, 0.5 - 2 / 8) && near(R.idle.a.l, 0.5) && near(R.all.n.l, 0.5) && R.all.z.l === 0;
ok(lOk(L), '② 여가에서 뺌 — `all` 0.125 · `allsite` 0.25 · `idle` 0.5 · 칸 없음 0.5 · 바닥 0', JSON.stringify({ all: L.all.a, site: L.site.a && L.site.a.l, idle: L.idle.a && L.idle.a.l, none: L.all.n && L.all.n.l, floor: L.all.z && L.all.z.l, err: L.all.err }));
// ── ③ 몸-ms → 사람-날 ──
const HS = (pre) => `${pre || ''}const V=require('./server/villages');V.__p3Bind({dayMs:250,epoch:0,deps:{dayPhaseRatio:0.7}});
const dl=250*0.7;const vil={econ:{},_t1444Ms:{site:dl*2,walk:dl}};V._t1444Probe.handsIn(vil);const a=vil.econ._t1444Rest,left=vil._t1444Ms;
const vil2={econ:{}};V._t1444Probe.handsIn(vil2);console.log(JSON.stringify({a,left,none:vil2.econ._t1444Rest===undefined?'undef':vil2.econ._t1444Rest,baitN:globalThis.__baitN}));`;
const H0 = run({ T1422_SIDE_WORK: '1' }, HS());
const hOk = (r) => !r.err && r.a && near(r.a.site, 2) && near(r.a.walk, 1) && r.left === null && r.none === null;
ok(hOk(H0), '③ 몸-ms → 사람-날 — 현장 2 · 걸음 1 · 넘기고 비움 · 몸 틱 없는 날 = 칸 없음(장부만 일한 시간 0)', JSON.stringify(H0));
// ── ④ 남는 시간 일만 센다 ──
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const noteCalls = (VS.match(/\) _t1444Note\(vil, npc, now, /g) || []).length;
const seeOk = (src) => /if \(_T1444 && t\.side\) _t1444Note\(vil, npc, now, Math\.hypot\(npc\.x - t\.px, npc\.y - t\.py\) > 44\);/.test(src) && /if \(_T1444 && _t1422J\) _t1444Note\(vil, npc, now, npc\._lifeAct === '출근'\);/.test(src) && (src.match(/\) _t1444Note\(vil, npc, now, /g) || []).length === 2;
ok(seeOk(VS) && /if \(_T1444\) \{ t\.side = 1; npc\._t1444At = now; \}/.test(VS), '④ 남는 시간 일만 센다 — 셈 자리 둘(남는 시간 일감 · 남는 시간 직업) · 일감 표지는 남는 시간 문만 단다(본업 · 귀가 0)', `셈 자리 ${noteCalls}`);
// ── ⑤ 행복 ──
ok(L.all.a && L.idle.a && L.all.a.h < L.idle.a.h, '⑤ 행복이 내려간다 — 같은 마을 · 같은 날 `all` < `idle`', JSON.stringify({ all: L.all.a && L.all.a.h, idle: L.idle.a && L.idle.a.h }));
// ── ⑦ 보이는 것(마을 보기 구성원 판 한 줄) ──
const VV = fs.readFileSync(path.join(ROOT, 'server', 'village-view.js'), 'utf8'), VC = fs.readFileSync(path.join(ROOT, 'public', 'client', '52-v-village-view.js'), 'utf8');
ok(/const R = vil\.econ && vil\.econ\._t1444Rest;\n  if \(R\) out\.rest = \{ site:/.test(VV) && /rest: mem\.rest \? \{/.test(VC) && /if \(M\.rest\) h \+= /.test(VC),
  '⑦ 보이는 것 — 구성원 판에 "어제 남는 시간에 일함 · 쉼" 한 줄(서버는 `_t1444Rest` 칸이 설 때만 `members.rest` · 끔 = 키 없음 · 새 그림 0)', '');
// ── ⑥ 미끼 ──
const NEED = "Math.max(0, _leis - ((_rs.site || 0) + (T1422_LEISURE === 'all' ? (_rs.walk || 0) : 0)) / pop)";
const bait2 = (needle, rep) => { const R = {}; for (const [n, v] of Object.entries({ all: 'all', site: 'allsite', idle: 'idle' })) R[n] = run({ T1422_SIDE_WORK: '1', T1422_LEISURE: v }, LS(BAIT('sim/economy-sim.js', needle, rep))); return R; };
const Ba = bait2(NEED, '_leis');
ok(Ba.all.baitN === 1 && !Ba.all.err && !lOk(Ba), '⑥ 미끼 ⓐ — 바꾼 자리 1곳(뺌 줄 지움 — 일하고도 여가 그대로)인 econ 사본은 ② 빨강', JSON.stringify({ l: Ba.all.a && Ba.all.a.l }));
const Bb = bait2(NEED, "Math.max(0, _leis - ((_rs.site || 0) + (T1422_LEISURE === 'all' ? (_rs.walk || 0) : 0)) / 1)");
ok(Bb.all.baitN === 1 && !Bb.all.err && !lOk(Bb), '⑥ 미끼 ⓑ — 바꾼 자리 1곳(마을 사람 수 대신 일한 몸 하나로 나눔)인 econ 사본은 ② 빨강', JSON.stringify({ l: Bb.all.a && Bb.all.a.l }));
const Bc = bait2(NEED, "(_leis - ((_rs.site || 0) + (T1422_LEISURE === 'all' ? (_rs.walk || 0) : 0)) / pop)");
ok(Bc.all.baitN === 1 && !Bc.all.err && !lOk(Bc), '⑥ 미끼 ⓒ — 바꾼 자리 1곳(바닥 0 뺌 — 여가가 0 아래)인 econ 사본은 ② 빨강', JSON.stringify({ floor: Bc.all.z && Bc.all.z.l }));
const VSd = VS.replace('if (_T1444 && t.side) _t1444Note(', 'if (_T1444) _t1444Note(');
ok(VSd !== VS && !seeOk(VSd), '⑥ 미끼 ⓓ — 바꾼 자리 1곳(일감 표지 문 뺌 — 본업 일감 시간도 뺌)인 글자 사본은 ④ 빨강', '');
const Be = run({ T1422_SIDE_WORK: '1' }, HS(BAIT('server/villages.js', "  if (!M || !(dl > 0)) { vil.econ._t1444Rest = null; return; }", "  if (!M || !(dl > 0)) { vil.econ._t1444Rest = { site: 1, walk: 0 }; return; }")));
ok(Be.baitN === 1 && !Be.err && !hOk(Be), '⑥ 미끼 ⓔ — 바꾼 자리 1곳(몸 틱 없는 날도 칸 — 장부만 일한 시간을 뺌)인 villages 사본은 ③ 빨강', JSON.stringify(Be));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
