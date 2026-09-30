'use strict';
// =============================================================================
// server/xzone-geo.js — 두 존을 합친 지형의 걸음 (T533 · 2026-09-30 · 세션3)
//
// ★무엇: 이웃한 두 존의 마을 쌍마다 ① **걸음 거리**(정본 교역 BFS — `computeAndInjectDistMatrix` 그대로)와
//   ② **경계 칸·두 구간 길**(정본 교역로 A\* — `computeRoutePts` 그대로)을 낸다. 두 존 사각을 합치고 칸마다
//   **그 칸의 주인 존** 어댑터에 묻는다(새 판정 0 · 다리 칸은 존 설정 `bridges`).
// ★누가: 존 서버의 경계 호스트(`server/xzone.js` — **워커 스레드**로 띄운다: 합친 BFS 가 12~76 초라 틱을 막으면 안 된다)와
//   자(`scripts/t525-cross-zone.js` — 같은 프로세스). **한 벌**이다(T525 자에 있던 것을 여기로 옮겼다 · 사본 0).
// ★정적이다: 지형·다리는 기동 뒤 안 바뀐다(T333) — 마을 명부가 바뀔 때만 다시 잰다.
//   ⚠땅 원판은 제 존으로 자른 채 둔다(PM 결정 #456 — 이웃 지형 질의는 재민) — 여기는 **길**만 잰다.
//
// 단위: 칸(셀) = SZ px · econ 거리 = 칸 × 2.5(`ev.coord` 문법) · 명부 = [{ name, cx, cy }](제 존 로컬 칸 — 마을 중심).
// =============================================================================
const path = require('path');

let _M = null;
// 모듈은 **부를 때** 싣는다 — 존 서버 본 스레드는 이 파일을 싣지 않는다(워커만).
function _mods() {
  if (_M) return _M;
  const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {};
  try {
    const ZC = require('./zone-config');
    const T = require('./terrain'); if (T.setZonesMeta) T.setZonesMeta(ZC.ZONES);
    const P = require('./villages').__labProbe;
    const econ = require('../sim/economy-sim');
    _M = { ZONES: ZC.ZONES, findZoneAt: ZC.findZoneAt, T, P, econ, SZ: P.SZ, chunk: require('./chunk') };
  } finally { console.log = _l; console.warn = _w; }
  return _M;
}
const _quiet = (f) => { const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {}; try { return f(); } finally { console.log = _l; console.warn = _w; } };

// ── 존 하나의 정적 어댑터 — 존 서버의 통행 정본(`zone.js isTerrainBlockedLocal`)과 같은 뜻:
//   바위 · 물(손그림 강·호수 + 해안선 띠) · 존 밖 = 막힘 · 물 위 다리 칸 = 열림(`ZONE.bridges`).
//   ⚠해안선 띠 `coast`: 존 서버는 **늘** 본다(`WATER_TILES`) · t17 계보 자는 한반도 끔(`T17_COAST` 기본 — T407) ⇒ 부르는 쪽이 준다.
function zoneAdapter(Z, opts) {
  const { ZONES, findZoneAt, T, P, SZ, chunk } = _mods();
  const ZONE = ZONES[Z];
  if (!ZONE) throw new Error(`xzone-geo: 모르는 존 ${Z}`);
  P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const coast = (opts && opts.coast != null) ? !!opts.coast
    : (process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando'));
  const BAND = coast ? chunk.generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isW = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isR = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const BR = new Set(); { const bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
  const deps = { isTerrainBlockedLocal: (x, y) => !_in(x, y) || isR(x, y) || isW(x, y), isWaterTileLocal: isW };
  if (BR.size) deps.isBridgeLocal = (x, y) => BR.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));   // 존 서버 `isBridgeTileLocal` 과 같은 뜻
  return { ZONE, ta: P.makeTerrainAdapter(T, ZONE, deps) };
}
// 두 존을 합친 사각 — 칸마다 **그 칸의 주인 존** 어댑터에 묻는다(합친 지형 · 새 판정 0).
function unionAdapter(zs, opts) {
  const { SZ } = _mods();
  const Zs = zs.map((Z) => ({ Z, ...zoneAdapter(Z, opts) }));
  const x0 = Math.min(...Zs.map((o) => o.ZONE.worldOffsetX)), y0 = Math.min(...Zs.map((o) => o.ZONE.worldOffsetY));
  const x1 = Math.max(...Zs.map((o) => o.ZONE.worldOffsetX + o.ZONE.zoneWidth)), y1 = Math.max(...Zs.map((o) => o.ZONE.worldOffsetY + o.ZONE.zoneHeight));
  const cx0 = x0 / SZ, cy0 = y0 / SZ;
  const own = (cx, cy) => { const ax = (cx + cx0) * SZ + SZ / 2, ay = (cy + cy0) * SZ + SZ / 2;
    for (const o of Zs) if (ax >= o.ZONE.worldOffsetX && ay >= o.ZONE.worldOffsetY && ax < o.ZONE.worldOffsetX + o.ZONE.zoneWidth && ay < o.ZONE.worldOffsetY + o.ZONE.zoneHeight) return o;
    return null; };
  const loc = (o, cx, cy) => [cx + cx0 - o.ZONE.worldOffsetX / SZ, cy + cy0 - o.ZONE.worldOffsetY / SZ];
  const ta = {
    isBlocked: (cx, cy) => { const o = own(cx, cy); if (!o) return true; const [lx, ly] = loc(o, cx, cy); return o.ta.isBlocked(lx, ly); },
    isWater: (cx, cy) => { const o = own(cx, cy); if (!o) return false; const [lx, ly] = loc(o, cx, cy); return o.ta.isWater(lx, ly); },
    isBridgeCell: (cx, cy) => { const o = own(cx, cy); if (!o) return false; const [lx, ly] = loc(o, cx, cy); return o.ta.isBridgeCell(lx, ly); },
  };
  return { ta, ZONE: { zoneWidth: x1 - x0, zoneHeight: y1 - y0 }, x0, y0, cx0, cy0, Zs };
}
// 정본 교역 BFS(`computeAndInjectDistMatrix`)를 **그대로** 부른다 — 마을 좌표 = 셀 × 2.5(econ 단위).
function bfsMatrix(ta, ZONE, coords) {
  const { P, econ } = _mods();
  const world = { villages: coords.map((c, i) => ({ name: 'v' + i, coord: { x: c.x, y: c.y } })) };
  _quiet(() => { P._distProbe.setup(ta, ZONE, world, econ); P._distProbe.compute('xzone'); });
  return world._distMatrix;
}

