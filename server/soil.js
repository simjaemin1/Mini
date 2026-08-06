// =============================================================================
// server/soil.js — [배치 20 B] 동적 토양치 + 지질 플래그 (타일 상태계 3·1 축)
//   재민 확정: *"비옥도에 따라 모든 타일이 디자인이 바뀌어야… 번영도·경작·길·채굴에 따라서도."*
//
// 무엇:
//   · 저장 = 희소 Map(**기준선에서 벗어난 셀만**): 정수키 cy*cellsW+cx → {v, d, geo, ore}.
//     mined_cells 의 lazy 패턴 그대로 — 만땅 회복 시 레코드 삭제(단 geo 가 붙은 셀은 남긴다).
//   · ★일괄 리젠 패스 금지(roads.js 와 같은 성능 계약): 리젠은 **접근 시에만**
//     v += REGEN_PER_DAY × 경과일, 기준선 상한. 기준선은 `public/soil-base.js` 공용 1부.
//   · 지형 무접촉: 이 모듈은 terrain 을 직접 읽지 않는다. zone.js 가 정본 술어로 만든
//     `kindAt(cx,cy) → 'water'|'rock'|'land'` 를 주입한다.
//   · 채굴 축(ore)은 **거울**이다 — 정본은 zone.js minedCells. 여기서는 절대 쓰지 않고
//     받아 적기만 하며 DB 에도 안 남긴다(부팅 때 정본에서 다시 채운다). 두 번째 작성자 금지.
//   · DB 영속: zone-local-db soil_cells — dirty 배치 플러시(게임일 1회, roads 동형).
//   · 클라: welcome soil(변경 셀 전체) + 게임일 1회 `tile_state` 변경분 broadcast.
//     대역 방어로 토양치는 Q=16 눈금으로 양자화해 **눈금이 바뀔 때만** 보낸다
//     (안 그러면 리젠 12/일 때문에 매일 전 셀이 변경분이 된다).
//
// 가드레일: ENABLE_SOIL=0 → init/갱신/틱 전부 no-op(기준선만 남아 지금 라이브와 동일한 그림).
//   RNG 무소비. econ 무접촉(`sim/fertility.js` 는 한 바이트도 안 건드린다 — 그건 마을 선별
//   정적 정본이고 이 파일은 렌더 상태다. 이름이 비슷할 뿐 남남이다).
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_SOIL !== '0';
const SB = require('../public/soil-base.js');

const SZ = 32;
const Q = 16;               // 방송 양자화 눈금(0..1000 → 0..62)
const ORE_Q = 64;           // 채굴 거울 양자화(0..1000 → 0..15)

const S = {
  ready: false, zoneId: null, db: null, broadcast: null, kindAt: null,
  cellsW: 0, cellsH: 0,
  cells: new Map(),      // k → {v, d, geo, ore}   (ore: 0..15, 15=만땅/미채굴)
  dirty: new Set(),      // 이번 게임일 변경 키(DB 플러시 + 방송 diff 대상)
  sent: new Map(),       // k → 마지막 방송 [qv, geo, ore]
  epoch: 0, dayMs: 1, lastDay: -1,
  stats: { touched: 0, cellsTotal: 0, ruins: 0 },
};

function dayNow() { return Math.floor((Date.now() - S.epoch) / S.dayMs); }
function kOf(cx, cy) { return cy * S.cellsW + cx; }
function _inb(cx, cy) { return cx >= 0 && cy >= 0 && cx < S.cellsW && cy < S.cellsH; }

// 기준 토양치 — 정본 술어로 판정한 지형 종류 + 공용 1부. 캐시 없음(호출이 셀 단위로 드물다).
function baseAt(cx, cy) {
  const kind = S.kindAt ? S.kindAt(cx, cy) : 'land';
  return SB.baseAt(kind, cx, cy);
}

// 접근 시 게으른 리젠 + 소멸 프룬(roads.js `_get` 동형)
function _get(k, cx, cy, t) {
  const r = S.cells.get(k); if (!r) return null;
  if (t > r.d) {
    const base = baseAt(cx, cy);
    r.v = SB.regen(r.v, t - r.d, base); r.d = t;
    S.dirty.add(k);
    // ★기준선 복귀 = 레코드 삭제(희소 유지). 단 지질(geo)·채굴 거울(ore)이 있으면 남긴다 —
    //   지질은 회복되지 않고, ore 는 정본의 거울이라 여기서 지우면 그림이 통째로 되돌아간다.
    if (r.v >= base - 0.5 && !r.geo && (r.ore == null || r.ore >= 15)) { S.cells.delete(k); return null; }
  }
  return r;
}
function _ensure(k, cx, cy, t) {
  if (S.cells.has(k)) {
    const g = _get(k, cx, cy, t);          // 리젠 적용본. null 이면 기준선 복귀로 프룬된 것
    if (g) return g;
  }
  const r = { v: baseAt(cx, cy), d: t, geo: 0, ore: 15 };
  S.cells.set(k, r); S.stats.touched++;
  return r;
}

