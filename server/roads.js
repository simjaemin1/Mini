// =============================================================================
// server/roads.js — §16 답압 길 캐논 본체 이식(4파): "길은 배치되지 않는다, 걸어서 생긴다"
//   랩 전쟁실험실.html 4981~5002(ROADS·게으른 감쇠·등급) 서버 어댑터 — 계수 verbatim(보정 금지).
//
// 무엇:
//   · 저장 = 희소 Map(밟힌 셀만): 정수키 cy*cellsW+cx → {v:강도, d:마지막 접근일}.
//   · ★일일 일괄 감쇠 패스 금지(성능 계약 — 랩 동일): 감쇠는 접근(스탬프·조회) 시에만 v×=0.995^경과일(반감 ~138일).
//     v<1 = 풀로 복귀(삭제 — 희소성 유지). 등급 T1=8 흙길 · T2=28 다져진 길 · 상한 120.
//   · 스탬프 원천(서버 이동 지점 편승 — 랩 sepAgents 상당): ①zone.js movePlayerStep(NPC·플레이어 — 셀 변경 시만,
//     개체 캐시 p._rdK) ②villages.js 캐러밴 몸 ③전쟁 행군/귀환 지휘관(대형 전체의 통행선 근사 — 주석 의무).
//   · 효과: ①NPC 보행 ×1.10/1.15(movePlayerStep — 셀 변경 시 캐시 p._rdMul. ★플레이어 제외: 클라 이동 예측이
//     길을 모름 → 러버밴딩. 랩과의 의도적 차이 — 주석 계약) ②교역·행군 A* 할인 0.93/0.87(villages computeRoutePts —
//     코스 4셀 해상도라 coarse 오버레이(그리드당 최대 등급) 조회. 거리행렬(econ 운송비)은 무접촉 — 경로 모양만)
//     ③부지 제외는 시딩 1회 구조라 비대상(성장형 addHouseSite가 생기면 그때 — 랩 fpOk roadLevel 게이트 인계).
//   · DB 영속(캐논 §16 한계 명시분): zone-local-db roads 테이블 — 밟힌 셀만, 게임일 1회 dirty 배치 플러시.
//   · 클라: welcome roads(등급 셀 전체) + 게임일 1회 road_cells 변경분 broadcast → 바닥 틴트 오버레이.
//
// 가드레일: ENABLE_ROADS=0 → init/stamp/onGameTick 전부 no-op(레벨 0 반환 — 효과 정확히 기존과 동일).
//   RNG 무소비(결정론 보존 — 랩 계약). econ 무접촉. 좌표: 셀(1셀=1m 캐논, px÷32).
// =============================================================================
'use strict';

const ENABLED = process.env.ENABLE_ROADS !== '0';

const SZ = 32;
const T1 = 8, T2 = 28, VMAX = 120, DK = 0.995;                 // 랩 L_ROAD_T1/T2/MAX/DK verbatim
const SPD = [1, 1.10, 1.15], COST = [1, 0.93, 0.87];           // 랩 L_ROAD_SPD/COST verbatim
const COARSE = 4;                                              // A* 할인 오버레이 해상도(villages DIST_STEP과 동일)

const S = {
  ready: false, zoneId: null, db: null, broadcast: null,
  cellsW: 0, cellsH: 0, gw: 0, gh: 0,
  cells: new Map(),      // k → {v,d}
  coarse: new Map(),     // 코스키 → 최대 등급(1|2) — computeRoutePts 조회(일 1회 재구축)
  dirty: new Set(),      // 이번 게임일 변경 키(DB 플러시 대상)
  sent: new Map(),       // k → 마지막 broadcast 등급(변경분 diff)
  epoch: 0, dayMs: 1,
  lastDay: -1,
  stats: { stamped: 0, cellsTotal: 0, graded: 0 },
};

function dayNow() { return Math.floor((Date.now() - S.epoch) / S.dayMs); }
function kOf(cx, cy) { return cy * S.cellsW + cx; }

