#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T702 계측기 · 제품 무변 · 읽기만)
// === scripts/t702-forest-audit.js — **마을 둘레에 숲 · 나무 · 바위가 실제로 얼마나 있나**(오늘 지도 · 51마을) ==========
//   T702 ① "왜 모자라나" 의 지도 쪽 자. 세계를 띄우지 않는다 — 서버가 부르는 **그 함수들**만 부른다(사본 0):
//     · 마을 자리 — `t17-metrics` 와 같은 길(정본 칸 `getZoneVillages` → `pickSeedVillages` → `findOpenCenter` → `VillageLayout.generate`
//       → `extractLandParamsApprox`) · `--seeds <LAB_SEEDCACHE>` 를 주면 그 캐시(같은 길로 구운 것)를 읽는다.
//     · 숲 배수 — `terrain.getForestMultiplier`(어댑터 `ta.forestMult`) · 칸 셋으로 가른다:
//         ⓐ 빽빽(> 1.5 — 숲 격자가 나무를 **심는** 문턱 · `chunk.js` 숲 그리드 `<= 1.5 continue` · 청크 문턱 `FOREST_MIN_COV`)
//         ⓑ 숲으로 세지만 격자 나무 0(1.2 < 배수 ≤ 1.5 — `extractLandParamsApprox` 의 `> 1.2` 는 세고 그리드는 안 심는다)
//         ⓒ 숲 아님(≤ 1.2 = 1.0 — 흩뿌림 나무만)
//       반경 140셀(`LAND_SCAN_R`) 전수(스텝 1) + 서버 스텝 4 판(= `land.wood` 를 만든 그 표본 — 물 칸도 분모).
//     · 선 나무 — `chunk.generateChunkResources`(청크가 켜질 때 부르는 그 함수 · 장부 없이 = 시딩 날 원판)에서 `tree` 만 ·
//       **모든 마을 영토 칸의 나무는 뺀다**(부팅 개간 T378 — 영토 안은 걷히고 T566 이 재생을 막는다).
//     · 걸어서 닿는 거리 — 회관 칸에서 다익스트라(8방 · 대각 √2 · 모서리 깎기 금지) · 통행 = `!ta.isBlocked`(물 · 바위 · 존 밖 —
//       다리 술어는 자 어댑터에 없다 · 서버 다리 칸은 못 본다) · 상자 ±`MAXW`셀.
//     · 띠(걸음 셀): [0,30) · [30,50) · [50,100) · [100,140) · [140,200] · 못 닿음(곧은 거리 ≤ 200 인데 길 없음/200 넘음)
//       30 ≈ 영토 반경(시딩 영토 3,450칸) · 140 = 땅 스캔 반경 · 걸음 2셀/초(`MOVE_SPEED` 64px) · 낮 1,008초 ⇒ 200셀 왕복 = 200초.
//     · 바위(돌 덤 표) — `rock` 개체(흩뿌림 · 산 50%)와 바위 칸(`ta.isRock` — 개체가 안 서는 산)을 같은 띠로.
//   출력: 표(stdout) · `--out <json>`(마을별 전부) · `--trees <json>`(나무 키 → [마을 번호, 띠, 칸 x, 칸 y] — 가장 가까운(걸음) 마을 하나에 ·
//     서버 판 관찰자 `t702-wood-probe.js` 가 끝날 때 읽는다)
//   쓰는 법: node scripts/t702-forest-audit.js [--seeds <LAB_SEEDCACHE>] [--out x.json] [--trees y.json] [--zone-sample 4] [--limit N]
//     `T702_DEBUG=1` = 마을마다 단계 시간(계측 편의) · 51곳 ~2분(코어 하나)
'use strict';
const path = require('path');
const fs = require('fs');
const ROOT = path.join(__dirname, '..');
const R = (p) => require(path.join(ROOT, p));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };

