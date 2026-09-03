// === server/kcal.js — 열량 정본 [재민 확정 2026-09-03 · T59] =======================
//
// 재민 확정: ★**식량의 단위는 열량이다 — 포만감은 적는 게 아니라 kg × kcal/kg 에서 유도한다.**
//
// ★★왜 이 파일이 생겼나: 같은 곡식 한 개로 **NPC 는 하루를 살고 플레이어는 일곱 개가 필요했다.**
//   econ 은 `DAILY_FOOD_CONSUMPTION = 1.0`(하루 = food 1단위)인데 플레이어의 `FOOD_EFFECTS.food`
//   는 허기 **7**(하루 50 의 14%)이었다. 다리(`PV_DEPOSIT_RATE = 1`)는 그 둘을 1:1 로 이었다.
//   ⇒ 곳간에 낸 곡식 하나가 마을에선 하루치인데 내 손에선 한 끼도 아니었다. **7배 어긋남.**
//   무게 정본은 econ 편이었다(`weights.food` 0.70kg — "일일 배급 0.6~0.8kg") ⇒ 1단위 = 하루가 맞다.
//   플레이어의 7 은 베리 시절 값이고, 작물 34종의 "생존 × 1.4" 는 **그 7 을 앵커로 유도**됐다.
//   ⇒ 표 하나를 고치는 게 아니라 **단위를 세워야** 했다. 그게 열량이다.
//
// ★★★**하루치는 고르지 않고 유도했다 — 세 자가 한 점에서 만난다**(족보 (86)):
//     ① 허기 게이지 — `body.CFG.HUNGER_SEC` 2880초에 100 이 빈다. 게임일 24분(1440초)
//        ⇒ 하루에 비는 허기 = 100 × 1440/2880 = **50**.
//     ② econ — `DAILY_FOOD_CONSUMPTION = 1.0` ⇒ **food 1단위 = NPC 하루치**.
//     ③ 물리 — 곡물 1단위 = `weights.food` **0.70kg** × 쌀 **3,500 kcal/kg** = **2,450 kcal**.
//   ⇒ **하루 = 허기 50 = econ 1단위 = 2,450 kcal.** 셋이 서로를 붙든다.
//     고증 확인: 청동기 성인 활동량 2,000~2,600 kcal/일 — 2,450 은 그 안이다(농경·노동 상한 쪽).
//   ★손잡이는 `BODY_DAY_KCAL` **하나**다. 품목별 값을 손대는 게 아니라 이 수 하나를 돌린다.
//
// ★★표의 규약(`weights.js` 문법 그대로):
//   · 값은 **그 품목 1kg 이 실제로 주는 열량**이다 — 가식부(먹을 수 있는 몫)를 이미 반영했다.
//     통마리 생선처럼 뼈·내장이 붙은 품목은 주석에 **[살 열량 × 가식부율]** 을 그대로 적었다.
//   · 작물 34종은 여기 안 적는다 — **`crops.json` 의 `kcal` 축**(재민의 xlsx `열량(kcal/kg)` 열)이 정본이다.
//   · 조리식·보존식도 안 적는다 — **원물에서 유도한다**(아래 §2·§3).
'use strict';
const _num = (k, d) => { const v = parseFloat(process.env[k]); return Number.isFinite(v) && v > 0 ? v : d; };

const DAY_KCAL = _num('BODY_DAY_KCAL', 2450);
const DAY_MS_DEFAULT = 24 * 60 * 1000;

// ── 늦은 require (맞물림 금지 — `forage`·`spoil` 과 같은 규약) ───────────────
let _W = null, _C = null, _S = null, _B = null, _T = null, _Sp = null;
const W  = () => _W  || (_W  = require('./weights'));
const C  = () => _C  || (_C  = require('./crops'));
const S  = () => _S  || (_S  = require('./spoil'));
const B  = () => { if (_B === null) { try { _B = require('./body'); } catch (e) { _B = false; } } return _B || null; };
const T  = () => { if (_T === null) { try { _T = require('./tidal'); } catch (e) { _T = false; } } return _T || null; };
const Sp = () => { if (_Sp === null) { try { _Sp = require('./specialty'); } catch (e) { _Sp = false; } } return _Sp || null; };

