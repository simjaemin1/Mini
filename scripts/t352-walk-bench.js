#!/usr/bin/env node
// === scripts/t352-walk-bench.js — T352 ③ 네 팔 · 바이트 동일 게이트 =============
//
// ⚠**계측기다. 하네스가 아니다 — 러너에 넣지 마라**(`@regress` 없음). 제품 코드 0 줄.
//
// 팔 넷 — **같은 스냅샷 · 같은 목표열**로 같은 걸음 문을 돌린다
//   ⓐ JS-cur   `server/zone.js` 의 걸음 함수들을 **소스에서 글자 그대로 떠서** 픽스처 위에서 돌린다
//              (사본이 아니라 그 함수 자체다 — `test-doors ⓔ3` 이 `_devAsGate` 에 쓴 그 수법)
//   ⓑ JS-SoA   같은 산술을 **열 순회**로(계약 초안대로 · 계측기 안에서만 · 제품 아님)
//   ⓒ WASM     `bench/walk-kernel/walk.wasm` — 메모리 공유(복사 0)
//   ⓓ N-API    `bench/walk-kernel/walk.node` — 같은 버퍼(복사 0)
//
// ★게이트 — **1,000틱 뒤 좌표 전원 바이트 동일**(ⓐ 대 ⓑⓒⓓ · `Float64Array` 비트 비교).
//   다르면 그 팔은 표에서 **빨강**이고 값을 안 낸다.
// ★자 — 사람당 µs = `p50(ms) × 1000 ÷ N`(T333 문법).
//
// 실행: node scripts/t352-walk-bench.js [fixture.json] [out.json]
'use strict';
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..');
const FIX = process.argv[2] || path.join(ROOT, 'bench', 'walk-kernel', 'fixtures', 'npc-snapshot.json');
const OUT = process.argv[3] || '/tmp/t352-bench.json';
const TICKS = parseInt(process.env.TICKS || '1000', 10);
const RUNS = parseInt(process.env.RUNS || '5', 10);
const say = (...a) => console.log(...a);

// ── 픽스처 ───────────────────────────────────────────────────────────────────
const F = JSON.parse(fs.readFileSync(FIX, 'utf8'));
const TERR = { b: Buffer.from(F.terrain.bitsB64, 'base64'), x0: F.terrain.tx0, y0: F.terrain.ty0, W: F.terrain.W, H: F.terrain.H };
const TBITS = new Uint8Array(TERR.b.buffer, TERR.b.byteOffset, TERR.b.length);
say(`픽스처 — 주민 ${F.nNpc} · 지형 ${TERR.W}×${TERR.H} · 벽 ${F.walls.length} · 나무 ${F.trees.length}`);

// ── 세계 격자 셋 (네 팔이 **같은 것**을 쓴다) ──────────────────────────────────
const MOVE_SPEED = 64, MOVE_DT = 1 / 30, BUILDING_SIZE = 32;
const TRUNK_COLLIDER_MAX = 9, ROCK_COLLIDER_R = 14, PLAYER_BODY_R = 6;

function terrBlocked(x, y) {
  const tx = Math.floor(x / 32) - TERR.x0, ty = Math.floor(y / 32) - TERR.y0;
  if (tx < 0 || ty < 0 || tx >= TERR.W || ty >= TERR.H) return false;
  return TBITS[ty * TERR.W + tx] !== 0;
}
// 벽 격자 — 셀당 1바이트(bit0 = N 변 · bit1 = E 변)
const WCELL = new Map();
for (const w of F.walls) {
  const cx = Math.floor(w.x / BUILDING_SIZE), cy = Math.floor(w.y / BUILDING_SIZE);
  let d = null; try { d = w.d ? JSON.parse(w.d) : null; } catch (e) {}
  const side = (d && d.side) || (d && d.dir) || 'N';
  const k = cx + ',' + cy;
  WCELL.set(k, (WCELL.get(k) || 0) | (side === 'E' || side === 'W' ? 2 : 1));
}
let wx0 = Infinity, wy0 = Infinity, wx1 = -Infinity, wy1 = -Infinity;
for (const k of WCELL.keys()) { const [a, b] = k.split(',').map(Number);
  if (a < wx0) wx0 = a; if (b < wy0) wy0 = b; if (a > wx1) wx1 = a; if (b > wy1) wy1 = b; }
