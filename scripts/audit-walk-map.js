#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1401 감사 자 · 제품 무변 · 읽기만)
// === scripts/audit-walk-map.js — 걸음 지도 감사 둘째: 남의 마을 땅을 안 밟고도 다 이어지는가 · 돌아가는 길 · 다리 후보 ==========
//   `audit-reachability.js <존> --walk …` 이 이 파일을 부른다(그 자의 물 · 바위 · 다리 술어 그대로 — 서버 `isTerrainBlockedLocal` 동형).
//   ⓐ 마을 쌍 걸음 거리(지형 + 다리 · 8방 · 대각은 두 곧은 이웃이 열려야) ÷ 곧은 거리 — 이웃 쌍(마을마다 곧은 거리로 가까운 20곳)
//   ⓑ 남의 마을 영토를 막힌 칸으로 놓고 다시(`--terr 이름=DB[,이름=DB…]` — `village_buildings` 의 `terr` 행 · 마을 이름으로 잇는다)
//       A 에서 B 영토에 처음 닿는 거리(제 땅 · 주인 없는 땅 · B 땅만 밟는다) ↔ 지형만 본 같은 거리 · 못 닿는 쌍 · 더 도는 쌍 · 길목을 막은 마을
//   ⓒ 교역로(`trade_routes` 행 · 그 DB 의 영토)가 남의 영토(두 끝 마을 아닌)를 지나는 구간 수 · 칸 수
//   ⓓ 제 영토가 물 · 바위로 몇 조각인가(4방 · 다리 칸은 이어짐) · 회관 · 곳간 · 집 · 밭이 가장 큰 조각 밖에 있는가
//   다리 후보: ⓐ 비가 큰 쌍마다 축 4방 직선 물길(물 칸만 · 두 끝 뭍 · 200칸 안 · 이미 다리 0)로 줄일 수 있는 가장 짧은 거리 · 그 다리가 줄이는 이웃 쌍 수
//   ⇒ `--json <파일>` 표 · `--png <파일>` 그림(4칸 = 1화소) · 표준 출력 요약
'use strict';
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');

