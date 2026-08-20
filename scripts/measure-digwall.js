#!/usr/bin/env node
// ⓑ "1셀 부수면 열리는 벽" — 정본 술어 + 클라와 **같은 높이식**으로 잰다.
//   길드가 가장자리 셀을 하나씩 파 들어갈 때, 옆에 서는 벽이 몇 m 인가.
//   ★지형 데이터는 읽기만 한다. 파괴는 이 스크립트 안의 사본 마스크에서만 한다.
const path = require('path');
const T = require(path.join(__dirname, '..', 'server', 'terrain.js'));
const ZID = 'hanbando';

// ── client.js 의 상수를 **파일에서 읽어** 쓴다(손으로 베끼면 어긋난다) ──
const fs = require('fs');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'public', 'client.js'), 'utf8');
const num = (re, d) => { const m = re.exec(SRC); return m ? parseFloat(m[1]) : d; };
const HMAX = num(/let MT3_HMAX = ([\d.]+)/, 35), LAM = num(/MT3_HMAX = [\d.]+, MT3_LAM = ([\d.]+)/, 12);
const LAMV = num(/MT3_LAMV = ([\d.]+)/, 0.6), HV = num(/MT3_HV = ([\d.]+)/, 0.62);
console.log(`클라 상수: HMAX ${HMAX} · LAM ${LAM} · LAMV ${LAMV} · HV ${HV}`);

const CX = +(process.env.CX || 1895), CY = +(process.env.CY || 200), R = 60;
const N = R * 2;
const I0 = CX - R, J0 = CY - R;
const rock = new Uint8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++)
  rock[j * N + i] = T.isRockCellLocal(ZID, (I0 + i) * 32 + 16, (J0 + j) * 32 + 16) ? 1 : 0;

function heights(mask) {
  const INF = 1e6, d = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) d[k] = mask[k] ? INF : 0;
  const at = (i, j) => (i < 0 || j < 0 || i >= N || j >= N) ? INF : d[j * N + i];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const k = j * N + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.414, at(i + 1, j - 1) + 1.414); }
  for (let j = N - 1; j >= 0; j--) for (let i = N - 1; i >= 0; i--) { const k = j * N + i; if (!d[k]) continue;
    d[k] = Math.min(d[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.414, at(i - 1, j + 1) + 1.414); }
  const TN = [1, 2, 1];
  for (let p = 0; p < 2; p++) { const src = Float32Array.from(d);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!mask[j * N + i]) continue;
      const c0 = src[j * N + i]; let sum = 0, w = 0;
      for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
        const ii = i + a, jj = j + b, wt = TN[a + 1] * TN[b + 1];
        const ok = ii >= 0 && jj >= 0 && ii < N && jj < N && mask[jj * N + ii];
        sum += (ok ? src[jj * N + ii] : c0) * wt; w += wt;
      }
      d[j * N + i] = sum / w;
    } }
  // 거시항·잡음은 자리마다 달라 '대표값'을 흐린다 — 벽 높이의 **골격**만 본다(프로파일 그대로).
  const h = new Float32Array(N * N);
  for (let k = 0; k < N * N; k++) h[k] = mask[k] ? HMAX * (1 - Math.exp(-d[k] / LAM)) : 0;
  return h;
}

// 가장자리에서 안쪽으로 곧게 파 들어간다(4-인접 바위만 팔 수 있다는 규칙 준수)
const mask = Uint8Array.from(rock);
let si = -1, sj = -1;
outer: for (let j = 2; j < N - 2; j++) for (let i = 2; i < N - 2; i++) {
  if (!mask[j * N + i]) continue;
  if (mask[j * N + i - 1]) continue;             // 서쪽이 뭍인 가장자리 셀
  let ok = true; for (let k = 0; k < 20; k++) if (!mask[j * N + i + k]) { ok = false; break; }
  if (ok) { si = i; sj = j; break outer; }
}
if (si < 0) { console.log('곧게 20셀 들어가는 가장자리를 못 찾았다'); process.exit(0); }
console.log(`판 자리: 셀 (${I0 + si}, ${J0 + sj}) 에서 동쪽으로\n`);
console.log('  ' + ['판 셀 수', '내 발밑 바닥', '앞 벽 높이', '옆 벽 높이'].map(s => s.padStart(13)).join(''));
for (let n = 0; n <= 12; n++) {
  if (n > 0) mask[sj * N + si + n - 1] = 0;      // 한 셀씩 부순다 — 늘 가장자리에서만
  const h = heights(mask);
  const front = h[sj * N + si + n];              // 내 앞 셀(아직 바위)
  const side = Math.max(h[(sj - 1) * N + si + Math.max(0, n - 1)],
                        h[(sj + 1) * N + si + Math.max(0, n - 1)]);
  console.log('  ' + [n, '0.0m', front.toFixed(1) + 'm', (n ? side.toFixed(1) + 'm' : '—')]
    .map(s => String(s).padStart(13)).join(''));
}