// ── §1 kcal/kg 표 — 작물이 아닌 식품 ────────────────────────────────────────
//   ⚠새 품목을 여기서 만들지 않는다. 이미 세계에 있는 것의 **열량을 적을 뿐**이다.
const KCAL_PER_KG = {
  // ─ ★앵커 ─
  //   `food` 는 econ 곡물 재화이자 **이 카드의 앵커**다: 0.70kg × 3,500 = 2,450 kcal = 하루치.
  //   값은 쌀(카탈로그 3,500)에서 온다 — econ 의 `food` 가 "농사로 나오는 곡식"이라 대표가 쌀이다.
  food:      3500,   // ★하루치 앵커 — 이 한 줄이 `DAY_KCAL` 과 서로를 붙든다
  // ─ 채집·기본 ─
  berry:      500,   // 산딸기·머루 520 안팎(가식부 100%)
  herb:       300,   // 약초 잎 — 잎채소 급. 한 줌(0.08kg)이라 열량은 거의 없다
  meat_raw:  1500,   // 사슴·멧돼지 살코기 1,200~1,600(가식부로 손질된 살)
  fish:       495,   // 담수·잡어 **통마리** — 살 900 × 가식부 0.55
  // ─ econ 재화(곳간에서 되나오거나 거래로 손에 들어온다) ─
  meat:      1500,   // = meat_raw
  vegetable:  250,   // 뿌리·잎 섞임(무 180 · 아욱 300 사이)
  fruit:      500,   // = berry
  mushroom:   250,   // 표고 생것 250
  milk:       640,   // 우유 640
  egg:       1430,   // 달걀 1,430(가식부)
  cheese:    3500,   // 경성 치즈 3,500
  bread:     2650,   // 발효 빵 2,650
  // ─ 갯벌(T52) — 껍데기를 뺀 알맹이 무게가 정본이라 가식부가 이미 반영돼 있다 ─
  oyster:     680,   // 생굴 680
  seaweed:    240,   // 생미역 240
  abalone:    850,   // 전복 850
  // ─ 어종(낚시 v2 산출) — 전부 **통마리**다(`weights` 주석 "손질 전") ─
  salmon:    1250,   // 연어 살 2,080 × 가식부 0.60
  cod:        450,   // 대구 살  820 × 0.55
  trout:      770,   // 송어 살 1,400 × 0.55
  carp:       640,   // 잉어 살 1,270 × 0.50
  pollock:    510,   // 명태 살  920 × 0.55
  herring:   1220,   // 청어 살 2,030 × 0.60
  sardine:   1350,   // 정어리 살 2,080 × 0.65
  anchovy:   1110,   // 멸치 1,310 × 0.85 — 통째로 먹는다
  shrimp:     540,   // 새우 살  990 × 0.55
  crab:       290,   // 게   살  830 × 0.35 — 껍데기가 대부분이다
  octopus:    660,   // 문어 살  820 × 0.80
  squid:      690,   // 오징어 살 920 × 0.75
};

// ── §2 조리식 — **재료 열량 합 × econ 이 이미 쓰는 계수** ───────────────────
//   ★계수를 여기서 짓지 않는다: econ `consumeFood` 가 `cooked_food` 를 **1.12** 로 환산한다
//     (`sim/economy-sim.js` — "영양 풍부"). 같은 세계에 두 개의 조리 이득이 있으면 안 된다.
//   ⚠econ 은 그 수를 export 하지 않는다 ⇒ **한 줄 거울 + 교차 계약 검사**(`seasonOf` 선례 ·
//     `test-kcal` 이 `economy-sim.js` 소스를 읽어 두 수가 갈라지면 빨개진다).
const COOKED_FACTOR = 1.12;
// 조리 레시피의 정본은 `zone.COOK_RECIPES` 다 — 여기 옮겨 적지 않고 **주입받는다**.
let _cook = null;
function installCookRecipes(map) { _cook = map || null; return true; }

