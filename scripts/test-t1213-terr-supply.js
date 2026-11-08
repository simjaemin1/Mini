#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh)
// === scripts/test-t1213-terr-supply.js — 땅의 차례 · 짓는 파생수요는 목표에 더한다(T1213 · T1207 회부 2 · ★재민 11-07) =====================
//
// ★지키는 것(존을 부팅하지 않는다 — econ 정본 함수 · v2 값 함수 · 다리 크루 하루를 그대로 부른다 · 자식 셋: 끔 · T1207 켬+T1213 끔 · 둘 다 켬):
//   ① 손잡이 — T1213 은 T1207 이 켜진 판에서만 선다(`T1213_ON`) · `T1213_DERIV_ADD=0` 이면 T1207 켬이어도 끔 · 끔이면 짓는 항 0 · 땅 몫 0
//   ② 짓는 파생수요 — 통나무 = 말뚝(`_t1207Need`) + 집(`houseBuildWant`) + 다리(`_t1213Bridge`) + 숯(노 숯 모자람 × 숯 하나의 통나무 — 숯가마면 가마 식 · 아니면 노천) · 돌 = 집 + 다리
//     · 말뚝은 켬이면 더하는 항에만(큰 쪽 항 `derivedInputTarget('wood')` 은 0 — 두 번 세지 않는다)
//   ③ v2 값 — 켬이면 통나무 · 돌 값이 오른다 · T1213 끔 판의 값은 T1207 끔 판과 같은 수(말뚝 모자람이 생존 목표보다 작을 때 — 큰 쪽 항이 안 보이는 그 자리)
//   ④ 땅의 차례 — 숯가마는 땅 몫(`_t1207Need`)까지 뺀 잉여로만 굽는다(같은 곳간 · 땅 몫이 있으면 덜 태운다) · 땅(말뚝)이 보는 잉여는 비축 · 집 몫 뒤 그대로
//   ⑤ 다리 남은 몫 — 다리 크루 하루(`_t527BridgeDay`)가 econ 칸 `_t1213Bridge` 에 남은 단계 몫을 적는다(표 그대로) · 끔이면 칸 없음
//   ⑥ 글자 — v2 목표 세 자리 `+ buildT` · 다리 크루 두 자리 · 숯가마 한 자리 `woodSpareAfterLand` · 손잡이 한 줄
//
// 실행: node scripts/test-t1213-terr-supply.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${typeof x === 'string' ? x : JSON.stringify(x)}` : '')); };
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const lastJson = (s) => JSON.parse(s.toString().split('\n').filter((l) => l.startsWith('{')).pop());
const probe = (env, js) => lastJson(execFileSync(process.execPath, ['-e', js],
  { env: Object.assign({}, process.env, { ENABLE_VILLAGES: '0', DB_PATH: `/tmp/t1213-${process.pid}.db` }, env), stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }));
const EP = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim.js')), V2P = JSON.stringify(path.join(ROOT, 'sim', 'economy-sim-v2.js')), VP = JSON.stringify(path.join(ROOT, 'server', 'villages.js'));
const ARMS = { off: { T1207_TERR_REAL: '0' }, on0: { T1207_TERR_REAL: '1', T1213_DERIV_ADD: '0' }, on: { T1207_TERR_REAL: '1' } };

// 같은 마을(인구 50 · 광맥 0.4 — 노가 숯을 원한다) · 곳간 통나무 20 · 돌 10 · 말뚝 모자람 12.5(생존 목표 1.5 × 50 = 75 보다 작다) · 다리 남은 몫 7 · 3
const VIL = `const E=require(${EP}), V2=require(${V2P});
const mk=()=>{ const v=E.createVillage({ name:'T', initialPop: 50, fertility:0.6, water:0.5, wood:0.6, stone:0.4, game:0.4, ore:0.4, size: 100 });
  v.storage.wood=20; v.storage.stone=10; v.housing=30; return v; };
const v=mk(); v._t1207Need=12.5; v._t1213Bridge={wood:7,stone:3};
const r=(x)=>+x.toFixed(9);`;