// ── 경계 칸 — 합친 길(px · 합친 사각 원점)이 A 사각을 **마지막으로** 나가는 자리.
//   길이 경계를 여러 번 스치면(경계를 따라 걷는 길) 마지막 넘김을 쓰고, 두 구간의 점은 제 존 사각 안으로 붙인다
//   (몸은 제 존 밖에 설 수 없다 — 한 칸 안쪽 · 경계 칸 = 존 사각 그대로 · 새 수 0).
function _splitRoute(pts, rA, rB) {
  const inR = (p, r) => p.x >= r.x0 && p.y >= r.y0 && p.x < r.x1 && p.y < r.y1;
  let k = -1;
  for (let i = 1; i < pts.length; i++) if (inR(pts[i - 1], rA) && !inR(pts[i], rA)) k = i;
  if (k < 0) return null;
  const a = pts[k - 1], b = pts[k];
  // 선분 a→b 가 A 사각을 나가는 t(축마다 한 번 — 경계는 사각의 변이다)
  let t = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  if (dx > 0 && b.x >= rA.x1) t = Math.min(t, (rA.x1 - a.x) / dx);
  if (dx < 0 && b.x < rA.x0) t = Math.min(t, (rA.x0 - a.x) / dx);
  if (dy > 0 && b.y >= rA.y1) t = Math.min(t, (rA.y1 - a.y) / dy);
  if (dy < 0 && b.y < rA.y0) t = Math.min(t, (rA.y0 - a.y) / dy);
  const cx = a.x + dx * t, cy = a.y + dy * t;
  const clampTo = (p, r) => ({ x: Math.min(r.x1 - 1, Math.max(r.x0, p.x)), y: Math.min(r.y1 - 1, Math.max(r.y0, p.y)) });
  const cA = clampTo({ x: cx, y: cy }, rA), cB = clampTo({ x: cx, y: cy }, rB);
  const partA = pts.slice(0, k).map((p) => clampTo(p, rA)); partA.push(cA);
  const partB = [cB].concat(pts.slice(k).map((p) => clampTo(p, rB)));
  const len = (q) => { let L = 0; for (let i = 1; i < q.length; i++) L += Math.hypot(q[i].x - q[i - 1].x, q[i].y - q[i - 1].y); return L; };
  return { cross: { x: cx, y: cy }, partA, partB, lenA: len(partA), lenB: len(partB), multi: pts.slice(k).some((p) => inR(p, rA)) };
}

