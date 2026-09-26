#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T407 표 짜는 기계)
// =============================================================================
// T407 — 존 하나의 **지형 격자**와 **마을 도달**을 JSON 으로 뽑는다(관측 전용 · 세계 무변 · 새 수 0).
//
//   ⓐ 밀도 격자(step 셀마다 한 표본): 뭍 · 강·호수(`terrain.isWaterCellLocal`) · 해안선 띠(서버 `WATER_TILES` 와
//      같은 함수 `chunk.generateCoastlineWaterTiles`) · 바위(`isRockCellLocal` = 능선 − 고개 − 골짜기) ·
//      숲(`getForestMultiplier > 1.5` — `terrain.getTileType` 의 숲 문턱 그대로) · 광맥 군집(`isOreClusterAt`).
//      ⇒ 마스크를 비트로 적어 `.bin` 으로 남긴다(거리·그림은 파이썬이 이 파일에서 읽는다).
//   ⓑ 지형 JSON 기하(정본 `hanbando-terrain.json` 의 그 존 칸): 강 길이 · 호수 · 능선 · 숲 · 광맥 · 골짜기 · 군락 ·
//      고개 개수, 그리고 **원천(`hanbando-terrain.src.json`) 에 같은 이름이 있는지**(원천 / 빌드·에디터 추가).
//   ⓒ 마을 후보 전수(`terrain.siteCandidates` = 서버 시딩이 부르는 문): 선별(`pickSeedVillages`)·중심(`findOpenCenter`)
//      을 서버와 같은 길로 묻고, **실셀(1셀) 도달 성분**을 다리 있/없 두 번 칠한다(물 = 띠 ∪ 강·호수 · 바위 막힘 ·
//      다리 셀은 물 위라도 통행 — `zone.js isTerrainBlockedLocal` 과 같은 뜻).
//
// 쓰는 법: node scripts/t407-nippon-isolation.js <zoneId> <출력.json> [step=2]
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t407-iso-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const R = (p) => require(path.join(__dirname, '..', p));

const Z = process.argv[2] || 'nippon';
const OUT = process.argv[3] || `/tmp/t407-${Z}.json`;
const STEP = parseInt(process.argv[4], 10) || 2;

const { ZONES, findZoneAt } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const P = R('server/villages').__labProbe;
const ZONE = ZONES[Z], SZ = P.SZ;
if (!ZONE) { console.error('모르는 존 ' + Z); process.exit(2); }
P.setZoneId(Z);
const NX = Math.floor(ZONE.zoneWidth / SZ), NY = Math.floor(ZONE.zoneHeight / SZ);

// ── 해안선 띠 — 서버가 부르는 그 함수(사본 0)
const OR = Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }));
const BAND = R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt, OR);
const BR = new Set(); { const b = ZONE.bridges || []; for (let i = 0; i + 1 < b.length; i += 2) BR.add(b[i] + '_' + b[i + 1]); }

// ── 실셀 종류(게으른 메모): 1 뭍 · 2 물(띠 ∪ 강·호수) · 3 바위
const N = NX * NY;
const kindMemo = new Uint8Array(N);
function kind(cx, cy) {
  const i = cy * NX + cx; let v = kindMemo[i];
  if (v) return v;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  v = (BAND.has(cx + '_' + cy) || T.isWaterCellLocal(Z, x, y)) ? 2 : (T.isRockCellLocal(Z, x, y) ? 3 : 1);
  kindMemo[i] = v; return v;
}

// ── ⓐ 밀도 격자 (step 셀)
const GX = Math.ceil(NX / STEP), GY = Math.ceil(NY / STEP);
const M = { land: new Uint8Array(GX * GY), inland: new Uint8Array(GX * GY), band: new Uint8Array(GX * GY),
            rock: new Uint8Array(GX * GY), forest: new Uint8Array(GX * GY), ore: new Uint8Array(GX * GY) };
const cnt = { samples: 0, land: 0, inland: 0, band: 0, rock: 0, forest: 0, ore: 0, forestOnLand: 0, oreOnLand: 0 };
const t0 = Date.now();
for (let gy = 0; gy < GY; gy++) for (let gx = 0; gx < GX; gx++) {
  const cx = gx * STEP, cy = gy * STEP, gi = gy * GX + gx;
  const x = cx * SZ + SZ / 2, y = cy * SZ + SZ / 2;
  cnt.samples++;
  const band = BAND.has(cx + '_' + cy), inland = !!T.isWaterCellLocal(Z, x, y);
  const rock = !band && !inland && !!T.isRockCellLocal(Z, x, y);
  const land = !band && !inland && !rock;
  const forest = land && T.getForestMultiplier(Z, x, y) > 1.5;
  const ore = !band && !inland && !!T.isOreClusterAt(Z, x, y);
  if (band) { M.band[gi] = 1; cnt.band++; }
  if (inland) { M.inland[gi] = 1; cnt.inland++; }
  if (rock) { M.rock[gi] = 1; cnt.rock++; }
  if (land) { M.land[gi] = 1; cnt.land++; }
  if (forest) { M.forest[gi] = 1; cnt.forest++; }
  if (ore) { M.ore[gi] = 1; cnt.ore++; }
}
const tGrid = Date.now() - t0;

