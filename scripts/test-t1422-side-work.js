#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 4   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1422-side-work.js — 남는 시간에 하는 일: 쉬러 가기 전 문 하나(T1422) =====================================
//
// 지키는 것(서버 0 · 몇 초 · 운영 문 그대로 부른다):
//   ① 손잡이 `T1422_SIDE_WORK` — 끔 기본 · `1` = 넷(build · terr · food · wood) · 쉼표 목록 = 그 일만 · 엉뚱한 값 = 끔 · econ 도 같은 env 한 칸
//   ② 할 일이 없으면 종전처럼 쉰다(문이 거짓 · 몸 손 0) · 짓다 만 집터가 있으면 그 집 짓기(반일 징발과 같은 일감) · 그 일을 끈 목록이면 집터가 있어도 쉰다 · 끔 = 늘 거짓
//   ③ "필요시" — 곳간 식량이 사람 × 다음 거둠까지 날(`t1374NeedDays`)보다 넉넉하면 채집에 안 나선다 · 모자라면 채집 · 나무 잉여 ≤ 0 이면 나무(값이 큰 쪽)
//   ④ 장부 — 남는 시간 몫(econ `_t1422Side`)은 곳간에 그 품목으로 든다 · 직업 수 · 여유노동(`_idleFrac`) · 부양력 잠재(`_prodKema`)는 그대로 · 몫 0.5 = 몫 1 의 절반 · 그날 남는 시간 산출(`_t1422SP`)을 실현 배분 접기가 뺀다(글자)
//   ⑤ 몸-ms → 사람-날 — 낮 하나(하루 ms × 낮 몫)를 일한 몸 = 1 사람-날 · econ 틱 앞에 한 번 넘기고 비운다
//   ⑥ 밤 · 요양 · 끼니 문이 먼저다 — `npcLifeTick` 안 문을 부르는 첫 자리가 취침 · 요양 · 아침 끼니 줄보다 뒤(잠 안 자고 일하는 몸 0)
//   ⑦ 미끼(이 파일 안 · 넷) — ⓐ 식량 필요 문 → 늘 참 → ③ 빨강 · ⓑ 잠재 가드 → 늘 참 → ④ 빨강(여유노동이 바뀐다) · ⓒ 몫 곱 뺌 → ④ 빨강 · ⓓ 사람-날 나눗셈 뺌 → ⑤ 빨강
//   날짜 · 벽시계를 쓰지 않는다.
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1422 — 남는 시간에 하는 일(쉬러 가기 전 문 하나) ===');
const KN = ['T1226_JOB_FLEX', 'T1422_SIDE_WORK', 'NODE_OPTIONS', 'ENABLE_VILLAGES', 'T400_BUILD_ACT', 'T1243_FARM_ON'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, { ENABLE_VILLAGES: '0' }, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
// ── ① 손잡이 ──
const KC = `const V=require('./server/villages'),E=require('./sim/economy-sim');console.log(JSON.stringify({v:V.T1422_SIDE_WORK,k:V._t1422Probe.kinds(),e:E.T1422_SIDE_WORK}));`;
let K0 = {}, K1 = {}, K2 = {}, K3 = {};
try { K0 = kid({}, KC); K1 = kid({ T1422_SIDE_WORK: '1' }, KC); K2 = kid({ T1422_SIDE_WORK: 'build,wood' }, KC); K3 = kid({ T1422_SIDE_WORK: 'yes' }, KC); } catch (e) { K0 = { err: String(e).slice(0, 200) }; }
ok(K0.v === false && K0.e === false && K0.k.length === 0 && K1.v === true && K1.k.join() === 'build,terr,food,wood' && K1.e === true && K2.k.join() === 'build,wood' && K3.v === false,
  '① 손잡이 — 끔 기본 · `1` = 넷 · 쉼표 목록 · 엉뚱한 값 = 끔 · econ 같은 env', JSON.stringify({ K0, K1, K2, K3 }));
// ── ② ③ 문 ──
//   마을 = econ 정본 마을(`createVillage`) + 생활층 칸 최소(집터 · 개간 크루 · 밭 셋) · 몸 = 집 앞 좌표 · 오늘 생활 날 `_hd`
const SIDE = (pre, setup) => `${pre || ''}const V=require('./server/villages'),E=require('./sim/economy-sim');const P=V.__p3Bind({dayMs:250,epoch:0,deps:{dayPhaseRatio:0.7}});
const e=E.createVillage({initialPop:8,name:'s',wood:0.6});for(let d=1;d<=3;d++)E.tickVillage(e,d);
const vil={econ:e,_farmSet:new Set(),_claim:new Set(),_clearCrew:0,_buildCrew:0,_site:null,_psite:null};const npc={pid:'p1',x:100,y:100,npcHomeX:100,npcHomeY:100,_hd:7};
${setup}
const r=V._t1422Probe.side(vil,npc,1000,'quota');console.log(JSON.stringify({r,task:npc._lifeTask?npc._lifeTask.k:null,j:npc._t1422J?npc._t1422J.j:null,tfe:E.totalFoodEquivalent(e),need:e.npcs.length*E.t1374NeedDays(e,3),spare:E.woodSpare(e),baitN:globalThis.__baitN}));`;
const PLENTY = `e.storage.food=1e5;e.storage.wood=1e5;`, HUNGRY = `for(const r in e.storage)if(E.totalFoodEquivalent(e)>0)e.storage[r]=0;e.storage.wood=1e5;`, NOWOOD = `e.storage.food=1e5;e.storage.wood=0;`;
let S0 = {}, S1 = {}, S2 = {}, S3 = {}, F1 = {}, F2 = {}, W1 = {};
try {
  S0 = kid({ T400_BUILD_ACT: '0', T1422_SIDE_WORK: '1' }, SIDE('', PLENTY));
  S1 = kid({ T400_BUILD_ACT: '0', T1422_SIDE_WORK: '1' }, SIDE('', PLENTY + 'vil._site={cx:5,cy:5};'));
  S2 = kid({ T400_BUILD_ACT: '0', T1422_SIDE_WORK: 'wood' }, SIDE('', PLENTY + 'vil._site={cx:5,cy:5};'));
  S3 = kid({ T400_BUILD_ACT: '0',}, SIDE('', HUNGRY + 'vil._site={cx:5,cy:5};'));
  F1 = kid({ T1422_SIDE_WORK: 'food' }, SIDE('', PLENTY));
  F2 = kid({ T1422_SIDE_WORK: 'food' }, SIDE('', HUNGRY));
  W1 = kid({ T1422_SIDE_WORK: 'wood' }, SIDE('', NOWOOD));
} catch (e) { S0 = { err: String(e).slice(0, 300) }; }
ok(S0.r === false && S0.task === null && S0.j === null && S1.r === true && S1.task === 'build' && S2.r === false && S3.r === false,
  '② 할 일 없으면 쉰다 · 집터가 있으면 집 짓기 · 그 일을 끈 목록이면 쉰다 · 끔 = 늘 거짓', JSON.stringify({ S0: [S0.r, S0.task], S1: [S1.r, S1.task], S2: S2.r, S3: S3.r, err: S0.err }));
const fOk = (a, b) => a.r === false && a.tfe >= a.need && b.r === true && b.j === 'forager' && b.tfe < b.need;
ok(fOk(F1, F2) && W1.r === true && W1.j === 'lumberjack' && W1.spare <= 0,
  '③ 필요시 — 곳간 식량 ≥ 사람 × 다음 거둠까지 날이면 채집에 안 나선다 · 모자라면 채집 · 나무 잉여 ≤ 0 이면 나무', JSON.stringify({ F1: [F1.r, F1.tfe, F1.need], F2: [F2.r, F2.j, F2.tfe], W1: [W1.r, W1.j, W1.spare] }));
// ── ④ 장부 ──
const LEDGER = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const run=(side)=>{const v=E.createVillage({initialPop:12,name:'s',wood:0.6});for(let d=1;d<=5;d++)E.tickVillage(v,d);if(side)v._t1422Side=side;E.tickVillage(v,6);return {w:v.storage.wood,fr:v.storage.fruit||0,idle:v._idleFrac,pk:v._prodKema,pot:JSON.stringify(v._t1226Pot||null),c:JSON.stringify(v.counts),sp:v._t1422SP||null};};
const a=run(null),b=run({lumberjack:1}),h=run({lumberjack:0.5}),f=run({forager:1});console.log(JSON.stringify({a,b,h,f,baitN:globalThis.__baitN}));`;
const ES = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const ledOk = (L) => L.a && L.b && (L.b.w - L.a.w) > 0 && L.b.c === L.a.c && L.b.idle === L.a.idle && L.f.idle === L.a.idle && L.f.pk === L.a.pk && L.b.pk === L.a.pk && L.a.pot !== 'null' && L.f.pot === L.a.pot && L.b.pot === L.a.pot && (L.f.fr - L.a.fr) > 0
  && Math.abs((L.h.w - L.a.w) / (L.b.w - L.a.w) - 0.5) < 1e-6 && L.b.sp && L.b.sp.wood > 0;
let L0 = {}; try { L0 = kid({ T1422_SIDE_WORK: '1', T1226_JOB_FLEX: '1' }, LEDGER()); } catch (e) { L0 = { err: String(e).slice(0, 300) }; }
ok(ledOk(L0) && /const x = _sp && _sp\[r\] \? Math\.max\(0, \(dp\[r\] \|\| 0\) - _sp\[r\]\) : \(dp\[r\] \|\| 0\);/.test(ES),
  '④ 장부 — 남는 시간 몫은 그 품목으로 곳간에(나무 · 열매) · 직업 수 · 여유노동 · 잠재 산출(`dailyProductionPotential` — prodK · 직업 값 밑변) 그대로 · 몫 0.5 = 절반 · 실현 배분 접기는 뺀다(글자)',
  JSON.stringify({ dw: L0.b && +(L0.b.w - L0.a.w).toFixed(4), half: L0.h && +((L0.h.w - L0.a.w) / (L0.b.w - L0.a.w)).toFixed(4), idle: L0.a && [L0.a.idle, L0.b.idle, L0.f.idle], pk: L0.a && [L0.a.pk, L0.f.pk], err: L0.err }));
// ── ⑤ 몸-ms → 사람-날 ──
const HANDS = (pre) => `${pre || ''}const V=require('./server/villages'),E=require('./sim/economy-sim');V.__p3Bind({dayMs:250,epoch:0,deps:{dayPhaseRatio:0.7}});
const e={npcs:[]};const vil={econ:e,_t1422Ms:{forager:250*0.7*2,lumberjack:250*0.7*0.5}};V._t1422Probe.handsIn(vil);const a=JSON.stringify(e._t1422Side||null);V._t1422Probe.handsIn(vil);
console.log(JSON.stringify({a:JSON.parse(a),left:vil._t1422Ms,baitN:globalThis.__baitN}));`;
let H0 = {}; try { H0 = kid({ T1422_SIDE_WORK: '1' }, HANDS()); } catch (e) { H0 = { err: String(e).slice(0, 300) }; }
const hOk = (r) => r.a && Math.abs(r.a.forager - 2) < 1e-9 && Math.abs(r.a.lumberjack - 0.5) < 1e-9 && r.left === null;
ok(hOk(H0), '⑤ 몸-ms → 사람-날 — 낮 둘 = 2 · 낮 반 = 0.5 · 넘기고 비운다', JSON.stringify(H0));
// ── ⑥ 밤 · 요양 · 끼니 문이 먼저 ──
const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const body = VS.slice(VS.indexOf('function npcLifeTick(npc, now) {'), VS.indexOf('function npcLifeTick(npc, now) {') + 60000);
const iSide = body.indexOf('_t1422Side(vil'), iNight = body.indexOf("_lifeGoHome(npc, '취침'); return true;"), iRest = body.indexOf("_lifeGoHome(npc, '요양'); return true;"), iMeal = body.indexOf('_t1197BodyMeal(vil, npc, 0, now)');
ok(iSide > 0 && iNight > 0 && iRest > 0 && iMeal > 0 && iSide > iNight && iSide > iRest && iSide > iMeal,
  '⑥ 밤 · 요양 · 아침 끼니 문이 먼저 — 남는 시간 문은 그 뒤(잠 안 자고 일하는 몸 0)', JSON.stringify({ iSide, iNight, iRest, iMeal }));
// ── ⑦ 미끼 ──
let Ba = {}, Ba2 = {}; try { const pre = BAIT('server/villages.js', "E.totalFoodEquivalent(e) < N * E.t1374NeedDays(e, (e._world && e._world.day) | 0)", 'true'); Ba = kid({ T1422_SIDE_WORK: 'food' }, SIDE(pre, PLENTY)); Ba2 = kid({ T1422_SIDE_WORK: 'food' }, SIDE(pre, HUNGRY)); } catch (e) { Ba = { err: String(e).slice(0, 200) }; }
ok(Ba.baitN === 1 && !Ba.err && !fOk(Ba, Ba2), '⑦ 미끼 ⓐ — 바꾼 자리 1곳(식량 필요 문 → 늘 참)인 villages 사본은 ③ 빨강', JSON.stringify({ r: Ba.r, j: Ba.j, baitN: Ba.baitN }));
let Bb = {}; try { Bb = kid({ T1422_SIDE_WORK: '1', T1226_JOB_FLEX: '1' }, LEDGER(BAIT('sim/economy-sim.js', '      if (!npc._t1422F) {   // ★[T1422]', '      if (true) {   // ★[T1422]'))); } catch (e) { Bb = { err: String(e).slice(0, 200) }; }
ok(Bb.baitN === 1 && !Bb.err && !ledOk(Bb), '⑦ 미끼 ⓑ — 바꾼 자리 1곳(잠재 · 여유노동 가드 → 늘 참)인 econ 사본은 ④ 빨강', JSON.stringify({ baitN: Bb.baitN, pot: Bb.a && [Bb.a.pot === Bb.f.pot] }));
let Bc = {}; try { Bc = kid({ T1422_SIDE_WORK: '1', T1226_JOB_FLEX: '1' }, LEDGER(BAIT('sim/economy-sim.js', '    if (npc._t1422F) baseAmt *= npc._t1422F;', ''))); } catch (e) { Bc = { err: String(e).slice(0, 200) }; }
ok(Bc.baitN === 1 && !Bc.err && !ledOk(Bc), '⑦ 미끼 ⓒ — 바꾼 자리 1곳(남는 시간 몫 곱 뺌)인 econ 사본은 ④ 빨강', JSON.stringify({ baitN: Bc.baitN, half: Bc.h && Bc.b && +((Bc.h.w - Bc.a.w) / (Bc.b.w - Bc.a.w)).toFixed(4) }));
let Bd = {}; try { Bd = kid({ T1422_SIDE_WORK: '1' }, HANDS(BAIT('server/villages.js', 'const pd = M[j] / dl;', 'const pd = M[j];'))); } catch (e) { Bd = { err: String(e).slice(0, 200) }; }
ok(Bd.baitN === 1 && !Bd.err && !hOk(Bd), '⑦ 미끼 ⓓ — 바꾼 자리 1곳(사람-날 나눗셈 뺌)인 villages 사본은 ⑤ 빨강', JSON.stringify(Bd));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
