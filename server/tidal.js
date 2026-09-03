// === server/tidal.js — 갯벌(潮間帶) 채집 정본 [재민 확정 2026-09-02 · T52] ==========
//
// T3 자염이 **갯벌을 열었다**(바다에 접한 뭍 = `salt.isTidalFlat`). 그때 그 자리에서 할 수 있는 건
// 짠물을 뜨는 것 하나뿐이었고, 회부에 *"조개·해조 채집"* 을 적어 뒀다. 이 파일이 그 회부다.
//
// ★★**새 지형층도 새 배치기도 없다.** 갯벌 판정은 `salt.isTidalFlat` 그대로 쓰고,
//   채집 배선은 `forage.sourceAt` 의 ⓪ 갈래를 나눠 탄다. 이 파일이 새로 정하는 건 딱 둘이다:
//     ① **물때** — 지금 갯벌이 드러났나(시각의 순수 함수)
//     ② **무엇이 잡히나** — 자리 × 물때의 결정론 함수
//
// ★★★**주사위 0.** 낚시 v2 의 `_fishSpeciesFor` 와 **같은 계보**다 —
//   "없는 물고기를 주사위로 만들지 마라"(재민 확정 08-26)의 갯벌판.
//   같은 자리·같은 물때면 **언제 몇 번을 다시 물어도 같은 답**이 나온다.
//   ⇒ 그래서 **아는 사람은 안다**: 어느 갯골에 굴이 붙는지, 언제 물이 빠지는지.
//
// ★★**틱 0.** 물때 표를 만들어 두고 갱신하지 않는다 — 물어볼 때 닫힌 해로 계산한다
//   (광맥 번영도 · 어장 · 채집 군락 · 부패 곡선 · 작물 성장 · 노출 누적표에 이은 **일곱 번째**).
//
// ⚠**econ 무접촉.** 산출은 전부 `specialty.RESOURCES` 에 **이미 있는 재화 id 그대로**다
//   (굴 `oyster` · 해조 `seaweed` · 전복 `abalone`). T3 소금 규약 동형 — **새 품목 금지**.
//   그래야 로트·무게·거래·장부가 특별 취급 없이 다룬다(실제로 `lots.isLot` 이 `category==='marine'`
//   이라 **이미 true** 다 — 로트를 우리가 붙이는 게 아니라 이미 붙어 있었다).
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) ? v : d; };

// ── ① 물때 ──────────────────────────────────────────────────────────────────
//   ★고증: 한반도 서·남해는 **반일주조**(하루 두 번 밀물·썰물)이고 주기는 M2 분조 **12시간 25분**이다.
//     달의 하루(24h50m)의 절반 — 그래서 물때는 매일 약 50분씩 늦어진다.
//   ★그 12h25m 을 **게임 시간으로 환산하지 않고 벽시계로 쓴다.** 이유:
//     · 제작·대기열이 이미 벽시계다(오프라인 진행이 뜻을 가지려면 그래야 한다 — `facility.js` 규약).
//     · 게임일이 24분이라 12h25m 을 게임 시간으로 옮기면 실시간 **12.4분**이 된다.
//       공교롭게 그게 사람이 기다릴 만한 길이라, 환산해도 같은 수가 나온다. 그래서 **덜 도는 쪽**을 골랐다.
//   ⇒ 물때는 `Date.now()` 의 순수 함수다. 하네스는 `ms` 를 직접 넣어 결정론을 검사한다.
const CFG = {
  PERIOD_MS: Math.max(60000, Math.round(_num('TIDE_PERIOD_MIN', 12.4206) * 60000)),  // 반일주조 한 주기
  OPEN_FRAC: Math.min(0.9, Math.max(0.05, _num('TIDE_OPEN_FRAC', 0.35))),            // 간조 전후 이만큼이 '드러난 갯벌'
  RARE_FRAC: Math.min(0.5, Math.max(0, _num('TIDE_RARE_FRAC', 0.06))),               // 전복이 붙어 있는 자리의 비율
  WEED_FRAC: Math.min(0.9, Math.max(0.05, _num('TIDE_WEED_FRAC', 0.45))),            // 해조밭의 비율(나머지가 조개밭)
  CELL_PX: 32,
};

