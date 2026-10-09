// =============================================================================
// server/chunk-gates.js — T678 청크 문 그래프(계층 길찾기) 1단계 · 손잡이 `T678_GATES`(zone.js · 기본 끔)
// =============================================================================
// ★무엇 — 청크(존 `chunkManager.chunkSize` · 32칸) 경계의 **문**(통행 칸 짝이 이어진 구간 하나 = 문 하나)과,
//   청크 안 칸마다 "그 문까지 몇 걸음"(축 4방 BFS) 표를 둔다. 먼 길은 **문 그래프 다익스트라** → 청크 안 표를 따라 내려가 칸 길을 짓는다.
//   ⇒ "닿는가 · 얼마나"를 칸 A* 없이 답한다(T670 ③: A* 실패 시간의 전부가 예산 부족 · 한 방 32.5 ms).
// ★술어는 존이 넘긴 **그 둘**이다(사본 0) — `pass(cx,cy)`(= `!isTerrainBlockedLocal(셀 중심)` · 다리 통행 · 환호 막힘)와
//   `step(fx,fy,tx,ty)`(= `!isBlockedByWall(셀 중심 → 이웃 셀 중심, 층 0)` · 벽 변 · 계단 옆). `pathfind.js` 의 간선 규칙과 같은 둘이다
//   (커널 `sim/path-core.js` 무접촉). 칸 비용은 1(개울 ×2 · 길 선호는 안 쓴다 — 길이가 A* 와 다를 수 있는 자리 · 보고 표).
// ★조각 — 표 짓기는 **틱마다 예산만큼**(술어 부름 수) 이어서 한다. 예산은 부르는 쪽이 준다(주민 A* 예산 1,500 그 수 · 새 수 0).
//   다 안 지어진 청크를 묻는 길은 `unknown` 을 돌려준다(부르는 쪽이 종전 A* 로 간다) — 몰아서 짓지 않는다.
// ★무효화 — 표는 **판(gen)** 을 든다. 지형 판(다리·환호)이 바뀌면 전부, 건물 서명이 바뀐 청크는 그 청크와 이웃 넷만 낡는다.
//   낡은 표는 **다시 지어질 때까지 그대로 쓴다**(장애물을 되풀이 놓고 걷는 공격이 다시 짓기를 몰아도 한 틱 예산을 넘지 않는다) —
//   걸음은 늘 콜라이더가 확인하고(이동 문), 막히면 막힘 감지가 길을 다시 묻는다.
'use strict';

const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];   // E S W N — 비트 1 2 4 8
const UNR = 0xffff;