module.exports = function walkAudit(ctx) {
  const { ZID, NX, NY, N, kind, BRIDGE, argv, terrain, SZ } = ctx;
  const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
  const T0 = Date.now();
  const NEI = +opt('nei', '20'), TOP = +opt('top', '20'), SPAN = +opt('span', '200');
  //   막힘(지형 + 다리) — 서버와 같은 뜻(audit-reachability `blocked(…, true)`)
  const blk = new Uint8Array(N);
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) { const k = kind(cx, cy); blk[cy * NX + cx] = k === 3 ? 1 : (k === 2 && !BRIDGE.has(cx + '_' + cy)) ? 1 : 0; }
  const tBlk = Date.now() - T0;

  //   마을 · 닻 칸(중심에서 가장 가까운 열린 칸 · 고리 차례)
  const vs = (terrain.getZoneVillages(ZID) || []).map((v, i) => ({ i, name: v.name, cx: Math.round(v.x / SZ), cy: Math.round(v.y / SZ) }));
  for (const v of vs) {
    v.a = -1;
    for (let r = 0; r <= 40 && v.a < 0; r++) for (let dy = -r; dy <= r && v.a < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = v.cx + dx, y = v.cy + dy; if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
      if (!blk[y * NX + x]) { v.a = y * NX + x; v.ax = x; v.ay = y; break; }
    }
  }
  const V = vs.length;

  //   다익스트라(통 줄 · 곧은 5 · 대각 7 ≈ √2) — own: 칸 주인(마을 i+1 · 0 = 주인 없음) · src 의 땅 · 주인 없는 땅만 지나고 남의 땅은 닿기만(그 마을 첫 닿음 거리)
  const dist = new Int32Array(N), INF = 0x3fffffff;
  const DIRS = [[1, 0, 5], [-1, 0, 5], [0, 1, 5], [0, -1, 5], [1, 1, 7], [1, -1, 7], [-1, 1, 7], [-1, -1, 7]];
  function dij(starts, own, src, touch, pred) {
    dist.fill(INF);
    const B = 8, buckets = Array.from({ length: B }, () => []);
    let n = 0;
    for (const s of starts) { if (s < 0) continue; dist[s] = 0; buckets[0].push(s); n++; if (pred) pred[s] = -1; }
    let cur = 0, idle = 0;
    while (n > 0) {
      const b = buckets[cur % B];
      if (!b.length) { cur++; if (++idle > B) break; continue; }
      idle = 0;
      const i = b.pop(); n--;
      if (dist[i] !== cur) continue;
      const x = i % NX, y = (i / NX) | 0;
      for (const [dx, dy, c] of DIRS) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
        const j = ny * NX + nx; if (blk[j]) continue;
        if (dx && dy && (blk[y * NX + nx] || blk[ny * NX + x])) continue;   // 모서리 자르기 0
        const nd = cur + c; if (nd >= dist[j]) continue;
        if (own && touch) { const o = own[j]; if (o && o !== src + 1) { if (nd < touch[o - 1]) touch[o - 1] = nd; continue; } }   // 남의 땅 — 닿기만
        dist[j] = nd; if (pred) pred[j] = i; buckets[nd % B].push(j); n++;
      }
      if (!buckets[cur % B].length) cur++;
    }
  }
  const cells = (d) => (d >= INF ? null : +(d / 5).toFixed(1));

  //   ⓐ 이웃 쌍 · 걸음 거리(지형 + 다리)
  const straight = (a, b) => Math.hypot(a.ax - b.ax, a.ay - b.ay);
  const near = vs.map((a) => vs.filter((b) => b !== a).sort((p, q) => straight(a, p) - straight(a, q)).slice(0, NEI).map((b) => b.i));
  const pairKey = (i, j) => (i < j ? i + '|' + j : j + '|' + i);
  const pairs = new Map(); for (const a of vs) for (const j of near[a.i]) { const k = pairKey(a.i, j); if (!pairs.has(k)) pairs.set(k, { i: Math.min(a.i, j), j: Math.max(a.i, j) }); }
  const W = Array.from({ length: V }, () => new Float64Array(V).fill(Infinity));
  const tA = Date.now();
  for (const a of vs) { dij([a.a], null, a.i, null, null); for (const b of vs) W[a.i][b.i] = dist[b.a] >= INF ? Infinity : dist[b.a] / 5; }
  const P = [...pairs.values()].map((p) => { const a = vs[p.i], b = vs[p.j], s = straight(a, b), w = W[p.i][p.j]; return { a: a.name, b: b.name, i: p.i, j: p.j, straight: +s.toFixed(1), walk: Number.isFinite(w) ? +w.toFixed(1) : null, ratio: Number.isFinite(w) && s > 0 ? +(w / s).toFixed(3) : null }; });
  const R = P.map((p) => p.ratio).filter((x) => x != null).sort((x, y) => x - y);
  const q = (f) => R.length ? R[Math.min(R.length - 1, Math.floor(f * R.length))] : null;
  const top = P.filter((p) => p.ratio != null).sort((x, y) => y.ratio - x.ratio).slice(0, TOP);
  const unreachAll = []; for (let i = 0; i < V; i++) for (let j = i + 1; j < V; j++) if (!Number.isFinite(W[i][j])) unreachAll.push([vs[i].name, vs[j].name]);
  const aOut = { villages: V, anchorsMissing: vs.filter((v) => v.a < 0).map((v) => v.name), pairs: P.length, unreachAll: unreachAll.length, unreachEx: unreachAll.slice(0, 10),
    ratio: { median: q(0.5), p90: q(0.9), p99: q(0.99), max: R.length ? R[R.length - 1] : null, over2: R.filter((x) => x > 2).length, over3: R.filter((x) => x > 3).length, over5: R.filter((x) => x > 5).length }, top, ms: Date.now() - tA };

  //   ⓑ 영토 막힘 — 판마다
  const terrSets = [];
  for (const spec of String(opt('terr', '') || '').split(',').filter(Boolean)) {
    const [label, file] = spec.includes('=') ? spec.split('=') : [path.basename(spec), spec];
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file, { readOnly: true });
    const byName = new Map(vs.map((v) => [v.name, v]));
    const vid = new Map(db.prepare('SELECT id, name FROM villages').all().map((r) => [r.id, r.name]));
    const own = new Int16Array(N), ditch = []; let nCells = 0, clash = 0;
    const kinds = new Map();
    for (const r of db.prepare("SELECT village_id, type, cx, cy FROM village_buildings WHERE type IN ('terr','hall','granary','house','farmland','dryfield','ditch') ORDER BY id").iterate()) {
      const v = byName.get(vid.get(r.village_id)); if (!v || r.cx < 0 || r.cy < 0 || r.cx >= NX || r.cy >= NY) continue;
      const i = r.cy * NX + r.cx;
      if (r.type === 'ditch') { ditch.push(i); continue; }
      if (r.type === 'terr') { if (own[i] && own[i] !== v.i + 1) { clash++; continue; } if (!own[i]) nCells++; own[i] = v.i + 1; }
      else { const L = kinds.get(v.i) || kinds.set(v.i, []).get(v.i); L.push([r.type, i]); }
    }
    let routes = null; try { routes = db.prepare('SELECT pair, pts FROM trade_routes').all(); } catch (e) { routes = null; }
    db.close();
    terrSets.push({ label, file, own, nCells, clash, kinds, routes, ditch });
  }
  const bOut = [];
  for (const T of terrSets) {
    const tB = Date.now();
    //   환호(도랑) 칸 = 서버 걸음 막힘(`isDitchTileLocal`) — 이 판의 두 셈(지형만 · 남의 땅 막힘)에 같이 건다(영토 몫만 가르도록) · 판 끝에 되돌린다
    const dSaved = T.ditch.filter((i) => !blk[i]); for (const i of dSaved) blk[i] = 1;
    const free = Array.from({ length: V }, () => new Float64Array(V).fill(Infinity)), fence = Array.from({ length: V }, () => new Float64Array(V).fill(Infinity));
    const touch = new Float64Array(V);
    for (const a of vs) {
      touch.fill(Infinity); dij([a.a], T.own, a.i, touch, null); for (let j = 0; j < V; j++) fence[a.i][j] = touch[j] / 5;
      //   지형만 — 같은 닿음(B 땅 첫 칸)을 쓴다: 다익스트라 한 번 더(막힘 없이) · B 땅 칸 가운데 가장 가까운 칸
    }
    for (const a of vs) { dij([a.a], null, a.i, null, null); const best = new Float64Array(V).fill(Infinity); for (let i = 0; i < N; i++) { const o = T.own[i]; if (o && dist[i] < INF && dist[i] / 5 < best[o - 1]) best[o - 1] = dist[i] / 5; } for (let j = 0; j < V; j++) free[a.i][j] = best[j]; }
    const rows = [];
    for (const p of pairs.values()) for (const [i, j] of [[p.i, p.j], [p.j, p.i]]) {
      const f = free[i][j], g = fence[i][j]; rows.push({ a: vs[i].name, b: vs[j].name, i, j, free: Number.isFinite(f) ? +f.toFixed(1) : null, fence: Number.isFinite(g) ? +g.toFixed(1) : null, x: Number.isFinite(f) && Number.isFinite(g) && f > 0 ? +(g / f).toFixed(3) : null });
    }
    const cut = rows.filter((r) => r.free != null && r.fence == null), longer = rows.filter((r) => r.x != null && r.x >= 1.5).sort((x, y) => y.x - x.x);
    let cutAll = 0; for (let i = 0; i < V; i++) for (let j = 0; j < V; j++) if (i !== j && Number.isFinite(free[i][j]) && !Number.isFinite(fence[i][j])) cutAll++;
    //   길목 — 못 닿는 · 더 도는 쌍마다 지형만 본 가장 짧은 길이 지나는 남의 땅(두 끝 아닌 마을)
    const pred = new Int32Array(N), chokes = new Map();
    for (const r of [...cut.slice(0, 20), ...longer.slice(0, 20)]) {
      dij([vs[r.i].a], null, r.i, null, pred);
      let best = -1, bd = INF; for (let k = 0; k < N; k++) if (T.own[k] === r.j + 1 && dist[k] < bd) { bd = dist[k]; best = k; }
      const crossed = new Map(); for (let k = best; k >= 0 && k !== vs[r.i].a; k = pred[k]) { const o = T.own[k]; if (o && o !== r.i + 1 && o !== r.j + 1) crossed.set(o - 1, (crossed.get(o - 1) || 0) + 1); }
      r.through = [...crossed].map(([o, n]) => `${vs[o].name}(${n}칸)`);
      for (const [o] of crossed) chokes.set(vs[o].name, (chokes.get(vs[o].name) || 0) + 1);
    }
    //   ⓒ 교역로가 남의 땅을 지나는가
    let rc = null;
    if (T.routes) {
      rc = { routes: T.routes.length, through: 0, segs: 0, cells: 0, ex: [] };
      const nameIdx = new Map(vs.map((v) => [String(v.i + 1), v]));
      for (const r of T.routes) {
        let pts; try { pts = JSON.parse(r.pts); } catch (e) { continue; }
        if (!Array.isArray(pts) || pts.length < 2) continue;
        //   끝 마을 = 길 첫 · 끝 점이 든 영토의 주인(쌍 열쇠는 econ 번호라 이름으로 안 잇는다)
        const ownAt = (p) => { const x = Math.floor(p.x / SZ), y = Math.floor(p.y / SZ); return (x >= 0 && y >= 0 && x < NX && y < NY) ? T.own[y * NX + x] : 0; };
        const ends = new Set([ownAt(pts[0]), ownAt(pts[pts.length - 1])]);
        let inSeg = false, segs = 0, cellsN = 0, last = -1, whose = new Map();
        for (let k = 1; k < pts.length; k++) {
          const a = pts[k - 1], b = pts[k], L = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / SZ));
          for (let s = 1; s <= L; s++) {
            const x = Math.floor((a.x + (b.x - a.x) * s / L) / SZ), y = Math.floor((a.y + (b.y - a.y) * s / L) / SZ); if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
            const c = y * NX + x; if (c === last) continue; last = c;
            const o = T.own[c], other = o && !ends.has(o);
            if (other) { cellsN++; whose.set(o - 1, (whose.get(o - 1) || 0) + 1); if (!inSeg) { segs++; inSeg = true; } } else inSeg = false;
          }
        }
        if (segs) { rc.through++; rc.segs += segs; rc.cells += cellsN; if (rc.ex.length < 10) rc.ex.push({ pair: r.pair, segs, cells: cellsN, through: [...whose].map(([o, n]) => `${vs[o].name}(${n})`).join(' ') }); }
      }
    }
    //   ⓓ 제 땅 조각
    const split = [];
    const comp = new Int32Array(N);
    for (const v of vs) {
      const mine = []; for (let i = 0; i < N; i++) if (T.own[i] === v.i + 1 && !blk[i]) mine.push(i);
      if (!mine.length) continue;
      let cid = 0; const sizes = [];
      for (const s of mine) comp[s] = 0;
      for (const s of mine) {
        if (comp[s]) continue; cid++; let sz = 0; const st = [s]; comp[s] = cid;
        while (st.length) { const i = st.pop(); sz++; const x = i % NX, y = (i / NX) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const j = ny * NX + nx; if (comp[j] || blk[j] || T.own[j] !== v.i + 1) continue; comp[j] = cid; st.push(j); } }
        sizes.push(sz);
      }
      if (cid > 1) {
        const big = sizes.indexOf(Math.max(...sizes)) + 1, out = {};
        for (const [ty, i] of (T.kinds.get(v.i) || [])) if (T.own[i] === v.i + 1 && !blk[i] && comp[i] && comp[i] !== big) out[ty] = (out[ty] || 0) + 1;
        split.push({ name: v.name, pieces: cid, sizes: sizes.sort((x, y) => y - x).slice(0, 6), outsideBig: out });
      }
      for (const s of mine) comp[s] = 0;
    }
    const sig = split.filter((s) => s.sizes[1] >= 20);
    for (const i of dSaved) blk[i] = 0;
    bOut.push({ label: T.label, cells: T.nCells, clash: T.clash, ditch: dSaved.length, cutPairs: cut.length, cutAll, longerPairs: longer.length,
      cutEx: cut.slice(0, 12).map((r) => ({ a: r.a, b: r.b, free: r.free, through: r.through })), longerTop: longer.slice(0, 15).map((r) => ({ a: r.a, b: r.b, free: r.free, fence: r.fence, x: r.x, through: r.through })),
      chokes: [...chokes].sort((x, y) => y[1] - x[1]).slice(0, 10), routes: rc, split: { villages: split.length, real: sig.length, list: split.sort((x, y) => (y.sizes[1] || 0) - (x.sizes[1] || 0)).slice(0, 12) }, ms: Date.now() - tB });
  }

  //   다리 후보 — ⓐ 비 큰 쌍마다
  const fieldOf = (i) => { dij([vs[i].a], null, i, null, null); return Int32Array.from(dist); };
  const runs = [];   // 축 4방 직선 물길 [끝1, 끝2, 길이, 축]
  for (let y = 0; y < NY; y++) { let x = 0; while (x < NX) { if (blk[y * NX + x] && kind(x, y) === 2) { let e = x; while (e < NX && blk[y * NX + e] && kind(e, y) === 2) e++; const L = e - x; if (x > 0 && e < NX && L <= SPAN && !blk[y * NX + x - 1] && !blk[y * NX + e]) runs.push([y * NX + x - 1, y * NX + e, L + 1, 'h', x, y]); x = e; } else x++; } }
  for (let x = 0; x < NX; x++) { let y = 0; while (y < NY) { if (blk[y * NX + x] && kind(x, y) === 2) { let e = y; while (e < NY && blk[e * NX + x] && kind(x, e) === 2) e++; const L = e - y; if (y > 0 && e < NY && L <= SPAN && !blk[(y - 1) * NX + x] && !blk[e * NX + x]) runs.push([(y - 1) * NX + x, e * NX + x, L + 1, 'v', x, y]); y = e; } else y++; } }
  const cand = [];
  const tC = Date.now();
  const seen = new Set();
  for (const p of top.slice(0, +opt('bridge-pairs', '10'))) {
    const fa = fieldOf(p.i), fb = fieldOf(p.j);
    let best = null;
    for (const r of runs) {
      const [e1, e2, L] = r; const d1 = fa[e1], d2 = fb[e2], d3 = fa[e2], d4 = fb[e1];
      const via = Math.min(d1 < INF && d2 < INF ? d1 + d2 : INF, d3 < INF && d4 < INF ? d3 + d4 : INF) / 5 + L;
      if (!best || via < best.via) best = { via, r };
    }
    if (!best || !(best.via < p.walk * 0.9)) { cand.push({ pair: `${p.a}–${p.b}`, walk: p.walk, straight: p.straight, best: best ? +best.via.toFixed(1) : null, none: true }); continue; }
    const [e1, e2, L, ax, x0, y0] = best.r, key = e1 + ':' + e2;
    const c = { pair: `${p.a}–${p.b}`, walk: p.walk, straight: p.straight, via: +best.via.toFixed(1), span: L, axis: ax, at: [x0, y0], ends: [[e1 % NX, (e1 / NX) | 0], [e2 % NX, (e2 / NX) | 0]], helps: null };
    if (!seen.has(key)) {
      seen.add(key);
      const g1 = (dij([e1], null, -1, null, null), Int32Array.from(dist)), g2 = (dij([e2], null, -1, null, null), Int32Array.from(dist));
      let helps = 0;
      for (const q2 of pairs.values()) { const a = vs[q2.i].a, b = vs[q2.j].a, w = W[q2.i][q2.j]; const nv = Math.min(g1[a] + g2[b], g2[a] + g1[b]) / 5 + L; if (Number.isFinite(w) && nv < w * 0.9) helps++; }
      c.helps = helps;
    } else c.dup = true;
    cand.push(c);
  }
  const cOut = { runs: runs.length, cand, ms: Date.now() - tC };

  const out = { zone: ZID, grid: [NX, NY], bridges: BRIDGE.size, nei: NEI, a: aOut, b: bOut, bridgeCand: cOut, ms: { blk: tBlk, all: Date.now() - T0 } };

  //   그림 — 4칸 = 1화소 · 뭍 · 물 · 바위 · 다리 · (첫 영토 판) 영토 · 비 큰 쌍 곧은 선 · 다리 후보
  const png = opt('png', null);
  if (png) {
    const S = 4, w = Math.ceil(NX / S), h = Math.ceil(NY / S), img = Buffer.alloc(w * h * 3);
    const T = terrSets[0];
    const hue = (o) => [60 + (o * 97) % 160, 90 + (o * 57) % 140, 60 + (o * 151) % 160];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * S) * NX + x * S, k = kind(x * S, y * S), b = BRIDGE.has((x * S) + '_' + (y * S));
      let c = k === 2 ? [40, 80, 150] : k === 3 ? [95, 90, 85] : [200, 205, 170];
      if (b) c = [230, 160, 40];
      if (T && T.own[i]) { const hc = hue(T.own[i]); c = [(c[0] + hc[0]) >> 1, (c[1] + hc[1]) >> 1, (c[2] + hc[2]) >> 1]; }
      const o = (y * w + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
    }
    const put = (cx, cy, c, r) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = Math.floor(cx / S) + dx, y = Math.floor(cy / S) + dy; if (x < 0 || y < 0 || x >= w || y >= h) continue; const o = (y * w + x) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; } };
    const line = (a, b, c) => { const L = Math.ceil(Math.hypot(b.ax - a.ax, b.ay - a.ay) / 2); for (let s = 0; s <= L; s++) put(a.ax + (b.ax - a.ax) * s / L, a.ay + (b.ay - a.ay) * s / L, c, 0); };
    for (const p of top.slice(0, 5)) line(vs[p.i], vs[p.j], [220, 30, 30]);
    for (const c of cand) if (c.ends) { const [[x1, y1], [x2, y2]] = c.ends; const L = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)); for (let s = 0; s <= L; s++) put(x1 + (x2 - x1) * s / L, y1 + (y2 - y1) * s / L, [255, 0, 255], 1); }
    for (const v of vs) put(v.ax, v.ay, [0, 0, 0], 2);
    const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; img.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
    const crc = (b) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); } return ~c >>> 0; };
    const ch = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
    fs.writeFileSync(png, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ch('IHDR', ih), ch('IDAT', zlib.deflateSync(raw)), ch('IEND', Buffer.alloc(0))]));
    out.png = { file: png, w, h };
  }

  if (opt('json', null)) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
  //   요약
  console.log(`\n[걸음 지도 감사] ${ZID} · 마을 ${V} · 이웃 쌍 ${P.length}(마을마다 곧은 거리 가까운 ${NEI}) · 다리 칸 ${BRIDGE.size} · 막힘 ${tBlk}ms · 전체 ${Date.now() - T0}ms`);
  console.log(`ⓐ 지형만 못 닿음(모든 쌍) ${aOut.unreachAll} · 걸음 ÷ 곧은 거리 가운데 ${aOut.ratio.median} · p90 ${aOut.ratio.p90} · 가장 큼 ${aOut.ratio.max} · 2 넘음 ${aOut.ratio.over2} · 3 넘음 ${aOut.ratio.over3} · 5 넘음 ${aOut.ratio.over5}`);
  for (const p of top.slice(0, 10)) console.log(`   ${p.a}–${p.b}  곧은 ${p.straight} · 걸음 ${p.walk} · 비 ${p.ratio}`);
  for (const b of bOut) {
    console.log(`ⓑ [${b.label}] 영토 ${b.cells}칸(겹침 ${b.clash}) · 이웃 쌍 못 닿음 ${b.cutPairs}(모든 쌍 ${b.cutAll}) · 1.5배 넘게 더 도는 이웃 쌍 ${b.longerPairs} · 길목 ${b.chokes.map(([n, k]) => n + ' ' + k).join(', ') || '—'}`);
    for (const r of b.cutEx.slice(0, 5)) console.log(`   못 닿음 ${r.a}→${r.b} (지형만 ${r.free}칸 · 지나는 남의 땅 ${(r.through || []).join(' ') || '—'})`);
    for (const r of b.longerTop.slice(0, 5)) console.log(`   더 돎 ${r.a}→${r.b} ${r.free} → ${r.fence}칸(×${r.x}) · ${(r.through || []).join(' ') || '—'}`);
    if (b.routes) console.log(`ⓒ [${b.label}] 교역로 ${b.routes.routes} 가운데 남의 땅을 지나는 길 ${b.routes.through} · 구간 ${b.routes.segs} · 칸 ${b.routes.cells}`);
    console.log(`ⓓ [${b.label}] 제 땅이 조각난 마을 ${b.split.villages}(둘째 조각 20칸 넘음 ${b.split.real}) ${b.split.list.slice(0, 6).map((s) => `${s.name} ${s.pieces}조각 ${s.sizes.join('/')}${Object.keys(s.outsideBig).length ? ' 밖:' + JSON.stringify(s.outsideBig) : ''}`).join(' · ')}`);
  }
  console.log(`다리 후보(물길 ${runs.length}줄 · ${SPAN}칸 안):`);
  for (const c of cand) console.log(c.none ? `   ${c.pair} 걸음 ${c.walk} — 다리 하나로 10% 넘게 안 준다(가장 좋은 ${c.best})` : `   ${c.pair} 걸음 ${c.walk} → ${c.via}칸 · 다리 ${c.span}칸 ${c.axis} @(${c.at}) · 줄이는 이웃 쌍 ${c.helps == null ? '(위와 같은 다리)' : c.helps}`);
  return out;
};
