#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 1
// === scripts/test-t1338-war-tick.js — 큰 전투 무거운 틱(T1338): 맞붙은 300 대 300 틱 예산 · 사거리 안 적 칸 격자 · 길 물음 상한 둘(손잡이 끔 기본) ===========
//
// ★왜 [T1338] 전쟁 판(시드 42 날 665 · 747)의 1.2초 틱. 잰 까닭(보고 T1338 §2): 맞붙은 교전의 셈 자체는 300 대 300 에서 틱 평균 4ms 안팎이고,
//   무거운 틱은 ⓐ 힙이 1~2 GB 로 부푼 채 도는 큰 GC(행군 걸음 재개형 탐색 — 닿을 수 없는 먼 진을 여러 몸이 함께 묻는다) · ⓑ 대형이 풀리는 틱의 처음 묻는 길 물음 몰림.
//   고침 ①(바이트 같음 · 손잡이 0): war-live 사거리 안 적 — 사수마다 전 몸을 훑던 O(사수 × N) 을 칸 격자로(`_rangedGrid` · `_enemyWithin`).
//   고침 ②(손잡이 `T1338_PATH_BUDGET` · 끔 기본): 교전 하나의 한 틱에 처음 묻는 걸음 경로 물음은 하나만.
//   고침 ③(손잡이 `T1338_WALK_BUDGET` · 끔 기본): 이어 미는 먼 걸음 탐색(T821)은 존에 하나만.
//
// 장면: 운영 함수 그대로(villages `__p3Bind` · `_warWorld` · `_t804Way` · war-live `createWarLive` · `makeFight` · `enlist` · `stepFight` · `hasRangedContact` · battle-core).
// 지키는 것:
//   ① 맞붙은 300 대 300(열린 들) — 상황 assert(실제로 맞붙고 죽는다) · 틱 p99 ≤ 예산(33ms) × `N_BUDGET` · 같은 판 두 번 = 지문 같음(결정적)
//   ② 칸 격자가 같은 답 — 무작위 장면(씨 고정) · 사거리 경계(정확히 R · R ± 아주 작은 수 · 대각) · 죽은 몸 · 같은 편 · 화살 0 에서 종전 전 쌍 훑기(아래 사본)와 한 글자 같음
//   ③ 틱 예산 — 사수가 많은데 사거리 안 적이 없는 판(진 둘이 멀다 · 한 편 4,000)의 `hasRangedContact` 한 번 ≤ 예산 33ms · ★미끼(종전 전 쌍 훑기 사본)는 예산을 넘는다(빨강)
//   ④ 손잡이 `T1338_PATH_BUDGET=1` — 닫힌 성벽 앞 300(T1330 장면): 한 틱의 실제 탐색 ≤ 1 · 넘친 물음은 미룸 · 끔이면 셈 0(종전 그대로)
//   ⑤ 손잡이 `T1338_WALK_BUDGET=1` — 성벽 안 진을 바깥 다섯 몸이 묻는다: 이어 미는 먼 탐색 ≤ 1(끔이면 다섯) · 그 하나가 끝나면 자리가 풀린다
// 실행: node scripts/test-t1338-war-tick.js
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288 · PM land1085] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';

const N_BUDGET = 3;          // 틱 예산 배수(하네스 자 — T1330 하네스와 같은 자)
const TICK_MS = 1000 / 30;   // 존 틱(30Hz) 예산
const SZ = 32;

function bind(deps) {
  const _l = console.log; console.log = () => {};
  let V; try { V = R('server/villages.js'); } finally { console.log = _l; }
  const WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js');
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const standSrc = /function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZSRC);
  deps.standCellNear = new Function('ZONE', '_BLOCKED_STAND', standSrc[0] + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  deps.anyViewerNear = () => false;
  const world = { day: 400 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [], byDbId: new Map(), byEcon: new Map(), world, db: null,
    warBodies: new Map(), _warRects: null, _warRectCells: null, _warNoCollide: false, _t1338WalkLive: null,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 } });
  const WL = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: () => {}, blockedCell: (cx, cy) => H._warBlockedCell(cx, cy), arrowOut: () => {}, arrowNear: () => false });
  H.state.warLive = WL;
  H._warBuildRectIndex(true);
  return { H, WL, BC, world };
}