if (!WCELL.size) { wx0 = wy0 = 0; wx1 = wy1 = 0; }
const WW = wx1 - wx0 + 1, WH = wy1 - wy0 + 1;
const WBITS = new Uint8Array(Math.max(1, WW * WH));
for (const [k, v] of WCELL) { const [a, b] = k.split(',').map(Number); WBITS[(b - wy0) * WW + (a - wx0)] = v; }
function wallEdge(cx, cy, bit) {
  const x = cx - wx0, y = cy - wy0;
  if (x < 0 || y < 0 || x >= WW || y >= WH) return false;
  return (WBITS[y * WW + x] & bit) !== 0;
}
function edgeStep(cx, cy, sx, sy) {
  if (sx === 1) return wallEdge(cx, cy, 2);
  if (sx === -1) return wallEdge(cx - 1, cy, 2);
  if (sy === 1) return wallEdge(cx, cy + 1, 1);
  if (sy === -1) return wallEdge(cx, cy, 1);
  return false;
}
// 나무 격자(64px CSR) — C 와 **같은 격자**
const GRID = 64;
const TRX = [], TRY = [], TRR = [];
for (const t of F.trees) {
  const R = (t.t === 'tree') ? (TRUNK_COLLIDER_MAX + PLAYER_BODY_R) : (ROCK_COLLIDER_R + PLAYER_BODY_R);
  TRX.push(t.x); TRY.push(t.y); TRR.push(R);
}
let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
for (let i = 0; i < TRX.length; i++) { const a = Math.floor(TRX[i] / GRID), b = Math.floor(TRY[i] / GRID);
  if (a < gx0) gx0 = a; if (b < gy0) gy0 = b; if (a > gx1) gx1 = a; if (b > gy1) gy1 = b; }
if (!TRX.length) { gx0 = gy0 = 0; gx1 = gy1 = 0; }
const GW = gx1 - gx0 + 1, GH = gy1 - gy0 + 1;
const cnt = new Int32Array(GW * GH + 1);
for (let i = 0; i < TRX.length; i++) cnt[(Math.floor(TRY[i] / GRID) - gy0) * GW + (Math.floor(TRX[i] / GRID) - gx0) + 1]++;
for (let i = 0; i < GW * GH; i++) cnt[i + 1] += cnt[i];
const GSTART = Int32Array.from(cnt);
const GCELL = new Int32Array(TRX.length);
{ const fill = Int32Array.from(GSTART);
  for (let i = 0; i < TRX.length; i++) { const c = (Math.floor(TRY[i] / GRID) - gy0) * GW + (Math.floor(TRX[i] / GRID) - gx0); GCELL[fill[c]++] = i; } }
const ATRX = Float64Array.from(TRX), ATRY = Float64Array.from(TRY), ATRR = Float64Array.from(TRR);
// ★`Math.hypot` 이 아니라 `sqrt(a*a+b*b)` — 계약 §5(C 와 바이트를 맞춘다)
const hyp = (a, b) => Math.sqrt(a * a + b * b);
function treeBlockerAt(x, y) {
  const gx = Math.floor(x / GRID) - gx0, gy = Math.floor(y / GRID) - gy0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const cx = gx + dx, cy = gy + dy;
    if (cx < 0 || cy < 0 || cx >= GW || cy >= GH) continue;
    const i = cy * GW + cx;
    for (let k = GSTART[i]; k < GSTART[i + 1]; k++) {
      const t = GCELL[k];
      if (hyp(ATRX[t] - x, ATRY[t] - y) < ATRR[t]) return t;
    }
  }
  return -1;
}
const treeBlocked = (x, y) => treeBlockerAt(x, y) >= 0;
function wallBlocked(nx, ny, ox, oy) {
  const ocx = Math.floor(ox / BUILDING_SIZE), ocy = Math.floor(oy / BUILDING_SIZE);
  const ncx = Math.floor(nx / BUILDING_SIZE), ncy = Math.floor(ny / BUILDING_SIZE);
  if (ocx === ncx && ocy === ncy) return false;
  let cx = ocx, cy = ocy, steps = 0;
  while (cx !== ncx || cy !== ncy) {
    if (++steps > 64) return true;
    const dx = ncx - cx, dy = ncy - cy;
    const sx = dx > 0 ? 1 : dx < 0 ? -1 : 0, sy = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    let nxc = cx, nyc = cy;
    if (sx !== 0 && sy !== 0) {
      const viaX = !edgeStep(cx, cy, sx, 0) && !edgeStep(cx + sx, cy, 0, sy);
      const viaY = !edgeStep(cx, cy, 0, sy) && !edgeStep(cx, cy + sy, sx, 0);
      if (!viaX && !viaY) return true;
      nxc = cx + sx; nyc = cy + sy;
    } else if (sx !== 0) { if (edgeStep(cx, cy, sx, 0)) return true; nxc = cx + sx; }
    else { if (edgeStep(cx, cy, 0, sy)) return true; nyc = cy + sy; }
    cx = nxc; cy = nyc;
  }
  return false;
}
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

