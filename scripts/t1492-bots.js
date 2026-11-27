// (@regress 없음 — 러너 밖 · T1492 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1492-bots.js — `t1486-bots.js` 를 베낀 것(봇 손짓 글자 그대로) + 긴 판(마디) · 손짓 고르기 · 관찰 칸 더함 ==========
//   T1486 과 다른 것(손짓 글자 · 봇 이름은 같다 — 같은 시드면 T1486 판과 같은 세계):
//     · 마디 판(`t1308-long-run.js` · `T1492_SEG=1`): 기록 파일 = 판 자 JSON(`T577_OUT` = seg-<날>.json) 옆 `seg-<날>.bots.json`. 이은 마디(`T577_RESUMED=1`)는 첫 날 손짓을 건너뛴다(앞 마디가 그 날 손짓을 이미 했다 — 멈춤 날 두 번 0).
//     · `T1492_ACTS` — 손짓 고르기(쉼표 · 기본 block,bridge,land,hit,recon = T1486 그대로 · 빈 글자 'none' = 손짓 0 · 봇은 있되 가만히).
//     · 관찰 더함(읽기만): 영토 칸(마을 `_terrSet` 크기 합) · 산 마을 · CPU 초 · 힙 · 짐승 깔때기(야생 층 `_debug` — 블록 몹 · 존 몹 · 야생 틱 · 맞힘 · T1432 짐승 죽음 · T1461 셈) · stopSleep.
//   쓰는 법: NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1492-bots.js" T1492_OUT=<파일.json> [T1486_BOTS=8] [T1486_DAY0=6] [T1492_ACTS=…]
//             node scripts/t577-server-run.js <날> <시드>     (판 자가 아이 존에 env 를 그대로 준다 · 제품 코드 손 0 · 읽기 + 제품 문 호출뿐)
//   ── 아래는 T1486 머리글 그대로 ──
//   봇 = 가짜 플레이어(`p_t1486_<i>` · 소켓 대신 알림을 세는 귀 · players 표 밖 = 보는 사람 0 · T1440 · T1423 판 계측기와 같은 꼴)
//   봇 손짓(제품 문 그대로 · 모두 DAY0 날부터):
//     길막기   — DAY0 한 번: 교역로 길목(다리 머리 · 고개 · 마을 문 · 길 한가운데 · 들)에 울타리를 봇이 나눠 놓는다(`_tryBuildAt`)           [T1423 ⓑ BLOCK_REACT 길]
//     다리짓기 — 열흘마다 봇 둘이 다리 머리 칸에 울타리를 놓아 본다(끔이면 서고 켬이면 거절 · 선 것은 사흘 뒤 그 봇이 허문다)                                              [T1423 ⓐ NO_BUILD 길]
//     남의 땅  — 닷새마다 봇 하나가 임시 사유지를 잡고 다른 봇이 그 안에 울타리를 놓아 본다                                              [사유지 · 원한 길]
//     NPC 치기 — 날마다 마을 몸 하나를 `damagePlayer(…, 'player:봇')` 로 쓰러뜨린다(켬이면 진짜 죽음 · 끔이면 30초 되살림)               [T1432 길]
//     접속 끊고 다시 붙기 — 열흘마다 봇 하나가 `_t1423Collect`(들어오는 순간 쌓인 적대감을 받는 그 문)를 부른다                              [T1423 ⓑ 접속 안 한 몫]
//   관찰(읽기만): 날마다 인구 · 빈 마을 · 굶어 죽음 · 봇 벌점 · 손잡이 셈(`_t1423A` · `_t1423Z` · `t1423Stat` · `t1432Stat` · `_t1433Stat` · 영토 쓰기 문 부른 수) · 벽시계
//     20날마다와 끝에 DB 의 `village_buildings` 행 수 · DB 파일 크기(별도 읽기 연결)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!(process.env.T1492_OUT || process.env.T1492_SEG === '1') || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const OUT = process.env.T1492_SEG === '1' ? String(process.env.T577_OUT).replace(/\.json$/, '') + '.bots.json' : process.env.T1492_OUT, SZ = 32, NB = Math.max(1, +(process.env.T1486_BOTS || 8)), DAY0 = +(process.env.T1486_DAY0 || 6);
const KINDS = ['head', 'pass', 'gate', 'road', 'field'];
const ACTS = new Set(String(process.env.T1492_ACTS == null ? 'block,bridge,land,hit,recon' : process.env.T1492_ACTS).split(',').map((x) => x.trim()).filter((x) => x && x !== 'none'));
const RESUMED = process.env.T577_RESUMED === '1'; let firstDay = true;
const rec = { v: 1492, acts: [...ACTS], resumed: RESUMED, zoneId: process.env.ZONE_ID || null, bots: NB, day0: DAY0, knobs: { NO_BUILD: process.env.T1423_NO_BUILD || '', REACT: process.env.T1423_BLOCK_REACT || '', NPC_DEATH: process.env.T1432_NPC_DEATH || '', TERR_SEQ: process.env.T1433_TERR_SEQ || '', BEAST_UNSEEN: process.env.T1461_BEAST_UNSEEN || '' },
  groups: {}, g: { block: { want: 0, placed: 0, refused: 0 }, bridge: { tries: 0, ok: 0, refused: 0, none: 0, removed: 0 }, land: { claims: 0, claimFail: 0, tries: 0, ok: 0, refused: 0 }, hit: { tries: 0, down: 0, died: 0, revive: 0, skip: 0 }, recon: { tries: 0, owed: 0 } },
  notices: {}, days: [], db: [], terrCalls: { insertTerrSeq: 0, rows: 0, terrCompact: 0 }, wall0: process.uptime(), end: null, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1492v') < 0) src += '\n;module.exports.__t1492v = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { const st = m.exports.__t1492v(), d = (st.world && st.world.day) | 0; if (d !== lastDay) { lastDay = d; day(st, m.exports, d); } }
      catch (e) { rec.err = rec.err || String(e && e.stack).slice(0, 800); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
const K = (x, y) => x + ',' + y;
//   작은 결정론 난수(시드 · 날에서만 — 판마다 같은 손짓)
const seed0 = +(process.env.T577_SEED || 1) | 0;
const rnd = (d, k) => { let x = (seed0 * 73856093) ^ (d * 19349663) ^ (k * 83492791); x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
//   ── 봇 ──
const BOTS = [];
const noticeText = (s) => { try { const o = JSON.parse(s); return String(o && (o.text || o.msg || '') || '').replace(/[0-9]+/g, '#').slice(0, 90); } catch (e) { return ''; } };
for (let i = 0; i < NB; i++) {
  const P = { playerId: 'p_t1486_' + i, pid: null, name: '봇' + i, inventory: { wood: 9999, stone: 9999, plank: 999, fiber: 999, item_fence: 999, item_wall: 999, item_door: 999 }, x: 0, y: 0, floor: 0, vp: 0, toolItems: [], _n: 0 };
  P.ws = { readyState: 1, OPEN: 1, send(s) { const t = noticeText(s); if (!t) return; P._n++; rec.notices[t] = (rec.notices[t] || 0) + 1; P._last = t; } };
  BOTS.push(P);
}
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
//   ── 손짓 ──
const putAt = (H, P, x, y) => { P.x = x * SZ + SZ / 2; P.y = y * SZ + SZ / 2; };
function fenceAt(H, P, x, y) {   // 제품 짓기 문 그대로 → 결과 { ok, note }
  putAt(H, P, x, y); const n0 = P._n; let ok = false;
  try { ok = !!H._tryBuildAt(P, 'fence', 0, null, null, { skipCost: true }); } catch (e) { ok = false; rec.actErr = rec.actErr || String(e && e.stack).slice(0, 300); }
  return { ok, note: ok ? null : P._last };
}
function blockPlace(st, H, SV, d) {
  const { out } = pick(st, H, SV); let bi = 0;
  for (const kind of Object.keys(out)) {
    const G = out[kind], placed = [], refused = []; const r0 = Object.assign({}, H._t1423A.refuse);
    for (const [x, y] of G.cells) { const P = BOTS[bi++ % NB]; const r = fenceAt(H, P, x, y); if (r.ok) placed.push([x, y]); else refused.push([x, y]); }
    const r1 = H._t1423A.refuse, gate = {}; for (const k of Object.keys(r1)) if ((r1[k] || 0) - (r0[k] || 0)) gate[k] = r1[k] - (r0[k] || 0);
    rec.groups[kind] = { at: G.at, want: G.cells.length, placed: placed.length, refused: refused.length, gate, routes: G.routes, day: d };
    rec.g.block.want += G.cells.length; rec.g.block.placed += placed.length; rec.g.block.refused += refused.length;
  }
}
const BRIDGE_UP = [];   // 서 있는 다리 머리 울타리 [봇 · 칸 · 놓은 날] — 사흘 뒤 그 봇이 직접 허문다(다리가 영영 막히면 캐러밴 길 찾기가 판을 먹는다 · 첫 판 50분)
function bridgeTry(st, H, SV, d) {
  const g = rec.g.bridge;
  //   치우기(제품 문 그대로 · `doDismantleBuilding`) — 놓은 지 3날 된 것
  for (let i = BRIDGE_UP.length - 1; i >= 0; i--) {
    const u = BRIDGE_UP[i]; if (d - u.d < 3) continue; BRIDGE_UP.splice(i, 1);
    let id = null; for (const bb of H.buildings.values()) if (bb.ownerId === u.P.playerId && bb.type === 'fence' && Math.floor(bb.x / SZ) === u.x && Math.floor(bb.y / SZ) === u.y) { id = bb.id; break; }
    if (id) { try { H.doDismantleBuilding(u.P, id); g.removed = (g.removed | 0) + 1; } catch (e) { rec.actErr = rec.actErr || String(e && e.stack).slice(0, 300); } }
  }
  if ((d - DAY0) % 10 !== 0) return;   // 열흘에 한 번 · 봇 둘이 다른 칸에
  const L = SV.t1406BridgeCells(), cells = []; for (let i = 0; i + 1 < L.length; i += 2) cells.push([L[i], L[i + 1]]);
  const land = cells.filter(([x, y]) => !H.isWaterTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2));
  if (!land.length) { g.none++; return; }
  for (let k = 0; k < 2; k++) {
    const [x, y] = land[Math.floor(rnd(d, 1 + k) * land.length)], P = BOTS[(d + k) % NB]; g.tries++;
    const r = fenceAt(H, P, x, y); if (r.ok) { g.ok++; BRIDGE_UP.push({ P, x, y, d }); } else g.refused++;
  }
}
function landTry(st, H, SV, d) {   // 마을 둘레에 봇 하나가 임시 사유지를 잡고, 다른 봇이 그 안에 울타리를 놓아 본다
  const g = rec.g.land, vs = (st.villages || []).filter((v) => v.ccx != null);
  if (!vs.length) { g.claimFail++; return; }
  const v = vs[Math.floor(rnd(d, 2) * vs.length)], A = BOTS[(d / 5 | 0) % NB], B = BOTS[((d / 5 | 0) + 1) % NB];
  let cx = null, cy = null;
  for (let k = 0; k < 40 && cx == null; k++) {   // 마을 한가운데에서 8 ~ 20칸 떨어진 걸을 수 있는 칸
    const r = 8 + Math.floor(rnd(d, 10 + k) * 13), a = rnd(d, 60 + k) * 2 * Math.PI, x = Math.round(v.ccx + r * Math.cos(a)), y = Math.round(v.ccy + r * Math.sin(a));
    if (!H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) && !H.isWaterTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2)) { cx = x; cy = y; }
  }
  if (cx == null) { g.claimFail++; rec.landDbg = { d, why: 'no cell', v: v.name }; return; }
  putAt(H, A, cx, cy); const c0 = H.claims.size, n0 = A._n;
  try { H.tryClaim(A, 'temporary'); } catch (e) { rec.actErr = rec.actErr || String(e && e.stack).slice(0, 300); }
  if (H.claims.size <= c0) { g.claimFail++; rec.landDbg = { d, notice: A._last, v: v.name, at: [cx, cy] }; return; }
  g.claims++;
  g.tries++; const r = fenceAt(H, B, cx, cy); if (r.ok) g.ok++; else g.refused++;
  rec.landLast = { d, v: v.name, at: [cx, cy], ok: r.ok, note: r.note || null };
}
function hitNpc(st, H, SV, d) {
  const g = rec.g.hit, vs = (st.villages || []).filter((v) => v.npcPids && v.npcPids.length >= 2 && v.econ && v.econ.npcs && v.econ.npcs.length >= 2);
  if (!vs.length) { g.skip++; return; }
  const v = vs[Math.floor(rnd(d, 3) * vs.length)], pid = v.npcPids[v.npcPids.length - 1], p = H.players.get(pid);
  if (!p || p.hp <= 0 || p.isDown) { g.skip++; return; }
  const bot = BOTS[d % NB], e0 = v.econ.npcs.length, n0 = v.npcPids.length; g.tries++;
  H.damagePlayer(p, (p.hp || 100) + 50, 'player:' + bot.playerId);
  if (p.hp <= 0 || p.isDown) g.down++;
  if (p._bxExit === 'died') g.died++; else g._pend = (g._pend || []).concat([[pid, v.dbId]]).slice(-400);
  rec.hitLast = { d, v: v.dbId, econ: [e0, v.econ.npcs.length], bodies: [n0, v.npcPids.length], exit: p._bxExit || null };
}
function recon(st, H, d) {
  const g = rec.g.recon, owed = BOTS.filter((b) => H._t1423Owe.has(b.playerId)), P = owed.length ? owed[0] : BOTS[(d / 10 | 0) % NB]; g.tries++;   // 쌓인 몫이 있는 봇이 있으면 그 봇이 다시 붙는다
  if (H._t1423Owe.has(P.playerId)) g.owed++;
  try { H._t1423Collect(P); } catch (e) { rec.actErr = rec.actErr || String(e && e.stack).slice(0, 300); }
}
//   ── 관찰 ──
let DBR = null;
function dbStat(d) {
  try {
    //   ★[T1492] 존과 **같은 SQLite 사본**(`node:sqlite`)으로 읽는다 — T1486 처럼 `better-sqlite3`(다른 사본)로 열면 한 프로세스에 SQLite 가 둘이라
    //     WAL 공유 메모리(-shm)를 서로 모른 채 다시 세운다 → 존 쪽 매핑이 잘린 파일을 밟아 SIGBUS(긴 판 날 400 이은 마디에서 재현 · gdb `walIndexAppend` · 보고 T1492 어긋난 것).
    if (!DBR) { const { DatabaseSync } = require('node:sqlite'); DBR = new DatabaseSync(process.env.DB_PATH, { readOnly: true }); }
    const n = (q) => DBR.prepare(q).get().n;
    const f = (p) => { try { return fs.statSync(p).size; } catch (e) { return 0; } };
    const o = { d, vb: n('SELECT COUNT(*) n FROM village_buildings'), terr: n("SELECT COUNT(*) n FROM village_buildings WHERE type='terr'"), seq: n("SELECT COUNT(*) n FROM village_buildings WHERE type='terrseq'"), bld: n('SELECT COUNT(*) n FROM buildings'), claims: n('SELECT COUNT(*) n FROM claims'),
      db: f(process.env.DB_PATH), wal: f(process.env.DB_PATH + '-wal') };
    rec.db.push(o); return o;
  } catch (e) { rec.dbErr = rec.dbErr || String(e && e.message).slice(0, 200); return null; }
}
let wrapped = false;
function wrapDb(st) {
  if (wrapped || !st.db) return; wrapped = true;
  const db = st.db;
  for (const k of ['insertTerrSeq', 'terrCompact']) if (typeof db[k] === 'function') { const f = db[k]; db[k] = function () { rec.terrCalls[k]++; if (k === 'insertTerrSeq' && Array.isArray(arguments[3])) rec.terrCalls.rows += arguments[3].length; return f.apply(this, arguments); }; }
}
//   짐승 깔때기(읽기만) — 야생 층(`wildlife._debug`)의 블록 몹 · 맞힘 · 야생 틱(활성 청크가 하나라도 있을 때만 는다) · 존 몹 · T1432 짐승 죽음 · T1461 셈
const WF = path.join(ROOT, 'server', 'wildlife.js');
function beastFunnel(st, H, V) {
  const o = {};
  try { const W = require.cache[WF] && require.cache[WF].exports; if (W && W._debug) { const S = W._debug.S, s = W._debug.stats; o.lab = S && S.mobs ? S.mobs.filter((m) => m.st !== 'dead').length : null; o.agents = S && S.agents ? S.agents.length : null; o.ticks = s.ticks; o.hits = s.hits; o.spawned = s.spawned; o.charges = s.charges; if (W.t1461Stat) o.w1461 = W.t1461Stat(); if (W.t1393Stat) o.t1393 = (({ wake, hunt, seen }) => ({ wake, hunt, seen }))(W.t1393Stat()); } } catch (e) { o.err = String(e && e.message).slice(0, 80); }
  try {   // 존 몹: 수 · 활성 청크에 선 수(존 몹 걸음은 활성 청크에서만 돈다 — 그 밖은 얼어 있다) · 그 자리 둘레 216 px(사냥판 깨움 반경 `T1393_SEE` 글자) 안 NPC 몸 짝(만날 수 있던 짝 · 날 표본 한 번)
    o.zoneMobs = H.mobs ? H.mobs.size : null; let act = 0, pairs = 0, npcs = []; for (const p of H.players.values()) if (p.isNpc && p.hp > 0) npcs.push(p);
    const G = new Map(); for (const p of npcs) { const k = ((p.x / 216) | 0) + ',' + ((p.y / 216) | 0); let a = G.get(k); if (!a) G.set(k, a = []); a.push(p); }
    for (const m of H.mobs.values()) { if (m.hp != null && m.hp <= 0) continue; if (H.isPositionActive(m.x, m.y)) act++; const gx = (m.x / 216) | 0, gy = (m.y / 216) | 0; for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const a = G.get((gx + dx) + ',' + (gy + dy)); if (a) for (const p of a) if ((p.x - m.x) ** 2 + (p.y - m.y) ** 2 <= 216 * 216) pairs++; } }
    o.zoneMobsActive = act; o.encPairs = pairs; o.npcBodies = npcs.length;
  } catch (e) { o.zerr = String(e && e.message).slice(0, 80); }
  try { const t = V.t1432Stat ? V.t1432Stat() : null; if (t) { o.died = t.died; o.wild = t.wild; o.other = t.other; } } catch (e) {}
  try { const t = V.t1461Stat ? V.t1461Stat() : null; if (t) o.v1461 = (({ events, ...r }) => r)(t); } catch (e) {}
  try { const t = V.t1423Stat ? V.t1423Stat() : null; if (t) o.stopSleep = t.stopSleep; } catch (e) {}
  return o;
}
function day(st, V, d) {
  const H = Hz(); if (!H) return;
  wrapDb(st);
  const skip = RESUMED && firstDay; firstDay = false; if (skip) rec.skipDay = d;
  if (d >= DAY0 && !skip) {
    if (d === DAY0 && ACTS.has('block')) { try { blockPlace(st, H, H.SimVillages, d); } catch (e) { rec.err = rec.err || 'block ' + String(e && e.stack).slice(0, 600); } }
    if (ACTS.has('bridge')) try { bridgeTry(st, H, H.SimVillages, d); } catch (e) { rec.err = rec.err || 'bridge ' + String(e && e.stack).slice(0, 600); }
    if ((d - DAY0) % 5 === 0 && ACTS.has('land')) try { landTry(st, H, H.SimVillages, d); } catch (e) { rec.err = rec.err || 'land ' + String(e && e.stack).slice(0, 600); }
    if (ACTS.has('hit')) try { hitNpc(st, H, H.SimVillages, d); } catch (e) { rec.err = rec.err || 'hit ' + String(e && e.stack).slice(0, 600); }
    if ((d - DAY0) % 10 === 5 && ACTS.has('recon')) try { recon(st, H, d); } catch (e) { rec.err = rec.err || 'recon ' + String(e && e.stack).slice(0, 600); }
  }
  let pop = 0, vills = 0, empty = 0, fd = 0, dead = 0, emig = 0, wildDead = 0, terr = 0;
  for (const v of st.villages || []) { terr += v._terrSet ? v._terrSet.size : 0; const e = v.econ; if (!e) continue; vills++; const n = (e.npcs || []).length; pop += n; if (!n) empty++; fd += e._fdDeadTot || 0; dead += e._deadTot || 0; emig += e._emigTot || 0; wildDead += e._wildDeadTot || 0; }
  const cu = process.cpuUsage(), mu = process.memoryUsage();
  const ext = { terr, vAll: (st.villages || []).length, cpu: +((cu.user + cu.system) / 1e6).toFixed(1), heap: Math.round(mu.heapUsed / 1048576), rss: Math.round(mu.rss / 1048576), beast: beastFunnel(st, H, V) };
  const row = { d, pop, vills, empty, fd, dead, emig, wildDead, wall: +(process.uptime() - rec.wall0).toFixed(1), vp: BOTS.reduce((a, b) => a + (b.vp || 0), 0), vpMax: Math.max(...BOTS.map((b) => b.vp || 0)),
    ref: Object.assign({}, H._t1423A && H._t1423A.refuse), z: Object.assign({}, H._t1423Z || {}), owe: H._t1423Owe ? H._t1423Owe.size : 0, idx: H._t1423Idx ? H._t1423Idx.n : 0 };
  Object.assign(row, ext);
  rec.days.push(row);
  if (d % 10 === 0) { rec.notice_n = BOTS.reduce((a, b) => a + b._n, 0); try { rec.t1423 = V.t1423Stat ? (({ known, jobs, ...r }) => Object.assign(r, { known: known.length, jobs: jobs.length }))(V.t1423Stat()) : null; } catch (e) {} try { rec.t1432 = V.t1432Stat ? (({ events, ...r }) => r)(V.t1432Stat()) : null; } catch (e) {} try { rec.t1433 = V._t1433Stat ? Object.assign({}, V._t1433Stat) : null; } catch (e) {} if (d % 20 === 0) dbStat(d); save(); }
}
process.on('exit', () => {
  try {
    const m = require.cache[VF], V = m && m.exports;
    rec.notice_n = BOTS.reduce((a, b) => a + b._n, 0);
    try { rec.t1423 = V.t1423Stat ? (({ known, jobs, ...r }) => Object.assign(r, { known: known.length, jobs: jobs.length }))(V.t1423Stat()) : null; } catch (e) {}
    try { rec.t1432 = V.t1432Stat ? (({ events, ...r }) => r)(V.t1432Stat()) : null; } catch (e) {}
    try { rec.t1433 = V._t1433Stat ? Object.assign({}, V._t1433Stat) : null; } catch (e) {}
    try { rec.bodyExit = V.bodyExitStats ? V.bodyExitStats() : null; } catch (e) {}
    const Hh = Hz(); if (Hh) { rec.zone = Object.assign({}, Hh._t1423Z || {}); rec.refuse = Object.assign({}, Hh._t1423A && Hh._t1423A.refuse); }
    rec.botVp = BOTS.map((b) => b.vp || 0);
    dbStat((rec.days[rec.days.length - 1] || {}).d);
    rec.end = Date.now(); delete rec.g.hit._pend; save();
  } catch (e) { rec.err = rec.err || String(e && e.stack).slice(0, 300); save(); }
});