// ① 맞붙은 N 대 N — 열린 들 · 창 · 궁수 · 단검 · 민병 섞음 · 양쪽 전진(t1338-fight-bench 와 같은 장면 · 나무 0)
function fight(N, ticks) {
  const players = new Map();
  const { H, WL } = bind({ isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, treeCellBlocked: () => false, players });
  const w = { id: 7, born: 1, atk: { name: 'A' }, def: { name: 'B' }, _heading: 0 };
  const f = WL.makeFight(w, null, { A: { weapQ: 0.5 }, B: null });
  f.ctx.world = H._warWorld(f); f.physical = true;
  const MPC = WL.M_PER_CELL, PXM = WL.PX_PER_M;
  f.home = { A: { x: 440 * MPC, y: 500 * MPC }, B: { x: 560 * MPC, y: 500 * MPC } };
  f.objective = f.home.B; f.route = [f.home.A, f.home.B]; f.holder = 'B';
  const types = ['spear', 'spear', 'archer', 'dagger', 'militia'];
  let pid = 0;
  for (const side of ['A', 'B']) {
    f.ctx.sides[side].form = 'line';
    const x0 = side === 'A' ? 488 : 512;
    for (let i = 0; i < N; i++) {
      const cx = x0 + (side === 'A' ? -1 : 1) * Math.floor(i / 30) * 0.6, cy = 485 + (i % 30);
      const p = { pid: 'u' + (++pid), x: (cx + 0.5) * MPC * PXM, y: (cy + 0.5) * MPC * PXM };
      players.set(p.pid, p);
      WL.enlist(f, side, { type: types[i % types.length], pid: p.pid, x: cx, y: cy }, p);
    }
  }
  WL.orderAdvance(f, 'A'); WL.orderAdvance(f, 'B');
  const ms = []; let engaged = 0;
  for (let t = 0; t < ticks; t++) {
    const t0 = process.hrtime.bigint();
    const ev = WL.stepFight(f);
    ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (f.state === 'engaged') engaged++;
    if (ev.rout) break;
  }
  let fp = 0; for (const u of f.ctx.units) fp = (fp * 31 + Math.round(u.x * 1000) + Math.round(u.y * 1000) * 7 + Math.round(u.hp * 100)) >>> 0;
  return { ms, engaged, dead: f.ctx.sides.A.dead + f.ctx.sides.B.dead, fp };
}

// ★종전 글자(사본 — ② 대조 · ③ 미끼): 사수마다 전 몸을 훑는다(O(사수 × N))
function oldHasRangedContact(BC, f) {
  if (f.ctx.arrows.length) return true;
  return f.ctx.units.some(u => {
    const D = BC.UNITS[u.type];
    return u.hp > 0 && D && D.ranged > 0 && f.ctx.sides[u.side][D.ammo || 'arrows'] > 0
      && f.ctx.units.some(e => e.side !== u.side && e.hp > 0 && Math.hypot(e.x-u.x,e.y-u.y) <= D.ranged);
  });
}

