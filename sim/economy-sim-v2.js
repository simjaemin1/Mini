// =============================================================================
// economy-sim-v2.js — 경제학 모델 기반 시뮬 (튜닝용 격리 파일)
//
// 핵심 변경 (vs v1):
//   1. shadow price = BASE_VALUE × (target/stock)^elasticity  — hyperbolic
//      자원별 elasticity 다르게 (식량 ↑, 사치품 ↓).
//   2. 마을 = production cooperative. NPC가 자유 인출 (subsistence만).
//      자급 수요는 price-inelastic. 외부거래만 가격 반응.
//   3. 행상 = LOP arbitrage. 이익 = N×(p_to(1-τ) − p_from(1+τ) − 운반비/N − 위험)
//      이익 > 0인 (자원, 목적지) 쌍 중 max 골라 출발.
//   4. 양쪽 거래소 수수료 τ → 마을 treasury.
//   5. 이동 시간 3~7일 (거리 + random jitter).
//   6. 화폐·임금 없음. credit은 거래 한 사이클 안에서 청산 (= 회계단위).
//
// 사용법: node sim/economy-sim-v2.js [days] [villages] [seed]
// =============================================================================

const v1 = require('./economy-sim');

// === 새 상수 — v1과 분리 ===
// v2 round 2: 가격 완화 + weapon/tool BASE 낮춤 + 외곽 살리기 + cargo↑

const ELASTICITY = {
  // 생존필수 — 부족시 폭등, 그러나 너무 가파르지 않게
  food: 1.2, fish: 1.2, meat: 1.2, cooked_food: 1.2,
  // 중간재
  wood: 0.9, stone: 0.9, ore: 0.9, hide: 0.9, herb: 0.9,   // ★약재(§9 2차) — 치료·복용재(중간 탄력)
  bone: 0.9,   // ★뼈(§9 3차) — 무기장 투입재(중간 탄력, specialty livestock 1.1을 명시 정의로 대체)
  // 사치/생산수단 — 완만
  tool: 0.7, weapon: 0.6, armor: 0.6,
  clothes: 0.7,   // ★의복(2026-07-12) — 내구 자본재(도구 동형 탄력). 1인 1벌 커버리지·한랭 수요는 v1 스탯/마모가 처리
  ramie: 0.9,   // ★모시(저마·苧麻, 2026-07-13) — 고급 식물섬유(재봉 CLOTH_MATS). flax(아마)·cotton(목화)은 고증 제외(economy-sim.js:156 — 서구/조선 도입) → 한국 전통 bast 섬유 모시로 대체. subs 미등재 = flowT 수요(flow-EMA 첫 수혜: 재봉 _cons가 수요 자동 등록). bone/tigerhide 선례로 v2 명시 정의(specialty.js 불변)
  obsidian: 0.9, jade: 0.6,   // ★S5 흑요석(광물 탄력) · 옥(위세재 완만 탄력)
  bronze_tool: 0.7, iron_tool: 0.7,   // ★도구 대체재(청동·철) — tool과 동일 탄력. 누락 시 satiation taper 미발동 → 글럿에도 대장장이 무한 생산(인구당 무한↑) 버그.
  tigerhide: 0.6,   // ★호피(§9 3차) — 위신재(사치 완만 — 부족해도 폭등 대신 프리미엄)
  // 채집물 — 자체 가치 낮음
  fruit: 1.0, vegetable: 1.0, mushroom: 1.0, twig: 0.7, pebble: 0.7,
};

const TRADABLE = Object.keys(ELASTICITY);

// v2 자체 BASE_VALUE override — weapon/tool 만성부족 완화 (BASE 낮춤)
//   원래 v1: weapon=8, tool=5. 너무 anchor가 높아 cap에 박힘.
const BASE_VALUE_V2 = {
  food: 1.0, fish: 1.25, meat: 2.14, cooked_food: 2.0, hide: 2.0,
  herb: 4.0,   // ★약재(§9 2차): 채집 산출 ~15%·호골 — 노동집약 anchor(v1 BASE_VALUE와 동일)
  bone: 1.5, tigerhide: 40,   // ★§9 3차: 뼈(풍부 저가 투입재) · 호피(최고가 위신재 — 희소 0.3/일 사냥 위험이 anchor 근거, v1 동일)
  ramie: 6,   // ★모시(2026-07-13) — 고급 직물 앵커(거친 삼베 hemp 4보다↑·cotton 6급): 저마 방적·표백이 노동집약(한산모시 고증). 산지=고가 수출 특산
  // ★★노동가치 재정합(v1 BASE_VALUE 와 같은 근거 — scripts/test-valuechain.js 참조).
  //   v2 는 v1 대비 무기·도구를 0.625 배로 낮춰 쓰던 이력이 있다(교역 쏠림 억제). 그 비를 유지한다.
  wood: 1.67, stone: 1.67, ore: 1.0,
  tool: 3.0, weapon: 7.5, armor: 7.5,   // v1 12 × 0.625(v2 관행 비)
  bronze_tool: 3.0, iron_tool: 3.0,   // ★도구 대체재(청동·철) — tool과 동일 anchor. satiation 판정용 기준값(누락 시 adj=1 고정→taper 무발동).
  fruit: 1.5, vegetable: 1.5, mushroom: 1.5, twig: 1.0, pebble: 1.0,
  obsidian: 15, jade: 80,   // ★S5 흑요석(예리 교역재, 화살촉·소형칼날) · 옥(위세품 교역재 — 고가). 비교우위 특산.
};

// NPC 1인당 일일 subsistence — 자급 인출량. price-inelastic.
const SUBSISTENCE_PER_NPC = {
  food: 1.0,
  cooked_food: 0.05,
  tool: 0.005,
  // ★무기·갑옷은 *인구당이 아니라 전사(사용자)당* 마모 — tickSubsistence에서 전사 비례 처리.
  //   (옛 weapon/armor 0.002/명: 280명 마을이 0.56/일 소비 > 무기장 생산 → 전사 무장해제 버그)
  // ★주거 수요: 집(한옥)의 건축·보수에 목재·석재 소비. 인구↑(새 집)·유지보수로 지속 수요.
  //   효과: ① 숲 마을 → 나무꾼 수요 ② 석재 시장 형성 → 산골 마을이 석재 수출로 식량 구입(채광 자립).
  wood: 0.05,
  // ★[2026-08-02e ①] 이 0.04 는 **주거 본체**(집·구들·바닥) 몫이다. 담장·숫돌 등 부대 시설 0.02 는
  //   v1 `STONE_MAINT_PC` 가 따로 적는다 — 총 실물 소비 0.06/인/일. **분할 기재이지 이중 기재가 아니다.**
  //   합치는 실험(STONE_MAINT_UNIFY=1 → 여기 0.06 · v1 0)은 3시드 실측이 **기각**했다(인구 −11%):
  //   총 소비는 같은데 가격·부패 목표(subs×30)가 50% 뛰어 노동이 석재로 쏠린다. 손잡이는 남긴다.
  stone: (typeof process !== 'undefined' && process.env && process.env.STONE_MAINT_UNIFY === '1') ? 0.06 : 0.04,
  // ★의류 소비계층(H): 가죽·모피·직물을 마모분 소비 → 이 재화들이 *진짜 수요*(의류)를 가짐.
  //   기존엔 사냥 부산물이 "대리수요"로만 거래됐는데, 이제 명시적 소비 니즈가 demand를 근거지음.
  hide: 0.012, leather: 0.008, fur: 0.005, cotton: 0.006, flax: 0.005, hemp: 0.004,
};

// 거래 수수료 — 양쪽 끝에 부과. 3%면 spread 6%. 사용자 의도: default 3%.
const TAU = 0.03;

// 운반비 — 거리당. 1000 거리당 2.0 가치 손실 (iceberg).
const TRANSPORT_COST_PER_1000 = 2.0;
// ═══ ★★[2026-08-02e ⑥ 말 사역 — 시대 뒤에서 미리 완성] ═════════════════════
//   재민 회부 ⑦의 답. "말 시대가 열리는 날 소비처가 없으면 길들이기만 하는 짐승이 된다."
//   ★소비처를 **교역 EV 안**에 둔다 — `netExportValue`·발주 EV 가 이미 운반비 항을 갖고 있으므로,
//     말은 그 항을 낮추는 것으로 자연 편입된다. 새 재화도, 새 직업도, 새 상태도 만들지 않는다.
//     (고증: 등짐 → 바리·수레. 육상 운반비 하락이 말 보급의 실체다.)
//   ★★열기 전 영향은 **정확히 0 이어야 한다**(배치 1 원칙 — 시대 열기 전후 흥망 분리).
//     그래서 닫힌 시대의 반환값은 곱셈 항등원 `1` 이다: IEEE 에서 `x * 1 === x` 라 **비트 동일**이다.
//     (0.999 같은 '거의 1'을 쓰면 그 순간 궤적이 갈린다 — era-rehearsal 이 그걸 잡는다.)
const HORSE_HAUL_MUL = 0.62;   // 말 보급 후 육상 운반비 배수(등짐 대비 바리·수레). 시대가 열려야 적용.
let _eraModV2;
function _eraV2() { if (_eraModV2 === undefined) { try { _eraModV2 = require('../server/era'); } catch (e) { _eraModV2 = null; } } return _eraModV2; }
function haulMul() {
  const E = _eraV2();
  if (!E || !E.canTame) return 1;
  try { return E.canTame('horse') ? HORSE_HAUL_MUL : 1; } catch (e) { return 1; }
}

// 행상 carry capacity — 한 번에 N단위
const CARGO_PER_TRIP = 100;   // ★처리량 ↑(50→100): 차익거래가 실제로 가격을 청산하도록(LOP 개선). 가격피드백이 과수출 방지.

// v2 r8: 가격 cap 사실상 제거 — 자연 시장 청산.
//   진짜 부족 = ∞에 가까이 가능. 잉여 = ~0.
//   안전장치는 cap이 아니라 carry capacity + stock 비례 부패율로.
const PRICE_ADJ_MIN = 0.01;   // 100배까지 싸짐 (잉여 신호)
const PRICE_ADJ_MAX = 1000;   // 사실상 풀림 (부족 신호 자유)

// === 마을 평균 효용 가중치 (Cobb-Douglas 풍의 α[r]) ===
//   target 계산에 사용. 가중치 높은 자원 = 마을이 더 비축하려 함 → 가격 시그널 강함.
// v2 r13: 영토 확장 자원 (food/wood/stone) utility ↑ — 시장 수요 정합.
//   고대 도시의 자본재 (개간·관개·성벽) 수요 반영.
const UTILITY_WEIGHT = {
  food: 1.5, cooked_food: 0.4, fish: 0.6, meat: 0.6,
  // 유용재 효용(원래값). 철은 야금투입이라 적당히. (부산물 fur·cotton·통나무 등은 의류·직물·건축 대리수요로 정당 → 유지)
  tool: 0.5, weapon: 0.3, armor: 0.3, hide: 0.2, herb: 0.3,   // ★약재: 실수요(요양 단축+일상 복용) — target ~0.5/인, maxAdj ~40
  bone: 0.25, tigerhide: 0.3,   // ★§9 3차: 뼈=저효용 투입재(specialty 0.4를 명시 대체 — 풍부재 과대 target 방지) · 호피=위신 실수요(maxAdj ~40)
  ramie: 0.05,   // ★모시(2026-07-13) — 순수 flow-EMA 수요재: buffer=N×util×1.2를 최소화(0.24N→0.06N). util 0.2는 전 마을에 0.24N 보유수요→비생산 마을이 모시를 *수입*(식량 구매력 소모)→신선 짝비교 s505 605→19 붕괴(식량 드레인)의 진범. 모시는 잉여 산지가 짜서 *수출*하는 고급 직물이지 만인이 쟁여두는 재화 아님 — 수요는 재봉 _cons(flowT)만
  wood: 0.9, stone: 0.7, ore: 0.3, iron: 0.4, iron_tool: 0.5,
  copper: 0.45, tin: 0.55, bronze_tool: 0.6,   // ★청동 투입재(구리·주석)에 실수요. 주석이 희소해 더 높게.
  fruit: 0.1, vegetable: 0.1, mushroom: 0.1, twig: 0.05, pebble: 0.05,
  obsidian: 0.35, jade: 0.4,   // ★S5 흑요석(화살촉·소형칼날 실수요) · 옥(위세재 — ORNAMENTAL LUX_TARGET_PC가 수요 부여)
};
// ★순수 장식재 — use-value 없음(못 먹고 못 만듦). 화폐/위신재 모델링 전엔 수요 0에 가깝게(가짜 수요 제거).
//   (예외적으로 LUX_TARGET_PC 목표 보유 수요는 있음 — 아래 computeShadowPrices. ★호피(§9 3차)도 이 장식재 프레임에 편입: 마을 내 소비 없음·교역 전용)
//   ★iron_relic(철제 위세품, 2026-08-02b) — NPC 는 **생산하지 않는다**. 플레이어가 판 것만 세상에 있다.
//     그래서 세계 재고 = "몇 자루가 세상에 나왔나"이고, 아래 _worldStockOf 유효수요 상한이
//     희소성을 자동으로 값에 반영한다(별도 감쇠 장치를 만들지 않는 이유).
const ORNAMENTAL = { gold: 1, silver: 1, gem: 1, pearl: 1, amber: 1, jade: 1, ivory: 1, tigerhide: 1, iron_relic: 1 };

// === 자원 부패율 — base는 약하게 (인구 영향 X), excess만 강하게 ===
//   stock 비례 부패에서 multiplier가 진짜 일함.
const DECAY_V2 = {
  meat: 0.0005, fish: 0.0005, cooked_food: 0.001,
  fruit: 0.0015, vegetable: 0.0015, mushroom: 0.0015,
  tool: 0.0005, weapon: 0.0002, armor: 0.0002,
  clothes: 0.0008,   // ★의복: 보관 손실(좀·습기) — 착용 마모는 v1 tickVillage의 CLOTH_WEAR가 별도(주 소모)
  hide: 0.001,   // ★생가죽 부패 고증 상향(2026-07-12 수급 감사 v2, 절충 0.0015→0.001): 무두질 없는 생가죽은 빨리 상함 — 0.0005는 호피(애장 0.0003)급 보존이었음(글럿 평형 ~1272/村의 근원). ★0.0015+xm3은 앙상블 기각: s505 623→21 붕괴(널 ×1/1000=636/8 생존 → 칼날 아닌 실기제 — hide 더미가 저축[수출 자본]인 마을의 기반 소각). 잔여 글럿은 무두질(leather 전환, 가치 보존 싱크) 사슬로
  herb: 0.0008,   // ★약재: 말린 약재 — 느린 변질(무한 비축 방지)
  bone: 0.0008, tigerhide: 0.0003,   // ★§9 3차: 뼈=풍화(무한 축적 방지) · 호피=애장 보존(느린 손실 — 세대 단위 상한)
  twig: 0.001, pebble: 0.0002,
  // food도 명시 (v1엔 있지만 v2 자체식 사용)
  food: 0.001,
  // ★비축 손실(과잉 더미) — 돌·광석·나무·곡물은 안 썩는다고 두면 성장기 더미가 영구 잔존.
  //   풍화·흩어짐·도둑·쥐로 *과잉분만* 천천히 손실(excess 가속). 생산은 안 자르니 수출 안전.
  stone: 0.0003, ore: 0.0008, wood: 0.0003,
  obsidian: 0.0003, jade: 0.0002,   // ★S5 석재류 — 거의 안 썩음(과잉 더미만 느린 손실)
  wheat: 0.0012, rice: 0.0012, barley: 0.0012,
  ramie: 0.001,   // ★모시(2026-07-13) — 식물섬유(농산 등가 부패). ramie는 specialty 미등재라 자동 부패 루프 밖 → 명시 필수(누락 시 무부패 무한축적)
  // ★유령 박멸(§9): 비-specialty 산출물의 부패 정의 — 견과는 벌레먹고(구황식량 편입분), 꺾은 꽃은 시듦(산출 중단된 잔존 재고 소진용).
  acorn: 0.001, chestnut: 0.001, walnut: 0.001, wildflower: 0.002,
};

