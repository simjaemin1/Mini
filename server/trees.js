// === server/trees.js — 나무 정본 [재민 확정 2026-09-06 · T135] ==================
//
// T123 이 랩에서 답을 세웠고(`보고/T123_2026-09-05.md`), 이 파일이 그 답의 서버 자리다.
//
// ★★★**표는 여기 없다.** 원천은 `lab/전쟁실험실.html` 의 `TREES` 이고 `scripts/build-trees.js` 가
//   `server/trees.json` 으로 굽는다(월드 데이터는 빌드 스크립트 경유 — 손편집 금지 캐논).
//   이 파일은 **읽고 파생만** 한다. `server/crops.js` ← `crops.json` 과 한 글자도 다르지 않은 문법이다.
//
// ★★**종에 우열이 없다.** 축은 넷(목재 수율 · 성목 햇수 · 숯 수율 · 열매)뿐이고,
//   무엇이 값진지는 **그림자가격이 정한다**(`fellOK`). 표에 "좋은 나무"를 적지 않는다.
//
// ★★**주사위 금지.** 종은 자리의 함수다 — 같은 칸은 몇 번을 물어도 같은 종이고,
//   존이 바뀌면 숲의 얼굴이 바뀐다. `Crops.h32` 와 같은 문법(자리 × 씨).
//
// ⚠**econ 무접촉.** 계절은 `events.seasonOf` 를 **부르기만** 한다 — 365·90 같은 수를 여기 한 번도
//   안 적는다(`crops.js` 머리의 그 족보 그대로). econ 은 이 파일을 부르지 않는다 —
//   econ 이 필요로 하는 것은 `villages.js` 가 **주입**한다(`world.forageRealFn` · `priceFn` 선례).
'use strict';
const path = require('path');
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };
const DATA = require('./trees.json');
const TREES = DATA.trees || {};
const IDS = Object.keys(TREES);
const FRUIT_IDS = IDS.filter((k) => TREES[k].fruit);

// ★게임일 정수화 — `| 0` 금지(int32 절단 · crops.js 와 같은 계약)
const _day = (x) => { const v = Math.floor(Number(x)); return Number.isFinite(v) ? v : 0; };
let _Events = null;
function _events() { if (!_Events) _Events = require('./events'); return _Events; }
function seasonOfDay(day) { return _events().seasonOf(_day(day)); }
function yearDays() { try { const y = _events().yearDaysOf && _events().yearDaysOf(); return y > 0 ? y : 365; } catch (e) { return 365; } }

// ── 되돌림 손잡이 ────────────────────────────────────────────────────────────
// `T135_TREES=0` 이면 이 층 전체가 잠든다 — 종 축·열매·부등식·채집 실체가 전부 꺼지고
// 세계는 T134 이전과 **비트 동일**하게 돈다(하네스가 그걸 검사한다).
const ON = () => _num('T135_TREES', 1) !== 0;

// ★계절 이름은 events 정본의 것을 쓴다. 표의 `fs` 는 0봄 1여름 2가을 3겨울(랩 순서)이라
//   그 순서만 여기서 이름으로 옮긴다 — 계절 **길이·경계**는 한 자도 안 적는다.
const _SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
function fruitSeasonOf(id) { const t = TREES[id]; return t ? (_SEASON_NAMES[t.fs | 0] || 'autumn') : 'autumn'; }

// ── 표 읽기 ──────────────────────────────────────────────────────────────────
function get(id) { return TREES[id] || null; }
function ids() { return IDS.slice(); }
function fruitIds() { return FRUIT_IDS.slice(); }
function koOf(id) { const t = get(id); return t ? t.ko : id; }
function woodOf(id) { const t = get(id); return t ? +t.wood : 1; }
function charOf(id) { const t = get(id); return t ? +t.char : 0; }
function fruitOf(id) { const t = get(id); return t ? (t.fruit || null) : null; }
function fruitYieldOf(id) { const t = get(id); return t ? +t.fy : 0; }
function isFruitTree(id) { return !!fruitOf(id); }
function matureYearsOf(id) { const t = get(id); return t ? +t.mature : 0; }
// 열매 품목 → 그 품목을 내는 종들(추상 산출을 걷어낼 때 economy 쪽이 이 목록을 읽는다)
function fruitItems() { return Array.from(new Set(FRUIT_IDS.map((k) => TREES[k].fruit))); }

