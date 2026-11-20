#!/usr/bin/env node
'use strict';
const LB = require('./lib-bait');   // [T1383] 미끼 사본을 지으며 바꾼 자리를 센다
// @regress
// @bait 2   ← [T1383] 옛 미끼 표지 — 미끼 판정 줄에 바꾼 자리 수(뜻 그대로)
// === scripts/test-t1337-wake.js — 잠 깨움 표(T1337 · 결정 문까지 건넌다) = 종전 결정 문 ===
//   존 글자(`npcStep` 전체 · 막힘 · 따라가기 · 한 점 길 · 거울 · `_t1322*` · `_t1337*`)를 떠서 샌드박스 두 벌(끔 · 켬)에 넣는다.
//   결정 문은 대역이다 — 머리는 존 글자 그대로(씨 `(신원 · 셀 · 게임일 · 틱)` · 결정 시각 · 판 시계 배율 · 늑대 질의)이고 생활층은 취침 갈래 꼴(깨어 일 · 저녁 끼니 · 귀가 · 잠)이다.
//   생활층 잠 깨움 판정(`t1337Sleep` · `t1337Still`)도 그 대역의 무동작 조건을 그대로 따른다(생활층 글자 자체의 견줌은 서버 `verify` 판 몫 — `test-t1322-verify-night`).
//   ① 몸 1,000 × 틱 1,000(하루 1.25 바퀴 · 늑대 · 밀기 · 체력) — 끔 ↔ 켬 몸 칸 전부 같음(틱마다 도장 뺌 · 들여다볼 때 · 끝) · 결정 문 부름이 줄었다(자명 통과 아님)
//   ② 켬 `verify` — 건너려던 결정을 실제로 돌려 견줌 어긋남 0
//   ③ 미끼 — ⓐ 늑대가 반경에 들어도 안 깨우는 사본(존 `_t1337Dec` 글자에서 늑대 고리를 뺌) · ⓑ 끼니 때를 넘겨 거르는 사본(잠 판정이 끼니를 안 봄) — 둘 다 빨강
//   ④ 글자 — 존 `_t1337Dec` 의 씨 · 결정 시각 · 늑대 식이 결정 문 머리 글자와 같은 꼴 · 생활층 `t1337Sleep` 이 `npcLifeTick` 취침 갈래의 끼니 · 곳간 · 짐 줄을 그대로 본다 · 손잡이
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8'), V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
const SSRC = fs.readFileSync(path.join(ROOT, 'server', 'stand-skip.js'), 'utf8');
const _SEED = require(path.join(ROOT, 'server', 'seed-rand.js'));
const fn = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error(head); const j = src.indexOf('\n}\n', i); return src.slice(i, j + 3); };
const line = (src, head) => { const i = src.indexOf(head); if (i < 0) throw new Error(head); return src.slice(i, src.indexOf('\n', i) + 1); };
let fCmp = fn(Z, 'function computeNpcPath(npc, now) {');
fCmp = fCmp.slice(0, fCmp.indexOf('  const isVil')) + '  return [{ x: npc.targetX + 3, y: npc.targetY - 2 }, { x: npc.targetX, y: npc.targetY }];\n}\n';
const T37 = [line(Z, 'const _t1337Dice = '), line(Z, 'let _t1337Pend = null;'), fn(Z, 'function _t1337Grant(npc, s, now) {'), fn(Z, 'function _t1337Dec(s, now) {'), line(Z, 'const _T1337_ST = '), line(Z, 'function _t1337Snap(p)'), fn(Z, 'function _t1337Cmp(npc) {')];
const PARTS = [line(Z, 'function _t671Lt('), line(Z, 'function _t671Gt('), line(Z, 'function _t670Stuck(npc, now)'), fn(Z, 'function detectStuck(npc, now) {'), fn(Z, 'function followNpcPath(npc, speedMult) {'),
  fn(Z, 'function _t791Mir(npc) {'), fCmp, fn(Z, 'function npcStep(npc, dt, now) {'),
  fn(Z, 'function _t1322State(npc) {'), fn(Z, 'function _t1322Grant(npc, now, s0) {'), fn(Z, 'function _t1322Wake(s) {'), line(Z, 'function _t1322Touch(p)'), line(Z, 'function _t1322FlushAll()'),
  line(Z, 'let _t1322PhNow = NaN'), fn(Z, 'function _t1322Dusk(s, now) {'), fn(Z, 'function _t1322Skip(s, pid, now) {'), fn(Z, 'function _t1322Check(npc, s, now) {'), ...T37];
