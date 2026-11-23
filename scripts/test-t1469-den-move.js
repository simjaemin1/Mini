#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 6   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1469-den-move.js — 도적 소굴은 털 것이 없어지면 옮긴다(T1469 · 손잡이 `T1469_DEN_MOVE` 끔 기본 · T1404 ㉢ 문 위) ====
//
// ★왜 [지시 T1469 · ★재민 11-23 판정 82 "나" · T1404 회부 6]
//   소굴은 부팅에 한 번 고르고 저장에서 되살린다 — 털 것이 없어져도 그 자리다. 비축 0 열흘 문(㉢)이 서면 단이 통째로 흩어졌다.
// 판(운영 함수 그대로 · 사본 0): 도적 하루 `daily`(문 → `_t1469Move` → 자리 `_t1404Where`(㉢ 갈라짐이 고르는 그 함수) → 몸 걸음 `t1104Walk` · 길 위 장부 `S.ROAD` → 닿음 `_t1039Arrive`) · 짐 더미(T1079).
//   꾸민 세계(아이 프로세스 · `test-t1460-den-land` 그 틀): 목촌(200,200 · 곳간 3,000) · 이웃(3400,200 · 곳간 10) · 셋째(3550,450 · 곳간 5,000 — 가장 부유) · 정보 반경 3,600칸 ·
//   목촌 곁 숲(x 140 ~ 300 · y 140 ~ 300) · 셋째 곁 숲(x 3500 ~ 3600 · y 400 ~ 500). 단(6명 · 무기 10)은 (3380,420) — 셋째에서 172칸 · 목촌에서 3,188칸(장부 걸음 이틀 — 하루 2,880칸).
//   ① 문이 서면 옮긴다 — 비축 0 열흘 날: 단이 길 위 장부로 · 새 자리 = 지금 자리 둘레 250칸 안 마을(셋째 · 이웃)은 빼고 털 것 많은 마을(목촌) 곁 숨을 자리 ·
//      몸은 걷는다(틱마다 걸음 ≤ 걸음 × 틱 · 순간이동 0) · 닿는 날 = 떠난 날 + 걸음 날 · 단 번호 · 사람 수 그대로 · 결성 씨앗 없음
//   ② 옛 은거지 짐 — 몸마다 제 무기만 지고(6) 나머지(4)는 옛 자리 더미에 남는다(누구나 줍는다 — `public`)
//   ③ 옮긴 곳에서 또 문이 서면 종전 ㉢(흩어짐 · 마을로) · 굶어 죽음 0
//   ④ 문이 안 서면 안 옮긴다(비축이 있는 단) · 저장 줄에 길 위 단의 옮김 표지가 실린다(다시 뜨면 결성 씨앗 없이 닿는다)
//   ⑤ 끔 — 옮김 0 · T1469 셈 칸 · 저장 칸이 안 선다 · 같은 판이 ㉢ 로 흩어진다(종전)
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ⓐ 순간이동(장부 길 0) ⓑ 지금 자리를 다시 고른다 ⓒ 이격 250칸을 어긴다 ⓓ 옛 은거지 짐이 사라진다 ⓔ 문이 안 섰는데 옮긴다 ⓕ 끔에서도 옮긴다
// 실행: node scripts/test-t1469-den-move.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BFILE = path.join(ROOT, 'server', 'bandits.js');
const R = (p) => require(path.join(ROOT, p));
const DOOR = 'if (T1469_DEN_MOVE && g.zero >= BDT_STARVE && _t1469Move(g, day)) continue;';
const BAITS = {
  teleport: { at: ['S.ROAD.push({ g, vid: null, d0: day, len, ppd, pids: walk, t1404: 1 });', 'S.ROAD.push({ g, vid: null, d0: day, len: 0, ppd, pids: walk, t1404: 1 });   // 미끼 ⓐ — 순간이동(장부 길 0)'] },
  same: { at: ['  if (!camp) { camp = _t1404Where(g); if (camp) st.lootPick++; }', '  if (!camp) { camp = { cx: g.camp.cx, cy: g.camp.cy }; if (camp) st.lootPick++; }   // 미끼 ⓑ — 지금 자리를 다시 고른다'] },
  sep: { at: ['  const sep = BDT_DEN_SEP;', '  const sep = 0;   // 미끼 ⓒ — 이격 250칸을 어긴다'] },
  pile: { at: ["delete d._bandit; d._left = day; P.pile.ownerId = 'public'; P.gid = null; d._t1469 = g.id;", "for (const k of Object.keys(d)) delete d[k]; P.pile.ownerId = 'public'; P.gid = null; d._t1469 = g.id;   // 미끼 ⓓ — 옛 은거지 짐이 사라진다"] },
  early: { at: [DOOR, 'if (T1469_DEN_MOVE && g.zero >= 0 && _t1469Move(g, day)) continue;   // 미끼 ⓔ — 문이 안 섰는데 옮긴다'] },
  offMove: { at: [DOOR, 'if (g.zero >= BDT_STARVE && _t1469Move(g, day)) continue;   // 미끼 ⓕ — 끔에서도 옮긴다'] },
};
const SZ = 32, MOVE = 64, DAY_MS = 30000, TICK = 100;
const inF = (x, y) => (x >= 140 && x <= 300 && y >= 140 && y <= 300) || (x >= 3500 && x <= 3600 && y >= 400 && y <= 500);

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
  const econ = R('sim/economy-sim'), V = R('server/villages'), B = R('server/bandits');
  const SUB = process.env.T1469H_SUB || 'move';
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
  const SPEC = [['목촌', 200, 200, 30, 3000], ['이웃', 3400, 200, 25, 10], ['셋째', 3550, 450, 20, 5000]];
  const vils = SPEC.map(([name, cx, cy, k, food], i) => {
    const e = mk(k, name);
    for (const r of Object.keys(e.storage || {})) e.storage[r] = 0;
    e.storage.food = food;
    return { dbId: i + 1, name, ccx: cx, ccy: cy, econ: e, npcPids: [], housesPx: [0, 1, 2, 3].map((j) => ({ x: (cx - 6 + j * 4) * SZ + SZ / 2, y: (cy + 8) * SZ + SZ / 2 })), _maxRPx: 40 * SZ };
  });
  const [Va, Vb] = vils, e = Va.econ, e2 = Vb.econ;
  const TA = { isBlocked: () => false, forestMult: (x, y) => (inF(x, y) ? 1.5 : 1), isRock: () => false, isWater: () => false, nearestWaterDist: () => 140, isOre: () => false };
  const W = { day: 400, seed: 7, infoRange: 9000, caravans: [] };   // 정보 반경 = 9,000 ÷ 2.5 = 3,600칸(목촌까지 닿는다)
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: new Map([['1_2', null], ['1_3', null], ['2_3', null]]), _route: null, _distCtx: { ta: TA, ZONE: null }, roads: null, epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0, db: { updateBuildingData: () => {} } });
  for (const v of vils) { H.syncVillagePop(v, Infinity); H.syncVillagePop(v, 0); }
  const host = Object.assign(H.banditHost(), { ta: TA, cellsW: 4000, cellsH: 700 });
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  B._t1079Probe.install();
  const gangs = () => B._t1039Probe.gangs(), road = () => B._t1039Probe.road();
  const P9 = B._t1469Probe;
  const A = { jumps: 0, maxStep: 0 };
  const pos = new Map();
  function moveAudit(dt) {
    for (const [id, p] of players) {
      const q = pos.get(id); if (!q) { pos.set(id, [p.x, p.y]); continue; }
      const d = Math.hypot(p.x - q[0], p.y - q[1]);
      if (d > A.maxStep) A.maxStep = d;
      const walking = p._t1104W != null || q[2], scale = walking && host.t1104Ppd ? host.t1104Ppd() / (MOVE / 1000 * DAY_MS) : 1;
      if (d > MOVE / 1000 * dt * scale * 1.001 + 0.01) A.jumps++;
      q[2] = p._t1104W != null; q[0] = p.x; q[1] = p.y;
    }
  }
  //   단 — 길 위 장부로 넣어 첫날 닿게 한다(닿음 = 야영 터 · 짐 더미 · 몸 — 운영 문 그대로) · 비축 0 · 무기 10
  const recs = []; for (let i = 0; i < 6; i++) { const q = e2.npcs.pop(); if (q) { if (e2.counts && q.currentJob) e2.counts[q.currentJob] = Math.max(0, (e2.counts[q.currentJob] || 0) - 1); recs.push(q); } }
  H.syncVillagePop(Vb, Infinity);
  const food0 = SUB === 'fed' ? 500 : 0;
  const G0 = { id: 900, camp: { cx: 3380, cy: 420 }, n: 6, food: food0, zero: 0, born: 300, home: '이웃', why: '꾸밈', lootN: 0, lastLoot: 300, den: null, _sup: null, _supKill: 0, npc1079: recs, arms: { weapon: 10 } };
  road().push({ g: G0, vid: null, d0: W.day, len: 0, ppd: 1, pids: [] });
  const days = [];
  const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
  const dayN = SUB === 'save' ? 3 : 45;   // 저장 판 = 떠난 다음 날(길 위)에서 끊는다
  for (let n = 0; n < dayN * (DAY_MS / TICK); n++) {
    c.t += TICK; H.tickBodyExits(c.t); moveAudit(TICK);
    while (c.t - c.dayAt >= DAY_MS) {
      c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++;
      if (W.day === 402) { const g = gangs().find((x) => x.id === 900); if (g && SUB !== 'fed') g.zero = 9; }   // 비축 0 아흐레 — 다음 하루가 열흘째 문
      B._t1039Probe.daily(W.day); B._t765Probe.save(W.day); B._t1039Probe.syncBodies(W.day === 401); for (const v of vils) H.syncVillagePop(v, 2); moveAudit(TICK);   // 첫날 = 닿은 단의 몸이 선다(부팅 문)
      const g = gangs().find((x) => x.id === 900), r = road().find((x) => x.g.id === 900);
      const piles = (B.t1079().piles || []).map((P) => ({ x: Math.floor(P.x / SZ), y: Math.floor(P.y / SZ), owner: P.owner, gid: P.gid, left: P.left, food: P.food, arms: P.arms || null }));
      days.push({ d: W.day, inG: !!g, onRoad: !!r, n: g ? g.n : (r ? r.g.n : 0), camp: g ? [g.camp.cx, g.camp.cy] : (r ? [r.g.camp.cx, r.g.camp.cy] : null), zero: g ? g.zero : null, t1469: g ? g.t1469 : (r ? r.g.t1469 : null),
        road: r ? { d0: r.d0, len: r.len, ppd: r.ppd, pids: (r.pids || []).length } : null, bodies: g ? ((new Map(B.t1039().bodies)).get(900) || []).filter((pid) => players.has(pid)).length : null,
        piles, starve: B.stats().starve | 0, pop: vils.map((v) => v.econ.npcs.length), st9: P9.stat(), st4: B.t1404 ? B.t1404().st : null });
    }
  }
  const lastSave = db.rows.length ? JSON.parse(db.rows[db.rows.length - 1].json) : null;
  const out = { sub: SUB, on: P9.ON, days, A, save: lastSave ? { road: (lastSave.road || []).map((r) => ({ id: r.g.id, t1469: r.g.t1469 || null })), gangs: (lastSave.gangs || []).map((g) => ({ id: g.id, t1469: g.t1469 || null })), st9: !!(lastSave.stats && lastSave.stats.t1469) } : null };
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const KN = ['T1404_DEN_ROUTE', 'T1404_GANG_FORAGE', 'T1404_GANG_SIZE', 'T1404_RAID_LURK', 'T1460_DEN_LAND', 'T1469_DEN_MOVE'];
const child = (sub, knobs, bait) => {
  const env = Object.assign({}, process.env, { T1469H_SUB: sub });
  for (const k of KN.concat(['T1391_UNHAPPY_BANDIT', 'T1391_DEN_RICH', 'T1143_NO_DISSOLVE', 'BANDIT_FIXTURE', 'VILLAGE_NPC_CAP', 'T1078_BANDIT_ALL', 'T1039_BANDIT_BODY', 'T1079_BANDIT_CAMP', 'T1104_BANDIT_WALK', 'T627_TRIP_DAY', 'BANDIT_BODIES', 'T521_GANG_ARMS'])) delete env[k];
  Object.assign(env, knobs || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` }; }
};
const short = (x) => JSON.stringify(x).slice(0, 520);
const ON = { T1404_DEN_ROUTE: '1', T1404_GANG_SIZE: '1', T1469_DEN_MOVE: '1' };
const OFF = { T1404_DEN_ROUTE: '1', T1404_GANG_SIZE: '1' };
const hyp = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const FROM = [3380, 420], MOK = [200, 200], NEI = [3400, 200], SET = [3550, 450];
function rows(bait) {
  const K = { move: child('move', ON, bait), fed: child('fed', ON, bait), save: child('save', ON, bait), off: child('move', OFF, bait) };
  const L = [];
  const err = Object.entries(K).filter(([, o]) => !o || o.err || o.baitErr).map(([k, o]) => k + ':' + ((o && (o.err || o.baitErr)) || 'null'));
  L.push(['0', err.length === 0, '[전제] 네 판이 다 돌았다(옮김 · 비축 있는 단 · 저장 · 끔)', err.join(' | ')]);
  const D = (K.move && K.move.days) || [];
  const dep = D.find((x) => x.onRoad), arr = D.find((x) => x.inG && x.t1469 && x.t1469.at != null);
  const t9 = arr ? arr.t1469 : null, from = FROM;
  const eta = dep && dep.road && dep.road.ppd > 0 ? dep.road.d0 + Math.ceil(Math.max(0, dep.road.len - 0.5) / dep.road.ppd) : null;
  L.push(['①a', !!dep && !!arr && !!t9 && t9.moved === 1 && arr.camp && hyp(arr.camp, from) >= 250 && hyp(arr.camp, MOK) < hyp(arr.camp, SET) && hyp(arr.camp, MOK) < hyp(arr.camp, NEI) && arr.n === 6,
    '①a 문이 서면 옮긴다 — 새 자리 = 지금 자리 둘레 250칸 안 마을(셋째 · 이웃)을 뺀 털 것 많은 마을(목촌) 곁 · 지금 자리에서 250칸 밖 · 단 번호 · 사람 수 그대로', short({ dep: dep && { d: dep.d, road: dep.road }, arr: arr && { d: arr.d, camp: arr.camp, n: arr.n, t9 } })]);
  L.push(['①b', !!dep && !!arr && eta != null && arr.d === eta && arr.d - dep.d >= 2 && K.move.A.jumps === 0 && dep.road.pids > 0,
    '①b 몸으로 간다 — 몸이 걷는다(순간이동 0) · 닿는 날 = 떠난 날 + 장부 걸음 날(곧은 길 ≥ 이틀)', short({ dep: dep && dep.d, arr: arr && arr.d, eta, jumps: K.move.A.jumps, maxStep: K.move.A.maxStep })]);
  const old = dep ? dep.piles.find((p) => Math.abs(p.x - FROM[0]) <= 10 && Math.abs(p.y - FROM[1]) <= 10) : null;
  L.push(['②a', !!old && old.owner === 'public' && old.gid == null && old.arms && Math.abs((old.arms.weapon || 0) - 4) < 1e-9,
    '②a 옛 은거지 짐 — 몸마다 제 무기만 지고(6) 나머지 무기 4 는 옛 자리 더미에 남는다(누구나 줍는다)', short({ old, piles: dep && dep.piles })]);
  const last = D[D.length - 1], again = last && last.st9 ? last.st9.again : null;
  L.push(['③a', !!last && again >= 1 && last.st9.moved === 1 && last.starve === 0 && last.st4 && last.st4.leave >= 1 && last.n < 6,
    '③a 옮긴 곳에서 또 문이 서면 종전 ㉢ — 다시 안 옮기고 넘친 사람이 떠난다 · 굶어 죽음 0', short({ last: last && { d: last.d, n: last.n, st9: last.st9, starve: last.starve, leave: last.st4 && last.st4.leave } })]);
  const F = (K.fed && K.fed.days) || [], fl = F[F.length - 1];
  L.push(['④a', !!fl && F.every((x) => x.inG && !x.onRoad) && fl.camp && hyp(fl.camp, from) === 0 && (!fl.st9 || fl.st9.moved === 0),
    '④a 문이 안 서면 안 옮긴다(비축 500 · 마흔닷새)', short({ last: fl && { d: fl.d, camp: fl.camp, st9: fl.st9 } })]);
  const sv = K.save && K.save.save, sr = sv && sv.road.find((r) => r.id === 900);
  L.push(['④b', !!sr && !!sr.t1469 && sr.t1469.walk === 1 && sr.t1469.moved === 1 && sv.st9,
    '④b 저장 줄 — 길 위 단의 옮김 표지(걷는 중 · 옮긴 단)가 실린다(다시 뜨면 결성 씨앗 없이 닿고 · 다시 안 옮긴다)', short(sv)]);
  const O = (K.off && K.off.days) || [], ol = O[O.length - 1];
  L.push(['⑤a', !!ol && O.every((x) => !x.onRoad) && !ol.st9 && K.off.on === '' && ol.st4 && ol.st4.leave >= 1 && K.off.save && !K.off.save.st9 && K.off.save.gangs.every((g) => !g.t1469),
    '⑤a 끔 — 옮김 0 · T1469 셈 칸 · 저장 칸이 안 선다 · 같은 판이 문에서 ㉢ 로 흩어진다(종전)', short({ last: ol && { d: ol.d, n: ol.n, leave: ol.st4 && ol.st4.leave }, save: K.off.save })]);
  return L;
}
console.log('\n=== T1469 — 도적 소굴은 털 것이 없어지면 옮긴다(`T1469_DEN_MOVE` 끔 기본 · T1404 ㉢ 문 위) ===');
{
  const src = fs.readFileSync(BFILE, 'utf8');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const a = code.indexOf('function _t1469St()'), b = code.indexOf('function _t1404Keys(g)');
  const blk = a > 0 && b > a ? code.slice(a, b).replace(/'[^']*'|`[^`]*`/g, '').replace(/SZ \/ 2/g, '') : '';
  const num = /[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/;
  ok(a > 0 && b > a && !num.test(blk), '⓪ 정적 · T1469 덩이에 새 수 0(0 · 1 말고 수 글자 없음 — 이격 · 문 날은 도적 층 이름으로만)', a > 0 && b > a ? (blk.match(num) || [''])[0] : '덩이 없음');
  ok(/function _t1404Split\(g, k, day\) \{[\s\S]{0,400}const camp = _t1404Where\(g\);/.test(src) && (src.match(/campSpot\(v\.ccx, v\.ccy, true, /g) || []).length === 1 && /camp = _t1404Where\(g\); if \(camp\) st\.lootPick\+\+;/.test(src),
    '⓪ 정적 · 자리 고르기 함수 하나 — ㉢ 갈라짐과 T1469 옮김이 같은 `_t1404Where`(이격 쓰는 숨을 자리 부름은 그 안 한 곳 · 사본 0)');
}
const MAIN = rows();
for (const [, c, m, d] of MAIN) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(BFILE, 'utf8');
const RED = { teleport: ['①b', '④b'], same: ['①a', '①b', '④b'], sep: ['①a', '①b', '④b'], pile: ['②a'], early: ['①b', '②a', '④a', '④b'], offMove: ['⑤a'] };   // ④b = 떠난 다음 날 길 위 — 사본이 일찍 닿거나(순간이동 · 가까운 자리) 일찍 떠나면 저장 때 이미 닿았다
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = SRC.split(Bt.at[0]).length - 1;
  const red = n === 1 ? rows(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
const red = (k) => `{${(BR[k].red || []).join(', ')}}`, okB = (k) => BR[k].n === 1 && BR[k].same;
ok(okB('teleport'), '미끼 ⓐ — 순간이동으로 옮기는 사본(장부 길 0) → 빨강 줄이 꼭 {①b, ④b}', `바꾼 자리 ${BR.teleport.n} · 빨강 ${red('teleport')}`);
ok(okB('same'), '미끼 ⓑ — 지금 자리를 다시 고르는 사본 → 빨강 줄이 꼭 {①a, ①b, ④b}', `바꾼 자리 ${BR.same.n} · 빨강 ${red('same')}`);
ok(okB('sep'), '미끼 ⓒ — 이격 250칸을 어기는 사본 → 빨강 줄이 꼭 {①a, ①b, ④b}', `바꾼 자리 ${BR.sep.n} · 빨강 ${red('sep')}`);
ok(okB('pile'), '미끼 ⓓ — 옛 은거지 짐이 사라지는 사본 → 빨강 줄이 꼭 {②a}', `바꾼 자리 ${BR.pile.n} · 빨강 ${red('pile')}`);
ok(okB('early'), '미끼 ⓔ — 문이 안 섰는데 옮기는 사본 → 빨강 줄이 꼭 {①b, ②a, ④a, ④b}', `바꾼 자리 ${BR.early.n} · 빨강 ${red('early')}`);
ok(okB('offMove'), '미끼 ⓕ — 끔에서도 옮기는 사본 → 빨강 줄이 꼭 {⑤a}', `바꾼 자리 ${BR.offMove.n} · 빨강 ${red('offMove')}`);
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
