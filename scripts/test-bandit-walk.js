#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bandit-walk.js — 약탈 · 토벌이 맵 위 사건인가 (T1104 · 손잡이 `T1104_BANDIT_WALK`) ==========
//
// ★왜 [지시 T1104 · ★재민 11-02 "추상 아니지?"]
//   종전(T1078 · T1079 켬): 약탈은 econ 이 캐러밴 도착 경계에 길목 표(`banditGang` — 은거지 450셀 안 교역로)로 치렀다 — 단 몸은 은거지에 서 있고
//     노획은 그 순간 더미에 들었다(몸이 나르지 않는다). 토벌대는 "도보 강행군 ~240셀/일" 날짜 셈으로 닿았고(몸 0) 이겨도 더미를 실어 갈 길이 없었다.
//   켬: ① 단 몸이 길목까지 걷는다 · 캐러밴 장부가 길목을 지나는 그날 그 자리에서 종전 식으로 치른다 · 노획은 몸 짐 → 은거지 더미
//       ② 원정 몸이 은거지까지 걷는다(걸음 장부) · 은거지에서 종전 식으로 싸운다 · 이기면 더미를 몸 짐에 싣고 집 곳간에 내린다.
//   이 하네스는 **운영 함수 그대로**를 짧은 목 세계로 부른다(`test-bandit-camp` 의 그 목) — 도적 하루 `daily` · `syncBodies` · 저장 · 마을 몸 문 ·
//   econ 두 판(`_raidOut` · `_raidIn`) · 길 위 만남(`_raidMeet`) · 도착이 읽는 몫(`_raidTaken`) — 사본 0. econ 캐러밴 하루의 틀(만남 → 도착 → 집 도착 차례)만 목이다.
//
// ★자명 통과 금지:
//   ⓐ 끔(T1078 · T1079 켬 · T1104 없음)을 **같은 세는 자**로 잰다 — 단 몸은 은거지를 안 떠나고 약탈은 도착 날 · 노획은 그날 더미 · 토벌은 날짜 셈 날 몸 없이.
//   ⓑ 미끼 셋 — `nomeet`(econ 만남 문을 뗀다 → 약탈 0) · `nowalk`(몸 걸음 문을 뗀다 → 몸이 길목에 없다) · `nodraft`(원정 뽑기 문을 뗀다 → 원정 몸 0): 같은 자가 문다.
//
// 실행: node scripts/test-bandit-walk.js
'use strict';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const SUB = process.env.T1104_SUB || '';
const SZ = 32;
const MOVE = 64;            // 목의 걸음(test-bandit-all · camp 와 같은 목 값)
const DAY_MS = process.env.T1104_OPERATING_DAY === '1' ? R('server/zone-config').WORLD.dayLengthMs : 30000;       // 목의 하루 길이(같은 목 값)
const TICK = 100;

