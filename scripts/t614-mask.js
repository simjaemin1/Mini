#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T614 ② 재료 · 관측 전용) 존 한 장의 셀 꼴(u8: 0 뭍 · 1 바다 띠 · 2 손그림 물 · 3 바위) + 다리 ON 본토 플러드(u8 1/0)
//   물 = 서버 통행 정본과 같은 둘(띠 `chunk.generateCoastlineWaterTiles` + `terrain.isWaterCellLocal`) — plan-bridges-v2 의 kind() 그대로 · 다리 칸은 물이어도 다닌다.
//   쓰는 법: [T614_PLAN=안.json] [T614_BRIDGES=br.json] node --require ./scripts/t614-pre.js scripts/t614-mask.js <존> <out 머리>  → <머리>.kind.u8 · <머리>.main.u8 · <머리>.json
'use strict';
process.env.ENABLE_VILLAGES = '0';
const path = require('path'), fs = require('fs');
const R = (q) => require(path.join(__dirname, '..', q));
const terrain = R('server/terrain'); const ZC = R('server/zone-config'); const { ZONES } = ZC;
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const ZID = process.argv[2], OUT = process.argv[3];
const Z = ZONES[ZID], SZ = 32, NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ), N = NX * NY;
const t0 = Date.now();
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const WT = R('server/chunk').generateCoastlineWaterTiles(Object.assign({ id: ZID }, Z), SZ, ZC.findZoneAt, OR);
const K = new Uint8Array(N);
for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2, i = cy * NX + cx;
  K[i] = WT.has(cx + '_' + cy) ? 1 : terrain.isWaterCellLocal(ZID, x, y) ? 2 : terrain.isRockCellLocal(ZID, x, y) ? 3 : 0;
}
const tK = Date.now() - t0;
const BR = new Uint8Array(N); const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) if (b[i] >= 0 && b[i + 1] >= 0 && b[i] < NX && b[i + 1] < NY) BR[b[i + 1] * NX + b[i]] = 1;
const blocked = (i) => K[i] === 3 || ((K[i] === 1 || K[i] === 2) && !BR[i]);
const M = new Uint8Array(N), q = new Int32Array(N); let h = 0, t = 0;
let sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ), s = sy * NX + sx;
if (blocked(s)) { outer: for (let r = 1; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const j = (sy + dy) * NX + sx + dx; if (!blocked(j)) { s = j; break outer; } } }
M[s] = 1; q[t++] = s;
while (h < t) { const i = q[h++], cx = i % NX, cy = (i / NX) | 0;
  if (cx > 0 && !M[i - 1] && !blocked(i - 1)) { M[i - 1] = 1; q[t++] = i - 1; }
  if (cx < NX - 1 && !M[i + 1] && !blocked(i + 1)) { M[i + 1] = 1; q[t++] = i + 1; }
  if (cy > 0 && !M[i - NX] && !blocked(i - NX)) { M[i - NX] = 1; q[t++] = i - NX; }
  if (cy < NY - 1 && !M[i + NX] && !blocked(i + NX)) { M[i + NX] = 1; q[t++] = i + NX; } }
fs.writeFileSync(OUT + '.kind.u8', K); fs.writeFileSync(OUT + '.main.u8', M);
const cnt = [0, 0, 0, 0]; for (let i = 0; i < N; i++) cnt[K[i]]++;
const meta = { zone: ZID, NX, NY, plan: process.env.T614_PLAN || null, bridges: b.length / 2, kinds: { land: cnt[0], band: cnt[1], water: cnt[2], rock: cnt[3] }, main: t, msKind: tK, ms: Date.now() - t0 };
fs.writeFileSync(OUT + '.json', JSON.stringify(meta));
console.log(JSON.stringify(meta));
