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
  wood: 0.9, stone: 0.9, ore: 0.9, hide: 0.9,
  // 사치/생산수단 — 완만
  tool: 0.7, weapon: 0.6, armor: 0.6,
  // 채집물 — 자체 가치 낮음
  fruit: 1.0, vegetable: 1.0, mushroom: 1.0, twig: 0.7, pebble: 0.7,
};

const TRADABLE = Object.keys(ELASTICITY);

// v2 자체 BASE_VALUE override — weapon/tool 만성부족 완화 (BASE 낮춤)
//   원래 v1: weapon=8, tool=5. 너무 anchor가 높아 cap에 박힘.
const BASE_VALUE_V2 = {
  food: 1.0, fish: 1.25, meat: 2.14, cooked_food: 2.0, hide: 2.0,
  wood: 1.67, stone: 2.14, ore: 3.0,
  tool: 3.0, weapon: 5.0, armor: 5.0,  // 8/5 → 5/3
  fruit: 1.5, vegetable: 1.5, mushroom: 1.5, twig: 1.0, pebble: 1.0,
};

// NPC 1인당 일일 subsistence — 자급 인출량. price-inelastic.
const SUBSISTENCE_PER_NPC = {
  food: 1.0,
  cooked_food: 0.05,
  tool: 0.005,
  weapon: 0.002,
  armor: 0.002,
};

// 거래 수수료 — 양쪽 끝에 부과. 3%면 spread 6%. 사용자 의도: default 3%.
const TAU = 0.03;

// 운반비 — 거리당. 1000 거리당 2.0 가치 손실 (iceberg).
const TRANSPORT_COST_PER_1000 = 2.0;

// 행상 carry capacity — 한 번에 N단위
const CARGO_PER_TRIP = 50;

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
  tool: 0.5, weapon: 0.3, armor: 0.3, hide: 0.2,
  wood: 0.9, stone: 0.7, ore: 0.3,
  fruit: 0.1, vegetable: 0.1, mushroom: 0.1, twig: 0.05, pebble: 0.05,
};

// === 자원 부패율 — base는 약하게 (인구 영향 X), excess만 강하게 ===
//   stock 비례 부패에서 multiplier가 진짜 일함.
const DECAY_V2 = {
  meat: 0.0005, fish: 0.0005, cooked_food: 0.001,
  fruit: 0.0015, vegetable: 0.0015, mushroom: 0.0015,
  tool: 0.0005, weapon: 0.0002, armor: 0.0002,
  hide: 0.0005,
  twig: 0.001, pebble: 0.0002,
  // food도 명시 (v1엔 있지만 v2 자체식 사용)
  food: 0.001,
};

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
const TRADE_INTERVAL = 3;

// 정보 도달 거리 — v1과 동일하게 사용 (createWorld opts.infoRange)

// 약탈 — v1과 같은 식이지만 v2 caravan 구조용으로 재정의
const RAID_BASE = 0.03;
const RAID_PER_100 = 0.04;
const RAID_MAX = 0.5;

// =============================================================================
// 1. shadow price — hyperbolic scarcity
// =============================================================================
function computeShadowPrices(v) {
  const N = v.npcs.length || 1;
  const prices = {};
  for (const r of TRADABLE) {
    const base = BASE_VALUE_V2[r] || 1;
    const elast = ELASTICITY[r] || 1.0;
    // v2 r6.1: target에 효용 가중치 약하게 — 너무 크면 모두 부족 신호로 식량 폭주
    const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
    const util = UTILITY_WEIGHT[r] || 0.1;
    const buffer = N * Math.max(0.5, util * 1.2);  // 작게: 최소 0.5/명, util 1.0이면 1.2/명
    const target = Math.max(subs * 30, buffer);
    const stock = Math.max(0.1, v.storage[r] || 0);
    const scarcity = Math.pow(target / stock, elast);
    const adj = Math.max(PRICE_ADJ_MIN, Math.min(PRICE_ADJ_MAX, scarcity));
    prices[r] = base * adj;
  }
  return prices;
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
}

