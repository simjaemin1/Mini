// === server/era.js — 시대. "이 세계에서 지금 무엇이 **널리** 가능한가"를 정하는 단 하나의 자리 ===
//
// ★[재민 확정 2026-08-01]
//   "내가 철기시대를 오픈하지 않아도 유저들이 철을 어렵게는 만들 수 있어야 한다니까?"
//   "시간이 흐르면서 점차 개발자의 개입으로 철 사용이 용이해지는 그런 게임 (타임스탬프 기반이어도 좋고)"
//   "철뿐만이 아니라 말도야. 먼 미래에는 알루미늄이나 우라늄까지."
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★시대는 **자물쇠가 아니라 다이얼**이다 — 처음에 자물쇠로 짰다가 재민이 잡았다.
//
//   고증적으로도 자물쇠가 틀렸다. 철기시대는 "철이 **가능해진** 때"가 아니라
//   "철이 **보편화된** 때"다. 청동 제련 부산물로 나온 철, 개별 장인이 어렵게 해낸 철기 유물은
//   철기시대보다 수백 년 앞선다. 시대 구분은 발견이 아니라 **확산**을 가리킨다.
//
//   ⇒ 그래서 이 파일은 금속별로 "된다/안 된다"를 적지 않는다. 두 가지만 정한다:
//       ① tech      — 이 시대에 **알려진 설비·공정** (노 설계가 여기 있다)
//       ② npcMetals — NPC 마을이 **다룰 줄 아는** 금속 (NPC는 지식 전파의 대상이라 이진값이 맞다)
//     플레이어가 무엇을 해낼 수 있는지는 여기가 아니라 **노의 도달 온도와 금속의 물성**이 정한다.
//     (FURNACE 표 + ALLOY_E.mp — 표가 아니라 물리가 답한다. 그래야 알루미늄·우라늄도 자동이다.)
//
// ★[재민 확정] 지식 축은 **순수 플레이어 지식**이다 — 캐릭터에 붙는 '레시피 습득' 상태를 만들지 않는다.
//   게임이 철 제련 절차를 알려주지 않을 뿐이고, 알아낸 사람은 그냥 하면 된다.
//   대장장이가 온도계 없이 쇠의 색으로 온도를 읽는 것도 그대로 고증이다.
//
// ★[재민 확정] 시대 오픈은 **세계 전체 동시**다. 다만 조회 함수는 zone 인자를 받을 수 있게 열어둔다
//   (나중에 존별 시차를 주고 싶어지면 표만 바꾸면 되도록 — 호출부는 안 고친다).
//
// ─────────────────────────────────────────────────────────────────────────────
// ★★★수요는 절대 자르지 않는다 [재민 2026-08-01 — 내 설계 오류를 잡아준 지적]
//   "당연히 철광석은 수요가 없지. npc는 만들 줄 모르니까. 하지만 플레이어가 철을 어떻게든
//    제련에 성공해 철제 무기를 만들면, 그건 npc가 수요가 있어야지.. 이것까지 하드코딩을 해야 해?"
//   청동기 사람에게 강철검을 쥐여 주면 기꺼이 쓰고 값도 치른다. 못 만들 뿐이지 못 쓰는 게 아니다.
//   ⇒ 이 파일에 수요·가격 관련 함수를 두지 않는다. 누가 추가하고 싶어지면 이 문단을 먼저 읽어라.
//   유령 수요("안 쓰는 철을 사온다")는 시대 문제가 아니라 가격 모델의 **무조건 바닥** 문제다:
//       v1 computeDynReserve : baseline = RESERVE_PC[r] × N × 0.3
//       v2 computeShadowPrices: buffer  = N × UTILITY_WEIGHT[r] × 1.2
//   그 바닥을 걷고 흐름 수요(flowT=_consEMA×30)만 남기면, 안 쓰면 0이고 쓰기 시작하면 저절로 생긴다.
'use strict';

// ── 시대 목록 — 배열 순서가 곧 진행 순서 ─────────────────────────────────────
const ERAS = ['bronze', 'early_iron', 'iron', 'steel', 'industrial', 'atomic'];

