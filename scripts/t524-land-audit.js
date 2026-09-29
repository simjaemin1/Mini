#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T524 표 짜는 기계)
// =============================================================================
// T524 — 존 하나의 **뭍 전체**를 실셀(1셀)로 전수한다(관측 전용 · 세계 무변 · 새 수 0 · T407 문법).
//
//   ⓐ 실셀 종류: 1 뭍 · 2 바다 띠(`chunk.generateCoastlineWaterTiles` = 서버 `WATER_TILES`) · 3 민물(`isWaterCellLocal` = 강·호수)
//      · 4 바위(`isRockCellLocal` = 능선 − 고개 − 골짜기) · 숲(`getForestMultiplier > 1.5` · 뭍만) · 광맥(`isOreClusterAt` · 물 아닌 셀)
//      통행 = 뭍 ∪ (다리 판이면 다리 셀) — `zone.js isTerrainBlockedLocal` 과 같은 뜻 · 4방(축)만(다리 층 불변식).
//   ⓑ 뭍 성분(다리 있/없): 면적 · 바다 접함 · 민물 접함 · 존 가장자리로 나가는 셀(옆 존이 뭍인 곳) · 둘레가 무엇으로 막혔나(바위 · 민물 · 바다 · 가장자리).
//      본토 = 시딩된 마을이 가장 많이 든 성분(다리 판). 나머지는 — 가장자리 출구 있음 = "옆 존으로만 열림" · 없음 = **갇힌 땅**.
//   ⓒ 실걸음 거리(다리 판 · 4방 BFS · 셀): 뭍 셀마다 가장 가까운 민물 · 숲 · 광맥 · 바위(산) · 바다까지. 0 = 닿아 있다(막힌 과녁은 옆 칸이 0).
//      닿을 길 없음 = 65535.
//   ⓓ 마을 후보 전수(`siteCandidates` · 선별 `pickSeedVillages` · 중심 `findOpenCenter` — 서버와 같은 길 · T407 과 같은 "왜 안 섰나").
//   ⓔ 수동 지형 후보(표만 · 지형 무변): 본토 밖 성분마다 **본토까지 파야 할 바위 셀 수(고개)** · **건너야 할 물 셀 수(다리)**.
//      `--ref <한반도 json>` 이 있으면 물 없는 땅(민물 거리 > 한반도 p95)의 큰 덩이마다 "그 덩이의 가장 먼 셀에서 가장 가까운 민물까지
//      걷는 길에 강 하나를 그으면 몇 셀이 한반도 p95 안으로 드나"를 다시 잰다(강은 과녁으로만 더한다 · 통행은 안 바꾼다 = 근사 · 표에 적는다).
//
// 쓰는 법: node scripts/t524-land-audit.js <zoneId> <출력 디렉터리> [--ref <다른 존 json>]
//   → <dir>/<zone>.json(표) · <dir>/<zone>.bin(셀 배열: kind u8 · forest u8 · ore u8 · compB i32 · comp0 i32 · 거리 다섯 u16)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t524-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));

const Z = process.argv[2] || 'nippon';
const OUTD = process.argv[3] || '/tmp/t524';
const REF = (() => { const i = process.argv.indexOf('--ref'); return i > 0 ? JSON.parse(fs.readFileSync(process.argv[i + 1], 'utf8')) : null; })();
fs.mkdirSync(OUTD, { recursive: true });

const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z], SZ = P.SZ;
if (!ZONE) { console.error('모르는 존 ' + Z); process.exit(2); }
P.setZoneId(Z);
const NX = Math.floor(ZONE.zoneWidth / SZ), NY = Math.floor(ZONE.zoneHeight / SZ), N = NX * NY;
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const bandOf = new Map();
const band = (zid) => { if (!bandOf.has(zid)) bandOf.set(zid, R('server/chunk').generateCoastlineWaterTiles({ ...ZONES[zid], id: zid }, SZ, findZoneAt, OR)); return bandOf.get(zid); };
const BAND = band(Z);
const BR = new Set(); { const b = ZONE.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BR.add(b[i] + '_' + b[i + 1]); }