// =============================================================================
// 3. 행상 의사결정 — LOP arbitrage
//    각 마을에 대해 (잉여 자원, 목적지) 쌍에서 이익 max 골라 caravan 출발.
// =============================================================================
function tickTradeV2(world, day) {
  if (day % TRADE_INTERVAL !== 0) return;

  // 1) 모든 마을 가격표
  const data = world.villages.map(v => ({
    v,
    prices: computeShadowPrices(v),
    sent: 0,
  }));
  const byName = new Map(data.map(d => [d.v.name, d]));

  // 2) 마을마다 merchant 수만큼 caravan 출장 (최소 1, max merchant + 1).
  //    매 caravan마다 새 best 검색 (이미 출장한 자원·목적지 제외).
  //    출발 의사결정에 forward price 위험 마진 (도착 가격 5% 낮을 가정).
  const FORWARD_PRICE_MARGIN = 0.95; // 도착 시 가격 5% 낮을 거라 가정 (forward discount)
  for (const a of data) {
    if (a.v.isolated && day < a.v.isolatedUntilDay) continue;
    if (a.v.npcs.length < 2) continue;
    const merchantCount = (a.v.counts && a.v.counts.merchant) || 0;
    const N = a.v.npcs.length;
    // 매 cycle 출장 가능 caravan 수 — merchant 수 (최소 1)
    const maxCaravans = Math.max(1, merchantCount);
    const capacity = Math.max(N * 15, merchantCount * 100);
    if (a.sent >= capacity) continue;

    // 이 cycle에 이미 출장한 (자원, 목적지) — 중복 방지
    const alreadySent = new Set();
    let caravansLaunched = 0;

    while (caravansLaunched < maxCaravans && a.sent < capacity) {
      // 후보 자원 — 잉여
      const candidates = [];
      for (const r of TRADABLE) {
        const stock = a.v.storage[r] || 0;
        const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
        const buffer = N * 0.8;
        const target = Math.max(subs * 30, buffer);
        if (stock > target * 0.8) candidates.push({ res: r, surplus: Math.max(1, stock - target * 0.5) });
      }
      if (!candidates.length) break;

      // 최고 이익 (자원, 목적지) 검색 — 이미 출장한 조합 제외
      let best = null;
      for (const cand of candidates) {
        for (const b of data) {
          if (a === b) continue;
          if (b.v.isolated && day < b.v.isolatedUntilDay) continue;
          const key = `${cand.res}->${b.v.name}`;
          if (alreadySent.has(key)) continue;
          const dist = v1.villageDist(a.v, b.v);
          const infoR = world.infoRange || 400;
          if (dist > infoR) continue;
          const pFrom = a.prices[cand.res];
          const pTo = b.prices[cand.res] * FORWARD_PRICE_MARGIN; // 위험 마진
          const N_units = Math.min(cand.surplus, CARGO_PER_TRIP);
          const transportCostPerUnit = (TRANSPORT_COST_PER_1000 * dist / 1000);
          const raidProb = Math.min(RAID_MAX, RAID_BASE + (dist / 100) * (world.raidPer100 || RAID_PER_100));
          const expectedLossRatio = raidProb * 0.5;
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
        }
      }
      if (!best) break;
      alreadySent.add(best.key);
      caravansLaunched++;

      // 출발 — a.v.storage[cand.res] 차감 즉시
      const { cand, b, dist, N_units, pFrom, pTo } = best;
      a.v.storage[cand.res] -= N_units;
      a.sent += N_units * pFrom;

      // 가져갈 자원 결정
      let bestReturnRes = null, bestReturnRatio = 0;
      for (const r of TRADABLE) {
        if (r === cand.res) continue;
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

      // 호위 — 화물량 비례. merchant 본인은 caravan에 동행 가정 (시뮬은 마을 평균)
      const requested = Math.ceil(N_units / 20);
      const escort = Math.min((a.v.counts && a.v.counts.warrior) || 0, requested);
      const travelDays = travelDaysForDistance(dist);

      world._caravanIdCounter = (world._caravanIdCounter || 0) + 1;
      world.caravans.push({
        id: world._caravanIdCounter,  // 재routing 추적용 (zone 시각화 매핑)
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
      }
    } // while
  } // for (const a of data)
}

// =============================================================================
// 4. tickCaravans v2 — 도착 시 거래 + 양쪽 수수료. 귀환 시 받은 자원 입금.
// =============================================================================
function tickCaravansV2(world, day) {
  if (!world.caravans || !world.caravans.length) return;
  for (const c of world.caravans) {
    if (c._done) continue;

    if (c.state === 'outbound' && day >= c.arriveDay) {
      // 약탈 (가는 길)
      const wReady = Math.min(1, (c.from.storage.weapon || 0) / Math.max(1, c.escort));
      const aReady = Math.min(1, (c.from.storage.armor || 0) / Math.max(1, c.escort));
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05);
      const raidProb = Math.max(0.01, Math.min(RAID_MAX,
        RAID_BASE + (c.distance / 100) * (world.raidPer100 || RAID_PER_100) - protection));
      let outboundLoss = 0;
      if (v1.srand() < raidProb) {
        outboundLoss = 0.3 + v1.srand() * 0.4;
        if (c.from.tradeStats) {
          c.from.tradeStats.caravansRaided++;
          c.from.tradeStats.cargoLost += c.giveAmt * outboundLoss;
        }
      }
      const deliveredGive = c.giveAmt * (1 - outboundLoss);

      // 도착 마을 현재 가격으로 매도 검토
      const pricesTo = computeShadowPrices(c.to);
      const pricesFrom = computeShadowPrices(c.from);
      const pTo = pricesTo[c.giveRes] || 1;

      // ====== 도착 시 의사결정: 매도 vs 재routing vs 빈손 귀환 ======
      const expectedRevenue = deliveredGive * pTo * (1 - TAU);
      const sunkCost = c.giveAmt * c.pFrom_at_depart; // 출발 시 가치
      const rerouted = c._rerouted || 0;

      // 손해가 너무 크면 (수익 < 출발 가치의 50%) 재routing 또는 빈손 귀환.
      // 단 재routing 최대 2회 chain 제한 (무한 cascade 방지).
      if (expectedRevenue < sunkCost * 0.5 && rerouted < 2) {
        // 1) 다른 마을 검색 — c.to·c.from 제외, 거리 안에서 best
        let bestAlt = null;
        for (const b of world.villages) {
          if (b === c.to || b === c.from) continue;
          if (b.isolated && day < b.isolatedUntilDay) continue;
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
      // 도착 마을 chest에 들어옴 (거래 후)
      c.to.storage[c.giveRes] = (c.to.storage[c.giveRes] || 0) + deliveredGive;
      // 매도 수익 (credit, 회계 단위) — 도착 마을 수수료 차감
      const grossCredit = deliveredGive * pTo;
      const taxTo = grossCredit * TAU;
      const netCreditAfterArrival = grossCredit - taxTo;
      // 도착 마을 treasury (자원으로 누적 X — 회계가치만 합산해 numeric treasury)
      c.to.treasury._cash = (c.to.treasury._cash || 0) + taxTo;

      // 가져올 자원 결정 — 출발시 후보 또는 새로 best
      let returnRes = c.returnRes;
      if (!returnRes || !((c.to.storage[returnRes] || 0) > 1)) {
        // 다시 best 찾기
        let bestR = null, bestRatio = 0;
        for (const r of TRADABLE) {
          if (r === c.giveRes) continue;
          const bStock = c.to.storage[r] || 0;
          if (bStock <= 1) continue;
          const ratio = (pricesFrom[r] || 1) / (pricesTo[r] || 1);
          if (ratio > bestRatio) { bestRatio = ratio; bestR = r; }
        }
        returnRes = bestR;
      }

      if (returnRes) {
        const pToReturn = pricesTo[returnRes] || 1;
        // credit으로 살 수 있는 양 — 출발 마을 수수료도 미리 차감 (귀환시 부과되지만 caravan은 알고 사야)
        // 단순화: 도착 마을 매수에는 도착 측 수수료 또 한 번 (= 매수도 그 길드 거래소 이용).
        // 따라서 actual amount = netCreditAfterArrival / (pToReturn × (1+TAU))
        const taxToOnBuy = (netCreditAfterArrival / (pToReturn * (1 + TAU))) * pToReturn * TAU;
        const amountBought = netCreditAfterArrival / (pToReturn * (1 + TAU));
        const amountAvailable = Math.min(amountBought, c.to.storage[returnRes] || 0);
        c.to.storage[returnRes] -= amountAvailable;
        c.to.treasury._cash = (c.to.treasury._cash || 0) + taxToOnBuy;
        c._returningRes = returnRes;
        c._returningAmt = amountAvailable;
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
      // 약탈 (귀환)
      const wReady = Math.min(1, (c.from.storage.weapon || 0) / Math.max(1, c.escort));
      const aReady = Math.min(1, (c.from.storage.armor || 0) / Math.max(1, c.escort));
      const protection = Math.sqrt(c.escort) * (0.08 + wReady * 0.05 + aReady * 0.05);
      const raidProb = Math.max(0.01, Math.min(RAID_MAX,
        RAID_BASE + (c.distance / 100) * (world.raidPer100 || RAID_PER_100) - protection));
      let inboundLoss = 0;
      if (v1.srand() < raidProb) {
        inboundLoss = 0.3 + v1.srand() * 0.4;
        if (c.from.tradeStats) {
          c.from.tradeStats.caravansRaided++;
        }
      }

      if (c._returningRes && c._returningAmt > 0) {
        const received = c._returningAmt * (1 - inboundLoss);
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
function tickDecay(v) {
  const N = v.npcs.length || 1;
  for (const [r, baseRate] of Object.entries(DECAY_V2)) {
    const s = v.storage[r] || 0;
    if (s <= 0) continue;
    const subs = (SUBSISTENCE_PER_NPC[r] || 0) * N;
    const util = UTILITY_WEIGHT[r] || 0.1;
    const buffer = N * Math.max(0.5, util * 1.2);
    const target = Math.max(subs * 30, buffer);
    // excess: target × 10 이상이면 0보다 큼. 1당 5배 부패 가속.
    const excess = Math.max(0, s / Math.max(1, target * 10) - 1);
    const rate = baseRate * (1 + excess * 5);
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
// 7. main
// =============================================================================
function createWorldV2(opts = {}) {
  // v1 createWorld 그대로 사용 (인프라 공유)
  const world = v1.createWorld(opts);
  // v2 핵심: picker에 shadow price 주입 → 가격이 직업 선택에 진짜 영향
  world.priceFn = computeShadowPrices;
  // 직업 전환 빈도 21일 — 변동 줄여 안정성 ↑ (이전 7일)
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
    const npc = v1.createNPC({ job: bestJob });
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
    console.log(`  ⚰️  Day ${day}: 강제소개 → ${v.name}(land ${landMean.toFixed(2)}, ${count}명) → ${target.name}`);
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
}

if (require.main === module) main();

module.exports = {
  createWorldV2,
  tickWorldV2,
  computeShadowPrices,
  ELASTICITY,
  TAU,
  SUBSISTENCE_PER_NPC,
};
