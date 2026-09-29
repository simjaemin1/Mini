#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T525 자)
// =============================================================================
// scripts/t525-cross-zone.js — **존 경계가 없는 것처럼** 재는 자 (T525 · 2026-09-29 · 세션3)
//
// ★왜 [재민 확정 2026-09-29 "NPC 교역이나 전쟁은 zone 을 넘어서도 발생해야 해 · 거리가 가까우면 상호작용은 완전히 정상"]
//   지금 econ 은 **존마다 세계 하나**다(마을·교역·소문·전쟁이 제 존 안에서만 돈다). 이 자는 네 가지를 잰다:
//     pairs   — 경계 마을 쌍 × 실걸음 거리(두 존을 합친 지형의 **정본 교역 BFS** — `__labProbe._distProbe`) · 정보 반경 안인가 · 전쟁·도적 반경 · 땅 원판
//     merged  — 두 존을 **한 세계**로 합쳐 돌린 판(경계가 정말 없다면) — 존을 넘은 교역 쌍(T429 문법: 교역 장부의 도착 행)
//     two     — 두 존을 **따로** 돌리되(워커 둘 · RNG·하루 틱 따로 = 존 서버 둘) 하루마다 잇는 판 — econ 팔 `T525_CROSS_ZONE`
//               (스텁 = 이웃 존 마을의 질의 캐시 · 캐러밴 몸 = 핸드오프 기록). 끔 팔 = 존마다 `t17-metrics` 와 **바이트 동일**(자기검사).
//     rumor   — `two` 판의 장부 사건을 두 존 합친 소문 그래프(`server/rumor.js createGraph` 그대로)에 태워 이웃 존 도달을 센다
//   ★세계는 `t17-metrics.js` 를 **그대로** 돈다 — 워커마다 그 파일을 require 한다(사본 0 · 여덟 수 재구현 0).
//     이 자가 하는 것은 ① 워커 사이 기록 전달(존 서버라면 안 문이 할 일) ② 두 존 합친 거리 ③ 표뿐이다.
//   ★`T17_ZONE=hanbando+nippon node scripts/t17-metrics.js <날> <씨>` 가 곧 `two` 다(T17_ZONE 자 확장).
//
// 거리의 뜻(`T525_DIST`):
//   walk(기본) — 존 안은 t17 그대로(행렬 없음 · 유클리드) · **존을 넘는 쌍만** 두 존 합친 지형의 걸음(정본 BFS · 다리 칸 포함)
//   path       — 존 안도 걸음(서버와 같다 — 존마다 `computeAndInjectDistMatrix` 행렬을 꽂는다)
//   euclid     — 전부 유클리드(t17 의 뜻 그대로 · 바다 건너도 직선 — 비교용)
//   ⚠T525 보고의 표는 전부 walk 로 냈다(path·euclid 는 손잡이만 — 그 판은 안 돌렸다).
//
// 쓰는 법:
//   node scripts/t525-cross-zone.js pairs  <존A> <존B> [--out f.json]
//   node scripts/t525-cross-zone.js merged <존A> <존B> <날=800> <씨=1020> [--out f.json]
//   node scripts/t525-cross-zone.js two    <존A> <존B> <날=800> <씨=1020> [--out f.json]      (T525_CROSS_ZONE=1 이면 켬 팔)
//   node scripts/t525-cross-zone.js rumor  <two 판 JSON> [--out f.json]
//   ⚠시드 캐시(`LAB_SEEDCACHE` 문법)는 존마다 `T525_SEEDDIR/seeds-<존>.json`(기본 /tmp/t525) — 없으면 워커(t17)가 굽는다.
// =============================================================================
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const SEEDDIR = process.env.T525_SEEDDIR || '/tmp/t525';
const DISTMODE = process.env.T525_DIST || 'walk';
const say = (s) => process.stdout.write(s + '\n');