// ── §3 보존식 — **열량 보존**(수분만 빠진다) ────────────────────────────────
//   `weights.js` 의 건조 잔량 주석과 정합해야 한다: 건어물 0.35kg 은 생선 0.90kg **의 열량**을 갖는다
//   ⇒ kcal/kg 이 오르고 kg 이 줄어 **1단위의 열량은 그대로**다. 그게 말리기의 물리다.
//   ★입력 품목의 정본은 `spoil.PRESERVE[key].from` 이다(여기 옮겨 적지 않는다).

// ── 조회 ────────────────────────────────────────────────────────────────────
function kcalPerKg(item) {
  if (KCAL_PER_KG[item] > 0) return KCAL_PER_KG[item];
  const c = C();
  if (c && c.isCrop && c.isCrop(item)) { const k = c.kcalOf ? c.kcalOf(item) : 0; return k > 0 ? k : 0; }
  return 0;
}
// 원물 한 개의 열량(kcal). 조리식·보존식은 아래 유도로 넘어간다.
function _rawKcal(item) {
  const kg = W().kgOf(item);
  const per = kcalPerKg(item);
  return (kg > 0 && per > 0) ? kg * per : 0;
}
// 조리식 한 개의 열량 — 레시피 재료의 열량 합 × 1.12
function _cookedKcal(item) {
  const r = _cook && _cook[item];
  if (!r || !r.cost) return 0;
  let sum = 0;
  for (const [ing, n] of Object.entries(r.cost)) sum += kcalOf(ing) * (Number(n) || 0);
  return sum > 0 ? sum * COOKED_FACTOR : 0;
}
// 보존식 한 개의 열량 — 원물 한 개의 열량 그대로(수분만 빠졌다)
function _preservedKcal(item) {
  const P = S().PRESERVE || {};
  for (const r of Object.values(P)) {
    if (r.out !== item) continue;
    const from = Array.isArray(r.from) ? r.from[0] : r.from;
    const k = kcalOf(from);
    if (k > 0) return k;
  }
  return 0;
}
// ★품목 한 개의 열량 — 이 함수가 정본이다.
function kcalOf(item) {
  if (!item) return 0;
  const raw = _rawKcal(item);
  if (raw > 0) return raw;
  const ck = _cookedKcal(item);
  if (ck > 0) return ck;
  return _preservedKcal(item);
}
// 하루에 비는 허기(게이지) — **유도값**이다(`spoil.winterMath` 와 같은 식).
function dayHunger(dayMs) {
  const b = B();
  const hs = (b && b.CFG && b.CFG.HUNGER_SEC > 0) ? b.CFG.HUNGER_SEC : 2880;
  const dm = Number(dayMs) > 0 ? Number(dayMs) : DAY_MS_DEFAULT;
  return 100 * (dm / 1000) / hs;
}
// ★★포만감 — **적는 게 아니라 유도한다.** kcal ÷ 하루치 × 하루 허기.
function hungerOf(item, dayMs) {
  const k = kcalOf(item);
  if (!(k > 0)) return 0;
  return +((k / DAY_KCAL) * dayHunger(dayMs)).toFixed(2);
}