// ── ⓑ 지형 JSON 기하
const TJ = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.json'), 'utf8'))[Z] || {};
const SRC = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'server', 'hanbando-terrain.src.json'), 'utf8'))[Z]) || {};
const inZ = (x, y) => x >= 0 && y >= 0 && x < ZONE.zoneWidth && y < ZONE.zoneHeight;
function pathLenIn(pts) {   // 존 안에 든 길이(px) — 32px 간격 표본
  let L = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i].pos, [x2, y2] = pts[i + 1].pos;
    const d = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(d / 32));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n; if (inZ(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) L += d / n; }
  }
  return L;
}
const srcNames = (k) => new Set((SRC[k] || []).map((f) => f.name));
const geo = {};
for (const k of ['rivers', 'ridges', 'valleys']) {
  const sn = srcNames(k);
  const rows = (TJ[k] || []).map((f) => ({ name: f.name, lenPx: pathLenIn(f.path || []), src: sn.has(f.name) }));
  geo[k] = { n: rows.filter((r) => r.lenPx > 0).length, nAll: rows.length, lenCells: rows.reduce((a, r) => a + r.lenPx, 0) / SZ,
             srcN: rows.filter((r) => r.src && r.lenPx > 0).length, srcLenCells: rows.filter((r) => r.src).reduce((a, r) => a + r.lenPx, 0) / SZ };
}
{
  const sn = srcNames('lakes');
  const rows = (TJ.lakes || []).filter((f) => f.center && inZ(Math.min(Math.max(f.center[0], 0), ZONE.zoneWidth - 1), Math.min(Math.max(f.center[1], 0), ZONE.zoneHeight - 1)));
  geo.lakes = { nAll: (TJ.lakes || []).length, shapes: [...new Set((TJ.lakes || []).map((f) => f.shape || '?'))], srcN: (TJ.lakes || []).filter((f) => sn.has(f.name)).length };
}
{
  const sn = srcNames('forests');
  const F = TJ.forests || [];
  geo.forests = { nAll: F.length, hand: F.filter((f) => f.center).length, rect: F.filter((f) => f.rect).length, srcN: F.filter((f) => sn.has(f.name)).length };
}
{
  const O = (TJ.ores || []);
  const inO = O.filter((o) => o.center && inZ(o.center[0], o.center[1]));
  geo.ores = { nAll: O.length, nIn: inO.length, minor: inO.filter((o) => o.minor).length, major: inO.filter((o) => !o.minor).length,
               minerals: inO.reduce((m, o) => { m[o.mineral] = (m[o.mineral] || 0) + 1; return m; }, {}) };
  geo.oreCenters = inO.filter((o) => !o.minor).map((o) => [o.center[0] / SZ, o.center[1] / SZ, o.mineral]);
  geo.oreCentersMinor = inO.filter((o) => o.minor).map((o) => [o.center[0] / SZ, o.center[1] / SZ, o.mineral]);
}
geo.passes = (TJ.passes || []).length;
geo.groves = (TJ.groves || []).length;
geo.villagesJson = (TJ.villages || []).length;
geo.srcKeys = Object.fromEntries(Object.entries(SRC).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]));
geo.lakeGeom = (TJ.lakes || []).map((f) => ({ name: f.name, c: f.center && [f.center[0] / SZ, f.center[1] / SZ], r: f.radius ? f.radius / SZ : null, shape: f.shape }));
geo.riverPaths = (TJ.rivers || []).map((f) => (f.path || []).map((p) => [p.pos[0] / SZ, p.pos[1] / SZ, (p.width || 0) / SZ]));