// ── 지형 어댑터(자 공통 문법 — `t17-metrics`·`t429-*`·`test-distmatrix` 와 같은 줄 · 다리 칸은 서버처럼 `ZONE.bridges`) ──
function _geo() {
  if (_geo.g) return _geo.g;
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/t525-geo-${process.pid}.db`;
  const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {};
  const ZC = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZC.ZONES);
  const P = R('server/villages').__labProbe;
  const econ = R('sim/economy-sim');
  console.log = _l; console.warn = _w;
  _geo.g = { ZONES: ZC.ZONES, findZoneAt: ZC.findZoneAt, T, P, econ, SZ: P.SZ };
  return _geo.g;
}
function zoneAdapter(Z) {
  const { ZONES, findZoneAt, T, P, SZ } = _geo();
  const ZONE = ZONES[Z];
  P.setZoneId(Z);
  const _in = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');   // t17 과 같은 기본
  const BAND = COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isW = (x, y) => { if (ZONE.isOcean) return true; if (!_in(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isR = (x, y) => { if (!_in(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  const BR = new Set(); { const bl = ZONE.bridges || []; for (let i = 0; i + 1 < bl.length; i += 2) BR.add(bl[i] + '_' + bl[i + 1]); }
  const deps = { isTerrainBlockedLocal: (x, y) => !_in(x, y) || isR(x, y) || isW(x, y), isWaterTileLocal: isW };
  if (BR.size) deps.isBridgeLocal = (x, y) => BR.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));   // 서버 `isBridgeTileLocal` 과 같은 뜻
  return { ZONE, ta: P.makeTerrainAdapter(T, ZONE, deps) };
}
// 두 존을 합친 사각 — 칸마다 **그 칸의 주인 존** 어댑터에 묻는다(합친 지형 · 새 판정 0).
function unionAdapter(zs) {
  const { SZ } = _geo();
  const Zs = zs.map((Z) => ({ Z, ...zoneAdapter(Z) }));
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
  return { ta, ZONE: { zoneWidth: x1 - x0, zoneHeight: y1 - y0 }, cx0, cy0, Zs };
}
// 정본 교역 BFS(`computeAndInjectDistMatrix`)를 **그대로** 부른다 — 마을 좌표 = 셀 × 2.5(econ 단위).
function bfsMatrix(ta, ZONE, coords) {
  const { P, econ } = _geo();
  const world = { villages: coords.map((c, i) => ({ name: 'v' + i, coord: { x: c.x, y: c.y } })) };
  const _l = console.log, _w = console.warn; console.log = () => {}; console.warn = () => {};
  try { P._distProbe.setup(ta, ZONE, world, econ); P._distProbe.compute('t525'); } finally { console.log = _l; console.warn = _w; }
  return world._distMatrix;
}

// ── 마을 자리 — t17 과 같은 길(시드 캐시가 있으면 그 칸 · 없으면 같은 두 함수로 자리만) ──
function seedCachePath(Z) { return path.join(SEEDDIR, `seeds-${Z}.json`); }
function seedsOf(Z) {
  const f = seedCachePath(Z);
  if (fs.existsSync(f)) { try { const s = JSON.parse(fs.readFileSync(f, 'utf8')); return { seeds: s, layout: !!(s[0] && s[0].lp) }; } catch (e) {} }
  const { T, P, SZ } = _geo();
  const { ZONE, ta } = zoneAdapter(Z);
  const _l = console.log; console.log = () => {};
  const picked = P.pickSeedVillages(T.getZoneVillages(Z) || [], ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const seeds = [];
  for (const hv of picked) { const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ)); if (c) seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy }); }
  console.log = _l;
  return { seeds, layout: false };
}
// 두 존의 마을을 합친 틀 — 셀은 합친 사각의 원점 기준(econ 좌표 = 셀 × 2.5).
function frameOf(zs) {
  const { ZONES, SZ } = _geo();
  const x0 = Math.min(...zs.map((Z) => ZONES[Z].worldOffsetX)), y0 = Math.min(...zs.map((Z) => ZONES[Z].worldOffsetY));
  const vil = [];
  for (const Z of zs) {
    const { seeds } = seedsOf(Z), ZONE = ZONES[Z];
    const ox = (ZONE.worldOffsetX - x0) / SZ, oy = (ZONE.worldOffsetY - y0) / SZ;
    for (const s of seeds) vil.push({ zone: Z, name: s.name, ccx: s.ccx, ccy: s.ccy, ux: s.ccx + ox, uy: s.ccy + oy, coord: { x: (s.ccx + ox) * 2.5, y: (s.ccy + oy) * 2.5 } });
  }
  return { vil, x0, y0 };
}
// 두 존을 넘는 거리표 — {`존|이름`: {`존|이름`: econ 거리}} (걸음 = 합친 지형 BFS · euclid = 직선)
function crossTable(zs, mode) {
  const { vil } = frameOf(zs);
  let M = null, ms = 0;
  if (mode !== 'euclid') { const t0 = Date.now(); const U = unionAdapter(zs); M = bfsMatrix(U.ta, U.ZONE, vil.map((v) => v.coord)); ms = Date.now() - t0; }
  const tab = {};
  const key = (v) => `${v.zone}|${v.name}`;
  for (let i = 0; i < vil.length; i++) for (let j = 0; j < vil.length; j++) {
    if (vil[i].zone === vil[j].zone) continue;
    const eu = Math.hypot(vil[i].coord.x - vil[j].coord.x, vil[i].coord.y - vil[j].coord.y);
    const d = M ? M[i][j] : eu;
    (tab[key(vil[i])] || (tab[key(vil[i])] = {}))[key(vil[j])] = (d == null || !isFinite(d)) ? null : +(+d).toFixed(1);
  }
  return { tab, vil, M, ms };
}

// ── ② pairs ────────────────────────────────────────────────────────────────
const INFO_R = 5000;          // econ `infoRange`(서버 `createWorldV2` 인자 · 2.0km) — 읽는 자리: villages.js init · t17
function pairsMode(A, B, out) {
  const WC = R('sim/war-core');
  const BD_SRC = fs.readFileSync(path.join(ROOT, 'server', 'bandits.js'), 'utf8');
  const RAID_R = +((BD_SRC.match(/BDT_RAID_R = (\d+)/) || [])[1]), SUP_R = +((BD_SRC.match(/BDT_SUP_R = (\d+)/) || [])[1]);
  const { tab, vil, ms } = crossTable([A, B], 'walk');
  const key = (v) => `${v.zone}|${v.name}`;
  const rows = [];
  for (const a of vil.filter((v) => v.zone === A)) for (const b of vil.filter((v) => v.zone === B)) {
    const eu = Math.hypot(a.coord.x - b.coord.x, a.coord.y - b.coord.y), d = tab[key(a)][key(b)];
    const cells = Math.hypot(a.ux - b.ux, a.uy - b.uy);   // 전쟁·도적 자리는 **셀 직선**을 쓴다(war-core `d`·bandits 반경)
    rows.push({ a: a.name, b: b.name, eu: +eu.toFixed(1), walk: d, cells: +cells.toFixed(0),
      info: d != null && d <= INFO_R, infoEu: eu <= INFO_R, war: cells <= WC.WAR_RANGE, raid: cells <= RAID_R, sup: cells <= SUP_R });
  }
  rows.sort((p, q) => (p.walk == null ? Infinity : p.walk) - (q.walk == null ? Infinity : q.walk));
  const bordA = new Set(rows.filter((r) => r.info).map((r) => r.a)), bordB = new Set(rows.filter((r) => r.info).map((r) => r.b));
  // 땅 원판이 경계에 걸친 마을 — 부존 스캔 `LAND_SCAN_R` · 사냥 밴드 `HUNT1`(둘 다 villages.js 에서 읽는다 · 새 수 0)
  const VS = fs.readFileSync(path.join(ROOT, 'server', 'villages.js'), 'utf8');
  const SCAN_R = +((VS.match(/const LAND_SCAN_R = (\d+)/) || [])[1]), HUNT1 = +((VS.match(/const HUNT0 = \d+, HUNT1 = (\d+)/) || [])[1]);
  const { ZONES, SZ } = _geo(), { x0: fx0, y0: fy0 } = frameOf([A, B]);
  const rectOf = (Z) => { const z = ZONES[Z]; return { x0: (z.worldOffsetX - fx0) / SZ, y0: (z.worldOffsetY - fy0) / SZ, x1: (z.worldOffsetX + z.zoneWidth - fx0) / SZ, y1: (z.worldOffsetY + z.zoneHeight - fy0) / SZ }; };
  const toRect = (v, q) => Math.hypot(Math.max(0, q.x0 - v.ux, v.ux - q.x1), Math.max(0, q.y0 - v.uy, v.uy - q.y1));
  const edge = {};
  for (const Z of [A, B]) {
    const q = rectOf(Z === A ? B : A), ds = vil.filter((v) => v.zone === Z).map((v) => ({ name: v.name, d: +toRect(v, q).toFixed(0) })).sort((p, r2) => p.d - r2.d);
    edge[Z] = { scan: ds.filter((x) => x.d < SCAN_R).length, hunt: ds.filter((x) => x.d < HUNT1).length, nearest: ds.slice(0, 5) };
  }
  const res = { zones: [A, B], infoR: INFO_R, WAR_RANGE: WC.WAR_RANGE, BDT_RAID_R: RAID_R, BDT_SUP_R: SUP_R, LAND_SCAN_R: SCAN_R, HUNT1, edge, bfsMs: ms,
    nA: vil.filter((v) => v.zone === A).length, nB: vil.filter((v) => v.zone === B).length, pairs: rows.length,
    reach: rows.filter((r) => r.walk != null).length, info: rows.filter((r) => r.info).length, infoEu: rows.filter((r) => r.infoEu).length,
    war: rows.filter((r) => r.war).length, raid: rows.filter((r) => r.raid).length, sup: rows.filter((r) => r.sup).length,
    borderA: [...bordA], borderB: [...bordB], rows };
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  say(`[T525 pairs] ${A}(${res.nA}) × ${B}(${res.nB}) = ${res.pairs}쌍 · 걸어 닿음 ${res.reach} · 정보 반경(걸음 2.0km) 안 **${res.info}** (직선이면 ${res.infoEu}) · 경계 마을 ${A} ${bordA.size} · ${B} ${bordB.size}`
    + ` · 전쟁 사거리(${WC.WAR_RANGE}칸) 안 ${res.war} · 약탈 사정(${RAID_R}) ${res.raid} · 토벌(${SUP_R}) ${res.sup} · BFS ${(ms / 1000).toFixed(1)}s`
    + ` · 땅 원판(${SCAN_R}칸)이 경계에 걸친 마을 ${A} ${edge[A].scan} · ${B} ${edge[B].scan}(사냥 밴드 ${HUNT1}칸 ${edge[A].hunt} · ${edge[B].hunt})`);
  return res;
}

// ── 워커 — t17 을 그대로 돌리며 하루마다 호스트와 맞춘다 ─────────────────────────
//   부트: 이 파일을 워커로 띄우면(workerData.t525) 아래 `_peerBoot` 가 econ `tickWorldV2` 에 문 하나를 씌우고 t17 을 require 한다.
//   ⚠문은 **세계 밖**에서만 돈다: 틱 앞 = 받은 기록·스텁을 꽂음 · 틱 뒤 = 나간 기록·경계 마을 스냅을 보냄 — 틱 안은 econ 정본 그대로.
function _peerBoot() {
  const { workerData, receiveMessageOnPort } = require('worker_threads');
  const W = workerData.t525, port = W.port, flag = new Int32Array(W.flag);
  const recv = () => { for (;;) { const m = receiveMessageOnPort(port); if (m) return m.message; Atomics.wait(flag, 0, 0, 50); Atomics.store(flag, 0, 0); } };
  const econV2 = R('sim/economy-sim-v2');
  const Events = R('server/events');
  // 장부 사건 — t17 장부에 귀 하나를 더 단다(소문 도달 표 · 값은 안 바꾼다)
  const evLog = [];
  const _mk = Events.createLedger;
  Events.createLedger = function (opts) {
    const o = Object.assign({}, opts);
    const inner = opts && opts.onEvent;
    o.onEvent = (e) => { if (e && evLog.length < 200000) evLog.push([e.day, e.vid, e.type]); if (inner) return inner(e); };
    return _mk.call(this, o);
  };
  const orig = econV2.tickWorldV2;
  let world = null, X = null, border = [], peerZone = null, distTab = null, mine = null;
  const st = { arriveOut: 0, returnOut: 0, arriveIn: 0, returnIn: 0, rows: [] };
  econV2.tickWorldV2 = function (w) {
    if (!world) {
      world = w;
      port.postMessage({ type: 'ready', zone: W.zone, villages: w.villages.map((v) => v.name), day: w.day });
      const init = recv();                      // { peerZone, border:[내 마을 이름 — 이웃이 스텁으로 가질 것], dist:{…}, matrix? }
      peerZone = init.peerZone; border = new Set(init.border || []); distTab = init.dist || {};
      mine = new Map(w.villages.map((v) => [v.name, v]));
      if (init.matrix) R('sim/economy-sim').setDistMatrix(w, init.matrix);   // T525_DIST=path — 존 안도 걸음(서버와 같다)
      const key = (v) => `${v._xz ? v.zone : W.zone}|${v.name}`;
      w.xzone = X = {
        zone: W.zone, stubs: [], out: [], inbox: [],
        dist: (a, b) => { const r = distTab[key(a)]; const d = r ? r[key(b)] : null; return (d == null) ? Infinity : d; },
      };
    }
    const m = recv();                            // { stubs:[스냅], inbox:[기록] }
    X.stubs = (m.stubs || []).map((s) => econV2.xzoneStub(s, peerZone, { _xzDay: w.day }));   // 받은 날 = 이 존의 오늘(틱 전)
    for (const r of (m.inbox || [])) { X.inbox.push(r); if (r.kind === 'arrive') st.arriveIn++; else st.returnIn++; }
    orig(w);
    const out = X.out.splice(0);
    for (const r of out) { if (r.kind === 'arrive') st.arriveOut++; else { st.returnOut++; st.rows.push({ day: w.day, id: r.id, home: r.toZone, lastTo: r.lastTo, row: r.row, abandoned: r.abandoned, traderDead: r.traderDead, ret: r.returningRes, retAmt: r.returningAmt }); } }
    const snaps = [];
    for (const n of border) { const v = mine.get(n); if (v) snaps.push(econV2.xzoneSnapshot(v, w.day, false)); }
    port.postMessage({ type: 'day', day: w.day, out, snaps });
  };
  try { require(path.join(__dirname, 't17-metrics.js')); } catch (e) { port.postMessage({ type: 'error', msg: String(e && e.stack || e) }); return; }
  port.postMessage({ type: 'done', zone: W.zone, stats: st, events: evLog,
    tradeRows: (world && world.tradeLog || []).filter((t) => t.xzone).length });
}

// ── 오케스트라 — 워커 둘(존 둘) · 하루마다 기록·스냅을 건넨다(존 서버라면 안 문 · 여기선 같은 호스트의 워커 사이) ──
async function twoMode(A, B, days, seed, out, opts) {
  opts = opts || {};
  const { Worker, MessageChannel } = require('worker_threads');
  const zs = [A, B];
  const tag = opts.tag || `${A}+${B}-${seed}-${process.env.T525_CROSS_ZONE === '1' ? 'on' : 'off'}-${DISTMODE}`;
  const dir = opts.dir || path.join(SEEDDIR, 'two');
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const W = {};
  for (const Z of zs) {
    const ch = new MessageChannel(), sab = new SharedArrayBuffer(4);
    const env = Object.assign({}, process.env, {
      T17_ZONE: Z, LAB_SEEDCACHE: seedCachePath(Z), T17_JSON: path.join(dir, `${tag}.${Z}.json`),
      DB_PATH: `/tmp/t525-w-${process.pid}-${Z}.db`,
    });
    const w = new Worker(__filename, { argv: [String(days), String(seed)], env, stdout: true, stderr: true,
      workerData: { t525: { zone: Z, port: ch.port2, flag: sab } }, transferList: [ch.port2] });
    const log = fs.createWriteStream(path.join(dir, `${tag}.${Z}.log`));
    w.stdout.pipe(log); w.stderr.pipe(log);
    W[Z] = { w, port: ch.port1, flag: new Int32Array(sab), q: [], waiters: [], zone: Z };
    ch.port1.on('message', (m) => { const o = W[Z]; if (o.waiters.length) o.waiters.shift()(m); else o.q.push(m); });
    w.on('error', (e) => { say(`  ⚠워커 ${Z} 오류: ${e && e.stack || e}`); process.exit(1); });
  }
  const next = (Z) => new Promise((res) => { const o = W[Z]; if (o.q.length) res(o.q.shift()); else o.waiters.push(res); });
  const send = (Z, m) => { const o = W[Z]; o.port.postMessage(m); Atomics.store(o.flag, 0, 1); Atomics.notify(o.flag, 0); };
  // ① 준비 — 두 세계가 섰다 → 거리표·경계 마을
  const ready = {};
  for (const Z of zs) { const m = await next(Z); if (m.type !== 'ready') throw new Error(`${Z} 준비 실패: ${JSON.stringify(m).slice(0, 300)}`); ready[Z] = m; }
  const ct = crossTable(zs, DISTMODE === 'euclid' ? 'euclid' : 'walk');
  const key = (Z, n) => `${Z}|${n}`;
  const border = { [A]: new Set(), [B]: new Set() };
  for (const Z of zs) { const P2 = Z === A ? B : A; for (const n of ready[Z].villages) { const r = ct.tab[key(Z, n)] || {}; for (const k in r) if (r[k] != null && r[k] <= INFO_R) { border[Z].add(n); border[P2].add(k.split('|')[1]); } } }
  let mats = {};
  if (DISTMODE === 'path') for (const Z of zs) { const { ZONE, ta } = zoneAdapter(Z); const { vil } = frameOf([Z]); mats[Z] = bfsMatrix(ta, ZONE, vil.map((v) => ({ x: v.ccx * 2.5, y: v.ccy * 2.5 }))); }
  for (const Z of zs) send(Z, { peerZone: Z === A ? B : A, border: [...border[Z]], dist: ct.tab, matrix: mats[Z] || null });
  // ② 하루마다 — 어제 나간 기록·스냅을 오늘 건넨다(한 날 늦음 · 양쪽 같다)
  let pend = { [A]: { stubs: [], inbox: [] }, [B]: { stubs: [], inbox: [] } };
  const X = { arrive: { [A]: 0, [B]: 0 }, ret: { [A]: 0, [B]: 0 }, done: {}, events: {}, daily: [] };
  for (let d = 0; d < days; d++) {
    for (const Z of zs) send(Z, pend[Z]);
    const got = {};
    for (const Z of zs) { const m = await next(Z); if (m.type === 'error') throw new Error(`${Z}: ${m.msg}`); if (m.type !== 'day') throw new Error(`${Z} 하루 문 어긋남: ${m.type}`); got[Z] = m; }
    pend = { [A]: { stubs: got[B].snaps, inbox: [] }, [B]: { stubs: got[A].snaps, inbox: [] } };
    for (const Z of zs) for (const r of got[Z].out) { const to = r.toZone; if (pend[to]) pend[to].inbox.push(r); if (r.kind === 'arrive') X.arrive[Z]++; else X.ret[Z]++; }
  }
  for (const Z of zs) { const m = await next(Z); if (m.type === 'error') throw new Error(`${Z}: ${m.msg}`); X.done[Z] = m; }
  for (const Z of zs) { try { await W[Z].w.terminate(); } catch (e) {} }
  const eight = {};
  for (const Z of zs) { try { eight[Z] = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.${Z}.json`), 'utf8')); } catch (e) { eight[Z] = null; } }
  const res = { tag, zones: zs, days, seed, arm: process.env.T525_CROSS_ZONE === '1', dist: DISTMODE, ms: Date.now() - t0,
    border: { [A]: [...border[A]], [B]: [...border[B]] }, crossed: X.arrive, returned: X.ret,
    stats: { [A]: X.done[A].stats, [B]: X.done[B].stats }, events: { [A]: X.done[A].events, [B]: X.done[B].events }, eight };
  if (out) fs.writeFileSync(out, JSON.stringify(res));
  return res;
}