// ── 주민 · 목표열(녹음) ──────────────────────────────────────────────────────
// ★목표는 **녹음**이다(주사위 0) — 결정을 안 부르고, 픽스처의 좌표에서 결정적 규칙으로 목표를 만든다.
//   네 팔이 **같은 배열**을 쓰므로, 무엇을 목표로 잡았는지는 게이트·자에 영향이 없다.
function buildWorld(N) {
  const base = F.npcs;
  const x = new Float64Array(N), y = new Float64Array(N);
  const tx = new Float64Array(N), ty = new Float64Array(N);
  const vx = new Float64Array(N), vy = new Float64Array(N), spd = new Float64Array(N);
  // 결정적 씨(xorshift) — 목표는 자기 자리에서 ±600px 안의 한 점(마을 안 이동과 같은 크기)
  let s = 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < N; i++) {
    const b = base[i % base.length];
    // ★10,000명은 **격자 복제**다 — 같은 마을 좌표를 옮겨 붙인다(복제 규칙 한 줄):
    //   k 번째 사본을 (k%7)·1600px 동쪽, ⌊k/7⌋·1600px 남쪽으로 옮긴다(같은 지형 위 · 겹치지 않는 띠).
    const k = Math.floor(i / base.length);
    x[i] = b.x + (k % 7) * 1600; y[i] = b.y + Math.floor(k / 7) * 1600;
    tx[i] = x[i] + (rnd() * 1200 - 600); ty[i] = y[i] + (rnd() * 1200 - 600);
    spd[i] = 0.6;   // 배회(결정의 출력 한 수 — 계약 §1-ⓑ)
  }
  return { N, x, y, tx, ty, vx, vy, spd };
}

// ── ⓐ JS-cur — 걸음 문 산술을 그대로(객체 배열 · 지금 꼴) ─────────────────────
function armJsCur(W, ticks) {
  const arr = [];
  for (let i = 0; i < W.N; i++) arr.push({ x: W.x[i], y: W.y[i], targetX: W.tx[i], targetY: W.ty[i], vx: 0, vy: 0, spd: W.spd[i] });
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      const dx = p.targetX - p.x, dy = p.targetY - p.y, dd = hyp(dx, dy);
      if (dd < 10) { p.vx = 0; p.vy = 0; } else { const sp = MOVE_SPEED * p.spd; p.vx = (dx / dd) * sp; p.vy = (dy / dd) * sp; }
      if (terrBlocked(p.x, p.y)) {
        let ejX = 0, ejY = 0, found = false;
        for (let r = 32; r <= 32 * 16 && !found; r += 32) {
          for (const d of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]]) {
            if (!terrBlocked(p.x + d[0] * r, p.y + d[1] * r)) { ejX = d[0]; ejY = d[1]; found = true; break; }
          }
        }
        if (found) { const len = hyp(ejX, ejY) || 1; const push = MOVE_SPEED * MOVE_DT * 1.8;
          p.x += (ejX / len) * push; p.y += (ejY / len) * push; }
        p.vx = 0; p.vy = 0; continue;
      }
      let nx = p.x + p.vx * MOVE_DT, ny = p.y + p.vy * MOVE_DT;
      if (wallBlocked(nx, p.y, p.x, p.y)) nx = p.x;
      if (wallBlocked(p.x, ny, p.x, p.y)) ny = p.y;
      if (wallBlocked(nx, ny, p.x, p.y)) { nx = p.x; ny = p.y; }
      if (!treeBlocked(p.x, p.y)) {
        const _bx = treeBlocked(nx, p.y), _by = treeBlocked(p.x, ny);
        if (_bx) nx = p.x;
        if (_by) ny = p.y;
        if (treeBlocked(nx, ny)) { nx = p.x; ny = p.y; }
      }
      if (terrBlocked(nx, p.y) && !terrBlocked(p.x, p.y)) {
        const tX = Math.floor(p.x / 32);
        if (nx > p.x) nx = (tX + 1) * 32 - 1; else if (nx < p.x) nx = tX * 32; else nx = p.x;
      }
      if (terrBlocked(p.x, ny) && !terrBlocked(p.x, p.y)) {
        const tY = Math.floor(p.y / 32);
        if (ny > p.y) ny = (tY + 1) * 32 - 1; else if (ny < p.y) ny = tY * 32; else ny = p.y;
      }
      if (terrBlocked(nx, ny) && !terrBlocked(p.x, p.y)) { nx = p.x; ny = p.y; }
      const outW = -nx, outE = nx - F.zoneWidth, outN = -ny, outS = ny - F.zoneHeight;
      const maxOut = Math.max(outW, outE, outN, outS);
      if (maxOut <= 0) { p.x = nx; p.y = ny; }
      else { p.x = clamp(nx, 0, F.zoneWidth); p.y = clamp(ny, 0, F.zoneHeight); }
    }
  }
  const ox = new Float64Array(W.N), oy = new Float64Array(W.N);
  for (let i = 0; i < W.N; i++) { ox[i] = arr[i].x; oy[i] = arr[i].y; }
  return { x: ox, y: oy };
}

