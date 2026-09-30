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
//   ★★[T533 2026-09-30] 지형 어댑터·합친 BFS 는 `server/xzone-geo.js` 로 옮겼다(존 서버 경계 호스트와 **한 벌** · 사본 0) ·
//     `two` 의 워커 문은 존 서버와 같은 핵심(`server/xzone.js createCore` — 스텁·기록 줄·경계 마을·경계 칸 `split`)을 쓴다.
//     econ 은 T533 뜻대로 **몸이 경계 칸에 선 날** 기록을 넘긴다(합친 길 `split` 이 있을 때 — 보고/T533).
//     ⚠T534 결 넷(`T534_KNOB`)은 그대로 돈다 — 다만 `lag0` 의 되돌이가 설계 B 꼴이 됐다(econ 이 받는 쪽에서 한 경계 늦음 −1 을 이미 뺀다 ⇒ 같은 날 닿는 A → B 기록만 +1).
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

// ── 지형 어댑터·합친 BFS — `server/xzone-geo.js` 한 벌(존 서버 경계 호스트가 워커로 부르는 그 함수 · T533 이 이 자에서 옮겼다 · 사본 0) ──
//   ⚠해안선 띠 기본 = t17 계보(한반도 끔 · `T17_COAST`) — 부르는 쪽이 안 주면 그 기본(존 서버 호스트는 `coast: true` 를 준다).
function _geo() {
  if (_geo.g) return _geo.g;
  process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
  process.env.DB_PATH = process.env.DB_PATH || `/tmp/t525-geo-${process.pid}.db`;
  _geo.g = R('server/xzone-geo')._mods();
  return _geo.g;
}
const XG = () => { _geo(); return R('server/xzone-geo'); };
function zoneAdapter(Z) { return XG().zoneAdapter(Z); }
function unionAdapter(zs) { return XG().unionAdapter(zs); }
function bfsMatrix(ta, ZONE, coords) { return XG().bfsMatrix(ta, ZONE, coords); }

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

