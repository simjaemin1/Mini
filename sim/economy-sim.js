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
const FishGoods=require('../server/fish-goods');
const T1192_FISH_SPECIES=FishGoods.ON;
const OreGoods=require('../server/ore-goods');
const T1188_ORE_SPLIT=OreGoods.ON;
if(T1188_ORE_SPLIT)require('../server/specialty');

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
    if(T1188_ORE_SPLIT&&(id==='ore'||OreGoods.isOre(id)))continue;   // 원석 효용 예산은 광종 수만큼 늘리지 않는다
    // specialty.js 우선, 없으면 LEGACY
    const contributes = (SP && SP[id] && SP[id].contributes) || LEGACY_CONTRIBUTES[id] || null;
    if (!contributes) continue;
    const per_npc = qty / pop;
    const sat = Math.min(1.0, per_npc / 2.0);
    for (const [stat, w] of Object.entries(contributes)) {
      if (stats[stat] !== undefined) stats[stat] += w * sat;
    }
  }
  if(T1188_ORE_SPLIT){const qty=OreGoods.total(v.storage)+Math.max(0,v.storage?.ore||0),sat=Math.min(1,qty/pop/2);for(const[k,n]of Object.entries(LEGACY_CONTRIBUTES.ore))stats[k]+=n*sat;}
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
  // ★★[T86] **행복은 "몇 군 먹었나"가 아니라 "예산대로 먹었나"** 다.
  //   종전 `_fg.size / DIVERSITY_FULL` 은 **문턱 계단**이라 3% 를 한 톨 넘기면 만점이 붙었다.
  //   ⇒ 달성 효용 비: U = Σ w_g · log(1 + x_g / x̄_g) 를 이상 식단(x_g = x̄_g) 대비 0..1 로.
  //     x_g   = 그 군에서 실제로 먹은 **열량**(1인당) · x̄_g = 하루치 × w_g (예산이 곧 이상 식단)
  //     이상일 때 U* = Σ w_g · log 2 = log 2 (Σw_g = 1) ⇒ 비 = U / log 2.
  //   ★새 수 0 — w_g 는 위 표, 하루치는 `DAILY_FOOD_CONSUMPTION`, 나머지는 로그뿐이다.
  //   ⚠`stats.foodGroups` 는 **계측용으로 남긴다**(옛 판정과 나란히 볼 수 있게).
  // ★★[T86 · 재민 판정 ⓑ 2026-09-04] **행복은 종전 계단을 유지한다.**
  //   달성 효용 비(U = Σ w_g·log(1+min(1,x_g/x̄_g)) ÷ log2)를 같은 판에서 켰더니 인구가 5,933 → 5,524 로
  //   더 내려갔고, **식단 변경과 행복 변경 중 어느 쪽이 깎았는지 못 가르게** 됐다. 표는 보고 §2-b 에 남겼다.
  //   ⇒ 행복 판정을 계단에서 연속으로 바꾸는 것은 **그 자체로 카드 하나**다(하위 25% 1.252 → 0.316).
  const _divN = Math.min(1, _fg.size / DIVERSITY_FULL);
  stats.happiness += _divN * DIVERSITY_HAPPY_W;
  stats.health += _divN * DIVERSITY_HEALTH_W;
  stats.foodGroups = _fg.size;
  // ★여가→행복(§노동): 포만으로 감산된 노동(_idleFrac)만큼 쉼 — 부유·수입촌은 반나절 노동으로 행복↑, 개척·궁핍촌은 idle 0이라 무보너스.
  //   교역 기회비용(사용자 질문의 실물화): 원정 나간 인원(_tradingN, v2 발행)은 생산도 쉼도 못 하므로 여가에서 차감 —
  //   "쉬는 대신 교역"의 비용이 행복 회계에 실재. 문턱엔 안 넣음(실측: 캐러밴 이익/일이 개인 mv를 3~4자릿수 압도 → 영원히 안 물림.
  //   교역 vs 휴식의 실배분 노브는 TRADE_SPARE_UTIL=0.11 — 여유노동의 11%만 원정, 89%는 쉼).
  const _leis = Math.max(0, ((T1217_MARGIN || T1266_ORE_BODY) ? t1217IdleFrac(v, pop) : (v._idleFrac || 0)) - (v._tradingN || 0) / pop);   // ★[T1217] 켬 = 행위 어부의 실제 쉰 시간까지(아래 함수 · 끔 = 종전 글자) · ★[T1271] `T1266_ORE_BODY` 켬 = 행위 광부의 쉰 시간도 같은 함수로
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
// ★★[T731 2026-10-14 · 경도 하루 2단계 · 손잡이 `T731_LOCAL_MIDNIGHT`(기본 끔 = 아래 갈래를 아무도 안 탄다 · 종전 글자)] **씨 흐름을 마을마다 가른다.**
//   종전엔 마을 결산(`village(v)`) · 날씨 · 흉풍이 세계 하나의 흐름(`_seed`)과 번호 계수기(`_nextNpcId`)를 차례로 나눠 썼다 —
//   마을 차례가 바뀌면 같은 마을이 흐름의 다른 자리를 받아 값이 갈렸다(T712 §5-1: 동 → 서 차례만으로 3시드 날 3 갈림).
//   켜면 그 마을의 일을 하는 동안(`useVillageStream(v)` ~ `useVillageStream(null)`)엔 **그 마을의 흐름**(`v._rs` · 같은 LCG)을 쓰고,
//   새 주민 번호는 마을 안 계수기(`v._nid` — 번호 `n<마을 id>.<k>`)에서 뽑는다. 마을 흐름의 첫 값은 세계 씨(`setSeed` 의 값)와 마을 id 를
//   **같은 LCG 로 섞어** 정한다(새 수 0 · 차례 무관). 교역 · 캐러밴 · 회복 · 사건(마을 둘 이상)은 세계 흐름 그대로다.
//   `v._rs` · `v._nid` 는 econ 마을 칸이라 서버 저장 줄(`serializeEcon`)이 그대로 싣는다(재기동 뒤 같은 수열).
const T731_LOCAL_MIDNIGHT = (typeof process !== 'undefined' && process.env && process.env.T731_LOCAL_MIDNIGHT !== '0');   // ★[T792 · PM 10-18] 켬 기본 · 되돌림 `=0`(브라우저 = `process` 없음 = 끔 · 랩은 `LAB_ENV` 칸)
let _seed0 = 42;     // 세계 씨(마을 흐름 첫 값의 재료 — 켬일 때만 읽는다)
let _curV = null;    // 지금 흐름을 쥔 마을(켬일 때만 선다)
function srand() {
  if (_curV) { _curV._rs = (_curV._rs * 1664525 + 1013904223) >>> 0; return _curV._rs / 0xFFFFFFFF; }
  _seed = (_seed * 1664525 + 1013904223) >>> 0;
  return _seed / 0xFFFFFFFF;
}
function setSeed(s) { _seed = s >>> 0; _seed0 = _seed; }
function _t731StreamInit(v) {
  if (typeof v._rs === 'number') return;
  //   ★[T744] 재료 = 세계 씨 × 마을 **이름**(세계 안에서 하나 · 프로세스 계수기 `v.id` 는 앞서 만든 세계 수에 따라 바뀐다 — 같은 세계가 프로세스마다 다른 흐름을 받았다)
  let x = _seed0 >>> 0; const id = T1187_NAME_FREE && v.coord ? _t1187Key(v) : String(v.name != null && v.name !== '' ? v.name : (v.id != null ? v.id : ''));   // ★[T1187] 켬 = 마을 자리(이름 무관 · 아래 `_t1187Key`)
  for (let i = 0; i < id.length; i++) x = ((x ^ id.charCodeAt(i)) * 1664525 + 1013904223) >>> 0;
  v._rs = x;
}
/** 켬 — 그 마을의 흐름을 쥔다(null = 세계 흐름으로 돌아간다). 끔 = 아무것도 안 한다. */
function useVillageStream(v) { if (!T731_LOCAL_MIDNIGHT) return; if (v) _t731StreamInit(v); _curV = v || null; }
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

if(T1192_FISH_SPECIES)RESOURCES.push(...Object.keys(FishGoods.items()).filter(k=>!RESOURCES.includes(k)));
if(T1188_ORE_SPLIT)RESOURCES.splice(RESOURCES.indexOf('ore'),1,...OreGoods.ids);

// 부재료 set (cook이 variety 계산할 때 사용. food + 이 중 어떤 것이든 1종으로 카운트)
const COOK_SIDE_INGREDIENTS = ['fruit', 'vegetable', 'mushroom', 'meat', 'fish', 'twig'];

// 직업 정의. produceSpecial이 있으면 표준 생산 함수 대신 사용
const JOBS = {
  farmer: {
    field: 'farming', output: 'food', base: 1.5,
    landBoost: (v) => farmLandBoost(v), toolDependent: true, inputs: {},   // ★[T100] 밭 밑변 — `T100_FIELD_YIELD=0` 이면 `v.land.fertility` 그 자체(비트 동일)
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
    // ★★[T17 ③ 2026-09-02 · 재민 확정 · 자염 갈래 ①(해안선 확장 없음)] **자염을 어부 부산물로.**
    //   비율 0.05 는 **새 수가 아니다** — 이 파일이 이미 쓰는 소금 부산물 비율 그대로다
    //   (광부: `addProduce('salt', oAmt * 0.05)`). 캐는 소금이든 굽는 소금이든 같은 부산물 비율로 둔다.
    //   ⚠**해안 마을만** 낸다(아래 byproduct 루프의 `land.coastal` 게이트). 바다는 남쪽 하나뿐이고
    //     닿는 마을은 실측 3곳이다(`회부_자염_다음층.md` §C) — 그래서 소금길이 선다.
    byproduct: { salmon: 0.15, shrimp: 0.10, crab: 0.08, oyster: 0.06, seaweed: 0.12, salt: 0.05 },
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

// ★★[T329 2026-09-19] **포위 봉쇄 훅(`_siegeOutMul`·`SIEGE_OUTDOOR_JOBS`)은 걷어냈다.**
//   재민 캐논(09-18): *"봉쇄 상태 없음 · 배수 없음"*. 야외 노동이 끊기는 것은 배수가 아니라 **반경**이다 —
//   위협 T 가 오르면 마을 밖 현장이 가까워진다(`villages._lifeJobSites` R_out = 생활권 × (1−T)).
//   생산 식엔 그 자리에 아무 것도 안 남는다(곱 하나가 통째로 빠졌다 — 훅이 미설치였던 세계와 **비트 동일**).

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
// 단위 가격은 기존 원석 단가. 비축 수·그 비축의 값 몫을 기존 광종 비율로 나눈다.
if(T1188_ORE_SPLIT)for(const id of OreGoods.ids){const f=OreGoods.shares()[OreGoods.mineralOf(id)]||0;BASE_VALUE[id]=BASE_VALUE.ore;RESERVE_PC[id]=RESERVE_PC.ore*f;}
if(T1188_ORE_SPLIT)delete RESERVE_PC.ore;
function oreSourceMix(v) { const m=v?.land?.oreMix;return m&&Object.keys(m).length?m:m?SMELT_PLACER:OreGoods.POOL; }
function oreTotal(v) { return T1188_ORE_SPLIT?OreGoods.total(v?.storage):(v?.storage?.ore||0); }
function oreReserveTotal() { return T1188_ORE_SPLIT?OreGoods.ids.reduce((n,k)=>n+(RESERVE_PC[k]||0),0):(RESERVE_PC.ore||0); }
function oreValue(v,w) { let n=0;for(const[k,f]of Object.entries(OreGoods.shares(oreSourceMix(v))))n+=f*(w(OreGoods.idOf(k))||0);return n; }
function oreWeights(v,w) { return T1188_ORE_SPLIT?(r=>r==='ore'?oreValue(v,w):w(r)):w; }
function migrateOre(v) { if(!v)return;if(!T1188_ORE_SPLIT){for(const st of[v.storage,v.treasury]){const n=OreGoods.total(st);if(!(n>0))continue;if(st===v.storage)foldOreMix(v,st.ore||0,n,OreGoods.heldMix(st));st.ore=(st.ore||0)+n;for(const k of OreGoods.ids)if(k in st)st[k]=0;}return;}for(const st of[v.storage,v.treasury])if(st?.ore>0){const n=st.ore;OreGoods.add(st,n,Object.keys(OreGoods.shares(v._oreMixEff||{})).length?v._oreMixEff:oreSourceMix(v));st.ore=0;} }
function takeOre(v,n) { const out=OreGoods.take(v.storage,n);for(const[k,q]of Object.entries(out))_cons(v,k,q);return Object.values(out).reduce((a,b)=>a+b,0); }
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
// ★★[T161 2026-09-07 · T135 3판 누락 수리] **오디(`mulberry_fruit`)에 소비처가 없었다.**
//   3판이 `specialty.RESOURCES` 에는 등재했는데(팔린다) 이 표에는 안 넣어서, 800일에 4,095 를 걷어도
//   **식량등가가 0** 이었다(T151 §ⓐ 실측 · 먹히지도 K 에 잡히지도 않는 그 "유령" 모양 그대로다).
//   ⇒ **새 수 0** — 이 표가 이미 쥔 산포도(`grape` 0.3) 값을 그대로 쓴다. 근거는 이 표 자신의 규칙이다:
//     위 주석이 *"계수 보수적(≤0.5) … 산포도 0.3"* 이라 적었고, 오디는 같은 부류(작은 산과일)다.
//     (3판이 `specialty` 에서 고른 형제는 산딸기 `fruit_berries` 인데, 이 표에는 산딸기 줄이 없다 —
//      이 표에서 이름 붙은 산과일의 선례는 `grape` 하나다.)
FORAGE_FOOD_FACTOR.mulberry_fruit = FORAGE_FOOD_FACTOR.grape;

// 소비 (일일 1인당)
const DAILY_FOOD_CONSUMPTION = 1.0;
// ★도구 사용마모(storage.tool=석기에만 적용, line ~1047). 도구=석기 전용 전환으로 석기가 유일 자본재가 됨 →
//   종전 값(농부 0.04·기타 0.02)은 석기가 "희생 풀"(청동/철도구가 실 자본)이던 시절 калиб — 이제 이 마모를 대장장이가 다 메워야 하는데
//   throughput(0.4/일·인) 대비 과대(90인 마을 ~2.5/일 소모 → 대장장이 7~8명 필요, 저커버리지 poverty-trap→아사). 절반으로 하향 = 석기를 내구 자본재로 취급.
const DAILY_TOOL_WEAR_PER_FARMER = 0.02;  // 농부가 도구 마모(석기)
const DAILY_TOOL_WEAR_PER_OTHER = 0.01;

// ★★[T17 2026-09-02 · 재민 확정] **ECON 수술의 세 축 손잡이.**
//   지시 §3 이 "①~③ 각각 끈 시드 1개씩"을 대조군으로 요구한다 — 파급을 축별로 귀속할 수 있어야
//   "게시 건수가 왜 움직였나"에 답할 수 있다(옛/새/귀속 표). 셋 다 끄면 **T17 이전과 비트 동일**이다.
//   ⚠손잡이는 되돌리는 스위치이지 튜닝 노브가 아니다 — 값은 켬/끔 둘뿐이다(주사위 금지).
// ★[T17 ②] 보존식 4종과 그 원물 — **`server/spoil.js` 의 레시피 표가 정본**이다(사본 금지).
//   `dry_fish: fish→dried_fish · dry_fruit: berry→dried_fruit · smoke_meat: meat_raw→smoked_meat
//    · pickle_veg/pickle_fish: vegetable|fish→pickled_veg`.
//   여기 적는 건 **econ 재화 이름**(플레이어 `berry`=econ `fruit` · `meat_raw`=`meat`)이고,
//   그 대응도 새로 정하지 않는다 — `PV_DEPOSIT_MAP`(server/villages.js)이 이미 정한 대응 그대로다.
const PRESERVE_FROM = { fish: 'dried_fish', fruit: 'dried_fruit', meat: 'smoked_meat', vegetable: 'pickled_veg' };
const PRESERVED_FOODS = ['dried_fish', 'dried_fruit', 'smoked_meat', 'pickled_veg'];
// ★수율 — **새 수가 아니다.** `server/spoil.js` 의 산출 수율은 `0.4 + 0.6×신선도` 이고,
//   여기서 보존하는 것은 **목표 재고를 넘긴 잉여**(= 오래 묵어 신선도가 바닥인 몫)라 그 식의 **하한 0.4** 다.
//   (플레이어가 싱싱한 걸 말리면 1.0 까지 받는다 — 그건 플레이어 층의 손맛이고 여기서 흉내내지 않는다.)
const PRESERVE_YIELD = require('../server/fish-preserve').ECON_YIELD;
// ★★[T17 ② 수리 2026-09-02] **말린다고 열량이 사라지면 안 된다.**
//   첫 판 실측에서 시드 7 인구가 −12.5% 났다. 원인이 정확히 이것이었다:
//   생선 1 → 건어물 0.4 로 만들어 놓고 건어물을 **1:1 로 먹였더니** 열량의 60% 가 증발했고,
//   `totalFoodEquivalent`(K 계산)가 보존식을 아예 안 세어 마을 수용력까지 같이 내려갔다.
//   ⇒ 건조는 **물을 뺄 뿐 열량을 빼지 않는다**(무게 정본도 그렇게 적혀 있다: 생선 0.90kg →
//     건어물 0.35kg, 어육 수분 75~80%). 그러니 보존식 1단위는 **신선 1/수율 = 2.5단위**의 열량이다.
//   이 한 수가 셋을 동시에 정한다: 식단 환산 · K 환산 · 그리고 `baseValue`(원물값 ÷ 수율).
const PRESERVE_FOOD_FACTOR = 1 / PRESERVE_YIELD;   // 2.5 — 새 수가 아니라 위 수율의 역수다
// ★★[T17 ② · T860 이 함수로 뺐다 — 글자 그대로] **갈무리 한 걸음** — 요리사 블록(아래 cook 갈래)이 부르던 그 줄이다.
//   ⓐ **언제 말리나** — 식량이 넉넉할 때만. 그 '넉넉함'의 선도 정본 둘의 곱이다:
//      `RESERVE_PC.food`(30 = 1인당 목표 재고 = 30일치) × `DAILY_FOOD_CONSUMPTION`(1.0/인·일).
//      ⇒ *"서른 날치가 넘게 쌓였을 때만 갈무리한다."* 굶주린 마을은 말리지 않는다.
//   ⓑ **무엇을 말리나** — 오늘 먹을 몫(N×1.0)을 남긴 나머지. 입에 든 걸 빼앗지 않는다.
//   ⓒ 손 = `budget`(부르는 쪽이 준다 — 요리사 = `jdef.base × skillMul`) · ⓓ 수율 = `PRESERVE_YIELD`.
//   `cap`(칸 → 상한)이 오면 잉여를 그 칸 상한 안으로 · `unit`(칸 → 식량 환산)이 오면 산출에 곱한다 — 둘 다 null 이면 종전 글자(요리사 · 끔).
function _preserveSurplus(v, from, budget, addProduce, cap, unit) {
  const _N = v.npcs.length || 1;
  if (totalFoodEquivalent(v) > _N * DAILY_FOOD_CONSUMPTION * (RESERVE_PC.food || 30)) {
    let _pBudget = budget;
    for (const _fr in from) {
      if (_pBudget <= 0) break;
      let _sur = (v.storage[_fr] || 0) - _N * DAILY_FOOD_CONSUMPTION;
      if (cap) _sur = Math.min(_sur, cap[_fr] || 0);
      if (!(_sur > 0)) continue;
      const _take = Math.min(_sur, _pBudget);
      if(T1192_FISH_SPECIES&&(_fr==='fish'||FishGoods.species().includes(_fr))){_t1192Preserve(v,_fr,_take,addProduce);_pBudget-=_take;continue;}
      v.storage[_fr] -= _take; _cons(v, _fr, _take);   // ★flow-EMA — 보존도 수요다
      addProduce(from[_fr], unit ? _take * PRESERVE_YIELD * unit(_fr) : _take * PRESERVE_YIELD);
      _pBudget -= _take;
    }
  }
}
// ★★[T860 2026-10-22 · 세션5 · T847 조사 ⓐⓑ · 재민 10-15 *"갓 잡은 걸로 가공이 안 되는 건 문제"*] **잡은 날 제 손으로 말린다** —
//   손잡이 하나 `T860_CATCH_DRY`('1' 만 켬 · 끔 = 아래 갈래를 아무도 안 탄다 = main 바이트).
//   켜면 어부 · 사냥꾼이 그날 잡은 것을 그날 제 손으로 말린다(위 `_preserveSurplus` 그대로 · 사본 0). 새 수 0:
//     · 손 = 그 몸의 **남는 시간** — 그날 그 몸의 생산이 포만으로 깎인 몫 `1 − 실제/잠재`(여유노동 `_idleFrac` 과 같은 식 ·
//       생활층 일과의 반일 확률이 읽는 그 정본을 몸 하나로) × 요리사 하루 처리량(`JOBS.cook.base`) × 그 몸의 요리 숙련 배율(`1 + 숙련 × 0.05` — 위 생산식 그대로)
//     · 칸 상한 = 그날 그 몸이 곳간에 넣은 양(잡은 것만 말린다) · 문턱 ⓐ · 잉여 ⓑ · 수율 ⓓ 는 요리사와 같다
//     · 산출 열량 보존 — 칸 1단위의 식량 환산(`FORAGE_FOOD_FACTOR` · 생선 · 고기 1)을 곱한다(새우 1 → 건어물 0.4 × 0.35 — 말려도 열량은 그대로 · 생성 0)
//   잡은 칸 → 보존식은 **spoil 정본 레시피**(`dry_fish` 어종 집합 → 건어물 · `smoke_meat` 날고기 → 훈제육)를 `PV_DEPOSIT_MAP` 대응으로 옮긴 것이다
//     (사본 검사 — `scripts/test-t860-catch-dry.js` 가 정본과 대조한다). 굴 · 해조는 정본이 제 산출(건굴 · 마른 미역)을 갖는데 econ 에 그 칸이 없어 안 넣는다(회부).
const T860_ON = (typeof process !== 'undefined' && process.env && process.env.T860_CATCH_DRY === '1');
const CATCH_FROM = { fisher: { fish: 'dried_fish', salmon: 'dried_fish', shrimp: 'dried_fish', crab: 'dried_fish' }, hunter: { meat: 'smoked_meat' } };
const _t860Unit = (r) => (FORAGE_FOOD_FACTOR[r] != null ? FORAGE_FOOD_FACTOR[r] : 1);
// ★★[T877 2026-10-23 · T860 회부 4] **요리사 갈무리도 열량을 지킨다** — 손잡이 하나 `T877_DRY_FIX`(★T911 켬 기본 · `=0` = 종전 바이트).
//   종전 요리사 갈무리는 과일 · 남새(식량 환산 0.4)를 수율 0.4 로 말려 보존식 환산 2.5 로 먹였다 — 열량이 2.5 배(생성).
//   켜면 요리사도 잡은 날 말리기와 **같은 식**(`_t860Unit` — 산출 = 뗀 양 × 수율 × 원물 1단위 식량 환산)을 쓴다(사본 0 · 생선 · 고기는 1 이라 무변).
//   ★손잡이는 `server/specialty.js` 가 읽는다(`T877_DRY_FIX` — 같은 손잡이가 건굴 · 마른 미역 칸도 세운다 · 읽는 자리 하나). 여기는 그 값을 받는다.
const T877_ON = (() => { try { return !!require('../server/specialty').T877_ON; } catch (e) { return false; } })();
// ★★[T877 ②] 켬 = 건굴 · 마른 미역이 보존식(환산 2.5 · 사다리 맨 뒤)이고 어부가 잡은 날 굴 · 해조를 그것으로 말린다(spoil 정본 `dry_oyster` · `dry_seaweed`).
if (T877_ON) { PRESERVED_FOODS.push('dried_oyster', 'dried_seaweed'); Object.assign(CATCH_FROM.fisher, { oyster: 'dried_oyster', seaweed: 'dried_seaweed' }); }
// T1192: no inferred species for an anonymous fish slot. Real lot identities override aggregate storage.
function preservedFactor(r){return T1192_FISH_SPECIES&&FishGoods.isItem(r)?FishGoods.factor(r):PRESERVE_FOOD_FACTOR;}
if(T1192_FISH_SPECIES){
  for(const [id,it]of Object.entries(FishGoods.items())){
    if(!PRESERVED_FOODS.includes(id))PRESERVED_FOODS.push(id);
    const f=FishGoods.factor(id);BASE_VALUE[id]=require('../server/specialty').RESOURCES[it.kind==='dry'?'dried_fish':'pickled_veg'].baseValue*f/PRESERVE_FOOD_FACTOR;RESERVE_PC[id]=0;
  }
  for(const s of FishGoods.species())if(RESOURCES.includes(s)){PRESERVE_FROM[s]=require('../server/fish-preserve').driedId(s);CATCH_FROM.fisher[s]=PRESERVE_FROM[s];}
}
function fishPreserveReserve(v,id){return FishGoods.reserve(v,id,RESERVE_PC.dried_fish||0,RESERVE_PC.pickled_veg||0,PRESERVE_FOOD_FACTOR);}
function _t1192Preserve(v,from,take,addProduce){
  const G=require('../server/granary-lots'),FP=require('../server/fish-preserve'),K=require('../server/kcal');
  const active=G.ON&&G.attached(v),captured=active&&G.capBegin(v,from);
  v.storage[from]-=take;_cons(v,from,take);
  const recs=captured?G.capEnd(v,from):[],out=[];let accounted=0;
  for(const r of recs){const src=FishGoods.species().includes(r.it)?r.it:(FishGoods.species().includes(from)?from:null);if(!src)continue;
    const n=G.countOf(r,src,K.kcalOf,K.DAY_KCAL);if(!(n>0))continue;
    const id=FP.driedId(src),row=G.preserveRecord(r,src,id,n);out.push({id,n,row,src,r0:r});accounted+=r.u;
  }
  // Headless typed catches have an identity; generic historical stock does not.
  const left=Math.max(0,take-accounted);
  if(left>1e-9){if(FishGoods.species().includes(from)){const n=left*_t860Unit(from)/FishGoods.factor(from);out.push({id:FP.driedId(from),n,src:from});}
    else out.push({id:'dried_fish',n:left*PRESERVE_YIELD});}
  // Existing pickle recipe and its salt cost decide feasibility. Keep the already-defined daily salt need; no invented dry/pickle ratio.
  const saltPer=require('../server/spoil').PRESERVE.pickle_fish.needs.salt||0;
  let saltLeft=Math.max(0,(v.storage.salt||0)-(v.npcs.length||1)*SALT_DAILY_PC),saltUsed=0;
  for(const x of out)if(x.src&&saltPer>0&&saltLeft+1e-9>=x.n*saltPer){const cost=x.n*saltPer;saltLeft-=cost;saltUsed+=cost;x.id=FP.pickledId(x.src);if(x.r0)x.row=G.preserveRecord(x.r0,x.src,x.id,x.n);}
  if(saltUsed>0){v.storage.salt-=saltUsed;_cons(v,'salt',saltUsed);}
  for(const x of out){if(x.row)G.pushIn(v,x.id,[x.row]);addProduce(x.id,x.n,true);if(x.row)G.clearIn(v,x.id);}
}
function _t860Begin(v, from, potA, actA) {
  const st = {}; for (const r in from) st[r] = v.storage[r] || 0;
  return { from, potA, actA, st };
}
function _t860Dry(v, npc, b, potA, actA, addProduce) {
  const dPot = potA - b.potA, dAct = actA - b.actA;
  const spare = dPot > 0 ? Math.max(0, 1 - dAct / dPot) : 0;
  if (!(spare > 0)) return;
  const cap = {}; let any = false;
  for (const r in b.from) { const c = (v.storage[r] || 0) - b.st[r]; cap[r] = c > 0 ? c : 0; if (c > 0) any = true; }
  if (!any) return;
  const budget = JOBS.cook.base * (1 + ((npc.skills && npc.skills.cooking) || 0) * 0.05) * spare;
  _preserveSurplus(v, b.from, budget, addProduce, cap, _t860Unit);
}
// ★[T17 ③] 소금 일상 소비(인구 비례) — 위 소비처 주석의 두 근거가 만나는 값.
const SALT_DAILY_PC = 0.01;
// ★[T60 ① 후보ⓑ] 흐름 눈금 손잡이 — 지리 눈금(ⓐⓒ)은 `server/sustain.js` 가 갖는다(사본 금지).
const MSY_MODE_EMA = process.env.T60_MSY_MODE === 'ema';
// ★★[T923 2026-10-24 · ★재민 10-24 ㄱ "서버가 맞다"(판정대기 1번 · T875 회부 2 · 3 · 족보 683)] **어장 MSY 상한 켬 기본** — 손잡이 `T17_MSY`(되돌림 `=0` = 열둘째 판 바이트).
//   서버는 시딩 때 그 마을 어장 MSY(`extractLandParamsApprox` → `server/sustain.js sustainOf` 의 `fishSustain`)를 `land._fishBase` 로 붙잡고,
//   하루 마감마다 `refreshFishSustain`(T661 · 첫 마감 = 첫날 econ 뒤)이 `land.fishSustain = 기준 − 결손 환산`(낚시 v2 정본)으로 매긴다
//   ⇒ 서버 econ 은 **둘째 날부터** 상한을 본다. 랩 자(t17 · t176)는 그 문이 없어 상한이 아예 없었다(T875 `nomsy` 갈래 — 서버만 무는 층).
//   ⇒ 켬이면 econ 이 **같은 값 · 같은 때**를 스스로 세운다(새 수 0 · 사본 0 — 값은 부르는 쪽이 준 그 정본 값 그대로):
//     `createVillage` 가 그 마을의 시딩 MSY(`opts.fishSustain`)를 붙잡고(`v._fishMsySeed` · land 밖 · 열거 안 되는 칸 — 저장 줄에 안 실린다), 마을 하루 마감(`fishMsyDayClose` —
//     V2 `_villageBody` 의 `restoreLand` 뒤 · 계절 배수를 씌운 임시 land 가 아니라 **원래 land** 에)에서 아직 상한이 없으면 그 값으로 세운다
//     = 결손 0 인 `refreshFishSustain` 과 같은 값(`+(기준 − 0).toFixed(4)` = 소수 둘째 자리 값 그대로) · 같은 날(첫날 econ 은 상한 없이 · 둘째 날부터 문다).
//     ⚠`tickVillage` 안(끝)에 두면 안 된다 — V2 가 그날 land 를 계절 배수 사본으로 바꿔 끼웠다가 되돌려(`applyLandModifiers` · `restoreLand`) 그 칸이 버려진다
//       (첫 시도가 그랬다: 물 있는 45마을이 다 시딩 MSY 를 쥐고도 상한 선 마을 0 · 보고 T923 §1). 대장장이 제련 날의 `return` 도 그 끝을 건너뛴다.
//   ★서버는 무변이다 — 서버의 하루 마감 갱신(`refreshFishSustain`)이 같은 날 그 칸을 곧바로 덮는다(결손이 있으면 그 값 · 없으면 같은 값 · 서버 기준선 3/3 · 보고 T923).
//     (`T661_CARAVAN_TICK=0` — 종전 벽시계 60초 주기 갈래 — 에선 서버도 둘째 날부터 문다: 종전엔 첫 주기 날이 판마다 달랐다.)
//   ⚠종전 `T17_MSY=1`(시딩 순간 land 에 꽂아 **첫날부터** 물리던 갈래 · T17 §5 · T60 의 켜 본 표)은 이 꼴로 바뀌었다 —
//     첫날부터 무는 세계는 서버에 없다(그 꼴로 서버를 돌리면 첫날 17마을이 갈린다 · 보고 T923 §1).
//   ⚠랩 HTML(마을실험실 · 전쟁실험실)은 제 공간 층(어장 버킷)이 `land.fishSustain` 을 따로 매기고 `extractLandParams` 가 `fishSustain` 을 안 넘겨 이 칸이 안 선다(무변).
const T17_MSY = !(typeof process !== 'undefined' && process.env && process.env.T17_MSY === '0');
// ★[T923] 마을 하루 마감 — 아직 상한이 없으면 시딩 MSY 로(위 주석). V2 `_villageBody` 가 `restoreLand` 바로 뒤에 부른다(원래 land · 늘 닿는 자리).
function fishMsyDayClose(v) {
  if (T17_MSY && v && v._fishMsySeed != null && v.land && v.land.fishSustain == null) v.land.fishSustain = v._fishMsySeed;
}
// ★[T570] 첫 계절의 길이 = 달력 정본(켬: 1년 봄 3~5월 92일 · 끔 `T570_CALENDAR=0`: 옛 경계 90 글자 그대로).
const MSY_EMA_LOCK_DAYS = (() => { const C = require('../server/calendar'); return C.ON ? C.seasonLen(0) : 90; })();   // econ 계절 경계 — 새 수 아님
const MSY_HEADROOM = (() => { const v = parseFloat(process.env.T60_MSY_HEADROOM || ''); return (isFinite(v) && v > 0) ? v : 2; })();
// ★★[T73 ECON 수술 2-a 2026-09-03 · 재민 확정] **곳간의 생곡은 식량이다.**
//   나온 자리: T60 §0-ⓔ' — 소멸한 광산1 은 **밀 21 · 쌀 12 를 두고 굶어 죽었다**.
//   `totalFoodEquivalent` 도 `consumeFood` 사다리도 생곡을 안 세는데, **세계의 다른 곳은 이미 식량으로 친다**:
//     · `server/specialty.js`  wheat/rice/barley 가 `contributes: {subsistence: 1 · 1 · 0.9}`
//     · 이 파일 `FOOD_GLUT_SAT`  { food, cooked_food, **wheat, rice, barley** } — 곡물 과잉을 식량 과잉으로 센다
//   ⇒ 안 세는 자리가 둘뿐이었다. 그 둘을 맞춘다. **생곡→`food` 변환은 econ 어디에도 없다**(전수 확인).
//
// ★계수 — 새 수는 **하나**다. 그리고 발명이 아니라 **두 정본의 나눗셈**이다.
//   ⓐ 무게 정본(`server/weights.js`)  food 0.70kg · wheat 0.70 · rice 0.75 · barley 0.65
//   ⓑ 열량 정본(`server/kcal.js` · T59) KCAL_PER_KG.food = 3500 — **곡물이 그 앵커다**(T59 회부: "곡물만 정확히 1.00")
//   ⇒ 교차 검산: `food` 1단위 = 0.70kg × 3500 = **2,450kcal = DAY_KCAL** = 하루치.
//      사다리가 "사람 하루"를 단위로 서 있다는 뜻이고, `DAILY_FOOD_CONSUMPTION = 1.0` 이 그 증거다.
//   ⇒ 생곡 1단위 = (도정 수율)만큼의 `food` 다. 도정 수율은 고증 앵커: **쌀 72% · 밀 75%**.
//      셋을 한 수로 묶으라는 지시라, 주어진 둘 중 **보수값(쌀 0.72)** 을 쓴다.
//      (품목별로 kg 비까지 반영하면 밀 0.750 · 쌀 0.771 이 되어 **더 커진다** — 0.72 는 그 아래다.)
const RAW_GRAINS = ['wheat', 'rice', 'barley'];          // 부산물 표에 있는 셋이 전부(기장은 산출 0 — 실측)
//   ⚠`T73_GRAIN_F` 는 **후보 스크린용 손잡이**다(지시 §1: 후보는 시드 1020 하나로 거른다).
//     기본값은 위 근거 표에서 유도한 0.72 이고, 계측기 말고는 아무도 이 값을 안 바꾼다.
const RAW_GRAIN_FOOD_FACTOR = (() => {
  const v = parseFloat(process.env.T73_GRAIN_F || '');
  return (isFinite(v) && v > 0 && v <= 1) ? v : 0.72;    // ★새 수 하나 — 쌀 도정 수율. 위 근거 표에서 유도
})();
const T73_RAWGRAIN = process.env.T73_RAWGRAIN !== '0';   // 되돌림: T73_RAWGRAIN=0 → T60 기준선 비트 재현
// ★★[T1243 추신 1 · T1239 회부 5 · 족보 801] **도정 0.72 는 한 곳에서 한 번만** — 켬 묶음(`T1243_FARM_ON`)에서 생곡 셋의 낱개 식량 값 =
//   열량 정본(`kcal.econUnitsOf` — kg × 작물 표 kcal/kg ÷ 2,450) × 상태 몫(수확 kg 의 상태 ↔ 작물 표 kcal 의 상태 — 아래 표 · 껍질 · 도정 몫은 그 둘의 차이로만).
//   ⚠수확 kg(T1215 · T1221 출처)과 작물 표 kcal 이 같은 상태면 몫 1 — 0.72 를 또 곱하지 않는다(T1239 §1-② "econ 0.72 를 또 곱함").
//   상태를 못 맞춘 작물은 몫 1 · `st: '미확인'`(새 수 0 — 보고 표). 끔 = `RAW_GRAIN_FOOD_FACTOR` 그대로(오늘 바이트).
//   먹는 쪽(사다리 · 재고 환산 · 생산 환산 · `_t86Factor`)과 거두는 쪽(`_t368FoodPer`)이 이 함수 하나를 읽는다(사본 0).
const T1243_GRAIN_STATE = {
  rice:   { harvest: '현미(T1221 범위 — 야요이 현미 10a 당 100 kg 이하 · 寺沢)', kcal: '쌀 낟알 3,500 kcal/kg(kcal.js 앵커 · xlsx)', ratio: 1, st: '확인' },
  wheat:  { harvest: '겉밀 명목(R02 — 껍질 포함 여부 표기 없음)', kcal: '밀 낟알(xlsx)', ratio: 1, st: '미확인' },
  barley: { harvest: '보리 낟알(R02 북터키 실험 — 겉보리 껍질 몫 표기 없음)', kcal: '보리 낟알(xlsx)', ratio: 1, st: '미확인' },
};
let _kcalMod;
function _kcalM() { if (_kcalMod === undefined) { try { _kcalMod = require('../server/kcal'); } catch (e) { _kcalMod = null; } } return _kcalMod; }
const _t1243GrainF = {};
function _rawGrainF(r) {
  if (!T1243_FARM_ON) return RAW_GRAIN_FOOD_FACTOR;
  if (_t1243GrainF[r] != null) return _t1243GrainF[r];
  const K = _kcalM(), S = T1243_GRAIN_STATE[r];
  const u = (K && typeof K.econUnitsOf === 'function') ? +K.econUnitsOf(r, 1) || 0 : 0;
  return (_t1243GrainF[r] = (u > 0 && S) ? u * S.ratio : RAW_GRAIN_FOOD_FACTOR);
}
const T17_TOOL     = process.env.T17_TOOL     !== '0';   // ① 도구 마모를 흐름으로 기록
const T17_PRESERVE = process.env.T17_PRESERVE !== '0';   // ② 보존식 편입
const T17_SALT     = process.env.T17_SALT     !== '0';   // ③ 자염 편입
// ★★[T635 2026-10-04] **새 품목 수요부터 — 손잡이 둘 · 둘 다 기본 끔(= 지금 바이트)** · 새 수 0(쓰임 몫 = 이미 있는 비슷한 품목의 칸 그대로)
//   ① `T635_SHELL_ORNAMENT=1` — 조개 팔찌감(`shell_bangle` · `T574_NEW_ITEMS=1` 일 때만 품목이 있다)을 **옥(`jade`)과 같은 꼴의 위신재**로:
//      v1 비축(`RESERVE_PC`) · 웃돈 상한(`LUX_V1`) · 늘 포만(`SAT_ALWAYS`) · 봉헌(`RITE_PC`) 칸을 옥의 그 수로 · 값(`BASE_VALUE`)은 품목표 값 그대로
//      (v2 쪽 — 탄력 · 효용 · 위신재 표 · 부패 — 는 `economy-sim-v2.js` 같은 손잡이). 공급 = 어부 부산물(조개 칸 `oyster` 율 그대로)
//      × `land.shellBangle`(존 특산 표의 조개 팔찌감 단계 — 서버 `extractLandParamsApprox` 가 바다 닿는 마을에만 세운다).
//   ② `T635_SEA_SPECIES=1` — 바다 닿는 마을의 어부 산출 `fish` 를 T602 해안 표 종으로 나눈다(`land.seaMix` — 비 = T602 흔함 칸 ·
//      서버가 그 마을 해안 구간으로 세운다) · **합 kg 무변**(종 몫 kg = fish kg × 비 → 낱개 = ÷ 그 종 무게 · 무게 정본 `specialty.weight`) ·
//      종은 식단(T86)에서 `fish` 군 · 열량은 **kg 그대로**(1kg 종 = 1kg fish — 같은 kg 를 나눴으니 끼니가 무변).
const T635_SHELL_ORNAMENT = (typeof process !== 'undefined' && process.env && process.env.T635_SHELL_ORNAMENT === '1');
const T635_SEA_SPECIES = (typeof process !== 'undefined' && process.env && process.env.T635_SEA_SPECIES === '1');
const _t635Sea = Object.create(null);   // ② 나눠 낸 종 → 1낱 = fish 몇 단위(kg 비) — 식단이 이 표로 먹는다(켠 판에서만 찬다)

// ★flow-EMA 소비 계측(2026-07-12, CHECKLIST 154 부채 해소): 실소비를 v._consDay에 기록 → tickVillage 일 경계에서
//   v._consEMA(30일 관성)로 폴드 → v2 가격 target의 flowT(=EMA×30)가 됨. 유령 보유 하한(N×0.5) 제거의 보상 —
//   소비재 수요는 실측 흐름이 만든다(신규 재화는 소비처에 _cons 한 줄 = CAP_TARGET·시드·글럿가드·감산 4종 수동 통합 불요).
//   plain number만 기록(serializeEcon 계약). RNG 무접촉 — 결정론 보존.
function _cons(v, r, amt) { if (!(amt > 0)) return; const d = v._consDay || (v._consDay = {}); d[r] = (d[r] || 0) + amt;
  if (T692_SEED_RESERVE && r === 'wood' && v._seedReserve > 0) v._seedReserve = Math.max(0, v._seedReserve - amt); }   // ★[T692] 마을 안 통나무 소비는 비축에서 먼저 쓴다(아래 손잡이 주석)
// ★★[T692 2026-10-11] **시딩 가산 몫 = 마을 비축** — 손잡이 `T692_SEED_RESERVE`(**기본 끔** · `=1` 만 켬 · 끔이면 이 줄들이 아무것도 안 바꾼다 = 종전 비트).
//   LANDFIT 가 나무 모자란 땅에 얹은 통나무(`createVillage` — `initN × 20 × (1 − land.wood) × LANDFIT_K` · "못 주는 만큼 지고 온다")가
//   첫 달 첫 수레(상한 `CARGO_PER_TRIP` 100)로 나무 있는 쪽에 팔려 나간다(T683 — 첫 30일 수출의 88~92% 가 가산 마을).
//   켜면 그 가산량 **그대로**를 그 마을 비축 칸 `v._seedReserve` 에 적는다(새 수 0):
//     · 마을 안 소비(`_cons(v, 'wood', …)` — 땔감 · 집 · 노 · 숯가마 · 집 크루)는 **비축에서 먼저** 쓴다 → 비축이 준다.
//     · 비축은 곳간을 넘지 않는다 — 하루 머리(`tickVillage`)에 곳간으로 깎는다(자급 인출 · 확장 등 `_cons` 밖으로 곳간이 줄면 그만큼).
//     · 수출 두 문(v2 발주 후보 · 귀환 화물로 되사 감)은 **곳간 − 비축**(`seedReserveAvail`)만 본다 — 비축은 수레로 안 나간다.
//     · 비축이 다 쓰이면(0) 종전과 같다. 날 기한은 두지 않는다(새 날 수 0) · 통나무 하나 · 인구 0 터(가산 0)는 안 선다.
const T692_SEED_RESERVE = (typeof process !== 'undefined' && process.env && process.env.T692_SEED_RESERVE === '1');
function seedReserveHeld(v, r) {   // 곳간 가운데 비축으로 쥔 양 — 끔 · 통나무 밖 · 비축 없음이면 0
  if (!T692_SEED_RESERVE || r !== 'wood' || !(v && v._seedReserve > 0)) return 0;
  return Math.min(v._seedReserve, Math.max(0, (v.storage && v.storage[r]) || 0));
}
function seedReserveAvail(v, r) { return ((v.storage && v.storage[r]) || 0) - seedReserveHeld(v, r); }   // 수출 문이 보는 곳간(끔 = 곳간 그대로)

// 식량 소비 우선순위 — cooked_food > fish/meat > food > 채집물(fruit/veg/mushroom)
// 채집물은 환산비가 낮아 농사보다 끼니로 비효율
// ★[T423] 마을 식사 명부 — 원정 중 팩을 먹는 병사(`_warPack`)를 뺀 수. 표식이 없으면(끔 · 전쟁 없는 세계) 한 글자도 안 다르다.
function _t423EatN(v, N) { let k = 0; for (const p of v.npcs) if (p._warPack && p._warDraft) k++; return k ? N - k : N; }
// T1157 b: use public food only to cover today's private food shortage.
const T1157_EAT_VAULT = typeof process !== 'undefined' && process.env && process.env.T1157_EAT_VAULT === '1';
function t1157Food(v, need) {
  if (!T1157_EAT_VAULT || !v.treasury) return;
  let missing = Math.max(0, need - totalFoodEquivalent(v));
  for (const r of Object.keys(v.treasury)) {
    if (!(missing > 1e-9)) break;
    const available = Math.max(0, v.treasury[r] || 0);
    if (!(available > 0)) continue;
    const storage = { food: 0, fish: 0, meat: 0, cooked_food: 0 }; storage[r] = 1;
    const f = totalFoodEquivalent({ storage, _world: v._world });
    if (!(f > 0)) continue;
    const q = Math.min(available, missing / f);
    v.treasury[r] -= q; v.storage[r] = (v.storage[r] || 0) + q;
    missing -= q * f;
  }
}
function consumeFood(v, need) {
  if (T1157_EAT_VAULT) t1157Food(v, need);
  let remaining = need;
  // ★소비량 군별 기록(_foodEaten) — 이게 진짜 식단(자체생산+수입, 신선히 먹은 것 포함). 다양성 판정에 씀.
  const eaten = v._foodEaten || (v._foodEaten = {});
  for (const k in eaten) eaten[k] = 0;
  // ★★[T86] **예산 단계 — 사다리보다 먼저.** 열량 예산 `need` 를 군별 몫 w_g 로 나누고, 군 안에서는
  //   **열량 1단위당 유효가격**(그림자가격 ÷ 열량환산)이 싼 품목부터 먹는다.
  //   ★군별 배정은 **가격 가중 지출 몫**이다(재민 판정 ⓓ): x_g = need × (w_g/p_g) / Σ(w_h/p_h).
  //   ⚠가격은 **v2 가 마을에 덮어 둔 캐시**(`_priceCache`)를 읽는다 — `server/trade.js` 머리 주석의
  //     "같은 날 안에선 같은 값" 규약을 식단도 그대로 따른다(NPC 교역 틱과 같은 표를 본다 · 사본 0).
  //   ⚠캐시가 없으면(v1 CLI · 픽스처 · 하네스) **조용히 아래 사다리로 내려간다** = 종전과 비트 동일.
  //     그게 하위 호환의 자리다 — 곳간에 한 품목뿐인 마을도 종전과 같다(예산이 한 군에 다 간다).
  if (T86_DIET && remaining > 1e-9) {
    const P = v._priceCache;
    if (P) {
      const cand = {};
      for (const r of (T635_SEA_SPECIES ? _t635DietIds() : Object.keys(T86_GROUP))) {   // ★[T635 ②] 켜면 나눠 낸 종도 `fish` 군(끔 = 종전 열쇠 순서 그대로)
        if (PRESERVED_FOODS.indexOf(r) >= 0) continue;      // 보존식은 예산 밖 — 맨 뒤 규약(T17 ②)
        const q = v.storage[r] || 0; if (!(q > 0)) continue;
        const fe = _t86Factor(r); if (!(fe > 0)) continue;
        const pr = P[r]; if (!(pr > 0)) continue;
        const g = T86_GROUP[r] || (T635_SEA_SPECIES && _t635Sea[r] != null ? 'fish' : undefined);
        (cand[g] || (cand[g] = [])).push({ r, fe, per: pr / fe });   // 유효가격 = 그림자가격 ÷ 열량환산
      }
      const groups = Object.keys(cand);
      if (groups.length) {
        for (const g of groups) cand[g].sort((a, b) => a.per - b.per);
        // ★★[T86 · 재민 판정 ⓓ 2026-09-05] **배정은 등분이 아니라 가격 가중 지출 몫이다.**
        //   첫 판(PM 지시서 초안)은 `need × w_g` — **가격을 무시한 등분**이었다. 그건 재민이 처음부터
        //   경계한 *"무조건 골고루"* 그 자체이고, 실측이 그대로 보여 줬다: 어촌3 이 곡물을 사느라 207 → 34.
        //   ⇒ Cobb-Douglas 지출 몫: 효용 Π x_g^{w_g} 를 예산제약 아래 풀면 **x_g ∝ w_g / p_g** 다.
        //     열량 예산 `need` 로 정규화 ⇒  x_g = need × (w_g/p_g) / Σ_h (w_h/p_h)
        //     p_g = 그 군에서 **가장 싼** 열량 1단위 값(§0-ⓐ 유효가격 = 그림자가격 ÷ 열량환산)
        //           — 예산이 실제로 사는 그 값이다(군 안 정렬의 첫 칸).
        //     재고 없는 군은 애초에 `cand` 에 안 들어오므로 **분모에서 빠지고 자연히 재정규화**된다.
        //   ⇒ 싼 군이 더 많은 열량을 받는다. 어촌은 생선이 싸니 생선을 더 먹되, 곡물이 싸지면 곡물도 산다.
        let wsum = 0;
        const wp = {};
        for (const g of groups) {
          const pg = cand[g][0].per;                       // 정렬돼 있다 — 첫 칸이 그 군의 최저가
          wp[g] = (pg > 0) ? (T86_W[g] || 0) / pg : 0;
          wsum += wp[g];
        }
        let budget = {};
        for (const g of groups) budget[g] = need * ((wp[g] || 0) / (wsum || 1));
        // 한 바퀴 배정 + 한 바퀴 재분배(지시 §1 "재분배 한 바퀴")
        for (let pass = 0; pass < 2 && remaining > 1e-9; pass++) {
          let leftover = 0;
          for (const g of groups) {
            let b = Math.min(budget[g] || 0, remaining);
            for (const it of cand[g]) {
              if (b <= 1e-9 || remaining <= 1e-9) break;
              const q = v.storage[it.r] || 0; if (!(q > 0)) continue;
              const take = Math.min(b / it.fe, q);
              const got = take * it.fe;
              v.storage[it.r] = q - take;
              b -= got; remaining -= got; eaten[it.r] = (eaten[it.r] || 0) + take;
            }
            leftover += b;
          }
          if (leftover <= 1e-9) break;
          const alive = groups.filter((g) => cand[g].some((it) => (v.storage[it.r] || 0) > 1e-9));
          if (!alive.length) break;
          let w2 = 0; for (const g of alive) w2 += wp[g] || 0;   // 재분배도 같은 가격 가중으로
          budget = {};
          for (const g of alive) budget[g] = leftover * ((wp[g] || 0) / (w2 || 1));
        }
      }
    }
  }
  // 1) cooked_food (영양 풍부)
  if (v.storage.cooked_food > 0) {
    const eff = Math.min(remaining / 1.12, v.storage.cooked_food);
    v.storage.cooked_food -= eff; remaining -= eff * 1.12; eaten.cooked_food = (eaten.cooked_food || 0) + eff;
  }
  // 2) fish/meat
  for (const r of ['fish', 'meat']) {
    if (remaining > 0 && v.storage[r] > 0) {
      const eff = Math.min(remaining, v.storage[r]);
      v.storage[r] -= eff; remaining -= eff; eaten[r] = (eaten[r] || 0) + eff;
    }
  }
  // 3) 농작물 food
  if (remaining > 0 && v.storage.food > 0) {
    const eff = Math.min(remaining, v.storage.food);
    v.storage.food -= eff; remaining -= eff; eaten.food = (eaten.food || 0) + eff;
  }
  // 3.5) ★★[T73] 생곡 — **`food` 바로 뒤, 채집물 앞.**
  //   왜 이 자리인가(한 줄): 생곡은 **같은 곡물**이라 도정 한 번이면 `food` 다 — 채집물(0.25~0.5)보다
  //   훨씬 가깝다. 그런데 `food` 보다는 뒤여야 한다. 앞에 두면 **찧는 수고를 먼저 하는 게 이득**이 되어
  //   이미 찧어 둔 `food` 가 곳간에서 늙는다(T17 보존식을 맨 뒤에 둔 것과 같은 이유의 거울).
  //   ⚠환산은 위 `RAW_GRAIN_FOOD_FACTOR` 하나 — 채집물 사다리와 **같은 꼴**이다.
  //   ⚠`_cons` 는 **안 부른다**: 이 함수 끝 주석의 flow-EMA 제외 규약이 사다리 전체에 걸린다
  //     (식단은 가용성 기반 대체 소비라 flowT 에 폴드하면 수출 억압이 생긴다 — 실측 s101 245→27).
  if (T73_RAWGRAIN) {
    for (const r of RAW_GRAINS) {
      if (remaining > 0 && v.storage[r] > 0) {
        const need = remaining / _rawGrainF(r);
        const consumed = Math.min(need, v.storage[r]);
        v.storage[r] -= consumed; remaining -= consumed * _rawGrainF(r); eaten[r] = (eaten[r] || 0) + consumed;
      }
    }
  }
  // 3.6) ★★[T368] **밭의 작물 — 생곡 바로 뒤, 채집물 앞.** 같은 밭에서 난 것이라 생곡 옆이 자리다.
  //   환산은 주입된 열량 정본(econ 이 모르는 작물만 — 위 칸들이 먹는 품목은 `_t368Crops` 가 이미 뺐다 · 이중 0).
  //   ⚠채집물 사다리와 **같은 꼴**(한 단위 = f 식량). 끈 팔·주입 없음은 `null` ⇒ 이 줄은 아무것도 안 한다.
  {
    const _own = _t368Crops(v);
    if (_own) for (const [r, f] of _own) {
      if (remaining > 0 && v.storage[r] > 0) {
        const need = remaining / f;
        const consumed = Math.min(need, v.storage[r]);
        v.storage[r] -= consumed; remaining -= consumed * f; eaten[r] = (eaten[r] || 0) + consumed;
      }
    }
  }
  // 4) 채집물 (가장 비효율) — fruit/veg 0.4, mushroom 0.3
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    const f = FORAGE_FOOD_FACTOR[r];
    if (remaining > 0 && v.storage[r] > 0) {
      // 1 unit consumed → f units of food
      const unitsNeeded = remaining / f;
      const consumed = Math.min(unitsNeeded, v.storage[r]);
      v.storage[r] -= consumed;
      remaining -= consumed * f; eaten[r] = (eaten[r] || 0) + consumed;
    }
  }
  // 5) ★★[T17 ② 2026-09-02 · 재민 확정] **보존식 — 사다리 맨 뒤.**
  //   *"겨울에 신선식 부족 시 보존식 소비"*(지시 §2-②)가 이 자리 하나로 표현된다:
  //   위 넷이 다 떨어져야 여기 온다 ⇒ **겨울에만 열린다**(신선식이 있는 계절엔 이 줄이 안 돈다).
  //   ⚠환산은 1:1 이다 — 보존이 열량을 늘리지 않는다(등재 주석과 같은 이유).
  //   ⚠사다리 맨 앞이 아니라 맨 뒤인 이유: 앞에 두면 **말려 두는 게 이득**이 되어 신선식 시장이 죽는다.
  if (T17_PRESERVE) {
    for (const r of PRESERVED_FOODS) {
      if (remaining > 0 && v.storage[r] > 0) {
        // ★환산 2.5 — 채집물 사다리와 **같은 꼴**이되 방향이 반대다(채집물은 0.3~0.4, 보존식은 2.5).
        const need = remaining / preservedFactor(r);
        const consumed = Math.min(need, v.storage[r]);
        v.storage[r] -= consumed; remaining -= consumed * preservedFactor(r); eaten[r] = (eaten[r] || 0) + consumed;
      }
    }
  }
  // ★flow-EMA 제외(설계 판단·A/B 실측): 식단은 *가용성 기반 대체 소비*(cooked>어육>곡>채집 사다리 — 있는 걸 먹음)라
  //   flowT에 폴드하면 우연히 먹은 믹스가 30일 보유 수요로 고착 → 빈곤 마을이 제 채집물·생선 잉여를 못 팔게 됨(수출 억압).
  //   실측: 식단 폴드 포함 시 s101 245→27 붕괴(2026-07-12). 식량 수요는 기존 기구(subs×30·VARIETY·surplusEMA)가 전담.
  // ★★[T263 2026-09-13 · ★T362 가 그대로 가져왔다(사본 0 · 새 손잡이 0)] **되돌림 손잡이 하나** —
  //   위 제외는 **구멍이 아니라 판정**이다(근거가 바로 위 줄이다 · 족보 207).
  //   그런데 그 판정은 2026-07-12 의 엔진에서 선 것이고, 그 뒤로 T73(생곡)·T86(가격 가중 식단)·T17(보존식)·
  //   T164/T184(실현 배분)가 전부 이 사다리를 지나갔다. **오늘도 서는지**를 재려면 되돌릴 수 있어야 한다.
  //   ⇒ 훅은 **한 자리**다: 사다리 여섯 가지가 이미 `eaten`(=`_foodEaten`)에 제 몫을 적어 뒀으므로
  //     그걸 그대로 접는다(가지마다 훅을 달면 그게 사본이고, 새 가지가 생기면 조용히 빠진다).
  //   ⚠**품목별로 적는다** — `'food'` 로 뭉뚱그리지 않는다. `eaten` 의 키가 곧 사다리가 실제로 뺀 품목이고
  //     값은 그 품목의 **곳간 단위**(열량이 아니다) — 다른 `_cons` 호출부 24곳과 같은 단위다.
  //   ★새 수 0(소비량은 사다리가 적은 값 그대로) · 정본 재구현 0 · **기본 끔**(미설정 = 위 판정 그대로 = 비트 동일).
  if (foodConsOn()) for (const r in eaten) _cons(v, r, eaten[r]);
  return remaining;
}

// 총 식량 환산 (K 계산용)
function totalFoodEquivalent(v) {
  if (T1243_FARM_ON) return storageFoodEquivalent(v);
  let total = v.storage.food + v.storage.fish + v.storage.meat + v.storage.cooked_food * 1.12;
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    total += (v.storage[r] || 0) * FORAGE_FOOD_FACTOR[r];
  }
  // ★[T17 ②] 곳간에 든 보존식도 **식량이다**. 안 세면 갈무리하는 순간 마을 수용력(K)이 내려간다
  //   — 첫 판에서 실제로 그랬다(위 `PRESERVE_FOOD_FACTOR` 주석). 끄면 이 줄은 0 을 더한다.
  if (T17_PRESERVE) for (const r of PRESERVED_FOODS) { const q=v.storage[r]||0;if(q||!T1192_FISH_SPECIES)total+=q*preservedFactor(r); }
  // ★[T73] 곳간의 생곡도 식량이다 — 도정 수율만큼(위 근거 표). 끄면 이 줄은 0 을 더한다.
  if (T73_RAWGRAIN) for (const r of RAW_GRAINS) total += (v.storage[r] || 0) * _rawGrainF(r);
  // ★★[T368] 곳간의 작물도 식량이다 — **econ 이 모르는 것만**(위 줄들이 센 생곡은 빼고 · 이중 0). 끈 팔은 `null` ⇒ 0.
  const _own = _t368Crops(v);
  if (_own) for (const [r, f] of _own) total += (v.storage[r] || 0) * f;
  return total;
}
// T1246: 한 곳간 질문은 한 합계를 읽는다. econ 기본 식량은 이미 하루치 단위이고,
// 보존식은 econ 수율 단위다. 낟알의 낱개만 kg × kcal / DAY_KCAL로 환산한다.
// 이 단위 경계를 건너 이미 환산한 fish 등을 낱개 열량으로 다시 곱하지 않는다.
function storageFoodPer(v, r) {
  const K = _kcalM();
  if (!K || r.startsWith('seed_')) return 0;
  if (K.isFoodRes(r)) return r === 'cooked_food' ? K.COOKED_FACTOR : 1;
  if (PRESERVED_FOODS.includes(r)) return preservedFactor(r);
  if (Object.prototype.hasOwnProperty.call(FORAGE_FOOD_FACTOR, r)) return FORAGE_FOOD_FACTOR[r];
  if (RAW_GRAINS.includes(r)) return _rawGrainF(r); // 상태·도정 정본, 한 번만
  const f = _t368FoodPer(v, r);
  return f > 0 ? f : Math.max(0, K.econUnitsOf(r, 1));
}
function storageFoodEquivalent(v, storage = v.storage, fresh = true) {
  let total = 0;
  for (const [r, quantity] of Object.entries(storage || {})) {
    const n = Math.max(0, Number(quantity) || 0);
    if (!(n > 0)) continue;
    const f = storageFoodPer(v, r);
    if (!(f > 0)) continue;
    // 호스트 로트가 있으면 썩은 몫만 제외. 숫자 랩은 로트가 없고 일일 부패로 재고가 준다.
    const lots = fresh && _LOTH && _LOTH.freshOf ? _LOTH.freshOf(v, r) : null;
    const usable = lots ? Math.max(0, n - Math.min(n, lots.spoiledU || 0)) : n;
    total += usable * f;
  }
  return total;
}
function totalFoodProductionEquivalent(prod, v) {
  if (T1243_FARM_ON) return storageFoodEquivalent(v || {}, prod, false);
  let total = (prod.food || 0) + (prod.fish || 0) + (prod.meat || 0) + (prod.cooked_food || 0) * 1.12;
  for (const r of Object.keys(FORAGE_FOOD_FACTOR)) {
    total += (prod[r] || 0) * FORAGE_FOOD_FACTOR[r];
  }
  // ★[T17 ②] 생산 쪽도 같은 자로 — 갈무리는 **재고를 옮기는 일**이지 생산을 줄이는 일이 아니다.
  //   ⚠원물을 `_cons` 로 빼고 보존식을 `addProduce` 로 넣으므로, 같은 열량이 두 번 세지지 않는다
  //     (하루 생산 버퍼는 순증분만 담는다).
  if (T17_PRESERVE) for (const r of PRESERVED_FOODS) { const q=prod[r]||0;if(q||!T1192_FISH_SPECIES)total+=q*preservedFactor(r); }
  // ★[T73] 생산 쪽도 같은 자로 — 오늘 거둔 생곡도 식량 생산이다.
  if (T73_RAWGRAIN) for (const r of RAW_GRAINS) total += (prod[r] || 0) * _rawGrainF(r);
  // ★★[T368] 생산 쪽도 같은 자로 — 오늘 밭이 낸 작물(장부 다리가 품목별로 적은 것). 둘째 인수(마을)가 없으면 0.
  const _own = v ? _t368Crops(v) : null;
  if (_own) for (const [r, f] of _own) total += (prod[r] || 0) * f;
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
// ★★[T157] 행복 → 작업량 배수 — **순수 함수**(하네스가 이걸 직접 물어본다 · 사본 0).
//   0.5 가 중립 · 대칭 · 상한은 `H` 자신(`1 ± H/2`) — 자르는 값을 따로 짓지 않는다.
//   ⚠계수 `H` 는 이 파일이 안 갖는다: 부르는 쪽(=랩의 `world.happyWorkW`)이 준다.
// ★★★[T209 2026-09-12 · 이 함수의 유일한 접점] **하한 1 — 벌점 없이 보너스만**(T196 이 낸 #13 ② 의 길 ⓐ).
//   T196 이 표로 보인 것: 행복은 **빼는 항이 없어** 0.5 가 중간점이 아니라 채워야 하는 문턱이고,
//   서버 51마을에서 42~45% 의 마을·일이 그 아래 있다(랩 8마을은 부자 꼬리가 없어 이 구간을 못 보여준다).
//   T165 를 켜면 그 마을들이 배수 <1 을 맞고 얇은 둘이 넘어갔다(소멸 1·1·0) — 벌점이 **회복 창을 닫았다**(T196 §3).
//   ⇒ 이 손잡이는 **아래쪽만 잘라낸다**: 배수 = `max(1, 종전 식)`. 위쪽(보너스·상한 `1 + H/2`)은 한 톨도 안 바뀐다.
//   ⚠**새 수 0** — 1 은 이 함수가 이미 쓰는 중립값이다(주입이 없을 때 `return 1`). 계수 `H` 도 부르는 쪽 그대로.
//   ⚠~~**기본 끔**~~ → **[T244 2026-09-13 · 재민 확정] 기본 켬.** T209 때는 손잡이가 없으면 종전 `return` 한 줄뿐이라
//     **비트 동일**이었다. #13 ② 판정으로 이제 기본이 켬이고, **되돌림은 명시 `0` 하나**다(`L_HAPPY_FLOOR1=0` env · `window.L_HAPPY_FLOOR1=0` 랩).
//     그 되돌림 팔이 셋째 판 여덟 수와 **비트 동일**임을 T244 ⓑ 가 3시드로 실측했다(보고/T244_2026-09-13.md).
function happyFloor1On() {
  // ★★★[T244 2026-09-13 · 재민 확정 — #13 ② 켜기] **기본 켬.** 끄는 것은 **명시 `0`** 하나뿐이다.
  const off = (x) => x !== undefined && x !== null && String(x) === '0';
  const g = (typeof window !== 'undefined') ? window : null;                       // 랩은 `window.L_HAPPY_FLOOR1`(lifeInit 전 · 호출 때 읽는다)
  if (g && off(g.L_HAPPY_FLOOR1)) return false;
  if (typeof process !== 'undefined' && process.env && off(process.env.L_HAPPY_FLOOR1)) return false;
  return true;
}
// ★★★[T244 2026-09-13 · 재민 확정 — #13 ② 켜기] **계수가 정본 상수가 됐다.**
//   T157 은 랩만 켜려고 계수를 밖(`world.happyWorkW`)에서 받았다. 이제 서버 기본이 켬이므로
//   그 수의 자리가 이 파일에 하나 있어야 한다 — **랩에도 수가 없다**(랩은 `EconEngine.T157_HAPPYWORK_H` 를 읽는다 · 사본 0).
//   ⚠**새 수 0** — 출처가 잰 것(Oswald·Proto·Sgroi 2015 JOLE 33(4): 중립→행복 생산성 **+12%**)을
//     우리 축(0.5 → 1.0 = 반쪽 폭)으로 옮기면 `0.5 × H = 0.12` ⇒ **H = 0.24**. `test-lab-happywork` ②가 그 유도를 다시 대조한다.
//   되돌림: `L_HAPPYWORK=0`(env) · `window.L_HAPPYWORK=0`(랩) · `world.happyWorkW` 주입은 **덮어쓰기**로 남는다(A/B·계측기).
const T157_HAPPYWORK_H = 0.24;
function happyWorkWOf(v) {
  const w = v && v._world && v._world.happyWorkW;
  if (typeof w === 'number') return w > 0 ? w : 0;                                 // 명시 주입이 가장 세다(A/B·랩 토글·계측기)
  const x = _allocKnob('L_HAPPYWORK');                                             // 손잡이 문법은 하나다(랩 window → env)
  if (x !== null) { const n = parseFloat(x); return Number.isFinite(n) ? Math.max(0, n) : 0; }
  return T157_HAPPYWORK_H;                                                          // 미설정 = 켬(기본)
}
function happyWorkMul(happiness, W) {
  if (!(W > 0) || typeof happiness !== 'number' || !isFinite(happiness)) return 1;
  if (happyFloor1On()) return Math.max(1, Math.max(1 - W * 0.5, Math.min(1 + W * 0.5, 1 + (happiness - 0.5) * W)));   // ★[T209] 아래만 자른다(위는 그대로)
  return Math.max(1 - W * 0.5, Math.min(1 + W * 0.5, 1 + (happiness - 0.5) * W));
}
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

// ═══ ★★★[T86 ECON 수술 2-d 2026-09-03 · 재민 확정] **식단은 사다리가 아니라 예산이다** ═══════
//   재민 물음: *"식량이 여러 종류 있으면 골고루 소모해? 저렴한 것부터? 골고루만이면 비효율,
//   저렴한 것부터면 행복이 바닥 — 경제학적 균형을 맞춰야."*
//   종전 `consumeFood` 는 **고정 사다리**였다: 위 칸이 넉넉하면 그것만 먹고 **가격을 안 봤다.**
//   그래서 어촌은 곳간에 곡식이 있어도 생선만 먹어 다양성 1군이고, 가난한 마을이 긁어먹다 우연히 4군이었다.
//   ⇒ 다양성이 **설계가 아니라 재고 부족의 부산물**이었다. 그걸 예산 배분으로 바꾼다.
//
// ★군 배정 — **새 군을 만들지 않는다.** `FOOD_GROUP` 6군 그대로이고, 표에 없던 품목만 제 군에 넣는다:
//   · 생곡(밀·쌀·보리) → `grain`   T73 이 식량으로 만들었는데 다양성 표는 아직 못 보고 있었다
//   · 조리식 `cooked_food` → `grain`   근거는 이 파일의 `FOOD_GLUT_SAT` — 거기서 이미 곡물과 한 묶음이다
//   · 특산 어패(연어·새우·게·굴·미역) → `fish` · 산포도 → `fruit` · 견과·도토리 → `forage`
//     (전부 `FORAGE_FOOD_FACTOR` 가 이미 열량을 매겨 둔 품목이다 — 새 수 0)
const T86_GROUP = Object.assign({}, FOOD_GROUP, {
  wheat: 'grain', rice: 'grain', barley: 'grain', millet: 'grain', cooked_food: 'grain',
  salmon: 'fish', shrimp: 'fish', crab: 'fish', oyster: 'fish', seaweed: 'fish',
  grape: 'fruit', chestnut: 'forage', walnut: 'forage', acorn: 'forage',
});
// ★군별 몫 w_g — **새 수를 짓지 않는다.** `server/specialty.js` 의 `contributes.subsistence` 를
//   군별로 평균 내어 정규화한 값이다(§0-ⓑ 표). 후보 셋을 시드 1020 으로 걸러 이것이 채택됐다.
//     grain  밀1·쌀1·보리0.9·기장0.9 → 0.950      meat   훈제육0.8            → 0.800
//     fish   연어0.9·새우0.4·게0.5·굴0.3·미역0.4·건어물0.8 → 0.550
//     veg    절임0.5 → 0.500   fruit  말린과실0.4 → 0.400   forage 버섯0.3 → 0.300
//   ⚠표본 수가 군마다 1~6개로 고르지 않다(meat 는 훈제육 하나다) — 그 한계는 보고 §1 에 적었다.
//   ⚠`T86_WMODE` 는 **후보 스크린용 손잡이**다(지시 §2-① — 후보 셋을 시드 1020 으로 거른다).
//     기본은 유도값(i). ii=균등 1/6 · iii=캐논 유도(`DIVERSITY_FULL`=4 ⇒ 상위 4군에 1/4씩).
//   ★채택 = **ii(균등 1/6)**. 시드 1020 만 보면 유도값(i)이 1등이었는데(+0.7%) **시드 42 에서 소멸 2/51**
//     을 냈다. 셋 중 **세 시드 모두 소멸 0/51 을 지키는 유일한 후보**가 ii 다(보고 §2-d).
const T86_WMODE = process.env.T86_WMODE || 'ii';
const T86_W = (() => {
  if (T86_WMODE === 'ii') { const e = 1 / 6; return { grain: e, meat: e, fish: e, veg: e, fruit: e, forage: e }; }
  if (T86_WMODE === 'iii') { const q = 1 / DIVERSITY_FULL; return { grain: q, meat: q, fish: q, veg: q, fruit: 0, forage: 0 }; }
  return { grain: 0.2714, meat: 0.2286, fish: 0.1571, veg: 0.1429, fruit: 0.1143, forage: 0.0857 };
})();
// ★★[T86 · 재민 판정 2026-09-04] **부패 항은 안 넣는다 — 방향은 맞는데 크기가 없다.**
//   지시 초안은 유효가격 = 그림자가격 × (1 − `DECAY_RATES`) 였다. 방향은 옳다(썩는 게 싸져 먼저 먹힌다).
//   그런데 실측하니 `DECAY_RATES` 는 여섯 품목뿐이고(생곡·보존식·특산은 **0**) 값이 0.003~0.008 이라
//   그 곱은 가격을 **최대 0.8%** 움직인다 — 군 안 정렬 순서를 **한 번도 안 바꾼다**(§0-ⓒ 표).
//   ⇒ 재민 판정: **새 항 0 이 낫다.** 안 쓰는 항을 식에 남기면 다음 사람이 그게 작동한다고 읽는다.
//   ⇒ 유효가격 = **그림자가격 ÷ 열량환산** 하나뿐이다. `DECAY_RATES` 는 원래 자리(부패 틱)에 그대로 있다.
// ★보존식은 **예산에 안 들어간다** — 사다리 맨 뒤 규약(T17 ②) 그대로다.
//   §0-ⓒ 실측이 그 예외를 요구했다: 재고를 채우고 재면 보존식 **열량 단위당 가격이 신선식보다 싸다**
//   (말린과실 0.283 · 절임 0.353 · 건어물 0.461  대  과일 0.499 · 조리식 0.710 · 연어 1.794).
//   ⇒ 예산에 넣으면 **말려 두는 게 이득**이 되어 신선식 시장이 죽는다. 그래서 뺐다.
const T86_DIET = process.env.T86_DIET !== '0';   // 되돌림: T86_DIET=0 → T73 사다리 비트 재현

// 이 품목 1단위가 내는 열량(= food 단위). 전부 이 파일의 기존 표에서 읽는다 — 사본 0.
function _t86Factor(r) {
  if (T635_SEA_SPECIES && _t635Sea[r] != null) return _t635Sea[r];   // ★[T635 ②] 나눠 낸 종 = 그 kg 만큼의 fish
  if (r === 'cooked_food') return 1.12;
  if (r === 'food' || r === 'fish' || r === 'meat') return 1;
  if (RAW_GRAINS.indexOf(r) >= 0) return _rawGrainF(r);   // ★[T1243 추신 1] 켬 = 열량 정본 × 상태 몫 · 끔 = 0.72
  return FORAGE_FOOD_FACTOR[r] || 0;
}
// ★[T635 ②] 식단 후보 열쇠 — 종전 표 + 나눠 낸 종(이미 표에 있는 종은 한 번만)
// ★[T635 ②] 어부 산출을 그 마을 해안 종 비로 나눠 낸다 — 종 kg = fish kg × 비 · 낱개 = 종 kg ÷ 그 종 무게(`weights.kgOf` — specialty 무게 정본)
function _t635SeaProduce(addProduce, mix, amt) {
  const W = _weightsMod(); const kf = (W && W.kgOf('fish')) || 1;
  for (const id of Object.keys(mix)) {
    const sh = mix[id]; if (!(sh > 0)) continue;
    const ki = (W && W.kgOf(id)) || kf;
    if (_t635Sea[id] == null) _t635Sea[id] = ki / kf;   // 1낱 = fish 몇 단위(식단 열량 — 같은 kg)
    addProduce(id, amt * sh * kf / ki);
  }
}
// ★[T635 ①] 품목이 있을 때만(`T574_NEW_ITEMS=1`) — 없으면 손잡이를 켜도 아무 칸도 안 선다
let _t635Shell;
function _t635ShellItem() {
  if (_t635Shell === undefined) { const SP = _getSpecialty(); _t635Shell = !!(SP && SP.shell_bangle); }
  return _t635Shell;
}
let _t635InitDone = false;
function _t635Init() {   // 옥의 쓰임 칸을 그 수 그대로 조개 팔찌감에(값만 품목표 값) — 첫 마을을 세울 때 한 번
  if (_t635InitDone) return; _t635InitDone = true;
  if (!T635_SHELL_ORNAMENT || !_t635ShellItem()) return;
  const SP = _getSpecialty();
  RESERVE_PC.shell_bangle = RESERVE_PC.jade; LUX_V1.shell_bangle = LUX_V1.jade; SAT_ALWAYS.shell_bangle = SAT_ALWAYS.jade; RITE_PC.shell_bangle = RITE_PC.jade;
  BASE_VALUE.shell_bangle = SP.shell_bangle.baseValue;
}
function _t635DietIds() { const ks = Object.keys(T86_GROUP); for (const r in _t635Sea) if (!(r in T86_GROUP)) ks.push(r); return ks; }

// ═════════════════════════════════════════════════════════════════════════════
// ★★[T100 · ECON 수술 2-b] **밭이 곳간에 닿는다.** — 4판(2026-09-07 · 재민 판정)이 정본이다.
//
//   여태 농부 산출은 밭과 무관했다: `JOBS.farmer.landBoost = v.land.fertility` → 1인 하루 `1.5 × 지력`.
//   3판은 그 자리에 **모델식**(`밭칸 × 0.0806 × 지력`)을 꽂았다. T117 자(실제 밭을 도는 계측기)로
//   재 보니 **실제 수확은 그 추상 산출의 0.22~0.26** 이었다 — 지도가 1셀=1m 캐논이라 칸이 모자란
//   것이지 식이 틀린 게 아니다. 재민 판정(넷째 길): 모델식은 **버리고**(사본·이중산입의 씨앗)
//   손잡이 둘로 간다.
//     ① 경작지 ×1.5 — `server/village-layout.js LAND_NEED 8 → 12`(정본 하나 · T138 이 모양 보증)
//     ② 칸당 산출 — **부양 인원 앵커 `N` 에서 유도**. 곳간에 드는 것은 **실제 수확 × k** 다.
//
//   ⓐ 새 수는 **`N` 하나**다 — 농부 한 사람의 밭이 한 해에 먹이는 사람 수.
//      출처: Gregory Clark, *UC Davis Econ 210A · Chapter 4 "The Malthusian Economy"* —
//        산업화 전 농업사회에서 "**70–80% of the population labored upon the land**".
//      ⇒ N = 1 ÷ 0.80 = **1.25**  ~  1 ÷ 0.70 = **1.43**,  중앙 1 ÷ 0.75 = **1.33**.
//      (지시가 준 세 점 1.2 · 1.35 · 1.5 는 보고 §0-ⓑ 표에 같이 적었다 — 채택은 **출처의 중앙값**.)
const T100_ANCHOR_N = 1.33;
//   ⓑ 실측 — **T117 자**(`scripts/farm-metrics.js` · 실지도 51마을 · 시드 1020 · 800일 · 경작지 12칸 팔).
//      농부 1인이 한 해에 실제로 치른 **수확 건수**: `Σ harvestN ÷ (Σ fDays ÷ 365)`.
//      유도의 **분모**이지 손잡이가 아니다(고치면 세계가 아니라 자가 바뀐다).
//      재측정: `LAB_SEEDCACHE=/tmp/s.json FARM_JSON=/tmp/x.json node scripts/farm-metrics.js 800 1020`
//        측정판(2026-09-07 · 시드 1020 · 800일 · 51마을 · 씨앗캐시도 12칸으로 새로 구움):
//          Σ harvestN 190,602 ÷ (Σ fDays 765,497 ÷ 365) = 90.88건/농부·해
//          (같은 판 참고: 밭 칸 5,050 → 54,053 · 식량등가 200,745 · 농부 1인 실측 부양 0.262인)
const T100_HARVEST_PER_FARMER_YEAR = 90.88;
//   ⓒ 유도 — **`k` 는 새 수가 아니다.** 아래 한 줄이 유도식이고, 하네스가 같은 식을 다시 계산해 대조한다.
//        k = N × (하루 1인 식량 `DAILY_FOOD_CONSUMPTION` × 365) ÷ 농부 1인 연간 수확 건수
//      뜻: 수확 한 번이 곳간에 넣는 식량등가. `k` 를 손으로 적으면 하네스가 빨개진다.
const T100_K = T100_ANCHOR_N * DAILY_FOOD_CONSUMPTION * 365 / T100_HARVEST_PER_FARMER_YEAR;
// ★★★[T1243 2026-11-09 · ★재민 11-09 "정본 안 켜?" · 족보 796 · 797] **밭 세계 한 손잡이** — `T1243_FARM_ON`(끔 기본 · `=1` 켬 · 그 밖 값 = 끔).
//   켜면 밭 묶음 다섯(`T100_FIELD_YIELD` · `T368_FARM_ACT` · `T1201_BRONZE_CROPS` · `T1215_FIELD_M2` · `T1221_FARM_LABOR`)이 켜진다(각 손잡이의 `=1` 과 같은 갈래 · 새 갈래 0) +
//   ⓑ 한 번 거둔 식량 = 작물 낱개 값 하나 — 텃밭 하한(`T100_K` 를 쓰는 산출 갈래)을 걷고 품목 없는 수확 갈래(`n × T100_K`)를 닫는다(사본 0) ·
//   ⓒ NPC 마을 첫 곳간 = 지난해 곡식(생활층 `villages.js` `_t1243Seed`) · 797 밭 일괄 걷음(생활층 `_lifeHeadlessDay`). 끔 = 오늘 바이트.
const T1243_FARM_ON = (typeof process !== 'undefined' && process.env) ? process.env.T1243_FARM_ON === '1' : false;
// ★★[T1260 2026-11-10 · T1255 §0 회부] 손잡이 `T1260_FOOD_READS`(끔 기본 · `'1'` 만 켬 · 끔 = 종전 바이트) — **식량을 한 품목(`storage.food`)만 읽는 문**.
//   밭 세계(`T1243_FARM_ON`)에선 곡식이 벼 · 조 같은 품목으로 들어와 `food` 칸이 0 가까이다 — 그 칸 하나로 "식량이 있나"를 묻는 문은 늘 "없다"를 본다.
//   켜면 그 문들이 곳간 식량 합계 정본(`totalFoodEquivalent` — 밭 세계 = `storageFoodEquivalent` · T1246)을 읽는다(새 사본 0 · 새 수 0):
//     ① 요리 8일 문(`cookTarget`) · ② 개간 중단 120일 문(`server/villages.js _lifeNeedClear`) · ③ 곳간 증설 목표(`_lifeGranAdd`) ·
//     ④ 요리사가 재료로 뗄 한 단(`produceSpecial === 'cook'` — `food` 칸이 비면 가장 많이 쌓인 곡식 품목에서 하루치 1 을 · 정본 환산 `storageFoodPer`) ·
//     ⑤ 밭 세계에서만 합계를 읽던 넷(`npcRegenMul` · 요리 후보 `foodRich` · v2 다양성 둘)이 밭 끔 세계에서도 합계를 읽는다 ·
//     ⑥ 전쟁 층의 식량 추정(`sim/war-core.js warFE` 다섯 품목 근사 — 정찰 · 몸값 · 조공 거부 · 출정)이 주입된 정본(`_feOf`)을 읽는다.
const T1260_FOOD_READS = (typeof process !== 'undefined' && process.env) ? process.env.T1260_FOOD_READS === '1' : false;
function t1260FoodOf(v) { return T1260_FOOD_READS ? totalFoodEquivalent(v) : ((v && v.storage && v.storage.food) || 0); }
// ★★[T1279 2026-11-12 · T1272 회부] 손잡이 `T1279_COOK`(끔 기본 · `'1'` 만 켬 · **`T1260_FOOD_READS` 켠 판 안에서만** 산다 · 끔 = 종전 바이트) — **요리는 식량을 늘리지 않는다.**
//   T1260 문 ① 이 요리사를 세우자 밭 세계 인구가 짝 Δ 가운데 −12.5% 였다(T1272). 갈라 재기(T1279 §1): 요리사가 서는 일 자체가 손해의 전부(ⓐ · ⓒ 몫 100%)이고,
//   요리사의 일손은 그 몫에 못 미친다(세계 하루 요리사 ≈ 10 사람 · 줄어든 농부 날의 1/8). 손해가 닿는 길은 **식량 흐름 장부**(`surplusEMA.food` — 생산 − 하루 수요)다:
//   조리식은 `addProduce` 로 그날 생산 칸에 **새 식량**처럼 들어가는데, 조리식을 만든 곡식 · 부재료는 이미 거둘 때 생산으로 셌거나(채집 · 어로 · 사냥) 밭 세계에선 장부에 안 들어온 것이다.
//   ⇒ 장부가 "남는다"를 읽고 식량 값의 선반영(`surplusEMA.food × 30`)이 줄어 값이 내리고 농부가 덜 선다.
//   켜면 장부의 그날 생산에서 조리식 칸만 뺀다 — **요리는 곳간 안의 옮김이다**(T17 ② 갈무리 주석과 같은 규약 · 새 수 0 · 새 사본 0 · 같은 환산 함수).
//   ⚠장부 자리만으로는 모자랐다(열 시드 짝 Δ 가운데 −12.5% → −10.0% · T1279 §3). 요리 안을 가른 팔(T1279 §3-ⓑ): 요리사가 **아무것도 안 떼고 안 내도**(일손만)
//     손해가 그대로(−11.4% · 9/10 내림)이고, 요리사가 한 번도 안 선 마을도 선 마을만큼 준다(−13.5% 대 −13.1%) — 손해는 조리식이 아니라 **정원 요리사가 서는 것**에서 온다.
//   ⇒ ② 켜면 정원 요리사를 세우지 않는다(`cookTarget` = 0): 정원 한 자리는 온 하루 일손 한 사람인데 그 하루가 내는 것은 조리식 1.5 끼(`JOBS.cook.base`)다 —
//     부엌 일이 실제로 드는 시간(남의 끼니까지 몇 끼를 한 번에 짓는 반나절)과 맞지 않는다. 밭 켬 전(T1260 끔)에도 밭 세계 요리사는 0 이었다(T1272 F1 요리사 날 0).
//     이미 선 요리사는 정원 초과(`case 'cook'` 0.005)로 먼저 차출된다 · 정원 밖 길(빈자리 줄 · legacy 줄)은 그대로(그 길에 선 요리사의 조리식은 ① 장부 규약을 탄다).
//   ⚠곳간 · 조리식 · 다양성 · 부양력(prodK 잠재 생산)은 그대로다(부양력 쪽 · 남는 시간 요리는 회부).
const T1279_COOK = T1260_FOOD_READS && ((typeof process !== 'undefined' && process.env) ? process.env.T1279_COOK === '1' : false);
//   ④ 요리 재료 한 단 — `food` 칸이 1 밑일 때(켬만) 곡식 품목(생곡 `RAW_GRAINS` · 밭 작물 `_t368Crops`) 중 하루치 환산이 가장 큰 것 · 하루치 1 이 안 되면 없음
function _t1260CookStaple(v) {
  const cand = RAW_GRAINS.slice(), own = _t368Crops(v);
  if (own) for (const [r] of own) if (cand.indexOf(r) < 0) cand.push(r);
  let best = null, bq = 0;
  for (const r of cand) { const f = storageFoodPer(v, r), q = ((v.storage && v.storage[r]) || 0) * f; if (f > 0 && q > bq) { bq = q; best = [r, f]; } }
  return best && bq >= 1 ? best : null;
}
const T100_FIELD_YIELD = process.env.T100_FIELD_YIELD === '1' || T1243_FARM_ON;   // 되돌림: 끄면 T86 세계 **비트 동일**   // ★[T1243] 묶음
// ★★★[T312 2026-09-19] **어부 행위 이식 — T1180 켬 기본.** 끄면 이 파일은 **넷째 판과 비트 동일**이다
//   (아래 세 자리가 전부 이 상수 뒤에 있다: 곳간 입구 · `addProduce('fish')` 게이트 · 장부 다리).
//   T1180: 켬 기본으로 전환 · 기존 수식의 계수는 바꾸지 않는다.
const T312_FISH_ACT = process.env.T312_FISH_ACT === '1';   // T1180 켬 기본 후보 → ★PM land1048 끔 기본(켬 판 서버 3시드 400날 인구 0 · 빈 마을 51 — T1180 보고 첫 줄 · 켤 날 T1202)
// ★★★[T325 2026-09-19] **나무꾼 행위 이식 — T1180 켬 기본.** 끄면 이 파일은 **넷째 판과 비트 동일**이다
//   (아래 네 자리가 전부 이 상수 뒤에 있다: 곳간 입구 · `addProduce('wood')` 게이트 · 배율 자리 · 장부 다리).
//   ⚠어부(T312)와 **같은 문법**이다 — 새 규약 0. 다른 것은 품목 하나와 분모 하나뿐이다.
//   T1180: 켬 기본으로 전환 · 기존 수식의 계수는 바꾸지 않는다.
const T325_WOOD_ACT = process.env.T325_WOOD_ACT === '1';   // ★PM land1048 끔 기본(T312 줄 · 켤 날 T1202)
// ★★★[T347 2026-09-22] **채집 행위 이식 — T1180 켬 기본.** 끄면 이 파일은 **넷째 판과 비트 동일**이다
//   (아래 네 자리가 전부 이 상수 뒤에 있다: 곳간 입구 · 채집 믹스 게이트 · 관측 칸 · 장부 다리).
//   ⚠나무꾼(T325·T341)과 **같은 문법**이다 — 새 규약 0. 다른 것은 **품목이 여럿**이라는 점 하나뿐이다.
//   ★★그 "여럿" 이 이 카드의 어려움이다: 군락 개체가 내는 품목과 채집 수식이 내는 품목이 **다르다**
//     (`lootOfResource`: 덤불 → `berry 2 · fiber 1 · twig 1` + 야생 씨앗 · 풀 → `herb 2`.
//      수식: `fruit·vegetable·mushroom·twig·pebble·chestnut·walnut·honey·herb·grape` + `stone` 가산).
//     ⇒ **걷는 것은 실체가 실제로 대는 품목뿐이다**(재민 09-22 결정 A) — T135 가 나무에서 세운 그 규약
//       그대로다(*"대체는 성능이 아니라 안전 조건이다"* · 얹지 않는다 · 없는 실체를 지어내지 않는다).
//     ⇒ 그 목록은 이 파일이 **안 짓는다** — `world.forageActItems` 가 준다(주입 · `forageRealItems` 선례).
//       주입이 없으면 켜도 게이트가 안 열린다(폴백이 곧 종전 = 비트 동일).
//   T1180: 켬 기본으로 전환 · 기존 수식의 계수는 바꾸지 않는다.
const T347_FORAGE_ACT = process.env.T347_FORAGE_ACT === '1';   // ★PM land1048 끔 기본(T312 줄 · 켤 날 T1202)
// T1180: 실제 생산 호스트는 현장이 아직 없거나 비어도 수식으로 메우지 않는다.
// 헤드리스 랩은 이 문을 등록하지 않으므로 기존 경제 자를 그대로 쓴다.
const _productionActHosts = new WeakSet();
function bindProductionActs(world) { if (world && typeof world === 'object') _productionActHosts.add(world); }
function productionActsBound(v) { return !!(v && v._world && _productionActHosts.has(v._world)); }
// ★★[T1195 2026-11-06 · 추상 걷기 A · ★재민 11-05 "추상 다 없애자고 했는데 왜 아직도 남겨둔 거야"] **사냥 고기 = 몸이 잡은 마리 × kg.**
//   종전: 사냥꾼 산출 = 공식 `0.7 × land.game × 숙련 × 도구`(+ 부산물 비율) — 개체 장부(T146)가 빼는 마리 · 보이는 몸 사냥(T158)과 따로 놀았다.
//   켬: 실제 호스트(위 `bindProductionActs`)에서 사냥꾼의 수식 산출(고기 · 부산물 다)을 닫고(아래 `productionFormulaOff` 한 항),
//     몸이 잡은 짐승만 `huntToGranary` 로 들어온다(T1180 어부 · 나무꾼 · 채집꾼과 같은 문법 · 같은 몸통 `actToGranary`).
//     마리 → 고기 · 가죽 · 뿔 · 뼈는 서버가 정본(`animals.dropsOf` · `weights` · `kcal`)에서 바꾼다 — 이 파일은 수를 안 짓는다.
//   ★수요 문(T374 · 같은 꼴): 그날 몫 D = 수식이 내던 마을 몫(`_huntOutLast` — 어부 `_fishOutLast` 와 같은 항들).
//     짐승은 낱개로 나뉘지 않으므로 **온전한 마리**를 받는다 — 남은 수요가 있으면 한 마리를 다 받고(넘친 몫은 다음 날들의 몫을 미리 쓴 것 · 음수로 이월),
//     남은 수요가 없으면 뷰 밖 몫은 안 받는다(장부에 되돌린다 — 몸이 그날 더 잡지 않은 것). 이월은 미리 쓴 몫(음수)만 · 못 채운 날 몫은 그날로 끝(T374 "그날 수요").
//   헤드리스 랩은 호스트를 등록하지 않으므로 종전 수식 그대로다(랩 동일 = 격리 증명 · 몸 사냥의 증명이 아님).
//   손잡이 `T1195_HUNT_REAL` — 켬 기본 · 되돌림 `=0`(끔 = 한 글자도 안 바뀐 종전 · 기준선 11-04c 같음).
const T1195_HUNT_REAL = (typeof process !== 'undefined' && process.env && process.env.T1195_HUNT_REAL === '1'); // ★[PM land1049] 끔 기본(`=1` 켬) — 켬 판 서버 1020 400날 인구 3,617 → 1,848 · 빈 마을 1 → 15(사냥 · 식사 몸 같이 · 가상 시계) · 켤 날 T1209
function productionFormulaOff(v, job) {
  return !!(v && v._world && _productionActHosts.has(v._world) &&
    ((job === 'miner' && T1188_ORE_SPLIT) || (job === 'fisher' && T312_FISH_ACT) || (job === 'lumberjack' && T325_WOOD_ACT) || (job === 'forager' && T347_FORAGE_ACT) || (job === 'hunter' && T1195_HUNT_REAL)));
}
function huntActOn(v) { return !!(T1195_HUNT_REAL && productionActsBound(v)); }
// [T1195] 남은 그날 수요(econ 고기 단위 · 음수 = 미리 쓴 몫). 켬이 아니면 Infinity(문이 없다).
function huntDemandLeft(v) { if (!T374_DEMAND_STOP || !huntActOn(v)) return Infinity; return (typeof v._t1195Bal === 'number' ? v._t1195Bal : 0); }
// [T1195] 사냥꾼의 곳간 입구 — 몸통은 어부 · 나무꾼과 같은 `actToGranary`(세금 · 곳간 · 국고 순서 그대로).
//   `meat` 이면 그날 수요에서 뺀다(넘치면 음수로 남는다 = 미리 쓴 몫). 들어온 품목은 오늘치(`_t1195InByItem`)로 남겨 틱이 실현 장부에 한 번 적는다.
function huntToGranary(v, item, units) {
  if (!huntActOn(v) || !v.storage || !item) return 0;
  const g = actToGranary(v, item, units, null, null);
  if (!(g > 0)) return 0;
  const by = v._t1195InByItem || (v._t1195InByItem = {});
  by[item] = (by[item] || 0) + g;
  if (item === 'meat') v._t1195Bal = (typeof v._t1195Bal === 'number' ? v._t1195Bal : 0) - g;
  return g;
}
// ★★★[T724 2026-10-13] **채굴 행위 이식 — 기본 끔.** 끄면 이 파일은 **오늘 main 과 비트 동일**이다
//   (아래 네 자리가 전부 이 상수 뒤에 있다: 곳간 입구 `mineToGranary` · `addProduce('ore')` 게이트 · 수요 칸 `_oreOutLast` · 장부 다리).
//   ⚠나무꾼(T325)과 **같은 문법**이다 — 새 규약 0. 다른 것 둘:
//     ⓐ 게이트가 "셀이 있나" 가 아니라 **그날 몸이 쳤나**(`_t724Walk` — 생활층이 econ 틱 바로 앞 `_lifeHandsIn` 에서 심는다).
//        몸이 안 친 마을(헤드리스 · 관측자 없는 마을)은 **종전 일괄 그대로**다(수식 원석 + `_oreMineDaily` 셀 깎기 — 카드 ③).
//     ⓑ 몸이 캔 kg 를 econ 단위로 바꾸는 것은 부르는 쪽(`server/villages.js`)이다 — `weights.kgOf('ore')` 정본(5.00 · 옮겨 적지 않는다).
//   켜기는 재민 — 이 카드는 값을 안 정한다.
const T724_MINE_ACT = (typeof process !== 'undefined' && process.env && process.env.T724_MINE_ACT !== '0');   // ★[PM 10-14] 켬 기본(몸이 치는 판에서만 갈림 · 헤드리스 바이트 같음) · 되돌림 `=0`
// [T1159] 끔 기본 · 원정의 실제 몸 위치로 집의 성장·침상·곳간 N을 센다.
const T1159_HOME_N = typeof process !== 'undefined' && !!process.env && process.env.T1159_HOME_N === '1';
function t1159HomeN(v) {
  const N = v.npcs.length;
  if (!T1159_HOME_N || !v._world || typeof v._world.homePopulation !== 'function') return N;
  const home = v._world.homePopulation(v);
  return Number.isFinite(home) ? Math.max(0, Math.min(N, Math.floor(home))) : N;
}
const T815_DRAFT_FAMINE = !(typeof process !== 'undefined' && process.env && process.env.T815_DRAFT_FAMINE === '0');   // ★[T1183] 켬 기본(되돌림 `=0`) — 켜면 기근 죽음은 **죽일 몸을 고른 뒤에** 센다(전부 징발 중이면 `break` 앞에서 안 센다). 끔 = 종전 바이트
// ★★[T924 2026-10-25 · 재민 10-24 "창고에 식량이 쌓여 있을 텐데 자유민이 그렇게 빨리 죽어..?" · PM: (나) 가드로 덮지 않는다]
//   **몸이 없는 날엔 죽음 빚을 넘기지 않는다** — 손잡이 `T924_DEBT_CAP`(★[T935] 켬 기본 · 되돌림 `=0` = 종전 바이트).
//   기근 사망 고리(아래 인구 갱신 6)는 남은 사람이 다 징발 중이면(`oldestIdx < 0`) 멈추는데 누적 압력 `_dPAccum` 은 그대로 남아
//   날마다 더 쌓인다(그날 dP — 상한 N × POP_MAX_DELTA_PCT · N 에 징발자가 든다). 징발이 풀린 날 고리가 그 빚을 **곳간과 무관하게 한꺼번에** 치른다
//   (T815 §2 시드 42 농촌21: 555일 곳간 1,395 · 빚 −231 → 34명). 랩 두 판(`마을실험실` · `전쟁실험실`)은 이 고리가 같은 글자인데
//   econ 주민에 징발 표식을 붙이지 않아(동원 = `_warMobFrac → _laborMul`) 이 갈래에 닿지 않는다 — 빚은 그날그날 치러져 −1 아래로 안 남는다.
//   켜면 그 갈래에서 출생 쪽 거울(자리가 없으면 `Math.min(_dPAccum, 0.9)`)처럼 `Math.max(_dPAccum, −0.9)` — 못 치른 몫을 다음 날로 넘기지 않는다
//   (새 수 0 — 0.9 는 출생 줄의 그 수 · 셈만 느는 죽음은 `T815_DRAFT_FAMINE` 몫 — 이 손잡이가 켜지면 빚이 −1 아래에 쌓여 있지 않아 그날 압력이 −1 을 넘긴 날만 센다).
const T924_DEBT_CAP = !(typeof process !== 'undefined' && process.env && process.env.T924_DEBT_CAP === '0');   // ★[T960 · T935 · PM 10-26 · T924 회부 1] 켬 기본 · 되돌림 `=0`
// ★★[T1074 2026-11-02 · ★재민 11-02] **굶주림 = 사람마다 식량 빚 · 적응 · 14일** — 손잡이 `T1074_FOOD_DEBT`(★[T1127] **켬 기본** · `=0` 만 끔 = 종전 바이트 · T1074 착지 땐 끔 기본이었다).
//   재민 11-02: "14일로 하고, 그 이후에도 적자가 지속되면 매일 한 명씩 죽도록 · 식량 1이 생겼다고 타이머가 리셋되면 어색하니
//   굶은 만큼 '식량 빚'을 · 채운 만큼 메워지게" · 고증(미네소타 기아 실험 · Dulloo 재분석) → 갚기는 열량 1:1 · 덤은 적응에서.
//   칸(econ NPC 항목 · plain number · 저장 줄이 그대로 싣는다) — 켠 판에서만 선다(끔 = 칸 없음):
//     `npc._fd`  식량 빚(하루치 열량 단위 · `DAILY_FOOD_CONSUMPTION` = `DAY_KCAL` 하나가 1)
//     `npc._fdA` 적응(하루 필요량에서 덜어 낸 몫 · 0 ~ `FD_ADAPT_MAX`) — 그날 필요량 = 1 × (1 − _fdA)
//     `npc._fdS` 그날 모자란 몫(죽음 조건 "그날도 적자" · 하루 머리에 다시 씀)
//   읽는 함수 하나(T1075 행복 평형이 읽는다 · 사본 0): `foodDebtOf(v)` → { n, mean, max, starving }
//   수(출처는 보고 `보고/T1074_2026-11-02.md` §2):
//     · FD_ADAPT_MAX 0.40 — Keys 1950(미네소타 · 24주 반기아 · 기초대사 1인 평균 −40%) · 카드 "최대 −40%"
//     · FD_ADAPT_DOWN_DAYS 168 — 그 −40% 에 닿은 기간(반기아 24주) · 빚이 있는 날마다 0.40/168 씩 내린다(곧은 꼴 · 앞이 더 가파르다는 갈래는 회부)
//     · FD_ADAPT_UP_DAYS 140 — 재활 R20(20주)에 기초대사가 대조값으로 돌아왔다(R12 에 35~70% · 곧은 꼴이면 R12 = 60% 로 그 안) · 빚이 0 인 날마다 0.40/140 씩 올린다
//     · FD_DEATH_DAYS 14 — 카드(★재민) · 빚 > 14 **이고** 그날도 적자인 사람 가운데 가장 늙은 1명/일
//   갚기 하루 상한은 출처 수를 못 찾아 두지 않았다(그날 남은 식량이 갚을 수 있는 만큼 · 회부) — 빚은 곳간이 빈 날에만 생기므로 갚는 몫은 그 뒤 들어온 식량이다.
// ★★[T1127 2026-11-04 · ★재민 11-03 문 1-b ⓐ "식량 빚 켜고 + 보호막 걷기"] **켬 기본** — `=0` 만 끔(= 종전 바이트 · T1074 착지 판) · 미설정 · 빈 값 · 그 밖 = 켬 · 브라우저 shim 빈 env = 켬.
const T1074_FOOD_DEBT = !(typeof process !== 'undefined' && process.env && process.env.T1074_FOOD_DEBT === '0');
// ★★[T1117 2026-11-03 · T1106 고증 `설계/고증_굶주림.md`] 고증 상수 — 손잡이 `T1117_FD_EVID`(켬 기본 · `=0` = T1074 상수 그대로 = T1074 착지 바이트 · T1074 끔이면 아무도 안 읽는다).
//     · FD_ADAPT_MAX 0.155 — Keys 1950 pp. 328–329(Troscianko 2016 인용): 24주 BMR −40%(사람당) 가운데 **활성 조직 단위당 −15.5%** — 몸 크기로 설명 안 되는 적응 몫.
//       게임 몸은 굶어도 작아지지 않는다(몸무게 칸 없음 · 일관된 몸) ⇒ 작아진 몸의 몫(−40% 의 나머지)은 짝이 없다 · 적응 몫만 싣는다(가정 — 보고 T1117 §1).
//       (같은 몫 다른 인용: Weyer 외 2000 AJCN 72:946 서론 −16% · 대사 활성 조직 kg 당)
//     · FD_ADAPT_DOWN_DAYS 168 · FD_ADAPT_UP_DAYS 140 — T1074 수 그대로(반기아 24주 · 재활 R20 — T1106 ①-1 · ①-2 와 같은 출처 수 · 바꿀 출처 수 없음)
//     · FD_REPAY_KCAL 1,600 — 회복기 하루 갚기 상한(사람마다): 미네소타 제한 재활 네 무리 중 가장 큰 덤 +1,600 kcal(Keys 1950 — Troscianko 2016 인용 · T1106 ①-5)
//       ÷ `DAY_KCAL` 2,450(하루치 1 · 위 576 줄 주석) = 하루치 약 0.653. 자유 재급식 섭취는 확인 못 해(T1106 회부 2) 더 큰 상한은 안 둔다.
const T1117_FD_EVID = !(typeof process !== 'undefined' && process.env && process.env.T1117_FD_EVID === '0');
const FD_DAY_KCAL = 2450, FD_REPAY_KCAL = 1600;   // ★[T1117] 출처 수(위 줄) — 하루치 열량(`DAY_KCAL` 정본 값 · 576 줄) · 재활 덤
const FD_ADAPT_MAX = T1117_FD_EVID ? 0.155 : 0.40, FD_ADAPT_DOWN_DAYS = 24 * 7, FD_ADAPT_UP_DAYS = 20 * 7, FD_DEATH_DAYS = 14;
const FD_REPAY_MAX = T1117_FD_EVID ? DAILY_FOOD_CONSUMPTION * FD_REPAY_KCAL / FD_DAY_KCAL : Infinity;   // 사람마다 하루 갚기 상한(하루치 단위 · 끔 = 상한 없음 = T1074)
// 그날 먹을 사람(원정 중 제 짐을 먹는 병사는 빠진다 — `_t423EatN` 과 같은 잣대 · 그들의 빚은 제 짐이 정한다)
function _fdEaters(v) { return v.npcs.filter((p) => !(p._warPack && p._warDraft)); }
// 하루 몫 — 그날 필요량(적응만큼 덜) · 갚을 빚 합
function _fdNeed(eaters) {
  let need = 0, debt = 0;
  for (const p of eaters) { need += DAILY_FOOD_CONSUMPTION * (1 - (p._fdA || 0)); debt += Math.min(p._fd || 0, FD_REPAY_MAX); }   // ★[T1117] 오늘 갚을 몫 = 사람마다 상한까지(끔 = Infinity = 빚 전부 = T1074)
  return { need, debt };
}
// 먹은 몫을 나눈다 — 하루 몫 먼저(모자라면 모두 같은 비율로 · 부분 식사는 부분만 빚) · 남은 것만 빚을 갚는다(열량 1:1 · 빚 비례) · 적응을 한 걸음
function _fdSettle(eaters, need, debt, eaten) {
  const ration = Math.min(eaten, need), spare = Math.max(0, eaten - need);
  const shortFrac = need > 0 ? Math.max(0, (need - ration) / need) : 0;
  const payFrac = debt > 0 ? Math.min(1, spare / debt) : 0;
  for (const p of eaters) {
    const n = DAILY_FOOD_CONSUMPTION * (1 - (p._fdA || 0));
    const short = n * shortFrac;
    let d = (p._fd || 0);
    d = d - Math.min(d, FD_REPAY_MAX) * payFrac + short;   // ★[T1117] 갚는 몫 = 오늘 갚을 몫(상한까지) × 남은 식량 비율(끔 = d × payFrac = T1074)
    p._fd = d > 1e-9 ? d : 0;
    p._fdS = short;
    p._fdA = p._fd > 0 ? Math.min(FD_ADAPT_MAX, (p._fdA || 0) + FD_ADAPT_MAX / FD_ADAPT_DOWN_DAYS)
                       : Math.max(0, (p._fdA || 0) - FD_ADAPT_MAX / FD_ADAPT_UP_DAYS);
  }
  return { shortTotal: need - ration, paid: Math.min(spare, debt) };
}
// 빚 > 14 이고 그날도 적자인 사람 가운데 가장 늙은 사람(징발 중 제외 — 원정 나간 사람의 죽음은 전쟁 정산이 소유한다 · T295 ①) · 없으면 −1
function _fdDeathIdx(v) {
  let k = -1;
  for (let i = 0; i < v.npcs.length; i++) {
    const p = v.npcs[i];
    if (p._warDraft || !((p._fd || 0) > FD_DEATH_DAYS) || !((p._fdS || 0) > 0)) continue;
    if (k < 0 || p.age > v.npcs[k].age) k = i;
  }
  return k;
}
// ★읽는 함수 하나(T1075 · 진단 · UI) — 마을 사람들의 빚(징발 중 포함 · 제 짐 빚도 그 사람 칸이다)
function foodDebtOf(v) {
  const a = (v && v.npcs) || []; let sum = 0, max = 0, starving = 0;
  const M = _t1197();   // ★[T1197] 켬 = 굶는 사람 = 허기가 극단(3단계 문턱 아래)인 사람(빚 > 14 대신 — 몸 정본이 죽음을 정한다) · 끔 = null = 종전 줄
  for (const p of a) { const d = p._fd || 0; sum += d; if (d > max) max = d; if (M ? (p._mh != null && p._mh < M.AT) : d > FD_DEATH_DAYS) starving++; }
  return { n: a.length, mean: a.length ? sum / a.length : 0, max, starving };
}
// ════════════════════════════════════════════════════════════════
// ★★[T1197 2026-11-06 · 추상 걷기 C · ★재민 11-05 "추상 다 없애자고 했는데 왜 아직도 남겨둔 거야"] **식사 = 몸이 꺼내 먹음 · 굶어 죽음 = 그 몸**
//   손잡이 `T1197_MEAL_BODY`(켬 기본 · `=0` 만 끔 = 종전 바이트 · T1074 끔이면 안 선다 · 몸 정본 `server/body.js` 를 못 읽는 판도 안 선다).
//   종전(T1074): 하루 한 번 마을 몫(`consumeFood`)을 사람마다 나눈 빚 장부 · 죽음 = 빚 > 14 인 사람 가운데 가장 늙은 1명/일 · 몸은 그 수의 거울(T590 — 명부 맨 앞 몸).
//   켬 — 사람마다 **몸 게이지**를 명부 칸에 둔다(플레이어 몸과 같은 정본 함수 `Body.decayStep` · `Body.extremeness` + `CFG.EXTREME_HP_HUNGER` — 사본 0 · 새 수 0):
//     `_mh` 허기(0 ~ 100) · `_mhp` 몸 HP(0 ~ 100) · `_mD` 게이지를 마지막으로 흘린 econ 시각(날 + 그날 몫) · `_mS` 마지막으로 먹은 끼니 번호(날 × 2 + 끼니).
//   ① 끼니 둘 = 몸 일과의 두 집 문(`server/villages.js npcLifeTick` — 기상 · 귀가) · 시각 = 날 머리 · 날 + `dayPhaseRatio`(zone-config 정본 · 낮 몫).
//      한 끼 = 다음 끼니까지 몸이 쓸 몫(하루치 × 그 사이 몫 × (1 − 적응)) + 갚기(게이지가 배부른 띠 아래인 만큼 · 하루 상한 `FD_REPAY_MAX` 의 그 사이 몫).
//      곳간이 모자라면 그 끼니를 먹는 사람 모두 같은 비율(한 솥 — T1074 ①의 그 꼴). 곳간 장부는 **먹은 만큼만** 준다(`consumeFood` 그대로).
//      허기 ↔ 식량 = `kcal.dayHunger`(하루치 1단위 = 하루 허기 · 정본) · 몸 하루 = 운영 하루(`kcal.DAY_MS_DEFAULT` — T906 원정 몸과 같은 시계).
//   ② 굶어 죽음 = 그 사람의 허기가 극단(정본 단계 표의 3단계 문턱)을 넘은 동안 `_mhp` 가 깎여 0 → **그 사람**이 죽는다(가장 늙은 이 아님 · 하루 상한 없음).
//      보호막(첫 365일 NPC 마을) · `POP_MIN` · 원정 팩 병사 제외는 T1074 그대로. 극단 밖이면 하루 회복(몸 일일 회복의 요양 몫 — 정본 `NPC_HP_DAY` · `npcRegenMul`).
//   ③ T1074 빚 = 게이지의 장부 거울(날 단위): `_fd` = (배부른 띠 − 지금 허기) ÷ 하루 허기 + 잃은 HP ÷ 극단 최심의 하루 감소(≥ 0 · 죽음에서 ≈ 죽음 날 수) ·
//      `_fdS` = 그날 못 먹은 하루치 몫 · 적응 `_fdA` 는 같은 수로 오르내리며 감쇠를 늦춘다.
//      배부른 띠(끼니 앞 허기 둘) · 죽음 날 수(배부른 몸이 굶기 시작해 HP 0 까지)는 **유도값** — 제 몫을 다 먹는 몸을 아래 함수로 굴려 얻는다(새 수 0).
//   ④ 몸(서버 존)이 선 사람은 몸이 끼니를 먹고(`t1197Meal` · 호스트가 부른다) 게이지를 흘린다(`t1197Advance`) — 날 경계(`t1197Day`)는 그 사람의 남은 끼니 · 남은 시간만 친다.
//      ⇒ 헤드리스 마을(몸 없음)은 이 날 경계가 몸 게이지를 일괄로 굴린다(T1185 질문 3 — 두 길이 같은 함수 · 결과 비교는 보고).
//   수치 틀: 극단 구간 HP 적분은 게임 1시간(몸 60초) 중점 걸음(세계의 수가 아니다 — T906 `_t906Day` 의 1분 걸음과 같은 꼴 · 값 차는 하네스).
const T1197_MEAL_BODY = T1074_FOOD_DEBT && (typeof process !== 'undefined' && !!process.env && process.env.T1197_MEAL_BODY === '1'); // ★[PM land1049] 끔 기본(`=1` 켬) — 켬 판 서버 1020 400날 인구 3,617 → 1,848 · 빈 마을 1 → 15(사냥 · 식사 몸 같이 · 가상 시계) · 켤 날 T1209 — ★[T1209] 게이트 못 넘음(곳간은 두 판 같이 빈다 · 정본 몸이 3.6날에 한꺼번에 죽인다 · 회부) · 끔 기본 그대로
const NPC_HP_DAY = { rest: 18, work: 6 };   // ★[T1197] 몸 일일 회복(요양 · 근무) — 종전 `server/villages.js` 의 그 두 글자를 이리로 옮겼다(값 무변 · 서버 생활층이 이것을 읽는다)
// 몸 일일 회복 배수(건강 · 행복 · 식량) — 종전 `server/villages.js` 의 그 식을 이리로 옮겼다(식 무변 · 서버 생활층과 아래 날 경계가 같은 함수)
function npcRegenMul(econ, popAlt) {
  const st = econ.lastStats;
  const hpF = Math.max(0.4, Math.min(1.5, 0.5 + (st ? st.health : 0.5)));
  const hapF = Math.max(0.4, Math.min(1.5, 0.5 + (st ? st.happiness : 0.5)));
  const _food = (T1243_FARM_ON || T1260_FOOD_READS) ? totalFoodEquivalent(econ) : ((econ.storage && econ.storage.food) || 0);   // ★[T1260 ⑤]
  const _pop = (econ.npcs && econ.npcs.length) || popAlt;   // 랩 s.pop=econ 인구 동형
  const foodF = Math.max(0.35, Math.min(1.4, _food / Math.max(1, _pop * 30)));
  return hpF * hapF * foodF;   // 식량 하한 0.35(기근에도 소량 회복 → 죽음 나선 방지 — 랩 동형)
}
let _t1197M;
function _t1197() {
  if (_t1197M !== undefined) return _t1197M;
  _t1197M = null;
  if (!T1197_MEAL_BODY) return null;
  let B = null, K = null, Z = null;
  try { B = require('../server/body'); } catch (e) { B = null; }
  try { K = require('../server/kcal'); } catch (e) { K = null; }
  try { Z = require('../server/zone-config'); } catch (e) { Z = null; }
  if (!B || typeof B.decayStep !== 'function' || typeof B.extremeness !== 'function' || typeof B.extremeAt !== 'function' || !B.CFG) return null;
  if (!K || typeof K.dayHunger !== 'function' || !(K.DAY_MS_DEFAULT > 0)) return null;
  const R = Z && Z.WORLD ? +Z.WORLD.dayPhaseRatio : NaN;
  if (!(R > 0 && R < 1)) return null;
  const M = { B, HS: B.CFG.HUNGER_SEC, RATE: B.CFG.EXTREME_HP_HUNGER, DAY_S: K.DAY_MS_DEFAULT / 1000, DH: K.dayHunger(), R,
              AT: 100 * (1 - B.extremeAt('hunger')), STEP: 60, fed: [100, 100], dieDays: FD_DEATH_DAYS };
  if (!(M.HS > 0) || !(M.DH > 0) || !(M.DAY_S > 0)) return null;
  _t1197M = M;
  // 유도 ① 배부른 띠 — 제 몫(갚기 0)을 다 먹는 몸을 굴려 끼니 앞 허기가 멎는 자리(수렴 · 0.4 ㎍ 아래)
  const q = { _mh: 100, _mhp: 100, _mD: 0, _fdA: 0 };
  for (let d = 0; d < 400; d++) {
    const f0 = q._mh; q._mh = Math.min(100, q._mh + DAILY_FOOD_CONSUMPTION * R * M.DH); t1197Advance(q, d + R);
    const f1 = q._mh; q._mh = Math.min(100, q._mh + DAILY_FOOD_CONSUMPTION * (1 - R) * M.DH); t1197Advance(q, d + 1);
    if (Math.abs(f0 - M.fed[0]) < 1e-9 && Math.abs(f1 - M.fed[1]) < 1e-9) break;
    M.fed[0] = f0; M.fed[1] = f1;
  }
  // 유도 ② 죽음 날 수 — 배부른 띠(끼니 앞)에서 굶기 시작한 몸이 HP 0 에 닿는 날(시간 몫 1/24 · 위 수치 틀과 같은 걸음)
  const z = { _mh: M.fed[0], _mhp: 100, _mD: 0, _fdA: 0 };
  let t = 0; while (z._mhp > 0 && t < 400) { t += 1 / 24; t1197Advance(z, t); }
  M.dieDays = t;
  return M;
}
function _t1197Init(p, d) {
  if (p._mh != null) return;
  const M = _t1197();
  p._mh = M.fed[0]; p._mhp = 100; p._mD = d; p._mS = Math.floor(d) * 2 - 1;   // 처음 보는 사람 = 배부른 띠(끼니 앞) · 그날 끼니부터 먹는다
}
// 게이지를 econ 시각 `toD` 까지 흘린다 — 감쇠(적응만큼 느리게) · 극단이면 HP. 반환 = 깎인 HP.
function t1197Advance(p, toD) {
  const M = _t1197(); if (!M) return 0;
  _t1197Init(p, Math.floor(toD));   // 처음 보는 사람은 그날 머리부터(몸이 낮에 처음 짚어도 일괄과 같은 출발 — 벽시계 무관)
  const dd = toD - p._mD; if (!(dd > 0)) return 0;
  p._mD = toD;
  const sec = dd * M.DAY_S, a = 1 - (p._fdA || 0), h0 = p._mh;
  const h1 = M.B.decayStep(h0, M.HS, sec * a);
  if (!(h1 < M.AT)) { p._mh = h1; return 0; }
  const n = Math.max(1, Math.ceil(sec / M.STEP)), ds = sec / n;
  let h = h0, L = 0;
  for (let i = 0; i < n; i++) {
    const hn = M.B.decayStep(h, M.HS, ds * a);
    L += M.RATE * M.B.extremeness('hunger', 1 - (h + hn) / 200) * ds;   // 정본 합산기의 허기 줄(`extremeHpRate` — 갈증 · 추위는 NPC 면제 그대로 0)
    h = hn;
  }
  p._mh = h;
  if (L > 0) p._mhp = Math.max(0, (p._mhp == null ? 100 : p._mhp) - L);
  return L;
}
// 한 끼에 먹으려는 몫(하루치 단위) — 끼니 k 의 사이 몫 × (1 − 적응) + 갚기(배부른 띠 아래만큼 · 상한)
function _t1197Want(p, k) {
  const M = _t1197(), fr = k === 0 ? M.R : 1 - M.R;
  const owe = Math.max(0, M.fed[k] - p._mh) / M.DH;
  return DAILY_FOOD_CONSUMPTION * fr * (1 - (p._fdA || 0)) + Math.min(owe, FD_REPAY_MAX * fr);
}
// 곳간에서 꺼낸다(섭식 정본 `consumeFood` 그대로) — 식단 기록은 그날 끼니를 모은다(몸 끼니는 다음 날 경계의 식단에 든다 · 날 경계 사이에 지난 날 기록을 안 건드린다)
function _t1197Eat(v, need, body) {
  const fe = v._foodEaten, before = {};
  if (fe) for (const r in fe) before[r] = fe[r];
  const gap = consumeFood(v, need);
  const now = v._foodEaten;
  if (body) {
    const b = v._t1197Body || (v._t1197Body = {});
    for (const r in now) { b[r] = (b[r] || 0) + now[r]; now[r] = 0; }
    for (const r in before) now[r] = before[r];
  } else for (const r in before) now[r] = (now[r] || 0) + before[r];
  return gap;
}
// ★★[T1209 2026-11-07 · ★재민 11-07 "몸이 꺼내 먹어도 마을이 비지 않는다"] **모자란 솥은 가장 위태로운 사람부터** — 손잡이 `T1209_MEAL_TRIAGE`(끔 기본 · `=1` 켬 · 끔 = T1197 한 솥 같은 비율 그대로 · T1197 끔이면 이 줄을 안 탄다).
//   까닭(계측 · 보고 T1209 §1): 켬 판 · 끔 판의 곳간은 **같이** 빈다(보릿고개 — 여름 · 늦여름 생산 ≈ 제 몫 · 두 판의 못 먹은 몫 비율이 같다). 갈린 것은 나눔이다 —
//     같은 비율 한 솥은 모두를 같은 게이지로 끌어내려 정본 몸(배부른 띠 → HP 0 이 3.6날)이 **한날 한꺼번에** 죽인다(마을 통째 — 서버 1020 400날 켬 판 굶어 죽음 1,008 가운데 915 가 한 마을 하루 다섯 넘게 죽은 날 · 끔 판 559 가운데 0).
//   켬 — 곳간이 그 끼니의 몫(아직 안 먹은 사람 모두)을 못 채우면, 몸 HP 가 낮은 사람 → 허기가 낮은 사람 → id 순으로 제 몫(한 끼 + 갚기)을 다 먹고, 곳간이 다한 데서 멎는다.
//     위태로운 사람이 먼저 먹으니 짧은 모자람은 아무도 극단에 오래 두지 않고(돌아가며 먹는다), 긴 모자람은 곳간이 먹일 수 있는 만큼을 살린다(모두가 아니라 넘친 몫이 굶는다).
//     구호 급식의 우선(중증 영양실조 먼저 — Sphere Handbook 2018 영양실조 관리 표준 · 새 수 0) · 몸 끼니는 앞 순번 사람들의 몫을 곳간에 남겨 두고 먹는다(먼저 온 몸이 남의 몫을 안 먹는다).
const T1209_MEAL_TRIAGE = typeof process !== 'undefined' && !!process.env && process.env.T1209_MEAL_TRIAGE === '1';   // 끔 기본(`=1` 켬) — 랩 1020 은 나아졌으나(빈 마을 22 → 5) 서버 1020 은 나빠졌다(인구 2,850 → 2,460 · 굶어 죽음 1,008 → 1,584) · 보고 T1209 §3
function _t1209Before(a, b) {   // 먼저 먹는 사람 — HP 낮은 · 허기 낮은 · id(정해진 순 · 주사위 0)
  const d = (a._mhp == null ? 100 : a._mhp) - (b._mhp == null ? 100 : b._mhp); if (d) return d;
  const e = (a._mh || 0) - (b._mh || 0); if (e) return e;
  const x = String(a.id), y = String(b.id); return x < y ? -1 : x > y ? 1 : 0;
}
// 한 끼 — 끼니 번호 s(날 × 2 + k)를 아직 안 먹은 사람들에게 한 솥으로. 반환 { need(제 몫), want, got, short(제 몫 가운데 못 먹은 것) }.
function t1197Meal(v, who, s, body) {
  const M = _t1197(); if (!M || !who.length) return { need: 0, want: 0, got: 0, short: 0 };
  const k = ((s % 2) + 2) % 2, fr = k === 0 ? M.R : 1 - M.R;
  let W = 0, N0 = 0; const ws = new Array(who.length);
  for (let i = 0; i < who.length; i++) { const w = _t1197Want(who[i], k); ws[i] = w; W += w; N0 += DAILY_FOOD_CONSUMPTION * fr * (1 - (who[i]._fdA || 0)); }
  if (body && W > 0) {   // 몸 끼니도 한 솥 — 이 끼니를 아직 안 먹은 사람 모두의 몫 가운데 제 몫만큼(곳간이 모자라면 같은 비율 · 먼저 온 몸이 다 먹지 않는다)
    let Wall = W; const mine = new Set(who), oth = [];
    const now = T1209_MEAL_TRIAGE ? who[0]._mD : null;   // ★[T1209] 앞 순번을 가리려면 아직 안 먹은 사람들의 게이지도 이 끼니 시각까지(시간만 흐른다 · 일괄 길과 같은 자리)
    for (const q of _fdEaters(v)) if (!mine.has(q) && q._mh != null && q._mS < s) { if (now != null && q._mD < now) t1197Advance(q, now); const w = _t1197Want(q, k); Wall += w; oth.push([q, w]); }
    const F = totalFoodEquivalent(v);
    if (F < Wall && T1209_MEAL_TRIAGE) {   // ★[T1209] 앞 순번(더 위태로운 · 아직 안 먹은) 사람들의 몫을 남기고 남은 만큼만
      W = 0;
      for (let i = 0; i < who.length; i++) {
        let ahead = 0;
        for (const [q, w] of oth) if (_t1209Before(q, who[i]) < 0) ahead += w;
        for (let j = 0; j < who.length; j++) if (j !== i && _t1209Before(who[j], who[i]) < 0) ahead += ws[j];
        ws[i] = Math.min(ws[i], Math.max(0, F - ahead)); W += ws[i];
      }
    } else if (F < Wall) { const r = Math.max(0, F) / Wall; W = 0; for (let i = 0; i < ws.length; i++) { ws[i] *= r; W += ws[i]; } }
  }
  const w0 = body ? who.map((p) => _t1197Want(p, k)) : ws;   // 제 몫(솥 비율 앞) — 못 먹은 몫의 자
  const gap = W > 0 ? _t1197Eat(v, W, body) : 0;
  const f = W > 0 ? Math.max(0, W - gap) / W : 1;
  let gv = null;   // ★[T1209] 켬 · 모자란 일괄 솥 = 먹은 것(W − gap)을 앞 순번부터 제 몫까지 · 끔 = 같은 비율(f)
  if (T1209_MEAL_TRIAGE && !body && gap > 0 && W > 0) {
    gv = new Array(who.length).fill(0); let G = Math.max(0, W - gap);
    const ord = who.map((p, i) => i).sort((a, b) => _t1209Before(who[a], who[b]));
    for (const i of ord) { if (!(G > 0)) break; const g = Math.min(ws[i], G); gv[i] = g; G -= g; }
  }
  let short = 0;
  for (let i = 0; i < who.length; i++) {
    const p = who[i], got = gv ? gv[i] : ws[i] * f;
    const sh = DAILY_FOOD_CONSUMPTION * fr * (1 - (p._fdA || 0)) * (w0[i] > 0 ? Math.max(0, 1 - got / w0[i]) : 0);
    p._mh = Math.min(100, p._mh + got * M.DH); p._mS = s;
    p._fdS = (p._fdS || 0) + sh; short += sh;
  }
  return { need: N0, want: W, got: W - gap, short };
}
// 그 사람이 굶어 죽는다(명부에서 뺀다 · 셈은 T1074 빚 죽음 그 칸들). `body` = 몸이 그 자리에서 이미 쓰러졌다(호스트가 부른다 — 날 경계 목록에 안 싣는다).
function t1197Kill(v, p, body) {
  const i = v.npcs.indexOf(p); if (i < 0) return false;
  _t1075Starved(v, v.npcs.length);   // ★[T1075 ③] 사망 계단(끔 = 무동작)
  v.npcs.splice(i, 1);
  v.counts[p.currentJob] = (v.counts[p.currentJob] || 0) - 1;
  v._deathsToday = (v._deathsToday || 0) + 1; v._deadTot = (v._deadTot || 0) + 1; v._fdDeadTot = (v._fdDeadTot || 0) + 1;
  if (!body) (v._t1197Dead || (v._t1197Dead = [])).push(p.id);
  if (T1206_NAT_DEATH) t1206Bury(v, 1, v.npcs.length + 1);   // ★[T1206 ③] 부장(같은 문)
  return true;
}
// 날 경계 — 지난 하루(날 머리 `day − 1` ~ `day`)를 친다: 끼니 둘(몸이 이미 먹은 끼니는 건너뜀) · 남은 시간 흘림 · 빚 거울 · 적응 · 회복.
function t1197Day(v, day) {
  const M = _t1197(); const d0 = day - 1, d1 = day;
  v._t1197Dead = null; v._t1198Gone = null;   // 그날 빠진 사람 목록(호스트가 날 경계 뒤 읽는다)
  { const fe = v._foodEaten || (v._foodEaten = {}), b = v._t1197Body; for (const r in fe) fe[r] = 0; if (b) for (const r in b) fe[r] = (fe[r] || 0) + b[r]; v._t1197Body = null; }   // 몸 끼니가 그날 식단의 앞 몫
  const E = _fdEaters(v), eat = new Set(E);
  for (const p of v.npcs) { _t1197Init(p, d0); if (!eat.has(p) && p._mD < d1) p._mD = d1; }   // 원정 팩 병사 — 시간은 흐르되 게이지는 제 짐(T906)이 정한다
  for (const p of E) p._fdS = 0;
  let need = 0, short = 0;
  for (let k = 0; k < 2; k++) {
    const t = d0 + (k ? M.R : 0), s = d0 * 2 + k, who = [];
    for (const p of E) { if (p._mD < t) t1197Advance(p, t); if (p._mS < s) who.push(p); }
    if (who.length) short += t1197Meal(v, who, s, false).short;
  }
  const rm = npcRegenMul(v, v.npcs.length);
  for (const p of E) {
    need += DAILY_FOOD_CONSUMPTION * (1 - (p._fdA || 0));
    if (p._mD < d1) t1197Advance(p, d1);
    const fd = Math.max(0, M.fed[0] - p._mh) / M.DH + (100 - (p._mhp == null ? 100 : p._mhp)) / (M.RATE * M.DAY_S);   // 허기 몫(하루치) + 잃은 HP 를 극단 최심에서 잃는 날(같은 정본 수) — 죽음에서 ≈ `dieDays`
    p._fd = fd > 1e-9 ? fd : 0;
    p._fdA = p._fd > 0 ? Math.min(FD_ADAPT_MAX, (p._fdA || 0) + FD_ADAPT_MAX / FD_ADAPT_DOWN_DAYS)
                       : Math.max(0, (p._fdA || 0) - FD_ADAPT_MAX / FD_ADAPT_UP_DAYS);
    if (p._mh >= M.AT && p._mhp < 100) p._mhp = Math.min(100, p._mhp + NPC_HP_DAY.rest * rm);   // 극단 밖이면 하루 회복(요양 몫 · 몸 일일 회복과 같은 수 · 배수 같은 함수) — 보호막이 잡아 둔 HP 0 도 여기서 오른다
  }
  return { need, short };
}
function t1197DieDays() { const M = _t1197(); return M ? M.dieDays : FD_DEATH_DAYS; }   // 굶어 죽기까지 날(켬 = 몸 정본에서 유도 · 끔 = 14)
// ════════════════════════════════════════════════════════════════
// ★★[T1206 2026-11-07 · ★재민 11-07 "자연사가 없으니 죽는 건 전쟁 · 굶주림뿐" · "죽는 만큼 인구 성장도 빨라져야"] **자연사 · 출생 다시 맞춤 · 부장품**
//   손잡이 `T1206_NAT_DEATH`(켬 기본 · `=0` 만 끔 = 종전 바이트).
//   ① 나이별 사망 — 시일러(Siler) 모델 생명표: 하루 위험 h(x) = a₁e^(−b₁x) + a₂ + a₃e^(b₃x) (x = 나이 · 해) → 그날 죽을 몫 p = 1 − e^(−h/365).
//      수 다섯 = Gurven & Kaplan 2007 (Population and Development Review 33(2):321–365) 표 2 "Average hunter-gatherer" 행:
//        a₁ 0.422 · b₁ 1.131 · a₂ 0.013 · a₃ 1.47×10⁻⁴ · b₃ 0.086 — 같은 표 e₁₅ 37.7 · 사망률 배가 8.1 해. 원시 사회 모델 생명표(채집민 다섯 무리의 평균).
//      ★한반도 청동기 인골 생명표는 못 찾았다(미확인 — 산성 토양으로 인골이 거의 안 남는다). 같은 동아시아의 조몬 인골 e₁₅ 는 16(Kobayashi) → 32(Nagaoka 외 2008 · 장골 귀면 연령 추정 고침)라
//        이 표(37.7)보다 낮다 — 농경 청동기 사회가 채집민보다 높았는지 낮았는지는 회부.
//      16살 아래 칸은 쓰지 않는다(생길 때 나이 16 ~ 35 · 아이로 태어나기는 이번에 안 한다 — ★재민 11-07).
//      누가 죽나 — 사람마다 그날 균등값 u = 해시(사람 id · 날)(주사위 0 · 차례 무관 · 결정론) · u < p 면 죽는다. 원정 징발 중인 사람은 빼고(그 죽음은 전쟁 정산), POP_MIN 은 지킨다.
//   ② 출생 다시 맞춤 — 그날 출생 세기에 **그날 기대 자연사**(명부 사람마다 p 의 합 · 같은 생명표)를 더한다 ⇒ K 에서 출생 = 자연사(로지스틱의 평형 K 는 그대로 · 새 배수 0).
//   ③ 부장품 — 죽은 사람 하나마다 곳간 사치품(위세 기여가 있는 품목 — 효용 정본 `contributes.prestige`) 가운데 한 사람 몫 × 부장 비율을 지운다(그 무덤에 든다).
//      부장 비율 = 유물이 나온 무덤 몫 20/117 ≈ 0.171 — 이기성 2024(「청동기시대 군집묘와 혼계」, 한국학 47(3)) 묘역 넷: 나주 영천 3/21(본문 "21기 중 3기를 제외하고는 유물이 출토되지 않는다") ·
//        양평 양수리 I 0/17 · 보령 명천동 6/40 · 논산 마전리 C 11/39(표에서 센 수 — 옹관 3호 "묘광바닥 판석"은 유물로 안 셈). 자연사 · 굶어 죽음 · 늙어 빠짐 · 전사 · 행상 피살 · 원정 전사 모두 같은 문(`t1206Bury`).
//        econ 밖 문(전쟁 · 캐러밴 · 도적)은 그 마을 칸 `_t1206Due` 에 한 사람씩 적고 다음 날 경계가 같은 문으로 묻는다.
const T1206_NAT_DEATH = !(typeof process !== 'undefined' && process.env && process.env.T1206_NAT_DEATH === '0');
const T1206_SILER = { a1: 0.422, b1: 1.131, a2: 0.013, a3: 1.47e-4, b3: 0.086 };   // Gurven & Kaplan 2007 표 2(위 머리글)
const T1206_GRAVE = 20 / 117;   // 이기성 2024 묘역 넷(위 머리글)
function t1206Hazard(age) { const S = T1206_SILER, x = Math.max(0, +age || 0); return S.a1 * Math.exp(-S.b1 * x) + S.a2 + S.a3 * Math.exp(S.b3 * x); }   // 해마다
function t1206DayP(age) { return 1 - Math.exp(-t1206Hazard(age) / 365); }
function _t1206IsLux(id) { const SP = _getSpecialty(); const c = (SP && SP[id] && SP[id].contributes) || LEGACY_CONTRIBUTES[id] || null; return !!(c && c.prestige > 0); }
// 부장 — 죽은 사람 n(죽기 전 인구 N0) · 사치품마다 곳간 × min(1, n × 비율 ÷ N0) 를 지운다(소비 흐름에 적는다). 반환 = 지운 양 합(낱개 단위 그대로).
function t1206Bury(v, n, N0) {
  if (!T1206_NAT_DEATH || !(n > 0) || !v || !v.storage) return 0;
  const N = Math.max(1, N0 || ((v.npcs ? v.npcs.length : 0) + n));
  const f = Math.min(1, n * T1206_GRAVE / N);
  let tot = 0;
  for (const r of Object.keys(v.storage)) {
    const q = v.storage[r] || 0; if (!(q > 0) || !_t1206IsLux(r)) continue;
    const take = q * f; v.storage[r] = q - take; _cons(v, r, take); tot += take;
  }
  v._buryUsed = (v._buryUsed || 0) + tot; v._buryN = (v._buryN || 0) + n;
  return tot;
}
// 그날 기대 자연사(출생 다시 맞춤의 몫) — 명부 사람마다 p 합(징발 중 제외)
function t1206Expected(v) { let e = 0; for (const p of v.npcs) if (!p._warDraft) e += t1206DayP(p.age); return e; }
// 그날 자연사 — 정해진 씨(사람 id · 날)로 고른 그 사람들 · 반환 = 죽은 수
// ★[T1222] 주사위 열쇠 = 사람 번호를 **첫 세계 기준**으로 옮긴 것. 사람 번호(`n<k>` · `nv<마을>.<k>`)의 수는 프로세스 계수기(`_nextNpcId` · `_nextVillageId`)에서 나와
//   한 프로세스 안 둘째 세계(랩 다시 뿌리기 · 하네스 두 판)는 같은 사람이 다른 번호를 받는다 → 다른 사람이 죽었다(T1216-K3 · test-lab-stone ② ⑭).
//   `createWorld` 가 그 세계가 시작할 때의 두 계수기와 첫 세계의 차(`_t1206Shift`)를 적고 여기서 뺀다 — 첫 세계(서버 존 · 랩 첫 판)는 차 0 = 종전 열쇠 그대로.
function _t1206Key(v, id) {
  const s = String(id), sh = v && v._world && v._world._t1206Shift;
  if (!sh || (!sh.v && !sh.n)) return s;
  let m = /^nv(\d+)\.(.+)$/.exec(s); if (m) return 'nv' + (+m[1] - sh.v) + '.' + m[2];
  m = /^n(\d+)$/.exec(s); if (m) return 'n' + (+m[1] - sh.n);
  return s;
}
function t1206Day(v, day) {
  if (!T1206_NAT_DEATH) return 0;
  const N0 = v.npcs.length; let k = 0;
  for (const p of v.npcs.slice()) {
    if (p._warDraft) continue;
    if (!(v.npcs.length > POP_MIN)) break;
    if (!(_hashStr(_t1206Key(v, p.id) + '|' + day + '|t1206') < t1206DayP(p.age))) continue;
    const i = v.npcs.indexOf(p); if (i < 0) continue;
    v.npcs.splice(i, 1);
    v.counts[p.currentJob] = (v.counts[p.currentJob] || 0) - 1;
    v._deathsToday = (v._deathsToday || 0) + 1; v._deadTot = (v._deadTot || 0) + 1; v._natDeadTot = (v._natDeadTot || 0) + 1;
    v._natAgeSum = (v._natAgeSum || 0) + (+p.age || 0);
    if (_t1206Gone) _t1206Gone(v, p);
    k++;
  }
  if (k) t1206Bury(v, k, N0);
  return k;
}
let _t1206Gone = null;   // 아래 T1198 문이 선 뒤 꽂힌다(그 사람의 몸이 눕는다)
const T1198_BIRTH_BODY = T1197_MEAL_BODY && !(typeof process !== 'undefined' && process.env && process.env.T1198_BIRTH_BODY === '0');
// ════════════════════════════════════════════════════════════════
// ★★[T1198 2026-11-06 · 추상 걷기 D · ★재민 11-05] **출생 = 집의 짝 곁 몸 · 명부 ↔ 몸 1:1** — 손잡이 `T1198_BIRTH_BODY`(켬 기본 · `=0` 만 끔 = 종전 바이트 · T1197 끔이면 안 선다).
//   종전: 출생 = θ-로지스틱 누적 ≥ 1 이면 `createNPC`(부모 무관) · 몸은 서버가 하루 ±2(`POP_SYNC_PER_DAY`)로 econ 수를 따라 스폰(사람과 몸 사이 짝 0).
//   켬(econ 쪽):
//     ① 아이를 가질 수 있는 집 = 침상 있는 집(주거 상한 ÷ 채당 정원 — `hutCapPerHut` 정본) 가운데 사는 사람이 둘 이상인 집.
//        사는 곳 = 명부 차례로 채당 정원씩(원정 팩 병사 제외 · 몸 층의 집 배정 `spawnOneNpc` 이 명부 자리로 집을 고르는 그 꼴).
//     ② 출생 누적(`_dPAccum`)은 그 집 수를 넘지 않고 · 한 집에 하루 한 아이 · 아이의 부모 칸 `_pa` = 그 집 첫 사람 · `_born` = 그날(호스트가 그 몸 곁에 아이 몸을 세운다).
//        어느 집부터 = 날 % 집 수(차례 돌림 · 주사위 0).
//     ③ 로지스틱 음수로 빠진 사람(가장 늙은 이 — 나이 칸 그대로)의 id 를 `_t1198Gone` 에 싣는다(호스트가 **그 사람의 몸**을 그 자리에서 눕힌다).
function _t1198Houses(v, hcap, day) {
  const per = hutCapPerHut(); if (!(per > 0)) return null;
  const E = v.npcs.filter((p) => !(p._warPack && p._warDraft));
  const bedHouses = hcap === Infinity ? Infinity : Math.floor(hcap / per);
  const out = [];
  for (let h = 0; h * per < E.length && h < bedHouses; h++) if (Math.min(per, E.length - h * per) >= 2) out.push(E[h * per]);
  if (out.length > 1) { const k = ((day | 0) % out.length + out.length) % out.length; return out.slice(k).concat(out.slice(0, k)); }
  return out;
}
_t1206Gone = (v, p) => { if (T1198_BIRTH_BODY && _t1197()) (v._t1198Gone || (v._t1198Gone = [])).push(p.id); };   // ★[T1206] 자연사한 그 사람의 몸이 눕는다(T1198 늙음 문 그대로)
// ★★[T1075 2026-11-02 · ★재민 11-02] **행복 = 평형 회귀(배너로드식) · 굶주림 평형 · 사망 계단** — 손잡이 `T1075_HAPPY_EQ`(**기본 끔** · `=1` 만 켬 · 끔 = 종전 바이트).
//   재민 11-02: 마운트앤블레이드 배너로드의 안보 · 충성도처럼 "현재가 높으면 기본 변화량이 마이너스, 낮으면 플러스" · 굶는 동안 평형을 내려
//   낮은 행복을 유지 · 기아 사망자가 생기면 계단으로 뚝 · 이후 아주 천천히 회복.
//   ① 지금 공식(`_computeVillageStats` 의 그날 값) = **평형 H\***. 실제 행복 H 는 마을 칸 `v._H`(plain number · 저장 줄이 싣는다) — 날마다 `Equilibrium.keep` 으로 H\* 를 따라간다.
//      반감기 `HAPPY_EQ_HALF_DAYS` = 30일(카드 "바닥 → 절반 회복 한 달 남짓" · 판 체감은 보고).
//   ② 굶주림: H\* × (1 − min(1, 마을 평균 식량 빚 ÷ 14)) — 빚 0 = 무변 · 빚이 죽음 문턱(14 · T1074)에 닿으면 평형 0(T1074 `foodDebtOf` 하나를 읽는다 · 사본 0).
//   ③ 기아 사망 계단: 굶어 죽은 사람 하나마다 그 자리에서 H −= 1 ÷ 인구(죽음 직전 수) — 비례 계수 1(새 수 0 · 판 체감은 보고).
//   ④ 불행은 죽이지 않는다: `_happyTerm` 이 음수면 **출생을 먼저 깎고**(다른 몫의 양수 dP 를 0 까지), 남는 몫은 **이탈 압력** `v._emigAccum` —
//      1 이 차면 가장 젊은 자유민 1명이 **몸으로 이웃 마을까지 걷는다**(호스트 `world.t1075Emigrate` — 서버 도적 층의 길 위 장부 T765 · 새 몸 0).
//      호스트가 없는 판(랩 · 헤드리스)은 걸을 길이 없어 아무도 안 떠난다(압력은 `_emigLost` 에 센다 · 소멸 0).
//   ⑤ 평형 모듈 하나: `sim/equilibrium.js`(T1076 원정 사기와 같은 파일 · 사본 0). 행복은 0~1 밖(1 넘김 = 인구 보너스)도 뜻이 있어 0~1 로 자르는 `step` 대신
//      그날 남는 차이 몫 `Equilibrium.keep(반감기)` 로 H ← H\* + (H − H\*) · keep 을 쓴다(★[T1109] 다시 합침 · 11-02 가지의 같은 식을 이 파일로 옮김).
const T1075_HAPPY_EQ = (typeof process !== 'undefined' && process.env && process.env.T1075_HAPPY_EQ === '1');
const HAPPY_EQ_HALF_DAYS = 30;
const Equilibrium = require('./equilibrium.js');   // ★[T1109] 평형 회귀 한 곳(T1076 · T1075 — 번들은 `build-econ-bundle` 이 같은 파일을 싣는다)
// ③ 사망 계단 — 굶어 죽은 사람 하나(죽음 직전 인구 n)
function _t1075Starved(v, n) {
  if (T1134_HAPPY_TARGET) { if (n > 0) v._t1134E = (v._t1134E || 0) + 1 / n; return; }   // ★[T1134] 켬 = 죽음은 '겪은 일'(목표를 내린다) — T1075 계단은 안 탄다
  if (T1075_HAPPY_EQ && v._H != null && n > 0) { v._H = Math.max(0, v._H - 1 / n); if (v.lastStats) v.lastStats.happiness = v._H; }
}   // 소비자도 계단 뒤 값을 읽는다
// ★★[T1134 2026-11-04 · ★재민 11-03 판정 ⑤ ㄱ] **행복 = 목표로 다가가는 값(배너로드 사기 꼴) · 인구만큼 불만** — 손잡이 `T1134_HAPPY_TARGET`(**끔 기본** · `=1` 만 켬 · 끔 = 종전 바이트).
//   목표 h* = 0.5 + 좋은 것 − c · N − 겪은 일  (0 ~ 1 로 자름 · 날마다 다시 셈 · 지금 h 를 안 읽는다)
//     좋은 것 = `_computeVillageStats` 의 행복 합 그대로(창고 포화 · 음식 가짓수 · 여가 · 추위 옷 · 옷감 품질 · 가죽 물건 — 무게 그대로 · 기준만 0.5 위로)
//     인구 항 = c · N(ㄱ 선형) — c 는 env `T1134_C`(손으로 박지 않는다 · 보고가 끔 판의 '좋은 것 ÷ 인구' 분포에서 세 값을 재어 고른다 · 미설정 = 0)
//     겪은 일 E(마을 칸 `v._t1134E` · 반감기 30날 = `HAPPY_EQ_HALF_DAYS`) — 하나씩 계단:
//       굶어 죽음 +1/N(T1075 ③ 그 꼴) · 굶주림 날 +(굶는 몫)/14(빚이 죽음 문턱 14날에 닿으면 한 사람 몫 — T1074 `FD_DEATH_DAYS`) ·
//       전사 · 포로 +1/N · 징발 +1/N(war-core) · 곳간 약탈 + 빼앗긴 몫(빼앗긴 식량 ÷ 그 전 곳간)(war-core).
//   실제 h(마을 칸 `v._H`) 는 목표로 다가간다: `Equilibrium.step(h, h*, T)` — 반감기 T = env `T1134_HALF`(미설정 = 30 · HAPPY_EQ_HALF_DAYS).
//     같은 조건이면 출발값과 무관하게 같은 값으로 간다(test-happy-converge).
//   효과: 출생 항 그대로(h 를 읽는다) · 불행은 죽이지 않는다(T1075 ④ — 출생을 먼저 깎는다) · **h < 0.25 일 때만** 남는 몫이 이탈 압력(더 행복한 이웃이 받을 때만 걷는다).
//   T1075 와 같이 켜면 T1134 가 이긴다(목표 · 계단 · 이탈 문턱).
//   ★★[T1147 · ★재민 11-04 ㄱ] **켬 기본**(`!== '0'` · 되돌림 `T1134_HAPPY_TARGET=0` = 종전 바이트) · c 기본 0.00741(T1134 §5 권고 — 끈 판 마을별 '좋은 것 ÷ 인구' 25%) · env `T1134_C` 로 바꾼다.
const T1134_HAPPY_TARGET = !(typeof process !== 'undefined' && process.env && process.env.T1134_HAPPY_TARGET === '0');
const T1134_C_DEFAULT = 0.00741;   // ★재민 11-04 판정(T1134 보고 §5)
const T1134_EMIG_H = 0.25;   // ★재민 11-03 카드(이주 문턱)
function t1134C() { const x = (typeof process !== 'undefined' && process.env) ? parseFloat(process.env.T1134_C) : NaN; return Number.isFinite(x) && x >= 0 ? x : T1134_C_DEFAULT; }   // ★[T1147] 미설정 = 0.00741 · `T1134_C=0` = 인구 항 없음
function t1134Half() { const x = (typeof process !== 'undefined' && process.env) ? parseFloat(process.env.T1134_HALF) : NaN; return Number.isFinite(x) && x > 0 ? x : HAPPY_EQ_HALF_DAYS; }
//   하루 한 걸음 — 좋은 것 G · 인구 N · 오늘 굶주림 몫 hungerShare(0~1) → { target, h }. 마을 칸 둘(`_t1134E` · `_H`)만 쓴다(하네스가 이 함수를 그대로 부른다).
function t1134Step(v, G, N, hungerShare) {
  v._t1134E = (v._t1134E || 0) * Equilibrium.keep(HAPPY_EQ_HALF_DAYS) + (hungerShare > 0 ? hungerShare / t1197DieDays() : 0);   // ★[T1197] 켬 = 죽음 날 수(몸 정본 유도) · 끔 = 14
  const target = Math.max(0, Math.min(1, 0.5 + G - t1134C() * N - v._t1134E));
  v._H = v._H == null ? target : Equilibrium.step(v._H, target, t1134Half());
  return { target, h: v._H };
}
// ★★[T1205 2026-11-07 · ★재민 11-07 판정대기 문 32] **행복 = 천천히 따라가는 부분 − 그날 바로 반영하는 인구 부담** — 손잡이 `T1205_HAPPY`(켬 기본 · `!== '0'` · 되돌림 `=0` = T1134 그대로).
//   T1134 위에만 선다(`T1134_HAPPY_TARGET` 끔이면 이 절도 안 탄다).
//   천천히 S: 목표 0.5 + 좋은 것 − 겪은 일 → 반감기 30날(`t1134Half`)로 다가간다. 0 ~ 1 로 안 자른다(위로 남는 몫은 부담이 깎는다).
//   그날 바로 B = c × 인구ᵃ ÷ 영토ᵇ — 영토 = 생활층 영토 셀 수(호스트 `world.terrCells(v)` · 서버 `_terrSet` 넓이 · 없는 판 = econ 땅 `land.size × EXPAND_CELLS_PER_SLOT`)
//     · 바닥 = 창설 영토(`land.baseSize × EXPAND_CELLS_PER_SLOT`). c · a · b = env `T1205_C` · `T1205_A` · `T1205_B`(기본 = 보고 §2 판에서 고른 값).
//   행복 h = clip01(S − B) — 마을 칸 `v._H`(소비자 · 저장 줄 그대로) · S 는 `v._t1205S`.
//   좋은 것 G 에 사치품(위신재) 항 하나 — `_computeVillageStats` 의 위신 합(1인당 충족률 × 위신 무게 · 호피 · 청동검 위세)을 1 에서 자르고 × `T1205_LUX_W`.
//   겪은 일 E: 부호 있음 · −0.2 ~ +1 로 자름(`T1205_E_MIN` · `T1205_E_MAX` 아님 — 카드 글자 그대로 상수) · 좋은 일 = 승전 약탈(`war-core _warLootMove` — 빼앗아 온 식량 ÷ 우리 곳간).
//   효과(모두 연속): 생산 배수 1 + 2W × max(0, h − 0.75)(W = `happyWorkWOf` · h = 1 에서 종전 최대 1 + W/2 그대로) ·
//     출생 항 그대로 · 떠나기 = 인구 × k₂ × max(0, 0.25 − h)(k₂ = env `T1205_K2`) — 그날 떠난 몸만큼 B 가 줄어 h 가 0.25 에 닿으면 그날 멈춘다(S ≥ 0.25 일 때).
const T1205_HAPPY = T1134_HAPPY_TARGET && !(typeof process !== 'undefined' && process.env && process.env.T1205_HAPPY === '0');
const T1205_E_MIN = -0.2, T1205_E_MAX = 1;   // ★재민 11-07 카드(겪은 일 범위)
const T1205_LUX_MAX = 1;                     // 사치품 1인당 충족률 자름(다른 항목과 같은 1)
const T1205_DEF = { C: 0.003, A: 2, B: 0.5, LUX_W: 0.15, K2: POP_MAX_DELTA_PCT / T1134_EMIG_H };   // ★[T1205 §2] c · a · b · 사치품 무게 = 판에서 고른 값(보고) · k₂ = 하루 인구 상한 ÷ 0.25(h = 0 에서 하루 떠남 = 종전 하루 상한 N × 6 %)
function _t1205Env(k) { const x = (typeof process !== 'undefined' && process.env) ? parseFloat(process.env['T1205_' + k]) : NaN; return Number.isFinite(x) && x >= 0 ? x : T1205_DEF[k]; }
function t1205Par() { return { c: _t1205Env('C'), a: _t1205Env('A'), b: _t1205Env('B'), luxW: _t1205Env('LUX_W'), k2: _t1205Env('K2') }; }
//   영토 셀 수(바닥 = 창설 영토)
function t1205Terr(v) {
  const L = v.land || {}, floor = Math.max(1, (L.baseSize || L.size || 1) * EXPAND_CELLS_PER_SLOT);
  let t = null;
  const W = v._world; if (W && typeof W.terrCells === 'function') { try { t = W.terrCells(v); } catch (e) { t = null; } }
  if (!(t > 0)) t = (L.size || 0) * EXPAND_CELLS_PER_SLOT;
  return Math.max(floor, t);
}
function t1205Burden(N, T, P) { P = P || t1205Par(); return N > 0 ? P.c * Math.pow(N, P.a) / Math.pow(Math.max(1, T), P.b) : 0; }
function t1205Ev(v, amt) { if (!v || !(amt !== 0) || !isFinite(amt)) return; v._t1134E = Math.max(T1205_E_MIN, Math.min(T1205_E_MAX, (v._t1134E || 0) + amt)); }
//   하루 한 걸음 — 좋은 것 G(사치품 항 포함) · 인구 N · 영토 T · 오늘 굶는 몫 → { target(S 의 목표), slow, burden, h }
function t1205Step(v, G, N, T, hungerShare) {
  const P = t1205Par();
  v._t1134E = Math.max(T1205_E_MIN, Math.min(T1205_E_MAX, (v._t1134E || 0) * Equilibrium.keep(HAPPY_EQ_HALF_DAYS) + (hungerShare > 0 ? hungerShare / t1197DieDays() : 0)));
  const target = 0.5 + G - v._t1134E;
  v._t1205S = v._t1205S == null ? target : target + (v._t1205S - target) * Equilibrium.keep(t1134Half());
  const burden = t1205Burden(N, T, P);
  v._H = Math.max(0, Math.min(1, v._t1205S - burden));
  return { target, slow: v._t1205S, burden, h: v._H, terr: T };
}
//   0.25 에 닿을 때까지 떠날 사람 수(S ≥ 0.25 일 때만 뜻 — 아니면 Infinity)
function t1205NeedOut(v, N, T) {
  const P = t1205Par(), S = v._t1205S;
  if (!(S >= T1134_EMIG_H) || !(P.c > 0)) return Infinity;
  const nMax = Math.pow((S - T1134_EMIG_H) * Math.pow(Math.max(1, T), P.b) / P.c, 1 / P.a);   // 부담 ≤ S − 0.25 인 가장 큰 인구
  return Math.max(0, Math.ceil(N - nMax - 1e-9));
}
// ★★[T931 2026-10-26 · T924 회부 2-ⓐ · 재민 10-24 "창고에 식량이 있는데 자유민이 그렇게 빨리 죽어?"]
//   **식량 자리 K 에도 신뢰 관성** — 손잡이 `T931_SLOTK_EMA`(★[T943] **켬 기본 = `'season'`** · 되돌림 `'0'` = 끔 = 종전 바이트 · `'1'` = 값 전체 · 그 밖 · 미설정 = `'season'` · 브라우저 랩 = `'season'`).
//   ★[T943 2026-10-27 · PM 결정 — T931 회부 1 = `'season'`(카드 글자 "계절 배수에"의 꼴 · 서버 띠 그날 굶주림 0 인 죽음 −45% · 랩 −23%)] T931 보고 §7 · T943 보고.
//   K = min(식량 자리 slotK · 식량 흐름 prodK · 땔감 fuelK)(아래 4) 중 prodK(EMA 0.97 · "날씨 이벤트가 K 를 직접 때려 θ=4 로지스틱이 과잉반응하지 않게")와
//   fuelK(EMA 0.98 · "K 가 절벽 낙하하지 않게")는 신뢰 관성을 갖는데 slotK 만 계절 땅 배수(v2 `applyLandModifiers` — 겨울 물 0.85 · 사냥감 0.90 · 지력 0.80
//   · 날씨 · 풍흉)를 **그날 그대로** 받는다(자리 = `jobCapacity` 가 그날 땅으로 센다) ⇒ 12월 1일 K 가 하루에 떨어지고 로지스틱이 곳간과 무관하게 죽인다
//   (보고 T924 §2-b — 366일~ 곳간 찬 날 죽음 46~87% · K 를 묶은 칸 식량 자리 42~62% · 12~2월 42~67%).
//   `'1'` = slotK 가 땔감 K 와 **같은 꼴 · 같은 수**(`0.98 · 0.02` — `_fuelKema` 줄)의 관성을 갖는다(새 수 0 · 값 전체 — 영토가 늘어 자리가 는 날도 관성으로 따라간다).
//   `'season'` = 같은 꼴 · 같은 수의 관성을 **땅 배수에만** 건다 — v2 `applyLandModifiers` 가 원래 땅(`_origLand`)에 건 배수(계절 · 날씨 · 풍흉)가
//     자리에 준 몫 f = 그날 땅의 자리 ÷ 원래 땅의 자리(같은 함수 `totalFoodSlots` · 원래 땅의 size 는 그날 size — `restoreLand` 와 같은 규칙)에 관성을 걸고
//     slotK = 원래 땅의 자리 × 관성 f(영토가 는 날은 그날 바로 · 배수가 없는 판(`_origLand` 없음)은 f = 1 = 끔과 같은 K).
//   자리 함수(`totalFoodSlots`)는 그대로 — K 에 드는 값만 관성이고 자리 수를 쓰는 다른 문(영토 확장 판단 · 직업 자리)은 그날 자리 그대로다.
const T931_SLOTK_OFF = (typeof process !== 'undefined' && process.env && process.env.T931_SLOTK_EMA === '0');   // ★[T943] 되돌림 `=0` = 종전(T931 앞) 바이트
const T931_SLOTK_EMA = !T931_SLOTK_OFF && (typeof process !== 'undefined' && process.env && process.env.T931_SLOTK_EMA === '1');   // `'1'` = 값 전체(남김)
const T931_SLOTK_SEASON = !T931_SLOTK_OFF && !T931_SLOTK_EMA;   // ★[T943] 켬 기본 — 미설정 · 그 밖 · 브라우저(`process` 없음) = `'season'`
//   `'season'` 한 걸음 — K 4) 에서 그날 한 번(마을 틱 안 · 땅 배수가 걸린 채). 원래 땅의 자리는 같은 자리 함수를 원래 땅으로 한 번 더 부른다
//   (v.land 를 그 자리에서 잠깐 바꿔 끼우고 되돌린다 — 읽기만 · `effectiveLandSize` 메모는 size 열쇠라 같은 값).
function _t931SeasonSlot(v, raw) {
  let base = raw;
  const O = v._origLand, L = v.land;
  if (O && O !== L) {
    v.land = Object.assign({}, O, { size: L.size, baseSize: L.baseSize });   // `restoreLand` 와 같은 규칙 — 그날 size · baseSize 를 원래 땅에
    try { base = totalFoodSlots(v); } finally { v.land = L; }
  }
  const f = base > 0 ? raw / base : 1;
  v._slotKfEma = v._slotKfEma === undefined ? f : 0.98 * v._slotKfEma + 0.02 * f;   // 땔감 K 줄의 꼴 · 수
  return base * v._slotKfEma;
}
// ★★[T932 2026-10-26 · T923 회부 1] **대장장이가 하루를 다 제련에 쓴 날, 그 마을의 하루가 거기서 끝나던 결함** — 손잡이 `T932_SMELT_CONT`(켬 기본 · 되돌림 `=0` = 열셋째 판 바이트).
//   `tickVillage` 일하기 루프(`for (const npc of v.npcs)`) 안 대장장이 갈래의 `if (_smeltFrac >= 0.999) { workNPC(npc); return; }` 는
//   바로 위 주석(끊김① 해소 · 2026-08-01)이 적은 뜻 — "원석이 넘치는 날은 **그 대장장이가** 하루를 다 제련에 쓴다(주조 없음)" — 과 달리
//   `return` 이라 **마을 하루 전체**가 끝났다: 그 대장장이 뒤 차례 주민의 일 · 루프 뒤 꼬리(① 손으로 들여온 것 장부 · ② 먹기 · 마모 · 품질 EMA ·
//   ③ prodK · K · stat · ④ 땔감 · 주거 · 인구(출생 · 기근) · ⑤ 직업 전환 · ⑥ 나이)가 그날 안 돌았다(그 마을 사람은 그날 안 먹고 안 늙는다 · 보고 T932 ①).
//   켬 = `continue` — **그 대장장이만** 오늘 일을 끝낸다(주조 없음 = 종전 그 사람 몫 그대로) · 뒤 차례 주민 · 마을 하루 꼬리는 돈다(같은 루프의 다른 셋 —
//   교역 원정 · 징발 · 재고 상한 — 이 다 `continue` 인 것과 같은 꼴 · 새 수 0).
const T932_SMELT_CONT = !(typeof process !== 'undefined' && process.env && process.env.T932_SMELT_CONT === '0');
// ★★[T958 2026-10-28 · T946 회부 2 · 세션5] **집 행위 마을의 econ 주거는 크루가 실제로 지은 침상까지만 오른다** — 손잡이 `T958_HOUSE_REAL`(★[T966] 끔 기본 · 켜는 값 `'1'` · 끔 = 종전 바이트).
//   T400 은 집 짓는 마을(`buildActOn` — 서버가 `_t400Live` 를 심은 마을)에서 econ 주거의 목재 상한을 `Infinity` 로 두었다(차감은 크루가 진다).
//   그래서 econ 주거(`housing`)와 크루가 지은 집(맵 침상 `_mapBeds` = 완공 움집 칸 × 칸당 침상)이 따로 논다(보고 T958 ① — 90날 3시드:
//   econ 증축의 80 % 가 크루가 목재를 안 꺼낸 날이다 · 주거 > 침상 마을-날 2,439~2,547 · 주거 < 침상인데 게이트가 막은 마을-날 382~431).
//   켬 = 그 마을의 하루 증축을 `min(여유노동 몫 houseDayBuild, 지은 침상 − 주거)` 로 묶는다 ⇒ econ 주거는 지은 침상을 못 넘는다(넘은 몫은 지은 집이 아니다) ·
//     지은 침상 밑으로 노후된 만큼은 다시 채운다(그 집은 서 있다). 목재 차감은 종전대로 크루가 진다(econ 은 안 뺀다 — 이중 차감 0).
//   ⚠집터 방아쇠(`village-layout.houseSiteWant` — 목표 칸 = ⌈max(인구, 주거) ÷ 칸당 침상⌉ > 지은 칸)는 주거가 침상을 못 넘으면 영영 안 선다(인구 ≤ 주거 ≤ 침상).
//     그래서 켬이면 econ 이 그날 **올리고 싶었던 몫**(같은 함수 `houseDayBuild` — 새 수 0)을 `v._t958Want` 에 적고, 방아쇠(서버 한 줄)가 주거 + 그 몫을 읽는다
//     (랩에서 econ 주거가 오르면 집이 따라 서는 그 순서 — 오르고 싶은 날에만 집터가 선다).
//   켬 · 끔 다 집 행위가 아닌 마을(랩 · 서버 기준선 자 `T400_BUILD_ACT=0` · `_mapBeds` 없는 판)은 한 글자도 안 닿는다(종전 목재 상한 · 차감).
//   ★[T974 2026-10-28] 켬 기본(PM · 열일곱째 판 — T966 두 자리가 계획 주거 `_t958Plan` 을 읽는 판) · 되돌림 `T958_HOUSE_REAL=0`(= 종전 바이트) · 랩(브라우저 · 번들 shim 빈 env)도 켬.
const T958_HOUSE_REAL = !(typeof process !== 'undefined' && process.env && process.env.T958_HOUSE_REAL === '0');   // ★[T974 · PM 10-28] 켬 기본 · 되돌림 `=0`(★[T966] 끔 기본이던 글자 `=== '1'`)
// ★★[T1046 2026-11-01 · T1018 회부 1] 손잡이 `T1046_WOOD_SHARE`(끔 기본 · `'1'` 만 켬 · 끔 = 종전 글자 — 판 자 띠에서 첫해 기근이 서버 띠 밖이라 켬 기본으로 안 냈다 · 보고 T1046) — **나무꾼 안전망이 출생 문과 같은 주거 상한을 읽는다.**
//   주거 목재 안전망(`pickDeficitJob_rational` — 인구 ≥ 읽는 주거 × 0.95 · 곳간 목재 < 인구 × 2 → 나무꾼)은 랩에서 econ 주거를 읽는다 —
//   목재로 짓는 주거라 "집이 차서 출생이 막혔고 지을 목재가 없다"는 신호다(랩 출생 고르기의 나무꾼 절반이 이 줄 · 보고 T1046 ①).
//   집 행위 마을(서버)은 T966 뒤 이 줄이 계획 주거(`_t958Plan` — 목재 없이 오르는 칸)를 읽어 한 번도 안 선다(출생 고르기 0 · 랩 6.5%).
//   켜면 그 줄이 출생 문(`tickVillage` 출생 줄 `_hcap` — econ 주거 ∧ 지은 침상 `_mapBeds`)과 **같은 상한**을 읽는다(같은 식 · 새 수 0).
//   랩 · 집 행위 아닌 마을은 지은 침상 칸이 없어 상한 = econ 주거 = 종전 그대로다(바이트 같음).
const T1046_WOOD_SHARE = (typeof process !== 'undefined' && process.env && process.env.T1046_WOOD_SHARE === '1');
// ★★★[T1135 2026-11-04 · ★재민 11-03 판정] 손잡이 `T1135_FUEL_EQ`(끔 기본 · `'1'` 만 켬 · 끔 = 종전 바이트) — **땔감 평형**.
//   판정: 행위 층 벌목의 하루 몫은 `_woodOutLast = 나무꾼 × base × land.wood × 도구` 였다. `land.wood` 는 시딩 때 지도 숲 배수 칸을
//   한 번 센 수라 선 나무와 무관하다 — 그래서 T1107 의 k · 둘레 나무가 땔감을 못 바꿨다. 켜면:
//   ① 몫(T374 수요 문 `actDemandLeft` 의 분자 `D`) = 그 마을 그날 **땔감 수요** `fuelNeed`(아래 틱이 남기는 `_t1135Need` — 같은 문 · 분자만 바뀐다).
//      위끝 = 걸어서 닿는 **실제 나무**(생활층 벌목 고리 · 없으면 못 벤다) — 행위 층 마을에서 나무 칸이 0 이면 수식 목재도 안 낸다(`woodFormulaOff`).
//   ② 한 그루 땔감 w — 존 전리품 정본(`zone.js lootOfResource`)이 숲 무게 배수를 곱한다(그 파일 T1135 줄).
//   ③ 삭정이 · 고사목 줍기 — 생활층 헤드리스 나무꾼 하루(`server/villages.js` T1135 절 · 산 나무 안 벰).
//   ④ 1인 땔감 d = 고증 수(아래 `FIREWOOD_PC_SRC`) — `fuelNeed` · 짚 상한 · 하급 연료 몫 · 연료 K 의 1인 수요가 같은 한 함수 `_firewoodPC()` 를 읽는다.
//   ⑤ 재생 배수 k — `server/chunk.js REGROW.REGROW_K`(T1107 과 같은 자리 하나 · 손잡이 `T1135_REGROW_K` · 켬이면 k 미설정 = 1 — 종 시계 그대로 · 로지스틱 끔).
const T1135_FUEL_EQ = (typeof process !== 'undefined' && process.env && process.env.T1135_FUEL_EQ === '1');
//   ④ 고증 d — 1955년 남한 가정용 연료(나무와 가지 등) 약 1천만 ㎥(국가기록원 산림녹화 기록 "산림 황폐화 직접 원인"
//      https://theme.archives.go.kr/next/forest/background/immediateCausesOfDeforestation.do) ÷ 1955년 추계인구 21,526,374
//      (국가기록원 인구정책 통계 https://theme.archives.go.kr/next/populationPolicy/statisticsPopup_01.do) × 신갈나무 기본밀도 0.663 g/cm³
//      (Pyo et al. 2020 JESAM "Estimation of basic wood density … Quercus species in South Korea" https://ovcre.uplb.edu.ph/journals-uplb/index.php/JESAM/article/view/331)
//      ÷ 365 ÷ 1단 3 kg(`weights.js kgOf('wood')` — 하네스가 대조한다) = 0.2813단 ≈ 0.84 kg/인/일(지금 0.085단의 3.3배 · 출처 셋 · 새 수 0)
const FIREWOOD_PC_SRC = 10000000 / 21526374 * 663 / 365 / 3;
// ★★★[T1148 2026-11-04 · ★재민 11-04 T1135 ㄱ · 족보 746] 손잡이 `T1148_FUEL_JOB`(끔 기본 · `'1'` 만 켬 · 끔 = 종전 바이트) — **땔감도 생존 필요다.**
//   T1135: 켬 판 땔감 위끝은 나무가 아니라 나무꾼이었다 — 직업 판단이 거의 늘 기근 블록(식량 30일치 밑) 안이라 나무꾼 0 인 마을-날 43 ~ 62%.
//   ⇒ 직업 판단이 **추위 빚**을 식량 빚과 같은 꼴(며칠치)로 본다:
//     추위 빚 = 다가오는 겨울 끝까지의 땔감 수요 − 곳간 통나무 − 수입 기대
//       · 다가오는 겨울 끝까지 = 내일부터 다음 추위 철(`_coldStress` > 0 인 날들)이 끝나는 날까지 H 날(econ v2 기후 정본 `temperatureAt` 이 그 마을 고도로 미리 센다 · `v._t1148Ahead`)
//       · 땔감 수요 = 인구 × 1인 땔감 `_firewoodPC()` × (H + `FUEL_COLD_W` × Σ 추위) — 그날 연료 단계 `fuelNeed` 와 같은 식을 H 날 더한 것(취사 · 난방 · 제련 제외)
//       · 수입 기대 = 목재 수입 EMA(`_woodImportEMA` — 연료 K 가 읽는 그 칸) × H
//     땔감 며칠치 = 곳간 통나무 ÷ (하루 평균 수요 − 하루 수입 기대) · 식량 며칠치 = 식량 환산 ÷ 인구(하루 1)
//   ★같은 급 — 무엇이 먼저 사람을 다치게 하나로 고른다(새 수 0 · 기존 상수의 뜻 그대로):
//     · 땔감이 떨어진 날부터 바로 건강 항이 깎인다(`FUEL_HEALTH_W` × (1 − 충당률) · 추위면 수요가 ×(1 + `FUEL_COLD_W` × 추위) — 연료 단계)
//     · 식량이 떨어진 날부터는 빚이 쌓이고 죽음은 빚 `FD_DEATH_DAYS`(14일) 뒤에 온다(T1074)
//     ⇒ 추위 빚 > 0 ∧ 땔감 며칠치 < 식량 며칠치 + `FD_DEATH_DAYS` 면 나무꾼 — 식량 일보다 앞(기근 블록 앞 · 블록 안팎 같은 잣대).
//     · 하드 플로어 — 식량이 인구 × 6일치 밑이면 안 연다(기근 블록의 그 수 — 부얼타운 광부 · T717 한 명 문이 쓰는 그 수).
//     · 벨 나무 — 자리(`hasSlot`)가 없거나 행위 층에서 나무 칸 0 이면 안 연다(없으면 못 벤다).
//   ★갚는 길 — `T1135_FUEL_EQ` 판에서 나무꾼 몫(T374 문의 분자 `_t1135Need`)에 추위 빚 ÷ H 를 더한다(겨울 끝까지 고르게 쌓는다 · 새 수 0).
//     생활층 헤드리스 나무꾼은 베기 전에 삭정이부터 줍는다(`server/villages.js` T1148 줄 — "나무꾼(삭정이 줍기 포함)").
//   T717 한 명 문(`T717_FUEL_GATE`)은 이 문으로 갈음한다(그 손잡이는 끔 그대로 — 표에서 비교만).
// T1156: v2 supplies its existing basket planner; v1 never copies a value curve.
const T1156_SPECIALTY_JOB = typeof process !== 'undefined' && process.env && process.env.T1156_SPECIALTY_JOB === '1';
let _t1156Quote = null;
function setT1156Quote(fn) { _t1156Quote = fn; }
const T1148_FUEL_JOB = (typeof process !== 'undefined' && process.env && process.env.T1148_FUEL_JOB === '1');
function t1148Cold(v) {
  const A = v && v._t1148Ahead;
  if (!A || !v.storage) return null;
  const N = (v.npcs && v.npcs.length) || 0, H = A.H | 0;
  const need = N * _firewoodPC() * (H + FUEL_COLD_W * (A.cs || 0));
  const imp = (v._woodImportEMA || 0);
  const stock = v.storage.wood || 0;
  const debt = need - stock - imp * H;
  const perDay = H > 0 ? need / H - imp : 0;
  const fuelDays = perDay > 0 ? stock / perDay : Infinity;
  return { H, need, debt, fuelDays };
}
// ★★[T1054 2026-11-01 · T1047 ② · PM "짓는 것은 목재가 든다 · 같은 규칙"] **집 행위 마을의 노후 메움도 곳간 목재를 쓴다** — 손잡이 `T1054_DECAY_WOOD`(★끔 기본 · 켜는 값 `'1'` · 끔 = 종전 바이트 — 켬 기본 후보였으나 판 자 띠에서 첫해 기근이 커져 회부).
//   T958 마을(집 행위 · 지은 침상을 아는 판 — 서버 · 랩 T1050)은 econ 주거가 지은 침상까지만 오르고 목재 상한이 `Infinity` 다(차감은 크루가 진다).
//   그래서 노후(`HOUSE_DECAY`)로 줄어든 주거가 침상 밑에서 **목재 없이** 다시 찼다(보고 T1047 ② — 서버 첫해 노후 메움 3,095 · 목재 0).
//   켬 = 침상과 주거의 틈을 둘로 가른다: ⓐ 크루가 새로 지은 침상(이미 크루가 목재를 냈다 — 종전대로 목재 없이 찬다) ·
//   ⓑ 노후로 닳은 몫(`v._t1054Wear` — 날마다 그날 노후분을 더하고 틈을 넘지 않게 묶는다). 오늘 오르는 몫은 ⓐ 를 먼저 채우고,
//   ⓑ 를 채우는 몫(수리)은 곳간 목재가 있는 만큼만 오르고 econ 단가(`houseCostPerCap('wood')` — 크루 한 채 목재 ÷ 정원 · 랩 econ 이 쓰는 그 값)로 뺀다(새 수 0).
//   T958 밖 마을(랩 종전 · 서버 기준선 자 `T400_BUILD_ACT=0`)은 한 글자도 안 닿는다(그 마을은 이미 노후 메움에 목재를 낸다).
const T1054_DECAY_WOOD = (typeof process !== 'undefined' && process.env && process.env.T1054_DECAY_WOOD === '1');   // ★[T1054 판] 끔 기본(켜는 값 '1' · 끔 = 종전 바이트) — 켠 판 띠에서 첫해 기근이 커지고 인구 90 · 365 띠가 아래로 빠졌다(보고 T1054 ③ · 회부 1)
// ★[T932 · 계측 전용 · 행동 무관 · 저장 0] 그 갈래가 선 날을 센다 — 모듈 칸(마을 객체에 안 붙인다 — 저장 줄 무변). 관찰기 `scripts/t932-smelt-probe.js` 가 판 끝에 적는다.
//   days = 선 마을-날(같은 날 둘째 대장장이는 안 센다) · smiths = 선 대장장이-날 · left = 그 대장장이 뒤 차례 주민 · idle = 그중 교역 원정 · 징발이 아닌 사람(끔이면 그날 일을 못 한 사람)
//   · pop = 그 마을 인구(끔이면 그날 꼬리 — 먹기 · 나이 … — 를 못 탄 사람) · byV · byYear(0 = 1 ~ 365날)
const t932Stat = { days: 0, smiths: 0, left: 0, idle: 0, pop: 0, byV: Object.create(null), byYear: Object.create(null) };
const _t932Seen = new WeakMap();   // 마을 → 마지막으로 센 날(같은 마을-날 한 번)
function _t932Note(v, npc, day) {
  const S = t932Stat; S.smiths++;
  if (_t932Seen.get(v) === day) return;
  _t932Seen.set(v, day);
  const i = v.npcs.indexOf(npc); let left = 0, idle = 0;
  for (let k = i + 1; k < v.npcs.length; k++) { const n = v.npcs[k]; left++; if (!(n._tradingUntil && n._tradingUntil > day) && !n._warDraft) idle++; }
  S.days++; S.left += left; S.idle += idle; S.pop += v.npcs.length;
  const nm = v.name || '?'; const b = S.byV[nm] || (S.byV[nm] = { days: 0, idle: 0, pop: 0 }); b.days++; b.idle += idle; b.pop += v.npcs.length;
  const y = Math.floor((day - 1) / 365); S.byYear[y] = (S.byYear[y] || 0) + 1;
}
// ★★★[T400 2026-09-26] **집도 행위다 — 기본 끔.** 끄면 이 파일은 **넷째 판과 비트 동일**이다
//   (아래 두 자리가 전부 이 상수 뒤에 있다: 주거 증축의 자재 단가 · 곳간 출구 `actFromGranary`).
//   ① 자재의 정본은 **하나**다 — `server/hut-stages.js`(서버 움집 공정 · PM 권고 #61 · 재민 거부권).
//      켜면 한 채의 econ 자재 = 그 표의 원자재 중 **econ 재화인 것**(`RESOURCES` 에 있는 것 — 통나무 22 · 풀은 econ 재화가 아니다)
//      이고, 수용력 1인당 단가는 그것을 한 채의 정원(`village-layout` `HOUSE_CAP_PER_FLOOR × HOUSE_MAX_FLOORS`)으로 나눈 값이다.
//      ⇒ 석재 수요가 집에서 **사라진다**(표에 돌이 없다 · 광산 수요가 그만큼 준다 — 보고/T400 §ⓐ 3시드 표).
//      `HOUSE_WOOD`·`HOUSE_STONE` 은 끈 팔의 값이자 대조 자로 남는다(지우지 않는다).
//   ② 서버가 크루로 **실제로** 나르는 마을(`v._t400Live` — 생활층이 날마다 적는다)에서는 여기서 자재를 **안 뺀다** —
//      크루가 곳간에서 꺼낼 때(`actFromGranary`) 빠진다. 두 번 빼면 그게 유령이다.
//   켜기는 재민 — 이 카드는 값을 안 정한다.
const T400_BUILD_ACT = process.env.T400_BUILD_ACT !== '0';   // ★[T537 추신2 · 재민 캐논 09-30] 기본 켬(집 = 행위) · 되돌림 `T400_BUILD_ACT=0` = 넷째 판-c 비트 동일
let _hutMod, _vlMod;
function _hutStages() { if (_hutMod === undefined) { try { _hutMod = require('../server/hut-stages'); } catch (e) { _hutMod = null; } } return _hutMod; }
function _villageLayoutMod() { if (_vlMod === undefined) { try { _vlMod = require('../server/village-layout'); } catch (e) { _vlMod = null; } } return _vlMod; }
//   econ 재화만 남긴다 — 그 판정은 이 파일의 재화 목록(`RESOURCES`) 하나다(표 0 · 사본 0).
function _econOnly(raw) { const o = {}; for (const k of Object.keys(raw || {})) if (RESOURCES.indexOf(k) >= 0) o[k] = raw[k]; return o; }
// ★[T497 2026-09-28] 집 단가 팔 — 값 = 고증 기둥 수(`hut-stages.js HUT_PILLARS_ATTESTED` 의 수만 · 그 밖의 값·빈값 = 끔 = 표 그대로 22).
//   켬이면 econ 이 읽는 한 채·한 단계 원자재가 ② 기둥 수만 바뀐 표에서 나온다(기둥 2 → 통나무 10 · 4 → 16). 손잡이 한 자리.
//   ★[T537 추신2 · 재민 캐논 09-30] 기본 = 기둥 2(통나무 10 · 송국리형) · 되돌림 `T497_HUT_COST=0`(표 그대로 22) · 4 = 둘레 4기둥 판
const T497_HUT_COST = (() => { const raw = (typeof process !== 'undefined' && process.env && process.env.T497_HUT_COST); const x = parseInt(raw === undefined || raw === '' ? '2' : raw, 10); return Number.isFinite(x) ? x : 0; })();
function hutPillarsArm() { const H = _hutStages(); return (H && H.HUT_PILLARS_ATTESTED && H.HUT_PILLARS_ATTESTED.indexOf(T497_HUT_COST) >= 0) ? T497_HUT_COST : 0; }
// ★[T517 2026-09-29] 주춧돌 팔 — 켜면 기둥 하나에 주춧돌 하나(`hut-stages.js plinthKg` · 대평리 실측) · 돌 단위 = `weights.kgOf('stone')`(석괴 한 덩이).
//   끔(기본) = 표 그대로(석재 0 · 송국리형 고증과 같다). 기둥 수는 T497 팔이 있으면 그 수 · 없으면 표의 수. 손잡이 한 자리.
const T517_HUT_STONE = (typeof process !== 'undefined' && process.env && process.env.T517_HUT_STONE !== '0');
let _wtMod;
function _weightsMod() { if (_wtMod === undefined) { try { _wtMod = require('../server/weights'); } catch (e) { _wtMod = null; } } return _wtMod; }
function hutStoneUnits(i) {   // 단계 i 의 주춧돌(econ 돌 단위) — 팔이 꺼졌거나 표·무게를 못 읽으면 0
  if (!T517_HUT_STONE) return 0;
  const H = _hutStages(), W = _weightsMod();
  const kg = (W && typeof W.kgOf === 'function') ? W.kgOf('stone') : null;
  if (!H || !H.stageStoneKg || !(kg > 0)) return 0;
  const n = hutPillarsArm();
  return H.stageStoneKg(i, n || null) / kg;
}
function _withStone(o, units) { if (units > 0) o.stone = (o.stone || 0) + units; return o; }
function hutEconMaterials() {        // 한 채
  const H = _hutStages(); if (!H) return null; const n = hutPillarsArm();
  const o = _econOnly(n ? H.hutRawPillars(n) : H.hutRaw());
  if (!T517_HUT_STONE) return o;
  let st = 0; for (let i = 0; i < H.HUT_STAGES.length; i++) st += hutStoneUnits(i);
  return _withStone(o, st);
}
function hutEconStage(i) {        // 한 단계
  const H = _hutStages(); if (!H) return null; const n = hutPillarsArm();
  const o = _econOnly(n ? H.stageRawPillars(i, n) : H.stageRaw(i));
  return T517_HUT_STONE ? _withStone(o, hutStoneUnits(i)) : o;
}
function hutStageCount() { const H = _hutStages(); return H ? H.HUT_STAGES.length : 0; }
function hutCapPerHut() { const L = _villageLayoutMod(); return L ? L.HOUSE_CAP_PER_FLOOR * L.HOUSE_MAX_FLOORS : 0; }
//   수용력 1인당 자재 단가 — 끔이면 종전 상수, 켬이면 표에서 유도(표를 못 읽으면 종전 — 게이트가 안 열린 것과 같다)
function houseCostPerCap(res) {
  const legacy = res === 'wood' ? HOUSE_WOOD : (res === 'stone' ? HOUSE_STONE : 0);
  if (!T400_BUILD_ACT) return legacy;
  const m = hutEconMaterials(), cap = hutCapPerHut();
  if (!m || !(cap > 0)) return legacy;
  return (m[res] || 0) / cap;
}
function buildActOn(v) { return !!(T400_BUILD_ACT && v && v._t400Live); }
// ★[T488 2026-09-28] 집이 오늘 올릴 수 있는 양(수용력 인분 · **목재 제약 전**) — 모자란 집(`N × HOUSE_BUFFER − housing`)과
//   여유노동 상한(`N × HOUSE_BUILD_MAX × slack` · slack 은 곳간 식량 여유) 중 작은 쪽. 집 증축 절이 이것에 목재 제약을 얹고,
//   숯가마의 "잉여 통나무"는 이것 × 통나무 단가를 **집 몫**으로 먼저 뺀다(`houseWoodShare`) — 같은 함수 · 새 수 0.
function houseDayBuild(v, N, fe) {
  const houseTarget = N * HOUSE_BUFFER;
  if (!(v.housing < houseTarget)) return 0;
  const slack = fe > N * 40 ? 1.0 : (fe > N * 25 ? 0.5 : 0.15);
  return Math.min(houseTarget - v.housing, N * HOUSE_BUILD_MAX * slack);
}
//   집 몫(통나무) — 숯가마가 태우지 말고 남겨 둘 양. ★집(T400)이 끔이면 0 = 숯가마 종전 그대로(비트 동일 · 손잡이 0).
function houseWoodShare(v) {
  if (!T400_BUILD_ACT || !v || !v.npcs || v.housing === undefined) return 0;
  return houseBuildWant(v, 'wood');
}
//   ★[T1213] 그날 집이 올릴 양(`houseDayBuild` — 목재 제약 전) × 자재 단가(`houseCostPerCap` — T400 끔이면 종전 상수 HOUSE_WOOD · HOUSE_STONE).
//     집 몫(위 · T400 켬만)과 짓는 파생수요(아래 `buildInputTarget` — 집 행위가 꺼진 판도 econ 이 곳간 목재로 짓는다)가 같은 몸통을 부른다(사본 0).
function houseBuildWant(v, res) {
  if (!v || !v.npcs || v.housing === undefined) return 0;
  const N = v.npcs.length;
  return houseDayBuild(v, N, totalFoodEquivalent(v)) * houseCostPerCap(res);
}
// ★[T537 2026-09-30] 통나무 **잉여** — T488 숯가마 식을 함수 하나로 뺐다(재고 − 비축 `RESERVE_PC.wood × 인구` − 집 몫 `houseWoodShare`).
//   숯가마(`kilnDay`)와 다리 크루(villages `_t527BridgeDay`)가 **같은 함수**를 부른다 — 사본 0 · 새 상수 0 · 숯가마 산술 불변(같은 순서의 같은 뺄셈).
function woodSpare(v) {
  if (!v || !v.storage) return 0;
  const N = (v.npcs && v.npcs.length) || 0;
  const reserve = (RESERVE_PC.wood || 0) * N;
  return (v.storage.wood || 0) - reserve - houseWoodShare(v);
}
// ══ ★★[T1213 2026-11-07 · T1207 회부 2 · ★재민 11-07 "나무나 돌 공급량을 늘려줘야겠네"] 땅의 차례 · 짓는 파생수요는 목표에 **더한다** ══
//   T1207 켬 판(11-04c 3시드 × 800날): 넓히려 한 날의 99.6% 가 통나무 막힘 · 나무꾼 −20% — 말뚝 모자람이 v2 목표에서 생존 목표와 **큰 쪽**으로만
//   합쳐져(`max`) 값이 안 움직였다. 이 절은 T1207 이 켜진 판에서만 선다(`T1207_TERR_REAL=1` · 끔 = 이 절 전부 0 = 종전 비트).
//   `T1213_DERIV_ADD=0` 은 재는 자 전용(T1207 켬 · 이 절 끔 — 카드 T1213 의 앞 판을 같은 판 자로 잰다).
const T1213_ON = (typeof process !== 'undefined' && process.env && process.env.T1207_TERR_REAL === '1' && process.env.T1213_DERIV_ADD !== '0');
//   ① 땅의 차례 — 1인 비축 → 집 몫 → **땅 몫**(그날 못 치른 말뚝 `_t1207Need` — 서버 생활층이 적는다) → 숯가마 · 다리.
//     땅(말뚝)은 `woodSpare`(비축 · 집 몫 뒤)를 그대로 쓰고, 숯가마 · 다리 크루는 땅 몫까지 뺀 잉여를 쓴다(배수 0 · 순서만).
function landWoodShare(v) { return (T1213_ON && v && v._t1207Need > 0) ? v._t1207Need : 0; }
function woodSpareAfterLand(v) { return woodSpare(v) - landWoodShare(v); }
//   ② 짓는 파생수요(econ 재화 단위) — 생존(땔감 · 1인 0.05)과 **다른 쓰임**이라 v2 목표에 큰 쪽이 아니라 **합**으로 얹는다(`economy-sim-v2` 목표 세 자리).
//     통나무 = 말뚝(`_t1207Need`) + 집(`houseBuildWant`) + 다리(남은 단계 몫 `_t1213Bridge` — 서버 생활층이 적는다) + 숯(노가 쓸 숯의 모자람을 구울 통나무 —
//     숯 파생수요 `derivedInputTarget('charcoal')` 와 같은 목표 · 숯가마가 있으면 숯가마 배치(통나무 3 → 숯 4) · 없으면 노천 탄화(숯 1 = 통나무 3 ÷ 2)).
//     돌 = 집(`houseBuildWant`) + 다리. 석기 · 구리 · 숯 자체의 파생수요는 그 재화의 흐름과 같은 쓰임이라 종전 `max` 그대로(이 항 밖).
function buildInputTarget(v, r) {
  if (!T1213_ON || !v || !v.storage) return 0;
  const br = v._t1213Bridge || null;
  if (r === 'wood') {
    let t = (v._t1207Need > 0 ? v._t1207Need : 0) + houseBuildWant(v, 'wood') + ((br && br.wood) || 0);
    const chT = derivedInputTarget(v, 'charcoal');
    const gap = chT - (v.storage.charcoal || 0);
    const S = gap > 0 ? _smeltUses() : null;
    if (S) {
      const wpc = v._kiln ? S.woodPerCharcoalKiln() : S.woodPerCharcoal();   // 정본 두 식(숯가마 · 노천 탄화) — 옮겨 적지 않는다
      if (wpc > 0) t += gap * wpc;
    }
    return t;
  }
  if (r === 'stone') return houseBuildWant(v, 'stone') + ((br && br.stone) || 0);
  return 0;
}
//   ★곳간 **출구** — `actToGranary` 의 역. 크루가 집터로 들고 가는 자재가 여기서 빠진다(있는 만큼만 · 세금 없음 — 마을 제 것이다).
//     흐름 EMA 는 종전 주거 갈래가 찍던 **그 칸**(`_cons(v, 'wood', …)`)에 찍는다 — 수요 신호가 같은 자리에서 나온다.
// ══ ★★[T419 2026-09-26] 돌 쓰는 실물 — econ 이 같은 물건을 만드는 세 자리의 단가를 서버 표에서 유도(손잡이 기본 끔) ══
//   정본 `server/stone-uses.js`(작업대 정품 장비 재료 수 · 조잡한 석기 세 종). 끔이면 아래 함수는 **안 불린다**(종전 수 · 비트 동일).
//   ① 석공 간석기 한 자루 = 돌 `EQUIP_MAT_QTY.tool` · ② 마제석검 한 자루 = 돌 `EQUIP_MAT_QTY.weapon` ·
//   ③ 자급 막석기 한 자루 = 조잡한 석기 세 종 평균(econ 재화만 — 자갈·잔가지 · 풀은 econ 재화가 아니다) · 돌 0 ·
//   ④ 철검의 돌 = 0(작업대 무기는 재료 **한 가지** — 철검에 돌이 안 든다 · 철 수는 이 카드 밖 · 회부).
const T419_STONE_REAL = process.env.T419_STONE_REAL === '1';   // T1181 유보: 실물 단위 수율 미확인 · 3시드 빈 마을43 · 보고 참조
let _stoneMod;
function _stoneUses() { if (_stoneMod === undefined) { try { _stoneMod = require('../server/stone-uses'); } catch (e) { _stoneMod = null; } } return _stoneMod; }
function stoneRealPer(kind) {   // 한 개당 재료(econ 재화만) — kind: 'tool' | 'stoneSword' | 'crude'
  const S = _stoneUses(); if (!S) return null;
  const raw = kind === 'tool' ? S.perTool() : kind === 'stoneSword' ? S.perStoneSword() : kind === 'crude' ? S.perCrudeTool() : null;
  return raw ? _econOnly(raw) : null;
}
function stoneRealOn() { return T419_STONE_REAL && !!_stoneUses(); }
// 계획도 같은 한 작업일의 실제 투입량을 읽는다. 옛 0.2 재료 문턱은 OFF에만 남긴다.
function stoneWorkStock(v) {
  if (!stoneRealOn()) return STONE_NET_STOCK;
  let skill = 0;
  for (const n of (v && v.npcs) || []) if (n.currentJob === 'mason') skill = Math.max(skill, n.skills?.masonry || 0);
  return (stoneRealPer('tool').stone || 0) * JOBS.mason.base * (1 + skill * 0.05);
}

// ══ ★★[T435 2026-09-27] 곳간 증설도 재료를 낸다 — 정본 `server/granary-stages.js`(판자 12·돌 8 → 통나무 6·돌 8) · 손잡이 기본 끔 ══
//   켬이면 NPC 크루가 이 곳간 출구(`actFromGranary`)로 재료를 꺼내 곳간 터에 놓는다(villages.js `_t435GranaryDay`). 끔 = 한 줄도 안 돈다.
const T435_GRANARY_ACT = process.env.T435_GRANARY_ACT !== '0';
let _granMod;
function _granaryStages() { if (_granMod === undefined) { try { _granMod = require('../server/granary-stages'); } catch (e) { _granMod = null; } } return _granMod; }
function granaryEconMaterials() { const G = _granaryStages(); return G ? _econOnly(G.granaryRaw()) : null; }   // 한 동(econ 재화만)
// ══ ★★[T527 2026-09-29] 다리도 행위다 — 정본 `server/bridge-stages.js`(테스트우드 청동기 다리 실측에서 유도) · 손잡이 기본 끔 ══
//   켬이면 착공 후보(존 설정 `bridgeSites` — 계획기 v2 셀 그대로)를 그 섬 마을의 여유 크루가 이 곳간 출구로 자재를 꺼내 날라 짓는다
//   (villages.js `_t527BridgeDay`). 끔 = 한 줄도 안 돈다 · 시딩 다리 비트 동일. econ 은 문만 연다(자재 표는 서버가 읽는다).
const T527_BRIDGE_ACT = process.env.T527_BRIDGE_ACT !== '0';
// ★[T537 추신2 · 재민 캐논 09-30] 지름길 다리 후보(존 설정 `bridgeShortcuts` — 계획기 v2 지름길 규칙)도 짓는 목록에 넣는다 · 기본 끔 · `T527_BRIDGE_ACT` 가 켜져야 뜻이 있다.
const T537_SHORTCUT = process.env.T537_SHORTCUT === '1';
// ★[T1207 2026-11-07] 영토 말뚝도 같은 곳간 출구로 꺼낸다(서버 `villages.js _t1207Batch` · 손잡이는 서버와 같은 이름 하나 · `=1` 만 켬 · 끔 = 종전 — 위 셋이 다 꺼지면 0)
const T1207_TERR_ACT = (typeof process !== 'undefined' && process.env && process.env.T1207_TERR_REAL === '1');   // 끔 기본(서버 손잡이와 같은 글자 — 보고/T1207 §3)
function actFromGranary(v, item, units, deferUse = false) {
  if (!(T400_BUILD_ACT || T435_GRANARY_ACT || T527_BRIDGE_ACT || T1207_TERR_ACT) || !v || !v.storage) return 0;   // ★[T527] 다리 크루도 같은 출구(셋 다 끔 = 종전 그대로 0)   // ★[T435] 곳간 증설 크루도 같은 출구를 쓴다(둘 다 끔 = 종전 그대로 0)
  const want = (typeof units === 'number' && units > 0) ? units : 0;
  const have = v.storage[item] || 0;
  const take = Math.min(want, have);
  if (!(take > 0)) return 0;
  v.storage[item] = have - take;
  if (!deferUse) _cons(v, item, take);
  return take;
}
// T1181: 운반 중 재료는 소비가 아니다. 현장에 놓은 양만 같은 소비 장부로.
function actMaterialsPlaced(v,item,n) { if(v && n>0) _cons(v,item,n); }
function returnActMaterials(v,item,n) { if(v && v.storage && n>0) v.storage[item]=(v.storage[item]||0)+n; }
// ══ ★★[T1050 2026-11-01 · ★재민 11-01 "서버 집 규칙이 정본"] 집 크루 하루 — 정본 한 벌(서버 생활층 · 랩이 같은 함수) ══════════════
//   서버 `villages.js _t400BuildDay` 의 몸통(곳간 → 손 → 왕복 → 집터 `mat` → 자재 · 시공이 차면 그 순간 단계)을 **글자 그대로** 여기로 옮겼다.
//   서버는 몸(명부 앞 `LIFE_CREW` 명) · 걸음(`_t341TripsPerDay`) · 단계 올림(`_lifeAdvanceSite`)을 넘기고, 랩(몸 없는 마을 · 아래 `labHouseDay`)은
//   일꾼 날수(크루 `min(LIFE_CREW, 인구)` · 손만 있는 자리)를 넘긴다. 자재 · 짐 · 시공 · 곳간 출구는 한 줄도 안 갈린다(사본 0 · 새 수 0).
//   곳간 출구는 **내보낸 칸**(`module.exports.actFromGranary`)으로 부른다 — 관찰기(t875 · t958 · t479)가 그 칸을 감싸 크루가 꺼낸 몫을 센다(종전 서버 `E.actFromGranary` 와 같은 칸).
let _carryMod;
function _carryCfgMod() { if (_carryMod === undefined) { try { _carryMod = require('../server/carry'); } catch (e) { _carryMod = null; } } return _carryMod; }
//   한 짐 = ⌊CAP_KG ÷ kgOf(item)⌋(최소 1) — 서버 `_t400PerLoad` 를 옮겼다(그 함수는 이제 이것을 부른다 · 통나무 25 ÷ 3 = 8).
function crewPerLoad(item) {
  const cc = _carryCfgMod(), W = _weightsMod();
  const cap = (cc && cc.CFG && cc.CFG.CAP_KG) || 0;
  const kg = (W && W.kgOf) ? (W.kgOf(item) || 0) : 0;
  if (!(cap > 0) || !(kg > 0)) return 1;
  const n = Math.floor(cap / kg);
  return n > 0 ? n : 1;
}
//   s2 = 집터 `{ stage, mat }` · crew = 손(`inventory`)을 가진 크루 배열 · labor = 오늘 시공 단계 수(크루 × `LIFE_STAGE_PDAY` — 두 수는 서버 `villages.js` 정본 · 부르는 쪽이 준다) ·
//   tripsEach = 한 사람 하루 왕복 상한 · perLoad(item) = 한 짐(서버 = `_t400PerLoad` · 랩 = `crewPerLoad` — 앞의 것이 뒤의 것을 부른다 · 같은 수) · roundS = 한 왕복 걸음초(계측) ·
//   dbg = 그날 계측 칸(trips · took · placed · adv · stall · walkS 를 더한다) · advance() = 단계 하나 올림 → 집터가 아직 서 있으면 true(완공 · 사라짐 = false)
function houseCrewDay(v, s2, crew, labor, tripsEach, perLoad, roundS, dbg, advance) {
  const left = crew.map(() => tripsEach);
  let rr = 0, alive = true;
  if (!s2.mat) s2.mat = {};
  while (alive && labor > 0) {
    const need = hutEconStage((s2.stage | 0)) || {};
    // ⓐ 모자란 자재를 나른다 — 짐 하나씩(곳간 → 손 → 걸음 → 집터)
    let short = false;
    for (const k of Object.keys(need)) {
      while ((s2.mat[k] || 0) < need[k]) {
        let ci = -1;
        for (let q = 0; q < crew.length; q++) { const i = (rr + q) % crew.length; if (left[i] > 0) { ci = i; break; } }
        if (ci < 0) { short = true; break; }                         // 오늘 걸음을 다 썼다
        //   ★짐은 **꽉 채워** 든다 — 이 단계 모자란 몫이 아니라 **이 집에 남은 몫**까지(T361 §ⓑ). 남은 몫도 표에서 읽는다(사본 0).
        let rem = 0; for (let i = (s2.stage | 0); i < hutStageCount(); i++) rem += ((hutEconStage(i) || {})[k] || 0);
        const want = Math.min(perLoad(k), rem - (s2.mat[k] || 0));
        const took = module.exports.actFromGranary(v, k, want);      // ★곳간 → 손(econ 정본 한 함수 · `actToGranary` 의 역)
        if (!(took > 0)) { short = true; dbg.stall = 1; break; }     // 곳간이 비었다 — 기다린다(그게 세계다)
        const c = crew[ci];
        if (!c.inventory) c.inventory = {};
        c.inventory[k] = (c.inventory[k] || 0) + took;               // 손에 든다
        left[ci]--; rr = ci + 1; dbg.trips++; dbg.took += took; dbg.walkS += roundS;
        c.inventory[k] = Math.max(0, (c.inventory[k] || 0) - took);  // 집터에 놓는다(손은 빈다 — 날을 넘겨 들고 있지 않다)
        s2.mat[k] = (s2.mat[k] || 0) + took; dbg.placed += took;
      }
      if (short) break;
    }
    if (short) break;
    // ⓑ 자재가 찼다 — 시공(한 사람 하루 `LIFE_STAGE_PDAY`)이 남아 있으면 **이 순간** 단계가 오른다
    for (const k of Object.keys(need)) s2.mat[k] = (s2.mat[k] || 0) - need[k];
    labor--; dbg.adv++;
    alive = advance();
  }
  return dbg;
}
// ★★[T1050] **몸 없는 랩 마을의 집** — 손잡이 `T1050_LAB_HOUSE`(랩 기본 켬 후보 · `=0` = 종전 셈 주거 = 바이트 같음 · 브라우저 shim 빈 env = 켬).
//   서버 생활층이 econ 틱 **뒤** 마을마다 하는 집 네 줄을 같은 차례로 한다(서버 `villages.js` 하루 생활층 · 기본 손잡이 그대로):
//     ① 침상(T315 `_mapBedsOf`) = 지은 집 칸 × `HOUSE_CAP_PER_FLOOR`(움집 단층) → econ `_mapBeds`
//     ② 방아쇠(T219 · T958) = `houseSiteWant(인구, 주거 + 그날 올리고 싶던 몫 _t958Want, 지은 칸, 집터 유무)` → 집터 `{ stage: 1 }`(서버 `_lifeAddHouseSite` 가 세우는 그 단계)
//     ③ 크루 하루(T400 `_t400BuildDay`) = `_t400Live` 를 적고(econ 이 집 목재를 추상 차감하지 않는다 · 주거 = 지은 침상까지 · T958) 위 `houseCrewDay` 를 부른다
//        크루 = 명부 앞 `min(LIFE_CREW, 인구)` 명의 **일꾼 날수**(랩엔 몸이 없다 — 손만 있는 자리) · 시공 = 크루 × `LIFE_STAGE_PDAY` · 왕복 상한 = 없음(랩엔 곳간 · 집터 자리가 없다 —
//        서버 판 낮엔 한 사람 하루 중앙 43왕복 ↔ 한 채 2짐이라 서버에서도 묶지 않는다 · 보고 T400 §ⓒ · T1050 ①)
//     ④ 완공(`_lifeAdvanceSite` → `_lifeCompleteHouse`) = 단계가 공정 끝(`hutStageCount()` — 서버 글자 `stage <= 3` 의 그 수)을 넘으면 집 칸 +1 · 집터 없음
//   ⚠땅이 없는 자리 — 서버 `_lifeAddHouseSite` 는 영토 칸 · 물 · 농지 거름으로 집터를 못 찾으면 안 세운다(정지 마을). 랩 t17 엔 영토 칸이 없어 늘 선다(보고 T1050 §1 회부).
//   붙이는 문은 `labHouseAttach(v, 시딩 집 칸, { crew: LIFE_CREW, pday: LIFE_STAGE_PDAY })` 하나 — 자 t17 · t176 이 `layout.houses` 칸 수(서버 `_houseCells` 시딩과 같은 칸)와
//     서버 정본 두 수(`villages.js` 의 그 두 상수 · `__labProbe._t400Probe.LIFE_CREW` · `.LIFE_STAGE_PDAY` 로 읽는다 — 사본 0)를 준다. 안 붙인 마을(서버 · 다른 자 · 랩 HTML)은 한 글자도 안 닿는다.
//   ★[T1056] 랩 HTML 둘(마을실험실 · 전쟁실험실)의 생활층 집 고리도 이 손잡이를 읽는다(켬 문 `_t1056H` — 켬 = 마을 집터를 아래 `labSiteCrewDay` 가 짓는다 · 끔 = 종전 셋째 규칙 = 종전 바이트).
const T1050_LAB_HOUSE = !(typeof process !== 'undefined' && process.env && process.env.T1050_LAB_HOUSE === '0');
function labHouseAttach(v, cells0, life) {
  if (!T1050_LAB_HOUSE || !T400_BUILD_ACT || !v || !life || !(life.crew > 0) || !(life.pday > 0)) return false;
  v._t1050 = { cells: (cells0 | 0), site: null, crew: life.crew, pday: life.pday, sum: { days: 0, crewDays: 0, trips: 0, took: 0, adv: 0, stallDays: 0, built: 0 } };
  return true;
}
function labHouseDay(v) {
  const H = v && v._t1050;
  if (!H || !T1050_LAB_HOUSE || !T400_BUILD_ACT) return null;
  const L = _villageLayoutMod(); if (!L) return null;
  const N = (v.npcs && v.npcs.length) || 0;
  v._mapBeds = H.cells * L.HOUSE_CAP_PER_FLOOR;                                                         // ① 침상
  if (!H.site && L.houseSiteWant(N, v.housing + ((T958_HOUSE_REAL && v._t958Want > 0) ? v._t958Want : 0), H.cells, H.site ? 1 : 0)) H.site = labSiteNew({});   // ② 방아쇠 → 집터
  v._t400Live = true;                                                                                    // ③ 크루 하루(서버 `_t400BuildDay` 머리 그 줄)
  const dbg = labCrewDbg();
  const s2 = H.site; if (!s2) return dbg;
  labSiteCrewDay(v, s2, H.crew, H.pday, dbg, () => { H.cells++; H.site = null; H.sum.built++; });
  const U = H.sum; U.days++; U.crewDays += dbg.crew; U.trips += dbg.trips; U.took += dbg.took; U.adv += dbg.adv; U.stallDays += dbg.stall;
  return dbg;
}
// ★★[T1056 2026-11-01 · T1050 회부 2] **몸 없는 크루의 집터 하루** — 위 `labHouseDay`(랩 자 t17 · t176)와 랩 HTML 둘(마을실험실 · 전쟁실험실 생활층 집 고리)이
//   **같은 함수**를 부른다(사본 0 · 새 수 0). 몸통은 `labHouseDay` ③④ 를 글자 그대로 뺐다(t17 · t176 판 바이트 같음):
//     크루 = 명부 앞 `min(LIFE_CREW, 인구)` 명의 일꾼 날수(손만 있는 자리) · 시공 = 크루 × `LIFE_STAGE_PDAY` · 왕복 상한 = 없음 · 한 짐 = `crewPerLoad`
//     ④ 단계가 공정 끝(`hutStageCount()` — 서버 글자 `stage <= 3` 의 그 수)을 넘으면 `done()`(부르는 쪽의 완공 — t17 = 집 칸 +1 · 랩 HTML = 그 집 층 +1)
//   s2 = 집터(`stage` · `mat` 를 쥔다 — 랩 HTML 은 제 집 객체 그대로) · crewMax · pday = 서버 정본 두 수(`villages.js` `LIFE_CREW` · `LIFE_STAGE_PDAY` —
//   t17 은 `__labProbe._t400Probe` 로 · 랩 HTML 은 번들이 그 두 줄에서 구운 `EconEngine.LifeCrew` 로 받는다)
function labCrewDbg() { return { crew: 0, trips: 0, perTrip: 0, took: 0, placed: 0, adv: 0, stall: 0, walkS: 0 }; }   // 그날 계측 칸(`houseCrewDay` 가 더한다 — 서버 `_t400Dbg` 의 그 칸들)
function labSiteNew(s2) { if (!(s2.stage > 0)) s2.stage = 1; return s2; }   // 서버 `_lifeAddHouseSite` 가 세우는 그 단계(`stage: 1` — ①굴착을 마친 집터)
function labSiteCrewDay(v, s2, crewMax, pday, dbg, done) {
  const N = (v.npcs && v.npcs.length) || 0;
  const n = Math.min(crewMax, N); if (!n) return dbg;
  labSiteNew(s2);
  const crew = []; for (let i = 0; i < n; i++) crew.push({ inventory: {} });
  dbg.crew = n; dbg.perTrip = Infinity;
  houseCrewDay(v, s2, crew, n * pday, Infinity, crewPerLoad, 0, dbg, () => {
    s2.stage++;
    if (s2.stage < hutStageCount()) return true;                                                         // ④ 완공 — 서버 `stage <= 3` 그 경계
    done(); return false;
  });
  return dbg;
}
function labHouseWorldDay(world) {   // 하루 끝(econ 틱 뒤 — 서버 생활층 차례) · 붙인 마을만
  if (!T1050_LAB_HOUSE || !T400_BUILD_ACT || !world || !world.villages) return;
  for (const v of world.villages) if (v && v._t1050) labHouseDay(v);
}
// ★★★[T374 2026-09-23] **채취는 수요가 멈춘다 — 기본 끔**(★[T544 추신] 2026-09-30 기본 켬 · 아래).
//   설계_생산_실체 ⓓ 는 *"옮긴 첫날 하루 합 = 수식 · 그 뒤로는 실체가 내는 만큼(강이 멀면 덜 잡는다)"* 이라
//   적었다. 그 문장엔 **반대쪽 절반**이 빠져 있었다: 실체가 **더** 낼 수 있어도 마을은 **쓸 만큼만** 딴다.
//   T359 가 그 빈칸의 값을 보여 줬다 — 군락을 깔자 채집이 수식의 **44배**를 내고 숲이 한 철에 절반이 됐다.
//   멈출 이유가 캐논에 없던 게 아니라 **코드에 없었다.**
//   ★그리고 멈출 자리의 수는 **이미 정본에 있다**: 그 마을이 그날 수식으로 내는 몫(`D`).
//     채집 `_forageOutLast × _t347MixShare` · 나무 `_woodOutLast` · 물고기 `_fishOutLast` — 전부 관측 칸이다.
//   ⇒ **새 수 0.** 상한은 지어낸 값이 아니라 *"수식이 그날 내겠다고 한 그 양"* 이다.
//   ★★[T544 추신 ⓐ 2026-09-30 · 재민 #94 "추상 없애기 · 실물이 정본"] **기본 켬** — `0` 만 끔(되돌림 `T374_DEMAND_STOP=0`).
//     T544 ② 뒤라 곳간이 안 받은 몫은 짐·손에 남는다(소멸 0) · 행위 층(어부 T312 · 나무꾼 T325 · 채집 T347)이 꺼진 세계는
//     이 문을 부르는 쪽이 없어 **바이트 무변**이다(두 자 3시드 · 랩 — 행위 손잡이가 전부 `=== '1'`).
const T374_DEMAND_STOP = process.env.T374_DEMAND_STOP !== '0';
// ★★★[T368 2026-09-25] **농부 행위 완성 — 기본 끔.** 재민 09-23: *"농부가 직접 밭 갈고 수확하는 순간 해당
//   작물이 플러스되기로 했잖아. 우리 모든 추상을 없애기로 했잖아."* 남은 추상이 둘이었다:
//   ① 수확이 **품목 없는 식량등가**(`T100_K`)로 들어갔다 — 어떤 작물이었는지가 안 왔다(캐논 0-b "뭉뚱그린 품목 없음").
//      ⇒ 켜면 **그 밭의 작물이 작물 표의 수확량으로** 곳간에 든다: `harvestToGranary(v, n, mul, crop)` 의 `n` 은
//        건수가 아니라 **그 작물의 낱개**다(`crops.harvestUnits` × 그 칸의 품질 — 부르는 쪽이 정본에서 낸다).
//      ⚠econ 이 아는 작물은 34종 중 **셋**(생곡 `wheat·rice·barley` — `RAW_GRAIN_FOOD_FACTOR`)뿐이다. 나머지의
//        식량 값은 **열량 정본**(`server/kcal.js econUnitsOf` = kg × kcal/kg ÷ `DAY_KCAL` — T59)이 답하고,
//        생활층이 그 표를 세계에 **주입**한다(`world.cropFoodEq` — T347 `forageActItems` 선례 · econ 은 서버 모듈을
//        안 부른다 · 새 수 0). econ 이 이미 아는 품목은 **econ 정본 그대로**다(주입 표가 덮지 않는다 · 이중 0).
//   ② 관측자 없는 마을의 밭은 몸 없이 일괄이었다(`_lifeHeadlessDay`) — 켜면 **농부가 걷는다**(생활층 · 걷기 술어).
//   ⚠**`T100_K` 는 안 지운다** — 끈 팔의 입구 그대로이고, 켠 팔에서는 **대조 자**다(보고 §표 — 작물 표 ↔ 앵커).
//   ⚠끄면 **넷째 판 비트 동일** — 아래 자리가 전부 이 상수(와 켠 팔만 심는 주입 표) 뒤에 있다.
//   켜기는 재민 — 이 카드는 값을 안 정한다.
const T368_FARM_ACT = process.env.T368_FARM_ACT === '1' || T1243_FARM_ON;   // ★[T1243] 묶음
// ★[T1221 2026-11-08] 농사 일손 한도 · 비옥 범위 — 손잡이 하나(끔 기본 · `=1` 켬). econ 은 값을 안 쓴다 — 생활층(`villages.js` 칸 일 시간)과 작물 정본(`crops.js` 비옥 범위)이 이 한 곳을 읽는다.
const T1221_FARM_LABOR = ((typeof process !== 'undefined' && process.env) ? process.env.T1221_FARM_LABOR === '1' : false) || T1243_FARM_ON;   // ★[T1243] 묶음
// ★★[T368] econ 이 **모르는** 작물과 그 식량 값 — 주입 표에서 econ 이 아는 품목(생곡·채집·보존식)을 **뺀** 목록.
//   주입이 없거나 손잡이가 꺼져 있으면 `null` ⇒ 아래 세 자리(재고 환산 · 생산 환산 · 사다리)가 **아무것도 안 한다**.
//   ⚠순서는 주입 표 순서(작물 정본 `crops.IDS` — 이름순)다. 사다리가 그 순서로 먹는다(결정론 · 새 규약 0).
function _t368Crops(v) {
  const W = (T368_FARM_ACT && v) ? v._world : null;
  const T = W ? W.cropFoodEq : null;
  if (!T) return null;
  if (W._t368Own && W._t368OwnOf === T) return W._t368Own;
  const own = [];
  for (const r of Object.keys(T)) {
    const f = +T[r] || 0;
    if (f > 0 && !(_t86Factor(r) > 0) && PRESERVED_FOODS.indexOf(r) < 0) own.push([r, f]);
  }
  W._t368OwnOf = T;
  return (W._t368Own = own);
}
// ★[T368] 작물 낱개 하나의 **식량등가** — econ 이 아는 품목은 econ 정본(생곡 = 도정 수율 · `totalFoodEquivalent` 와 같은 규칙),
//   모르는 품목은 주입된 열량 정본. 특용(삼·쪽·뽕·차)은 열량 0 이라 0 이다(품목은 곳간에 들고 식량은 아니다).
function _t368FoodPer(v, crop) {
  const f = _t86Factor(crop);
  if (f > 0) return (RAW_GRAINS.indexOf(crop) >= 0 && !T73_RAWGRAIN) ? 0 : f;
  const W = v ? v._world : null, T = W ? W.cropFoodEq : null;
  return (T && T[crop] > 0) ? +T[crop] : 0;
}

// 마을 하루 농사 **용량**(부양력 prodK 가 읽는 밑변) — 두 세계가 이 함수 하나로 갈린다.
//   켜면 **앵커 그 자체**다: 농부 1인은 하루에 `N` 사람 몫을 낸다(= N × 하루 1인 식량).
//   ⚠**곳간 유입은 여기서 나오지 않는다.** 4판의 산출 자리는 `server/villages.js` `_lifeDoTask0`
//     수확 갈래 **한 곳**이다(실제 수확 × `T100_K`). 이 함수는 **용량만** 답한다 —
//     K 가 밭보다 헐거우면 인구가 밭 없이 부푼다(3판 §2-① 실측), 그걸 막는 자리다.
// ★★[T1149 2026-11-04 · ★재민 11-04 "겨울에 죽고 다른 계절에 되살아나는 반복" · 지시 T1143 할 일 3 ~ 5 ⓐ ⓑ] **겨울 골짜기** — 손잡이 `T1149_WINTER`
//   (끔 기본 · `=1` = 셋 다 · `=k,birth,buy` 처럼 갈래만 · 끔 = 아래 갈래를 아무도 안 탄다 = 종전 바이트).
//   ⓐ `k` — K 의 식량 흐름(`prodK`) · 땔감(`fuelK`)을 **일하는 사람이 실제로 내는 흐름**으로(일자리 만충 가정 `jobCapacity` 대신 지금 그 일을 하는 사람 수 `counts`) +
//      곳간이 다음 봄까지 먹일 사람(재고 ÷ 다음 봄까지 남은 날 — 땔감 줄의 "재고 한 계절 완충 ÷ 90" 자리 · 달력 정본에서 유도).
//   ⓑ `birth` — 출생에 **곳간 문**: 곳간 식량 환산 ≥ (N + 1) × 하루 소비 × 다가오는 겨울에 남은 날(겨울 앞이면 그 겨울 길이 · 겨울 안이면 남은 날).
//      근거: 철 배수(`SEASON_MULT`)가 1 아래인 철은 겨울 하나다 — 그 철을 먹일 것을 곳간에 쥐고서야 입을 늘린다(달력 · 하루 소비에서 유도 · 새 수 0).
//   ⓒ `buy` — 가을 사 모으기(v2 쪽 · 아래 `t1149WinterNeed`).
const T1149 = (() => { const x = (typeof process !== 'undefined' && process.env) ? process.env.T1149_WINTER : ''; if (!x || x === '0') return {}; if (x === '1' || x === 'all') return { k: 1, birth: 1, buy: 1 }; const o = {}; for (const p of String(x).split(',')) if (p.trim()) o[p.trim()] = 1; return o; })();
let _t1149Cal = null;
function _t1149C() { if (_t1149Cal === null) { try { _t1149Cal = require('../server/calendar'); } catch (e) { _t1149Cal = false; } } return _t1149Cal || null; }
// 다음 봄 첫날까지 남은 날(≥ 1) — 달력 정본(`calendar.dateOf` · `dayOf` · 봄 = 3월) · 옛 달력(끔)이면 `day % 365` 경계(봄 = 0)
function t1149LeanDays(day) {
  const C = _t1149C(), d = day | 0;
  if (!C || !C.ON || typeof C.dateOf !== 'function') { const r = ((d % 365) + 365) % 365; return Math.max(1, 365 - r); }
  const t = C.dateOf(d);
  return Math.max(1, C.dayOf(t.month >= 3 ? t.year + 1 : t.year, 3, 1) - d);
}
// 다가오는 겨울에 남은 날 — 겨울 앞(봄 · 여름 · 가을)이면 다음 겨울 길이 · 겨울 안이면 다음 봄까지 남은 날(달력 정본 · 옛 달력이면 겨울 = `d % 365` 270 ~ 364)
function t1149WinterDays(day) {
  const C = _t1149C(), d = day | 0;
  if (!C || !C.ON || typeof C.dateOf !== 'function') { const r = ((d % 365) + 365) % 365; return r >= 270 ? 365 - r : 95; }
  const t = C.dateOf(d);
  if (t.month === 12 || t.month <= 2) return t1149LeanDays(d);
  const w0 = C.dayOf(t.year, 12, 1);
  return Math.max(1, C.dayOf(t.year + 1, 3, 1) - w0);
}
// ⓒ 다가오는 겨울에 모자랄 식량(단위) — (N × 하루 소비 × 겨울에 남은 날) − 곳간 식량 환산 · 0 아래면 0(v2 가 가을 · 겨울 식량 목표에 얹는다)
function t1149WinterNeed(v, day) {
  if (!T1149.buy || !v || !v.npcs) return 0;
  const N = v.npcs.length; if (!(N > 0)) return 0;
  return Math.max(0, N * DAILY_FOOD_CONSUMPTION * t1149WinterDays(day) - totalFoodEquivalent(v));
}
// ★★[T1179 2026-11-05 · ★재민 11-05 "겨울에 식량 수확이 있어? 작물별로 수확 기간이 다 다르고 겨울에는 아예 작물이 없지 않아?"] **작물 철** — 손잡이 `T1179_CROP_SEASON`
//   (끔 기본 · `=1` 켬 · 끔 = 아래 갈래를 아무도 안 탄다 = 종전 바이트).
//   농부의 하루 일(식 무변 — `JOBS.farmer.base` × 비옥도 × 철 배수 × 숙련 · 도구 …)은 그대로 하고, 그 식량(`food` · 생곡 셋)을
//   **곳간이 아니라 밭에 선 작물**에 쌓는다. 그 작물이 익는 날(작물 정본 `crops.readyDay` — 고증 철 `crop-cal` · 휴면 · 춘화 T99) 그 몫이 곳간에 든다.
//   밭 = 자리 셋(논 1 · 밭 2 — 생활층 `_villageCropFor` 와 같은 분담) · 무엇을 심나 = 작물 정본 `crops.villageCropPick`(생활층과 같은 고르기 · 사본 0).
//   비어 있는 자리는 그 달에 심을 수 있는 것이 있으면 그날 심는다(겨울엔 월동 작물만 · 없으면 빈 채로). 그날 일은 **서 있는 작물에** 고르게 나눈다
//   (서 있는 것이 없으면 자리 셋 모두에 — 갈이 · 다음 작물 몫). 세금 · 잠재 생산(prodK) · 볏짚 · 하루 생산 장부는 종전 그대로 날마다 선다.
//   ⇒ 한 해 총량 = 종전 식의 한 해 합(세계 크기 무변 · 새 수 0) · 바뀌는 것은 **곳간에 드는 때**뿐이다.
const T1179_CROP_SEASON = (typeof process !== 'undefined' && process.env) ? process.env.T1179_CROP_SEASON === '1' : false;
const T1179_SLOTS = [['논', 0], ['밭', 0], ['밭', 1]];
const T1179_ITEMS = { food: 1, wheat: 1, rice: 1, barley: 1 };   // 농부가 내는 먹을 것(주산출 + 생곡 부산물 셋 — `RAW_GRAINS`)
// 고르기 시드 — 마을 이름의 결정론 해시(생활층 시드 `dbId` 는 econ 이 모른다 · 같은 후보 · 같은 산수 · 시드만 다르다 — 보고 회부)
function _t1179Seed(v) { const t = String((v && v.name) || ''); let h = 0; for (let i = 0; i < t.length; i++) h = (Math.imul(h, 31) + t.charCodeAt(i)) | 0; return h >>> 0; }
function _t1179Field(v) {
  let F = v._t1179F;
  if (!F) F = v._t1179F = { seed: _t1179Seed(v), s: T1179_SLOTS.map(([f, p]) => ({ f, p, c: null, pd: -1, rd: -1, pool: {} })), acc: 0, inTot: 0, harv: 0 };
  return F;
}
// 하루 앞(생산 루프 앞) — 익은 자리를 거둬 곳간에 넣고, 빈 자리에 그 달 작물을 심는다
function t1179FieldDay(v, day) {
  const C = _crops(); if (!C || !C.villageCropPick || !C.readyDay) return;
  const F = _t1179Field(v), mo = C.monthOf(day);
  v._t1179InToday = 0;
  for (const s of F.s) {
    if (s.c && day >= s.rd) {
      for (const r in s.pool) { const a = s.pool[r]; if (a > 0) { v.storage[r] = (v.storage[r] || 0) + a; const e = a * (r === 'food' ? 1 : (_t86Factor(r) || 0)); F.inTot += e; v._t1179InToday += e; } }
      s.pool = {}; s.c = null; F.harv++;
    }
    if (!s.c) {
      const c = C.villageCropPick(F.seed, s.f, mo, s.p);
      const rd = c ? C.readyDay(c, day) : null;
      if (c && rd != null) { s.c = c; s.pd = day; s.rd = rd; }
    }
  }
}
// 농부의 먹을 것 한 몫(세금 뗀 뒤) — 서 있는 작물에 고르게(없으면 자리 셋 모두에)
function t1179Accrue(v, r, amt) {
  const F = _t1179Field(v);
  let n = 0; for (const s of F.s) if (s.c) n++;
  const all = n === 0, k = all ? F.s.length : n;
  F.acc += amt * (r === 'food' ? 1 : (_t86Factor(r) || 0));   // 계측(밭에 든 먹을 것 누계 · 식량 환산)
  for (const s of F.s) if (all || s.c) s.pool[r] = (s.pool[r] || 0) + amt / k;
}
// 밭에 서 있는 먹을 것(식량 환산 · 계측 — 곳간 밖)
function t1179Standing(v) {
  const F = v && v._t1179F; if (!F) return 0;
  let t = 0; for (const s of F.s) for (const r in s.pool) t += (s.pool[r] || 0) * (r === 'food' ? 1 : (_t86Factor(r) || 0));
  return t;
}
function farmFlowPerDay(v, fN) {
  const fert = (v.land && v.land.fertility) || 0;
  if (!T100_FIELD_YIELD) return fN * JOBS.farmer.base * fert;
  return fN * T100_ANCHOR_N * DAILY_FOOD_CONSUMPTION;
}
// ★★[T1276 2026-11-12 · 캐논 797 "몸이 한 일만" · 지시 T1276] **밭 세계의 부양력 = 몸이 실제로 일군 밭** — 손잡이 `T1276_FARM_K`(끔 기본 · `=1` 켬 · 밭 세계 `T1243_FARM_ON` 켬일 때만 선다).
//   종전(위 `farmFlowPerDay`): 농부 1인 = `T100_ANCHOR_N` 사람 몫(1.33 · Clark 앵커) × 하루 — 밭 세계에선 산출 자리가 몸의 수확 하나라
//     K 의 식량 흐름(`prodK`)과 볏짚 연료(`fuelK`)가 밭이 아니라 농부 수를 본다(첫 수확 100날 전에도 농부 × 1.33 · 거둔 것이 적어도 같은 값).
//   켬: 밭 흐름(하루 식량 단위) = max(지난 한 해 거둔 식량(`_t368FoodTot` 차 — 곳간 유입) , 지금 선 작물이 낼 식량(`_t1276Stand` — 생활층이 심은 칸마다 정본
//     `_t368Item` × 낱개 값으로 센다)) ÷ 그해 길이(365) — 한 칸 한 해 한 번 거둠(T1243 추신 3)이라 한 철의 선 작물 ≈ 한 해 소출. 새 수 0.
//   prodK 의 농사 몫 · fuelK 의 볏짚 몫이 이 흐름 하나를 읽는다(사본 0). 끔 = 위 줄 그대로(오늘 바이트).
const T1276_FARM_K = T1243_FARM_ON && (typeof process !== 'undefined' && process.env) && process.env.T1276_FARM_K === '1';
const T1276_YEAR = 365;   // 한 해 날 수(달력 평년 · `calendar.yearLen` 평년과 같은 값 — econ 은 달력을 안 부른다)
function t1276Note(v) {   // 하루 한 번(틱 머리) — 누적 거둔 식량의 날마다 기록(한 해 창)
  if (!T1276_FARM_K || !v) return;
  const H = v._t1276Hist || (v._t1276Hist = []);
  H.push(v._t368FoodTot || 0);
  if (H.length > T1276_YEAR + 1) H.shift();
  v._t1276H = (v._t368FoodTot || 0) - H[0];
}
function t1276FieldFlow(v) { return Math.max(v._t1276H || 0, v._t1276Stand || 0) / T1276_YEAR; }
// 종전 자리(`jdef.landBoost`) — 4판은 **손대지 않는다**(3판 모델식 폐기).
//   부산물(밀·쌀·보리·삼·모시)이 `baseAmt` 를 타고 나오므로 여기를 건드리면 곡물·섬유 사슬이
//   T86 에서 떨어진다. 농부의 *식량* 산출만 `addProduce(jdef.output, …)` **한 줄**에서 막는다
//   (대체 · 얹기 0 — T123 마을5 가격 붕괴의 교훈).
function farmLandBoost(v) {
  return (v.land && v.land.fertility) || 0;
}
// ★★[T100 4판 ⓓ] 생활층이 **실제로 거둔 수확 한 번**을 곳간에 넣는 **유일한 입구**.
//   `server/villages.js` `_lifeDoTask0` 수확 갈래가 이 함수를 부른다(그쪽엔 산수가 없다 — 사본 0).
//   회계는 여전히 econ 한 곳이다(새 장부 0): `addProduce` 와 **같은 꼴**로
//     · 세금(`TAX_RATE`)을 떼어 금고로 보내고,
//     · 볏짚 연료 밑변(`v._grainToday`)을 채운다 — 대체로 걷어낸 자리를 그대로 메우는 것이지
//       새 흐름을 다는 게 아니다(안 채우면 짚이 사라져 땔감 수요가 통째로 나무로 몰린다).
//   ⚠`satMul`·건강·포만 배수는 **안 건다**: 그 감산들은 econ 틱 안에서 *노동*에 걸리는 것이고,
//     여기 들어오는 값은 이미 파종창·물때·김매기·계절이 다 물린 **실제 수확**이다(이중 감산 금지).
//   ⚠품목은 일반 `food` — 2-c(곳간 구성 = 구체 작물) 전이니 3판 규약 그대로다.
//   끄면(`T100_FIELD_YIELD=0`) 한 톨도 안 넣는다 → T86 세계 **비트 동일**.
//   ★★[T179 2026-09-12] **배율 자리** — T172 가 사냥·벌목에서 잡은 것과 **같은 결함**이 여기 있었다:
//     농부의 `addProduce(jdef.output, baseAmt)` 를 대체가 걷어내면서 `skillMul·toolBoost·inputMult`
//     셋이 **세계에서 지워졌다**(숙련 10 농부와 초보가 같은 식량을 거뒀다). 값 판정이 아니라 자리 결함이다.
//   ⇒ 세 번째 인수 `mul` 로 **실체 자리가 계산한 배율**을 받는다(문은 양 `n` 만 · 배율은 따로 · 이중 0).
//     정본은 `npc._t172mul` 하나다(아래 대체 자리에서 심는다 — 사본 0).
//   ⚠**안 주면 1** — 지금 부르는 자리(`server/villages.js _lifeDoTask0`)는 아직 안 준다 ⇒ **종전 비트**.
//     그쪽이 주려면 생활층 농부 ↔ econ 농부 링크(`_esk`)가 먼저 필요하다(사냥꾼엔 있고 농부엔 없다) —
//     그건 **서버 자리**라 이 카드 밖이다(회부: 켜기 판정 #11 과 함께).
// ★★[T227] **밭이 곳간에 적는 자리는 이 함수 하나다** — 곳간 · 금고(세금) · 볏짚 밑변(`_grainToday`) ·
//   오늘치 유입(`_t100InflowToday` → T183 잠재 · T193 장부의 `_t100Pot`) **넷을 여기서만 적는다.**
//   그래서 여기서 양을 고르게 하면 **넷이 같이** 고르게 된다(세 곳에 따로 나누면 그게 사본이다).
//   아래 몸통을 따로 뺀 이유가 그것이다 — 덩어리로 넣든 하루치로 흘리든 **적는 줄은 이 하나**다.
function _t100Credit(v, amt) {
  if (!(amt > 0)) return 0;
  v._grainToday = (v._grainToday || 0) + amt;
  const tax = amt * TAX_RATE;
  v.storage.food = (v.storage.food || 0) + (amt - tax);
  if (v.treasury) v.treasury.food = (v.treasury.food || 0) + tax;
  v._t100InflowToday = (v._t100InflowToday || 0) + amt;         // 오늘치 — ⓒ 텃밭 하한이 이걸 보고 모자란 만큼만 댄다
  return amt;
}
// ★★[T748 2026-10-14] **고르게 대기 칸에도 로트가 따라간다** — 호스트(존 서버 · 손잡이 `T732_MOMENT_LOT=1`)가 곳간 장부 훅을 꽂을 때만.
//   랩 · CLI · 브라우저 · 끈 서버는 안 꽂는다 = `_LOTH` null = 아래 훅 줄이 전부 무동작(비트 동일). 훅은 **관측자**다(값 무변):
//   대기 칸(`_t368Pend` · `_t100Pend`)에 들 때 그 레코드(손이 넘긴 것 · 없으면 그 순간)를 칸의 줄에 · 풀 때 오래된 것부터 곳간 레코드로.
let _LOTH = null;
function setLotHook(h) { _LOTH = (h && typeof h === 'object') ? h : null; }
function harvestToGranary(v, n, mul, crop, ev) {
  if (!T100_FIELD_YIELD || !v || !v.storage) return 0;
  const _m = (typeof mul === 'number' && mul >= 0) ? mul : 1;   // ★[T179] 미전달 = 1(종전 비트) · 음수·NaN 도 1
  // ★★★[T368] **품목 갈래** — 손잡이 ∧ 작물 이름. 그러면 `n` 은 건수가 아니라 **그 작물의 낱개**다(작물 표 · 부르는 쪽이 낸 수).
  //   세금·볏짚·고르게(T227)는 **그대로 이 안에서** — 몸통만 품목을 안다(`_t368Credit`). 배율(T179/T190)도 그대로 곱한다.
  //   ⚠`ev` = 이 한 번에 든 **수확 건수**(손에 모아 귀환한 몫은 여럿이다 · 안 주면 1). 건수는 배율·낱개에 안 물린다.
  //   ⚠`T100_K` 는 이 갈래에서 **안 쓴다** — 끈 팔의 입구로 남고, 켠 팔에서는 대조 자다(카드 ①).
  if (T368_FARM_ACT && typeof crop === 'string' && crop) {
    const units = (n > 0 ? n : 0) * _m;
    v._t100HarvestN = (v._t100HarvestN || 0) + ((ev > 0) ? ev : 1);   // 계측·배율 라운드로빈 누계 — 종전과 같은 칸(수확 횟수)
    v._t368KTot = (v._t368KTot || 0) + ((ev > 0) ? ev : 1) * T100_K * _m;   // ★대조 자 — 같은 수확을 종전 입구가 냈을 식량등가(계측 전용 · 회계 아님)
    if (T227_EVEN && _LOTH) _LOTH.pendIn(v, '_t368Pend', crop, units);   // ★[T748] 대기 칸 줄 — 손이 넘긴 레코드(없으면 그 순간)를 그 칸에(관측자 · 끄면 무동작)
    if (T227_EVEN) { const P = v._t368Pend || (v._t368Pend = {}); P[crop] = (P[crop] || 0) + units; return units; }
    return _t368Credit(v, crop, units);
  }
  if (T1243_FARM_ON) { v._t1243NoCrop = (v._t1243NoCrop || 0) + 1; return 0; }   // ★[T1243 ⓑ] 켬 = 품목 없는 수확(`n × T100_K`)은 없다 — 한 번 거둔 식량은 작물 낱개 값 하나(위 갈래)뿐 · 계측 칸(회계 아님)
  const amt = ((n > 0 ? n : 1)) * T100_K * _m;
  v._t100HarvestN = (v._t100HarvestN || 0) + (n > 0 ? n : 1);   // 계측 전용 누계(회계 아님 · 표가 스스로 말하게) · ★[T179] **건수는 배율에 안 물린다**(수확 횟수지 양이 아니다)
  // ★[T227] 고르게 — 덩어리를 **대기 두지**(`_t100Pend`) 하루치씩 위 크레딧으로 흘린다(아래 `t100EvenRelease`).
  //   T218 이 잰 것: 켠 팔의 볏짚은 원량의 29~33% 가 **그날 상한을 넘어 버려진다**(끈 팔은 버림 0 —
  //   추상 농부는 매일 조금씩 내기 때문이다). 총량은 같은데 **몰려 오는 것**이 값을 깎고 있었다.
  //   ⚠총량 무변: 여기서 안 적은 것은 전부 `_t100Pend` 에 남아 있다(질량 누수 0 — 하네스가 항등식으로 문다).
  if (T227_EVEN && _LOTH) _LOTH.pendIn(v, '_t100Pend', 'food', amt);   // ★[T748] 대기 칸 줄 — 그 순간 거둔 것(관측자 · 끄면 무동작)
  if (T227_EVEN) { v._t100Pend = (v._t100Pend || 0) + amt; return amt; }
  return _t100Credit(v, amt);
}
// ★[T227] 하루 한 번 — 대기분의 `1/주기` 를 푼다. **주기는 정본이다**(`seedFoodDays` = `crops.daysToFirstHarvest`
//   에서 유도된 그 수 · T100 5판이 창설 곳간에 쓴 것과 **같은 칸** · 새 수 0).
//   ⚠지어낸 날수를 안 쓰는 이유: 이 자리엔 **어떤 작물이었는지가 안 온다**(호출부는 건수와 배율만 준다).
//     작물별 `crops.growDaysOf` 는 생활층에만 있다 — 그래서 정본 중 **이 자리에서 읽을 수 있는 주기**를 쓴다.
function t100EvenRelease(v) {
  if (!T227_EVEN || !T100_FIELD_YIELD || !v || !v.storage) return 0;
  const p = v._t100Pend || 0;
  if (!(p > 0)) return 0;
  const d = seedFoodDays(0);
  const give = (d > 1) ? p / d : p;
  v._t100Pend = p - give;
  if (_LOTH) _LOTH.pendOut(v, '_t100Pend', 'food', give);   // ★[T748] 오래된 것부터 곳간 레코드로(끄면 무동작)
  const out = _t100Credit(v, give);
  if (_LOTH) _LOTH.clearIn(v, 'food');
  return out;
}
// ★★[T368] **밭이 품목으로 적는 몸통** — `_t100Credit` 와 **같은 넷**(볏짚 밑변 · 곳간 · 금고 세금 · 오늘치)을
//   품목으로 적는다. 볏짚 밑변과 오늘치는 **식량등가**(단위가 T100 과 같아야 짚·텃밭 하한이 같은 수를 본다),
//   곳간·금고는 **그 작물의 낱개**다. 장부 다리(아래 틱 · T312·T325·T374 와 같은 꼴)가 품목별 오늘치를 읽는다.
//   ★새 수 0 — 이 함수엔 수가 하나도 없다(세율은 `TAX_RATE` · 식량 값은 `_t368FoodPer` 정본).
function _t368Credit(v, crop, units) {
  if (!(units > 0)) return 0;
  const fe = units * _t368FoodPer(v, crop);
  v._grainToday = (v._grainToday || 0) + fe;
  const tax = units * TAX_RATE;
  v.storage[crop] = (v.storage[crop] || 0) + (units - tax);
  if (v.treasury) v.treasury[crop] = (v.treasury[crop] || 0) + tax;
  v._t368InflowToday = (v._t368InflowToday || 0) + fe;
  const by = v._t368InByItem || (v._t368InByItem = {});
  by[crop] = (by[crop] || 0) + units;
  v._t368CredTot = (v._t368CredTot || 0) + units;                // 계측 전용 누계(회계 아님) — 보고의 항등 표가 읽는다
  v._t368FoodTot = (v._t368FoodTot || 0) + fe;
  return units;
}
// ★[T368 · T227 문법 그대로] 대기분(품목별)을 하루 한 번 `1/주기` 씩 푼다 — 주기는 **같은 정본**(`seedFoodDays(0)`).
//   ⚠`t100EvenRelease` 옆에 따로 둔 이유: 그쪽은 돌려주는 값이 식량(한 품목)이고 하네스가 그 값을 문다.
function t368EvenRelease(v) {
  if (!T227_EVEN || !T368_FARM_ACT || !v || !v.storage || !v._t368Pend) return 0;
  const d = seedFoodDays(0);
  let out = 0;
  for (const c of Object.keys(v._t368Pend)) {
    const p = v._t368Pend[c] || 0;
    if (!(p > 0)) continue;
    const give = (d > 1) ? p / d : p;
    v._t368Pend[c] = p - give;
    if (_LOTH) _LOTH.pendOut(v, '_t368Pend', c, give);   // ★[T748] 오래된 것부터 곳간 레코드로(끄면 무동작)
    out += _t368Credit(v, c, give);
    if (_LOTH) _LOTH.clearIn(v, c);
  }
  return out;
}
// ★★★[T312 2026-09-19 · 설계_생산_실체 §1·§2 — 재민 09-18/19 확정] **어부의 곳간 입구.**
//   캐논: *"낚는 순간 손에, 귀환하면 곳간에."* 그 **귀환**이 부르는 자리가 여기다.
//   ⚠문법은 위 `harvestToGranary`(T179) **그대로**다 — 새 회계 0:
//     · 손잡이가 꺼져 있으면 **한 톨도 안 넣는다**(끈 팔 비트 동일)
//     · 세금은 같은 `TAX_RATE` · 곳간·국고에 같은 순서로
//     · 오늘치(`_t312InflowToday`)를 남겨 **틱 안에서** 실현 장부에 한 번 적는다(T193 이 낸 그 자리 · 아래)
//   ⚠**단위는 econ 단위**다(마리가 아니다). 부르는 쪽(`server/villages.js`)이 마리→단위를 `kcal.js` 정본으로 바꾼다.
//   ★새 수 0 — 이 함수엔 수가 하나도 없다.
// ★★★[T325 2026-09-19] **셋째 자리라서 몸통을 합쳤다** — `actToGranary(v, item, units)`.
//   T100(`harvestToGranary`)·T312(`fishToGranary`)·T325(`woodToGranary`) 셋이 같은 네 줄을 쓴다:
//     세금을 떼어 금고로 · 나머지를 곳간으로 · 오늘치를 남기고 · 건수를 센다.
//   같은 네 줄을 세 벌 적으면 그게 사본이고, `TAX_RATE` 가 바뀌는 날 **두 품목만** 따라간다.
//   ⇒ 몸통은 하나다. 품목마다 다른 것은 **오늘치 칸의 이름**뿐이라 그것만 인수로 받는다.
//   ⚠`harvestToGranary` 는 이 몸통을 **안 쓴다** — 그쪽은 볏짚 밑변(`_grainToday`)까지 적고
//     T227 대기열이 그 앞에 붙는다(자기 몸통 `_t100Credit` 이 이미 있다 · 합치면 그게 억지다).
//   ★새 수 0 — 이 함수엔 수가 하나도 없다.
function actToGranary(v, item, units, todayKey, countKey) {
  if (!v || !v.storage) return 0;
  const amt = (typeof units === 'number' && units > 0) ? units : 0;
  if (!(amt > 0)) return 0;
  const tax = amt * TAX_RATE;
  v.storage[item] = (v.storage[item] || 0) + (amt - tax);
  if (v.treasury) v.treasury[item] = (v.treasury[item] || 0) + tax;
  if (todayKey) v[todayKey] = (v[todayKey] || 0) + amt;   // 오늘치 — 아래 틱이 실현 장부에 옮긴다
  if (countKey) v[countKey] = (v[countKey] || 0) + 1;     // 계측 전용 누계(회계 아님)
  return amt;
}
// ★★★[T374] **그날 수요 — 몸통 하나.** 어부·나무꾼·채집꾼이 **같은 두 줄**을 쓴다(사본 0).
//   `D` = 그 마을이 그날 수식으로 내는 몫(정본 관측 칸) · 오늘 이미 넣은 양 = `todayKey` 칸.
//   ⇒ 남은 수요 = `D − 오늘치`. 0 이하면 **그날은 더 안 받는다**(행위 층이 그걸 보고 멈춘다).
//   ⚠손잡이가 꺼져 있으면 `Infinity` 를 낸다 — 자르는 문이 아예 없다(끈 팔 비트 동일).
//   ⚠`D` 가 0 인 마을(그 직업이 없거나 땅이 안 내는 마을)은 **0** 이다 ⇒ 안 딴다.
//   ★`held` = **손에 든 것**(아직 곳간에 안 든 몫 · 카드 ① "손에 든 것 + 오늘 곳간에 넣은 것").
//     관측자 있는 갈래는 낮 내내 손에 쥐고 `_lifeDaily` 에 곳간에 넣는다 — 곳간만 보면 낮 동안 늘 `D` 가 남아
//     **멈춤이 한 번도 안 선다.** 그래서 부르는 쪽(생활층)이 그 손을 세어 넘긴다. 안 넘기면 0(헤드리스는 손을 먼저 비운다).
function actDemandLeft(v, D, todayKey, held) {
  if (!T374_DEMAND_STOP) return Infinity;
  if (!v) return 0;
  const target = (typeof D === 'number' && D > 0) ? D : 0;
  if (!(target > 0)) return 0;
  //   ★[T544 ③] 오늘치가 **음수**면 그것은 미룬 몫이다(생활층이 한 단위 안 되는 몫을 안 따고 이 칸에 남긴다 · 틱은 양수만 장부에 옮기고 비운다)
  //     ⇒ 남은 몫 = D − 오늘치 가 그만큼 커진다(내일 몫과 합친다 · 새 칸 0). 어부·나무꾼 칸은 음수가 된 적이 없다(무변).
  const got = (todayKey && typeof v[todayKey] === 'number') ? v[todayKey] : 0;
  const hand = (typeof held === 'number' && held > 0) ? held : 0;
  const left = target - got - hand;
  return left > 0 ? left : 0;
}
//   그리고 곳간 입구에서 **한 번 더** 자른다 — 행위 층이 못 멈춘 마지막 알갱이까지(장부가 D 를 안 넘는다).
//   ⚠여기서는 `held` 를 안 뺀다 — 지금 넣는 `units` 가 **바로 그 손**이다(두 번 빼면 손이 스스로를 막는다).
function actDemandCap(v, units, D, todayKey) {
  const left = actDemandLeft(v, D, todayKey);
  if (left === Infinity) return units;
  const amt = (typeof units === 'number' && units > 0) ? units : 0;
  return amt > left ? left : amt;
}
// ★[T374] 품목마다 `D` 를 어디서 읽나 — 정본 칸 이름만 다르다(식은 하나).
//   ★[T1217] 켬 = 어부의 수요 문이 없다(Infinity — 끈 팔과 같은 값) — 어부는 그날 D 가 아니라 제 한 시간의 값(아래 `T1217_MARGIN` 머리말)으로 멈춘다.
function fishDemandLeft(v, held) { if (T1217_MARGIN) return Infinity; return actDemandLeft(v, (v && v._fishOutLast) || 0, '_t312InflowToday', held); }
//   ★[T1135 ①] 나무꾼 분자 — 켬 = 그날 땔감 수요(`_t1135Need`) · 끔 = 수식 몫(`_woodOutLast` · 종전 글자). 문(`actDemandLeft`)은 하나다.
//   ★[T1207 ⑤] 영토 말뚝 몫 — 서버 생활층(`villages.js _t1207Batch`)이 그날 못 치른 통나무를 `_t1207Need` 에 적는다(끔 · 랩 = 칸 없음 → 0 · 종전 값 그대로).
//     나무꾼 수요 문(`actDemandLeft` — 몸 · 일괄 둘 다)과 개간 그루 입구(`woodToGranary`)가 같은 D 를 본다 — 배수 0 · 수요가 는 만큼만.
function woodShareD(v) { return ((v && (T1135_FUEL_EQ ? v._t1135Need : v._woodOutLast)) || 0) + ((v && v._t1207Need) || 0); }
function woodDemandLeft(v, held) { return actDemandLeft(v, woodShareD(v), '_t325InflowToday', held); }
//   채집만 한 항이 더 붙는다 — 걷는 몫만 대신하므로 그 몫을 곱한다(T347 `_t347MixShare` · 계측 칸이 아니라 계약).
function forageDemandLeft(v, held) {
  const share = (v && typeof v._t347MixShare === 'number' && v._t347MixShare > 0) ? v._t347MixShare : 0;
  return actDemandLeft(v, ((v && v._forageOutLast) || 0) * share, '_t347InflowToday', held);
}
function fishToGranary(v, units) {
  if (!T312_FISH_ACT || !v || !v.storage) return 0;
  if (T1217_MARGIN) return actToGranary(v, 'fish', units, '_t312InflowToday', '_t312CatchN');   // ★[T1217] 켬 = 입구에서도 D 로 안 자른다(잡은 마리 그대로)
  return actToGranary(v, 'fish', actDemandCap(v, units, (v._fishOutLast || 0), '_t312InflowToday'), '_t312InflowToday', '_t312CatchN');
}
// ★★★[T1217 2026-11-07 · ★재민 11-07 판정대기 문 35 ⓓ] **수요 문 대신 "한 시간 더 일한 값 ↔ 한 시간 쉰 값"** — 손잡이 `T1217_MARGIN`(**끔 기본** · `=1` 만 켬 · 끔 = 종전 바이트).
//   "그날 필요한 만큼만 일한다"(T374 수요 문 D · 어부 `_fishOutLast` · T312 마을 낚시 몫)는 추상이다 — 켬이면 어부의 문은 몸의 하루 한도(시간 · 짐 · 현장)와
//   실제 어장 재고(`server/fishing.js` 셀 · 몸 · 일괄이 같은 장부를 깎는다)뿐이고, 사람마다 매 게임 시간 두 값을 견줘 큰 쪽을 한다(재민 "썩으면 손해 · 팔 수 있으면 과잉이 이득 · 쉬어야 행복"):
//     일한 값 = 그 시간 잡힐 단위(입질 기댓값 ∝ 그 자리 재고 — CPUE) × 한 단위의 행복 값
//       · 마을에 식량 빚이 있으면 먹는다 — 한 단위 = 한 사람의 하루치 빚 = 겪은 일(굶주림 날 +굶는 몫 ÷ 죽음 날 수 `t1197DieDays`)의 한 사람 몫 = 1 ÷ (N × 죽음 날 수)
//       · 빚이 없으면 남는다 — 시세(그 마을 값 · 이웃이 사 주는 순수취 `netExportValue` 중 큰 쪽) × 다른 물건으로 바꾼 행복(가장 좋은 바꿈 · 아래 `t1217HappyMu`)
//     쉰 값 = 여가 몫(`LEISURE_HAPPY_W` × 쉰 사람-날 ÷ N)이 한 시간만큼 오르는 양 = `LEISURE_HAPPY_W` ÷ (N × 낮 시간 수)
//   두 값 다 행복 목표(0.5 + 좋은 것 − 겪은 일)의 같은 단위다 — 새 튜닝 수 0(행복 식의 무게만).
//   여가 몫(`_computeVillageStats` 의 `_leis`)은 켬이면 행위 어부의 실제 쉰 시간(서버가 그날 `_t1217Rest` 에 적는다 · 사람-날)을 센다 —
//     수식 직업의 여유노동(`_idleFrac`)은 그 사람 수만큼, 행위 어부는 쉰 몫만큼(인구 가중 평균).
//   헤드리스 랩은 행위 호스트가 없어(`bindProductionActs` 안 부름) 이 손잡이가 아무 줄도 안 바꾼다.
const T1217_MARGIN = (typeof process !== 'undefined' && process.env && process.env.T1217_MARGIN === '1');
//   ★[T1217] 물건 하나의 한 단위가 좋은 것(행복 합 G)을 얼마나 올리나 — `_computeVillageStats` 의 그 꼴(1인당 충족률 min(1, 1인당 ÷ 2) × 무게)의 기울기:
//     1인당 2 미만이면 무게 ÷ (2N) · 2 이상이면 0(이미 찼다). 무게 = 그 물건의 `contributes.happiness`(specialty 정본 · 없으면 종전 표) — 사본 0.
function t1217HappyMu(v, id, N) {
  if (!v || !id || (T1188_ORE_SPLIT && (id === 'ore' || OreGoods.isOre(id)))) return 0;
  const SP = _getSpecialty();
  const c = (SP && SP[id] && SP[id].contributes) || LEGACY_CONTRIBUTES[id] || null;
  const w = c && c.happiness > 0 ? c.happiness : 0;
  //   ★[T1218 · T1217 회부 ② — T1205 착지 뒤] T1205 켬 = 좋은 것 G 에 사치품 항(위신 합을 1 에서 자르고 × `T1205_LUX_W`) — 그 물건이 위신에 주는 몫도 한계 행복에 든다
  //     (위신 합이 1 밑일 때만 · 같은 `contributes.prestige` × 1인당 2개 밑 충족 · 호피는 제 줄 `TIGERHIDE_PRESTIGE_W` ÷ 인구 · 상한 밑). 청동검 위세(무기 품질)는 안 센다(물건 한 단위가 아니다).
  const lux = T1205_HAPPY && !(((v.lastStats && v.lastStats.prestige) || 0) >= T1205_LUX_MAX);
  const wp = lux && c && c.prestige > 0 ? c.prestige : 0;
  const pop = Math.max(1, N || (v.npcs && v.npcs.length) || 1);
  const th = lux && id === 'tigerhide' && ((v.storage && v.storage.tigerhide) || 0) / pop * TIGERHIDE_PRESTIGE_W < TIGERHIDE_PRESTIGE_CAP ? TIGERHIDE_PRESTIGE_W / pop : 0;
  if (!(w > 0) && !(wp > 0) && !(th > 0)) return 0;
  const under = ((v.storage && v.storage[id]) || 0) / pop < 2;
  if (!(wp > 0) && !(th > 0)) return under ? w / (2 * pop) : 0;   // 종전 줄 그대로(위신 몫이 없는 물건)
  return (under ? (w + t1205Par().luxW * wp) / (2 * pop) : 0) + t1205Par().luxW * th;
}
//   ★[T1217] 여가 몫의 밑변 — 수식 직업의 여유노동(`_idleFrac` · 수식이 닫힌 행위 어부는 그 잠재 · 실제 합 `_potA` · `_actA` 에 안 든다)은 그 사람 수만큼,
//     행위 어부는 서버가 적은 그날 쉰 사람-날(`_t1217Rest` · 낮 시간 중 안 낚은 몫의 합 · 0 ~ 어부 수)만큼 — 인구 가중 평균. 칸이 없으면(서버가 안 적은 날 · 랩) 종전 값.
//   ★[T1271 · T1266 회부 1 — PM 판정 "광부만 다른 쉼 값을 둘 까닭이 없다"] `T1266_ORE_BODY` 켬 = 행위 광부(수식이 닫히고 몸이 친 마을)도 같은 꼴 —
//     서버가 적은 그날 쉰 사람-날(`_t1271Rest` · 몸이 한 시간 문에서 멈춘 시각부터 해 질 녘까지의 낮 몫 합 · 0 ~ 광부 수)만큼. 어부만 선 날은 종전 셈 그대로(같은 산술).
function t1217IdleFrac(v, pop) {
  const idle = (v && v._idleFrac) || 0;
  if (!v) return idle;
  const fOn = typeof v._t1217Rest === 'number' && productionFormulaOff(v, 'fisher');
  const mOn = T1266_ORE_BODY && typeof v._t1271Rest === 'number' && productionFormulaOff(v, 'miner') && mineActOn(v);
  if (!fOn && !mOn) return idle;
  const N = Math.max(1, pop || (v.npcs && v.npcs.length) || 1);
  let A = 0, R = 0;
  if (fOn) { const Fa = Math.min(N, Math.max(0, (v.counts && v.counts.fisher) || 0)); A += Fa; R += Math.max(0, Math.min(Fa, v._t1217Rest)); }
  if (mOn) { const Ma = Math.min(N - A, Math.max(0, (v.counts && v.counts.miner) || 0)); A += Ma; R += Math.max(0, Math.min(Ma, v._t1271Rest)); }
  return ((N - A) * idle + R) / N;
}
// ★★[T325 · 설계_생산_실체 §1·§2] **나무꾼의 곳간 입구.** 캐논: *"베는 순간 손에, 귀환하면 곳간에."*
//   ⚠어부와 **같은 몸통 · 같은 세금 · 같은 장부 다리**다(위 `actToGranary`) — 새 회계 0.
//   ⚠단위는 econ 단위다(그루가 아니다). 부르는 쪽(`server/villages.js`)이 손에 든 낱개를 단위로 바꾼다 —
//     목재는 **낱개 = 단위**다(`weights.js wood 3.00kg` 이 "장작·목재 단(段)" 하나의 무게다 · 환산식 0).
function woodToGranary(v, units) {
  if (!v || !v.storage) return 0;
  if (!T325_WOOD_ACT) return v._t1238Land ? actToGranary(v, 'wood', actDemandCap(v, units, v._t1207Need || 0, '_t325InflowToday'), '_t325InflowToday', '_t325CutN') : 0;   // ★[T1275] 아래 머리말
  return actToGranary(v, 'wood', actDemandCap(v, units, woodShareD(v), '_t325InflowToday'), '_t325InflowToday', '_t325CutN');
}
// ★★[T1275 2026-11-12 · T1264 회부 2] **영토 v2 · 수식 나무꾼 세계의 개간 통나무 입구.** 영토 v2(`_t1238Land` — 서버가 켬에서만 econ 마을에 심는 표지) ∧ 나무꾼 몸 행위 끔이면
//   개간이 벤 그루의 통나무(`villages.js _t1207Fell` · 짐 `_t717PackIn`)가 곳간에 든다 — 종전엔 이 입구가 0 이라 통나무가 마을 짐에 쌓이기만 했다(T1264 1020 1/3 · 짐 25,560 단 · 말뚝에 쓴 5,927 의 4.3 배).
//   같은 입구 몸통(`actToGranary` — 같은 세금 · 같은 장부 다리 `_t325InflowToday` · 아래 틱이 표지 마을에서도 옮긴다) · 같은 수요 문(`actDemandCap`).
//   수요 = 그날 D(`woodShareD` = 나무꾼 몫 + 말뚝 모자람 `_t1207Need`) 중 수식이 이미 낸 몫(나무꾼 몫 — 이 세계는 수식 나무꾼이 낸다)을 뺀 남은 몫 = `_t1207Need`
//   — 몸 세계(T325 켬)에서 나무꾼 몸 + 개간 그루가 함께 D 를 채우는 것과 같은 합(배수 0 · 새 수 0). 안 받은 몫은 짐에 남아 이튿날 먼저 든다(T717 소멸 금지 그대로).
//   ⚠표지가 없는 마을(영토 v2 끔 · 랩)은 종전 그대로 0 — 끔 세계 바이트 같음.
// ★[T325] 이 마을이 **행위 벌목**으로 도는가 — 손잡이 ∧ 나무 셀이 있다(생활층이 `resourceAt` 로 세어 심는다).
//   ⚠둘 다여야 한다. 나무 없는 마을(T309 ⓒ: 반경 16셀에서 3/51)은 켜도 종전 수식 그대로다 — 몸이 갈 자리가 없다.
//   ★[T334] 셀 수는 이제 **분모가 아니다** — *"갈 자리가 있나"* 만 답한다.
//   ★[T341] 예산이 아예 없어졌으므로 이 게이트가 **유일한 문**이다(숲이 있나 · 손잡이가 켜졌나).
function woodActOn(v) { return !!(T325_WOOD_ACT && v && (v._t325Cells | 0) > 0); }
// ★[T1135 ①] 수식 목재를 걷어내는 문 — 행위 층 마을(종전) ∨ 켬이면 **나무 칸 0 마을**(생활층이 세어 0 을 적은 뒤 · 지도 칠 무관 — 없으면 못 벤다).
function woodFormulaOff(v) { return woodActOn(v) || !!(T1135_FUEL_EQ && T325_WOOD_ACT && v && v._t325Cells === 0); }
// ★★[T347 · 설계_생산_실체 §1·§2] **채집꾼의 곳간 입구.** 캐논: *"따는 순간 손에, 귀환하면 곳간에."*
//   ⚠어부·나무꾼과 **같은 몸통 · 같은 세금 · 같은 장부 다리**다(위 `actToGranary`) — 새 회계 0.
//   ⚠다른 것 하나: 품목이 **인자**다(채집은 한 번에 여러 품목이 손에 든다) — 부르는 쪽이 품목별로 부른다.
//   ⚠단위 환산이 없다: 군락 전리품의 낱개가 그대로 econ 단위다(나무와 같은 규약 · 환산식 0).
function forageToGranary(v, item, units) {
  if (!T347_FORAGE_ACT || !v || !v.storage || !item) return 0;
  const share = (typeof v._t347MixShare === 'number' && v._t347MixShare > 0) ? v._t347MixShare : 0;
  const got = actToGranary(v, item, actDemandCap(v, units, (v._forageOutLast || 0) * share, '_t347InflowToday'), '_t347InflowToday', '_t347PickN');
  //   ★[T374] 품목별 오늘치 — 장부 다리가 품목을 알아야 한다(어부·나무꾼은 품목이 하나라 스칼라로 됐다).
  if (got > 0) { (v._t347InByItem || (v._t347InByItem = {}))[item] = (v._t347InByItem[item] || 0) + got; }
  return got;
}
// ★[T347] 이 마을이 **행위 채집**으로 도는가 — 손잡이 ∧ 군락 셀이 있다(생활층이 `resourceAt` 로 세어 심는다).
//   ⚠둘 다여야 한다. 군락 0 마을은 켜도 종전 수식 그대로다 — 몸이 갈 자리가 없다(나무꾼과 같은 계약).
function forageActOn(v) { return !!(T347_FORAGE_ACT && v && (v._t347Cells | 0) > 0); }
// ★★[T724] **광부의 곳간 입구.** 캐논: *"치는 순간 손에, 귀환하면 곳간에."* — 어부·나무꾼과 **같은 몸통 · 같은 세금 · 같은 장부 다리**(`actToGranary`).
//   ⚠수요 문도 같은 몸통이다(`actDemandCap` · D = 그 마을이 오늘 수식으로 낼 원석 `_oreOutLast`) — 곳간이 안 받은 몫은 부르는 쪽 손에 남는다(T544 꼴).
//   ⚠조성(`oreMix`)은 **넣는 몫만큼** 접는다 — 종전 수식 갈래가 `addProduce` 앞에서 하던 그 접기(같은 함수 · 같은 자리 순서: 재고 가산 전).
//   ★새 수 0.
// ★★★[T1266 2026-11-11 · 캐논 797 "몸이 한 일만 센다" · T1256 회부 4] **광부 원석의 양 = 몸이 친 만큼** — 손잡이 `T1266_ORE_BODY`(**끔 기본** · `=1` 만 켬 · 끔 = 종전 바이트).
//   종전: 몸은 그날 수식 몫 D(`_oreOutLast`)에 닿으면 집에 가고(`mineDemandLeft`) 곳간 입구도 D 로 잘랐다 — 원석 양의 크기는 수식이 정했다(T1256: 몸 원석 = D 1 : 1).
//   켬: 곳간 입구가 D 로 안 자른다(친 만큼 다 든다 · 어부 T1217 `fishToGranary` 그 꼴). 몸이 그날 일을 그만두는 문은 서버 몸 걸음(`_t724BodyStep`)이
//     게임 한 시간마다 견주는 "다음 한 시간 캔 값 ↔ 한 시간 쉰 값"(v2 `t1266OreValue` — 어부 `t1217Value` 와 같은 λ · 같은 쉰 값)이다.
//   수요는 몸이 일을 고르는 값(시세 · 그림자 값)으로만 닿는다. 헤드리스 랩은 몸 호스트가 없어 이 손잡이가 아무 줄도 안 바꾼다(곳간 입구는 몸만 부른다).
const T1266_ORE_BODY = (typeof process !== 'undefined' && process.env && process.env.T1266_ORE_BODY === '1');
function mineToGranary(v, units, mineral) {
  if (!T724_MINE_ACT || !v || !v.storage) return 0;
  if(T1188_ORE_SPLIT&&!OreGoods.idOf(mineral))return 0;
  const u = T1266_ORE_BODY ? ((typeof units === 'number' && units > 0) ? units : 0) : actDemandCap(v, units, (v._oreOutLast || 0), '_t724InflowToday');   // ★[T1266] 켬 = 친 만큼 다 든다
  if (!(u > 0)) return 0;
  if(T1188_ORE_SPLIT){const k=OreGoods.idOf(mineral),g=actToGranary(v,k,u,'_t724InflowToday','_t724InN');if(g>0){const d=v._t1188InByItem||(v._t1188InByItem={});d[k]=(d[k]||0)+g;}return g;}
  if (v.land && v.land.oreMix) foldOreMix(v, oreTotal(v), u, v.land.oreMix);
  return actToGranary(v, 'ore', u, '_t724InflowToday', '_t724InN');
}
function mineDemandLeft(v, held) { return actDemandLeft(v, (v && v._oreOutLast) || 0, '_t724InflowToday', held); }
// ★[T724] 이 마을의 원석이 **오늘 몸에서** 오는가 — 손잡이 ∧ 그날 광부 몸이 한 번이라도 쳤다(생활층이 심는다 · 헤드리스는 0 = 종전).
function mineActOn(v) { return !!(T724_MINE_ACT && v && ((v._t724Walk | 0) > 0 || (T1188_ORE_SPLIT && productionActsBound(v)))); }
// ★★★[T1196 2026-11-06 · 추상 걷기 B · ★재민 11-05 "추상 다 없애자"] **장인 작업장 — 장인 다섯(석공 · 대장장이 · 갑옷장 · 재봉 · 요리)은 몸이 만든다.**
//   손잡이 `T1196_ARTISAN_ACT`(켬 기본 · 되돌림 `=0` = 종전 바이트). 실제 몸 호스트(`bindProductionActs` — 서버)에서만 선다 — 랩 · CLI · 하네스는 호스트가 없어 종전 수식 그대로(비트 동일).
//   종전: 장인 갈래(`produceSpecial` · 갑옷장은 범용 갈래)가 곳간 장부에서 재료를 깎고 산출을 넣었다 — 몸은 회관 안에서 서성이며 라벨만 달았다.
//   켬: **같은 갈래 · 같은 식**이 그날 그 장인이 할 일을 정한다(얼마나 · 무엇을 · 품질 — 새 수 0 · 레시피 정본 그대로). 다만 곳간은 안 움직인다 —
//     갈래가 곳간 · 금고에 낸 차(差)를 **작업표**(`_t1196Q`)로 떼어 두고 곳간을 되돌린다. 곳간이 움직이는 것은 몸뿐이다:
//     몸이 곳간 사다리에서 재료를 꺼내 들고(`artisanTake` — 그때 있는 만큼 · 모자라면 그 비율로) → 작업 자리에서 만들고 → 곳간에 넣는다(`artisanGive` · 든 비율 그대로).
//   ★명부(T449 · T491 문법): 그날 그 직업의 **빈 몸 수**(`_t1196Seats` — 생활층이 econ 틱 앞에 심는다)만큼만 작업표가 된다. 자리가 없는 장인(몸 상한 · 몸이 다 바쁨)은
//     종전 수식 그대로 그날 곳간에 든다(일괄). 몸이 그날 안 집어 간 작업표는 이튿날 머리에 일괄로 든다 — 한 작업표 = 몸 XOR 일괄(이중 0 · 소멸 0).
//   ★예약: 집어 가기 전 작업표의 재료는 같은 날 다음 장인 갈래가 못 쓰게 그 갈래 동안만 곳간에서 빼고 본다(`_t1196R` — 갈래가 끝나면 되돌린다).
//   ⚠장부 밖 칸(오늘 생산 · 소비 흐름 `_cons` · 품질 누적 · 숙련 `workNPC` · 계측 누계)은 갈래가 정하는 그 자리에서 종전대로 선다 — 곳간 · 금고만 몸을 기다린다.
const T1196_ARTISAN_ACT = (typeof process !== 'undefined' && process.env && process.env.T1196_ARTISAN_ACT !== '0');
const T1196_SET = { mason: 1, smith: 1, armorsmith: 1, tailor: 1, cook: 1 };
const T1196_EPS = 1e-9;
function artisanActOn(v) { return !!(T1196_ARTISAN_ACT && productionActsBound(v)); }
//   이 장인이 오늘 작업표를 받는가 — 그 직업 빈 몸 자리가 남았나(자리 하나 = 작업표 하나)
function _t1196Seat(v, job, day) {
  const S = v._t1196Seats; if (!S || !(S[job] > 0)) return false;
  if (v._t1196UsedDay !== day) { v._t1196UsedDay = day; v._t1196Used = {}; }
  const u = v._t1196Used[job] | 0;
  if (u >= S[job]) return false;
  v._t1196Used[job] = u + 1;
  return true;
}
function _t1196Begin(v, job, day) {
  if (!_t1196Seat(v, job, day)) return null;
  const P = v._world && v._world.lotsPause; if (typeof P === 'function') P(true);   // 서버 곳간 로트 장부 — 되돌릴 바뀜은 안 적는다(End 가 푼다)
  const st = Object.assign({}, v.storage), tr = Object.assign({}, v.treasury || {});
  return { st, tr };
}
function _t1196Back(obj, base) { for (const k in obj) if (!(k in base)) delete obj[k]; for (const k in base) obj[k] = base[k]; }
function _t1196End(v, npc, S, day) {
  const take = {}, give = {}, tre = {};
  let any = false;
  for (const k in v.storage) {
    const before = S.st[k] || 0, d = (v.storage[k] || 0) - before;
    if (d < -T1196_EPS) { take[k] = -d; any = true; } else if (d > T1196_EPS) { give[k] = d; any = true; }
  }
  const T = v.treasury || {};
  for (const k in T) { const d = (T[k] || 0) - (S.tr[k] || 0); if (d > T1196_EPS) { tre[k] = d; any = true; } }
  _t1196Back(v.storage, S.st); if (v.treasury) _t1196Back(v.treasury, S.tr);
  if (any) {   // 그 재료는 그날 마을 틱 동안 다른 쓰임에서 비켜 둔다(장인 몫 — 마을 하루 꼬리 `t1196Unhide` 가 곳간에 그대로 되돌린다 · 갈래가 먼저 쓰던 종전 차례를 지킨다)
    const H = v._t1196H || (v._t1196H = {});
    for (const k in take) { v.storage[k] = (v.storage[k] || 0) - take[k]; H[k] = (H[k] || 0) + take[k]; }
  }
  { const P = v._world && v._world.lotsPause; if (typeof P === 'function') P(false); }
  if (!any) { v._t1196Used[npc.currentJob]--; return; }   // 오늘 만들 것이 없었다 — 자리를 돌려준다(그 몸은 쉰다)
  const id = (v._t1196N = (v._t1196N | 0) + 1);
  (v._t1196Q || (v._t1196Q = [])).push({ id, job: npc.currentJob, day, take, give, tre, st: 0, f: 0, pid: null });
  const R = v._t1196R || (v._t1196R = {});
  for (const k in take) R[k] = (R[k] || 0) + take[k];
  const C = v._t1196C || (v._t1196C = { made: 0, body: 0, batch: 0, late: 0, short: 0 }); C.made++;
}
function _t1196Unres(v, t) {
  const R = v._t1196R; if (!R) return;
  for (const k in t.take) { const x = (R[k] || 0) - t.take[k]; if (x > T1196_EPS) R[k] = x; else delete R[k]; }
}
//   비켜 둠 — 마을 틱 머리(일괄 뒤)에 아직 몸이 안 집어 간 작업표의 재료를 그날 틱 동안 곳간에서 비켜 두고(`_t1196H`), 마을 하루 꼬리(먹기 뒤 · 썩기 앞)에 그대로 되돌린다.
//   ⚠곳간 로트 장부는 그동안 멈춘다(되돌릴 바뀜) — 틱 밖(몸 시간)의 곳간은 늘 실물 그대로다(꺼낼 때 · 넣을 때만 움직인다).
function _t1196Pause(v, on) { const P = v._world && v._world.lotsPause; if (typeof P === 'function') P(on); }
function _t1196Hide(v) {
  const R = v._t1196R; if (!R) return;
  let H = null;
  _t1196Pause(v, true);
  for (const k in R) { const h = Math.min(R[k], Math.max(0, v.storage[k] || 0)); if (h > 0) { v.storage[k] -= h; (H || (H = v._t1196H || (v._t1196H = {})))[k] = ((H && H[k]) || 0) + h; } }
  _t1196Pause(v, false);
}
function t1196Unhide(v) {
  const H = v && v._t1196H; if (!H) return;
  _t1196Pause(v, true);
  for (const k in H) v.storage[k] = (v.storage[k] || 0) + H[k];
  _t1196Pause(v, false);
  v._t1196H = undefined;   // ★[T1203 · T862 ② 캐논] 날 `delete` 는 마을 econ 객체를 V8 사전 모드로 내린다(날마다 · 작업표 든 마을 — `test-econ-fast` ③ 켬 판 최대 9) — 읽는 자리가 전부 참거짓이라 `undefined` = 지운 칸 · 저장(`JSON.stringify`)도 안 싣는다
}
function _t1196Find(v, id) { const Q = v && v._t1196Q; if (!Q) return -1; for (let i = 0; i < Q.length; i++) if (Q[i].id === id) return i; return -1; }
//   재료를 꺼낸다 — 그때 곳간에 있는 만큼. 비율 `f` 는 그 레시피가 **없으면 못 만드는** 재료로 잰다(정본 정의 그대로 · 새 수 0):
//     ⓐ 요리 — 식량(`food`)이 본재료 · 곁재료(`COOK_SIDE_INGREDIENTS`)는 있는 만큼(요리 갈래도 곁재료는 "있으면" 쓴다)
//     ⓑ 갑옷 — `JOBS.armorsmith.inputs` 가 본재료 · `aux`(삼끈 · 모피)는 있는 만큼(갈래 주석 "있으면 소비, 없어도 제작 성립")
//     ⓒ 재봉 — 옷감은 서로 바꿔 쓴다(`CLOTH_MATS` 보온 가중 — 갈래가 그 합으로 잰다) ⇒ f = 있는 보온 ÷ 든 보온
//     ⓓ 석공 · 대장장이 — 든 재료 전부(가장 모자란 재료의 비율)
//   각 재료는 min(있는 것, 든 것 × f) 만큼 나간다 · 받은 비율을 돌려준다.
function _t1196Frac(t, have) {
  const tk = t.take, need = (k) => tk[k] || 0;
  if (t.job === 'tailor') {
    let n = 0, h = 0;
    for (const k in tk) { const wgt = CLOTH_MATS[k] || 0; if (!(wgt > 0)) continue; n += need(k) * wgt; h += Math.min(have(k), need(k)) * wgt; }
    return n > 0 ? Math.min(1, h / n) : 1;
  }
  let f = 1;
  for (const k in tk) {
    if (t.job === 'cook' && COOK_SIDE_INGREDIENTS.indexOf(k) >= 0) continue;
    if (t.job === 'armorsmith' && JOBS.armorsmith.aux && (k in JOBS.armorsmith.aux) && !(k in (JOBS.armorsmith.inputs || {}))) continue;
    const n = need(k); if (!(n > 0)) continue;
    const h = have(k); if (h < n) f = Math.min(f, h > 0 ? h / n : 0);
  }
  return f;
}
function artisanTake(v, id) {
  const i = _t1196Find(v, id); if (i < 0) return -1;
  const t = v._t1196Q[i]; if (t.st !== 0) return t.f;
  _t1196Unres(v, t);
  const H = v._t1196H;   // 틱 조각 사이(비켜 둔 채)에 몸이 오면 제 몫부터 곳간에 되돌린다
  if (H) { _t1196Pause(v, true); for (const k in t.take) { const b = Math.min(H[k] || 0, t.take[k]); if (b > 0) { v.storage[k] = (v.storage[k] || 0) + b; H[k] -= b; if (!(H[k] > T1196_EPS)) delete H[k]; } } _t1196Pause(v, false); }
  const have = (k) => Math.max(0, v.storage[k] || 0);
  const f = _t1196Frac(t, have);
  const sub = t.job === 'tailor';
  for (const k in t.take) { const q = Math.min(have(k), t.take[k] * (sub ? 1 : f)); if (q > 0) v.storage[k] = Math.max(0, (v.storage[k] || 0) - q); }
  t.st = 1; t.f = f;
  if (f < 1 - T1196_EPS) (v._t1196C || (v._t1196C = { made: 0, body: 0, batch: 0, late: 0, short: 0 })).short++;
  return f;
}
//   만든 것을 넣는다 — 든 비율 그대로(곳간 · 금고 · 작업표를 지운다)
function _t1196Put(v, t) {
  const f = t.f;
  for (const k in t.give) { const q = t.give[k] * f; if (q > 0) v.storage[k] = (v.storage[k] || 0) + q; }
  if (v.treasury) for (const k in t.tre) { const q = t.tre[k] * f; if (q > 0) v.treasury[k] = (v.treasury[k] || 0) + q; }
  const G = v._t1196G || (v._t1196G = {});
  for (const k in t.give) G[k] = (G[k] || 0) + t.give[k] * f;   // 계측 전용 누계(몸 · 일괄 합 — 품목별)
}
function artisanGive(v, id) {
  const i = _t1196Find(v, id); if (i < 0) return false;
  const t = v._t1196Q[i]; if (t.st !== 1) return false;
  _t1196Put(v, t); v._t1196Q.splice(i, 1);
  const C = v._t1196C || (v._t1196C = { made: 0, body: 0, batch: 0, late: 0, short: 0 }); C.body++;
  const B = v._t1196B || (v._t1196B = {}); for (const k in t.give) B[k] = (B[k] || 0) + t.give[k] * t.f;   // 계측 전용(몸이 넣은 몫 — 품목별)
  return true;
}
//   하루 머리 — 몸이 어제까지 안 집어 간 작업표는 일괄로(그때 있는 재료 비율 · 예약을 푼다) · 손에 든 지 사흘 넘은 작업표도 일괄로 마친다(몸을 잃었을 때 — 계측 `late`)
function _t1196Day(v, day) {
  const Q = v._t1196Q; if (!Q || !Q.length) return;
  const C = v._t1196C || (v._t1196C = { made: 0, body: 0, batch: 0, late: 0, short: 0 });
  for (let i = 0; i < Q.length;) {
    const t = Q[i];
    if (t.st === 0 && t.day < day) { t.pid = null; artisanTake(v, t.id); _t1196Put(v, t); Q.splice(i, 1); C.batch++; continue; }
    if (t.st === 1 && day - t.day > 3) { _t1196Put(v, t); Q.splice(i, 1); C.late++; continue; }
    i++;
  }
}
// ★★[T347] **걷는 목록** — 이 파일이 안 짓는다. 군락 실체가 대는 품목을 생활층이 세어 주입하고
//   (`world.forageActItems` · `lootOfResource` → `PV_DEPOSIT_MAP` 를 지나 econ 재화로 · 사본 0),
//   여기서는 그 목록과 채집 믹스의 **교집합**만 걷는다. 목록이 없으면 아무것도 안 걷는다(비트 동일).
//   ⚠교집합인 이유: 실체가 대지만 econ 믹스에 없는 품목(`fiber`)은 걷을 것이 없고,
//     믹스에 있지만 실체가 없는 품목(`mushroom`·`vegetable`·`honey`)은 **걷으면 공급원 없이 지우는 셈**이다.
//   ★★[T475 2026-09-28] **마을 목록이 먼저다** — 생활층이 그 마을 채집 원판에 **실제로 선 종**의 품목만 세어 마을에 심는다
//     (`v._forageActItems` · 세계 목록의 부분집합 · 이 파일은 여전히 표를 안 갖는다). 없으면 세계 목록(종전 · 랩·픽스처·CLI 무변).
//     ⇒ 야생 군락이 없는 마을은 버섯·채소를 안 걷는다 — 걷어낸 몫을 **그 마을이 딴다**(걷은 몫 = 딴 몫).
function forageActItemsOf(v) {
  if (!forageActOn(v)) return null;
  const own = Array.isArray(v._forageActItems) ? v._forageActItems : null;
  if (own) return own.length ? own : null;
  const w = v._world || null;
  const a = (w && Array.isArray(w.forageActItems)) ? w.forageActItems : null;
  return (a && a.length) ? a : null;
}
// ★★★[T341 2026-09-21 · ★PM 결정 — T334 뒤] **나무에는 예산이 없다.**
//   두 판을 거쳐 배운 것: 예산이라는 **꼴 자체가 물고기의 것**이었다.
//     T325 셀 예산 — 한 그루도 못 벴다(셀당 0.0087~2.44단 대 한 그루 4~9단 · 배수 2~460).
//     T334 마을 예산 — 베긴 베는데 수식의 30~34%(마을 하루 예산 중앙 2.7~4단 < 한 그루).
//   ⇒ **나무는 개체다.** 있으면 베고 없으면 못 벤다. 하루에 몇 번 오가는지는 **걸음**이 정하고
//     (짐 상한 `carry.js` · 낮 길이 · 걸음 속도 — 전부 정본), 유한성은 **숲 자체와 재생**이 지킨다.
//   ★그래서 예산식(`woodBudgetPerCell`·`woodBudgetDay`)은 **지웠다** — 남은 것은 게이트 하나다.
//
// ★★재생 — T146 개체 장부 문법(로지스틱)이고 **값은 수식에서 유도한다**(새 수 0).
//   유도 셋(전부 남의 정본):
//     ⓐ `h`(그루/일) = `v._woodOutLast`(수식 하루 목재 단) ÷ `w̄`(그 숲 그루당 평균 단 · `lootOfResource`)
//     ⓑ `K`(개체) = **교란 전** 그 마을 숲의 나무 수(색인이 답한다 — 벤 장부를 안 넘기고 물은 수)
//     ⓒ `r` = **`4h/K`** — 로지스틱의 최대지속수확 `MSY = r·K/4` 를 `h` 로 놓고 뒤집은 것이다.
//        ⇒ 숲이 가득(N=K)이면 재생 0 · N=K/2 에서 재생이 최대이고 그 값이 **정확히 수식 하루 합**이다.
//        ⇒ 첫날은 수식보다 많이 베고(숲이 가득) 재생과 만나는 데서 수식으로 수렴한다 —
//          그래서 **등가는 첫날이 아니라 30일 합**으로 건다(설계_생산_실체 ⓓ 한 줄 · T341).
//   ⚠상수가 하나도 없다: `4` 는 로지스틱 MSY 의 계수이고(`r·K/4`) 지어낸 값이 아니다.
//   ★★[T347 2026-09-22] **몸통을 자원 중립으로 갈랐다** — 채집도 **같은 식**을 쓴다(사본 0).
//     갈린 것은 분자를 어디서 읽나 하나뿐이다: 나무는 `_woodOutLast`, 채집은 `_forageOutLast`.
//     식·계수·경계 처리는 **한 벌**이다 — 두 벌이면 한쪽만 고쳐지는 날이 온다(T325 가 그랬다).
function _actRegrowR(day, K, meanUnitsPerEntity) {
  const k = (K > 0) ? K : 0;
  const w = (meanUnitsPerEntity > 0) ? meanUnitsPerEntity : 0;
  if (!(k > 0) || !(w > 0)) return 0;
  if (!(day > 0)) return 0;
  return 4 * (day / w) / k;            // ★MSY = r·K/4 = h 를 r 로 뒤집은 것(새 수 0)
}
function woodRegrowR(v, K, meanUnitsPerTree) {
  const day = (v && typeof v._woodOutLast === 'number' && v._woodOutLast > 0) ? v._woodOutLast : 0;
  return _actRegrowR(day, K, meanUnitsPerTree);
}
// ★[T347] 채집의 같은 유도 — `h` 는 그 마을 채집 수식 하루 합(믹스 전체 · `_forageOutLast`),
//   `w̄` 는 군락 한 개체가 내는 평균 econ 단위(`lootOfResource` 가 답한다 · 이 파일에 표 0).
function forageRegrowR(v, K, meanUnitsPerGrove) {
  const day = (v && typeof v._forageOutLast === 'number' && v._forageOutLast > 0) ? v._forageOutLast : 0;
  return _actRegrowR(day, K, meanUnitsPerGrove);
}
// ★[T341] 그날 돌아오는 개체 — 로지스틱 그 식(`r·N·(1−N/K)`). 음수·초과는 잘라 준다.
//   ★[T347] 이 식은 처음부터 **자원 중립**이었다(N·K·r 뿐) — 이름만 갈라 준다(같은 함수 · 사본 0).
function actRegrowPerDay(N, K, r) {
  const k = (K > 0) ? K : 0, n = (N > 0) ? N : 0;
  if (!(k > 0) || !(r > 0) || !(n > 0)) return 0;
  const g = r * n * (1 - n / k);
  if (!(g > 0)) return 0;
  return (n + g > k) ? (k - n) : g;     // 교란 전 수를 넘지 않는다
}
function woodRegrowPerDay(N, K, r) { return actRegrowPerDay(N, K, r); }
function forageRegrowPerDay(N, K, r) { return actRegrowPerDay(N, K, r); }
// ★[T312] 이 마을이 **행위 어업**으로 도는가 — 손잡이 ∧ 강가 셀이 있다(생활층이 세어 심는다).
//   ⚠둘 다여야 한다. 내륙 마을(강가 셀 0)은 켜도 종전 수식 그대로다 — 몸이 갈 자리가 없다.
function fishActOn(v) { return !!(T312_FISH_ACT && v && (v._t312Cells | 0) > 0); }
// ★[T312] 셀당 하루 예산 — **값이 아니라 식이다**(설계_민물고기 §2 · 새 수 0).
//   그 마을이 지금 수식으로 하루에 내는 양(`_fishOutLast` — T60 ②가 이미 남겨 둔 그 수) ÷ 강가 셀 수.
//   ⇒ 첫날 합은 정의상 수식과 같다(캐논 ⓓ①). 강이 길면 셀당 적고 셀은 많다.
function fishBudgetPerCell(v) {
  const cells = (v && v._t312Cells | 0) || 0;
  if (!(cells > 0)) return 0;
  const day = (v && typeof v._fishOutLast === 'number' && v._fishOutLast > 0) ? v._fishOutLast : 0;
  return day / cells;
}
// ★★[T100 5판 · 재민/PM 판정 2026-09-07] **창설 곳간은 첫 수확까지다.**
//   4판이 드러낸 골짜기: 산출이 밭에 물리는 순간 곡물은 **첫 수확이 날 때까지 0** 인데
//   창설 부존은 `initN × 45` 였다(첫 40일 파종 7,981 · 수확 332 · 곳간은 45일에 바닥).
//   45 는 어디서도 유도되지 않은 수다 — 원 주석이 스스로 말한다("옛 300일치는 글럿").
//   ⇒ **정본 `server/crops.js daysToFirstHarvest(bornDay)`** 가 답한다(파종창 + 익음 시계 ·
//     휴면·춘화 T99 포함 · 겨울 창설이면 봄 첫 파종창까지 굴러간다 · **여유 0**).
//   ⚠**브라우저 번들엔 `crops.js` 가 없다**(카탈로그·날씨·사건까지 끌고 온다 — 번들 대상은
//     era·specialty·econ 셋뿐). 그래서 여기엔 **창설일 0 의 값 하나**를 적어 두고 폴백으로 쓴다:
//     랩이 세우는 마을은 전부 게임일 0 창설이라 그 한 값이면 서버와 갈리지 않는다.
//     하네스가 `crops.js` 에서 **다시 유도해 대조**한다(손으로 고치면 빨개진다).
const SEED_FOOD_DAYS_D0 = 55;        // = crops.daysToFirstHarvest(0) · 게임일 0 = 3월(봄 첫날 · CROP_ANCHOR_MONTH)
const SEED_FOOD_DAYS_LEGACY = 45;    // T86 세계의 그 수 — 손잡이를 끄면 이것 그대로다(비트 동일)
let _cropsMod;
function _crops() { if (_cropsMod === undefined) { try { _cropsMod = require('../server/crops'); } catch (e) { _cropsMod = null; } } return _cropsMod; }
function seedFoodDays(bornDay) {
  if (!T100_FIELD_YIELD) return SEED_FOOD_DAYS_LEGACY;   // ★되돌림 — T86 세계 **비트 동일**
  const C = _crops();
  if (C && typeof C.daysToFirstHarvest === 'function') {
    const d = C.daysToFirstHarvest(bornDay | 0);
    if (d > 0) return d;
  }
  return SEED_FOOD_DAYS_D0;                              // 브라우저 번들 · 정본 부재 폴백(랩은 게임일 0 창설뿐)
}
// ★★[T100 5판 ⓒ · 조건부] **텃밭 하한 — 수확 없는 날의 바닥.**
//   3판에 있던 그 장치다(밭 0칸 마을의 농부 산출이 0 이 아니게). 4판이 산출을 실제 수확으로 옮기면서
//   같이 사라졌는데, 5판 ⓑ(창설 곳간)만으로 골짜기가 안 메워지면 이것이 바닥을 댄다.
//   ⚠**새 수 0** — 셋 다 이 파일·이 저장소가 이미 답한 값이다:
//     · 텃밭 칸수  = 생활층 정본 `server/villages.js LIFE_CLEAR_PDAY`(농부 1인 하루 개간 셀) = 3
//     · 익음 주기  = 창설 곳간과 **같은 유도**(`SEED_FOOD_DAYS_D0` — 한 칸이 한 번 익는 데 걸리는 날)
//     · 수확 한 건 = `T100_K`(4판 유도값)
//   ⇒ 농부 1인 하루 바닥 = 텃밭 칸수 × k ÷ 익음 주기.  실제 수확이 이보다 많은 날엔 **아무 일도 안 한다**(max).
//   ⚠이 하한은 "밭이 실제로 낸 것만 들어간다"는 4판 규약의 **구멍**이다. 그래서 손잡이로 끌 수 있고
//     (`T100_GARDEN=0`), 보고가 **하한이 낸 몫 ÷ 수확이 낸 몫**을 적는다.
const T100_GARDEN_CELLS = 3;         // = server/villages.js LIFE_CLEAR_PDAY (하네스가 두 값을 대조한다)
const T100_GARDEN = process.env.T100_GARDEN !== '0' && !T1243_FARM_ON;   // ★[T1243 ⓑ] 켬 = 하한 걷음(`T100_K` 산출 갈래 — 사본 0)   // 되돌림: ⓑ 만 보려면 T100_GARDEN=0
// ★★[T193 2026-09-12] **장부가 밭을 본다** — 손잡이 하나(기본 **끔**).
//   T186 §0-ⓑ' 가 잰 것: 켠 팔에서 `dailyProductionBuf.food` 가 **정확히 0** 이다(`food` 를 내는 직업은
//   농부뿐인데 켠 팔 농부는 `addProduce` 를 안 탄다) ⇒ `surplusEMA.food` 가 무너져 **마을의 3분의 2가
//   쌀을 쌓아 두고 자기를 적자로 읽는다**(음수 마을·일 30%→65% · 식량 그림자가격 +53~+227%).
//   ⚠`T100_FIELD_YIELD` 켠 팔 **안에서만** 산다 — 끈 팔엔 밭 유입 자체가 0 이라 이 손잡이가 무의미하다.
const T193_LEDGER = process.env.T193_LEDGER === '1';   // 되돌림: 끄면 T186 켠 팔과 **비트 동일**
// ★★[T227 2026-09-13] **밭 산출을 고르게** — 손잡이 하나(기본 **끔**).
//   T218 §0-ⓑ 실측: 켠 팔 볏짚 손실의 55~75% 가 **상한이 버린 몫**이다(원량의 29~33% · 연료 목재의 3.7~4.8%).
//   상한 `N × FIREWOOD_PC` 는 그날 취사·난방 수요라 **짚은 저장이 안 된다** — 몰려 오면 그날로 사라진다.
//   ⚠`T100_FIELD_YIELD` 켠 팔 **안에서만** 산다(끈 팔엔 밭 유입 자체가 없다).
const T227_EVEN = process.env.T227_EVEN === '1';   // 되돌림: 끄면 T193 켠 팔과 **비트 동일**
// ★★[T240 2026-09-13] **곡식은 즉시 · 짚만 이월** — 손잡이 하나(기본 **끔**).
//   T227 이 기각한 것: 곡식을 늦추면(`T227_EVEN`) 창설 곳간이 마르는 60일부터 골짜기가 다시 열려
//   세계가 −22.7~−34.8% 가난해진다. **문제는 곡식이 몰려 오는 게 아니라 짚이 그날 안 타면 사라지는 것**이다.
//   ⇒ 곡식 경로는 **한 톨도 안 건드린다**(`_t100Credit` 무변 · 곳간 즉시 · T227 골짜기 0).
//     짚만 대기량 하나(`v._strawPend`)에 쌓고 **매일 상한만큼** 태운다 — 상한은 종전 그대로
//     `N × FIREWOOD_PC`(그날 취사·난방 수요)다. **새 수 0 · 새 재화 0**(곳간 품목이 아니다 —
//     교역·가격·저장효용·부패 루프 어디에도 안 들어간다. `storage` 키가 늘지 않는다).
//   ⚠**무한 이월이다.** 짚의 부패·보관 정본이 이 저장소에 **없기 때문**이다(§0-ⓐ 표):
//     짚은 품목이 아니고(`storage.straw` 전수 0), `DECAY_RATES`(v1 식품 7종)에도
//     `DECAY_V2` 에도 없다. 가장 가까운 수는 잔가지 `DECAY_V2.twig = 0.001` 인데 **그건 잔가지다.**
//     ⇒ 이월 상한·감쇠는 **이 카드가 정하지 않는다 → 재민**(회부 #28). 대신 이 팔은
//       `_strawPend` 끝 대기·최대를 계측기에 내주어, 상한이 실제로 물릴 자리인지 표가 말하게 한다.
const T240_STRAW_CARRY = process.env.T240_STRAW_CARRY === '1';   // 되돌림: 끄면 종전과 **비트 동일**
// ★[T240] **짚 이월 산수는 이 함수 하나다.** 단위는 짚 kg 이 아니라 **목재 열량 당량**(wood-eq)이다 —
//   `STRAW_FUEL_PER_FOOD` 정본 주석이 그렇게 유도했고(`0.085 × 0.2 ≈ 0.018 wood-eq`),
//   상한 `N × FIREWOOD_PC` 도 `fuelNeed`·`fuelFromWood` 와 같은 축이라 **셋이 같은 단위**다.
//   ⚠그 정본 주석은 같은 줄에서 *"저장 없이 당일 소진(flow)"* 이라고도 적었다. 이 손잡이는
//     **그 전제를 뒤집는 설계 변경**이지 버그 수정이 아니다 — 그래서 기본 끔이고, 표로만 말한다.
//   ⚠총량 무변: 태운 것 아니면 전부 `_strawPend` 에 남는다(질량 누수 0 — 하네스가 항등식으로 문다).
function strawCarryBurn(v, raw, cap) {
  const avail = (raw > 0 ? raw : 0) + (v._strawPend || 0);
  const burn = avail < cap ? avail : cap;
  v._strawPend = avail - burn;
  return burn;
}
const T100_GARDEN_FLOOR = T100_GARDEN_CELLS * T100_K / SEED_FOOD_DAYS_D0;   // 농부 1인 하루 식량등가 바닥(유도값)
// 하루 한 번 — econ 틱이 부른다. 오늘 들어온 수확이 바닥보다 적으면 그 차이만 메운다.
function gardenFloorTopUp(v) {
  if (!T100_FIELD_YIELD || !T100_GARDEN || !v || !v.storage) return 0;
  const fN = (v.counts && v.counts.farmer) || 0;
  //   ★[T368] 켠 팔의 밭은 품목으로 들어온다 — 그 **식량등가**(`_t368InflowToday`)도 오늘 밭이 낸 몫이다(안 세면 하한이 겹쳐 채운다).
  //     비우는 자리는 장부 다리(틱 · 이 뒤)다 — 여기서는 읽기만 한다.
  const got = (v._t100InflowToday || 0) + (T368_FARM_ACT ? (v._t368InflowToday || 0) : 0);
  v._t100InflowToday = 0;
  if (!(fN > 0)) return 0;
  const need = fN * T100_GARDEN_FLOOR;
  const gap = need - got;
  if (!(gap > 0)) return 0;
  v._grainToday = (v._grainToday || 0) + gap;
  const tax = gap * TAX_RATE;
  v.storage.food = (v.storage.food || 0) + (gap - tax);
  if (v.treasury) v.treasury.food = (v.treasury.food || 0) + tax;
  v._t100FloorTot = (v._t100FloorTot || 0) + gap;    // 계측 전용 누계 — 보고가 "하한이 낸 몫"을 적는다
  return gap;
}
// ★무용재 — 실수요(use-value)가 ~0이라 수출해도 식량 못 삼. 식량안보와 무관하게 *항상* 생산 포만(성장기 누적까지 차단).
//   광석(ore): 갑옷에 미량뿐. 장식재(금·은·보석): 화폐화 전엔 수요 0. 돌·금속(구리·주석)은 수요 있어 제외(가치재 수출).
const SAT_ALWAYS = { ore: 1, gold: 1, silver: 1, gem: 1, pearl: 1, amber: 1, jade: 1, ivory: 1 };
if(T1188_ORE_SPLIT)for(const k of OreGoods.ids)SAT_ALWAYS[k]=SAT_ALWAYS.ore;
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
//   집 부족하면 성장만 멈춤(감소 아님). picker가 "집이 거의 찼는데 목재가 모자라면 → 나무꾼" 안전망으로 고리 닫음.
//   ★[T285 정정] 그 안전망은 **`pickDeficitJob_rational`** 의 한 줄이고 조건이 둘이다 —
//     `N ≥ housing × 0.95` **그리고** `wood < N × 2`. 집에 여유가 있는 마을은 이 줄을 못 받는다
//     (그때 나무꾼은 한계가치 후보줄에서 그림자가격으로 이겨야 나온다). 옛 `pickDeficitJob` 의
//     `wood < N × 5` 줄은 `picker:'rational'` 세계에서 **호출 0**이다(3시드 800일 실측).
const HOUSE_WOOD = 1.5;        // 수용력 1인당 목재(한옥=목조)
const HOUSE_STONE = 2.5;       // 수용력 1인당 석재(주춧돌·구들·담장). 준-필수(없으면 건축 30%) → 강한 석재 수요 → 광산 교역·광부 매력↑
const HOUSE_DECAY = 0.0015;    // 일일 노후화(완만 — 나무꾼 1명이면 유지 가능)
const HOUSE_BUFFER = 1.15;     // 인구보다 약간 여유 있게(성장 여지)
const HOUSE_BUILD_MAX = 0.06;  // 하루 최대 증축률(인구 대비)
const HOUSE_START = 20;        // 정착 초기 집(부트스트랩 — 이 크기까진 자라 나무꾼 산업 형성)
// ═══ ★★[2026-08-02d ① 구조 부채] 기아사망 보호막 ═══════════════════════════
// 2026-06-02 **최초 커밋부터** 있던 `if (day < 365)` 클램프다. 코드 고고학 — 원 주석의 의도:
//   "시뮬 초기 365일은 보호 (자리 맞추기 + 교역 시작 시간 확보)"  ⇒ **정착 부트스트랩**이 의도다.
//
// 실측한 병리(음성 대조 시드42, 아래 두 손잡이 OFF):
//   · 보호기간 동안 클램프가 음수 압력을 **누적 5,471 단위 지웠다**(그날치가 말기엔 40+/일).
//   · 그동안 인구는 K 위로 계속 자랐다 — 대가가 없으니 멈출 이유가 없다(d360 인구 1,307).
//   · 366일째 보호막이 걷히자 **20일 창에 433명 사망**. 800일 전체 사망 1,086 중 40%가 그 한 창이다.
//   ⇒ 압력이 저장됐다 터지는 게 아니다. **N ≫ K 를 대가 없이 방치**하다가, 로지스틱의 즉시항이
//     보호막이 사라진 그날부터 전액 청구되는 것이다. 절벽의 정체가 이것이다.
const SHIELD_DAYS = 365;
// ★SHIELD_AGE — 달력이 아니라 **마을 나이**로 센다. 원 의도('정착 부트스트랩')에 정확히 부합하고,
//   라이브의 구멍도 메운다: 지금은 세계 900일째에 새로 선 마을이 보호를 **0일** 받는다(달력이 이미 지났으므로).
//   ⚠랩에서는 전 마을이 day 0 생성이라 나이 == 달력 → **비트 동일**이 기대값이다(그걸 A/B 로 확인한다).
//   ★★기본 ON = **채택**(2026-08-02d). 랩 3시드 A/B 가 **비트 동일**(3,407/3,364/3,473 — cur 과 완전히 같다):
//     전 마을이 day 0 생성이라 나이 == 달력이기 때문이다. 즉 **측정된 위험이 0**이고,
//     값은 전적으로 라이브의 구멍(세계 900일째에 선 마을이 보호 0일)을 메우는 데 있다.
const SHIELD_AGE_ON = !(typeof process !== 'undefined' && process.env && process.env.SHIELD_AGE === '0');
// ★★[T597 2026-10-03] **기근 보호막 끝도 마을마다 편다** — 손잡이 `T597_SHIELD_RAMP`(기본 **끔** · 끄면 종전 바이트).
//   T577: 도적 보호기(`BDT_MIN_DAY`)와 이 보호막이 **같은 날**(365) 걷혀 첫해 겨울 끝 굶는 마을이 한 주에 무너졌다.
//   도적 쪽은 `T577_RAMP`(기본 켬 · `server/bandits.js`)가 이미 편다 — 이건 둘째 절벽이다.
//   퍼짐 = 365 + 해시 × 365(T577 ⓓ 와 같은 폭 · 같은 결정론 해시 문법 — 이름 해시를 `denRng` 섞개에 넣는다 · RNG 흐름을 안 먹는다).
//   ⚠소금(두 번째 인자)이 도적 쪽(577)과 **다르다**(597) — 같으면 한 마을의 두 절벽이 다시 같은 날이 된다.
//   새 수 0 — 폭은 보호막 그 자체(`SHIELD_DAYS`). 켬은 econ 3사본(정본·번들·랩)이라 3시드가 움직인다 ⇒ 켜는 건 PM(판정 0).
const T597_SHIELD_RAMP = (typeof process !== 'undefined' && process.env && process.env.T597_SHIELD_RAMP === '1');
function _t597ShieldExtra(v) {   // 이 마을 보호막이 SHIELD_DAYS 뒤로 더 가는 날 수(0 ~ SHIELD_DAYS−1)
  let h0 = 0; const s = (T1187_NAME_FREE && v && v.coord) ? _t1187Key(v) : String((v && v.name) || '');   // ★[T1187] 켬 = 마을 자리
  for (let i = 0; i < s.length; i++) h0 = (Math.imul(h0, 31) + s.charCodeAt(i)) | 0;
  const a = (h0 >>> 0) % 100003, b = 597;
  let h = (1 ^ Math.imul(a + 1, 2654435761) ^ Math.imul(b + 101, 40503)) >>> 0;   // bandits.js denRng 와 같은 섞개(씨 1)
  h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; h ^= h >>> 16;
  return Math.floor(((h >>> 0) / 4294967296) * SHIELD_DAYS);
}
// ★SHIELD_SOFT — 삼키지 말고 **감쇠**. 보호기간엔 음수 누적을 ×k 로 줄인다(지우지 않는다).
//   압력이 새어나가 보호기간에도 사망이 조금씩 일어나고 → 인구가 K 를 크게 못 넘고 → 절벽이 경사가 된다.
//   ★★기본 ON = **채택**(2026-08-02d).
//     · 채택 기준선 무손상: 실지도 3시드 인구 3,424(cur 3,415) · 소멸 0/19 · 좀비 0 · 도구 +6.6%.
//     · 절벽 → 경사(음성 대조에서 측정): 한 창(20일) 최대 사망이 전체 사망에서 차지하는 비율이
//       시드7 17.7% → **7.6%**, 시드1020 19.1% → 14.5%. 보호기간에 사망이 조금씩 분산돼
//       366일째 몰림이 사라진다(시드7: 151명/창 → 74명/창).
const SHIELD_SOFT_ON = !(typeof process !== 'undefined' && process.env && process.env.SHIELD_SOFT === '0');
const SHIELD_SOFT_K = (typeof process !== 'undefined' && process.env && process.env.SHIELD_SOFT_K != null)
  ? Number(process.env.SHIELD_SOFT_K) : 0.25;
// ★★[T858 2026-10-22 · 재민 10-22 "보호막은 없애는 게 바람직하긴 한데"] **보호막을 걷은 세계를 재는 손잡이** `T858_NO_SHIELD`(★[T1127] 켬 기본 · `'0'` 만 끔 = 보호막 선 종전 바이트 · T858 땐 '1' 만 켬이었다).
//   켜면 기근 보호막(클램프 · 감쇠 · `T597_SHIELD_RAMP` 펴기 — 갈래 전부)이 안 선다 — 첫날부터 음수 압력이 그대로 아래 죽음 사다리로 간다.
//   끄는 자리는 `_shieldT` 판정 한 곳이다(켬 = `SHIELD_DAYS` — 보호가 끝난 마을과 같다) · 보호 조건 줄은 한 글자도 안 바뀐다(`test-frontier-iron ③` 계약).
//   새 수 0 — 쓰는 수는 보호막 그 자체(`SHIELD_DAYS`). 재는 카드라 켜는 건 재민(판정 0 · T858).
// ★★[T1127 2026-11-04 · ★재민 11-03 문 1-b ⓐ] **켬 기본(보호막 걷음)** — `=0` 만 끔(= 보호막 선 종전 바이트) · 미설정 · 빈 값 · 그 밖 = 켬 · 브라우저 shim 빈 env = 켬.
//   재민 11-03: "어차피 평형을 찾아 유지하면 되는 것 · 보호막 때문에 드러나야 할 문제가 365일 뒤에야 드러나는 게 싫었다."
const T858_NO_SHIELD = !(typeof process !== 'undefined' && process.env && process.env.T858_NO_SHIELD === '0');
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
// ★★[T180 2026-09-12] STONE_NET **1차 문턱을 이름으로 올렸다**(값 무변 · 아래 두 게이트가 쓰던 그 수).
//   올린 이유: T173 §0-ⓑ 가 잡은 결함 — 캐러밴 **수출 후보 문턱**(`target×0.8`)이 이 수를 **모른다**.
//   그래서 절반 넘는 날을 `돌<0.2` 로 사는 마을이 어쩌다 재고가 차면 그걸 잉여로 읽고 **실어 보낸다**
//   (실측: 바닥 36마을이 800일에 8,110~11,947 단위를 수출한다). 그 게이트가 이 수를 읽어야 하는데
//   저쪽에 다시 적으면 그게 사본이다. **수는 여기 하나뿐이다**(`test-lab-stone` 이 대조한다).
const STONE_NET_STOCK = 0.2;
// ★[T1049] 돌 바닥 — `server/livelihood.js` `FLOOR.stone`(바위 지형이 전혀 없는 마을의 land.stone · 정본 0.25)와 같은 값이다.
//   sim 은 server 를 못 싣는다(번들 규약) — 이 파일은 그 값을 STONE_NET 문(위 1915 · 4993 · 5032 의 `0.2499`/`0.25`)에 글자로 써 왔다.
//   이름 하나로 묶어 v2 수출 문이 읽는다(새 수 0 · 하네스 `test-floor-stone` 가 livelihood 정본과 같은지 본다).
const STONE_FLOOR_LAND = 0.25;
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
const _firewoodPC = () => (T1135_FUEL_EQ ? FIREWOOD_PC_SRC : FIREWOOD_PC);   // ★[T1135 ④] 켬 = 고증 d · 끔 = 같은 상수(비트 동일)
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
// ★★[2026-08-02d ② 석재 원장이 잡은 이중 차감]
//   이 줄(2026-07-12 "돌 감산 자연화 — 담장·구들·바닥·숫돌이 닳는다, 인구 비례 석재 실소비")과
//   v2 `SUBSISTENCE_PER_NPC.stone = 0.04` ("주거 수요: 집(한옥)의 **건축·보수**에 목재·석재 소비")는
//   **같은 물리를 두 번 적는다.** 게다가 '건축' 몫은 v1 주거 증축(HOUSE_STONE)이 이미 실물로 차감한다.
//   원장 실측(음성 대조 시드42 800일 세계 합계):
//       생산(채집) +59,138  ·  v2 생계소비 −21,173  ·  v1 건축유지 −11,081  ·  주거 신축 −4,556
//     ⇒ 인구 비례 '유지' 명목으로만 **32,254 = 생산의 55%** 가 나간다(둘을 합쳐서).
//   ⚠v2 쪽을 못 줄이는 이유: `SUBSISTENCE_PER_NPC` 는 소비 말고 **가격·부패 목표(subs×30)**의 입력이라
//     건드리면 석재 시장 전체가 흔들린다. 이 줄은 순수 소비라 여기가 수리 지점이다.
//   ★★기본 **0.02 유지 = 이월·회부**(2026-08-02d). 중복은 실재하지만 수리의 대가가 측정됐다:
//     STONE_MAINT=0 단독 인구 3,357(−1.7%) · 다른 채택분과 함께면 3,274(−4.1%, 시드42 는 −11%).
//     소멸 0·좀비 0 은 유지되지만 인구 기준선(~3,415)을 깎는다. 석재 수요는 "산골 마을이 석재 수출로
//     식량을 사는" 축이라(v2 주석) 줄이면 광산촌 소득이 함께 준다 — **경제 설계 판단**이라 회부한다.
//     `STONE_MAINT=0` 으로 언제든 켠다. 근거·원장은 회부_석재_이중차감.md.
// ★★[2026-08-02e ① 실측 결론 — **이월(기각)**] 두 수리안 모두 인구 기준선을 깼다. 3시드 800일:
//     현행(0.02+0.04)         인구 3,424 · 소멸 0 · 좀비 0 · 산골 1인당 부 18.1 · 돌수출 5,640
//     STONE_MAINT=0 (v1 끔)   인구 3,274(−4.4%) · 소멸 0 · **산골 부 21.4(+18%)** · 돌수출 3,961(−30%)
//     STONE_MAINT_UNIFY (총량보존) 인구 3,049(−11%) · 소멸 0 · **산골 부 25.5(+41%)** · 돌수출 4,897
//   ★읽는 법: 산골 **1인당** 부는 둘 다 올랐는데 **총인구는 떨어졌다.** 모순이 아니다 —
//     석재 유지 수요는 낭비가 아니라 **채집·채광 노동을 먹여 살리는 수요**다. 그걸 걷으면
//     돌 산지는 인구가 줄어 1인당은 오르고, 세계 전체는 그만큼 작아진다.
//     총량 보존안이 **더 나쁜** 이유도 같다: 총 소비는 같은데 v2 쪽 값이 올라 가격·부패 목표(subs×30)가
//     50% 뛰고, 그 신호가 노동을 석재로 더 끌어당겨 식량 축을 깎는다.
//   ⇒ 규칙대로 **기준선을 깨는 손잡이는 채택 불가**. 두 손잡이는 남긴다(석재 시장을 다시 설계할 때 쓴다).
//     대신 **기재를 고친다** — 아래 두 주석이 "각자 전부"라고 말하던 것을 "한 물리의 두 몫"으로 바로 적는다.
//     실물 총량 0.06/인/일 = v2 0.04(집·구들·바닥 = 주거 본체) + v1 0.02(담장·숫돌 등 **부대 시설**).
//     즉 이중 기재가 아니라 **분할 기재**였다 — 문제는 두 주석이 각자 전부인 척한 것이다.
const STONE_MAINT_UNIFY_DOC = 1;   // (위 문단이 이 상수의 전부다 — 코드는 안 쓴다)
// ★수리 손잡이(둘 다 기본 OFF — 실측 기각):
//   `STONE_MAINT_UNIFY=1` 이면 v1 의 이 줄을 0 으로 내리고 v2 `SUBSISTENCE_PER_NPC.stone` 을
//   0.04 → 0.06 으로 올린다(합계 불변). 물리는 한 곳에서만 적히고 **총 수요는 그대로**다.
//   덤으로 v2 쪽이 가격·부패 목표(subs×30)의 입력이라, 이제 목표가 **실제 소비량을 정확히** 반영한다
//   (지금은 0.06 을 쓰면서 목표는 0.04 로 잡고 있었다 — 그 자체가 또 하나의 불일치였다).
const STONE_MAINT_UNIFY = (typeof process !== 'undefined' && process.env && process.env.STONE_MAINT_UNIFY === '1');
const STONE_MAINT_PC = STONE_MAINT_UNIFY ? 0
  : ((typeof process !== 'undefined' && process.env && process.env.STONE_MAINT != null)
    ? Number(process.env.STONE_MAINT) : 0.02);
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
function _warlikeMult(v) {
  if (T1187_NAME_FREE) { const th = _t1187FeudTh(); return (th != null && (v._grudgeMax || 0) >= th) ? WARLIKE_WT_MULT : 1.0; }   // ★[T1187] 켬 = 묵은 원한(아래)
  return _hashStr('warlike|' + (v.name || '')) > WARLIKE_THRESH ? WARLIKE_WT_MULT : 1.0;
}
// ★★[T1187 2026-11-06 · ★재민 11-05 "이름이 경제를 바꾸지 않게" · 족보 760 추상 없애기 · 손잡이 `T1187_NAME_FREE`(기본 끔 · `'1'` 만 켬 · 끔 = 위 종전 줄 그대로)]
//   **호전 마을을 이름 해시가 아니라 실물로 고른다** — 그 마을이 지금 묵은 원한을 품고 있나:
//   전쟁 층(`war-core`)이 날마다 마을마다 가장 큰 원한(`_grudgeMax` — 원한 EMA 의 최댓값 · 그 층이 적는 칸)을 적는다.
//   그 값이 전쟁 층의 **"묵은 원한(feud)" 문턱 `WAR_FEUD_TH`**(전쟁 층이 명분 '원한'을 세우는 그 선 · 그 파일에서 읽는다 · 새 수 0) 이상이면 호전 —
//   위협 때 동원 배수(`WARLIKE_WT_MULT`)와 봉헌검(아래 의례 절)은 종전 그대로 그 마을에만 붙는다.
//   ⇒ 전쟁을 당해 원한이 쌓인 마을이 더 크게 동원하고, 원한이 식으면(EMA 감쇠) 풀린다. 이름을 바꿔도 아무것도 안 바뀐다.
//   전쟁 층이 없는 판(랩 · 하네스의 맨 econ)에선 `_grudgeMax` 가 안 적혀 호전 마을이 0 이다(보고 T1187 §3 — 종전은 이름 운으로 ~28 %).
const T1187_NAME_FREE = (typeof process !== 'undefined' && !!process.env && process.env.T1187_NAME_FREE === '1');
// ★[T1187] 이름 대신 쓰는 열쇠 — 마을 자리(`coord` = 가운데 칸 × 2.5 · 호스트가 세울 때와 다시 뜰 때 같은 칸에서 붙인다 · 세계 안에서 하나).
//   쓰는 자리 셋(켬만): 마을 주사위 흐름 씨(`_t731StreamInit` — T744 가 이름을 고른 까닭 "세계 안에서 하나 · 프로세스 계수기 무관"을 자리도 지킨다) ·
//   기근 보호막 펴기(`_t597ShieldExtra` · 끔 기본 손잡이) · (도적 보호기는 `server/bandits.js` 가 같은 손잡이로 가운데 칸을 쓴다).
function _t1187Key(v) { return 'xy|' + v.coord.x + ',' + v.coord.y; }
let _t1187Feud;
function _t1187FeudTh() { if (_t1187Feud === undefined) { try { _t1187Feud = require('./war-core').WAR_FEUD_TH; } catch (e) { _t1187Feud = null; } if (!(_t1187Feud > 0)) _t1187Feud = null; } return _t1187Feud; }

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
// T1259: slot geometry comes from the server's canonical standing-tree reader.
// No reader in a standalone lab: preserve its non-spatial land model.
const T1259_WOOD_CAP = (typeof process !== 'undefined' && process.env && process.env.T1259_WOOD_CAP === '1');
let _t1259WoodReader = null;
function setT1259WoodReader(reader) { _t1259WoodReader = typeof reader === 'function' ? reader : null; }
// ★[T1271 · T1266 회부 4 — PM 판정] 광부 자리 = 몸이 집(회관)에서 닿는 광맥 셀(재고 ≥ 1) × 종전 계수 0.30 — T1259 나무 자리와 같은 꼴(서버가 읽는 수 · 사본 0).
//   ★★[T1277 · T1271 회부 2 — PM 판정 "광부 한 몸이 하루 실제로 치는 셀 수에서 유도 · T1259 0.30 을 광맥에 쓰지 않는다"] 읽개가 **자리**를 준다 —
//     닿는 셀 × 조 사람 수(서버 `_t1277OreSlots` · 2인 1조 · 한 몸이 하루 치는 셀 = 1/2 실측). econ 은 0.30 을 안 곱한다. 읽개 없음(null)은 종전 땅 모형 × 0.30 그대로.
//   손잡이 `T1271_ORE_CAP`(끔 기본 · `=1` 만 켬). 읽개가 없으면(랩 · 헤드리스) 종전 땅 모형 그대로. 닿는 셀 0 = 광부 자리 0(강제 아님 — 자리가 안 선다).
const T1271_ORE_CAP = (typeof process !== 'undefined' && process.env && process.env.T1271_ORE_CAP === '1');
let _t1271OreReader = null;
function setT1271OreReader(reader) { _t1271OreReader = typeof reader === 'function' ? reader : null; }
function jobCapacity(v) {
  const s = effectiveLandSize(v);
  // ★비옥도 이중산입 분리: 농부 '자리'=경작지 *면적*(arable, 공간 실측·폴백 min(1,fert)) — 지력(fertility)은 1인 산출에만.
  //   (옛 s×fert×0.4는 fert가 자리와 산출에 제곱으로 들어가 극비옥지 인구 폭증[250~400]의 뿌리.
  //    숲·사냥·어장은 밀도=면적이라 이중산입이 의미 있음 — 유지. 광맥도 크기∝노동력 — 유지.)
  const arable = v.land.arable != null ? v.land.arable : Math.min(1, v.land.fertility);
  const standing = T1259_WOOD_CAP && _t1259WoodReader ? _t1259WoodReader(v) : null;
  const oreReach = T1271_ORE_CAP && _t1271OreReader ? _t1271OreReader(v) : null;   // ★[T1271] 닿는 광맥 셀 수(null = 읽개 없음 · 종전)
  const c = {
    farmer:     Math.floor(s * arable * 0.4),
    fisher:     Math.floor(s * v.land.water     * 0.25),
    hunter:     Math.floor(s * v.land.game      * 0.30),
    lumberjack: Math.floor((standing == null ? s * v.land.wood : standing) * 0.30),
    miner:      oreReach == null ? Math.floor(s * Math.max(v.land.ore || 0, v.land.obsidian || 0, v.land.jade || 0, v.land.tin || 0) * 0.30) : Math.floor(oreReach),   // ★S1 광부=금속 전담: 광맥(ore) ★S5 +특수산지(흑요석·옥) ★청동 희소성 +주석산지 · ★[T1277] 읽개 = 자리 그대로(닿는 셀 × 조 사람 수 — 서버가 센다 · 0.30 안 곱한다)
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

// ═══ ★★[2026-08-03a ⑰ 재민 확정] 국고 **현금**을 확장 회로에 잇는다 ═══════════════
//   실측된 사실: `treasury._cash` 는 엔진에서 **쓰기 전용**이었다 — 교역세로만 늘고(v2 2곳)
//   읽는 곳이 0이라 1,600일에 1인당 55.5 → 104.0 으로 **선형 누적**만 했다.
//   그런데 국고는 이미 공공 사업을 하고 있다 — 바로 아래 확장 블록이 `treasury.food/wood/stone`
//   을 쓰고, 모자라면 그날 `return` 으로 멈춘다. **현금만 그 회로 밖에 있었다.**
//   ★★[2026-08-03d 재민 캐논으로 재해석 — 코드 무변]
//     재민: *"교역 세금은 물물교환할 때 드는 물건이고, 방문한 쪽이 더 낸다."*
//     ⇒ `_cash` 는 화폐가 아니라 **미상환 세곡 채권 장부**다(실물 이전은 이미 곳간에서 끝났다).
//     그러면 이 함수는 "국고가 현금으로 물건을 산다"가 아니라
//     **"국고가 채권으로 곳간에서 실물을 찾아간다"** — 즉 **상환**이다.
//     규약 넷이 그 번역에서 전부 자연스러워진다: 정본 가격 = 채권의 실물 환산율 ·
//     채권이 실제로 줄고 · **가계 유보 초과분만**(마을을 팔아 상환받지 않는다) · 원자적(부분 상환 없음).
//   ⇒ 화폐를 새로 설계하지 않는다. **멈추는 그 줄에서 채권으로 부족분을 상환받는다.**
//     새 재화 0 · 새 직업 0 · 새 효과 0 — 이미 있는 가격·재고·유보 기구를 그대로 쓴다.
//
//   ★네 가지를 지킨다(재민 지시 그대로):
//     ① 가격을 새로 만들지 않는다 — `_matPrice(v)`(마을 그림자가격, 정본 함수)로 환산한다.
//     ② 현금이 **실제로 그만큼** 줄어야 한다 — 무에서 재화를 만들지 않는다.
//     ③ **시장 재고가 없으면 못 산다** — 현금은 만능이 아니다. 파는 쪽은 마을 곳간이고,
//        살 수 있는 양은 **가계 유보(RESERVE_PC/인)를 넘는 잉여**뿐이다(정본 유보표 재사용).
//        곳간을 유보 아래로 긁어 확장하면 그건 "부"가 아니라 마을을 파는 것이다.
//     ④ **외상 금지 — 원자적이다.** 세 재화를 전부 못 채우거나 현금이 모자라면 **한 톨도 안 산다**
//        (하네스가 반복해서 지켜 온 "거부인데 재료가 깎이지 않았다" 규약).
//   ★★**채택(2026-08-03a · 기본 ON)** — 3시드 실측. 되돌리기: `TREASURY_BUY=0`.
//     800일  : 인구 3,424 → 3,549(+3.7%) · 확장셀 2,667 → 3,756(+41%) · 현금/인 55.6 → 39.9
//     1,600일: 인구 3,991 → **4,502(+12.8%)** · 무기Q 1,041 → **1,150(+10.5%)** · 확장셀 8,470 → 16,684
//              · 현금 기울기 59.8 → **53.1**(−11% — 선형 누적이 꺾였다) · **소멸 0 · 좀비 0 유지**(하드 조건)
//     발동 실측: 19마을 중 **11곳**이 실제로 매수(매입 재화 4,120 · 지출 현금 1,493) — 사문 아님.
//   ⚠800일 시점만 보면 무기Q −3.6%·산골 1인당 부 −4.6% 로 **미달**이다. 그런데 시드별 방향이
//     갈리고(무기Q 2/3 하락·1/3 상승) 1,600일엔 **3/3 상승(+6~19%)**으로 뒤집힌다. 확장 투자
//     국면에서 자원이 땅으로 가느라 무기 축적이 늦고, 그 땅이 결실을 내면 앞선다 — 자연스러운 순서다.
//     산골 1인당 부 −7% 도 같은 착시다: **총량은 +4.9%** 인데 인구가 12.8% 늘어 1인당이 희석된 것이다.
const TREASURY_BUY_ON = !(typeof process !== 'undefined' && process.env && process.env.TREASURY_BUY === '0');
function _treasuryTopUp(v, need) {
  if (!TREASURY_BUY_ON) return false;
  const cash = (v.treasury && v.treasury._cash) || 0;
  if (!(cash > 0)) return false;
  const price = _matPrice(v);
  const N = v.npcs.length || 1;
  const plan = [];
  let total = 0;
  for (const r in need) {
    const deficit = need[r] - (v.treasury[r] || 0);
    if (!(deficit > 0)) continue;
    // 살 수 있는 것 = 곳간 잉여(가계 유보 초과분)뿐. 유보 잣대는 정본 RESERVE_PC (사본 금지).
    const avail = (v.storage[r] || 0) - (RESERVE_PC[r] || 0) * N;
    if (!(avail >= deficit)) return false;      // 시장에 물건이 없다 → 못 산다(부분 구매 없음)
    const p = price(r);
    if (!(p > 0)) return false;
    plan.push({ r, qty: deficit, cost: deficit * p });
    total += deficit * p;
  }
  if (!plan.length) return false;               // 살 게 없다(=애초에 부족하지 않았다) — 호출부 오류 방지
  if (total > cash) return false;               // 돈이 모자라면 아무것도 안 산다(외상 금지)
  for (const it of plan) {
    v.storage[it.r] -= it.qty;                  // 곳간 → 국고. 재화는 **이동**할 뿐 생성되지 않는다
    v.treasury[it.r] = (v.treasury[it.r] || 0) + it.qty;
  }
  v.treasury._cash = cash - total;              // 현금은 실제로 준다
  v._tbBought = (v._tbBought || 0) + plan.reduce((a, x) => a + x.qty, 0);   // (계측 전용)
  v._tbSpent = (v._tbSpent || 0) + total;
  return true;
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
  // ★★[T1238 ①] 서버가 영토를 몸으로 치르는 판(`v._t1238Land` — 서버가 켬에서만 심는다)이면 금고로 땅을 안 산다(같은 땅을 두 번 치르지 않는다 ·
  //   econ 땅 크기는 서버 영토에서 읽는다). 표지가 없으면(끔 · 랩 · 헤드리스 하네스) 종전 그대로. 위 세 줄은 읽기만이다(자리 셈 — 부작용 0).
  if (v._t1238Land) return;
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
    if (v.treasury.food < cellFood || v.treasury.wood < cellWood || v.treasury.stone < cellStone) {
      // ★[2026-08-03a ⑰] 여기가 그 "그날 중단" 줄이다 — 현금이 있으면 곳간 잉여를 사서 채우고 계속한다.
      //   손잡이 OFF 면 `_treasuryTopUp` 이 즉시 false 라 **아래 return 만 남는다**(비트 동일).
      if (!_treasuryTopUp(v, { food: cellFood, wood: cellWood, stone: cellStone })) return;   // 금고 부족 — 그날 중단
    }
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
    id: _curV ? ('n' + _curV.id + '.' + (_curV._nid = (_curV._nid | 0) + 1)) : 'n' + (_nextNpcId++),   // ★[T731] 켬 = 마을 안 계수기(차례 무관)
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
const T1227_TRAIT_FREE = !(typeof process !== 'undefined' && process.env && process.env.T1227_TRAIT_FREE === '0');
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
  if (skill === trait && trait < 10 && (T1227_TRAIT_FREE || npc.spentTraits < 30)) {   // ★[PM land1053 · ★재민 11-08] 특성 합 30 제한 걷음(자연사가 들어가 끝없이 세지지 않음 · 분야마다 10 은 그대로 · `T1227_TRAIT_FREE=0` = 종전)
    npc.traits[f] += 1;
    npc.spentTraits += 1;
    // 다음 day부터 다시 xp 누적 가능
  }
  // trait 다 찍었거나 30점 다 썼으면 xp 멈춤
}

// 직업 전환 — currentJob만 바뀜. skill/trait/xp 모두 보존 (NPC는 영구 학습).
function switchNPCJob(npc, newJob, day, v) {
  // ★[T295 ①] 징발자는 마을에 없다 — 아무도 그 사람의 일을 바꿀 수 없다(자리는 이미 비어 있다).
  //   ⚠이 한 줄이 없으면 비운 자리를 전환이 또 세어 `counts` 합이 인구를 넘는다(실측 30명 마을에 31).
  //   전쟁이 없으면 마크가 없다 = 종전 비트.
  if (npc._warDraft) return;
  const oldJob = npc.currentJob;
  if (v) {
    v.counts[oldJob] = (v.counts[oldJob] || 0) - 1;
    v.counts[newJob] = (v.counts[newJob] || 0) + 1;
  }
  npc.currentJob = newJob;
  npc.lastJobChangeDay = day;
}

// ★[T1085 · 재민 11-02] 개인 전환 쿨다운 — 자율 전환 두 자리(무장불가 전사 동원해제 · 잉여 직군 차출)가 쓰던 `30` 그대로를 한 이름으로(값 무변).
//   촌장 지정(`assignNPCJob`)도 같은 수를 읽는다 — 지정한 사람은 이 기간 자율 전환에서 빠진다(바뀐 날 = `lastJobChangeDay`).
const JOB_SWITCH_COOLDOWN = 30;
// ★[T1085] 굶을 때 = 식량 등가가 N × 30 일치 밑(직업 전환 가속 · 피커 기근 문과 같은 문턱 · 새 수 0).
//   그때 자율 식량 전환은 지정보다 앞선다(배고픈 사람은 밭으로) — 지정 쿨다운이 그 전환만 막지 못한다.
const _T1085_FOOD = { farmer: 1, fisher: 1, hunter: 1, forager: 1 };   // 피커 `foodOpts` 넷 그대로
function _t1085Hungry(v) { return totalFoodEquivalent(v) < (v.npcs.length || 1) * 30; }
// ★[T1085] 촌장 지정 — 자율 전환과 **같은 규칙**만 묻는다(새 규칙 0): 징발(마을에 없다) · 포로 무기 직 금지 · 개인 쿨다운 ·
//   자리(`hasSlot` × `jobCapacity`) · 전사 = 무기 하나에 한 사람(무장불가 전사 동원해제 문과 같은 비교). 통과하면 `switchNPCJob` 그대로.
//   반환 { ok } | { ok:false, why, left? } — 이유 글자는 부르는 쪽(서버)이 쓴다(econ 은 글자 0).
//   ⚠econ 은 지정 표지(`npc._chiefAssignDay`)를 자율 전환에서만 읽는다 — 표지가 없으면 종전 비트 그대로.
function assignNPCJob(v, npc, job, day) {
  if (!v || !npc || !Array.isArray(v.npcs) || v.npcs.indexOf(npc) < 0) return { ok: false, why: 'member' };
  if (!JOBS[job]) return { ok: false, why: 'job' };
  if (npc._warDraft) return { ok: false, why: 'draft' };
  if (npc.currentJob === job) return { ok: false, why: 'same' };
  if (npc.captive && CAPTIVE_JOB_BAN[job]) return { ok: false, why: 'captive' };
  if (t1113On('T1113_REFUSE_ASSIGN') && t1113Unhappy(v)) return { ok: false, why: 'unhappy', happy: t1113Happy(v) };   // ★[T1113 ①] 행복이 중립 밑이면 촌장 말을 안 듣는다
  const since = day - (npc.lastJobChangeDay == null ? -999 : npc.lastJobChangeDay);
  if (since < JOB_SWITCH_COOLDOWN) return { ok: false, why: 'cool', left: JOB_SWITCH_COOLDOWN - since };
  const counts = jobCounts(v);
  if (!hasSlot(v, job, jobCapacity(v), counts)) return { ok: false, why: 'slot' };
  if (job === 'warrior' && (counts.warrior || 0) >= Math.floor((v.storage && v.storage.weapon) || 0)) return { ok: false, why: 'weapon' };
  switchNPCJob(npc, job, day, v);
  npc._chiefAssignDay = day;
  return { ok: true };
}
// ═══ ★[T1113 · 재민 11-02] 행복이 낮을 때 효과 셋 — 손잡이 셋(다 **끔 기본** · 켜는 값 `'1'` · 랩 `window.<이름> = 1`) ═══
//   문턱 = econ 행복 중립점 0.5(`happiness: 0.5 기준` · T209 하한이 배수를 1 로 자르는 자리) — T1075 평형 행복이 아직 main 에 없어 **지금 행복 값**(`lastStats.happiness`)을 읽는다.
//   세기 = 행복 → 작업량 식(T157 · `happyWorkMul`)의 아래쪽 그대로 — T209 가 1 로 잘라 둔 몫(1 + (h − 0.5) × H · 하한 1 − H/2)을 **식량 외에만** 되살린다(새 수 0).
//   ① `T1113_REFUSE_ASSIGN` — 촌장 지정(`assignNPCJob`)을 거부한다. 자율 전환(굶을 때 식량직 포함)은 이 문을 안 지난다.
//   ② `T1113_REFUSE_MUSTER` — 출정(선전포고 `war-core warMobilize`)을 거부한다(공격하는 마을 행복 기준 · 지키는 쪽은 그대로).
//   ③ `T1113_LOW_QUALITY` — 식량 외 산출 · 도구 · 무기 · 옷 품질 목표에 위 배수를 곱한다(식량 · 조리식 품질은 그대로).
//   끄면 이 블록은 한 줄도 안 돈다(종전 비트).
function t1113On(name) { const x = _allocKnob(name); return x !== null && x !== '0'; }
const T1113_HAPPY_MID = 0.5;   // econ 행복 중립점(위 주석) — 이름만 붙였다
function t1113Happy(v) { const h = v && v.lastStats && v.lastStats.happiness; return (typeof h === 'number' && isFinite(h)) ? h : null; }
function t1113Unhappy(v) { const h = t1113Happy(v); return h !== null && h < T1113_HAPPY_MID; }
//   ③ 의 배수 — 행복이 중립 밑이면 `happyWorkMul` 의 T209 앞 식(아래쪽), 아니면 1.
function t1113LowMul(v) {
  const h = t1113Happy(v); if (h === null || !(h < T1113_HAPPY_MID)) return 1;
  const W = happyWorkWOf(v); if (!(W > 0)) return 1;
  return Math.max(1 - W * 0.5, 1 + (h - T1113_HAPPY_MID) * W);
}
//   식량인가 — 곳간 식량 등가(`totalFoodEquivalent`)가 세는 그 표들 그대로(사본 0)
function t1113IsFood(v, r) {
  if (r === 'food' || r === 'fish' || r === 'meat' || r === 'cooked_food') return true;
  if (FORAGE_FOOD_FACTOR[r] != null || PRESERVED_FOODS.indexOf(r) >= 0 || RAW_GRAINS.indexOf(r) >= 0) return true;
  const own = _t368Crops(v); if (own) for (const [k] of own) if (k === r) return true;
  return false;
}
// ★[T1085] 촌장 화면이 고를 직업 — 이 땅에 자리가 하나라도 있는 직업(`jobCapacity` > 0)과 지금 빈자리 여부. 읽기 전용.
function assignableJobs(v) {
  const cap = jobCapacity(v), counts = jobCounts(v), out = [];
  for (const j of JOB_NAMES) if ((cap[j] || 0) > 0) out.push({ job: j, open: hasSlot(v, j, cap, counts) });
  return out;
}

// NPC 기회비용 — ★시장가치(한계생산 × 그림자가격). 픽커 한계가치와 *동일 척도*라
//   switch-in(부족직)·switch-out(잉여직)이 대칭(Lewis 노동이동). 글럿(가격폭락) 재화
//   생산자(예: 도구 과잉 마을의 대장장이 → 도구가격↓)는 가치가 낮아 1순위로 차출됨.
//   w(r) = 그림자가격 가중(없으면 1). 숙련 보너스로 명인은 약간 덜 차출(마을 내 비교우위).
function opportunityCost(npc, v, w) {
  w = oreWeights(v,(typeof w === 'function') ? w : (_ => 1.0));
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
  const r = T1187_NAME_FREE ? 0.5 : _hashStr('tin|' + (opts.name != null ? opts.name : ''));   // [0,1) 결정론 지터(소량) · ★[T1187] 켬 = 지터 없음(가운데 0.5 — score = ore × 1.0 · 이름 무관 · 이 갈래는 `oreMix` 없는 부름만 탄다)
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
  if(T1188_ORE_SPLIT){const m=OreGoods.heldMix(v?.storage);return Object.keys(m).length?m:oreSourceMix(v);}
  return _oreMapMix(v);
}
// 지도 · 수입이 아는 원석 조성(유효 조성 → 땅 조성 · 없으면 null) — 원석 쪼개기 전 `oreMixOf` 의 몸 그대로(T1249 가 나눠 냄 · 사본 0).
//   null = 이 마을의 원석이 무엇인지 모른다(지도 정보 없는 호출부 — 랩 · CLI) ⇒ 쪼개기 전엔 녹이지 않았다(`_trySmelt` · `smeltTarget` 첫 줄).
function _oreMapMix(v) {
  if (ORE_MIX_EFF_ON) {
    const e = v && v._oreMixEff;
    if (e && typeof e === 'object') { for (const k in e) if (e[k] > 0) return e; }
  }
  return (v && v.land && v.land.oreMix) || null;
}
// ★★[T1249 2026-11-10 · 손잡이 `T1249_ORE_FIX` — 끔 기본 · 켬 후보] 원석 쪼개기(T1188)는 조성을 모르는 마을(`_oreMapMix` = null)의 원석을
//   광종 풀(`OreGoods.POOL` — 은 · 납 · 금 · 흑요석 …)로 나눠 곧장 녹였다. 쪼개기 전엔 그런 마을은 녹이지 않았다 ⇒ 랩 광산촌이 첫날부터
//   대장장이 6 명을 뽑고(제련 문) 그 숯이 목재를 먹어 목재값 ≈ 700 · 나무꾼 한계가치가 광부의 100 배 — 광부가 안 선다(보고 T1249 §1).
//   켬 = 쪼개기 판에서도 조성을 모르는 마을은 안 녹인다(쪼개기 전 규칙 그대로 · 새 수 0). 끔 = 종전.
function t1249On() { const x = _allocKnob('T1249_ORE_FIX'); return x !== null && x !== '' && x !== '0'; }
function _t1249NoSmelt(v) { return T1188_ORE_SPLIT && t1249On() && !_oreMapMix(v); }
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
// ══ ★★[T443 2026-09-27] 제련 연료도 실물 — 정본 `server/smelt-uses.js`(원석 1 = 숯 2 · 숯 1 = 통나무 3÷2) · 손잡이 `T443_SMELT_FUEL` · ★T471 기본 켬(넷째 판-c · 되돌림 `=0`) ══
//   켬이면 대장장이가 원석을 녹일 때 **숯을 뺀다** — 곳간의 숯(`charcoal` · specialty 품목 그대로 · 새 품목 0)이 먼저이고,
//   모자라면 그 자리에서 **노천 탄화**(시설 없이 되는 레시피)로 통나무를 태워 숯을 낸다(econ 마을엔 숯가마가 없다).
//   통나무도 모자라면 **있는 연료만큼만** 녹인다(연료가 없으면 제련이 안 돈다 = 행위). 끔 = 이 함수는 안 불린다(비트 동일).
const T443_SMELT_FUEL = process.env.T443_SMELT_FUEL !== '0';   // ★[T471] 기본 켬(넷째 판-c) · 되돌림 `T443_SMELT_FUEL=0` = 넷째 판-b 비트 동일
let _smeltMod;
function _smeltUses() { if (_smeltMod === undefined) { try { _smeltMod = require('../server/smelt-uses'); } catch (e) { _smeltMod = null; } } return _smeltMod; }
function smeltFuelOn() { return T443_SMELT_FUEL && !!_smeltUses(); }
function smeltFuelPerOre() { const S = _smeltUses(); return S ? S.fuelPerOre() : null; }
// 원석 `want` 덩이를 녹일 연료를 댄다 — 댈 수 있는 만큼의 원석 덩이 수를 돌려주고 연료를 뺀다.
function smeltFuelTake(v, want) {
  const S = _smeltUses(); if (!S || !(want > 0)) return 0;
  const per = S.fuelPerOre().charcoal || 0, wpc = S.woodPerCharcoal();
  if (!(per > 0)) return want;
  const ch = v.storage.charcoal || 0, wd = v.storage.wood || 0;
  const can = Math.min(want, (ch + (wpc > 0 ? wd / wpc : 0)) / per);
  if (!(can > 0)) { v._smeltNoFuel = (v._smeltNoFuel || 0) + 1; return 0; }
  const needCh = can * per, fromCh = Math.min(ch, needCh), fromWood = (needCh - fromCh) * wpc;
  if (fromCh > 0) { v.storage.charcoal = ch - fromCh; _cons(v, 'charcoal', fromCh); }
  if (fromWood > 0) { v.storage.wood = Math.max(0, wd - fromWood); _cons(v, 'wood', fromWood); }
  v._smeltFuelCh = (v._smeltFuelCh || 0) + fromCh; v._smeltFuelWood = (v._smeltFuelWood || 0) + fromWood;
  if (can < want) v._smeltShort = (v._smeltShort || 0) + 1;
  return can;
}
// ══ ★★[T452 2026-09-27] 숯가마 행위 — 숯은 숯가마가 굽는다(정본 `smelt-uses.js` · 손잡이 `T452_KILN_ACT` · ★T471 기본 켬) ══
//   서는 조건(유도 · 새 수 0): **숲 마을** = 나무꾼이 있고(`counts.lumberjack > 0`) 통나무가 비축 목표(`RESERVE_PC.wood × 인구`)를 넘는다.
//   짓기: 숯가마 공정 재료(`kilnBuildCost` = 돌 10·통나무 2)가 곳간에 있으면 그날 선다(재료만 · 몸은 생활층 회부).
//   굽기: 하루 배치 상한 = 서버 조업 시간식(`kilnBatchesPerDay(dayLengthMs)`) · 배치 = 통나무 3 → 숯 4 ·
//     **잉여 통나무**(비축 목표 초과분)로만 · 숯 목표 = 원석 비축 목표(`RESERVE_PC.ore × 인구`)와 지금 원석 중 큰 쪽을 녹일 숯(× 원석당 숯)까지.
//   숯 = 곳간 품목(`charcoal` — specialty 품목 · 이미 교역재) — 캐러밴이 값대로 옮긴다(새 줄 0 · 보고 §ⓐ).
const T452_KILN_ACT = process.env.T452_KILN_ACT !== '0';   // ★[T471] 기본 켬(넷째 판-c) · 되돌림 `T452_KILN_ACT=0` = 넷째 판-b 비트 동일
let _zcfgMod;
function _dayLengthMs() { if (_zcfgMod === undefined) { try { _zcfgMod = require('../server/zone-config'); } catch (e) { _zcfgMod = null; } } return (_zcfgMod && _zcfgMod.WORLD && _zcfgMod.WORLD.dayLengthMs) || 0; }
function kilnActOn() { return T452_KILN_ACT && !!_smeltUses(); }
function kilnWant(v) {   // 서는 조건 — 숲 마을
  const N = (v.npcs && v.npcs.length) || 0;
  return ((v.counts && v.counts.lumberjack) || 0) > 0 && (v.storage.wood || 0) > (RESERVE_PC.wood || 0) * N;
}
// ★[T463] 노의 숯 목표 — 원석 비축 목표(`RESERVE_PC.ore × 인구`)와 지금 원석 중 큰 쪽을 녹일 숯(× 원석당 숯). 숯가마(`kilnDay`)와 파생수요가 같은 식을 부른다.
function furnaceCharcoalTarget(v) {
  const S = _smeltUses(); if (!S || !v || !v.storage) return 0;
  const N = (v.npcs && v.npcs.length) || 0;
  return Math.max(oreReserveTotal() * N, oreTotal(v)) * (S.fuelPerOre().charcoal || 0);
}
function kilnDay(v) {
  const S = _smeltUses(); if (!S || !v || !v.storage) return null;
  const N = (v.npcs && v.npcs.length) || 0;
  if (!v._kiln) {
    if (!kilnWant(v)) return null;
    const cost = S.kilnBuildCost();
    for (const k of Object.keys(cost)) if ((v.storage[k] || 0) < cost[k]) return null;   // 재료가 모이면 선다
    for (const k of Object.keys(cost)) { v.storage[k] -= cost[k]; _cons(v, k, cost[k]); }
    v._kiln = { built: (v._day || 0) };
    return { built: 1 };
  }
  const spare = woodSpareAfterLand(v);   // ★[T488] 잉여 = 재고 − 비축 − **집 몫**(집이 끔이면 0 · 순서 집 → 숯가마 무변) · ★[T537] 식은 한 함수(다리 크루도 부른다) · ★[T1213] 땅 몫 뒤(끔 = 0 · `woodSpare` 그대로)
  const target = furnaceCharcoalTarget(v);   // ★[T463] 식 한 곳 — 파생수요(`derivedInputTarget`)가 같은 함수를 부른다(산술 불변)
  const gap = target - (v.storage.charcoal || 0);
  if (!(spare >= S.CHARCOAL_KILN_WOOD) || !(gap > 0)) return { batches: 0 };
  const n = Math.min(S.kilnBatchesPerDay(_dayLengthMs()), Math.floor(spare / S.CHARCOAL_KILN_WOOD), Math.ceil(gap / S.CHARCOAL_KILN_YIELD));
  if (!(n > 0)) return { batches: 0 };
  const w = n * S.CHARCOAL_KILN_WOOD, c = n * S.CHARCOAL_KILN_YIELD;
  v.storage.wood -= w; _cons(v, 'wood', w);
  v.storage.charcoal = (v.storage.charcoal || 0) + c;
  v._kilnWood = (v._kilnWood || 0) + w; v._kilnCharcoal = (v._kilnCharcoal || 0) + c; v._kilnDays = (v._kilnDays || 0) + 1;
  return { batches: n };
}
function _typedSmeltCandidates(v) {
  const N=v.npcs?.length||1,out=[];
  for(const raw of OreGoods.ids){const m=OreGoods.mineralOf(raw),id=m==='jade_raw'?'jade':m,qty=v.storage[raw]||0;if(!(qty>0)||(_ERA_METAL(id)&&!_eraKnows(id)))continue;
    if((v.storage[id]||0)>(RESERVE_PC[id]||0.1)*N*4)continue;
    out.push({raw,id,qty});
  }
  return out;
}
function _tryTypedSmelt(v,laborBase) {
  const a=_typedSmeltCandidates(v);if(a.reduce((n,x)=>n+x.qty,0)<SMELT_MIN_ORE)return 0;
  let left=Math.max(0,laborBase*SMELT_PER_LABOR),used=0;
  for(const x of a){if(!(left>0))break;const want=Math.min(x.qty,left),use=smeltFuelOn()?smeltFuelTake(v,want):want;if(!(use>0))break;
    v.storage[x.raw]-=use;_cons(v,x.raw,use);const q=use*SMELT_YIELD;v.storage[x.id]=(v.storage[x.id]||0)+q;
    const flow=v._t1188Smelt||(v._t1188Smelt={});flow[x.id]=(flow[x.id]||0)+q;used+=use;left-=use;
  }
  v._smeltedToday=(v._smeltedToday||0)+used;v._smeltedTotal=(v._smeltedTotal||0)+used;return used;
}
function _trySmelt(v, laborBase) {
  if (_t1249NoSmelt(v)) { migrateOre(v); return 0; }   // ★[T1249] 켬 = 조성 모르는 마을은 안 녹인다
  if(T1188_ORE_SPLIT){migrateOre(v);return _tryTypedSmelt(v,laborBase);}
  const om = oreMixOf(v);                              // ★유효 조성 우선(수입 원석 포함) — 없으면 땅 조성
  if (!om) return 0;                                   // 지도 정보 없는 호출부(랩·CLI)는 옛 경로
  const mix = Object.keys(om).length ? om : SMELT_PLACER;
  const have = oreTotal(v);
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
  // ★[T443] 켬이면 연료가 댈 수 있는 만큼만 녹인다(끔 = 종전 식 그대로).
  const use = smeltFuelOn() ? smeltFuelTake(v, Math.min(have, cap)) : Math.min(have, cap);
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
// ★[2026-08-02f ①-2] 배합 탐색을 **공용 헬퍼**로 뽑았다 — 주조 결정(_alloyMelt)과
//   구리 파생수요(derivedInputTarget)가 같은 탐색·같은 목적함수를 써야 한다(사본 금지).
//   `price` 만 갈린다: 주조는 기회비용(_oppPrice), 파생수요는 **기준가**(자기 꼬리 물기 방지).
function _meltSearch(st, price) {
  const SP = _spec(); if (!SP) return null;
  // ★[2026-08-02c] 재료비·산출값 둘 다 **기회비용**으로 — "이 주석을 무기에 쓸까, 팔까"가 여기서 갈린다.
  //   ALLOY_OPP 가 꺼져 있거나 순수출가 주입이 없으면 _matPrice 와 바이트 동일(회귀 무영향). _oppPrice 주석 참조.
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
  return { take: best.take, mix: best.mix, grade: best.grade, castF: best.castF, bronzeness: Math.min(1, (best.mix.tin || 0) / 0.12) };
}
function _alloyMelt(v) {
  const st = v.storage || {};
  if (!((st.copper || 0) > 0.01)) return null;            // 구리 없이는 못 만든다(기지가 없다)
  return _meltSearch(st, _oppPrice(v));
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
  if (T635_SHELL_ORNAMENT) _t635Init();   // ★[T635 ①] 끔이면 한 줄도 안 돈다
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
      // ★★[T17 ③ 2026-09-02] **바다에 닿는가** — 자염의 산지 판정. `server/villages.js` 가 지형에서 잰다.
      //   ⚠**이 한 줄이 화이트리스트다.** `land` 는 리터럴이라 여기 없는 키는 호출부가 넘겨도
      //     **조용히 버려진다** — `fishSustain`·`woodSustain`·`forageSustain`·`marginalQ` 가 그렇게
      //     통째로 사장돼 있다(`회부_MSY상한_사장.md`). 같은 함정을 두 번 밟지 않으려고 여기 적는다.
      coastal: !!opts.coastal,
      // ★★[T17 ⑤ 2026-09-02 · 재민 확정 "판정은 재민 — 켜지 않는다"] **어장 MSY 상한 배선 — 기본 꺼짐.**
      //   §0-ⓔ 실측: MSY 는 반쯤 구현돼 있다. 수식(`server/sustain.js` — 로지스틱 r·K/4)도,
      //   엔진의 소비 지점(`_fishScale = min(1, fishSustain/_fishRaw)` · `_fishCap`)도 **이미 완성**이다.
      //   끊긴 건 이 한 줄뿐이었다 — `land` 리터럴이 화이트리스트라 `extractSustain` 이 준
      //   `fishSustain` 이 **조용히 버려졌다**(`woodSustain`·`forageSustain`·`marginalQ` 도 같이).
      //   ⇒ 그래서 헤드리스 econ 에서 어획은 **스톡 제약 없이 무한정** 나온다.
      //   ⚠`T17_MSY=1` 이어야 잇는다. 끄면 키 자체가 `undefined` 라 종전과 **비트 동일**이다
      //     (엔진 판정이 `!= null` 이므로 undefined = '상한 미적용' = 종전 경로 그대로).
      //   ⚠플레이어가 그 물을 긁은 마을은 지금도 `refreshFishSustain` 이 사후에 켠다 —
      //     이 스위치는 **NPC 만 있는 세계**에서도 상한이 서게 하는 것이다.
      //   ⚠끄면 **키 자체를 안 만든다**(값 `undefined` 로 두면 `Object.keys(land)` 가 달라진다 —
      //     직렬화·진단이 그 목록을 본다). 스프레드로 통째로 없앤다.
      //   ★★[T923] 이제 여기서 land 에 꽂지 않는다 — 켬(기본)이면 시딩 MSY 를 land 밖 칸(`v._fishMsySeed` · 이 함수 끝)에 붙잡고
      //     마을 하루 마감(`fishMsyDayClose`)에서 세운다(서버 `refreshFishSustain` 과 같은 때 — 모듈 머리 `T17_MSY` 주석). 끔(`=0`)이면 종전 그대로 키가 없다.
      // ★[T635] 켠 판에만 서는 칸 둘(끄면 키 자체가 없다 — 위 `fishSustain` 과 같은 이유) — 값은 서버 `extractLandParamsApprox` 가 잰다
      ...(T635_SEA_SPECIES && opts.seaMix ? { seaMix: opts.seaMix } : {}),
      ...(T635_SHELL_ORNAMENT && opts.shellBangle > 0 ? { shellBangle: opts.shellBangle } : {}),
      size: baseSize,
      baseSize,                                                   // 확장 비용 계산 기준
    },
    expansions: 0,                                                // 확장 횟수
    treasury: Object.fromEntries(RESOURCES.map(r => [r, 0])),     // 길드 금고
    coord: { x: srand() * MAP_SIZE, y: srand() * MAP_SIZE },      // 마을 좌표
    // 길드 — 기본 세율 3%, NPC AI가 자동 조절 (hill climbing)
    guild: {
      taxRate: 0.03,
      // ★[T787 2026-10-18 · 길드 = 마을] `master` 칸을 걷었다 — 쓰는 줄 0(초기값 null 뿐 · 50/50 null) · 우두머리는 촌장 하나(T785 마을 칸 · NPC = 촌장 몸).
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
    // ★[2026-08-02d] 창설일 — 기아사망 보호막을 '달력'이 아니라 '마을 나이'로 셀 때의 기준(SHIELD_AGE).
    //   호출측이 안 주면 0(=달력과 동일) → 회귀 무영향. 라이브는 villages.js 가 world.day 를 준다.
    _bornDay: opts.bornDay || 0,
    // ★★[2026-08-03d 배치 11 — 플레이어 마을 건립] 창설자. **재민 확정 "플레이어 마을은 망해도 돼"**
    //   NPC 시딩 마을은 `null`(=불멸 원칙 대상), 플레이어가 세운 마을은 창설자 playerId 가 들어간다.
    //   ★이 한 필드가 두 세계를 가른다:
    //     ① `SHIELD_AGE`/`SHIELD_SOFT` 기아사망 보호막 — NPC 마을만 받는다(§필멸 배선).
    //     ② 소멸 지표 — `소멸(NPC)` 과 `소멸(플레이어)` 를 나눠 센다. 안 나누면 플레이어가
    //        마을 하나 버릴 때마다 **기준선이 깨진 것처럼** 찍힌다(지표가 틀리면 결론이 틀린다).
    //   ⇒ 소멸 0 은 **NPC 가 자기 자리를 못 고르기 때문에** 세운 원칙이다(배치 3: 시딩을 고치니 −55%).
    //     플레이어는 고른다 — 고를 수 있는 자에게 불멸까지 주면 자리 선택에 의미가 없다.
    founder: opts.founder || null,
    foundedDay: opts.bornDay || 0,   // 창설일(표시·정리용. `_bornDay` 와 같은 값이되 `_` 없는 공개 필드)
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
  // ★★[2026-08-03e 배치 12 ①] **0 을 0 으로 읽는다.** 종전 `opts.initialPop || 8` 은 `initialPop: 0`
  //   창설을 조용히 8명으로 바꿔 놓았다 — 플레이어가 세운 마을은 **빈 터**로 태어나야 하므로
  //   (설계안 §1 #4: *"8명·2,850셀을 클릭 한 번에 주는 건 마을이 아니라 선물이다"*) 그 폴백이
  //   계약을 정면으로 어긴다. initN=0 이면 아래 초기 부존(식량 45일치·도구·목재·석재·LANDFIT·
  //   BOOMFIT)이 **전부 0 을 곱해** 저절로 0 이 된다 — 부존 규칙을 새로 만들 필요가 없다.
  //   ⚠기존 호출부는 전부 1 이상(8·20·pop)을 넘기므로 **비트 동일**이다(전수 확인: villages.js
  //     INITIAL_POP · econ-lab-real · migrate-db-endowment · 하네스 6종 · v1 CLI 2곳).
  const initN = (opts.initialPop != null) ? opts.initialPop : 8;
  for (let i = 0; i < initN; i++) {
    let job = pickInitialJob(v);   // ★전담 행상 폐지: 첫 NPC도 일반 직업(식량 위주). 교역은 잉여 생기면 기본 NPC가.
    const npc = createNPC({ job });
    v.npcs.push(npc);
    v.counts[job] = (v.counts[job] || 0) + 1;
  }
  // 초기 비축 — 비자급 마을(광물/사막)도 교역 시작할 시간. ★45일치(옛 300일치는 글럿→satiation이 식량생산 억제→
  //   부양력 오판·농부 이탈로 초반 인구 진동시켰음). 45일이면 satiation 거의 0(secF~0.1) + 교역 부트스트랩 충분.
  v.storage.food = initN * seedFoodDays(opts.bornDay || 0);   // ★[T100 5판] 45 → **첫 수확까지**(끄면 45 그대로 · 위 `seedFoodDays`)
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
    const _woodBonus = initN * 20 * _lackWood * _lf;   // ★[T692] 이름만 올렸다 — 같은 곱 · 같은 차례(비트 동일)
    v.storage.wood += _woodBonus;     // 기본 N×8 위에 최대 N×20
    if (T692_SEED_RESERVE && _woodBonus > 0) v._seedReserve = _woodBonus;   // ★[T692] 가산 몫 그대로 = 그 마을 비축(위 `_cons` 옆 주석)
    v.storage.tool += initN * 6 * Math.max(_lackStone, _lackWood) * _lf;   // 도구 여유분 — 재보급이 어려운 만큼 더 지고 온다
  }
  v.storage.ore = Math.floor(initN * v.land.ore * 5);  // 광물 도시는 ore 잉여로 시작
  // ★부얼타운은 **팔 것**도 지고 온다 — 식량을 살 밑천이다(이 마을은 식량을 사서 산다).
  //   ※위 food 가산 뒤에 오는 이유: storage.ore 는 여기서 통째로 대입되므로 그 뒤에 얹어야 한다.
  if (BOOMFIT_K > 0 && _foodLack > 0) v.storage.ore += initN * (v.land.ore || 0) * 10 * _foodLack * BOOMFIT_K;
  v.storage.herb = initN * 0.5;       // ★약재(§9): 정착민 상비약 반 근씩 — 재고0 희소폭등(가격 스파이크→채집 쏠림 과도) 방지 시드
  v.storage.weapon = Math.max(v.storage.weapon || 0, initN * 0.15);   // ★활 시드(§9 3차): 정착민 사냥꾼은 제 활을 들고 옴(~초기 사냥꾼 수) — t=0 무기 결손이 무기장 캐치업·교역을 흔드는 것 방지(herb 패턴)
  v.housing = Math.max(initN, HOUSE_START);   // ★주거 수용력. K = min(식량,생산) 안에서 인구가 이 값에 막힘(성장 게이트).
  // ★★[2026-08-03e 배치 12 ②] **한 번이라도 사람이 살았는가** — 소멸 판정의 전제다(계측 전용, 로직 무관).
  //   플레이어 마을은 인구 0 으로 태어난다. 그 상태를 `pop === 0` 으로만 세면 **태어나자마자 소멸**로
  //   찍혀 지표가 통째로 거짓말이 된다(배치 6·7·8 이 반복해 만난 실패 유형: 지표가 틀리면 결론이 틀린다).
  //   ⇒ 소멸(P) 는 **≥1 에 도달한 뒤 0 이 된 마을**만 센다. 아직 아무도 안 온 빈 터는 '소멸'이 아니라
  //     '아직 시작 안 함'이다. NPC 마을은 initN=8 이라 언제나 1 — 기존 판정과 완전히 같다.
  v._everPop = initN > 0 ? 1 : 0;
  // ★[T923] 어장 시딩 MSY 를 붙잡는다(켬 기본 · land 밖 칸 — `Object.keys(land)` 무변 · 끔이면 칸이 없다 · 모듈 머리 `T17_MSY` 주석)
  //   **열거 안 되는 칸**이다 — 서버도 같은 `createVillage` 를 부르는데, 저장 줄(`serializeEcon` · `Object.keys`)이 이 칸을 DB 로 퍼 나르면
  //   서버 `land._fishBase` 의 사본이 저장된다. 열거를 끄면 저장 줄 · JSON 바이트가 종전과 같다(메모리에만 · 다시 뜬 마을은 저장된 `land.fishSustain` 이 이미 있다).
  if (T17_MSY && opts.fishSustain != null) Object.defineProperty(v, '_fishMsySeed', { value: opts.fishSustain, writable: true, configurable: true, enumerable: false });
  if (T731_LOCAL_MIDNIGHT) _t731StreamInit(v);   // ★[T744] 켬 = 마을 흐름 씨를 **만드는 순간**에 — 그 세계의 씨(`setSeed`)로(첫 틱까지 미루면 그 사이 만든 다른 세계의 씨를 받았다)
  migrateOre(v);
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
  if (T1276_FARM_K) t1276Note(v);   // ★[T1276] 한 해 창 기록(끔 = 무동작)
  migrateOre(v);
  if (t1226On()) { v._t1226F0 = (v.counts && v.counts.farmer) || 0; v._t1226F0d = day; }   // ★[T1226 ⑫] 켬 = 이 마을 틱 머리 농부 수(이웃 피커가 마을 차례와 무관하게 읽는다 · 끔 = 무동작)
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
  if (T692_SEED_RESERVE && v._seedReserve > 0) v._seedReserve = Math.min(v._seedReserve, v.storage.wood || 0);   // ★[T692] 비축은 곳간을 넘지 않는다(하루 머리)
  if (T1196_ARTISAN_ACT && v._t1196Q && v._t1196Q.length) { _t1196Day(v, day); _t1196Hide(v); }   // ★[T1196] 어제까지 몸이 안 집어 간 작업표 = 일괄 · 남은 작업표 재료는 그날 틱 동안 비켜 둔다(끔 · 랩 = 작업표가 안 선다)

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
  const dailyProductionPotential = {};   if (t1226On()) v._t1226Pot = dailyProductionPotential;   // ★[T1226 ⑪] 켬 = 직업 값이 읽을 잠재 산출(같은 객체 — 아래에서 다 쌓인다 · 끔 = 무동작)
  // ★조인 전(잠재) 생산 — 부양력 prodK가 satiation(여가)에 안 속게(창고 많으면 생산 게을러도 부양력은 잠재력 기준)
  // ★건강 → 작업량(생산성) — 지난 틱 health로 실제 생산 스케일(±10% 상한). 잠재력(dailyProductionPotential)엔 미적용 → K 오염·아사 스파이럴 방지.
  const _hpm = (v.lastStats && typeof v.lastStats.health === 'number')
    ? Math.max(0.9, Math.min(1.1, 1 + (v.lastStats.health - 0.5) * HEALTH_PROD_W)) : 1;
// ★★★[T157 2026-09-07 · 이 파일의 유일한 접점] **행복도 작업량에 닿는다 — 건강과 같은 문법.**
//   재민 물음(09-05): *"행복이 오로지 리비히 상한 역할만? 높으면 더 좋아지는 것도 있어야."*
//   여태 행복은 연속 항 `(happiness−0.5)×0.6` 으로 **인구에만** 닿았다. 건강은 이미 위 한 줄로
//   작업량에 닿는다. 그 문법을 그대로 빌린다: **0.5 가 중립 · 대칭 · 같은 자리에서 곱한다.**
//
//   ⚠**주입이 없으면 한 글자도 안 바뀐다.** 계수는 이 파일이 안 갖는다 — `world.happyWorkW` 가 준다.
//     지금 그것을 주는 것은 **랩**(`lab/전쟁실험실.html` `L_HAPPYWORK`)과 그 A/B 계측기뿐이고,
//     서버·CLI·하네스·픽스처는 안 주므로 `_hwW = 0` → 배수 1 → **비트 동일**이다(T135 `forageTakeFn` 선례).
//   ⚠**상한은 새 수가 아니라 `H` 자신이다.** 출처(Oswald·Proto·Sgroi 2015)가 잰 것은 *중립 → 행복*
//     구간의 생산성 차이다 ⇒ 우리 축으로 0.5 → 1.0 의 반쪽 폭. 그래서 배수를 `1 ± H×0.5` 로 자른다.
//     행복은 이 세계에서 **1 을 넘는다**(실측 중앙 0.845 · 최고 2.07) — 자르지 않으면 출처가 재지 않은
//     구간까지 외삽하게 된다. 자르는 값을 따로 짓지 않는 것이 요점이다.
const _hwW = happyWorkWOf(v);   // ★[T244] 기본 켬(정본 H) · 주입이 있으면 그것 · `L_HAPPYWORK=0` 이면 0(종전 비트)
let _hwm = 1;
if (_hwW > 0 && v.lastStats && typeof v.lastStats.happiness === 'number') {
  _hwm = T1205_HAPPY ? 1 + 2 * _hwW * Math.max(0, v.lastStats.happiness - 0.75) : happyWorkMul(v.lastStats.happiness, _hwW);   // ★[T1205] 0.75 위만 · 연속 · h = 1 에서 종전 최대(1 + W/2) 그대로
  if (_hwm !== 1 + (v.lastStats.happiness - 0.5) * _hwW) v._hwClampDays = (v._hwClampDays || 0) + 1;   // 계측 전용 — 상한이 어디서 서나(회계 아님)
  v._hwmLast = _hwm;
}
const _t1113LQ = t1113On('T1113_LOW_QUALITY') ? t1113LowMul(v) : 1;   // ★[T1113 ③] 식량 외 산출 배수(끔 · 행복 ≥ 0.5 = 1)
if (_t1113LQ !== 1) v._t1113LowDays = (v._t1113LowDays || 0) + 1;   // 계측 전용
  // ★production stat → 생산성(자재·설비 비축이 실제 생산력↑). 상한 클램프로 스노볼 방지. 잠재력엔 미적용(K 오염 방지).
  const _prodMul = (v.lastStats && typeof v.lastStats.production === 'number')
    ? 1 + Math.min(PROD_STAT_CAP, v.lastStats.production * PROD_STAT_W) : 1;
  // ★논 프리미엄 — 개간 논비중(v._paddyShare)이 높을수록 유효비옥도↑(벼 고수확). 공간 브리지 없으면 중립.
  const _paddyMul = (v._paddyShare == null) ? 1 : (1 + PADDY_PREMIUM * (v._paddyShare - PADDY_BASE));
  // ★어장·임연부 MSY 상한(랩 실측 land.fishSustain/forageSustain) → 어부·채집 총생산 min(raw, sustain). woodSustain(fuelK)과 동형 파이프 — 랩이 물리 어장/임연부 지속수확을 재어 econ 소득 천장을 물림(초과 시 비례 감산). sustain==null(어장/임연부 없음)이면 미적용=현행 보존(제로캡 전멸 방지).
  const _fishRaw = (v.counts.fisher || 0) * JOBS.fisher.base * (v.land.water || 0) * toolBoostShared;
  // ★[T60 §0-ⓐ 2026-09-03 · 계측 전용 · 행동 무관] **상한이 몇 배 모자란가**를 밖에서 잴 수 있게
  //   잠재 어획(`_fishRaw`)과 그 EMA 를 남긴다. 판정(`_fishScale`)은 아래 한 줄이 그대로 한다.
  //   ⚠EMA 는 **감산 전 잠재**를 따라간다 — 감산된 실적을 따라가면 상한이 자기를 끌어내리는 나선이 된다.
  v._fishRawLast = _fishRaw;
  v._fishRawEMA = (v._fishRawEMA == null) ? _fishRaw : (v._fishRawEMA * (1 - 1 / 30) + _fishRaw / 30);
  // ★★[T60 ① 후보ⓑ `ema` — 흐름 눈금] 지리가 아니라 **그 마을의 제 기준선**으로 상한을 세운다.
  //   *"첫 계절 동안 낼 수 있던 잠재 산출"* 을 잠그고 헤드룸을 곱한다.
  //   ⓐ 잠그는 이유: 상한이 실적을 따라가면 **자기를 끌어내리는 나선**이 된다(상한↓ → 산출↓ → 상한↓).
  //   ⓑ 90일인 이유: econ 정본의 **계절 경계**(`seasonOf` — d<90/180/270)다. 새 수가 아니다.
  //   ⓒ 헤드룸 2 인 이유: 랩이 `FISH_ECON_PER_STOCK` 옆에 적어 둔 설계 의도 *"×~1.5-2 헤드룸"* 의 중앙.
  if (MSY_MODE_EMA && v.land && v.land.fishSustain != null) {
    const _d = (v._world && v._world.day) | 0;
    if (_d <= MSY_EMA_LOCK_DAYS || v._fishBaseEMA == null) v._fishBaseEMA = v._fishRawEMA;
    if (v._fishBaseEMA > 0) v.land.fishSustain = +(v._fishBaseEMA * MSY_HEADROOM).toFixed(4);
  }
  const _fishScale = (v.land.fishSustain != null && _fishRaw > 0) ? Math.min(1, v.land.fishSustain / _fishRaw) : 1;
  // ★[T60 ② 배선] 오늘 실제로 잡힌 몫(감산 뒤) — `server/villages.js` 가 이 값만큼 **낚시 v2 재고를 깎는다**.
  //   econ 은 여전히 아무 것도 안 판단한다: 여기서는 숫자를 **남기기만** 한다(행동 무변).
  v._fishOutLast = _fishRaw * _fishScale;
  // ★[T325 · 계측 전용 · 행동 무관] 그 마을이 **지금 수식으로** 하루에 내는 목재 — 셀당 예산식의 분자다.
  //   T60 이 어부에 남긴 `_fishRawLast`/`_fishOutLast` 와 **같은 꼴**이고 같은 항들이다
  //   (자리 수 × `JOBS` base × `land` × 공유 도구 배수 · 벌목은 `jobScale === 1` 이라 스케일 항이 없다).
  //   ⚠읽는 쪽이 손잡이 뒤(`woodRegrowR` — T341 이 이 수를 **재생률의 분자**로 쓴다)라 끈 팔은 이 수를 안 본다(관측 칸).
  v._woodOutLast = (v.counts.lumberjack || 0) * JOBS.lumberjack.base * (v.land.wood || 0) * toolBoostShared;
  const _forageRaw = (v.counts.forager || 0) * JOBS.forager.base * JOBS.forager.landBoost(v);
  const _forageScale = (v.land.forageSustain != null && _forageRaw > 0) ? Math.min(1, v.land.forageSustain / _forageRaw) : 1;
  // ★[T347 · 계측 전용 · 행동 무관] 그 마을이 **지금 수식으로** 하루에 내는 채집 합(econ 단위 · 믹스 전체).
  //   `_woodOutLast`·`_fishOutLast` 와 **같은 꼴**이고 같은 항들이다 — 자리 수 × `JOBS` base × `landBoost`
  //   × 공유 배수. 채집의 공유 배수는 도구가 아니라 **임연부 MSY 상한**(`_forageScale`)이다
  //   (`toolDependent: false` — 채집은 도구를 안 쓴다 · 스킬은 사람마다라 여기 안 든다 · 나무와 같은 규약).
  //   ⚠`stone` 가산은 이 수에 **안 든다**(믹스 밖에서 따로 더해지는 산출이다 — 보고 §표가 그 줄을 따로 적는다).
  //   ⚠읽는 쪽이 손잡이 뒤(`forageRegrow…`)라 끈 팔은 이 수를 **안 본다**(관측 칸).
  v._forageOutLast = _forageRaw * _forageScale;
  if (huntActOn(v)) {   // ★[T1195] 사냥 그날 수요 — 어부 `_fishOutLast` 와 같은 꼴(자리 수 × base × 땅 × 공유 도구 · 숙련은 사람마다라 안 든다) · 끔 = 이 칸이 안 생긴다
    v._huntOutLast = (v.counts.hunter || 0) * JOBS.hunter.base * JOBS.hunter.landBoost(v) * toolBoostShared;
    v._t1195Bal = Math.min(typeof v._t1195Bal === 'number' ? v._t1195Bal : 0, 0) + v._huntOutLast;   // 미리 쓴 몫(음수)만 잇고 못 채운 몫은 그날로 끝(T374)
  }
  v._forageScale = _forageScale;   // ★저장(§9): 채집 한계가치(픽커·기회비용)가 임연부 MSY 포화를 보게 — 포화 임연부에 herb 가격이 채집꾼을 무한 유인(공유지 비극)하는 것 차단
  if (T1179_CROP_SEASON) t1179FieldDay(v, day);   // ★[T1179] 익은 밭을 거두고 빈 자리에 심는다(생산 앞 · 끔 = 무동작)
  for (const npc of v.npcs) {
    if (npc._tradingUntil && npc._tradingUntil > day) continue;   // ★교역 원정 중 → 생산 안 함(기회비용 실현). 저숙련자라 손실 작음.
    // ★★[T295 2026-09-19] **징발자는 생산에서 빠진다** — 걷는 병사(존 pid)와 1:1 로 묶인 이 NPC 는
    //   지금 마을에 없다(행군·주둔·교전 중). 재민 캐논 *"일을 안 하니 자연히 동결"* 이 이 한 줄이다.
    //   ⚠**교역 원정과 같은 자리·같은 문법**이다(위 줄) — 새 기구 0. 마크는 호스트(전쟁 층)가 붙이고 떼며,
    //     `counts` 는 마크 붙일 때 이미 비웠다(직업 자리 비움 — 복귀 때 되돌린다).
    //   ⚠전쟁이 없는 세계(랩·3시드 판)엔 마크가 없다 ⇒ 이 줄은 안 돈다 = **종전 비트 동일**.
    if (npc._warDraft) continue;
    const jdef = JOBS[npc.currentJob];
    const f = jdef.field;
    const skillLvl = npc.skills[f] || 0;   // ★신설 필드(tailoring) 구세계 NPC 호환 — undefined면 0(NaN 전염 방지)
    const toolBoost = jdef.toolDependent ? toolBoostShared : 1.0;
    // input 자원 부족 시 생산 0
    let inputMult = 1;
    for (const [inp, need] of Object.entries(jdef.inputs || {})) {
      if ((T1188_ORE_SPLIT&&inp==='ore'?oreTotal(v):v.storage[inp]) < need) { inputMult = 0; break; }
    }
    const landBoost = jdef.landBoost(v);
    // skill 효과 — 만렙(10)이면 ×1.5. 분업/교역 의존 강화 위해 효율 ↓.
    const skillMul = 1 + skillLvl * 0.05;
    const jobScale = npc.currentJob === 'fisher' ? _fishScale : (npc.currentJob === 'forager' ? _forageScale : 1);   // ★어장/임연부 지속수확 상한(위 precompute) — 어부·채집만 스케일, 그 외 1
    let baseAmt = jdef.base * landBoost * skillMul * toolBoost * inputMult * jobScale
      * (f === 'farming' ? _paddyMul * (v._clearedFrac != null ? v._clearedFrac : 1) : 1);   // ★농사엔 논 프리미엄 × 개간완료율(공간 브리지) — 개간 안 된 밭은 소출 없음. 인구↑→개간목표↑→완료율 일시↓→소출·prodK 눌림→개간이 따라잡으면 회복 = 보즈럽 시차가 K에 실시간 반영(잠재 기준 slotK는 그대로 → 데드락 없음)
    // ★★[T154 2026-09-07] **사냥 소득 주입 문** — 고기는 장부가 잡은 만큼만.
    //   여태 사냥 산출은 `base 0.7 × land.game` 이라는 **추상**이었다(밭은 T100 4판에서, 채집은 T135 에서
    //   이미 실물이 됐는데 사냥만 남아 있었다). T146 이 서버에 개체 장부를 올렸으니 이제 그 장부가
    //   그날 실제로 잡은 마릿수를 안다 — 소득은 그 수를 따라야 한다.
    //   ⚠**규약은 `priceFn`·`netExportFn` 과 같다**: world 에 함수가 심겼을 때만 산다.
    //     미주입이면 `null` 이라 `baseAmt` 가 그대로 간다 = **종전 비트**(랩 기본 abstract · 서버 무주입).
    //   ⚠**대체지 얹기가 아니다.** 여기서 `baseAmt` 를 바꾸면 산출(meat)도 부산물(hide·bone…)도
    //     같은 수를 따라간다 — 두 장부가 갈리지 않는다.
    //   ★★[T172 2026-09-11] **배율은 문 뒤가 아니라 실체 쪽에 건다.** T154·T166 의 문은 `baseAmt` 를
    //     통째로 덮어써서 `skillMul·toolBoost·inputMult` 를 **세계에서 지웠다** — 숙련 10 사냥꾼과
    //     초보가 같은 고기를 가져왔다. 값 판정이 아니라 **자리 결함**이다(족보 145).
    //     ⇒ 문에는 **양**(`baseAmt`)과 **배율**(`_mul`)을 **따로** 넘긴다. 문 뒤에 다시 곱하지 않는다
    //       (그러면 이중이다) — 배율은 **실체가 나는 곳**(랩 하루 벌목량·하루 수확)에 걸려
    //       "더 베고 더 잡는" 것으로 나타나고, 소득은 그 장부를 그대로 따른다.
    //     ⚠`baseAmt` 의 계산식은 **한 글자도 안 건드렸다** — 미주입 팔은 곱셈 순서까지 종전 그대로다.
    //     ⚠사냥·벌목은 `jobScale === 1` 이다(어부·채집만 ≠1 — 위 `jobScale` 줄) ⇒ 배율은 셋뿐.
    if (npc.currentJob === 'hunter' && v._world && typeof v._world.huntIncomeFn === 'function') {
      const _mul = skillMul * toolBoost * inputMult;
      npc._t172mul = _mul;                                   // 실체 자리가 읽는다(정본은 여기 하나 — 사본 0)
      const _hi = v._world.huntIncomeFn(v, npc, baseAmt, _mul);
      if (typeof _hi === 'number' && _hi >= 0) baseAmt = _hi;
    }
    // ★★[T166 2026-09-10] **목재 소득 주입 문** — 나무는 벤 만큼만.
    //   벌목도 사냥과 같은 자리였다: 실체(서버·랩 벌목꾼이 `forestRich` 를 실제로 깎는다)는 있는데
    //   소득은 `base 0.3 × land.wood` 라는 **추상**이었다. 벤 그루가 소득을 정해야 한다.
    //   규약·이유는 위 사냥 주입 문과 같다(world 에 심겼을 때만 · 미주입 = 종전 비트 · **대체**).
    if (npc.currentJob === 'lumberjack' && v._world && typeof v._world.woodIncomeFn === 'function') {
      const _mul = skillMul * toolBoost * inputMult;         // ★[T172] 위 사냥 문과 같은 규약
      npc._t172mul = _mul;
      const _wi = v._world.woodIncomeFn(v, npc, baseAmt, _mul);
      if (typeof _wi === 'number' && _wi >= 0) baseAmt = _wi;
    }
    // ★[포로 노동 훅] 포로(npc.captive — 전쟁 레이어 부착)는 생산 기여 ×0.6. 미설치=×1(IEEE x*1===x — 궤적 바이트 보존).
    const _capM = npc.captive ? CAPTIVE_WORK_MUL : 1;

    // produceSpecial 분기 — 각 산출에 대해 세금 떼고 storage로
    const addProduce = (r, amt, exactPreserve=false) => {
      if(T1192_FISH_SPECIES&&exactPreserve){if(!(amt>0))return;v.storage[r]=(v.storage[r]||0)+amt;dailyProduction[r]=(dailyProduction[r]||0)+amt;dailyProductionPotential[r]=(dailyProductionPotential[r]||0)+amt;return;}
      if (productionFormulaOff(v, npc.currentJob)) return;   // T1180: 부산물·현장 0 폴백도 수식 생산이다
      if(T1188_ORE_SPLIT&&r==='ore'){for(const[k,q]of Object.entries(OreGoods.split(amt,oreSourceMix(v))))addProduce(k,q);return;}
      const sm = satMul(r);
      _potA += amt; _actA += amt * sm;   // 여유노동 측정: 잠재(감산 전) vs 실제(감산 후)
      dailyProductionPotential[r] = (dailyProductionPotential[r] || 0) + amt;   // 잠재 생산(건강·포만 적용 전) — prodK용
      amt *= _hpm * _hwm * _prodMul * sm * (v._laborMul || 1) * _capM;
      if (_t1113LQ !== 1 && !t1113IsFood(v, r)) amt *= _t1113LQ;   // ★[T1113 ③] 식량 외만(끔 = 이 줄 무동작)   // ★건강→작업량(±10%) × **행복→작업량(T157 · 주입 없으면 1)** × production stat × 포만 × 부상노동력(요양=일손 X·부상=효율↓ — 생활층서 계산) × 포로 노동(captive만 0.6, 미설치=1) ★[T329] 포위 배수 제거(반경으로 간다)
      if (amt <= 0) return;
      if(T1192_FISH_SPECIES&&npc.currentJob==='fisher'&&FishGoods.species().includes(r))FishGoods.note(v,r,amt*_t860Unit(r)/FishGoods.factor(r));
      if (r === 'food') v._grainToday = (v._grainToday || 0) + amt;   // ★오늘 곡물 실생산 → 볏짚 연료(아래 연료 블록)
      const tax = amt * TAX_RATE;
      if (T1179_CROP_SEASON && T1179_ITEMS[r] && npc.currentJob === 'farmer') t1179Accrue(v, r, amt - tax);   // ★[T1179] 켬 = 밭에 선 작물로(익는 날 곳간에 · 위 `T1179_CROP_SEASON` 주석)
      else v.storage[r] = (v.storage[r] || 0) + (amt - tax);
      v.treasury[r] = (v.treasury[r] || 0) + tax;
      dailyProduction[r] = (dailyProduction[r] || 0) + amt;   // ★NaN 가드(유령 감사서 발견): 버퍼 리셋은 v1 RESOURCES 키만 돌아 specialty 부산물(wheat 등)이 undefined+amt=NaN 영구 오염 — 흐름 진단·식량환산 편입의 지뢰였음
    };
    const _t1196S = (T1196_ARTISAN_ACT && T1196_SET[npc.currentJob] === 1 && productionActsBound(v)) ? _t1196Begin(v, npc.currentJob, day) : null;   // ★[T1196] 빈 몸 자리가 있으면 작업표(끔 · 랩 = null — 종전 글자)
    try {
    if (jdef.produceSpecial === 'forager') {
      if (baseAmt > 0) {
        const yields = foragerYieldsFor(v);
        const sumW = Object.values(yields).reduce((a, b) => a + b, 0) || 1;
        // ★★★[T135 2026-09-06 · 이 파일의 유일한 접점] **추상 열매를 걷어내고 실체로 갈아 끼운다.**
        //   랩(T123 ⓑ)이 잰 것: 실체를 추상 *위에* 얹으면 그 품목 그림자가격이 하한으로 무너지고,
        //   노동 배분이 채집을 0 으로 읽어 **채집꾼이라는 직업이 사라진다**(시드 42 인구 −41%).
        //   채집꾼은 열매만 가져오는 게 아니라서, 그때 채소·버섯·약재·돌이 같이 끊긴다.
        //   ⇒ **대체는 성능이 아니라 안전 조건이다.** 얹지 않는다.
        //
        //   ★새 수 0 — 무엇을 걷어낼지는 `world.forageRealItems`(나무 층이 대는 품목 목록)가 정하고,
        //     얼마나 걷어낼지는 **걷어낸 몫 자체**가 정한다(아래 `repShare`). 상수를 하나도 안 짓는다.
        //   ★주입이 없으면(v1 CLI · 픽스처 · 하네스 · 되돌림 `T135_TREES=0`) **한 글자도 안 바뀐다** —
        //     `repl` 이 비고 `repShare` 가 0 이라 아래 루프가 종전 식과 완전히 같아진다(비트 동일).
        const _W = v._world || null;                        // ★world 는 마을에 백참조로 달려 있다(priceFn 선례)
        const _realFn = (_W && typeof _W.forageTakeFn === 'function') ? _W.forageTakeFn : null;
        const _replSet = (_realFn && _W.forageRealItems) ? _W.forageRealItems : null;
        let repW = 0;
        if (_replSet) for (const [r, w] of Object.entries(yields)) if (_replSet.indexOf(r) >= 0) repW += w;
        const repShare = repW / sumW;                       // 걷어낸 몫(0 이면 종전 그대로)
        // ★★★[T347 2026-09-22 · 이 블록의 유일한 접점] **군락 실체가 대는 품목은 여기서 안 낸다.**
        //   T135 가 나무에 한 것과 **같은 걷어내기**인데 대체를 **econ 함수가 안 한다** —
        //   채집꾼이 걸어가 따고 손에 들고 돌아와 `forageToGranary` 로 넣는다(생활층 · 캐논 ⓐ).
        //   ⇒ 그래서 아래 `continue` 뒤에 대체 호출이 **없다**(있으면 그게 이중 생산이다 · T135 규약).
        //   ⚠목록은 주입이다(`forageActItemsOf`) — 없으면 `null` 이라 이 줄이 아무것도 안 한다(비트 동일).
        const _actSet = forageActItemsOf(v);
        let actW = 0;
        if (_actSet) for (const [r, w] of Object.entries(yields)) if (_actSet.indexOf(r) >= 0) actW += w;
        v._t347MixShare = sumW > 0 ? +(actW / sumW).toFixed(6) : 0;   // ★계측 전용 — 걷은 몫(보고 §표)
        for (const [r, w] of Object.entries(yields)) {
          if (_replSet && _replSet.indexOf(r) >= 0) continue;   // ★걷어낸다 — 추상 산출은 여기서 끝난다
          if (_actSet && _actSet.indexOf(r) >= 0) continue;     // ★[T347] 실체가 대는 품목 — 생활층이 넣는다
          addProduce(r, baseAmt * (w / sumW));
        }
        // ★그 자리를 **실물**이 채운다 — 채집꾼 하루가 그 마을 숲에서 실제로 딸 수 있는 만큼만.
        //   숲이 못 대면 그만큼 덜 온다. 그게 공짜 점심을 걷어낸다는 뜻이다.
        if (_realFn && repShare > 0 && !productionFormulaOff(v, npc.currentJob)) {
          const got = _realFn(v, baseAmt * repShare) || null;
          if (got) for (const r in got) { const a = got[r]; if (a > 0) addProduce(r, a); }   // T1180: 헤드리스 대조 경로 · 서버의 켠 채집은 몸이 운반한다
        }
      }
      if (baseAmt > 0 || stoneRealOn()) {
        // ★S1 돌=채집 자원(광부 아님): 강가/돌밭(land.stone) 채집꾼이 돌을 *주 산출*로 가져옴(식량 믹스와 별개 가산).
        //   계수 0.9 ≈ 옛 광부(base1.5×land.stone) 스케일에 근접 → 돌밭 마을은 채집꾼만으로 돌 풍족(병목 없음).
        //   채집 스킬(foraging)이 효율을 높이고, T419에서는 식물 MSY와 분리한다. 돌은 기존 stoneBudgetFn/land.stone 예산을 읽는다.
        // ★★★[T163 2026-09-10 · 이 파일의 유일한 접점] **관 굵기를 밖에서 물어본다.**
        //   여기 `v.land.stone` 은 *바위 셀 비율*만 보는 수다(`server/livelihood.js landOf`:
        //   `FLOOR.stone + GAIN.stone × rockShare`). 그런데 실물 바위는 두 곳에서 난다 —
        //   **산(바위 셀)** 과 **흩어진 바위**(청크 일반 자원 루프 `rock`). 뒤쪽을 이 식은 0 으로 적는다.
        //   T135 가 나무에서 잡은 것과 **같은 종류의 누락**이다(그쪽은 부호가 반대였다 — §0-ⓑ).
        //
        //   ⚠**주입이 없으면 한 글자도 안 바뀐다.** 예산을 대는 것은 이 파일이 아니다 —
        //     `world.stoneBudgetFn(v)` 가 준다. 지금 그것을 주는 것은 **랩**(`lab/전쟁실험실.html`
        //     `L_STONEREAL`)뿐이고, 서버·CLI·하네스·픽스처는 안 주므로 폴백이 곧 종전 =
        //     **비트 동일**이다(T135 `forageTakeFn` · T157 `happyWorkW` · T161 `allocFn` 선례).
        const _sbFn = (v._world && typeof v._world.stoneBudgetFn === 'function') ? v._world.stoneBudgetFn : null;
        let _stoneK = (v.land.stone || 0);
        if (_sbFn) { const _k = _sbFn(v); if (Number.isFinite(_k) && _k >= 0) _stoneK = _k; }   // 폴백이 곧 종전(못 재면 받은 값 그대로)
        const stoneYield = _stoneK * skillMul * (stoneRealOn() ? 1 : _forageScale) * 0.9;
        if (stoneYield > 0) addProduce('stone', stoneYield);
        if (baseAmt > 0 || stoneYield > 0) workNPC(npc);
      }
    } else if (jdef.produceSpecial === 'cook') {
      const _ck = v.storage.food >= 1 ? null : (T1260_FOOD_READS ? _t1260CookStaple(v) : null);   // ★[T1260 ④] 켬 = `food` 칸이 비면 곡식 품목에서 한 단(끔 = null · 종전 글자)
      if (v.storage.food >= 1 || _ck) {
        const availSides = COOK_SIDE_INGREDIENTS.filter(r => v.storage[r] >= 0.5);
        const usedSides = availSides.slice(0, 5);
        const variety = usedSides.length;
        const efficiency = 1.0 + 0.04 * variety;
        const cooked = jdef.base * skillMul * toolBoost * efficiency;
        if (_ck) v.storage[_ck[0]] -= 1 / _ck[1]; else v.storage.food -= 1;
        for (const r of usedSides) v.storage[r] -= 0.5;
        addProduce('cooked_food', cooked);
        workNPC(npc);
      }
      // ★★[T17 ② 2026-09-02 · 재민 확정] **요리사가 잉여를 갈무리한다** — 보존식 생산.
      //   왜 요리사인가: 말리고 훈제하고 절이는 일은 이 econ 에서 **부엌 노동**이다. 새 직업을 만들면
      //   직업 정원·유틸리티 표가 통째로 흔들린다(그건 이 카드의 범위가 아니다).
      //   ★★**신규 계수 0개.** 세 수가 전부 기존 정본에서 온다:
      //     ⓐ 언제 — 총 식량 환산이 **30일치**를 넘을 때만(`RESERVE_PC.food` × `DAILY_FOOD_CONSUMPTION`).
      //     ⓑ 무엇을 — 오늘 먹을 몫(N×`DAILY_FOOD_CONSUMPTION`)을 남긴 나머지.
      //     ⓒ 하루 얼마나 — 요리사 처리량 `jdef.base`(1.5) 그대로. 요리를 못 한 날에도(식량<1)
      //       손은 비어 있으니 갈무리는 돈다 — 그래서 이 블록은 위 `if` **밖**이다.
      //     ⓓ 수율 — `PRESERVE_YIELD`(0.4) = `server/spoil.js` 수율식의 하한(위 상수 주석).
      //   ⇒ *"잉여는 어차피 썩는다"*(DECAY)를 *"썩기 전에 말린다"*로 바꾸는 것뿐이다.
      //   ★[T860] 그 갈무리 한 걸음은 아래 `_preserveSurplus` 하나다(어부 · 사냥꾼의 잡은 날 말리기가 같은 함수를 부른다 · 사본 0).
      if (T17_PRESERVE) _preserveSurplus(v, PRESERVE_FROM, jdef.base * skillMul, addProduce, null, T877_ON ? _t860Unit : null);   // ★[T877] 켬 = 열량 보존(끔 = 종전 글자)
    } else if (jdef.produceSpecial === 'mason') {
      // ★S2 석공(masonry) — 석기(간돌 도구) 전담 + 마제석검(돌 무기, 전사용). 도구는 자본재라 *우선* 제작,
      //   도구 충분하면 무기 수요(전사) 있을 때 마제석검 제작. ★활은 석공 소관 아님 — 사냥꾼 자가제작(archery)로 이관(활=목재·뼈·힘줄·깃 재료라 석기 장인 부적합, 아래 사냥꾼 자가 안전망 참조).
      // ★S3 레벨=품질: 도구·석검 품질 = 재료등급 × 스킬(masonry). 무기는 노동 3배(WEAPON_LABOR_MULT)라 산출↓(희소).
      const amt = jdef.base * skillMul;
      // ★[T419] 켬이면 돌 단가를 `stone-uses.js` 표에서 유도한다 — 한 자루당 돌 qty 개 × 오늘 만든 자루 수. 끔 = 종전 식(비트 동일).
      const _t419 = stoneRealOn();
      const _stCost = _t419 ? (stoneRealPer('tool').stone || 0) * (amt * _toolTaper) : 0.2 * _toolTaper;
      const _swCost = _t419 ? (stoneRealPer('stoneSword').stone || 0) * (amt * WEAPON_LABOR_MULT) : 0.5;   // ★[T419] 마제석검 한 번 가는 데 드는 돌(끔 = 0.5 · 게이트도 같은 수)
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
      const _needStoneSword = _meleeUrgent && !_bronzeNow && (v.storage.stone || 0) >= _swCost;   // 긴급 무장인데 청동 몫 없음 → 마제석검(방어 최우선, 식량무관)
      // ★병기고(비긴급 비축)는 *식량 안보(secF 충분)일 때만* — 척박·기근 마을이 병기고 비축에 노동을 돌려 식량생산이 밀려 쇠퇴하는 것 방지(랩 취약 시드 인구 유지).
      const _armoryShort = _secF > MELEE_ARMORY_SECF && _swordStock < _armoryTarget * MELEE_ARMORY_HYST && !_bronzeNow && (v.storage.stone || 0) >= _swCost;   // 병기고 결손 + 청동 몫 없음(한도·tin 고갈) + 식량안보 → 석기 backfill
      const wAmt = amt * WEAPON_LABOR_MULT;   // ★무기 노동 3배 → 산출 1/3
      if (_needStoneSword) {
        // (0) 마제석검 우선 — 전사 근접무장 결손(무산지 마을 주력 무기).
        v.storage.stone -= _swCost; if (_t419) _cons(v, 'stone', _swCost);   // ★마제석검(간돌 검) — 청동 자격 없는 마을의 주력 자급 무기(저품질, 전사용)
        v._stoneWeaponMade = (v._stoneWeaponMade || 0) + wAmt;
        v._swordMadeToday = (v._swordMadeToday || 0) + wAmt;   // ★근접검 비중 EMA 입력(검 제작)
        const wq = WEAP_Q_STONE * _qSkill;   // 마제석검 품질 = 석재등급(0.5) × 스킬
        v._weapQnum = (v._weapQnum || 0) + wq * wAmt; v._weapQden = (v._weapQden || 0) + wAmt;
        addProduce('weapon', wAmt); workNPC(npc);
      } else if (_toolTaper > 0 && (v.storage.stone || 0) >= _stCost) {
        // (a) 석기 도구 — 커버리지 부족분(e2 taper). _toolTaper>0이고 돌 있으면 제작.
        const tAmt = amt * _toolTaper;
        v.storage.stone -= _stCost; if (_t419) _cons(v, 'stone', _stCost); v._stoneToolMade = (v._stoneToolMade || 0) + tAmt;
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
        if (_spare > 0.02 && (_armoryShort || _needStoneSword) && (v.storage.stone || 0) >= _swCost * _spare) {
          const sAmt = wAmt * _spare;
          v.storage.stone -= _swCost * _spare; if (_t419) _cons(v, 'stone', _swCost * _spare);
          v._stoneWeaponMade = (v._stoneWeaponMade || 0) + sAmt;
          v._swordMadeToday = (v._swordMadeToday || 0) + sAmt;
          const wq2 = WEAP_Q_STONE * _qSkill;
          v._weapQnum = (v._weapQnum || 0) + wq2 * sAmt; v._weapQden = (v._weapQden || 0) + sAmt;
          addProduce('weapon', sAmt);
        }
        workNPC(npc);
      } else if (_armoryShort) {
        // (a2) 도구 포화 → 마제석검으로 마을 병기고 축적(무산지 마을 주력 무기 재고). 청동 자격 마을은 대장장이 청동검이 담당(여기 미해당).
        v.storage.stone -= _swCost; if (_t419) _cons(v, 'stone', _swCost);
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
      //   ★[T932] 그 날도 하루를 다 쓰는 것은 **그 대장장이 하나**다 — 종전 `return` 은 마을 하루 전체를 끝냈다(아래 줄 · 모듈 머리 `T932_SMELT_CONT`).
      const _smeltCap = jdef.base * skillMul * SMELT_PER_LABOR;   // 하루 전부를 쓰면 소화 가능한 양
      const _smelted = _trySmelt(v, jdef.base * skillMul);
      const _smeltFrac = _smeltCap > 0 ? Math.min(1, _smelted / _smeltCap) : 0;
      if (_smeltFrac >= 0.999) {   // 원석이 넘쳐 오늘 하루를 다 썼다(주조 없음)
        workNPC(npc);
        _t932Note(v, npc, day);              // ★[T932] 계측 전용(행동 무관)
        if (T932_SMELT_CONT) continue;       // ★[T932] 켬 = 이 대장장이만 하루를 끝낸다 — 뒤 차례 주민 · 마을 하루 꼬리는 돈다(모듈 머리 `T932_SMELT_CONT` 주석)
        return;                              // 끔(`=0`) = 종전 글자(마을 하루 전체가 여기서 끝난다)
      }
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
      } else if (_ironWeaponCapable(v) && (v.storage.iron || 0) >= 0.4 && (v.storage.stone || 0) >= (stoneRealOn() ? 0 : 0.2)) {
        // ★[T419] 켬이면 철검의 돌 = 0(작업대 무기는 재료 한 가지 · `stone-uses.js`) — 끔 = 0.2 그대로.
        const _isSt = stoneRealOn() ? 0 : 0.2;
        v.storage.iron -= 0.4; v.storage.stone -= _isSt;   // ★철검=최희소(청동 자격 없고 철이 *풍부*할 때만). 트레이스 축적으론 미발동 → 석공 마제석검.
        _cons(v, 'iron', 0.4); _cons(v, 'stone', _isSt);   // ★flow-EMA
        v._ironWeaponMade = (v._ironWeaponMade || 0) + amt;
        v._swordMadeToday = (v._swordMadeToday || 0) + amt;   // ★근접검 비중 EMA(철검=근접)
        const wq = WEAP_Q_IRON * _qSkill;   // 철검 품질 = 철등급(0.85) × 스킬
        v._weapQnum = (v._weapQnum || 0) + wq * amt; v._weapQden = (v._weapQden || 0) + amt;
        addProduce('weapon', amt);
        workNPC(npc);
      }
      // 청동/철 자격 없으면 오늘 제작 없음(돌칼은 대장장이가 안 만듦 — 석공 담당). 교역으로 청동 자격 갖추면 재개.
    } else if (jdef.produceSpecial === 'weaponsmith') {
      // ★S2 weaponsmith = 대장장이(smith)로 통합·폐지(capacity 0 → 아무도 안 뽑힌다 · 차출 1순위).
      // ★[T1196 ④] 셈 밖 잔존 안전코드(청동검 · 철검 · 돌칼 셋)를 걷었다 — 남은 무기장이 있어도 **아무것도 안 만든다**(일하지 않는 자리 · 이튿날 차출).
      //   ⚠이 갈래를 지우면 아래 범용 갈래(`jdef.output` = weapon)가 재료 없이 무기를 낸다 — 그래서 빈 갈래로 남긴다.
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
        // ★★[T724] 켬이면 수식이 오늘 낼 원석을 **수요 칸으로만** 남긴다(`_oreOutLast` — 몸의 수요 문 D · 나무 `_woodOutLast` 와 같은 꼴).
        //   몸이 친 날(`mineActOn`)은 원석이 이 줄로 안 들어온다 — 손 → 곳간(`mineToGranary`) 하나다(이중 0). 부산물(소금·점토·특수석)은 그대로.
        if (T724_MINE_ACT) v._t724OutAcc = (v._t724OutAcc || 0) + oAmt;
        if (!mineActOn(v)) {
          if (v.land && v.land.oreMix) foldOreMix(v, oreTotal(v), oAmt, v.land.oreMix);
          addProduce('ore', oAmt);
        }
        // ★청동 희소성 복원: tin을 부산물에서 *제거*. 종전 { copper:0.22, tin:0.11, ... } → tin은 전 마을 자동산출 = 청동 보편재의 근본 원인.
        //   이제 tin은 산지(land.tin>0)만 아래 별도 채굴. copper/iron/장식재는 종전대로 모든 광맥 부산물(청동기: 구리는 흔하되 주석이 병목).
        // ★★[재민 확정] 고정 dict 폐기. 지도의 **광종 구성**이 그대로 산출이 된다.
        //   전에는 금맥 옆 마을이나 철맥 옆 마을이나 {copper .22, iron .03, …} 로 똑같이 나왔다 —
        //   지도의 광종 배분이 경제에 **전혀 안 닿았다**. 이제 닿는다.
        //   oreMix 가 없는 호출부(랩·CLI)는 옛 dict 로 폴백해 기존 거동을 보존한다.
        //   ※oreMix 가 **없는** 호출부(랩·CLI)는 제련 층이 없던 시절 그대로 금속을 바로 낸다 —
        //     기존 회귀 기준선을 보존하기 위해서다. 지도가 있는 본 게임만 제련을 거친다.
        if (!T1188_ORE_SPLIT && !(v.land && v.land.oreMix)) {
          // ★[2026-08-01] 폴백 dict 도 시대를 탄다 — v2 5시드 회귀에서 여기서 나온 철 840 이
          //   쓸 데 없이 쌓였다(청동기 NPC 는 철을 못 다룬다). 시대가 모르는 금속은 뺀다.
          const bp0 = { copper: 0.22, iron: 0.03, silver: 0.05, gold: 0.02, gem: 0.01 };
          const bp = {}; for (const _k in bp0) { if (_ERA_METAL(_k) && !_eraKnows(_k)) continue; bp[_k] = bp0[_k]; }
          for (const r in bp) addProduce(r, oAmt * bp[r]);
        }
        if(!T1188_ORE_SPLIT){addProduce('salt', oAmt * 0.05); addProduce('clay', oAmt * 0.08);}   // ★소금=완충 교역재(광범위 수요 utility 0.8). 제거 시 교역균형 흔들려 취약 시드 boom-bust. 고증(소금길). 이제 광맥 채굴 부산물로 산출(돌 채석과 분리).
      }
      // ★청동 희소성: 주석 채굴 — *산지 마을(land.tin>0)만*. 대부분 마을은 land.tin=0 → tin 산출 0 → 청동 불가(석기 무장).
      //   주석(cassiterite)은 자체 광상 → land.ore와 독립(obsidian/jade 동형: 부존만으로 채굴). 산지 마을이 청동검을 만들고 수출(교역 특산).
      // ★산출을 *마을 규모·광부 수 무관* 정량(광량 = land.tin이 결정)으로 — 대형/소형 산지 마을 간 tin 산출 편차(→청동/명 시드 변동)를 차단.
      //   첫 광부가 마을 일일 정량(TIN_DEPOSIT_YIELD_FLAT × land.tin)을 1회 산출(이후 광부는 tin 안 캠 — 광석·구리는 계속). _tinGlut로 과축적 시 감산.
      //   ※oreMix 가 있는 마을(본 게임)은 주석도 **제련에서** 나온다 — 여기서 또 내면 이중 산출이다.
      if (!T1188_ORE_SPLIT && !(v.land && v.land.oreMix) && (v.land.tin || 0) > 0 && (v._tinToday || 0) === 0) {
        const tinAmt = TIN_DEPOSIT_YIELD_FLAT * (v.land.tin || 0) * (1 - _tinGlut);
        if (tinAmt > 0) { addProduce('tin', tinAmt); v._tinMined = (v._tinMined || 0) + tinAmt; v._tinToday = (v._tinToday || 0) + tinAmt; }
      }
      // ★S5 특수 산지 채굴 — 흑요석(화산지대)·옥(옥 산지). 광부가 광석과 별개로 채굴(비교우위 교역재).
      //   흑요석=예리(화살촉·소형칼날 → 사냥·방어 보조), 옥=위세품. 채굴량 ∝ land 부존. 부존 0이면 산출 0(대부분 마을).
      const obAmt = jdef.base * (v.land.obsidian || 0) * skillMul * toolB * (1 - _obsGlut);
      if (!T1188_ORE_SPLIT && obAmt > 0) addProduce('obsidian', obAmt);
      const jaAmt = jdef.base * (v.land.jade || 0) * skillMul * toolB * (1 - _jadeGlut);
      if (!T1188_ORE_SPLIT && jaAmt > 0) addProduce('jade', jaAmt);
      if (oAmt > 0 || obAmt > 0 || jaAmt > 0) workNPC(npc);
    } else if (jdef.output && baseAmt > 0) {
      // ★[재민 지시 "직접 해결"] 수요-캡(jdef.stockCap) — 재고가 캡 이상이면 **산출도 투입도** 건너뛴다.
      //   투입까지 멈추는 게 요점: 아무도 안 쓸 갑옷에 stone·hide·ore를 계속 태우던 게 결함이었다.
      //   (노동은 놀지만 job-switch 재배치 경로가 곧 데려간다 — mason taper와 달리 이 직군엔 잉여 전용처가 없다.)
      if (jdef.stockCap && (v.storage[jdef.output] || 0) >= jdef.stockCap(v)) { continue; }
      const _t860 = (T860_ON && T17_PRESERVE && CATCH_FROM[npc.currentJob]) ? _t860Begin(v, CATCH_FROM[npc.currentJob], _potA, _actA) : null;   // ★[T860] 잡기 전 곳간 · 잠재/실제(끔 = null)
      for (const [inp, need] of Object.entries(jdef.inputs || {})) {
        if(T1188_ORE_SPLIT&&inp==='ore'){takeOre(v,need);continue;}
        _cons(v, inp, Math.min(v.storage[inp] || 0, need));   // ★flow-EMA(실차감분)
        v.storage[inp] = Math.max(0, v.storage[inp] - need);
      }
      // ★유령 박멸(§9): 보조 투입(aux) — 있으면 소비, 없어도 제작 성립(inputs와 달리 게이트 아님 — 마감·안감재).
      for (const [inp, per] of Object.entries(jdef.aux || {})) {
        const _t = Math.min(v.storage[inp] || 0, per);
        if (_t > 0) { v.storage[inp] -= _t; _cons(v, inp, _t); }   // ★flow-EMA
      }
      // ★★[T100 4판 · 대체] 농부의 **추상 식량 산출은 여기서 나오지 않는다.**
      //   4판의 농사 산출은 생활층이 실제로 거둔 수확(`_lifeDoTask0` 수확 갈래 · 건당 `T100_K`)이다.
      //   ⚠**얹지 않고 걷어낸다** — 둘 다 넣으면 식량이 배로 들어와 곡물가가 붕괴한다(T123 마을5).
      //   ⚠막는 것은 이 **한 줄**뿐이다: 아래 부산물 루프(밀·쌀·보리·삼·모시)는 `baseAmt` 를 그대로
      //     타고 나가 T86 그대로다(섬유·곡물 사슬 무변 — 4판이 건드리는 것은 `food` 하나).
      // ★★[T312] 어부의 **추상 생선 산출도 여기서 나오지 않는다**(켠 마을에서). T100 4판의 그 문법 그대로 —
      //   **얹지 않고 걷어낸다**(공존 = 이중 생산 · T135 `repl` 규약). 막는 것은 이 한 줄뿐이고
      //   아래 부산물 루프(연어·새우·게·굴·미역·소금)는 `baseAmt` 를 그대로 타고 나간다(바다 계열 무변).
      // ★★[T325] 나무꾼의 **추상 목재 산출도 여기서 나오지 않는다**(켠 마을에서) — 같은 문법 · 같은 한 줄.
      //   아래 부산물 루프(수지·껍질·도토리)는 `baseAmt` 를 그대로 타고 나간다(T135 `repl` 이 이미 거른다).
      if (!(T100_FIELD_YIELD && npc.currentJob === 'farmer')
       && !(npc.currentJob === 'fisher' && fishActOn(v))
       && !(npc.currentJob === 'lumberjack' && woodFormulaOff(v))) {
        if (T635_SEA_SPECIES && npc.currentJob === 'fisher' && v.land && v.land.seaMix) _t635SeaProduce(addProduce, v.land.seaMix, baseAmt);   // ★[T635 ②] 바다 마을 = 종으로(합 kg 무변)
        else addProduce(jdef.output, baseAmt);
      }
      // ★★[T179 2026-09-12] **걷어낸 자리에 배율만 남겨 둔다.** 위 한 줄이 농부의 추상 산출을 막는 순간
      //   `baseAmt` 안의 `skillMul·toolBoost·inputMult` 도 같이 사라진다 — T154·T166 의 문이 `baseAmt` 를
      //   통째로 덮어써서 저지른 것과 **같은 결함**이다(족보 145). 여기선 덮을 문이 없으니 **심어 둔다**:
      //   실체 자리(생활층 수확 갈래)가 이걸 읽어 `harvestToGranary(v, n, mul)` 로 넘기면 산다.
      //   ⚠**여기서 곱하지 않는다** — 곱하면 이중이다(배율은 실체가 나는 곳에 한 번).
      //   ⚠읽는 자리가 아직 없으므로(서버 손잡이 끔 · `_esk` 농부 링크 없음) **세계는 안 움직인다**.
      //   ⚠사냥·벌목 문과 **같은 필드**를 쓴다(정본 하나 — 사본 0). 농부는 `jobScale === 1` 이라 배율은 셋뿐.
      //   ⚠`else` 가 아니라 **독립한 `if`** 다: 위 대체 게이트를 건드리는 돌연변이(T183 ⑦ 셋째)가
      //     매달린 `else` 를 문법 오류로 만들어 **엉뚱한 이유로 빨개지는** 것을 막는다.
      if (T100_FIELD_YIELD && npc.currentJob === 'farmer') npc._t172mul = skillMul * toolBoost * inputMult;
      // ★[T312] 어부도 같은 자리에서 제 배율을 남긴다 — 실체 쪽(생활층 낚시)이 이걸 읽는다(T172 규약 · 사본 0).
      if (npc.currentJob === 'fisher' && fishActOn(v)) npc._t172mul = skillMul * toolBoost * inputMult;
      // ★[T325] 나무꾼도 같은 자리에서 제 배율을 남긴다 — 실체 쪽(생활층 벌목)이 이걸 읽는다(T172 규약 · 사본 0).
      //   ⚠T166 `woodIncomeFn` 문이 심는 자리와 **같은 필드**다(정본 하나). 서버는 그 문을 안 주므로 겹치지 않는다.
      if (npc.currentJob === 'lumberjack' && woodActOn(v)) npc._t172mul = skillMul * toolBoost * inputMult;
      if (jdef.byproduct) {
        for (const [r, rate] of Object.entries(jdef.byproduct)) {
          // ★모시(ramie) 수요-캡 공급(2026-07-13, 사용자 결정 — 교역 무교란): 재고가 수요(flowT=소비EMA×30, +부트스트랩 floor N×RAMIE_BOOT_PC) 이상이면 산출 스킵.
          //   '짜는 만큼만 짠다' — 잉여 0 → satMul taper 없음 → 유휴노동(_idleFrac) 인플레 0 → 캐러밴 폭증·식량드레인 없음.
          //   고정 byproduct(잉여→taper→교역폭발)가 신선 짝비교서 505 knife-edge 605→19 붕괴시킨 진범(rate 0.01·util 0.05로도)이라 공급 자체를 수요에 묶음.
          //   ★addProduce를 *스킵*해야 _potA(잠재생산) 미오염 — satMul taper만으론 잠재가 idle로 잡혀 부족. 삼베(hemp)·곡물은 기존 경로 불변(의류 사슬 재튜닝 금지 준수).
          // ★[T17 ③] 자염은 **바다에 닿는 마을만** 굽는다(위 fisher.byproduct 주석).
          if (r === 'salt') { if (!T17_SALT || !(v.land && v.land.coastal)) continue; }
          // ★[T135] 나무 층이 대는 품목은 부산물로도 안 낸다 — **같은 이중계상**이다.
          //   벌목꾼의 `acorn 0.06/일` 이 그것이다: 도토리는 이제 참나무를 베거나 딸 때 실제로 나온다.
          //   주입이 없으면(되돌림·v1) 이 줄은 아무것도 안 한다(비트 동일).
          if (v._world && v._world.forageTakeFn && v._world.forageRealItems && v._world.forageRealItems.indexOf(r) >= 0) continue;
          if (r === 'ramie') {
            if (v.npcs.length < RAMIE_MIN_POP) continue;   // 미성숙 마을(개척기) 모시 안 짬 — 콜로니 취약 궤적 무교란
            if ((v.storage.ramie || 0) >= Math.max(v.npcs.length * RAMIE_BOOT_PC, ((v._consEMA || {}).ramie || 0) * 30)) continue;   // 수요 충족 → 스킵(잉여 0)
          }
          addProduce(r, baseAmt * rate);
        }
        // ★[T635 ①] 조개 팔찌감 — 어부 부산물(조개 칸 `oyster` 율 그대로) × 이 마을의 산지 단계(`land.shellBangle` · 켠 판의 바다 마을만)
        if (T635_SHELL_ORNAMENT && npc.currentJob === 'fisher' && v.land && v.land.shellBangle > 0 && _t635ShellItem()) addProduce('shell_bangle', baseAmt * (jdef.byproduct.oyster || 0) * v.land.shellBangle);
      }
      if (_t860) _t860Dry(v, npc, _t860, _potA, _actA, addProduce);   // ★[T860] 잡은 날 제 손으로 말린다(끔 = 이 줄 무동작)
      workNPC(npc);
    }
    } finally { if (_t1196S) _t1196End(v, npc, _t1196S, day); }   // ★[T1196] 갈래가 곳간 · 금고에 낸 차를 작업표로 떼고 곳간을 되돌린다(`continue` · `return` 길도 여기를 지난다)
  }
  // ★여유노동 비율 저장 — 교역 동시성 상한(tickTradeV2 spareCap)에서 사용.
  v._idleFrac = _potA > 0 ? Math.max(0, 1 - _actA / _potA) : 0;
  // ★★[T183 2026-09-12 · 이 파일의 유일한 접점] **켠 팔에서도 농부의 잠재가 쌓인다.**
  //   T176 §1 이 잰 비대칭: 켠 팔은 `addProduce` 를 건너뛰고 `harvestToGranary` 로 곳간에 직접 넣으므로
  //   `dailyProductionPotential.food` 에 농부 몫이 **안 쌓인다.** 그 값을 밑변으로 쓰는 자리가 둘이다 —
  //     `totalFoodProductionEquivalent(dailyProductionPotential)` → **prodK**(리비히 상한의 생산 다리),
  //     `woodCapFlow += dailyProductionPotential.food × STRAW_FUEL_PER_FOOD` → **fuelK**(볏짚 연료 부양력).
  //   ⇒ 켠 팔은 짚을 때면서(`_grainToday` 에는 들어온다) "짚이 없다"고 셌다. 그건 세계가 아니라 **계산 자리**다.
  //   ★고치는 자리는 **실체가 나는 여기 하나**다(족보 145 "배율은 실체 나는 곳에" 와 같은 결):
  //     오늘 밭이 곳간에 실제로 넣은 그 수를 **그대로** 잠재에도 적는다. 새 수 0 · 사본 0 ·
  //     추상식 부활 0(4판이 걷어낸 `JOBS.farmer.base × 지력` 을 되살리지 않는다).
  //   ★이중 0: 켠 팔에서 농부의 `food` 는 `addProduce` 를 **안 탄다**(위 `T100_FIELD_YIELD` 게이트 한 줄) —
  //     그러니 잠재에 들어오는 길은 이 줄 하나뿐이다. 부산물(밀·쌀·보리)은 끈 팔과 **같은 길**로 간다(무변).
  //   ★끈 팔 비트 동일: 끄면 `harvestToGranary` 가 `_t100InflowToday` 를 아예 안 만들고
  //     `gardenFloorTopUp` 이 0 을 돌려주므로 `_pot` 이 0 이고 **아래 if 가 한 번도 안 열린다**(속성도 안 생긴다).
  //   ⚠하루 시차: 생활층 수확은 econ 틱 **다음**에 돌므로 이 수는 어제치다 — 텃밭 하한(5판)이 이미 그 규약이다.
  //   ★손잡이 밖: `T100_FIELD_YIELD` 를 **이 줄에서도** 본다. 실지에선 끈 팔에 `_t100InflowToday` 가
  //     아예 안 생기지만(두 입구가 이미 손잡이를 본다), 밖에서 누가 그 필드를 심어도 끈 팔은 안 움직인다.
  t100EvenRelease(v);   // ★[T227] 대기분 하루치를 **읽기 전에** 푼다 — 그래야 잠재·장부·텃밭 하한이 같은 수를 본다(손잡이 끔이면 0)
  t368EvenRelease(v);   // ★[T368] 품목별 대기분도 같은 자리에서(손잡이 끔·대기 없음이면 0 — 첫 줄에서 돌아온다)
  const _t100In = T100_FIELD_YIELD ? (v._t100InflowToday || 0) : 0;   // 오늘 수확이 곳간에 넣은 양(아래가 비우기 전에 읽는다)
  const _t100Pot = _t100In + gardenFloorTopUp(v);   // + 텃밭 하한이 채운 양 — 둘 다 **밭이 낸 식량**이다
  if (_t100Pot > 0) {
    v._t100InflowToday = 0;   // ★텃밭을 끈 판(`T100_GARDEN=0`)에서도 오늘치로 비운다 — 누적 누수 차단
    dailyProductionPotential.food = (dailyProductionPotential.food || 0) + _t100Pot;
    // ★★[T193] **실현 장부에도 같은 양을 적는다**(손잡이 뒤 · 기본 끔).
    //   ⚠왜 여기인가 — 생활층 자리(`harvestToGranary`)에서는 **못 적는다.** 그 버퍼는 `v.dailyProductionBuf`
    //     인데 틱 머리(`:2090~2092`)가 매일 0 으로 리셋한다. 생활층은 틱 **뒤**에 도므로 거기서 적으면
    //     다음 틱이 읽기 전에 지워진다(실측: 999 → 0). 살아남는 자리는 **틱 안, 읽는 줄(`:2870`) 앞** 뿐이고
    //     그게 바로 T183 이 연 이 줄이다 — 같은 양(`_t100Pot`)이 이미 손에 있다.
    //   ★새 수 0 · 새 상수 0 · 사본 0 — 잠재에 적는 그 수를 실현 장부에도 **그대로** 적는다.
    //   ★이중 0 — 켠 팔에서 농부의 `food` 는 `addProduce` 를 안 탄다(`:2609` 게이트). 들어오는 길은 이 줄 하나다.
    //   ⚠`addProduce` 를 부를 수는 없다 — 그건 NPC 루프 안의 클로저다(`npc`·`sm`·`_hpm` 에 묶여 있다).
    //     그 함수가 장부에 하는 일은 `dailyProduction[r] += amt` 한 줄이고, 아래가 그 한 줄이다.
    if (T193_LEDGER) dailyProduction.food = (dailyProduction.food || 0) + _t100Pot;
  }
  // ★★[T312] 어제 손으로 들여온 생선을 **같은 자리에서** 장부에 적는다 — 이유도 T193 과 같다:
  //   생활층은 틱 **뒤**에 돌아서 거기서 적으면 다음 틱 머리의 리셋이 지운다. 살아남는 자리는 여기뿐이다.
  //   ★새 수 0 · 이중 0 — 켠 마을에서 `fish` 는 `addProduce` 를 안 탄다(위 게이트) ⇒ 들어오는 길은 이 줄 하나다.
  //   ⚠하루 시차: T100 4판·텃밭 하한이 이미 그 규약이다(어제치를 오늘 장부에).
  const _t312In = T312_FISH_ACT ? (v._t312InflowToday || 0) : 0;
  if (_t312In > 0) {
    v._t312InflowToday = 0;
    dailyProductionPotential.fish = (dailyProductionPotential.fish || 0) + _t312In;
    dailyProduction.fish = (dailyProduction.fish || 0) + _t312In;
  }
  // ★★[T325] 어제 손으로 들여온 목재도 **같은 자리에서** 장부에 적는다 — 이유도 T193·T312 와 같다.
  //   ★새 수 0 · 이중 0 — 켠 마을에서 `wood` 는 `addProduce` 를 안 탄다(위 게이트) ⇒ 들어오는 길은 이 줄 하나다.
  const _t325In = (T325_WOOD_ACT || v._t1238Land) ? (v._t325InflowToday || 0) : 0;   // ★[T1275] 영토 v2 표지 마을은 수식 나무꾼 세계에서도 개간 통나무가 이 칸으로 든다(위 `woodToGranary` 머리말)
  if (_t325In > 0) {
    v._t325InflowToday = 0;
    dailyProductionPotential.wood = (dailyProductionPotential.wood || 0) + _t325In;
    dailyProduction.wood = (dailyProduction.wood || 0) + _t325In;
  }
  // ★★[T1195] 몸이 잡아 들여온 고기 · 가죽 · 뿔 · 뼈도 **같은 자리에서** 장부에 적는다(T312 · T325 와 같은 꼴 · 이중 0 — 켠 호스트에서 사냥꾼은 `addProduce` 를 안 탄다).
  if (T1195_HUNT_REAL && v._t1195InByItem) {
    for (const [k, q] of Object.entries(v._t1195InByItem)) { if (!(q > 0)) continue; dailyProductionPotential[k] = (dailyProductionPotential[k] || 0) + q; dailyProduction[k] = (dailyProduction[k] || 0) + q; }
    v._t1195InByItem = {};
  }
  // ★★[T724] 손으로 들여온 원석도 **같은 자리에서** 장부에 적는다(T312 · T325 와 같은 꼴 · 이중 0 — 몸이 친 날 `ore` 는 `addProduce` 를 안 탄다).
  //   그리고 수식이 오늘 낼 원석(광부 갈래가 모은 `_t724OutAcc`)을 내일의 수요 칸 `_oreOutLast` 로 넘긴다.
  if (T724_MINE_ACT) {
    const _t724In = v._t724InflowToday || 0;
    if (_t724In > 0) {
      v._t724InflowToday = 0;
      if(T1188_ORE_SPLIT){for(const[k,q]of Object.entries(v._t1188InByItem||{})){dailyProductionPotential[k]=(dailyProductionPotential[k]||0)+q;dailyProduction[k]=(dailyProduction[k]||0)+q;}}else{
      dailyProductionPotential.ore = (dailyProductionPotential.ore || 0) + _t724In;
      dailyProduction.ore = (dailyProduction.ore || 0) + _t724In;
      }
    }
    v._oreOutLast = v._t724OutAcc || 0; v._t724OutAcc = 0; if(T1188_ORE_SPLIT)v._t1188InByItem={};
  }
  // ★★[T374 2026-09-23 · ★T347 의 빚을 갚는다] **채집 입고도 같은 자리에서 장부에 적는다.**
  //   T347 은 `_t347InflowToday` 를 남기기만 하고 **이 다리를 안 놓았다** — 그래서 두 가지가 동시에 틀렸다:
  //     ⓐ 손으로 들여온 채집물이 **생산 장부에 한 번도 안 올랐다**(어부·나무꾼과 달리 · 이중 0 게이트는 걷었으므로
  //        그 품목의 `dailyProduction` 이 **비었다** — prodK·부양력이 읽는 밑변이다)
  //     ⓑ 오늘치 칸이 **리셋되지 않아** 영원히 쌓였다 ⇒ T374 의 수요 문이 첫날 뒤로 **항상 0** 이 됐다.
  //   ⇒ T374 를 켜자 등가가 12% 에 머물러 그 빚이 드러났다(보고 §2 자기신고). 여기가 그 수리다.
  //   ⚠품목이 여럿이라 `_t347InByItem` 을 쓴다(위 `forageToGranary`) — 스칼라는 수요 문의 분모로 남는다.
  //   ⚠새 수 0 · 이중 0 — 켠 마을에서 걷는 품목은 `addProduce` 를 안 탄다 ⇒ 들어오는 길은 이 줄 하나다.
  const _t347In = T347_FORAGE_ACT ? (v._t347InflowToday || 0) : 0;
  if (_t347In > 0) {
    v._t347InflowToday = 0;
    const by = v._t347InByItem || null;
    v._t347InByItem = null;
    if (by) for (const it in by) {
      const a = by[it]; if (!(a > 0)) continue;
      dailyProductionPotential[it] = (dailyProductionPotential[it] || 0) + a;
      dailyProduction[it] = (dailyProduction[it] || 0) + a;
    }
  }
  // ★★[T368 2026-09-25] **밭 입고도 같은 자리에서 장부에 적는다 — 넷째 적용**(T312 어부 · T325 나무꾼 · T374 채집과 같은 꼴).
  //   품목별 오늘치(`_t368InByItem` — `_t368Credit` 가 남긴 낱개)를 잠재·실현 장부에 **그 품목으로** 적는다.
  //   ⚠`food` 로 접지 않는다 — 식량 값은 `totalFoodProductionEquivalent(…, v)` 가 품목마다 센다(econ 정본 · 주입 정본).
  //   ⚠이중 0 — 켠 팔의 밭은 `harvestToGranary` 의 T100 갈래(`_t100InflowToday`)를 **안 탄다** ⇒ 들어오는 길은 이 줄 하나다.
  //   ⚠`_t368InflowToday`(식량등가)는 위 텃밭 하한이 먼저 읽었다 — 여기서 비운다(누적 누수 차단).
  const _t368By = T368_FARM_ACT ? (v._t368InByItem || null) : null;
  if (_t368By || (T368_FARM_ACT && v._t368InflowToday)) {
    v._t368InflowToday = 0;
    v._t368InByItem = null;
    if (_t368By) for (const c in _t368By) {
      const u = _t368By[c]; if (!(u > 0)) continue;
      dailyProductionPotential[c] = (dailyProductionPotential[c] || 0) + u;
      dailyProduction[c] = (dailyProduction[c] || 0) + u;
    }
  }

  // ★S3 막석기 자급 안전망 — 도구(석기)가 치명적으로 부족(커버리지<SELF_TOOL_COV)하면 도구의존 노동자가 급할 때 막석기를 손수 자급.
  //   "농부는 도구만 급할 때 자급"(스펙 8) — 무기는 자급 안 함(석공·대장장이 전담). 낮은 노동(0.02/인), 돌 있을 때만. 정교 석기는 석공.
  if (toolDeps > 0) {
    const _tcov = ((v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0)) / toolDeps;
    if (_tcov < SELF_TOOL_COV && stoneRealOn()) {
      // ★★[T419] 켬 — 막석기 = 서버 조잡한 석기(자갈·잔가지 · **돌 0**) 세 종 평균을 먹는다(`stone-uses.js`). 재료가 모자라면 있는 만큼.
      const _cc = stoneRealPer('crude') || {};
      let _self = toolDeps * SELF_TOOL_RATE;
      for (const k of Object.keys(_cc)) if (_cc[k] > 0) _self = Math.min(_self, (v.storage[k] || 0) / _cc[k]);
      if (_self > 0) {
        for (const k of Object.keys(_cc)) if (_cc[k] > 0) { v.storage[k] -= _self * _cc[k]; _cons(v, k, _self * _cc[k]); }
        v.storage.tool = (v.storage.tool || 0) + _self;
        v._selfToolMade = (v._selfToolMade || 0) + _self;
        v._toolQnum = (v._toolQnum || 0) + SELF_TOOL_Q * _self; v._toolQden = (v._toolQden || 0) + _self;   // 막석기 저품질
      }
    } else if (_tcov < SELF_TOOL_COV && (v.storage.stone || 0) >= 0.2) {
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
  const _homeN = t1159HomeN(v);
  // ★★[T423 2026-09-26 · 군량 = 행위 ⓐ] 원정군은 **제 짐을 먹는다** — 마을 식사 명부에서 빠진다(T295 "징발자는 생산에서
  //   빠진다"의 소비판 · 이중 계산 닫힘: 종전엔 팩 1 + 마을 1 = 1인 하루 2단위). 표식 `_warPack` 은 war-core 가 **손잡이 켤 때만**
  //   공격 징발에 붙인다(방어 소집은 안 붙는다 — 제 마을 곳간을 먹는다) ⇒ 끔이면 이 줄은 `N` 그대로 = 비트 동일.
  // ★[T1074] 켬 = 하루 몫은 사람마다(적응만큼 덜) + 남은 식량으로 갚을 빚 — 한 번의 섭식 정본 호출(식단 기록 한 번) · 먹은 몫을 사람마다 나눈다
  // ★[T1197] 켬 = 끼니 둘 · 몸 게이지(위 T1197 머리글) — 빚 장부(T1074)는 게이지의 거울로 그 안에서 선다 · 끔 = null = 아래 종전 줄
  const _t97 = (T1197_MEAL_BODY && _t1197()) ? t1197Day(v, day) : null;
  const _fdE = (!_t97 && T1074_FOOD_DEBT) ? _fdEaters(v) : null, _fdN = _fdE ? _fdNeed(_fdE) : null;
  const foodNeed = _t97 ? _t97.need : _fdN ? _fdN.need : _t423EatN(v, N) * DAILY_FOOD_CONSUMPTION;
  const _fdGap = _fdN ? consumeFood(v, _fdN.need + _fdN.debt) : 0;
  const _fdDay = _fdN ? _fdSettle(_fdE, _fdN.need, _fdN.debt, Math.max(0, _fdN.need + _fdN.debt - _fdGap)) : null;
  const foodGap = _t97 ? _t97.short : _fdDay ? _fdDay.shortTotal : consumeFood(v, foodNeed);  // 남으면 굶주림
  // 도구 마모 — tool dependent NPC만
  // ★★★[T180 2026-09-12 · 이 파일의 유일한 접점] **도구 수명을 밖에서 물어본다.**
  //   T163(②)·T173(①)이 서로 다른 방향에서 같은 곳을 가리켰다 — 움직이는 것은 `도구≈0` 일수다.
  //   그 자리가 여기다: 마모가 도구 재고를 깎고, 재고가 마르면 석공이 `_stCost` 게이트에서 멈춘다.
  //   ⚠**주입이 없으면 한 글자도 안 바뀐다** — 배수는 이 파일이 안 갖는다(`world.toolWearMul` 이 준다).
  //     지금 그것을 주는 것은 **랩**(`lab/전쟁실험실.html` `L_TOOL_WEAR`)뿐이고 서버·CLI·하네스는
  //     안 주므로 배수 1 = **비트 동일**(T135 `forageTakeFn` · T157 `happyWorkW` · T163 `stoneBudgetFn` 선례).
  //   ⚠**새 수 0** — 감가율은 `DAILY_TOOL_WEAR_PER_*` 그대로다. 랩이 주는 것은 **A/B 의 눈금**(배수)이다.
  const _twMul = (v._world && typeof v._world.toolWearMul === 'number' && v._world.toolWearMul > 0) ? v._world.toolWearMul : 1;
  const toolWear = v.npcs.reduce((sum, n) => {
    const jd = JOBS[n.currentJob];
    if (!jd.toolDependent) return sum;
    return sum + (n.currentJob === 'farmer'
      ? DAILY_TOOL_WEAR_PER_FARMER : DAILY_TOOL_WEAR_PER_OTHER);
  }, 0) * _twMul;
  v.storage.tool = Math.max(0, v.storage.tool - toolWear);
  // ★★[T17 ① 2026-09-02 · 재민 확정] **마모를 흐름으로 기록한다** — `_cons` 한 줄.
  //   왜 이 한 줄인가: 도구는 이미 이 econ 에서 **생산되고(mason) 소비되고(위 마모) 거래된다**.
  //   그런데 마모가 `_consDay` 에 안 실려서 `_consEMA.tool` 이 **0** 이었다. 그 결과:
  //     ⓐ 사건 장부의 부족·글럿은 `ema > 0` 인 품목만 연다(`server/events.js`) ⇒ **도구는 부족 사건에
  //       한 번도 못 나왔다**(실측: 51마을 800일 부족 0건 · 글럿 0건 — `scripts/t17-metrics.js`).
  //     ⓑ v2 가격의 `flowT`(=소비EMA×30)가 0 이라 **도구 가격에 수요 축이 없었다** ⇒ 거래소·P2P 가
  //       참조할 앵커가 없다(지시 ①의 목표가 정확히 이것이다).
  //   ⇒ 새 계수는 **하나도 없다.** 이미 있는 마모량(`DAILY_TOOL_WEAR_PER_*`)을 **기록만** 한다.
  //   근거: 위 `_cons` 계약 주석 — *"신규 재화는 소비처에 `_cons` 한 줄
  //   (CAP_TARGET·시드·글럿가드·감산 4종 수동 통합 불요)"*. 도구는 그 한 줄이 빠져 있던 재화다.
  if (T17_TOOL) _cons(v, 'tool', toolWear);
  // ★약재 일상 복용 소모(§9 2차) — 인구 비례 흐름(재고 내에서만·부족해도 페널티 없음, 건강 보너스만 사라짐). _herbUsed = 유통 진단 누적.
  if (v.storage.herb > 0) {
    const _hTake = Math.min(v.storage.herb, N * HERB_DAILY_PC);
    v.storage.herb -= _hTake; v._herbUsed = (v._herbUsed || 0) + _hTake; _cons(v, 'herb', _hTake);   // ★flow-EMA
  }
  // ★★[T17 ③ 2026-09-02 · 재민 확정] **소금을 실제로 쓴다** — 약재와 **같은 꼴**의 소량 상시 소비.
  //   왜 이 줄이 필요한가(§0 실측): 소금은 재화로 실재하고 생산 코드에도 닿는데 **아무도 안 먹었다.**
  //   `contributes.subsistence 0.3` 은 `_computeVillageStats` 가 **재고**로 읽는 stat 이지 소비가 아니다.
  //   그래서 800일 누계 1,113.9 를 생산하고도 끝 재고 0.000 · 부족 사건 0건이었다(`회부_자염_다음층.md` §B-0).
  //   ★계수 `SALT_DAILY_PC` 의 근거 **둘이 같은 값에서 만난다**(족보 (85)):
  //     ⓐ 이 파일의 선례 — `HERB_DAILY_PC = 0.01`("소량 상시 소비" 유형의 유일한 기존 값)
  //     ⓑ 고증·단위 — 성인 1일 소금 ~10g · `specialty.salt.weight = 1.0`(kg/단위) ⇒ 0.01 단위/인/일
  //   ⚠약재와 같이 **재고 내에서만** 쓴다. 없으면 안 쓰고 페널티도 없다 — 소금이 굶겨 죽이면
  //     그건 아사 폐지 캐논을 어기는 것이다. 있으면 `contributes` 로 생활수준에 얹힐 뿐이다.
  if (T17_SALT && v.storage.salt > 0) {
    const _sTake = Math.min(v.storage.salt, N * SALT_DAILY_PC);
    v.storage.salt -= _sTake; v._saltUsed = (v._saltUsed || 0) + _sTake; _cons(v, 'salt', _sTake);   // ★flow-EMA
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
    const _t1113Q = t1113On('T1113_LOW_QUALITY') ? t1113LowMul(v) : 1;   // ★[T1113 ③] 품질 목표에도(끔 = 1)
    toolTarget *= _t1113Q;
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
    if (weapTarget != null) weapTarget *= _t1113Q;
    if (weapTarget != null) v._weapQ = (v._weapQ != null ? v._weapQ : WEAP_Q_STONE) * (1 - WEAP_Q_EMA) + weapTarget * WEAP_Q_EMA;
  }
  // ★의복 품질 EMA(2026-07-13) — 오늘 재봉분(숙련×재료 믹스)이 마을 의복 스톡 질을 서서히 갱신(_weapQ 동형). 방한(coldStress 완화 보너스, _computeVillageStats)에 반영. 제작 없는 날은 유지.
  {
    if ((v._clothQden || 0) > 0) {
      const _cqT = v._clothQnum / v._clothQden * (t1113On('T1113_LOW_QUALITY') ? t1113LowMul(v) : 1);   // ★[T1113 ③] 옷 품질 목표에도(끔 = ×1)
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
  const dailyFoodProd = totalFoodProductionEquivalent(T1279_COOK ? Object.assign({}, dailyProduction, { cooked_food: 0 }) : dailyProduction, v);   // ★[T368] 둘째 인수 = 이 마을(주입 작물 값 · 끈 팔 0)   // ★[T1279] 켬 = 조리식 칸 0(요리는 옮김 · 끔 = 종전 글자)
  const dailySurplus = dailyFoodProd - foodNeed;
  v.surplusEMA.food = 0.95 * v.surplusEMA.food + 0.05 * dailySurplus;

  // 4) K (수용 한계) — 식량 자리 합. 영토 확장으로 자리 ↑ = K ↑
  //    실제 산출 K_prod = (자체 생산 + 외부 import) / 소비.
  //    v2 r11: import 포함 — 작은 마을이 외부 거래로 부양되는 진짜 시장 동학 반영.
  const _slotKraw = totalFoodSlots(v);
  // ★[T931] 켬 = 식량 자리 K 에 땔감 K 와 같은 신뢰 관성(아래 `_fuelKema` 줄과 같은 꼴 · 같은 수 0.98 · 0.02 · 첫날 = 그날 자리) — 끔 = 종전(그날 자리 그대로 · 새 칸 0)
  //   `'season'` = 같은 관성을 땅 배수의 몫에만(`_t931SeasonSlot` — 원래 땅의 자리 × 관성 f)
  const slotK = T931_SLOTK_EMA ? (v._slotKema = v._slotKema === undefined ? _slotKraw : 0.98 * v._slotKema + 0.02 * _slotKraw) : T931_SLOTK_SEASON ? _t931SeasonSlot(v, _slotKraw) : _slotKraw;
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
  const dailyFoodProdPotential = totalFoodProductionEquivalent(dailyProductionPotential, v);   // ★[T368] 같은 자
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
    const _cf = T1149.k ? (v.counts || {}) : jobCapacity(v);   // ★[T1149 ⓐ] 켬 = 지금 그 일을 하는 사람(끔 = 일자리 만충 가정 — 종전 글자)
    const _fishRawCap = (_cf.fisher || 0) * JOBS.fisher.base * (v.land.water || 0);
    const _fishCap = (v.land.fishSustain != null && _fishRawCap > 0) ? Math.min(_fishRawCap, v.land.fishSustain) : _fishRawCap;
    // 채집은 산출이 믹스라 식량환산 비율을 그 마을 실제 믹스(foragerYieldsFor)로 정확히 계산한다 — 임의 계수 없음.
    const _fy = foragerYieldsFor(v);
    let _fySum = 0, _fyFood = 0;
    for (const _r in _fy) { _fySum += _fy[_r]; _fyFood += _fy[_r] * (FORAGE_FOOD_FACTOR[_r] || (_r === 'food' ? 1 : 0)); }
    const _foodShare = _fySum > 0 ? _fyFood / _fySum : 0;
    const _forRawCap = Math.floor((_cf.forager || 0) * 0.5) * JOBS.forager.base * JOBS.forager.landBoost(v);
    const _forCap = (v.land.forageSustain != null && _forRawCap > 0) ? Math.min(_forRawCap, v.land.forageSustain) : _forRawCap;
    // ★[T100] 부양력(prodK)도 **같은 밑변**을 본다 — 산출은 밭인데 K 는 지력이면 인구가 밭 없이 부푼다.
    const _capFlow = (T1276_FARM_K ? t1276FieldFlow(v) : farmFlowPerDay(v, _cf.farmer || 0) * _paddyMul * (v._clearedFrac != null ? v._clearedFrac : 1))   // ★[T1276] 켬 = 몸이 일군 밭의 흐름
                   + _fishCap
                   + (_cf.hunter || 0) * JOBS.hunter.base * (v.land.game || 0)
                   + _forCap * _foodShare;
    _prodKraw = (_capFlow + dailyImport) / DAILY_FOOD_CONSUMPTION;
    if (T1149.k) _prodKraw += totalFoodEquivalent(v) / t1149LeanDays(day) / DAILY_FOOD_CONSUMPTION;   // ★[T1149 ⓐ] + 곳간이 다음 봄까지 먹일 사람
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
  //   재고를 실제로 축내므로 picker 가 벌목꾼을 더 배치 → 숲 압박. 야금촌은 제련연료로 숲을 더 빨리 소진(고증: 제련=삼림파괴 동인).
  //   ★[T285 정정] 그 배치를 하는 줄은 **rational picker 의 주거 목재 안전망**(`N ≥ housing×0.95 && wood < N×2`)이다.
  //     예전 이 주석이 이름을 댔던 `subsistence picker(wood<N×5)` 는 옛 `pickDeficitJob` 안에 있고
  //     이 세계에서 **한 번도 안 돈다**(함수 진입 0/0/0 · rational 은 16,963/17,267/21,952 — 보고/T285).
  // ★S2 야금공(제련 고온·대량 연료) = 대장장이(청동·철 무기) + 갑옷장이. 석공(mason)은 석기·목공(간돌·활)이라 제련 연료 0(고온 화로 없음).
  const smelters = (v.counts.smith || 0) + (v.counts.weaponsmith || 0) + (v.counts.armorsmith || 0);
  // ★의복 마모(2026-07-12) — 입던 옷이 해짐: 기본 + 한랭 가중(겨울 험한 사용·겹쳐 입음). 커버리지는 스탯 항이 소비.
  const _wear = N * CLOTH_WEAR_PC * (1 + 2 * (v._coldStress || 0));
  _cons(v, 'clothes', Math.min(v.storage.clothes || 0, _wear));   // ★flow-EMA(마모 실차감)
  v.storage.clothes = Math.max(0, (v.storage.clothes || 0) - _wear);
  v._clothCov = Math.min(1.5, (v.storage.clothes || 0) / Math.max(1, N));
  // ★건축 유지(2026-07-12 — 돌 감산 자연화): 담장·숫돌 등 **부대 시설**이 닳는다 — 인구 비례 석재 실소비.
  //   ★[2026-08-02e] 이 줄은 주거 유지의 **일부**다(전부가 아니다). 나머지 0.04(집 본체·구들·바닥)는
  //     v2 `SUBSISTENCE_PER_NPC.stone` 이 적는다. 총 실물 소비 = 0.06/인/일. 두 곳을 합쳐야 전체다 —
  //     한쪽만 보고 "이게 주거 유지 전부"라고 읽으면 안 된다(그 오독이 이번 배치의 회부 사유였다).
  const _maintS = Math.min(v.storage.stone || 0, N * STONE_MAINT_PC);
  if (_maintS > 0) { v.storage.stone -= _maintS; _cons(v, 'stone', _maintS); }   // ★flow-EMA
  const fuelNeed = _homeN * _firewoodPC() * (1 + FUEL_COLD_W * (v._coldStress || 0)) + smelters * SMELT_FUEL_PER;   // ★한랭 난방 가중(2026-07-12) — 겨울 연료 수요 실물화
  // ★볏짚 먼저(공짜 부산물, 당일 소진 — 취사·난방용. 제련은 고온이라 목재만) → 부족분만 목재.
  // ★[T240] 종전(끔)은 `Math.min(상한, 원량)` 그대로 — 넘친 짚은 그날로 사라진다(비트 동일).
  //   켜면 넘친 몫이 `_strawPend` 로 이월되고 다음 날부터 **상한만큼** 탄다(상한은 안 건드린다).
  if (T1135_FUEL_EQ) v._t1135Need = fuelNeed;   // ★[T1135 ①] 나무꾼 몫 = 그날 땔감 수요(내일 생활층 벌목이 T374 문의 분자로 읽는다)
  if (T1148_FUEL_JOB) { const _c = t1148Cold(v); v._t1148 = _c; if (T1135_FUEL_EQ && _c && _c.debt > 0) v._t1135Need += _c.debt / Math.max(1, _c.H); }   // ★[T1148] 추위 빚을 겨울 끝까지 고르게(갚는 길 · 위 머리말)
  const _strawCap = _homeN * _firewoodPC();
  const _strawRaw = (v._grainToday || 0) * STRAW_FUEL_PER_FOOD;
  const strawFuel = T240_STRAW_CARRY ? strawCarryBurn(v, _strawRaw, _strawCap)
                                     : Math.min(_strawCap, _strawRaw);
  v._grainToday = 0;
  // ★유령 박멸(§9): 하급 연료 — 잔가지(twig)·껍질(bark)을 장작보다 먼저 땜(LOW_FUEL_EQ eq). 취사·난방분만(제련 제외 = straw와 동일).
  //   채집 잔가지·벌목 껍질의 자연 소비처(연료 등가 편입) — 목재 소비 실절감.
  const _cookHeatNeed = Math.max(0, _homeN * _firewoodPC() - strawFuel);   // 하급 연료가 감당 가능한 몫(제련 제외)
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
  if (v.housing === undefined) v.housing = _homeN;
  const _h0 = v.housing;   // ★[T1054] 노후 앞 주거(그날 닳은 몫 = 이 값 × `HOUSE_DECAY` · 끔이면 안 읽는다)
  v.housing *= (1 - HOUSE_DECAY);   // 노후화
  const houseTarget = _homeN * HOUSE_BUFFER;
  const _t958 = T958_HOUSE_REAL && buildActOn(v) && v._mapBeds !== undefined;   // ★[T958] 집 행위 마을 · 지은 침상을 아는 판만(끔 · 그 밖 = 종전)
  if (_t958) v._t958Want = 0;
  const _t1054 = _t958 && T1054_DECAY_WOOD;   // ★[T1054] 닳은 몫 = 어제까지 못 고친 몫 + 오늘 노후분 · 침상과 주거의 틈을 넘지 않는다
  if (_t1054) v._t1054Wear = Math.min((v._t1054Wear || 0) + _h0 * HOUSE_DECAY, Math.max(0, v._mapBeds - v.housing));
  //   ★[T966] 켬이면 econ 이 **계획 주거**도 한 칸에 따로 쥔다(`v._t958Plan`) — 끔 세계의 주거 그 궤적이다(같은 노후 · 같은 `houseDayBuild` · 목재 상한 `Infinity` 그대로 — 새 수 0).
  //     econ 주거(`housing`)는 지은 침상까지만 오르니, 주거를 "앞으로 지을 집"으로 읽던 두 자리 — 나무꾼 안전망(아래 `pickJob` 줄) · 영토 목표(`villages.js` `territoryTarget`) — 는
  //     이 칸을 읽는다(보고 T966 ② — 지은 침상을 읽으면 그 둘이 계획과 다른 세계를 만든다).
  if (_t958) { const _p = (v._t958Plan !== undefined ? v._t958Plan : v.housing / (1 - HOUSE_DECAY)) * (1 - HOUSE_DECAY); v._t958Plan = _p + houseDayBuild({ housing: _p }, _homeN, totalFoodEquivalent(v)); }
  if (v.housing < houseTarget) {
    // ★노동기반 건설: "시간 남는 NPC가 집을 짓는다" — 여유노동이 건설속도를 결정.
    //   식량안보(곳간 여유)일수록 잉여노동 많아 건설 빠름. 쪼들리면 정체(노동을 식량에 다 씀).
    const _fe = totalFoodEquivalent(v);
    // ★[T400] 자재 단가 — 끔이면 종전 상수 그대로(`_HW === HOUSE_WOOD` · 같은 연산 · 비트 동일), 켬이면 `hut-stages.js` 표에서 유도.
    const _HW = T400_BUILD_ACT ? houseCostPerCap('wood') : HOUSE_WOOD;
    const _HS = T400_BUILD_ACT ? houseCostPerCap('stone') : HOUSE_STONE;
    const _live = buildActOn(v);   // ★[T400] 크루가 곳간에서 실제로 꺼내 가는 마을 — 목재 제약·차감은 그 행위가 진다
    let built = Math.min(houseDayBuild(v, _homeN, _fe), _live ? Infinity : (v.storage.wood || 0) / _HW);   // 목재 필수 + 여유노동 제약(★[T488] 여유노동 몫은 `houseDayBuild` 한 함수 — 숯가마의 집 몫이 같은 함수를 부른다 · min 은 묶는 순서와 무관 = 비트 동일)
    if (_t958) { v._t958Want = built; built = Math.min(built, Math.max(0, v._mapBeds - v.housing)); }   // ★[T958] 올리고 싶은 몫은 적고(방아쇠) · 오르는 몫은 지은 침상까지
    //   ★[T1054] 틈 = 새 침상(목재 없이 — 크루가 냈다) + 닳은 몫(수리 — 곳간 목재가 있는 만큼). 오늘 오르는 몫은 새 침상을 먼저 채운다.
    const _t1054Free = _t1054 ? Math.max(0, Math.max(0, v._mapBeds - v.housing) - v._t1054Wear) : 0;
    if (_t1054) built = Math.min(built, _t1054Free + (v.storage.wood || 0) / _HW);
    if (built > 0) {
      // ★석재 준-필수: 석재 충분하면 정상 건축, 없으면 30%만(주춧돌·구들 없는 임시 가옥). 강한 석재 수요 → 광산 교역 유발.
      const stoneNeed = built * _HS;
      const stoneFrac = stoneNeed > 0 ? Math.min(1, (v.storage.stone || 0) / stoneNeed) : 1;
      built *= 0.3 + 0.7 * stoneFrac;   // 석재 0 → 30% 속도, 충분 → 100%
      // ★[T300] 하루 건축 상한 — **이 한 자리**다(기본 끔 · 값은 손잡이가 바깥에서 준다 · 위 `buildCapOf`).
      //   석재 배수 뒤에 거는 이유: 끔 팔이 실측한 "하루 지은 양"과 **같은 축**이어야 값이 그 값이다.
      { const _cap = buildCapOf(v); if (_cap !== null && built > _cap) built = _cap; }
      if (!_live) {
        v.storage.wood -= built * _HW;
        _cons(v, 'wood', built * _HW);   // ★flow-EMA(주거 목재)
      }
      if (_t1054) {   // ★[T1054] 수리 몫(새 침상을 넘어 오른 몫) — 곳간 목재를 econ 단가로 뺀다 · 닳은 몫이 그만큼 준다
        const _rep = Math.max(0, built - _t1054Free);
        if (_rep > 0) { v.storage.wood = Math.max(0, (v.storage.wood || 0) - _rep * _HW); _cons(v, 'wood', _rep * _HW); v._t1054Wear = Math.max(0, v._t1054Wear - _rep); }
      }
      // ★유령 박멸(§9): 자갈 기초 — 기초·구들 채움(석재 수요의 ≤절반)은 채집 자갈이 하급 대체(PEBBLE_STONE_EQ). 석재 실절약.
      const _needS = built * _HS;
      const _pebUse = Math.min(v.storage.pebble || 0, (_needS * 0.5) / PEBBLE_STONE_EQ);
      if (_pebUse > 0) v.storage.pebble -= _pebUse;   // ★flow-EMA 제외: 자갈 기초도 석재의 가용성 대체 소비(잔가지 동형)
      const _stUse = Math.min(v.storage.stone || 0, Math.max(0, _needS - _pebUse * PEBBLE_STONE_EQ));
      v.storage.stone = Math.max(0, (v.storage.stone || 0) - Math.max(0, _needS - _pebUse * PEBBLE_STONE_EQ));   // 실제 건축분만큼 석재 소비(자갈 대체분 차감)
      _cons(v, 'stone', _stUse);   // ★flow-EMA(주거 석재)
      v.housing += built;
    }
  }
  if (T452_KILN_ACT) kilnDay(v);   // ★[T452] 숯가마 하루(켬만 · 끔 = 한 줄도 안 돈다)
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
  const _woodCapRaw = ((T1149.k ? (v.counts || {}) : jobCapacity(v)).lumberjack || 0) * 0.9 * (v.land.wood || 0);  // 벌목 자리 만충 시 목재 흐름(채굴 능력) · ★[T1149 ⓐ] 켬 = 지금 나무꾼
  const _woodProdCap = v.land.woodSustain != null ? Math.min(_woodCapRaw, v.land.woodSustain) : _woodCapRaw;   // ★MSY: 랩 실측 숲 재생 흐름이 상한 — 스톡 마이닝(감가 자산)을 소득으로 계산하지 않음. 초과 채굴은 가능하되 K는 지속가능선만 믿음
  const woodCapFlow = _woodProdCap
                    + (T1276_FARM_K ? t1276FieldFlow(v) : (dailyProductionPotential.food || 0)) * STRAW_FUEL_PER_FOOD    // + 볏짚(곡물 잠재생산 부산물 — 농업촌 연료 자급분) · ★[T1276] 켬 = 밭 흐름(밭 세계의 곡식은 `food` 가 아니라 작물 품목이다)
                    + (v._woodImportEMA || 0) + (v.storage.wood || 0) / (T1149.k ? t1149LeanDays(day) : 90);   // + 수입EMA + 재고 한 계절 완충 · ★[T1149 ⓐ] 켬 = 다음 봄까지 남은 날
  const fuelNeedPC = _homeN > 0 ? Math.max(_firewoodPC(), fuelNeed / _homeN) : _firewoodPC();
  // ★신뢰 관성(EMA ~50일): 숲 고갈로 용량이 줄 때 K가 절벽 낙하(θ=4 로지스틱 −20%/일 학살)하지 않게 —
  //   주민의 부양력 인식은 서서히 갱신(고증: 숲이 줄어드는 걸 몇 계절에 걸쳐 체감). 하락도 상승도 완만.
  const _fuelKraw = woodCapFlow / fuelNeedPC;
  v._fuelKema = v._fuelKema === undefined ? _fuelKraw : 0.98 * v._fuelKema + 0.02 * _fuelKraw;
  const fuelK = v._fuelKema;
  v._kDbg = { slot: +slotK.toFixed(1), prod: +prodK.toFixed(1), fuel: +fuelK.toFixed(1) };   // ★K 분해 노출: "이 마을은 뭐에 막혔나"(경작지·식량흐름·연료) — 진단·UI 근거
  if (T931_SLOTK_EMA || T931_SLOTK_SEASON) v._kDbg.slotRaw = +_slotKraw.toFixed(1);   // ★[T931] 켬만 — 관성 앞 그날 자리(진단 · `slot` 은 K 에 든 값)
  const Kraw = Math.min(slotK, prodK, fuelK);   // ★자연 리비히 min: 식량 자리·식량 흐름·연료 흐름. (옛 K_MAX=110 임의 천장 폐지 — 수준은 지형+MB/MC 확장이 결정)
  const K = Math.max(POP_MIN, Kraw);

  // 5) 인구 θ-로지스틱 갱신 — dP = r·N·(1−(N/K)^θ). θ>1: K의 ~80%까지 빠르고 이후 급감(S곡선의 상단을 압축)
  const ratio = _homeN / Math.max(1, K);
  let _logiTerm = POP_GROWTH_RATE * _homeN * (1 - Math.pow(ratio, LOGISTIC_THETA));
  // ★[T1074 ⑤] 켬 = 굶어 죽는 길 하나 — K 의 식량 흐름 몫(prodK)이 K 를 정해 _homeN 을 넘긴 날, 그 넘김 몫(로지스틱 음수)은 굶주림이다 →
  //   식량 빚이 사람마다 치른다(아래 기아 사망 고리로 따로 죽이지 않는다). 출생 쪽(양수)은 그대로 prodK 가 막는다.
  //   음수는 식량 밖 K(자리 slotK · 땔감 fuelK)를 넘긴 몫만 남는다 — 그건 식량이 아니라 자리 · 연료의 일이다.
  if (T1074_FOOD_DEBT && _logiTerm < 0) {
    const _Knf = Math.max(POP_MIN, Math.min(slotK, fuelK));
    _logiTerm = Math.min(0, POP_GROWTH_RATE * _homeN * (1 - Math.pow(_homeN / Math.max(1, _Knf), LOGISTIC_THETA)));
  }
  let dP = _logiTerm;
  if (T1206_NAT_DEATH) { const _ne = t1206Expected(v); dP += _ne; v._natExp = _ne; }   // ★[T1206 ②] 출생 다시 맞춤 — 그날 기대 자연사만큼(같은 생명표 · K 의 평형은 그대로)
  // 굶주림: 흐름 음수 + 창고 식량_equiv 부족
  let _hungerTerm = 0;
  if (!T1074_FOOD_DEBT) {   // ★[T1074 ⑤] 켬 = 옛 굶주림 두 줄을 걷는다(죽음은 사람마다 빚이 정한다)
  if (v.surplusEMA.food < 0 && totalFoodEquivalent(v) < _homeN * 3) _hungerTerm -= 0.3 * Math.abs(v.surplusEMA.food);
  // 굶주림 직격: foodGap이 있으면 그만큼 인구 추가 압박
  if (foodGap > 0) _hungerTerm -= 0.5 * foodGap;
  }
  dP += _hungerTerm;
  // Phase 5-5-econ-d: 마을 stat 기반 인구·이주 보정
  const stats = _computeVillageStats(v, _homeN);
  let _healthTerm = 0, _happyTerm = 0, _prestigeTerm = 0, _t1075Emig = 0;
  if (stats && T1134_HAPPY_TARGET) {   // ★[T1134] 목표 행복 — 좋은 것(그날 합) · 인구 · 겪은 일 → 목표 · 실제 h 는 목표로
    const _fd = T1074_FOOD_DEBT ? foodDebtOf(v) : null;
    const _hsh = _fd ? (_fd.n > 0 ? _fd.starving / _fd.n : 0) : (_hungerTerm < 0 ? 1 : 0);   // 오늘 굶는 몫(빚 판 = 굶는 사람 ÷ 인구 · 종전 판 = 마을 굶주림 날이면 1)
    if (T1205_HAPPY) {   // ★[T1205] 좋은 것 + 사치품 · 천천히 − 그날 바로
      const _P = t1205Par(), _lux = _P.luxW * Math.min(T1205_LUX_MAX, Math.max(0, stats.prestige || 0));
      const _G = stats.happiness + _lux, _T = t1205Terr(v);
      const _r = t1205Step(v, _G, _homeN, _T, _hsh);
      stats.happinessGoods = _G; stats.happinessLux = _lux; stats.happinessEq = _r.target; stats.happinessSlow = _r.slow; stats.happinessBurden = _r.burden; stats.terrCells = _T; stats.happiness = _r.h;
    } else {
    const _r = t1134Step(v, stats.happiness, _homeN, _hsh);
    stats.happinessGoods = stats.happiness; stats.happinessEq = _r.target; stats.happiness = _r.h;
    }
  } else if (stats && T1075_HAPPY_EQ) {   // ★[T1075 ①②] 그날 값 = 평형 H* · 실제 H 는 마을 칸이 기억한다(소비자 — 일 배수 · 도적 층 — 는 H 를 읽는다)
    const _fd = T1074_FOOD_DEBT ? foodDebtOf(v) : null;
    const _hs = stats.happiness * (_fd ? (1 - Math.min(1, _fd.mean / t1197DieDays())) : 1);   // ★[T1197] 켬 = 죽음 날 수(몸 정본 유도) · 끔 = 14
    v._H = v._H == null ? _hs : _hs + (v._H - _hs) * Equilibrium.keep(HAPPY_EQ_HALF_DAYS);
    stats.happinessEq = _hs; stats.happiness = v._H;
  }
  if (stats) {
    // happiness: 0.5 기준. >0.5 보너스, <0.5 페널티 (불행 → 이주·자살 등)
    _happyTerm = (stats.happiness - 0.5) * 0.6 * _homeN * POP_GROWTH_RATE;
    // health: 0.5 기준 (질병·약초 부족)
    _healthTerm = (stats.health - 0.5) * 0.4 * _homeN * POP_GROWTH_RATE;
    // ★위신재(사치)→인구 보너스 — prestige는 순보너스(0 기준, 있으면 +). 사치 수입을 정당화 = 진짜 수요 근거.
    _prestigeTerm = Math.min(PRESTIGE_MOD_CAP, (stats.prestige || 0) * PRESTIGE_GROWTH_W) * _homeN * POP_GROWTH_RATE;
    if ((T1075_HAPPY_EQ || T1134_HAPPY_TARGET) && _happyTerm < 0) {   // ★[T1075 ④] 불행은 죽이지 않는다 — 출생을 먼저 깎고 남는 몫은 이탈 압력
      const _oth = dP + _healthTerm + _prestigeTerm, _aft = _oth + _happyTerm;
      dP = _oth > 0 ? Math.max(0, _aft) : _oth;
      _t1075Emig = _oth > 0 ? Math.max(0, -_aft) : -_happyTerm;
      if (T1134_HAPPY_TARGET && !(stats.happiness < T1134_EMIG_H)) _t1075Emig = 0;   // ★[T1134] 이탈은 h < 0.25 일 때만(그 위는 출생만 깎인다)
      if (T1205_HAPPY) _t1075Emig = _homeN * t1205Par().k2 * Math.max(0, T1134_EMIG_H - stats.happiness);   // ★[T1205] 떠나기 = 인구 × k₂ × (0.25 − h)(연속 · 출생 깎고 남은 몫과 무관)
    } else dP += _happyTerm + _healthTerm + _prestigeTerm;
    v.lastStats = stats;
  }
  // ★주거 성장 게이트: 집이 부족하면(_homeN≥주거) 인구가 더 못 늚. 감소는 식량(famine)만 — 집 부족으론 안 죽음.
  const _hcap = Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity);   // ★완공 계약: 맵 완공 침대(_mapBeds)가 상한(3사본 동기화)
  const _gated = (dP > 0 && _hcap !== Infinity && _homeN >= _hcap);
  if (_gated) dP = 0;
  // ★[T1149 ⓑ] 출생에 곳간 문 — 곳간이 다가오는 겨울을 한 사람 더 먹일 만큼일 때만(위 `T1149` 주석) · 막힌 날 표지 `_t1149Gate`(표 기계가 센다)
  if (T1149.birth) { v._t1149Gate = 0; if (dP > 0 && totalFoodEquivalent(v) < (_homeN + 1) * DAILY_FOOD_CONSUMPTION * t1149WinterDays(day)) { dP = 0; v._t1149Gate = 1; } }
  v._dpDebug = { K: +K.toFixed(1), logi: +_logiTerm.toFixed(3), hunger: +_hungerTerm.toFixed(3), health: +_healthTerm.toFixed(3), happy: +_happyTerm.toFixed(3), prestige: +_prestigeTerm.toFixed(3), housing: (v.housing !== undefined ? +(+v.housing).toFixed(1) : null), gated: _gated, dP: +dP.toFixed(3) };
  // ΔP 상한
  const maxDelta = _homeN * POP_MAX_DELTA_PCT;
  dP = Math.max(-maxDelta, Math.min(maxDelta, dP));

  // 6) 인구 적용 — 정수 단위. 분수는 누적해서 처리.
  v._dPAccum = (v._dPAccum || 0) + dP;
  // ★[T1198 ①②] 켬 = 출생 누적은 아이를 가질 수 있는 집 수를 넘지 않는다(한 집 하루 한 아이) · 끔 = null = 종전 줄
  const _t98 = (T1198_BIRTH_BODY && _t1197()) ? _t1198Houses(v, _hcap, day) : null;
  let _t98k = 0;
  if (_t98 && v._dPAccum > _t98.length) v._dPAccum = _t98.length;
  while (v._dPAccum >= 1 && (!T1159_HOME_N || _homeN > 0)) {
    // 인구 cap — N² 폭발 방지
    if (v.npcs.length >= POP_MAX) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    // ★완공 계약 엄수(§9 회귀 가드): 다중 출생(dP>1)이 침대(주거·_mapBeds)를 넘지 않게 — 게이트는 dP만 0으로 만들고
    //   같은 날 누적분이 침대를 1~2명 넘던 미시 구멍 봉인(건강 상승으로 dP가 커지며 표면화 — 초과 감시 0 유지).
    if (_hcap !== Infinity && _homeN + (v.npcs.length - N) >= _hcap) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    // 출생: 부족 직군으로 배정. 자리 없으면 출생 보류
    const picker = v._world && v._world.picker === 'rational' ? pickDeficitJob_rational : pickDeficitJob;
    let newJob; _t663Birth = true;   // ★[T663] 출생 배정 표지(좁은 문 판 `T652_WOOD_EARLY=2` 만 읽는다 · 끔이면 아무도 안 읽는다)
    try { newJob = picker(v, v._world); } finally { _t663Birth = false; }
    if (!newJob) {
      v._dPAccum = Math.min(v._dPAccum, 0.9);
      break;
    }
    if (_t98 && _t98k >= _t98.length) { v._dPAccum = Math.min(v._dPAccum, 0.9); break; }   // ★[T1198] 아이를 가질 집이 다 찼다
    const npc = createNPC({ job: newJob, inheritSkill: apprenticeInherit(v, newJob) });   // ★S4 명장 견습(세대 전승)
    if (_t98) { npc._pa = _t98[_t98k++].id; npc._born = day; }   // ★[T1198 ②] 그 집 짝 곁에서 선다(호스트가 부모 몸 곁에 세운다)
    v.npcs.push(npc);
    v.counts[newJob] = (v.counts[newJob] || 0) + 1;
    v._dPAccum -= 1;
  }
  // 기아 사망 — dP 음수 누적 시 가장 늙은 NPC부터 사망.
  //   시뮬 초기 365일은 보호 (자리 맞추기 + 교역 시작 시간 확보).
  //   그 후부터 진짜 기아 사망 발생.
  // ★★[2026-08-02d 계측 — 행동 무영향] 보호막이 **삼킨 압력**을 센다.
  //   `_shieldAte` = 그날 클램프가 지운 음수 누적량 · `_shieldAteTot` = 누적 · `_deathsToday` = 그날 아사자.
  //   이 셋이 있어야 "보호막이 걷히는 날 한꺼번에 터진다"가 궤적으로 증명되거나 반증된다.
  v._shieldAte = 0; v._deathsToday = 0;
  // 보호 잔여 판정 — 기본은 달력(day), SHIELD_AGE 면 **마을 나이**(day − 창설일).
  //   `_bornDay` 가 없으면(옛 DB·랩 초기 마을) 0 → 달력과 동일 = 회귀 무영향.
  //   ★[T597] 펴기는 나이에서 그 마을 몫을 뺀다(= 보호막이 그만큼 늦게 걷힌다) — 아래 보호 조건 줄은 한 글자도 안 바뀐다(`test-frontier-iron ③` 계약).
  const _shieldT = T858_NO_SHIELD ? SHIELD_DAYS : (SHIELD_AGE_ON ? (day - (v._bornDay || 0)) : day) - (T597_SHIELD_RAMP ? _t597ShieldExtra(v) : 0);   // ★[T858] 켬 = 보호가 끝난 마을(아래 조건이 거짓 — 클램프 · 감쇠 · 펴기 셋 다 안 선다)
  // ★★[2026-08-03d 배치 11 — 필멸 배선] **플레이어가 세운 마을은 보호막을 받지 않는다.**
  //   재민 확정: "플레이어 마을은 망해도 돼". 보호막은 소멸 0 원칙의 장치이고, 그 원칙은
  //   **NPC 가 자기 자리를 못 고르기 때문에** 세운 것이다. 자리를 고른 자에게 365일 무적을 주면
  //   "아무데나 세운다"의 선택에 결과가 없어진다 — 그건 자유가 아니라 무의미다.
  //   ⚠이건 조용히 적용되던 기본값을 **의도로 바꾸는** 수리이기도 하다: `_bornDay` 는 배치 5 에서
  //     라이브 DB 구멍을 메우려고 넣은 값이라, 손대지 않으면 신생 플레이어 마을이 그냥 365일 무적이 된다.
  //   ★NPC 마을(`founder == null`)의 동작은 **한 비트도 안 바뀐다** — 아래 조건이 항상 참이다.
  if (!v.founder && _shieldT < SHIELD_DAYS) {
    if (v._dPAccum < 0) {
      // (b) 감쇠: 지우지 않고 줄인다 — 남은 몫이 계속 누적돼 보호기간에도 압력이 새어나간다.
      // (현행) 클램프: −0.5 아래를 통째로 지운다 — 그래서 대가 없이 K 를 넘어 자란다.
      const _next = SHIELD_SOFT_ON ? (v._dPAccum * SHIELD_SOFT_K) : Math.max(v._dPAccum, -0.5);
      v._shieldAte = _next - v._dPAccum;             // 지워진 음수 압력(≥0)
      v._shieldAteTot = (v._shieldAteTot || 0) + v._shieldAte;
      v._dPAccum = _next;
    }
  }
  while (v._dPAccum <= -1 && v.npcs.length > POP_MIN) {
    if (!T815_DRAFT_FAMINE) { v._deathsToday++; v._deadTot = (v._deadTot || 0) + 1; }   // ★[T815] 끔 = 종전(몸을 고르기 **전에** 센다 — 전부 징발 중이면 죽은 몸 없이 셈만 는다)
    // ★[T295 ①] 원정 나간 사람은 마을 기근으로 죽지 않는다(그 사람의 죽음은 전쟁 정산이 소유한다 — 사본 0).
    let oldestIdx = -1;
    for (let i = 0; i < v.npcs.length; i++) {
      if (v.npcs[i]._warDraft) continue;
      if (oldestIdx < 0 || v.npcs[i].age > v.npcs[oldestIdx].age) oldestIdx = i;
    }
    if (oldestIdx < 0) break;   // 전부 징발 중 — ★[T845 · T815 회부 4] 징발은 자유민 1명 이상을 남긴다(war-core `_warDraftPick` — 남는 자유민 ≤ 1 이면 안 뽑는다 = 동원 상한 N−1) · 그 뒤 기근 · 이탈이 마지막 자유민을 데려가면 여기 닿는다(T815 §5) — 그래도 장부는 안 건드린다
    if (T815_DRAFT_FAMINE) { v._deathsToday++; v._deadTot = (v._deadTot || 0) + 1; }   // ★[T815] 켬 = 죽일 몸을 고른 **뒤에** 센다(몸이 죽을 때만 죽음 — 소멸·생성 금지의 장부 쪽)
    if (!T1074_FOOD_DEBT) _t1075Starved(v, v.npcs.length);   // ★[T1075 ③] 빚 판이 아니면 이 고리가 기근 길이다(빚 판에선 굶어 죽음 = 빚 죽음 · 끔 = 무동작)
    const dead = v.npcs.splice(oldestIdx, 1)[0];
    v.counts[dead.currentJob] = (v.counts[dead.currentJob] || 0) - 1;
    if (T1198_BIRTH_BODY && _t1197()) (v._t1198Gone || (v._t1198Gone = [])).push(dead.id);   // ★[T1198 ③] 그 사람의 몸이 눕는다(호스트)
    if (T1206_NAT_DEATH) t1206Bury(v, 1, v.npcs.length + 1);   // ★[T1206 ③] 부장(같은 문)
    v._dPAccum += 1;
  }
  // ★[T924] 켬 = 고리가 몸이 없어 멈춘 날(빚이 −1 아래로 남았는데 사람은 있다 = 남은 사람이 다 징발 중) 못 치른 몫을 넘기지 않는다 — 출생 줄의 `0.9` 거울(끔 = 종전 바이트)
  if (T924_DEBT_CAP && v._dPAccum <= -1 && v.npcs.length > POP_MIN) v._dPAccum = Math.max(v._dPAccum, -0.9);
  // ★★[T1074 ④] 켬 = 식량 빚 죽음 — 빚 > 14(하루치) **이고** 그날도 적자인 사람 가운데 가장 늙은 1명/일(그날 제 몫을 다 먹으면 안 죽는다).
  //   보호막(첫 365일 · NPC 마을)이 선 날은 위 고리와 같이 이 죽음도 막는다(`_fdShield` 에 센다 — ⑦ 보호막 켬 ↔ 끔 표의 자).
  // ★★[T1197 ②] 켬 = 굶어 죽음은 HP 가 0 이 된 **그 사람** — 하루 상한 없음 · 보호막 · POP_MIN · 징발 제외는 아래 T1074 줄 그대로
  if (T1197_MEAL_BODY && _t1197()) {
    for (const p of v.npcs.slice()) {
      if (!(p._mhp != null && p._mhp <= 0) || p._warDraft) continue;
      if (!(v.npcs.length > POP_MIN)) break;
      if (!v.founder && _shieldT < SHIELD_DAYS) { v._fdShield = (v._fdShield || 0) + 1; continue; }
      t1197Kill(v, p, false);
    }
  } else
  if (T1074_FOOD_DEBT && v.npcs.length > POP_MIN) {
    const _fdk = _fdDeathIdx(v);
    if (_fdk >= 0) {
      if (!v.founder && _shieldT < SHIELD_DAYS) { v._fdShield = (v._fdShield || 0) + 1; }
      else {
        _t1075Starved(v, v.npcs.length);   // ★[T1075 ③] 사망 계단(끔 = 무동작)
        const dead = v.npcs.splice(_fdk, 1)[0];
        v.counts[dead.currentJob] = (v.counts[dead.currentJob] || 0) - 1;
        if (T1206_NAT_DEATH) t1206Bury(v, 1, v.npcs.length + 1);   // ★[T1206 ③] 부장(같은 문)
        v._deathsToday++; v._deadTot = (v._deadTot || 0) + 1; v._fdDeadTot = (v._fdDeadTot || 0) + 1;
      }
    }
  }

  // ★★[T1206 ①③] 자연사(나이별 생명표 · 정해진 씨) · econ 밖 문(전쟁 · 캐러밴 · 도적)이 적어 둔 죽음의 부장 — 끔 = 무동작
  if (T1206_NAT_DEATH) {
    if (v._t1206Due > 0) { t1206Bury(v, v._t1206Due, v.npcs.length + v._t1206Due); v._t1206Due = 0; }
    t1206Day(v, day);
  }
  // ★★[T1075 ④] 이탈 — 불행 압력이 1 을 채우면 가장 젊은 자유민 1명이 몸으로 이웃 마을까지 걷는다(호스트 길 위 장부 · 하루 상한 = 인구 상한과 같은 N × POP_MAX_DELTA_PCT)
  if (T1075_HAPPY_EQ || T1134_HAPPY_TARGET) {   // ★[T1134] 같은 이탈 문(호스트가 더 행복한 이웃만 받는다)
    const _cap = N * POP_MAX_DELTA_PCT, _go = v._world && typeof v._world.t1075Emigrate === 'function' ? v._world.t1075Emigrate : null;
    //   ★[T1205] 켬 = 상한 없음 · 압력이 0 인 날 쌓인 몫은 비운다 · 그날 떠난 몸만큼 부담이 줄어 h 가 0.25 에 닿으면 멈춘다(`t1205NeedOut`)
    const _t1205Need = (T1205_HAPPY && _t1075Emig > 0 && v.lastStats) ? t1205NeedOut(v, _homeN - (N - v.npcs.length), v.lastStats.terrCells || t1205Terr(v)) : Infinity;   // 지금 집 인구(그날 앞서 죽은 몸을 뺀 수)
    if (T1205_HAPPY) { if (_go) v._emigAccum = _t1075Emig > 0 ? (v._emigAccum || 0) + _t1075Emig : 0; else if (_t1075Emig > 0) v._emigLost = (v._emigLost || 0) + _t1075Emig; }
    else if (_go) v._emigAccum = Math.min(_cap + 0.9, (v._emigAccum || 0) + Math.min(_cap, _t1075Emig));
    else if (_t1075Emig > 0) v._emigLost = (v._emigLost || 0) + _t1075Emig;   // 걸을 길 없는 판 — 아무도 안 떠난다(소멸 0)
    let _t1205Out = 0;
    while (_go && v._emigAccum >= 1 && v.npcs.length > POP_MIN && _t1205Out < _t1205Need) {
      let yi = -1;
      for (let i = 0; i < v.npcs.length; i++) { const p = v.npcs[i]; if (p._warDraft) continue; if (yi < 0 || p.age < v.npcs[yi].age) yi = i; }
      if (yi < 0) break;
      const p = v.npcs[yi];
      let took = false; try { took = !!_go(v, p, day); } catch (e) { took = false; }
      if (!took) { v._emigAccum = Math.min(v._emigAccum, 0.9); break; }
      { const at = v.npcs.indexOf(p); if (at >= 0) { v.npcs.splice(at, 1); v.counts[p.currentJob] = Math.max(0, (v.counts[p.currentJob] || 0) - 1); } }   // ★[T1109] 걷기 문(`walkToVillage`)이 이미 명부에서 뺐으면 두 번 빼지 않는다
      v._emigTot = (v._emigTot || 0) + 1;
      v._emigAccum -= 1; _t1205Out++;
    }
    if (T1205_HAPPY && _t1205Out >= _t1205Need && _t1205Need < Infinity) { v._emigAccum = Math.min(v._emigAccum || 0, 0.9); v._t1205Stop = (v._t1205Stop || 0) + 1; }   // 0.25 에 닿아 그날 멈춤(계측 칸)
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
  if (t1226On()) t1226Flex(v, day, v._world, switchInterval, multiSwitch);   // ★[T1226] 켬 = 사람마다 엇갈린 날 · 얻는 것 > 비용(아래 `t1226Flex` · 끔 = 아래 종전 줄)
  else if (day % switchInterval === 0) {
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
  if (toolPer < 1.5 && hasSlot(v, 'mason', cap, counts) && (!stoneRealOn() || (v.storage.stone || 0) >= stoneWorkStock(v))) return 'mason';   // ★S2 도구=석기 → 석공
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
      && (stoneRealOn() ? (v.storage.stone || 0) >= stoneWorkStock(v) : ((v.storage.stone || 0) >= 0.5 || (v.storage.wood || 0) > N * 0.5))) return 'mason';
  // ★★[재민 질문 "전사 켜면 왜 광부가 0이 돼?"] 에 대한 답이자 그 수리.
  //   광부는 이 picker 에서 **맨 마지막 7단계("풍부 토지 분야")에만** 있었다. 그래서
  //   앞 단계 조건이 하나라도 오래 참이면 광부는 영영 안 뽑히고, 이미 있던 광부는
  //   다른 직업 충원에 차출돼 사라진다(기회비용이 낮아 1순위로 뽑혀 나간다).
  //   실측: 전사 게이트를 열자 **25일 만에 광부 0**, 원석 재고가 156 에 얼어붙어 800일 내내 그대로였다.
  //   (석공 폭증은 500일 이후라 원인이 아니라 결과였다 — 도구·무기 결손이 누적된 것.)
  //   ⇒ 채굴에도 **파생수요**를 준다: 녹일 원석이 모자라면 캘 사람을 뽑는다.
  //     제련이 원석을 다 먹고 굶는데 광부를 안 뽑는 건 어느 모로 봐도 결함이다.
  if ((v.land.ore || 0) > 0.15 && oreTotal(v) < N * ORE_STOCK_PC
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
  const foodRich = ((T1243_FARM_ON || T1260_FOOD_READS) ? totalFoodEquivalent(v) : v.storage.food) > N * 8;   // ★[T1260 ⑤]
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
function toolDesiredStock(v) { return toolDepCount(v) * 1.15; }
function masonTarget(v) {
  const N = v.npcs.length || 1;
  const toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  const td = toolDepCount(v);
  const farmerTD = v.counts.farmer || 0;
  const otherTD = Math.max(0, td - farmerTD);
  const wearPerDay = farmerTD * DAILY_TOOL_WEAR_PER_FARMER + otherTD * DAILY_TOOL_WEAR_PER_OTHER
    + (v.npcs.length || 0) * 0.005 + toolStock * 0.0006;   // 사용마모 + subsistence(0.005/인, v2) + 재고감가
  const perMasonOut = 0.5;   // 석공 1인 일일 석기 산출(≈base 0.4×숙련) 근사
  const desired = toolDesiredStock(v);   // 목표 도구재고(커버리지 1 + 버퍼)
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
function _masonWeaponCost(v) { const p = _oppPrice(v); return ((stoneRealOn() ? (stoneRealPer('stoneSword').stone || 0) * JOBS.mason.base * WEAPON_LABOR_MULT : STONE_PER_WEAPON) * p('stone')) / WEAP_Q_STONE; }
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
// ═══ ★★[2026-08-02f ①-2] 구리 **파생 투입수요** — 부트스트랩 닫힌 고리를 연다 ══════════
//   회부_구리부존과_원석적체 ② (가). 실측된 고리는 이렇다:
//     구리를 써 본 적 없는 마을 → `_consEMA.copper = 0` → `flowT = 0` → target 0 → 가격 바닥
//     → 캐러밴이 영원히 안 싣는다 → 영원히 못 써 본다.
//   그리고 전 마을에 구리 30 을 쥐여 주면 **19/19 가 800일 내내 주조했다** — 능력·사슬·노동은
//   전혀 문제가 아니고 오직 **첫 구리가 안 온다**는 것뿐이었다.
//   ★이것은 재민이 폐기한 "기본 비축 목표"와 **다르다**. 저건 용도와 무관하게 항상 깔리는 보유
//     수요였고, 이건 **쓸 데가 실제로 있을 때만** 양수인 파생수요다(`smeltTarget` 이 원석에 쓰는 그 논리).
//   ★유령이 되지 않게 게이트를 둘 건다:
//     ① **무기 커버리지** — 무기가 이미 충분한 마을은 구리를 살 이유가 없다.
//        잣대는 v2 `CAP_TARGET.weapon`(=max(2, 전사×1.2)) 을 그대로 쓴다(사본 금지 원칙).
//     ② **주조 채산** — 순동 주조 1일의 이윤이 양수여야. `_alloyMelt` 의 목적함수와 같은 식이다.
//        ⚠판정은 **기준가**로 한다. 시장가로 보면 수요가 값을 올리고 그 값이 게이트를 닫아
//        수요가 사라지는 자기 꼬리 물기가 생긴다(`smeltTarget` 주석의 그 실측 그대로).
//   ★크기는 **대장장이 한 명의 한 달치**(_MELT_TOTAL × 30 = 4.5)다. 비축이 아니라 조업 재고다.
//   ★기본 OFF. 채택 조건(배치 지시): 합금 등급 평균이 1.0 아래로 안 내려갈 것 + 기준선 2줄 유지.
const COPPER_DERIV_ON = (typeof process !== 'undefined' && process.env && process.env.COPPER_DERIV === '1');
const COPPER_DERIV_DAYS = (typeof process !== 'undefined' && process.env && process.env.COPPER_DERIV_DAYS != null)
  ? Number(process.env.COPPER_DERIV_DAYS) : 30;
function derivedInputTarget(v, r) {
  // 재료가 없어 작업을 못 해도 도구 결손의 실제 레시피 투입은 수요다(숯 파생수요와 같은 문).
  if (r === 'stone' && stoneRealOn() && v && v.storage) {
    if (!(v.npcs && v.npcs.length)) return 0;
    const tools = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
    const deficit = Math.max(0, toolDesiredStock(v) - tools);
    return deficit * (stoneRealPer('tool').stone || 0) + ((v.counts && v.counts.mason) || 0) * stoneWorkStock(v);
  }

  if (stoneRealOn() && v && v.storage && v.npcs && v.npcs.length) {
    const cost = (stoneRealPer('crude') || {})[r] || 0;
    if (cost > 0) {
      const tools = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
      return Math.max(0, toolDepCount(v) * SELF_TOOL_COV - tools) * cost;
    }
  }
  // ★★[T1207 ⑤ 2026-11-07] **영토 말뚝도 파생수요다** — 재료가 없어 그날 못 넓힌 셀의 말뚝 통나무(서버 생활층 `_t1207Batch` 가 `_t1207Need` 에 적는다)는
  //   실제 레시피 투입이다(위 석기 · 아래 숯과 같은 문 — "재료가 없어 작업을 못 해도 실제 레시피 투입은 수요다").
  //   통나무는 생존 재화라 흐름 목표(flowT)가 막혀 있다(v2 `subsGuard`) — 값이 영토 수요를 보는 문은 이것 하나다 ⇒ 값(그림자 가격) → 직업 고르기
  //   (`pickDeficitJob_rational` 의 나무꾼 한계가치 `w('wood')`)가 그만큼 더 본다. 합치는 법은 v2 그대로(max · 배수 0).
  //   칸이 없으면(끔 · 랩 · CLI) 0 — 종전 비트.
  //   ⚠T1207 서버 판(11-04c 3시드 × 800날): 마을 모자람(평균 ~20)이 생존 몫(1인 0.05 × 30날 × 인구)을 거의 못 넘어 값이 안 움직였다 — 합치는 법(max ↔ 더하기)은 회부(보고/T1207 §6-2).
  if (r === 'wood') return (!T1213_ON && v && v._t1207Need > 0) ? v._t1207Need : 0;   // ★[T1213] 켬이면 말뚝은 더하는 항(`buildInputTarget`)에 — 여기선 0(두 번 세지 않는다)
  // ★★[T463 2026-09-27] **숯도 파생수요다** — 노가 있는 마을(캐는 마을이거나 녹일 원석이 있는 마을 · `_trySmelt` 의 그 문)은
  //   숯을 **쓸 데가 실제로 있다**. 그런데 T443 연료는 곳간에 숯이 있을 때만 `_cons(charcoal)` 를 적는다 — 숯이 없는 광산 마을은
  //   노천 탄화(통나무)로 때우니 숯 흐름(flowT)이 **0** 이고, 값이 바닥(0.02)이라 캐러밴이 숯을 안 싣는다(보고 §ⓐ: 800일 숯 leg 1건).
  //   ⇒ 목표 = 숯가마가 굽는 그 목표(`furnaceCharcoalTarget` · 원석 비축 × 숯 2) · 모자람(목표 − 곳간)은 있는 가격 기계가 값으로 만든다.
  //   ★뜻은 T443 연료 **와** T452 숯가마가 둘 다 켜졌을 때만 있다 — 하나라도 끄면 0(손잡이 0 · 끔 = 종전 비트).
  if (r === 'charcoal') {
    if (!v || !v.storage || !smeltFuelOn() || !kilnActOn() || !oreMixOf(v)) return 0;
    if (!(((v.counts && v.counts.miner) || 0) > 0 || oreTotal(v) >= SMELT_MIN_ORE)) return 0;
    return furnaceCharcoalTarget(v);
  }
  if (!COPPER_DERIV_ON || r !== 'copper' || !v || !v.storage) return 0;
  if (_ERA_METAL('copper') && !_eraKnows('copper')) return 0;   // 시대가 모르는 금속은 파생수요도 없다
  // ★★[1차 실측으로 뒤집은 게이트] 처음엔 "무기 커버리지(v2 CAP_TARGET.weapon)가 미달일 때만"으로 짰다.
  //   3시드 800일 결과가 **기준선과 비트 동일**했다 — 한 번도 안 걸린 것이다. 이유는 명확하다:
  //   마을은 무기가 **모자라지 않는다**(19마을 2,017자루). 모자란 건 **좋은** 무기다. 커버리지는
  //   마제석검과 청동검을 **같은 1자루로 센다** — 그 잣대로는 구리의 한계가치가 영원히 안 보인다.
  //   ⇒ 게이트를 **품질**로 바꾼다: 이 마을이 지금 만드는 무기보다 구리검이 나은가.
  //     (배치 6 ②가 "무기는 수량이 아니라 품질보정 총량으로 판정한다"고 정한 것과 같은 결이다.)
  const cnt = v.counts || {};
  // 게이트① **무기를 만드는 마을인가** — 석공이든 대장장이든 무기 노동이 실재해야 한다.
  //   (구리가 없어도 참인 신호라 부트스트랩 고리에 걸리지 않는다 — 순환 없음)
  if (!((cnt.mason || 0) > 0 || (cnt.smith || 0) > 0)) return 0;
  // ★★[2차 실측으로 다시 뒤집은 부분] "순동검이 석검보다 나은가"로 짰더니 **영원히 거짓**이었다:
  //   순동 등급 0.466 < 마제석검 0.5. 모델이 옳다 — 순동은 무르고 잘 벼린 간돌검이 더 낫다.
  //   ⇒ **첫 구리 한 덩이는 정말로 살 값어치가 없다**. 구리가 값을 하는 건 **합칠 것이 있을 때**다.
  //     그래서 판정은 "순동"이 아니라 **이 마을이 지금 가진 다른 금속으로 짤 수 있는 최선의 배합**으로 한다.
  //     주석 산지인데 구리가 없어 주조를 못 하던 마을(회부 ②의 어촌1 유형)이 정확히 여기서 열린다.
  //   ★탐색은 `_meltSearch` 공용 헬퍼 — 주조 결정과 **같은 목적함수**다(사본 금지).
  //     가격만 **기준가**로 준다: 시장가를 쓰면 수요가 값을 올리고 그 값이 게이트를 닫는다(자기 꼬리 물기).
  const stHypo = Object.assign({}, v.storage);
  stHypo.copper = Math.max(stHypo.copper || 0, _MELT_TOTAL);   // "구리가 있다면" — 딱 1회 주조분만 가정
  const basePrice = (r) => (BASE_VALUE[r] > 0 ? BASE_VALUE[r] : 1);
  const best = _meltSearch(stHypo, basePrice);
  if (!best) return 0;
  // 게이트② **품질이 나아지는가** — 이 마을 무기 스톡 품질(_weapQ EMA)보다 나아야 산다.
  const qNew = Math.min(1.2, best.grade) * WEAP_Q_BRONZE;
  const qNow = v._weapQ != null ? v._weapQ : WEAP_Q_STONE;
  if (!(qNew > qNow)) return 0;
  // 게이트③ **채산** — 그 배합 하루의 이윤이 양수여야(재료비는 구리를 포함한 전액).
  const amtPerCast = (JOBS.smith.base || 0.45) * WEAPON_LABOR_MULT;
  let cost = 0; for (const k in best.take) cost += best.take[k] * basePrice(k);
  const gain = amtPerCast * best.castF * (BASE_VALUE.weapon || 1) * Math.min(1.2, best.grade);
  if (!(gain - cost > 0)) return 0;
  return (best.take.copper || _MELT_TOTAL) * COPPER_DERIV_DAYS;
}
function smeltTarget(v) {
  if (_t1249NoSmelt(v)) { migrateOre(v); return 0; }   // ★[T1249] 켬 = 조성 모르는 마을은 안 녹인다(위 머리 주석)
  if(T1188_ORE_SPLIT){migrateOre(v);const a=_typedSmeltCandidates(v),have=a.reduce((n,x)=>n+x.qty,0);if(have<SMELT_MIN_ORE)return 0;
    const value=a.reduce((n,x)=>n+x.qty*(BASE_VALUE[x.id]||1),0)/have;if(!(SMELT_YIELD*value-(BASE_VALUE.ore||1)>0))return 0;
    const per=0.45*SMELT_PER_LABOR,need=Math.max(1,Math.round(have/(per*30)));return Math.min(Math.max(1,Math.ceil((v.npcs.length||1)*SMELT_LABOR_CAP_PC)),need);
  }

  const mix = oreMixOf(v);   // ★유효 조성 — 수입 원석도 녹일 수 있다(2026-08-02b)
  if (!mix) return 0;
  const ore = oreTotal(v);
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
  if (T1279_COOK) return 0;   // ★[T1279 ②] 켬 = 정원 요리사 0(온 하루 일손 한 자리 ≠ 부엌 일 시간 · 위 손잡이 주석) · 끔 = 아래 종전 글자
  const N = v.npcs.length || 1;
  if (totalFoodEquivalent(v) < N * 35 || t1260FoodOf(v) < N * 8) return 0;   // 식량 안보 게이트 · ★[T1260 ①] 켬 = 둘째 문도 합계(끔 = `food` 칸 · 종전 글자)
  const dp = v.dailyProductionBuf || {};
  let sideFlow = 0, sideStock = 0;
  for (const r of COOK_SIDE_INGREDIENTS) { sideFlow += dp[r] || 0; sideStock += v.storage[r] || 0; }
  if (sideStock < N * 1.5) return 0;   // 곳간에 부재료 없으면 안 섬
  return Math.min(Math.floor(sideFlow / 3), Math.floor(N * 0.06));   // 부재료 흐름이 정원(1인 ~2.5/일 소비) · 6% 안전 클램프(최후 보루)
}

// ═══ ★★★[T164 2026-09-10] 실현 배분 — **정본 함수 둘** (랩·서버 공용 · 사본 0) ═══════════
//
// 손잡이 하나로 랩(브라우저)과 서버(node)가 같은 코드를 탄다:
//   서버 `L_ALLOC_REAL=1 node …`  ·  랩 `window.L_ALLOC_REAL = 1`(lifeInit 전)
// **기본은 0(꺼짐)** — 손잡이가 없으면 이 파일은 종전 비트 그대로다.
// 창 배수 `L_ALLOC_WIN`(기본 1 · 0 이면 평활 없음 = 매일 요동 · 돌연변이 시험용).
function _allocKnob(name) {
  const g = (typeof window !== 'undefined') ? window : null;
  if (g && g[name] !== undefined && g[name] !== null) return String(g[name]);
  if (typeof process !== 'undefined' && process.env && process.env[name] !== undefined) return String(process.env[name]);
  return null;
}
// ★★★[T244 2026-09-13 · 재민 확정 — #13 ① 켜기] **기본 켬.** 미설정이면 2판(실현 배분)으로 돈다.
//   되돌림은 **명시 `0`**(`L_ALLOC_REAL=0`) — 그때 이 파일은 셋째 판과 **비트 동일**이다(보고/T244 §2).
//   값은 T184 표의 그 값(주산물 항 · 새 수 0) · 1판 되돌림은 `L_ALLOC_BASKET=1` 그대로.
function allocRealOn() { const x = _allocKnob('L_ALLOC_REAL'); return x === null ? true : x !== '0'; }
// ★[T263 2026-09-13 · ★T362] 식사를 흐름-EMA 에 실을지 — **기본 끔**. 끔이 곧 2026-07-12 판정(수출 억압 회피)이고 비트 동일이다.
//   ⚠이름은 **T263 이 지은 그것 그대로**다(새 손잡이 0). 카드 T362 머리의 "T258 손잡이"는 `T258_SIDE_CONS`(부재료)이고
//     그것은 이 줄이 아니며 main 에 있지도 않다 — 보고/T362 §0-ⓐ 에 그 읽기를 적었다.
// ★[T652 2026-10-05] 나무꾼 이른 배정 — **기본 끔**(미설정·`0` = 종전 비트). 서버 `T652_WOOD_EARLY=1` · 랩 `window.T652_WOOD_EARLY = 1`.
function woodEarlyOn() { const x = _allocKnob('T652_WOOD_EARLY'); return x !== null && x !== '0'; }
//   ★[T663 2026-10-08] 좁은 문 판 — `T652_WOOD_EARLY=2` 면 남은 날을 **출생 배정**(tickVillage 출생 줄)에서만 읽는다(전환 배정은 종전 그대로).
//     T652 계측: 새 나무꾼은 주로 출생 배정에서 나오고(보류 없음), 전환 배정은 7일 1명이다. 값 하나 · 새 수 0. 끔(미설정·0)은 비트 동일.
function woodEarlyMode() { const x = _allocKnob('T652_WOOD_EARLY'); return x === null || x === '0' ? 0 : (x === '2' ? 2 : 1); }
let _t663Birth = false;   // 출생 배정 중인가(출생 줄이 피커를 부르는 동안만 참 — 읽는 곳은 위 좁은 문 하나)
// ★[T717 ③ 2026-10-13] 기근 문 안의 땔감 한 명 — **기본 끔**(미설정·`0` = 종전 비트). 서버 `T717_FUEL_GATE=1` · 랩 `window.T717_FUEL_GATE = 1`.
//   문은 `pickDeficitJob_rational` 기근 블록 안 한 줄이다(그 자리 주석).
function fuelGateOn() { const x = _allocKnob('T717_FUEL_GATE'); return x !== null && x !== '0'; }
function foodConsOn() { const x = _allocKnob('T263_FOOD_CONS'); return x !== null && x !== '0'; }
function allocRealWin() { const x = _allocKnob('L_ALLOC_WIN'); const n = (x === null) ? 1 : parseFloat(x); return Number.isFinite(n) ? n : 1; }
// ★[T184] 되돌림 — `L_ALLOC_BASKET=1` 이면 1판(바구니 전체 소득)으로 돌아간다. 기본은 2판(주산물 항).
function allocBasketMode() { const x = _allocKnob('L_ALLOC_BASKET'); return x !== null && x !== '0'; }
// ★[T189] 폴백 축 맞춤 — `L_ALLOC_FB=1` 이면 **실현이 없는 직업**의 폴백 값에 그 호출의 **축 배율**
//   (같은 호출에서 실제로 다시 쓰인 직업들의 실현÷종전 **중앙값**)을 곱한다. 기본 꺼짐.
//   새 수 0 — 배율은 그 호출 안에서 계산된 값들의 중앙값이고, 바깥에서 아무 상수도 안 가져온다.
function allocFbMode() { const x = _allocKnob('L_ALLOC_FB'); return x !== null && x !== '0'; }

// ★★★[T300 2026-09-19 · 주거 처방 — PM #28 "꼴 = 캡 · 값 = 마을별 최대"] **하루 건축 상한.**
//
// 왜 이 자리인가 — T264 가 목재 재고를 읽는 넷(`built` · picker `:3298` · 주거 방아쇠 `:3770` · `fuelK`)을
// 하나씩 고정해 가른 결과, **넷 중 `built` 하나만** 죽음을 만든다(소멸 1·1·2 → 0·2·0 · 지켜본 넷이 넷 다 산다).
// T275 가 꼴 셋(절대 캡 · `slack` 재정의 · 재고 완화)을 재서 **캡만이 지금 세계에 소멸을 안 보탠다**를 잡았고,
// 값은 하나의 중앙값이 아니라 **마을별**이어야 한다는 것도 갈랐다(켠 세계 소멸 4→2 · 인구 +1.8~+4.9%).
//
// ⚠**엔진 안에 캡 상수를 두지 않는다 — 새 수 0.**
//   T300 이 실측으로 확인한 것: "마을별 최대"는 **상태식으로 안 나온다**(끔 팔 실측 최대 대
//   `N_peak × HOUSE_BUILD_MAX` 의 비가 0.28~0.93 · ±15% 안에 드는 마을이 51곳 중 2~4곳).
//   그 값은 그 마을이 **그 세계에서 실제로 지은 역사**지 땅·인구의 함수가 아니다.
//   ⇒ 값은 손잡이가 **바깥에서** 받는다(`_allocKnob` 문법 그대로 · 랩 `window` · 서버 `env`):
//       `T300_BUILD_CAP=4.4`                  → 절대 캡(마을 무관 · T275 ⓐ 꼴)
//       `T300_BUILD_CAP=농촌1:2.1,임업2:14.27` → **마을별** 캡(T264 꼴 · PM 이 고른 꼴)
//       `T300_BUILD_CAP=@/경로/caps.json`      → 같은 표를 파일로(`{"마을이름": 수}`)
//     이름이 표에 없는 마을은 **상한 없음**(종전 그대로) — 약한 마을을 덤으로 조이지 않는다.
//   ⚠**미설정이면 끔** — 이 파일은 넷째 판과 **비트 동일**이다(`buildCapOf` 가 항상 null 을 돌려준다).
let _t300Caps;   // null = 끔 · number = 절대 캡 · Map = 마을별
function _t300Parse() {
  const x = _allocKnob('T300_BUILD_CAP');
  if (x === null || x === '' || x === '0') return null;
  if (x[0] === '@') {
    try {
      const j = JSON.parse(require('fs').readFileSync(x.slice(1), 'utf8'));
      const m = new Map(); for (const k in j) { const n = +j[k]; if (Number.isFinite(n) && n >= 0) m.set(k, n); }
      return m.size ? m : null;
    } catch (e) { return null; }
  }
  if (x.indexOf(':') < 0) { const n = parseFloat(x); return Number.isFinite(n) && n >= 0 ? n : null; }
  const m = new Map();
  for (const pair of x.split(',')) {
    const i = pair.lastIndexOf(':'); if (i < 0) continue;
    const n = parseFloat(pair.slice(i + 1)); if (!Number.isFinite(n) || n < 0) continue;
    m.set(pair.slice(0, i).trim(), n);
  }
  return m.size ? m : null;
}
// 그 마을의 하루 건축 상한 — 끔이거나 표에 없으면 `null`(상한 없음).
function buildCapOf(v) {
  if (_t300Caps === undefined) _t300Caps = _t300Parse();
  if (_t300Caps === null) return null;
  if (typeof _t300Caps === 'number') return _t300Caps;
  const c = _t300Caps.get(v && v.name);
  return c === undefined ? null : c;
}

// ★★★[T184 2026-09-12 · 2판] 직업의 **주산물 항** — 종전식이 보던 그 품목과 그 값식 그대로.
//
// 1판(T161·T164)은 바구니를 `JOBS[j].output` + `byproduct` 전부로 잡고 소득을 합산했다.
// T177 이 그 결과를 쟀다: 실현÷종전 배율이 **0.60×~316×** 로 흩어지고 **세 시드 순서가 같았다**(구조).
// 원인 둘 — ① 종전 계수(농부 0.4 · 나무꾼 0.3 · 어부 1.2 …)는 생산율이 아니라 **손으로 맞춘 상대
// 가중치**였고 ② 바구니 등재가 직업마다 고르지 않다(광부는 `ore` 하나 · 어부는 일곱).
// 그래서 광부가 지워지고(픽 48→2) 광맥 부자 마을이 죽었다(T177 ⓒ).
//
// ⇒ **2판은 축을 종전에 맞춘다.** 각 직업의 항을 `(주산물 집합, 종전 값식)` 쌍으로 적고,
//   **양만** 땅 상수에서 실현으로 갈아 끼운다. 값식은 종전 그대로라 **새 수 0** —
//   0.3(사냥 가죽) · 0.6(채집 약재)은 전부 종전식에서 그대로 옮겨 온 수다.
//
//   한계가치(j) = Σ_항 [ (Σ_{r∈주산물} 실현ᵣ) / 인원 ] × 값식 × period
//
// ⚠상인·전사는 생산이 없다 — 항이 없으면 **폴백**(종전 값 그대로).
// ⚠되돌림 `L_ALLOC_BASKET=1` 이면 1판(바구니 전체 소득)으로 돌아간다 — 하네스가 그걸로 배율 표를 건다.
function allocTermsOf(job, ctx, world) {
  const W = ctx.w;
  switch (job) {
    // 종전: v.land.fertility * 0.4 * period * FOOD_VALUE * w('food')
    case 'farmer':     return [[['food'], () => W('food')]];
    // 종전: v.land.water * 1.2 * period * w('fish')
    case 'fisher':     return [[['fish'], () => W('fish')]];
    // 종전: v.land.game * 0.7 * period * (w('meat') + 0.3*w('hide'))   ← 값식의 예외를 그대로 옮긴다
    case 'hunter':     return [[['meat'], () => W('meat') + 0.3 * W('hide')]];
    // 종전: v.land.wood * 0.3 * period * w('wood')
    case 'lumberjack': return [[['wood'], () => W('wood')]];
    // 종전: max(ore·w(ore)·(1−글럿), obsidian·w, jade·w, tin·…) * 0.3 * period
    //   ★주산물은 `ore` 하나다. 종전의 max 는 **땅 부존**을 고르는 것이라 실현 양에는 자리가 없다 —
    //     실제로 무엇을 캤는지는 `dailyProductionBuf` 가 이미 안다(표 §0ⓐ 예외란).
    case 'miner':      return T1188_ORE_SPLIT?OreGoods.ids.map(k=>[[k],()=>W(k)]):[[['ore'], () => W('ore')]];
    // 종전: (forageLandMean*0.25*(w('vegetable')+0.6*w('herb')) + land.stone*0.9*w('stone')) * period * MSY
    //   ★**항이 둘**이다 — 종전식 그대로 둘로 나눈다. 첫 항의 양은 채집 믹스 실현, 둘째 항은 돌 실현.
    case 'forager': {
      const y = (ctx.forageYields && ctx.forageYields()) || {};
      const mix = Object.keys(y).filter((r) => r !== 'stone' && r !== 'pebble');
      const real = (world && world.forageRealItems) || [];
      for (const r of real) if (mix.indexOf(r) < 0) mix.push(r);
      return [[mix, () => W('vegetable') + 0.6 * W('herb')], [['stone'], () => W('stone')]];
    }
    default:           return null;   // 상인·전사·장인 — 폴백
  }
}

// 1판 바구니(되돌림 `L_ALLOC_BASKET=1` 전용) — 엔진 표에게 묻는다.
function allocBasketOf(job, ctx, world) {
  const J = ctx.JOBS && ctx.JOBS[job]; if (!J) return null;
  const out = [];
  if (J.output) out.push(J.output);
  for (const r in (J.byproduct || {})) out.push(r);
  if (J.produceSpecial === 'forager') {
    const y = (ctx.forageYields && ctx.forageYields()) || {};
    for (const r in y) out.push(r);
    out.push('stone');
    const real = world && world.forageRealItems;
    if (real) for (const r of real) out.push(r);
  }
  return out.length ? Array.from(new Set(out)) : null;
}

// 후보 목록 `[[job, gain], …]` 을 받아 **다시 쓴 목록**을 돌려준다.
//   폴백이 곧 종전이다: 첫 정산 전 · 생산 없는 직업(상인·전사) · 실현이 아직 0 이면 **받은 값 그대로**.
//   ★새 수 0 — 창 길이는 엔진이 이미 쓰는 `period`(한계효용 평가 윈도우)다.
function allocRealCandidates(v, world, cands, ctx) {
  const day = (world && world.day) || 0;
  const e = v._allocEma || (v._allocEma = {});
  const prev = (v._allocDay === undefined) ? null : v._allocDay;
  // 이 함수는 전환일(기본 7일)에만 불린다 — 지난 날수만큼 접는다(α = Δ일 / 창).
  const dd = (prev === null) ? 1 : Math.max(1, day - prev);
  const win = ctx.period * allocRealWin();
  const a = (win > 0) ? Math.min(1, dd / win) : 1;   // 창 0 = 평활 없음(돌연변이)
  // ★[T1226 ⑪] 켬 = 잠재 산출(포만 · 건강 깎기 전 — 그날 낼 수 있었던 양 · `v._t1226Pot`)을 접는다 · 하루 두 번 부르면 두 번째는 안 접는다(값 표 · 피커가 같은 날 같은 EMA).
  //   끔 = 종전 글자(실현 버퍼 · 부를 때마다 접기).
  const _t26 = t1226On();
  const dp = (_t26 && v._t1226Pot) || v.dailyProductionBuf || {};
  if (!(_t26 && prev === day)) for (const r in dp) { const x = dp[r] || 0; e[r] = (e[r] === undefined) ? x : (1 - a) * e[r] + a * x; }
  //   ★[T1226] 켬 = 일꾼 수도 같은 창으로 접는다 — 1인당 = 접은 산출 ÷ 접은 일꾼(그 산출을 낸 사람 수 · 막 옮긴 사람으로 나누면 옛 일은 부풀고 새 일은 눌려 되돌아온다).
  const _ne = _t26 ? (v._t1226NE || (v._t1226NE = {})) : null;
  if (_ne && prev !== day) { const cc = ctx.counts || {}; for (const j of new Set([...Object.keys(_ne), ...Object.keys(cc)])) { const x = cc[j] || 0; _ne[j] = (_ne[j] === undefined) ? x : (1 - a) * _ne[j] + a * x; } }
  v._allocDay = day;
  if (prev === null) return null;                   // ★첫 정산 전 — 종전 그대로(폴백)

  const B1 = allocBasketMode();                     // 되돌림 — 1판(바구니 전체 소득)
  const out = [];
  const _fb = [], _fbRatio = [];                    // ★[T189] 폴백으로 간 자리 · 이 호출의 축 배율 표본
  for (let i = 0; i < cands.length; i++) {
    const job = cands[i][0], gain = cands[i][1];
    const n = (ctx.counts && ctx.counts[job]) || 0;
    if (n <= 0) { _fb.push(out.length); out.push([job, gain]); continue; }           // 폴백 — 아직 그 일을 하는 사람이 없다
    let g = 0, any = false;

    if (B1) {
      // ── 1판(되돌림): 바구니 전체 소득 ──────────────────────────────────────
      const b = allocBasketOf(job, ctx, world);
      if (!b) { _fb.push(out.length); out.push([job, gain]); continue; }
      let q = 0, inc = 0;
      for (let k = 0; k < b.length; k++) { const x = e[b[k]] || 0; if (x > 0) { q += x; inc += x * ctx.w(b[k]); } }
      if (!(q > 0)) { _fb.push(out.length); out.push([job, gain]); continue; }
      g = (inc / n) * ctx.period; any = true;
    } else {
      // ── ★2판: 항마다 (1인당 실현 양) × (종전 값식) — 축이 종전과 같다 ─────
      const terms = allocTermsOf(job, ctx, world);
      if (!terms) { _fb.push(out.length); out.push([job, gain]); continue; }          // 상인·전사 — 폴백
      for (let t = 0; t < terms.length; t++) {
        const keys = terms[t][0];
        let q = 0;
        for (let k = 0; k < keys.length; k++) q += (e[keys[k]] || 0);
        if (q > 0) { g += (q / (_ne ? Math.max(1, _ne[job] || 0) : n)) * terms[t][1]() * ctx.period; any = true; }   // ★[T1226] 켬 = 접은 일꾼 수로(위 · 끔 = 종전 글자)
      }
      if (!any) { if (_t26) (ctx._t1226NoReal || (ctx._t1226NoReal = [])).push(job); _fb.push(out.length); out.push([job, gain]); continue; }            // 폴백 — 아직 실현이 0 · ★[T1226 ④] 켬 = 그 직업을 적어 둔다(첫 한 명 뒤 실현이 설 때까지 기다림)
    }

    // ★사냥 위험 프리미엄은 생산이 아니라 **기회비용**이라 실현 산출에 안 들어 있다 — 종전식 그대로 곱한다.
    if (job === 'hunter' && v._huntRisk != null) g *= (1 - Math.min(1, Math.max(0, v._huntRisk)));
    // ★채집 MSY 포화도 종전식에 있던 항이다 — 실현 양엔 이미 들어 있으니 **두 번 곱하지 않는다**(주석으로 남긴다).
    out.push([job, g]);
    if (gain > 0) { _fbRatio.push(g / gain); }                 // ★[T189] 이 호출의 축 배율 표본
  }

  // ★★[T189] **폴백 축 맞춤**(`L_ALLOC_FB=1` · 기본 꺼짐).
  //   실현이 없는 직업(인원 0 · 아직 안 캐 본 일)은 폴백 = **종전 값 그대로**인데, 같은 호출의 다른
  //   직업들은 실현으로 1~5배가 된다 ⇒ 폴백 값이 **상대적으로 눌린다**(T189 §0ⓐ: 나무꾼 폴백 갈래에서
  //   뽑히는 비율 2.4~5.6% vs 실현 갈래 25~28%). 그래서 폴백도 **같은 축에 세운다** —
  //   배율은 이 호출에서 실제로 다시 쓰인 직업들의 실현÷종전 **중앙값**이다(새 수 0 · 바깥 상수 0).
  //   ⚠부호는 직업마다 다르다: 사냥·어로·채집은 폴백이 **유리**했으므로(폴백중뽑힘 29~82%) 이 손잡이가
  //     그쪽을 깎는다. 공짜 수리가 아니라 **거래**다 — 표가 판정한다.
  if (_fb.length > 0 && allocFbMode() && _fbRatio.length > 0) {
    const srt = _fbRatio.slice().sort((x, y) => x - y);
    const med = srt.length % 2 ? srt[(srt.length - 1) / 2] : (srt[srt.length / 2 - 1] + srt[srt.length / 2]) / 2;
    for (let k = 0; k < _fb.length; k++) out[_fb[k]][1] *= med;
  }
  return out;
}

// ★[T1226] 한계 가치 후보 목록 — `pickDeficitJob_rational` 의 그 줄을 그대로 옮긴 것(사본 0 · 끔 = 같은 계산 같은 차례).
//   `slot(job)` = 자리 문(피커는 `hasSlot` · T1226 켬 값 표는 지금 직업의 떠날 값도 재야 해서 자리 없는 직업도 센다).
function _ratCandsOf(v, world, counts, forageLandMean, slot) {
  const _t1226F = t1226On(), _t1226D = (world && world.day) || 0;
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
  const w = oreWeights(v,priceTbl ? (r => Math.max(0.05, Math.min(200, (T1188_ORE_SPLIT&&OreGoods.isOre(r)?(priceTbl[r]??1):(priceTbl[r]||1)) / 1.0))) : (_ => 1.0));

  // 인근 마을 식량 공급 — world.villages에서 infoRange 안의 마을 jobs.farmer 합계
  let nearbyFoodCapacity = 0;
  if (world && world.villages) {
    const infoR = world.infoRange || INFO_RANGE;
    for (const o of world.villages) {
      if (o === v) continue;
      const d = villageDist(v, o);
      if (d > infoR) continue;
      nearbyFoodCapacity += (_t1226F ? _t1226FarmersOf(o, _t1226D) : (o.counts?.farmer || 0)) * o.land.fertility * 0.4;   // ★[T1226 ⑫] 켬 = 이웃의 그날 틱 머리 농부 수(마을 차례 무관) · 끔 = 종전 글자
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
  if (slot('farmer'))     candidates.push(['farmer',     farmerGain]);
  if (slot('miner'))      candidates.push(['miner',      minerGain]);
  if (slot('lumberjack')) candidates.push(['lumberjack', v.land.wood * 0.3 * period * w('wood')]);
  if (slot('fisher'))     candidates.push(['fisher',     v.land.water * 1.2 * period * w('fish')]);
  if (slot('hunter')) {   // ★사냥 위험 프리미엄(기회비용): 생활층이 관측한 부상·호환 사망으로 학습한 v._huntRisk(0~0.6, 미공급 기본 8%)만큼 기대소득 할인 — 위험한 숲은 사냥꾼 배분↓. (위 기근 게이트의 사냥은 무할인 — 절박하면 위험 감수)
    const _hr = Math.min(0.6, Math.max(0, v._huntRisk !== undefined ? v._huntRisk : 0.08));
    candidates.push(['hunter',     v.land.game * 0.7 * period * (w('meat') + 0.3 * w('hide')) * (1 - _hr)]);
  }
  if (slot('forager'))   // ★약재(§9 2차): 채집꾼 한계가치 — 약초 그림자가격이 채집 노동을 끌어당김(hide 패턴 복제). 0.6 = herb 산출비중 15% / 식량계수 0.25. ★S1: +돌 채집 가치(돌밭 마을 채집꾼 매력·석재 조달).
    candidates.push(['forager',    (forageLandMean * 0.25 * (w('vegetable') + 0.6 * w('herb')) + (v.land.stone || 0) * 0.9 * w('stone')) * period * (v._forageScale != null ? v._forageScale : 1)]);   // ×MSY 포화 — 임연부가 차면(CPUE↓) 한계가치도 함께 하락 → 채집 과잉고용 차단
  if (slot('merchant') && nearbyFoodCapacity > 0)
    candidates.push(['merchant', merchantGain]);
  // warrior — 약탈 자주 일어나는 마을에서만 의미. 추가로 weapon/armor 가용성이 호위 효과 결정.
  //   장비 비싸면 호위 운용 어려움 (가격에 음 반응) + stock 적으면 운용 어려움.
  if (slot('warrior') && caravansSeen > 1 && raidRate > 0.05 &&
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
  return { candidates, period, w };
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
    if (N >= (TOOLBOOT_ON ? 1 : 6) && (v.storage.stone || 0) >= stoneWorkStock(v)) {   // 석기 재료비(0.2/tool)에 맞춘 문턱
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
    if (STONE_NET_ON && _toolCrit && (v.land.stone || 0) >= 0.25 && (v.storage.stone || 0) < stoneWorkStock(v)
        && hasSlot(v, 'forager', cap, counts)) return 'forager';
  }

  // ★★[T1148] 추위 빚 — 땔감도 생존 필요(위 `T1148_FUEL_JOB` 머리말 · 끔 = 이 줄 무동작). 기근 블록 **앞**이다(블록 안팎 같은 잣대).
  if (T1148_FUEL_JOB && foodEquiv > N * 6 && hasSlot(v, 'lumberjack', cap, counts) && !(T325_WOOD_ACT && v._t325Cells === 0)) {
    const _c = t1148Cold(v);
    if (_c && _c.debt > 0 && _c.fuelDays < foodEquiv / N + t1197DieDays()) return 'lumberjack';   // ★[T1197] 켬 = 죽음 날 수(몸 정본 유도) · 끔 = 14
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
    // ★★[T717 ③ 2026-10-13 · 손잡이 `T717_FUEL_GATE` 기본 끔] **기근 문 안의 땔감 한 명.**
    //   이 블록(식량 30일치 밑)은 식량 넷만 고른다 — 지키는 것은 **굶음**이다(위 주석: 강제 30일 버퍼 · 게이트 완화 실험은 인구·특화 둘 다 악화).
    //   그런데 이 세계는 거의 늘 이 블록 안에 있어(맬서스 상한) 나무꾼이 안 선다 — T702: 직업 판단 955번 중 나무꾼 27 · 숲 마을 177번 중 1 ·
    //   d101~400 곳간 통나무 0 날 93~100%(숲 마을 포함). 통나무가 0 이면 땔감은 짚 · 잔가지만 탄다 ⇒ 땔감 충당률(`_fuelCov`) < 1 ⇒
    //   건강 −(1 − 충당률) × `FUEL_HEALTH_W` · 겨울엔 땔감 수요가 ×(1 + `FUEL_COLD_W` × 추위)로 커진다(연료 단계 · 위 상수 그대로).
    //   ⇒ 둘 다 지키는 문: **그날 땔감이 모자랐고**(`_fuelCov < 1` — 연료 단계가 남긴 칸) **나무꾼이 0 이면 한 명.**
    //     · 굶음 쪽 — 한 명뿐이다(나무꾼 0 일 때만 · 식량 노동은 1/N 만 뺀다) · 이 블록의 하드 플로어(N×6 — 위 부얼타운 광부 줄의 그 수) 밑이면 안 연다.
    //     · 땔감 쪽 — 자리(`hasSlot` — 땅의 숲 몫 `jobCapacity`)가 없는 마을은 안 연다(벨 나무가 없다).
    //   ⚠아래 "연료 게이트 실험 폐기" 주석의 옛 문(기근 문 밖 · 인원 제한 없음 — 노동 쟁탈전으로 시드7 랩 전멸)과 다르다: 기근 문 **안** · 0 → 1 명만.
    //   ⚠새 수 0 — 1(한 명) · 6(이 블록의 하드 플로어) · 1(충당률 만점)만 쓴다. 끔 = 옛 줄 그대로(비트 동일).
    if (fuelGateOn() && v._fuelCov !== undefined && v._fuelCov < 1 && (counts.lumberjack || 0) < 1 && foodEquiv > N * 6
        && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
    const foodOpts = [
      ['farmer',  v.land.fertility * 1.5],
      ['fisher',  v.land.water     * 1.2],
      ['hunter',  v.land.game      * 0.7],
      ['forager', forageLandMean   * 0.25],
    ].filter(([j]) => hasSlot(v, j, cap, counts));
    if (T1156_SPECIALTY_JOB && _t1156Quote) {
      for (const q of _t1156Quote(v, world)) if (hasSlot(v, q.job, cap, counts)) foodOpts.push([q.job, q.foodPerDay]);
    }
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
  if (STONE_NET_ON && (v.land.stone || 0) >= 0.25 && (v.storage.stone || 0) < stoneWorkStock(v) * Math.max(1, masonTarget(v))
      && hasSlot(v, 'forager', cap, counts)) return 'forager';
  // ★S2 석공(석기 도구 + 저티어 무기[마제석검·활]) — 돌 있으면 충원. masonTarget이 도구+무기 수요 통합.
  if ((counts.mason || 0) < masonTarget(v) && (stoneRealOn() ? (v.storage.stone || 0) >= stoneWorkStock(v) : ((v.storage.stone || 0) >= 0.2 || (v.storage.wood || 0) > N * 0.5))) return 'mason';
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
  //   ★[T652 2026-10-05 · 손잡이 `T652_WOOD_EARLY` **기본 끔**] 이 안전망은 집이 다 찬 뒤 · 곳간이 N×2 밑일 때만 선다 — 통나무의 62%는
  //     땔감이고(T644 §1) 시딩 곳간은 9~25일에 0 이 되니, 대부분 마을은 **바닥난 뒤에야** 이 줄에 닿는다. 켜면 같은 줄이 이미 있는 신호를
  //     하나 더 읽는다: **남은 날 = 곳간 ÷ 하루 소비 EMA(`_consEMA.wood`) < 30** — 30 은 v2 가 흐름 수요를 재는 바로 그 창
  //     (`flowT = _consEMA × 30` · economy-sim-v2 computeShadowPrices)이다. 새 수 0. 끔이면 이 줄은 종전 그대로(비트 동일).
  const _hPick = T1046_WOOD_SHARE
    ? Math.min(v.housing !== undefined ? v.housing : Infinity, v._mapBeds !== undefined ? v._mapBeds : Infinity)   // ★[T1046] 켬 = 출생 문 `_hcap` 과 같은 상한(econ 주거 ∧ 지은 침상)
    : (T958_HOUSE_REAL && v._t958Plan !== undefined) ? v._t958Plan : v.housing;   // ★[T966] 켬 = 계획 주거(위 `_t958Plan`) · 끔 · 그 칸 없음 = 주거 그대로(종전)
  if (((v.housing !== undefined && N >= _hPick * 0.95 && (v.storage.wood || 0) < N * 2)
       || (woodEarlyOn() && (woodEarlyMode() === 1 || _t663Birth) && (v.storage.wood || 0) < ((v._consEMA && v._consEMA.wood) || 0) * 30))
      && hasSlot(v, 'lumberjack', cap, counts)) return 'lumberjack';
  // ★S1 석재 안전망: 돌은 채집자원 — 돌밭/강가(land.stone 충분) 마을이 석재 부족하면 채집꾼(광부 아님). 집·도구 석재 수요 → 채집. 돌 없으면(stone≤0.25) 안 함(교역 의존).
  //   ★[2026-08-02c] STONE_NET 이 켜지면 경계는 위 선순위 줄에서 `>=0.25` 로 다시 잡힌다(여긴 재고 문턱 N*1.5 = 집·도구 통합 수요라 그대로 둔다).
  if ((v.land.stone || 0) > (STONE_NET_ON ? 0.2499 : 0.25) && (v.storage.stone || 0) < N * 1.5 && hasSlot(v, 'forager', cap, counts)) return 'forager';
  // ★호위 안전망: 행상이 도적에게 죽은 적 있고(tradersKilled) 전사 부족 + 식량 여유면 전사 양성.
  //   → 전사가 무기·갑옷 수요 → 광석·석재 수요 → 채광. (도적→전사→광업 사슬을 닫음)
  if (v.tradeStats && (v.tradeStats.tradersKilled || 0) > 3 && (counts.warrior || 0) < warriorTarget(v) && foodEquiv > N * 40 && (v.storage.weapon || 0) >= (counts.warrior || 0) + 1 && hasSlot(v, 'warrior', cap, counts)) return 'warrior';   // ★무기(돌칼/철칼) 있어야 전사 + readiness 목표 이내

  const { candidates, period, w } = _ratCandsOf(v, world, counts, forageLandMean, (j) => hasSlot(v, j, cap, counts));

  // ★★★[T164 2026-09-10 · T161 이식] **실현 배분 — 정본은 이 파일 하나다.**
  //   T151 이 잡은 결함: 위 후보 목록의 "양" 자리가 **실현 산출이 아니라 땅의 상수**다
  //   (`land.fertility*0.4` 따위). 채집꾼 1인당 실현 산출이 85~91% 떨어져도 배분이 못 보고
  //   (오히려 더 뽑았다 · 573→609), 값 자리도 **실제 바구니와 다르다**(천장 붙은 네 열매 값이 식에 없다).
  //   T161 이 처방을 랩에 세워 성질을 잠갔고(하네스 19/0), T164 가 그 함수를 **여기로 옮겼다** —
  //   랩은 인라인 번들로 같은 함수를 따라온다(**사본 0**). 손잡이 하나가 랩·서버 공용이다.
  //   ⚠**기본은 꺼짐.** `L_ALLOC_REAL` 이 없거나 0 이면 아래 sort/return 이 종전 그대로 돈다(비트 동일).
  //   ⚠게이트(기근·석재·도구·자본재 노동목표)는 위에서 이미 `return` 했다 — 그건 배분식이 아니라
  //     **안전망**이고, 이 처방은 거기까지 손대지 않는다. 다시 쓰는 것은 **한계가치 후보 목록뿐**이다.
  let _cands = candidates;
  if (allocRealOn()) {
    const _alt = allocRealCandidates(v, world, candidates, {
      period, counts, w,                          // ★같은 가격 접근자를 그대로 쓴다(사본 0)
      forageYields: () => foragerYieldsFor(v),     // 게으르다 — 꺼져 있으면 안 부른다
      JOBS,
    });
    if (Array.isArray(_alt) && _alt.length > 0) _cands = _alt;
  } else if (world && typeof world.allocFn === 'function') {
    // ★남겨 둔 주입 문(T161) — 정본을 안 쓰고 **다른** 배분을 실험할 때만 쓴다. 손잡이가 켜지면 정본이 이긴다.
    const _alt = world.allocFn(v, world, candidates, { period, cap, counts, forageLandMean, w, forageYields: () => foragerYieldsFor(v), JOBS });
    if (Array.isArray(_alt) && _alt.length > 0) _cands = _alt;
  }
  _cands.sort((a, b) => b[1] - a[1]);
  if (_cands.length > 0) return _cands[0][0];
  return null;
}

// ═══ ★★★[T1226 · ★재민 11-08] 직업 바꾸기를 유연하게 — 사람마다 · 날마다 "바꿔서 얻는 것 > 바꾸는 비용"일 때만 ═══
//   손잡이 `T1226_JOB_FLEX`(**끔 기본** · `=1` 켬 · 랩 `window.T1226_JOB_FLEX = 1` · 끔 · `=0` = 종전 바이트 — 위 7) 전환일 줄 그대로).
//   ① 보는 날 — 사람마다 엇갈린다: `_hashStr(사람 id)`([0,1)) × 종전 전환 간격(7 · `autoSwitchInterval`)의 내림 = 그 사람이 보는 날(날 % 7)(마을이 한날에 몰리지 않는다 · 주사위 0).
//   ② 얻는 것 = (그 사람이 갈 일의 값 − 지금 일의 값 − 불확실 몫) × 이어질 날 D.
//      값 = 하루 1인당 한계 값 — 피커의 한계 가치 후보(`_ratCandsOf` · 실현 배분 `allocRealCandidates` · 켬 = 잠재 산출 EMA × 시세)를 하루로 나눈 것 ×
//           그 사람의 그 분야 숙련 배수 ÷ 그 일 지금 사람들의 평균 숙련 배수(배수 = `opportunityCost` 의 1 + 숙련 × 0.05 · 앞으로 D 날 배워 늘 몫까지 —
//           경험치 곡선 `80 + 숙련 × 30` · 하루 1 xp · `workNPC` 그대로). 후보 밖 일(장인 · 무장 못 한 전사 등)의 지금 값 = `opportunityCost`(노동 목표 안 50 · 넘으면 0.005),
//           피커 안전망이 부른 장인 일의 갈 값 = 전환 보류 문 가치표(`_needValueOf` · OUT1 × 시세) × 숙련 배수.
//      D = 그 마을에서 "갈 일 값 > 지금 일 값"이 이어져 온 날 수(이어져 온 만큼 더 이어진다 · 피커 평가 창 100 으로 자름) — 값이 오르내리기만 하면 D 가 짧아 비용을 못 넘는다.
//      불확실 몫 = (두 값 합) ÷ √(마을 사람 수) — 표본이 작은 마을일수록 문턱이 높다(평균의 표준오차 꼴 · 새 수 0).
//   ③ 바꾸는 비용 = 지금 일 값 × 바꾸는 시간(하루 — 몸은 그날 땅거미 곳간 길에 옛 짐을 다 내리고(`_lifeGranStep` 은 직업을 안 묻는다) 이튿날 새 일터로 걸어간다).
//      최근 전환 — 30날 잠금 대신 얻는 것에 (1 − 2^(−지난 날 ÷ 30))를 곱한다(30 = 행복 반감기 `HAPPY_EQ_HALF_DAYS`): 막 바꾼 사람은 0 · 30날 뒤 ½ · 60날 뒤 ¾ —
//      막 바꾼 사람일수록 문턱이 높고 시간이 지나며 낮아진다(바꾼 적 없는 사람은 1).
//      숙련은 잃지 않는다 — `switchNPCJob` 은 직업 이름만 바꾸고 숙련 · 특성 · 경험치를 둔다(새 분야 숙련이 낮아 덜 내는 몫은 갈 값에 이미 들어 있다).
//   ④ 급할 때 — 따로 규칙 없음: 굶으면 식량 시세가 뛰어 식량 직업 값이 저절로 오른다(피커 기근 안전망은 그대로 "모자란 일"을 고른다).
//   ⑤ 몰림 — 마을 하루에 한 사람(그날 보는 사람 가운데 얻는 것 − 비용이 가장 큰 사람) · 옮긴 수는 반감기 30날로 줄며 다음 사람의 값에 든다(갈 일 n ÷ (n + 들어옴) · 떠난 일 n ÷ (n − 나감)).
//   빠지는 사람: 징발(`_warDraft` — 마을에 없다) · 촌장이 맡긴 사람(맡긴 날부터 `JOB_SWITCH_COOLDOWN` 동안 · 굶는 날 식량직만 T1085 ② 그대로) · 포로 무기 직 금지.
//   사람 없는 직업(실현 0) — 종전 폴백 값으로 첫 한 명만 · 그 사람의 실현이 설 때까지 둘째는 기다린다.
//   두 사람 마을 · 합리 피커가 아닌 세계는 종전 길 그대로(작은 마을 식량 안전망).
function t1226On() { const x = _allocKnob('T1226_JOB_FLEX'); return x !== null && x !== '' && x !== '0'; }   // 빈 글자 · `0` = 끔
function _t1226FarmersOf(o, day) { return (o._t1226F0d === day) ? (o._t1226F0 || 0) : ((o.counts && o.counts.farmer) || 0); }
const T1226_SWITCH_DAYS = 1;   // 바꾸는 시간(하루 — 위 ③ · 하루 단위 그 자체)
function _t1226Skill(p, job) {
  if (job === 'hunter') return ((p.skills.hunting || 0) + (p.skills.archery || 0)) / 2;   // `opportunityCost` 그 꼴(활 · 사냥 평균)
  const f = JOBS[job] && JOBS[job].field; return f ? (p.skills[f] || 0) : 0;
}
function _t1226Sk(p, job, D) { const s = _t1226Skill(p, job); return 1 + 0.05 * Math.min(10, s + 0.5 * D / (80 + 30 * s)); }
// 마을 값 표 — 하루 1인당 한계 값(평균 숙련 일꾼) · 폴백(실현 없음) 직업 · 직업별 평균 숙련 배수.
function _t1226Table(v, world) {
  const counts = jobCounts(v);
  const flm = Math.max(0.3, (v.land.fertility + v.land.wood + v.land.stone) / 3);   // 피커 `forageLandMean` 그 식
  const R = _ratCandsOf(v, world, counts, flm, () => true);
  let cands = R.candidates, real = false;
  const ctx = { period: R.period, counts, w: R.w, forageYields: () => foragerYieldsFor(v), JOBS };
  if (allocRealOn()) { const alt = allocRealCandidates(v, world, cands, ctx); if (Array.isArray(alt) && alt.length > 0) { cands = alt; real = true; } }
  const val = {}, fb = {}, wait = {};
  for (const c of cands) { val[c[0]] = c[1] / R.period; if (!real || (counts[c[0]] || 0) <= 0) fb[c[0]] = 1; }
  if (ctx._t1226NoReal) for (const j of ctx._t1226NoReal) { fb[j] = 1; wait[j] = 1; }
  const skm = {}, skn = {};
  for (const n of v.npcs) { if (n._warDraft) continue; const j = n.currentJob; skm[j] = (skm[j] || 0) + 1 + 0.05 * _t1226Skill(n, j); skn[j] = (skn[j] || 0) + 1; }
  for (const j in skm) skm[j] /= skn[j];
  return { val, fb, wait, skm, w: R.w, counts, ne: v._t1226NE || {} };
}
// 보는 날(사람 id 해시 [0,1) × 간격의 내림) · 얻는 것 − 비용(위 ② ③ · 불확실 몫 · 최근 전환 몫) · 이미 옮긴 수 배수(들어옴 n ÷ (n + k) · 나감 n ÷ (n − k)).
function _t1226LookDay(id, P) { return Math.floor(_hashStr(id + '|t1226') * P); }
function _t1226Net(vt, vc, N, D, since) {
  const unc = (Math.abs(vt) + Math.abs(vc)) / Math.sqrt(N);
  const r = Math.pow(2, -since / HAPPY_EQ_HALF_DAYS);
  return (vt - vc - unc) * D * (1 - r) - vc * T1226_SWITCH_DAYS;
}
function _t1226In(x, n, k) { return x * n / (n + (k || 0)); }
function _t1226Out(x, n, k) { return x * n / Math.max(1, n - (k || 0)); }
function _t1226V(T, p, j, D) {
  if (T.val[j] === undefined) return null;
  return T.val[j] * _t1226Sk(p, j, D) / (T.fb[j] ? 1 : (T.skm[j] || 1));
}
// 계측(세계 밖 · 상태 0) — 하네스 · 계측 자가 읽는다.
const _t1226Stat = { days: 0, looks: 0, switches: 0, toNeed: 0, toOther: 0, heldGain: 0, waitFirst: 0, chief: 0, draft: 0 };
//   진단(계측 전용 · `T1226_DIAG=1` · 세계 밖 표 — 마을마다 그날 모자란 일 · 본 사람 · 가장 큰 몫 · 옮긴 사람)
const T1226_DIAG = (typeof process !== 'undefined' && process.env && process.env.T1226_DIAG === '1');
function _t1226Diag(v, row) { const M = _t1226Stat.vtr || (_t1226Stat.vtr = {}); const A = M[v.name] || (M[v.name] = []); A.push(row); if (A.length > 400) A.shift(); }
function t1226Flex(v, day, world, interval, multi) {
  if (!T1226_DIAG) return _t1226FlexBody(v, day, world, interval, multi);
  const h0 = process.hrtime.bigint();   // 진단 판만 — 마을 하루 켬 전환 시간(T1228 ③)
  try { return _t1226FlexBody(v, day, world, interval, multi); } finally { _t1226Stat.ns = (_t1226Stat.ns || 0) + Number(process.hrtime.bigint() - h0); _t1226Stat.calls = (_t1226Stat.calls || 0) + 1; }
}
function _t1226FlexBody(v, day, world, interval, multi) {
  if (v.npcs.length < (SWITCH2_ON ? 2 : 3) || !world || world.picker !== 'rational') {   // 두 사람 마을 · 합리 피커 밖 = 종전 길
    if (day % interval === 0) for (let i = 0; i < multi; i++) autoSwitchJob(v, day, world);
    return;
  }
  _t1226Stat.days++;
  const P = world.autoSwitchInterval || 7;
  const S = v._t1226 || (v._t1226 = { need: null, since: day, pr: {} });
  // 하루 머리 — 모자란 일(피커 · 안전망 그대로) · 값 표 · 두 일 사이 부호가 이어져 온 날
  const need = pickDeficitJob_rational(v, world);
  if (need !== S.need) { S.need = need; S.since = day; }
  let T = _t1226Table(v, world);
  //   값은 하루 값의 반감기 30날 평활(`HAPPY_EQ_HALF_DAYS` — 행복이 겪은 일을 잊는 그 빠르기) — 시세가 하루 이틀 튄 몫은 거의 안 남고 이어지는 차이만 남는다.
  const VS = S.vs || (S.vs = {}), al = 1 - Math.pow(2, -1 / HAPPY_EQ_HALF_DAYS);
  for (const j in T.val) VS[j] = (VS[j] === undefined) ? T.val[j] : VS[j] + al * (T.val[j] - VS[j]);
  const smooth = (X) => { for (const j in X.val) if (VS[j] !== undefined) X.val[j] = VS[j]; return X; };
  smooth(T);
  //   아직 값에 안 든 옮김 — 옮긴 사람마다 1 을 같은 반감기로 줄여 센다(평활 값이 그 옮김을 다 반영하기 전에 같은 쪽으로 또 몰리지 않게 · 몰림 ⑤).
  const PIN = S.pin || (S.pin = {}), POUT = S.pout || (S.pout = {});
  if (S.pd !== day) { const k = Math.pow(2, -((S.pd == null ? day : day - S.pd)) / HAPPY_EQ_HALF_DAYS); for (const j in PIN) PIN[j] *= k; for (const j in POUT) POUT[j] *= k; S.pd = day; }
  const js = Object.keys(T.val);
  for (let a = 0; a < js.length; a++) for (let b = 0; b < js.length; b++) {
    if (a === b) continue;
    const k = js[a] + '>' + js[b], sg = T.val[js[b]] > T.val[js[a]] ? 1 : 0, o = S.pr[k];
    if (!o || o[0] !== sg) S.pr[k] = [sg, day];
  }
  const look = [];
  for (const n of v.npcs) {
    if (_t1226LookDay(n.id, P) !== (day % P)) continue;   // [0,1) 해시 × 간격 = 그 사람이 보는 날의 나머지
    if (n._warDraft) { _t1226Stat.draft++; continue; }
    look.push(n);
  }
  if (!look.length || !need) return;
  const N = v.npcs.length, cap = jobCapacity(v);
  //   ★[T1228] 마을 빠르기 — 곳간이 30일치(피커 기근 문) 넘게 있으면 종전 전환 간격(7날 · `autoSwitchInterval`)에 한 사람, 밑이면 하루 한 사람
//   (손잡이 `T1228_PACE=0` 끔 · `=10` = 종전 "진짜 기근 — 날마다" 10일치 문턱 — 서버 빈 마을 7 로 더 나빠 기본 아님).
  //   값이 곳간 재고를 보고 매겨져 곳간이 두둑할 땐 식량 일이 싸 보인다 — 날마다 옮기면 식량 일꾼이 시세보다 빨리 빠져 곳간이 비고서야 돌아온다(T1228 빈 마을 표).
  if (_allocKnob('T1228_PACE') !== '0' && S.mv != null && totalFoodEquivalent(v) >= N * (_allocKnob('T1228_PACE') === '10' ? 10 : 30) && day - S.mv < P) return;
  const Dneed = Math.min(100, day - S.since + 1);
  let hungry = null, pick = null, pickJob = null, pickNet = 0;
  const ev = [];
  const mvIn = PIN, mvOut = POUT;   // 이미 옮긴 수(위 · 오늘 몫 포함): 갈 일 1인당 몫은 n ÷ (n + 들어옴) · 떠난 일은 n ÷ (n − 나감)
  const ne1 = (j) => Math.max(1, T.ne[j] || T.counts[j] || 0);
  for (const p of look) {
    _t1226Stat.looks++;
    const c = p.currentJob;
    if (p._chiefAssignDay != null && p._chiefAssignDay === p.lastJobChangeDay && day - p._chiefAssignDay < JOB_SWITCH_COOLDOWN
        && !(_T1085_FOOD[need] && (hungry === null ? (hungry = _t1085Hungry(v)) : hungry))) { _t1226Stat.chief++; continue; }
    const since = day - (p.lastJobChangeDay == null ? -999 : p.lastJobChangeDay);
    let best = null, bestNet = 0;
    const tryJob = (t, Dt) => {
      if (t === c || (p.captive && CAPTIVE_JOB_BAN[t])) return;
      if (T.wait[t] && (T.counts[t] || 0) >= 1) { _t1226Stat.waitFirst++; return; }   // 사람 없던 일 — 첫 한 명의 실현이 설 때까지
      if (_T1085_FOOD[t] === undefined && p._chiefAssignDay != null && p._chiefAssignDay === p.lastJobChangeDay && day - p._chiefAssignDay < JOB_SWITCH_COOLDOWN) return;
      const vt0 = _t1226V(T, p, t, Dt), vt = vt0 !== null ? _t1226In(vt0, ne1(t), mvIn[t]) : _needValueOf(v, t, T.w) * _t1226Sk(p, t, Dt);
      const vc0 = _t1226V(T, p, c, Dt), vc = vc0 !== null ? _t1226Out(vc0, ne1(c), mvOut[c]) : opportunityCost(p, v, T.w);
      const net = _t1226Net(vt, vc, N, Dt, since);
      if (T1226_DIAG) ev.push([c, t, +vt.toFixed(3), +vc.toFixed(3), Dt, +net.toFixed(2)]);
      if (net > bestNet) { bestNet = net; best = t; }
    };
    // 모자란 일(피커) — D = 그 일이 모자란 일로 이어져 온 날과 (두 일이 다 값 표에 있으면) 평활 값 차의 부호가 이어져 온 날 중 짧은 것(둘 다 이어져야 이어진다)
    { const o = S.pr[c + '>' + need]; const inV = T.val[need] !== undefined && T.val[c] !== undefined;
      const Dp = !inV ? Dneed : ((o && o[0] === 1) ? Math.min(100, day - o[1] + 1) : 0);
      if (Math.min(Dneed, Dp) > 0) tryJob(need, Math.min(Dneed, Dp)); }
    // 그 밖 자리 있는 한계 가치 직업 — 손잡이 값 `2` 일 때만(계측 판 · D = 두 일 값 부호가 이어져 온 날 · 마을 값이 거꾸로면 1).
    //   켬(`1`)은 마을이 고른 "가장 나은 다른 직업"(피커 — 한계 가치 1위 또는 안전망)으로만 간다: 사람마다 다른 것은 언제 · 누가 · 갈지 말지다.
    if (_allocKnob('T1226_JOB_FLEX') === '2') for (const t of js) {
      if (t === need || !hasSlot(v, t, cap, T.counts)) continue;
      const o = S.pr[c + '>' + t]; tryJob(t, (o && o[0] === 1) ? Math.min(100, day - o[1] + 1) : 1);
    }
    if (!best) { _t1226Stat.heldGain++; continue; }
    if (bestNet > pickNet) { pick = p; pickJob = best; pickNet = bestNet; }
  }
  // 몰림 — 마을 하루에 한 사람: 그날 보는 사람 가운데 얻는 것 − 비용이 가장 큰 사람만 옮긴다(나머지는 다음 보는 날 다시 잰다 · 차례 무관).
  if (T1226_DIAG) { ev.sort((a, b) => b[5] - a[5]); _t1226Diag(v, [day, need, Dneed, look.length, pick ? pick.currentJob + '>' + pickJob : '-', +(totalFoodEquivalent(v) / N).toFixed(1), ev.slice(0, 2)]); }
  if (!pick) return;
  S.mv = day;   // ★[T1228] 마을이 마지막으로 옮긴 날(빠르기)
  const c = pick.currentJob;
  mvOut[c] = (mvOut[c] || 0) + 1; mvIn[pickJob] = (mvIn[pickJob] || 0) + 1;
  switchNPCJob(pick, pickJob, day, v);
  _t1226Stat.switches++; if (pickJob === need) _t1226Stat.toNeed++; else _t1226Stat.toOther++;
  { const k = c + '>' + pickJob; const F = _t1226Stat.flow || (_t1226Stat.flow = {}); F[k] = (F[k] || 0) + 1; }
}
// ★[T1226] 전환 보류 문의 가치표(OUT1 · OUTRES) — `autoSwitchJob` 안에 있던 그 표 그대로(키 · 값 · 주석 무변 · `test-picker-tables` 가 이 글자를 읽는다).
function _needValueOf(v, need, w) {
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
  return (OUT1[need] || 0.5) * w(OUTRES[need] || 'food');
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
        if (day - n.lastJobChangeDay < JOB_SWITCH_COOLDOWN) continue;
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
  const w = oreWeights(v,priceTbl ? (r => Math.max(0.05, Math.min(200, (T1188_ORE_SPLIT&&OreGoods.isOre(r)?(priceTbl[r]??1):(priceTbl[r]||1)) / 1.0))) : (_ => 1.0));
  let bestIdx = -1, bestCost = Infinity;
  //   ★[T1085 ②] 굶는 날의 식량직 전환은 촌장 지정 쿨다운을 넘는다(지정 표지가 마지막 전환일 때만 — 표지 없는 세계 = 종전 비트).
  let _t1085Hunger = null;
  for (let i = 0; i < v.npcs.length; i++) {
    const n = v.npcs[i];
    if (n.currentJob === need) continue;
    if (n.captive && CAPTIVE_JOB_BAN[need]) continue;   // ★[포로 게이트] 포로에게 전사·사냥꾼(무기 직) 배정 금지 — captive 없으면 무해(항상 통과)
    if (day - n.lastJobChangeDay < JOB_SWITCH_COOLDOWN) {  // 쿨다운(개인 단위 churn 억제)
      if (!(n._chiefAssignDay != null && n._chiefAssignDay === n.lastJobChangeDay && _T1085_FOOD[need]
        && (_t1085Hunger === null ? (_t1085Hunger = _t1085Hungry(v)) : _t1085Hunger))) continue;
    }
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
      const needValue = _needValueOf(v, need, w);   // ★[T1226] 표 둘을 위 함수(`_needValueOf`)로 옮김(값 · 차례 그대로 — T1226 켬 값 표도 같은 표를 읽는다 · 사본 0)
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
    let youngestIdx = -1;
    for (let i = 0; i < src.npcs.length; i++) {
      if (src.npcs[i]._warDraft) continue;   // ★[T295 ①] 원정 중인 사람은 이주하지 않는다(마을에 없다)
      if (youngestIdx < 0 || src.npcs[i].age < src.npcs[youngestIdx].age) youngestIdx = i;
    }
    if (youngestIdx < 0) continue;
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
               + (t.fish||0)*1.25 + (t.meat||0)*2.14 + (T1188_ORE_SPLIT?OreGoods.total(t):(t.ore||0))*3.0;
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
      expansions: v.expansions || 0,   // ★[2026-08-03a ⑰] 확장 셀 수 — v2 CLI 회귀 판정 열
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
let _t1206B0 = null;   // ★[T1222] 이 프로세스 첫 세계가 시작할 때의 계수기(위 `_t1206Key`)
function createWorld(opts = {}) {
  const _t1206At = { v: _nextVillageId, n: _nextNpcId }; if (!_t1206B0) _t1206B0 = _t1206At;
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
  Object.defineProperty(world, '_t1206Shift', { value: { v: _t1206At.v - _t1206B0.v, n: _t1206At.n - _t1206B0.n }, enumerable: false, writable: true });   // ★[T1222] 열거 안 됨(지문 · 저장 줄 무변)
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
  if(T1188_ORE_SPLIT&&cons.ore>0){const n=cons.ore;delete cons.ore;Object.assign(cons,OreGoods.split(n,oreSourceMix(v)));}
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
  migrateOre(v);
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
    let reserve = computeDynReserve(v, cons, r, T1192_FISH_SPECIES&&FishGoods.isItem(r)?fishPreserveReserve(v,r):RESERVE_PC[r]);
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
  if(T1188_ORE_SPLIT)for(const k of OreGoods.ids){const m=OreGoods.mineralOf(k),id=m==='jade_raw'?'jade':m;prices[k]=Math.min(prices[k]||0,_ERA_METAL(id)&&!_eraKnows(id)?0:SMELT_YIELD*(prices[id]||0));}
  if(T1188_ORE_SPLIT)delete prices.ore;
  return prices;
}

module.exports = {
  T1259_WOOD_CAP, setT1259WoodReader, T1271_ORE_CAP, setT1271OreReader, jobCapacity,
  T1192_FISH_SPECIES,FishGoods,preservedFactor,fishPreserveReserve,_t1192Preserve,
  T1188_ORE_SPLIT, OreGoods, oreTotal, oreReserveTotal, oreValue, oreSourceMix, migrateOre, takeOre,
  T1149, t1149LeanDays, t1149WinterDays, t1149WinterNeed,   // ★[T1149] 겨울 골짜기 — 손잡이 갈래 · 달력 셈 · 다가오는 겨울에 모자랄 식량(v2 가을 사 모으기가 읽는다)
  T1179_CROP_SEASON, t1179FieldDay, t1179Standing,   // ★[T1179] 작물 철 — 손잡이 · 밭 하루 · 밭에 선 먹을 것(계측)
  assignNPCJob, assignableJobs, JOB_SWITCH_COOLDOWN,
  t1113On, t1113Unhappy, t1113Happy, t1113LowMul, t1113IsFood, T1113_HAPPY_MID,   // ★[T1113] 행복 낮을 때 효과 셋 — war-core · 서버 · 하네스가 같은 술어를 읽는다(사본 0)   // ★[T1085] 촌장 지정 — 서버 동사 `assign_job` 이 부른다(규칙 사본 0)
  _autoSwitchJobForTest: autoSwitchJob, _switchNPCJobForTest: switchNPCJob,
  t1226On, t1226Flex, _t1226Table, _t1226V, _t1226Sk, _t1226Net, _t1226LookDay, _t1226In, _t1226Out, _t1226FarmersOf, _t1226Stat, T1226_SWITCH_DAYS, opportunityCost, _needValueOf, villageMasterSkill, apprenticeInherit,   // ★[T1226] 직업 바꾸기 유연 — 하네스 · 계측이 같은 함수를 읽는다(사본 0)   // ★[T1085] 하네스가 자율 전환 그 함수를 부른다(시험 이름 · 사본 0)
  T1075_HAPPY_EQ, HAPPY_EQ_HALF_DAYS,
  T1205_HAPPY, T1205_E_MIN, T1205_E_MAX, T1205_DEF, t1205Par, t1205Terr, t1205Burden, t1205Ev, t1205Step, t1205NeedOut,   // ★[T1205] 행복 식 다시 — 하네스 · 호스트 · war-core 가 같은 함수를 읽는다
  T1134_HAPPY_TARGET, T1134_EMIG_H, T1134_C_DEFAULT, t1134C, t1134Half, t1134Step,   // ★[T1134] 목표 행복 — 하네스 · 호스트가 같은 함수를 읽는다   // ★[T1075] 행복 평형 손잡이 · 반감기(평형 함수는 `sim/equilibrium.js` 하나 — T1076 과 같이 쓴다)
  foodDebtOf, T1074_FOOD_DEBT,   // ★[T1074] 식량 빚 읽는 함수 하나(T1075 가 읽는다)
  T1217_MARGIN, t1217HappyMu, t1217IdleFrac, LEISURE_HAPPY_W,   // ★[T1217] 한 시간 값 ↔ 쉰 값 — 물건 한 단위의 행복 기울기 · 여가 몫 밑변 · 여가 무게(v2 · 서버 · 하네스가 같은 함수를 읽는다)
  T1206_NAT_DEATH, T1206_SILER, T1206_GRAVE, t1206Hazard, t1206DayP, t1206Bury, t1206Day, t1206Expected, _t1206IsLux,   // ★[T1206] 자연사 · 출생 다시 맞춤 · 부장 — 하네스 · 관찰기
  T1198_BIRTH_BODY, _t1198Houses,   // ★[T1198] 출생 = 집 짝 곁 · 명부 ↔ 몸 1:1 — 호스트 · 하네스
  T1197_MEAL_BODY, T1209_MEAL_TRIAGE, NPC_HP_DAY, npcRegenMul, t1197Advance, t1197Meal, t1197Kill, t1197Day, t1197DieDays, __t1197: () => _t1197(),   // ★[T1197] 몸 게이지 끼니 — 호스트(몸 끼니 · 몸 흘림 · 그 자리 죽음) · 하네스가 같은 함수를 부른다
  __t1074: { _fdEaters, _fdNeed, _fdSettle, _fdDeathIdx, FD_ADAPT_MAX, FD_ADAPT_DOWN_DAYS, FD_ADAPT_UP_DAYS, FD_DEATH_DAYS, FD_REPAY_MAX, T1117_FD_EVID },   // 하네스 훅(test-t1074-food-debt)
  T860_ON, CATCH_FROM, PRESERVE_FROM, _preserveSurplus, _t860Begin, _t860Dry, T877_ON, _t860Unit, PRESERVED_FOODS, PRESERVE_YIELD, PRESERVE_FOOD_FACTOR, FORAGE_FOOD_FACTOR,   // ★[T860] 잡은 날 말리기 — 손잡이 · 잡은 칸 표(하네스가 spoil 정본과 대조한다 · 사본 0) · 갈무리 한 걸음
  STONE_NET_STOCK,   // ★[T180] STONE_NET 1차 문턱 — v2 수출 게이트가 읽는다(사본 0)
  STONE_FLOOR_LAND,   // ★[T1049] 돌 바닥(livelihood FLOOR.stone) — v2 수출 게이트가 읽는다(사본 0)

  _LEGACY_CONTRIBUTES: LEGACY_CONTRIBUTES,
  T958_HOUSE_REAL,   // ★[T958] 집 행위 마을 econ 주거 = 지은 침상까지(★[T974] 켬 기본 · `=0` 되돌림 · ★[T966] 끔 기본이던 글자) — 방아쇠(서버 `villages.js`)가 읽는다
  T1156_SPECIALTY_JOB, setT1156Quote,
  T1157_EAT_VAULT, t1157Food,
  T1148_FUEL_JOB, t1148Cold,   // ★[T1148] 추위 빚(끔 기본 · `'1'` 켬)
  T1135_FUEL_EQ, FIREWOOD_PC_SRC, woodShareD, woodFormulaOff,   // ★[T1135] 땔감 평형(끔 기본 · `'1'` 켬) · 고증 d · 나무꾼 분자 · 수식 목재 걷어냄
  T1046_WOOD_SHARE,   // ★[T1046] 나무꾼 안전망 = 출생 문과 같은 주거 상한(끔 기본 · `'1'` 켬)
  T932_SMELT_CONT, t932Stat,   // ★[T932] 제련 날 마을 하루 결함 손잡이(켬 기본) + 계측 칸(관찰기 `t932-smelt-probe` 가 읽는다 — 행동 무관)
  T924_DEBT_CAP, _computeVillageStats,   // ★[T924] 빚 손잡이 + 마을 stat 함수(관찰기 `t924-observe` 가 건강 · 행복 항을 가른다 — 읽기만 · 사본 0 · 동작 무변)
  T931_SLOTK_EMA, T931_SLOTK_SEASON, totalFoodSlots,   // ★[T931] 식량 자리 K 관성 손잡이 + 자리 함수(하네스 · 관찰기 `t931-observe` 가 그날 자리를 다시 센다 — 읽기만 · 사본 0 · 동작 무변)
  totalFoodEquivalent, storageFoodPer, storageFoodEquivalent,   // 진단 하네스가 병기고 식량안보 게이트를 정확히 재려면 필요
  consumeFood,           // ★[T73] 식단 사다리의 **순서**를 하네스가 직접 증명하려면 필요(같은 이유)
  RAW_GRAINS, RAW_GRAIN_FOOD_FACTOR, T1243_GRAIN_STATE, rawGrainF: _rawGrainF,   // ★[T73] 계수를 하네스·계측기가 옮겨 적지 않게(사본 금지)
  farmFlowPerDay, farmLandBoost, harvestToGranary,   // ★[T100] 같은 이유 — 하네스·계측기가 앵커를 옮겨 적지 않는다
  fishToGranary, fishActOn, fishBudgetPerCell, T312_FISH_ACT,   // ★[T312] 어부 행위 — 생활층이 부르는 문 셋 + 손잡이(하네스가 옮겨 적지 않는다)
  bindProductionActs, productionActsBound, productionFormulaOff,   // T1180: 물리 생산 호스트 등록 · 수식 대체 문
  T1195_HUNT_REAL, huntActOn, huntDemandLeft, huntToGranary,   // T1195: 사냥 고기 = 몸이 잡은 마리 × kg(서버가 부른다)
  T452_KILN_ACT, kilnActOn, kilnWant, kilnDay, furnaceCharcoalTarget,   // ★[T452] 숯가마 행위
  T443_SMELT_FUEL, smeltFuelOn, smeltFuelPerOre, smeltFuelTake,   // ★[T443] 제련 연료 — 하네스·계측기가 표를 옮겨 적지 않게
  T419_STONE_REAL, stoneRealPer, stoneRealOn, stoneWorkStock,   // ★[T419] 돌 쓰는 실물 — 하네스·계측기가 표·유도를 옮겨 적지 않게 내준다
  T435_GRANARY_ACT, granaryEconMaterials,   // ★[T435] 곳간 증설 재료 — 생활층·하네스가 표를 옮겨 적지 않게
  T1050_LAB_HOUSE, crewPerLoad, houseCrewDay, labHouseAttach, labHouseDay, labHouseWorldDay, labSiteNew, labSiteCrewDay, labCrewDbg,   // ★[T1050] 집 크루 하루 정본(서버 생활층 · 랩 몸 없는 마을이 같은 함수) · 손잡이 · ★[T1056] 몸 없는 크루의 집터 하루(t17 · t176 · 랩 HTML 둘이 같은 함수)
  T1213_ON, houseBuildWant, landWoodShare, woodSpareAfterLand, buildInputTarget,   // ★[T1213] 땅의 차례 · 짓는 파생수요(v2 목표 세 자리 · 생활층 다리 크루가 같은 함수를 부른다)
  T400_BUILD_ACT, T1054_DECAY_WOOD, T527_BRIDGE_ACT, T537_SHORTCUT, buildActOn, houseDayBuild, houseWoodShare, woodSpare, T497_HUT_COST, hutPillarsArm, T517_HUT_STONE, hutStoneUnits, actFromGranary, actMaterialsPlaced, returnActMaterials, hutEconMaterials, hutEconStage, hutStageCount, hutCapPerHut, houseCostPerCap,   // ★[T400] 집 행위 — 하네스·생활층이 표·유도를 옮겨 적지 않게 내준다
  actToGranary, woodToGranary, woodActOn, woodRegrowR, woodRegrowPerDay, T325_WOOD_ACT,
  T17_MSY, fishMsyDayClose,   // ★[T923] 어장 MSY 상한 켬 기본 — 자(t17)가 켬/끔을 글자로 다시 적지 않고 엔진에게 묻는다(사본 0) · 마을 하루 마감(V2 가 부른다)
  mineToGranary, mineDemandLeft, mineActOn, T724_MINE_ACT, T1266_ORE_BODY,   // ★[T1266] 광부 원석 양 = 몸이 친 만큼(끔 기본)
  T1196_ARTISAN_ACT, T1196_SET, artisanActOn, artisanTake, artisanGive, t1196Unhide,   // ★[T1196] 장인 작업장
  __t1196: { begin: _t1196Begin, end: _t1196End, day: _t1196Day, seat: _t1196Seat },   // ★[T1196] 하네스 문(운영 경로는 안 부른다)
  forageToGranary, forageActOn, forageActItemsOf, foragerYieldsFor, T347_FORAGE_ACT,   // ★[T347] 채집 행위 — 문 셋 + 믹스 정본 + 손잡이(하네스가 표를 옮겨 적지 않는다)
  actDemandLeft, actDemandCap, fishDemandLeft, woodDemandLeft, forageDemandLeft, T374_DEMAND_STOP,
  setLotHook,   // ★[T748] 고르게 대기 칸 로트 훅(존 서버 켬만 꽂는다 · 랩 null)
  T368_FARM_ACT, T1221_FARM_LABOR, T1243_FARM_ON, T1276_FARM_K, t1276FieldFlow, t1276Note, T1260_FOOD_READS, T1279_COOK, t1260FoodOf, t1260CookStaple: _t1260CookStaple, cookTarget, t368FoodPer: _t368FoodPer, t368EvenRelease, totalFoodProductionEquivalent,   // ★[T368] 농부 행위 — 손잡이 + 품목별 고르게 푸는 자리 + 생산 환산(하네스가 옮겨 적지 않는다 · 입구는 `harvestToGranary` 그대로)   // ★[T374] 그날 수요 — 몸통 하나 + 품목별 `D` 자리 셋 + 손잡이
  forageRegrowR, forageRegrowPerDay, actRegrowPerDay,   // ★[T347] 재생 — T341 과 **같은 몸통**(`_actRegrowR`), 분자만 갈린다   // ★[T325] 나무꾼 행위 · ★[T341] 예산식은 지웠다(나무는 개체다) — 남은 것은 게이트와 **재생 유도 둘**
  T100_ANCHOR_N, T100_HARVEST_PER_FARMER_YEAR, T100_K, T100_FIELD_YIELD,   // ★[T100 4판] 앵커 하나 · 실측 하나 · 유도값 하나 · 손잡이 — 생활층(`villages.js`)과 하네스가 **여기서만** 읽는다(사본 0)
  T1159_HOME_N, t1159HomeN,
  DAILY_FOOD_CONSUMPTION,   // ★[T100 4판] 하루 1인 식량 정본 — `k` 유도의 한 항(하네스가 1.0 을 옮겨 적지 않는다)
  seedFoodDays, SEED_FOOD_DAYS_D0, SEED_FOOD_DAYS_LEGACY,   // ★[T100 5판] 창설 곳간의 밑변 — 하네스가 `crops.js` 에서 다시 유도해 대조한다
  HEALTH_PROD_W, happyWorkMul, happyFloor1On, happyWorkWOf, T157_HAPPYWORK_H,   // ★[T157] 건강→작업량 계수 — 하네스가 "행복은 건강과 같은 문법" 을 대조한다(사본 0) · ★[T209] 하한 손잡이(하네스가 되돌림을 건다)
  gardenFloorTopUp, T100_GARDEN, T100_GARDEN_CELLS, T100_GARDEN_FLOOR, T193_LEDGER, T227_EVEN, t100EvenRelease,   // ★[T227] 고르게 — 손잡이·푸는 자리를 하네스가 옮겨 적지 않는다   // ★[T193] 장부 손잡이 — 하네스가 옮겨 적지 않는다   // ★[T100 5판 ⓒ] 텃밭 하한 — 값·손잡이·유도식을 하네스가 다시 계산한다
  T240_STRAW_CARRY, strawCarryBurn,   // ★[T240] 짚 이월 — 손잡이·산수 한 자리를 하네스가 옮겨 적지 않는다
  buildCapOf, HOUSE_BUILD_MAX, HOUSE_WOOD, HOUSE_BUFFER,   // ★[T300] 건축 상한 손잡이 — 하네스·계측기가 값·꼴을 옮겨 적지 않는다
  FARMER_BASE: JOBS.farmer.base,   // ★[T100] 농부 1인 기준 산출(옛 밑변 `1.5 × 지력`의 1.5) — 계측기·하네스가 이 수를 옮겨 적지 않게
  // ★[T125] 옷감 보온 가중 — `server/villages.js` 가 주민 착장 재질을 고를 때 **읽는다**.
  //   같은 이유(사본 금지)로 이름만 낸다. 값·틱 로직 무접촉 — 이 줄은 시뮬을 한 톨도 안 바꾼다.
  CLOTH_MATS,
  // 가치사슬 하네스(scripts/test-valuechain.js)가 상수를 **복제하지 않고** 읽도록 노출.
  _SMELT_PER_LABOR: SMELT_PER_LABOR, _SMELT_YIELD: SMELT_YIELD, _MELT_TOTAL,
  // ★시대 게이트 조회 — v2 원석 상한이 같은 판정을 쓰도록(사본 금지). 금속이 아니면 항상 true.
  _eraMetalKnown: (id) => !_ERA_METAL(id) || _eraKnows(id),
  // ★유효 제련 조성(2026-08-02b) — v2 가격 상한·교역 층이 **같은 함수**를 쓰도록 노출(사본 금지).
  //   _trySmelt·smeltTarget 은 하네스(scripts/test-oremix.js)가 실제 제련을 돌려 보려고 노출한다.
  oreMixOf, foldOreMix, _trySmelt, smeltTarget,
  derivedInputTarget,   // ★[2026-08-02f ①-2] 구리 파생 투입수요 — v2 가 가격 target 에 얹는다(단일 진실)
  // ★[2026-08-03a ⑰] 국고 현금 배선 — 하네스가 **산술을 직접 재게** 노출한다(상수 복제 금지).
  //   `_treasuryTopUp` 은 실제 함수 그대로여야 검사가 그 코드를 밟는다(모형을 검사하면 의미가 없다).
  _treasuryTopUp, RESERVE_PC, _matPrice, expandCost,
  // ★[2026-08-03b ① 청동 희소성 원인 규명] 주조 자격 판정의 **두 비용을 그대로** 노출한다.
  //   엔진에 계수기를 박지 않는다 — 랩이 마지막 날에 부르면 되고, 그래야 로직이 안 흔들린다.
  //   `_smithBeatsMason` 이 청동 생산의 마지막 관문이다: 여기서 막히면 재료가 있어도 안 만든다.
  _smithWeaponCost, _masonWeaponCost, _smithBeatsMason, _alloyMelt, _bronzeCapable,
  _EXPAND_CELLS_PER_SLOT: EXPAND_CELLS_PER_SLOT,
  // ★부얼타운 판정 — 시딩(villages.js)이 같은 함수를 쓰도록 노출(사본 금지)
  isBoomtown, veinScore, foodCapOf, BOOM_FOOD_MAX, BOOM_VEIN_MIN,
  createWorld,
  tickWorld,
  tickTrade, tickCaravans,   // ★랩이 본 게임과 같은 루프를 돌려면 필요(누락돼 있어서 랩이 '교역 없는 세계'를 재고 있었다)
  serializeWorld,
  computeVillagePrices,
  computeDailyConsumption,
  FORAGE_FOOD_FACTOR,   // ★식량 pull(v2 FOOD_CLASSES 파생용 단일 진실 — 구황·해산물 식용 등가)
  // ★[T164] 실현 배분 정본 — 랩도 하네스도 **이 함수들을** 부른다(사본 0).
  allocRealOn, allocRealWin, allocBasketMode, allocFbMode, allocBasketOf, allocTermsOf, allocRealCandidates,
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
  T692_SEED_RESERVE, seedReserveHeld, seedReserveAvail,   // ★[T692] 시딩 가산 몫 비축(기본 끔) — v2 수출 두 문 · 하네스 · 계측기가 같은 함수를 부른다
  adjustGuildTax,
  tickMigration,
  processEvents,
  jobCounts,
  villageDist,
  setDistMatrix,
  setSeed,
  srand: () => srand(),
  // ★[T728] 재기동 영속 — 모듈 전역 셋(econ 난수 상태 · 다음 주민 번호 · 다음 마을 번호)을 읽고 되돌리는 문.
  //   서버 world 메타 행(`T728_RESTART_KEEP` 켬)만 부른다 — 안 부르면 아무 일도 없다(랩 · CLI · 픽스처 무변).
  rngState: () => (T731_LOCAL_MIDNIGHT ? { seed: _seed, npc: _nextNpcId, vil: _nextVillageId, s0: _seed0 } : { seed: _seed, npc: _nextNpcId, vil: _nextVillageId }),   // ★[T731] 켬 = 세계 씨(새 마을 흐름의 재료)도
  setRngState: (o) => { if (!o) return; if (o.seed != null) _seed = o.seed >>> 0; if (Number.isFinite(o.npc)) _nextNpcId = o.npc; if (Number.isFinite(o.vil)) _nextVillageId = o.vil; if (T731_LOCAL_MIDNIGHT && Number.isFinite(o.s0)) _seed0 = o.s0 >>> 0; },
  useVillageStream, T731_LOCAL_MIDNIGHT,   // ★[T731] 마을 흐름 쥐기(v2 의 마을 조각 · 날씨 · 흉풍이 부른다) · 손잡이
  // ★S2 계측/랩 노출 — 노동목표 함수(석공·대장장이)
  toolDesiredStock, masonTarget, smithTarget, weaponsmithTarget, armorsmithTarget, warriorTarget,
  // ★S4 명장 견습(세대 전승)
  apprenticeInherit, villageMasterSkill,
};
