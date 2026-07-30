// === server/fertility.js — 셀 비옥도 **정본** ===
//
// ★[11차] 이 수식이 두 곳에서 쓰인다: 게임(villages.js 지형 어댑터)과 셀 지도(scripts/build-cell-map.js).
//   그래서 여기 한 곳에만 둔다. 복제하면 지도가 게임과 다른 땅을 보여 주게 된다 —
//   11차에 cell-viewer.html 이 지형 수식을 복제해 뒀다가 계곡·다리·개명을 다 놓친 그 실수다.
//
// 공식(청동기 취락 입지 고증 — 하천 충적지·구릉 사면):
//   fert = 0.12                       기본(척박한 땅도 0은 아니다)
//        + 0.62 · exp(-dw/28)         **충적·관개**: 물가가 최고, 28셀에서 1/e로 감쇠
//        + 0.18 · min(1, dr/12)       **산사면 배제**: 바위에서 12셀 넘게 떨어져야 만점
//        + 0.08 · (숲이면)            부식질 소폭(개간 비용은 별개 계산)
//   물·바위 셀 자체는 경작 불가 = 0.05. 최종 범위 [0.05, 1].
//   dw·dr 은 정확 유클리드 EDT(Felzenszwalb) 거리 — 링 스캔이 아니라 O(면적)이라 싸다.
'use strict';

const BASE = 0.12;      // 척박한 땅의 바닥값
const W_WATER = 0.62;   // 물가 가중
const DECAY = 28;       // 물거리 감쇠 상수(셀)
const W_ROCK = 0.18;    // 산사면 배제 가중
const ROCK_FULL = 12;   // 바위에서 이만큼 떨어지면 만점(셀)
const W_WOODY = 0.08;   // 숲 부식질
const BLOCKED = 0.05;   // 물·바위 = 경작 불가
const NEUTRAL = 0.5;    // 계산 범위 밖 — 예전 상수 동작으로 안전 회귀

// 한 셀의 비옥도. dw=가장 가까운 물까지(셀), dr=가장 가까운 바위까지(셀),
// woody=숲인가, blocked=이 셀이 물이거나 바위인가.
function fertAt(dw, dr, woody, blocked) {
  if (blocked) return BLOCKED;
  const f = BASE
    + W_WATER * Math.exp(-Math.min(dw, 999) / DECAY)
    + W_ROCK * Math.min(1, dr / ROCK_FULL)
    + W_WOODY * (woody ? 1 : 0);
  return Math.max(BLOCKED, Math.min(1, f));
}

// 박스 [x0..x1]×[y0..y1] 의 비옥도장. src 는 { isWater, isRock, isWoody, maskEDT }.
//   maskEDT(pred, x0, y0, x1, y1) → { at(x,y) } (village-layout.js 제공)
function buildField(src, x0, y0, x1, y1) {
  const WD = src.maskEDT((x, y) => src.isWater(x, y), x0, y0, x1, y1);
  const RD = src.maskEDT((x, y) => src.isRock(x, y), x0, y0, x1, y1);
  const W = x1 - x0 + 1, H = y1 - y0 + 1, g = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x0 + x, cy = y0 + y;
    g[y * W + x] = fertAt(WD.at(cx, cy), RD.at(cx, cy), src.isWoody(cx, cy), src.isWater(cx, cy) || src.isRock(cx, cy));
  }
  return {
    at: (x, y) => { const ix = x - x0, iy = y - y0; return (ix < 0 || iy < 0 || ix >= W || iy >= H) ? NEUTRAL : g[iy * W + ix]; },
    raw: g, x0, y0, w: W, h: H,
  };
}

module.exports = { fertAt, buildField, BASE, W_WATER, DECAY, W_ROCK, ROCK_FULL, W_WOODY, BLOCKED, NEUTRAL };
