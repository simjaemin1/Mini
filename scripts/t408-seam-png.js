#!/usr/bin/env node
// === scripts/t408-seam-png.js — 경계 띠 확대 그림 (T408 ①·③) =========================
//
// ★계측기다 — 러너 밖. 제품 술어를 **그 칸을 가진 존**으로 부른다(클라·서버가 실제로 그 칸을 판정하는 방식).
//   칸마다: 세계 좌표 → 가진 존(`findZoneAt` 과 같은 사각형 규칙) → 그 존 로컬 → 물(파랑) · 바위(회색) ·
//   숲 배수 > 1.5(짙은 초록) · 그 밖은 그 존 `groundColor`. 경계선은 빨강.
//   **나무 개체**도 찍는다 — 두 존의 청크가 **각자 낳는** 나무: 왼쪽 존 것은 주황 · 오른쪽 존 것은 흰색.
//   (주황이 빨간 선을 넘어가면 그 존이 **남의 땅에** 나무를 낳은 것이다.)
//
// 실행: node scripts/t408-seam-png.js <out.png> <seam: east|west> <y1,y2,...>(한반도 로컬 y)
'use strict';
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const ROOT = path.join(__dirname, '..');
const { ZONES } = require(path.join(ROOT, 'server', 'zone-config'));
const terrain = require(path.join(ROOT, 'server', 'terrain'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);
const chunk = require(path.join(ROOT, 'server', 'chunk'));
const cs = chunk.CHUNK_SIZE;
const [OUT, SEAM, YS] = process.argv.slice(2);
const ys = String(YS).split(',').map(Number);
const HB = ZONES.hanbando;
const L = SEAM === 'west' ? 'jungwon_n' : 'hanbando', R = SEAM === 'west' ? 'hanbando' : 'nippon';
const seamX = SEAM === 'west' ? HB.worldOffsetX : HB.worldOffsetX + HB.zoneWidth;   // 세계 x
const TILE = 2048, SC = 8, TP = TILE / SC, GAP = 6;
const zoneAt = (wx, wy) => { for (const zid of [L, R]) { const z = ZONES[zid]; if (wx >= z.worldOffsetX && wx < z.worldOffsetX + z.zoneWidth && wy >= z.worldOffsetY && wy < z.worldOffsetY + z.zoneHeight) return zid; } return null; };
const hex = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const png = new PNG({ width: ys.length * (TP + GAP), height: TP });
const put = (x, y, c) => { if (x < 0 || y < 0 || x >= png.width || y >= png.height) return; const i = (y * png.width + x) * 4; png.data[i] = c[0]; png.data[i + 1] = c[1]; png.data[i + 2] = c[2]; png.data[i + 3] = 255; };
const treesOf = (zid, wx0, wy0, wx1, wy1) => {
  const z = ZONES[zid], out = [];
  const c0 = Math.floor((wx0 - z.worldOffsetX) / cs) - 1, c1 = Math.floor((wx1 - z.worldOffsetX) / cs) + 1;
  const r0 = Math.floor((wy0 - z.worldOffsetY) / cs) - 1, r1 = Math.floor((wy1 - z.worldOffsetY) / cs) + 1;
  for (let cy = Math.max(0, r0); cy <= r1; cy++) for (let cx = Math.max(0, c0); cx <= Math.min(Math.ceil(z.zoneWidth / cs) - 1, c1); cx++)
    for (const r of chunk.generateChunkResources(zid, z.biome, cx, cy, cs, null, 0)) if (r.type === 'tree') out.push([r.x + z.worldOffsetX, r.y + z.worldOffsetY]);
  return out;
};
let stats = [];
ys.forEach((ly, ti) => {
  const wy0 = HB.worldOffsetY + ly - TILE / 2, wx0 = seamX - TILE / 2;
  const ox = ti * (TP + GAP);
  for (let py = 0; py < TP; py++) for (let px = 0; px < TP; px++) {
    const wx = wx0 + px * SC + SC / 2, wy = wy0 + py * SC + SC / 2;
    const zid = zoneAt(wx, wy);
    if (!zid) { put(ox + px, py, [10, 20, 40]); continue; }
    const z = ZONES[zid], lx = wx - z.worldOffsetX, lyy = wy - z.worldOffsetY;
    let c;
    if (terrain.isWaterCellLocal(zid, lx, lyy)) c = [40, 90, 170];
    else if (terrain.isRockCellLocal(zid, lx, lyy)) c = [120, 112, 100];
    else if (terrain.getForestMultiplier(zid, lx, lyy) > 1.5) c = [40, 80, 40];
    else c = hex(z.groundColor);
    put(ox + px, py, c);
  }
  for (let py = 0; py < TP; py++) { put(ox + TP / 2, py, [220, 30, 30]); }
  let over = 0;
  for (const [zid, col] of [[L, [255, 150, 30]], [R, [245, 245, 245]]]) {
    for (const [wx, wy] of treesOf(zid, wx0, wy0, wx0 + TILE, wy0 + TILE)) {
      const px = Math.floor((wx - wx0) / SC), py = Math.floor((wy - wy0) / SC);
      if (px < 0 || py < 0 || px >= TP || py >= TP) continue;
      put(ox + px, py, col);
      if (zoneAt(wx, wy) !== zid) over++;
    }
  }
  stats.push(`y${ly}: 남의 땅 나무 ${over}`);
});
fs.writeFileSync(OUT, PNG.sync.write(png));
console.log(`${OUT} · ${SEAM}(${L}|${R}) · 칸 ${TILE}px × ${ys.length} · ${stats.join(' · ')}`);
