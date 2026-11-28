#!/usr/bin/env node
// @regress   ← 통합 러너가 이 표를 보고 자기 목록을 만든다(scripts/run-regress.sh · 표 없으면 안 돈다)
// @bait 4   ← [T1499] 미끼 판정 줄 수(파일 안 · `test-harness-lint` ⑲b 가 센다)
// === scripts/test-t1499-vclock-walk.js — 판 자(가상 시계) 몸 걸음: 칸마다 차례로 · 막힘 그대로 · 실제 하루만큼 · 끔 = 종전 바이트 (T1499) ===
//
// ★무엇을 보나(서버 0 — 존 본 파일에서 걸음 함수 셋(`_t1499Blocked` · `_t1499Walk` · `_t1295Walk`)만 글자로 떼어 곁 상자에서 돌린다)
//   곁 상자: 32 px 칸 64 × 64 · 지형 막힘 칸 · 벽 칸 · 칸마다 빠르기(길 등급 흉내) · 길 도장 · 몸 칸 쓰기(`_desPut`)를 적는다.
//   ① 켬 · 칸마다 차례로: 몸 자리가 바뀔 때마다 이전 칸과 체비쇼프 1 칸 안(칸을 건너뛰지 않는다 — 정해진 것 2)
//   ② 켬 · 막힘 그대로: 몸이 막힌 칸(지형 · 벽)에 한 번도 서지 않는다 · 막힌 칸을 지나는 길이면 그 앞에 선다(길은 남긴다)
//   ③ 켬 · 실제 하루만큼: 열린 길 · 고른 빠르기에서 판 하루(dt 합 T · 배율 s) 동안 간 거리 = min(길 길이, v × s × T) — 실제 시계 하루 걸음(정해진 것 1)
//      칸마다 빠르기가 다르면 ≤ v최대 × s × T(실제 하루보다 더 걷지 않는다)
//   ④ 켬 · 칸에서 나는 사건: 칸이 바뀔 때마다 길 도장 한 번(도장 수 = 칸 바뀜 수)
//   ⑤ 끔 · 종전 바이트: 손잡이 끔 `_t1295Walk` 가 main 의 종전 함수(이 파일 안에 그대로 옮겨 둔 대조군)와 끝 자리 · pathIndex · 셈 · 도장이 바이트로 같다
//   ⑥ 미끼 넷(이 파일 안에서 떼어 낸 글자를 한 자리씩 비튼 사본 — 각 미끼가 제 줄을 빨갛게 하는가):
//      skip = 토막 상한 16 → 80 px(칸 건너뜀) → ① · wall = 막힘 판정을 버린 사본 → ② · more = 걸음 빠르기 × 1.25 → ③ · off = 끔에서도 새 걸음 → ⑤
// 실행: node scripts/test-t1499-vclock-walk.js   (1초 안)
'use strict';
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m, x) => { c ? pass++ : fail++; console.log((c ? '  ✓ ' : '  ✗ ') + m + (x !== undefined && x !== '' ? `  ${x}` : '')); };
const _dv = new DataView(new ArrayBuffer(16));
const sameF64 = (a, b) => { _dv.setFloat64(0, a); _dv.setFloat64(8, b); return _dv.getUint32(0) === _dv.getUint32(8) && _dv.getUint32(4) === _dv.getUint32(12); };

