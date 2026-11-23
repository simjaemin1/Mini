// (@regress 없음 — 러너 밖 · T1440 할 일 1 "재기 먼저" 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1440-road-probe.js — 저장된 길(교역로)을 잰다: 칸 · 칸당 쌍 · 다시 구하는 CPU · 구조물을 보게 하면 길이 얼마나 바뀌나 · 놓는 순간 판정의 값 ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1440-road-probe.js" T1440_PROBE_OUT=<파일.json> T1440_PROBE_DAY=<econ 날>
//             [T1440_PROBE_N=<판정 표본 수>] node scripts/t577-server-run.js <날> <시드>` (판 자가 아이 존에 env 를 그대로 준다)
//   그날 한 번(마을 틱 머리 뒤):
//   ⓐ 길 칸 — 캐시의 길(`state.routeCache` · 쌍마다 px 꺾은 줄)을 지나는 칸 전부(`_t1327Cells` — 제품이 길 줄 검사에 쓰는 그 칸 걷기) · 칸 → 지나는 쌍 수 분포 · 가장 붐비는 칸(다리 · 물가 · 들)
//   ⓑ 쌍 하나 다시 구하는 CPU — 동기 문(`computeRoutePts`)을 쌍마다 그 자리에서(메모 따뜻 · 차가움) · 재개형(`_routeResume` · 예산 16ms)의 조각 수
//   ⓒ 구조물을 보는 길 — 마을 집채(벽 · 문이 두른 발자국 렉트 `data.hut/bld/gran`) · 울타리 칸 · 태그 없는 벽 · 문(곁 칸) · 개인 사유지 칸을 막힌 칸으로 둔 지형 어댑터로
//      같은 동기 문을 다시 불러(격자 · 이웃 잇기 메모를 따로 세운다 — 끝나면 되돌린다) 쌍마다 길이 비 · 못 닿음
//   ⓓ 놓는 순간 판정(시험) — 길 칸 표본에 울타리를 놓았다고 치고: 그 칸을 지나는 쌍 · 줄기 고쳐 잇기(막힌 마디 앞뒤 꼭짓점 사이 칸 A* · 상자를 넓혀 가며)의 길이 · 시간 ·
//      쌍 전체 다시 구하기(동기 문 + 그 칸)의 길이 · 시간 · 3배 안인가(지금 길 길이 기준)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1440_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
try { require('./lib-port').noCentral(); } catch (e) {}
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const DAY = +(process.env.T1440_PROBE_DAY || 2), OUT = process.env.T1440_PROBE_OUT, NS = +(process.env.T1440_PROBE_N || 60);
const SKIP = String(process.env.T1440_PROBE_SKIP || ''), FULLMAX = +(process.env.T1440_PROBE_FULLMAX || 1e9), BUSY = +(process.env.T1440_PROBE_BUSY != null ? process.env.T1440_PROBE_BUSY : 10);   // SKIP=bc · 판정 쌍 전체 다시 구하기 상한(표본) · 붐비는 칸 수
const rec = { day: DAY, at: null, a: null, b: null, c: null, d: null, err: null, ms: {} };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) {
      if (src.indexOf('__t1440v') < 0) src += '\n;module.exports.__t1440v = function () { return { state, computeRoutePts, _t1327Cells, _routeResume, ensureRouteGrid, SZ, DIST_STEP, PATH_STEP_NODES, dropJob: () => { _pathJob = null; } }; };\n';
      return _c.call(this, src, fn);
    };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let done = false;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const V = m.exports.__t1440v(), st = V.state, d = (st.world && st.world.day) | 0;
        if (!done && d >= DAY && st.routeCache && st.routeCache.size) { done = true; run(V, d); }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 900); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
