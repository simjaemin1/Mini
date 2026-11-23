#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 5   ← [T1356] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1460-den-land.js — 도적은 숨은 땅에서도 먹는다(T1460 · 손잡이 `T1460_DEN_LAND` 끔 기본 · T1404 ㉡ · ㉢ 위) ====
//
// ★왜 [지시 T1460 · ★재민 11-22 판정 77 · T1404 회부 3 · 7]
//   은거지 땅은 마을 땅 읽개를 부르지만 마을 생활권과 겹치는 칸을 그대로 셌고(마을이 이미 제 땅으로 읽은 숲 · 짐승) · 길목에 나간 단도 은거지 땅 몫을 받았다(단 단위 장부).
// 판(운영 함수 그대로 · 사본 0): 도적 하루 `daily` · 은거지 땅(`_t1404Land` → `_t1460Land` · 호스트 `t1460Land` = 마을 땅 읽개 `extractLandParamsApprox`) · ㉡ 하루(`_t1460Forage`) · ㉢ 떠남(`_t1404Leave`).
//   꾸민 세계(아이 프로세스 — 손잡이는 모듈을 읽을 때 정해진다 · `test-t1404-bandit-live` 그 틀): 목촌(200,200) · 이웃(500,200) · 셋째(650,450) ·
//   마을 숲(목촌 둘레 x 140 ~ 300 · y 140 ~ 300 — 거의 다 목촌 생활권 140칸 안) · 깊은 숲(x 300 ~ 480 · y 380 ~ 620 — 어느 마을 생활권에도 안 든다).
//   ① 땅 — 트인 은거지 A(230,330 · 목촌 곁): 켬 땅의 나무 · 짐승 < 겹친 칸을 다 센 땅(끔 읽개) · 석기여도 먹이는 수 0 / 깊은 숲 은거지 B(390,500): 켬 땅 숲 몫 > 바닥 · 석기면 셋 이상 먹인다 /
//      두 은거지가 한 숲(C 430,560): 칸을 나눈다(B · C 둘 다 제 몫인 칸 0 · C 가 서면 B 땅이 준다) / 끔 — 은거지 땅 = 종전 읽개 그대로 · T1460 셈 칸이 안 선다
//   ② 그날 있던 사람만 — 같은 땅 · 같은 5명: 은거지에 있는 단은 먹을 것이 들고(몸 없는 단원 = "몸 없음" 셈) · 길목에 나간 단(`t1104.st` = 'lurk')은 0
//   ③ 크기 · 굶음 — 깊은 숲 40명 · 비축 0(석기): 땅이 다 먹인다 · 아무도 안 떠난다 / 트인 땅 40명: 열흘 뒤 남은 단 ≤ 그 땅이 먹이는 수 · 넘친 사람은 떠난다 · 둘 다 굶어 죽음 0
//   미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언): ⓐ 고정값을 읽는 사본(켬 갈래를 안 탄다 = 지금) ⓑ 길목에 선 몸이 몫을 받는 사본 ⓒ 마을과 같은 짐승을 두 번 세는 사본(마을 생활권을 안 뺀다)
//     ⓓ 둘레가 먹이는 수보다 무리가 커지는 사본(떠날 수를 0 으로) ⓔ 도적이 굶어 죽는 사본(떠남 문을 안 연다 — 종전 굶음 줄)
// 실행: node scripts/test-t1460-den-land.js
'use strict';
const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const BFILE = path.join(ROOT, 'server', 'bandits.js');
const R = (p) => require(path.join(ROOT, p));
const BAITS = {
  fixed: { at: ['  if (T1460_DEN_LAND) return _t1460Land(g);', '  if (T1460_DEN_LAND && !g) return _t1460Land(g);   // 미끼 ⓐ — 켬 갈래를 안 탄다(고정 읽개 = 지금)'] },
  lurkEat: { at: ["  if (g.t1104 && g.t1104.st && g.t1104.st !== 'camp') return { m: 0, away: n, noBody: 0 };", "  if (g.t1104 && g.t1104.st && g.t1104.st !== 'camp' && !g) return { m: 0, away: n, noBody: 0 };   // 미끼 ⓑ — 길목에 나간 단도 먹는다"] },
  twice: { at: ['if (Math.abs(v.ccx - cx) <= L && Math.abs(v.ccy - cy) <= L) vs.push([v.ccx, v.ccy]); }', 'if (Math.abs(v.ccx - cx) <= L && Math.abs(v.ccy - cy) <= L && !v) vs.push([v.ccx, v.ccy]); }   // 미끼 ⓒ — 마을 생활권을 안 뺀다'] },
  grow: { at: ['cap = _t1404Cap(g, land), ex = Math.max(0, (g.n | 0) - cap);', 'cap = _t1404Cap(g, land), ex = Math.max(0, (g.n | 0) - cap) * 0;   // 미끼 ⓓ — 떠날 수 0(무리가 커진다)'] },
  starve: { at: ['if (T1404_GANG_SIZE && g.zero >= BDT_STARVE) _t1404Leave(g, day);', 'if (T1404_GANG_SIZE && g.zero >= BDT_STARVE && !g) _t1404Leave(g, day);   // 미끼 ⓔ — 떠남 문을 안 연다(종전 굶음)'] },
};
const SZ = 32, MOVE = 64, DAY_MS = 30000, TICK = 100;
const inV = (x, y) => x >= 140 && x <= 300 && y >= 140 && y <= 300;
const inD = (x, y) => x >= 300 && x <= 480 && y >= 380 && y <= 620;

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
  const SUB = process.env.T1460H_SUB || 'land';
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
  const TA = { isBlocked: () => false, forestMult: (x, y) => (inV(x, y) || inD(x, y) ? 1.5 : 1), isRock: () => false, isWater: () => false, nearestWaterDist: () => 140, isOre: () => false };
  const W = { day: 400, seed: 7, infoRange: 2000, caravans: [] };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: vils, byDbId: new Map(vils.map((v) => [v.dbId, v])), byEcon: new Map(vils.map((v) => [v.econ, v])),
    world: W, routeCache: new Map([['1_2', null], ['1_3', null], ['2_3', null]]), _route: null, _distCtx: { ta: TA, ZONE: null }, roads: null, epoch: 0, dayMs: DAY_MS, lastGameDay: W.day, bodyExits: new Map(), _bxTickAt: 0, db: { updateBuildingData: () => {} } });
  for (const v of vils) { H.syncVillagePop(v, Infinity); H.syncVillagePop(v, 0); }
  const host = Object.assign(H.banditHost(), { ta: TA, cellsW: 800, cellsH: 700 });   // 은거지 땅 = 호스트 `t1404Land` · `t1460Land` 그대로(마을 땅 읽개 · `_distCtx.ta`) · 교역로 셋은 미리 '없음'(길목 없음 — 자리 · 길 계산 0)
  const db = { rows: [], upsertBanditState: (z, json, day) => db.rows.push({ z, json, day }) };
  B._t765Probe.setHost(host, db);
  B._t1039Probe.reset();
  B._t1079Probe.install();
  const gangs = () => B._t1039Probe.gangs();
  const P4 = B._t1404Probe, P6 = B._t1460Probe;
  const LL = (L) => L ? { game: L.game, wood: L.wood, size: L.size, fs: L.forageSustain != null ? +(+L.forageSustain).toFixed(4) : null } : null;
  const take = (k, ev) => { const recs = []; for (let i = 0; i < k; i++) { const E1 = ev || (i % 2 ? e2 : e), q = E1.npcs.pop(); if (q) { if (E1.counts && q.currentJob) E1.counts[q.currentJob] = Math.max(0, (E1.counts[q.currentJob] || 0) - 1); recs.push(q); } } H.syncVillagePop(Va, Infinity); H.syncVillagePop(Vb, Infinity); return recs; };
  const G = (id, cx, cy, n, recs) => ({ id, camp: { cx, cy }, n, food: 0, zero: 0, born: 300, home: '목촌', why: '꾸밈', lootN: 0, lastLoot: 300, den: null, _sup: null, _supKill: 0, npc1079: recs || [], arms: {} });
  const out = { sub: SUB, on: P6.ON };
  if (SUB === 'land') {
    const A = G(901, 230, 330, 40), Bg = G(902, 390, 500, 40);
    gangs().push(A, Bg);
    const capOf = (g, L) => P4.cap(g, L);
    out.A = { on: LL(P4.land(A)), wide: LL(host.t1404Land(230, 330)), cap: capOf(A, P4.land(A)) };
    out.B0 = { on: LL(P4.land(Bg)), wide: LL(host.t1404Land(390, 500)), cap: capOf(Bg, P4.land(Bg)) };
    const Cg = G(903, 430, 560, 40); gangs().push(Cg);
    out.B1 = { on: LL(P4.land(Bg)), cap: capOf(Bg, P4.land(Bg)) };
    const cB = P6.claim(Bg), cC = P6.claim(Cg); let both = 0, nb = 0, nc = 0;
    for (let y = 380; y <= 700; y += 4) for (let x = 250; x <= 600; x += 4) { const b = cB.mine(x, y), c = cC.mine(x, y); if (b && c) both++; if (b) nb++; if (c) nc++; }
    out.share = { both, nb, nc };
    out.st = P6.stat();
  } else if (SUB === 'here') {
    const K = G(911, 390, 500, 5), L = G(912, 390, 500, 5);
    K.t1104 = { st: 'camp', carry: null }; L.t1104 = { st: 'lurk', carry: null };
    gangs().push(K);
    const land = P4.land(K);
    P6.forage(K, 5, land); const kFood = +K.food;
    gangs().length = 0; gangs().push(L);
    L._t1404L = undefined; P6.forage(L, 5, P4.land(L)); const lFood = +L.food;
    out.here = { kFood, lFood, st: P6.stat() };
  } else if (SUB === 'deep' || SUB === 'open') {   // 비축 0 · 40명(사람 기록 40) — 열흘 뒤 ㉢ 떠남 · 날마다 도적 하루
    const camp = SUB === 'deep' ? { cx: 390, cy: 500 } : { cx: 230, cy: 330 };
    const g0 = G(900, camp.cx, camp.cy, 40, take(40)); g0.t1104 = { st: 'camp', carry: null };
    gangs().push(g0); B._t1039Probe.syncBodies(true);
    const days = [];
    const c = { t: H.econDayToMs(W.day) + 1, dayAt: H.econDayToMs(W.day) };
    for (let n = 0; n < 16 * (DAY_MS / TICK); n++) {
      c.t += TICK; H.tickBodyExits(c.t);
      while (c.t - c.dayAt >= DAY_MS) { c.dayAt += DAY_MS; W.day++; H.state.lastGameDay++; B._t1039Probe.daily(W.day); B._t765Probe.save(W.day); B._t1039Probe.syncBodies(); for (const v of vils) H.syncVillagePop(v, 2);
        const g = gangs().find((x) => x.id === 900); const L = g ? P4.land(g) : null;
        days.push({ d: W.day, n: g ? g.n : 0, food: g ? +(+g.food).toFixed(4) : null, zero: g ? g.zero : null, cap: g && L ? P4.cap(Object.assign({}, g, { n: 40 }), L) : null, starve: B.stats().starve | 0, road: B._t1039Probe.road().length, st4: B.t1404 ? B.t1404().st : null }); }
    }
    out.days = days; out.st = P6.stat();
  }
  console.log = _log;
  process.stdout.write('@@' + JSON.stringify(out) + '\n');
  process.exit(0);
}

