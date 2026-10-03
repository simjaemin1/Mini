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
  coarseGen: 0,          // ★[T578 ④] 코스 등급 지도가 바뀐 횟수(일 1회 재구축에서 다르면 +1)
  stats: { stamped: 0, cellsTotal: 0, graded: 0 },
  // ★★[T566 추신2 2026-09-30 · 재민] **다져진 길(등급 2) 셀 집합** — 재생 술어(`zone.js regrowBlockedAt`)의 길 항이 읽는 **셀 집합 하나**.
  //   새 표 0 · 새 수 0: 등급 문턱은 위 `T2` 그대로이고, 값은 `cells` 의 v 그대로다(이 집합은 "지금 등급 2 인 키"의 색인일 뿐).
  //   오름(→2)은 `stampCell` 이 **그 호출 안에서** 안다(v 가 오르는 자리는 거기 하나) · 내림(2→아래)은 감쇠라
  //   하루 한 번 `_rebuildCoarse`(이미 도는 조회 전용 감쇠 — 게으른 감쇠 그대로)가 잰다.
  //   ⚠부르는 쪽 둘(`onPaved`·`onUnpaved`)은 존이 넘길 때만 선다(`init` deps) — 안 넘기면 이 집합은 색인일 뿐 아무 일도 안 일으킨다.
  paved: new Set(),
  onPaved: null, onUnpaved: null,
  bootUnpaved: [],   // 저장 땐 v ≥ T2 였는데 꺼진 사이 감쇠로 등급 2 아래가 된 셀(부팅이 안다 · 풀린 날은 부르는 쪽이 정한다)
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
  if (lv >= 1) {
    const ck = ((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0), o = S.coarse.get(ck) || 0;
    if (lv > o) { S.coarse.set(ck, lv); S.coarseGen++; }   // ★[T578 ④] 코스 칸 등급이 오른 순간도 '지도가 바뀌었다'(종전: 같은 값을 다시 적었다 — 값 무변)
  }
  // ★[T566 추신2 ①] 등급이 **2 로 오르는 그 호출** — 집합에 넣고 존에 알린다(나무 파괴 · 둘레 리젠 막음은 존의 일)
  if (lv === 2 && !S.paved.has(k)) { S.paved.add(k); if (S.onPaved) { try { S.onPaved(cx, cy); } catch (e) { } } }
  return lv;
}
// ★[T566] 다져진 길이 (cx,cy) 의 체비쇼프 R 셀 안에 있나 — 재생 술어의 길 항(`zone.js regrowBlockedAt`).
//   코스 오버레이(그리드당 최대 등급 · 등급 2 오름은 `stampCell` 이 · 내림은 `_rebuildCoarse` 가 집합과 **같은 자리**에서 고친다)로
//   먼저 거른다 — 둘레(5×5)는 코스 칸 2×2 안에 든다. `except` = 이 키 하나는 빼고 본다(오름 사건이 "그 전에도 막혔나"를 물을 때).
function pavedNear(cx, cy, R, except) {
  if (!S.ready || !S.paved.size) return false;
  const x0 = Math.max(0, cx - R), x1 = Math.min(S.cellsW - 1, cx + R);
  const y0 = Math.max(0, cy - R), y1 = Math.min(S.cellsH - 1, cy + R);
  if (x0 > x1 || y0 > y1) return false;
  let any = false;
  for (let gy = (y0 / COARSE) | 0; gy <= ((y1 / COARSE) | 0) && !any; gy++)
    for (let gx = (x0 / COARSE) | 0; gx <= ((x1 / COARSE) | 0); gx++) if ((S.coarse.get(gy * S.gw + gx) || 0) >= 2) { any = true; break; }
  if (!any) return false;
  for (let y = y0; y <= y1; y++) {
    const row = y * S.cellsW;
    for (let x = x0; x <= x1; x++) { const k = row + x; if (k !== except && S.paved.has(k)) return true; }
  }
  return false;
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
  const prev = S.coarse;   // ★[T578 ④] 등급 지도가 바뀌었나 — 바뀌면 `coarseGen` 이 오른다(교역로를 다시 팔 때를 정한다)
  S.coarse = new Map();
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
  let same = prev.size === S.coarse.size;
  if (same) for (const [k, lv] of S.coarse) { if (prev.get(k) !== lv) { same = false; break; } }
  if (!same) S.coarseGen++;
  // ★[T566 추신2 ③] 다져진 길이 **등급 2 아래로** 내려갔나 — 위와 같은 조회 전용 감쇠(같은 식 · 같은 날)로 잰다.
  //   내려간 셀은 집합에서 빼고 존에 알린다(그 셀과 둘레의 막힘이 풀린다 — 시계는 존이 다시 잰다). 코스는 위에서 이미 강등됐다.
  if (S.paved.size) {
    const rel = [];
    for (const k of S.paved) {
      const r = S.cells.get(k);
      const v = r ? ((t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v) : 0;
      if (v < T2) rel.push(k);
    }
    for (const k of rel) S.paved.delete(k);   // 먼저 다 뺀다 — 같은 날 함께 내려간 이웃이 서로의 둘레를 막은 채로 남지 않게
    if (S.onUnpaved) for (const k of rel) { try { S.onUnpaved(k % S.cellsW, (k / S.cellsW) | 0); } catch (e) { } }
  }
}
// ★[T578 ④] 교역로 A* 가 h 를 줄일 몫 — 스텝 비용 할인의 최저값(`COST` 의 가장 작은 값 · 수 사본 0).
function courseCostMin() { return (S.ready && S.coarse.size) ? Math.min(...COST) : 1; }   // 등급 칸이 하나도 없으면 할인도 없다(h 그대로)
function coarseGen() { return S.coarseGen; }
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
    const _tNow = Math.floor((Date.now() - (deps.epoch || 0)) / (deps.dayMs || 600000));
    for (const r of rows) S.cells.set(r.cell_key | 0, { v: r.v, d: Math.min(r.d | 0, _tNow) });   // ★미래 일번호 방어: dayLengthMs 변경(예: 10분→24분)으로 절대 일번호가 뒤로 점프하면 저장된 d가 미래가 되어 감쇠 정지 — 오늘로 클램프(1회성 이행)
    S.lastDay = dayNow();
    // ★[T566] 다져진 길 집합 — 코스와 **같은 날·같은 식**으로 세운다(아래 `_rebuildCoarse` 가 같은 날로 다시 재도 아무도 안 빠진다).
    //   저장 v 는 T2 이상인데 오늘 감쇠로 아래면 — 꺼진 사이 풀린 셀이다(부르는 쪽이 시계가 선 뒤 풀어 준다).
    S.onPaved = deps.onPaved || null; S.onUnpaved = deps.onUnpaved || null;
    S.paved.clear(); S.bootUnpaved = [];
    for (const [k, r] of S.cells) {
      const v = (S.lastDay > r.d) ? r.v * Math.pow(DK, S.lastDay - r.d) : r.v;
      if (v >= T2) S.paved.add(k); else if (r.v >= T2) S.bootUnpaved.push(k);
    }
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

// ★[T566] 다져진 길 셀 수 · 키(읽기만 — 존의 부팅 걷기 · 자)
function pavedCount() { return S.ready ? S.paved.size : 0; }
function pavedKeys() { return S.ready ? [...S.paved] : []; }
module.exports = { init, onGameTick, stampCell, stampEntityPx, speedMulOf, levelOf, courseCostMul, courseCostMin, coarseGen, isReady: () => S.ready, clientRoads, pavedNear, pavedCount, pavedKeys, ENABLED, _S: S };
