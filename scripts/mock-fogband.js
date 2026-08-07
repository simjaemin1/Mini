#!/usr/bin/env node
// =============================================================================
// 시안 — "검은색 띠는 대체 왜 있는 거야?" [재민 2026-08-07]
//
// ★답은 이미 세 번 재서 나왔다: 그 띠는 **전장의 안개의 '못 본 땅' 채움**이다.
//     · 색이 정확히 rgb(0,0,0)      (배경은 #0a0d10, UI 는 rgb(15,19,23) — 둘 다 아니다)
//     · 경계 기울기가 정확히 ±2px/행 (셀 다이아 계단 = iso 격자)
//     · 안개 코드는 배치 19 이전과 **0줄 차이** — 새로 생긴 게 아니다
//   바위 위 검은 띠는 산이 덮으면 사라진다(산 덮개 건과 같은 뿌리).
//   ★그러나 **풀 위 검은 띠는 산과 무관하게 남는다** — 그건 그냥 안 가 본 땅이다.
//
// 그래서 남는 질문은 하나다: **안 가 본 땅을 순수 검정으로 둘 것인가.**
//   이건 취향 갈림이라 구현하지 않고 시안 3안으로 회부한다.
//
//   ① 현행      순수 검정 · 계단 경계
//   ② 경계만    검정은 그대로, 경계를 6px 흐림 — 계단만 없앤다
//   ③ 배경색    #0a0d10 + 경계 흐림 — "칠해진 검은 물체"가 아니라 "아직 안 그린 세상"으로 읽힌다
//
// ★이건 후처리 목업이다(클라 무접촉). 재민이 고르면 그때 안개 마스크에 손댄다.
// 입력: 라이브 하네스가 찍은 스크린샷. 기본 /tmp/occ-occon.png
// =============================================================================
'use strict';
const fs = require('fs');
const { PNG } = require('pngjs');

const SRC = process.argv[2] || '/tmp/occ-occon.png';
const src = PNG.sync.read(fs.readFileSync(SRC));
const W = src.width, H = src.height;

// ── 순수 검정( = 안 본 땅) 마스크. UI 띠는 rgb(15,19,23) 이라 안 걸린다.
const m = new Float32Array(W * H);
let nBlack = 0;
for (let i = 0; i < W * H; i++) {
  const r = src.data[i * 4], g = src.data[i * 4 + 1], b = src.data[i * 4 + 2];
  if (r === 0 && g === 0 && b === 0) { m[i] = 1; nBlack++; }
}
console.log(`${SRC} ${W}×${H} · 순수 검정 화소 ${nBlack} (${(nBlack / (W * H) * 100).toFixed(1)}%)`);
if (!nBlack) { console.log('★이 그림엔 검은 띠가 없다 — 다른 스크린샷을 넣어라.'); process.exit(1); }

// 경계 기울기 실측 — 정말 셀 다이아 계단인지 다시 확인한다(주장 말고 수)
{
  const rows = [];
  for (let y = 2; y < H - 2; y += 1) {
    let x = -1;
    for (let xx = 0; xx < W; xx++) if (m[y * W + xx]) x = xx; else if (x >= 0) break;
    if (x > 2 && x < W - 3) rows.push([y, x]);
  }
  const slopes = [];
  for (let i = 1; i < rows.length; i++) if (rows[i][0] === rows[i - 1][0] + 1) slopes.push(rows[i][1] - rows[i - 1][1]);
  slopes.sort((a, b) => a - b);
  const abs = slopes.map(Math.abs).sort((a, b) => a - b);
  console.log(`  경계 기울기 중앙값 ${abs.length ? abs[abs.length >> 1] : '-'} px/행  (셀 다이아면 2)`);
}

// 상자 흐림 — 마스크만 부드럽게
function blur(mask, r) {
  const t = new Float32Array(W * H), o = new Float32Array(W * H);
  for (let y = 0; y < H; y++) { let s = 0;
    for (let x = -r; x <= r; x++) s += mask[y * W + Math.max(0, Math.min(W - 1, x))];
    for (let x = 0; x < W; x++) { t[y * W + x] = s / (2 * r + 1);
      s += mask[y * W + Math.min(W - 1, x + r + 1)] - mask[y * W + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0;
    for (let y = -r; y <= r; y++) s += t[Math.max(0, Math.min(H - 1, y)) * W + x];
    for (let y = 0; y < H; y++) { o[y * W + x] = s / (2 * r + 1);
      s += t[Math.min(H - 1, y + r + 1) * W + x] - t[Math.max(0, y - r) * W + x]; } }
  return o;
}

// 검정 밑에 깔린 '진짜 지면'은 없다(안개가 이미 덮었다). 그래서 흐림은 안개 **가장자리**만
// 부드럽게 만든다 — 인접 화소를 섞어 계단을 없앤다.
function compose(mask, col, name) {
  const out = new PNG({ width: W, height: H });
  src.data.copy(out.data);
  for (let i = 0; i < W * H; i++) {
    const a = mask[i]; if (a <= 0.002) continue;
    // 가장자리 화소는 원래 그림과 섞는다
    for (let c = 0; c < 3; c++) {
      const o = src.data[i * 4 + c];
      out.data[i * 4 + c] = Math.round(o * (1 - a) + col[c] * a);
    }
  }
  fs.writeFileSync(name, PNG.sync.write(out));
  return name;
}

// ① 현행은 원본 그대로
fs.writeFileSync('/tmp/fog-1.png', PNG.sync.write(src));
// ② 검정 유지 + 경계 흐림
const soft = blur(m, 5);
// 안쪽은 완전 검정으로 되돌린다(흐림이 속까지 옅게 만들면 안 본 땅이 비친다)
for (let i = 0; i < W * H; i++) if (m[i] && soft[i] > 0.55) soft[i] = 1;
compose(soft, [0, 0, 0], '/tmp/fog-2.png');
// ③ 배경색 + 경계 흐림
compose(soft, [10, 13, 16], '/tmp/fog-3.png');
console.log('산출: /tmp/fog-1.png(현행) · /tmp/fog-2.png(경계만) · /tmp/fog-3.png(배경색)');
