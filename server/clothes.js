'use strict';
// === server/clothes.js — 옷 품목 표 (정본 하나) =================================
//
// ★★[재민 확정 2026-09-03 · T74] **캐릭터는 청동기 복장 사람 하나로 통일 · 색 선택 없음 ·
//   외형 축은 옷(삼베·가죽·모피).** 그러려면 옷이 **품목**이어야 하는데, 종전엔 옷을 이루는
//   것들이 네 파일에 흩어져 있었다:
//     이름 `player-items.CLOTH_KO` · 천장 `player-items.CLOTH_WARMTH_CAP` ·
//     소속 `zone.EQUIPMENT_RECIPES.clothes.accepts` · 등급 `player-items.MAT_GRADE`
//   ⇒ 품목 하나를 더하려면 **네 곳을 고쳐야** 했고, 그중 하나를 빠뜨려도 조용히 돌아갔다
//     (실제로 `fiber` 가 그랬다 — §0 참조). 이 파일이 그 넷 중 **품목의 것**을 모은다.
//
// ★★제1 규약 — **이 표는 남의 정본을 안 베낀다.**
//     · 재료 등급 → `player-items.MAT_GRADE`(econ `CLOTH_Q_MAT` 과 *동일값* 계약).
//       여기 `grade` 는 **그 표에 없는 재료만** 갖는다(지금은 `fiber` 하나 · 아래 주석).
//     · 무게      → `weights.js`("옷" 한 값 0.6kg — 품목별로 갈리지 않는다. 회부).
//     · 닳음      → `zone.COLD_CLOTH_WEAR_MS`(추위 노출 30초당 1 · 품목 무관. 회부).
//   ⇒ 이 파일이 **소유**하는 것은 품목의 정체뿐이다: id · 한글 이름 · 방한 천장 · 고증 · 순서.
//
// ★★제2 규약 — **값은 종전과 비트 동일하다.** T74 는 **구조 카드**다(재민 확정: 값 변경은 실기 뒤).
//   `test-clothes` 가 재료 여섯 × 숙련 열하나를 종전 식과 통째로 맞대어 못 박는다.
//
// ★방한은 이 표의 **상수가 아니다** — 이 세계의 옷은 `round(62 · qSkill(숙련) · 등급)` 을
//   천장으로 자른 값이라 **숙련이 들어간다**. 그래서 표가 가진 건 천장이고,
//   "이 옷이 얼마나 따뜻한가"는 `warmthOf(mat, level)` 로 묻는다(식은 `player-items` 정본).