const SRC0 = PARTS.join('\n');
const DAY = 40000, RATIO = 0.7, EPOCH = 0, BS = 32, R = 250;
const loadSS = (pf, wk) => { const m = { exports: {} }; vm.runInThisContext('(function (module, exports, require, process) {' + SSRC + '\n})')(m, m.exports, require, { env: { T1322_PREFILTER: pf, T1337_WAKE: wk } }); return m.exports; };
const phase = (now) => ((now / DAY) % 1 + 1) % 1, fvOf = (now, lon) => { const v = (phase(now) + lon) % 1; return v < 0 ? v + 1 : v; };
const bdayOf = (now, lon) => Math.floor(now / DAY + lon);
// 생활층 대역의 잠 깨움 판정 — 아래 `life` 의 취침 갈래가 몸 칸 무동작인 조건 그대로(미끼 ⓑ = 끼니를 안 본다)
const sleepOf = (noMeal) => (npc, now) => {
  const fv = fvOf(now, npc.simLonOff), b = bdayOf(now, npc.simLonOff);
  if (!(fv >= RATIO || fv < npc._dOff)) return null;
  if (!noMeal && fv >= RATIO && npc._meal !== b) return null;
  if (npc.behavior !== 'wander' || npc.gatherTarget !== null || !Object.is(npc.targetX, npc.npcBedX) || !Object.is(npc.targetY, npc.npcBedY) || npc._lifeAct !== '취침') return null;
  return { seg: fv >= RATIO ? 1 : 2, dOff: npc._dOff, bday: b, day: Math.floor(now / DAY), vid: 1 };
};
const still = (vid, lon, w95, seg, dOff, bday, day, now) => { const fv = fvOf(now, lon); if (seg === 1 ? !(fv >= RATIO) : !(fv < dOff)) return false; return Math.floor(now / DAY) === day && bdayOf(now, lon) === bday; };
function world(pf, wk, src, noMeal) {
  const SS = loadSS(pf, wk), PF = SS.ON, wolves = [];
  const ctx = {
    Math, Object, Number, Infinity, NaN, console, JSON, Set, Map, Array, SS, T1322_PF: PF, T1322_VERIFY: PF && SS.VERIFY, T1337_WAKE: PF && SS.WAKE_ON, T1337_VERIFY: PF && SS.WAKE_ON && SS.WAKE_VERIFY, T1348_LOOP: false, T1348_WALK: false, T1348_WVERIFY: false, T1348_WORK: false, T1365_WORK: false,   // ★[T1348] 고리 거울 · 걷는 몸 · 일터 깨움은 `test-t1348-loop`
    players: new Map(), _tick: { n: 0 }, _SEED, BUILDING_SIZE: BS, NPC_FLEE_RANGE: R, mobs: new Map(), wolves,
    qtMobs: { queryCircle: (x, y, r) => wolves.filter((m) => Math.abs(m.x - x) <= r && Math.abs(m.y - y) <= r) },
    zoneGameDay: () => Math.floor(ctx.NOW / DAY), NOW: 0,
    T738_SOA_XY: false, T670_SKIP_IDLE: true, T791_VERIFY: false, SIM_LON_ON: true, T720_LON_DAY: true, T370_PATH_REUSE: false, T1294_ARRIVED_PATH: false, T791_PATH_MIR: true,
    MOVE_SPEED: 64, NPC_WALK_MULT: 1, GATHER_RANGE: 40, WORLD: { dayPhaseRatio: RATIO }, resources: new Map(),
    worldPhase: phase, phaseAdd: (a, b) => { const v = (a + b) % 1; return v < 0 ? v + 1 : v; },
    SimVillages: { t1295Wp: () => null, t1295Ph: () => 0, t1295S: (npc) => (npc._w95 ? 1.25 : 1), t1337Sleep: sleepOf(noMeal), t1337Still: still },
    _t316WalkAlways: (npc) => !!npc.simVillageId, isPositionActive: () => true, _t1295Stale: () => 5000, _npcGatherResource: () => {},
    unstuckNpc: (npc, now) => { npc.path = null; npc.pathIndex = 0; npc._pathFor = null; npc.nextDecisionAt = now + 400; npc.vx = 0; npc.vy = 0; },
    DEC: 0, MEAL: 0, FLEE: 0, CMP: 0,
  };
  vm.createContext(ctx);
  // 결정 문 대역 — 머리는 존 `decideNpcBehavior` 글자 꼴 그대로(씨 · 결정 시각 · 판 시계 · 늑대) · 생활층 = 깨어 일 / 저녁 끼니 / 귀가 · 잠
  vm.runInContext(`var _t670PhNow = NaN, _t670Ph = 0;
const _diceNpc = _SEED.makeStream(), _dn = _diceNpc.next;
const _shOf = (o) => (o._sh !== undefined ? o._sh : (o._sh = _SEED.pidHash(o.playerId || o.pid || o.mid || o.id || '')));
function decideNpcBehavior(npc, now) {
  if (now < npc.nextDecisionAt) return;
  DEC++;
  npc._t540DecAt = now;
  _diceNpc.seed(_SEED.seedOf(_shOf(npc), Math.floor(npc.x / BUILDING_SIZE), Math.floor(npc.y / BUILDING_SIZE), zoneGameDay(), _tick.n));
  npc.nextDecisionAt = now + 500 + _dn() * 1000;
  if (npc.simVillageId && SimVillages.t1295S) { const _s = SimVillages.t1295S(npc); if (_s > 1) npc.nextDecisionAt = now + (npc.nextDecisionAt - now) / _s; }
  const nearbyMobs = qtMobs.queryCircle(npc.x, npc.y, NPC_FLEE_RANGE);
  let nearestWolf = null, wolfDist = NPC_FLEE_RANGE;
  for (const m of nearbyMobs) { if (m.type !== 'wolf' || m.tameOwner) continue; const d = Math.hypot(m.x - npc.x, m.y - npc.y); if (d < wolfDist) { nearestWolf = m; wolfDist = d; } }
  if (nearestWolf) { FLEE++; npc.behavior = 'flee'; const dx = npc.x - nearestWolf.x, dy = npc.y - nearestWolf.y, dd = Math.hypot(dx, dy) || 1; npc.targetX = npc.x + dx / dd * 200; npc.targetY = npc.y + dy / dd * 200; return; }
  const fv = (worldPhase(now) + npc.simLonOff) % 1, f = fv < 0 ? fv + 1 : fv, b = Math.floor(now / ${DAY} + npc.simLonOff);
  if (f < ${RATIO} && f >= npc._dOff && !npc._lazy) { npc.behavior = 'wander'; npc.gatherTarget = null; npc.targetX = npc.workX + Math.floor(_dn() * 3) * 4; npc.targetY = npc.workY; if (npc._lifeAct !== '일') { npc._lifeAct = '일'; npc._lifeActAt = now; } return; }
  if (f >= ${RATIO} && npc._meal !== b) { MEAL++; npc._meal = b; if (npc._lifeAct !== '식사') { npc._lifeAct = '식사'; npc._lifeActAt = now; } return; }
  npc.behavior = 'wander'; npc.gatherTarget = null; npc.targetX = npc.npcBedX; npc.targetY = npc.npcBedY;
  if (npc._lifeAct !== '취침') { npc._lifeAct = '취침'; npc._lifeActAt = now; }
}
` + src + '\nfunction __cmpIf(p) { if (_t1337Pend && _t1337Pend.p === p) { CMP++; _t1337Cmp(p); } }\n', ctx);
  return ctx;
}
const H = (a, b) => { let h = (a * 2654435761) ^ (b * 1597334677); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const mkBody = (i) => { const bx = 1000 + (i % 40) * 64, by = 1000 + Math.floor(i / 40) * 64;
  return { pid: 'n' + i, _i: i, x: bx, y: by, vx: 0, vy: 0, isNpc: true, hp: 100, canadiaVillage: undefined, nextDecisionAt: 0, _t540StepAt: undefined, _t540DecAt: undefined, simEvacUntil: undefined,
    simLonOff: (i % 9) * 0.02 - 0.08, behavior: 'wander', canadiaTask: undefined, targetX: bx, targetY: by, path: undefined, pathIndex: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined,
    _stuckPos: undefined, _stuckN: undefined, _t670TkX: undefined, _t670TkY: undefined, _t670Tk: undefined, _pathFor: undefined, _pathAt: undefined, _huntSpd: undefined, gatherTarget: undefined, harvestTarget: undefined,
    npcHomeX: bx, npcHomeY: by, npcBedX: bx, npcBedY: by, _t720: undefined, simVillageId: 1, floor: 0, onStairId: undefined, _w95: i % 5 === 0, inventory: {}, _sh: undefined,
    _dOff: 0.02 + (i % 7) * 0.01, workX: bx + 30, workY: by, _meal: undefined, _lifeAct: undefined, _lifeActAt: undefined, _lazy: i % 6 === 0 }; };   // 게으른 몸 = 낮에도 집에 누워 있다(해 질 녘에 끼니 전 침대)
const STAMP = new Set(['_t540StepAt', '_pathAt', '_stuckPos', 'nextDecisionAt', '_t540DecAt', '_sh']);
function same(a, b, all) {
  for (const k of Object.keys(a)) {
    if (!all && STAMP.has(k)) continue;
    const x = a[k], y = b[k];
    if (k === '_stuckPos') { if (!x !== !y || (x && (!Object.is(x.x, y.x) || !Object.is(x.y, y.y) || !Object.is(x.at, y.at)))) return k; continue; }
    if (k === 'path') { if (!x !== !y || (x && JSON.stringify(x) !== JSON.stringify(y))) return k; continue; }
    if (k === '_t791P' || k === 'inventory' || k === '_t720') continue;
    if (!Object.is(x, y)) return k;
  }
  return null;
}
function run(srcB, pfB, wkB, N, T, opt) {
  const A = world('0', '0', SRC0, false), B = world(pfB, wkB, srcB, !!opt.noMeal);
  const bodies = [[], []], npcs = [];
  for (const [w, W] of [[0, A], [1, B]]) for (let i = 0; i < N; i++) { const p = mkBody(i); bodies[w].push(p); W.players.set(p.pid, p); if (W.T1322_PF) W.SS.install(p); }
  for (let i = 0; i < N; i++) npcs.push('n' + i);
  for (const W of [A, B]) for (let k = 0; k < 6; k++) W.wolves.push({ type: 'wolf', tameOwner: null, x: 800 + k * 400, y: 900, hp: 50 });
  let now = 0, diffTick = 0, diffFull = 0, firstDiff = null; const dt = 0.05;
  for (let t = 0; t < T; t++) {
    now += 50;
    for (const [w, W] of [[0, A], [1, B]]) {
      W.NOW = now; W._tick.n++;
      for (const pid of npcs) {
        if (W.T1322_PF) { const s = W.SS.slot(pid); if (s >= 0 && W._t1322Skip(s, pid, now)) continue; }
        const p = W.players.get(pid);
        if (!p || !(p.hp > 0)) continue;
        W.npcStep(p, dt, now);
        W.__cmpIf(p);   // 존 `_decOne` 그 줄(`let _t1337Pend` 는 샌드박스 전역 칸이 아니라 함수로 묻는다)
        if (W.T1322_PF) W._t1322Grant(p, now);
      }
      for (let i = 0; i < N; i++) { const p = bodies[w][i]; if (p.vx !== 0 || p.vy !== 0) { p.x += p.vx * dt; p.y += p.vy * dt; }
        const e = H(t, i * 7 + 1); if (e < 0.002) { if (W.T1322_PF) W._t1322Touch(p); p.x += (H(t, i) - 0.5) * 30; } }
      for (let k = 0; k < W.wolves.length; k++) { const m = W.wolves[k]; m.x += Math.round((H(t, k * 3 + 1) - 0.5) * 60); m.y += Math.round((H(t, k * 3 + 2) - 0.5) * 60 + (t % 400 < 200 ? 6 : -6)); }   // 늑대 걸음(마을 위로 오르내린다)
      if (t % 131 === 70 && W.T1322_PF) W._t1322FlushAll();
    }
    if (t % 131 === 70) for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], true); if (k) { diffFull++; if (!firstDiff) firstDiff = `들여다봄 t${t} n${i} ${k}`; } }
    for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], false); if (k) { diffTick++; if (!firstDiff) firstDiff = `t${t} n${i} ${k}`; break; } }
  }
  if (B.T1322_PF) B._t1322FlushAll();
  for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], true); if (k) { diffFull++; if (!firstDiff) firstDiff = `끝 n${i} ${k}`; } }
  return { diffTick, diffFull, firstDiff, st: B.SS.stat, decA: A.DEC, decB: B.DEC, meal: A.MEAL, flee: A.FLEE, cmp: B.CMP };
}
console.log('\n① 끔 ↔ 켬(첫 거름 + 잠 깨움 · 몸 1,000 × 틱 1,000 · 하루 1.25 바퀴)');
const R1 = run(SRC0, '', '1', 1000, 1000, {});
ok(R1.diffTick === 0 && R1.diffFull === 0, '① 몸 칸 전부 같음(틱마다 도장 뺌 · 들여다볼 때 · 끝 도장까지)', `틱 ${R1.diffTick} · 전부 ${R1.diffFull}${R1.firstDiff ? ' · ' + R1.firstDiff : ''}`);
ok(R1.st.dskip > 5000 && R1.decB < R1.decA && R1.st.dwolf > 0 && R1.st.dstill > 0 && R1.meal > 0 && R1.flee > 0, '① 전제 — 결정을 건넜고(결정 문 부름이 줄었다) · 늑대 깨움 · 창/날 깨움 · 끼니 · 도주가 다 탔다',
  `건넌 결정 ${R1.st.dskip} · 결정 끔 ${R1.decA} → 켬 ${R1.decB} · 늑대 깨움 ${R1.st.dwolf} · 판정 깨움 ${R1.st.dstill} · 미룬 결정 도장 ${R1.st.dstamp} · 끼니 ${R1.meal} · 도주 ${R1.flee}`);
