// === 고정 빈 히스토그램 — tick 간격 백분위수 ==================================
// ★왜 배열이 아니라 히스토그램인가 [2026-09-01]
//   종전 loadtest.js 는 간격을 전부 배열에 쌓고 5만 개가 넘으면 `splice(0, 10000)` 로
//   앞을 잘랐다. 클라 400 × 30Hz × 60초 = **72만 표본**이라 배열이 계속 잘려 나가,
//   p95 가 "전 구간"이 아니라 **최근 구간**의 값이 된다. 게다가 잘리는 정도가 클라 수에
//   따라 달라져 **단계끼리 비교 자체가 성립하지 않는다.**
//   ⇒ 1ms 폭 고정 빈. 메모리 O(1)·전 구간 정확·1ms 해상도(이상 간격이 33ms 라 충분).
'use strict';
const HMAX = 2000;                       // 0..2000ms · 그 이상은 over 로

function newHist() { return { bins: new Int32Array(HMAX + 1), over: 0, n: 0, sum: 0, max: 0 }; }

function hAdd(h, v) {
  v = v | 0; if (v < 0) v = 0;
  h.n++; h.sum += v; if (v > h.max) h.max = v;
  if (v >= HMAX) h.over++; else h.bins[v]++;
}

// p 분위수 — 정렬 배열의 `sorted[ceil(n*p) - 1]` 과 같은 정의(nearest-rank).
function hPct(h, p) {
  if (!h.n) return NaN;
  const want = Math.max(1, Math.ceil(h.n * p));
  let acc = 0;
  for (let i = 0; i < HMAX; i++) { acc += h.bins[i]; if (acc >= want) return i; }
  return h.max;                          // 넘침 구간에 걸리면 실측 최대를 준다
}

// thr 을 **넘은**(> thr) 표본 비율 0..1
function hOverRatio(h, thr) {
  if (!h.n) return NaN;
  let c = h.over;
  for (let i = thr + 1; i < HMAX; i++) c += h.bins[i];
  return c / h.n;
}

const hMean = (h) => (h.n ? h.sum / h.n : NaN);

module.exports = { HMAX, newHist, hAdd, hPct, hOverRatio, hMean };