// ④ · ⑤ — 손잡이 판(아이 프로세스 · 손잡이는 모듈이 실릴 때 읽는다)
function wallScene() {
  const C = 500, RIN = 18, ROUT = 19;
  const wall = (cx, cy) => { const d = Math.max(Math.abs(cx - C), Math.abs(cy - C)); return d >= RIN && d <= ROUT; };
  const B = bind({ isTerrainBlockedLocal: (px, py) => wall(Math.floor(px / SZ), Math.floor(py / SZ)), isWaterTileLocal: () => false, treeCellBlocked: () => false });
  return Object.assign(B, { C });
}
if (process.env.__T1338_SUB === 'path') {
  const { H, C } = wallScene();
  const fightO = { holder: 'B', objective: { x: C + 0.5, y: C + 0.5 }, route: [{ x: C - 120.5, y: C + 0.5 }, { x: C + 0.5, y: C + 0.5 }], t: 0, home: {} };
  const W = H._warWorld(fightO);
  const ctx = { _cen: { A: { n: 300, x: C - 40, y: C }, B: { n: 300, x: C + 0.5, y: C + 0.5 } } };
  const A = []; for (let i = 0; i < 300; i++) A.push({ side: 'A', x: 455.5 + (i % 20), y: 485.5 + Math.floor(i / 20) * 2, hp: 10 });
  const per = []; let s0 = H._t1330Stat.ask;
  for (let t = 0; t < 30; t++) {
    fightO.t += 1 / 30;
    for (const u of A) { const d = W.advance(ctx, u); if (d) { const nx = u.x + d.dx * 0.5, ny = u.y + d.dy * 0.5; if (!W.blocked(nx, ny)) { u.x = nx; u.y = ny; } } }
    per.push(H._t1330Stat.ask - s0); s0 = H._t1330Stat.ask;
  }
  fs.writeSync(1, '@@T1338 ' + JSON.stringify({ per, st: H._t1338Stat }) + '\n');
  process.exit(0);
}
if (process.env.__T1338_SUB === 'walk') {
  const { H, C } = wallScene();
  const mems = [0, 1, 2, 3, 4].map(() => ({}));
  const at = (i) => ({ x: C - 24.5 - i * 2, y: C + 0.5 + i * 3 });   // 성벽(18 ~ 19칸) 바깥 · 곧은 줄 재기(40m) 안 — 막힌 줄이라 길을 묻는다
  const ret = mems.map((m, i) => { const p = at(i); const w = H._t804Way(m, p.x, p.y, C + 0.5, C + 0.5, 1, null); return w === null ? 'null' : (w.x === p.x && w.y === p.y ? 'stand' : 'go'); });
  const live1 = mems.filter((m) => m._t821s).length;
  // 산 하나를 끝까지 민다(같은 문 — 서 있는 동안 걸음마다 T85 알갱이) · 끝나면 자리가 풀려 다른 목표의 새 물음이 산다
  const L = mems.find((m) => m._t821s); let steps = 0;
  if (L) { const i = mems.indexOf(L), p = at(i); while (L._t821s && steps < 20000) { H._t804Way(L, p.x, p.y, C + 0.5, C + 0.5, 1, null); steps++; } }
  const other = mems.find((m) => m !== L), j = mems.indexOf(other), q = at(j);
  H._t804Way(other, q.x, q.y, C + 1.5, C + 0.5, 1, null);   // 다른 목표 칸(그 몸의 "길 없음" 기억은 목표 칸마다)
  const live2 = mems.filter((m) => m._t821s).length, otherLive = !!other._t821s;
  fs.writeSync(1, '@@T1338 ' + JSON.stringify({ ret, live1, steps, doneL: L ? !L._t821s : null, live2, otherLive, st: H._t1338Stat, t821: H._t821Stat }) + '\n');
  process.exit(0);
}

let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
console.log('\n=== T1338 큰 전투 무거운 틱 — 맞붙은 300 대 300 · 사거리 안 적 칸 격자 · 길 물음 상한(손잡이 끔 기본) ===');
const sub = (mode, env) => {
  let out = '';
  try { out = execFileSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { __T1338_SUB: mode, T1338_PATH_BUDGET: '0', T1338_WALK_BUDGET: '0' }, env), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000, maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { out = String((e && e.stdout) || ''); }
  const m = /@@T1338 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
};

// ① 맞붙은 300 대 300
{
  const _l = console.log; console.log = () => {};
  let a, b; try { a = fight(300, 300); b = fight(300, 300); } finally { console.log = _l; }
  const W0 = 30;   // 첫 30틱(1초 — 대형이 풀리며 처음 묻는 길 · JIT 데우기)은 재는 몫 밖(최대는 따로 적는다)
  const s = a.ms.slice(W0).sort((x, y) => x - y), p99 = s[Math.min(s.length - 1, Math.floor(0.99 * s.length))], p50 = s[Math.floor(0.5 * s.length)];
  ok(a.engaged > 0 && a.dead > 0, '① 상황 assert — 300 대 300 이 실제로 맞붙고(engaged) 죽는다', `맞붙은 틱 ${a.engaged}/${a.ms.length} · 죽음 ${a.dead}`);
  ok(p99 <= TICK_MS * N_BUDGET, `① 틱 예산 — 첫 1초 뒤 틱 p99 ${p99.toFixed(1)}ms ≤ ${(TICK_MS * N_BUDGET).toFixed(0)}ms(예산 ${TICK_MS.toFixed(1)} × ${N_BUDGET})`, `p50 ${p50.toFixed(1)}ms · 그 뒤 최대 ${Math.max(...a.ms.slice(W0)).toFixed(0)}ms · 첫 1초 최대 ${Math.max(...a.ms.slice(0, W0)).toFixed(0)}ms`);
  ok(a.fp === b.fp && a.dead === b.dead, '① 결정적 — 같은 판 두 번 = 몸 자리 · hp 지문 같음', `지문 ${a.fp} · ${b.fp}`);
}