// ── 조회 ────────────────────────────────────────────────────────────────────
function soilAt(cx, cy) {
  if (!S.ready) return SB.baseAt('land', cx, cy);
  if (!_inb(cx, cy)) return baseAt(cx, cy);
  const r = _get(kOf(cx, cy), cx, cy, dayNow());
  return r ? r.v : baseAt(cx, cy);
}
function geoAt(cx, cy) {
  if (!S.ready || !_inb(cx, cy)) return 0;
  const r = S.cells.get(kOf(cx, cy));
  return r ? (r.geo | 0) : 0;
}

// ── 갱신 ────────────────────────────────────────────────────────────────────
// 파기(경작·터파기·밟아 뭉갬 등) — 토양치를 내린다. amt 는 0..1000 눈금.
function dig(cx, cy, amt) {
  if (!S.ready || !_inb(cx, cy) || !(amt > 0)) return;
  const k = kOf(cx, cy), t = dayNow(), r = _ensure(k, cx, cy, t);
  r.v = Math.max(0, r.v - amt); r.d = t; S.dirty.add(k);
}
// 되살림(퇴비·휴경 보정 등) — 기준선을 넘지 않는다.
function enrich(cx, cy, amt) {
  if (!S.ready || !_inb(cx, cy) || !(amt > 0)) return;
  const k = kOf(cx, cy), t = dayNow(), r = _ensure(k, cx, cy, t);
  r.v = Math.min(baseAt(cx, cy), r.v + amt); r.d = t; S.dirty.add(k);
}
// ★산 파괴 셀 — 지질 플래그 + 토양치 800 에서 시작(재민 확정).
//   ⚠산을 부수는 **게임 메커니즘은 아직 서버에 없다**(배치 20 §A-6 실측 결과: 0건).
//   이 함수는 그 이벤트의 **규격**이다 — 메커니즘이 생기면 여기로 들어오면 된다.
function markMountainRuin(cx, cy) {
  if (!S.ready || !_inb(cx, cy)) return;
  const k = kOf(cx, cy), t = dayNow(), r = _ensure(k, cx, cy, t);
  if (!r.geo) S.stats.ruins++;
  r.geo = 1; r.v = SB.RUIN_SOIL; r.d = t; S.dirty.add(k);
}
// 채굴 거울 — 정본(zone.js minedCells)이 바뀔 때 불러 준다. **DB 에 안 남긴다**.
function mirrorOre(cx, cy, stock, oreK) {
  if (!S.ready || !_inb(cx, cy)) return;
  const q = Math.max(0, Math.min(15, Math.round((stock / (oreK || 1000)) * 15)));
  const k = kOf(cx, cy), t = dayNow(), r = _ensure(k, cx, cy, t);
  if (r.ore === q) return;
  r.ore = q; S.dirty.add(k);
}

// ── 클라 전송 ───────────────────────────────────────────────────────────────
function _pack(r) { return [Math.round(r.v / Q), r.geo | 0, r.ore == null ? 15 : r.ore]; }
// welcome 1회 — 기준선에서 벗어난 셀 전체 flat [cx,cy,qv,geo,ore,...]
function clientSoil() {
  if (!S.ready || !S.cells.size) return null;
  const t = dayNow(), out = [];
  for (const [k, r0] of [...S.cells]) {
    const cx = k % S.cellsW, cy = (k / S.cellsW) | 0;
    const r = _get(k, cx, cy, t); if (!r) continue;
    const p = _pack(r);
    S.sent.set(k, p);
    out.push(cx, cy, p[0], p[1], p[2]);
  }
  return out.length ? out : null;
}
function flushDaily() {
  if (!S.dirty.size) return { rows: 0, sentN: 0 };
  const db = S.db;
  let rows = 0;
  db.db.exec('BEGIN');
  try {
    for (const k of S.dirty) {
      const r = S.cells.get(k);
      // ★기준선 상태(지질 없음 + 토양치 만땅)는 행을 안 남긴다 — 채굴 거울만 붙은 셀이
      //   DB 를 부풀리지 않게. 거울은 부팅 때 정본에서 다시 채워진다.
      const cx = k % S.cellsW, cy = (k / S.cellsW) | 0;
      if (r && (r.geo || r.v < baseAt(cx, cy) - 0.5)) db.upsertSoilCell(S.zoneId, k, r.v, r.d, r.geo);
      else db.deleteSoilCell(S.zoneId, k);
      rows++;
    }
    db.db.exec('COMMIT');
  } catch (e) {
    try { db.db.exec('ROLLBACK'); } catch (_) { }
    console.error(`[${S.zoneId}] 🌱 토양치 저장 실패(다음 날 재시도):`, e.message);
    return { rows: 0, sentN: 0 };
  }
  // 변경분 diff — **양자화 눈금이 바뀐 셀만**(리젠 때문에 매일 전 셀이 뜨는 것을 막는다)
  const changed = [];
  for (const k of S.dirty) {
    const r = S.cells.get(k);
    const cx = k % S.cellsW, cy = (k / S.cellsW) | 0;
    const p = r ? _pack(r) : null;
    const o = S.sent.get(k);
    if (!p) { if (o) { S.sent.delete(k); changed.push(cx, cy, -1, 0, 15); } continue; }
    if (o && o[0] === p[0] && o[1] === p[1] && o[2] === p[2]) continue;
    S.sent.set(k, p); changed.push(cx, cy, p[0], p[1], p[2]);
  }
  S.dirty.clear();
  if (changed.length && S.broadcast) { try { S.broadcast({ type: 'tile_state', cells: changed }); } catch (_) { } }
  return { rows, sentN: changed.length / 5 };
}

