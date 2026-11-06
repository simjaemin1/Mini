#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// === scripts/test-bandit-all.js — 도적 단원 전원이 몸인가 (T1078 · 손잡이 `T1078_BANDIT_ALL`) ==========
//
// ★왜 [지시 T1078 · ★재민 11-02 "도적과 은신처가 모두 맵 내에 실제로 보이는 거 맞지..? 추상 아니지?"]
//   종전: 단마다 min(3, n) 몸만 은거지 곁에 섰다(나머지는 숫자) · 몸이 맞아 죽으면 존이 30초 뒤 되살렸다.
//   켬: ① 단원 수 = 몸 수(상한 걷기) — 몸이 걸어 들어오고(해체 단 · 절망 이탈) 걸어 나간다(해산) · 새 몸 0 · 순간이동 0
//       ② 몸이 죽으면 단 n −1 · 그 자리에 쓰러져 짐이 떨어진다(사람 · 짐승 · 토벌 · 굶음) — 단 기록과 몸이 한 정본
//       ③ 은거지 곁 일과(밤 잠 · 아침 식사 = 단 비축이 끼니를 댄 날 · 낮 배회)
//   이 하네스는 **운영 함수 그대로**를 짧은 목 세계로 부른다 — 도적 하루 `daily` · `syncBodies` · 저장 · 마을 몸 문(`syncVillagePop` · `tickBodyExits` ·
//   `_t681Day` · T1039 · T1078 문) · 존 죽음 문이 부르는 `bandits.t1078Died` — 사본 0. 해체는 운영 픽스처(`BANDIT_FIXTURE=dissolve`)가 세운다.
//   존 쪽 두 줄(`damagePlayer` NPC 갈래 · `decideNpcBehavior` 일과 문)은 정적으로 잰다(존을 부팅하지 않는다).
//
// ★자명 통과 금지:
//   ⓐ 끔(손잡이 없음)을 **같은 세는 자**로 잰다 — 단 5명에 몸 3(상한) · `t1078Died` 가 false(존이 되살린다) ⇒ ① ② 가 빨갛다.
//   ⓑ 미끼 둘 — `nodie`(쓰러짐 문을 뗀다 → 몸이 지워진다 · 짐 0) · `noout`(걸어 나감 문을 뗀다 → 흩어진 몸이 지워진다): 같은 자가 문다.
//
// 실행: node scripts/test-bandit-all.js
'use strict';
// ★[T1143 2026-11-04] 이 하네스가 재는 것은 해체 문 그 자체다(운영 픽스처가 NPC 마을을 해체로 세운다) — 판 세계를 T1143 앞(`T1143_NO_DISSOLVE=0` = 종전 바이트)으로 묶는다.
//   T1143 이 NPC 마을 해체 없음을 켬 기본으로 바꾼 뒤 해체가 안 서 단언이 빨개졌다(main 에선 초록 · 보고 T1143 §0). 부르는 쪽이 값을 주면 그 값이 먼저다.
if (process.env.T1143_NO_DISSOLVE == null) process.env.T1143_NO_DISSOLVE = '0';
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));

const SUB = process.env.T1078_SUB || '';
const SZ = 32;
const MOVE = 64;            // 목의 걸음(test-bandit-body · test-cand-walk 와 같은 목 값)
const DAY_MS = 30000;       // 목의 하루 길이(같은 목 값)
const TICK = 100;

