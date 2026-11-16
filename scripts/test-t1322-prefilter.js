#!/usr/bin/env node
'use strict';
// @regress
// === scripts/test-t1322-prefilter.js — 서 있는 몸 첫 거름(T1322 · `server/stand-skip.js` · 존 `_t1322*`) = 종전 걸음 문 ===
//   존 글자(`npcStep` 전체 · 막힘 · 따라가기 · 한 점 길 갈래 · 거울 · `_t1322*` 여덟)를 떠서 샌드박스 두 벌(끔 · 켬)에 넣고
//   같은 몸 1,000 × 틱 1,000(결정 · 목표 바뀜 · 침대 · 해 질 녘 · 판 시계 몸 · 밀기 · 체력 · 빠짐/돌아옴 · 관측 들여다보기)을 나란히 돌린다.
//   ① 거른 몸 = 걸음 문을 돌려도 도장 셋(`_t540StepAt` · `_pathAt` · `_stuckPos`)밖에 안 바뀌는 몸 — 건널 때마다 몸 사본에 진짜 걸음 문을 돌려 견줌(전수).
//   ② 끔 ↔ 켬 몸 칸 전부(도장 셋 뺌) 틱마다 같음 · 걸음 문 밖 쓰기(밀기 · 체력 · 대피)는 쓰기 앞에서 표를 내린다 · 들여다볼 때(`_t1322FlushAll`)와 끝에서 도장 셋까지 같음 · 거른 몫이 0 이 아니다(자명 통과 아님).
//   ③ `verify` 판 — 어긋남 0(같은 판을 `verify` 로).
//   ④ 미끼 — ⓐ 결정 시각이 된 몸을 거르는 사본 · ⓑ 몸을 옮기기 전에 표를 안 내리는 쓰기 길 사본 — 둘 다 ①/② 가 문다(빨강).
//   ⑤ 존 배선 글자 — 거름이 `players.get` 앞 · 표가 `npcStep` 뒤 · 밀기/걸음 뒷일/체력 문 앞 · 관측 · 손잡이 끔 = 무동작.
const path = require('path'), fs = require('fs'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) { pass++; console.log('  ✓ ' + m + (d !== undefined ? '  ' + d : '')); } else { fail++; console.log('  ✗ ' + m + (d !== undefined ? '  ' + d : '')); } };
const Z = fs.readFileSync(path.join(ROOT, 'server', 'zone.js'), 'utf8');
const SSRC = fs.readFileSync(path.join(ROOT, 'server', 'stand-skip.js'), 'utf8');
const fn = (head) => { const i = Z.indexOf(head); if (i < 0) throw new Error(head); const j = Z.indexOf('\n}\n', i); return Z.slice(i, j + 3); };
const line = (head) => { const i = Z.indexOf(head); if (i < 0) throw new Error(head); return Z.slice(i, Z.indexOf('\n', i) + 1); };
let fCmp = fn('function computeNpcPath(npc, now) {');
fCmp = fCmp.slice(0, fCmp.indexOf('  const isVil')) + '  return [{ x: npc.targetX + 3, y: npc.targetY - 2 }, { x: npc.targetX, y: npc.targetY }];\n}\n';   // 48px 밖 = 두 점 길(결정적 대역)
const PARTS = [line('function _t671Lt('), line('function _t671Gt('), line('function _t670Stuck(npc, now)'), fn('function detectStuck(npc, now) {'), fn('function followNpcPath(npc, speedMult) {'),
  fn('function _t791Mir(npc) {'), fCmp, fn('function npcStep(npc, dt, now) {'),
  fn('function _t1322State(npc) {'), fn('function _t1322Grant(npc, now) {'), fn('function _t1322Wake(s) {'), line('function _t1322Touch(p)'), line('function _t1322FlushAll()'),
  line('let _t1322PhNow = NaN'), fn('function _t1322Dusk(s, now) {'), fn('function _t1322Skip(s, pid, now) {'), fn('function _t1322Check(npc, s, now) {')];
