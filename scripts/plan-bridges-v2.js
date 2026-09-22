#!/usr/bin/env node
// === 다리 계획기 v2 — 성분 기준 · 실셀 정본 ===
// v1(plan-bridges.js)의 한계: ①마을 중심 ±260셀 박스 ②축 4방 직선만 ③도하 60셀 미만
//   ④무엇보다 **코스 격자(step 4) 성분 분해가 과탐지**라 "단절"이 애초에 틀릴 수 있었다.
// v2는 전부 실셀(1셀)에서 한다:
//   1) 스폰에서 다리 ON 플러드 → 본토 집합(main)
//   2) 도달 불가 마을마다 그 자리에서 플러드 → 그 섬 집합(island). 섬이 겹치면 자동 dedup.
//   3) island의 **해안선 셀 전수**에서 4방 직선으로 물을 건너 main에 닿는 최단 도하를 찾는다(상한 200셀).
//   4) 200셀 초과 = 대양. 다리가 아니라 배가 답이다 → "항해 층 필요"로 분류만 하고 놓지 않는다.
//
// 실행: node scripts/plan-bridges-v2.js [zoneId]
const path = require('path');
const terrain = require(path.join(__dirname, '..', 'server', 'terrain'));
const { ZONES } = require(path.join(__dirname, '..', 'server', 'zone-config'));
if (terrain.setZonesMeta) terrain.setZonesMeta(ZONES);

const ZID = process.argv[2] || 'hanbando';
const Z = ZONES[ZID], SZ = 32;
const NX = Math.floor(Z.zoneWidth / SZ), NY = Math.floor(Z.zoneHeight / SZ);
const N = NX * NY;
const MAX_SPAN = 200;      // 이 이상은 대양 — 다리로 놓지 않는다

const BRIDGE = new Set();
{ const b = Z.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BRIDGE.add(b[i] + '_' + b[i + 1]); }

// ★★[T348 2026-09-21] **물이 두 층이다 — 계획기가 한 층만 보고 있었다.**
//   서버의 통행 정본(`zone.js:818 isTerrainBlockedLocal`)은 물을 **둘** 본다:
//     ⓐ `WATER_TILES` — 해안선 띠(`chunk.generateCoastlineWaterTiles` · 부팅 로그의 "🌊 해안선")
//     ⓑ `terrain.isWaterCellLocal` — 손그림 강·호수
//   이 계획기는 ⓑ만 봤다. 한반도에선 띠가 존의 **4.4%**(폭 2188셀)라 가장자리에만 있어 티가 안 났는데,
//   닛폰은 폭이 1562셀뿐이라 띠가 **16.0%** 로 안쪽까지 들어온다. 그래서 계획기가 "본토"라 부른 곳이
//   서버에선 바다였고, **놓은 다리가 엉뚱한 덩어리에 착지했다**(T348 §0-ⓑ 실측: 다리를 놓아도 도달 쌍 무변).
//   ⇒ 서버와 **같은 물**을 본다. 조합은 `zone.js:742~825` 그대로다(새 규칙 0).
//   ⚠사본이다 — 이 사슬을 한 곳에 모으는 일은 회부(#31 "25벌 모으기" · T259).
const _oceanRects = Object.values(ZONES).filter((z) => z.isOcean)
  .map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const WATER_TILES = require(path.join(__dirname, '..', 'server', 'chunk'))
  .generateCoastlineWaterTiles(Object.assign({ id: ZID }, Z), SZ, require(path.join(__dirname, '..', 'server', 'zone-config')).findZoneAt, _oceanRects);
console.log(`[계획기 v2] 해안선 띠 ${WATER_TILES.size.toLocaleString()}칸 (존의 ${(WATER_TILES.size / N * 100).toFixed(1)}%) — 서버와 같은 물을 본다`);
const memo = new Uint8Array(N);
function kind(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= NX || cy >= NY) return 3;
  const i = cy * NX + cx; let v = memo[i];
  if (v) return v;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  const water = WATER_TILES.has(`${cx}_${cy}`) || terrain.isWaterCellLocal(ZID, x, y);
  v = water ? 2 : (terrain.isRockCellLocal(ZID, x, y) ? 3 : 1);
  memo[i] = v; return v;
}
const blocked = (cx, cy) => { const k = kind(cx, cy); if (k === 3) return true; if (k === 2) return !BRIDGE.has(cx + '_' + cy); return false; };
const isWater = (cx, cy) => kind(cx, cy) === 2 && !BRIDGE.has(cx + '_' + cy);

function flood(sx, sy, tag, mark) {
  const q = new Int32Array(N + 16); let head = 0, tail = 0;
  const push = (cx, cy) => { const i = cy * NX + cx; if (mark[i]) return; mark[i] = tag; q[tail++] = i; };
  if (blocked(sx, sy)) {
    let ok = false;
    for (let r = 1; r <= 24 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r; dx++) {
      if (!blocked(sx + dx, sy + dy)) { push(sx + dx, sy + dy); ok = true; break; }
    }
    if (!ok) return { n: 0, cells: [] };
  } else push(sx, sy);
  while (head < tail) {
    const i = q[head++]; const cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= NX || ny >= NY) continue;
      if (blocked(nx, ny)) continue;
      push(nx, ny);
    }
  }
  return { n: tail, cells: q.subarray(0, tail) };
}