function init(deps) { // deps: { zoneId, cellsW, cellsH, epoch, dayMs, broadcast, kindAt, oreSeed }
  if (!ENABLED) { console.log(`[${(deps && deps.zoneId) || 'zone'}] 🌱 soil: ENABLE_SOIL=0 — 비활성(기준선만)`); return; }
  try {
    S.zoneId = deps.zoneId; S.cellsW = deps.cellsW; S.cellsH = deps.cellsH;
    S.epoch = deps.epoch || 0; S.dayMs = deps.dayMs || 600000;
    S.broadcast = deps.broadcast || null; S.kindAt = deps.kindAt || null;
    S.db = require('./zone-local-db');
    const t0 = Date.now();
    const rows = S.db.getSoilCells(S.zoneId);
    const tNow = Math.floor((Date.now() - S.epoch) / S.dayMs);
    // ★미래 일번호 방어(roads.js 와 같은 사고) — dayLengthMs 를 바꾸면 저장된 d 가 미래가 되어
    //   리젠이 멈춘다. 오늘로 클램프한다(1회성 이행).
    for (const r of rows) S.cells.set(r.cell_key | 0, { v: r.v, d: Math.min(r.d | 0, tNow), geo: r.geo | 0, ore: 15 });
    // 채굴 거울 초기 적재 — 정본에서 **읽기만** 한다.
    let oreN = 0;
    if (typeof deps.oreSeed === 'function') {
      try {
        for (const [cx, cy, stock, oreK] of deps.oreSeed()) {
          if (!_inb(cx, cy)) continue;
          const k = kOf(cx, cy);
          const q = Math.max(0, Math.min(15, Math.round((stock / (oreK || 1000)) * 15)));
          if (q >= 15) continue;
          let r = S.cells.get(k);
          if (!r) { r = { v: SB.baseAt(S.kindAt ? S.kindAt(cx, cy) : 'land', cx, cy), d: tNow, geo: 0, ore: q }; S.cells.set(k, r); }
          else r.ore = q;
          oreN++;
        }
      } catch (e) { console.error('[soil] 채굴 거울 적재 실패(계속):', e.message); }
    }
    S.lastDay = tNow;
    S.stats.cellsTotal = S.cells.size;
    S.stats.ruins = [...S.cells.values()].filter((r) => r.geo).length;
    S.ready = true;
    console.log(`[${S.zoneId}] 🌱 동적 토양치 준비(배치 20 B): 복원 ${rows.length}셀(산터 ${S.stats.ruins}) · 채굴 거울 ${oreN}셀 · 리젠 ${SB.REGEN_PER_DAY}/일 · ${Date.now() - t0}ms`);
  } catch (e) { S.ready = false; console.error('[soil] init 실패 (존 부팅은 계속):', e.message); }
}
function onGameTick(now) {
  if (!S.ready) return;
  const day = Math.floor((now - S.epoch) / S.dayMs);
  if (day === S.lastDay) return;
  S.lastDay = day;
  try {
    const f = flushDaily();
    S.stats.cellsTotal = S.cells.size;
    if (f.rows) console.log(`[${S.zoneId}] 🌱 토양치 day ${day}: 셀 ${S.cells.size}(산터 ${S.stats.ruins}) · 저장 ${f.rows}행 · 클라 변경 ${f.sentN}셀`);
  } catch (e) { console.error(`[${S.zoneId}] 🌱 토양치 데일리 실패:`, e.message); }
}

module.exports = {
  init, onGameTick, soilAt, geoAt, dig, enrich, markMountainRuin, mirrorOre,
  clientSoil, flushDaily, baseAt, ENABLED, Q, _S: S,
};
