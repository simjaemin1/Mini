#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 2
// === scripts/test-t1381-walk-heap.js — 전쟁 판이 죽던 자리: 먼 걸음 재개형 탐색(T821)의 힙(T1381) ===============================================
//
// ★왜 [T1338 회부 3 · 4 · 5] main 전쟁 판이 결정론으로 힙에 죽었다(시드 42 날 638 · 1020 날 617). 날 638 캡처 산 표본 885 MB 중 841 MB 가
//   `_t804Local` → `_t821Push` → path-core `_searchStep` 의 문자열 열쇠 Map 둘(g · came)이었다 — 닿을 수 없는 진을 겨눈 병사마다 재개형 걸음 탐색이
//   꺼냄 상한 25만까지 가고 동시에 수십 개가 산다.
// ★고침(값 무변 · 손잡이 `T1381_WALK_HEAP` 끔 기본):
//   ㉠ path-core 칸 조각 저장(`tile` — 64×64 타입 배열 · g 8 B + 들어온 방향 1 B) — 같은 고리 · 같은 차례 · 같은 답.
//   ㉡ 같은 세대 · 같은 끝점 물음은 앞 물음의 "몇 번 밀어 끝났나"만 기억해 꺼냄 0 으로 같은 걸음을 선다(유령 물음 · 세대가 바뀌면 그 자리에서 진짜 탐색으로 다시 세운다).
// 지키는 것:
//   ⓐ 꾸민 장면(강 건너 닿을 수 없는 슬롯 · 병사 40 · 운영 `_t804Way`): 산 탐색의 V8 힙 늘음 ≤ 종전 저장 짝 판의 ¼ · 조각 저장 바이트 = 조각 수 × 조각 바이트 ·
//      두 번째 같은 물음의 꺼냄 0 · 두 판(켬 · 끔)의 병사 자리 · 기억(못 찾음 칸) · 선 걸음 같음
//   ⓑ 조각 판 답 = 종전 답(무작위 장면 3,000 · 길 · 꺼냄 · 민 횟수 · 예산 0 · 1 · 7 · 32)
//   ⓒ 끝난 탐색 뒤 힙이 내려온다(`--expose-gc` · 조각 판 · 종전 판)
//   ⓓ ★미끼(이 파일 안): 유령 물음 기억을 뺀 사본 → ⓐ 의 "두 번째 물음 꺼냄 0" 빨강 · 조각 열쇠가 겹치는 사본 → ⓑ 빨강
// 실행: node scripts/test-t1381-walk-heap.js   (아이 판 넷 · 약 1 ~ 3분)
'use strict';
if (require.main === module) require('./lib-port').noCentral();
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';

// ── ⓑ 조각 판 답 = 종전 답 ──────────────────────────────────────────────────────────────────────────────────────────────
function eqScenes(pcFile, n) {
  const PC = require(pcFile);
  let seed = 1; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let same = 0, diff = 0, long = 0, tiled = 0, nn = 0, first = null;
  for (let it = 0; it < n; it++) {
    const W = 20 + Math.floor(rnd() * 300), dens = rnd() * 0.45, off = Math.floor(rnd() * 400) - 200 + (it % 5 === 0 ? 70 * 64 : 0);   // 음수 칸 · 조각 경계 · 먼 조각
    const cells = new Set(); for (let i = 0; i < W * W * dens; i++) cells.add(Math.floor(rnd() * W) * 4096 + Math.floor(rnd() * W));
    const blk = (x, y) => x < off || y < off || x >= off + W || y >= off + W || cells.has((x - off) * 4096 + (y - off));
    const sx = off + Math.floor(rnd() * W), sy = off + Math.floor(rnd() * W), gx = off + Math.floor(rnd() * W), gy = off + Math.floor(rnd() * W);
    const maxNodes = rnd() < 0.3 ? 500 + Math.floor(rnd() * 3000) : 250000, bud = [0, 1, 32, 7][it % 4];
    const run = (tile) => { const S = PC.localPathBegin(sx, sy, gx, gy, { blocked: blk, blockedStep: (a, b, x, y) => blk(x, y), maxNodes, tile }); if (!S) return 'null';
      if (tile) { nn++; if (S.tl) tiled++; }
      let r, k = 0; do { r = PC.pathStep(S, bud); k++; } while (!r.done); return JSON.stringify([r.path, S.pops, bud ? k : 0]); };
    const a = run(false), b = run(true);
    if (a === b) same++; else { diff++; if (!first) first = { it, a: a.slice(0, 120), b: b.slice(0, 120) }; }
    if (a.length > 2000) long++;
  }
  return { same, diff, long, tiled, nn, first };
}

