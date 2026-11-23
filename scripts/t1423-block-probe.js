// (@regress 없음 — 러너 밖 · T1423 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1423-block-probe.js — 봇이 길을 막으면 세계가 무엇을 하나(다리 머리 앞 · 고개 · 마을 문 앞 · 길 한가운데 · 길과 상관없는 들) ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1423-block-probe.js" T1423_PROBE_OUT=<파일.json> T1423_PROBE_DAY=<econ 날>
//             [T1423_PROBE_KINDS=head,pass,gate,road,field] node scripts/t577-server-run.js <날> <시드>` (판 자가 아이 존에 env 를 그대로 준다)
//   ⓐ 그날 한 번 — 자리 고르기(교역로 `state.routeCache` · 존 설정 다리 · T1406 ㉮ 칸 · 존 걸음 술어 `isTerrainBlockedLocal` — 도랑 포함):
//      head  = 교역로가 가장 많이 지나는 다리 묶음(존 설정 `bridges` 4방 덩이)의 한 끝 — 그 끝 다리 머리(㉮ 칸 · 8방 덩이)에 맞닿은 뭍 한 겹(㉮ 밖)을 다 울타리로(그 끝이 섬이 된다)
//      pass  = 교역로 칸 가운데 길에 곧게 가로지른 걸을 수 있는 폭이 가장 좁은 곳(양쪽이 12칸 안에서 지형 · 도랑에 닿는다 · 다리 · 마을 · head 에서 40칸 밖) — 그 가로줄 전부
//      gate  = 환호 마을(도랑 셀이 둘레에 있는 마을) 가운데 60칸 안 교역로 칸의 가장 좁은 가로줄(= 도랑 출입구) 전부
//      road  = 교역로 칸 가운데 둘레 12칸이 다 열린 뭍(들 한가운데) — 길에 곧게 가로지른 울타리 K 개(K = 앞 셋 가운데 가장 많은 수 · 같은 재료)
//      field = 교역로에서 15 ~ 25칸 떨어진 열린 뭍 — 같은 K 개 한 줄
//   ⓑ 가짜 플레이어(`p_t1423` · 소켓 0 · players 표 밖 = 보는 사람 0)가 **제품 건축 길 그대로**(`_tryBuildAt` · 비용 0) 놓는다 — 놓인 수 · 거절(ⓐ 문) 수
//   ⓒ 놓은 날 — 그 묶음을 지나는 교역로(쌍)마다 두 끝 마을 닻 사이 걸음(존 걸음 술어 + 그 울타리 · 8방 · 모서리 깎기 0 · audit-walk-map 다익스트라 그 꼴 · 상자 = 두 닻 + 120칸)
//      막기 전 ↔ 뒤 — 비 · 못 닿음(T1406 자 "3배 넘게 돌게 한다" 의 그 비)
//   ⓓ 날마다 — 묶음마다 서 있는 울타리 · 그 곁(2칸)에 선 캐러밴 몸 · T1423 셈(만남 · 가름 · 소식 · 일감 · 부숨) · 마을 굶어 죽음 · 죽음 합
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1423_PROBE_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();   // [T1288] 판 자(`t577-server-run`)가 이미 닿지 않는 central 을 준다 — 없을 때만 같은 값(무동작)
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const DAY = +(process.env.T1423_PROBE_DAY || 10), OUT = process.env.T1423_PROBE_OUT, SZ = 32;
const KINDS = String(process.env.T1423_PROBE_KINDS || 'head,pass,gate,road,field').split(',').filter(Boolean);
const rec = { day: DAY, kinds: KINDS, knobs: { NO_BUILD: process.env.T1423_NO_BUILD || '', REACT: process.env.T1423_BLOCK_REACT || '', MEET: process.env.T1423_REACT_MEET || '' }, groups: {}, days: [], end: null, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1423v') < 0) src += '\n;module.exports.__t1423v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try {
        const st = m.exports.__t1423v(), d = (st.world && st.world.day) | 0;
        if (d !== lastDay) { lastDay = d; day(st, m.exports, d); }
      } catch (e) { rec.err = String(e && e.stack).slice(0, 600); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
const K = (x, y) => x + ',' + y;
//   ── 걸음 술어(존 정본) · 상자 안 다익스트라(8방 · 곧은 5 · 대각 7 · 모서리 깎기 0 — audit-walk-map 의 그 꼴) ──
function walk(H, a, b, fences) {
  const M = 120, x0 = Math.min(a[0], b[0]) - M, y0 = Math.min(a[1], b[1]) - M, x1 = Math.max(a[0], b[0]) + M, y1 = Math.max(a[1], b[1]) + M;
  const W = x1 - x0 + 1, Hh = y1 - y0 + 1, N = W * Hh, blk = new Uint8Array(N);
  const Z = walk.Z || (walk.Z = (() => { const z = require(path.join(ROOT, 'server', 'zone-config')).ZONES[process.env.ZONE_ID || 'hanbando'] || {}; const nx = Math.ceil((z.zoneWidth || 0) / SZ), ny = Math.ceil((z.zoneHeight || 0) / SZ); return { nx, ny, m: new Uint8Array(nx * ny) }; })());   // 0 모름 · 1 열림 · 2 막힘(존 술어 메모)
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    let v;
    if (x < 0 || y < 0 || x >= Z.nx || y >= Z.ny) v = 1;
    else { const k = y * Z.nx + x; let q = Z.m[k]; if (!q) { q = H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) ? 2 : 1; Z.m[k] = q; } v = q === 2 ? 1 : 0; }
    blk[(y - y0) * W + (x - x0)] = v;
  }
  if (fences) for (const f of fences) { const [x, y] = f; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) blk[(y - y0) * W + (x - x0)] = 1; }
  const s = (a[1] - y0) * W + (a[0] - x0), t = (b[1] - y0) * W + (b[0] - x0);
  if (blk[s] || blk[t]) return null;
  const dist = new Int32Array(N).fill(0x3fffffff), B = 8, bk = Array.from({ length: B }, () => []);
  dist[s] = 0; bk[0].push(s); let n = 1, cur = 0, idle = 0;
  const D = [[1, 0, 5], [-1, 0, 5], [0, 1, 5], [0, -1, 5], [1, 1, 7], [1, -1, 7], [-1, 1, 7], [-1, -1, 7]];
  while (n > 0) {
    const L = bk[cur % B]; if (!L.length) { cur++; if (++idle > B) break; continue; }
    idle = 0; const i = L.pop(); n--; if (dist[i] !== cur) continue; if (i === t) return cur / 5;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy, c] of D) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= Hh) continue;
      const j = ny * W + nx; if (blk[j]) continue;
      if (dx && dy && (blk[y * W + nx] || blk[ny * W + x])) continue;
      const nd = cur + c; if (nd >= dist[j]) continue; dist[j] = nd; bk[nd % B].push(j); n++;
    }
    if (!bk[cur % B].length) cur++;
  }
  return null;
}
function anchor(H, v) { for (let r = 0; r <= 40; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = v.ccx + dx, y = v.ccy + dy; if (!H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) return [x, y]; } return null; }
//   ── 교역로 칸(지나는 길 수 · 길 방향) ──
function routeCells(st) {
  const C = new Map();   // 칸 → { n, dx, dy, keys:Set }
  for (const [key, pts] of (st.routeCache || new Map())) {
    if (!pts || pts.length < 2) continue; const seen = new Set();
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], c = pts[k], L = Math.max(1, Math.ceil(Math.hypot(c.x - a.x, c.y - a.y) / SZ));
      for (let s = 0; s <= L; s++) { const x = Math.floor((a.x + (c.x - a.x) * s / L) / SZ), y = Math.floor((a.y + (c.y - a.y) * s / L) / SZ), q = K(x, y); if (seen.has(q)) continue; seen.add(q);
        const o = C.get(q) || { x, y, n: 0, dx: c.x - a.x, dy: c.y - a.y, keys: new Set() }; o.n++; o.keys.add(key); C.set(q, o); } }
  }
  return C;
}
//   길에 곧게 가로지른 줄 — 걸을 수 있는 칸들 · 양 끝이 막힘(지형 · 도랑)에 닿았나
function cross(H, o, cap) {
  const vert = Math.abs(o.dx) >= Math.abs(o.dy), px = vert ? 0 : 1, py = vert ? 1 : 0, cells = [[o.x, o.y]];
  const open = (x, y) => !H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2);
  if (!open(o.x, o.y)) return null;
  let endA = false, endB = false;
  for (let i = 1; i <= cap; i++) { const x = o.x + px * i, y = o.y + py * i; if (!open(x, y)) { endA = true; break; } cells.push([x, y]); }
  for (let i = 1; i <= cap; i++) { const x = o.x - px * i, y = o.y - py * i; if (!open(x, y)) { endB = true; break; } cells.push([x, y]); }
  return { cells, sealed: endA && endB, vert };
}
function pick(st, H, SV) {
  const RC = routeCells(st), out = {}, used = [], far = (x, y, R) => used.every(([ux, uy]) => Math.max(Math.abs(ux - x), Math.abs(uy - y)) > R);
  const vils = st.villages || [], nearVil = (x, y, R) => vils.some((v) => Math.max(Math.abs(v.ccx - x), Math.abs(v.ccy - y)) <= R);
  const heads = new Set(); { const L = SV.t1406BridgeCells(); for (let i = 0; i + 1 < L.length; i += 2) heads.add(K(L[i], L[i + 1])); }
  const isW = (x, y) => H.isWaterTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2);
  //   head — 다리 묶음(4방) · 지나는 길 수
  if (KINDS.includes('head')) {
    const Z = require(path.join(ROOT, 'server', 'zone-config')).ZONES[st.zoneId] || {}, b = Z.bridges || [], cells = []; for (let i = 0; i + 1 < b.length; i += 2) cells.push([b[i], b[i + 1]]);
    const idx = new Map(cells.map(([x, y], n) => [K(x, y), n])), gid = new Int32Array(cells.length).fill(-1), groups = [];
    for (let n = 0; n < cells.length; n++) { if (gid[n] >= 0) continue; const gr = [], stk = [n]; gid[n] = groups.length; while (stk.length) { const q = stk.pop(); gr.push(q); const [x, y] = cells[q]; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx.get(K(x + dx, y + dy)); if (j != null && gid[j] < 0) { gid[j] = groups.length; stk.push(j); } } } groups.push(gr); }
    let best = null;
    for (let g = 0; g < groups.length; g++) { const keys = new Set(); for (const q of groups[g]) { const o = RC.get(K(cells[q][0], cells[q][1])); if (o) for (const k of o.keys) keys.add(k); } if (!best || keys.size > best.n) best = { g, n: keys.size, keys }; }
    if (best && best.n) {
      //   다리 머리 뭍 칸(㉮ · 이 묶음 물 칸에서 체비쇼프 2) — 8방 덩이 둘(두 끝) · 지나는 길 칸이 더 많은 끝
      const W = groups[best.g].map((q) => cells[q]).filter(([x, y]) => isW(x, y)), hd = new Set();
      for (const [bx, by] of W) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = bx + dx, y = by + dy; if (heads.has(K(x, y)) && !isW(x, y)) hd.add(K(x, y)); }
      const comp = [], seen = new Set();
      for (const q of hd) { if (seen.has(q)) continue; const c = [], stk = [q]; seen.add(q); while (stk.length) { const z = stk.pop(); c.push(z); const [x, y] = z.split(',').map(Number); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const w = K(x + dx, y + dy); if (hd.has(w) && !seen.has(w)) { seen.add(w); stk.push(w); } } } comp.push(c); }
      comp.sort((a, b2) => b2.filter((z) => RC.has(z)).length - a.filter((z) => RC.has(z)).length);
      const end = comp[0] || [], endSet = new Set(end), ring = new Set();
      for (const z of end) { const [x, y] = z.split(',').map(Number); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const w = K(x + dx, y + dy); if (endSet.has(w) || heads.has(w)) continue; const [wx, wy] = [x + dx, y + dy]; if (H.isTerrainBlockedLocal(wx * SZ + SZ / 2, wy * SZ + SZ / 2) || H.isBridgeTileLocal(wx * SZ + SZ / 2, wy * SZ + SZ / 2)) continue; ring.add(w); } }
      const c0 = end.length ? end[0].split(',').map(Number) : [0, 0];
      out.head = { cells: [...ring].map((z) => z.split(',').map(Number)), at: c0, bridgeCells: groups[best.g].length, routes: best.n, headCells: end.length };
      used.push(c0);
    }
  }
  const cand = [...RC.values()].sort((a, b2) => b2.n - a.n || a.x - b2.x || a.y - b2.y);
  const ditch = new Set(); for (const v of vils) for (const c of (v._ditch || [])) ditch.add(K(c.cx, c.cy));
  const ditchVils = vils.filter((v) => v._ditch && v._ditch.length);
  const nearBridge = (o) => { for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (heads.has(K(o.x + dx, o.y + dy)) || H.isBridgeTileLocal((o.x + dx) * SZ + 16, (o.y + dy) * SZ + 16)) return true; return false; };
  const narrow = (filt, cap) => { let best = null; for (const o of cand) { if (!filt(o)) continue; const c = cross(H, o, cap); if (!c || !c.sealed) continue; if (!best || c.cells.length < best.cells.length || (c.cells.length === best.cells.length && o.n > best.n)) best = { cells: c.cells, at: [o.x, o.y], n: o.n, vert: c.vert }; } return best; };
  if (KINDS.includes('pass')) {
    const b2 = narrow((o) => o.n >= 2 && far(o.x, o.y, 40) && !nearVil(o.x, o.y, 40) && !nearBridge(o) && !ditchVils.some((v) => Math.max(Math.abs(v.ccx - o.x), Math.abs(v.ccy - o.y)) <= 60), 12);
    if (b2) { out.pass = { cells: b2.cells, at: b2.at, routes: b2.n }; used.push(b2.at); }
  }
  if (KINDS.includes('gate') && ditchVils.length) {
    const b3 = narrow((o) => far(o.x, o.y, 30) && ditchVils.some((v) => Math.max(Math.abs(v.ccx - o.x), Math.abs(v.ccy - o.y)) <= 60) && (() => { for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (ditch.has(K(o.x + dx, o.y + dy))) return true; return false; })(), 12);
    if (b3) { out.gate = { cells: b3.cells, at: b3.at, routes: b3.n, vil: (ditchVils.find((v) => Math.max(Math.abs(v.ccx - b3.at[0]), Math.abs(v.ccy - b3.at[1])) <= 60) || {}).name }; used.push(b3.at); }
  }
  const Kn = Math.max(4, ...['head', 'pass', 'gate'].filter((k) => out[k]).map((k) => out[k].cells.length));
  const openBox = (x, y, R) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (H.isTerrainBlockedLocal((x + dx) * SZ + 16, (y + dy) * SZ + 16) || H.isBridgeTileLocal((x + dx) * SZ + 16, (y + dy) * SZ + 16)) return false; return true; };
  const line = (o, n) => { const vert = Math.abs(o.dx) >= Math.abs(o.dy), px = vert ? 0 : 1, py = vert ? 1 : 0, h = Math.floor(n / 2), c = []; for (let i = -h; c.length < n; i++) c.push([o.x + px * i, o.y + py * i]); return c; };
  if (KINDS.includes('road')) {
    const o = cand.find((q) => q.n >= 2 && far(q.x, q.y, 40) && !nearVil(q.x, q.y, 30) && openBox(q.x, q.y, 12));
    if (o) { out.road = { cells: line(o, Kn), at: [o.x, o.y], routes: o.n }; used.push([o.x, o.y]); }
  }
  if (KINDS.includes('field')) {
    let got = null;
    for (const o of cand) { if (o.n < 2) continue; for (const [dx, dy] of [[20, 0], [-20, 0], [0, 20], [0, -20], [15, 15], [-15, 15], [15, -15], [-15, -15]]) { const x = o.x + dx, y = o.y + dy; if (!far(x, y, 40) || nearVil(x, y, 30) || !openBox(x, y, 6)) continue; let dmin = Infinity; for (let ry = -25; ry <= 25 && dmin >= 15; ry++) for (let rx = -25; rx <= 25; rx++) if (RC.has(K(x + rx, y + ry))) dmin = Math.min(dmin, Math.max(Math.abs(rx), Math.abs(ry))); if (dmin < 15) continue; got = { x, y, dmin }; break; } if (got) break; }
    if (got) { const c = []; for (let i = 0; i < Kn; i++) c.push([got.x - Math.floor(Kn / 2) + i, got.y]); out.field = { cells: c, at: [got.x, got.y], routes: 0, routeDist: got.dmin === Infinity ? '>25' : got.dmin }; }
  }
  return { out, RC };
}
function place(st, H, SV, d) {
  const { out, RC } = pick(st, H, SV);
  const P = { playerId: 'p_t1423', name: '길막이', inventory: {}, ws: null, x: 0, y: 0, floor: 0, vp: 0 };
  for (const kind of Object.keys(out)) {
    const G = out[kind], placed = [], refused = []; const r0 = Object.assign({}, H._t1423A.refuse);
    for (const [x, y] of G.cells) {
      P.x = x * SZ + SZ / 2; P.y = y * SZ + SZ / 2; let ok = false; try { ok = !!H._tryBuildAt(P, 'fence', 0, null, null, { skipCost: true }); } catch (e) { ok = false; }
      if (!ok) { refused.push([x, y]); continue; }
      let id = null; for (const b of H.buildings.values()) if (b.ownerId === 'p_t1423' && b.type === 'fence' && Math.floor(b.x / SZ) === x && Math.floor(b.y / SZ) === y) { id = b.id; break; }
      placed.push({ x, y, id });
    }
    const r1 = H._t1423A.refuse, gate = {}; for (const k of Object.keys(r1)) if ((r1[k] || 0) - (r0[k] || 0)) gate[k] = r1[k] - (r0[k] || 0);
    //   이 묶음을 지나는 교역로(쌍) — 묶음 칸 · 곁 1칸
    const keys = new Set(); for (const [x, y] of G.cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = RC.get(K(x + dx, y + dy)); if (o) for (const k of o.keys) keys.add(k); }
    const pairs = [], fences = placed.map((q) => [q.x, q.y]);
    for (const key of [...keys].slice(0, 12)) {
      const u = String(key).indexOf('_'), ea = +String(key).slice(0, u), eb = +String(key).slice(u + 1), va = st.byDbId && st.byDbId.get(ea), vb = st.byDbId && st.byDbId.get(eb);
      if (!va || !vb) continue; const A = anchor(H, va), B = anchor(H, vb); if (!A || !B) continue;
      const w0 = walk(H, A, B, null), w1 = walk(H, A, B, fences);
      pairs.push({ a: va.name, b: vb.name, w0, w1, ratio: (w0 && w1) ? +(w1 / w0).toFixed(3) : null, cut: w0 != null && w1 == null });
    }
    rec.groups[kind] = { kind, at: G.at, want: G.cells.length, placed: placed.length, refused: refused.length, gate, ids: placed.map((q) => q.id), cells: placed.map((q) => [q.x, q.y]), routes: keys.size,
      pairs, extra: Object.assign({}, G, { cells: undefined }), day: d };
  }
}
function day(st, V, d) {
  const H = Hz(); if (!H) return;
  const fdOf = () => { const o = {}; for (const v of st.villages || []) { const e = v.econ; if (e) o[v.name] = [e._fdDeadTot || 0, e._deadTot || 0, (e.npcs || []).length]; } return o; };
  if (d >= DAY && !rec.placed) { rec.placed = d; rec.fd0 = fdOf(); try { place(st, H, H.SimVillages, d); } catch (e) { rec.err = 'place ' + String(e && e.stack).slice(0, 600); } save(); }
  if (!rec.placed) return;
  rec.fd1 = fdOf(); rec.fdDay = d;
  let iso = 0; for (const t of ((st.world && st.world.tradeLog) || [])) if (t && t.abandoned && t.day >= rec.placed) iso++; rec.iso = iso;
  const row = { d, g: {} };
  for (const [kind, G] of Object.entries(rec.groups)) {
    const ids = G.ids.filter(Boolean); let standing = 0; for (const id of ids) if (H.buildings.has(id)) standing++;
    let wait = 0; const PL = st.deps && st.deps.players;
    if (st.caravanBodies && PL) for (const bd of st.caravanBodies.values()) { const pp = PL.get(bd.pid); if (!pp) continue; const x = Math.floor(pp.x / SZ), y = Math.floor(pp.y / SZ); if (G.cells.some(([cx, cy]) => Math.max(Math.abs(cx - x), Math.abs(cy - y)) <= 2)) wait++; }
    row.g[kind] = [standing, wait];
  }
  let dead = 0, fd = 0, pop = 0; for (const v of st.villages || []) { const e = v.econ; if (!e) continue; dead += e._deadTot || 0; fd += e._fdDeadTot || 0; pop += (e.npcs || []).length; }
  row.dead = dead; row.fd = fd; row.pop = pop;
  const T = V.t1423Stat ? V.t1423Stat() : null;
  if (T) row.t = [T.stopSleep, T.resp, T.meet, T.meetPass, T.meetBlock, T.learned, T.jobs.length, T.bodies, T.arrive, T.breaks, T.home, T.nobody, T.gone];
  row.iso = rec.iso;
  rec.days.push(row);
  if (d % 10 === 0) { if (T) rec.t1423 = T; rec.zone = H._t1423Z ? Object.assign({}, H._t1423Z) : null; save(); }
}
process.on('exit', () => { try { const m = require.cache[VF]; const T = m && m.exports.t1423Stat ? m.exports.t1423Stat() : null; if (T) rec.t1423 = T; const H = Hz(); if (H && H._t1423Z) rec.zone = Object.assign({}, H._t1423Z); rec.end = Date.now(); save(); } catch (e) {} });