// === Phase 5-5-econ-a: specialty.js 195 자원 통합 ===
//   옛 자원(17종) 호환 유지. 새 자원은 category 따라 elasticity 자동 부여.
try {
  const { RESOURCES: SPECIALTY } = require('../server/specialty');
  for (const [id, r] of Object.entries(SPECIALTY)) {
    if (!(id in ELASTICITY)) {
      // category별 elasticity 자동
      if (r.category === 'agri' || r.category === 'aqua') ELASTICITY[id] = 1.2;
      else if (r.category === 'mineral') ELASTICITY[id] = 0.9;
      else if (r.category === 'gem') ELASTICITY[id] = 0.6;
      else if (r.category === 'spice' || r.category === 'craft') ELASTICITY[id] = 0.7;
      else if (r.category === 'livestock') ELASTICITY[id] = 1.1;
      else if (r.category === 'forest' || r.category === 'forage') ELASTICITY[id] = 1.0;
      else ELASTICITY[id] = 1.0;
      TRADABLE.push(id);
    }
    if (!(id in BASE_VALUE_V2)) BASE_VALUE_V2[id] = r.baseValue || 1;
    if (!(id in UTILITY_WEIGHT)) UTILITY_WEIGHT[id] = r.utility || 0.1;
    // contributes.subsistence 기반 자동 SUBSISTENCE
    if (r.contributes?.subsistence && !(id in SUBSISTENCE_PER_NPC)) {
      SUBSISTENCE_PER_NPC[id] = 0.05 * r.contributes.subsistence;
    }
    // DECAY 자동 — 부패성 자원 (농산물·수산물·꺽채취)
    if (!(id in DECAY_V2)) {
      if (r.category === 'agri' || r.category === 'aqua' || r.category === 'forage') DECAY_V2[id] = 0.001;
      else if (r.category === 'livestock') DECAY_V2[id] = 0.0008;
      else if (r.category === 'spice') DECAY_V2[id] = 0.0002;  // 향신료 보존 잘됨
      else DECAY_V2[id] = 0.0002;
    }
  }
  console.log(`[econ-sim-v2] specialty.js 통합: ${Object.keys(SPECIALTY).length}종 → 총 ${TRADABLE.length} TRADABLE`);
} catch (e) {
  console.warn('[econ-sim-v2] specialty.js 로드 실패 (옛 17종만 사용):', e.message);
}
// ※금 디버그(가치 50000) 제거 — 금은 use-value가 없어 진짜 수요가 없음(사용자 지적).
//   광산촌은 실제 수요재(ore→대장간, stone→주거)로만 자생해야 경제적으로 옳음.

// === 계절 시스템 ===
//   v2 r7: 진폭 축소 — 인구 cycle 진동 완화. 평년 평균 = 1.0 유지.
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const SEASON_MULT = {
  spring: { fertility: 1.10, water: 1.0, game: 1.05, wood: 1.0, stone: 1.0, ore: 1.0 },
  summer: { fertility: 1.0, water: 1.15, game: 1.0, wood: 1.05, stone: 1.0, ore: 1.0 },
  autumn: { fertility: 1.15, water: 0.95, game: 1.0, wood: 1.0, stone: 1.0, ore: 1.0 },
  winter: { fertility: 0.80, water: 0.85, game: 0.90, wood: 0.90, stone: 0.95, ore: 0.95 },
};
function seasonOf(day) {
  const d = day % 365;
  if (d < 90) return 'spring';
  if (d < 180) return 'summer';
  if (d < 270) return 'autumn';
  return 'winter';
}

// === 기온 모델(2026-07-12 — 의복·겨울) ===
//   실축(1셀=1m, 존 1.6km)에서 존 *내부* 기온차는 위도가 아니라 고도가 지배(감률 −6.5℃/km) —
//   위도는 존 단위 상수(zoneLatBase — 북방존은 낮게, 존 생성 시 오버라이드). 사계 위상 정합:
//   최한 = 동절 중간(doy 315; seasonOf winter=270~365) · 연교차 ±annualAmp · 일교차 ±diurnalAmp.
//   econ(일 틱)은 일평균·야간최저만 소비 — 시간 곡선(hourFrac: 0=자정 최저, 0.5=정오 최고)은 생활층(밤낮) 인계용 노출.
const CLIMATE = { zoneLatBase: 12, annualAmp: 12, diurnalAmp: 5, lapsePerKm: 6.5, coldRef: 5 };
function temperatureAt(day, hourFrac, elevKm) {
  const doy = ((day % 365) + 365) % 365;
  const annual = -Math.cos(2 * Math.PI * (doy - 315) / 365);   // doy315=−1(최한) · doy~132=+1(최난)
  const diurnal = hourFrac == null ? 0 : -Math.cos(2 * Math.PI * hourFrac);
  return CLIMATE.zoneLatBase + CLIMATE.annualAmp * annual + CLIMATE.diurnalAmp * diurnal - CLIMATE.lapsePerKm * (elevKm || 0);
}

// === 이동시간 — 모든 caravan 같은 속도 (NPC_SPEED). 시간 = 거리/속도 (시뮬 1초=1day).
//   평균 마을 거리 ~2500px → 평균 5일. 거리 800~5000 → 시간 자연 결정.
//   사용자 의도: 모든 행상 같은 속도로 걷는 시각.
const NPC_SPEED = 500; // px/sec (= px/시뮬-day)
function travelDaysForDistance(dist) {
  return Math.max(1, Math.round(dist / NPC_SPEED));
}

// 이동 시간 범위 (일) — 거리 무관 3~7일 random (사용자 요청)
const TRAVEL_DAY_MIN = 3;
const TRAVEL_DAY_MAX = 7;

// 거래 사이클
const TRADE_INTERVAL = 3;   // (구 3일 게이트용. 연속교역 전환 후엔 가격캐시 갱신 주기로만 잔존)
// ★교역 동시성 = 여유노동(spare labor)에서 창발 — 하드 %캡·3일게이트 없음.
//   협업·무임금 모델은 1 NPC가 100단위 가치를 날라서 per-NPC 기회비용이 캐러밴 이익에 늘 압도됨
//   → per-NPC 신호로는 동시성 제어 불가(측정 결과 폭주). 대신 "글럿(포만)된 생산능력 = 여유노동"으로 상한.
//   spareCap = N × 포만스로틀 × UTIL. 광석 등 SAT_ALWAYS는 늘 포만 신호 → 식량난 광산촌도 교역 가능.
//   포만스로틀(v._idleFrac) = 1 − 실제생산/잠재생산 (tickVillage에서 누적). UTIL로 안정본 강도(~4%)에 맞춤.
const TRADE_SPARE_UTIL = 0.11;
// ★위기 교역 동원(2026-07-13 실험 K): 식량 적자 마을(surplusEMA.food<0)은 포만 유휴노동(_idleFrac)이
//   ~0이라 spareCap=1로 묶여, 글럿된 자산(가죽 등)을 식량과 바꿀 캐러밴을 못 냄(묶인 재산=Sen 자격 붕괴의 기계적 원인).
//   적자 마을에 한해 유휴노동 밖 노동을 소폭 교역에 동원 — 하단 기회비용 게이트가 각 원정 순이익성을 여전히
//   검증하므로 "살 식량이 근방에 있을 때만" 실발주(지역 흉작이면 헛 원정 자동차단). 자기-차익거래(빠진 시장청산력) 주입.
const CRISIS_TRADE_PC = 0.015;   // 적자 마을 위기 동원 상한 = N×0.015 캐러밴(0.03서 하향 — 과동원 제로섬 마을사망 억제 시도)
const FOOD_PULL_TOL = 0.7;   // ★식량 pull(P2): 위기 마을 목적지 관용 — best 이익의 70% 이상이면 식량 잉여 목적지 우선(랭킹 크기 비왜곡)
const FOOD_CLASSES = { food: 1, fish: 1, meat: 1, cooked_food: 1 };   // ★식량 pull: 대금으로 인정하는 칼로리류
// ★식용 등가 전체 편입(스트레스 시험이 잡은 구멍): 실제 칼로리 순환은 연어·해조·견과 등 구황·해산물로도 돈다(158 유령 해산물).
//   staple 4종만으론 위기 마을이 '연어로 대금 받기'를 못 해 고가치 신상품에 생명선을 내줌(synthC 스트레스 505 21/3촌 실측).
//   단일 진실 = v1.FORAGE_FOOD_FACTOR(식량 환산과 동일 집합 — 밀·보리·쌀은 비식용 품종재라 자동 제외).
for (const _fk in (v1.FORAGE_FOOD_FACTOR || {})) FOOD_CLASSES[_fk] = 1;
// ★위신재(사치) 수요 — 장식재의 use-value는 물리소비가 아니라 위신·심리(positional good). 1인당 목표 보유로 수요 부여.
//   없는 마을은 교역으로 수입, 광산촌(부산물로 쟁여둠)은 잉여 수출 → 죽어있던 장식교역이 살아나고 광산촌 수입원 다각화.
// ★위신재 지불의사 상한 — 기준가의 이 배수까지만 낸다.
//   근거: 위신재는 **필수재가 아니다.** 없어도 마을이 안 망하므로 수요가 가격에 탄력적이다.
//   지금까지는 식량과 같은 희소도 곱셈을 써서 "없으면 값이 발산"했다(상아 3,185 = 식량의 2,900배).
//   그 위신재가 줄 수 있는 효용에는 천장이 있다(PRESTIGE_MOD_CAP 0.25 · sat 1인당 2개에서 포화) —
//   천장이 있는 효용에 무한한 값을 치르는 건 경제적 오류다.
const LUX_ADJ_MAX = 3.0;
// ★유효수요(effective demand) — **구할 수 없는 것을 목표로 삼지 않는다.**
//   전에는 target 이 오로지 인구 비례였다. 세계에 한 개도 없는 자원(상아 등)도 target 이 붙고
//   stock 은 0(→0.1 바닥)이라 희소도가 발산했다 — 실측 상아 3,184.9 = 같은 마을 식량의 2,900배.
//   경제학적으로 수요는 **실현 가능할 때만 유효**하다. 세계 총공급 중 내 인구 몫이 상한이다.
//   ⚠"공급 0 이면 가격 0" 으로 하면 안 된다 — 그러면 아무도 캘 이유가 없어져 영영 공급이 안 생기는
//     자기실현적 소멸이 된다(실측: 금·은·옥 재고가 전부 0 으로 사라졌다). 가격은 기준가 근처에 두고
//     **목표만** 제한한다. 캘 유인은 남기고 발산만 막는 것이 옳다.
const EFFDEM_SHARE = 1.5;   // 인구 비례 몫의 이 배수까지만 목표로 삼는다
function _worldStockOf(v, r) {
  const w = v._world;
  if (!w || !Array.isArray(w.villages)) return null;    // 월드 문맥 없으면 판단 보류(기존 거동)
  let c = w._effDemCache;
  if (!c || c.day !== w.day) {
    c = w._effDemCache = { day: w.day, stock: {}, pop: 0 };
    for (const u of w.villages) {
      c.pop += (u.npcs && u.npcs.length) || 0;
      const st = u.storage || {};
      for (const k in st) if (st[k] > 0) c.stock[k] = (c.stock[k] || 0) + st[k];
      const pb = u.dailyProductionBuf || {};           // 오늘 생산분도 공급이다(첫 산출 즉시 반영)
      for (const k in pb) if (pb[k] > 0) c.stock[k] = (c.stock[k] || 0) + pb[k] * 30;
    }
  }
  return { stock: c.stock[r] || 0, pop: Math.max(1, c.pop) };
}
const LUX_TARGET_PC = 0.08;   // 1인당 위신재 목표(각 장식재). 이 근처서 만족(체감), 광산촌은 훨씬 위라 수출.
// ★호피(§9 3차) 수출 유보점 = v1 위신 포화점(CAP/W = 0.025/인)×1.2 — 위신 상한을 채우는 만큼만 쥐고 잉여는 교역재(외생 수요는 ORNAMENTAL·LUX_TARGET_PC가 부여).
const TIGERHIDE_KEEP_PC = 1.2 * ((v1.TIGERHIDE_PRESTIGE_CAP && v1.TIGERHIDE_PRESTIGE_W) ? v1.TIGERHIDE_PRESTIGE_CAP / v1.TIGERHIDE_PRESTIGE_W : 0.025);
// ★식량 다양성 수요 — 자체 생산 못 하는 식품군(생선·고기·과일·채소·버섯)은 소량 수입 수요를 가짐.
//   "식량 충분해도 한 가지뿐이면 싼 걸 비싼 다른 식량과 바꿔온다"(사용자). 결핍 시 target↑ → 가격↑ → 교역이 채움.
const VARIETY_FOOD = { fish: 1, meat: 1, fruit: 1, vegetable: 1, mushroom: 1 };
const VARIETY_TARGET_PC = 0.6;   // 자체생산 못 하는 식품군의 1인당 수입 목표(다양성 문턱 0.4 위 — 소비로 깎여도 유지)
// ★청동 희소성: 주석 수출 규칙 — 산지 마을이 전략 비축(자체 청동 독점·위세) 후 얇은 잉여만 수출. 무산지 마을은 만성 주석 부족(청동 편중 유지).
//   keep 크게(1인당) + surplus 얇게 → 소수 교역 마을만 간헐적 청동, 대다수는 석기. TIN_DEPOSIT_RATE·YIELD와 함께 청동무기/명 목표(~0.2) 튜닝 레버.
const TIN_EXPORT_KEEP_PC = 1.2;      // 산지 마을 주석 비축(1인당) — 이만큼 쥐고(자체 청동 병기고 + 위세) 잉여만 수출. 높게=산지 청동 안정+수출 억제(교역 편중 변동↓).
const TIN_EXPORT_SURPLUS_PC = 0.3;   // 이 초과분(1인당)만 수출 후보 — 얇게(전략재 소량 유통). 산지 편차(지리·연결)로 인한 청동 홍수 변동을 억제 → 소수 허브만 청동.
// ★return-glut-cap 배수 — 귀환 마을이 목표재고의 이 배수 이상이면 그 재화는 안 실어옴. 무기(청동검·활)의 과잉 귀환·비축을 차단(청동 수입은 소량만).
const WEAPON_RETURN_GLUT_MULT = 1.3;   // 무기/일반재 공통. 1.3 = 목표(사용자×1.3 등)의 1.3배까지만 허용 → 청동검 소수 수입, 과잉 시 자국 석기로 자급 유도

// 정보 도달 거리 — v1과 동일하게 사용 (createWorld opts.infoRange)

// 약탈 — v1과 같은 식이지만 v2 caravan 구조용으로 재정의
const RAID_BASE = 0.03;
const RAID_PER_100 = 0.04;
const RAID_MAX = 0.5;

