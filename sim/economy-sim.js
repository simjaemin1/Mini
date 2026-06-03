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
  },
  fisher: {
    field: 'fishing', output: 'fish', base: 1.2,
    landBoost: (v) => v.land.water, toolDependent: true, inputs: {},
  },
  hunter: {                 // 사냥꾼 — meat + hide 동시 산출
    field: 'hunting', output: 'meat', base: 0.7,
    landBoost: (v) => v.land.game, toolDependent: true,
    inputs: {},
    byproduct: { hide: 0.4 },  // meat 1당 hide 0.4
  },
  lumberjack: {
    field: 'woodworking', output: 'wood', base: 0.9,
    landBoost: (v) => v.land.wood, toolDependent: true, inputs: {},
  },
  miner: {
    field: 'mining', output: 'stone', base: 0.7,
    landBoost: (v) => v.land.stone, toolDependent: true, inputs: {},
  },
  prospector: {
    field: 'mining', output: 'ore', base: 0.5,
    landBoost: (v) => v.land.ore, toolDependent: true, inputs: {},
  },
  smith: {                  // 도구 제작 (wood + stone) — pebble 의존 제거 (cascade failure 방지)
    field: 'smithing', output: 'tool', base: 0.4,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { wood: 0.5, stone: 0.3 },
  },
  // Phase 4d-7: 무기/갑옷 제작 — warrior 호위력 보너스. ore + hide + pebble 소비처 마련.
  weaponsmith: {            // 무기 제작 (ore + wood + stone)
    field: 'smithing', output: 'weapon', base: 0.25,
    landBoost: () => 1.0, toolDependent: false,
    inputs: { ore: 0.4, wood: 0.3, stone: 0.2 },
  },
  armorsmith: {             // 갑옷 제작 (stone + hide + ore) — pebble 의존 제거 (cascade failure 방지)
    field: 'smithing', output: 'armor', base: 0.2,
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
function foragerYieldsFor(v) {
  // 평원/비옥지 → fruit/vegetable 우세
  // 삼림 → mushroom/twig
  // 산악 → pebble/mushroom
  const fert = v.land.fertility, wood = v.land.wood, stone = v.land.stone;
  return {
    fruit:     fert * 0.6 + 0.2,
    vegetable: fert * 0.5 + 0.2,
    mushroom:  wood * 0.4 + stone * 0.2 + 0.1,
    twig:      wood * 0.5 + 0.2,
    pebble:    stone * 0.5 + 0.1,
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
const POP_GROWTH_RATE = 0.012;            // r — 일일. 연 환산 ~4.4%
const POP_MAX_DELTA_PCT = 0.02;           // 일일 변화 상한 (안정화)
const POP_MIN = 1;                         // 마을 인구 하한
const POP_MAX = 1000;                      // 마을당 인구 상한 (N² 폭발 방지)

// 세금 + 영토
const TAX_RATE = 0.08;                    // 일일 산출의 8%
const BASE_EXPAND_COST = { food: 80, wood: 40, stone: 25 };
const EXPAND_COST_EXP = 1.3;              // (size/baseSize)^1.3 — 점진 증가
const EXPAND_CHECK_INTERVAL = 7;          // 매 7일 영토 확장 검사

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
function jobCapacity(v) {
  const s = v.land.size;
  const c = {
    farmer:     Math.floor(s * v.land.fertility * 0.4),
    fisher:     Math.floor(s * v.land.water     * 0.25),
    hunter:     Math.floor(s * v.land.game      * 0.30),
    lumberjack: Math.floor(s * v.land.wood      * 0.30),
    miner:      Math.floor(s * v.land.stone     * 0.30),
    prospector: Math.floor(s * v.land.ore       * 0.20),
    forager:    Math.floor(s * 0.30),
    smith:       Math.max(1, Math.floor(v.npcs.length * 0.10)),
    weaponsmith: Math.max(1, Math.floor(v.npcs.length * 0.06)),  // Phase 4d-7
    armorsmith:  Math.max(1, Math.floor(v.npcs.length * 0.06)),  // Phase 4d-7
    cook:        Math.max(1, Math.floor(v.npcs.length * 0.10)),
    warrior:     Math.max(1, Math.floor(v.npcs.length * 0.08)),
    merchant:    Math.max(1, Math.floor(v.npcs.length * 0.08)),  // 상업 자리
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

// NPC 기회비용 — 현재 일에 얼마나 투자했나
function opportunityCost(npc) {
  const f = npcField(npc);
  return npc.skills[f] * 2 + npc.traits[f];
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
    let job;
    if (i === 0) {
      // 첫 NPC는 무조건 merchant — 거래 시작 보장
      job = 'merchant';
    } else {
      job = pickInitialJob(v);
    }
    const npc = createNPC({ job });
    v.npcs.push(npc);
    v.counts[job] = (v.counts[job] || 0) + 1;
  }
  // 초기 비축 — 비자급 마을(광물/사막)도 교역 시작할 충분한 시간
  v.storage.food = initN * 300;       // 300일치
  v.storage.tool = initN * 3;         // 도구 충분
  v.storage.wood = initN * 8;         // 거래 교환용 + smith input
  v.storage.stone = initN * 6;        // 거래 교환용 + smith input
  v.storage.ore = Math.floor(initN * v.land.ore * 5);  // 광물 도시는 ore 잉여로 시작
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
    ['miner',      v.land.stone * 0.7],
    ['prospector', v.land.ore   * 0.5],
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
  // toolBoost 한 번만 계산. 도구 효과 +20%.
  let toolDeps = 0;
  for (const n of v.npcs) if (JOBS[n.currentJob].toolDependent) toolDeps++;
  const toolBoostShared = toolDeps > 0
    ? (1 + 0.2 * Math.min(1, v.storage.tool / toolDeps))
    : 1.0;
  // 봉쇄 = 교역만 차단. 산출 자체는 영향 없음 (자급 마을은 영향 X).
  const isBlockaded = v.isolated && day < v.isolatedUntilDay;
  for (const npc of v.npcs) {
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
  //    실제 산출 K_prod도 함께 보고 둘 중 작은 값.
  const slotK = totalFoodSlots(v);
  const prodK = dailyFoodProd / DAILY_FOOD_CONSUMPTION;
  const Kraw = Math.min(slotK, prodK);
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

  // 7) 직업 자율 전환 (매 7일)
  if (day % 7 === 0) {
    autoSwitchJob(v, day, v._world);
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
  const toolPer = v.storage.tool / Math.max(1, _toolDeps);
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

  // 6.5) warrior — merchant 있는 교역 마을이 캐러밴 호위 양성. 인구 5%까지.
  if (foodRich && (counts.merchant || 0) >= 2 &&
      (counts.warrior || 0) < Math.max(2, Math.floor(N * 0.05)) &&
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
    ['prospector', v.land.ore],
    ['lumberjack', v.land.wood],
    ['miner',      v.land.stone],
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
function pickDeficitJob_rational(v, world) {
  const N = v.npcs.length || 1;
  const cap = jobCapacity(v);
  const counts = jobCounts(v);
  const foodEquiv = totalFoodEquivalent(v);
  const forageLandMean = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);

  // 진짜 기근 (food < N*3일치) — 무조건 식량 직업 (안전장치)
  if (foodEquiv < N * 3) {
    const foodOpts = [
      ['farmer',  v.land.fertility * 1.5],
      ['fisher',  v.land.water     * 1.2],
      ['hunter',  v.land.game      * 0.7],
      ['forager', forageLandMean   * 0.25],
    ].filter(([j]) => hasSlot(v, j, cap, counts));
    foodOpts.sort((a, b) => b[1] - a[1]);
    if (foodOpts.length > 0) return foodOpts[0][0];
  }
  // 도구 절박 부족
  let _toolDeps = 0;
  for (const j of JOB_NAMES) if (JOBS[j].toolDependent) _toolDeps += (counts[j] || 0);
  if (v.storage.tool / Math.max(1, _toolDeps) < 1.0 && hasSlot(v, 'smith', cap, counts)) return 'smith';

  // === 한계 효용 계산 — 각 직업 1명 추가 시 기대 가치 (식량 환산 단위) ===
  const period = 100;  // 평가 윈도우 100일
  const FOOD_VALUE = 1;
  const ts = v.tradeStats || { caravansSent: 0, caravansRaided: 0, cargoSent: 0, foodImported: 0 };
  const caravansSeen = Math.max(0.5, ts.caravansSent);
  const raidRate = Math.min(0.9, ts.caravansRaided / caravansSeen);
  const avgCargo = ts.cargoSent / caravansSeen || 30;

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
  // (1) 농부 한계가치 — 우리 토지의 farmer 1명당 생산
  const farmerGain = v.land.fertility * 0.4 * period * FOOD_VALUE;
  // (2) 광부 한계가치 — 광물 1명당 생산 (food 환산: 거래로 식량 사올 수 있는 양)
  //     광물 1단위 → 식량 가격비 1배 가정 (단순화)
  const minerGain = v.land.stone * 0.3 * period * 0.5 * FOOD_VALUE;
  // (3) 상인 한계가치 — 새 캐러밴 1대 capacity 추가 (대신 식량/100일)
  //     상인 추가하면 추가 거래량 → 식량 import 증가
  const expectedNewTrade = avgCargo * (period / 7) * (1 - raidRate);
  const merchantGain = nearbyFoodCapacity > 0 ? expectedNewTrade * 0.3 * FOOD_VALUE : 0;
  // (4) 전사 한계가치 — sqrt 체감, 약탈 손실 줄임
  const curEscort = counts.warrior || 0;
  const dProtection = (Math.sqrt(curEscort + 1) - Math.sqrt(curEscort)) * 0.08;
  const warriorGain = caravansSeen * (period / Math.max(1, ts.windowStartDay ? 100 : 100)) *
                      avgCargo * dProtection * FOOD_VALUE;

  // 선택지 빌딩
  const candidates = [];
  if (hasSlot(v, 'farmer', cap, counts))     candidates.push(['farmer',     farmerGain]);
  if (hasSlot(v, 'miner', cap, counts))      candidates.push(['miner',      minerGain]);
  if (hasSlot(v, 'lumberjack', cap, counts)) candidates.push(['lumberjack', v.land.wood * 0.3 * period * 0.4]);
  if (hasSlot(v, 'fisher', cap, counts))     candidates.push(['fisher',     v.land.water * 1.2 * period * FOOD_VALUE]);
  if (hasSlot(v, 'hunter', cap, counts))     candidates.push(['hunter',     v.land.game * 0.7 * period * FOOD_VALUE]);
  if (hasSlot(v, 'prospector', cap, counts)) candidates.push(['prospector', v.land.ore * 0.2 * period * 0.5]);
  if (hasSlot(v, 'merchant', cap, counts) && nearbyFoodCapacity > 0)
    candidates.push(['merchant', merchantGain]);
  // 전사는 이미 캐러밴 보내는 마을만 의미
  if (hasSlot(v, 'warrior', cap, counts) && caravansSeen > 1 && raidRate > 0.05)
    candidates.push(['warrior', warriorGain]);
  if (hasSlot(v, 'smith', cap, counts) && _toolDeps > 0 && v.storage.tool / _toolDeps < 2)
    candidates.push(['smith', 0.5 * period]);  // 적당히 (도구 충분하면 가치 작음)
  // Phase 4d-7: weaponsmith/armorsmith — warrior 보조용
  if (hasSlot(v, 'weaponsmith', cap, counts) && (counts.warrior || 0) >= 1 && v.storage.ore > N * 0.5)
    candidates.push(['weaponsmith', (counts.warrior || 0) * 5 * FOOD_VALUE]);  // warrior 1명당 보조 가치 5
  if (hasSlot(v, 'armorsmith', cap, counts) && (counts.warrior || 0) >= 1 && v.storage.hide > N * 0.3)
    candidates.push(['armorsmith', (counts.warrior || 0) * 4 * FOOD_VALUE]);

  candidates.sort((a, b) => b[1] - a[1]);
  if (candidates.length > 0) return candidates[0][0];
  return null;
}

// 자율 직업 전환 — 매 7일 1명만
function autoSwitchJob(v, day, world) {
  if (v.npcs.length < 3) return;
  const picker = world && world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
  const need = picker(v, world);
  if (!need) return;  // 자리 없으면 전환 불가
  const counts = jobCounts(v);
  const N = v.npcs.length;
  // 이미 충분하면 skip
  if (counts[need] / N > 0.4) return;
  // 잉여 직군에서 NPC 1명 — 기회비용 가장 낮은 NPC
  let bestIdx = -1, bestCost = Infinity;
  for (let i = 0; i < v.npcs.length; i++) {
    const n = v.npcs[i];
    if (n.currentJob === need) continue;
    if (day - n.lastJobChangeDay < 30) continue;  // 쿨다운
    const cost = opportunityCost(n);
    // 부족한 직군이면 그 직군 NPC는 후보 X
    // 잉여 직군 (해당 직군이 N의 25% 이상) 우선
    const myJobRatio = counts[n.currentJob] / N;
    const surplusBonus = myJobRatio > 0.25 ? 0 : 5;  // 잉여 X면 cost 페널티
    const finalCost = cost + surplusBonus;
    if (finalCost < bestCost) {
      bestCost = finalCost;
      bestIdx = i;
    }
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
          const PRIO = ['merchant', 'warrior', 'hunter', 'forager', 'prospector', 'lumberjack', 'miner', 'fisher', 'smith', 'cook', 'farmer'];
          for (const j of PRIO) {
            pickIdx = a.v.npcs.findIndex(n => n.currentJob === j);
            if (pickIdx >= 0) break;
          }
          if (pickIdx < 0) continue;
          const caravanNpc = a.v.npcs[pickIdx];
          a.v.npcs.splice(pickIdx, 1);  // 마을에서 NPC 빠짐
          // counts 캐시 업데이트 (jobCounts incremental)
          if (a.v.counts && caravanNpc.currentJob) a.v.counts[caravanNpc.currentJob] = Math.max(0, (a.v.counts[caravanNpc.currentJob] || 0) - 1);
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
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05);
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
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05);
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
      // Phase 4d-5: 빌려간 NPC 마을로 복귀
      if (c.npc) {
        c.from.npcs.push(c.npc);
        if (c.from.counts && c.npc.currentJob) c.from.counts[c.npc.currentJob] = (c.from.counts[c.npc.currentJob] || 0) + 1;
      }
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
                   'lumberjack', 'miner', 'prospector', 'smith', 'cook'];
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
    console.log(`  자리: farmer=${cap.farmer} fisher=${cap.fisher} hunter=${cap.hunter} forager=${cap.forager} lumber=${cap.lumberjack} miner=${cap.miner} prosp=${cap.prospector}`);
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
  JOB_NAMES,
  FIELDS,
  RESOURCES,
  BASE_VALUE,
};
