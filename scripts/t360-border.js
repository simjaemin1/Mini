#!/usr/bin/env node
// === scripts/t360-border.js — "대양 분리"라 부른 경계의 정체 [T360 계측기] ==========
//
// ★★계측기다. 하네스가 아니다 — 러너에 넣지 마라(첫 열 등재 표 없음).
//   판정하지 않고 **수와 그림**을 낸다. 판정은 보고/T360 의 표에서 재민이 한다.
//
// ★왜 [T360 2026-09-23]
//   T348 계획기가 닛폰의 1,529,254셀 덩어리를 **"대양 분리(항해 층 필요)"**라 답했다.
//   재민이 되물었다: *"아직 배는 없다. 닛폰도 전부 대륙으로 연결되어 있을 텐데?"*
//   계획기가 물은 것은 하나뿐이다 — **"200셀 안에 본토로 건너는 물 도하가 있나"**
//   (`plan-bridges-v2.js` 의 `findSpan` 은 `isWater` 4방 직선만 본다. 다리는 물만 건넌다 —
//    바위는 `zone.js:821` 이 안 뚫는다). 없으면 "대양"이다.
//   그런데 T348 §0-ⓐ 표가 이미 말하고 있었다: 그 덩어리의 경계는 **물 6,051 · 바위 6,172**다.
//   ⇒ **바위가 가른 것이면 그것은 바다가 아니라 산맥이고, 답은 배가 아니라 고개다.**
//
// ★이 계측기가 재는 것 — 셋 다 **같은 자**(서버가 보는 술어 사슬)로 잰다:
//   ⓐ 경계 셀을 종류별로 찍는다(물 / 바위 / 존 밖) · 지도 PNG
//   ⓑ 본토까지 **최단 폭**을 세 갈래로: 물만 건너기 · 바위만 넘기 · 섞어서
//      (0-1 BFS — 다닐 수 있는 칸 0, 막힌 칸 1. 처음 본토에 닿을 때의 합 = 최소로 건너야 하는 칸 수.
//       계획기의 '4방 직선'보다 **넓게** 본다: 비스듬히 에둘러 더 좁은 목이 있으면 그것을 찾는다.)
//   ⓒ 그 최단 경로가 실제로 지나간 칸들(좌표 · 종류)
//
// ★★물은 **두 층**이다(T348 §0-ⓐ) — 해안선 띠(`WATER_TILES`)와 손그림 강·호수.
//   서버 통행 정본(`zone.js:818`)이 보는 그대로 둘 다 본다. 한 층만 보면 다른 세계를 잰다.
//
// 실행: node scripts/t360-border.js [--zone nippon] [--from <cx,cy>] [--png /tmp/x.png]
//   --from 없으면 존 안에서 **본토 다음으로 큰 덩어리**를 스스로 찾는다.
'use strict';
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : d; };
const ZID = val('--zone', 'nippon');
const PNG_OUT = val('--png', `/tmp/t360-${ZID}.png`);
const FROM = val('--from', '');