// =============================================================================
// 1. shadow price — hyperbolic scarcity
// =============================================================================
// ★동기 계약(2026-07-12): 자원별 산식(target·stock·maxAdj·elast)은 _priceParamsV2(아래 1b. 시장 충격 정산)와
//   동일 유지해야 함 — 수정 시 반드시 양쪽 동기(결정층 가격과 정산층 적분의 일물일가).
function computeShadowPrices(v) {
  const N = v.npcs.length || 1;
  const prices = {};
  // ★자본재(capital goods) 커버리지 — 도구·무기·갑옷은 *소비재가 아니라 내구 자본*.
  //   목표재고 = 사용자 1인당 1개(소비재 버퍼 N×0.5 폐지 — 인구 절반을 무기로 두려던 가짜수요).
  //   • 도구 3종(돌·청동·철)은 *대체재* → 합산 재고로 평가(청동 마을서 돌도구 고갈→가짜 폭등→대장장이 폭주 방지).
  //   • 무기/갑옷 = 전사 1인당 1개(+선제 비축 바닥). 충원되면(coverage≥1) 추가분 가치 ~0 → 가격 바닥 → 쏠림·과잉생산 해소.
  const cnt = v.counts || {};
  let toolDeps = 0;
  for (const j in cnt) { const jd = v1.JOBS[j]; if (jd && jd.toolDependent) toolDeps += cnt[j] || 0; }
  const warN = cnt.warrior || 0;
  const toolStock = (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0);
  const CAP_TARGET = {
    tool: Math.max(1, toolDeps), bronze_tool: Math.max(1, toolDeps), iron_tool: Math.max(1, toolDeps),
    weapon: Math.max(2, warN * 1.2), armor: Math.max(1, warN),   // 무기 바닥2 = 약탈위협 선제비축 시드. (★§9 3차 실측: 사냥꾼 포함 시 t=0 전 마을 무기 희소폭등 → 캐러밴이 식량 대신 무기 쏠림 → 시드7 인구 -36%·마을 소멸 — 활 조달은 가격 신호 아닌 마을 내 무기장 노동(weaponsmithTarget)+시드 재고로)
    clothes: Math.max(2, N * 1.2),   // ★의복(2026-07-12): 1인 1벌+여벌 — 자본재 커버리지(도구 동형)
  };
  const CAP_STOCK = { tool: toolStock, bronze_tool: toolStock, iron_tool: toolStock };  // 도구는 *합산* 재고로 희소도 평가
  for (const r of TRADABLE) {
    const base = BASE_VALUE_V2[r] || 1;
    const elast = ELASTICITY[r] || 1.0;
    // v2 r6.1: target에 효용 가중치 약하게 — 너무 크면 모두 부족 신호로 식량 폭주
    const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
    const util = UTILITY_WEIGHT[r] || 0.1;
    let target, stock;
    if (CAP_TARGET[r] !== undefined) {
      // 자본재: 커버리지 기반(사용자 1인당 1개). 도구는 합산 재고.
      target = CAP_TARGET[r];
      stock = Math.max(0.1, CAP_STOCK[r] !== undefined ? CAP_STOCK[r] : (v.storage[r] || 0));
    } else {
      // ★장식재(위신재)에 진짜 수요 부여 — use-value = 위신·심리(prestige). 1인당 LUX_TARGET_PC 목표.
      //   (옛 N×0.02 = 수요 죽임. 이제 위신재를 없는 마을은 수입하고 광산촌은 잉여 수출)
      // ★flow-EMA target(2026-07-12, CHECKLIST 154 해소): 유령 보유 하한 max(0.5,·) 제거 — 소비재 수요는
      //   실소비 흐름 flowT(=_consEMA×30, v1 _cons 계측 16사이트)가 만든다. 잡화 롱테일(util 0.1)의 가짜 보유
      //   수요 소멸, 실소비 재화(연료·옷감·투입재·식단·봉헌)는 흐름이 target을 정직 견인 — 신규 재화는 소비처에
      //   _cons 한 줄이면 끝(CAP_TARGET·시드·글럿가드·감산 4종 수동 통합 부채 해소).
      //   동기 계약: _priceParamsV2·tickDecay 동일 공식. 분별 프로브(하한 제거 비치명)·A/B 근거 CHECKLIST 참조.
      // ★subs 가드(A/B 실측): SUBSISTENCE_PER_NPC 등재 재화(주식·연료·석재·의류 사슬)는 subs×30이 이미 손튜닝
      //   흐름 target — flowT 중복 적용 시 실측(한랭 연료 등)이 캘리브를 2~3배 덮어써 시장 전체 유보 인플레
      //   (s505 576→17 붕괴 실측). flowT는 손튜닝 없는 롱테일 전용.
      const flowT = SUBSISTENCE_PER_NPC[r] ? 0 : ((v._consEMA || {})[r] || 0) * 30;
      // ★★★[재민 지시 2026-08-01] "모든 기본 비축 목표 없애라"
      //   "전혀 안 쓰는데 최소한의 비축을 위한 수요 때문에 철을 사는 거 아냐..
      //    그걸 완전히 없애도 잘 작동해야 하는 거 아냐?"
      //   맞다. N × util × 1.2 는 **용도와 무관하게 항상 깔리는 보유 수요**였다. 그래서
      //   아무도 안 쓰는 철이 재고 0일 때 "부족 프리미엄"을 받아 구리와 같은 값(5.60)이 됐고,
      //   그 값이 중간재 상한을 통해 원석값을 떠받쳐 광부가 계속 뽑혔다(실측: 철 91% 광맥 마을에 광부 2명).
      //   가격이 "부족하면 비싸다"만 알고 "아무도 안 원한다"를 몰랐던 것 — 직업 선택은 그 거짓말을 정직히 따랐다.
      //   ⇒ 수요는 **실소비 흐름(flowT)**과 생존필수(subs)와 자본재 커버리지(CAP_TARGET)만이 만든다.
      //     안 쓰면 0이고, 플레이어가 철검을 들여와 마을이 쓰기 시작하면 _cons 가 잡혀 저절로 생긴다.
      //   ※장식재(ORNAMENTAL)의 위신 수요는 남긴다 — 그건 '쓰지 않는 재화'가 아니라 보유 자체가 효용이다.
      const buffer = ORNAMENTAL[r] ? N * LUX_TARGET_PC : 0;
      target = Math.max(subs * 30, buffer, flowT);
      // ★식량 다양성 수요 — 자체 생산 못 하는 식품군은 다양성 위해 소량 수입 목표. 자체 생산하면(≥0.05/명) 보너스 없음.
      //   ★식량안보 게이트: 주식(곡물) 25일치 이상일 때만 — 굶는 마을은 다양성보다 생존(주식) 우선(변방 마을 아사 방지).
      if (VARIETY_FOOD[r] && (v.dailyProductionBuf ? (v.dailyProductionBuf[r] || 0) / N : 0) < 0.05
          && (v.storage.food || 0) / N > 25) {
        target = Math.max(target, N * VARIETY_TARGET_PC);
      }
      stock = Math.max(0.1, v.storage[r] || 0);
      // ★선견적 가격(flow 반영): 구조적 식량적자(생산<소비)를 30일 선반영 → 적자 마을은 *초기재고 무관하게* 수입.
      //   재고(stock)만 보면 근시안 — 큰 buffer에 가려 적자가 안 보여 교역이 stock에 휘둘림(경제적 오류).
      //   surplusEMA.food = 자체생산−소비(수입 제외) → 구조적 비교우위 적자를 정확히 포착.
      if (r === 'food' && v.surplusEMA && v.surplusEMA.food < 0) {
        stock = Math.max(0.1, stock + v.surplusEMA.food * 30);
      }
    }
    // ★★[재민 지적] "당장 필요하지 않은데 엄청난 자원을 들여 이상한 걸 사오는 장치가 있지는 않은가"
    //   있었다. 두 겹이었다.
    //   ① **세계에 존재하지도 않는 자원에 수요가 붙어 있었다.** specialty 196종이 전부 TRADABLE 로
    //      들어오는데, 그중 상아(ivory) 같은 건 이 세계의 어떤 직업도 생산하지 않는다. 그런데
    //      target 은 인구 비례로 붙고 stock 은 0(→ 0.1 바닥) 이라 희소도가 발산했다.
    //      실측: 상아 그림자가격 **3,184.9** — 같은 마을 식량 1.09 의 **2,900배**다.
    //      공급이 없어 거래가 성사되지 않았을 뿐, 누가 한 개라도 내놓는 순간 마을이 식량을 쏟아붓는다.
    //      ⇒ **본 적도 없는 것을 원하지 않는다.** 세계 어디에도 공급된 적 없는 자원은 수요가 0이다.
    //   ② 사치재는 웃돈에 상한이 있다 — 굶으면 식량에 전 재산을 내지만 위신재엔 그러지 않는다.
    //      필수재의 희소도 곱셈을 위신재에 그대로 쓰면 "없으면 값이 무한대"가 된다.
    //   ⇒ 목표를 **세계 총공급 중 내 인구 몫**으로 제한한다(위 _worldStockOf 주석 참조).
    const _ws = _worldStockOf(v, r);
    //   ⚠**필수재와 자본재는 제외한다.** 식량은 세계에 없어도 원해야 한다 — 그 절박함이 곧
    //     기근 신호이고 교역을 부른다. 거기에 "구할 수 있는 만큼만 원해라"를 걸면 흉년에
    //     가격이 안 올라 캐러밴이 식량을 안 옮긴다(실측: 삼림 마을 식량가격이 1000 으로 튀며 기근).
    //     제한은 **없어도 죽지 않는 것들**(위신재·잡화 롱테일)에만 건다.
    if (_ws && !SUBSISTENCE_PER_NPC[r] && CAP_TARGET[r] === undefined && !VARIETY_FOOD[r]) {
      target = Math.min(target, Math.max(0.2, _ws.stock * (N / _ws.pop) * EFFDEM_SHARE));
    }
    const scarcity = Math.pow(target / stock, elast);
    // ★효용가중 가격상한: 고효용(식량 util1.5→상한1000)은 격차 자유, 저효용 외래품(util0.1→상한16)은 억제.
    //   외래 부산물이 재고0→550배 폭발해 교역 독식하는 걸 막아 staple(돌·식량) 재분배가 캐러밴을 잡게 함.
    let maxAdj = Math.min(PRICE_ADJ_MAX, 10 * Math.pow(10, util * 2));
    if (ORNAMENTAL[r]) maxAdj = Math.min(maxAdj, LUX_ADJ_MAX);   // ②위신재는 웃돈 상한
    const adj = Math.max(PRICE_ADJ_MIN, Math.min(maxAdj, scarcity));
    prices[r] = base * adj;
  }
  // ★★[재민 지적] "중간재라 불렀나? 그게 오류를 만들지는 않겠지?" — 만들고 있었다.
  //   실측: 원석 그림자가격 **39.81** vs 같은 마을 구리 **0.47**. 원석이 그것으로 만드는 금속보다
  //   85배 비쌌다. 제련이 원석을 소진시키면 원석 재고가 0 이 되고, 희소도(target/stock)가 폭발한다.
  //   그런데 금속은 쌓여서 가격이 바닥이다 — 그러면 "녹여봐야 손해"가 되어 제련이 **영구 정지**한다.
  //   제련이 자기 원료를 비싸게 만들어 자기를 죽이는 악순환이다.
  //   ⇒ 사슬 항등식을 가격에 직접 건다: **중간재는 그것이 될 최종재보다 비쌀 수 없다.**
  //     P(원석) ≤ 제련수율 × P(그 마을 광종의 금속)
  {
    const mix = v1.oreMixOf ? v1.oreMixOf(v) : (v.land && v.land.oreMix);   // ★유효 조성(수입 원석 포함)
    if (prices.ore != null && mix) {
      let mv = 0, tot = 0;
      for (const k in mix) { const q = mix[k]; if (!(q > 0)) continue; tot += q;
        const _id = k === 'jade_raw' ? 'jade' : k;
        // ★시대 게이트 — 못 뽑는 금속(철 등)은 분자에서 뺀다. 분모엔 남긴다(그 몫은 슬래그 = 실손실).
        if (v1._eraMetalKnown && !v1._eraMetalKnown(_id)) continue;
        mv += q * (prices[_id] || 0); }
      if (tot > 0) prices.ore = Math.min(prices.ore, (v1._SMELT_YIELD || 0.33) * (mv / tot));
    }
  }
  return prices;
}

// =============================================================================
// 1b. 시장 충격 정산(price-impact settlement) — 2026-07-12 (b00c9f4 50% 하드캡의 창발 대체)
//   종전 정산은 '그날 스냅샷 flat × 수량' — 대량 거래가 호가를 안 움직여 글럿 마을 곳간 전량
//   매입이 헐값에 가능(시드7 마을7 1862→0, 5f55850 수사). 이제 정산은 재고 함수
//   p(s)=base·clamp(ADJ_MIN, maxAdj, (target/s)^e)의 적분:
//     매수 비용 = ∫[s−Q→s]p(u)du (파고들수록 비쌈) · 매도 수익 = ∫[s→s+Q]p(u)du (덤핑이 가격을 누름)
//   멱법칙+클램프 3구간 piecewise 닫힌형 → O(1)(루프·수치적분 없음). e>1(식량 1.2)은 재고→0에서
//   비용 발산(천장 클램프 구간만 유한·1000×) — 잉여(바닥 클램프 구간)는 헐값에 흐르되 유보 스케일
//   (target 근방)부터 시장이 스스로 방어(창발). 절대 플로어·하드캡 없음(빈곤맵 재분배 생존 —
//   카오스 컨트롤·신선 앙상블 4/4 근거는 CHECKLIST 2026-07-12). 순수 float — 결정론.
//   출발 EV(totalProfit)는 flat+0.95 마진 휴리스틱 유지 — 기대는 근사, 정산은 진실(후속 정합 후보).
// =============================================================================
function _priceParamsV2(v, r) {
  const N = v.npcs.length || 1;
  const cnt = v.counts || {};
  const base = BASE_VALUE_V2[r] || 1;
  const e = ELASTICITY[r] || 1.0;
  const util = UTILITY_WEIGHT[r] || 0.1;
  let target, stock;
  if (r === 'tool' || r === 'bronze_tool' || r === 'iron_tool') {
    let toolDeps = 0;
    for (const j in cnt) { const jd = v1.JOBS[j]; if (jd && jd.toolDependent) toolDeps += cnt[j] || 0; }
    target = Math.max(1, toolDeps);
    stock = Math.max(0.1, (v.storage.tool || 0) + (v.storage.bronze_tool || 0) + (v.storage.iron_tool || 0));
  } else if (r === 'weapon') { target = Math.max(2, (cnt.warrior || 0) * 1.2); stock = Math.max(0.1, v.storage[r] || 0); }
  else if (r === 'armor') { target = Math.max(1, cnt.warrior || 0); stock = Math.max(0.1, v.storage[r] || 0); }
  else if (r === 'clothes') { target = Math.max(2, N * 1.2); stock = Math.max(0.1, v.storage[r] || 0); }   // ★의복(동기 계약: computeShadowPrices CAP_TARGET와 동일)
  else {
    const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
    const flowT = SUBSISTENCE_PER_NPC[r] ? 0 : ((v._consEMA || {})[r] || 0) * 30;   // ★flow-EMA(동기 계약: computeShadowPrices와 동일 공식·subs 가드)
    const buffer = ORNAMENTAL[r] ? N * LUX_TARGET_PC : N * (util * 1.2);
    target = Math.max(subs * 30, buffer, flowT);
    if (VARIETY_FOOD[r] && (v.dailyProductionBuf ? (v.dailyProductionBuf[r] || 0) / N : 0) < 0.05
        && (v.storage.food || 0) / N > 25) target = Math.max(target, N * VARIETY_TARGET_PC);
    stock = Math.max(0.1, v.storage[r] || 0);
    if (r === 'food' && v.surplusEMA && v.surplusEMA.food < 0) stock = Math.max(0.1, stock + v.surplusEMA.food * 30);
  }
  const maxAdj = Math.min(PRICE_ADJ_MAX, 10 * Math.pow(10, util * 2));
  return { base, e, target, sEff: stock, physical: Math.max(0, v.storage[r] || 0), maxAdj };
}
// 가격 3구간 경계(유효재고 좌표): s≤sLo 천장 flat(base·maxAdj) · [sLo,sHi] 멱법칙 k·s^−e · s≥sHi 바닥 flat(base·ADJ_MIN)
function _impactSegs(P) {
  return { sLo: P.target * Math.pow(P.maxAdj, -1 / P.e), sHi: P.target * Math.pow(PRICE_ADJ_MIN, -1 / P.e),
    pLo: P.base * P.maxAdj, pHi: P.base * PRICE_ADJ_MIN, k: P.base * Math.pow(P.target, P.e) };
}
// 부정적분 F(s)=∫[0→s]p(u)du — 연속·순증(구간 경계에서 가격 일치: k·sLo^−e=base·maxAdj, k·sHi^−e=base·ADJ_MIN)
function _impactF(P, S, s) {
  if (s <= 0) return 0;
  if (s <= S.sLo) return S.pLo * s;
  const b = Math.min(s, S.sHi), e = P.e;
  const pw = Math.abs(e - 1) < 1e-9 ? S.k * Math.log(b / S.sLo)
    : S.k * (Math.pow(b, 1 - e) - Math.pow(S.sLo, 1 - e)) / (1 - e);
  return S.pLo * S.sLo + pw + (s > S.sHi ? S.pHi * (s - S.sHi) : 0);
}
// 매수: 예산 C로 재고를 s0→s1까지 파고듦 — F(s1)=F(s0)−C 구간별 닫힌형 역산. 물리 재고 상한.
function _impactBuyV2(v, r, budget) {
  const P = _priceParamsV2(v, r);
  if (!(budget > 0) || P.physical <= 0) return { qty: 0, cost: 0 };
  const S = _impactSegs(P), s0 = P.sEff, F0 = _impactF(P, S, s0);
  const Ft = F0 - budget;
  let s1;
  if (Ft <= 0) s1 = 0;
  else if (Ft <= S.pLo * S.sLo) s1 = Ft / S.pLo;
  else if (Ft <= _impactF(P, S, S.sHi)) {
    const g = Ft - S.pLo * S.sLo, e = P.e;
    s1 = Math.abs(e - 1) < 1e-9 ? S.sLo * Math.exp(g / S.k)
      : Math.pow(Math.pow(S.sLo, 1 - e) + g * (1 - e) / S.k, 1 / (1 - e));
  } else s1 = S.sHi + (Ft - _impactF(P, S, S.sHi)) / S.pHi;
  const qty = Math.min(Math.max(0, s0 - s1), P.physical);
  if (qty <= 0) return { qty: 0, cost: 0 };
  return { qty, cost: F0 - _impactF(P, S, s0 - qty) };
}
// 매도: qty를 시장에 투하 — 수익 = F(s0+qty)−F(s0) < flat×qty. 반드시 재고 가산 '전'에 호출.
function _impactSellV2(v, r, qty) {
  if (!(qty > 0)) return 0;
  const P = _priceParamsV2(v, r), S = _impactSegs(P);
  return _impactF(P, S, P.sEff + qty) - _impactF(P, S, P.sEff);
}

