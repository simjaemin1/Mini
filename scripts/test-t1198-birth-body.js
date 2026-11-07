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

console.log(`\n=== T1198 결과: ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