// ── ⓐ 실셀 종류
const t0 = Date.now();
const kind = new Uint8Array(N), forest = new Uint8Array(N), ore = new Uint8Array(N), isBr = new Uint8Array(N);
for (let cy = 0; cy < NY; cy++) for (let cx = 0; cx < NX; cx++) {
  const i = cy * NX + cx, x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  let k;
  if (BAND.has(cx + '_' + cy)) k = 2; else if (T.isWaterCellLocal(Z, x, y)) k = 3; else if (T.isRockCellLocal(Z, x, y)) k = 4; else k = 1;
  kind[i] = k;
  if (k === 1 && T.getForestMultiplier(Z, x, y) > 1.5) forest[i] = 1;
  if (k !== 2 && k !== 3 && T.isOreClusterAt(Z, x, y)) ore[i] = 1;
  if ((k === 2 || k === 3) && BR.has(cx + '_' + cy)) isBr[i] = 1;
}
const tGrid = Date.now() - t0;
const passB = (i) => kind[i] === 1 || isBr[i] === 1;
const pass0 = (i) => kind[i] === 1;

// 가장자리 출구: 존 테두리 뭍 셀 중 바깥 옆 셀이 **옆 존의 뭍**인 곳
function outsideLand(cx, cy, dx, dy) {
  const wx = ZONE.worldOffsetX + (cx + dx) * SZ + SZ / 2, wy = ZONE.worldOffsetY + (cy + dy) * SZ + SZ / 2;
  const nz = findZoneAt(wx, wy); if (!nz || nz.isOcean || nz.id === Z) return false;
  const lx = wx - nz.worldOffsetX, ly = wy - nz.worldOffsetY, ncx = Math.floor(lx / SZ), ncy = Math.floor(ly / SZ);
  if (band(nz.id).has(ncx + '_' + ncy)) return false;
  if (T.isWaterCellLocal(nz.id, lx, ly) || T.isRockCellLocal(nz.id, lx, ly)) return false;
  return true;
}
const exitCell = new Uint8Array(N);
{
  const mark = (cx, cy, dx, dy) => { const i = cy * NX + cx; if (kind[i] === 1 && outsideLand(cx, cy, dx, dy)) exitCell[i] = 1; };
  for (let cx = 0; cx < NX; cx++) { mark(cx, 0, 0, -1); mark(cx, NY - 1, 0, 1); }
  for (let cy = 0; cy < NY; cy++) { mark(0, cy, -1, 0); mark(NX - 1, cy, 1, 0); }
}

// ── ⓑ 성분
const Q = new Int32Array(N);
function nbrs(i, f) { const cx = i % NX, cy = (i / NX) | 0; if (cx > 0) f(i - 1); if (cx < NX - 1) f(i + 1); if (cy > 0) f(i - NX); if (cy < NY - 1) f(i + NX); }
function components(pass) {
  const lab = new Int32Array(N).fill(-1), comps = [];
  for (let s = 0; s < N; s++) {
    if (lab[s] >= 0 || !pass(s)) continue;
    const id = comps.length, c = { id, area: 0, land: 0, sea: 0, fresh: 0, rockB: 0, seaB: 0, freshB: 0, edgeB: 0, exits: 0, bridges: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, sx: 0, sy: 0 };
    let h = 0, t = 0; lab[s] = id; Q[t++] = s;
    while (h < t) {
      const i = Q[h++], cx = i % NX, cy = (i / NX) | 0;
      c.area++; if (kind[i] === 1) c.land++; else c.bridges++;
      if (exitCell[i]) c.exits++;
      if (cx < c.x0) c.x0 = cx; if (cy < c.y0) c.y0 = cy; if (cx > c.x1) c.x1 = cx; if (cy > c.y1) c.y1 = cy; c.sx += cx; c.sy += cy;
      if (cx === 0 || cy === 0 || cx === NX - 1 || cy === NY - 1) c.edgeB++;
      let sea = 0, fr = 0;
      nbrs(i, (j) => {
        if (pass(j)) { if (lab[j] < 0) { lab[j] = id; Q[t++] = j; } return; }
        const k = kind[j]; if (k === 2) { c.seaB++; sea = 1; } else if (k === 3) { c.freshB++; fr = 1; } else if (k === 4) c.rockB++;
      });
      c.sea += sea; c.fresh += fr;
    }
    c.cx = Math.round(c.sx / c.area); c.cy = Math.round(c.sy / c.area); delete c.sx; delete c.sy;
    comps.push(c);
  }
  return { lab, comps };
}
const t1 = Date.now();
const CB = components(passB), C0 = components(pass0);
const tComp = Date.now() - t1;

