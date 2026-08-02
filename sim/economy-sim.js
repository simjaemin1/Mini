#!/usr/bin/env node
/**
 * NPC 마을 자율 경제 시뮬레이션
 *
 * 검증 목표:
 *  1. 비옥도·자원 분포에 따른 마을별 식량 생산 차이
 *  2. 식량 ↑ + 영토 ↑ → 인구 ↑ (로지스틱 K-연동)
 *  3. 인구 증가 시 직업이 골고루 (자율 항상성)
 *  4. 분업 최적해 근접 (전체 농부 비율이 80~90% 부근으로 수렴)
 *  5. 비교우위 특화 (지역별 자원 강세 → 직업 분포 차이)
 *  6. 교역 창발 (특화 마을이 다른 마을과 잉여/부족 매칭)
 *  7. 봉쇄 시 자급 회복 (특화 마을이 농부 비율 증가)
 *  8. NPC 직업 전환 + skill/trait 동작
 *
 * 시뮬 단위: 1 tick = 1 day
 * 실행: node economy-sim.js [days=1000] [seed=42]
 */

'use strict';

// === Phase 5-5-econ-d: 마을 stat 계산 (specialty.contributes 기반) ===
//   인구당 정규화한 자원 만족도로 5 stat 산출.
//   순환 import 방지를 위해 lazy specialty require.
let _SPECIALTY;
function _getSpecialty() {
  if (_SPECIALTY === undefined) {
    try { _SPECIALTY = require('../server/specialty').RESOURCES; }
    catch { _SPECIALTY = null; }
  }
  return _SPECIALTY;
}
// 채광·합금 모델(server/specialty.js) — 감정·제련·합금이 전부 여기서 온다. lazy 로드(순환 import 방지).
let _SPECMOD;
function _spec() {
  if (_SPECMOD === undefined) { try { _SPECMOD = require('../server/specialty'); } catch { _SPECMOD = null; } }
  return _SPECMOD;
}
const SPEC = new Proxy({}, { get: (_, k) => { const m = _spec(); return m ? m[k] : undefined; } });
// 옛 시뮬 자원 → stat 매핑 (specialty.js에 없는 자원도 stat 부여)
const LEGACY_CONTRIBUTES = {
  food:        { subsistence: 1.0 },
  cooked_food: { subsistence: 1.0, happiness: 0.5 },
  fruit:       { subsistence: 0.4, health: 0.3, happiness: 0.2 },
  vegetable:   { subsistence: 0.5, health: 0.3 },
  mushroom:    { subsistence: 0.4, health: 0.2 },
  meat:        { subsistence: 0.8, health: 0.3 },
  fish:        { subsistence: 0.8, health: 0.4 },
  hide:        { defense: 0.2 },
  weapon:      { defense: 1.0 },
  armor:       { defense: 0.8 },
  tool:        { production: 0.5 },
  wood:        { production: 0.3 },
  stone:       { production: 0.3, defense: 0.2 },
  // ★★[재민 지시 "경제학적 원리에 입각해"] 효용 사슬도 **단조**여야 한다.
  //   원석 3 개를 녹여야 금속 1 개가 나오는데(수율 0.45), 원석 기여가 0.4 이고 구리가 0.8 이면
  //   제련할수록 마을 stat 이 **줄어든다**(원석 2.2×0.4 = 0.89 > 금속 1×0.8). 가격 사슬은 고쳤는데
  //   효용 사슬이 뒤집혀 있어서, 제련을 넣자 v2 인구가 1,624 → 998 로 무너진 진짜 원인이 이것이었다.
  //   원석은 **제련 전엔 생산에 못 쓴다** — production 기여는 금속에 있어야 한다.
  ore:         { production: 0.1 },
  obsidian:    { defense: 0.4, production: 0.2 },   // ★S5 흑요석: 예리(화살촉·소형칼날) → 방어·사냥 보조
  jade:        { prestige: 1.2 },                   // ★S5 옥: 위세품(prestige)
};
function _computeVillageStats(v, N) {
  const SP = _getSpecialty();
  const stats = { subsistence: 0, happiness: 0, health: 0, prestige: 0, defense: 0, production: 0 };
  const pop = Math.max(1, N);
  for (const [id, qty] of Object.entries(v.storage || {})) {
    if (qty <= 0) continue;
    // specialty.js 우선, 없으면 LEGACY
    const contributes = (SP && SP[id] && SP[id].contributes) || LEGACY_CONTRIBUTES[id] || null;
    if (!contributes) continue;
    const per_npc = qty / pop;
    const sat = Math.min(1.0, per_npc / 2.0);
    for (const [stat, w] of Object.entries(contributes)) {
      if (stats[stat] !== undefined) stats[stat] += w * sat;
    }
  }
  // ★S3 무기 품질(_weapQ) → defense·prestige 배수: 고품질(청동·명장) 무기가 방어·위세↑, 저품질(막석검) 무기는 낮음.
  //   기본 defense 기여(1.0×sat)에 (1 + SPAN×(_weapQ−0.5)) 추가분. _weapQ 0.5(석검)=중립, 1.0(명장청동)=+SPAN×0.5.
  if ((v.storage.weapon || 0) > 0 && v._weapQ != null) {
    const _wsat = Math.min(1.0, (v.storage.weapon || 0) / pop / 2.0);
    const _wbonus = WEAP_DEFENSE_SPAN * (v._weapQ - 0.5);   // −0.3(막석검 하한)~+0.3(명장청동)
    stats.defense += 1.0 * _wsat * _wbonus;
    // ★청동 위세품화(청동 희소성 복원) — 청동검(_weapQ>TH 고품질)은 방어뿐 아니라 *엘리트 표지*(위세). 주석 희소로 청동검=귀한 위세재라 가중↑(0.3→W).
    //   막석검·철검은 문턱(TH=0.7) 미달 → 위세 0. 청동 무장 마을(소수 산지·교역)만 위세 획득 → 병종 격차의 사회적 표현.
    if (v._weapQ > WEAP_BRONZE_PRESTIGE_TH) stats.prestige += WEAP_BRONZE_PRESTIGE_W * _wsat * (v._weapQ - WEAP_BRONZE_PRESTIGE_TH);   // 청동검=위세품(고품질만)
  }
  // ★식량 다양성 보너스 — 실제 *소비*(식단) 기반. consumeFood가 군별 소비량 기록(_foodEaten).
  //   자체생산이든 수입이든 "먹은" 군만 카운트 → 수입해서 바로 먹는 마을(광산촌)도 정당히 반영(재고0이어도).
  const _fg = new Set(), _eaten = v._foodEaten || {};
  for (const id in FOOD_GROUP) {
    if ((_eaten[id] || 0) / pop > 0.03) _fg.add(FOOD_GROUP[id]);
  }
  if ((_eaten.cooked_food || 0) / pop > 0.03) _fg.add('grain');   // 조리식 = 곡물군
  const _divN = Math.min(1, _fg.size / DIVERSITY_FULL);
  stats.happiness += _divN * DIVERSITY_HAPPY_W;
  stats.health += _divN * DIVERSITY_HEALTH_W;
  stats.foodGroups = _fg.size;
  // ★여가→행복(§노동): 포만으로 감산된 노동(_idleFrac)만큼 쉼 — 부유·수입촌은 반나절 노동으로 행복↑, 개척·궁핍촌은 idle 0이라 무보너스.
  //   교역 기회비용(사용자 질문의 실물화): 원정 나간 인원(_tradingN, v2 발행)은 생산도 쉼도 못 하므로 여가에서 차감 —
  //   "쉬는 대신 교역"의 비용이 행복 회계에 실재. 문턱엔 안 넣음(실측: 캐러밴 이익/일이 개인 mv를 3~4자릿수 압도 → 영원히 안 물림.
  //   교역 vs 휴식의 실배분 노브는 TRADE_SPARE_UTIL=0.11 — 여유노동의 11%만 원정, 89%는 쉼).
  const _leis = Math.max(0, (v._idleFrac || 0) - (v._tradingN || 0) / pop);
  stats.happiness += LEISURE_HAPPY_W * _leis;
  stats.leisure = _leis;
  // ★땔감 부족 → 건강 페널티(비례). fuelCov=1이면 0, 0이면 -FUEL_HEALTH_W. 큰/숲빈약 마을이 연료를 못 대면 건강↓→인구 억제.
  if (v._fuelCov !== undefined && v._fuelCov < 1) stats.health += (v._fuelCov - 1) * FUEL_HEALTH_W;
  stats.fuelCov = (v._fuelCov !== undefined) ? v._fuelCov : 1;
  // ★한랭×의복(2026-07-12) — 겨울 야간 한랭(v2 기온 모델의 coldStress)에 옷이 없으면 건강 페널티(연료 동형·비례),
  //   갖췄으면 소폭 행복(따뜻한 겨울). coldStress 미설치(구 호스트)=0 → 무해.
  if ((v._coldStress || 0) > 0) {
    const _cc = Math.min(1, v._clothCov || 0);
    stats.health -= COLD_HEALTH_W * v._coldStress * (1 - _cc);
    stats.happiness += COLD_CLOTHED_HAPPY_W * v._coldStress * _cc;
    // ★의복 품질 방한(2026-07-13 — _clothQ 채널): 기존 relief 불변(비회귀) + 잘 지은 옷일수록 *추가* 한랭 완화(품질×coverage×한랭). 재봉 숙련·고운 재료(모피·모시)가 겨울을 따뜻하게. 계절(coldStress) 전용.
    //   ★성숙 게이트(가죽제품 동형) — 개척기 취약 궤적 무교란(505 knife-edge: 무게이트 시 605→22 붕괴 실측). 정착 마을만 품질 방한 향유(개척기는 옷 있는 것만으로 족).
    if (N >= RAMIE_MIN_POP) {
      const _cq = (v._clothQ != null ? v._clothQ : CLOTH_Q_BASE);
      stats.health += CLOTH_Q_HEALTH_W * v._coldStress * _cc * _cq;
      stats.happiness += CLOTH_Q_HAPPY_W * v._coldStress * _cc * _cq;
    }
  }
  stats.clothCov = v._clothCov != null ? v._clothCov : 1;
  // ★가죽제품 comfort(2026-07-13) — 신발·깔개·주머니 갖춤 = 생활수준↑(건강·행복 소폭). 없어도 페널티 0(comfort·필수 아님 → 수입 강제 없음·잉여 마을만 향유). hide 글럿의 실사용처.
  if ((v._lgCov || 0) > 0) { stats.health += LG_HEALTH_W * v._lgCov; stats.happiness += LG_HAPPY_W * v._lgCov; }
  // ★약재 일상 복용(§9 2차) — 건강의 세 번째 항: 재고/인구 비례, 상한으로 폭주 방지. 재고는 tickVillage가 매일 소모(흐름).
  const _herbPC = (v.storage && v.storage.herb > 0) ? v.storage.herb / pop : 0;
  if (_herbPC > 0) stats.health += Math.min(HERB_HEALTH_CAP, _herbPC * HERB_HEALTH_W);
  // ★호피 위신재(§9 3차) — 보유 자체가 위신(positional good): 소량으로 상한 도달(희소재), 기존 PRESTIGE 항 경유로 인구 소폭 보너스.
  const _thPC = (v.storage && v.storage.tigerhide > 0) ? v.storage.tigerhide / pop : 0;
  if (_thPC > 0) stats.prestige += Math.min(TIGERHIDE_PRESTIGE_CAP, _thPC * TIGERHIDE_PRESTIGE_W);
  return stats;
}

// =============================================================================
// 0. RNG (재현 가능한 seeded random)
// =============================================================================
let _seed = 42;
function srand() {
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xFFFFFFFF;
}
function setSeed(s) { _seed = s >>> 0; }
function pickWeighted(weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = srand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// =============================================================================
// 1. 자원·직업 정의
// =============================================================================
const RESOURCES = [
  'food', 'fish', 'meat', 'hide', 'cooked_food',
  'wood', 'stone', 'ore', 'tool',
  'iron', 'iron_tool',  // ★철(광맥 전용, 희소). iron_tool=레거시: 도구는 석기 전용으로 폐지 — 신규 생산 0, 기존 재고만 감가 소멸(키 유지=참조 안전).
  'copper', 'tin', 'bronze_tool',  // ★청동(구리+주석)=무기·위세품 전용(weaponsmith 청동검). bronze_tool=레거시: 청동은 연질이라 도구 부적합 — 신규 생산 0, 감가 소멸.
  'weapon', 'armor',  // Phase 4d-7: 무기/갑옷
  'fruit', 'vegetable', 'mushroom', 'pebble', 'twig',
  'herb',  // ★약재(§9 2차): 채집 부산물(~15%)+호골(호랑이 도축). 요양 단축·일상 복용 → 건강 공급
  'bone', 'tigerhide',  // ★§9 3차: 뼈(사냥 부산물+시각층 대물 도축 — 무기장 활 티어 투입재) · 호피(호랑이 도축 — 최고가 위신재, 교역 전용)
  'obsidian', 'jade',  // ★S5: 흑요석(특수 산지 — 예리 → 화살촉/소형칼날, 사냥·방어 보조 교역재) · 옥(특수 산지 — 위세품 교역재). 광부가 특수 산지에서 채굴.
];

// 부재료 set (cook이 variety 계산할 때 사용. food + 이 중 어떤 것이든 1종으로 카운트)
const COOK_SIDE_INGREDIENTS = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig'];

// 직업 정의. produceSpecial이 있으면 표준 생산 함수 대신 사용
const JOBS = {
  farmer: {
    field: 'farming', output: 'food', base: 1.5,
    landBoost: (v) => v.land.fertility, toolDependent: true, inputs: {},
    // 곡물 다양화 + 섬유(삼밭·모시밭). ★목화(cotton)·아마(flax) 제거 유지 — 목화는 1363년 문익점 도입(청동기 부재), 아마(flax)도 한국 전통 아님(서구 bast).
    //   고대 한반도 섬유 = 삼(대마/hemp=삼베) + 모시(저마/ramie — 한국 전통 bast, 삼국~ 실증이나 flax/cotton과 범주 다름). ★유령 박멸(§9): hemp 0.19→0.06 —
    //   삼은 전용 삼밭 소출이지 전 곡물의 부산물이 아님(0.19 = 실수요의 30배 유령 산출). ★삼밭·모시밭 복원(2026-07-13): hemp 0.06→0.08(전용재배)·ramie 0.05 신설.
    //   둘 다 addProduce의 satMul(자기 그림자가격) 게이트로 *수요응답* 산출(글럿이면 taper=여가) → 고정 부산물의 글럿 병리 없음(flow-EMA가 target 관리, 유령 0.19의 재발 아님).
    byproduct: { wheat: 0.25, rice: 0.20, barley: 0.15, hemp: 0.06, ramie: 0.05 },   // ★ramie는 byproduct 루프에서 수요-캡(짜는 만큼만) — rate는 충전속도만, 상한은 수요(아래 루프)
  },
  fisher: {
    field: 'fishing', output: 'fish', base: 1.2,
    landBoost: (v) => v.land.water, toolDependent: true, inputs: {},
    // Phase 5-5-econ-b: 어종 다양화 부산물 (salmon·shrimp·crab·oyster·seaweed)
    byproduct: { salmon: 0.15, shrimp: 0.10, crab: 0.08, oyster: 0.06, seaweed: 0.12 },
  },
  hunter: {                 // 사냥꾼 — meat + hide + 새 자원 부산물
    field: 'hunting', output: 'meat', base: 0.7,
    landBoost: (v) => v.land.game, toolDependent: true,
    inputs: {},
    // Phase 5-5-econ-b: specialty.js hunting 부산물 추가
    // ★유령 박멸(§9): 부산물 채집률을 실수요 스케일로 정렬 — 사냥꾼은 팔리지 않는 것을 등짐에 지고 오지 않는다.
    //   fur 0.15→0.05(모피짐승은 사냥감 일부 — 의류 소비 0.005/인 스케일) · bone 0.20→0.10(캐논 §9 후속: 20배 글럿 → 하향.
    //   활 투입 0.3/자루는 여전히 10배 여유) · feather 0.10→0.03(조류 비중 현실화 — 수요는 화살 깃뿐).
    byproduct: { hide: 0.4, fur: 0.05, leather: 0.10, bone: 0.10, feather: 0.03 },
  },
  lumberjack: {
    field: 'woodworking', output: 'wood', base: 0.9,
    landBoost: (v) => v.land.wood, toolDependent: true, inputs: {},
    // ★유령 박멸(§9): oak_log·pine_log 산출 중단 — 목재는 'wood' 단일 계상인데 통나무 SKU가 같은 나무를 이중 계상
    //   (0.35/일 유령 목재 — 소비처 전무, 시드3 재고 9,430). specialty 정의는 유지(타 존 특산·교역 유입 대상).
    //   resin(활 접착 투입)·bark(하급 연료)·acorn(구황식량)은 소비처 연결로 존치.
    byproduct: { resin: 0.08, bark: 0.10, acorn: 0.06 },
  },
  miner: {   // ★S1 광부=금속·특수석재 전담: 금속광맥(land.ore) + ★S5 특수 산지(흑요석·옥). 돌은 안 캠(→foraging).
    field: 'mining', output: 'ore', base: 1.5,
    landBoost: (v) => Math.max(v.land.ore || 0, v.land.obsidian || 0, v.land.jade || 0, v.land.tin || 0), toolDependent: true, inputs: {},   // ★청동 희소성: 주석 산지(land.tin)도 광부 매력(청동검 수출 특산)
    produceSpecial: 'miner',   // 산출(광석+금속·특수석재[흑요석·옥·주석])은 produceSpecial이 토지로 결정. 부산물도 거기서.
  },
  // ★S2 석공(mason) 신설 — 석기(간돌 도구) 전담 + 마제석검(석기 무기) + 활(목재/뼈). 새 스킬 masonry.
  //   기본 막석기는 누구나 급할 때 자급(낮은 노동, produceSpecial 폴백은 아님 — 농부 자급은 별도 안전망),
  //   정교 석기·마제석검은 석공(전문·고숙련=고품질). 재료: 돌(+활은 목재).
  mason: {
    field: 'masonry', output: 'tool', base: 0.4,
    landBoost: () => 1.0, toolDependent: false,
    inputs: {},   // 재료(돌)는 produceSpecial 핸들러가 직접 소비
    produceSpecial: 'mason',
  },
  // ★S2 대장장이(smith) = 청동·철 무기 *전용*(도구 제작에서 손 뗌 — 도구는 석공[석기]). 기존 weaponsmith 로직 통합.
  //   청동검(구리+주석) 우선 → 철검(희소). 돌칼·활은 석공(mason) 담당. 레벨↑=품질↑(무기 공격력·내구, S3).
  smith: {
    field: 'smithing', output: 'weapon', base: 0.45,
    landBoost: () => 1.0, toolDependent: false,
    inputs: {},   // 재료(구리·주석·철)는 produceSpecial 핸들러가 직접 소비
    produceSpecial: 'smith',
  },
  // ★S2 weaponsmith = 대장장이(smith)로 통합·폐지. 키는 참조안전 위해 유지(capacity·target 0 → 아무도 안 뽑힘).
  //   생산 핸들러는 남기되 도달 불가(capacity 0). 기존 재고·전환 로직 안전.
  weaponsmith: {
    field: 'smithing', output: 'weapon', base: 0.45,
    landBoost: () => 1.0, toolDependent: false,
    inputs: {},
    produceSpecial: 'weaponsmith',
  },
  armorsmith: {             // 갑옷 제작 (stone + hide + ore). v2: 산출 ↑
    field: 'smithing', output: 'armor', base: 0.35,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { stone: 0.5, hide: 0.4, ore: 0.2 },
    // ★유령 박멸(§9): 보조 투입 — 삼끈(갑옷 엮음)·모피(방한 안감, hide와 별개 슬롯). 있으면 소비, 없어도 제작 성립(게이트 아님).
    aux: { hemp: 0.1, fur: 0.1 },
    // ★[재민 지시 "직접 해결" 2026-08-01] 수요-캡 공급(모시 byproduct 규약 동형 — 사용자 결정 '짜는 만큼만 짠다').
    //   갑옷은 자본재(전사 1인 1벌)인데 범용 output 분기에 재고 게이트가 없어, 한번 고용된 갑옷장이가
    //   stone·hide·ore를 태우며 **무한 생산**했다(실측: 시드7 삼림 — 전사 2·갑옷 642 = 목표의 ~250배).
    //   주석(_tinGlut)·흑요석·옥·모시는 전부 감산이 있는데 이 분기만 없던 것.
    //   캡 = 교역 keep(max(2, 전사×1.3)) + 매물 문턱 여유(N×0.1) — tickTrade 매도 규약(위 WEAPONR thresh)과 같은 선.
    //   재고가 캡 아래로 내려가면(마모·수출) 생산이 재개된다 — 스톡-플로우 그대로, 수출 공급도 산다.
    stockCap: (v) => Math.max(2, (v.counts.warrior || 0) * 1.3) + (v.npcs.length || 1) * 0.1,
  },
  tailor: {                 // ★의복(2026-07-12): 재봉사 — 옷감(모피·유피·가죽·삼베)→옷. 한랭(겨울) 수요·1인 1벌 자본재.
    field: 'tailoring', output: 'clothes', base: 0.5,
    landBoost: () => 1.0, toolDependent: false, inputs: {},
    produceSpecial: 'tailor',   // 재료는 핸들러가 보온 가중·재고 비례로 직접 소비(대체 투입이라 inputs 고정맵 불가)
  },
  forager: {                // 채집 — 다중 산출
    field: 'foraging', output: null, base: 1.0,
    landBoost: (v) => Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3),
    toolDependent: false, inputs: {},
    produceSpecial: 'forager',
  },
  cook: {                   // 요리 — food + 부재료 → cooked_food. 다양성 보너스
    field: 'cooking', output: 'cooked_food', base: 1.5,
    landBoost: () => 1.0, toolDependent: false,
    produceSpecial: 'cook',
  },
  warrior: {                // 방어. 시뮬에선 야만인 이벤트 시 효과 (현재 미구현)
    field: 'combat', output: null, base: 0,
    landBoost: () => 1.0, toolDependent: false, inputs: {},
  },
  merchant: {               // 상업 — 마을 사이 교역량 ↑. 산출 없음 (서비스).
    field: 'commerce', output: null, base: 0,
    landBoost: () => 1.0, toolDependent: false, inputs: {},
  },
};

// ★[포위 봉쇄 훅] 야외 직업 집합 — 호스트(전쟁 레이어)가 v._siegeOutMul을 세우면 이들 생산만 감산(성 밖 노동 차단).
//   실내(mason·smith·weaponsmith·armorsmith·cook·warrior·merchant)=불변. 훅 미설치=경로 무변(마을실험실 궤적 보존 계약).
const SIEGE_OUTDOOR_JOBS = { farmer: 1, fisher: 1, hunter: 1, lumberjack: 1, miner: 1, forager: 1 };

// ★[포로 노동 훅] 호스트(전쟁 레이어)가 npc.captive={home,since}를 부착하면 그 NPC의 생산 기여만 ×0.6(저효율 강제노동).
//   전사·사냥꾼 배정 금지 게이트(autoSwitchJob)와 세트. 훅 미설치(captive 없음)=곱 1·게이트 항상 통과 → 경로 무변(마을실험실 궤적 보존 계약).
const CAPTIVE_WORK_MUL = 0.6;
const CAPTIVE_JOB_BAN = { warrior: 1, hunter: 1 };   // 포로에게 무기를 주는 직업 금지(무장 반란·탈출 방지 고증)

// 자원별 base value — 노동시간(생산 1단위에 드는 표준 일) 역수의 근사.
//   교역 가격의 anchor. 마을 부족도가 여기 곱해져서 실제 가격 형성.
// ★교역·가격이 공유하는 1인당 목표 재고표 — **한 곳에서만 정의한다.**
//   전에는 tickTrade 와 computeVillagePrices 가 같은 표를 각자 복사해 갖고 있었다.
//   한쪽에 금속을 추가하고 다른 쪽을 잊으면 "가격은 있는데 안 팔린다"가 된다.
const RESERVE_PC = {
  food: 30, fish: 10, meat: 8, cooked_food: 5,
  wood: 5, stone: 3, ore: 1, tool: 1.5,
  weapon: 0.5, armor: 0.5,
  fruit: 2, vegetable: 2, mushroom: 1, twig: 2, pebble: 1, hide: 1, herb: 0.5,   // ★약재(§9)
  bone: 1, tigerhide: 0.03,   // ★§9 3차 — 뼈 · 호피
  // ★★[재민 지시] 금속·특수재도 교역재. 자본재라 목표가 작다. 주석이 가장 작다(전략재).
  copper: 0.30, tin: 0.06, iron: 0.20, lead: 0.05, silver: 0.03, gold: 0.02,
  jade: 0.05, obsidian: 0.10,
};
const LUX_V1 = { gold: 1, silver: 1, jade: 1 };      // 위신재 — 웃돈 상한 대상
const LUX_V1_ADJ_MAX = 3.0;
const ESSENTIAL_V1 = { food: 1, fish: 1, meat: 1, cooked_food: 1, wood: 1, stone: 1, tool: 1, weapon: 1, armor: 1 };

const _SMELT_YIELD_UTIL = 0.33;   // = SMELT_YIELD(제련 수율). 파생수요 계산이 선언보다 위라 별도 상수.
const BASE_VALUE = {
  food:        1.0,    // 농부 1.5/day → 1단위에 0.67일
  fish:        1.25,   // 어부 1.2/day
  meat:        2.14,   // 사냥꾼 0.7/day
  cooked_food: 2.0,    // 요리 + 부재료. 영양 풍부.
  hide:        2.5,    // 사냥 부산물이지만 도구/방어구 재료
  herb:        4.0,    // ★약재(§9 2차): 희소·노동집약(채집 산출 15%·호골 12). 요양일수 단축 = 회수 노동일이 가격 근거
  bone:        1.5,    // ★뼈(§9 3차): 사냥 부산물(0.2/고기)+시각층 대물 도축(+1) — 풍부한 저가재. 가치는 무기장 보조 투입(활 티어)이 매김(수요 하드코딩 없음)
  tigerhide:   40,     // ★호피(§9 3차): 호랑이 도축 +1 — 최고가 위신재(교역 전용 외생 수요+위신 스탯). "호랑이는 고기가 아니라 명예와 돈"(§8)
  wood:        1.67,   // 벌목 0.9/day
  // ★★[재민 지시 "경제학적 원리에 입각해 한 치의 오차도 없이"] 노동가치 앵커 재정합.
  //   이 표는 원래 노동가치설로 매겨졌다(주석의 "농부 1.5/day" 등 = 1단위에 드는 노동일의 비).
  //   그런데 그 뒤로 **산출량이 바뀌었는데 가격을 안 고쳤다**. 실측한 어긋남:
  //     ore   3.00 ← 정합 1.00 (광부는 이제 0.5/day 가 아니라 1.5/day 캔다)
  //     stone 2.14 ← 정합 1.67 (돌은 광부가 아니라 채집꾼이 0.9/day 캔다)
  //     weapon 8.00 ← 정합 23.20 (무기 노동 3배 + 금속 원료가 반영이 안 돼 있었다)
  //   그 결과 사슬이 뒤집혀 있었다: 원석 그대로 3.0 → 제련 1.32 → 무기 0.94.
  //   **가공할수록 가치가 주는** 경제였다. 제련도 주조도 석기무기도 전부 부가가치가 음수였고,
  //   그런데도 마을이 그 일을 한 건 장인 정원이 가격이 아니라 스톡-플로우 목표로 굴러가서다.
  //   ⇒ scripts/test-valuechain.js 가 이 항등식을 매번 검사한다.
  stone:       1.67,   // 채집꾼 0.9/day
  ore:         1.0,    // 광부 1.5/day (원석은 제련 전이라 저가치 — 값은 제련이 만든다)
  tool:        5.0,    // 0.4/day + wood/stone 투입 (정합 4.82 — 유지)
  //   ⚠weapon 은 **안 올린다.** 노동가치 정합가는 14.7(MELT_TOTAL 0.15 기준)이지만,
  //     8 → 14 로 올려 실측했더니 v2 인구 −5.8% · 식량 −29% 로 나빠졌다(무기 교역 쏠림 —
  //     코드 주석에 남은 옛 실측 "무기 희소폭등 → 캐러밴이 식량 대신 무기 쏠림 → 인구 −36%" 와 같은 현상).
  //     원인: econ 의 직업 유틸리티는 **산출량 × 가격**이지 부가가치가 아니다(원료비를 안 뺀다).
  //     그래서 가격을 정합시켜도 노동 배분이 그걸 못 읽고, 교역 쏠림만 남는다.
  //     ⇒ 사슬이 **단조 증가**하기만 하면 "뭘 팔지"는 정확히 계산된다. 그 최소 조건만 만족시킨다:
  //       제련 양수  ⇔ P(ore) < SMELT_YIELD × P(금속) = 1.32   → ore 1.0 ✔
  //       주조 양수  ⇔ P(weapon) > P(금속) = 4 (MELT_TOTAL 0.15) → weapon 8 ✔
  //   ⇒ weapon 은 12 로. 정합가 14.0 의 0.86 배 안이고, 주조 부가가치를 채광과 같은 수준(1.2 vs 1.5)으로
  //     끌어올린다. 8 로 두면 주조가 채광의 40% 밖에 못 벌어 "만들수록 손해"에 가깝다.
  //     (8 → 14 로 크게 올린 판을 실측했더니 v2 인구 1,617 로 8 일 때의 1,624 와 거의 같았다 —
  //      무기값 자체는 인구에 큰 영향이 없다. 앞서 v2 가 나빠진 원인은 원석·돌값 하락이었다.)
  weapon:      12.0,
  armor:       12.0,
  fruit:       1.5,    // 채집물
  vegetable:   1.5,
  mushroom:    1.5,
  twig:        1.0,    // 흔함
  pebble:      1.0,
  // ★★[재민 지시] "모든 물품은 교역 대상으로 들어가야 해."
  //   v1 은 금속을 **가격조차 매기지 않았다** — BASE_VALUE 에도 RESERVE(교역재)에도 없었다.
  //   그래서 랩이 재던 "구리:주석 비"는 각 마을이 **자급한** 결과였지 교역 후 값이 아니었고,
  //   광부 유틸리티의 파생수요 계산도 금속 가격이 1.0 으로 폴백돼 죽어 있었다.
  //   값은 specialty.RESOURCES.baseValue 와 **같은 수**를 쓴다(두 곳이 다른 말을 하면 그게 버그다).
  //   ★철·납이 3 이던 것을 4 로. **제련 노동은 광종과 무관하게 같으므로** 노동가치로는 금속이
  //     서로 비슷해야 한다(시장 가치 차이는 희소도가 만든다). 3 이면 제련 한계가치가
  //     0.33×3 − 1.0 = −0.01 로 아슬아슬한 음수가 되어, 납 100% 마을(임업1)이 원석 112 를
  //     쌓아두고도 제련을 한 번도 안 했다(실측). oreValueScale(3)=oreValueScale(4)=1.0 이라 pk 는 불변.
  copper: 4, tin: 4, iron: 4, lead: 4, silver: 30, gold: 100,
  jade: 80, obsidian: 15, bronze: 12, gem: 60,
};
const JOB_NAMES = Object.keys(JOBS);
const FIELDS = [...new Set([...JOB_NAMES.map(j => JOBS[j].field), 'archery'])];   // ★archery=사냥꾼 제2숙련(활·직업 매핑 없는 무기 필드)

// forager 토지별 산출 가중치 — 어떤 채집물이 더 많이 나오나
// Phase 5-5-econ-b: specialty.js 새 자원 추가 (chestnut·walnut·honey·medicinal_herb·grape·wildflower)
function foragerYieldsFor(v) {
  // 평원/비옥지 → fruit/vegetable/grape/wildflower
  // 삼림 → mushroom/twig/chestnut/walnut/honey
  // 산악 → pebble/medicinal_herb
  const fert = v.land.fertility, wood = v.land.wood, stone = v.land.stone;
  return {
    // 옛 자원 (유지)
    fruit:     fert * 0.8 + 0.25,   // ★채집 믹스를 채소·과일로 재배치(잡동사니↓) — 다양성 식품 공급↑, 순식량은 거의 불변(안전)
    vegetable: fert * 0.7 + 0.25,
    mushroom:  wood * 0.4 + stone * 0.2 + 0.1,
    twig:      wood * 0.25 + 0.1,   // 잡동사니 감축(비식량)
    pebble:    stone * 0.25 + 0.05,
    // ★S1: stone은 정규화 믹스에서 제외 — 대신 채집꾼 stone 부산물(아래 forager 핸들러)로 *가산* 산출.
    //   (믹스에 넣으면 식량 산출을 잠식 — 돌밭 채집꾼이 식량을 못 가져와 부양력↓. hide(사냥 부산물) 패턴으로 분리.)

    // 새 자원 (specialty.js의 foraging) — 가중치 작게 (옛 자원 우선)
    chestnut:  wood * 0.18,           // 견과 — 숲
    walnut:    wood * 0.15,           // 견과 — 숲
    honey:     wood * 0.20,           // 꿀 — 숲 (벌집)
    herb:      fert * 0.25 + wood * 0.20 + stone * 0.15 + 0.15,  // ★약재(§9 2차, 구 medicinal_herb 승격): 산출의 ~15% — 임연부 CPUE·MSY(forageSustain) 상한에 자동 연동
    // ★유령 박멸(§9): wildflower 산출 중단 — 꺾은 꽃은 며칠에 시들어 저장·교역재가 못 됨(장식재 편입=가짜 수요).
    //   소비처 부재 → 산출을 끊는다(시드3 재고 5,246 동결 확인). 잔존 재고는 v2 부패(시듦)로 소진.
    grape:     fert * 0.15,           // 산포도 — 평원(구황식량 — FORAGE_FOOD_FACTOR 편입)
  };
}

// 채집물 → 식량 환산비. 농사보다 훨씬 비효율적이도록.
// 농부: base 1.5 × fert × (skill+1) × toolBoost → food 1
// forager: base 1.0 × landMean × (skill+1) → 위 5종 분배. 식량 환산은 그 중 fruit/veg/mushroom만 0.4
//          예) fertility 1.0, skill 0, toolBoost 1.0
//              farmer    → 1.5 food/day
//              forager   → 1.0 × 0.67 × 1 = 0.67 산출, food_equiv 약 0.16 (~11%)
const FORAGE_FOOD_FACTOR = { fruit: 0.4, vegetable: 0.4, mushroom: 0.3,
  // ★유령 박멸(§9): 식량형 축적재의 구황식량 편입 — 견과·해조·산과일이 먹히지도 K에 잡히지도 않고 수천 단위 축적되던 것을
  //   식량 환산(totalFoodEquivalent)과 소비(consumeFood 4단계 — 삽입 순서=소비 후순위: 주식 우선 보존)에 산입.
  //   계수 보수적(≤0.5): 견과=고칼로리 0.5, 도토리=침출 노동 감안 0.25, 해조=저열량 0.25, 산포도 0.3.
  chestnut: 0.5, walnut: 0.5, acorn: 0.25, seaweed: 0.25, grape: 0.3,
  // ★유령 식량 편입 2차(2026-07-12 감사): 어부 특산 해산물(연어·새우·게·굴)이 식탁·fd·부양력에 부재 —
  //   잡히고도 안 먹혀 수천 단위 썩던 유령(실측 시드7 @700d: 연어 2519·새우 2287·게 1433·굴 1330 = 식량등가 ~7,500).
  //   1차(견과·해조) 선례 그대로 편입 — 연안 마을이 제 어획을 실제로 먹는다(고증). 계수 보수적(생선 1.0 대비 손질·저열량).
  salmon: 0.7, shrimp: 0.35, crab: 0.35, oyster: 0.3 };

// 소비 (일일 1인당)
const DAILY_FOOD_CONSUMPTION = 1.0;
// ★도구 사용마모(storage.tool=석기에만 적용, line ~1047). 도구=석기 전용 전환으로 석기가 유일 자본재가 됨 →
//   종전 값(농부 0.04·기타 0.02)은 석기가 "희생 풀"(청동/철도구가 실 자본)이던 시절 калиб — 이제 이 마모를 대장장이가 다 메워야 하는데
//   throughput(0.4/일·인) 대비 과대(90인 마을 ~2.5/일 소모 → 대장장이 7~8명 필요, 저커버리지 poverty-trap→아사). 절반으로 하향 = 석기를 내구 자본재로 취급.
const DAILY_TOOL_WEAR_PER_FARMER = 0.02;  // 농부가 도구 마모(석기)
const DAILY_TOOL_WEAR_PER_OTHER = 0.01;

// ★flow-EMA 소비 계측(2026-07-12, CHECKLIST 154 부채 해소): 실소비를 v._consDay에 기록 → tickVillage 일 경계에서
//   v._consEMA(30일 관성)로 폴드 → v2 가격 target의 flowT(=EMA×30)가 됨. 유령 보유 하한(N×0.5) 제거의 보상 —
//   소비재 수요는 실측 흐름이 만든다(신규 재화는 소비처에 _cons 한 줄 = CAP_TARGET·시드·글럿가드·감산 4종 수동 통합 불요).
//   plain number만 기록(serializeEcon 계약). RNG 무접촉 — 결정론 보존.
function _cons(v, r, amt) { if (!(amt > 0)) return; const d = v._consDay || (v._consDay = {}); d[r] = (d[r] || 0) + amt; }

// 식량 소비 우선순위 — cooked_food > fish/meat > food > 채집물(fruit/veg/mushroom)
// 채집물은 환산비가 낮아 농사보다 끼니로 비효율
function consumeFood(v, need) {
  let remaining = need;
  // ★소비량 군별 기록(_foodEaten) — 이게 진짜 식단(자체생산+수입, 신선히 먹은 것 포함). 다양성 판정에 씀.
  const eaten = v._foodEaten || (v._foodEaten = {});
  for (const k in eaten) eaten[k] = 0;
  // 1) cooked_food (영양 풍부)
  if (v.storage.cooked_food > 0) {
    const eff = Math.min(remaining / 1.12, v.storage.cooked_food);
    v.storage.cooked_food -= eff; remaining -= eff * 1.12; eaten.cooked_food = eff;
  }
  // 2) fish/meat
  for (const r of ['fish', 'meat']) {
    if (remaining > 0 && v.storage[r] > 0) {
      const eff = Math.min(remaining, v.storage[r]);
      v.storage[r] -= eff; remaining -= eff; eaten[r] = eff;
    }
  }
  // 3) 농작물 food
  if (remaining > 0 && v.storage.food > 0) {
    const eff = Math.min(remaining, v.storage.food);
    v.storage.food -= eff; remaining -= eff; eaten.food = eff;
  }
  // 4) 채집물 (가장 비효율) — fruit/veg 0.4, mushroom 0.3
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    const f = FORAGE_FOOD_FACTOR[r];
    if (remaining > 0 && v.storage[r] > 0) {
      // 1 unit consumed → f units of food
      const unitsNeeded = remaining / f;
      const consumed = Math.min(unitsNeeded, v.storage[r]);
      v.storage[r] -= consumed;
      remaining -= consumed * f; eaten[r] = consumed;
    }
  }
  // ★flow-EMA 제외(설계 판단·A/B 실측): 식단은 *가용성 기반 대체 소비*(cooked>어육>곡>채집 사다리 — 있는 걸 먹음)라
  //   flowT에 폴드하면 우연히 먹은 믹스가 30일 보유 수요로 고착 → 빈곤 마을이 제 채집물·생선 잉여를 못 팔게 됨(수출 억압).
  //   실측: 식단 폴드 포함 시 s101 245→27 붕괴(2026-07-12). 식량 수요는 기존 기구(subs×30·VARIETY·surplusEMA)가 전담.
  return remaining;
}

// 총 식량 환산 (K 계산용)
function totalFoodEquivalent(v) {
  let total = v.storage.food + v.storage.fish + v.storage.meat + v.storage.cooked_food * 1.12;
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    total += (v.storage[r] || 0) * FORAGE_FOOD_FACTOR[r];
  }
  return total;
}
function totalFoodProductionEquivalent(prod) {
  let total = (prod.food || 0) + (prod.fish || 0) + (prod.meat || 0) + (prod.cooked_food || 0) * 1.12;
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    total += (prod[r] || 0) * FORAGE_FOOD_FACTOR[r];
  }
  return total;
}

// 인구 동역학
const POP_GROWTH_RATE = 0.04;             // r — 일일. ★초반 폭발성장(빈 땅 정착): N≪K일 때 ~4%/일(배가 ~18일)
const POP_MAX_DELTA_PCT = 0.06;           // 일일 변화 상한 (초반 빠른 성장 허용)
const LOGISTIC_THETA = 4;                 // ★θ-로지스틱: dP=r·N·(1−(N/K)^θ). θ>1이라 K의 ~80%까지 빠르다가 급감(사용자 요청 곡선)
// ★K_MAX_VILLAGE(110 하드 천장) 폐지 — 인구 상한은 아래 세 자연 메커니즘의 min에서 창발:
//   ① slotK: 토지 기반 식량직 자리(유효토지 S_eff — 리카도 한계지 반영)
//   ② prodK: 식량 흐름(잠재생산+수입EMA)  ③ fuelK: 연료 흐름(리비히 — 온돌·취사 장작, 고증)
//   그리고 영토확장이 MB/MC 투자결정이라 S_eff가 유한 s*에서 멈춤 → K도 마을별로 자연 수렴.
const LAND_Q_BETA = 0.105;                // ★리카도 한계지 감쇠(실측): sim/_measure_land_margin.js — 5시드×3마을, growTerritory와
                                          //   동일 획득규칙(중심 가까운 순)으로 영토 성장시키며 한계 셀 비옥도 측정 → q(s)≈(s/s0)^-0.105.
                                          //   지형 감쇠는 완만(7배 확장에도 0.74) — 수렴 자체는 MB/MC 확장 게이트가 만든다.
const EXPAND_PAYBACK_DAYS = 365;          // ★확장 투자 회수기간(할인율 역수) — 개간 투자는 ~1년 내 회수돼야 실행(보즈럽: 개간=노동투자).
                                          //   임의 천장이 아니라 경제 표준 상수(이자율): 낮추면 s*↓, 높이면 s*↑ — 균형 '수준'은 지형·비옥도가 결정.
const EXPAND_PRICE_FOODEQ = { wood: 1.67, stone: 2.14 };   // 투자판단용 정적 환산(food=1) — v2 BASE 상대가와 일치
// ★위신재(사치) → 인구 소폭 보너스. prestige는 need 아닌 순보너스(없어도 페널티X, 있으면 생활수준↑→매력↑).
//   사치 수입을 정당화(진짜 수요 근거). cap+작은 계수로 과성장 방지(주거게이트가 추가 안전장치).
const PRESTIGE_GROWTH_W = 0.2;            // prestige 1당 성장보너스 계수
const PRESTIGE_MOD_CAP = 0.25;           // 보너스 상한(happyMod ~0.8 대비 작게 — 사치는 부차)
// ★식량 다양성 — 여러 식품군(곡물·생선·고기·과일·채소·채집)을 먹으면 행복·건강↑(단조 식단=낮음).
//   특화 마을은 자기 생산만으론 1~2군 → 교역으로 채워야 → "다양성 위한" 식량 수요 창발. 건강→작업량이라 수요가 자기이익.
const DIVERSITY_HAPPY_W = 0.4;           // 다양성(식품군) 만점 시 행복 보너스
const DIVERSITY_HEALTH_W = 0.5;          // 다양성 만점 시 건강 보너스(건강이 낮아 더 큰 지렛대)
const DIVERSITY_FULL = 4;                // 이 군수면 만점(6군 중 4군 = 균형식)
// ★여가→행복(§노동) — 포만 여유노동(_idleFrac)이 곧 쉼: "일찍 끝내고 쉬는" 마을이 더 행복.
//   idle은 식량 불안(secF=0)이면 자동 0(포만 OFF)이라 별도 게이트 불요. 교역 결합은 창발로 충족:
//   수입→재고 커버리지↑→포만↑→여가↑→행복↑ (명시적 수입 프리미엄은 희소 그림자가격과 이중계상이라 뺌).
//   캐러밴 인력도 같은 idle에서 나옴(상인=쉬는 손) — 마을당 소수라 행복 항에서 차감 안 함.
const LEISURE_HAPPY_W = 0.25;            // idle 100%(이론상)일 때 +0.25. 실측 성숙촌 idle 0~56% → +0~0.14
// ★약재(§9 2차) — 건강 스탯의 세 번째 공급원(식량다양성·연료 다음). "마을이 건강을 올리려 할 수 있는 일".
//   공급: 채집 산출 ~15%(임연부 CPUE) + 호골(시각층 호랑이 도축=12). 수요: 요양 단축(랩, 일 0.5/요양자·회복×1.6) + 일상 복용(여기).
//   수요 하드코딩 없음(캐논 §9): 이 항이 인구·생산성으로 되먹임 → 그림자가격이 채집·호랑이 사냥 노동에 값을 매김.
const HERB_HEALTH_W = 0.5;               // health += min(CAP, herbPC×W). herbPC(재고/인구) 0.3에서 상한 도달
const HERB_HEALTH_CAP = 0.15;            // 상한(기준 건강 0.17~0.23 → 최대 ~0.38 — 중립 0.5 초과 폭주 방지)
const HERB_DAILY_PC = 0.01;              // 일상 복용 소모(인구 비례 흐름) — 재고가 있어야 유지되는 흐름
// ★활 티어(§9 3차) — "데미지는 장비(제작 품질) 몫 — 레벨 데미지 없음"(§6 스킬 캐논): 사냥꾼이 bone(활대 심·힘줄 백킹, 각궁 계보)을
//   보조 투입해 만든 활이 장비 스톡을 서서히 대체(느린 상승)·마모로 희석(완만 감쇠) → v._bowQ(1.0~1.3+)가 시각층 사냥 화살 데미지 배수.
//   수요 하드코딩 없음(캐논 §9): 활 품질↑=사냥 효율↑(발수 보존 검산 — 사슴2·멧돼지3 유지, 호랑이만 7→6발) — bone 한계가치는 이 투입 경로에서 자연 발생.
//   ★수정3 흑요석 화살촉 — obsidian(예리)도 활/화살 품질 보조 투입. bone(활대 심)과 합산된 투입률이 _bowQ를 견인 → 흑요석 산지 마을은 "예리한 화살촉"으로 사냥 데미지 이점(별도 arrow 아이템 없음: 화살은 활에 흡수·마모 추상).
const BOW_BONE_PER_WEAPON = 0.3;         // 무기 1단위 제작당 bone 보조 투입(있으면 소비)
const BOW_OBSIDIAN_PER_WEAPON = 0.15;    // ★수정3: 활 1자루당 흑요석(화살촉) 보조 투입 — bone의 절반 스케일(화살촉은 소량 예리 석편). 있으면 소비, _bowQ에 기여.
const BOW_OBSIDIAN_Q_W = 0.5;            // ★수정3: 흑요석 투입률의 품질 가중(예리 보너스) — bone 충족(1.0)에 흑요석 충족(≤1.0)×0.5 추가 → 흑요석+bone 완비 산지는 투입률 최대 1.5.
const BOW_R_MAX = 1.4;                    // ★수정3: 활 품질 투입률 상한(bone 1.0 + 흑요석 보너스). _bowQ 최대 ≈ 1+0.25×1.4 = 1.35(예리 화살촉 상한, 종전 bone전용 1.25 대비 산지 이점).
const BOW_Q_SPAN = 0.25;                 // _bowQ = 1 + 투입률EMA×SPAN. bone만 만렙 1.0→1.25, +흑요석 산지는 투입률>1 가능 → 1.25 상회(예리 화살촉 이점)
const BOW_Q_UP = 0.02;                   // 상승 EMA(제작일) — 새 활이 스톡을 대체하는 속도(지속 투입 ~100일에 87%)
const BOW_Q_DOWN = 0.005;                // 하락 EMA(뼈 없는 제작일) — 상질 활의 마모·희석은 더 느림
const BOW_Q_IDLE = 0.001;                // 무기장 휴업일 감쇠 — 스톡 자체의 노후(반감 ~700일)
// ★S3 레벨=품질(해금 아님): 석공·대장장이 숙련↑ → 만드는 *종류는 동일*, 결과물 *품질*(도구효율·무기 공격력·내구)만 ↑.
//   품질 = 재료등급 × 스킬함수. 장인 스킬(masonry/smithing)의 마을 최고치를 EMA로 추종(_toolQ/_weapQ) — 새 티어 부여 아님.
//   ★칼리브 보존: 석기 도구 boost는 종전 고정 1.4× 기준. 품질을 그 *중심*에 걸어(막석기 1.25×, 명장석기 1.55×) 평균 ~1.4 유지 → 부양력 불변.
const TOOL_Q_BASE = 1.25;                // 막석기(저숙련 석공/자급) 생산 boost — 종전 1.4보다 낮음(품질 하한)
const TOOL_Q_SPAN = 0.30;               // 숙련 만렙 석공 석기 = TOOL_Q_BASE + SPAN = 1.55× (품질 상한). skill 5(중숙련)≈1.40(종전값)
const TOOL_Q_EMA = 0.06;                // 도구 품질 EMA(제작일) — 새 고품질 도구가 스톡을 대체(제작량 가중이라 명장이 빠르게 스톡 질 견인)
const TOOL_Q_IDLE = 0.001;             // 석공 휴업일 품질 감쇠(재고 노후 — 느림)
// ★무기 품질(_weapQ) — 재료등급(청동 1.0 > 철 0.85 > 마제석검 0.5) × 스킬(0~1). 무기 defense 기여 배수(위세·방어).
const WEAP_Q_BRONZE = 1.0;              // 청동검 재료등급(주력·최고 위세)
const WEAP_Q_IRON = 0.85;              // 철검 재료등급(청동기엔 제련 미숙 — 청동보다 낮게)
const WEAP_Q_STONE = 0.5;              // 마제석검 재료등급(자급 저티어)
const WEAP_Q_SKILL_SPAN = 0.6;         // 스킬 기여 폭: q = 재료등급 × (1 − SPAN + SPAN×skill/10) → 명장이 최대 1.0배 발현
const WEAP_Q_EMA = 0.06;               // 무기 품질 EMA(제작일) — 제작량 가중이라 명장 대장장이가 빠르게 스톡 질 견인
const WEAP_Q_IDLE = 0.001;             // 무기장 휴업일 품질 감쇠(재고 노후 — 느림)
const WEAP_DEFENSE_SPAN = 0.6;         // 무기 defense 기여 = base × (1 + SPAN×(_weapQ−0.5)) — 고품질 무기가 방어·위세↑
// ★S3 무기 제작 노동 = 도구보다 훨씬 큼(스펙 7) — 무기 1자루가 도구보다 3배 노동. 산출을 1/3로(제작 시간 3배).
//   효과: 무기는 전문 장인의 느린 작업 = 희소 유지. 농부는 무기 자급 안 함(자급은 막석기 도구만, 아래 자급 안전망).
const WEAPON_LABOR_MULT = 1 / 3;       // 무기 산출 배수(도구 대비) — 제작 노동 3배
// ★S3 막석기 자급 안전망 — 도구가 치명적으로 부족(커버리지<0.5)한데 석공이 없거나 못 따라가면,
//   도구의존 노동자(농부 등)가 급할 때 막석기를 *스스로* 소량 자급(낮은 노동). 정교 석기·석검은 석공 전담.
const SELF_TOOL_RATE = 0.02;           // 1인당 일일 막석기 자급 산출(석공 0.4/일의 5% — "급할 때 손수 깬 돌")
const SELF_TOOL_COV = 0.5;             // 이 커버리지 미만일 때만 발동(치명 부족 — 생산붕괴 방지 하한)
const SELF_TOOL_Q = 1.1;               // 막석기 품질(막 깬 돌 — 석공 막석기 1.25보다도 낮음)
// ★활 사냥꾼 자가제작 안전망 — 활은 사냥꾼 본인 장비(활대 목재 + 뼈·힘줄·깃·수지). 석공(석기)이 아니라 사냥꾼이 archery 숙련으로 손수 제작.
//   막석기 자급과 동형: 활 재고(=사냥꾼용 무기)가 부족하면 사냥꾼이 저노동으로 자급. 청동/철 활은 없음(활은 저티어 자급 무기), 대장장이 청동검은 전사·잉여 무장에 별도 기여.
//   품질(_bowQ)은 bone/obsidian 투입률(EMA)로 결정 — 아래 EMA 블록. 산출률은 사냥꾼 수 비례(석공 개입 없음).
const SELF_BOW_RATE = 0.04;            // 사냥꾼 1인 일일 활 자급 산출(활은 도구보다 손 많이 가지만 본인 장비라 우선순위↑ — 막석기 0.02의 2배). 무기 노동 3배는 산출률에 이미 반영된 저율.
const SELF_BOW_COV = 1.2;              // 활 커버리지(활 재고/사냥꾼) 이 값 미만이면 자급 발동(1인 1활 + 여유). 넘으면 포만(여가).
const SELF_BOW_WOOD = 0.6;             // 활 1자루당 목재(활대) — 기존 석공 활 레시피 동일
const BOW_Q_STONE = WEAP_Q_STONE;      // 활 무기품질 기여 등급(석재등급과 동일 저티어 — _weapQ EMA 재료등급 입력용)
// ★청동 희소성 복원(청동기 고증) — 주석(tin)은 *소수 산지 마을*만 산출. 나머지 마을은 tin=0 → 청동 불가 → 석기 무장.
//   근본 원인 교정: 종전엔 tin이 *모든* ore 광맥의 부산물(0.11/ore)이라 전 마을이 청동 자급 → 청동 보편재(근접무기 99% 청동, 석검 0). 실게임 맵(specialty.js/zone.js)은 tin 광맥을 이미 희귀(4.9%)하게 뒀으나 경제 시뮬만 이 고증을 잃었음.
//   설계: (1) tin을 ore 부산물에서 제거 (2) 마을 생성 시 *결정론적*(name 해시)으로 TIN_DEPOSIT_RATE 비율만 land.tin>0 산지 지정
//         (3) 산지 마을만 광부가 tin 채굴 → 청동검 수출 (4) 무산지 마을은 석공이 마제석검·석창 공급(주력) (5) 청동검=위세품(엘리트 표지).
// ★주석 산지 선정 — *광맥 부존(ore) 주도* + 이름 해시 지터. 주석(cassiterite)은 금속 광맥에서 나므로 ore 풍부 마을(광산촌)이 산지.
//   score = ore × (0.5 + hash) ≥ 문턱이면 산지. ore↑면 확실, 평균 ore는 미달 → 소수 광산촌만 산지(고증 + 소규모 월드서 산지 0 방지).
//   순수 이름 해시는 특정 8개 이름이 전부 미달/초과할 수 있어 취약 → ore 주도로 견고화. ore는 두 하네스(CLI 랜덤·랩 지형실측) 모두 제공 → 이식성.
const TIN_DEPOSIT_ORE_SCORE = 1.28;    // 산지 문턱(score=ore×(0.8+0.4×hash)) — ore~1.5 광산촌(1.2~1.5) 대부분 산지, ore≤1.0은 대체로 미달. 광산촌 위주 소수만 산지 ⇒ ~10-20%(청동 편중). 청동/명 주 레버(랩 마을3=ore1.5 산지 보장 하한).
// ★주석 산출 = 마을 규모·광부 수 무관 *정량*(광량=land.tin이 결정). 광부 1명만 있으면 정량 채굴 → 대형/소형 산지 간 편차 제거(청동/명 시드 변동의 근본 차단).
//   종전 per-miner×YIELD는 대형 산지(광부 24명)가 소형(3명)의 8배 tin을 캐 청동/명이 0.03~0.45로 요동쳤음. 정량화로 수렴.
const TIN_DEPOSIT_YIELD_FLAT = 0.46;   // 산지 일일 tin 산출(× land.tin). 부존 ~1.0 마을이 ~0.46/일 → 자체 청동 병기고 + 소량 수출. 청동 총량의 주 레버.
const TIN_DEPOSIT_STRENGTH_LO = 0.6;   // 산지 부존 하한(land.tin ∈ [LO, LO+SPAN]) — 광부 매력 스케일(obsidian/jade 부존과 동형)
const TIN_DEPOSIT_STRENGTH_SPAN = 0.8; // 산지 부존 폭
// ★청동 경제 자격(_bronzeCapable) — 청동검을 *지속* 생산할 수 있는 마을만 청동 무장. 그 외(트레이스 주석뿐)는 석기 무장(마제석검).
//   자격 = 주석 산지(land.tin>0) OR 대량 주석 비축(N×PC 이상 — 진짜 교역 허브만. 흘러든 소량으론 자격 미달 → 석기 유지).
//   근거: 주석 희소로 무산지 마을은 간헐 소량 수입뿐 → 청동 상비 불가. 이 게이트가 "청동은 산지·교역 마을 편중"을 강제(무산지=석기).
const BRONZE_TIN_MIN_PC = 0.95;        // 교역 허브 자격 문턱(1인당 주석 재고) — 이 이상 *지속* 비축해야 청동 상비. 주석 희소로 소수 교역 허브만 도달(간헐 수입은 미달 → 석기 유지). ※candidate F(2026-07-13) 1.2 시도: 청동 volume −28%(184→132)이나 concentration 불변(5/5)+#8 리스크라 기각. 진짜 concentration 레버=TIN_EXPORT_KEEP_PC↑(산지 비축↑→무산지 tin 기근). 현 상태 #8/#16 통과라 리팩터 불요.
const BRONZE_TIN_MIN_ABS = 13;         // 절대 하한(소형 마을 보호 — N 작아도 최소 이만큼은 있어야 청동 상비)
// ★철검 희소화(청동기 고증: "철이 청동보다 귀함") — 철도 트레이스 축적(부산물 0.03/ore)만으론 무기화 불가.
//   철검은 철이 *풍부한* 마을만(제련 노하우·광량). 그 외는 석공 마제석검. 이게 없으면 무산지 마을이 축적 철로 철검을 만들어 석기가 사라짐(측정: 철검 35%).
const IRON_WEAPON_MIN_PC = 1.5;        // 철검 자격 문턱(1인당 철 재고) — 청동보다 높게(철=최희소). 이 이상이라야 철검 상비.
const IRON_WEAPON_MIN_ABS = 20;        // 절대 하한(소형 마을 보호)
// ★근접무기(검·창) vs 활 분리 — weapon 풀은 전사 근접무기와 사냥꾼 활을 *공유*. 재고 자체는 못 쪼개도(교역 혼합), *생산 결정*은 분리해야 정확:
//   전사 무장 판정=근접검 재고, 사냥꾼 활 자급 판정=활 재고. 안 나누면 (a) 활이 pool을 채워 전사가 돌검 못 받고(석검 0) (b) 검이 채우면 사냥꾼이 활 못 만듦.
//   해법: 생산 가중 EMA로 pool의 *근접검 비중*(_swordFrac) 추정 → swordStock≈weapon×frac, bowStock≈weapon×(1−frac). 교역·부패는 양쪽 비례라 비중 근사 유지.
const SWORD_FRAC_EMA = 0.04;           // 근접검 비중 EMA 속도(제작 가중) — _weapQ EMA(0.06)보다 완만(비중은 더 관성)
const SWORD_FRAC_INIT = 0.5;           // 초기 비중(시드 무기 = 검·활 반반 가정)
const MELEE_COV_BUFFER = 1.2;          // 전사 1인 근접검 최소 커버리지(하한 — 전사 무장 게이트).
// ★근접검 병기고(armory) 목표 — 마을이 유지하는 근접검 재고(1인당). 전사 수 자체는 적으나(≈5%) 마을은 유사시 대비·교역용으로 병기고를 유지(고증: 무기고).
//   청동 자격 마을은 이 병기고를 *청동검*으로, 무산지 마을은 *마제석검*으로 채움 → 청동/석기 병종 격차가 재고에 발현. 목표 0.2/명(청동)은 청동마을 병기고×청동인구비중으로 달성.
//   ★이게 "청동무기 0.77/명" 베이스라인(병기고 규모)의 규모를 유지하되 재료를 석기 다수로 뒤집는 핵심 — 병기고를 없애면 청동 0.2/명 목표 자체가 성립 불가(전사 실수요는 0.06/명뿐).
const MELEE_ARMORY_PC = 0.72;          // 근접검 병기고 목표(1인당). 석기마을은 전량 마제석검, 청동마을은 아래 FRAC까지만 청동+나머지 석기. (≥0.72 필수: 무기 재고=교역 호위·전사 무장 공급원 — 취약 교역의존 시드[19]는 이 미만서 호위 부족→교역붕괴→아사. 측정으로 확정된 생존 하한.)
const MELEE_ARMORY_HYST = 0.85;        // 이력(재제작 재개 문턱) — 재고가 목표×이 값 미만이면 보충(잦은 on/off 방지)
const MELEE_ARMORY_SECF = 0.45;        // 병기고(비긴급 비축) 축적 최소 식량안보(secF) — 이 이상 *잘 먹는* 마을만 병기고 확충. 취약·기근 마을은 식량·도구 우선(인구 유지 — 낮추면 취약 시드[19·8] 붕괴). 긴급 전사무장은 secF 무관.
// ★청동 병기고 비중 상한 — *청동 자격 마을에서도* 병기고의 이 비율까지만 청동, 나머지는 석기(마제석검). 청동 = 마을 내 소수 엘리트 무장.
//   효과: (1) "대다수 전사는 석기"를 마을 단위로 강제(청동마을도 석기 다수) (2) tin 풍부 시드서 청동 폭주 억제(재고 변동↓) (3) 청동/명 목표를 청동마을 수 변동에 덜 민감하게.
//   청동/명 ≈ (청동마을 인구비중) × MELEE_ARMORY_PC × 이 값. 튜닝 주 레버 중 하나.
const BRONZE_ARMORY_FRAC = 0.45;       // 청동 자격 마을 병기고 중 청동 최대 비중(나머지 ≥55%는 석기). 청동마을도 석기 다수 — 청동 위세 엘리트 표지, 석기 다수 보장. (병기고 총량 MELEE_ARMORY_PC와 독립 — 생존 무관, 청동:석기 비율만 결정. 청동/명 미세조정 레버.)
const DECAY_MELEE_MAINT = 0.0004;      // 병기고 유지보수 계수(노동목표 마모항) — 무기 부패(DECAY_V2.weapon 0.0002)의 ~2배(사용마모 포함). 병기고 규모 유지에 필요한 지속 노동.
// ★청동 위세품화 — 청동검은 방어뿐 아니라 *위세*(엘리트 표지). 종전에도 _weapQ>0.7 위세 기여가 있었으나(약함) 청동 희소화로
//   청동검 보유 마을=소수 엘리트가 되도록 위세 가중을 명시 상수화(주석 희소 반영: 청동검은 귀한 위세재).
const WEAP_BRONZE_PRESTIGE_W = 0.5;    // 청동검(_weapQ>0.7 고품질) 위세 기여 계수 — 종전 하드코딩 0.3 → 0.5(주석 희소 프리미엄)
const WEAP_BRONZE_PRESTIGE_TH = 0.7;   // 위세 발동 품질 문턱(막석검·철검은 미달 — 청동검 전용 엘리트 표지)
// ★S4 명장 견습(세대 전승) — 새 인구가 직업 배정될 때 시작 숙련 = 마을 내 그 직업 *최고 숙련자(명장)* × 상속률.
//   명장 없으면 0(독학). 전 직업 적용. 개별 부모 추적 불가(인구=식 기반)라 마을 최댓값 기준.
//   효과: 특화 마을은 숙련이 세대로 승계돼 비교우위 지속(경로의존) — 명장 있는 마을이 계속 명장을 배출.
const MASTER_INHERIT_RATE = 0.45;      // 상속률(0.4~0.5) — 견습이 명장 숙련의 45%에서 시작
// ★호피 위신재(§9 3차) — 위신 스탯 기여: prestige += min(CAP, 호피PC×W). 마을 내 소비 없음(교역 전용 외생 수요는 v2 ORNAMENTAL+수출규칙).
const TIGERHIDE_PRESTIGE_W = 4;          // 호피 0.025/인(120명 마을 3장)에서 상한 도달 — 희소재 소량으로 위신 성립
const TIGERHIDE_PRESTIGE_CAP = 0.1;      // 상한(PRESTIGE_MOD_CAP 0.25 스케일 대비 소폭 — 위신재 한 종의 왜곡 방지)
// ★건강 → 작업량(생산성) — 건강한 마을이 더 생산적(상한 있어 폭주 X). happiness는 인구만(유지).
const HEALTH_PROD_W = 0.15;              // (health−0.5)×W → ±0.075(상한 클램프 ±0.1). 완만 — 과채광 억제
// ★죽은 커플링 연결: production stat(자재·도구·금속 비축)이 이제 실제 생산성을 올림 — 잘 갖춰진 작업장이 더 생산적(고증: 도구·설비 = 생산력).
const PROD_STAT_W = 0.03;                // production stat × W → 생산성 보너스
const PROD_STAT_CAP = 0.15;              // 상한 +15%(스노볼 방지 — 최후의 보루 클램프)
// ★공간 농지(논/밭) → 부양력: 논(벼)이 밭보다 고수확 → 유효비옥도 = 기본 × (1 + PADDY_PREMIUM×(개간논비중 − PADDY_BASE)).
//   논은 물가에 제한(강가 마을이 더 부유 = 고증) + 밭→논 전환이 경제적 이득. v._paddyShare(공간 브리지) 없으면 중립(standalone econ 무영향).
const PADDY_PREMIUM = 0.4;                // 논 고수확 프리미엄 계수(물대기 노동 감안한 순이득)
const PADDY_BASE = 0.43;                 // 중립 논비중(지정 평균 ~43%) — 순식량 평형 유지(총식량 변화 시 광산·인구 흔들림). 강가=이득/내륙=손해
const FOOD_GROUP = { food: 'grain', fish: 'fish', meat: 'meat', fruit: 'fruit', vegetable: 'veg', mushroom: 'forage' };
// ★곡물 과잉버퍼 직접 감산 대상 — 곡류·조리식. 식량가는 효용↑라 글럿에도 가격이 안 떨어져 raw-taper가 안 걸림 →
//   버퍼 일수 기준으로 직접 캡(잉여 farming을 여가·교역로). K는 잠재생산 기준이라 불변 → 인구 안정, 낭비만↓. (어·육·채는 다양성이라 제외)
const FOOD_GLUT_SAT = { food: 1, cooked_food: 1, wheat: 1, rice: 1, barley: 1 };
// ★무용재 — 실수요(use-value)가 ~0이라 수출해도 식량 못 삼. 식량안보와 무관하게 *항상* 생산 포만(성장기 누적까지 차단).
//   광석(ore): 갑옷에 미량뿐. 장식재(금·은·보석): 화폐화 전엔 수요 0. 돌·금속(구리·주석)은 수요 있어 제외(가치재 수출).
const SAT_ALWAYS = { ore: 1, gold: 1, silver: 1, gem: 1, pearl: 1, amber: 1, jade: 1, ivory: 1 };
// ★e2 도구(석기) 글럿 임계 — 대장장이 산출·원료소비를 커버리지(도구재고/도구의존인구)로 taper.
//   커버리지 ≤ X면 풀생산, X~(X+RAMP) 구간서 선형 감산, ≥(X+RAMP)면 0(정지). 재고는 X 부근 수렴(완전수렴 1로 안 감).
//   도구는 석기(간돌) 단일 자본재 → X는 석기 재고 버퍼(포화선 1.0의 약 2.5배). RAMP=1.0(부드러운 감산, 진동 방지).
//   ★e2는 "총 도구(석기) 과잉 시 산출 자체 감산"만 담당. 종전 청동↔석기 재료전환(BRONZE_TOOL_SKIP_X)은 청동 도구 폐지로 제거.
const TOOL_GLUT_X = 2.5;
const TOOL_GLUT_RAMP = 1.0;
const POP_MIN = 0;                         // ★인구 하한 0 — 자급 불가 마을은 0명까지 줄어 소멸(척박지엔 마을이 안 남음). 365일 정착 보호 후.
const POP_MAX = 1000;                      // 마을당 인구 상한 (N² 폭발 방지)

// 세금 + 영토
const TAX_RATE = 0.03;                    // 일일 산출의 3% (사용자 의도: default 3% + 길드마스터 조정)
const BASE_EXPAND_COST = { food: 80, wood: 40, stone: 25 };   // 슬롯(size 1.0 = 25셀) 명목 비용 — 실지불은 셀 단위(÷25)
const EXPAND_COST_EXP = 1.3;              // (size/baseSize)^1.3 — 점진 증가(소수 size에서 연속 평가)
const EXPAND_CHECK_INTERVAL = 1;          // ★셀 단위 확장(사용자 승인 2026-07-12): 주 1회 슬롯 일괄 → 매일 셀 구매 검사
const EXPAND_CELLS_PER_SLOT = 25;         // land.size 1.0 = 25셀 — 맵층 목표(size×25)와 단일 진실. 셀당 비용 = 슬롯 공식/25
const EXPAND_CELLS_PER_DAY = 4;           // 일일 최대 구매 셀 — 맵 크립 6시간/1셀=4셀/일과 정합(≈구 25셀/주 페이스)
// ★주거(집): 인구 성장은 집 수용력에 막힘. 집은 목재(필수)·석재(있으면)로 짓고 노후화.
//   집 부족하면 성장만 멈춤(감소 아님). picker가 "집 지을 목재 부족 → 나무꾼" 안전망으로 고리 닫음.
const HOUSE_WOOD = 1.5;        // 수용력 1인당 목재(한옥=목조)
const HOUSE_STONE = 2.5;       // 수용력 1인당 석재(주춧돌·구들·담장). 준-필수(없으면 건축 30%) → 강한 석재 수요 → 광산 교역·광부 매력↑
const HOUSE_DECAY = 0.0015;    // 일일 노후화(완만 — 나무꾼 1명이면 유지 가능)
const HOUSE_BUFFER = 1.15;     // 인구보다 약간 여유 있게(성장 여지)
const HOUSE_BUILD_MAX = 0.06;  // 하루 최대 증축률(인구 대비)
const HOUSE_START = 20;        // 정착 초기 집(부트스트랩 — 이 크기까진 자라 나무꾼 산업 형성)
// ★땅맞춤 초기 부존 배수 — 기본 1(채택값). LANDFIT=0 이면 2026-08-02 채택 **이전 동작**을 정확히 재현한다.
//   (계수를 임의로 흔들라는 손잡이가 아니라 A/B 재현용이다 — PEACE_W 선례. createVillage 참조.)
const LANDFIT_K = (typeof process !== 'undefined' && process.env && process.env.LANDFIT != null)
  ? Number(process.env.LANDFIT) : 1;
// ★부얼타운 전용 부존 배수(2026-08-02b) — 식량 부양력이 낮은 땅에 정착하는 무리의 식량·교역 밑천.
//   ★★기본 0 = **기각**. 3시드 800일 실측이 부얼타운을 기각했다(보고_회부5건_배치.md §②):
//     식량을 지고 오고 농사 탈출구까지 열어 줘도 광산6 은 3/3 시드에서 소멸했고, 세계 전체가
//     인구 1,630 → 1,230 · 소멸 2.67 → 4.67 로 나빠졌다. 코드와 손잡이는 남긴다 —
//     지도(주요 광맥에 철)나 교역이 달라지면 다시 재 볼 값이 있다. BOOMFIT=1 로 켠다.
const BOOMFIT_K = (typeof process !== 'undefined' && process.env && process.env.BOOMFIT != null)
  ? Number(process.env.BOOMFIT) : 0;
// ★부얼타운 픽커 게이트 — 광맥이 실한 **광산촌만** "농사 불가" 탈출구를 쓴다.
//   ★★기본 OFF = 기각(위 BOOMFIT_K 주석). BOOMGATE=1 로 켠다.
const BOOMGATE_ON = (typeof process !== 'undefined' && process.env && process.env.BOOMGATE === '1');
// ═══════ ★★[2026-08-02c 소멸 0 튜닝] 좀비·소멸 3중 잠금 손잡이 — 각각 개별 A/B 용 ═══════
//   실측(3시드 800일 · dz_*.json)이 인계 프롬프트의 진단("도구 0 → 잉여 0 → tickRecovery 게이트 미달")을
//   **반증했다.** 좀비 마을은 굶지 않는다 — 어촌9(시드42)는 곳간 128 · 국고 현금 15,186 · 캐러밴 61회 ·
//   식량수입 504 인데 인구 2 다. 실제 인과는 궤적(history)에서 나왔다:
//     ① 0~360일: `day<365` 기아사망 보호막이 dP<0 을 삼켜 마을이 K 위로 과성장(임업3 54명 · 광산2 67명 고원).
//     ② 365일: 보호막 해제 → dP=r·N·(1−(N/K)^4) 이 −maxDelta 로 폭주 → 40일 만에 54→5.
//     ③ **prodK 가 실현흐름 기준**이라 인구가 줄면 K도 같이 줄어(양의 되먹임) 붕괴가 바닥까지 폭주한다.
//     ④ 바닥(N=1)에서 ratio=N/max(1,K)=1 → 로지스틱 항이 정확히 0 → 영구 고착. K<1 인데 slot 121~203 ·
//        fuel 42~2450 이다. 즉 **땅은 멀쩡한데 K 정의가 마을을 죽인다.**
//   ⇒ 세 손잡이는 ③(PRODK_CAP)·도구 부트스트랩(TOOLBOOT)·바닥 탈출(SWITCH2)을 각각 끊는다.
//
// ★PRODK_CAP — prodK 를 **용량 기준**으로. fuelK 가 이미 이 판단을 내렸다(line ~2203 주석:
//   "실현 흐름 기준은 벌목 인력 스냅샷에 K가 요동 → θ-로지스틱 과격 반응 → K붕괴 나선. 시드42 라 소멸로 확인, 폐기").
//   prodK 만 마지막까지 실현흐름 기준으로 남아 리비히 min 안에서 홀로 N 을 따라다녔다. 같은 처방을 식량에도 준다.
//   ★★단독으로는 **해롭다**(2026-08-02c 단독 A/B): 소멸 1.33 → **3.67**(악화) · 인구 1,610 → 1,454 · 도구 −29%.
//     이유는 명확하다 — K 를 올려 놓고 **도구·석재 공급은 그대로**라 마을이 못 먹일 인구까지 자라 굶어 죽는다
//     (좀비 8.33 → 1.0 은 개선이 아니라 **좀비가 시체가 된 것**이다).
//   ★★그런데 STONE_NET 과 **함께면 채택**이다(같은 3시드):
//       STONE_NET 단독   인구 3,128 · 소멸 0 · 좀비 0.67
//       STONE_NET+PRODK  인구 3,466 · 소멸 0 · **좀비 0**   ← 채택
//     순서가 전부였다: 재료(석재→도구) 사슬을 먼저 고쳐야 부양력 상향이 굶주림이 아니라 성장이 된다.
//     PRODK_CAP=0 으로 채택 이전 동작을 정확히 재현한다.
const PRODK_CAP_ON = !(typeof process !== 'undefined' && process.env && process.env.PRODK_CAP === '0');
// ★TOOLBOOT — 도구 자본 우선(석공) 안전망의 `N>=6` 문턱 해제. 인구 6 미만 마을은 맨손(×0.25)에서
//   영원히 못 벗어난다 — 석공을 뽑을 자격 자체가 없다. 문턱을 1로 낮춘다(재료 게이트는 그대로).
//   ★★기본 OFF = **실측 무효**(2026-08-02c 단독 A/B): 3시드 전부 **기준선과 비트 동일**(1868/1711/1252, 소멸 1/1/2).
//     이유 — 이 안전망은 `재고 돌 ≥ 0.2` 를 요구하는데, N<6 으로 쪼그라든 마을은 **돌도 0** 이라 어차피 안 걸린다.
//     문턱이 아니라 재료가 binding 이었다. 진짜 처방은 STONE_NET(재료를 가져온다) 쪽이다.
const TOOLBOOT_ON = (typeof process !== 'undefined' && process.env && process.env.TOOLBOOT === '1');
// ★SWITCH2 — autoSwitchJob 의 `npcs.length < 3` 조기반환 해제(2명까지 정상 픽커 경로 허용).
//   인구 2 마을은 **직업 전환이 통째로 꺼져 있다** — 어촌9는 800일 내내 어부 2명 고정이었다.
//   ★★기본 OFF = **실측 무효**(2026-08-02c 단독 A/B): 인구 1,610 → 1,625(잡음) · 소멸 1.33 → 1.33 · 좀비 8.33 → 8.33.
//     STONE_NET 과 함께 켜도(c_sts2) 좀비 0.67 → 1.33 으로 **되레 약간 나빠졌다.** 2명 마을에 전환을 열어 줘도
//     바꿀 곳(석공)에 재료가 없으면 소용없고, 식량직 한 명을 빼는 손실만 남는다.
const SWITCH2_ON = (typeof process !== 'undefined' && process.env && process.env.SWITCH2 === '1');
// ★STONE_NET — 석재 결손이면 채집꾼을 석공보다 **먼저**(그리고 기근보다도 먼저) 부른다
//   + 경계 `>0.25` → `>=0.25`(livelihood.js FLOOR.stone 이 정확히 0.25).
//   궤적 실측: 임업3(d270)·광산2(d330)·어촌9(d210) 전부 **석재 고갈 → 석공 산출 0 → 도구 0 → 붕괴** 순서였다.
//   ★★기본 ON = **채택**(2026-08-02c). 3시드 800일 단독 A/B:
//     소멸 1.33 → **0.00** (3/3 시드 전부 0) · 좀비(<10명) 8.33 → **0.67** · 인구 1,610 → 3,128 · 도구 2,603 → 4,758.
//     STONE_NET=0 으로 채택 이전 동작을 정확히 재현한다(LANDFIT 선례).
const STONE_NET_ON = !(typeof process !== 'undefined' && process.env && process.env.STONE_NET === '0');
// ═══ ★★부얼타운(광산촌) 판정 — **단일 정의**. 시딩(villages.js)도 이 함수를 부른다(사본 금지) ═══
//   ⚠1차 시도의 실패에서 배운 것: "식량 부양력이 하한 미달"만으로 잡으면 **너무 많이 잡힌다.**
//     선별된 마을 20곳 중 절반 가까이가 부양력 1.3~2.0 구간이라, 거기에 식량을 얹고 농사 탈출구를
//     열어 줬더니 인구 1,630 → 1,126 · 소멸 2.7 → 4.7 로 무너졌다(실측 3시드).
//     ⇒ 부얼타운은 "식량이 좀 부족한 마을"이 아니라 **식량으로는 도저히 못 사는데 광맥이 아주 실한**
//       자리다. 두 조건을 **모두** 요구한다.
const BOOM_FOOD_MAX = 1.2;   // 부양력이 이 아래여야(하한 2.0 의 60%) — "농사로는 답이 없다"
const BOOM_VEIN_MIN = 1.0;   // 광맥 점수가 이 위여야 — 실측 분포의 자연 절단선(다음이 0.238)
const BOOM_VEIN_W = { copper: 1.0, tin: 1.0, iron: 0.6, gold: 0.5, silver: 0.5, lead: 0.4, jade_raw: 0.3, obsidian: 0.3 };
function veinScore(land) {
  if (!land) return 0;
  const mix = land.oreMix || {};
  let w = 0; for (const k in mix) w += (mix[k] || 0) * (BOOM_VEIN_W[k] != null ? BOOM_VEIN_W[k] : 0.3);
  return (land.ore || 0) * w + (land.tin || 0) * 0.5;
}
const foodCapOf = (land) => land ? (land.fertility || 0) * 1.5 + (land.water || 0) * 1.2 + (land.game || 0) * 0.7 : 0;
function isBoomtown(land) { return foodCapOf(land) < BOOM_FOOD_MAX && veinScore(land) >= BOOM_VEIN_MIN; }
// ★땔감(연료): 집은 목재를 거의 안 먹지만(재고), 요리·난방은 인구에 비례하는 *매일의 흐름*. 이게 숲→인구 상한의 진짜 고리.
//   큰 마을일수록 매일 대량 소비 → 고갈된 숲(벌목꾼 슬롯·산출↓)은 못 댐 → fuelCov↓ → 건강↓ → 인구·생산성↓(비례=자기교정).
//   숲 안 베는 작은 마을은 수요 작아 무영향. 역사적으로 마을 크기를 실제 제한한 건 건축목재가 아니라 땔감(연료 고갈).
const FIREWOOD_PC = 0.085;     // 1인당 일일 땔감(요리·난방). 인구비례 흐름 수요 → 숲 규모가 부양 인구 상한(리비히: 식량 vs 연료)
const STRAW_FUEL_PER_FOOD = 0.018;   // ★볏짚·왕겨 연료(고증): 평야 농촌은 아궁이에 짚을 땠다. 도출: 1인 연간 곡물 ~260kg→짚 ~300kg→목재 열량환산 ~210kg
                                     //   vs 연간 연료수요 ~1.2t → 짚이 수요의 ~17% → food 1단위 생산당 0.085×0.2≈0.018 wood-eq. 저장 없이 당일 소진(flow).
                                     //   효과: 농업촌 연료난 완화(수출작 짚도 남음)·광산촌은 여전히 목재 수입 의존 → 마을 유형별 연료 전략 분화(자연).
const SMELT_FUEL_PER = 0.5;    // ★야금공(대장장이·무기장이·갑옷장이) 1인당 제련 연료. 청동 제련은 고온·대량 연료 → 야금촌이 숲을 더 압박(고증)
const LOW_FUEL_EQ = 0.3;       // ★유령 박멸(§9): 잔가지·나무껍질 = 하급 연료(wood 0.3 등가). 취사·난방에서 장작보다 먼저 소진(검불 먼저 때는 게 상식) → 목재 실절약(손실 절약형 소비). 제련(고온)은 straw와 동일하게 불가 단순화.
const PEBBLE_STONE_EQ = 0.5;   // ★유령 박멸(§9): 자갈 = 건축 석재 하급 대체(0.5 등가, 기초·구들 채움 한정 ≤절반) — 석재 실절약. 주춧돌·벽체는 여전히 석재(광산 수요 기둥 보존).
const FUEL_HEALTH_W = 0.4;     // 땔감 부족 시 건강 페널티 가중(fuelCov=0 → 건강 -0.4). 비례라 절벽 아님·자기교정
// ★의복(2026-07-12 — 겨울·재봉): 옷=1인 1벌 자본재(착용 마모 소모). 옷감 보온 가중(고증: 모피>유피·가죽>삼베≳모시).
//   과잉생산 수사(가죽 ×15~22 부패 평형)의 자연 소비처 — 수요 하드코딩 아님: 마모 흐름+한랭 페널티가 수요를 만들고
//   가격(재고 함수)이 옷감 수입 유인을 창발. ★모시(ramie) 편입(2026-07-13) — flow-EMA 첫 수혜: CLOTH_MATS 추가 한 줄로 재봉 _cons가 수요 자동 등록(수동 4종[CAP_TARGET·시드·글럿가드·감산] 불요).
//   wool은 목축 보류 캐논(청동기 보조적)·flax/cotton은 고증 제외(위 farmer:156, 서구/조선 도입)라 한국 전통 bast 섬유 모시로 확장.
const CLOTH_MATS = { fur: 1.5, hide: 1.0, leather: 1.0, hemp: 0.6, ramie: 0.55 };   // 보온-eq/단위(모시=고급이나 서늘한 여름지 — 보온은 삼베 이하. 품질[고운 마감] 차등은 _clothQ[의복 3]에서)
const RAMIE_BOOT_PC = 0.1;   // ★모시 수요-캡 부트스트랩 floor(/인) — 소비EMA가 0인 초기에 재봉이 쓸 최소 재고만 확보(잉여 아님). 이후 수요(flowT=소비EMA×30)가 상한을 견인
const RAMIE_MIN_POP = 40;    // ★모시 성숙 게이트 — 고급 직물은 정착 완료·잉여 공동체가 짠다(개척기 프론티어는 식량 사활). 개척 취약 궤적(콜로니 250~450f) 무교란 = 505 knife-edge 보호(고증: 잉여사회 고급 직물). ※60 시도는 202 chaos로 오히려 −(571→527) 기각
// ★가죽 제품(2026-07-13 — 감사 v2 hide 글럿 *진짜* sink·사용자 "제대로 고증 살려서"): 잉여 hide → 무두질 → 가죽제품(신·주머니·깔개·끈).
//   핵심: hide↔leather는 동warmth CLOTH_MAT(1.0)라 hide→leather 전환은 form 변환(순소비 불변, 글럿 미해소). *진짜* sink는 의류·갑옷 *밖의* ADDITIVE 소비 = 가죽제품 실사용(고증: 청동기 가죽은 옷·갑옷 외 신발·용기·침구·끈 다용).
//   ★가죽제품 = *마을 필드*(v._leatherGoods, 비교역 comfort) — 신규 교역재 아님 → 모시·무두질을 무너뜨린 knife-edge 수입 드레인 원천 부재. 잉여-구동(hide>floor)+comfort 보너스(없어도 페널티 0)+성숙 게이트.
const LEATHER_GOODS_TARGET = 0.8;   // 1인 가죽제품 목표 스톡(신발·주머니·깔개·끈 — 생활 필수품 커버리지)
const LEATHER_GOODS_WEAR = 0.005;   // 1인 일 마모 — ~160일 수명(신발 닳음·깔개 교체). 이 흐름이 hide 실드레인의 지속률(글럿 평형을 끌어내림)
const LG_HEALTH_W = 0.035;          // 가죽제품 comfort 건강 보너스(coverage 1 시) — 발 보호·보온 깔개(고증). ※0.06+0.06은 s7 +71% 인구폭(건강·행복 둘다 성장 견인)이라 완화 — comfort는 소폭이어야(#15 maxVil·@1500 폭 주의)
const LG_HAPPY_W = 0.025;           // 가죽제품 comfort 행복 보너스(건강 우선 — 물리적 편의)
const TAN_HIDE_MIN = 3.0;           // 무두질 하한 hide(/인) — 이 아래는 안 태움(505 'hide-저축 맵' 수출자본·갑옷재[armorsmith hide 0.4] 보존, 명백한 잉여만 제품화). 글럿(~4/N)을 이 선까지 sink
const TAN_DAILY_PC = 0.06;          // 1인 일 무두질 처리량 — 고증 뇌유 무두질=고노동
const TAN_YIELD = 0.85;             // 무두질 수율 — 생가죽→가죽제품 무게 손실(다듬기·재단)
const TAN_TRADE_PC = 0.06;          // ★무두질 저축(2026-07-13): 가죽제품 충족 후 잔여 잉여 hide→leather(저장·교역형 저축) 전환 상한(/인/일) — hide 수요-캡(candidate N)의 고증 정밀형 대체(사냥꾼은 가죽을 챙긴다·재산은 무두질 가죽으로·초과 생가죽은 부패)
// ★의복 품질 _clothQ(2026-07-13 — 인계 설계 방향[CHECKLIST]: _weapQ 동형 마을 EMA·방한 우선·방어 비권장): 재봉 숙련×재료 믹스 등급 → 생산분 품질 → EMA.
//   효과 = 방한(coldStress 완화 *추가* 보너스 — 기존 relief 불변이라 비회귀·잘 지은 옷일수록 겨울 따뜻). 내구(마모÷품질)는 hide 역상호작용 재캘리브 세트라 별건(미구현). 모시(0.9)=고급 직물 = item1 품질 payoff.
const CLOTH_Q_MAT = { fur: 1.0, ramie: 0.9, leather: 0.85, hide: 0.65, hemp: 0.6 };   // 재료 등급(품질·고증: 모피>모시>유피>생가죽>삼베)
const CLOTH_Q_SKILL_SPAN = 0.6;    // 재봉 숙련 기여 폭(WEAP_Q 동형): q = 재료등급 × (1−SPAN+SPAN×skill/10) → 명장 재봉사 최대 1.0 발현
const CLOTH_Q_EMA = 0.06;          // 의복 품질 EMA(제작일 가중) — 명장이 스톡 질 견인
const CLOTH_Q_BASE = 0.6;          // 기본 품질(재봉 없음·거친 옷)
const CLOTH_Q_HEALTH_W = 0.08;     // 고품질 방한 건강 보너스(coldStress·coverage·품질 비례 — 겨울 전용 계절 보너스라 always-on 아님)
const CLOTH_Q_HAPPY_W = 0.08;      // 고품질 방한 행복 보너스(따뜻하고 고운 겨울옷)
// ★요리 품질 _cookQ(2026-07-13 — candidate G, 사용자 "요리도 마찬가지"): 마을 최고 cook 숙련 → 조리식 질 EMA(_weapQ 동형).
//   ★NPC econ 효과 없음(econ-중립 훅) — 플레이어 요리 인스턴스(candidate E §6·생활층_인계훅)가 이 마을 _cookQ를 샘플해 버프 품질/뿌듯함 수치를 결정한다.
//   NPC 조리식 건강/행복 보너스는 A/B로 기각(스위트 −22%: 0.04 소폭 보너스도 knife-edge 궤적을 chaos 증폭 — _clothQ/가죽제품은 계절/moderate라 통과했으나 조리식은 상시라 과교란). 요리의 '뿌듯함'은 플레이어층 몫, NPC 경제엔 다양성·건강이 이미 충분.
const CLOTH_MAT_WARMTH_PER = 3.0;   // 옷 1벌 재료(보온-eq) — 가죽 ~3장 상당. (5.0/마모.006 강화 A/B는 s8 붕괴[pop439→38]로 기각 — 한계 맵에 과중. 가죽 잔여 글럿의 다음 레버는 사냥 부산물율)
const CLOTH_WEAR_PC = 0.004;        // 1인 일 마모(온화 ~250일 수명, 한랭 ×3 → ~80일)
const CLOTH_TARGET_PC = 1.2;        // 목표 보유(1인 1벌 + 여벌 0.2) — v2 CAP_TARGET·CAPITAL keep과 동기
const COLD_HEALTH_W = 0.35;         // 한랭 무의복 건강 페널티(연료 0.4 동형·비례 — 옷 없인 떨지만 불이 더 치명)
const COLD_CLOTHED_HAPPY_W = 0.15;  // 한랭기 의복 충족 행복(따뜻한 겨울)
const FUEL_COLD_W = 0.6;            // 한랭 난방 연료 가중(겨울 취사+난방 ≈ ×1.6) — 계절 연료 수요의 실물화
const STONE_MAINT_PC = 0.02;        // ★돌 감산 자연화(2026-07-12): 건축 유지 석재 실소비/인/일(담장·구들·바닥·숫돌 — FIREWOOD_PC 동형 물리 수요)
// ★제례·부장 봉헌율(/인/일, 식량여유 ×_secF 비례·수출 유보 초과분만) — 위세재 반복 실수요(매납·부장 고증).
//   봉헌검(weapon)은 제외: A/B로 병기고 드레인이 s8 붕괴 유발 — 무기 수요는 전쟁층(호전 성격)과 세트로 후속.
const RITE_PC = { jade: 0.0012, gold: 0.0006, silver: 0.0008, gem: 0.0004, amber: 0.0004, obsidian: 0.0008 };   // ★봉헌 v2 원 요율 유지(candidate B ×1.5 원복 2026-07-13): ×1.5는 @1500서 #14 실패(ore 91>90 — 위세재 소비↑→산지 채광↑→ore 후반 글럿). orn +15% 이득이 불변식 파손 값 아님. 소폭(×1.2) 재시도는 @1500 재확인 세트(후속 후보)
const RITE_KEEP_PC = 0.15;          // 수출 자본 유보(1인당) — 이 아래로는 안 태움(빈곤·산지 마을 교역 자본 불가침)
// ★호전 마을 성격 + 봉헌검(2026-07-13 — 마을 문화 다양성·고증: 취락별 상무 기질 편차 + 청동기 의례적 동검 매납/부장):
//   해시 결정론으로 일부 마을이 호전적 → 위협 시 더 강한 동원(warriorTarget ×) + 잉여 청동검 매납(봉헌 v2가 무기 드레인[s8 붕괴]으로 미룬 것 — 호전 성격의 무기 잉여 생산이 offset·세트).
const WARLIKE_THRESH = 0.72;        // 해시 > 이 값이면 호전 마을(~28%)
const WARLIKE_WT_MULT = 1.6;        // 호전 마을 위협 동원 배수(warriorTarget — 평시 무비, 위협 시만 강화라 안전)
const WEAPON_RITE_PC = 0.0008;      // 호전 마을 봉헌검 요율(/인/일, 식량여유·잉여 비례) — 위세재 봉헌 동형
const WEAPON_RITE_KEEP = 3;         // 봉헌검 유보 — 전사 수 + 이 버퍼 초과 *잉여*만 매납(병기고 불가침 = 무장해제 방지)
function _warlikeMult(v) { return _hashStr('warlike|' + (v.name || '')) > WARLIKE_THRESH ? WARLIKE_WT_MULT : 1.0; }

// 식량 부패 — 무한 비축 방지. 음식 종류별로 다름.
const DECAY_RATES = {
  food: 0.003,        // 농작물 0.3%/일 (~연 67% 보존)
  fish: 0.005,        // 신선 어류 0.5%/일
  meat: 0.005,
  cooked_food: 0.004, // 요리 0.4%/일
  fruit: 0.008,       // 과일 0.8%
  vegetable: 0.006,
  mushroom: 0.004,
};

// 봉쇄 중 인구 페널티 — 매일 인구의 0.2% 자연 사망 (적 침입/약탈자/병사)
const BLOCKADE_CASUALTY = 0.002;

// 지리 — 마을 좌표 평면 + 정보 비대칭
const MAP_SIZE = 1000;                    // 1000 × 1000 평면
const INFO_RANGE = 400;                   // 시세 정보 도달 거리
const TRADE_INTERVAL = 3;                 // 매 3일 거래 사이클 (매주 → 더 자주)
// 약탈 — 거리 비례. base 3% + 거리 100당 +4% (최대 50%)
const RAID_BASE = 0.03;
const RAID_PER_100 = 0.04;
const RAID_MAX = 0.5;
// 행상 이동 — 거리/속도 일수
const CARAVAN_SPEED = 50;   // 일일 이동 거리 (50 단위/day)
// warrior 호위 — 약탈 확률 감소. sqrt(escort) × 0.08만큼 차감.
const ESCORT_PER_CARGO = 20;  // 화물 20당 호위 1명 요청

// ★교역 거리 BFS화(2026-07): 호스트(랩·본체)가 지형 전쌍 최단거리 행렬(_distMatrix)을 주입하면 그걸 우선 조회.
//   유클리드는 강 건너 마을을 가깝다고 착각 → 운송비·약탈 확률·이동일(전부 거리 비례)이 왜곡되는 것을 교정.
//   econ은 지형을 모름(계약) — 행렬 계산은 호스트 소관(랩=getTradePath A*, 본체=isBlocked 코스 그리드 BFS),
//   단위는 호스트가 econ 좌표 스케일(셀×2.5)로 환산해 옴 → 유클리드 폴백과 단위 일치.
//   Infinity = 연결 불가 쌍(섬 — BFS 도달 불능): infoRange·top-K 상한 필터에서 자연 제외됨.
//   행렬 없으면(스탠드얼론·CLI·회귀 하네스 장기런) 기존 유클리드 폴백 — 회귀 무영향.
function villageDist(a, b) {
  const w = a._world || b._world;
  const M = w && w._distMatrix;
  if (M && a._distIdx != null && b._distIdx != null) {
    const row = M[a._distIdx];
    if (row) { const d = row[b._distIdx]; if (d != null) return d; }
  }
  return Math.hypot(a.coord.x - b.coord.x, a.coord.y - b.coord.y);
}
// 호스트가 계산한 전쌍 거리 행렬 주입 — matrix[i][j] = 주입 시점 world.villages[i]↔[j] 최단거리(econ 스케일, 불능=Infinity).
//   여기서 마을에 _distIdx 스탬프(마을이 소멸해 배열이 줄어도 인덱스 불변 → 행렬 조회 계속 유효) +
//   최대 유한거리 _distMatrixMax(v2 top-K '절대 상한'의 기준 — 존 최원격 쌍≈대각선 상당) 계산 + top-K 캐시 무효화.
function setDistMatrix(world, matrix) {
  world._distMatrix = matrix;
  let mx = 0;
  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] || [];
    for (let j = 0; j < row.length; j++) { const d = row[j]; if (d != null && isFinite(d) && d > mx) mx = d; }
  }
  world._distMatrixMax = mx;
  for (let i = 0; i < world.villages.length; i++) {
    world.villages[i]._distIdx = i;
    world.villages[i]._near20 = null;   // 거리 기준이 바뀌었으므로 top-K 캐시 재구축 유도
  }
  return mx;
}

// 직업별 자리 — 토지 size × 자원성 × 비율
//   farmer:     fertility × 0.6
//   fisher:     water     × 0.4
//   hunter:     game      × 0.5
//   lumberjack: wood      × 0.3
//   miner:      stone     × 0.3
//   prospector: ore       × 0.25
//   forager:    (제한 약함)  × 0.5
//   smith/cook/warrior: 인구 비례 (마을 안에서 자체 결정)
const UNCAPPED = 1e9;   // 사실상 무제한 — 직업 수는 시장(한계가치/그림자가격)이 결정
// ★리카도 한계지: 영토는 좋은 땅부터 먹으므로 한계 땅 품질 q(s)=(s/s0)^-β (실측 β, 위 참조).
//   랩(공간)이 실측값을 주면(v.land.liveLand) 지형이 진실 — 합성 감쇠는 스탠드얼론 전용.
function marginalLandQ(v) {
  if (v.land.marginalQ != null) return v.land.marginalQ;   // 공간 프론티어 실측(있으면 우선)
  const s0 = v.land.baseSize || 1;
  return Math.pow(Math.max(1, v.land.size / s0), -LAND_Q_BETA);
}
// 유효토지 S_eff = ∫ q du (best-first 누적) — 자리(jobCapacity)는 명목 size가 아니라 이걸로.
function effectiveLandSize(v) {
  if (v.land.liveLand) return v.land.size;   // 랩: land.fertility가 실측 평균이라 희석 이미 반영 → 이중적용 금지
  const s0 = v.land.baseSize || 1, s = v.land.size;
  if (s <= s0) return s;
  if (v._effSizeCache && v._effSizeCache.s === s) return v._effSizeCache.val;
  const b = LAND_Q_BETA;
  const val = s0 + (s0 / (1 - b)) * (Math.pow(s / s0, 1 - b) - 1);
  v._effSizeCache = { s, val };
  return val;
}
function jobCapacity(v) {
  const s = effectiveLandSize(v);
  // ★비옥도 이중산입 분리: 농부 '자리'=경작지 *면적*(arable, 공간 실측·폴백 min(1,fert)) — 지력(fertility)은 1인 산출에만.
  //   (옛 s×fert×0.4는 fert가 자리와 산출에 제곱으로 들어가 극비옥지 인구 폭증[250~400]의 뿌리.
  //    숲·사냥·어장은 밀도=면적이라 이중산입이 의미 있음 — 유지. 광맥도 크기∝노동력 — 유지.)
  const arable = v.land.arable != null ? v.land.arable : Math.min(1, v.land.fertility);
  const c = {
    farmer:     Math.floor(s * arable * 0.4),
    fisher:     Math.floor(s * v.land.water     * 0.25),
    hunter:     Math.floor(s * v.land.game      * 0.30),
    lumberjack: Math.floor(s * v.land.wood      * 0.30),
    miner:      Math.floor(s * Math.max(v.land.ore || 0, v.land.obsidian || 0, v.land.jade || 0, v.land.tin || 0) * 0.30),   // ★S1 광부=금속 전담: 광맥(ore) ★S5 +특수산지(흑요석·옥) ★청동 희소성 +주석산지
    forager:    Math.floor(s * 0.30),
    // ★인구비율 정원(하드캡) 전부 폐지 — 직업 수는 한계가치 vs 그림자가격으로 *자연 수렴*.
    //   대장장이: 도구 쌓이면 도구가격↓→한계가치↓→안 뽑힘 + 글럿 시 차출(opportunityCost=시장가치).
    //   무기/갑옷장: 무기·갑옷 가격 + 약탈위협 + 가죽 가용이 결정. 전사: 무기 보유 게이트 + sqrt 체감.
    //   (옛 캡 smith0.10·weapon/armor0.06·cook0.10·warrior0.08 → 인위적 분포 강제라 제거)
    mason:       UNCAPPED,   // ★S2 석공(석기·석검·활) — 스톡-플로우 노동목표(masonTarget)가 결정
    smith:       UNCAPPED,   // ★S2 대장장이(청동·철 무기) — smithTarget(무기수요)이 결정
    weaponsmith: 0,          // ★S2 폐지(smith로 통합) — 아무도 안 뽑힘(참조안전 키만 유지)
    armorsmith:  UNCAPPED,
    tailor:      UNCAPPED,   // ★의복 — 스톡-플로우 노동목표(tailorTarget)가 결정
    cook:        UNCAPPED,
    warrior:     UNCAPPED,
    merchant:    0,  // ★전담 행상 폐지 — 교역은 기본 NPC가 남는 시간에 왕복(tickTradeV2). 정원 0이라 아무도 행상으로 안 뽑힘.
  };
  return c;
}

// 식량 자리 합 — K 계산용. forager는 식량 환산비가 낮아 절반 카운트
function totalFoodSlots(v) {
  const c = jobCapacity(v);
  return c.farmer + c.fisher + c.hunter + Math.floor(c.forager * 0.5);
}

// 영토 확장 비용 — (size/baseSize)^1.3 superlinear
function expandCost(v) {
  const baseSize = v.land.baseSize || 1;
  const ratio = v.land.size / baseSize;
  const mult = Math.pow(ratio, EXPAND_COST_EXP);
  return {
    food:  BASE_EXPAND_COST.food  * mult,
    wood:  BASE_EXPAND_COST.wood  * mult,
    stone: BASE_EXPAND_COST.stone * mult,
  };
}

// 길드 금고로 영토 확장 시도 — ★셀 단위(사용자 승인 2026-07-12): 하루 최대 EXPAND_CELLS_PER_DAY셀 구매 루프.
//   셀당 비용 = 슬롯 공식/25(현재 소수 size에서 ^1.3 연속 평가 — 주 80 뭉텅 지불이 일 ~3.2×n 스며듦으로).
//   land.size는 소수 누적(+1/25). MB/MC는 셀마다 재평가(비율 비교라 단위 무관) — 금고 부족 or MB<MC면 그날 중단
//   → 정지점이 25셀 양자화 없이 소수 크기 s*에서 잡힘. v.expansions는 이제 '구매 셀 수'(구: 슬롯 횟수).
function tryExpandTerritory(v, day) {
  // 인구가 K(식량 자리)의 85% 이상 차야 확장 시도. 그 전엔 길드 자본만 축적.
  const N = v.npcs.length;
  const slotK = totalFoodSlots(v);
  if (N / Math.max(1, slotK) < 0.85) return;
  for (let ci = 0; ci < EXPAND_CELLS_PER_DAY; ci++) {
    const cost = expandCost(v);   // 슬롯(size +1) 명목 비용 — 셀 지불은 아래서 ÷25
    // ★MB/MC 투자 게이트(K_MAX 천장 대체) — 확장은 '금고 차면 무조건'이 아니라 수지 맞을 때만.
    //   MB = 한계 size 1단위의 일일 식량-eq 잠재산출(q×식량직 자리×자리당 산출) × 회수기간.
    //   MC = 확장비용(food+wood+stone, 정적 상대가로 food-eq 환산, ^1.3 상승곡선).
    //   q(s) 하강 × 비용 ^1.3 상승 → 유한 s*에서 자연 정지. s*는 fert·water·game 따라 마을마다 다름(자연 차등).
    //   슬롯 단위 값으로 발행(회귀 #19 lt.stalled = mb<mc가 봄) — 셀 단위로 나눠도 비율 동일이라 판정 불변.
    const L = v.land, q = marginalLandQ(v);
    const _arable = L.arable != null ? L.arable : Math.min(1, L.fertility);
    const mbDaily = q * (0.4 * _arable * (1.5 * L.fertility)          // 농부: 자리=경작지 면적 × 1인 산출=지력(이중산입 분리)
                       + 0.25 * (L.water || 0) * (1.2 * (L.water || 0))
                       + 0.30 * (L.game || 0) * (0.7 * (L.game || 0))
                       + 0.30 * 0.5 * 0.8);                            // 채집(식량가중 0.5, ~0.8/일)
    const mcFoodEq = cost.food + cost.wood * EXPAND_PRICE_FOODEQ.wood + cost.stone * EXPAND_PRICE_FOODEQ.stone;
    v._expandMBMC = { mb: Math.round(mbDaily * EXPAND_PAYBACK_DAYS), mc: Math.round(mcFoodEq) };   // 진단용(슬롯 단위 유지)
    if (mbDaily * EXPAND_PAYBACK_DAYS < mcFoodEq) return;   // 한계지가 투자가치 없음 → 확장 정지(하드캡 아님: 지형·가격이 결정)
    const cellFood  = cost.food  / EXPAND_CELLS_PER_SLOT;
    const cellWood  = cost.wood  / EXPAND_CELLS_PER_SLOT;
    const cellStone = cost.stone / EXPAND_CELLS_PER_SLOT;
    if (v.treasury.food < cellFood || v.treasury.wood < cellWood || v.treasury.stone < cellStone) return;   // 금고 부족 — 그날 중단
    v.treasury.food  -= cellFood;
    v.treasury.wood  -= cellWood;
    v.treasury.stone -= cellStone;
    v.land.size += 1 / EXPAND_CELLS_PER_SLOT;   // 소수 누적(셀 1개 = +0.04)
    v.expansions += 1;                          // ★셀 단위 카운트
    v.lastExpansionDay = day;
  }
}

// =============================================================================
// 2. NPC
// =============================================================================
let _nextNpcId = 1;
function createNPC(opts = {}) {
  const job = opts.job || 'farmer';
  const npc = {
    id: 'n' + (_nextNpcId++),
    age: 16 + Math.floor(srand() * 20),
    currentJob: job,
    skills: Object.fromEntries(FIELDS.map(f => [f, 0])),
    skillXp: Object.fromEntries(FIELDS.map(f => [f, 0])),
    traits: Object.fromEntries(FIELDS.map(f => [f, 0])),
    spentTraits: 0,                          // 0~30
    lastJobChangeDay: -999,                  // 쿨다운용
  };
  // ★S4 명장 견습: 배정 직업 field의 시작 숙련(+아이 aptitude=trait)을 명장 상속분으로 세팅.
  //   skill≤trait여야 xp로 더 성장하므로 trait도 같이 세팅(견습이 스승 수준 기반 위에서 더 자람).
  //   spentTraits에 반영(30점 예산 소진분) — 상속받은 만큼 자유 배분 여지는 줄어듦(공짜 아님).
  if (opts.inheritSkill) {
    for (const [f, lv] of Object.entries(opts.inheritSkill)) {
      const s = Math.max(0, Math.min(10, Math.floor(lv)));
      if (s > 0 && npc.skills[f] !== undefined) {
        npc.skills[f] = s; npc.traits[f] = s; npc.spentTraits += s;
      }
    }
  }
  return npc;
}
// ★S4 마을 명장 숙련 — 그 직업 field에서 마을 내 최고 숙련(견습 상속의 기준). hunter는 hunting/archery 중 최고.
function villageMasterSkill(v, job) {
  const jd = JOBS[job]; if (!jd) return 0;
  const fields = (job === 'hunter') ? ['hunting', 'archery'] : [jd.field];
  let mx = 0;
  for (const n of v.npcs) for (const f of fields) { const s = n.skills[f] || 0; if (s > mx) mx = s; }
  return mx;
}
// ★S4 견습 상속 숙련맵 — 배정 직업의 명장 숙련 × 상속률(내림). 명장 없으면 {}(독학=0).
function apprenticeInherit(v, job) {
  const jd = JOBS[job]; if (!jd) return null;
  if (v._world && v._world._noApprentice) return null;   // ★A/B 검증용 스위치(기본 미설정=승계 ON)
  const rate = (v._world && v._world._inheritRate != null) ? v._world._inheritRate : MASTER_INHERIT_RATE;
  const master = villageMasterSkill(v, job);
  if (master <= 0) return null;
  const start = Math.floor(master * rate);
  if (start <= 0) return null;
  if (job === 'hunter') return { hunting: start, archery: start };   // 사냥꾼=사냥·활 둘 다 승계
  return { [jd.field]: start };
}

// 현재 직업의 field
function npcField(npc) { return JOBS[npc.currentJob].field; }

// 일하면 skill xp 증가. 차면 skill +1. skill == trait && skill < 10 이면 trait +1.
// xp_to_next(skill) = 80 + skill * 30
function workNPC(npc) {
  const f = npc.currentJob === 'hunter' ? ((npc._wAlt = !npc._wAlt) ? 'hunting' : 'archery') : npcField(npc);   // ★사냥꾼 xp 교차 배분(격일 사냥/활) — 총 xp율은 타 직업과 동일
  const skill = npc.skills[f];
  const trait = npc.traits[f];
  // skill 10이면 더 안 늘어남
  if (skill >= 10) return;
  // skill < trait 이면 그냥 xp 누적해서 skill 올림
  if (skill < trait) {
    npc.skillXp[f] += 1;
    const need = 80 + skill * 30;
    if (npc.skillXp[f] >= need) {
      npc.skills[f] += 1;
      npc.skillXp[f] = 0;
    }
    return;
  }
  // skill == trait && skill < 10 → trait 1점 찍기 (xp 못 얻으니까)
  if (skill === trait && trait < 10 && npc.spentTraits < 30) {
    npc.traits[f] += 1;
    npc.spentTraits += 1;
    // 다음 day부터 다시 xp 누적 가능
  }
  // trait 다 찍었거나 30점 다 썼으면 xp 멈춤
}

// 직업 전환 — currentJob만 바뀜. skill/trait/xp 모두 보존 (NPC는 영구 학습).
function switchNPCJob(npc, newJob, day, v) {
  const oldJob = npc.currentJob;
  if (v) {
    v.counts[oldJob] = (v.counts[oldJob] || 0) - 1;
    v.counts[newJob] = (v.counts[newJob] || 0) + 1;
  }
  npc.currentJob = newJob;
  npc.lastJobChangeDay = day;
}

// NPC 기회비용 — ★시장가치(한계생산 × 그림자가격). 픽커 한계가치와 *동일 척도*라
//   switch-in(부족직)·switch-out(잉여직)이 대칭(Lewis 노동이동). 글럿(가격폭락) 재화
//   생산자(예: 도구 과잉 마을의 대장장이 → 도구가격↓)는 가치가 낮아 1순위로 차출됨.
//   w(r) = 그림자가격 가중(없으면 1). 숙련 보너스로 명인은 약간 덜 차출(마을 내 비교우위).
function opportunityCost(npc, v, w) {
  w = (typeof w === 'function') ? w : (_ => 1.0);
  const L = (v && v.land) || {};
  const _skv = npc.currentJob === 'hunter' ? ((npc.skills.hunting || 0) + (npc.skills.archery || 0)) / 2 : (npc.skills[npcField(npc)] || 0);
  const sk = 1 + _skv * 0.05;   // ★사냥꾼=활·사냥 평균(두 숙련이 함께 생산성)
  switch (npc.currentJob) {
    case 'farmer':      return (L.fertility || 0) * 0.4 * w('food') * sk;
    case 'fisher':      return (L.water || 0) * 1.2 * w('fish') * sk;
    case 'hunter':      return (L.game || 0) * 0.7 * (w('meat') + 0.3 * w('hide')) * sk;
    case 'lumberjack':  return (L.wood || 0) * 0.3 * w('wood') * sk;
    // ★★[재민 지시 "경제학적 원리에 입각해"] 원석의 **파생수요**(derived demand).
    //   광부는 원석 자체를 원해서 캐지 않는다 — 그게 **될 금속**을 위해 캔다.
    //   전에는 유틸리티가 원석 시장가만 봤다. 그런데 원석 기준가를 노동가치에 맞춰 3.0→1.0 으로
    //   내리자(제련이 가치를 파괴하던 걸 고치느라) 광부가 25→16 으로 줄었다 — 가격은 맞는데
    //   유인이 틀린 것이다. 원석 1단위의 실효가치는 **제련 후 금속 가치**(SMELT_YIELD × 광종 가중가)다.
    //   이러면 광종이 유인에 그대로 들어온다: 금맥 마을은 원석이 비싸고 철맥 마을은 싸다.
    case 'miner': {
      // ★여기만 **land.oreMix** 를 그대로 쓴다(유효 조성 아님) — 광부의 **한계** 산출은 자기 땅이
      //   내놓는 광종이지 곳간에 쌓인 수입 원석의 조성이 아니다. 남이 실어다 준 금맥 원석이
      //   내 철광산의 채굴 유인을 올리면 그게 오류다.
      const _mix = v && v.land && v.land.oreMix;
      let _oreV = w('ore');
      if (_mix) {
        let mv = 0, tot = 0;
        for (const k in _mix) { const q = _mix[k]; if (!(q > 0)) continue; tot += q;
          const _id = k === 'jade_raw' ? 'jade' : k;
          // ★시대 게이트 — 못 뽑는 금속(철 등)은 분자에서 뺀다. 분모엔 남긴다(그 몫은 슬래그 = 실손실).
          if (_ERA_METAL(_id) && !_eraKnows(_id)) continue;
          mv += q * w(_id); }
        if (tot > 0) _oreV = Math.max(_oreV, _SMELT_YIELD_UTIL * (mv / tot));
      }
      return Math.max((L.ore || 0) * _oreV * (1 - (v && v._metalGlut || 0)), (L.obsidian || 0) * w('obsidian'), (L.jade || 0) * w('jade'), (L.tin || 0) * TIN_DEPOSIT_YIELD_FLAT * w('tin') * (1 - (v && v._tinGlut || 0))) * 0.3 * sk;   // ★S1 광부=금속 전담(돌 안 캠) ★S5 흑요석·옥 ★청동 희소성 +주석산지
    }
    case 'forager':     return (Math.max(0.3, ((L.fertility || 0) + (L.wood || 0) + (L.stone || 0)) / 3) * 0.25 * (w('vegetable') + 0.6 * w('herb')) + (L.stone || 0) * 0.9 * w('stone')) * sk * (v && v._forageScale != null ? v._forageScale : 1);   // ★약재 슬롯(§9): herb 산출 15%/식량계수 0.25 = 0.6. ★S1: +돌 채집 가치(land.stone×0.9×돌가격) — 돌밭 채집꾼 매력. ×MSY 포화
    // ★자본재 장인: 노동목표 초과면 0.005(글럿 광부 0.01보다↓ → 1순위 차출), 이내면 50(유지).
    case 'mason':       return ((v.counts.mason || 0)       > masonTarget(v))       ? 0.005 : 50 * sk;   // ★S2 석공(석기·석검·활)
    case 'smith':       return ((v.counts.smith || 0)       > smithTarget(v))       ? 0.005 : 50 * sk;   // ★S2 대장장이(청동·철 무기)
    case 'weaponsmith': return 0.004;   // ★S2 폐지(smith 통합) — 항상 최우선 차출(잔존 weaponsmith → 다른 직업으로)
    case 'armorsmith':  return ((v.counts.armorsmith || 0)  > armorsmithTarget(v))  ? 0.005 : 50 * sk;
    case 'tailor':      return ((v.counts.tailor || 0)      > tailorTarget(v))      ? 0.005 : 50 * sk;   // ★의복(재봉 노동목표 — 갑옷장이 동형)
    case 'cook':        return ((v.counts.cook || 0) > cookTarget(v)) ? 0.005 : 0.4 * w('cooked_food') * sk;   // ★유령 박멸 #4: 목표 초과 요리사=1순위 차출(장인 대칭 — 조리식은 흐름재라 재고가격이 못 끌어내림)
    // ★전사: 무장 가능 수(보유 무기)와 readiness 목표 중 작은 값으로 상한. 무기 없으면 전사 아님 → 동원해제(생산직).
    //   초과/무장불가면 0.008(글럿 생산자 0.01보다↓ = 최우선 차출), 이내면 유지(방어 비시장가치).
    case 'warrior': {
      const wt = Math.min(warriorTarget(v), Math.floor(v.storage.weapon || 0));
      return ((v.counts.warrior || 0) > wt) ? 0.008 : 100;
    }
    default:            return sk;
  }
}

// =============================================================================
// 3. 마을
// =============================================================================
let _nextVillageId = 1;
// ★주석 산지 결정론 — 마을 이름(안정 키)의 해시로 TIN_DEPOSIT_RATE 비율만 산지 지정.
//   name 기반(≠ _nextVillageId): id 카운터는 프로세스 전역 누적이라 byte-match(--check가 Orig·Bundle을 같은 프로세스서 연속 생성)서 두 사본이 다른 id→다른 산지 패턴이 됨. 이름은 동일 세계면 동일(가·나·다… / 마을1·2…)이라 결정론·사본일치.
//   Math.random 미사용(관례 준수) — 순수 해시라 시드 무관 결정론.
function _hashStr(s) {
  let h = 2166136261 >>> 0;   // FNV-1a
  s = String(s == null ? '' : s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  // ★avalanche 마감(murmur3 finalizer) — FNV만으론 순차명("마을1"·"마을2"…)이 상위비트에 뭉쳐 [0,1) 값이 근접(측정: 0.828~0.855)
  //   → 산지 선정이 naming 스킴에 취약(전 마을 미산지 또는 전 마을 산지). 강한 믹싱으로 순차명도 균등 분포시켜 TIN_DEPOSIT_RATE 비율 보장.
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0;
  h ^= h >>> 13; h = Math.imul(h, 3266489909) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;   // [0,1)
}
// 산지 부존 반환 — opts.tin 명시되면 그대로, 아니면 ore 주도 결정론 산지 지정(주석=광맥 광물).
//   score = ore × (0.5 + hash) ≥ TIN_DEPOSIT_ORE_SCORE 이면 산지. ore↑(광산촌)일수록 확실 → 소수 광산촌만 산지.
//   결정론(같은 이름·같은 ore → 같은 결과, byte-match 보존). 두 하네스(CLI·랩) 모두 ore 제공 → 이식성(순수 이름 해시의 소표본 취약성 해소).
function _tinDepositFor(opts) {
  if (opts.tin != null) return opts.tin;
  const ore = opts.ore != null ? opts.ore : 0.5;
  const r = _hashStr('tin|' + (opts.name != null ? opts.name : ''));   // [0,1) 결정론 지터(소량)
  // ★ore 주도(지터 소량): score = ore × (0.8 + 0.4×hash). ore~1.5(광산촌)=1.2~1.5(항상 문턱↑), ore~0.5(평균)=0.4~0.5(항상 미달).
  //   → 랩의 광산촌(ore 1.5 고정)은 이름 무관 확실히 산지 + CLI 고ore 마을도 산지 + 평균 마을은 무산지. 소표본 취약성 제거.
  const score = ore * (0.8 + 0.4 * r);
  if (score < TIN_DEPOSIT_ORE_SCORE) return 0;   // 미달 = 무산지(대다수)
  // 산지 부존 세기 — 광량(ore)·초과분 반영. 부존이 클수록 광부 매력·채굴 정량↑(TIN_DEPOSIT_YIELD_FLAT × land.tin).
  const over = Math.min(1, (score - TIN_DEPOSIT_ORE_SCORE) / 0.6);   // 문턱 초과분 [0,1]
  return +(TIN_DEPOSIT_STRENGTH_LO + over * TIN_DEPOSIT_STRENGTH_SPAN).toFixed(3);
}
// ★청동 경제 자격 — 청동검 지속 생산 가능 마을만 true(주석 산지 OR 대량 주석 비축=교역 허브). 나머지=석기 무장.
// ★oreMix(광종 면적 비율) → 광부 부산물 비율. 광석 자체(ore)는 별도로 이미 산출되므로
//   여기서는 **금속·특수재만** 낸다. 합이 옛 dict 총합(0.33)과 같아지게 맞춰 총량 충격을 없앤다.
const _BP_TOTAL = 0.33;
function _oreMixToByproduct(mix) {
  const out = {}; let tot = 0;
  for (const k in mix) { const v = mix[k]; if (!(v > 0)) continue; out[k === 'jade_raw' ? 'jade' : k] = v; tot += v; }
  // ★[버그] 광맥이 **하나도 없는** 마을(oreMix {})이 여기서 옛 dict 로 떨어져 구리를 캐고 있었다.
  //   실측: 광맥 0 인 41개 마을이 각각 구리 16~28 을 만들어 전체 구리 644 의 대부분을 차지했다.
  //   광맥이 없다는 건 광맥이 없다는 뜻이다. 그 마을의 land.ore 0.10 은 livelihood.js 가
  //   "사철·표사 정도"라고 적어둔 **바닥항**이다 — 하천에서 걸러내는 사철과 사금이지 구리광이 아니다.
  //   (자연동은 희귀하다. 사광상에서 구리가 나오지 않는다.)
  if (!(tot > 0)) return { iron: _BP_TOTAL * 0.5 * 0.9, gold: _BP_TOTAL * 0.5 * 0.1 };
  for (const k in out) out[k] = +(out[k] / tot * _BP_TOTAL).toFixed(4);
  return out;
}
// ★제련(製鍊) — 원석(ore) → 금속. 광종 구성(oreMix)이 무엇이 나오는지 정한다.
//   수율 SMELT_YIELD 는 옛 부산물 총합(_BP_TOTAL 0.33)과 같게 잡아 **총량 중립**이다:
//   전에는 광부가 광석 1 당 금속 0.33 을 같이 냈다. 이제 같은 0.33 이 제련에서 나온다.
//   다만 제련에 **대장장이 노동**이 들므로, 대장장이가 모자란 마을은 원석이 쌓인다(그게 맞다).
//   연료는 기존 야금공 경로(SMELT_FUEL_PER)가 이미 장작을 태우고 있어 따로 안 뺀다.
const SMELT_YIELD = 0.33;
const SMELT_PER_LABOR = 10.4;    // 대장장이 하루가 다루는 원석량 배수(jdef.base 0.45 기준 → 약 2.7/일)
const SMELT_MIN_ORE = 0.5;      // 이만큼도 없으면 노를 지피지 않는다
// 광맥 0 인 마을의 원석 = 하천 사철·사금(livelihood.js FLOOR.ore 주석 "사철·표사").
//   광부 부산물 폴백과 **같은 조성**을 쓴다 — 두 군데가 다른 말을 하면 그게 버그다.
const SMELT_PLACER = { iron: 0.9, gold: 0.1 };
// ═══ ★★[재민 확정 2026-08-02b "다 하자"] 원석에 **조성을 싣는다** ══════════════
//   문제: econ 의 `ore` 는 조성이 없는 스칼라였고, 조성은 **땅**(land.oreMix)에만 있었다.
//   그래서 남이 실어다 준 원석은 "무엇이 든지 모르는 돌"이라 영원히 못 녹였다 — 실측으로
//   어촌2 281 · 임업3 404 가 그렇게 묶여 썩고 있었다(회부_구리부존과_원석적체 ③).
//   물리적으로 틀렸다. 광석은 실어 오면 그 광석 그대로다.
//   ⇒ 마을마다 **유효 제련 조성** `_oreMixEff` 를 둔다 — 지금 곳간에 있는 원석의 가중 평균 조성.
//     · 광부가 캐면 자기 땅 조성으로 폴드 · 캐러밴이 부리면 **출발 마을의 유효 조성**으로 폴드
//     · 제련·부패는 비례 소모라 조성을 바꾸지 않는다(폴드는 **들어올 때만**)
//   ★단일 진실: 읽는 쪽은 전부 `oreMixOf(v)` 를 부른다(사본 금지).
//   ★손잡이 ORE_MIX_EFF=0 → 채택 전 동작(land.oreMix 만) 정확히 재현.
const ORE_MIX_EFF_ON = !(typeof process !== 'undefined' && process.env && process.env.ORE_MIX_EFF === '0');
function oreMixOf(v) {
  if (ORE_MIX_EFF_ON) {
    const e = v && v._oreMixEff;
    if (e && typeof e === 'object') { for (const k in e) if (e[k] > 0) return e; }
  }
  return (v && v.land && v.land.oreMix) || null;
}
// 들어온 원석 addQty(조성 srcMix)를 곳간의 기존 원석 haveQty 에 섞는다.
//   srcMix 가 없거나 비면 폴드하지 않는다(모르는 건 섞을 수 없다 — 기존 조성 유지).
function foldOreMix(v, haveQty, addQty, srcMix) {
  if (!ORE_MIX_EFF_ON || !v || !(addQty > 0) || !srcMix) return;
  let st = 0; for (const k in srcMix) { const q = srcMix[k]; if (q > 0) st += q; }
  if (!(st > 0)) return;
  const cur = (v._oreMixEff && typeof v._oreMixEff === 'object') ? v._oreMixEff : null;
  const base = cur || ((v.land && v.land.oreMix && Object.keys(v.land.oreMix).length) ? v.land.oreMix : null);
  const out = {};
  const oldQ = Math.max(0, haveQty || 0);
  if (base && oldQ > 0) { let bt = 0; for (const k in base) { const q = base[k]; if (q > 0) bt += q; }
    if (bt > 0) for (const k in base) { const q = base[k]; if (q > 0) out[k] = (out[k] || 0) + (q / bt) * oldQ; } }
  for (const k in srcMix) { const q = srcMix[k]; if (q > 0) out[k] = (out[k] || 0) + (q / st) * addQty; }
  let tot = 0; for (const k in out) tot += out[k];
  if (!(tot > 0)) return;
  const norm = {};
  for (const k in out) { const f = out[k] / tot; if (f > 1e-4) norm[k] = +f.toFixed(5); }   // 잔부스러기는 버린다(직렬화 비대 방지)
  v._oreMixEff = norm;
}
// ★시대 게이트 — 판정은 server/era.js 하나에서만 한다(사본 금지). 모듈이 없으면 전부 허용(구 동작 보존).
let _eraMod;
function _era() { if (_eraMod === undefined) { try { _eraMod = require('../server/era'); } catch (e) { _eraMod = null; } } return _eraMod; }
const _ERA_METALS = new Set(['copper', 'tin', 'lead', 'gold', 'silver', 'iron', 'nickel', 'zinc', 'aluminium', 'uranium']);
const _ERA_METAL = (id) => _ERA_METALS.has(id);
function _eraKnows(metal) { const E = _era(); if (!E || !E.npcKnows) return true; try { return E.npcKnows(metal); } catch (e) { return true; } }
function _trySmelt(v, laborBase) {
  const om = oreMixOf(v);                              // ★유효 조성 우선(수입 원석 포함) — 없으면 땅 조성
  if (!om) return 0;                                   // 지도 정보 없는 호출부(랩·CLI)는 옛 경로
  const mix = Object.keys(om).length ? om : SMELT_PLACER;
  const have = v.storage.ore || 0;
  if (have < SMELT_MIN_ORE) return 0;
  // ★★[끊김① 해소 2026-08-01] 금속이 이미 넘치면 녹이지 않는다 — 같은 판정이 채용 게이트(smeltTarget)에도
  //   있지만, **이미 고용된** 대장장이의 행위는 안 막고 있었다. 실측(새 지도 임업2): 구리 529·주석 284 를
  //   쌓아두고도 광부 10명이 원석을 계속 대니 누적 2,784 를 제련하며 주조를 한 번도 못 갔다.
  //   재고가 넘치면 불을 끄고 주조로 넘어간다 — 주조가 재고를 소화하면 저절로 다시 녹인다(자기 조절).
  {
    const mix0 = Object.keys(om).length ? om : SMELT_PLACER;
    let mhave = 0, mwant = 0; const N0 = v.npcs.length || 1;
    for (const k in mix0) { const id = k === 'jade_raw' ? 'jade' : k; mhave += v.storage[id] || 0; mwant += (RESERVE_PC[id] || 0.1) * N0; }
    if (mhave > mwant * 4) return 0;
  }
  // ★★[2026-08-01 실측으로 잡음] 회수할 게 하나도 없으면 **아예 불을 때지 않는다.**
  //   시대 게이트를 넣고 재보니 인구 1,025 → 279 로 무너졌다. 원인은 게이트가 아니라 이것이었다:
  //   철만 나는 마을의 대장장이가 매일 원석을 노에 넣고, 철은 못 뽑으니 전량 슬래그로 버리고,
  //   그렇게 하루를 통째로 날렸다. 원석 재고가 720 → 5 로 증발한 게 그 흔적이다.
  //   광석을 통째로 넣는 것 자체는 맞지만, **나올 게 없는 걸 아는 채로 넣지는 않는다.**
  {
    let rec = 0, tt = 0;
    for (const k in mix) { const q = mix[k]; if (!(q > 0)) continue; tt += q;
      const id = k === 'jade_raw' ? 'jade' : k;
      if (!_ERA_METAL(id) || _eraKnows(id)) rec += q; }
    if (!(tt > 0) || !(rec / tt > 0.02)) return 0;   // 회수 몫 2% 미만이면 땔감 낭비다
  }
  const cap = Math.max(0, laborBase * SMELT_PER_LABOR);
  const use = Math.min(have, cap);
  if (!(use > 0)) return 0;
  v.storage.ore = have - use; _cons(v, 'ore', use);
  let tot = 0; for (const k in mix) tot += mix[k];
  if (!(tot > 0)) return 0;
  const out = use * SMELT_YIELD;
  for (const k in mix) {
    const id = k === 'jade_raw' ? 'jade' : k;
    // ★★[재민 확정 2026-08-01] 시대가 모르는 금속은 **슬래그로 버려진다.**
    //   물리적으로도 맞다 — 청동기 노는 철광석을 넣어도 쇳물을 못 뽑는다(융점 1538℃).
    //   그 마을의 원석 중 철 몫은 그냥 사라진다. 그래서 철만 나는 마을은 광부를 둘 이유가 없어지고,
    //   철 말고 살 길이 없는 땅이면 쇠락한다 — 재민: "철광산 마을은 망해야 정상".
    //   ⚠수요는 안 자른다. 플레이어가 철검을 팔면 마을은 산다(server/era.js 머리 주석 참조).
    if (_ERA_METAL(id) && !_eraKnows(id)) continue;
    const q = out * (mix[k] / tot);
    if (q > 0) v.storage[id] = (v.storage[id] || 0) + q;
  }
  v._smeltedToday = (v._smeltedToday || 0) + use;
  v._smeltedTotal = (v._smeltedTotal || 0) + use;
  return use;
}
// ★대장장이 배합 — 마을 재고 비율대로 녹인다. 총 금속 투입은 0.42 로 고정(옛 0.3+0.12 와 동일).
//   반환 { take: {금속: 양}, grade: 합금 등급(청동=1.0), bronzeness: 청동다움(계측용) }
const CAST_OUT_REF = 0.81;    // 표준 청동(Cu88Sn12)의 주조성 — 산출 배수 1.0 의 기준
const CAST_OUT_MAX = 1.8;     // 주조성 이득 상한(납을 무한정 붓는 걸 막는다)
const _MELT_TOTAL = 0.15;   // ★무기 1자루 = 금속 1단위(옛 2.8단위). 노동가치 정합가를 23.2→14.7 로 낮춘다
const _MELT_METALS = ['copper', 'tin', 'lead', 'silver', 'gold'];   // 청동기에 제련 가능한 것만
function _alloyMelt(v) {
  const SP = _spec(); if (!SP) return null;
  const st = v.storage || {};
  if (!((st.copper || 0) > 0.01)) return null;            // 구리 없이는 못 만든다(기지가 없다)
  // ★[2026-08-02c] 재료비·산출값 둘 다 **기회비용**으로 — "이 주석을 무기에 쓸까, 팔까"가 여기서 갈린다.
  //   ALLOY_OPP 가 꺼져 있거나 순수출가 주입이 없으면 _matPrice 와 바이트 동일(회귀 무영향). _oppPrice 주석 참조.
  const price = _oppPrice(v);
  const adds = _MELT_METALS.filter((m) => m !== 'copper' && (st[m] || 0) > 0.01);

  // ★★[재민 확정] 대장장이는 **재고 비율대로 붓지 않는다.** 그건 대장장이가 아니라 쓰레기통이다.
  //   (실측: 주석 21 · 구리 5 인 마을이 주석 50% 를 부어 등급 0.06 짜리 부서지는 검을 만들었다.
  //    표준 청동이 1.00 이고 순동조차 0.47 인데, 재고 비율대로 부으면 순동보다 나쁜 게 나온다.)
  //   청동기 대장장이는 경험으로 비율을 안다. 여기서는 그걸 **탐색**으로 표현한다:
  //   재고가 허락하는 배합 중 **등급 ÷ 재료비**가 가장 큰 것을 고른다.
  //   ⇒ 주석이 넉넉하면 최적비(약 17%)로, 모자라면 있는 만큼만 섞어 등급을 조금이라도 올리고,
  //     금·은은 등급이 올라도 값이 비싸 점수에서 밀린다 — 따로 막지 않아도 안 쓴다.
  //   ★목적함수는 **이윤**이다: (무기 산출 × 무기값 × 등급) − 재료비.
  //     전에는 등급÷재료비(비율)를 썼는데, 그건 "재료가 제약일 때"의 답이다. econ 의 대장장이는
  //     하루에 amt 개만 만드는 **노동 제약**이라, 그 하루로 얼마나 가치를 만드느냐가 문제다.
  //     노동은 어차피 쓰는 고정비이므로 이윤 최대화가 옳다.
  //   ★[재민] "구리 1000 에 주석 1 있어도 82:18 로만 합금해? 나머지 구리는 버려지는 거야?
  //            구리를 많이 넣어 효율이 낮더라도 많이 만드는 게 이득 아닌가?"
  //     버려지지 않는다 — 주석 1 이면 그 배합으로 37 자루를 만들고, 떨어지면 그때 순동으로 내려간다.
  //     그리고 "얇게 펴서 많이"는 **재료가 희소해질수록 저절로 일어난다**: 주석이 귀해지면 시장가가
  //     오르고, 이윤식이 주석 비중을 스스로 낮춘다(실측: 주석값 4→18% · 8→14% · 20→6% · 60→3%).
  //     개수는 노동이 정하므로 배합으로 개수를 늘릴 수는 없지만, 재고 고갈로 **못 만드는 날**이
  //     생기면 그게 가격에 잡혀 같은 결론에 도달한다.
  const STEPS = [0.03, 0.06, 0.10, 0.14, 0.18, 0.24];
  const _amtPerCast = (JOBS.smith.base || 0.45) * WEAPON_LABOR_MULT;
  const _pw = price('weapon');
  let best = null;
  const consider = (mix) => {
    const take = {};
    for (const k in mix) {
      const q = _MELT_TOTAL * mix[k];
      if (q <= 0) continue;
      if ((st[k] || 0) < q) return;                       // 재고 부족 — 이 배합은 못 짠다
      take[k] = +q.toFixed(4);
    }
    const pr = SP.alloyProps ? SP.alloyProps(mix) : null;
    const g = SP.alloyGrade ? SP.alloyGrade(mix, 'weapon') : 0;
    if (!(g > 0) || !pr) return;
    // ★★주조성(cast)이 **산출량**을 정한다 — 이게 납의 자리다.
    //   실제 세형동검에는 납이 11% 들어간다. 무기 성능은 떨어지는데 왜 넣었나? **주조가 쉬워서**다.
    //   납은 융점을 낮추고 쇳물을 잘 흐르게 해 같은 노동으로 더 많이·복잡하게 뜰 수 있다.
    //   품질만 보면 납은 영원히 안 쓰인다(등급을 깎기만 하므로). 산출량에 걸어야 자리가 생긴다.
    //   기준은 표준 청동(Cu88Sn12, cast 0.81) = 1.0. 순동은 0.56(주조가 어렵다 — 고증: 순동기는 단조 위주),
    //   세형동검 배합은 1.57. 이러면 모델이 스스로 Sn18Pb6 근처를 최적으로 고른다(실물 Sn14Pb11 과 근사).
    const castF = Math.min(CAST_OUT_MAX, pr.cast / CAST_OUT_REF);
    let cost = 0; for (const k in mix) cost += _MELT_TOTAL * mix[k] * price(k);
    const score = _amtPerCast * castF * _pw * Math.min(1.2, g) - cost;   // 이윤 = 산출량 × 값 × 등급 − 재료비
    if (!best || score > best.score) best = { take, mix: Object.assign({}, mix), grade: g, castF, score };
  };
  consider({ copper: 1 });                                 // 순동(기준선 — 항상 후보에 둔다)
  for (let i = 0; i < adds.length; i++) {
    for (const a of STEPS) {
      consider({ copper: 1 - a, [adds[i]]: a });
      for (let j = i + 1; j < adds.length; j++) {
        for (const b of STEPS) {
          if (a + b >= 0.5) continue;                      // 기지는 구리여야 한다
          consider({ copper: 1 - a - b, [adds[i]]: a, [adds[j]]: b });
        }
      }
    }
  }
  if (!best) return null;
  return { take: best.take, grade: best.grade, castF: best.castF, bronzeness: Math.min(1, (best.mix.tin || 0) / 0.12) };
}
function _bronzeCapable(v) {
  if ((v.land && v.land.tin || 0) > 0) return true;                       // 주석 산지 — 자체 청동
  const N = v.npcs ? v.npcs.length : 1;
  return (v.storage && v.storage.tin || 0) >= Math.max(BRONZE_TIN_MIN_ABS, N * BRONZE_TIN_MIN_PC);   // 교역 허브(대량 주석 비축)만
}
// ★철검 자격 — 철이 풍부한 마을만(청동기엔 철=최희소). 트레이스 축적(부산물)만으론 미달 → 석공 마제석검.
function _ironWeaponCapable(v) {
  if (!_eraKnows('iron')) return false;   // ★NPC 대장장이는 시대가 열려야 철을 다룬다(플레이어는 별개 — era.js 참조)
  // ★[재민 확정 2026-08-02 "철검은 정상 생산되게 하면 되잖아"] 재고 문턱 max(20, N×1.5) 폐지.
  //   그 문턱은 시대 게이트가 없던 시절 "철=최희소"를 표현하던 유물인데, 시대 게이트가 생긴 지금은
  //   이중 잠금이었다 — 실측: 시대를 열어도 철 93~105 를 쌓고 문턱(147~411)을 영영 못 넘어 철검 0(무풍).
  //   이제 청동과 같은 일반 재료 게이트다: 한 자루 재료(0.4 — 제작 분기 소비량)가 있으면 만든다.
  //   희소성은 문턱이 아니라 **공급**이 표현한다(주요 광맥에 철 0 → NPC 철은 플레이어 유입뿐).
  return (v.storage && v.storage.iron || 0) >= 0.4;
}
function createVillage(opts) {
  const baseSize = opts.size ?? 50;
  const v = {
    id: 'v' + (_nextVillageId++),
    name: opts.name,
    land: {
      fertility: opts.fertility ?? 1.0,
      arable: opts.arable,        // ★경작지 비율(0~1, 공간 실측) — 농부 '자리'는 이걸로(면적), fertility는 산출(지력)만. 없으면 min(1,fert) 폴백
      wood: opts.wood ?? 1.0,
      stone: opts.stone ?? 1.0,
      ore: opts.ore ?? 0.5,
      water: opts.water ?? 0.3,
      game: opts.game ?? 0.6,
      obsidian: opts.obsidian ?? 0,   // ★S5 흑요석 특수 산지(0~1, 대부분 마을 0 — 화산지대만). 광부가 채굴 → 화살촉/소형칼날 교역재.
      jade: opts.jade ?? 0,           // ★S5 옥 특수 산지(0~1, 극소수 마을만). 광부가 채굴 → 위세품 교역재.
      // ★★[재민 확정] "마을이 주석 산지이다 아니다를 꼭 이분법적으로 정할 필요가 있어..?"
      //   없앴다. oreMix(노동권 광맥의 광종별 면적 비율)가 있으면 **연속량**으로 나온다:
      //     land.tin = oreMix.tin × land.ore   — 조금 나는 마을·많이 나는 마을이 자연히 생긴다
      //   oreMix 가 없는 호출부(랩·CLI)만 옛 이름해시 문턱으로 폴백한다.
      //   ⇒ TIN_DEPOSIT_ORE_SCORE 문턱 튜닝 문제(본게임 최대 land.ore 1.06 < 필요 1.067)도 함께 소멸.
      oreMix: opts.oreMix || null,
      oreP: opts.oreP != null ? opts.oreP : null,       // 노동권 면적가중 평균 농도(감정 모델 입력)
      oreDist: opts.oreDist != null ? opts.oreDist : 0,  // 광맥까지 면적가중 평균 거리(셀) — 헛짐 운반비
      // ★oreMix 가 **있기만 하면** 그게 정답이다 — 비어 있으면 "지도가 여긴 광맥 없다고 말한다"이지
      //   "모른다"가 아니다. 옛 이름해시 폴백은 oreMix 자체가 없는 호출부(랩·CLI)에만 남긴다.
      //   (이 구분을 안 하면 광맥 0개인 농촌이 이름 운으로 주석 산지가 된다.)
      tin: opts.tin != null ? opts.tin
         : (opts.oreMix ? +(((opts.oreMix.tin) || 0) * (opts.ore ?? 0.5)).toFixed(3)
                        : _tinDepositFor(opts)),
      size: baseSize,
      baseSize,                                                   // 확장 비용 계산 기준
    },
    expansions: 0,                                                // 확장 횟수
    treasury: Object.fromEntries(RESOURCES.map(r => [r, 0])),     // 길드 금고
    coord: { x: srand() * MAP_SIZE, y: srand() * MAP_SIZE },      // 마을 좌표
    // 길드 — 기본 세율 3%, NPC AI가 자동 조절 (hill climbing)
    guild: {
      taxRate: 0.03,
      master: null,
      _lastIncome: 0,
      _lastRate: 0.03,
      _direction: 0.005,   // 다음 조정 방향 (+ 또는 -)
    },
    npcs: [],
    storage: Object.fromEntries(RESOURCES.map(r => [r, 0])),
    surplusEMA: Object.fromEntries(RESOURCES.map(r => [r, 0])),
    // 성능 캐시
    counts: Object.fromEntries(JOB_NAMES.map(j => [j, 0])),       // 직업별 인구 (incremental)
    dailyProductionBuf: Object.fromEntries(RESOURCES.map(r => [r, 0])),
    lastTradeDay: 0,
    lastExpansionDay: 0,
    isolated: false,
    isolatedUntilDay: 0,
    history: [],
    // Phase 4d-6: 합리적 의사결정용 stats
    tradeStats: {
      caravansSent: 0,        // 누적 출발 캐러밴 수
      caravansRaided: 0,      // 누적 약탈당한 수
      cargoSent: 0,           // 누적 화물량 (give+want)
      cargoLost: 0,           // 약탈 손실
      windowStartDay: 0,      // 통계 윈도우 시작 (100일 단위로 리셋)
      foodImported: 0,        // 윈도우 동안 수입한 food (귀환 시 받은 양)
    },
  };
  // 초기 인구 — 토지 자급력에 비례. 척박 마을은 작게 시작.
  //   자급 가능한 최대 NPC 생산력 (1명이 만들 수 있는 일일 식량)
  const maxFoodPerNPC = Math.max(
    v.land.fertility * 1.5,
    v.land.water     * 1.2,
    v.land.game      * 0.7,
    Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3) * 0.25
  );
  // Phase 4d-7: sustainable cap 제거 — 비자급 마을도 정상 인구로 시작 (초기 식량 비축으로 교역 시간 확보)
  const initN = opts.initialPop || 8;
  for (let i = 0; i < initN; i++) {
    let job = pickInitialJob(v);   // ★전담 행상 폐지: 첫 NPC도 일반 직업(식량 위주). 교역은 잉여 생기면 기본 NPC가.
    const npc = createNPC({ job });
    v.npcs.push(npc);
    v.counts[job] = (v.counts[job] || 0) + 1;
  }
  // 초기 비축 — 비자급 마을(광물/사막)도 교역 시작할 시간. ★45일치(옛 300일치는 글럿→satiation이 식량생산 억제→
  //   부양력 오판·농부 이탈로 초반 인구 진동시켰음). 45일이면 satiation 거의 0(secF~0.1) + 교역 부트스트랩 충분.
  v.storage.food = initN * 45;
  v.storage.tool = initN * 3;         // 도구 충분
  v.storage.clothes = initN * 1.1;    // ★의복(2026-07-12): 정착민은 입고 온다(1인 1벌+α) — 옷 0벌 창설이 첫 겨울(day270) 한랭 나선을 만들던 부트스트랩 구멍 봉합(herb·활 시드 동형). 정상상태 수요는 마모(CLOTH_WEAR_PC)가 유지
  v.storage.wood = initN * 8;         // 초기 주거 건축 부트스트랩(사용자 확정: 원값 유지) + 벌채 부산물(deforestCell)은 별도 소량 보충
  v.storage.stone = initN * 5;        // 초기 석재(주거·거래·smith)
  // ★★[2026-08-02 · 회부_마을소멸_시딩 (나) — 3시드 A/B 로 채택] **정착민은 땅을 보고 지고 온다.**
  //   소멸의 사인은 "도구 아사"였다(회부 문서 §사인): 돌·나무가 바닥인 땅은 도구가 닳으면 재보급이
  //   안 돼 맨손 생산(×0.25)으로 추락하고, 비옥한 땅인데도 굶는다. 그런데 전 마을에 **일괄로**
  //   같은 초기 재고를 주는 건 그 땅을 못 본 것이다 — 돌밭 마을은 남아돌고 돌 없는 마을은 모자란다.
  //   ⇒ **못 주는 만큼 지고 온다**: 기준은 "쓸 만한 땅"(돌 1.0·나무 1.0)이고, 그 아래인 만큼만 얹는다.
  //     (일괄 가산이 아니다 — 좋은 땅은 한 톨도 더 받지 않는다.)
  //
  //   ★실측(실지도 800일 · 3시드 평균, 2026-08-02):
  //       인구 1,118 → **1,630**(+46%) · 소멸 6.0/19 → **2.7/19**(−55%) · 무기 786 → 1,119 · 갑옷 50 → 84
  //       (전 시드 개선: 소멸 9→3 · 4→2 · 5→3)
  //   ★왜 "완화일 뿐"이 아니었나 — 회부 문서는 "도구는 또 닳는다"고 봤다(나도 그렇게 봤다).
  //     그런데 800일에도 효과가 남는다. 소멸이 **정상상태 문제가 아니라 경로 의존 문제**이기 때문이다:
  //     초기 도구가 버텨 주는 동안 인구가 임계를 넘으면 석공을 감당할 수 있게 되고, 그러면 교역
  //     상대로도 값이 생겨 돌이 들어온다. 한 번 넘기면 되돌아가지 않는다 — 못 넘기면 좀비가 된다.
  //     (그래서 개입 시점이 t=0 이어야 한다. 회부 문서가 재 본 "기근 마을 반출 금지"는 이미
  //      늦은 시점의 개입이라 시드 분산에 묻혔던 것이다.)
  //   ※LANDFIT=0 으로 끄면 채택 전 동작을 그대로 재현한다(A/B 손잡이 — 기본값은 1, PEACE_W 선례).
  // ★★[재민 확정 2026-08-02b 부얼타운] **식량 부양력이 낮은 땅**에 자리 잡는 무리는 식량도 지고 온다.
  //   같은 원리의 확장이다("못 주는 만큼 지고 온다"). 기준은 시딩이 쓰는 부양력 지표와 **같은 식**이고
  //   (사본 금지), 하한 2.0 에 못 미치는 만큼만 얹는다.
  //   ⚠양을 크게 잡지 않는다 — 옛 300일치 비축이 "글럿 → satiation → 부양력 오판 → 농부 이탈"로
  //     초반 인구를 진동시킨 전례가 있다(위 45일치 주석). 최대 45일치 추가(=90일)까지만.
  //   BOOMFIT=0 이면 이 항만 끈다(A/B 재현).
  //   ★대상은 **부얼타운뿐**이다(isBoomtown — 부양력 미달 AND 광맥 실함). "식량이 좀 부족한 마을"에
  //     일괄로 얹었다가 인구 1,630 → 1,126 으로 무너뜨린 게 1차 시도였다(위 판정 함수 주석).
  const _isBoom = BOOMFIT_K > 0 && isBoomtown(v.land);
  const _foodLack = _isBoom ? Math.max(0, Math.min(1, 1 - foodCapOf(v.land) / 2.0)) : 0;
  if (_foodLack > 0) {
    v.storage.food += initN * 45 * _foodLack * BOOMFIT_K;                       // 최대 +45일치
  }
  const _lf = LANDFIT_K;
  if (_lf > 0) {
    const _lackStone = Math.max(0, 1.0 - (v.land.stone || 0));
    const _lackWood = Math.max(0, 1.0 - (v.land.wood || 0));
    v.storage.stone += initN * 25 * _lackStone * _lf;   // 기본 N×5 위에 최대 N×25(돌 0인 땅)
    v.storage.wood += initN * 20 * _lackWood * _lf;     // 기본 N×8 위에 최대 N×20
    v.storage.tool += initN * 6 * Math.max(_lackStone, _lackWood) * _lf;   // 도구 여유분 — 재보급이 어려운 만큼 더 지고 온다
  }
  v.storage.ore = Math.floor(initN * v.land.ore * 5);  // 광물 도시는 ore 잉여로 시작
  // ★부얼타운은 **팔 것**도 지고 온다 — 식량을 살 밑천이다(이 마을은 식량을 사서 산다).
  //   ※위 food 가산 뒤에 오는 이유: storage.ore 는 여기서 통째로 대입되므로 그 뒤에 얹어야 한다.
  if (BOOMFIT_K > 0 && _foodLack > 0) v.storage.ore += initN * (v.land.ore || 0) * 10 * _foodLack * BOOMFIT_K;
  v.storage.herb = initN * 0.5;       // ★약재(§9): 정착민 상비약 반 근씩 — 재고0 희소폭등(가격 스파이크→채집 쏠림 과도) 방지 시드
  v.storage.weapon = Math.max(v.storage.weapon || 0, initN * 0.15);   // ★활 시드(§9 3차): 정착민 사냥꾼은 제 활을 들고 옴(~초기 사냥꾼 수) — t=0 무기 결손이 무기장 캐치업·교역을 흔드는 것 방지(herb 패턴)
  v.housing = Math.max(initN, HOUSE_START);   // ★주거 수용력. K = min(식량,생산) 안에서 인구가 이 값에 막힘(성장 게이트).
  return v;
}

// 마을의 직업 분포 — incremental cache (v.counts) 반환. O(1).
// createNPC/splice/switchNPCJob에서 v.counts를 직접 업데이트해야 함.
function jobCounts(v) {
  return v.counts;
}

// 자리가 남은 직업인지
function hasSlot(v, job, cap, counts) {
  return (cap[job] || 0) > (counts[job] || 0);
}

// 마을 초기/신규 NPC가 가질 직업.
//   1단계: 식량 자리 50% 채울 때까지 식량 직업 우선 (생존 buffer)
//   2단계: 그 후 모든 1차 산업 비교우위 평가 (자원 직업 후보)
//   광산 도시(사막)도 초기엔 일부 농부/어부/사냥꾼 양성 → 자급 0.5 + 교역 의존
function pickInitialJob(v) {
  const cap = jobCapacity(v);
  const counts = jobCounts(v);
  const forageLandMean = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);

  const foodOpts = [
    ['farmer',  v.land.fertility * 1.5],
    ['fisher',  v.land.water     * 1.2],
    ['hunter',  v.land.game      * 0.7],
    ['forager', forageLandMean   * 0.25],
  ];

  // 식량 자리 30% 미만이면 식량 직업 우선 (생존 buffer). 그 후 자원 직업으로 빠짐.
  //   광산 도시(사막)도 30%까지만 농부 양성, 나머지는 광부/벌목 → 자원 잉여로 교역
  const foodCap = cap.farmer + cap.fisher + cap.hunter + Math.floor(cap.forager * 0.5);
  const foodWorkers = (counts.farmer || 0) + (counts.fisher || 0) +
                       (counts.hunter || 0) + Math.floor((counts.forager || 0) * 0.5);
  if (foodCap > 0 && foodWorkers / foodCap < 0.3) {
    const open = foodOpts.filter(([j]) => hasSlot(v, j, cap, counts));
    open.sort((a, b) => b[1] - a[1]);
    if (open.length > 0) return open[0][0];
  }

  // 식량 자리 50% 차면 — 모든 1차 산업 비교우위
  const allOpts = [
    ...foodOpts,
    ['lumberjack', v.land.wood  * 0.9],
    ['miner',      Math.max(v.land.ore || 0, v.land.tin || 0) * 0.7],   // ★S1 광부=금속 전담(광맥 기준) ★청동 희소성 +주석산지
  ].filter(([j]) => hasSlot(v, j, cap, counts));
  allOpts.sort((a, b) => b[1] - a[1]);
  if (allOpts.length > 0) return allOpts[0][0];

  // fallback
  const fallback = ['mason', 'cook', 'merchant', 'forager'].find(j => hasSlot(v, j, cap, counts));   // ★S2 석공(석기) 우선
  return fallback || 'forager';
}

// 마을 일일 처리
function tickVillage(v, day) {
  if (v.npcs.length === 0) return;

  // ★flow-EMA 일 경계 폴드(2026-07-12): 어제 _consDay → _consEMA(α=1/30, ~30일 관성 — prodK EMA 동형).
  //   오늘 소비는 이 아래 각 소비처의 _cons가 다시 쌓음(폴드가 항상 하루 전 완결분만 봄 — 순서 일관).
  {
    const d = v._consDay, e = v._consEMA || (v._consEMA = {});
    if (d) {
      for (const r in e) if (!(r in d)) e[r] *= (29 / 30);   // 오늘 키 없는 재화도 감쇠(소비 중단 → 수요 자연 소멸)
      for (const r in d) { e[r] = (e[r] || 0) * (29 / 30) + d[r] * (1 / 30); d[r] = 0; }
    }
  }

  // 1) 각 NPC 일하기 → 산출물 storage에 + skill xp
  //    매일 새 객체 만들지 말고 버퍼 재사용 (GC 부하 ↓)
  const dailyProduction = v.dailyProductionBuf;
  for (const r in dailyProduction) dailyProduction[r] = 0;   // ★NaN 가드: specialty 부산물 키(동적 추가분)까지 전부 리셋 — 어제 값 잔존·NaN 오염 방지
  for (const r of RESOURCES) dailyProduction[r] = 0;
  v._tinToday = 0;   // ★청동 희소성: 마을 일일 주석 채굴 누적(마을 규모 무관 절대 상한용 — 대형 산지 마을의 tin 홍수 방지)
  // ★도구 등급제: 맨손 0.25×(엄청 느림) / 돌도구 1.0×(보통) / 철도구 1.8×(상당히 빠름). 일꾼은 가진 최선의 도구 사용.
  //   → 도구가 생산을 좌우 → 대장간·돌·철 수요. 도구 없어도 농어업 가능하나 극도로 느림(사용자 설계).
  let toolDeps = 0;
  for (const n of v.npcs) if (JOBS[n.currentJob].toolDependent) toolDeps++;
  v._toolDeps = toolDeps;   // (계측 전용, 로직 무관) per-pc 도구 지표의 분모(도구의존인구) 노출
  let toolBoostShared = 1.0;
  // ★S3 석기 품질 boost: 마을 석기 품질 EMA(_toolQ, 석공 최고숙련 추종). 첫 틱/미설정 시 종전 1.4로 폴백(칼리브 보존).
  const _stoneToolBoost = (v._toolQ != null) ? v._toolQ : 1.4;
  if (toolDeps > 0) {
    const ni = Math.min(toolDeps, v.storage.iron_tool || 0);            // 철도구(1.8×, 레거시 잔재만 — 신규 생산 0)
    const nb = Math.min(toolDeps - ni, v.storage.bronze_tool || 0);     // 청동도구(1.4×, 레거시 잔재만 — 신규 생산 0)
    const ns = Math.min(toolDeps - ni - nb, v.storage.tool || 0);       // ★석기(간돌) — S3: 품질(_toolQ) 배수. 막석기 1.25× ~ 명장석기 1.55×(중심 ~1.4 = 종전 칼리브).
    const nn = toolDeps - ni - nb - ns;                                 // 맨손(0.25×)
    toolBoostShared = (ni * 1.8 + nb * 1.4 + ns * _stoneToolBoost + nn * 0.25) / toolDeps;
  }
  // 봉쇄 = 교역만 차단. 산출 자체는 영향 없음 (자급 마을은 영향 X).
  const isBlockaded = v.isolated && day < v.isolatedUntilDay;
  // ★생산 포만(satiation) — 재고 글럿이면 그 산출 생산을 taper→0(무의미한 잉여 생산·무한 누적 방지 = "여가").
  //   판정: adj = 그림자가격/기준값. 재고 ≲ 몇×목표면 풀생산, 깊은 글럿(adj→0.04)이면 0.
  //   식량은 목표(N×30)가 커서 ~150일 넘어야 taper → 성장·기근버퍼 무해. 광석·돌·부산물은 목표가 작아 일찍 멈춤.
  //   ★안전장치: 식량 불안정(<50일) 마을은 포만 OFF — 풀생산 유지(수출로 식량 확보, 굶지 않게). 여유 마을만 잉여 생산 줄임.
  const _satP = (v._world && typeof v._world.priceFn === 'function') ? v._world.priceFn(v) : null;
  const _satB = (v._world && v._world.priceBase) || null;
  // ★식량안보 *부드러운 ramp*(40→80일치) — 이분법(>50 ON/OFF)이면 식량수입 마을이 경계서 진동→crisis-mode 잦아 churn 폭증.
  //   secF=0(40일↓): 풀생산(수출로 식량). secF=1(80일↑): 완전 포만(잉여 감산). 가치재만 적용, 무용재는 항상 포만.
  const _foodDays = totalFoodEquivalent(v) / (v.npcs.length || 1);
  const _secF = Math.max(0, Math.min(1, (_foodDays - 40) / 40));
  // ★식량 과잉버퍼 직접 감산 — 70일치↑ 잉여 곡물생산을 여가·교역·공예로(가격 무관, K는 잠재기준이라 불변).
  //   효과: 곡물 단작 과잉→다각화(장식교역 +50%). 수입-부양 마을은 지속가능 크기로 정직하게 수렴. 150→~95일치 캡.
  const _foodGlut = 0;   // ★자연화(2026-07-12, 사용자 결정): 식량 70일치↑ 직접 감산 제거 — 잉여 농노동의 자연 소비처(재봉·공예 전직 via 한계가치)+의복 마모 수요가 대체. 종전식 Math.max(0,Math.min(0.8,(_foodDays-70)/80)) — 병리 재발 시 복원 지점(항은 보존)
  // ★돌 과잉버퍼 직접 감산 — 돌도 가격이 안 떨어져(0.46) raw-taper 미발동 → 잉여 채석 낭비. 15/명↑ 감산(건축·도구분은 보존).
  const _stonePC = (v.storage.stone || 0) / (v.npcs.length || 1);
  const _stoneGlut = 0;   // ★자연화(2026-07-12, 사용자 결정): 돌 직접 감산 제거 — 건축 유지 실소비(STONE_MAINT_PC, 담장·구들·숫돌 마모)가 실수요로 대체. 종전식 Math.max(0,Math.min(0.7,(_stonePC-15)/30)) — 병리 재발 시 복원 지점
  // ★도구 과잉버퍼(e2) 직접 감산 — 커버리지(도구재고/도구의존인구)가 임계 X배↑면 초과분만큼 대장장이 산출·원료소비 동시 감산.
  //   근거: toolBoostShared는 커버리지 1.0에서 포화(그 이상 생산 기여 0) → 초과 도구 생산은 무의미 잉여 + 구리/주석 낭비(_stoneGlut 동형).
  //   임계 X를 floor로 삼아 재고가 X 부근에 수렴(완전수렴 1로 안 감 — 도구는 생산자본재라 포화선 아래는 생산붕괴). tf=0이면 원료 차감도 정지.
  const _toolStockG = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  const _toolCov = _toolStockG / Math.max(1, toolDeps);
  const _toolGlut = Math.max(0, Math.min(1, (_toolCov - TOOL_GLUT_X) / TOOL_GLUT_RAMP));
  const _toolTaper = 1 - _toolGlut;   // 대장장이 산출·원료소비 공통 배율(1=풀생산, 0=정지)
  // ★S2 금속 과잉버퍼 직접 감산 — 구리/주석은 청동검(희소)만 소비 → 광산 마을에서 무한 축적(가격 taper로도 ~수천서 겨우 멈춤).
  //   1인당 버퍼(N×4) 초과분을 선형 감산(RAMP N×4) → 재고가 그 부근 수렴. 광부의 *금속 부산물만* 감산(광석 채굴 자체·돌은 무관).
  const _cuPC = (v.storage.copper || 0) / (v.npcs.length || 1);
  const _metalGlut = Math.max(0, Math.min(0.9, (_cuPC - 4) / 4));
  v._metalGlut = _metalGlut;   // ★저장: 광부 한계가치(픽커·기회비용)가 금속 글럿을 보게 → 글럿이면 광부 차출(무의미 채굴 방지)
  // ★청동 희소성: 주석 글럿 — 산지 마을이 tin을 과축적하지 않게(청동검·수출로 소진). 버퍼 낮게(tin=귀재): tin_pc~1.0서 채굴 감산 → 한 산지가 전 마을을 청동화하는 과잉 방지.
  const _tinPC = (v.storage.tin || 0) / (v.npcs.length || 1);
  const _tinGlut = Math.max(0, Math.min(0.9, (_tinPC - 1.0) / 1.5));
  // ★S5 흑요석/옥 글럿 감산 — 특수 산지 마을이 채굴재를 무한 축적하지 않게(수출 교역재라 국내 수요는 소량). 재고 초과분 선형 감산.
  const _obPC = (v.storage.obsidian || 0) / (v.npcs.length || 1);
  const _obsGlut = Math.max(0, Math.min(0.9, (_obPC - 3) / 4));
  const _jaPC = (v.storage.jade || 0) / (v.npcs.length || 1);
  const _jadeGlut = Math.max(0, Math.min(0.9, (_jaPC - 2) / 3));   // 옥=위세품, 국내 소비 더 적음(낮은 버퍼)
  const satMul = (_satP && _satB)
    ? (r => {
        const adj = (_satP[r] || 1) / (_satB[r] || 1);
        const raw = Math.max(0, Math.min(1, (adj - 0.04) / 0.21));   // 글럿이면 0(감산)
        const sec = SAT_ALWAYS[r] ? 1 : _secF;                        // 무용재는 항상, 가치재는 식량안보 비례
        let m = 1 - sec * (1 - raw);                                  // sec=0→풀생산, sec=1→raw(포만)
        if (FOOD_GLUT_SAT[r]) m *= (1 - _foodGlut);                   // ★곡물 과잉버퍼 직접 감산(잉여 농사→교역노동). K 불변이라 인구 안전.
        if (r === 'stone') m *= (1 - _stoneGlut);                     // ★돌 과잉버퍼 직접 감산(잉여 채석 낭비↓)
        return m;
      })
    : (_ => 1);
  // ★여유노동 측정 — 포만으로 감산된 생산능력의 비율(_idleFrac). 교역 동시성 상한에 씀(tickTradeV2).
  //   글럿(잉여 폭발)이면 스로틀↑ → 여유노동↑ → 교역 여력↑. 다 needed면 스로틀0 → 교역 자제.
  let _potA = 0, _actA = 0;
  const dailyProductionPotential = {};   // ★조인 전(잠재) 생산 — 부양력 prodK가 satiation(여가)에 안 속게(창고 많으면 생산 게을러도 부양력은 잠재력 기준)
  // ★건강 → 작업량(생산성) — 지난 틱 health로 실제 생산 스케일(±10% 상한). 잠재력(dailyProductionPotential)엔 미적용 → K 오염·아사 스파이럴 방지.
  const _hpm = (v.lastStats && typeof v.lastStats.health === 'number')
    ? Math.max(0.9, Math.min(1.1, 1 + (v.lastStats.health - 0.5) * HEALTH_PROD_W)) : 1;
  // ★production stat → 생산성(자재·설비 비축이 실제 생산력↑). 상한 클램프로 스노볼 방지. 잠재력엔 미적용(K 오염 방지).
  const _prodMul = (v.lastStats && typeof v.lastStats.production === 'number')
    ? 1 + Math.min(PROD_STAT_CAP, v.lastStats.production * PROD_STAT_W) : 1;
  // ★논 프리미엄 — 개간 논비중(v._paddyShare)이 높을수록 유효비옥도↑(벼 고수확). 공간 브리지 없으면 중립.
  const _paddyMul = (v._paddyShare == null) ? 1 : (1 + PADDY_PREMIUM * (v._paddyShare - PADDY_BASE));
  // ★어장·임연부 MSY 상한(랩 실측 land.fishSustain/forageSustain) → 어부·채집 총생산 min(raw, sustain). woodSustain(fuelK)과 동형 파이프 — 랩이 물리 어장/임연부 지속수확을 재어 econ 소득 천장을 물림(초과 시 비례 감산). sustain==null(어장/임연부 없음)이면 미적용=현행 보존(제로캡 전멸 방지).
  const _fishRaw = (v.counts.fisher || 0) * JOBS.fisher.base * (v.land.water || 0) * toolBoostShared;
  const _fishScale = (v.land.fishSustain != null && _fishRaw > 0) ? Math.min(1, v.land.fishSustain / _fishRaw) : 1;
  const _forageRaw = (v.counts.forager || 0) * JOBS.forager.base * JOBS.forager.landBoost(v);
  const _forageScale = (v.land.forageSustain != null && _forageRaw > 0) ? Math.min(1, v.land.forageSustain / _forageRaw) : 1;
  v._forageScale = _forageScale;   // ★저장(§9): 채집 한계가치(픽커·기회비용)가 임연부 MSY 포화를 보게 — 포화 임연부에 herb 가격이 채집꾼을 무한 유인(공유지 비극)하는 것 차단
  for (const npc of v.npcs) {
    if (npc._tradingUntil && npc._tradingUntil > day) continue;   // ★교역 원정 중 → 생산 안 함(기회비용 실현). 저숙련자라 손실 작음.
    const jdef = JOBS[npc.currentJob];
    const f = jdef.field;
    const skillLvl = npc.skills[f] || 0;   // ★신설 필드(tailoring) 구세계 NPC 호환 — undefined면 0(NaN 전염 방지)
    const toolBoost = jdef.toolDependent ? toolBoostShared : 1.0;
    // input 자원 부족 시 생산 0
    let inputMult = 1;
    for (const [inp, need] of Object.entries(jdef.inputs || {})) {
      if (v.storage[inp] < need) { inputMult = 0; break; }
    }
    const landBoost = jdef.landBoost(v);
    // skill 효과 — 만렙(10)이면 ×1.5. 분업/교역 의존 강화 위해 효율 ↓.
    const skillMul = 1 + skillLvl * 0.05;
    const jobScale = npc.currentJob === 'fisher' ? _fishScale : (npc.currentJob === 'forager' ? _forageScale : 1);   // ★어장/임연부 지속수확 상한(위 precompute) — 어부·채집만 스케일, 그 외 1
    const baseAmt = jdef.base * landBoost * skillMul * toolBoost * inputMult * jobScale
      * (f === 'farming' ? _paddyMul * (v._clearedFrac != null ? v._clearedFrac : 1) : 1);   // ★농사엔 논 프리미엄 × 개간완료율(공간 브리지) — 개간 안 된 밭은 소출 없음. 인구↑→개간목표↑→완료율 일시↓→소출·prodK 눌림→개간이 따라잡으면 회복 = 보즈럽 시차가 K에 실시간 반영(잠재 기준 slotK는 그대로 → 데드락 없음)
    // ★[포위 봉쇄 훅] 야외 직업(농부·어부·사냥·벌목·광부·채집)만 v._siegeOutMul(호스트 설치 시)로 감산 — 성 밖 노동이 끊김(잠행 노동 잔존).
    //   실내 직업(석공·대장장이·요리사 등)=불변. 잠재(dailyProductionPotential)엔 미적용(_laborMul과 동형 — K 오염·아사 스파이럴 방지). 미설치(undefined)=1(무해).
    const _siegeM = (v._siegeOutMul != null && SIEGE_OUTDOOR_JOBS[npc.currentJob]) ? v._siegeOutMul : 1;
    // ★[포로 노동 훅] 포로(npc.captive — 전쟁 레이어 부착)는 생산 기여 ×0.6. 미설치=×1(IEEE x*1===x — 궤적 바이트 보존).
    const _capM = npc.captive ? CAPTIVE_WORK_MUL : 1;

    // produceSpecial 분기 — 각 산출에 대해 세금 떼고 storage로
    const addProduce = (r, amt) => {
      const sm = satMul(r);
      _potA += amt; _actA += amt * sm;   // 여유노동 측정: 잠재(감산 전) vs 실제(감산 후)
      dailyProductionPotential[r] = (dailyProductionPotential[r] || 0) + amt;   // 잠재 생산(건강·포만 적용 전) — prodK용
      amt *= _hpm * _prodMul * sm * (v._laborMul || 1) * _siegeM * _capM;   // ★건강→작업량(±10%) × production stat × 포만 × 부상노동력(요양=일손 X·부상=효율↓ — 생활층서 계산) × 포위 봉쇄(야외 직업만, 미설치=1) × 포로 노동(captive만 0.6, 미설치=1)
      if (amt <= 0) return;
      if (r === 'food') v._grainToday = (v._grainToday || 0) + amt;   // ★오늘 곡물 실생산 → 볏짚 연료(아래 연료 블록)
      const tax = amt * TAX_RATE;
      v.storage[r] = (v.storage[r] || 0) + (amt - tax);
      v.treasury[r] = (v.treasury[r] || 0) + tax;
      dailyProduction[r] = (dailyProduction[r] || 0) + amt;   // ★NaN 가드(유령 감사서 발견): 버퍼 리셋은 v1 RESOURCES 키만 돌아 specialty 부산물(wheat 등)이 undefined+amt=NaN 영구 오염 — 흐름 진단·식량환산 편입의 지뢰였음
    };
    if (jdef.produceSpecial === 'forager') {
      if (baseAmt > 0) {
        const yields = foragerYieldsFor(v);
        const sumW = Object.values(yields).reduce((a, b) => a + b, 0) || 1;
        for (const [r, w] of Object.entries(yields)) {
          addProduce(r, baseAmt * (w / sumW));
        }
        // ★S1 돌=채집 자원(광부 아님): 강가/돌밭(land.stone) 채집꾼이 돌을 *주 산출*로 가져옴(식량 믹스와 별개 가산).
        //   계수 0.9 ≈ 옛 광부(base1.5×land.stone) 스케일에 근접 → 돌밭 마을은 채집꾼만으로 돌 풍족(병목 없음).
        //   채집 스킬(foraging)이 효율을 높이고, 임연부 MSY(_forageScale)에 연동(공유지 비극 방지). 돌은 흔하니 누구나(스킬↑) 조달.
        const stoneYield = (v.land.stone || 0) * skillMul * _forageScale * 0.9;
        if (stoneYield > 0) addProduce('stone', stoneYield);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'cook') {
      if (v.storage.food >= 1) {
        const availSides = COOK_SIDE_INGREDIENTS.filter(r => v.storage[r] >= 0.5);
        const usedSides = availSides.slice(0, 5);
        const variety = usedSides.length;
        const efficiency = 1.0 + 0.04 * variety;
        const cooked = jdef.base * skillMul * toolBoost * efficiency;
        v.storage.food -= 1;
        for (const r of usedSides) v.storage[r] -= 0.5;
        addProduce('cooked_food', cooked);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'mason') {
      // ★S2 석공(masonry) — 석기(간돌 도구) 전담 + 마제석검(돌 무기, 전사용). 도구는 자본재라 *우선* 제작,
      //   도구 충분하면 무기 수요(전사) 있을 때 마제석검 제작. ★활은 석공 소관 아님 — 사냥꾼 자가제작(archery)로 이관(활=목재·뼈·힘줄·깃 재료라 석기 장인 부적합, 아래 사냥꾼 자가 안전망 참조).
      // ★S3 레벨=품질: 도구·석검 품질 = 재료등급 × 스킬(masonry). 무기는 노동 3배(WEAPON_LABOR_MULT)라 산출↓(희소).
      const amt = jdef.base * skillMul;
      const _stCost = 0.2 * _toolTaper;
      const _qSkill = 1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (skillLvl / 10);   // 스킬 기여(0.4~1.0)
      // ★청동 희소성: 전사 근접무장은 *근접검 재고*로 판정(활 제외). swordStock ≈ weapon × 근접검비중(_swordFrac) → 활이 pool을 채워도 전사가 마제석검을 받음.
      const _bladeUsers = v.counts.warrior || 0;
      const _swordStock = (v.storage.weapon || 0) * (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT);
      // ★마제석검으로 *병기고*(armory)를 채움 — 전사 실수요(×BUFFER)를 넘어 마을 유사시 대비·교역 재고까지.
      //   ★청동 자격 마을도 마제석검 topup 허용: 대장장이 청동검은 tin(희소)에 묶여 병기고를 다 못 채움 → 석공이 *나머지*를 마제석검으로.
      //   → 청동은 tin 가용분까지만(자연 상한), 병기고 잔여는 석기 → 청동 자격 마을에서도 청동은 소수·석기 다수(주석 병목이 청동 비중을 결정). 홍수 시드서도 청동 폭주 억제.
      const _armoryTarget = (v.npcs.length || 0) * MELEE_ARMORY_PC;
      const _bronzeArmoryCap = _armoryTarget * BRONZE_ARMORY_FRAC;   // 청동 병기고 한도(나머지는 석기 몫)
      const _meleeUrgent = _bladeUsers > 0 && _swordStock < _bladeUsers * MELEE_COV_BUFFER;   // 전사 무장 결손(긴급)
      // ★청동 우선권 + 비중 상한: 대장장이 청동검은 병기고의 BRONZE_ARMORY_FRAC까지. 그 한도 도달 또는 tin 고갈이면 석공이 *나머지*를 마제석검으로.
      //   → 청동마을도 석기 다수(청동은 한도까지만). 무산지 마을은 항상 석공 마제석검(청동 불가).
      const _bronzeNow = _bronzeCapable(v) && _swordStock < _bronzeArmoryCap && (v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12;   // 지금 청동 제작 몫 남음(한도·tin)
      const _needStoneSword = _meleeUrgent && !_bronzeNow && (v.storage.stone || 0) >= 0.5;   // 긴급 무장인데 청동 몫 없음 → 마제석검(방어 최우선, 식량무관)
      // ★병기고(비긴급 비축)는 *식량 안보(secF 충분)일 때만* — 척박·기근 마을이 병기고 비축에 노동을 돌려 식량생산이 밀려 쇠퇴하는 것 방지(랩 취약 시드 인구 유지).
      const _armoryShort = _secF > MELEE_ARMORY_SECF && _swordStock < _armoryTarget * MELEE_ARMORY_HYST && !_bronzeNow && (v.storage.stone || 0) >= 0.5;   // 병기고 결손 + 청동 몫 없음(한도·tin 고갈) + 식량안보 → 석기 backfill
      const wAmt = amt * WEAPON_LABOR_MULT;   // ★무기 노동 3배 → 산출 1/3
      if (_needStoneSword) {
        // (0) 마제석검 우선 — 전사 근접무장 결손(무산지 마을 주력 무기).
        v.storage.stone -= 0.5;   // ★마제석검(간돌 검) — 청동 자격 없는 마을의 주력 자급 무기(저품질, 전사용)
        v._stoneWeaponMade = (v._stoneWeaponMade || 0) + wAmt;
        v._swordMadeToday = (v._swordMadeToday || 0) + wAmt;   // ★근접검 비중 EMA 입력(검 제작)
        const wq = WEAP_Q_STONE * _qSkill;   // 마제석검 품질 = 석재등급(0.5) × 스킬
        v._weapQnum = (v._weapQnum || 0) + wq * wAmt; v._weapQden = (v._weapQden || 0) + wAmt;
        addProduce('weapon', wAmt); workNPC(npc);
      } else if (_toolTaper > 0 && (v.storage.stone || 0) >= _stCost) {
        // (a) 석기 도구 — 커버리지 부족분(e2 taper). _toolTaper>0이고 돌 있으면 제작.
        const tAmt = amt * _toolTaper;
        v.storage.stone -= _stCost; v._stoneToolMade = (v._stoneToolMade || 0) + tAmt;
        // ★S3 도구 품질 = 막석기(TOOL_Q_BASE) + 숙련폭(TOOL_Q_SPAN×skill/10) → 막석기 1.25× ~ 명장석기 1.55×.
        const tq = TOOL_Q_BASE + TOOL_Q_SPAN * (skillLvl / 10);
        v._toolQnum = (v._toolQnum || 0) + tq * tAmt; v._toolQden = (v._toolQden || 0) + tAmt;
        addProduce('tool', tAmt);
        // ★★[재민 지시 "무기 축 복구"] 도구가 포화하면 **남는 손으로 검을 간다.**
        //   이 else-if 사슬이 무기 축을 죽인 진범이었다. 무기 분기(아래 a2)로 넘어가려면
        //   _toolTaper 가 0 이어야 하는데, taper 는 도구 커버리지가 3.5 를 넘어야 0 이 된다.
        //   그런데 그 감산의 설계 자체가 "재고를 포화선 2.5 부근에 수렴시키는" 것이라 3.5 에 닿을 일이 없다.
        //   실측: 커버리지 2.92 에서 수렴 · taper 0.43 · **석공 노동의 98.7%가 도구**(도구 17,359 vs 검 235).
        //   도구는 이미 넘치는데(재고 4,776 / 목표 1,780) 계속 도구만 만들고, 남는 42% 노동은 그냥 놀았다.
        //   ⇒ taper 로 줄인 만큼(1−taper)을 병기고에 돌린다. 조건은 a2 와 동일하게 둔다
        //     (식량안보 · 병기고 결손 · 청동 마을 양보 · 돌 보유).
        const _spare = 1 - _toolTaper;
        if (_spare > 0.02 && (_armoryShort || _needStoneSword) && (v.storage.stone || 0) >= 0.5 * _spare) {
          const sAmt = wAmt * _spare;
          v.storage.stone -= 0.5 * _spare;
          v._stoneWeaponMade = (v._stoneWeaponMade || 0) + sAmt;
          v._swordMadeToday = (v._swordMadeToday || 0) + sAmt;
          const wq2 = WEAP_Q_STONE * _qSkill;
          v._weapQnum = (v._weapQnum || 0) + wq2 * sAmt; v._weapQden = (v._weapQden || 0) + sAmt;
          addProduce('weapon', sAmt);
        }
        workNPC(npc);
      } else if (_armoryShort) {
        // (a2) 도구 포화 → 마제석검으로 마을 병기고 축적(무산지 마을 주력 무기 재고). 청동 자격 마을은 대장장이 청동검이 담당(여기 미해당).
        v.storage.stone -= 0.5;
        v._stoneWeaponMade = (v._stoneWeaponMade || 0) + wAmt;
        v._swordMadeToday = (v._swordMadeToday || 0) + wAmt;
        const wq = WEAP_Q_STONE * _qSkill;
        v._weapQnum = (v._weapQnum || 0) + wq * wAmt; v._weapQden = (v._weapQden || 0) + wAmt;
        addProduce('weapon', wAmt); workNPC(npc);
      } else {
        // (b) 도구·병기고 다 충분(또는 청동 자격) → 여가(포만). 청동 자격 마을 무기는 대장장이 청동검이 담당.
      }
    } else if (jdef.produceSpecial === 'smith') {
      // ★S2 대장장이(smithing) = 청동·철 *무기* 전용(도구 제작 폐지 → 석공). 청동검(구리+주석) 우선 → 철검(희소).
      // ★S3 레벨=품질: 무기 공격력·내구 = 재료등급(청동>철) × 스킬(smithing). 신규 티어 해금 아님. 무기 노동 3배(산출↓=희소).
      let amt = jdef.base * skillMul * WEAPON_LABOR_MULT;   // ★무기 노동 3배 → 산출 1/3
      const _qSkill = 1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (skillLvl / 10);   // 스킬 기여(0.4~1.0)
      // ★청동 병기고 비중 상한 — 청동은 병기고의 BRONZE_ARMORY_FRAC까지만(나머지 석기). swordStock이 그 한도 미만일 때만 청동 제작 → 청동마을도 석기 다수·청동 소수(엘리트).
      //   ★식량 안보 게이트: 잘 먹는 마을만 병기고까지 청동 확충, 취약 마을은 전사 실수요(BUFFER)까지만(식량·생존 우선).
      const _smSwordStock = (v.storage.weapon || 0) * (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT);
      const _bronzeArmoryCap = (_secF > MELEE_ARMORY_SECF)
        ? (v.npcs.length || 0) * MELEE_ARMORY_PC * BRONZE_ARMORY_FRAC
        : Math.max(2, (v.counts.warrior || 0) * MELEE_COV_BUFFER);   // 취약 마을 = 전사 커버리지만
      // ★청동 희소성: 청동검은 *청동 경제 자격* 마을(주석 산지·교역 허브)만 + 병기고 청동 한도 미만일 때. 흘러든 트레이스 주석뿐이거나 청동 한도 도달 마을은 석공 마제석검.
      // ★★[재민 확정] 청동검/철검/석검의 **이산 분기 3개를 연속 곡선 하나로** 바꾼다.
      //   대장장이는 마을 재고 비율대로 배합한다 → 주석 넉넉하면 좋은 검, 조금이면 무른 검, 없으면 순동.
      //   품질은 specialty.alloyGrade 가 금속학에서 계산한다(고용 강화·제2상·공융).
      //   ⇒ _bronzeCapable 문턱도, 순동검 분기도 따로 필요 없다.
      // ★★[재민 확정] **제련이 먼저다.** 광부는 원석만 캐 오고, 그걸 금속으로 바꾸는 건 대장장이다.
      //   이게 대장장이에게 무기 수요와 무관한 **상시 일감**을 준다 — 광석이 있으면 할 일이 있다.
      //   고증: 청동기 제련은 노(爐)와 연료가 필요해 마을에서 했고, 광부의 일이 아니었다.
      //   ※무기 주조보다 우선한다. 금속이 없으면 무기도 못 만드니 순서가 자연히 그렇다.
      // ★★[끊김① 해소 — 회부_v2배선_재측정 ① 의 (가), 재민 "쭉 구현해봐" 일괄 2026-08-01]
      //   제련은 하루를 통째로 먹지 않는다. 전에는 `제련 성공 → return` 이라 광부가 매일 원석을 대는
      //   마을의 대장장이가 **영원히** 제련만 했다(임업2: 300일 무기 0자루 → 새 지도에선 800일 0자루).
      //   이제 제련에 쓴 노동 **비율만큼만** 하루에서 차감하고, 남은 노동으로 주조를 진행한다
      //   (석공 _toolTaper 와 같은 관용). 원석이 넘치는 날은 여전히 하루를 다 제련에 쓴다.
      const _smeltCap = jdef.base * skillMul * SMELT_PER_LABOR;   // 하루 전부를 쓰면 소화 가능한 양
      const _smelted = _trySmelt(v, jdef.base * skillMul);
      const _smeltFrac = _smeltCap > 0 ? Math.min(1, _smelted / _smeltCap) : 0;
      if (_smeltFrac >= 0.999) { workNPC(npc); return; }   // 원석이 넘쳐 오늘 하루를 다 썼다
      if (_smeltFrac > 0) amt *= (1 - _smeltFrac);          // 남은 노동으로만 주조

      const _melt = _alloyMelt(v);
      if (_melt && _melt.castF > 0) amt *= _melt.castF;   // ★주조성이 산출량을 정한다(위 _alloyMelt 주석)
      if (_melt && _smSwordStock < _bronzeArmoryCap) {
        for (const m in _melt.take) { v.storage[m] -= _melt.take[m]; _cons(v, m, _melt.take[m]); }
        v._cuWeapUsed = (v._cuWeapUsed || 0) + (_melt.take.copper || 0);   // (계측 전용)
        v._bronzeWeaponMade = (v._bronzeWeaponMade || 0) + amt * _melt.bronzeness;
        v._alloyGrade = _melt.grade;                       // (계측) 이 마을이 만든 합금의 등급
        v._swordMadeToday = (v._swordMadeToday || 0) + amt;
        const wq = Math.min(1.2, _melt.grade) * WEAP_Q_BRONZE * _qSkill;   // ★배합이 품질을 정한다
        v._weapQnum = (v._weapQnum || 0) + wq * amt; v._weapQden = (v._weapQden || 0) + amt;
        addProduce('weapon', amt);
        workNPC(npc);
      } else if (_ironWeaponCapable(v) && (v.storage.iron || 0) >= 0.4 && (v.storage.stone || 0) >= 0.2) {
        v.storage.iron -= 0.4; v.storage.stone -= 0.2;   // ★철검=최희소(청동 자격 없고 철이 *풍부*할 때만). 트레이스 축적으론 미발동 → 석공 마제석검.
        _cons(v, 'iron', 0.4); _cons(v, 'stone', 0.2);   // ★flow-EMA
        v._ironWeaponMade = (v._ironWeaponMade || 0) + amt;
        v._swordMadeToday = (v._swordMadeToday || 0) + amt;   // ★근접검 비중 EMA(철검=근접)
        const wq = WEAP_Q_IRON * _qSkill;   // 철검 품질 = 철등급(0.85) × 스킬
        v._weapQnum = (v._weapQnum || 0) + wq * amt; v._weapQden = (v._weapQden || 0) + amt;
        addProduce('weapon', amt);
        workNPC(npc);
      }
      // 청동/철 자격 없으면 오늘 제작 없음(돌칼은 대장장이가 안 만듦 — 석공 담당). 교역으로 청동 자격 갖추면 재개.
    } else if (jdef.produceSpecial === 'weaponsmith') {
      // ★S2 weaponsmith = 대장장이(smith)로 통합·폐지(capacity 0 → 도달 불가). 아래는 잔존 안전코드(만약 남은 weaponsmith가 있으면 청동검만).
      const amt = jdef.base * skillMul;
      if ((v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12) {
        v.storage.copper -= 0.3; v.storage.tin -= 0.12; _cons(v, 'copper', 0.3); _cons(v, 'tin', 0.12);   // ★flow-EMA
        v._bronzeWeaponMade = (v._bronzeWeaponMade || 0) + amt;
        addProduce('weapon', amt);
        workNPC(npc);
      } else if ((v.storage.iron || 0) >= 0.4 && (v.storage.stone || 0) >= 0.2) {
        v.storage.iron -= 0.4; v.storage.stone -= 0.2;   // ★철검=희소(청동 재료 없을 때만)
        addProduce('weapon', amt);
        workNPC(npc);
      } else if ((v.storage.stone || 0) >= 0.5) {
        v.storage.stone -= 0.5;
        addProduce('weapon', amt);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'tailor') {
      // ★의복(2026-07-12): 재봉 — 옷감을 보온 가중·재고 비례로 소비(대체 투입: 모피 있으면 모피, 없으면 삼베).
      //   절반이라도 있으면 부분 제작(frac) — 옷감 반입이 끊긴 마을은 산출이 자연 감소(게이트 절벽 없음).
      const amt = jdef.base * skillMul;
      const needW = amt * CLOTH_MAT_WARMTH_PER;
      let haveW = 0; for (const m in CLOTH_MATS) haveW += (v.storage[m] || 0) * CLOTH_MATS[m];
      if (haveW >= needW * 0.5) {
        const frac = Math.min(1, haveW / needW);
        let _qNum = 0, _qDen = 0;   // ★의복 품질: 소비 재료 믹스 등급(무게 가중)
        for (const m in CLOTH_MATS) {
          const take = (v.storage[m] || 0) * (needW * frac / haveW);
          if (take > 0) { v.storage[m] = Math.max(0, (v.storage[m] || 0) - take); _cons(v, m, take); _qNum += take * (CLOTH_Q_MAT[m] || CLOTH_Q_BASE); _qDen += take; }   // ★flow-EMA(옷감 실수요) + 품질 등급 누적
        }
        // ★의복 품질(2026-07-13): 재봉 숙련 × 재료 믹스 등급 → 생산분 품질 누적(EMA는 tickVillage finalize·_weapQ 동형)
        const _cqSkill = 1 - CLOTH_Q_SKILL_SPAN + CLOTH_Q_SKILL_SPAN * ((npc.skills.tailoring || 0) / 10);
        const _made = amt * frac;
        v._clothQnum = (v._clothQnum || 0) + _cqSkill * (_qDen > 0 ? _qNum / _qDen : CLOTH_Q_BASE) * _made;
        v._clothQden = (v._clothQden || 0) + _made;
        addProduce('clothes', _made);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'miner') {
      // ★S1 광부=금속·특수석재 전담(돌은 안 캠): 광부는 금속광맥(land.ore)에서 광석+금속(구리·주석·철)만 캔다.
      //   돌(stone)은 채집(foraging)으로 이관 — 돌은 흔한 채집자원이라 어느 마을이든 강가/돌밭에서 조달(병목 없음).
      //   광맥 없는 마을은 광부를 둘 이유가 없다(landBoost=land.ore → 광맥 마을만 광부 매력). (탐사꾼 통합 유지)
      const toolB = jdef.toolDependent ? toolBoostShared : 1.0;
      // ★S2 금속 글럿 감산: 구리 과잉이면 광부가 광맥 채굴 자체를 줄임(무의미한 금속 축적 방지 = 여가). 광석·금속·부산물 공통 배율.
      // ★★[재민 확정] 광부의 감정(鑑定) — "레벨에 따라 미리 버릴지 가져올지 선택".
      //   플레이어 쪽엔 있던 층(문구 → 사람이 판단 → 선광에서 드러남)이 NPC 엔 통째로 없었다.
      //   한 짐의 기대값으로 넣는다(specialty.mineAssayMult): TPR 이 오르면 좋은 광석을 안 버리고(FN↓),
      //   TNR 이 오르면 맥석을 안 지고 온다(FP↓ = 짐칸 절약). 레벨 5 를 1.0 으로 정규화 — 총량 중립.
      const _assay = (v.land.oreP > 0)
        ? SPEC.mineAssayMult(skillLvl, v.land.oreP, SPEC.mineTripMinutes(v.land.oreDist || 0))
        : 1;
      const oAmt = jdef.base * (v.land.ore || 0) * skillMul * toolB * (1 - _metalGlut) * _assay;
      if (oAmt > 0) {
        // ★★[재민 확정] 광부는 이제 **원석만** 낸다. 금속은 대장장이가 제련해야 나온다.
        //   전에는 광부가 광석과 금속을 **동시에** 냈다 — 제련 단계가 통째로 비어 있었고,
        //   그래서 ore 는 산출만 되고 아무 데도 안 쓰이는 죽은 재화였다(교역재로만 쌓였다).
        //   이제 ore 가 제련 원료가 되고, 대장장이에겐 무기 수요와 **무관한 상시 일감**이 생긴다.
        // ★[2026-08-02b] 캔 원석도 **조성을 싣는다** — 수입 원석과 섞이면 가중 평균이 된다.
        //   폴드는 재고 가산 **전**(기존 재고량이 가중치). 실제 반영량은 세금·감산을 거치므로
        //   addProduce 와 같은 배수를 쓸 수 없다 — 근사로 oAmt 를 쓴다(비율만 쓰는 값이라 무해).
        if (v.land && v.land.oreMix) foldOreMix(v, v.storage.ore || 0, oAmt, v.land.oreMix);
        addProduce('ore', oAmt);
        // ★청동 희소성 복원: tin을 부산물에서 *제거*. 종전 { copper:0.22, tin:0.11, ... } → tin은 전 마을 자동산출 = 청동 보편재의 근본 원인.
        //   이제 tin은 산지(land.tin>0)만 아래 별도 채굴. copper/iron/장식재는 종전대로 모든 광맥 부산물(청동기: 구리는 흔하되 주석이 병목).
        // ★★[재민 확정] 고정 dict 폐기. 지도의 **광종 구성**이 그대로 산출이 된다.
        //   전에는 금맥 옆 마을이나 철맥 옆 마을이나 {copper .22, iron .03, …} 로 똑같이 나왔다 —
        //   지도의 광종 배분이 경제에 **전혀 안 닿았다**. 이제 닿는다.
        //   oreMix 가 없는 호출부(랩·CLI)는 옛 dict 로 폴백해 기존 거동을 보존한다.
        //   ※oreMix 가 **없는** 호출부(랩·CLI)는 제련 층이 없던 시절 그대로 금속을 바로 낸다 —
        //     기존 회귀 기준선을 보존하기 위해서다. 지도가 있는 본 게임만 제련을 거친다.
        if (!(v.land && v.land.oreMix)) {
          // ★[2026-08-01] 폴백 dict 도 시대를 탄다 — v2 5시드 회귀에서 여기서 나온 철 840 이
          //   쓸 데 없이 쌓였다(청동기 NPC 는 철을 못 다룬다). 시대가 모르는 금속은 뺀다.
          const bp0 = { copper: 0.22, iron: 0.03, silver: 0.05, gold: 0.02, gem: 0.01 };
          const bp = {}; for (const _k in bp0) { if (_ERA_METAL(_k) && !_eraKnows(_k)) continue; bp[_k] = bp0[_k]; }
          for (const r in bp) addProduce(r, oAmt * bp[r]);
        }
        addProduce('salt', oAmt * 0.05); addProduce('clay', oAmt * 0.08);   // ★소금=완충 교역재(광범위 수요 utility 0.8). 제거 시 교역균형 흔들려 취약 시드 boom-bust. 고증(소금길). 이제 광맥 채굴 부산물로 산출(돌 채석과 분리).
      }
      // ★청동 희소성: 주석 채굴 — *산지 마을(land.tin>0)만*. 대부분 마을은 land.tin=0 → tin 산출 0 → 청동 불가(석기 무장).
      //   주석(cassiterite)은 자체 광상 → land.ore와 독립(obsidian/jade 동형: 부존만으로 채굴). 산지 마을이 청동검을 만들고 수출(교역 특산).
      // ★산출을 *마을 규모·광부 수 무관* 정량(광량 = land.tin이 결정)으로 — 대형/소형 산지 마을 간 tin 산출 편차(→청동/명 시드 변동)를 차단.
      //   첫 광부가 마을 일일 정량(TIN_DEPOSIT_YIELD_FLAT × land.tin)을 1회 산출(이후 광부는 tin 안 캠 — 광석·구리는 계속). _tinGlut로 과축적 시 감산.
      //   ※oreMix 가 있는 마을(본 게임)은 주석도 **제련에서** 나온다 — 여기서 또 내면 이중 산출이다.
      if (!(v.land && v.land.oreMix) && (v.land.tin || 0) > 0 && (v._tinToday || 0) === 0) {
        const tinAmt = TIN_DEPOSIT_YIELD_FLAT * (v.land.tin || 0) * (1 - _tinGlut);
        if (tinAmt > 0) { addProduce('tin', tinAmt); v._tinMined = (v._tinMined || 0) + tinAmt; v._tinToday = (v._tinToday || 0) + tinAmt; }
      }
      // ★S5 특수 산지 채굴 — 흑요석(화산지대)·옥(옥 산지). 광부가 광석과 별개로 채굴(비교우위 교역재).
      //   흑요석=예리(화살촉·소형칼날 → 사냥·방어 보조), 옥=위세품. 채굴량 ∝ land 부존. 부존 0이면 산출 0(대부분 마을).
      const obAmt = jdef.base * (v.land.obsidian || 0) * skillMul * toolB * (1 - _obsGlut);
      if (obAmt > 0) addProduce('obsidian', obAmt);
      const jaAmt = jdef.base * (v.land.jade || 0) * skillMul * toolB * (1 - _jadeGlut);
      if (jaAmt > 0) addProduce('jade', jaAmt);
      if (oAmt > 0 || obAmt > 0 || jaAmt > 0) workNPC(npc);
    } else if (jdef.output && baseAmt > 0) {
      // ★[재민 지시 "직접 해결"] 수요-캡(jdef.stockCap) — 재고가 캡 이상이면 **산출도 투입도** 건너뛴다.
      //   투입까지 멈추는 게 요점: 아무도 안 쓸 갑옷에 stone·hide·ore를 계속 태우던 게 결함이었다.
      //   (노동은 놀지만 job-switch 재배치 경로가 곧 데려간다 — mason taper와 달리 이 직군엔 잉여 전용처가 없다.)
      if (jdef.stockCap && (v.storage[jdef.output] || 0) >= jdef.stockCap(v)) { continue; }
      for (const [inp, need] of Object.entries(jdef.inputs || {})) {
        _cons(v, inp, Math.min(v.storage[inp] || 0, need));   // ★flow-EMA(실차감분)
        v.storage[inp] = Math.max(0, v.storage[inp] - need);
      }
      // ★유령 박멸(§9): 보조 투입(aux) — 있으면 소비, 없어도 제작 성립(inputs와 달리 게이트 아님 — 마감·안감재).
      for (const [inp, per] of Object.entries(jdef.aux || {})) {
        const _t = Math.min(v.storage[inp] || 0, per);
        if (_t > 0) { v.storage[inp] -= _t; _cons(v, inp, _t); }   // ★flow-EMA
      }
      addProduce(jdef.output, baseAmt);
      if (jdef.byproduct) {
        for (const [r, rate] of Object.entries(jdef.byproduct)) {
          // ★모시(ramie) 수요-캡 공급(2026-07-13, 사용자 결정 — 교역 무교란): 재고가 수요(flowT=소비EMA×30, +부트스트랩 floor N×RAMIE_BOOT_PC) 이상이면 산출 스킵.
          //   '짜는 만큼만 짠다' — 잉여 0 → satMul taper 없음 → 유휴노동(_idleFrac) 인플레 0 → 캐러밴 폭증·식량드레인 없음.
          //   고정 byproduct(잉여→taper→교역폭발)가 신선 짝비교서 505 knife-edge 605→19 붕괴시킨 진범(rate 0.01·util 0.05로도)이라 공급 자체를 수요에 묶음.
          //   ★addProduce를 *스킵*해야 _potA(잠재생산) 미오염 — satMul taper만으론 잠재가 idle로 잡혀 부족. 삼베(hemp)·곡물은 기존 경로 불변(의류 사슬 재튜닝 금지 준수).
          if (r === 'ramie') {
            if (v.npcs.length < RAMIE_MIN_POP) continue;   // 미성숙 마을(개척기) 모시 안 짬 — 콜로니 취약 궤적 무교란
            if ((v.storage.ramie || 0) >= Math.max(v.npcs.length * RAMIE_BOOT_PC, ((v._consEMA || {}).ramie || 0) * 30)) continue;   // 수요 충족 → 스킵(잉여 0)
          }
          addProduce(r, baseAmt * rate);
        }
      }
      workNPC(npc);
    }
  }
  // ★여유노동 비율 저장 — 교역 동시성 상한(tickTradeV2 spareCap)에서 사용.
  v._idleFrac = _potA > 0 ? Math.max(0, 1 - _actA / _potA) : 0;

  // ★S3 막석기 자급 안전망 — 도구(석기)가 치명적으로 부족(커버리지<SELF_TOOL_COV)하면 도구의존 노동자가 급할 때 막석기를 손수 자급.
  //   "농부는 도구만 급할 때 자급"(스펙 8) — 무기는 자급 안 함(석공·대장장이 전담). 낮은 노동(0.02/인), 돌 있을 때만. 정교 석기는 석공.
  if (toolDeps > 0) {
    const _tcov = ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) / toolDeps;
    if (_tcov < SELF_TOOL_COV && (v.storage.stone || 0) >= 0.2) {
      const _self = Math.min(toolDeps * SELF_TOOL_RATE, (v.storage.stone || 0) / 0.2 * 0.2);
      if (_self > 0) {
        v.storage.stone -= _self * 0.2 / 0.4;   // 막석기 재료비(석공보다 비효율 — 막 깬 돌)
        _cons(v, 'stone', _self * 0.2 / 0.4);   // ★flow-EMA(자급 인출)
        v.storage.tool = (v.storage.tool || 0) + _self;
        v._selfToolMade = (v._selfToolMade || 0) + _self;
        v._toolQnum = (v._toolQnum || 0) + SELF_TOOL_Q * _self; v._toolQden = (v._toolQden || 0) + _self;   // 막석기 저품질
      }
    }
  }

  // ★활 사냥꾼 자가제작 — 활은 사냥꾼 본인 장비(목재 활대 + 뼈·힘줄·깃·수지). 석공(석기 장인) 소관 아님 → 사냥꾼이 archery 숙련으로 손수 제작(막석기 자급과 동형 안전망).
  //   활 재고(=사냥꾼용 무기)가 커버리지(SELF_BOW_COV) 미만이면 자급. 산출률 = 사냥꾼 수 비례(저노동, 무기 노동 3배는 저율에 반영). 재료는 목재만 게이트(뼈·깃·수지·힘줄은 보조 — 있으면 품질↑).
  //   품질: 활 무기품질(_weapQ)에 석재등급 저티어로 기여 + 활 데미지 배수(_bowQ)는 bone/obsidian 투입 EMA(아래 EMA 블록). archery 숙련이 높을수록 마감 품질↑.
  {
    const _huntN = v.counts.hunter || 0;
    // ★활 자급 판정 = *활 재고*(근접검 제외). bowStock ≈ weapon × (1 − 근접검비중). 안 나누면 수입/자급 검이 pool을 채워 사냥꾼이 활을 못 만듦(사냥 무장해제).
    const _bowStock = (v.storage.weapon || 0) * (1 - (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT));
    const _bowCov = _huntN > 0 ? _bowStock / _huntN : 99;
    if (_huntN > 0 && _bowCov < SELF_BOW_COV && (v.storage.wood || 0) >= SELF_BOW_WOOD) {
      // 사냥꾼 최고 archery 숙련 → 마감 품질(막석기 자급과 달리 전문 사냥꾼이 자기 활을 만듦: 숙련폭 반영).
      let _maxArch = 0; for (const n of v.npcs) if (n.currentJob === 'hunter') { const s = n.skills.archery || 0; if (s > _maxArch) _maxArch = s; }
      const _qSkill = 1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (_maxArch / 10);   // 스킬 기여(0.4~1.0)
      // 산출: 사냥꾼 수 × 저율, 단 목재 재고로 상한(활대 1자루 0.6목재).
      const _bAmt = Math.min(_huntN * SELF_BOW_RATE, (v.storage.wood || 0) / SELF_BOW_WOOD);
      if (_bAmt > 0) {
        v.storage.wood -= _bAmt * SELF_BOW_WOOD;   // 목재 활대
        v.storage.weapon = (v.storage.weapon || 0) + _bAmt;
        v._bowMade = (v._bowMade || 0) + _bAmt;   // (계측) 사냥꾼 자가 활 누적
        v._bowMadeToday = (v._bowMadeToday || 0) + _bAmt;   // ★근접검 비중 EMA 입력(활 제작 → 비중↓)
        const _wq = BOW_Q_STONE * _qSkill;   // 활 무기품질 = 저티어 재료등급 × archery 숙련
        v._weapQnum = (v._weapQnum || 0) + _wq * _bAmt; v._weapQden = (v._weapQden || 0) + _bAmt;
        // 활 데미지 품질(_bowQ) 투입: bone(활대 심·힘줄 백킹) + obsidian(예리 화살촉) — 있으면 소비, 품질 EMA에 기여(아래).
        const _bNeed = _bAmt * BOW_BONE_PER_WEAPON;
        const _bIn = Math.min(v.storage.bone || 0, _bNeed);
        if (_bIn > 0) { v.storage.bone -= _bIn; v._boneUsed = (v._boneUsed || 0) + _bIn; _cons(v, 'bone', _bIn); }   // ★flow-EMA
        v._bowIn = (v._bowIn || 0) + _bIn; v._bowNeed = (v._bowNeed || 0) + _bNeed;
        // ★흑요석 화살촉(수정3) — 예리한 화살촉 보조 투입. 산지 마을은 obsidian 재고가 있어 활/화살 품질↑(bone과 합산 투입률).
        const _obNeed = _bAmt * BOW_OBSIDIAN_PER_WEAPON;
        const _obIn = Math.min(v.storage.obsidian || 0, _obNeed);
        if (_obIn > 0) { v.storage.obsidian -= _obIn; v._obsUsed = (v._obsUsed || 0) + _obIn; }
        v._bowObIn = (v._bowObIn || 0) + _obIn; v._bowObNeed = (v._bowObNeed || 0) + _obNeed;
        // 마감 보조재(깃·수지·힘줄) — 있으면 소비(게이트 아님).
        for (const _fx of [['feather', 0.2], ['resin', 0.1], ['hemp', 0.1]]) {
          const _fi = Math.min(v.storage[_fx[0]] || 0, _bAmt * _fx[1]);
          if (_fi > 0) v.storage[_fx[0]] -= _fi;
        }
      }
    }
  }

  // 1.5) 영토 확장 시도 — ★셀 단위: 매일(EXPAND_CHECK_INTERVAL=1) 최대 EXPAND_CELLS_PER_DAY셀 구매
  if (day % EXPAND_CHECK_INTERVAL === 0) {
    tryExpandTerritory(v, day);
  }

  // 2) 소비
  const N = v.npcs.length;
  const foodNeed = N * DAILY_FOOD_CONSUMPTION;
  const foodGap = consumeFood(v, foodNeed);  // 남으면 굶주림
  // 도구 마모 — tool dependent NPC만
  const toolWear = v.npcs.reduce((sum, n) => {
    const jd = JOBS[n.currentJob];
    if (!jd.toolDependent) return sum;
    return sum + (n.currentJob === 'farmer'
      ? DAILY_TOOL_WEAR_PER_FARMER : DAILY_TOOL_WEAR_PER_OTHER);
  }, 0);
  v.storage.tool = Math.max(0, v.storage.tool - toolWear);
  // ★약재 일상 복용 소모(§9 2차) — 인구 비례 흐름(재고 내에서만·부족해도 페널티 없음, 건강 보너스만 사라짐). _herbUsed = 유통 진단 누적.
  if (v.storage.herb > 0) {
    const _hTake = Math.min(v.storage.herb, N * HERB_DAILY_PC);
    v.storage.herb -= _hTake; v._herbUsed = (v._herbUsed || 0) + _hTake; _cons(v, 'herb', _hTake);   // ★flow-EMA
  }
  // ★제례·부장 봉헌 v2(2026-07-12 — 위세재 반복 실수요): 위세재는 의례로 '소비 파괴'된다(매납 청동검·부장 옥 고증).
  //   v1 실패의 교훈(A/B: flat 요율이 빈곤 마을 자신의 수출 자본까지 태워 s8 16/3): ①식량 여유(_secF) 비례 —
  //   잉여 사회만 성대히 묻는다(기근 마을 봉헌 0) ②수출 유보(N×RITE_KEEP_PC) 초과분만 — 교역 자본 불가침.
  //   효과: 부유 마을이 위세재를 태워 재수입 → 산지 마을 반복 수출 소득(수요는 부유층에서, 소득은 산지로).
  {
    const _rSec = Math.max(0, Math.min(1, (totalFoodEquivalent(v) / Math.max(1, N) - 40) / 40));   // 식량 40~80일 램프(생산 포만 secF 동형)
    if (_rSec > 0) {
      for (const _rr in RITE_PC) {
        const _avail = Math.max(0, (v.storage[_rr] || 0) - N * RITE_KEEP_PC);
        const _rTake = Math.min(_avail, N * RITE_PC[_rr] * _rSec);
        if (_rTake > 0) { v.storage[_rr] -= _rTake; v._riteUsed = (v._riteUsed || 0) + _rTake; _cons(v, _rr, _rTake); }   // ★flow-EMA(봉헌 실수요)
      }
      // ★봉헌검(2026-07-13 — 호전 마을 매납 청동검·고증: 청동기 의례적 동검 부장/매납): 잉여(전사+버퍼 초과) 청동검을 의례로 묻음.
      //   호전 마을만(_warlikeMult>1) — 무기 잉여 생산이 offset이라 병기고 드레인(s8 붕괴) 회피. 식량여유(_rSec)·잉여만 = 봉헌 v2 동형 안전 게이트.
      if (_warlikeMult(v) > 1) {
        const _wSurplus = (v.storage.weapon || 0) - ((v.counts.warrior || 0) + WEAPON_RITE_KEEP);
        const _wTake = Math.min(Math.max(0, _wSurplus), N * WEAPON_RITE_PC * _rSec);
        if (_wTake > 0) { v.storage.weapon -= _wTake; v._riteWeapon = (v._riteWeapon || 0) + _wTake; _cons(v, 'weapon', _wTake); }   // ★flow-EMA(봉헌검 실수요 — 전쟁층 무기 순환)
      }
    }
  }
  // ★가죽 제품(2026-07-13 — 감사 v2 hide 글럿 진짜 sink·사용자 "제대로 고증"): 잉여 hide → 무두질 → 가죽제품(신발·주머니·깔개·끈). 신규 직업 없음(가내수공, 옹기 동형).
  //   ADDITIVE 소비(의류·갑옷 밖 실사용) = form 전환 아닌 실 hide 소멸(글럿 sink). 마을 필드(비교역 comfort) → 신규 교역재 아님 = knife-edge 수입 드레인 없음.
  //   잉여-구동(hide>floor에서만 → 수출자본·갑옷재 보존) + comfort 보너스(coverage, 없어도 페널티 0 → 수입 강제 없음). 성숙 게이트(개척기 무교란 = 505 보호).
  if (N >= RAMIE_MIN_POP) {
    v._leatherGoods = Math.max(0, (v._leatherGoods || 0) - N * LEATHER_GOODS_WEAR);   // 마모(신발 닳음·깔개 교체 — hide 실드레인의 지속 흐름)
    const _lgGap = N * LEATHER_GOODS_TARGET - (v._leatherGoods || 0);
    const _hideSpare = (v.storage.hide || 0) - N * TAN_HIDE_MIN;                      // 명백한 잉여 hide만(floor 아래는 보존)
    if (_lgGap > 0 && _hideSpare > 0) {
      const _make = Math.min(_lgGap, N * TAN_DAILY_PC, _hideSpare * TAN_YIELD);       // 제품 산출량(부족분·일처리량·잉여 중 최소)
      const _hideUsed = _make / TAN_YIELD;
      v.storage.hide -= _hideUsed; _cons(v, 'hide', _hideUsed);                       // ★실 hide 소비(additive 소멸 = 글럿 sink, form 전환 아님)
      v._leatherGoods = (v._leatherGoods || 0) + _make;
      v._tanned = (v._tanned || 0) + _hideUsed;                                       // (계측)
    }
    // ★무두질 저축 hide→leather(2026-07-13 — hide 수요-캡[candidate N]의 고증 정밀형 대체): 가죽제품 충족 후에도 남는
    //   잉여 생가죽은 유한 무두질 노동이 leather(저장·교역형 저축, 가치밀도 ×2)로 전환. 고증: 사냥사회는 가죽이 흔하고
    //   (부산물 0.4 정당 — 157 판정) 생가죽은 못 쌓음(수일 부패) — 재산은 무두질 가죽으로(162 감사 처방 "잔여 글럿은 무두질 사슬로").
    //   ★169 무두질 초안(202 571→48)의 사인 = 교역성(신규 교역재의 생명선 탈취)은 식량 pull 채널이 방어(합격시험 2).
    //   직접 storage(비 addProduce) = _potA(유휴 게이지) 무오염(가죽제품·마을필드 동형). leather는 기존 교역재(subs 0.008 실수요).
    const _tanSpare = (v.storage.hide || 0) - N * TAN_HIDE_MIN;
    // ★식량 여유 게이트(봉헌 v2 156 동형 40~80일 램프): 빠듯한 마을은 무두질에 노동·자산을 안 돌림(고증: 기근엔 사냥이 먼저)
    //   — 무게이트 0.06은 505(hide 덤핑 생명선 맵) 8→7촌 실측(널 ×1/1000=705/8 → 크기 효과), 게이트가 취약 궤적 보호.
    const _tanSec = Math.max(0, Math.min(1, (totalFoodEquivalent(v) / Math.max(1, N) - 40) / 40));
    if (_tanSpare > 0 && _tanSec > 0) {
      const _tanAmt = Math.min(_tanSpare, N * TAN_TRADE_PC * _tanSec);
      v.storage.hide -= _tanAmt; _cons(v, 'hide', _tanAmt);                           // ★flow-EMA(무두질 실수요)
      v.storage.leather = (v.storage.leather || 0) + _tanAmt;
      v._tannedTrade = (v._tannedTrade || 0) + _tanAmt;                               // (계측)
    }
    v._lgCov = Math.min(1, (v._leatherGoods || 0) / Math.max(1, N * LEATHER_GOODS_TARGET));   // 커버리지 → comfort 보너스(stats)
  }
  // ★활 품질 EMA(§9 3차) — 오늘 활 제작분의 bone(활대 심) + ★흑요석(예리 화살촉, 수정3) 투입률이 장비 스톡의 질을 갱신(비대칭: 상승 느림·희석 더 느림). 제작 없는 날은 미세 노후만.
  //   투입률 = bone충족률 + 흑요석충족률×OB_W(예리 보너스, 상한 BOW_R_MAX). 흑요석 산지 마을은 bone만인 마을보다 _bowQ↑ → 사냥 데미지 이점("예리한 화살촉"). 별도 arrow 아이템 없음.
  if ((v._bowNeed || 0) > 0) {
    const _brBone = (v._bowIn || 0) / v._bowNeed;
    const _brObs = (v._bowObNeed || 0) > 0 ? (v._bowObIn || 0) / v._bowObNeed : 0;
    const _br = Math.min(BOW_R_MAX, _brBone + _brObs * BOW_OBSIDIAN_Q_W);   // bone 기본 + 흑요석 예리 보너스(합산, 상한)
    const _ba = _br > (v._bowR || 0) ? BOW_Q_UP : BOW_Q_DOWN;
    v._bowR = (v._bowR || 0) * (1 - _ba) + _br * _ba;
  } else if (v._bowR) v._bowR *= (1 - BOW_Q_IDLE);
  v._bowIn = 0; v._bowNeed = 0; v._bowObIn = 0; v._bowObNeed = 0;
  v._bowQ = 1 + BOW_Q_SPAN * (v._bowR || 0);

  // ★S3 도구·무기 품질 EMA — 오늘 제작분의 (재료등급×스킬) 가중평균이 마을 장비 스톡의 질을 서서히 갱신(bowQ 패턴).
  //   레벨=품질(해금 아님): 숙련 석공/대장장이가 있는 마을일수록 스톡 품질↑ → 도구효율·무기 defense↑(feed into stats·boost).
  //   ★S3 능력기반 품질: 마을 장인(최고숙련 석공·대장장이) + 가용 최고 재료가 스톡 품질을 결정 → "레벨=품질" 직접 구현.
  //   throughput 무관(수요 적어 명장이 쉬어도, 그가 만드는 것은 명작) — EMA는 장인 교체·재료 변화의 완만 반영용.
  //   장인 없으면(석공 0) 막석기 자급 하한으로 감쇠(도구), 무기는 없으면 유지.
  {
    // 도구: 마을 최고 masonry 숙련. 석공 없으면 자급 막석기(SELF_TOOL_Q)로 서서히 하강.
    let maxMasonSk = -1;
    for (const n of v.npcs) if (n.currentJob === 'mason') { const s = n.skills.masonry || 0; if (s > maxMasonSk) maxMasonSk = s; }
    let toolTarget;
    if (maxMasonSk >= 0) toolTarget = TOOL_Q_BASE + TOOL_Q_SPAN * (maxMasonSk / 10);   // 석공 품질(막석기~명장석기)
    else toolTarget = SELF_TOOL_Q;   // 석공 없음 → 막석기 자급 품질
    v._toolQ = (v._toolQ != null ? v._toolQ : 1.4) * (1 - TOOL_Q_EMA) + toolTarget * TOOL_Q_EMA;
    // 무기: 최고 재료등급(청동>철>석검 — 현 재고 가용성) × 최고 무기장(smith)·석공(석검) 숙련.
    let maxSmithSk = -1, maxMasonSkW = -1;
    for (const n of v.npcs) { if (n.currentJob === 'smith') { const s = n.skills.smithing || 0; if (s > maxSmithSk) maxSmithSk = s; } if (n.currentJob === 'mason') { const s = n.skills.masonry || 0; if (s > maxMasonSkW) maxMasonSkW = s; } }
    let weapTarget = null;
    if (maxSmithSk >= 0 && ((v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12)) {
      weapTarget = WEAP_Q_BRONZE * (1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (maxSmithSk / 10));   // 청동검(명장)
    } else if (maxSmithSk >= 0 && (v.storage.iron || 0) >= 0.4) {
      weapTarget = WEAP_Q_IRON * (1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (maxSmithSk / 10));   // 철검
    } else if (maxMasonSkW >= 0) {
      weapTarget = WEAP_Q_STONE * (1 - WEAP_Q_SKILL_SPAN + WEAP_Q_SKILL_SPAN * (maxMasonSkW / 10));   // 마제석검/활
    }
    if (weapTarget != null) v._weapQ = (v._weapQ != null ? v._weapQ : WEAP_Q_STONE) * (1 - WEAP_Q_EMA) + weapTarget * WEAP_Q_EMA;
  }
  // ★의복 품질 EMA(2026-07-13) — 오늘 재봉분(숙련×재료 믹스)이 마을 의복 스톡 질을 서서히 갱신(_weapQ 동형). 방한(coldStress 완화 보너스, _computeVillageStats)에 반영. 제작 없는 날은 유지.
  {
    if ((v._clothQden || 0) > 0) {
      const _cqT = v._clothQnum / v._clothQden;
      v._clothQ = (v._clothQ != null ? v._clothQ : CLOTH_Q_BASE) * (1 - CLOTH_Q_EMA) + _cqT * CLOTH_Q_EMA;
    }
    // 장인 없고 무기 스톡만 있으면 현 품질 유지(감쇠 없음 — 남은 무기는 그대로).
  }
  // ★요리 품질 _cookQ EMA(2026-07-13 — candidate G) — 마을 최고 cook 숙련 → 조리식 질(_weapQ 동형 target-EMA). 요리사 있는 날만 갱신, 없으면 유지.
  {
    let maxCookSk = -1;
    for (const n of v.npcs) if (n.currentJob === 'cook') { const s = n.skills.cooking || 0; if (s > maxCookSk) maxCookSk = s; }
    if (maxCookSk >= 0) {
      const _cqT = 1 - CLOTH_Q_SKILL_SPAN + CLOTH_Q_SKILL_SPAN * (maxCookSk / 10);   // 0.4~1.0 (숙련 기여, 재봉 SPAN 재사용)
      v._cookQ = (v._cookQ != null ? v._cookQ : CLOTH_Q_BASE) * (1 - CLOTH_Q_EMA) + _cqT * CLOTH_Q_EMA;
    }
  }
  // ★근접검 비중(_swordFrac) EMA — 오늘 제작(검 vs 활) 가중으로 pool의 근접검 비중 추종. 검 제작일↑비중, 활 제작일↓비중. 제작 없으면 유지.
  {
    const _sw = v._swordMadeToday || 0, _bw = v._bowMadeToday || 0, _tot = _sw + _bw;
    if (_tot > 0) {
      const _fracToday = _sw / _tot;
      v._swordFrac = (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT) * (1 - SWORD_FRAC_EMA) + _fracToday * SWORD_FRAC_EMA;
    } else if (v._swordFrac == null) {
      v._swordFrac = SWORD_FRAC_INIT;
    }
    v._swordMadeToday = 0; v._bowMadeToday = 0;
  }
  v._toolQnum = 0; v._toolQden = 0; v._weapQnum = 0; v._weapQden = 0; v._clothQnum = 0; v._clothQden = 0;

  // 2.5) 식량 부패 — 게임에선 안 쓰기로 했으므로 시뮬에서도 일관되게 제거.
  //      대신 storage 무한 비축은 chest 용량 한계(게임 메커니즘)로 표현될 예정.

  // 2.6) 봉쇄 시 직접 NPC 사망 없음. 봉쇄 효과는 교역 차단으로 식량 부족 → 자연스러운 사망 유도.

  // 3) Surplus EMA (식량 흐름) — food_equivalent 기준
  const dailyFoodProd = totalFoodProductionEquivalent(dailyProduction);
  const dailySurplus = dailyFoodProd - foodNeed;
  v.surplusEMA.food = 0.95 * v.surplusEMA.food + 0.05 * dailySurplus;

  // 4) K (수용 한계) — 식량 자리 합. 영토 확장으로 자리 ↑ = K ↑
  //    실제 산출 K_prod = (자체 생산 + 외부 import) / 소비.
  //    v2 r11: import 포함 — 작은 마을이 외부 거래로 부양되는 진짜 시장 동학 반영.
  const slotK = totalFoodSlots(v);
  // 외부 import EMA: tradeStats.foodImported 누적을 평균화 (최근 100일치 추정)
  if (v.tradeStats && v._lastImportSnapshot === undefined) {
    v._lastImportSnapshot = 0;
    v._importEMA = 0;
  }
  if (v.tradeStats) {
    const recentImport = (v.tradeStats.foodImported || 0) - (v._lastImportSnapshot || 0);
    v._lastImportSnapshot = v.tradeStats.foodImported || 0;
    // EMA — 100일 시간상수
    v._importEMA = 0.99 * (v._importEMA || 0) + 0.01 * recentImport;
  }
  const dailyImport = v._importEMA || 0;
  // ★부양력은 생산 *잠재력*으로 — satiation(창고 글럿 시 여가)이 실제생산을 줄여도 K는 안 낮아짐.
  //   (옛 실제생산 기준: 초기 300일치 식량 글럿→생산 12%로 조임→prodK≈4→N8>K→로지스틱이 인구 끌어내려 초반 진동)
  const dailyFoodProdPotential = totalFoodProductionEquivalent(dailyProductionPotential);
  // ★prodK 신뢰 관성(EMA ~33일): 날씨 이벤트(가뭄 7~14일)가 K를 직접 때려 θ=4 로지스틱이 과잉반응(대촌 ±100명 스윙)하지 않게.
  //   진짜 기근은 별도 실시간 항(hunger)이 처리하므로 안전성 손실 없음 — K만 계절·이벤트 노이즈에 둔감해짐.
  // ★★[2026-08-02c 소멸 0] PRODK_CAP — 용량 기준 식량흐름. **fuelK 와 완전 동형**(같은 모양·같은 MSY 처리):
  //     fuelK: (벌목 자리 × base × land.wood) ∧ woodSustain  + 볏짚 + 수입EMA + 재고/90
  //     prodK: (농·어·렵·채집 자리 × base × landBoost) ∧ {fish,forage}Sustain + 수입EMA
  //   실현흐름 기준(아래 _prodKraw)은 **인구가 줄면 K도 줄어** 붕괴가 자기증폭한다(위 손잡이 주석 ③).
  //   자리 수는 slotK 가 이미 세므로 이중산입이 아니다 — slotK=자리, prodK=그 자리가 내는 흐름. min 이 더 빡빡한 쪽을 고른다.
  //   ⚠보수적 하한: **부산물 식량환산(연어·새우·게·굴·견과…)을 뺐다.** 실측 산출의 상당분인데 자리당 발생률을
  //     정확히 못 세우므로 넣지 않는다(과대평가보다 과소평가). 도구 배수도 뺐다 — fuelK 선례 그대로(용량은
  //     "제대로 된 도구를 갖췄을 때"의 땅 능력이고, 도구 결손은 TOOLBOOT 안전망과 hunger 항이 실시간으로 처리한다).
  let _prodKraw = (dailyFoodProdPotential + dailyImport) / DAILY_FOOD_CONSUMPTION;
  if (PRODK_CAP_ON) {
    const _cf = jobCapacity(v);
    const _fishRawCap = (_cf.fisher || 0) * JOBS.fisher.base * (v.land.water || 0);
    const _fishCap = (v.land.fishSustain != null && _fishRawCap > 0) ? Math.min(_fishRawCap, v.land.fishSustain) : _fishRawCap;
    // 채집은 산출이 믹스라 식량환산 비율을 그 마을 실제 믹스(foragerYieldsFor)로 정확히 계산한다 — 임의 계수 없음.
    const _fy = foragerYieldsFor(v);
    let _fySum = 0, _fyFood = 0;
    for (const _r in _fy) { _fySum += _fy[_r]; _fyFood += _fy[_r] * (FORAGE_FOOD_FACTOR[_r] || (_r === 'food' ? 1 : 0)); }
    const _foodShare = _fySum > 0 ? _fyFood / _fySum : 0;
    const _forRawCap = Math.floor((_cf.forager || 0) * 0.5) * JOBS.forager.base * JOBS.forager.landBoost(v);
    const _forCap = (v.land.forageSustain != null && _forRawCap > 0) ? Math.min(_forRawCap, v.land.forageSustain) : _forRawCap;
    const _capFlow = (_cf.farmer || 0) * JOBS.farmer.base * (v.land.fertility || 0) * _paddyMul * (v._clearedFrac != null ? v._clearedFrac : 1)
                   + _fishCap
                   + (_cf.hunter || 0) * JOBS.hunter.base * (v.land.game || 0)
                   + _forCap * _foodShare;
    _prodKraw = (_capFlow + dailyImport) / DAILY_FOOD_CONSUMPTION;
  }
  v._prodKema = v._prodKema === undefined ? _prodKraw : 0.97 * v._prodKema + 0.03 * _prodKraw;
  const prodK = v._prodKema;
  // ★도구 마모 — 내구재라 천천히 닳음(반감기 ~19년). 인구 성장으로 1인당 도구가 희석되면 대장간이 보충.
  //   (예전 0.2%/일은 반감기 1.4년 = 비현실적으로 빨라 도구 고갈→붕괴 유발)
  // ★도구 마모 현실화 — 청동기 도구는 소모품(부러지고 갈아야 함). 돌<청동<철 순 내구(반감기 돌~1.3·청동~2·철~3년).
  //   예전 0.00007(반감기 19년)은 청동/철도구를 사실상 영구화 → 대장장이 수요 죽어 floor로 땜질. 현실화로 자연 수요 창출.
  if (v.storage.tool) v.storage.tool *= (1 - 0.0006);       // 돌도구(도구 자본재 — 유일 생산 품목)
  if (v.storage.bronze_tool) v.storage.bronze_tool *= (1 - 0.00035);  // 청동도구=레거시(신규 생산 0): 감가로 기존 재고만 자연 소멸
  if (v.storage.iron_tool) v.storage.iron_tool *= (1 - 0.00022);      // 철도구=레거시(신규 생산 0): 감가로 기존 재고만 자연 소멸

  // ★땔감 소비 — (1)요리·난방=인구비례 (2)제련=야금공 비례(청동 제련은 고온·대량 연료). 생산 반영된 재고에서 차감.
  //   충당률 fuelCov를 저장 → _computeVillageStats가 건강에 비례 페널티로 반영(부족→건강↓→인구·생산성↓).
  //   재고를 실제로 축내므로 subsistence picker(wood<N×5)가 벌목꾼을 더 배치 → 숲 압박. 야금촌은 제련연료로 숲을 더 빨리 소진(고증: 제련=삼림파괴 동인).
  // ★S2 야금공(제련 고온·대량 연료) = 대장장이(청동·철 무기) + 갑옷장이. 석공(mason)은 석기·목공(간돌·활)이라 제련 연료 0(고온 화로 없음).
  const smelters = (v.counts.smith || 0) + (v.counts.weaponsmith || 0) + (v.counts.armorsmith || 0);
  // ★의복 마모(2026-07-12) — 입던 옷이 해짐: 기본 + 한랭 가중(겨울 험한 사용·겹쳐 입음). 커버리지는 스탯 항이 소비.
  const _wear = N * CLOTH_WEAR_PC * (1 + 2 * (v._coldStress || 0));
  _cons(v, 'clothes', Math.min(v.storage.clothes || 0, _wear));   // ★flow-EMA(마모 실차감)
  v.storage.clothes = Math.max(0, (v.storage.clothes || 0) - _wear);
  v._clothCov = Math.min(1.5, (v.storage.clothes || 0) / Math.max(1, N));
  // ★건축 유지(2026-07-12 — 돌 감산 자연화): 담장·구들·바닥·숫돌이 닳는다 — 인구 비례 석재 실소비(연료 동형 물리 수요).
  const _maintS = Math.min(v.storage.stone || 0, N * STONE_MAINT_PC);
  if (_maintS > 0) { v.storage.stone -= _maintS; _cons(v, 'stone', _maintS); }   // ★flow-EMA
  const fuelNeed = N * FIREWOOD_PC * (1 + FUEL_COLD_W * (v._coldStress || 0)) + smelters * SMELT_FUEL_PER;   // ★한랭 난방 가중(2026-07-12) — 겨울 연료 수요 실물화
  // ★볏짚 먼저(공짜 부산물, 당일 소진 — 취사·난방용. 제련은 고온이라 목재만) → 부족분만 목재.
  const strawFuel = Math.min(N * FIREWOOD_PC, (v._grainToday || 0) * STRAW_FUEL_PER_FOOD);
  v._grainToday = 0;
  // ★유령 박멸(§9): 하급 연료 — 잔가지(twig)·껍질(bark)을 장작보다 먼저 땜(LOW_FUEL_EQ eq). 취사·난방분만(제련 제외 = straw와 동일).
  //   채집 잔가지·벌목 껍질의 자연 소비처(연료 등가 편입) — 목재 소비 실절감.
  const _cookHeatNeed = Math.max(0, N * FIREWOOD_PC - strawFuel);   // 하급 연료가 감당 가능한 몫(제련 제외)
  let _lowFuel = 0;
  for (const _lf of ['twig', 'bark']) {
    const _rem = _cookHeatNeed - _lowFuel;
    if (_rem <= 0) break;
    const _u = Math.min(v.storage[_lf] || 0, _rem / LOW_FUEL_EQ);
    if (_u > 0) { v.storage[_lf] -= _u; _lowFuel += _u * LOW_FUEL_EQ; }   // ★flow-EMA 제외(식단 사다리 동형): 하급 연료는 *가용성 기반 대체 소비* — 폴드하면 궁핍기 잔가지 사용이 target ×수십 고착(EQ 역수 증폭, s202 붕괴 채널 의심)
  }
  const fuelFromWood = Math.min(Math.max(0, fuelNeed - strawFuel - _lowFuel), v.storage.wood || 0);
  v.storage.wood = Math.max(0, (v.storage.wood || 0) - fuelFromWood);
  _cons(v, 'wood', fuelFromWood);   // ★flow-EMA(연료 목재)
  v._fuelCov = fuelNeed > 0 ? (strawFuel + _lowFuel + fuelFromWood) / fuelNeed : 1;

  // ★주거 증축: 집이 인구보다 모자라면 목재(필수)·석재(있으면)로 지음. 노후화로 지속 보수.
  if (v.housing === undefined) v.housing = N;
  v.housing *= (1 - HOUSE_DECAY);   // 노후화
  const houseTarget = N * HOUSE_BUFFER;
  if (v.housing < houseTarget) {
    // ★노동기반 건설: "시간 남는 NPC가 집을 짓는다" — 여유노동이 건설속도를 결정.
    //   식량안보(곳간 여유)일수록 잉여노동 많아 건설 빠름. 쪼들리면 정체(노동을 식량에 다 씀).
    const _fe = totalFoodEquivalent(v);
    const slack = _fe > N * 40 ? 1.0 : (_fe > N * 25 ? 0.5 : 0.15);
    let built = Math.min(houseTarget - v.housing, (v.storage.wood || 0) / HOUSE_WOOD, N * HOUSE_BUILD_MAX * slack);   // 목재 필수 + 여유노동 제약
    if (built > 0) {
      // ★석재 준-필수: 석재 충분하면 정상 건축, 없으면 30%만(주춧돌·구들 없는 임시 가옥). 강한 석재 수요 → 광산 교역 유발.
      const stoneNeed = built * HOUSE_STONE;
      const stoneFrac = stoneNeed > 0 ? Math.min(1, (v.storage.stone || 0) / stoneNeed) : 1;
      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%
      v.storage.wood -= built * HOUSE_WOOD;
      _cons(v, 'wood', built * HOUSE_WOOD);   // ★flow-EMA(주거 목재)
      // ★유령 박멸(§9): 자갈 기초 — 기초·구들 채움(석재 수요의 ≤절반)은 채집 자갈이 하급 대체(PEBBLE_STONE_EQ). 석재 실절약.
      const _needS = built * HOUSE_STONE;
      const _pebUse = Math.min(v.storage.pebble || 0, (_needS * 0.5) / PEBBLE_STONE_EQ);
      if (_pebUse > 0) v.storage.pebble -= _pebUse;   // ★flow-EMA 제외: 자갈 기초도 석재의 가용성 대체 소비(잔가지 동형)
      const _stUse = Math.min(v.storage.stone || 0, Math.max(0, _needS - _pebUse * PEBBLE_STONE_EQ));
      v.storage.stone = Math.max(0, (v.storage.stone || 0) - Math.max(0, _needS - _pebUse * PEBBLE_STONE_EQ));   // 실제 건축분만큼 석재 소비(자갈 대체분 차감)
      _cons(v, 'stone', _stUse);   // ★flow-EMA(주거 석재)
      v.housing += built;
    }
  }
  // ★fuelK(리비히) — 연료도 식량처럼 필수 소비 흐름(온돌·취사, 고증). 숲 용량(벌목 자리×산출)+수입EMA가 부양 가능한 인구.
  //   식량만 K에 넣으면 비옥·숲빈약 마을이 식량 K까지 성장 후 연료 붕괴(건강 죽음나선) — K가 미리 보게 한다.
  if (v._woodImpSnap === undefined) { v._woodImpSnap = 0; v._woodImportEMA = 0; }
  if (v.tradeStats) {
    const recentWoodImp = (v.tradeStats.woodImported || 0) - v._woodImpSnap;
    v._woodImpSnap = v.tradeStats.woodImported || 0;
    v._woodImportEMA = 0.99 * v._woodImportEMA + 0.01 * recentWoodImp;
  }
  // 용량 기준(slotK와 동일 가정: 필요 시 자리를 채울 수 있다) — 연료 게이트(picker)가 위기 시 벌목 충원을 보장하므로 정직.
  //   (실현 흐름 기준은 벌목 인력 스냅샷에 K가 요동 → θ-로지스틱 과격 반응 → K붕괴 나선. 시드42 라 소멸로 확인, 폐기)
  //   1인 수요엔 제련 연료 포함(fuelNeed = 취사·난방 + 야금) — 야금촌은 연료 부양력↓(고증: 제련=삼림 압박).
  const _woodCapRaw = (jobCapacity(v).lumberjack || 0) * 0.9 * (v.land.wood || 0);  // 벌목 자리 만충 시 목재 흐름(채굴 능력)
  const _woodProdCap = v.land.woodSustain != null ? Math.min(_woodCapRaw, v.land.woodSustain) : _woodCapRaw;   // ★MSY: 랩 실측 숲 재생 흐름이 상한 — 스톡 마이닝(감가 자산)을 소득으로 계산하지 않음. 초과 채굴은 가능하되 K는 지속가능선만 믿음
  const woodCapFlow = _woodProdCap
                    + (dailyProductionPotential.food || 0) * STRAW_FUEL_PER_FOOD    // + 볏짚(곡물 잠재생산 부산물 — 농업촌 연료 자급분)
                    + (v._woodImportEMA || 0) + (v.storage.wood || 0) / 90;         // + 수입EMA + 재고 한 계절 완충
  const fuelNeedPC = N > 0 ? Math.max(FIREWOOD_PC, fuelNeed / N) : FIREWOOD_PC;
  // ★신뢰 관성(EMA ~50일): 숲 고갈로 용량이 줄 때 K가 절벽 낙하(θ=4 로지스틱 −20%/일 학살)하지 않게 —
  //   주민의 부양력 인식은 서서히 갱신(고증: 숲이 줄어드는 걸 몇 계절에 걸쳐 체감). 하락도 상승도 완만.
  const _fuelKraw = woodCapFlow / fuelNeedPC;
  v._fuelKema = v._fuelKema === undefined ? _fuelKraw : 0.98 * v._fuelKema + 0.02 * _fuelKraw;
  const fuelK = v._fuelKema;
  v._kDbg = { slot: +slotK.toFixed(1), prod: +prodK.toFixed(1), fuel: +fuelK.toFixed(1) };   // ★K 분해 노출: "이 마을은 뭐에 막혔나"(경작지·식량흐름·연료) — 진단·UI 근거
  const Kraw = Math.min(slotK, prodK, fuelK);   // ★자연 리비히 min: 식량 자리·식량 흐름·연료 흐름. (옛 K_MAX=110 임의 천장 폐지 — 수준은 지형+MB/MC 확장이 결정)
  const K = Math.max(POP_MIN, Kraw);

  // 5) 인구 θ-로지스틱 갱신 — dP = r·N·(1−(N/K)^θ). θ>1: K의 ~80%까지 빠르고 이후 급감(S곡선의 상단을 압축)
  const ratio = N / Math.max(1, K);
  const _logiTerm = POP_GROWTH_RATE * N * (1 - Math.pow(ratio, LOGISTIC_THETA));
  let dP = _logiTerm;
  // 굶주림: 흐름 음수 + 창고 식량_equiv 부족
  let _hungerTerm = 0;
  if (v.surplusEMA.food < 0 && totalFoodEquivalent(v) < N * 3) _hungerTerm -= 0.3 * Math.abs(v.surplusEMA.food);
  // 굶주림 직격: foodGap이 있으면 그만큼 인구 추가 압박
  if (foodGap > 0) _hungerTerm -= 0.5 * foodGap;
  dP += _hungerTerm;
  // Phase 5-5-econ-d: 마을 stat 기반 인구·이주 보정
  const stats = _computeVillageStats(v, N);
  let _healthTerm = 0, _happyTerm = 0, _prestigeTerm = 0;
  if (stats) {
    // happiness: 0.5 기준. >0.5 보너스, <0.5 페널티 (불행 → 이주·자살 등)
    _happyTerm = (stats.happiness - 0.5) * 0.6 * N * POP_GROWTH_RATE;
    // health: 0.5 기준 (질병·약초 부족)
    _healthTerm = (stats.health - 0.5) * 0.4 * N * POP_GROWTH_RATE;
    // ★위신재(사치)→인구 보너스 — prestige는 순보너스(0 기준, 있으면 +). 사치 수입을 정당화 = 진짜 수요 근거.
    _prestigeTerm = Math.min(PRESTIGE_MOD_CAP, (stats.prestige || 0) * PRESTIGE_GROWTH_W) * N * POP_GROWTH_RATE;
    dP += _happyTerm + _healthTerm + _prestigeTerm;
    v.lastStats = stats;
  }
  // ★주거 성장 게이트: 집이 부족하면(N≥주거) 인구가 더 못 늚. 감소는 식량(famine)만 — 집 부족으론 안 죽음.
  const _hcap = Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity);   // ★완공 계약: 맵 완공 침대(_mapBeds)가 상한(3사본 동기화)
  const _gated = (dP > 0 && _hcap !== Infinity && N >= _hcap);
  if (_gated) dP = 0;
  v._dpDebug = { K: +K.toFixed(1), logi: +_logiTerm.toFixed(3), hunger: +_hungerTerm.toFixed(3), health: +_healthTerm.toFixed(3), happy: +_happyTerm.toFixed(3), prestige: +_prestigeTerm.toFixed(3), housing: (v.housing !== undefined ? +(+v.housing).toFixed(1) : null), gated: _gated, dP: +dP.toFixed(3) };
  // ΔP 상한
  const maxDelta = N * POP_MAX_DELTA_PCT;
  dP = Math.max(-maxDelta, Math.min(maxDelta, dP));

  // 6) 인구 적용 — 정수 단위. 분수는 누적해서 처리.
  v._dPAccum = (v._dPAccum || 0) + dP;
  while (v._dPAccum >= 1) {
    // 인구 cap — N² 폭발 방지
    if (v.npcs.length >= POP_MAX) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    // ★완공 계약 엄수(§9 회귀 가드): 다중 출생(dP>1)이 침대(주거·_mapBeds)를 넘지 않게 — 게이트는 dP만 0으로 만들고
    //   같은 날 누적분이 침대를 1~2명 넘던 미시 구멍 봉인(건강 상승으로 dP가 커지며 표면화 — 초과 감시 0 유지).
    if (_hcap !== Infinity && v.npcs.length >= _hcap) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    // 출생: 부족 직군으로 배정. 자리 없으면 출생 보류
    const picker = v._world && v._world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
    const newJob = picker(v, v._world);
    if (!newJob) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    const npc = createNPC({ job: newJob, inheritSkill: apprenticeInherit(v, newJob) });   // ★S4 명장 견습(세대 전승)
    v.npcs.push(npc);
    v.counts[newJob] = (v.counts[newJob] || 0) + 1;
    v._dPAccum -= 1;
  }
  // 기아 사망 — dP 음수 누적 시 가장 늙은 NPC부터 사망.
  //   시뮬 초기 365일은 보호 (자리 맞추기 + 교역 시작 시간 확보).
  //   그 후부터 진짜 기아 사망 발생.
  if (day < 365) {
    if (v._dPAccum < 0) v._dPAccum = Math.max(v._dPAccum, -0.5);
  }
  while (v._dPAccum <= -1 && v.npcs.length > POP_MIN) {
    let oldestIdx = 0;
    for (let i = 1; i < v.npcs.length; i++) {
      if (v.npcs[i].age > v.npcs[oldestIdx].age) oldestIdx = i;
    }
    const dead = v.npcs.splice(oldestIdx, 1)[0];
    v.counts[dead.currentJob] = (v.counts[dead.currentJob] || 0) - 1;
    v._dPAccum += 1;
  }

  // 7) 직업 자율 전환 — 평소 21일 1명. 식량 위기면 빈도 ↑ + 다수 전환.
  //    foodEquiv < N*30 = 위기. picker가 farmer 강제. 매 5일 1명 (4배 빠름).
  //    foodEquiv < N*10 = 즉시 위기. 매 day 1명 (21배 빠름) + 2명 동시.
  const N_pop = v.npcs.length;
  const foodEquiv_for_switch = totalFoodEquivalent(v);
  let switchInterval = (v._world && v._world.autoSwitchInterval) || 7;
  let multiSwitch = 1;
  if (foodEquiv_for_switch < N_pop * 10) { switchInterval = 1; multiSwitch = 2; }       // 진짜 기근 — 즉시 다수 전환
  else if (foodEquiv_for_switch < N_pop * 30) { switchInterval = 10; multiSwitch = 1; }  // 식량 부족 — 가속하되 완만(5→10일, 만성 수입마을 churn 억제)
  if (day % switchInterval === 0) {
    for (let i = 0; i < multiSwitch; i++) autoSwitchJob(v, day, v._world);
  }

  // 8) age
  for (const n of v.npcs) n.age += 1 / 365;
}

// 마을 부족 직군 — 자리(capacity) 있는 직업 중 가장 필요한 것 반환
function pickDeficitJob(v) {
  const N = v.npcs.length || 1;
  const cap = jobCapacity(v);
  const counts = jobCounts(v);
  const foodEquiv = totalFoodEquivalent(v);
  const forageLandMean = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);

  const foodOpts = [
    ['farmer',  v.land.fertility * 1.5],
    ['fisher',  v.land.water     * 1.2],
    ['hunter',  v.land.game      * 0.7],
    ['forager', forageLandMean   * 0.25],
  ];

  // 식량 자리 채움 비율 — 70% 넘으면 더 이상 식량 직업 양성 X (자원/상업으로 빠짐)
  const foodCap = cap.farmer + cap.fisher + cap.hunter + Math.floor(cap.forager * 0.5);
  const foodWorkers = (counts.farmer || 0) + (counts.fisher || 0) +
                       (counts.hunter || 0) + Math.floor((counts.forager || 0) * 0.5);
  const foodFillRatio = foodWorkers / Math.max(1, foodCap);

  // 1) 진짜 기근 — foodEq < 5일치. 식량 직업 즉시 양성
  if (foodEquiv < N * 5) {
    const open = foodOpts.filter(([j]) => hasSlot(v, j, cap, counts));
    open.sort((a, b) => b[1] - a[1]);
    if (open.length > 0) return open[0][0];
  }

  // 2) tool 부족
  let _toolDeps = 0;
  for (const j of JOB_NAMES) if (JOBS[j].toolDependent) _toolDeps += (counts[j] || 0);
  const toolPer = ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) / Math.max(1, _toolDeps);
  if (toolPer < 1.5 && hasSlot(v, 'mason', cap, counts)) return 'mason';   // ★S2 도구=석기 → 석공
  // ★★[재민 지시 "무기 축 복구"] 석공 채용을 **목표와 직접 비교**한다.
  //   전에는 석공이 무기 때문에 뽑히는 유일한 경로가 "전사 ≥ 1 && 무기 < N×0.5" 안에 있었다.
  //   그런데 전사는 폐지된 직업(행상)에 막혀 영영 0 이라, 그 경로가 통째로 닫혀 있었다.
  //   결과: 석공 69명(목표 204) · 무기 재고가 병기고 목표의 **33%** 에서 멈춤 · 병기고 결손 49/51 마을.
  //   ★반대로 전사를 켜보면 이번엔 그 조건이 **영구히 참**이 되어 석공이 488명까지 폭주했다.
  //     둘 다 틀린 이유는 같다 — 석공 정원을 전사에 묶었기 때문이다.
  //   masonTarget 은 이미 도구 마모 + 병기고 결손을 통합해 계산한다. 다른 장인(대장장이·갑옷장·
  //   재봉사·요리사)은 전부 `counts < target` 규약을 쓴다. 석공만 예외였던 것을 되돌린다.
  //   ⚠식량 게이트를 함께 건다. 이걸 안 걸었더니 식량이 약한 광산 마을 3곳(광산2·3·6)이
  //     석공에 인력을 뺏겨 소멸했다(실측). 굶는 마을이 석기 장인을 늘리는 건 순서가 틀렸다.
  if ((counts.mason || 0) < masonTarget(v) && totalFoodEquivalent(v) > N * 30
      && hasSlot(v, 'mason', cap, counts)
      && ((v.storage.stone || 0) >= 0.5 || (v.storage.wood || 0) > N * 0.5)) return 'mason';
  // ★★[재민 질문 "전사 켜면 왜 광부가 0이 돼?"] 에 대한 답이자 그 수리.
  //   광부는 이 picker 에서 **맨 마지막 7단계("풍부 토지 분야")에만** 있었다. 그래서
  //   앞 단계 조건이 하나라도 오래 참이면 광부는 영영 안 뽑히고, 이미 있던 광부는
  //   다른 직업 충원에 차출돼 사라진다(기회비용이 낮아 1순위로 뽑혀 나간다).
  //   실측: 전사 게이트를 열자 **25일 만에 광부 0**, 원석 재고가 156 에 얼어붙어 800일 내내 그대로였다.
  //   (석공 폭증은 500일 이후라 원인이 아니라 결과였다 — 도구·무기 결손이 누적된 것.)
  //   ⇒ 채굴에도 **파생수요**를 준다: 녹일 원석이 모자라면 캘 사람을 뽑는다.
  //     제련이 원석을 다 먹고 굶는데 광부를 안 뽑는 건 어느 모로 봐도 결함이다.
  if ((v.land.ore || 0) > 0.15 && (v.storage.ore || 0) < N * ORE_STOCK_PC
      && hasSlot(v, 'miner', cap, counts)) return 'miner';
  // ★★[재민 확정] 제련 — 광석이 쌓였으면 녹일 사람이 필요하다. **무기 수요와 무관한 상시 일감**이라
  //   전사 사슬(상인2→전사→무기부족→대장장이)을 안 거친다. 그 사슬은 첫 고리가 폐지된 직업이라 죽어 있었다.
  if ((counts.smith || 0) < smeltTarget(v) && hasSlot(v, 'smith', cap, counts)) return 'smith';

  // 3) 식량 자리 70% 미만 + 식량 잉여 적당 → 식량 직업 우선
  //   Phase 4d-6 fix: food storage가 N*20일치 이상 풍부하면 식량 게이트 우회 (자원 직업으로)
  if (foodFillRatio < 0.7 && foodEquiv < N * 20) {
    const open = foodOpts.filter(([j]) => hasSlot(v, j, cap, counts));
    open.sort((a, b) => b[1] - a[1]);
    if (open.length > 0) return open[0][0];
  }

  // 4) wood/stone 부족
  if (v.storage.wood < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
  if (v.storage.stone < N * 3 && hasSlot(v, 'forager', cap, counts)) return 'forager';   // ★S1: 돌은 채집(foraging)으로 조달 — 부족 시 채집꾼(광부 아님)

  // 5) cook — 부재료 있을 때
  const foodRich = v.storage.food > N * 8;
  const sideTotal = COOK_SIDE_INGREDIENTS.reduce((s, r) => s + (v.storage[r] || 0), 0);
  if (foodRich && sideTotal > N * 2 && hasSlot(v, 'cook', cap, counts)) return 'cook';

  // 6) merchant — 자원 풍부 + 교역 capacity 부족할 때
  if (foodRich && v.storage.wood > N * 8 && hasSlot(v, 'merchant', cap, counts)) {
    return 'merchant';
  }

  // 6.5) warrior — merchant 있는 교역 마을이 캐러밴 호위 양성. 인구 5%까지. ★무기(돌칼/철칼) 보유 필수.
  // ★[죽은 조건] 전사 채용이 `counts.merchant >= 2` 를 요구하고 있었다. 그런데 행상은
  //   **폐지된 직업**이다(JOBS.merchant 정원 0 — "교역은 기본 NPC가 남는 시간에 왕복").
  //   정원이 0이라 상인은 영원히 0명이고, 따라서 전사도 영원히 0명이었다.
  //   그리고 대장장이 채용이 전사 1명 이상을 요구하므로, **대장장이도 영원히 0명**이었다.
  //   실측 51개 마을 800일: 전사 0 · 대장장이 0 · 청동 0. 사슬의 첫 고리가 폐지된 직업이었던 것.
  //   ⇒ 다른 직업과 같은 규약으로 되돌린다: 목표 함수(warriorTarget)와 비교한다.
  //     무장 게이트(보유 무기 ≥ 전사+1)와 식량 게이트(foodRich)는 그대로 둔다.
  //   ⚠[실측으로 보류] 이 줄을 warriorTarget 비교로 바꾸면 전사가 44~64명 생기는데,
  //     그 순간 병기고 목표(인구×MELEE_ARMORY_PC 0.72 = 1,812)가 살아나 **석공이 620명**까지 불고
  //     **광부가 0명**이 된다(무기 재고는 412 에서 더 안 오른다 — 도구 수요에 밀려 무기를 못 만든다).
  //     즉 전사를 켜는 것만으로는 안 되고, 평시 병기고 목표를 전사 실수요 기준으로 낮추는 일이
  //     같이 가야 한다. 그건 MELEE_ARMORY_PC=0.72 를 건드리는 일이라(주석: "측정으로 확정된 생존 하한")
  //     별도 회부 후에 한다. 지금은 옛 조건을 그대로 둔다.
  if (foodRich &&
      (counts.warrior || 0) < warriorTarget(v) &&
      (v.storage.weapon || 0) >= (counts.warrior || 0) + 1 &&
      hasSlot(v, 'warrior', cap, counts)) {
    return 'warrior';
  }
  // ★S2 무기 부족 — 금속(구리+주석) 있으면 대장장이(청동검), 없으면 석공(마제석검). ★전사 기준(석공·대장장이는 전사 무장 담당) — 사냥꾼 활은 자가제작(archery)로 자급하므로 여기서 석공을 강제하지 않음.
  // ★★[재민 지시 "무기 축 복구"] 이 줄의 무기 기준(N×0.5)이 **목표 함수와 달랐다.**
  //   masonTarget/smithTarget 은 병기고 목표를 식량안보에 따라 N×0.72 또는 max(2, 전사×1.2) 로 잡는데,
  //   여기서는 그것과 무관하게 N×0.5 를 썼다. 그래서 목표는 이미 찼는데 채용 조건은 계속 참인
  //   상태가 되어 **석공이 목표의 8배(559명 / 목표 67)까지 폭주**했다(전사를 켰을 때 실측).
  //   ⇒ 다른 장인과 같은 규약으로: 목표를 넘으면 더 뽑지 않는다.
  if ((counts.warrior || 0) >= 1 && (v.storage.weapon || 0) < N * 0.5) {
    if (_smithBeatsMason(v) && (counts.smith || 0) < smithTarget(v) && hasSlot(v, 'smith', cap, counts)) return 'smith';
    if ((counts.mason || 0) < masonTarget(v) && hasSlot(v, 'mason', cap, counts)) return 'mason';
  }
  // Phase 4d-7: armorsmith — warrior 있고 hide 있는 마을
  if ((counts.warrior || 0) >= 1 && v.storage.hide > N * 0.5 && v.storage.armor < N * 0.5 &&
      hasSlot(v, 'armorsmith', cap, counts)) {
    return 'armorsmith';
  }

  // 7) 풍부 토지 분야 — 비교우위. 분업 마을이 여기서 광부/목수 등으로 빠짐.
  const landBoosts = [
    ['lumberjack', v.land.wood],
    ['miner',      Math.max(v.land.ore || 0, v.land.tin || 0)],   // ★S1 광부=금속 전담(광맥 기준) ★청동 희소성 +주석산지
    ['fisher',     v.land.water * 0.8],
    ['hunter',     v.land.game  * 0.6],
    ['forager',    forageLandMean * 0.5],
  ].filter(([j]) => hasSlot(v, j, cap, counts));
  landBoosts.sort((a, b) => b[1] - a[1]);
  if (landBoosts.length > 0) return landBoosts[0][0];

  // 8) 모든 자리 다 참 — null (출생 보류)
  return null;
}

// =============================================================================
// Phase 4d-6: 합리적 의사결정 picker (위험 조정 + 한계효용 비교)
//   - 농부 vs 광부 vs 상인 vs 전사 각 직업 1명 추가 시 기대 가치 비교
//   - 인근 마을 식량 공급 + 우리 캐러밴 약탈률 + sqrt 한계효용
// =============================================================================
// ★자본재 장인 노동목표(스톡-플로우) — *직업 정원이 아니라* 자본수요에서 파생되는 노동 흐름.
//   목표재고(사용자 1인당 1개+버퍼) 대비 결손을 catchup일에 메우는 장인 수 + 마모 보충분.
//   충원되면 0으로 수렴 → 장인 수가 창발적으로 결정(고증: 야금공은 인구의 소수).
function craftLaborTarget(stock, users, dailyOut, opts) {
  opts = opts || {};
  const buffer = (opts.buffer != null) ? opts.buffer : 1.15;
  const catchup = opts.catchup || 50;
  const decay = (opts.decay != null) ? opts.decay : 0.001;
  const minStock = opts.minStock || 0;
  const desired = Math.max(minStock, users * buffer);
  const deficit = Math.max(0, desired - stock);
  const out = Math.max(0.05, dailyOut);
  const need = deficit / (out * catchup) + (stock * decay) / out;   // 결손 보충 + 마모 보충
  return (stock < desired) ? Math.max(1, Math.round(need)) : Math.round(need);
}
function toolDepCount(v) {
  let td = 0; for (const j of JOB_NAMES) if (JOBS[j].toolDependent) td += (v.counts[j] || 0);
  return td;
}
// ★S2 석공(mason) 노동목표 = *도구 수요 + 무기 수요*(스펙 8: "석공 수요=도구+무기 수요"). 스톡-플로우.
//   도구(석기) 수요: 사용마모+감가를 메우는 흐름(구 smithTarget 로직) — 인구·도구의존 비례.
//   무기 수요: 청동/철 없는 마을(금속 미보유)에서 전사·사냥꾼용 마제석검·활을 석공이 공급(저티어 자급 무기).
//   석공 있으면 도구·무기 대량 공급 → 농부가 자급에 시간 안 써 농사 전념(분업).
function masonTarget(v) {
  const N = v.npcs.length || 1;
  const toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  const td = toolDepCount(v);
  const farmerTD = v.counts.farmer || 0;
  const otherTD = Math.max(0, td - farmerTD);
  const wearPerDay = farmerTD * DAILY_TOOL_WEAR_PER_FARMER + otherTD * DAILY_TOOL_WEAR_PER_OTHER
    + (v.npcs.length || 0) * 0.005 + toolStock * 0.0006;   // 사용마모 + subsistence(0.005/인, v2) + 재고감가
  const perMasonOut = 0.5;   // 석공 1인 일일 석기 산출(≈base 0.4×숙련) 근사
  const desired = td * 1.15;   // 목표 도구재고(커버리지 1 + 버퍼)
  const deficit = Math.max(0, desired - toolStock);
  let need = wearPerDay / perMasonOut + deficit / (perMasonOut * 50);   // 도구: 마모 보충 + 결손 catchup(50일)
  // ★무기 수요분 — 금속(구리/주석/철) *없는* 마을만 석공이 무기 공급(있으면 대장장이가 청동검). ★전사만 1.2배 목표(석공=전사 마제석검 담당). 사냥꾼 활은 자가제작(archery)으로 자급하므로 석공 노동목표서 제외.
  //   ★S3: 무기 노동 3배(WEAPON_LABOR_MULT) → 석공 1인 무기 산출 ≈ 0.17/일. 목표 노동에 반영(과소충원 방지).
  // ★청동 희소성: 청동 자격(주석 산지·교역 허브) 없는 마을은 석공이 마제석검 공급(무산지=석기 무장). 자격 있으면 대장장이 청동검.
  // ★석공이 마제석검 병기고 유지 — 무산지=전량 석기, 청동 자격=대장장이 청동검이 못 채운 잔여(tin 고갈분)를 석기로 backfill.
  //   노동목표엔 병기고 결손 전량 반영(과소충원 방지). 청동 자격 마을서 대장장이가 청동으로 채우면 석공은 자연히 여가(produceSpecial 게이트가 tin 있을 때 석기 억제).
  {
    const perWeapOut = perMasonOut * WEAPON_LABOR_MULT;   // ≈0.17
    // ★근접검 재고 = weapon × 근접검비중(_swordFrac) → 활이 채운 재고에 가려 석검 노동목표가 0이 되지 않게.
    const _swordStock = (v.storage.weapon || 0) * (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT);
    // ★식량 안보 게이트(produceSpecial 병기고 게이트와 정합): 잘 먹는 마을만 병기고 노동목표, 취약 마을은 전사 실수요만(석공 과충원→식량노동 잠식 방지).
    const _foodDays = totalFoodEquivalent(v) / N;
    const _secF = Math.max(0, Math.min(1, (_foodDays - 40) / 40));
    const _armoryTarget = (_secF > MELEE_ARMORY_SECF) ? N * MELEE_ARMORY_PC : Math.max(2, (v.counts.warrior || 0) * MELEE_COV_BUFFER);
    const wDeficit = Math.max(0, _armoryTarget - _swordStock);
    need += wDeficit / (perWeapOut * 50) + _armoryTarget * 0.5 * DECAY_MELEE_MAINT / perWeapOut;   // 병기고 결손 catchup(50일) + 재고 마모 보충
  }
  const base = (toolStock < desired) ? Math.max(1, Math.round(need)) : Math.round(need);
  // ★소형마을 floor: 도구를 쓰는 마을(도구의존≥4)은 석공 최소 1명("마을엔 석공이 하나"). 도구 충분하면 포만으로 부분근무.
  return Math.max(td >= 4 ? 1 : 0, base);
}
// ★S2 대장장이(smith) 노동목표 = *청동·철 무기* 수요. 금속(구리/주석 또는 철) 있어야 성립(없으면 0 → 석공이 저티어 무기).
//   무기는 교역으로 수출 → 금속 있는 전사·사냥꾼 마을은 상시 대장장이. 청동 희소(금속=광맥/교역)라 대장장이도 금속 마을 위주.
// ★★[재민 확정] "청동이 가격이 저렴하면 청동을 제작하고, 그렇지 않으면 석기만.
//                 물론 석기와 청동 무기 모두 제작할 때도 있겠지? 이건 경제학적 원리로 해소되잖아."
//   그렇다. **한계비용 비교**다. 같은 재화(무기)를 만드는 두 기술이 있으면
//   싼 쪽을 쓰고, 비용이 비슷해지면 둘 다 쓴다.
//
//   품질이 다르면 같은 재화가 아니므로 **품질 1.0 환산 재료비**로 잰다:
//     석공   = 돌 0.5 × 돌값        ÷ 0.5(마제석검 등급)
//     대장장이 = Σ(금속 투입 × 금속값) ÷ 합금 등급
//
//   이 하나로 세 가지가 동시에 풀린다 —
//     · 순동만 있는 마을: 0.42×4 ÷ 0.466 = 3.6  >  석공 2.1  → **석기를 쓴다**(고증 그대로)
//     · 주석이 섞이면:    0.42×4 ÷ 1.0   = 1.7  <  석공 2.1  → 청동으로 넘어간다
//     · 금을 섞으면:      0.42×13.6 ÷ 1.09 = 5.2 >> 석공     → **금 무기를 안 만든다**
//   금이 물성상 좋은데도 아무도 안 쓰는 이유가 값이라는 걸, 따로 막지 않고 값이 말하게 둔다.
//
//   "둘 다 만들 때"도 이미 구조에 있다 — BRONZE_ARMORY_FRAC 이 청동을 병기고의 일부까지만
//   허용하므로, 청동이 싸도 나머지는 석공의 마제석검이 채운다.
const STONE_PER_WEAPON = 0.5;      // 석공이 마제석검 1회에 쓰는 돌(위 produceSpecial 'mason' 과 동일)
function _matPrice(v) {
  const t = (v._world && typeof v._world.priceFn === 'function') ? v._world.priceFn(v) : null;
  let SP = null; try { SP = require('../server/specialty'); } catch (e) { }
  return (r) => {
    const p = t && t[r];
    if (p > 0) return p;
    if (BASE_VALUE[r] > 0) return BASE_VALUE[r];
    const b = SP && SP.RESOURCES[r] && SP.RESOURCES[r].baseValue;
    return b > 0 ? b : 1;
  };
}
// ★★[2026-08-02c 배합↔교역 한 단위 통합 — 재민 승인] `opp(r) = max(내 마을 그림자가격, 최고 순수출가)`.
//   `설계_배합과교역_한단위_통합.md` §2 (가)안. 두 결정이 **한 재화에 같은 값**을 매기게 하는 유일한 접점이다.
//
//   왜 산출(무기)까지 opp 로 재는가 — (가)안은 "재료비만" 이었지만, 재료만 바꾸면 **비대칭 편향**이 생긴다:
//   투입은 수출 기회를 보는데 산출은 안 보므로, 무기가 밖에서 비싸게 팔리는 마을에서 주조가 부당하게 저평가된다.
//   올바른 판정식은 "산출의 최선용도 값 − 투입의 최선대안 값" 이라 **양변 모두** opp 여야 한다.
//   (재민 "비교가 필요해" 의 뜻이 그것이다 — 한쪽만 바꾸면 비교가 아니라 새 편향이다.)
//
//   ⚠순수출가는 **v2 가 world 에 주입**한다(v1→v2 역참조 금지 — priceFn 선례). 미주입(v1 단독 CLI)이면
//     `_matPrice` 와 완전히 동일하게 동작한다 = 회귀 무영향.
//   ★★기본 ON = **채택**(2026-08-02c). 실지도 3시드 800일 A/B — 목표 지표가 3/3 시드에서 결정적으로 개선:
//       ★합금 등급 평균 0.79 → **1.21** (+53%, 시드별 0.735→1.163 · 0.913→1.228 · 0.723→1.227)
//     등급 1.0 = 표준 청동(Cu88Sn12). 즉 대장장이가 **표준 이하 잡동사니에서 진짜 청동으로** 넘어갔다 —
//     구리 산지에서 구리 그림자가격이 글럿으로 바닥이라 "공짜 재료"처럼 부어 대던 것이, 수출 기회비용을
//     보게 되자 멎었다. 이 손잡이가 하려던 일이 바로 그것이다.
//     안전 지표 유지: 소멸 0 · 좀비 0(실지도) · v2 CLI 회귀 소멸 0/30 · 인구 2,074 → 2,079.
//   ⚠정직하게 적어 둔다 — 장비 재고는 **잡음**이다(8시드 중 갑옷 5↑3↓). 무기 총량만 −3~8% 로 약간 준다
//     (재료가 제 값을 가지니 주조가 신중해진다). 되돌리려면 `ALLOY_OPP=0` 하나면 된다.
const ALLOY_OPP_ON = !(typeof process !== 'undefined' && process.env && process.env.ALLOY_OPP === '0');
function _oppPrice(v) {
  const p = _matPrice(v);
  const nef = (ALLOY_OPP_ON && v && v._world && typeof v._world.netExportFn === 'function') ? v._world.netExportFn : null;
  if (!nef) return p;
  return (r) => {
    const local = p(r);
    const exp = nef(v, r) || 0;
    return exp > local ? exp : local;
  };
}
function _masonWeaponCost(v) { const p = _oppPrice(v); return (STONE_PER_WEAPON * p('stone')) / WEAP_Q_STONE; }
function _smithWeaponCost(v) {
  const m = _alloyMelt(v); if (!m) return Infinity;
  const p = _oppPrice(v);
  let c = 0; for (const k in m.take) c += m.take[k] * p(k);
  return c / Math.max(0.01, Math.min(1.2, m.grade) * WEAP_Q_BRONZE);
}
function _smithBeatsMason(v) {
  const s = _smithWeaponCost(v);
  if (!isFinite(s)) return _ironWeaponCapable(v);   // 녹일 게 없으면 철(주조 아닌 별도 축)만 본다
  return s < _masonWeaponCost(v) || _ironWeaponCapable(v);
}
// ★제련 노동목표 — 쌓인 원석을 소화하는 데 필요한 대장장이 수.
//   이게 무기 수요와 **독립**이라는 게 핵심이다. 전에는 대장장이가 오직 무기 때문에만 필요했고,
//   무기 수요는 전사에서 왔고, 전사는 폐지된 직업(행상)에 막혀 있어서 사슬 전체가 죽어 있었다.
//   광석이 있으면 녹일 사람이 필요하다 — 그건 누구의 허락도 필요 없다.
const ORE_STOCK_PC = 0.5;   // 1인당 원석 재고 목표 — 이 아래면 광부를 뽑는다(제련 원료 파생수요)
// 제련에 쓸 노동 상한(인구 비율) — 야금은 마을 노동의 일부일 뿐.
// ★SMELT_CAP 손잡이는 A/B 재현용이다(기본 0.05 = 채택값). 2026-08-02 실측: 0.05 → 0.10 으로 풀어도
//   원석 적체가 안 줄었다 — **캡이 병목이 아니기 때문**이다(아래 smeltTarget 의 한계가치 게이트가 먼저 0을 낸다).
const SMELT_LABOR_CAP_PC = (typeof process !== 'undefined' && process.env && process.env.SMELT_CAP != null)
  ? Number(process.env.SMELT_CAP) : 0.05;
function smeltTarget(v) {
  const mix = oreMixOf(v);   // ★유효 조성 — 수입 원석도 녹일 수 있다(2026-08-02b)
  if (!mix) return 0;
  const ore = v.storage.ore || 0;
  if (ore < SMELT_MIN_ORE) return 0;
  // ★★[재민 지시 "경제학적 원리에 입각해"] 제련의 **한계 부가가치**가 양수일 때만 사람을 붙인다.
  //   전에는 "원석이 쌓였으면 무조건" 이라 금속이 남아도는데도 계속 제련했고, 그 노동이 식량
  //   생산을 밀어내 인구가 1,804 → 1,067 로 무너졌다(실측). 금속이 흔해지면 가격이 떨어지고
  //   그러면 제련은 더 이상 남는 장사가 아니다 — 그때 멈추는 게 옳다.
  //     한계 부가가치 = SMELT_YIELD × (광종 가중 금속가) − 원석가
  //   ⚠게이트는 **기준가**로 본다. 시장가로 보면 제련이 원석을 소진시켜 원석값을 스스로 올리고,
  //     그 값이 게이트를 닫아 제련이 영구 정지한다(자기 꼬리를 무는 되먹임 — 실측으로 확인).
  //     설비 결정은 장기 가격으로 하는 게 맞다. 단기 과잉은 아래 금속 글럿이 따로 잡는다.
  let mv = 0, tot = 0;
  for (const k in mix) { const q = mix[k]; if (!(q > 0)) continue;
    const id = k === 'jade_raw' ? 'jade' : k;
    tot += q;                                        // 분모엔 남긴다 — 못 뽑는 몫은 그대로 손실이다
    if (_ERA_METAL(id) && !_eraKnows(id)) continue;  // ★못 뽑는 금속은 제련 가치에 안 넣는다
    mv += q * (BASE_VALUE[id] || 1); }
  if (!(tot > 0)) return 0;
  if (!(SMELT_YIELD * (mv / tot) - (BASE_VALUE.ore || 1) > 0)) return 0;   // 장기적으로 손해면 안 한다
  // 금속 과잉이면 멈춘다 — 이미 쌓인 걸 더 녹일 이유가 없다(광부 _metalGlut 과 같은 논리).
  {
    const N0 = v.npcs.length || 1;
    let have = 0, want = 0;
    for (const k in mix) { const id = k === 'jade_raw' ? 'jade' : k; have += v.storage[id] || 0; want += (RESERVE_PC[id] || 0.1) * N0; }
    if (have > want * 4) return 0;
  }
  const per = 0.45 * SMELT_PER_LABOR;                        // 대장장이 1명 하루 제련량(숙련 1.0 기준)
  const need = Math.max(1, Math.round(ore / (per * 30)));    // 한 달 안에 재고를 소화할 인원
  return Math.min(Math.max(1, Math.ceil((v.npcs.length || 1) * SMELT_LABOR_CAP_PC)), need);
}
function smithTarget(v) {
  // ★청동 희소성: 청동은 *청동 자격* 마을만(주석 산지·교역 허브). 트레이스 주석뿐인 마을은 청동 생산 안 함(석공이 마제석검).
  const hasBronze = _smithBeatsMason(v) && (v.storage.copper || 0) >= 0.3;
  const hasIron = _ironWeaponCapable(v);   // ★철검=최희소: 철 풍부 마을만(트레이스 축적 미달 → 석공 마제석검)
  const _smelt = smeltTarget(v);
  if (!hasBronze && !hasIron) return _smelt;   // 무기는 석공 담당이어도, 제련할 원석이 있으면 필요하다
  // ★청동 희소성: 청동 자격 마을은 대장장이가 청동검 *병기고*를 채움(무산지 석기 병기고의 청동판). 재고=근접검(_swordFrac) → 활이 채운 pool에 가려 청동검 노동목표가 죽지 않음.
  //   병기고 목표(N×MELEE_ARMORY_PC) — 전사 실수요를 넘어 마을 청동검 재고(청동 무기 0.2/명 목표의 공급원). 청동 자격 아니면(철만) 전사 커버리지만.
  const N0 = v.npcs.length || 1;
  const _swordStock = (v.storage.weapon || 0) * (v._swordFrac != null ? v._swordFrac : SWORD_FRAC_INIT);
  const _armoryTarget = hasBronze ? N0 * MELEE_ARMORY_PC : Math.max(2, (v.counts.warrior || 0) * MELEE_COV_BUFFER);   // 청동 자격=병기고, 철만=전사 커버리지
  const local = craftLaborTarget(_swordStock, _armoryTarget, 0.5 * WEAPON_LABOR_MULT, { buffer: 1.0, catchup: 40, decay: DECAY_MELEE_MAINT, minStock: 2 });   // ★S3 무기 노동 3배 → dailyOut≈0.17. 근접검 병기고 기준(활 제외).
  // ★S2 비교우위(광산=청동검): 구리 잉여 마을은 대장장이 1명이 청동검을 *수출용*으로 소량 제작 → 교역 특산(광산=청동검).
  //   과잉 방지: 무기 재고가 얇을 때만(수출로 빠져나가야 재개) + 인구 3% 상한. 청동검은 희소 위세 교역재로 유지.
  const N = v.npcs.length || 1;
  const cuRich = (v.storage.copper || 0) > N * 3;
  const weapThin = (v.storage.weapon || 0) < N * 0.8;   // 무기 재고 얇음(수출로 소진) → 특산 제작 재개
  const exportSmiths = (hasBronze && cuRich && weapThin) ? Math.max(1, Math.floor(N * 0.03)) : 0;
  // ★★제련과 주조는 **다른 일**이다 — max 가 아니라 **합**이다.
  //   max 로 두면 제련하는 날 무기를 못 만든다(실측: 무기 551 → 255, 그러자 전사·호위가 무너지고
  //   교역이 줄어 인구가 1,804 → 1,045 로 급감했다). 정원을 합으로 두면 대장장이가 늘고,
  //   개별 대장장이는 "원석이 있으면 제련, 없으면 주조"로 **자연히 분담**된다
  //   (첫 사람이 원석을 다 소화하면 나머지는 주조로 넘어간다).
  return Math.max(local, exportSmiths) + smeltTarget(v);
}
// ★전사 readiness 목표 — *정원 아님*. 교역 캐러밴 수 × 약탈위협으로 호위 수요 파생.
//   위협 없으면 0(평시 전사 불필요), 위협 클수록 ↑. 글럿 마을의 전사 과잉(19%) 방지 + 평시 자연 동원해제.
function warriorTarget(v) {
  const ts = v.tradeStats || {};
  const sent = Math.max(1, ts.caravansSent || 0);
  const raidRate = Math.min(0.9, (ts.caravansRaided || 0) / sent);
  // ★★[재민 확정] "전사를 인구 비례 최소한으로 양성하도록 비율을 정해줘.
  //                 그리고 무기도 평시에 일정량은 구비해둬야 해."
  //   전에는 위협이 0이면 전사도 0을 반환했다. 그런데 이 마을들은 평시가 기본 상태라
  //   전사가 영영 안 생기고, 전사가 없으면 대장장이 채용 사슬도 통째로 끊겼다
  //   (실측: 51개 마을 전부 전사 0 → 대장장이 0 → 청동 0).
  //   평시 상비를 인구의 3%(최소 1명) 둔다 — 마을 50명이면 1~2명. 야생·도적에 대한 최소 대비이고,
  //   무기 실수요를 만들어 병기고(MELEE_ARMORY_PC 0.72/인)가 살아 있게 한다.
  //   ※무장 게이트는 그대로다: 보유 무기 수를 넘는 전사는 유지되지 않는다(무기 없으면 자동 동원해제).
  const PEACE_WARRIOR_PC = process.env.PEACE_W != null ? Number(process.env.PEACE_W) : 0.03;
  const N = v.npcs.length || 1;
  const peace = Math.max(1, Math.round(N * PEACE_WARRIOR_PC));   // 평시 상비(하한)
  if (raidRate <= 0.03 && (ts.tradersKilled || 0) === 0) return peace;   // 위협 없어도 최소 상비는 둔다
  const caravans = Math.max(1, Math.floor(N * 0.08));   // 동시 교역 캐러밴 수(호위 대상)
  return Math.max(peace, Math.ceil(caravans * (0.5 + raidRate) * _warlikeMult(v)));   // ★호전 성격: 위협 시 더 강한 동원
}
function weaponsmithTarget(v) {
  return 0;   // ★S2 폐지 — 대장장이(smith)로 통합. 무기 노동목표는 smith(금속)·mason(석기/활)이 담당.
}
function armorsmithTarget(v) {
  return craftLaborTarget(v.storage.armor || 0, v.counts.warrior || 0, 0.3, { buffer: 1.0, catchup: 60, decay: 0.0004 });
}
// ★의복(2026-07-12): 재봉 노동목표 — 옷 재고를 1인 CLOTH_TARGET_PC벌로 스톡-플로우 유지(갑옷장이 동형).
//   마모(한랭 가중)가 흐름 수요. 옷감 없는 마을은 재봉사 0(재료 게이트 — 옷감 수입 유인은 가격이 만든다).
function tailorTarget(v) {
  let haveW = 0; for (const m in CLOTH_MATS) haveW += (v.storage[m] || 0) * CLOTH_MATS[m];
  if (haveW < 1) return 0;
  return craftLaborTarget(v.storage.clothes || 0, v.npcs.length || 1, 0.5, { buffer: CLOTH_TARGET_PC, catchup: 60, decay: CLOTH_WEAR_PC * (1 + 2 * (v._coldStress || 0)) });
}
// ★요리사 노동목표(유령 박멸 #4) — cooked_food가 rational 픽커에서 죽어 있던 결함 수정(픽커 후보에 cook 부재 → 요리사 0 →
//   조리식 산출 0 영구). 부뚜막 자리는 부재료 유입 흐름이 부양(토지캡과 동형 — 재료 없는 부엌은 0명, 쿼터 아님).
//   경제 근거(§9 — 가격 항 없음): 조리식은 1.12× 흡수 효율(같은 곡물로 더 부양 = 노동 절약) + 식단 다양성(행복·건강 실효)
//   + 채집·부산물 더미(과일·채소·버섯)의 자연 소비처. 식량 불안 마을은 부엌이 사치(게이트).
function cookTarget(v) {
  const N = v.npcs.length || 1;
  if (totalFoodEquivalent(v) < N * 35 || (v.storage.food || 0) < N * 8) return 0;   // 식량 안보 게이트
  const dp = v.dailyProductionBuf || {};
  let sideFlow = 0, sideStock = 0;
  for (const r of COOK_SIDE_INGREDIENTS) { sideFlow += dp[r] || 0; sideStock += v.storage[r] || 0; }
  if (sideStock < N * 1.5) return 0;   // 곳간에 부재료 없으면 안 섬
  return Math.min(Math.floor(sideFlow / 3), Math.floor(N * 0.06));   // 부재료 흐름이 정원(1인 ~2.5/일 소비) · 6% 안전 클램프(최후 보루)
}

function pickDeficitJob_rational(v, world) {
  const N = v.npcs.length || 1;
  const cap = jobCapacity(v);
  const counts = jobCounts(v);
  const foodEquiv = totalFoodEquivalent(v);
  const forageLandMean = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);

  // ★S2 도구 자본 우선(기근보다 앞): 도구(석기)가 치명적으로 부족하면(맨손 0.25× = 식량생산 폭락) 석공 먼저.
  //   도구는 자본재 — 1명이 도구 만들면 나머지 식량생산이 0.25×→1.0×로 회복(순이득 큼). 단 재료(돌) 있고 마을 충분히 클 때만.
  //   재료 없으면 아래 식량직(forage가 돌도 가져옴)으로 자연 회복. 죽음의 나선 방지.
  // ★★[2026-08-02c TOOLBOOT] `N>=6` 이 소촌을 맨손에 가둔다 — 인구 5 이하는 이 안전망을 **쓸 자격이 없어서**
  //   도구 0 → 생산 ×0.25 → prodK 붕괴 → 더 못 자람 → 영원히 5 이하. 문턱을 1로 내린다(재료 게이트는 유지).
  //   원래 문턱의 취지("마을이 충분히 클 때만")는 재료 게이트(돌 0.2)와 masonTarget 이 이미 지키고 있다.
  {
    const _td = toolDepCount(v);
    const _toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
    const _toolCrit = _toolStock < _td * 0.7;   // 치명적 도구부족(커버리지<0.7)
    if (N >= (TOOLBOOT_ON ? 1 : 6) && (v.storage.stone || 0) >= 0.2) {   // 석기 재료비(0.2/tool)에 맞춘 문턱
      // 치명적 도구부족이고 석공이 노동목표 미달이면 기근보다 먼저 석공.
      if (_toolCrit && (counts.mason || 0) < masonTarget(v)) return 'mason';
    }
    // ★★[2026-08-02c STONE_NET] **재료가 없으면 재료부터 — 이것도 기근보다 앞이다.**
    //   바로 위 블록의 가정("재료 없으면 아래 식량직(forage가 돌도 가져옴)으로 자연 회복")이
    //   **실측으로 거짓임이 드러났다.** 기근 게이트의 foodOpts 는 채집을 `forageLandMean×0.25` 로 매기는데,
    //   돌밭 없는 마을(land.stone = FLOOR 0.25)이면 그 값이 0.14 라 농부(비옥×1.5 ≈ 1.4)에 **언제나** 진다.
    //   즉 "자연 회복 경로"가 구조적으로 닫혀 있었다. 실측(k_stone 3시드): 살아남지 못한 마을은
    //   **예외 없이 land.stone = 0.25** 였고(농촌12·농촌19·어촌6·농촌13·농촌16), 전부 궤적이 같다 —
    //   석재 189 → 0 → 도구 0 → 생산 ×0.25 → 만성 기근 → 기근 게이트가 영구 점유 → 석재 영영 0.
    //   ⇒ 도구가 치명적으로 부족한데 **재료조차 없으면** 채집꾼을 기근보다 먼저 부른다.
    //     (도구가 멀쩡하면 발동 안 함 = 평시 노동 잠식 없음. 채집은 식량도 같이 가져오므로 기근 대응이기도 하다.)
    if (STONE_NET_ON && _toolCrit && (v.land.stone || 0) >= 0.25 && (v.storage.stone || 0) < 0.2
        && hasSlot(v, 'forager', cap, counts)) return 'forager';
  }

  // 진짜 기근 (food < N*30일치) — 식량 직업 강제. ★경제적 정당성: 자급경제는 맬서스 상한에서 돌고,
  //   강제 30일버퍼가 ①식량안보→특화 노동 해방 ②식량생산 최대화→인구 상한 달성. (게이트 완화 실험 시 인구·특화 둘다 악화 확인)
  if (foodEquiv < N * 30) {
    // ★농사 불가 마을(비옥<0.2): 농부 강제는 무의미(거의 0 산출) → 가치재(금·광석) 채굴로 식량 살 자금 확보.
    //   광산 부얼타운 = 식량 전량 수입. 어로/사냥(직접 식량)이 가능하면 그게 우선, 광맥뿐이면 채굴해 교역.
    //   하드플로어 N*6: 그 아래로 떨어지면 가능한 식량직(어/렵)이라도 풀가동.
    // ★★[2026-08-02b] 판정 기준을 **비옥도 하나**에서 **식량 부양력**으로 통일한다(BOOMGATE=0 이면 옛 동작).
    //   비옥 0.2 는 손으로 찍은 값이고, 시딩은 이미 "부양력 = 비옥×1.5 + 물×1.2 + 사냥×0.7" 을 쓴다.
    //   두 층이 다른 잣대로 "농사 불가"를 판정하면 그 틈에 마을이 빠진다 — 실제로 빠졌다:
    //   광산6(비옥 0.26 · 부양력 0.80 · 구리 90%)은 비옥 기준으론 "농사 가능"이라 이 탈출구를 못 쓰고,
    //   거의 산출 없는 농부만 뽑다가 굶어 죽었다(실측: 3시드 중 2시드에서 소멸, 생존 시드도 광부 0).
    //   ⚠"부양력 하한 미달" 전체로 넓혔다가 실패했다(위 isBoomtown 주석의 실측). 옛 비옥도 게이트는
    //     **그대로 두고**, 부얼타운만 탈출구를 하나 더 갖는다 — 광산6(비옥 0.26·부양력 0.80·구리 90%)이
    //     비옥 기준으론 "농사 가능"이라 굶어 죽던 그 틈만 정확히 메운다.
    const _cantFarm = ((v.land.fertility || 0) < 0.2) || (BOOMGATE_ON && isBoomtown(v.land));
    if (_cantFarm && foodEquiv > N * 6) {
      if (Math.max(v.land.ore || 0, v.land.obsidian || 0, v.land.jade || 0) > 0.3 && hasSlot(v, 'miner', cap, counts)) return 'miner';   // ★S1 광부=금속 전담 ★S5 흑요석·옥 산지도 채굴해 교역(부얼타운 자금)
    }
    // ★풍부광맥 예외: 광맥이 매우 풍부(ore>0.35) + 하드기근(18일치) 아님 + 채광노동 상한(4%) 미만이면
    //   식량 게이트가 소수 광부를 허용. 광산 취락이 식량 약간 양보하고 광맥을 캐는 역사 패턴. 상한+하드플로어로 붕괴 방지.
    const mineLabor = (counts.miner || 0);
    const richVein = Math.max(v.land.ore || 0, v.land.obsidian || 0, v.land.jade || 0, v.land.tin || 0) > 0.35;   // ★S1 광맥(ore) ★S5 +특수산지(흑요석·옥) ★청동 희소성 +주석산지
    if (richVein && foodEquiv > N * 18 && mineLabor < N * 0.04 && hasSlot(v, 'miner', cap, counts)) return 'miner';
    const foodOpts = [
      ['farmer',  v.land.fertility * 1.5],
      ['fisher',  v.land.water     * 1.2],
      ['hunter',  v.land.game      * 0.7],
      ['forager', forageLandMean   * 0.25],
    ].filter(([j]) => hasSlot(v, j, cap, counts));
    foodOpts.sort((a, b) => b[1] - a[1]);
    if (foodOpts.length > 0) return foodOpts[0][0];
  }
  // (연료 게이트 실험 폐기 — 기근 게이트와 노동 쟁탈전으로 시드7 랩 전멸 유발. 벌목 충원은 시장가격
  //   [wood shadow price↑ → opportunityCost 전환] + 주거 목재 안전망이 이미 담당. fuelK는 K에서 처리.)
  // ★자본재 장인 — 스톡-플로우 노동목표(정원 아님). 목표 미달이면 충원, 충족이면 건너뜀(0 수렴).
  //   재료 게이트: 대장간 돌, 무기장 돌, 갑옷장 가죽 필요. 충원 후엔 marginal 후보에서 빠져 식량·자원직과 경쟁 안 함.
  let _toolDeps = toolDepCount(v);
  // ★★[2026-08-02c STONE_NET] **재료를 먼저 가져온다.** 실측 궤적(ts_42/tz_42)이 잡은 진짜 죽음의 고리:
  //   석재 0 → 석공이 도구를 못 만든다(produceSpecial 게이트 `stone >= _stCost`) → 도구가 0 으로 감가 →
  //   전 직업 생산 ×0.25(맨손) → prodK 붕괴 → K 붕괴 → 대량 아사 → 좀비.
  //   그런데 그 상황에서 픽커가 부르는 건 **또 석공**이다 — 아래 채용줄의 `|| wood > N*0.5` 대안 때문에
  //   돌이 0 이어도 석공이 뽑히고, 돌을 주워 올 채집꾼(아래 석재 안전망)까진 실행이 도달하지 못한다.
  //   ⇒ 석재 결손이면 채집꾼을 **석공보다 먼저** 부른다. 경계도 `>` → `>=` 로 고친다:
  //     livelihood.js 의 FLOOR.stone 이 정확히 0.25 라서, 바위 지형이 전혀 없는 마을(=가장 절실한 마을)이
  //     엡실론 하나 차이로 통째로 제외돼 있었다. 그 바닥값 주석이 이미 "돌은 흔하다 — 누구나 조달"이다.
  if (STONE_NET_ON && (v.land.stone || 0) >= 0.25 && (v.storage.stone || 0) < 0.2 * Math.max(1, masonTarget(v))
      && hasSlot(v, 'forager', cap, counts)) return 'forager';
  // ★S2 석공(석기 도구 + 저티어 무기[마제석검·활]) — 돌 있으면 충원. masonTarget이 도구+무기 수요 통합.
  if ((counts.mason || 0) < masonTarget(v) && ((v.storage.stone || 0) >= 0.2 || (v.storage.wood || 0) > N * 0.5)) return 'mason';
  // ★★[재민 확정] 채용 조건도 이산 분기를 뺀다.
  //   전에는 "주석 산지거나 / 철 부자거나" 라는 **두 개의 문턱**이었다. 그런데 대장장이가
  //   임의 배합을 녹일 수 있게 된 지금, 그 문턱은 자기 판단 기준이 아니다.
  //   진짜 기준은 하나다 — **대장장이가 석공보다 나은 무기를 만들 수 있는가.**
  //   순동 등급 0.466 < 마제석검 0.5 라서, 구리만 있는 마을은 저절로 석기를 유지한다
  //   (고증 그대로 — 순동은 석기를 밀어내지 못했다). 주석 1%만 섞여도 0.63 이 되어 역전된다.
  //   ★제련도 대장장이 일이다 — 금속이 아직 없어도 **원석이 있으면** 뽑아야 한다.
  //     (금속이 없으면 _smithBeatsMason 이 false 라, 이 조건만 두면 "금속이 없어서 대장장이를 안 뽑고
  //      대장장이가 없어서 금속이 안 생기는" 순환에 갇힌다. 실제로 v2 랩에서 그렇게 갇혀 있었다.)
  if ((counts.smith || 0) < smithTarget(v) && (_smithBeatsMason(v) || smeltTarget(v) > 0)) return 'smith';
  if ((counts.armorsmith || 0) < armorsmithTarget(v) && (v.storage.hide || 0) > N * 0.3) return 'armorsmith';
  if ((counts.cook || 0) < cookTarget(v)) return 'cook';   // ★유령 박멸 #4: 요리사 — 스톡-플로우 노동목표(장인 패턴). 잉여 마을만(cookTarget 내 게이트)
  // ★★[끊김③ 해소 2026-08-01 — 재민 "계속해 끊지 말고 쭉"] rational 이 warriorTarget 을 안 봤다.
  //   전사가 나오는 유일한 줄이 tradersKilled>3 안전망이었는데, 실측 캐러밴 1,572회 발송에 약탈 0 —
  //   v2 약탈은 도적 훅(banditRouteRisk)이 있어야 발생하고 랩·본게임 초기엔 그 훅 발동이 드물어
  //   전사가 **구조적으로 0**이었다(→갑옷장이 0 → 갑옷 0 → 무기 수요 사슬 사망).
  //   warriorTarget 의 평시 상비 3%(재민 확정: "전사를 인구 비례 최소한으로 양성 + 무기도 평시 구비")는
  //   이미 있다 — legacy 는 보는데 rational 만 안 보던 배선 구멍. 게이트는 legacy 안전망과 동형:
  //   무장 가능(무기 재고)·식량 안보(40일)·자리 있음.
  if ((counts.warrior || 0) < warriorTarget(v) && foodEquiv > N * 40
      && (v.storage.weapon || 0) >= (counts.warrior || 0) + 1 && hasSlot(v, 'warrior', cap, counts)) return 'warrior';
  if ((counts.tailor || 0) < tailorTarget(v)) return 'tailor';   // ★의복(2026-07-12): 재봉사 — 스톡-플로우 노동목표(장인 패턴). 옷감 게이트는 tailorTarget 내(옷감 보온-eq<1 → 0 — 요리사 결함[픽커 후보 부재] 재발 방지로 여기 명시 등록)
  // ★주거 압박: 집이 거의 가득(인구 성장 막힘) + 집 지을 목재 부족 → 나무꾼. 집 지어야 인구가 늚 → 고리를 닫는 안전망.
  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
  // ★S1 석재 안전망: 돌은 채집자원 — 돌밭/강가(land.stone 충분) 마을이 석재 부족하면 채집꾼(광부 아님). 집·도구 석재 수요 → 채집. 돌 없으면(stone≤0.25) 안 함(교역 의존).
  //   ★[2026-08-02c] STONE_NET 이 켜지면 경계는 위 선순위 줄에서 `>=0.25` 로 다시 잡힌다(여긴 재고 문턱 N*1.5 = 집·도구 통합 수요라 그대로 둔다).
  if ((v.land.stone || 0) > (STONE_NET_ON ? 0.2499 : 0.25) && (v.storage.stone || 0) < N * 1.5 && hasSlot(v, 'forager', cap, counts)) return 'forager';
  // ★호위 안전망: 행상이 도적에게 죽은 적 있고(tradersKilled) 전사 부족 + 식량 여유면 전사 양성.
  //   → 전사가 무기·갑옷 수요 → 광석·석재 수요 → 채광. (도적→전사→광업 사슬을 닫음)
  if (v.tradeStats && (v.tradeStats.tradersKilled || 0) > 3 && (counts.warrior || 0) < warriorTarget(v) && foodEquiv > N * 40 && (v.storage.weapon || 0) >= (counts.warrior || 0) + 1 && hasSlot(v, 'warrior', cap, counts)) return 'warrior';   // ★무기(돌칼/철칼) 있어야 전사 + readiness 목표 이내

  // === 한계 효용 계산 — 각 직업 1명 추가 시 기대 가치 (식량 환산 단위) ===
  const period = 100;  // 평가 윈도우 100일
  const FOOD_VALUE = 1;
  const ts = v.tradeStats || { caravansSent: 0, caravansRaided: 0, cargoSent: 0, foodImported: 0 };
  const caravansSeen = Math.max(0.5, ts.caravansSent);
  const raidRate = Math.min(0.9, ts.caravansRaided / caravansSeen);
  const avgCargo = ts.cargoSent / caravansSeen || 30;
  // v2 hook: world.priceFn 있으면 가격 가중치로 한계가치 조정 (긴 공급 탄력성).
  //   v2 r9: cap 풀기 (0.05~200). 진짜 시장 — 가격 폭락 자원의 직업은 거의 매력 0,
  //   가격 폭등 자원은 압도적 매력. Lewis 모델식 노동 이동.
  const priceTbl = (world && typeof world.priceFn === 'function') ? world.priceFn(v) : null;
  const w = priceTbl ? (r => Math.max(0.05, Math.min(200, (priceTbl[r] || 1) / 1.0))) : (_ => 1.0);

  // 인근 마을 식량 공급 — world.villages에서 infoRange 안의 마을 jobs.farmer 합계
  let nearbyFoodCapacity = 0;
  if (world && world.villages) {
    const infoR = world.infoRange || INFO_RANGE;
    for (const o of world.villages) {
      if (o === v) continue;
      const d = villageDist(v, o);
      if (d > infoR) continue;
      nearbyFoodCapacity += (o.counts?.farmer || 0) * o.land.fertility * 0.4;
    }
  }
  // (1) 농부 한계가치 — 우리 토지의 farmer 1명당 생산 × food 가격
  const farmerGain = v.land.fertility * 0.4 * period * FOOD_VALUE * w('food');
  // (2) 광부 한계가치 — stone 생산 × stone 가격
  const minerGain = Math.max((v.land.ore || 0) * w('ore') * (1 - (v._metalGlut || 0)), (v.land.obsidian || 0) * w('obsidian'), (v.land.jade || 0) * w('jade'), (v.land.tin || 0) * TIN_DEPOSIT_YIELD_FLAT * w('tin') * (1 - (v._tinGlut || 0))) * 0.3 * period;   // ★S1 광부=금속 전담 ★S2 금속글럿↓ ★S5 흑요석·옥 ★청동 희소성 +주석산지
  // (3) 상인 한계가치 — 새 캐러밴 1대 capacity 추가
  const expectedNewTrade = avgCargo * (period / 7) * (1 - raidRate);
  const merchantGain = nearbyFoodCapacity > 0 ? expectedNewTrade * 0.3 * FOOD_VALUE * w('food') : 0;
  // (4) 전사 한계가치 — sqrt 체감, 약탈 손실 줄임
  const curEscort = counts.warrior || 0;
  const dProtection = (Math.sqrt(curEscort + 1) - Math.sqrt(curEscort)) * 0.08;
  const warriorGain = caravansSeen * (period / Math.max(1, ts.windowStartDay ? 100 : 100)) *
                      avgCargo * dProtection * FOOD_VALUE * w('food');

  // 선택지 빌딩 — v2 hook: 모든 산출에 가격 가중치
  const candidates = [];
  if (hasSlot(v, 'farmer', cap, counts))     candidates.push(['farmer',     farmerGain]);
  if (hasSlot(v, 'miner', cap, counts))      candidates.push(['miner',      minerGain]);
  if (hasSlot(v, 'lumberjack', cap, counts)) candidates.push(['lumberjack', v.land.wood * 0.3 * period * w('wood')]);
  if (hasSlot(v, 'fisher', cap, counts))     candidates.push(['fisher',     v.land.water * 1.2 * period * w('fish')]);
  if (hasSlot(v, 'hunter', cap, counts)) {   // ★사냥 위험 프리미엄(기회비용): 생활층이 관측한 부상·호환 사망으로 학습한 v._huntRisk(0~0.6, 미공급 기본 8%)만큼 기대소득 할인 — 위험한 숲은 사냥꾼 배분↓. (위 기근 게이트의 사냥은 무할인 — 절박하면 위험 감수)
    const _hr = Math.min(0.6, Math.max(0, v._huntRisk !== undefined ? v._huntRisk : 0.08));
    candidates.push(['hunter',     v.land.game * 0.7 * period * (w('meat') + 0.3 * w('hide')) * (1 - _hr)]);
  }
  if (hasSlot(v, 'forager', cap, counts))   // ★약재(§9 2차): 채집꾼 한계가치 — 약초 그림자가격이 채집 노동을 끌어당김(hide 패턴 복제). 0.6 = herb 산출비중 15% / 식량계수 0.25. ★S1: +돌 채집 가치(돌밭 마을 채집꾼 매력·석재 조달).
    candidates.push(['forager',    (forageLandMean * 0.25 * (w('vegetable') + 0.6 * w('herb')) + (v.land.stone || 0) * 0.9 * w('stone')) * period * (v._forageScale != null ? v._forageScale : 1)]);   // ×MSY 포화 — 임연부가 차면(CPUE↓) 한계가치도 함께 하락 → 채집 과잉고용 차단
  if (hasSlot(v, 'merchant', cap, counts) && nearbyFoodCapacity > 0)
    candidates.push(['merchant', merchantGain]);
  // warrior — 약탈 자주 일어나는 마을에서만 의미. 추가로 weapon/armor 가용성이 호위 효과 결정.
  //   장비 비싸면 호위 운용 어려움 (가격에 음 반응) + stock 적으면 운용 어려움.
  if (hasSlot(v, 'warrior', cap, counts) && caravansSeen > 1 && raidRate > 0.05 &&
      (counts.warrior || 0) < warriorTarget(v) &&   // ★readiness 목표(약탈률×교역량) 이내 — 글럿 마을 전사 과잉 방지
      (v.storage.weapon || 0) >= (counts.warrior || 0) + 1) {   // ★전사 게이트: 1인 1무기(돌칼/철칼) 보유 필수
    const curWarrior = counts.warrior || 0;
    const equipStock = (v.storage.weapon || 0) + (v.storage.armor || 0);
    const equipReady = Math.min(1, equipStock / Math.max(1, (curWarrior + 1) * 2));
    // 가격 비쌀수록 신규 무장 부담 (1/sqrt(price))
    const equipCostMult = 1 / Math.sqrt(Math.max(1, (w('weapon') + w('armor')) / 2));
    const adjustedWarriorGain = warriorGain * (0.3 + 0.7 * equipReady) * equipCostMult;
    candidates.push(['warrior', adjustedWarriorGain]);
  }
  // ★대장장이·무기장·갑옷장은 marginal 후보에서 제외 — 위의 스톡-플로우 노동목표(smithTarget 등)가
  //   전담 결정. 자본재 장인을 식량·자원직과 한계가치로 경쟁시키면 글럿 마을서 과잉(도구가격 floor 탓).
  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates.length > 0) return candidates[0][0];
  return null;
}

// 자율 직업 전환 — 매 7일 1명만
function autoSwitchJob(v, day, world) {
  // ★★[2026-08-02c SWITCH2] 인구 2 마을은 **직업 전환이 통째로 꺼져 있었다.** 아래 조기반환 안의 안전망은
  //   "식량직 0명 + 기근" 이라는 아주 좁은 조건만 본다 — 실측 좀비들(어촌9 어부2 · 광산2 농부1 어부1)은
  //   전부 식량직이 차 있고 곳간도 넉넉해 이 안전망에 안 걸리고, 그대로 800일을 같은 직업으로 산다.
  //   → 도구를 만들 석공으로도, 집을 지을 나무꾼으로도 못 바꾼다. 문턱을 2로 내려 정상 픽커 경로를 연다.
  if (v.npcs.length < (SWITCH2_ON ? 2 : 3)) {
    // ★죽음의 나선 방지: 소수 인구 + 식량위기 + 식량생산자 0이면, 가장 맞는 식량직업으로 강제 전환(회복 보장).
    const c0 = jobCounts(v);
    const foodWorkers = (c0.farmer || 0) + (c0.fisher || 0) + (c0.hunter || 0) + (c0.forager || 0);
    if (foodWorkers === 0 && v.npcs.length >= 1 && totalFoodEquivalent(v) < v.npcs.length * 30) {
      const opts = [['farmer', v.land.fertility * 1.5], ['fisher', v.land.water * 1.2], ['hunter', v.land.game * 0.7], ['forager', 0.3]];
      opts.sort((a, b) => b[1] - a[1]);
      const _n0 = v.npcs.find(n => !n.captive) || v.npcs[0];   // ★[포로 게이트] 강제 식량직 전환도 자유민 우선(hunter=무기 직 가능성) — captive 없으면 npcs[0] 그대로(무해)
      switchNPCJob(_n0, opts[0][0], day, v);   // 한 명을 농사/어로/사냥 중 땅에 맞는 걸로
    }
    return;
  }
  const picker = world && world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
  const need = picker(v, world);
  v._dbgSwitch = { day, need: need || null, did: null };   // ★진단(_dpDebug 스타일): picker 판단·전환 결과 추적
  if (!need) return;  // 자리 없으면 전환 불가
  const counts = jobCounts(v);
  const N = v.npcs.length;
  // ★무장불가 전사 우선 동원해제 — need 과포화 가드(아래)에 막히지 않게 전용 처리.
  //   무기 없는 전사는 전사가 아니라 유휴 인력 → 땅에 맞는 식량직으로(쿨다운 지나면).
  {
    const armed = Math.floor(v.storage.weapon || 0);
    if ((counts.warrior || 0) > armed) {
      for (const n of v.npcs) {
        if (n.currentJob !== 'warrior') continue;
        if (day - n.lastJobChangeDay < 30) continue;
        const opts = [['farmer', v.land.fertility * 1.5], ['fisher', v.land.water * 1.2], ['hunter', v.land.game * 0.7], ['forager', 0.3]];
        opts.sort((a, b) => b[1] - a[1]);
        switchNPCJob(n, opts[0][0], day, v);
        return;   // 한 번에 1명(churn 억제)
      }
    }
  }
  // ★40% 직업 점유율 가드 폐지 — 잔존 비율 하드캡이었음("직업 정원 폐지" 철학과 모순).
  //   치명 시나리오(시드7): 기근 게이트가 farmer 요구 → 농부 44%라 차단 → *어떤* 전환도 없이 300일+ 데드락(need는 매번 farmer로 재계산되므로).
  //   자연 포화는 이미 있음: 자리(jobCapacity·hasSlot=토지), 장인=스톡-플로우 목표, 전사=무기 게이트, churn은 쿨다운·21일 간격·차익거래 히스테리시스가 억제.
  //   농업촌이 농부 60%인 건 역사적으로 정상 — 비율은 땅이 정하게 둔다.
  // 잉여 직군에서 NPC 1명 — ★시장가치(기회비용) 가장 낮은 NPC = 글럿 재화 생산자.
  //   (옛 surplusBonus[25%미만 보호] 제거 — 그게 도구 글럿에도 10% 대장장이를 고착시킨 원인.
  //    시장가치가 직접 결정: 도구가격 폭락 → 대장장이 비용 최저 → 부족직으로 전환됨.)
  const priceTbl = (world && typeof world.priceFn === 'function') ? world.priceFn(v) : null;
  const w = priceTbl ? (r => Math.max(0.05, Math.min(200, (priceTbl[r] || 1) / 1.0))) : (_ => 1.0);
  let bestIdx = -1, bestCost = Infinity;
  for (let i = 0; i < v.npcs.length; i++) {
    const n = v.npcs[i];
    if (n.currentJob === need) continue;
    if (n.captive && CAPTIVE_JOB_BAN[need]) continue;   // ★[포로 게이트] 포로에게 전사·사냥꾼(무기 직) 배정 금지 — captive 없으면 무해(항상 통과)
    if (day - n.lastJobChangeDay < 30) continue;  // 쿨다운(개인 단위 churn 억제)
    const cost = opportunityCost(n, v, w);
    if (cost < bestCost) { bestCost = cost; bestIdx = i; }
  }
  if (bestIdx >= 0) {
    // ★히스테리시스(churn 억제) — *차익거래 조건*으로: 식량 안정 + 후보가 생산적(>0.15)이어도,
    //   need 직업의 한계가치가 후보의 현재 가치 ×1.3(전환 마찰)을 넘으면 전환한다.
    //   (옛 절대 유보(0.15)만으론 '식량은 안보인데 연료·주거가 기아'인 마을에서 벌목 need가 영원히 보류 —
    //    시드7 농업촌 N=21 고착: 목재 0→주거게이트 dP=0 영구. 부족 재화의 그림자가격이 needValue를 키워 스스로 뚫는다.)
    const foodSec = totalFoodEquivalent(v) > (v.npcs.length || 1) * 30;
    if (foodSec && bestCost > 0.15) {
      const OUT1 = { farmer: 1.5 * (v.land.fertility || 0), fisher: 1.2 * (v.land.water || 0), hunter: 0.7 * (v.land.game || 0),
        lumberjack: 0.9 * (v.land.wood || 0), miner: 0.7 * (v.land.ore || 0), forager: 0.8,
        mason: 1.0, smith: 0.9, weaponsmith: 0.8, armorsmith: 0.8, cook: 1.0, warrior: 0.3,
        tailor: 0.5 };   // ★[재민 지시 "결함 전부 수정"] tailor 누락 보수 — jdef.base 0.5(하루 옷 0.5벌)
      const OUTRES = { farmer: 'food', fisher: 'fish', hunter: 'meat', lumberjack: 'wood', miner: 'ore', forager: 'food',
        mason: 'tool', smith: 'weapon', weaponsmith: 'weapon', armorsmith: 'armor', cook: 'cooked_food', warrior: 'weapon',
        tailor: 'clothes' };   // ★S2 mason 산출=석기(tool) · smith 산출=청동/철 무기(weapon)
      // ★★[재민 지시 "결함 전부 수정" 2026-08-01] tailor가 이 두 표에 없어서 needValue가 폴백
      //   (0.5 × w('food'))로 계산됐다 — 재봉 전환의 가치를 **옷 가격이 아니라 식량 가격**으로 재던 것.
      //   실측(시드7 rational): need='tailor' 92회 중 68회가 hold(0.50<…)로 보류 → 6마을 CLI 세계에선
      //   800일 내내 재봉사 0·옷 0벌(의복 축 전체 사망 — 요리사 '유령 박멸 #4'와 같은 계열의 표 누락).
      //   표 누락은 test-picker-tables.js가 상시 감시한다(merchant는 산출재 없음 — 명시 예외).
      const needValue = (OUT1[need] || 0.5) * w(OUTRES[need] || 'food');
      if (needValue < bestCost * 1.3) { v._dbgSwitch.did = 'hold(' + needValue.toFixed(2) + '<' + (bestCost * 1.3).toFixed(2) + ')'; return; }
    }
    switchNPCJob(v.npcs[bestIdx], need, day, v);
    v._dbgSwitch.did = v.npcs[bestIdx].currentJob;
  }
}

// =============================================================================
// 4. 거래소 (마을 간 매물)
// =============================================================================
function tickTrade(world, day) {
  if (day % TRADE_INTERVAL !== 0) return;  // 매 3일 거래 사이클 (가격 변동 ↑)

  // 마을당 안전 reserve (인구 비례)
  const RESERVE = RESERVE_PC;   // ★공유표(위 RESERVE_PC) — 두 벌로 갈라지면 반드시 어긋난다
  const TRADABLE = Object.keys(RESERVE);
  // ★위신재 — 웃돈 상한을 따로 둔다(v2 LUX_ADJ_MAX 와 같은 근거: 천장 있는 효용에 무한한 값 금지).
  const LUXV1 = LUX_V1, LUXV1_ADJ_MAX = LUX_V1_ADJ_MAX;
  // ★유효수요 — 세계 총공급 중 내 인구 몫을 넘는 목표를 세우지 않는다(v2 동형).
  //   필수재는 제외한다: 식량은 세계에 없어도 원해야 기근 신호가 산다.
  const ESSENTIAL = ESSENTIAL_V1;
  let _wsCache = null;
  const worldShare = (r, N) => {
    if (!_wsCache) {
      _wsCache = { stock: {}, pop: 0 };
      for (const u of world.villages) {
        _wsCache.pop += (u.npcs && u.npcs.length) || 0;
        const st = u.storage || {};
        for (const k in st) if (st[k] > 0) _wsCache.stock[k] = (_wsCache.stock[k] || 0) + st[k];
      }
    }
    return (_wsCache.stock[r] || 0) * (N / Math.max(1, _wsCache.pop));
  };

  // 1) 각 마을 가격표 + 잉여/부족 + merchant capacity 계산
  const data = [];
  for (const v of world.villages) {
    if (v.isolated && day < v.isolatedUntilDay) continue;   // 봉쇄 = 교역 차단
    const N = v.npcs.length || 1;
    // Phase 4d-8: 동적 수요 계산
    const cons = computeDailyConsumption(v);
    const prices = {};
    const offer  = {};
    const demand = {};
    for (const r of TRADABLE) {
      let reserve = computeDynReserve(v, cons, r, RESERVE[r]);
      if (!ESSENTIAL[r]) reserve = Math.min(reserve, Math.max(0.2, worldShare(r, N) * 1.5));   // 유효수요
      const stock = v.storage[r] || 0;
      const ratio = Math.max(-0.9, Math.min(2.0, (reserve - stock) / Math.max(1, reserve)));
      let adj = Math.max(0.1, 1 + ratio * 2);
      if (LUXV1[r]) adj = Math.min(adj, LUXV1_ADJ_MAX);   // 위신재 웃돈 상한
      prices[r] = (BASE_VALUE[r] || 1) * adj;
      // offer/demand 임계도 동적 reserve 기준
      if (stock > reserve * 0.5) offer[r] = Math.max(0, stock - reserve * 0.3);
      if (stock < reserve * 1.2) demand[r] = Math.max(0, reserve * 1.2 - stock);
    }
    const merchantCount = v.counts.merchant || 0;
    // Phase 4d-4: 인구 기반 최소 capacity 보장 (merchant 없는 마을도 거래 가능 — 마을이 자체로 운반)
    const capacity = Math.max(N * 10, merchantCount * 100);
    data.push({ v, prices, offer, demand, capacity, used: 0 });
  }

  // 2) 매칭 — 모든 쌍 (A, B)에 대해 가격 차이 큰 자원부터 거래.
  //    A의 행상이 출발 → B 마을에서 양방향 교환 → 돌아옴.
  //    B의 capacity는 안 봄 (A의 행상만 있어도 거래 성립. 사막 같은 비활성 마을도 받기 가능).
  const shuffled = data.slice().sort(() => srand() - 0.5);
  for (const a of shuffled) {
    if (a.used >= a.capacity) continue;
    for (const b of shuffled) {
      if (a === b) continue;
      // 거리 필터 — 시세 정보 도달 범위 안만 매칭 후보
      const d = villageDist(a.v, b.v);
      const infoR = world.infoRange || INFO_RANGE;
      if (d > infoR) continue;
      // A의 offer 중 B의 demand인 것
      for (const giveRes of Object.keys(a.offer)) {
        if (!b.demand[giveRes] || a.offer[giveRes] <= 0) continue;
        const aPrice_give = a.prices[giveRes];
        const bPrice_give = b.prices[giveRes];
        if (bPrice_give <= aPrice_give * 1.05) continue;  // 5% 마진 이상이면 거래
        // B의 offer 중 A의 demand인 것 (역방향)
        for (const wantRes of Object.keys(b.offer)) {
          if (!a.demand[wantRes] || b.offer[wantRes] <= 0) continue;
          const aPrice_want = a.prices[wantRes];
          const bPrice_want = b.prices[wantRes];
          if (aPrice_want <= bPrice_want * 1.05) continue;
          // 거래 성립 — 교환량 결정 (둘 다 capacity 한계 + offer/demand 한계)
          const maxGive = Math.min(
            a.offer[giveRes], b.demand[giveRes],
            a.capacity - a.used,
            30  // 한 거래 30단위 cap
          );
          if (maxGive < 1) continue;
          // 교환비 = 평균 가격 비율 (양 마을의 중간)
          const avgGivePrice = (aPrice_give + bPrice_give) / 2;
          const avgWantPrice = (aPrice_want + bPrice_want) / 2;
          const wantPerGive = avgGivePrice / avgWantPrice;
          const wantAmt = maxGive * wantPerGive;
          const maxWant = Math.min(b.offer[wantRes], a.demand[wantRes]);
          // 실제 교환량 — 양쪽 한계 맞춤
          let actualGive = maxGive, actualWant = wantAmt;
          if (wantAmt > maxWant) {
            actualWant = maxWant;
            actualGive = maxWant / wantPerGive;
          }
          if (actualGive < 1 || actualWant < 0.5) continue;
          // 출발 — A의 chest에서 give 자원 행상이 가져감 (즉시 차감)
          a.v.storage[giveRes] -= actualGive;
          a.used += actualGive + actualWant;
          a.offer[giveRes]  -= actualGive;
          a.demand[wantRes] -= actualWant;
          b.demand[giveRes] -= actualGive;
          b.offer[wantRes]  -= actualWant;
          // warrior 호위 — 화물량 비례 요청, 마을 warrior 수만큼 최대
          const requested = Math.ceil((actualGive + actualWant) / ESCORT_PER_CARGO);
          const escort = Math.min(a.v.counts.warrior || 0, requested);
          // Phase 4d-5: 마을 NPC 1명을 캐러밴에 부착 (실제 인구 -1)
          //   우선순위: merchant > warrior > 그 외 (단 필수직군 농부/요리사 등은 마지막)
          //   pop이 너무 적으면(<=3) 출발 안 함 (마을 붕괴 방지)
          if (a.v.npcs.length <= 3) continue;
          let pickIdx = -1;
          const PRIO = ['merchant', 'warrior', 'hunter', 'forager', 'lumberjack', 'miner', 'fisher', 'smith', 'mason', 'cook', 'farmer'];
          for (const j of PRIO) {
            pickIdx = a.v.npcs.findIndex(n => n.currentJob === j);
            if (pickIdx >= 0) break;
          }
          if (pickIdx < 0) continue;
          const caravanNpc = a.v.npcs[pickIdx];
          // Phase 4d-10: NPC 빼지 않음 — sim 인구·counts 그대로 (zone entity가 직접 이동 시각화 가져감)
          //   사용자 의도: 상인이 떠나도 마을에 "출장" 상태로 유지. 식량 소비 정상.
          // Phase 4d-6: tradeStats 기록
          if (a.v.tradeStats) {
            a.v.tradeStats.caravansSent++;
            a.v.tradeStats.cargoSent += actualGive + actualWant;
          }
          // caravan 객체 생성 (이동 시작) — 5일 고정 + npc 동행
          const travelDays = 5;
          world.caravans.push({
            from: a.v, to: b.v,
            giveRes, wantRes,
            giveAmt: actualGive, wantAmt: actualWant,
            distance: d, escort,
            departDay: day,
            arriveDay: day + travelDays,
            returnArriveDay: day + travelDays * 2,
            state: 'outbound',
            npc: caravanNpc,           // 빌려온 NPC
            npcName: caravanNpc.name,  // 시각화용
            npcJob: caravanNpc.job,
          });
          if (a.used >= a.capacity) break;
        }
        if (a.used >= a.capacity) break;
      }
      if (a.used >= a.capacity) break;
    }
  }
}

// =============================================================================
// 4.3 이주 — 자급 어려운 마을의 NPC가 풍요 마을로 이동. 매 60일.
// =============================================================================
function tickMigration(world, day) {
  if (day % 60 !== 0 || day < 200) return;
  for (const src of world.villages) {
    if (src.npcs.length <= 2) continue;  // 너무 작으면 보호
    // 자급도 측정
    const N = src.npcs.length;
    const surplus = src.surplusEMA.food;
    const ratio = (surplus + N) / N;
    if (ratio >= 1.0) continue;  // 자급 OK인 마을은 이주 X
    // 인근 풍요 마을 찾기 — 자급 1.5+ + N < 500
    let best = null, bestScore = -Infinity;
    for (const dst of world.villages) {
      if (dst === src) continue;
      const distD = villageDist(src, dst);
      const infoR = world.infoRange || INFO_RANGE;
      if (distD > infoR * 1.5) continue;  // 이주는 정보 범위보다 좀 더
      const dstN = dst.npcs.length;
      if (dstN >= POP_MAX) continue;
      const dstSurplus = dst.surplusEMA.food;
      const dstRatio = (dstSurplus + dstN) / Math.max(1, dstN);
      if (dstRatio < 1.5) continue;  // 풍요 X면 안 받음
      const score = dstRatio - distD / 1000;
      if (score > bestScore) { bestScore = score; best = dst; }
    }
    if (!best) continue;
    // 가장 젊은 NPC 1명 이주
    let youngestIdx = 0;
    for (let i = 1; i < src.npcs.length; i++) {
      if (src.npcs[i].age < src.npcs[youngestIdx].age) youngestIdx = i;
    }
    const npc = src.npcs.splice(youngestIdx, 1)[0];
    src.counts[npc.currentJob] = (src.counts[npc.currentJob] || 0) - 1;
    // 도착 마을에서 새 직업 (pickInitialJob)
    const newJob = pickInitialJob(best);
    npc.currentJob = newJob;
    best.npcs.push(npc);
    best.counts[newJob] = (best.counts[newJob] || 0) + 1;
    console.log(`  🚶 Day ${day}: 이주 → ${src.name}(N=${src.npcs.length}) → ${best.name}(N=${best.npcs.length})`);
  }
}

// =============================================================================
// 4.4 NPC 길드 세율 자동 조절 — hill climbing. 매 30일.
//   세수 늘면 같은 방향 유지. 줄면 반대로. 라퍼 곡선 정점 수렴 기대.
// =============================================================================
function adjustGuildTax(v, day) {
  if (day % 30 !== 0 || day < 60) return;
  // treasury 누적 총 가치
  const t = v.treasury;
  const income = (t.food||0) + (t.wood||0)*1.67 + (t.stone||0)*2.14 + (t.tool||0)*5.0
               + (t.fish||0)*1.25 + (t.meat||0)*2.14 + (t.ore||0)*3.0;
  // 이번 30일 동안 들어온 세수 = 누적 - 30일 전 누적
  const recentIncome = income - v.guild._lastIncome;
  // 이전 30일 세수와 비교 — hill climbing
  const delta = recentIncome - (v.guild._lastRecentIncome || 0);
  if (delta > 0.01) {
    // 좋아짐 — 같은 방향 유지
    v.guild.taxRate = Math.max(0.01, Math.min(0.25, v.guild.taxRate + v.guild._direction));
  } else if (delta < -0.01) {
    // 안 좋아짐 — 방향 반대
    v.guild._direction = -v.guild._direction;
    v.guild.taxRate = Math.max(0.01, Math.min(0.25, v.guild.taxRate + v.guild._direction));
  }
  // 다음 비교용 기록
  v.guild._lastRecentIncome = recentIncome;
  v.guild._lastIncome = income;
}

// =============================================================================
// 4.5 캐러밴 진행 — 매일 호출. 도착/귀환 시점에 자원 transfer + 약탈 처리.
// =============================================================================
function tickCaravans(world, day) {
  if (!world.caravans || world.caravans.length === 0) return;
  for (const c of world.caravans) {
    if (c._done) continue;

    // 도착 시점 — 거래 처리 + 약탈 1차
    if (c.state === 'outbound' && day >= c.arriveDay) {
      // 약탈 확률 — 거리 비례, 호위 보너스
      // Phase 4d-7: warrior 호위력 = sqrt(escort) × (0.08 + weapon ratio × 0.05 + armor ratio × 0.05)
      //   무기/갑옷 비율: 마을 storage에서 호위 수 만큼 소비
      const wReady = Math.min(1, (c.from.storage.weapon || 0) / Math.max(1, c.escort));
      const aReady = Math.min(1, (c.from.storage.armor  || 0) / Math.max(1, c.escort));
      // Phase 5-5-econ-d: defense stat 가산 (무기/갑옷 외 마을 자체 방어력)
      const defenseBonus = (c.from.lastStats && c.from.lastStats.defense) ? c.from.lastStats.defense * 0.12 : 0;
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05) + defenseBonus;
      const raidProb = Math.max(0.01,
        Math.min(RAID_MAX, RAID_BASE + (c.distance / 100) * (world.raidPer100 || RAID_PER_100) - protection));
      let outboundLoss = 0;
      if (srand() < raidProb) {
        outboundLoss = 0.3 + srand() * 0.4;
        if (c.from.tradeStats) { c.from.tradeStats.caravansRaided++; c.from.tradeStats.cargoLost += c.giveAmt * outboundLoss; }
        console.log(`  💀 Day ${day}: 캐러밴 약탈 (가는 길) → ${c.from.name} → ${c.to.name} (${c.giveRes} ${(c.giveAmt * outboundLoss).toFixed(1)} 손실, 호위 ${c.escort}명)`);
      }
      const deliveredGive = c.giveAmt * (1 - outboundLoss);
      // 도착 — B의 chest에 give 자원 입금, want 자원 행상이 받음
      c.to.storage[c.giveRes] = (c.to.storage[c.giveRes] || 0) + deliveredGive;
      c.to.storage[c.wantRes] -= c.wantAmt;
      // 세금 — B의 세율 적용
      const tax = c.to.guild.taxRate;
      const taxAmt = c.wantAmt * tax;
      c.to.treasury[c.wantRes] = (c.to.treasury[c.wantRes] || 0) + taxAmt;
      // 행상이 받아 가는 양 (세금 차감)
      c._received = c.wantAmt * (1 - tax);
      c.state = 'inbound';
      world.tradeLog.push({
        day, a: c.from.name, b: c.to.name,
        aGave: { res: c.giveRes, amt: c.giveAmt.toFixed(1) },
        bGave: { res: c.wantRes, amt: c.wantAmt.toFixed(1) },
        distance: c.distance.toFixed(0),
        escort: c.escort,
        raided: outboundLoss > 0,
      });
    }
    // 귀환 시점 — A chest에 받은 자원 입금. 귀환 길 약탈 2차.
    else if (c.state === 'inbound' && day >= c.returnArriveDay) {
      // Phase 4d-7: warrior 호위력 = sqrt(escort) × (0.08 + weapon ratio × 0.05 + armor ratio × 0.05)
      //   무기/갑옷 비율: 마을 storage에서 호위 수 만큼 소비
      const wReady = Math.min(1, (c.from.storage.weapon || 0) / Math.max(1, c.escort));
      const aReady = Math.min(1, (c.from.storage.armor  || 0) / Math.max(1, c.escort));
      // Phase 5-5-econ-d: defense stat 가산 (무기/갑옷 외 마을 자체 방어력)
      const defenseBonus = (c.from.lastStats && c.from.lastStats.defense) ? c.from.lastStats.defense * 0.12 : 0;
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05) + defenseBonus;
      const raidProb = Math.max(0.01,
        Math.min(RAID_MAX, RAID_BASE + (c.distance / 100) * (world.raidPer100 || RAID_PER_100) - protection));
      let inboundLoss = 0;
      if (srand() < raidProb) {
        inboundLoss = 0.3 + srand() * 0.4;
        if (c.from.tradeStats) { c.from.tradeStats.caravansRaided++; c.from.tradeStats.cargoLost += c._received * inboundLoss; }
        console.log(`  💀 Day ${day}: 캐러밴 약탈 (귀환) → ${c.to.name} → ${c.from.name} (${c.wantRes} ${(c._received * inboundLoss).toFixed(1)} 손실, 호위 ${c.escort}명)`);
      }
      const received = c._received * (1 - inboundLoss);
      c.from.storage[c.wantRes] = (c.from.storage[c.wantRes] || 0) + received;
      // Phase 4d-6: 식량 수입 기록 (food/cooked_food/fish/meat)
      if (c.from.tradeStats && (c.wantRes === 'food' || c.wantRes === 'cooked_food' || c.wantRes === 'fish' || c.wantRes === 'meat')) {
        c.from.tradeStats.foodImported += received;
      }
      // Phase 4d-10: NPC 안 빼고 안 빼니 복귀 코드도 제거 (sim 인구·counts 변동 X)
      c._done = true;
    }
  }
  // 완료된 caravan 제거
  world.caravans = world.caravans.filter(c => !c._done);
}

// =============================================================================
// 5. 이벤트 (봉쇄만 — 약탈은 캐러밴 약탈로 tickTrade에서 처리)
// =============================================================================
function processEvents(world, day) {
  for (const e of world.events) {
    if (e.day === day && e.type === 'blockade') {
      const v = world.villages.find(v => v.name === e.target);
      if (v) {
        v.isolated = true;
        v.isolatedUntilDay = day + e.duration;
        console.log(`\n  💥 Day ${day}: BLOCKADE → ${v.name} (${e.duration}일)`);
      }
    }
  }
  // 자동 해제
  for (const v of world.villages) {
    if (v.isolated && day >= v.isolatedUntilDay) {
      v.isolated = false;
      console.log(`  🕊  Day ${day}: ${v.name} 봉쇄 해제`);
    }
  }
}

// =============================================================================
// 6. 출력
// =============================================================================
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }
function padR(s, n) { s = String(s); return s.length >= n ? s : ' '.repeat(n - s.length) + s; }

function printSnapshot(world, day) {
  console.log(`\n=== Day ${day} ===`);
  console.log(pad('Village', 12) + padR('Pop', 5) + padR('Size', 6) +
    padR('Ex', 4) + padR('Food≈', 8) +
    padR('TrFd', 7) + padR('TrWd', 6) + padR('TrSt', 6) +
    '  Jobs (fa/fi/hu/fo/lu/mi/pr/sm/co)');
  for (const v of world.villages) {
    const N = v.npcs.length;
    const c = jobCounts(v);
    const order = ['farmer', 'fisher', 'hunter', 'forager',
                   'lumberjack', 'miner', 'smith', 'cook'];
    const jobStr = order.map(j => `${(c[j] || 0)}`).join('/');
    const iso = v.isolated && day < v.isolatedUntilDay ? ' 🚫' : '';
    console.log(
      pad(v.name, 12) +
      padR(N, 5) +
      padR(v.land.size.toFixed(2), 6) +          // ★셀 단위 확장으로 size 소수 허용 — 표 정렬용 2자리
      padR(v.expansions || 0, 4) +               //   (Ex = 누적 구매 '셀' 수)
      padR(totalFoodEquivalent(v).toFixed(0), 8) +
      padR((v.treasury.food || 0).toFixed(0), 7) +
      padR((v.treasury.wood || 0).toFixed(0), 6) +
      padR((v.treasury.stone || 0).toFixed(0), 6) +
      '  ' + jobStr + iso
    );
  }
}

function printFinalSummary(world, days) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`최종 ${days}일 시뮬레이션 요약`);
  console.log('='.repeat(70));
  for (const v of world.villages) {
    const N = v.npcs.length;
    const c = jobCounts(v);
    const cap = jobCapacity(v);
    console.log(`\n${v.name} (인구 ${N}명, size ${v.land.size.toFixed(2)} ← base ${v.land.baseSize}, 확장 ${v.expansions}셀)`);
    console.log(`  땅: fertility=${v.land.fertility.toFixed(2)} wood=${v.land.wood.toFixed(2)} stone=${v.land.stone.toFixed(2)} ore=${v.land.ore.toFixed(2)} water=${v.land.water.toFixed(2)} game=${v.land.game.toFixed(2)}`);
    console.log(`  자리: farmer=${cap.farmer} fisher=${cap.fisher} hunter=${cap.hunter} forager=${cap.forager} lumber=${cap.lumberjack} miner=${cap.miner}`);
    console.log(`  금고: food=${(v.treasury.food||0).toFixed(0)} wood=${(v.treasury.wood||0).toFixed(0)} stone=${(v.treasury.stone||0).toFixed(0)} (다음 1셀 비용: food=${(expandCost(v).food/EXPAND_CELLS_PER_SLOT).toFixed(1)} wood=${(expandCost(v).wood/EXPAND_CELLS_PER_SLOT).toFixed(1)} stone=${(expandCost(v).stone/EXPAND_CELLS_PER_SLOT).toFixed(1)})`);
    console.log(`  직업: ${JOB_NAMES.map(j => `${j}=${c[j] || 0}`).join(', ')}`);
    // HHI 계산 (특화 정도)
    const shares = JOB_NAMES.map(j => (c[j] || 0) / N);
    const hhi = shares.reduce((s, sh) => s + sh * sh, 0);
    console.log(`  HHI=${hhi.toFixed(3)} (1=완전특화, ${(1 / JOB_NAMES.length).toFixed(3)}=완전균형)`);
    console.log(`  창고: ${RESOURCES.map(r => `${r}=${v.storage[r].toFixed(0)}`).join(', ')}`);
    // 평균 skill
    const avgSkills = {};
    for (const f of FIELDS) {
      const total = v.npcs.reduce((s, n) => s + n.skills[f], 0);
      avgSkills[f] = (total / N).toFixed(1);
    }
    console.log(`  평균 skill: ${Object.entries(avgSkills).map(([f, s]) => `${f}=${s}`).join(', ')}`);
  }
  console.log(`\n총 교역 횟수: ${world.tradeLog.length}`);
  if (world.tradeLog.length > 0) {
    console.log(`최근 교역 5건:`);
    world.tradeLog.slice(-5).forEach(t =>
      console.log(`  Day ${t.day}: ${t.a} ↔ ${t.b}  (${t.a}→${t.aGave.res}${t.aGave.amt}, ${t.b}→${t.bGave.res}${t.bGave.amt})`)
    );
  }
}

// =============================================================================
// 7. 메인
// =============================================================================
function main() {
  const args = process.argv.slice(2);
  const TOTAL_DAYS = parseInt(args[0]) || 1000;
  const SEED = parseInt(args[1]) || 42;
  const VILLAGE_COUNT = parseInt(args[2]) || 5;
  setSeed(SEED);

  console.log(`🌾 NPC 마을 자율 경제 시뮬레이션 (${TOTAL_DAYS}일, ${VILLAGE_COUNT}마을, seed=${SEED})`);

  const namePool = ['평원','삼림','산악','해안','습지','초원','사막','계곡','고원','호수',
                    '강변','구릉','수림','협곡','초지','목초','옥토','암벽','늪지','폭포',
                    '단애','분지','저지','오아시스','목책','목장','관목','첨봉','만곡','갈대'];
  const villages = [];
  for (let i = 0; i < VILLAGE_COUNT; i++) {
    // 토지 분포 — 극단 분업 강제 (사막=광산, 호수=어업 등 archetype 자연 발생)
    const fert  = 0.15 + srand() * 2.0;   // 0.15 ~ 2.15
    const wood  = 0.15 + srand() * 2.0;
    const stone = 0.15 + srand() * 2.0;
    const ore   = 0.05 + srand() * 1.8;
    const water = 0.05 + srand() * 2.0;
    const game  = 0.10 + srand() * 1.8;
    const size = 35 + Math.floor(srand() * 45);
    const initPop = 6 + Math.floor(srand() * 5);
    // ★S5 특수 산지(흑요석·옥) — CLI 러너도 동일 부존 규칙(비교우위 특산지)
    const _obR = srand(), _jaR = srand();
    const obsidian = _obR < 0.25 ? 0.6 + srand() * 1.2 : 0;
    const jade     = _jaR < 0.15 ? 0.5 + srand() * 1.0 : 0;
    villages.push(createVillage({
      name: namePool[i] || `마을${i+1}`,
      fertility: fert, wood, stone, ore, water, game, size, initialPop: initPop,
      obsidian, jade,
    }));
  }

  // 봉쇄 이벤트 — 매 200~500일에 1번. 부유 마을 우선 (게임에선 전쟁 선포)
  const events = [];
  let evDay = 300;
  while (evDay < TOTAL_DAYS - 100) {
    const target = villages[Math.floor(srand() * villages.length)].name;
    const dur = 100 + Math.floor(srand() * 200);
    events.push({ day: evDay, type: 'blockade', target, duration: dur });
    evDay += 200 + Math.floor(srand() * 300);
  }

  // ★[재민 지시 "결함 전부 수정" 2026-08-01] CLI 세계에 picker 필드가 없어 **legacy picker로 돌고 있었다**
  //   — 실서버(central.js·villages.js)는 전부 'rational'이다. 계측기가 프로덕션과 다른 기계를 재던 것
  //   (검증 원칙 ⑫ "본 게임의 것을 부른다"의 picker판). legacy엔 tailor 규칙 자체가 없어 CLI 세계 의복 축이
  //   800일 내내 0이었다(옷 0벌·재봉사 0 — 프로덕션엔 없는 유령 결함). rational로 정렬한다.
  //   ※회귀표 수치는 이 정렬로 재기준선이 된다(하네스는 수치를 출력만 하고 단정하지 않으므로 코드 파손 없음).
  // ★[재민 확정 "후자로 가자" 후속 2026-08-01] v1 CLI 는 **legacy 로 복귀**한다.
  //   rational 은 world.priceFn(가격 신호)을 전제로 설계된 picker 인데 v1 createWorld/main 은
  //   priceFn 을 안 심는다 — "v1 세계 + rational" 은 w() 가 전부 1.0 인, 프로덕션에 없는 키메라였다.
  //   프로덕션 대변은 v2 CLI(economy-sim-v2 main)와 실지도 랩이 맡고, 여기는 v1 순수 안정성
  //   회귀로만 남는다(econ-regress 는 이미 v2 를 잰다). lab-wiring-check [E] 의 ⚠경고 해소.
  const world = { villages, tradeLog: [], events, caravans: [], picker: 'legacy' };
  for (const v of villages) v._world = world;   // 백참조(placer·글럿 게이트 등이 world 를 봄)

  // 시뮬 루프
  for (let day = 1; day <= TOTAL_DAYS; day++) {
    processEvents(world, day);
    for (const v of world.villages) {
      tickVillage(v, day);
      adjustGuildTax(v, day);
      // 매일 history snapshot (인구/K)
      const N = v.npcs.length;
      const foodProd = v.surplusEMA.food + N * DAILY_FOOD_CONSUMPTION;
      const K = Math.min(v.land.size, Math.max(POP_MIN, foodProd / DAILY_FOOD_CONSUMPTION));
      if (day % 10 === 0) v.history.push({
        day, N, K,
        foodEq: totalFoodEquivalent(v),
        food: v.storage.food,
        surplus: v.surplusEMA.food,
      });
    }
    tickTrade(world, day);
    tickCaravans(world, day);
    // tickMigration(world, day);   // ★이주 폐지(사용자 결정 2026-07) — v2 경로는 원래 OFF. 인구압 밸브는 추후 분촌(分村)으로
    // 출력은 총 ~10회만 (대규모 시뮬에서 콘솔 폭주 방지)
    const printEvery = Math.max(100, Math.floor(TOTAL_DAYS / 10));
    if (day % printEvery === 0 || day === TOTAL_DAYS) printSnapshot(world, day);
  }

  printFinalSummary(world, TOTAL_DAYS);

  // JSON dump (sim/out/sim-result.json)
  const fs = require('fs');
  const path = require('path');
  const outDir = path.join(__dirname, 'out');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  const outFile = path.join(outDir, `sim-${SEED}-${TOTAL_DAYS}d.json`);
  fs.writeFileSync(outFile, JSON.stringify({
    config: { days: TOTAL_DAYS, seed: SEED },
    villages: world.villages.map(v => ({
      name: v.name, land: v.land, coord: v.coord,
      finalPop: v.npcs.length,
      finalStorage: v.storage,
      finalTreasury: v.treasury,
      guild: v.guild,
      jobs: jobCounts(v),
      avgSkills: Object.fromEntries(FIELDS.map(f => {
        const total = v.npcs.reduce((s, n) => s + n.skills[f], 0);
        return [f, v.npcs.length ? total / v.npcs.length : 0];
      })),
      history: v.history,
    })),
    tradeLog: world.tradeLog,
  }, null, 2));
  console.log(`\n📁 JSON dump: ${outFile}`);
}

// CLI 호출 시만 main 실행. require로 임포트되면 모듈로만 사용.
if (require.main === module) main();

// =============================================================================
// 8. 모듈 인터페이스 — central 서버에서 import해서 사용
// =============================================================================
function createWorld(opts = {}) {
  const seed = opts.seed || 42;
  const villageCount = opts.villageCount || 20;
  const namePool = opts.namePool || [
    '평원','삼림','산악','해안','습지','초원','사막','계곡','고원','호수',
    '강변','구릉','수림','협곡','초지','목초','옥토','암벽','늪지','폭포',
    '단애','분지','저지','오아시스','목책','목장','관목','첨봉','만곡','갈대',
  ];
  setSeed(seed);
  const villages = [];
  for (let i = 0; i < villageCount; i++) {
    const fert  = 0.15 + srand() * 2.0;
    const wood  = 0.15 + srand() * 2.0;
    const stone = 0.15 + srand() * 2.0;
    const ore   = 0.05 + srand() * 1.8;
    const water = 0.05 + srand() * 2.0;
    const game  = 0.10 + srand() * 1.8;
    const size = 35 + Math.floor(srand() * 45);
    const initPop = 6 + Math.floor(srand() * 5);
    // ★S5 특수 산지 — 희소 부존(대부분 마을 0). 흑요석(화산지대 ~25%)·옥(옥산지 ~15%). 비교우위 특산지 창발.
    const _obR = srand(), _jaR = srand();
    const obsidian = _obR < 0.25 ? 0.6 + srand() * 1.2 : 0;
    const jade     = _jaR < 0.15 ? 0.5 + srand() * 1.0 : 0;
    villages.push(createVillage({
      name: namePool[i] || `마을${i+1}`,
      fertility: fert, wood, stone, ore, water, game, size, initialPop: initPop,
      obsidian, jade,
    }));
  }
  const world = {
    villages,
    tradeLog: [],
    events: opts.events || [],
    caravans: [],
    day: 0,
    infoRange: opts.infoRange || INFO_RANGE,  // Phase 4d-4: 마을 좌표 스케일별 정보 도달 거리
    raidPer100: opts.raidPer100 || RAID_PER_100, // 거리 100당 약탈 추가 확률 (대규모 zone 보정)
    picker: opts.picker || 'legacy',           // Phase 4d-6: 'legacy' | 'rational'
  };
  // 마을 → 월드 백참조 (rational picker에서 world 접근용)
  for (const v of world.villages) v._world = world;
  return world;
}

// 매 game day 진행. central에서 setInterval로 호출.
function tickWorld(world) {
  world.day += 1;
  processEvents(world, world.day);
  for (const v of world.villages) {
    tickVillage(v, world.day);
    adjustGuildTax(v, world.day);
    const N = v.npcs.length;
    if (world.day % 10 === 0) v.history.push({
      day: world.day, N,
      foodEq: totalFoodEquivalent(v),
      food: v.storage.food,
      surplus: v.surplusEMA.food,
    });
  }
  tickTrade(world, world.day);
  tickCaravans(world, world.day);
  // tickMigration(world, world.day);   // ★이주 폐지(사용자 결정 2026-07) — 밸브는 추후 분촌으로
  // history 메모리 제한 — 최근 500개만 유지
  for (const v of world.villages) {
    if (v.history.length > 500) v.history.splice(0, v.history.length - 500);
  }
  // tradeLog 메모리 제한
  if (world.tradeLog.length > 1000) world.tradeLog.splice(0, world.tradeLog.length - 1000);
}

// 마을 상태 직렬화 (HTTP API용)
function serializeWorld(world) {
  return {
    day: world.day,
    villages: world.villages.map(v => ({
      name: v.name,
      coord: v.coord,
      land: v.land,
      pop: v.npcs.length,
      jobs: jobCounts(v),
      storage: v.storage,
      treasury: v.treasury,
      guild: { taxRate: v.guild.taxRate },
      expansions: v.expansions,
      isolated: v.isolated && world.day < v.isolatedUntilDay,
    })),
    recentTrades: world.tradeLog.slice(-50),
  };
}

// Phase 4d-8: 마을의 자원별 일일 소비량 계산 (NPC 식사 + job input)
//   가격 책정 + 거래 demand 계산에 사용. 동적 수요 반영.
function computeDailyConsumption(v) {
  const cons = {};
  // 1) NPC 식사 — 매일 1 food/명 (또는 food_equiv 대체 — fish/meat/cooked_food)
  //    단순화: food만 카운트. fish/meat는 자체적으로 stock 풍부하면 식사용.
  cons.food = v.npcs.length * 1;
  // 2) job input 소비 (smith의 wood/stone, weaponsmith의 ore/wood/stone 등)
  for (const npc of v.npcs) {
    const jdef = JOBS[npc.currentJob];
    if (!jdef.inputs || Object.keys(jdef.inputs).length === 0) continue;
    const skillLvl = npc.skills[jdef.field] || 0;
    const skillMul = 1 + skillLvl * 0.05;
    const landBoost = jdef.landBoost(v);
    // 도구 효과는 마을 평균으로 추정 (1.2 가정)
    const toolBoost = jdef.toolDependent ? 1.2 : 1.0;
    const estDailyProd = jdef.base * landBoost * skillMul * toolBoost;
    for (const [inp, perOut] of Object.entries(jdef.inputs)) {
      cons[inp] = (cons[inp] || 0) + estDailyProd * perOut;
    }
  }
  return cons;
}

// Phase 4d-8: 동적 reserve = max(baseline 인구 비례, 30일 소비량)
//   소비 0인 자원도 인구 비례 최소 baseline 유지 (시장 미발달 보호)
function computeDynReserve(v, cons, resourceKey, defaultPerPop) {
  const N = v.npcs.length || 1;
  // ★★★[재민 지시 2026-08-01] "모든 기본 비축 목표 없애라" — v2 buffer 와 같은 병이다.
  //   RESERVE_PC × N × 0.3 은 **용도와 무관하게 항상 깔리는 바닥**이었다. 아무도 안 쓰는 재화가
  //   재고 0일 때 최대 부족 프리미엄을 받아, 노동을 그쪽으로 끌어갔다.
  //   ⇒ 생존필수재(ESSENTIAL_V1 — 식량·연료·석재·도구·무기·갑옷)만 바닥을 남기고,
  //     나머지는 **실소비 30일치**만이 목표가 된다. 안 쓰면 0.
  const dailyCons = cons[resourceKey] || 0;
  const baseline = ESSENTIAL_V1[resourceKey] ? (defaultPerPop || 1) * N * 0.3 : 0;
  return Math.max(baseline, dailyCons * 30);  // 30일치 비축
}

// 마을 시세 (가격표) 계산 — 다른 마을 시세 비교용
function computeVillagePrices(v) {
  const N = v.npcs.length || 1;
  const cons = computeDailyConsumption(v);
  const prices = {};
  // 유효수요 — 세계 총공급 중 내 몫(월드 문맥이 있을 때만). 없으면 기존 거동.
  const w = v._world;
  let ws = null;
  if (w && Array.isArray(w.villages)) {
    if (!w._rsCache || w._rsCacheDay !== w.day) {
      const c = { stock: {}, pop: 0 };
      for (const u of w.villages) {
        c.pop += (u.npcs && u.npcs.length) || 0;
        const st = u.storage || {};
        for (const k in st) if (st[k] > 0) c.stock[k] = (c.stock[k] || 0) + st[k];
      }
      w._rsCache = c; w._rsCacheDay = w.day;
    }
    ws = w._rsCache;
  }
  for (const r of Object.keys(RESERVE_PC)) {
    let reserve = computeDynReserve(v, cons, r, RESERVE_PC[r]);
    if (ws && !ESSENTIAL_V1[r]) {
      reserve = Math.min(reserve, Math.max(0.2, (ws.stock[r] || 0) * (N / Math.max(1, ws.pop)) * 1.5));
    }
    const stock = v.storage[r] || 0;
    const ratio = Math.max(-0.85, Math.min(2.0, (reserve - stock) / Math.max(1, reserve)));
    let adj = Math.max(0.3, 1 + ratio * 2);
    if (LUX_V1[r]) adj = Math.min(adj, LUX_V1_ADJ_MAX);
    prices[r] = (BASE_VALUE[r] || 1) * adj;
  }
  // ★중간재 상한 — 원석은 그것이 될 금속보다 비쌀 수 없다(v2 동일 규칙, 사유는 그쪽 주석 참조).
  {
    const mix = oreMixOf(v);   // ★유효 조성 — 곳간에 실제로 든 원석이 무엇이냐로 값을 매긴다
    if (prices.ore != null && mix) {
      let mv = 0, tot = 0;
      for (const k in mix) { const q = mix[k]; if (!(q > 0)) continue; tot += q;
        const _id = k === 'jade_raw' ? 'jade' : k;
        // ★시대 게이트 — 못 뽑는 금속(철 등)은 분자에서 뺀다. 분모엔 남긴다(그 몫은 슬래그 = 실손실).
        if (_ERA_METAL(_id) && !_eraKnows(_id)) continue;
        mv += q * (prices[_id] || 0); }
      if (tot > 0) prices.ore = Math.min(prices.ore, SMELT_YIELD * (mv / tot));
    }
  }
  return prices;
}

module.exports = {
  _LEGACY_CONTRIBUTES: LEGACY_CONTRIBUTES,
  totalFoodEquivalent,   // 진단 하네스가 병기고 식량안보 게이트를 정확히 재려면 필요
  // 가치사슬 하네스(scripts/test-valuechain.js)가 상수를 **복제하지 않고** 읽도록 노출.
  _SMELT_PER_LABOR: SMELT_PER_LABOR, _SMELT_YIELD: SMELT_YIELD, _MELT_TOTAL,
  // ★시대 게이트 조회 — v2 원석 상한이 같은 판정을 쓰도록(사본 금지). 금속이 아니면 항상 true.
  _eraMetalKnown: (id) => !_ERA_METAL(id) || _eraKnows(id),
  // ★유효 제련 조성(2026-08-02b) — v2 가격 상한·교역 층이 **같은 함수**를 쓰도록 노출(사본 금지).
  //   _trySmelt·smeltTarget 은 하네스(scripts/test-oremix.js)가 실제 제련을 돌려 보려고 노출한다.
  oreMixOf, foldOreMix, _trySmelt, smeltTarget,
  // ★부얼타운 판정 — 시딩(villages.js)이 같은 함수를 쓰도록 노출(사본 금지)
  isBoomtown, veinScore, foodCapOf, BOOM_FOOD_MAX, BOOM_VEIN_MIN,
  createWorld,
  tickWorld,
  tickTrade, tickCaravans,   // ★랩이 본 게임과 같은 루프를 돌려면 필요(누락돼 있어서 랩이 '교역 없는 세계'를 재고 있었다)
  serializeWorld,
  computeVillagePrices,
  computeDailyConsumption,
  FORAGE_FOOD_FACTOR,   // ★식량 pull(v2 FOOD_CLASSES 파생용 단일 진실 — 구황·해산물 식용 등가)
  JOB_NAMES,
  FIELDS,
  RESOURCES,
  BASE_VALUE,
  JOBS,
  TIGERHIDE_PRESTIGE_W, TIGERHIDE_PRESTIGE_CAP,   // ★호피(§9 3차): v2 수출규칙이 위신 포화점(CAP/W)을 유도하도록 단일 진실 공유
  // v2 시뮬용 빌려쓰기
  createVillage,
  createNPC,
  tickVillage,
  _cons,   // ★flow-EMA 소비 계측(v2 옹기 진흙 등 v2 소재 소비처용)
  adjustGuildTax,
  tickMigration,
  processEvents,
  jobCounts,
  villageDist,
  setDistMatrix,
  setSeed,
  srand: () => srand(),
  // ★S2 계측/랩 노출 — 노동목표 함수(석공·대장장이)
  masonTarget, smithTarget, weaponsmithTarget, armorsmithTarget, warriorTarget,
  // ★S4 명장 견습(세대 전승)
  apprenticeInherit, villageMasterSkill,
};