const ROOT = path.join(__dirname, '..');
const terrain = require(path.join(ROOT, 'server', 'terrain'));
const CH = require(path.join(ROOT, 'server', 'chunk'));
const { ZONES, findZoneAt } = require(path.join(ROOT, 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const Z = ZONES[ZID], SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ), N = NX * NY;

// ── 서버가 보는 물·바위 그대로 ──────────────────────────────────────────────
const OCEAN_RECTS = Object.values(ZONES).filter((z) => z.isOcean)
  .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const WATER_TILES = CH.generateCoastlineWaterTiles(Object.assign({ id: ZID }, Z), SZ, findZoneAt, OCEAN_RECTS);
const BRIDGE = new Set();
// ★`--nobridge` — 다리를 **안 놓은 판**을 그대로 재본다(전/후 짝 비교용 · 정본은 안 건드린다).
const NOBRIDGE = argv.includes('--nobridge');
{ const b = NOBRIDGE ? [] : (Z.bridges || []); for (let i = 0; i + 1 < b.length; i += 2) BRIDGE.add(b[i] + '_' + b[i + 1]); }

// kind: 1 = 다닐 수 있는 뭍 · 2 = 물 · 3 = 바위 · (다리 칸은 1)
const KIND = new Uint8Array(N);
{
  const t0 = Date.now();
  for (let cy = 0; cy < NY; cy++) {
    for (let cx = 0; cx < NX; cx++) {
      const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
      let k;
      if (terrain.isRockCellLocal(ZID, x, y)) k = 3;
      else if (WATER_TILES.has(`${cx}_${cy}`) || terrain.isWaterCellLocal(ZID, x, y)) k = (BRIDGE.has(cx + '_' + cy) ? 1 : 2);
      else k = 1;
      KIND[cy * NX + cx] = k;
    }
  }
  let w = 0, r = 0, l = 0;
  for (let i = 0; i < N; i++) { if (KIND[i] === 1) l++; else if (KIND[i] === 2) w++; else r++; }
  console.log(`=== ${ZID} (${Z.displayName}) ${NX}×${NY}셀 ===`);
  console.log(`땅칠 ${Date.now() - t0}ms · 뭍 ${l.toLocaleString()}(${(l / N * 100).toFixed(1)}%) · 물 ${w.toLocaleString()}(${(w / N * 100).toFixed(1)}%) · 바위 ${r.toLocaleString()}(${(r / N * 100).toFixed(1)}%)`);
  console.log(`  해안선 띠 ${WATER_TILES.size.toLocaleString()} · 다리 ${BRIDGE.size}셀 · 정본 ridges ${(terrain.ZONE_TERRAIN[ZID].ridges || []).length} · passes ${(terrain.ZONE_TERRAIN[ZID].passes || []).length} · valleys ${(terrain.ZONE_TERRAIN[ZID].valleys || []).length}`);
}

// ── 덩어리 나누기(뭍만 · 4방) ───────────────────────────────────────────────
const LAB = new Int32Array(N);
const q = new Int32Array(N);
function flood(si, tag) {
  let h = 0, t = 0;
  if (KIND[si] !== 1 || LAB[si]) return 0;
  LAB[si] = tag; q[t++] = si;
  while (h < t) {
    const i = q[h++], cx = i % NX, cy = (i / NX) | 0;
    if (cx + 1 < NX) { const j = i + 1; if (KIND[j] === 1 && !LAB[j]) { LAB[j] = tag; q[t++] = j; } }
    if (cx > 0) { const j = i - 1; if (KIND[j] === 1 && !LAB[j]) { LAB[j] = tag; q[t++] = j; } }
    if (cy + 1 < NY) { const j = i + NX; if (KIND[j] === 1 && !LAB[j]) { LAB[j] = tag; q[t++] = j; } }
    if (cy > 0) { const j = i - NX; if (KIND[j] === 1 && !LAB[j]) { LAB[j] = tag; q[t++] = j; } }
  }
  return t;
}
const sizes = new Map();
{
  let tag = 0;
  for (let i = 0; i < N; i++) { if (KIND[i] === 1 && !LAB[i]) { tag++; const n = flood(i, tag); sizes.set(tag, n); } }
  console.log(`덩어리 ${tag}개 · 상위 6: ${[...sizes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `#${t} ${n.toLocaleString()}`).join(' · ')}`);
}
// 본토 = 스폰이 속한 덩어리
const sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ);
let MAIN = LAB[sy * NX + sx];
if (!MAIN) { for (let r = 1; r <= 40 && !MAIN; r++) for (let dy = -r; dy <= r && !MAIN; dy++) for (let dx = -r; dx <= r; dx++) { const x = sx + dx, y = sy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && LAB[y * NX + x]) { MAIN = LAB[y * NX + x]; break; } } }
// 볼 덩어리 = --from 이 있으면 그 자리, 없으면 본토 다음으로 큰 것
let ISL;
if (FROM) { const [a, b] = FROM.split(',').map(Number); ISL = LAB[b * NX + a]; }
else ISL = [...sizes.entries()].sort((x, y) => y[1] - x[1]).map(([t]) => t).find((t) => t !== MAIN);
console.log(`본토 #${MAIN} ${sizes.get(MAIN).toLocaleString()}셀 (스폰 ${sx},${sy}) · 볼 덩어리 #${ISL} ${sizes.get(ISL).toLocaleString()}셀`);

// ── 정본 마을이 어느 덩어리에 있나 ────────────────────────────────────────
{
  const vs = terrain.siteCandidates(ZID) || [];
  const tally = new Map();
  for (const v of vs) {
    const cx = Math.round(v.x / SZ), cy = Math.round(v.y / SZ);
    let t = 0;
    for (let r = 0; r <= 12 && !t; r++) for (let dy = -r; dy <= r && !t; dy++) for (let dx = -r; dx <= r; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && LAB[y * NX + x]) { t = LAB[y * NX + x]; break; } }
    (tally.get(t) || tally.set(t, []).get(t)).push(v.name);
  }
  console.log(`\n[마을이 선 덩어리] 후보 ${vs.length}곳`);
  for (const [t, names] of [...tally.entries()].sort((a, b) => (sizes.get(b[0]) || 0) - (sizes.get(a[0]) || 0))) {
    // ★[T373] 덩어리 #0 = 12셀 반경에 뭍이 한 칸도 없다 = **섬이 아니라 설 자리가 없는 곳**이다.
    //   섬으로 세면 "대양 n섬"이 부풀고, 사람이 없는 바다를 걱정하게 된다(`seedVillages` 가 어차피 스킵한다).
    if (!t) { console.log(`  (섬 아님 — 설 자리 없는 후보 ${names.length}곳: ${names.join(', ')})`); continue; }
    console.log(`  #${t}${t === MAIN ? '=본토' : ''} ${(sizes.get(t) || 0).toLocaleString()}셀 — ${names.join(', ')}`);
  }
}