const { ZONES } = R('server/zone-config');
const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
const C = R('server/chunk');
const VillageLayout = R('server/village-layout');
const Villages = R('server/villages');
const LV = R('server/livelihood');
const P = Villages.__labProbe;
const Z = 'hanbando', ZONE = ZONES[Z], SZ = P.SZ, CS = C.CHUNK_SIZE;
P.setZoneId(Z);
// ── 지형 어댑터 — `t17-metrics` 와 같은 술어(한반도 해안 띠 끔 = 그 자의 기본 · 개울 술어 `rulerDeps`) ──
const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
const isWaterTileLocal = (x, y) => {
  if (!_inZone(x, y)) return false;
  const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
  try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; }
};
const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
const isTerrainBlockedLocal = (x, y) => (!_inZone(x, y)) ? true : (isRockTileLocal(x, y) || isWaterTileLocal(x, y));
const _t601 = R('server/streams').rulerDeps(Z, { isTerrainBlockedLocal, isWaterTileLocal });
const ta = P.makeTerrainAdapter(T, ZONE, _t601.deps);
const _tInit = Date.now();

// ── 마을 — 캐시가 있으면 그것(같은 길로 구운 것 · 개울 표식이 다르면 버린다) ──
let seeds = null;
const SEEDF = arg('--seeds', '');
if (SEEDF && fs.existsSync(SEEDF)) {
  seeds = JSON.parse(fs.readFileSync(SEEDF, 'utf8'));
  if (((seeds[0] && seeds[0].t601s) || '') !== _t601.sig) { console.log(`  ⚠ 캐시 개울 표식이 다르다 — 다시 굽는다`); seeds = null; }
}
if (!seeds) {
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, ta, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  seeds = [];
  for (const hv of picked) {
    const c = P.findOpenCenter(ta, Math.round(hv.x / SZ), Math.round(hv.y / SZ));
    if (!c) continue;
    let layout;
    try { if (ta.prepareFert) ta.prepareFert(c.ccx, c.ccy, 62); layout = VillageLayout.generate(ta, c.ccx, c.ccy, P.INITIAL_POP, {}); } catch (e) { continue; }
    const lp = P.extractLandParamsApprox(ta, c.ccx, c.ccy, layout);
    seeds.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy, lp, layout: { territory: layout.territory } });
  }
}
const LIMIT = parseInt(arg('--limit', '0'), 10) || 0;
if (LIMIT > 0) seeds = seeds.slice(0, LIMIT);
const kindOf = (nm) => (String(nm).match(/^(광산|어촌|임업|농촌)/) || [null, '그 밖'])[1];

// ── 모든 마을 영토 칸(부팅 개간이 걷는 칸) ──
const terrAll = new Set();
for (const s of seeds) for (const c of (s.layout.territory || [])) terrAll.add(c[0] * 65536 + c[1]);

// ── 청크 원판(장부 없음) — 나무 · 바위 개체만 · 청크마다 한 번 ──
const chunkCache = new Map();
function chunkEnts(qx, qy) {
  const k = qx + ',' + qy;
  let a = chunkCache.get(k);
  if (a) return a;
  a = [];
  if (qx >= 0 && qy >= 0 && qx * CS < ZONE.zoneWidth && qy * CS < ZONE.zoneHeight) {
    for (const e of C.generateChunkResources(Z, ZONE.biome, qx, qy, CS)) {
      if (e.type !== 'tree' && e.type !== 'rock') continue;
      a.push({ k: e.seedKey, t: e.type === 'tree' ? 1 : 2, g: /_ft/.test(e.seedKey) ? 1 : 0, cx: Math.floor(e.x / SZ), cy: Math.floor(e.y / SZ) });
    }
  }
  chunkCache.set(k, a);
  return a;
}