// ── 시대별로 **새로 알려지는** 것. 상위 시대는 하위를 전부 포함(누적) ────────
const UNLOCK = {
  bronze: {
    tech: ['pit_furnace', 'crucible', 'bellows', 'cupellation', 'charcoal_kiln'],
    npcMetals: ['copper', 'tin', 'lead', 'gold', 'silver'],
    tame: ['dog', 'pig', 'cattle'],
  },
  early_iron: {
    // ★괴련로(bloomery) — 철을 **녹이지 않고** 환원해 해면철을 얻는 노. 이게 철기시대의 실질이다.
    tech: ['bloomery'],
    npcMetals: ['iron'],
    tame: ['horse'],     // 한반도 기마 문화는 삼국시대 — 송국리기엔 없다
  },
  iron:       { tech: ['improved_bloomery', 'carburizing'], npcMetals: [], tame: [] },
  steel:      { tech: ['crucible_steel', 'retort'], npcMetals: ['nickel'], tame: [] },   // retort=증류기(중세 인도 아연 증류)
  industrial: { tech: ['blast_furnace', 'electrolysis'], npcMetals: ['zinc', 'aluminium'], tame: [] },
  atomic:     { tech: ['enrichment'], npcMetals: ['uranium'], tame: [] },
};

// ── 노(爐)의 도달 온도 — **여기가 난이도의 실체다** ──────────────────────────
//   금속별 난이도 표를 만들지 않는다. 노가 낼 수 있는 온도와 ALLOY_E.mp 를 비교하면
//   무엇이 되고 무엇이 안 되는지 저절로 나온다. 새 금속을 추가해도 표를 안 고친다.
//
//   고증
//     · 모닥불 ~700℃ · 구덩이 노+장작 ~900℃ · 도가니+목탄 ~1150℃
//     · 괴련로(풀무) ~1300℃ · 개량 괴련로 ~1450℃ · 고로 ~1600℃
//     · 연료가 절반이다 — 장작으론 온도가 안 난다. **목탄**이라야 한다.
//       (hanbando-minerals.js:35 "청동기 야금 연료는 목탄이다. 석탄은 황이 금속을 취화시켜 못 쓴다")
//     · 풀무(송풍)가 나머지 절반이다.
const FURNACE = { campfire: 700, pit_furnace: 900, crucible: 1150, bloomery: 1300, improved_bloomery: 1450, blast_furnace: 1600 };
const FUEL_CAP  = { wood: 900, charcoal: Infinity };   // 장작은 900℃ 위로 못 간다(설비와 무관)
const BELLOWS_BONUS = 150;

// ★철이 왜 '거의 불가능'인가 — 이 두 줄이 전부다
//   철광석 환원은 ~800℃부터 일어난다(청동기 노도 낸다). 그런데 융점이 1538℃라 **안 녹는다.**
//   ⇒ 청동기 최고 설비(도가니+목탄+풀무 = 1300℃)로도 나오는 건 쇳물이 아니라 해면철(bloom)이고,
//     그마저 슬래그 범벅이라 두들겨 짜내야 한다. 실패하면 못 쓰는 덩어리다(전부 아니면 전무).
//   ⇒ 시대가 열리면 괴련로 설계가 알려져 같은 1300℃를 **안정적으로** 낸다. 그게 "쉬워진다"의 정체다.
const REDUCTION_T = { copper: 800, tin: 1100, lead: 800, silver: 800, gold: 0, iron: 800, nickel: 1300, zinc: 1000 };
const ELECTRO_ONLY = new Set(['aluminium', 'uranium']);   // 온도로는 영원히 안 된다 — 전기분해 tech 필요

// ★끓는점 — 아연의 특례가 아니라 **일반 규칙**이다.
//   환원에 필요한 온도가 그 금속의 끓는점보다 높으면, 뽑는 순간 증기가 되어 날아간다.
//   아연: 환원 ~1000℃ > 끓는점 907℃ → 노 안에서 증발한다. 그래서 순수 분리가 중세 인도(증류법)까지 늦었다.
//   ⇒ 증류기(retort)로 증기를 받아 응결시키는 기술이 있어야 회수된다. 표가 아니라 물리다.
const BOILING_T = { zinc: 907, lead: 1749, tin: 2602, copper: 2562, silver: 2162, gold: 2856, iron: 2862, nickel: 2913 };

// ── 스케줄 — 타임스탬프 자동 진행 ────────────────────────────────────────────
//   지금 시각 이하인 항목 중 가장 발전한 것이 현재 시대. 비워두면 영원히 청동기.
const SCHEDULE = [
  { at: '1970-01-01T00:00:00Z', era: 'bronze' },
  // { at: '2027-01-01T00:00:00Z', era: 'early_iron' },
];

