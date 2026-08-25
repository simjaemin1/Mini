#!/usr/bin/env node
// 산 **덩어리의 실제 크기**를 정본 술어로 재서, 지금 높이 규약(HMAX/LAM)이 만드는
// 봉우리 높이가 나무 키와 어떤 급인지 숫자로 낸다. 의견 말고 실측.
//   ★지형 데이터·술어는 **읽기만** 한다. 한 바이트도 안 고친다.
const path = require('path');
const T = require(path.join(__dirname, '..', 'server', 'terrain.js'));
const isRock = T.isRockCellLocal;
const ZID = process.env.ZID || 'hanbando';

// ★기본값을 **지금 라이브**에 맞춘다(옛 9/10 은 35m 판 이전 값이다).
//   DCAP 는 리본 수리(2026-08-24)에서 들어온 dE 상한 — 렌더가 실제로 쓰는 식과 맞춘다.
const HMAX = +(process.env.HMAX || 35), LAM = +(process.env.LAM || 12);
const DCAP = +(process.env.DCAP || 24);
const X0 = +(process.env.X0 || 1500), Y0 = +(process.env.Y0 || 0);
const W = +(process.env.W || 900), H = +(process.env.H || 700);

console.log(`창 (${X0},${Y0}) ${W}×${H}셀 — 정본 isRockCellLocal 로 바위 마스크를 뜬다`);
const m = new Uint8Array(W * H);
let nrock = 0;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  // ★정본 술어는 **월드 픽셀**을 받는다(ridge.path 가 px 단위다). 셀 중심으로 넣는다.
  if (isRock(ZID, (X0 + i) * 32 + 16, (Y0 + j) * 32 + 16)) { m[j * W + i] = 1; nrock++; }
}
console.log(`바위 셀 ${nrock} (${(nrock / (W * H) * 100).toFixed(1)}%)`);

// ── 연결 성분(4-이웃) ──────────────────────────────────────────────────────
const lab = new Int32Array(W * H).fill(-1);
const comps = [];
const st = new Int32Array(W * H);
for (let s = 0; s < W * H; s++) {
  if (!m[s] || lab[s] >= 0) continue;
  const id = comps.length; let sp = 0; st[sp++] = s; lab[s] = id;
  const cells = [];
  while (sp) {
    const k = st[--sp]; cells.push(k);
    const x = k % W, y = (k / W) | 0;
    for (const o of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + o[0], ny = y + o[1];
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (m[n] && lab[n] < 0) { lab[n] = id; st[sp++] = n; }
    }
  }
  comps.push(cells);
}
console.log(`산 덩어리 ${comps.length}개`);

// ── 가장자리 거리장(챔퍼) — client 의 _mt3Field 와 같은 식 ────────────────
const INF = 1e6, d = new Float32Array(W * H);
for (let k = 0; k < W * H; k++) d[k] = m[k] ? INF : 0;
// ★★[계측기 수리 2026-08-25] **창 밖을 INF(=미해결 바위)로 보고 있었다.**
//   그러면 창 가장자리에 걸친 덩어리의 dE 가 바깥 땅에 안 잘려 **부풀고**, 그 값이
//   "산괴 중심까지 47셀" 같은 숫자로 인용됐다. probe-mtpad·pickSite·_mt3Field 에서
//   잡은 것과 **같은 족**의 버그다. ⇒ 창 밖은 **땅(0)** 으로 본다(깊이의 하한).
//   그래도 창에 걸친 덩어리는 참값을 모르므로 **표에서 따로 표시**하고 통계에서 뺀다.
const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H) ? 0 : d[j * W + i];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const k = j * W + i; if (!d[k]) continue;
  d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const k = j * W + i; if (!d[k]) continue;
  d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }

