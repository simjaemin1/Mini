#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bandit-camp.js — 은거지가 실제 시설인가 · 짐 더미가 정본인가 (T1079 · 손잡이 `T1079_BANDIT_CAMP`) ==========
//
// ★왜 [지시 T1079 · ★재민 11-02 문 4 = ⓑ "은거지에 더미로 남는다" · 문 4-b = PM ㄱ "약탈 전투가 무기를 읽는다"]
//   종전(T1078 켬): 은거지는 마커 하나(`clientCamps`) · 단의 식량 비축 · 무기 짐은 단 기록의 숫자 칸(`g.food` · `g.arms`) ·
//     해산하면 단 기록이 명부에서 빠지며 그 짐이 세계에서 사라졌다(T765 시드 7 단#10 D399 — 무기 짐 `{}`) · 남은 1 ~ 2명은 마을에 닿아 거둬졌다 ·
//     econ 약탈 실전투(`_raidScrum`)의 도적 atk 는 19 고정(무기 짐을 안 읽는다).
//   켬: ① 야영 터 = 존 건물 둘(모닥불 `campfire` · 짐 더미 `chest`) ② 단의 두 칸 = 더미 칸(정본 하나) ③ 해산 = 더미 · 불이 그 자리에 남고 · 남은 사람 제 무기는 몸 짐에
//       ④ 남은 사람은 정보범위 안 다른 단에 합류 · 없으면 가장 가까운 산 마을로 걸어가 주민(길 위 장부 · 붙기 문) ⑤ `_raidScrum` 이 손에 든 무기를 읽는다.
//   이 하네스는 **운영 함수 그대로**를 짧은 목 세계로 부른다(`test-bandit-all` 의 그 목 · 존 건물 행 문만 목으로) — 도적 하루 `daily` · `syncBodies` · 저장 · 복원 ·
//   마을 몸 문 · `bandits.t1078Died` · econ `_raidScrum`(`_t1079Probe`) — 사본 0.
//
// ★자명 통과 금지:
//   ⓐ 끔(T1078 켬 · T1079 없음)을 **같은 세는 자**로 잰다 — 건물 0 · 해산에 무기 짐이 사라진다(소멸 3) · 남은 몸은 거둬진다(주민 0) ⇒ ② ③ ④ 가 빨갛다.
//   ⓑ 미끼 셋 — `nopile`(야영 터 문을 뗀다 → 짐이 단 기록에 남아 해산에 사라진다) · `nohome`(마을 걷기 문을 뗀다 → 남은 몸이 지워진다) ·
//       `noarm`(econ 무기 문 `banditArmed` 을 뗀다 → ⑤ 가 종전 atk 19 로 돌아간다): 같은 자가 문다.
//
// 실행: node scripts/test-bandit-camp.js
'use strict';
// ★[T1143 2026-11-04] 이 하네스가 재는 것은 해체 문 그 자체다(운영 픽스처가 NPC 마을을 해체로 세운다) — 판 세계를 T1143 앞(`T1143_NO_DISSOLVE=0` = 종전 바이트)으로 묶는다.
//   T1143 이 NPC 마을 해체 없음을 켬 기본으로 바꾼 뒤 해체가 안 서 단언이 빨개졌다(main 에선 초록 · 보고 T1143 §0). 부르는 쪽이 값을 주면 그 값이 먼저다.
if (process.env.T1143_NO_DISSOLVE == null) process.env.T1143_NO_DISSOLVE = '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const SUB = process.env.T1079_SUB || '';
const SZ = 32;
const MOVE = 64;            // 목의 걸음(test-bandit-all 과 같은 목 값)
const DAY_MS = 30000;       // 목의 하루 길이(같은 목 값)
const TICK = 100;