// ── 수동 덮어쓰기(개발자 개입) — setEra() > WORLD_ERA > SCHEDULE ─────────────
let _override = null;
function setEra(era) {
  if (era == null) { _override = null; return null; }
  if (!ERAS.includes(era)) throw new Error(`알 수 없는 시대: ${era} (가능: ${ERAS.join(', ')})`);
  _override = era; _capCache.clear(); return era;
}
function currentEra(nowMs /*, zone — 존별 시차를 주고 싶어지면 여기 */) {
  if (_override) return _override;
  const env = typeof process !== 'undefined' && process.env && process.env.WORLD_ERA;
  if (env) { if (!ERAS.includes(env)) throw new Error(`WORLD_ERA 값이 이상하다: ${env}`); return env; }
  let t = nowMs;
  if (t == null) { try { t = Date.now(); } catch (e) { t = 0; } }   // 랩·번들에서 Date 가 막혀 있으면 호출측이 준다
  let best = ERAS[0];
  for (const s of SCHEDULE) { if (Date.parse(s.at) <= t && eraIndex(s.era) >= eraIndex(best)) best = s.era; }
  return best;
}
function eraIndex(era) { const i = ERAS.indexOf(era); return i < 0 ? 0 : i; }
const atLeast = (era, min) => eraIndex(era) >= eraIndex(min);

// ── 능력 조회 — 누적 합집합 ──────────────────────────────────────────────────
const _capCache = new Map();
function capsOf(era) {
  const e = ERAS.includes(era) ? era : ERAS[0];
  if (_capCache.has(e)) return _capCache.get(e);
  const out = { tech: new Set(), npcMetals: new Set(), tame: new Set() };
  for (let i = 0; i <= eraIndex(e); i++) {
    const u = UNLOCK[ERAS[i]] || {};
    for (const k of Object.keys(out)) for (const v of (u[k] || [])) out[k].add(v);
  }
  _capCache.set(e, out); return out;
}
const hasTech = (tag, era) => capsOf(era || currentEra()).tech.has(tag);
const canTame = (animal, era) => capsOf(era || currentEra()).tame.has(animal);

// ★★NPC 생산 게이트 — econ 이 부르는 **유일한** 시대 함수.
//   NPC 마을은 지식 전파의 대상이라 이진값이 맞다. "이 시대 마을이 이 금속을 다룰 줄 아는가."
//   못 다루면 제련 산출에서 빠진다 = 광석의 그 성분은 **슬래그로 버려진다**(물리적으로도 맞다).
//   ⚠수요는 안 자른다. 플레이어가 철검을 팔면 마을은 산다 — 위 문단 참조.
const npcKnows = (metal, era) => capsOf(era || currentEra()).npcMetals.has(metal);

// ── 플레이어 축 — 노의 도달 온도와 물리가 정한다 ─────────────────────────────
//   setup = { furnace:'crucible', fuel:'charcoal', bellows:true }
function furnaceTemp(setup, era) {
  const s = setup || {};
  const f = s.furnace || 'campfire';
  if (!FURNACE[f]) return 0;
  if (f !== 'campfire' && !hasTech(f, era)) return 0;          // 아직 알려지지 않은 노 설계
  let t = FURNACE[f];
  if (s.bellows) { if (!hasTech('bellows', era)) return 0; t += BELLOWS_BONUS; }
  const cap = FUEL_CAP[s.fuel || 'wood'];
  return Math.min(t, cap == null ? 900 : cap);
}
// 이 설비로 이 금속을 어디까지 할 수 있나
//   'none'  아무것도 안 나온다
//   'solid' 고체 금속만 나온다 → **단조만** 가능(주조 불가). 철이면 이게 해면철(bloom)이다.
//   'melt'  녹는다 → 주조 가능
//   ★금속별 특례 없음. 환원온도와 융점만 본다. 새 금속을 넣어도 이 함수는 안 고친다.
function _mpOf(metal) { try { return (require('./specialty').ALLOY_E[metal] || {}).mp || 0; } catch (e) { return 0; } }
function smeltOutcome(metal, setup, era) {
  if (ELECTRO_ONLY.has(metal)) return hasTech('electrolysis', era) ? 'melt' : 'none';   // 온도로는 영원히 안 된다
  const red = REDUCTION_T[metal];
  if (red == null) return 'none';
  const T = furnaceTemp(setup, era);
  if (T < red) return 'none';
  // ★증발 — 뽑는 순간 날아가는 금속은 증류기가 있어야 회수된다(아연이 이 경우)
  const bp = BOILING_T[metal];
  if (bp != null && T >= bp && !hasTech('retort', era)) return 'vapor';
  return T >= _mpOf(metal) ? 'melt' : 'solid';
}