const hOf = (dE) => HMAX * (1 - Math.exp(-Math.min(dE, DCAP) / LAM));   // ★렌더와 같은 상한
const rows = comps.map((cells) => {
  let dmax = 0, xs = 1e9, xe = -1e9, ys = 1e9, ye = -1e9;
  for (const k of cells) {
    if (d[k] > dmax) dmax = d[k];
    const x = k % W, y = (k / W) | 0;
    if (x < xs) xs = x; if (x > xe) xe = x; if (y < ys) ys = y; if (y > ye) ye = y;
  }
  const clipped = xs === 0 || ys === 0 || xe === W - 1 || ye === H - 1;   // 창에 잘렸나
  return { n: cells.length, dmax, w: xe - xs + 1, h: ye - ys + 1, peak: hOf(dmax), clipped };
}).sort((a, b) => b.n - a.n);

const pct = (arr, p) => arr.length ? arr.slice().sort((a, b) => a - b)[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0;
const clippedN = rows.filter(r => r.n >= 9 && r.clipped).length;
const big = rows.filter(r => r.n >= 9 && !r.clipped);        // ★창에 잘린 덩어리는 통계에서 뺀다
console.log(`창에 걸쳐 값을 못 믿는 덩어리 ${clippedN}개는 통계에서 제외`);
console.log(`\n덩어리 ${big.length}개(9셀 이상)`);
console.log(`덩어리 크기(셀): 중앙 ${pct(big.map(r => r.n), .5)} · 90% ${pct(big.map(r => r.n), .9)} · 최대 ${big[0] ? big[0].n : 0}`);
console.log(`가로×세로(셀) 중앙: ${pct(big.map(r => r.w), .5)} × ${pct(big.map(r => r.h), .5)}`);
console.log(`중심까지 거리 dmax: 중앙 ${pct(big.map(r => r.dmax), .5).toFixed(1)} · 90% ${pct(big.map(r => r.dmax), .9).toFixed(1)} · 최대 ${big[0] ? big[0].dmax.toFixed(1) : 0}`);

console.log(`\n[지금 규약 HMAX ${HMAX} / LAM ${LAM} — 1셀 = 1m]`);
const peaks = big.map(r => r.peak);
console.log(`  봉우리 높이: 중앙 ${pct(peaks, .5).toFixed(1)}m · 90% ${pct(peaks, .9).toFixed(1)}m · 최대 ${Math.max(...peaks).toFixed(1)}m`);
console.log(`  가장자리 기울기 = HMAX/LAM = ${(HMAX / LAM).toFixed(2)} m/셀`);
console.log(`  성목 3~8m(중앙 5.5m) 대비 봉우리 = ${(pct(peaks, .5) / 5.5).toFixed(1)}배`);

console.log('\n[큰 덩어리 10개]');
console.log('  ' + ['셀수', '가로', '세로', 'dmax', '봉우리m', '창잘림'].map(s => s.padStart(9)).join(''));
for (const r of rows.slice(0, 10))
  console.log('  ' + [r.n, r.w, r.h, r.dmax.toFixed(1), r.peak.toFixed(1), r.clipped ? '예' : '-'].map(s => String(s).padStart(9)).join(''));

console.log('\n[대안 — 발자국은 그대로, HMAX/LAM 만 바꾸면]');
console.log('  ' + ['HMAX', 'LAM', '중앙봉우리m', '90%봉우리m', '가장자리m/셀', '나무대비'].map(s => s.padStart(12)).join(''));
for (const p of [[9, 10], [20, 6], [35, 12], [35, 4], [60, 12]]) {
  const f = (dE) => p[0] * (1 - Math.exp(-Math.min(dE, DCAP) / p[1]));
  const ps = big.map(r => f(r.dmax));
  console.log('  ' + [p[0], p[1], pct(ps, .5).toFixed(1), pct(ps, .9).toFixed(1), (p[0] / p[1]).toFixed(1),
    (pct(ps, .5) / 5.5).toFixed(1) + '배'].map(s => String(s).padStart(12)).join(''));
}