// ── 합친 판 — 두 존의 시드를 한 캐시로 합쳐 t17 을 한 번 돈다(경계가 정말 없다면) ─────────────
async function mergedMode(A, B, days, seed, out, opts) {
  opts = opts || {};
  const { Worker, MessageChannel } = require('worker_threads');
  const dir = opts.dir || path.join(SEEDDIR, 'merged');
  fs.mkdirSync(dir, { recursive: true });
  const { ZONES, SZ } = _geo();
  const x0 = Math.min(ZONES[A].worldOffsetX, ZONES[B].worldOffsetX), y0 = Math.min(ZONES[A].worldOffsetY, ZONES[B].worldOffsetY);
  const seeds = [], zoneOf = {};
  for (const Z of [A, B]) {
    const s = seedsOf(Z); if (!s.layout) throw new Error(`${Z} 시드 캐시(땅 값)가 없다 — 먼저 t17 한 판(LAB_SEEDCACHE=${seedCachePath(Z)})`);
    const ox = (ZONES[Z].worldOffsetX - x0) / SZ, oy = (ZONES[Z].worldOffsetY - y0) / SZ;
    for (const r of s.seeds) { seeds.push(Object.assign({}, r, { ccx: r.ccx + ox, ccy: r.ccy + oy })); zoneOf[r.name] = Z; }
  }
  const cache = path.join(dir, `seeds-${A}+${B}.json`);
  fs.writeFileSync(cache, JSON.stringify(seeds));
  // 거리 — 존 안은 유클리드(t17) · 존을 넘는 쌍은 걸음(walk) · path 면 합친 지형 BFS 전쌍 · euclid 면 행렬 없음
  let matrix = null;
  if (DISTMODE !== 'euclid') {
    const U = unionAdapter([A, B]);
    const coords = seeds.map((s) => ({ x: s.ccx * 2.5, y: s.ccy * 2.5 }));
    const M = bfsMatrix(U.ta, U.ZONE, coords);
    matrix = seeds.map((si, i) => seeds.map((sj, j) => {
      if (i === j) return 0;
      if (DISTMODE === 'walk' && zoneOf[si.name] === zoneOf[sj.name]) return Math.hypot(coords[i].x - coords[j].x, coords[i].y - coords[j].y);
      return M[i][j];
    }));
  }
  const tag = opts.tag || `${A}+${B}-${seed}-merged-${DISTMODE}`;
  const ch = new MessageChannel(), sab = new SharedArrayBuffer(4);
  const env = Object.assign({}, process.env, { T17_ZONE: A, LAB_SEEDCACHE: cache, T17_JSON: path.join(dir, `${tag}.json`), DB_PATH: `/tmp/t525-m-${process.pid}.db` });
  delete env.T525_CROSS_ZONE;
  const w = new Worker(__filename, { argv: [String(days), String(seed)], env, stdout: true, stderr: true,
    workerData: { t525m: { port: ch.port2, flag: sab, matrix, zoneOf } }, transferList: [ch.port2] });
  const log = fs.createWriteStream(path.join(dir, `${tag}.log`)); w.stdout.pipe(log); w.stderr.pipe(log);
  const msg = await new Promise((res, rej) => { ch.port1.on('message', (m) => { if (m.type === 'done' || m.type === 'error') res(m); }); w.on('error', rej); });
  try { await w.terminate(); } catch (e) {}
  if (msg.type === 'error') throw new Error(msg.msg);
  let eight = null; try { eight = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.json`), 'utf8')); } catch (e) {}
  const res = { tag, zones: [A, B], days, seed, dist: DISTMODE, cross: msg.cross, eight };
  if (out) fs.writeFileSync(out, JSON.stringify(res));
  return res;
}
// 합친 판 워커 — 첫 틱 앞에 행렬을 꽂고(있으면) 날마다 **존을 넘은 도착 행**만 센다(T429 문법 · 재routing·빈손 귀환은 도착이 아니다)
function _mergedBoot() {
  const { workerData } = require('worker_threads');
  const M = workerData.t525m, port = M.port;
  const econ = R('sim/economy-sim');
  const econV2 = R('sim/economy-sim-v2');
  const orig = econV2.tickWorldV2;
  const pairs = {}, items = {};
  let first = true, n = 0, sent = 0, bought = 0;
  econV2.tickWorldV2 = function (w) {
    if (first) { first = false; if (M.matrix) econ.setDistMatrix(w, M.matrix); }
    orig(w);
    const TL = w.tradeLog;
    for (let i = TL.length - 1; i >= 0; i--) {
      const e = TL[i];
      if ((e.day | 0) !== (w.day | 0)) { if ((e.day | 0) < (w.day | 0)) break; else continue; }
      if (e.rerouted || e.abandoned) continue;
      const zf = M.zoneOf[e.from], zt = M.zoneOf[e.to];
      if (!zf || !zt || zf === zt) continue;
      n++;
      const k = `${e.from}→${e.to}`; pairs[k] = (pairs[k] || 0) + 1;
      if (e.sent) { sent += +e.sent.amt || 0; items[e.sent.res] = (items[e.sent.res] || 0) + (+e.sent.amt || 0); }
      if (e.bought) { bought += +e.bought.amt || 0; items[e.bought.res] = (items[e.bought.res] || 0) + (+e.bought.amt || 0); }
    }
  };
  try { require(path.join(__dirname, 't17-metrics.js')); } catch (e) { port.postMessage({ type: 'error', msg: String(e && e.stack || e) }); return; }
  port.postMessage({ type: 'done', cross: { trades: n, pairs, items, sent: +sent.toFixed(1), bought: +bought.toFixed(1) } });
}

// ── 소문 도달 — 두 존 판의 장부 사건을 **두 존 합친 소문 그래프**(정본 `server/rumor.js createGraph` 그대로)에 태운다 ──
//   지금(존마다 장부): 이웃 존 마을은 `geo.vids()` 에 없다 ⇒ 존을 넘는 도달 0 (villages.js 장부 `geo`).
//   설계(스텁이 vids 에 든다): 도달일 = 사건 날 + `travelDaysOf(걸음)`(T496 몸 시계) — 판 끝날까지 닿은 (사건 × 이웃 존 마을) 수.
//   거리 = 두 존 합친 지형의 정본 교역 BFS(존 안 쌍도 — 서버의 `villageDist` 가 읽는 그 행렬의 뜻).
function rumorMode(file, out) {
  const r = JSON.parse(fs.readFileSync(file, 'utf8'));
  const zs = r.zones, [A, B] = zs;
  const { vil } = frameOf(zs);
  const U = unionAdapter(zs);
  const M = bfsMatrix(U.ta, U.ZONE, vil.map((v) => v.coord));
  const Rumor = R('server/rumor');
  const G = Rumor.createGraph({ vids: () => vil.map((_, i) => i), dist: (a, b) => { const d = M[a][b]; return (d == null) ? Infinity : d; } });
  const base = {}; { let k = 0; for (const Z of zs) { base[Z] = k; k += vil.filter((v) => v.zone === Z).length; } }
  const idxOf = (Z) => vil.map((v, i) => [v, i]).filter(([v]) => v.zone === Z).map(([, i]) => i);
  const res = { zones: zs, days: r.days, seed: r.seed, arm: r.arm, speed: Rumor.CFG.SPEED, dir: {} };
  for (const Z of zs) {
    const P2 = Z === A ? B : A, peers = idxOf(P2), ev = (r.events && r.events[Z]) || [];
    let reach = 0, reach1 = 0, evAny = 0;
    for (const [day, vid] of ev) {
      const u = base[Z] + vid; if (!(u >= 0 && u < vil.length) || vil[u].zone !== Z) continue;
      let any = false;
      for (const p of peers) { const dl = G.delayBetween(u, p); if (!isFinite(dl)) continue; if (day + dl <= r.days) { reach++; any = true; if (dl <= 1) reach1++; } }
      if (any) evAny++;
    }
    // 이웃 존 마을마다 — 이 존 마을 중 가장 가까운(일수) 곳에서 며칠
    const mins = peers.map((p) => Math.min(...idxOf(Z).map((u) => G.delayBetween(u, p)))).sort((a, b) => a - b);
    const all = []; for (const u of idxOf(Z)) for (const p of peers) all.push(G.delayBetween(u, p)); all.sort((a, b) => a - b);
    res.dir[`${Z}→${P2}`] = { events: ev.length, eventsReached: evAny, arrivals: reach, arrivals1d: reach1,
      minDays: { min: mins[0], med: mins[Math.floor(mins.length / 2)], max: mins[mins.length - 1] },
      pairDays: { min: all[0], med: all[Math.floor(all.length / 2)], max: all[all.length - 1] } };
    say(`[T525 소문] ${Z}→${P2} — 사건 ${ev.length} 중 이웃 존에 닿은 사건 ${evAny} · (사건×마을) 도달 ${reach}(하루 안 ${reach1})`
      + ` · 이웃 마을이 가장 가까운 ${Z} 마을에서 듣는 날 ${mins[0]}~${mins[mins.length - 1]}일(중앙 ${mins[Math.floor(mins.length / 2)]}) · 쌍 중앙 ${all[Math.floor(all.length / 2)]}일`);
  }
  if (out) fs.writeFileSync(out, JSON.stringify(res, null, 1));
  return res;
}

// ── t17 에서 부르는 문(`T17_ZONE=A+B`) ─────────────────────────────────────────
function orchestrateFromT17(days, seed) {
  const zs = String(process.env.T17_ZONE).split('+');
  if (zs.length !== 2) { say(`[T525] 두 존만 잇는다: ${process.env.T17_ZONE}`); process.exit(2); }
  twoMode(zs[0], zs[1], days, seed, process.env.T525_JSON || null).then((r) => { summarizeTwo(r); }).catch((e) => { say(`[T525] ${e && e.stack || e}`); process.exit(1); });
}
function summarizeTwo(r) {
  const [A, B] = r.zones;
  const ok = (Z) => { const s = r.stats[Z]; return s.rows.filter((x) => x.row && !x.abandoned && !x.traderDead && !(x.row && x.row.rerouted)).length; };
  say(`\n=== T525 두 존 판 — ${A}+${B} · 씨 ${r.seed} · ${r.days}일 · 팔 ${r.arm ? '**켬**' : '끔'} · 거리 ${r.dist} · ${(r.ms / 1000).toFixed(0)}s ===`);
  say(`  경계 마을 ${A} ${r.border[A].length} · ${B} ${r.border[B].length}`);
  say(`  캐러밴 넘음 ${A}→${B} ${r.crossed[A]} · ${B}→${A} ${r.crossed[B]} · 돌아옴 ${r.returned[B]} · ${r.returned[A]}`);
  say(`  경계 교역 성사(도착 존이 판 것) ${A}→${B} ${ok(B)} · ${B}→${A} ${ok(A)}`);
  for (const Z of r.zones) { const e = r.eight[Z]; if (!e) continue;
    say(`  ${Z.padEnd(10)} 인구 ${e.base.pop} · 소멸 ${e.base.dead}/${e.base.ever} · 무기Q ${e.base.weapQ} · 확장 ${e.base.expand} · 게시 ${e.board.reqOpened} · 도구Q ${e.tool.q} · 보존식 ${e.preserve.stock} · 생곡 ${e.eight && e.eight.grain}`); }
}

// ── 입구 ───────────────────────────────────────────────────────────────────
function _main() {
  const argv = process.argv.slice(2);
  const oi = argv.indexOf('--out'); const out = oi >= 0 ? argv[oi + 1] : null;
  const pos = argv.filter((x, i) => !(x === '--out' || (oi >= 0 && i === oi + 1)));
  const mode = pos[0];
  if (mode === 'pairs') { pairsMode(pos[1] || 'hanbando', pos[2] || 'nippon', out); return; }
  if (mode === 'two') { twoMode(pos[1], pos[2], +(pos[3] || 800), +(pos[4] || 1020), out).then(summarizeTwo).catch((e) => { say(String(e && e.stack || e)); process.exit(1); }); return; }
  if (mode === 'merged') { mergedMode(pos[1], pos[2], +(pos[3] || 800), +(pos[4] || 1020), out).then((r) => { say(`[T525 merged] ${r.tag} — 존 넘은 도착 ${r.cross.trades} · 쌍 ${Object.keys(r.cross.pairs).length}`); }).catch((e) => { say(String(e && e.stack || e)); process.exit(1); }); return; }
  if (mode === 'rumor') { rumorMode(pos[1], out); return; }
  say('쓰는 법: pairs <A> <B> | merged <A> <B> <날> <씨> | two <A> <B> <날> <씨> | rumor <two 판 JSON>  [--out f.json]');
}

// 워커로 떴나 · 모듈로 불렸나 · 입구인가
let _wd = null; try { _wd = require('worker_threads').workerData; } catch (e) {}
if (_wd && _wd.t525) _peerBoot();
else if (_wd && _wd.t525m) _mergedBoot();
else if (require.main === module) _main();
module.exports = { orchestrateFromT17, pairsMode, twoMode, mergedMode, rumorMode, crossTable, unionAdapter, zoneAdapter, frameOf, bfsMatrix, INFO_R };
