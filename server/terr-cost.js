// === server/terr-cost.js — ★★[T1207 2026-11-07 · ★재민 11-07] 영토 한 칸의 값 — 개간 노동 · 경계 말뚝 · 크기 · 길쭉함 ==========
//
// ★왜: 영토가 공짜였다(`villages.js _terrGrow` — 목표 = 집 압력 · 하루 60셀 · 재료 · 노동 0). 재민 11-07:
//   "돌이나 나무로 확장 · 영토와 인접한 셀로 직접 가서 우클릭 · 멀수록 · 클수록 비싸게" · "칠레처럼 기다랗게만 이어 맵을 망치는 걸 막고 싶다".
// ⇒ 셀 하나 넓히기 = ① 개간(그 셀에서 몸이 일한 시간) + ② 경계 표시(새로 생긴 경계 길이만큼 말뚝).
//   두 몫에 **같은 배수** m = (영토 ÷ 시작 영토)ᵏ × (1 + α × max(0, r ÷ R − 1)²) — r = 그 셀 ↔ 마을 중심 · R = √(영토 ÷ π).
// ★순수 모듈(정본 hut-stages 하나만 읽는다) — 수는 출처의 수와 카드의 정해진 수(k · α 첫 후보)만. 부르는 쪽이 영토 · 거리 · 이웃 수를 넘긴다.
'use strict';

// ── 출처 ① 개간 노동 — 석기로 숲을 베어 낸 실험 ─────────────────────────────────────────────────────
//   덴마크 드라베드 숲 실험(1952–54 · 신석기 원래 부싯돌 도끼):
//     "One-eighth acre (600 square yards, or 0.05 hectare) of silver birch forest were cleared by three men in four hours."
//     (Encyclopaedia Britannica 「Hand tool — Neolithic tools」 · 원보고 Iversen 1956 — T1186 `stone-rule.js LIFE_SRC` 와 같은 쪽)
//   ⇒ 사람 · 분 / m² = 3명 × 4시간 × 60 ÷ 500 m² = 1.44(벤 것만 — 그루터기 · 불 놓기는 셈 밖 · 하한)
//   참고(넣지 않음 · 열대 · 계산치): Carneiro 1979 「Tree felling with the stone ax」(Antropológica 52) — 1.7 에이커 밭 —
//     돌도끼로 큰 나무는 껍질 벗겨 말리면 659.8 사람·시간(5.75 분/m²) · 다 베면 1,229.3(10.7 분/m²) · 쇠도끼 실측 201.1(덤불 88.9 + 베기 112.2).
const CLEAR_SRC = { men: 3, hours: 4, m2: 500 };
const clearMinPerM2 = () => CLEAR_SRC.men * CLEAR_SRC.hours * 60 / CLEAR_SRC.m2;
// ── 출처 ② 경계 표시 — 목책 말뚝 ───────────────────────────────────────────────────────────────────
//   부여 송국리 목책: "약 430 m 정도의 목책" · "지름 30 cm가 되는 기둥을 180 cm 간격으로 열을 지어 세우고" ·
//     "청동기마을의 밖에 나무울타리를 세워 영역을 구획한 시설"(dapsa.kr 「부여 송국리 유적」) ·
//     같은 간격 "각 목책혈의 중심간격은 180cm"(한국전통문화학교 2차 조사 · 디트NEWS24 2008-09-19 「청동기시대 마을 방어는 '이중목책'」).
//   ⇒ 경계 1 m 당 말뚝 1 ÷ 1.8 개 · 말뚝 하나 = 정본 굴립주 기둥(`hut-stages HUT_RECIPES.pillar` — 통나무 3 → 기둥 1 · 움집 ② 의 그 기둥).
//   ⚠지름 30 cm 기둥의 실제 나무 kg 은 게임 기둥(통나무 3)보다 훨씬 무겁다 — 게임의 나무 단위는 움집 기둥이 정한다(회부).
//   ⚠선돌(돌 경계)은 경계 1 m 당 몇 kg 인지 출처를 못 찾았다(선돌은 띄엄띄엄 선다 — 간격 · 무게 미확인) ⇒ 이 표는 말뚝(나무)만.
const POST_SRC = { spacingM: 1.8, diamM: 0.30 };
// ── 정해진 수(카드 T1207 · ★재민 11-07) ──────────────────────────────────────────────────────────────
const K = 1.01;      // 크기 지수(★재민)
const ALPHA = 10;    // 길쭉함 벌점 첫 후보(카드 — 판에서 고른다 · 보고/T1207 §2 표)
//   영토 1,500 에서: 둥근 가장자리 ×1 · 촉수 끝 r = 2R ×11 · 3R ×41 · 폭 10 길이 150 띠 끝 ×345.