// =============================================================================
// 2. NPC 자급 인출 (subsistence withdrawal) — 매일.
//    v1 tickVillage가 이미 consumeFood로 식량은 처리. 여기선 그 외 자원만.
// =============================================================================
function tickSubsistence(v, day) {
  const N = v.npcs.length;
  for (const [r, perNpc] of Object.entries(SUBSISTENCE_PER_NPC)) {
    if (r === 'food') continue; // v1 tickVillage가 처리
    const need = N * perNpc;
    const have = v.storage[r] || 0;
    const take = Math.min(need, have);
    v.storage[r] = have - take;
    // 부족분은 누락 (NPC는 그 자원 없이 살아감 — 효용 손실로 모델링 가능하지만 단순화)
  }
  // ★무기·갑옷 마모 = 전사(사용자) 비례 — 인구 전체가 아님(내구 자본). 전사 1명당 0.01/일.
  //   대장간 1명(≈0.45/일)이 전사 수십까지 충분히 유지 → 전사 무장 안정.
  //   ★활(§9 3차): 사냥꾼도 무기(활) 마모 — 전투 무기의 절반(0.005/일, 활 수명 ~200일: 일상 손질 전제). 흐름이 있어야 무기장·bone 투입이 1회성으로 안 죽음.
  const warN = v.counts.warrior || 0;
  const huntN2 = v.counts.hunter || 0;
  for (const r of ['weapon', 'armor']) {
    const wear = (r === 'weapon' ? warN + huntN2 * 0.5 : warN) * 0.01;
    const have = v.storage[r] || 0;
    v.storage[r] = Math.max(0, have - Math.min(wear, have));
  }
}