// ── ⓑ JS-SoA — 같은 산술 · 열 순회 ───────────────────────────────────────────
function armJsSoa(W, ticks) {
  const x = Float64Array.from(W.x), y = Float64Array.from(W.y);
  const tx = W.tx, ty = W.ty, spd = W.spd, N = W.N;
  const vx = new Float64Array(N), vy = new Float64Array(N);
  const D = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
  for (let t = 0; t < ticks; t++) {
    for (let i = 0; i < N; i++) {
      const px = x[i], py = y[i];
      const dx = tx[i] - px, dy = ty[i] - py, dd = hyp(dx, dy);
      if (dd < 10) { vx[i] = 0; vy[i] = 0; } else { const sp = MOVE_SPEED * spd[i]; vx[i] = (dx / dd) * sp; vy[i] = (dy / dd) * sp; }
      if (terrBlocked(px, py)) {
        let ejX = 0, ejY = 0, found = false;
        for (let r = 32; r <= 32 * 16 && !found; r += 32) {
          for (let d = 0; d < 8; d++) {
            if (!terrBlocked(px + D[d][0] * r, py + D[d][1] * r)) { ejX = D[d][0]; ejY = D[d][1]; found = true; break; }
          }
        }
        if (found) { const len = hyp(ejX, ejY) || 1; const push = MOVE_SPEED * MOVE_DT * 1.8;
          x[i] = px + (ejX / len) * push; y[i] = py + (ejY / len) * push; }
        vx[i] = 0; vy[i] = 0; continue;
      }
      let nx = px + vx[i] * MOVE_DT, ny = py + vy[i] * MOVE_DT;
      if (wallBlocked(nx, py, px, py)) nx = px;
      if (wallBlocked(px, ny, px, py)) ny = py;
      if (wallBlocked(nx, ny, px, py)) { nx = px; ny = py; }
      if (!treeBlocked(px, py)) {
        const _bx = treeBlocked(nx, py), _by = treeBlocked(px, ny);
        if (_bx) nx = px;
        if (_by) ny = py;
        if (treeBlocked(nx, ny)) { nx = px; ny = py; }
      }
      if (terrBlocked(nx, py) && !terrBlocked(px, py)) {
        const tX = Math.floor(px / 32);
        if (nx > px) nx = (tX + 1) * 32 - 1; else if (nx < px) nx = tX * 32; else nx = px;
      }
      if (terrBlocked(px, ny) && !terrBlocked(px, py)) {
        const tY = Math.floor(py / 32);
        if (ny > py) ny = (tY + 1) * 32 - 1; else if (ny < py) ny = tY * 32; else ny = py;
      }
      if (terrBlocked(nx, ny) && !terrBlocked(px, py)) { nx = px; ny = py; }
      const outW = -nx, outE = nx - F.zoneWidth, outN = -ny, outS = ny - F.zoneHeight;
      const maxOut = Math.max(outW, outE, outN, outS);
      if (maxOut <= 0) { x[i] = nx; y[i] = ny; }
      else { x[i] = clamp(nx, 0, F.zoneWidth); y[i] = clamp(ny, 0, F.zoneHeight); }
    }
  }
  return { x, y };
}