if (SUB) {   // ── 아이 판 — 손잡이는 모듈 적재 때 읽는다(env) ─────────────────────────────────────────
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  const econ = R('sim/economy-sim');
  const V = R('server/villages');
  const B = R('server/bandits');
  const BAIT = process.env.T1079_BAIT || '';
  const players = new Map(), npcs = new Set(), bcast = [], drops = [], buildings = new Map(), dbUp = [];
  let pidN = 1, bidN = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m), buildings,
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: { meat: 4 },
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY, npcJob: q.npcJob || null }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 3 * DAY_MS,
    deathDrop: (p) => { const k = Math.floor((p.inventory.meat || 0) / 2); p.inventory.meat -= k; drops.push({ pid: p.pid, x: p.x, y: p.y, meat: k }); return k; },
    worldPhase: () => 0.3, dayPhaseRatio: 0.7,
    setHp: (p, v) => { p.hp = Math.max(0, Math.min(p.maxHp || 100, v)); return p.hp; },
    //   존 건물 행 문의 목(운영 = zone `_liveBuildRow` · `_adoptBuildRow` — DB 행 · 메모리 · 청크 색인) — 값만
    liveBuildRow: (type, x, y, data, ownerId, ownerName, made) => { const dbId = bidN++; const bo = { id: 'b' + dbId, dbId, type, ownerId, ownerName, x, y, data, floor: 0 }; buildings.set(bo.id, bo); if (made) made.push(bo); return bo; },
    adoptBuildRow: (type, x, y, pred) => { let best = null; for (const b of buildings.values()) if (b.type === type && b.x === x && b.y === y && (!pred || pred(b.data, b)) && (!best || b.dbId < best.dbId)) best = b; return best; },
  };
  const mk = (k, name) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  const FIX = process.env.BANDIT_FIXTURE === 'dissolve';
  const e = mk(FIX ? 13 : 30, '목촌'), e2 = mk(25, '이웃');
  const vil = { dbId: 1, name: '목촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: 500, ccy: 200, econ: e2, npcPids: [], housesPx: [0, 1].map((i) => ({ x: (496 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const C1 = { x: 200 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, C2 = { x: 500 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, BEND = { x: 350 * SZ + SZ / 2, y: 260 * SZ + SZ / 2 };
  const W = { day: 400, seed: 7, infoRange: 2000 };
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [e2, other]]),
    world: W, routeCache: new Map([['1_2', [C1, BEND, C2].map((q) => ({ x: q.x, y: q.y }))]]), _route: null, _distCtx: null, roads: null,
    epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
    db: { updateBuildingData: (id, js) => dbUp.push([id, js]) },
  });
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(other, Infinity);
  H.syncVillagePop(vil, 0); H.syncVillagePop(other, 0);
  const host = Object.assign(H.banditHost(), { ta: { isBlocked: () => false, forestMult: () => 1 }, cellsW: 800, cellsH: 600 });
  if (BAIT === 'nopile') host.t1079Pitch = null;   // 미끼: 야영 터 문을 뗀다(짐이 단 기록에 남는다)
  if (BAIT === 'nohome') host.t1079Home = null;    // 미끼: 마을 걷기 문을 뗀다(남은 몸이 지워진다)
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  //   econ 훅 — 운영 `installHooks` 를 부팅 없이 부를 문이 없어, 도적 하루가 쓰는 같은 세계 객체에 bandits 가 설치한 함수를 읽는다(아래 `hooks`)
  B._t1079Probe.install();
  if (BAIT === 'noarm') delete W.banditArmed;      // 미끼: econ 무기 문을 뗀다
  const T681 = !!H.T681_ON;
  const W0 = [+(e.storage.weapon || 0), +(e2.storage.weapon || 0)];   // 두 마을 곳간 무기 — 처음 값(끝 값과의 차 = 해산 몸이 내린 것)
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  const A = { ticks: 0, newBodies: 0, jumps: 0, maxStep: 0, vanished: [], persons: [], ev: {} };
  const pos = new Map(), known = new Set(players.keys());
  for (const [id, p] of players) pos.set(id, [p.x, p.y]);
  const gangs = () => B._t1039Probe.gangs();
  const gangOf = () => gangs()[0] || null;
  const bodiesOf = (g) => ((new Map(B.t1039().bodies)).get(g.id) || []).filter((pid) => players.has(pid));
  A._goneHow = new Map();
  { const d0 = players.delete.bind(players); players.delete = (k) => { const ex = H.state.bodyExits && H.state.bodyExits.get(k); A._goneHow.set(k, ex ? (ex.cat === 'died' ? 'rot' : 'arrive') : 'vanish'); return d0(k); }; }
  function audit() {
    A.ticks++;
    for (const id of players.keys()) if (!known.has(id)) { known.add(id); A.newBodies++; }
    for (const id of known) if (!players.has(id) && !A.vanished.some((v) => v.pid === id)) A.vanished.push({ pid: id, how: A._goneHow.get(id) || 'vanish', day: W.day });
  }
  function moveAudit(dt) {
    for (const [id, p] of players) {
      const q = pos.get(id); if (!q) { pos.set(id, [p.x, p.y]); continue; }
      const d = Math.hypot(p.x - q[0], p.y - q[1]);
      if (d > A.maxStep) A.maxStep = d;
      if (d > MOVE / 1000 * dt * 1.001 + 0.01) A.jumps++;
      q[0] = p.x; q[1] = p.y;
    }
  }
  //   무기 짐 셈 — 들어온 것(장물 실물 `armsLoot`) = 선 단의 짐 + 흩어진 단의 더미 + 몸 짐(무기를 든 해산 몸) + 마을 곳간으로 내린 것(`vilArms`) — 그 밖은 소멸
  const armsOfObj = (o) => { let a = 0; if (o) for (const k of Object.keys(o)) if (B.ARMS_RES.has(k)) a += +o[k] || 0; return a; };
  function armsLedger() {
    const t = B.t1079(), inn = +(B.stats().armsLoot || 0);
    const live = gangs().reduce((a, g) => a + armsOfObj(g.arms), 0);
    const left = t.piles.filter((p) => p.gid == null).reduce((a, p) => a + armsOfObj(p.arms), 0);
    let carry = 0; for (const p of players.values()) if (p.inventory) carry += +p.inventory.weapon || 0;
    const vilArms = t.stat ? t.stat.vilArms : 0;
    return { inn: +inn.toFixed(6), live: +live.toFixed(6), left: +left.toFixed(6), carry, vilArms, lost: +(inn - live - left - carry - vilArms).toFixed(6) };
  }
  const pileOf = (g) => B.t1079().piles.find((p) => p.gid === g.id) || null;
  const snap = (tag) => { const g = gangOf(); A.ev[tag] = g ? { day: W.day, id: g.id, n: g.n, bodies: bodiesOf(g).length, food: +g.food.toFixed(3), weapon: +((g.arms && g.arms.weapon) || 0), pile: pileOf(g) } : { day: W.day, gone: 1 }; };
  const loot = (res, amt) => (W.onBanditLoot ? (W.onBanditLoot(e, e2, res, amt, W.day), 1) : 0);
  const plan = {};
  function dayClose(d) {
    if (plan[d]) plan[d]();
    B._t1039Probe.daily(d);
    B._t765Probe.save(d);
    B._t1039Probe.syncBodies();
    H.syncVillagePop(vil, 2); H.syncVillagePop(other, 2);
    if (plan['after' + d]) plan['after' + d]();
    const g = gangOf(); A.persons.push([d, g ? g.n : null, g ? bodiesOf(g).length : null]);
  }
  const killTo = (g, left) => { let k = 0; while (g && g.n > left && k < 12) { const pids = bodiesOf(g); const p = players.get(pids[pids.length - 1]); if (!p) break; p.hp = 0; B.t1078Died(p, 'player:손님'); k++; } return k; };
  // ── 시나리오 ──
  if (SUB === 'camp') {   // 해체 단(13명 → 5) 걸어 섬 → 야영 터 · 더미 = 정본 → 장물(무기 3 · 식량) → 저장 · 복원 → 사람에 쓰러짐(n 2) → 해산: 더미 남음 · 남은 둘이 무기 들고 이웃으로 걸어가 주민
    plan[405] = () => { snap('stand'); const g = gangOf(); A.ev.fire = [...buildings.values()].filter((b) => b.type === 'campfire').map((b) => ({ x: b.x, y: b.y, owner: b.ownerId }));
      A.ev.camp = g ? { cx: g.camp.cx, cy: g.camp.cy } : null; A.ev.accessor = g ? !!(Object.getOwnPropertyDescriptor(g, 'food') || {}).get : null;
      A.ev.pairs = B._t1039Probe.pairs().size; A.ev.lootW = loot('weapon', 3); A.ev.lootF = loot('food', 10); snap('loot'); };
    plan.after405 = () => { snap('upkeep'); const sv = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null; const gs = sv && sv.gangs && sv.gangs[0];
      A.ev.save = gs ? { keys: Object.keys(gs), t1079: gs.t1079 || null, recs: (gs.npc1079 || []).length } : null; A.ev.flush = dbUp.length;
      //   복원 — 그 저장 줄로 단을 다시 세우면 더미 행을 다시 잇는다(같은 값 · 같은 행)
      if (sv && gangOf() && pileOf(gangOf())) { const g0 = gangOf(); const before = { food: g0.food, weapon: g0.arms.weapon, pile: pileOf(g0).id }; B._t765Probe.restore({ data: db.rows[db.rows.length - 1].json, day: W.day });
        const g1 = gangOf(); A.ev.restore = { before, after: g1 ? { food: g1.food, weapon: g1.arms && g1.arms.weapon, pile: (pileOf(g1) || {}).id, accessor: !!(Object.getOwnPropertyDescriptor(g1, 'food') || {}).get, same: g1 !== g0 } : null }; } };
    plan[407] = () => { const g = gangOf(); A.ev.preKill = { n: g.n, recs: (g.npc1079 || []).length }; A.ev.kills = killTo(g, 2); snap('preBreak'); A.ev.ledgerPre = armsLedger(); A.ev.outPids = bodiesOf(g).slice(); };
    plan.after407 = () => { snap('break'); const t = B.t1079(); A.ev.left = t.piles.map((p) => ({ gid: p.gid, left: p.left, owner: p.owner, food: +p.food.toFixed(3), arms: p.arms, kg: p.kg }));
      A.ev.walk = t.walk; A.ev.carry = (A.ev.outPids || []).map((pid) => { const p = players.get(pid); const r = H.state.bodyExits.get(pid); return { pid, alive: !!p, weapon: p ? +p.inventory.weapon || 0 : null, k: r ? r.k : null, t765: r ? !!r.t765 : null, to: r ? r.vid : null }; });
      A.ev.ledgerBreak = armsLedger(); A.ev.pop2 = e2.npcs.length; };
  } else if (SUB === 'join') {   // 해체 단 + 가까운 소굴 단 → 해체 단이 무너진다(n 2) → 남은 둘이 소굴 단에 합류(무기 들고 걸어가 그 단의 몸 · 무기는 그 더미에)
    B._t1078Probe.dens().push({ id: 1, cx: 260, cy: 300, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    plan[405] = () => { const gs = gangs(); const g = gs.find((x) => x.den == null); A.ev.two = gs.map((x) => ({ id: x.id, n: x.n, den: x.den })); if (g) loot('weapon', 4); };   // 장물 실물은 그 길목의 단들이 나눈다(운영 `onBanditLoot`)
    plan[406] = () => { const gs = gangs(); const g = gs.find((x) => x.den == null), dg = gs.find((x) => x.den != null); A.ev.preJoin = { g: g && { id: g.id, n: g.n, weapon: g.arms && g.arms.weapon, recs: (g.npc1079 || []).length }, dg: dg && { id: dg.id, n: dg.n, weapon: (dg.arms && dg.arms.weapon) || 0 } };
      if (g) { A.ev.kills = killTo(g, 2); A.ev.outPids = bodiesOf(g).slice(); } };
    plan.after406 = () => { const dg = gangs().find((x) => x.den != null); A.ev.join = dg ? { id: dg.id, n: dg.n, bodies: bodiesOf(dg).length, walkers: H._t1078Walkers().filter((w) => w.gid === dg.id).length, recs: (dg.npc1079 || []).length } : null;
      A.ev.joinCarry = (A.ev.outPids || []).map((pid) => { const p = players.get(pid); const r = H.state.bodyExits.get(pid); return { pid, weapon: p ? +p.inventory.weapon || 0 : null, k: r ? r.k : null, gid: r ? r.t1078 : null }; }); };
  } else if (SUB === 'reform') {   // 소굴 단 → 장물(무기 2) → econ 약탈 실전투가 셋을 죽여 해산 → 더미가 소굴에 남는다 → 재결성 단이 그 더미를 잇는다(같은 행 · 안의 짐째)
    B._t1078Probe.dens().push({ id: 1, cx: 320, cy: 420, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    plan[402] = () => { snap('den'); A.ev.lootW = loot('weapon', 2); };
    plan[403] = () => { const g = gangOf(); A.ev.preRaid = { id: g.id, n: g.n, food: +g.food.toFixed(3), weapon: g.arms && g.arms.weapon }; g.n = 2; };   // 운영 `_raidScrum` 정산 줄 `gangO.n = Math.max(0, gangO.n - R.banditsKilled)` 의 결과
    plan.after403 = () => { const t = B.t1079(); A.ev.leftPile = t.piles.map((p) => ({ id: p.id, gid: p.gid, left: p.left, food: +p.food.toFixed(3), arms: p.arms, lots: p.lots })); A.ev.gone = !gangOf(); A.ev.walk = t.walk;
      const dn = B._t1078Probe.dens()[0]; dn.next = W.day + 2; };   // 재결성 날을 당긴다(카운트다운 30~60일 — 목 판의 길이)
    plan.after405 = () => { snap('reform'); const t = B.t1079(); A.ev.reformPiles = t.piles.map((p) => ({ id: p.id, gid: p.gid, left: p.left, food: +p.food.toFixed(3), arms: p.arms })); A.ev.stat = t.stat; A.ev.fires = [...buildings.values()].filter((b) => b.type === 'campfire').length; };
  }
  const DAYS = 24;
  for (let n = 0; n < DAYS * (DAY_MS / TICK); n++) {
    c.t += TICK;
    H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; if (T681) H._t681Day(c.t); dayClose(W.day); moveAudit(TICK); }
    audit();
  }
  delete A._goneHow;
  A.ledgerEnd = armsLedger();
  const out = { on: B.t1079On(), t1078: B.t1078On(), sub: SUB, A, t1079: B.t1079(), bx: H.bodyExitStats(), pop: [e.npcs.length, e2.npcs.length], weapD: [+((e.storage.weapon || 0) - W0[0]).toFixed(6), +((e2.storage.weapon || 0) - W0[1]).toFixed(6)], npcPids2: other.npcPids.length,
    buildings: [...buildings.values()].map((b) => ({ id: b.id, type: b.type, x: b.x, y: b.y, owner: b.ownerId })), bcast: bcast.filter((m) => m && m.type === 'building_added').length, dbUp: dbUp.length,
    hook: typeof W.banditArmed === 'function', log: B.stats().log.filter((l) => /T1079|해산|결성|재결성/.test(l)) };
  process.stdout.write('\nT1079SUB ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
function sub(name, on, bait, fix) {
  const env = Object.assign({}, process.env, { T627_TRIP_DAY: '0', T1104_BANDIT_WALK: '0', T1079_SUB: name, BANDIT_MINDAY: '1', T1078_BANDIT_ALL: '1', T521_GANG_ARMS: '1' });
  env.T1079_BANDIT_CAMP = '0'; delete env.T1039_BANDIT_BODY; delete env.VILLAGE_NPC_CAP; delete env.T1079_BAIT; delete env.BANDIT_FIXTURE; delete env.T476_PUNITIVE;
  if (on === 'only') { env.T1079_BANDIT_CAMP = '1'; env.T1078_BANDIT_ALL = '0'; }
  else if (on === 'default') delete env.T1079_BANDIT_CAMP;
  else if (on) env.T1079_BANDIT_CAMP = typeof on === 'string' ? on : '1';
  if (bait) env.T1079_BAIT = bait;
  if (fix !== false) env.BANDIT_FIXTURE = 'dissolve';
  const o = execFileSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = o.split('\n').find((l) => l.startsWith('T1079SUB '));
  return m ? JSON.parse(m.slice(9)) : null;
}
const vanishN = (o) => o.A.vanished.filter((v) => v.how === 'vanish').length;
console.log('\n=== T1079 — 은거지 = 실제 시설 · 짐 더미(손잡이 `T1079_BANDIT_CAMP`) ===');

// ── 정적 — 손잡이 · 새 수 0 · econ 한 자리 ──
{
  const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const BD = code('server/bandits.js'), V2 = code('sim/economy-sim-v2.js');
  ok(BD.includes("const T1079_CAMP = T1078_ALL && !(typeof process !== 'undefined' && process.env && process.env.T1079_BANDIT_CAMP === '0');"), "정적 · 손잡이 하나(`'1'` 만 켬) · T1078 켬 위에서만 선다");
  const a = BD.indexOf('function _t1079St('), b = BD.indexOf('function t1079('), blk = BD.slice(a, b);
  ok(a > 0 && b > a && !/[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(blk.replace(/'[^']*'|`[^`]*`/g, '')), '정적 · T1079 문 덩이(bandits)에 새 수 0(0 · 1 말고 수 글자 없음)');
  const i = V2.indexOf('function _raidScrum('), sc = V2.slice(i, V2.indexOf('\n}\n', i));
  ok(/gangArmed == null \? bA : _escAtk\(null\)/.test(sc) && /bArmed < 0 \? bA : \(i < bArmed \? bAw : 10\)/.test(sc) && (V2.match(/world\.banditArmed \? world\.banditArmed\(gang[OI]\) : null/g) || []).length === 2,
    '정적 · econ `_raidScrum` — 무기 수가 없으면 종전 bA(19) · 있으면 든 사람 `_escAtk`(토벌 · 호위 식) · 맨손 10 · 부르는 자리 둘(가는 길 · 귀로)이 호스트 문을 읽는다');
}

// ── ⑤ econ 약탈 실전투가 단 무기를 읽는다(운영 함수 `_raidScrum` 그대로) ──
{
  const v1 = require(path.join(ROOT, 'sim/economy-sim')), V2 = require(path.join(ROOT, 'sim/economy-sim-v2'));
  const P = V2._t1079Probe;
  const run = (armed) => { let esc = 0, rep = 0, kill = 0, dead = 0; for (let s = 1; s <= 300; s++) { v1.setSeed(s); const r = P.raidScrum(3, 18, 5, armed); esc += r.escKilled; rep += r.repel ? 1 : 0; kill += r.banditsKilled; dead += r.traderDead ? 1 : 0; } return { esc, rep, kill, dead }; };
  const old = run(undefined), nul = run(null), full = run(5), none = run(0), two = run(2.9);
  ok(JSON.stringify(old) === JSON.stringify(nul), '⑤ 무기 수 없음(`undefined` · `null`) = 종전(도적 atk 19) — 300판 셈이 같다', JSON.stringify(old));
  ok(P.escAtk(null) === 18 && full.esc < old.esc + 1 && full.rep >= old.rep, '⑤ 다 든 단(5/5) = 든 사람 atk `_escAtk` 18(무기 품질 기록 없음 → 0.42) — 종전 19 보다 약하지 않다(호위 사상 ≤ 종전)', JSON.stringify(full));
  ok(none.esc < full.esc && none.rep > full.rep && none.dead < full.dead, '⑤ 맨손 단(0/5) = atk 10 — 호위 사상 · 상인 죽음이 줄고 격퇴가 는다(같은 300판 씨)', JSON.stringify(none));
  ok(two.esc >= none.esc && two.esc <= full.esc && JSON.stringify(two) === JSON.stringify(run(2)), '⑤ 무기 2.9 = 두 자루(정수 자루 · 한 사람 한 무기) — 맨손과 다 든 단 사이', JSON.stringify(two));
}

const C = sub('camp', true), J = sub('join', true), F = sub('reform', true, '', false);
const Coff = sub('camp', false), Foff = sub('reform', false, '', false);
ok(C && J && F && Coff && Foff, '[전제] 다섯 판이 다 돌았다');
// ── ① 시설 ──
{
  const e = C.A.ev, st = e.stand || {};
  ok(C.on && st.pile && e.fire.length === 1 && e.camp && e.fire[0].x === e.camp.cx * 32 + 16 && e.fire[0].y === e.camp.cy * 32 + 16 && st.pile.x === e.camp.cx * 32 && st.pile.y === e.camp.cy * 32,
    '① 켬 · 단이 은거지에 선 날 — 모닥불(`campfire` · 은거지 칸 가운데 = 몸의 집)과 짐 더미(`chest` · 칸 모서리)가 존 건물로 선다', JSON.stringify([e.fire, st.pile && { x: st.pile.x, y: st.pile.y, owner: st.pile.owner }]));
  ok(C.bcast >= 2 && C.dbUp > 0, '① 클라에 보인다(`building_added`) · 더미 행이 DB 에 남는다(`updateBuildingData` — 바뀐 날만)', `방송 ${C.bcast} · DB ${C.dbUp}`);
  ok(Coff.buildings.length === 0 && Coff.bcast === 0 && !Coff.on && Coff.t1078, 'ⓐ 끔(T1078 켬 · T1079 없음) — 존 건물 0(은거지 = 마커) ⇒ ①이 문 자리가 실제로 다르다');
  const only = sub('camp', 'only');
  ok(only && only.on === false && only.buildings.length === 0, 'ⓐ T1078 없이 T1079 만 — 무동작(T1078 켬 위에서만 선다 · 회부)');
}
// ── ② 정본 하나 ──
{
  const e = C.A.ev;
  ok(e.accessor === true && e.stand.food === e.stand.pile.food && e.loot.weapon === 3 && e.loot.pile.arms.weapon === 3 && e.loot.food > e.stand.food && Math.abs(e.loot.food - e.loot.pile.food) < 1e-9,
    '② 단 기록 `g.food` · `g.arms` = 더미 칸을 읽고 쓰는 문 — 장물(무기 3 실물 · 식량 환산)이 더미에 든다 · 두 값이 늘 같다', JSON.stringify([e.stand.food, e.loot.food, e.loot.pile.food, e.loot.pile.arms]));
  ok(e.upkeep && Math.abs(e.upkeep.food - (e.loot.food - e.loot.n * 0.5)) < 1e-6 && Math.abs(e.upkeep.pile.food - e.upkeep.food) < 1e-9, '② 유지비(종전 줄 `n × BDT_UPKEEP`)가 더미에서 빠진다', JSON.stringify([e.loot.food, e.upkeep.food]));
  ok(e.save && !e.save.keys.includes('food') && !e.save.keys.includes('arms') && e.save.t1079 === 1 && e.save.recs === 5, '② 저장 줄 — 두 칸을 안 싣는다(더미 행이 정본) · 사람 기록 5(해체에서 빠진 econ 항목 그대로)', JSON.stringify(e.save));
  ok(e.restore && e.restore.after && e.restore.after.same && e.restore.after.accessor && e.restore.after.food === e.restore.before.food && e.restore.after.weapon === e.restore.before.weapon && e.restore.after.pile === e.restore.before.pile,
    '② 복원 — 새 단 객체가 같은 더미 행을 다시 잇는다(같은 값 · 같은 행)', JSON.stringify(e.restore));
  ok(Coff.A.ev.loot && Coff.A.ev.loot.weapon === 3 && !Coff.A.ev.loot.pile && Coff.A.ev.save && Coff.A.ev.save.keys.includes('food'), 'ⓐ 끔 — 무기 짐 · 비축은 단 기록 숫자 칸(더미 없음 · 저장 줄에 실린다)');
}
// ── ③ 해산 — 더미가 남는다 · 무기 소멸 0 ──
{
  const e = C.A.ev, lp = (e.left || [])[0];
  ok(e.kills === 3 && e.break && e.break.gone === 1 && lp && lp.gid == null && lp.left === e.break.day && lp.owner === 'public' && lp.arms.weapon === 1 && lp.food > 0 && lp.kg > 0,
    '③ 해산(5 → 2 < 3) — 더미가 그 자리에 남는다(주인 = 누구나 · 흩어진 날) · 남은 둘이 한 자루씩 들고 간 뒤 무기 1 · 식량 · 무게 kg', JSON.stringify(lp));
  ok((e.carry || []).length === 2 && e.carry.every((q) => q.alive && q.weapon === 1 && q.k === 'move' && q.t765 && q.to === 2), '③ 남은 사람 제 무기는 몸 짐에(한 사람 한 자루) — 그 몸이 이웃으로 걷는다(닿아도 안 거둔다 — 붙는 날까지)', JSON.stringify(e.carry));
  ok(e.ledgerBreak && e.ledgerBreak.inn === 3 && e.ledgerBreak.lost === 0 && C.A.ledgerEnd.lost === 0 && C.A.ledgerEnd.vilArms === 2 && C.A.ledgerEnd.left === 1,
    '③ **무기 소멸 0** — 들어온 3 = 흩어진 더미 1 + 몸 짐 2(해산 날) → 끝 날 더미 1 + 이웃 곳간 2', JSON.stringify([e.ledgerBreak, C.A.ledgerEnd]));
  ok(Coff.A.ledgerEnd && Coff.A.ledgerEnd.inn === 3 && Coff.A.ledgerEnd.lost === 3, 'ⓐ 끔 — 같은 자로 해산에 무기 짐 3이 사라진다(T765 시드 7 단#10 D399 의 그 꼴) ⇒ ③이 문 자리가 실제로 다르다', JSON.stringify(Coff.A.ledgerEnd));
}
// ── ④ 남은 사람 — 마을 주민 · 다른 단 합류 ──
{
  ok(C.pop[1] === 27 && C.npcPids2 === 27 && C.weapD[1] === 2 && C.t1079.stat.home === 2 && C.t1079.stat.homeBody === 2 && vanishN(C) === 0 && C.A.newBodies === 0 && C.A.jumps === 0,
    '④ 이웃이 없는 해산 — 남은 둘이 가장 가까운 산 마을(이웃)에 걸어 닿아 주민(econ 25 → 27 · 명부 몸 27 · 새 몸 0 · 소멸 0 · 순간이동 0) · 몸 짐 무기 2 → 그 곳간', JSON.stringify([C.pop, C.npcPids2, C.weapD, C.t1079.stat]));
  ok(Coff.pop[1] === 25 && Coff.A.vanished.filter((v) => v.how === 'arrive').length >= 2, 'ⓐ 끔 — 같은 판에서 남은 둘은 닿아 거둬진다(주민 0)', JSON.stringify([Coff.pop, Coff.A.vanished]));
  const e = J.A.ev, pj = e.preJoin || {}, hand = pj.g ? Math.min(2, Math.floor(pj.g.weapon || 0)) : -1;
  ok(pj.g && pj.dg && hand === 2 && e.join && e.join.n === pj.dg.n + 2 && e.join.recs === 2 && (e.joinCarry || []).length === 2 && e.joinCarry.every((q) => q.k === 'desert' && q.gid === pj.dg.id && q.weapon === 1),
    '④ 정보범위 안 다른 단(소굴 단) — 남은 둘이 그 단에 든다(n +2 · 사람 기록 2) · 몸은 무기 들고 그 은거지로 걷는다(이탈 몸 문법 · 단 번호)', JSON.stringify([pj, e.join, e.joinCarry]));
  const dp = J.t1079.piles.find((p) => p.gid === pj.dg.id);
  ok(dp && dp.arms.weapon === pj.dg.weapon + 2 && J.t1079.stat.unload === 2 && J.A.ledgerEnd.lost === 0 && J.A.ledgerEnd.carry === 0 && vanishN(J) === 0 && J.A.newBodies === pj.dg.n,
    '④ 닿은 몸은 그 단의 몸 · 몸 짐 무기 2 → 그 단 더미(제 몫 + 2) · 무기 소멸 0 · 소멸 0(새 몸 = 소굴에서 난 사람 수뿐)', JSON.stringify([dp && dp.arms, J.t1079.stat, J.A.ledgerEnd]));
}
// ── ③ 그 자리를 잇는 단 — 옛 더미를 주워 간다 ──
{
  const e = F.A.ev, lp = (e.leftPile || [])[0], rp = (e.reformPiles || [])[0];
  ok(e.gone && lp && lp.gid == null && lp.arms.weapon === 0 && (e.walk || []).length === 2 && e.walk.every((w) => !w.rec), '③ 소굴 단 해산(econ 약탈 사상) — 더미가 소굴에 남는다 · 남은 둘(황야 출신 — 사람 기록 없음)이 무기 들고 마을로', JSON.stringify([lp, e.walk]));
  ok(rp && e.reform && rp.id === lp.id && rp.gid === e.reform.id && e.reform.food > lp.food && Math.abs(e.reform.food - rp.food) < 1e-9 && e.stat.adopt === 1 && e.fires === 1,
    '③ 재결성 단이 그 자리의 옛 더미를 잇는다(같은 행 · 안의 짐째 + 재결성 비축) · 불도 그 불', JSON.stringify([lp, rp, e.reform && e.reform.food]));
  ok(F.A.ledgerEnd.lost === 0 && F.weapD[0] + F.weapD[1] === 2 && F.t1079.stat.noRec === 2 && vanishN(F) === 0, '③ 사람 기록 없는 몸 — 닿으면 거둔다(회부) · 몸 짐 무기는 그 곳간에(소멸 0)', JSON.stringify([F.A.ledgerEnd, F.weapD, F.t1079.stat]));
  ok(Foff.A.ledgerEnd.lost === 2 && Foff.buildings.length === 0, 'ⓐ 끔 — 같은 판에서 소굴 단 해산에 무기 짐 2가 사라진다', JSON.stringify(Foff.A.ledgerEnd));
}
// ── ⑤ 호스트 문 ──
{
  ok(C.hook === true && Coff.hook === false, '⑤ 켬만 econ 무기 문(`world.banditArmed` = 손에 든 수 `armsHeld`)이 선다 · 끔 = 설치 0(econ 종전 atk 19)');
}
// ── 손잡이 그 밖 값 ──
{
  const z = sub('camp', '0'), strip = (o) => JSON.stringify(Object.assign({}, o, { on: null }));
  ok(z && z.on === false && strip(z) === strip(Coff), "ⓐ 명시적 `'0'` = 종전 끔 — 판 결과 JSON 바이트 같음(몸 · 저장 줄 · 로그)", `${strip(z).length}B`);
}
// ── ⓑ 미끼 ──
{
  const b1 = sub('camp', true, 'nopile');
  ok(b1 && b1.A.ledgerEnd.lost > 0, 'ⓑ 미끼 `nopile`(야영 터 문을 뗀다) — ③ “무기 소멸 0”이 빨개진다', b1 ? JSON.stringify(b1.A.ledgerEnd) : '');
  const b2 = sub('camp', true, 'nohome');
  ok(b2 && (vanishN(b2) > 0 || b2.pop[1] !== 27), 'ⓑ 미끼 `nohome`(마을 걷기 문을 뗀다) — ④ “주민 · 소멸 0”이 빨개진다', b2 ? `소멸 ${vanishN(b2)} · 인구 ${b2.pop[1]}` : '');
  const b3 = sub('camp', true, 'noarm');
  ok(b3 && b3.hook === false, 'ⓑ 미끼 `noarm`(econ 무기 문을 뗀다) — ⑤ 호스트 문 칸이 빨개진다', b3 ? `hook ${b3.hook}` : '');
}

{ const clean = o => JSON.stringify(o, (k,v) => k === 'perf' ? null : v); ok(clean(sub('camp', 'default')) === clean(sub('camp', true)), '[T1184] 미설정 기본 = 명시적 켬(몸·더미·걸음 결과)'); }
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'} (${pass} 통과 · ${fail} 실패)`);
process.exit(fail ? 1 : 0);
