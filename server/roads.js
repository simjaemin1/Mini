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
// ★★[T713 2026-10-12 · T696 회부 ①] 플러시 끝 틱(`_flushEnd`) 쪼개기 — 손잡이 `T713_FLUSH_END`(기본 끔 · `1` 켬 · 끔 = 종전 글자 그대로).
//   종전(T688 켬 · 쓰기 전 복사 묶음): 마지막 묶음 뒤 **한 틱에** 그날 쓴 키 전부(3.8만)를 `[k, v]` 짝으로 다시 만들고(`kv`) 키마다 `S.sent` 와 견줘
//   바뀐 등급 셀을 모아 방송한다 — 한 틱 ≈ 29 ms(T696 on3 · 마지막 묶음 8.6 ms 와 같은 틱 · 10,000명 외삽 ≈ 0.47 초).
//   켬: 묶음마다 COMMIT 이 된 그 묶음의 키만 `S.sent` 와 견줘 바뀐 셀(k · 등급 · 방송 셀 셋)을 그날 몫(`F.chg`)에 붙인다(`S.sent` 는 **안 고친다**).
//      끝 틱엔 방송만 한다 · `S.sent` 고침(바뀐 셀만)은 그 뒤 틱들에 공용 몫(`TB`)으로 나눠 하고, 다음 견줌 전에 반드시 다 끝낸다(`_t713Apply(0)`).
//   ⇒ 같은 값 · 같은 차례: `S.sent` 를 읽고 쓰는 자리는 이 플러시 끝 하나뿐이다(`clientRoads` 는 셀 값을 본다 · 방송은 `S.sent` 를 안 읽는다) · 한 날의 키는 서로 다르다(dirty 집합) ·
//      앞날 플러시는 다음 날 첫 묶음 전에 끝난다(`flushDaily` 첫 줄) ⇒ 묶음 때 읽은 `S.sent.get(k)` = 종전이 끝 틱에 읽었을 그 값.
//      견주는 차례 = 묶음 차례 = 종전 `F.out` 차례 ⇒ 방송 `cells` 배열 · `S.sent` 고침 차례가 같다.
//      묶음이 실패하면 종전처럼 그날 끝이 없다(`F.chg` 를 버린다 · `S.sent` 무접촉 · 방송 0).
//   묶음 행 상한(`_flRate`)은 견주기 **전에** 잰 ms 로 정한다 ⇒ 묶음 경계 · DB 쓰기 차례도 같다.
const T713 = process.env.T713_FLUSH_END !== '0';   // ★[PM 10-13] 켬 기본(바이트 같음 3/3 · 끝 틱 21.6 → 1.1 ms) · 되돌림 `=0`

// ★★[T1448 2026-11-23 · 재민 판정 62 (나) "모든 셀마다 갖는 속성 중에 길 수치를 두면 되는 거 아니었어..?"] 길 장부를 **칸 배열로** —
//   손잡이 `T1448_ROAD_GRID`(끔 기본 · `=1` 켬 · 끔 = 종전 Map · Set · 칸 행 그대로).
//   켬: 칸마다 쥐던 것 — `S.cells`(값 · 날) · `S.sent`(방송 등급) · `S.paved`(다진 길) · T688 `I.lvl`(등급) · `I.sched`(문턱 날) — 을 구역(16 × 16칸) 숫자 배열로 ·
//     `I.due`(날 → 그날 문턱 칸)는 날마다 Int32 줄(다시 잡힌 칸은 `sched` 로 거른다) · `S.coarse`(4칸 격자 코스 지도)는 격자 칸 바이트 배열(`server/road-grid.js` —
//     같은 Map · Set 꼴 · 문 글자 무변 · 칸마다 객체 · 색인 항목 0 · 밟힌 적 없는 구역은 배열 0) · `S.dirty` 는 그날 바뀐 구역 표를 곁에 단 Set(그날 일감 — 종전 그대로).
//   DB = 구역 묶음 행(`road_chunks` — 구역 하나 한 줄) · 칸 행(`roads`)은 첫 부팅에 **한 거래로** 옮기고 지운다.
//     끈 부팅이 구역 행을 보면 칸 행으로 되돌린다(한 거래 · `scripts/t1448-road-migrate.js --back` 과 같은 일) — 켠 적 없는 DB 는 무동작(종전 그대로).
//     하루 저장은 그날 바뀐 칸이 든 구역을 경계 값으로 한 줄씩(쓰기 전 복사가 그 구역 칸을 다 든다) · 방송 견줌은 종전 그대로(바뀐 키 · 같은 차례).
//   종료 저장 덩이(`t1382Dump`) = 칸은 구역 덩이째(base64) · 나머지 종전 꼴. 값 · 날 · 등급 · 감쇠 · 지움(1 밑 = 0)은 종전 글자 그대로.
//   차례 = 칸 키 오름(종전 Map 은 넣은 차례 — 값에 닿는 차례 자리 0 · 보고 T1448 §3).
const T1448 = process.env.T1448_ROAD_GRID === '1';
const RG = T1448 ? require('./road-grid') : null;
class _T1448Dirty extends Set {   // 그날 바뀐 키 + 그 구역(얼릴 때 같이 넘긴다)
  constructor(g) { super(); this.g = g; this.ch = new Set(); }
  add(k) { this.ch.add(this.g._ci(k)); return super.add(k); }
  clear() { this.ch.clear(); return super.clear(); }
}

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

