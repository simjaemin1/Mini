#!/usr/bin/env node
// (@regress 없음 — 러너 밖 · T527 ① 표 기계)
// =============================================================================
// T527 ① — 마을이 다리를 **원하는** 자리: 교역 거리행렬이 물 때문에 끊기거나 돌아가는 마을 쌍.
//
//   교역 거리 = 정본 `villages.js computeAndInjectDistMatrix` 그대로(`__labProbe._distProbe` — 코스 격자 · `coarseOpen` · 8방 · 코너 절단 금지).
//   판 넷을 **자식 프로세스**로 잰다(거리행렬의 코스 격자 캐시 `_distBlk` 가 판 사이에 새지 않게 — 프로세스가 곧 캐시 경계):
//     A = 시딩 다리 켬(존 설정 `bridges` · 서버 술어와 같은 뜻: 물 위 다리 칸만 통행)
//     B = 다리 끔(다리가 지금 무엇을 벌고 있나)
//     C = 물 열림(바위만 막힘 — "어디든 다리를 놓을 수 있다면")
//     D = A + 착공 후보(존 설정 `bridgeSites` — 계획기 v2 가 낸 셀 그대로) 전부 완공
//   쌍 분류(새 수 0 — 문턱은 정본의 것):
//     · 물이 끊은 쌍 = A 무한 ∧ C 유한
//     · 물이 교역 창 밖으로 민 쌍 = A 유한 ∧ A > capA ∧ C ≤ capA (cap = 행렬 최대 유한거리 × 0.5 — v2 top-K 절대 상한 `economy-sim-v2`)
//     · 물로 우회하는 쌍 = A 유한 ∧ A ÷ C > 1.02(거리행렬 로그의 "우회쌍" 문턱 그대로)
//   마을 = 자(`t176-ab`)와 같은 시딩(`pickSeedVillages` + `findOpenCenter`).
//
// 쓰는 법: node scripts/t527-bridge-want.js <zoneId> [출력.json]     (자식: T527_WANT_CHILD=A|B|C|D)
// =============================================================================
'use strict';
process.env.ENABLE_VILLAGES = process.env.ENABLE_VILLAGES || '0';
process.env.DB_PATH = process.env.DB_PATH || `/tmp/t527w-${process.pid}.db`;
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const R = (p) => require(path.join(__dirname, '..', p));
const Z = process.argv[2] || 'hanbando';
const OUT = process.argv[3] || '';

function setup(mode) {
  const { ZONES, findZoneAt } = R('server/zone-config');
  const T = R('server/terrain'); if (T.setZonesMeta) T.setZonesMeta(ZONES);
  const P = R('server/villages').__labProbe;
  const ZONE = ZONES[Z], SZ = P.SZ;
  P.setZoneId(Z);
  const _inZone = (x, y) => !(x < 0 || y < 0 || x >= ZONE.zoneWidth || y >= ZONE.zoneHeight);
  const _COAST = process.env.T17_COAST !== undefined ? process.env.T17_COAST === '1' : (Z !== 'hanbando');
  const BAND = _COAST ? R('server/chunk').generateCoastlineWaterTiles({ ...ZONE, id: Z }, SZ, findZoneAt,
    Object.values(ZONES).filter((z) => z.isOcean).map((z) => ({ x0: z.worldOffsetX, y0: z.worldOffsetY, x1: z.worldOffsetX + z.zoneWidth, y1: z.worldOffsetY + z.zoneHeight }))) : null;
  const isWaterTileLocal = (x, y) => { if (!_inZone(x, y)) return false; const tx = Math.floor(x / SZ), ty = Math.floor(y / SZ);
    if (BAND && BAND.has(`${tx}_${ty}`)) return true; try { return !!T.isWaterCellLocal(Z, tx * SZ + SZ / 2, ty * SZ + SZ / 2); } catch { return false; } };
  const isRockTileLocal = (x, y) => { if (!_inZone(x, y)) return false; try { return !!T.isRockCellLocal(Z, x, y); } catch { return false; } };
  // 다리 칸 — A·D 만(서버 `isBridgeTileLocal` 과 같은 키 · 셀 좌표)
  const br = new Set();
  const addFlat = (f) => { for (let i = 0; i + 1 < (f || []).length; i += 2) br.add(f[i] + '_' + f[i + 1]); };
  if (mode === 'A' || mode === 'D' || mode === 'E') addFlat(ZONE.bridges);
  if (mode === 'D') for (const s of (ZONE.bridgeSites || [])) addFlat(s.cells);
  if (mode === 'E' && process.env.T527_EXTRA_FILE) addFlat(JSON.parse(fs.readFileSync(process.env.T527_EXTRA_FILE, 'utf8')));   // ★[T537] 지름길 후보 셀(표만)
  const isBridgeLocal = (x, y) => br.has(Math.floor(x / SZ) + '_' + Math.floor(y / SZ));
  const blockedFn = mode === 'C'
    ? (x, y) => !_inZone(x, y) || isRockTileLocal(x, y)
    : (x, y) => !_inZone(x, y) || isRockTileLocal(x, y) || isWaterTileLocal(x, y);
  const deps = { isTerrainBlockedLocal: blockedFn, isWaterTileLocal };
  if (br.size) deps.isBridgeLocal = isBridgeLocal;
  const ta = P.makeTerrainAdapter(T, ZONE, deps);
  return { T, P, ta, ZONE, SZ, isWaterTileLocal, isRockTileLocal, brN: br.size };
}