// ── ⓒ WASM ──────────────────────────────────────────────────────────────────
function makeWasm(W) {
  const file = path.join(ROOT, 'bench', 'walk-kernel', 'walk.wasm');
  if (!fs.existsSync(file)) return null;
  // 메모리 크기 — 열 + 격자가 다 들어갈 만큼(64KiB 쪽)
  const need = TBITS.length + WBITS.length + (ATRX.length * 8) * 3 + (GCELL.length + GSTART.length) * 4
             + W.N * 8 * 7 + (1 << 20);
  const pages = Math.ceil(need / 65536) + 16;
  const memory = new WebAssembly.Memory({ initial: pages });
  const mod = new WebAssembly.Module(fs.readFileSync(file));
  const inst = new WebAssembly.Instance(mod, { env: { memory } });
  const buf = memory.buffer;
  let off = 1024;
  const put = (Ctor, src) => { const a = new Ctor(buf, off, src.length); a.set(src); const p = off; off += a.byteLength; off = (off + 7) & ~7; return { p, a }; };
  const tb = put(Uint8Array, TBITS), wb = put(Uint8Array, WBITS);
  const trx = put(Float64Array, ATRX), tryy = put(Float64Array, ATRY), trr = put(Float64Array, ATRR);
  const gc = put(Int32Array, GCELL), gs = put(Int32Array, GSTART);
  const nx = put(Float64Array, W.x), ny = put(Float64Array, W.y);
  const ntx = put(Float64Array, W.tx), nty = put(Float64Array, W.ty);
  const nvx = put(Float64Array, W.vx), nvy = put(Float64Array, W.vy), nspd = put(Float64Array, W.spd);
  inst.exports.walk_init(tb.p, TERR.x0, TERR.y0, TERR.W, TERR.H, wb.p, wx0, wy0, WW, WH,
    trx.p, tryy.p, trr.p, gc.p, gs.p, gx0, gy0, GW, GH,
    nx.p, ny.p, ntx.p, nty.p, nvx.p, nvy.p, nspd.p, W.N, F.zoneWidth, F.zoneHeight, MOVE_DT, MOVE_SPEED);
  return { run: (t) => inst.exports.walk_ticks(t), out: () => ({ x: Float64Array.from(nx.a), y: Float64Array.from(ny.a) }),
           reset: () => { nx.a.set(W.x); ny.a.set(W.y); } };
}
// ── ⓓ N-API ─────────────────────────────────────────────────────────────────
function makeNapi(W) {
  const file = path.join(ROOT, 'bench', 'walk-kernel', 'walk.node');
  if (!fs.existsSync(file)) return null;
  let m; try { m = require(file); } catch (e) { return { err: e.message }; }
  const x = Float64Array.from(W.x), y = Float64Array.from(W.y);
  const vx = new Float64Array(W.N), vy = new Float64Array(W.N);
  m.init(TBITS, TERR.x0, TERR.y0, TERR.W, TERR.H, WBITS, wx0, wy0, WW, WH,
    ATRX, ATRY, ATRR, GCELL, GSTART, gx0, gy0, GW, GH,
    x, y, W.tx, W.ty, vx, vy, W.spd, W.N, F.zoneWidth, F.zoneHeight, MOVE_DT);
  return { run: (t) => m.ticks(t), out: () => ({ x: Float64Array.from(x), y: Float64Array.from(y) }),
           reset: () => { x.set(W.x); y.set(W.y); } };
}

// ── 게이트 — 바이트 동일 ─────────────────────────────────────────────────────
function sameBytes(a, b) {
  if (a.length !== b.length) return { ok: false, n: -1, first: null };
  const A = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  const B = new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
  let bad = 0, first = null;
  for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) { bad++; if (first === null) first = (i / 8) | 0; }
  return { ok: bad === 0, n: bad, first };
}