const SRC0 = PARTS.join('\n');
const DAY = 240000, RATIO = 0.7, EPOCH = 1000;
const loadSS = (mode) => { const m = { exports: {} }; vm.runInThisContext('(function (module, exports, require, process) {' + SSRC + '\n})')(m, m.exports, require, { env: { T1322_PREFILTER: mode } }); return m.exports; };
function world(mode, src) {
  const SS = loadSS(mode), PF = SS.ON;
  const ctx = {
    Math, Object, Number, Infinity, NaN, console, SS, T1322_PF: PF, T1322_VERIFY: PF && SS.VERIFY, T1337_WAKE: false, players: new Map(), _tick: { n: 0 },   // ★[T1337] 잠 깨움(끔 — 그 하네스는 `test-t1337-wake`)
    T738_SOA_XY: false, T670_SKIP_IDLE: true, T791_VERIFY: false, SIM_LON_ON: true, T720_LON_DAY: true, T370_PATH_REUSE: false, T1294_ARRIVED_PATH: false, T791_PATH_MIR: true,
    MOVE_SPEED: 64, NPC_WALK_MULT: 1, GATHER_RANGE: 40, WORLD: { dayPhaseRatio: RATIO }, resources: new Map(),
    worldPhase: (now) => ((now / DAY) % 1 + 1) % 1, phaseAdd: (a, b) => { const v = (a + b) % 1; return v < 0 ? v + 1 : v; },
    SimVillages: { t1295Wp: (npc, now) => (npc._w95 ? (((now - EPOCH) / (DAY * 0.8)) % 1) : null), t1295Ph: (now) => (((now - EPOCH) / (DAY * 0.8)) % 1), t1295S: (npc) => (npc._w95 ? 1.25 : 1) },
    _t316WalkAlways: (npc) => !!npc.simVillageId, isPositionActive: () => true,
    _t1295Stale: () => 5000, _npcGatherResource: (npc, r) => { npc.inventory.wood = (npc.inventory.wood || 0) + 1; r.hp--; },
    unstuckNpc: (npc, now) => { npc.path = null; npc.pathIndex = 0; npc._pathFor = null; npc.nextDecisionAt = now + 400; npc.vx = 0; npc.vy = 0; },
    decideNpcBehavior: null, DEC: 0,
  };
  vm.createContext(ctx);
  vm.runInContext('var _t670PhNow = NaN, _t670Ph = 0;\n' + src, ctx);
  return ctx;
}
// 결정(대역) — 몸 · 시각의 순수 함수(두 벌이 같은 답)
const H = (a, b) => { let h = (a * 2654435761) ^ (b * 1597334677); h = Math.imul(h ^ (h >>> 15), 2246822519); h = Math.imul(h ^ (h >>> 13), 3266489917); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
function decide(npc, now) {
  this.DEC++;
  npc._t540DecAt = now;
  const i = npc._i, k = H(i, Math.floor(now / 97));
  if (k < 0.35) { npc.targetX = npc.npcBedX; npc.targetY = npc.npcBedY; npc.behavior = 'wander'; npc.gatherTarget = null; }      // 침대(표 1)
  else if (k < 0.6) { npc.targetX = npc.x + (H(i, now) - 0.5) * 14; npc.targetY = npc.y + (H(now, i) - 0.5) * 14; npc.behavior = 'wander'; }   // 가까운 목표(곧 선다 — 표 2)
  else if (k < 0.8) { npc.targetX = npc.x + (H(i, now + 1) - 0.5) * 400; npc.targetY = npc.y + (H(now + 1, i) - 0.5) * 400; npc.behavior = 'wander'; }   // 먼 목표(걷는다)
  else if (k < 0.9) { npc.behavior = 'gather'; npc.gatherTarget = H(i, now + 2) < 0.5 ? 'r' + (i % 7) : null; npc.targetX = npc.x + 3; npc.targetY = npc.y; }
  else { npc.behavior = 'wander'; npc.gatherTarget = undefined; }   // 목표 그대로 · `gatherTarget` undefined(밤 갈래가 null 로 쓴다)
  npc.nextDecisionAt = now + 300 + Math.floor(H(i, now + 3) * 6000);
}
const mkBody = (i) => ({ pid: 'n' + i, _i: i, x: 1000 + (i % 40) * 50, y: 1000 + Math.floor(i / 40) * 50, vx: 0, vy: 0, isNpc: true, hp: 100, canadiaVillage: undefined, nextDecisionAt: 0,
  _t540StepAt: undefined, simEvacUntil: i % 97 === 0 ? 5000 : undefined, simLonOff: (i % 9) * 0.03 - 0.1, behavior: 'wander', canadiaTask: undefined, targetX: 1000, targetY: 1000, path: undefined,
  pathIndex: undefined, _t791P: undefined, _t791Pn: undefined, _t791Px: undefined, _t791Py: undefined, _stuckPos: undefined, _stuckN: undefined, _t670TkX: undefined, _t670TkY: undefined, _t670Tk: undefined,
  _pathFor: undefined, _pathAt: undefined, _huntSpd: undefined, gatherTarget: undefined, harvestTarget: undefined, npcHomeX: 900 + i, npcHomeY: 900, npcBedX: i % 5 ? 905 + i : undefined, npcBedY: i % 5 ? 902 : undefined,
  _t720: i % 13 === 0 ? { k: 1 } : undefined, simVillageId: i % 50 === 49 ? undefined : 'v1', floor: 0, onStairId: undefined, _w95: i % 4 === 0, inventory: { wood: 0 }, _t540DecAt: undefined, _lastAStarAt: undefined });
const STAMP = new Set(['_t540StepAt', '_pathAt', '_stuckPos']);
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
function clone(p) { const c = Object.assign({}, p); c._stuckPos = p._stuckPos ? Object.assign({}, p._stuckPos) : p._stuckPos; c.inventory = Object.assign({}, p.inventory); return c; }
function run(srcB, modeB, N, T, opt) {
  const A = world('0', SRC0), B = world(modeB, srcB);   // ★[T1323] 끔 판 = `'0'`(켬 기본)
  for (const W of [A, B]) { W.decideNpcBehavior = decide.bind(W); for (let i = 0; i < 7; i++) W.resources.set('r' + i, { x: 0, y: 0, hp: 1e9 }); }
  const bodies = [[], []], npcs = [[], []];
  for (const [w, W] of [[0, A], [1, B]]) for (let i = 0; i < N; i++) { const p = mkBody(i); bodies[w].push(p); W.players.set(p.pid, p); npcs[w].push(p.pid); if (W.T1322_PF) W.SS.install(p); }
  let now = 2000, diffTick = 0, diffFull = 0, firstDiff = null, stepChk = 0, stepBad = 0, stepBadEx = null, skips = 0;
  const dt = 0.05;
  for (let t = 0; t < T; t++) {
    now += 50;
    const ev = []; for (let i = 0; i < N; i++) ev.push([H(t, i * 3 + 1), H(t, i * 3 + 2), H(t, i * 3 + 3)]);
    for (const [w, W] of [[0, A], [1, B]]) {
      W._tick.n++;
      const out = (t % 211) === 17 ? new Set(npcs[w].filter((_, i) => i % 23 === t % 23)) : null;   // 빠짐(결정 문 고리 밖 한 틱 — 징발 · 짐 몸 꼴)
      for (const pid of npcs[w]) {
        if (out && out.has(pid)) continue;
        if (W.T1322_PF) { const s = W.SS.slot(pid); if (s >= 0) {
          const p0 = W.SS.own[s], pre = W.SS.A.TK[s] ? clone(p0) : null;
          if (W._t1322Skip(s, pid, now)) {
            skips++;
            if (opt.stepCheck) {   // ① 건넌 몸에 진짜 걸음 문을 돌리면 — 도장 셋만(그 틱 시각 · 그 자리)
              const c = pre; stepChk++; const D0 = W.DEC; W.npcStep(c, dt, now);
              const want = clone(p0); want._t540StepAt = now; want._pathAt = now; want._stuckPos = { x: p0.x, y: p0.y, at: now };
              const k = same(c, want, true) || (W.DEC !== D0 ? '결정 문' : null); if (k) { stepBad++; if (!stepBadEx) stepBadEx = `${pid} t${t} ${k}`; }
              W.DEC = D0;
            }
            continue;
          }
        } }
        const p = W.players.get(pid);
        if (!p || !(p.hp > 0)) continue;
        W.npcStep(p, dt, now);
        if (W.T1322_PF) W._t1322Grant(p, now);
      }
      // 이동 · 밀기 · 체력(걸음 문 밖 쓰기 — 켬 판은 쓰기 앞에서 표를 내린다 · 미끼 ⓑ 는 안 내린다)
      for (let i = 0; i < N; i++) {
        const p = bodies[w][i], [e1, e2, e3] = ev[i];
        if (p.vx !== 0 || p.vy !== 0) { p.x += p.vx * dt; p.y += p.vy * dt; }
        if (e1 < 0.004) { if (W.T1322_PF && !opt.noTouch) W._t1322Touch(p); p.x += (e2 - 0.5) * 30; p.y += (e3 - 0.5) * 6; }   // 밀기(멀리 · 가까이)
        else if (e1 < 0.0045) { if (W.T1322_PF && !opt.noTouch) W._t1322Touch(p); p.hp = p.hp > 0 ? 0 : 100; }                   // 쓰러짐 · 되살림(체력 문)
        else if (e1 < 0.005) { if (W.T1322_PF && !opt.noTouch) W._t1322Touch(p); p.simEvacUntil = now + 5000; }                 // 대피(생활층 `_warEvacVillage` — 걸음 문 밖에서 판정 칸을 쓴다)
      }
      if (t % 97 === 50 && W.T1322_PF) W._t1322FlushAll();   // 관측(`/walkdbg`)이 들여다본다
    }
    if (t % 97 === 50) for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], true); if (k) { diffFull++; if (!firstDiff) firstDiff = `들여다봄 t${t} n${i} ${k}`; } }
    for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], false); if (k) { diffTick++; if (!firstDiff) firstDiff = `t${t} n${i} ${k}`; break; } }
  }
  if (B.T1322_PF) B._t1322FlushAll();
  for (let i = 0; i < N; i++) { const k = same(bodies[0][i], bodies[1][i], true); if (k) { diffFull++; if (!firstDiff) firstDiff = `끝 n${i} ${k}`; } }
  return { diffTick, diffFull, firstDiff, stepChk, stepBad, stepBadEx, skips, st: B.SS.stat, decA: A.DEC, decB: B.DEC };
}
console.log('\n① · ② 끔 ↔ 켬(몸 1,000 × 틱 1,000)');
const R1 = run(SRC0, '1', 1000, 1000, { stepCheck: true });
ok(R1.stepChk > 100000 && R1.stepBad === 0, '① 거른 몸 = 걸음 문을 돌려도 도장 셋(그 틱 시각 · 그 자리)만 바뀌는 몸(건널 때마다 사본에 진짜 걸음 문)', `견줌 ${R1.stepChk} · 어긋남 ${R1.stepBad}${R1.stepBadEx ? ' · ' + R1.stepBadEx : ''}`);
ok(R1.diffTick === 0 && R1.diffFull === 0, '② 끔 ↔ 켬 몸 칸 전부 같음(틱마다 도장 뺌 · 들여다볼 때 · 끝 도장까지)', `틱 ${R1.diffTick} · 전부 ${R1.diffFull}${R1.firstDiff ? ' · ' + R1.firstDiff : ''}`);
const st = R1.st;
ok(R1.skips > 0.3 * 1000 * 1000 && st.grant > 0 && st.stamp > 0 && st.due > 0 && st.dusk > 0 && st.gap > 0 && st.touch > 0 && st.flushAll > 0, '② 전제 — 거른 몫 · 표 · 미룬 도장 · 깨움 갈래(결정 시각 · 해 질 녘 · 빠짐 · 쓰기 앞)가 다 탔다',
  `거름 ${R1.skips}(${(R1.skips / 1e4).toFixed(1)} %) · 표 ${st.grant} · 도장 ${st.stamp} · 시각 ${st.due} · 해 질 녘 ${st.dusk} · 빠짐 ${st.gap} · 쓰기 앞 ${st.touch} · 들여다봄 ${st.flushAll} · 결정 끔 ${R1.decA} = 켬 ${R1.decB}`);