const label = new Uint8Array(N);   // 1 = 본토, 2.. = 섬
const t0 = Date.now();
const sx = Math.round(Z.mainSquare.x / SZ), sy = Math.round(Z.mainSquare.y / SZ);
const main = flood(sx, sy, 1, label);
console.log(`[계획기 v2] ${ZID} · 다리 셀 ${BRIDGE.size}`);
console.log(`본토(다리 ON) ${main.n.toLocaleString()}셀 · ${Date.now() - t0}ms`);

// ★[T348] 후보는 **정본 문**으로 묻는다(T343 `siteCandidates`) — 정본 json 에 찍어 둔 칸이 있으면
//   그것(한반도 51 · 종전과 한 칸도 안 다르다), 없으면 절차 배치기. 안 그러면 닛폰처럼
//   찍어 둔 칸이 0 인 존에서 "도달 불가 마을 0" 이라는 **거짓 초록**이 난다.
const vs = (terrain.siteCandidates ? terrain.siteCandidates(ZID) : terrain.getZoneVillages(ZID)) || [];
const near = (cx, cy, R) => { for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && label[y * NX + x] === 1) return true; } return false; };
const cut = vs.filter(v => !near(Math.round(v.x / SZ), Math.round(v.y / SZ), 8));
console.log(`도달 불가 마을 ${cut.length}: ${cut.map(v => v.name).join(', ')}`);

// 섬별 플러드 (겹치면 dedup)
const islands = [];
let tag = 2;
for (const v of cut) {
  const cx = Math.round(v.x / SZ), cy = Math.round(v.y / SZ);
  let ex = 0;
  for (let dy = -8; dy <= 8 && !ex; dy++) for (let dx = -8; dx <= 8; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && label[y * NX + x] > 1) { ex = label[y * NX + x]; break; } }
  if (ex) { const isl = islands.find(i => i.tag === ex); if (isl) isl.villages.push(v.name); continue; }
  const t1 = Date.now();
  const f = flood(cx, cy, tag, label);
  islands.push({ tag, villages: [v.name], n: f.n, cells: Array.from(f.cells), anchor: [cx, cy] });
  console.log(`  섬 #${tag} (${v.name}) ${f.n.toLocaleString()}셀 · ${Date.now() - t1}ms`);
  tag++;
}

// 섬별 최단 도하 — 해안선 전수 × 4방
function findSpan(isl) {
  let best = null;
  for (const i of isl.cells) {
    const cx = i % NX, cy = (i / NX) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!isWater(cx + dx, cy + dy)) continue;      // 해안선(바로 앞이 물)만
      let len = 0, x = cx + dx, y = cy + dy;
      while (len < MAX_SPAN && isWater(x, y)) { x += dx; y += dy; len++; }
      if (len === 0 || len >= MAX_SPAN) continue;
      if (x < 0 || y < 0 || x >= NX || y >= NY) continue;
      if (label[y * NX + x] !== 1) continue;         // 착지가 본토여야
      if (!best || len < best.len) best = { len, x0: cx, y0: cy, x1: x, y1: y, dx, dy };
    }
  }
  return best;
}

const found = [], ocean = [];
for (const isl of islands) {
  const t1 = Date.now();
  const s = findSpan(isl);
  if (!s) { ocean.push(isl); console.log(`\n[섬 #${isl.tag}] ${isl.villages.join(',')} — ${MAX_SPAN}셀 내 본토 도하 없음 → **대양 분리(항해 층 필요)** (${Date.now() - t1}ms)`); continue; }
  const perp = s.dx ? [0, 1] : [1, 0];
  const cells = [];
  for (let k = 0; k <= s.len + 1; k++) { const bx = s.x0 + s.dx * k, by = s.y0 + s.dy * k; for (let w = 0; w < 2; w++) cells.push([bx + perp[0] * w, by + perp[1] * w]); }
  found.push({ tag: isl.tag, villages: isl.villages, span: s, cells });
  console.log(`\n[섬 #${isl.tag}] ${isl.villages.join(',')} (${isl.n.toLocaleString()}셀) 최단 도하 ${s.len}셀: (${s.x0},${s.y0})→(${s.x1},${s.y1}) → 다리 ${cells.length}셀 (${Date.now() - t1}ms)`);
}

console.log(`\n=== 결과 ===`);
console.log(`다리 가능 ${found.length}섬 / 대양 ${ocean.length}섬`);
const flat = [];
for (const f of found) for (const c of f.cells) flat.push(c[0], c[1]);
console.log(`추가할 flat 셀 ${flat.length / 2}개:`);
console.log(JSON.stringify(flat));
if (ocean.length) console.log(`\n항해 층 필요(다리 금지): ${ocean.map(o => o.villages.join(',') + `(${o.n.toLocaleString()}셀)`).join(' · ')}`);
console.log(`총 ${Date.now() - t0}ms`);