const ZSRC = fs.readFileSync(path.join(ROOT, 'server', 'zone' + '.js'), 'utf8');
// 함수 글자 떼기 — `function 이름(` 부터 짝 맞는 닫는 괄호까지(이 셋에는 글자 안 괄호가 없다)
function cut(name) {
  const i = ZSRC.indexOf('\nfunction ' + name + '(');
  if (i < 0) return null;
  let j = ZSRC.indexOf('{', i), dep = 0;
  for (; j < ZSRC.length; j++) { const c = ZSRC[j]; if (c === '{') dep++; else if (c === '}') { dep--; if (dep === 0) break; } }
  return ZSRC.slice(i + 1, j + 1);
}
const SRC = { blocked: cut('_t1499Blocked'), walk: cut('_t1499Walk'), w1295: cut('_t1295Walk') };
const knobLine = /const T1499_VW = process\.env\.T1499_VCLOCK_WALK === '1';/.test(ZSRC);
// main 종전 `_t1295Walk`(c976f40ef · 꼬리 주석만 뺐다) — 대조군. 제품에는 이 꼴이 켬 줄 하나만 더한 채로 남는다.
const LEGACY = [
  'function _t1295Walk(p, dt, sub) {',
  '  if (p._t1393Own) { p.vx = 0; p.vy = 0; return true; }',
  '  const s = SimVillages.t1295S ? SimVillages.t1295S(p) : 1;',
  '  if (!(s > 1)) return false;',
  '  if (!sub && SimVillages.t1316K) { const K = SimVillages.t1316K(p, dt); if (K > 1) dt /= K; }',
  '  p.vx = 0; p.vy = 0;',
  '  const P = p.path, M = P === p._t791P, n = P ? (M ? p._t791Pn : P.length) : 0;',
  '  if (!P || !(p.pathIndex < n)) return true;',
  '  let x = _xyX(p), y = _xyY(p), left = dt, moved = 0;',
  '  while (left > 0 && p.pathIndex < n) {',
  '    let wx, wy; if (M && p.pathIndex === 0) { wx = p._t791Px; wy = p._t791Py; } else { const w = P[p.pathIndex]; wx = w.x; wy = w.y; }',
  '    const dx = wx - x, dy = wy - y, d = Math.hypot(dx, dy), v = _desSpeed(x, y) * s * (p._huntSpd > 0 ? p._huntSpd : 1);',
  '    if (!(v > 0)) break;',
  '    if (d <= v * left) { x = wx; y = wy; left -= d / v; moved += d; p.pathIndex++; }',
  '    else { const k = v * left / d; x += dx * k; y += dy * k; moved += v * left; left = 0; }',
  '  }',
  '  if (moved > 0) { _desPut(p, x, y); Roads.stampEntityPx(p, x, y); p.dirty = true; }',
  '  const S = SimVillages._t1295Stat; if (S) { S.walks++; S.walkPx += moved; }',
  '  return true;',
  '}'].join('\n');

// ── 곁 상자 ─────────────────────────────────────────────────────────────────────────────────────────
const N = 64, CS = 32;
let _s = 0x1499abcd;
const rnd = () => { _s ^= _s << 13; _s >>>= 0; _s ^= _s >> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; };
function world(seed, blockP, varSpeed) {
  _s = seed >>> 0 || 1;
  const terr = new Uint8Array(N * N), wall = new Uint8Array(N * N), spd = new Float64Array(N * N);
  for (let i = 0; i < N * N; i++) { const r = rnd(); if (r < blockP / 2) terr[i] = 1; else if (r < blockP) wall[i] = 1; spd[i] = varSpeed ? 40 + Math.floor(rnd() * 4) * 20 : 60; }
  return { terr, wall, spd };
}
const cellIx = (x, y) => { const cx = Math.floor(x / CS), cy = Math.floor(y / CS); return (cx < 0 || cy < 0 || cx >= N || cy >= N) ? -1 : cy * N + cx; };
function box(src, W, knob) {
  const log = { puts: [], stamps: 0 };
  const ctx = {
    Math, process: { env: {} }, WeakMap, log,
    T1499_VW: knob, T1441_DOOR_OWNER: false, _t1441Wv: null,
    SimVillages: { t1295S: (p) => p._s, t1316K: () => 1, _t1295Stat: { walks: 0, walkPx: 0 } },
    Roads: { stampEntityPx: () => { log.stamps++; } },
    _xyX: (p) => p.x, _xyY: (p) => p.y,
    _desPut: (p, x, y) => { p.x = x; p.y = y; log.puts.push(x, y); },
    _desSpeed: (x, y) => { const i = cellIx(x, y); return i < 0 ? 60 : W.spd[i]; },
    isTerrainBlockedLocal: (x, y) => { const i = cellIx(x, y); return i < 0 || W.terr[i] === 1; },
    isBlockedByWall: (x, y) => { const i = cellIx(x, y); return i >= 0 && W.wall[i] === 1; },
    isBlockedByTree: () => false,
  };
  vm.createContext(ctx);
  vm.runInContext(`const _t1499Mv = new WeakMap(); const _t1499Stat = { calls:0, steps:0, px:0, blocked:0, bT:0, bW:0, bR:0, stamps:0 };\n${src}\n;this.walk = _t1295Walk;`, ctx);
  return ctx;
}
// 열린 칸 위의 길 — 칸 중심 점을 4 · 8 이웃으로 이어 간다(blocked = 막힌 칸을 지나도 되는 길 · 막힘 판정 시험용)
function pathOn(W, len, throughBlocked) {
  const open = (i) => throughBlocked || (W.terr[i] === 0 && W.wall[i] === 0);
  let cx, cy, t = 0; do { cx = 4 + Math.floor(rnd() * (N - 8)); cy = 4 + Math.floor(rnd() * (N - 8)); } while (!open(cy * N + cx) && ++t < 1000);
  const P = [{ x: cx * CS + 16, y: cy * CS + 16 }];
  for (let k = 0; k < len; k++) {
    let ok2 = false;
    for (let tr = 0; tr < 20 && !ok2; tr++) {
      const nx = cx + Math.floor(rnd() * 7) - 3, ny = cy + Math.floor(rnd() * 7) - 3;
      if (nx < 1 || ny < 1 || nx >= N - 1 || ny >= N - 1 || (nx === cx && ny === cy)) continue;
      // 곧은 마디가 지나는 칸이 다 열려야(열린 길) — 반 칸 걸음으로 본다
      const ax = cx * CS + 16, ay = cy * CS + 16, bx = nx * CS + 16, by = ny * CS + 16, L = Math.hypot(bx - ax, by - ay);
      let clear = true; for (let q = 0; q <= L; q += 4) { const i = cellIx(ax + (bx - ax) * q / L, ay + (by - ay) * q / L); if (!open(i)) { clear = false; break; } }
      if (!clear) continue;
      cx = nx; cy = ny; P.push({ x: bx, y: by }); ok2 = true;
    }
    if (!ok2) break;
  }
  return P;
}
const plen = (p0, P) => { let L = 0, x = p0.x, y = p0.y; for (const w of P) { L += Math.hypot(w.x - x, w.y - y); x = w.x; y = w.y; } return L; };