const q = (v, p) => (v.length ? v[Math.min(v.length - 1, Math.floor(p * (v.length - 1)))] : null);
const dist = (v) => { const s = v.slice().sort((x, y) => x - y); return { n: s.length, p50: q(s, 0.5), p90: q(s, 0.9), p99: q(s, 0.99), max: s.length ? s[s.length - 1] : null, mean: s.length ? +(s.reduce((a, b) => a + b, 0) / s.length).toFixed(3) : null }; };
const r3 = (x) => (x == null ? null : +(+x).toFixed(3));
const plen = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };   // ⚠가상 시계(t745)는 Date.now · hrtime · performance.now 를 멈춘다 — CPU 시간(ms)으로 잰다
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function run(V, day) {
  const T0 = cpu(); rec.at = day;
  const st = V.state, SZ = V.SZ, h = Hz();
  const ta0 = st._distCtx && st._distCtx.ta;
  if (!ta0) { rec.err = 'no _distCtx'; save(); return; }
  const K = (x, y) => y * 65536 + x;
  const vname = (id) => { const v = st.byDbId && st.byDbId.get(+id); return v ? v.name : String(id); };
  // ── ⓐ 길 칸 · 칸당 쌍 ───────────────────────────────────────────────
  const routes = [];
  for (const [k, pts] of st.routeCache) if (pts && pts.length > 1) routes.push([k, pts]);
  const cellPairs = new Map();   // 칸 → 쌍 수
  const pairCells = new Map();   // 쌍 → 칸 수
  let t = cpu();
  for (const [k, pts] of routes) {
    const S = new Set();
    for (let i = 1; i < pts.length; i++) V._t1327Cells(pts[i - 1], pts[i], (cx, cy) => { S.add(K(cx, cy)); return false; });
    pairCells.set(k, S.size);
    for (const c of S) cellPairs.set(c, (cellPairs.get(c) | 0) + 1);
  }
  rec.ms.index = cpu() - t;
  const cnt = [...cellPairs.values()];
  const kind = (c) => { const x = c % 65536, y = (c / 65536) | 0, px = x * SZ + SZ / 2, py = y * SZ + SZ / 2;
    if (h && h.isBridgeTileLocal && h.isBridgeTileLocal(px, py)) return 'bridge';
    if (h && h.isWaterTileLocal && h.isWaterTileLocal(px, py)) return 'water';
    for (const v of st.villages || []) if (Math.abs(v.ccx - x) <= 12 && Math.abs(v.ccy - y) <= 12) return 'village12';
    return 'land'; };
  const byKind = {};
  for (const [c, n] of cellPairs) { const kd = kind(c); const o = byKind[kd] || (byKind[kd] = []); o.push(n); }
  const top = [...cellPairs].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([c, n]) => ({ cx: c % 65536, cy: (c / 65536) | 0, n, kind: kind(c) }));
  const hist = {}; for (const n of cnt) { const b = n >= 400 ? '400+' : n >= 100 ? '100-399' : n >= 30 ? '30-99' : n >= 10 ? '10-29' : n >= 3 ? '3-9' : String(n); hist[b] = (hist[b] | 0) + 1; }
  rec.a = { pairs: routes.length, nullPairs: st.routeCache.size - routes.length, cells: cellPairs.size, cellRefs: cnt.reduce((a, b) => a + b, 0),
    perCell: dist(cnt), perPair: dist([...pairCells.values()]), hist, byKind: Object.fromEntries(Object.entries(byKind).map(([k2, v]) => [k2, dist(v)])), top,
    villages: (st.villages || []).length };
  save();
  // ── ⓑ 동기 문 CPU(지금 지형 어댑터 · 메모 따뜻) · 재개형 조각 ─────────────────
  const R0 = st._route;
  const ep = (k) => { const ids = k.split('_'), A = st.byDbId.get(+ids[0]), B = st.byDbId.get(+ids[1]); return (A && B) ? [A.ccx * SZ + SZ / 2, A.ccy * SZ + SZ / 2, B.ccx * SZ + SZ / 2, B.ccy * SZ + SZ / 2] : null; };
  const syncMs = [], sameLen = [];
  t = cpu();
  if (!SKIP.includes('b')) for (const [k, pts] of routes) { const e = ep(k); if (!e) continue; const t1 = cpu(); const p2 = V.computeRoutePts(e[0], e[1], e[2], e[3]); syncMs.push(cpu() - t1); if (p2) sameLen.push(Math.abs(plen(p2) - plen(pts)) < 0.5 ? 1 : 0); }
  rec.ms.syncAll = cpu() - t;
  //   재개형 — 쌍 표본(앞 120) · 예산 16ms(제품 슬라이서 기본)
  const slices = [], workMs = [];
  for (const [k] of (SKIP.includes('b') ? [] : routes.slice(0, 120))) {
    const e = ep(k); if (!e) continue; V.dropJob(); let n = 0, r = null;
    const key = 'probe_' + k;
    const c0 = cpu(); do { r = V._routeResume(key, e[0], e[1], e[2], e[3], 16); n++; } while (!r.done && n < 100000);
    const w = cpu() - c0; slices.push(Math.max(1, Math.ceil(w / 16))); workMs.push(w);   // 가상 시계에선 예산이 안 닳아 한 번에 끝난다 — 조각 수 = CPU ÷ 16ms 로 셈
  }
  V.dropJob();
  rec.b = { sync: dist(syncMs.map(r3)), sameAsCache: sameLen.reduce((a, b) => a + b, 0) + '/' + sameLen.length, resum16: { slices: dist(slices), workMs: dist(workMs) } };
  save();
  // ── ⓒ 구조물을 보는 길 ─────────────────────────────────────────────
  t = cpu();
  const blk = new Set(); const sc = { fenceCells: 0, rects: 0, rectCells: 0, wallsTagged: 0, wallsUntagged: 0, doorsUntagged: 0, claimCells: 0, rows: 0 };
  const rectSeen = new Set();
  try {
    for (const r of h.db.db.prepare("SELECT type, owner_id, x, y, data FROM buildings WHERE type IN ('wall','fence','door')").iterate()) {
      sc.rows++;
      let d = {}; try { d = JSON.parse(r.data || '{}') || {}; } catch (e) {}
      if ((d.floor || 0) !== 0) continue;
      const cx = Math.floor(r.x / SZ), cy = Math.floor(r.y / SZ);
      if (r.type === 'fence') { blk.add(K(cx, cy)); sc.fenceCells++; continue; }
      const R = d.hut || d.bld || d.gran;
      if (Array.isArray(R) && R.length === 4) {
        sc.wallsTagged++;
        const rk = R.join(',');
        if (!rectSeen.has(rk)) { rectSeen.add(rk); sc.rects++; for (let y = R[1]; y <= R[3]; y++) for (let x = R[0]; x <= R[2]; x++) { blk.add(K(x, y)); sc.rectCells++; } }
        continue;
      }
      if (r.type === 'door') sc.doorsUntagged++; else sc.wallsUntagged++;
      blk.add(K(cx, cy));   // 태그 없는 벽 · 문 = 그 칸(근사 — 판에선 0 이어야 한다)
    }
  } catch (e) { sc.err = String(e.message); }
  try { for (const c of h.claims.values()) { if (c.kind === 'guild') continue; for (const [x, y] of h.Claims.cellsOf(c)) { blk.add(K(x, y)); sc.claimCells++; } } } catch (e) {}
  sc.blkCells = blk.size; rec.ms.structIdx = cpu() - t;
  const taS = Object.assign(Object.create(Object.getPrototypeOf(ta0)), ta0, { isBlocked: (x, y) => ta0.isBlocked(x, y) || blk.has(K(x, y)) });
  //   길 칸 위에 이미 선 구조물 칸(지금 길이 지나는 칸 가운데 막힌 칸)
  let onRoute = 0; for (const c of blk) if (cellPairs.has(c)) onRoute++;
  sc.blkOnRouteCells = onRoute;
  const swap = (ta, fn) => {   // 길 격자 · 이웃 잇기 메모를 따로 세워 부르고 되돌린다
    const s = { route: st._route, edge: st._t598Edge, mul: st._t598Mul, gw: st._t598Gw, ctx: st._distCtx };
    st._route = null; st._t598Edge = null; st._t598Mul = null; st._distCtx = Object.assign({}, s.ctx, { ta }); V.dropJob();
    try { return fn(); } finally { V.dropJob(); st._route = s.route; st._t598Edge = s.edge; st._t598Mul = s.mul; st._t598Gw = s.gw; st._distCtx = s.ctx; }
  };
  const ratios = [], sMs = [], changed = { same: 0, longer: 0, shorter: 0, lost: 0, gained: 0 }, worst = [];
  const structRoutes = new Map();
  t = cpu();
  swap(taS, () => {
    for (const [k, pts] of (SKIP.includes('c') ? [] : routes)) {
      const e = ep(k); if (!e) continue;
      const t1 = cpu(); const p2 = V.computeRoutePts(e[0], e[1], e[2], e[3]); sMs.push(cpu() - t1);
      if (!p2) { changed.lost++; continue; }
      structRoutes.set(k, p2);
      const a = plen(pts), b = plen(p2), rr = b / Math.max(1, a); ratios.push(rr);
      if (Math.abs(b - a) < 0.5) changed.same++; else if (b > a) changed.longer++; else changed.shorter++;
      worst.push([k, rr, a, b]);
    }
  });
  rec.ms.structAll = cpu() - t;
  worst.sort((x, y) => y[1] - x[1]);
  //   구조물 길이 막힌 칸을 지나나(못 잇는 마을 끝 곧은 줄 — `_t1327Finish` 가 못 이으면 곧은 줄로 남긴다)
  let thru = 0, thruPairs = 0;
  for (const [, p2] of structRoutes) { let hit = 0; for (let i = 1; i < p2.length; i++) V._t1327Cells(p2[i - 1], p2[i], (cx, cy) => { if (blk.has(K(cx, cy))) hit++; return false; }); if (hit) { thruPairs++; thru += hit; } }
  rec.c = { struct: sc, pairs: ratios.length, changed, ratio: dist(ratios.map(r3)), ge3: ratios.filter((x) => x > 3).length, ge15: ratios.filter((x) => x > 1.5).length, ge11: ratios.filter((x) => x > 1.1).length,
    worst: worst.slice(0, 12).map(([k, rr, a, b]) => ({ pair: k.split('_').map(vname).join('↔'), ratio: r3(rr), len0: Math.round(a), len1: Math.round(b) })),
    cpu: dist(sMs.map(r3)), thruBlockedPairs: thruPairs, thruBlockedCells: thru };
  save();
  // ── ⓓ 놓는 순간 판정(시험) ───────────────────────────────────────────
  //   표본: 가장 붐비는 칸 10 + 무작위 길 칸 NS(시드 고정) — 칸마다 (1) 울타리 한 칸 (2) 길에 곧게 가로지른 줄(양쪽 12칸 안 지형에 닿으면 '좁은 곳' · 아니면 K=12)
  const R = rng(1440), cellsArr = [...cellPairs.keys()];
  const picks = top.slice(0, BUSY).map((o) => K(o.cx, o.cy));
  for (let i = 0; i < NS && cellsArr.length; i++) picks.push(cellsArr[Math.floor(R() * cellsArr.length)]);
  //   칸 → 쌍(찾기용 — ⓐ 에선 수만 셌다)
  const cellPairList = new Map();
  for (const [k, pts] of routes) { const S = new Set(); for (let i = 1; i < pts.length; i++) V._t1327Cells(pts[i - 1], pts[i], (cx, cy) => { S.add(K(cx, cy)); return false; }); for (const c of S) { const L = cellPairList.get(c); if (L) L.push(k); else cellPairList.set(c, [k]); } }
  const routeOf = new Map(routes);
  const dirAt = (k, c) => {   // 그 칸에서 길의 방향(지나는 마디)
    const pts = routeOf.get(k), cx = c % 65536, cy = (c / 65536) | 0;
    for (let i = 1; i < pts.length; i++) { let on = false; V._t1327Cells(pts[i - 1], pts[i], (x, y) => { if (x === cx && y === cy) { on = true; return true; } return false; }); if (on) return [pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y]; }
    return [1, 0];
  };
  const lineAt = (c, k) => {   // 길에 곧게 가로지른 줄 — 양쪽으로 열린 칸을 지형에 닿을 때까지(12칸 상한)
    const cx = c % 65536, cy = (c / 65536) | 0, [dx, dy] = dirAt(k, c);
    const L = Math.hypot(dx, dy) || 1, px = -dy / L, py = dx / L;   // 수직
    const ax = Math.abs(px) >= Math.abs(py) ? Math.sign(px) : 0, ay = ax ? 0 : Math.sign(py);   // 4방으로 굳힘
    const out = [c]; let hitA = false, hitB = false;
    for (const [s, setHit] of [[1, () => { hitA = true; }], [-1, () => { hitB = true; }]]) {
      for (let i = 1; i <= 12; i++) { const x = cx + ax * i * s, y = cy + ay * i * s; if (ta0.isBlocked(x, y)) { setHit(); break; } out.push(K(x, y)); }
    }
    return { cells: out, narrow: hitA && hitB };
  };
  //   칸 A*(8방 · 곧은 1 · 대각 √2 · 모서리 깎기 0 · 상자 안) — 줄기 고쳐 잇기 시험
  function fineAstar(ax, ay, bx, by, isB, m) {
    const x0 = Math.min(ax, bx) - m, y0 = Math.min(ay, by) - m, x1 = Math.max(ax, bx) + m, y1 = Math.max(ay, by) + m;
    const W = x1 - x0 + 1, Hh = y1 - y0 + 1, N = W * Hh; if (N > 2.5e6) return null;
    const g = new Float64Array(N).fill(Infinity), cl = new Uint8Array(N), heap = [], idx = (x, y) => (y - y0) * W + (x - x0);
    const hh = (x, y) => { const dx = Math.abs(x - bx), dy = Math.abs(y - by); return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy); };
    const push = (f, i) => { heap.push([f, i]); let j = heap.length - 1; while (j > 0) { const p = (j - 1) >> 1; if (heap[p][0] <= heap[j][0]) break; [heap[p], heap[j]] = [heap[j], heap[p]]; j = p; } };
    const pop = () => { const top2 = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let j = 0; for (;;) { const l = 2 * j + 1, r = l + 1; let s = j; if (l < heap.length && heap[l][0] < heap[s][0]) s = l; if (r < heap.length && heap[r][0] < heap[s][0]) s = r; if (s === j) break; [heap[s], heap[j]] = [heap[j], heap[s]]; j = s; } } return top2; };
    const s0 = idx(ax, ay), gi = idx(bx, by); g[s0] = 0; push(hh(ax, ay), s0); let pops = 0;
    while (heap.length) {
      const [, i] = pop(); if (cl[i]) continue; cl[i] = 1; pops++;
      if (i === gi) return { len: g[i] * SZ, pops };
      const x = x0 + (i % W), y = y0 + ((i / W) | 0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
        if (isB(nx, ny)) continue; if (dx && dy && (isB(x + dx, y) || isB(x, y + dy))) continue;
        const j = idx(nx, ny); if (cl[j]) continue; const ng = g[i] + (dx && dy ? Math.SQRT2 : 1); if (ng < g[j]) { g[j] = ng; push(ng + hh(nx, ny), j); }
      }
    }
    return { len: null, pops };
  }
  const judge = (cells, label) => {
    const set = new Set(cells), pairs = new Set();
    for (const c of cells) for (const k of (cellPairList.get(c) || [])) pairs.add(k);
    const isB = (x, y) => ta0.isBlocked(x, y) || set.has(K(x, y));
    const taP = Object.assign(Object.create(Object.getPrototypeOf(ta0)), ta0, { isBlocked: isB });
    const o = { label, cells: cells.length, pairs: pairs.size, repair: { ms: 0, groups: 0, fail: 0 }, full: { ms: 0, n: 0, lost: 0 }, ratioRepair: [], ratioFull: [], closingRepair: 0, closingFull: 0, repairVsFull: [] };
    const grp = new Map();   // 마디(앞뒤 꼭짓점) → 쌍들
    for (const k of pairs) {
      const pts = routeOf.get(k); let i0 = -1, i1 = -1;
      for (let i = 1; i < pts.length; i++) { let hit = false; V._t1327Cells(pts[i - 1], pts[i], (x, y) => { if (set.has(K(x, y))) { hit = true; return true; } return false; }); if (hit) { if (i0 < 0) i0 = i - 1; i1 = i; } }
      if (i0 < 0) continue;
      const a = pts[i0], b = pts[i1], gk = [a.x, a.y, b.x, b.y].join(',');
      const L = grp.get(gk); if (L) L.push([k, i0, i1]); else grp.set(gk, [[k, i0, i1]]);
    }
    const t1 = cpu(); const rep = new Map();
    for (const [gk, L] of grp) {
      const [ax, ay, bx, by] = gk.split(',').map(Number), cxa = Math.floor(ax / SZ), cya = Math.floor(ay / SZ), cxb = Math.floor(bx / SZ), cyb = Math.floor(by / SZ);
      let r = null; for (const m of [16, 48, 128]) { r = fineAstar(cxa, cya, cxb, cyb, isB, m); if (r && r.len != null) break; }
      rep.set(gk, r && r.len != null ? r.len : null); o.repair.groups++; if (!r || r.len == null) o.repair.fail++;
    }
    o.repair.ms = r3(cpu() - t1);
    const fullOf = new Map(); const t2 = cpu();
    const fullSet = [...pairs].slice(0, FULLMAX); o.full.sampled = fullSet.length;
    swap(taP, () => { for (const k of fullSet) { const e = ep(k); if (!e) continue; const p2 = V.computeRoutePts(e[0], e[1], e[2], e[3]); o.full.n++; if (!p2) { o.full.lost++; fullOf.set(k, null); } else fullOf.set(k, plen(p2)); } });
    o.full.ms = r3(cpu() - t2);
    for (const [gk, L] of grp) for (const [k, i0, i1] of L) {
      const pts = routeOf.get(k), cur = plen(pts), d = rep.get(gk);
      let segOld = 0; for (let i = i0 + 1; i <= i1; i++) segOld += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const rl = d == null ? null : cur - segOld + d, fl = fullOf.get(k);
      if (rl != null) { o.ratioRepair.push(rl / cur); if (rl / cur > 3) o.closingRepair++; } else o.closingRepair++;
      if (!fullOf.has(k)) continue;
      if (fl != null) { o.ratioFull.push(fl / cur); if (fl / cur > 3) o.closingFull++; } else o.closingFull++;
      if (rl != null && fl != null) o.repairVsFull.push(rl / fl);
    }
    o.ratioRepair = dist(o.ratioRepair.map(r3)); o.ratioFull = dist(o.ratioFull.map(r3)); o.repairVsFull = dist(o.repairVsFull.map(r3));
    return o;
  };
  const D = [];
  t = cpu();
  for (let i = 0; i < picks.length; i++) {
    const c = picks[i], k0 = (cellPairList.get(c) || [])[0]; if (!k0) continue;
    const one = judge([c], 'one'); const ln = lineAt(c, k0); const line = judge(ln.cells, ln.narrow ? 'narrow' : 'open');
    D.push({ cx: c % 65536, cy: (c / 65536) | 0, kind: kind(c), busy: i < BUSY, one, line });
    if (cpu() - T0 > 40 * 60 * 1000) { rec.dCut = i; break; }   // 판 하나에 40분 상한
    if (i % 5 === 4) { rec.d = D; save(); }
  }
  rec.ms.judge = cpu() - t;
  rec.d = D; rec.ms.total = cpu() - T0; save();
  console.log(`[t1440-probe] 날 ${day} · 쌍 ${routes.length} · 길 칸 ${cellPairs.size} · CPU ${Math.round((cpu() - T0) / 1000)}초`);
}
