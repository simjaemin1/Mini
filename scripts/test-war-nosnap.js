#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다
// === scripts/test-war-nosnap.js — 전쟁 몸 튐 둘 없애기(T790 · 손잡이 `T790_NO_SNAP` · '1' 만 켬) ==========
//
// ★왜 [지시 T790 · T781 회부 2 · 캐논: 순간이동 금지 — 모든 NPC 는 물리 몸]
//   ① 지휘 몸 놓기 — war-live `_muStepFollow` 가 대형의 지휘 몸을 원점(`g.cmd`)에 바로 놓았다. 귀환 첫 틱에 살아남은 몸이 결판 자리 → 길 머리로
//      55~87 m/s 튀었다(전쟁 자 · T781 §2). ② 슬롯 놓기 — `_warSnapToSlots` 가 징발 · 방어 소집 · T703 날마다 행군 대형을 슬롯에 바로 놓았다(픽스처는 마을 → 진).
//   켜면 둘 다 몸이 **걷는다**: 대형에 몸 걸음(`g._t790Walk` — 존 걸음 정본 `moveSpeed` ÷ 셀 px × 스텝 초)을 달고 추종이 그 걸음으로 옮긴다 · 늦으면 늦음 셈 · 메우기 0.
//   지키는 것: ⓐ 정적(손잡이 문 · 두 자리 · 칸 셋 · 늦음 셈 · 새 수 0) · ⓑ war-live 운영 함수 — 칸 없음 = 종전(지휘 몸 바로 놓기 · 병사 FOLLOW_CAP) ·
//             칸 있음 = 지휘 몸 · 병사 스텝마다 ≤ 걸음 · 닿을 때까지 걸음 수 = 거리 ÷ 걸음 · ★칸 0 이면 종전과 비트 같다 ·
//             막힌 칸 안에 선 걷는 몸(지휘 · 병사)은 걸어서 나온다 ·
//             ⓒ 존 운영 문(아이 프로세스 · 켬/끔) — 슬롯 놓기(끔 = 놓는다 · 켬 = 안 놓고 칸만 · 걸음 정본이 없는 판은 종전대로 놓는다) ·
//             귀환(끔 = 첫 틱 길 머리 · 켬 = 걸음만) · 늦음 셈(교전에 풀린 몸은 안 센다)
// ⚠존을 부팅하지 않는다 — war-live 정본(`createWarLive`)과 존 정본(`__p3Bind`)을 그대로 부른다(규칙 사본 0).
// 실행: node scripts/test-war-nosnap.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const codeOf = (s) => s.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const SRC_V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), CV = codeOf(SRC_V);
const SRC_L = fs.readFileSync(path.join(ROOT, 'server', 'war-live.js'), 'utf8'), CL = codeOf(SRC_L);
const fnBody = (C, name) => { const i = C.indexOf('function ' + name + '('); if (i < 0) return ''; let d = 0, j = C.indexOf('{', i); for (let k = j; k < C.length; k++) { if (C[k] === '{') d++; else if (C[k] === '}') { d--; if (!d) return C.slice(i, k + 1); } } return ''; };

console.log('\n=== 전쟁 몸 튐 둘 없애기(T790) ===');

// ── ⓐ 정적 ──────────────────────────────────────────────────────────────────
console.log('\n[ⓐ] 정적 — 손잡이 문 · 두 자리 · 칸 셋 · 늦음 셈 · 새 수 0');
{
  ok(/const T790_NO_SNAP = process\.env\.T790_NO_SNAP === '1';/.test(CV), "ⓐ 손잡이 하나 — `T790_NO_SNAP === '1'`(기본 끔)");
  const fol = fnBody(CL, '_muStepFollow');
  ok(/const wc = g\._t790Walk > 0 \? g\._t790Walk : 0;/.test(fol) && /if \(u\.cmd && !wc\) \{ u\.x = g\.cmd\.cx; u\.y = g\.cmd\.cy; continue; \}/.test(fol),
    'ⓐ ① war-live 추종 — 지휘 몸 바로 놓기는 칸이 없을 때만(칸 = 호스트가 단 몸 걸음)');
  ok(/Math\.min\(cap != null \? cap : MU\.FOLLOW_CAP, dd, wc \|\| dd\)/.test(fol) && /dd > \(u\.cmd \? 0 : MU\.FOLLOW_SNAP\)/.test(fol),
    'ⓐ ① 한 걸음 = min(상한, 남은 거리, 칸) — 칸 0 이면 min(상한, 남은 거리)(종전) · 지휘 몸은 원점까지 남김없이');
  const snap = fnBody(CV, '_warSnapToSlots');
  ok(/if \(T790_NO_SNAP && _t790Mark\(g\)\._t790Walk > 0\) \{ _t790Stat\.walk\+\+; return; \}/.test(snap) && snap.indexOf('T790_NO_SNAP') < snap.indexOf('_muSlotXY'), 'ⓐ ② 슬롯 놓기 — 켬이면 놓기 전에 돌아간다(칸만 단다) · 걸음 정본이 없는 판은 종전대로 놓는다');
  const def = fnBody(CV, '_warEnsureDefense'), ret = fnBody(CV, '_warSetupReturn'), day = fnBody(CV, '_t681Day');
  ok(/_t790Mark\(g\);/.test(def) && /_t790Mark\(body\.retGroup\);/.test(ret), 'ⓐ 칸 셋 — 공격(슬롯 놓기 자리) · 방어(긴급 소집은 슬롯 놓기를 안 거친다) · 귀환 대형');
  ok(/if \(T790_NO_SNAP\) \{ _t790Lag\(body\.atkGroup\); _t790Lag\(body\.defGroup\); _t790Lag\(body\.retGroup\); \}/.test(day) && day.indexOf('_t790Lag') < day.indexOf("T.leg === 'march'"),
    'ⓐ 늦음 셈 — 하루 경계 장부가 옮기기 전에 셋을 본다(켬에서만)');
  const mark = fnBody(CV, '_t790Mark'), lag = fnBody(CV, '_t790Lag');
  ok(/sp \/ SZ \* state\.warLive\.STEP_DT/.test(mark) && /state\.deps && state\.deps\.moveSpeed/.test(mark), 'ⓐ 몸 걸음 = 존 정본 `moveSpeed` px/s ÷ 셀 px × 교전 스텝 초(새 수 0)');
  const added = [mark, lag, snap.slice(0, snap.indexOf('_muSlotXY'))].join(' ').replace(/\[[01]\]/g, '[]');   // 자리 짝 `s[0]` · `s[1]` 은 수가 아니다(배열 칸)
  ok(!/[^\w.'D](?:[1-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(added), 'ⓐ 새 수 0 — 걸음 · 늦음 줄에 0 말고 수가 없다(배열 칸 [0] · [1] 빼고)', added.length + '자');
}

// ── ⓑ war-live 운영 함수(`_muStepFollow`) ─────────────────────────────────────
console.log('\n[ⓑ] war-live 추종 — 칸 없음 = 종전 · 칸 있음 = 걸음');
const WarLive = require(path.join(ROOT, 'server', 'war-live.js'));
const WL = WarLive.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30 });
const WALK = 64 / 32 * WL.STEP_DT;   // 존 걸음 정본(64 px/s · zone MOVE_SPEED) ÷ 셀 32 px × 스텝 — 하네스가 존 문과 같은 식으로 센다
const mk = () => { const g = WL.buildGroup([{ type: 'champion', pid: 'a' }, { type: 'spear', pid: 'b' }], 'line', { cx: 100, cy: 100 }, 0, 7);
  g.units[0].x = 45; g.units[0].y = 100; g.units[1].x = 40; g.units[1].y = 90; g.units[1].jx = 0; g.units[1].jy = 0; return g; };
{
  const g0 = mk(); WL._muStepFollow(g0, WL.MU.FOLLOW_CAP);
  ok(g0.units[0].x === 100 && g0.units[0].y === 100, 'ⓑ 칸 없음(끔) — 지휘 몸은 한 스텝에 원점(55칸을 한 번에 — 종전 튐)', `${g0.units[0].x},${g0.units[0].y}`);
  const s0 = Math.hypot(g0.units[1].x - 40, g0.units[1].y - 90);
  ok(Math.abs(s0 - WL.MU.FOLLOW_CAP) < 1e-9, 'ⓑ 칸 없음(끔) — 병사 한 걸음 = FOLLOW_CAP(5칸)', s0.toFixed(3));
  const g1 = mk(); g1._t790Walk = WALK; let maxC = 0, maxS = 0, n = 0;
  for (; n < 5000; n++) { const a = [g1.units[0].x, g1.units[0].y], b = [g1.units[1].x, g1.units[1].y]; WL._muStepFollow(g1, WL.MU.FOLLOW_CAP);
    maxC = Math.max(maxC, Math.hypot(g1.units[0].x - a[0], g1.units[0].y - a[1])); maxS = Math.max(maxS, Math.hypot(g1.units[1].x - b[0], g1.units[1].y - b[1]));
    if (g1.units[0].x === 100 && g1.units[0].y === 100) break; }
  ok(maxC <= WALK + 1e-12 && maxS <= WALK + 1e-12, 'ⓑ 칸 있음(켬) — 지휘 몸 · 병사 스텝마다 ≤ 몸 걸음(2 m/s × 1/30 s)', `지휘 ${(maxC / WL.STEP_DT).toFixed(3)} · 병사 ${(maxS / WL.STEP_DT).toFixed(3)} 칸/초`);
  ok(g1.units[0].x === 100 && Math.abs((n + 1) - 55 / WALK) <= 1, 'ⓑ 칸 있음(켬) — 지휘 몸이 원점에 닿는 걸음 수 = 거리 ÷ 걸음(55칸 · 끝 한 걸음은 소수 나머지)', `${n + 1} 걸음 · ${((n + 1) * WL.STEP_DT).toFixed(1)}초 · 55 ÷ 걸음 = ${(55 / WALK).toFixed(3)}`);
  //   ★칸 0 = 종전 비트 — 같은 대형 두 벌(하나는 칸 0)을 500 스텝 돌려 자리가 한 비트도 안 갈린다
  const gA = mk(), gB = mk(); gB._t790Walk = 0;
  for (let i = 0; i < 500; i++) { gA.cmd.cx += 0.37; gB.cmd.cx += 0.37; WL._muStepFollow(gA, WL.MU.FOLLOW_CAP); WL._muStepFollow(gB, WL.MU.FOLLOW_CAP); }
  ok(gA.units.every((u, i) => u.x === gB.units[i].x && u.y === gB.units[i].y), 'ⓑ ★칸 0 — 종전과 비트 같다(500 스텝 · 원점이 걸음보다 빨리 가는 판)');
  //   막힌 칸 안에 선 걷는 몸 — 발자국 색인이 몸보다 뒤에 서면 몸이 칸 안에 남는다(전쟁 자 · test-war-world ⓐ 판: 마을 회관 한가운데 100.5,100.5).
  //   한 걸음(0.067칸)이 작아 칸 안 다음 점은 늘 막힘 — 종전 문(다음 점이 열렸을 때만)으로는 못 나온다 ⇒ 켬은 칸 안이면 곧은 걸음으로 걸어 나온다.
  const BLK = (cx, cy) => cx >= 98 && cx < 103 && cy >= 98 && cy < 103;   // 회관 발자국 5×5칸
  const WLb = WarLive.createWarLive({ cellPx: 32, pxPerM: 32, tickHz: 30, blockedCell: BLK });
  const mkB = () => { const g = WLb.buildGroup([{ type: 'dagger', pid: 'z' }], 'line', { cx: 110.5, cy: 100.5 }, 0, 3); g.units[0].x = 100.5; g.units[0].y = 100.5; return g; };
  const gw = mkB(); gw._t790Walk = WALK; let out = -1, mx = 0;
  for (let i = 0; i < 2000; i++) { const a = [gw.units[0].x, gw.units[0].y]; WLb._muStepFollow(gw, WLb.MU.FOLLOW_CAP); mx = Math.max(mx, Math.hypot(gw.units[0].x - a[0], gw.units[0].y - a[1])); if (out < 0 && !BLK(gw.units[0].x, gw.units[0].y)) out = i + 1; }
  ok(out > 0 && mx <= WALK + 1e-12 && gw.units[0].x === 110.5, 'ⓑ 켬 — 막힌 칸 안에 선 지휘 몸은 걸어서 나온다(한 걸음 ≤ 몸 걸음 · 나온 뒤 원점까지)', `칸 밖 ${out} 걸음(${(out * WL.STEP_DT).toFixed(1)}초) · 끝 ${gw.units[0].x.toFixed(2)}`);
  const gf2 = WLb.buildGroup([{ type: 'dagger', pid: 'y' }, { type: 'spear', pid: 'x' }], 'line', { cx: 110.5, cy: 100.5 }, 0, 3); gf2.units[0].x = 110.5; gf2.units[0].y = 100.5; gf2.units[1].x = 100.5; gf2.units[1].y = 100.5;
  gf2._t790Walk = WALK; for (let i = 0; i < 2000; i++) WLb._muStepFollow(gf2, WLb.MU.FOLLOW_CAP);
  ok(!BLK(gf2.units[1].x, gf2.units[1].y), 'ⓑ 켬 — 막힌 칸 안에 선 병사도 걸어서 나와 슬롯에 붙는다', `${gf2.units[1].x.toFixed(2)},${gf2.units[1].y.toFixed(2)}`);
}