// ── 걸음 거리장 — 다익스트라(이진 힙) · 상자 ±MAXW ──
const MAXW = 200;
const BANDS = [30, 50, 100, 140, 200.0001];   // 위 머리말의 띠 끝(마지막은 200 포함)
const BANDN = ['0~30', '30~50', '50~100', '100~140', '140~200', '못 닿음'];
function bandOf(d) { if (!Number.isFinite(d)) return 5; for (let i = 0; i < BANDS.length; i++) if (d < BANDS[i]) return i; return 5; }
function walkField(ccx, ccy) {
  const W = 2 * MAXW + 1, N = W * W, x0 = ccx - MAXW, y0 = ccy - MAXW;
  const pass = new Uint8Array(N);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) pass[j * W + i] = ta.isBlocked(x0 + i, y0 + j) ? 0 : 1;
  const dist = new Float64Array(N).fill(Infinity);   // ⚠Float64 — Float32 반올림은 같은 거리를 "더 짧다"로 읽어 끝없이 다시 민다(첫 판이 그렇게 멎었다)
  const heap = [];   // [d, idx]
  const push = (d, i) => { heap.push([d, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  const s = MAXW * W + MAXW;
  // 회관 칸이 막혔으면(개울 마당 등) 가장 가까운 통행 칸에서 시작
  let start = s;
  if (!pass[s]) { let best = Infinity; for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) { const q = (MAXW + j) * W + (MAXW + i); if (pass[q] && i * i + j * j < best) { best = i * i + j * j; start = q; } } }
  dist[start] = 0; push(0, start);
  const D8 = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]];
  while (heap.length) {
    const [d, idx] = pop();
    if (d > dist[idx] || d > MAXW) continue;
    const i = idx % W, j = (idx - i) / W;
    for (const [dx, dy, w] of D8) {
      const ni = i + dx, nj = j + dy;
      if (ni < 0 || nj < 0 || ni >= W || nj >= W) continue;
      const q = nj * W + ni;
      if (!pass[q]) continue;
      if (dx && dy && (!pass[j * W + ni] || !pass[nj * W + i])) continue;   // 모서리 깎기 금지
      const nd = d + w;
      if (nd < dist[q]) { dist[q] = nd; push(nd, q); }
    }
  }
  return { at: (cx, cy) => { const i = cx - x0, j = cy - y0; if (i < 0 || j < 0 || i >= W || j >= W) return Infinity; const v = dist[j * W + i]; return v; } };
}

