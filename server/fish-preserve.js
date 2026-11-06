'use strict';
// === server/fish-preserve.js — 어종별 건어물 · 생선 절임 정본 [T1128 · ★재민 11-03 문 9-a ㄱ] ==============================
//
// ★★[T1128 2026-11-04 · 손잡이 `T1128_KCAL_TIDY` — 켬 기본 · `=0` = 이 파일이 아무것도 안 세운다(종전 바이트)]
//   재민 11-03 문 9-a ㄱ: **어종마다 가공품을 나눈다** — "건어물 1개 = 445.5 kcal 고정"(어느 물고기를 말렸든 첫 종 `fish` 의 열량) ·
//   "생선 절임 = 채소 절임 150"(산출이 `pickled_veg` 하나)을 없앤다. 실제로도 굴비 · 북어처럼 종마다 다른 상품이다.
//   ⇒ 낚시 어종(`fishing.FISH_ITEMS` — 정본 · 옮겨 적지 않는다)마다 말린 것 하나 · 절인 것 하나.
//
// ── 유도(손으로 새 수 0 — 근거 한 줄씩) ─────────────────────────────────────────────────────────────────
//   · 원물 무게 — 무게 정본(`weights.kgOf` — specialty 어종 줄)이 있으면 그것 · 없으면 민물 표(`freshfish.kgOf` — 설계_민물고기 §1 몸 크기 중앙).
//   · 원물 열량 밀도 — 열량 정본(`kcal.KCAL_PER_KG` 어종 줄)이 있으면 그것 · 없으면 `fish` 495(잡어 통마리 — freshfish 머리 "열량은 fish 495 kcal/kg 을 그대로 쓴다").
//   · 말린 것 무게 = 원물 무게 × (건어물 0.35 ÷ 생선 0.90) — 이 세계가 이미 쓰는 말림 잔량비(어육 수분 75~80% · `specialty.dried_fish` · `weights.fish`).
//   · 절인 것 무게 = 원물 무게 × (절임 0.66 ÷ 남새 0.60) — 이 세계가 이미 쓰는 절임 비(소금 · 간수가 붙는다 · `specialty.pickled_veg` · `weights.vegetable`).
//   · 열량 = 원물 한 마리 그대로(보존은 수분만 뺀다 — `kcal.js` §3 · 레시피 원물에서 유도 · 표에 수를 안 적는다).
//   · 보관일 = 그 가공의 곡선 그대로(말린 것 = 건어물 `D.PRESERVED` · 절인 것 = 절임 `SPOIL_D_PICKLED`) — 어종 기름기 차이(청어 · 정어리 산패)는 표에 수가 없어 안 짓는다(회부).
//   · 먹기 효과(갈증) = 그 가공의 줄 그대로(건어물 −6 · 절임 −4 — `zone.PRESERVED_EFFECTS`).
//   · 이름 — 고증 이름이 있으면 그것: 북어(말린 명태) · 과메기(겨울 해풍에 말린 청어) · 새우젓 · 멸치젓 · 오징어젓(소금에 삭힌 젓갈) ·
//     없으면 "건 ○○" · "○○ 절임". 이름 없는 `fish`(잡어) 는 말린 것 = 종전 `dried_fish`(건어물) 그대로 · 절인 것 = `pickled_fish`(생선 절임).
//
// T1192가 켜지면 econ도 종별 품목 ID·낱개 단위. 꺼진 판은 아래 종전 접힘을 유지한다.
// ── econ ──────────────────────────────────────────────────────────────────────────────────────
//   ⚠econ 재화는 새로 세우지 않는다 — 곳간 · 거래소 문(`villages.PV_DEPOSIT_MAP`)에서 말린 것은 `dried_fish` · 절인 것은 `pickled_veg` 칸으로 **열량으로** 접는다
//   (곰고기 → 사슴·들짐승고기 꼴 · T694). 곳간 레코드는 넣은 그 품목을 들고(T768 `it`) 꺼낼 때 그 품목 그대로 나온다(T1128 문 10).
//   econ 쪽 종별 재화(NPC 가 말리는 연어 · 새우 · 게 — T860)를 세울지는 재민 칸이다(보고 회부).
//
// ⚠맞물림 금지 — fishing · freshfish · weights · kcal 은 **부를 때** 부른다(spoil · weights · kcal 이 이 파일을 부른다).
//   번들(econ 브라우저)은 모르는 require 에 `{}` 를 준다 — 읽는 쪽이 `ON` 을 먼저 본다.

const ON = !(typeof process !== 'undefined' && process.env && process.env.T1128_KCAL_TIDY === '0') || !(typeof process !== 'undefined' && process.env && process.env.T1192_FISH_SPECIES === '0');

const NAME_DRY = { pollock: '북어', herring: '과메기' };
const NAME_PICKLE = { shrimp: '새우젓', anchovy: '멸치젓', squid: '오징어젓' };
const DRY_RATIO = { num: 'dried_fish', den: 'fish' };          // 말림 잔량비 = kg(dried_fish) ÷ kg(fish)
const PICKLE_RATIO = { num: 'pickled_veg', den: 'vegetable' }; // 절임 비 = kg(pickled_veg) ÷ kg(vegetable)