ok(R1.decA === R1.decB, '② 결정 문 부름 수 같음', `${R1.decA} · ${R1.decB}`);
console.log('\n③ `verify` 판');
const R3 = run(SRC0, 'verify', 1000, 400, {});
ok(R3.diffTick === 0 && R3.diffFull === 0 && R3.st.vchecks > 0 && R3.st.bad === 0, '`verify` — 거를 때마다 몸을 열어 다시 판정 · 어긋남 0 · 끔과 같음', `견줌 ${R3.st.vchecks} · 어긋남 ${R3.st.bad} · 몸 칸 ${R3.diffTick}/${R3.diffFull}`);
console.log('\n④ 미끼');
{
  const a = "!(now < A.NDA[s]) ? ((A.DS[s] && _t1337Dec(s, now)) ? null : 'due') : ";   // ★[T1337] 결정 시각 갈래(잠 깨움 표 몸은 `_t1337Dec`)
  const baitA = SRC0.replace(a, '');
  ok(baitA !== SRC0, 'ⓐ 결정 시각이 된 몸을 거르는 사본을 지었다');
  const RA = run(baitA, '1', 300, 300, { stepCheck: true });
  ok(RA.stepBad > 0 && (RA.diffTick > 0 || RA.diffFull > 0), 'ⓐ ① · ② 가 문다(빨강)', `① ${RA.stepBad}${RA.stepBadEx ? ' · ' + RA.stepBadEx : ''} · ② ${RA.diffTick}/${RA.diffFull}`);
  const RB = run(SRC0, '1', 300, 300, { noTouch: true });
  ok(RB.diffTick > 0 || RB.diffFull > 0, 'ⓑ 몸을 옮기기 전에 표를 안 내리는 쓰기 길 — ② 가 문다(빨강)', `② ${RB.diffTick}/${RB.diffFull}${RB.firstDiff ? ' · ' + RB.firstDiff : ''}`);
  const RV = run(SRC0, 'verify', 300, 300, { noTouch: true });
  ok(RV.st.bad > 0 && RV.diffTick === 0, 'ⓑ 같은 미끼를 `verify` 판으로 — 어긋남을 세고(자리 옮김) 그 몸은 종전 길(몸 칸 같음)', `어긋남 ${RV.st.bad} ${JSON.stringify(RV.st.why)} · 틱 ${RV.diffTick}`);
}
console.log('\n⑤ 존 배선 글자');
{
  const dec = Z.slice(Z.indexOf('  const _decOne = (pid) => { do {'), Z.indexOf('  } while (false); return _stopAt !== null; };'));
  const iSkip = dec.indexOf('if (T1322_PF) { const _s22 = SS.slot(pid); if (_s22 >= 0 && _t1322Skip(_s22, pid, now))'), iGet = dec.indexOf('    const npc = players.get(pid);');
  ok(iSkip > 0 && iGet > iSkip && dec.indexOf("if (!_curHit) { if (pid !== _npcCursor) continue; _curHit = true; }") < iSkip, '거름은 커서 다음 · `players.get` 앞(몸을 안 연다)');
  ok(/    (?:else )?npcStep\(npc, dt, now\);\n(?:    if \(_t1337Pend && _t1337Pend\.p === npc\) _t1337Cmp\(npc\);[^\n]*\n)?    if \(T1322_PF\) _t1322Grant\(npc, now\);/.test(dec)   /* ★[PM land1077] T1316 토막 갈래(`_K95 > 1` … `else npcStep`)와 만난 자리 — 표는 여전히 토막 걸음을 다 마친 뒤 */ && /_desTimed\(npc, dt, now\); (?:if \(_t1337Pend && _t1337Pend\.p === npc\) _t1337Cmp\(npc\); )?if \(T1322_PF\) _t1322Grant\(npc, now\); continue;/.test(dec), '표는 진짜 걸음 뒤(두 길 — 계측 시계 길 포함)');
  ok(/_desStat\.steps\+\+; _desStat\.nStep\+\+; \} else if \(_T1241\) _desStat\.steps\+\+; continue;/.test(dec), '건넌 몸도 걸음 셈(몸 탐침 `steps` · `nStep`)은 종전대로');
  const sep = fn('function sepNpcs(dt) {'), ww = fn('function _wwPost(p, i) {'), hp = fn('function setHp(p, v, why) {');
  ok(sep.indexOf('if (T1322_PF) _t1322Touch(p);') > 0 && sep.indexOf('if (T1322_PF) _t1322Touch(p);') < sep.indexOf('else p.x = nx;'), '밀기 — 옮기기 전에 표를 내린다');
  ok(ww.indexOf('_t1322Touch(p)') > 0 && ww.indexOf('_t1322Touch(p)') < ww.indexOf('p.x = _WW.X[i]'), '걸음 뒷일 — 옮기기 전에');
  ok(hp.indexOf('_t1322HpTouch(p, prev, next)') > 0 && hp.indexOf('_t1322HpTouch(p, prev, next)') < hp.indexOf('p.hp = next;'), '체력 문 — 바꾸기 전에(살고 죽음 · ★[T1337] 요양 문턱)');
  ok(/\/walkdbg[\s\S]{0,200}if \(T1322_PF\) _t1322FlushAll\(\);/.test(Z), '관측(`/walkdbg`) — 들어올 때 미룬 도장을 몸에');
  { const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'), ev = V.slice(V.indexOf('function _warEvacVillage(vil, now) {'), V.indexOf('\n}\n', V.indexOf('function _warEvacVillage(vil, now) {')));
    ok(/t1322Touch: T1322_PF \? _t1322Touch : null,/.test(Z) && ev.indexOf('if (_t22) _t22(p);') > 0 && ev.indexOf('if (_t22) _t22(p);') < ev.indexOf('p.simEvacUntil = now + 5000;'), '대피(생활층 `_warEvacVillage`) — 대피 칸을 쓰기 전에(존이 deps 로 준 문 · `verify` 30날 · 400날 판이 센 유일한 걸음 문 밖 쓰기)'); }
  { const V = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8'); ok(/if \(state\.deps\.t1322Touch\) state\.deps\.t1322Touch\(p\);[^\n]*\n    p\.simJob = q\.currentJob;/.test(V), '직업 바꿈(생활층 하루 econ 맞춤) — 직업 칸을 쓰기 전에'); }
  ok(/const T1322_PF = SS\.ON && !T738_SOA_XY && T670_SKIP_IDLE && !T791_VERIFY && !T1140_STUCK_INLINE && !T1145_XY_COLS && !T370_PATH_REUSE && !T1294_ARRIVED_PATH && T791_PATH_MIR && !T1241_DES && process\.env\.T1316_SUBSTEP !== '1';/.test(Z),
    '켜지는 조건 — 걸음 문 글자를 바꾸는 손잡이가 다 끔일 때만');
  const S0 = loadSS('0'), S1 = loadSS('1'), S2 = loadSS('verify'), S3 = loadSS('');
  ok(!S0.ON && S1.ON && !S1.VERIFY && S2.ON && S2.VERIFY && S3.ON && !S3.VERIFY, "`T1322_PREFILTER` — ★[T1323] 켬 기본(빈 값 · `'1'` 켬) · `'0'` 만 끔 · `'verify'` 켬 + 견줌");
  ok(/!T1241_DES && process\.env\.T1316_SUBSTEP !== '1';/.test(Z), '★[T1323] T1316 토막 걸음 켬 판엔 첫 거름 무동작(한 틱 여러 걸음)');
}
console.log(`\n=== T1322 첫 거름 ${pass} 통과 · ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
