#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T1327 자 · 제품 무변)
// === scripts/t1327-route-audit.js — 정적 전 쌍 교역로가 **막힌 칸**(물 · 바위 · 도랑 · 해안 띠)을 지나는 마디 전수 [T1327 · T1320 회부 1 · 2] ===
//
// ★왜: T1320 은 몸 걸음(`T1320_ROCK_PATH`)으로 막힌 칸 걸음을 51,215 → 1,167 로 줄였다. 남은 것은 **길 자체**다 — 코스 격자 교역로의
//   이웃 잇기가 칸을 안 보고 뛰어넘는다(다리 없는 건널목 · 얇은 능선 굴 · 환호 도랑). 이 자는 부팅이 판 교역로 전 쌍을 그대로 들여다본다.
// ★어떻게: 존 하나를 이 프로세스 안에 띄운다(`t619-h-audit` 문법 · 소굴 배치가 유한 쌍 전부를 판다) → `routeCache` 의 길마다
//   8px 마다 짚어 존 걸음 정본(`isTerrainBlockedLocal`)이 막은 칸을 가른다:
//     도랑 = 환호(`SimVillages.ditchCells`) · 바위 = `isRockCellLocal`(칸 중심) · 물 = 강 · 호수(`isWaterCellLocal`) · 해안 띠 = 그 밖 물 칸(`isWaterTileLocal`).
//   마디(코스 꺾은 줄 한 토막)마다 막힌 칸이 하나라도 있으면 "막힌 마디" — 종류 · 자리(마디 두 끝) · 그 마디를 지나는 쌍 수.
//   몸 길(`T1320_ROCK_PATH=1` 이면 `setBodyPts` 문을 거친 줄)도 같은 자로 잰다.
//   닿음 = 거리행렬(`world._distMatrix`) 유한 쌍 · 길 길이 · 부팅 교역로 굽는 시간(소굴 표본 끝까지 벽시계).
// 실행: node scripts/t1327-route-audit.js <존> --out <json> [--png <png>] [--hold 8]
//   팔은 env 로(예: T598_ROUTE_EDGE=1 · T1320_ROCK_PATH=1 · T1327_ROUTE_FIX=1).
'use strict';
if (require.main === module) require('./lib-port').noCentral();   // [T1288] central 없이 존을 띄운다 — 존이 기본 localhost:3010(나란히 돌면 남의 central)에 붙지 않게 닿지 않는 주소를 준다
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'hanbando';
const OUT = val('--out', `/tmp/t1327-${ZID}.json`), PNG = val('--png', null), HOLD = +val('--hold', '8');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const say = (...a) => process.stdout.write(a.join(' ') + '\n');
(async () => {
  const DB = `/tmp/t1327ra-${process.pid}.db`;
  Object.assign(process.env, { ZONE_ID: ZID, PORT: String(require('./lib-port').port(43000)), DB_PATH: DB, ENABLE_WILDLIFE: '0',
    ENABLE_VILLAGES: '1', VILLAGE_ROUTE_WARM: '0' });
  const log = [];
  console.log = (...a) => log.push(a.join(' ')); console.warn = console.log; console.error = console.log;
  const t0 = Date.now();
  const Zone = require(path.join(ROOT, 'server', 'zone.js'));
  const H = Zone.__testBind();
  for (let i = 0; i < 2400; i++) { let d = null; try { d = H.SimVillages.econDay(); } catch (e) {} if (d != null) break; await sleep(250); }
  const V = H.SimVillages, B = V.__p3Bind({}), S = B.state;
  let mem = -1, same = 0;
  for (let i = 0; i < 1800 && same < HOLD; i++) { const m = V.routeDebug({}).mem; if (m === mem && m > 0) same++; else same = 0; mem = m; await sleep(1000); }
  // 소굴 표본이 안 판 쌍(닛폰 · 중원북은 표본이 몇 쌍뿐)도 판다 — 거리행렬 유한 쌍 전부 · 같은 문(`banditHost().getRoute` = 캐러밴이 쓰는 그 캐시 문)
  { const BH = V.banditHost && V.banditHost(), VS0 = S.villages || [], M0 = S.world && S.world._distMatrix;
    if (BH && BH.getRoute && M0) for (let i = 0; i < VS0.length; i++) for (let j = i + 1; j < VS0.length; j++) if (M0[i] && isFinite(M0[i][j])) BH.getRoute(VS0[i], VS0[j]); }
  const bakeS = (Date.now() - t0) / 1000 - HOLD;
  const T = require(path.join(ROOT, 'server', 'terrain'));
  const SZ = 32;
  const DITCH = new Set(); { const f = V.ditchCells ? V.ditchCells() : []; for (let i = 0; i + 1 < f.length; i += 2) DITCH.add(f[i] + '_' + f[i + 1]); }
  const kindAt = (x, y) => {
    if (!H.isTerrainBlockedLocal(x, y)) return null;
    const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ), cx = tx * SZ + 16, cy = ty * SZ + 16;
    if (DITCH.has(tx + '_' + ty)) return 'ditch';
    if (T.isRockCellLocal(ZID, cx, cy)) return 'rock';
    if (T.isWaterCellLocal(ZID, cx, cy)) return 'water';
    if (H.isWaterTileLocal(x, y)) return 'coast';
    return 'other';
  };
  const KINDS = ['water', 'rock', 'ditch', 'coast', 'other'];
  // 길 하나 — 마디마다 막힌 칸(종류별 짚은 수) · 막힌 마디
  const walk = (pts) => {
    const r = { len: 0, n: 0, blk: {}, segs: [] };
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], c = pts[i], d = Math.hypot(c.x - a.x, c.y - a.y); r.len += d;
      const k = Math.max(1, Math.ceil(d / 8)); let sk = null; const sb = {};
      for (let q = 1; q <= k; q++) { r.n++; const kd = kindAt(a.x + (c.x - a.x) * q / k, a.y + (c.y - a.y) * q / k); if (kd) { r.blk[kd] = (r.blk[kd] || 0) + 1; sb[kd] = (sb[kd] || 0) + 1; sk = sk || kd; } }
      if (sk) r.segs.push({ a: [Math.round(a.x), Math.round(a.y)], b: [Math.round(c.x), Math.round(c.y)], kind: Object.keys(sb).sort((p, q) => sb[q] - sb[p])[0], steps: sb });
    }
    return r;
  };
  const keys = [...S.routeCache.keys()].sort();
  const segMap = new Map(), byKind = {}, routes = {};
  let lenSum = 0, nSum = 0, blkSum = {}, routesBlk = 0;
  const bodyOn = process.env.T1320_ROCK_PATH === '1' && V.__labProbe && V.__labProbe._caravanBodyProbe;
  const body = { n: 0, blk: {}, routesBlk: 0, len: 0 };
  for (const k of keys) {
    const pts = S.routeCache.get(k); if (!pts || pts.length < 2) continue;
    const w = walk(pts); lenSum += w.len; nSum += w.n; for (const kd in w.blk) blkSum[kd] = (blkSum[kd] || 0) + w.blk[kd];
    if (w.segs.length) routesBlk++;
    routes[k] = { len: Math.round(w.len), pts: pts.length, blk: w.blk, segs: w.segs.length };
    for (const s of w.segs) {
      const sk = s.a[0] < s.b[0] || (s.a[0] === s.b[0] && s.a[1] <= s.b[1]) ? s.a.concat(s.b).join(',') : s.b.concat(s.a).join(',');
      let o = segMap.get(sk); if (!o) { o = { a: s.a, b: s.b, kind: s.kind, steps: s.steps, pairs: 0 }; segMap.set(sk, o); byKind[s.kind] = (byKind[s.kind] || 0) + 1; }
      o.pairs++;
    }
    if (bodyOn) { const bd = {}; V.__labProbe._caravanBodyProbe.pts(bd, pts.map((q) => ({ x: q.x, y: q.y }))); const wb = walk(bd.pts); body.n += wb.n; body.len += wb.len; for (const kd in wb.blk) body.blk[kd] = (body.blk[kd] || 0) + wb.blk[kd]; if (wb.segs.length) body.routesBlk++; }
  }
  // 닿음 — 거리행렬 유한 쌍
  const mat = S.world && S.world._distMatrix, VS = S.villages || [];
  let reach = 0, pairsAll = 0; const unreach = [];
  if (mat) for (let i = 0; i < VS.length; i++) for (let j = i + 1; j < VS.length; j++) { pairsAll++; if (mat[i] && isFinite(mat[i][j])) reach++; else unreach.push(VS[i].dbId + '_' + VS[j].dbId); }
  const segs = [...segMap.values()].sort((p, q) => q.pairs - p.pairs);
  const out = { zone: ZID, arms: { T598_ROUTE_EDGE: process.env.T598_ROUTE_EDGE === '1', T1320_ROCK_PATH: process.env.T1320_ROCK_PATH === '1', T1327_ROUTE_FIX: process.env.T1327_ROUTE_FIX === '1' },
    bakeS: +bakeS.toFixed(1), villages: VS.length, pairsAll, reach, unreach, routes: keys.length, routesBlk, lenSum: Math.round(lenSum), steps: nSum, blkSteps: blkSum,
    blkSegs: segs.length, blkSegsByKind: byKind, ditchCells: DITCH.size, body: bodyOn ? body : null,
    t1327: V.t1327Stat ? V.t1327Stat() : null, segs, routeLen: Object.fromEntries(keys.map((k) => [k, routes[k] ? routes[k].len : null])), routeBlk: Object.fromEntries(Object.entries(routes).filter(([, r]) => r.segs).map(([k, r]) => [k, r])),
    vil: VS.map((v) => ({ id: v.dbId, name: v.name, ccx: v.ccx, ccy: v.ccy })) };
  fs.writeFileSync(OUT, JSON.stringify(out));
  say(`[T1327 길 감사] ${ZID} · 팔 ${JSON.stringify(out.arms)} · 굽기 ${out.bakeS}s · 마을 ${VS.length} · 쌍 ${pairsAll} · 닿음 ${reach} · 길 ${keys.length} · 막힌 길 ${routesBlk} · 막힌 마디 ${segs.length} ${JSON.stringify(byKind)} · 막힌 걸음 ${JSON.stringify(blkSum)}`
    + (bodyOn ? ` · 몸 길 막힌 걸음 ${JSON.stringify(body.blk)}(길 ${body.routesBlk})` : '') + ` · 총 길이 ${Math.round(lenSum)}`);
  if (PNG) {
    // 지도 — 1px = 4칸 · 뭍 회색 · 물 파랑 · 바위 짙은 회색 · 길 옅은 노랑 · 막힌 마디 종류색(물 빨강 · 바위 주황 · 도랑 자홍 · 해안 띠 하늘)
    const { PNG: P } = require('pngjs');
    const Z = require(path.join(ROOT, 'server', 'zone-config')).ZONES[ZID], K = 4;
    const W = Math.ceil(Z.zoneWidth / SZ / K), Hh = Math.ceil(Z.zoneHeight / SZ / K);
    const img = new P({ width: W, height: Hh });
    const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= Hh) return; const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) { const px = (x * K + 2) * SZ, py = (y * K + 2) * SZ;
      put(x, y, T.isRockCellLocal(ZID, px, py) ? [70, 70, 70] : H.isWaterTileLocal(px, py) ? (H.isBridgeTileLocal(px, py) ? [200, 160, 90] : [60, 110, 170]) : [200, 200, 190]); }
    const line = (a, b, c, wd) => { const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (SZ * K) * 2)); for (let q = 0; q <= n; q++) { const x = Math.floor((a[0] + (b[0] - a[0]) * q / n) / SZ / K), y = Math.floor((a[1] + (b[1] - a[1]) * q / n) / SZ / K); for (let dx = -wd; dx <= wd; dx++) for (let dy = -wd; dy <= wd; dy++) put(x + dx, y + dy, c); } };
    for (const k of keys) { const p = S.routeCache.get(k); if (p) for (let i = 1; i < p.length; i++) line([p[i - 1].x, p[i - 1].y], [p[i].x, p[i].y], [230, 220, 120], 0); }
    const COL = { water: [220, 30, 30], rock: [255, 140, 0], ditch: [220, 0, 220], coast: [0, 200, 230], other: [0, 0, 0] };
    for (const s of segs) line(s.a, s.b, COL[s.kind], 2);
    for (const v of VS) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(Math.floor(v.ccx / K) + dx, Math.floor(v.ccy / K) + dy, [0, 120, 0]);
    fs.writeFileSync(PNG, P.sync.write(img));
  }
  try { for (const s of ['', '-wal', '-shm']) fs.unlinkSync(DB + s); } catch (e) {}
  process.exit(0);
})().catch((e) => { process.stdout.write(String(e && e.stack) + '\n'); process.exit(1); });