// ★기회비용(개인 단위 + 숙련 반영): 교역 차출 1순위 = 한계가치가 가장 낮은 생산자 NPC.
//   한계가치 = 산출계수(JOBS.base) × land[자원] × (1+레벨×0.05) × 그림자가격.
//   → 글럿 재화 생산자 + *저숙련*일수록 MV 낮음 → 그가 교역 감(명인은 생산에 남음 = 마을 내 비교우위).
const JOB_LAND = { farmer: 'fertility', fisher: 'water', hunter: 'game', lumberjack: 'wood', miner: 'stone' };   // 통일 광부(탐사꾼 통합)
const JOB_OUT  = { farmer: 'food', fisher: 'fish', hunter: 'meat', lumberjack: 'wood', miner: 'stone' };
function lowestProducer(v, prices, day) {
  let best = null, bestMV = Infinity;
  for (const npc of v.npcs) {
    if (npc._tradingUntil && npc._tradingUntil > day) continue;   // 이미 교역 원정 중인 NPC 제외
    const j = npc.currentJob;
    let mv;
    if (j === 'forager') {
      mv = 1.0 * 0.3 * (1 + (npc.skills.foraging || 0) * 0.05) * (prices.vegetable || 1);
    } else {
      const landKey = JOB_LAND[j];
      if (!landKey) continue;   // 비생산직(대장·요리·전사 등)은 교역 차출 대상 아님
      const jd = v1.JOBS[j];
      const skillMul = 1 + (j === 'hunter' ? ((npc.skills.hunting || 0) + (npc.skills.archery || 0)) / 2 : (npc.skills[jd.field] || 0)) * 0.05;   // ★사냥꾼=두 숙련 평균(활+사냥)
      mv = jd.base * (v.land[landKey] || 0) * skillMul * (prices[JOB_OUT[j]] || 1);
    }
    if (mv < bestMV) { bestMV = mv; best = npc; }
  }
  return { npc: best, mv: bestMV };
}
// =============================================================================
// 3. 교역 의사결정 — LOP arbitrage. ★전담 행상 없음: 기본 NPC가 남는 시간(생산<교역일 때) 왕복.
//    "남는 시간" = 원정 이익 > 왕복 일수×기회비용(가장 값싼 생산자 일당)일 때. 매 원정 후 가격 갱신(자기제한).
// =============================================================================
// ★가격표 캐시 — 마을 시세를 TRADE_INTERVAL일마다만 재계산(매일 전 마을 재계산 방지 = 스케일). 결정 마을은 아래서 fresh로 덮음.
function pricesFor(v, day) {
  if (!v._priceCache || (day - (v._priceCacheDay == null ? -99 : v._priceCacheDay)) >= TRADE_INTERVAL) {
    v._priceCache = computeShadowPrices(v);
    v._priceCacheDay = day;
  }
  return v._priceCache;
}
function tickTradeV2(world, day) {
  // ★자정 일괄 폐지 — 매일 실행하되 마을별로 교역일을 분산((day+idx)%INTERVAL). 스파이크·시세 staleness↓.
  // 1) 가격표(캐시 — 이웃 시세 조회용)
  const data = world.villages.map((v, i) => ({
    v, i,
    prices: pricesFor(v, day),
    sent: 0,
  }));
  const byName = new Map(data.map(d => [d.v.name, d]));
  const evToData = new Map(data.map(d => [d.v, d]));   // ev → data 조회(top-20 순회용)

  // 2) 마을마다 merchant 수만큼 caravan 출장 (최소 1, max merchant + 1).
  //    매 caravan마다 새 best 검색 (이미 출장한 자원·목적지 제외).
  //    출발 의사결정에 forward price 위험 마진 (도착 가격 5% 낮을 가정).
  const FORWARD_PRICE_MARGIN = 0.95; // 도착 시 가격 5% 낮을 거라 가정 (forward discount)
  for (const a of data) {
    // ★3일 게이트·동시8%·가치상한 전부 폐지 — 매일 검사, 조건 되면 연속 교역.
    //   실질 제한은 아래 spareCap(여유노동)뿐 — 마을 글럿도에서 창발(하드 %캡 아님).
    if (a.v.isolated && day < a.v.isolatedUntilDay) continue;
    if (a.v._siegeBlock) continue;   // ★[포위 봉쇄 훅] 호스트(전쟁 레이어)가 세우면 이 마을 발 캐러밴 파견 금지 — 미설치(undefined)=무해(기존 경로 그대로)
    if (a.v.npcs.length < 2) continue;
    a.prices = computeShadowPrices(a.v);   // 매일 fresh 시세로 결정(출발-도착 불일치↓)
    a.v._priceCache = a.prices; a.v._priceCacheDay = day;
    const N = a.v.npcs.length;
    const currentlyTrading = a.v.npcs.filter(n => n._tradingUntil && n._tradingUntil > day).length;
    a.v._tradingN = currentlyTrading;   // ★교역 인원 발행 → v1 여가 행복 항이 차감(원정 = 생산도 쉼도 못 함: 여가 기회비용의 실물화)
    // ★동시 교역 상한 = 여유노동(글럿된 생산능력). 하드 %캡 아님 — 마을 글럿도(_idleFrac)에서 창발.
    //   여유 많은 마을(잉여 폭발)은 많이, 빠듯한 마을(다 needed)은 적게 → 자연 자기제한 + 붕괴 방지.
    let spareCap = Math.max(1, Math.floor(N * (a.v._idleFrac || 0) * TRADE_SPARE_UTIL));
    // ★위기 교역 동원(실험 K): 식량 적자 마을은 유휴노동 밖 노동도 소폭 동원(묶인 자산→식량 자기-차익거래).
    //   기회비용 게이트(하단 line ~579)가 순이익성 검증 유지 → 살 식량 없으면(지역 흉작) 실발주 0.
    if (a.v.surplusEMA && a.v.surplusEMA.food < 0) {
      spareCap = Math.max(spareCap, Math.ceil(N * CRISIS_TRADE_PC));
    }
    // ★top-20 최근접 목적지만(마을 정적이라 캐시, 마을수 변할 때만 재계산). 먼 마을은 운반·약탈로 손해라 무해.
    //   ★BFS화(2026-07): 거리 = villageDist(호스트가 _distMatrix 주입 시 지형 최단거리, 아니면 유클리드) 기준 정렬
    //   + 절대 상한 = 행렬 최대 유한거리(≈존 최원격 쌍=대각선 상당)의 절반 — 존 반대편·강 대우회 원정을 후보에서 제외(스케일 프리).
    //   Infinity(연결 불가 쌍 — 섬)는 어떤 유한 상한에도 걸려 항상 제외. 전원 탈락 마을은 최근접 '유한' 1곳만 유지(교역 고아 방지).
    //   행렬 없으면 상한 없음 — 기존 유클리드 top-20 그대로(회귀 무영향). 캐시 무효화는 마을수 변화 + setDistMatrix(_near20=null).
    if (!a.v._near20 || a.v._near20N !== world.villages.length) {
      const sorted = world.villages.filter(x => x !== a.v).sort((p, q) => v1.villageDist(a.v, p) - v1.villageDist(a.v, q));
      const cap = world._distMatrix ? (world._distMatrixMax != null ? world._distMatrixMax : Infinity) * 0.5 : Infinity;
      let near = cap === Infinity ? sorted : sorted.filter(x => v1.villageDist(a.v, x) <= cap);
      if (!near.length && sorted.length && isFinite(v1.villageDist(a.v, sorted[0]))) near = [sorted[0]];
      a.v._near20 = near.slice(0, 20);
      a.v._near20N = world.villages.length;
    }
    const alreadySent = new Set();   // 이 cycle 중복 (자원,목적지) 방지
    let caravansLaunched = 0;

    while (caravansLaunched + currentlyTrading < spareCap) {   // 여유노동까지만. 그 안에서 잉여·기회비용이 추가 제약.
      const lp = lowestProducer(a.v, a.prices, day);   // 현재 가장 값싼 생산자 NPC(이미 교역중인 사람 제외)
      if (!lp.npc) break;   // 보낼 생산자가 없으면 중단
      // 후보 자원 — 잉여. ★식량류(food/fish/meat/cooked_food)는 넉넉히 보유 후 *진짜* 잉여만 수출.
      //   기존엔 15일치만 남겨(< 기근 문턱 30일치) 식량 마을이 수출 후 식량불안 → 비식량 직업 선점. 이젠 36일치 보유.
      const FOODR = { food: 1, fish: 1, meat: 1, cooked_food: 1 };
      const CAPITAL = { tool: 1, bronze_tool: 1, iron_tool: 1, clothes: 1 };   // ★도구=자본재(돌·청동·철). 팔아치우면 생산 0.25×로 붕괴 → 1인당 1개 보유 후 잉여만. ★의복도 자본재(1인 1벌 — 팔면 동상)
      const WEAPONR = { weapon: 1, armor: 1 };      // ★무기·갑옷=전사 장비. 전사 수만큼 보유(팔면 전사 무장해제).
      const warN = (a.v.counts && a.v.counts.warrior) || 0;
      const huntN3 = (a.v.counts && a.v.counts.hunter) || 0;   // ★활(§9 3차): 사냥꾼 활도 마을 장비 — 수출 유보에 포함(마을 활을 팔아치우면 사냥 무장해제)
      const candidates = [];
      for (const r of TRADABLE) {
        const stock = a.v.storage[r] || 0;
        const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
        const buffer = N * 0.8;
        const target = Math.max(subs * 30, buffer);
        let keep, thresh;
        if (FOODR[r]) { keep = target * 1.2; thresh = target * 1.4; }       // 식량: 36일치 보유(>기근30), 42일치 초과만 수출
        else if (CAPITAL[r]) { keep = N * 1.2; thresh = N * 1.5; }          // 도구: 1.2개/명 보유, 1.5개/명 초과만 수출(덤핑 금지)
        else if (r === 'weapon') { keep = Math.max(2, (warN + huntN3) * 1.3); thresh = keep + N * 0.1; }   // ★무기: 전사+사냥꾼(활 — §9 3차) ×1.3 보유 후 잉여만
        else if (WEAPONR[r]) { keep = Math.max(2, warN * 1.3); thresh = keep + N * 0.1; }   // 갑옷: 전사 수×1.3 보유 후 잉여만
        else if (r === 'tigerhide') { keep = Math.max(1, N * TIGERHIDE_KEEP_PC); thresh = Math.max(2, N * TIGERHIDE_KEEP_PC * 1.6); }   // ★호피(§9 3차): 한계 위신 포화점(CAP/W≈0.025/인)×1.2만 쥐고 잉여=순수출재 — 일반칙(0.4N)이면 희소 위신재는 영영 수출 불가. 금·은·보석은 위신 포화(2/인)가 일반칙 위라 기존 규칙 유지
        else if (r === 'tin') { keep = Math.max(3, N * TIN_EXPORT_KEEP_PC); thresh = keep + N * TIN_EXPORT_SURPLUS_PC; }   // ★청동 희소성: 주석=전략재. 산지 마을이 대량 비축(자체 청동 독점 + 위세) 후 얇은 잉여만 수출 → 무산지 마을은 만성 주석 기근(청동 편중 유지, 무산지는 석기)
        else { keep = target * 0.5; thresh = target * 0.8; }                // 그 외: 15일치
        if (stock > thresh) candidates.push({ res: r, surplus: Math.max(1, stock - keep) });
      }
      if (!candidates.length) break;

      // 최고 이익 (자원, 목적지) 검색 — 이미 출장한 조합 제외
      const _crisisA = !!(a.v.surplusEMA && a.v.surplusEMA.food < 0);   // ★식량 pull 게이트(K L488과 동일 신호)
      const _fsMemo = new Map();   // ★P2: 목적지 식량 잉여 여부(4류 중 1이라도 출발게이트 통과) 메모
      const _destHasFood = (bd) => { if (_fsMemo.has(bd)) return _fsMemo.get(bd); const bn = bd.v.npcs.length; let ok = false; for (const fr in FOOD_CLASSES) { const bs = bd.v.storage[fr] || 0; const bt = Math.max((SUBSISTENCE_PER_NPC[fr] || 0) * bn * 30, bn * 0.3); if (bs > bt) { ok = true; break; } } _fsMemo.set(bd, ok); return ok; };
      let best = null, bestF = null;
      for (const cand of candidates) {
        for (const nb of a.v._near20) {   // ★모든 마을 → top-20 근처만
          const b = evToData.get(nb);
          if (!b || a === b) continue;
          if (b.v.isolated && day < b.v.isolatedUntilDay) continue;
          if (b.v._siegeBlock) continue;   // ★[포위 봉쇄 훅] 포위된 마을은 목적지로도 제외(성문 봉쇄 — 들어가는 길이 없음). 미설치=무해
          if ((a.v._grudgeBlock && a.v._grudgeBlock[b.v.name]) || (b.v._grudgeBlock && b.v._grudgeBlock[a.v.name])) continue;   // ★[원한 제재 훅] 불의전 평판 — 원한(>문턱) 상대와 상호 교역 기피(발주·수주 대칭 차단). 호스트(전쟁 레이어)가 일일 발행, 미설치(undefined)=무해
          const key = `${cand.res}->${b.v.name}`;
          if (alreadySent.has(key)) continue;
          const dist = v1.villageDist(a.v, b.v);
          const infoR = world.infoRange || 400;
          if (dist > infoR) continue;
          const pFrom = a.prices[cand.res];
          const pTo = b.prices[cand.res] * FORWARD_PRICE_MARGIN; // 위험 마진
          const N_units = Math.min(cand.surplus, CARGO_PER_TRIP);
          const transportCostPerUnit = (TRANSPORT_COST_PER_1000 * dist / 1000) * haulMul();   // ★말 사역(⑥): 닫힌 시대엔 ×1 = 비트 동일
          // ★도적 길목(§도적): 호스트(지형층)가 '이 마을쌍 경로 30m 내 도적단' 위험을 주입 — econ은 지형을 모름(계약).
          //   상인이 기대손실에 반영 → 위험한 길은 이익↓(기피·호위 강화가 창발). 훅 미설치(서버/단독)면 0 — 기존과 동일.
          const banditX0 = world.banditRouteRisk ? (world.banditRouteRisk(a.v, b.v) || 0) : 0;
          const raidProb = Math.min(RAID_MAX, RAID_BASE + banditX0 + (dist / 100) * (world.raidPer100 || RAID_PER_100));
          let expectedLossRatio = raidProb * 0.5;   // 기존 baseline(경로 위험) — 갱 미상시 유지(회귀 무영향)
          // ★[위험 인지 방어 피드백 — 통합 발주] 경로에 실제 갱이 있으면 손실을 '호위 충분성'으로 재추정.
          //   호위≥격퇴규모(1.5×갱)→repelP≈1(손실↓·교역 유지) · 호위≤갱→repelP≈0(손실↑ → 음수 EV → 자동 포기/기피).
          //   전사의 한계가치=교역손실 감소분이 profitPerUnit에 창발 반영(총비용 항 없이 한계 프레임 유지). 정산(_raidScrum)과 정합.
          //   ※호위 추정은 availW(이 cycle 선행 캐러밴 미차감 — line 648 실배정과 동형 근사). 진성 convoy 배칭은 후속.
          if (world.banditGang) {
            const _g = world.banditGang(a.v, b.v);
            if (_g && _g.n > 0) {
              const _availW = (a.v.counts && a.v.counts.warrior) || 0;
              const _escEst = Math.min(_availW, Math.ceil(_g.n * 1.5));            // line 648 실호위 배정과 동형
              const _repelP = Math.max(0, Math.min(1, (_escEst - _g.n) / Math.max(1, _g.n * 0.5)));   // 갱→0, 1.5×갱→1
              expectedLossRatio = Math.max(expectedLossRatio, (1 - _repelP) * 0.6);   // 격퇴 실패 기대손실(_raidScrum 정산 0.25~0.85 중앙 근사) — baseline 초과분만 채택
            }
          }
          // ★출발 EV는 의도적으로 flat×수량 유지(정산은 적분 — 1b 참조). 2026-07-12 정합 시도 A/B로 기각:
          //   EV를 적분으로 정합하면 체계적 과소 발진(교역 s7 −37%·s101 −60%, s8 pop657→7 붕괴 실측).
          //   원인 — EV는 출발 leg만 계산하고 귀환 leg 차익(도착지 저가 매입)은 미계상인데, flat의 낙관
          //   편향이 그 미계상 가치의 대리물이었음. 편향만 제거하면 순이익 원정이 게이트에서 탈락.
          //   진짜 정합은 '귀환 leg 기대가치 모델링'과 세트(후속 설계 후보) — 그 전까지 기대는 근사, 정산은 진실.
          const revenuePerUnit = pTo * (1 - TAU);
          const costPerUnit = pFrom * (1 + TAU) + transportCostPerUnit;
          const profitPerUnit = revenuePerUnit * (1 - expectedLossRatio) - costPerUnit;
          const totalProfit = profitPerUnit * N_units;
          if (totalProfit <= 0) continue;
          if (!best || totalProfit > best.profit) {
            best = {
              profit: totalProfit, profitPerUnit,
              cand, b, dist, N_units, pFrom, pTo,
              transportCostPerUnit,
              key,
            };
          }
          // ★식량 pull(P2): 식량 잉여 목적지 중 최고 이익 병행 추적(위기 마을 한정)
          if (_crisisA && _destHasFood(b) && (!bestF || totalProfit > bestF.profit)) {
            bestF = { profit: totalProfit, profitPerUnit, cand, b, dist, N_units, pFrom, pTo, transportCostPerUnit, key };
          }
        }
      }
      if (!best) break;
      // ★식량 pull(P2): 위기 마을은 이익 관용범위 내에서 '식량 잉여 목적지' 우선 — 175 전역가중(랭킹 곱)과 달리 크기 비왜곡, 게이트는 실이익.
      if (_crisisA && bestF && bestF !== best && bestF.profit >= best.profit * FOOD_PULL_TOL) best = bestF;
      // ★남는 시간 판정: 원정 이익 > 유효원정일수 × 기회비용일 때만. 아니면 생산이 나으니 중단.
      //   ★유효일수 = 왕복일수 × (1 − 0.5×slack): 마을에 그날 여유(유휴 노동)가 많으면 기회비용↓ → 여유 있는 날 더 감(사용자 요청).
      //   slack은 공간층(lifeLoop)이 낮 유휴 비율로 채움. 빨리감기(텔레포트)엔 유휴 없어 slack=0 → 기존과 동일(회귀 무영향).
      const tripDays = travelDaysForDistance(best.dist) * 2;
      const slack = Math.max(0, Math.min(1, a.v._slack || 0));
      // 동시성은 spareCap(여유노동)이 제한. 여기선 이 원정 1건의 순이익성만 확인(잉여+차익 > 최저생산자 기회비용).
      if (best.profit <= lp.mv * tripDays * (1 - 0.5 * slack)) break;
      alreadySent.add(best.key);
      caravansLaunched++;
      lp.npc._tradingUntil = day + tripDays;   // ★이 저가치·저숙련 NPC가 교역 나감 → 귀환(day+왕복)까지 생산 안 함

      // 출발 — a.v.storage[cand.res] 차감 즉시
      const { cand, b, dist, N_units, pFrom, pTo } = best;
      a.v.storage[cand.res] -= N_units;
      a.sent += N_units * pFrom;
      // ★가치 변동(자기제한): 수출로 재고↓ → 현지 가격↑ → 다음 원정 이익↓ → 차익거래가 균형까지만.
      { const r = cand.res, base = BASE_VALUE_V2[r] || 1, elast = ELASTICITY[r] || 1,
          subs = (SUBSISTENCE_PER_NPC[r] || 0) * N, buf = N * Math.max(0.5, (UTILITY_WEIGHT[r] || 0.1) * 1.2),
          tg = Math.max(subs * 30, buf), st = Math.max(0.1, a.v.storage[r] || 0);
        a.prices[r] = base * Math.max(PRICE_ADJ_MIN, Math.min(PRICE_ADJ_MAX, Math.pow(tg / st, elast))); }

      // 가져갈 자원 결정
      // ※[2026-08-01 기근 반출 게이트 — 시도했다가 **철회**] "기근 마을의 식량은 반출 화물로 못 사간다"를
      //   넣어봤다(농촌22 궤적: 이웃들이 모피 단가 1,170 을 싣고 와 굶는 마을의 마지막 보리를 실어 갔다).
      //   경제학적으로는 옳아 보였지만 3시드 × 800일 A/B 실측이 기각했다:
      //     게이트ON  소멸 11/10/12 · 인구 1051/242/525   (시드7 에선 세계 전체가 목 졸림)
      //     게이트OFF 소멸  6/14/15 · 인구 1023/556/510
      //   체계적 이득 없음 — 좀비 마을(2~7명 왕복)은 칼날 평형이라 어떤 개입이든 시드 분산에 묻힌다.
      //   진짜 원인은 교역이 아니라 **시딩**이다: 죽는 마을들은 돌·나무 바닥(0.25/0.45) 땅에 심겨
      //   태어날 때부터 식량환산이 기근선 아래다(371 < 22명×30). 처방은 상류(배치·초기 부존)에 있고
      //   그건 설계 판단이라 회부(회부_마을소멸_시딩.md). 여기는 원래대로 둔다.
      let bestReturnRes = null, bestReturnRatio = 0;
      // ★식량 pull(P1): 위기 마을의 귀환재(=대금)는 식량류 1차 콘테스트, 게이트 못 넘으면 전체 폴백.
      for (const _foodOnly of (_crisisA ? [true, false] : [false])) {
      for (const r of TRADABLE) {
        if (_foodOnly && !FOOD_CLASSES[r]) continue;
        if (r === cand.res) continue;
        // ★A(수입쪽)가 이미 그 재화 글럿이면 수입 안 함 — 수요 없는 걸 계속 실어와 무한 누적(돌 덤핑)되는 것 방지.
        //   연속교역으로 거래가 잦아지면 최저가 이웃에서 잉여를 계속 끌어와 쌓이므로, 자기 목표재고 넘으면 후보 제외.
        const aSubs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
        let aTarget = Math.max(aSubs * 30, N * Math.max(0.5, (UTILITY_WEIGHT[r] || 0.1) * 1.2));
        // ★무기·갑옷 자본재 목표=사용자(전사+사냥꾼)×1.3 — 일반칙(N×0.5)은 전사 적은 마을서 과대 → 청동검 과잉 귀환 허용하던 원인.
        if (r === 'weapon') aTarget = Math.max(2, (((a.v.counts && a.v.counts.warrior) || 0) + ((a.v.counts && a.v.counts.hunter) || 0)) * 1.3);
        else if (r === 'armor') aTarget = Math.max(1, ((a.v.counts && a.v.counts.warrior) || 0) * 1.3);
        if ((a.v.storage[r] || 0) >= aTarget * WEAPON_RETURN_GLUT_MULT) continue;   // ★return-glut-cap: 무기는 사용자×1.3×배수 넘으면 안 실어옴(청동검 소량 수입). 그 외 극단 글럿 차단
        const bStock = b.v.storage[r] || 0;
        const bSubs = (SUBSISTENCE_PER_NPC[r] || 0) * b.v.npcs.length;
        const bTarget = Math.max(bSubs * 30, b.v.npcs.length * 0.3);
        if (bStock <= bTarget * 1.0) continue;
        const ratio = (a.prices[r] || 1) / (b.prices[r] || 1);
        if (ratio > bestReturnRatio) {
          bestReturnRatio = ratio;
          bestReturnRes = r;
        }
      }
      if (bestReturnRes) break;
      }

      // 호위 — 화물량 비례. merchant 본인은 caravan에 동행 가정 (시뮬은 마을 평균)
      //   ★도적 위험 학습(§도적): 호스트가 관측 피해로 채우는 v._banditRisk(EMA, huntRisk 동형 0~0.6) → 호위 요청 가중
      //   → 전사 수요·1인1무기 게이트로 무기 수요 연쇄. 미설치면 ×1(기존과 동일).
      let requested = Math.ceil((N_units / 20) * (1 + 2 * Math.min(0.6, a.v._banditRisk || 0)));
      // ★[convoy — 위험 경로 호위 pooling] 길목에 실제 갱 있으면 호위를 격퇴 규모(갱×1.5)로 뭉쳐 보냄(각개격파 대신 대상단). 전사 수에 캡 — 부족하면 warriorTarget이 모집(피드백).
      const _gRoute = world.banditGang ? world.banditGang(a.v, b.v) : null;
      if (_gRoute && _gRoute.n > 0) requested = Math.max(requested, Math.ceil(_gRoute.n * 1.5));
      const escort = Math.min((a.v.counts && a.v.counts.warrior) || 0, requested);
      const travelDays = travelDaysForDistance(dist);

      world._caravanIdCounter = (world._caravanIdCounter || 0) + 1;
      world.caravans.push({
        id: world._caravanIdCounter,  // 재routing 추적용 (zone 시각화 매핑)
        trader: lp.npc,               // ★교역 나간 NPC — 도적에게 죽으면 마을서 제거
        from: a.v, to: b.v,
        giveRes: cand.res, giveAmt: N_units,
        pFrom_at_depart: pFrom, pTo_at_depart: pTo,
        returnRes: bestReturnRes,
        distance: dist, escort,
        departDay: day,
        arriveDay: day + travelDays,
        returnArriveDay: day + travelDays * 2,
        state: 'outbound',
        travelDays,
      });

      if (a.v.tradeStats) {
        a.v.tradeStats.caravansSent++;
        a.v.tradeStats.cargoSent += N_units;
        const eb = a.v.tradeStats.exportBy || (a.v.tradeStats.exportBy = {});
        eb[cand.res] = (eb[cand.res] || 0) + N_units;   // ★자원별 수출량(감사용) — 광산마을이 뭘 팔아 식량 사는지 진단
      }
    } // while
  } // for (const a of data)
}