const t0 = Date.now();
console.log(`  준비 ${((t0 - _tInit) / 1000) | 0}초 · 마을 ${seeds.length}`);
const rows = [];
const treeKeys = {};   // 나무 키 → [마을 번호, 띠] — 가장 가까운(걸음) 마을 하나에 붙인다
const keyBest = new Map();
const DBG = process.env.T702_DEBUG === '1';
let _tp = Date.now();
const tick = (nm) => { if (DBG) { const t = Date.now(); console.log(`    [${nm}] ${t - _tp}ms`); _tp = t; } };
seeds.forEach((s, vi) => {
  const { ccx, ccy } = s;
  tick('start ' + s.name);
  // ① 숲 칸 — 140셀 전수
  const RR = P.LAND_SCAN_R || 140;
  let all = 0, water = 0, rock = 0, dense = 0, low = 0, open = 0;
  for (let dy = -RR; dy <= RR; dy++) for (let dx = -RR; dx <= RR; dx++) {
    if (dx * dx + dy * dy > RR * RR) continue;
    all++;
    const x = ccx + dx, y = ccy + dy;
    if (ta.isWater(x, y)) { water++; continue; }
    if (ta.isRock(x, y)) { rock++; continue; }
    const f = ta.forestMult(x, y);
    if (f > 1.5) dense++; else if (f > 1.2) low++; else open++;
  }
  tick('forest140');
  // ① 서버 스텝 4 판(= land.wood 의 표본 · 분모에 물 칸 포함)
  let n4 = 0, f4 = 0;
  for (let dy = -RR; dy <= RR; dy += 4) for (let dx = -RR; dx <= RR; dx += 4) {
    if (dx * dx + dy * dy > RR * RR) continue;
    n4++;
    if (!ta.isRock(ccx + dx, ccy + dy) && ta.forestMult(ccx + dx, ccy + dy) > 1.2) f4++;
  }
  tick('step4');
  // ② 걸음 거리장 · 나무 · 바위
  const wf = walkField(ccx, ccy);
  tick('walk');
  const tB = [0, 0, 0, 0, 0, 0], tBg = [0, 0, 0, 0, 0, 0], rB = [0, 0, 0, 0, 0, 0], rcB = [0, 0, 0, 0, 0, 0];
  let terrTrees = 0, nearDense = Infinity, nearDenseStraight = Infinity;
  const q0x = Math.floor(((ccx - MAXW) * SZ) / CS), q1x = Math.floor(((ccx + MAXW) * SZ) / CS);
  const q0y = Math.floor(((ccy - MAXW) * SZ) / CS), q1y = Math.floor(((ccy + MAXW) * SZ) / CS);
  for (let qy = q0y; qy <= q1y; qy++) for (let qx = q0x; qx <= q1x; qx++) {
    for (const e of chunkEnts(qx, qy)) {
      const dxs = e.cx - ccx, dys = e.cy - ccy, ds = Math.hypot(dxs, dys);
      if (ds > MAXW) continue;
      if (e.t === 1 && terrAll.has(e.cx * 65536 + e.cy)) { terrTrees++; continue; }   // 부팅 개간(모든 마을 영토)
      const b = bandOf(wf.at(e.cx, e.cy));
      if (e.t === 1) {
        tB[b]++; if (e.g) tBg[b]++;
        const d = wf.at(e.cx, e.cy);
        const prev = keyBest.get(e.k);
        if (!prev || d < prev[2]) keyBest.set(e.k, [vi, b, d, e.cx, e.cy]);
      } else rB[b]++;
    }
  }
  tick('chunks');
  // 바위 칸 · 가장 가까운 빽빽한 숲 칸(걸음 · 곧은) — 상자 안 전수
  for (let dy = -MAXW; dy <= MAXW; dy++) for (let dx = -MAXW; dx <= MAXW; dx++) {
    const ds = Math.hypot(dx, dy); if (ds > MAXW) continue;
    const x = ccx + dx, y = ccy + dy;
    if (ta.isRock(x, y)) { rcB[bandOf(Math.min(wf.at(x + 1, y), wf.at(x - 1, y), wf.at(x, y + 1), wf.at(x, y - 1)) + 1)]++; continue; }   // 바위 칸은 못 밟는다 — 이웃 통행 칸 + 1
    if (ta.isWater(x, y)) continue;
    if (ta.forestMult(x, y) > 1.5) {
      if (ds < nearDenseStraight) nearDenseStraight = ds;
      const d = wf.at(x, y); if (d < nearDense) nearDense = d;
    }
  }
  tick('near');
  const lp = s.lp || {};
  const terrN = (s.layout.territory || []).length;
  rows.push({
    name: s.name, kind: kindOf(s.name), ccx, ccy, terr: terrN,
    land: { wood: lp.wood, stone: lp.stone, game: lp.game, ore: lp.ore, fertility: lp.fertility, water: lp.water, woodSustain: lp.woodSustain == null ? null : lp.woodSustain },
    cells: { all, water, rock, dense, low, open, land: all - water - rock },
    share: { forest12: +((dense + low) / all).toFixed(4), forest12Land: +((dense + low) / Math.max(1, all - water - rock)).toFixed(4), dense15: +(dense / all).toFixed(4), step4: +(f4 / n4).toFixed(4), step4n: n4 },
    woodFromStep4: +Math.max(0.05, Math.min(2.5, LV.FLOOR.wood + LV.GAIN.wood * (f4 / n4))).toFixed(2),
    trees: tB, treesGrid: tBg, terrTrees, rocks: rB, rockCells: rcB,
    nearDense: Number.isFinite(nearDense) ? +nearDense.toFixed(1) : null, nearDenseStraight: Number.isFinite(nearDenseStraight) ? +nearDenseStraight.toFixed(1) : null,
  });
  if ((vi + 1) % 10 === 0) console.log(`  … ${vi + 1}/${seeds.length} · ${((Date.now() - t0) / 1000) | 0}초`);
});
for (const [k, v] of keyBest) treeKeys[k] = [v[0], v[1], v[3], v[4]];

