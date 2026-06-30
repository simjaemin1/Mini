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
  ore:         { production: 0.4 },
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
  'iron', 'iron_tool',  // ★철(광맥 전용, 희소) + 철도구(후기 업그레이드, 최고효율)
  'copper', 'tin', 'bronze_tool',  // ★청동기 주력: 구리+주석→청동(대장간) → 청동도구. 구리·주석에 실수요 부여.
  'weapon', 'armor',  // Phase 4d-7: 무기/갑옷
  'fruit', 'vegetable', 'mushroom', 'pebble', 'twig',
];

// 부재료 set (cook이 variety 계산할 때 사용. food + 이 중 어떤 것이든 1종으로 카운트)
const COOK_SIDE_INGREDIENTS = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig'];

// 직업 정의. produceSpecial이 있으면 표준 생산 함수 대신 사용
const JOBS = {
  farmer: {
    field: 'farming', output: 'food', base: 1.5,
    landBoost: (v) => v.land.fertility, toolDependent: true, inputs: {},
    // Phase 5-5-econ-b: 작물 다양화 (wheat·rice·barley·cotton·flax·hemp)
    byproduct: { wheat: 0.25, rice: 0.20, barley: 0.15, cotton: 0.08, flax: 0.06, hemp: 0.05 },
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
    byproduct: { hide: 0.4, fur: 0.15, leather: 0.10, bone: 0.20, feather: 0.10 },
  },
  lumberjack: {
    field: 'woodworking', output: 'wood', base: 0.9,
    landBoost: (v) => v.land.wood, toolDependent: true, inputs: {},
    // Phase 5-5-econ-b: 통나무 종류 + 부산물 (oak·pine·resin·bark·acorn)
    byproduct: { oak_log: 0.20, pine_log: 0.15, resin: 0.08, bark: 0.10, acorn: 0.06 },
  },
  miner: {   // ★통일 광부(탐사꾼 통합): 그 땅의 광맥을 캠 — 금속광맥(ore≥stone) 풍부하면 광석+금속(구리·주석·철), 아니면 돌.
    field: 'mining', output: 'stone', base: 1.5,
    landBoost: (v) => Math.max(v.land.stone || 0, v.land.ore || 0), toolDependent: true, inputs: {},
    produceSpecial: 'miner',   // 산출(돌 vs 광석+금속)은 produceSpecial이 토지로 결정. 부산물도 거기서.
  },
  smith: {                  // 대장장이 — 철 있으면 철도구(고효율), 없으면 돌도구. 철은 광맥에서만 나오므로 대장장이가 철도구의 유일 경로.
    field: 'smithing', output: 'tool', base: 0.4,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { wood: 0.5, stone: 0.3 },
    produceSpecial: 'smith',
  },
  // Phase 4d-7: 무기/갑옷 제작 — warrior 호위력 보너스. ore + hide + pebble 소비처 마련.
  weaponsmith: {            // 무기 제작 — 철 있으면 철칼(고급), 없으면 돌칼. 돌 기반(자급) + 철 광맥전용 업그레이드.
    field: 'smithing', output: 'weapon', base: 0.45,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { stone: 0.5 },
    produceSpecial: 'weaponsmith',
  },
  armorsmith: {             // 갑옷 제작 (stone + hide + ore). v2: 산출 ↑
    field: 'smithing', output: 'armor', base: 0.35,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { stone: 0.5, hide: 0.4, ore: 0.2 },
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

// 자원별 base value — 노동시간(생산 1단위에 드는 표준 일) 역수의 근사.
//   교역 가격의 anchor. 마을 부족도가 여기 곱해져서 실제 가격 형성.
const BASE_VALUE = {
  food:        1.0,    // 농부 1.5/day → 1단위에 0.67일
  fish:        1.25,   // 어부 1.2/day
  meat:        2.14,   // 사냥꾼 0.7/day
  cooked_food: 2.0,    // 요리 + 부재료. 영양 풍부.
  hide:        2.5,    // 사냥 부산물이지만 도구/방어구 재료
  wood:        1.67,   // 벌목 0.9/day
  stone:       2.14,   // 광부 0.7/day
  ore:         3.0,    // 광물 0.5/day. 더 귀함.
  tool:        5.0,    // 0.4/day + wood/stone 투입
  weapon:      8.0,    // Phase 4d-7: 무기 — warrior 공격력
  armor:       8.0,    // 갑옷 — warrior 방어력
  fruit:       1.5,    // 채집물
  vegetable:   1.5,
  mushroom:    1.5,
  twig:        1.0,    // 흔함
  pebble:      1.0,
};
const JOB_NAMES = Object.keys(JOBS);
const FIELDS = [...new Set(JOB_NAMES.map(j => JOBS[j].field))];

// forager 토지별 산출 가중치 — 어떤 채집물이 더 많이 나오나
// Phase 5-5-econ-b: specialty.js 새 자원 추가 (chestnut·walnut·honey·medicinal_herb·grape·wildflower)
function foragerYieldsFor(v) {
  // 평원/비옥지 → fruit/vegetable/grape/wildflower
  // 삼림 → mushroom/twig/chestnut/walnut/honey
  // 산악 → pebble/medicinal_herb
  const fert = v.land.fertility, wood = v.land.wood, stone = v.land.stone;
  return {
    // 옛 자원 (유지)
    fruit:     fert * 0.6 + 0.2,
    vegetable: fert * 0.5 + 0.2,
    mushroom:  wood * 0.4 + stone * 0.2 + 0.1,
    twig:      wood * 0.5 + 0.2,
    pebble:    stone * 0.5 + 0.1,
    stone:     stone * 0.12 + 0.04,   // ★채집에서 돌 소량(주워옴). 대량은 광산. → 도구·주거 최소 자급 가능

    // 새 자원 (specialty.js의 foraging) — 가중치 작게 (옛 자원 우선)
    chestnut:  wood * 0.18,           // 견과 — 숲
    walnut:    wood * 0.15,           // 견과 — 숲
    honey:     wood * 0.20,           // 꿀 — 숲 (벌집)
    medicinal_herb: fert * 0.10 + stone * 0.10,  // 약초 — 다양 환경
    wildflower: fert * 0.25,          // 야생화 — 평원
    grape:     fert * 0.15,           // 산포도 — 평원
  };
}

// 채집물 → 식량 환산비. 농사보다 훨씬 비효율적이도록.
// 농부: base 1.5 × fert × (skill+1) × toolBoost → food 1
// forager: base 1.0 × landMean × (skill+1) → 위 5종 분배. 식량 환산은 그 중 fruit/veg/mushroom만 0.4
//          예) fertility 1.0, skill 0, toolBoost 1.0
//              farmer    → 1.5 food/day
//              forager   → 1.0 × 0.67 × 1 = 0.67 산출, food_equiv 약 0.16 (~11%)
const FORAGE_FOOD_FACTOR = { fruit: 0.4, vegetable: 0.4, mushroom: 0.3 };

// 소비 (일일 1인당)
const DAILY_FOOD_CONSUMPTION = 1.0;
const DAILY_TOOL_WEAR_PER_FARMER = 0.04;  // 농부가 도구 마모
const DAILY_TOOL_WEAR_PER_OTHER = 0.02;

// 식량 소비 우선순위 — cooked_food > fish/meat > food > 채집물(fruit/veg/mushroom)
// 채집물은 환산비가 낮아 농사보다 끼니로 비효율
function consumeFood(v, need) {
  let remaining = need;
  // 1) cooked_food (영양 풍부)
  if (v.storage.cooked_food > 0) {
    const eff = Math.min(remaining / 1.12, v.storage.cooked_food);
    v.storage.cooked_food -= eff; remaining -= eff * 1.12;
  }
  // 2) fish/meat
  for (const r of ['fish', 'meat']) {
    if (remaining > 0 && v.storage[r] > 0) {
      const eff = Math.min(remaining, v.storage[r]);
      v.storage[r] -= eff; remaining -= eff;
    }
  }
  // 3) 농작물 food
  if (remaining > 0 && v.storage.food > 0) {
    const eff = Math.min(remaining, v.storage.food);
    v.storage.food -= eff; remaining -= eff;
  }
  // 4) 채집물 (가장 비효율) — fruit/veg 0.4, mushroom 0.3
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    const f = FORAGE_FOOD_FACTOR[r];
    if (remaining > 0 && v.storage[r] > 0) {
      // 1 unit consumed → f units of food
      const unitsNeeded = remaining / f;
      const consumed = Math.min(unitsNeeded, v.storage[r]);
      v.storage[r] -= consumed;
      remaining -= consumed * f;
    }
  }
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
const POP_GROWTH_RATE = 0.0135;           // r — 일일. 연 ~5%. ★도적에게 죽는 행상 손실을 살짝 보전(0.012→0.0135)
const POP_MAX_DELTA_PCT = 0.02;           // 일일 변화 상한 (안정화)
const POP_MIN = 0;                         // ★인구 하한 0 — 자급 불가 마을은 0명까지 줄어 소멸(척박지엔 마을이 안 남음). 365일 정착 보호 후.
const POP_MAX = 1000;                      // 마을당 인구 상한 (N² 폭발 방지)

// 세금 + 영토
const TAX_RATE = 0.03;                    // 일일 산출의 3% (사용자 의도: default 3% + 길드마스터 조정)
const BASE_EXPAND_COST = { food: 80, wood: 40, stone: 25 };
const EXPAND_COST_EXP = 1.3;              // (size/baseSize)^1.3 — 점진 증가
const EXPAND_CHECK_INTERVAL = 7;          // 매 7일 영토 확장 검사
// ★주거(집): 인구 성장은 집 수용력에 막힘. 집은 목재(필수)·석재(있으면)로 짓고 노후화.
//   집 부족하면 성장만 멈춤(감소 아님). picker가 "집 지을 목재 부족 → 나무꾼" 안전망으로 고리 닫음.
const HOUSE_WOOD = 1.5;        // 수용력 1인당 목재(한옥=목조)
const HOUSE_STONE = 2.5;       // 수용력 1인당 석재(주춧돌·구들·담장). 준-필수(없으면 건축 30%) → 강한 석재 수요 → 광산 교역·광부 매력↑
const HOUSE_DECAY = 0.0015;    // 일일 노후화(완만 — 나무꾼 1명이면 유지 가능)
const HOUSE_BUFFER = 1.15;     // 인구보다 약간 여유 있게(성장 여지)
const HOUSE_BUILD_MAX = 0.06;  // 하루 최대 증축률(인구 대비)
const HOUSE_START = 20;        // 정착 초기 집(부트스트랩 — 이 크기까진 자라 나무꾼 산업 형성)

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

function villageDist(a, b) {
  return Math.hypot(a.coord.x - b.coord.x, a.coord.y - b.coord.y);
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
function jobCapacity(v) {
  const s = v.land.size;
  const c = {
    farmer:     Math.floor(s * v.land.fertility * 0.4),
    fisher:     Math.floor(s * v.land.water     * 0.25),
    hunter:     Math.floor(s * v.land.game      * 0.30),
    lumberjack: Math.floor(s * v.land.wood      * 0.30),
    miner:      Math.floor(s * Math.max(v.land.stone, v.land.ore) * 0.30),   // 통일 광부: 돌·광석 중 풍부한 쪽 기준
    forager:    Math.floor(s * 0.30),
    // ★인구비율 정원(하드캡) 전부 폐지 — 직업 수는 한계가치 vs 그림자가격으로 *자연 수렴*.
    //   대장장이: 도구 쌓이면 도구가격↓→한계가치↓→안 뽑힘 + 글럿 시 차출(opportunityCost=시장가치).
    //   무기/갑옷장: 무기·갑옷 가격 + 약탈위협 + 가죽 가용이 결정. 전사: 무기 보유 게이트 + sqrt 체감.
    //   (옛 캡 smith0.10·weapon/armor0.06·cook0.10·warrior0.08 → 인위적 분포 강제라 제거)
    smith:       UNCAPPED,
    weaponsmith: UNCAPPED,
    armorsmith:  UNCAPPED,
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

// 길드 금고로 영토 확장 시도. 가능하면 size +1, 자원 차감.
function tryExpandTerritory(v, day) {
  const cost = expandCost(v);
  // 인구가 K(식량 자리)의 85% 이상 차야 확장 시도. 그 전엔 길드 자본만 축적.
  const N = v.npcs.length;
  const slotK = totalFoodSlots(v);
  if (N / Math.max(1, slotK) < 0.85) return;
  if (v.treasury.food < cost.food)   return;
  if (v.treasury.wood < cost.wood)   return;
  if (v.treasury.stone < cost.stone) return;
  v.treasury.food  -= cost.food;
  v.treasury.wood  -= cost.wood;
  v.treasury.stone -= cost.stone;
  v.land.size += 1;
  v.expansions += 1;
  v.lastExpansionDay = day;
}

// =============================================================================
// 2. NPC
// =============================================================================
let _nextNpcId = 1;
function createNPC(opts = {}) {
  const job = opts.job || 'farmer';
  return {
    id: 'n' + (_nextNpcId++),
    age: 16 + Math.floor(srand() * 20),
    currentJob: job,
    skills: Object.fromEntries(FIELDS.map(f => [f, 0])),
    skillXp: Object.fromEntries(FIELDS.map(f => [f, 0])),
    traits: Object.fromEntries(FIELDS.map(f => [f, 0])),
    spentTraits: 0,                          // 0~30
    lastJobChangeDay: -999,                  // 쿨다운용
  };
}

// 현재 직업의 field
function npcField(npc) { return JOBS[npc.currentJob].field; }

// 일하면 skill xp 증가. 차면 skill +1. skill == trait && skill < 10 이면 trait +1.
// xp_to_next(skill) = 80 + skill * 30
function workNPC(npc) {
  const f = npcField(npc);
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
  const sk = 1 + (npc.skills[npcField(npc)] || 0) * 0.05;
  switch (npc.currentJob) {
    case 'farmer':      return (L.fertility || 0) * 0.4 * w('food') * sk;
    case 'fisher':      return (L.water || 0) * 1.2 * w('fish') * sk;
    case 'hunter':      return (L.game || 0) * 0.7 * (w('meat') + 0.3 * w('hide')) * sk;
    case 'lumberjack':  return (L.wood || 0) * 0.3 * w('wood') * sk;
    case 'miner':       return Math.max((L.stone || 0) * w('stone'), (L.ore || 0) * w('ore')) * 0.3 * sk;
    case 'forager':     return Math.max(0.3, ((L.fertility || 0) + (L.wood || 0) + (L.stone || 0)) / 3) * 0.25 * w('vegetable') * sk;
    // ★자본재 장인: 노동목표 초과면 0.005(글럿 광부 0.01보다↓ → 1순위 차출), 이내면 50(유지).
    case 'smith':       return ((v.counts.smith || 0)       > smithTarget(v))       ? 0.005 : 50 * sk;
    case 'weaponsmith': return ((v.counts.weaponsmith || 0) > weaponsmithTarget(v)) ? 0.005 : 50 * sk;
    case 'armorsmith':  return ((v.counts.armorsmith || 0)  > armorsmithTarget(v))  ? 0.005 : 50 * sk;
    case 'cook':        return 0.4 * w('cooked_food') * sk;
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
function createVillage(opts) {
  const baseSize = opts.size ?? 50;
  const v = {
    id: 'v' + (_nextVillageId++),
    name: opts.name,
    land: {
      fertility: opts.fertility ?? 1.0,
      wood: opts.wood ?? 1.0,
      stone: opts.stone ?? 1.0,
      ore: opts.ore ?? 0.5,
      water: opts.water ?? 0.3,
      game: opts.game ?? 0.6,
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
  // 초기 비축 — 비자급 마을(광물/사막)도 교역 시작할 충분한 시간
  v.storage.food = initN * 300;       // 300일치(초기 비축 — 부트스트랩용, 균형은 교역이 결정)
  v.storage.tool = initN * 3;         // 도구 충분
  v.storage.wood = initN * 8;         // 초기 주거 건축 부트스트랩 + 거래 + smith
  v.storage.stone = initN * 5;        // 초기 석재(주거·거래·smith)
  v.storage.ore = Math.floor(initN * v.land.ore * 5);  // 광물 도시는 ore 잉여로 시작
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
    ['miner',      Math.max(v.land.stone, v.land.ore) * 0.7],   // 통일 광부(돌·광석 중 풍부한 쪽)
  ].filter(([j]) => hasSlot(v, j, cap, counts));
  allOpts.sort((a, b) => b[1] - a[1]);
  if (allOpts.length > 0) return allOpts[0][0];

  // fallback
  const fallback = ['smith', 'cook', 'merchant', 'forager'].find(j => hasSlot(v, j, cap, counts));
  return fallback || 'forager';
}

// 마을 일일 처리
function tickVillage(v, day) {
  if (v.npcs.length === 0) return;

  // 1) 각 NPC 일하기 → 산출물 storage에 + skill xp
  //    매일 새 객체 만들지 말고 버퍼 재사용 (GC 부하 ↓)
  const dailyProduction = v.dailyProductionBuf;
  for (const r of RESOURCES) dailyProduction[r] = 0;
  // ★도구 등급제: 맨손 0.25×(엄청 느림) / 돌도구 1.0×(보통) / 철도구 1.8×(상당히 빠름). 일꾼은 가진 최선의 도구 사용.
  //   → 도구가 생산을 좌우 → 대장간·돌·철 수요. 도구 없어도 농어업 가능하나 극도로 느림(사용자 설계).
  let toolDeps = 0;
  for (const n of v.npcs) if (JOBS[n.currentJob].toolDependent) toolDeps++;
  let toolBoostShared = 1.0;
  if (toolDeps > 0) {
    const ni = Math.min(toolDeps, v.storage.iron_tool || 0);            // 철도구(1.8×, 후기 최고급)
    const nb = Math.min(toolDeps - ni, v.storage.bronze_tool || 0);     // 청동도구(1.4×, 청동기 주력)
    const ns = Math.min(toolDeps - ni - nb, v.storage.tool || 0);       // 돌도구(1.0×)
    const nn = toolDeps - ni - nb - ns;                                 // 맨손(0.25×)
    toolBoostShared = (ni * 1.8 + nb * 1.4 + ns * 1.0 + nn * 0.25) / toolDeps;
  }
  // 봉쇄 = 교역만 차단. 산출 자체는 영향 없음 (자급 마을은 영향 X).
  const isBlockaded = v.isolated && day < v.isolatedUntilDay;
  for (const npc of v.npcs) {
    if (npc._tradingUntil && npc._tradingUntil > day) continue;   // ★교역 원정 중 → 생산 안 함(기회비용 실현). 저숙련자라 손실 작음.
    const jdef = JOBS[npc.currentJob];
    const f = jdef.field;
    const skillLvl = npc.skills[f];
    const toolBoost = jdef.toolDependent ? toolBoostShared : 1.0;
    // input 자원 부족 시 생산 0
    let inputMult = 1;
    for (const [inp, need] of Object.entries(jdef.inputs || {})) {
      if (v.storage[inp] < need) { inputMult = 0; break; }
    }
    const landBoost = jdef.landBoost(v);
    // skill 효과 — 만렙(10)이면 ×1.5. 분업/교역 의존 강화 위해 효율 ↓.
    const skillMul = 1 + skillLvl * 0.05;
    const baseAmt = jdef.base * landBoost * skillMul * toolBoost * inputMult;

    // produceSpecial 분기 — 각 산출에 대해 세금 떼고 storage로
    const addProduce = (r, amt) => {
      const tax = amt * TAX_RATE;
      v.storage[r] = (v.storage[r] || 0) + (amt - tax);
      v.treasury[r] = (v.treasury[r] || 0) + tax;
      dailyProduction[r] += amt;
    };
    if (jdef.produceSpecial === 'forager') {
      if (baseAmt > 0) {
        const yields = foragerYieldsFor(v);
        const sumW = Object.values(yields).reduce((a, b) => a + b, 0) || 1;
        for (const [r, w] of Object.entries(yields)) {
          addProduce(r, baseAmt * (w / sumW));
        }
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
    } else if (jdef.produceSpecial === 'smith') {
      // ★대장장이: 철(광맥 전용) 있으면 철도구(고효율), 아니면 돌도구. 도구는 돌 기반(석재 풍부)이라 목재 의존 X → 도구 자급 안정.
      const amt = jdef.base * skillMul;   // smith는 toolDependent 아님(맨손 페널티 없음). 최선의 도구 제작: 철>청동>돌.
      if ((v.storage.iron || 0) >= 0.5 && (v.storage.stone || 0) >= 0.2) {
        v.storage.iron -= 0.5; v.storage.stone -= 0.2;
        addProduce('iron_tool', amt);
        workNPC(npc);
      } else if ((v.storage.copper || 0) >= 0.4 && (v.storage.tin || 0) >= 0.15 && (v.storage.stone || 0) >= 0.2) {
        v.storage.copper -= 0.4; v.storage.tin -= 0.15; v.storage.stone -= 0.2;   // ★청동=구리+주석 합금(주력 금속)
        addProduce('bronze_tool', amt);
        workNPC(npc);
      } else if ((v.storage.stone || 0) >= 0.6) {
        v.storage.stone -= 0.6;
        addProduce('tool', amt);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'weaponsmith') {
      // ★무기 제작: 철 있으면 철칼(iron+stone), 없으면 돌칼(stone). 전사 양성의 전제(돌칼이나 철칼 필요).
      const amt = jdef.base * skillMul;   // 최선의 무기: 철검>청동검>돌검.
      if ((v.storage.iron || 0) >= 0.4 && (v.storage.stone || 0) >= 0.2) {
        v.storage.iron -= 0.4; v.storage.stone -= 0.2;
        addProduce('weapon', amt);
        workNPC(npc);
      } else if ((v.storage.copper || 0) >= 0.3 && (v.storage.tin || 0) >= 0.12) {
        v.storage.copper -= 0.3; v.storage.tin -= 0.12;   // ★청동검(청동기 주력 무기)
        addProduce('weapon', amt);
        workNPC(npc);
      } else if ((v.storage.stone || 0) >= 0.5) {
        v.storage.stone -= 0.5;
        addProduce('weapon', amt);
        workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'miner') {
      // ★통일 광부: 광맥은 광석+버력돌이 같이 나와 — 돌(∝land.stone)과 광석+금속(∝land.ore)을 *둘 다* 캠.
      //   돌산이면 돌 위주, 금속광맥이면 광석·금속(구리·주석·철)도 함께. (탐사꾼 통합)
      const toolB = jdef.toolDependent ? toolBoostShared : 1.0;
      const sAmt = jdef.base * (v.land.stone || 0) * skillMul * toolB;
      const oAmt = jdef.base * (v.land.ore || 0) * skillMul * toolB;
      if (sAmt > 0) {
        addProduce('stone', sAmt);
        addProduce('coal', sAmt * 0.10); addProduce('salt', sAmt * 0.05); addProduce('clay', sAmt * 0.08);
      }
      if (oAmt > 0) {
        addProduce('ore', oAmt);
        const bp = { copper: 0.22, tin: 0.11, iron: 0.08, silver: 0.05, gold: 0.02, gem: 0.01 };
        for (const r in bp) addProduce(r, oAmt * bp[r]);
      }
      if (sAmt > 0 || oAmt > 0) workNPC(npc);
    } else if (jdef.output && baseAmt > 0) {
      for (const [inp, need] of Object.entries(jdef.inputs || {})) {
        v.storage[inp] = Math.max(0, v.storage[inp] - need);
      }
      addProduce(jdef.output, baseAmt);
      if (jdef.byproduct) {
        for (const [r, rate] of Object.entries(jdef.byproduct)) {
          addProduce(r, baseAmt * rate);
        }
      }
      workNPC(npc);
    }
  }

  // 1.5) 영토 확장 시도 — 매 EXPAND_CHECK_INTERVAL일
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
  const prodK = (dailyFoodProd + dailyImport) / DAILY_FOOD_CONSUMPTION;
  // ★도구 마모 — 내구재라 천천히 닳음(반감기 ~19년). 인구 성장으로 1인당 도구가 희석되면 대장간이 보충.
  //   (예전 0.2%/일은 반감기 1.4년 = 비현실적으로 빨라 도구 고갈→붕괴 유발)
  if (v.storage.tool) v.storage.tool *= (1 - 0.0001);       // 도구 마모(내구재). 돌<청동<철 내구.
  if (v.storage.bronze_tool) v.storage.bronze_tool *= (1 - 0.00007);
  if (v.storage.iron_tool) v.storage.iron_tool *= (1 - 0.00005);

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
      v.storage.stone = Math.max(0, (v.storage.stone || 0) - built * HOUSE_STONE);   // 실제 건축분만큼 석재 소비
      v.housing += built;
    }
  }
  const Kraw = Math.min(slotK, prodK);   // 식량 한계(주거는 아래 성장 게이트)
  const K = Math.max(POP_MIN, Kraw);

  // 5) 인구 로지스틱 갱신
  const ratio = N / Math.max(1, K);
  let dP = POP_GROWTH_RATE * N * (1 - ratio);
  // 굶주림: 흐름 음수 + 창고 식량_equiv 부족
  if (v.surplusEMA.food < 0 && totalFoodEquivalent(v) < N * 3) {
    dP -= 0.3 * Math.abs(v.surplusEMA.food);
  }
  // 굶주림 직격: foodGap이 있으면 그만큼 인구 추가 압박
  if (foodGap > 0) {
    dP -= 0.5 * foodGap;
  }
  // Phase 5-5-econ-d: 마을 stat 기반 인구·이주 보정
  const stats = _computeVillageStats(v, N);
  if (stats) {
    // happiness: 0.5 기준. >0.5 보너스, <0.5 페널티 (불행 → 이주·자살 등)
    const happyMod = (stats.happiness - 0.5) * 0.6;
    dP += happyMod * N * POP_GROWTH_RATE;
    // health: 0.5 기준 (질병·약초 부족)
    const healthMod = (stats.health - 0.5) * 0.4;
    dP += healthMod * N * POP_GROWTH_RATE;
    // 기록 (외부에서 활용 가능)
    v.lastStats = stats;
  }
  // ★주거 성장 게이트: 집이 부족하면(N≥주거) 인구가 더 못 늚. 감소는 식량(famine)만 — 집 부족으론 안 죽음.
  if (dP > 0 && v.housing !== undefined && N >= v.housing) dP = 0;
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
    // 출생: 부족 직군으로 배정. 자리 없으면 출생 보류
    const picker = v._world && v._world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
    const newJob = picker(v, v._world);
    if (!newJob) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    const npc = createNPC({ job: newJob });
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
  if (foodEquiv_for_switch < N_pop * 10) { switchInterval = 1; multiSwitch = 2; }
  else if (foodEquiv_for_switch < N_pop * 30) { switchInterval = 5; multiSwitch = 1; }
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
  if (toolPer < 1.5 && hasSlot(v, 'smith', cap, counts)) return 'smith';

  // 3) 식량 자리 70% 미만 + 식량 잉여 적당 → 식량 직업 우선
  //   Phase 4d-6 fix: food storage가 N*20일치 이상 풍부하면 식량 게이트 우회 (자원 직업으로)
  if (foodFillRatio < 0.7 && foodEquiv < N * 20) {
    const open = foodOpts.filter(([j]) => hasSlot(v, j, cap, counts));
    open.sort((a, b) => b[1] - a[1]);
    if (open.length > 0) return open[0][0];
  }

  // 4) wood/stone 부족
  if (v.storage.wood < N * 5 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
  if (v.storage.stone < N * 3 && hasSlot(v, 'miner', cap, counts)) return 'miner';

  // 5) cook — 부재료 있을 때
  const foodRich = v.storage.food > N * 8;
  const sideTotal = COOK_SIDE_INGREDIENTS.reduce((s, r) => s + (v.storage[r] || 0), 0);
  if (foodRich && sideTotal > N * 2 && hasSlot(v, 'cook', cap, counts)) return 'cook';

  // 6) merchant — 자원 풍부 + 교역 capacity 부족할 때
  if (foodRich && v.storage.wood > N * 8 && hasSlot(v, 'merchant', cap, counts)) {
    return 'merchant';
  }

  // 6.5) warrior — merchant 있는 교역 마을이 캐러밴 호위 양성. 인구 5%까지. ★무기(돌칼/철칼) 보유 필수.
  if (foodRich && (counts.merchant || 0) >= 2 &&
      (counts.warrior || 0) < Math.max(2, Math.floor(N * 0.05)) &&
      (v.storage.weapon || 0) >= (counts.warrior || 0) + 1 &&
      hasSlot(v, 'warrior', cap, counts)) {
    return 'warrior';
  }
  // Phase 4d-7: weaponsmith — warrior 있고 ore 잉여인 마을
  if ((counts.warrior || 0) >= 1 && v.storage.ore > N * 1 && v.storage.weapon < N * 0.5 &&
      hasSlot(v, 'weaponsmith', cap, counts)) {
    return 'weaponsmith';
  }
  // Phase 4d-7: armorsmith — warrior 있고 hide 있는 마을
  if ((counts.warrior || 0) >= 1 && v.storage.hide > N * 0.5 && v.storage.armor < N * 0.5 &&
      hasSlot(v, 'armorsmith', cap, counts)) {
    return 'armorsmith';
  }

  // 7) 풍부 토지 분야 — 비교우위. 분업 마을이 여기서 광부/목수 등으로 빠짐.
  const landBoosts = [
    ['lumberjack', v.land.wood],
    ['miner',      Math.max(v.land.stone, v.land.ore)],   // 통일 광부(돌·광석 중 풍부한 쪽)
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
function smithTarget(v) {
  const toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  return craftLaborTarget(toolStock, toolDepCount(v), 0.5, { buffer: 1.15, catchup: 50, decay: 0.0008 });
}
// ★전사 readiness 목표 — *정원 아님*. 교역 캐러밴 수 × 약탈위협으로 호위 수요 파생.
//   위협 없으면 0(평시 전사 불필요), 위협 클수록 ↑. 글럿 마을의 전사 과잉(19%) 방지 + 평시 자연 동원해제.
function warriorTarget(v) {
  const ts = v.tradeStats || {};
  const sent = Math.max(1, ts.caravansSent || 0);
  const raidRate = Math.min(0.9, (ts.caravansRaided || 0) / sent);
  if (raidRate <= 0.03 && (ts.tradersKilled || 0) === 0) return 0;   // 위협 없으면 전사 0
  const N = v.npcs.length || 1;
  const caravans = Math.max(1, Math.floor(N * 0.08));   // 동시 교역 캐러밴 수(호위 대상)
  return Math.ceil(caravans * (0.5 + raidRate));         // 위협 비례 호위 수
}
function weaponsmithTarget(v) {
  // 무기는 교역으로 새어나가(약탈·전투 소모는 없지만 수출) → 전사 마을은 *상시* 무기장 필요.
  //   사용자 = 현 전사 + 목표 전사(선제 무장). 누수 대비 buffer·decay 넉넉히.
  const users = Math.max(v.counts.warrior || 0, warriorTarget(v));
  return craftLaborTarget(v.storage.weapon || 0, users, 0.5, { buffer: 1.3, catchup: 30, decay: 0.002, minStock: users > 0 ? 2 : 0 });
}
function armorsmithTarget(v) {
  return craftLaborTarget(v.storage.armor || 0, v.counts.warrior || 0, 0.3, { buffer: 1.0, catchup: 60, decay: 0.0004 });
}

function pickDeficitJob_rational(v, world) {
  const N = v.npcs.length || 1;
  const cap = jobCapacity(v);
  const counts = jobCounts(v);
  const foodEquiv = totalFoodEquivalent(v);
  const forageLandMean = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);

  // ★도구 자본 우선(기근보다 앞): 도구가 치명적으로 부족하면(맨손 0.25× = 식량생산 폭락) 대장간 먼저.
  //   도구는 자본재 — 1명이 도구 만들면 나머지 식량생산이 0.25×→1.0×로 회복(순이득 큼). 단 재료(목·석) 있고 마을 충분히 클 때만.
  //   재료 없으면 아래 식량직(forage가 목·석도 가져옴)으로 자연 회복. 죽음의 나선 방지.
  if (N >= 6 && (v.storage.stone || 0) >= 0.6) {
    const _td = toolDepCount(v);
    const _toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
    // 치명적 도구부족(커버리지<0.7)이고 대장장이가 노동목표 미달이면 기근보다 먼저 대장간.
    if (_toolStock < _td * 0.7 && (counts.smith || 0) < smithTarget(v)) return 'smith';
  }

  // 진짜 기근 (food < N*30일치) — 식량 직업 강제. ★경제적 정당성: 자급경제는 맬서스 상한에서 돌고,
  //   강제 30일버퍼가 ①식량안보→특화 노동 해방 ②식량생산 최대화→인구 상한 달성. (게이트 완화 실험 시 인구·특화 둘다 악화 확인)
  if (foodEquiv < N * 30) {
    // ★농사 불가 마을(비옥<0.2): 농부 강제는 무의미(거의 0 산출) → 가치재(금·광석) 채굴로 식량 살 자금 확보.
    //   광산 부얼타운 = 식량 전량 수입. 어로/사냥(직접 식량)이 가능하면 그게 우선, 광맥뿐이면 채굴해 교역.
    //   하드플로어 N*6: 그 아래로 떨어지면 가능한 식량직(어/렵)이라도 풀가동.
    if ((v.land.fertility || 0) < 0.2 && foodEquiv > N * 6) {
      if (Math.max(v.land.stone || 0, v.land.ore || 0) > 0.3 && hasSlot(v, 'miner', cap, counts)) return 'miner';   // 통일 광부: 돌이든 광석이든 캐서 교역
    }
    // ★풍부광맥 예외: 광맥이 매우 풍부(stone/ore>0.35) + 하드기근(18일치) 아님 + 채광노동 상한(4%) 미만이면
    //   식량 게이트가 소수 광부를 허용. 광산 취락이 식량 약간 양보하고 광맥을 캐는 역사 패턴. 상한+하드플로어로 붕괴 방지.
    const mineLabor = (counts.miner || 0);
    const richVein = (v.land.stone || 0) > 0.35 || (v.land.ore || 0) > 0.35;
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
  // ★자본재 장인 — 스톡-플로우 노동목표(정원 아님). 목표 미달이면 충원, 충족이면 건너뜀(0 수렴).
  //   재료 게이트: 대장간 돌, 무기장 돌, 갑옷장 가죽 필요. 충원 후엔 marginal 후보에서 빠져 식량·자원직과 경쟁 안 함.
  let _toolDeps = toolDepCount(v);
  if ((counts.smith || 0) < smithTarget(v) && (v.storage.stone || 0) >= 0.6) return 'smith';
  if ((counts.weaponsmith || 0) < weaponsmithTarget(v) && (v.storage.stone || 0) > N * 0.3) return 'weaponsmith';
  if ((counts.armorsmith || 0) < armorsmithTarget(v) && (v.storage.hide || 0) > N * 0.3) return 'armorsmith';
  // ★주거 압박: 집이 거의 가득(인구 성장 막힘) + 집 지을 목재 부족 → 나무꾼. 집 지어야 인구가 늚 → 고리를 닫는 안전망.
  if (v.housing !== undefined && N >= v.housing * 0.95 && (v.storage.wood || 0) < N * 2 && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
  // ★석재 안전망: 산이 가까운 마을(land.stone 충분)이 석재 부족하면 광부. 집·도구·무기 석재 수요 → 채광. 산 없으면(stone≤0.25) 안 함.
  if ((v.land.stone || 0) > 0.25 && (v.storage.stone || 0) < N * 1.5 && hasSlot(v, 'miner', cap, counts)) return 'miner';
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
  const minerGain = Math.max(v.land.stone * w('stone'), v.land.ore * w('ore')) * 0.3 * period;   // 통일 광부: 돌·광석 중 가치 높은 쪽을 캠
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
  if (hasSlot(v, 'hunter', cap, counts))     candidates.push(['hunter',     v.land.game * 0.7 * period * (w('meat') + 0.3 * w('hide'))]);
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
  if (v.npcs.length < 3) {
    // ★죽음의 나선 방지: 소수 인구 + 식량위기 + 식량생산자 0이면, 가장 맞는 식량직업으로 강제 전환(회복 보장).
    const c0 = jobCounts(v);
    const foodWorkers = (c0.farmer || 0) + (c0.fisher || 0) + (c0.hunter || 0) + (c0.forager || 0);
    if (foodWorkers === 0 && v.npcs.length >= 1 && totalFoodEquivalent(v) < v.npcs.length * 30) {
      const opts = [['farmer', v.land.fertility * 1.5], ['fisher', v.land.water * 1.2], ['hunter', v.land.game * 0.7], ['forager', 0.3]];
      opts.sort((a, b) => b[1] - a[1]);
      switchNPCJob(v.npcs[0], opts[0][0], day, v);   // 한 명을 농사/어로/사냥 중 땅에 맞는 걸로
    }
    return;
  }
  const picker = world && world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
  const need = picker(v, world);
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
  // 이미 과포화면 skip (한 직업이 인구의 40% 초과 — 과집중·소형마을 불안정 방지)
  if (counts[need] / N > 0.4) return;
  // 잉여 직군에서 NPC 1명 — ★시장가치(기회비용) 가장 낮은 NPC = 글럿 재화 생산자.
  //   (옛 surplusBonus[25%미만 보호] 제거 — 그게 도구 글럿에도 10% 대장장이를 고착시킨 원인.
  //    시장가치가 직접 결정: 도구가격 폭락 → 대장장이 비용 최저 → 부족직으로 전환됨.)
  const priceTbl = (world && typeof world.priceFn === 'function') ? world.priceFn(v) : null;
  const w = priceTbl ? (r => Math.max(0.05, Math.min(200, (priceTbl[r] || 1) / 1.0))) : (_ => 1.0);
  let bestIdx = -1, bestCost = Infinity;
  for (let i = 0; i < v.npcs.length; i++) {
    const n = v.npcs[i];
    if (n.currentJob === need) continue;
    if (day - n.lastJobChangeDay < 30) continue;  // 쿨다운(개인 단위 churn 억제)
    const cost = opportunityCost(n, v, w);
    if (cost < bestCost) { bestCost = cost; bestIdx = i; }
  }
  if (bestIdx >= 0) {
    switchNPCJob(v.npcs[bestIdx], need, day, v);
  }
}

// =============================================================================
// 4. 거래소 (마을 간 매물)
// =============================================================================
function tickTrade(world, day) {
  if (day % TRADE_INTERVAL !== 0) return;  // 매 3일 거래 사이클 (가격 변동 ↑)

  // 마을당 안전 reserve (인구 비례)
  const RESERVE = {
    food: 30, fish: 10, meat: 8, cooked_food: 5,
    wood: 5, stone: 3, ore: 1, tool: 1.5,
    weapon: 0.5, armor: 0.5,  // Phase 4d-7: warrior 1명당 1개 (수요)
    fruit: 2, vegetable: 2, mushroom: 1, twig: 2, pebble: 1, hide: 1,
  };
  const TRADABLE = Object.keys(RESERVE);

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
      const reserve = computeDynReserve(v, cons, r, RESERVE[r]);
      const stock = v.storage[r] || 0;
      const ratio = Math.max(-0.9, Math.min(2.0, (reserve - stock) / Math.max(1, reserve)));
      const adj = Math.max(0.1, 1 + ratio * 2);
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
          const PRIO = ['merchant', 'warrior', 'hunter', 'forager', 'lumberjack', 'miner', 'fisher', 'smith', 'cook', 'farmer'];
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
      padR(v.land.size, 6) +
      padR(v.expansions || 0, 4) +
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
    console.log(`\n${v.name} (인구 ${N}명, size ${v.land.size} ← base ${v.land.baseSize}, 확장 ${v.expansions}회)`);
    console.log(`  땅: fertility=${v.land.fertility.toFixed(2)} wood=${v.land.wood.toFixed(2)} stone=${v.land.stone.toFixed(2)} ore=${v.land.ore.toFixed(2)} water=${v.land.water.toFixed(2)} game=${v.land.game.toFixed(2)}`);
    console.log(`  자리: farmer=${cap.farmer} fisher=${cap.fisher} hunter=${cap.hunter} forager=${cap.forager} lumber=${cap.lumberjack} miner=${cap.miner}`);
    console.log(`  금고: food=${(v.treasury.food||0).toFixed(0)} wood=${(v.treasury.wood||0).toFixed(0)} stone=${(v.treasury.stone||0).toFixed(0)} (다음 확장 비용: food=${expandCost(v).food.toFixed(0)} wood=${expandCost(v).wood.toFixed(0)} stone=${expandCost(v).stone.toFixed(0)})`);
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
    villages.push(createVillage({
      name: namePool[i] || `마을${i+1}`,
      fertility: fert, wood, stone, ore, water, game, size, initialPop: initPop,
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

  const world = { villages, tradeLog: [], events, caravans: [] };

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
    tickMigration(world, day);
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
    villages.push(createVillage({
      name: namePool[i] || `마을${i+1}`,
      fertility: fert, wood, stone, ore, water, game, size, initialPop: initPop,
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
  tickMigration(world, world.day);
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
  const baseline = (defaultPerPop || 1) * N * 0.3;  // 인구 비례 최소 (RESERVE 의 30%)
  const dailyCons = cons[resourceKey] || 0;
  return Math.max(baseline, dailyCons * 30);  // 30일치 비축
}

// 마을 시세 (가격표) 계산 — 다른 마을 시세 비교용
function computeVillagePrices(v) {
  const N = v.npcs.length || 1;
  const RESERVE = {
    food: 30, fish: 10, meat: 8, cooked_food: 5,
    wood: 5, stone: 3, ore: 1, tool: 1.5,
    weapon: 0.5, armor: 0.5,
    fruit: 2, vegetable: 2, mushroom: 1, twig: 2, pebble: 1, hide: 1,
  };
  // Phase 4d-8: 동적 수요 계산
  const cons = computeDailyConsumption(v);
  const prices = {};
  for (const r of Object.keys(RESERVE)) {
    const reserve = computeDynReserve(v, cons, r, RESERVE[r]);
    const stock = v.storage[r] || 0;
    const ratio = Math.max(-0.85, Math.min(2.0, (reserve - stock) / Math.max(1, reserve)));
    const adj = Math.max(0.3, 1 + ratio * 2);
    prices[r] = (BASE_VALUE[r] || 1) * adj;
  }
  return prices;
}

module.exports = {
  createWorld,
  tickWorld,
  serializeWorld,
  computeVillagePrices,
  computeDailyConsumption,
  JOB_NAMES,
  FIELDS,
  RESOURCES,
  BASE_VALUE,
  JOBS,
  // v2 시뮬용 빌려쓰기
  createVillage,
  createNPC,
  tickVillage,
  adjustGuildTax,
  tickMigration,
  processEvents,
  jobCounts,
  villageDist,
  setSeed,
  srand: () => srand(),
};
