#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1198-birth-body.js — 출생 = 집의 짝 곁 몸 · 명부 ↔ 몸 1:1 (T1198 · 추상 걷기 D) ==========================
//
// ★무엇을 보나
//   ① econ — 아이를 가질 수 있는 집(침상 있는 집 가운데 둘 이상 사는 집) 수가 그날 출생 상한 · 혼자 사는 마을은 못 낳는다 · 아이의 부모 칸 · 난 날.
//   ② 호스트 — 몸마다 서로 다른 사람 · 몸 직업 = 그 사람 직업 · 하루 상한 없음(다섯이 늘면 몸 다섯) ·
//      그날 난 아이의 몸은 부모 몸 곁(한 칸 안) · 그 집 · 그 침상 · 늙어 빠진 그 사람의 몸이 눕는다(맨 앞 몸 아님) · 걸어 나간 사람(까닭 줄 `move`)의 몸이 걷는다.
//   ③ 끔(`T1198_BIRTH_BODY=0`) — 종전 따라가기(하루 ±2 · 부모 칸 0).
//   ④ 자명 통과 금지 — 짝을 안 보고 맨 앞 몸을 눕히는 사본은 ② 가 잡는다(아래 대조 줄).
//   ⑤ [T1297] 출생 곳간 문(`T1297_BIRTH_FOOD` · 끔 기본) — 그날 늘림은 곳간 식량 환산 ≥ (사람 + 1) × 하루 소비 × max(기근 문 30일치, 겨울에 남은 날)일 때만.
//      판 다섯(겨울 밖 20 · 45일치 · 겨울 들머리 60 · 120일치 · 겨울 끝물 20일치) · 끔(같은 곳간이 종전대로 는다) · 기근 문 수 = 피커 기근 블록 글자(사본 0) ·
//      ★미끼 둘 — 곳간 대신 상수 일치(45일치)를 읽는 사본 · 곳간 칸을 지운(0) 사본 → 판이 갈려 빨강.
//
// 실행: node scripts/test-t1198-birth-body.js   (존 안 띄움 · 몇 초)
'use strict';
// ★[PM land1049] `T1195_HUNT_REAL` · `T1197_MEAL_BODY`(+ T1198) 끔 기본으로(켬 판 서버 빈 마을 1 → 15 · 켤 날 T1209 — 게이트 못 넘음 · 묶음 그대로) — 이 하네스는 켬 판의 일을 잰다 → 켬에 묶는다(기본값 줄만 끔 기본으로).
if (process.env.T1197_MEAL_BODY == null) process.env.T1197_MEAL_BODY = '1';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';

const E = R('sim/economy-sim');
const V = R('server/villages');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };

function mock(n) {
  const players = new Map(), npcs = new Set(), bcast = []; let pid = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'b' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, inventory: {}, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: 64, corpseMs: 300000, deathDrop: () => 0,
    setHp: require('./lib-hp-door').makeSetHp((m) => bcast.push(m)),
  };
  const e = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: n, name: '목촌' });
  const SZ = 32, C = { cx: 200, cy: 200 };
  const vil = { dbId: 1, name: '목촌', ccx: C.cx, ccy: C.cy, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (C.cx - 6 + i * 4) * SZ + 16, y: (C.cy + 8) * SZ + 16 })), _maxRPx: 40 * SZ };
  const W = { day: 400, seed: 7 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [vil], byDbId: new Map([[1, vil]]), byEcon: new Map([[e, vil]]), world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null, epoch: 0, dayMs: 30000, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0 });
  return { H, vil, e, players, bcast, W, SZ };
}

if (process.argv[2] === '--child-off') {
  const T = mock(4);
  T.H.syncVillagePop(T.vil, Infinity); T.H.syncVillagePop(T.vil, 2);
  for (let i = 0; i < 5; i++) T.e.npcs.push(E.createNPC({ job: 'farmer' }));
  const n0 = T.vil.npcPids.length; T.H.syncVillagePop(T.vil, 2);
  const v = E.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: 6, name: '끔' });
  console.log(JSON.stringify({ knob: E.T1198_BIRTH_BODY, on: T.H._t1198On(), grew: T.vil.npcPids.length - n0, houses: E._t1198Houses ? 'fn' : null }));
  process.exit(0);
}