// ── ⓒ 끝난 탐색 뒤 힙 ────────────────────────────────────────────────────────────────────────────────────────────────────
async function heapDrop(pcFile, tile) {   // 아이 판 하나에 저장 하나(V8 이 처음 한 번 쥐는 몫 — 문자열 표 등 — 이 다른 저장에 안 섞이게)
  const PC = require(pcFile);
  const blk = (x, y) => (x >= 1000 && x < 1004);   // 끝없는 강 — 닿을 수 없음
  //   배열 버퍼(타입 배열 몸)는 GC 뒤 따로 쓸어 낸다 — 두 번 GC 사이에 잠깐 쉰다(그래야 `arrayBuffers` 가 내려온 값을 읽는다)
  const mu = async () => { global.gc(); await new Promise((r) => setTimeout(r, 300)); global.gc(); await new Promise((r) => setTimeout(r, 300)); const m = process.memoryUsage(); return (m.heapUsed + m.arrayBuffers) / 1048576; };
  const h0 = await mu(), live = [], after = []; let done = true;
  for (let round = 0; round < 4; round++) {   // 넷 · 넷 — 다른 자리(같은 칸을 다시 안 쓴다)
    let keep = [];
    for (let i = 0; i < 4; i++) { const S = PC.localPathBegin(1010 + i, 500 + 2 * i + round * 3000, 990, 520 + round * 3000, { blocked: blk, blockedStep: (a, b, x, y) => blk(x, y), maxNodes: PC.ROUTE_MAX_POPS, tile }); PC.pathStep(S, 60000); keep.push(S); }
    live.push(await mu() - h0);
    for (const S of keep) PC.pathStep(S, 0);   // 끝까지(상한)
    done = done && keep.every((S) => S.done && S.path === null);
    keep = null; after.push(await mu() - h0);
  }
  return { live: live.map((v) => +v.toFixed(1)), after: after.map((v) => +v.toFixed(1)), done };
}

