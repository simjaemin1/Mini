#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1408-farm-4000.js — 밭 세계를 사천 명으로 — 다음 거둠 날의 날 축 · 밭 일의 값 · 첫 곳간(T1408) =====================================
//
// 지키는 것(서버 0 · 몇 초):
//   ① 손잡이 셋 — `T1408_HARV_AXIS` · `T1408_SEED_NEXT`(villages) · `T1408_FARM_VALUE`(econ · 밭 세계 + T1276 켬 안에서만) — 끔 기본 · `'1'` 만
//   ② 다음 거둠 날의 날 축 — 판 시계처럼 생활층 날(`gameDayOf` — 기점부터 센 날)이 70억인 판에서 밭 날(econ 날 10 · 조 심은 날 0):
//      켬 = econ 이 읽는 다음 거둠까지 날 수가 한 해 안(< 400) · 끔 = 종전(70억 — 자명 통과 금지 앵커)
//   ③ 밭 일의 값 — 실현 배분(`allocRealCandidates`)에서 농부 1인 값 = 밭 흐름(`t1276FieldFlow`) ÷ 농부 × 값 × 창(켬) · 끔 = 폴백(그 자리 종전 값)
//      · 기근 블록의 농부 칸도 같은 흐름을 읽는 줄이 있다(글자)
//   ④ 첫 곳간 — `_t1408SeedNext` 는 모자란 몫만 얹는다(곳간 ≥ 사람 × 첫 거둠까지 날이면 0)
//   ⑤ 미끼(이 파일 안 · 둘) — ⓐ villages 날 축 줄(`T1408_HARV_AXIS ? _farmDay(vil, day) : day`)을 `day` 로 → ② 켬 빨강
//                            ⓑ econ 농부 값 줄의 밭 흐름(`t1276FieldFlow(v) / n`)을 `0` 으로 → ③ 켬 빨강
//   날짜 · 벽시계를 쓰지 않는다(판 시계 날 수만).
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1408 — 밭 세계를 사천 명으로(날 축 · 밭 일의 값 · 첫 곳간) ===');
const KN = ['T1408_HARV_AXIS', 'T1408_SEED_NEXT', 'T1408_FARM_VALUE', 'T1243_FARM_ON', 'T1276_FARM_K', 'T1374_BIRTH_HARV', 'T1374_FAMINE_HARV', 'NODE_OPTIONS', 'ENABLE_VILLAGES'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, { ENABLE_VILLAGES: '0' }, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const BAIT = (file, needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),${JSON.stringify(file)});globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
// ── ① 손잡이 ──
const KC = `const V=require('./server/villages'),E=require('./sim/economy-sim');console.log(JSON.stringify({a:V.T1408_HARV_AXIS,s:V.T1408_SEED_NEXT,f:E.T1408_FARM_VALUE}));`;
const FW = { T1243_FARM_ON: '1', T1276_FARM_K: '1' };
let K0 = {}, K1 = {}, K2 = {}, K3 = {};
try { K0 = kid(FW, KC); K1 = kid({ ...FW, T1408_HARV_AXIS: '1', T1408_SEED_NEXT: '1', T1408_FARM_VALUE: '1' }, KC); K2 = kid({ T1408_FARM_VALUE: '1' }, KC); K3 = kid({ ...FW, T1408_HARV_AXIS: 'yes', T1408_FARM_VALUE: 'on' }, KC); } catch (e) { K0 = { err: String(e).slice(0, 200) }; }
ok(K0.a === false && K0.s === false && K0.f === false && K1.a === true && K1.s === true && K1.f === true && K2.f === false && K3.a === false && K3.f === false,
  '① 손잡이 셋 — 끔 기본 · `1` 만 · 밭 값은 밭 세계 + T1276 켬 안에서만', JSON.stringify({ K0, K1, K2, K3 }));