console.log('\n② 켬 `verify`');
const R2 = run(SRC0, '', 'verify', 1000, 1000, {});
ok(R2.diffTick === 0 && R2.diffFull === 0 && R2.st.dvq > 1000 && R2.cmp === R2.st.dvq && R2.st.dcmp === R2.st.dvq && R2.st.dbad === 0, '② 건너려던 결정을 실제로 돌려 견줌 — 결정 시각 · 몸 칸 어긋남 0 · 끔과 같음', `견줌 ${R2.st.dvq}(실제로 돌린 뒤 견줌 ${R2.cmp}) · 어긋남 ${R2.st.dbad} ${JSON.stringify(R2.st.dwhy)} · 몸 칸 ${R2.diffTick}/${R2.diffFull}`);
console.log('\n③ 미끼');
{
  const a = "  for (const m of near) { if (m.type !== 'wolf' || m.tameOwner) continue; if (Math.hypot(m.x - x, m.y - y) < NPC_FLEE_RANGE) { SS.stat.dwolf++; return false; } }\n";
  const BA = LB.swap(SRC0, a, ''), bait = BA.src;
  ok(bait !== SRC0, 'ⓐ 늑대가 반경에 들어도 안 깨우는 사본을 지었다');
  const RA = run(bait, '', '1', 1000, 1000, {});
  ok(BA.n === 1 && (RA.diffTick > 0 || RA.diffFull > 0), 'ⓐ [미끼] ① 이 문다(빨강)', `바꾼 자리 ${BA.n} · ${RA.diffTick}/${RA.diffFull}${RA.firstDiff ? ' · ' + RA.firstDiff : ''}`);
  const RB = run(SRC0, '', '1', 1000, 1000, { noMeal: true }), nB = LB.count(LB.self(__filename), '!noMeal ' + '&& fv');   // 판 갈래 미끼 — 잠 판정이 끼니를 보는 한 자리
  ok(nB === 1 && (RB.diffTick > 0 || RB.diffFull > 0), 'ⓑ [미끼] 끼니 때를 넘겨 거르는 사본(잠 판정이 끼니를 안 봄) — ① 이 문다(빨강)', `바꾼 자리 ${nB} · ${RB.diffTick}/${RB.diffFull}${RB.firstDiff ? ' · ' + RB.firstDiff : ''}`);
  const RV = run(SRC0, '', 'verify', 1000, 1000, { noMeal: true });
  ok(RV.st.dbad > 0 && RV.diffTick === 0, 'ⓑ 같은 미끼를 `verify` 로 — 어긋남을 세고 그 몸은 종전 길(몸 칸 같음)', `어긋남 ${RV.st.dbad} ${JSON.stringify(RV.st.dwhy)}`);
}
console.log('\n④ 글자');
{
  const dec = fn(Z, 'function decideNpcBehavior(npc, now) {'), d37 = fn(Z, 'function _t1337Dec(s, now) {');
  ok(dec.includes('_diceNpc.seed(_SEED.seedOf(_shOf(npc), Math.floor(npc.x / BUILDING_SIZE), Math.floor(npc.y / BUILDING_SIZE), zoneGameDay(), _tick.n));') && dec.includes('npc.nextDecisionAt = now + 500 + _dn() * 1000;')
    && dec.includes('if (_s > 1) npc.nextDecisionAt = now + (npc.nextDecisionAt - now) / _s;') && d37.includes('_t1337Dice.seed(_SEED.seedOf(A.SH[s], A.CX[s], A.CY[s], zoneGameDay(), _tick.n));')
    && d37.includes('let nda = now + 500 + _t1337Dice.next() * 1000;') && d37.includes('if (sc > 1) nda = now + (nda - now) / sc;'), '결정 시각 — 결정 문 머리(씨 · 500 + u × 1,000 · 판 시계 배율)와 같은 식');
  ok(dec.includes('const nearbyMobs = qtMobs ? qtMobs.queryCircle(npc.x, npc.y, NPC_FLEE_RANGE) : Array.from(mobs.values());') && dec.includes("if (m.type !== 'wolf' || m.tameOwner) continue;")
    && d37.includes('qtMobs ? qtMobs.queryCircle(x, y, NPC_FLEE_RANGE) : Array.from(mobs.values())'), '늑대 — 결정 문 ① 그 질의 · 그 거름');
  const lt = fn(V, 'function npcLifeTick(npc, now) {'), sl = fn(V, 'function t1337Sleep(npc, now) {');
  ok(lt.includes('if (fv >= dayR && npc._t1197M1 !== bday && _t1197On()) {') && sl.includes('if (fv >= dayR && npc._t1197M1 !== bday && _t1197On()) return null;')
    && lt.includes('if (fv >= dayR || fv < npc._dOff) {') && sl.includes('if (!(fv >= dayR || fv < npc._dOff)) return null;')
    && lt.includes('if (_t1181Step(vil,npc,now,') && sl.includes('if (_t1181Task(vil, npc, true)) return null;') && lt.includes('_t720Step(vil, npc, now, fv, dayR, bday,') && sl.includes('_t720Held(vil, npc) > 0) return null;'),
    '생활층 잠 판정 — `npcLifeTick` 취침 갈래의 끼니 · 창 · 짐 일감 · 곳간 정산 줄을 본다');
  const S0 = loadSS('', ''), S1 = loadSS('', '1'), S2 = loadSS('', 'verify'), S3 = loadSS('0', '1'), S4 = loadSS('', '0');
  ok(S0.WAKE_ON && !S0.WAKE_VERIFY && S1.WAKE_ON && !S1.WAKE_VERIFY && S2.WAKE_ON && S2.WAKE_VERIFY && !S4.WAKE_ON && /const T1337_WAKE = T1322_PF && SS\.WAKE_ON/.test(Z), "`T1337_WAKE` — 켬 기본 · `'0'` 끔 · `'verify'` 켬 + 견줌 · 첫 거름 끔이면 무동작");
}
console.log(`\n=== T1337 잠 깨움 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
