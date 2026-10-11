// === server/game-meat.js — 사냥 고기 마무리 [T694 · 2026-10-11 · 손잡이 `T694_GAME_MEAT=1` · 없음 = 끔 = main 바이트] ===
//
// ★왜 [T647 회부 · 재민 칸 ①~④] T647 이 도살 드롭 `meat_game`(사슴·들짐승고기)을 손에서 먹게 했지만
//   ① 곰 고기도 같은 품목이라 **사슴 열량**(USDA 사슴 날것 1,200kcal/kg)을 먹었고
//   ② 날고기 HP −3 이 어디서 왔는지 안 적혀 있었고(→ 보고/T694 §② 표 · 이 파일은 그 줄을 안 바꾼다)
//   ③ 불에 익히는 길이 없었고(익힌 것은 날고기 패널티가 없다 — `meat_cooked` 줄)
//   ④ 곳간 넣기 표(`villages.PV_DEPOSIT_MAP`)에 줄이 없어 넣기·꺼내기·거래소·게시판이 이 고기를 안 다뤘다.
//
// ★이 파일은 **품목 이름·조리 수율 표의 주인**이다 — 무게·보관일·로트·먹기 효과·이름표·조리를
//   **각 정본에 한 줄씩 주입**한다(`tidal.js` 갯벌 문법 그대로 · 표의 주인이 표를 채운다 · 사본 0).
//   ⚠열량(kcal/kg)은 여기 안 적는다 — `kcal.js` 가 열량 정본이다(T647 meat_game 줄 바로 아래 · 같은 꼴).
//   ⚠곳간 대응도 여기 안 적는다 — `villages.PV_DEPOSIT_MAP` 이 그 정본이다("그 대응을 여기 한 곳에만 둔다").
//
// ★손잡이 `T694_GAME_MEAT` — **`=1` 일 때만 켬**(없음 = 끔 = main 바이트). 그리고 T636 드롭 kg 가 켜져 있어야 한다
//   (`T636_DROP_KG=0` 되돌림이면 같이 꺼진다 — 곰 드롭을 kg 로 가르는 일과 사체 고기 먹기가 그 표 위에 선다).
//   부를 때 읽는다(모듈이 뜰 때 한 번 읽는 쪽들은 그 순간의 값을 쓴다 — 서버는 env 를 띄울 때 정한다).
'use strict';

function on() {
  if (typeof process === 'undefined' || !process.env || process.env.T694_GAME_MEAT !== '1') return false;
  return require('./animals').dropKgOn();
}

// ── 날고기 → 익힌 고기 — USDA SR Legacy 조리 줄의 단위 무게 "1 piece, cooked (yield from 1 lb raw meat, boneless)" ──
//   ★수율 = 그 g ÷ 1 lb(453.59237 g — 단위 환산이다 · 새 수 아님). 열린 판 둘이 같은 g 을 준다(보고 §③ 출처 표):
//     · 사슴 — "Game meat, deer, cooked, roasted"(NDB 17165 · FDC 175085) 날것 1 lb → **340 g** = 74.96 % · 굽기
//     · 곰   — "Game meat, bear, cooked, simmered"(NDB 17147 · FDC 173846) 날것 1 lb → **277 g** = 61.07 % · 삶기
//   ★조리법은 **출처의 조리법 그대로**다 — USDA 에 곰 **구이** 줄은 없다(못 찾음 · 곰의 익힌 줄은 삶은 것 하나뿐)
//     ⇒ 곰은 '삶은 곰고기'다(모닥불·화덕 요리에 이미 국·탕이 있다 — `tidal` 조개탕·미역국). 곰을 구이로 할지는 재민 칸(보고 표).
//   ★열량은 여기서 안 짓는다: 익힌 것의 열량 = `kcal.js` §2 **레시피 재료 열량 × 1.12**(econ `cooked_food` 계수 —
//     "같은 세계에 두 개의 조리 이득이 있으면 안 된다") · kg 당 열량 = 그 열량 ÷ 아래 무게(유도).
//   ★날고기 패널티(HP −3)는 익힌 줄에 없다 — 먹기 효과는 `meat_cooked` 줄 그대로다.
//   ⚠출처 줄은 둘 다 **북미 종**(USDA "deer"·"bear" — 종 미표기)이다 — 반달가슴곰·꽃사슴 줄이 아니다(다른 종 참고치 · T636 수율과 같은 처지).
const LB_G = 453.59237;
const RAW = Object.freeze({
  // 사슴·들짐승고기(econ 재화 `meat_game` 그대로 — 이름표는 특산 정본 `specialty.RESOURCES.meat_game.ko`)
  meat_game: Object.freeze({
    cooked: 'meat_game_cooked', cookedKo: '구운 사슴·들짐승고기', method: '굽기(roasted)', cookedG: 340,
    src: 'USDA SR Legacy "Game meat, deer, cooked, roasted" NDB 17165 · FDC 175085 — 1 piece, cooked (yield from 1 lb raw meat, boneless) = 340 g',
  }),
  // 곰고기(T694 새 품목 — 반달가슴곰 드롭의 고기 칸 · econ 재화는 없다)
  meat_bear: Object.freeze({
    ko: '곰고기', cooked: 'meat_bear_cooked', cookedKo: '삶은 곰고기', method: '삶기(simmered)', cookedG: 277,
    src: 'USDA SR Legacy "Game meat, bear, cooked, simmered" NDB 17147 · FDC 173846 — 1 piece, cooked (yield from 1 lb raw meat, boneless) = 277 g',
  }),
});
function yieldOf(raw) { const r = RAW[raw]; return r ? r.cookedG / LB_G : 0; }