// ★도적에게 행상이 살해될 확률(약탈이 일어났을 때). 호위·무기·갑옷이 크게 경감.
const DEATH_ON_RAID = 0.4;
//   교역 나간 그 NPC를 마을에서 제거(사망). 들고 있던 화물도 전손.
function killTrader(c, v) {
  const t = c.trader;
  if (t && v.npcs) {
    const i = v.npcs.indexOf(t);
    if (i >= 0) { v.npcs.splice(i, 1); if (v.counts) v.counts[t.currentJob] = Math.max(0, (v.counts[t.currentJob] || 0) - 1); }
  }
  if (v.tradeStats) v.tradeStats.tradersKilled = (v.tradeStats.tradersKilled || 0) + 1;
  c._done = true; c._abandoned = true;
}
// 약탈 시 사망 판정 — 호위(전사)·무기·갑옷 readiness가 줄임. 죽으면 true. (★구 추상 경로 — de-abstract 후 미사용, 정의만 보존)
function raidKills(c, escort, wReady, aReady, srand) {
  const reduce = Math.min(0.85, Math.sqrt(escort) * 0.18 + wReady * 0.12 + aReady * 0.12);
  return srand() < DEATH_ON_RAID * (1 - reduce);
}
// ★[de-abstract] 약탈 = per-entity 실전투(주사위 제거). 호위 전사 + 상인 vs 도적 갱 — hp100·atk=10+무기×0.2·Lanchester.
//   조우 여부는 호스트 banditGang(기하: 길목 실재 갱)이 정하고, 결과는 이 엔티티 대결이 정한다. 랜덤은 표적선정뿐(승패 아님).
function _escAtk(v) { return 10 + Math.round((((v && v._weapQ) || 0.42)) * 20); }   // 마을 무기품질 → 호위 근접 atk
function _raidScrum(escN, escAtk, gangN) {
  const FLEE = 0.35, bA = 19, A = [], B = [];   // ★FLEE=이탈 문턱: 시작 인원 35% 밑으로 떨어진 측은 전멸 전 도주(궤주 효과 — battle-core 없이 per-entity). bA=도적 스킬3 atk
  for (let i = 0; i < Math.max(0, escN | 0); i++) A.push({ h: 100, w: true });   // 호위 전사
  A.push({ h: 100, w: false });   // 상인 1(마지막 원소)
  for (let i = 0; i < Math.max(1, gangN | 0); i++) B.push(100);   // 갱원
  const startA = A.length, startB = B.length;
  const live = (arr, hp) => { const o = []; for (let i = 0; i < arr.length; i++) if ((hp ? arr[i] : arr[i].h) > 0) o.push(i); return o; };
  let escBroke = false, banBroke = false;
  for (let r = 0; r < 400; r++) {
    const aL = live(A, 0), bL = live(B, 1);
    if (!aL.length) { escBroke = true; break; } if (!bL.length) { banBroke = true; break; }
    if (aL.length <= startA * FLEE) { escBroke = true; break; }   // 호위 붕괴 → 도주(전멸 전 이탈)
    if (bL.length <= startB * FLEE) { banBroke = true; break; }   // 도적 붕괴 → 도주
    const dA = A.map(() => 0), dB = B.map(() => 0);
    for (const i of aL) dB[bL[(v1.srand() * bL.length) | 0]] += (A[i].w ? escAtk : 10);
    for (const i of bL) dA[aL[(v1.srand() * aL.length) | 0]] += bA;
    for (let i = 0; i < A.length; i++) if (A[i].h > 0) A[i].h -= dA[i];
    for (let i = 0; i < B.length; i++) if (B[i] > 0) B[i] -= dB[i];
  }
  const banditsKilled = startB - B.filter(h => h > 0).length;
  const escKilled = A.filter(u => u.w && u.h <= 0).length;   // 죽은 호위(도주 생존 제외)
  const traderDead = A[A.length - 1].h <= 0;   // 상인(마지막) 사망 여부
  return { repel: banBroke && !escBroke, banditsKilled, escKilled, traderDead, escStart: Math.max(0, escN | 0) };
}
// 호위 전사 사상 → 마을 전사 실제 감소(엔티티 상호작용 반영)
function _killWarriors(v, n) {
  if (!v.npcs || n <= 0) return;
  for (let z = 0; z < n; z++) {
    let idx = -1; for (let i = 0; i < v.npcs.length; i++) if (v.npcs[i].currentJob === 'warrior') { idx = i; break; }
    if (idx < 0) break; v.npcs.splice(idx, 1); if (v.counts) v.counts.warrior = Math.max(0, (v.counts.warrior || 0) - 1);
  }
}
// =============================================================================
// 4. tickCaravans v2 — 도착 시 거래 + 양쪽 수수료. 귀환 시 받은 자원 입금.
// =============================================================================
function tickCaravansV2(world, day) {
  if (!world.caravans || !world.caravans.length) return;
  for (const c of world.caravans) {
    if (c._done) continue;

    if (c.state === 'outbound' && day >= c.arriveDay) {
      // ★[de-abstract] 약탈 (가는 길) = per-entity 실전투(주사위 제거): 길목에 실제 갱 있으면 호위+상인 vs 갱 라운드 스크럼
      const gangO = world.banditGang ? world.banditGang(c.from, c.to) : null;
      let outboundLoss = 0;
      if (gangO && gangO.n > 0) {
        const R = _raidScrum(c.escort, _escAtk(c.from), gangO.n);
        gangO.n = Math.max(0, gangO.n - R.banditsKilled);   // 도적 사상 반영(엔티티 대결 결과)
        if (R.escKilled > 0) _killWarriors(c.from, R.escKilled);   // 죽은 호위만 마을 전사 감소(도주 생존 제외)
        if (!R.repel) {   // 호위 붕괴
          if (c.from.tradeStats) c.from.tradeStats.caravansRaided++;
          if (R.traderDead) {   // 상인까지 사망 → 화물 전손·교역 종료
            outboundLoss = 1;
            if (c.from.tradeStats) c.from.tradeStats.cargoLost += c.giveAmt;
            if (world.onBanditLoot) world.onBanditLoot(c.from, c.to, c.giveRes, c.giveAmt, day);
            killTrader(c, c.from);
          } else {   // ★상인 도주 → 사상 비례 부분 약탈만, 남은 화물로 감축 배송(전손 아님)
            outboundLoss = Math.min(0.85, 0.25 + 0.5 * Math.min(1, R.escKilled / Math.max(1, R.escStart + 1)));
            const _loot = c.giveAmt * outboundLoss;
            if (c.from.tradeStats) c.from.tradeStats.cargoLost += _loot;
            if (world.onBanditLoot && _loot > 0) world.onBanditLoot(c.from, c.to, c.giveRes, _loot, day);
          }
        } else if (c.from.tradeStats) { c.from.tradeStats.banditsRepelled = (c.from.tradeStats.banditsRepelled || 0) + 1; }   // 격퇴
      }
      if (c._done) continue;   // 행상 사망 → 이 캐러밴 종료
      const deliveredGive = c.giveAmt * (1 - outboundLoss);

      // 도착 마을 현재 가격으로 매도 검토
      const pricesTo = computeShadowPrices(c.to);
      const pricesFrom = computeShadowPrices(c.from);
      const pTo = pricesTo[c.giveRes] || 1;
      { const A = world._tradeAudit || (world._tradeAudit = { n: 0, rs: [], bail: 0, reroute: 0 });   // ★교역 가격변동 감사(상비): 도착 실현가/출발 예상가
        A.n++; const r0 = c.pTo_at_depart > 0 ? pTo / c.pTo_at_depart : 1; if (A.rs.length < 8000) A.rs.push(+r0.toFixed(3)); }

      // ====== 도착 시 의사결정: 매도 vs 재routing vs 빈손 귀환 ======
      const expectedRevenue = deliveredGive * pTo * (1 - TAU);
      const sunkCost = c.giveAmt * c.pFrom_at_depart; // 출발 시 가치
      const rerouted = c._rerouted || 0;

      // 손해가 너무 크면 (수익 < 출발 가치의 50%) 재routing 또는 빈손 귀환.
      // 단 재routing 최대 2회 chain 제한 (무한 cascade 방지).
      if (expectedRevenue < sunkCost * 0.5 && rerouted < 2) {
        if (world._tradeAudit) world._tradeAudit.bail++;
        // 1) 다른 마을 검색 — c.to·c.from 제외, 거리 안에서 best
        let bestAlt = null;
        for (const b of world.villages) {
          if (b === c.to || b === c.from) continue;
          if (b.isolated && day < b.isolatedUntilDay) continue;
          if (b._siegeBlock) continue;   // ★[포위 봉쇄 훅] 재routing 목적지에서도 포위 마을 제외. 미설치=무해
          if ((c.from && c.from._grudgeBlock && c.from._grudgeBlock[b.name]) || (b._grudgeBlock && c.from && b._grudgeBlock[c.from.name])) continue;   // ★[원한 제재 훅] 재routing 목적지도 원한쌍 회피(발주 마을 기준 대칭). 미설치=무해
          const distFromHere = v1.villageDist(c.to, b);
          const infoR = world.infoRange || 400;
          if (distFromHere > infoR) continue;
          const altPrices = computeShadowPrices(b);
          const altPto = altPrices[c.giveRes] || 0;
          const altRev = deliveredGive * altPto * (1 - TAU);
          const extraTransport = (TRANSPORT_COST_PER_1000 * distFromHere / 1000) * deliveredGive;
          const altNet = altRev - extraTransport;
          if (altNet > expectedRevenue * 1.3 && (!bestAlt || altNet > bestAlt.netRev)) {
            bestAlt = { v: b, netRev: altNet, dist: distFromHere };
          }
        }
        if (bestAlt) {
          if (world._tradeAudit) world._tradeAudit.reroute++;
          // ✈️ 재routing — 새 마을로 추가 출장
          const extraDays = travelDaysForDistance(bestAlt.dist);
          c.to = bestAlt.v;
          c.arriveDay = day + extraDays;
          c.distance = bestAlt.dist;
          // 귀환 거리도 새로 계산
          c.returnArriveDay = c.arriveDay + travelDaysForDistance(v1.villageDist(bestAlt.v, c.from));
          c._rerouted = rerouted + 1;
          c.giveAmt = deliveredGive; // 약탈 손실 반영해서 실제 남은 양
          world.tradeLog.push({
            day, from: c.from.name, to: c.to.name,
            sent: { res: c.giveRes, amt: +deliveredGive.toFixed(2), pAtFrom: +c.pFrom_at_depart.toFixed(2), pAtTo: +pTo.toFixed(2) },
            bought: null,
            distance: +c.distance.toFixed(0),
            escort: c.escort, raided: outboundLoss > 0,
            travelDays: extraDays,
            rerouted: true, note: `재routing → ${bestAlt.v.name}`,
          });
          continue; // 재routing — 다음 caravan 처리
        }
        // 2) 대안 없음 → 빈손 귀환 (자원 보존)
        c._returningRes = c.giveRes;
        c._returningAmt = deliveredGive;
        c._abandoned = true;
        c.state = 'inbound';
        c.distance = v1.villageDist(c.to, c.from); // 귀환 거리
        c.returnArriveDay = day + travelDaysForDistance(c.distance);
        world.tradeLog.push({
          day, from: c.from.name, to: c.to.name,
          sent: { res: c.giveRes, amt: +deliveredGive.toFixed(2), pAtFrom: +c.pFrom_at_depart.toFixed(2), pAtTo: +pTo.toFixed(2) },
          bought: null,
          distance: +c.distance.toFixed(0),
          escort: c.escort, raided: outboundLoss > 0,
          travelDays: c.travelDays,
          abandoned: true, note: '빈손 귀환',
        });
        continue;
      }

      // ====== 평소: 매도·매수·복귀 ======
      // ★시장 충격 정산(2026-07-12): 매도 수익 = ∫p(s)ds(재고 증가 방향) — 대량 투하는 가격을 스스로
      //   누름(종전 flat deliveredGive×pTo는 호가 불변 가정 → 소시장 덤핑 과대수익). 재고 가산 '전' 계산.
      //   pTo는 결정·로그용 스냅샷으로 유지.
      const grossCredit = _impactSellV2(c.to, c.giveRes, deliveredGive);
      // 도착 마을 chest에 들어옴 (거래 후)
      // ★★[2026-08-02b] 원석이면 **출발 마을의 조성**을 함께 싣는다 — 광석은 실어 와도 그 광석이다.
      //   폴드는 재고 가산 **전**에(기존 재고량이 가중치라 순서가 의미를 갖는다).
      if (c.giveRes === 'ore' && v1.foldOreMix) v1.foldOreMix(c.to, c.to.storage.ore || 0, deliveredGive, v1.oreMixOf(c.from));
      c.to.storage[c.giveRes] = (c.to.storage[c.giveRes] || 0) + deliveredGive;
      const taxTo = grossCredit * TAU;
      const netCreditAfterArrival = grossCredit - taxTo;
      // 도착 마을 treasury (자원으로 누적 X — 회계가치만 합산해 numeric treasury)
      c.to.treasury._cash = (c.to.treasury._cash || 0) + taxTo;

      // 가져올 자원 결정 — 출발시 후보 또는 새로 best
      // ★return-glut-cap(청동 희소성 검증 항목): 귀환 마을(c.from)이 이미 그 재화 글럿이면 실어오지 않음 — 출발 leg(L474)엔 있으나
      //   재선택(returnRes 무효 시 best 재탐색)엔 없어 무기(청동검·활)가 무한 귀환·누적하던 누수(측정: 나 5전사에 무기 121 과잉비축). 출발 leg와 동일 규칙 적용.
      const _fromN = c.from.npcs.length || 1;
      const _returnGlutted = (r) => {
        const subs = (SUBSISTENCE_PER_NPC[r] || 0) * _fromN;
        let target = Math.max(subs * 30, _fromN * Math.max(0.5, (UTILITY_WEIGHT[r] || 0.1) * 1.2));
        // ★무기·갑옷은 자본재 — 목표=사용자(전사+사냥꾼)×1.3(활 포함). 일반칙(N×0.5)은 전사 적은 마을서 과대 → 무기 과잉비축 허용하던 원인.
        if (r === 'weapon') target = Math.max(2, ((c.from.counts && c.from.counts.warrior || 0) + (c.from.counts && c.from.counts.hunter || 0)) * 1.3);
        else if (r === 'armor') target = Math.max(1, (c.from.counts && c.from.counts.warrior || 0) * 1.3);
        return (c.from.storage[r] || 0) >= target * WEAPON_RETURN_GLUT_MULT;
      };
      let returnRes = c.returnRes;
      // ★식량 pull(P1b): 위기 발주촌은 도착 시 대금을 식량류로 전환 시도 — 출발 게이트(잉여 30일치)에 막혔어도 도착지 실재(>1)하면 산다.
      if (c.from.surplusEMA && c.from.surplusEMA.food < 0 && !(returnRes && FOOD_CLASSES[returnRes])) {
        let _bfR = null, _bfRatio = 0;
        for (const r in FOOD_CLASSES) {
          if (r === c.giveRes) continue;
          if (!((c.to.storage[r] || 0) > 1)) continue;
          if (_returnGlutted(r)) continue;
          const ratio = (pricesFrom[r] || 1) / (pricesTo[r] || 1);
          if (ratio > _bfRatio) { _bfRatio = ratio; _bfR = r; }
        }
        if (_bfR) returnRes = _bfR;
      }
      if (!returnRes || !((c.to.storage[returnRes] || 0) > 1) || _returnGlutted(returnRes)) {
        // 다시 best 찾기 — 귀환 마을 글럿 재화는 제외
        let bestR = null, bestRatio = 0;
        for (const r of TRADABLE) {
          if (r === c.giveRes) continue;
          const bStock = c.to.storage[r] || 0;
          if (bStock <= 1) continue;
          if (_returnGlutted(r)) continue;   // ★return-glut-cap
          const ratio = (pricesFrom[r] || 1) / (pricesTo[r] || 1);
          if (ratio > bestRatio) { bestRatio = ratio; bestR = r; }
        }
        returnRes = bestR;
      }
      // ★pull 계측(#26 — 행동 무영향 카운터): 위기 발주촌 대금 구성(식량류 비율). 회귀 불변식이 pull 채널의 조용한 회귀를 감시.
      if (c.from.surplusEMA && c.from.surplusEMA.food < 0) {
        const _ps = world._pullStats || (world._pullStats = { crisisReturns: 0, crisisFoodReturns: 0 });
        _ps.crisisReturns++; if (returnRes && FOOD_CLASSES[returnRes]) _ps.crisisFoodReturns++;
      }

      if (returnRes) {
        // ★시장 충격 정산(2026-07-12, b00c9f4의 50% 하드캡을 창발 기제로 대체): 매수량 = 예산 역산(닫힌형)
        //   — credit이 재고를 파고들수록 상승분을 지불. 글럿 잉여(바닥 클램프 구간)는 여전히 헐값에 흐르되
        //   유보 스케일(target 근방 멱법칙 구간)부터 비용 급증(식량 e=1.2>1 → 재고 0 접근 시 발산, 천장
        //   클램프 구간만 유한·1000×) — 전량 소진이 '경제적으로' 불가. 하드캡·플로어 없음(빈곤맵 재분배 생존).
        //   매수세: 시장 실지불 C×(1+TAU)=netCredit → C=netCredit/(1+TAU), 세금=C×TAU
        //   (종전 taxToOnBuy는 재고 부족으로 못 산 미체결분까지 과세하던 결함 — 함께 수리).
        const _budget = netCreditAfterArrival / (1 + TAU);
        const _buy = _impactBuyV2(c.to, returnRes, _budget);
        c.to.storage[returnRes] = (c.to.storage[returnRes] || 0) - _buy.qty;
        c.to.treasury._cash = (c.to.treasury._cash || 0) + _buy.cost * TAU;
        c._returningRes = returnRes;
        c._returningAmt = _buy.qty;
      } else {
        c._returningRes = null;
        c._returningAmt = 0;
      }

      c.state = 'inbound';

      world.tradeLog.push({
        day, from: c.from.name, to: c.to.name,
        sent: { res: c.giveRes, amt: +deliveredGive.toFixed(2), pAtFrom: +c.pFrom_at_depart.toFixed(2), pAtTo: +pTo.toFixed(2) },
        bought: c._returningRes ? { res: c._returningRes, amt: +c._returningAmt.toFixed(2) } : null,
        distance: +c.distance.toFixed(0),
        escort: c.escort,
        raided: outboundLoss > 0,
        travelDays: c.travelDays,
      });
    }

    else if (c.state === 'inbound' && day >= c.returnArriveDay) {
      // ★[de-abstract] 약탈 (귀환) = per-entity 실전투: 왕복 같은 길목 갱 vs 호위+상인
      const gangI = world.banditGang ? world.banditGang(c.from, c.to) : null;
      let inboundLoss = 0;
      if (gangI && gangI.n > 0) {
        const R = _raidScrum(c.escort, _escAtk(c.from), gangI.n);
        gangI.n = Math.max(0, gangI.n - R.banditsKilled);
        if (R.escKilled > 0) _killWarriors(c.from, R.escKilled);   // 죽은 호위만 감소
        if (!R.repel) {   // 호위 붕괴
          if (c.from.tradeStats) c.from.tradeStats.caravansRaided++;
          if (R.traderDead) {   // 상인 사망 → 가져오던 자원 전손
            inboundLoss = 1;
            if (world.onBanditLoot && c._returningRes && c._returningAmt > 0) world.onBanditLoot(c.from, c.to, c._returningRes, c._returningAmt, day);
            killTrader(c, c.from);
          } else {   // ★상인 도주 → 부분 약탈, 나머지는 고향까지 회수(감축 입금 — 아래 received)
            inboundLoss = Math.min(0.85, 0.25 + 0.5 * Math.min(1, R.escKilled / Math.max(1, R.escStart + 1)));
            if (world.onBanditLoot && c._returningRes && c._returningAmt > 0) world.onBanditLoot(c.from, c.to, c._returningRes, c._returningAmt * inboundLoss, day);
          }
        } else if (c.from.tradeStats) { c.from.tradeStats.banditsRepelled = (c.from.tradeStats.banditsRepelled || 0) + 1; }
      }
      if (c._done) continue;   // 행상 사망 → 캐러밴 종료(자원 입금 X)

      if (c._returningRes && c._returningAmt > 0) {
        const received = c._returningAmt * (1 - inboundLoss);
        // ★귀환 화물이 원석이면 **매입처(c.to)의 조성**을 싣고 온다(위와 같은 규약)
        if (c._returningRes === 'ore' && v1.foldOreMix) v1.foldOreMix(c.from, c.from.storage.ore || 0, received, v1.oreMixOf(c.to));
        c.from.storage[c._returningRes] = (c.from.storage[c._returningRes] || 0) + received;
        // v2 r13 Fix 1: 무역 자본 적립 — 받은 자원의 3%가 길드 treasury로 (사용자 의도: 3% 기본 세금)
        //   페니키아·베네치아 동학. 무역 도시도 영토 확장 가능.
        if (!c._abandoned && c.from.treasury && received > 0) {
          const tradeTax = received * 0.03;
          c.from.storage[c._returningRes] -= tradeTax;
          c.from.treasury[c._returningRes] = (c.from.treasury[c._returningRes] || 0) + tradeTax;
        }
        if (!c._abandoned && c.from.tradeStats &&
            ['food', 'cooked_food', 'fish', 'meat'].includes(c._returningRes)) {
          c.from.tradeStats.foodImported += received;
        }
        if (!c._abandoned && c.from.tradeStats && c._returningRes === 'wood') {
          c.from.tradeStats.woodImported = (c.from.tradeStats.woodImported || 0) + received;   // ★fuelK(리비히 연료)용 — 목재 수입도 부양력에 반영(교역이 숲빈약 마을 부양)
        }
      }
      c._done = true;
    }
  }
  world.caravans = world.caravans.filter(c => !c._done);
}