// ── ⓐ 경계 종류 ────────────────────────────────────────────────────────────
const border = { water: 0, rock: 0, edge: 0 };
const borderCells = [];   // [i, kind] — 지도용
{
  for (let i = 0; i < N; i++) {
    if (LAB[i] !== ISL) continue;
    const cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) { border.edge++; continue; }
      const j = ny * NX + nx;
      if (LAB[j] === ISL) continue;
      const k = KIND[j];
      if (k === 2) { border.water++; borderCells.push([j, 2]); }
      else if (k === 3) { border.rock++; borderCells.push([j, 3]); }
      else borderCells.push([j, 1]);   // 다른 덩어리의 뭍과 바로 맞닿음(있으면 안 된다 — 4방 연결이므로)
    }
  }
  console.log(`\n[ⓐ 경계] 물 ${border.water.toLocaleString()} · 바위 ${border.rock.toLocaleString()} · 존 밖 ${border.edge.toLocaleString()}`);
  // 방위별 — 경계 칸의 y 를 넷으로 쪼개 어느 구간이 물이고 어느 구간이 바위인지
  const bands = 8, tally = Array.from({ length: bands }, () => ({ w: 0, r: 0 }));
  for (const [j, k] of borderCells) { const cy = (j / NX) | 0; const b = Math.min(bands - 1, Math.floor(cy / NY * bands)); if (k === 2) tally[b].w++; else if (k === 3) tally[b].r++; }
  console.log('  y 띠(8등분) 물/바위:');
  for (let b = 0; b < bands; b++) {
    const y0 = Math.round(b / bands * NY), y1 = Math.round((b + 1) / bands * NY);
    console.log(`    y ${String(y0).padStart(4)}~${String(y1).padStart(4)}  물 ${String(tally[b].w).padStart(5)} · 바위 ${String(tally[b].r).padStart(5)}`);
  }
}

// ── ⓑ 최단 폭 — 0-1 BFS 세 갈래 ────────────────────────────────────────────
// 다닐 수 있는 칸 0 · 건널 수 있는 막힌 칸 1 · 건널 수 없는 막힌 칸 = 벽.
// 처음 본토에 닿을 때의 합 = **최소로 건너야 하는 칸 수**. 4방 직선만 보는 계획기보다 넓게 본다.
function shortest(crossWater, crossRock, label) {
  const t0 = Date.now();
  const INF = 0x3fffffff;
  const dist = new Int32Array(N).fill(INF);
  const prev = new Int32Array(N).fill(-1);
  // deque — 앞뒤로 넣는다(0-1 BFS). 넉넉히 잡는다.
  const dq = new Int32Array(N * 2 + 16); let head = N, tail = N;
  const pushF = (i) => { dq[--head] = i; };
  const pushB = (i) => { dq[tail++] = i; };
  for (let i = 0; i < N; i++) if (LAB[i] === ISL) { dist[i] = 0; pushB(i); }
  const canCross = (k) => (k === 1) || (k === 2 && crossWater) || (k === 3 && crossRock);
  let goal = -1;
  while (head < tail) {
    const i = dq[head++];
    const d = dist[i];
    if (LAB[i] === MAIN) { goal = i; break; }
    const cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      const j = ny * NX + nx, k = KIND[j];
      if (!canCross(k)) continue;
      const w = (k === 1) ? 0 : 1;
      if (d + w < dist[j]) { dist[j] = d + w; prev[j] = i; if (w === 0) pushF(j); else pushB(j); }
    }
  }
  if (goal < 0) { console.log(`  ${label}: **못 간다**(그 종류만으로는 본토에 못 닿는다) · ${Date.now() - t0}ms`); return null; }
  // 경로 되짚기 — 건넌 칸만 센다
  const crossed = [];
  for (let i = goal; i >= 0; i = prev[i]) { if (KIND[i] !== 1) crossed.push(i); if (prev[i] < 0) break; }
  crossed.reverse();
  const nw = crossed.filter((i) => KIND[i] === 2).length, nr = crossed.filter((i) => KIND[i] === 3).length;
  const at = (i) => `(${i % NX},${(i / NX) | 0})`;
  console.log(`  ${label}: **${dist[goal]}칸** (물 ${nw} · 바위 ${nr}) · 첫 칸 ${crossed.length ? at(crossed[0]) : '-'} → 착지 ${at(goal)} · ${Date.now() - t0}ms`);
  // ★★합이 아니라 **구간**이 중요하다. 27칸이 한 줄이면 다리 하나고, 다섯 토막이면 다리 다섯이다.
  //   경로를 되짚어 **연속으로 막힌 구간**을 끊어 센다(사이에 뭍이 끼면 다른 구간).
  const pathAll = []; for (let i = goal; i >= 0; i = prev[i]) { pathAll.push(i); if (prev[i] < 0) break; }
  pathAll.reverse();
  const runs = []; let cur = null;
  for (const i of pathAll) {
    if (KIND[i] === 1) { if (cur) { runs.push(cur); cur = null; } continue; }
    if (!cur) cur = { k: KIND[i], from: i, to: i, n: 1 };
    else { cur.to = i; cur.n++; if (KIND[i] !== cur.k) cur.k = 0; }
  }
  if (cur) runs.push(cur);
  console.log(`    구간 ${runs.length}토막: ${runs.map((r) => `${r.n}칸(${r.k === 2 ? '물' : r.k === 3 ? '바위' : '섞임'}) ${at(r.from)}→${at(r.to)}`).join(' · ')}`);
  return { total: dist[goal], water: nw, rock: nr, crossed, goal, runs };
}
console.log('\n[ⓑ 본토까지 최단 폭 — 0-1 BFS(에두름 허용)]');
const rWater = shortest(true, false, '물만 건너면');
const rRock = shortest(false, true, '바위만 넘으면');
const rBoth = shortest(true, true, '섞으면    ');