// ── ⓐ 꾸민 장면 — 운영 villages `_t804Way`(병사 40 · 강 건너 슬롯 · 슬롯이 세 칸을 번갈아) ─────────────────────────────────────
const SZ = 32, N = 40, RX = 600, C = 512;
function scene(villagesFile, steps) {
  const _l = console.log; console.log = () => {};
  let V; try { V = require(villagesFile); } finally { console.log = _l; }
  const R = (p) => require(path.join(ROOT, p));
  const WarLive = R('server/war-live.js'), BC = R('sim/battle-core.js'), PathCore = R('sim/path-core.js');
  const ZSRC = fs.readFileSync(path.join(ROOT, 'server/zone.js'), 'utf8');
  const standSrc = /function _standCellNear\(x0, y0, blocked\) \{[\s\S]*?\n\}/.exec(ZSRC);
  const standCellNear = new Function('ZONE', '_BLOCKED_STAND', standSrc[0] + '\nreturn _standCellNear;')({ zoneWidth: 1e7, zoneHeight: 1e7 }, () => false);
  //   강(남북 · 폭 4칸) 서쪽에 닫힌 우리(담 세 면 + 강 · 안 166 × 159 ≈ 2.6만 칸 — 걸음 프리셋 첫 몫 16,384 보다 크다) · 슬롯은 우리 안 · 병사는 강 동쪽.
  //   탐색은 사전순 작은 끝점(우리 안 슬롯)에서 판다 → 첫 몫을 넘겨 이어 밀다가 우리를 다 뒤져 못 찾음(꺼냄 상한 전에 끝난다 — 같은 물음이 걸음 안에 되풀이된다).
  const river = (cx) => cx >= RX && cx < RX + 4;
  const wall = (cx, cy) => (cx >= RX - 170 && cx < RX && (cy === C - 80 || cy === C + 80)) || (cx === RX - 170 && cy >= C - 80 && cy <= C + 80);
  const deps = { isTerrainBlockedLocal: (px, py) => { const cx = Math.floor(px / SZ), cy = Math.floor(py / SZ); return river(cx) || wall(cx, cy); }, isWaterTileLocal: () => false, treeCellBlocked: () => false, standCellNear, anyViewerNear: () => false };
  const world = { day: 638 };
  const H = V.__p3Bind({ ready: true, zoneId: 'test', deps, villages: [], byDbId: new Map(), byEcon: new Map(), world, db: null,
    warBodies: new Map(), _warRects: null, _warRectCells: null, _warNoCollide: false,
    _warStat: { engage: 0, standoff: 0, rout: 0, withdraw: 0, withdrawQuiet: 0, surrender: 0, walkover: 0, noArmy: 0, engageErr: 0 } });
  H.state.warLive = WarLive.createWarLive({ BC, dayOf: () => world.day, cellPx: SZ, pxPerM: SZ, tickHz: 30, resolveBattle: () => {}, blockedCell: (cx, cy) => H._warBlockedCell(cx, cy), arrowOut: () => {}, arrowNear: () => false });
  H._warBuildRectIndex(true);
  const out = { knob: typeof H.T1381_WALK_HEAP === 'function' ? H.T1381_WALK_HEAP() : null };
  { let b = 0; for (let x = RX - 20; x <= RX + 30; x++) if (H._warBlockedCell(x, C + 1)) b++; out.lineBlocked = b >= 4; }
  const U = []; for (let i = 0; i < N; i++) U.push({ x: RX + 30 + (i % 8) * 3 + 0.5, y: C + Math.floor(i / 8) * 3 + 0.5 });
  const a0 = H._t804Stat.ask, s0 = H._t821Stat.steps;
  // 탐색을 센다(path-core 문을 감싼다 — 같은 인수 · 같은 반환): 세운 탐색 · 꺼냄 · 조각 수
  const b0 = PathCore.localPathBegin; const made = [];
  PathCore.localPathBegin = function () { const S = b0.apply(this, arguments); if (S) made.push(S); return S; };
  const mu = () => { global.gc(); const m = process.memoryUsage(); return { h: m.heapUsed, ab: m.arrayBuffers }; };
  const m0 = mu(); let hMax = 0, abMax = 0, maxLive = 0, tileBytes = 0, tileBytesMax = 0;
  const trace = [];
  for (let t = 0; t < steps; t++) {
    const ty = C + 1 + (Math.floor(t / 600) % 3);   // 슬롯이 600 걸음마다 세 칸 사이를 옮긴다(같은 끝점 물음이 되풀이된다)
    if (t === 3650) { world.day++; H._warBuildRectIndex(); }   // 새 날 첫 교전 — 막힘 술어 세대가 바뀐다(걸음 3,600 부터 산 유령이 그 자리에서 진짜 탐색으로 · 그 앞 유령들은 유령으로 끝난다)
    let live = 0;
    for (const u of U) { const w = H._t804Way(u, u.x, u.y, RX - 20 + 0.5, ty + 0.5, 0.067, null); if (u._t821s) live++; trace.push(w ? (w.x === u.x && w.y === u.y ? 's' : 'w') : (u._t804f != null ? 'f' : 'n')); }
    if (live > maxLive) maxLive = live;
    if (t % 400 === 199) { const m = mu(); hMax = Math.max(hMax, m.h - m0.h); abMax = Math.max(abMax, m.ab - m0.ab);
      tileBytes = 0; for (const u of U) { const J = u._t821s; const S = J && J.S; if (S && S.tl) for (const tt of S.tl.values()) tileBytes += tt.g.byteLength + tt.c.byteLength; } tileBytesMax = Math.max(tileBytesMax, tileBytes); }
  }
  PathCore.localPathBegin = b0;
  out.asks = H._t804Stat.ask - a0; out.pushSteps = H._t821Stat.steps - s0; out.maxLive = maxLive;
  out.heapMB = +(hMax / 1048576).toFixed(1); out.abMB = +(abMax / 1048576).toFixed(1); out.tileMB = +(tileBytesMax / 1048576).toFixed(1);
  out.searches = made.length; out.pops = made.reduce((a, S) => a + S.pops, 0);
  out.ghost = H._t1381Stat ? Object.assign({}, H._t1381Stat) : null;
  out.trace = require('crypto').createHash('sha1').update(trace.join('')).digest('hex').slice(0, 16);
  out.fail = U.map((u) => u._t804f).join(',');
  out.pos = U.map((u) => u.x + ':' + u.y).join(',');
  return out;
}