function _get(k, t) { // 접근 시 게으른 감쇠 + 소멸 프룬(랩 _roadGet verbatim)
  const r = S.cells.get(k); if (!r) return null;
  if (t > r.d) {
    r.v *= Math.pow(DK, t - r.d); r.d = t;
    S.dirty.add(k);
    if (r.v < 1) { S.cells.delete(k); return null; }   // 풀 복귀(플러시가 DB 행 삭제)
  }
  return r;
}
function levelOf(cx, cy) {
  if (!S.ready || cx < 0 || cy < 0 || cx >= S.cellsW || cy >= S.cellsH) return 0;
  const r = _get(kOf(cx, cy), dayNow());
  return r ? (r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0)) : 0;
}
function stampCell(cx, cy) { // +1 답압(랩 roadStamp verbatim) — 등급 반환
  if (!S.ready || cx < 0 || cy < 0 || cx >= S.cellsW || cy >= S.cellsH) return 0;
  const k = kOf(cx, cy), t = dayNow();
  let r = S.cells.get(k);
  if (!r) { S.cells.set(k, { v: 1, d: t }); S.dirty.add(k); S.stats.stamped++; return 0; }
  if (t > r.d) { r.v *= Math.pow(DK, t - r.d); r.d = t; }
  r.v = Math.min(VMAX, r.v + 1); S.dirty.add(k); S.stats.stamped++;
  const lv = r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0);
  if (lv >= 1) S.coarse.set(((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0), Math.max(lv, S.coarse.get(((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0)) || 0));
  return lv;
}
// 이동 개체 편승 스탬프 — 셀 변경 시에만(개체 캐시 ent._rdK) + 보행 배속 캐시(ent._rdMul)
function stampEntityPx(ent, x, y) {
  if (!S.ready) return;
  const cx = (x / SZ) | 0, cy = (y / SZ) | 0, k = cy * S.cellsW + cx;
  if (ent._rdK === k) return;
  ent._rdK = k;
  ent._rdMul = SPD[stampCell(cx, cy)];
}
function speedMulOf(ent) { return (S.ready && ent && ent._rdMul) ? ent._rdMul : 1; }
// A* 스텝 할인(villages computeRoutePts — 코스 그리드 4셀 키). 랩 정신: 교역로 A*만, 거리행렬·bfs 무접촉.
function courseCostMul(gx, gy) {
  if (!S.ready || !S.coarse.size) return 1;
  return COST[S.coarse.get(gy * S.gw + gx) || 0];
}
function _rebuildCoarse(t) { // 일 1회 재구축(감쇠 강등 반영 — graded 소수라 저렴)
  S.coarse.clear();
  let graded = 0;
  for (const [k, r] of S.cells) {
    const v = (t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v;   // 조회 전용 감쇠(쓰기는 접근 경로 소유)
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (!lv) continue;
    graded++;
    const cx = k % S.cellsW, cy = (k / S.cellsW) | 0;
    const ck = ((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0);
    if ((S.coarse.get(ck) || 0) < lv) S.coarse.set(ck, lv);
  }
  S.stats.graded = graded;
}
function clientRoads() { // welcome 1회 — 등급 셀 flat [cx,cy,lv,...] (밟힌 전체가 아니라 등급만 — 소형)
  if (!S.ready) return null;
  const t = dayNow(), out = [];
  for (const [k, r] of S.cells) {
    const v = (t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v;
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (lv) out.push(k % S.cellsW, (k / S.cellsW) | 0, lv);
  }
  return out.length ? out : null;
}
function flushDaily(day) { // DB 배치 플러시(dirty만) + 클라 변경분 broadcast
  if (!S.dirty.size) return { rows: 0, sentN: 0 };
  const db = S.db;
  let rows = 0;
  db.db.exec('BEGIN');
  try {
    for (const k of S.dirty) {
      const r = S.cells.get(k);
      if (r) db.upsertRoadCell(S.zoneId, k, r.v, r.d);
      else db.deleteRoadCell(S.zoneId, k);
      rows++;
    }
    db.db.exec('COMMIT');
  } catch (e) { try { db.db.exec('ROLLBACK'); } catch (_) { } console.error(`[${S.zoneId}] 🛤️ 답압 길 저장 실패(다음 날 재시도):`, e.message); return { rows: 0, sentN: 0 }; }
  // 변경분 diff(등급 전이 셀만 — 대역폭 소형)
  const changed = [];
  for (const k of S.dirty) {
    const r = S.cells.get(k);
    const lv = r ? (r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0)) : 0;
    if ((S.sent.get(k) || 0) !== lv) { S.sent.set(k, lv); if (!lv) S.sent.delete(k); changed.push(k % S.cellsW, (k / S.cellsW) | 0, lv); }
  }
  S.dirty.clear();
  if (changed.length && S.broadcast) { try { S.broadcast({ type: 'road_cells', cells: changed }); } catch (_) { } }
  return { rows, sentN: changed.length / 3 };
}

function init(deps) { // deps: { zoneId, cellsW, cellsH, epoch, dayMs, broadcast }
  if (!ENABLED) { console.log(`[${deps && deps.zoneId || 'zone'}] 🛤️ roads: ENABLE_ROADS=0 — 비활성(no-op)`); return; }
  try {
    S.zoneId = deps.zoneId; S.cellsW = deps.cellsW; S.cellsH = deps.cellsH;
    S.gw = Math.ceil(S.cellsW / COARSE); S.gh = Math.ceil(S.cellsH / COARSE);
    S.epoch = deps.epoch || 0; S.dayMs = deps.dayMs || 600000; S.broadcast = deps.broadcast || null;
    S.db = require('./zone-local-db');
    const t0 = Date.now();
    const rows = S.db.getRoadCells(S.zoneId);
    for (const r of rows) S.cells.set(r.cell_key | 0, { v: r.v, d: r.d | 0 });
    S.lastDay = dayNow();
    _rebuildCoarse(S.lastDay);
    S.stats.cellsTotal = S.cells.size;
    S.ready = true;
    console.log(`[${S.zoneId}] 🛤️ 답압 길 준비(§16): 복원 ${S.cells.size}셀(등급 ${S.stats.graded}) · T1=${T1}/T2=${T2}/감쇠 ${DK}/일 · ${Date.now() - t0}ms`);
  } catch (e) { S.ready = false; console.error(`[roads] init 실패 (존 부팅은 계속):`, e.message); }
}
function onGameTick(now) {
  if (!S.ready) return;
  const day = Math.floor((now - S.epoch) / S.dayMs);
  if (day === S.lastDay) return;
  S.lastDay = day;
  try {
    _rebuildCoarse(day);
    const f = flushDaily(day);
    S.stats.cellsTotal = S.cells.size;
    if (f.rows) console.log(`[${S.zoneId}] 🛤️ 답압 길 day ${day}: 셀 ${S.cells.size}(등급 ${S.stats.graded}) · 저장 ${f.rows}행 · 클라 변경 ${f.sentN}셀 · 오늘 스탬프 ${S.stats.stamped}`);
    S.stats.stamped = 0;
  } catch (e) { console.error(`[${S.zoneId}] 🛤️ 답압 길 데일리 실패:`, e.message); }
}

module.exports = { init, onGameTick, stampCell, stampEntityPx, speedMulOf, levelOf, courseCostMul, clientRoads, ENABLED, _S: S };
