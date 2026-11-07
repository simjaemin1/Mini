#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bandit-body.js — 도적 전환: **한 사람 몸 하나**인가 (T1039 · 손잡이 `T1039_BANDIT_BODY`) ==========
//
// ★왜 [지시 T1039 · T1022 회부 1 · 캐논 F7 "같은 몸" · ★재민 11-01 "걸어간 몸이 단"]
//   종전: 해체 그날 단의 몸이 은거지 곁에 새로 서고(min(3, n)) · 그 사람들의 마을 몸은 따로 은거지로 걷는다 ⇒ 몸 상한 ∞ 에선 한 사람이 몸 둘.
//   `walk`(정본 후보): 단은 은거지에 닿아야 선다 · 걸어 나간 그 몸이 단의 몸이다(은거지 곁 새 몸 0 · 가는 동안 습격 길목 0).
//   `spawn`(대조 판): 단 · 단 몸은 그날 선다 · 단 몸이 서는 그 틱에 마을 몸을 거둔다(떠남 표 · 걷는 몸 0).
//   이 하네스는 **운영 함수 그대로**를 짧은 목 세계로 부른다 — 도적 하루 `daily`(해체 판정 · `formGang` · 닿음 · 길목 `pairSync`) · `syncBodies` ·
//   마을 몸 문(`syncVillagePop` · `tickBodyExits` · `_t681Day` · T1039 문 셋) — 사본 0. 해체는 운영 픽스처(`BANDIT_FIXTURE=dissolve`)가 세운다.
//
// ★자명 통과 금지:
//   ⓐ 종전 갈래(손잡이 없음)를 **같은 세는 자**로 먼저 잰다 — 몸 상한 ∞ · 셋 다 단(몸 상한 1)에서 "한 사람 몸 둘"이 실제로 선다(빨강이어야 한다).
//   ⓑ 미끼 둘 — `walk` 에 "해체 그날 단을 세우는" 비틀기(`early`) · `spawn` 에 "마을 몸을 안 거두는" 비틀기(`noleave`): 같은 자가 문다.
//
// 실행: node scripts/test-bandit-body.js
'use strict';
// ★[T1143 2026-11-04] 이 하네스가 재는 것은 해체 문 그 자체다(운영 픽스처가 NPC 마을을 해체로 세운다) — 판 세계를 T1143 앞(`T1143_NO_DISSOLVE=0` = 종전 바이트)으로 묶는다.
//   T1143 이 NPC 마을 해체 없음을 켬 기본으로 바꾼 뒤 해체가 안 서 단언이 빨개졌다(main 에선 초록 · 보고 T1143 §0). 부르는 쪽이 값을 주면 그 값이 먼저다.
if (process.env.T1143_NO_DISSOLVE == null) process.env.T1143_NO_DISSOLVE = '0';
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const SUB = process.env.T1039_SUB || '';
const SZ = 32;
const MOVE = 64;            // 목의 걸음 — 운영은 존 `MOVE_SPEED` 를 deps 로 넘긴다(test-cand-walk 와 같은 목 값)
const DAY_MS = 30000;       // 목의 하루 길이(test-body-exit · test-cand-walk 와 같은 목 값) — 하루 걸음 = 64 × 30 = 1,920px
const TICK = 100;