// ── 표 ────────────────────────────────────────────────────────────────────────
//   ⚠**순서가 계약이다.** `zone.EQUIPMENT_RECIPES.clothes.accepts` 가 이 순서를 그대로 쓰고,
//     `accepts[0]`(= 갖옷)이 재료를 안 주는 옛 호출부의 기본값이다(`zone.js` 마을 장인 진열).
//   ★★[T516 2026-09-29] `clo` — 그 재질로 지은 **한 벌(몸통·팔·다리)의 겉옷 몫** 단열(clo · 출처의 값 · 새 수 0).
//     규약: 겉옷이 **더한** 단열이다 — 속옷·바탕층을 입은 판에서 잰 값은 그 층을 뺐고(두 판의 차 — 공기층은 서로 지운다),
//     한 점씩 잰 표(ASHRAE 55)는 옷 두 점의 합(ISO 9920 식 12)이다. 덮는 면적은 여섯 모두 **같은 한 벌**이라
//     (ISO 9920 §4.6: 단열 ∝ 덮는 면적) 머리·손을 더 덮은 판(갖옷 모자·장갑)은 품목 값에 안 쓴다(보고 T516 §1).
//     이 칸은 손잡이 `T516_WARMTH_CLO` 를 켰을 때만 방한을 정한다(아래 `warmthCloOf` · 끄면 **아무도 안 읽는다**).
const CLOTHES = {
  fur: {
    ko: '갖옷', cap: null,
    note: '털가죽을 그대로 걸친 것. 바람을 막고 공기를 가둔다 — 청동기 한반도 겨울의 정답.',
    //   Barker·Power·Schnell·Mahar 2025 *FACETS* 10(doi:10.1139/facets-2024-0100) 표 4 — 털 풀오버 파카 + 바람막이 바지(6번)
    //   STIV 3.162 − 바탕층(BL) 1.251 = **1.911 clo**(서멀 마네킹 ASTM F1291). 모자·목도리·장갑까지(18번) 3.353 − 1.251 = 2.102 는
    //   머리·손을 더 덮은 판이라 품목 값이 아니다(재민 #90 앵커 칸).
    clo: 3.162 - 1.251,
  },
  ramie: {
    ko: '모시옷', cap: 26,
    note: '모시는 곱고 시원하다. 여름 옷감이라 잘 짜도 겨울엔 못 쓴다(천장).',
    //   Son & Tasaka 1996 *Journal of Home Economics of Japan*(日本家政学会誌) 47(3) "Dry and Evaporative Heat Resistance of Hanbok" —
    //   서멀 마네킹 모시 치마저고리 + 속옷 0.89 − 속옷 0.39 = **0.50 clo**("0.50 for ramie") ·
    //   https://dl.ndl.go.jp/view/prepareDownload?itemId=info%3Andljp%2Fpid%2F10581147
    clo: 0.89 - 0.39,
  },
  leather: {
    ko: '가죽옷', cap: null,
    note: '무두질한 가죽. 털은 없지만 바람은 막는다 — 사철 입는 물건.',
    //   재질 이름을 단 실측이 없다 — 털 없는 **두꺼운 겉옷 한 벌**로 잰다: ASHRAE 55-2010 의복 표(Wikipedia *Clothing insulation* 표 2)
    //   두꺼운 겹여밈 윗옷 0.48 + 두꺼운 바지 0.24 = **0.72 clo** · https://en.wikipedia.org/wiki/Clothing_insulation
    clo: 0.48 + 0.24,
  },
  hide: {
    ko: '생가죽옷', cap: null,
    note: '무두질 전의 날가죽. 뻣뻣하고 무겁지만 없는 것보다 낫다.',
    //   가죽옷과 같은 **두꺼운 겉옷 한 벌** 칸(날가죽만 따로 잰 값이 없다 — 가르면 지어낸 수다) · 0.48 + 0.24
    clo: 0.48 + 0.24,
  },
  fiber: {
    ko: '풀 엮은 옷', cap: 26,
    // ★★**등급을 여기서 갖는 유일한 품목.** econ 의 `CLOTH_Q_MAT` 은 다섯(fur·ramie·leather·hide·hemp)
    //   뿐이고 `fiber` 는 **플레이어 전용 재료**라 그 표에 없다. 종전에는 `matGrade` 의
    //   **이름 없는 폴백(0.6)** 이 대신 답하고 있었다 — 값은 삼베와 같은데 그건 우연이었다.
    //   ⇒ 값은 그대로 두고(비트 동일) **말없이 답하던 것에 이름만 준다.**
    grade: 0.6,
    note: '풀을 엮어 두른 것. 아무것도 없는 사람의 첫 옷 — 삼베와 같은 값이되 이유가 다르다.',
    //   풀 엮은 옷을 잰 값은 없다 — **얇은 식물 섬유 한 벌** 칸(삼베와 같은 0.25 + 0.15) · 종전 규약("삼베와 같은 값") 그대로
    clo: 0.25 + 0.15,
  },
  hemp: {
    ko: '삼베옷', cap: 26,
    note: '식물 섬유는 아무리 잘 짜도 바람을 못 막는다(T4 ⑤ · 천장의 근거).',
    //   **얇은 한 벌** — ASHRAE 55-2010 의복 표: 긴소매 셔츠 0.25 + 얇은 곧은 바지 0.15 = **0.40 clo**
    //   (같은 식물 섬유 모시의 실측 0.50 과 한 자리 · 삼베는 모시보다 성글다)
    clo: 0.25 + 0.15,
  },
};

/** 품목 목록 — **순서가 계약이다**(위 주석). */
function accepts() { return Object.keys(CLOTHES); }
function has(mat) { return !!(mat && Object.prototype.hasOwnProperty.call(CLOTHES, mat)); }
function of(mat) { return has(mat) ? CLOTHES[mat] : null; }
/** 한글 이름 — 화면이 "옷"이 아니라 "갖옷"이라고 부르게 하는 값. */
function koOf(mat) { const c = of(mat); return c ? c.ko : null; }
/** 방한 천장(없으면 null) — 식물 섬유가 장인의 손에서도 가죽을 못 넘게 하는 자리. */
function capOf(mat) { const c = of(mat); return c && c.cap != null ? c.cap : null; }
/** 이 표가 **직접 갖는** 등급(없으면 null ⇒ 호출측이 `MAT_GRADE` 정본을 본다). */
function gradeOf(mat) { const c = of(mat); return c && c.grade != null ? c.grade : null; }
function noteOf(mat) { const c = of(mat); return c ? c.note : null; }