// ── 두 존 걸음표 — { dist: { a: { b: econ 거리 } }, split: { a: { b: { fA, ptA, ptB, ptsA, ptsB } } } }
//   rosterA/B = [{ name, cx, cy }](제 존 로컬 칸) · infoR = econ `infoRange` · splitR = 경계 칸·길을 낼 거리 상한(econ)
//   ptA/ptsA 는 **A 로컬 px** · ptB/ptsB 는 **B 로컬 px**(받는 존이 제 좌표로 몸을 세운다).
function crossGeo(q) {
  const { ZONES, P, SZ } = _mods();
  const A = q.A, B = q.B, rA = q.rosterA || [], rB = q.rosterB || [];
  const t0 = Date.now();
  const U = unionAdapter([A, B], { coast: q.coast });
  const offA = { x: ZONES[A].worldOffsetX - U.x0, y: ZONES[A].worldOffsetY - U.y0 };
  const offB = { x: ZONES[B].worldOffsetX - U.x0, y: ZONES[B].worldOffsetY - U.y0 };
  const vil = [];
  for (const v of rA) vil.push({ z: A, name: v.name, ux: v.cx + offA.x / SZ, uy: v.cy + offA.y / SZ });
  for (const v of rB) vil.push({ z: B, name: v.name, ux: v.cx + offB.x / SZ, uy: v.cy + offB.y / SZ });
  const M = bfsMatrix(U.ta, U.ZONE, vil.map((v) => ({ x: v.ux * 2.5, y: v.uy * 2.5 })));
  const bfsMs = Date.now() - t0;
  const nA = rA.length;
  const dist = {};
  for (let i = 0; i < nA; i++) {
    const row = dist[vil[i].name] = {};
    for (let j = nA; j < vil.length; j++) { const d = M[i][j]; row[vil[j].name] = (d == null || !isFinite(d)) ? null : +(+d).toFixed(1); }
  }
  // 경계 칸·두 구간 길 — 정본 교역로 A\*(`computeRoutePts`)를 합친 격자 위에서(같은 어댑터 · 같은 격자)
  const t1 = Date.now();
  const recA = { x0: offA.x, y0: offA.y, x1: offA.x + ZONES[A].zoneWidth, y1: offA.y + ZONES[A].zoneHeight };
  const recB = { x0: offB.x, y0: offB.y, x1: offB.x + ZONES[B].zoneWidth, y1: offB.y + ZONES[B].zoneHeight };
  const splitR = q.splitR != null ? q.splitR : Infinity;
  const split = {};
  let routed = 0, multi = 0, failed = 0;
  _quiet(() => P._routeProbe.reset());
  for (let i = 0; i < nA; i++) for (let j = nA; j < vil.length; j++) {
    const d = dist[vil[i].name][vil[j].name];
    if (d == null || !(d <= splitR)) continue;
    const px = (v) => ({ x: (v.ux + 0.5) * SZ, y: (v.uy + 0.5) * SZ });
    const a = px(vil[i]), b = px(vil[j]);
    const pts = _quiet(() => P._routeProbe.pts(a.x, a.y, b.x, b.y));
    const sp = pts ? _splitRoute(pts, recA, recB) : null;
    if (!sp) { failed++; continue; }
    routed++; if (sp.multi) multi++;
    const toA = (p) => ({ x: Math.round(p.x - offA.x), y: Math.round(p.y - offA.y) });
    const toB = (p) => ({ x: Math.round(p.x - offB.x), y: Math.round(p.y - offB.y) });
    const fA = (sp.lenA + sp.lenB) > 0 ? sp.lenA / (sp.lenA + sp.lenB) : 0.5;
    (split[vil[i].name] || (split[vil[i].name] = {}))[vil[j].name] = {
      fA: +fA.toFixed(4), ptA: toA(sp.partA[sp.partA.length - 1]), ptB: toB(sp.partB[0]),
      ptsA: sp.partA.map(toA), ptsB: sp.partB.map(toB),
    };
  }
  _quiet(() => P._routeProbe.reset());
  return { A, B, nA, nB: rB.length, dist, split, ms: { bfs: bfsMs, route: Date.now() - t1 }, routed, multi, failed };
}

module.exports = { zoneAdapter, unionAdapter, bfsMatrix, crossGeo, _splitRoute, _mods };

// ── 워커 입구 — 존 서버 경계 호스트가 `new Worker(__filename, { workerData: { xzoneGeo: q } })` 로 띄운다 ──
{
  let wt = null; try { wt = require('worker_threads'); } catch (e) {}
  if (wt && !wt.isMainThread && wt.workerData && wt.workerData.xzoneGeo) {
    let out;
    try { out = { ok: true, r: crossGeo(wt.workerData.xzoneGeo) }; } catch (e) { out = { ok: false, err: String(e && e.stack || e) }; }
    wt.parentPort.postMessage(out);
  }
}
