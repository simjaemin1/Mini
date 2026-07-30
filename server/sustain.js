// === server/sustain.js — 랩 「공간 자원 층」의 econ 접점 이식 ===
//
// ★[11차 재민 지시] "한 번에 다 해" — econ 엔진이 읽는데 서버가 안 주던 land.* 키를 채운다.
//   엔진(sim/economy-engine.browser.js)은 이미 파이프를 갖고 있다. 값이 null이면 상한 미적용(현행 보존)이고,
//   값을 주면 min(raw, sustain) 으로 물린다. 그래서 **엔진을 건드리지 않고** 지리를 물릴 수 있다.
//
// 이식한 것(전부 랩 전쟁실험실 수식·상수 그대로):
//   woodSustain  = 숲셀수 × (L_WOODREGLOG·L_WOODMAX/4) × (0.9·wood/L_CHOP)
//                  로지스틱 MSY r·K/4. 벌채로 숲이 줄면 상한이 비례 축소 = 민둥산의 리비히 신호.
//   fishSustain  = Σ(L_FISHR·K/4) × FISH_ECON_PER_STOCK,  K=어장 버킷의 물셀 수
//                  → 버킷을 어떻게 묶든 ΣK = 노동권 물셀 총수라, 서버는 물셀을 바로 센다.
//   forageSustain= Σ(L_FORAGER·K/4) × FORAGE_ECON_PER_STOCK,  K=F_MAX·4·c·(1−c)
//                  c=주변 캐노피율 → 임연부(가장자리)가 최대. 깊은 숲·맨 초원은 낮다.
//   marginalQ    = 영토 한계지 품질 실측(리카도) — 좋은 땅부터 먹으므로 best-first 누적의 끝 품질.
//                  엔진 marginalLandQ 가 이 값이 있으면 합성 감쇠 대신 이걸 쓴다.
//   tin/obsidian/jade = 광맥 덩이의 **광물 종류**(specialty.pickMineral)를 land 키로.
//                  엔진 jobCapacity 의 miner 자리는 max(ore, obsidian, jade, tin) 이라, 셋이 undefined 면
//                  특수 산지가 게임에 존재하지 않는다(청동 시대인데 주석 산지가 없었다).
//
// ★단위 주의 — sustain 은 **하루 생산량** 단위다. 위 환산식의 baseWood/L_CHOP 같은 항이 그 환산이다.
//   랩은 셀 스톡을 매일 시뮬레이션하지만 서버는 실체 개체 모델이라, 스톡 대신 **개체·셀 수**로 K를 잰다.
//   (그래서 '이 어장이 지금 몇 마리 남았나'는 아직 랩만 안다 — 상한은 물리되고 재고는 미이식.)
'use strict';

// ---- 랩 상수(전쟁실험실 verbatim) ----
const L_WOODREGLOG = 0.004;   // 숲 로지스틱 재생률
const L_WOODMAX = 100;        // 숲 셀 richness 만땅
const L_CHOP = 8;             // 벌목 1스윙 산출
const L_FISHR = 0.02;         // 어장 재생률
const FISH_ECON_PER_STOCK = 2.5;
const L_FORAGER = 0.05;       // 임연부 재생률
const FORAGE_ECON_PER_STOCK = 0.2;
const F_MAX = 30;             // 임연부 richness 최대(캐노피 50%에서)
const L_FORAGEK_MIN = 5;      // 이 아래는 임연부로 안 본다
const LABOR_R = 150;          // 노동권 반경(셀) — 랩 §3b 확정값

// 임연부 richness. c = 주변 캐노피율(0~1).
function forageK(c) { return F_MAX * 4 * c * (1 - c); }