// ── ⓓ 마을 후보(서버와 같은 길 · T407 과 같은 "왜")
const isWaterTileLocal = (x, y) => { if (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) return false; const k = kind[Math.floor(y / SZ) * NX + Math.floor(x / SZ)]; return k === 2 || k === 3; };
const isRockTileLocal = (x, y) => { if (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) return false; return kind[Math.floor(y / SZ) * NX + Math.floor(x / SZ)] === 4; };
const isTerrainBlockedLocal = (x, y) => (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
const cands = T.siteCandidates(Z) || [];
const _log = console.log; console.log = () => {};
const picked = P.pickSeedVillages(cands, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
console.log = _log;
const pickedNames = new Set(picked.map((v) => v.name));
const vills = cands.map((hv) => {
  const c = pickedNames.has(hv.name) ? P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ)) : null;
  let why = null;
  if (!pickedNames.has(hv.name)) {
    console.log = () => {}; const alone = P.pickSeedVillages([hv], ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 }); console.log = _log;
    why = alone.length ? '간격·상한' : '땅(식량 하한)';
  } else if (!c) why = '물 위(설 자리 없음)';
  return { name: hv.name, type: hv.type, x: Math.round(hv.x / SZ), y: Math.round(hv.y / SZ), picked: pickedNames.has(hv.name), seeded: !!c, ccx: c ? c.ccx : null, ccy: c ? c.ccy : null, why };
});
const nearPass = (x, y) => { for (let r = 0; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const cx = x + dx, cy = y + dy; if (cx >= 0 && cy >= 0 && cx < NX && cy < NY && passB(cy * NX + cx)) return cy * NX + cx; } return -1; };
// 본토 = 시딩된 마을이 가장 많이 든 성분(없으면 가장 큰 성분)
const vc = new Map();
for (const v of vills) { const i = nearPass(v.seeded ? v.ccx : v.x, v.seeded ? v.ccy : v.y); v.cell = i; v.compB = i >= 0 ? CB.lab[i] : null; v.comp0 = i >= 0 ? C0.lab[i] : null; if (v.seeded && v.compB != null) vc.set(v.compB, (vc.get(v.compB) || 0) + 1); }
let MAIN = [...vc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
if (MAIN == null) MAIN = CB.comps.slice().sort((a, b) => b.area - a.area)[0].id;
for (const c of CB.comps) c.cls = c.id === MAIN ? '본토' : (c.exits > 0 ? '옆 존으로만 열림' : '갇힌 땅');
// 다리 없는 판의 성분이 다리 판에서 본토에 붙는가(= 다리 의존)
const mainOf0 = new Map();
for (let i = 0; i < N; i++) { const a = C0.lab[i]; if (a >= 0 && !mainOf0.has(a)) mainOf0.set(a, CB.lab[i]); }
{ let core = -1, ca = -1; for (const c of C0.comps) if (mainOf0.get(c.id) === MAIN && c.area > ca) { ca = c.area; core = c.id; }
  for (const c of C0.comps) { const b = mainOf0.get(c.id); c.inB = b; c.cls = b === MAIN ? (c.id === core ? '본토 핵' : '다리로만 본토') : CB.comps[b].cls; } }

// ── ⓒ 실걸음 거리(다리 판)
const INF = 65535;
function bfs(seed) {   // seed(i) → true 면 0
  const d = new Uint16Array(N).fill(INF); let h = 0, t = 0;
  for (let i = 0; i < N; i++) if (passB(i) && seed(i)) { d[i] = 0; Q[t++] = i; }
  while (h < t) { const i = Q[h++], nd = d[i] + 1; nbrs(i, (j) => { if (d[j] === INF && passB(j)) { d[j] = nd; Q[t++] = j; } }); }
  return d;
}
const adj = (i, k) => { let r = false; nbrs(i, (j) => { if (kind[j] === k) r = true; }); return r; };
const t2 = Date.now();
const D = {
  fresh: bfs((i) => adj(i, 3)),
  forest: bfs((i) => forest[i] === 1),
  ore: bfs((i) => { if (ore[i]) return true; let r = false; nbrs(i, (j) => { if (ore[j] && !passB(j)) r = true; }); return r; }),
  rock: bfs((i) => adj(i, 4)),
  sea: bfs((i) => adj(i, 2)),
};
const tDist = Date.now() - t2;
const qs = (arr) => { const s = arr.filter((v) => v !== INF).sort((a, b) => a - b); const at = (p) => s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : null;
  return { n: arr.length, reach: s.length, none: arr.length - s.length, p50: at(0.5), p90: at(0.9), p95: at(0.95), p99: at(0.99), max: s.length ? s[s.length - 1] : null }; };
const landIdx = []; for (let i = 0; i < N; i++) if (kind[i] === 1) landIdx.push(i);
const dist = {}, distMain = {};
for (const k of Object.keys(D)) { dist[k] = qs(landIdx.map((i) => D[k][i])); distMain[k] = qs(landIdx.filter((i) => CB.lab[i] === MAIN).map((i) => D[k][i])); }
for (const v of vills) v.d = v.cell >= 0 ? Object.fromEntries(Object.keys(D).map((k) => [k, D[k][v.cell] === INF ? null : D[k][v.cell]])) : null;

// ── ⓔ 수동 지형 후보 — 본토에서 바깥으로 "막힌 셀만 지나는" BFS(바위만 = 고개 · 물만 = 다리)
function crossFromMain(throughKinds) {
  const d = new Uint16Array(N).fill(INF); let h = 0, t = 0;
  for (let i = 0; i < N; i++) if (CB.lab[i] === MAIN) { d[i] = 0; Q[t++] = i; }
  while (h < t) { const i = Q[h++]; nbrs(i, (j) => { if (d[j] !== INF) return; if (!passB(j) && throughKinds.includes(kind[j])) { d[j] = d[i] + 1; Q[t++] = j; } }); }
  return d;
}
// 고개 = 바위만 · 다리 = 물만(바다 ∪ 민물) · 그중 민물만(강 다리) · 바다만(바다 다리) — 각 성분의 "본토에서 가장 가까운 막힌 이웃"과 그 자리
const X = { pass: crossFromMain([4]), bridge: crossFromMain([2, 3]), bridgeFresh: crossFromMain([3]), bridgeSea: crossFromMain([2]) };
const best = Object.fromEntries(Object.keys(X).map((k) => [k, { d: new Uint16Array(CB.comps.length).fill(INF), at: new Int32Array(CB.comps.length).fill(-1) }]));
for (let i = 0; i < N; i++) { const c = CB.lab[i]; if (c < 0 || c === MAIN) continue;
  nbrs(i, (j) => { for (const k in X) if (X[k][j] < best[k].d[c]) { best[k].d[c] = X[k][j]; best[k].at[c] = i; } }); }
const offMain = CB.comps.filter((c) => c.id !== MAIN);
for (const c of offMain) for (const k in X) { const d = best[k].d[c.id], a = best[k].at[c.id]; c[k] = d === INF ? null : d; c[k + 'At'] = d === INF ? null : [a % NX, (a / NX) | 0]; }

// 물 없는 땅(한반도 p95 기준)의 큰 덩이 — 강 하나를 그어 보면
let dry = null;
if (REF && REF.dist && REF.dist.fresh && REF.dist.fresh.p95 != null) {
  const TH = REF.dist.fresh.p95;
  const dl = new Int32Array(N).fill(-1), blobs = [];
  for (let s = 0; s < N; s++) {
    if (dl[s] >= 0 || kind[s] !== 1 || D.fresh[s] <= TH) continue;
    const id = blobs.length, b = { id, area: 0, far: s, farD: 0, x0: 1e9, y0: 1e9, x1: -1, y1: -1, none: 0 };
    let h = 0, t = 0; dl[s] = id; Q[t++] = s;
    while (h < t) { const i = Q[h++], cx = i % NX, cy = (i / NX) | 0; b.area++;
      if (D.fresh[i] === INF) b.none++; else if (D.fresh[i] > b.farD) { b.farD = D.fresh[i]; b.far = i; }
      if (cx < b.x0) b.x0 = cx; if (cy < b.y0) b.y0 = cy; if (cx > b.x1) b.x1 = cx; if (cy > b.y1) b.y1 = cy;
      nbrs(i, (j) => { if (dl[j] < 0 && kind[j] === 1 && D.fresh[j] > TH) { dl[j] = id; Q[t++] = j; } }); }
    blobs.push(b);
  }
  blobs.sort((a, b) => b.area - a.area);
  // 큰 덩이 여덟: 가장 먼 셀에서 거리 기울기를 따라 민물까지 내려간 길 = 강 한 줄
  for (const b of blobs.slice(0, 8)) {
    if (D.fresh[b.far] === INF) { b.riverLen = null; b.freed = 0; continue; }
    const line = []; let i = b.far;
    while (D.fresh[i] > 0) { line.push(i); let nx = -1; nbrs(i, (j) => { if (passB(j) && D.fresh[j] === D.fresh[i] - 1) nx = j; }); if (nx < 0) break; i = nx; }
    line.push(i);
    const onLine = new Uint8Array(N); for (const k of line) onLine[k] = 1;
    const d2 = bfs((k) => adj(k, 3) || onLine[k] === 1);
    let freed = 0; for (let k = 0; k < N; k++) if (dl[k] === b.id && d2[k] <= TH) freed++;
    b.riverLen = line.length; b.freed = freed; b.fx = b.far % NX; b.fy = (b.far / NX) | 0;
  }
  dry = { th: TH, n: blobs.length, area: blobs.reduce((a, b) => a + b.area, 0), top: blobs.slice(0, 12), sizes: blobs.map((b) => b.area) };
}

// ── 쓰기
const bin = path.join(OUTD, `${Z}.bin`);
const u8 = (a) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);
fs.writeFileSync(bin, Buffer.concat([u8(kind), u8(forest), u8(ore), u8(CB.lab), u8(C0.lab), u8(D.fresh), u8(D.forest), u8(D.ore), u8(D.rock), u8(D.sea)]));
const counts = { land: landIdx.length, sea: 0, fresh: 0, rock: 0, forest: 0, ore: 0, bridges: BR.size, exits: 0 };
for (let i = 0; i < N; i++) { const k = kind[i]; if (k === 2) counts.sea++; else if (k === 3) counts.fresh++; else if (k === 4) counts.rock++; counts.forest += forest[i]; counts.ore += ore[i]; counts.exits += exitCell[i]; }
const J = { zone: Z, NX, NY, SZ, N, counts, main: MAIN, mainArea: CB.comps[MAIN].area,
  compsB: CB.comps.slice().sort((a, b) => b.area - a.area), comps0: C0.comps.slice().sort((a, b) => b.area - a.area),
  dist, distMain, vills, dry, bin, layout: ['kind:u8', 'forest:u8', 'ore:u8', 'compB:i32', 'comp0:i32', 'fresh:u16', 'forest:u16', 'ore:u16', 'rock:u16', 'sea:u16'],
  ms: { grid: tGrid, comp: tComp, dist: tDist } };
fs.writeFileSync(path.join(OUTD, `${Z}.json`), JSON.stringify(J, null, 1));
console.log(`[T524] ${Z} ${NX}×${NY} · 뭍 ${counts.land} · 성분(다리) ${CB.comps.length} · 본토 ${J.mainArea} · 후보 ${cands.length} · 시딩 ${vills.filter((v) => v.seeded).length} · 격자 ${tGrid}ms · 성분 ${tComp}ms · 거리 ${tDist}ms`);