// 한 판: 길 하나를 판 하루(T) 동안 조각 dt 로 걷는다 — 자리 기록 · 셈을 돌려준다
function walkDay(src, W, knob, P, s, T, parts) {
  const B = box(src, W, knob);
  const p = { x: P[0].x, y: P[0].y, path: P.slice(1), pathIndex: 0, _s: s, floor: 0, simVillageId: 1 };
  const x0 = p.x, y0 = p.y;
  for (let k = 0; k < parts; k++) B.walk(p, T / parts, 1);
  return { p, x0, y0, log: B.log, stat: B.SimVillages._t1295Stat };
}
// 판정 묶음 — 사본(src)을 받아 ①~⑤ 의 빨강 수를 돌려준다(미끼가 제 줄을 빨갛게 하는가)
function suite(src, say) {
  const r = { jump: 0, inBlk: 0, stopBad: 0, dist: 0, over: 0, stampBad: 0, off: 0, cases: 0, blkCases: 0, short: 0, long: 0 };
  const s = 5760, T = 0.25;   // 판 하루 250 ms ↔ 실제 하루 1,440 s(배율 5760)
  // ①②④ 막힌 칸이 섞인 세계 · 고르지 않은 빠르기 · 막힌 칸을 지나는 길 포함
  for (let w = 0; w < 6; w++) {
    const W = world(0x51 + w * 977, 0.18, true);
    for (let c = 0; c < 40; c++) {
      const thru = c % 2 === 1, P = pathOn(W, 30, thru); if (P.length < 3) continue;
      const parts = 1 + (c % 8);
      const o = walkDay(src, W, true, P, s, T / (c % 3 === 0 ? 400 : 1), parts);
      r.cases++;
      let px = o.x0, py = o.y0, cellCh = 0;
      for (let i = 0; i < o.log.puts.length; i += 2) {
        const x = o.log.puts[i], y = o.log.puts[i + 1];
        const a = Math.floor(px / CS), b = Math.floor(py / CS), a2 = Math.floor(x / CS), b2 = Math.floor(y / CS);
        if (Math.max(Math.abs(a2 - a), Math.abs(b2 - b)) > 1) r.jump++;
        if (a2 !== a || b2 !== b) cellCh++;
        const ix = cellIx(x, y); if (ix < 0 || W.terr[ix] || W.wall[ix]) r.inBlk++;
        px = x; py = y;
      }
      if (cellCh !== o.log.stamps) r.stampBad++;
      if (thru) {
        // 막힌 칸이 앞에 있으면 끝까지 못 간다(길은 남는다)
        let hit = false; { let x = P[0].x, y = P[0].y; for (let k = 1; k < P.length && !hit; k++) { const L = Math.hypot(P[k].x - x, P[k].y - y); for (let q = 0; q <= L; q += 2) { const i = cellIx(x + (P[k].x - x) * q / L, y + (P[k].y - y) * q / L); if (i < 0 || W.terr[i] || W.wall[i]) { hit = true; break; } } x = P[k].x; y = P[k].y; } }
        if (hit) { r.blkCases++; if (o.p.pathIndex >= P.length - 1) r.stopBad++; }
      }
    }
  }
  // ③ 열린 세계 · 고른 빠르기 — 간 거리 = min(길, v·s·T)
  const W0 = world(0x777, 0, false);
  for (let c = 0; c < 120; c++) {
    const P = pathOn(W0, 6 + (c % 50), false); if (P.length < 2) continue;
    const Tc = T * (c % 4 === 0 ? 1 : c % 4 === 1 ? 0.004 : c % 4 === 2 ? 0.0004 : 0.04);
    const o = walkDay(src, W0, true, P, s, Tc, 1 + (c % 7));
    const want = Math.min(plen(P[0], P.slice(1)), 60 * s * Tc), got = o.stat.walkPx;
    if (want < plen(P[0], P.slice(1)) - 1e-6) r.short++; else r.long++;
    if (!(Math.abs(got - want) <= 1e-6 * Math.max(1, want))) r.dist++;
  }
  // ③b 고르지 않은 빠르기 — 실제 하루 최대 걸음을 넘지 않는다
  const W1 = world(0x999, 0, true);
  for (let c = 0; c < 80; c++) {
    const P = pathOn(W1, 40, false); if (P.length < 2) continue;
    const o = walkDay(src, W1, true, P, s, T * 0.01, 3);
    if (o.stat.walkPx > 100 * s * T * 0.01 + 1e-6) r.over++;
  }
  // ⑤ 끔 = 종전 바이트
  for (let w = 0; w < 4; w++) {
    const W = world(0x123 + w, 0.1, true);
    for (let c = 0; c < 60; c++) {
      const P = pathOn(W, 20, c % 2 === 1); if (P.length < 2) continue;
      const T2 = T * [1, 0.003, 0.0002][c % 3], parts = 1 + (c % 5);
      const a = walkDay(src, W, false, P, s * (c % 7 === 0 ? 0.0001 : 1), T2, parts), b = walkDay(LEGACY, W, false, P, s * (c % 7 === 0 ? 0.0001 : 1), T2, parts);
      const same = sameF64(a.p.x, b.p.x) && sameF64(a.p.y, b.p.y) && a.p.pathIndex === b.p.pathIndex && sameF64(a.stat.walkPx, b.stat.walkPx) && a.stat.walks === b.stat.walks
        && a.log.stamps === b.log.stamps && a.log.puts.length === b.log.puts.length && !!a.p.dirty === !!b.p.dirty;
      if (!same) r.off++;
    }
  }
  if (say) console.log(`    (판 ${r.cases} · 막힌 칸 걸린 길 ${r.blkCases} · ③ 길 끝까지 ${r.short === 0 ? 0 : r.long}/하루 한도 ${r.short})`);
  return r;
}

