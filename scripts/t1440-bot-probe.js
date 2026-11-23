// (@regress 없음 — 러너 밖 · T1440 판 계측기 · 제품 무변 · 프리로드로만 실린다)
// === scripts/t1440-bot-probe.js — 처음 길 판(셋째 판): 봇이 길 위에 짓고 · 사유지를 잡는다(악용 일곱 + 다시 놓기) · 판정 · 길이 지나는 칸 · 부수기 · 고립 귀환 · 틱 CPU ==========
//   쓰는 법: `NODE_OPTIONS="--require <t745-vclock> --require $PWD/scripts/t1440-bot-probe.js" T1440_BOT_OUT=<파일.json> [T1440_BOT_DAY=<econ 날>]
//             [T1440_BOT_KINDS=wingsU,wingsP,thick,house,vilpush,neck,grad,door,shop] node scripts/t577-server-run.js <날> <시드>`
//   T1440_BOT_DAY 가 없으면 봇 0 — 셈만(켬 판 · 끈 판 인구 판의 판정 · 쌍 버리기 · 고립 귀환 · 틱 CPU).
//   ⓐ 자리(그날 한 번 — 교역로 `state.routeCache` · 존 걸음 술어): 좁은 목(길에 곧게 가로지른 걸을 수 있는 폭이 12칸 안에서 양쪽 다 막힌 줄 · 마을 · 다리 40칸 밖 · 서로 40칸 밖) ·
//      들(둘레 12칸이 다 열린 길 칸) · 마을 땅 위 목(목 줄에 마을 땅 칸과 밖 칸이 섞인 줄)
//   ⓑ 가짜 플레이어(`p_t1440*` · 소켓 0)가 제품 문 그대로(`_tryBuildAt` 비용 0 · `tryClaim` 임시 사유지 — 봇마다 4칸 · 나무 1) 놓고 잡는다 —
//      묻는 판정이면 늘 다짐(`_t1440Ok` = 조각 서명) · 길 확인 중(한 몫에 안 끝남)이면 그 자리에서 끝까지 민다(봇은 기다리지 않는다 — 몇 번이 줄에 섰나 · CPU 는 센다)
//   ⓒ 악용(표): wingsU 주인 없는 땅 날개 · wingsP 사유지 날개 · thick 열 겹 · house 사유지로 남의 집(주인 없는 땅) 위로 길 몰기(들 · 목) ·
//      vilpush 마을 땅 위 사유지로 마을 밖 남의 사유지에 길 내기 · neck 좁은 목 사유지 + 울타리(닫는 조각 · 부서질 때마다 다시 = again) · grad 조금씩 3배 · door 문 달고 통행세 ·
//      shop 남의 가게 앞 길 돌리기(판정 51 — B 의 길가 칸 · B 가 "그대로 둠"으로 잡은 길 칸 앞을 A 가 "비켜 가게" 사유지로 한 칸씩 — 몇 칸이면 길이 떨어지나)
//      ★ 길 위 칸 선포는 고름을 들고 간다(판정 51 — 봇은 기본 "비켜 가게" · shop 의 B 만 "그대로 둠")
//   ⓓ 날마다 — 무리마다 서 있는 조각 · 표시 · 부숨 · 사유지 길이 지나는 칸 · 봇 벌점(접속 안 함 = 쌓인 몫) · 고립 귀환(`tradeLog.abandoned`) · 다시 구해 이음 · 인구
//   ⓔ 먼저 잡은 사유지 처지 — 봇 손짓마다 앞뒤로 모든 사유지의 "길이 지나는 칸"을 견준다: 손짓의 급 이하인 남의 사유지가 바뀌면 어김(0 이어야)
//   ⓕ 틱 CPU — 존 게임 틱(setInterval 33ms 몸통)마다 process.cpuUsage 차(가상 시계 판에서도 흐른다) · 판정 CPU(`t1440Stat().cpu`)
'use strict';
const path = require('path'), fs = require('fs'), Module = require('module');
if (!process.env.T1440_BOT_OUT || !/server[\\/]zone\.js$/.test(process.argv[1] || '')) return;
require('./lib-port').noCentral();
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const ZF = path.join(ROOT, 'server', 'zone.js'), VF = path.join(ROOT, 'server', 'villages.js');
const DAY = process.env.T1440_BOT_DAY ? +process.env.T1440_BOT_DAY : null, OUT = process.env.T1440_BOT_OUT, SZ = 32;
const KINDS = String(process.env.T1440_BOT_KINDS || 'wingsU,wingsP,thick,house,vilpush,neck,grad,door,shop').split(',').filter(Boolean);
const rec = { day: DAY, kinds: KINDS, knobs: { ROAD: process.env.T1440_ROAD_RULE || '', NO_BUILD: process.env.T1423_NO_BUILD || '' }, groups: {}, days: [], viol: [], acts: 0, tick: null, end: null, err: null };
const save = () => { try { fs.writeFileSync(OUT, JSON.stringify(rec)); } catch (e) {} };
const cpuMs = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
//   ⓕ 틱 CPU — 33ms 몸통 하나만 감싼다
const TK = []; let tkN = 0;
{ const _si = global.setInterval; global.setInterval = function (fn, ms, ...rest) {
  if (typeof fn === 'function' && ms > 30 && ms < 40 && String(fn).length > 20000) {
    const f0 = fn; fn = function () { const c0 = cpuMs(); try { return f0.apply(this, arguments); } finally { const d = cpuMs() - c0; tkN++; if (TK.length < 400000) TK.push(d); else TK[tkN % 400000] = d; } };
  }
  return _si.call(this, fn, ms, ...rest);
}; try { require('timers').setInterval = global.setInterval; } catch (e) {} }
const _p = Module._extensions['.js'];
Module._extensions['.js'] = function (m, filename) {
  if (filename === VF) {
    const _c = m._compile;
    m._compile = function (src, fn) { if (src.indexOf('__t1440bv') < 0) src += '\n;module.exports.__t1440bv = function () { return state; };\n'; return _c.call(this, src, fn); };
  }
  const r = _p(m, filename);
  if (filename === VF) {
    const g = m.exports.onGameTick; let lastDay = -1;
    m.exports.onGameTick = function () {
      const out = g.apply(this, arguments);
      try { const st = m.exports.__t1440bv(), d = (st.world && st.world.day) | 0; if (d !== lastDay) { lastDay = d; day(st, m.exports, d); } }
      catch (e) { rec.err = String(e && e.stack).slice(0, 800); save(); }
      return out;
    };
  }
  return r;
};
let H = null;
const Hz = () => H || (H = require.cache[ZF] && require.cache[ZF].exports && require.cache[ZF].exports.__testBind ? require.cache[ZF].exports.__testBind() : null);
const K = (x, y) => x + ',' + y;
const q = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(3); };
const plen = (p) => { let L = 0; for (let i = 1; i < (p || []).length; i++) L += Math.hypot(p[i].x - p[i - 1].x, p[i].y - p[i - 1].y); return L; };
//   ── 교역로 칸(지나는 쌍 · 방향) ──
function routeCells(st, cellsOf) {
  const C = new Map();
  for (const [key, pts] of (st.routeCache || new Map())) {
    if (!pts || pts.length < 2) continue; const seen = new Set();
    for (let k = 1; k < pts.length; k++) cellsOf(pts[k - 1], pts[k], (x, y) => { const z = K(x, y); if (seen.has(z)) return false; seen.add(z); const o = C.get(z) || { x, y, n: 0, dx: pts[k].x - pts[k - 1].x, dy: pts[k].y - pts[k - 1].y, keys: new Set() }; o.n++; o.keys.add(key); C.set(z, o); return false; });
  }
  return C;
}
function cross(H, o, cap) {
  const vert = Math.abs(o.dx) >= Math.abs(o.dy), px = vert ? 0 : 1, py = vert ? 1 : 0, cells = [[o.x, o.y]];
  const open = (x, y) => !H.isTerrainBlockedLocal(x * SZ + SZ / 2, y * SZ + SZ / 2) && !H.isBridgeTileLocal(x * SZ + SZ / 2, y * SZ + SZ / 2);
  if (!open(o.x, o.y)) return null;
  let a = false, b = false;
  for (let i = 1; i <= cap; i++) { const x = o.x + px * i, y = o.y + py * i; if (!open(x, y)) { a = true; break; } cells.push([x, y]); }
  for (let i = 1; i <= cap; i++) { const x = o.x - px * i, y = o.y - py * i; if (!open(x, y)) { b = true; break; } cells.unshift([x, y]); }
  return { cells, sealed: a && b, vert, at: [o.x, o.y] };
}
const wingOrder = (n, mid) => { const o = []; for (let r = 0; r <= n; r++) { if (mid + r < n) o.push(mid + r); if (r && mid - r >= 0) o.push(mid - r); } return o; };
function pick(st, H, SV) {
  const V = SV.__t1440, RC = routeCells(st, V.cells), out = {}, used = [], far = (x, y, R) => used.every(([ux, uy]) => Math.max(Math.abs(ux - x), Math.abs(uy - y)) > R);
  const vils = st.villages || [], nearVil = (x, y, R) => vils.some((v) => Math.max(Math.abs(v.ccx - x), Math.abs(v.ccy - y)) <= R);
  const heads = new Set(); { const L = SV.t1406BridgeCells ? SV.t1406BridgeCells() : []; for (let i = 0; i + 1 < L.length; i += 2) heads.add(K(L[i], L[i + 1])); }
  const nearBridge = (o) => { for (let dy = -6; dy <= 6; dy++) for (let dx = -6; dx <= 6; dx++) if (heads.has(K(o.x + dx, o.y + dy)) || H.isBridgeTileLocal((o.x + dx) * SZ + 16, (o.y + dy) * SZ + 16)) return true; return false; };
  const cand = [...RC.values()].sort((a, b) => b.n - a.n || a.x - b.x || a.y - b.y);
  const vilOf = (x, y) => (SV.villageOfCell ? SV.villageOfCell(x, y) : null);
  //   좁은 목(폭 3 ~ 12 · 양쪽 막힘 · 길 ≥ 1 · 마을 · 다리에서 40칸 밖 · 마을 땅 밖 · 서로 40칸 밖)
  const necks = [];
  for (const o of cand) {
    if (o.n < 2 || nearVil(o.x, o.y, 40)) continue;
    const c = cross(H, o, 12); if (!c || !c.sealed || c.cells.length < 3 || c.cells.length > 12) continue;
    if (nearBridge(o) || c.cells.some(([x, y]) => vilOf(x, y))) continue;
    necks.push(Object.assign(c, { n: o.n }));
    if (necks.length >= 400) break;
  }
  rec.pickT = { necks: necks.length };
  necks.sort((a, b) => b.n - a.n || a.cells.length - b.cells.length);
  const takeNeck = () => { for (const c of necks) if (far(c.at[0], c.at[1], 40)) { used.push(c.at); return c; } return null; };
  for (const k of ['wingsP', 'neck', 'wingsU', 'thick', 'door', 'houseN']) if (KINDS.includes(k === 'houseN' ? 'house' : k)) { const c = takeNeck(); if (c) out[k] = { cells: c.cells, at: c.at, routes: c.n, vert: c.vert }; }
  //   들 — 둘레 12칸이 다 열린 길 칸(마을 30칸 밖)
  const openBox = (x, y, R) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (H.isTerrainBlockedLocal((x + dx) * SZ + 16, (y + dy) * SZ + 16) || H.isBridgeTileLocal((x + dx) * SZ + 16, (y + dy) * SZ + 16) || vilOf(x + dx, y + dy)) return false; return true; };
  for (const k of ['grad', 'houseF']) if (KINDS.includes(k === 'houseF' ? 'house' : k)) { const o = cand.find((r) => r.n >= 1 && far(r.x, r.y, 40) && !nearVil(r.x, r.y, 30) && openBox(r.x, r.y, 12)); if (o) { out[k] = { cells: [[o.x, o.y]], at: [o.x, o.y], routes: o.n, vert: Math.abs(o.dx) >= Math.abs(o.dy), keys: [...o.keys] }; used.push([o.x, o.y]); } }
  //   마을 땅 위 목 — 목 줄(양쪽 막힘 · 폭 ≤ 12)에 마을 땅 칸(그 길 칸 포함)과 마을 땅 밖 칸이 섞였다
  if (KINDS.includes('vilpush')) {
    for (const o of cand) {
      if (!vilOf(o.x, o.y) || !far(o.x, o.y, 40)) continue;
      const c = cross(H, o, 12); if (!c || !c.sealed || c.cells.length < 3 || nearBridge(o)) continue;
      const outs = c.cells.filter(([x, y]) => !vilOf(x, y)); if (!outs.length) continue;
      out.vilpush = { cells: c.cells, at: c.at, routes: o.n, vert: c.vert, vil: vilOf(o.x, o.y).name }; used.push(c.at); break;
    }
  }
  //   shop · shopK — 남의 가게 앞(판정 51): 둘레 6칸이 열린 길 칸(마을 20칸 밖 · 앞 무리 자리 40칸 밖) · 앞 무리 자리를 지나는 쌍과 겹치지 않는 쌍만(앞 무리 손짓이 그 길을 먼저 옮기지 않게)
  if (KINDS.includes('shop')) {
    const uk = new Set(); for (const g of Object.values(out)) for (const [x, y] of g.cells || []) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = RC.get(K(x + dx, y + dy)); if (o) for (const k of o.keys) uk.add(k); }
    for (const k of ['shop', 'shopK']) { const o = cand.find((r) => far(r.x, r.y, 40) && !nearVil(r.x, r.y, 20) && openBox(r.x, r.y, 6) && [...r.keys].every((q) => !uk.has(q))); if (o) { out[k] = { cells: [[o.x, o.y]], at: [o.x, o.y], routes: o.n, vert: Math.abs(o.dx) >= Math.abs(o.dy), keys: [...o.keys] }; used.push([o.x, o.y]); for (const q of o.keys) uk.add(q); } }
  }
  return { out, RC };
}
//   ── 봇 손짓(제품 문 그대로 · 묻는 판정이면 다짐 · 확인 중이면 그 자리에서 끝까지) ──
const BOTS = new Map();
function botOf(id) { let P = BOTS.get(id); if (!P) { P = { playerId: id, pid: null, name: '봇' + id.slice(-3), inventory: { wood: 9999, stone: 9999, plank: 999, fiber: 999, item_fence: 999, item_wall: 999, item_door: 999 }, ws: null, x: 0, y: 0, floor: 0, vp: 0, toolItems: [] }; BOTS.set(id, P); } return P; }
let botN = 0;
const newBot = (tag) => botOf('p_t1440' + tag + (botN++));
function passSnap(H) { const m = new Map(); for (const [id, c] of H.claims) m.set(id, { pass: !!c.t1440pass, owner: c.ownerPid, lvl: H._t1440VilLand(Math.floor(c.x / SZ), Math.floor(c.y / SZ)) ? 3 : 2 }); return m; }
function act(H, P, piece, cls, fn, road) {
  const Z = H._t1440Zs, z0 = { prot: Z.prot, free: Z.free, yield: Z.yield, confirm: Z.confirm, ask: Z.ask, road: Z.roadNote, close: Z.close, pend: Z.pend, keep: Z.road ? Z.road.keep : 0 };
  const S0 = passSnap(H), sig = piece ? H._t1440Sig(piece) : null, c0 = cpuMs();
  rec.curAct = { by: P.playerId, cls, piece: piece ? [piece.cells.slice(0, 2), piece.edges.slice(0, 2)] : null }; if (process.env.T1440_BOT_TRACE) save();
  let ok = false, pend = 0;
  for (let tries = 0; tries < 4 && !ok; tries++) {
    if (sig) { P._t1440Ok = sig; P._t1440Road = (road || 'avoid') + ':' + sig; }   // 늘 다짐(묻는 판정이면 같은 조각 서명으로 다시) · 길 위 칸 고름(판정 51 — 기본 비켜 가게)
    try { ok = !!fn(); } catch (e) { ok = false; rec.actErr = String(e && e.stack).slice(0, 400); }
    if (ok) break;
    const qi = H._t1440Q ? H._t1440Q.findIndex((x) => x.player === P) : -1;
    if (qi >= 0) { const qq = H._t1440Q.splice(qi, 1)[0]; pend++; H.SimVillages.t1440Step(qq.job, 0); continue; }
    if (Z.ask === z0.ask) break;   // 묻지도 줄 서지도 않았다 = 거절(문 밖 까닭)
  }
  P._t1440Ok = null; P._t1440Road = null; rec.acts++; rec.lastAct = { by: P.playerId, cpu: +(cpuMs() - c0).toFixed(1), tries: pend }; if (rec.acts % 10 === 0 || cpuMs() - c0 > 5000) save();
  //   먼저 잡은 사유지 처지 — 손짓의 급(cls) 이하인 남의 사유지가 길이 지나는 칸으로 바뀌었으면 어김
  const S1 = passSnap(H);
  for (const [id, b] of S1) { const a = S0.get(id); if (!a || a.pass || !b.pass || b.owner === P.playerId) continue; const e = { id, lvl: b.lvl, by: P.playerId, cls }; if (b.lvl >= cls) rec.viol.push(e); else (rec.passed = rec.passed || []).push(e); }
  const v = (Z.road && Z.road.keep > z0.keep) ? 'keep' : Z.yield > z0.yield ? 'yield' : (Z.prot > z0.prot ? 'protected' : (Z.free > z0.free ? 'free' : (Z.close > z0.close ? 'close' : (Z.roadNote > z0.road ? 'road' : null))));
  return { ok, v, pend, asked: Z.ask - z0.ask, cpu: +(cpuMs() - c0).toFixed(1) };
}
function claim1(H, P, cx, cy, road) {
  P.x = cx * SZ + SZ / 2; P.y = cy * SZ + SZ / 2; P._t1440Msg = { type: 'claim', kind: 'temporary' };
  const lvl = H._t1440VilLand(cx, cy) ? 3 : 2, piece = H.RoadRule ? H.RoadRule.pieceCell(cx, cy) : null;
  const find = () => { for (const c of H.claims.values()) if (c.ownerPid === P.playerId && Math.floor(c.x / SZ) === cx && Math.floor(c.y / SZ) === cy) return c; return null; };
  const r = act(H, P, piece, lvl, () => { H.tryClaim(P, 'temporary'); return !!find(); }, road);
  const c = find();
  const job = piece && H._t1440Jc ? H._t1440Jc.get(H._t1440Sig(piece) + '#' + lvl + ':' + lvl + ':1') : null;   // 그 판정(쌍 수 · 갈래마다 일 수 · CPU)
  if (job && job.n) r.j = { pairs: job.touch ? job.touch.length : 0, n: job.n, tm: job.tm ? Object.fromEntries(Object.entries(job.tm).map(([k, v]) => [k, Math.round(v)])) : null, cpu: Math.round(job.cpu || 0), step: [...(job.stepOf || new Map()).values()].reduce((m, s) => { m[s] = (m[s] || 0) + 1; return m; }, {}) };
  return Object.assign(r, { x: cx, y: cy, lvl, id: c ? c.id : null, pass: c ? !!c.t1440pass : null, by: P.playerId });
}
function place1(H, P, type, cx, cy, side) {
  const RR = H.RoadRule, piece = !RR ? null : (type === 'fence' ? RR.pieceCell(cx, cy) : RR.pieceEdge(cx, cy, side));
  P.x = cx * SZ + SZ / 2; P.y = cy * SZ + SZ / 2; P._t1440Msg = { type: 'place_building' };
  const find = () => { for (const b of H.buildings.values()) if (b.ownerId === P.playerId && b.type === type && Math.floor(b.x / SZ) === cx && Math.floor(b.y / SZ) === cy && (type === 'fence' || (b.data && b.data.side) === side)) return b; return null; };
  const r = act(H, P, piece, 0, () => { H._tryBuildAt(P, type, 0, type === 'fence' ? null : side, null, { skipCost: true }); return !!find(); });
  const b = find();
  return Object.assign(r, { x: cx, y: cy, type, side: side || null, id: b ? b.id : null, mark: !!(b && b.data && b.data.t1440c), by: P.playerId });
}
const claimsBy = (H, list) => { const out = []; let P = null, n = 0; for (const [x, y] of list) { if (!P || n >= 4) { P = newBot('c'); n = 0; } out.push(claim1(H, P, x, y)); n++; } return out; };
//   그 자리를 지나는 쌍들의 지금 길 / 처음 길(가장 큰 비)
function ratioOf(st, RR, keys) { if (!RR || !RR.firstGet) return null; let mx = 0; for (const k of keys || []) { const p = st.routeCache.get(k), f = RR.firstGet(k); if (p && f && f.len > 0) mx = Math.max(mx, plen(p) / f.len); } return +mx.toFixed(3); }
function place(st, H, SV, d) {
  const t0 = cpuMs(); rec.stage = 'pick'; save();
  const { out, RC } = pick(st, H, SV), RR = H.RoadRule;
  rec.pickCpu = +(cpuMs() - t0).toFixed(0); rec.picked = Object.keys(out); rec.stage = 'act'; save();
  const pairsThrough = (cells) => { const s = new Set(); for (const [x, y] of cells) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const o = RC.get(K(x + dx, y + dy)); if (o) for (const k of o.keys) s.add(k); } return [...s]; };
  let tg = cpuMs();
  const G0 = (kind, G, extra) => { const t = cpuMs(); if (rec.lastG && rec.groups[rec.lastG]) rec.groups[rec.lastG].cpuMs = +(t - tg).toFixed(0); tg = t; rec.lastG = kind; save(); rec.groups[kind] = Object.assign({ kind, at: G.at, want: (G.cells || []).length, routes: G.routes, pairs: pairsThrough(G.cells || []).length, day: d, pieces: [], claims: [] }, extra || {}); return rec.groups[kind]; };
  //   wingsU — 주인 없는 땅 날개: 목 칸을 가운데부터 울타리로(다 U — 저장된 길은 안 비킨다 · 길 위 것은 캐러밴이 친다)
  if (out.wingsU) { const G = out.wingsU, g = G0('wingsU', G), A = newBot('a'), mid = G.cells.findIndex(([x, y]) => x === G.at[0] && y === G.at[1]); for (const i of wingOrder(G.cells.length, Math.max(0, mid))) g.pieces.push(place1(H, A, 'fence', ...G.cells[i])); }
  //   wingsP — 사유지 날개: 목 칸을 가운데부터 한 칸씩 선포(판정마다) — 목을 닫는 나중 칸이 내준다(길이 지나는 칸)
  if (out.wingsP) { const G = out.wingsP, g = G0('wingsP', G), mid = G.cells.findIndex(([x, y]) => x === G.at[0] && y === G.at[1]); g.claims = claimsBy(H, wingOrder(G.cells.length, Math.max(0, mid)).map((i) => G.cells[i])); }
  //   thick — 열 겹(주인 없는 땅): 목 줄을 길 방향으로 한 칸씩 밀어 열 번
  if (out.thick) {
    const G = out.thick, g = G0('thick', G), A = newBot('a'), sx = G.vert ? 1 : 0, sy = G.vert ? 0 : 1;
    for (let L = 0; L < 10; L++) for (const [x, y] of G.cells) { const cx = x + sx * L, cy = y + sy * L; if (H.isTerrainBlockedLocal(cx * SZ + 16, cy * SZ + 16)) continue; const r = place1(H, A, 'fence', cx, cy); r.layer = L; g.pieces.push(r); }
  }
  //   house — 사유지를 잡아 남(B)의 사유지 아닌 집 위로 길 몰기: 들(길 옆 3×3 집 · 길 칸 선포 — 걸음 1 이 둘 다 비킨다) · 목(B 가 목 절반에 집 · A 가 나머지 선포 — 걸음 2 만 남으면 그 집 위로)
  if (out.houseF) {
    const G = out.houseF, g = G0('houseF', G), B = newBot('b'), A = newBot('a'), [x0, y0] = G.at, ox = G.vert ? 0 : 3, oy = G.vert ? 3 : 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g.pieces.push(place1(H, B, 'fence', x0 + ox + dx, y0 + oy + dy));
    g.claims = [claim1(H, A, x0, y0)]; g.keys = G.keys; g.ratio = ratioOf(st, RR, G.keys);
  }
  if (out.houseN) {
    const G = out.houseN, g = G0('houseN', G), B = newBot('b'), mid = G.cells.findIndex(([x, y]) => x === G.at[0] && y === G.at[1]);
    const half = G.cells.filter((c, i) => i !== mid && (i < mid ? i % 2 === 0 : i % 2 === 1)), rest = G.cells.filter((c) => !half.includes(c));
    for (const [x, y] of half) g.pieces.push(place1(H, B, 'fence', x, y));
    g.claims = claimsBy(H, rest);
  }
  //   vilpush — 마을 땅 위 사유지(급 3)로 마을 밖 남(B)의 사유지(급 2)에 길 내기: B 가 목의 마을 땅 밖 칸을 · C 가 길 칸 빼고 마을 땅 칸을 먼저 잡고 · A 가 길 칸(마을 땅)을 잡는다
  if (out.vilpush) {
    const G = out.vilpush, g = G0('vilpush', G, { vil: G.vil }), vilOf = (x, y) => (SV.villageOfCell ? SV.villageOfCell(x, y) : null);
    const outs = G.cells.filter(([x, y]) => !vilOf(x, y)), ins = G.cells.filter(([x, y]) => vilOf(x, y) && !(x === G.at[0] && y === G.at[1]));
    g.claimsB = claimsBy(H, outs); g.claimsC = claimsBy(H, ins);
    g.claims = [claim1(H, newBot('a'), ...G.at)];
  }
  //   neck — 좁은 목 사유지 + 울타리: 목 칸을 다 선포(나중 칸이 내준다) → 길이 지나는 칸에 울타리(닫는 조각 — 묻는다 · 다짐) → 캐러밴이 친다 · again(부서질 때마다 다시)
  if (out.neck) {
    const G = out.neck, g = G0('neck', G), mid = G.cells.findIndex(([x, y]) => x === G.at[0] && y === G.at[1]);
    g.claims = claimsBy(H, wingOrder(G.cells.length, Math.max(0, mid)).map((i) => G.cells[i]));
    const pc = g.claims.filter((c) => c.pass);
    for (const c of pc) { const P = botOf(c.by); g.pieces.push(place1(H, P, 'fence', c.x, c.y)); }
    g.closer = pc.map((c) => c.by);
  }
  //   grad — 조금씩 돌려 3배: 들의 길 칸을 가로지르는 사유지 줄을 한 칸씩(가운데 · 양옆 번갈아) 선포 — 3배를 넘는 첫 선포가 내준다
  if (out.grad) {
    const G = out.grad, g = G0('grad', G, { keys: G.keys }), [x0, y0] = G.at, px = G.vert ? 0 : 1, py = G.vert ? 1 : 0;
    g.steps = []; let P = null, n = 0;
    for (let i = 0; i < 160; i++) {
      const k = i === 0 ? 0 : (i % 2 ? (i + 1) / 2 : -i / 2), x = x0 + px * k, y = y0 + py * k;
      if (H.isTerrainBlockedLocal(x * SZ + 16, y * SZ + 16)) { g.stop = 'terrain'; break; }
      if (!P || n >= 4) { P = newBot('g'); n = 0; }
      const r = claim1(H, P, x, y); n++;
      g.steps.push([k, r.ok ? r.v : 'refused', ratioOf(st, RR, G.keys), r.pass ? 1 : 0]);
      if (r.ok && r.v === 'yield') { g.yieldAt = k; break; }
      if (!r.ok) { g.stop = 'refused'; break; }
    }
    g.maxProt = Math.max(0, ...g.steps.filter((s) => s[1] === 'protected').map((s) => s[2]));
  }
  //   door — 문 달고 통행세: 목을 벽 줄로 막고 길 칸에 문(주인 없는 땅 — 남의 문 = 벽 · 캐러밴이 친다)
  if (out.door) {
    const G = out.door, g = G0('door', G), A = newBot('a'), side = G.vert ? 'E' : 'N';
    for (const [x, y] of G.cells) { const last = x === G.at[0] && y === G.at[1]; g.pieces.push(place1(H, A, last ? 'door' : 'wall', x, y, side)); }
  }
  //   shop — 남의 가게 앞 길 돌리기(판정 51): 그 자리를 지나던 쌍들의 지금 길 칸 · 한 칸과의 체비셰프 거리
  const curCells = (keys) => { const S = new Map(); const cellsOf = H.SimVillages.__t1440 && H.SimVillages.__t1440.cells; for (const k of keys || []) { const p = st.routeCache.get(k); if (!p || !cellsOf) continue; for (let i = 1; i < p.length; i++) cellsOf(p[i - 1], p[i], (x, y) => { const c = K(x, y); if (!S.has(c)) S.set(c, new Set()); S.get(c).add(k); return false; }); } return S; };
  const near = (keys, c, R) => { const S = curCells(keys); let dmin = Infinity; const adj = new Set(); for (const [cc, ks] of S) { const [x, y] = cc.split(',').map(Number), d = Math.max(Math.abs(x - c[0]), Math.abs(y - c[1])); if (d < dmin) dmin = d; if (d <= R) for (const k of ks) adj.add(k); } return { S, dmin: dmin === Infinity ? null : dmin, n: adj.size }; };
  const claimedAt = (x, y) => (RR ? !!RR.claimAt(x, y) : [...H.claims.values()].some((c) => Math.floor(c.x / SZ) === x && Math.floor(c.y / SZ) === y));
  const pushOn = (g, G, target, R, stopN) => {   // A 가 target 에 가장 가까운 길 칸(사유지 · 지형 아닌)을 "비켜 가게"로 한 칸씩 — 그 쌍들이 target 둘레 R 안을 안 지날 때까지(24칸 상한)
    let P = null, n = 0; g.steps = [];
    for (let i = 0; i < 24; i++) {
      const nr = near(G.keys, target, R); if (nr.n <= stopN) { g.offAt = i; break; }
      let best = null, bd = Infinity;
      for (const cc of nr.S.keys()) { const [x, y] = cc.split(',').map(Number); if (x === target[0] && y === target[1]) continue; if (claimedAt(x, y) || H.isTerrainBlockedLocal(x * SZ + 16, y * SZ + 16) || H.isBridgeTileLocal(x * SZ + 16, y * SZ + 16)) continue; const d = Math.max(Math.abs(x - target[0]), Math.abs(y - target[1])); if (d < bd) { bd = d; best = [x, y]; } }
      if (!best || bd > 12) { g.stop = 'far'; break; }
      if (!P || n >= 4) { P = newBot('s'); n = 0; }
      const r = claim1(H, P, best[0], best[1]); n++; g.claims.push(r);
      const after = near(G.keys, target, R);
      g.steps.push([i + 1, best, r.ok ? r.v : 'refused', after.n, after.dmin, ratioOf(st, RR, G.keys)]);
      if (!r.ok) { g.stop = 'refused'; break; }
    }
    if (g.offAt == null && !g.stop) { const nr = near(G.keys, target, R); if (nr.n <= stopN) g.offAt = g.steps.length; }
  };
  if (out.shop) {   // B 의 길가 칸(길 칸 옆 한 칸 · 길 밖 — 가게 자리) · 쌍들이 B 칸 둘레 1 칸(옆 칸)을 안 지나면 "떨어졌다"
    const G = out.shop, g = G0('shop', G, { keys: G.keys }), [x0, y0] = G.at, px = G.vert ? 0 : 1, py = G.vert ? 1 : 0, B = newBot('b');
    let S0 = null; for (const sgn of [1, -1]) for (let k = 1; k <= 3 && !S0; k++) { const c = [x0 + px * k * sgn, y0 + py * k * sgn]; const nr = near(G.keys, c, 0); if (nr.n === 0 && !H.isTerrainBlockedLocal(c[0] * SZ + 16, c[1] * SZ + 16)) S0 = c; }
    if (S0) {
      g.shopAt = S0; g.claimsB = [claim1(H, B, S0[0], S0[1])];
      const n0 = near(G.keys, S0, 1); g.adj0 = n0.n; g.d0 = n0.dmin;
      pushOn(g, G, S0, 1, 0);
      const n1 = near(G.keys, S0, 1); g.adj1 = n1.n; g.d1 = n1.dmin;
    } else g.stop = 'noSide';
  }
  if (out.shopK) {   // B 가 길 칸을 "그대로 둠"으로(길이 B 땅을 지난다 — 가게 자리) · 쌍들이 그 칸을 안 지나면 "떨어졌다"
    const G = out.shopK, g = G0('shopK', G, { keys: G.keys }), B = newBot('b');
    g.shopAt = G.at; g.claimsB = [claim1(H, B, G.at[0], G.at[1], 'keep')];
    const n0 = near(G.keys, G.at, 0); g.thru0 = n0.n;
    pushOn(g, G, G.at, 0, 0);
    const n1 = near(G.keys, G.at, 0); g.thru1 = n1.n; g.d1 = n1.dmin;
  }
  if (rec.lastG && rec.groups[rec.lastG]) rec.groups[rec.lastG].cpuMs = +(cpuMs() - tg).toFixed(0);
  for (const g of Object.values(rec.groups)) g.verdicts = g.claims.concat(g.pieces).reduce((m, p) => { const k = p.ok ? (p.v || '?') : 'refused'; m[k] = (m[k] || 0) + 1; return m; }, {});
}
function vpOf(H, id) { const o = H._t1423Owe && H._t1423Owe.get(id); return o ? o.vp : 0; }
function day(st, V, d) {
  const H = Hz(); if (!H) return;
  if (DAY != null && d >= DAY && !rec.placed) {   // 끈 판도 같은 자리에 같은 손짓(견줌 — 규칙 없이 무엇이 막히나)
    rec.tickPre = tickStat(); rec.placed = d; const c0 = cpuMs();
    try { place(st, H, H.SimVillages, d); } catch (e) { rec.err = 'place ' + String(e && e.stack).slice(0, 800); }
    rec.placeCpu = +(cpuMs() - c0).toFixed(1); TK.length = 0; tkN = 0; save();   // 놓는 틱(봇이 판정을 그 자리에서 끝까지 민 틱)은 틱 표에서 뺀다 — 아래 틱 표 = 놓은 뒤
  }
  //   again — 닫는 조각이 부서졌으면 다음 날 다시(벌점이 쌓이는가 → 판정 46 추방은 T1441)
  if (rec.placed && rec.groups.neck) {
    const g = rec.groups.neck; g.again = g.again || [];
    for (const p of g.pieces) if (p.ok && p.id && !H.buildings.has(p.id) && g.again.length < 60) {
      const P = botOf(p.by), r = place1(H, P, 'fence', p.x, p.y);
      g.again.push({ d, ok: r.ok, v: r.v, mark: r.mark, vp: vpOf(H, p.by) }); if (r.ok) { p.id = r.id; p.mark = r.mark; }
    }
  }
  let iso = 0; for (const t of ((st.world && st.world.tradeLog) || [])) if (t && t.abandoned && /고립/.test(t.note || '') && (!rec.placed || t.day >= rec.placed)) iso++;   // 이동 차단 고립 귀환만(빈손 귀환 — 장이 안 산 것 — 은 길과 무관)
  const row = { d, iso, g: {} };
  for (const [kind, G] of Object.entries(rec.groups)) {
    let standing = 0, marked = 0; for (const p of G.pieces) if (p.id && H.buildings.has(p.id)) { standing++; const b = H.buildings.get(p.id); if (b.data && b.data.t1440c) marked++; }
    let pass = 0; for (const c of (G.claims || []).concat(G.claimsB || [], G.claimsC || [])) { const cl = c.id && H.claims.get(c.id); if (cl && cl.t1440pass) pass++; }
    row.g[kind] = [standing, marked, pass, G.keys ? ratioOf(st, H.RoadRule, G.keys) : null];
  }
  let pop = 0, dead = 0; for (const v of st.villages || []) { const e = v.econ; if (!e) continue; pop += (e.npcs || []).length; dead += e._deadTot || 0; }
  row.pop = pop; row.dead = dead;
  //   ⓓ 캐러밴 몸 · 호위 대열 폭 — 날 경계마다 상인 몸 · 호위 몸이 그 캐러밴 길(꺾은 줄)에서 떨어진 거리(px) · 그 칸이 길 칸인가
  try {
    const W = rec.width || (rec.width = { bodies: 0, esc: 0, d: [], offCell: 0, cells: 0, merchant: [] });
    const players = st.deps && st.deps.players, cellsOf = V.__t1440 ? V.__t1440.cells : null;
    for (const body of (st.caravanBodies || new Map()).values()) {
      if (!body || !body.pts || body.pts.length < 2 || W.bodies > 4000) continue;
      W.bodies++;
      const RCs = new Set(); if (cellsOf) for (let i = 1; i < body.pts.length; i++) cellsOf(body.pts[i - 1], body.pts[i], (x, y) => { RCs.add(K(x, y)); return false; });
      const dist = (p) => { let m = Infinity; for (let i = 1; i < body.pts.length; i++) { const a = body.pts[i - 1], b = body.pts[i], dx = b.x - a.x, dy = b.y - a.y, n = dx * dx + dy * dy, f = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0; m = Math.min(m, Math.hypot(a.x + f * dx - p.x, a.y + f * dy - p.y)); } return m; };
      const mp = players && players.get(body.pid); if (mp && W.merchant.length < 20000) W.merchant.push(+dist(mp).toFixed(1));
      for (const e of body.escorts || []) { const ep = players && players.get(e.pid); if (!ep || !(ep.hp > 0)) continue; W.esc++; if (W.d.length < 20000) W.d.push(+dist(ep).toFixed(1)); W.cells++; if (RCs.size && !RCs.has(K(Math.floor(ep.x / SZ), Math.floor(ep.y / SZ)))) W.offCell++; }
    }
  } catch (e) { rec.widthErr = String(e && e.message); }
  //   저장된 길 가운데 그 길 줄이 구조물 표에 막힌 쌍(걸음 2 막힘 — 몸이 늘 서는 쌍 · 5날마다)
  if (H.RoadRule && d % 5 === 0 && st.routeCache) { try { let u = 0, n = 0; const ex = []; for (const [k, p] of st.routeCache) { if (!p) continue; n++; if (!H.RoadRule.clearRoute(p)) { u++; if (ex.length < 6) ex.push(k); } } (rec.unclear = rec.unclear || []).push([d, u, n, ex]); } catch (e) { rec.unclearErr = String(e && e.message); } }
  const T = V.t1440Stat ? V.t1440Stat() : null;
  if (T && T.on) row.t = [T.flush, T.drop, T.keep, T.reopen, T.reroute, T.rerouteFail, T.iso | 0, T.markHit, T.stepHit, T.siteClose, T.siteProt, T.claimStop | 0, Math.round(T.judgeCpu), T.noRoute | 0, T.vilJob | 0];
  if (H._t1440Zs) { const z = H._t1440Zs; row.z = [z.breaks, z.breakU, z.breakMark, z.breakPass, z.vilBreak, z.vpOn, z.vpOff, z.pend, z.passOther, z.passOwn]; }
  row.vp = [...BOTS.keys()].reduce((s, id) => s + vpOf(H, id), 0);
  rec.days.push(row);
  if (d % 10 === 0) { snap(V, H); save(); }
}
function tickStat() { let mx = 0, sum = 0; for (const x of TK) { if (x > mx) mx = x; sum += x; } return { n: tkN, kept: TK.length, p50: q(TK, 0.5), p90: q(TK, 0.9), p99: q(TK, 0.99), p999: q(TK, 0.999), max: TK.length ? +mx.toFixed(2) : null, mean: TK.length ? +(sum / TK.length).toFixed(3) : null }; }
function snap(V, H) {
  try {
    const T = V.t1440Stat ? V.t1440Stat() : null;
    if (T) { const c = (T.cpu && T.cpu.cpu) || [], pr = (T.cpu && T.cpu.pairs) || []; rec.stepAt = T.stepAt || null; rec.t1440 = Object.assign({}, T, { stepAt: undefined, cpu: { n: c.length, p50: q(c, 0.5), p90: q(c, 0.9), p99: q(c, 0.99), max: c.length ? Math.max(...c) : null }, pairs: { n: pr.length, p50: q(pr, 0.5), p99: q(pr, 0.99), max: pr.length ? Math.max(...pr) : null } }); }
    if (H && H._t1440Zs) { const pt = H._t1440Zs.pendTicks || []; rec.zone = Object.assign({}, H._t1440Zs, { pendTicks: { n: pt.length, ticksMax: pt.length ? Math.max(...pt.map((x) => x[0])) : null, cpuMax: pt.length ? Math.max(...pt.map((x) => x[1])) : null } }); }
    if (H && H._t1423Z) rec.t1423 = Object.assign({}, H._t1423Z);
    rec.vpBots = [...BOTS.keys()].map((id) => [id, vpOf(H, id)]).filter((x) => x[1] > 0);
    if (rec.width) { const W = rec.width; rec.widthStat = { bodies: W.bodies, esc: W.esc, offCell: W.offCell, cells: W.cells, d: { n: W.d.length, p50: q(W.d, 0.5), p90: q(W.d, 0.9), p99: q(W.d, 0.99), max: W.d.length ? Math.max(...W.d) : null }, m: { n: W.merchant.length, p50: q(W.merchant, 0.5), p99: q(W.merchant, 0.99), max: W.merchant.length ? Math.max(...W.merchant) : null } }; }
    rec.tick = tickStat();
  } catch (e) { rec.snapErr = String(e && e.message); }
}
process.on('exit', () => { try { const m = require.cache[VF]; snap(m && m.exports, Hz()); rec.end = Date.now(); if (rec.width) { rec.width.d = undefined; rec.width.merchant = undefined; } save(); } catch (e) {} });
