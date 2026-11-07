#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-t1080-road-life.js — 해체 뒤 걷는 사람: 길 위에서 먹고 늙는다 · 받는 마을 = 길 거리 (T1080 · ★PM 11-02 문 3) ==========
//
// ★왜 [지시 T1080 · 재민 11-01 족보 716 ③ · PM 11-02 3-a ㄱ · 3-b ㄴ]
//   T765 까지: 길 위 사람은 econ 밖이라 안 먹고 안 늙었다(장부만 걸었다) · 받는 마을은 곧은 거리 최근접(강 건너 · 산 너머 마을도 골랐다).
//   켬(`T1080_ROAD_LIFE` · `T577_CAND_WALK=1` 안): 제 짐(떠난 곳간 먹을 것을 고르게 · 25kg 까지)을 먹고 · 늙고 · 짐이 떨어지면 몸의 굶주림 사다리로 죽는다 ·
//   받는 마을 = 교역 거리행렬 최근접(도달 불능 쌍 제외) · 걷는 사이 그 마을이 해체되면 지금 자리에서 다음 마을로.
//   이 하네스는 **운영 함수 그대로**(`villages.__p3Bind` · `bandits._t765Probe` · 진짜 war-core `bodyEat`/`bagFE` · 진짜 econ)를 부른다(사본 0).
//
// ★자명 통과 금지: ⓪ 끔(`T1080_ROAD_LIFE=0`) 아이 판이 같은 세계에서 곧은 거리 최근접(도달 불능 마을)을 고르고 · 짐 0 · 나이 그대로임을 먼저 보인다 —
//   같은 세는 자가 켬에서 다른 답을 내야 한다.
//
// 실행: node scripts/test-t1080-road-life.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const SUB = process.env.T1080_SUB || '';
// [T1183] 이 목의 하루는30초다. 기존 판은 T627=0, 아래 리허설 전용 아이는 명시적1.
if (SUB !== 'trip') process.env.T627_TRIP_DAY = '0';
process.env.T577_CAND_WALK = '1';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const econ = R('sim/economy-sim');
const WarCore = R('sim/war-core');
const V = R('server/villages');
const B = R('server/bandits');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SZ = 32, MOVE = 64, DAY_MS = 30000;   // test-cand-walk 와 같은 목 값(하루 걸음 1,920px)
const PPD = MOVE / 1000 * DAY_MS;
// 마을: 떠나는 곳 O(200,200) · A(260,200) 곧은 거리 최근접이나 길이 없다(행렬 Infinity) · B(500,200) · C(700,200) · F(2200,200) 멀다
const POS = { 1: [200, 200], 2: [260, 200], 3: [500, 200], 4: [700, 200], 5: [2200, 200] };
const NAMES = { 1: '목촌', 2: '강건너', 3: '이웃', 4: '먼촌', 5: '끝촌' };
function world(o) {
  o = o || {};
  const players = new Map(), npcs = new Set(), bcast = [];
  let pid = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'n' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 300000, deathDrop: () => 0, setHp: (p, v) => { p.hp = v; return v; },
  };
  const ids = o.ids || [1, 2, 3, 4];
  const vils = ids.map((id) => {
    const e = econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: id === 1 ? (o.n || 8) : 4, name: NAMES[id] });
    const [cx, cy] = POS[id];
    return { dbId: id, name: NAMES[id], ccx: cx, ccy: cy, econ: e, npcPids: [], housesPx: [0, 1].map((i) => ({ x: (cx - 4 + i * 4) * SZ + SZ / 2, y: (cy + 8) * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  });
  const by = new Map(vils.map((v) => [v.dbId, v]));
  const W = { day: 400, seed: 7, villages: vils.map((v) => v.econ) };
  // 거리행렬(econ 좌표 = 셀 × 2.5) — A 는 어디서나 도달 불능 · 나머지는 곧은 셀 수의 1.2 배(굽은 길)
  W._distMatrix = vils.map((a) => vils.map((b) => (a === b ? 0 : (a.dbId === 2 || b.dbId === 2) ? Infinity : Math.abs(a.ccx - b.ccx) * 1.2 * 2.5)));
  const routes = new Map();
  for (const a of vils) for (const b of vils) if (a.dbId < b.dbId && a.dbId !== 2 && b.dbId !== 2) {
    const c1 = { x: a.ccx * SZ + SZ / 2, y: a.ccy * SZ + SZ / 2 }, c2 = { x: b.ccx * SZ + SZ / 2, y: b.ccy * SZ + SZ / 2 };
    const L = Math.abs(a.ccx - b.ccx) * SZ, h = Math.sqrt(Math.max(0, (L * 1.2 / 2) ** 2 - (L / 2) ** 2));   // 꼭짓점 하나로 길이 1.2 배
    routes.set(a.dbId + '_' + b.dbId, [c1, { x: (c1.x + c2.x) / 2, y: c1.y + h }, c2]);
  }
  const war = WarCore.createWar({ food: econ, world: W, villages: vils });
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: vils, byDbId: by, byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: routes, _route: null, _distCtx: null, roads: null, war, econ,
    epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  for (const v of vils) H.syncVillagePop(v, o.bodies != null && v.dbId === 1 ? o.bodies : Infinity);
  for (const v of vils) H.syncVillagePop(v, 0);
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(Object.assign({ villages: vils, t765Depart: H._t765Depart, t765Join: H._t765Join, noteBodyExit: H.noteBodyExit },
    { t1080On: () => H.T1080_ROAD_LIFE, t1080Pick: H._t1080Pick, t1080Pack: H._t1080Pack, t1080RoadDay: H._t1080RoadDay, t1080Reroute: H._t1080Reroute, t1080Arrive: H._t1080Arrive, t1080Stat: () => H._t1080Stat }), db);
  B._t765Probe.reset();
  return { H, vils, by, players, W, db, O: by.get(1) };
}
function dissolve(T, k) { for (let i = 0; i < k; i++) T.O.econ.npcs.pop(); T.H.noteBodyExit(T.O, 'bandit', k, { cx: 230, cy: 170 }); T.O.econ._banditized = 1; }
function days(T, n, each) { let got = 0; for (let i = 0; i < n; i++) { T.W.day++; if (each) each(T.W.day); got += B._t765Probe.arrive(T.W.day); } return got; }
const foodFE = (T, st) => T.H.state.war.bagFE(st, {});
// ★[T1108] 해산 몸 걷기 문(`_t1079Home`)이 읽는 호스트 칸 둘을 같은 호스트에 더한다(세계 날 · 몸 없는 사람의 장부 길 = 운영 `_t1079Len`)
function homeHost(T) { const k = B._t765Probe.setHost(null); B._t765Probe.setHost(Object.assign(k.host, { world: T.W, players: T.players, t1079Len: (c, to) => T.H._t1079Len(c, to) }), k.db); }

if (SUB === 'home') {   // ── 아이 판 ⑧-끔 — 해산 몸 걷기 · 손잡이 끔 ──
  const T = world(); homeHost(T);
  const npc = { age: 30, currentJob: 'farmer' };
  B._t765Probe.home(null, npc, { cx: 480, cy: 200 });
  const w = B._t765Probe.ledger()[0];
  process.stdout.write('\nT1080SUB ' + JSON.stringify({ on: T.H.T1080_ROAD_LIFE, t1079: w && w.t1079, lastDay: w ? w.lastDay : null, ppd: w ? w.ppd : null }) + '\n');
  process.exit(0);
}
if (SUB) {   // ── 아이 판 ⓪ — 손잡이 끔(같은 세계 · 같은 자) ──
  const T = world();
  T.O.econ.storage.food = 40;
  dissolve(T, 3);
  const n = B._t765Probe.walk(T.O, T.W.day);
  const L = B._t765Probe.ledger().slice();
  const age0 = L.map((w) => w.npc.age), to = L.length ? L[0].to : null, pack = L.length ? (L[0].pack || null) : null;
  T.by.get(2).econ.npcs.length = 0;   // 받는 마을을 비워도(켬이면 다시 고를 일) 끔은 그대로 간다 — 나이만 본다
  days(T, 1);
  process.stdout.write('\nT1080SUB ' + JSON.stringify({ on: T.H.T1080_ROAD_LIFE, n, to, pack, ppd: L.length ? L[0].ppd : null, food: T.O.econ.storage.food, arrived: B._t765Probe.ledger().length === 0,
    aged: L.map((w, i) => +(w.npc.age - age0[i]).toFixed(6)) }) + '\n');
  process.exit(0);
}

console.log('=== T1080 · T1108 길 위 먹고 늙기 · 길 거리 받는 마을 · 걷기 문 하나 ===');
// ⓪ 끔 — 종전(T765): 곧은 거리 최근접(도달 불능 A) · 짐 0 · 안 늙는다
{
  const out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1080_SUB: 'off', T1080_ROAD_LIFE: '0' }), encoding: 'utf8' });
  const J = JSON.parse(out.split('\n').find((l) => l.startsWith('T1080SUB ')).slice(9));
  ok(J.on === false && J.n === 5 && J.to === 2, '⓪ 끔 — 곧은 거리 최근접(길 없는 강건너 #2)을 고른다(종전 T765)', JSON.stringify({ to: J.to, n: J.n }));
  ok(J.pack == null && J.food === 40 && J.aged.every((a) => a === +(1 / 365).toFixed(6)), '⓪ 끔 — 짐 0 · 곳간 그대로 · 나이는 닿는 날 한 번에(T1049 ④ 종전 줄 · 하루 길)', JSON.stringify({ food: J.food, aged: J.aged }));
}
// ⓪-b 리허설 판(`T627_TRIP_DAY=1` — T914 판 자 기본) — 켬 = 장부 하루 걸음은 정본 운영 하루(`_tripDayMs` · T627 그 문) · 끔 = 판 시계(종전 T765)
{
  const sub = (on) => JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1080_SUB: 'trip', T627_TRIP_DAY: '1', T1080_ROAD_LIFE: on ? '1' : '0' }), encoding: 'utf8' })
    .split('\n').find((l) => l.startsWith('T1080SUB ')).slice(9));
  const WD = R('server/zone-config').WORLD.dayLengthMs, on = sub(true), off = sub(false);
  ok(Math.abs(on.ppd - MOVE / 1000 * WD) < 1e-6 && Math.abs(off.ppd - PPD) < 1e-6 && WD !== DAY_MS,
    '⓪-b T627 리허설 판 — 켬 장부 하루 걸음 = 이동속도 × 정본 하루 · 끔 = 판 시계(종전)', JSON.stringify({ on: on.ppd, off: off.ppd, WD }));
}
ok(V.__p3Bind({}).T1080_ROAD_LIFE === true, '손잡이 켬 기본(`T577_CAND_WALK=1` 안 · `=0` 만 끔)');
// ① 받는 마을 = 길 거리 최근접 · 도달 불능 제외 · 제 짐
{
  const T = world();
  T.O.econ.storage.food = 40; T.O.econ.storage.fish = 5; T.O.econ.storage.wood = 30;
  dissolve(T, 3);
  const n0 = T.O.econ.npcs.length;
  const n = B._t765Probe.walk(T.O, T.W.day);
  const L = B._t765Probe.ledger().slice();
  ok(n === n0 && L.length === n0 && L.every((w) => w.to === 3), `① 받는 마을 = 거리행렬 최근접 #3(곧은 거리는 #2 가 더 가깝지만 도달 불능) · ${n}명`);
  ok(T.H._t1080Stat.unreach >= 1 && T.H._t1080Stat.pickMatrix >= 1, '① 도달 불능 쌍을 셌다 · 행렬로 골랐다', JSON.stringify({ unreach: T.H._t1080Stat.unreach }));
  const pk = L[0].pack, fe1 = foodFE(T, pk);
  ok(Math.abs((pk.food || 0) - 40 / n) < 1e-9 && Math.abs((pk.fish || 0) - 5 / n) < 1e-9 && !(pk.wood > 0), `① 제 짐 — 곳간 먹을 것을 고르게(곡 ${(40 / n).toFixed(2)} · 생선 ${(5 / n).toFixed(2)}) · 나무는 안 진다`);
  ok(Math.abs(T.O.econ.storage.food) < 1e-9 && T.O.econ.storage.wood === 30, '① 진 만큼 곳간에서 빠졌다 · 먹을 것 아닌 칸은 그대로');
  const age0 = L.map((w) => w.npc.age), e3n0 = T.by.get(3).econ.npcs.length, st0 = foodFE(T, T.by.get(3).econ.storage);
  // ② 길 위 하루 — 늙고 · 하루치씩 먹는다 · 닿으면 남은 짐이 곳간에
  days(T, 1);
  ok(L.every((w, i) => Math.abs(w.npc.age - age0[i] - 1 / 365) < 1e-12), '② 길 위 하루 — 나이 +1/365(econ 나이 줄 그 식)');
  ok(Math.abs(foodFE(T, L[0].pack) - (fe1 - 1)) < 1e-9, '② 하루치(1) 를 제 짐에서 먹었다(war-core `bodyEat` = econ `consumeFood`)', `${fe1.toFixed(3)} → ${foodFE(T, L[0].pack).toFixed(3)}`);
  const len = L[0].len, eta = L[0].d0 + Math.ceil((len - 0.5) / PPD);
  let got = 0; while (B._t765Probe.ledger().length && T.W.day < 500) got += days(T, 1);
  const e3 = T.by.get(3).econ;
  ok(got === n && e3.npcs.length === e3n0 + n && T.W.day === eta, `② 닿은 날 = 걸음 장부(길 ${Math.round(len)}px ÷ ${PPD}px/날) · ${n}명 붙음`, JSON.stringify({ day: T.W.day, eta }));
  const left = Math.max(0, fe1 - (eta - L[0].d0));
  ok(Math.abs(foodFE(T, e3.storage) - st0 - left * n) < 1e-6, `② 남은 제 짐은 받는 마을 곳간에(1명 ${left.toFixed(2)} × ${n})`);
}
// ③ 짐이 떨어지면 굶어 죽는다 — 몸 있음 · 없음
{
  const T = world({ ids: [1, 5], n: 5 });
  for (const k of Object.keys(T.O.econ.storage)) T.O.econ.storage[k] = 0;   // 빈 곳간 — 짐 0
  dissolve(T, 3);
  const n = B._t765Probe.walk(T.O, T.W.day);
  const L0 = B._t765Probe.ledger().slice(), pids = L0.map((w) => w.pid).filter(Boolean);
  const eta = L0[0].d0 + Math.ceil((L0[0].len - 0.5) / PPD);
  let deadDay = null; const e5 = T.by.get(5).econ, n5 = e5.npcs.length;
  while (B._t765Probe.ledger().length && T.W.day < 600) { days(T, 1); if (deadDay == null && B._t765Probe.ledger().length < n) deadDay = T.W.day; }
  ok(n === 2 && deadDay != null && deadDay < eta && e5.npcs.length === n5, `③ 빈 짐 — 길 위에서 굶어 죽었다(D${deadDay} · 닿을 날 D${eta} 전) · 받는 마을엔 안 붙음`, JSON.stringify({ n, dead: T.H._t1080Stat.dead }));
  const recs = pids.map((pid) => T.H.state.bodyExits.get(pid)).filter(Boolean);
  ok(pids.length >= 1 && recs.length === pids.length && recs.every((r) => r.cat === 'died' && r.k === 'starve') && pids.every((pid) => T.players.get(pid).hp === 0),
    `③ 몸이 있던 사람은 그 자리에 눕는다(누운 몸 기록 · hp 0) — 몸 ${pids.length}`);
  ok(T.H._t1080Stat.dead === n && T.H._t1080Stat.deadBody === pids.length, '③ 죽음 셈 = 걸은 사람 · 몸 죽음 = 몸 수', JSON.stringify({ dead: T.H._t1080Stat.dead, body: T.H._t1080Stat.deadBody }));
}
// ④ 걷는 사이 받는 마을이 해체 — 지금 자리에서 다음 마을(길 거리)로
{
  const T = world({ ids: [1, 3, 4, 5] });
  T.O.econ.storage.food = 200;
  dissolve(T, 3);
  const n = B._t765Probe.walk(T.O, T.W.day);
  const L = B._t765Probe.ledger().slice();
  ok(L.every((w) => w.to === 3), '④ 처음엔 #3');
  days(T, 2);
  const s = 3 * PPD;   // 다시 고르는 날(D403) 경계까지 걸은 길 = 3 날
  T.by.get(3).econ._banditized = 1;   // 가던 마을이 해체
  days(T, 1);
  ok(L.every((w) => w.to === 4 && w.rr === 1 && w.to0 === 3), '④ 다시 골랐다 — #4(길 거리: 남은 길 + 행렬[#3][#4] 가 걸은 길 + 행렬[#1][#4] 보다 짧다)', JSON.stringify(T.H._t1080Stat.rerouteRows[0]));
  let got = 0; while (B._t765Probe.ledger().length && T.W.day < 700) got += days(T, 1);
  ok(got === n && T.by.get(4).econ.npcs.length === 4 + n, `④ #4 에 닿았다 · ${n}명`);
  ok(T.H._t1080Stat.reroute === n && T.H._t1080Stat.rerouteRows[0].walked === Math.round(s), `④ 다시 고른 자리 = 걸은 길 ${Math.round(s)}px`);
}
// ⑤ 저장 · 복원 — 짐 · 허기 · HP 가 장부째
{
  const T = world();
  T.O.econ.storage.food = 30;
  dissolve(T, 3);
  B._t765Probe.walk(T.O, T.W.day);
  days(T, 1);
  B._t765Probe.save(T.W.day);
  const row = T.db.rows[T.db.rows.length - 1], J = JSON.parse(row.json);
  // ★[T1203] 저장 줄 칸 이름은 `hp` 그대로(영속 꼴 무변) — 메모리 장부 칸만 `roadHp`(아래 줄들)
  ok(Array.isArray(J.walk) && J.walk.every((w) => w.pack && w.h != null && w.hp != null && w.dep != null), '⑤ 저장 줄 `walk` 에 짐 · 허기 · HP · 떠난 날');
  const before = JSON.stringify(B._t765Probe.ledger().map((w) => [w.pack, w.h, w.roadHp, w.lastDay]));
  B._t765Probe.reset(); B._t765Probe.restore({ data: row.json, day: row.day });
  const after = JSON.stringify(B._t765Probe.ledger().map((w) => [w.pack, w.h, w.roadHp, w.lastDay]));
  ok(before === after, '⑤ 복원 — 장부 칸 그대로');
}
// ⑥ 결정론 — 같은 세계 두 번 = 같은 장부
{
  const run = () => { const T = world({ ids: [1, 3, 4, 5] }); T.O.econ.storage.food = 60; dissolve(T, 3); B._t765Probe.walk(T.O, T.W.day); days(T, 3); T.by.get(3).econ._banditized = 1; days(T, 30);
    return JSON.stringify({ L: B._t765Probe.ledger().map((w) => [w.to, w.pack, w.h, w.roadHp]), e4: T.by.get(4).econ.npcs.length, st: T.by.get(4).econ.storage.food }); };
  ok(run() === run(), '⑥ 같은 세계 두 번 — 같은 장부 · 같은 도착(주사위 0)');
}
// ⑧ T1079 해산 몸 — 같은 걷기 문(★T1108): 길 위 하루(늙기 · 제 짐 · 굶주림) · 다시 고르기 · 저장 줄 하나(`t1079` 표지)
{
  const off = JSON.parse(execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { T1080_SUB: 'home', T1080_ROAD_LIFE: '0' }), encoding: 'utf8' })
    .split('\n').find((l) => l.startsWith('T1080SUB ')).slice(9));
  ok(off.on === false && off.t1079 === 1 && off.lastDay == null && Math.abs(off.ppd - PPD) < 1e-6, '⑧ 끔 — 해산 몸 장부는 종전 줄(길 위 칸 0 · 판 시계 걸음)', JSON.stringify(off));
  // ⑧-a 가까운 마을 — 하루 걷고 닿는다 · 그 하루 늙고 빈 짐으로 굶주림 한 칸 · 사람 기록은 주민
  {
    const T = world(); homeHost(T);
    const npc = { age: 30, currentJob: 'farmer' }, n3 = T.by.get(3).econ.npcs.length;
    B._t765Probe.home(null, npc, { cx: 480, cy: 200 });
    const w = B._t765Probe.ledger()[0];
    ok(w && w.t1079 === 1 && w.lastDay === T.W.day && w.h === 100 && w.to === 3 && w.why === 't1079', '⑧-a 해산 몸 장부 — 같은 길 위 칸(떠난 날 · 허기 · HP · 까닭)', JSON.stringify({ to: w && w.to, why: w && w.why }));
    days(T, 1);
    ok(B._t765Probe.ledger().length === 0 && T.by.get(3).econ.npcs.length === n3 + 1 && Math.abs(npc.age - (30 + 1 / 365)) < 1e-9, '⑧-a 하루 걷고 닿아 주민 · 그 하루 늙음(한 번 — T1049 줄과 겹치지 않음)', JSON.stringify({ age: npc.age }));
  }
  // ⑧-b 먼 길 · 빈 짐 — 해체 남은 사람과 같은 날(5날째) 길 위에서 굶어 죽는다
  {
    const T = world(); homeHost(T);
    const npc = { age: 30, currentJob: 'farmer' };
    B._t765Probe.home(null, npc, { cx: 2000, cy: 200 });
    const w0 = B._t765Probe.ledger()[0], eta = T.W.day + Math.ceil(w0.len / w0.ppd), d0 = T.W.day;
    let deadDay = null; for (let i = 0; i < 40 && deadDay == null; i++) { days(T, 1); if (!B._t765Probe.ledger().length) deadDay = T.W.day; }
    ok(deadDay === d0 + 5 && deadDay < eta && (B._t765Probe.t1079St().roadDead | 0) === 1, '⑧-b 빈 짐 먼 길 — 5날째 길 위 굶어 죽음(해체 걷기 ③ 과 같은 날) · 어느 마을에도 안 붙음', JSON.stringify({ deadDay, eta }));
  }
  // ⑧-c 걷는 사이 받는 마을이 빈다 — 떠난 마을 없는 줄도 다시 고른다(남은 길 + 그 마을에서 새 길)
  {
    const T = world({ ids: [1, 3, 4, 5] }); homeHost(T);
    const npc = { age: 30, currentJob: 'farmer' };
    B._t765Probe.home(null, npc, { cx: 380, cy: 200 });
    const w = B._t765Probe.ledger()[0], len0 = w.len;
    T.by.get(3).econ.npcs.length = 0;
    days(T, 1);
    const w1 = B._t765Probe.ledger()[0];
    ok(w1 && w1.to === 4 && w1.rr === 1 && w1.len > Math.max(0, len0 - w.ppd), '⑧-c 해산 몸도 다시 고른다 — #4 · 길 = 남은 길 + #3 → #4', JSON.stringify({ to: w1 && w1.to, len0: Math.round(len0), len: w1 && Math.round(w1.len) }));
    B._t765Probe.save(T.W.day);
    const J = JSON.parse(T.db.rows[T.db.rows.length - 1].json);
    ok(J.walk && J.walk.length === 1 && J.walk[0].t1079 === 1 && J.walk[0].lastDay != null && J.walk[0].rr === 1, '⑧-c 저장 줄 하나 — `t1079` 표지 + 길 위 칸', JSON.stringify(Object.keys(J.walk[0])));
    const before = JSON.stringify(B._t765Probe.ledger().map((x) => [x.t1079, x.to, x.h, x.roadHp, x.lastDay, x.rr]));
    B._t765Probe.reset(); B._t765Probe.restore({ data: T.db.rows[T.db.rows.length - 1].json, day: T.W.day });
    ok(JSON.stringify(B._t765Probe.ledger().map((x) => [x.t1079, x.to, x.h, x.roadHp, x.lastDay, x.rr])) === before, '⑧-c 복원 — 같은 줄(표지 · 칸 그대로)');
  }
}
// ⑦ 글자 — 걷기 문 하나 · 손잡이 하나
{
  const SB = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8'), SV = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  ok(/const T1080_ROAD_LIFE = process\.env\.T1080_ROAD_LIFE !== '0';/.test(SV), '⑦ 손잡이 글자(켬 기본 · `=0` 끔)');
  ok((SB.match(/walkToVillage\(/g) || []).length >= 2 && /return walkToVillage\(vil, e\.npcs\.slice\(\), day, 'dissolve'\);/.test(SB) && /\n  walkToVillage,/.test(SB), '⑦ 걷기 길 하나(`walkToVillage`) — 해체 걷기가 그 문을 부르고 내보낸다(T1075 · T1079 가 같은 문)');
  ok(/if \(T577_WALK\) _t577Walk\(vil, day\);/.test(SB), '⑦ 걷기는 여전히 `T577_CAND_WALK` 켬 문 한 곳에서만(끔 = 기준선 무접촉)');
}
console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===`);
process.exit(fail ? 1 : 0);