console.log('\n=== T1213 땅의 차례 · 짓는 파생수요 — 목표에 더한다 ===');
const P = {};
for (const [k, env] of Object.entries(ARMS)) P[k] = probe(env, VIL + `
const p=V2.computeShadowPrices(v);
const S=require(${JSON.stringify(path.join(ROOT, 'server', 'smelt-uses.js'))});
const chT=E.derivedInputTarget(v,'charcoal'), gap=chT-(v.storage.charcoal||0);
process.stdout.write(JSON.stringify({ on:E.T1213_ON, bw:r(E.buildInputTarget(v,'wood')), bs:r(E.buildInputTarget(v,'stone')), dw:r(E.derivedInputTarget(v,'wood')),
  hw:r(E.houseBuildWant(v,'wood')), hs:r(E.houseBuildWant(v,'stone')), chT, gap, wpcOpen:S.woodPerCharcoal(), wpcKiln:S.woodPerCharcoalKiln(),
  land:r(E.landWoodShare(v)), spare:r(E.woodSpare(v)), spareL:r(E.woodSpareAfterLand(v)), pw:p.wood, ps:p.stone, N:v.npcs.length,
  subsW:V2.SUBSISTENCE_PER_NPC.wood }));`);

console.log('\n① 손잡이 — T1207 이 켜진 판에서만');
ok(P.off.on === false && P.on0.on === false && P.on.on === true, '★`T1213_ON` = T1207 켬 ∧ `T1213_DERIV_ADD` ≠ 0 — 끔 · T1213 끔 판은 false', [P.off.on, P.on0.on, P.on.on]);
ok(P.off.bw === 0 && P.off.bs === 0 && P.off.land === 0 && P.on0.bw === 0 && P.on0.land === 0, '끔 · T1213 끔 — 짓는 항 0 · 땅 몫 0', [P.off.bw, P.off.bs, P.on0.bw]);
ok(P.off.spareL === P.off.spare && P.on0.spareL === P.on0.spare, '끔 — 숯가마 · 다리가 보는 잉여 = `woodSpare` 그대로', [P.off.spare, P.off.spareL]);

console.log('\n② 짓는 파생수요 — 항 넷(통나무) · 둘(돌)');
{
  const o = P.on, kilnless = o.gap > 0 ? o.gap * o.wpcOpen : 0;
  ok(o.chT > 0 && o.gap > 0, `(전제) 이 마을 노가 숯을 원한다 — 숯 목표 ${o.chT} · 모자람 ${o.gap}`, [o.chT, o.gap]);
  ok(Math.abs(o.bw - (12.5 + o.hw + 7 + kilnless)) < 1e-6, `★통나무 = 말뚝 12.5 + 집 ${o.hw} + 다리 7 + 숯 ${kilnless}(모자람 ${o.gap} × 노천 숯 하나 ${o.wpcOpen}) = ${o.bw}`, o.bw);
  ok(Math.abs(o.bs - (o.hs + 3)) < 1e-6 && o.hs > 0, `★돌 = 집 ${o.hs} + 다리 3 = ${o.bs}`, o.bs);
  ok(o.dw === 0 && P.on0.dw === 12.5 && P.off.dw === 12.5, '★말뚝은 켬이면 더하는 항에만 — 큰 쪽 항(`derivedInputTarget`)은 0(T1213 끔 · 끔 판은 종전대로 12.5)', [o.dw, P.on0.dw, P.off.dw]);
  const kiln = probe(ARMS.on, VIL + `v._kiln={built:0}; process.stdout.write(JSON.stringify({ bw:r(E.buildInputTarget(v,'wood')), hw:r(E.houseBuildWant(v,'wood')) }));`);
  ok(Math.abs(kiln.bw - (12.5 + kiln.hw + 7 + o.gap * o.wpcKiln)) < 1e-6 && o.wpcKiln < o.wpcOpen, `★숯가마가 선 마을은 가마 식(숯 하나 통나무 ${o.wpcKiln} < 노천 ${o.wpcOpen}) — ${kiln.bw}`, kiln.bw);
}