function main() {
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const sub = (spec, env) => {
  let out = '';
  try { out = execFileSync(process.execPath, ['--expose-gc', __filename], { env: Object.assign({}, process.env, { __T1381_SUB: spec }, env || {}), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 900000, maxBuffer: 16 * 1024 * 1024 }); }
  catch (e) { out = String((e && e.stdout) || ''); }
  const m = /@@T1381 (\{.*\})/.exec(out); return m ? JSON.parse(m[1]) : null;
};
const PCF = path.join(ROOT, 'sim', 'path-core.js'), VF = path.join(ROOT, 'server', 'villages.js');
const STEPS = 4200, EQN = 3000;
console.log(`\n=== T1381 걸음 탐색 힙 — 꾸민 장면(병사 ${N} · 걸음 ${STEPS}) · 무작위 장면 ${EQN} · 미끼 ===`);

// ⓐ
const on = sub(`scene|${VF}|${STEPS}`, { T1381_WALK_HEAP: '1' }), off = sub(`scene|${VF}|${STEPS}`, { T1381_WALK_HEAP: '0' });
ok(!!on && !!off && on.lineBlocked && on.asks >= N && off.asks >= N, 'ⓐ 상황 — 강이 곧은 줄을 막는다 · 병사마다 실제로 묻는다(켬 · 끔)', on && off ? `물음 켬 ${on.asks} · 끔 ${off.asks} · 산 탐색 ${on.maxLive} · ${off.maxLive}` : '아이 판 없음');
ok(!!on && !!off && on.trace === off.trace && on.fail === off.fail && on.pos === off.pos && on.pushSteps === off.pushSteps, 'ⓐ 값 같음 — 켬 · 끔 판의 걸음마다 답(겨눔 · 섬 · 못 찾음) · 못 찾은 칸 기억 · 병사 자리 · 선 걸음 같음', on && off ? `자취 ${on.trace} · ${off.trace} · 선 걸음 ${on.pushSteps} · ${off.pushSteps}` : '');
ok(!!on && !!off && on.heapMB * 4 <= off.heapMB && on.tileMB > 0 && on.abMB >= on.tileMB, 'ⓐ 산 탐색 V8 힙 늘음 ≤ 종전 저장 짝 판의 ¼ · 조각 저장은 타입 배열(힙 밖)', on && off ? `힙 늘음 켬 ${on.heapMB} MB · 끔 ${off.heapMB} MB · 조각 ${on.tileMB} MB · 배열 버퍼 ${on.abMB} MB` : '');
ok(!!on && !!on.ghost && on.ghost.ghost > 0 && on.searches < off.searches && on.pops < off.pops, 'ⓐ 두 번째 같은 물음(같은 세대 · 같은 끝점)은 꺼냄 0 — 유령 물음이 선 걸음 수만 잇는다', on && off ? `유령 ${on.ghost && on.ghost.ghost} · 세운 탐색 켬 ${on.searches} · 끔 ${off.searches} · 꺼냄 켬 ${on.pops} · 끔 ${off.pops}` : '');
ok(!!on && !!on.ghost && on.ghost.real > 0 && on.ghost.miss === 0, 'ⓐ 유령이 사는 동안 세대가 바뀌면 그 자리에서 진짜 탐색으로(붙잡은 세대 메모에 없는 칸 0) — 위 값 같음 줄이 그 판을 덮는다', on && on.ghost ? `진짜로 ${on.ghost.real} · 메모 없음 ${on.ghost.miss} · 기억 ${on.ghost.rec}` : '');
// ⓑ
const eq = sub(`eq|${PCF}|${EQN}`);
ok(!!eq && eq.same === EQN && eq.diff === 0 && eq.tiled === eq.nn && eq.nn > EQN / 3 && eq.long > 100, `ⓑ 조각 판 답 = 종전 답(무작위 장면 ${EQN} · 길 · 꺼냄 · 민 횟수 · 예산 0 · 1 · 7 · 32)`, eq ? `같음 ${eq.same} · 다름 ${eq.diff} · 세운 탐색 ${eq.nn} 모두 조각 판 ${eq.tiled} · 긴 길 ${eq.long}` : '아이 판 없음');
// ⓒ
const dt = sub(`drop|${PCF}|tile`), dm = sub(`drop|${PCF}|map`);
const flat = (d) => d.after.every((v) => v <= d.after[0] + 1) && d.after.every((v, i) => v < d.live[i] + d.live[0]);   // 판을 거듭해도 안 쌓인다(1 MB = 잰 잡음)
ok(!!dt && !!dm && dt.done && dm.done && flat(dt) && flat(dm) && dt.live[0] * 4 <= dm.live[0], 'ⓒ 끝난 탐색 뒤 힙이 내려온다 — 넷씩 네 판을 거듭해도 안 쌓인다(조각 판 · 종전 판) · 산 동안 조각 판 ≤ 종전 ¼', dt && dm ? `조각 산 ${dt.live.join('/')} · 뒤 ${dt.after.join('/')} MB · 종전 산 ${dm.live.join('/')} · 뒤 ${dm.after.join('/')} MB` : '아이 판 없음');
// ⓓ 미끼
const bait = (file, from, to, tag) => {
  const src = fs.readFileSync(file, 'utf8'); const n = src.split(from).length - 1;
  const BF = path.join(path.dirname(file), `_t1381bait-${tag}-${process.pid}.js`);
  try { fs.writeFileSync(BF, src.split(from).join(to)); return { n, file: BF }; } catch (e) { return { n, file: null }; }
};
{ // ㉡ 유령 물음 기억 줄 한 곳을 지운 사본 → ⓐ 넷째 줄 빨강
  const FROM = 'const _T1381_GHOST = true;';
  const b = bait(VF, FROM, 'const _T1381_GHOST = false;', 'v');
  let r = null; try { if (b.file) r = sub(`scene|${b.file}|${STEPS}`, { T1381_WALK_HEAP: '1' }); } finally { try { fs.unlinkSync(b.file); } catch (e) {} }
  const red = !!r && !(r.ghost && r.ghost.ghost > 0 && r.searches < (off ? off.searches : 0));
  ok(b.n === 1 && red, `ⓓ ★미끼 — 유령 물음 기억 줄 한 곳을 끈 사본은 같은 물음을 다시 판다 → ⓐ "두 번째 물음 꺼냄 0" 빨강`, r ? `바꾼 자리 ${b.n} · 사본 유령 ${r.ghost && r.ghost.ghost} · 세운 탐색 ${r.searches} · 꺼냄 ${r.pops}` : '사본 판 없음');
}
{ // ㉠ 조각 열쇠가 겹치는 사본(조각 y 번호를 버린다) → ⓑ 빨강
  const FROM = 'function _tlKey(tx, ty) { return (tx + 1048576) * 2097152 + (ty + 1048576); }';
  const b = bait(PCF, FROM, 'function _tlKey(tx, ty) { return (tx + 1048576) * 2097152; }', 'pc');
  let r = null; try { if (b.file) r = sub(`eq|${b.file}|${EQN}`); } finally { try { fs.unlinkSync(b.file); } catch (e) {} }
  ok(b.n === 1 && !!r && r.diff > 0, `ⓓ ★미끼 — 조각 열쇠 줄 한 곳이 겹치는 사본 → ⓑ 빨강(다른 답)`, r ? `바꾼 자리 ${b.n} · 사본 같음 ${r.same} · 다름 ${r.diff}` : '사본 판 없음');
}
console.log(`\n=== T1381 걸음 탐색 힙: ${pass} 통과 / ${fail} 실패 ===`);
process.exit(fail ? 1 : 0);
}
if (process.env.__T1381_SUB) {   // 아이 판
  const [kind, file, arg] = process.env.__T1381_SUB.split('|');
  Promise.resolve(kind === 'eq' ? eqScenes(file, +arg) : kind === 'drop' ? heapDrop(file, arg === 'tile') : scene(file, +arg)).then((r) => {
    fs.writeSync(1, '@@T1381 ' + JSON.stringify(r) + '\n'); process.exit(0); });
} else main();