// ── ① 무게 — 곰고기 1개 = 사슴·들짐승고기 1개와 같은 1kg 단위(드롭 kg 표가 그 단위로 센다 · `specialty.meat_game.weight`) ──
//   값을 옮겨 적지 않고 **가리킨다**(`weights.ITEM_ALIAS` 문법 — meat_raw → meat 와 같은 꼴).
const ALIAS = Object.freeze({ meat_bear: 'meat_game' });
//   익힌 것 1개 = 날것 1개의 kg × 수율. `weights.js` 가 **제 `kgOf` 를 넘겨** 부른다(이 파일은 weights 를 안 문다 — 맞물림 금지).
function weightMap(kgOf) {
  const o = {};
  for (const [raw, r] of Object.entries(RAW)) { const k = kgOf(raw); if (k > 0) o[r.cooked] = k * r.cookedG / LB_G; }
  return o;
}

// ── ④ 보관일 — `spoil.js` 고기 줄에 맞춘다: 날것 = RAW_FLESH(생선·날고기 2.5일) · 익힌 것 = COOKED(3.5일) ──
//   ⚠`meat_game` 은 여태 그 표에 줄이 없어 특산 축산 기본값 DEFAULT(5일)를 먹었다 — 같은 날고기(`meat_raw` 2.5일)의 두 배를 갔다.
//   날수를 여기 적지 않는다 — `spoil.js` 의 `D` 를 받아 그 칸을 가리킬 뿐이다.
function shelfMap(D) {
  const o = {};
  for (const [raw, r] of Object.entries(RAW)) { o[raw] = D.RAW_FLESH; o[r.cooked] = D.COOKED; }
  return o;
}
// 로트(상하는 것) — `meat_game` 은 특산 축산이라 이미 로트다(더해도 같다). 곰고기·익힌 둘이 새로 든다.
function lotItems() { const out = []; for (const [raw, r] of Object.entries(RAW)) out.push(raw, r.cooked); return out; }

// ── 먹기 효과 — 날것 = `meat_raw` 줄 그대로(T647 meat_game 과 같은 꼴) · 익힌 것 = `meat_cooked` 줄 그대로(HP 패널티 없음) ──
//   포만은 여기 없다 — zone 이 주입이 다 끝난 뒤 열량에서 유도한다(`Kcal.hungerOf` 한 줄).
function foodMap(FE) {
  const o = {};
  for (const [raw, r] of Object.entries(RAW)) {
    if (FE && FE.meat_raw) o[raw] = Object.assign({}, FE.meat_raw);
    if (FE && FE.meat_cooked) o[r.cooked] = Object.assign({}, FE.meat_cooked);
  }
  return o;
}
function labelMap() {
  const o = {};
  for (const [raw, r] of Object.entries(RAW)) { if (r.ko) o[raw] = r.ko; o[r.cooked] = r.cookedKo; }
  return o;
}
// ── ③ 조리 — 모닥불·화덕(시설 `cook` — 이미 있는 그 시설) · 날것 1 → 익힌 것 1(무게는 수율만큼 준다) ──
//   ★`item: true` = **요리 인스턴스가 아니라 품목**을 낸다 — `zone.doCook` 이 이 칸을 읽고 `produces` 를 시설 대기열의 `items` 로 건다
//     (보존 가공 `doPreserve` 의 수령 문법 · `doCraftCollect` 의 `j.items`·`j.lotItems` 갈래 그대로).
//   왜 품목인가: 요리 인스턴스의 영양은 숙련 × 재료 등급(`player-items.craftItem` — 허기 24~60)이라 **열량·수율이 닿지 않는다**.
//     카드 ③ "열량은 kg 당 유도" 는 품목이어야 선다(무게가 있고 · 열량이 레시피에서 유도되고 · 곳간 단위가 열량이다).
function cookMap() {
  const o = {};
  for (const [raw, r] of Object.entries(RAW)) o[r.cooked] = { cost: { [raw]: 1 }, produces: { [r.cooked]: 1 }, label: r.cookedKo, item: true };
  return o;
}
// ★★zone.js 접점은 **이 한 줄뿐이다**(`GameMeat.install({...})` — `tidal.install` 바로 아래). 이미 있는 줄은 안 덮는다.
function install(tables) {
  if (!on()) return false;
  const t = tables || {};
  if (t.FOOD_EFFECTS)      for (const [k, v] of Object.entries(foodMap(t.FOOD_EFFECTS))) if (!t.FOOD_EFFECTS[k]) t.FOOD_EFFECTS[k] = v;
  if (t.ITEM_LABEL_SERVER) for (const [k, v] of Object.entries(labelMap()))              if (!t.ITEM_LABEL_SERVER[k]) t.ITEM_LABEL_SERVER[k] = v;
  if (t.COOK_RECIPES)      for (const [k, v] of Object.entries(cookMap()))               if (!t.COOK_RECIPES[k]) t.COOK_RECIPES[k] = v;
  return true;
}

module.exports = { LB_G, RAW, ALIAS, on, yieldOf, weightMap, shelfMap, lotItems, foodMap, labelMap, cookMap, install };