// ══ ★[T537 ③] 지름길 후보 — **표만**(규칙 0 · 제품 무접촉 · 계획기 v2 무접촉). 재민 #92 자료. ══════════════════════════════
//   규칙 문장 후보(이 표가 재는 것): "창 밖 쌍마다 **C 판(물 열림) 최단 경로**가 건너는 물줄기마다, 그 물줄기에서 축 4방 최단 도하(폭 2 · 착지 포함)".
//   · C 판 길 = 교역 거리행렬과 같은 코스 격자(4셀) · 8방(10/14) · 코너 절단 금지 · 열림 = 코스 셀 중심이 막히지 않음(C 판엔 다리가 없어 `coarseOpen` 과 같다)
//   · 물줄기 = 그 길의 코스 노드 중 중심 칸이 물(존 물 술어 — 해안 띠 포함 여부는 자와 같은 `T17_COAST`)인 연속 구간
//   · 도하 = 그 구간 노드 중심 칸마다 가로·세로 두 축으로 물을 건너 양쪽 뭍(물·바위 아님)까지 — 물 칸 수 최소(상한 200 = 계획기 `MAX_SPAN`) ·
//     단 **가로지르는** 것만(한 끝이 길이 물에 든 뭍에, 다른 끝이 나온 뭍에 더 가깝다 — 물줄기를 따라 옆으로 건너는 도하는 길을 안 줄인다) ·
//     셀 = 계획기 v2 와 같은 모양(k = 0..len+1 · 폭 2) — 모양만 같고 계획기 코드는 안 부른다(계획기는 끊긴 섬만 본다)
if (process.env.T527_WANT_CHILD === 'P') {
  const { P, ta, ZONE, SZ, isWaterTileLocal, isRockTileLocal } = setup('C');
  const IN = JSON.parse(fs.readFileSync(process.env.T527_PAIRS_FILE, 'utf8'));   // { vs, pairs:[{i,j}] }
  const STEP = P._distProbe.DIST_STEP, half = STEP >> 1;
  const W = Math.ceil(ZONE.zoneWidth / SZ), Hh = Math.ceil(ZONE.zoneHeight / SZ), gw = Math.ceil(W / STEP), gh = Math.ceil(Hh / STEP);
  const px = (c) => c * SZ + SZ / 2;
  const wet = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < Hh && isWaterTileLocal(px(cx), px(cy));
  const land = (cx, cy) => cx >= 0 && cy >= 0 && cx < W && cy < Hh && !isWaterTileLocal(px(cx), px(cy)) && !isRockTileLocal(px(cx), px(cy));
  const openMemo = new Int8Array(gw * gh);
  const open = (gx, gy) => { if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) return false; const i = gy * gw + gx; if (!openMemo[i]) openMemo[i] = ta.isBlocked(gx * STEP + half, gy * STEP + half) ? 2 : 1; return openMemo[i] === 1; };
  const snap = (v) => {   // 거리행렬 `srcNode` 와 같은 나선(반경 6노드 · 16방)
    const gx0 = Math.min(gw - 1, Math.max(0, Math.round(v.ccx / STEP))), gy0 = Math.min(gh - 1, Math.max(0, Math.round(v.ccy / STEP)));
    if (open(gx0, gy0)) return gy0 * gw + gx0;
    for (let r = 1; r <= 6; r++) for (let a = 0; a < 16; a++) { const nx = Math.round(gx0 + Math.cos(a / 16 * 2 * Math.PI) * r), ny = Math.round(gy0 + Math.sin(a / 16 * 2 * Math.PI) * r); if (open(nx, ny)) return ny * gw + nx; }
    return -1;
  };
  const DIRS = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
  const dist = new Int32Array(gw * gh), prev = new Int32Array(gw * gh);
  function pathOf(s, t) {
    dist.fill(-1); prev.fill(-1); dist[s] = 0; const B = [[s]];
    for (let c = 0; c < B.length; c++) { const q = B[c]; if (!q) continue;
      for (let h = 0; h < q.length; h++) { const i = q[h]; if (dist[i] !== c) continue; if (i === t) { const out = []; for (let k = t; k >= 0; k = prev[k]) out.push(k); return out.reverse(); }
        const x = i % gw, y = (i / gw) | 0;
        for (const [dx, dy, w] of DIRS) { const nx = x + dx, ny = y + dy; if (!open(nx, ny)) continue; if (dx && dy && (!open(x + dx, y) || !open(x, y + dy))) continue;
          const ni = ny * gw + nx, nc = c + w; if (dist[ni] < 0 || nc < dist[ni]) { dist[ni] = nc; prev[ni] = i; (B[nc] || (B[nc] = [])).push(ni); } } }
      B[c] = null; }
    return null;
  }
  function crossingAt(cx, cy, E0, X0) {   // 한 칸에서 두 축 — 물 칸 수 최소 도하(양끝 뭍 · 한 끝은 길이 물에 든 쪽, 다른 끝은 나온 쪽에 더 가깝다)
    let best = null;
    for (const [ax, ay] of [[1, 0], [0, 1]]) {
      let a = 0; while (a < 200 && wet(cx - ax * (a + 1), cy - ay * (a + 1))) a++;
      let b = 0; while (b < 200 && wet(cx + ax * (b + 1), cy + ay * (b + 1))) b++;
      const len = a + b + 1; if (len > 200) continue;
      const x0 = cx - ax * (a + 1), y0 = cy - ay * (a + 1), x1 = cx + ax * (b + 1), y1 = cy + ay * (b + 1);
      if (!land(x0, y0) || !land(x1, y1)) continue;
      const d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
      const side = (d([x0, y0], E0) < d([x0, y0], X0) && d([x1, y1], X0) < d([x1, y1], E0)) || (d([x0, y0], X0) < d([x0, y0], E0) && d([x1, y1], E0) < d([x1, y1], X0));
      if (!side) continue;   // 물줄기를 **가로지르는** 도하만(길이 든 뭍 ↔ 나온 뭍) — 물줄기를 따라 옆으로 건너는 도하는 길을 안 줄인다
      if (!best || len < best.len) best = { len, x0, y0, dx: ax, dy: ay };
    }
    return best;
  }
  const cand = new Map(); const pairOut = [];
  for (const pr of IN.pairs) {
    const s = snap(IN.vs[pr.i]), t = snap(IN.vs[pr.j]);
    const path = (s >= 0 && t >= 0) ? pathOf(s, t) : null;
    const runs = []; let cur = null, lastLand = null;
    for (const n of (path || [])) { const cx = (n % gw) * STEP + half, cy = ((n / gw) | 0) * STEP + half;
      if (wet(cx, cy)) { if (!cur) cur = { E0: lastLand || [cx, cy], cells: [] }; cur.cells.push([cx, cy]); }
      else { if (cur) { cur.X0 = [cx, cy]; runs.push(cur); cur = null; } lastLand = [cx, cy]; } }
    if (cur) { cur.X0 = cur.cells[cur.cells.length - 1]; runs.push(cur); }
    const keys = []; let noCross = 0;
    for (const run of runs) {
      let best = null; for (const [cx, cy] of run.cells) { const c = crossingAt(cx, cy, run.E0, run.X0); if (c && (!best || c.len < best.len)) best = c; }
      if (!best) { noCross++; continue; }
      const key = `${best.dx ? 'x' : 'y'}:${best.x0},${best.y0}`;
      if (!cand.has(key)) { const perp = best.dx ? [0, 1] : [1, 0], cells = [];
        for (let k = 0; k <= best.len + 1; k++) { const bx = best.x0 + best.dx * k, by = best.y0 + best.dy * k; for (let w = 0; w < 2; w++) cells.push(bx + perp[0] * w, by + perp[1] * w); }
        cand.set(key, { key, span: best.len, cells, pairs: [] }); }
      cand.get(key).pairs.push(`${IN.vs[pr.i].name}–${IN.vs[pr.j].name}`); keys.push(key);
    }
    pairOut.push({ a: IN.vs[pr.i].name, b: IN.vs[pr.j].name, pathN: path ? path.length : null, runs: runs.length, noCross, keys });
  }
  process.stdout.write('\n@@' + JSON.stringify({ cands: [...cand.values()], pairs: pairOut }) + '\n');
  process.exit(0);
}
if (process.env.T527_WANT_CHILD) {
  const mode = process.env.T527_WANT_CHILD;
  const { T, P, ta, ZONE, SZ, brN } = setup(mode);
  const _log = console.log; const logs = []; console.log = (...a) => logs.push(a.join(' '));
  // 마을 — 자(`t176-ab`)와 같은 시딩. 다리 판(A·B·D)과 무관하게 **같은 자리**여야 하므로 시딩은 늘 판 B 의 땅(다리 없음)으로 한다 ⇒ 자식마다 따로 세운다
  const { ta: taSeed } = mode === 'B' ? { ta } : setup('B');
  const hard = T.getZoneVillages(Z) || [];
  const picked = P.pickSeedVillages(hard, taSeed, { seedAll: !!ZONE.seedAllVillages, max: ZONE.villageMax || 0 });
  const vs = [];
  for (const hv of picked) { const c = P.findOpenCenter(taSeed, Math.round(hv.x / SZ), Math.round(hv.y / SZ)); if (c) vs.push({ name: hv.name, ccx: c.ccx, ccy: c.ccy }); }
  const econ = R('sim/economy-sim');
  const world = { villages: vs.map((v) => ({ name: v.name, coord: { x: v.ccx * 2.5, y: v.ccy * 2.5 } })) };
  P._distProbe.setup(ta, ZONE, world, econ);
  P._distProbe.compute(`T527 ${mode}`);
  console.log = _log;
  const mat = world._distMatrix.map((r) => r.map((d) => (isFinite(d) ? +d.toFixed(2) : null)));
  process.stdout.write('\n@@' + JSON.stringify({ mode, brN, vs, mat, max: world._distMatrixMax, log: logs.filter((l) => /거리행렬/.test(l)) }) + '\n');
  process.exit(0);
}

