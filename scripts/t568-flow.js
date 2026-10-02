// (@regress 없음 — 러너 밖 · T568 PM 자 · 라이브 DB 사본 위 개울 미리보기 · 제품 무변)
// 우선순위 범람(priority-flood)으로 물(바다 띠·민물)에서 바깥으로 흐름 방향을 정하고, 거꾸로 쌓아 집수 면적(acc)을 만든다.
// 입력: kind.u8 (NY*NX) · cost.f32(높이 대용 = 물까지 거리 + 잔물결) · 출력: acc.u32 · down.i32
'use strict';
const fs = require('fs');
const [,, NXs, NYs, kindF, costF, outAcc, outDown] = process.argv;
const NX = +NXs, NY = +NYs, N = NX * NY;
const kind = new Uint8Array(fs.readFileSync(kindF).buffer);
const cb = fs.readFileSync(costF); const cost = new Float32Array(cb.buffer, cb.byteOffset, N);
const down = new Int32Array(N).fill(-2);   // -2 미방문 · -1 물(끝)
const order = new Int32Array(N); let on = 0;
// 이진 힙 (키 = cost)
let hk = new Float32Array(1 << 22), hv = new Int32Array(1 << 22), hn = 0;
function grow() { const k2 = new Float32Array(hk.length * 2); k2.set(hk); hk = k2; const v2 = new Int32Array(hv.length * 2); v2.set(hv); hv = v2; }
function push(k, v) { if (hn >= hk.length) grow(); let i = hn++; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= k) break; hk[i] = hk[p]; hv[i] = hv[p]; i = p; } hk[i] = k; hv[i] = v; }
function pop() { const v = hv[0], k = hk[--hn], vv = hv[hn]; let i = 0; for (;;) { let c = 2 * i + 1; if (c >= hn) break; if (c + 1 < hn && hk[c + 1] < hk[c]) c++; if (hk[c] >= k) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; } hk[i] = k; hv[i] = vv; return v; }
for (let i = 0; i < N; i++) { const k = kind[i]; if (k === 2 || k === 3 || k === 0) down[i] = -1; }
// 물 셀 중 뭍과 맞닿은 것만 씨앗으로
const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];
for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++) {
  const i = y * NX + x; if (down[i] !== -1) continue;
  for (let d = 0; d < 4; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const j = ny * NX + nx;
    if (down[j] === -2) { down[j] = i; push(cost[j], j); } }
}
// 흐름 방향이 이미 정해진 셀(down[j]=부모)을 꺼내 이웃을 그 셀 쪽으로
const seen = new Uint8Array(N);
while (hn) {
  const i = pop(); if (seen[i]) continue; seen[i] = 1; order[on++] = i;
  const x = i % NX, y = (i / NX) | 0;
  for (let d = 0; d < 8; d++) { const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue; const j = ny * NX + nx;
    if (down[j] === -2) { down[j] = i; push(Math.max(cost[j], cost[i]), j); } }
}
const acc = new Uint32Array(N);
for (let t = on - 1; t >= 0; t--) { const i = order[t]; acc[i] += 1; const d = down[i]; if (d >= 0) acc[d] += acc[i]; }
fs.writeFileSync(outAcc, Buffer.from(acc.buffer)); fs.writeFileSync(outDown, Buffer.from(down.buffer));
console.log('flow ok · 뭍 셀', on);
