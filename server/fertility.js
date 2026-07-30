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
//        + 0.08 · 임상(0~1)            부식질 — **캐노피 비율**이라 경계에서 매끄럽다
//
// ★[11차 재민 지적] "숲 구역의 등고선이 숲 바깥이랑 어긋나"
//   원인: 숲 항이 **0/1 계단**이었다. 실측(숲 경계 단면 x347~363, y200):
//     숲 안쪽 기울기는 셀당 0.003인데 경계 한 셀에서 **-0.083이 통째로 떨어졌다**.
//     지도 등급 폭이 0.10이니 등고선이 한 칸 어긋나 보인 것 — 눈으로 잡은 게 정확했다.
//   고침: 숲 여부를 **반경 WOODY_R 안 캐노피 비율**(0~1)로 바꿨다. 실제 토양도 숲 가장자리에서
//     부식질이 서서히 옅어진다(임연부). 전이 구간이 2·WOODY_R 이라 셀당 기울기가 물 항과 같은 자릿수가 된다.
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
const W_WOODY = 0.08;   // 숲 부식질(임상 비율 0~1에 곱한다)
const WOODY_R = 8;      // 임상 비율을 재는 반경(셀) — 전이 구간 ≈ 17셀
const BLOCKED = 0.05;   // 물·바위 = 경작 불가
const NEUTRAL = 0.5;    // 계산 범위 밖 — 예전 상수 동작으로 안전 회귀

// 한 셀의 비옥도. dw=가장 가까운 물까지(셀), dr=가장 가까운 바위까지(셀),
// woody=임상 비율 0~1(불리언을 줘도 동작), blocked=이 셀이 물이거나 바위인가.
function fertAt(dw, dr, woody, blocked) {
  if (blocked) return BLOCKED;
  const wf = Math.max(0, Math.min(1, +woody || 0));
  const f = BASE
    + W_WATER * Math.exp(-Math.min(dw, 999) / DECAY)
    + W_ROCK * Math.min(1, dr / ROCK_FULL)
    + W_WOODY * wf;
  return Math.max(BLOCKED, Math.min(1, f));
}

// 박스 [x0..x1]×[y0..y1] 의 비옥도장. src 는 { isWater, isRock, isWoody, maskEDT }.
//   maskEDT(pred, x0, y0, x1, y1) → { at(x,y) } (village-layout.js 제공)
function buildField(src, x0, y0, x1, y1) {
  const WD = src.maskEDT((x, y) => src.isWater(x, y), x0, y0, x1, y1);
  const RD = src.maskEDT((x, y) => src.isRock(x, y), x0, y0, x1, y1);
  const W = x1 - x0 + 1, H = y1 - y0 + 1, g = new Float32Array(W * H);
  // ★임상 비율 — 박스 평균(적분영상). 숲 경계의 0/1 계단을 없애는 유일한 목적.
  //   박스는 상자 밖도 봐야 정확하므로 WOODY_R 만큼 넓힌 격자로 만든다.
  const M = WOODY_R, BW = W + 2 * M, BH = H + 2 * M;
  const ii = new Int32Array((BW + 1) * (BH + 1));
  for (let y = 0; y < BH; y++) {
    let row = 0;
    for (let x = 0; x < BW; x++) {
      row += src.isWoody(x0 - M + x, y0 - M + y) ? 1 : 0;
      ii[(y + 1) * (BW + 1) + (x + 1)] = ii[y * (BW + 1) + (x + 1)] + row;
    }
  }
  const woodyFrac = (cx, cy) => {
    const bx = cx - x0 + M, by = cy - y0 + M;
    const ax = Math.max(0, bx - M), ay = Math.max(0, by - M);
    const bx2 = Math.min(BW - 1, bx + M), by2 = Math.min(BH - 1, by + M);
    const n = (bx2 - ax + 1) * (by2 - ay + 1);
    const sum = ii[(by2 + 1) * (BW + 1) + (bx2 + 1)] - ii[ay * (BW + 1) + (bx2 + 1)]
      - ii[(by2 + 1) * (BW + 1) + ax] + ii[ay * (BW + 1) + ax];
    return n > 0 ? sum / n : 0;
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = x0 + x, cy = y0 + y;
    g[y * W + x] = fertAt(WD.at(cx, cy), RD.at(cx, cy), woodyFrac(cx, cy), src.isWater(cx, cy) || src.isRock(cx, cy));
  }
  return {
    at: (x, y) => { const ix = x - x0, iy = y - y0; return (ix < 0 || iy < 0 || ix >= W || iy >= H) ? NEUTRAL : g[iy * W + ix]; },
    raw: g, x0, y0, w: W, h: H,
  };
}

module.exports = { fertAt, buildField, BASE, W_WATER, DECAY, W_ROCK, ROCK_FULL, W_WOODY, WOODY_R, BLOCKED, NEUTRAL };
