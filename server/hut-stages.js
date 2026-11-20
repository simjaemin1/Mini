// === server/hut-stages.js — 움집 한 채의 공정·자재 정본 [T400 2026-09-26] ==================
//
// ★왜 이 파일이 있나 [재민 #51 ⓐ "집도 행위" · PM 권고 #61 "서버 `HUT_STAGES` 가 정본"]
//   T361 이 잰 것: 집의 자재를 말하는 표가 **둘**이었다 — econ(`HOUSE_WOOD 1.5 · HOUSE_STONE 2.5` × 정원 6
//   = 목재 9 · 석재 15)과 서버 움집 공정(`zone.js HUT_STAGES` · 원자재로 통나무 22 · 풀 38 · 석재 0).
//   같은 6×4 움집(`_vbFootprint`)을 두 표가 다른 물건으로 말했다.
//   ⇒ **표를 하나로** 둔다: 그 표가 여기다. `zone.js`(플레이어가 파는 움집 · 크루 의뢰 선납)와
//     econ(`sim/economy-sim.js` — 행위 손잡이가 켜지면 집 자재 수요를 이 표에서 **유도**한다)이 **같은 이 표**를 읽는다.
//   ⚠값은 한 글자도 안 바뀌었다 — `zone.js` 에 있던 그 네 줄·세 줄을 **옮겼을 뿐**이다(발굴 순서 고증 그대로).
//   ⚠#61 이 뒤집히면(econ 표가 정본) **이 파일의 네 줄만** 바뀐다 — 부르는 쪽은 전부 이 표를 읽으므로 따라온다.
//
// ★브라우저 번들에도 들어간다(`sim/build-econ-bundle.js` — econ 이 이 파일을 lazy require 한다) ⇒ **Node 전용 API 0**.
'use strict';

// ★[사용자 확정 "건축 순서 고증"] 움집 다단계 건축 — 수혈주거 축조 공정(발굴 순서):
//   ① 수혈 굴착(곡괭이 — 깊이 반지하 터파기) → ② 굴립주 기둥 6주(도끼 다듬은 통나무) → ③ 도리·서까래 골조(풀 결속) → ④ 이엉 지붕 잇기 → 완공.
//   완공 실체 = NPC 움집과 동일 6×4(벽=변·남벽 2칸 문·바닥).
const HUT_STAGES = [
  { need: {},                        tool: 'pickaxe', wear: 3, label: '① 수혈 굴착(터파기)' },
  { need: { pillar: 6 },                                       label: '② 굴립주 기둥 세우기(기둥 6)' },
  { need: { rafter: 8, fiber: 6 },                             label: '③ 도리·서까래 골조(서까래 8·풀 6)' },
  { need: { thatch: 8 },                                       label: '④ 이엉 지붕 잇기(이엉 8)' },
];
// ★[사용자 확정 — 건축 조합법 고증] 움집(수혈주거) 축조 중간재: 발굴 근거 자재 체계(굴립주·서까래·이엉).
//   `zone.js ITEM_RECIPES` 가 이 세 줄을 **그대로 펼쳐 넣는다**(제작창 순서·내용 무변 · 사본 0).
const HUT_RECIPES = {
  pillar:  { from: { wood: 3 }, to: { pillar: 1 },  requiresTool: 'axe', label: '기둥 (통나무 3 → 굴립주 기둥 1)' },
  rafter:  { from: { wood: 1 }, to: { rafter: 2 },  requiresTool: 'axe', label: '서까래 (통나무 1 → 서까래 2)' },
  thatch:  { from: { fiber: 4 }, to: { thatch: 1 },                      label: '이엉 (풀 4 → 이엉 1 — 맨손 엮기)' },
};
// ★크루 의뢰 선납 — **공정 표에서 유도**한다(종전 `zone.js` 리터럴 `{ pillar: 6, rafter: 8, thatch: 8 }` 과 같은 값 · 같은 순서).
//   원자재(풀 `fiber`)는 빼고 **중간재만** 낸다(종전 주석 "fiber는 원자재라 제외" 그대로).
const PSITE_COST = (() => {
  const o = {};
  for (const st of HUT_STAGES) for (const [k, n] of Object.entries(st.need || {})) if (HUT_RECIPES[k]) o[k] = (o[k] || 0) + n;
  return o;
})();

