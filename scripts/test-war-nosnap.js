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

console.log(`\n=== 결과: ${pass} PASS / ${fail} FAIL ===`);
process.exit(fail ? 1 : 0);