function create(opt) {
  const C = opt.chunkCells, CW = opt.cellsW, CH = opt.cellsH;
  const NX = Math.ceil(CW / C), NY = Math.ceil(CH / C);
  const pass = opt.pass, step = opt.step;
  const recs = new Map();        // 청크 번호 → 표
  const queue = [], queued = new Set();
  let gen = 1;                    // 지형 판(전부 낡게)
  let building = null;            // 짓는 중(조각)
  const st = { built: 0, rebuilt: 0, predCalls: 0, buildMs: 0, maxSliceMs: 0, queries: 0, unknown: 0, far: 0, blocked: 0, unreach: 0, found: 0, stale: 0,
    sigChecks: 0, sigInval: 0, invalAll: 0, qMs: 0, qMaxMs: 0 };

  const chunkOf = (cx, cy) => Math.floor(cy / C) * NX + Math.floor(cx / C);

  // ── 짓기(조각) ────────────────────────────────────────────────────────────
  function newBuild(ci) {
    const X = ci % NX, Y = (ci / NX) | 0, x0 = X * C, y0 = Y * C;
    const w = Math.min(C, CW - x0), h = Math.min(C, CH - y0);
    return { ci, X, Y, x0, y0, w, h, ph: 0, i: 0, gen, pass: new Uint8Array(w * h), open: new Uint8Array(w * h),
      // 경계 바깥 칸: 통행 · 바깥 → 안 간선(문 짝은 두 방향 다 열려야 문이다)
      bOut: [new Uint8Array(h), new Uint8Array(w), new Uint8Array(h), new Uint8Array(w)], bBack: [new Uint8Array(h), new Uint8Array(w), new Uint8Array(h), new Uint8Array(w)],
      bAlong: [new Uint8Array(h), new Uint8Array(w), new Uint8Array(h), new Uint8Array(w)],   // 바깥 줄의 j ↔ j+1 두 방향 다 열림(문 구간을 끊는 데 쓴다)
      gates: null, t0: 0 };
  }
  // 한 단계 = 술어 한 부름(또는 계산 한 칸) — 예산을 그 수로 센다
  function work(b, budget) {
    let used = 0;
    const W = b.w, H = b.h, n = W * H;
    while (used < budget) {
      if (b.ph === 0) {   // 칸 통행
        if (b.i >= n) { b.ph = 1; b.i = 0; continue; }
        const lx = b.i % W, ly = (b.i / W) | 0;
        b.pass[b.i] = pass(b.x0 + lx, b.y0 + ly) ? 1 : 0; used++; b.i++;
      } else if (b.ph === 1) {   // 칸마다 네 방향 간선(그 칸이 통행일 때만 · 이웃이 통행일 때만 — `pathfind` 가 부르는 그 꼴)
        if (b.i >= n * 4) { b.ph = 2; b.i = 0; continue; }
        const c = b.i >> 2, d = b.i & 3; b.i++;
        if (!b.pass[c]) continue;
        const lx = c % W, ly = (c / W) | 0, nx = lx + DIRS[d][0], ny = ly + DIRS[d][1];
        const gx = b.x0 + lx, gy = b.y0 + ly, tx = gx + DIRS[d][0], ty = gy + DIRS[d][1];
        if (tx < 0 || ty < 0 || tx >= CW || ty >= CH) continue;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H) { if (!b.pass[ny * W + nx]) continue; }
        if (step(gx, gy, tx, ty)) b.open[c] |= (1 << d);
        used++;
      } else if (b.ph === 2) {   // 경계 바깥 칸 통행 + 되돌아오는 간선(문 짝)
        const sides = [H, W, H, W];
        let s = 0, k = b.i; while (s < 4 && k >= sides[s]) { k -= sides[s]; s++; }
        if (s >= 4) { b.ph = 3; b.i = 0; continue; }
        b.i++;
        const [ix, iy] = s === 0 ? [W - 1, k] : s === 1 ? [k, H - 1] : s === 2 ? [0, k] : [k, 0];
        const c = iy * W + ix, gx = b.x0 + ix, gy = b.y0 + iy, ox = gx + DIRS[s][0], oy = gy + DIRS[s][1];
        if (!b.pass[c] || !(b.open[c] & (1 << s)) || ox < 0 || oy < 0 || ox >= CW || oy >= CH) continue;
        const po = pass(ox, oy); used++;
        b.bOut[s][k] = po ? 1 : 0;
        if (po && step(ox, oy, gx, gy)) b.bBack[s][k] = 1;
        used++;
        if (po && k > 0 && b.bOut[s][k - 1]) {   // 바깥 줄 이웃(k−1 ↔ k) — 변을 따라 가는 축
          const [ax, ay] = (s === 0 || s === 2) ? [ox, oy - 1] : [ox - 1, oy];
          if (step(ax, ay, ox, oy) && step(ox, oy, ax, ay)) b.bAlong[s][k - 1] = 1;
          used += 2;
        }
      } else if (b.ph === 3) {   // 문 뽑기 — 변마다 연속 구간
        b.gates = [];
        const sides = [H, W, H, W];
        for (let s = 0; s < 4; s++) {
          let k = 0;
          while (k < sides[s]) {
            const ok = (j) => { const [ix, iy] = s === 0 ? [W - 1, j] : s === 1 ? [j, H - 1] : s === 2 ? [0, j] : [j, 0]; const c = iy * W + ix;
              return b.pass[c] && (b.open[c] & (1 << s)) && b.bOut[s][j] && b.bBack[s][j]; };
            if (!ok(k)) { k++; continue; }
            // 구간은 안쪽 줄과 바깥 줄이 **둘 다** j ↔ j+1 로 이어질 때만 늘인다(그래야 구간의 어느 짝으로 건너도 대표 칸과 닿는다)
            const inLink = (j) => { const [ix, iy] = (s === 0 || s === 2) ? [s === 0 ? W - 1 : 0, j] : [j, s === 1 ? H - 1 : 0]; const c = iy * W + ix, d = (s === 0 || s === 2) ? 1 : 0;
              const c2 = (s === 0 || s === 2) ? c + W : c + 1; return (b.open[c] & (1 << d)) && (b.open[c2] & (1 << (d + 2))); };
            let e = k; while (e + 1 < sides[s] && ok(e + 1) && inLink(e) && b.bAlong[s][e]) e++;
            const m = (k + e) >> 1;
            const [ix, iy] = s === 0 ? [W - 1, m] : s === 1 ? [m, H - 1] : s === 2 ? [0, m] : [m, 0];
            const gx = b.x0 + ix, gy = b.y0 + iy;
            // 문 열쇠 = 경계 하나(세로 V · 가로 H) + 구간 시작 칸 — 양쪽 청크가 같은 열쇠를 짓는다
            const key = (s === 0 || s === 2) ? 'V' + (s === 0 ? gx + 1 : gx) + ':' + (b.y0 + k) : 'H' + (s === 1 ? gy + 1 : gy) + ':' + (b.x0 + k);
            b.gates.push({ s, key, c: iy * W + ix, gx, gy, ox: gx + DIRS[s][0], oy: gy + DIRS[s][1], T: null });
            k = e + 1;
          }
        }
        b.ph = 4; b.i = 0; used++;
      } else if (b.ph === 4) {   // 문마다 거리 표(칸 → 문 대표 칸 · 앞으로 가는 간선 · 되짚는 BFS)
        if (b.i >= b.gates.length) { b.ph = 5; continue; }
        b.gates[b.i].T = bfsTo(b, b.gates[b.i].c); used++; b.i++;   // 비트 위 BFS 한 번 = 한 단계(술어 부름 0)
      } else return used;
    }
    return used;
  }
  // 되짚는 BFS — 표[c] = c 에서 앞으로 가는 간선으로 목표 칸까지 걸음 수
  function bfsTo(b, goal) {
    const W = b.w, H = b.h, n = W * H, T = new Uint16Array(n).fill(UNR), q = new Int32Array(n);
    let qh = 0, qt = 0; T[goal] = 0; q[qt++] = goal;
    while (qh < qt) {
      const u = q[qh++], ux = u % W, uy = (u / W) | 0, du = T[u] + 1;
      for (let d = 0; d < 4; d++) {   // v → u 가 열린 v(= u 의 이웃 v 에서 d^2 방향 비트)
        const vx = ux - DIRS[d][0], vy = uy - DIRS[d][1];
        if (vx < 0 || vy < 0 || vx >= W || vy >= H) continue;
        const v = vy * W + vx;
        if (T[v] !== UNR || !b.pass[v] || !(b.open[v] & (1 << d))) continue;
        T[v] = du; q[qt++] = v;
      }
    }
    return T;
  }

  function enqueue(ci) { if (!queued.has(ci)) { queued.add(ci); queue.push(ci); } }
  // 틱마다 — 예산(술어 부름 수)만큼 이어서 짓는다
  function tick(budget, nowMs) {
    if (!budget) return 0;
    const t0 = nowMs ? nowMs() : 0;
    let left = budget, done = 0;
    while (left > 0) {
      if (!building) {
        if (!queue.length) break;
        const ci = queue.shift(); queued.delete(ci);
        const r = recs.get(ci);
        if (r && r.gen === gen && !r.dirty) continue;   // 그 사이 이미 새것
        building = newBuild(ci);
      }
      const u = work(building, left); left -= Math.max(1, u); st.predCalls += u;
      if (building.ph === 5) {
        const b = building, prev = recs.get(b.ci);
        recs.set(b.ci, { ci: b.ci, X: b.X, Y: b.Y, x0: b.x0, y0: b.y0, w: b.w, h: b.h, gen: b.gen, dirty: false, pass: b.pass, open: b.open, gates: b.gates, sig: prev ? prev.sig : undefined });
        if (prev) st.rebuilt++; else st.built++;
        building = null; done++;
      }
    }
    if (nowMs) { const ms = nowMs() - t0; st.buildMs += ms; if (ms > st.maxSliceMs) st.maxSliceMs = ms; }
    return done;
  }

  // ── 묻기 ────────────────────────────────────────────────────────────────
  // 반환: { res: 'far'|'blocked'|'unknown'|'unreach'|'found', cells?: [[cx,cy],…](출발 칸 빼고 목표 칸까지), len? }
  function route(sx, sy, gx, gy, R) {
    st.queries++;
    if (Math.abs(gx - sx) + Math.abs(gy - sy) > R) { st.far++; return { res: 'far' }; }
    if (sx === gx && sy === gy) { st.found++; return { res: 'found', cells: [], len: 0 }; }   // `pathfind` 같은 칸 — 탐색 없이
    if (!pass(sx, sy) || !pass(gx, gy)) { st.blocked++; return { res: 'blocked' }; }
    const x0 = Math.max(0, Math.floor((sx - R) / C)), x1 = Math.min(NX - 1, Math.floor((sx + R) / C));
    const y0 = Math.max(0, Math.floor((sy - R) / C)), y1 = Math.min(NY - 1, Math.floor((sy + R) / C));
    let miss = false, stale = false;
    const win = [];
    for (let Y = y0; Y <= y1; Y++) for (let X = x0; X <= x1; X++) {
      const ci = Y * NX + X, r = recs.get(ci);
      if (!r) { miss = true; enqueue(ci); continue; }
      if (r.gen !== gen || r.dirty) { stale = true; enqueue(ci); }
      win.push(r);
    }
    if (miss) { st.unknown++; return { res: 'unknown' }; }
    if (stale) st.stale++;
    const rs = recs.get(chunkOf(sx, sy)), rg = recs.get(chunkOf(gx, gy));
    const sIdx = (sy - rs.y0) * rs.w + (sx - rs.x0), gIdx = (gy - rg.y0) * rg.w + (gx - rg.x0);
    const TG = bfsTo(rg, gIdx);
    // 노드: 0 = 출발 · 1 = 목표 · 2.. = (창 안 청크의 문 · 그 청크 쪽)
    const nodes = [], byKey = new Map();
    for (const r of win) for (let i = 0; i < r.gates.length; i++) {
      const id = nodes.length + 2; nodes.push({ r, g: r.gates[i] });
      const k = r.gates[i].key; const a = byKey.get(k); a ? a.push(id) : byKey.set(k, [id]);
    }
    const N = nodes.length + 2, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
    const heap = []; const push = (d, v) => { heap.push([d, v]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] < heap[i][0] || (heap[p][0] === heap[i][0] && heap[p][1] <= heap[i][1])) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i;
      if (l < heap.length && (heap[l][0] < heap[m][0] || (heap[l][0] === heap[m][0] && heap[l][1] < heap[m][1]))) m = l;
      if (r < heap.length && (heap[r][0] < heap[m][0] || (heap[r][0] === heap[m][0] && heap[r][1] < heap[m][1]))) m = r;
      if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const relax = (u, v, w) => { if (w >= UNR) return; const d = dist[u] + w; if (d < dist[v]) { dist[v] = d; prev[v] = u; push(d, v); } };
    dist[0] = 0; push(0, 0);
    while (heap.length) {
      const [d, u] = pop(); if (done[u] || d > dist[u]) continue; done[u] = 1;
      if (u === 1) break;
      if (u === 0) {
        if (rs === rg) relax(0, 1, TG[sIdx]);
        for (let i = 2; i < N; i++) if (nodes[i - 2].r === rs) relax(0, i, nodes[i - 2].g.T[sIdx]);
        continue;
      }
      const { r, g } = nodes[u - 2];
      if (r === rg) relax(u, 1, TG[g.c]);
      for (let i = 2; i < N; i++) if (i !== u && nodes[i - 2].r === r) relax(u, i, nodes[i - 2].g.T[g.c]);
      const sib = byKey.get(g.key); if (sib) for (const v of sib) if (v !== u && nodes[v - 2].r !== r) relax(u, v, 1);   // 경계 건너기 한 걸음
    }
    if (!Number.isFinite(dist[1])) { st.unreach++; return { res: 'unreach' }; }
    // 칸 길 — 다리마다 표를 따라 내려간다
    const chain = []; for (let v = 1; v !== -1; v = prev[v]) chain.push(v); chain.reverse();   // 0, …, 1
    const cells = [];
    let cr = rs, cIdx = sIdx;
    const descend = (r, from, T) => {   // r 안 from 에서 T 가 0 인 칸까지(앞으로 가는 간선 · E S W N 차례)
      let c = from;
      while (T[c] !== 0) {
        const cx = c % r.w, cy = (c / r.w) | 0; let nx = -1;
        for (let d = 0; d < 4; d++) {
          if (!(r.open[c] & (1 << d))) continue;
          const vx = cx + DIRS[d][0], vy = cy + DIRS[d][1];
          if (vx < 0 || vy < 0 || vx >= r.w || vy >= r.h) continue;
          const v = vy * r.w + vx; if (T[v] === T[c] - 1) { nx = v; break; }
        }
        if (nx < 0) return -1;
        c = nx; cells.push([r.x0 + (c % r.w), r.y0 + ((c / r.w) | 0)]);
      }
      return c;
    };
    for (let i = 1; i < chain.length; i++) {
      const v = chain[i];
      if (v === 1) { if (descend(cr, cIdx, TG) < 0) return { res: 'unreach' }; break; }
      const { r, g } = nodes[v - 2];
      if (r === cr) { cIdx = descend(cr, cIdx, g.T); if (cIdx < 0) return { res: 'unreach' }; }
      else { cr = r; cIdx = g.c; cells.push([g.gx, g.gy]); }   // 건너기 — 이웃 청크의 그 문 대표 칸
    }
    st.found++;
    return { res: 'found', cells, len: dist[1] };
  }

  // ── 무효화 ──────────────────────────────────────────────────────────────
  function invalidateAll() { gen++; st.invalAll++; }
  function invalidateChunk(ci) {
    const X = ci % NX, Y = (ci / NX) | 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {   // 경계 간선은 이웃 청크 건물(서쪽·북쪽 칸의 E·N 벽)에도 기댄다
      const x = X + dx, y = Y + dy; if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
      const r = recs.get(y * NX + x); if (r) r.dirty = true;
    }
  }
  // 건물 서명 쓸기 — 지어진 표의 청크를 차례로 돌며(예산 = 본 청크 수 · 존은 틱마다 ⌈표 수 ÷ 틱 Hz⌉ = 표마다 1초에 한 번) 서명이 바뀐 청크를 낡게 한다
  let sweepKeys = null, sweepI = 0;
  function sweep(budget, sigOf) {
    if (!budget || !recs.size) return;
    if (!sweepKeys || sweepI >= sweepKeys.length) { sweepKeys = [...recs.keys()]; sweepI = 0; }
    let used = 0;
    while (used < budget && sweepI < sweepKeys.length) {
      const ci = sweepKeys[sweepI++], r = recs.get(ci); if (!r) continue;
      const [sig] = sigOf(r.X, r.Y); used++; st.sigChecks++;   // 예산 = 본 청크 수
      if (r.sig === undefined) r.sig = sig;
      else if (r.sig !== sig) { r.sig = sig; invalidateChunk(ci); st.sigInval++; }
    }
  }
  function memBytes() { let b = 0; for (const r of recs.values()) { b += r.pass.length + r.open.length; for (const g of r.gates) b += g.T.length * 2 + 64; } return b; }
  function stats() { let gates = 0; for (const r of recs.values()) gates += r.gates.length; return Object.assign({ recs: recs.size, gates, queue: queue.length, memMB: +(memBytes() / 1048576).toFixed(2), gen, NX, NY, C }, st); }
  function enqueueAll() { for (let ci = 0; ci < NX * NY; ci++) enqueue(ci); }   // 하네스 · 부팅 미리 굽기용(존은 안 부른다)
  return { size: () => recs.size, route, tick, sweep, invalidateAll, invalidateChunk, chunkOf, stats, enqueueAll, _recs: recs };
}

module.exports = { create, UNR };