// ── §4 환산 짝 — 낱개 ↔ econ 단위 ───────────────────────────────────────────
//   ★★**한 짝이다.** 납품·보상·인출·거래소가 전부 이 둘을 쓴다 —
//     넣을 때와 꺼낼 때가 다른 함수를 쓰면 곳간이 환전소가 된다(무게 배치가 못 박은 규약).
//   ★식량 재화(`food`·`fish`·`meat`·`cooked_food`) 1단위 = **`DAY_KCAL`**. 그게 이 카드의 전부다.
//   ⚠식량이 아닌 재화(나무·돌·광물)는 열량이 없다 ⇒ **종전 그대로 개수**다(여기서 안 건드린다).
const FOOD_RES = new Set(['food', 'fish', 'meat', 'cooked_food']);
function isFoodRes(res) { return FOOD_RES.has(String(res || '')); }
// 낱개 n 개 → econ 단위. `kg` 를 주면 그 실제 무게로 잰다(개체 원장 · 낚시가 낸 2kg 물고기).
function econUnitsOf(item, n, kgActual) {
  const cnt = Number(n) || 0;
  if (!(cnt > 0)) return 0;
  // ★kcal/kg — 표에 있으면 그 값, 없으면 **유도 열량 ÷ 표준 kg**(조리식·보존식이 그 갈래다).
  //   ⚠표만 보면 건어물이 0 단위가 된다(열량이 유도값이라 표에 없다) — 실제로 한 번 그렇게 물렸다.
  const kgStd = W().kgOf(item) || 0;
  const per = kcalPerKg(item) || (kgStd > 0 ? kcalOf(item) / kgStd : 0);
  if (!(per > 0)) return 0;                     // 열량이 없는 것(나무·돌) — 부르는 쪽이 종전 경로로 간다
  const kg = Number(kgActual) > 0 ? Number(kgActual) : kgStd * cnt;
  const kcal = (kg > 0) ? kg * per : kcalOf(item) * cnt;
  // ★자릿수는 **여섯**이다 — 넷으로 자르면 왕복(낱개→단위→낱개)에서 한 개가 사라진다(실측).
  return +(kcal / DAY_KCAL).toFixed(6);
}
// econ 단위 → 낱개. **남는 몫은 버리지 않는다** — 정수로 떨어지는 만큼만 옮기고 나머지를 돌려준다
//   (로트 병합 금지와 같은 결: 조용히 사라지는 몫을 만들지 않는다).
function itemsOf(item, units) {
  const u = Number(units) || 0;
  const per = kcalOf(item);
  if (!(u > 0) || !(per > 0)) return { items: 0, leftUnits: +(u.toFixed(4)) };
  const exact = (u * DAY_KCAL) / per;
  const items = Math.floor(exact + 1e-6);   // ★반올림 여유 — `econUnitsOf` 의 여섯 자리와 짝이다
  const left = +(((exact - items) * per) / DAY_KCAL).toFixed(4);
  return { items, leftUnits: left };
}

// ── §5 표(보고·하네스용) ────────────────────────────────────────────────────
function table(dayMs) {
  const out = [];
  const seen = new Set();
  const push = (item, group) => {
    if (!item || seen.has(item)) return; seen.add(item);
    const kg = W().kgOf(item), per = kcalPerKg(item) || (kcalOf(item) && W().kgOf(item) ? kcalOf(item) / W().kgOf(item) : 0);
    out.push({ item, group, kg, kcalPerKg: +(+per).toFixed(0), kcal: +kcalOf(item).toFixed(0), hunger: hungerOf(item, dayMs) });
  };
  for (const k of Object.keys(KCAL_PER_KG)) push(k, 'raw');
  const c = C(); if (c && c.list) for (const cr of c.list()) if (hungerOf(cr.id, dayMs) > 0) push(cr.id, 'crop');
  if (_cook) for (const k of Object.keys(_cook)) push(k, 'cooked');
  const P = S().PRESERVE || {}; for (const r of Object.values(P)) push(r.out, 'preserved');
  const t = T(); if (t) for (const k of Object.keys(t.foodMap())) push(k, 'tidal');
  return out;
}

module.exports = {
  DAY_KCAL, COOKED_FACTOR, KCAL_PER_KG, FOOD_RES,
  kcalPerKg, kcalOf, hungerOf, dayHunger, installCookRecipes,
  isFoodRes, econUnitsOf, itemsOf, table,
};