// === 계절·날씨·풍흉 토지 multiplier ===
//   v.land를 매 tick 원본 × season × weather × yearShock 로 임시 설정 후 tickVillage 호출, 끝나면 복원.
function applyLandModifiers(v, season, world) {
  if (!v._origLand) v._origLand = { ...v.land };
  const orig = v._origLand;
  const sm = SEASON_MULT[season] || {};
  // 마을 단위 날씨 (있으면)
  const wMult = (v._weather && v._weather.untilDay >= world.day) ? v._weather.mult : null;
  // 마을 단위 풍년/흉년 (있으면)
  const yMult = (v._yearShock && v._yearShock.untilDay >= world.day) ? v._yearShock.mult : null;
  const mult = (k) => (sm[k] || 1) * (wMult ? (wMult[k] || 1) : 1) * (yMult ? (yMult[k] || 1) : 1);
  v.land = {
    ...orig,  // size, baseSize 등 비-multiplier 속성 보존 (이거 빠지면 jobCapacity NaN → 인구 즉사)
    fertility: orig.fertility * mult('fertility'),
    water: orig.water * mult('water'),
    game: orig.game * mult('game'),
    wood: orig.wood * mult('wood'),
    stone: orig.stone * mult('stone'),
    ore: orig.ore * mult('ore'),
  };
}
function restoreLand(v) {
  if (v._origLand) {
    // v2 r12: tickVillage 중 v.land.size·baseSize가 영토확장으로 변경됐을 수 있음.
    //   restore 시 변경된 size를 _origLand에 영구 반영.
    const currentSize = v.land.size;
    const currentBaseSize = v.land.baseSize;
    v._origLand.size = currentSize;
    v._origLand.baseSize = currentBaseSize;
    v.land = v._origLand;
  }
  v._origLand = null;
}

// === 자원 부패 (보유 비용) — v2 r8: stock 비례식 ===
//   비축이 target × 10 이하면 baseRate 그대로.
//   초과분은 비례 가속 (쥐·곰팡이·도둑 자연 효과).
//   결과: 1000일치 비축 마을은 1년에 거의 다 부패 → 자연 sink.
// ★부패성 식량은 과잉 시 빨리 상함(곡식 rot) — excess 임계를 낮게(target×2 ≈ 60일치). 내구재(도구·무기)는 ×10 유지.
const DECAY_EXCESS_MULT = { food: 2, meat: 2, fish: 2, cooked_food: 2, fruit: 2, vegetable: 2, mushroom: 2, hide: 4,   // ★hide xm은 4 유지(3 시도는 base 0.0015와 세트로 s505 붕괴 — 절충안은 base만 0.001)
  stone: 8, ore: 3, wood: 8, wheat: 4, rice: 4, barley: 4,
  // ★유령 박멸(§9): 유기 부산물 더미는 빨리 삭음(벌레·풍화·굳음 — hide 4 선례). 반유령 재고의 글럿 평형을 실사용 수준으로 하향.
  bone: 3, feather: 3, resin: 3, leather: 4, fur: 4, hemp: 4, ramie: 4, seaweed: 3, clay: 6, oak_log: 4, pine_log: 4 };   // ★모시(2026-07-13): 유기 섬유 더미 삭음(hemp 4 동형)
// ★옹기(유령 박멸·§9 손실 절약형): 진흙(광부 부산물)을 매일 소비(가구 장독 빚기·깨진 독 갈기 — 가내수공, 신규 직업 없음)
//   → 충족률 EMA(v._potteryR) → 부패성 식량 부패율 ×(1−0.3×충족) — 소비의 대가가 실물 손실 감소(밀폐 저장).
//   수요 하드코딩 아님(가격 항 없음): 공급 없으면 현행 부패 그대로(페널티 없음), 있으면 절약. 진흙 없는 마을엔 수입 유인 창발.
const CLAY_DAILY_PC = 0.02;        // 1인당 일일 진흙(장독 유지 — 광산촌 부산물 흐름 스케일)
const POTTERY_DECAY_SAVE = 0.3;    // 완전 충족 시 부패 −30%(질그릇 밀폐 — 상한)
const POTTERY_FOODS = { food: 1, cooked_food: 1, fish: 1, meat: 1, fruit: 1, vegetable: 1, mushroom: 1, wheat: 1, rice: 1, barley: 1 };
function tickDecay(v) {
  const N = v.npcs.length || 1;
  // 옹기: 진흙 흐름 소비 → 충족률 EMA(~50일 관성 — 독은 한 번 빚으면 오래감)
  const _cNeed = N * CLAY_DAILY_PC;
  const _cTake = Math.min(v.storage.clay || 0, _cNeed);
  if (_cTake > 0) { v.storage.clay -= _cTake; v1._cons(v, 'clay', _cTake); }   // ★flow-EMA(옹기 진흙)
  v._potteryR = v._potteryR === undefined ? (_cNeed > 0 ? _cTake / _cNeed : 0) : 0.98 * v._potteryR + 0.02 * (_cNeed > 0 ? _cTake / _cNeed : 0);
  const _potMul = 1 - POTTERY_DECAY_SAVE * Math.min(1, v._potteryR);
  for (const [r, baseRate] of Object.entries(DECAY_V2)) {
    const s = v.storage[r] || 0;
    if (s <= 0) continue;
    const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
    const util = UTILITY_WEIGHT[r] || 0.1;
    const flowT = SUBSISTENCE_PER_NPC[r] ? 0 : ((v._consEMA || {})[r] || 0) * 30;   // ★flow-EMA(동기 계약·subs 가드) — 롱테일 작업 재고는 과잉부패에서 보호
    const buffer = N * (util * 1.2);
    const target = Math.max(subs * 30, buffer, flowT);
    // excess: target × mult 초과분은 비례 가속(쥐·곰팡이·도둑). 부패성 식량은 mult 낮아 ~60일에서 cap.
    const xm = DECAY_EXCESS_MULT[r] || 10;
    const excess = Math.max(0, s / Math.max(1, target * xm) - 1);
    const rate = baseRate * (1 + excess * 5) * (POTTERY_FOODS[r] ? _potMul : 1);   // ★옹기 절감은 식량군만(장독=곡식·장 저장)
    v.storage[r] = s * (1 - rate);
  }
}

// === 날씨 단기 이벤트 (매 day 작은 확률) ===
//   가뭄/폭풍/풍요 등 7~14일 짜리.
const WEATHER_KINDS = [
  { name: '🌵가뭄', mult: { fertility: 0.65, water: 0.7 }, days: [7, 14] },
  { name: '⛈️폭풍', mult: { fertility: 0.85, water: 1.2, game: 0.75, wood: 0.7 }, days: [3, 7] },
  { name: '🌈풍요', mult: { fertility: 1.25, game: 1.2 }, days: [5, 10] },
  { name: '🌫️안개', mult: { game: 0.7, water: 1.1 }, days: [4, 8] },
];
function tickWeather(world, day) {
  // v2 r7: 마을마다 독립 phase로 다양화 — 좌표를 seed offset으로 사용해 동조화 방지.
  for (let i = 0; i < world.villages.length; i++) {
    const v = world.villages[i];
    if (v._weather && v._weather.untilDay >= day) continue;
    // 마을마다 다른 phase로 trigger 결정 — index 기반 분산
    const triggerRoll = v1.srand();
    if (triggerRoll < 0.015) {
      // 종류·기간도 마을마다 독립 (다음 srand 호출 — 마을 index에 따라 누적적으로 다름)
      const wk = WEATHER_KINDS[Math.floor(v1.srand() * WEATHER_KINDS.length)];
      const dur = wk.days[0] + Math.floor(v1.srand() * (wk.days[1] - wk.days[0] + 1));
      v._weather = { name: wk.name, mult: wk.mult, untilDay: day + dur };
      if (v.npcs.length >= 20) {
        console.log(`  ${wk.name} Day ${day}: ${v.name} (${dur}일)`);
      }
    }
  }
}

// === 풍년/흉년 (계절 시작 시 random 마을) ===
function tickYearShock(world, day) {
  // 가을 시작 (day%365==180)에 풍년/흉년 결정
  if (day % 365 !== 180) return;
  for (const v of world.villages) {
    const roll = v1.srand();
    if (roll < 0.15) {
      v._yearShock = { name: '🌾풍년', mult: { fertility: 1.3, game: 1.15 }, untilDay: day + 90 };
      console.log(`  🌾 Day ${day}: ${v.name} 풍년 (가을~겨울)`);
    } else if (roll < 0.27) {
      v._yearShock = { name: '☠️흉년', mult: { fertility: 0.7, game: 0.85 }, untilDay: day + 90 };
      console.log(`  ☠️ Day ${day}: ${v.name} 흉년 (가을~겨울)`);
    }
  }
}

// =============================================================================
// 5. world tick — v1 tickVillage 재사용, trade·caravan만 교체
// =============================================================================
function tickWorldV2(world) {
  world.day += 1;
  v1.processEvents(world, world.day);
  // DEBUG flags — 각 효과 on/off
  if (world._dbg?.weather !== false) tickWeather(world, world.day);
  if (world._dbg?.yearShock !== false) tickYearShock(world, world.day);
  const season = seasonOf(world.day);
  const useSeason = world._dbg?.season !== false;
  for (const v of world.villages) {
    if (world._dbg?.climate !== false) {
      // ★기온(2026-07-12): 야간최저 기준 한랭 스트레스(0~1) — 의복 커버리지 페널티·연료 가중·마모 가중이 소비(v1).
      const _elev = (v.land && v.land.elev) || 0;   // 호스트(지형층) 고도 주입 훅 — 미설치=0(해수면) 무해
      v._tempDay = temperatureAt(world.day, null, _elev);
      v._tempNight = v._tempDay - CLIMATE.diurnalAmp;
      v._coldStress = Math.max(0, Math.min(1, (CLIMATE.coldRef - v._tempNight) / 15));
    }
    if (useSeason) applyLandModifiers(v, season, world);
    v1.tickVillage(v, world.day);
    if (useSeason) restoreLand(v);
    v1.adjustGuildTax(v, world.day);
    tickSubsistence(v, world.day);
    if (world._dbg?.decay !== false) tickDecay(v);
  }
  tickTradeV2(world, world.day);
  tickCaravansV2(world, world.day);
  // v2 r7: 이주·강제소개 OFF — 사용자 명시 의도 (안정된 마을 7개로 서버 오픈).
  //   대신 인구 회복 보장 (작은 마을 ghost town 방지).
  // v1.tickMigration(world, world.day);  ← OFF
  // tickForceEvacuation(world, world.day);  ← OFF
  tickRecovery(world, world.day);
  for (const v of world.villages) {
    if (v.history.length > 500) v.history.splice(0, v.history.length - 500);
  }
  if (world.tradeLog.length > 5000) world.tradeLog.splice(0, world.tradeLog.length - 5000);
}