// ── ★종 배정 — 자리의 함수 ──────────────────────────────────────────────────
// `Crops.h32` 와 같은 셈(사본이 아니라 **호출**이다 — 해시는 정본이 하나여야 한다).
let _Crops = null;
function _h32(a, b, c) {
  if (!_Crops) { try { _Crops = require('./crops'); } catch (e) { _Crops = null; } }
  if (_Crops && _Crops.h32) return _Crops.h32(a, b, c);
  // crops 를 못 불러오는 판(단독 하네스)에서만 같은 셈을 로컬로 — 값은 동일하다.
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function _zoneSeed(zoneId) {
  let h = 0; const s = String(zoneId == null ? '' : zoneId);
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h >>> 0;
}
/** 그 자리에 선 나무의 **종**. 셀 좌표(32px 격자)와 존 씨의 함수 — 주사위 0 · 멱등. */
function speciesAt(zoneId, cx, cy) {
  if (!ON()) return IDS[0];                       // 되돌림: 종 축이 없던 세계 = 한 종
  return IDS[_h32(cx | 0, cy | 0, _zoneSeed(zoneId)) % IDS.length];
}

// ── ★재생 시계 — T122 의 단계 판정을 **종별 햇수**와 결합한다 ────────────────
// T122 는 종이 하나뿐일 때 소나무 논문값(그루터기 22년 · 성목 52년)을 그대로 세웠고,
// 스스로 적어 뒀다: *"종별 표는 T123 카탈로그가 온 뒤다(회부)."* 여기가 그 자리다.
//
// ⚠**두 시계가 25배 어긋난다**(보고 §0-ⓒ) — 논문값 52년 vs 랩 로지스틱 회복 ≈ 2~3 게임년.
//   재민 판정 전이라 **둘 다 살려 둔다**: 손잡이 하나로 고른다.
//     `T135_MATURE=lab`(기본) — 표의 `mature`(종별 4~40 게임년). 그루터기 기간은 T122 의 **비율**을
//        그대로 쓴다(22/52) — 새 수 0. 참나무 40년 · 머루 4년처럼 종이 갈린다.
//     `T135_MATURE=t122`      — 종전 그대로(모든 종 22/52). 되돌림 경로.
const MATURE_MODE = () => String(process.env.T135_MATURE || 'lab');
/** 이 종의 (그루터기 끝 해, 성목 해) — 게임년. T122 손잡이가 비율의 정본이다. */
function stageYearsOf(id, t122StumpY, t122FullY) {
  const sY = Number(t122StumpY), fY = Number(t122FullY);
  if (!ON() || MATURE_MODE() !== 'lab') return [sY, fY];
  const m = matureYearsOf(id);
  if (!(m > 0) || !(fY > 0)) return [sY, fY];
  return [m * (sY / fY), m];                       // 비율 유지 — 지어낸 수 0
}

// ── ★열매 — 베지 않고 딴다 (lazy · 틱 0) ────────────────────────────────────
// 랩(T123 §2②)과 **같은 규약 넷**: 재고 = 연간수율 × 크기 · 연 1회(결실철 첫 진입에 채움) ·
// 겨울 소멸 · 볼 때 정산. 저장은 부르는 쪽의 Map 이고, 이 함수는 그 칸 하나를 오늘로 맞춘다.
//
// @param store  Map<key, {n, yr}> — 부르는 쪽이 쥔다(청크·마을 어디든)
// @param size   0..1 — 그 나무의 크기(랩의 richness/L_WOODMAX 자리)
function fruitSettle(store, key, id, day, size) {
  if (!ON()) return 0;
  const t = get(id); if (!t || !t.fruit) return 0;
  const d = _day(day), Y = yearDays();
  const yr = Math.floor(d / Y), se = seasonOfDay(d);
  let e = store.get(key);
  if (!e) { e = { n: 0, yr: -1 }; store.set(key, e); }
  if (se === 'winter') { if (e.yr !== yr || e.n > 0) { e.n = 0; e.yr = yr; } return 0; }   // 겨울 = 소멸
  if (se === fruitSeasonOf(id) && e.yr !== yr) {                                          // 그 철 첫 정산에 한 번
    const sz = Number.isFinite(size) ? Math.max(0, Math.min(1, size)) : 1;
    e.n = +(t.fy * sz).toFixed(4); e.yr = yr;
  }
  return e.n;
}
/** 딴 만큼 빼고 딴 양을 돌려준다(못 따면 0). 나무는 안 죽는다 — hp 무접촉. */
function fruitTake(store, key, id, day, size, want) {
  const have = fruitSettle(store, key, id, day, size);
  if (!(have > 0)) return 0;
  const take = Math.min(have, Math.max(0, Number(want) || 0));
  if (take <= 0) return 0;
  const e = store.get(key); e.n = Math.max(0, e.n - take);
  return +take.toFixed(4);
}

// ── ★★벌목 부등식 — **새 수 0** ─────────────────────────────────────────────
//     w(목재)×목재수율  ≥  성목햇수 × w(열매)×연간열매수율   ⇒ 벤다
//   왼쪽은 "지금 베어 얻는 것", 오른쪽은 "다시 자랄 때까지 잃는 것"이다. 값은 시장이 정한다.
//   `w` 는 그림자가격 조회 함수(정본은 econ 의 `priceFn` — 여기서 표를 다시 만들지 않는다).
function fellOK(id, w) {
  const t = get(id); if (!t) return true;
  if (!t.fruit) return true;                       // 목재 전용 종 — 언제나 벤다(사전식 ①의 근거)
  if (typeof w !== 'function') return true;        // 값을 모르면 종을 안 가린다(랩과 같은 계약)
  return w('wood') * t.wood >= t.mature * w(t.fruit) * t.fy;
}

// ══ ★★★econ 주입 — **나무 층이 econ 에게 열매를 대는 문 하나** ═══════════════
//
// econ 은 지형도 청크도 모른다(그게 옳다). `priceFn` 이 그랬듯 **world 에 꽂아 준다**.
// 꽂는 자리는 이 함수 하나뿐이고, 서버(`villages.js`)와 계측기(`t17-metrics.js`)가 **같은 문**을 쓴다.
//   ⚠족보 130: *"0줄은 계측기가 안 재는 것의 결과일 수 있다."* 계측기가 이 문을 안 열면
//     여덟 수는 대체를 못 본다 — 그래서 하네스가 **두 자리 다** 이 함수를 부르는지 검사한다.
//
// ★★예산은 **지어낸 수가 아니라 유도**다(새 수 0):
//   ① 숲 몫  `forShare = (land.wood − FLOOR.wood) / GAIN.wood`  ← `livelihood.js` 정본의 역함수
//   ② 숲 셀  `forShare × π × R²`                                 ← `villages.LAND_SCAN_R`(부존 스캔 반경)
//   ③ 나무 수 `숲 셀 × chunk.forestTreesPerCell()`               ← 숲 그리드 정본(간격·빈자리)
//   ④ 종 몫  종은 자리의 함수라 넓은 면적에선 **고르게** 섞인다 ⇒ 종당 1/종수
//   ⑤ 크기   `chunk` 의 크기는 U(0,1) ⇒ 평균 0.5 (분포의 평균이지 새 수가 아니다)
//   ⇒ 품목별 연간 예산 = Σ_그 품목을 내는 종 (나무 수 × 1/종수 × fy × 0.5)
//
// ★규약 넷은 랩과 같다: 연 1회(결실철 첫 진입에 채움) · 겨울 소멸 · 볼 때 정산 · 못 대면 덜 온다.
const SIZE_MEAN = 0.5;                              // chunk 의 크기 U(0,1) 평균 — 분포의 성질
let _LV = null, _CH = null, _VG = null;
function _livelihood() { if (!_LV) { try { _LV = require('./livelihood'); } catch (e) { _LV = null; } } return _LV; }
function _chunk() { if (!_CH) { try { _CH = require('./chunk'); } catch (e) { _CH = null; } } return _CH; }
function _scanR() {
  if (_VG === undefined || _VG === null) { try { _VG = require('./villages'); } catch (e) { _VG = false; } }
  const r = _VG && _VG.LAND_SCAN_R;
  return r > 0 ? r : 140;                           // villages 를 못 부르는 판(단독 하네스)에서만
}
/** 이 마을 숲의 나무 수(유도 · 위 ①②③). 못 재면 0. */
function treeCountOf(v) {
  const LV = _livelihood(), CH = _chunk();
  if (!LV || !CH || !v || !v.land) return 0;
  const w = Number(v.land.wood);
  if (!Number.isFinite(w)) return 0;
  const forShare = Math.max(0, Math.min(1, (w - LV.FLOOR.wood) / (LV.GAIN.wood || 1)));
  const R = _scanR();
  const cells = forShare * Math.PI * R * R;
  return cells * CH.forestTreesPerCell();
}
/** 품목별 **연간** 예산(위 ④⑤). `{item: amount}` */
function annualFruitBudget(v) {
  const out = {};
  if (!ON()) return out;
  const n = treeCountOf(v);
  if (!(n > 0)) return out;
  const per = n / IDS.length;                       // 종은 자리의 함수 — 넓게 보면 고르다
  for (const id of FRUIT_IDS) {
    const t = TREES[id];
    out[t.fruit] = (out[t.fruit] || 0) + per * t.fy * SIZE_MEAN;
  }
  return out;
}
/**
 * ★오늘 채집꾼 하나가 그 마을 숲에서 딴 것. `want` 는 econ 이 **걷어낸 몫만큼**만 요구한다.
 * 예산은 마을에 붙어 lazy 로 정산된다(연 1회 채움 · 겨울 0) — 틱 0 · 주사위 0 · 멱등.
 */
function forageTake(v, want, day) {
  const out = {};
  if (!ON() || !(want > 0)) return out;
  const d = _day(day != null ? day : (v._world && v._world.day) || 0);
  const Y = yearDays(), yr = Math.floor(d / Y), se = seasonOfDay(d);
  let st = v._t135;
  if (!st) { st = v._t135 = { yr: -1, left: {} }; }
  if (se === 'winter') { if (st.yr !== yr || Object.keys(st.left).length) { st.yr = yr; st.left = {}; } return out; }
  if (st.yr !== yr) { st.yr = yr; st.left = annualFruitBudget(v); }
  // 그 철에 든 품목만 딸 수 있다(결실철 규약) — 철이 아니면 나무에 열매가 없다.
  const inSeason = {};
  for (const id of FRUIT_IDS) if (fruitSeasonOf(id) === se) inSeason[TREES[id].fruit] = true;
  const keys = Object.keys(st.left).filter((k) => inSeason[k] && st.left[k] > 0);
  if (!keys.length) return out;
  // 남은 예산에 비례해 `want` 를 나눈다(정해진 순서 — 주사위 0).
  let tot = 0; for (const k of keys) tot += st.left[k];
  if (!(tot > 0)) return out;
  for (const k of keys) {
    const take = Math.min(st.left[k], want * (st.left[k] / tot));
    if (take > 0) { st.left[k] -= take; out[k] = +take.toFixed(6); }
  }
  return out;
}
/** ★문 하나 — 서버와 계측기가 **같은 이것**을 부른다. 두 번 불러도 안전(멱등). */
function attachToWorld(world) {
  if (!world || !ON()) return world;
  // ★★걷어내는 것은 **나무가 실제로 대는 품목뿐**이다 — `acorn`·`chestnut`·`mulberry`·`grape`.
  //   ⚠추상 `fruit`(`fert×0.8+0.25`)은 **안 걷는다.** 카드가 그 이름을 지목했지만, §0-ⓐ 실측이
  //     그 자리가 나무가 아니라고 말한다: 그 가중치는 **비옥도**에 달려 있다(숲 `wood` 가 아니라).
  //     즉 econ 의 `fruit` 은 들·풀밭의 야생 열매이고, 그걸 내는 실체는 **덤불**(`berry_bush`)이다 —
  //     덤불은 숲 그리드에 없다(청크당 0.75그루 vs 나무 340그루). 나무 층이 가져갈 자리가 아니다.
  //     ⇒ 덤불 실체화는 **별도 카드**로 회부한다. 여기서 걷으면 공급원 없이 20% 를 지우는 셈이다.
  world.forageRealItems = fruitItems();
  world.forageTakeFn = (v, want) => forageTake(v, want, world.day);
  world._t135 = 1;
  return world;
}

module.exports = {
  attachToWorld, forageTake, annualFruitBudget, treeCountOf, SIZE_MEAN,
  ON, get, ids, fruitIds, koOf, woodOf, charOf, fruitOf, fruitYieldOf, isFruitTree,
  matureYearsOf, fruitItems, fruitSeasonOf, seasonOfDay, yearDays,
  speciesAt, stageYearsOf, fruitSettle, fruitTake, fellOK,
  MATURE_MODE, _axes: DATA._axes,
};