if (process.argv[2] === '--child-t1297') {
  //   출생 곳간 문 판 — 마을 하나(20명 · 주거 넉넉) · 곳간을 (사람 + 1) × 날 수로 맞추고 하루 틱 → 그날 dP(`_dpDebug` — 문 뒤) · 문 표지
  const fs = require('fs'), PP = path.join(ROOT, 'sim', 'economy-sim.js');
  const run = (EE) => {
    const one = (days, day) => {
      const v = EE.createVillage({ fertility: 3, water: 3, stone: 1, ore: 1, wood: 3, game: 3, size: 200, arable: 3, initialPop: 20, name: '곳촌' });
      v.housing = 1e4; v._dPAccum = 0;
      const N = v.npcs.length, fe = EE.totalFoodEquivalent(v);
      v.storage.food = (v.storage.food || 0) + (N + 1) * days - fe;
      EE.tickVillage(v, day);
      return { days, day, gate: v._t1297Gate == null ? null : v._t1297Gate, dP: v._dpDebug ? v._dpDebug.dP : null, need: EE.t1297NeedDays ? EE.t1297NeedDays(day) : null };
    };
    return { a: one(20, 100), b: one(45, 100), c: one(60, 276), d: one(120, 276), e: one(20, 340) };
  };
  const out = { knob: E.T1297_BIRTH_FOOD, famine: E.T1297_FAMINE_DAYS, real: run(E) };
  if (E.T1297_BIRTH_FOOD) {
    const src = fs.readFileSync(PP, 'utf8'), line = 'totalFoodEquivalent(v) < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1297NeedDays(day)';
    out.baitLine = src.split(line).length === 2;
    const Module = require('module');
    const bait = (rep, tag) => { const m = new Module(PP + tag, null); m.filename = PP; m.paths = Module._nodeModulePaths(path.dirname(PP)); m._compile(src.replace(line, rep), PP); return run(m.exports); };
    out.bait1 = bait('(_homeN + 1) * DAILY_FOOD_CONSUMPTION * 45 < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1297NeedDays(day)', '.bait1');   // 곳간 대신 상수 일치(45일치)
    out.bait2 = bait('0 < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1297NeedDays(day)', '.bait2');                                           // 곳간 칸을 지운(0) 사본
  }
  console.log('@@T1297 ' + JSON.stringify(out));
  process.exit(0);
}

console.log('\n=== T1198 ① econ — 아이를 가질 수 있는 집 ===');
ok(E.T1198_BIRTH_BODY === true, '켬(하네스가 T1197 켬에 묶음 · 제품은 끔 기본)');
{
  const per = E.hutCapPerHut ? E.hutCapPerHut() : 6;
  const mk = (n) => { const v = { npcs: [] }; for (let i = 0; i < n; i++) v.npcs.push({ id: 'p' + i, age: 30 }); return v; };
  const h13 = E._t1198Houses(mk(13), Infinity, 0);
  ok(h13.length === 2 && h13[0].id === 'p0' && h13[1].id === 'p6', `13명 · 채당 ${per} — 둘 이상 사는 집 둘(셋째 집은 한 사람)`, h13.map((p) => p.id).join(','));
  ok(E._t1198Houses(mk(1), Infinity, 0).length === 0, '혼자 사는 마을 — 아이를 가질 집 0');
  ok(E._t1198Houses(mk(13), per, 0).length === 1, '침상 있는 집만(주거 상한 ÷ 채당 정원)', E._t1198Houses(mk(13), per, 0).length);
  const r1 = E._t1198Houses(mk(13), Infinity, 1);
  ok(r1[0].id === 'p6' && r1[1].id === 'p0', '어느 집부터 = 날 % 집 수(차례 돌림 · 주사위 0)', r1.map((p) => p.id).join(','));
}
{
  // 실제 하루 — 출생 누적이 커도 그날 출생 ≤ 아이를 가질 수 있는 집 수 · 아이의 부모 칸 · 난 날
  const v = E.createVillage({ fertility: 3, water: 3, stone: 1, ore: 1, wood: 3, game: 3, size: 200, arable: 3, initialPop: 7, name: '낳촌' });
  v.storage.food = 1e5; v.housing = 1e4;
  const per = E.hutCapPerHut();
  let maxBorn = 0, cap = 0, pa = null, born = null;
  for (let d = 1; d <= 60; d++) {
    const ids = new Set(v.npcs.map((p) => p.id)); v._dPAccum = 50;   // 누적을 크게 — 상한이 집에서 서는지 본다
    const capD = E._t1198Houses(v, Infinity, d).length;
    E.tickVillage(v, d);
    const nb = v.npcs.filter((p) => !ids.has(p.id));
    if (nb.length > maxBorn) { maxBorn = nb.length; cap = capD; }
    if (nb.length && !pa) { pa = nb[0]._pa; born = nb[0]._born; if (!ids.has(pa)) pa = 'X'; }
    if (nb.length > capD) { ok(false, `날 ${d} 출생 ${nb.length} > 집 ${capD}`); break; }
  }
  ok(maxBorn > 0 && maxBorn <= cap, `그날 출생 ≤ 아이를 가질 수 있는 집 수(채당 ${per})`, `최대 ${maxBorn} · 그날 집 ${cap}`);
  ok(pa && pa !== 'X' && born != null, '아이의 부모 칸 = 그 집 사람 · 난 날', JSON.stringify({ pa, born }));
}

