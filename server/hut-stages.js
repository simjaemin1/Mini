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

module.exports = { HUT_STAGES, HUT_RECIPES, PSITE_COST, rawOfNeed, stageRaw, hutRaw };
