#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T549 ⓪-b·⓪-c 자 · 제품 무변)
// =============================================================================
// 존 하나의 **해안선 띠 마스크**(서버 `WATER_TILES` 와 같은 것)를 셀 배열로 떨군다 — 띠 깊이 배수 · 고주파 옥타브 진폭 변형을 **자 안에서만**.
//   정본 `chunk.generateCoastlineWaterTiles` 를 부르지 않고 같은 식을 여기 옮겨 와 손잡이를 단다. 대신 **변형 0 판이 정본과 셀 하나까지 같은지**
//   먼저 대조하고(다르면 멈춘다) 그 뒤에만 변형을 잰다 — 옮긴 식이 정본에서 어긋나면 자가 거짓말을 하니까.
//   손잡이:  --k <배수>        띠 깊이 × k(닛폰만 · T549_BAND 와 같은 뜻)
//            --a3 <0~1>       fBm 3옥타브(320 px) 진폭 비율(1 = 지금 · 0 = 뺀다 · 평균은 보존 = 빠진 몫을 그 옥타브 평균 0.5 로 채운다)
//            --a2 <0~1>       2옥타브(960 px) 도 같은 식
// 쓰는 법: node scripts/t549-coast-band.js <zoneId> <out.u8> [--k 1] [--a3 1] [--a2 1]   → u8(NY×NX · 1 = 띠) + stdout 한 줄 JSON
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'nippon', OUT = process.argv[3] || '/tmp/band.u8';
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? +process.argv[i + 1] : d; };
const K = arg('--k', 1), A3 = arg('--a3', 1), A2 = arg('--a2', 1);
const { ZONES, findZoneAt } = R('server/zone-config');
const SZ = 32, ZONE = { ...ZONES[Z], id: Z };
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const NX = Math.ceil(ZONE.zoneWidth / SZ), NY = Math.ceil(ZONE.zoneHeight / SZ);

// ── 정본 식 사본(chunk.js 1196~1280) — 대조로 묶는다 ─────────────────────────
const BASE = 6000, NOISE = 5000;
function h2(ix, iy, oct) { let h = 5381; h = ((h * 33) ^ ix) >>> 0; h = ((h * 33) ^ iy) >>> 0; h = ((h * 33) ^ oct) >>> 0; return (((h * 9301 + 49297) >>> 0) % 1000) / 1000; }
function vn(x, y, step, oct) {
  const gx = x / step, gy = y / step, ix = Math.floor(gx), iy = Math.floor(gy), fx = gx - ix, fy = gy - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = h2(ix, iy, oct) * (1 - ux) + h2(ix + 1, iy, oct) * ux, b = h2(ix, iy + 1, oct) * (1 - ux) + h2(ix + 1, iy + 1, oct) * ux;
  return a * (1 - uy) + b * uy;
}
function fbm(x, y, a2, a3) {
  return vn(x, y, 3200, 1) * 0.50
       + (a2 === 1 ? vn(x, y, 960, 2) * 0.32 : (vn(x, y, 960, 2) * a2 + 0.5 * (1 - a2)) * 0.32)
       + (a3 === 1 ? vn(x, y, 320, 3) * 0.18 : (vn(x, y, 320, 3) * a3 + 0.5 * (1 - a3)) * 0.18);
}
function mask(k, a2, a3) {
  const M = new Uint8Array(NX * NY), maxD = (BASE + NOISE) * Math.max(1, k), maxD2 = maxD * maxD;
  for (let ty = 0; ty < NY; ty++) {
    const absY = ZONE.worldOffsetY + ty * SZ, dN = ty * SZ, dS = (NY - 1 - ty) * SZ;
    for (let tx = 0; tx < NX; tx++) {
      const absX = ZONE.worldOffsetX + tx * SZ, dW = tx * SZ, dE = (NX - 1 - tx) * SZ;
      if (Math.min(dW, dE, dN, dS) > maxD) continue;
      const ax = absX + SZ / 2, ay = absY + SZ / 2;
      let bd2 = maxD2, bnx = 0, bny = 0, hit = false;
      for (const O of OR) {
        const nx = ax < O.x0 ? O.x0 : (ax > O.x1 ? O.x1 : ax), ny = ay < O.y0 ? O.y0 : (ay > O.y1 ? O.y1 : ay);
        const dx = ax - nx, dy = ay - ny, d2 = dx * dx + dy * dy;
        if (d2 < bd2) { bd2 = d2; bnx = nx; bny = ny; hit = true; }
      }
      if (!hit) continue;
      const depth = (BASE + ((fbm(bnx, bny, a2, a3) - 0.5) * 2) * NOISE) * k;
      if (Math.sqrt(bd2) < depth) M[ty * NX + tx] = 1;
    }
  }
  return M;
}
// ── 대조: 변형 0 판 = 정본 ────────────────────────────────────────────────────
const canon = R('server/chunk').generateCoastlineWaterTiles(ZONE, SZ, findZoneAt, OR);
const M0 = mask(1, 1, 1); let diff = 0, n0 = 0;
for (let i = 0; i < M0.length; i++) { const c = canon.has(`${i % NX}_${(i / NX) | 0}`) ? 1 : 0; if (c !== M0[i]) diff++; n0 += c; }
if (diff) { console.error(`[T549 coast] 옮긴 식이 정본과 ${diff}셀 다르다 — 자를 고쳐라`); process.exit(3); }
const M = (K === 1 && A2 === 1 && A3 === 1) ? M0 : mask(K, A2, A3);
fs.writeFileSync(OUT, Buffer.from(M.buffer));
let n = 0; for (const v of M) n += v;
console.log(JSON.stringify({ zone: Z, NX, NY, k: K, a2: A2, a3: A3, band: n, bandPct: 100 * n / (NX * NY), canonBand: n0, canonMatch: true }));