console.log('\n③ v2 값 — 짓는 수요가 값에 닿는다');
ok(P.on.pw > P.on0.pw * 1.5 && P.on.ps > P.on0.ps, `★켬 — 통나무 값 ${P.on0.pw.toFixed(3)} → ${P.on.pw.toFixed(3)} · 돌 값 ${P.on0.ps.toFixed(3)} → ${P.on.ps.toFixed(3)}(큰 쪽이 아니라 합)`, [P.on0.pw, P.on.pw]);
ok(P.on0.pw === P.off.pw && P.on0.ps === P.off.ps, `★T1213 끔 판 값 = 끔 판 값(같은 수 — 말뚝 모자람 12.5 가 생존 목표 ${P.on.subsW * 30 * P.on.N} 밑이라 큰 쪽 항에선 안 보였다 · T1207 이 잰 그 자리)`, [P.off.pw, P.on0.pw]);

console.log('\n④ 땅의 차례 — 1인 비축 → 집 몫 → 땅 몫 → 숯가마 · 다리');
{
  const K = (env) => probe(env, VIL + `
const N=v.npcs.length, res=(E.RESERVE_PC.wood||0)*N; v._kiln={built:0}; v.counts=Object.assign({},v.counts||{},{lumberjack:1});
v.storage.wood=res+E.houseWoodShare(v)+30; v.storage.charcoal=0; v._t1207Need=12.5; const w0=v.storage.wood;
const d=E.kilnDay(v); process.stdout.write(JSON.stringify({ d, burned:r(w0-v.storage.wood), spare:r(E.woodSpare(v)), res }));`);
  const k0 = K(ARMS.on0), k1 = K(ARMS.on);
  ok(k0.d && k0.d.batches > 0 && k1.d && k1.d.batches >= 0, `(전제) 숯가마가 선 마을 · 잉여 30 · 숯이 모자라다 — T1213 끔 ${k0.d && k0.d.batches}배치`, [k0.d, k1.d]);
  ok(k1.burned < k0.burned && k1.burned <= Math.max(0, 30 - 12.5) + 1e-9, `★켬 — 숯가마는 땅 몫 12.5 를 남기고 굽는다(태운 통나무 ${k0.burned} → ${k1.burned} · 잉여 30 − 땅 몫 12.5 = 17.5 이하)`, [k0.burned, k1.burned]);
}

