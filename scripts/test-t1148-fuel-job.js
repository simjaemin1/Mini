#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(표 없으면 안 돈다)
// === scripts/test-t1148-fuel-job.js — 땔감도 생존 필요: 직업 판단이 추위 빚을 식량 빚처럼 본다(T1148 · ★재민 11-04) ==================
//
// 지키는 것:
//   ① `T1148_FUEL_JOB` 끔(미설정 · '0' · 그 밖 값) = 종전 — 추위 빚을 안 센다(`_t1148Ahead` 칸이 안 선다 · 직업 줄 무동작)
//   ② 다가오는 겨울 끝까지(econ v2 `_t1148Ahead`) — 마을 틱의 추위 식(`temperatureAt` · 일교차 · 기준 · ÷15)을 내일부터 센 것과 같다 ·
//      겨울 안이면 남은 겨울 · 여름이면 다음 겨울 끝까지 · 높은 곳이 더 길고 더 춥다 · 추운 날 없는 고도면 H = 0
//   ③ 추위 빚(`t1148Cold`) = 인구 × d × (H + FUEL_COLD_W × Σ추위) − 곳간 통나무 − 수입 EMA × H · 땔감 며칠치 = 곳간 ÷ (하루 평균 수요 − 하루 수입)
//      ★자명 통과 금지: 곳간이 빚보다 크면 빚 ≤ 0 · 수입이 하루 수요를 넘으면 며칠치 ∞
//   ④ 직업 줄 — 기근 블록 앞 · 추위 빚 > 0 ∧ 땔감 며칠치 < 식량 며칠치 + `FD_DEATH_DAYS` · 하드 플로어 N × 6 · 자리 · 나무 칸 0 이면 안 연다
//   ⑤ 갚는 길 — 땔감 평형 판의 나무꾼 몫에 추위 빚 ÷ H(겨울 끝까지 고르게) · 생활층 나무꾼은 베기 전에 삭정이부터(같은 한도 · 문 · 입구)
//
// 실행: node scripts/test-t1148-fuel-job.js   (존 안 띄움 · 몇 초)
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (d !== undefined && d !== '' ? `  ${d}` : '')); };
const KNOBS = ['T1148_FUEL_JOB', 'T1135_FUEL_EQ', 'T325_WOOD_ACT'];
const sub = (env, code) => {
  const e = Object.assign({}, process.env, env); delete e.NODE_OPTIONS;
  for (const k of KNOBS) if (!(k in env)) delete e[k];
  return JSON.parse(execFileSync(process.execPath, ['-e', code], { cwd: ROOT, env: e, encoding: 'utf8', maxBuffer: 64 << 20 }).trim().split('\n').pop());
};
console.log('\n=== T1148 — 땔감도 생존 필요 ===');
const S = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
const S2 = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim-v2.js'), 'utf8');
const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
// ── ① 끔 ──
const K = `const E=require('./sim/economy-sim');console.log(JSON.stringify({on:E.T1148_FUEL_JOB,none:E.t1148Cold({npcs:[1],storage:{wood:1}})}));`;
const k0 = sub({}, K), kz = sub({ T1148_FUEL_JOB: '0' }, K), kx = sub({ T1148_FUEL_JOB: 'yes' }, K), k1 = sub({ T1148_FUEL_JOB: '1' }, K);
ok(k0.on === false && kz.on === false && kx.on === false && k1.on === true, '① 미설정 · 0 · 그 밖 값 = 끔 · `1` = 켬');
ok(k0.none === null && k1.none === null, '① 다가오는 겨울 칸(`_t1148Ahead`)이 없으면 빚을 안 센다');
ok(/if \(v1\.T1148_FUEL_JOB\) v\._t1148Ahead = _t1148Ahead\(world\.day, _elev\);/.test(S2), '① 그 칸은 켬일 때만 선다(마을 틱 기후 절 · 끔 = 무동작)');
// ── ② 다가오는 겨울 ──
{
  const A = sub({}, `const v=require('./sim/economy-sim-v2');const C=v.CLIMATE;const cs=(d,e)=>Math.max(0,Math.min(1,(C.coldRef-(v.temperatureAt(d,null,e)-C.diurnalAmp))/15));
const brute=(day,e)=>{let H=0,s=0,seen=false;for(let t=1;t<=730;t++){const c=cs(day+t,e);if(c>0){seen=true;s+=c;H=t}else if(seen)break}return {H,cs:s}};
const o={};for(const d of [1,100,200,300,330,400])for(const e of [0,0.5]){o[d+':'+e]=[v._t1148Ahead(d,e),brute(d,e)]}
o.hot=v._t1148Ahead(100,-3);o.c0=cs(1,0);o.c100=cs(100,0);console.log(JSON.stringify(o));`);
  const same = Object.keys(A).filter((k) => k.includes(':')).every((k) => Math.abs(A[k][0].H - A[k][1].H) === 0 && Math.abs(A[k][0].cs - A[k][1].cs) < 1e-9);
  ok(same, '② 마을 틱의 추위 식을 내일부터 센 것과 같다(여섯 날 × 두 고도)');
  ok(A['1:0'][0].H < A['100:0'][0].H && A['100:0'][0].H - A['200:0'][0].H === 100 && A.c0 > 0 && A.c100 === 0, '② 겨울 안이면 남은 겨울 · 여름이면 다음 겨울 끝까지(날이 가면 H 가 준다)', `1일 ${A['1:0'][0].H} · 100일 ${A['100:0'][0].H} · 200일 ${A['200:0'][0].H}`);
  ok(A['100:0.5'][0].H > A['100:0'][0].H && A['100:0.5'][0].cs > A['100:0'][0].cs, '② 높은 곳이 겨울이 더 길고 더 춥다(고도 감률)', `0 m ${A['100:0'][0].cs.toFixed(1)} · 500 m ${A['100:0.5'][0].cs.toFixed(1)}`);
  ok(A.hot.H === 0 && A.hot.cs === 0, '② 추운 날이 없는 고도(두 해 창)면 H = 0 — 추위 빚 없음');
}
// ── ③ 추위 빚 ──
{
  const C = `const E=require('./sim/economy-sim');const mk=(w,imp)=>({npcs:new Array(20).fill(0),storage:{wood:w},_woodImportEMA:imp,_t1148Ahead:{H:120,cs:50}});
console.log(JSON.stringify({a:E.t1148Cold(mk(10,0)),b:E.t1148Cold(mk(1e6,0)),c:E.t1148Cold(mk(10,99)),d:E.FIREWOOD_PC_SRC}));`;
  const off = sub({ T1148_FUEL_JOB: '1' }, C), on = sub({ T1148_FUEL_JOB: '1', T1135_FUEL_EQ: '1' }, C);
  const FCW = +(S.match(/const FUEL_COLD_W = ([\d.]+);/) || [])[1];
  const want = (d) => 20 * d * (120 + FCW * 50);
  ok(Math.abs(off.a.need - want(0.085)) < 1e-9 && Math.abs(on.a.need - want(on.d)) < 1e-9, '③ 수요 = 인구 × d × (H + FUEL_COLD_W × Σ추위) — d 는 `_firewoodPC()`(평형 판 = 고증 d)', `${off.a.need.toFixed(1)} · 고증 ${on.a.need.toFixed(1)}`);
  ok(Math.abs(off.a.debt - (want(0.085) - 10)) < 1e-9 && Math.abs(off.a.fuelDays - 10 / (want(0.085) / 120)) < 1e-9, '③ 빚 = 수요 − 곳간 − 수입 × H · 며칠치 = 곳간 ÷ 하루 평균 수요');
  ok(off.b.debt < 0 && off.c.fuelDays === null && off.c.debt < 0, '③ ★자명 통과 금지 — 곳간이 넉넉하면 빚 ≤ 0 · 수입이 하루 수요를 넘으면 며칠치 ∞(JSON null)', `${off.b.debt.toFixed(0)} · ${off.c.debt.toFixed(0)}`);
}
// ── ④ 직업 줄 ──
{
  const i = S.indexOf('// ★★[T1148] 추위 빚 — 땔감도 생존 필요'), f = S.indexOf('  if (foodEquiv < N * 30) {', i);
  ok(i > 0 && f > i && f - i < 900, '④ 기근 블록 바로 앞이다(블록 안팎 같은 잣대)');
  const blk = S.slice(i, f);
  ok(/if \(T1148_FUEL_JOB && foodEquiv > N \* 6 && hasSlot\(v, 'lumberjack', cap, counts\) && !\(T325_WOOD_ACT && v\._t325Cells === 0\)\) \{/.test(blk), '④ 켬 ∧ 하드 플로어 N × 6 ∧ 자리 ∧ 나무 칸 0 아님(없으면 못 벤다)');
  ok(/if \(_c && _c\.debt > 0 && _c\.fuelDays < foodEquiv \/ N \+ t1197DieDays\(\)\) return 'lumberjack';/.test(blk), '④ 빚 > 0 ∧ 땔감 며칠치 < 식량 며칠치 + 굶어 죽기까지 날(`t1197DieDays` — ★[T1197] 켬 = 몸 정본 유도 · 끔 = `FD_DEATH_DAYS` 14)');
  const lits = (blk.replace(/\/\/.*$/gm, '').match(/\b\d+(\.\d+)?\b/g) || []).filter((x) => x !== '0');
  ok(lits.length === 1 && lits[0] === '6', '④ 새 수 0 — 하드 플로어 6(기근 블록의 그 수)뿐', lits.join(','));
  ok(/fuelGateOn\(\) && v\._fuelCov !== undefined && v\._fuelCov < 1 && \(counts\.lumberjack \|\| 0\) < 1 && foodEquiv > N \* 6/.test(S), '④ T717 한 명 문은 그대로(끔 기본 · 표에서 비교만)');
}
// ── ⑤ 갚는 길 ──
{
  ok(/if \(T1148_FUEL_JOB\) \{ const _c = t1148Cold\(v\); v\._t1148 = _c; if \(T1135_FUEL_EQ && _c && _c\.debt > 0\) v\._t1135Need \+= _c\.debt \/ Math\.max\(1, _c\.H\); \}/.test(S)
     && S.indexOf('if (T1135_FUEL_EQ) v._t1135Need = fuelNeed;') < S.indexOf('if (T1148_FUEL_JOB) { const _c = t1148Cold(v);'), '⑤ 평형 판 나무꾼 몫 += 추위 빚 ÷ H(그날 땔감 수요 줄 바로 뒤)');
  const g = V.indexOf('★★[T1148] 나무꾼(삭정이 줍기 포함)'), c = V.indexOf("let loot = null; try { loot = state.deps.t325CutTreeAt ? state.deps.t325CutTreeAt(t.cx, t.cy) : null; }");
  ok(g > 0 && c > g && c - g < 2200, '⑤ 생활층 나무꾼은 베기 전에 삭정이부터');
  const blk = V.slice(g, c);
  ok(/if \(_lifeEcon\(\)\.T1148_FUEL_JOB && _t1135On\(\) && \(vil\._t1135Dead \|\| 0\) > 0\) \{/.test(blk) && /woodDemandLeft\(vil\.econ\)/.test(blk) && /woodToGranary\(vil\.econ, _take\)/.test(blk) && /_t491C \? _cap : _cap \* _w/.test(blk), '⑤ 켬 ∧ 평형 판만 · 같은 수요 문 · 같은 곳간 입구 · 같은 걸음 한도');
}
console.log(`\n${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