/** 무게 — **`weights.js` 정본을 부른다.** 지금은 품목별로 안 갈린다(옷 0.6kg 하나 · 회부). */
function kgOf(/* mat */) {
  try { return require('./weights').kgOfOrDefault('clothes'); } catch (e) { return null; }
}
/** "이 옷이 얼마나 따뜻한가" — 식은 `player-items` 정본이다(여기서 다시 짜지 않는다).
 *  ⚠지연 `require`: `player-items` 가 이 파일을 **위에서** 부르므로 맞물림을 피한다
 *    (호출 시점엔 둘 다 올라와 있다 — zone 이 `tidal` 을 그렇게 부르는 것과 같은 규약). */
function warmthOf(mat, level) {
  try { return require('./player-items').craftItem('clothes', level || 0, { [mat]: 3 }).attrs.warmth; }
  catch (e) { return null; }
}
// ── ★★[T516 2026-09-29 · #90 입력] 방한을 **재질 clo** 에서 유도한다 — 손잡이 `T516_WARMTH_CLO`(T536 추신부터 기본 켬 · `=0` 끔) ─────
//   끔 = 종전 `round(62 · qSkill · 등급)`(식물 섬유 천장 26) **바이트 동일** — 이 두 함수는 켰을 때만 불린다.
//   켬 = 방한 = WARMTH_MIN + clo × (천장 − WARMTH_MIN) ÷ CLO_TOP — T508 이 방한 1점에 준 ℃ 의 **거꾸로**다:
//     T508_CLO 를 같이 켜면 단열 ℃ = clo × CLO_C(1 clo ≈ 5.56℃) 가 그대로 나온다(천장·CLO_TOP 는 서로 지운다 · 반올림 ±½점).
//   ★숙련은 방한에서 빠진다 — "솜씨가 좋아지면 곱고 질겨지지 따뜻해지지 않는다"(이 파일 삼베 천장의 근거와 같은 말).
//     숙련은 `q`(내구·값·이름)에 그대로 남는다. 틈·마감(바람 통과 · 젖음)으로 옮기려면 몸 쪽에 새 항이 든다 ⇒ 표만(보고 §2-ⓒ).
//   ★새 수 0 — clo 는 위 표(출처) · WARMTH_MIN·CLO_TOP 는 `body.js` · 천장은 옷 `attrScale`(player-items) — 셋 다 **읽는다**.
//   ★★[T536 추신 2026-09-30 · #90 · ★PM 승격] **기본 켬** — T508 두 팔(지수 꼴 · clo→℃)과 같이(옷 ℃ = clo × 5.56). 되돌림 `T516_WARMTH_CLO=0`.
const T516_WARMTH_CLO = process.env.T516_WARMTH_CLO !== '0';
/** 그 재질 한 벌의 clo(없으면 null). */
function cloOf(mat) { const c = of(mat); return c && Number.isFinite(c.clo) ? c.clo : null; }
/** clo 에서 유도한 방한(정수 — 카탈로그 규약). 재질을 모르거나 clo 가 없으면 null ⇒ 호출측이 종전 식을 쓴다. */
function warmthCloOf(mat) {
  const clo = cloOf(mat);
  if (clo == null) return null;
  let B = null, cap = null;
  try { B = require('./body'); } catch (e) { B = null; }
  try { cap = +require('./player-items').ITEM_TYPES.clothes.attrScale || null; } catch (e) { cap = null; }
  if (!B || !B.CFG || !(cap > B.CFG.WARMTH_MIN) || !(B.CFG.CLO_TOP > 0)) return null;
  return Math.round(B.CFG.WARMTH_MIN + clo * (cap - B.CFG.WARMTH_MIN) / B.CFG.CLO_TOP);
}
/** 클라·하네스에 그대로 내주는 표 — 화면이 표를 **다시 적지 않게**(아이콘·외형이 이걸 읽는다). */
function payload() {
  return accepts().map((m) => ({ id: m, ko: CLOTHES[m].ko, cap: CLOTHES[m].cap == null ? null : CLOTHES[m].cap,
    kg: kgOf(m), note: CLOTHES[m].note }));
}

module.exports = { CLOTHES, accepts, has, of, koOf, capOf, gradeOf, noteOf, kgOf, warmthOf, payload,
  T516_WARMTH_CLO, cloOf, warmthCloOf };   // ★[T516] 재질 clo → 방한(켰을 때만 `craftItem` 이 부른다)