// ── ⓒ 존 운영 문(아이 프로세스 — 손잡이는 모듈을 싣는 순간 읽는다) ──────────────────
console.log('\n[ⓒ] 존 운영 문 — 슬롯 놓기 · 귀환 · 늦음 셈(켬 · 끔)');
const child = (knob) => {
  const env = Object.assign({}, process.env); if (knob) env.T790_NO_SNAP = '1'; else delete env.T790_NO_SNAP;
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}),WLM=require(${JSON.stringify(path.join(ROOT, 'server', 'war-live.js'))});`
    + `const players=new Map(),live=WLM.createWarLive({cellPx:32,pxPerM:32,tickHz:30});`
    + `const H=V.__p3Bind({warLive:live,world:{day:12},dayMs:10000,deps:{players,moveSpeed:64,npcs:new Set(),broadcast(){}},_warStat:{standoff:0}});`
    + `const out={};`
    //   슬롯 놓기 — 둘 다 마을(40,90 · 41,91)에 선 몸 · 원점 100,100
    + `{const g=live.buildGroup([{type:'champion',pid:'a'},{type:'spear',pid:'b'}],'line',{cx:100,cy:100},0,7);g.units[0].x=40;g.units[0].y=90;g.units[1].x=41;g.units[1].y=91;`
    + `H._warSnapToSlots(g);out.snap={c:[g.units[0].x,g.units[0].y],s:[g.units[1].x,g.units[1].y],walk:g._t790Walk==null?null:g._t790Walk,n:H._t790Stat.walk};}`
    //   걸음 정본이 없는 판(하네스 목 — deps 에 moveSpeed 없음) — 켬이어도 종전대로 놓는다(걷지 못하는 몸을 세워 두지 않는다)
    + `{const keep=H.state.deps.moveSpeed;H.state.deps.moveSpeed=undefined;const g=live.buildGroup([{type:'champion',pid:'a2'}],'line',{cx:100,cy:100},0,7);g.units[0].x=40;g.units[0].y=90;H._warSnapToSlots(g);out.snapNoSpeed={c:[g.units[0].x,g.units[0].y],walk:g._t790Walk==null?null:g._t790Walk,n:H._t790Stat.walk};H.state.deps.moveSpeed=keep;}`
    //   귀환 — 살아남은 몸 하나가 결판 자리(1000,1000) · 길 머리 = 방어 마을 끝(1100,1000)
    + `{const p={pid:'s1',x:1000*32,y:1000*32,_muType:'champion'};players.set('s1',p);const atk={name:'A',ccx:900,ccy:1000,dbId:1},def={name:'B',ccx:1100,ccy:1000,dbId:2};`
    + `const body={w:{id:6,atk,def,marchDays:1},pts:[{x:900*32,y:1000*32},{x:1100*32,y:1000*32}],prog:0};H._warSetupReturn(body,['s1'],false);const x0=p.x;H._warPaceReturn(body,0,33);`
    + `out.ret={walk:body.retGroup._t790Walk==null?null:body.retGroup._t790Walk,moved:(p.x-x0)/32,cmd:body.cmd};`
    //   늦음 셈 — 그 귀환 대형(지휘 몸이 아직 길 머리 밖) · 교전에 풀린 몸만 남은 대형(안 센다)
    + `out.lag=H._t790Lag(body.retGroup);out.late=H._t790Stat.late;out.t790Late=H.state._warStat.t790Late==null?null:H.state._warStat.t790Late;`
    + `const g2=live.buildGroup([{type:'spear',pid:'c'}],'line',{cx:50,cy:50},0,3);g2.units[0].x=10;g2.units[0].y=10;g2._t790Walk=1;g2.units[0].bu={ctl:false};out.lagBattle=H._t790Lag(g2);}`
    + `process.stdout.write(JSON.stringify(out));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const off = child(false), on = child(true);
  ok(off.snap.c[0] === 100 && off.snap.c[1] === 100 && off.snap.s[0] !== 41 && off.snap.walk === null && off.snap.n === 0,
    'ⓒ 끔 — 슬롯 놓기: 지휘 몸 · 병사를 그 자리(마을 → 원점)에 놓는다(종전) · 칸 0', JSON.stringify(off.snap));
  ok(on.snap.c[0] === 40 && on.snap.c[1] === 90 && on.snap.s[0] === 41 && on.snap.s[1] === 91 && Math.abs(on.snap.walk - WALK) < 1e-12 && on.snap.n === 1,
    'ⓒ 켬 — 슬롯 놓기: 안 놓는다(몸 그 자리) · 칸 = 몸 걸음 · 걸음 셈 1', JSON.stringify(on.snap));
  ok(on.snapNoSpeed.c[0] === 100 && on.snapNoSpeed.c[1] === 100 && on.snapNoSpeed.walk === null && on.snapNoSpeed.n === on.snap.n,
    'ⓒ 켬 — 걸음 정본이 없는 판(deps 에 moveSpeed 없음)은 종전대로 놓는다 · 칸 0 · 걸음 셈 그대로', JSON.stringify(on.snapNoSpeed));
  ok(Math.abs(off.ret.moved - 100) < 1e-9 && off.ret.walk === null, 'ⓒ 끔 — 귀환 첫 틱: 살아남은 몸이 결판 자리 → 길 머리 100칸(종전 튐)', `${off.ret.moved}칸`);
  ok(Math.abs(on.ret.moved - WALK) < 1e-9 && Math.abs(on.ret.walk - WALK) < 1e-12, 'ⓒ 켬 — 귀환 첫 틱: 한 걸음(몸 걸음)만 · 대형 칸', `${on.ret.moved.toFixed(4)}칸`);
  ok(off.lag === 0 && off.late === 0 && off.t790Late === null, 'ⓒ 끔 — 늦음 셈 0 · 전쟁 셈에 칸 0(`t790Late` 없음 — 끔 = 종전 바이트)', JSON.stringify({ lag: off.lag, late: off.late, t790Late: off.t790Late }));
  ok(on.lag > 99 && on.late === 1 && on.t790Late === 1, 'ⓒ 켬 — 지휘 몸이 원점 밖(길 머리까지 100칸 − 한 걸음)이면 늦음 하나 · 전쟁 셈 `t790Late` 1', `${on.lag.toFixed(2)} m`);
  ok(on.lagBattle === 0, 'ⓒ 켬 — 교전에 풀린 몸(battle-core 가 모는 몸)만 남은 대형은 안 센다', String(on.lagBattle));
}