// ★[T990 2026-10-28] 길의 날 = econ 날 — 부르는 쪽(존 · 손잡이 `T990_ECON_DAY` 켬)이 econ 날 함수를 넘기면 스탬프 · 감쇠 · 하루 재구축이 그 날을 본다.
//   안 넘기면(끔 · 제품 기본) 종전 벽시계 날 글자 그대로 · 함수가 날을 못 내면(econ 세계 전 부팅) 벽시계 날로 떨어진다.
let _t990Day = null;
function setEconDay(fn) { _t990Day = (typeof fn === 'function') ? fn : null; }
function dayNow() { if (_t990Day) { let d = null; try { d = _t990Day(); } catch (e) { d = null; } if (Number.isFinite(d)) return d; } return Math.floor((Date.now() - S.epoch) / S.dayMs); }
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
  S.coarse = T1448 ? new RG.DenseU8(S.gw, S.gh) : new Map();   // ★[T1448] 켬 = 격자 칸 바이트 배열
  let graded = 0;
  if (T1448) S.cells.scan((k, rv, rd) => {   // ★[T1448] 배열 훑기(객체 0) — 아래 고리와 같은 식 · 같은 차례(칸 키 오름)
    const v = (t > rd) ? rv * Math.pow(DK, t - rd) : rv;
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (!lv) return;
    graded++;
    const cx = k % S.cellsW, cy = (k / S.cellsW) | 0;
    const ck = ((cy / COARSE) | 0) * S.gw + ((cx / COARSE) | 0);
    if ((S.coarse.get(ck) || 0) < lv) S.coarse.set(ck, lv);
  });
  else
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
    if (dd !== undefined) { I.sched.set(k, dd); let a = I.due.get(dd); if (!a) I.due.set(dd, a = _dueNew(dd)); a.add(k); } else I.sched.delete(k);
  }
}
function _dueNew(dd) { return T1448 ? new RG.DueList(I.sched, dd) : new Set(); }   // ★[T1448] 켬 = 날 통이 Int32 줄(거르기 · `RG.DueList`)
function _i688Touch(k, r, nl) { I.st.touch++; if (nl || I.lvl.has(k)) _i688Set(k, r, nl); }   // 등급 0 → 0 은 아무 일도 없다(밟힌 셀 대부분)
// 부팅 — 종전 전수 재구축(init)과 같은 날로 한 번 다 잰다(부팅 몫 · 하루 훅 아님)
function _i688Seed(t) {
  I.lvl.clear(); I.sched.clear(); I.due.clear(); I.graded = 0; I.tg = []; I.low.clear();
  I.c1 = new Uint8Array(S.gw * S.gh); I.c2 = new Uint8Array(S.gw * S.gh); I.tgMark = new Uint8Array(S.gw * S.gh);
  if (T1448) { const r = { v: 0, d: 0 }; S.cells.scan((k, rv, rd) => {   // ★[T1448] 배열 훑기 — 아래 고리와 같은 식 · 같은 차례(r = 돌 때마다 다시 쓰는 한 객체 · 읽기만)
    r.v = rv; r.d = rd;
    const lv = _i688Lv(r, t); if (!lv) return;
    I.lvl.set(k, lv); I.graded++; (lv === 2 ? I.c2 : I.c1)[_i688Ck(k)]++;
    const dd = _i688Cross(r, lv); I.sched.set(k, dd); let a = I.due.get(dd); if (!a) I.due.set(dd, a = _dueNew(dd)); a.add(k);
  }); } else
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
    if (T1448) { for (const k of I.low) if (S.paved.has(k) && I.lvl.get(k) !== 2) rel.push(k); rel.sort((a, b) => a - b); }   // ★[T1448] 다진 길 그릇이 칸 키 오름으로 돈다 — 같은 줄을 내려간 칸만 보고 짓는다(17만 칸 훑기 0)
    else
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
function roadDayPerf() { return (T688_ON || T688_VERIFY) ? Object.assign({ mode: T688, lvl: I.lvl.size, sched: I.sched.size, dueDays: I.due.size, flRate: +_flRate.toFixed(3), flBatches: _flSt.n, flMaxMs: +_flSt.maxMs.toFixed(2), flMaxRows: _flSt.maxRows, flCapped: _flSt.capped, flSnap: _flSt.snap, flPending: !!_fl || !!_t713Q }, I.st) : null; }

// ★[T578 ④] 교역로 A* 가 h 를 줄일 몫 — 스텝 비용 할인의 최저값(`COST` 의 가장 작은 값 · 수 사본 0).
function courseCostMin() { return (S.ready && S.coarse.size) ? Math.min(...COST) : 1; }   // 등급 칸이 하나도 없으면 할인도 없다(h 그대로)
function coarseGen() { return S.coarseGen; }
// ★★[T619 2026-10-04] 상자 안 할인 최저값 — 코스 칸 상자 [gx0..gx1]×[gy0..gy1] 안에 등급 칸이 있으면 그 칸들의 `COST` 최저 · 없으면 1.
//   교역로 A* 가 h 를 줄일 몫을 **그 쌍 둘레에서만** 본다(전역 `courseCostMin` 은 지도 어디든 칸 하나면 모든 쌍의 h 를 바꾼다 — T605 §2).
//   등급 칸은 소수라(일 1회 재구축이 세는 그것) 지도 전체를 훑지 않고 칸 목록만 본다.
function _minIn(C, gx0, gy0, gx1, gy1) {
  if (C.minIn) return C.minIn(COST, gx0, gy0, gx1, gy1);   // ★[T1448] 켬 = 코스 지도가 배열 — 상자만 본다(같은 답)
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
  const C = (T1448 && S.coarse.copy) ? S.coarse.copy() : new Map(S.coarse), ready = S.ready;   // ★[T1448] 켬 = 배열 사본(같은 답 · `_minIn` 상자 훑기)
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
  if (T1448) S.cells.scan((k, rv, rd) => {   // ★[T1448] 배열 훑기 — 아래 고리와 같은 식(차례 = 칸 키 오름 · 보고 T1448 차례 표)
    const v = (t > rd) ? rv * Math.pow(DK, t - rd) : rv;
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (lv) out.push(k % S.cellsW, (k / S.cellsW) | 0, lv);
  });
  else
  for (const [k, r] of S.cells) {
    const v = (t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v;
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (lv) out.push(k % S.cellsW, (k / S.cellsW) | 0, lv);
  }
  return out.length ? out : null;
}
// ★★[T1453 2026-11-23 · ★재민 11-22 판정 68] 칸 상자 하나의 등급 셀 — 손잡이 `T1453_VIEW_SEND`(zone.js · 끔 기본)가 welcome · 청크 몫을 지을 때만 부른다.
//   `clientRoads` 와 **같은 식**(같은 날 `dayNow()` · 같은 게으른 감쇠 · 같은 문턱 · 읽기만 — 셀 값 · dirty · `S.sent` 무접촉)을 상자 안 칸에만 묻는다(줄 차례 · 1,024칸 = 청크 하나).
//   `clientRoads` 는 글자 그대로 둔다(끔 = 종전 바이트 · T1448 이 같이 만지는 자리 — 충돌 줄을 줄인다). 두 길이 같은 답인지는 하네스가 청크마다 견준다(`test-t1453-load.js` Ⓒ).
function clientRoadsIn(cx0, cy0, w, h, out) {
  if (!S.ready) return out;
  const t = dayNow(), x0 = Math.max(0, cx0), y0 = Math.max(0, cy0), x1 = Math.min(S.cellsW, cx0 + w), y1 = Math.min(S.cellsH, cy0 + h);
  for (let cy = y0; cy < y1; cy++) for (let cx = x0; cx < x1; cx++) {
    const r = S.cells.get(cy * S.cellsW + cx); if (!r) continue;
    const v = (t > r.d) ? r.v * Math.pow(DK, t - r.d) : r.v;
    const lv = v >= T2 ? 2 : (v >= T1 ? 1 : 0);
    if (lv) out.push(cx, cy, lv);
  }
  return out;
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
// ★[T1290 ③] 틱마다 부르는 두 문 — `require('./villages')` 의 경로 풀기를 한 번만 한다. 풀린 이름으로 모듈 캐시 칸을 보고(있으면 그 `exports` —
//   `require` 가 캐시에 든 모듈에 돌려주는 바로 그것 · 순환 적재 중이면 그때의 `exports` 도 같다), 칸이 없으면 종전처럼 `require`(다시 적재 · 하네스가 캐시를 지운 판).
let _rVK = null;
function _rVil() { if (_rVK === null) _rVK = require.resolve('./villages'); const m = require.cache[_rVK]; return m ? m.exports : require('./villages'); }
function _sliceMs() { try { const V = _rVil(); return V.tickSliceMs ? (V.tickSliceMs() | 0) : 0; } catch (e) { return 0; } }
function _villagesBusy() { try { const V = _rVil(); return !!(V.villagesBusy && V.villagesBusy()); } catch (e) { return false; } }
// ★[T688 ⓑ] 묶음 행 상한 — 속도 = 그날 묶음들 중 가장 느린 것(행 ÷ BEGIN~COMMIT ms — WAL 자동 체크포인트가 든 묶음까지) · 다음 날 첫 묶음은 지난날 속도 ·
//   부팅 뒤 첫 묶음(속도 모름)은 한 행. 종전 첫 묶음은 행 쓰기만 예산을 보고 COMMIT 은 예산 밖이라 4,735행 = 쓰기 13.7 + COMMIT 25.7 = 39 ms 였다(T688 탐침).
let _flRate = 0, _flDayMin = 0, _flCow = false;
const _flSt = { n: 0, maxMs: 0, maxRows: 0, capped: 0, snap: 0 };
// 쓰기 전 복사 — 아직 안 쓴 그날 키의 값을 바꾸기 **전에** 경계 값을 적는다(r = null 이면 그 순간 셀이 없다 = 지울 행)
function _flSnap(k, r) {
  const F = _fl; if (!F || !F.lazy || F.end) { _flCow = false; return; }
  if (F.snap.has(k)) return;
  if (!F.keys.has(k) && !(F.grid && F.chunks.has(S.cells._ci(k)) && !F.written.has(S.cells._ci(k)))) return;   // ★[T1448] 켬 = 아직 안 쓴 얼린 구역의 칸도(구역 행은 그 구역 칸을 다 적는다)
  F.snap.set(k, r ? [r.v, r.d] : null); _flSt.snap++;
}
function flushDaily(day) { // 그날 행을 얼려 둔다(쓰기는 `_flushStep` — 틱마다 한 묶음)
  if (_fl) _flushStep(0);   // 앞날 것이 남았으면 먼저 다 쓴다(날이 조각보다 길어 실제론 안 난다)
  if (!S.dirty.size) return { rows: 0, sentN: 0, pending: false };
  if (T688_ON || T1448) {   // ★[T688 ⓑ] 얼리기 = dirty 집합을 넘겨받기(O(1)) · 값은 묶음이 쓸 때 읽는다(그 사이 바뀐 키는 `_flSnap` 이 경계 값을 들고 있다) · 첫 묶음은 다음 틱 · ★[T1448] 켬 = 늘 이 꼴(구역 행)
    const keys = S.dirty; S.dirty = T1448 ? new _T1448Dirty(S.cells) : new Set();
    _fl = { lazy: true, day, keys, it: keys.values(), snap: new Map(), out: [], i: 0, n: 0, total: keys.size, end: false, cells: S.cells.size, graded: S.stats.graded, stamped: S.stats.stamped };
    if (T1448) { _fl.grid = true; _fl.chunks = keys.ch; _fl.written = new Set(); }
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
  const batch = []; let cur = null, wb = 0;   // cur = 쓰던 키(던졌을 때 — ★[T1448] 켬은 그 키도 다음 날로) · wb = ★[T1493] 이 묶음이 쓴 구역 행(켬 — 상한 · 속도의 단위)
  try {
    db.db.exec('BEGIN');
    for (;;) {
      const nx = F.it.next(); if (nx.done) { F.end = true; break; }
      const k = nx.value; let v, d; cur = k;
      if (F.snap.has(k)) { const sv = F.snap.get(k); if (sv) { v = sv[0]; d = sv[1]; } else v = null; }
      else { const r = S.cells.get(k); if (r) { v = r.v; d = r.d; } else v = null; }
      if (F.grid) { const ci = S.cells._ci(k); if (!F.written.has(ci)) { _t1448WriteChunk(F, ci); F.written.add(ci); wb++; } }   // ★[T1448] 구역 한 줄(경계 값 · 그 구역 첫 키에서)
      else if (v !== null) db.upsertRoadCell(S.zoneId, k, v, d); else db.deleteRoadCell(S.zoneId, k);
      batch.push(k, v); F.i++; cur = null;
      if (cap && (F.grid ? wb : batch.length / 2) >= cap) { _flSt.capped++; break; }   // ★[T1493 · 정해진 것 3] 켬 = 쓴 구역 행으로 센다(이미 쓴 구역의 키는 쓰기 0 — 키로 세면 느린 묶음 한 번 뒤 상한이 키 하나로 무너져 그날 남은 키가 틱마다 하나씩 돈다)
      if (budgetMs > 0 && Date.now() - t0 >= budgetMs) break;
    }
    db.db.exec('COMMIT');
    F.n++;
  } catch (e) {
    try { db.db.exec('ROLLBACK'); } catch (_) { }
    for (let j = 0; j < batch.length; j += 2) S.dirty.add(batch[j]);
    for (let nx = F.it.next(); !nx.done; nx = F.it.next()) S.dirty.add(nx.value);   // ⓓ 이 묶음과 남은 키 — 다음 날 그때 값으로(종전과 같은 뜻)
    if (F.grid && cur !== null) S.dirty.add(cur);   // ★[T1448] 켬 = 던진 그 키도 다음 날(종전 끔 갈래는 그 키 하나를 놓친다 — 보고 T1448 회부 · 끔 글자 무변)
    _fl = null; _flCow = false;
    console.error(`[${S.zoneId}] 🛤️ 답압 길 저장 실패(다음 날 재시도 ${F.total - F.i + batch.length / 2}행):`, e.message);
    return;
  }
  if (!T713) for (let j = 0; j < batch.length; j++) F.out.push(batch[j]);
  const ms = _i688Now() - p0, rows = F.grid ? wb : batch.length / 2;   // ★[T1493] 켬 = 속도도 구역 행 ÷ ms(끔 = 종전 키 ÷ ms)
  if (budgetMs > 0 && rows > 0 && ms > 0) { const r = rows / ms; _flDayMin = _flDayMin ? Math.min(_flDayMin, r) : r; _flRate = _flDayMin; }
  _flSt.n++; if (ms > _flSt.maxMs) _flSt.maxMs = ms; if (rows > _flSt.maxRows) _flSt.maxRows = rows;
  if (T713) _t713Diff(F, batch);   // ★[T713] 이 묶음 키만 견준다(상한을 정한 ms 뒤 — 묶음 경계 그대로)
  if (!F.end) return;   // 다음 틱에 이어 쓴다
  _fl = null; _flCow = false;
  if (T713) { _t713End(F); return; }
  const kv = []; for (let j = 0; j < F.out.length; j += 2) kv.push([F.out[j], F.out[j + 1]]);
  _flushEnd(F, kv);
}
// ★[T1448] 구역 ci 를 경계 값으로 한 줄(있는 칸만 · 칸 자리 오름) — 지금 칸 + 쓰기 전 복사(그 사이 바뀐 칸 = 경계 값 · 새로 든 칸 = 없던 칸 · 지운 칸 = 있던 칸)
function _t1448WriteChunk(F, ci) {
  const G = S.cells, W = S.cellsW, gy = (ci / G.GW) | 0, gx = ci - gy * G.GW, cv = G.chunkView(ci), sn = F.snap.size > 0, db = G.d64 ? 0 : G.dB;   // ★[T1493] 판 칸 보기(구역 배열 대신)
  const li = [], vv = [], dd = [];
  for (let i = 0; i < RG.CC; i++) {
    const cx = (gx << RG.SHIFT) + (i & (RG.C - 1)), cy = (gy << RG.SHIFT) + (i >> RG.SHIFT); if (cx >= W || cy >= S.cellsH) continue;
    if (sn) { const k = cy * W + cx; if (F.snap.has(k)) { const sv = F.snap.get(k); if (sv) { li.push(i); vv.push(sv[0]); dd.push(sv[1]); } continue; } }
    if (cv && cv.V[cv.o | i] > 0) { li.push(i); vv.push(cv.V[cv.o | i]); dd.push(cv.D[cv.o | i] + db); }
  }
  if (!li.length) { S.db.deleteRoadChunk(S.zoneId, ci); return; }
  S.db.upsertRoadChunk(S.zoneId, ci, li.length, RG.encodeChunk({ n: li.length, li, v: vv, d: dd }));
}
// ★[T713] `S.sent` 고침 남은 몫 — 방송 뒤 틱들에 나눠 한다(budgetMs 0 = 남은 것 다)
let _t713Q = null;
function _t713Apply(budgetMs) {
  const Q = _t713Q; if (!Q) return;
  const t0 = _i688Now();
  while (Q.i < Q.k.length) {
    const k = Q.k[Q.i], lv = Q.lv[Q.i]; Q.i++;
    S.sent.set(k, lv); if (!lv) S.sent.delete(k);
    if (budgetMs > 0 && (Q.i & 255) === 0 && _i688Now() - t0 >= budgetMs) break;
  }
  if (Q.i >= Q.k.length) _t713Q = null;
}
// ★[T713] 묶음 하나의 견줌 — 종전 `_flushEnd` 루프의 몸 그대로(등급 · `S.sent` 견줌 · 방송 셀) · `S.sent` 고침만 끝 틱 뒤로 미룬다
function _t713Diff(F, batch) {
  if (_t713Q) _t713Apply(0);   // 앞날 고침이 남았으면 견주기 전에 다 한다(읽기 전에 쓰기 — 종전 차례)
  const C = F.chg || (F.chg = { k: [], lv: [], cells: [] });
  for (let j = 0; j < batch.length; j += 2) {
    const k = batch[j], v = batch[j + 1];
    const lv = v !== null ? (v >= T2 ? 2 : (v >= T1 ? 1 : 0)) : 0;
    if ((S.sent.get(k) || 0) !== lv) { C.k.push(k); C.lv.push(lv); C.cells.push(k % S.cellsW, (k / S.cellsW) | 0, lv); }
  }
}
function _t713End(F) {
  const C = F.chg || { k: [], lv: [], cells: [] };
  if (C.k.length) _t713Q = { k: C.k, lv: C.lv, i: 0 };   // `S.sent` 고침은 다음 틱부터(종전 고침 차례 그대로 · 읽는 자리는 다음 견줌뿐)
  const changed = C.cells;
  if (changed.length && S.broadcast) { try { S.broadcast({ type: 'road_cells', cells: changed }); } catch (_) { } }
  console.log(`[${S.zoneId}] 🛤️ 답압 길 day ${F.day}: 셀 ${F.cells}(등급 ${F.graded}) · 저장 ${F.lazy ? F.total : F.rows.length}행 · 클라 변경 ${changed.length / 3}셀 · 오늘 스탬프 ${F.stamped} · 묶음 ${F.n}`);
}
process.on('exit', () => { if (_fl) { try { _flushStep(0); } catch (e) { } } });   // ⓔ

// ★[T1448] 구역 ck 의 칸 자리 i → 칸 키(끔에서도 — 되돌림 · 덤프 되올림)
function _t1448Key(ck, i) { const G = RG || require('./road-grid'), GW = Math.ceil(S.cellsW / G.C), gy = (ck / GW) | 0, gx = ck - gy * GW; return ((gy << G.SHIFT) + (i >> G.SHIFT)) * S.cellsW + (gx << G.SHIFT) + (i & (G.C - 1)); }
// ★[T1448] 켬 부팅 — 구역 행을 읽는다(날 클램프 = 칸 행과 같은 줄) · 칸 행이 있으면(옛 DB) 그것도 읽어(더 새 값 — 덧쓴다) 지금 칸을 구역 행으로 한 거래에 옮긴다
function _t1448Boot(_tNow) {
  const db = S.db, Z = S.zoneId, t0 = Date.now();
  const nCh = db.countRoadChunks(Z), nCell = db.countRoadCells(Z);
  const KN = S.cellsW * S.cellsH; let outside = 0;   // 존 칸 밖 키(존 넓이가 바뀐 DB) — 배열에 자리가 없다 · 세고 건너뛴다(칸 행은 옮기며 지운다)
  if (nCh) for (const r of db.getRoadChunks(Z)) { const p = RG.decodeChunk(r.data); for (let j = 0; j < p.n; j++) { const k = _t1448Key(r.ck, p.li[j]); if (k < KN) S.cells.set(k, { v: p.v[j], d: Math.min(p.d[j], _tNow) }); else outside++; } }
  S.t1448Boot = { chunkRows: nCh, cellRows: nCell, readMs: 0, mig: null, outside: 0 };
  if (nCell) {
    for (const r of db.getRoadCells(Z)) { const k = r.cell_key | 0; if (k >= 0 && k < KN) S.cells.set(k, { v: r.v, d: Math.min(r.d | 0, _tNow) }); else outside++; }
    const t1 = Date.now(); let wrote = 0;
    try {
      db.db.exec('BEGIN');
      for (const ci of S.cells.chunkKeys()) { const p = S.cells.packChunk(ci); db.upsertRoadChunk(Z, ci, p.n, RG.encodeChunk(p)); wrote++; }
      db.deleteRoadCellsAll(Z);
      db.db.exec('COMMIT');
      S.t1448Boot.mig = { cellRows: nCell, chunkRows: wrote, ms: Date.now() - t1 };
      console.log(`[${Z}] 🛤️ [T1448] 칸 행 ${nCell} → 구역 행 ${wrote}(한 거래 · 앞서 있던 구역 행 ${nCh} · ${Date.now() - t1}ms)`);
    } catch (e) { try { db.db.exec('ROLLBACK'); } catch (_) { } S.t1448Boot.mig = { err: e.message }; console.error(`[${Z}] 🛤️ [T1448] 구역 행 옮기기 실패(되돌림 · 칸 행 그대로 · 다음 부팅 다시):`, e.message); }
  }
  S.t1448Boot.readMs = Date.now() - t0; S.t1448Boot.outside = outside;
  if (outside) console.error(`[${Z}] 🛤️ [T1448] 존 칸 밖 길 키 ${outside}개 — 건너뜀(존 넓이가 바뀐 DB)`);
}
// ★[T1448] 끔 부팅 — 구역 행이 있으면(켰던 DB) 칸 행으로 되돌린다(한 거래 · 같은 칸 칸 행이 이미 있으면 그쪽이 새 값) · 없으면 무동작
function _t1448BackBoot() {
  const db = S.db, Z = S.zoneId;
  if (!db.hasRoadChunks || !db.hasRoadChunks(Z)) return;
  const G = require('./road-grid'), t0 = Date.now(); let n = 0, ch = 0;
  try {
    db.db.exec('BEGIN');
    const have = new Set(db.getRoadCells(Z).map((r) => r.cell_key | 0));
    for (const r of db.getRoadChunks(Z)) {
      const p = G.decodeChunk(r.data); ch++;
      for (let j = 0; j < p.n; j++) { const k = _t1448Key(r.ck, p.li[j]); if (have.has(k)) continue; db.upsertRoadCell(Z, k, p.v[j], p.d[j]); n++; }
    }
    db.deleteRoadChunksAll(Z);
    db.db.exec('COMMIT');
    console.log(`[${Z}] 🛤️ [T1448] 손잡이 끔 — 구역 행 ${ch} → 칸 행 ${n}(한 거래 · ${Date.now() - t0}ms)`);
  } catch (e) { try { db.db.exec('ROLLBACK'); } catch (_) { } console.error(`[${Z}] 🛤️ [T1448] 칸 행 되돌리기 실패(구역 행 그대로 — 길이 비어 보인다 · scripts/t1448-road-migrate.js --back):`, e.message); }
}
// ★[T1448] 장부 메모리(배열 바이트 — 켬만) · 하네스 · 보고 자
function t1448Mem() { if (!(T1448 && S.ready)) return null; let due = 0; for (const a of I.due.values()) due += a.mem ? a.mem() : 0;
  return { cells: S.cells.mem(), sent: S.sent.mem(), paved: S.paved.mem(), lvl: I.lvl.mem(), sched: I.sched.mem ? I.sched.mem() : 0, due, coarse: S.coarse.mem ? S.coarse.mem() : 0, chunks: S.cells.nCh, size: S.cells.size }; }
// ★[T1448] 보이는 구역만(서버 문 — 회부 1 (가) · 존은 아직 안 부른다) — 구역 상자 [gx0..gx1]×[gy0..gy1](32칸 = 존 청크 1,024 px) 안 등급 칸 flat [cx, cy, lv, …] ·
//   `clientRoads` 와 같은 값 · 같은 식(그 상자 안만 · 칸 키 오름) · 끔이어도 같은 답
function clientRoadsBox(gx0, gy0, gx1, gy1) {   // ★[T1493] 몸통은 `clientRoadsIn` 하나(T1453 · 같은 식 · 같은 차례 — 상자 전체 행 우선) — 사본 0
  if (!S.ready) return null;
  return clientRoadsIn(gx0 * 32, gy0 * 32, (gx1 - gx0 + 1) * 32, (gy1 - gy0 + 1) * 32, []);
}
function init(deps) { // deps: { zoneId, cellsW, cellsH, epoch, dayMs, broadcast }
  if (!ENABLED) { console.log(`[${deps && deps.zoneId || 'zone'}] 🛤️ roads: ENABLE_ROADS=0 — 비활성(no-op)`); return; }
  try {
    S.zoneId = deps.zoneId; S.cellsW = deps.cellsW; S.cellsH = deps.cellsH;
    S.gw = Math.ceil(S.cellsW / COARSE); S.gh = Math.ceil(S.cellsH / COARSE);
    S.epoch = deps.epoch || 0; S.dayMs = deps.dayMs || 600000; S.broadcast = deps.broadcast || null;
    S.db = require('./zone-local-db');
    const t0 = Date.now();
    const _tNow = Math.floor((Date.now() - (deps.epoch || 0)) / (deps.dayMs || 600000));
    if (T1448) {   // ★[T1448] 배열 장부 · 구역 행(옛 DB = 칸 행을 한 거래로 옮긴다)
      S.cells = new RG.CellGrid(S.cellsW, S.cellsH); S.sent = new RG.U8Map(S.cellsW, S.cellsH); S.paved = new RG.BitSet(S.cellsW, S.cellsH); S.coarse = new RG.DenseU8(S.gw, S.gh);
      I.lvl = new RG.U8Map(S.cellsW, S.cellsH); I.sched = new RG.DayMap(S.cellsW, S.cellsH);
      S.dirty = new _T1448Dirty(S.cells);
      _t1448Boot(_tNow);
    } else {
    _t1448BackBoot();   // ★[T1448] 끔 — 켰던 DB(구역 행)면 칸 행으로 되돌린다 · 켠 적 없는 DB 는 무동작(표 하나 있나 보기만)
    const rows = S.db.getRoadCells(S.zoneId);
    for (const r of rows) S.cells.set(r.cell_key | 0, { v: r.v, d: Math.min(r.d | 0, _tNow) });   // ★미래 일번호 방어: dayLengthMs 변경(예: 10분→24분)으로 절대 일번호가 뒤로 점프하면 저장된 d가 미래가 되어 감쇠 정지 — 오늘로 클램프(1회성 이행)
    }
    S.lastDay = dayNow();
    // ★[T566] 다져진 길 집합 — 코스와 **같은 날·같은 식**으로 세운다(아래 `_rebuildCoarse` 가 같은 날로 다시 재도 아무도 안 빠진다).
    //   저장 v 는 T2 이상인데 오늘 감쇠로 아래면 — 꺼진 사이 풀린 셀이다(부르는 쪽이 시계가 선 뒤 풀어 준다).
    S.onPaved = deps.onPaved || null; S.onUnpaved = deps.onUnpaved || null;
    S.paved.clear(); S.bootUnpaved = [];
    if (T1448) S.cells.scan((k, rv, rd) => {   // ★[T1448] 배열 훑기 — 아래 고리와 같은 식 · 같은 차례(칸 키 오름 = 종전 DB 행 차례)
      const v = (S.lastDay > rd) ? rv * Math.pow(DK, S.lastDay - rd) : rv;
      if (v >= T2) S.paved.add(k); else if (rv >= T2) S.bootUnpaved.push(k);
    });
    else
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
  //   ★[T990] 켬(econ 날 함수가 넘어왔다)이면 날 바뀜은 틱이 아니라 하루 마감의 정한 자리(`dayTick` — 날을 올린 econ 머리 바로 뒤)가 정한다 — 틱은 묶음만.
  const day = _t990Day ? S.lastDay : Math.floor((now - S.epoch) / S.dayMs);
  if (day === S.lastDay) {   // ★[T630] 얼린 행을 틱마다 한 묶음
    if (_fl && !(T688_ON && _villagesBusy()) && !TB.out(_sliceMs(), 'roads')) { try { _flushStep(TB.slice(_sliceMs())); } catch (e) { } }
    else if (_t713Q && !TB.out(_sliceMs(), 'roads')) { try { _t713Apply(TB.slice(_sliceMs())); } catch (e) { } }   // ★[T713] 묶음이 없는 틱에 `S.sent` 고침 남은 몫   // ★[T688 ⓑ] 마을 하루 마감이 도는 틱엔 쉰다 · ★[T687] 켬 = 이 틱 남은 몫 · 없으면 다음 틱
    return;
  }
  _dayRoll(day);
}
function _dayRoll(day) {   // 하루 몸통 — 종전 `onGameTick` 끝 블록 글자 그대로(★[T990] 옮김 · 끔이면 위 틱 길만 부른다)
  S.lastDay = day;
  try {
    _t688Rebuild(day);   // ★[T688] 끔 = 종전 `_rebuildCoarse(day)` 그대로
    flushDaily(day);   // ★[T630] 로그는 마지막 묶음 뒤(`_flushStep`)
    S.stats.cellsTotal = S.cells.size;
    S.stats.stamped = 0;
  } catch (e) { console.error(`[${S.zoneId}] 🛤️ 답압 길 데일리 실패:`, e.message); }
}
// ★[T990] 켬 — 길의 하루(감쇠 · 코스 재구축 · 저장 묶음)를 econ 날 자리에서 — villages 하루 마감의 조각 하나(`deps.dayRoads` · 날을 올린 econ 머리 바로 뒤).
//   틱이 날 바뀜을 보면(종전) 그 틱이 마을 결산 몇 곳 뒤에 오느냐가 벽시계에 달린다(T986 도적 하루와 같은 꼴) — 그래서 자리를 박는다. 그날에 한 번 · 새 수 0.
function dayTick() {
  if (!S.ready || !_t990Day) return;
  const day = dayNow();
  if (day === S.lastDay) return;
  _dayRoll(day);
}

// ★★[T1382 ㉡ 2026-11-19 · T1372 회부 3] **길 닳음 모듈 메모리 전부 — 종료 저장에 싣고 다시 뜬 판이 그대로 선다** (존 손잡이 `T1340_RESUME_EXACT` 안 · 새 손잡이 0).
//   종전: 셀은 하루 마감에 바뀐 것만 DB 행으로(`flushDaily`) — 그날 찍힌 답압은 메모리에만 있어 다시 뜨면 잃었고, 부팅은 코스 지도 · 다져진 길 집합 · T688 표를
//     **지금 셀로 새로** 세웠다(한 번에 돈 판의 코스 지도는 그날 아침 재구축 + 그날 오른 칸 · T688 표는 그날 건드린 칸 줄 `tg` · 내려갈 길 `low` 를 쥔다).
//     → 다시 뜬 판의 몸 걸음 배율(`_rdMul`) · 교역로 A* 할인(`courseCostMul`)이 갈렸다.
//   켜면(존이 부른다) 셀(차례 · 값 · 날) · 코스 지도 · 다져진 길 · 바뀐 키 · 셈 · 부팅 풀림 줄 · T688 표(등급 · 문턱 날 · 칸 셈은 0 아닌 칸만)를 내고 받는다.
function t1382Dump() {
  if (!S.ready) return null;
  const sparse = (a) => { const o = []; if (a) for (let i = 0; i < a.length; i++) if (a[i]) o.push(i, a[i]); return o; };
  return { ...(T1448 ? { cells: [], cellsG: S.cells.chunkKeys().map((ci) => [ci, RG.encodeChunk(S.cells.packChunk(ci)).toString('base64')]) } : { cells: [...S.cells].map(([k, r]) => [k, r.v, r.d]) }),   // ★[T1448] 켬 = 칸은 구역 덩이째
    coarse: [...S.coarse], paved: [...S.paved], dirty: [...S.dirty], lastDay: S.lastDay, coarseGen: S.coarseGen,
    stats: Object.assign({}, S.stats), bootUnpaved: S.bootUnpaved.slice(), chgOn: S.chgOn, chg: S.chg ? [...S.chg] : null,
    I: I.ready ? { lvl: [...I.lvl], sched: [...I.sched], due: [...I.due].map(([d, a]) => [d, [...a]]), c1: sparse(I.c1), c2: sparse(I.c2), tgMark: sparse(I.tgMark), n: I.c1 ? I.c1.length : 0,
      graded: I.graded, tg: I.tg.slice(), low: [...I.low], same: I.coarse === S.coarse } : null };
}
function t1382Load(o) {
  if (!S.ready || !o || !Array.isArray(o.cells)) return false;
  //   같은 Map · Set 객체에 채운다(남이 쥔 참조 — `I.coarse` · 판 보기 — 가 그대로 산다)
  S.cells.clear(); for (const [k, v, d] of o.cells) S.cells.set(k, { v, d });
  if (Array.isArray(o.cellsG)) {   // ★[T1448] 구역 덩이(켠 판이 낸 덤프) — 켬 = 구역째 · 끔 = 칸 키 오름으로 Map 에(켠 판의 도는 차례)
    const G = RG || require('./road-grid'), all = [];
    for (const [ci, b] of o.cellsG) { const p = G.decodeChunk(Buffer.from(b, 'base64')); if (T1448) S.cells.unpackChunk(ci, p.li, p.v, p.d); else for (let j = 0; j < p.n; j++) all.push([_t1448Key(ci, p.li[j]), p.v[j], p.d[j]]); }
    if (!T1448) { all.sort((a, b) => a[0] - b[0]); for (const [k, v, d] of all) S.cells.set(k, { v, d }); }
  }
  S.coarse.clear(); for (const [k, v] of o.coarse) S.coarse.set(k, v);
  S.paved.clear(); for (const k of o.paved) S.paved.add(k);
  S.dirty.clear(); for (const k of o.dirty) S.dirty.add(k);
  S.lastDay = o.lastDay; S.coarseGen = o.coarseGen; S.stats = Object.assign({}, o.stats); S.bootUnpaved = (o.bootUnpaved || []).slice(); if ('chgOn' in o) { S.chgOn = !!o.chgOn; S.chg = o.chg ? new Set(o.chg) : null; }   // ★[T619] 바뀐 코스 칸 줄(교역로 다시 파기가 읽는다)
  if (o.I) {
    const un = (a, n) => { const u = new Uint8Array(n); for (let i = 0; i + 1 < a.length; i += 2) u[a[i]] = a[i + 1]; return u; };
    if (T1448) {   // ★[T1448] 켬 = 배열 그릇에 채운다(날 통은 이 `sched` 를 본다)
      I.lvl.clear(); for (const [k, x] of o.I.lvl) I.lvl.set(k, x);
      I.sched.clear(); for (const [k, x] of o.I.sched) I.sched.set(k, x);
      I.due = new Map(o.I.due.map(([d, a]) => { const L = new RG.DueList(I.sched, d); for (const k of a) L.add(k); return [d, L]; }));
    } else { I.lvl = new Map(o.I.lvl); I.sched = new Map(o.I.sched); I.due = new Map(o.I.due.map(([d, a]) => [d, new Set(a)])); }
    I.c1 = un(o.I.c1, o.I.n); I.c2 = un(o.I.c2, o.I.n); I.tgMark = un(o.I.tgMark, o.I.n);
    I.graded = o.I.graded; I.tg = o.I.tg.slice(); I.low = new Set(o.I.low); I.coarse = o.I.same ? S.coarse : new Map(S.coarse); I.ready = true;
  }
  return true;
}
// ★[T566] 다져진 길 셀 수 · 키(읽기만 — 존의 부팅 걷기 · 자)
function pavedCount() { return S.ready ? S.paved.size : 0; }
function pavedKeys() { return S.ready ? [...S.paved] : []; }
module.exports = { t1382Dump, t1382Load,   // ★[T1382 ㉡] 길 닳음 모듈 메모리(존 종료 저장 · 다시 뜬 판)
  T1448, t1448Mem, clientRoadsBox,   // ★[T1448] 배열 장부 손잡이 · 메모리 · 보이는 구역만(서버 문)
  SPD,   // ★[T1241] 사건 시뮬 걸음 토막이 칸 빠르기를 읽는다(도장 없이 — `levelOf` 등급 → 배율 · 읽기만)
  setEconDay, dayTick, roadDayPerf, retouchCell, unpaveSoonKeys, init, onGameTick, stampCell, stampEntityPx, speedMulOf, levelOf, courseCostMul, courseCostMin, courseCostMinIn, costFloor: () => Math.min(...COST), takeCoarseChanges, frozenView, coarseGen, isReady: () => S.ready, clientRoads, clientRoadsIn, pavedNear, pavedCount, pavedKeys, ENABLED, _S: S };