// ── ⓒ 마을 후보 · 선별 · 중심 · 도달
const isWaterTileLocal = (x, y) => { if (ZONE.isOcean) return true; if (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ); return kind(tx, ty) === 2; };
const isRockTileLocal = (x, y) => { if (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) return false; return !!T.isRockCellLocal(Z, x, y); };
const isTerrainBlockedLocal = (x, y) => (x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const ta = P.makeTerrainAdapter(T, ZONE, { isTerrainBlockedLocal, isWaterTileLocal });
const cands = T.siteCandidates(Z) || [];
const _log = console.log; console.log = () => {};
const picked = P.pickSeedVillages(cands, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
console.log = _log;
const pickedNames = new Set(picked.map((v) => v.name));
// ★왜 안 섰나 — 규칙을 다시 적지 않는다: 같은 선별 함수에 **그 후보 하나만** 넣어 본다.
//   혼자서도 안 뽑히면 땅(식량 하한) · 혼자선 뽑히는데 전체에선 빠지면 간격/상한 · 뽑혔는데 중심이 없으면 물 위.
const vills = cands.map((hv) => {
  const c = pickedNames.has(hv.name) ? P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ)) : null;
  let why = null;
  if (!pickedNames.has(hv.name)) {
    console.log = () => {}; const alone = P.pickSeedVillages([hv], ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 }); console.log = _log;
    why = alone.length ? '간격·상한' : '땅(식량 하한)';
  } else if (!c) why = '물 위(설 자리 없음)';
  return { name: hv.name, type: hv.type, x: hv.x / SZ, y: hv.y / SZ, picked: pickedNames.has(hv.name),
           seeded: !!c, ccx: c ? c.ccx : null, ccy: c ? c.ccy : null, why };
});

// 실셀 성분 칠하기 — 다리 있/없
function label(useBridge) {
  const lab = new Int32Array(N).fill(-1);
  const q = new Int32Array(N);
  const open = (cx, cy) => { const k = kind(cx, cy); if (k === 3) return false; if (k === 2) return useBridge && BR.has(cx + '_' + cy); return true; };
  const comps = [];
  const want = vills.filter((v) => v.seeded);
  const seedOf = (v) => {
    if (open(v.ccx, v.ccy)) return [v.ccx, v.ccy];
    for (let r = 1; r <= 24; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = v.ccx + dx, y = v.ccy + dy; if (x >= 0 && y >= 0 && x < NX && y < NY && open(x, y)) return [x, y]; }
    return null;
  };
  for (const v of want) {
    const s = seedOf(v); if (!s) { v[useBridge ? 'compB' : 'comp0'] = null; continue; }
    const si = s[1] * NX + s[0];
    if (lab[si] < 0) {
      const id = comps.length; let head = 0, tail = 0, size = 0;
      lab[si] = id; q[tail++] = si;
      while (head < tail) {
        const i = q[head++]; size++;
        const cx = i % NX, cy = (i / NX) | 0;
        if (cx > 0) { const j = i - 1; if (lab[j] < 0 && open(cx - 1, cy)) { lab[j] = id; q[tail++] = j; } }
        if (cx < NX - 1) { const j = i + 1; if (lab[j] < 0 && open(cx + 1, cy)) { lab[j] = id; q[tail++] = j; } }
        if (cy > 0) { const j = i - NX; if (lab[j] < 0 && open(cx, cy - 1)) { lab[j] = id; q[tail++] = j; } }
        if (cy < NY - 1) { const j = i + NX; if (lab[j] < 0 && open(cx, cy + 1)) { lab[j] = id; q[tail++] = j; } }
      }
      comps.push(size);
    }
    v[useBridge ? 'compB' : 'comp0'] = lab[si];
  }
  return comps;
}
const t1 = Date.now();
const compsB = label(true), comps0 = label(false);
const seededV = vills.filter((v) => v.seeded);
for (const v of seededV) {
  v.partnersB = seededV.filter((u) => u !== v && u.compB != null && u.compB === v.compB).length;
  v.partners0 = seededV.filter((u) => u !== v && u.comp0 != null && u.comp0 === v.comp0).length;
  v.viaBridge = v.partnersB - v.partners0;
  v.compSizeB = v.compB != null ? compsB[v.compB] : 0;
}
const tFlood = Date.now() - t1;

const bin = path.join(path.dirname(OUT), path.basename(OUT, '.json') + '.bin');
fs.writeFileSync(bin, Buffer.concat(['land', 'inland', 'band', 'rock', 'forest', 'ore'].map((k) => Buffer.from(M[k]))));
fs.writeFileSync(OUT, JSON.stringify({ zone: Z, NX, NY, STEP, GX, GY, zoneWidth: ZONE.zoneWidth, zoneHeight: ZONE.zoneHeight,
  bandTiles: BAND.size, bridgeCells: BR.size, cnt, geo, vills, compsB, comps0, bin, masks: ['land', 'inland', 'band', 'rock', 'forest', 'ore'],
  ms: { grid: tGrid, flood: tFlood } }, null, 1));
console.log(`[T407] ${Z} ${NX}×${NY}셀 · 표본 ${cnt.samples}(step ${STEP}) · 띠 ${BAND.size} · 다리 ${BR.size} · 후보 ${cands.length} · 선별 ${picked.length} · 시딩 ${seededV.length} · 격자 ${tGrid}ms · 칠하기 ${tFlood}ms → ${OUT}`);