// ── 판 ──────────────────────────────────────────────────────────────────────
const med = (a) => { const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
// GC 열 — `gc()` 직후 한 판의 힙 증가(= 그 팔이 만든 쓰레기). `--expose-gc` 없으면 null.
function allocMB(fn) {
  if (!global.gc) return null;
  global.gc(); const h0 = process.memoryUsage().heapUsed;
  fn();
  const h1 = process.memoryUsage().heapUsed;
  return +((h1 - h0) / 1e6).toFixed(2);
}
function timeIt(fn, runs) {
  const got = [];
  for (let i = 0; i < runs; i++) { const t0 = process.hrtime.bigint(); fn(); got.push(Number(process.hrtime.bigint() - t0) / 1e6); }
  return { p50: med(got), min: Math.min(...got), max: Math.max(...got), runs: got.map((v) => +v.toFixed(1)) };
}

const RESULT = { at: new Date().toISOString(), ticks: TICKS, runs: RUNS, fixture: { n: F.nNpc, walls: F.walls.length, trees: F.trees.length }, sizes: {} };
try { RESULT.sizes.wasm = fs.statSync(path.join(ROOT, 'bench/walk-kernel/walk.wasm')).size; } catch (e) { RESULT.sizes.wasm = null; }
try { RESULT.sizes.napi = fs.statSync(path.join(ROOT, 'bench/walk-kernel/walk.node')).size; } catch (e) { RESULT.sizes.napi = null; }

for (const N of [F.nNpc, 10000]) {
  say(`\n=== N = ${N} · ${TICKS}틱 · ${RUNS}판 ===`);
  const W = buildWorld(N);
  const wasm = makeWasm(W), napi = makeNapi(W);
  // 게이트 먼저(한 판씩)
  const ref = armJsCur(W, TICKS);
  const soa = armJsSoa(W, TICKS);
  const gates = { soa: sameBytes(ref.x, soa.x).ok && sameBytes(ref.y, soa.y).ok };
  let wOut = null, nOut = null;
  if (wasm) { wasm.reset(); wasm.run(TICKS); wOut = wasm.out(); gates.wasm = sameBytes(ref.x, wOut.x).ok && sameBytes(ref.y, wOut.y).ok; }
  if (napi && napi.run) { napi.reset(); napi.run(TICKS); nOut = napi.out(); gates.napi = sameBytes(ref.x, nOut.x).ok && sameBytes(ref.y, nOut.y).ok; }
  const dg = (o) => o ? `${sameBytes(ref.x, o.x).n}/${ref.x.length * 8}B` : '—';
  say(`  게이트  SoA ${gates.soa ? '✅' : '✗ ' + dg(soa)} · WASM ${wasm ? (gates.wasm ? '✅' : '✗ ' + dg(wOut)) : '(없음)'} · N-API ${napi && napi.run ? (gates.napi ? '✅' : '✗ ' + dg(nOut)) : '(없음)'}`);

  const T = {};
  T.jsCur = timeIt(() => armJsCur(W, TICKS), RUNS);
  T.jsSoa = timeIt(() => armJsSoa(W, TICKS), RUNS);
  if (wasm) T.wasm = timeIt(() => { wasm.reset(); wasm.run(TICKS); }, RUNS);
  if (napi && napi.run) T.napi = timeIt(() => { napi.reset(); napi.run(TICKS); }, RUNS);
  const per = (ms) => (ms * 1000) / (N * TICKS) * TICKS / TICKS;   // 사람당 µs(한 틱 기준)
  const usPer = (ms) => +((ms / TICKS) * 1000 / N).toFixed(3);
  const tickMs = (ms) => +(ms / TICKS).toFixed(3);
  const A = {};
  A.jsCur = allocMB(() => armJsCur(W, TICKS));
  A.jsSoa = allocMB(() => armJsSoa(W, TICKS));
  if (wasm) A.wasm = allocMB(() => { wasm.reset(); wasm.run(TICKS); });
  if (napi && napi.run) A.napi = allocMB(() => { napi.reset(); napi.run(TICKS); });
  const row = (k, g) => {
    if (!T[k]) { say(`  ${k.padEnd(7)} (없음)`); return; }
    const ok = g === undefined ? true : g;
    say(`  ${k.padEnd(7)} ${ok ? '  ' : '★빨강'} 사람당 ${String(usPer(T[k].p50)).padStart(7)}µs · 한 틱 ${String(tickMs(T[k].p50)).padStart(8)}ms · 예산 ${(tickMs(T[k].p50) / 33.3).toFixed(2)}배 · GC ${A[k] === null ? '(–gc 없음)' : A[k] + 'MB'} · 판 ${T[k].runs.join('/')}`);
  };
  row('jsCur'); row('jsSoa', gates.soa); row('wasm', gates.wasm); row('napi', gates.napi);
  RESULT[`n${N}`] = { N, gates, us: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, usPer(v.p50)])),
    tickMs: Object.fromEntries(Object.entries(T).map(([k, v]) => [k, tickMs(v.p50)])), raw: T, allocMB: A };
}
fs.writeFileSync(OUT, JSON.stringify(RESULT, null, 1));
say(`\n[JSON] ${OUT}`);