console.log('\n⑤ 다리 남은 몫 — 다리 크루 하루가 econ 칸에 적는다(지름길 1위 · 표 그대로)');
{
  const B = require(path.join(ROOT, 'server', 'bridge-stages.js'));
  const HUT = require(path.join(ROOT, 'server', 'hut-stages.js')), GRA = require(path.join(ROOT, 'server', 'granary-stages.js'));
  const REC = Object.assign({}, HUT.HUT_RECIPES, GRA.GRANARY_RECIPES);
  const { ZONES } = require(path.join(ROOT, 'server', 'zone-config.js'));
  const SC = (ZONES.hanbando.bridgeShortcuts || [])[0] || { v: [], span: 0, cells: [] };
  const SCB = SC.v[0], SCN = SC.cells.length / 2;
  const raw = B.bridgeStages(SC.span, SCN).map((st) => B.rawOfNeed(st.need, REC));
  const SW = raw.reduce((a, o) => a + (o.wood || 0), 0), SS = raw.reduce((a, o) => a + (o.stone || 0), 0);
  const W = `const V=require(${VP}), E=require(${EP}), P=V.__labProbe._t400Probe, Q=V.__labProbe._t527Probe;
const players=new Map(); ['fisher','farmer','hunter','forager','miner','lumberjack'].forEach((j,i)=>players.set('n'+i,{pid:'n'+i,simJob:j,inventory:{}}));
const DAY=600000; let now=DAY*10+1;
P.setup({deps:{players,moveSpeed:120,dayPhaseRatio:0.7,broadcast(){},addBridgeCells:(f)=>f.length/2,anyViewerNear:()=>false},db:null,dayMs:DAY,epoch:0,zoneId:'hanbando',tickCtx:{get now(){return now}}});
P.setup({ta:{isBlocked:()=>false,isWater:()=>false},world:{day:0}});
const S0=(Q.sites()||[])[0]||null;
const vil={dbId:1,name:${JSON.stringify(SCB)},ccx:S0?S0.cells[0]:0,ccy:S0?S0.cells[1]+6:0,npcPids:[...players.keys()],econ:{storage:{wood:0}},_granList:[{cx:S0?S0.cells[0]+4:0,cy:S0?S0.cells[1]+4:0}],_site:null,_granPend:null};
Q.day(vil); const a=vil.econ._t1213Bridge?JSON.parse(JSON.stringify(vil.econ._t1213Bridge)):null;
const other={dbId:2,name:'없는마을',ccx:0,ccy:0,npcPids:[],econ:{storage:{wood:0},_t1213Bridge:{wood:1,stone:1}},_granList:[],_site:null,_granPend:null};
Q.day(other);
process.stdout.write(JSON.stringify({ a, other: other.econ._t1213Bridge === undefined ? null : other.econ._t1213Bridge, site: !!S0 }));`;
  const b1 = probe(Object.assign({ T527_BRIDGE_ACT: '1', T537_SHORTCUT: '1' }, ARMS.on), W);
  const b0 = probe(Object.assign({ T527_BRIDGE_ACT: '1', T537_SHORTCUT: '1' }, ARMS.on0), W);
  ok(b1.site && b1.a && Math.abs(b1.a.wood - SW) < 1e-6 && Math.abs(b1.a.stone - SS) < 1e-6, `★첫날(단계 0 · 놓인 것 0) — 남은 몫 = 다리 표 전부(통나무 ${SW} · 돌 ${SS})`, b1.a);
  ok(b1.other === null, '터가 없는 마을 — 칸을 지운다(어제 칸이 남지 않는다)', b1.other);
  ok(b0.a === null, '끔(T1213 끔) — 칸을 안 세운다(종전 비트)', b0.a);
}

console.log('\n⑥ 글자');
{
  const V2S = rd('sim/economy-sim-v2.js'), ES = rd('sim/economy-sim.js'), VS = rd('server/villages.js');
  ok((V2S.match(/target = _fishTarget\(v,r,Math\.max\(subs \* 30, buffer, flowT, derivT\) \+ buildT\);/g) || []).length === 3
    && (V2S.match(/const buildT = v1\.buildInputTarget \? v1\.buildInputTarget\(v, r\) : 0;/g) || []).length === 3
    && !/Math\.max\(subs \* 30, buffer, flowT, derivT\)\);/.test(V2S), '★v2 목표 세 자리(결정층 · 정산 · 부패) — 짓는 항을 **더한다**(동기 계약 · 남은 `max` 단독 자리 0)');
  ok((ES.match(/process\.env\.T1213_DERIV_ADD/g) || []).length === 1 && /const T1213_ON = \(typeof process !== 'undefined' && process\.env && process\.env\.T1207_TERR_REAL === '1' && process\.env\.T1213_DERIV_ADD !== '0'\);/.test(ES)
    && !/T1213_[A-Z_]+ = process\.env/.test(VS), '손잡이 한 줄(econ) — T1207 켬에 묶임 · 생활층은 econ 칸을 읽는다');
  ok(/const spare = woodSpareAfterLand\(v\);/.test(ES) && /room = k === 'wood' \? Math\.max\(0, E\.woodSpareAfterLand\(vil\.econ\)\)/.test(VS)
    && /t\.kind==='bridge'\?E\.woodSpareAfterLand\(vil\.econ\):E\.woodSpare\(vil\.econ\)/.test(VS), '★땅 몫 뒤 — 숯가마 · 다리(일괄 · 몸) 셋 · 땅(말뚝)은 `woodSpare` 그대로');
  ok(/function houseWoodShare\(v\) \{\s*if \(!T400_BUILD_ACT \|\| !v \|\| !v\.npcs \|\| v\.housing === undefined\) return 0;\s*return houseBuildWant\(v, 'wood'\);/.test(ES),
    '집 몫(T400 켬)과 짓는 수요가 한 몸통(`houseBuildWant`) — 사본 0');
}

console.log(`\n=== T1213: ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