let _F = null, _Fr = null, _Sp = null;
const F = () => _F || (_F = require('./fishing'));
const Fr = () => { if (_Fr === null) { try { _Fr = require('./freshfish'); } catch (e) { _Fr = false; } } return _Fr || null; };
const Sp = () => { if (_Sp === null) { try { _Sp = require('./specialty'); } catch (e) { _Sp = false; } } return _Sp || null; };

// 낚시 어종(이름 없는 잡어 `fish` 를 뺀다 — 그 줄은 종전 품목이 맡는다)
function species() { const L = (F() && F().FISH_ITEMS) || []; return L.filter((s) => s !== 'fish'); }
function isSpecies(s) { return s !== 'fish' && species().indexOf(s) >= 0; }
function koOf(s) {
  const sp = Sp() && Sp().RESOURCES && Sp().RESOURCES[s];
  if (sp && sp.ko) return sp.ko;
  const fr = Fr(); if (fr && fr.koOf) { const k = fr.koOf(s); if (k) return k; }
  const sea=require('./seafish').TABLE.find(r=>r.id===s);return sea?.ko||s;
}
function driedId(s) { return s === 'fish' ? 'dried_fish' : 'dried_' + s; }
function pickledId(s) { return s === 'fish' ? 'pickled_fish' : 'pickled_' + s; }

// 품목 표 — id → { ko, kind: 'dry' | 'pickle', from }(새 품목만 · `dried_fish` 는 종전 줄)
let _items = null;
function items() {
  if (!ON) return {};
  if (_items) return _items;
  const o = {};
  for (const s of species()) {
    const ko = koOf(s);
    o[driedId(s)] = { ko: NAME_DRY[s] || ('건 ' + ko), kind: 'dry', from: s };
    o[pickledId(s)] = { ko: NAME_PICKLE[s] || (ko + ' 절임'), kind: 'pickle', from: s };
  }
  o.pickled_fish = { ko: '생선 절임', kind: 'pickle', from: 'fish' };
  _items = o;
  return o;
}
function isItem(id) { return ON && Object.prototype.hasOwnProperty.call(items(), id); }
// 레시피 산출 — 원물 → 품목(spoil `dry_fish` · `pickle_fish` 의 `outBy`)
function outBy(kind) {
  const o = {};
  if (!ON) return o;
  for (const s of ['fish', ...species()]) o[s] = kind === 'dry' ? driedId(s) : pickledId(s);
  return o;
}
// 원물 무게(민물 표가 있는 종은 그 몸 크기) — weights 가 자기 `kgOf` 를 넘긴다(맞물림 금지)
function rawKgOf(s, kgOf) {
  const k = kgOf ? kgOf(s, true) : null;
  if (k > 0) return k;
  const fr = Fr(); const f = fr && fr.kgOf ? +fr.kgOf(s) : 0;
  return f > 0 ? f : null;
}
// 새 품목 · 표에 무게가 없는 어종의 kg(weights 의 마지막 갈래가 부른다)
function kgOf(id, kgOfW) {
  if (!ON) return null;
  const it = items()[id];
  if (it) {
    const raw = rawKgOf(it.from, kgOfW);
    const R = it.kind === 'dry' ? DRY_RATIO : PICKLE_RATIO;
    const a = kgOfW ? kgOfW(R.num, true) : null, b = kgOfW ? kgOfW(R.den, true) : null;
    return (raw > 0 && a > 0 && b > 0) ? raw * a / b : null;
  }
  if (isSpecies(id)) return rawKgOf(id, null);   // 표에 무게가 없는 낚시 어종(민물 표 몸 크기)
  return null;
}
// 표에 열량 밀도가 없는 낚시 어종 — 잡어 통마리 `fish` 그 밀도(freshfish 머리 · 사본 0 · kcal 이 자기 표를 넘긴다)
function kcalPerKgOf(id, table) {
  if (!ON || !isSpecies(id) || !table) return 0;
  return table.fish > 0 ? table.fish : 0;
}
// 표(보고 · 하네스) — kcal · weights 를 받아 줄을 만든다
function table(kcal, weights) {
  const out = [];
  for (const [id, it] of Object.entries(items())) {
    out.push({ id, ko: it.ko, kind: it.kind, from: it.from, fromKo: it.from === 'fish' ? '잡어' : koOf(it.from),
      kg: weights ? weights.kgOf(id) : null, kcal: kcal ? kcal.kcalOf(id) : null });
  }
  return out;
}

const ECON_YIELD=0.4; // 기존 econ PRESERVE_YIELD를 이 정본으로 이동(값 무변)
module.exports = { ECON_YIELD, ON, NAME_DRY, NAME_PICKLE, species, isSpecies, koOf, driedId, pickledId, items, isItem, outBy, rawKgOf, kgOf, kcalPerKgOf, table };