console.log('\n=== T1499 판 자 몸 걸음 — 칸마다 차례로 · 막힘 · 실제 하루 · 끔 바이트 ===');
ok(knobLine && SRC.blocked && SRC.walk && SRC.w1295, '[전제] 존 본 파일에서 손잡이 줄 · 걸음 함수 셋을 떼었다', `${!!SRC.blocked}/${!!SRC.walk}/${!!SRC.w1295}`);
ok(/if \(T1499_VW\) return _t1499Walk\(p, dt, s, P, M, n\);/.test(SRC.w1295 || ''), '[전제] 켬 갈래는 `_t1295Walk` 안 한 줄(갈 길이 있을 때만 새 걸음)');
const PROD = [SRC.blocked, SRC.walk, SRC.w1295].join('\n');
const R = suite(PROD, true);
ok(R.cases >= 200 && R.blkCases >= 20 && R.short >= 20 && R.long >= 20, '[상황] 판 넉넉 · 막힌 칸 걸린 길 · ③ 하루 한도에 걸린 길과 길 끝에 닿은 길이 둘 다 있다(한쪽만이면 자명 통과)', `판 ${R.cases} · 막힘 ${R.blkCases} · 한도 ${R.short} · 끝 ${R.long}`);
ok(R.jump === 0, '★★① 켬 — 몸 자리가 바뀔 때 칸을 건너뛰지 않는다(이전 칸과 체비쇼프 ≤ 1)', `건너뜀 ${R.jump}`);
ok(R.inBlk === 0 && R.stopBad === 0, '★★② 켬 — 막힌 칸(지형 · 벽)에 서지 않는다 · 막힌 칸 걸린 길은 그 앞에 선다', `막힌 칸에 섬 ${R.inBlk} · 지나감 ${R.stopBad}`);
ok(R.dist === 0, '★★③ 켬 — 판 하루 간 거리 = min(길 길이, v × s × T)(실제 시계 하루 걸음 · 상대 1e-6)', `틀림 ${R.dist}`);
ok(R.over === 0, '★③b 켬 — 칸마다 빠르기가 달라도 실제 하루 최대 걸음을 넘지 않는다', `넘음 ${R.over}`);
ok(R.stampBad === 0, '★④ 켬 — 칸이 바뀔 때마다 길 도장 한 번(칸에서 나는 사건이 다 난다)', `틀림 ${R.stampBad}`);
ok(R.off === 0, '★★⑤ 끔 — main 종전 `_t1295Walk` 와 끝 자리 · pathIndex · 셈 · 도장 바이트 같음', `다름 ${R.off}`);