// ── 지도 PNG ───────────────────────────────────────────────────────────────
{
  const { PNG } = require('pngjs');
  const SC = Math.max(1, Math.ceil(Math.max(NX, NY) / 900));   // 긴 변 ~900px 로
  const W = Math.ceil(NX / SC), H = Math.ceil(NY / SC);
  const png = new PNG({ width: W, height: H });
  const put = (px, py, r, g, b) => { if (px < 0 || py < 0 || px >= W || py >= H) return; const o = (py * W + px) << 2; png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255; };
  for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
    const i = cy * NX + cx, k = KIND[i], l = LAB[i];
    let c;
    if (k === 2) c = [40, 70, 120];            // 물 — 짙은 파랑
    else if (k === 3) c = [110, 95, 80];       // 바위 — 갈색
    else if (l === MAIN) c = [150, 170, 120];  // 본토 — 연두
    else if (l === ISL) c = [210, 180, 90];    // 볼 덩어리 — 황토
    else c = [95, 100, 95];                    // 그 밖 덩어리 — 회색
    put(Math.floor(cx / SC), Math.floor(cy / SC), c[0], c[1], c[2]);
  }
  // 경계 칸 덧칠 — 물 경계 밝은 파랑 · 바위 경계 빨강
  for (const [j, k] of borderCells) {
    const cx = j % NX, cy = (j / NX) | 0;
    if (k === 2) put(Math.floor(cx / SC), Math.floor(cy / SC), 90, 170, 255);
    else if (k === 3) put(Math.floor(cx / SC), Math.floor(cy / SC), 230, 60, 60);
  }
  // 최단 경로(섞음) 흰 점 · 굵게
  if (rBoth) for (const i of rBoth.crossed) { const cx = i % NX, cy = (i / NX) | 0; const px = Math.floor(cx / SC), py = Math.floor(cy / SC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) put(px + a, py + b, 255, 255, 255); }
  // 고개(passes) 자리 — 노랑 테두리 원
  for (const p of (terrain.ZONE_TERRAIN[ZID].passes || [])) {
    const cx = Math.round(p.pos[0] / SZ), cy = Math.round(p.pos[1] / SZ), rr = Math.round((p.radius || 0) / SZ);
    for (let a = 0; a < 360; a += 2) { const px = Math.floor((cx + rr * Math.cos(a * Math.PI / 180)) / SC), py = Math.floor((cy + rr * Math.sin(a * Math.PI / 180)) / SC); put(px, py, 250, 220, 60); }
  }
  fs.writeFileSync(PNG_OUT, PNG.sync.write(png));
  console.log(`\n지도 → ${PNG_OUT} (${W}×${H} · 1px = ${SC}셀)`);
  console.log('  연두=본토 · 황토=볼 덩어리 · 회색=그 밖 · 짙은파랑=물 · 갈색=바위 · 밝은파랑/빨강=그 덩어리의 물/바위 경계 · 흰선=최단 경로 · 노랑원=고개');
}