// ── 유도 — 한 단계 · 한 채의 **원자재**(레시피로 되돌린 것) ─────────────────────────────
//   레시피 한 번이 `to` 개를 내므로 필요한 만큼 **올림**해서 판다(서까래 8 = 통나무 1 → 서까래 2 × 4번 = 통나무 4).
function rawOfNeed(need) {
  const out = {};
  for (const [k, n] of Object.entries(need || {})) {
    const rc = HUT_RECIPES[k];
    if (!rc) { out[k] = (out[k] || 0) + n; continue; }
    const per = Object.values(rc.to)[0];
    const times = Math.ceil(n / per);
    for (const [ik, iv] of Object.entries(rc.from)) out[ik] = (out[ik] || 0) + iv * times;
  }
  return out;
}
const stageRaw = (i) => rawOfNeed((HUT_STAGES[i] || {}).need);
const hutRaw = () => {
  const out = {};
  for (let i = 0; i < HUT_STAGES.length; i++) for (const [k, n] of Object.entries(stageRaw(i))) out[k] = (out[k] || 0) + n;
  return out;
};

// ── ★[T497 2026-09-28] 고증 기둥 수 — 송국리형 집자리 ─────────────────────────────────────────
//   "바닥 중앙에 … 구덩이를 길게 파고 그 양쪽 끝 부분에 기둥구멍을 대칭으로 배치"(주기둥 **2**) · 구덩이 둘레에 **4** 기둥을 둔 형식도 있다
//   (보고/T497 §ⓐ 출처 둘). ② 단계의 기둥 수만 이 값으로 바꾼 한 채 — 나머지 단계·레시피는 위 표 그대로(서까래·이엉 수는 출처를 못 찾았다).
//   ⚠econ 단가 팔(`T497_HUT_COST` · 기본 끔)만 이것을 읽는다 — 서버 공정(`zone.js` 움집·의뢰 선납)은 위 표 그대로(값은 재민 #83).
const HUT_PILLARS_ATTESTED = [2, 4];
function stageNeedPillars(i, n) {
  const need = Object.assign({}, (HUT_STAGES[i] || {}).need);
  if (need.pillar != null) need.pillar = n;
  return need;
}
const stageRawPillars = (i, n) => rawOfNeed(stageNeedPillars(i, n));
const hutRawPillars = (n) => {
  const out = {};
  for (let i = 0; i < HUT_STAGES.length; i++) for (const [k, v] of Object.entries(stageRawPillars(i, n))) out[k] = (out[k] || 0) + v;
  return out;
};

// ── ★[T517 2026-09-29] 돌 — 주춧돌(礎石) · 한 기둥에 하나 ─────────────────────────────────────────────
//   고증(보고/T517 §ⓐ): **송국리형**은 기둥구멍에 기둥을 박는다(주춧돌 기재 0 · 중앙 구덩이는 화덕이 아니라는 견해) ⇒ 표의 석재 0 은
//   송국리형에 맞다. 주춧돌·돌두름 화덕은 **가락동식** 집자리의 표지다(한국고고학사전). 청동기 주춧돌 실측은 진주 대평리 옥방5지구
//   "가로 25㎝ 세로 35㎝ 높이 8∼10㎝" · 9개(한국일보 1998-08-06). 돌 밀도는 화강암 평균 2.65~2.75 g/㎤(출처 · 보고 §ⓐ).
//   ⇒ 주춧돌 한 개 kg = 가로 × 세로 × 높이(가운데) × 밀도(가운데) — 출처의 수만 쓴다(새 수 0). econ 단가 팔(`T517_HUT_STONE`)만 읽는다.
const HUT_PLINTH_SRC = { cm: [25, 35], hCm: [8, 10], gcm3: [2.65, 2.75] };
function plinthKg() {
  const S = HUT_PLINTH_SRC, mid = (r) => (r[0] + r[1]) / 2;
  return S.cm[0] * S.cm[1] * mid(S.hCm) * mid(S.gcm3) / 1000;
}
//   단계 i 의 주춧돌 kg — 기둥이 서는 단계(② 굴립주)에만 · 기둥 n 개면 n 개(`n` 을 안 주면 표의 기둥 수).
function stageStoneKg(i, n) {
  const need = (HUT_STAGES[i] || {}).need || {};
  if (need.pillar == null) return 0;
  return (n == null ? need.pillar : n) * plinthKg();
}

