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

// ★★[T688 2026-10-11 · T686 회부 ③] 길 하루 훅 쪼개기 — 손잡이 `T688_ROAD_DAY`(★10-11 PM 착지 켬 기본 · `0` 끔 · `1` 켬 · `verify` 견줌 = 세계는 끔 그대로 · 새 셈을 곁에서 돌려 날마다 견준다).
//   ⓐ 코스 재구축: 밟힌 셀 **전부**를 날마다 감쇠 조회하던 것(T686 24.6만 → 27.1만 셀 · 66~85 ms)을 **셀 값이 바뀔 때**와 **등급 문턱을 넘는 날**에만 잰다.
//      · 셀 값은 스탬프(`stampCell`)와 조회 감쇠·지움(`_get`)에서만 바뀐다 — 그 자리에서 그 셀의 등급(마지막 접근일 값)을 고쳐 둔다.
//      · 감쇠는 마지막 접근일에서 닫힌 식(`v·DK^(t−d)`)이라, 값이 그대로면 등급은 문턱을 처음 밑도는 날에만 바뀐다 — 그 날을 **같은 식**으로 미리 재어 날 → 셀 표에 둔다.
//      · 날 경계에선 그날 문턱 날이 온 셀만 다시 재고, 등급 셀 수가 바뀐 코스 칸만 고친다. ⇒ 같은 등급 · 같은 코스 지도 · 같은 `coarseGen` 오름 · 같은 바뀐 칸 · 같은 풀림(같은 `S.paved` 차례).
//   ⓑ 플러시: ① 날 경계 틱엔 얼리기만 하고(첫 묶음은 다음 틱) ② 얼리기는 **쓰기 전 복사**다 — 그날 dirty 집합을 통째로 넘겨받고, 묶음이 그 키를 쓸 때
//      값을 읽는다. 그 사이 값을 바꾸는 자리(스탬프 · 조회 감쇠 · 지움 · 새 셀)는 바꾸기 **전에** 경계 값을 따로 적어 둔다 ⇒ 종전이 경계 틱에 얼린 그 값 · 그 차례.
//      ③ 묶음(거래 하나)을 **행 수 상한**으로도 자른다 — 상한 = 그날 묶음들 중 가장 느린 속도(행 ÷ BEGIN~COMMIT ms · 체크포인트 묶음이 섞여도) × 예산(조각 예산 그 수 · 새 수 0).
//      부팅 뒤 첫 묶음(속도 모름)은 한 행으로 잰다. ④ 마을 하루 마감이 도는 틱(`villagesBusy`)엔 묶음을 쉰다 — 마감 예산 16 + 길 예산이 한 틱에 쌓이지 않게.
//      같은 행 · 같은 차례 · 묶음이 잘게 나뉘고 늦게 쓰일 뿐이다(원자성은 묶음 단위 그대로 — 보고 표).
const T688 = (process.env.T688_ROAD_DAY || '').trim(), T688_ON = T688 !== '0' && T688 !== 'verify', T688_VERIFY = T688 === 'verify';

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
  chgOn: false, chg: null,   // ★[T619] 바뀐 코스 칸 키(교역로 다시 파기가 켰을 때만 모은다 · `takeCoarseChanges`)
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
    if (_flCow) _flSnap(k, r);   // ★[T688 ⓑ] 경계 값을 먼저 적는다(쓰기 전 복사)
    r.v *= Math.pow(DK, t - r.d); r.d = t;
    S.dirty.add(k);
    if (r.v < 1) { S.cells.delete(k); if (I.ready) _i688Touch(k, null, 0); return null; }   // 풀 복귀(플러시가 DB 행 삭제)
    if (I.ready) _i688Touch(k, r, r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0));   // ★[T688 ⓐ] 값이 바뀐 자리 — 등급 · 문턱 날
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
  if (!r) { if (_flCow) _flSnap(k, null); S.cells.set(k, { v: 1, d: t }); S.dirty.add(k); S.stats.stamped++; return 0; }   // 새 셀 — 등급 0(지운 셀은 지울 때 이미 0)
  if (_flCow) _flSnap(k, r);   // ★[T688 ⓑ]
  if (t > r.d) { r.v *= Math.pow(DK, t - r.d); r.d = t; }
  r.v = Math.min(VMAX, r.v + 1); S.dirty.add(k); S.stats.stamped++;
  const lv = r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0);
  if (lv >= 1) {
    const ck = ((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0), o = S.coarse.get(ck) || 0;
    if (lv > o) { S.coarse.set(ck, lv); S.coarseGen++; if (S.chgOn) S.chg.add(ck); }   // ★[T619] 바뀐 칸 기록(읽는 쪽이 켰을 때만) · ★[T578 ④] 코스 칸 등급이 오른 순간도 '지도가 바뀌었다'(종전: 같은 값을 다시 적었다 — 값 무변)
  }
  // ★[T566 추신2 ①] 등급이 **2 로 오르는 그 호출** — 집합에 넣고 존에 알린다(나무 파괴 · 둘레 리젠 막음은 존의 일)
  if (lv === 2 && !S.paved.has(k)) { S.paved.add(k); if (S.onPaved) { try { S.onPaved(cx, cy); } catch (e) { } } }
  if (I.ready) _i688Touch(k, r, lv);   // ★[T688 ⓐ] 등급(오늘 값) · 문턱 날
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
let _t688FullRel = null;   // [T688 견줌] 종전 셈의 풀림 차례(읽기만)
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
  if (!same && S.chgOn) {   // ★[T619] 등급이 바뀐 코스 칸(오름·내림·사라짐) — 읽는 쪽(`takeCoarseChanges`)이 켰을 때만 모은다
    for (const [k, lv] of S.coarse) if (prev.get(k) !== lv) S.chg.add(k);
    for (const k of prev.keys()) if (!S.coarse.has(k)) S.chg.add(k);
  }
  // ★[T566 추신2 ③] 다져진 길이 **등급 2 아래로** 내려갔나 — 위와 같은 조회 전용 감쇠(같은 식 · 같은 날)로 잰다.
  //   내려간 셀은 집합에서 빼고 존에 알린다(그 셀과 둘레의 막힘이 풀린다 — 시계는 존이 다시 잰다). 코스는 위에서 이미 강등됐다.
  if (S.paved.size) {
    const rel = [];
    for (const k of S.paved) {
      const r = S.cells.get(k);
      const v = r ? ((t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v) : 0;
      if (v < T2) rel.push(k);
    }
    _t688FullRel = rel;
    for (const k of rel) S.paved.delete(k);   // 먼저 다 뺀다 — 같은 날 함께 내려간 이웃이 서로의 둘레를 막은 채로 남지 않게
    if (S.onUnpaved) for (const k of rel) { try { S.onUnpaved(k % S.cellsW, (k / S.cellsW) | 0); } catch (e) { } }
  }
}
// ── ★[T688 ⓐ] 등급 셀 · 문턱 날 · 코스 칸마다 등급 셀 수 ──────────────────────────────────────────────────────────────
//   `I.lvl` = 등급 1·2 셀(k → 그 셀의 지금 값(마지막 접근일)의 등급 — 문턱 날이 오면 그날 값으로 고친다) · `I.c1`/`I.c2` = 코스 칸마다 등급 1·2 셀 수 ·
//   `I.sched` = 셀 → 다음 문턱 날 · `I.due` = 날 → 그날 문턱을 넘는 셀(집합 — 다시 잡으면 옛 날에서 뺀다 · 크기 = 등급 셀 수) ·
//   `I.tg` = 경계 뒤 등급 셀 수가 바뀐 코스 칸 · `I.low` = 등급 2 에서 내려간 다져진 길 셀(경계에서 `S.paved` 차례로 푼다).
//   ★값이 그대로인 셀의 등급은 `v·DK^(t−d)` 가 t 에 대해 단조로 줄므로(곱 반올림도 단조) 문턱 날 전엔 그대로다 — 종전 전수 재구축이 그날 재는 값과 같다.
const I = { ready: false, lvl: new Map(), sched: new Map(), due: new Map(), c1: null, c2: null, graded: 0, coarse: null, tgMark: null, tg: [], low: new Set(),
  st: { days: 0, touch: 0, dueEvals: 0, tgN: 0, ms: 0, maxMs: 0, last: null, relN: 0, relMs: 0, relMaxMs: 0, vDays: 0, vBad: 0, vBadCoarse: 0, vBadGen: 0, vBadChg: 0, vBadGraded: 0, vBadRel: 0, fullMs: 0, fullMaxMs: 0 } };
const _i688Now = (() => { const P = require('perf_hooks').performance; return () => P.now(); })();   // 관측 시계(세계 무관)
function _i688Lv(r, t) { const v = r ? ((t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v) : 0; return v >= T2 ? 2 : (v >= T1 ? 1 : 0); }
// 등급 lv 인 셀이 그 문턱을 처음 밑도는 날 = d + n(n ≥ 1 · `r.v * Math.pow(DK, n) < 문턱` 인 가장 작은 n) — 로그는 어림만 · 판정은 같은 식
function _i688Cross(r, lv) {
  const T = lv === 2 ? T2 : T1;
  let n = Math.max(1, Math.floor(Math.log(T / r.v) / Math.log(DK)));
  while (n > 1 && r.v * Math.pow(DK, n - 1) < T) n--;
  while (r.v * Math.pow(DK, n) >= T) n++;
  return r.d + n;
}
function _i688Ck(k) { const cx = k % S.cellsW, cy = (k / S.cellsW) | 0; return ((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0); }
// 셀 k 의 등급이 nl 이 됐다(r = 지금 값 · null = 지움) — 칸 수 · 등급 2 내려감 · 문턱 날
function _i688Set(k, r, nl) {
  const ol = I.lvl.get(k) || 0;
  if (nl !== ol) {
    const ck = _i688Ck(k);
    if (ol) (ol === 2 ? I.c2 : I.c1)[ck]--; else I.graded++;
    if (nl) { (nl === 2 ? I.c2 : I.c1)[ck]++; I.lvl.set(k, nl); } else { I.lvl.delete(k); I.graded--; }
    if (!I.tgMark[ck]) { I.tgMark[ck] = 1; I.tg.push(ck); }
    if (ol === 2 && S.paved.has(k)) I.low.add(k);
  }
  const od = nl || ol ? I.sched.get(k) : undefined;
  const dd = nl ? _i688Cross(r, nl) : undefined;
  if (od !== dd) {
    if (od !== undefined) { const a = I.due.get(od); if (a) a.delete(k); }
    if (dd !== undefined) { I.sched.set(k, dd); let a = I.due.get(dd); if (!a) I.due.set(dd, a = new Set()); a.add(k); } else I.sched.delete(k);
  }
}
function _i688Touch(k, r, nl) { I.st.touch++; if (nl || I.lvl.has(k)) _i688Set(k, r, nl); }   // 등급 0 → 0 은 아무 일도 없다(밟힌 셀 대부분)
// 부팅 — 종전 전수 재구축(init)과 같은 날로 한 번 다 잰다(부팅 몫 · 하루 훅 아님)
function _i688Seed(t) {
  I.lvl.clear(); I.sched.clear(); I.due.clear(); I.graded = 0; I.tg = []; I.low.clear();
  I.c1 = new Uint8Array(S.gw * S.gh); I.c2 = new Uint8Array(S.gw * S.gh); I.tgMark = new Uint8Array(S.gw * S.gh);
  for (const [k, r] of S.cells) {
    const lv = _i688Lv(r, t); if (!lv) continue;
    I.lvl.set(k, lv); I.graded++; (lv === 2 ? I.c2 : I.c1)[_i688Ck(k)]++;
    const dd = _i688Cross(r, lv); I.sched.set(k, dd); let a = I.due.get(dd); if (!a) I.due.set(dd, a = new Set()); a.add(k);
  }
  I.coarse = T688_ON ? S.coarse : new Map(S.coarse);
  I.ready = true;
}
// 날 t — 문턱 날이 온 셀을 그날 값으로 다시 잰다 · 반환 = 다시 볼 코스 칸(그리고 표를 비운다)
function _i688Day(t) {
  for (const [dd, a] of I.due) {
    if (dd > t) continue;
    I.due.delete(dd);
    for (const k of a) { I.sched.delete(k); const r = S.cells.get(k); _i688Set(k, r, _i688Lv(r, t)); I.st.dueEvals++; }
  }
  const tg = I.tg; I.tg = []; for (const ck of tg) I.tgMark[ck] = 0; I.st.tgN += tg.length;
  return tg;
}
// 켬 — 코스 지도를 그 자리에서 고친다(등급 셀 수가 바뀐 칸만) · 종전과 같은 `coarseGen` 오름 · 같은 바뀐 칸 · 같은 풀림
function _rebuildCoarseInc(t) {
  const t0 = _i688Now(), due0 = I.st.dueEvals;
  const tg = _i688Day(t);
  const t1 = _i688Now();
  let changed = false;
  for (const ck of tg) {
    const nv = I.c2[ck] ? 2 : (I.c1[ck] ? 1 : 0), ov = S.coarse.get(ck) || 0;
    if (nv === ov) continue;
    changed = true;
    if (nv) S.coarse.set(ck, nv); else S.coarse.delete(ck);
    if (S.chgOn) S.chg.add(ck);
  }
  S.stats.graded = I.graded;
  if (changed) S.coarseGen++;
  const t2 = _i688Now(); let relN = 0, lowN = I.low.size, t3 = t2;
  if (S.paved.size && I.low.size) {   // 종전 풀림 — `S.paved` 차례 그대로(등급 2 에서 내려가 아직 2 가 아닌 셀만)
    const rel = [];
    for (const k of S.paved) if (I.low.has(k) && I.lvl.get(k) !== 2) rel.push(k);
    for (const k of rel) S.paved.delete(k);
    t3 = _i688Now(); relN = rel.length;
    if (S.onUnpaved) for (const k of rel) { try { S.onUnpaved(k % S.cellsW, (k / S.cellsW) | 0); } catch (e) { } }   // 존의 일(나무 리젠 막음 풀기) — 종전도 이 자리에서 부른다
  }
  I.low.clear();
  const t4 = _i688Now(), ms = t4 - t0, rms = t4 - t3; I.st.days++; I.st.ms += ms; if (ms > I.st.maxMs) I.st.maxMs = ms;
  I.st.relN += relN; I.st.relMs += rms; if (rms > I.st.relMaxMs) I.st.relMaxMs = rms;
  I.st.last = { t, ms: +ms.toFixed(2), dueN: I.st.dueEvals - due0, dueMs: +(t1 - t0).toFixed(2), tgN: tg.length, tgMs: +(t2 - t1).toFixed(2), lowN, relN, pavedMs: +(t3 - t2).toFixed(2), onUnpavedMs: +rms.toFixed(2) };
}
// 견줌 — 세계는 종전 전수 재구축 그대로 · 새 셈은 곁(그림자 지도)에서 돌려 다섯 가지를 견준다(코스 지도 · `coarseGen` 오름 · 바뀐 칸 · 등급 셀 수 · 풀림 차례)
function _rebuildCoarseVerify(t) {
  const prev = S.coarse, gen0 = S.coarseGen, t0 = _i688Now();
  const tg = _i688Day(t);
  const chgI = new Set();
  for (const ck of tg) {
    const nv = I.c2[ck] ? 2 : (I.c1[ck] ? 1 : 0);
    if (nv) I.coarse.set(ck, nv); else I.coarse.delete(ck);
    if (nv !== (prev.get(ck) || 0)) chgI.add(ck);
  }
  const relI = []; if (S.paved.size && I.low.size) for (const k of S.paved) if (I.low.has(k) && I.lvl.get(k) !== 2) relI.push(k);
  I.low.clear();
  const ms = _i688Now() - t0; I.st.days++; I.st.ms += ms; if (ms > I.st.maxMs) I.st.maxMs = ms;
  _t688FullRel = [];
  const f0 = _i688Now();
  _rebuildCoarse(t);   // 세계(종전)
  const fms = _i688Now() - f0; I.st.fullMs += fms; if (fms > I.st.fullMaxMs) I.st.fullMaxMs = fms;
  const C = S.coarse; let badC = C.size !== I.coarse.size;
  if (!badC) for (const [k, lv] of C) if (I.coarse.get(k) !== lv) { badC = true; break; }
  const chgF = new Set(); for (const [k, lv] of C) if (prev.get(k) !== lv) chgF.add(k); for (const k of prev.keys()) if (!C.has(k)) chgF.add(k);
  let badChg = chgF.size !== chgI.size; if (!badChg) for (const k of chgF) if (!chgI.has(k)) { badChg = true; break; }
  const badGen = (S.coarseGen !== gen0) !== (chgI.size > 0);
  const badGr = S.stats.graded !== I.graded;
  const FR = _t688FullRel || []; let badRel = FR.length !== relI.length; if (!badRel) for (let i = 0; i < FR.length; i++) if (FR[i] !== relI[i]) { badRel = true; break; }
  I.st.vDays++;
  if (badC) I.st.vBadCoarse++; if (badChg) I.st.vBadChg++; if (badGen) I.st.vBadGen++; if (badGr) I.st.vBadGraded++; if (badRel) I.st.vBadRel++;
  if (I.st.vDays % 200 === 0) console.log(`[${S.zoneId}] 🛤️ [T688 견줌] 날 ${I.st.vDays} · 어긋남 ${I.st.vBad} · 새 셈 최대 ${I.st.maxMs.toFixed(2)}ms · 종전 최대 ${I.st.fullMaxMs.toFixed(2)}ms`);
  if (badC || badChg || badGen || badGr || badRel) { I.st.vBad++; if (I.st.vBad <= 3) console.error(`[${S.zoneId}] 🛤️ [T688 견줌] 어긋남 day ${t}: 코스 ${badC} · 바뀐 칸 ${badChg} · 오름 ${badGen} · 등급 셀 ${badGr}(${S.stats.graded}/${I.graded}) · 풀림 ${badRel}(${FR.length}/${relI.length})`); }
}
function _t688Rebuild(t) { if (I.ready && T688_ON) _rebuildCoarseInc(t); else if (I.ready && T688_VERIFY) _rebuildCoarseVerify(t); else _rebuildCoarse(t); }
// ★[T696] 하네스 문 — 셀 값(v·d)을 손으로 고친 뒤 부른다(`test-regrow-block ⓑⓖ` 가 `d` 를 뒤로 고쳐 쓴다 · 현실엔 없는 일).
//   T688 등급·문턱 날 색인을 **지금 값**으로 다시 잡는다(값은 안 바꾼다 · 스탬프·조회 감쇠 자리가 하는 그 일). 끔(종전 재구축)이면 할 일이 없다.
function retouchCell(cx, cy) {
  if (!S.ready || !I.ready) return;
  const k = kOf(cx, cy), r = S.cells.get(k);
  _i688Set(k, r || null, r ? (r.v >= T2 ? 2 : (r.v >= T1 ? 1 : 0)) : 0);
}
// ★[T696] 다음 길 하루 경계에 풀릴 수 있는 다져진 길 셀 — 문턱 날이 내일 안인 등급 2 셀 + 낮에 등급 2 에서 내려간 셀(`I.low`).
//   존이 그 둘레의 원시 판을 미리 지어 두는 데만 쓴다(읽기만 · 캐시 데우기 · 빠진 셀은 경계에서 지금처럼 짓는다). T688 끔이면 빈 목록.
function unpaveSoonKeys() {
  if (!S.ready || !I.ready) return [];
  const out = [], t1 = S.lastDay + 1;
  for (const [dd, a] of I.due) { if (dd > t1) continue; for (const k of a) if (S.paved.has(k) && I.lvl.get(k) === 2) out.push(k); }
  for (const k of I.low) if (S.paved.has(k)) out.push(k);
  return out;
}
function roadDayPerf() { return (T688_ON || T688_VERIFY) ? Object.assign({ mode: T688, lvl: I.lvl.size, sched: I.sched.size, dueDays: I.due.size, flRate: +_flRate.toFixed(3), flBatches: _flSt.n, flMaxMs: +_flSt.maxMs.toFixed(2), flMaxRows: _flSt.maxRows, flCapped: _flSt.capped, flSnap: _flSt.snap, flPending: !!_fl }, I.st) : null; }

// ★[T578 ④] 교역로 A* 가 h 를 줄일 몫 — 스텝 비용 할인의 최저값(`COST` 의 가장 작은 값 · 수 사본 0).
function courseCostMin() { return (S.ready && S.coarse.size) ? Math.min(...COST) : 1; }   // 등급 칸이 하나도 없으면 할인도 없다(h 그대로)
function coarseGen() { return S.coarseGen; }
// ★★[T619 2026-10-04] 상자 안 할인 최저값 — 코스 칸 상자 [gx0..gx1]×[gy0..gy1] 안에 등급 칸이 있으면 그 칸들의 `COST` 최저 · 없으면 1.
//   교역로 A* 가 h 를 줄일 몫을 **그 쌍 둘레에서만** 본다(전역 `courseCostMin` 은 지도 어디든 칸 하나면 모든 쌍의 h 를 바꾼다 — T605 §2).
//   등급 칸은 소수라(일 1회 재구축이 세는 그것) 지도 전체를 훑지 않고 칸 목록만 본다.
function _minIn(C, gx0, gy0, gx1, gy1) {
  let m = 1;
  for (const [k, lv] of C) {
    if (!lv) continue;
    const x = k % S.gw, y = (k / S.gw) | 0;
    if (x < gx0 || x > gx1 || y < gy0 || y > gy1) continue;
    if (COST[lv] < m) m = COST[lv];
  }
  return m;
}
function courseCostMinIn(gx0, gy0, gx1, gy1) {
  if (!S.ready || !S.coarse.size) return 1;
  return _minIn(S.coarse, gx0, gy0, gx1, gy1);
}
// ★★[T640 2026-10-04] **얼린 길 보기** — 지금 코스 등급 지도의 사본 위에 교역로 A* 가 묻는 넷(`isReady`·`courseCostMul`·`courseCostMin`·`courseCostMinIn`)을
//   같은 식으로 낸다. 새 세계 첫 부팅의 도적 교역로 표본을 틱마다 조각으로 파는 동안(`T640_BOOT_SLICE`) 사람이 와서 칸이 등급을 받아도
//   표본은 부팅 순간 지도만 본다 ⇒ 부팅 때 한 번에 판 길(종전)과 바이트가 같다. 사본은 등급 칸뿐이라 작다(새 세계는 빈 지도).
function frozenView() {
  const C = new Map(S.coarse), ready = S.ready;
  return {
    frozen: true,
    isReady: () => ready,
    courseCostMul: (gx, gy) => ((!ready || !C.size) ? 1 : COST[C.get(gy * S.gw + gx) || 0]),
    courseCostMin: () => ((ready && C.size) ? Math.min(...COST) : 1),
    courseCostMinIn: (gx0, gy0, gx1, gy1) => ((!ready || !C.size) ? 1 : _minIn(C, gx0, gy0, gx1, gy1)),
    size: C.size,
  };
}
// ★[T619] 바뀐 코스 칸([gx, gy])을 내주고 비운다. 처음 부르는 순간부터 모으기 시작한다(안 부르면 모으지 않는다 = 종전 그대로).
function takeCoarseChanges() {
  if (!S.chgOn) { S.chgOn = true; S.chg = new Set(); return []; }
  const a = [...S.chg].map((k) => [k % S.gw, (k / S.gw) | 0]); S.chg.clear(); return a;   // [gx, gy] 코스 칸
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
// ★★[T630 2026-10-04] **하루 플러시를 틱 조각으로** — 길 일 훅 최대 80~111ms 의 주인이 이 함수였다(T605·T617 실측: 하루 1만 행 한 트랜잭션 34~88ms).
//   ⓐ 날이 바뀐 그 틱에 **그날의 행을 얼린다**(dirty 키마다 그 순간의 v·d · 셀이 없으면 지움) — 종전이 그 틱에 쓰던 바로 그 값이다.
//      dirty 는 새 집합으로 갈아 끼운다 ⇒ 그 뒤 찍힌 것은 다음 날 몫(종전과 같은 뜻: 종전도 플러시 뒤에 찍힌 것은 다음 날 썼다).
//   ⓑ 틱마다 예산(= 틱 조각기의 예산 `villages.tickSliceMs()` · 새 수 0)만큼 **한 트랜잭션 = 한 묶음**으로 쓴다. 예산 0 = 한 번에(종전).
//   ⓒ 방송(등급 전이 셀)은 **마지막 묶음 뒤 한 번** — 얼린 값으로 종전과 같은 차례·같은 내용.
//   ⓓ 묶음이 실패하면 그 묶음과 남은 키를 dirty 로 되돌린다(다음 날 그때 값으로 다시 — 종전 "다음 날 재시도"와 같은 뜻 · 이미 들어간 묶음은 남는다).
//   ⓔ 프로세스가 정상 종료하면(`exit`) 남은 묶음을 그 자리에서 다 쓴다. 강제 종료(SIGKILL)는 남은 묶음을 잃는다 — 종전도 그날 찍힌 것을 다 잃는 자리다.
let _fl = null;   // { day, rows:[[k, v|null, d]], i, n, cells, graded, stamped } — ★[T688 켬] 쓰기 전 복사 꼴: { lazy, keys, it, snap, out, i, total, … }
const TB = require('./tick-budget');   // ★[T687] 한 틱 공용 예산(끔 = 제 예산 그대로)
function _sliceMs() { try { const V = require('./villages'); return V.tickSliceMs ? (V.tickSliceMs() | 0) : 0; } catch (e) { return 0; } }
function _villagesBusy() { try { const V = require('./villages'); return !!(V.villagesBusy && V.villagesBusy()); } catch (e) { return false; } }
// ★[T688 ⓑ] 묶음 행 상한 — 속도 = 그날 묶음들 중 가장 느린 것(행 ÷ BEGIN~COMMIT ms — WAL 자동 체크포인트가 든 묶음까지) · 다음 날 첫 묶음은 지난날 속도 ·
//   부팅 뒤 첫 묶음(속도 모름)은 한 행. 종전 첫 묶음은 행 쓰기만 예산을 보고 COMMIT 은 예산 밖이라 4,735행 = 쓰기 13.7 + COMMIT 25.7 = 39 ms 였다(T688 탐침).
let _flRate = 0, _flDayMin = 0, _flCow = false;
const _flSt = { n: 0, maxMs: 0, maxRows: 0, capped: 0, snap: 0 };
// 쓰기 전 복사 — 아직 안 쓴 그날 키의 값을 바꾸기 **전에** 경계 값을 적는다(r = null 이면 그 순간 셀이 없다 = 지울 행)
function _flSnap(k, r) {
  const F = _fl; if (!F || !F.lazy || F.end) { _flCow = false; return; }
  if (F.snap.has(k) || !F.keys.has(k)) return;
  F.snap.set(k, r ? [r.v, r.d] : null); _flSt.snap++;
}
function flushDaily(day) { // 그날 행을 얼려 둔다(쓰기는 `_flushStep` — 틱마다 한 묶음)
  if (_fl) _flushStep(0);   // 앞날 것이 남았으면 먼저 다 쓴다(날이 조각보다 길어 실제론 안 난다)
  if (!S.dirty.size) return { rows: 0, sentN: 0, pending: false };
  if (T688_ON) {   // ★[T688 ⓑ] 얼리기 = dirty 집합을 넘겨받기(O(1)) · 값은 묶음이 쓸 때 읽는다(그 사이 바뀐 키는 `_flSnap` 이 경계 값을 들고 있다) · 첫 묶음은 다음 틱
    const keys = S.dirty; S.dirty = new Set();
    _fl = { lazy: true, day, keys, it: keys.values(), snap: new Map(), out: [], i: 0, n: 0, total: keys.size, end: false, cells: S.cells.size, graded: S.stats.graded, stamped: S.stats.stamped };
    _flCow = true; _flDayMin = 0;
    return { rows: keys.size, sentN: 0, pending: true };
  }
  const rows = [];
  for (const k of S.dirty) { const r = S.cells.get(k); rows.push(r ? [k, r.v, r.d] : [k, null, 0]); }
  S.dirty = new Set();
  _fl = { day, rows, i: 0, n: 0, cells: S.cells.size, graded: S.stats.graded, stamped: S.stats.stamped };
  if (!TB.out(_sliceMs(), 'roads')) _flushStep(TB.slice(_sliceMs()));   // ★[T687] 켬 = 이 틱 남은 몫 · 없으면 다음 틱(행은 얼려 둔 채)
  return { rows: rows.length, sentN: 0, pending: !!_fl };
}
function _flushStep(budgetMs) {
  const F = _fl; if (!F) return;
  if (F.lazy) return _flushStepLazy(F, budgetMs);
  const db = S.db, t0 = Date.now();
  const i0 = F.i;
  try {
    db.db.exec('BEGIN');
    while (F.i < F.rows.length) {
      const [k, v, d] = F.rows[F.i];
      if (v !== null) db.upsertRoadCell(S.zoneId, k, v, d);
      else db.deleteRoadCell(S.zoneId, k);
      F.i++;
      if (budgetMs > 0 && Date.now() - t0 >= budgetMs) break;
    }
    db.db.exec('COMMIT');
    F.n++;
  } catch (e) {
    try { db.db.exec('ROLLBACK'); } catch (_) { }
    for (let j = i0; j < F.rows.length; j++) S.dirty.add(F.rows[j][0]);   // ⓓ 이 묶음과 남은 키 — 다음 날 그때 값으로
    _fl = null;
    console.error(`[${S.zoneId}] 🛤️ 답압 길 저장 실패(다음 날 재시도 ${F.rows.length - i0}행):`, e.message);
    return;
  }
  if (F.i < F.rows.length) return;   // 다음 틱에 이어 쓴다
  _fl = null;
  _flushEnd(F, F.rows);
}
// 변경분 diff(등급 전이 셀만 — 대역폭 소형) — 얼린 값으로 · 종전과 같은 차례
function _flushEnd(F, kv) {
  const changed = [];
  for (const [k, v] of kv) {
    const lv = v !== null ? (v >= T2 ? 2 : (v >= T1 ? 1 : 0)) : 0;
    if ((S.sent.get(k) || 0) !== lv) { S.sent.set(k, lv); if (!lv) S.sent.delete(k); changed.push(k % S.cellsW, (k / S.cellsW) | 0, lv); }
  }
  if (changed.length && S.broadcast) { try { S.broadcast({ type: 'road_cells', cells: changed }); } catch (_) { } }
  console.log(`[${S.zoneId}] 🛤️ 답압 길 day ${F.day}: 셀 ${F.cells}(등급 ${F.graded}) · 저장 ${F.lazy ? F.total : F.rows.length}행 · 클라 변경 ${changed.length / 3}셀 · 오늘 스탬프 ${F.stamped} · 묶음 ${F.n}`);
}
// ★[T688 ⓑ] 쓰기 전 복사 묶음 — 같은 차례(넘겨받은 dirty 집합 차례)로 그 키의 경계 값을 쓴다 · 행 상한 · 실패하면 이 묶음과 남은 키를 dirty 로
function _flushStepLazy(F, budgetMs) {
  const db = S.db, t0 = Date.now(), p0 = _i688Now();
  const cap = budgetMs > 0 ? (_flRate > 0 ? Math.max(1, Math.floor(_flRate * budgetMs)) : 1) : 0;   // 0 = 상한 없음(정상 종료 때 남은 것 다)
  const batch = [];
  try {
    db.db.exec('BEGIN');
    for (;;) {
      const nx = F.it.next(); if (nx.done) { F.end = true; break; }
      const k = nx.value; let v, d;
      if (F.snap.has(k)) { const sv = F.snap.get(k); if (sv) { v = sv[0]; d = sv[1]; } else v = null; }
      else { const r = S.cells.get(k); if (r) { v = r.v; d = r.d; } else v = null; }
      if (v !== null) db.upsertRoadCell(S.zoneId, k, v, d); else db.deleteRoadCell(S.zoneId, k);
      batch.push(k, v); F.i++;
      if (cap && batch.length / 2 >= cap) { _flSt.capped++; break; }
      if (budgetMs > 0 && Date.now() - t0 >= budgetMs) break;
    }
    db.db.exec('COMMIT');
    F.n++;
  } catch (e) {
    try { db.db.exec('ROLLBACK'); } catch (_) { }
    for (let j = 0; j < batch.length; j += 2) S.dirty.add(batch[j]);
    for (let nx = F.it.next(); !nx.done; nx = F.it.next()) S.dirty.add(nx.value);   // ⓓ 이 묶음과 남은 키 — 다음 날 그때 값으로(종전과 같은 뜻)
    _fl = null; _flCow = false;
    console.error(`[${S.zoneId}] 🛤️ 답압 길 저장 실패(다음 날 재시도 ${F.total - F.i + batch.length / 2}행):`, e.message);
    return;
  }
  for (let j = 0; j < batch.length; j++) F.out.push(batch[j]);
  const ms = _i688Now() - p0, rows = batch.length / 2;
  if (budgetMs > 0 && rows > 0 && ms > 0) { const r = rows / ms; _flDayMin = _flDayMin ? Math.min(_flDayMin, r) : r; _flRate = _flDayMin; }
  _flSt.n++; if (ms > _flSt.maxMs) _flSt.maxMs = ms; if (rows > _flSt.maxRows) _flSt.maxRows = rows;
  if (!F.end) return;   // 다음 틱에 이어 쓴다
  _fl = null; _flCow = false;
  const kv = []; for (let j = 0; j < F.out.length; j += 2) kv.push([F.out[j], F.out[j + 1]]);
  _flushEnd(F, kv);
}
process.on('exit', () => { if (_fl) { try { _flushStep(0); } catch (e) { } } });   // ⓔ

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
    if (T688_ON || T688_VERIFY) _i688Seed(S.lastDay);   // ★[T688] 등급 셀 · 문턱 날 첫 상태(부팅 한 번 · 종전 전수와 같은 날)
    S.stats.cellsTotal = S.cells.size;
    S.ready = true;
    console.log(`[${S.zoneId}] 🛤️ 답압 길 준비(§16): 복원 ${S.cells.size}셀(등급 ${S.stats.graded}) · T1=${T1}/T2=${T2}/감쇠 ${DK}/일 · ${Date.now() - t0}ms`);
  } catch (e) { S.ready = false; console.error(`[roads] init 실패 (존 부팅은 계속):`, e.message); }
}
function onGameTick(now) {
  if (!S.ready) return;
  const day = Math.floor((now - S.epoch) / S.dayMs);
  if (day === S.lastDay) {   // ★[T630] 얼린 행을 틱마다 한 묶음
    if (_fl && !(T688_ON && _villagesBusy()) && !TB.out(_sliceMs(), 'roads')) { try { _flushStep(TB.slice(_sliceMs())); } catch (e) { } }   // ★[T688 ⓑ] 마을 하루 마감이 도는 틱엔 쉰다 · ★[T687] 켬 = 이 틱 남은 몫 · 없으면 다음 틱
    return;
  }
  S.lastDay = day;
  try {
    _t688Rebuild(day);   // ★[T688] 끔 = 종전 `_rebuildCoarse(day)` 그대로
    flushDaily(day);   // ★[T630] 로그는 마지막 묶음 뒤(`_flushStep`)
    S.stats.cellsTotal = S.cells.size;
    S.stats.stamped = 0;
  } catch (e) { console.error(`[${S.zoneId}] 🛤️ 답압 길 데일리 실패:`, e.message); }
}

// ★[T566] 다져진 길 셀 수 · 키(읽기만 — 존의 부팅 걷기 · 자)
function pavedCount() { return S.ready ? S.paved.size : 0; }
function pavedKeys() { return S.ready ? [...S.paved] : []; }
module.exports = { roadDayPerf, retouchCell, unpaveSoonKeys, init, onGameTick, stampCell, stampEntityPx, speedMulOf, levelOf, courseCostMul, courseCostMin, courseCostMinIn, takeCoarseChanges, frozenView, coarseGen, isReady: () => S.ready, clientRoads, pavedNear, pavedCount, pavedKeys, ENABLED, _S: S };
