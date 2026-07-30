// === server/fertility.js — 셀 비옥도 **정본** ===
//
// ★[11차] 이 수식이 두 곳에서 쓰인다: 게임(villages.js 지형 어댑터)과 셀 지도(scripts/build-cell-map.js).
//   그래서 여기 한 곳에만 둔다. 복제하면 지도가 게임과 다른 땅을 보여 주게 된다 —
//   11차에 cell-viewer.html 이 지형 수식을 복제해 뒀다가 계곡·다리·개명을 다 놓친 그 실수다.
//
// 공식(청동기 취락 입지 고증 — 하천 충적지·구릉 사면):
//   fert = 0.12                       기본(척박한 땅도 0은 아니다)
//        + 0.62 · exp(-dw/80)         **충적·관개**: 물가가 최고, 80셀에서 1/e로 감쇠
//        + 0.18 · min(1, dr/60)       **산사면 배제**: 바위에서 60셀 넘게 떨어져야 만점
//        + 0.08 · (숲이면)            부식질 소폭(개간 비용은 별개 계산)
//
// ★[11차 재민 지적 "색 차이가 없는데..?" — 척도 교정]
//   처음 상수(감쇠 28셀 · 바위만점 12셀)는 **마을 박스(반경 62셀)** 안에서 고른 값이었다.
//   존 전체(2188×4063셀)에 깔아 보니 두 항이 전부 포화해 **거의 상수 0.30**이 됐다:
//     실측 거리 분포 — 물까지 중앙값 101셀(10/90% 18/281) · 바위까지 중앙값 204셀(10/90% 36/506)
//     → dr/12 는 땅의 90%가 만점, exp(-101/28)=0.027 이라 물항도 절반이 0
//     → 경작 가능 땅의 **44%가 0.30±0.02 한 칸**에 몰림(중앙값 0.33 · 편차 0.148)
//   척도를 실제 거리 분포에 맞췄다(감쇠 80 · 바위만점 60):
//     중앙값 0.33→0.47 · 편차 0.148→0.184 · 한 칸 집중 44%→9%
//   ★가중치(0.62/0.18/0.08)와 기본값·차단값은 **건드리지 않았다** — 바꾼 건 '거리 척도'뿐이라
//     "물가가 좋다·산사면은 나쁘다"는 순위는 그대로고, 그 판단이 미치는 범위만 넓어졌다.
//   물·바위 셀 자체는 경작 불가 = 0.05. 최종 범위 [0.05, 1].
//   dw·dr 은 정확 유클리드 EDT(Felzenszwalb) 거리 — 링 스캔이 아니라 O(면적)이라 싸다.
'use strict';

const BASE = 0.12;      // 척박한 땅의 바닥값
const W_WATER = 0.62;   // 물가 가중
const DECAY = 80;       // 물거리 감쇠 상수(셀) — 실측 물거리 중앙값 101셀에 맞춘 척도
const W_ROCK = 0.18;    // 산사면 배제 가중
const ROCK_FULL = 60;   // 바위에서 이만큼 떨어지면 만점(셀) — 실측 바위거리 중앙값 204셀에 맞춘 척도
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