// ── 존 전체 — 뭍 칸 중 숲 몫(스텝 ZS) · 숲 피처 밀도 ──
const ZS = parseInt(arg('--zone-sample', '4'), 10) || 4;
let zl = 0, zd = 0, zlow = 0;
const NX = Math.floor(ZONE.zoneWidth / SZ), NY = Math.floor(ZONE.zoneHeight / SZ);
for (let y = 0; y < NY; y += ZS) for (let x = 0; x < NX; x += ZS) {
  if (ta.isWater(x, y) || ta.isRock(x, y)) continue;
  zl++;
  const f = ta.forestMult(x, y);
  if (f > 1.5) zd++; else if (f > 1.2) zlow++;
}
const forests = (T.ZONE_TERRAIN && T.ZONE_TERRAIN[Z] && T.ZONE_TERRAIN[Z].forests) || [];
const dens = forests.map((f) => +(f.densityMult || f.density || 1));
const zone = { landSamples: zl, dense: +(zd / zl).toFixed(4), low: +(zlow / zl).toFixed(4), forest12: +((zd + zlow) / zl).toFixed(4),
  features: forests.length, featLe15: dens.filter((d) => d <= 1.5).length, featLow: forests.filter((f) => (f.densityMult || f.density || 1) <= 1.5).map((f) => ({ name: f.name || null, d: f.densityMult || f.density, rx: f.rx, ry: f.ry, center: f.center })) };

// ── 표 ──
const med = (a) => { const b = a.filter(Number.isFinite).slice().sort((x, y) => x - y); if (!b.length) return null; const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const pc = (x) => (x * 100).toFixed(1) + '%';
console.log(`\n=== T702 숲 감사 — 오늘 지도 · ${rows.length}마을 · ${((Date.now() - t0) / 1000) | 0}초 ===`);
console.log(`존 전체(뭍 · 스텝 ${ZS}): 빽빽(>1.5) ${pc(zone.dense)} · 숲으로 세나 격자 0(1.2~1.5) ${pc(zone.low)} · 숲 피처 ${zone.features}개 중 배수 ≤ 1.5 ${zone.featLe15}개`);
console.log('\n| 마을 | land.wood | 숲 칸(>1.2) 140셀 · 몫(전체/뭍) | 빽빽(>1.5) | 1.2~1.5 | 숲 아님 뭍 | 스텝4 몫 | 선 나무 걸음 0~30 / 30~50 / 50~100 / 100~140 / 140~200 / 못 닿음 | 영토 안 걷힌 나무 | 가장 가까운 빽빽 숲(걸음 · 곧은) | land.stone | 바위 개체(같은 띠) |');
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.name} | ${r.land.wood} | ${r.cells.dense + r.cells.low} · ${pc(r.share.forest12)} / ${pc(r.share.forest12Land)} | ${r.cells.dense} | ${r.cells.low} | ${r.cells.open} | ${pc(r.share.step4)} | ${r.trees.join(' / ')} | ${r.terrTrees} | ${r.nearDense ?? '—'} · ${r.nearDenseStraight ?? '—'} | ${r.land.stone} | ${r.rocks.join(' / ')} |`);
}
const byKind = {};
for (const r of rows) { const k = r.kind; (byKind[k] || (byKind[k] = [])).push(r); }
console.log('\n| 갈래 | 마을 | 숲 칸(>1.2 · 스텝4) 0 | 빽빽 칸 0(전수) | land.wood < 1 | 숲 몫 중앙(스텝4) | 걸음 100셀 안 선 나무 중앙 | 걸음 140셀 안 선 나무 0 |');
console.log('|---|---|---|---|---|---|---|---|');
const sumTo = (r, b) => r.trees.slice(0, b).reduce((a, x) => a + x, 0);
for (const k of Object.keys(byKind).concat(['전체'])) {
  const L = k === '전체' ? rows : byKind[k];
  console.log(`| ${k} | ${L.length} | ${L.filter((r) => r.share.step4 === 0).length} | ${L.filter((r) => r.cells.dense === 0).length} | ${L.filter((r) => r.land.wood < 1).length} | ${pc(med(L.map((r) => r.share.step4)))} | ${med(L.map((r) => sumTo(r, 3)))} | ${L.filter((r) => sumTo(r, 4) === 0).length} |`);
}
const OUT = arg('--out', '');
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ zone, bands: BANDN, maxWalk: MAXW, seedsFrom: SEEDF || 'fresh', t601s: _t601.sig, rows }, null, 1));
const TK = arg('--trees', '');
if (TK) fs.writeFileSync(TK, JSON.stringify({ bands: BANDN, names: rows.map((r) => r.name), keys: treeKeys }));
console.log(`\n${OUT ? '→ ' + OUT : ''} ${TK ? '→ ' + TK + ` (나무 키 ${Object.keys(treeKeys).length})` : ''}`);
