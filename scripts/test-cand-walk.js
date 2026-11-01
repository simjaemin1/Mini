#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-cand-walk.js — 해체 뒤 남은 사람이 **몸으로 걸어가 붙는가** (T765 · 손잡이 `T577_CAND_WALK=1`) ==========
//
// ★왜 [지시 T765 · 추상 가2 F8 · 캐논 "몸 XOR 일괄 · 소멸 · 생성 금지"]
//   종전 켬(T577 ⓐ + T590): 해체 그 순간 남은 사람 econ 항목이 받는 마을 econ 에 **한꺼번에** 들고(일괄) · 몸은 하루 2명씩 따로 걸어
//   닿으면 **거둬지고**(소멸) · 받는 마을은 econ 수를 따라 **새 몸**을 세웠다(생성) — 한 사람이 econ 에도 길 위에도 있었다.
//   이제: 남은 사람은 **길 위 장부**(`bandits` `S.WALK`)에 들고 몸은 그 자리에서 같이 떠난다 · 닿는 날(몸 걸음 장부) econ 에 붙고 걷던 몸이 주민이 된다.
//   이 하네스는 **운영 함수 그대로**(`bandits._t765Probe` · `villages.__p3Bind` — test-body-exit 와 같은 목 세계)를 부른다(사본 0).
//
// ★자명 통과 금지: ⓪ 에서 종전 켬 꼴(T590 `move` 까닭 줄)을 같은 자로 먼저 잰다 — 거기선 받는 마을 econ 이 떠나는 그날 늘고(일괄) ·
//   걷던 몸이 거둬지고(`player_left`) · 받는 마을에 새 pid 가 선다(생성). 같은 세는 자가 ①~③ 에선 0 을 내야 한다.
//
// 실행: node scripts/test-cand-walk.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const SUB = process.env.T765_SUB || '';
if (!SUB) process.env.T577_CAND_WALK = '1';   // 이 판은 켬(손잡이는 모듈 적재 때 읽는다) — 끈 판은 아래 아이 판(⑥)
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
const econ = R('sim/economy-sim');
const V = R('server/villages');
const B = R('server/bandits');

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const SZ = 32;
const MOVE = 64;            // 목의 걸음 — 운영은 존 `MOVE_SPEED` 를 deps 로 넘긴다
const DAY_MS = 30000;       // 목의 하루 길이(test-body-exit 와 같은 목 값) — 하루 걸음 = 64 × 30 = 1,920px
const CAMP = { cx: 230, cy: 170 };
// 교역로 — 회관(200,200) → 굽이(350,260) → 이웃 회관(500,200) · 직선보다 길다(장부 길이가 길을 따르는지 본다)
const C1 = { x: 200 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, C2 = { x: 500 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, BEND = { x: 350 * SZ + SZ / 2, y: 260 * SZ + SZ / 2 };
const ROUTE = [C1, BEND, C2];
const ROUTE_LEN = Math.hypot(BEND.x - C1.x, BEND.y - C1.y) + Math.hypot(C2.x - BEND.x, C2.y - BEND.y);

function world(n, nOther, opts) {
  const o = opts || {};
  const players = new Map(), npcs = new Set(), bcast = [];
  let pid = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'n' + (pid++); const p = { pid: id, x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false,
    moveSpeed: MOVE, corpseMs: 300000,
    deathDrop: () => 0,
  };
  const mk = (k, name) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  const e = mk(n, '목촌'), e2 = mk(nOther, '이웃');
  const vil = { dbId: 1, name: '목촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: 500, ccy: 200, econ: e2, npcPids: [], housesPx: [0, 1].map((i) => ({ x: (496 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const W = { day: 400, seed: 7 };
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [e2, other]]),
    world: W, routeCache: new Map([['1_2', ROUTE.map((q) => ({ x: q.x, y: q.y }))]]), _route: null, _distCtx: null, roads: null,
    epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  H.syncVillagePop(vil, o.vilBodies != null ? o.vilBodies : Infinity);
  H.syncVillagePop(other, Infinity);
  H.syncVillagePop(vil, 0); H.syncVillagePop(other, 0);   // 첫 관측(기준만 심는다 — 까닭 0)
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost({ villages: [vil, other], t765Depart: H._t765Depart, t765Join: H._t765Join, noteBodyExit: H.noteBodyExit }, db);
  B._t765Probe.reset();
  return { H, vil, other, e, e2, players, npcs, bcast, deps, W, db };
}
// 해체 — 도적 층이 econ 에 하는 일 그대로 흉내: 단이 될 k 명을 econ 에서 빼고 몸 까닭 줄에 'bandit' k 를 적는다(`formGang` 두 줄) · 해체 표
function dissolve(T, k) {
  for (let i = 0; i < k; i++) T.e.npcs.pop();
  T.H.noteBodyExit(T.vil, 'bandit', k, CAMP);
  T.e._banditized = 1;
}
const leftAt = (bcast, from) => bcast.slice(from).filter((m) => m && m.type === 'player_left').map((m) => m.pid);
const T681 = !!V.__p3Bind({}).T681_ON;
function clk(T) { const S = T.H.state; return { t: T.H.econDayToMs(S.world.day) + 1, dayAt: T.H.econDayToMs(S.world.day) }; }
function step(T, c, ms, onDay) {   // 틱 하나 — 날 경계에서 운영 하루 마감 자리 그대로(`_t681Day` → 도적 하루 `_t765Arrive`)
  const S = T.H.state; c.t += ms; T.H.tickBodyExits(c.t);
  while (c.t - c.dayAt >= S.dayMs) { c.dayAt += S.dayMs; S.world.day++; S.lastGameDay++; if (T681) T.H._t681Day(c.t); if (onDay) onDay(S.world.day); }
}
const econAll = (T) => T.e.npcs.length + T.e2.npcs.length;

if (SUB) {   // ── 아이 판(⑥ · ⑦) — 손잡이 끔 / 가시 몸 상한 ───────────────────────────────────────────
  const out = {};
  if (SUB === 'off') {   // 켬으로 저장된 장부를 끈 채 다시 뜨면 — 다음 하루에 그 마을에 붙는다(종전 켬 꼴 · 잃는 사람 0)
    const T = world(6, 4);
    const row = { data: JSON.stringify({ seq: 1, denSeq: 1, dens: [], gangs: [], stats: {}, walk: [0, 1].map(() => ({ npc: econ.createNPC({ job: 'farmer' }), from: 1, to: 2, d0: 400, len: ROUTE_LEN, ppd: 1920 })) }) };
    B._t765Probe.restore(row);
    out.on = B._t765Probe.ON; out.ledger0 = B._t765Probe.ledger().length; out.e20 = T.e2.npcs.length;
    out.n = B._t765Probe.arrive(400); out.ledger1 = B._t765Probe.ledger().length; out.e21 = T.e2.npcs.length;
  } else if (SUB === 'wall') {   // `T681_WALLCLOCK=0` — 몸은 틱 걸음(벽시계)으로 먼저 닿아도 거둬지지 않고 선다 · 붙기는 econ 장부 날
    const T = world(8, 4);
    dissolve(T, 3);
    B._t765Probe.walk(T.vil, T.W.day);
    const L = B._t765Probe.ledger(), pids = L.map((w) => w.pid).filter(Boolean), eta = L[0].d0 + Math.ceil((L[0].len - 0.5) / L[0].ppd);
    const b0 = T.bcast.length, c = { t: 1000, dayAt: 0 };
    T.H.tickBodyExits(c.t);
    let stoodEarly = 0, n = 0, got = 0;
    while (B._t765Probe.ledger().length && n < 400000) {
      step(T, c, 100, (d) => { got += B._t765Probe.arrive(d); }); n++;
      if (T.W.day < eta) { const r = T.H.state.bodyExits.get(pids[0]); if (r && r.len - r.prog <= 0.5) stoodEarly++; }
    }
    out.t681 = !!T.H.T681_ON; out.got = got; out.stood = stoodEarly; out.left = leftAt(T.bcast, b0).filter((p) => pids.includes(p)).length;
    out.joined = pids.filter((pid) => T.other.npcPids.includes(pid)).length; out.day = T.W.day; out.eta = eta;
  } else if (SUB === 'cap') {   // 받는 마을 가시 몸이 상한(`VILLAGE_NPC_CAP`)에 찼다 — 걷던 몸은 종전처럼 거둔다 · 사람은 econ 에 붙는다
    const T = world(8, 4);
    dissolve(T, 3);
    B._t765Probe.walk(T.vil, T.W.day);
    const walkers = B._t765Probe.ledger().map((w) => w.pid).filter(Boolean);
    const b0 = T.bcast.length, c = clk(T);
    let n = 0; while (B._t765Probe.ledger().length && n < 100000) { step(T, c, 1000, (d) => B._t765Probe.arrive(d)); n++; }
    out.walkers = walkers.length; out.left = leftAt(T.bcast, b0).filter((p) => walkers.includes(p)).length;
    out.e2 = T.e2.npcs.length; out.bodies2 = T.other.npcPids.length; out.stat = T.H.state && V.t765Stat();
  }
  process.stdout.write('\nT765SUB ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

console.log('\n=== T765 — 해체 뒤 남은 사람이 몸으로 걸어가 붙는가(손잡이 `T577_CAND_WALK=1`) ===');
ok(B._t765Probe.ON === true, '[전제] 이 판은 켬 — 손잡이를 모듈 적재 때 읽었다');

// ── ⓪ 종전 켬 꼴(T590 `move` 까닭 줄) — 같은 자로 먼저 잰다(자명 통과 금지) ───────────────────────────
{
  const T = world(8, 4);
  dissolve(T, 3);
  const ids0 = new Set(T.players.keys()), b0 = T.bcast.length, other0 = T.e2.npcs.length;
  // 종전 `_t577Walk` 의 econ 두 줄 + 까닭 한 줄(글자 그대로의 꼴)
  const moved = T.e.npcs.splice(0, T.e.npcs.length);
  for (const npc of moved) T.e2.npcs.push(npc);
  T.H.noteBodyExit(T.vil, 'move', moved.length, null, T.other);
  ok(T.e2.npcs.length - other0 === moved.length, '⓪ 종전 꼴 — 받는 마을 econ 이 **떠나는 그날** 는다(일괄)', `+${T.e2.npcs.length - other0}`);
  const c = clk(T), day = () => { T.H.syncVillagePop(T.vil, 2); T.H.syncVillagePop(T.other, 2); };   // 하루 마감(몸 수가 econ 을 하루 2명씩 따라간다)
  day();
  let n = 0; while (n < 400000 && (T.vil.npcPids.length > 0 || T.H.bodyExitStats().walking > 0)) { step(T, c, 1000, day); n++; }
  for (let k = 0; k < 4; k++) day();
  const born = [...T.players.keys()].filter((id) => !ids0.has(id));
  const gone = leftAt(T.bcast, b0).filter((id) => ids0.has(id));
  ok(gone.length > 0 && born.length > 0, '⓪ 종전 꼴 — 걷던 몸이 닿아 거둬지고(`player_left`) 받는 마을엔 새 pid 가 선다(생성) — 이 자가 잡는다', `거둠 ${gone.length} · 새 몸 ${born.length}`);
}

// ── ① 떠나기 — econ 은 길 위 장부로 · 몸은 그 자리에서 같이 ──────────────────────────────────────
let T1;
{
  const T = T1 = world(8, 4);
  const s0 = T.H.bodyExitStats(), all0 = econAll(T), ids0 = new Set(T.players.keys()), other0 = T.e2.npcs.length, c2 = Object.assign({}, T.e2.counts);
  dissolve(T, 3);
  const d0 = T.W.day;
  const r = B._t765Probe.walk(T.vil, d0);
  const L = B._t765Probe.ledger(), s1 = T.H.bodyExitStats();
  ok(r === 5 && T.e.npcs.length === 0 && L.length === 5, '① 남은 5명이 econ 에서 빠져 **길 위 장부**에 든다', `장부 ${L.length}`);
  ok(T.e2.npcs.length === other0 && JSON.stringify(T.e2.counts) === JSON.stringify(c2), '① ★받는 마을 econ 은 **그대로**(아직 안 닿았다 — 일괄 0) · 직업 수도 그대로', `${T.e2.npcs.length}`);
  ok(econAll(T) + L.length === all0 - 3, '① 사람 합 = 두 마을 econ + 길 위 장부(단이 된 3명만 빠졌다 — 소멸 0)', `${econAll(T)} + ${L.length} = ${all0} − 3`);
  ok(L.every((w) => w.to === 2 && w.from === 1 && w.d0 === d0 && Math.abs(w.len - ROUTE_LEN) < 1e-6 && Math.abs(w.ppd - MOVE / 1000 * DAY_MS) < 1e-9),
    '① 장부 = 받는 마을 · 떠난 날 · **교역로 길이**(회관→굽이→회관 · 몸 자리와 무관) · 하루 걸음(존 걸음 × 하루 길이)', `${(ROUTE_LEN / SZ).toFixed(1)}셀 · ${MOVE / 1000 * DAY_MS}px/날`);
  const walk = L.map((w) => w.pid).filter(Boolean);
  ok(walk.length === 5 && s1.walk.move - s0.walk.move === 5, '① ★몸 5 — 그 자리에서 **같이** 떠난다(종전 하루 2명씩이 아니다) · 까닭 = 이주(`move`)', `${walk.length}`);
  ok(T.vil.npcPids.length === 3 && walk.every((pid) => T.vil.npcPids.indexOf(pid) < 0), '① 줄 선 까닭 몫(도적 전환 3)은 명부에 남는다 — 그 몸은 하루 마감이 은거지로 보낸다(T590 그대로)');
  ok(walk.every((pid) => { const p = T.players.get(pid); return p && p.simCaravan === true && !T.npcs.has(pid) && p._bxExit === 'walk'; }), '① 걷는 몸 — 존 이동 루프 밖 · AI 끔 · 걸어 나감 표식(캐러밴 몸 문법 · T590 `_bxWalk` 그대로)');
  ok(T.players.size === ids0.size && [...T.players.keys()].every((id) => ids0.has(id)), '① 몸 수 그대로 — 거둠 0 · 새 몸 0');
  ok(new Set(L.map((w) => w.len)).size === 1, '① ★장부 길이는 다섯 다 같다(몸 자리 다섯이 달라도 — econ 이 몸 자리에 기대지 않는다 = 결정론)');
  T1.age0 = L.map((w) => w.npc && w.npc.age); T1.npcs0 = L.map((w) => w.npc);   // ★[T1049 ④] 떠날 때 나이(③ 에서 걸은 날만큼 늙었나)
  const rows = B.t765().rows;
  ok(rows.length === 1 && rows[0].n === 5 && rows[0].bodied === 5 && rows[0].eta === d0 + Math.ceil((ROUTE_LEN - 0.5) / (MOVE / 1000 * DAY_MS)), '① 증인 줄 — 사람 5 · 몸 5 · 닿는 날', JSON.stringify(rows[0]));
}

// ── ② 걷기 — 하루 걸음 장부 · 닿기 전엔 econ 에 안 붙는다 · 몸은 거둬지지 않는다 ─────────────────────────────
{
  const T = T1;
  const L = B._t765Probe.ledger(), walk = L.map((w) => w.pid), eta = L[0].d0 + Math.ceil((L[0].len - 0.5) / L[0].ppd);
  const P = T.players.get(walk[0]);
  const c = clk(T); T.H.tickBodyExits(c.t);
  const other0 = T.e2.npcs.length, b0 = T.bcast.length;
  let maxStep = 0, early = 0, n = 0, d = Infinity, closer = true, passed = false, d1 = null;
  while (T.W.day < eta - 1 && n < 400000) {
    const px = P.x, py = P.y;
    step(T, c, 100, (day) => { early += B._t765Probe.arrive(day); });
    n++;
    maxStep = Math.max(maxStep, Math.hypot(P.x - px, P.y - py));
    if (!passed) { const r = T.H.state.bodyExits.get(walk[0]); if (r && r.prog >= r.cum[1]) passed = true; }   // 제 자리 → 회관(교역로 첫 점)을 지난 뒤부터(걸음 기록의 첫 마디)
    if (passed) { const dd = Math.hypot(P.x - C2.x, P.y - C2.y); if (dd > d + 1e-6) closer = false; d = dd; }
  }
  d1 = Math.hypot(P.x - C2.x, P.y - C2.y);
  ok(early === 0 && T.e2.npcs.length === other0 && B._t765Probe.ledger().length === 5, '② 닿는 날 앞까지 econ 에 안 붙는다(길 위 5)', `날 ${T.W.day} · 닿는 날 ${eta}`);
  ok(maxStep > 0 && maxStep <= MOVE * 0.1 + 1e-6, '② ★한 틱(100ms) 걸음 ≤ 걸음 한도(순간이동 0)', `최대 ${maxStep.toFixed(2)}px`);
  ok(passed && closer && d1 < Math.hypot(C1.x - C2.x, C1.y - C2.y), '② 제 회관을 지나 받는 마을 회관에 줄곧 다가간다(교역로 위)', `남은 ${(d1 / SZ).toFixed(0)}셀`);
  ok(leftAt(T.bcast, b0).length === 0 && walk.every((pid) => T.players.has(pid)), '② 걷는 동안 거둠 0');
  // 닿는 날 — 하루 경계 장부가 그 몸을 거두지 않는다(종전 T590 은 여기서 `_bxGone`)
  let got = 0;
  while (T.W.day < eta + 1 && n < 800000) { step(T, c, 100, (day) => { got += B._t765Probe.arrive(day); }); n++; }
  T1.got = got; T1.walk = walk; T1.b0 = b0;
}

// ── ③ 붙기 — 닿은 날 econ 에 붙고 걷던 몸이 그 마을 주민이 된다 ──────────────────────────────────────
{
  const T = T1, walk = T.walk;
  ok(T.got === 5 && B._t765Probe.ledger().length === 0 && T.e2.npcs.length === 9, '③ 닿은 날 5명이 받는 마을 econ 에 붙는다(4 → 9)', `${T.e2.npcs.length}`);
  ok(leftAt(T.bcast, T.b0).length === 0 && walk.every((pid) => T.players.has(pid)), '③ ★소멸 0 — 걷던 몸이 거둬지지 않는다(`player_left` 0)');
  ok(walk.every((pid) => T.other.npcPids.indexOf(pid) >= 0), '③ 걷던 몸 다섯이 받는 마을 명부에 든다');
  const ps = walk.map((pid) => T.players.get(pid));
  ok(ps.every((p) => p.simVillageId === 2 && p.tribeName === '이웃' && p.tribeId === 'simvil_2' && T.npcs.has(p.pid) && p.simCaravan === false && p._bxExit === undefined),
    '③ 그 몸이 주민이 된다 — 마을 · 이름표 · AI 켬 · 존 이동 루프 안 · 걸어 나감 표식 없음');
  ok(ps.every((p) => typeof p.npcHomeX === 'number' && typeof p.npcBedX === 'number' && typeof p.npcWorkX === 'number'
    && T.other.housesPx.some((h) => Math.abs(p.npcHomeX - h.x) <= 5 * SZ && Math.abs(p.npcHomeY - h.y) <= 5 * SZ)),
    '③ 집 · 침대 · 일터 = 받는 마을 출생 자리(`spawnOneNpc` 정본을 그 몸이 받는다)');
  ok(!T.H.state.bodyExits || walk.every((pid) => !T.H.state.bodyExits.has(pid)), '③ 걸음 기록에서 빠진다');
  const ids0 = new Set(T.players.keys()), n0 = T.other.npcPids.length;
  for (let k = 0; k < 3; k++) T.H.syncVillagePop(T.other, 2);
  ok(T.players.size === ids0.size && [...T.players.keys()].every((id) => ids0.has(id)) && T.other.npcPids.length === n0, '③ ★생성 0 — 하루 마감이 받는 마을에 새 몸을 세우지 않는다(몸 = econ 9)', `${T.other.npcPids.length}`);
  {   // ★[T1049 ④] 길 위에서도 늙는다 — econ 하루 늙기(1/365)를 걸은 날 수만큼 · 자명 통과 금지: 걸은 날 > 0 이고 떠날 때 나이가 수다
    const r0 = B.t765().rows[0], days = r0 && r0.day1 != null ? r0.day1 - r0.d0 : 0;
    const okAge = T.npcs0.every((npc, i) => Number.isFinite(T.age0[i]) && Math.abs(npc.age - (T.age0[i] + days / 365)) < 1e-9);
    ok(days > 0 && okAge, '③ ★길 위에서도 늙는다 — 닿은 날 나이 = 떠날 때 나이 + 걸은 날 ÷ 365(econ 하루 늙기 그 수 · 장부 안 날이 안 빠진다)', `걸은 ${days}날 · ${T.age0.map((a) => a.toFixed(3)).join(',')} → ${T.npcs0.map((n) => n.age.toFixed(3)).join(',')}`);
  }
  const st = V.t765Stat();
  ok(st.depart === 5 && st.bodied === 5 && st.joined === 5 && st.noBody === 0, '③ 증인 — 떠남 5 · 몸 5 · 붙음 5', JSON.stringify({ depart: st.depart, bodied: st.bodied, joined: st.joined }));
}

// ── ④ 몸이 모자란 판 — 장부만 걷는다 · 닿으면 받는 마을이 econ 수를 따라 세운다(종전 그 길) ─────────────────────
{
  const T = world(3, 4);
  for (let i = 0; i < 5; i++) T.e.npcs.push(econ.createNPC({ job: 'farmer' }));   // econ 8 · 몸 3(몸이 econ 을 하루 2명씩 따라가는 중)
  dissolve(T, 3);
  const st0 = V.t765Stat();
  B._t765Probe.walk(T.vil, T.W.day);
  const L = B._t765Probe.ledger(), st1 = V.t765Stat();
  ok(L.length === 5 && L.every((w) => w.pid === null) && st1.bodyless - st0.bodyless === 5, '④ 몸 3 은 줄 선 도적 전환 몫 — 다섯은 **장부만** 걷는다(몸 없는 수)', `몸 없음 ${st1.bodyless - st0.bodyless}`);
  const c = clk(T); let got = 0, n = 0;
  while (B._t765Probe.ledger().length && n < 400000) { step(T, c, 1000, (d) => { got += B._t765Probe.arrive(d); }); n++; }
  const st2 = V.t765Stat();
  ok(got === 5 && T.e2.npcs.length === 9 && st2.noBody - st1.noBody === 5, '④ 닿은 날 econ 에 붙는다(몸 없음 → 붙을 몸 없음 5)');
  const b0 = T.other.npcPids.length;
  T.H.syncVillagePop(T.other, 2);
  ok(T.other.npcPids.length === b0 + 2, '④ 몸은 받는 마을 하루 마감이 econ 수를 따라 세운다(하루 2 — 종전 출생 그 길)', `${b0} → ${T.other.npcPids.length}`);
}

// ── ⑤ 영속 — 도적 저장 줄에 길 위 장부(켬 · 장부가 있을 때만 칸) · 복원은 몸 없이 ─────────────────────────────
{
  const T = world(8, 4);
  dissolve(T, 3);
  B._t765Probe.walk(T.vil, T.W.day);
  B._t765Probe.save(T.W.day);
  const j = JSON.parse(T.db.rows[T.db.rows.length - 1].json);
  ok(Array.isArray(j.walk) && j.walk.length === 5 && j.walk.every((w) => w.npc && w.to === 2 && !('pid' in w)), '⑤ 저장 줄에 `walk` 5 — econ 항목째 · 몸 pid 는 안 싣는다(비영속)');
  B._t765Probe.reset();
  B._t765Probe.restore({ data: JSON.stringify(j) });
  const L = B._t765Probe.ledger();
  ok(L.length === 5 && L.every((w) => w.pid === null && w.len === j.walk[0].len), '⑤ 복원 — 장부 5 · 몸 없이(다시 뜬 존은 몸을 econ 수로 세운다)');
  B._t765Probe.reset();
  B._t765Probe.save(T.W.day);
  const j2 = JSON.parse(T.db.rows[T.db.rows.length - 1].json);
  ok(!('walk' in j2) && Object.keys(j2).join(',') === 'seq,denSeq,dens,gangs,stats', '⑤ 장부가 비면 칸이 안 선다 — 저장 줄 칸 = 종전 다섯 그대로', Object.keys(j2).join(','));
}

// ── ⑥ 끈 채 다시 뜸 · ⑦ 가시 몸 상한 — 아이 판 ────────────────────────────────────────────────────────
function sub(name, env) {
  const o = execFileSync(process.execPath, [__filename], { cwd: ROOT, env: Object.assign({}, process.env, { T765_SUB: name, T577_CAND_WALK: '' }, env || {}), encoding: 'utf8' });
  const m = /T765SUB (.*)/.exec(o); return m ? JSON.parse(m[1]) : null;
}
{
  const o = sub('off');
  ok(o && o.on === false && o.ledger0 === 2 && o.n === 2 && o.ledger1 === 0 && o.e21 - o.e20 === 2, '⑥ 손잡이를 끈 채 다시 뜨면 남은 장부는 다음 하루에 그 마을에 붙는다(잃는 사람 0 · 종전 켬 꼴)', JSON.stringify(o));
  const w = sub('wall', { T577_CAND_WALK: '1', T681_WALLCLOCK: '0' });
  ok(w && w.t681 === false && w.got === 5 && w.stood > 0 && w.left === 0 && w.joined === 5 && w.day === w.eta,
    '⑥b `T681_WALLCLOCK=0`(벽시계 걸음) — 몸이 먼저 닿아도 안 거둔다(선다) · 붙기는 econ 장부 그날', JSON.stringify(w));
  const c = sub('cap', { T577_CAND_WALK: '1', VILLAGE_NPC_CAP: '4' });
  ok(c && c.walkers >= 1 && c.left === c.walkers && c.e2 === 9 && c.bodies2 === 4 && c.stat && c.stat.capped === c.walkers,
    '⑦ 받는 마을 가시 몸이 상한(`VILLAGE_NPC_CAP`)이면 그 몸은 종전처럼 거둔다 — 사람은 econ 에 붙는다(9)', JSON.stringify({ walkers: c && c.walkers, left: c && c.left, e2: c && c.e2, bodies2: c && c.bodies2, capped: c && c.stat && c.stat.capped }));
}

// ── ⑧ 글자 — 끔 = main 바이트(켬 문만 새 줄) ────────────────────────────────────────────────────────
{
  const BS = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
  const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const calls = BS.split('\n').filter((l) => /_t577Walk\(/.test(l) && !/^function _t577Walk\(/.test(l));
  ok((BS.match(/process\.env\.T577_CAND_WALK === '1'/g) || []).length === 1 && calls.length === 2 && calls.some((l) => /if \(T577_WALK\) _t577Walk\(vil, day\);/.test(l)) && calls.some((l) => /_t765Probe: \{/.test(l) || /walk: \(vil, day\) => _t577Walk\(vil, day\)/.test(l)),
    '⑧ 손잡이 하나 · 걷기는 켬 문 한 곳에서만 불린다(`if (T577_WALK) _t577Walk(vil, day)`)');
  ok((BS.match(/S\.host\.t765Depart\(/g) || []).length === 1 && (BS.match(/S\.host\.t765Join\(/g) || []).length === 1, '⑧ 몸 문 둘은 걷기 · 닿기 안에서만');
  ok(/if \(S\.WALK\.length\) _t765Arrive\(day\);/.test(BS) && /const _walk = S\.WALK\.length \? \{ walk:/.test(BS), '⑧ 끔이면 장부가 비어 닿기 · 저장 칸이 안 돈다');
  ok(/if \(r\.len - r\.L <= 0\.5\) \{ _bxGone\(r, p\); _bx\.arrive\+\+; \}/.test(VS) && /if \(remain <= 0\.5\) \{ if \(T681_ON\) \{ p\.vx = 0; p\.vy = 0; continue; \} _bxGone\(r, p\); _bx\.arrive\+\+; continue; \}/.test(VS),
    '⑧ 종전 도착 회수 두 줄은 글자 그대로(새 줄은 그 앞 · `r.t765` 기록만 건너뛴다)');
  ok((VS.match(/r\.t765 = 1/g) || []).length === 1, '⑧ `t765` 표식은 떠나기 한 곳에서만 단다');
}

console.log(`\n=== ${pass + fail}건 중 PASS ${pass} · FAIL ${fail} ===\n`);
process.exit(fail ? 1 : 0);
