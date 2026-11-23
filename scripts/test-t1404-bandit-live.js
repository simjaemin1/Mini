#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 3   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1404-bandit-live.js — 도적은 길목에서 산다(T1404 · 손잡이 넷 다 끔 기본: ㉠ `T1404_DEN_ROUTE` · ㉡ `T1404_GANG_FORAGE` · ㉢ `T1404_GANG_SIZE` · ㉣ `T1404_RAID_LURK`) ====
//
// ★왜 [지시 T1404 · ★재민 11-20 판정 16 "도적은 굶어죽지는 않되, 저렇게 너무 바글바글해지지도 않아야 하는데..?"]
//   T1391 이 본 지금: 소굴은 교역 길목 밖 오지(505 ~ 696칸) · 단은 굶어 줄다 흩어진다 · 약탈 0. 진단(보고 §1): 도적 하루가 하루 길 캐러밴을 처음 보는 날은 그 캐러밴이 닿는 날이라
//   늘 길목을 벌써 지났다(T1104 고르기 문 `passed`) · 소굴이 닿는 길(450칸)에 다니는 캐러밴은 1% 남짓 · 단이 먹는 길은 약탈 하나뿐.
// 판(운영 함수 그대로 · 사본 0): 도적 하루 `daily` · 몸 `syncBodies` · econ 길 위 만남 `_raidMeet` → 싸움 `_raidScrum` → 장물(`_t1104Probe` · `test-bandit-walk` 그 틀) ·
//   소굴 배치(`_denBegin` · `_denStep` · `_denEnd`) · 해체 단(`formGang`) · 땅 읽개(`extractLandParamsApprox` — 마을 시딩 그 함수) · econ 표(`JOBS` · `jobCapacity` · `foragerYieldsFor` · `FORAGE_FOOD_FACTOR`).
//   꾸민 세계(아이 프로세스 — 손잡이는 모듈을 읽을 때 정해진다): 목촌(200,200 · 곳간 3,000) — 굽이(350,260) — 이웃(500,200 · 곳간 10) 교역로 · 셋째(650,450 · 곳간 800 · 길 없음) ·
//   숲 둘(목촌 남쪽 x 250 ~ 450 · y 280 ~ 500 — 길에서 20칸 떨어진 곳부터 · 셋째 곁 x 600 ~ 700 · y 400 ~ 500).
//   ① ㉣ 길목에 서서 기다린다 — 하루 길 캐러밴(가는 길 402 → 403)을 단이 길목에서 만난다(장부가 지나는 날 · 길목 칸) · 노획을 더미에 · 끔 = 만남 0(종전 고르기 문은 하루 길을 못 잡는다)
//      ①c 몸 없는 단(판 자 — 가시 몸 상한 밖) = 같은 날 · 같은 싸움 · 같은 몫(몸 판과 같은 답)
//   ② ㉠ 숨을 자리 — 소굴이 털 것 많은 마을(목촌) 곁 숲 · 길목 30칸 안 · 영토 완충 밖 · 끔 = 오지(마을에서 200칸 밖) · 해체 단도 같은 자리 고르기
//   ③ ㉡ 사냥 · 채집 — 날마다 더미에 드는 먹을 것 = econ 그 식(부모가 econ 표로 따로 셈)과 같다 · 상한 n × 60
//   ④ ㉢ 떠남 — 그 땅이 먹이는 수를 넘는 단(40명 · 비축 0)이 굶어 죽지 않는다: 넘친 사람이 갈라져 다른 길목(셋째 곁 숲)으로 걷고 장부가 닿는 날 선다 · 먹이는 수가 셋 밑이면 마을로 걸어가 주민 ·
//      끔 = 굶어 죽음 · 몸은 걷는다(순간이동 0) · 사람 수 보존
//   ⑤ 정적 — T1404 덩이 새 수 0 · econ 수(도구 등급 · 숙련 배수)가 econ 글자와 같다 · 끔 = 셈 칸 · 증인 칸이 안 선다
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 숨을 자리를 안 보는 사본 → ②a ②c ④a 빨강 · ㉡ 떠남 문을 안 여는 사본(종전 굶음) → ④ 빨강 · ㉢ 몸 없는 단원도 몸으로 세는 사본(T1184 그대로) → ①c 만 빨강
// 실행: node scripts/test-t1404-bandit-live.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BFILE = path.join(ROOT, 'server', 'bandits.js');
const R = (p) => require(path.join(ROOT, p));
const BAITS = {
  noHide: { at: ['if (hide && !_t1404Hide(x, y)) continue;', 'if (hide && !true) continue;   // 미끼 ㉠ — 숨을 자리를 안 본다'] },
  noLeave: { at: ['if (T1404_GANG_SIZE && g.zero >= BDT_STARVE) _t1404Leave(g, day);', 'if (T1404_GANG_SIZE && g.zero >= BDT_STARVE && !g) _t1404Leave(g, day);   // 미끼 ㉡ — 떠남 문을 안 연다'] },
  bodyAll: { at: ['if (party.length !== all.length || !party.every((p) => _t1184Here(p, cx, cy))) continue;', 'if (party.length !== (g.n | 0) || !party.every((p) => _t1184Here(p, cx, cy))) continue;   // 미끼 ㉢ — 몸 없는 단원도 몸으로 센다'] },
};
const SZ = 32, MOVE = 64, DAY_MS = 30000, TICK = 100;   // 목의 걸음 · 하루(test-bandit-walk 그 목 값)