if (SUB) {   // ── 아이 판 — 갈래 · 몸 상한은 모듈 적재 때 읽는다(env) ─────────────────────────────────────────
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  const econ = R('sim/economy-sim');
  const V = R('server/villages');
  const B = R('server/bandits');
  const [N, NOTHER] = SUB.split(',').map((x) => +x);
  const BAIT = process.env.T1039_BAIT || '';
  const players = new Map(), npcs = new Set(), bcast = [];
  let pidN = 1;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push({ m, tick: TK.n }),
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: {},
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 300000, deathDrop: () => 0,
  };
  const TK = { n: 0 };
  const mk = (k, name) => econ.createVillage({ fertility: 1, water: 1, stone: 1, ore: 1, wood: 1, game: 1, size: 60, arable: 1, initialPop: k, name });
  const e = mk(N, '목촌'), e2 = mk(NOTHER, '이웃');
  const vil = { dbId: 1, name: '목촌', ccx: 200, ccy: 200, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((i) => ({ x: (194 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const other = { dbId: 2, name: '이웃', ccx: 500, ccy: 200, econ: e2, npcPids: [], housesPx: [0, 1].map((i) => ({ x: (496 + i * 4) * SZ + SZ / 2, y: 208 * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  const C1 = { x: 200 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, C2 = { x: 500 * SZ + SZ / 2, y: 200 * SZ + SZ / 2 }, BEND = { x: 350 * SZ + SZ / 2, y: 260 * SZ + SZ / 2 };
  const W = { day: 400, seed: 7 };
  const H = V.__p3Bind({
    ready: true, zoneId: 'test', deps, villages: [vil, other], byDbId: new Map([[1, vil], [2, other]]), byEcon: new Map([[e, vil], [e2, other]]),
    world: W, routeCache: new Map([['1_2', [C1, BEND, C2].map((q) => ({ x: q.x, y: q.y }))]]), _route: null, _distCtx: null, roads: null,
    epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0,
  });
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(other, Infinity);
  H.syncVillagePop(vil, 0); H.syncVillagePop(other, 0);   // 첫 관측(기준만 심는다)
  //   도적 호스트 = 운영 `banditHost()` 그대로 + 목 지형(지형 어댑터 · 격자 크기 — 운영은 존 `_distCtx` 가 준다)
  const host = Object.assign(H.banditHost(), { ta: { isBlocked: () => false, forestMult: () => 1 }, cellsW: 800, cellsH: 600 });
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  if (BAIT === 'noleave') host.t1039Leave = () => 0;   // 미끼: `spawn` 이 마을 몸을 안 거둔다
  const ids0 = new Set(players.keys());
  const T681 = !!H.T681_ON;
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  // ── 세는 자(한 벌 · 갈래와 무관) ──
  const A = { ticks: 0, excessMax: 0, excessTicks: 0, vilExcessMax: 0, totExcessMax: 0, jumps: 0, maxStep: 0, newBodies: 0, pairsEnRoute: 0, enRouteDays: 0,
    disDay: null, gangDay: null, gangBodies0: null, walkersMax: 0, leftAtDis: 0, leftTicks: [], gangTick: null, arrive: null, persons0: null, personsEnd: null, early: null };
  const pos = new Map(), born = new Set();
  const TRACE = [], W0 = W.day;
  for (const [id, p] of players) pos.set(id, [p.x, p.y]);
  const campPx = (g) => ({ x: g.camp.cx * SZ + SZ / 2, y: g.camp.cy * SZ + SZ / 2 });
  function audit() {
    A.ticks++;
    const t = B.t1039(), gangs = B._t1039Probe.gangs(), road = B._t1039Probe.road();
    const bmap = new Map(t.bodies);
    const ex = H.state.bodyExits || new Map();
    const pools = [...gangs.map((g) => ({ g, road: false })), ...road.map((r) => ({ g: r.g, road: true }))];
    let excess = 0, walkers = 0;
    for (const { g } of pools) {
      const cp = campPx(g);
      const bg = (bmap.get(g.id) || []).filter((pid) => players.has(pid)).length;
      let bw = 0;
      for (const [pid, r] of ex) if (r.k === 'bandit' && players.has(pid) && r.pts && Math.hypot(r.pts[r.pts.length - 1].x - cp.x, r.pts[r.pts.length - 1].y - cp.y) < 1) bw++;
      walkers += bw;
      excess += Math.max(0, bg + bw - g.n);
    }
    let vx = 0;
    for (const v of [vil, other]) { const bv = v.npcPids.filter((pid) => { const p = players.get(pid); return p && !p._bxExit; }).length; vx += Math.max(0, bv - v.econ.npcs.length); }
    const persons = e.npcs.length + e2.npcs.length + pools.reduce((a, q) => a + q.g.n, 0);
    let lying = 0; for (const r of ex.values()) if (r.cat === 'died') lying++;
    const totEx = Math.max(0, players.size - lying - persons);
    A.excessMax = Math.max(A.excessMax, excess); if (excess > 0) A.excessTicks++;
    A.vilExcessMax = Math.max(A.vilExcessMax, vx); A.totExcessMax = Math.max(A.totExcessMax, totEx);
    A.walkersMax = Math.max(A.walkersMax, walkers);
    for (const id of players.keys()) if (!ids0.has(id) && !born.has(id)) { born.add(id); A.newBodies++; }
    if (road.length && B._t1039Probe.pairs().size) A.pairsEnRoute++;
    if (A.persons0 == null) A.persons0 = persons;
    A.personsEnd = persons;
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
  function dayClose(d) {
    const g0 = B._t1039Probe.gangs().length, r0 = B._t1039Probe.road().length, b0 = bcast.length;
    B._t1039Probe.daily(d);
    if (BAIT === 'early' && A.disDay == null && B._t1039Probe.road().length) B._t1039Probe.arrive(1e12);   // 미끼: 해체 그날 단을 세운다(닿기 전)
    B._t765Probe.save(d);   // 도적 하루 `_dayRun` 차례 그대로(하루 · 저장 · 몸)
    B._t1039Probe.syncBodies();
    if (A.disDay == null && e._banditized) {
      A.disDay = d;
      A.leftAtDis = bcast.slice(b0).filter((x) => x.m && x.m.type === 'player_left' && ids0.has(x.m.pid)).length;
      const gs = B._t1039Probe.gangs();
      if (gs.length > g0) { A.gangDay = d; A.gangBodies0 = (new Map(B.t1039().bodies).get(gs[gs.length - 1].id) || []).length; }
    } else if (A.gangDay == null && B._t1039Probe.gangs().length > g0) {
      A.gangDay = d;
      const g = B._t1039Probe.gangs()[B._t1039Probe.gangs().length - 1], cp = campPx(g);
      const pids = new Map(B.t1039().bodies).get(g.id) || [];
      A.arrive = { day: d, n: g.n, adopted: pids.length, adoptedOld: pids.filter((p) => ids0.has(p)).length,
        farFromCamp: pids.filter((pid) => { const p = players.get(pid); return p && Math.hypot(p.x - cp.x, p.y - cp.y) > MOVE / 1000 * TICK + 1; }).length };
    }
    if (B._t1039Probe.road().length) A.enRouteDays++;
    H.syncVillagePop(vil, 2); H.syncVillagePop(other, 2);   // 하루 마감 몸 따라잡기(하루 2명 · 운영 그 값)
    if (process.env.T1039_TRACE && d <= W0 + 8) {   // ① 표(사람 ↔ 몸 · 하루 마감 뒤) — 판정 밖 · 보고용
      const t = B.t1039(), bm = new Map(t.bodies), ex = H.state.bodyExits || new Map();
      const gs = [...B._t1039Probe.gangs().map((g) => ({ g, road: 0 })), ...B._t1039Probe.road().map((r) => ({ g: r.g, road: 1 }))];
      TRACE.push({ day: d, econVil: e.npcs.length, roster: vil.npcPids.filter((pid) => { const p = players.get(pid); return p && !p._bxExit; }),
        gangs: gs.map(({ g, road }) => { const cp = campPx(g); return { id: g.id, n: g.n, road, camp: (bm.get(g.id) || []).slice(),
          walking: [...ex].filter(([pid, r]) => r.k === 'bandit' && players.has(pid) && r.pts && Math.hypot(r.pts[r.pts.length - 1].x - cp.x, r.pts[r.pts.length - 1].y - cp.y) < 1).map(([pid, r]) => pid + '@' + Math.round((r.len - (r.L != null ? r.L : r.prog)) / SZ) + '셀') }; }),
        left: bcast.filter((x) => x.m && x.m.type === 'player_left').map((x) => x.m.pid) });
    }
  }
  for (let n = 0; n < 15 * (DAY_MS / TICK); n++) {   // 15날(단 유지비가 사람을 줄이기 전 — 결성 비축 6날치 + 굶음 10날)
    c.t += TICK; TK.n++;
    H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; if (T681) H._t681Day(c.t); dayClose(W.day); moveAudit(TICK); }
    audit();
  }
  //   다시 뜸 — 길 위 단이 남은 판(walk) · 저장 줄의 칸(`road`)
  const lastRow = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null;
  const out = { arm: B.t1039().arm, cap: process.env.VILLAGE_NPC_CAP || 'inf', N, A, stat: V.t1039Stat(), bx: H.bodyExitStats(), road: B.t1039().road.length, gangs: B._t1039Probe.gangs().map((g) => ({ id: g.id, n: g.n, walk: g.walk || 0 })),
    vilBodies: vil.npcPids.length, econ: e.npcs.length, saveHasRoad: !!(lastRow && lastRow.road), saveWalkField: !!(lastRow && (lastRow.gangs || []).some((g) => g.walk)),
    first: db.rows.length ? JSON.parse(db.rows[0].json) : null, trace: process.env.T1039_TRACE ? TRACE : undefined };
  delete out.stat.rows;
  process.stdout.write('\nT1039SUB ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 — 갈래 × 몸 상한 × 마을 크기(아이 판) ─────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
function sub(arm, cap, N, bait) {
  const env = Object.assign({}, process.env, { T1078_BANDIT_ALL: '0', T1079_BANDIT_CAMP: '0', T1104_BANDIT_WALK: '0', T627_TRIP_DAY: '0', T1039_SUB: `${N},25`, BANDIT_FIXTURE: 'dissolve', BANDIT_MINDAY: '1' });
  delete env.T1039_BANDIT_BODY; delete env.VILLAGE_NPC_CAP; delete env.T1039_BAIT;
  env.T1039_BANDIT_BODY = arm || '0';   // ★[PM land1038] walk 켬 기본 — 종전 갈래는 '0'
  if (cap) env.VILLAGE_NPC_CAP = cap;
  if (bait) env.T1039_BAIT = bait;
  const o = execFileSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = o.split('\n').find((l) => l.startsWith('T1039SUB '));
  return m ? JSON.parse(m.slice(9)) : null;
}
const s = (o) => (o ? `몸 둘 최대 ${o.A.excessMax}(${o.A.excessTicks}틱) · 마을 몸>사람 ${o.A.vilExcessMax} · 몸>사람(전체) ${o.A.totExcessMax} · 새 몸 ${o.A.newBodies} · 걷는 몸 최대 ${o.A.walkersMax} · 순간이동 ${o.A.jumps}` : '판 없음');

console.log('\n=== T1039 — 도적 전환: 한 사람 몸 하나(손잡이 `T1039_BANDIT_BODY`) ===');
const RUN = {};
for (const arm of ['', 'walk', 'spawn']) for (const cap of ['', '1']) for (const N of [13, 3]) RUN[`${arm || 'old'}|${cap || 'inf'}|${N}`] = sub(arm, cap, N);
const get = (a, c, n) => RUN[`${a}|${c}|${n}`];
ok(Object.values(RUN).every((o) => o && o.A.disDay != null), '[전제] 열두 판 다 해체가 섰다(운영 픽스처 · 첫 도적 하루)', Object.values(RUN).map((o) => (o ? o.A.disDay : '—')).join(' '));
ok(Object.values(RUN).every((o) => o && o.A.persons0 === o.A.personsEnd), '[전제] 사람 합 = 두 마을 econ + 단(서 있는 단 · 길 위 단) — 15날 내내 같다(소멸 0)', Object.values(RUN).map((o) => (o ? o.A.persons0 + '→' + o.A.personsEnd : '—')).join(' '));

// ── ⓐ 종전 — 같은 자가 "몸 둘"을 문다(자명 통과 금지) ──
{
  const a = get('old', 'inf', 13), b = get('old', '1', 3), c = get('old', '1', 13);
  ok(a.arm === 'old' && a.A.excessMax > 0 && a.A.walkersMax > 0 && a.A.gangBodies0 === 3 && a.A.disDay === a.A.gangDay, 'ⓐ 종전 · 몸 상한 ∞ · 13명 — 단 몸 3이 해체 그날 은거지 곁에 **새로** 서고 마을 몸이 따로 걷는다 ⇒ 몸 둘(이 자가 잡는다)', s(a));
  ok(b.A.excessMax > 0 && b.A.walkersMax === 1, 'ⓐ 종전 · 몸 상한 1 · 셋 다 단 — 마을 몸 1이 걷는 사이 은거지 몸 3 ⇒ 몸 둘(T1022 42 농촌9 그 꼴)', s(b));
  ok(c.A.excessMax === 0 && c.A.walkersMax === 0, 'ⓐ 종전 · 몸 상한 1 · 13명 — 마을 몸 1은 남은 사람 몫(걷는 몸 0) ⇒ 몸 둘 0(판 자 대부분의 꼴)', s(c));
  const z = sub('xyz', '', 13);
  const strip = (o) => JSON.stringify(Object.assign({}, o, { arm: null }));
  ok(z && z.arm === 'old' && strip(z) === strip(a), 'ⓐ 손잡이 그 밖 값(`xyz`) = 손잡이 없음 — 판 결과 JSON 바이트 같음 · 저장 줄 칸 같음', `${JSON.stringify(z.first).length}B`);
  ok(a.stat.depart === 0 && a.stat.left === 0 && a.stat.joined === 0 && !a.saveHasRoad && !a.saveWalkField, 'ⓐ 종전 — T1039 문 셋은 한 번도 안 불렸다 · 저장 줄에 `road` · `walk` 칸 0');
}

// ── ① walk — 걸어 나간 그 몸이 단 ──
for (const cap of ['inf', '1']) for (const N of [13, 3]) {
  const o = get('walk', cap, N), tag = `walk · 몸 상한 ${cap === 'inf' ? '∞' : 1} · ${N}명`;
  const walked = o.stat.bodied, n = N === 13 ? 5 : 3;
  const wantWalk = cap === 'inf' ? n : (N === 3 ? 1 : 0);
  ok(o.arm === 'walk' && o.A.excessMax === 0 && o.A.vilExcessMax === 0 && o.A.totExcessMax === 0, `① ${tag} — 한 사람 몸 하나(단 몸 + 은거지로 걷는 몸 ≤ 단 사람 · 마을 몸 ≤ 마을 사람 · 몸 ≤ 사람)`, s(o));
  ok(o.A.newBodies === 0, `① ${tag} — ★은거지 곁 새 몸 0(이 판에 새로 선 몸 0)`, `${o.A.newBodies}`);
  ok(walked === wantWalk && o.stat.depart === n && o.stat.bodyless === n - wantWalk, `① ${tag} — 떠난 몸 = min(단 사람, 마을 몸 − 남은 사람이 쥘 몸)`, `몸 ${walked}/${n}`);
  ok(o.A.gangDay != null && o.A.gangDay > o.A.disDay && o.A.enRouteDays === o.A.gangDay - o.A.disDay, `① ${tag} — 단은 닿는 날 선다(해체 날 D${o.A.disDay} → 결성 D${o.A.gangDay} · 가는 중 ${o.A.enRouteDays}날)`);
  ok(o.A.pairsEnRoute === 0, `① ${tag} — 가는 동안 습격 길목 0(단이 \`GANGS\` 밖)`, `${o.A.pairsEnRoute}틱`);
  const ad = o.A.arrive || {};
  ok(ad.adopted === Math.min(3, walked) && ad.adoptedOld === ad.adopted && ad.farFromCamp === 0, `① ${tag} — 닿은 날 걸어온 몸이 단의 몸(min(3, 걸어온 몸)) · 다 은거지에 섰다(한 틱 걸음 안)`, JSON.stringify(ad));
  ok(o.stat.capped === Math.max(0, walked - 3) && o.bx.arrive === Math.max(0, walked - 3), `① ${tag} — 단 몸 상한을 넘는 몸만 종전 닿음 회수`, `${o.stat.capped}`);
  ok(o.A.jumps === 0 && o.A.maxStep <= MOVE / 1000 * TICK + 1e-6, `① ${tag} — 순간이동 0(한 틱 걸음 ≤ 걸음 한도)`, `최대 ${o.A.maxStep.toFixed(2)}px`);
  ok(o.saveWalkField && !o.saveHasRoad && o.gangs.every((g) => g.walk === 1), `① ${tag} — 저장 줄: 선 단에 \`walk\` 칸 · 판 끝 길 위 단 0`);
  ok(o.first && Array.isArray(o.first.road) && o.first.road.length === 1 && o.first.road[0].g.walk === 1 && o.first.road[0].g.n === n && o.first.road[0].d0 === o.A.disDay && o.first.road[0].ppd === MOVE / 1000 * DAY_MS && !(o.first.gangs || []).length,
    `① ${tag} — 해체 날 저장 줄: 길 위 단 한 줄(\`road\` — 단 · 떠난 날 · 길 · 하루 걸음 · 몸 pid 비영속) · 선 단 0`);
}
// ── ② spawn — 단 몸이 서는 그 틱에 마을 몸을 거둔다 ──
for (const cap of ['inf', '1']) for (const N of [13, 3]) {
  const o = get('spawn', cap, N), tag = `spawn · 몸 상한 ${cap === 'inf' ? '∞' : 1} · ${N}명`;
  const n = N === 13 ? 5 : 3, wantLeft = cap === 'inf' ? n : (N === 3 ? 1 : 0);
  ok(o.arm === 'spawn' && o.A.excessMax === 0 && o.A.vilExcessMax === 0 && o.A.totExcessMax === 0, `② ${tag} — 한 사람 몸 하나`, s(o));
  ok(o.A.gangDay === o.A.disDay && o.A.gangBodies0 === 3 && o.A.newBodies === 3, `② ${tag} — 단 · 단 몸 3은 해체 그날 선다(종전 그대로)`);
  ok(o.stat.left === wantLeft && o.A.leftAtDis === wantLeft && o.A.walkersMax === 0, `② ${tag} — 그 틱에 마을 몸 ${wantLeft}을 거둔다(떠남 표 · 걷는 몸 0)`, `거둠 ${o.stat.left} · 그날 player_left ${o.A.leftAtDis}`);
  ok(o.A.jumps === 0, `② ${tag} — 순간이동 0(거둔 몸은 다시 안 선다 · 은거지 몸은 새 pid)`);
}
// ── ⓑ 미끼 — 같은 자가 문다 ──
{
  const e1 = sub('walk', '', 13, 'early');
  ok(e1 && (e1.A.gangDay === e1.A.disDay || (e1.A.arrive && e1.A.arrive.farFromCamp > 0) || e1.A.pairsEnRoute > 0) && !(e1.A.gangDay > e1.A.disDay && e1.A.arrive && e1.A.arrive.farFromCamp === 0),
    'ⓑ 미끼 `walk`+`early`(해체 그날 단을 세움) — ①의 "닿는 날 선다 · 은거지에 섰다"가 빨개진다', e1 ? `결성 D${e1.A.gangDay} · 해체 D${e1.A.disDay} · ${JSON.stringify(e1.A.arrive)}` : '');
  const e2 = sub('spawn', '', 13, 'noleave');
  ok(e2 && (e2.A.excessMax > 0 || e2.A.vilExcessMax > 0 || e2.A.totExcessMax > 0), 'ⓑ 미끼 `spawn`+`noleave`(마을 몸을 안 거둠) — ②의 "한 사람 몸 하나"가 빨개진다', s(e2));
}
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'} (${pass} 통과 · ${fail} 실패)`);
process.exit(fail ? 1 : 0);