// ② 칸 격자 = 종전 전 쌍 훑기(무작위 장면 · 씨 고정)
{
  const { WL, BC } = bind({ isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, treeCellBlocked: () => false });
  let sd = 1338; const rnd = () => { sd = (sd * 1103515245 + 12345) >>> 0; return sd / 4294967296; };
  const TY = ['spear', 'archer', 'slinger', 'dagger', 'militia'];
  let same = 0, diff = 0, yes = 0, edge = 0;
  for (let k = 0; k < 3000; k++) {
    const units = [];
    const single = k % 2 === 0;   // 홀로 선 사수 하나 — 그 몸 하나의 답이 판 전체의 답(몸마다 정확히 같은가)
    const n = single ? 1 + Math.floor(rnd() * 6) : 2 + Math.floor(rnd() * 60);
    const ox = (rnd() - 0.5) * 4000, oy = (rnd() - 0.5) * 4000;
    for (let i = 0; i < n; i++) {
      const side = single ? (i === 0 ? 'A' : 'B') : (rnd() < 0.5 ? 'A' : 'B');
      const type = single && i === 0 ? (rnd() < 0.5 ? 'archer' : 'slinger') : (single ? TY[Math.floor(rnd() * TY.length)] : TY[Math.floor(rnd() * TY.length)]);
      units.push({ side, type, x: ox + (rnd() - 0.5) * 160, y: oy + (rnd() - 0.5) * 160, hp: rnd() < 0.15 ? 0 : 1 + rnd() * 9 });
    }
    if (single && n > 1) {   // 사거리 경계 — 정확히 R · R ± 아주 작은 수 · 대각
      const u = units[0], R0 = BC.UNITS[u.type].ranged, e = units[1], m = k % 8, a = rnd() * Math.PI * 2;
      const r = m === 0 ? R0 : m === 1 ? R0 * (1 - 1e-12) : m === 2 ? R0 * (1 + 1e-12) : m === 3 ? R0 + 1e-9 : R0 * rnd() * 1.1;
      if (m === 4) { e.x = u.x + R0 / Math.SQRT2; e.y = u.y + R0 / Math.SQRT2; } else { e.x = u.x + Math.cos(a) * r; e.y = u.y + Math.sin(a) * r; }
      if (m <= 4) edge++;
      e.hp = 5;
    }
    const sides = { A: { arrows: rnd() < 0.1 ? 0 : 50, stones: rnd() < 0.1 ? 0 : 50 }, B: { arrows: 50, stones: 50 } };
    const f = { ctx: { arrows: [], units, sides } };
    const x = WL.hasRangedContact(f), y = oldHasRangedContact(BC, f);
    if (x === y) same++; else diff++;
    if (y) yes++;
  }
  ok(diff === 0 && yes > 300 && same - yes > 300, '② 칸 격자가 종전 전 쌍 훑기와 같은 답 — 무작위 3,000 판(씨 고정 · 홀로 선 사수 1,500 · 사거리 경계 정확히 R · R ± 1e-12 · 대각 포함)', `같음 ${same} · 다름 ${diff} · 있음 ${yes} · 경계 판 ${edge}`);
}