console.log('\n=== T1198 ② 호스트 — 명부 ↔ 몸 1:1 ===');
{
  const T = mock(6), { H, vil, e, players, bcast, W, SZ } = T;
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(vil, 2);
  const bodies = () => vil.npcPids.map((id) => players.get(id));
  ok(H._t1198On() && vil.npcPids.length === e.npcs.length, '사람 여섯 = 몸 여섯', vil.npcPids.length);
  const ids = bodies().map((b) => b._econId);
  ok(new Set(ids).size === 6 && ids.every((id) => e.npcs.some((q) => q.id === id)), '몸마다 서로 다른 사람');
  H.syncVillageJobs(vil, {});
  ok(bodies().every((b) => b.simJob === e.npcs.find((q) => q.id === b._econId).currentJob), '몸 직업 = 그 사람 직업');
  // 하루 상한 없음 — 다섯이 늘면 몸 다섯(종전 ±2)
  for (let i = 0; i < 5; i++) e.npcs.push(E.createNPC({ job: 'farmer' }));
  H.syncVillagePop(vil, 2);
  ok(vil.npcPids.length === 11, '하루 상한 없음 — 사람 다섯 → 몸 다섯 그날', vil.npcPids.length);
  // 그날 난 아이 — 부모 몸 곁
  const par = bodies()[2], paQ = e.npcs.find((q) => q.id === par._econId);
  const kid = E.createNPC({ job: 'farmer' }); kid._pa = paQ.id; kid._born = W.day; e.npcs.push(kid);
  H.syncVillagePop(vil, 2);
  const kb = bodies().find((b) => b._econId === kid.id);
  const dist = kb ? Math.hypot(kb.x - par.x, kb.y - par.y) : Infinity;
  ok(kb && dist <= SZ && kb.npcHomeX === par.npcHomeX && kb.npcHomeY === par.npcHomeY && kb.npcBedX === par.npcBedX, '그날 난 아이 — 부모 몸 곁(한 칸 안) · 그 집 · 그 침상', JSON.stringify({ dist: Math.round(dist), home: kb && kb.npcHomeX === par.npcHomeX }));
  ok(H._t1198Stat.bornBeside === 1, '부모 곁 출생 셈 1', JSON.stringify(H._t1198Stat));
  // 늙어 빠진 그 사람 — 맨 앞 몸 아님
  const victimB = bodies()[4], vq = e.npcs.find((q) => q.id === victimB._econId), front = vil.npcPids[0];
  e.npcs.splice(e.npcs.indexOf(vq), 1); e._deadTot = (e._deadTot || 0) + 1; e._t1198Gone = [vq.id]; e._t1197Dead = null;
  let b0 = bcast.length; H.syncVillagePop(vil, 2);
  let downs = bcast.slice(b0).filter((m) => m && m.type === 'player_down_state' && m.isDown).map((m) => m.pid);
  ok(downs.length === 1 && downs[0] === victimB.pid && vil.npcPids[0] === front && victimB._bxExit === 'died', '늙어 빠진 그 사람의 몸이 눕는다(맨 앞 몸 아님 · T590 ⓐ 문)', JSON.stringify({ downs, victim: victimB.pid, front }));
  // 걸어 나간 사람(까닭 줄 move) — 그 몸이 걷는다
  const walkerB = bodies()[1], wq = e.npcs.find((q) => q.id === walkerB._econId);
  e.npcs.splice(e.npcs.indexOf(wq), 1); e._t1198Gone = null;
  H.noteBodyExit(vil, 'move', 1, null, null);
  b0 = bcast.length; H.syncVillagePop(vil, 2);
  ok(walkerB._bxExit === 'walk' && vil.npcPids.indexOf(walkerB.pid) < 0 && vil.npcPids.length === e.npcs.length, '걸어 나간 그 사람의 몸이 걷는다(까닭 줄 `move`)', JSON.stringify({ exit: walkerB._bxExit, n: vil.npcPids.length, pop: e.npcs.length }));
  // ④ 대조 — 맨 앞 몸을 눕혔다면 위 판정이 갈린다(그 몸은 아직 서 있다)
  const fb = players.get(vil.npcPids[0]);
  ok(fb && !fb._bxExit && fb.hp > 0, '[자명 통과 금지] 맨 앞 몸은 그대로 서 있다(맨 앞을 눕히는 사본이면 갈린다)');
}