// ★★수율 — "된다/안 된다"만으로는 '거의 불가능'이 표현되지 않는다. 두 항의 곱이다.
//
//   ① 온도 여유 heat = (T − 환원온도) / (융점 − 환원온도)
//      환원온도를 겨우 넘긴 노는 슬래그를 못 뺀다. 여유가 클수록 잘 나온다.
//      철: 환원 800 · 융점 1538 → 도가니+풀무(1300) 0.68 · 구덩이노(900) 0.14 · 괴련로(1450) 0.88
//      구리: 환원 800 · 융점 1085 → 도가니(1150)면 이미 녹으므로 1.0
//
//   ② 지식 KNOW — 이게 시대의 실체다.
//      괴련로는 그냥 뜨거운 노가 아니라 **환원 분위기(CO 과잉)를 유지하도록 설계된** 노다.
//      모르면 애써 환원한 철이 도로 산화된다. 그래서 같은 온도라도 설계를 알면 수율이 확 오른다.
//      ⇒ 시대가 그 금속을 아직 모르면 KNOW_BLIND 를 곱한다. "가능하되 지독하게 어렵다"가 여기서 나온다.
//      ⇒ 시대가 열리면 KNOW=1. 이게 "오픈하면 쉬워진다"의 전부다 — 다른 건 아무것도 안 바뀐다.
//
//   ※녹여서 붓는(melt) 금속은 지식 페널티가 없다 — 액체가 되면 슬래그가 저절로 뜬다.
//     청동기 사람도 구리는 잘 뽑았다. 어려운 건 **녹지 않는 것을 다루는 일**뿐이다.
const KNOW_BLIND = 0.05;   // 설계를 모르고 하는 제련의 수율 배수(1/20). '거의 불가능'의 눈금.
function smeltYield(metal, setup, era) {
  const out = smeltOutcome(metal, setup, era);
  if (out === 'none' || out === 'vapor') return 0;
  if (out === 'melt') return 1;
  const red = REDUCTION_T[metal] || 0, mp = _mpOf(metal);
  const T = furnaceTemp(setup, era);
  const heat = mp > red ? Math.max(0, Math.min(1, (T - red) / (mp - red))) : 1;
  const know = npcKnows(metal, era) ? 1 : KNOW_BLIND;   // 세계가 아는가 = 설계가 알려졌는가
  return +(heat * know).toFixed(4);
}

// ★운철(隕鐵) — '거의 불가능'의 **'거의'** [재민 확정]
//   실제 운철은 Fe-Ni 자연합금(니켈 5~10%)이고 **제련이 필요 없다** — 이미 금속이다.
//   투탕카멘 단검이 운철이고 청동기 이전 유물도 있다. 어려운 이유는 니켈이 아니라
//   **하늘에서 떨어진 것이라 광맥이 없다**는 것 — 탐사로 찾는 경로 자체가 없다.
//   니켈의 역할은 난이도가 아니라 성능이다(순철보다 단단하고 덜 삭는다 — 3천 년 유물이 남은 이유).
//   ALLOY_E 에 iron·nickel 이 이미 있어 합금 모델이 그대로 계산한다(새 물성 상수 불필요).
const METEORIC = { iron: 0.93, nickel: 0.07 };

// specialty.ALLOY_ERA 호환 — 사본을 두지 않고 여기서 파생한다.
const npcMetalList = (era) => [...capsOf(era || currentEra()).npcMetals];

// 이 시대에 지을 수 있는 **가장 좋은 노** — specialty.alloySmeltable 이 이걸로 파생한다(사본 금지).
function bestSetup(era) {
  const c = capsOf(era || currentEra());
  let best = 'campfire', bestT = FURNACE.campfire;
  for (const f of Object.keys(FURNACE)) { if (f !== 'campfire' && !c.tech.has(f)) continue; if (FURNACE[f] > bestT) { best = f; bestT = FURNACE[f]; } }
  return { furnace: best, fuel: c.tech.has('charcoal_kiln') ? 'charcoal' : 'wood', bellows: c.tech.has('bellows') };
}
// 이 시대에 **도가니에 넣어 부을 수 있는** 금속 — 옛 ALLOY_ERA 표를 대체한다.
//   표가 아니라 물리다: 그 시대 최고 노의 온도 ≥ 융점 인 금속만.
const castableMetals = (era) => Object.keys(REDUCTION_T).concat([...ELECTRO_ONLY])
  .filter((m) => smeltOutcome(m, bestSetup(era), era) === 'melt');

module.exports = {
  ERAS, UNLOCK, SCHEDULE, FURNACE, FUEL_CAP, BELLOWS_BONUS, REDUCTION_T, BOILING_T, METEORIC,
  currentEra, setEra, eraIndex, atLeast, capsOf,
  hasTech, canTame, npcKnows, npcMetalList, KNOW_BLIND,
  furnaceTemp, smeltOutcome, smeltYield, bestSetup, castableMetals,
};