// ── ⓓ T804 — 걷는 몸의 길(막혔을 때만 슬롯까지 길 · 그 길은 끝까지) · 전진 풀기 걸음(T790 손잡이 안) ─────────────
//   무대: 가로벽(x 70..130 · y 140..144)과 양끝에서 위로 꺾인 갈고리(x 70..74 · 126..130 · y 120..144 — 주머니) — 몸(100.5, 90.5) → 슬롯(100.5, 200.5).
//   곧은 줄은 첫 40 m 만 보니 y 100 까지는 "열림" · 그 아래는 "막힘" — T790 W3 의 3 m 고리가 바로 그 띠에서 났다(곧게 ↔ 우회 갈아타기).
//   전진 풀기 무대는 따로(회관 발자국 300..304 · 98..102).
//   존 술어는 운영 그대로(`_warBlockedCell` ← 주입 지형 술어) · 나선은 존 정본 `_standCellNear` 를 소스에서 꺼내 그대로(사본 0).
console.log('\n[ⓓ] T804 — 걷는 몸의 길 · 전진 풀기 걸음(아이 프로세스 켬/끔)');
{
  const fol = fnBody(CL, '_muStepFollow'), way = fnBody(CV, '_t804Way'), loc = fnBody(CV, '_t804Local'), road = fnBody(CV, '_t804Road'), wout = fnBody(CV, '_t804WalkOut'), det = fnBody(CV, '_warDetourFor'), wgt = fnBody(CV, '_warWalkGroupTo'), rel = fnBody(CV, '_warReleaseAdv');
  ok(/if \(wc && g\.detour && g\.detour\.walk\)/.test(fol) && fol.indexOf('g.detour.walk') < fol.indexOf('g.detour.clear') && /if \(T790_NO_SNAP\) \{ det\.walk = /.test(det),
    'ⓓ 정적 — war-live 는 걷는 몸(칸 있음)일 때만 호스트 길 훅을 먼저 겨눈다 · 훅은 켬에서만 선다(끔 = 무동작)');
  //   ★[T821] 묻는 문이 걸음 프리셋의 재개형 문(`localPathBegin` — `localPath` 와 한 프리셋 `_localOpts`)으로 바뀌었다 — 같은 순서 검사를 그 문에 건다(느슨하게 안 한다).
  ok(/PathCore\.localPathBegin\(/.test(loc) && !/PathCore\.|_search|new Map|new Set/.test(way + road) && !/routePath|_search/.test(loc) && loc.indexOf('_warClearLine') < loc.indexOf('PathCore.localPathBegin(') && loc.indexOf('mem._t804f === key') < loc.indexOf('PathCore.localPathBegin(')
    && way.indexOf('_t804Local(') < way.lastIndexOf('_t804Road(') && /_t804Local\(R, /.test(road),
    'ⓓ 정적 — 길은 경로 정본 path-core 걸음 프리셋(★T821 재개형 문 `localPathBegin` · 탐색 사본 0) · 묻기 앞에 곧은 줄 · 곧은 한 걸음이 열렸나를 본다(막혔을 때만 묻는다) · 길이 없던 목표 칸은 되묻지 않는다 · 못 찾으면 행군로 점을 하나씩(점 사이도 같은 걸음 프리셋 · 새 탐색 0)');
  ok(/T790_NO_SNAP && d > cap && g\._t790Walk > 0/.test(wgt) && /T790_NO_SNAP && g && g\.units && g\._t790Walk > 0 && _t804WalkOut\(g\)\) return;/.test(rel) && /Math\.min\(g\._t790Walk, d\)/.test(wout),
    'ⓓ 정적 — 주둔 원점 · 전진 풀기도 켬 · 몸 걸음 칸이 있을 때만(끔 = 종전 글자) · 풀기 걸음 = 몸 걸음');
  const added = [way, loc, road, fnBody(CV, '_t804RoadPts'), fnBody(CV, '_t804Nearest'), wout].join(' ').replace(/\[[01]\]/g, '[]');
  ok(!/[^\w.'D](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(added.replace(/\+ 2\)/g, '+ _)').replace(/0\.5/g, '_').replace(/length < 2\)/g, 'length < _)').replace(/\* 65536 \+/g, '* _ +')) && !/Date\.now|setTimeout|Math\.random/.test(added),
    'ⓓ 정적 — 새 수 0(창 `FOLLOW_CAP + 2` · 칸 가운데 0.5 · 길 길이 `< 2` 는 `_warPathNext` 와 같은 글자 · 칸 열쇠 `× 65536 +` 는 villages 칸 열쇠 관례) · 시한 0 · 주사위 0', added.length + '자');
}
const child804 = (knob) => {
  const env = Object.assign({}, process.env); if (knob) env.T790_NO_SNAP = '1'; else delete env.T790_NO_SNAP;
  const js = `const path=require('path'),fs=require('fs'),ROOT=${JSON.stringify(ROOT)};const V=require(path.join(ROOT,'server','villages.js')),WLM=require(path.join(ROOT,'server','war-live.js'));`
    + `const ZS=fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8');const mm=/function _standCellNear\\(x0, y0, blocked\\) \\{[\\s\\S]*?\\n\\}/.exec(ZS);`
    + `const stand=new Function('ZONE','_BLOCKED_STAND',mm[0]+'\\nreturn _standCellNear;')({zoneWidth:1e7,zoneHeight:1e7},()=>false);const SZ=32;`
    + `const W=new Set();const add=(x0,x1,y0,y1)=>{for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)W.add(x*65536+y);};add(70,130,140,144);add(70,74,120,144);add(126,130,120,144);add(300,304,98,102);`
    + `const wallAt=(cx,cy)=>W.has(Math.floor(cx)*65536+Math.floor(cy));let H=null;const live=WLM.createWarLive({cellPx:32,pxPerM:32,tickHz:30,blockedCell:(x,y)=>H._warBlockedCell(x,y)});`
    + `H=V.__p3Bind({warLive:live,world:{day:12},dayMs:10000,deps:{players:new Map(),moveSpeed:64,npcs:new Set(),broadcast(){},isTerrainBlockedLocal:(px,py)=>wallAt(px/SZ,py/SZ),treeCellBlocked:()=>false,standCellNear:stand},_warStat:{standoff:0}});`
    + `H.state._warTerrMemo=new Map();H.state._warRectCells=new Set();H.state._warRects=[];const out={};`
    + `const body={pts:[{x:100.5*SZ,y:90.5*SZ},{x:60.5*SZ,y:90.5*SZ},{x:60.5*SZ,y:200.5*SZ},{x:100.5*SZ,y:200.5*SZ}]};`
    //   ① 몸 — 긴 벽 너머 슬롯(지휘 몸 하나 · 원점 = 슬롯) · 훅 있음 / 훅 없음(T790 만)
    + `const walk=(hook,sx,sy,n0)=>{const g=live.buildGroup([{type:'champion',pid:'w'+hook+sx}],'line',{cx:100.5,cy:200.5},0,7);g.units[0].x=sx;g.units[0].y=sy;H._t790Mark(g);g.detour=H._warDetourFor(body);if(!hook)delete g.detour.walk;`
    + `const a0=H._t804Stat.ask;let n=0,blk=0,mx=0,arr=-1,pl=0;for(;n<(n0||30000);n++){const p=[g.units[0].x,g.units[0].y];live._muStepFollow(g,live.MU.FOLLOW_CAP);const d=Math.hypot(g.units[0].x-p[0],g.units[0].y-p[1]);mx=Math.max(mx,d);pl+=d;if(wallAt(g.units[0].x,g.units[0].y))blk++;`
    + `if(arr<0&&Math.hypot(g.units[0].x-100.5,g.units[0].y-200.5)<=live.MU.FOLLOW_SNAP)arr=n+1;}return{walk:g._t790Walk==null?null:g._t790Walk,arr,left:Math.hypot(g.units[0].x-100.5,g.units[0].y-200.5),blk,mx,pl,asks:H._t804Stat.ask-a0,at:[g.units[0].x,g.units[0].y]};};`
    + `out.hook=walk(true,100.5,90.5);out.bare=walk(false,100.5,90.5);out.open=walk(true,100.5,150.5,2000);out.stay=walk(true,100.5,90.5,8000);`
    //   ①' 걸음 프리셋이 못 찾은 목표(탐색 상한 — 먼 진) — 그 기억을 미리 세워 두면 몸의 행군로를 길 투영점까지 따라 닿는다
    + `{const g=live.buildGroup([{type:'champion',pid:'rd'}],'line',{cx:100.5,cy:200.5},0,7);g.units[0].x=100.5;g.units[0].y=90.5;H._t790Mark(g);g.detour=H._warDetourFor(body);g.units[0]._t804f=100*65536+200;`
    + `const a0=H._t804Stat.ask,r0=H._t804Stat.road;let n=0,arr=-1,blk=0,mx=0,minX=1e9;for(;n<30000;n++){const p=[g.units[0].x,g.units[0].y];live._muStepFollow(g,live.MU.FOLLOW_CAP);mx=Math.max(mx,Math.hypot(g.units[0].x-p[0],g.units[0].y-p[1]));minX=Math.min(minX,g.units[0].x);if(wallAt(g.units[0].x,g.units[0].y))blk++;`
    + `if(Math.hypot(g.units[0].x-100.5,g.units[0].y-200.5)<=live.MU.FOLLOW_SNAP){arr=n+1;break;}}out.road={arr,blk,mx,minX,asks:H._t804Stat.ask-a0,road:H._t804Stat.road-r0};}`
    //   ② 주둔 원점 — 원점이 벽 너머 진으로 걷는다(\`_warWalkGroupTo\` 운영 문 · 걸음 상한 = 몸 걸음)
    + `{const g=live.buildGroup([{type:'champion',pid:'o'}],'line',{cx:100.5,cy:90.5},0,7);g.units[0].x=100.5;g.units[0].y=90.5;H._t790Mark(g);g.detour=H._warDetourFor(body);const cap=64/32*live.STEP_DT;const a0=H._t804Stat.ask;let n=0,arr=-1,blk=0;`
    + `for(;n<30000;n++){H._warWalkGroupTo(g,{cx:100.5,cy:200.5},cap);if(wallAt(g.cmd.cx,g.cmd.cy)||wallAt(g.units[0].x,g.units[0].y))blk++;if(arr<0&&Math.hypot(g.units[0].x-100.5,g.units[0].y-200.5)<=live.MU.FOLLOW_SNAP){arr=n+1;break;}}`
    + `out.origin={arr,blk,asks:H._t804Stat.ask-a0,cmd:[g.cmd.cx,g.cmd.cy]};}`
    //   ③ 전진 풀기 — 회관 발자국(98..102) 한가운데 선 몸 · 열린 칸 몸
    + `{const g=live.buildGroup([{type:'spear',pid:'r1'},{type:'spear',pid:'r2'}],'line',{cx:310.5,cy:100.5},0,9);g.units[0].x=302.5;g.units[0].y=100.5;g.units[1].x=290.5;g.units[1].y=100.5;H._t790Mark(g);`
    + `const A={side:'A',released:false},f={ctx:{units:[]}};let n=0,mx=0;for(;n<200&&!A.released;n++){const p=[g.units[0].x,g.units[0].y];H._warReleaseAdv(f,A,g);mx=Math.max(mx,Math.hypot(g.units[0].x-p[0],g.units[0].y-p[1]));}`
    + `out.rel={calls:n,released:A.released,mx,at:[g.units[0].x,g.units[0].y],blkEnd:wallAt(g.units[0].x,g.units[0].y),other:[g.units[1].x,g.units[1].y],walk:g._t790Walk==null?null:g._t790Walk};}`
    + `out.stat=Object.assign({},H._t804Stat);process.stdout.write(JSON.stringify(out));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const on = child804(true), off = child804(false);
  const h = on.hook, b = on.bare;
  ok(h.arr > 0 && h.blk === 0 && h.mx <= WALK + 1e-12 && h.asks === 1,
    'ⓓ 켬 — 긴 벽 너머 슬롯: 막힌 띠에서 한 번 묻고(path-core 걸음 프리셋) 그 길을 끝까지 따라 닿는다 · 막힌 칸 0 · 스텝마다 ≤ 몸 걸음',
    `${h.arr}걸음(${(h.arr * WL.STEP_DT).toFixed(0)}초) · 걸은 길 ${h.pl.toFixed(0)} m · 물음 ${h.asks}`);
  ok(b.arr < 0 && b.left > 50 && b.pl > 10 * b.left && b.asks === 0,
    'ⓓ ★미끼(훅 없음 = T790 만) — 같은 몸이 곧게 ↔ 우회를 갈아타며 40 m 띠에서 고리를 돈다(못 닿는다)',
    `30,000걸음 뒤 슬롯까지 ${b.left.toFixed(0)} m · 걸은 길 ${b.pl.toFixed(0)} m · 자리 ${b.at.map((v) => v.toFixed(1))}`);
  ok(on.open.arr > 0 && on.open.asks === 0 && Math.abs(on.open.arr - (50 - WL.MU.FOLLOW_SNAP) / WALK) <= 1,
    'ⓓ 켬 — 곧은 줄이 열렸으면 묻지 않는다(묻기는 막혔을 때만) · 걸음 수 = (거리 − 닿음 반경) ÷ 걸음', `${on.open.arr}걸음 · 물음 ${on.open.asks}`);
  ok(on.road.arr > 0 && on.road.blk === 0 && on.road.mx <= WALK + 1e-12 && on.road.road > 0 && on.road.minX < 70,
    'ⓓ 켬 — 걸음 프리셋이 못 찾은 목표(탐색 상한 · 먼 진)는 되묻지 않고 몸의 행군로(T541 ⓐ 우회와 같은 문)를 길 투영점까지 끝까지 따라 닿는다(곧은 줄로 갈아타지 않는다)',
    `${on.road.arr}걸음 · 행군로 걸음 ${on.road.road} · 물음 ${on.road.asks} · 가장 서쪽 x ${on.road.minX.toFixed(1)}(길이 벽 서쪽 끝을 돈다)`);
  ok(on.stay.arr > 0 && on.stay.asks === 1 && on.stay.left <= 0.35,
    'ⓓ 켬 — 닿은 뒤(같은 목표) 다시 묻지 않는다(T370 ② 꼴 — 길 끝에서 놓고, 그다음은 막혔을 때만)', `8,000걸음 · 물음 ${on.stay.asks}`);
  ok(on.origin.arr > 0 && on.origin.blk === 0 && on.origin.asks >= 1 && off.origin.arr < 0,
    'ⓓ 켬 — 주둔 원점(`_warWalkGroupTo`)도 막히면 길 — 원점 · 지휘 몸이 벽을 돌아 진에 닿는다 · ★미끼: 끔(곧게 + 축 미끄럼)은 벽 앞에 선다',
    `켬 ${on.origin.arr}걸음 · 물음 ${on.origin.asks} · 끔 원점 ${off.origin.cmd.map((v) => v.toFixed(1))}`);
  ok(on.rel.released && on.rel.calls > 1 && on.rel.mx <= WALK + 1e-12 && !on.rel.blkEnd && on.rel.other[0] === 290.5,
    'ⓓ 켬 — 전진 풀기: 막힌 칸(회관 발자국) 안의 몸은 가장 가까운 설 칸까지 몸 걸음으로 걸어 나온 뒤에 풀린다(한 칸 옮기기 0) · 열린 칸 몸은 그대로',
    `${on.rel.calls}번(${on.rel.calls - 1}걸음) · 한 번 최대 ${on.rel.mx.toFixed(4)}칸 · 끝 ${on.rel.at.map((v) => v.toFixed(2))}`);
  ok(off.rel.released && off.rel.calls === 1 && off.rel.mx > 1 && !off.rel.blkEnd && off.rel.walk === null,
    'ⓓ 끔 — 전진 풀기는 종전(가장 가까운 설 칸으로 한 번에 · T541 ⓑ) · 칸 0', `한 번에 ${off.rel.mx.toFixed(2)}칸`);
}

// ── ⓔ T821 — 먼 진 걷기: 재개형 걸음 탐색(T804 회부 1 ㉠ · T790 손잡이 안) ─────────────
//   무대: 컵(안 x 1000..1159 · y 1000..1119 · 벽 = 왼 x 999 · 오른 x 1160 · 아래 y 1120 — 위는 열림) — 몸(1080.5, 1060.5) → 슬롯(1080.5, 1180.5).
//   곧은 줄은 바닥 벽에 막힌다. 탐색은 컵 안을 다 열고서야 위로 나가 돌아 내려간다 — 걸음 프리셋 정본 상한(16,384칸 꺼냄) 안에선 못 찾고
//   재개형 상한(250,000) 안에선 찾는다(26,185칸 꺼냄 · 길 405칸). T804 라면 "길 없음"이었다(아래 미끼 — 같은 물음을 종전 동기 문에 넣으면 null).
//   닫힌 상자(510..520 · 490..500 둘레) 안의 몸 — 첫 몫 안에 열린 칸이 바닥난다 = 종전과 같이 곧바로 "길 없음"(서지 않는다).
console.log('\n[ⓔ] T821 — 먼 진 걷기: 재개형 걸음 탐색(아이 프로세스 켬/끔)');
{
  const loc = fnBody(CV, '_t804Local'), push = fnBody(CV, '_t821Push'), done = fnBody(CV, '_t821Done');
  const CP = codeOf(fs.readFileSync(path.join(ROOT, 'sim', 'path-core.js'), 'utf8'));
  ok(/PathCore\.localPathBegin\([^;]*maxNodes: PathCore\.ROUTE_MAX_POPS \}\)/.test(loc) && /do \{ r = PathCore\.pathStep\(S, 1\); \} while \(!r\.done && S\.pops <= PathCore\.LOCAL_MAX_NODES\);/.test(loc)
    && /if \(!_t821Push\(mem, PATH_STEP_NODES\)\) return \{ x, y \};/.test(loc) && /if \(!r\.done\) \{ _t821Stat\.far\+\+; return \{ x, y \}; \}/.test(loc) && /PathCore\.pathStep\(J\.S, budget\)/.test(push)
    && loc.indexOf('mem._t821s') < loc.indexOf('if (P) {') && /R\._t821s = null;/.test(fnBody(CV, '_t804Road')) && /mem\._t821s = null;/.test(fnBody(CV, '_t804Way')),
    'ⓔ 정적 — 묻기는 걸음 프리셋의 재개형 문(상한 = 재개형 문 정본 이름 `ROUTE_MAX_POPS`) · 첫 몫 = 걸음 프리셋 정본 상한(`LOCAL_MAX_NODES` 를 넘는 꺼냄까지 — 종전 동기 물음 그대로) · 그다음 걸음마다 T85 알갱이(`PATH_STEP_NODES`) · 그동안 제 자리(선다) · 다리를 넘기거나 막힌 칸이면 버린다');
  ok(fnBody(CP, 'localPath').includes('return _search(sx, sy, gx, gy, _localOpts(opts));') && fnBody(CP, 'localPathBegin').includes('return _searchBegin(sx, sy, gx, gy, _localOpts(opts));')
    && /maxPops: opts\.maxNodes \|\| LOCAL_MAX_NODES,/.test(fnBody(CP, '_localOpts')) && /maxPops: opts\.maxPops \|\| ROUTE_MAX_POPS,/.test(fnBody(CP, '_routeOpts')) && /const LOCAL_MAX_NODES = 16384, ROUTE_MAX_POPS = 250000;/.test(CP),
    'ⓔ 정적 — path-core: 걸음 프리셋 한 곳(`_localOpts`)을 동기 · 재개형 두 문이 같이 쓴다(사본 0) · 정본 상한 둘은 종전 글자(16384 · 250000)에 이름만 붙였다');
  const added = [push, done].join(' ');
  ok(!/[^\w.'D](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(added.replace(/length < 2\)/g, 'length < _)')) && !/Date\.now|setTimeout|Math\.random|performance|hrtime/.test(added + loc),
    'ⓔ 정적 — 새 수 0 · 시한 0(틱 예산은 시간이 아니라 꺼냄 수 — 결정론) · 주사위 0', added.length + '자');
}
const child821 = (knob) => {
  const env = Object.assign({}, process.env); if (knob) env.T790_NO_SNAP = '1'; else delete env.T790_NO_SNAP;
  const js = `const path=require('path'),fs=require('fs'),ROOT=${JSON.stringify(ROOT)};const V=require(path.join(ROOT,'server','villages.js')),WLM=require(path.join(ROOT,'server','war-live.js')),PC=require(path.join(ROOT,'sim','path-core.js'));`
    + `const ZS=fs.readFileSync(path.join(ROOT,'server/zone.js'),'utf8');const mm=/function _standCellNear\\(x0, y0, blocked\\) \\{[\\s\\S]*?\\n\\}/.exec(ZS);`
    + `const stand=new Function('ZONE','_BLOCKED_STAND',mm[0]+'\\nreturn _standCellNear;')({zoneWidth:1e7,zoneHeight:1e7},()=>false);const SZ=32;`
    + `const W=new Set();const add=(x0,x1,y0,y1)=>{for(let x=x0;x<=x1;x++)for(let y=y0;y<=y1;y++)W.add(x*65536+y);};add(999,999,1000,1120);add(1160,1160,1000,1120);add(999,1160,1120,1120);add(509,521,489,489);add(509,521,501,501);add(509,509,489,501);add(521,521,489,501);`
    + `const wallAt=(cx,cy)=>W.has(Math.floor(cx)*65536+Math.floor(cy));let H=null;const live=WLM.createWarLive({cellPx:32,pxPerM:32,tickHz:30,blockedCell:(x,y)=>H._warBlockedCell(x,y)});`
    + `H=V.__p3Bind({warLive:live,world:{day:12},dayMs:10000,deps:{players:new Map(),moveSpeed:64,npcs:new Set(),broadcast(){},isTerrainBlockedLocal:(px,py)=>wallAt(px/SZ,py/SZ),treeCellBlocked:()=>false,standCellNear:stand},_warStat:{standoff:0}});`
    + `H.state._warTerrMemo=new Map();H.state._warRectCells=new Set();H.state._warRects=[];const out={};const T=H._t821Stat||{};const snap=()=>Object.assign({},H._t804Stat,{t821:Object.assign({},T)});`
    + `const blk=(x,y)=>H._warBlockedCell(x,y),O={blocked:blk,blockedStep:(a,b,c,d)=>blk(c,d)};`
    + `out.sync=JSON.stringify(PC.localPath(1080,1060,1080,1180,O));const far=PC.localPathBegin(1080,1060,1080,1180,Object.assign({maxNodes:PC.ROUTE_MAX_POPS},O));const farR=PC.pathStep(far,0);out.farPops=far.pops;out.farLen=farR.path?farR.path.length:null;const FAR=JSON.stringify(farR.path);`
    //   ① 몸 — 컵 안에서 바닥 너머 슬롯(지휘 몸 하나 · 원점 = 슬롯). 행군로는 곧은 두 점(벽을 지난다 — 행군로로 가면 못 닿는다)
    + `const body={pts:[{x:1080.5*SZ,y:1060.5*SZ},{x:1080.5*SZ,y:1180.5*SZ}]};`
    + `const walk=(pid,sx,sy,gx,gy,N)=>{const g=live.buildGroup([{type:'champion',pid}],'line',{cx:gx,cy:gy},0,7);g.units[0].x=sx;g.units[0].y=sy;H._t790Mark(g);g.detour=H._warDetourFor(body);`
    + `const s0=snap();let n=0,blk=0,mx=0,arr=-1,stand=0,movedPend=0,dpMax=0,pathEq=null,trace=[];for(;n<(N||30000);n++){const u=g.units[0],p=[u.x,u.y],q0=u._t821s?u._t821s.S.pops:null;live._muStepFollow(g,live.MU.FOLLOW_CAP);`
    + `if(q0!=null&&u._t821s)dpMax=Math.max(dpMax,u._t821s.S.pops-q0);if(pathEq===null&&u._t804p&&(u._t821s===null||u._t821s===undefined)&&(s0.t821.found||0)<(T.found||0))pathEq=JSON.stringify(u._t804p.pts);const d=Math.hypot(u.x-p[0],u.y-p[1]);mx=Math.max(mx,d);if(u._t821s){if(d===0)stand++;else movedPend++;}if(wallAt(u.x,u.y))blk++;if(n%50===0)trace.push(u.x.toFixed(3)+','+u.y.toFixed(3));`
    + `if(arr<0&&Math.hypot(u.x-gx,u.y-gy)<=live.MU.FOLLOW_SNAP){arr=n+1;break;}}const s1=snap();let syncNull=null,farEq=null,askAt=null;if(pathEq){const P0=JSON.parse(pathEq),a=P0[0],b=P0[P0.length-1];askAt=[a.x,a.y,b.x,b.y];syncNull=PC.localPath(a.x,a.y,b.x,b.y,O)===null;farEq=JSON.stringify(PC.localPath(a.x,a.y,b.x,b.y,Object.assign({maxNodes:PC.ROUTE_MAX_POPS},O)))===pathEq;}`
    + `return{arr,blk,mx,stand,movedPend,dpMax,syncNull,farEq,askAt,asks:s1.ask-s0.ask,fail:s1.fail-s0.fail,far:(s1.t821.far||0)-(s0.t821.far||0),found:(s1.t821.found||0)-(s0.t821.found||0),steps:(s1.t821.steps||0)-(s0.t821.steps||0),at:[g.units[0].x,g.units[0].y],th:trace.join(';')};};`
    + `out.far1=walk('f1',1080.5,1060.5,1080.5,1180.5);out.far2=walk('f2',1080.5,1060.5,1080.5,1180.5);const ON=process.env.T790_NO_SNAP==='1';`
    //   (끔 판은 ①만 — 아래 셋은 걷는 몸의 판이다 · 끔이면 그 몸들은 T541 ⓐ 우회가 걸음마다 상한까지 다시 찾아 수십 초를 먹는다)
    //   ② 둘이 함께 — 컵 바닥 벽 20칸 앞 두 몸이 첫 걸음부터 각자 먼 길을 민다(Map 저장 — 번갈아 밀어도 각자 제 답)
    + `if(ON){const g=live.buildGroup([{type:'champion',pid:'pa'},{type:'spear',pid:'pb'}],'line',{cx:1080.5,cy:1180.5},0,7);g.units[0].x=1080.5;g.units[0].y=1100.5;g.units[1].x=1040.5;g.units[1].y=1100.5;H._t790Mark(g);g.detour=H._warDetourFor(body);`
    + `const tgt=(u)=>u.cmd?[g.cmd.cx,g.cmd.cy]:[g.cmd.cx+u.slx*Math.cos(g.heading)-u.sly*Math.sin(g.heading)+(u.jx||0),g.cmd.cy+u.slx*Math.sin(g.heading)+u.sly*Math.cos(g.heading)+(u.jy||0)];`
    + `const got=[null,null],had=[false,false];let n=0,dp=0,both=0;for(;n<20000&&(got[0]===null||got[1]===null);n++){const q=g.units.map((u)=>u._t821s?u._t821s.S.pops:null);live._muStepFollow(g,live.MU.FOLLOW_CAP);if(g.units[0]._t821s&&g.units[1]._t821s)both++;`
    + `g.units.forEach((u,i)=>{if(u._t821s)had[i]=true;if(q[i]!=null&&u._t821s)dp=Math.max(dp,u._t821s.S.pops-q[i]);if(got[i]===null&&had[i]&&!u._t821s&&u._t804p)got[i]=JSON.stringify(u._t804p.pts);});}`
    + `const eq=got.map((w)=>{if(!w)return false;const P0=JSON.parse(w),a=P0[0],b=P0[P0.length-1];return JSON.stringify(PC.localPath(a.x,a.y,b.x,b.y,Object.assign({maxNodes:PC.ROUTE_MAX_POPS},O)))===w&&PC.localPath(a.x,a.y,b.x,b.y,O)===null;});`
    + `out.two={n,dp,both,had,same:eq[0]&&eq[1],lens:got.map((w)=>w&&JSON.parse(w).length)};}`
    //   ③ 닫힌 상자 안의 몸 — 첫 몫 안에 열린 칸이 바닥난다: 종전과 같이 곧바로 "길 없음"(서지 않는다 · 이어 밀기 0)
    + `if(ON){const s0=snap();const g=live.buildGroup([{type:'champion',pid:'box'}],'line',{cx:515.5,cy:600.5},0,7);g.units[0].x=515.5;g.units[0].y=495.5;H._t790Mark(g);g.detour=H._warDetourFor({pts:[{x:515.5*SZ,y:495.5*SZ},{x:515.5*SZ,y:600.5*SZ}]});`
    + `live._muStepFollow(g,live.MU.FOLLOW_CAP);const s1=snap();out.box={asks:s1.ask-s0.ask,fail:s1.fail-s0.fail,far:(s1.t821.far||0)-(s0.t821.far||0),pending:!!g.units[0]._t821s};}`
    //   ④ 주둔 원점 — 원점이 컵 안에서 바닥 너머 진으로 걷는다(\`_warWalkGroupTo\` 운영 문)
    + `if(ON){const s0=snap();const g=live.buildGroup([{type:'champion',pid:'o'}],'line',{cx:1080.5,cy:1060.5},0,7);g.units[0].x=1080.5;g.units[0].y=1060.5;H._t790Mark(g);g.detour=H._warDetourFor(body);const cap=64/32*live.STEP_DT;let n=0,arr=-1,blk=0,stand=0;`
    + `for(;n<30000;n++){const p=[g.cmd.cx,g.cmd.cy];H._warWalkGroupTo(g,{cx:1080.5,cy:1180.5},cap);if(g.cmd.cx===p[0]&&g.cmd.cy===p[1]&&arr<0)stand++;if(wallAt(g.cmd.cx,g.cmd.cy)||wallAt(g.units[0].x,g.units[0].y))blk++;if(arr<0&&Math.hypot(g.units[0].x-1080.5,g.units[0].y-1180.5)<=live.MU.FOLLOW_SNAP){arr=n+1;break;}}`
    + `const s1=snap();out.origin={arr,blk,stand,asks:s1.ask-s0.ask,far:(s1.t821.far||0)-(s0.t821.far||0),found:(s1.t821.found||0)-(s0.t821.found||0),cmd:[g.cmd.cx,g.cmd.cy]};}`
    + `out.stat=snap();process.stdout.write(JSON.stringify(out));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 26 }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const on = child821(true), off = child821(false), f = on.far1;
  ok(on.sync === 'null' && on.farLen > 0 && on.farPops > 16384,
    'ⓔ [상황] 이 물음은 걸음 프리셋 정본 상한 안에선 "길 없음"(종전 동기 문 = null · T804 가 그 목표를 기억하고 행군로로 갔다) · 재개형 상한 안에선 길이 선다',
    `꺼냄 ${on.farPops} · 길 ${on.farLen}칸`);
  ok(f.arr > 0 && f.blk === 0 && f.mx <= WALK + 1e-12 && f.asks === 1 && f.far === 1 && f.found === 1 && f.fail === 0 && f.syncNull === true && f.farEq === true,
    'ⓔ 켬 — 컵 안의 몸: 바닥 벽 40 m 앞에서 한 번 묻고(그 물음은 종전 동기 문이면 null) 이어 밀어 찾은 길(동기 문에 재개형 상한을 준 답과 비트 같다)을 끝까지 따라 바닥 너머 슬롯에 닿는다 · 막힌 칸 0 · 스텝마다 ≤ 몸 걸음',
    `${f.arr}걸음(${(f.arr * WL.STEP_DT).toFixed(0)}초) · 물음 ${f.asks}(${f.askAt}) · 이어 밀기 ${f.steps}걸음`);
  ok(f.stand === f.steps && f.movedPend === 0 && f.dpMax <= 32 && f.steps >= Math.ceil((on.farPops - 16385) / 32) - 1,
    'ⓔ 켬 — 찾는 동안 몸은 선다(제 자리 · 걸음 0) · 선 걸음 = 이어 민 걸음 · 한 걸음에 미는 꺼냄 ≤ T85 알갱이(32) · 선 걸음 ≈ (꺼냄 − 첫 몫) ÷ 알갱이',
    `선 걸음 ${f.stand} · 찾는 중 움직임 ${f.movedPend} · 한 걸음 최대 꺼냄 ${f.dpMax}`);
  ok(on.far2.arr === f.arr && on.far2.th === f.th && on.far2.stand === f.stand,
    'ⓔ 켬 — 결정론: 같은 물음을 다시 걸으면 같은 걸음에 서고 같은 자취로 같은 걸음에 닿는다(벽시계 무관)', `${on.far2.arr}걸음`);
  ok(on.two.same && on.two.both > 0 && on.two.dp <= 32 && on.two.lens.every((l) => l > 0),
    'ⓔ 켬 — 두 몸이 같은 걸음에 각자 먼 길을 민다(Map 저장 — 번갈아 밀어도 각자 동기 문에 재개형 상한을 준 답과 같다 · 몸마다 걸음당 ≤ 알갱이)', `함께 민 걸음 ${on.two.both} · 길 ${on.two.lens.join(' · ')}칸`);
  ok(on.box.asks >= 1 && on.box.fail === on.box.asks && on.box.far === 0 && !on.box.pending,
    'ⓔ 켬 — 닫힌 상자 안의 몸: 첫 몫 안에 열린 칸이 바닥나면 종전과 같이 곧바로 "길 없음"(그 목표 칸 기억 · 행군로 다리도 같은 걸음에 · 이어 밀기 0 · 서지 않는다)', `물음 ${on.box.asks} · 길 없음 ${on.box.fail}`);
  ok(on.origin.arr > 0 && on.origin.blk === 0 && on.origin.far === 1 && on.origin.found === 1 && on.origin.stand >= on.far1.steps,
    'ⓔ 켬 — 주둔 원점(`_warWalkGroupTo`)도 먼 길은 이어 밀어 찾는다 — 그동안 원점이 서고 · 찾은 뒤 원점 · 지휘 몸이 컵을 돌아 진에 닿는다',
    `${on.origin.arr}걸음 · 원점이 선 걸음 ${on.origin.stand}`);
  ok(off.far1.far === 0 && off.far1.steps === 0 && off.far1.asks === 0 && off.far1.arr === 1 && off.stat.t821.far === 0 && off.stat.t821.steps === 0,
    'ⓔ 끔 — 무동작(훅 없음 · 물음 0 · 이어 밀기 0 · 종전 글자 — 칸 없는 대형의 지휘 몸은 원점에 바로 놓인다 = T790 끔)', `끔 ${off.far1.arr}걸음`);
}