console.log('\n⑥ 미끼 — 떼어 낸 글자를 한 자리씩 비튼 사본');
const bait = (from, to) => { const t = PROD.replace(from, to); return t === PROD ? null : t; };
{
  const b = bait('Math.min(d, 16, v * left)', 'Math.min(d, 80, v * left)'); const r = b && suite(b);
  ok(!!r && r.jump > 0, '★미끼 skip(바꾼 자리: 토막 상한 16 → 80 px) — ① 칸 건너뜀이 빨갛다', r ? `건너뜀 ${r.jump}` : '사본 못 만듦');
}
{
  const b = bait('if (b) { blk = b;', 'if (false) { blk = b;'); const r = b && suite(b);
  ok(!!r && (r.inBlk > 0 || r.stopBad > 0), '★미끼 wall(바꾼 자리: 막힘 판정 버림) — ② 막힌 칸이 빨갛다', r ? `막힌 칸에 섬 ${r.inBlk} · 지나감 ${r.stopBad}` : '사본 못 만듦');
}
{
  const b = bait('const v = _desSpeed(x, y) * s * hs;', 'const v = _desSpeed(x, y) * s * hs * 1.25;'); const r = b && suite(b);
  ok(!!r && r.dist > 0, '★미끼 more(바꾼 자리: 걸음 빠르기 × 1.25 — 실제 하루보다 더 걷는다) — ③ 이 빨갛다', r ? `③ ${r.dist} · ③b ${r.over}` : '사본 못 만듦');
}
{
  const b = bait('if (T1499_VW) return _t1499Walk(', 'if (T1499_VW || p.pathIndex >= 0) return _t1499Walk('); const r = b && suite(b);
  ok(!!r && r.off > 0, '★미끼 off(바꾼 자리: 끔에서도 새 걸음) — ⑤ 끔 바이트가 빨갛다', r ? `다름 ${r.off}` : '사본 못 만듦');
}
console.log(`\n${fail ? '✗' : '✓'} T1499 판 자 걸음: ${pass} 통과 · ${fail} 실패`);
process.exit(fail ? 1 : 0);
