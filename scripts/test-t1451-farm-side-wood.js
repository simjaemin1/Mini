#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1451-farm-side-wood.js — 농부의 한 해: 부업 벌목 · 판 세계 현장(T1451) =====================================
//
// 지키는 것(서버 0 · 몇 초 · 운영 문 그대로 부른다):
//   ① 손잡이 셋 — `T1451_SITES` · `T1451_CREW_FREE` · `T1451_FARM_CALL` — 끔 기본 · `'1'` 만
//   ② 현장 — 나무 몸 행위 층(`T325_WOOD_ACT` · 그 마을 나무 색인 칸 > 0)이면 남는 시간 땔감의 현장이다(켬) · 끔 = 종전(존 사분나무 현장만 — 판에선 빔) ·
//      **나무 색인 칸 0 마을은 켬이어도 현장 아님**(현장 없이 장부만 일함 0) · 채집 몸 갈래는 색인을 안 읽어 채집 행위 층이 켜져도 현장 아님
//   ③ 두 번 셈 0 — 나무 몸 행위 층이 선 마을(식 닫힘)에선 econ 남는 시간 몫(숙련 0 일꾼)이 나무를 안 낸다 · 몸이 벤 것만 곳간에 든다(정본)
//   ④ 밭이 안 부르는 날 — `T1451_FARM_CALL` 켬 · 그날 부름 0 이면 농부 1인 값 0(나눗수 ∞) · 부름 1 · 끔 = 종전 값
//   ⑤ 밭이 부르는 날엔 밭이 먼저 — 남는 시간 문은 '휴식' 앞 자리에서만 불린다(부르는 자리 글자 수 · 농부 아침 창 · 일감 없음 · 반일 · 몫 참 자리)
//   ⑥ 미끼(이 파일 안 · 넷) — ⓐ 색인 칸 0 문 뺌(현장 없이 장부만) → ② 빨강 · ⓑ 식 닫힘 문 뺌 → ③ 빨강(두 번 셈) ·
//                            ⓒ 부름 0 문 뺌 → ④ 빨강 · ⓓ 채집 색인도 현장으로 → ② 빨강
//   날짜 · 벽시계를 쓰지 않는다.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1451 — 농부의 한 해: 부업 벌목 · 판 세계 현장 ===');
const KN = ['T1451_SITES', 'T1451_CREW_FREE', 'T1451_FARM_CALL', 'T1422_SIDE_WORK', 'T325_WOOD_ACT', 'T347_FORAGE_ACT', 'T1243_FARM_ON', 'T1276_FARM_K', 'T1421_FARM_PRICE', 'T1421_FARM_DIV', 'T1408_FARM_VALUE', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'T400_BUILD_ACT'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, { ENABLE_VILLAGES: '0', T400_BUILD_ACT: '0' }, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const run = (env, code) => { try { return kid(env, code); } catch (e) { return { err: String(e).slice(0, 300) }; } };
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
// ── ① ──
const KC = `const V=require('./server/villages'),E=require('./sim/economy-sim');console.log(JSON.stringify({s:V.T1451_SITES,c:V.T1451_CREW_FREE,f:V.T1451_FARM_CALL,e:E.T1451_FARM_CALL}));`;
const K0 = run({}, KC), K1 = run({ T1451_SITES: '1', T1451_CREW_FREE: '1', T1451_FARM_CALL: '1' }, KC), K2 = run({ T1451_SITES: 'yes', T1451_FARM_CALL: 'on' }, KC);
ok(K0.s === false && K0.c === false && K0.f === false && K0.e === false && K1.s && K1.c && K1.f && K1.e && K2.s === false && K2.f === false,
  '① 손잡이 셋 — 끔 기본 · `1` 만 · 농사 값 문은 econ 도 같은 env', JSON.stringify({ K0, K1, K2 }));
// ── ② 현장 ──
//   마을 = econ 정본 마을 · 곳간 나무 0(잉여 ≤ 0 — 땔감이 모자람) · 식량 넉넉 · 존 사분나무 없음(판 세계 그대로) · 나무 색인 칸 = `_t325Cells`
const SIDE = (pre, cells) => `${pre || ''}const V=require('./server/villages'),E=require('./sim/economy-sim');V.__p3Bind({dayMs:250,epoch:0,deps:{dayPhaseRatio:0.7,qtResources:()=>({queryCircle:()=>[]}),t325TreesAtCell:(x,y)=>(${cells}>0&&((x*7+y*3)%${cells||1}===0))?[{type:'tree',x:x*32,y:y*32,id:'t'+x+'_'+y}]:[]}});
const e=E.createVillage({initialPop:8,name:'s',wood:0.6});for(let d=1;d<=3;d++)E.tickVillage(e,d);e.storage.food=1e5;e.storage.wood=0;e._t347Cells=${cells};
const vil={econ:e,ccx:3,ccy:3,_terrSet:new Set(),_farmSet:new Set(),_claim:new Set(),_clearCrew:0,_buildCrew:0,_site:null,_psite:null};const npc={pid:'p1',x:100,y:100,npcHomeX:100,npcHomeY:100,_hd:7};
const T=V.__p3Bind({}).state;const r=V._t1422Probe.side(vil,npc,1000,'farmIdle');const e2=Object.assign({},e);e.storage.wood=1e5;e.storage.food=0;const npc2={pid:'p2',x:100,y:100,_hd:7};const r2=V._t1422Probe.side(vil,npc2,1000,'farmIdle');
console.log(JSON.stringify({r,j:npc._t1422J?npc._t1422J.j:null,act:E.woodActOn(e),fr:r2,fj:npc2._t1422J?npc2._t1422J.j:null,fact:E.forageActOn(e),baitN:globalThis.__baitN}));`;
const ACT = { T1422_SIDE_WORK: '1', T325_WOOD_ACT: '1', T347_FORAGE_ACT: '1' };
const S1 = run({ ...ACT, T1451_SITES: '1' }, SIDE('', 5)), S0 = run(ACT, SIDE('', 5)), Sz = run({ ...ACT, T1451_SITES: '1' }, SIDE('', 0));
const sOk = (on, off, zero) => on.r === true && on.j === 'lumberjack' && on.act === true && off.r === false && zero.r === false && zero.act === false && on.fr === false && on.fact === true;
ok(sOk(S1, S0, Sz), '② 현장 — 나무 색인 칸 5 · 켬 = 남는 시간 땔감(나무꾼 갈래) · 끔 = 쉼(존 사분나무 빔) · 색인 칸 0 = 쉼 · 채집 행위 층이 켜져도 채집은 현장 아님',
  JSON.stringify({ on: [S1.r, S1.j, S1.fr], off: S0.r, zero: Sz.r, err: S1.err || S0.err || Sz.err }));
// ── ③ 두 번 셈 0 ──
const LED = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const run=(act,side)=>{const v=E.createVillage({initialPop:12,name:'s',wood:0.6});if(act){v._world=v._world||{};E.bindProductionActs(v._world);v._t325Cells=5;}for(let d=1;d<=5;d++)E.tickVillage(v,d);if(side)v._t1422Side=side;E.tickVillage(v,6);return {w:v.storage.wood,sp:(v._t1422SP&&v._t1422SP.wood)||0};};
const a0=run(0,null),a1=run(0,{lumberjack:1}),b0=run(1,null),b1=run(1,{lumberjack:1});console.log(JSON.stringify({form:+(a1.w-a0.w).toFixed(6),act:+(b1.w-b0.w).toFixed(6),spA:a1.sp,spB:b1.sp,baitN:globalThis.__baitN}));`;
const L0 = run({ T1422_SIDE_WORK: '1', T325_WOOD_ACT: '1' }, LED());
const lOk = (r) => !r.err && r.form > 0 && r.act === 0 && r.spB === 0;
ok(lOk(L0), '③ 두 번 셈 0 — 식 세계(몸 행위 층 안 묶임)는 남는 시간 몫이 나무를 낸다 · 나무 몸 행위 층이 묶인 세계는 나무꾼 식이 닫혀 남는 시간 몫 0(몸이 벤 것만 정본)', JSON.stringify(L0));
// ── ④ 밭이 안 부르는 날 ──
const FC = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const v={_t1276H:365*6,_t1276Stand:0,_t1421LabD:100,storage:{},dailyProductionBuf:{fish:3},_allocDay:0,counts:{farmer:4,fisher:2}};
const W={fish:1,meat:2,vegetable:1};const ctx={period:1,counts:{farmer:4,fisher:2},w:(r)=>W[r]!=null?W[r]:1};
const val=(c)=>{const x=Object.assign({},v,{_t1451Call:c});const r=E.allocRealCandidates(x,{day:7},[['farmer',11],['fisher',22]],ctx);const f=r&&r.find(q=>q[0]==='farmer');return f?f[1]:null;};
console.log(JSON.stringify({c0:val(0),c1:val(1),cu:val(undefined),baitN:globalThis.__baitN}));`;
const FARM = { T1243_FARM_ON: '1', T1276_FARM_K: '1', T1421_FARM_PRICE: 'mix', T1421_FARM_DIV: 'labor' };
const F1 = run({ ...FARM, T1451_FARM_CALL: '1' }, FC()), F0 = run(FARM, FC());
const fOk = (on, off) => !on.err && on.c0 === 0 && on.c1 > 0 && on.cu === on.c1 && off.c0 === off.c1 && off.c1 === on.c1;
ok(fOk(F1, F0), '④ 밭이 안 부르는 날 — 켬 · 부름 0 = 농부 값 0 · 부름 1 · 칸 없음 = 종전 값 · 끔 = 부름과 무관', JSON.stringify({ on: F1, off: F0 }));
// ── ⑤ 밭이 부르는 날엔 밭이 먼저 ──
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const calls = (VS.match(/_t1422Side\(vil, npc, now, '/g) || []).length, whys = [...VS.matchAll(/_t1422Side\(vil, npc, now, '(\w+)'\)/g)].map((m) => m[1]);
const tick = VS.slice(VS.indexOf('function npcLifeTick(npc, now) {'));
const iWin = tick.indexOf("if (dayFrac > SCH_FARMW_R && npc._fOutD !== bday) { if (_t1422Side(vil, npc, now, 'farmW')) return true; _lifeGoHome(npc, '휴식'); return true; }"), iCell = tick.indexOf('const k2 = _lifeNextFarmCell(vil, npc, _farmDay(vil, day));'), iIdle = tick.indexOf("if (_t1422Side(vil, npc, now, 'farmIdle')) return true;");
ok(calls === 8 && new Set(whys).size === 5 && [...new Set(whys)].every((w) => ['half', 'farmW', 'farmIdle', 'quota', 'none'].includes(w)) && iWin > 0 && iCell > 0 && iIdle > iCell,
  '⑤ 남는 시간 문은 \'휴식\' 앞 자리에서만(여덟 자리 · 까닭 다섯) · 밭 일감 문(`_lifeNextFarmCell`)이 먼저 · 그 뒤 일감 없음에서만', JSON.stringify({ calls, whys: [...new Set(whys)], iWin, iCell, iIdle }));
// ── ⑥ 미끼 ──
const pa = BAIT('server/villages.js', "(T1451_SITES && j === 'lumberjack' && E.woodActOn(e));", "(T1451_SITES && j === 'lumberjack');");
const Ba1 = run({ ...ACT, T1451_SITES: '1' }, SIDE(pa, 5)), Ba0 = run(ACT, SIDE(pa, 5)), Baz = run({ ...ACT, T1451_SITES: '1' }, SIDE(pa, 0));
ok(Ba1.baitN === 1 && !Ba1.err && !sOk(Ba1, Ba0, Baz), '⑥ 미끼 ⓐ — 바꾼 자리 1곳(색인 칸 문 뺌 — 현장 없이 장부만)인 villages 사본은 ② 빨강', JSON.stringify({ zero: Baz.r, baitN: Ba1.baitN }));
const Bb = run({ T1422_SIDE_WORK: '1', T325_WOOD_ACT: '1' }, LED(BAIT('sim/economy-sim.js', '      if (productionFormulaOff(v, npc.currentJob)) return;   // T1180: 부산물·현장 0 폴백도 수식 생산이다', '      ')));
ok(Bb.baitN === 1 && !Bb.err && !lOk(Bb), '⑥ 미끼 ⓑ — 바꾼 자리 1곳(식 닫힘 문 뺌)인 econ 사본은 ③ 빨강(몸 · 식 두 번 셈)', JSON.stringify(Bb));
const Bc1 = run({ ...FARM, T1451_FARM_CALL: '1' }, FC(BAIT('sim/economy-sim.js', '  if (!t1451CallMul(v)) return Infinity;', '')));
ok(Bc1.baitN === 1 && !Bc1.err && !fOk(Bc1, F0), '⑥ 미끼 ⓒ — 바꾼 자리 1곳(부름 0 문 뺌)인 econ 사본은 ④ 빨강', JSON.stringify(Bc1));
const pd = BAIT('server/villages.js', "(T1451_SITES && j === 'lumberjack' && E.woodActOn(e));", "(T1451_SITES && ((j === 'lumberjack' && E.woodActOn(e)) || (j === 'forager' && E.forageActOn(e))));");
const Bd1 = run({ ...ACT, T1451_SITES: '1' }, SIDE(pd, 5));
ok(Bd1.baitN === 1 && !Bd1.err && !sOk(Bd1, S0, Sz), '⑥ 미끼 ⓓ — 바꾼 자리 1곳(채집 색인도 현장 — 채집 몸 갈래는 색인을 안 읽는다)인 villages 사본은 ② 빨강', JSON.stringify({ fr: Bd1.fr, fj: Bd1.fj, baitN: Bd1.baitN }));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