// ── ⓕ T832 — 켬 판 결정론: 귀환 몸도 그날 몫(T821 회부 3 · T790 손잡이 안) ─────────────
//   갈림 첫 자리(T832 §1): 같은 씨 두 판(부하 다름)이 D15 W4 귀환 대형의 걸음 수(259 ↔ 252)에서 갈렸다 — 귀환 몸은 하루 몫 없이 **틱마다** 걸었고
//   틱 수는 벽시계(부하)를 따른다. 켬이면 귀환 몸도 하루 몫(`_t681Take` — 하루 길이 × TICK_HZ)만큼만 틱에서 걷고, 남은 몫은 하루 마감 첫 자리(`_t681Flush`)가 채운다.
//   무대: ⓒ 와 같은 귀환(결판 자리 1000,1000 → 길 머리 1100,1000 · 몸 하나) · 하루 몫 = 10초 × 30 = 300걸음.
//   마감 채우기의 시간 예산(종전 마감 조각 예산)이 걸음마다 끊는 판도 잰다(아이 안에서 `Date.now` 를 부를 때마다 1초씩 민다 — 조각마다 한 걸음 · 'retry').
//   ★[T915] 끊지 않는 판(`cut` 아님)은 마감 동안 `Date.now` 를 **한 자리에 세운다** — 종전엔 진짜 벽시계였다. 그러면 상자 부하에 따라
//     마감 예산이 가끔 끊겨 `fr`(끊긴 횟수)이 판마다 0 · 1 · 2 로 갈렸다(묶은 상자 20번 중 8번 · 칸은 `t10.fr` · `t0.fr` 뿐 — 걸음 수 · 자리는 늘 같았다).
//     ⓖ 첫 줄이 두 아이 판을 `JSON.stringify` 로 통째 견주므로 그 한 칸이 빨강을 냈다. 세운 시계면 끊지 않는 판은 늘 한 번에 끝난다(`fr` 0) — 견줌은 그대로 통째.
console.log('\n[ⓕ] T832 — 켬 판 결정론: 귀환 몸도 그날 몫(아이 프로세스 켬/끔)');
{
  const tk = fnBody(CV, 'tickWarBodies'), fl = fnBody(CV, '_t681Flush');
  ok(/if \(body\.phase === 'return'\) \{ if \(_RET_QUOTA && T681_ON && body\._t681 && !_t681Take\(body\)\) continue; _warPaceReturn\(body, now, dtMs\); continue; \}/.test(tk)
    && /if \(_RET_QUOTA && state\.warBodies\) for \(const body of state\.warBodies\.values\(\)\) \{/.test(fl) && fl.indexOf('_warPaceReturn(body, now, dtMs);') > fl.indexOf('_RET_QUOTA && state.warBodies')
    && /body\._t681q\.left--;\s*_warPaceReturn\(body, now, dtMs\);/.test(fl),
    'ⓕ 정적 — 켬이면 귀환 몸도 틱에서 그날 몫(`_t681Take`)만큼만 걷고 · 남은 몫은 하루 마감 첫 자리(`_t681Flush`)가 채운다 · 두 자리 술어 = `_RET_QUOTA`(T844 — 켬 · 끔 + 손잡이) · 끔 = 두 자리 다 종전 글자(틱마다 · 마감 고리 무동작)');
  const blk = fl.slice(fl.indexOf('_RET_QUOTA && state.warBodies'));
  ok(!/[^\w.'D](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w'])/.test(blk) && !/Math\.random/.test(blk), 'ⓕ 정적 — 새 수 0(몫 = 종전 `_t681Quota` · 시간 예산은 종전 마감 예산 그대로 — 끊겨도 몫이 남아 다음 조각에 잇는다)');
}
const child832 = (knob, t844) => {   // knob = T790_NO_SNAP · t844 = T844_RET_QUOTA(끔 판 귀환 몫)
  const env = Object.assign({}, process.env); if (knob) env.T790_NO_SNAP = '1'; else delete env.T790_NO_SNAP; if (t844 === 'default') delete env.T844_RET_QUOTA; else env.T844_RET_QUOTA = t844 ? '1' : '0';   // ★[T861] 켬 기본 — 끈 판은 명시 `=0` · 'default' = env 없음
  const js = `const V=require(${JSON.stringify(path.join(ROOT, 'server', 'villages.js'))}),WLM=require(${JSON.stringify(path.join(ROOT, 'server', 'war-live.js'))});`
    + `const players=new Map(),live=WLM.createWarLive({cellPx:32,pxPerM:32,tickHz:30});let calls=0;const sf=live._muStepFollow;live._muStepFollow=function(){calls++;return sf.apply(this,arguments);};`
    + `const H=V.__p3Bind({warLive:live,world:{day:12},dayMs:10000,deps:{players,moveSpeed:64,npcs:new Set(),broadcast(){}},_warStat:{standoff:0},war:{WARS:[]}});`
    + `const run=(nTick,flush,cut,two)=>{players.clear();const p={pid:'s1',x:1000*32,y:1000*32,_muType:'champion'};players.set('s1',p);const p2={pid:'s2',x:700*32,y:1000*32,_muType:'spear'};if(two)players.set('s2',p2);const atk={name:'A',ccx:900,ccy:1000,dbId:1},def={name:'B',ccx:1100,ccy:1000,dbId:2};`
    + `const body={w:{id:6,atk,def,marchDays:1,phase:'return'},pts:[{x:900*32,y:1000*32},{x:1100*32,y:1000*32}],prog:0};H.state.warBodies=new Map([[6,body]]);H._warSetupReturn(body,two?['s1','s2']:['s1'],false);calls=0;`
    + `for(let i=0;i<nTick;i++)H.tickWarBodies(1000+i*33);let fr=0;if(flush){const dn=Date.now;let t=dn();Date.now=cut?()=>(t+=1000):()=>t;try{while(H._t681Flush()==='retry'&&fr<1000)fr++;}finally{Date.now=dn;}}`
    + `return{x:p.x/32,y:p.y/32,x2:p2.x/32,y2:p2.y/32,calls,fr,left:body._t681q?body._t681q.left:null,walk:body.retGroup&&body.retGroup._t790Walk!=null?body.retGroup._t790Walk:null};};`
    + `const out={q:Math.round(10000*30/1000),a:run(10,true),b:run(200,true),c:run(0,true),e:run(400,true),r:run(10,true,true),d10:run(10,false),d200:run(200,false),t10:run(10,true,false,true),t200:run(200,true,false,true),t0:run(0,true,false,true),u10:run(10,false,false,true),u200:run(200,false,false,true)};process.stdout.write(JSON.stringify(out));`;
  const o = execFileSync(process.execPath, ['-e', js], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  return JSON.parse(o.slice(o.indexOf('{')));
};
{
  const on = child832(true), off = child832(false), Q = on.q;
  ok(on.a.calls === Q && on.b.calls === Q && on.c.calls === Q && on.e.calls === Q && on.a.left === 0,
    'ⓕ 켬 — 그날 걸음 수 = 하루 몫: 틱 10 · 200 · 0 · 400 번 뒤 마감 첫 자리까지 귀환 걸음이 늘 같다(틱이 몫을 넘으면 선다 · 모자라면 마감이 채운다)', `몫 ${Q} · 걸음 ${on.a.calls} · ${on.b.calls} · ${on.c.calls} · ${on.e.calls}`);
  ok(on.a.x === on.b.x && on.b.x === on.c.x && on.c.x === on.e.x && on.a.y === on.b.y && Math.abs(on.a.x - (1000 + Q * WALK)) < 1e-6,
    'ⓕ ★켬 — 결정론: 틱 수(벽시계 · 부하)가 달라도 그날 끝 귀환 몸 자리가 비트까지 같다 = 결판 자리 + 몫 × 몸 걸음', `x ${on.a.x.toFixed(4)} · ${on.b.x.toFixed(4)} · ${on.c.x.toFixed(4)} · ${on.e.x.toFixed(4)}`);
  ok(on.r.fr === Q - 10 && on.r.calls === Q && on.r.left === 0 && on.r.x === on.a.x && on.r.y === on.a.y,
    'ⓕ ★켬 — 마감 시간 예산이 걸음마다 끊어도(조각마다 한 걸음 뒤 \'retry\' · 다음 조각이 잇는다) 그날 걸음 수 · 몸 자리가 같다 — 남은 몫은 몸에 남는다', `틱 10 · 끊김 ${on.r.fr} · 걸음 ${on.r.calls} · x ${on.r.x.toFixed(4)}`);
  ok(on.d10.x !== on.d200.x && on.d10.calls === 10 && on.d200.calls === 200,
    'ⓕ [자명 통과 금지] 마감 채우기를 빼면(틱만) 틱 수가 몸 자리를 가른다 — 종전(틱마다 걷기)이 갈린 그 꼴', `틱만 10 → x ${on.d10.x.toFixed(4)} · 200 → x ${on.d200.x.toFixed(4)}`);
  ok(off.a.calls === 10 && off.b.calls === 200 && off.c.calls === 0 && off.a.walk === null && off.a.x === 1100 && off.b.x === 1100,
    'ⓕ 끔 — 종전 글자: 귀환은 틱마다(마감 고리 무동작 · 몫 안 씀) · 칸 없음 = 지휘 몸이 길 머리에 놓인다', `틱 10 · 200 · 0 → 걸음 ${off.a.calls} · ${off.b.calls} · ${off.c.calls}`);
}

// ── ⓖ T844 — 끔 판 귀환도 그날 몫(손잡이 `T844_RET_QUOTA` · ★[T861] 켬 기본 — `=0` 만 끔 · T832 회부 3) ─────────────
//   끔 판은 귀환이 틱마다 걸어, 결판이 마감 안에서 나면 그날 귀환이 0걸음 → 몸이 결판 자리에서 풀렸다(T832 §3-2 · 부하 다른 끔 두 판 D40).
//   손잡이를 켜면 끔 판 귀환도 T832 와 같은 두 자리(같은 함수 · 술어 `_RET_QUOTA` 하나)로 그날 몫을 걷는다. 끔 판 걸음 꼴(지휘 몸 놓기 · 병사 5칸 붙기)은 그대로 — 바뀌는 것은 걸음 수뿐.
//   무대: ⓕ 와 같은 귀환 · 몸 둘 판은 병사 하나(s2)를 결판 자리 서쪽 700,1000 에 둔다(슬롯까지 ~400칸 — 끔 걸음 5칸이면 ~80걸음).
console.log('\n[ⓖ] T844 — 끔 판 귀환도 그날 몫(아이 프로세스 · 손잡이 T844_RET_QUOTA 켬/끔)');
{
  const n = (CV.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n').match(/\b_RET_QUOTA\b/g) || []).length;   // 주석 밖 글자만
  ok(/const T844_RET_QUOTA = process\.env\.T844_RET_QUOTA !== '0';/.test(CV) && /const _RET_QUOTA = T790_NO_SNAP \|\| T844_RET_QUOTA;/.test(CV) && n === 3,
    'ⓖ 정적 — 손잡이 하나(★[T861] 켬 기본 · `=0` 만 끔) · 술어 하나 `_RET_QUOTA = T790_NO_SNAP || T844_RET_QUOTA` 를 두 자리(틱 귀환 줄 · 마감 귀환 고리)가 같이 쓴다(사본 0)', `_RET_QUOTA ${n}번(정의 1 · 자리 2)`);
}
{
  const k = child832(false, true), off = child832(false), dflt = child832(false, 'default'), Q = k.q;
  ok(JSON.stringify(dflt) === JSON.stringify(k), 'ⓖ ★[T861] 켬 기본 — env 없음 = `1`(아이 판 한 글자 같다 · 끈 판은 명시 `=0`)', `걸음 ${dflt.a.calls} · ${dflt.c.calls} · 병사 x ${dflt.t0.x2.toFixed(4)}`);
  ok(k.a.calls === Q && k.b.calls === Q && k.c.calls === Q && k.e.calls === Q && k.a.left === 0 && k.a.walk === null,
    'ⓖ 끔 + 손잡이 — 그날 귀환 걸음 = 하루 몫: 틱 10 · 200 · 0 · 400 번 뒤 마감 첫 자리까지 늘 같다 · 몸 걸음 칸 없음(끔 걸음 꼴 그대로)', `몫 ${Q} · 걸음 ${k.a.calls} · ${k.b.calls} · ${k.c.calls} · ${k.e.calls}`);
  ok(k.c.x === 1100 && k.a.x === 1100 && off.c.calls === 0 && off.c.x === 1000,
    'ⓖ ★끔 + 손잡이 — 결판이 마감 안에서 나 그날 틱이 0 이어도 귀환이 그날 몫을 걷는다(지휘 몸 = 길 머리 1100) · [자명 통과 금지] 손잡이 끔(종전)은 0걸음 · 결판 자리 1000 에서 풀린다(T832 회부 3 의 그 꼴)', `틱 0 → 켬 x ${k.c.x} · 끔 x ${off.c.x}(걸음 ${off.c.calls})`);
  ok(k.t10.calls === Q && k.t200.calls === Q && k.t0.calls === Q && k.t10.x2 === k.t200.x2 && k.t200.x2 === k.t0.x2 && k.t10.y2 === k.t200.y2 && k.t200.y2 === k.t0.y2 && k.t10.x2 > 1000,
    'ⓖ ★끔 + 손잡이 — 결정론(몸 둘): 틱 10 · 200 · 0 번 뒤 그날 끝 병사 자리가 비트까지 같다(슬롯에 붙었다)', `병사 x ${k.t10.x2.toFixed(4)} · ${k.t200.x2.toFixed(4)} · ${k.t0.x2.toFixed(4)}`);
  ok(off.u10.x2 !== off.u200.x2 && off.t0.calls === 0 && off.t0.x2 === 700 && off.u10.calls === 10 && off.u200.calls === 200,
    'ⓖ [자명 통과 금지] 손잡이 끔(종전 · 틱마다)이면 틱 수가 병사 자리를 가른다 · 틱 0 판은 병사가 결판 자리(700)에 남는다', `틱 10 → x ${off.u10.x2.toFixed(4)} · 200 → x ${off.u200.x2.toFixed(4)} · 0 → x ${off.t0.x2}`);
  ok(k.r.fr === Q - 10 && k.r.calls === Q && k.r.left === 0 && k.r.x === k.a.x,
    'ⓖ 끔 + 손잡이 — 마감 시간 예산이 걸음마다 끊어도 그날 걸음 수가 같다(남은 몫은 몸에 남는다)', `틱 10 · 끊김 ${k.r.fr} · 걸음 ${k.r.calls}`);
}

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