// ── ★★[T1392 · ★재민 11-19 판정 9 "3x3 소형 간이 움집도 만들 수 있게"] 간이 움집 3×3 — **6×4 표에서 유도한 첫 후보**(새 수 0 · 고르는 것은 재민) ──
//   발자국 둘(셀): 6×4 = NPC 움집 정본(`_vbFootprint` · 위 머리글 "완공 실체 = NPC 움집과 동일 6×4") · 3×3 = 재민이 정한 간이 움집.
//   유도 규칙(카드 T1392 ③ 글자 그대로):
//     기둥 = **모서리 넷**(6×4 의 6 = 모서리 4 + 긴 변 가운데 2 — 간이 움집은 긴 변이 없다) — 위 고증 `HUT_PILLARS_ATTESTED` 의 4(구덩이 둘레 4 기둥)와 같은 수
//     서까래 = 둘레 비(2 × (6 + 4) = 20 → 2 × (3 + 3) = 12) · 결속 풀 · 이엉 = 넓이 비(24 → 9) — 올림(반 개는 못 쓴다)
//   단계 넷 · 도구 · 닳음 · 레시피는 그대로(사본 0 — 6×4 표의 행을 고쳐 쓴다).
const HUT_FOOT = { w: 6, h: 4 };
const SMALL_FOOT = { w: 3, h: 3 };
const _perim = (f) => 2 * (f.w + f.h), _area = (f) => f.w * f.h;
const SMALL_PILLARS = 4;   // 모서리 넷(직사각형의 모서리 수 — 6×4 의 6 에서 긴 변 가운데 둘을 뺀 것)
const _scale = { rafter: _perim(SMALL_FOOT) / _perim(HUT_FOOT), fiber: _area(SMALL_FOOT) / _area(HUT_FOOT), thatch: _area(SMALL_FOOT) / _area(HUT_FOOT) };
function smallNeed(need) {
  const o = {};
  for (const [k, n] of Object.entries(need || {})) o[k] = k === 'pillar' ? SMALL_PILLARS : (_scale[k] ? Math.ceil(n * _scale[k]) : n);
  return o;
}
const _KO = { pillar: '기둥', rafter: '서까래', fiber: '풀', thatch: '이엉' };
//   글 — 6×4 표의 글 꼴 그대로 수만 갈아 끼운다(괄호 안 "이름 수" 를 새 수로)
function _relabel(label, need) {
  const parts = Object.entries(need).map(([k, n]) => `${_KO[k] || k} ${n}`);
  return parts.length ? String(label).replace(/\([^)]*\)\s*$/, `(${parts.join('·')})`) : label;
}
const SMALL_STAGES = HUT_STAGES.map((st) => { const need = smallNeed(st.need); return Object.assign({}, st, { need, label: _relabel(st.label, need) }); });
const stagesOf = (small) => (small ? SMALL_STAGES : HUT_STAGES);
//   간이 움집 한 채의 원자재(레시피로 되돌린 것) — 보고 표 · 하네스가 읽는다
const smallRaw = () => {
  const out = {};
  for (const st of SMALL_STAGES) for (const [k, n] of Object.entries(rawOfNeed(st.need))) out[k] = (out[k] || 0) + n;
  return out;
};

module.exports = { HUT_STAGES, HUT_RECIPES, PSITE_COST, rawOfNeed, stageRaw, hutRaw, HUT_PILLARS_ATTESTED, stageRawPillars, hutRawPillars,
  HUT_PLINTH_SRC, plinthKg, stageStoneKg,
  HUT_FOOT, SMALL_FOOT, SMALL_PILLARS, SMALL_STAGES, stagesOf, smallNeed, smallRaw };   // ★[T1392] 간이 움집 3×3