// 노동권(반경 150셀)을 2칸 간격으로 훑어 숲·물·임연부·바위경계 셀을 센다.
//   pred: { isForest(x,y), isWater(x,y), isRock(x,y) } — 전부 셀 좌표.
//   ★2칸 간격은 랩과 같다(랩 "2칸 간격 샘플") — 셀 수를 4배로 되돌려 쓰지 않는다(랩도 샘플 수를 그대로 쓴다).
function scanLabor(pred, ccx, ccy) {
  let forest = 0, water = 0, rockEdge = 0, forageSum = 0;
  const R = LABOR_R;
  for (let dy = -R; dy <= R; dy += 2) {
    for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R) continue;
      const x = ccx + dx, y = ccy + dy;
      if (pred.isWater(x, y)) { water++; continue; }
      if (pred.isRock(x, y)) {
        if (!pred.isRock(x - 1, y) || !pred.isRock(x + 1, y) || !pred.isRock(x, y - 1) || !pred.isRock(x, y + 1)) rockEdge++;
        continue;
      }
      if (!pred.isForest(x, y)) continue;
      forest++;
      // 캐노피율 c — 랩과 같은 3×3(±2) 표본
      let cs = 0, cn = 0;
      for (let ey = -2; ey <= 2; ey += 2) for (let ex = -2; ex <= 2; ex += 2) { cn++; if (pred.isForest(x + ex, y + ey)) cs++; }
      const K = forageK(cn ? cs / cn : 0);
      if (K > L_FORAGEK_MIN) forageSum += K;
    }
  }
  return { forest, water, rockEdge, forageSum };
}

// econ land.* 에 얹을 지속가능 상한. wood 는 land.wood(부존)와 곱해져 econ 단위가 된다.
function sustainOf(scan, landWood) {
  const wood = scan.forest * (L_WOODREGLOG * L_WOODMAX / 4) * (0.9 * (landWood || 1) / L_CHOP);
  const fish = scan.water * (L_FISHR / 4) * FISH_ECON_PER_STOCK;
  const forage = scan.forageSum * (L_FORAGER / 4) * FORAGE_ECON_PER_STOCK;
  return {
    woodSustain: scan.forest ? +wood.toFixed(2) : null,     // 숲 없으면 null = 상한 미적용(제로캡 전멸 방지 — 랩과 같은 규약)
    fishSustain: scan.water ? +fish.toFixed(2) : null,
    forageSustain: scan.forageSum > 0 ? +forage.toFixed(2) : null,
  };
}

// 리카도 한계지 품질 — 영토 셀 비옥도를 좋은 순으로 늘어놓고, 마지막 10%의 평균 / 처음 10%의 평균.
//   엔진 marginalLandQ 가 기대하는 건 "한계 땅 품질 배수"(1 이하). 실측이 있으면 합성 q(s)=(s/s0)^-β 를 대신한다.
function marginalQOf(fertList) {
  if (!fertList || fertList.length < 20) return null;
  const v = fertList.slice().sort((a, b) => b - a);
  const k = Math.max(1, Math.round(v.length * 0.1));
  let top = 0, bot = 0;
  for (let i = 0; i < k; i++) top += v[i];
  for (let i = v.length - k; i < v.length; i++) bot += v[i];
  if (top <= 0) return null;
  return +Math.max(0.05, Math.min(1, (bot / k) / (top / k))).toFixed(3);
}

// 광맥 덩이의 광물 종류 → land 키. 엔진 miner 자리가 max(ore, obsidian, jade, tin) 을 본다.
const MINERAL_KEY = { jade_raw: 'jade', jade: 'jade', obsidian: 'obsidian', tin: 'tin' };
function specialOf(minerals, oreVal) {
  const out = {};
  for (const m of (minerals || [])) {
    const k = MINERAL_KEY[m];
    if (k) out[k] = oreVal;   // 그 산지의 채굴 규모 = ore 와 같다(같은 덩이를 캐는 것이니)
  }
  return out;
}

module.exports = {
  scanLabor, sustainOf, marginalQOf, specialOf, forageK,
  LABOR_R, L_WOODREGLOG, L_WOODMAX, L_CHOP, L_FISHR, L_FORAGER, F_MAX, L_FORAGEK_MIN,
  FISH_ECON_PER_STOCK, FORAGE_ECON_PER_STOCK, MINERAL_KEY,
};