// ═══ ★[T534 · 세션7 · 2026-09-30] 결 넷 — **자만** 스텁·기록의 꼴을 바꾼다(제품 `sim/`·`server/` 무접촉 · 팔은 `T525_CROSS_ZONE` 하나 그대로) ═══
//   `T534_KNOB` = 쉼표 목록(없으면 T525 판 그대로 — 바이트 동일):
//     lag0   — 하루 늦음 0: 하루를 조각(`tickWorldV2Parts` — T513 정본 조각)으로 두 워커가 나란히 돈다 ·
//              ① 두 존 마을 틱 뒤(교역 앞) **그날** 스냅을 건넨다(스냅 즉시) ② 캐러밴 조각은 A → B 차례(A 의 'arrive' 를 B 가 같은 날 치른다) ·
//              ③ 하루 늦게 닿는 기록(B → A)은 되돌아오는 'return' 의 남은 일수에서 하루를 뺀다(0 아래로는 못 뺀다 — 남은 늦음은 센다)
//     stale  — 스냅 시효 ∞(스텁 `_xzDay` = ∞ — `_xzStubData` 의 "하루 안" 거름이 늘 참)
//     supply — 세계 공급 두 존 합침: 이 존의 `_worldStockOf` 하루 캐시(`world._effDemCache`)가 새로 설 때 이웃 존의 **그 존 몫**(어제 캐시 · 정본이 센 것)을 먼저 얹는다
//     stack  — 후보 얹기: 제 존 top-20 + 걸음이 닿는 스텁 전부(T525 첫 판 · "20 + 스텁") — 워커 적재 순간 v2 글자 한 줄을 바꾼다(그 줄이 정확히 한 번 있어야 돈다)
const KNOBS = new Set(String(process.env.T534_KNOB || '').split(',').map((x) => x.trim()).filter(Boolean));
const STACK_FROM = '_nbList = _m.slice(0, 20).map((x) => x[1]);';
const STACK_TO = '_nbList = a.v._near20.concat(_m.filter((x) => x[1] && x[1]._xz).map((x) => x[1]));   /* [T534 stack — 자 적재 순간 바꿈] */';
function _stackPatch() {
  const Module = require('module');
  const _c = Module.prototype._compile;
  Module.prototype._compile = function (content, filename) {
    if (filename.endsWith(path.join('sim', 'economy-sim-v2.js'))) {
      const n = content.split(STACK_FROM).length - 1;
      if (n !== 1) throw new Error(`[T534 stack] 바꿀 줄이 ${n}번 있다(1번이어야 한다) — 정본이 바뀌었다`);
      content = content.replace(STACK_FROM, STACK_TO);
    }
    return _c.call(this, content, filename);
  };
}
// 마을 한 줄(판 끝) — t17 여덟 수의 **그 칸**을 마을마다(합은 t17 JSON 과 같아야 한다 — 표가 자기검사한다)
const RAWGRAIN = ['wheat', 'rice', 'barley', 'millet'];
function vilRows(w, border) {
  return (w.villages || []).map((v) => {
    const S = v.storage || {};
    return { name: v.name, border: border ? border.has(v.name) : null, pop: (v.npcs && v.npcs.length) || 0,
      grain: RAWGRAIN.map((r) => +(+(S[r] || 0)).toFixed(3)), expand: v.expansions || 0,
      toolQ: +((S.tool || 0) * (v._toolQ != null ? v._toolQ : 1)).toFixed(3), weapQ: +((S.weapon || 0) * (v._weapQ != null ? v._weapQ : 1)).toFixed(3) };
  });
}
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
//   ★[T533] 그 문 = 존 서버 경계 호스트의 핵심(`server/xzone.js createCore`) 그대로 — `dayIn`(econ 앞) · `dayOut`(econ 뒤) · 경계 `g` = 워커 날 수.
//     (T534 `lag0` 판만 오케스트라가 그날 스냅·기록을 조각 사이에 직접 건넨다 — 핵심의 "보낸 경계 다음 경계" 줄을 안 탄다.)
function _peerBoot() {
  const { workerData, receiveMessageOnPort } = require('worker_threads');
  const W = workerData.t525, port = W.port, flag = new Int32Array(W.flag);
  const recv = () => { for (;;) { const m = receiveMessageOnPort(port); if (m) return m.message; Atomics.wait(flag, 0, 0, 50); Atomics.store(flag, 0, 0); } };
  if (KNOBS.has('stack')) _stackPatch();         // ★[T534] v2 가 실리기 **전에**
  const econV2 = R('sim/economy-sim-v2');
  const Events = R('server/events');
  const XZ = R('server/xzone');
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
  let world = null, core = null, X = null, border = new Set(), peerZone = null, mine = null, g = 0;
  const st = { arriveOut: 0, returnOut: 0, arriveIn: 0, returnIn: 0, rows: [], cross: [], home: [] };
  const track = new Map();   // ★[T533] 넘어간 이 존 캐러밴 — 돌아와 곳간에 든 날·짐(존 서버 호스트 `track` 과 같은 뜻)
  //   ★[T534] 길 셋의 세기(읽기만) — ⓐ 제 마을이 스텁으로 낸 캐러밴(집 마을별) ⓑ 이웃 존 캐러밴이 이 존 마을에서 판 것(도착 마을별 · 우회 포함)
  const ch = { outBy: {}, inBy: {}, inAmt: {}, supHits: 0, supPop: 0 };
  //   ★[T534 supply] 이웃 존 몫(어제 · 그 존 정본 캐시에서 그 존 몫만) · 이 존 몫을 되돌려 보낼 칸
  let peerSupply = null, preSeed = null;
  const LAG0 = KNOBS.has('lag0'), STALE = KNOBS.has('stale'), SUPPLY = KNOBS.has('supply');
  function armSupply(w) {
    if (!SUPPLY || w._t534Supply) return;
    w._t534Supply = true;
    let cur = w._effDemCache;
    Object.defineProperty(w, '_effDemCache', { configurable: true, enumerable: false,
      get() { return cur; },
      set(c) {   // 정본이 새 날 캐시를 세우는 순간(아직 빈 그릇) — 이웃 존 몫을 먼저 담는다(정본 루프가 제 존 몫을 더한다)
        cur = c;
        preSeed = { day: c && c.day, stock: {}, pop: 0 };
        if (c && peerSupply) { ch.supHits++; ch.supPop = peerSupply.pop || 0; c.pop = (c.pop || 0) + (peerSupply.pop || 0); preSeed.pop = peerSupply.pop || 0;
          for (const k in peerSupply.stock) { c.stock[k] = (c.stock[k] || 0) + peerSupply.stock[k]; preSeed.stock[k] = peerSupply.stock[k]; } }
      } });
  }
  function ownSupply(w) {   // 이 존 몫 = 오늘 캐시 − 얹은 이웃 몫(캐시가 오늘 안 섰으면 null — 그날 아무도 안 물었다)
    if (!SUPPLY) return null;
    const c = w._effDemCache; if (!c || c.day !== w.day) return null;
    const o = { stock: {}, pop: (c.pop || 0) - ((preSeed && preSeed.day === c.day) ? preSeed.pop : 0) };
    for (const k in c.stock) { const v = c.stock[k] - ((preSeed && preSeed.day === c.day && preSeed.stock[k]) || 0); if (v > 0) o.stock[k] = v; }
    return o;
  }
  function countRows(w, out) {
    for (const r of out) if (r.kind === 'arrive') { const h = r.home && r.home.name; if (h) ch.outBy[h] = (ch.outBy[h] || 0) + 1; }
    const TL = w.tradeLog || [];
    for (let i = TL.length - 1; i >= 0; i--) {
      const e = TL[i]; if ((e.day | 0) !== (w.day | 0)) { if ((e.day | 0) < (w.day | 0)) break; else continue; }
      if (!e.xzone || e.xzone === W.zone || !mine.has(e.to)) continue;          // 이웃 존 캐러밴이 이 존 마을(e.to)에서 판 행
      ch.inBy[e.to] = (ch.inBy[e.to] || 0) + 1;
      ch.inAmt[e.to] = +((ch.inAmt[e.to] || 0) + (+(e.sent && e.sent.amt) || 0) + (+(e.bought && e.bought.amt) || 0)).toFixed(3);
    }
  }
  const inRec = (r) => { if (r.kind === 'arrive') st.arriveIn++; else st.returnIn++; };
  function homeTrack(w) {   // 귀환 갈래가 끝냈다(econ 이 걸렀다) — 상인이 살아 있으면 곳간에 든 것
    for (const [id, c] of track) {
      if (!c._done) continue;
      track.delete(id);
      const alive = !!(c.trader && c.from && Array.isArray(c.from.npcs) && c.from.npcs.indexOf(c.trader) >= 0);
      st.home.push({ day: w.day, id, alive, res: c._returningRes || null, amt: c._returningAmt || 0, res2: c._returningRes2 || null, amt2: c._returningAmt2 || 0, abandoned: !!c._abandoned, depart: c.departDay, T: c._xzT });
    }
  }
  function takeOut(w, out) {
    for (const r of out) {
      if (r.kind === 'arrive') {
        st.arriveOut++;
        const c = w.caravans.find((x) => x.id === r.id && x.state === 'xzone');
        if (c) { c._xzT = r.travelDays; track.set(r.id, c); }
        st.cross.push({ day: w.day, id: r.id, to: r.to, T: r.travelDays, remain: r.remain, fHome: r.fHome, depart: c ? c.departDay : null, pt: !!r.ptPeer, res: r.giveRes, amt: r.giveAmt, res2: r.giveRes2, amt2: r.giveAmt2 });
      }
      else { st.returnOut++; st.rows.push({ day: w.day, id: r.id, home: r.toZone, lastTo: r.lastTo, row: r.row, abandoned: r.abandoned, traderDead: r.traderDead, rerouted: r.rerouted || 0, ret: r.returningRes, retAmt: r.returningAmt, remain: r.remain }); }
    }
    countRows(w, out);
    return out;
  }
  //   ★[T534 lag0] 그날 스냅(마을 틱 뒤 · 교역 앞) — 경계 마을 = 핵심이 잰 제 쪽 경계
  const snapsNow = (w) => { const a = []; for (const v of w.villages) if (border.has(v.name)) a.push(econV2.xzoneSnapshot(v, w.day, false)); return a; };
  econV2.tickWorldV2 = function (w) {
    if (!world) {
      world = w;
      port.postMessage({ type: 'ready', zone: W.zone, villages: w.villages.map((v) => v.name), day: w.day });
      const init = recv();                      // { peerZone, geo(crossGeo 답 — 두 존 같은 한 벌), matrix? }
      peerZone = init.peerZone;
      mine = new Map(w.villages.map((v) => [v.name, v]));
      if (init.matrix) R('sim/economy-sim').setDistMatrix(w, init.matrix);   // T525_DIST=path — 존 안도 걸음(서버와 같다)
      core = XZ.createCore({ zone: W.zone, world: w, econV2, infoR: w.infoRange || INFO_R });
      core.setGeo(peerZone, init.geo);          // `w.xzone` 을 꽂는다(존 서버는 걸음표 워커가 끝난 뒤 같은 줄)
      X = core.X; border = core.G.get(peerZone).mine;
      armSupply(w);
    }
    g++;
    if (!LAG0) {
      const m = recv();                          // { snap: { gday, snaps }, recs: [{ gday, rec }], supply? } — 이웃이 어제 민 것
      if (m.snap) core.onSnap(peerZone, m.snap);
      for (const x of (m.recs || [])) { core.onRecord(x); inRec(x.rec); }
      if (m.supply !== undefined) peerSupply = m.supply;
      core.dayIn(g);
      if (STALE) for (const s of X.stubs) s._xzDay = Infinity;   // ★[T534 stale] 스냅 시효 ∞
      orig(w);
      homeTrack(w);
      const o = core.dayOut(g);
      takeOut(w, o.recs);
      port.postMessage({ type: 'day', day: w.day, g, out: o.recs, snaps: o.snaps[peerZone] || [], supply: ownSupply(w) });
      return;
    }
    //   ★[T534 lag0] 조각 — 정본 `tickWorldV2` 와 같은 차례(head → 마을 → 교역 → 캐러밴 → tail) · 사이에 문 둘
    const go = recv(); if (go.supply !== undefined) peerSupply = go.supply;   // 'go'
    const P = econV2.tickWorldV2Parts(w);
    P.head();
    for (const v of w.villages) P.village(v);
    port.postMessage({ type: 'pre', day: w.day, snaps: snapsNow(w) });   // 그날 마을 틱 뒤 · 교역 앞(스냅 즉시)
    const m1 = recv();
    X.stubs = (m1.stubs || []).map((s) => econV2.xzoneStub(s, peerZone, { _xzDay: STALE ? Infinity : w.day }));
    P.trade();
    port.postMessage({ type: 'traded', day: w.day });
    const m2 = recv();                             // 캐러밴 조각의 inbox(A = 어제 B 기록 · B = 오늘 A 기록)
    for (const r of (m2.inbox || [])) { X.inbox.push(r); inRec(r); }
    P.caravans();
    P.tail();
    homeTrack(w);
    const out = takeOut(w, X.out.splice(0));
    port.postMessage({ type: 'day', day: w.day, g, out, snaps: [], supply: ownSupply(w) });
  };
  try { require(path.join(__dirname, 't17-metrics.js')); } catch (e) { port.postMessage({ type: 'error', msg: String(e && e.stack || e) }); return; }
  port.postMessage({ type: 'done', zone: W.zone, stats: st, core: core ? core.st : null, events: evLog,
    tradeRows: (world && world.tradeLog || []).filter((t) => t.xzone).length,
    vil: world ? vilRows(world, border) : null, chan: ch, knobs: [...KNOBS] });
}