if (process.argv[2] === '--child') {   // ── 아이 판 ───────────────────────────────────────────────────────────────
  process.env.ENABLE_VILLAGES = '0';
  const Module = require('module');
  const bait = process.argv[3] && process.argv[3] !== '-' ? BAITS[process.argv[3]] : null;
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename === BFILE && bait) {
      const n = content.split(bait.at[0]).length - 1;
      if (n !== 1) { process.stdout.write('@@' + JSON.stringify({ baitErr: `미끼 자리 ${n}번` }) + '\n'); process.exit(3); }
      content = content.replace(bait.at[0], bait.at[1]);
    }
    return _c.call(this, content, filename);
  };
  const _log = console.log; console.log = () => {};
  const econ = R('sim/economy-sim'), V2 = R('sim/economy-sim-v2'), V = R('server/villages'), B = R('server/bandits');
  const SUB = process.env.T1404H_SUB || 'lurk';
  const players = new Map(), npcs = new Set(), buildings = new Map();
  let pidN = 1, bidN = 1;
  const deps = {
    players, npcs, broadcast: () => {}, buildings,
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY, npcJob: q.npcJob || null }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 30 * DAY_MS, deathDrop: () => 0, worldPhase: () => 0.3, dayPhaseRatio: 0.7,
    setHp: (p, v) => { p.hp = Math.max(0, Math.min(p.maxHp || 100, v)); return p.hp; },
    liveBuildRow: (type, x, y, data, ownerId, ownerName, made) => { const dbId = bidN++; const bo = { id: 'b' + dbId, dbId, type, ownerId, ownerName, x, y, data, floor: 0 }; buildings.set(bo.id, bo); if (made) made.push(bo); return bo; },
    adoptBuildRow: (type, x, y, pred) => { let best = null; for (const b of buildings.values()) if (b.type === type && b.x === x && b.y === y && (!pred || pred(b.data, b)) && (!best || b.dbId < best.dbId)) best = b; return best; },
  };
  const mk = (k, name) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  const SPEC = [['목촌', 200, 200, 30, 3000], ['이웃', 500, 200, 25, 10], ['셋째', 650, 450, 20, 800]];
  const vils = SPEC.map(([name, cx, cy, k, food], i) => {
    const e = mk(k, name);
    for (const r of Object.keys(e.storage || {})) e.storage[r] = 0;
    e.storage.food = food;
    return { dbId: i + 1, name, ccx: cx, ccy: cy, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((j) => ({ x: (cx - 6 + j * 4) * SZ + SZ / 2, y: (cy + 8) * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  });
  const [Va, Vb] = vils, e = Va.econ, e2 = Vb.econ;
  //   교역로 — 운영처럼 4셀 간격 정점(목촌 → 굽이 → 이웃)
  const corner = [[200, 200], [350, 260], [500, 200]], route = [];
  for (let s = 0; s < corner.length - 1; s++) { const [ax, ay] = corner[s], [bx, by] = corner[s + 1], L = Math.hypot(bx - ax, by - ay), n = Math.ceil(L / 4); for (let i = 0; i < n; i++) route.push({ x: (ax + (bx - ax) * i / n) * SZ + SZ / 2, y: (ay + (by - ay) * i / n) * SZ + SZ / 2 }); }
  route.push({ x: 500 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 });
  const W = { day: 400, seed: 7, infoRange: 2000, caravans: [] };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: new Map([['1_2', route]]), _route: null, _distCtx: null, roads: null, epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0, db: { updateBuildingData: () => {} } });
  for (const v of vils) { H.syncVillagePop(v, Infinity); H.syncVillagePop(v, 0); }
  const inF = (x, y) => (x >= 250 && x <= 450 && y >= 280 && y <= 500) || (x >= 600 && x <= 700 && y >= 400 && y <= 500);
  const TA = { isBlocked: () => false, forestMult: (x, y) => (inF(x, y) ? 1.5 : 1), isRock: () => false, isWater: () => false, nearestWaterDist: () => 140, isOre: () => false };
  const host = Object.assign(H.banditHost(), { ta: TA, cellsW: 800, cellsH: 600, t1404Land: (cx, cy) => V.__labProbe.extractLandParamsApprox(TA, cx, cy, { territory: [] }) });
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  B._t1079Probe.install();
  const V2P = V2._t1104Probe;
  const A = { jumps: 0, newBodies: 0, maxStep: 0, ev: {}, days: [] };
  const pos = new Map(), known = new Set(players.keys());
  for (const [id, p] of players) pos.set(id, [p.x, p.y]);
  const gangs = () => B._t1039Probe.gangs();
  const bodiesOf = (g) => ((new Map(B.t1039().bodies)).get(g.id) || []).filter((pid) => players.has(pid));
  const pileOf = (g) => { const t = B.t1079(); const P = g ? t.piles.find((x) => x.gid === g.id) : null; return P ? +P.food.toFixed(6) : null; };
  function moveAudit(dt) {
    for (const [id, p] of players) {
      if (!known.has(id)) { known.add(id); A.newBodies++; }
      const q = pos.get(id); if (!q) { pos.set(id, [p.x, p.y]); continue; }
      const d = Math.hypot(p.x - q[0], p.y - q[1]);
      if (d > A.maxStep) A.maxStep = d;
      const walking = p._t1104W != null || q[2], scale = walking && host.t1104Ppd ? host.t1104Ppd() / (MOVE / 1000 * DAY_MS) : 1;
      if (d > MOVE / 1000 * dt * scale * 1.001 + 0.01) A.jumps++;
      q[2] = p._t1104W != null;
      q[0] = p.x; q[1] = p.y;
    }
  }
  //   econ 캐러밴 하루의 틀(`tickCaravansV2` 차례 그대로 — 만남 → 가는 길 도착 → 귀로 집 도착 · `test-bandit-walk` 그 틀) · 판은 econ 함수 그대로
  const raids = [];
  function econStep(d) {
    for (const k of W.caravans) {
      if (k._done) continue;
      if (W.banditMeet) { const g0 = gangs()[0], n0 = g0 ? g0.n : null; V2P.meet(W, k, d); if (k._raidLoss || k._done) raids.push({ day: d, id: k.id, at: 'meet', leg: k.state, n0, n1: gangs()[0] ? gangs()[0].n : null, done: !!k._done, loss: JSON.parse(JSON.stringify(k._raidLoss || {})) }); if (k._done) continue; }
      if (k.state === 'outbound' && d >= k.arriveDay) { k.lossOut = W.banditMeet ? V2P.taken(k, 'outbound') : 0; if (k._done) continue; k.state = 'inbound'; }
      else if (k.state === 'inbound' && d >= k.returnArriveDay) { k.lossIn = W.banditMeet ? V2P.taken(k, 'inbound') : 0; k._done = true; }
    }
    W.caravans = W.caravans.filter((k) => !k._done);
  }
  { const v1 = R('sim/economy-sim'); if (v1.setSeed) v1.setSeed(11); }
  const plan = {};
  const total = () => vils.reduce((a, v) => a + v.econ.npcs.length, 0) + gangs().reduce((a, g) => a + g.n, 0) + B._t1039Probe.road().reduce((a, r) => a + r.g.n, 0) + B._t765Probe.ledger().length + ((B.stats().starve) | 0);
  let total0 = null;
  if (SUB === 'lurk' || SUB === 'lurkB') {   // 소굴 단(숲 · 굽이 곁) — 하루 길 캐러밴 하나(목촌 → 이웃 · 호위 둘 · 가는 길 402 → 403 · 귀로 → 404)
    B._t1078Probe.dens().push({ id: 1, cx: 320, cy: 300, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    const car = { id: 77, from: e, to: e2, state: 'outbound', departDay: 402, arriveDay: 403, returnArriveDay: 404, giveRes: 'grain', giveAmt: 40, escort: 2, _returningRes: 'wood', _returningAmt: 30 };
    plan.econ402 = () => { W.caravans.push(car); };
    for (let d = 401; d <= 412; d++) plan['after' + d] = ((dd) => () => {
      const g = gangs()[0]; if (!g) return;
      const t = B.t1104().gangs.find((x) => x.id === g.id), T = t && t.t ? t.t : null;
      if (T && T.st === 'lurk' && !A.ev.lurk) A.ev.lurk = { day: dd, x: T.x, y: T.y, key: T.key, d0: T.d0, len: T.len, ppd: T.ppd };
      const met = raids.find((r) => r.day === dd - 1);   // 어제 econ 하루에 치른 만남(운영 차례 — 도적 하루는 econ 하루 뒤 새 날로 돈다)
      if (met && !A.ev.meet) { const ch = A.ev.lurk; const live = bodiesOf(g).map((pid) => players.get(pid)).filter((p) => !p.isDown);
        A.ev.meet = { day: met.day, raid: met, n: g.n, live: live.length, atChoke: ch ? live.filter((p) => Math.hypot(p.x - ch.x, p.y - ch.y) <= 64).length : null, st: T ? T.st : null }; }
      if (A.ev.meet && !A.ev.home && T && T.st === 'camp' && dd > A.ev.meet.day) A.ev.home = { day: dd, pile: pileOf(g) };
    })(d);
  } else if (SUB === 'feed' || SUB === 'feedT' || SUB === 'big' || SUB === 'bigHome') {   // 단 하나 — 'feed' · 'feedT' = 소굴 단(숲) · 'big' = 숲 은거지에 40명(비축 0 · 사람 기록 40) · 'bigHome' = 맨땅(숲 밖) 은거지에 6명
    if (SUB === 'feed' || SUB === 'feedT') B._t1078Probe.dens().push({ id: 1, cx: 320, cy: 300, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    else {
      const n = SUB === 'big' ? 40 : 6, camp = SUB === 'big' ? { cx: 320, cy: 300 } : { cx: 160, cy: 330 };
      const recs = []; for (let i = 0; i < n; i++) { const ev = i % 2 ? e2 : e, q = ev.npcs.pop(); if (q) { if (ev.counts && q.currentJob) ev.counts[q.currentJob] = Math.max(0, (ev.counts[q.currentJob] || 0) - 1); recs.push(q); } }   // 사람 기록 — 목촌 · 이웃 명부에서(그 사람들이 단이 됐다)
      H.syncVillagePop(Va, Infinity); H.syncVillagePop(Vb, Infinity);
      const G0 = { id: 900, camp, n, food: 0, zero: 0, born: 300, home: '목촌', why: '꾸밈', lootN: 0, lastLoot: 300, den: null, _sup: null, _supKill: 0, npc1079: recs };
      gangs().push(G0); B._t1039Probe.syncBodies(true);
    }
    for (let d = 401; d <= 440; d++) plan['after' + d] = ((dd) => () => {
      const T4 = B.t1404 ? B.t1404() : null;
      A.days.push({ d: dd, sum: total(), pop: vils.map((v) => v.econ.npcs.length), gs: gangs().map((g) => ({ id: g.id, n: g.n, food: +(+g.food || 0).toFixed(6), pile: pileOf(g), camp: [g.camp.cx, g.camp.cy], bodies: bodiesOf(g).length, why: g.why,
        w: T4 ? (T4.gangs.find((x) => x.id === g.id) || null) : null })), road: B.t1039().road.map((r) => ({ id: r.id, n: r.n, d0: r.d0, eta: r.eta, camp: r.camp })), walk: B._t765Probe.ledger().length,
        starve: B.stats().starve | 0, st4: T4 ? T4.st : null });
    })(d);
  } else if (SUB === 'site') {   // 자리 고르기 — 소굴 배치(부팅 그 세 마디) · 해체 단 자리(`formGang`)
    const D = B._t1404Probe.denBegin(400); B._t1404Probe.denStep(D); B._t1404Probe.denEnd(D);
    A.ev.dens = B._t1078Probe.dens().map((d) => ({ cx: d.cx, cy: d.cy, dv: d.dv, dr: d.dr }));
    const g = B._t1391Probe.form(Vb, 3, 400, '해체(꾸밈)');
    A.ev.form = g ? { camp: g.camp } : null;
    A.ev.guard = vils.map((v) => ({ cx: v.ccx, cy: v.ccy, r: Math.sqrt(((v.econ.land && v.econ.land.size ? v.econ.land.size * 25 : 2800)) / Math.PI) + 40 }));
    A.ev.forest = (A.ev.dens || []).map((d) => inF(d.cx, d.cy)).concat(g ? [inF(g.camp.cx, g.camp.cy)] : []);
  }
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  function dayClose(d) {   // 도적 하루(새 날) — 운영 차례: econ 하루(d − 1 · 캐러밴 · 만남)가 끝나고 날이 바뀐 뒤 도적 하루가 d 로 돈다(그래서 그날 처음 본 하루 길 캐러밴은 벌써 닿았다 — 진단 `passed`)
    B._t1039Probe.daily(d);
    B._t765Probe.save(d);
    B._t1039Probe.syncBodies();
    for (const v of vils) H.syncVillagePop(v, 2);
    if (total0 == null) total0 = total();
    if (plan['after' + d]) plan['after' + d]();
  }
  const DAYS = SUB === 'site' ? 0 : (SUB === 'lurk' || SUB === 'lurkB') ? 12 : 40;
  total0 = (SUB === 'big' || SUB === 'bigHome') ? total() : null;
  for (let n = 0; n < DAYS * (DAY_MS / TICK); n++) {
    c.t += TICK;
    H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; if (plan['econ' + W.day]) plan['econ' + W.day](); econStep(W.day); W.day++; H.state.lastGameDay++; if (H.T681_ON) H._t681Day(c.t); dayClose(W.day); moveAudit(TICK); }
  }
  const lastSave = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null;
  const out = { sub: SUB, knobs: B._t1404Probe ? B._t1404Probe.ON : null, A, raids, total0, t1404: B.t1404 ? B.t1404() : null, t1104: B.t1104().stat, st: B.stats(), pop: vils.map((v) => v.econ.npcs.length),
    save: lastSave ? { t1404: !!(lastSave.stats && lastSave.stats.t1404) } : null, route: route.length };
  delete out.st.log;
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const KN = ['T1404_DEN_ROUTE', 'T1404_GANG_FORAGE', 'T1404_GANG_SIZE', 'T1404_RAID_LURK'];
const child = (sub, knobs, bait, extra) => {
  const env = Object.assign({}, process.env, { T1404H_SUB: sub });
  for (const k of KN.concat(['T1391_UNHAPPY_BANDIT', 'T1391_DEN_RICH', 'T1143_NO_DISSOLVE', 'BANDIT_FIXTURE', 'VILLAGE_NPC_CAP', 'T1078_BANDIT_ALL', 'T1039_BANDIT_BODY', 'T1079_BANDIT_CAMP', 'T1104_BANDIT_WALK', 'T627_TRIP_DAY', 'BANDIT_BODIES', 'T521_GANG_ARMS'])) delete env[k];
  Object.assign(env, knobs || {}, extra || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` }; }
};
const short = (x) => JSON.stringify(x).slice(0, 420);
const E = R('sim/economy-sim');
//   부모의 econ 셈 — 땅 · 사람 수 · 도구 팔로 하루 먹을 것(econ 표 그대로 · 도적 층 셈과 따로)
function econFood(land, m, arm) {
  const J = E.JOBS, gv = { land, counts: {}, npcs: [], storage: {} }, cap = E.jobCapacity(gv), H = cap.hunter | 0, F = cap.forager | 0;
  const toolF = arm === 'tool' ? 1.4 : 0.25;
  const hy = J.hunter.base * J.hunter.landBoost(gv) * toolF;
  const Y = E.foragerYieldsFor(gv); let sy = 0, sf = 0; for (const k of Object.keys(Y)) { sy += Y[k]; sf += Y[k] * (E.FORAGE_FOOD_FACTOR[k] || 0); }
  const fRaw = J.forager.base * J.forager.landBoost(gv), fy = (f) => fRaw * ((land.forageSustain != null && f * fRaw > 0) ? Math.min(1, land.forageSustain / (f * fRaw)) : 1) * (sy > 0 ? sf / sy : 0);
  let h, f; if (hy >= fy(Math.min(m, F))) { h = Math.min(m, H); f = Math.min(m - h, F); } else { f = Math.min(m, F); h = Math.min(m - f, H); }
  return h * hy + (f > 0 ? f * fy(f) : 0);
}
const ALL = { T1404_DEN_ROUTE: '1', T1404_GANG_FORAGE: '1', T1404_GANG_SIZE: '1', T1404_RAID_LURK: '1' };
function rows(bait) {
  const K = {
    lurkOn: child('lurk', { T1404_RAID_LURK: '1' }, bait), lurkOff: child('lurk', {}, bait), lurkB: child('lurkB', { T1404_RAID_LURK: '1' }, bait, { BANDIT_BODIES: '0' }),
    siteOn: child('site', { T1404_DEN_ROUTE: '1' }, bait), siteOff: child('site', {}, bait),
    feed: child('feed', { T1404_GANG_FORAGE: '1' }, bait), feedT: child('feedT', { T1404_GANG_FORAGE: 'tool' }, bait),
    big: child('big', { T1404_GANG_FORAGE: 'tool', T1404_GANG_SIZE: '1', T1404_DEN_ROUTE: '1' }, bait), bigOff: child('big', { T1404_GANG_FORAGE: 'tool' }, bait),
    home: child('bigHome', { T1404_GANG_FORAGE: '1', T1404_GANG_SIZE: '1' }, bait), off: child('feed', {}, bait),
  };
  const L = [];
  const err = Object.entries(K).filter(([, o]) => !o || o.err || o.baitErr).map(([k, o]) => k + ':' + ((o && (o.err || o.baitErr)) || 'null'));
  L.push(['0', err.length === 0, '[전제] 열한 판이 다 돌았다(길목 · 몸 없는 단 · 자리 · 사냥 채집 · 떠남 · 끔)', err.join(' | ')]);
  // ① ㉣ 길목에 서서 기다린다
  {
    const o = K.lurkOn, m = o.A && o.A.ev.meet, lk = o.A && o.A.ev.lurk, hm = o.A && o.A.ev.home;
    L.push(['①a', !!lk && !!m && m.day === 403 && m.raid.at === 'meet' && m.raid.leg === 'outbound' && m.live > 0 && m.atChoke === m.live && lk.day <= 402,
      '①a 켬 — 단이 길목(은거지에서 가장 가까운 길 정점)에 나가 서서 기다리다 하루 길 캐러밴(402 → 403)을 그 길목에서 만난다(장부가 지나는 날 403 · 산 몸이 다 길목 칸에)', short({ lk, m })]);
    L.push(['①b', !!o.t1104 && o.t1104.home >= 1 && o.t1104.food > 0 && m && m.raid.n1 != null && o.t1404 && o.t1404.st && o.t1404.st.met >= 1 && o.raids.length >= 1,
      '①b 켬 — 만난 뒤 은거지로 돌아와 노획(장물 환산 식량)을 더미에 내린다(T1104 내림 셈) · T1404 만남 셈', short({ t1104: o.t1104, st: o.t1404 && o.t1404.st, raids: o.raids })]);
    const f = K.lurkOff;
    L.push(['①d', f.raids.length === 0 && !(f.t1404 && f.t1404.st) && f.A && !f.A.ev.lurk,
      '①d 끔 — 같은 판에서 만남 0(종전 고르기 문은 하루 길 캐러밴을 못 잡는다 — 진단 `passed` · `far`) · T1404 셈 칸이 안 선다', short({ raids: f.raids, st: f.t1404 && f.t1404.st })]);
    const b = K.lurkB, mb = b.A && b.A.ev.meet;
    L.push(['①c', !!mb && !!m && mb.day === m.day && mb.raid.at === 'meet' && JSON.stringify(mb.raid.loss) === JSON.stringify(m.raid.loss) && mb.raid.n1 === m.raid.n1 && mb.live === 0 && b.t1404 && b.t1404.st && b.t1404.st.metBodiless >= 1,
      '①c 몸 없는 단(판 자 — `BANDIT_BODIES=0`) — 같은 날 · 같은 싸움(남은 단원 수) · 같은 손실 몫 = 몸 판과 같은 답(몸 없는 단원은 장부로 선다)', short({ body: m && { day: m.day, loss: m.raid.loss, n1: m.raid.n1 }, bodiless: mb && { day: mb.day, loss: mb.raid.loss, n1: mb.raid.n1, live: mb.live } })]);
  }
  // ② ㉠ 숨을 자리
  {
    const o = K.siteOn, ds = (o.A && o.A.ev.dens) || [], g = o.A ? o.A.ev.guard : [], fr = o.A ? o.A.ev.forest : [];
    const d0 = ds[0], dA = d0 ? Math.hypot(d0.cx - 200, d0.cy - 200) : null, dB = d0 ? Math.hypot(d0.cx - 500, d0.cy - 200) : null;
    const outG = (p) => g.every((q) => Math.hypot(p.cx - q.cx, p.cy - q.cy) >= q.r);
    L.push(['②a', !!d0 && fr[0] === true && d0.dr <= 30 && dA < dB && outG(d0),
      '②a 켬 — 첫 소굴 = 털 것 많은 마을(목촌 · 곳간 3,000) 곁 숲(숨을 자리) · 길목 30칸 안 · 영토 완충 밖', short({ d0, dA, dB, fr })]);
    const f = K.siteOff, f0 = f.A && f.A.ev.dens ? f.A.ev.dens[0] : null;
    L.push(['②b', !!f0 && f0.dv >= 200 && !(f.t1404 && f.t1404.st),
      '②b 끔 — 소굴 = 오지(가장 가까운 마을에서 200칸 밖 · 종전 `denScan`) · T1404 셈 칸이 안 선다', short({ f0 })]);
    const fm = o.A && o.A.ev.form;
    L.push(['②c', !!fm && fr[fr.length - 1] === true && Math.hypot(fm.camp.cx - 200, fm.camp.cy - 200) < Math.hypot(fm.camp.cx - 500, fm.camp.cy - 200) && outG(fm.camp),
      '②c 켬 — 해체 단(이웃에서 선다)도 정보 반경 안 털 것 많은 마을(목촌) 곁 숲에 선다', short({ fm, fr })]);
  }
  // ③ ㉡ 사냥 · 채집
  {
    const r = [];
    for (const [k, arm] of [['feed', '1'], ['feedT', 'tool']]) {
      const o = K[k], ds = (o.A && o.A.days) || [];
      const i0 = ds.findIndex((x) => x.gs.length && x.gs[0].w && x.gs[0].w.land);
      const a = ds[i0], b = ds[i0 + 1];
      const land = a ? a.gs[0].w.land : null, n = a ? a.gs[0].n : 0;
      const want = land ? econFood(Object.assign({ size: land.size, baseSize: land.size, arable: 1, water: 0, ore: 0 }, land), n, arm) : null;
      const got = a && b ? +(b.gs[0].pile - a.gs[0].pile + n * 0.5).toFixed(6) : null;   // 하루 = 사냥 채집 − 유지비(0.5 × n)
      r.push({ k, n, want: want != null ? +want.toFixed(6) : null, plan: a ? a.gs[0].w.plan : null, got, ok: want != null && got != null && Math.abs(got - want) < 1e-6 && a.gs[0].w.plan && Math.abs(a.gs[0].w.plan.food - want) < 1e-6 });
    }
    L.push(['③a', r.every((x) => x.ok) && r[1].want > r[0].want,
      '③a 켬 — 날마다 더미에 드는 먹을 것 = econ 그 식(직업 자리 · 사냥 base × 짐승 땅 × 도구 등급 · 채집 base × 땅 × 식량 환산 — 부모가 econ 표로 따로 센 값) · 석기 팔(tool) > 맨손 팔(1)', short(r)]);
    const f = K.off, fd = (f.A && f.A.days) || [], g0 = fd.find((x) => x.gs.length);
    L.push(['③b', !!g0 && !(f.t1404 && f.t1404.st) && !f.save.t1404,
      '③b 끔 — 사냥 채집 0 · T1404 셈 칸 · 저장 칸이 안 선다', short({ st: f.t1404 && f.t1404.st, save: f.save })]);
  }
  // ④ ㉢ 떠남
  {
    const o = K.big, ds = (o.A && o.A.days) || [], last = ds[ds.length - 1], st = o.t1404 && o.t1404.st;
    const g2 = last ? last.gs.find((x) => x.id !== 900) : null, g1 = last ? last.gs.find((x) => x.id === 900) : null;
    const cap0 = ds.length && ds[0].gs[0] && ds[0].gs[0].w ? ds[0].gs[0].w.cap : null;
    const inF = (x, y) => (x >= 250 && x <= 450 && y >= 280 && y <= 500) || (x >= 600 && x <= 700 && y >= 400 && y <= 500);
    L.push(['④a', !!st && st.split === 1 && !!g1 && !!g2 && cap0 != null && cap0 >= 3 && g1.n === cap0 && g2.n === 40 - cap0 && (o.st.starve | 0) === 0 && Math.hypot(g2.camp[0] - 650, g2.camp[1] - 450) < Math.hypot(g2.camp[0] - 320, g2.camp[1] - 300) && Math.hypot(g2.camp[0] - 320, g2.camp[1] - 300) >= 250 && inF(g2.camp[0], g2.camp[1]) && g2.bodies === g2.n,
      '④a 켬 — 40명 · 비축 0 · 그 땅이 먹이는 수 셋 이상 → 넘친 사람이 갈라져 다른 길목(셋째 곁 숲 — 숨을 자리 · 있는 단에서 소굴 이격 250칸 밖)으로 걷고 장부가 닿는 날 선다(몸 = n) · 남은 단 = 먹이는 수 · 굶어 죽음 0', short({ cap0, g1, g2: g2 && { id: g2.id, n: g2.n, camp: g2.camp, bodies: g2.bodies, why: g2.why }, st, starve: o.st.starve })]);
    const h = K.home, hd = (h.A && h.A.days) || [], hl = hd[hd.length - 1], hs = h.t1404 && h.t1404.st;
    L.push(['④b', !!hs && hs.home >= 4 && hs.homeRec >= 4 && (h.st.starve | 0) === 0 && !!hl && hl.pop[0] >= hd[0].pop[0] + hs.homeRec,
      '④b 켬 — 맨땅(먹이는 수 셋 밑) 6명 → 넘친 사람이 가장 가까운 산 마을로 걸어가 주민이 된다(사람 기록) · 굶어 죽음 0', short({ hs, pop0: hd[0] && hd[0].pop, popEnd: hl && hl.pop, starve: h.st.starve })]);
    const f = K.bigOff;
    L.push(['④c', (f.st.starve | 0) > 0 && !(f.t1404 && f.t1404.st && f.t1404.st.leave),
      '④c 끔(㉢) — 같은 단이 굶어 죽는다(종전 굶음 줄) · 떠남 0', short({ starve: f.st.starve, st: f.t1404 && f.t1404.st })]);
    const r = [K.big, K.home, K.lurkOn].map((x) => ({ s: x.sub, j: x.A ? x.A.jumps : null, nb: x.A ? x.A.newBodies : null }));
    const cons = [K.big, K.home].map((x) => ({ s: x.sub, ok: x.A && x.A.days.every((d) => d.sum === x.total0), bad: x.A ? x.A.days.filter((d) => d.sum !== x.total0).slice(0, 2).map((d) => [d.d, d.sum, x.total0]) : null }));
    L.push(['④d', r.every((x) => x.j === 0) && cons.every((x) => x.ok),
      '④d 몸은 걷는다(틱마다 걸음 ≤ 걸음 × 틱 · 장부 걸음은 장부 하루로) · 사람 수 보존(Σ 마을 + Σ 단 + 길 위 단 + 길 위 걷기 + 굶어 죽음 = 처음 합)', short({ r, cons })]);
  }
  return L;
}
console.log('\n=== T1404 — 도적은 길목에서 산다(㉠ `T1404_DEN_ROUTE` · ㉡ `T1404_GANG_FORAGE` · ㉢ `T1404_GANG_SIZE` · ㉣ `T1404_RAID_LURK` — 다 끔 기본) ===');
//   ⑤ 정적
{
  const src = fs.readFileSync(BFILE, 'utf8');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const a = code.indexOf('let _t1404E = null;'), b = code.indexOf('function t1404() {');
  const blk = a > 0 && b > a ? code.slice(a, b).replace(/'[^']*'|`[^`]*`/g, '').replace(/SZ \/ 2/g, '') : '';
  const num = /[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/;
  ok(a > 0 && b > a && !num.test(blk), '⑤a 정적 · T1404 덩이(bandits)에 새 수 0(0 · 1 말고 수 글자 없음 — 수는 econ · 도적 층 이름으로만)', a > 0 && b > a ? (blk.match(num) || [''])[0] : '덩이 없음');
  const es = fs.readFileSync(path.join(ROOT, 'sim', 'economy-sim.js'), 'utf8');
  const m = src.match(/const T1404_ECON = \{ bare: ([\d.]+), stone: ([\d.]+), bronze: ([\d.]+), iron: ([\d.]+), skill: ([\d.]+) \};/);
  const t = es.match(/toolBoostShared = \(ni \* ([\d.]+) \+ nb \* ([\d.]+) \+ ns \* _stoneToolBoost \+ nn \* ([\d.]+)\) \/ toolDeps;/), q = es.match(/const _stoneToolBoost = \(v\._toolQ != null\) \? v\._toolQ : ([\d.]+);/), s = es.match(/const skillMul = 1 \+ skillLvl \* ([\d.]+);/);
  ok(!!m && !!t && !!q && !!s && m[1] === t[3] && m[2] === q[1] && m[3] === t[2] && m[4] === t[1] && m[5] === s[1],
    '⑤b 정적 · ㉡ 의 econ 수(도구 등급 맨손 · 석기 · 청동 · 철 · 숙련 배수)가 econ 글자(`tickVillage`)와 같다 — 사본 지킴', short({ m: m && m.slice(1), t: t && t.slice(1), q: q && q[1], s: s && s[1] }));
  ok(/const T1404_RAID_LURK = T1104_WALK && /.test(src) && /_t1404Meet\(c, day\)/.test(src) && /if \(T1404_RAID_LURK\) return _t1404Meet\(c, day\);/.test(src),
    '⑤c 정적 · ㉣ 은 T1104 걸음 켬 위에서만 선다 · 만남 문 하나(`_t1104Meet` 첫 줄 갈래)');
}
const MAIN = rows();
for (const [, c, m, d] of MAIN) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(BFILE, 'utf8');
const RED = { noHide: ['②a', '②c', '④a'], noLeave: ['④a', '④b'], bodyAll: ['①c'] };
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = SRC.split(Bt.at[0]).length - 1;
  const red = n === 1 ? rows(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
ok(BR.noHide.n === 1 && BR.noHide.same, `미끼 ㉠ — 숨을 자리를 안 보는 사본 → 빨강 줄이 꼭 {${RED.noHide.join(', ')}}(소굴 · 해체 단 · 갈라진 단 자리)`, `바꾼 자리 ${BR.noHide.n} · 빨강 {${(BR.noHide.red || []).join(', ')}}`);
ok(BR.noLeave.n === 1 && BR.noLeave.same, `미끼 ㉡ — 떠남 문을 안 여는 사본(종전 굶음) → 빨강 줄이 꼭 {${RED.noLeave.join(', ')}}`, `바꾼 자리 ${BR.noLeave.n} · 빨강 {${(BR.noLeave.red || []).join(', ')}}`);
ok(BR.bodyAll.n === 1 && BR.bodyAll.same, `미끼 ㉢ — 몸 없는 단원도 몸으로 세는 사본(T1184 그대로) → 빨강 줄이 꼭 {${RED.bodyAll.join(', ')}}`, `바꾼 자리 ${BR.bodyAll.n} · 빨강 {${(BR.bodyAll.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