const run = (m) => {
  const out = execFileSync(process.execPath, [__filename, Z], { env: Object.assign({}, process.env, { T527_WANT_CHILD: m }), maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] }).toString();
  return JSON.parse(out.slice(out.lastIndexOf('\n@@') + 3));
};
const t0 = Date.now();
const M = {};
for (const m of ['A', 'B', 'C', 'D']) { M[m] = run(m); console.log(`[${m}] 다리 셀 ${M[m].brN} · ${M[m].log.join(' ')} · ${((Date.now() - t0) / 1000).toFixed(0)}초`); }
const vs = M.A.vs, n = vs.length;
for (const m of ['B', 'C', 'D']) if (JSON.stringify(M[m].vs) !== JSON.stringify(vs)) throw new Error(`판 ${m} 의 마을 자리가 A 와 다르다`);
const capOf = (m) => (M[m].max != null ? M[m].max : Infinity) * 0.5;
const capA = capOf('A');
const pairs = [];
const cnt = { A_inf: 0, B_inf: 0, C_inf: 0, D_inf: 0, cut: 0, pushed: 0, detour: 0, A_in: 0, B_in: 0, D_in: 0, bridgeSaves: 0, siteFixes: 0 };
for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
  const a = M.A.mat[i][j], b = M.B.mat[i][j], c = M.C.mat[i][j], d = M.D.mat[i][j];
  if (a == null) cnt.A_inf++; if (b == null) cnt.B_inf++; if (c == null) cnt.C_inf++; if (d == null) cnt.D_inf++;
  if (a != null && a <= capA) cnt.A_in++;
  if (b != null && b <= capA) cnt.B_in++;
  if (d != null && d <= capA) cnt.D_in++;
  if (b == null && a != null) cnt.bridgeSaves++;
  const cut = a == null && c != null;
  const pushed = a != null && a > capA && c != null && c <= capA;
  const detour = a != null && c != null && c > 0 && a / c > 1.02;
  if (cut) cnt.cut++; if (pushed) cnt.pushed++; if (detour) cnt.detour++;
  if ((a == null && d != null) || (a != null && d != null && d < a - 1e-6)) cnt.siteFixes++;
  if (cut || pushed || detour) pairs.push({ a: vs[i].name, b: vs[j].name, A: a, B: b, C: c, D: d, ratio: (a != null && c) ? +(a / c).toFixed(3) : null, cut, pushed, detour });
}
pairs.sort((x, y) => (y.cut - x.cut) || (y.pushed - x.pushed) || ((y.ratio || 0) - (x.ratio || 0)));
const res = { zone: Z, n, pairsTotal: n * (n - 1) / 2, capA: +capA.toFixed(2), brA: M.A.brN, brD: M.D.brN, cnt, pairs, vs, ms: Date.now() - t0 };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
console.log(`[t527 ①] ${Z} · 마을 ${n} · 쌍 ${res.pairsTotal} · 창 ${res.capA} · ${JSON.stringify(cnt)}`);
for (const p of pairs.slice(0, 25)) console.log(`  ${p.a}–${p.b}  A ${p.A} · B ${p.B} · C ${p.C} · D ${p.D} · ×${p.ratio}${p.cut ? ' [끊김]' : ''}${p.pushed ? ' [창 밖]' : ''}`);
if (process.argv.includes('--shortcut')) {
  // ★[T537 ③] 지름길 후보 표 — 창 밖 쌍마다 도하 후보 → 전부 지었을 때(E) · 하나씩 지었을 때(E_k) 창 안으로 드는 쌍 · 교역 잠재 순위
  const tmp = (n) => `/tmp/t527w-${process.pid}-${n}.json`;
  const idx = new Map(vs.map((v, i) => [v.name, i]));
  const pushed = pairs.filter((p) => p.pushed).map((p) => ({ i: idx.get(p.a), j: idx.get(p.b) }));
  fs.writeFileSync(tmp('pairs'), JSON.stringify({ vs, pairs: pushed }));
  const runEnv = (m, extra) => { const out = execFileSync(process.execPath, [__filename, Z], { env: Object.assign({}, process.env, { T527_WANT_CHILD: m }, extra || {}), maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'inherit'] }).toString(); return JSON.parse(out.slice(out.lastIndexOf('\n@@') + 3)); };
  const PC = runEnv('P', { T527_PAIRS_FILE: tmp('pairs') });
  const cands = PC.cands;
  console.log(`[③] 창 밖 ${pushed.length}쌍 → 도하 후보 ${cands.length}곳 · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  const inWin = (mat) => { let n = 0; const who = []; for (const p of pushed) { const d = mat[p.i][p.j]; if (d != null && d <= capA) { n++; who.push(`${vs[p.i].name}–${vs[p.j].name}`); } } return { n, who }; };
  const all = [].concat(...cands.map((c) => c.cells));
  fs.writeFileSync(tmp('all'), JSON.stringify(all));
  const EA = runEnv('E', { T527_EXTRA_FILE: tmp('all') });
  const allIn = inWin(EA.mat);
  // 교역 잠재(T436 식 — 이웃의 식량 잉여 ÷ 캐러밴 시계) · 거리만 교역 거리(D_k)로 · 창 안 쌍만 센다
  const Pv = R('server/villages').__labProbe; Pv.setZoneId(Z);
  const { ta: taB } = setup('B'); const SRC = fs.readFileSync(path.join(__dirname, '..', 'server', 'villages.js'), 'utf8');
  const FLOOR = +((SRC.match(/const FOOD_FLOOR = ([\d.]+)/) || [])[1]);
  const v2 = R('sim/economy-sim-v2');
  const food = vs.map((v) => { let lp = null; try { lp = Pv.extractLandParamsApprox(taB, v.ccx, v.ccy, { territory: [] }); } catch (e) {} return lp ? (lp.fertility || 0) * 1.5 + (lp.water || 0) * 1.2 + (lp.game || 0) * 0.7 : 0; });   // ★정본 `foodOf` 한 줄 옮겨 적음(t436-gate-trade 와 같은 규약)
  const val = (i, j, d) => (Math.max(0, food[j] - FLOOR) + Math.max(0, food[i] - FLOOR)) / v2.travelDaysForDistance(d);
  const B0 = require(path.join(__dirname, '..', 'server', 'bridge-stages.js'));
  const REC = Object.assign({}, R('server/hut-stages').HUT_RECIPES, R('server/granary-stages').GRANARY_RECIPES);
  const rows = [];
  for (let k = 0; k < cands.length; k++) {
    const c = cands[k]; fs.writeFileSync(tmp('k'), JSON.stringify(c.cells));
    const Ek = runEnv('E', { T527_EXTRA_FILE: tmp('k') });
    const w = inWin(Ek.mat); let pot = 0; for (const p of pushed) { const d = Ek.mat[p.i][p.j]; if (d != null && d <= capA) pot += val(p.i, p.j, d); }
    const st = B0.bridgeStages(c.span, c.cells.length / 2), raw = B0.bridgeRaw(c.span, c.cells.length / 2, REC);
    rows.push({ key: c.key, span: c.span, n: c.cells.length / 2, pillar: st[0].need.pillar, plank: st[1].need.plank, wood: raw.wood || 0, pairsAsked: c.pairs.length, inWin: w.n, who: w.who, pot: +pot.toFixed(3), potPerWood: raw.wood ? +(pot / raw.wood * 100).toFixed(4) : 0, cells: c.cells });
    console.log(`  [${k + 1}/${cands.length}] ${c.key} 물 ${c.span} · 통나무 ${raw.wood} · 창 안 ${w.n} · 잠재 ${pot.toFixed(2)} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
  }
  const byShort = rows.slice().sort((a, b) => a.span - b.span || b.inWin - a.inWin), byPot = rows.slice().sort((a, b) => b.pot - a.pot || a.wood - b.wood);
  rows.forEach((r) => { r.rankShort = byShort.indexOf(r) + 1; r.rankPot = byPot.indexOf(r) + 1; });
  res.shortcut = { pushed: pushed.length, cands: rows, allIn: allIn.n, allWood: rows.reduce((a, r) => a + r.wood, 0), pairsPath: PC.pairs, floor: FLOOR };
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
  for (const f of ['pairs', 'all', 'k']) { try { fs.unlinkSync(tmp(f)); } catch (e) {} }
  console.log(`[③] 후보 ${rows.length} · 전부 지으면 창 안 ${allIn.n}/${pushed.length} · 통나무 합 ${res.shortcut.allWood}`);
}
process.exit(0);
