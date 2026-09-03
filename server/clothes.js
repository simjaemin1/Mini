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
const CLOTHES = {
  fur: {
    ko: '갖옷', cap: null,
    note: '털가죽을 그대로 걸친 것. 바람을 막고 공기를 가둔다 — 청동기 한반도 겨울의 정답.',
  },
  ramie: {
    ko: '모시옷', cap: 26,
    note: '모시는 곱고 시원하다. 여름 옷감이라 잘 짜도 겨울엔 못 쓴다(천장).',
  },
  leather: {
    ko: '가죽옷', cap: null,
    note: '무두질한 가죽. 털은 없지만 바람은 막는다 — 사철 입는 물건.',
  },
  hide: {
    ko: '생가죽옷', cap: null,
    note: '무두질 전의 날가죽. 뻣뻣하고 무겁지만 없는 것보다 낫다.',
  },
  fiber: {
    ko: '풀 엮은 옷', cap: 26,
    // ★★**등급을 여기서 갖는 유일한 품목.** econ 의 `CLOTH_Q_MAT` 은 다섯(fur·ramie·leather·hide·hemp)
    //   뿐이고 `fiber` 는 **플레이어 전용 재료**라 그 표에 없다. 종전에는 `matGrade` 의
    //   **이름 없는 폴백(0.6)** 이 대신 답하고 있었다 — 값은 삼베와 같은데 그건 우연이었다.
    //   ⇒ 값은 그대로 두고(비트 동일) **말없이 답하던 것에 이름만 준다.**
    grade: 0.6,
    note: '풀을 엮어 두른 것. 아무것도 없는 사람의 첫 옷 — 삼베와 같은 값이되 이유가 다르다.',
  },
  hemp: {
    ko: '삼베옷', cap: 26,
    note: '식물 섬유는 아무리 잘 짜도 바람을 못 막는다(T4 ⑤ · 천장의 근거).',
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
/** 클라·하네스에 그대로 내주는 표 — 화면이 표를 **다시 적지 않게**(아이콘·외형이 이걸 읽는다). */
function payload() {
  return accepts().map((m) => ({ id: m, ko: CLOTHES[m].ko, cap: CLOTHES[m].cap == null ? null : CLOTHES[m].cap,
    kg: kgOf(m), note: CLOTHES[m].note }));
}

module.exports = { CLOTHES, accepts, has, of, koOf, capOf, gradeOf, noteOf, kgOf, warmthOf, payload };