// ── ② 날 축 ──
const AX = (pre) => `${pre || ''}const V=require('./server/villages'),S=V.__p3Bind({}).state;
S.dayMs=250;S.epoch=0;S.tickCtx={now:1767225600000+10*250};S.world={day:10};S.lastGameDay=Math.floor(S.tickCtx.now/250);
const vil={econ:{},_crop:new Map([['1,1',{c:'foxtail_millet',p:0}]]),_farmSet:new Set(['1,1']),_drySet:new Set(['1,1'])};
const nx=V._t1408Probe.next(vil);console.log(JSON.stringify({need:nx-10,baitN:globalThis.__baitN}));`;
const AXE = { T1243_FARM_ON: '1', T1374_BIRTH_HARV: '1' };
let A0 = {}, A1 = {};
try { A0 = kid(AXE, AX()); A1 = kid({ ...AXE, T1408_HARV_AXIS: '1' }, AX()); } catch (e) { A0 = A1 = { err: String(e).slice(0, 200) }; }
const axOk = (r) => r.need > 0 && r.need < 400;
ok(axOk(A1) && A0.need > 1e6, '② 다음 거둠 날 — 켬 = 밭 날 축(한 해 안) · 끔 = 생활층 날 축(70억 날 — 종전)', JSON.stringify({ off: A0, on: A1 }));
// ── ③ 밭 일의 값 ──
const FV = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const v={_t1276H:365*6,_t1276Stand:0,dailyProductionBuf:{fish:3},_allocDay:0,counts:{farmer:4,fisher:2}};
const cands=[['farmer',11],['fisher',22]];const ctx={period:100,counts:{farmer:4,fisher:2},w:()=>1};
const r=E.allocRealCandidates(v,{day:7},cands,ctx);console.log(JSON.stringify({r,flow:E.t1276FieldFlow?E.t1276FieldFlow(v):null,baitN:globalThis.__baitN}));`;
let F0 = {}, F1 = {};
try { F0 = kid(FW, FV()); F1 = kid({ ...FW, T1408_FARM_VALUE: '1' }, FV()); } catch (e) { F0 = F1 = { err: String(e).slice(0, 200) }; }
const farmOf = (r) => { const x = r && r.r && r.r.find((c) => c[0] === 'farmer'); return x ? x[1] : null; };
const fvOk = (r) => Math.abs(farmOf(r) - 6 / 4 * 100) < 1e-9;
const ES = require('fs').readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
ok(fvOk(F1) && farmOf(F0) === 11 && /if \(T1408_FARM_VALUE && \(counts\.farmer \|\| 0\) > 0\) for \(const o of foodOpts\) if \(o\[0\] === 'farmer'\) o\[1\] = t1276FieldFlow\(v\) \/ counts\.farmer;/.test(ES),
  '③ 밭 일의 값 — 켬 = 밭 흐름 6/날 ÷ 농부 4 × 값 1 × 창 100 = 150 · 끔 = 폴백 11 · 기근 블록도 같은 흐름 줄', JSON.stringify({ off: farmOf(F0), on: farmOf(F1), flow: F1.flow }));
// ── ④ 첫 곳간 ──
const SD = `const V=require('./server/villages'),S=V.__p3Bind({}).state,E=require('./sim/economy-sim');S.world={day:0};
const mk=(food)=>({econ:{npcs:new Array(8).fill(0).map(()=>({})),storage:{food},land:{}},_farmSet:new Set(['1,1']),_drySet:new Set(['1,1'])});
const a=mk(10),b=mk(1e6);const x=V._t1408Probe.seed(a,1),y=V._t1408Probe.seed(b,1);console.log(JSON.stringify({x,y,st:V.t1408Stat()}));`;
let SD1 = {}; try { SD1 = kid({ T1243_FARM_ON: '1', T1374_BIRTH_HARV: '1', T1408_SEED_NEXT: '1' }, SD); } catch (e) { SD1 = { err: String(e).slice(0, 200) }; }
ok(SD1.x > 0 && SD1.y === 0 && SD1.st && SD1.st.days && SD1.st.days.length === 2 && SD1.st.days[0] > 0 && SD1.st.days[0] < 400,
  '④ 첫 곳간 — 모자란 마을만 사람 × 첫 거둠까지 날로 채운다(넉넉한 마을 = 0)', JSON.stringify(SD1));
// ── ⑤ 미끼 ──
let BA = {}; try { BA = kid({ ...AXE, T1408_HARV_AXIS: '1' }, AX(BAIT('server/villages.js', 'T1408_HARV_AXIS ? _farmDay(vil, day) : day', 'day'))); } catch (e) { BA = { err: String(e).slice(0, 200) }; }
ok(BA.baitN === 1 && !BA.err && !axOk(BA), '⑤ 미끼 ⓐ — 바꾼 자리 1곳(날 축 줄 → `day`)인 villages 사본은 ② 켬 줄이 빨강', JSON.stringify(BA));
let BB = {}; try { BB = kid({ ...FW, T1408_FARM_VALUE: '1' }, FV(BAIT('sim/economy-sim.js', 't1276FieldFlow(v) / n * ctx.w', '0 * ctx.w'))); } catch (e) { BB = { err: String(e).slice(0, 200) }; }
ok(BB.baitN === 1 && !BB.err && !fvOk(BB), '⑤ 미끼 ⓑ — 바꾼 자리 1곳(농부 값 줄의 밭 흐름 → 0)인 econ 사본은 ③ 켬 줄이 빨강', JSON.stringify({ baitN: BB.baitN, farmer: farmOf(BB) }));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