// 물때 위상 0..1 — 0 = 간조(물이 가장 많이 빠진 때) · 0.5 = 만조.
//   ⚠`| 0` 금지(족보 (77)) — 게임일이 아니라 ms 지만 같은 규약을 지킨다.
// ★★시험용 시각 주입 — **기본은 꺼져 있다**(`null`). 하네스만 쓴다.
//   왜 필요한가: 물때는 벽시계의 함수라, 이걸 없이 쓰면 하네스의 판정이 **돌리는 시각에 따라 갈린다** —
//   "썰물일 때만 통과하는 검사"는 자명 통과다(족보 (56)). 시각을 못 박아야 두 상태를 다 밟는다.
//   ⚠`__e2e_day_freeze` 와 같은 계보의 시험 손잡이다. 운영 경로는 이 값을 절대 안 세운다
//   (`test-tidal` 이 "기본이 null 인가"를 검사한다).
//   ⚠자식 프로세스(실클라 e2e)는 함수를 못 부르므로 **env 로도** 받는다 — `E2E_GIVE` 와 같은 계보.
let _nowOverride = (() => { const v = parseFloat(process.env.TIDE_FREEZE_MS); return Number.isFinite(v) ? v : null; })();
function __setNow(ms) { _nowOverride = Number.isFinite(ms) ? ms : null; return _nowOverride; }
function __nowOverride() { return _nowOverride; }
function nowMsOf(nowMs) {
  const t = Number(nowMs);
  if (Number.isFinite(t)) return t;
  return _nowOverride == null ? Date.now() : _nowOverride;
}
function phaseAt(nowMs) {
  const ms = nowMsOf(nowMs);
  const p = (ms % CFG.PERIOD_MS) / CFG.PERIOD_MS;
  return p < 0 ? p + 1 : p;
}
// 수위 0(간조)~1(만조) — 부드러운 코사인. **겉은 계단, 속은 연속** 규약 그대로.
function levelAt(nowMs) { return (1 - Math.cos(2 * Math.PI * phaseAt(nowMs))) / 2; }
// 지금 갯벌이 드러났나 — 간조를 중심으로 `OPEN_FRAC` 만큼의 창.
function isOpen(nowMs) {
  const p = phaseAt(nowMs);
  const d = Math.min(p, 1 - p);          // 간조(0)까지의 거리
  return d <= CFG.OPEN_FRAC / 2;
}
// 다음에 물이 빠지는 때까지 남은 ms (지금 열려 있으면 0) — 화면 안내가 쓴다.
function untilOpenMs(nowMs) {
  if (isOpen(nowMs)) return 0;
  const p = phaseAt(nowMs), half = CFG.OPEN_FRAC / 2;
  const next = (1 - half);               // 다음 간조 창의 시작 위상
  return Math.round(((next - p + 1) % 1) * CFG.PERIOD_MS);
}
// 물때 이름 — 우리말 물때 어휘를 쓴다(숫자를 화면에 뿌리지 않는다).
function tideKo(nowMs) {
  const l = levelAt(nowMs);
  if (isOpen(nowMs)) return '한사리 썰물(갯벌이 드러났다)';
  return l > 0.75 ? '밀물 한물(물이 찼다)' : '물이 드나든다';
}

