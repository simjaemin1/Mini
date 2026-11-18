#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1348-loop.js — 결정 순회 고리 거울(T1348 ⓐ) · 걷는 몸 열 커널(T1348 ⓑ) = 종전 고리 · 종전 걸음 문 ===
//   존 글자(결정 문 고리 `_decOne` 몸통 + 순회 · `npcStep` 전체 · 막힘 · 따라가기 · 거울 · `_t1322*` · `_t1337*` · `_t1348*`)와 `server/stand-skip.js`(OrdSet · PMap)를
//   샌드박스 두 벌(끔 = `T1322_PREFILTER=0` · 켬 = 기본)에 넣는다. 결정 문은 대역(머리는 존 글자 꼴 — 씨 · 결정 시각 · 늑대)이고 생활층은 깨어 일(멀리 · 걷는다) · 끼니 · 귀가 · 잠이다.
//   길 묻기는 대역(지금 자리 → 목표 다섯 점 · 결정론). 이동은 속도 × dt · 진흙 칸(막힘 1.5초) · 밀기(쓰기 앞 표 내림) · 죽음/되살림(players · npcs 빼고 넣기) ·
//   같은 pid 새 몸(칸 다시 받음) · players 에 다른 몸 · 예산 멈춤(커서)을 두 벌에 같은 차례로 넣는다.
//   ① 몸 1,000 × 틱 1,200: 끔 ↔ 켬 몸 칸 전부 같음(틱마다 도장 뺌 · 들여다볼 때 · 끝) · 고리가 본 pid 차례 같음 · 전제(걷는 몸 커널이 탔다 · 막힘 · 만료 · 도착 깨움 · 커서 · 칸 메움)
//   ② `T1348_WALK=verify` · `T1322_PREFILTER=verify` — 커널이 낼 값 ↔ 진짜 걸음 어긋남 0 · 'gone' 표 ↔ players 술어 어긋남 0
//   ③ OrdSet ↔ Set — 무작위 넣기 · 빼기 · 순회 중 넣고 빼기 · 칸 메움 2,000 판 차례 같음
//   ④ 미끼(하네스 안 · 바꾼 자리 정확히 1곳 · 빨강 줄 단언): ⓐ 거울이 지웠다 다시 넣은 pid 를 옛 자리에 둔 사본 → ③ 빨강 · ⓑ 막힘 깨움을 늦게 낸 사본 → ① 빨강 · ⓒ 길 만료 깨움을 늦게 낸 사본 → ① 빨강
//   ⑤ 글자 — 커널 셈 글자 = `detectStuck` · `followNpcPath` 그 식 · 손잡이
//   날짜 · 벽시계를 안 쓴다(가상 시각 · 틱 번호만).
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const SSRC0 = fs.readFileSync(path.join(ROOT, 'server', 'stand-skip.js'), 'utf8');
const _SEED = require(path.join(ROOT, 'server', 'seed-rand.js'));
const loadSS = (src, env) => { const m = { exports: {} }; vm.runInThisContext('(function (module, exports, require, process) {' + src + '\n})')(m, m.exports, require, { env }); return m.exports; };
const MISS = [];   // 못 찾은 존 글자(옛 코드 · 이름 바뀜) — 던지지 않고 ✗ 줄로 낸다
const fn = (src, head) => { const i = src.indexOf(head); if (i < 0) { MISS.push(head); return ''; } const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const line = (src, head) => { const i = src.indexOf(head); if (i < 0) { MISS.push(head); return ''; } return src.slice(i, src.indexOf('\n', i) + 1); };
const seg = (src, a, b) => { const i = src.indexOf(a); if (i < 0) { MISS.push(a); return ''; } const j = src.indexOf(b, i); if (j < 0) { MISS.push(b); return ''; } return src.slice(i, src.indexOf('\n', j) + 1); };
const once = (src, a, b) => { let n = 0; for (let i = src.indexOf(a); i >= 0; i = src.indexOf(a, i + 1)) n++; if (n !== 1) throw new Error(`미끼 자리 ${n}곳: ${a.slice(0, 60)}`); return src.replace(a, b); };
let fCmp = fn(Z, 'function computeNpcPath(npc, now) {');
fCmp = fCmp.slice(0, fCmp.indexOf('  const isVil')) + '  return __path(npc);\n}\n';
const LOOP = seg(Z, '  let _curHit = (_npcCursor === null), _stopAt = null;', '  _npcCursor = _curHit ? _stopAt : null;');
const PARTS = [line(Z, 'function _t671Lt('), line(Z, 'function _t671Gt('), line(Z, 'function _t670Stuck(npc, now)'), fn(Z, 'function detectStuck(npc, now) {'), fn(Z, 'function followNpcPath(npc, speedMult) {'),
  fn(Z, 'function _t791Mir(npc) {'), fCmp, fn(Z, 'function npcStep(npc, dt, now) {'),
  fn(Z, 'function _t1322State(npc) {'), fn(Z, 'function _t1322Grant(npc, now, s0) {'), fn(Z, 'function _t1322Wake(s) {'), line(Z, 'function _t1322Touch(p)'), line(Z, 'function _t1322FlushAll()'),
  line(Z, 'let _t1322PhNow = NaN'), fn(Z, 'function _t1322Dusk(s, now) {'), fn(Z, 'function _t1322Skip(s, pid, now) {'), fn(Z, 'function _t1322Check(npc, s, now) {'),
  line(Z, 'const _t1337Dice = '), line(Z, 'let _t1337Pend = null;'), fn(Z, 'function _t1337Grant(npc, s, now) {'), fn(Z, 'function _t1337Dec(s, now) {'), line(Z, 'const _T1337_ST = '), line(Z, 'function _t1337Snap(p)'), fn(Z, 'function _t1337Cmp(npc) {'),
  line(Z, 'let _t1348Pend = null;'), fn(Z, 'function _t1348Grant(npc, s, now, nda) {'), fn(Z, 'function _t1348Walk(s, now, vq) {'), fn(Z, 'function _t1348Cmp(npc) {'),
  fn(Z, 'function _t1348FGrant(npc, s) {'), fn(Z, 'function _t1348Dec(s, now) {'), fn(Z, 'function _t1348FCmp(npc, nda, snap, pre) {'), fn(Z, 'function _t1365Noop(npc, snap) {'),
  'function decLoop(now, dt) {\n  _decT0 = Date.now();\n' + LOOP.replace('  const _decOne = (pid, _sL) => { do {', '  const _decOne = (pid, _sL) => { SEEN.push(pid); do {') + '  return _stopAt;\n}\n'];   // 하네스 계측: 고리가 짚은 pid 차례
const SRC0 = PARTS.join('\n');
{ let SSOK = true; try { const S = loadSS(SSRC0, {}); SSOK = typeof S.OrdSet === 'function' && typeof S.newPlayers === 'function' && 'WORK_ON' in S; } catch (e) { SSOK = false; }
  ok(!MISS.length && SSOK, '존 · stand-skip 글자 — 고리 거울 · 걷는 몸 커널 · 일터 깨움이 있다(옛 코드면 여기서 빨강)', MISS.length ? '없음: ' + MISS.map((x) => x.slice(0, 40)).join(' | ') : (SSOK ? '' : 'stand-skip OrdSet · newPlayers · WORK_ON 없음'));
  if (MISS.length || !SSOK) { console.log(`\n=== T1348 고리 거울 · 걷는 몸 커널 ${pass} 통과 · ${fail} 실패 ===`); process.exit(1); } }
const DAY = 40000, RATIO = 0.7, BS = 32, R = 250;
const phase = (now) => ((now / DAY) % 1 + 1) % 1, fvOf = (now, lon) => { const v = (phase(now) + lon) % 1; return v < 0 ? v + 1 : v; };
const bdayOf = (now, lon) => Math.floor(now / DAY + lon);
const sleepOf = (npc, now) => {
  const fv = fvOf(now, npc.simLonOff), b = bdayOf(now, npc.simLonOff);
  if (!(fv >= RATIO || fv < npc._dOff)) return null;
  if (fv >= RATIO && npc._meal !== b) return null;
  if (npc.behavior !== 'wander' || npc.gatherTarget !== null || !Object.is(npc.targetX, npc.npcBedX) || !Object.is(npc.targetY, npc.npcBedY) || npc._lifeAct !== '취침') return null;
  return { seg: fv >= RATIO ? 1 : 2, dOff: npc._dOff, bday: b, day: Math.floor(now / DAY), vid: 1 };
};
const still = (vid, lon, w95, seg, dOff, bday, day, now) => { const fv = fvOf(now, lon); if (seg === 1 ? !(fv >= RATIO) : !(fv < dOff)) return false; return Math.floor(now / DAY) === day && bdayOf(now, lon) === bday; };
const H = (a, b) => { let h = (a * 2654435761) ^ (b * 1597334677); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
// 생활층 대역의 일터 깨움 판정 — 아래 결정 대역의 일 갈래가 몸 칸 무동작인 조건 그대로(체류 = 1 · 배정 칸으로 가는 중 = 2) · 미끼는 `late`(체류 끝을 늦게 본다)
const farmOf = (late, jobs) => (npc, now) => {   // ★[T1365] 같은 대역을 농부(`t1348Farm`) · 그 밖 일터(`t1365Work`)에 — 결정 대역의 일 갈래는 직업을 안 가린다
  if (!jobs(npc.simJob) || npc._lazy) return 0;
  const f = fvOf(now, npc.simLonOff); if (!(f < RATIO && f >= npc._dOff)) return 0;
  if (npc._jobT && now < npc._jobT + late) return 1;
  const K = npc._farmK; if (!K) return 0;
  if (npc.behavior !== 'wander' || !Object.is(npc.targetX, K[0]) || !Object.is(npc.targetY, K[1]) || npc.gatherTarget !== null || npc._lifeAct !== '경작') return 0;
  if (Math.hypot(npc.x - K[0], npc.y - K[1]) <= 44) return 0;
  return 2;
};
function world(env, src, ssrc, late) {
  const SS = loadSS(ssrc, env), PF = SS.ON, wolves = [];
  const ctx = {
    Math, Object, Number, Infinity, NaN, console, JSON, Set, Map, Array, SS, T1322_PF: PF, T1322_VERIFY: PF && SS.VERIFY, T1337_WAKE: PF && SS.WAKE_ON, T1337_VERIFY: PF && SS.WAKE_ON && SS.WAKE_VERIFY,
    T1348_LOOP: PF && SS.LOOP, T1348_WALK: PF && SS.WALK_ON, T1348_WVERIFY: PF && SS.WALK_ON && SS.WALK_VERIFY, T1348_WORK: PF && SS.WORK_ON, T1348_FVERIFY: PF && SS.WORK_ON && SS.WORK_VERIFY, T1365_WORK: PF && SS.WORK2_ON, T1365_VERIFY: PF && SS.WORK2_ON && SS.WORK2_VERIFY,
    _tick: { n: 0 }, _SEED, BUILDING_SIZE: BS, NPC_FLEE_RANGE: R, mobs: new Map(), wolves,
    qtMobs: { queryCircle: (x, y, r) => wolves.filter((m) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r) },
    zoneGameDay: () => Math.floor(ctx.NOW / DAY), NOW: 0,
    T738_SOA_XY: false, T670_SKIP_IDLE: true, T791_VERIFY: false, SIM_LON_ON: true, T720_LON_DAY: true, T370_PATH_REUSE: false, T1294_ARRIVED_PATH: false, T791_PATH_MIR: true,
    T1241_PROBE: false, _desClk: null, _T1241: false, T1241_DES: false, T689_GC: false, _desStat: {}, _npcCursor: null, _decT0: 0,
    MOVE_SPEED: 64, NPC_WALK_MULT: 1.25, GATHER_RANGE: 40, WORLD: { dayPhaseRatio: RATIO }, resources: new Map(),
    worldPhase: phase, phaseAdd: (a, b) => { const v = (a + b) % 1; return v < 0 ? v + 1 : v; },
    SimVillages: { t1295Wp: () => null, t1295Ph: () => 0, t1295S: () => 1, t1316K: () => 1, t1337Sleep: sleepOf, t1337Still: still, t1348Farm: farmOf(late || 0, (j) => j === 'farmer'), t1365Work: farmOf(late || 0, (j) => !!j && j !== 'farmer') },
    _t316WalkAlways: (npc) => !!npc.simVillageId, isPositionActive: () => true, _t1295Stale: () => 5000, _npcGatherResource: () => {},
    unstuckNpc: (npc, now) => { ctx.UNSTUCK++; npc.path = null; npc.pathIndex = 0; npc._pathFor = null; npc.nextDecisionAt = now + 400; npc.vx = 0; npc.vy = 0; },
    TB: { out: () => ctx.STOPNEXT-- === 1, outAt: () => ctx.STOPNEXT-- === 1, lateBegin: () => {} }, STOPNEXT: 0, T1365_CLOCK: true, Date: { now: () => 0 },   // ★[T1365 ⓒ] 예산 시계 한 번(같은 멈춤 셈)
    DEC: 0, UNSTUCK: 0, PATHQ: 0, SEEN: [],
  };
  ctx.players = SS.newPlayers(); ctx.npcs = SS.newNpcs();
  ctx.__path = (npc) => { ctx.PATHQ++; const P = [], x0 = npc.x, y0 = npc.y, tx = npc.targetX, ty = npc.targetY, k = 5;   // 지금 자리 → 목표 다섯 점(조금 굽은 길)
    for (let j = 1; j <= k; j++) P.push({ x: x0 + (tx - x0) * j / k + (j < k ? ((j * 13) % 7) - 3 : 0), y: y0 + (ty - y0) * j / k + (j < k ? ((j * 7) % 5) - 2 : 0) }); return P; };
  vm.createContext(ctx);
  vm.runInContext(`var _t670PhNow = NaN, _t670Ph = 0;
const _diceNpc = _SEED.makeStream(), _dn = _diceNpc.next;
const _shOf = (o) => (o._sh !== undefined ? o._sh : (o._sh = _SEED.pidHash(o.playerId || o.pid || o.mid || o.id || '')));
function decideNpcBehavior(npc, now) {
  if (now < npc.nextDecisionAt) return;
  DEC++;
  npc._t540DecAt = now;
  _diceNpc.seed(_SEED.seedOf(_shOf(npc), Math.floor(npc.x / BUILDING_SIZE), Math.floor(npc.y / BUILDING_SIZE), zoneGameDay(), _tick.n));
  npc.nextDecisionAt = now + 500 + _dn() * 1000;
  const nearbyMobs = qtMobs.queryCircle(npc.x, npc.y, NPC_FLEE_RANGE);
  let nearestWolf = null, wolfDist = NPC_FLEE_RANGE;
  for (const m of nearbyMobs) { if (m.type !== 'wolf' || m.tameOwner) continue; const d = Math.hypot(m.x - npc.x, m.y - npc.y); if (d < wolfDist) { nearestWolf = m; wolfDist = d; } }
  if (nearestWolf) { npc.behavior = 'flee'; const dx = npc.x - nearestWolf.x, dy = npc.y - nearestWolf.y, dd = Math.hypot(dx, dy) || 1; npc.targetX = npc.x + dx / dd * 200; npc.targetY = npc.y + dy / dd * 200; return; }
  const fv = (worldPhase(now) + npc.simLonOff) % 1, f = fv < 0 ? fv + 1 : fv, b = Math.floor(now / ${DAY} + npc.simLonOff);
  if (f < ${RATIO} && f >= npc._dOff && !npc._lazy) {   // 일(농부 꼴): 체류 → 배정 칸으로 가는 중(목표 · 라벨 같은 값 다시 씀) → 닿으면 체류 → 새 칸
    if (npc._jobT && now < npc._jobT) return;
    const la = (s) => { if (npc._lifeAct !== s) { npc._lifeAct = s; npc._lifeActAt = now; } };
    if (npc._farmK) { const K = npc._farmK; npc.behavior = 'wander'; npc.targetX = K[0]; npc.targetY = K[1]; npc.gatherTarget = null; la('경작');
      if (Math.hypot(npc.x - K[0], npc.y - K[1]) <= 44) { npc._farmK = null; npc._jobT = now + 1500 + (npc._i % 5) * 400; la('일'); } return; }
    const far = (Math.floor(f * 6) % 2) ? 0 : 1; npc._farmK = [npc.workX + far * 520 + Math.floor(_dn() * 3) * 4, npc.workY + far * 140];
    npc.behavior = 'wander'; npc.gatherTarget = null; npc.targetX = npc._farmK[0]; npc.targetY = npc._farmK[1]; la('경작'); return; }
  if (f >= ${RATIO} && npc._meal !== b) { npc._meal = b; if (npc._lifeAct !== '식사') { npc._lifeAct = '식사'; npc._lifeActAt = now; } return; }
  npc.behavior = 'wander'; npc.gatherTarget = null; npc.targetX = npc.npcBedX; npc.targetY = npc.npcBedY;
  if (npc._lifeAct !== '취침') { npc._lifeAct = '취침'; npc._lifeActAt = now; }
}
` + src + `
`, ctx);
  return ctx;
}
const mkBody = (i) => { const bx = 1000 + (i % 40) * 64, by = 1000 + Math.floor(i / 40) * 64;
  return { pid: 'n' + i, _i: i, x: bx, y: by, vx: 0, vy: 0, isNpc: true, hp: 100, canadiaVillage: undefined, nextDecisionAt: 0, _t540StepAt: undefined, _t540DecAt: undefined, simEvacUntil: undefined,
    simLonOff: (i % 9) * 0.02 - 0.08, behavior: 'wander', canadiaTask: undefined, targetX: bx, targetY: by, path: undefined, pathIndex: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined,
    _stuckPos: undefined, _stuckN: undefined, _t670TkX: undefined, _t670TkY: undefined, _t670Tk: undefined, _pathFor: undefined, _pathAt: undefined, _huntSpd: undefined, _huntOn: undefined, gatherTarget: undefined, harvestTarget: undefined,
    npcHomeX: bx, npcHomeY: by, npcBedX: bx, npcBedY: by, _t720: undefined, simVillageId: 1, simJob: i % 23 === 0 ? 'hunter' : i % 7 === 3 ? 'fisher' : 'farmer', floor: 0, onStairId: undefined, inventory: {}, _sh: undefined,
    _farmK: undefined, _jobT: undefined, _dOff: 0.02 + (i % 7) * 0.01, workX: bx + 60, workY: by + 20, _meal: undefined, _lifeAct: undefined, _lifeActAt: undefined, _lazy: i % 6 === 0 }; };
const STAMP = new Set(['_t540StepAt', '_pathAt', '_stuckPos', 'nextDecisionAt', '_t540DecAt', '_sh', 'pathIndex']);
function same(a, b, all) {
  if (!a !== !b) return 'body';
  for (const k of Object.keys(a)) {
    if (!all && STAMP.has(k)) continue;
    const x = a[k], y = b[k];
    if (k === '_stuckPos') { if (!x !== !y || (x && (!Object.is(x.x, y.x) || !Object.is(x.y, y.y) || !Object.is(x.at, y.at)))) return k; continue; }
    if (k === 'path') { if (!x !== !y || (x && JSON.stringify(x) !== JSON.stringify(y))) return k; continue; }
    if (k === '_t791P' || k === 'inventory' || k === '_t720') continue;
    if (k === '_farmK') { if (!x !== !y || (x && (x[0] !== y[0] || x[1] !== y[1]))) return k; continue; }
    if (!Object.is(x, y)) return k;
  }
  return null;
}
// 한 판 — 두 벌(끔 · 켬)에 같은 차례로 같은 사건
function run(envA, envB, srcB, ssrcB, N, T, useStops, late) {
  const A = world(envA, SRC0, SSRC0), B = world(envB, srcB, ssrcB, late);
  const bodies = [new Map(), new Map()];
  const born = (w, W, i) => { const p = mkBody(i); bodies[w].set(p.pid, p); if (W.T1322_PF) W.SS.install(p); W.players.set(p.pid, p); W.npcs.add(p.pid); return p; };
  for (const [w, W] of [[0, A], [1, B]]) for (let i = 0; i < N; i++) born(w, W, i);
  for (const W of [A, B]) for (let k = 0; k < 6; k++) W.wolves.push({ type: 'wolf', tameOwner: null, x: 800 + k * 400, y: 900, hp: 50 });
  let now = 0, diffTick = 0, diffFull = 0, diffSeen = 0, firstDiff = null, stops = 0; const dt = 0.05, dead = [];
  for (let t = 0; t < T; t++) {
    now += 50;
    // 사건(틱 머리 · 두 벌 같은 차례): 죽음(players · npcs 뺌) · 되살림(같은 몸) · 같은 pid 새 몸 · players 에 다른 몸 · 예산 멈춤
    const ev = [];
    if (t % 3 === 1) ev.push(['die', 'n' + Math.floor(H(t, 1) * N)]);
    if (t % 4 === 2 && dead.length) ev.push(['back', dead[Math.floor(H(t, 2) * dead.length)]]);
    if (t % 97 === 41) ev.push(['reborn', Math.floor(H(t, 3) * N)]);
    if (t % 53 === 17) ev.push(['swap', 'n' + Math.floor(H(t, 4) * N)]);
    if (t % 53 === 18) ev.push(['unswap']);
    const stopAt = useStops && H(t, 5) < 0.15 ? 1 + Math.floor(H(t, 6) * N * 0.3) : 0;   // 예산 멈춤(같은 첫 거름 판끼리만 — 건넌 몸은 예산 시계를 안 묻는다)
    let swapped = null;
    for (const [w, W] of [[0, A], [1, B]]) {
      W.NOW = now; W._tick.n++; W.SEEN.length = 0;
      for (const e of ev) {
        if (e[0] === 'die') { const p = bodies[w].get(e[1]); if (p && W.players.get(e[1]) === p) { W.players.delete(e[1]); W.npcs.delete(e[1]); if (w === 1) dead.push(e[1]); } }
        else if (e[0] === 'back') { const p = bodies[w].get(e[1]); if (p && !W.players.has(e[1])) { W.players.set(e[1], p); W.npcs.add(e[1]); } }
        else if (e[0] === 'reborn') { const old = bodies[w].get('n' + e[1]); if (old && W.T1322_PF) W._t1322Touch(old); W.players.delete('n' + e[1]); W.npcs.delete('n' + e[1]); born(w, W, e[1]); }
        else if (e[0] === 'swap') { const p = bodies[w].get(e[1]); if (p && W.players.get(e[1]) === p) { const c = Object.assign({}, p, { _stuckPos: p._stuckPos && Object.assign({}, p._stuckPos) }); W.players.set(e[1], c); if (w === 0) swapped = [e[1], p, c]; W.__swap = [e[1], p, c]; } }
        else if (e[0] === 'unswap') { const S = W.__swap; if (S && W.players.get(S[0]) === S[2]) { W.players.set(S[0], S[1]); } W.__swap = null; }
      }
      W._npcCursor = W._npcCursor === undefined ? null : W._npcCursor;
      W.STOPNEXT = stopAt;
      const sa = W.decLoop(now, dt); if (w === 1 && sa !== null) stops++;
      for (const p of bodies[w].values()) { if (W.players.get(p.pid) !== p) continue;
        const mud = (p._i % 17 === 0) && (Math.floor(t / 90) % 3 === 1);   // 진흙(그 몸은 움직이지 못한다 — 막힘 1.5초)
        if (!mud && (p.vx !== 0 || p.vy !== 0)) { p.x += p.vx * dt; p.y += p.vy * dt; }
        if (H(t, p._i * 7 + 1) < 0.002) { if (W.T1322_PF) W._t1322Touch(p); p.x += (H(t, p._i) - 0.5) * 30; } }
      for (let k = 0; k < W.wolves.length; k++) { const m = W.wolves[k]; m.x += Math.round((H(t, k * 3 + 1) - 0.5) * 60); m.y += Math.round((H(t, k * 3 + 2) - 0.5) * 60 + (t % 400 < 200 ? 6 : -6)); }
      if (t % 131 === 70 && W.T1322_PF) W._t1322FlushAll();
    }
    if (A.SEEN.join() !== B.SEEN.join()) { diffSeen++; if (!firstDiff) { let j = 0; while (A.SEEN[j] === B.SEEN[j]) j++; firstDiff = `차례 t${t} #${j} ${A.SEEN[j]}/${B.SEEN[j]} (${A.SEEN.length}/${B.SEEN.length})`; } }
    if (t % 131 === 70) for (const [pid, p] of bodies[0]) { const k = same(p, bodies[1].get(pid), true); if (k) { diffFull++; if (!firstDiff) firstDiff = `들여다봄 t${t} ${pid} ${k}`; } }
    for (const [pid, p] of bodies[0]) { const k = same(p, bodies[1].get(pid), false); if (k) { diffTick++; if (!firstDiff) firstDiff = `t${t} ${pid} ${k}`; break; } }
  }
  for (const W of [A, B]) if (W.T1322_PF) W._t1322FlushAll();
  for (const [pid, p] of bodies[0]) { const k = same(p, bodies[1].get(pid), true); if (k) { diffFull++; if (!firstDiff) firstDiff = `끝 ${pid} ${k}`; } }
  return { diffTick, diffFull, diffSeen, firstDiff, st: B.SS.stat, decA: A.DEC, decB: B.DEC, unstuck: A.UNSTUCK, stops, npcsB: B.npcs };
}
const T = +(process.env.T1348_T || 1200), N = +(process.env.T1348_N || 1000);
console.log(`\n① 끔 ↔ 켬(고리 거울 + 걷는 몸 커널 + 첫 거름 + 잠 깨움 · 몸 ${N} × 틱 ${T})`);
const OFF = { T1322_PREFILTER: '0' }, LOFF = { T1348_LOOP: '0', T1348_WALK: '0' };
const R0 = run(LOFF, { T1348_WALK: '0' }, SRC0, SSRC0, N, T, true);
ok(R0.diffTick === 0 && R0.diffFull === 0 && R0.diffSeen === 0 && R0.stops > 10 && R0.st.gone > 0 && R0.st.compact > 0, 'ⓐ 고리 거울 끔 ↔ 켬(첫 거름 켠 두 벌 · 예산 멈춤 · 죽음 · 되살림 · 새 몸 · 다른 몸) — 짚은 pid 차례 · 몸 칸 전부 같음 · 멈춤 · gone · 칸 메움이 탔다',
  `틱 ${R0.diffTick} · 전부 ${R0.diffFull} · 차례 ${R0.diffSeen} · 멈춤 ${R0.stops} · gone ${R0.st.gone} · 칸 메움 ${R0.st.compact}${R0.firstDiff ? ' · ' + R0.firstDiff : ''}`);
const R1 = run(OFF, {}, SRC0, SSRC0, N, T, false);
ok(R1.diffTick === 0 && R1.diffFull === 0 && R1.diffSeen === 0, 'ⓑ 전부 끔 ↔ 켬 기본(고리 거울 + 걷는 몸 커널 + 첫 거름 + 잠 깨움) — 몸 칸 전부 같음(틱마다 · 들여다볼 때 · 끝) · 짚은 pid 차례 같음',
  `틱 ${R1.diffTick} · 전부 ${R1.diffFull} · 차례 ${R1.diffSeen}${R1.firstDiff ? ' · ' + R1.firstDiff : ''}`);
const st = R1.st;
ok(st.wstep > 20000 && st.wgrant > 1000 && st.stuck > 0 && st.stale > 0 && st.arrive > 0 && st.gone > 0 && st.dskip > 0 && R1.unstuck > 0,
  'ⓑ 전제 — 걷는 몸 커널이 탔다 · 막힘 · 길 만료 · 끝 점 도착 깨움 · 몸 바뀜(gone) · 잠 깨움이 다 났다',
  `커널 걸음 ${st.wstep} · 표 3 ${st.wgrant} · 막힘 ${st.stuck} · 만료 ${st.stale} · 도착 ${st.arrive} · gone ${st.gone} · 잠 건넘 ${st.dskip} · 칸 메움 ${st.compact}`);
ok(st.xskip > 1000 && st.xk1 > 0 && st.xk2 > 0, 'ⓒ ★[T1365] 그 밖 일터(사냥꾼 · 어부 대역)도 결정을 건넜다(체류 · 가는 중 둘 다)', `건넌 결정 ${st.xskip}(체류 ${st.xk1} · 가는 중 ${st.xk2})`);
ok(st.fskip > 5000 && st.fk1 > 0 && st.fk2 > 0 && st.fwolf > 0 && st.fstill > 0 && R1.decB < R1.decA, 'ⓒ 전제 — 일터 깨움이 결정을 건넜고(체류 · 가는 중 둘 다) · 늑대 깨움 · 판정 깨움이 났다 · 결정 문 부름이 줄었다',
  `건넌 결정 ${st.fskip}(체류 ${st.fk1} · 가는 중 ${st.fk2}) · 늑대 ${st.fwolf} · 판정 깨움 ${st.fstill} · 결정 끔 ${R1.decA} → 켬 ${R1.decB}`);
console.log('\n② `verify`(첫 거름 · 걷는 몸)');
const R2 = run(OFF, { T1322_PREFILTER: 'verify', T1348_WALK: 'verify', T1348_WORK: 'verify', T1365_WORK: 'verify' }, SRC0, SSRC0, N, T, false);
ok(R2.diffTick === 0 && R2.diffFull === 0 && R2.diffSeen === 0 && R2.st.wvq > 5000 && R2.st.wcmp === R2.st.wvq && R2.st.wbad === 0 && R2.st.gnbad === 0 && R2.st.vchecks > 0 && R2.st.bad === 0,
  '② 커널이 낼 값 ↔ 진짜 걸음 어긋남 0 · gone 표 ↔ players 술어 어긋남 0 · 끔과 같음',
  `견줌 ${R2.st.wvq}/${R2.st.wcmp} · 어긋남 ${R2.st.wbad} ${JSON.stringify(R2.st.wwhy)} · gone 표 ${R2.st.gnbad} · 첫 거름 견줌 ${R2.st.vchecks} 어긋남 ${R2.st.bad} · 몸 칸 ${R2.diffTick}/${R2.diffFull}`);
ok(R2.st.xvq > 500 && R2.st.xcmp === R2.st.xvq && R2.st.xbad === 0 && R2.st.fjob.hunter && R2.st.fjob.fisher && R2.st.fjob.hunter[2] > 0 && R2.st.fjob.fisher[2] > 0 && !R2.st.fjob.hunter[3] && !R2.st.fjob.fisher[3],
  '② ★[T1365] 그 밖 일터 `verify` — 견줌 어긋남 0 · 직업마다 덮음 셈이 섰다', `견줌 ${R2.st.xvq}/${R2.st.xcmp} · 어긋남 ${R2.st.xbad} ${JSON.stringify(R2.st.xwhy)} · 덮음 ${JSON.stringify(R2.st.fjob)}`);
ok(R2.st.fvq > 3000 && R2.st.fcmp === R2.st.fvq && R2.st.fbad === 0, '② 일터 깨움 `verify` — 건너려던 결정을 실제로 돌려 견줌 어긋남 0', `견줌 ${R2.st.fvq}/${R2.st.fcmp} · 어긋남 ${R2.st.fbad} ${JSON.stringify(R2.st.fwhy)} ${R2.st.fex.join(' ')}`);
console.log('\n③ OrdSet ↔ Set(무작위 · 순회 중 넣고 빼기 · 칸 메움)');
function ordCheck(ssrc) {
  const SS = loadSS(ssrc, {}); let bad = 0, first = null, a = 7; const rnd = () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let trial = 0; trial < 2000; trial++) {
    const SA = new Set(), SB = new SS.OrdSet();
    for (let k = 0; k < 60; k++) { const pid = 'p' + Math.floor(rnd() * 30); if (rnd() < 0.6) { SA.add(pid); SB.add(pid); } else { SA.delete(pid); SB.delete(pid); } }
    if (rnd() < 0.3) SB.compact(true);
    const va = [], vb = [], muts = []; for (let k = 0; k < 10; k++) muts.push([Math.floor(rnd() * 40), 'p' + Math.floor(rnd() * 35), rnd() < 0.5]);
    let i = 0; for (const pid of SA) { va.push(pid); for (const [at, q, add] of muts) if (at === i) add ? SA.add(q) : SA.delete(q); i++; }
    SB.compact(rnd() < 0.5); i = 0; const P = SB.P; for (let j = 0; j < P.length; j++) { const pid = P[j]; if (pid === undefined) continue; vb.push(pid); for (const [at, q, add] of muts) if (at === i) add ? SB.add(q) : SB.delete(q); i++; }
    const m = SB.P.filter((x) => x !== undefined).join();
    if (va.join() !== vb.join() || [...SA].join() !== [...SB].join() || [...SB].join() !== m) { bad++; if (!first) first = `${va.join(' ')} | ${vb.join(' ')}`; }
  }
  return { bad, first, compact: SS.stat.compact };
}
const O1 = ordCheck(SSRC0);
ok(O1.bad === 0 && O1.compact > 100, '③ 2,000 판 — 순회 차례 · 남은 집합 · 거울 = Set 차례(칸 메움 탔다)', `어긋남 ${O1.bad} · 칸 메움 ${O1.compact}${O1.first ? ' · ' + O1.first : ''}`);
console.log('\n④ 미끼(바꾼 자리 정확히 1곳 · 빨강 줄 단언)');
{
  const bA = once(SSRC0, "if (!super.has(pid)) { super.add(pid); this.pos.set(pid, this.P.length); this.P.push(pid); this.S.push(-2); }", "if (!super.has(pid)) { super.add(pid); const o = this.pos.get(pid); if (o !== undefined) { this.P[o] = pid; } else { this.pos.set(pid, this.P.length); this.P.push(pid); this.S.push(-2); } }");
  const bA2 = once(bA, "const i = this.pos.get(pid); this.pos.delete(pid); this.P[i] = undefined;", "const i = this.pos.get(pid); this.P[i] = undefined;");
  const OA = ordCheck(bA2);
  ok(OA.bad > 0, 'ⓐ 거울이 지웠다 다시 넣은 pid 를 옛 자리에 둔 사본 → ③ 이 빨강', `어긋남 ${OA.bad}`);
  const kB = "else if (now - A.SPA[s] > 1500) return 'stuck';";
  const bB = once(SRC0, kB, "else if (now - A.SPA[s] > 1650) return 'stuck';");
  const RB = run(OFF, {}, bB, SSRC0, N, T, false);
  ok(RB.diffTick + RB.diffFull + RB.diffSeen > 0, 'ⓑ 막힘 깨움을 늦게 낸 사본(1,500 → 1,650ms) → ① 이 빨강', `${RB.diffTick}/${RB.diffFull}/${RB.diffSeen}${RB.firstDiff ? ' · ' + RB.firstDiff : ''}`);
  const kC = "const pa = A.PAT[s]; if (pa && now - pa > A.ST[s]) return 'stale';";
  const bC = once(SRC0, kC, "const pa = A.PAT[s]; if (pa && now - pa > A.ST[s] + 300) return 'stale';");
  const RC = run(OFF, {}, bC, SSRC0, N, T, false);
  ok(RC.diffTick + RC.diffFull + RC.diffSeen > 0, 'ⓒ 길 만료 깨움을 늦게 낸 사본(+300ms) → ① 이 빨강', `${RC.diffTick}/${RC.diffFull}/${RC.diffSeen}${RC.firstDiff ? ' · ' + RC.firstDiff : ''}`);
  const RD = run(OFF, {}, SRC0, SSRC0, N, T, false, 250);
  ok(RD.diffTick + RD.diffFull + RD.diffSeen > 0, 'ⓓ 일터 깨움 시각을 늦게 낸 사본(체류 끝 +250ms 까지 거른다) → ① 이 빨강', `${RD.diffTick}/${RD.diffFull}/${RD.diffSeen}${RD.firstDiff ? ' · ' + RD.firstDiff : ''}`);
  const RDV = run(OFF, { T1348_WORK: 'verify', T1365_WORK: 'verify' }, SRC0, SSRC0, N, T, false, 250);
  ok(RDV.st.fbad > 0 && RDV.st.xbad > 0 && RDV.diffTick === 0, 'ⓓ 같은 미끼를 `verify` 로 — 농부 · 그 밖 일터 둘 다 어긋남을 세고 그 몸은 종전 길(몸 칸 같음)', `어긋남 농부 ${RDV.st.fbad} ${JSON.stringify(RDV.st.fwhy)} · 그 밖 ${RDV.st.xbad}`);
  const kE = "  for (const m of near) { if (m.type !== 'wolf' || m.tameOwner) continue; if (Math.hypot(m.x - x, m.y - y) < NPC_FLEE_RANGE) { SS.stat.fwolf++; return false; } }\n";
  const bE = once(SRC0, kE, '');
  const RE = run(OFF, {}, bE, SSRC0, N, T, false);
  ok(RE.diffTick + RE.diffFull + RE.diffSeen > 0, 'ⓔ 일터 깨움이 늑대를 안 보는 사본 → ① 이 빨강', `${RE.diffTick}/${RE.diffFull}/${RE.diffSeen}${RE.firstDiff ? ' · ' + RE.firstDiff : ''}`);
}
console.log('\n⑤ 글자');
{
  const ds = fn(Z, 'function detectStuck(npc, now) {'), fw = fn(Z, 'function followNpcPath(npc, speedMult) {'), kw = fn(Z, 'function _t1348Walk(s, now, vq) {'), st0 = fn(Z, 'function npcStep(npc, dt, now) {');
  ok(ds.includes('if (_t671Gt(npc.x - npc._stuckPos.x, npc.y - npc._stuckPos.y, 5)) {') && ds.includes('if (now - npc._stuckPos.at > 1500) {') && kw.includes('if (_t671Gt(x - A.SPX[s], y - A.SPY[s], 5)) mv = true;') && kw.includes("else if (now - A.SPA[s] > 1500) return 'stuck';"),
    '막힘 — `detectStuck` 의 5px · 1,500ms 그 식');
  ok(fw.includes('if (_t671Lt(dx, dy, 10)) {') && fw.includes('npc.vx = (dx / dd) * speed;') && fw.includes('const speed = MOVE_SPEED * (speedMult || NPC_WALK_MULT);') && kw.includes('if (_t671Lt(dx, dy, 10))') && kw.includes('vx = (dx / dd) * v; vy = (dy / dd) * v;')
    && fn(Z, 'function _t1348Grant(npc, s, now, nda) {').includes('A.SPD[s] = MOVE_SPEED * (sm || NPC_WALK_MULT);'), '따라가기 — `followNpcPath` 의 10px · 속도 식(빠르기 곱 그대로)');
  ok(st0.includes("let speedMult = npc.behavior === 'flee' ? 2.5 : NPC_WALK_MULT;") && st0.includes('(npc._pathAt && now - npc._pathAt > _t1295Stale(npc))'), '걸음 문 — 빠르기 · 길 만료 식이 표가 베낀 그 글자');
  const S0 = loadSS(SSRC0, {}), S1 = loadSS(SSRC0, { T1348_LOOP: '0', T1348_WALK: '0' }), S2 = loadSS(SSRC0, { T1348_WALK: 'verify' }), S3 = loadSS(SSRC0, { T1322_PREFILTER: '0' });
  ok(S0.LOOP && S0.WALK_ON && !S0.WALK_VERIFY && !S1.LOOP && !S1.WALK_ON && S2.WALK_ON && S2.WALK_VERIFY && !S3.LOOP && !S3.WALK_ON && !(S1.newNpcs() instanceof S1.OrdSet) && (S0.newNpcs() instanceof S0.OrdSet),
    '손잡이 — `T1348_LOOP` · `T1348_WALK` 켬 기본 · `\'0\'` 끔(종전 Set · Map) · `verify` · 첫 거름 끔이면 무동작');
}
console.log(`\n=== T1348 고리 거울 · 걷는 몸 커널 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