if (SUB) {   // ── 아이 판 — 손잡이는 모듈 적재 때 읽는다(env) ─────────────────────────────────────────
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  const econ = R('sim/economy-sim');
  const V2 = R('sim/economy-sim-v2');
  const V = R('server/villages');
  const B = R('server/bandits');
  const BAIT = process.env.T1104_BAIT || '';
  const players = new Map(), npcs = new Set(), bcast = [], buildings = new Map(), stored = [];
  let pidN = 1, bidN = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m), buildings,
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY, npcJob: q.npcJob || null }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 30 * DAY_MS,
    deathDrop: () => 0,
    worldPhase: () => 0.3, dayPhaseRatio: 0.7,
    setHp: (p, v) => { p.hp = Math.max(0, Math.min(p.maxHp || 100, v)); return p.hp; },
    liveBuildRow: (type, x, y, data, ownerId, ownerName, made) => { const dbId = bidN++; const bo = { id: 'b' + dbId, dbId, type, ownerId, ownerName, x, y, data, floor: 0 }; buildings.set(bo.id, bo); if (made) made.push(bo); return bo; },
    adoptBuildRow: (type, x, y, pred) => { let best = null; for (const b of buildings.values()) if (b.type === type && b.x === x && b.y === y && (!pred || pred(b.data, b)) && (!best || b.dbId < best.dbId)) best = b; return best; },
  };
  const mk = (k, name) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  const e = mk(30, '목촌'), e2 = mk(25, '이웃');
  const vil = { dbId: 1, name: '목촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: 500, ccy: 200, econ: e2, npcPids: [], housesPx: [0, 1].map((i) => ({ x: (496 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  //   교역로 — 운영처럼 4셀 간격 정점(목촌 → 굽이 → 이웃)
  const corner = [[200, 200], [350, 260], [500, 200]], route = [];
  for (let s = 0; s < corner.length - 1; s++) { const [ax, ay] = corner[s], [bx, by] = corner[s + 1], L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 4); for (let i = 0; i < n; i++) route.push({ x: (ax + (bx - ax) * i / n) * SZ + SZ / 2, y: (ay + (by - ay) * i / n) * SZ + SZ / 2 }); }
  route.push({ x: 500 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 });
  const W = { day: 400, seed: 7, infoRange: 2000, caravans: [] };
  const war = { WARS: [], lootGive: (ev, items) => { let n = 0; for (const k of Object.keys(items)) { ev.storage[k] = (ev.storage[k] || 0) + items[k]; n += items[k]; } stored.push({ vil: ev.name, items: JSON.parse(JSON.stringify(items)), day: W.day }); return n; } };   // T423 내려놓기 문의 목(값만)
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [e2, other]]),
    world: W, routeCache: new Map([['1_2', route]]), _route: null, _distCtx: null, roads: null, war,
    epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
    db: { updateBuildingData: () => {} },
  });
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(other, Infinity);
  H.syncVillagePop(vil, 0); H.syncVillagePop(other, 0);
  const host = Object.assign(H.banditHost(), { ta: { isBlocked: () => false, forestMult: () => 1 }, cellsW: 800, cellsH: 600 });
  if (BAIT === 'nowalk') host.t1104Walk = (p) => null;   // 미끼: 몸 걸음 문을 뗀다(몸은 은거지에 선다 — 장부만 걷는다)
  if (BAIT === 'stuckwalk') { const walk=host.t1104Walk; host.t1104Walk=(...args)=>{const r=walk(...args);if(r)r.ppd=0;return r;}; }
  if (BAIT === 'partialdraft') { const draft=host.t1104Draft; host.t1104Draft=(...args)=>draft(...args).slice(0,6); }
  if (BAIT === 'nodraft') host.t1104Draft = () => [];    // 미끼: 원정 뽑기 문을 뗀다(원정 몸 0 — 장부만 걷는다)
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  B._t1079Probe.install();
  if (BAIT === 'nomeet') delete W.banditMeet;      // 미끼: econ 만남 문을 뗀다
  const V2P = V2._t1104Probe;
  const T681 = !!H.T681_ON;
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  const A = { ticks: 0, newBodies: 0, jumps: 0, maxStep: 0, vanished: [], ev: {}, trail: {} };
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
      const walking = p._t1104W != null || q[2], scale = walking && host.t1104Ppd ? host.t1104Ppd() / (MOVE / 1000 * DAY_MS) : 1;
      if (d > MOVE / 1000 * dt * scale * 1.001 + 0.01) A.jumps++;
      q[2] = p._t1104W != null;
      q[0] = p.x; q[1] = p.y;
    }
  }
  const camp = () => { const g = gangOf(); return g ? { x: g.camp.cx * SZ + SZ / 2, y: g.camp.cy * SZ + SZ / 2 } : null; };
  const dist = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);
  const pileFood = () => { const t = B.t1079(); const g = gangOf(); const P = g ? t.piles.find((x) => x.gid === g.id) : null; return P ? +P.food.toFixed(6) : null; };
  const invFood = (pids) => +pids.reduce((a, pid) => { const p = players.get(pid); return a + ((p && p.inventory && +p.inventory.food) || 0); }, 0).toFixed(6);
  //   econ 캐러밴 하루의 틀(`tickCaravansV2` 차례 그대로 — 만남 → 가는 길 도착 → 귀로 집 도착) · 판은 econ 함수 그대로
  const raids = [];
  function econStep(d) {
    for (const k of W.caravans) {
      if (k._done) continue;
      if (W.banditMeet) { const n0 = gangOf() ? gangOf().n : null; V2P.meet(W, k, d); if (k._raidLoss || k._done) raids.push({ day: d, id: k.id, at: 'meet', leg: k.state, n0, n1: gangOf() ? gangOf().n : null, done: !!k._done }); if (k._done) continue; }
      if (k.state === 'outbound' && d >= k.arriveDay) {
        const gO = W.banditMeet ? null : (W.banditGang ? W.banditGang(k.from, k.to) : null);
        const n0 = gO ? gO.n : null;
        const loss = W.banditMeet ? V2P.taken(k, 'outbound') : V2P.raidOut(W, k, d, gO);
        if (!W.banditMeet && gO) raids.push({ day: d, id: k.id, at: 'arrive', leg: 'outbound', n0, n1: gO.n, done: !!k._done });
        k.lossOut = loss; k.arrivedOn = d;
        if (k._done) continue;
        k.state = 'inbound';
      } else if (k.state === 'inbound' && d >= k.returnArriveDay) {
        const gI = W.banditMeet ? null : (W.banditGang ? W.banditGang(k.from, k.to) : null);
        k.lossIn = W.banditMeet ? V2P.taken(k, 'inbound') : V2P.raidIn(W, k, d, gI);
        k._done = true;
      }
    }
    W.caravans = W.caravans.filter((k) => !k._done);
  }
  const plan = {};
  function dayClose(d) {
    if (plan['econ' + d]) plan['econ' + d]();
    econStep(d);
    if (plan[d]) plan[d]();
    B._t1039Probe.daily(d);
    B._t765Probe.save(d);
    B._t1039Probe.syncBodies();
    H.syncVillagePop(vil, 2); H.syncVillagePop(other, 2);
    if (plan['after' + d]) plan['after' + d]();
    const g = gangOf(), cp = camp(), t = B.t1104().gangs.find((x) => g && x.id === g.id);
    if (g && cp) { const bs = bodiesOf(g).map((pid) => players.get(pid)); A.trail[d] = { n: g.n, bodies: bs.length, st: t && t.t ? t.t.st : null, far: bs.length ? Math.round(Math.max(...bs.map((p) => dist(p, cp)))) : 0, pile: pileFood(), inv: invFood(bodiesOf(g)) }; }
  }
  v1Seed();
  function v1Seed() { const v1 = R('sim/economy-sim'); if (v1.setSeed) v1.setSeed(11); }
  // ── 시나리오 ──
  if (SUB === 'wait') {   // 길목에 나간 단 — 그사이 원정이 은거지에 닿으면 단이 돌아올 때까지 기다린다(그 뒤 은거지에서 싸운다)
    plan[403] = () => { e._banditRisk = 0.5; e.counts = Object.assign({}, e.counts, { warrior: 8, hunter: 0 }); let k = 0; for (let j = vil.npcPids.length - 1; j >= 0 && k < 8; j--, k++) players.get(vil.npcPids[j]).simJob = 'warrior'; };
    for (let d = 404; d <= 420; d++) plan['after' + d] = ((dd) => () => { const t = B.t1104(), g = gangOf(), tg = g ? t.gangs.find((x) => x.id === g.id) : null, F = t.sups[0];
      if (F && F.wait != null && !A.ev.wait) A.ev.wait = { day: dd, wait: F.wait, gst: tg && tg.t ? tg.t.st : null };
      if (tg && tg.t && tg.t.st === 'camp' && A.ev.wait && !A.ev.gHome) A.ev.gHome = dd;
      const fl = (B.stats().log || []).find((l) => /토벌⚔/.test(l)); if (fl && !A.ev.fightDay) A.ev.fightDay = +fl.slice(1, fl.indexOf(' ')); })(d);
  }
  if (SUB === 'raid' || SUB === 'miss' || SUB === 'wait') {   // 소굴 단(굽이 곁) — 캐러밴 하나가 목촌 → 이웃(호위 둘) · 귀로까지
    B._t1078Probe.dens().push({ id: 1, cx: 320, cy: SUB === 'miss' ? 420 : 300, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });   // 'miss' = 길에서 165셀(목 걸음 60셀/날 — 사흘)
    const span = SUB === 'miss' ? 2 : 10;
    const car = { id: 77, from: e, to: e2, state: 'outbound', departDay: 402, arriveDay: 402 + span, returnArriveDay: 402 + 2 * span, giveRes: 'grain', giveAmt: 40, escort: 2, _returningRes: 'wood', _returningAmt: 30 };
    plan.econ402 = () => { W.caravans.push(car); A.ev.car = { D0: car.departDay, D1: car.arriveDay, D2: car.returnArriveDay }; };
    plan.after402 = () => { const g = gangOf(); const t = B.t1104().gangs.find((x) => x.id === g.id); A.ev.out = t && t.t ? JSON.parse(JSON.stringify(t.t)) : null; A.ev.camp = camp(); A.ev.pile402 = pileFood(); A.ev.n402 = g.n; A.ev.party = bodiesOf(g).slice(); };
    for (let d = 403; d <= 420; d++) plan['after' + d] = ((dd, prev) => () => { if (prev) prev();
      const g = gangOf(); if (!g) return;
      const t = B.t1104().gangs.find((x) => x.id === g.id);
      const met = raids.find((r) => r.day === dd);
      if (met && !A.ev.meet) {
        const ch = A.ev.out ? { x: A.ev.out.x, y: A.ev.out.y } : null;
        const live = bodiesOf(g).map((pid) => players.get(pid)).filter((p) => !p.isDown);
        const down = [...players.values()].filter((p) => p.isDown && p.simJob === 'bandit');
        A.ev.meet = { day: dd, raid: met, n: g.n, pile: pileFood(), inv: invFood(bodiesOf(g)), live: live.length,
          liveAtChoke: ch ? live.filter((p) => dist(p, ch) <= 64).length : null, liveAtCamp: live.filter((p) => dist(p, camp()) <= 64).length,
          down: down.length, downAtChoke: ch ? down.filter((p) => dist(p, ch) <= 64).length : null, st: t && t.t ? t.t.st : null };
      }
      if (A.ev.meet && !A.ev.home && t && t.t && t.t.st === 'camp' && dd > A.ev.meet.day) A.ev.home = { day: dd, pile: pileFood(), inv: invFood(bodiesOf(g)), atCamp: bodiesOf(g).filter((pid) => dist(players.get(pid), camp()) <= 64).length, bodies: bodiesOf(g).length, ai: bodiesOf(g).filter((pid) => npcs.has(pid)).length };
    })(d, plan['after' + d]);
  } else if (SUB === 'sup') {   // 소굴 단(목촌에서 141셀) — 목촌 전사 8 이 토벌에 나선다
    B._t1078Probe.dens().push({ id: 1, cx: 300, cy: 300, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    plan[401] = () => { e._banditRisk = 0.5; e.counts = Object.assign({}, e.counts, { warrior: 8, hunter: 0 }); let k = 0; for (let j = vil.npcPids.length - 1; j >= 0 && k < 8; j--, k++) players.get(vil.npcPids[j]).simJob = 'warrior'; A.ev.st0 = +((e.storage.food || 0).toFixed(6)); A.ev.pop0 = e.npcs.length; A.ev.pids0 = vil.npcPids.length; };
    plan.after401 = () => { A.ev.campPx = camp(); const t = B.t1104(); A.ev.go = t.sups.length ? JSON.parse(JSON.stringify(t.sups[0])) : null; const g = gangOf(); A.ev.gang = g ? { id: g.id, n: g.n, sup: g._sup ? JSON.parse(JSON.stringify(g._sup)) : null, food: +(+g.food).toFixed(6) } : null; A.ev.walkers = H.state.bodyExits ? [...H.state.bodyExits.values()].filter((r) => r.vid === 1 && r.cat !== 'died').length : 0; if (BAIT === 'bootempty') { B._t765Probe.save(W.day); const saved=db.rows[db.rows.length-1]; for(const pid of (A.ev.go ? A.ev.go.pids : []))host.t1104Release(players.get(pid)); B._t765Probe.restore({data:saved.json,day:W.day}); } };
    for (let d = 402; d <= 420; d++) plan['after' + d] = ((dd) => () => {
      const lg = B.stats().log || [];
      const fought = lg.find((l) => /토벌⚔/.test(l));
      if (fought && !A.ev.fight) {
        const cp = A.ev.campPx || camp();
        const sup = B.t1104().sups[0] || null;
        const dn = [...players.values()].filter((p) => p.isDown && p.simJob === 'warrior');
        A.ev.fight = { day: dd, line: fought, gone: !gangOf(), sup: sup ? JSON.parse(JSON.stringify(sup)) : null, fell: dn.length, fellAtCamp: cp ? dn.filter((p) => dist(p, cp) <= 64).length : null, fellInRoster: dn.filter((p) => vil.npcPids.includes(p.pid)).length,
          supAtCamp: sup && cp ? sup.pids.filter((pid) => players.get(pid) && dist(players.get(pid), cp) <= 200).length : null, pop: e.npcs.length, pids: vil.npcPids.length };
      }
      const sup = B.t1104().sups[0] || null;
      if (A.ev.fight && !A.ev.back && !sup) A.ev.back = { day: dd, st: +((e.storage.food || 0).toFixed(6)), stored: stored.slice(), ai: (A.ev.fight.sup ? A.ev.fight.sup.pids : []).filter((pid) => npcs.has(pid)).length, home: (A.ev.fight.sup ? A.ev.fight.sup.pids : []).filter((pid) => players.get(pid) && dist(players.get(pid), { x: vil.ccx * SZ + SZ / 2, y: vil.ccy * SZ + SZ / 2 }) <= 64).length };
    })(d);
    plan.after402 = ((f) => () => { A.ev.campPx = A.ev.campPx || camp(); f(); })(plan.after402);
  }
  const DAYS = 22, hr = () => { const t = process.hrtime(); return t[0] * 1e3 + t[1] / 1e6; };
  A.perf = { tickMs: 0, walkTicks: 0, dayMs: 0, days: 0 };   // 비용 자(값 무변 — `scripts/t1104-bench.js` 가 읽는다)
  for (let n = 0; n < DAYS * (DAY_MS / TICK); n++) {
    c.t += TICK;
    const t0 = hr(); H.tickBodyExits(c.t); A.perf.tickMs += hr() - t0; if (H.state.bodyExits) for (const r of H.state.bodyExits.values()) if (r.t1104 != null) A.perf.walkTicks++;
    moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; if (T681) H._t681Day(c.t); const t1 = hr(); dayClose(W.day); A.perf.dayMs += hr() - t1; A.perf.days++; moveAudit(TICK); }
    audit();
  }
  delete A._goneHow;
  const lastSave = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null;
  const out = { on: B.t1104On(), t1079: B.t1079On(), sub: SUB, A, raids, t1104: B.t1104(), meetHook: typeof W.banditMeet === 'function', pop: [e.npcs.length, e2.npcs.length], st: +((e.storage.food || 0).toFixed(6)), stored,
    save: lastSave ? { keys: Object.keys(lastSave), gang: lastSave.gangs && lastSave.gangs[0] ? Object.keys(lastSave.gangs[0]) : null } : null,
    log: B.stats().log.filter((l) => /T1104|토벌|약탈|해산|재결성/.test(l)) };
  process.stdout.write('\nT1104SUB ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
function sub(name, on, bait) {
  const env = Object.assign({}, process.env, { T627_TRIP_DAY: '0', T1104_SUB: name, BANDIT_MINDAY: '1', T1078_BANDIT_ALL: '1', T1079_BANDIT_CAMP: '1' });
  env.T1104_BANDIT_WALK = '0'; delete env.T1039_BANDIT_BODY; delete env.VILLAGE_NPC_CAP; delete env.T1104_BAIT; delete env.BANDIT_FIXTURE; delete env.T476_PUNITIVE; delete env.T521_GANG_ARMS;
  if (on === 'compressed') { env.T627_TRIP_DAY='1'; env.T1104_BANDIT_WALK='1'; }
  else if (on === 'operating') { env.T627_TRIP_DAY='1'; env.T1104_OPERATING_DAY='1'; env.T1104_BANDIT_WALK='1'; }
  else if (on === 'only') { env.T1104_BANDIT_WALK = '1'; env.T1079_BANDIT_CAMP = '0'; }
  else if (on === 'default') delete env.T1104_BANDIT_WALK;
  else if (on) env.T1104_BANDIT_WALK = typeof on === 'string' ? on : '1';
  if (bait) env.T1104_BAIT = bait;
  const o = execFileSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = o.split('\n').find((l) => l.startsWith('T1104SUB '));
  return m ? JSON.parse(m.slice(9)) : null;
}
const vanishN = (o) => o.A.vanished.filter((v) => v.how === 'vanish').length;
//   ① ② 의 세 술어 — 본 칸과 미끼 칸이 같은 자로 잰다
const raidAtChoke = (o) => { const t = o && o.A.ev.out, m = o && o.A.ev.meet; return !!(t && m && m.raid.at === 'meet' && m.day === t.ds && m.day > t.d0); };   // 장부가 길목을 지나는 그날 · 길 위 만남으로 치렀다
const bodiesAtChoke = (o) => { const m = o && o.A.ev.meet; return !!(m && m.live > 0 && m.liveAtChoke === m.live && m.liveAtCamp === 0); };   // 산 단 몸이 다 길목에
const supWalks = (o) => { const g = o && o.A.ev.go, f = o && o.A.ev.fight; return !!(g && g.pids.length > 0 && o.A.ev.walkers === g.pids.length && f && f.supAtCamp > 0 && f.supAtCamp === (f.sup ? f.sup.pids.length : -1)); };   // 원정 몸이 은거지까지 걸어 거기서 싸웠다
console.log('\n=== T1104 — 약탈 · 토벌 = 맵 위 사건(손잡이 `T1104_BANDIT_WALK`) ===');

// ── 정적 — 손잡이 · 새 수 0 · econ 두 판 = 이름만 올림 ──
{
  const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const BD = code('server/bandits.js'), V2 = code('sim/economy-sim-v2.js'), VS = code('server/villages.js');
  ok(BD.includes("const T1104_WALK = T1079_CAMP && !(typeof process !== 'undefined' && process.env && process.env.T1104_BANDIT_WALK === '0');"), "정적 · 손잡이 하나(`'1'` 만 켬) · T1078 · T1079 켬 위에서만 선다");
  const num = /[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/;
  const a = BD.indexOf('function _t1104St('), b = BD.indexOf('function t1104('), blk = BD.slice(a, b).replace(/'[^']*'|`[^`]*`/g, '').replace(/SZ \/ 2/g, '');
  ok(a > 0 && b > a && !num.test(blk), '정적 · T1104 문 덩이(bandits)에 새 수 0(0 · 1 · 반 칸 `SZ / 2` 말고 수 글자 없음)', a > 0 && b > a ? (blk.match(num) || [''])[0] : '덩이 없음');
  const va = VS.indexOf('function _t1104Walk('), vb = VS.indexOf('function _t1104Store('), vblk = VS.slice(va, VS.indexOf('\n}\n', vb)).replace(/'[^']*'|`[^`]*`/g, '');
  ok(va > 0 && vb > va && !num.test(vblk), '정적 · T1104 몸 쪽 문 덩이(villages)에 새 수 0', va > 0 ? (vblk.match(num) || [''])[0] : '덩이 없음');
  ok(/const gangO = world\.banditMeet \? null : \(world\.banditGang \? world\.banditGang\(c\.from, c\.to\) : null\);/.test(V2) && /let outboundLoss = world\.banditMeet \? _raidTaken\(c, 'outbound'\) : _raidOut\(world, c, day, gangO\);/.test(V2)
    && /const gangI = world\.banditMeet \? null : \(world\.banditGang \? world\.banditGang\(c\.from, c\.to\) : null\);/.test(V2) && /let inboundLoss = world\.banditMeet \? _raidTaken\(c, 'inbound'\) : _raidIn\(world, c, day, gangI\);/.test(V2)
    && /if \(world\.banditMeet\) \{ _raidMeet\(world, c, day\); if \(c\._done\) continue; \}/.test(V2) && (V2.match(/_raidScrum\(c\.escort, _escAtk\(c\.from\), gang[OI]\.n, world\.banditArmed \? world\.banditArmed\(gang[OI]\) : null\)/g) || []).length === 2,
    '정적 · econ — 두 판(`_raidOut` · `_raidIn`)은 종전 덩이를 이름만 올렸다(식 · 부름 둘) · 만남 문이 없으면 도착 자리에서 종전 그대로 · 있으면 길 위에서 · 캐러밴 하루 머리 한 줄');
}

const RO = sub('raid', true), RF = sub('raid', false), MO = sub('miss', true), MF = sub('miss', false), SO = sub('sup', true), SF = sub('sup', false);
const WO = sub('wait', true);
ok(RO && RF && MO && MF && SO && SF && WO, '[전제] 일곱 판이 다 돌았다');
// ── ① 약탈 — 단 몸이 길목까지 걷고 · 그 자리에서 싸우고 · 노획을 나른다 ──
{
  const o = RO.A.ev.out, mt = RO.A.ev.meet, hm = RO.A.ev.home, cp = RO.A.ev.camp;
  const chokeD = o && cp ? Math.hypot(o.x - cp.x, o.y - cp.y) : 0;
  ok(RO.on && RO.meetHook && o && o.st === 'out' && o.tc === 77 && o.leg === 'outbound' && chokeD > 64 * 10, '① 켬 · 캐러밴이 떠난 날 — 단이 그 길의 길목(은거지에 가장 가까운 정점)으로 나간다(장부 · 노리는 캐러밴 · 구간)', JSON.stringify(o && { st: o.st, tc: o.tc, leg: o.leg, ds: o.ds, d0: o.d0, len: Math.round(o.len), chokeCells: Math.round(chokeD / 32) }));
  const maxFar = Math.max(...Object.values(RO.A.trail).map((t) => t.far));
  ok(maxFar >= chokeD - 64 && RO.A.jumps === 0 && RO.A.maxStep <= MOVE / 1000 * TICK * 1.001 + 0.01, '① 몸이 실제로 걷는다 — 은거지에서 길목까지(가장 멀리 간 몸 ≈ 길목 거리) · 순간이동 0(틱 걸음 ≤ 존 걸음)', `가장 멂 ${maxFar}px · 길목 ${Math.round(chokeD)}px · 순간이동 ${RO.A.jumps} · 틱 최대 ${RO.A.maxStep.toFixed(2)}px`);
  ok(raidAtChoke(RO) && bodiesAtChoke(RO), '① 캐러밴 장부가 길목을 지나는 그날(장부 지나는 날) 그 자리에서 econ 이 치른다 — 산 단 몸이 다 길목에(은거지 0)', JSON.stringify(mt && { day: mt.day, ds: o.ds, live: mt.live, atChoke: mt.liveAtChoke, atCamp: mt.liveAtCamp, raid: mt.raid }));
  ok(mt && mt.raid.n1 < mt.raid.n0 && mt.down === mt.raid.n0 - mt.raid.n1 && mt.downAtChoke === mt.down, '① 사상 — 도적 사상만큼 몸이 **길목에서** 쓰러진다(T1078 맞춤 · 은거지가 아니다)', JSON.stringify(mt && { n0: mt.raid.n0, n1: mt.raid.n1, down: mt.down, atChoke: mt.downAtChoke }));
  const hn = hm && RO.A.trail[hm.day] ? RO.A.trail[hm.day].n : 0;
  ok(mt && mt.inv > 0 && hm && hm.day > mt.day && hm.inv === 0 && Math.abs((hm.pile - mt.pile) - (mt.inv - hn * 0.5)) < 1e-6,
    '① 노획 = 산 몸 짐 → 은거지에 걸어 닿는 날 더미(닿은 날 더미 = 전날 + 몸 짐 − 유지비 · 몸 짐 0)', JSON.stringify({ meetPile: mt && mt.pile, meetInv: mt && mt.inv, homeDay: hm && hm.day, homePile: hm && hm.pile, homeInv: hm && hm.inv }));
  const tr = RO.A.trail, md = mt ? mt.day : 0;
  ok(mt && tr[md] && tr[md - 1] && Math.abs(tr[md].pile - (tr[md - 1].pile - tr[md].n * 0.5 - 0)) < 1e-6, '① 만난 날 더미 = 전날 − 유지비(노획이 더미로 순간이동하지 않는다)', JSON.stringify([tr[md - 1] && tr[md - 1].pile, tr[md] && tr[md].pile, tr[md] && tr[md].n]));
  ok(hm && hm.atCamp === hm.bodies && hm.ai === hm.bodies && hm.bodies === mt.live, '① 돌아온 몸은 은거지에서 일과로(AI 다시 켬 · 은거지 곁)', JSON.stringify(hm));
  ok(vanishN(RO) === 0 && RO.A.newBodies === RO.A.ev.n402, '① 소멸 0 · 새 몸 = 소굴에서 난 사람 수뿐', `소멸 ${vanishN(RO)} · 새 몸 ${RO.A.newBodies} · 단 ${RO.A.ev.n402}`);
  ok(RO.save && RO.save.gang && RO.save.gang.includes('t1104') && RF.save && RF.save.gang && !RF.save.gang.includes('t1104'), '① 저장 줄 — 켬만 단의 걸음 장부 칸(`t1104`)이 선다 · 끔 = 종전 칸', JSON.stringify([RO.save && RO.save.gang, RF.save && RF.save.gang]));
  // ⓐ 끔
  const fmax = Math.max(...Object.values(RF.A.trail).map((t) => t.far)), fr = RF.raids[0];
  ok(!RF.on && !RF.meetHook && fmax <= 64 * 4 && fr && fr.at === 'arrive' && fr.day === 412, 'ⓐ 끔 — 같은 판에서 단 몸은 은거지를 안 떠나고(가장 멂 ≤ 4칸) 약탈은 도착 날 길목 표로(몸이 길에 없다) ⇒ ①이 실제로 다르다', JSON.stringify({ far: fmax, raid: fr }));
  const ft = RF.A.trail;
  ok(fr && ft[412] && ft[411] && ft[412].pile > ft[411].pile - ft[412].n * 0.5, 'ⓐ 끔 — 노획은 그날 더미에(몸이 안 나른다)', JSON.stringify([ft[411] && ft[411].pile, ft[412] && ft[412].pile]));
}
// ── ① 못 닿을 캐러밴은 안 쫓는다 ──
{
  ok(MO.t1104.stat && MO.t1104.stat.far >= 1 && MO.t1104.stat.out === 0 && MO.raids.length === 0 && MO.A.ev.out && MO.A.ev.out.st === 'camp', '① 하루 구간 캐러밴 — 단이 길목에 먼저 닿을 수 없다 · 안 나간다 · 약탈 0(몸이 만나지 않았다)', JSON.stringify({ stat: MO.t1104.stat && { far: MO.t1104.stat.far, out: MO.t1104.stat.out }, raids: MO.raids }));
  ok(MF.raids.length >= 1 && MF.raids[0].at === 'arrive', 'ⓐ 끔 — 같은 캐러밴을 도착 날 길목 표로 턴다(몸이 못 닿는 거리) ⇒ 이 칸이 실제로 다르다', JSON.stringify(MF.raids));
}
// ── ② 토벌 — 원정 몸이 걷고 · 은거지에서 싸우고 · 이기면 더미를 싣고 온다 ──
{
  const go = SO.A.ev.go, f = SO.A.ev.fight, bk = SO.A.ev.back;
  ok(go && go.pids.length === 8 && go.st === 'go' && supWalks(SO) && go.eta > 402, '② 켬 · 결단 날 — 목촌 전사 몸 8 이 은거지로 걷는다(닿는 날 = 걸음 장부 · 종전 240셀/일 셈 아님)', JSON.stringify(go && { pids: go.pids.length, eta: go.eta, len: Math.round(go.len), ppd: go.ppd }));
  ok(f && f.day === go.eta && f.supAtCamp === (f.sup ? f.sup.pids.length : 0), '② 닿은 날 은거지에서 싸운다 — 산 원정 몸이 은거지 곁', JSON.stringify(f && { day: f.day, eta: go && go.eta, atCamp: f.supAtCamp, line: f.line }));
  ok(f && f.fell === f.fellAtCamp && f.fellInRoster === 0 && f.pop === SO.A.ev.pop0 - f.fell && f.pids === SO.A.ev.pids0 - f.fell, '② 원정 전사 — 그 몸이 은거지에서 쓰러진다 · 명부에서 빠진다(econ 사람 수 = 명부 몸 수)', JSON.stringify(f && { fell: f.fell, atCamp: f.fellAtCamp, inRoster: f.fellInRoster, pop: [SO.A.ev.pop0, f.pop], pids: [SO.A.ev.pids0, f.pids] }));
  const bagN = f && f.sup ? Object.values(f.sup.bag).reduce((a, b) => a + Object.values(b).reduce((x, y) => x + y, 0), 0) : 0;
  ok(f && f.gone && bagN > 0 && bk && bk.stored.length && Math.abs(bk.stored.reduce((a, s) => a + Object.values(s.items).reduce((x, y) => x + y, 0), 0) - bagN) < 1e-6, '② 이겨서 단이 무너졌다 — 산 원정 몸이 더미를 몸 짐에 싣고(T466 문) · 집에 닿아 곳간에 내린다(T423 문 · 실은 그 양)', JSON.stringify({ bag: +bagN.toFixed(3), stored: bk && bk.stored }));
  ok(bk && bk.ai === (f.sup ? f.sup.pids.length : -1) && bk.home === bk.ai && bk.day > f.day, '② 돌아온 원정 몸은 집 곁에서 마을 일과로', JSON.stringify(bk && { day: bk.day, ai: bk.ai, home: bk.home }));
  ok(vanishN(SO) === 0 && SO.A.jumps === 0, '② 소멸 0 · 순간이동 0', `소멸 ${vanishN(SO)} · 순간이동 ${SO.A.jumps}`);
  const we = WO.A.ev;
  ok(we.wait && we.wait.gst !== 'camp' && we.gHome && we.fightDay && we.fightDay > we.gHome && we.fightDay > we.wait.wait && WO.t1104.stat.supWait === 1, '② 단이 길목에 나가 있을 때 닿은 원정 — 은거지에서 기다렸다가 단이 돌아온 뒤 싸운다(빈 은거지와 싸우지 않는다)', JSON.stringify({ wait: we.wait, gangHome: we.gHome, fight: we.fightDay }));
  const ff = SF.A.ev.fight;
  ok(!SF.on && ff && ff.day === 402 && SF.stored.length === 0 && SF.A.ev.walkers === 0, 'ⓐ 끔 — 같은 판에서 토벌은 날짜 셈 날(D402 = 결단 + ⌈141 ÷ 240⌉) 몸 없이 · 더미를 실어 가지 않는다 ⇒ ②가 실제로 다르다', JSON.stringify(ff && { day: ff.day, stored: SF.stored.length, walkers: SF.A.ev.walkers }));
}
// ── 손잡이 그 밖 값 · 홀로 ──
{
  const z = sub('raid', '0'), strip = (o) => JSON.stringify(Object.assign({}, o, { on: null, A: Object.assign({}, o.A, { perf: null }) }));
  ok(z && z.on === false && strip(z) === strip(RF), "ⓐ 명시적 `'0'` = 종전 끔 — 판 결과 JSON 바이트 같음", `${strip(z).length}B`);
  const only = sub('raid', 'only');
  ok(only && only.on === false && !only.meetHook && only.raids.length && only.raids[0].at === 'arrive', 'ⓐ T1079 없이 T1104 만 — 무동작(T1078 · T1079 켬 위에서만 선다)');
}
// ── ⓑ 미끼 ──
{
  const b1 = sub('raid', true, 'nomeet');
  ok(b1 && !raidAtChoke(b1), 'ⓑ 미끼 `nomeet`(econ 만남 문을 뗀다) — ① “그날 그 자리에서 치른다”가 빨개진다', b1 ? JSON.stringify(b1.raids) : '');
  const b2 = sub('raid', true, 'nowalk');
  ok(b2 && !raidAtChoke(b2) && !bodiesAtChoke(b2), 'ⓑ 미끼 `nowalk`(몸 걸음 문을 뗀다) — [T1184] 걷지 못한 단은 장부 약탈도 하지 않는다', b2 && b2.A.ev.meet ? JSON.stringify({ live: b2.A.ev.meet.live, atChoke: b2.A.ev.meet.liveAtChoke }) : '');
  const b3 = sub('sup', true, 'nodraft');
  ok(b3 && !b3.A.ev.go && !b3.A.ev.fight && b3.t1104.sups.length === 0, '[T1184] 몸0 토벌대는 파견·교전0');
  ok(b3 && !supWalks(b3), 'ⓑ 미끼 `nodraft`(원정 뽑기 문을 뗀다) — ② “원정 몸이 걷는다”가 빨개진다', b3 && b3.A.ev.go ? `몸 ${b3.A.ev.go.pids.length}` : '');
}

{ const raid=sub('raid',true,'stuckwalk'), sup=sub('sup',true,'stuckwalk'); ok(raid.A.ev.out && !raid.A.ev.meet && !raid.raids.length, '[T1184] 길목 장부 날이 지나도 몸이 못 닿으면 약탈0'); ok(sup.A.ev.go && sup.A.ev.go.pids.length === 8 && !sup.A.ev.fight, '[T1184] 몸8명 출발 장부가 있어도 은거지 미도착이면 교전0'); }
if (process.env.T1184_OPERATING_PROBE === '1') { const raid=sub('raid','operating'), sup=sub('sup','operating'); ok(raidAtChoke(raid) && bodiesAtChoke(raid) && raid.A.jumps === 0, '[T1184] T627 켬·정본 운영 하루: 실제 길목 습격·걸음 상한'); ok(sup.A.ev.fight && sup.A.ev.fight.sup && sup.A.ev.fight.supAtCamp > 0 && sup.A.ev.fight.supAtCamp === sup.A.ev.fight.sup.pids.length && sup.A.jumps === 0, '[T1184] T627 켬·정본 운영 하루: 실제 은거지 토벌·걸음 상한',JSON.stringify(sup.A.ev.fight)); }
{ const boot=sub('sup',true,'bootempty'); ok(boot.A.ev.go && !boot.A.ev.fight && boot.t1104.sups.length === 0, '[T1184] 재부팅으로 몸 결속이 사라진 원정은 취소하고 장부만으로 싸우지 않는다'); }
if (process.env.T1184_OPERATING_PROBE === '1') { const raid=sub('miss','compressed'), sup=sub('sup','compressed'); ok(raidAtChoke(raid) && bodiesAtChoke(raid) && raid.A.jumps === 0, '[T1184] T627 압축 시계: 옛 판에서 놓친 캐러밴도 실제 몸이 제때 닿아 만난다'); ok(sup.A.ev.go && sup.A.ev.fight && sup.A.ev.fight.day === sup.A.ev.go.eta && sup.A.jumps === 0, '[T1184] T627 압축 시계: 몸도 장부 도착 날에 은거지 도착·교전', JSON.stringify({eta:sup.A.ev.go&&sup.A.ev.go.eta,fight:sup.A.ev.fight&&sup.A.ev.fight.day,jumps:sup.A.jumps})); }
{ const partial=sub('sup',true,'partialdraft'); ok(partial.A.ev.go && partial.A.ev.go.force === 6 && partial.A.ev.go.pids.length === 6, '[T1184] 요청8명·실제6명이면 전투 병력도6명'); }
{ const clean = o => JSON.stringify(o, (k,v) => k === 'perf' ? null : v); ok(clean(sub('raid', 'default')) === clean(sub('raid', true)), '[T1184] 미설정 기본 = 명시적 켬(몸·더미·걸음 결과)'); }
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'} (${pass} 통과 · ${fail} 실패)`);
process.exit(fail ? 1 : 0);
