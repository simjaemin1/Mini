#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1421-farm-4000b.js — 밭 세계를 사천 명으로 둘째 — 밭 일의 값 두 팔 · 밭 용량 · 한 해를 내다보는 출생 문(T1421) =====================================
//
// 지키는 것(econ 함수만 · 서버 0 · 몇 초):
//   ① 손잡이 셋 — `T1421_FARM_PRICE`(`crop` | `kcal` 만) · `T1421_FIELD_CAP` · `T1421_BIRTH_YEAR`(`'1'` 만) — 끔 기본 · 밭 세계 + T1276 켬 안에서만
//   ② 농부 값이 0 · 폴백이 아니다(밭 세계 · 거둔 것 0 · 갓 심은 밭) — 두 팔 다 > 0 · 폴백 값(그 자리 종전 11)과 다르다 · 끔 = 폴백
//   ③ 두 팔이 같은 밭에 다른 값을 낸다 — ㉮ 작물 시세(곳간 조 · 값 5) ↔ ㉯ 다른 식량 일 열량 값(생선 · 고기 · 나물 값 1 · 2 · 1)
//   ④ 한 해를 내다보는 문 — 다음 거둠까지는 버티는 곳간(60일치)이어도 한 해 하루 식량(곳간 ÷ 365 + 밭 흐름 + 다른 흐름)이 사람 + 1 밑이면 닫힌다 · 넉넉하면 열린다 · 출생 줄 글자
//   ⑤ 밭 용량 — 갈 수 있는 땅(밭 칸 ÷ 갈린 몫) × 칸 하나가 한 해 낼 식량 ÷ 365 · 부양력 밭 몫 = max(밭 흐름, 용량) 줄 글자
//   ⑦ [덧붙임 둘] `mix` — 안 먹는 선 작물이 없으면 ㉯ 와 같은 값 · 있으면 그 낱개 × 그 품목 값 ÷ (365 × 농부)만큼 더 · 이 세계 청동기 묶음 12종은 다 식량 몫 > 0
//   ⑧ [덧붙임] 나눗수 `T1421_FARM_DIV`(`grow` | `labor` 만 · 끔 = ÷ 365 · 실현 배분 · 기근 블록 농부 칸 둘 다) — ⓑ = 한 해 밭 식량 × 값 ÷ (자라는 날 × 농부) · ⓒ = ÷ 지난 한 해 밭 일손 날(`t1276Note` 가 일손 초 누적을 한 해 창으로 · 1 밑이면 1)
//   ⑥ 미끼(이 파일 안 · 셋) — ⓐ 농부 값 줄의 하루치 값 → 0 → ② 빨강 · ⓑ 값 함수 갈래(`mode === 'crop'`) → 늘 참 → ③ 빨강 · ⓒ 한 해 식량 함수의 다른 흐름 항 뺌 → ④ 빨강
//   날짜 · 벽시계를 쓰지 않는다.
'use strict';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); return !!c; };
console.log('\n=== T1421 — 밭 세계를 사천 명으로 둘째(밭 일의 값 · 밭 용량 · 한 해 출생 문) ===');
const KN = ['T1421_FARM_DIV', 'T1421_FARM_PRICE', 'T1421_FIELD_CAP', 'T1421_BIRTH_YEAR', 'T1408_FARM_VALUE', 'T1243_FARM_ON', 'T1276_FARM_K', 'NODE_OPTIONS'];
const kid = (env, code) => { const e = Object.assign({}, process.env); for (const k of KN) delete e[k]; Object.assign(e, env);
  const out = execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 16 << 20 });
  return JSON.parse(out.trim().split('\n').filter((l) => l.startsWith('{')).pop()); };