// =============================================================================
// 6. 분석 출력
// =============================================================================
function printSummary(world, days) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 economy-sim-v2 결과 — ${days}일 후`);
  console.log(`${'='.repeat(80)}\n`);

  const villages = world.villages.slice().sort((a, b) => (b.npcs.length || 0) - (a.npcs.length || 0));

  // 1) 마을별 요약
  console.log('마을              인구  좌표        토지(F/W/S/O)   storage(food/wood/stone/ore/tool)  treasury_cash');
  console.log('-'.repeat(120));
  for (const v of villages) {
    const co = v.coord ? `(${v.coord.x.toFixed(0)},${v.coord.y.toFixed(0)})` : '(?,?)';
    const land = `${v.land.fertility.toFixed(1)}/${v.land.wood.toFixed(1)}/${v.land.stone.toFixed(1)}/${v.land.ore.toFixed(1)}`;
    const sto = `${(v.storage.food || 0).toFixed(0)}/${(v.storage.wood || 0).toFixed(0)}/${(v.storage.stone || 0).toFixed(0)}/${(v.storage.ore || 0).toFixed(0)}/${(v.storage.tool || 0).toFixed(1)}`;
    const cash = (v.treasury._cash || 0).toFixed(1);
    console.log(`${v.name.padEnd(16)} ${String(v.npcs.length).padStart(4)}  ${co.padEnd(12)} ${land.padEnd(14)} ${sto.padEnd(34)} ${cash.padStart(10)}`);
  }

  // 2) 마을별 shadow price (몇 자원만)
  console.log('\n📈 shadow price (자원당 마을별)');
  const priceCols = ['food', 'wood', 'stone', 'ore', 'tool', 'weapon'];
  console.log('마을              ' + priceCols.map(p => p.padStart(10)).join(' '));
  for (const v of villages) {
    const p = computeShadowPrices(v);
    const row = priceCols.map(c => (p[c] || 0).toFixed(2).padStart(10)).join(' ');
    console.log(`${v.name.padEnd(16)} ${row}`);
  }

  // 3) 거래 통계
  console.log('\n🚚 거래 통계');
  let totalTrades = world.tradeLog.length;
  let raided = world.tradeLog.filter(t => t.raided).length;
  let resVolumes = {};
  for (const t of world.tradeLog) {
    resVolumes[t.sent.res] = (resVolumes[t.sent.res] || 0) + t.sent.amt;
  }
  console.log(`  총 거래: ${totalTrades}건 (약탈: ${raided}건 = ${(raided / Math.max(1, totalTrades) * 100).toFixed(1)}%)`);
  console.log(`  활성 캐러밴: ${(world.caravans || []).length}건`);
  console.log(`  자원별 운송량: ${Object.entries(resVolumes).map(([r, v]) => `${r}=${v.toFixed(0)}`).join(' · ')}`);

  // 4) 최근 거래 10건
  console.log('\n📜 최근 거래 10건');
  const recent = world.tradeLog.slice(-10).reverse();
  for (const t of recent) {
    const buy = t.bought ? `← ${t.bought.res} ${t.bought.amt}` : '← (빈손)';
    const r = t.raided ? ' ⚠️약탈' : '';
    console.log(`  Day ${t.day} · ${t.from} → ${t.to} · ${t.sent.res} ${t.sent.amt} (p:${t.sent.pAtFrom}→${t.sent.pAtTo}) ${buy} · 거리${t.distance} 호위${t.escort} ${t.travelDays}일${r}`);
  }

  // 5) 총합
  const totalPop = villages.reduce((s, v) => s + v.npcs.length, 0);
  const alive = villages.filter(v => v.npcs.length > 0).length;
  const totalCash = villages.reduce((s, v) => s + (v.treasury._cash || 0), 0);
  console.log(`\n💡 총합: 마을 ${alive}/${villages.length} 생존 · 인구 ${totalPop} · treasury cash 총 ${totalCash.toFixed(0)}`);
}

// =============================================================================
// 6b. 순수출가 — "이 한 단위를 수출하면 손에 얼마가 남는가"
// =============================================================================
// ★★[2026-08-02c 배합↔교역 한 단위 통합 — 재민 "네가 이해한 게 맞아. 비교가 필요해. 단, 정확해야 해"]
//   `설계_배합과교역_한단위_통합.md` (가)안의 `opp(r)` 우변이다. 주조 결정(_alloyMelt)과 교역 결정이
//   **같은 단위(재화 1단위의 기대 순가치)**를 보게 만드는 접점.
//
//   ⚠산술은 `tickTradeV2` 발주 EV 의 **같은 항·같은 상수**여야 한다(근사 금지 — 재민 확정):
//       발주 EV/단위 = pTo×MARGIN×(1−TAU)×(1−기대손실) − 운반비 − pFrom×(1+TAU)
//                      └────────────── 이 부분이 순수취(netExportValue) ──────────────┘
//     마지막 항 `−pFrom×(1+TAU)` 은 **바로 그 재화의 기회비용 자체**라 여기서 빼면 이중계상이다.
//     (수출로 얻는 것과 국내에서 쓰는 것을 비교하는 게 목적이므로, 비교 대상은 '총수취'다.)
//   ⚠기대손실도 발주 EV 와 동일: 경로 위험(RAID_BASE + 도적훅 + 거리) → ×0.5, 갱이 있으면 호위 충족도 재추정.
//   ⚠후보 목적지도 동일: `_near20`(가까운 20곳) ∩ infoRange. 그래야 "실제로 팔 수 있는 곳"만 센다.
//
//   해상도: **하루 1회 산정 캐시**. tickTradeV2 자신이 `a.prices` 를 사이클당 1회 산정하고
//   그 값으로 그날 모든 발주를 결정한다(line ~569 `_priceCacheDay`). 같은 해상도를 쓴다 —
//   더 자주 재는 건 교역층보다 정밀해지는 것이라 정합이 아니라 불일치가 된다.
const FORWARD_PRICE_MARGIN_NEV = 0.95;   // ★tickTradeV2 지역상수 FORWARD_PRICE_MARGIN 과 **같은 값**이어야 한다(test-valuechain ⑥ 이 두 리터럴의 일치를 감시)
function netExportValue(world, from, res) {
  if (!world || !from || !res) return 0;
  const day = world.day || 0;
  let C = world._nevCache;
  if (!C || C.day !== day) C = world._nevCache = { day, px: new Map(), val: new Map() };
  const vk = from.name + ' ' + res;
  if (C.val.has(vk)) return C.val.get(vk);
  const px = (b) => { let t = C.px.get(b); if (!t) { t = computeShadowPrices(b); C.px.set(b, t); } return t; };
  const infoR = world.infoRange || 400;
  const near = (from._near20 && from._near20.length) ? from._near20 : (world.villages || []);
  let best = 0;
  for (const b of near) {
    if (!b || b === from || !b.npcs || b.npcs.length < 2) continue;   // 인구 2 미만은 교역 발주·수주 대상이 아니다(tickTradeV2 동일 게이트)
    if (b.isolated && day < b.isolatedUntilDay) continue;
    if (b._siegeBlock) continue;
    if ((from._grudgeBlock && from._grudgeBlock[b.name]) || (b._grudgeBlock && b._grudgeBlock[from.name])) continue;
    const dist = v1.villageDist(from, b);
    if (dist > infoR) continue;
    const pTo = (px(b)[res] || 0) * FORWARD_PRICE_MARGIN_NEV;
    if (!(pTo > 0)) continue;
    const banditX0 = world.banditRouteRisk ? (world.banditRouteRisk(from, b) || 0) : 0;
    const raidProb = Math.min(RAID_MAX, RAID_BASE + banditX0 + (dist / 100) * (world.raidPer100 || RAID_PER_100));
    let expectedLossRatio = raidProb * 0.5;
    if (world.banditGang) {
      const _g = world.banditGang(from, b);
      if (_g && _g.n > 0) {
        const _availW = (from.counts && from.counts.warrior) || 0;
        const _escEst = Math.min(_availW, Math.ceil(_g.n * 1.5));
        const _repelP = Math.max(0, Math.min(1, (_escEst - _g.n) / Math.max(1, _g.n * 0.5)));
        expectedLossRatio = Math.max(expectedLossRatio, (1 - _repelP) * 0.6);
      }
    }
    const net = pTo * (1 - TAU) * (1 - expectedLossRatio) - (TRANSPORT_COST_PER_1000 * dist / 1000) * haulMul();   // ★말 사역(⑥) — 발주 EV 와 같은 항·같은 배수
    if (net > best) best = net;
  }
  C.val.set(vk, best);
  return best;
}

// =============================================================================
// 7. main
// =============================================================================
function createWorldV2(opts = {}) {
  // v1 createWorld 그대로 사용 (인프라 공유)
  const world = v1.createWorld(opts);
  // v2 핵심: picker에 shadow price 주입 → 가격이 직업 선택에 진짜 영향
  world.priceFn = computeShadowPrices;
  world.priceBase = BASE_VALUE_V2;   // ★생산 포만(satiation) 판정용 — v1 tickVillage가 adj=가격/기준값으로 글럿 측정
  // ★★[2026-08-02c 배합↔교역 한 단위 통합] 순수출가 주입 — priceFn 선례와 같은 계약(v1→v2 역참조 금지, world 로 주입).
  //   v1 의 주조 결정(_alloyMelt)이 "이 주석을 이웃이 얼마에 사 주는가"를 볼 수 있게 한다.
  world.netExportFn = (v, res) => netExportValue(world, v, res);
  // 직업 전환 빈도 21일 — 변동 줄여 안정성 ↑. (30일로 늘리니 반응 느려 기근↑→crisis-mode↑ 역효과 확인, 21 유지)
  world.autoSwitchInterval = 21;
  return world;
}

// === 작은 마을 자연 회복 (이주 OFF의 보완책) ===
//   인구 < 5 + storage food 충분이면 매 50일 1명 출산.
//   v2 r10: 토지 적합 직업으로 출산 (이전 무조건 farmer = 척박 마을엔 자살)
function tickRecovery(world, day) {
  if (day % 50 !== 0 || day < 100) return;
  for (const v of world.villages) {
    if (v.npcs.length === 0 || v.npcs.length >= 5) continue;
    if ((v.storage.food || 0) < v.npcs.length * 15) continue;
    // 토지 적합 식량 직업 — fertility/water/game 중 최고
    const opts = [
      ['farmer', v.land.fertility * 1.5],
      ['fisher', v.land.water * 1.2],
      ['hunter', v.land.game * 0.7],
    ].sort((a, b) => b[1] - a[1]);
    const bestJob = opts[0][0];
    const npc = v1.createNPC({ job: bestJob, inheritSkill: v1.apprenticeInherit ? v1.apprenticeInherit(v, bestJob) : null });   // ★S4 명장 견습
    v.npcs.push(npc);
    v.counts = v.counts || {};
    v.counts[bestJob] = (v.counts[bestJob] || 0) + 1;
    console.log(`  👶 Day ${day}: ${v.name} 인구 자연회복 → ${v.npcs.length}명 (${bestJob})`);
  }
}

// === 추가: 외곽 마을 강제 소개 (ghost town 방지) ===
//   인구 ≤ 2 + 토지 평균 ≤ 0.7 (정말 척박)이면 마지막 1~2명도 강제 이주.
function tickForceEvacuation(world, day) {
  if (day % 30 !== 0 || day < 100) return;
  for (const v of world.villages) {
    if (v.npcs.length === 0) continue;
    // 식량 생산 토지 (fertility/water/game) 중 최고 1개로 판단 — 한 가지라도 우월하면 유지.
    const foodLand = Math.max(v.land.fertility, v.land.water, v.land.game);
    if (v.npcs.length > 4) continue;       // 인구 ≤4까지 강제소개 후보
    if (foodLand > 1.2) continue;          // 식량 토지 최고치가 1.2 넘으면 자력 가능
    // 추가: 거래로 살아남는지 — foodImported 충분하면 유지
    if (v.tradeStats && v.tradeStats.foodImported > v.npcs.length * 100) continue;
    // 가장 큰 마을로 모두 이주
    const targets = world.villages
      .filter(t => t !== v && t.npcs.length >= 5)
      .sort((a, b) => b.npcs.length - a.npcs.length);
    if (!targets.length) continue;
    const target = targets[0];
    const count = v.npcs.length;
    while (v.npcs.length > 0) {
      const npc = v.npcs.pop();
      target.npcs.push(npc);
    }
    // counts 재계산은 다음 tick에서 jobCounts가 알아서 함 — incremental cache invalidate
    if (v._countsCache) v._countsCache = null;
    if (target._countsCache) target._countsCache = null;
    console.log(`  ⚰️  Day ${day}: 강제소개 → ${v.name}(land ${foodLand.toFixed(2)}, ${count}명) → ${target.name}`);   // ★landMean 미정의 ReferenceError 지뢰 수정(현재 OFF 경로지만 로그 인자는 호출 전 평가됨)
  }
}

function main() {
  const days = parseInt(process.argv[2] || '500', 10);
  const villageCount = parseInt(process.argv[3] || '7', 10);
  const seed = parseInt(process.argv[4] || '4242', 10);

  console.log(`[economy-sim-v2 round 6] seed=${seed} villages=${villageCount} days=${days}`);
  console.log(`  요소: 거리비례 이동(3~7일) · 효용함수 · 계절 · 날씨 · 풍흉 · warrior 장비반응 · 자원부패`);
  console.log(`  tau=${TAU} · cargo ${CARGO_PER_TRIP} · autoSwitchInterval 21일`);

  const world = createWorldV2({
    seed, villageCount,
    namePool: villageCount === 7 ? ['단풍', '늑대골', '얼음호수', '검은숲', '강철광산', '연어강', '대평원'] : undefined,
    infoRange: 5000, raidPer100: 0.005, picker: 'rational',
  });
  // 좌표 — canadia 식 타원형 배치 (zone 11000×5000)
  if (villageCount === 7) {
    const cx = 5500, cy = 3100, rx = 4200, ry = 1100;
    for (let i = 0; i < world.villages.length; i++) {
      const v = world.villages[i];
      const angle = (i / world.villages.length) * Math.PI * 2;
      v.coord = { x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry };
    }
  }

  const t0 = Date.now();
  for (let d = 0; d < days; d++) {
    tickWorldV2(world);
    if ((d + 1) % 100 === 0) {
      const totalPop = world.villages.reduce((s, v) => s + v.npcs.length, 0);
      const alive = world.villages.filter(v => v.npcs.length > 0).length;
      console.log(`  day ${d + 1}: 인구 ${totalPop} (${alive}/${world.villages.length} 생존) · 거래 ${world.tradeLog.length} · 활성 caravan ${world.caravans.length}`);
    }
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[시뮬 시간: ${elapsed}s]`);

  printSummary(world, days);

  // ★★[재민 확정 2026-08-01 "후자로 가자"] 회귀 하네스를 v1 CLI → **이쪽으로 옮긴다.**
  //   이유: v1 CLI 는 createWorld(=priceFn 없음)라 rational picker 의 한계가치 가중 w() 가
  //   전부 1.0 으로 죽는다. 가격에 따른 노동 이동이 rational 의 존재 이유인데 그게 꺼진 채
  //   도는 것 — 프로덕션(central.js·villages.js = 언제나 tickWorldV2)에 없는 조합이다.
  //   여기 main 은 createWorldV2 + tickWorldV2 라 **프로덕션과 같은 기계**다. 덤프만 없어서
  //   econ-regress 가 못 읽고 있었으므로 덤프를 붙인다.
  //   파일명은 v1(sim-*)과 **일부러 다르게** 한다 — 섞이면 옛 덤프를 읽는 거짓 통과가 또 난다.
  {
    const fs = require('fs');
    const path = require('path');
    const outDir = path.join(__dirname, 'out');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outFile = path.join(outDir, `simv2-${seed}-${days}d.json`);
    fs.writeFileSync(outFile, JSON.stringify({
      config: { days, seed, villageCount, engine: 'v2', picker: 'rational', tick: 'tickWorldV2' },
      villages: world.villages.map(v => ({
        name: v.name, land: v.land, coord: v.coord,
        finalPop: v.npcs.length,
        finalStorage: v.storage,
        finalTreasury: v.treasury,
        jobs: v1.jobCounts(v),
        // 계측용 내부 스칼라(제련량·주조등급·품질 EMA 등) — 회귀표 밖 진단에 쓴다
        _int: Object.fromEntries(Object.keys(v).filter(k => k[0] === '_' && typeof v[k] === 'number')
          .map(k => [k, +v[k].toFixed(4)])),
      })),
      tradeCount: world.tradeLog.length,
    }, null, 1));
    console.log(`\n📁 JSON dump: ${outFile}`);
  }
}

if (require.main === module) main();

// === Phase 5-5-econ-c: 마을 stat 5종 (specialty.contributes 기반) ===
//   마을이 보유한 자원을 보고 subsistence/happiness/health/prestige/defense 산출.
//   인구당 정규화 — per_npc 2.0까지 만족도 누적 (그 이상은 잉여).
//   stat 값 [0, ∞) — 마을 정책·인구 성장률·이주에 활용 가능.
function computeVillageStats(v) {
  const stats = { subsistence: 0, happiness: 0, health: 0, prestige: 0, defense: 0 };
  let SPECIALTY;
  try { SPECIALTY = require('../server/specialty').RESOURCES; } catch { return stats; }
  const pop = Math.max(1, v.pop || v.population || 1);
  const storage = v.storage || v.stock || {};
  for (const [id, qty] of Object.entries(storage)) {
    const r = SPECIALTY[id];
    if (!r || !r.contributes || qty <= 0) continue;
    const per_npc = qty / pop;
    const satisfaction = Math.min(1.0, per_npc / 2.0);  // 1인당 2단위까지 누적
    for (const [stat, w] of Object.entries(r.contributes)) {
      if (stats[stat] !== undefined) stats[stat] += w * satisfaction;
    }
  }
  return stats;
}

module.exports = {
  createWorldV2,
  tickWorldV2,
  computeShadowPrices,
  netExportValue, FORWARD_PRICE_MARGIN_NEV,   // ★배합↔교역 통합(2026-08-02c) — 하네스가 산술을 직접 재게 노출
  haulMul, HORSE_HAUL_MUL, TRANSPORT_COST_PER_1000,   // ★말 사역(2026-08-02e ⑥) — 시대 전/후 비트 동일 검증용
  computeVillageStats,
  ELASTICITY,
  TAU,
  SUBSISTENCE_PER_NPC,
  // 시장 충격 정산 헬퍼(1b) — 프로브·자가검증용 노출
  _priceParamsV2, _impactSegs, _impactF, _impactBuyV2, _impactSellV2,
  // 기온 모델(2026-07-12) — 생활층(밤낮 시간 곡선)·프로브용 노출
  temperatureAt, CLIMATE,
};