const _hut = (() => { try { return require('./hut-stages'); } catch (e) { return null; } })();
// 말뚝 하나의 통나무(정본 레시피 — 기둥 1 개를 내는 통나무 수)
function woodPerPost() {
  const r = _hut && _hut.HUT_RECIPES && _hut.HUT_RECIPES.pillar;
  return r && r.from && r.to && r.to.pillar > 0 ? (r.from.wood || 0) / r.to.pillar : 0;
}
// 원 환산 반지름
const radiusOf = (S) => Math.sqrt(Math.max(0, S) / Math.PI);
// 배수 — S = 지금 영토(셀 = m²) · r = 그 셀 ↔ 중심(셀) · S0 = 시작 영토(부르는 쪽이 준다)
function mult(S, r, S0, alpha, k) {
  const a = alpha == null ? ALPHA : alpha, kk = k == null ? K : k;
  const s = S > 0 ? S : 0, s0 = S0 > 0 ? S0 : 0;
  const R = radiusOf(s);
  const size = (s > 0 && s0 > 0) ? Math.pow(s / s0, kk) : 1;
  const over = R > 0 ? Math.max(0, r / R - 1) : 0;
  const shape = 1 + a * over * over;
  return { m: size * shape, size, shape, R };
}
// 새로 생긴 경계 길이(m) — 넓히는 셀의 네 변 중 영토와 맞닿은 변이 nb 개면, 바깥으로 남는 변 4 − nb 가 새 경계 · 맞닿은 nb 변은 경계에서 빠진다
//   ⇒ 둘레가 늘어난 만큼 = 4 − 2·nb(빠진 변의 말뚝은 뽑아 새 변에 다시 세운다 — 0 밑은 0 · 돌려받지 않는다)
const boundaryGrowth = (nb) => Math.max(0, 4 - 2 * (nb | 0));
// ── ★★[T1238 할 일 1 · 회부] 칸 넓이 — 읽기 둘을 **상수 하나**로 바꾼다 ─────────────────────────────────
//   지도: 1셀 = 1 m(32 px · `village-layout` "1셀 = 1m") ⇒ 셀 하나 = 1 m² — T1207 이 쓴 읽기(종전 값 그대로).
//   밭 넓이 정본(문 34 ㄱ · ★재민 11-07 · T1215): 밭 칸 하나 = `crops.FIELD_CELL_M2`(250 m²) — 그 수를 여기서 다시 적지 않는다(사본 0).
//   ⇒ `CELL_READING` = 'map'(종전 · 기본) | 'field'. 개간 분은 넓이에(m²) · 말뚝은 변 길이에(√넓이 m) 걸린다. **정하지 않는다 — 재민 판정(회부).**
const CELL_READING = 'map';
const _crops = (() => { try { return require('./crops'); } catch (e) { return null; } })();
function cellM2(reading) {
  const r = reading || CELL_READING;
  if (r === 'field') return (_crops && _crops.FIELD_CELL_M2 > 0) ? _crops.FIELD_CELL_M2 : 1;
  return 1;
}
const edgeM = (reading) => Math.sqrt(cellM2(reading));
// 셀 하나의 값 — { m, laborMin(사람 · 분), posts(말뚝 수), wood(통나무) }
//   ★[T1238] 넓이(`o.area` m²)를 안 주면 칸 넓이 읽기(`cellM2()` — 기본 'map' = 1 m²)를 쓴다 · 새 경계 길이 = 변 수 × 변 길이(√넓이) — 'map' 이면 1 m(종전 산수 그대로).
function cellCost(o) {
  const M = mult(o.S, o.r, o.S0, o.alpha, o.k);
  const area = o.area > 0 ? o.area : cellM2(o.reading);       // 셀 하나 = 1 m²(`village-layout` "1셀 = 1m") · 'field' = 250 m²
  const laborMin = clearMinPerM2() * area * M.m;
  const posts = boundaryGrowth(o.nb) * Math.sqrt(area) / POST_SRC.spacingM * M.m;
  const wood = posts * woodPerPost();
  return { m: M.m, size: M.size, shape: M.shape, R: M.R, laborMin, posts, wood, area };
}

// ★★[T1243 추신 5 · ★재민 11-09 칸 넓이 · T1238 회부] **밭 내기** — 영토 칸은 지도 넓이(`CELL_READING` 'map' 그대로) · 그 칸을 밭으로 만들 때
//   밭 넓이(`crops.FIELD_CELL_M2` · 250 m²)만큼 개간을 따로 치른다 = 개간 1.44 사람·분/m²(위 출처 ① · 드라베드) × (밭 넓이 − 이미 개간한 넓이).
//   이미 개간한 넓이 = 영토 넓히기에서 그 칸을 몸이 개간했으면 그 칸의 지도 넓이(`cellM2('map')`) · 아니면 0 — 부르는 쪽이 준다(정본 한 곳 · 사본 0).
//   ⇒ 새 밭 한 칸 = 1.44 × 250 = 360 사람·분(6 사람·시간) — 수확(250 m² 어치)과 같은 넓이. NPC · 플레이어가 이 함수 하나를 읽는다.
function fieldClearMin(clearedM2) { return clearMinPerM2() * Math.max(0, cellM2('field') - Math.max(0, +clearedM2 || 0)); }

module.exports = { CLEAR_SRC, POST_SRC, K, ALPHA, CELL_READING, cellM2, edgeM, clearMinPerM2, woodPerPost, radiusOf, mult, boundaryGrowth, cellCost, fieldClearMin };
