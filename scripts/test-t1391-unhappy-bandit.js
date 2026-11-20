#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1391-unhappy-bandit.js — 불행한 사람이 이주가 아니라 도적이 되면(T1391 · 손잡이 `T1391_UNHAPPY_BANDIT` 끔 기본 · `nohome` · `all` · 팔 `T1391_DEN_RICH`) ====
//
// ★왜 [지시 T1391 · ★재민 "이주가 아니라 도적이 되게 하는 건 어때..? 행복이 낮으면 무조건 도적이 되게 하면 어떨지 보고 싶은데"]
//   불행 이탈(h < 0.25 · T1134 · T1205)이 고른 사람은 지금 이웃 마을로 걷는다(받는 곳 고르기 T1147 — 받는 곳이 없으면 제 마을에 남는다).
//   `nohome` = 받는 곳이 없는 사람만 도적 · `all` = 늘 도적. 도적이 되는 길 = 정보 반경 안 단에 걸어 든다(절망 이탈 그 길) · 없으면 새 단(셋이 모이면 선다).
// 판(운영 함수 그대로 · 사본 0): 불행 이탈 호스트 문 `_t1075Leave`(`_t765Probe.leave` — econ 고리가 부르는 그 문) · 받는 곳 고르기 `_t1147Pick` ·
//   이주 걷기 `t765Depart` · 단 걷기 `t1039Depart` · 도적 하루 `daily` · 몸 `syncBodies` · 저장 `save` · 마을 몸 문(`syncVillagePop` · `tickBodyExits` · `_t681Day`).
//   고른 사람 · 문 뒤 명부 빼기는 econ 고리 그 줄(가장 젊은 자유민 · 문이 거짓이면 그날 멈춘다 · 참이면 명부에 남았을 때만 뺀다 — T1109).
//   꾸민 마을 넷 — 불행(행복 0.1 · 20명) · 받을 수 있는 이웃(행복 0.9 · 침상 · 곳간) · 받을 수 없는 이웃(행복 0.05 — 불행 마을보다 덜 행복) ·
//   정보 반경 밖 부자 마을(행복 0.05 · 곳간이 가장 크다 — 덧붙임 팔의 "아는 마을만").
//   세계(아이 프로세스 — 손잡이는 모듈을 읽을 때 정해진다): 'gang' = 정보 반경 안 단 하나(4명) · 'nogang' = 단 없음 · 'starve' = 한 사람만 · 'rich' = 덧붙임 팔 · 'far' = 먼 불행 마을.
//   날 401 ① 받는 곳이 있는 날 한 사람 · 날 404 ② 받는 곳이 없는 날(받을 수 있던 이웃 행복을 0.05 로) 세 사람.
//   ① 끔 — 받는 곳이 있으면 이웃 마을로(닿으면 그 마을 +1) · 없으면 아무도 안 떠난다 · T1391 셈 칸 · 저장 표지가 안 선다(끔 = 종전 갈래)
//   ② nohome — 받는 곳이 있으면 이주(끔과 같은 줄) · 없으면 도적(단이 있으면 그 단에 걸어 든다 · 없으면 새 단)
//   ③ all — 받는 곳이 있어도 도적(단이 있으면 그 단에 · 없으면 새 단)
//   ④ 새 단 — 셋 전엔 은거지에 닿아도 안 선다(몸은 은거지에 서서 기다리고 유지비를 진다) · 셋째가 은거지에 닿는 날 선다 · 선 단 몸 = 단 n
//   ⑤ 몸은 걷는다 — 틱마다 몸 걸음 ≤ 걸음 × 틱(순간이동 0) · 새 몸 0(도적 몸은 다 마을에 있던 몸)
//   ⑥ 사람 수 보존 — 문이 참이면 그 사람은 곧 명부에 없고 그 순간 합이 같다 · 날마다 Σ 마을 econ + Σ 단 n + Σ 길 위 단 n + 길 위 이주 + 굶어 쓰러진 사람 = 처음 합
//   ⑦ 덧붙임 팔(`T1391_DEN_RICH=1`) — 새 단 · 해체 단 은거지 = 정보 반경 안 가장 털 것 많은 마을 곁(반경 밖 부자 마을은 모른다) · 팔 끔 = 제 마을 곁
//   ⑧ 모이는 단(셋 전)이 오래 혼자면 — 결성 비축(한 사람 6)을 유지비로 다 먹고 굶주림 10날에 쓰러진다(몸이 그 자리에 눕는다) · 장부가 빈다
//   ⑨ 셋째가 닿는 날 — 먼 불행 마을 사람이 셋째로 들어 아직 길 위여도, 이튿날 든 가까운 사람이 셋째로 닿는 날 선다('far' · 하루 걸음 12칸)
//      (그때 아직 걷던 몸은 그 자리에서 단 몸이 된다 — 존 일과가 은거지로 걷게 한다 · 목 세계엔 일과가 없어 선 자리에 머문다)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ㉠ 단 합류에서 econ 인구를 안 빼는 사본 → 보존(⑥) · 문 뒤 명부 · 몸 줄 빨강 · ㉡ `nohome` 이 받는 곳을 안 보는 사본(= all) → nohome 줄(②a · ②b · ②c · ④b)만 빨강
// 실행: node scripts/test-t1391-unhappy-bandit.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BFILE = path.join(ROOT, 'server', 'bandits.js');
const BAITS = {
  noTake: { at: ['const npc = e.npcs.splice(at, 1)[0];', 'const npc = e.npcs[at];   // 미끼 ㉠ — 명부에서 안 뺀다'] },
  nhAll: { at: ["if (T1391_UB === 'all') return _t1391Bandit(", "if (T1391_UB) return _t1391Bandit("] },
};

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
  const R = (p) => require(path.join(ROOT, p));
  const E1 = R('sim/economy-sim'), V2 = R('sim/economy-sim-v2'), V = R('server/villages'), B = R('server/bandits');
  const WORLD = process.env.T1391H_WORLD || 'nogang';
  const SZ = 32, MOVE = 64, DAY_MS = WORLD === 'far' ? 6000 : 30000, TICK = 100;   // 목의 걸음 · 하루(test-bandit-all 과 같은 목 값 · 'far' = 하루 걸음 12칸 — 닿는 날이 사람마다 갈린다)
  const players = new Map(), npcs = new Set();
  let pidN = 1;
  const deps = {
    players, npcs, broadcast: () => {},
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: { meat: 2 },
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY, npcJob: q.npcJob || null }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 3 * DAY_MS,
    deathDrop: () => 0, worldPhase: () => 0.3, dayPhaseRatio: 0.7,
    setHp: (p, v) => { p.hp = Math.max(0, Math.min(p.maxHp || 100, v)); return p.hp; },
  };
  const mk = (k, name) => E1.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  //   마을 넷(셀) — 불행 U(200,200) · 받는 A(260,200) · 못 받는 N(200,290) · 반경 밖 부자 F(560,470)
  const SPEC = [['불행', 200, 200, 20, 0.1, 20], ['받는', 260, 200, 10, 0.9, 500], ['못받는', 200, 290, 10, 0.05, 20], ['먼부자', 560, 470, 10, 0.05, 5000]]
    .concat(WORLD === 'far' ? [['먼불행', 70, 320, 10, 0.1, 20]] : []);   // 'far' = 은거지에서 먼 불행 마을 하나 더(정보 반경 안)
  const vils = SPEC.map(([name, cx, cy, k, h, food], i) => {
    const e = mk(k, name);
    for (const r of Object.keys(e.storage || {})) e.storage[r] = 0;
    e.storage.food = food; e.lastStats = Object.assign({}, e.lastStats || {}, { happiness: h }); e.housing = k + 20;
    return { dbId: i + 1, name, ccx: cx, ccy: cy, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((j) => ({ x: (cx - 6 + j * 4) * SZ + SZ / 2, y: (cy + 8) * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  });
  const [U, A] = vils, Nv = vils[2];
  const W = { day: 400, seed: 7, infoRange: 300, caravans: [] };   // 정보 반경 = 300 ÷ 2.5 = 120셀(F 는 밖)
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: new Map(), _route: null, _distCtx: null, roads: null, epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0, econ: E1, econV2: V2 });
  for (const v of vils) H.syncVillagePop(v, Infinity);
  const host = Object.assign(H.banditHost(), { ta: { isBlocked: () => false, forestMult: () => 1 }, cellsW: 800, cellsH: 600 });
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  const G0 = WORLD === 'gang' ? { id: 900, camp: { cx: 130, cy: 150 }, n: 4, food: 100, zero: 0, born: 300, home: '산', why: '꾸밈', lootN: 0, lastLoot: 300, den: null, _sup: null, _supKill: 0 } : null;
  if (G0) { B._t1039Probe.gangs().push(G0); B._t1039Probe.syncBodies(true); }   // 정보 반경 안 단 하나(은거지 몸 4 — 부팅 실체화 문)
  const T391 = () => (typeof B.t1391 === 'function' ? B.t1391() : null);
  const ids0 = new Set(players.keys());
  const A_ = { calls: [], days: [], jumps: 0, maxStep: 0, newBodies: 0, ev: {} };
  const pos = new Map(); for (const [id, p] of players) pos.set(id, [p.x, p.y]);
  const walk = () => B._t765Probe.ledger();
  const deadW = () => { const T = T391(); return T && T.st ? T.st.waitStarve | 0 : 0; };
  const total = () => vils.reduce((a, v) => a + v.econ.npcs.length, 0) + B._t1039Probe.gangs().reduce((a, g) => a + g.n, 0) + B._t1039Probe.road().reduce((a, r) => a + r.g.n, 0) + walk().length + deadW();
  const bodiesOf = (gid) => ((new Map(B.t1039().bodies)).get(gid) || []).filter((pid) => players.has(pid));
  const total0 = total();
  function emig(day, k, tag, from) {   // econ 고리 그 줄(가장 젊은 자유민 · 문이 거짓이면 그날 멈춘다 · 참이면 명부에 남았을 때만 뺀다 — T1109)
    const e = (from || U).econ;
    for (let j = 0; j < k; j++) {
      let yi = -1; for (let i = 0; i < e.npcs.length; i++) { const q = e.npcs[i]; if (q._warDraft) continue; if (yi < 0 || q.age < e.npcs[yi].age) yi = i; }
      if (yi < 0) break;
      const p = e.npcs[yi], s0 = total(), n0 = e.npcs.length, w0 = walk().length;
      let took = false, err = null; try { took = !!B._t765Probe.leave(e, p, day); } catch (x) { err = String((x && x.message) || x); }
      const inRoster = e.npcs.indexOf(p) >= 0;
      A_.calls.push({ day, tag, took, err, inRoster, n0, n1: e.npcs.length, s0, s1: total(), w0, w1: walk().length });
      if (took && inRoster) { e.npcs.splice(e.npcs.indexOf(p), 1); if (e.counts && p.currentJob) e.counts[p.currentJob] = Math.max(0, (e.counts[p.currentJob] || 0) - 1); }
      if (!took) break;
    }
  }
  const plan = {};
  if (WORLD === 'gang' || WORLD === 'nogang') {
    plan[401] = () => emig(401, 1, '①');
    plan[404] = () => { A.econ.lastStats.happiness = 0.05; emig(404, 3, '②'); };   // 받을 수 있던 이웃도 덜 행복 = 받는 곳 없음
  } else if (WORLD === 'starve') {
    plan[401] = () => emig(401, 1, '①');
  } else if (WORLD === 'far') {   // 불행 둘 → 먼 불행 하나(셋째 · 먼 길) → 이튿날 불행 하나(넷째 · 가까운 길)
    plan[401] = () => { emig(401, 2, '①'); emig(401, 1, '①q', vils[4]); };
    plan[402] = () => emig(402, 1, '②');
  } else if (WORLD === 'rich') {
    plan[401] = () => emig(401, 1, '①');
    plan[402] = () => { const g = B._t1391Probe ? B._t1391Probe.form(Nv, 3, 402, '해체(꾸밈)') : null; A_.ev.form = g ? { id: g.id, camp: g.camp } : null; };   // 해체 문(운영 `formGang`)도 같은 자리 고르기
  }
  const END = WORLD === 'starve' ? 426 : WORLD === 'far' ? 414 : 410;
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  function moveAudit(dt) {
    for (const [id, p] of players) {
      if (!ids0.has(id) && !pos.has(id)) A_.newBodies++;
      const q = pos.get(id); if (!q) { pos.set(id, [p.x, p.y]); continue; }
      const d = Math.hypot(p.x - q[0], p.y - q[1]);
      if (d > A_.maxStep) A_.maxStep = d;
      if (d > MOVE / 1000 * dt * 1.001 + 0.01) A_.jumps++;
      q[0] = p.x; q[1] = p.y;
    }
  }
  function dayClose(d) {
    if (plan[d]) plan[d]();
    B._t1039Probe.daily(d);
    B._t765Probe.save(d);
    B._t1039Probe.syncBodies();
    for (const v of vils) H.syncVillagePop(v, 2);
    const T = T391();
    const gs = B._t1039Probe.gangs().map((g) => { const b = bodiesOf(g.id); const C = { x: g.camp.cx * SZ + SZ / 2, y: g.camp.cy * SZ + SZ / 2 };
      return { id: g.id, n: g.n, bodies: b.length, at: Object.fromEntries(b.map((pid) => [pid, +(Math.hypot(players.get(pid).x - C.x, players.get(pid).y - C.y) / SZ).toFixed(2)])), far: Math.max(0, ...b.map((pid) => Math.hypot(players.get(pid).x - C.x, players.get(pid).y - C.y) / SZ)), walkers: H._t1078Walkers().filter((w) => w.gid === g.id).length,
        all0: b.every((pid) => ids0.has(pid)) }; });
    const wt = (T && T.wait ? T.wait : []).map((r) => { const C = { x: r.camp.cx * SZ + SZ / 2, y: r.camp.cy * SZ + SZ / 2 }; const ps = r.pids.filter((pid) => players.has(pid));
      return { gid: r.gid, n: r.n, food: r.food, form: r.form != null ? r.form : null, ppd: r.ppd, mem: r.mem || null, pids: r.pids.slice(), bodies: ps.length, far: ps.length ? Math.max(...ps.map((pid) => Math.hypot(players.get(pid).x - C.x, players.get(pid).y - C.y) / SZ)) : null }; });
    const road = B.t1039().road.map((r) => ({ id: r.id, n: r.n, d0: r.d0, eta: r.eta }));
    A_.days.push({ d, pop: vils.map((v) => v.econ.npcs.length), gs, wt, road, walk: walk().length, walk1075: walk().filter((w) => w.t1075).length, sum: total(), dead: deadW(), lying: [...H.state.bodyExits.values()].filter((r) => r.cat === 'died').length });
  }
  const NT = (END - W.day) * (DAY_MS / TICK);   // 틱 수(끝 날까지 · 루프 안에서 날이 바뀌므로 먼저 센다)
  for (let n = 0; n < NT; n++) {
    c.t += TICK;
    H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; if (H.T681_ON) H._t681Day(c.t); dayClose(W.day); moveAudit(TICK); }
  }
  const T = T391();
  const ex = H.state.bodyExits;
  const lastSave = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null;
  const saves = db.rows.map((r) => JSON.parse(r.json));
  const out = { world: WORLD, arm: process.env.T1391_UNHAPPY_BANDIT || '', rich: process.env.T1391_DEN_RICH === '1', total0, A: A_, has: typeof B.t1391 === 'function',
    t: T ? { ub: T.ub, rich: T.rich, st: T.st, log: T.log } : null,
    save: { st: saves.some((s) => s.stats && s.stats.t1391 != null), road: saves.some((s) => Array.isArray(s.road) && s.road.some((r) => r.t1391)), last: lastSave ? { stats1391: lastSave.stats ? lastSave.stats.t1391 || null : null } : null },
    vil: vils.map((v) => ({ name: v.name, cx: v.ccx, cy: v.ccy })),
    died: [...ex.values()].filter((r) => r.cat === 'died').length, g0: G0 ? G0.id : null };
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const child = (world, arm, rich, bait) => {
  const env = Object.assign({}, process.env, { T1391H_WORLD: world, T1391_UNHAPPY_BANDIT: arm || '', T1391_DEN_RICH: rich ? '1' : '' });
  for (const k of ['T1143_NO_DISSOLVE', 'BANDIT_FIXTURE', 'VILLAGE_NPC_CAP', 'T1078_BANDIT_ALL', 'T1039_BANDIT_BODY', 'T1079_BANDIT_CAMP', 'T1104_BANDIT_WALK', 'T627_TRIP_DAY', 'T1312_HERD', 'T1306_MIGRATE_FOOD', 'T1324_XZ_MIGRATE']) delete env[k];
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` }; }
};
const dayOf = (o, d) => (o && o.A ? o.A.days.find((x) => x.d === d) : null) || null;
const callsOf = (o, tag) => (o && o.A ? o.A.calls.filter((c) => c.tag === tag) : []);
const logOf = (o, k) => (o && o.t && o.t.log ? o.t.log.filter((r) => r.k === k) : []);
const short = (x) => JSON.stringify(x).slice(0, 420);
function rows(bait) {
  const K = {};
  for (const w of ['gang', 'nogang']) for (const a of ['', 'nohome', 'all']) K[w + ':' + (a || 'off')] = child(w, a, false, bait);
  K.starve = child('starve', 'all', false, bait); K.rich = child('rich', 'all', true, bait); K.richOff = child('rich', 'all', false, bait); K.far = child('far', 'all', false, bait);
  const L = [];
  const all = Object.values(K);
  const err = all.filter((o) => !o || o.err || o.baitErr).map((o) => (o && (o.err || o.baitErr)) || 'null');
  L.push(['0', err.length === 0, '[전제] 열 판이 다 돌았다(갈래 둘 × 끔 · nohome · all + 굶주림 · 덧붙임 팔 켬 · 끔 · 먼 길)', err.join(' | ')]);
  // ① 끔
  {
    const r = [];
    for (const w of ['gang', 'nogang']) {
      const o = K[w + ':off'], c1 = callsOf(o, '①'), c2 = callsOf(o, '②'), d401 = dayOf(o, 401), d403 = dayOf(o, 403), d410 = dayOf(o, 410), d0 = o.A ? o.A.days[0] : null;
      const gN = (d) => (d ? d.gs.reduce((a, g) => a + g.n, 0) : null);
      r.push({ w, a: c1.length === 1 && c1[0].took && !c1[0].inRoster && c1[0].w1 === c1[0].w0 + 1 && d401 && d401.walk1075 === 1 && gN(d401) === (w === 'gang' ? 4 : 0) && d401.wt.length === 0,
        b: !!d403 && d403.pop[1] === 11 && d403.walk === 0,
        c: c2.length === 1 && !c2[0].took && c2[0].n1 === c2[0].n0 && !!d410 && d410.pop[0] === 19 && gN(d410) === (w === 'gang' ? 4 : 0) && d410.wt.length === 0 && d410.road.length === 0,
        d: !!o.has && o.t && o.t.ub === '' && o.t.st == null && (o.t.log || []).length === 0 && !o.save.st && !o.save.road, x: { c1, c2, d401: d401 && { walk: d401.walk, w1075: d401.walk1075 }, a403: d403 && d403.pop, t: o.t, sv: o.save } });
    }
    L.push(['①a', r.every((x) => x.a), '①a 끔 · 받는 곳이 있다 — 문 참 · 그 사람은 명부에 없다 · 길 위 이주 장부 +1(불행 표지) · 단 · 길 위 단 그대로(단 있는 판 · 없는 판)', short(r.map((x) => [x.w, x.x.c1, x.x.d401]))]);
    L.push(['①b', r.every((x) => x.b), '①b 끔 · 걸어 닿으면 받는 마을 +1(10 → 11) · 길 위 이주 장부가 빈다', short(r.map((x) => [x.w, x.x.a403]))]);
    L.push(['①c', r.every((x) => x.c), '①c 끔 · 받는 곳이 없다 — 문 거짓 한 번에 그날 멈춘다 · 아무도 안 떠난다(불행 마을 19 그대로) · 단 · 모이는 단 0 변화', short(r.map((x) => [x.w, x.x.c2]))]);
    L.push(['①d', r.every((x) => x.d), '①d 끔 · T1391 셈 칸 · 관찰 줄 · 저장 표지(모이는 단 · 셈)가 안 선다(손잡이 값 \'\')', short(r.map((x) => [x.w, x.x.t, x.x.sv]))]);
  }
  // ② nohome
  {
    const o = K['gang:nohome'], c1 = callsOf(o, '①'), c2 = callsOf(o, '②'), d401 = dayOf(o, 401), d410 = dayOf(o, 410);
    const q = K['nogang:nohome'], q1 = callsOf(q, '①'), q2 = callsOf(q, '②'), q401 = dayOf(q, 401);
    L.push(['②a', c1.length === 1 && c1[0].took && c1[0].w1 === c1[0].w0 + 1 && d401 && d401.walk1075 === 1 && d401.gs.length === 1 && d401.gs[0].n === 4 && q1.length === 1 && q1[0].took && q1[0].w1 === q1[0].w0 + 1 && q401 && q401.wt.length === 0 && logOf(o, 'join').filter((r) => r.day === 401).length === 0,
      '②a nohome · 받는 곳이 있다 — 끔과 같은 줄(이웃 마을로 걷는다 · 단 n 그대로 · 새 단 0)', short({ gang: c1, nogang: q1 })]);
    const J = logOf(o, 'join');
    L.push(['②b', c2.length === 3 && c2.every((x) => x.took && !x.inRoster) && J.length === 3 && J.every((r) => r.arm === 'nohome' && r.gid === o.g0) && d410 && d410.gs.length === 1 && d410.gs[0].n === 7 && d410.gs[0].bodies === 7 && d410.gs[0].walkers === 0 && d410.pop[0] === 16,
      '②b nohome · 받는 곳이 없다 · 정보 반경 안 단 — 세 사람이 그 단에 든다(단 4 → 7 · 걸어 닿아 은거지 몸 7 · 걷는 몸 0 · 불행 마을 20 → 16)', short({ c2, J, d410: d410 && d410.gs })]);
    const F = logOf(q, 'found'), JW = logOf(q, 'joinWait'), FM = logOf(q, 'formed');
    const g = q && q.A ? q.A.days.find((x) => x.gs.length) : null;
    L.push(['②c', q2.length === 3 && q2.every((x) => x.took && !x.inRoster) && F.length === 1 && JW.length === 2 && FM.length === 1 && FM[0].n === 3 && !!g && g.gs[0].n === 3,
      '②c nohome · 받는 곳이 없다 · 단 없음 — 첫 사람이 새 단(은거지 · 길 위 장부) · 둘이 그리로 걷는다 → 셋이 모여 선다', short({ q2, F, JW, FM })]);
  }
  // ③ all
  {
    const o = K['gang:all'], c1 = callsOf(o, '①'), d401 = dayOf(o, 401), d410 = dayOf(o, 410), J = logOf(o, 'join');
    L.push(['③a', c1.length === 1 && c1[0].took && !c1[0].inRoster && c1[0].w1 === c1[0].w0 && d401 && d401.walk === 0 && J.length === 4 && J[0].day === 401 && J.every((r) => r.arm === 'all' && r.gid === o.g0) && d410 && d410.gs[0].n === 8 && d410.gs[0].bodies === 8 && d410.gs[0].walkers === 0,
      '③a all · 받는 곳이 있어도 도적 — 이주 장부 0 · 정보 반경 안 단에 든다(① 한 사람 + ② 세 사람 → 단 4 → 8 · 은거지 몸 8)', short({ c1, J: J.map((r) => [r.day, r.gid, r.n]), d410: d410 && d410.gs })]);
    const q = K['nogang:all'], q1 = callsOf(q, '①'), F = logOf(q, 'found'), JW = logOf(q, 'joinWait'), FM = logOf(q, 'formed');
    L.push(['③b', q1.length === 1 && q1[0].took && !q1[0].inRoster && q1[0].w1 === q1[0].w0 && F.length === 1 && F[0].day === 401 && JW.length === 3 && FM.length === 1 && FM[0].n === 4,
      '③b all · 단 없음 — 받는 곳이 있는 날(①)에도 새 단 · ② 세 사람이 그리로 → 넷이 선다', short({ q1, F, JW, FM })]);
  }
  // ④ 새 단 — 셋 전 기다림 · 모두 닿는 날 선다 · 몸 = n
  {
    const q = K['nogang:all'], d403 = dayOf(q, 403), d404 = dayOf(q, 404);
    L.push(['④a', !!d403 && d403.gs.length === 0 && d403.wt.length === 1 && d403.wt[0].n === 1 && d403.wt[0].bodies === 1 && d403.wt[0].far != null && d403.wt[0].far <= 1 && d403.wt[0].food < 6,
      '④a 셋 전 — 은거지에 닿은 몸이 서서 기다린다(단 안 섬 · 모이는 단 1명 · 몸 은거지 1칸 안 · 유지비를 진다 — 비축 < 6)', short(d403 && { gs: d403.gs, wt: d403.wt })]);
    const fm = [];
    for (const k of ['nogang:all', 'nogang:nohome']) {
      const o = K[k]; const r404 = dayOf(o, 404); const eta = r404 && r404.wt.length ? r404.wt[0].form : null;   // 셋째가 닿는 날(모이는 단 증인)
      const first = o && o.A ? o.A.days.find((x) => x.gs.length) : null;
      const d410 = dayOf(o, 410);
      fm.push({ k, eta, at: first ? first.d : null, n: first ? first.gs[0].n : null, b410: d410 && d410.gs[0] ? d410.gs[0].bodies : null, far: d410 && d410.gs[0] ? +d410.gs[0].far.toFixed(2) : null, w: d410 && d410.gs[0] ? d410.gs[0].walkers : null, all0: d410 && d410.gs[0] ? d410.gs[0].all0 : null });
    }
    L.push(['④b', fm.every((x) => x.eta != null && x.at === x.eta && x.b410 === x.n && x.w === 0 && x.far != null && x.far <= 1 && x.all0 === true) && fm[0].n === 4 && fm[1].n === 3,
      '④b 셋이 모인 뒤 — 셋째가 은거지에 닿는 날 선다(사람마다 닿음 식) · 선 단 몸 = 단 n(all 4 · nohome 3) · 은거지 1칸 안 · 다 마을에서 걸어온 몸', short(fm)]);
  }
  // ⑤ 몸은 걷는다
  {
    const r = Object.entries(K).map(([k, o]) => ({ k, j: o && o.A ? o.A.jumps : null, nb: o && o.A ? o.A.newBodies : null, mx: o && o.A ? +o.A.maxStep.toFixed(2) : null }));
    L.push(['⑤', r.every((x) => x.j === 0 && x.nb === 0), '⑤ 열 판 — 틱마다 몸 걸음 ≤ 걸음 × 틱(순간이동 0) · 새 몸 0', short(r)]);
  }
  // ⑥ 사람 수 보존
  {
    const r = Object.entries(K).map(([k, o]) => {
      const calls = o && o.A ? o.A.calls.filter((c) => c.took) : [];
      return { k, door: calls.every((c) => !c.inRoster && c.s1 === c.s0 && c.n1 === c.n0 - 1), day: o && o.A ? o.A.days.every((d) => d.sum === o.total0) : false, n: calls.length,
        bad: o && o.A ? o.A.days.filter((d) => d.sum !== o.total0).slice(0, 2).map((d) => [d.d, d.sum, o.total0]) : null, bc: calls.filter((c) => !(!c.inRoster && c.s1 === c.s0)).slice(0, 2) };
    });
    L.push(['⑥', r.every((x) => x.door && x.day), '⑥ 사람 수 보존 — 문이 참이면 그 사람은 곧 명부에 없고 그 순간 합 같음 · 날마다 Σ 마을 + Σ 단 + Σ 길 위 단 + 길 위 이주 + 굶어 쓰러짐 = 처음 합(열 판)', short(r.filter((x) => !(x.door && x.day)).length ? r.filter((x) => !(x.door && x.day)) : r.map((x) => [x.k, x.n]))]);
  }
  // ⑦ 덧붙임 팔
  {
    const o = K.rich, f = logOf(o, 'found')[0], dc = logOf(o, 'dissolveCamp')[0], V = o && o.vil ? o.vil : [];
    const at = (row, i) => (row && row.camp && V[i] ? Math.hypot(row.camp[0] - V[i].cx, row.camp[1] - V[i].cy) : null);
    const off = K.richOff, f0 = logOf(off, 'found')[0];
    L.push(['⑦a', !!f && f.rich === '받는' && at(f, 1) < at(f, 0) && !!dc && dc.rich === '받는' && o.t && o.t.st && o.t.st.rich >= 2 && o.t.st.richFall === 0,
      '⑦a 팔 켬 — 새 단 · 해체 단 은거지 = 정보 반경 안 가장 털 것 많은 마을(받는 · 곳간 500) 곁(반경 밖 먼부자 · 곳간 5000 은 모른다)', short({ f, dc, dA: at(f, 1), dU: at(f, 0), st: o.t && o.t.st })]);
    L.push(['⑦b', !!f0 && f0.rich == null && at(f0, 0) < at(f0, 1) && off.t && off.t.rich === false,
      '⑦b 팔 끔 — 새 단 은거지 = 제 마을(불행) 곁(종전 해체 자리 고르기)', short({ f0, dU: at(f0, 0), dA: at(f0, 1) })]);
  }
  // ⑧ 모이는 단 굶주림
  {
    const o = K.starve, d412 = dayOf(o, 412), dEnd = o && o.A ? o.A.days[o.A.days.length - 1] : null;
    const st = o && o.t ? o.t.st : null, ws = logOf(o, 'waitStarve'), wg = logOf(o, 'waitGone');
    L.push(['⑧', !!d412 && d412.wt.length === 1 && d412.wt[0].food === 0 && ws.length === 1 && wg.length === 1 && ws[0].day === wg[0].day && (dayOf(o, ws[0].day) || {}).lying === 1 && !!dEnd && dEnd.wt.length === 0 && dEnd.dead === 1 && !!st && st.waitStarve === 1 && st.waitGone === 1,
      '⑧ 모이는 단이 혼자 — 결성 비축 6 을 날 0.5 씩 다 먹고(412날 0) 굶주림 10날에 쓰러진다(그 자리에 눕는다) · 모이는 단 장부가 빈다', short({ d412: d412 && d412.wt, ws, wg, lying: ws[0] ? (dayOf(o, ws[0].day) || {}).lying : null, dead: dEnd && dEnd.dead, st })]);
  }
  // ⑨ 셋째가 닿는 날 — 먼 길 사람이 셋째로 들어도 늦게 든 가까운 사람이 셋째로 닿으면 그날
  {
    const o = K.far, d402 = dayOf(o, 402), w = d402 && d402.wt[0] ? d402.wt[0] : null;
    const arr = w && w.mem && w.ppd > 0 ? w.mem.map((q) => q.d0 + Math.max(0, Math.ceil((q.len - 0.5) / w.ppd))) : [];
    const srt = arr.slice().sort((x, y) => x - y), third = srt.length >= 3 ? srt[2] : null;
    const first = o && o.A ? o.A.days.find((x) => x.gs.length) : null;
    const qPid = w && w.pids ? w.pids[2] : null, qAt = first && first.gs[0] && qPid != null ? first.gs[0].at[qPid] : null;
    L.push(['⑨', arr.length === 4 && third != null && w.form === third && third < arr[2] && third < Math.max(...arr) && !!first && first.d === third && first.gs[0].n === 4 && qAt != null && qAt > 1 && callsOf(o, '①q').length === 1 && callsOf(o, '①q')[0].took,
      '⑨ 셋째가 닿는 날 선다 — 먼 불행 마을 사람(셋째로 듦 · 먼 길)이 아직 길 위여도 이튿날 든 가까운 사람이 셋째로 닿는 날 · 가장 늦게 닿는 날 · 셋째로 든 사람이 닿는 날보다 앞', short({ arr, form: w && w.form, at: first && first.d, n: first && first.gs[0] && first.gs[0].n, qAt })]);
  }
  return L;
}
console.log('\n=== T1391 — 불행한 사람이 이주가 아니라 도적이 되면(`T1391_UNHAPPY_BANDIT` 끔 · nohome · all · 팔 `T1391_DEN_RICH`) ===');
const MAIN = rows();
for (const [, c, m, d] of MAIN) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(BFILE, 'utf8');
const RED = { noTake: ['②b', '②c', '③a', '③b', '④a', '④b', '⑥', '⑧', '⑨'], nhAll: ['②a', '②b', '②c', '④b'] };
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = SRC.split(Bt.at[0]).length - 1;
  const red = n === 1 ? rows(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
ok(BR.noTake.n === 1 && BR.noTake.same, `미끼 ㉠ — 단 합류에서 econ 인구를 안 빼는 사본 → 빨강 줄이 꼭 {${RED.noTake.join(', ')}}(보존 ⑥ 포함)`, `바꾼 자리 ${BR.noTake.n} · 빨강 {${(BR.noTake.red || []).join(', ')}}`);
ok(BR.nhAll.n === 1 && BR.nhAll.same, `미끼 ㉡ — nohome 이 받는 곳을 안 보는 사본(= all) → 빨강 줄이 꼭 {${RED.nhAll.join(', ')}}`, `바꾼 자리 ${BR.nhAll.n} · 빨강 {${(BR.nhAll.red || []).join(', ')}}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