const BAIT = (needle, rep) => `const __M=require('module'),__c=__M.prototype._compile,__F=require('path').join(process.cwd(),'sim/economy-sim.js');globalThis.__baitN=-1;
__M.prototype._compile=function(c,f){if(f===__F){globalThis.__baitN=c.split(${JSON.stringify(needle)}).length-1;if(globalThis.__baitN===1)c=c.replace(${JSON.stringify(needle)},${JSON.stringify(rep)});}return __c.call(this,c,f);};`;
const FW = { T1243_FARM_ON: '1', T1276_FARM_K: '1' };
// ── ① ──
const KC = `const E=require('./sim/economy-sim');console.log(JSON.stringify({p:E.T1421_FARM_PRICE,c:E.T1421_FIELD_CAP,b:E.T1421_BIRTH_YEAR}));`;
let K0 = {}, K1 = {}, K2 = {}, K3 = {};
try { K0 = kid(FW, KC); K1 = kid({ ...FW, T1421_FARM_PRICE: 'crop', T1421_FIELD_CAP: '1', T1421_BIRTH_YEAR: '1' }, KC); K2 = kid({ ...FW, T1421_FARM_PRICE: 'yes', T1421_BIRTH_YEAR: 'on' }, KC); K3 = kid({ T1421_FARM_PRICE: 'kcal', T1421_FIELD_CAP: '1' }, KC); } catch (e) { K0 = { err: String(e).slice(0, 200) }; }
ok(K0.p === '' && K0.c === false && K0.b === false && K1.p === 'crop' && K1.c === true && K1.b === true && K2.p === '' && K2.b === false && K3.p === '' && K3.c === false,
  '① 손잡이 셋 — 끔 기본 · `crop`·`kcal` / `1` 만 · 밭 세계 + T1276 켬 안에서만', JSON.stringify({ K0, K1, K2, K3 }));