// ③ 틱 예산 — 사거리 안 적이 없는 큰 판(진 둘이 멀다): 사수 전부를 봐야 답이 난다
{
  const { WL, BC } = bind({ isTerrainBlockedLocal: () => false, isWaterTileLocal: () => false, treeCellBlocked: () => false });
  const N = 4000, units = [];
  const TY = ['spear', 'archer', 'slinger', 'dagger', 'militia'];
  for (const side of ['A', 'B']) for (let i = 0; i < N; i++) units.push({ side, type: TY[i % TY.length], x: (side === 'A' ? 0 : 400) + (i % 40) * 1.2, y: Math.floor(i / 40) * 1.2, hp: 5 });
  const f = { ctx: { arrows: [], units, sides: { A: { arrows: 50, stones: 50 }, B: { arrows: 50, stones: 50 } } } };
  const time = (fn) => { let best = Infinity, r; for (let i = 0; i < 3; i++) { const t0 = process.hrtime.bigint(); r = fn(); best = Math.min(best, Number(process.hrtime.bigint() - t0) / 1e6); } return { best, r }; };
  const a = time(() => WL.hasRangedContact(f)), b = time(() => oldHasRangedContact(BC, f));
  ok(a.r === false && b.r === false, '③ 상황 assert — 사거리 안 적 없음(두 진 사이 400m · 사수 3,200)', `격자 ${a.r} · 종전 ${b.r}`);
  ok(a.best <= TICK_MS, `③ 틱 예산 — 한 편 ${N} 판의 사거리 안 적 찾기 ${a.best.toFixed(2)}ms ≤ ${TICK_MS.toFixed(1)}ms`, '');
  ok(b.best > TICK_MS, '③ ★미끼 — 종전 전 쌍 훑기 사본은 같은 판에서 예산을 넘는다(빨강)', `바꾼 자리 1(칸 격자 → 종전 전 쌍 훑기) · ${b.best.toFixed(1)}ms(격자의 ${(b.best / Math.max(a.best, 1e-3)).toFixed(0)}배)`);
}

// ④ 손잡이 T1338_PATH_BUDGET
{
  const off = sub('path', {}), on = sub('path', { T1338_PATH_BUDGET: '1' });
  ok(!!off && off.st.ask === 0 && off.st.defer === 0 && Math.max(...off.per) > 1, '④ 끔(기본) — 상한 셈 0 · 한 틱에 처음 묻는 물음이 여럿(종전 그대로 — T1330 장면)', off ? `틱당 실제 탐색 최대 ${Math.max(...off.per)} · 합 ${off.per.reduce((s, v) => s + v, 0)}` : '판 없음');
  ok(!!on && Math.max(...on.per) <= 1 && on.st.defer > 0 && on.st.ask > 0, '④ 켬 — 교전 하나의 한 틱에 실제 탐색 ≤ 1 · 넘친 물음은 미룸(다음 틱)', on ? `틱당 최대 ${Math.max(...on.per)} · 물음 ${on.st.ask} · 미룸 ${on.st.defer}` : '판 없음');
}

// ⑤ 손잡이 T1338_WALK_BUDGET
{
  const off = sub('walk', {}), on = sub('walk', { T1338_WALK_BUDGET: '1' });
  ok(!!off && off.live1 === 5 && off.st.walkLive === 0 && off.st.walkSkip === 0, '⑤ 끔(기본) — 성벽 안 진을 바깥 다섯 몸이 물으면 이어 미는 먼 탐색이 다섯 산다(종전 T821 그대로)', off ? `산 탐색 ${off.live1} · 답 ${off.ret.join(' ')}` : '판 없음');
  ok(!!on && on.live1 === 1 && on.st.walkSkip === 4 && on.ret.filter((r) => r === 'stand').length === 1, '⑤ 켬 — 이어 미는 먼 탐색은 존에 하나 · 나머지 넷은 종전 T804 처럼 "길 없음"(그 자리에 안 선다)', on ? `산 탐색 ${on.live1} · 건너뜀 ${on.st.walkSkip} · 답 ${on.ret.join(' ')}` : '판 없음');
  ok(!!on && on.doneL === true && on.otherLive === true && on.live2 === 1 && on.t821.fail >= 1, '⑤ 켬 — 산 하나가 끝나면(닿을 수 없음 · 상한) 자리가 풀려 다른 몸의 새 물음이 산다', on ? `민 걸음 ${on.steps} · 끝 ${on.doneL} · 새 물음 삶 ${on.otherLive} · 산 탐색 ${on.live2}` : '판 없음');
}

console.log(`\n=== T1338 큰 전투 무거운 틱: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