// ── ② 무엇이 잡히나 — 자리 × 물때의 결정론 ─────────────────────────────────
//   ★해시는 낚시 자리·야생 채종이 쓰는 그 문법이다(정수 혼합 — 부동소수 누적 없음).
function _hash(a, b, c) {
  let h = (a | 0) * 374761393 + (b | 0) * 668265263 + (c | 0) * 2246822519;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
// 산출 3종 — **전부 econ 재화 id 그대로**(새 품목 0).
// ⚠★[T59 2026-09-03] **포만감(hunger)을 여기서 뺐다.** 식량의 단위가 열량이 되면서
//   `server/kcal.js` 가 kg × kcal/kg 로 유도한다 — 손글씨 3·4·8 은 그 순간 **안 읽히는 사본**이 됐다
//   (족보 (89): 안 읽히는 사본은 "무해"가 아니라 "아직 안 터진 것"이다). 갈증만 남는다.
const CATCH = {
  seaweed:  { ko: '해조',   emo: '🌿', shelf: _num('TIDE_SHELF_SEAWEED', 6),   food: { thirst: 2 } },
  oyster:   { ko: '굴',     emo: '🦪', shelf: _num('TIDE_SHELF_OYSTER', 2),    food: { thirst: 3 } },
  abalone:  { ko: '전복',   emo: '🐚', shelf: _num('TIDE_SHELF_ABALONE', 2.5), food: { thirst: 2 } },
};
// ★보관일 근거: **조개 ≤ 생선**(카드 요구 · 생선 2.5). 생굴은 실제로 생선보다 빨리 상한다 ⇒ **2.0**.
//   전복은 껍데기째라 조금 낫다 ⇒ 2.5(생선과 같다). 해조는 채소급 ⇒ 6(미역은 며칠 간다).
//   ⚠값을 여기 적고 `spoil.SHELF_DAYS` 가 **읽어 간다**(작물이 이미 쓰는 주입 문법 — 두 벌 금지).

// 이 자리에서 지금 무엇이 나오나. 갯벌이 아니거나 물이 차 있으면 null.
//   ★**자리가 종류를 정하고, 물때가 문을 연다.** 두 축이 따로다:
//     · 해조밭이냐 조개밭이냐는 **자리**의 성질이다(물때가 바뀌어도 안 변한다 — 아는 사람은 안다).
//     · 그 조개밭에서 굴이 나오나 전복이 나오나는 **자리 × 물때** — 사리 때 더 깊이 드러나는 곳에 전복이 붙는다.
function pickAt(x, y, nowMs) {
  const ms = nowMsOf(nowMs);
  if (!isOpen(ms)) return null;
  const cx = Math.floor(x / CFG.CELL_PX), cy = Math.floor(y / CFG.CELL_PX);
  if (_hash(cx, cy, 7717) < CFG.WEED_FRAC) return 'seaweed';
  const tideIdx = Math.floor(ms / CFG.PERIOD_MS);   // 몇 번째 물때인가
  return _hash(cx, cy, tideIdx) < CFG.RARE_FRAC ? 'abalone' : 'oyster';
}
function isCatch(item) { return Object.prototype.hasOwnProperty.call(CATCH, item); }
function koOf(item) { return (CATCH[item] || {}).ko || item; }

// ── ③ 그릇 — **병은 소모품이 아니라 그릇이다** [T54 재민 확정 2026-09-02] ────────
//   T3 이 세운 규약("가마가 빈 병을 돌려준다")을 **민물까지 넓힌다.** 지금까지 물병은
//   갯벌에서만 쓸모가 있었다 — 짠물을 뜨는 그릇. 그래서 내륙에서는 죽은 물건이었고,
//   물은 **물가에서만** 마실 수 있었다(들판 횡단이 갈증으로 잘렸다).
//   ⇒ 민물도 담긴다. 담으면 병이 물이 되고, 마시면 물이 병이 된다 — **개수가 보존된다.**
//   ★★`salt.js` 를 여기서 부르는 게 사본을 막는 유일한 길이다: 용기 id 도 짠물 id 도 T3 것이다.
//     (`salt` 는 아무것도 require 하지 않는 잎이라 맞물림이 안 생긴다 — `forage` 가 이미 둘 다 늦게 부른다.)
const Salt = require('./salt');
const FRESH = 'fresh_water';
// ★마신 한 되가 채우는 갈증. **새 수를 짓지 않았다** — `zone.tryGather` 의 물가 회복량(+30) 그대로다.
//   ⚠그 값은 zone 안의 **리터럴**이라 여기서 참조할 수가 없다(상수로 올리려면 zone 한 줄이 더 든다 —
//     이 카드의 zone 예산 3줄을 넘는다). ⇒ **하네스가 소스를 읽어 두 수가 갈라지면 빨개진다**
//     (`test-tidal` 의 계약 검사). 사본을 못 만들게 막는 값싼 방법이고, 승격은 회부 G 에 적었다.
const DRINK_THIRST = _num('TIDE_DRINK_THIRST', 30);
// 용기가 드는 채집 갈래 — 짠물(T3)과 민물(T54). `zone.tryForage` 의 게이트가 이 술어를 묻는다.
//   ★zone 이 `src.kind === Salt.BRINE` 을 다시 적으면 그게 사본이고, 다음에 그릇이 하나 더
//     늘어나는 날(항아리·바가지) 그 줄만 뒤처진다. 표의 주인이 술어를 갖는다.
function usesVessel(kind) { return kind === Salt.BRINE || kind === FRESH; }
// 그릇으로 담는 것들 — 무게는 **T3 이 세운 한 되 1.00kg 그대로**(물병↔짠물↔민물이 서로 바뀌므로
//   무게가 다르면 채수만으로 몸무게가 변한다 — `salt.CFG.BRINE_KG` 가 그 근거다).
const VESSELS = {
  [FRESH]: { ko: '민물 한 되', kg: Salt.CFG.BRINE_KG,
             food: { thirst: DRINK_THIRST, returns: Salt.VESSEL } },   // ★[T59] `hunger: 0` 은 지웠다 — 열량이 0 이라 유도가 저절로 0 을 낸다
};

// ── ④ 말리기 — 갯벌이 겨울까지 간다 [T54] ──────────────────────────────────
//   ★★**계수를 짓지 않았다.** 말리기는 이 레포에 이미 두 줄 있고(생선·과실), 그중 **양쪽 값이
//     다 있는 완전한 앵커는 과실 하나**다: 딸기 0.50kg·허기 6 → 말린 과실 0.13kg·허기 16.
//     ⇒ 잔량비 **0.26** 과 허기 배수 **16/6** 이 그 한 줄에서 그대로 나온다. 둘 다 여기 적는 게 아니라
//       **역산한 값**이다(작물 층의 `HUNGER_PER_SUBS` 1.4 와 같은 수법 — 앵커는 이미 코드 안에 있었다).
//   ★갈증은 **부호만 뒤집는다**: 원물이 주던 물기를 마른 것은 도로 가져간다(새 계수 0).
//     보존식이 갈증을 주는 규약(`PRESERVED_EFFECTS`)의 유도판이다.
//   ⚠보관일·이름·레시피는 여기 없다 — **`spoil.PRESERVED_ITEMS`/`PRESERVE` 가 보존식의 정본**이다.
//     여기는 원물이 정본인 것(무게·허기·갈증)만 유도한다.
const DRY_RESIDUE = Math.max(0.01, _num('TIDE_DRY_RESIDUE', 0.26));   // 말린 과실 0.13 ÷ 생과 0.50
// ⚠★[T59] `DRY_HUNGER`(말린 과실 16 ÷ 딸기 6) 는 **지웠다** — 열량이 정본이 되면서 안 읽히게 됐다.
//   역산 앵커라는 수법 자체는 옳았지만 **앵커(생곡 7)가 썩어 있었다**. 지금은 kcal 이 그 자리다.
const DRY = {
  dried_oyster:  { from: 'oyster'  },
  dried_seaweed: { from: 'seaweed' },
};
function driedOf(item) { return DRY[item] || null; }
// 마른 것의 **식품 효과** — 원물에서 유도한다(zone 의 `PRESERVED_EFFECTS` 가 읽어 간다).
//   ⚠★[T59] 허기는 뺐다 — **보존은 열량을 늘리지 않는다**(수분만 빠진다)는 것이 이제 정본이고,
//     `kcal.js` 가 원물 열량 그대로 유도한다. `DRY_HUNGER`(역산 앵커)는 그래서 **더 안 읽힌다**.
function driedEffects() {
  const o = {};
  for (const [k, d] of Object.entries(DRY)) {
    const src = CATCH[d.from]; if (!src) continue;
    o[k] = { thirst: -Math.abs(src.food.thirst) };
  }
  return o;
}
// ★무게 표 — `weights.js` 가 읽어 간다(플레이어 층 유도값이라 econ 표에 없다).
//   원물 kg 은 **econ 정본**(`specialty.RESOURCES`)에서 온다 — 여기서 발명하지 않는다.
function weightMap() {
  const o = {};
  for (const [k, v] of Object.entries(VESSELS)) o[k] = v.kg;
  let SP = null; try { SP = require('./specialty'); } catch (e) {}
  for (const [k, d] of Object.entries(DRY)) {
    const raw = SP && SP.RESOURCES && SP.RESOURCES[d.from] ? SP.RESOURCES[d.from].weight : null;
    if (raw > 0) o[k] = +(raw * DRY_RESIDUE).toFixed(3);
  }
  return o;
}

// ── ③ 다른 정본에게 넘기는 표들 (두 벌로 적지 않는다) ───────────────────────
function shelfMap() { const o = {}; for (const [k, v] of Object.entries(CATCH)) o[k] = v.shelf; return o; }
function foodMap()  { const o = {}; for (const [k, v] of Object.entries(CATCH)) o[k] = Object.assign({}, v.food);
                     for (const [k, v] of Object.entries(VESSELS)) o[k] = Object.assign({}, v.food); return o; }
function labelMap() { const o = {}; for (const [k, v] of Object.entries(CATCH)) o[k] = v.ko;
                     for (const [k, v] of Object.entries(VESSELS)) o[k] = v.ko; return o; }
// 조리 — **기존 요리 문법에 그대로 얹힌다.** `doCook` 은 시설 대기열에 걸고 **요리 인스턴스**를 낸다.
//   ⚠`produces` 를 **안 적는다**: `doCook` 이 그 필드를 읽지 않는다(T3 이 물병으로 밟은 자리 · 족보 (83)).
//     적으면 "이걸 산출한다"는 거짓말이 코드에 남는다.
function cookMap() {
  return {
    clam_stew:    { cost: { oyster: 3 },  label: '조개탕' },
    seaweed_soup: { cost: { seaweed: 2 }, label: '미역국' },
  };
}
// ★★zone.js 접점은 **이 한 줄뿐이다**(`Tidal.install({...})`).
//   왜 zone 이 세 표를 각각 순회하지 않고 여기서 채우나: 병행 세션 셋이 zone.js 를 만지는 중이라
//   접점을 하나로 줄여야 했고, **표의 주인이 표를 채우는 쪽**이 어차피 옳다(zone 이 품목을 다시 나열하면 그게 사본이다).
//   기존 주입 문법(`Crops.foodMap()` 루프 · `PRESERVED_EFFECTS` 루프)과 **같은 일을 한 곳에서** 한다.
function install(tables) {
  const t = tables || {};
  if (t.FOOD_EFFECTS)      for (const [k, v] of Object.entries(foodMap()))  if (!t.FOOD_EFFECTS[k]) t.FOOD_EFFECTS[k] = v;
  if (t.ITEM_LABEL_SERVER) for (const [k, v] of Object.entries(labelMap())) if (!t.ITEM_LABEL_SERVER[k]) t.ITEM_LABEL_SERVER[k] = v;
  if (t.COOK_RECIPES)      for (const [k, v] of Object.entries(cookMap()))  if (!t.COOK_RECIPES[k]) t.COOK_RECIPES[k] = v;
  return true;
}

module.exports = { CFG, CATCH, phaseAt, levelAt, isOpen, untilOpenMs, tideKo, __setNow, __nowOverride,
  pickAt, isCatch, koOf, shelfMap, foodMap, labelMap, cookMap, install,
  // ★[T54] 그릇·말리기
  FRESH, VESSELS, DRINK_THIRST, usesVessel, DRY, DRY_RESIDUE, driedOf, driedEffects, weightMap };