// ── 부모 판 ─────────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const KN = ['T1404_DEN_ROUTE', 'T1404_GANG_FORAGE', 'T1404_GANG_SIZE', 'T1404_RAID_LURK', 'T1460_DEN_LAND'];
const child = (sub, knobs, bait) => {
  const env = Object.assign({}, process.env, { T1460H_SUB: sub });
  for (const k of KN.concat(['T1391_UNHAPPY_BANDIT', 'T1391_DEN_RICH', 'T1143_NO_DISSOLVE', 'BANDIT_FIXTURE', 'VILLAGE_NPC_CAP', 'T1078_BANDIT_ALL', 'T1039_BANDIT_BODY', 'T1079_BANDIT_CAMP', 'T1104_BANDIT_WALK', 'T627_TRIP_DAY', 'BANDIT_BODIES', 'T521_GANG_ARMS'])) delete env[k];
  Object.assign(env, knobs || {});
  const r = spawnSync(process.execPath, [__filename, '--child', bait || '-'], { cwd: ROOT, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('@@'));
  try { return JSON.parse(line.slice(2)); } catch (e) { return { err: `rc ${r.status} · ${(r.stderr || '').slice(-400)}` }; }
};
const short = (x) => JSON.stringify(x).slice(0, 480);
const ON = { T1404_GANG_FORAGE: 'tool', T1404_GANG_SIZE: '1', T1404_DEN_ROUTE: '1', T1460_DEN_LAND: '1' };
const OFF = { T1404_GANG_FORAGE: 'tool', T1404_GANG_SIZE: '1', T1404_DEN_ROUTE: '1' };
function rows(bait) {
  const K = { land: child('land', ON, bait), landOff: child('land', OFF, bait), here: child('here', ON, bait), deep: child('deep', ON, bait), open: child('open', ON, bait) };
  const L = [];
  const err = Object.entries(K).filter(([, o]) => !o || o.err || o.baitErr).map(([k, o]) => k + ':' + ((o && (o.err || o.baitErr)) || 'null'));
  L.push(['0', err.length === 0, '[전제] 다섯 판이 다 돌았다(땅 켬 · 땅 끔 · 그날 있던 사람 · 깊은 숲 · 트인 땅)', err.join(' | ')]);
  const o = K.land, A = o.A, B0 = o.B0, B1 = o.B1;
  L.push(['①a', !!A && A.on && A.wide && A.on.wood < A.wide.wood && A.on.game < A.wide.game && A.cap === 0,
    '①a 트인 은거지(목촌 곁) — 켬 땅은 마을 생활권 칸을 안 센다(나무 · 짐승 < 겹친 칸을 다 센 읽개) · 석기여도 먹이는 수 0', short(A)]);
  L.push(['①b', !!B0 && B0.on && B0.on.wood > 0.45 && B0.on.game > 0.45 && B0.cap >= 3,
    '①b 깊은 숲 은거지 — 켬 땅의 숲 · 짐승이 바닥 위(둘레 실물) · 석기면 셋 이상 먹인다', short(B0)]);
  L.push(['①c', !!B1 && !!o.share && o.share.both === 0 && o.share.nb > 0 && o.share.nc > 0 && B1.on.wood < B0.on.wood,
    '①c 두 은거지가 한 숲 — 칸을 나눈다(둘 다 제 몫인 칸 0) · 이웃 은거지가 서면 B 땅이 준다', short({ B1, share: o.share })]);
  const f = K.landOff;
  L.push(['①d', !!f && f.on === false && f.A && f.A.on && JSON.stringify(f.A.on) === JSON.stringify(f.A.wide) && JSON.stringify(f.B0.on) === JSON.stringify(f.B0.wide) && f.st === null,
    '①d 끔 — 은거지 땅 = 종전 읽개(겹친 칸을 다 센다) 그대로 · T1460 셈 칸이 안 선다', short({ A: f && f.A, st: f && f.st })]);
  const h = K.here && K.here.here;
  L.push(['②a', !!h && h.kFood > 0 && h.lFood === 0 && h.st && h.st.here === 5 && h.st.away === 5 && h.st.noBody === 5,
    '②a 그날 있던 사람만 — 은거지의 단(5명 · 몸 없음 5)은 사냥 · 채집이 더미에 들고 · 길목에 나간 단(5명)은 0', short(h)]);
  const dD = (K.deep && K.deep.days) || [], dl = dD[dD.length - 1], cap = dl ? dl.cap : null;
  L.push(['③a', !!dl && cap != null && cap >= 40 && dD.every((x) => x.n === 40 && x.zero === 0) && dl.food > dD[0].food && dl.starve === 0,
    '③a 깊은 숲 40명 · 비축 0 — 그 땅이 다 먹인다(석기 · 먹이는 수 ≥ 40) · 아무도 안 떠나고 더미가 는다 · 굶어 죽음 0(숲 깊은 무리는 버틴다)', short({ last: dl, food: dD.map((x) => x.food) })]);
  const oD = (K.open && K.open.days) || [], ol = oD[oD.length - 1];
  L.push(['③b', !!ol && ol.cap != null && ol.cap < 40 && oD.some((x) => x.n < 40) && ol.n <= ol.cap && ol.starve === 0,
    '③b 트인 땅 40명 · 비축 0 — 열흘 뒤 남은 단 ≤ 그 땅이 먹이는 수(< 40) · 넘친 사람은 떠난다 · 굶어 죽음 0(트인 땅 무리는 흩어진다)', short({ last: ol, n: oD.map((x) => x.n) })]);
  return L;
}
console.log('\n=== T1460 — 도적은 숨은 땅에서도 먹는다(`T1460_DEN_LAND` 끔 기본 · T1404 ㉡ · ㉢ 위) ===');
{
  const src = fs.readFileSync(BFILE, 'utf8');
  const code = src.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
  const a = code.indexOf('function _t1460St()'), b = code.indexOf('function _t1404Skill(g, field)');
  const blk = a > 0 && b > a ? code.slice(a, b).replace(/'[^']*'|`[^`]*`/g, '') : '';
  const num = /[^\w.'"`](?:[2-9]|\d{2,})(?:\.\d+)?(?![\w])/;
  const hit = (blk.match(num) || [''])[0];
  ok(a > 0 && b > a && !num.test(blk), '⓪ 정적 · T1460 덩이에 새 수 0(0 · 1 말고 수 글자 없음 — 생활권 반경은 호스트가 마을 땅 읽개의 그 수 `LAND_SCAN_R` 를 준다)', a > 0 && b > a ? hit : '덩이 없음');
}
const MAIN = rows();
for (const [, c, m, d] of MAIN) ok(c, m, d);
console.log('\n  ── 미끼(이 파일 안 · 자리 꼭 한 번 · 빨강 줄 단언)');
const SRC = fs.readFileSync(BFILE, 'utf8');
const RED = { fixed: ['①a', '①c'], lurkEat: ['②a'], twice: ['①a'], grow: ['③b'], starve: ['③b'] };   // ⓐ 은 땅만 바꾼다(그날 있던 사람 줄은 따로 선다) · ⓓ ⓔ 는 넘치는 단(트인 땅)에서만 빨강 — 깊은 숲 단은 넘치지 않는다
const BR = {};
for (const [name, Bt] of Object.entries(BAITS)) {
  const n = SRC.split(Bt.at[0]).length - 1;
  const red = n === 1 ? rows(name).filter((r) => !r[1]).map((r) => r[0]).sort() : null;
  BR[name] = { n, red, same: !!red && JSON.stringify(red) === JSON.stringify(RED[name].slice().sort()) };
}
const line = (k, what) => ok(BR[k].n === 1 && BR[k].same, `미끼 ${what} → 빨강 줄이 꼭 {${RED[k].join(', ')}}`, `바꾼 자리 ${BR[k].n} · 빨강 {${(BR[k].red || []).join(', ')}}`);
line('fixed', 'ⓐ — 고정 읽개 사본(켬 갈래를 안 탄다 = 지금)');
line('lurkEat', 'ⓑ — 길목에 선 몸이 몫을 받는 사본');
line('twice', 'ⓒ — 마을과 같은 짐승을 두 번 세는 사본(마을 생활권을 안 뺀다)');
line('grow', 'ⓓ — 둘레가 먹이는 수보다 무리가 커지는 사본(떠날 수 0)');
line('starve', 'ⓔ — 도적이 굶어 죽는 사본(떠남 문을 안 연다 — 종전 굶음)');
console.log(`\n=== ${pass}/${pass + fail} 통과 ===`);
process.exit(fail ? 1 : 0);