// ── 오케스트라 — 워커 둘(존 둘) · 하루마다 기록·스냅을 건넨다(존 서버라면 안 문 · 여기선 같은 호스트의 워커 사이) ──
async function twoMode(A, B, days, seed, out, opts) {
  opts = opts || {};
  const { Worker, MessageChannel } = require('worker_threads');
  const zs = [A, B];
  if (DISTMODE === 'euclid') throw new Error('T525_DIST=euclid 는 두 존 판에서 뺐다(T533 — 경계 칸·길이 합친 걸음표에서 온다)');
  const tag = opts.tag || `${A}+${B}-${seed}-${process.env.T525_CROSS_ZONE === '1' ? 'on' : 'off'}-${DISTMODE}${KNOBS.size ? '-' + [...KNOBS].sort().join('+') : ''}`;
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
  // ① 준비 — 두 세계가 섰다 → 합친 걸음표(경계 마을 · 경계 칸) 한 벌 — 존 서버 호스트가 워커로 잰 그 함수(`crossGeo`)
  const ready = {};
  for (const Z of zs) { const m = await next(Z); if (m.type !== 'ready') throw new Error(`${Z} 준비 실패: ${JSON.stringify(m).slice(0, 300)}`); ready[Z] = m; }
  const ros = (Z) => { const { seeds } = seedsOf(Z); return seeds.map((s2) => ({ name: s2.name, cx: s2.ccx, cy: s2.ccy })); };
  const [GA, GB] = A < B ? [A, B] : [B, A];   // 두 존 이름 순서 — 존 서버 호스트와 같은 한 벌
  const tg = Date.now();
  const geo = XG().crossGeo({ A: GA, rosterA: ros(GA), B: GB, rosterB: ros(GB) });
  const geoMs = Date.now() - tg;
  const border = { [A]: new Set(), [B]: new Set() };
  for (const a in geo.dist) for (const b in geo.dist[a]) { const d = geo.dist[a][b]; if (d != null && d <= INFO_R) { border[GA].add(a); border[GB].add(b); } }
  let mats = {};
  if (DISTMODE === 'path') for (const Z of zs) { const { ZONE, ta } = zoneAdapter(Z); const { vil } = frameOf([Z]); mats[Z] = bfsMatrix(ta, ZONE, vil.map((v) => ({ x: v.ccx * 2.5, y: v.ccy * 2.5 }))); }
  for (const Z of zs) send(Z, { peerZone: Z === A ? B : A, geo, matrix: mats[Z] || null });
  // ② 하루마다 — 어제 나간 기록·스냅을 오늘 건넨다(한 날 늦음 · 양쪽 같다 · 경계 `g` = 워커 날 수) · ★[T534 lag0] 이면 조각 문 셋(스냅 즉시 · A → B 캐러밴)
  let pend = { [A]: { snap: null, recs: [] }, [B]: { snap: null, recs: [] } };
  const X = { arrive: { [A]: 0, [B]: 0 }, ret: { [A]: 0, [B]: 0 }, done: {}, events: {}, daily: [], lagLeft: 0, lagFixed: 0 };
  const wantMsg = async (Z, type) => { const m = await next(Z); if (m.type === 'error') throw new Error(`${Z}: ${m.msg}`); if (m.type !== type) throw new Error(`${Z} 문 어긋남: ${m.type} ≠ ${type}`); return m; };
  //   ★[T533 · lag0 되돌이] 설계 B 의 econ 은 받는 쪽에서 한 경계 늦음(−1)을 이미 뺀다 — 하루 늦게 닿는 기록(B → A)은 그대로 두고,
  //     **같은 날** 닿는 기록(A → B)만 그 −1 을 되돌린다(남은 일수 +1 · T534 판의 'return' −1 되돌이와 같은 뜻을 설계 B 꼴로).
  const sameDay = (r) => { if (r.remain == null) { X.lagLeft++; return r; } X.lagFixed++; return Object.assign({}, r, { remain: r.remain + 1 }); };
  let sup = { [A]: null, [B]: null };
  if (!KNOBS.has('lag0')) {
    for (let d = 0; d < days; d++) {
      for (const Z of zs) send(Z, Object.assign({}, pend[Z], KNOBS.has('supply') ? { supply: sup[Z === A ? B : A] } : {}));
      const got = {};
      for (const Z of zs) got[Z] = await wantMsg(Z, 'day');
      pend = { [A]: { snap: { gday: got[B].g, snaps: got[B].snaps }, recs: [] }, [B]: { snap: { gday: got[A].g, snaps: got[A].snaps }, recs: [] } };
      for (const Z of zs) { sup[Z] = got[Z].supply || null; for (const r of got[Z].out) { const to = r.toZone; if (pend[to]) pend[to].recs.push({ gday: got[Z].g, rec: r }); if (r.kind === 'arrive') X.arrive[Z]++; else X.ret[Z]++; } }
    }
  } else {
    let inA = [];   // B 가 어제 낸 기록(A 는 오늘 캐러밴 조각에서 치른다 — 하루 늦음 = econ 의 −1)
    for (let d = 0; d < days; d++) {
      for (const Z of zs) send(Z, KNOBS.has('supply') ? { supply: sup[Z === A ? B : A] } : {});
      const pre = {};
      for (const Z of zs) pre[Z] = await wantMsg(Z, 'pre');
      send(A, { stubs: pre[B].snaps }); send(B, { stubs: pre[A].snaps });
      for (const Z of zs) await wantMsg(Z, 'traded');
      send(A, { inbox: inA });
      const gA = await wantMsg(A, 'day');
      send(B, { inbox: gA.out.filter((r) => r.toZone === B).map(sameDay) });   // A 가 오늘 낸 기록 — B 가 같은 날 치른다
      const gB = await wantMsg(B, 'day');
      inA = gB.out.filter((r) => r.toZone === A);
      for (const [Z, gg] of [[A, gA], [B, gB]]) { sup[Z] = gg.supply || null; for (const r of gg.out) { if (r.kind === 'arrive') X.arrive[Z]++; else X.ret[Z]++; } }
    }
  }
  for (const Z of zs) { const m = await next(Z); if (m.type === 'error') throw new Error(`${Z}: ${m.msg}`); X.done[Z] = m; }
  for (const Z of zs) { try { await W[Z].w.terminate(); } catch (e) {} }
  const eight = {};
  for (const Z of zs) { try { eight[Z] = JSON.parse(fs.readFileSync(path.join(dir, `${tag}.${Z}.json`), 'utf8')); } catch (e) { eight[Z] = null; } }
  const res = { tag, zones: zs, days, seed, arm: process.env.T525_CROSS_ZONE === '1', dist: DISTMODE, ms: Date.now() - t0,
    geo: { A: GA, B: GB, ms: geo.ms, wallMs: geoMs, routed: geo.routed, failed: geo.failed },
    border: { [A]: [...border[A]], [B]: [...border[B]] }, crossed: X.arrive, returned: X.ret,
    stats: { [A]: X.done[A].stats, [B]: X.done[B].stats }, core: { [A]: X.done[A].core, [B]: X.done[B].core },
    events: { [A]: X.done[A].events, [B]: X.done[B].events }, eight,
    knobs: [...KNOBS], lag: { fixed: X.lagFixed, left: X.lagLeft },
    vil: { [A]: X.done[A].vil, [B]: X.done[B].vil }, chan: { [A]: X.done[A].chan, [B]: X.done[B].chan } };
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
  const res = { tag, zones: [A, B], days, seed, dist: DISTMODE, cross: msg.cross, eight, vil: msg.vil || null };
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
  let first = true, n = 0, sent = 0, bought = 0, W0 = null;
  econV2.tickWorldV2 = function (w) {
    W0 = w;
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
  port.postMessage({ type: 'done', cross: { trades: n, pairs, items, sent: +sent.toFixed(1), bought: +bought.toFixed(1) },
    vil: W0 ? vilRows(W0, null).map((r) => Object.assign(r, { zone: M.zoneOf[r.name] || null })) : null });   // ★[T534] 마을 한 줄(판 끝)
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

// ── ★[T534] 표 — ① 분해(켬 − 끔 · 마을 × 품목 · 경계 몫 · 경계 밖 길) ② 결 넷의 합친 판 거리 ③ 기준선 후보(두 존 합 · 한반도) ─────────
//   판 JSON = 이 자의 `two`/`merged` 산출(`--out`) · 파일 이름 `<팔>-<씨>.json`(팔 = off·on·merged·lag0·stale·supply·stack).
//   ⚠판정 0 — 표만. "값이다/결이다" 는 ② 의 거리가 말한다(카드 §3).
function t534Table(dir, md) {
  const SEEDS = [1020, 7, 42], ARMS = ['off', 'on', 'merged', 'lag0', 'stale', 'supply', 'stack', 'all'];   // all = lag0+supply+stack 한꺼번에
  const Z2 = ['hanbando', 'nippon'];
  const J = {};
  for (const a of ARMS) for (const sd of SEEDS) { try { J[`${a}-${sd}`] = JSON.parse(fs.readFileSync(path.join(dir, `${a}-${sd}.json`), 'utf8')); } catch (e) {} }
  const row = (a) => md ? '| ' + a.join(' | ') + ' |' : a.join('\t');
  const hdr = (a) => md ? [row(a), row(a.map(() => '---'))] : [row(a)];
  const L = [];
  const pct = (x, b) => (b ? ((x / b - 1) * 100) : 0);
  const f1 = (x) => (x == null ? '—' : (Math.abs(x) >= 1000 ? Math.round(x).toLocaleString('en-US') : (+x).toFixed(1)));
  const sg = (p) => (p >= 0 ? '+' : '') + p.toFixed(1) + '%';
  //   두 존 합 여덟 수(`two` = 존마다 t17 JSON 합 · `merged` = 한 세계 t17 JSON) — 인구·무기Q·확장셀·게시·도구Q·보존식·생곡
  const KEYS = [['pop', (e) => e.base.pop], ['weapQ', (e) => e.base.weapQ], ['expand', (e) => e.base.expand], ['board', (e) => e.board.reqOpened],
    ['toolQ', (e) => e.tool.q], ['preserve', (e) => e.preserve.stock], ['grain', (e) => e.eight && e.eight.grain]];
  const sum2 = (r) => { if (!r) return null; if (r.eight && r.eight.base) return Object.fromEntries(KEYS.map(([k, g]) => [k, +g(r.eight)]));
    const o = {}; for (const [k, g] of KEYS) o[k] = Z2.reduce((a, Z) => a + (r.eight && r.eight[Z] ? +g(r.eight[Z]) : NaN), 0); return o; };
  const zoneOf = (r, Z) => (r && r.eight && r.eight[Z]) ? Object.fromEntries(KEYS.map(([k, g]) => [k, +g(r.eight[Z])])) : null;
  // ── 자기검사: 마을 줄의 합 = t17 JSON(인구·확장셀·도구Q·무기Q·생곡)
  L.push('## 자기검사 — 마을 줄 합 = t17 JSON'); let bad = 0, chk = 0;
  for (const k in J) { const r = J[k]; if (!r.vil) continue;
    const zs = r.eight && r.eight.base ? [null] : Z2;
    for (const Z of zs) { const V = Z ? r.vil[Z] : r.vil, E = Z ? r.eight[Z] : r.eight; if (!V || !E) continue; chk++;
      const s = (f) => V.reduce((a, v) => a + f(v), 0);
      const ok = s((v) => v.pop) === E.base.pop && s((v) => v.expand) === E.base.expand && Math.abs(s((v) => v.grain.reduce((a, b) => a + b, 0)) - E.eight.grain) < 0.5
        && Math.abs(s((v) => v.toolQ) - E.tool.q) < 0.5 && Math.abs(Math.round(s((v) => v.weapQ)) - E.base.weapQ) <= 1;
      if (!ok) { bad++; L.push(`  ✗ ${k} ${Z || ''}`); } } }
  L.push(`  ${chk - bad}/${chk} 같다`);
  // ── ① 분해 — 켬 − 끔
  L.push('', '## ① 분해 — 켬(다툼) − 끔 · 마을별 × 품목(생곡 넷 · 확장셀 · 도구Q)');
  L.push(...hdr(['씨', '품목', 'Δ 두 존 합', 'Δ 경계 26', 'Δ 경계 밖', '경계 몫(|Δ| 질량)', '경계 밖 중 직접 닿은 마을 몫(|Δ|)', '경계 밖 직접 마을 수', '경계 밖 간접 마을 |Δ|']));
  const DEC = {};
  for (const sd of SEEDS) {
    const on = J[`on-${sd}`], off = J[`off-${sd}`]; if (!on || !off || !on.vil || !off.vil) continue;
    const items = [['생곡', (v) => v.grain.reduce((a, b) => a + b, 0)], ['밀', (v) => v.grain[0]], ['쌀', (v) => v.grain[1]], ['보리', (v) => v.grain[2]], ['기장', (v) => v.grain[3]],
      ['확장셀', (v) => v.expand], ['도구Q', (v) => v.toolQ], ['인구', (v) => v.pop]];
    for (const [nm, g] of items) {
      let dAll = 0, dB = 0, dN = 0, mAll = 0, mB = 0, mDir = 0, mInd = 0, nDir = 0;
      for (const Z of Z2) {
        const offBy = new Map(off.vil[Z].map((v) => [v.name, v]));
        const C = on.chan && on.chan[Z] || {};
        for (const v of on.vil[Z]) { const o = offBy.get(v.name); if (!o) continue; const d = g(v) - g(o);
          dAll += d; mAll += Math.abs(d);
          if (v.border) { dB += d; mB += Math.abs(d); }
          else { dN += d; const direct = ((C.outBy || {})[v.name] || 0) + ((C.inBy || {})[v.name] || 0) > 0;
            if (direct) { mDir += Math.abs(d); if (nm === '생곡') nDir++; } else mInd += Math.abs(d); } }
      }
      (DEC[sd] || (DEC[sd] = {}))[nm] = { dAll, dB, dN, mAll, mB, mDir, mInd };
      L.push(row([sd, nm, f1(dAll), f1(dB), f1(dN), mAll ? (mB / mAll * 100).toFixed(1) + '%' : '—', (mAll - mB) ? (mDir / (mAll - mB) * 100).toFixed(1) + '%' : '—', nm === '생곡' ? nDir : '', f1(mInd)]));
    }
  }
  //   길 — 경계 밖 마을이 직접 닿은 세기(제 캐러밴이 스텁으로 · 이웃 존 캐러밴이 우회해 와서 판 것)
  L.push('', '### 경계 밖 마을의 길(켬 · 800일 누계)');
  L.push(...hdr(['씨', '존', '경계 마을 스텁행', '경계 밖 스텁행(마을 수)', '이웃 캐러밴 판매 — 경계', '— 경계 밖(우회 · 마을 수)']));
  for (const sd of SEEDS) { const on = J[`on-${sd}`]; if (!on || !on.chan) continue;
    for (const Z of Z2) { const C = on.chan[Z], B = new Set((on.vil[Z] || []).filter((v) => v.border).map((v) => v.name));
      let ob = 0, on_ = 0, onN = 0, ib = 0, in_ = 0, inN = 0;
      for (const [n, c] of Object.entries(C.outBy || {})) { if (B.has(n)) ob += c; else { on_ += c; onN++; } }
      for (const [n, c] of Object.entries(C.inBy || {})) { if (B.has(n)) ib += c; else { in_ += c; inN++; } }
      L.push(row([sd, Z, ob, `${on_} (${onN})`, ib, `${in_} (${inN})`])); } }
  // ── ② 결 넷 — 두 존 합 · 끔 대비 % · 합친 판과의 거리
  L.push('', '## ② 결 넷 — 두 존 합(한반도+닛폰) · 끔 대비 % · 합친 판과의 거리(일곱 수 |켬 − 합친| ÷ 끔 평균 %p)');
  L.push(...hdr(['씨', '판', ...KEYS.map((k) => k[0]), '합친 판 거리']));
  const DIST = {};
  for (const sd of SEEDS) {
    const off = sum2(J[`off-${sd}`]), mg = sum2(J[`merged-${sd}`]); if (!off) continue;
    for (const a of ARMS) { const x = sum2(J[`${a}-${sd}`]); if (!x) continue;
      const dist = mg ? KEYS.reduce((acc, [k]) => acc + Math.abs(x[k] - mg[k]) / (off[k] || 1) * 100, 0) / KEYS.length : null;
      (DIST[a] || (DIST[a] = [])).push(dist);
      L.push(row([sd, a, ...KEYS.map(([k]) => (a === 'off' ? f1(x[k]) : sg(pct(x[k], off[k])))), dist == null ? '—' : dist.toFixed(2) + '%p'])); } }
  L.push('', '### 거리 3시드 평균(작을수록 합친 판에 붙는다)');
  L.push(...hdr(['판', '1020', '7', '42', '평균']));
  for (const a of ARMS) { const d = DIST[a]; if (!d) continue; L.push(row([a, ...d.map((x) => x == null ? '—' : x.toFixed(2)), (d.reduce((p, q) => p + q, 0) / d.length).toFixed(2)])); }
  //   방향 — 켬 대비 각 결 판이 합친 판 쪽으로 몇 수가 옮았나(일곱 수 × 3시드)
  L.push('', '### 켬 → 결 판: 합친 판 쪽으로 옮은 수(일곱 수 × 3시드 = 21)');
  for (const a of ['lag0', 'stale', 'supply', 'stack', 'all']) { let toward = 0, n = 0, same = 0;
    for (const sd of SEEDS) { const on = sum2(J[`on-${sd}`]), x = sum2(J[`${a}-${sd}`]), mg = sum2(J[`merged-${sd}`]); if (!on || !x || !mg) continue;
      for (const [k] of KEYS) { n++; if (x[k] === on[k]) { same++; continue; } if (Math.abs(x[k] - mg[k]) < Math.abs(on[k] - mg[k])) toward++; } }
    L.push(`  ${a}: 합친 쪽 ${toward}/${n} · 켬과 같음 ${same}`); }
  //   열린 판 전부(켬 · 결 셋 · 결 셋 한꺼번에 · 합친 판 — stale 은 켬과 바이트 같아 뺀다) × 3시드 — 수마다 부호·평균·폭(끔 대비 %)
  L.push('', '### 열린 판 여섯(on·lag0·supply·stack·all·merged) × 3시드 = 18 — 끔 대비 %: 내린 판 수 · 평균 · 최소~최대 · 씨마다 폭(여섯 판 max−min 평균)');
  L.push(...hdr(['수', '내린 판', '평균', '최소 ~ 최대', '씨 안 폭(평균)']));
  const OPEN = ['on', 'lag0', 'supply', 'stack', 'all', 'merged'];
  for (const [k] of KEYS) { const xs = [], spans = [];
    for (const sd of SEEDS) { const off = sum2(J[`off-${sd}`]); if (!off) continue; const ys = [];
      for (const a of OPEN) { const x = sum2(J[`${a}-${sd}`]); if (x) { const p = pct(x[k], off[k]); xs.push(p); ys.push(p); } }
      if (ys.length) spans.push(Math.max(...ys) - Math.min(...ys)); }
    if (!xs.length) continue;
    L.push(row([k, `${xs.filter((x) => x < 0).length}/${xs.length}`, sg(xs.reduce((a, b) => a + b, 0) / xs.length), `${sg(Math.min(...xs))} ~ ${sg(Math.max(...xs))}`, (spans.reduce((a, b) => a + b, 0) / spans.length).toFixed(1) + '%p'])); }
  // ── ③ 기준선 후보 — 두 존 합 · 한반도 몫
  L.push('', '## ③ 기준선 후보 — 존별 여덟 수(끔 · 켬 · 합친 판 — 합친 판 존별은 마을 줄 합: 인구·무기Q·확장셀·도구Q·생곡)');
  L.push(...hdr(['씨', '판', '존', '인구', '소멸', '무기Q', '확장셀', '게시', '도구Q', '보존식', '생곡']));
  for (const sd of SEEDS) for (const a of ['off', 'on', 'merged']) { const r = J[`${a}-${sd}`]; if (!r) continue;
    if (a !== 'merged') { for (const Z of Z2) { const e = r.eight[Z]; if (!e) continue; L.push(row([sd, a, Z, e.base.pop, `${e.base.dead}/${e.base.ever}`, e.base.weapQ, e.base.expand, e.board.reqOpened, f1(e.tool.q), f1(e.preserve.stock), f1(e.eight.grain)])); } }
    else if (r.vil) { for (const Z of Z2) { const V = r.vil.filter((v) => v.zone === Z); const s = (g) => V.reduce((p, v) => p + g(v), 0);
      L.push(row([sd, a, Z, s((v) => v.pop), `${V.filter((v) => v.pop === 0).length}/${V.length}`, Math.round(s((v) => v.weapQ)), s((v) => v.expand), '(한 세계)', f1(s((v) => v.toolQ)), '(한 세계)', f1(s((v) => v.grain.reduce((p, q) => p + q, 0)))])); } } }
  const text = L.join('\n');
  console.log(text);
  try { fs.writeFileSync(path.join(dir, md ? 't534-table.md' : 't534-table.txt'), text); } catch (e) {}
  return { DEC, DIST };
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
  if (mode === 't534') { t534Table(pos[1] || '/tmp/t534/runs', pos[2] === 'md'); return; }
  say('쓰는 법: pairs <A> <B> | merged <A> <B> <날> <씨> | two <A> <B> <날> <씨> | rumor <two 판 JSON>  [--out f.json]');
}

// 워커로 떴나 · 모듈로 불렸나 · 입구인가
let _wd = null; try { _wd = require('worker_threads').workerData; } catch (e) {}
if (_wd && _wd.t525) _peerBoot();
else if (_wd && _wd.t525m) _mergedBoot();
else if (require.main === module) _main();
module.exports = { orchestrateFromT17, pairsMode, twoMode, mergedMode, rumorMode, crossTable, unionAdapter, zoneAdapter, frameOf, bfsMatrix, INFO_R };