if (SUB) {   // ── 아이 판 — 손잡이는 모듈 적재 때 읽는다(env) ─────────────────────────────────────────
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  const econ = R('sim/economy-sim');
  const V = R('server/villages');
  const B = R('server/bandits');
  const BAIT = process.env.T1078_BAIT || '';
  const players = new Map(), npcs = new Set(), bcast = [], drops = [];
  let pidN = 1, phase = 0.3;
  const deps = {
    players, npcs, broadcast: (m) => bcast.push(m),
    spawnNpc: (q) => { const id = 'n' + (pidN++); const p = { pid: id, name: q.name || '주민', x: q.x, y: q.y, vx: 0, vy: 0, hp: 100, maxHp: 100, isNpc: true, simJob: 'farmer', inventory: { meat: 4 },
      tribeId: q.villageId || null, tribeName: q.villageName || null, npcHomeX: q.npcHomeX, npcHomeY: q.npcHomeY, npcWorkX: q.npcWorkX, npcWorkY: q.npcWorkY, npcJob: q.npcJob || null }; players.set(id, p); npcs.add(id); return p; },
    isTerrainBlockedLocal: () => false, moveSpeed: MOVE, corpseMs: 3 * DAY_MS,
    deathDrop: (p) => { const k = Math.floor((p.inventory.meat || 0) / 2); p.inventory.meat -= k; drops.push({ pid: p.pid, x: p.x, y: p.y, meat: k }); return k; },   // 목 낙하(운영 = 존 `_deathDrop` — 짐 kg 절반 · 그 자리)
    worldPhase: () => phase, dayPhaseRatio: 0.7,
    setHp: (p, v) => { p.hp = Math.max(0, Math.min(p.maxHp || 100, v)); return p.hp; },   // 존 `setHp` 문의 목(값만)
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
  });
  H.syncVillagePop(vil, Infinity); H.syncVillagePop(other, Infinity);
  H.syncVillagePop(vil, 0); H.syncVillagePop(other, 0);
  const host = Object.assign(H.banditHost(), { ta: { isBlocked: () => false, forestMult: () => 1 }, cellsW: 800, cellsH: 600 });
  if (BAIT === 'nodie') host.t1078Die = null;   // 미끼: 쓰러짐 문을 뗀다(몸이 지워진다)
  if (BAIT === 'noout') host.t1078Out = null;   // 미끼: 걸어 나감 문을 뗀다(흩어진 몸이 지워진다)
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  const ids0 = new Set(players.keys());
  const T681 = !!H.T681_ON;
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  const A = { ticks: 0, overMax: 0, overTicks: 0, shortAfter: 0, newBodies: 0, newIds: [], jumps: 0, maxStep: 0, vanished: [], log: [], persons: [], ev: {} };
  const pos = new Map(), born = new Set(), known = new Set(players.keys());
  for (const [id, p] of players) pos.set(id, [p.x, p.y]);
  const gangOf = () => B._t1039Probe.gangs()[0] || null;
  const bodiesOf = (g) => ((new Map(B.t1039().bodies)).get(g.id) || []).filter((pid) => players.has(pid));
  const walkersOf = (g) => H._t1078Walkers().filter((w) => w.gid === g.id).map((w) => w.pid);
  function audit() {
    A.ticks++;
    const g = gangOf();
    if (g) {
      const b = bodiesOf(g).length, w = walkersOf(g).length, over = Math.max(0, b + w - g.n);
      A.overMax = Math.max(A.overMax, over); if (over > 0) A.overTicks++;
    }
    for (const id of players.keys()) if (!known.has(id)) { known.add(id); born.add(id); A.newBodies++; A.newIds.push(id); }
    for (const id of known) if (!players.has(id) && !A.vanished.some((v) => v.pid === id)) {   // 지워진 몸 — 누워 거둠(rot) · 걸어 닿음(arrive) 말고는 소멸
      const how = A._goneHow && A._goneHow.get(id);
      A.vanished.push({ pid: id, how: how || 'vanish', day: W.day });
    }
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
  //   지운 자리 — 운영 `_bxGone`(누운 몸 거둠 · 걸어 닿음 거둠)만 '거둠' · 그 밖 `players.delete` 는 소멸
  A._goneHow = new Map();
  { const d0 = players.delete.bind(players); players.delete = (k) => { const ex = H.state.bodyExits && H.state.bodyExits.get(k); A._goneHow.set(k, ex ? (ex.cat === 'died' ? 'rot' : 'arrive') : 'vanish'); return d0(k); }; }
  const snap = (tag) => { const g = gangOf(); A.ev[tag] = g ? { day: W.day, n: g.n, bodies: bodiesOf(g).length, walkers: walkersOf(g).length, food: +g.food.toFixed(2) } : { day: W.day, gone: 1 }; };
  const plan = {};   // 날 → 할 일(도적 하루 앞)
  function dayClose(d) {
    if (plan[d]) plan[d]();
    B._t1039Probe.daily(d);
    B._t765Probe.save(d);
    B._t1039Probe.syncBodies();
    H.syncVillagePop(vil, 2); H.syncVillagePop(other, 2);
    if (plan['after' + d]) plan['after' + d]();
    const g = gangOf(); A.persons.push([d, g ? g.n : null, g ? bodiesOf(g).length : null, g ? walkersOf(g).length : null]);
  }
  // ── 시나리오 ──
  if (SUB === 'life') {   // 해체 단(13명 → 5) 걸어 섬 → 절망 이탈 한 몸 걸어 듦 → 짐승에 쓰러짐 → 사람에 쓰러짐(n < 3) → 해산 · 걸어 나감
    plan[406] = () => { e2._bdtCri = 40; e2.lastStats = { happiness: 0.1 }; for (const r of ['food', 'fish', 'meat', 'cooked_food']) if (e2.storage) e2.storage[r] = 0; snap('preDesert'); };
    plan.after406 = () => { snap('desert'); e2._bdtCri = 0; e2.lastStats = { happiness: 0.9 }; const ex = H.state.bodyExits; A.ev.desertRec = ex ? [...ex.values()].filter((r) => r.t1078 != null).map((r) => ({ pid: r.pid, k: r.k, gid: r.t1078, len: Math.round(r.len) })) : []; };
    plan[414] = () => { snap('preMob'); const g = gangOf(), pids = bodiesOf(g); const p = players.get(pids[0]); A.ev.mobBody = { pid: p.pid, x: p.x, y: p.y, meat: p.inventory.meat };
      p.hp = 0; A.ev.mobRet = B.t1078Died(p, 'mob:wolf'); snap('mob'); A.ev.mobAfter = { lying: !!(H.state.bodyExits.get(p.pid) && H.state.bodyExits.get(p.pid).cat === 'died'), isDown: !!p.isDown, x: p.x, y: p.y, inNpcs: npcs.has(p.pid) }; };
    plan[416] = () => { const g = gangOf(); let k = 0; while (g && g.n > 2 && k < 10) { const pids = bodiesOf(g); const p = players.get(pids[pids.length - 1]); if (!p) break; p.hp = 0; B.t1078Died(p, 'player:손님'); k++; } A.ev.playerKills = k; snap('prePlayerDisband'); A.ev.outPids = bodiesOf(g); };
    plan.after416 = () => { const ex = H.state.bodyExits; A.ev.out = (A.ev.outPids || []).map((pid) => { const r = ex.get(pid); const p = players.get(pid); return { pid, alive: !!p, k: r ? r.k : null, cat: r ? r.cat : null, to: r ? r.vid : null }; }); snap('disband'); };
    //   일과(③) — 선 단의 몸 하나로 운영 문(`_t1078Life`)을 낮 · 아침 · 밤에 묻는다(존 `decideNpcBehavior` 가 부르는 그 함수)
    plan[405] = () => { const g = gangOf(); const p = players.get(bodiesOf(g)[0]); const q = {};
      const ask = (ph, fed) => { phase = ph; p._t1078Fed = fed; p._lifeAct = undefined; p.x = p.npcHomeX + 200; p.y = p.npcHomeY; const r = H._t1078Life(p, Date.now()); const at = { r, act: p._lifeAct, tx: p.targetX, ty: p.targetY, home: [p.npcHomeX, p.npcHomeY] };
        p.x = p.npcHomeX; p.y = p.npcHomeY; p._lifeAct = undefined; H._t1078Life(p, Date.now()); at.actHome = p._lifeAct; return at; };
      q.night = ask(0.9, 1); q.dawnFed = ask(0.05, 1); q.dawnHungry = ask(0.05, 0); q.noon = ask(0.35, 1);
      phase = 0.3; p.x = p.npcHomeX; p.y = p.npcHomeY; A.ev.life = q; A.ev.lifeFed = { food: +g.food.toFixed(2), fed: p._t1078Fed }; };
    plan.after405 = () => { const g = gangOf(); A.ev.fed405 = bodiesOf(g).map((pid) => players.get(pid)._t1078Fed); };
  } else if (SUB === 'sup') {   // 해체 단 걸어 섬 → 토벌(원정 8명 · 운영 실전투 식) → 사살 수만큼 은거지 몸이 쓰러진다
    plan[406] = () => { const g = gangOf(); snap('preSup'); A.ev.preSupBodies = bodiesOf(g).map((pid) => { const p = players.get(pid); return { pid, x: p.x, y: p.y }; }); g._sup = { vilDbId: 2, eta: 406, force: 8, wep: 1 }; };
    plan.after406 = () => { snap('sup'); const ex = H.state.bodyExits; A.ev.supLying = (A.ev.preSupBodies || []).filter((b) => { const r = ex.get(b.pid); const p = players.get(b.pid); return r && r.cat === 'died' && p && p.x === b.x && p.y === b.y; }).length; A.ev.supLog = B.stats().log.filter((l) => l.indexOf('사살') >= 0).slice(-1)[0] || ''; };
  } else if (SUB === 'den') {   // 소굴 재결성(황야에서 난 사람 4~6 → 그 수만큼 소굴에 몸) → 굶어 죽음(비축 0 · 10날) 한 몸이 쓰러진다
    B._t1078Probe.dens().push({ id: 1, cx: 320, cy: 420, sc: 0, dv: 0, dr: 0, gen: 0, next: 401, cleared: 0 });
    plan.after401 = () => snap('den');
    plan[403] = () => { const g = gangOf(); g.food = 0; g.zero = 9; snap('preStarve'); A.ev.preStarveBodies = bodiesOf(g).slice(); };
    plan[405] = () => { const g = gangOf(); A.ev.preRaid = { n: g.n, bodies: bodiesOf(g).length }; A.ev.raidPids = bodiesOf(g).slice(); g.n = Math.max(0, g.n - 2); };   // econ 약탈 실전투가 도적 둘을 죽인다(운영 `_raidScrum` 정산 줄 `gangO.n = Math.max(0, gangO.n - R.banditsKilled)` 그 꼴 · 도적 하루 밖)
    plan.after405 = () => { const ex = H.state.bodyExits; A.ev.raid = (A.ev.raidPids || []).map((pid) => { const r = ex.get(pid); return r ? r.cat + ':' + r.k : (players.has(pid) ? 'stand' : 'gone'); }); A.ev.raidGone = !gangOf(); };
    plan.after403 = () => { snap('starve'); const ex = H.state.bodyExits; A.ev.starveLying = (A.ev.preStarveBodies || []).filter((pid) => { const r = ex.get(pid); return r && r.cat === 'died'; }).length; A.ev.starveStat = (B.t1078().stat || { dead: {} }).dead.starve || 0; A.ev.fedAfter = bodiesOf(gangOf()).map((pid) => players.get(pid)._t1078Fed); };
  }
  const DAYS = SUB === 'life' ? 24 : 10;
  for (let n = 0; n < DAYS * (DAY_MS / TICK); n++) {
    c.t += TICK;
    H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; if (T681) H._t681Day(c.t); dayClose(W.day); moveAudit(TICK); }
    audit();
  }
  delete A._goneHow;
  const out = { on: B.t1078On(), sub: SUB, A, stat: B.t1078().stat, bx: H.bodyExitStats(), drops, t1039: V.t1039Stat(), gangs: B._t1039Probe.gangs().map((g) => ({ id: g.id, n: g.n })),
    lastSave: db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null, log: B.stats().log.filter((l) => /T1078|토벌|해산|결성|이탈|재결성/.test(l)) };
  delete out.t1039.rows;
  process.stdout.write('\nT1078SUB ' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
function sub(name, on, bait, fix) {
  const env = Object.assign({}, process.env, { T627_TRIP_DAY: '0', T1079_BANDIT_CAMP: '0', T1104_BANDIT_WALK: '0', T1078_SUB: name, BANDIT_MINDAY: '1' });
  env.T1078_BANDIT_ALL = '0'; delete env.T1039_BANDIT_BODY; delete env.VILLAGE_NPC_CAP; delete env.T1078_BAIT; delete env.BANDIT_FIXTURE;
  if (on === 'default') delete env.T1078_BANDIT_ALL;
  else if (on) env.T1078_BANDIT_ALL = typeof on === 'string' ? on : '1';
  if (bait) env.T1078_BAIT = bait;
  if (fix !== false) env.BANDIT_FIXTURE = 'dissolve';
  const o = execFileSync(process.execPath, [__filename], { env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const m = o.split('\n').find((l) => l.startsWith('T1078SUB '));
  return m ? JSON.parse(m.slice(9)) : null;
}
const vanishN = (o) => o.A.vanished.filter((v) => v.how === 'vanish').length;
console.log('\n=== T1078 — 도적 단원 전원이 몸(손잡이 `T1078_BANDIT_ALL`) ===');

// ── 정적 — 존 두 줄 · 손잡이 · 새 수 0 ──
{
  const code = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const Z = code('server/zone.js'), BD = code('server/bandits.js');
  const i = Z.indexOf('function damagePlayer('), dp = Z.slice(i, Z.indexOf('\n}\n', i));
  const iN = dp.indexOf('if (p.isNpc) {'), iD = dp.indexOf('Bandits.t1078Died(p, source)'), iR = dp.indexOf('setTimeout(');
  ok(iN >= 0 && iD > iN && iR > iD && /if \(p\._bdtGid != null && Bandits\.t1078Died && Bandits\.t1078Died\(p, source\)\) return;/.test(dp),
    '정적 · 존 `damagePlayer` NPC 갈래 — 되살림(`setTimeout`) 앞에서 도적 단원 몸이면 `t1078Died` 가 쥔다(`_bdtGid` 가 선 몸만)');
  const j = Z.indexOf('SimVillages.npcLifeTick(npc, now)) return;'), k = Z.indexOf('SimVillages.t1078Life(npc, now)) return;');
  ok(j >= 0 && k > j && k - j < 400 && /if \(npc\._bdtGid != null && SimVillages\.t1078Life && SimVillages\.t1078Life\(npc, now\)\) return;/.test(Z), '정적 · 존 `decideNpcBehavior` — 마을 일과 문 바로 뒤 도적 일과 문(늑대 도주 뒤 · 배회 앞)');
  ok(BD.includes("const T1078_ALL = !(typeof process !== 'undefined' && process.env && process.env.T1078_BANDIT_ALL === '0');") && /const T1039_WALK = T1039_BODY === 'walk' \|\| T1078_ALL, T1039_SPAWN = T1039_BODY === 'spawn' && !T1078_ALL;/.test(BD),
    "정적 · 손잡이 하나(`'1'` 만 켬) · 켬 = T1039 walk 갈래를 같이 켠다(spawn 은 꺼진다)");
  const a = BD.indexOf('function _t1078Cap('), b = BD.indexOf('function t1078Died('), blk = BD.slice(a, BD.indexOf('\n}\n', b));
  ok(a > 0 && !/[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/.test(blk.replace(/'[^']*'|`[^`]*`/g, '')), '정적 · T1078 몸 문 덩이에 새 수 0(0 · 1 말고 수 글자 없음)');
}

const L = sub('life', true), S = sub('sup', true), D = sub('den', true, '', false);
const Loff = sub('life', false), Soff = sub('sup', false);
ok(L && S && D && Loff && Soff, '[전제] 다섯 판이 다 돌았다');
// ── ① 단원 = 몸 · 걸어 들고 남 ──
{
  const e = L.A.ev;
  ok(L.on && e.preDesert && e.preDesert.n === 5 && e.preDesert.bodies === 5 && e.preDesert.walkers === 0, '① 켬 · 해체 단 5명(상한 3 넘음) — 은거지 몸 5 = 단 5(걸어온 몸 그대로)', JSON.stringify(e.preDesert));
  ok(Loff.on === false && Loff.A.ev.preDesert && Loff.A.ev.preDesert.n === 5 && Loff.A.ev.preDesert.bodies === 3, 'ⓐ 끔 — 같은 자로 단 5명에 몸 3(상한 3 · 나머지는 숫자) ⇒ 켬의 ①이 문 자리가 실제로 다르다', JSON.stringify(Loff.A.ev.preDesert));
  ok(e.desert && e.desert.n === 6 && e.desert.bodies === 5 && e.desert.walkers === 1 && e.desertRec.length === 1 && e.desertRec[0].k === 'desert', '① 절망 이탈 — 단 6 · 은거지 몸 5 + 그 단으로 걷는 몸 1(이웃 마을 명부 몸 · 까닭 `desert` · 단 번호 표식)', JSON.stringify([e.desert, e.desertRec]));
  const joinRow = L.A.persons.find((r) => r[0] > 406 && r[1] === 6 && r[2] === 6 && r[3] === 0);
  ok(!!joinRow && L.stat && L.stat.join === 1 && e.desertRec[0] && L.A.persons.some((r) => r[0] > 406 && r[2] === 5 && r[3] === 1), '① 그 몸이 은거지에 걸어 닿는 날 단의 몸(몸 6 = 단 6 · 받은 몸 1) — 닿기 전 날들은 걷는 몸으로 셌다', joinRow ? `D${joinRow[0]}` : JSON.stringify(L.A.persons.slice(4, 12)));
  ok(L.A.overMax === 0, '① 몸 + 그 단으로 걷는 몸 ≤ 단 사람 — 틱마다(한 사람 몸 하나)', `넘침 최대 ${L.A.overMax}`);
  ok(L.A.newBodies === 0 && S.A.newBodies === 0, '① 새 몸 0 — 해체 단 · 이탈 · 해산 판에 새로 선 몸이 없다(걸어온 몸이 단의 몸)', `${L.A.newBodies} · ${S.A.newBodies}`);
  ok(L.A.jumps === 0 && S.A.jumps === 0 && L.A.maxStep <= MOVE / 1000 * TICK + 1e-6, '① 순간이동 0(한 틱 걸음 ≤ 걸음 한도)', `최대 ${L.A.maxStep.toFixed(2)}px`);
  ok(e.disband && e.disband.gone === 1 && Array.isArray(e.out) && e.out.length === 2 && e.out.every((q) => q.alive && q.k === 'move' && q.cat === 'walk' && q.to === 2), '① 해산(단 2명 < 3) — 남은 몸 2가 가장 가까운 산 마을(이웃)로 걸어 나간다(T590 `move` 걸음 · 지움 0)', JSON.stringify(e.out));
  ok(vanishN(L) === 0 && L.A.vanished.filter((v) => v.how === 'arrive').length >= 2, '① 소멸 0 — 지워진 몸은 다 누운 몸 거둠(`rot`) · 걸어 닿음 거둠(`arrive`)뿐(해산 몸 2는 닿아 거둠 — 주민 되기는 T1079 ④)', JSON.stringify(L.A.vanished));
  ok(L.lastSave && !(L.lastSave.gangs || []).length && L.lastSave.stats && L.lastSave.stats.t1078 && Loff.lastSave && !Loff.lastSave.stats.t1078, '① 저장 줄 — 켬에서만 `stats.t1078` 칸 · 끔 = 칸 0(종전 바이트)');
  const z = sub('life', '0'), strip = (o) => JSON.stringify(Object.assign({}, o, { on: null }));
  ok(z && z.on === false && strip(z) === strip(Loff), "ⓐ 명시적 `'0'` = 종전 끔 — 판 결과 JSON 바이트 같음(몸 · 저장 줄 · 로그)", `${strip(z).length}B`);
}
// ── ② 몸 죽음 = 단 n −1 · 그 자리 낙하 ──
{
  const e = L.A.ev;
  ok(e.mobRet === true && e.preMob && e.mob && e.mob.n === e.preMob.n - 1 && e.mob.bodies === e.preMob.bodies - 1, '② 짐승(`mob:wolf`) — `t1078Died` 가 쥔다 · 단 n −1 · 은거지 몸 −1', JSON.stringify([e.preMob, e.mob]));
  const d = L.drops.find((q) => q.pid === e.mobBody.pid);
  ok(e.mobAfter.lying && e.mobAfter.isDown && !e.mobAfter.inNpcs && e.mobAfter.x === e.mobBody.x && e.mobAfter.y === e.mobBody.y && d && d.x === e.mobBody.x && d.y === e.mobBody.y && d.meat === Math.floor(e.mobBody.meat / 2),
    '② 그 자리에 쓰러진다(누운 몸 · AI 끔 · 자리 그대로) · 짐 절반이 그 자리에 떨어진다(T590 ⓐ 낙하 문 `deathDrop`)', JSON.stringify(d));
  ok(Loff.A.ev.mobRet === false, 'ⓐ 끔 — `t1078Died` 가 false(존 종전 줄 = 30초 뒤 되살림) ⇒ ②가 문 자리가 실제로 다르다');
  ok(e.playerKills === 3 && L.stat.dead.mob === 1 && L.stat.dead.player === 3 && L.A.vanished.filter((v) => v.how === 'rot').length === 4, '② 사람(`player`) 셋 · 짐승 하나 — 까닭마다 셈 · 누운 몸 넷 다 `corpseMs` 뒤 거둠(소멸 0)', JSON.stringify(L.stat.dead));
  const se = S.A.ev, kills = se.preSup && se.sup ? se.preSup.n - (se.sup.gone ? 0 : se.sup.n) : -1;
  ok(kills > 0 && se.supLying === kills && (se.sup.gone || se.sup.bodies === se.sup.n) && S.stat.dead.sup === kills, '② 토벌 — 사살 수만큼 은거지 몸이 그 자리에 쓰러진다(누운 몸 = 사살 · 남은 몸 = 남은 단)', `사살 ${kills} · 누운 몸 ${se.supLying} · ${se.supLog}`);
  ok(Soff.A.ev.supLying === 0, 'ⓐ 끔 — 토벌 사살에 누운 몸 0(몸은 min(3, n) 으로 지워진다) ⇒ 같은 자가 다르게 잰다', `${Soff.A.ev.supLying}`);
  const de = D.A.ev;
  ok(de.preStarve && de.starve && de.starve.n === de.preStarve.n - 1 && de.starve.bodies === de.preStarve.bodies - 1 && de.starveLying === 1 && de.starveStat === 1, '② 굶어 죽음(비축 0 · 10날 — 머리글 “아사”) — 은거지 몸 하나가 그 자리에 쓰러진다', JSON.stringify([de.preStarve, de.starve]));
}
// ── ② 도적 하루 밖에서 준 사람(econ 약탈 실전투) — 다음 도적 하루 머리에 그 수만큼 쓰러지고 · 남은 사람 몸만 해산해 걸어 나간다 ──
{
  const de = D.A.ev, died = (de.raid || []).filter((x) => x === 'died:bandit_other').length, out = (de.raid || []).filter((x) => x === 'walk:move').length;
  ok(de.preRaid && de.preRaid.n === 4 && de.preRaid.bodies === 4 && de.raidGone && died === 2 && out === 2 && D.stat.dead.other === 2,
    '② econ 약탈 실전투가 둘을 죽였다(4 → 2) — 다음 도적 하루 머리에 은거지 몸 둘이 쓰러지고(해산 판정 앞) · 해산한 남은 둘만 걸어 나간다(죽은 사람 몸이 걷지 않는다)', JSON.stringify(de.raid));
}
// ── ① 소굴 재결성 — 황야에서 난 사람 수만큼 소굴에 몸 ──
{
  const de = D.A.ev;
  ok(de.den && de.den.n >= 4 && de.den.n <= 6 && de.den.bodies === de.den.n && D.A.newBodies === de.den.n, '① 소굴 재결성 — 황야에서 난 사람(4~6)만큼 몸이 소굴에 선다(새 몸 = 그 사람 수 · 상한 3 걷기)', JSON.stringify(de.den) + ` · 새 몸 ${D.A.newBodies}`);
}
// ── ③ 일과 ──
{
  const q = L.A.ev.life || {};
  const home = (a) => a && a.tx === a.home[0] && a.ty === a.home[1];
  ok(q.night && q.night.r === true && home(q.night) && q.night.act === '귀가' && q.night.actHome === '취침', '③ 밤 — 은거지로 걸어가(`귀가`) 닿으면 `취침`(마을 일과 `_lifeGoHome` 그 문)', JSON.stringify(q.night));
  ok(q.dawnFed && q.dawnFed.r === true && home(q.dawnFed) && q.dawnFed.actHome === '식사', '③ 아침 창 · 오늘 끼니를 단 비축이 댔다 — 은거지에서 `식사`', JSON.stringify(q.dawnFed));
  ok(q.dawnHungry && q.dawnHungry.r === false && q.noon && q.noon.r === false, '③ 아침 창이라도 비축이 끼니를 못 댔으면 · 그리고 낮 — 종전 배회(일터 = 은거지 둘레)', JSON.stringify([q.dawnHungry, q.noon]));
  ok(L.A.ev.fed405 && L.A.ev.fed405.length === 5 && L.A.ev.fed405.every((f) => f === 1) && D.A.ev.fedAfter && D.A.ev.fedAfter.every((f) => f === 0), '③ 끼니 표식 = 도적 하루 유지비 줄(단 비축 > 0 이면 1 · 비축 0 이면 0) — 몸은 그 사실만 보인다(econ 사본 0)', JSON.stringify([L.A.ev.fed405, D.A.ev.fedAfter]));
}
// ── ⓑ 미끼 ──
{
  const b1 = sub('life', true, 'nodie');
  ok(b1 && (vanishN(b1) > 0 || !b1.A.ev.mobAfter.lying), 'ⓑ 미끼 `nodie`(쓰러짐 문을 뗀다) — ②의 “그 자리에 쓰러진다 · 소멸 0”이 빨개진다', b1 ? `소멸 ${vanishN(b1)} · 누운 몸 ${b1.A.ev.mobAfter.lying}` : '');
  const b2 = sub('life', true, 'noout');
  ok(b2 && (vanishN(b2) > 0 || !(b2.A.ev.out || []).every((q) => q.alive && q.k === 'move')), 'ⓑ 미끼 `noout`(걸어 나감 문을 뗀다) — ①의 “해산 몸이 걸어 나간다 · 소멸 0”이 빨개진다', b2 ? `소멸 ${vanishN(b2)} · ${JSON.stringify(b2.A.ev.out)}` : '');
}

{ const clean = o => JSON.stringify(o, (k,v) => k === 'perf' ? null : v); ok(clean(sub('life', 'default')) === clean(sub('life', true)), '[T1184] 미설정 기본 = 명시적 켬(몸·더미·걸음 결과)'); }
console.log(`\n결과: ${fail ? 'FAIL' : 'PASS'} (${pass} 통과 · ${fail} 실패)`);
process.exit(fail ? 1 : 0);