console.log('\n=== T1198 ③ 끔 ===');
{
  const out = JSON.parse(execFileSync(process.execPath, [__filename, '--child-off'], { env: Object.assign({}, process.env, { T1198_BIRTH_BODY: '0' }), encoding: 'utf8' }).trim().split('\n').pop());
  ok(out.knob === false && out.on === false && out.grew === 2, '`T1198_BIRTH_BODY=0` — 종전 따라가기(다섯이 늘어도 그날 몸 둘)', JSON.stringify(out));
}

console.log('\n=== T1297 ⑤ 출생 곳간 문(`T1297_BIRTH_FOOD`) — 곳간 일치 · 기근 문 · 겨울 들머리 · 미끼 ===');
{
  const ch = (env) => { const o = execFileSync(process.execPath, [__filename, '--child-t1297'], { env: Object.assign({}, process.env, { T1197_MEAL_BODY: '0', T1198_BIRTH_BODY: '0', T1149_WINTER: '0' }, env), encoding: 'utf8' });
    const l = o.split('\n').find((x) => x.startsWith('@@T1297 ')); return l ? JSON.parse(l.slice(8)) : null; };
  const ON = ch({ T1297_BIRTH_FOOD: '1' }), OFF = ch({ T1297_BIRTH_FOOD: '0' });
  if (!ON || !OFF) ok(false, 'T1297 자식 판이 안 섰다');
  else {
    const R = ON.real, shut = (x) => x.gate === 1 && x.dP === 0, open = (x) => x.gate === 0 && x.dP > 0;
    ok(ON.knob === true && OFF.knob === false, '손잡이 — `\'1\'` 만 켬 · 끔 기본');
    ok(shut(R.a) && R.a.need === 30, '★겨울 밖 · 곳간 (사람 + 1) × 20일치 → 그날 늘림 0(기근 문 30일치 밑)', JSON.stringify(R.a));
    ok(open(R.b), '겨울 밖 · 45일치 → 는다(문 열림)', JSON.stringify(R.b));
    ok(shut(R.c) && R.c.need === 89, '★겨울 들머리(날 276 · 12월 2일 — 다음 봄까지 89날) · 60일치 → 막힘(겨울은 모아 둔 식량으로)', JSON.stringify(R.c));
    ok(open(R.d), '겨울 들머리 · 120일치 → 는다', JSON.stringify(R.d));
    ok(shut(R.e) && R.e.need === 30, '겨울 끝물(날 340 — 남은 날 25 → 기근 문 30) · 20일치 → 막힘', JSON.stringify(R.e));
    const O = OFF.real;
    ok(O.a.gate === null && O.a.dP > 0 && O.c.gate === null && O.c.dP > 0, '끔 — 같은 곳간(20 · 60일치)이 종전대로 는다 · 문 표지 칸 0', JSON.stringify({ a: O.a, c: O.c }));
    const EC = require('fs').readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
    const ip = EC.indexOf('function pickDeficitJob_rational('), fam = /\n  if \(foodEquiv < N \* (\d+)\) \{/.exec(EC.slice(ip));
    ok(ip > 0 && fam && +fam[1] === ON.famine, `기근 문 날 수 = 피커 기근 블록 글자(\`foodEquiv < N * ${fam && fam[1]}\`) — 이름만 붙인 수가 같다(사본 0)`, JSON.stringify({ famine: ON.famine, block: fam && fam[1] }));
    const gl = EC.split('\n').find((x) => x.includes('if (T1297_BIRTH_FOOD) { v._t1297Gate = 0;')) || '';
    ok(gl && !/T325|T1243|T1238|T1207|_t1238Land|founder/.test(gl), '세계 갈래 0 — 출생 문 줄이 세계 손잡이를 안 읽는다(v2 · 밭 · 끔 같은 길)', gl.slice(0, 160));
    const B1 = ON.bait1, B2 = ON.bait2;
    ok(ON.baitLine && B1 && !shut(B1.a) && shut(R.a), `★미끼 1 — 곳간 대신 상수 일치(45일치)를 읽는 사본은 20일치 마을을 막지 못한다(빨강 · dP ${B1 && B1.a.dP})`, JSON.stringify(B1 && B1.a));
    ok(ON.baitLine && B2 && !open(B2.b) && open(R.b), `★미끼 2 — 곳간 칸을 지운(0) 사본은 45일치 마을도 막는다(빨강 · dP ${B2 && B2.b.dP})`, JSON.stringify(B2 && B2.b));
  }
}

console.log(`\n=== T1198 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