// ── ② · ③ 농부 값 ──
const FV = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const v={_t1276H:0,_t1276Stand:365*4,storage:{foxtail_millet:100},dailyProductionBuf:{fish:3},_allocDay:0,counts:{farmer:4,fisher:2}};
const W={foxtail_millet:5,fish:1,meat:2,vegetable:1,food:0.1};const ctx={period:100,counts:{farmer:4,fisher:2},w:(r)=>W[r]!=null?W[r]:1};
const r=E.allocRealCandidates(v,{day:7},[['farmer',11],['fisher',22]],ctx);const f=r&&r.find(c=>c[0]==='farmer');console.log(JSON.stringify({farmer:f?f[1]:null,baitN:globalThis.__baitN}));`;
let F0 = {}, Fc = {}, Fk = {};
try { F0 = kid(FW, FV()); Fc = kid({ ...FW, T1421_FARM_PRICE: 'crop' }, FV()); Fk = kid({ ...FW, T1421_FARM_PRICE: 'kcal' }, FV()); } catch (e) { F0 = Fc = Fk = { err: String(e).slice(0, 200) }; }
const notFb = (r) => r.farmer > 0 && r.farmer !== 11;
ok(notFb(Fc) && notFb(Fk) && F0.farmer === 11, '② 농부 값이 0 · 폴백이 아니다 — 갓 심은 밭(거둔 것 0 · 선 작물 하루 4)에서 두 팔 다 > 0 · 끔 = 폴백 11', JSON.stringify({ off: F0.farmer, crop: Fc.farmer, kcal: Fk.farmer }));
const twoOk = (c, k) => c.farmer > 0 && k.farmer > 0 && Math.abs(c.farmer - k.farmer) > 1e-6;
ok(twoOk(Fc, Fk), '③ 두 팔이 같은 밭에 다른 값 — ㉮ 작물 시세 ↔ ㉯ 다른 식량 일 열량 값', `${Fc.farmer} ↔ ${Fk.farmer}`);
// ── ④ 한 해 문 ──
const YF = (pre) => `${pre || ''}const E=require('./sim/economy-sim');
const mk=(flow,O)=>({npcs:new Array(10).fill(0),storage:{food:600},land:{},_t1276H:flow*365,_t1276Stand:0,_t1421O:O});
const a=mk(3,2),b=mk(9,3);const ya=E.t1421YearFood(a),yb=E.t1421YearFood(b);console.log(JSON.stringify({ya,yb,need:11,baitN:globalThis.__baitN}));`;
let Y = {}; try { Y = kid({ ...FW, T1421_BIRTH_YEAR: '1' }, YF()); } catch (e) { Y = { err: String(e).slice(0, 200) }; }
const ES = require('fs').readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const yOk = (r) => r.ya < 11 && r.yb >= 11;
ok(yOk(Y) && /if \(T1421_BIRTH_YEAR\) \{ v\._t1421Gate = 0; if \(dP > 0 && t1421YearFood\(v\) < \(_homeN \+ 1\) \* DAILY_FOOD_CONSUMPTION\) \{ dP = 0; v\._t1421Gate = 1; \} \}/.test(ES),
  '④ 한 해 문 — 곳간 60일치(다음 거둠까지 버팀)여도 한 해 하루 식량 6.6 < 11 이면 닫힘 · 12.6 이면 열림 · 출생 줄', JSON.stringify(Y));
// ── ⑤ 밭 용량 ──
const FC = `const E=require('./sim/economy-sim');const v={_fieldCells:100,_clearedFrac:0.5,_t1276Stand:500,_t1421StandN:50};console.log(JSON.stringify({cap:E.t1421FieldCap(v)}));`;
let FCr = {}; try { FCr = kid({ ...FW, T1421_FIELD_CAP: '1' }, FC); } catch (e) { FCr = { err: String(e).slice(0, 200) }; }
ok(Math.abs(FCr.cap - 200 * 10 / 365) < 1e-9 && /if \(T1421_FIELD_CAP\) _prodKraw \+= Math\.max\(0, t1421FieldCap\(v\) - t1276FieldFlow\(v\)\) \/ DAILY_FOOD_CONSUMPTION;/.test(ES),
  '⑤ 밭 용량 — 갈 수 있는 땅 200칸 × 칸 하나 10 ÷ 365 · 부양력 밭 몫 = max(흐름, 용량)', JSON.stringify(FCr));
// ── ⑦ mix ──
const MX = (stand) => `const E=require('./sim/economy-sim');
const v={_t1276H:0,_t1276Stand:365*4,_t1421Ined:${stand},storage:{},dailyProductionBuf:{fish:3},_allocDay:0,counts:{farmer:4,fisher:2}};
const W={foxtail_millet:5,hemp:7,fish:1,meat:2,vegetable:1,food:0.1};const ctx={period:100,counts:{farmer:4,fisher:2},w:(r)=>W[r]!=null?W[r]:1};
const r=E.allocRealCandidates(v,{day:7},[['farmer',11],['fisher',22]],ctx);const f=r&&r.find(c=>c[0]==='farmer');console.log(JSON.stringify({farmer:f?f[1]:null,p:E.T1421_FARM_PRICE}));`;
let M0 = {}, M1 = {}, Mk = {}, Med = {};
try { M0 = kid({ ...FW, T1421_FARM_PRICE: 'mix' }, MX('null')); M1 = kid({ ...FW, T1421_FARM_PRICE: 'mix' }, MX('{hemp:365}')); Mk = kid({ ...FW, T1421_FARM_PRICE: 'kcal' }, MX('{hemp:365}'));
  Med = kid({}, `const C=require('./server/crops'),K=require('./server/kcal');const z=[...C.T1201_BRONZE_SET].filter(id=>!(K.econUnitsOf(id,1)>0));console.log(JSON.stringify({n:C.T1201_BRONZE_SET.size,ined:z}));`); } catch (e) { M0 = { err: String(e).slice(0, 200) }; }
ok(M0.p === 'mix' && Math.abs(M0.farmer - Mk.farmer) < 1e-9 && Math.abs(M1.farmer - (Mk.farmer + 365 * 7 / (365 * 4) * 100)) < 1e-6 && Med.n === 12 && Med.ined.length === 0,
  '⑦ mix — 안 먹는 칸 0 = ㉯ 값 · 삼 365낱 × 값 7 ÷ (365 × 농부 4) × 창 100 = +175 · 청동기 묶음 12종에 안 먹는 작물 0', JSON.stringify({ M0: M0.farmer, M1: M1.farmer, kcal: Mk.farmer, Med }));
// ── ⑧ 나눗수 ──
const DV = `const E=require('./sim/economy-sim');
const mk=()=>({_t1276H:365*6,_t1276Stand:0,_t1421GAvg:120,storage:{},dailyProductionBuf:{fish:3},_allocDay:0,counts:{farmer:4,fisher:2}});
const W={fish:1,meat:2,vegetable:1};const ctx={period:1,counts:{farmer:4,fisher:2},w:(r)=>W[r]!=null?W[r]:1};
const v=mk();if(E.T1421_FARM_DIV==='labor'){v._t1421DayS=100;for(let d=0;d<400;d++){v._t1421LabS=(v._t1421LabS||0)+200;v._t368FoodTot=0;E.t1276Note(v);}v._t1276H=365*6;}
const r=E.allocRealCandidates(v,{day:7},[['farmer',11],['fisher',22]],ctx);const f=r&&r.find(c=>c[0]==='farmer');console.log(JSON.stringify({farmer:f?f[1]:null,d:E.T1421_FARM_DIV,labD:v._t1421LabD}));`;
let D0 = {}, Dg = {}, Dl = {}, Dx = {};
try { D0 = kid({ ...FW, T1421_FARM_PRICE: 'kcal' }, DV); Dg = kid({ ...FW, T1421_FARM_PRICE: 'kcal', T1421_FARM_DIV: 'grow' }, DV); Dl = kid({ ...FW, T1421_FARM_PRICE: 'kcal', T1421_FARM_DIV: 'labor' }, DV); Dx = kid({ ...FW, T1421_FARM_PRICE: 'kcal', T1421_FARM_DIV: 'yes' }, DV); } catch (e) { D0 = { err: String(e).slice(0, 200) }; }
ok(D0.farmer > 0 && Math.abs(Dg.farmer / D0.farmer - 365 / 120) < 1e-9 && Math.abs(Dl.labD - 365 * 200 / 100) < 1e-9 && Math.abs(Dl.farmer / D0.farmer - (365 * 4) / (365 * 200 / 100)) < 1e-9 && Dx.d === '' && Math.abs(Dx.farmer - D0.farmer) < 1e-12
    && /if \(T1421_FARM_DIV && T1408_FARM_VALUE && \(counts\.farmer \|\| 0\) > 0\) for \(const o of foodOpts\) if \(o\[0\] === 'farmer'\) o\[1\] = Math\.max\(v\._t1276H \|\| 0, v\._t1276Stand \|\| 0\) \/ t1421FarmDays\(v, counts\.farmer\);/.test(ES),
  '⑧ 나눗수 — ⓑ = ⓐ × 365 ÷ 자라는 날 120 · ⓒ = ⓐ × (365 × 농부 4) ÷ 지난 한 해 일손 날 730 · `grow`·`labor` 만 · 기근 블록 농부 칸도 같은 나눗수(글자)', JSON.stringify({ a: D0.farmer, b: Dg.farmer, c: Dl.farmer, labD: Dl.labD, x: Dx.d }));
// ── ⑥ 미끼 ──
let Ba = {}; try { Ba = kid({ ...FW, T1421_FARM_PRICE: 'crop' }, FV(BAIT('t1421FoodPrice(v, ctx.w, T1421_FARM_PRICE)', '0'))); } catch (e) { Ba = { err: String(e).slice(0, 200) }; }
ok(Ba.baitN === 1 && !Ba.err && !notFb(Ba), '⑥ 미끼 ⓐ — 바꾼 자리 1곳(농부 값 줄의 하루치 값 → 0)인 사본은 ② 빨강', JSON.stringify(Ba));
let Bb1 = {}, Bb2 = {}; try { const pre = BAIT("if (mode === 'crop') {", 'if (true) {'); Bb1 = kid({ ...FW, T1421_FARM_PRICE: 'crop' }, FV(pre)); Bb2 = kid({ ...FW, T1421_FARM_PRICE: 'kcal' }, FV(pre)); } catch (e) { Bb1 = Bb2 = { err: String(e).slice(0, 200) }; }
ok(Bb1.baitN === 1 && !Bb1.err && !twoOk(Bb1, Bb2), '⑥ 미끼 ⓑ — 바꾼 자리 1곳(값 함수 갈래 → 늘 작물)인 사본은 ③ 빨강', JSON.stringify({ crop: Bb1.farmer, kcal: Bb2.farmer, baitN: Bb1.baitN }));
let Bc = {}; try { Bc = kid({ ...FW, T1421_BIRTH_YEAR: '1' }, YF(BAIT(' + t1276FieldFlow(v) + (v._t1421O || 0); }', ' + t1276FieldFlow(v); }'))); } catch (e) { Bc = { err: String(e).slice(0, 200) }; }
ok(Bc.baitN === 1 && !Bc.err && !yOk(Bc), '⑥ 미끼 ⓒ — 바꾼 자리 1곳(한 해 식량의 다른 흐름 항 뺌)인 사본은 ④ 빨강', JSON.stringify(Bc));
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
